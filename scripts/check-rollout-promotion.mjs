#!/usr/bin/env node
/**
 * **段階公開の拡大を、人の個別承認なしに実行してよいかを決める門。**
 *
 *   node scripts/check-rollout-promotion.mjs            # 台帳を表示
 *   node scripts/check-rollout-promotion.mjs --check    # CI
 *   node scripts/check-rollout-promotion.mjs --selftest
 *   node scripts/check-rollout-promotion.mjs --plan --guard <json> --flags <json>
 *
 * 【何のためにあるか】
 * data/authority-matrix.json は不可逆な領域の承認を外すのに machine_gate を要求する。
 * 2026-08-27 のオーナー判断で『段階公開の拡大』の境界は外れたが、
 * **外れただけでは requires_approval:false にできない** —— check-authority.mjs の
 * gateProblems() が、実在する checker と export された関数と kill switch と
 * 正の日次上限と holds_when_unknown を実際に見る。ここがその実装。
 *
 * 【判断はこちら、実行はあちら】
 * レビュー返信と同じ形。判定は公開リポジトリ（ここ）、実行は非公開側
 * （../simplememo-api。フラグKVと管理トークンがあちらにしかない）。
 * ゲートの写しをあちらに置かず、`--plan` の出力を渡す。
 *
 * 【この門は今日のボタンを押せない。それが設計】
 * 2026-08-27 実測（run 33076125334）: tf04_progress は rollout 5% で
 * 4回連続 hold。ガード自身が「露出を 30 にするには rollout 19% 以上」と
 * 計算していた。**判定に届かない露出から踏み出す最初の一歩は、証拠で
 * 正当化できない。**だからこの門は通さない（holds_when_unknown）。
 * その一歩は人が押す。門が効くのは、ガードが判定を出せる段から。
 *
 * **「動かないゲート」に見えても緩めない。**緩めた瞬間、
 * この門は「広げてよい理由が無いときに広げる」ための装置になる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, broken, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/rollout-promotion.json');

/** 訓練用フラグ。**人の経路でしか触らない**（../simplememo-api の DRILL_KEY_PREFIX と同じ）。 */
export const DRILL_KEY_PREFIX = 'drill_';

/** 台帳が持っていなければならない値。**既定でごまかさない** —— 欠けたら hold。 */
export const POLICY_REQUIRED = [
  'enabled', 'daily_cap', 'max_auto_rollout', 'min_sample_per_arm',
  'min_hours_at_current_rollout', 'cooldown_after_kill_days',
  'max_state_age_seconds', 'required_metrics', 'steps',
];

const HOURS = 3600 * 1000;

/**
 * 段階公開の拡大を自動実行してよいか。**純関数。**
 *
 * 落ちる順に並べてある。**先に落ちたものが理由**になる。
 * 返す decision は promote / hold の2つだけ —— この門は止める側しか持たない
 * （kill はガード本体が自律で引く。ここは広げる側だけを見る）。
 *
 * @param {object}  o
 * @param {object}  o.guard        /admin/rollout-guard の応答をそのまま
 * @param {string}  o.flag         対象のフラグキー
 * @param {object}  o.flagState    /admin/flags の当該フラグ { rollout, updated_at, killed }
 * @param {object}  o.policy       data/rollout-promotion.json の policy
 * @param {number}  o.promotedToday 本日この門を通って実行した件数
 * @param {string}  o.now          ISO8601
 */
