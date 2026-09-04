#!/usr/bin/env node
// Collect Search Console inputs before the model runs. Credentials stay in this
// process; only verified snapshots and a small status record cross the boundary.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const jst = now => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export function inspectSnapshot(meta, rows, now) {
  assert.equal(meta.source, 'bigquery', 'BigQuery source required');
  assert(dateOK(meta.period_start) && dateOK(meta.period_end), 'valid observed dates required');
  assert.equal(meta.bigquery?.site_url, 'sc-domain:simplememofast.com', 'wrong property');
  assert.equal(meta.bigquery?.search_type, 'WEB', 'wrong search type');
  assert.equal(meta.bigquery?.window_days_requested, 28, '28-day window required');
  assert(Array.isArray(rows) && rows.length > 0, 'observed days required');
  const dates = rows.map(r => r.date).sort();
  assert(dates.every(dateOK) && new Set(dates).size === dates.length, 'invalid or repeated days');
  assert.equal(dates[0], meta.period_start, 'start differs from observed days');
  assert.equal(dates.at(-1), meta.period_end, 'end differs from observed days');
  assert(rows.every(r => Number.isFinite(r.clicks) && r.clicks >= 0
    && Number.isFinite(r.impressions) && r.impressions >= r.clicks), 'invalid observations');
  const span = (Date.parse(meta.period_end) - Date.parse(meta.period_start)) / DAY + 1;
  assert.equal(dates.length, span, 'missing days must not become zero');
  const lag = Math.floor((Date.parse(jst(now)) - Date.parse(meta.period_end)) / DAY);
  assert(lag >= 1 && lag < 7, 'future, incomplete or stale data');
  return { state: dates.length === 28 ? 'ready' : 'partial', bq_checked: true,
    newest_data_date: meta.period_end, observed_days: dates.length, lag_days: lag,
    full_window: dates.length === 28 };
}

