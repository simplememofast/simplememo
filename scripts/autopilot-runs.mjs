#!/usr/bin/env node
/**
 * 運転台帳 — 共通実行IDで「1つの改善サイクルが完走したか」を数える。
 *
 *   node scripts/autopilot-runs.mjs            # 指標サマリ
 *   node scripts/autopilot-runs.mjs --json     # 機械可読（status JSON / 日報用）
 *   node scripts/autopilot-runs.mjs --check    # CI: 台帳の形と整合を検証（壊れていたら exit 1）
 *   node scripts/autopilot-runs.mjs --selftest # 検査そのものの自己検査（台帳を読まない）
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
 * 【単位を1つにしない — 2026-08-22追記】
 * `human_intervention_rate` は「その実行に人が1回でも触ったか」の**二値**で、
 * YAMLの権限を1行直しただけの日も丸ごと「介入あり」になる。これは
 * **AIの自律性を構造的に過少評価する。** 実測でも、run単位では 53.8% だが、
 * 同期間の変更行の 98.8% はAI著者のコミットだった（git実測）。
 *
 * かといって都合のよい分母に乗り換えるのは goodharting そのものなので、
 * **総計と内訳の両方を必ず出す**。とくに分けるべきは:
 *   - **成果物への介入**（人が記事を書いた／書き直した）＝ AIの成果が信用されていない
 *   - **基盤の修理**（ワークフロー・Runbook・スクリプト）＝ 基盤が脆い
 * この2つは自律性について正反対のことを言っており、混ぜると両方見えなくなる。
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

/**
 * 台帳が何日ぶん書かれていないかの許容。**これを超えたら --check が落ちる。**
 *
 * 2026-08-23 にこの検査を足した理由:
 * 主系が初めて自走出荷した（run 32599191984 → PR #538）のに、台帳には行が無く、
 * `--check` は素通りした。**台帳は「主系 0/3 出荷」と言い続けていた。**
 * 行の形はどれも正しかったので、既存の validate() は何も言えなかった。
 *
 * 壊れた行は検知できて、**書かれなかった行は検知できない**。
 * 前者は指標を嘘にするが、後者は指標を止める — 止まった指標は、
 * 「変化が無い」と見分けがつかないぶん質が悪い。
 *
 * 1日にしてあるのは、当日ぶんが夜になるまで書かれないのは普通だから。
 * 2日連続で書かれていなければ、それは運用が止まっている。
 */
export const MAX_LEDGER_LAG_DAYS = 1;

/** 今日（JST）。台帳の日付が JST なので、比較もJSTで揃える。 */
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * 台帳が最後に書かれてから何日経ったか。
 *
 * **`days_behind` は「実行が無かった日数」ではない。**「記録が無い日数」。
 * 実行が無い日も no_run として1行書く決まりなので、行が無い＝記録していない。
 */
export function staleness(doc, today = todayJst()) {
  const dates = (doc.runs || []).map((r) => r.date_jst).filter(Boolean).sort();
  const latest = dates.at(-1) ?? null;
  const days = latest
    ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 864e5)
    : null;
  return {
    latest, today,
    days_behind: days,
    max_days: MAX_LEDGER_LAG_DAYS,
    stale: days === null || days > MAX_LEDGER_LAG_DAYS,
  };
}

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

/**
 * 検知までの時間と修理までの時間。**別の指標として分けて出す。**
 *
 * 前者は監視の穴、後者は修理能力の話で、混ぜると改善先を間違える。
 * 実測（2026-08-16の無運転）では検知まで50時間かかったが、気づいてからの
 * 修理は1時間以内だった。**弱点は修理速度ではなく検知の穴**だと数字が言っている。
 *
 * 時刻が無い行は分母に入れない。n を必ず一緒に返す — 1件の中央値を
 * 「MTTR」と呼ぶと、測っていないことを測ったことにしてしまう。
 */