export function evaluatePromotion({
  guard, flag, flagState, policy, promotedToday = 0, now = new Date().toISOString(),
} = {}) {
  const hold = (why) => ({ decision: 'hold', target: null, why });
  /** **材料が無い**ときの hold。理由に印を付けて、条件で落ちたのと区別する。 */
  const unknown = (what) => hold(`材料が無い: ${what} — **分からないものを「たぶん大丈夫」で広げない**`);

  if (!policy || typeof policy !== 'object') return unknown('policy');
  if (policy.kill_switch) return hold('kill_switch が立っている');

  const ap = policy.auto_promote;
  if (!ap || typeof ap !== 'object') return unknown('policy.auto_promote');
  const missing = POLICY_REQUIRED.filter((k) => ap[k] === undefined || ap[k] === null);
  if (missing.length) return unknown(`policy.auto_promote.${missing.join(' / ')}`);
  if (!ap.enabled) return hold('自動昇格が有効になっていない（enabled を立てるのはオーナー）');

  if (typeof flag !== 'string' || !flag) return unknown('flag');
  if (flag.startsWith(DRILL_KEY_PREFIX)) return hold(`${flag} は訓練用フラグ — 訓練は人の経路`);

  // --- フラグの現状 -------------------------------------------------------
  if (!flagState || typeof flagState !== 'object') return unknown(`flags[${flag}]`);
  if (flagState.globally_killed) return hold('全体キルが立っている — 止めたものを広げない');
  if (flagState.killed) return hold(`${flag} は killed — 止めたものを広げない`);
  if (typeof flagState.rollout !== 'number') return unknown(`flags[${flag}].rollout`);
  if (typeof flagState.updated_at !== 'string') return unknown(`flags[${flag}].updated_at`);

  const nowMs = Date.parse(now);
  const updatedMs = Date.parse(flagState.updated_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(updatedMs)) return unknown('時刻が解釈できない');
  const soakedHours = (nowMs - updatedMs) / HOURS;
  if (soakedHours < ap.min_hours_at_current_rollout) {
    return hold(`${flag} は ${soakedHours.toFixed(1)}時間しか現在の配布率で寝ていない`
      + `（要 ${ap.min_hours_at_current_rollout}時間）`
      + ' — **上げた直後の観測は、上げる前の利用者の挙動を含む**');
  }

  // --- ガードの判定 -------------------------------------------------------
  if (!guard || typeof guard !== 'object') return unknown('guard');
  if (!Array.isArray(guard.decisions)) return unknown('guard.decisions');
  const mine = guard.decisions.filter((d) => d && d.flag === flag && !d.drill);
  const latest = mine[0];
  if (!latest) return unknown(`${flag} についてのガード判定`);
  if (typeof latest.at !== 'string') return unknown('判定の時刻（at）');
  const atMs = Date.parse(latest.at);
  if (!Number.isFinite(atMs)) return unknown('判定の時刻が解釈できない');
  const ageSec = (nowMs - atMs) / 1000;
  if (ageSec > ap.max_state_age_seconds) {
    return hold(`ガードの判定が ${Math.round(ageSec / 60)}分前で古い`
      + `（上限 ${Math.round(ap.max_state_age_seconds / 60)}分）`
      + ' — **古い安心を「いま悪化していない」の証拠にしない**');
  }

  // 直近に kill が出ているフラグを、翌日また広げない。
  const killCutoff = nowMs - ap.cooldown_after_kill_days * 24 * HOURS;
  const recentKill = mine.find((d) => d.action === 'kill' && Date.parse(d.at) >= killCutoff);
  if (recentKill) {
    return hold(`直近 ${ap.cooldown_after_kill_days}日に kill が出ている（${recentKill.at}）`);
  }

  if (latest.action !== 'promote') {
    return hold(`ガードの判定が ${latest.action}（promote ではない）— ${latest.reason ?? '理由なし'}`);
  }
  if (latest.rollout !== flagState.rollout) {
    return hold(`判定は rollout ${latest.rollout}% を見ているが、いまは ${flagState.rollout}%`
      + ' — **その間に誰かが動かしている**');
  }

  // --- 母数 ---------------------------------------------------------------
  // ガード本体は「1指標でも判定できて悪化なし」で**提案**する。
  // 門はそれより厳しく、required_metrics 全部に母数を要求する。
  if (!Array.isArray(latest.observations)) return unknown('判定の observations');
  for (const key of ap.required_metrics) {
    const o = latest.observations.find((x) => x && x.metric === key);
    if (!o) return unknown(`指標 ${key} の観測`);
    if (!o.judged) return hold(`指標 ${key} が判定できていない（${o.reason ?? '理由なし'}）`);
    for (const [arm, label] of [['exposed', '露出群'], ['control', '対照群']]) {
      const n = o[arm] && o[arm].installs;
      if (typeof n !== 'number') return unknown(`指標 ${key} の${label}の母数`);
      if (n < ap.min_sample_per_arm) {
        return hold(`指標 ${key} の${label}が ${n}（要 ${ap.min_sample_per_arm}）`);
      }
    }
  }

  // --- 梯子と上限 ---------------------------------------------------------
  const target = nextStep(flagState.rollout, ap.steps);
  if (target === null) return hold(`${flagState.rollout}% の次の段が梯子に無い`);
  if (latest.proposed_rollout !== target) {
    return hold(`ガードの提案 ${latest.proposed_rollout}% が次の段 ${target}% と違う`
      + ' — **梯子は飛ばさない**');
  }
  if (target > ap.max_auto_rollout) {
    return hold(`${target}% は自動の上限 ${ap.max_auto_rollout}% を超える`
      + ' — **最終段は人が押す**（対照群が消える判断）');
  }

  // --- 日次上限 -----------------------------------------------------------
  if (promotedToday >= ap.daily_cap) {
    return hold(`本日の自動昇格が上限 ${ap.daily_cap} 件に達している`);
  }

  return {
    decision: 'promote',
    target,
    why: `ガードが悪化なしと判定（${ap.required_metrics.join(' / ')} すべて母数 ${ap.min_sample_per_arm} 以上）。`
      + `${flagState.rollout}% → ${target}%`,
  };
}

