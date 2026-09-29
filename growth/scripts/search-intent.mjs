#!/usr/bin/env node
/**
 * **共通クエリの順位と主要ページの観測差を、窓をまたいで見つける。**
 *
 *   node growth/scripts/search-intent.mjs             # 表示
 *   node growth/scripts/search-intent.mjs --json
 *   node growth/scripts/search-intent.mjs --check     # CI
 *   node growth/scripts/search-intent.mjs --selftest
 *
 * 【なぜ要るか】
 * data/automation-coverage.json の「検索意図（Search Intent）の変化検出」が
 * `nobody` で、理由もそこに書いてある —— **材料は analyze.mjs にある（CTR gap）。
 * 無いのは窓をまたいだ比較。**単一スナップショットの分析はあるが、
 * 「前の窓と比べて何が変わったか」を出す経路が無かった。
 *
 * 【収集条件が揃っていても、主要ページの差は意図の変化とは限らない】
 * 同じクエリで収集済みページ中の最多表示ページが異なれば調査候補になる。
 * 週次の28日窓は21日が重なるため、窓全体の最多ページが変わっても
 * Googleの意図解釈が変わった証拠にはしない。08-11 の CSV は選択ページの
 * クエリしか含まず、08-24 の BigQuery と比較できない。過去の未検証例:
 *
 *   google keep 系4件  /blog/line-keep-alternatives → /blog/google-keep-shutdown
 *   memo apps          /blog/best-memo-apps-2026    → /en/blog/best-memo-apps
 *   memos vs obsidian  /obsidian/                   → /en/vs/obsidian/
 *
 * 【この道具が使わない信号】**クエリの出現・消滅は使わない。**
 * 古いCSVは1000行上限で、BigQueryは匿名化されたクエリ名を含まない。
 * 期間や収集条件も変わるため、「消えた」を意図の変化と決めない。
 *
 * 【収集方法と窓の長さも確認する】08-11 は CSV の28日、08-24 は
 * BigQuery の13日。収集方法・完全性・窓の長さが揃わないときは
 * 候補を出さず、比較不能を明示する。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSnapshots, loadSnapshot, curveFor, expectedCtr } from '../lib/gsc.mjs';
import { selftestTally } from '../../scripts/lib/tally.mjs';

/** 両窓でこの表示回数を超えないと比べない。**1クリックでCTRが跳ねる母数で判定しない。** */
export const MIN_IMPRESSIONS = 10;
/** 順位がこれだけ動いたら「動いた」と呼ぶ。 */
export const POSITION_SHIFT = 3;

const DAY_MS = 86400000;
const utcDay = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
};

/** Inclusive UTC calendar days shared by the two windows, or null if either is invalid. */
export function windowOverlapDays(before, after) {
  const [a0, a1] = (before || []).map(utcDay);
  const [b0, b1] = (after || []).map(utcDay);
  if ([a0, a1, b0, b1].some((v) => v == null) || a1 < a0 || b1 < b0) return null;
  return Math.max(0, Math.floor((Math.min(a1, b1) - Math.max(a0, b0)) / DAY_MS) + 1);
}

const windowDays = ([start, end]) => {
  const a = utcDay(start); const b = utcDay(end);
  return a == null || b == null || b < a ? null : (b - a) / DAY_MS + 1;
};

/** A descriptive comparison still needs matching, complete collection conditions. */
function collectionEvidence(meta) {
  const b = meta?.bigquery;
  const available = b?.window_days_available;
  const requested = b?.window_days_requested;
  const bigqueryComplete = Number.isInteger(available) && Number.isInteger(requested)
    ? available >= requested : null;
  const complete = meta?.complete_window === false || bigqueryComplete === false ? false
    : meta?.complete_window === true || bigqueryComplete === true ? true : null;
  return {
    source: meta?.source ?? null,
    search_type: b?.search_type ?? meta?.search_type ?? (meta?.source ? 'WEB' : null),
    aggregation: meta?.totals?.source ?? null,
    complete_window: complete,
    query_page_scope: meta?.source === 'csv-export' ? 'selected_page_exports'
      : meta?.source === 'bigquery' ? 'exported_query_pages' : 'unknown',
    query_page_min_impressions: Number.isInteger(b?.min_query_page_impressions)
      ? b.min_query_page_impressions : null,
    page_normalization_version: b?.canonical_page_normalization?.version ?? null,
  };
}

