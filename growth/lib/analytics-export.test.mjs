import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { query, getDataset } from './bigquery.mjs';
import { seal, unseal, recipientKey } from './analytics-envelope.mjs';
import { validateOptions, collect, GA4, QUERY_CAP, LOCATION } from '../scripts/export-analytics.mjs';
import { privateDestination } from '../scripts/analytics-artifact.mjs';

const pair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const now = new Date('2026-09-20T00:00:00Z');
const gsc = { report: 'gsc', execution: 'export', start: '2026-09-01', end: '2026-09-02' };
const ga4 = { report: 'ga4-funnel', execution: 'export', start: '2026-09-06', end: '2026-09-07' };
const ok = (data) => ({ ok: true, json: async () => data });
async function withFetch(stub, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('artifact round trip keeps query data out of the envelope', () => {
  const data = { status: 'complete', rows: [{ private_test_value: 'never-visible-in-actions' }] };
  const encrypted = seal(data, pair.publicKey);
  assert.ok(!JSON.stringify(encrypted).includes('never-visible-in-actions'));
  assert.deepEqual(unseal(encrypted, pair.privateKey), data);
  assert.notEqual(seal(data, pair.publicKey).ciphertext, encrypted.ciphertext);
});
test('modified ciphertext fails authenticated decryption', () => {
  const encrypted = seal({ secret: 'test-only' }, pair.publicKey);
  const bytes = Buffer.from(encrypted.ciphertext, 'base64'); bytes[0] ^= 1;
  encrypted.ciphertext = bytes.toString('base64');
  assert.throws(() => unseal(encrypted, pair.privateKey));
});
test('private key input, weak key and wrong recipient are rejected', () => {
  assert.throws(() => recipientKey(pair.privateKey));
  const weak = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => recipientKey(weak.publicKey.export({ type: 'spki', format: 'pem' })));
  const encrypted = seal({}, pair.publicKey); encrypted.recipient_sha256 = 'wrong';
  assert.throws(() => unseal(encrypted, pair.privateKey));
});
test('private destinations inside the deployed repository are rejected', () => {
  assert.throws(() => privateDestination(new URL('../../data/analytics.json', import.meta.url).pathname));
  assert.ok(privateDestination('/tmp/simplememo-private-test/report.json').startsWith('/tmp/'));
});

test('invalid and oversized windows are rejected before authentication', () => {
  for (const override of [
    { start: '2026-02-30' }, { start: '2026-09-03' }, { start: '2026-07-01' },
    { start: '2026-08-10', end: '2026-09-12' }, { report: '../arbitrary.sql' },
    { execution: 'anything' }, { end: '2026-09-20' },
  ]) assert.throws(() => validateOptions({ ...gsc, ...override }, now));
  assert.throws(() => validateOptions({ report: 'preflight', start: '2026-09-01' }, now));
});
test('GA4 enforces release date, whole dates and late-arrival waiting', () => {
  assert.throws(() => validateOptions({ ...ga4, start: '2026-09-05' }, now));
  assert.throws(() => validateOptions({ ...ga4, end: '2026-09-16' }, now));
  assert.equal(validateOptions({ ...ga4, end: '2026-09-15' }, now).end, '2026-09-15');
});
test('GSC cutoff uses Pacific calendar, not the Mac or UTC date', () => {
  // Sep 19 17:00 PT: cutoff Sep 16, although UTC/JST are Sep 20.
  assert.throws(() => validateOptions({ ...gsc, end: '2026-09-17' }, now));
  assert.equal(validateOptions({ ...gsc, end: '2026-09-16' }, now).end, '2026-09-16');
});

test('a BQ dry run returns estimates without polling a nonexistent job', async () => {
  const seen = [];
  const result = await withFetch(async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return ok({ totalBytesProcessed: '12345' });
  }, () => query({ projectId: 'p', token: 'test', location: LOCATION }, {
    sql: 'SELECT 1', dryRun: true, maximumBytesBilled: QUERY_CAP,
  }));
  assert.equal(seen.length, 1); assert.equal(seen[0].body.dryRun, true);
  assert.equal(seen[0].body.maximumBytesBilled, String(QUERY_CAP));
  assert.equal(seen[0].body.location, LOCATION); assert.equal(result.totalBytesProcessed, 12345);
});
test('invalid cost limits do not make API calls', async () => {
  await withFetch(() => { throw new Error('network should not run'); }, async () => {
    for (const cap of [0, -1, 1.5, '1e9', 'unknown']) {
      await assert.rejects(() => query({}, { sql: 'SELECT 1', maximumBytesBilled: cap }), /positive integer/);
    }
  });
});
test('slow and paginated jobs preserve rows and record actual billed bytes', async () => {
  const schema = { fields: [{ name: 'n', type: 'INTEGER' }] };
  const calls = [];
  const payloads = [
    { jobComplete: false, jobReference: { jobId: 'job1', location: LOCATION } },
    { jobComplete: true, schema, rows: [{ f: [{ v: '1' }] }], pageToken: 'page2' },
    { jobComplete: true, rows: [{ f: [{ v: '2' }] }] },
    { status: { state: 'DONE' }, statistics: { query: { statementType: 'SELECT', totalBytesProcessed: '123', totalBytesBilled: '10000000', cacheHit: false } } },
  ];
  const result = await withFetch(async (url, init) => { calls.push(url); return ok(payloads.shift()); }, () =>
    query({ projectId: 'p', token: 'test', location: LOCATION }, { sql: 'SELECT 1', maximumBytesBilled: QUERY_CAP, includeJobMetadata: true }));
  assert.deepEqual(result.rows, [{ n: 1 }, { n: 2 }]);
  assert.equal(result.jobId, 'job1'); assert.equal(result.totalBytesBilled, 10000000);
  assert.equal(result.statementType, 'SELECT');
  assert.ok(calls.slice(1).every((u) => u.includes('location=asia-northeast1')));
});
test('metadata retains 403 vs 404 for useful encrypted diagnostics', async () => {
  await withFetch(async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Access denied', errors: [{ reason: 'accessDenied' }] } }) }), () =>
    assert.rejects(() => getDataset({ projectId: 'p', token: 'test' }, { dataset: GA4 }), (e) => e.status === 403 && e.reasons[0] === 'accessDenied'));
});

