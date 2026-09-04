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
    measurable: Boolean(contracts),
    why: contracts ? null : 'L2（価値契約）が未実装。決済済みの契約を持つ出荷は構造的に 0 件',
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
  const dRate = n ? (detected.length + machineIncidents.length) / n : 0;
  const rRate = n ? (recoveredHandsOff.length + recoveredIncidents.length) / n : 0;
  // 自動 revert は「出荷後の指標劣化を検知して人手なしで巻き戻した」回。台帳に語彙が無い＝0。
  const autoRevert = recoveries.filter((r) => r.mode === 'production' && r.before?.failed === true && recovered(r)).length;
  return {
    id: 'ra', n,
    detect: { rate: dRate, hit: detected.length + machineIncidents.length, points: half * dRate, max: half,
              detected_at_all: detectedAtAll,
              eligibility_detected_by_machine: eligibilityByMachine,
              why: n && !detected.length && !machineIncidents.length
                ? `**${detectedAtAll}/${n} は検知されているが、機械が自分で気づいた故障は 0 件。**`
                  + `同じ機械が適格性の沈黙は ${eligibilityByMachine} 件自分で拾っている —— 拾えていないのは故障のほう`
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
  const judged = escalated.filter((a) => typeof a.owner_needed === 'boolean');
  const needed = judged.filter((a) => a.owner_needed);
  const delegated = judged.filter((a) => a.owner_needed_review?.mode === 'owner_delegated').length;
  const precRate = judged.length ? needed.length / judged.length : null;
  const precPoints = precRate === null ? 0 : half * precRate;

  return {
    id: 'ep',
    miss: { rate: missRate, n: timed.length, late: late.length, points: missPoints, max: half,
            measurable: timed.length > 0,
            why: timed.length ? '**下界のみ**（検知の時刻までしか台帳に無い。配達時刻は持っていない）'
                              : '窓内に時刻を持つ故障が無い' },
    precision: { rate: precRate, n: escalated.length, judged: judged.length, delegated, points: precPoints, max: half,
                 measurable: judged.length > 0,
                 why: delegated ? `${judged.length}/${escalated.length} 判定済み（うち${delegated}件はオーナー委任に基づくAI評価。独立した人間評価ではない）` : judged.length ? null
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
  'data/value-metrics.json'];
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
    if (c.points > 0 && c.measurable === false) {
      problems.push(`成分 ${c.id} は measurable=false なのに ${c.points} 点入っている`);
    }
  }
  if (s.total > s.max) problems.push(`合計 ${s.total} が満点 ${s.max} を超えている`);
  // L2 の前提台帳。**VDC が動く条件そのもの**なので、同じ検査で見る。
  if (fs.existsSync(METRICS_PATH)) problems.push(...validateMetrics(readJson(METRICS_PATH), policy));
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
  const acts = { actions: [{ force_owner: 'human', owner_needed: true }, { force_owner: 'human', owner_needed: false }] };
  eq(ep([quick], P, { rules, actions: acts }).precision.points, 3.75, '半分が本当に必要だったなら半分');
  const delegatedActs = { actions: acts.actions.map(a => ({ ...a,
    owner_needed_review: { mode: 'owner_delegated', reviewer: 'codex' } })) };
  const delegatedPrecision = ep([quick], P, { rules, actions: delegatedActs }).precision;
  eq(delegatedPrecision.points, 3.75, '委任しても必要・不要の判定比率は変えない');
  eq(delegatedPrecision.delegated, 2, '委任によるAI評価の件数を区別する');
  eq(delegatedPrecision.why.includes('独立した人間評価ではない'), true, '委任を独立した人間評価と表示しない');
  eq(ep([quick], P, { rules, actions: acts }).points, 11.25, '2つの半分を足す');

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
  L.push(`      検知  ${pts(c.ra.detect.points, c.ra.detect.max)}  ${pct(c.ra.detect.rate)}  (${c.ra.detect.hit}/${c.ra.n} を機械が検知)`);
  if (c.ra.detect.why) L.push(`            ${c.ra.detect.why}`);
  L.push(`      復旧  ${pts(c.ra.recover.points, c.ra.recover.max)}  ${pct(c.ra.recover.rate)}  (${c.ra.recover.hit}/${c.ra.n} を人手なしで復旧)`);
  L.push(`      自動 revert ${c.ra.auto_revert_count} 回  ← **Phase 6 のハードゲート。点数では代替しない**`);
  L.push(`  エスカレーション精度 EP ${pts(c.ep.points, c.ep.max)}`);
  L.push(`      見逃し ${pts(c.ep.miss.points, c.ep.miss.max)}  ${c.ep.miss.rate === null ? 'n/a' : `遅延 ${c.ep.miss.late}/${c.ep.miss.n}`}`);
  L.push(`             ${c.ep.miss.why}`);
  L.push(`      精度   ${pts(c.ep.precision.points, c.ep.precision.max)}  ${c.ep.precision.why ?? `${c.ep.precision.judged}/${c.ep.precision.n} 判定済み`}`);
  L.push(`  制約下スループット TUC  ${pts(c.tuc.points, c.tuc.max)}   週 ${c.tuc.per_week.toFixed(1)} 出荷 / 目標 ${c.tuc.target}`);
  L.push(`\n  検査被覆率  ${s.coverage.demonstrated}/${s.coverage.total} 本が「壊すと落ちる」ことを実測済み`);
  L.push(`  ${s.excluded.failure_rate}`);
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
