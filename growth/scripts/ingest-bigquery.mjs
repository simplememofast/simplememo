#!/usr/bin/env node
/**
 * Build a snapshot from the Search Console BigQuery bulk export.
 *
 *   node growth/scripts/ingest-bigquery.mjs --site sc-domain:simplememofast.com \
 *        [--project yurika-simplememo] [--dataset searchconsole] \
 *        [--label 2026-08-11] [--days 28] [--end 2026-08-09] [--dry-run]
 *
 * This is the same destination as ingest-gsc.mjs — an identical snapshot under
 * growth/data/gsc/<label>/ — reached without a human downloading a ZIP. What
 * changes is not convenience but coverage, in three ways that matter to the
 * detectors downstream:
 *
 *   1. **No 1,000-row cap.** The manual query export is truncated and sorted by
 *      clicks, so it showed 257 of the site's 813 clicks on 2026-08-09 and cut
 *      exactly the high-impression/low-click rows the CTR work is aimed at.
 *      Here the query list is complete.
 *
 *   2. **query×page for free.** GSC_OWNER_ACTION.md step 3 asks for this one
 *      page at a time and says to skip it if pressed — so it was skipped, and
 *      `query-pages: 0` in every snapshot on file means the cannibalisation
 *      detector has never once run against data. The export carries the join.
 *
 *   3. **Position is computed, not read.** The export stores `sum_top_position`
 *      rather than an average, and average position is
 *      `SUM(sum_top_position)/SUM(impressions) + 1`. The `+ 1` is not cosmetic:
 *      the stored value is zero-indexed, so omitting it moves every page one
 *      rank up the expected-CTR curve and manufactures a CTR gap on every row.
 *
 * What it does NOT change: anonymised queries are still withheld (the row is
 * counted, the string is NULL), so the query table still sums to less than the
 * site total and `meta.totals` still comes from `dates`. The share withheld is
 * recorded in meta rather than left to be rediscovered.
 */

import path from 'node:path';
import { ROOT, GSC_DIR, toPath } from '../lib/gsc.mjs';
import { buildMeta, emptyBuckets, summarise, writeSnapshot } from '../lib/snapshot.mjs';
import { connect, query, tableExists, listTables } from '../lib/bigquery.mjs';

const SITE_TABLE = 'searchdata_site_impression';
const URL_TABLE = 'searchdata_url_impression';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const dryRun = argv.includes('--dry-run');

const project = flag('project', process.env.GCP_PROJECT_ID);
const dataset = flag('dataset', process.env.BQ_DATASET || 'searchconsole');
const site = flag('site', process.env.GSC_PROPERTY);
const days = Number(flag('days', '28'));
const endFlag = flag('end');
const searchType = flag('search-type', 'WEB').toUpperCase();
// A floor on query×page, which is the one dimension with no natural bound: it
// is one row per (query, URL) pair and its long tail is single impressions that
// no detector can act on. Cannibalisation needs 50 impressions on a query and
// unanswered-intent needs 8, so 2 costs nothing and keeps the file readable.
const minQueryPageImpressions = Number(flag('min-query-page-impressions', '2'));
const outDir = flag('out-dir');

if (!site) {
  console.error(
    'No Search Console property. Pass --site or set GSC_PROPERTY.\n' +
    '  Domain property:     sc-domain:simplememofast.com\n' +
    '  URL-prefix property: https://simplememofast.com/\n' +
    '  It must match `site_url` in the export exactly — see growth/BIGQUERY_SETUP.md.'
  );
  process.exit(2);
}
if (!Number.isInteger(days) || days < 1) {
  console.error(`--days must be a positive integer (got ${JSON.stringify(flag('days'))})`);
  process.exit(2);
}

let client;
try {
  client = await connect({ projectId: project });
} catch (e) {
  console.error(`${e.message}\n\n  Run \`node growth/scripts/bq-preflight.mjs\` to check the setup end to end.`);
  process.exit(2);
}
const fq = (table) => `\`${client.projectId}.${dataset}.${table}\``;

// Distinguish "the export was never set up" from "the export has no rows yet".
// They look identical from a query returning zero rows and need opposite fixes,
// and the first 48 hours after enabling the export is exactly when someone is
// most likely to be looking.
for (const table of [SITE_TABLE, URL_TABLE]) {
  if (await tableExists(client, { dataset, table })) continue;
  const present = await listTables(client, { dataset }).catch(() => []);
  console.error(
    `Table ${client.projectId}.${dataset}.${table} does not exist.\n\n` +
    `  The dataset currently holds: ${present.length ? present.map((t) => t.id).join(', ') : '(nothing)'}\n\n` +
    '  Search Console creates searchdata_site_impression, searchdata_url_impression and\n' +
    '  ExportLog itself, on the first export after the connection is accepted — up to 48\n' +
    '  hours after setup. Tables named temp_* with a short expiry are query scratch, not\n' +
    '  the export.\n\n' +
    '  Run `node growth/scripts/bq-preflight.mjs` for what to check.'
  );
  process.exit(2);
}

