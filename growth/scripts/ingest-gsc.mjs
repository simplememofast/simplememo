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
import { ROOT, toPath } from '../lib/gsc.mjs';
import { buildMeta, emptyBuckets, summarise, writeSnapshot } from '../lib/snapshot.mjs';

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
 * Search Console has no query x page export. You filter the report to a page
 * and export its queries, so a filtered export IS the query x page data — but
 * only its `フィルタ.csv` says which page it belongs to.
 *
 * Every export also ships the same seven filenames, so filtered exports have to
 * sit in their own subdirectories, and only their query file may be read: the
 * rest (pages, devices, countries) describe one filtered slice and would be
 * summed into the site totals as if they were the whole site.
 */
function pageFilterOf(dir, csvs) {
  const name = csvs.find((f) => /^(フィルタ|filters?)\.csv$/i.test(f));
  if (!name) return null;
  const text = fs.readFileSync(path.join(dir, name), 'utf8');
  const m = text.match(/^\s*(?:ページ|Page)\s*,\s*\+?(.+?)\s*$/mi);
  return m ? toPath(m[1]) : null;
}

const buckets = emptyBuckets();
const skipped = [];
const files = [];

function ingestDir(dir, label) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const csvs = entries.filter((e) => e.isFile() && /\.(csv|tsv)$/i.test(e.name)).map((e) => e.name);
  const subdirs = entries.filter((e) => e.isDirectory() && e.name !== '__MACOSX').map((e) => e.name);
  const scopedPage = pageFilterOf(dir, csvs);

  for (const name of csvs) {
    const f = label ? `${label}/${name}` : name;
    files.push(f);
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    ingestFile(f, text, scopedPage);
  }
  for (const sub of subdirs) ingestDir(path.join(dir, sub), label ? `${label}/${sub}` : sub);
}

function ingestFile(f, text, scopedPage) {
  const { rows, columns, unmapped } = parseGscExport(text);
  if (!rows.length) { skipped.push(`${f}: no data rows`); return; }

  const has = (c) => columns.includes(c);
  let kind = null;
  if (has('query') && has('page')) kind = 'query-pages';
  else if (has('query')) kind = 'queries';
  // The "Performance on Search Generative AI Features" export is a page table
  // with impressions and NOTHING else — Google reports no clicks, CTR or
  // position for AI surfaces. Its filename and headers are identical to the
  // ordinary page export's, so before this branch existed it matched
  // `has('page')` and its 179 rows were appended straight into `pages`. That
  // is silent corruption of the worst kind: page rows would double, totals
  // would inflate, and every AI-surface row would enter the CTR curve as a
  // page earning zero clicks at position 0 — dragging expected CTR down across
  // the whole site while every number still looked plausible.
  else if (has('page') && has('impressions') && !has('clicks')) kind = 'pages-aio';
  else if (has('page')) kind = 'pages';
  else if (has('date')) kind = 'dates';
  else if (has('device')) kind = 'devices';
  else if (has('country')) kind = 'countries';

  if (!kind) { skipped.push(`${f}: no recognised dimension (columns: ${columns.join(', ') || 'none'})`); return; }

  if (scopedPage) {
    // A filtered export contributes its queries, attributed to the filtered
    // page, and nothing else.
    if (kind !== 'queries') { skipped.push(`${f}: filtered to ${scopedPage}, only its queries are used`); return; }
    for (const r of rows) r.page = scopedPage;
    buckets['query-pages'].push(...rows);
    console.log(`  ${f} → query-pages (${scopedPage}): ${rows.length} rows`);
    return;
  }

  // Normalise page URLs to site-relative paths so they join against the
  // repo's own page inventory without every consumer re-parsing origins.
  for (const r of rows) if (r.page) r.page = toPath(r.page);

  buckets[kind].push(...rows);
  const extra = unmapped.length ? ` (unmapped columns kept out: ${unmapped.join(', ')})` : '';
  console.log(`  ${f} → ${kind}: ${rows.length} rows${extra}`);
}

ingestDir(inputDir, '');

if (!files.length) {
  console.error(`No .csv/.tsv files under ${inputDir}.\nSee growth/GSC_OWNER_ACTION.md — unzip each export into its own subdirectory.`);
  process.exit(2);
}

skipped.forEach((s) => console.log(`  skipped ${s}`));

const totalRows = Object.values(buckets).reduce((n, b) => n + b.length, 0);
if (!totalRows) {
  console.error('Nothing ingested — no file carried a recognised dimension.');
  process.exit(2);
}

// 正規化でキーが衝突した行を畳む。
//
// toPath() は `https://…/vs/ticktick/` と `https://www…/vs/ticktick/?x=1` を
// 同じ `/vs/ticktick/` にする。畳まないと**同じページが2行残り、クリックが
// 二重に乗る**。2026-08-09 のスナップショットに実際に1件あった
// （/vs/ticktick/ が impressions 4 と 1 の2行）。
//
// 位置は表示回数で重みづける。単純平均だと、表示1回・順位4.0 の行が
// 表示100回・順位10.5 の行と同じ重さになる。
function mergeByKey(rows, key) {
  const out = new Map();
  for (const r of rows) {
    const k = r[key];
    if (k === undefined || k === null) continue;
    const cur = out.get(k);
    if (!cur) { out.set(k, { ...r }); continue; }
    const ci = (cur.impressions || 0), ri = (r.impressions || 0);
    cur.clicks = (cur.clicks || 0) + (r.clicks || 0);
    cur.impressions = ci + ri;
    if (cur.position != null && r.position != null && ci + ri > 0) {
      cur.position = Number((((cur.position * ci) + (r.position * ri)) / (ci + ri)).toFixed(2));
    }
    cur.ctr = cur.impressions > 0 ? cur.clicks / cur.impressions : 0;
  }
  return [...out.values()];
}

for (const [kind, key] of [['pages', 'page'], ['queries', 'query'], ['dates', 'date'],
                           ['devices', 'device'], ['countries', 'country']]) {
  if (!Array.isArray(buckets[kind])) continue;
  const before = buckets[kind].length;
  buckets[kind] = mergeByKey(buckets[kind], key);
  const merged = before - buckets[kind].length;
  if (merged > 0) console.log(`  merged ${merged} duplicate ${kind} row(s) after path normalisation`);
}

// Totals rule, CTR curve and meta shape are shared with the BigQuery ingest —
// see lib/snapshot.mjs for why they cannot live in either script.
const meta = buildMeta({ label, buckets, period, source: 'csv-export', sourceFiles: files });

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  console.log(JSON.stringify(meta, null, 2));
  process.exit(0);
}

const outDir = writeSnapshot({ label, buckets, meta });

console.log(`\nSnapshot written: ${path.relative(ROOT, outDir)}/`);
console.log(summarise(meta));
if (buckets.queries.length >= 1000) {
  const queryImpressions = buckets.queries.reduce((n, r) => n + (r.impressions || 0), 0);
  console.log(`  note: the query export is capped at 1,000 rows (${queryImpressions.toLocaleString()} of ${meta.totals.impressions.toLocaleString()} impressions). Query-level analysis sees only the head of the distribution.`);
  console.log('        growth/scripts/ingest-bigquery.mjs has no such cap — see growth/BIGQUERY_SETUP.md.');
}
console.log('\nNext:  node growth/scripts/analyze.mjs        # opportunities, CTR gaps, decay, cannibalisation');
console.log('       node growth/scripts/weekly-report.mjs   # the report a human actually reads');
