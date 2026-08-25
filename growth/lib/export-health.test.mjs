/**
 * Verdicts for growth/lib/export-health.mjs.
 *
 *   node growth/lib/export-health.test.mjs
 *
 * The last case is the 2026-08-21/22 incident, entered exactly as the dataset
 * held it that night: six orphaned staging tables, five of them named in a
 * failure mail that told the owner to fix the errors "早急に" or lose data —
 * and not one day actually missing. If a future change makes that read as an
 * emergency again, or makes a genuinely lost day read as routine, this fails.
 *
 * No network and no credentials: everything here is table names and date lists.
 */

import assert from 'node:assert/strict';
import { classifyTables, missingDates, exportHealth } from './export-health.mjs';

let passed = 0;
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

const days = (first, n) => Array.from({ length: n }, (_, i) =>
  new Date(Date.parse(`${first}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));

/* ── classification ────────────────────────────────────────────────────── */

test('the export’s own tables are recognised by name', () => {
  const { exported, staging, foreign } = classifyTables([
    'searchdata_site_impression', 'searchdata_url_impression', 'ExportLog',
  ]);
  assert.deepEqual(exported.sort(), ['ExportLog', 'searchdata_site_impression', 'searchdata_url_impression']);
  assert.deepEqual(staging, []);
  assert.deepEqual(foreign, []);
});

test('ExportLog carrying an expiry is still an export table, not scratch', () => {
  // The dataset's defaultTableExpirationMs lands on ExportLog at creation, so
  // "has an expiry" was classifying an export table as junk to be ignored.
  const { exported, foreign } = classifyTables([{ id: 'ExportLog', expires: 1791746260921 }]);
  assert.deepEqual(exported, ['ExportLog']);
  assert.deepEqual(foreign, []);
});

test('a staging table yields its namespace and data_date', () => {
  const { staging } = classifyTables(['temp_SEARCHDATA_SITE_IMPRESSION_2026-08-14_80ce962f']);
  assert.deepEqual(staging, [{
    id: 'temp_SEARCHDATA_SITE_IMPRESSION_2026-08-14_80ce962f',
    namespace: 'SEARCHDATA_SITE_IMPRESSION',
    dataDate: '2026-08-14',
  }]);
});

test('anything else is foreign, including a console scratch table', () => {
  const { staging, foreign } = classifyTables(['anon7f3a_scratch', 'my_notes', 'temp_something_else']);
  assert.deepEqual(staging, []);
  assert.deepEqual(foreign.sort(), ['anon7f3a_scratch', 'my_notes', 'temp_something_else']);
});

/* ── gaps ──────────────────────────────────────────────────────────────── */

test('a hole in the middle is found; the ends are not holes', () => {
  assert.deepEqual(missingDates(['2026-08-10', '2026-08-11', '2026-08-13']), ['2026-08-12']);
  assert.deepEqual(missingDates(days('2026-08-10', 11)), []);
  assert.deepEqual(missingDates(['2026-08-10']), []);
  assert.deepEqual(missingDates([]), []);
});

test('unordered and duplicated input is handled', () => {
  assert.deepEqual(missingDates(['2026-08-13', '2026-08-10', '2026-08-10']), ['2026-08-11', '2026-08-12']);
});

/* ── verdicts ──────────────────────────────────────────────────────────── */

test('a failed attempt for a day already in the table is a warning, not data loss', () => {
  const [f, ...rest] = exportHealth({
    staging: [{ id: 't', namespace: 'SEARCHDATA_SITE_IMPRESSION', dataDate: '2026-08-14' }],
    siteDates: days('2026-08-10', 10),
    urlDates: days('2026-08-10', 10),
  });
  assert.deepEqual(rest, []);
  assert.equal(f.level, 'warn');
  assert.equal(f.code, 'restatement-failed');
  assert.match(f.detail, /do not change IAM/);
});

test('a failed attempt for a day that never landed is a real loss', () => {
  const [f] = exportHealth({
    staging: [{ id: 't', namespace: 'SEARCHDATA_URL_IMPRESSION', dataDate: '2026-08-21' }],
    siteDates: days('2026-08-10', 10),
    urlDates: days('2026-08-10', 10),
  });
  assert.equal(f.level, 'bad');
  assert.equal(f.code, 'day-missing');
  assert.match(f.message, /NOT in the table/);
});

test('a gap is reported even with no staging table left behind', () => {
  const holed = days('2026-08-10', 10).filter((d) => d !== '2026-08-15');
  const findings = exportHealth({ siteDates: holed, urlDates: days('2026-08-10', 10) });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'gap');
  assert.match(findings[0].message, /searchdata_site_impression.*2026-08-15/);
});

test('one day of skew is routine; two means one side has stalled', () => {
  // site 08-19, url 08-20 — the two exports land hours apart, so this is normal.
  assert.deepEqual(
    exportHealth({ siteDates: days('2026-08-10', 10), urlDates: days('2026-08-10', 11) }), []);

  const stalled = exportHealth({ siteDates: days('2026-08-10', 10), urlDates: days('2026-08-10', 12) });
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].code, 'skew');
});

test('bad findings sort ahead of warnings', () => {
  const findings = exportHealth({
    staging: [
      { id: 'a', namespace: 'SEARCHDATA_SITE_IMPRESSION', dataDate: '2026-08-14' }, // warn
      { id: 'b', namespace: 'SEARCHDATA_SITE_IMPRESSION', dataDate: '2026-08-30' }, // bad
    ],
    siteDates: days('2026-08-10', 10),
    urlDates: days('2026-08-10', 10),
  });
  assert.equal(findings[0].level, 'bad');
  assert.equal(findings.at(-1).level, 'warn');
});

test('2026-08-22: five dates in the failure mail, nothing actually missing', () => {
  const { exported, staging, foreign } = classifyTables([
    { id: 'ExportLog', expires: 1791746260921 },
    { id: 'searchdata_site_impression', expires: null },
    { id: 'searchdata_url_impression', expires: null },
    { id: 'temp_SEARCHDATA_SITE_IMPRESSION_2026-08-14_80ce962f', expires: 1787867495390 },
    { id: 'temp_SEARCHDATA_SITE_IMPRESSION_2026-08-15_54b314a6', expires: 1787867495390 },
    { id: 'temp_SEARCHDATA_SITE_IMPRESSION_2026-08-16_689824b1', expires: 1787867495390 },
    { id: 'temp_SEARCHDATA_SITE_IMPRESSION_2026-08-17_76cf4f01', expires: 1787867495390 },
    { id: 'temp_SEARCHDATA_URL_IMPRESSION_2026-08-16_1fdbbe2d', expires: 1787867495390 },
    { id: 'temp_SEARCHDATA_URL_IMPRESSION_2026-08-17_4b3ff8e9', expires: 1787867495390 },
  ]);
  assert.equal(exported.length, 3, 'all three export tables recognised despite ExportLog’s expiry');
  assert.equal(staging.length, 6);
  assert.deepEqual(foreign, []);

  const findings = exportHealth({
    staging,
    siteDates: days('2026-08-10', 10), // 08-10 .. 08-19
    urlDates: days('2026-08-10', 11),  // 08-10 .. 08-20
  });
  assert.equal(findings.length, 6);
  assert.equal(findings.filter((f) => f.level === 'bad').length, 0,
    'no day was missing: every failure was a restatement of a day already in the table');
});

/* ── run ───────────────────────────────────────────────────────────────── */

let failed = 0;
for (const [name, fn] of cases) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
