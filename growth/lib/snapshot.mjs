/**
 * Everything that turns a set of dimension rows into a committed snapshot.
 *
 * This used to live inside ingest-gsc.mjs, which was fine while a CSV drop was
 * the only way data arrived. There are now two sources — the manual export and
 * the BigQuery bulk export — and the analysis downstream must not be able to
 * tell them apart. Any drift between two copies of the totals rule or the CTR
 * curve fit would show up as a step change on the day the source switched, and
 * would be read as the site changing rather than the pipeline changing. One
 * implementation, both callers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GSC_DIR, buildCtrCurve, buildSegmentCurves } from './gsc.mjs';
import { QUERY_CLASSIFIER_VERSION } from './clusters.mjs';

/**
 * `pages-aio` holds the "Performance on Search Generative AI Features" export:
 * a page table with impressions and nothing else — Google reports no clicks,
 * CTR or position for AI surfaces. It is a separate kind rather than a flag on
 * `pages` because everything downstream of `pages` divides clicks by
 * impressions somewhere, and these rows have no clicks to divide.
 */
export const BUCKET_KINDS = ['queries', 'pages', 'pages-aio', 'query-pages', 'dates', 'devices', 'countries', 'dates-aio', 'devices-aio', 'countries-aio'];

export const emptyBuckets = () => Object.fromEntries(BUCKET_KINDS.map((k) => [k, []]));

const sum = (rows) => rows.reduce(
  (acc, r) => ({ clicks: acc.clicks + (r.clicks || 0), impressions: acc.impressions + (r.impressions || 0) }),
  { clicks: 0, impressions: 0 }
);

/**
 * Build the `meta.json` that every detector reads.
 *
 * @param {object} opts
 * @param {string}   opts.label     snapshot label, YYYY-MM-DD
 * @param {object}   opts.buckets   dimension name → rows
 * @param {string}   [opts.period]  "YYYY-MM-DD..YYYY-MM-DD"
 * @param {string}   [opts.source]  'csv-export' | 'bigquery'
 * @param {string[]} [opts.sourceFiles]
 * @param {object}   [opts.extra]   source-specific fields merged into meta
 */
