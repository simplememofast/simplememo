import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {buildMeta, emptyBuckets, writeSnapshot} from './snapshot.mjs';
import {packDaily, snapshotFromDaily, retainedDaily, dailyHash, DAILY_REPO, DAILY_WORKFLOW} from './daily-gsc-handoff.mjs';
import {seal, unseal} from './analytics-envelope.mjs';
import {collectDailyGsc} from './company-daily-gsc.mjs';
import {companySearch} from './company-search.mjs';
import {analyzeSnapshot} from './analysis.mjs';
import {collectData} from './company-data.mjs';

const now = new Date('2026-09-14T00:00:00Z'), label = '2026-09-13';
const keys = crypto.generateKeyPairSync('rsa', {modulusLength: 3072,
  publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}});
const remote = {id: 123, run_attempt: 1, repository: {full_name: DAILY_REPO}, path: DAILY_WORKFLOW,
  head_sha: 'a'.repeat(40), head_branch: 'main', event: 'schedule', status: 'completed', conclusion: 'success',
  run_started_at: '2026-09-13T21:00:00Z', updated_at: '2026-09-13T21:10:00Z'};
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-gsc-')); fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const buckets = emptyBuckets();
  buckets.dates = Array.from({length: 28}, (_, i) => ({date: new Date(Date.parse('2026-08-14') + i * 86400000).toISOString().slice(0, 10), clicks: 4, impressions: 100, ctr: .04, position: 5}));
  buckets.pages = [{page: '/example/', clicks: 112, impressions: 2800, ctr: .04, position: 5}];
  buckets.queries = [{query: 'sample', clicks: 56, impressions: 1400, ctr: .04, position: 5}];
  buckets['query-pages'] = [{...buckets.queries[0], page: '/example/'}];
  buckets.devices = [{device: 'MOBILE', clicks: 112, impressions: 2800, ctr: .04, position: 5}];
  buckets.countries = [{country: 'jpn', clicks: 112, impressions: 2800, ctr: .04, position: 5}];
  const meta = buildMeta({label, buckets, source: 'bigquery', period: '2026-08-14..2026-09-10',
    extra: {bigquery: {project: 'yurika-simplememo', dataset: 'searchconsole', site_url: 'sc-domain:simplememofast.com', search_type: 'WEB', window_days_requested: 28, window_days_available: 28}}});
  const dir = path.join(root, 'source'); writeSnapshot({label, buckets, meta, dir});
  const env = {GITHUB_REPOSITORY: DAILY_REPO, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'schedule',
    GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: remote.head_sha};
  const payload = packDaily({directory: dir, label, env, now: new Date('2026-09-13T21:05:00Z')});
  return {root, dir, env, payload};
}

test('same collector bytes survive encryption; canonical totals, curves, query/page joins and detector output retain parity', t => {
  const {dir, payload} = fixture(t), recovered = unseal(seal(payload, keys.publicKey), keys.privateKey);
  assert.deepEqual(recovered, payload);
  for (const [file, entry] of Object.entries(payload.files)) assert.equal(entry.body, fs.readFileSync(path.join(dir, label, file), 'utf8'));
  const before = snapshotFromDaily(payload, {now, remote}), after = snapshotFromDaily(recovered, {now, remote});
  assert.deepEqual(analyzeSnapshot(before), analyzeSnapshot(after));
  assert.equal(after.queryPages.length, 1); assert.equal(after.meta.totals.clicks, 112);
  assert.equal(after.meta.aio, null); assert.deepEqual(after.pagesAio, []);
});

test('wrong workflow, branch, attempt, source, run outcome and timing cannot authenticate an artifact', t => {
  const {payload} = fixture(t);
  for (const change of [{path: 'other.yml'}, {head_branch: 'Codex/unreviewed'}, {head_sha: 'b'.repeat(40)}, {run_attempt: 2},
    {conclusion: 'failure'}, {status: 'in_progress'}, {event: 'pull_request'}, {repository: {full_name: 'other/repo'}},
    {run_started_at: '2026-09-14T00:00:00Z'}, {updated_at: '2026-09-13T21:01:00Z'}])
    assert.throws(() => snapshotFromDaily(payload, {now, remote: {...remote, ...change}}));
});