function collectionIssues(before, after, beforeWindow, afterWindow) {
  const issues = [];
  const daysBefore = windowDays(beforeWindow); const daysAfter = windowDays(afterWindow);
  if (daysBefore == null || daysAfter == null) issues.push('missing_or_invalid_period');
  else if (daysBefore !== daysAfter) issues.push('different_window_lengths');
  if (before.complete_window !== true || after.complete_window !== true) {
    issues.push('incomplete_or_unverified_window');
  }
  if (!before.source || before.source !== after.source) issues.push('different_or_unknown_source');
  if (!before.search_type || before.search_type !== after.search_type) {
    issues.push('different_or_unknown_search_type');
  }
  if (!before.aggregation || before.aggregation !== after.aggregation) {
    issues.push('different_or_unknown_aggregation');
  }
  if (before.query_page_scope === 'selected_page_exports'
    || after.query_page_scope === 'selected_page_exports') {
    issues.push('selected_page_only_export');
  }
  if (before.source === 'bigquery' && after.source === 'bigquery') {
    if (before.query_page_min_impressions == null
      || before.query_page_min_impressions !== after.query_page_min_impressions) {
      issues.push('different_or_unknown_query_page_threshold');
    }
    if (before.page_normalization_version !== after.page_normalization_version) {
      issues.push('different_page_normalization');
    }
  }
  return issues;
}

const topPages = (queryPages) => {
  const best = new Map();
  for (const r of queryPages || []) {
    const cur = best.get(r.query);
    if (!cur || r.impressions > cur.impressions) best.set(r.query, r);
  }
  return best;
};

const shortPath = (url) => String(url).replace(/^https?:\/\/[^/]+/, '') || '/';

/**
 * 2つのスナップショットを比べる。**共通クエリで、両窓とも母数が足りるものだけ。**
 *
 * 出現・消滅を返さないのは意図的。古いCSVには行数上限があり、
 * BigQueryにも匿名化・期間差がある。単なる有無を意図変化と呼ばない。
 */
