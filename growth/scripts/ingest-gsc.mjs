#!/usr/bin/env node
/**
 * Turn a Search Console export into a committed, queryable snapshot.
 *
 *   node growth/scripts/ingest-gsc.mjs --label 2026-08-09 --dir growth/input \
 *        [--period 2026-07-12..2026-08-08] [--dry-run]
 *
 * Before this existed, every GSC number on this project lived in the prose of a
 * markdown report. That is fine for reading once and useless for everything
 * else: you cannot diff prose, so decay detection, cannibalisation checks and
 * before/after evaluation all had to be redone by hand from a dashboard each
 * time. Snapshots are committed precisely so a decision made in August can be
 * re-derived in October from the same bytes.
 *
 * Files are classified by their COLUMNS, not their names, because the export
 * ships localised filenames and headers (a Japanese account gets
 * 「クエリ.csv」 with 「上位のクエリ,クリック数,…」). See lib/csv.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseGscExport } from '../lib/csv.mjs';
import { ROOT, GSC_DIR, buildCtrCurve, buildSegmentCurves, toPath } from '../lib/gsc.mjs';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const dryRun = argv.includes('--dry-run');
const label = flag('label', new Date().toISOString().slice(0, 10));
const inputDir = path.resolve(ROOT, flag('dir', 'growth/input'));
const period = flag('period');

if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) {
  console.error(`--label must be YYYY-MM-DD (got ${JSON.stringify(label)})`);
  process.exit(2);
}
if (!fs.existsSync(inputDir)) {
  console.error(`input directory not found: ${inputDir}\nSee growth/GSC_OWNER_ACTION.md for what to export and where to put it.`);
  process.exit(2);
}

/**
 * One export directory. Search Console has no query x page export — you filter
 * the report to a page and export its queries — so a filtered export IS the
 * query x page data, but only its `フィルタ.csv` says which page it belongs to.
 *
 * Every export also ships the same seven filenames, so filtered exports have to
 * live in their own subdirectories and only their query file may be read: the
 * rest (pages, devices, countries) describe one filtered slice and would be
 * summed into the site totals as if they were the whole site.
 */
function readExportDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const csvs = entries.filter((e) => e.isFile() && /\.(csv|tsv)$/i.test(e.name)).map((e) => e.name);
  const subdirs = entries.filter((e) => e.isDirectory() && e.name !== '__MACOSX').map((e) => e.name);
  return { csvs, subdirs };
}

/** The page a filtered export is scoped to, or null for a whole-site export. */
function pageFilterOf(dir, csvs) {
  const name = csvs.find((f) => /^(フィルタ|filters?)\.csv$/i.test(f));
  if (!name) return null;
  const text = fs.readFileSync(path.join(dir, name), 'utf8');
  const m = text.match(/^\s*(?:ページ|Page)\s*,\s*\+?(.+?)\s*$/mi);
  return m ? toPath(m[1]) : null;
}

const buckets = { queries: [], pages: [], 'query-pages': [], dates: [], devices: [], countries: [] };
const skipped = [];
const sourceFiles = [];
let sawAnyCsv = false;

