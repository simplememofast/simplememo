#!/usr/bin/env node
/**
 * L1 適格性ゲート — 「そのタスクは、着手して**よい**ものか」を実行前に判定する。
 *
 *   node scripts/autonomy-eligibility.mjs              # 判定を表示
 *   node scripts/autonomy-eligibility.mjs --json       # 機械可読
 *   node scripts/autonomy-eligibility.mjs --write      # data/eligibility-log.json へ追記
 *   node scripts/autonomy-eligibility.mjs --check      # CI
 *   node scripts/autonomy-eligibility.mjs --selftest   # 検査そのものの自己検査
 *
 * 【なぜ要るか】
 * この運用の反証器は L0（実装）にしかない。81本のCI検査が落ちれば run が死に、
 * 失敗ログが翌朝の入力になる —— **しかしそれは「選ばれたものをどう作るか」しか見ていない。**
 * 「そのタスクは着手してよいものか」は、一度も機械に判定されたことがない。
 *
 * 2026-09-04 に運転台帳へ failure_stage を入れて数えたところ、出荷しなかった 23 行は
 * **適格性 12 / 実行 6 / コスト 3 / 経路不在 2** に分かれた。適格性が最大の層である。
 * にもかかわらず、その 12 件の判定は「秘密鍵が在るか」しか見ていない。
 *
 * 【止めるものと止めないもの】
 * data/eligibility-policy.json の enforcement が決める。2026-09-04 の設定は
 * `record_plus_r2_block` —— **R2（不可逆）だけ止め、他は判定だけを残す。**
 * 閾値の初期値が外れていた場合に翌朝から出荷が止まるのを避けるための順序であって、
 * 「他の基準は飾り」という意味ではない。1周まわして分布を見てから倒す。
 *
 * 【いちばん重要な一点】
 * ここで落ちた候補は、**L0 の失敗ログとは別のテーブルに書く**（data/eligibility-log.json）。
 * これだけで「死んだ run は選択ミスか実行ミスか」が、明日から機械的に答えられる問いに変わる。
 * いま答えられないのは、両方が同じ「失敗」として記録されているからにすぎない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run as runScenarios } from './lib/selftest.mjs';
import { OWNER_ONLY_FILES } from './autonomy-score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = path.join(ROOT, 'data/eligibility-policy.json');
export const LOG_PATH = path.join(ROOT, 'data/eligibility-log.json');
export const SCORE_POLICY_PATH = path.join(ROOT, 'data/autonomy-score.json');
export const ACTIONS_PATH = path.join(ROOT, 'data/autopilot-actions.json');
export const AUTHORITY_PATH = path.join(ROOT, 'data/authority-matrix.json');
export const ROUTING_PATH = path.join(ROOT, 'data/model-routing.json');
export const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');

export const VERDICTS = ['eligible', 'escalate_l4', 'ineligible_recorded'];
export const CRITERIA = ['reversibility', 'boundedness', 'evidence_age', 'budget', 'repeat_guard'];
/** 各基準の結果。**unknown を pass に丸めない** —— 判定できなかったことを異常なしと言わない。 */
export const RESULTS = ['pass', 'fail', 'unknown'];

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** glob（`**` と `*` だけ）。許可リストはこれ以上の表現力を持たせない —— 読めなくなる。 */
export function matchesGlob(pattern, p) {
  const rx = pattern
    .split('**').map((seg) => seg.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
    .join('.*');
  return new RegExp(`^${rx}$`).test(p);
}

/** 権限表を参照する擬似トークン（`@authority:self_repair.may_modify`）を解決する。 */
export function resolveScope(spec, { authority }) {
  if (typeof spec !== 'string') return spec;
  const m = /^@authority:(.+)$/.exec(spec);
  if (!m) return [spec];
  const got = m[1].split('.').reduce((o, k) => (o == null ? o : o[k]), authority);
  // **解決できないトークンを空配列に丸めない。**空にすると「何も許可されていない」ではなく
  // 「全部落ちる」になり、権限表のキー名を打ち間違えた日に全候補が不適格として並ぶ。
  if (!Array.isArray(got)) throw new Error(`許可リストの参照 "${spec}" が権限表で解決できない`);
  return got;
}

// ── 可逆性クラス ───────────────────────────────────────────────
/**
 * 候補の可逆性クラス（R0/R1/R2）を引く。**引けなければ null を返す。**
 * 引き順は「宣言 → 領域 → レーン → 触るパス」。上のものほど具体的。
 */
export function classOf(candidate, { scorePolicy }) {
  // A declaration cannot downgrade an irreversible domain.
  const domain = (scorePolicy.domain_class || []).find((d) => d.domain === candidate.domain);
  if (domain?.class === 'R2') return { class: 'R2', source: `domain:${candidate.domain}` };
  if (candidate.reversibility_class) {
    return { class: ['R0', 'R1', 'R2'].includes(candidate.reversibility_class) ? candidate.reversibility_class : null, source: 'declared' };
  }
  if (candidate.domain) {
    const row = (scorePolicy.domain_class || []).find((d) => d.domain === candidate.domain);
    if (row) return { class: row.class, source: `domain:${candidate.domain}` };
  }
  const lane = candidate.lane;
  if (lane) {
    const byLane = scorePolicy.lane_action_class?.by_lane?.[lane];
    if (byLane) {
      const act = candidate.action === 'new' ? 'new' : 'refresh';
      return { class: byLane[act], source: `lane:${lane}/${act}` };
    }
  }
  const touches = candidate.touches || [];
  if (touches.length) {
    // scripts / data / ワークフローだけを触るなら単一の revert で戻る。
    const local = touches.every((t) => /^(scripts|data|\.github)\//.test(t));
    if (local) return { class: 'R0', source: 'touches:repo-internal' };
    // 公開面の HTML を触るなら索引が絡む。
    if (touches.some((t) => /\.html$/.test(t))) return { class: 'R1', source: 'touches:published-html' };
  }
  return { class: null, source: null };
}

// ── 予測コスト ────────────────────────────────────────────────
/** 種別ごとの実測中央値。**n を一緒に返す** —— 1件の中央値を中央値と呼ばない。 */
export function medianCost(costDoc, kind) {
  const xs = (costDoc?.runs || [])
    .filter((r) => r.task_kind === kind && typeof r.total_cost_usd === 'number')
    .map((r) => r.total_cost_usd).sort((a, b) => a - b);
  if (!xs.length) return { median: null, n: 0 };
  const m = Math.floor(xs.length / 2);
  return { median: xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2, n: xs.length };
}

export function predictCost(candidate, { policy, costDoc }) {
  if (typeof candidate.predicted_usd === 'number') {
    return { usd: candidate.predicted_usd, source: 'declared' };
  }
  // auto ハンドラは決定論的な node スクリプトで、モデル呼び出しが無い。
  if (candidate.auto) return { usd: 0, source: 'derived_auto_handler' };
  const kind = candidate.lane ? (policy.kind_of?.by_lane?.[candidate.lane] ?? policy.kind_of?.default)
                              : (candidate.kind ?? policy.kind_of?.default);
  const { median, n } = medianCost(costDoc, kind);
  if (median === null) return { usd: null, source: null, kind };
  return { usd: median, source: 'derived_median', kind, n };
}

/**
 * 触るパス全部を収める許可リストを探す。**推測でスコープを決めない。**
 *
 * アクション台帳は「誰が実行するか」を持っていないので、こちらでレーンから
 * 推測すると、**推測が外れた候補が『境界の外』として並ぶ。**実際 2026-09-04 の
 * 初回実行で、scripts/*.py と data/*.json を触る監査タスクが actuator スコープに
 * 割り当てられて落ちた —— 落ちる理由が候補側ではなく判定側にあった。
 *
 * 宣言があればそれを使い、無ければ**全部を収めるスコープのうち最も狭いもの**を採る。
 * どれにも収まらなければ fail。これなら「本当に範囲外のパス」だけが落ちる。
 */
export function fitScope(touches, scopes = {}, { authority, declared = null } = {}) {
  const resolved = Object.entries(scopes)
    .filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, resolveScope(v, { authority })]);
  const covers = ([, allow]) => touches.every((t) => allow.some((g) => matchesGlob(g, t)));
  if (declared) {
    const hit = resolved.find(([k]) => k === declared);
    if (!hit) return { scope: null, source: 'declared', outside: touches };
    return covers(hit)
      ? { scope: declared, source: 'declared', outside: [] }
      : { scope: null, source: 'declared', outside: touches.filter((t) => !hit[1].some((g) => matchesGlob(g, t))) };
  }
  const fitting = resolved.filter(covers).sort((a, b) => a[1].length - b[1].length);
  if (fitting.length) return { scope: fitting[0][0], source: 'inferred', outside: [] };
  // どれにも収まらない。**どのスコープから見ても外れているパス**を名指しする。
  const outside = touches.filter((t) => !resolved.some(([, allow]) => allow.some((g) => matchesGlob(g, t))));
  return { scope: null, source: 'inferred', outside: outside.length ? outside : touches };
}