/** 梯子の次の段。**飛ばさない。** */
export function nextStep(current, steps) {
  const next = (steps || []).filter((s) => typeof s === 'number').sort((a, b) => a - b)
    .find((s) => s > current);
  return next === undefined ? null : next;
}

/** 台帳そのものの検査。 */
export function validate(doc) {
  const problems = [];
  const ap = doc?.policy?.auto_promote;
  if (!doc?.policy || typeof doc.policy !== 'object') { problems.push('policy が無い'); return problems; }
  if (typeof doc.policy.kill_switch !== 'boolean') problems.push('policy.kill_switch が真偽値でない');
  if (!ap || typeof ap !== 'object') { problems.push('policy.auto_promote が無い'); return problems; }

  for (const k of POLICY_REQUIRED) {
    if (ap[k] === undefined || ap[k] === null) problems.push(`policy.auto_promote.${k} が無い`);
  }
  if (typeof ap.enabled !== 'boolean') problems.push('auto_promote.enabled が真偽値でない');
  for (const k of ['daily_cap', 'max_auto_rollout', 'min_sample_per_arm',
                   'min_hours_at_current_rollout', 'cooldown_after_kill_days', 'max_state_age_seconds']) {
    if (ap[k] !== undefined && (typeof ap[k] !== 'number' || !(ap[k] > 0))) {
      problems.push(`auto_promote.${k} が正の数でない — **上限の無いゲートは例外に使えない**`);
    }
  }
  if (ap.max_auto_rollout >= 100) {
    problems.push('auto_promote.max_auto_rollout が 100 以上'
      + ' — **全員に出す段を自動にすると、対照群が消えて以後の判定ができない**');
  }
  if (!Array.isArray(ap.required_metrics) || ap.required_metrics.length === 0) {
    problems.push('auto_promote.required_metrics が空'
      + ' — **母数を要求しない門は、測っていないものを根拠に広げる**');
  }
  if (!Array.isArray(ap.steps) || ap.steps.length < 2) {
    problems.push('auto_promote.steps が梯子になっていない');
  } else if (ap.steps.some((s, i) => i > 0 && !(s > ap.steps[i - 1]))) {
    problems.push('auto_promote.steps が昇順でない');
  }

  if (!Array.isArray(doc.promotions)) problems.push('promotions が配列でない');
  else {
    // **上限が読めないときは 0 に落とす（fail closed）。**
    // `ap.max_auto_rollout && …` と書くと、上限が消えた瞬間に
    // 「上限を超えた記録を落とす」規則そのものが黙って消える。
    // scripts/check-guard-shapes.mjs が実際にこの形を捕まえた。
    const cap = typeof ap.max_auto_rollout === 'number' ? ap.max_auto_rollout : 0;
    for (const [i, p] of doc.promotions.entries()) {
      const at = `promotions[${i}]`;
      for (const k of ['at', 'flag', 'from', 'to', 'why']) {
        if (p?.[k] === undefined) problems.push(`${at}: ${k} が無い`);
      }
      if (p?.to !== undefined && typeof p.to !== 'number') {
        problems.push(`${at}: to が数でない`);
      } else if (typeof p?.to === 'number' && p.to > cap) {
        problems.push(`${at}: to ${p.to}% が上限 ${cap}% を超えている`
          + ' — **通ってはいけないものが通った記録**');
      }
    }
  }
  return problems;
}