export function compare(prev, curr, { minImpressions = MIN_IMPRESSIONS } = {}) {
  const a = new Map((prev.queries || []).map((q) => [q.query, q]));
  const b = new Map((curr.queries || []).map((q) => [q.query, q]));
  const pa = topPages(prev.queryPages);
  const pb = topPages(curr.queryPages);

  const comparable = [];
  for (const [q, y] of b) {
    const x = a.get(q);
    if (!x) continue;
    if (x.impressions < minImpressions || y.impressions < minImpressions) continue;
    comparable.push({ query: q, before: x, after: y });
  }

  // **曲線が無ければ gap は出さない。**0 で埋めると「順位で説明できる」と
  // 「比べる相手が無い」が同じ値になる。この検査が探している形そのもの
  const safeCurve = (meta) => { try { return curveFor(meta, 'all') ?? null; } catch { return null; } };
  const safeExpected = (curve, pos) => {
    if (!curve) return null;
    try { const v = expectedCtr(curve, pos); return Number.isFinite(v) ? v : null; } catch { return null; }
  };
  const curveA = safeCurve(prev.meta);
  const curveB = safeCurve(curr.meta);
  const rows = comparable.map(({ query, before, after }) => {
    const pageBefore = pa.get(query)?.page;
    const pageAfter = pb.get(query)?.page;
    const expA = safeExpected(curveA, before.position);
    const expB = safeExpected(curveB, after.position);
    return {
      query,
      position_before: before.position,
      position_after: after.position,
      position_delta: after.position - before.position,
      ctr_before: before.ctr,
      ctr_after: after.ctr,
      // **順位で説明できるぶんを引いた残り。**順位が上がればCTRは上がるので、
      // 生のCTR差だけを見ると「意図が変わった」と「順位が動いた」を混ぜる
      gap_before: expA == null ? null : before.ctr - expA,
      gap_after: expB == null ? null : after.ctr - expB,
      page_before: pageBefore ? shortPath(pageBefore) : null,
      page_after: pageAfter ? shortPath(pageAfter) : null,
      page_switched: Boolean(pageBefore && pageAfter && pageBefore !== pageAfter),
    };
  });

  const windowBefore = [prev.meta?.period_start ?? null, prev.meta?.period_end ?? null];
  const windowAfter = [curr.meta?.period_start ?? null, curr.meta?.period_end ?? null];
  const overlap = windowOverlapDays(windowBefore, windowAfter);
  const sourceBefore = collectionEvidence(prev.meta);
  const sourceAfter = collectionEvidence(curr.meta);
  const issues = collectionIssues(sourceBefore, sourceAfter, windowBefore, windowAfter);
  const collectionComparable = issues.length === 0;
  return {
    from: prev.label,
    to: curr.label,
    window_before: windowBefore,
    window_after: windowAfter,
    window_overlap_days: overlap,
    collection_before: sourceBefore,
    collection_after: sourceAfter,
    collection_comparable: collectionComparable,
    collection_issues: issues,
    interpretation: !collectionComparable ? 'incompatible_collection_reference_only'
      : overlap === null ? 'window_unknown_descriptive' : overlap > 0
      ? 'overlapping_windows_descriptive' : 'separate_windows_descriptive',
    min_impressions: minImpressions,
    common_query_count: rows.length,
    comparable: collectionComparable ? rows.length : 0,
    excluded_observations: collectionComparable ? null : {
      page_differences: rows.filter((r) => r.page_switched).length,
      position_differences: rows.filter((r) => !r.page_switched
        && Math.abs(r.position_delta) >= POSITION_SHIFT).length,
    },
    switched: collectionComparable ? rows.filter((r) => r.page_switched) : [],
    moved: (collectionComparable ? rows : []).filter((r) => !r.page_switched
      && Math.abs(r.position_delta) >= POSITION_SHIFT)
      .sort((x, y) => Math.abs(y.position_delta) - Math.abs(x.position_delta)),
  };
}

/**
 * **窓が同じ長さかどうかを言う。**違うなら、表示回数を比べてはいけないと明示する。
 * 黙って比べると「増えた/減った」が窓の長さの話になる。
 */
export function windowNote(r) {
  const d0 = windowDays(r.window_before); const d1 = windowDays(r.window_after);
  if (d0 == null || d1 == null) return '**窓の長さが分からない**（meta に period が無い）';
  const length = d0 === d1 ? `窓は同じ長さ（${d0}日）`
    : `**窓の長さが違う（${d0}日 → ${d1}日）。**表示回数は比べていない`;
  const overlap = r.window_overlap_days ?? windowOverlapDays(r.window_before, r.window_after);
  if (r.collection_comparable === false) {
    return overlap === null ? `${length}。窓の重複は確認できない`
      : `${length}、期間の重複 ${overlap}日。収集条件が揃わず差は評価しない`;
  }
  if (overlap === null) return `${length}。窓の重複は確認できない`;
  if (overlap > 0) return `${length}、**${overlap}日が重複**。順位・CTR・最多ページの差は記述的な調査候補で、検索意図の変化や施策効果を証明しない`;
  return `${length}、期間の重複なし。順位・CTR・最多ページの差だけを見ており、施策効果は証明しない`;
}