/**
 * 候補が引用しているデータ点。**記帳と観測を分ける。**
 *   declared          … 候補が evidence_date を持っている
 *   machine_observed  … 機械が判定できる close 条件を持つ（＝毎回その条件を見直している）
 *   ledger_bookkeeping… last_seen_jst しか無い。台帳を回した記録であって観測ではない
 */
export function evidenceOf(candidate) {
  if (candidate.evidence_date) return { date: candidate.evidence_date, source: 'declared' };
  const machineChecked = candidate.close_check_kind && candidate.close_check_kind !== 'manual';
  if (candidate.last_seen_jst) {
    return { date: candidate.last_seen_jst, source: machineChecked ? 'machine_observed' : 'ledger_bookkeeping' };
  }
  return { date: null, source: null };
}

// ── 判定本体 ──────────────────────────────────────────────────
/**
 * 1候補を5基準で判定する。**純関数。**台帳もファイルも読まない。
 * ctx: { policy, scorePolicy, authority, routing, costDoc, today, priorJudgements }
 */
export function judge(candidate, ctx) {
  const { policy, scorePolicy, authority, routing, costDoc, today,
          ownerOnly = OWNER_ONLY_FILES } = ctx;
  const c = policy.criteria;
  const criteria = {};
  const reasons = [];
  const put = (name, result, why, extra = {}) => {
    criteria[name] = { result, why, ...extra };
    if (result !== 'pass') reasons.push(`${name}: ${why}`);
  };

  // 1. 可逆性
  const cls = classOf(candidate, { scorePolicy });
  if (!c.reversibility?.enabled) put('reversibility', 'pass', '基準が無効');
  else if (cls.class === null) {
    put('reversibility', 'unknown',
      candidate.auto
        ? '**auto ハンドラを持つのに可逆性クラスが引けない**（domain も lane も touches も無い）'
        : '可逆性クラスが引けない（domain も lane も touches も無い）',
      { class: null });
  } else if ((c.reversibility.block_classes || []).includes(cls.class)) {
    put('reversibility', 'fail', `${cls.class}（不可逆）— ループは触らない。${c.reversibility.escalate_to} へ上げる`,
      { class: cls.class, class_source: cls.source });
  } else {
    put('reversibility', 'pass', `${cls.class}`, { class: cls.class, class_source: cls.source });
  }

  // 2. 変更境界
  if (!c.boundedness?.enabled) put('boundedness', 'pass', '基準が無効');
  else if (candidate.outside_repo) {
    put('boundedness', 'fail', '**リポジトリの外**を触る候補は、パス許可リストで境界を判定できない');
  } else {
    const touches = candidate.touches || [];
    const cap = c.boundedness.max_touch_paths ?? Infinity;
    if (!touches.length) put('boundedness', 'unknown', '触るパスが宣言されていない（範囲外かどうかを判定できない）');
    else if (touches.some((p) => typeof p !== 'string' || p.startsWith('/') || p.includes('\\') || p.split('/').some((s) => s === '..' || s === '.'))) {
      put('boundedness', 'fail', '正規化されたリポジトリ相対パスが必要');
    }
    else if (touches.length > cap) put('boundedness', 'fail', `触るパスが ${touches.length} 件（上限 ${cap}）`);
    else {
      // **オーナー所有のファイルは、どのスコープにも属さない。**
      //
      // [2026-09-05 実測] `content` の許可リストに `data/*.json` があるので、
      // **採点の重み（data/autonomy-score.json）・この門自身の基準
      // （data/eligibility-policy.json）・指標の承認（data/value-metrics.json）が
      // すべて「収まる」と判定されていた。**`policyOwnership()` は
      // `self_repair.may_modify` の側だけを見張っていて、**こちらの扉は開いていた。**
      //
      // 見張りが1枚あることは、入口が1つであることを意味しない。
      // 正は autonomy-score.mjs の OWNER_ONLY_FILES（コード側）に置く ——
      // 台帳側に写しを置くと、その台帳自身が書き換え対象になったときに一緒に緩む。
      const ownerOwned = touches.filter((t) => ownerOnly.includes(t));
      if (ownerOwned.length) {
        put('boundedness', 'fail', `**オーナー所有のファイルは候補の範囲に入れられない**: ${ownerOwned.join(', ')}`
          + ' — 自分の採点や、自分を判定する門を、自分で書き換える候補を作らない',
          { scope: null, scope_source: 'owner_only' });
      } else {
      const fit = fitScope(touches, c.boundedness.scopes, { authority, declared: candidate.scope });
      if (!fit.scope) {
        put('boundedness', 'fail', `どの許可リストにも収まらない: ${fit.outside.join(', ')}`,
          { scope: null, scope_source: fit.source });
      } else {
        put('boundedness', 'pass', `${touches.length} パス・${fit.scope} の範囲内`,
          { scope: fit.scope, scope_source: fit.source });
      }
      }
    }
  }

  // 3. 証拠の鮮度
  if (!c.evidence_age?.enabled) put('evidence_age', 'pass', '基準が無効');
  else {
    const max = c.evidence_age.max_days;
    const ev = evidenceOf(candidate);
    if (!ev.date) {
      put('evidence_age', 'fail', '**データ点を1つも引用していない**（思いついただけの候補を殺す基準）');
    } else if (ev.source === 'ledger_bookkeeping') {
      // **`last_seen_jst` は機械の観測とは限らない。**close_check が manual の候補では、
      // あの欄は台帳を回したセッションの記帳であって、条件をもう一度見た証拠ではない。
      // pass に丸めると「毎日走るから毎日新鮮」になり、この基準は永久に発火しない。
      put('evidence_age', 'unknown',
        `引用されたデータ点が無い（last_seen_jst は台帳の記帳で、機械が条件を見直した記録ではない）`,
        { age_days: daysBetween(ev.date, today), evidence_source: ev.source });
    } else {
      const age = daysBetween(ev.date, today);
      if (age === null || age < 0) put('evidence_age', 'fail', '証拠の日付が不正または未来');
      else if (age > max) put('evidence_age', 'fail', `最後に条件を見たのが ${age} 日前（上限 ${max} 日）`,
        { age_days: age, evidence_source: ev.source });
      else put('evidence_age', 'pass', `${age} 日前の観測（${ev.source}）`,
        { age_days: age, evidence_source: ev.source });
    }
  }

  // 4. 予算
  if (!c.budget?.enabled) put('budget', 'pass', '基準が無効');
  else {
    const pred = predictCost(candidate, { policy, costDoc });
    const kind = pred.kind ?? candidate.kind ?? policy.kind_of?.default;
    const cap = routing?.rules?.[kind]?.max_usd_per_run ?? null;
    if (pred.usd === null) {
      put('budget', 'unknown', '**予測コストが記録されていない**（後で予測そのものを較正できない）', { kind });
    } else if (cap !== null && pred.usd > cap) {
      put('budget', 'fail', `予測 $${pred.usd.toFixed(4)} > 上限 $${cap}（${kind}）`,
        { predicted_usd: pred.usd, cap_usd: cap, kind, prediction_source: pred.source });
    } else {
      put('budget', 'pass', `予測 $${pred.usd.toFixed(4)}（${pred.source}${cap !== null ? ` / 上限 $${cap}` : ''}）`,
        { predicted_usd: pred.usd, cap_usd: cap, kind, prediction_source: pred.source });
    }
  }

  // 5. 重複ガード
  if (!c.repeat_guard?.enabled) put('repeat_guard', 'pass', '基準が無効');
  else {
    const w = c.repeat_guard.window_days;
    const born = candidate.created_jst ?? null;
    const stuckDays = born ? daysBetween(born, today) : null;
    const executable = Boolean(candidate.auto) || Boolean(candidate.force_owner);
    if (stuckDays === null) put('repeat_guard', 'unknown', '候補がいつ立ったかを持っていない');
    else if (stuckDays > w && !executable) {
      put('repeat_guard', 'fail',
        `**${stuckDays} 日開いたまま、実行する主体も上げる先も決まっていない**（同じ壁に毎朝ぶつかっている）`,
        { open_days: stuckDays });
    } else put('repeat_guard', 'pass', `${stuckDays} 日（上限 ${w} 日 / 実行主体 ${executable ? 'あり' : '不要'}）`,
      { open_days: stuckDays });
  }

  // 判定。**止めるのは enforcement が許した範囲だけ。**
  const blockR2 = policy.enforcement === 'block' || policy.enforcement === 'record_plus_r2_block';
  const anyFail = CRITERIA.some((k) => criteria[k]?.result === 'fail');
  let verdict;
  if (criteria.reversibility?.result === 'fail' && blockR2) verdict = 'escalate_l4';
  else if (anyFail && policy.enforcement === 'block') verdict = 'ineligible_recorded';
  else if (anyFail) verdict = 'ineligible_recorded';
  else verdict = 'eligible';

  return {
    candidate_id: candidate.id,
    title: candidate.title ?? null,
    judged_jst: today,
    verdict,
    halted: verdict === 'escalate_l4' || (policy.enforcement === 'block' && CRITERIA.some((k) => criteria[k]?.result !== 'pass')),
    reversibility_class: criteria.reversibility?.class ?? null,
    criteria,
    reasons,
  };
}