// ============================================================
// --plan — 実行側（../simplememo-api）へ渡す形
// ============================================================

function readJsonArg(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || !process.argv[i + 1]) return null;
  const v = process.argv[i + 1];
  const raw = fs.existsSync(v) ? fs.readFileSync(v, 'utf8') : v;
  try { return JSON.parse(raw); } catch { return null; }
}

export function planAll({ guard, flags, doc, now, promotedToday }) {
  const policy = doc.policy;
  // **数えられなければ上限に当たる側へ倒す。**引数で渡されたときだけそちらを使う。
  const used = promotedToday === undefined ? countPromotionsToday(flags, now) : promotedToday;
  const keys = Object.keys(flags?.flags ?? {});
  const plans = keys.map((flag) => {
    const state = normalizeFlagState(flags, flag);
    return { flag, ...evaluatePromotion({ guard, flag, flagState: state, policy, promotedToday: used, now }) };
  });
  return {
    generated_by: 'scripts/check-rollout-promotion.mjs --plan',
    generated_at: now,
    promoted_today: used,
    // **通ったものだけでなく、止めたものと理由も返す。**
    // 実行側のログに「なぜ動かなかったか」が残らないと、止まっていることに誰も気づかない。
    plans,
    promote: plans.filter((p) => p.decision === 'promote'),
  };
}

/** /admin/flags の応答からフラグ1つぶんの状態を取り出す。**形が違えば null**（＝材料無し）。 */
export function normalizeFlagState(flags, flag) {
  if (!flags || typeof flags !== 'object') return null;
  const detail = flags.flags?.[flag];
  if (detail && typeof detail === 'object') {
    return {
      rollout: typeof detail.rollout === 'number' ? detail.rollout : undefined,
      updated_at: detail.updated_at,
      killed: Array.isArray(flags.killed) ? flags.killed.includes(flag) : Boolean(detail.killed),
      globally_killed: Boolean(flags.globally_killed),
    };
  }
  return null;
}

/**
 * **その日すでに露出が広がった回数。**誰が広げたかは見ない。
 *
 * 上限が守っているのは「1段目の観測期間」であって「AIの手数」ではない。
 * 人が朝に一段上げた日に、機械が夕方もう一段上げてよい理由が無い。
 * 材料（history）が読めなければ **Infinity**（＝必ず上限に当たる）を返す。
 */
export function countPromotionsToday(flags, now) {
  const hist = flags?.history;
  if (!Array.isArray(hist)) return Number.POSITIVE_INFINITY;
  const day = String(now).slice(0, 10);
  return hist.filter((h) => typeof h?.at === 'string' && h.at.slice(0, 10) === day
    && typeof h?.before?.rollout === 'number' && typeof h?.after?.rollout === 'number'
    && h.after.rollout > h.before.rollout).length;
}

