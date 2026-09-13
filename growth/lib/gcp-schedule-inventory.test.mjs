import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGcpSchedules, summarizeJob, PROJECT } from './gcp-schedule-inventory.mjs';
import { collect, validateOptions } from '../scripts/export-analytics.mjs';
const parent = `projects/${PROJECT}/locations/asia-northeast1`;
const ok = body => ({ ok: true, status: 200, json: async () => body });
const creds = { type: 'service_account' };
const api = { loadCredentials: () => creds, accessToken: async () => 'test-token' };
test('reads both service catalogs and every returned region with fixed GETs', async () => {
  const seen = [], scopes = [];
  const result = await collectGcpSchedules({ api: { ...api, accessToken: async (_, { scope }) => { scopes.push(scope); return 'test-token'; } },
    fetchImpl: async (url, options) => {
      seen.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.body, undefined);
      assert.match(url, /^https:\/\/(cloudscheduler|bigquerydatatransfer)\.googleapis\.com\/v1\/projects\/yurika-simplememo\//);
      if (new URL(url).pathname.endsWith('/locations')) return ok({ locations: [{ locationId: 'asia-northeast1' }, { locationId: 'US' }] });
      return ok({}); // Google omits an empty repeated field.
    } });
  assert.equal(result.status, 'complete'); assert.equal(seen.length, 6);
  assert.equal(result.services.transfers.locations.length, 2);
  assert.deepEqual(scopes, ['https://www.googleapis.com/auth/cloud-scheduler', 'https://www.googleapis.com/auth/cloud-platform']);
  assert.equal(result.query_bytes_billed, 0);
});
test('permission denial remains partial while the other service completes; no credential retry', async () => {
  let denied = 0;
  const result = await collectGcpSchedules({ api, fetchImpl: async url => {
    if (url.includes('cloudscheduler')) { denied++; return { ok: false, status: 403, json: async () => ({ error: { message: 'private diagnostic', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED' }] } }) }; }
    return ok(url.includes('/locations?') ? { locations: [{ locationId: 'US' }] } : {});
  } });
  assert.equal(denied, 1); assert.equal(result.status, 'partial');
  assert.equal(result.services.transfers.status, 'complete');
  assert.equal(result.services.scheduler.issues[0].reason, 'SERVICE_DISABLED');
  assert.ok(!JSON.stringify(result).includes('private diagnostic'));
});
test('transient failures retry within bound and pagination keeps prior results', async () => {
  let calls = 0;
  const result = await collectGcpSchedules({ api, wait: async () => {}, fetchImpl: async url => {
    if (url.includes('/locations?')) return ok({ locations: [{ locationId: 'asia-northeast1' }] });
    if (url.includes('transferConfigs')) return ok({});
    calls++;
    if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
    if (!url.includes('pageToken')) return ok({ jobs: [{ name: parent + '/jobs/a', schedule: '* * * * *' }], nextPageToken: 'page2' });
    return ok({ jobs: [{ name: parent + '/jobs/b' }] });
  } });
  assert.equal(calls, 3); assert.equal(result.status, 'complete');
  assert.deepEqual(result.services.scheduler.jobs.map(j => j.name.split('/').at(-1)), ['a', 'b']);
});
test('repeated pagination and invalid resource references cannot produce a complete inventory', async () => {
  const result = await collectGcpSchedules({ api, fetchImpl: async url => {
    if (url.includes('/locations?')) return ok({ locations: [{ locationId: 'asia-northeast1' }] });
    if (url.includes('transferConfigs')) return ok({ transferConfigs: [{ name: 'projects/other/locations/US/transferConfigs/a' }] });
    return ok({ jobs: [], nextPageToken: 'loop' });
  } });
  assert.equal(result.status, 'partial');
  assert.equal(result.services.scheduler.issues[0].status, 'invalid_or_repeated_page_token');
  assert.equal(result.services.transfers.jobs.length, 0);
});
test('job summaries omit secrets in headers, body, query, auth and transfer parameters', () => {
  const a = summarizeJob({ name: parent + '/jobs/a', httpTarget: { uri: 'https://user:password@example.org/run?token=secret',
    headers: { authorization: 'secret' }, body: 'secret', oidcToken: { serviceAccountEmail: 'secret' } } }, 'scheduler', parent);
  const b = summarizeJob({ name: parent + '/transferConfigs/a', params: { query: 'SELECT secret' } }, 'transfers', parent);
  assert.equal(a.destination, 'https://example.org');
  assert.equal(summarizeJob({ name: parent + '/jobs/hook', httpTarget: { uri: 'https://hooks.slack.com/services/team/channel/SECRET' } }, 'scheduler', parent).destination, 'https://hooks.slack.com');
  assert.ok(!JSON.stringify([a, b]).includes('secret'));
  assert.ok(!JSON.stringify(a).includes('password'));
  assert.throws(() => summarizeJob({ name: parent + '/jobs/a/../../evil' }, 'scheduler', parent));
});
test('numeric resource names bind to fixed-project catalog metadata, never an arbitrary returned number', async () => {
  const canonical = 'projects/12345/locations/asia-northeast1';
  const result = await collectGcpSchedules({ api, fetchImpl: async url => {
    if (url.includes('/locations?')) return ok({ locations: [{ locationId: 'asia-northeast1', name: canonical }] });
    if (url.includes('transferConfigs')) return ok({ transferConfigs: [{ name: canonical + '/transferConfigs/a' }] });
    return ok({ jobs: [{ name: 'projects/99999/locations/asia-northeast1/jobs/wrong' }] });
  } });
  assert.equal(result.services.transfers.status, 'complete');
  assert.equal(result.services.transfers.jobs.length, 1);
  assert.equal(result.services.scheduler.status, 'partial');
  assert.equal(result.services.scheduler.jobs.length, 0);
});
test('fixed report validates before credentials and never connects to BigQuery', async () => {
  assert.equal(validateOptions({ report: 'scheduler-inventory' }).report, 'scheduler-inventory');
  assert.throws(() => validateOptions({ report: 'scheduler-inventory', start: '2026-09-01' }));
  const result = await collect({ report: 'scheduler-inventory' }, { api: {
    loadCredentials: () => { throw new Error('unavailable'); },
    connect: () => { throw new Error('must not create query client'); },
  } });
  assert.equal(result.status, 'blocked'); assert.deepEqual(result.queries, []);
});
