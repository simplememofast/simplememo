#!/usr/bin/env node
/**
 * 運転台帳 — 共通実行IDで「1つの改善サイクルが完走したか」を数える。
 *
 *   node scripts/autopilot-runs.mjs            # 指標サマリ
 *   node scripts/autopilot-runs.mjs --json     # 機械可読（status JSON / 日報用）
 *   node scripts/autopilot-runs.mjs --check    # CI: 台帳の形と整合を検証（壊れていたら exit 1）
 *   node scripts/autopilot-runs.mjs --since 2026-08-15
 *   node scripts/autopilot-runs.mjs --append --run-id ... --date ... --route ... --outcome ...
 *
 * 【何を測るか】外部レビュー（2026-08-22）が求めた指標のうち、
 * 実行を一意に指す識別子があれば数えられるもの:
 *
 *   AI完走率     = shipped / attempted
 *   人間介入率   = 介入のあった実行 / attempted
 *   変更失敗率   = (no_artifact + failed + cancelled) / attempted
 *   経路別内訳   = 主系 vs 副系（＝バックアップ切替が起きたことの機械的な証拠）
 *   無運転日     = どの経路も動かなかった日（**これだけは正常系ではない**）
 *
 * 【分母を attempted にする理由】
 * 秘密鍵未設定によるGateスキップは「意図的に静かに寝る」設計で、着手していない。
 * これを失敗に数えると、正しく動いている安全装置が失敗率として現れる。
 * 逆に no_run（どの経路も動かなかった日）は着手すべきだったのに動かなかった日なので、
 * 完走率の分母には入れないが**別枠で必ず表示する**。隠すと「稼働率100%」に見える。
 *
 * 【費用をここに持たない】実費は data/autopilot-cost.json が正で、external_ref
 * （GitHub の run id）で結合する。同じ数字の出所を2つ作らない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
export const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');

export const OUTCOMES = [
  'shipped', 'no_artifact', 'failed', 'cancelled',
  'skipped_gate', 'skipped_duplicate', 'no_run',
];
/** 着手した扱いにしない outcome。分母から外れる。 */
const NOT_ATTEMPTED = new Set(['skipped_gate', 'skipped_duplicate', 'no_run']);
/** 着手したが本番に何も出せなかった outcome。変更失敗率の分子。 */
const FAILED = new Set(['no_artifact', 'failed', 'cancelled']);

export function load(file = RUNS_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * 台帳の形を検証する。
 *
 * 壊れた台帳は「集計できない」ではなく「**指標が黙って嘘になる**」を意味する。
 * とくに attempted と outcome の食い違い（Gateスキップなのに attempted=true 等）は
 * 完走率を静かにずらすので、ここで必ず落とす。
 */
export function validate(doc) {
  const problems = [];
  if (!doc || !Array.isArray(doc.runs)) return ['runs must be an array'];
  const seen = new Set();
  doc.runs.forEach((r, i) => {
    const at = `runs[${i}]${r.run_id ? ` (${r.run_id})` : ''}`;
    if (!r.run_id) problems.push(`${at}: run_id is required — 共通実行IDが無い行は台帳の意味を成さない`);
    else if (seen.has(r.run_id)) problems.push(`${at}: duplicate run_id`);
    else seen.add(r.run_id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date_jst || '')) problems.push(`${at}: date_jst must be YYYY-MM-DD`);
    if (!r.route) problems.push(`${at}: route is required`);
    if (!OUTCOMES.includes(r.outcome)) problems.push(`${at}: outcome must be one of ${OUTCOMES.join('|')} (got ${JSON.stringify(r.outcome)})`);
    if (typeof r.attempted !== 'boolean') problems.push(`${at}: attempted must be boolean`);
    // 着手フラグと結果の整合。ここがずれると完走率が静かに嘘になる。
    if (r.attempted && NOT_ATTEMPTED.has(r.outcome)) {
      problems.push(`${at}: attempted=true なのに outcome=${r.outcome}（着手していない結果）`);
    }
    if (!r.attempted && !NOT_ATTEMPTED.has(r.outcome)) {
      problems.push(`${at}: attempted=false なのに outcome=${r.outcome}（着手した結果）`);
    }
    if (r.outcome === 'shipped' && !r.pr) {
      problems.push(`${at}: shipped なのに pr が無い — 出荷はPRのマージでしか成立しない`);
    }
    if (FAILED.has(r.outcome) && !r.failure_reason) {
      problems.push(`${at}: ${r.outcome} なのに failure_reason が無い — 「なぜ落ちたか」の無い失敗は再発防止に使えない`);
    }
    if (!r.source) problems.push(`${at}: source is required — 後から検算できない行は指標として存在しないのと同じ`);
    if (r.interventions && !Array.isArray(r.interventions)) problems.push(`${at}: interventions must be an array`);
  });
  return problems;
}

