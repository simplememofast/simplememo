#!/usr/bin/env node
/**
 * Is the Search Console export actually landing in BigQuery?
 *
 *   node growth/scripts/bq-preflight.mjs [--site sc-domain:…] [--dataset searchconsole] [--strict]
 *
 * Every failure this checks for produces the same symptom — a query that
 * returns nothing — and "nothing" is indistinguishable from a quiet week if you
 * are only reading the report. That is the failure growth/README.md was written
 * about, in a new place: a pipeline that stops delivering does not raise its
 * hand, it just reports smaller numbers, and smaller numbers get explained.
 *
 * So the daily job runs this first and treats a stale export as an incident
 * rather than as data. What it separates:
 *
 *   - credentials that do not authenticate      → the key or its IAM roles
 *   - a dataset that is not there               → wrong project or dataset name
 *   - export tables that were never created     → the connection in Search
 *                                                 Console was never accepted,
 *                                                 or has not run its first
 *                                                 export yet (up to 48 h)
 *   - tables present, no rows for this property → the site_url string is wrong
 *   - rows present but old                      → the export has stopped
 *   - rows present and current, with holes      → single days failed to export
 *
 * That last one is why lib/export-health.mjs exists. Every check above reads
 * the newest date, and Search Console's failures do not move it: it restates a
 * day after the fact and re-exports it, and when *that* fails nothing gets
 * older, nothing disappears, and the only trace is an orphaned staging table
 * this script used to filter out by name as scratch. Five such failures were
 * mailed to the owner on 2026-08-21 while every number here read healthy.
 *
 * `--strict` exits non-zero on a stale export or on a day that failed to land;
 * without it both are reported and the exit code stays 0, so a scheduled run
 * can carry on and say so in its summary rather than failing the whole
 * workflow. A failed *restatement* of a day already in the table never fails
 * the run — the day is there, and Google's own retry usually lands it.
 */

import { connect, query, listTables } from '../lib/bigquery.mjs';
import { EXPORT_TABLES, classifyTables, exportHealth } from '../lib/export-health.mjs';

/* Search Console finalises a day's data two to three days after the fact, and
 * the export then copies it. Four days is therefore still normal; a week means
 * something stopped. */
const FRESH_DAYS = 4;
const STALE_DAYS = 7;

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const strict = argv.includes('--strict');
const dataset = flag('dataset', process.env.BQ_DATASET || 'searchconsole');
const site = flag('site', process.env.GSC_PROPERTY);