function fakeApi(overrides = {}) {
  const calls = [];
  return {
    calls,
    connect: async () => ({ credentialType: 'service_account' }),
    getDataset: async (_, { dataset }) => ({ id: dataset, location: LOCATION }),
    listTables: async () => ['20260906', '20260907', '20260908'].map((d) => ({ id: 'events_' + d })),
    getTable: async (_, { table }) => ({ id: table, schema: { fields: [] } }),
    query: async (_, input) => {
      calls.push(input);
      return input.dryRun ? { totalBytesProcessed: 100 } : {
        statementType: 'SELECT', totalBytesBilled: 10_000_000,
        rows: ['2026-09-01', '2026-09-02'].map((date) => ({ dimension: 'date', value: date })),
      };
    }, ...overrides,
  };
}
test('missing GA4 dataset is waiting, not zero data or missing credentials', async () => {
  const api = fakeApi({ getDataset: async (_, { dataset }) => {
    if (dataset === GA4) throw Object.assign(new Error('not found'), { status: 404 });
    return { id: dataset, location: LOCATION };
  } });
  const result = await collect({ report: 'preflight' }, { api, now });
  assert.equal(result.status, 'waiting_for_dataset'); assert.equal(api.calls.length, 0);
  assert.equal(result.metadata.searchconsole.status, 'available');
});
test('denied GA4 access and wrong region stop execution', async () => {
  for (const override of [
    { getDataset: async () => { throw Object.assign(new Error('denied'), { status: 403 }); } },
    { getDataset: async () => ({ location: 'US' }) },
  ]) {
    const api = fakeApi(override); const result = await collect(ga4, { api, now });
    assert.equal(result.status, 'blocked'); assert.equal(api.calls.length, 0);
  }
});
test('GA4 requires the following day before running the 24-hour funnel', async () => {
  const api = fakeApi({ listTables: async () => [{ id: 'events_20260906' }, { id: 'events_20260907' }] });
  const result = await collect(ga4, { api, now });
  assert.equal(result.status, 'incomplete_daily_tables'); assert.equal(api.calls.length, 0);
  assert.deepEqual(result.coverage.at(-1), { day: '2026-09-08', present: false });
});
test('dry-run-only never submits an execution', async () => {
  const api = fakeApi(); const result = await collect({ ...gsc, execution: 'dry-run' }, { api, now });
  assert.equal(result.status, 'dry_run_complete'); assert.equal(api.calls.length, 2);
  assert.ok(api.calls.every((q) => q.dryRun));
});
test('unknown/oversized dry-run estimate stops before execution', async () => {
  for (const estimate of [null, QUERY_CAP + 1]) {
    const api = fakeApi({ query: async (_, q) => { api.calls.push(q); return { totalBytesProcessed: estimate }; } });
    const result = await collect(gsc, { api, now });
    assert.equal(result.status, 'error'); assert.equal(api.calls.length, 1);
    assert.equal(api.calls[0].dryRun, true);
  }
});
test('GSC fixed queries use caps, DATE parameters and preserve date gaps', async () => {
  const api = fakeApi(); const result = await collect(gsc, { api, now });
  assert.equal(result.status, 'complete'); assert.equal(result.total_bytes_billed, 20_000_000);
  assert.equal(api.calls.length, 4);
  for (const q of api.calls) {
    assert.equal(q.maximumBytesBilled, QUERY_CAP); assert.equal(q.types.start_date, 'DATE');
    assert.equal(q.params.start_date, '2026-09-01');
    assert.ok(!q.sql.includes('DELETE')); assert.ok(!q.sql.includes('INSERT'));
  }
  const gapApi = fakeApi({ query: async (_, q) => q.dryRun ? { totalBytesProcessed: 0 } : { statementType: 'SELECT', totalBytesBilled: 0, rows: [] } });
  assert.equal((await collect(gsc, { api: gapApi, now })).status, 'incomplete_date_coverage');
});
test('funnel always includes quality output and keeps the standard event denominator', async () => {
  const api = fakeApi(); const result = await collect(ga4, { api, now });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.queries.map((q) => q.file), ['ga4-quality.sql', 'ga4-funnel.sql']);
  const sql = api.calls.at(-1).sql;
  assert.ok(sql.includes("WHERE event_name = 'session_start'"));
  assert.ok(sql.includes("event_name = 'app_store_click'"));
  assert.ok(!sql.includes("event_name = 'seo_cta_click'"));
  assert.equal(api.calls.at(-1).params.measurement_version, '2026-09-05');
});
test('workflow handles secrets only in the reader, uploads ciphertext only, and cannot publish', () => {
  const text = fs.readFileSync(new URL('../../.github/workflows/analytics-read.yml', import.meta.url), 'utf8');
  assert.ok(text.includes("github.ref == 'refs/heads/main'"));
  assert.ok(text.includes('persist-credentials: false'));
  assert.ok(text.includes('path: ${{ runner.temp }}/analytics-export/analytics.enc.json'));
  assert.ok(!text.includes('contents: write')); assert.ok(!text.includes('schedule:'));
  assert.equal((text.match(/secrets\.GCP_SERVICE_ACCOUNT_JSON/g) || []).length, 1);
});