/** 主系（GitHub Actions）以外はすべて副系・代走とみなす。 */
const isPrimary = (r) => r.route === 'actions';

export function summarize(doc, { since = null, costDoc = null } = {}) {
  let runs = doc.runs;
  if (since) runs = runs.filter((r) => r.date_jst >= since);

  const attempted = runs.filter((r) => r.attempted);
  const shipped = runs.filter((r) => r.outcome === 'shipped');
  const failed = runs.filter((r) => FAILED.has(r.outcome));
  const noRun = runs.filter((r) => r.outcome === 'no_run');
  const withIntervention = attempted.filter((r) => (r.interventions || []).length > 0);

  const days = [...new Set(runs.map((r) => r.date_jst))].sort();
  const shippedDays = new Set(shipped.map((r) => r.date_jst));

  const rate = (n, d) => (d > 0 ? n / d : null);

  const byRoute = {};
  for (const r of runs) {
    const k = isPrimary(r) ? 'primary' : 'secondary';
    byRoute[k] ??= { runs: 0, attempted: 0, shipped: 0 };
    byRoute[k].runs++;
    if (r.attempted) byRoute[k].attempted++;
    if (r.outcome === 'shipped') byRoute[k].shipped++;
  }

  // 実費は cost 台帳が正。external_ref（GitHub run id）で結合する。
  let costLinked = null;
  if (costDoc) {
    const byRunId = new Map(costDoc.runs.map((c) => [String(c.run_id), c]));
    const linked = runs.map((r) => byRunId.get(String(r.external_ref))).filter(Boolean);
    costLinked = {
      linked_runs: linked.length,
      spent_usd: Number(linked.reduce((a, c) => a + c.total_cost_usd, 0).toFixed(4)),
      unobservable_runs: runs.filter((r) => r.attempted && !isPrimary(r)).length,
    };
  }

  return {
    window: { from: days[0] ?? null, to: days.at(-1) ?? null, days: days.length },
    totals: {
      runs: runs.length, attempted: attempted.length,
      shipped: shipped.length, failed: failed.length, no_run: noRun.length,
    },
    // レビューが求めた指標。分母は attempted（§ヘッダの理由）。
    completion_rate: rate(shipped.length, attempted.length),
    change_failure_rate: rate(failed.length, attempted.length),
    human_intervention_rate: rate(withIntervention.length, attempted.length),
    shipping_day_rate: rate(shippedDays.size, days.length),
    no_run_days: noRun.map((r) => r.date_jst),
    by_route: byRoute,
    // 「主系が一度も出荷していない」を機械が言えるようにする（＝切替の証拠）
    primary_ever_shipped: (byRoute.primary?.shipped ?? 0) > 0,
    interventions: withIntervention.flatMap((r) =>
      (r.interventions || []).map((i) => ({ run_id: r.run_id, date_jst: r.date_jst, ...i }))),
    cost: costLinked,
  };
}

const pct = (x) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);

