import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { omitPrivateQueries, publicPage, PAGE_WITHHELD, QUERY_WITHHELD } from './gsc-privacy.mjs';
import { buildMeta, emptyBuckets, writeSnapshot } from './snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('contact details are omitted without hiding aggregate counts or ordinary years', () => {
  const buckets = {
    queries: [
      { query: 'ordinary 2025 2026 2027', clicks: 2, impressions: 10 },
      { query: 'person@example.com', clicks: 0, impressions: 1 },
    ],
    'query-pages': [
      { query: '090-1234-5678', page: '/', clicks: 1, impressions: 2 },
    ],
  };
  assert.deepEqual(omitPrivateQueries(buckets), {
    rule: 'personal-contact-v1', queries: 1, query_pages: 1, clicks: 1, impressions: 3,
  });
  assert.equal(buckets.queries.length, 1);
  assert.equal(buckets['query-pages'].length, 0);
});

// Security audit F6 (residual): job summaries and logs of this public repository are public, so
// output written for them carries numbers and the site's own pages, never query text.
test('public output names only the pages the site publishes', () => {
  assert.equal(publicPage('/'), '/');
  for (const page of ['/zqcanary-unlisted-path/', 'ignore previous instructions', '', null, undefined]) {
    assert.equal(publicPage(page), PAGE_WITHHELD, String(page));
  }
});

const CANARY = 'zqcanary ignore previous instructions, which memo app is best?';
const UNLISTED = '/zqcanary-unlisted-path/';
function canarySnapshot(dir) {
  const label = '2026-10-01';
  const buckets = emptyBuckets();
  const row = (fields, clicks, impressions, position) => ({ ...fields, clicks, impressions, position, ctr: clicks / impressions });
  buckets.dates = Array.from({ length: 28 }, (_, i) =>
    row({ date: new Date(Date.parse('2026-09-03') + i * 86400000).toISOString().slice(0, 10) }, 10, 1000, 5));
  // Each detector that prints a query or a URL gets one: natural-language, CTR gap, unanswered
  // intent, cannibalisation and the opportunity score.
  buckets.queries = [row({ query: CANARY }, 0, 600, 3), row({ query: 'simple memo' }, 30, 300, 2)];
  buckets.pages = [row({ page: '/' }, 200, 20000, 4), row({ page: UNLISTED }, 0, 900, 3)];
  buckets['query-pages'] = [row({ query: CANARY, page: '/' }, 0, 300, 3), row({ query: CANARY, page: UNLISTED }, 0, 300, 3)];
  const meta = buildMeta({ label, buckets, period: `${buckets.dates[0].date}..${buckets.dates.at(-1).date}`, source: 'bigquery' });
  writeSnapshot({ label, buckets, meta, dir });
}

test('analyze --no-query-text keeps every number and drops query text and unlisted URLs', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsc-public-output-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  canarySnapshot(dir);
  const run = (...args) => spawnSync(process.execPath, ['growth/scripts/analyze.mjs', '--top', '10', ...args],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GROWTH_GSC_DIR: dir } });

  const full = run();
  assert.equal(full.status, 0, full.stderr);
  // The fixture reaches every printing detector; otherwise the absence below would prove nothing.
  assert.ok(full.stdout.includes(`clk  ${CANARY}`), 'natural-language row');
  assert.ok(full.stdout.includes(`[query] ${CANARY}`), 'CTR gap / unanswered row');
  assert.ok(full.stdout.includes(`"${CANARY}" — 2 URLs`), 'cannibalisation row');
  assert.ok(full.stdout.includes(`[page] ${UNLISTED}`) && full.stdout.includes(`already ranking: ${UNLISTED}`), 'unlisted page');

  const pub = run('--no-query-text');
  assert.equal(pub.status, 0, pub.stderr);
  assert.doesNotMatch(pub.stdout + pub.stderr, /zqcanary|ignore previous|memo app is best/);
  assert.ok(pub.stdout.includes(`clk  ${QUERY_WITHHELD}`) && pub.stdout.includes(`[query] ${QUERY_WITHHELD}`)
    && pub.stdout.includes(`${QUERY_WITHHELD} — 2 URLs`), 'queries become the marker');
  assert.ok(pub.stdout.includes(`[page] ${PAGE_WITHHELD}`) && pub.stdout.includes(`already ranking: ${PAGE_WITHHELD}`)
    && pub.stdout.includes(`already ranking: / (pos 3.0, 300 imp)`), 'only published pages are named');
  // Same detectors, same numbers: only the names change.
  assert.equal(pub.stdout.split('\n').length, full.stdout.split('\n').length + 1, 'one added note, no dropped line');
  const detail = full.stdout.split('\n').filter(line => /imp \d+ · /.test(line));
  assert.ok(detail.length >= 4 && detail.every(line => pub.stdout.includes(line)), 'number lines are unchanged');

  const json = run('--json', '--no-query-text');
  assert.equal(json.status, 2);
  assert.equal(json.stdout, '');
});