const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ! ${m}`);
const bad = (m) => console.log(`  ✗ ${m}`);

const fail = (heading, detail) => {
  console.log('');
  console.error(`${heading}\n\n${detail}\n`);
  process.exit(2);
};

let client;
try {
  client = await connect();
} catch (e) {
  // The loader's own message already lists every location it tried and the
  // command that fixes each one, so repeating a shorter version here only
  // gave the reader two answers to reconcile.
  fail('Cannot authenticate to BigQuery.', `  ${e.message}`);
}

console.log(`Project ${client.projectId} · dataset ${dataset}`);
// Naming the credential type matters here: the two failure modes look nothing
// alike. A service account that lacks a role needs an IAM grant; an OAuth user
// that lacks one needs the human to be granted it, or to switch accounts.
console.log(client.credentialType === 'authorized_user'
  ? `OAuth user credential from ${client.credentialOrigin ?? 'environment'}`
    + (client.quotaProject ? ` · quota project ${client.quotaProject}` : '')
    + '\n'
  : `Service account ${client.clientEmail}\n`);

/* ── 1. Dataset and tables ───────────────────────────────────────────── */
let tables;
try {
  tables = await listTables(client, { dataset });
} catch (e) {
  if (/not found/i.test(e.message)) {
    fail(`Dataset ${client.projectId}.${dataset} does not exist.`,
      '  Either the export was configured against a different project or dataset, or the\n' +
      '  dataset name is not "searchconsole". Check Search Console → 設定 → 一括データ\n' +
      '  エクスポート for the project and dataset it is writing to.');
  }
  if (/permission|denied|access/i.test(e.message)) {
    fail(`The service account cannot read ${client.projectId}.${dataset}.`,
      `  ${e.message}\n\n` +
      `  Grant ${client.clientEmail ?? 'the account you authenticated as'}:\n` +
      '    roles/bigquery.dataViewer  on the dataset\n' +
      '    roles/bigquery.jobUser     on the project (needed to run any query at all)\n' +
      '  See growth/BIGQUERY_SETUP.md step 2.');
  }
  throw e;
}

// `temp_SEARCHDATA_*` tables are not scratch and not ours: the exporter stages
// each day there before loading it, and drops it on success. One left behind is
// an attempt that died, and it is the only local evidence that any did — so it
// is carried down to the integrity section rather than discarded here.
const { exported, staging, foreign } = classifyTables(tables);
const missing = EXPORT_TABLES.filter((t) => !exported.includes(t));

if (missing.length) {
  bad(`missing export tables: ${missing.join(', ')}`);
  console.log(`    dataset holds: ${tables.length ? tables.map((t) => t.id).join(', ') : '(nothing)'}`);
  if (staging.length) {
    console.log(`    (${staging.map((t) => t.id).join(', ')} ${staging.length === 1 ? 'is a' : 'are'} half-finished export attempt${staging.length === 1 ? '' : 's'}:`);
    console.log('     the connection is accepted and the exporter is running, but no day has landed yet)');
  }
  fail('The Search Console export has not created its tables.',
    '  Search Console creates all three itself on the first export after the BigQuery\n' +
    '  connection is accepted. Until then the dataset stays empty however correct the\n' +
    '  IAM setup is.\n\n' +
    '  Check, in order:\n' +
    '    1. Search Console → 設定 → 一括データエクスポート exists and names this project.\n' +
    '    2. The dataset it names is this one.\n' +
    '    3. Less than 48 hours have passed since setup — the first export can take that long.\n' +
    '    4. IAM: the Search Console service agent\n' +
    '       search-console-data-export@system.gserviceaccount.com holds\n' +
    '       roles/bigquery.dataEditor and roles/bigquery.jobUser on the project.\n' +
    '       Without these the export is configured, reports success, and silently\n' +
    '       writes nothing.\n\n' +
    '  growth/BIGQUERY_SETUP.md step 1.');
}
ok(`export tables present: ${EXPORT_TABLES.join(', ')}`);
if (foreign.length) warn(`also present, not part of the export: ${foreign.join(', ')}`);

/* ── 2. Which properties are in there ────────────────────────────────── */
const { rows: properties } = await query(client, {
  sql: `SELECT site_url, COUNT(*) AS rows_, MIN(data_date) AS first_date, MAX(data_date) AS last_date,
               SUM(clicks) AS clicks, SUM(impressions) AS impressions
        FROM \`${client.projectId}.${dataset}.searchdata_site_impression\`
        GROUP BY site_url ORDER BY impressions DESC`,
});

if (!properties.length) {
  fail('The export tables exist but are empty.',
    '  The connection is configured and has not yet delivered a dump. The first one\n' +
    '  arrives up to 48 hours after setup, and the export never backfills — history\n' +
    '  starts the day it was switched on.\n\n' +
    '  If this persists past two days, re-check IAM for\n' +
    '  search-console-data-export@system.gserviceaccount.com (step 4 above).');
}

console.log('\nProperties in the export:');
for (const p of properties) {
  const mark = site && p.site_url === site ? '→' : ' ';
  console.log(`  ${mark} ${p.site_url}`);
  console.log(`      ${p.first_date} .. ${p.last_date} · ${p.clicks} clicks · ${p.impressions} impressions`);
}

if (site && !properties.some((p) => p.site_url === site)) {
  fail(`No rows for site_url = ${JSON.stringify(site)}.`,
    '  The property string must match the export exactly. A domain property is\n' +
    '  "sc-domain:example.com"; a URL-prefix property is "https://example.com/" with the\n' +
    '  trailing slash. The values actually present are listed above — copy one.');
}

