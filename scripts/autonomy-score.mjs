#!/usr/bin/env node
/**
 * 自律スコア — **「検証された決定がどれだけあるか」**を100点で出す。
 *
 *   node scripts/autonomy-score.mjs             # 表示
 *   node scripts/autonomy-score.mjs --json      # 機械可読
 *   node scripts/autonomy-score.mjs --snapshot  # 履歴に1点追加（非退行制約の基準になる。--write も同義）
 *   node scripts/autonomy-score.mjs --check     # CI
 *   node scripts/autonomy-score.mjs --selftest  # 検査そのものの自己検査
 *
 * 【既存の自動化率と何が違うか — 乗り換えではなく併設】
 * `automation-rate.mjs` の総合自動化率（66.8%）は**タスク被覆率**で、
 * 「13領域199タスクのうちAIが実行している割合」を数える。**それは「何を自動化できたか」
 * を言うが、「その決定が検証されたか」は一言も言わない。**
 * 検証されていない決定を100%自動化すれば、被覆率は100%になる。
 *
 * こちらは**反証器の有無**で数える。ある層に「その層の決定を落とせる仕組み」があり、
 * かつ無検査で通した量がどれだけあるか。層は L0 実装 / L1 適格性 / L2 価値 /
 * L3 フレーム / L4 憲法 の5つ。
 *
 * **両方出す。片方が伸びてもう片方が伸びないことに意味がある。**
 * 分母の乗り換えは goodharting そのもの（2026-08-22、人間介入率の内訳を足したときの規律）。
 *
 * 【この数字を ranker に見せない】
 * 人間向けの計器であって、システムの最適化対象ではない。見せた時点で最適化対象になり、
 * 指標としての寿命が終わる。--check が日次runのプロンプト経路からこのファイルが
 * 参照されていないことを実際に検査する（散文の約束にしない）。
 *
 * 【配点を変えるのは L4】
 * 重み・可逆性クラス・上限は data/autonomy-score.json にあり、**AIは書き換えない。**
 * ここに置くと「自分の点数の付け方を自分で決める」になる。
 */