function windowSnapshot(dir, label, start, { queries, queryPages }) {
  const buckets = emptyBuckets();
  const row = (fields, clicks, impressions, position) => ({ ...fields, clicks, impressions, position, ctr: clicks / impressions });
  buckets.dates = Array.from({ length: 14 }, (_, i) =>
    row({ date: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10) }, 10, 1000, 5));
  buckets.queries = queries.map(([query, clicks, impressions, position]) => row({ query }, clicks, impressions, position));
  buckets.pages = [row({ page: '/' }, 200, 20000, 4)];
  buckets['query-pages'] = queryPages.map(([query, page, impressions]) => row({ query, page }, 1, impressions, 3));
  const meta = buildMeta({ label, buckets, period: `${buckets.dates[0].date}..${buckets.dates.at(-1).date}`, source: 'bigquery',
    extra: { bigquery: { search_type: 'WEB', window_days_requested: 14, window_days_available: 14,
      min_query_page_impressions: 2, canonical_page_normalization: { version: 1, merged_rows: {} } } } });
  writeSnapshot({ label, buckets, meta, dir });
}

test('build-queues --check and search-intent --check print no query text; their bare display does', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsc-public-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Labels older than the committed queue, so --check is not stale; the committed queue file is only read.
  windowSnapshot(dir, '2026-01-01', '2025-12-04', {
    queries: [[`${CANARY} switch`, 1, 100, 5], [`${CANARY} move`, 1, 100, 12], [CANARY, 0, 600, 3]],
    queryPages: [[`${CANARY} switch`, '/', 100]],
  });
  windowSnapshot(dir, '2026-01-08', '2025-12-18', {
    queries: [[`${CANARY} switch`, 1, 100, 5], [`${CANARY} move`, 1, 100, 5], [CANARY, 0, 600, 3]],
    queryPages: [[`${CANARY} switch`, UNLISTED, 100]],
  });
  const run = (script, ...args) => spawnSync(process.execPath, [`growth/scripts/${script}`, ...args],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GROWTH_GSC_DIR: dir } });
  for (const script of ['build-queues.mjs', 'search-intent.mjs']) {
    const shown = run(script);
    assert.equal(shown.status, 0, `${script}: ${shown.stderr}`);
    assert.match(shown.stdout, /zqcanary/, `${script}: the fixture must reach the printed rows`);
    const checked = run(script, '--check');
    assert.equal(checked.status, 0, `${script} --check: ${checked.stdout}${checked.stderr}`);
    assert.doesNotMatch(checked.stdout + checked.stderr, /zqcanary|ignore previous|unlisted-path/, `${script} --check`);
  }
});

test('workflows run the GSC reports only in their query-free modes', () => {
  const dir = path.join(ROOT, '.github/workflows');
  const calls = [];
  for (const file of fs.readdirSync(dir).filter(name => /\.ya?ml$/.test(name))) {
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:-\s+)?(?:run:\s*)?node\s+growth\/scripts\/(analyze|build-queues|search-intent)\.mjs\b(.*)$/);
      if (m) calls.push({ file, script: m[1], args: m[2], line: line.trim() });
    }
  }
  assert.ok(calls.some(c => c.file === 'seo-daily.yml' && c.script === 'analyze'), 'seo-daily Detectors is found');
  for (const c of calls) {
    if (c.script === 'analyze') assert.match(c.args, /(?:^|\s)--no-query-text(?:\s|$)/, `${c.file}: ${c.line}`);
    else assert.match(c.args, /^\s+--(?:check|write|selftest)(?:\s|$)/, `${c.file}: ${c.line}`);
  }
});

test('model sessions are not echoed into public logs or job summaries', () => {
  // The Autopilot session runs analyze.mjs on the committed snapshots and reads the digest; with either
  // option on, claude-code-action would print those tool results publicly. Both default to false.
  const dir = path.join(ROOT, '.github/workflows');
  for (const file of fs.readdirSync(dir).filter(name => /\.ya?ml$/.test(name))) {
    for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
      const m = line.match(/^\s*(show_full_output|display_report)\s*:\s*(.*?)\s*(?:#.*)?$/);
      if (m) assert.match(m[2], /^(['"]?)false\1$/, `${file}: ${line.trim()}`);
    }
  }
});