function render(s, doc) {
  const o = [];
  o.push(`Autopilot runs ${s.window.from} → ${s.window.to} (${s.window.days} 日 / ${s.totals.runs} run)`);
  o.push('');
  o.push(`  AI完走率      ${pct(s.completion_rate)}   (${s.totals.shipped} / ${s.totals.attempted} 着手)`);
  o.push(`  変更失敗率    ${pct(s.change_failure_rate)}   (${s.totals.failed} / ${s.totals.attempted} 着手)`);
  o.push(`  人間介入率    ${pct(s.human_intervention_rate)}   (${s.interventions.length} 件の介入)`);
  o.push(`  出荷日率      ${pct(s.shipping_day_rate)}   (${s.window.days} 日中)`);
  o.push('');
  o.push(`  経路別:  主系 ${s.by_route.primary?.shipped ?? 0}/${s.by_route.primary?.attempted ?? 0} 出荷` +
         `   副系・代走 ${s.by_route.secondary?.shipped ?? 0}/${s.by_route.secondary?.attempted ?? 0} 出荷`);
  if (!s.primary_ever_shipped) {
    o.push('  ⚠ 主系は一度も出荷していない。日々の出荷は副系・代走が担っている');
    o.push('    （＝バックアップ切替は「起きた」のではなく常態。冗長化が実際に効いている状態）');
  }
  if (s.no_run_days.length) {
    o.push(`  ⚠ 無運転日 ${s.no_run_days.length} 日: ${s.no_run_days.join(', ')}`);
    o.push('    （どの経路も動かなかった日。Gateスキップと違い、これは正常系ではない）');
  }
  if (s.cost) {
    o.push('');
    o.push(`  実費: $${s.cost.spent_usd.toFixed(4)}（${s.cost.linked_runs} run 分。data/autopilot-cost.json と結合）`);
    o.push(`        ${s.cost.unobservable_runs} run は副系のため**観測手段が無い**（ゼロではない）`);
  }
  const gaps = doc.seeded?.known_gaps || [];
  if (gaps.length) {
    o.push('');
    o.push('  台帳が持てていないもの:');
    for (const g of gaps) o.push(`    - ${g}`);
  }
  return o.join('\n');
}

// --- CLI ---------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };

  const doc = load();
  const problems = validate(doc);
  if (problems.length) {
    console.error('autopilot-runs.json is malformed:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n壊れた台帳は「集計できない」ではなく「指標が黙って嘘になる」を意味する。');
    process.exit(1);
  }

  if (has('append')) {
    const run = {
      run_id: val('run-id'), date_jst: val('date'), route: val('route'),
      attempted: val('attempted', 'true') === 'true',
      outcome: val('outcome'),
      lane: val('lane', null), action: val('action', null),
      pr: val('pr') ? Number(val('pr')) : null,
      artifact: val('artifact', null),
      failure_reason: val('failure-reason', null),
      external_ref: val('external-ref', null),
      interventions: [],
      source: val('source', 'session'),
    };
    if (doc.runs.some((r) => r.run_id === run.run_id)) {
      console.log(`skip: run_id ${run.run_id} already recorded`);
      process.exit(0);
    }
    doc.runs.push(run);
    doc.runs.sort((a, b) => (a.date_jst + a.route < b.date_jst + b.route ? -1 : 1));
    const after = validate(doc);
    if (after.length) {
      console.error('追記後の台帳が不正:');
      for (const p of after) console.error(`  - ${p}`);
      process.exit(1);
    }
    fs.writeFileSync(RUNS_PATH, JSON.stringify(doc, null, 2) + '\n');
    console.log(`appended ${run.run_id} (${run.outcome})`);
    process.exit(0);
  }

  let costDoc = null;
  try { costDoc = JSON.parse(fs.readFileSync(COST_PATH, 'utf8')); } catch { /* 任意 */ }
  const s = summarize(doc, { since: val('since', null), costDoc });

  if (has('json')) {
    console.log(JSON.stringify({
      window: s.window,
      completion_rate: s.completion_rate === null ? null : Number(s.completion_rate.toFixed(4)),
      change_failure_rate: s.change_failure_rate === null ? null : Number(s.change_failure_rate.toFixed(4)),
      human_intervention_rate: s.human_intervention_rate === null ? null : Number(s.human_intervention_rate.toFixed(4)),
      shipping_day_rate: s.shipping_day_rate === null ? null : Number(s.shipping_day_rate.toFixed(4)),
      totals: s.totals, by_route: s.by_route,
      primary_ever_shipped: s.primary_ever_shipped,
      no_run_days: s.no_run_days,
      intervention_count: s.interventions.length,
    }, null, 2));
    process.exit(0);
  }

  console.log(render(s, doc));
  if (has('check')) console.log('\n台帳の形と整合に問題なし。');
}