import fs from 'node:fs';
import { verifiedSettlement } from './value-contracts.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, run as runScenarios } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = path.join(ROOT, 'data/autonomy-score.json');
export const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
export const HISTORY_PATH = path.join(ROOT, 'data/autonomy-score-history.json');
export const SELFTESTS_PATH = path.join(ROOT, 'data/check-selftests.json');
export const ESCALATION_PATH = path.join(ROOT, 'data/escalation-rules.json');
export const ACTIONS_PATH = path.join(ROOT, 'data/autopilot-actions.json');
export const METRICS_PATH = path.join(ROOT, 'data/value-metrics.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const shiftDay = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** 故障（＝壊れた回）。**適格性の棄却は入れない** —— あれは止まったのであって壊れていない。 */
const BREAKAGE_STAGES = new Set(['execution', 'cost', 'absent']);

/** 窓。台帳が window_days に満たない間は全期間を使い、**そう出力する**。 */
export function windowOf(runs, days, today = todayJst()) {
  const dates = runs.map((r) => r.date_jst).filter(Boolean).sort();
  if (!dates.length) return { from: today, to: today, days: 0, truncated: false };
  const wanted = shiftDay(today, -(days - 1));
  const from = wanted > dates[0] ? wanted : dates[0];
  return { from, to: today, days: dayDiff(from, today) + 1, truncated: wanted > dates[0] };
}

const inWindow = (r, w) => (r.date_jst || '') >= w.from && (r.date_jst || '') <= w.to;
const handsOff = (r) => !(r.interventions || []).length;

/** 出荷行の可逆性クラス。**data/autonomy-score.json の lane_action_class を正とする。** */
export function classOfRun(r, policy) {
  const byLane = policy.lane_action_class?.by_lane?.[r.lane];
  if (byLane) return byLane[r.action === 'new' ? 'new' : 'refresh'] ?? policy.lane_action_class.default;
  return policy.lane_action_class?.default ?? 'R1';
}
const weightOf = (cls, policy) => policy.reversibility?.[cls]?.weight ?? 1;

// ── 成分 ──────────────────────────────────────────────────────
/**
 * VDC — 検証済み決定被覆率。出荷のうち**決済済みの価値契約**を伴っていた割合。
 * L2 が入るまで構造的に 0。**空欄にしない** —— 0 と書いてあることが
 * 「決定はまだ一度も反証されていない」の表示になる。
 */
export function vdc(runs, policy, { contracts = null } = {}) {
  const shipped = runs.filter((r) => r.outcome === 'shipped');
  const settled = contracts
    ? shipped.filter((r) => contracts.some((c) => c.run_id === r.run_id && verifiedSettlement(c))).length
    : 0;
  const rate = shipped.length ? settled / shipped.length : 0;
  return {
    id: 'vdc', rate, n: shipped.length, hit: settled,
    max: policy.weights.vdc, points: policy.weights.vdc * rate,
    // **「契約が0本」を「台帳が無い」と同じ扱いにしない。**
    // Boolean([]) は真なので、空の台帳は measurable=true・why=null になり、
    // **0点の理由が1行も出ない状態**になっていた（2026-09-05 に実測）。
    // 3つの状態は原因も次の一手も違うので、分けて言う。
    measurable: Array.isArray(contracts) && contracts.length > 0,
    contracts_written: Array.isArray(contracts) ? contracts.length : null,
    why: !contracts
      ? '**契約台帳が無い。**L2 の仕組みそのものが置かれていない'
      : contracts.length === 0
        ? '**仕組みは在るが、契約がまだ1本も書かれていない。**'
          + '日次runは着手前に契約を書くよう配線済み（obsidian-autopilot.yml §3-1）で、'
          + '承認済み指標が0件の間は書かない設計。**次に主系が完走した回が最初の1本になる**'
        : settled === 0
          ? `**契約は ${contracts.length} 本あるが、決済済みが 0。**`
            + '決済は horizon 経過後に Decision Monitor が行う —— 書いた日には点が入らない'
          : null,
  };
}

/**
 * UMR — 無検査マージ率。人が一切触れずに本番到達した変更の割合を、
 * **可逆性クラスで重み付けして**数える。R0 ばかり通しても伸びないように、
 * R0 の寄与に窓ごとの上限を掛ける。
 */
export function umr(runs, policy) {
  const shipped = runs.filter((r) => r.outcome === 'shipped');
  const rows = shipped.map((r) => {
    const cls = classOfRun(r, policy);
    return { run_id: r.run_id, cls, w: weightOf(cls, policy), handsOff: handsOff(r) };
  });
  const total = rows.reduce((s, x) => s + x.w, 0);
  const byClass = {};
  for (const x of rows) {
    byClass[x.cls] ??= { n: 0, hands_off: 0, weight: 0, hands_off_weight: 0 };
    byClass[x.cls].n += 1; byClass[x.cls].weight += x.w;
    if (x.handsOff) { byClass[x.cls].hands_off += 1; byClass[x.cls].hands_off_weight += x.w; }
  }
  const rawNum = rows.filter((x) => x.handsOff).reduce((s, x) => s + x.w, 0);
  // **R0 の寄与に上限。**些末で可逆な更新を量産すれば点が伸びる抜け道を塞ぐ。
  const cap = policy.anti_gaming?.r0_weekly_cap;
  let num = rawNum, capped = false;
  if (cap?.enabled && total > 0) {
    const r0 = byClass.R0?.hands_off_weight ?? 0;
    const allowed = cap.max_share_of_weight * total;
    if (r0 > allowed) { num = rawNum - (r0 - allowed); capped = true; }
  }
  const rate = total ? num / total : 0;
  return {
    id: 'umr', rate, n: shipped.length, weight_total: total, weight_hands_off: rawNum,
    weight_counted: num, r0_capped: capped, by_class: byClass,
    max: policy.weights.umr, points: policy.weights.umr * rate, measurable: shipped.length > 0,
    why: shipped.length ? null : '窓内に出荷が無い',
  };
}

/**
 * RA — 復旧自律性。**設計ノートの定義（検知して人手なしで巻き戻した割合）を2つに割る。**
 * 割らないと、自動 revert が1回も起きていない現状では恒久的に 0 になり、
 * 実際に動いている自動検知と自己修復（レーンF）が一切見えなくなる。
 * **Phase 6 のハードゲートは点ではなく auto_revert_count に紐づける**（点で代替しない）。
 */
export function ra(runs, allRuns, policy, { recoveries = [], window = null } = {}) {
  const src = new Set(policy.ra?.machine_detection_sources ?? []);
  const breakages = runs.filter((r) => BREAKAGE_STAGES.has(r.failure_stage));
  const detected = breakages.filter((r) => src.has(r.source));
  const repairedBy = (id) => allRuns.find((x) => x.outcome === 'shipped' && (x.repair_of || []).includes(id));
  const recoveredHandsOff = breakages.filter((r) => {
    const rep = repairedBy(r.run_id);
    return Boolean(rep) && handsOff(rep) && handsOff(r);
  });
  const incidents = recoveries.filter(r => r.mode === 'production' && r.before?.failed === true
    && /^[a-f0-9]{40}$/.test(r.target_sha ?? '') && Number.isFinite(Date.parse(r.detected_at))
    && (!window || (r.detected_at.slice(0, 10) >= window.from && r.detected_at.slice(0, 10) <= window.to)));
  const machineIncidents = incidents.filter(r => r.human_interventions === 0 && ['schedule', 'workflow_run'].includes(r.trigger));
  const recovered = r => r.state === 'recovered' && r.human_interventions === 0
    && ['schedule', 'workflow_run'].includes(r.trigger) && /^[a-f0-9]{40}$/.test(r.revert_sha ?? '')
    && r.validation === 'success' && r.after?.healthy === true && r.deployment_verified === true;
  const recoveredIncidents = incidents.filter(recovered);
  const n = breakages.length + incidents.length;
  const half = policy.weights.ra / 2;
  // **文脈。**機械の検知が 0/n でも「何も検知していない」ではない ——
  // act-reconcile は Gate スキップ（適格性）を実際に自分で拾っている。
  // 拾えていないのは**故障のほう**で、それがここで見たい穴。
  // この2つを出さずに 0% だけ出すと、動いている検知まで無いことにしてしまう。
  const detectedAtAll = breakages.filter((r) => r.detected_at).length;
  const eligibilityByMachine = runs.filter(
    (r) => r.failure_stage === 'eligibility' && src.has(r.source)).length;
  // **同じ検出器が回したが、起動したのが人だった回。**
  //
  // [2026-09-05] 検知 0/12 を「検出器が動いていない」と読ませないために足した。
  // 実測すると、無人枠（schedule）より先に**手動 dispatch やセッションが同じ照合を回して**
  // 記録している —— 09-05 の例では無人枠 01:49Z の85分前、00:24Z の手動起動が先だった。
  // **開発が活発な期間ほど、この指標は「機械の性能」ではなく「人の静かさ」を測る。**
  //
  // 数えるだけで**点には入れない。**「回るはずだった」は回ったことではない。
  const beatenByDispatch = breakages.filter((r) => String(r.source ?? '').startsWith('act-')
    && !src.has(r.source)).length;
  const dRate = n ? (detected.length + machineIncidents.length) / n : 0;
  const rRate = n ? (recoveredHandsOff.length + recoveredIncidents.length) / n : 0;
  // 自動 revert は「出荷後の指標劣化を検知して人手なしで巻き戻した」回。台帳に語彙が無い＝0。
  const autoRevert = recoveries.filter((r) => r.mode === 'production' && r.before?.failed === true && recovered(r)).length;
  return {
    id: 'ra', n,
    detect: { rate: dRate, hit: detected.length + machineIncidents.length, points: half * dRate, max: half,
              detected_at_all: detectedAtAll,
              eligibility_detected_by_machine: eligibilityByMachine,
              beaten_by_dispatch: beatenByDispatch,
              why: n && !detected.length && !machineIncidents.length
                ? `**${detectedAtAll}/${n} は検知されているが、機械が自分で気づいた故障は 0 件。**`
                  + `同じ機械が適格性の沈黙は ${eligibilityByMachine} 件自分で拾っている`
                  + (beatenByDispatch
                    ? ` ／ **うち ${beatenByDispatch} 件は同じ照合が回して記録しているが、起動したのが人**`
                      + `（手動 dispatch・セッション）。**検出器が動いていないのではなく、先を越されている**`
                    : ' —— 拾えていないのは故障のほう')
                : null },
    recover: { rate: rRate, hit: recoveredHandsOff.length + recoveredIncidents.length, points: half * rRate, max: half },
    auto_revert_count: autoRevert,
    rate: n ? (dRate + rRate) / 2 : 0,
    max: policy.weights.ra, points: half * dRate + half * rRate, measurable: n > 0,
    why: n ? null : '窓内に故障が無い（＝分母が無い。満点ではない）',
  };
}

/**
 * EP — エスカレーション精度。**2つに割る。片方しか測れないので、割らないと
 * 「測れない」が「満点」になる。**
 *   miss      … 上げるべきだったのに上げなかった率。**下界しか測れない** ——
 *               規則の within_hours は「検知から人へ届くまで」だが、届いた時刻を
 *               台帳が持っていない。持っているのは failed_at → detected_at で、
 *               **検知だけで既に超えていれば配達も超えている。**片側検定として成立する
 *   precision … 上げたうち本当に必要だった割合。**いまは測れない**（owner_needed が空）
 */
/**
 * その判定を採点に数えてよいか。**純関数。**
 *
 * 欄が埋まっていることは、人が判定したことを意味しない。
 * `data/autopilot-actions.json` は `self_repair.may_modify` の中にあり、機械が書ける ——
 * 実際 2026-09-05 に、AI が自分のエスカレーション19件を `owner_delegated` として自己評価し、
 * 精度が 0 → 3.9 点に動いていた。**その委任の記録は、オーナー所有の台帳に1件も無かった。**
 *
 * **判定そのものは消さない。採点から外すだけ。**オーナーが委任を認めた時点で
 * `ep.precision_review.delegations` に1行足せば、遡って数え直される。
 */
export function acceptedReview(review, policy) {
  const p = policy?.ep?.precision_review;
  if (!p) return false;            // 方針が無いなら数えない（既定で緩めない）
  const mode = review?.mode;
  if (!mode) return false;         // **誰が判定したか分からない欄は数えない**
  if ((p.accepted_modes ?? []).includes(mode)) return true;
  return (p.delegations ?? []).some((d) => d.mode === mode && d.reviewer === review.reviewer);
}

/** 数えなかった理由を、件数つきでまとめる。**「数えなかった」を黙って消さない。** */
export function uncountedReasons(uncounted, policy) {
  const out = new Map();
  for (const a of uncounted) {
    const r = a.owner_needed_review;
    const key = !r?.mode ? '判定者の記録が無い'
      : `${r.mode}${r.reviewer ? `/${r.reviewer}` : ''} は委任の記録が無い`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return [...out].map(([k, n]) => `${k}: ${n}件`);
}

export function ep(runs, policy, { rules, actions }) {
  const half = policy.weights.ep / 2;
  const within = (r) => {
    const hit = (rules.rules || []).find((x) => x.trigger === r.failure_class);
    return hit?.within_hours ?? rules.policy?.default_within_hours ?? 24;
  };
  const timed = runs.filter((r) => BREAKAGE_STAGES.has(r.failure_stage) && r.failed_at && r.detected_at);
  const late = timed.filter((r) => (Date.parse(r.detected_at) - Date.parse(r.failed_at)) / 36e5 > within(r));
  const missRate = timed.length ? late.length / timed.length : null;
  const missPoints = missRate === null ? 0 : half * (1 - missRate);

  const escalated = (actions.actions || []).filter((a) => a.force_owner === 'human' || a.state === 'acknowledged');
  const filled = escalated.filter((a) => typeof a.owner_needed === 'boolean');
  // **誰が判定したかで数えるかどうかを決める。**欄が埋まっていることは、
  // 人が判定したことを意味しない —— 2026-09-05 に実測で出た穴で、
  // アクション台帳（機械が書ける）に AI の自己評価が19件入り、精度が 0 → 3.9 点に動いた。
  const counted = filled.filter((a) => acceptedReview(a.owner_needed_review, policy));
  const uncounted = filled.filter((a) => !acceptedReview(a.owner_needed_review, policy));
  const needed = counted.filter((a) => a.owner_needed);
  const precRate = counted.length ? needed.length / counted.length : null;
  const precPoints = precRate === null ? 0 : half * precRate;
  const judged = counted;   // 表示の互換のため（数えた件数＝判定として採用した件数）
  // **誰が下した判定を数えたかを、点と一緒に出す。**
  // 委任を認めた後でも「人が判定した割合」と読めてしまうと、
  // **点が上がったこと自体が、何が起きたかを隠す。**
  const byMode = {};
  for (const a of counted) {
    const m = a.owner_needed_review?.mode ?? '(不明)';
    byMode[m] = (byMode[m] ?? 0) + 1;
  }
  const humanCount = byMode.human ?? 0;
  const aiCount = counted.length - humanCount;

  return {
    id: 'ep',
    miss: { rate: missRate, n: timed.length, late: late.length, points: missPoints, max: half,
            measurable: timed.length > 0,
            why: timed.length ? '**下界のみ**（検知の時刻までしか台帳に無い。配達時刻は持っていない）'
                              : '窓内に時刻を持つ故障が無い' },
    precision: { rate: precRate, n: escalated.length, filled: filled.length, judged: counted.length,
                 uncounted: uncounted.length, by_mode: byMode, human: humanCount, delegated_ai: aiCount,
                 needed: needed.length, points: precPoints, max: half,
                 measurable: counted.length > 0,
                 why: uncounted.length
                   ? `${filled.length}/${escalated.length} に判定が入っているが、**${uncounted.length}件は採点しない**`
                     + `（${uncountedReasons(uncounted, policy).join(' / ')}）。`
                     + `**記録の無い委任は、自己付与と見分けがつかない。**`
                     + `data/autonomy-score.json の ep.precision_review.delegations にオーナーが1行足せば数え直される`
                   : aiCount
                     ? `${counted.length}/${escalated.length} 判定済み。**うち ${aiCount} 件はAIが自分で下した判定**`
                       + `（オーナーの委任に基づく・2026-09-05）。必要だった ${needed.length} / 不要だった ${counted.length - needed.length}`
                       + `${humanCount ? ` ／ 人の判定は ${humanCount} 件` : ' ／ **人の判定は 0 件**'}`
                   : counted.length ? `${counted.length}/${escalated.length} 判定済み（人の判定）`
                   : `オーナーへ上げた ${escalated.length} 件に owner_needed が1件も入っていない — **上げたのが正しかったかを、この台帳は言えない**` },
    rate: (missPoints + precPoints) / policy.weights.ep,
    max: policy.weights.ep, points: missPoints + precPoints,
    measurable: timed.length > 0 || judged.length > 0,
  };
}

/** TUC — 制約下スループット。**止まっているのに安全だから満点、を作らないための成分。** */
export function tuc(runs, policy, w) {
  const shipped = runs.filter((r) => r.outcome === 'shipped').length;
  const weeks = w.days / 7;
  const perWeek = weeks > 0 ? shipped / weeks : 0;
  const target = policy.tuc?.target_ships_per_week ?? 7;
  const rate = Math.min(1, perWeek / target);
  return {
    id: 'tuc', rate, ships: shipped, per_week: perWeek, target,
    max: policy.weights.tuc, points: policy.weights.tuc * rate, measurable: w.days > 0, why: null,
  };
}

/** 検査被覆率。**落ちることを確かめた検査の本数**（data/check-selftests.json）。 */
export function coverage(selftests) {
  const checks = selftests.checks || [];
  const demonstrated = checks.filter((c) => c.state === 'demonstrated').length;
  return { total: checks.length, demonstrated, rate: checks.length ? demonstrated / checks.length : 0 };
}

/**
 * **分母が無い成分を 0 点にしていることの帰結を、数字で出す。**
 *
 * [2026-09-05 実測] 28日・1日1出荷で「故障ゼロ」と
 * 「3日に1故障・機械が検知・人手なしで修理」を並べると、
 * **壊れて直したほうが 27.5 点高い**（66.4 対 38.9）。
 *
 * 穴は、アンチゲーミング規則の**相互作用**で開いている。
 * 片方だけを見ていると見えない。
 *
 *   anti_gaming.failure_rate_excluded  … 故障の**減点を外した**
 *   分母が無い成分 = 0 点        … 故障の**加点だけを残した**
 *   → 故障が**減点の無い純増**になっている。
 *
 * **点は動かさない。**分母の付け替えは採点の意味を変えるので
 * data/autonomy-score.json の所有者（L4）の判断であって、AI が自分の
 * 採点入力を決めてよい範囲ではない。**見えるようにするまでがこちら側の仕事。**
 *
 * **VDC はここに入れない。**契約が0本でも出荷は21件あり、分母は在る。
 * 「機会が無かった」と「機会はあったが検証できていない」を混ぜると、
 * **何もしていないことが免除される。**
 */
/**
 * **窓内に分母が無い成分へ、最後に測れた率を据え置く。**
 *
 * [2026-09-05・オーナー判断] 「壊れて直したほうが 27.5 点高い」を消すために入れた。
 * 3択のうち **② 最後に測れた率を据え置く** が選ばれている
 * （根拠と、③ を採らなかった理由は data/autonomy-score.json の carry_forward）。
 *
 * **据え置きは「測ったことがある」ときだけ。**窓の外を新しい順に見て
 * `min_denominator` 件以上の分母が取れなければ、0 点のまま ——
 * **一度も試されていない能力に点は入れない。**
 *
 * **古い率は持ち回らない。**いちばん新しい標本が `max_age_days` より古ければ据え置きをやめる。
 * これが無いと「一度だけ良い率を出して、以後ずっと故障を起こさない」で点が固定できる。
 *
 * VDC・UMR・TUC には当てない（窓内に分母が在るので、0 は機会が無かったからではない）。
 */
export function carryForward(components, allRuns, w, policy, { rules, actions } = {}) {
  const cfg = policy.carry_forward;
  if (!cfg?.enabled) return { enabled: false, items: [], skipped: [] };
  const minN = cfg.min_denominator ?? 3;
  const maxAge = cfg.max_age_days ?? policy.window_days * 2;
  const outside = allRuns.filter((r) => (r.date_jst || '') < w.from);
  const newestFirst = (rows) => [...rows].sort((a, b) => (a.date_jst < b.date_jst ? 1 : -1));
  const ageOf = (d) => Math.round((Date.parse(`${w.to}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5);
  const items = [], skipped = [];

  // **率をそのまま点にしない。**EP の見逃しは「率が低いほど良い」成分で、
  // ra.detect と同じ式で当てると**符号が逆になる**（2026-09-05、EP が 0 点に落ちて気づいた）。
  // 据え置くのは「満点に対する取り分」（share）で、率は表示のために別に持つ。
  const take = (id, rows, measure) => {
    if (!(cfg.applies_to || []).includes(id)) return;
    const sample = newestFirst(rows).slice(0, minN);
    if (sample.length < minN) {
      skipped.push({ id, why: `窓の外に分母が ${sample.length} 件しかない（${minN} 件必要）— **測ったことが無い**` });
      return;
    }
    const age = ageOf(sample[0]?.date_jst);
    if (!Number.isFinite(age) || age > maxAge) {
      skipped.push({ id, why: `最後に測れたのが ${age} 日前で、期限 ${maxAge} 日を過ぎている — **昔うまくいったことは、いまの能力の証拠ではない**` });
      return;
    }
    const { rate, share } = measure(sample);
    if (!Number.isFinite(share) || share < 0 || share > 1) { skipped.push({ id, why: `取り分を計算できない（${share}）` }); return; }
    items.push({ id, rate, share, n: sample.length, measured_at: sample[0]?.date_jst, age_days: age });
  };

  if (components.ra.n === 0) {
    const breaks = outside.filter((r) => BREAKAGE_STAGES.has(r.failure_stage));
    const raOf = (sample) => ra(sample, allRuns, policy, { recoveries: [], window: null });
    take('ra.detect', breaks, (sample) => { const h = raOf(sample).detect; return { rate: h.rate, share: h.points / h.max }; });
    take('ra.recover', breaks, (sample) => { const h = raOf(sample).recover; return { rate: h.rate, share: h.points / h.max }; });
  }
  if (components.ep.miss.n === 0) {
    take('ep.miss', outside.filter((r) => BREAKAGE_STAGES.has(r.failure_stage) && r.failed_at && r.detected_at),
      (sample) => { const h = ep(sample, policy, { rules, actions }).miss; return { rate: h.rate, share: h.points / h.max }; });
  }
  return { enabled: true, items, skipped, min_denominator: minN, max_age_days: maxAge };
}

/** 据え置きを成分へ反映する。**点を書き換えるので、書き換えた印を必ず残す。** */
export function applyCarry(components, carried, policy) {
  const byId = Object.fromEntries(components.map((x) => [x.id, x]));
  const half = (component) => policy.weights[component] / 2;
  for (const item of carried.items || []) {
    const [id, part] = item.id.split('.');
    const target = byId[id]?.[part];
    if (!target) continue;
    target.rate = item.rate;
    target.points = half(id) * item.share;
    target.carried = item;
    target.why = `**窓内に分母が無いので、${item.measured_at}（${item.age_days} 日前）までの ${item.n} 件で測れた率を据え置いた。**`
      + 'この窓で測り直したものではない';
    byId[id].carried = (byId[id].carried || []).concat(item);
  }
  const raC = byId.ra, epC = byId.ep;
  if (raC?.carried) {
    raC.points = raC.detect.points + raC.recover.points;
    raC.rate = (raC.detect.rate + raC.recover.rate) / 2;
    raC.why = '窓内に故障が無い。**最後に測れた率を据え置いている**（満点ではない）';
  }
  if (epC?.carried) {
    epC.points = epC.miss.points + epC.precision.points;
    epC.rate = epC.points / policy.weights.ep;
  }
  return components;
}

export function noOpportunity(components, policy) {
  const byId = Object.fromEntries(components.map((x) => [x.id, x]));
  const half = (component) => policy.weights[component] / 2;
  const slots = [
    { id: 'ra.detect', n: byId.ra.n, max: half('ra'), why: '窓内に故障が無い', carried: Boolean(byId.ra.detect.carried) },
    { id: 'ra.recover', n: byId.ra.n, max: half('ra'), why: '窓内に故障が無い', carried: Boolean(byId.ra.recover.carried) },
    { id: 'ep.miss', n: byId.ep.miss.n, max: half('ep'), why: '時刻を持つ故障が無い', carried: Boolean(byId.ep.miss.carried) },
    { id: 'ep.precision', n: byId.ep.precision.n, max: half('ep'), why: 'オーナーへ上げたアクションが無い', carried: false },
  ];
  // **据え置いた成分は穴ではない。**点が入っているので、無機会減点から外す。
  const openSlots = slots.filter((x) => x.n === 0 && !x.carried);
  const forgonePoints = openSlots.reduce((s, x) => s + x.max, 0);
  const rawTotal = components.reduce((s, x) => s + x.points, 0);
  const totalMax = components.reduce((s, x) => s + x.max, 0);
  const denominator = totalMax - forgonePoints;
  return {
    forgone: forgonePoints, items: openSlots,
    // **反実仮想。**分母の無い成分を分母から外したら何点か。
    // これは**スコアではない**。並べて出すのは、差が欠陥の大きさだから。
    normalized: forgonePoints && denominator > 0 ? (rawTotal / denominator) * totalMax : rawTotal,
    note: forgonePoints
      ? '**分母が無い成分を 0 点にしている。**故障が1件も起きなかった窓は、'
        + '故障が起きて機械が検知・修理した窓より低く出る（2026-09-05 実測で 27.5 点差）。'
        + '変更失敗率をスコアから外している（anti_gaming）ため、**故障は減点の無い純増**になっている'
      : null,
  };
}

// ── 合成 ──────────────────────────────────────────────────────
export function score(ctx) {
  const { policy, runsDoc, selftests, rules, actions, history = [], today = todayJst(),
          contracts = null, metrics = null, recoveries = [] } = ctx;
  const all = runsDoc.runs || [];
  const w = windowOf(all, policy.window_days, today);
  const inW = all.filter((r) => inWindow(r, w));

  const components = [
    vdc(inW, policy, { contracts }),
    umr(inW, policy),
    ra(inW, all, policy, { recoveries, window: w }),
    ep(inW, policy, { rules, actions }),
    tuc(inW, policy, w),
  ];
  // **据え置きは合計より前に当てる。**当てたあとの点を素点にする。
  const carried = carryForward(Object.fromEntries(components.map((c) => [c.id, c])), all, w, policy, { rules, actions });
  applyCarry(components, carried, policy);
  const raw = components.reduce((s, c) => s + c.points, 0);
  const cov = coverage(selftests);

  // **非退行制約。**被覆率が下がった窓はスコアを据え置く（上げない）。
  // チェックを緩めれば VDC も UMR も自動的に上がるため。
  // Keep the coverage high-water mark. One low-coverage snapshot must not reset the guard.
  const prev = history.length ? history.reduce((a, b) =>
    b.coverage.demonstrated > a.coverage.demonstrated || (b.coverage.demonstrated === a.coverage.demonstrated && b.coverage.rate > a.coverage.rate) ? b : a) : null;
  const guard = policy.anti_gaming?.coverage_non_regression;
  let total = raw, held = false, heldWhy = null;
  if (guard?.enabled && prev && (cov.demonstrated < prev.coverage.demonstrated || cov.rate < (prev.coverage.rate ?? 0))) {
    if (raw > prev.total) {
      total = prev.total; held = true;
      heldWhy = `検査被覆率が ${prev.coverage.demonstrated} → ${cov.demonstrated} に下がった窓なので、`
        + `スコアを ${raw.toFixed(1)} から前回値 ${prev.total.toFixed(1)} に据え置いた`;
    } else {
      held = true;
      heldWhy = `検査被覆率が下がったが、スコア自体も下がっているので据え置きは効いていない`;
    }
  }

  return {
    generated_jst: today,
    window: w,
    total, raw, held, held_why: heldWhy,
    max: components.reduce((s, c) => s + c.max, 0),
    coverage: cov,
    carried,
    no_opportunity: noOpportunity(components, policy),
    metrics: metrics ? metricsSummary(metrics) : null,
    components: Object.fromEntries(components.map((c) => [c.id, c])),
    excluded: {
      failure_rate: policy.anti_gaming?.failure_rate_excluded
        ? '**変更失敗率はスコアに入れない。**最適化対象にした瞬間、チェックを緩める圧力が生まれる' : null,
    },
    phase6_gate: {
      auto_revert_count: components.find((c) => c.id === 'ra').auto_revert_count,
      open: components.find((c) => c.id === 'ra').auto_revert_count >= 1,
      why: '**権限を広げてよいのは、人手を介さない revert が1回成功してから。**点数では代替しない',
    },
  };
}

export function loadContext({ today = todayJst() } = {}) {
  const contractsPath = path.join(ROOT, readJson(POLICY_PATH).vdc?.contract_ledger ?? 'data/value-contracts.json');
  return {
    policy: readJson(POLICY_PATH),
    runsDoc: readJson(RUNS_PATH),
    selftests: readJson(SELFTESTS_PATH),
    rules: readJson(ESCALATION_PATH),
    actions: readJson(ACTIONS_PATH),
    history: fs.existsSync(HISTORY_PATH) ? readJson(HISTORY_PATH).snapshots ?? [] : [],
    metrics: fs.existsSync(METRICS_PATH) ? readJson(METRICS_PATH) : null,
    contracts: fs.existsSync(contractsPath) ? readJson(contractsPath).contracts ?? [] : null,
    recoveries: fs.existsSync(path.join(ROOT, 'data/decision-recovery.json')) ? readJson(path.join(ROOT, 'data/decision-recovery.json')).incidents ?? [] : [],
    today,
  };
}

// ── 「ranker に見せない」を実際に検査する ───────────────────────
/**
 * 日次runのプロンプト経路が、このスコアを読んでいないこと。
 * **散文の約束にしない** —— 「見せない」と書いてある状態と、見せていない状態は違う。
 */
export function rankerBlindness(policy, { read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8') } = {}) {
  const g = policy.anti_gaming?.hidden_from_ranker;
  if (!g?.enabled) return [];
  const needles = ['autonomy-score', 'autonomy_score', '自律スコア'];
  const problems = [];
  for (const f of g.must_not_read || []) {
    let text;
    try { text = read(f); } catch { problems.push(`${f} が読めない — 見せていないことを確かめられない`); continue; }
    const hit = needles.filter((n) => text.includes(n));
    if (hit.length) {
      problems.push(`${f} が自律スコアを参照している（${hit.join(', ')}）`
        + ' — **計器を最適化対象にしない。**ranker に見せた時点で指標としての寿命が終わる');
    }
  }
  return problems;
}

/**
 * **配点と基準を、AIが書き換えられる側に置いていないこと。**
 *
 * data/authority-matrix.json の self_repair.may_modify は「レーンFが自分で直してよい範囲」で、
 * 権限表そのものは must_not で守られている。**自律スコアの配点は、それと同じ性質を持つ** ——
 * ここが may_modify に入った瞬間、機械は**自分の点数の付け方を自分で決められる。**
 *
 * 散文で「書き換えない」と書くだけにしない。実際に一覧を読んで確かめる。
 */
export const OWNER_ONLY_FILES = ['data/autonomy-score.json', 'data/eligibility-policy.json',
  'data/value-metrics.json', 'data/contract-coverage.json'];
export function policyOwnership(authority, { files = OWNER_ONLY_FILES } = {}) {
  const may = authority?.self_repair?.may_modify;
  if (!Array.isArray(may)) {
    return ['権限表の self_repair.may_modify が読めない — **配点が守られているかを確かめられない**'];
  }
  return files.filter((f) => may.includes(f)).map((f) =>
    `${f} が self_repair.may_modify に入っている`
    + ' — **自分の点数の付け方を自分で決められる場所を作らない。**権限表から外すこと');
}

/**
 * L2 の前提台帳（data/value-metrics.json）— **契約が名指ししてよい指標の許可リスト。**
 *
 * 【なぜここで検査するか】VDC はこの台帳が無ければ動かない。
 * **「起案してあるから使ってよい」を作らない**のがこの台帳の目的なので、
 * 承認欄が空のまま使える経路ができていないことを、VDC を数えるのと同じ場所で見る。
 *
 * 【いちばん効く行】除外した指標が裏口から戻っていないか。
 * 変更失敗率は自律スコアが意図して除外しているが、**価値契約の指標に入れれば
 * 除外の意味は消える** —— 死亡率を最適化対象にした瞬間、チェックを緩める圧力が生まれる。
 * 自律スコア自身も同じで、契約の指標にすると ranker に見せることになる。
 */
export const NULL_MODEL_KINDS = ['same_weekday_median', 'trailing_median', 'zero'];
export const METRIC_TIERS = ['A', 'B', 'C'];

export function validateMetrics(doc, policy) {
  const problems = [];
  if (!doc || !Array.isArray(doc.metrics)) return ['value-metrics.json: metrics must be an array'];
  const ids = new Set();
  for (const m of doc.metrics) {
    const at = `value-metrics「${m.id || '(id無し)'}」`;
    if (!m.id) problems.push(`${at}: id が無い`);
    else if (ids.has(m.id)) problems.push(`${at}: id が重複`);
    else ids.add(m.id);
    if (!m.name) problems.push(`${at}: name が無い`);
    if (!METRIC_TIERS.includes(m.tier)) problems.push(`${at}: tier は ${METRIC_TIERS.join('|')}（got ${JSON.stringify(m.tier)}）`);
    if (m.approved_by && !m.approved_at) problems.push(`${at}: 承認者はいるのに承認日が無い`);
    if (m.tier === 'C') {
      if (!m.why_excluded) problems.push(`${at}: tier C に why_excluded が無い — **使わない判断こそ理由が要る**`);
      if (m.null_model) problems.push(`${at}: tier C なのに null_model がある — 使わない指標に基準を置かない`);
      continue;
    }
    if (!m.source) problems.push(`${at}: source が無い`);
    if (!['up', 'down'].includes(m.direction)) problems.push(`${at}: direction は up|down`);
    if (!m.gaming_risk) problems.push(`${at}: gaming_risk が無い`
      + ' — **どう歪められるかを書いていない指標は、歪められたときに気づけない**');
    const k = m.null_model?.kind;
    if (!NULL_MODEL_KINDS.includes(k)) {
      problems.push(`${at}: null_model.kind は ${NULL_MODEL_KINDS.join('|')}（got ${JSON.stringify(k)}）`
        + ' — **ゼロを基準にすると、勝手に動く指標を選んだぶんがそのまま得点になる**');
    }
    if (m.tier === 'B') {
      if (!m.promotes_when) problems.push(`${at}: tier B に promotes_when が無い — **いつ使えるようになるかを書く**`);
      if (!Array.isArray(m.blocked_by) || !m.blocked_by.length) {
        problems.push(`${at}: tier B に blocked_by が無い — 何が塞いでいるかを書かないと、待ちが理由なく続く`);
      }
    }
  }
  // **除外した指標が、価値契約の裏口から戻っていないか。**
  const tierOf = (id) => doc.metrics.find((m) => m.id === id)?.tier ?? null;
  if (policy?.anti_gaming?.failure_rate_excluded && tierOf('change_failure_rate') !== 'C') {
    problems.push('自律スコアは変更失敗率を除外しているのに、価値契約では tier C になっていない'
      + ' — **除外の意味が裏口から消える。**死亡率を最適化対象にすると、チェックを緩める圧力が生まれる');
  }
  if (policy?.anti_gaming?.hidden_from_ranker?.enabled && tierOf('autonomy_score') !== 'C') {
    problems.push('自律スコアを ranker に見せない設定なのに、価値契約の指標として tier C になっていない'
      + ' — **契約の指標にした時点で ranker に見せている**');
  }
  return problems;
}

export function metricsSummary(doc) {
  const by = { A: 0, B: 0, C: 0 };
  for (const m of doc?.metrics ?? []) if (m.tier in by) by[m.tier] += 1;
  const usable = (doc?.metrics ?? []).filter((m) => m.tier !== 'C' && m.approved_by);
  return { total: (doc?.metrics ?? []).length, by_tier: by, approved: usable.length,
           usable_ids: usable.map((m) => m.id) };
}

// ── 検査 ──────────────────────────────────────────────────────
export function check(s, policy, { blindness = [] } = {}) {
  const problems = [...blindness];
  const sum = Object.values(s.components).reduce((a, c) => a + c.max, 0);
  const declared = Object.values(policy.weights).reduce((a, b) => a + b, 0);
  if (sum !== declared) problems.push(`配点の合計が台帳（${declared}）と一致しない（${sum}）`);
  if (declared !== 100) problems.push(`配点の合計が100でない（${declared}）— 100点満点だと書いてあるのに違う`);
  // **可逆性クラスの網羅。**権限表の領域に分類が無いと、UMR が黙って既定値で数える。
  const authority = readJson(path.join(ROOT, 'data/authority-matrix.json'));
  problems.push(...policyOwnership(authority));
  const classed = new Set((policy.domain_class || []).map((d) => d.domain));
  for (const d of authority.domains || []) {
    if (!classed.has(d.domain)) problems.push(`権限表の領域「${d.domain}」に可逆性クラスが無い`);
  }
  for (const row of policy.domain_class || []) {
    if (!policy.reversibility?.[row.class]) problems.push(`「${row.domain}」の class "${row.class}" が未登録`);
  }
  // **測れていない成分を、測れているように出さない。**
  for (const c of Object.values(s.components)) {
    const labelled = Array.isArray(c.carried) && c.carried.length
      && c.carried.every((x) => x.measured_at && Number.isFinite(x.rate) && Number.isFinite(x.n));
    if (c.points > 0 && c.measurable === false && !labelled) {
      problems.push(`成分 ${c.id} は measurable=false なのに ${c.points} 点入っている`
        + '（据え置きなら carried に measured_at / rate / n を残すこと）');
    }
  }
  if (s.total > s.max) problems.push(`合計 ${s.total} が満点 ${s.max} を超えている`);
  // **穴が開いているのに、黙って開いていることを許さない。**
  // no_opportunity は点を動かさない診断なので、消しても合計は変わらない ——
  // だからこそ、消えたことに気づく側をここに置く。
  const nop = s.no_opportunity;
  if (nop && nop.forgone > 0 && !nop.note) {
    problems.push(`無機会減点が ${nop.forgone} 点あるのに、理由が出ていない`
      + ' — **分母が無いから0点なのか、やっていないから0点なのかが読めなくなる**');
  }
  // **ep() が緩められたときに鳴る側。**生の台帳から数え直して照合する。
  //
  // **「2枚目の扉」と書きかけて、変異試験で外れた。**この照合は acceptedReview() を
  // ep() と共有しているので、**判定そのものを潰すと両方いっしょに黙る**（実測）。
  // 独立に効くのは「ep() の絞り込みだけを外した」場合で、そのときはここが名指しで落ちる（実測）。
  // acceptedReview() 自体を潰した場合に鳴るのは自己テストのほう（2件が名指しで落ちる）。
  // **どちらが何を守っているかを混ぜない。**
  if (fs.existsSync(ACTIONS_PATH)) {
    const acts = readJson(ACTIONS_PATH).actions ?? [];
    const esc = acts.filter((a) => a.force_owner === 'human' || a.state === 'acknowledged');
    const ok = esc.filter((a) => typeof a.owner_needed === 'boolean'
      && acceptedReview(a.owner_needed_review, policy)).length;
    if (s.components.ep?.precision?.judged !== ok) {
      problems.push(`EP の精度が数えた件数（${s.components.ep?.precision?.judged}）が、`
        + `台帳から数え直した採用件数（${ok}）と一致しない`
        + ' — **AIが自分のエスカレーションを自分で採点していないか。**'
        + '委任を認めるなら data/autonomy-score.json の ep.precision_review.delegations に書く');
    }
  }
  // **人の判定として数える行には、判定者・日付・根拠が要る**（2026-09-05・月次追認の道具と対）。
  // acceptedReview は mode: human をそのまま数えるが、その欄は機械が書ける台帳にある。
  // 根拠（オーナーの言葉）の無い human は、機械が書いたのと見分けがつかない。
  if (fs.existsSync(ACTIONS_PATH)) problems.push(...humanReviewProblems(readJson(ACTIONS_PATH).actions ?? []));
  // L2 の前提台帳。**VDC が動く条件そのもの**なので、同じ検査で見る。
  if (fs.existsSync(METRICS_PATH)) problems.push(...validateMetrics(readJson(METRICS_PATH), policy));
  return problems;
}

/** 人の判定（mode: human）に判定者・日付・根拠が揃っているか。scripts/ep-ratify.mjs と同じ規則。 */
export function humanReviewProblems(actions) {
  const problems = [];
  for (const a of actions ?? []) {
    const r = a?.owner_needed_review;
    if (r?.mode !== 'human') continue;
    const at = `data/autopilot-actions.json#${a.id ?? '?'}`;
    if (r.reviewer !== 'owner') problems.push(`${at}: 人の判定なのに reviewer が owner でない（${r.reviewer ?? '空'}）`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reviewed_jst ?? '')) problems.push(`${at}: 人の判定なのに reviewed_jst が無い`);
    if (typeof r.evidence !== 'string' || r.evidence.trim().length < 12) {
      problems.push(`${at}: 人の判定なのに根拠（evidence）が無い — 機械が mode: human と書いたのと見分けがつかない`);
    }
  }
  return problems;
}

// ── 自己テスト ────────────────────────────────────────────────
function selftest() {
  let n = 0, bad = 0;
  const eq = (got, want, msg) => {
    n += 1;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      bad += 1; console.error(`  ✗ ${msg}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
    }
  };
  const ok = (name, fn) => { n += 1; try { fn(); } catch (e) { bad += 1; console.error(`  ✗ ${name}\n      ${e.message}`); } };

  const P = {
    window_days: 28,
    weights: { vdc: 30, umr: 25, ra: 20, ep: 15, tuc: 10 },
    reversibility: { R0: { weight: 1 }, R1: { weight: 3 }, R2: { weight: 10 } },
    lane_action_class: { default: 'R1', by_lane: { E: { new: 'R1', refresh: 'R0' }, F: { new: 'R0', refresh: 'R0' } } },
    anti_gaming: { r0_weekly_cap: { enabled: true, max_share_of_weight: 0.6 },
                   coverage_non_regression: { enabled: true }, failure_rate_excluded: true },
    tuc: { target_ships_per_week: 7 },
    ra: { machine_detection_sources: ['act-reconcile'] },
    ep: { precision_review: { accepted_modes: ['human'], delegations: [] } },
    carry_forward: { enabled: true, applies_to: ['ra.detect', 'ra.recover', 'ep.miss'],
                     min_denominator: 3, max_age_days: 56 },
  };
  const ship = (id, over = {}) => ({ run_id: id, date_jst: '2026-09-01', outcome: 'shipped', lane: 'E', action: 'new', interventions: [], ...over });

  // --- 窓 ---
  eq(windowOf([{ date_jst: '2026-09-01' }], 28, '2026-09-04').days, 4, '台帳が短ければ全期間');
  eq(windowOf([{ date_jst: '2026-09-01' }], 28, '2026-09-04').truncated, false, '短い台帳は切り詰めていない');
  eq(windowOf([{ date_jst: '2026-01-01' }], 28, '2026-09-04').days, 28, '長ければ窓ぶんだけ');
  eq(windowOf([{ date_jst: '2026-01-01' }], 28, '2026-09-04').truncated, true, '**切り詰めたことを出す**');
  eq(windowOf([], 28, '2026-09-04').days, 0, '空の台帳は0日（満点ではない）');

  // --- VDC ---
  eq(vdc([ship('a')], P).points, 0, '**L2 が無ければ 0 点**（空欄にしない）');
  eq(vdc([ship('a')], P).measurable, false, '測れていないことを出す');
  eq(vdc([ship('a'), ship('b')], P, { contracts: [{ run_id: 'a', settled_at: 'x' }] }).points, 0,
     '決済時刻を書くだけでは加点しない');
  eq(vdc([ship('a')], P, { contracts: [{ run_id: 'a' }] }).points, 0,
     '**決済されていない契約は数えない**（書いただけでは検証ではない）');
  // **3つの 0 を分けて言う。**原因も次の一手も違う。
  eq(vdc([ship('a')], P).why?.includes('契約台帳が無い'), true, '台帳が無い状態');
  eq(vdc([ship('a')], P).measurable, false, '台帳が無ければ測れていない');
  eq(vdc([ship('a')], P, { contracts: [] }).why?.includes('契約がまだ1本も書かれていない'), true,
     '**空の台帳を「仕組みが無い」と同じ扱いにしない**');
  eq(vdc([ship('a')], P, { contracts: [] }).measurable, false,
     '**Boolean([]) は真だが、契約0本は測れていない**（この取り違えが実際に起きていた）');
  eq(vdc([ship('a')], P, { contracts: [{ run_id: 'a' }] }).why?.includes('決済済みが 0'), true,
     '書かれたが決済されていない状態');
  eq(vdc([ship('a')], P, { contracts: [{ run_id: 'a' }] }).contracts_written, 1, '書かれた本数を出す');

  // --- UMR ---
  eq(umr([ship('a')], P).points, 25, '無介入なら満点');
  eq(umr([ship('a', { interventions: [{ kind: 'infra' }] })], P).points, 0, '**基盤の修理も介入**（変更単位で数える）');
  const mix = [ship('a'), ship('b', { interventions: [{ kind: 'infra' }] })];
  eq(Math.round(umr(mix, P).rate * 100), 50, '同じクラスなら件数の比');
  const heavy = [ship('a', { lane: 'E', action: 'new' }), ship('b', { lane: 'F', action: 'refresh', interventions: [] })];
  eq(umr(heavy, P).weight_total, 4, 'R1=3 と R0=1 で総重み4');
  // R0 の上限
  const manyR0 = [ship('a', { lane: 'F' }), ship('b', { lane: 'F' }), ship('c', { lane: 'F' })];
  eq(umr(manyR0, P).r0_capped, true, '**R0 ばかりだと上限に当たる**（些末で可逆な変更の量産を塞ぐ）');
  eq(Math.round(umr(manyR0, P).rate * 100), 60, 'R0 の寄与は総重みの60%まで');
  eq(umr([ship('a', { lane: 'E', action: 'new' })], P).r0_capped, false, 'R1 は上限に当たらない');
  eq(umr([], P).points, 0, '**出荷ゼロは0点**（分母が無いことを満点にしない）');

  // --- RA ---
  const brk = (id, over = {}) => ({ run_id: id, date_jst: '2026-09-01', outcome: 'failed', failure_stage: 'execution', source: 'session', interventions: [], ...over });
  eq(ra([brk('f1')], [brk('f1')], P).points, 0, '検知も復旧もしていなければ0');
  eq(ra([brk('f1', { source: 'act-reconcile' })], [brk('f1', { source: 'act-reconcile' })], P).detect.rate, 1,
     '機械が検知していれば検知側は満点');
  eq(ra([brk('f1', { source: 'act-reconcile-session' })], [brk('f1')], P).detect.rate, 0,
     '**`act-reconcile-session` は機械の検知に数えない**（人が起こしたセッションが回した形）');
  const withRepair = [brk('f1'), ship('r1', { repair_of: ['f1'] })];
  eq(ra([brk('f1')], withRepair, P).recover.rate, 1, '無介入の修理があれば復旧側は満点');
  const dirtyRepair = [brk('f1'), ship('r1', { repair_of: ['f1'], interventions: [{ kind: 'infra' }] })];
  eq(ra([brk('f1')], dirtyRepair, P).recover.rate, 0, '**人が触った修理は自律復旧ではない**');
  eq(ra([brk('f1', { interventions: [{ kind: 'infra' }] })], [brk('f1', { interventions: [{ kind: 'infra' }] }), ship('r1', { repair_of: ['f1'] })], P).recover.rate, 0,
     '故障側に人が触っていても自律復旧ではない');
  eq(ra([{ run_id: 'e', date_jst: '2026-09-01', outcome: 'skipped_gate', failure_stage: 'eligibility' }], [], P).n, 0,
     '**適格性の棄却は故障ではない**（止まったのであって壊れていない）');
  eq(ra([], [], P).points, 0, '故障ゼロは0点（分母が無いことを満点にしない）');
  eq(ra([brk('f1')], [brk('f1')], P).auto_revert_count, 0, '自動 revert は1回も起きていない');
  eq(ra([brk('f1', { detected_at: 'x' })], [brk('f1')], P).detect.detected_at_all, 1,
     '**検知されたこと自体は数える**（機械が気づいたかとは別）');
  eq(ra([brk('f1'), { run_id: 'e', date_jst: '2026-09-01', outcome: 'skipped_gate', failure_stage: 'eligibility', source: 'act-reconcile' }], [], P)
       .detect.eligibility_detected_by_machine, 1,
     '**適格性の沈黙は機械が拾えている**（0% だけ出して「何も検知していない」と読ませない）');
  // **「先を越された」を数えるが、点には入れない。**
  eq(ra([brk('f1', { source: 'act-reconcile-session' })], [], P).detect.beaten_by_dispatch, 1,
     '同じ照合が回したが起動が人だった回を数える');
  eq(ra([brk('f1', { source: 'act-reconcile-session' })], [], P).detect.points, 0,
     '**数えても点には入れない**（「回るはずだった」は回ったことではない）');
  eq(ra([brk('f1', { source: 'session' })], [], P).detect.beaten_by_dispatch, 0,
     'そもそも照合を回していない回は数えない（source が act- で始まらない）');
  eq(ra([brk('f1', { source: 'act-reconcile' })], [], P).detect.beaten_by_dispatch, 0,
     '**無人で回った回は「先を越された」ではない**（そちらは検知に数える）');
  eq(ra([brk('f1', { source: 'act-reconcile-session' })], [], P).detect.why.includes('先を越されている'), true,
     '**検出器が動いていない、と読ませない**');
  eq(ra([brk('f1')], [brk('f1'), { auto_revert_of: 'f1' }], P).auto_revert_count, 0, '自己申告だけで権限を広げない');
  eq(ra([brk('f1')], [brk('f1'), ship('r', { outcome: 'failed', repair_of: ['f1'] })], P).recover.hit, 0, '失敗した修理を復旧に数えない');
  const recovered = { mode: 'production', before: { failed: true }, target_sha: 'a'.repeat(40), detected_at: '2026-09-01T00:00:00Z',
    state: 'recovered', trigger: 'schedule', human_interventions: 0, revert_sha: 'b'.repeat(40), validation: 'success', after: { healthy: true }, deployment_verified: true };
  eq(ra([], [], P, { recoveries: [recovered] }).points, 20, '本番で検知と復旧が両方検証されれば数える');
  eq(ra([], [], P, { recoveries: [{ ...recovered, mode: 'drill' }] }).auto_revert_count, 0, '訓練でPhase6を開かない');

  // --- EP ---
  const rules = { policy: { default_within_hours: 24 }, rules: [{ trigger: 'usage_limit', within_hours: 24 }] };
  const late = brk('f1', { failure_class: 'usage_limit', failed_at: '2026-09-01T00:00:00Z', detected_at: '2026-09-03T00:00:00Z' });
  const quick = brk('f2', { failure_class: 'usage_limit', failed_at: '2026-09-01T00:00:00Z', detected_at: '2026-09-01T01:00:00Z' });
  eq(ep([quick], P, { rules, actions: { actions: [] } }).miss.points, 7.5, '規則内なら miss 側は満点');
  eq(ep([late], P, { rules, actions: { actions: [] } }).miss.points, 0, '**規則を超えていれば0**');
  eq(ep([], P, { rules, actions: { actions: [] } }).miss.points, 0, '時刻を持つ故障が無ければ0（満点にしない）');
  eq(ep([quick], P, { rules, actions: { actions: [] } }).precision.points, 0,
     '**owner_needed が空なら精度は0点**（測れないことを満点にしない）');
  // **誰が判定したかで数えるかどうかが決まる。**欄が埋まっていることは、人が判定したことではない。
  const hum = (m) => ({ mode: 'human', reviewed_jst: '2026-09-05', ...m });
  const acts = { actions: [
    { force_owner: 'human', owner_needed: true, owner_needed_review: hum() },
    { force_owner: 'human', owner_needed: false, owner_needed_review: hum() }] };
  eq(ep([quick], P, { rules, actions: acts }).precision.points, 3.75, '人が判定していれば、半分が必要なら半分');
  eq(ep([quick], P, { rules, actions: acts }).points, 11.25, '2つの半分を足す');

  // **記録の無い委任は数えない。**2026-09-05 に実データで開いていた穴。
  const delegatedActs = { actions: acts.actions.map((a) => ({ ...a,
    owner_needed_review: { mode: 'owner_delegated', reviewer: 'codex' } })) };
  const dp = ep([quick], P, { rules, actions: delegatedActs }).precision;
  eq(dp.points, 0, '**委任の記録が無ければ0点**（AIが自分のエスカレーションを自分で採点しない）');
  eq(dp.uncounted, 2, '数えなかった件数を出す');
  eq(dp.filled, 2, '**欄が埋まっている件数は別に出す**（消さない・見えなくしない）');
  eq(dp.why?.includes('委任の記録が無い'), true, '理由を名指しする');

  // 判定者の記録が無い欄も数えない —— 機械が埋めたのと見分けがつかない
  const bare = { actions: [{ force_owner: 'human', owner_needed: true }] };
  eq(ep([quick], P, { rules, actions: bare }).precision.points, 0,
     '**`owner_needed` だけ埋まっていて判定者の記録が無い行は数えない**');
  eq(ep([quick], P, { rules, actions: bare }).precision.why.includes('判定者の記録が無い'), true,
     '理由を分けて出す（委任の記録が無いのとは別の穴）');

  // **オーナーが委任を認めれば、遡って数え直される。**判定を消していないので戻せる。
  const withDelegation = { ...P, ep: { ...P.ep, precision_review: {
    accepted_modes: ['human'],
    delegations: [{ mode: 'owner_delegated', reviewer: 'codex', delegated_at: '2026-09-05' }] } } };
  eq(ep([quick], withDelegation, { rules, actions: delegatedActs }).precision.points, 3.75,
     '委任が台帳に入れば数える');
  {
    const dpp = ep([quick], withDelegation, { rules, actions: delegatedActs }).precision;
    eq(dpp.delegated_ai, 2, '**委任で数えた件数は、AIが下した判定として別に持つ**');
    eq(dpp.human, 0, '人の判定は0件');
    eq(dpp.why?.includes('AIが自分で下した判定'), true,
       '**委任した後も「人の判定」とは表示しない**（点が上がったことが、何が起きたかを隠さない）');
    eq(dpp.why?.includes('人の判定は 0 件'), true, '人の判定が0件であることを名指しする');
    eq(dpp.needed, 1, '必要・不要の内訳も出す（全部 true に倒れ始めたら見えるように）');
  }
  eq(ep([quick], withDelegation, { rules, actions: { actions: delegatedActs.actions.map((a) => ({ ...a,
       owner_needed_review: { mode: 'owner_delegated', reviewer: '別のだれか' } })) } }).precision.points, 0,
     '**委任した相手だけ**（reviewer が違えば数えない）');
  eq(acceptedReview({ mode: 'human' }, P), true, '既定で人の判定は数える');
  eq(acceptedReview({ mode: 'owner_delegated', reviewer: 'codex' }, P), false, '既定で委任は数えない');
  eq(acceptedReview(undefined, P), false, '判定者の記録が無ければ数えない');
  eq(humanReviewProblems([{ id: 'm', owner_needed_review: { mode: 'human' } }]).length, 3,
     '**機械が mode: human とだけ書いた行は3点で落ちる**（判定者・日付・根拠）');
  eq(humanReviewProblems([{ id: 'h', owner_needed_review: { mode: 'human', reviewer: 'owner', reviewed_jst: '2026-10-01',
     evidence: '2026-10-01、オーナーが「私が判断すべき件だった」と述べた' } }]), [], '道具が書く形は通る');
  eq(humanReviewProblems([{ id: 'd', owner_needed_review: { mode: 'owner_delegated', reviewer: 'codex' } }]), [],
     '委任判定はこの検査の対象外（数えるかどうかは acceptedReview が決める）');
  eq(acceptedReview({ mode: 'human' }, { weights: P.weights }), false,
     '**方針が無いなら数えない**（既定で緩めない）');

  // --- TUC ---
  const w7 = { days: 7 };
  eq(tuc(Array.from({ length: 7 }, (_, i) => ship(`s${i}`)), P, w7).points, 10, '週7出荷で満点');
  eq(tuc(Array.from({ length: 14 }, (_, i) => ship(`s${i}`)), P, w7).points, 10, '**満点を超えない**');
  eq(tuc([], P, w7).points, 0, '止まっていれば0（安全だから満点、を作らない）');

  // --- 非退行制約 ---
  const base = {
    policy: P, selftests: { checks: [{ state: 'demonstrated' }, { state: 'demonstrated' }] },
    rules, actions: { actions: [] }, today: '2026-09-04',
    runsDoc: { runs: [ship('a', { date_jst: '2026-09-04' })] },
  };
  const s1 = score(base);
  ok('被覆率が同じなら据え置かない', () => {
    const s2 = score({ ...base, history: [{ total: 0, coverage: { demonstrated: 2 } }] });
    assert(s2.held === false, `据え置かれた: ${s2.held_why}`);
    assert(s2.total === s1.total, '値が変わった');
  });
  ok('**被覆率が下がった窓はスコアを据え置く**', () => {
    const s2 = score({ ...base, history: [{ total: 1, coverage: { demonstrated: 5 } }] });
    assert(s2.held === true, '据え置かれていない');
    assert(s2.total === 1, `前回値に固定されていない: ${s2.total}`);
    assert(s2.raw > 1, '素点は下がっていない前提が崩れている');
  });
  ok('被覆率が下がってもスコアが下がっていれば、据え置きは効かない', () => {
    const s2 = score({ ...base, history: [{ total: 99, coverage: { demonstrated: 5 } }] });
    assert(s2.total === s2.raw, '下がる方向まで止めている');
  });

  // --- ranker に見せない ---
  eq(rankerBlindness({ anti_gaming: { hidden_from_ranker: { enabled: true, must_not_read: ['x.yml'] } } },
                     { read: () => 'node scripts/autopilot-act.mjs' }), [],
     '参照が無ければ通る');
  ok('**プロンプト経路がスコアを参照したら落ちる**', () => {
    const p = rankerBlindness({ anti_gaming: { hidden_from_ranker: { enabled: true, must_not_read: ['x.yml'] } } },
                              { read: () => 'node scripts/autonomy-score.mjs' });
    assert(p.length > 0, '参照しているのに落ちなかった');
  });
  ok('**読めないファイルは「参照が無い」ではない**', () => {
    const p = rankerBlindness({ anti_gaming: { hidden_from_ranker: { enabled: true, must_not_read: ['x.yml'] } } },
                              { read: () => { throw new Error('no'); } });
    assert(p.length > 0, '読めないことを異常なしと報告した');
  });

  // --- 検査そのもの ---
  ok('**配点が100でなければ落ちる**', () => {
    const bent = { ...P, weights: { ...P.weights, vdc: 40 } };
    const p = check(score({ ...base, policy: bent }), bent);
    assert(p.some((x) => x.includes('100')), `落ちなかった: ${JSON.stringify(p)}`);
  });
  ok('**権限表の領域に分類が無ければ落ちる**', () => {
    const p = check(s1, { ...P, domain_class: [], weights: P.weights, reversibility: P.reversibility });
    assert(p.some((x) => x.includes('可逆性クラスが無い')), `落ちなかった: ${JSON.stringify(p.slice(0, 2))}`);
  });
  eq(policyOwnership({ self_repair: { may_modify: ['scripts/a.mjs'] } }), [], '入っていなければ通る');
  ok('**配点が may_modify に入っていたら落ちる**', () => {
    const p = policyOwnership({ self_repair: { may_modify: ['data/autonomy-score.json'] } });
    assert(p.length === 1, `落ちなかった: ${JSON.stringify(p)}`);
  });
  ok('**適格性の基準が may_modify に入っていても落ちる**', () => {
    const p = policyOwnership({ self_repair: { may_modify: ['data/eligibility-policy.json'] } });
    assert(p.length === 1, `落ちなかった: ${JSON.stringify(p)}`);
  });
  ok('**一覧が読めないのは「守られている」ではない**', () => {
    assert(policyOwnership({}).length === 1, '読めないのに通した');
  });
  // --- L2 の前提台帳 ---
  const M = (over) => ({ metrics: [{ id: 'x', name: 'X', tier: 'A', source: 's', direction: 'up',
    gaming_risk: 'g', null_model: { kind: 'trailing_median', window_days: 14 }, ...over }] });
  eq(validateMetrics(M({}), {}), [], '形が揃っていれば通る');
  ok('**null_model が無ければ落ちる**（ゼロを基準にしない）', () => {
    assert(validateMetrics(M({ null_model: null }), {}).length > 0, '落ちなかった');
  });
  ok('未登録の null_model.kind は落ちる', () => {
    assert(validateMetrics(M({ null_model: { kind: 'なんとなく' } }), {}).length > 0, '落ちなかった');
  });
  ok('**gaming_risk が無ければ落ちる**（歪め方を書いていない指標は歪められても気づけない）', () => {
    assert(validateMetrics(M({ gaming_risk: null }), {}).length > 0, '落ちなかった');
  });
  ok('tier B は promotes_when と blocked_by を要求する', () => {
    assert(validateMetrics(M({ tier: 'B' }), {}).length > 0, '落ちなかった');
    assert(validateMetrics(M({ tier: 'B', promotes_when: 'w', blocked_by: ['b'] }), {}).length === 0, '揃っているのに落ちた');
  });
  ok('tier C は理由を要求し、基準を持たない', () => {
    assert(validateMetrics({ metrics: [{ id: 'x', name: 'X', tier: 'C' }] }, {}).length > 0, '理由なしが通った');
    assert(validateMetrics({ metrics: [{ id: 'x', name: 'X', tier: 'C', why_excluded: 'w',
      null_model: { kind: 'zero' } }] }, {}).length > 0, '使わない指標に基準を置けてしまった');
  });
  ok('承認者がいるのに承認日が無ければ落ちる', () => {
    assert(validateMetrics(M({ approved_by: 'owner' }), {}).length > 0, '落ちなかった');
  });
  ok('**除外した指標が価値契約の裏口から戻っていたら落ちる**（変更失敗率）', () => {
    const doc = { metrics: [{ id: 'change_failure_rate', name: 'x', tier: 'A', source: 's',
      direction: 'down', gaming_risk: 'g', null_model: { kind: 'zero' } }] };
    const p = validateMetrics(doc, { anti_gaming: { failure_rate_excluded: true } });
    assert(p.some((x) => x.includes('裏口')), `落ちなかった: ${JSON.stringify(p)}`);
  });
  ok('**自律スコア自身が契約の指標になっていたら落ちる**', () => {
    const doc = { metrics: [{ id: 'autonomy_score', name: 'x', tier: 'B', source: 's', direction: 'up',
      gaming_risk: 'g', null_model: { kind: 'zero' }, promotes_when: 'w', blocked_by: ['b'] }] };
    const p = validateMetrics(doc, { anti_gaming: { hidden_from_ranker: { enabled: true } } });
    assert(p.some((x) => x.includes('ranker')), `落ちなかった: ${JSON.stringify(p)}`);
  });
  eq(metricsSummary({ metrics: [{ tier: 'A', approved_by: 'o' }, { tier: 'A' }, { tier: 'C' }] }).approved, 1,
     '**起案は承認ではない**（approved_by が入った指標だけ数える）');

  // --- 無機会減点（**故障が起きたほうが高く出る**）---
  //
  // ここは「点が正しいか」ではなく「**採点の形が歪んでいることを、計器が言うか**」を見る。
  // 数字はこの場で score() から取り直すので、上の docstring に書いた 27.5 が
  // 実装からずれたらここが落ちる（散文だけにしない）。
  const quietBase = {
    policy: P, selftests: { checks: [{ state: 'demonstrated' }] },
    rules, actions: { actions: [] }, today: '2026-09-28',
    runsDoc: { runs: Array.from({ length: 28 }, (_, i) => ship(`q${i}`,
      { date_jst: `2026-09-${String(i + 1).padStart(2, '0')}`, lane: 'C', pr: 100 + i })) },
  };
  const brokenBase = {
    ...quietBase,
    runsDoc: { runs: quietBase.runsDoc.runs.flatMap((r, i) => i % 3 !== 2 ? [r] : [
      { run_id: `f${i}`, date_jst: r.date_jst, outcome: 'failed', failure_stage: 'execution',
        source: 'act-reconcile', interventions: [],
        failed_at: `${r.date_jst}T00:00:00Z`, detected_at: `${r.date_jst}T01:00:00Z` },
      ship(`fix${i}`, { date_jst: r.date_jst, lane: 'F', action: 'refresh', repair_of: [`f${i}`], pr: 500 + i }),
    ]) },
  };
  const quiet = score(quietBase);
  const broken = score(brokenBase);

  eq(quiet.no_opportunity?.forgone, 35, '**故障もエスカレーションも無い窓は 35 点ぶん分母が無い**（RA 20 ＋ EP 15）');
  eq(quiet.no_opportunity?.items?.map((x) => x.id),
     ['ra.detect', 'ra.recover', 'ep.miss', 'ep.precision'], '分母の無い成分を名指しで出す');
  eq(broken.no_opportunity?.items?.map((x) => x.id), ['ep.precision'],
     '故障が入れば RA と EP見逃し の分母は戻る（残るのは上げていないことだけ）');

  ok('**穴が開いた窓には理由が本文で付く**（注記だけ消す変異が素通りしていた）', () => {
    // [2026-09-05] 変異試験で見つけた自分の穴。check() の見張りは**手で組んだ**
    // no_opportunity を渡していたので、noOpportunity() が注記を返さなくなっても
    // 誰も落ちなかった。**見張りを検査したつもりで、見張りの入力を検査していた。**
    const n = quiet.no_opportunity ?? {};
    assert(n.forgone > 0, '前提が崩れている（無機会減点が0）');
    assert(typeof n.note === 'string' && n.note.includes('純増'),
      `実物の noOpportunity() が理由を返していない: ${JSON.stringify(n.note)}`);
  });

  ok('**壊れて直したほうが、壊れないより高く出る**（設計上の欠陥。点は動かさず記録する）', () => {
    const gap = broken.total - quiet.total;
    assert(gap > 0, `壊れたほうが高くない（gap=${gap.toFixed(1)}）—— 欠陥が直ったならこの検査を書き換える`);
    // **散文に書いた数字を、ここで固定する。**render() と docstring の 35.0 / 62.5 / 27.5 は
    // この2シナリオから出た実測値なので、実装が動いたらここが落ちて散文の嘘が残らない。
    assert(quiet.total === 35, `故障ゼロの実測が 35.0 でない: ${quiet.total}`);
    assert(broken.total === 62.5, `故障ありの実測が 62.5 でない: ${broken.total}`);
    assert(gap === 27.5, `差が 27.5 でない: ${gap.toFixed(2)} —— 散文の数字を書き直すこと`);
    assert(gap <= quiet.no_opportunity?.forgone,
      `差 ${gap.toFixed(1)} が無機会減点 ${quiet.no_opportunity?.forgone} を超えた —— 別の原因が混ざっている`);
  });

  ok('**VDC は無機会に入れない**（契約0本は「機会が無かった」ではない）', () => {
    assert(quiet.components.vdc.n > 0, '出荷が0だと前提が崩れる');
    assert(quiet.components.vdc.points === 0, 'VDC が0点でない');
    assert(!(quiet.no_opportunity?.items ?? []).some((x) => x.id.startsWith('vdc')),
      '**契約を書いていないことが免除されている**');
  });

  ok('反実仮想は素点を分母から割り戻した値', () => {
    const n = quiet.no_opportunity ?? {};
    assert(Math.abs(n.normalized - (quiet.raw / (100 - n.forgone)) * 100) < 1e-9,
      `割り戻しが合わない: ${n.normalized}`);
    assert(broken.no_opportunity?.normalized > broken.raw, '分母が減れば反実仮想は素点より上');
  });

  ok('分母が全部あれば反実仮想は素点と同じ', () => {
    const s2 = score({ ...brokenBase, actions: { actions: [{ force_owner: 'human' }] } });
    assert(s2.no_opportunity?.forgone === 0, `まだ分母が欠けている: ${JSON.stringify(s2.no_opportunity?.items)}`);
    assert(s2.no_opportunity?.normalized === s2.raw, '素点と一致していない');
    assert(s2.no_opportunity?.note === null, '穴が無いのに注記が出ている');
  });

  ok('**無機会減点があるのに注記が無ければ検査が落ちる**', () => {
    const p2 = check({ ...quiet, no_opportunity: { forgone: 9, items: [], note: null } }, P, { blindness: [] });
    assert(p2.some((x) => x.includes('無機会')), `落ちなかった: ${JSON.stringify(p2)}`);
  });

  // --- 据え置き（窓内に分母が無い成分に、最後に測れた率を当てる）---
  //
  // **実データでは不発**（いまの窓には故障が12件ある）。合成でしか固定できないので、
  // 「効いている」「効いていない」の両側を検体で押さえる。
  const priorFails = [];
  for (let i = 0; i < 4; i += 1) {
    const d = `2026-08-${String(20 + i).padStart(2, '0')}`;
    priorFails.push({ run_id: `o${i}`, date_jst: d, outcome: 'failed', failure_stage: 'execution',
      interventions: [], source: i === 0 ? 'session' : 'act-reconcile',
      failed_at: `${d}T00:00:00Z`, detected_at: `${d}T01:00:00Z` });
    if (i >= 2) priorFails.push(ship(`o${i}-fix`,
      { date_jst: d, lane: 'F', action: 'refresh', repair_of: [`o${i}`], pr: 700 + i }));
  }
  const carryBase = { ...quietBase, runsDoc: { runs: [...priorFails, ...quietBase.runsDoc.runs] } };
  const carried = score(carryBase);

  eq(carried.carried?.items?.map((x) => x.id), ['ra.detect', 'ra.recover', 'ep.miss'],
     '**窓の外の直近3件から据え置く**');
  eq(Number(carried.total.toFixed(4)), 59.1667, '据え置きが効いた合計（据え置き前は 35.0）');
  eq(score(quietBase).total, 35, '窓の外にも故障が無ければ据え置かない（**測ったことが無いなら 0 のまま**）');

  ok('**据え置きは印を残す**（measured_at / rate / share / n）', () => {
    for (const x of carried.carried.items) {
      assert(x.measured_at && Number.isFinite(x.rate) && Number.isFinite(x.share) && Number.isFinite(x.n),
        `印が欠けている: ${JSON.stringify(x)}`);
    }
    assert(carried.components.ra.detect.carried, 'ra.detect に印が無い');
    assert(String(carried.components.ra.detect.why).includes('据え置いた'),
      '据え置いたことが本文に出ていない');
  });

  ok('**符号を逆にしない** — EP の見逃しは率が低いほど点が高い', () => {
    // [2026-09-05] 初版は `points = max × rate` を全成分に当てていて、
    // **見逃し率0（＝一度も遅れていない）が 0 点**になっていた。成分ごとに取り分で当てる。
    const miss = carried.components.ep.miss;
    assert(miss.rate === 0, `検体の見逃し率が 0 でない: ${miss.rate}`);
    assert(miss.points === 7.5, `見逃し率0なのに ${miss.points} 点 —— 符号が逆`);
  });

  ok('**期限を過ぎた率は持ち回らない**', () => {
    const late = { ...carryBase, today: '2026-11-30', runsDoc: { runs: [...priorFails,
      ...Array.from({ length: 28 }, (_, i) => ship(`r${i}`, { date_jst: `2026-11-${String(i + 3).padStart(2, '0')}`, lane: 'C', pr: 200 + i }))] } };
    const s2 = score(late);
    assert(s2.carried.items.length === 0, `期限切れなのに据え置いた: ${JSON.stringify(s2.carried.items)}`);
    assert(s2.carried.skipped.length === 3, `理由が残っていない: ${JSON.stringify(s2.carried.skipped)}`);
    assert(s2.total === 35, `0 に戻っていない: ${s2.total}`);
  });

  ok('**分母が足りなければ据え置かない**（min_denominator）', () => {
    const thin = { ...carryBase, runsDoc: { runs: [priorFails[0], priorFails[2], ...quietBase.runsDoc.runs] } };
    const s2 = score(thin);
    assert(s2.carried.items.length === 0, `2件で据え置いた: ${JSON.stringify(s2.carried.items)}`);
    assert(s2.carried.skipped.some((x) => x.why.includes('測ったことが無い')), '理由が違う');
  });

  ok('据え置きを切れば 0 に戻る', () => {
    const off = structuredClone(P); off.carry_forward.enabled = false;
    const s2 = score({ ...carryBase, policy: off });
    assert(s2.carried.enabled === false, '無効化が効いていない');
    assert(s2.total === 35, `据え置きが残っている: ${s2.total}`);
  });

  ok('**据え置いた成分は無機会減点から外れる**', () => {
    eq(carried.no_opportunity.items.map((x) => x.id), ['ep.precision'], '');
    assert(carried.no_opportunity.forgone === 7.5, `二重に数えている: ${carried.no_opportunity.forgone}`);
  });

  ok('**VDC / UMR / TUC には当てない**', () => {
    for (const id of ['vdc', 'umr', 'tuc']) {
      assert(!carried.components[id].carried, `${id} に据え置きが当たっている`);
    }
    assert(carried.components.vdc.points === 0, 'VDC が据え置きで動いた');
  });

  ok('**applies_to に無い成分は据え置かない**（対象は台帳が決める）', () => {
    const only = structuredClone(P); only.carry_forward.applies_to = ['ra.detect'];
    const s2 = score({ ...carryBase, policy: only });
    eq(s2.carried.items.map((x) => x.id), ['ra.detect'], '');
    assert(!s2.components.ra.recover.carried, 'applies_to に無い ra.recover が据え置かれた');
    assert(!s2.components.ep.miss.carried, 'applies_to に無い ep.miss が据え置かれた');
  });

  ok('**据え置きは窓の外からだけ拾う**（窓内の行を混ぜない）', () => {
    // ep.miss は「時刻を持つ故障」が分母なので、**時刻の無い故障だけがある窓**では
    // ra.n > 0 のまま ep.miss.n === 0 になる。ここで窓内も拾うと、
    // 「窓の中で測れなかったもの」を据え置きの標本に混ぜてしまう。
    const timeless = Array.from({ length: 3 }, (_, i) => ({ run_id: `t${i}`,
      date_jst: `2026-09-${String(10 + i).padStart(2, '0')}`, outcome: 'failed',
      failure_stage: 'execution', interventions: [], source: 'session' }));
    const s2 = score({ ...carryBase,
      runsDoc: { runs: [...priorFails, ...timeless, ...quietBase.runsDoc.runs] } });
    assert(s2.components.ra.n === 3, `前提が崩れた（窓内の故障 ${s2.components.ra.n} 件）`);
    assert(s2.components.ep.miss.n === 0, '前提が崩れた（窓内に時刻つき故障がある）');
    const item = s2.carried.items.find((x) => x.id === 'ep.miss');
    assert(item, 'ep.miss が据え置かれていない');
    assert(item.measured_at === '2026-08-23',
      `窓内の行を混ぜている（measured_at=${item.measured_at}・窓の外の最新は 2026-08-23）`);
    assert(!s2.carried.items.some((x) => x.id.startsWith('ra.')),
      '窓内に故障があるのに RA を据え置いた');
  });

  ok('**未来日付の行を「最後に測れた率」にしない**', () => {
    // 窓は [w.from, today] なので、today より後の行はどちらにも入らない。
    // ここを「窓の外＝window より前」ではなく「全期間」で拾うと、
    // **まだ起きていない日付の行が、いまの能力の証拠になってしまう。**
    const future = Array.from({ length: 3 }, (_, i) => ({ run_id: `f${i}`,
      date_jst: `2026-10-${String(5 + i).padStart(2, '0')}`, outcome: 'failed',
      failure_stage: 'execution', interventions: [], source: 'act-reconcile',
      failed_at: `2026-10-0${5 + i}T00:00:00Z`, detected_at: `2026-10-0${5 + i}T01:00:00Z` }));
    const s2 = score({ ...quietBase, runsDoc: { runs: [...future, ...quietBase.runsDoc.runs] } });
    assert(s2.components.ra.n === 0, `前提が崩れた（窓内の故障 ${s2.components.ra.n} 件）`);
    assert(s2.carried.items.length === 0,
      `未来の行から据え置いた: ${JSON.stringify(s2.carried.items)}`);
    assert(s2.total === 35, `点が入っている: ${s2.total}`);
  });

  ok('**印の無い据え置きは検査が落とす**', () => {
    const faked = structuredClone(carried);
    faked.components.ra.carried = [{ rate: 1 }];   // measured_at も n も無い
    const p2 = check(faked, P, { blindness: [] });
    assert(p2.some((x) => x.includes('measurable=false')), `落ちなかった: ${JSON.stringify(p2.slice(0, 3))}`);
  });

  ok('実データのポリシーが検査を通る', () => {
    const ctx = loadContext();
    const p = check(score(ctx), ctx.policy, { blindness: rankerBlindness(ctx.policy) });
    assert(p.length === 0, `実データで ${p.length} 件: ${p.slice(0, 3).join(' / ')}`);
  });

  console.log(bad ? `\n${bad}/${n} 失敗` : `selftest: ${n}/${n} 通過`);
  return bad;
}

// --- CLI ------------------------------------------------------------------
const pct = (x) => (x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const pts = (x, m) => `${x.toFixed(1)} / ${m}`;

function render(s) {
  const c = s.components;
  const L = [];
  L.push(`\n自律スコア  ${s.total.toFixed(1)} / ${s.max}`
    + `   （窓 ${s.window.from} → ${s.window.to} ・ ${s.window.days} 日${s.window.truncated ? '' : '・台帳の全期間'}）\n`);
  if (s.held) L.push(`  ⚠ ${s.held_why}\n`);
  L.push(`  検証済み決定被覆率 VDC  ${pts(c.vdc.points, c.vdc.max)}   ${pct(c.vdc.rate)}  (${c.vdc.hit}/${c.vdc.n} 出荷)`);
  if (c.vdc.why) L.push(`      ${c.vdc.why}`);
  if (s.metrics) {
    L.push(`      指標の許可リスト: A ${s.metrics.by_tier.A} / B ${s.metrics.by_tier.B} / C ${s.metrics.by_tier.C}`
      + `  —— **契約に使えるのは承認済みの ${s.metrics.approved} 件**（起案は承認ではない）`);
  }
  L.push(`  無検査マージ率     UMR  ${pts(c.umr.points, c.umr.max)}   ${pct(c.umr.rate)}  (重み ${c.umr.weight_counted}/${c.umr.weight_total}・出荷 ${c.umr.n})`);
  for (const [k, v] of Object.entries(c.umr.by_class)) {
    L.push(`      ${k}  ${v.hands_off}/${v.n} 無介入  （重み ${v.hands_off_weight}/${v.weight}）`);
  }
  if (c.umr.r0_capped) L.push(`      ⚠ **R0 の寄与が上限に当たっている** — 可逆で些末な変更の量産では伸びない`);
  L.push(`  復旧自律性         RA   ${pts(c.ra.points, c.ra.max)}   (故障 ${c.ra.n} 件)`);
  L.push(`      検知  ${pts(c.ra.detect.points, c.ra.detect.max)}  ${pct(c.ra.detect.rate)}  (${c.ra.detect.hit}/${c.ra.n} を機械が検知${c.ra.detect.beaten_by_dispatch ? `・先を越された ${c.ra.detect.beaten_by_dispatch}` : ''})`);
  if (c.ra.detect.why) L.push(`            ${c.ra.detect.why}`);
  L.push(`      復旧  ${pts(c.ra.recover.points, c.ra.recover.max)}  ${pct(c.ra.recover.rate)}  (${c.ra.recover.hit}/${c.ra.n} を人手なしで復旧)`);
  L.push(`      自動 revert ${c.ra.auto_revert_count} 回  ← **Phase 6 のハードゲート。点数では代替しない**`);
  L.push(`  エスカレーション精度 EP ${pts(c.ep.points, c.ep.max)}`);
  L.push(`      見逃し ${pts(c.ep.miss.points, c.ep.miss.max)}  ${c.ep.miss.rate === null ? 'n/a' : `遅延 ${c.ep.miss.late}/${c.ep.miss.n}`}`);
  L.push(`             ${c.ep.miss.why}`);
  L.push(`      精度   ${pts(c.ep.precision.points, c.ep.precision.max)}  ${c.ep.precision.why ?? `${c.ep.precision.judged}/${c.ep.precision.n} 判定済み（人の判定）`}`);
  L.push(`  制約下スループット TUC  ${pts(c.tuc.points, c.tuc.max)}   週 ${c.tuc.per_week.toFixed(1)} 出荷 / 目標 ${c.tuc.target}`);
  L.push(`\n  検査被覆率  ${s.coverage.demonstrated}/${s.coverage.total} 本が「壊すと落ちる」ことを実測済み`);
  L.push(`  ${s.excluded.failure_rate}`);
  // **穴を、開いている窓でだけ言う。**閉じている窓で毎回出すと、注記が背景になる。
  const nop = s.no_opportunity;
  if (nop?.forgone > 0) {
    L.push(`\n  ⚠ 無機会減点 ${nop.forgone} 点  （${nop.items.map((x) => `${x.id}: ${x.why}`).join(' / ')}）`);
    L.push(`     ${nop.note}`);
    L.push(`     参考: 分母の無い成分を分母から外すと ${nop.normalized.toFixed(1)} —— **これはスコアではない**`);
  }
  const cf = s.carried;
  if (cf?.items?.length) {
    L.push(`\n  据え置き ${cf.items.length} 件  （窓内に分母が無いので、最後に測れた率を当てている）`);
    for (const x of cf.items) {
      L.push(`     ${x.id.padEnd(11)} ${(x.share * 100).toFixed(1).padStart(5)}%  ${x.measured_at} までの ${x.n} 件（${x.age_days} 日前）`);
    }
    L.push(`     **この窓で測り直したものではない。**期限（${cf.max_age_days} 日）を過ぎれば 0 に戻る`);
  }
  for (const x of cf?.skipped ?? []) L.push(`  据え置かなかった: ${x.id} — ${x.why}`);
  if (cf?.enabled && !cf.items.length && !cf.skipped.length) {
    L.push(`  据え置き方針は有効（窓内に分母が在るので出番なし）— **故障が無い月に点が下がる形を、${cf.max_age_days} 日を上限に打ち消す**`);
  }
  L.push(`\n  **この数字は人間向けの計器で、ranker には見せていない。**`);
  L.push(`  併記: 総合自動化率（タスク被覆率）は scripts/automation-rate.mjs。`);
  L.push(`  片方が伸びてもう片方が伸びないことに意味があるので、乗り換えない。\n`);
  return L.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  if (has('selftest')) process.exit(selftest() === 0 ? 0 : 1);

  const ctx = loadContext();
  const s = score(ctx);

  // `--write` は `--snapshot` の別名。**別名を置く理由は網に入るため** ——
  // check-generators.mjs の走査は `argv.includes('--write')` の形しか拾わず、
  // `--snapshot` だけだと**書き手として台帳に載らない。**
  if (has('snapshot') || argv.includes('--write')) {
    const doc = fs.existsSync(HISTORY_PATH) ? readJson(HISTORY_PATH) : { $comment: [], snapshots: [] };
    const row = {
      at: s.generated_jst, window: s.window, total: s.total, raw: s.raw, held: s.held,
      coverage: s.coverage,
      components: Object.fromEntries(Object.values(s.components).map((c) => [c.id, { points: c.points, rate: c.rate }])),
    };
    doc.snapshots = [...(doc.snapshots || []).filter((x) => x.at !== row.at), row].sort((a, b) => a.at.localeCompare(b.at));
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(doc, null, 2) + '\n');
    console.log(`履歴に ${row.at} を書いた（合計 ${doc.snapshots.length} 点）`);
    process.exit(0);
  }

  if (has('json')) { console.log(JSON.stringify(s, null, 2)); process.exit(0); }

  if (has('check')) {
    const problems = check(s, ctx.policy, { blindness: rankerBlindness(ctx.policy) });
    if (problems.length) {
      console.error('自律スコア:');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`自律スコア: ${s.total.toFixed(1)}/${s.max}・配点と分類の網羅に問題なし。`);
    process.exit(0);
  }

  console.log(render(s));
}