// ============================================================
// selftest — **通ることではなく、壊すと落ちることを確かめる**
// ============================================================

const NOW = '2026-09-10T00:00:00.000Z';

/** 実データの policy を使う。**手で書いた検体だと、台帳と形がずれても気づけない。** */
function fixture(over = {}) {
  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const policy = JSON.parse(JSON.stringify(doc.policy));
  policy.auto_promote.enabled = true;          // 既定 false のままだと他の規則を一切試せない
  const arm = (installs) => ({ installs, successes: Math.round(installs * 0.9), rate: 0.9 });
  const obs = (metric) => ({
    metric, label: metric, exposed: arm(80), control: arm(240),
    z: 0.4, delta: 0.003, judged: true, reason: `${metric}: 悪化なし`,
  });
  return {
    guard: {
      decisions: [{
        at: '2026-09-09T23:30:00.000Z', flag: 'tf04_progress', rollout: 25,
        action: 'promote', proposed_rollout: 50, executed: false,
        observations: policy.auto_promote.required_metrics.map(obs),
        reason: '悪化なし',
      }],
    },
    flag: 'tf04_progress',
    flagState: { rollout: 25, updated_at: '2026-09-05T00:00:00.000Z', killed: false },
    policy,
    promotedToday: 0,
    now: NOW,
    ...over,
  };
}

const ev = (over) => evaluatePromotion(fixture(over));
const held = (over, needle) => {
  const r = ev(over);
  assert(r.decision === 'hold', `hold になっていない（${r.decision}: ${r.why}）`);
  assert(r.why.includes(needle), `理由が違う: ${r.why}`);
};