export function validate(r) {
  const problems = [];
  if (r.collection_comparable === false) {
    problems.push(`収集条件が揃わないため比較不能: ${r.collection_issues.join(', ')}`);
  }
  if (r.collection_comparable !== false && r.comparable === 0) {
    problems.push('比べられるクエリが0件 — **両窓に共通で母数の足りるクエリが無い。**'
      + 'スナップショットが揃っているか確認すること');
  }
  for (const s of r.switched) {
    if (!s.page_before || !s.page_after) {
      problems.push(`${s.query}: 片側のページが無いのに入れ替わり扱いになっている`);
    }
  }
  for (const m of r.moved) {
    if (m.page_switched) problems.push(`${m.query}: 入れ替わりが順位変化の側に混ざっている`);
    if (Math.abs(m.position_delta) < POSITION_SHIFT) {
      problems.push(`${m.query}: しきい値 ${POSITION_SHIFT} 未満なのに並んでいる`);
    }
  }
  return problems;
}

export function render(r) {
  const o = [];
  const p = (x) => (x == null ? '  —  ' : `${(x * 100).toFixed(1)}%`.padStart(6));
  o.push(`検索クエリと主要ページの観測差 ${r.from} → ${r.to}`);
  o.push(`  ${windowNote(r)}`);
  const before = r.collection_before; const after = r.collection_after;
  o.push(`  収集条件 ${before.source ?? '不明'} / ${before.search_type ?? '不明'} / ${before.aggregation ?? '不明'}`
    + ` → ${after.source ?? '不明'} / ${after.search_type ?? '不明'} / ${after.aggregation ?? '不明'}`);
  if (!r.collection_comparable) {
    o.push(`  **比較不能: ${r.collection_issues.join(', ')}。**候補は出さない。`);
    if (r.collection_issues.includes('selected_page_only_export')) {
      o.push('  CSV の選択ページだけを集めた結果は、サイト全体の最多表示ページを示さない。');
    }
    return o.join('\n');
  }
  o.push(`  比べたクエリ ${r.comparable} 件（両窓とも表示 ${r.min_impressions} 回以上）\n`);

  o.push(`■ 収集済みページの最多表示が異なる調査候補 ${r.switched.length} 件`);
  if (!r.switched.length) o.push('    無し');
  for (const s of r.switched) {
    o.push(`    ${s.query.slice(0, 32).padEnd(32)} ${s.page_before} → ${s.page_after}`);
    o.push(`    ${' '.repeat(32)} 順位 ${s.position_before.toFixed(1)} → ${s.position_after.toFixed(1)}`
      + ` / CTR ${p(s.ctr_before)} → ${p(s.ctr_after)}`);
  }

  o.push(`\n■ 順位が ${POSITION_SHIFT} 位以上動いた（ページは同じ） ${r.moved.length} 件`);
  if (!r.moved.length) o.push('    無し');
  for (const m of r.moved.slice(0, 8)) {
    o.push(`    ${m.position_delta > 0 ? '↓' : '↑'}${Math.abs(m.position_delta).toFixed(1).padStart(5)}`
      + `  ${m.position_before.toFixed(1)} → ${m.position_after.toFixed(1)}  ${m.query.slice(0, 40)}`);
  }
  if (r.moved.length > 8) o.push(`    … 他 ${r.moved.length - 8}件`);

  o.push('\n  **クエリの出現・消滅は出していない。**古いCSVには行数上限があり、');
  o.push('  BigQueryも匿名化されたクエリ名を含まない。期間差による有無だけで');
  o.push('  **検索意図の変化とは判定しない。**');
  return o.join('\n');
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const snap = (label, queries, queryPages, meta = {}) =>
  ({ label, meta: {
    period_start: '2026-08-01', period_end: '2026-08-14', source: 'bigquery',
    complete_window: true, totals: { source: 'dates' },
    bigquery: { search_type: 'WEB', window_days_available: 14, window_days_requested: 14,
      min_query_page_impressions: 2 },
    ...meta,
  }, queries, queryPages });
const Q = (query, position, ctr, impressions = 100) => ({ query, position, ctr, impressions, clicks: 1 });
const QP = (query, page, impressions = 100) => ({ query, page, impressions, clicks: 1, position: 1, ctr: 0.1 });

function selftest() {
  const { t, finish } = selftestTally();

  const base = (qs, qps) => snap('x', qs, qps);

  // **母数が足りないものは比べない**
  const thin = compare(base([Q('a', 5, 0.1, 3)], []), base([Q('a', 9, 0.1, 3)], []));
  t('**母数が足りなければ比べない**（1クリックでCTRが跳ねる）', thin.comparable === 0);

  // 片方の窓にしか無いクエリは扱わない
  const only = compare(base([Q('a', 5, 0.1)], []), base([Q('b', 5, 0.1)], []));
  t('**片方にしか無いクエリは出さない**（行数上限と区別できない）', only.comparable === 0);

  // ページの入れ替わり
  const sw = compare(base([Q('a', 5, 0.1)], [QP('a', 'https://x/old/')]),
    base([Q('a', 5, 0.1)], [QP('a', 'https://x/new/')]));
  t('当たるページが変わったら拾う', sw.switched.length === 1);
  t('パスだけにして出す', sw.switched[0].page_before === '/old/' && sw.switched[0].page_after === '/new/');

  // 同じページなら入れ替わりではない
  const same = compare(base([Q('a', 5, 0.1)], [QP('a', 'https://x/p/')]),
    base([Q('a', 5, 0.1)], [QP('a', 'https://x/p/')]));
  t('同じページなら入れ替わりにしない', same.switched.length === 0);

  // 順位の変化
  const mv = compare(base([Q('a', 12, 0.1)], []), base([Q('a', 5, 0.1)], []));
  t(`順位が ${POSITION_SHIFT} 位以上動いたら拾う`, mv.moved.length === 1);
  const small = compare(base([Q('a', 6, 0.1)], []), base([Q('a', 5, 0.1)], []));
  t('**小さな揺れは拾わない**', small.moved.length === 0);

  // 入れ替わりと順位変化を二重に数えない
  const both = compare(base([Q('a', 12, 0.1)], [QP('a', 'https://x/old/')]),
    base([Q('a', 5, 0.1)], [QP('a', 'https://x/new/')]));
  t('**入れ替わりを順位変化の側に混ぜない**（二重に数えない）',
    both.switched.length === 1 && both.moved.length === 0);

  // 窓の長さ
  t('**窓の長さが違えば、そう言う**',
    windowNote({ window_before: ['2026-07-01', '2026-07-28'], window_after: ['2026-08-01', '2026-08-13'] })
      .includes('窓の長さが違う'));
  t('同じ長さならそう言う',
    windowNote({ window_before: ['2026-08-01', '2026-08-14'], window_after: ['2026-08-15', '2026-08-28'] })
      .includes('同じ長さ'));
  t('**28日窓の21日重複を明示し、意図変化と断定しない**',
    windowOverlapDays(['2026-08-23', '2026-09-19'], ['2026-08-30', '2026-09-26']) === 21
      && windowNote({ window_before: ['2026-08-23', '2026-09-19'], window_after: ['2026-08-30', '2026-09-26'] })
        .includes('検索意図の変化や施策効果を証明しない'));
  t('期間が接しているだけなら重複0日、無効な日付は不明にする',
    windowOverlapDays(['2026-08-01', '2026-08-14'], ['2026-08-15', '2026-08-28']) === 0
      && windowOverlapDays(['2026-08-32', '2026-09-01'], ['2026-09-02', '2026-09-03']) === null);
  t('**period が無ければ「分からない」と言う**（同じ長さと決めない）',
    windowNote({ window_before: [null, null], window_after: [null, null] }).includes('分からない'));
  t('不正な日付を NaN 日の窓として表示しない',
    windowNote({ window_before: ['2026-08-32', '2026-09-01'], window_after: ['2026-09-02', '2026-09-03'] })
      .includes('窓の長さが分からない'));

  const historical = compare(
    snap('csv', [Q('a', 5, 0.1)], [QP('a', 'https://x/old/')], {
      source: 'csv-export', complete_window: undefined, bigquery: undefined,
      period_start: '2026-07-13', period_end: '2026-08-09',
    }),
    snap('bq', [Q('a', 5, 0.1)], [QP('a', 'https://x/new/')], {
      complete_window: undefined,
      bigquery: { search_type: 'WEB', window_days_available: 13, window_days_requested: 28,
        min_query_page_impressions: 2 },
      period_start: '2026-08-10', period_end: '2026-08-22',
    }),
  );
  t('**CSVの選択ページと不完全なBigQuery窓を候補扱いしない**',
    historical.interpretation === 'incompatible_collection_reference_only'
      && historical.collection_issues.includes('different_or_unknown_source')
      && historical.collection_issues.includes('selected_page_only_export')
      && historical.collection_issues.includes('incomplete_or_unverified_window')
      && historical.switched.length === 0 && historical.excluded_observations.page_differences === 1
      && render(historical).includes('比較不能')
      && !render(historical).includes('順位・CTR・最多ページの差だけを見ており'));
  const validOverlap = compare(
    snap('week1', [Q('a', 5, 0.1)], [QP('a', 'https://x/old/')], {
      period_start: '2026-08-23', period_end: '2026-09-19',
      bigquery: { search_type: 'WEB', window_days_available: 28, window_days_requested: 28,
        min_query_page_impressions: 2 },
    }),
    snap('week2', [Q('a', 5, 0.1)], [QP('a', 'https://x/new/')], {
      period_start: '2026-08-30', period_end: '2026-09-26',
      bigquery: { search_type: 'WEB', window_days_available: 28, window_days_requested: 28,
        min_query_page_impressions: 2 },
    }),
  );
  t('同じ収集条件でも21日重複を記述的に扱う',
    validOverlap.collection_comparable && validOverlap.window_overlap_days === 21
      && validOverlap.interpretation === 'overlapping_windows_descriptive'
      && validOverlap.switched.length === 1);
  const thresholdChanged = compare(
    snap('a', [Q('a', 5, 0.1)], [QP('a', 'https://x/old/')]),
    snap('b', [Q('a', 5, 0.1)], [QP('a', 'https://x/new/')], {
      bigquery: { search_type: 'WEB', window_days_available: 14, window_days_requested: 14,
        min_query_page_impressions: 5 },
    }),
  );
  t('query-page の収集下限が変われば候補を出さない',
    thresholdChanged.collection_issues.includes('different_or_unknown_query_page_threshold')
      && thresholdChanged.switched.length === 0 && thresholdChanged.comparable === 0);

  // 比べられない状態を「変化なし」と読まない
  t('**比べられるクエリが0件なら落ちる**（0件と「変化なし」を混ぜない）',
    validate({ comparable: 0, switched: [], moved: [] }).length === 1);

  // 実データ
  const labels = listSnapshots();
  if (labels.length >= 2) {
    const r = compare(loadSnapshot(labels[labels.length - 2]), loadSnapshot(labels[labels.length - 1]));
    t('**実データで比べられる**', r.comparable > 0);
    t('実データの検査が通る', validate(r).length === 0);
    if (labels.includes('2026-08-11') && labels.includes('2026-08-24')) {
      const historicalActual = compare(loadSnapshot('2026-08-11'), loadSnapshot('2026-08-24'));
      t('旧CSV→BigQueryの実データを候補にしない',
        historicalActual.interpretation === 'incompatible_collection_reference_only'
          && historicalActual.switched.length === 0
          && historicalActual.excluded_observations.page_differences > 0
          && validate(historicalActual).some((p) => p.includes('比較不能')));
    }
  } else {
    t('**スナップショットが2つ未満**（比較そのものが成立しない）', false);
  }

  return finish();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const labels = listSnapshots();
  if (labels.length < 2) {
    console.error('スナップショットが2つ未満 — **窓をまたいだ比較が成立しない**');
    process.exit(1);
  }
  const r = compare(loadSnapshot(labels[labels.length - 2]), loadSnapshot(labels[labels.length - 1]));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(render(r));
  const problems = validate(r);
  if (problems.length) {
    console.error('\n検索クエリ比較: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n比較は共通クエリのみ。出現・消滅は使っていない。');
}
