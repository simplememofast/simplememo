import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBackupInventory } from './backup-inventory.mjs';
import { backupMetadata } from './bigquery.mjs';
import { collect, validateOptions } from '../scripts/export-analytics.mjs';
const client = { projectId: 'yurika-simplememo', token: 'test-only' };
const now = new Date('2026-09-08T00:00:00Z');
const dr = { projectId: client.projectId, datasetId: 'existing' };
const tr = { ...dr, tableId: 'backup' };
const jr = { projectId: client.projectId, jobId: 'copy-1', location: 'asia-northeast1' };
const empty = kind => ({ kind: `bigquery#${kind === 'datasets' ? 'datasetList' : kind === 'tables' ? 'tableList' : 'jobList'}` });
const api = handler => ({ backupMetadata: async (_, args) => handler(args) });

test('inventory follows pages and records snapshot/copy evidence without claiming restore', async () => {
  const calls = [];
  const r = await collectBackupInventory(client, api(a => {
    calls.push(a);
    if (a.kind === 'datasets') return a.pageToken ? { datasets: [{ datasetReference: dr }] } : { datasets: [], nextPageToken: 'page2' };
    if (a.kind === 'tables') return { tables: [{ tableReference: tr }] };
    if (a.kind === 'table') return { tableReference: tr, type: 'SNAPSHOT', snapshotDefinition: { baseTableReference: { ...tr, tableId: 'source' }, snapshotTime: now.toISOString() } };
    return { jobs: [{ jobReference: jr, state: 'DONE', configuration: { jobType: 'COPY', copy: { sourceTable: tr, destinationTable: { ...tr, tableId: 'restored' } } } }] };
  }), now);
  assert.equal(r.status, 'complete'); assert.equal(r.datasets[0].candidates.length, 1);
  assert.equal(r.jobs[0].outcome, 'completed_without_reported_error'); assert.equal(r.restore_verified, false);
  assert.equal(calls.filter(c => c.kind === 'datasets').length, 2);
  assert.equal(r.window.maxCreationTime - r.window.minCreationTime, 30 * 86400000);
});
test('403 and unreachable regions remain partial, not absence', async () => {
  const r = await collectBackupInventory(client, api(a => {
    if (a.kind === 'datasets') throw Object.assign(new Error('private error'), { status: 403 });
    return { jobs: [], unreachable: ['eu'] };
  }), now);
  assert.equal(r.status, 'partial'); assert.equal(r.issues[0].status, 'access_denied');
  assert.equal(r.issues[1].status, 'unreachable_locations'); assert.ok(!JSON.stringify(r).includes('private error'));
});
test('malformed successful responses and repeated tokens cannot look complete', async () => {
  for (const response of [{}, { jobs: 'invalid' }, { jobs: [], nextPageToken: 'repeat' }]) {
    const r = await collectBackupInventory(client, api(a => a.kind === 'datasets' ? empty(a.kind) : response), now);
    assert.equal(r.status, 'partial');
  }
});
test('empty visible scope is valid but never global absence or restoration', async () => {
  const r = await collectBackupInventory(client, api(a => empty(a.kind)), now);
  assert.equal(r.status, 'complete'); assert.equal(r.restore_verified, false); assert.match(r.visibility, /permission-filtered/);
});
test('redacted jobs and failed extract jobs are distinguished', async () => {
  const r = await collectBackupInventory(client, api(a => a.kind === 'datasets' ? empty(a.kind) : { jobs: [
    { jobReference: jr },
    { jobReference: { ...jr, jobId: 'extract' }, status: { state: 'DONE', errorResult: { reason: 'accessDenied' } }, configuration: { jobType: 'EXTRACT', extract: { sourceTable: tr, destinationUris: ['gs://existing/object'] } } },
  ] }), now);
  assert.equal(r.status, 'partial'); assert.equal(r.jobs[0].outcome, 'failed');
  assert.deepEqual(r.jobs[0].destinationUris, ['gs://existing/object']);
});
test('page limit is explicit and requests are bounded', async () => {
  let n = 0;
  const r = await collectBackupInventory(client, api(a => a.kind === 'datasets' ? empty(a.kind) : { jobs: [], nextPageToken: String(++n) }), now);
  assert.equal(n, 20); assert.equal(r.status, 'partial'); assert.equal(r.issues[0].status, 'page_limit');
});
test('backup report uses no SQL and rejects custom date windows', async () => {
  assert.throws(() => validateOptions({ report: 'backup-inventory', start: '2026-09-01' }));
  const r = await collect({ report: 'backup-inventory' }, { now, api: { connect: async () => client, ...api(a => empty(a.kind)), query: () => { throw new Error('Must not query'); } } });
  assert.equal(r.status, 'complete'); assert.deepEqual(r.queries, []); assert.equal(r.backup_inventory.restore_verified, false);
});
test('transport is fixed-project GET with only selected metadata and bounded window', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url: new URL(url), opts }); return { ok: true, json: async () => ({}) }; };
  try {
    for (const kind of ['datasets', 'tables', 'table', 'jobs']) await backupMetadata(client, { kind, dataset: 'existing', table: 'backup', minCreationTime: now.getTime() - 86400000, maxCreationTime: now.getTime() });
    assert.equal(calls.length, 4);
    for (const c of calls) { assert.equal(c.opts.method, 'GET'); assert.equal(c.opts.body, undefined); assert.equal(c.url.hostname, 'bigquery.googleapis.com'); }
    assert.equal(calls[3].url.searchParams.get('allUsers'), 'true');
    assert.ok(!calls[3].url.searchParams.get('fields').includes('user_email'));
    assert.ok(!calls[3].url.searchParams.get('fields').includes('query'));
    await assert.rejects(backupMetadata({ ...client, projectId: 'other' }, { kind: 'datasets' }));
    await assert.rejects(backupMetadata(client, { kind: 'query' }));
    await assert.rejects(backupMetadata(client, { kind: 'jobs', minCreationTime: 0, maxCreationTime: now.getTime() }));
  } finally { globalThis.fetch = original; }
});
