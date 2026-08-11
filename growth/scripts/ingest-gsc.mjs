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

const files = fs.readdirSync(inputDir).filter((f) => /\.(csv|tsv)$/i.test(f));
if (!files.length) {
  console.error(`No .csv/.tsv files in ${inputDir}.\nSee growth/GSC_OWNER_ACTION.md — the whole export unzips straight into this directory.`);
  process.exit(2);
}

const buckets = emptyBuckets();
const skipped = [];

for (const f of files) {
  const text = fs.readFileSync(path.join(inputDir, f), 'utf8');
  const { rows, columns, unmapped } = parseGscExport(text);
  if (!rows.length) { skipped.push(`${f}: no data rows`); continue; }

  const has = (c) => columns.includes(c);
  let kind = null;
  if (has('query') && has('page')) kind = 'query-pages';
  else if (has('query')) kind = 'queries';
  else if (has('page')) kind = 'pages';
  else if (has('date')) kind = 'dates';
  else if (has('device')) kind = 'devices';
  else if (has('country')) kind = 'countries';

  if (!kind) { skipped.push(`${f}: no recognised dimension (columns: ${columns.join(', ') || 'none'})`); continue; }

  // Normalise page URLs to site-relative paths so they join against the
  // repo's own page inventory without every consumer re-parsing origins.
  for (const r of rows) if (r.page) r.page = toPath(r.page);

  buckets[kind].push(...rows);
  const extra = unmapped.length ? ` (unmapped columns kept out: ${unmapped.join(', ')})` : '';
  console.log(`  ${f} → ${kind}: ${rows.length} rows${extra}`);
}

skipped.forEach((s) => console.log(`  skipped ${s}`));

const totalRows = Object.values(buckets).reduce((n, b) => n + b.length, 0);
if (!totalRows) {
  console.error('Nothing ingested — no file carried a recognised dimension.');
  process.exit(2);
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