/** アクション台帳の open な行を候補として読む。**閉じた行は判定しない。** */
export function candidatesFromActions(actionsDoc) {
  return (actionsDoc.actions || [])
    .filter((a) => a.state !== 'done')
    .map((a) => ({
      id: a.id, title: a.title, domain: a.domain, lane: a.lane ?? null, action: a.action ?? null,
      touches: a.touches ?? [], outside_repo: Boolean(a.outside_repo), auto: a.auto ?? null,
      force_owner: a.force_owner ?? null, created_jst: a.created_jst ?? null,
      last_seen_jst: a.last_seen_jst ?? null, predicted_usd: a.predicted_usd,
      close_check_kind: a.close_check?.kind ?? null, evidence_date: a.evidence_date ?? null,
      source_ledger: 'data/autopilot-actions.json',
    }));
}

export function judgeAll(candidates, ctx) {
  return candidates.map((c) => judge(c, ctx));
}

export function loadContext({ today = todayJst() } = {}) {
  return {
    policy: readJson(POLICY_PATH),
    scorePolicy: readJson(SCORE_POLICY_PATH),
    authority: readJson(AUTHORITY_PATH),
    routing: readJson(ROUTING_PATH),
    costDoc: readJson(COST_PATH),
    today,
  };
}

// ── 台帳の検査 ────────────────────────────────────────────────
/**
 * eligibility-log.json の形。**L0 の失敗ログとは別のテーブルであること**が要点なので、
 * ここで運転台帳の語彙（outcome / failure_class）が混ざっていたら落とす。
 */