/* ── Window ──────────────────────────────────────────────────────────────
 * Anchored to the newest date actually present, not to today. Search Console
 * data lands two to three days late and the export runs daily, so a window
 * ending "today" always includes days that are empty because they have not
 * arrived yet — which reads as a traffic collapse in the last three rows of
 * every snapshot, and would drag the CTR curve down with it. */
const { rows: bounds } = await query(client, {
  sql: `SELECT MIN(data_date) AS min_date, MAX(data_date) AS max_date
        FROM ${fq(SITE_TABLE)}
        WHERE site_url = @site`,
  params: { site },
});

const available = bounds[0] || {};
if (!available.max_date) {
  console.error(
    `The export tables exist but hold no rows for site_url = ${JSON.stringify(site)}.\n\n` +
    '  Either the first export has not run yet, or the property string does not match.\n' +
    '  Run `node growth/scripts/bq-preflight.mjs` — it lists the site_url values present.'
  );
  process.exit(2);
}

const end = endFlag || available.max_date;
const startDate = new Date(`${end}T00:00:00Z`);
startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
const start = startDate.toISOString().slice(0, 10);
const effectiveStart = start < available.min_date ? available.min_date : start;
const daysAvailable = Math.round(
  (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${effectiveStart}T00:00:00Z`)) / 86_400_000
) + 1;

const label = flag('label', end);
if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) {
  console.error(`--label must be YYYY-MM-DD (got ${JSON.stringify(label)})`);
  process.exit(2);
}

console.log(`BigQuery ${client.projectId}.${dataset} · ${site}`);
console.log(`  data available: ${available.min_date} .. ${available.max_date}`);
console.log(`  window:         ${effectiveStart} .. ${end}  (${daysAvailable} of ${days} days)`);

// The bulk export does not backfill — it starts collecting the day it is
// switched on. Comparing a 12-day window against a 28-day snapshot is how a
// pipeline change gets read as a traffic collapse, so this is said loudly and
// the actual day count is written into meta for anyone reading later.
if (daysAvailable < days) {
  console.log(
    `\n  ⚠ Only ${daysAvailable} days of history exist. The export does not backfill, so a full\n` +
    `    ${days}-day window is first possible on ` +
    `${new Date(Date.parse(`${available.min_date}T00:00:00Z`) + (days - 1) * 86_400_000).toISOString().slice(0, 10)}.\n` +
    '    Totals below are NOT comparable with 28-day snapshots. Keep taking the manual\n' +
    '    export (growth/GSC_OWNER_ACTION.md) until then.'
  );
}

/* ── Queries ─────────────────────────────────────────────────────────────
 * Average position must come from one pooled ratio over the whole window, not
 * from an average of per-day positions: a day with three impressions would
 * otherwise weigh as much as a day with three hundred. */
const POSITION = 'SAFE_DIVIDE(SUM(sum_top_position), SUM(impressions)) + 1';
const params = { site, start: effectiveStart, end, searchType };
const types = { start: 'DATE', end: 'DATE' };

const dimension = async (label, sql, extraParams = {}, extraTypes = {}) => {
  const started = Date.now();
  const { rows, totalBytesProcessed } = await query(client, {
    sql,
    params: { ...params, ...extraParams },
    types: { ...types, ...extraTypes },
  });
  console.log(`  ${label}: ${rows.length} rows  (${(totalBytesProcessed / 1e6).toFixed(1)} MB, ${Date.now() - started} ms)`);
  return rows;
};

console.log('\nQuerying:');

const buckets = emptyBuckets();

buckets.dates = await dimension('dates      ', `
  SELECT CAST(data_date AS STRING) AS date,
         SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POSITION} AS position
  FROM ${fq(SITE_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end AND search_type = @searchType
  GROUP BY date ORDER BY date`);

// Anonymised queries are counted but not named, so they cannot appear here.
// This is the same exclusion the UI applies to its query list, and the reason
// the query table sums below the site total.
buckets.queries = await dimension('queries    ', `
  SELECT query,
         SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POSITION} AS position
  FROM ${fq(SITE_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end AND search_type = @searchType
    AND is_anonymized_query = FALSE AND query IS NOT NULL
  GROUP BY query ORDER BY clicks DESC, impressions DESC`);

buckets.pages = await dimension('pages      ', `
  SELECT url AS page,
         SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POSITION} AS position
  FROM ${fq(URL_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end AND search_type = @searchType
  GROUP BY page ORDER BY clicks DESC, impressions DESC`);

buckets['query-pages'] = await dimension('query×page ', `
  SELECT query, url AS page,
         SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POSITION} AS position
  FROM ${fq(URL_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end AND search_type = @searchType
    AND is_anonymized_query = FALSE AND query IS NOT NULL
  GROUP BY query, page
  HAVING SUM(impressions) >= @minImpressions
  ORDER BY impressions DESC`, { minImpressions: minQueryPageImpressions }, { minImpressions: 'INT64' });

buckets.devices = await dimension('devices    ', `
  SELECT device,
         SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POSITION} AS position
  FROM ${fq(SITE_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end AND search_type = @searchType
  GROUP BY device ORDER BY impressions DESC`);

// Country arrives as a lowercase ISO-3166-1 alpha-3 code ('jpn'), where the CSV
// export gives a localised name ('日本'). Nothing downstream reads this
// dimension, so it is stored as the export gives it rather than mapped through
// a table that would need maintaining for no current reader.
buckets.countries = await dimension('countries  ', `
  SELECT country,
         SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POSITION} AS position
  FROM ${fq(SITE_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end AND search_type = @searchType
  GROUP BY country ORDER BY impressions DESC`);

/* ── Two things the CSV export cannot say ────────────────────────────────
 * How much traffic the anonymised-query exclusion hides, and how the property
 * splits across surfaces. The second is the only AI-surface signal Search
 * Console actually carries: there is no AI Overview dimension anywhere in this
 * export, so "did an AI Overview take that click" is not answerable here — see
 * growth/BIGQUERY_SETUP.md. What is answerable is whether Discover or News is
 * a material share, which changes what the numbers above even mean. */
const [anonymised] = await dimension('anonymised ', `
  SELECT SUM(IF(is_anonymized_query, impressions, 0)) AS hidden_impressions,
         SUM(IF(is_anonymized_query, clicks, 0)) AS hidden_clicks,
         SUM(impressions) AS impressions, SUM(clicks) AS clicks
  FROM ${fq(SITE_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end AND search_type = @searchType`);

const surfaces = await dimension('surfaces   ', `
  SELECT search_type, SUM(clicks) AS clicks, SUM(impressions) AS impressions
  FROM ${fq(SITE_TABLE)}
  WHERE site_url = @site AND data_date BETWEEN @start AND @end
  GROUP BY search_type ORDER BY impressions DESC`);

/* ── Normalise to the shape the CSV path produces ────────────────────────
 * Page URLs become site-relative paths via the repo's own page inventory, and
 * CTR is recomputed rather than stored, exactly as lib/csv.mjs does. A row with
 * no impressions carries no signal and would distort the CTR curve. */
for (const [kind, rows] of Object.entries(buckets)) {
  buckets[kind] = rows
    .filter((r) => r.impressions)
    .map((r) => {
      if (r.page) r.page = toPath(r.page);
      r.ctr = r.clicks / r.impressions;
      return r;
    });
}

const meta = buildMeta({
  label,
  buckets,
  period: `${effectiveStart}..${end}`,
  source: 'bigquery',
  sourceFiles: [],
  extra: {
    bigquery: {
      project: client.projectId,
      dataset,
      site_url: site,
      search_type: searchType,
      // The window actually covered. A reader comparing this to a 28-day
      // snapshot needs to know when it was not one.
      window_days_requested: days,
      window_days_available: daysAvailable,
      data_available_from: available.min_date,
      data_available_to: available.max_date,
      min_query_page_impressions: minQueryPageImpressions,
      // Impressions counted in the totals but absent from the query table.
      anonymised_query_share: anonymised?.impressions
        ? anonymised.hidden_impressions / anonymised.impressions
        : null,
      // Unfiltered by search_type, unlike everything above it.
      surfaces: Object.fromEntries(surfaces.map((s) => [s.search_type, { clicks: s.clicks, impressions: s.impressions }])),
    },
  },
});

if (dryRun) {
  console.log('\n--dry-run: nothing written.');
  console.log(JSON.stringify(meta, null, 2));
  process.exit(0);
}

const written = writeSnapshot({ label, buckets, meta, dir: outDir ? path.resolve(ROOT, outDir) : GSC_DIR });

console.log(`\nSnapshot written: ${path.relative(ROOT, written)}/`);
console.log(summarise(meta));

const anonShare = meta.bigquery.anonymised_query_share;
if (anonShare) {
  console.log(`  ${(anonShare * 100).toFixed(1)}% of impressions come from anonymised queries and carry no query string.`);
}
console.log(`  query×page: ${buckets['query-pages'].length} rows — cannibalisation and "which page is already ranking" now have data.`);

// The one dimension this path does NOT cover. "Performance on Search Generative
// AI Features" is a separate CSV download in the Search Console UI, and no
// column in the bulk export corresponds to it — the surfaces breakdown above is
// search_type (WEB/DISCOVER/NEWS/…), which is a different cut. So a snapshot
// taken here carries no `pages-aio`, and dropping the manual export entirely
// would retire that dimension without anything reporting it.
//
// Said on every run rather than documented once, because the failure mode is a
// field that quietly stops being populated — which reads as "AI surfaces sent
// no impressions", not as "nobody is collecting this".
if (!buckets['pages-aio'].length) {
  console.log('\n  note: no `pages-aio` — the generative-AI export is UI-only and has no BigQuery');
  console.log('        equivalent. Keep taking that one CSV if the AI-surface share matters.');
  console.log('        (meta.bigquery.surfaces is search_type, which is a different cut.)');
}

console.log('\nNext:  node growth/scripts/analyze.mjs        # opportunities, CTR gaps, decay, cannibalisation');
console.log('       node growth/scripts/weekly-report.mjs   # the report a human actually reads');
