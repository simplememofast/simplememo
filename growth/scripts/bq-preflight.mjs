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
 *
 * `--strict` exits non-zero on a stale export; without it, staleness is
 * reported and the exit code stays 0 so a scheduled run can carry on and say so
 * in its summary rather than failing the whole workflow.
 */

import { connect, query, listTables } from '../lib/bigquery.mjs';

const EXPORT_TABLES = ['searchdata_site_impression', 'searchdata_url_impression', 'ExportLog'];

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

const present = new Set(tables.map((t) => t.id));
const missing = EXPORT_TABLES.filter((t) => !present.has(t));

// Running a query in the console leaves short-lived scratch tables in whichever
// dataset it was pointed at. They are easy to mistake for the export — they
// appear in the same dataset list, with plausible-looking timestamps — so they
// are named here rather than left to be misread as "the export is working".
const scratch = tables.filter((t) => /^temp_|^anon/i.test(t.id) || t.expires);

if (missing.length) {
  bad(`missing export tables: ${missing.join(', ')}`);
  console.log(`    dataset holds: ${tables.length ? tables.map((t) => t.id).join(', ') : '(nothing)'}`);
  if (scratch.length) {
    console.log(`    (${scratch.map((t) => t.id).join(', ')} ${scratch.length === 1 ? 'is' : 'are'} query scratch with an expiry, not the export)`);
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
if (scratch.length) warn(`also present (query scratch, ignored): ${scratch.map((t) => t.id).join(', ')}`);

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

const stale = lagDays >= STALE_DAYS;
console.log(stale
  ? '\nPreflight FAILED: the export is stale.'
  : '\nPreflight passed.');
process.exit(stale && strict ? 1 : 0);