function selftest() {
  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const scenarios = [
    ['実データの台帳は検査を通る', () => {
      const p = validate(doc);
      assert(p.length === 0, p.join(' / '));
    }],
    // **[2026-08-28] enabled が立ったので「実台帳のまま必ず止まる」は成り立たない。**
    // この行が守っていたのは「出荷している policy が検体より緩くない」ことなので、
    // **出荷している数字そのものをピンする**（フラグの値をピンすると、値が変わった日に
    // 検査ごと消える。enabled:false に寄りかかっていたぶん、数字は一度も試されていなかった）。
    ['**出荷している policy の数字が実際に効いている**（寝かせ・各群の母数）', () => {
      const ap = doc.policy.auto_promote;

      const shortSoak = new Date(
        Date.parse(NOW) - (ap.min_hours_at_current_rollout - 1) * 3600 * 1000,
      ).toISOString();
      const a = evaluatePromotion({
        ...fixture(),
        policy: doc.policy,
        flagState: { rollout: 25, updated_at: shortSoak, killed: false },
      });
      assert(a.decision === 'hold', `寝かせ ${ap.min_hours_at_current_rollout}h に1時間足りないのに止まっていない（${a.decision}: ${a.why}）`);

      const f = fixture();
      f.policy = doc.policy;
      f.guard.decisions[0].observations[0].exposed.installs = ap.min_sample_per_arm - 1;
      const b = evaluatePromotion(f);
      assert(b.decision === 'hold', `母数 ${ap.min_sample_per_arm} に1つ足りないのに止まっていない（${b.decision}: ${b.why}）`);
    }],
    ['条件が揃えば promote', () => {
      const r = ev();
      assert(r.decision === 'promote' && r.target === 50, JSON.stringify(r));
    }],

    // --- 止める側 ---------------------------------------------------------
    ['kill_switch を立てると止まる', () => {
      held(broken(fixture(), (f) => { f.policy.kill_switch = true; }), 'kill_switch');
    }],
    ['enabled を倒すと止まる', () => {
      held(broken(fixture(), (f) => { f.policy.auto_promote.enabled = false; }), '有効になっていない');
    }],
    ['**ガードが hold なら止まる**（判定に届かない段はここで落ちる）', () => {
      held(broken(fixture(), (f) => {
        f.guard.decisions[0].action = 'hold';
        f.guard.decisions[0].reason = '判定できる指標が無い';
      }), 'promote ではない');
    }],
    ['ガードが escalate でも止まる', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].action = 'escalate'; }), 'promote ではない');
    }],
    ['**判定が古いと止まる**', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].at = '2026-09-08T00:00:00.000Z'; }), '古い');
    }],
    ['直近に kill があると止まる', () => {
      held(broken(fixture(), (f) => {
        // **新しい順に並ぶ台帳なので、kill は promote より後ろ（＝古い）に置く。**
        // 前に置くと latest が kill になり、鮮度の規則が先に落として
        // 冷却期間そのものを試せない。
        f.guard.decisions.push({ at: '2026-09-08T00:00:00.000Z', flag: 'tf04_progress',
          rollout: 25, action: 'kill', executed: true, observations: [], reason: '悪化' });
      }), 'kill が出ている');
    }],
    ['判定と現在の rollout がずれていると止まる', () => {
      held(broken(fixture(), (f) => { f.flagState.rollout = 10; }), '誰かが動かしている');
    }],
    ['**母数が足りない指標が1つでもあれば止まる**', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].observations[1].exposed.installs = 29; }), '露出群が 29');
    }],
    ['対照群の母数も見る', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].observations[2].control.installs = 12; }), '対照群が 12');
    }],
    ['judged でない指標があれば止まる', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].observations[0].judged = false; }), '判定できていない');
    }],
    ['**要求している指標の観測が欠けていたら止まる**', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].observations.splice(0, 1); }), '材料が無い');
    }],
    ['梯子を飛ばす提案は止まる', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].proposed_rollout = 100; }), '梯子は飛ばさない');
    }],
    ['**上限を超える段は止まる（100% は人）**', () => {
      held(broken(fixture(), (f) => {
        f.flagState.rollout = 50;
        f.guard.decisions[0].rollout = 50;
        f.guard.decisions[0].proposed_rollout = 100;
      }), '最終段は人が押す');
    }],
    ['寝かせ時間が足りないと止まる', () => {
      held(broken(fixture(), (f) => { f.flagState.updated_at = '2026-09-09T18:00:00.000Z'; }), '寝ていない');
    }],
    ['日次上限に達していると止まる', () => {
      held({ promotedToday: 1 }, '上限 1 件');
    }],
    ['killed なフラグは広げない', () => {
      held(broken(fixture(), (f) => { f.flagState.killed = true; }), 'killed');
    }],
    ['**全体キルが立っていたら広げない**', () => {
      held(broken(fixture(), (f) => { f.flagState.globally_killed = true; }), '全体キル');
    }],
    ['drill_ 接頭辞は通さない', () => {
      held(broken(fixture(), (f) => {
        f.flag = 'drill_x';
        f.guard.decisions[0].flag = 'drill_x';
      }), '訓練用フラグ');
    }],
    ['訓練の判定を本物の根拠にしない', () => {
      held(broken(fixture(), (f) => { f.guard.decisions[0].drill = true; }), '材料が無い');
    }],

    // --- 材料が無いとき必ず止まる（holds_when_unknown の実体） --------------
    ['**材料が1つでも欠けたら止まる**（全欄を1つずつ落として確かめる）', () => {
      const drops = [
        ['guard', (f) => { delete f.guard; }],
        ['guard.decisions', (f) => { delete f.guard.decisions; }],
        ['該当フラグの判定', (f) => { f.guard.decisions = []; }],
        ['判定の時刻', (f) => { delete f.guard.decisions[0].at; }],
        ['observations', (f) => { delete f.guard.decisions[0].observations; }],
        ['flagState', (f) => { f.flagState = null; }],
        ['rollout', (f) => { delete f.flagState.rollout; }],
        ['updated_at', (f) => { delete f.flagState.updated_at; }],
        ['policy', (f) => { f.policy = null; }],
        ['auto_promote', (f) => { delete f.policy.auto_promote; }],
        ['daily_cap', (f) => { delete f.policy.auto_promote.daily_cap; }],
        ['required_metrics', (f) => { delete f.policy.auto_promote.required_metrics; }],
        ['flag', (f) => { delete f.flag; }],
      ];
      for (const [what, drop] of drops) {
        const r = evaluatePromotion(broken(fixture(), drop));
        assert(r.decision === 'hold', `${what} を落としても hold にならない`);
        assert(r.why.startsWith('材料が無い') || r.why.includes('有効になっていない'),
          `${what} を落としたときの理由が「材料が無い」でない: ${r.why}`);
      }
    }],

    // --- 実行側へ渡す形 ---------------------------------------------------
    ['**日次の回数は history から数える。誰が広げたかは見ない**', () => {
      const flags = { history: [
        { at: '2026-09-10T02:00:00.000Z', key: 'a', before: { rollout: 10 }, after: { rollout: 25 } },
        { at: '2026-09-10T03:00:00.000Z', key: 'b', before: { rollout: 25 }, after: { rollout: 10 } },
        { at: '2026-09-09T02:00:00.000Z', key: 'c', before: { rollout: 10 }, after: { rollout: 25 } },
      ] };
      const n = countPromotionsToday(flags, NOW);
      assert(n === 1, `前日ぶんと引き下げを除いて1件のはずが ${n}`);
    }],
    ['**history が読めなければ上限に当たる側へ倒す**', () => {
      assert(countPromotionsToday({}, NOW) === Number.POSITIVE_INFINITY, 'Infinity でない');
      assert(countPromotionsToday(null, NOW) === Number.POSITIVE_INFINITY, 'Infinity でない');
    }],
    ['plan は止めたものと理由も返す（止まっていることに気づけるように）', () => {
      const f = fixture();
      const flags = {
        globally_killed: false,
        flags: {
          tf04_progress: { rollout: 25, description: 'canary', updated_at: '2026-09-05T00:00:00.000Z' },
          drill_x: { rollout: 50, description: 'drill', updated_at: '2026-09-01T00:00:00.000Z' },
        },
        history: [],
      };
      const plan = planAll({ guard: f.guard, flags, doc: { policy: f.policy }, now: NOW });
      assert(plan.plans.length === 2, `2件のはずが ${plan.plans.length}`);
      assert(plan.promote.length === 1 && plan.promote[0].flag === 'tf04_progress', JSON.stringify(plan.promote));
      const drill = plan.plans.find((p) => p.flag === 'drill_x');
      assert(drill.decision === 'hold' && drill.why.includes('訓練用フラグ'), drill.why);
      assert(plan.promoted_today === 0, `promoted_today が ${plan.promoted_today}`);
    }],
    // **材料が欠けたときに止まることが、この門の中身そのもの**（machine_gate の
    // holds_when_unknown）。enabled が立った今、plan を守っているのはここだけになる。
    ['**材料が無ければ plan は promote を返さない**（holds_when_unknown）', () => {
      const flags = { flags: { tf04_progress: { rollout: 25, description: 'c', updated_at: '2026-09-05T00:00:00.000Z' } }, history: [] };

      const noDecision = planAll({ guard: { decisions: [] }, flags, doc, now: NOW });
      assert(noDecision.promote.length === 0, 'ガードの判定が1件も無いのに promote が出た');

      const unjudged = fixture();
      for (const o of unjudged.guard.decisions[0].observations) { o.judged = false; }
      const p2 = planAll({ guard: unjudged.guard, flags, doc, now: NOW });
      assert(p2.promote.length === 0, '指標が未判定なのに promote が出た');

      const noFlagState = planAll({ guard: fixture().guard, flags: { flags: {}, history: [] }, doc, now: NOW });
      assert(noFlagState.promote.length === 0, 'フラグの現状が無いのに promote が出た');
    }],
    ['**材料が揃えば plan は promote を返す**（止まりっぱなしを「安全」と読み違えない）', () => {
      const flags = { flags: { tf04_progress: { rollout: 25, description: 'c', updated_at: '2026-09-05T00:00:00.000Z' } }, history: [] };
      const plan = planAll({ guard: fixture().guard, flags, doc, now: NOW });
      assert(plan.promote.length === 1, `材料が揃っているのに promote が出ない: ${JSON.stringify(plan.plans)}`);
    }],

    // --- 台帳の検査 -------------------------------------------------------
    ['上限 100% の台帳は落ちる', () => {
      const p = validate(broken(doc, (d) => { d.policy.auto_promote.max_auto_rollout = 100; }));
      assert(p.some((x) => x.includes('対照群が消えて')), p.join(' / '));
    }],
    ['required_metrics を空にすると落ちる', () => {
      const p = validate(broken(doc, (d) => { d.policy.auto_promote.required_metrics = []; }));
      assert(p.some((x) => x.includes('required_metrics が空')), p.join(' / '));
    }],
    ['daily_cap 0 の台帳は落ちる', () => {
      const p = validate(broken(doc, (d) => { d.policy.auto_promote.daily_cap = 0; }));
      assert(p.some((x) => x.includes('daily_cap')), p.join(' / '));
    }],
    ['梯子が昇順でない台帳は落ちる', () => {
      const p = validate(broken(doc, (d) => { d.policy.auto_promote.steps = [1, 50, 25]; }));
      assert(p.some((x) => x.includes('昇順')), p.join(' / '));
    }],
    ['**上限を超えた昇格の記録は落ちる**', () => {
      const p = validate(broken(doc, (d) => {
        d.promotions.push({ at: NOW, flag: 'x', from: 50, to: 100, why: 'y' });
      }));
      assert(p.some((x) => x.includes('通ってはいけないものが通った記録')), p.join(' / '));
    }],
    ['昇格の記録に欄が欠けると落ちる', () => {
      const p = validate(broken(doc, (d) => { d.promotions.push({ flag: 'x' }); }));
      assert(p.some((x) => x.includes('at が無い')), p.join(' / '));
    }],
  ];
  return run(scenarios, { label: '段階公開の門' });
}