export function buildMeta({ label, buckets, period = null, source = 'csv-export', sourceFiles = [], extra = {} }) {
  // Site totals come from the `dates` dimension, never from queries.
  //
  // The manual query export is capped at 1,000 rows and omits anonymised
  // queries, so it covers only a fraction of real traffic — on the 2026-08-09
  // export it showed 257 clicks / 15,778 impressions against a true 813 /
  // 38,599. Reporting the query-table sum as "site clicks" would understate
  // traffic by ~68% while looking perfectly plausible, which is worse than
  // having no number at all. The BigQuery export lifts the row cap but not the
  // anonymised-query exclusion, so the ordering below still holds there.
  // Pages is a close second (near-complete); queries is the last resort and is
  // flagged when used.
  const totalsSource =
    buckets.dates.length ? { rows: buckets.dates, from: 'dates' }
    : buckets.pages.length ? { rows: buckets.pages, from: 'pages' }
    : { rows: buckets.queries, from: 'queries (TRUNCATED — top 1,000 only; treat as a floor)' };
  const totals = sum(totalsSource.rows);

  // The CTR curve prefers `pages` over `queries` for the same reason, plus one
  // more: GSC sorts the top-1,000 query list by clicks, so the rows that get cut
  // are disproportionately high-impression/low-click ones. A curve fitted to
  // what survives runs high, and an inflated expected CTR manufactures
  // "opportunities" out of ordinary performance — the exact error this curve
  // exists to avoid. Pages carries position at near-full impression coverage.
  const curveSource = buckets.pages.length ? buckets.pages : buckets.queries;
  const curveFrom = buckets.pages.length ? 'pages' : 'queries';
  const { curve, derivedPositions, calibration } = buildCtrCurve(curveSource);
  // Japanese and English pages do not click alike at the same position, so a
  // single curve judges the smaller segment against the larger one's standard.
  const segmentCurves = curveFrom === 'pages' ? buildSegmentCurves(curveSource) : {};

  const coverage = totals.impressions
    ? sum(curveSource).impressions / totals.impressions
    : null;

  const aiPages = buckets['pages-aio'] || [];
  const aiDates = buckets['dates-aio'] || [];
  const aiTotal = rows => rows.length && rows.every(r => Number.isFinite(r.impressions))
    ? rows.reduce((n, r) => n + r.impressions, 0) : null;
  const pageImpressions = aiTotal(aiPages);
  const propertyImpressions = aiTotal(aiDates);
  const dateSet = rows => [...new Set(rows.map(r => r.date))].sort();
  const sameDates = aiDates.length > 0 && buckets.dates.length > 0
    && JSON.stringify(dateSet(aiDates)) === JSON.stringify(dateSet(buckets.dates));
  const periodDays = period ? (Date.parse(period.split('..')[1]) - Date.parse(period.split('..')[0])) / 86400000 + 1 : null;
  const completeWindow = Number.isFinite(periodDays) && periodDays > 0
    && dateSet(buckets.dates).length === periodDays
    && dateSet(buckets.dates)[0] === period.split('..')[0]
    && dateSet(buckets.dates).at(-1) === period.split('..')[1]
    && buckets.dates.every(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date)
      && Number.isFinite(Date.parse(r.date)) && new Date(r.date).toISOString().slice(0, 10) === r.date)
    && (!extra.bigquery || extra.bigquery.window_days_available >= extra.bigquery.window_days_requested);
  const hasAi = ['pages-aio', 'dates-aio', 'countries-aio', 'devices-aio'].some(k => buckets[k]?.length);

  return {
    label,
    captured_at: new Date().toISOString().slice(0, 10),
    period_start: period ? period.split('..')[0] : null,
    period_end: period ? period.split('..').pop() : null,
    // Where the rows came from. Snapshots taken before this field existed are
    // all CSV drops, so a missing value reads as 'csv-export'.
    source,
    source_files: sourceFiles,
    query_classifier_version: QUERY_CLASSIFIER_VERSION,
    complete_window: completeWindow,
    row_counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    totals: {
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.impressions ? totals.clicks / totals.impressions : null,
      source: totalsSource.from,
    },
    // Property and URL aggregation differ. Never divide an AI page sum by
    // the WEB property total, or infer an AI CTR from impressions-only rows.
    aio: hasAi ? {
      impressions: aiDates.length ? propertyImpressions : pageImpressions,
      aggregation: aiDates.length ? 'property' : 'page',
      property_impressions: propertyImpressions,
      page_impressions: pageImpressions,
      pages: aiPages.length,
      period_start: dateSet(aiDates)[0] ?? null,
      period_end: dateSet(aiDates).at(-1) ?? null,
      same_web_dates: sameDates,
      impression_share: sameDates && totalsSource.from === 'dates' && totals.impressions > 0 && propertyImpressions != null
        ? propertyImpressions / totals.impressions : null,
    } : null,
    ctr_curve: curve,
    ctr_curve_source: curveFrom,
    // Share of total impressions the curve was fitted on. A low value means the
    // curve reflects a biased slice, not the site.
    ctr_curve_coverage: coverage,
    // Which positions the curve measured from this site's own rows vs. fell back
    // to the reference table. A reader comparing two snapshots needs to know
    // whether a moved "expected CTR" reflects the site or just better coverage.
    ctr_curve_derived_positions: derivedPositions,
    // Level fitted against the reference shape: <1 means the site clicks less
    // than the reference table predicts for the positions it holds.
    ctr_curve_calibration: calibration,
    // Per-language curves. Only segments with enough impressions to fit their own
    // appear here; everything else falls back to `ctr_curve` via curveFor().
    ctr_curve_segments: segmentCurves,
    ...extra,
  };
}

/** Write `<dir>/<label>/{meta,<dimension>}.json`. Returns the directory written. */
export function writeSnapshot({ label, buckets, meta, dir = GSC_DIR }) {
  const outDir = path.join(dir, label);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [kind, rows] of Object.entries(buckets)) {
    if (!rows.length) {
      if (BUCKET_KINDS.includes(kind)) fs.rmSync(path.join(outDir, `${kind}.json`), { force: true });
      continue;
    }
    fs.writeFileSync(path.join(outDir, `${kind}.json`), JSON.stringify(rows, null, 0) + '\n');
  }
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  return outDir;
}

/** The two lines worth printing after an ingest, whichever source produced it. */
export function summarise(meta) {
  const lines = [
    `  ${meta.totals.clicks} clicks · ${meta.totals.impressions} impressions · ` +
    `CTR ${(meta.totals.ctr * 100).toFixed(2)}%  [totals from: ${meta.totals.source}]`,
    `  CTR curve fitted on ${meta.ctr_curve_source}` +
    (meta.ctr_curve_coverage != null ? ` (${(meta.ctr_curve_coverage * 100).toFixed(0)}% of total impressions)` : '') +
    `; measured at positions: ${meta.ctr_curve_derived_positions.join(', ') || '(none — reference curve throughout)'}`,
  ];
  return lines.join('\n');
}