export function validate(doc) {
  const problems = [];
  if (!doc || !Array.isArray(doc.judgements)) return ['judgements must be an array'];
  const seen = new Set();
  doc.judgements.forEach((j, i) => {
    const at = `judgements[${i}]${j.candidate_id ? ` (${j.candidate_id})` : ''}`;
    if (!j.candidate_id) problems.push(`${at}: candidate_id が無い`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j.judged_jst || '')) problems.push(`${at}: judged_jst は YYYY-MM-DD`);
    const key = `${j.candidate_id}@${j.judged_jst}`;
    if (seen.has(key)) problems.push(`${at}: 同じ候補を同じ日に2回書いている（${key}）`);
    else seen.add(key);
    if (!VERDICTS.includes(j.verdict)) problems.push(`${at}: verdict は ${VERDICTS.join('|')}（got ${JSON.stringify(j.verdict)}）`);
    if (j.verdict === 'escalate_l4' && j.halted !== true) {
      problems.push(`${at}: escalate_l4 なのに halted が true でない — **上げたのに止めていないなら、それは上げていない**`);
    }
    if ('outcome' in j || 'failure_class' in j) {
      problems.push(`${at}: 運転台帳の語彙（outcome / failure_class）が混ざっている`
        + ' — **適格性の棄却と実行の失敗を同じ表に書かないための台帳**なので、混ぜたら意味が消える');
    }
    for (const k of CRITERIA) {
      const r = j.criteria?.[k];
      if (!r) { problems.push(`${at}: 基準 ${k} の判定が無い`); continue; }
      if (!RESULTS.includes(r.result)) problems.push(`${at}: ${k}.result は ${RESULTS.join('|')}（got ${JSON.stringify(r.result)}）`);
      if (!r.why) problems.push(`${at}: ${k} に理由が無い — 理由の無い棄却は再現できない`);
    }
  });
  return problems;
}