// ============================================================

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() === 0 ? 0 : 1);

  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));

  if (process.argv.includes('--plan')) {
    const guard = readJsonArg('--guard');
    const flags = readJsonArg('--flags');
    const plan = planAll({ guard, flags, doc, now: new Date().toISOString() });
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }

  const problems = validate(doc);
  const ap = doc.policy.auto_promote;
  console.log('段階公開の拡大 — 機械ゲート\n');
  console.log(`  有効          ${ap.enabled ? 'はい' : '**いいえ**（オーナーが立てる）'}`);
  console.log(`  kill_switch   ${doc.policy.kill_switch ? '**立っている**' : '倒れている'}`);
  console.log(`  日次上限      ${ap.daily_cap} 段`);
  console.log(`  自動の上限    ${ap.max_auto_rollout}%（100% への最終段は人）`);
  console.log(`  各群の母数    ${ap.min_sample_per_arm} 以上`);
  console.log(`  要求する指標  ${ap.required_metrics.join(' / ')}`);
  console.log(`  寝かせ        ${ap.min_hours_at_current_rollout} 時間`);
  console.log(`  判定の鮮度    ${Math.round(ap.max_state_age_seconds / 60)} 分以内`);
  console.log(`\n  この門を通った昇格  **${doc.promotions.length} 件**`);
  if (doc.promotions.length === 0) {
    console.log('  「門ができた」と「門を通って何かが動いた」は別。');
    console.log('  ガードが判定を出せる露出（rollout 19% 以上）に届くまで、この門は必ず hold する。');
  }

  if (problems.length) {
    console.error('\n段階公開の門: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n台帳の形・上限・梯子に問題なし。');
}