function timings(runs) {
  const hrs = (a, b) => (new Date(b) - new Date(a)) / 36e5;
  const detect = [], repair = [];
  for (const r of runs) {
    if (r.failed_at && r.detected_at) detect.push(hrs(r.failed_at, r.detected_at));
    if (r.detected_at && r.resolved_at) repair.push(hrs(r.detected_at, r.resolved_at));
  }
  const med = (xs) => {
    if (!xs.length) return null;
    const a = [...xs].sort((x, y) => x - y), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const unresolved = runs.filter((r) => r.detected_at && !r.resolved_at);
  return {
    time_to_detect_hours: { median: med(detect), max: detect.length ? Math.max(...detect) : null, n: detect.length },
    time_to_repair_hours: { median: med(repair), max: repair.length ? Math.max(...repair) : null, n: repair.length },
    unresolved: unresolved.map((r) => ({ run_id: r.run_id, failure_class: r.failure_class ?? null })),
  };
}

/** 主系（GitHub Actions）以外はすべて副系・代走とみなす。 */
const isPrimary = (r) => r.route === 'actions';

export function summarize(doc, { since = null, costDoc = null, today = undefined } = {}) {
  let runs = doc.runs;
  if (since) runs = runs.filter((r) => r.date_jst >= since);

  const attempted = runs.filter((r) => r.attempted);
  const shipped = runs.filter((r) => r.outcome === 'shipped');
  const failed = runs.filter((r) => FAILED.has(r.outcome));
  const noRun = runs.filter((r) => r.outcome === 'no_run');
  const withIntervention = attempted.filter((r) => (r.interventions || []).length > 0);
  const rate0 = (n, d) => (d > 0 ? n / d : null);

  // 介入の内訳。kind ごとに「その kind の介入を含む実行」を数える
  // （1実行に複数kindがありうるので、合計が withIntervention と一致するとは限らない）。
  const KINDS = ['artifact', 'infra', 'substitute', 'bootstrap', 'request'];
  const byKind = {};
  for (const k of KINDS) {
    const runsWith = attempted.filter((r) => (r.interventions || []).some((i) => i.kind === k));
    byKind[k] = { runs: runsWith.length, rate: rate0(runsWith.length, attempted.length) };
  }
  // 出荷物のうち、人が中身に手を入れたもの。**AIの自律性の中核はここ。**
  const shippedWithArtifactIntervention = runs.filter(
    (r) => r.outcome === 'shipped' && (r.interventions || []).some((i) => i.kind === 'artifact'));

  const days = [...new Set(runs.map((r) => r.date_jst))].sort();
  const shippedDays = new Set(shipped.map((r) => r.date_jst));

  const rate = rate0;

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
    // 内訳。総計だけ出すと過少評価、内訳だけ出すと都合のよい分母選びになる。両方出す。
    intervention_by_kind: byKind,
    // 出荷物のうち人が中身に手を入れた割合。**AIの自律性の中核。**
    artifact_autonomy_rate: rate(shipped.length - shippedWithArtifactIntervention.length, shipped.length),
    shipping_day_rate: rate(shippedDays.size, days.length),
    no_run_days: noRun.map((r) => r.date_jst),
    by_route: byRoute,
    // 「主系が一度も出荷していない」を機械が言えるようにする（＝切替の証拠）
    primary_ever_shipped: (byRoute.primary?.shipped ?? 0) > 0,
    interventions: withIntervention.flatMap((r) =>
      (r.interventions || []).map((i) => ({ run_id: r.run_id, date_jst: r.date_jst, ...i }))),
    cost: costLinked,
    timings: timings(runs),
    // 台帳そのものが書かれ続けているか。**壊れた行より、書かれなかった行のほうが見つけにくい。**
    staleness: staleness(doc, today ?? todayJst()),
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
  const bk = s.intervention_by_kind ?? {};
  o.push(`    ├ 成果物への介入   ${pct(bk.artifact?.rate)}  (${bk.artifact?.runs ?? 0} 実行)  ← AIの自律性の中核`);
  o.push(`    ├ 基盤の修理       ${pct(bk.infra?.rate)}  (${bk.infra?.runs ?? 0} 実行)`);
  o.push(`    ├ 代走             ${pct(bk.substitute?.rate)}  (${bk.substitute?.runs ?? 0} 実行)`);
  o.push(`    ├ 立ち上げ         ${pct(bk.bootstrap?.rate)}  (${bk.bootstrap?.runs ?? 0} 実行・一度きり)`);
  o.push(`    └ 起票のみ         ${pct(bk.request?.rate)}  (${bk.request?.runs ?? 0} 実行・未実行)`);
  o.push(`  成果物のAI自律率 ${pct(s.artifact_autonomy_rate)}   (出荷 ${s.totals.shipped} 件のうち人が中身に触っていない割合)`);
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
  const st = s.staleness;
  o.push('');
  o.push(`  最終記入: ${st.latest ?? 'なし'}（今日 ${st.today} / ${st.days_behind ?? '?'} 日前・許容 ${st.max_days} 日）`);
  if (st.stale) {
    o.push('  ⚠ 台帳が書かれていない。**指標は止まっているだけで、正しくはない。**');
    o.push('    実行があったのに行が無いと、出荷しても「0/N 出荷」のままになる');
    o.push('    （2026-08-23、主系の初出荷が実際にこれで落ちた）');
    o.push('    追記: node scripts/autopilot-runs.mjs --append --run-id ap-<YYYYMMDD>-<route> \\');
    o.push('            --date <YYYY-MM-DD> --route <actions|ccr-XXXX|owner-session> \\');
    o.push('            --outcome <shipped|no_artifact|failed|cancelled|skipped_gate|skipped_duplicate|no_run> \\');
    o.push('            --pr <n> --artifact <path> --external-ref <run id> --source <一次資料>');
  }
  const tm = s.timings;
  if (tm.time_to_detect_hours.n || tm.time_to_repair_hours.n) {
    o.push('');
    const f = (t, label) => t.n
      ? `  ${label}: 中央値 ${t.median.toFixed(1)}h / 最大 ${t.max.toFixed(1)}h (n=${t.n})`
      : `  ${label}: 記録なし`;
    o.push(f(tm.time_to_detect_hours, '検知まで'));
    o.push(f(tm.time_to_repair_hours, '修理まで'));
    if (tm.unresolved.length) {
      o.push(`  ⚠ 未解消 ${tm.unresolved.length} 件: ${tm.unresolved.map((u) => `${u.run_id}[${u.failure_class}]`).join(', ')}`);
    }
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

/**
 * 陳腐化検知の自己検査。**台帳を読まない**ので、台帳の中身がどう変わっても壊れない。
 *
 * 元にした実害: 2026-08-23、主系が初めて自走出荷した（PR #538）のに
 * `data/autopilot-runs.json` に行が無く、`--check` は素通りした。
 * 台帳は「主系 0/3 出荷」と言い続けた。**その状態を落とせることを固定する。**
 */
function selftest() {
  let n = 0, bad = 0;
  const eq = (got, want, msg) => {
    n++;
    if (got !== want) { bad++; console.error(`  ✗ ${msg}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
  };
  const doc = (...dates) => ({ runs: dates.map((d, i) => ({ run_id: `r${i}`, date_jst: d })) });

  // 主系が残していった状態そのもの（最終記入 08-22・08-23 の出荷は未記入）
  const asLeft = doc('2026-08-21', '2026-08-22');
  eq(staleness(asLeft, '2026-08-23').stale, false, '出荷当日はまだ落とさない（当日ぶんが夜まで空くのは普通）');
  eq(staleness(asLeft, '2026-08-24').stale, true,  '**翌日には落ちる** — これが 2026-08-23 に効かなかった検査');
  eq(staleness(asLeft, '2026-08-24').days_behind, 2, '2日前と数える');

  // 追記して直った状態
  const fixed = doc('2026-08-22', '2026-08-23');
  eq(staleness(fixed, '2026-08-23').stale, false, '当日に書けば通る');
  eq(staleness(fixed, '2026-08-24').stale, false, '1日前までは許容');
  eq(staleness(fixed, '2026-08-25').stale, true,  '2日空けば落ちる');

  // 境界と異常系
  eq(staleness(doc(), '2026-08-23').stale, true, '**空の台帳は「問題なし」ではない**');
  eq(staleness(doc(), '2026-08-23').latest, null, '空なら latest は null');
  eq(staleness(doc('2026-08-25'), '2026-08-23').days_behind, -2, '未来日付は負で出す（隠さない）');
  eq(staleness(doc('2026-08-25'), '2026-08-23').stale, false, '未来日付は陳腐化ではない（別の異常）');
  // 順序に依存しない — 台帳は sort されている前提だが、そこに寄りかからない
  eq(staleness(doc('2026-08-23', '2026-08-11'), '2026-08-23').days_behind, 0, '並び順に依存しない');

  // JST 換算。UTC 21:00 は JST では翌日の 06:00。
  eq(todayJst(new Date('2026-08-22T21:18:07Z')), '2026-08-23', '主系の起動時刻(UTC 21:18)は JST では 08-23');
  eq(todayJst(new Date('2026-08-22T14:59:59Z')), '2026-08-22', 'JST 23:59 はまだ当日');
  eq(todayJst(new Date('2026-08-22T15:00:00Z')), '2026-08-23', 'JST 00:00 で日付が変わる');

  console.log(bad ? `\n${bad}/${n} 失敗` : `selftest: ${n}/${n} 通過`);
  if (bad) process.exit(1);
}

// --- CLI ---------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  const val = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };

  if (has('selftest')) { selftest(); process.exit(0); }

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
      intervention_by_kind: s.intervention_by_kind,
      artifact_autonomy_rate: s.artifact_autonomy_rate === null ? null : Number(s.artifact_autonomy_rate.toFixed(4)),
      shipping_day_rate: s.shipping_day_rate === null ? null : Number(s.shipping_day_rate.toFixed(4)),
      totals: s.totals, by_route: s.by_route,
      primary_ever_shipped: s.primary_ever_shipped,
      no_run_days: s.no_run_days,
      intervention_count: s.interventions.length,
      timings: s.timings,
    }, null, 2));
    process.exit(0);
  }

  console.log(render(s, doc));
  if (has('check')) {
    // 形の検査（validate）はすでに上で通っている。ここで見るのは**書かれ続けているか**。
    // validate() に入れていないのは、--append が validate を先に通すため。
    // 陳腐化で validate が落ちると、それを直す唯一の手段（追記）まで塞がる。
    if (s.staleness.stale) {
      console.error(`\n台帳が ${s.staleness.days_behind ?? '?'} 日書かれていない（許容 ${s.staleness.max_days} 日）。`);
      console.error('**行の形が正しいことと、行が在ることは別。** 上の追記コマンドで埋めること。');
      process.exit(1);
    }
    console.log('\n台帳の形と整合に問題なし。');
  }
}