/**
 * **何も見ていない基準**を名指しで出す。
 * 全候補で同じ値になる基準は、判定しているように見えて分岐が死んでいる。
 * このリポジトリが 2026-08-26 に5回踏んだ形（「判定できなかった」を「異常なし」と報告する）
 * の、実行前ゲート版。
 */
export function flatCriteria(judgements) {
  const flat = [];
  for (const k of CRITERIA) {
    const vals = new Set(judgements.map((j) => j.criteria?.[k]?.result));
    flat.push({ criterion: k, distinct: [...vals], flat: judgements.length > 1 && vals.size === 1 });
  }
  return flat;
}

export function summarize(judgements) {
  const byVerdict = {};
  for (const v of VERDICTS) byVerdict[v] = judgements.filter((j) => j.verdict === v).length;
  const byCriterion = {};
  for (const k of CRITERIA) {
    byCriterion[k] = { pass: 0, fail: 0, unknown: 0 };
    for (const j of judgements) {
      const r = j.criteria?.[k]?.result;
      if (r in byCriterion[k]) byCriterion[k][r] += 1;
    }
  }
  return {
    total: judgements.length,
    by_verdict: byVerdict,
    by_criterion: byCriterion,
    halted: judgements.filter((j) => j.halted).length,
    flat_criteria: flatCriteria(judgements).filter((x) => x.flat).map((x) => x.criterion),
  };
}

/** 同じ候補を同じ日に2回書かない（冪等）。 */
export function mergeJudgements(existing, fresh) {
  const key = (j) => `${j.candidate_id}@${j.judged_jst}`;
  const map = new Map(existing.map((j) => [key(j), j]));
  for (const j of fresh) map.set(key(j), j);
  return [...map.values()].sort((a, b) => (a.judged_jst === b.judged_jst
    ? String(a.candidate_id).localeCompare(String(b.candidate_id))
    : a.judged_jst.localeCompare(b.judged_jst)));
}

// ── 自己テスト ────────────────────────────────────────────────
const SELFTEST_BREAKAGES = [
  ['**verdict が未登録なら落ちる**', (d) => { d.judgements[0].verdict = 'たぶん大丈夫'; }],
  ['基準の判定が欠けたら落ちる', (d) => { delete d.judgements[0].criteria.budget; }],
  ['基準の result が未登録なら落ちる', (d) => { d.judgements[0].criteria.budget.result = 'まあまあ'; }],
  ['理由の無い判定は落ちる', (d) => { delete d.judgements[0].criteria.budget.why; }],
  ['**運転台帳の語彙が混ざったら落ちる**（適格性と実行を同じ表に書かない）',
    (d) => { d.judgements[0].failure_class = 'usage_limit'; }],
  ['同じ候補を同じ日に2回書いたら落ちる', (d) => { d.judgements.push({ ...d.judgements[0] }); }],
  ['**escalate_l4 なのに止めていないのは落ちる**',
    (d) => { d.judgements[0].verdict = 'escalate_l4'; d.judgements[0].halted = false; }],
  ['judged_jst の形が違えば落ちる', (d) => { d.judgements[0].judged_jst = '2026/09/04'; }],
];