test('tampering, missing days, unknown files, totals drift and stale snapshots are rejected without inventing zeroes', t => {
  const {payload, dir, env} = fixture(t);
  const bad = structuredClone(payload); bad.files['dates.json'].body += ' '; assert.throws(() => snapshotFromDaily(bad, {now, remote}));
  for (const file of ['queries.json', 'pages.json', 'dates.json', 'query-pages.json', 'devices.json', 'countries.json']) {
    const incomplete = structuredClone(payload); delete incomplete.files[file];
    assert.throws(() => snapshotFromDaily(incomplete, {now, remote}));
  }
  for (const [name, mutation] of [
    ['dates.json', rows => rows.slice(1)], ['pages.json', rows => [...rows, rows[0]]],
    ['meta.json', meta => ({...meta, totals: {...meta.totals, clicks: 999}})],
    ['query-pages.json', rows => [{...rows[0], page: '//other.example/'}]],
  ]) {
    const value = structuredClone(payload), body = JSON.stringify(mutation(JSON.parse(value.files[name].body)));
    value.files[name] = {body, sha256: dailyHash(body)};
    assert.throws(() => snapshotFromDaily(value, {now, remote}));
  }
  assert.throws(() => snapshotFromDaily({...payload, files: {...payload.files, '.env': {body: '{}', sha256: dailyHash('{}')}}}, {now, remote}));
  assert.throws(() => snapshotFromDaily(payload, {now: new Date('2026-09-20'), remote}));
  assert.throws(() => packDaily({directory: dir, label, env: {...env, GITHUB_REF: 'refs/heads/unreviewed'}, now}));
  fs.writeFileSync(path.join(dir, label, 'unrelated-secret.txt'), 'must not be bundled');
  assert(!JSON.stringify(packDaily({directory: dir, label, env, now})).includes('must not be bundled'));
});

test('existing reader admits one exact remote artifact, caches by run/attempt, feeds the same Company detectors and only calls read APIs', t => {
  const {root, payload} = fixture(t), privateKeyFile = path.join(root, 'key.pem');
  fs.writeFileSync(privateKeyFile, keys.privateKey, {mode: 0o600});
  const envelope = seal(payload, keys.publicKey), calls = [];
  const run = (name, args) => {
    calls.push(args); assert.equal(name, 'gh');
    if (args[0] === 'run' && args[1] === 'download') {
      fs.writeFileSync(path.join(args[args.indexOf('--dir') + 1], 'seo-daily.enc.json'), JSON.stringify(envelope)); return '';
    }
    assert.equal(args[0], 'api'); assert(!args.includes('--method'));
    return JSON.stringify(args[1].endsWith('/artifacts')
      ? {artifacts: [{id: 789, name: 'seo-daily-encrypted-123-1', expired: false, size_in_bytes: 10000}]}
      : {workflow_runs: [remote]});
  };
  const opts = {stateRoot: root, now, run, privateKeyFile};
  const receipt = collectDailyGsc(opts); assert.equal(receipt.status, 'verified'); assert.equal(receipt.new_queries, 0);
  assert.equal(fs.statSync(receipt.output).mode & 0o777, 0o600);
  const reused = collectDailyGsc(opts); assert.equal(reused.reused, true);
  assert.equal(calls.filter(a => a[0] === 'run').length, 1);
  const selected = companySearch({stateRoot: root, now, fallback: null, history: []});
  assert.equal(selected.evidence.selected, 'verified_seo_daily_handoff'); assert.equal(selected.evidence.query_pages, 'observed');
  assert.deepEqual(selected.analysis, analyzeSnapshot(retainedDaily({stateRoot: root, now}).snapshot));
  const latest = path.join(root, 'data/seo-daily/latest.json');
  for (const change of [{remote: null}, {remote: undefined}, {source_commit: 'b'.repeat(40)}, {run_id: 456}, {window: {start: '2026-08-13', end: '2026-09-09'}}]) {
    fs.writeFileSync(latest, JSON.stringify({...receipt, ...change}));
    assert.throws(() => retainedDaily({stateRoot: root, now}));
  }
  fs.writeFileSync(latest, JSON.stringify(receipt));
  fs.appendFileSync(receipt.output, ' '); assert.throws(() => retainedDaily({stateRoot: root, now}));
  const invalid = companySearch({stateRoot: root, now, fallback: null, history: []});
  assert.equal(invalid.snapshot, null); assert.equal(invalid.failures[0].reason, 'daily_handoff_not_admitted');
});

test('no remote artifact remains unavailable; it does not dispatch a duplicate query or stop independent sources', async t => {
  const {root} = fixture(t); let independent = false;
  const run = (name, args) => {assert.equal(name, 'gh'); assert.equal(args[0], 'api'); return JSON.stringify(args[1].endsWith('/artifacts') ? {artifacts: []} : {workflow_runs: [remote]});};
  const receipt = await collectData({stateRoot: root, now, makeConnections: () => ({}), operations: [
    ['gsc_daily_handoff', () => collectDailyGsc({stateRoot: root, now, run})],
    ['independent', () => {independent = true; return {status: 'verified'};}],
  ]});
  assert.equal(receipt.status, 'partial'); assert.equal(independent, true);
  assert.equal(receipt.receipts[0].receipt.failures[0].reason, 'encrypted_artifact_not_available');
  assert(!fs.existsSync(path.join(root, 'data/seo-daily/latest.json')));
});