export function collect({ directory, now = new Date(), env = process.env, run = spawnSync }) {
  const label = jst(now);
  const status = { collected_at: now.toISOString(), state: 'unavailable', bq_checked: false,
    newest_data_date: null, observed_days: null, full_window: false, snapshot_dir: null };
  // Never persist child stdout/stderr: authentication errors can contain input.
  // The failing stage and exit code identify the problem without leaking a key.
  const childEnv = { ...env, GROWTH_GSC_DIR: directory, GCP_PROJECT_ID: 'yurika-simplememo',
    BQ_DATASET: 'searchconsole', GSC_PROPERTY: 'sc-domain:simplememofast.com' };
  const steps = [
    ['preflight', ['growth/scripts/bq-preflight.mjs', '--strict']],
    ['ingest', ['growth/scripts/ingest-bigquery.mjs', '--days', '28', '--label', label]],
  ];
  for (const [stage, args] of steps) {
    const result = run(process.execPath, args, { cwd: ROOT, env: childEnv, encoding: 'utf8',
      timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0 || result.error || result.signal) return { ...status, failure_stage: stage,
      failure_kind: result.error?.code === 'ETIMEDOUT' ? 'timeout' : 'collection_failed',
      exit_code: Number.isInteger(result.status) ? result.status : null };
  }
  try {
    const read = file => JSON.parse(fs.readFileSync(path.join(directory, label, file), 'utf8'));
    const summary = inspectSnapshot(read('meta.json'), read('dates.json'), now);
    // Preserve snapshots of record for detectors requiring a prior baseline.
    // Today's ephemeral snapshot never gets committed into the public website.
    if (summary.full_window) {
      const stored = path.join(ROOT, 'growth/data/gsc');
      for (const entry of fs.readdirSync(stored, { withFileTypes: true })) {
        if (entry.isDirectory() && dateOK(entry.name) && entry.name < label)
          fs.cpSync(path.join(stored, entry.name), path.join(directory, entry.name), { recursive: true });
      }
    }
    return { ...status, ...summary, snapshot_dir: summary.full_window ? directory : null };
  } catch {
    return { ...status, failure_stage: 'snapshot_validation', failure_kind: 'invalid_snapshot' };
  }
}

export function checkWiring(source) {
  const steps = source.split(/(?=^      - name: )/m);
  const collectors = steps.filter(s => s.includes('id: collect_data'));
  assert.equal(collectors.length, 1, 'exactly one data collection step required');
  const step = collectors[0];
  assert(step.includes('secrets.GCP_SERVICE_ACCOUNT_JSON'), 'existing credential must reach collector');
  assert(step.includes('node scripts/autopilot-data.mjs --output'), 'collector must execute');
  assert(step.includes("steps.gate.outputs.run == 'true'") && step.includes("steps.budget.outputs.within == 'true'")
    && step.includes("steps.route.outputs.run_cap_ok == 'true'"), 'collection must respect operating gates');
  assert(source.indexOf('id: collect_data') < source.indexOf('id: claude'), 'collect before the model');
  assert(steps.every(s => s === step || !s.includes('secrets.GCP_SERVICE_ACCOUNT_JSON')), 'credential must be scoped to collector');
  assert(source.includes('AUTOPILOT_DATA_REPORT'), 'model must consume collection status');
}

function selftest() {
  const now = new Date('2026-09-10T00:00:00Z');
  const dates = Array.from({ length: 28 }, (_, i) => ({ date: new Date(Date.parse('2026-08-11') + i * DAY).toISOString().slice(0, 10), clicks: 0, impressions: 10 }));
  const meta = { source: 'bigquery', period_start: dates[0].date, period_end: dates.at(-1).date,
    bigquery: { site_url: 'sc-domain:simplememofast.com', search_type: 'WEB', window_days_requested: 28 } };
  assert.equal(inspectSnapshot(meta, dates, now).state, 'ready');
  assert.throws(() => inspectSnapshot(meta, dates.slice(1), now));
  assert.throws(() => inspectSnapshot(meta, [...dates.slice(0, -1), dates[0]], now));
  assert.throws(() => inspectSnapshot(meta, dates, new Date('2026-09-07')));
  assert.throws(() => inspectSnapshot(meta, dates, new Date('2026-09-20')));
  assert.throws(() => inspectSnapshot({ ...meta, bigquery: { ...meta.bigquery, site_url: 'other' } }, dates, now));
  const partial = dates.slice(1);
  assert.equal(inspectSnapshot({ ...meta, period_start: partial[0].date }, partial, now).state, 'partial');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-data-test-'));
  try {
    let calls = 0;
    const failure = collect({ directory: dir, now, run: () => {
      calls++; return { status: 2, stderr: 'private-key sentinel', stdout: 'access-token sentinel' };
    } });
    assert.equal(calls, 1, 'never ingest after failed preflight');
    assert.equal(failure.bq_checked, false);
    assert.equal(failure.observed_days, null);
    assert(!JSON.stringify(failure).includes('sentinel'), 'no child output in status');
    const timeout = collect({ directory: dir, now, run: () => ({ status: null, error: { code: 'ETIMEDOUT' } }) });
    assert.equal(timeout.failure_kind, 'timeout');
    const mock = (_bin, args, options) => {
      assert.equal(options.env.GROWTH_GSC_DIR, dir);
      assert.equal(options.env.GSC_PROPERTY, 'sc-domain:simplememofast.com');
      if (args[0].includes('ingest-')) {
        const p = path.join(dir, jst(now)); fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, 'meta.json'), JSON.stringify(meta));
        fs.writeFileSync(path.join(p, 'dates.json'), JSON.stringify(dates));
      }
      return { status: 0 };
    };
    assert.equal(collect({ directory: dir, now, run: mock }).snapshot_dir, dir);
    assert.equal(collect({ directory: '/missing/snapshot', now, run: () => ({ status: 0 }) }).state, 'unavailable');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const source = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  checkWiring(source);
  assert.throws(() => checkWiring(source.replace('GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}', 'GOOGLE_SERVICE_ACCOUNT_JSON: ""')));
  assert.throws(() => checkWiring(source.replace('node scripts/autopilot-data.mjs --output', 'node scripts/unused.mjs --output')));
  console.log('autopilot-data: collection, missing data, freshness, timeout, secret isolation and workflow wiring passed');
}

function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (process.argv.includes('--check')) {
    checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
    console.log('autopilot-data: workflow wiring OK'); return;
  }
  const output = process.argv[process.argv.indexOf('--output') + 1];
  assert(process.argv.includes('--output') && output && path.isAbsolute(output), 'absolute --output outside repository required');
  const relative = path.relative(ROOT, output);
  assert(relative.startsWith(`..${path.sep}`), 'temporary status must stay outside the public repository');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-autopilot-gsc-'));
  const status = collect({ directory });
  fs.writeFileSync(output, JSON.stringify(status, null, 2) + '\n', { mode: 0o600 });
  if (process.env.GITHUB_ENV) {
    assert(!/[\r\n]/.test(output + directory), 'invalid environment path');
    fs.appendFileSync(process.env.GITHUB_ENV, `AUTOPILOT_DATA_REPORT=${output}\n`
      + (status.snapshot_dir ? `GROWTH_GSC_DIR=${directory}\n` : ''));
  }
  console.log(JSON.stringify(status, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { console.error('autopilot-data: collection setup failed; no credential details logged'); process.exitCode = 1; }
}