function ingestDir(dir, label) {
  const { csvs, subdirs } = readExportDir(dir);
  const scopedPage = pageFilterOf(dir, csvs);

  for (const f of csvs) {
    sawAnyCsv = true;
    const rel = label ? `${label}/${f}` : f;
    sourceFiles.push(rel);
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    const { rows, columns, unmapped } = parseGscExport(text);
    if (!rows.length) { skipped.push(`${rel}: no data rows`); continue; }

    const has = (c) => columns.includes(c);
    let kind = null;
    if (has('query') && has('page')) kind = 'query-pages';
    else if (has('query')) kind = 'queries';
    else if (has('page')) kind = 'pages';
    else if (has('date')) kind = 'dates';
    else if (has('device')) kind = 'devices';
    else if (has('country')) kind = 'countries';

    if (!kind) { skipped.push(`${rel}: no recognised dimension (columns: ${columns.join(', ') || 'none'})`); continue; }

    if (scopedPage) {
      // A filtered export contributes its queries, attributed to the filtered
      // page, and nothing else.
      if (kind !== 'queries') { skipped.push(`${rel}: filtered to ${scopedPage}, only its queries are used`); continue; }
      for (const r of rows) r.page = scopedPage;
      buckets['query-pages'].push(...rows);
      console.log(`  ${rel} → query-pages (${scopedPage}): ${rows.length} rows`);
      continue;
    }

    // Normalise page URLs to site-relative paths so they join against the
    // repo's own page inventory without every consumer re-parsing origins.
    for (const r of rows) if (r.page) r.page = toPath(r.page);

    buckets[kind].push(...rows);
    const extra = unmapped.length ? ` (unmapped columns kept out: ${unmapped.join(', ')})` : '';
    console.log(`  ${rel} → ${kind}: ${rows.length} rows${extra}`);
  }

  for (const sub of subdirs) ingestDir(path.join(dir, sub), label ? `${label}/${sub}` : sub);
}

ingestDir(inputDir, '');

if (!sawAnyCsv) {
  console.error(`No .csv/.tsv files under ${inputDir}.\nSee growth/GSC_OWNER_ACTION.md — unzip each export into its own subdirectory.`);
  process.exit(2);
}

skipped.forEach((s) => console.log(`  skipped ${s}`));

const totalRows = Object.values(buckets).reduce((n, b) => n + b.length, 0);
if (!totalRows) {
  console.error('Nothing ingested — no file carried a recognised dimension.');
  process.exit(2);
}

const sum = (rows) => rows.reduce(
  (acc, r) => ({ clicks: acc.clicks + (r.clicks || 0), impressions: acc.impressions + (r.impressions || 0) }),
  { clicks: 0, impressions: 0 }
);

// Site totals come from the `dates` dimension, never from queries.
//
// The query export is capped at 1,000 rows and omits anonymised queries, so it
// covers only a fraction of real traffic — on the 2026-08-09 export it showed
// 257 clicks / 15,778 impressions against a true 813 / 38,599. Reporting the
// query-table sum as "site clicks" would understate traffic by ~68% while
// looking perfectly plausible, which is worse than having no number at all.
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

const meta = {
  label,
  captured_at: new Date().toISOString().slice(0, 10),
  period_start: period ? period.split('..')[0] : null,
  period_end: period ? period.split('..').pop() : null,
  source_files: sourceFiles,
  row_counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
  totals: {
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.impressions ? totals.clicks / totals.impressions : null,
    source: totalsSource.from,
  },
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
};

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  console.log(JSON.stringify(meta, null, 2));
  process.exit(0);
}

const outDir = path.join(GSC_DIR, label);
fs.mkdirSync(outDir, { recursive: true });
for (const [kind, rows] of Object.entries(buckets)) {
  if (!rows.length) continue;
  fs.writeFileSync(path.join(outDir, `${kind}.json`), JSON.stringify(rows, null, 0) + '\n');
}
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

console.log(`\nSnapshot written: growth/data/gsc/${label}/`);
console.log(`  ${totals.clicks} clicks · ${totals.impressions} impressions · CTR ${(meta.totals.ctr * 100).toFixed(2)}%  [totals from: ${totalsSource.from}]`);
console.log(`  CTR curve fitted on ${curveFrom}` +
  (coverage != null ? ` (${(coverage * 100).toFixed(0)}% of total impressions)` : '') +
  `; measured at positions: ${derivedPositions.join(', ') || '(none — reference curve throughout)'}`);
if (buckets.queries.length >= 1000) {
  console.log(`  note: the query export is capped at 1,000 rows (${sum(buckets.queries).impressions.toLocaleString()} of ${totals.impressions.toLocaleString()} impressions). Query-level analysis sees only the head of the distribution.`);
}
console.log('\nNext:  node growth/scripts/analyze.mjs        # opportunities, CTR gaps, decay, cannibalisation');
console.log('       node growth/scripts/weekly-report.mjs   # the report a human actually reads');