/* ── 3. Freshness ────────────────────────────────────────────────────── */
const target = site ? properties.find((p) => p.site_url === site) : properties[0];
const lagDays = Math.round((Date.now() - Date.parse(`${target.last_date}T00:00:00Z`)) / 86_400_000);
const historyDays = Math.round(
  (Date.parse(`${target.last_date}T00:00:00Z`) - Date.parse(`${target.first_date}T00:00:00Z`)) / 86_400_000
) + 1;

console.log('');
if (lagDays <= FRESH_DAYS) {
  ok(`fresh — newest data ${target.last_date} (${lagDays} day${lagDays === 1 ? '' : 's'} behind, normal is 2–3)`);
} else if (lagDays < STALE_DAYS) {
  warn(`newest data is ${target.last_date}, ${lagDays} days behind. Normal lag is 2–3; watch it.`);
} else {
  bad(`newest data is ${target.last_date}, ${lagDays} days behind — the export has stopped delivering.`);
  console.log('    Check Search Console → 設定 → 一括データエクスポート for an error, and that the');
  console.log('    dataset still grants roles/bigquery.dataEditor to');
  console.log('    search-console-data-export@system.gserviceaccount.com.');
}

// 28 days is the window every snapshot is built on, and the export starts empty
// on the day it is enabled. Until there are 28 days, BigQuery snapshots are not
// comparable with the CSV ones already on file.
if (historyDays < 28) {
  const readyOn = new Date(Date.parse(`${target.first_date}T00:00:00Z`) + 27 * 86_400_000).toISOString().slice(0, 10);
  warn(`${historyDays} days of history — a full 28-day window is first possible on ${readyOn}.`);
  console.log('    Until then keep taking the manual export (growth/GSC_OWNER_ACTION.md);');
  console.log('    a short window is not comparable with the 28-day snapshots on file.');
} else {
  ok(`${historyDays} days of history — enough for a 28-day window`);
}

/* ── 4. Integrity ────────────────────────────────────────────────────── */
/* Everything above reads the newest date. None of it can see a day that failed
 * in the middle, and the export's own failure mail does not say whether a
 * failure cost a day or only a restatement of one already delivered — so it is
 * read here, from the days that are actually in the tables. Both tables are
 * partitioned on data_date, so this is a scan of two small columns. */
const whereSite = site ? 'WHERE site_url = @site' : '';
const { rows: coverage } = await query(client, {
  sql: `SELECT 'site' AS ns, CAST(data_date AS STRING) AS data_date
        FROM \`${client.projectId}.${dataset}.searchdata_site_impression\` ${whereSite}
        GROUP BY data_date
        UNION ALL
        SELECT 'url', CAST(data_date AS STRING)
        FROM \`${client.projectId}.${dataset}.searchdata_url_impression\` ${whereSite}
        GROUP BY data_date`,
  ...(site ? { params: { site } } : {}),
});

const findings = exportHealth({
  staging,
  siteDates: coverage.filter((r) => r.ns === 'site').map((r) => r.data_date),
  urlDates: coverage.filter((r) => r.ns === 'url').map((r) => r.data_date),
});

console.log('');
if (!findings.length) {
  ok('no gaps, no stalled table, no half-finished export attempt');
} else {
  for (const f of findings) {
    (f.level === 'bad' ? bad : warn)(f.message);
    for (const line of f.detail.match(/.{1,86}(\s|$)/g) ?? []) console.log(`    ${line.trim()}`);
  }
}

const broken = findings.some((f) => f.level === 'bad');
const stale = lagDays >= STALE_DAYS;
console.log(stale
  ? '\nPreflight FAILED: the export is stale.'
  : broken
    ? '\nPreflight FAILED: the export is current but its history is not whole.'
    : '\nPreflight passed.');
process.exit((stale || broken) && strict ? 1 : 0);
