// Preserve the existing SEO Daily output, without querying or refitting it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {BUCKET_KINDS, buildMeta} from './snapshot.mjs';
import {inspectSnapshot} from '../../scripts/autopilot-data.mjs';

export const DAILY_WORKFLOW = '.github/workflows/seo-daily.yml';
export const DAILY_REPO = 'simplememofast/simplememo';
export const DAILY_LIMIT = 16 * 1024 ** 2;
export const dailyHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const FILES = ['meta.json', ...BUCKET_KINDS.map(k => k + '.json')];
const dateOK = s => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && new Date(s).toISOString().slice(0, 10) === s;

export function packDaily({directory, label, env = process.env, now = new Date()}) {
  assert(dateOK(label), 'invalid snapshot label');
  assert.equal(env.GITHUB_REPOSITORY, DAILY_REPO);
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert(['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME));
  const root = fs.realpathSync(directory), dir = fs.realpathSync(path.join(root, label));
  assert.equal(path.dirname(dir), root, 'snapshot must remain in its output directory');
  const files = {}; let size = 0;
  for (const name of FILES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) { assert.notEqual(name, 'meta.json'); continue; }
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), 'regular snapshot files required');
    size += stat.size; assert(size <= DAILY_LIMIT, 'snapshot handoff size limit');
    const body = fs.readFileSync(file, 'utf8');
    files[name] = {sha256: dailyHash(body), body};
  }
  const payload = {schema_version: 1, kind: 'seo_daily_snapshot', repository: DAILY_REPO,
    workflow: DAILY_WORKFLOW, run_id: String(env.GITHUB_RUN_ID), run_attempt: Number(env.GITHUB_RUN_ATTEMPT),
    source_sha: env.GITHUB_SHA, event: env.GITHUB_EVENT_NAME, observed_at: now.toISOString(), label, files};
  snapshotFromDaily(payload, {now});
  return payload;
}

export function snapshotFromDaily(payload, {now = new Date(), remote = null} = {}) {
  assert.equal(payload.schema_version, 1); assert.equal(payload.kind, 'seo_daily_snapshot');
  assert.equal(payload.repository, DAILY_REPO); assert.equal(payload.workflow, DAILY_WORKFLOW);
  assert.match(payload.run_id ?? '', /^[1-9]\d*$/); assert(Number.isSafeInteger(payload.run_attempt) && payload.run_attempt > 0);
  assert.match(payload.source_sha ?? '', /^[a-f0-9]{40}$/);
  assert(['schedule', 'workflow_dispatch'].includes(payload.event));
  assert(dateOK(payload.label));
  assert(Number.isFinite(Date.parse(payload.observed_at)) && Date.parse(payload.observed_at) <= now.getTime());
  if (remote) {
    assert.equal(remote.repository?.full_name, DAILY_REPO); assert.equal(remote.path, DAILY_WORKFLOW);
    assert.equal(remote.head_branch, 'main'); assert.equal(remote.status, 'completed'); assert.equal(remote.conclusion, 'success');
    assert.equal(String(remote.id), payload.run_id); assert.equal(remote.run_attempt, payload.run_attempt);
    assert.equal(remote.head_sha, payload.source_sha); assert.equal(remote.event, payload.event);
    assert(Date.parse(payload.observed_at) >= Date.parse(remote.run_started_at)
      && Date.parse(payload.observed_at) <= Date.parse(remote.updated_at), 'observation outside remote execution');
  }
  assert(payload.files && typeof payload.files === 'object');
  let size = 0;
  const parsed = {};
  for (const [name, entry] of Object.entries(payload.files)) {
    assert(FILES.includes(name), 'unexpected snapshot file'); assert.equal(typeof entry.body, 'string');
    size += Buffer.byteLength(entry.body); assert(size <= DAILY_LIMIT);
    assert.equal(dailyHash(entry.body), entry.sha256, 'snapshot bytes changed');
    parsed[name] = JSON.parse(entry.body);
  }
  const meta = parsed['meta.json']; assert(meta && meta.label === payload.label);
  assert.equal(meta.bigquery?.project, 'yurika-simplememo'); assert.equal(meta.bigquery?.dataset, 'searchconsole');
  const buckets = {};
  for (const kind of BUCKET_KINDS) {
    const rows = parsed[kind + '.json'] ?? []; assert(Array.isArray(rows));
    const seen = new Set();
    for (const row of rows) {
      const ai = kind.endsWith('-aio');
      assert(Number.isSafeInteger(row.impressions) && row.impressions >= 0);
      if (!ai) {
        assert(Number.isSafeInteger(row.clicks) && row.clicks >= 0 && row.clicks <= row.impressions);
        assert(row.impressions === 0 || Number.isFinite(row.position) && row.position >= 1);
        assert(row.impressions === 0 || Math.abs(row.ctr - row.clicks / row.impressions) < 1e-12);
      }
      const keys = kind === 'query-pages' ? ['query', 'page'] : [kind.replace(/-aio$/, '').replace(/ies$/, 'y').replace(/s$/, '')];
      assert(keys.every(k => typeof row[k] === 'string'));
      const key = JSON.stringify(keys.map(k => row[k])); assert(!seen.has(key), 'duplicate dimension row'); seen.add(key);
      if (row.page) assert(row.page.startsWith('/') && !row.page.startsWith('//')
        && new URL(row.page, 'https://simplememofast.com').origin === 'https://simplememofast.com');
    }
    buckets[kind] = rows;
  }
  assert.equal(inspectSnapshot(meta, buckets.dates, now).state, 'ready');
  const canonical = buildMeta({label: payload.label, buckets, period: meta.period_start + '..' + meta.period_end,
    source: meta.source, extra: {bigquery: meta.bigquery}});
  for (const key of ['row_counts', 'complete_window', 'aio', 'totals', 'ctr_curve', 'ctr_curve_source',
    'ctr_curve_coverage', 'ctr_curve_derived_positions', 'ctr_curve_segments', 'ctr_curve_calibration'])
    assert.deepEqual(meta[key], canonical[key], 'canonical snapshot derivation differs');
  return {label: payload.label, meta, queries: buckets.queries, pages: buckets.pages, dates: buckets.dates,
    queryPages: buckets['query-pages'], pagesAio: buckets['pages-aio']};
}

export function retainedDaily({stateRoot, now = new Date()}) {
  const dir = path.join(stateRoot, 'data/seo-daily'), file = path.join(dir, 'latest.json');
  if (!fs.existsSync(file)) return null;
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(receipt.status, 'verified');
  assert.equal(receipt.source, 'gsc_daily_handoff');
  assert(receipt.remote && typeof receipt.remote === 'object', 'verified remote provenance required');
  const output = fs.realpathSync(receipt.output), root = fs.realpathSync(dir);
  assert(output.startsWith(root + path.sep));
  assert(fs.statSync(output).size <= DAILY_LIMIT * 2);
  const bytes = fs.readFileSync(output); assert.equal(dailyHash(bytes), receipt.sha256);
  const payload = JSON.parse(bytes), snapshot = snapshotFromDaily(payload, {now, remote: receipt.remote});
  assert.equal(String(receipt.run_id), payload.run_id); assert.equal(receipt.source_commit, payload.source_sha);
  assert.deepEqual(receipt.window, {start: snapshot.meta.period_start, end: snapshot.meta.period_end});
  return {snapshot, receipt};
}