function selftest() {
  let n = 0, bad = 0;
  const eq = (got, want, msg) => {
    n += 1;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      bad += 1; console.error(`  ✗ ${msg}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
    }
  };
  const ok = (name, fn) => { n += 1; try { fn(); } catch (e) { bad += 1; console.error(`  ✗ ${name}\n      ${e.message}`); } };

  // --- glob ---
  eq(matchesGlob('data/*.json', 'data/a.json'), true, '* は1階層に当たる');
  eq(matchesGlob('data/*.json', 'data/x/a.json'), false, '**`*` は `/` を跨がない**（跨ぐと許可リストが無意味になる）');
  eq(matchesGlob('growth/**', 'growth/content/a/b.md'), true, '** は階層を跨ぐ');
  eq(matchesGlob('*.html', 'index.html'), true, 'ルート直下の html');
  eq(matchesGlob('*.html', 'en/index.html'), false, 'ルート直下の指定は下層に当たらない');

  // --- 権限表の参照 ---
  const auth = { self_repair: { may_modify: ['scripts/a.mjs'] } };
  eq(resolveScope('@authority:self_repair.may_modify', { authority: auth }), ['scripts/a.mjs'], '権限表を引く');
  ok('**解決できない参照は例外**（空配列に丸めない）', () => {
    let threw = false;
    try { resolveScope('@authority:self_repair.ない', { authority: auth }); } catch { threw = true; }
    assert(threw, '打ち間違えたキーが「全部落ちる」として静かに通った');
  });

  // --- 可逆性クラス ---
  const scorePolicy = {
    domain_class: [{ domain: 'SNS投稿（X・TikTok）', class: 'R2' }, { domain: 'サイトコンテンツの新設・更新', class: 'R1' }],
    lane_action_class: { by_lane: { E: { new: 'R1', refresh: 'R0' }, F: { new: 'R0', refresh: 'R0' } } },
  };
  const cl = (c) => classOf(c, { scorePolicy }).class;
  eq(cl({ reversibility_class: 'R2' }), 'R2', '宣言が最優先');
  eq(cl({ domain: 'SNS投稿（X・TikTok）' }), 'R2', '領域から引く');
  eq(cl({ lane: 'E', action: 'new' }), 'R1', '**新設は R1**（索引された公開URLは revert で消えない）');
  eq(cl({ lane: 'E', action: 'refresh' }), 'R0', '更新は R0');
  eq(cl({ lane: 'F', action: 'new' }), 'R0', 'レーンFは新設でも R0');
  eq(cl({ touches: ['scripts/a.mjs', 'data/b.json'] }), 'R0', 'リポジトリ内部だけなら R0');
  eq(cl({ touches: ['obsidian/x/index.html'] }), 'R1', '公開HTMLを触れば R1');
  eq(cl({}), null, '**引けないものを勝手に決めない**');

  // --- 判定 ---
  const policy = {
    enforcement: 'record_plus_r2_block',
    criteria: {
      reversibility: { enabled: true, block_classes: ['R2'], escalate_to: 'L4' },
      boundedness: { enabled: true, max_touch_paths: 3, scopes: { actuator: ['data/*.json'], content: ['*.html'], selfheal: '@authority:self_repair.may_modify' } },
      evidence_age: { enabled: true, max_days: 14 },
      budget: { enabled: true },
      repeat_guard: { enabled: true, window_days: 7 },
    },
    kind_of: { by_lane: { E: 'article', F: 'repair' }, default: 'analysis' },
  };
  const routing = { rules: { article: { max_usd_per_run: 10 }, analysis: { max_usd_per_run: 1.5 }, repair: { max_usd_per_run: 18 } } };
  const costDoc = { runs: [{ task_kind: 'article', total_cost_usd: 7 }, { task_kind: 'article', total_cost_usd: 9 }] };
  const ctx = { policy, scorePolicy, authority: auth, routing, costDoc, today: '2026-09-04' };
  const J = (over) => judge({ id: 'x', touches: ['data/a.json'], created_jst: '2026-09-03',
    last_seen_jst: '2026-09-04', close_check_kind: 'ledger_covers_runs', auto: 'h', ...over }, ctx);

  eq(J({}).verdict, 'eligible', '全部通れば適格');
  eq(J({ reversibility_class: 'R2' }).verdict, 'escalate_l4', '**R2 は止めて L4 へ上げる**');
  eq(J({ reversibility_class: 'R2' }).halted, true, '上げたら止まっている');
  eq(J({ reversibility_class: 'R1' }).verdict, 'eligible', 'R1 は止めない');
  eq(J({ last_seen_jst: '2026-08-01' }).verdict, 'ineligible_recorded',
     '**証拠が古い候補は不適格。ただし止めない**（enforcement が record_plus_r2_block）');
  eq(J({ last_seen_jst: '2026-08-01' }).halted, false, '止めていない');
  eq(J({ last_seen_jst: null }).criteria.evidence_age.result, 'fail',
     '**データ点を1つも引用していない候補は落とす**（思いつきを殺す基準）');
  eq(J({ close_check_kind: 'manual' }).criteria.evidence_age.result, 'unknown',
     '**close 条件が manual の候補では last_seen_jst は観測ではない**（台帳を回した記帳）');
  eq(J({ close_check_kind: 'manual', evidence_date: '2026-09-04' }).criteria.evidence_age.result, 'pass',
     '明示のデータ点を引用すれば通る');
  eq(J({ close_check_kind: 'manual', evidence_date: '2026-08-01' }).criteria.evidence_age.result, 'fail',
     '明示していても古ければ落とす');
  eq(evidenceOf({ last_seen_jst: '2026-09-04', close_check_kind: 'manual' }).source, 'ledger_bookkeeping',
     '記帳と観測を語で分ける');
  eq(evidenceOf({ last_seen_jst: '2026-09-04', close_check_kind: 'branch_caught_up' }).source, 'machine_observed',
     '機械が判定できる close 条件は観測');
  eq(J({ outside_repo: true }).criteria.boundedness.result, 'fail',
     '**リポジトリの外は unknown ではなく fail**（判定できない境界は、境界が無いのと同じ）');
  eq(J({ touches: [] }).criteria.boundedness.result, 'unknown', '触るパスが未宣言なら unknown');
  eq(J({ touches: ['data/a.json', 'data/b.json', 'data/c.json', 'data/d.json'] }).criteria.boundedness.result, 'fail',
     'パス数の上限を超えたら落とす');
  eq(J({ touches: ['src/secret.ts'] }).criteria.boundedness.result, 'fail', '許可リストの外は落とす');

  // --- オーナー所有のファイル（**門を、門で守られている側が書き換えられないようにする**）---
  //
  // [2026-09-05 実測] 実データの `content` は許可リストに `data/*.json` を持つので、
  // **採点の重み・この門自身の基準・指標の承認が、3つとも「収まる」と判定されていた。**
  // `policyOwnership()` は self_repair.may_modify の側だけを見張っていて、こちらは開いていた。
  const OWNED = ['data/autonomy-score.json', 'data/eligibility-policy.json', 'data/value-metrics.json'];
  const JO = (over) => judge({ id: 'x', touches: ['a.html'], reversibility_class: 'R0',
    evidence_date: '2026-09-04', predicted_usd: 1, created_jst: '2026-09-04', ...over },
    { policy, scorePolicy, authority: auth, routing, costDoc, today: '2026-09-04', ownerOnly: OWNED });
  for (const f of OWNED) {
    eq(JO({ touches: [f] }).criteria.boundedness.result, 'fail', `**${f} を候補の範囲に入れられない**`);
  }
  ok('**1つでも混ざれば落とす**（通るパスに紛れ込ませられない）', () => {
    // **許可リストが両方を覆う検体でないと、別の理由で落ちて通ってしまう。**
    // 初版は content:['*.html'] のままで混在を試したので、`data/autonomy-score.json` が
    // 「どのスコープにも収まらない」で落ちていた —— **検査が正しい理由で通っていなかった**
    // （変異試験③で発覚。08-26 の vendor-terms と同じ形）。
    const both = { ...policy, criteria: { ...policy.criteria,
      boundedness: { ...policy.criteria.boundedness, scopes: { content: ['*.html', 'data/*.json'] } } } };
    const mixed = { id: 'x', touches: ['a.html', 'data/autonomy-score.json'], reversibility_class: 'R0',
      evidence_date: '2026-09-04', predicted_usd: 1, created_jst: '2026-09-04' };
    const base = { policy: both, scorePolicy, authority: auth, routing, costDoc, today: '2026-09-04' };
    assert(judge(mixed, { ...base, ownerOnly: [] }).criteria.boundedness.result === 'pass',
      '前提が崩れている（所有権を外すと通るはずの検体）');
    const r = judge(mixed, { ...base, ownerOnly: OWNED });
    assert(r.criteria.boundedness.result === 'fail', `混ざっているのに通った: ${r.criteria.boundedness.why}`);
    assert(r.criteria.boundedness.scope_source === 'owner_only', '落ちた理由が所有権でない');
  });
  eq(JO({ touches: ['a.html'] }).criteria.boundedness.result, 'pass',
     '所有ファイルを触らない候補は通る（**塞いだせいで全部止まる、にしない**）');
  ok('**許可リストが所有ファイルを覆っていても落ちる**（スコープ判定より前に立つ）', () => {
    const wide = { ...policy, criteria: { ...policy.criteria,
      boundedness: { ...policy.criteria.boundedness, scopes: { content: ['data/*.json'] } } } };
    const r = judge({ id: 'x', touches: ['data/autonomy-score.json'], reversibility_class: 'R0',
      evidence_date: '2026-09-04', predicted_usd: 1, created_jst: '2026-09-04' },
      { policy: wide, scorePolicy, authority: auth, routing, costDoc, today: '2026-09-04', ownerOnly: OWNED });
    assert(r.criteria.boundedness.result === 'fail',
      `許可リストに覆われていると通ってしまう: ${r.criteria.boundedness.why}`);
    assert(r.criteria.boundedness.scope_source === 'owner_only',
      `落ちた理由が所有権でない: ${r.criteria.boundedness.scope_source}`);
  });
  ok('**正はコードに置く**（OWNER_ONLY_FILES を既定にしている）', () => {
    const r = judge({ id: 'x', touches: ['data/autonomy-score.json'], reversibility_class: 'R0',
      evidence_date: '2026-09-04', predicted_usd: 1, created_jst: '2026-09-04' },
      { policy, scorePolicy, authority: auth, routing, costDoc, today: '2026-09-04' });  // ownerOnly を渡さない
    assert(r.criteria.boundedness.result === 'fail',
      '既定が空になっている —— **台帳に写しを置くと、その台帳ごと緩む**');
  });
  // --- スコープの当て方（**推測でスコープを決めない**）---
  const SC = { actuator: ['data/*.json'], content: ['*.html', 'docs/**'], selfheal: '@authority:self_repair.may_modify' };
  eq(fitScope(['data/a.json'], SC, { authority: auth }).scope, 'actuator', '収まる最も狭いスコープを採る');
  eq(fitScope(['scripts/a.mjs'], SC, { authority: auth }).scope, 'selfheal', '権限表由来のスコープにも収まる');
  eq(fitScope(['docs/x.md'], SC, { authority: auth }).scope, 'content', 'content にも収まる');
  eq(fitScope(['data/a.json', 'src/x.ts'], SC, { authority: auth }).scope, null, 'どれにも収まらなければ null');
  eq(fitScope(['data/a.json', 'src/x.ts'], SC, { authority: auth }).outside, ['src/x.ts'],
     '**どのスコープから見ても外れているパスだけを名指しする**（推測の外れを候補のせいにしない）');
  eq(fitScope(['data/a.json'], SC, { authority: auth, declared: 'content' }).scope, null,
     '宣言があればそれで判定する（勝手に広いほうへ逃がさない）');
  eq(fitScope(['data/a.json'], SC, { authority: auth }).source, 'inferred', '推測したことを記録する');
  eq(J({ auto: null, created_jst: '2026-08-01' }).criteria.repeat_guard.result, 'fail',
     '**実行主体も上げ先も無いまま開き続ける候補は落とす**（毎朝同じ壁）');
  eq(J({ auto: null, force_owner: 'human', created_jst: '2026-08-01' }).criteria.repeat_guard.result, 'pass',
     'オーナー送りが決まっていれば壁ではない');
  eq(J({}).criteria.budget.result, 'pass', 'auto ハンドラは $0 と予測できる');
  eq(J({ auto: null, force_owner: 'human', lane: 'E' }).criteria.budget.result, 'pass',
     '実測中央値 $8 は article 上限 $10 の内');
  eq(J({ auto: null, force_owner: 'human', lane: 'E', predicted_usd: 12 }).criteria.budget.result, 'fail',
     '**上限を超える予測は落とす**');
  eq(J({ auto: null, force_owner: 'human', kind: 'pr' }).criteria.budget.result, 'unknown',
     '**予測が取れないのは unknown**（「高すぎる」と混ぜない）');

  // enforcement を record_only にすると R2 でも止まらない
  const soft = { ...ctx, policy: { ...policy, enforcement: 'record_only' } };
  eq(judge({ id: 'x', reversibility_class: 'R2', touches: ['data/a.json'], created_jst: '2026-09-03', last_seen_jst: '2026-09-04', auto: 'h' }, soft).verdict,
     'ineligible_recorded', '**record_only では R2 でも止めない**（設定が実際に効いている）');

  // --- 平坦な基準の検出 ---
  eq(flatCriteria([J({}), J({})]).filter((x) => x.flat).map((x) => x.criterion), CRITERIA,
     '**全候補で同値なら「何も見ていない」と名指しする**');
  eq(flatCriteria([J({}), J({ close_check_kind: 'manual' })]).find((x) => x.criterion === 'evidence_age').flat, false,
     '分岐していれば平坦ではない');

  // --- 台帳の検査（実データ + 壊し方） ---
  for (const [name, fn] of ledgerScenarios(() => JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')), validate, SELFTEST_BREAKAGES)) {
    ok(name, fn);
  }

  console.log(bad ? `\n${bad}/${n} 失敗` : `selftest: ${n}/${n} 通過`);
  return bad;
}

// --- CLI ------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  if (has('selftest')) process.exit(selftest() === 0 ? 0 : 1);

  const ctx = loadContext();
  const candidates = candidatesFromActions(readJson(ACTIONS_PATH));
  const judgements = judgeAll(candidates, ctx);
  const s = summarize(judgements);

  // **`argv.includes('--write')` をそのまま書く。**check-generators.mjs の走査は
  // この形しか拾わないので、`has('write')` のままだと**書き手として台帳に載らない**
  // ——「書く動作を誰も動かしていない状態」を作らないための網から、静かに外れる。
  if (argv.includes('--write')) {
    const cur = fs.existsSync(LOG_PATH) ? readJson(LOG_PATH) : { judgements: [] };
    cur.judgements = mergeJudgements(cur.judgements || [], judgements);
    cur.last_judged_jst = ctx.today;
    cur.enforcement = ctx.policy.enforcement;
    fs.writeFileSync(LOG_PATH, JSON.stringify(cur, null, 2) + '\n');
    console.log(`data/eligibility-log.json に ${judgements.length} 件を書いた（合計 ${cur.judgements.length} 行）`);
    process.exit(0);
  }

  if (has('json')) {
    console.log(JSON.stringify({ summary: s, judgements }, null, 2));
    process.exit(0);
  }

  if (has('check')) {
    const problems = [];
    if (!fs.existsSync(LOG_PATH)) problems.push('data/eligibility-log.json が無い — 判定は行われたが残っていない');
    else problems.push(...validate(readJson(LOG_PATH)));
    // **判定が全候補で同値の基準は、何も見ていない。**
    for (const k of s.flat_criteria) {
      problems.push(`基準 ${k} が全 ${s.total} 候補で同じ結果 — **分岐が死んでいる可能性がある。**`
        + '候補の側が均質なだけなら、そう書いて残すこと（黙って通さない）');
    }
    // 台帳の判定が今日のものか（**古い判定を現在値として読ませない**）
    if (fs.existsSync(LOG_PATH)) {
      const doc = readJson(LOG_PATH);
      if (doc.enforcement !== ctx.policy.enforcement) {
        problems.push(`台帳の enforcement (${doc.enforcement}) がポリシー (${ctx.policy.enforcement}) と違う`);
      }
    }
    if (problems.length) {
      console.error('L1適格性ゲート:');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`L1適格性ゲート: 候補 ${s.total} 件・停止 ${s.halted} 件・台帳の形と整合に問題なし。`);
    process.exit(0);
  }

  const pct = (x, d) => (d ? `${((x / d) * 100).toFixed(1)}%` : 'n/a');
  console.log(`\nL1 適格性ゲート — ${ctx.today}（enforcement: ${ctx.policy.enforcement}）\n`);
  console.log(`  候補 ${s.total} 件`);
  console.log(`    適格            ${s.by_verdict.eligible} 件  (${pct(s.by_verdict.eligible, s.total)})`);
  console.log(`    不適格・記録のみ ${s.by_verdict.ineligible_recorded} 件  (${pct(s.by_verdict.ineligible_recorded, s.total)})  ← **実行は止めていない**`);
  console.log(`    L4へ上げて停止   ${s.by_verdict.escalate_l4} 件  (${pct(s.by_verdict.escalate_l4, s.total)})`);
  console.log('\n  基準ごと（pass / fail / unknown）:');
  for (const k of CRITERIA) {
    const b = s.by_criterion[k];
    console.log(`    ${k.padEnd(14)} ${String(b.pass).padStart(3)} / ${String(b.fail).padStart(3)} / ${String(b.unknown).padStart(3)}`);
  }
  if (s.flat_criteria.length) {
    console.log(`\n  ⚠ 全候補で同値の基準: ${s.flat_criteria.join(', ')}`);
    console.log('    **判定しているように見えて分岐が死んでいる可能性がある。**候補が均質なだけならそう書く');
  }
  console.log('\n  棄却の内訳:');
  for (const j of judgements.filter((x) => x.verdict !== 'eligible')) {
    console.log(`    ${j.halted ? '⛔' : '·'} ${j.candidate_id}`);
    for (const r of j.reasons) console.log(`        ${r}`);
  }
  console.log('');
}
