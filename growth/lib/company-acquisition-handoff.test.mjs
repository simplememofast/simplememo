// Local ingest of acquisition-daily.yml: GitHub reads only, synthetic envelopes and a test RSA key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seal } from './analytics-envelope.mjs';
import { collectAcquisitionHandoff, acquisitionHandoffStatus, ga4ActionsGuard, appsflyerActionsGuard, ALERT_STATES, SCHEDULE_LOSS_STATES,
  SCHEDULE_SILENCE_MINUTES } from './company-acquisition-handoff.mjs';
import { collectionWindow, collectAnalytics, collectAppsFlyer, collectData, collectionOperations, connectionView, verifyAppsFlyer } from './company-data.mjs';
import { companyCtaMeasurement } from './company-cta-measurement.mjs';
import * as H from './acquisition-handoff.mjs';
import { SCHEDULE_EXPECTATIONS } from '../../scripts/lib/cron-silence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const READER_SOURCE = fs.readFileSync(path.join(ROOT, H.APPSFLYER_READER_PATH), 'utf8');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const HEAD = 'a'.repeat(40);
const RUN_AT = '2026-10-14T21:40:00Z';              // 06:40 JST, 2026-10-15
const NOW = new Date('2026-10-15T03:00:00Z');        // ingest at 12:00 JST
const keyPair = () => crypto.generateKeyPairSync('rsa', { modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const KEYS = keyPair(), OTHER = keyPair();
const spki = pem => sha(crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' }));
// The real recipient fingerprint is pinned; tests open envelopes for their own key.
const RECIPIENT = spki(KEYS.publicKey);
// Ledger fixtures: tests never read the live data/emergency-stop.json (stopping the route must not break CI).
const GO = { stopped: false, agents: { acquisition: { stopped: false, reason: null } } };

function stateRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-handoff-')); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'private.pem'), KEYS.privateKey, { mode: 0o600 });
  return dir;
}

function ga4Payload({ id = 501, head = HEAD, observedAt = RUN_AT, status = 'complete' } = {}) {
  const w = collectionWindow('ga4-funnel', new Date(observedAt));
  const next = d => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
  const days = []; for (let d = w.start; d <= next(w.end); d = next(d)) days.push(d);
  const quality = event_name => ({ event_date: w.start.replaceAll('-', ''), hostname_scope: 'production', event_name, recorded_events: 50,
    events_without_session_key: 0, analytics_storage_denied_events: 0, missing_session_channel_events: 0, cta_version_missing_or_other: 0,
    click_target_invalid_or_missing: 0, cta_dimensions_incomplete: 0, onelink_version_missing_or_other: 0, onelink_target_invalid_or_missing: 0,
    onelink_dimensions_incomplete: 0, onelink_qa_scope_mismatch: 0 });
  const row = { session_channel: 'Organic Search', session_source: 'google', session_medium: 'organic', session_attribution_status: 'available',
    landing_referrer_host: 'www.google.com', landing_referrer_status: 'external', landing_scope: 'production', landing_path: '/obsidian/',
    device_category: 'mobile', device_language: 'ja', observed_started_sessions: 10, sessions_with_own_app_click_24h: 1,
    sessions_with_cta_impression: 10, clicked_without_recorded_impression: 0, sessions_with_onelink_impression: 0,
    sessions_with_onelink_click_24h: 0, onelink_clicked_without_recorded_impression: 0, sessions_with_onelink_qa_click_24h: 0,
    sessions_with_both_app_routes_24h: 0, sessions_with_any_app_route_click_24h: 1, missing_landing_no_timed_page_view_in_scan: 0,
    sessions_with_sitewide_onelink_impression: 0, sessions_with_sitewide_onelink_click_24h: 0,
    sitewide_onelink_clicked_without_recorded_impression: 0, sessions_with_legacy_and_sitewide_routes_24h: 0,
    sessions_with_expanded_app_route_click_24h: 1,
    missing_landing_page_view_before_start_only: 0, missing_landing_page_view_after_window_only: 0, missing_landing_page_view_both_sides: 0,
    own_app_click_session_rate_24h: 0.1 };
  return { schema_version: 1, report: 'ga4-funnel', execution: 'export', status, project: 'yurika-simplememo', location: 'asia-northeast1',
    start: w.start, end: w.end, run_id: String(id), source_sha: head, observed_at: observedAt, total_bytes_billed: 10485760,
    coverage: days.map(day => ({ day, present: true })),
    queries: ['ga4-quality.sql', 'ga4-funnel.sql'].map(file => ({ file, sql_sha256: sha(fs.readFileSync(path.join(ROOT, 'growth/sql/analytics', file))),
      params: { start_date: w.start, end_date: w.end, ...(file === 'ga4-quality.sql' ? { scan_end_date: days.at(-1) } : {}),
        measurement_version: '2026-09-05', bridge_measurement_version: '2026-09-07' },
      result: { jobId: 'job-' + file, location: 'asia-northeast1', statementType: 'SELECT', totalBytesBilled: 1,
        rows: file === 'ga4-quality.sql' ? ['session_start', 'page_view', 'app_store_click'].map(quality) : [row] } })) };
}

const CSV = 'Date,Agency/PMD (af_prt),Media Source (pid),Campaign (c),Installs,Clicks\n2026-10-14,None,owned_web,obsidian_bridge_pilot_v1,1,4\n';
function afPayload({ id = 501, attempt = 1, head = HEAD, event = 'schedule', startedAt = RUN_AT, ok = true, csv = CSV, mutate = () => {} } = {}) {
  const w = collectionWindow('appsflyer', new Date(startedAt));
  const result = ok ? { ok: true, http_status: 200, parameters: { from: w.start, to: w.end }, started_at: startedAt, population: 'user_acquisition',
    quality: { sha256: sha(csv), row_cap_hit: false, missing_dates: [], missing_metric_columns: [] } }
    : { ok: false, http_status: 401, error: 'http_request_failed', parameters: { from: w.start, to: w.end }, started_at: startedAt };
  const p = { schema: H.APPSFLYER_HANDOFF_SCHEMA, observed_at: startedAt, window: w, credential_origin: H.APPSFLYER_CREDENTIAL_ORIGIN,
    provenance: { repository: H.ACQUISITION_REPO, workflow: H.ACQUISITION_WORKFLOW, workflow_ref: H.ACQUISITION_WORKFLOW_REF,
      ref: 'refs/heads/main', run_id: String(id), run_attempt: attempt, head_sha: head, event },
    reader: { path: H.APPSFLYER_READER_PATH, sha256: H.APPSFLYER_READER_SHA256, exit_code: ok ? 0 : 1, ok, error: ok ? null : 'http_request_failed',
      http_status: result.http_status }, result, csv_base64: ok ? Buffer.from(csv).toString('base64') : null };
  mutate(p); return p;
}

const remote = ({ id = 501, attempt = 1, event = 'schedule', status = 'completed', conclusion = 'success', createdAt = RUN_AT, mutate = () => {} } = {}) => {
  const r = { id, run_attempt: attempt, event, status, conclusion, head_sha: HEAD, head_branch: 'main', path: H.ACQUISITION_WORKFLOW,
    created_at: createdAt, repository: { full_name: H.ACQUISITION_REPO }, head_repository: { full_name: H.ACQUISITION_REPO } };
  mutate(r); return r;
};
const job = (name, conclusion = 'success', r, steps = [], attempt = H.COLLECTION_ATTEMPT) => ({ id: r.id * 10 + name.length, name, run_id: r.id,
  run_attempt: attempt, head_sha: r.head_sha, status: 'completed', conclusion, steps });
const artifact = (r, name, extra = {}) => ({ id: r.id * 100 + name.length, name, size_in_bytes: 4096, expired: false,
  workflow_run: { id: r.id }, ...extra });

// A fake GitHub + git. Counts downloads and any attempt to dispatch a workflow.
function github({ runs = [], jobs = {}, artifacts = {}, envelopes = {}, upstream = READER_SOURCE, failList = false, nameListing = null,
  repoSecrets = ['GCP_SERVICE_ACCOUNT_JSON'] } = {}) {
  const calls = { downloads: 0, dispatches: 0, urls: [] };
  const run = (cmd, args) => {
    if (cmd === 'git') {
      if (args[0] === 'rev-parse') return 'c'.repeat(40) + '\n';
      if (upstream === null) throw new Error('no checkout');
      return upstream;
    }
    assert.equal(cmd, 'gh');
    if (args[0] === 'workflow' || args.includes('workflow')) { calls.dispatches++; return ''; }
    if (args[0] === 'run' && args[1] === 'download') {
      calls.downloads++;
      const name = args[args.indexOf('--name') + 1], dir = args[args.indexOf('--dir') + 1], body = envelopes[`${args[2]}:${name}`];
      if (!body) throw new Error('404');
      fs.writeFileSync(path.join(dir, name.includes('appsflyer') ? H.APPSFLYER_ENVELOPE : H.GA4_ENVELOPE), JSON.stringify(body));
      return '';
    }
    assert.equal(args[0], 'api'); const url = args[1]; calls.urls.push(url);
    if (failList) throw new Error('gh unavailable');
    let m;
    if ((m = /actions\/workflows\/acquisition-daily\.yml\/runs\?branch=main&exclude_pull_requests=true&created=([^&]+)&per_page=(\d+)&page=(\d+)$/.exec(url))) {
      // Honours the created>= filter like the API, so a run older than the listing window is not returned.
      const per = Number(m[2]), page = Number(m[3]), since = Date.parse(decodeURIComponent(m[1]).replace(/^>=/, ''));
      assert(Number.isFinite(since), 'listing without a created>= filter');
      const listed = runs.filter(r => Date.parse(r.created_at) >= since);
      return JSON.stringify({ total_count: listed.length, workflow_runs: listed.slice((page - 1) * per, page * per) });
    }
    if ((m = /actions\/workflows\/acquisition-daily\.yml\/runs\?branch=main&per_page=20$/.exec(url))) return JSON.stringify({ total_count: runs.length, workflow_runs: runs });
    if ((m = /actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs/.exec(url))) {
      const list = (jobs[m[1]] ?? []).filter(j => j.run_attempt === Number(m[2])); return JSON.stringify({ total_count: list.length, jobs: list });
    }
    if (/actions\/secrets\?per_page=100$/.test(url)) {
      if (repoSecrets === null) throw new Error('403');
      return JSON.stringify({ total_count: repoSecrets.length, secrets: repoSecrets.map(name => ({ name })) });
    }
    if ((m = /actions\/runs\/(\d+)\/artifacts/.exec(url))) {
      const list = artifacts[m[1]] ?? []; return JSON.stringify({ total_count: list.length, artifacts: list });
    }
    if ((m = /actions\/artifacts\?name=([^&]+)&per_page=100$/.exec(url))) {
      const name = decodeURIComponent(m[1]);
      const list = nameListing ?? Object.values(artifacts).flat().filter(a => a.name === name);
      return JSON.stringify({ total_count: list.length, artifacts: list });
    }
    throw new Error('unexpected ' + url);
  };
  return { run, calls };
}

function scheduled({ ga4 = ga4Payload(), af = afPayload(), r = remote(), sealTo = KEYS.publicKey, ga4Job = 'success', afJob = 'success', extraArtifacts = [] } = {}) {
  const w = collectionWindow('ga4-funnel', new Date(RUN_AT)), a = collectionWindow('appsflyer', new Date(RUN_AT));
  const names = [ga4 && H.ga4ArtifactName(w.end), af && H.appsflyerArtifactName(a.end)].filter(Boolean);
  return { runs: [r], jobs: { [r.id]: [job('gate', 'success', r), job('ga4', ga4Job, r), job('appsflyer', afJob, r)] },
    artifacts: { [r.id]: [...names.map(n => artifact(r, n)), ...extraArtifacts] },
    envelopes: Object.fromEntries([ga4 && [`${r.id}:${H.ga4ArtifactName(w.end)}`, seal(ga4, sealTo)],
      af && [`${r.id}:${H.appsflyerArtifactName(a.end)}`, seal(af, sealTo)]].filter(Boolean)) };
}
const ingest = (root, gh, extra = {}) => collectAcquisitionHandoff({ stateRoot: root, now: NOW, run: gh.run,
  privateKeyFile: path.join(root, 'private.pem'), recipientSha256: RECIPIENT, apiRepo: '/nonexistent-api', ...extra });
const receipt = (root, name) => { const f = path.join(root, 'data/collection-receipts', name); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : null; };

test('scheduled GA4 and AppsFlyer artifacts become verified receipts in the existing shapes, with zero dispatches', t => {
  const root = stateRoot(t), gh = github(scheduled());
  const health = ingest(root, gh);
  assert.equal(health.status, 'verified'); assert.deepEqual([health.latest.ga4, health.latest.appsflyer], ['admitted', 'admitted']);
  assert.equal(health.appsflyer_key, 'registered'); assert.equal(health.new_dispatches, 0);
  const g = receipt(root, 'ga4-funnel-2026-10-10.json');
  assert.equal(g.status, 'verified'); assert.equal(g.request_tag, 'actions-501-1'); assert.equal(g.run_id, 501); assert.equal(g.source_commit, HEAD);
  assert.deepEqual([g.origin.event, g.origin.scheduled_provider_execution, g.origin.scheduled_company_execution_verified], ['schedule', true, false]);
  for (const key of ['status', 'source', 'output', 'sha256', 'source_commit', 'run_id', 'request_tag', 'verified_at']) assert.notEqual(g[key], null, key);
  const a = receipt(root, 'appsflyer-2026-10-14.json');
  assert.equal(a.status, 'verified'); assert.equal(a.credential_origin, 'github_actions_secret'); assert.equal(a.reader_sha256, H.APPSFLYER_READER_SHA256);
  assert.deepEqual(a.window, { start: '2026-09-17', end: '2026-10-14' }); verifyAppsFlyer(a.output);
  assert.equal(fs.statSync(a.output).mode & 0o777, 0o700); assert.equal(fs.statSync(path.join(a.output, 'report.csv')).mode & 0o777, 0o600);
  const view = connectionView({ stateRoot: root, now: NOW, readThread: () => { throw new Error('no native thread'); } });
  assert.equal(view.ga4.status, 'CONNECTED'); assert.equal(view.appsflyer.status, 'CONNECTED');
  assert.equal(view.appsflyer.site_acquisition.own_site_installs, 1);
  assert.equal(companyCtaMeasurement({ stateRoot: root, now: NOW, connection: view.ga4 }).status, 'observed');
  // A finished run is read once; the next ingest neither downloads nor rewrites receipts.
  const before = fs.readFileSync(path.join(root, 'data/collection-receipts/ga4-funnel-2026-10-10.json'));
  const reads = gh.calls.urls.length;
  ingest(root, gh);
  assert.equal(gh.calls.downloads, 2); assert.equal(gh.calls.dispatches, 0);
  assert.equal(gh.calls.urls.length, reads + 2, 'only the run and secret-name listings are read again; the finished run record is reused');
  assert.deepEqual(fs.readFileSync(path.join(root, 'data/collection-receipts/ga4-funnel-2026-10-10.json')), before);
  const status = acquisitionHandoffStatus({ stateRoot: root });
  assert.deepEqual([status.appsflyer_key, status.appsflyer_secret_scope, status.alert_states, status.action], ['registered', 'not_repository_secret', [], undefined]);
});

test('wrong recipient, window, run or commit drift, CSV tampering and reader divergence are refused without receipts', t => {
  const cases = [
    ['wrong recipient', { sealTo: OTHER.publicKey }, 'ga4', 'envelope_invalid'],
    ['GA4 window', { ga4: ga4Payload({ observedAt: '2026-10-13T21:40:00Z' }) }, 'ga4', 'provenance_mismatch'],
    ['GA4 run id', { ga4: ga4Payload({ id: 999 }) }, 'ga4', 'provenance_mismatch'],
    ['GA4 commit', { ga4: ga4Payload({ head: 'b'.repeat(40) }) }, 'ga4', 'provenance_mismatch'],
    ['AppsFlyer CSV hash', { af: afPayload({ mutate: p => { p.csv_base64 = Buffer.from(CSV + 'x').toString('base64'); } }) }, 'appsflyer', 'provenance_mismatch'],
    ['AppsFlyer attempt', { af: afPayload({ attempt: 2 }) }, 'appsflyer', 'provenance_mismatch'],
    ['AppsFlyer workflow', { af: afPayload({ mutate: p => { p.provenance.workflow_ref = 'x/y/.github/workflows/other.yml@refs/heads/main'; } }) }, 'appsflyer', 'provenance_mismatch'],
    ['AppsFlyer window', { af: afPayload({ mutate: p => { p.result.parameters.from = '2026-09-18'; } }) }, 'appsflyer', 'provenance_mismatch'],
    ['AppsFlyer credential origin', { af: afPayload({ mutate: p => { p.credential_origin = 'private_local_file'; } }) }, 'appsflyer', 'provenance_mismatch'],
    ['reader in payload', { af: afPayload({ mutate: p => { p.reader.sha256 = '0'.repeat(64); } }) }, 'appsflyer', 'reader_divergence'],
  ];
  for (const [label, options, source, state] of cases) {
    const root = stateRoot(t), gh = github(scheduled(options)), health = ingest(root, gh);
    assert.equal(health.latest[source], state, label);
    const file = source === 'ga4' ? 'ga4-funnel-2026-10-10.json' : 'appsflyer-2026-10-14.json';
    assert.equal(receipt(root, file), null, label); assert.equal(gh.calls.dispatches, 0, label);
  }
  const diverged = stateRoot(t), changed = github({ ...scheduled(), upstream: READER_SOURCE + '\n# changed upstream\n' });
  assert.equal(ingest(diverged, changed).latest.appsflyer, 'reader_divergence');
  const noCheckout = stateRoot(t), unavailable = github({ ...scheduled(), upstream: null }), h = ingest(noCheckout, unavailable);
  assert.equal(h.latest.appsflyer, 'reader_reference_unavailable'); assert.equal(h.status, 'unavailable');
  assert.equal(receipt(noCheckout, 'appsflyer-2026-10-14.json'), null);
});

test('expired and duplicate artifacts are final; an existing receipt is never overwritten', t => {
  const r = remote(), base = scheduled({ r });
  base.artifacts[r.id] = base.artifacts[r.id].map(a => a.name.startsWith('acquisition-ga4') ? { ...a, expired: true } : a);
  base.artifacts[r.id].push(artifact(r, 'acquisition-appsflyer-2026-10-13'));
  const root = stateRoot(t), gh = github(base), health = ingest(root, gh);
  assert.deepEqual([health.latest.ga4, health.latest.appsflyer], ['artifact_expired', 'duplicate_artifacts']);
  assert.equal(gh.calls.downloads, 0);
  const kept = stateRoot(t), dir = path.join(kept, 'data/collection-receipts'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const local = JSON.stringify({ schema_version: 1, source: 'appsflyer', status: 'verified', window: { start: '2026-09-17', end: '2026-10-14' }, output: '/local' });
  fs.writeFileSync(path.join(dir, 'appsflyer-2026-10-14.json'), local, { mode: 0o600 });
  const again = github(scheduled()), h = ingest(kept, again);
  assert.equal(h.latest.appsflyer, 'existing_receipt_retained'); assert.equal(h.latest.ga4, 'admitted');
  assert.equal(fs.readFileSync(path.join(dir, 'appsflyer-2026-10-14.json'), 'utf8'), local); assert.equal(again.calls.downloads, 1);
});

test('a failed remote query or read is recorded once as failed and never retried', t => {
  const root = stateRoot(t), r = remote({ conclusion: 'failure' });
  const gh = github(scheduled({ r, ga4: ga4Payload({ status: 'incomplete_daily_tables' }), af: afPayload({ ok: false }), ga4Job: 'failure', afJob: 'failure' }));
  const first = ingest(root, gh);
  assert.deepEqual([first.latest.ga4, first.latest.appsflyer], ['admitted_failed', 'admitted_failed']);
  const g = receipt(root, 'ga4-funnel-2026-10-10.json'), a = receipt(root, 'appsflyer-2026-10-14.json');
  assert.deepEqual([g.status, g.failure], ['failed', 'incomplete_daily_tables']);
  assert.deepEqual([a.status, a.failure, a.reader_error, a.http_status], ['failed', 'actions_reader_failed', 'http_request_failed', 401]);
  ingest(root, gh); assert.equal(gh.calls.downloads, 2); assert.equal(gh.calls.dispatches, 0);
  const records = fs.readdirSync(path.join(root, 'data/acquisition-actions/runs'));
  assert.deepEqual(records, ['501-1.json']);
  const noArtifact = stateRoot(t), lost = github({ ...scheduled({ r, ga4: null, af: null, ga4Job: 'failure', afJob: 'failure' }) });
  const h = ingest(noArtifact, lost);
  assert.deepEqual([h.latest.ga4, h.latest.appsflyer], ['job_failed_without_artifact', 'job_failed_without_artifact']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(noArtifact, 'data/acquisition-actions/runs/501-1.json'))).final, true);
  // On a scheduled run a sealed GA4 failure is a loss: the failed receipt is final and blocks the legacy fallback.
  // A sealed AppsFlyer failure is not: the local reader reads that end-date again (see the scheduled-loss tests).
  // A scheduled run without any artifact lost both sources.
  assert.equal(first.status, 'alert'); assert.deepEqual(first.alerts.map(a => [a.source, a.verdict]), [['ga4', 'admitted_failed']]);
  assert.equal(h.status, 'alert'); assert.deepEqual(h.alerts.map(a => [a.source, a.verdict]), [['ga4', 'job_failed_without_artifact'], ['appsflyer', 'job_failed_without_artifact']]);
});

test('key_pending is surfaced in ingest and status output, and survives a later skipped job', t => {
  const root = stateRoot(t), r = remote(), later = remote({ id: 502, createdAt: '2026-10-15T01:00:00Z' });
  const pending = [{ name: 'AppsFlyer key present (boolean only)', status: 'completed', conclusion: 'success' },
    { name: H.KEY_PENDING_STEP, status: 'completed', conclusion: 'success' },
    { name: 'Materialize the token (value only in this step)', status: 'completed', conclusion: 'skipped' }];
  const base = scheduled({ r, af: null });
  base.jobs[r.id][2] = job('appsflyer', 'success', r, pending);
  base.runs.push(later); base.jobs[later.id] = [job('gate', 'success', later), job('ga4', 'skipped', later), job('appsflyer', 'skipped', later)];
  base.artifacts[later.id] = [];
  const health = ingest(root, github(base));
  assert.equal(health.latest.run_id, 502); assert.equal(health.latest.appsflyer, 'not_run'); assert.equal(health.appsflyer_key, 'key_pending');
  const status = acquisitionHandoffStatus({ stateRoot: root });
  assert.equal(status.appsflyer_key, 'key_pending'); assert.match(status.action, /secret/);
  assert.equal(receipt(root, 'appsflyer-2026-10-14.json'), null);
  assert.equal(acquisitionHandoffStatus({ stateRoot: '/nonexistent-acquisition-state' }).ingest_status, 'not_ingested');
});

test('run listing pages through the retention window; truncation, forks and active runs stay explicit', t => {
  const runs = Array.from({ length: 5 }, (_, i) => remote({ id: 600 + i, createdAt: new Date(Date.parse(RUN_AT) - i * 864e5).toISOString() }));
  const listing = { runs, jobs: Object.fromEntries(runs.map(r => [r.id, [job('gate', 'success', r), job('ga4', 'skipped', r), job('appsflyer', 'skipped', r)]])) };
  const root = stateRoot(t), gh = github(listing), health = ingest(root, gh, { perPage: 2 });
  assert.equal(health.runs_considered, 5); assert.equal(health.status, 'verified');
  const pages = gh.calls.urls.filter(u => u.includes('&page='));
  assert.equal(pages.length, 3);
  const cutoff = new Date(NOW.getTime() - (H.RETENTION_DAYS + 1) * 864e5).toISOString();
  assert(pages.every(u => u.includes('created=' + encodeURIComponent('>=' + cutoff))));
  assert.equal(ingest(stateRoot(t), github(listing), { perPage: 2, maxPages: 2 }).failures[0].reason, 'github_run_listing_unavailable');
  assert.equal(ingest(stateRoot(t), github({ ...listing, failList: true })).status, 'unavailable');
  const mixed = { ...listing, runs: [...runs, remote({ id: 700, status: 'in_progress', conclusion: null }),
    remote({ id: 701, mutate: r => { r.head_repository.full_name = 'fork/simplememo'; } })] };
  const h = ingest(stateRoot(t), github(mixed));
  assert.deepEqual(h.active_runs, [700]); assert(h.failures.some(f => f.run_id === 701 && f.reason === 'unexpected_run_identity'));
});

function homeWithKey(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'acq-home-')), keys = path.join(home, '.local/share/simplememo-analytics/keys');
  fs.mkdirSync(keys, { recursive: true }); fs.writeFileSync(path.join(keys, 'recipient-public.pem'), KEYS.publicKey);
  const previous = process.env.HOME; process.env.HOME = home;
  t.after(() => { process.env.HOME = previous; fs.rmSync(home, { recursive: true, force: true }); });
}

test('collect --analytics ingests first and never dispatches analytics-read for an end-date the Actions owner has', async t => {
  homeWithKey(t);
  const quiet = () => ({ status: 'verified' });
  const handoff = (root, gh) => o => collectAcquisitionHandoff({ ...o, run: gh.run, privateKeyFile: path.join(root, 'private.pem'),
    recipientSha256: RECIPIENT, apiRepo: '/x' });
  const collect = async (root, gh, extra = {}) => {
    const readers = { collectNativeResources: quiet, collectDailyGsc: quiet, collectBingHandoff: quiet, collectAppsFlyer: quiet, collectAsc: quiet,
      collectAcquisitionHandoff: handoff(root, gh), collectAnalytics: o => collectAnalytics({ ...o, run: gh.run, stopDoc: GO }), ...extra };
    const operations = collectionOperations({ stateRoot: root, now: NOW, analytics: true, readers });
    assert.equal(operations[0][0], 'acquisition_actions_handoff'); assert.equal(operations.at(-1)[0], 'ga4-funnel');
    return collectData({ stateRoot: root, now: NOW, operations, makeConnections: () => ({}) });
  };
  const ga4Of = result => result.receipts.find(r => r.source === 'ga4-funnel').receipt;
  // (a) admitted by the ingest that ran first: the verified receipt is reused.
  let root = stateRoot(t), gh = github(scheduled()), seen = null;
  let result = await collect(root, gh, { collectAppsFlyer: o => { seen = o; return quiet(); } });
  assert.equal(ga4Of(result).reused, true); assert.equal(ga4Of(result).request_tag, 'actions-501-1'); assert.equal(gh.calls.dispatches, 0);
  // The local AppsFlyer reader is guarded by what the same ingest saw.
  assert.equal(seen.actionsGuard, true); assert.equal(seen.actionsHandoff, result.receipts[0].receipt);
  // (b) the artifact exists but could not be admitted: still no dispatch.
  root = stateRoot(t); const broken = scheduled(); broken.envelopes = {}; gh = github(broken);
  result = await collect(root, gh);
  assert.deepEqual([ga4Of(result).status, ga4Of(result).reason], ['deferred_to_actions_owner', 'actions_artifact_exists']);
  assert.equal(result.status, 'partial'); assert.equal(gh.calls.dispatches, 0);
  // (c) an Actions run is still active.
  root = stateRoot(t); gh = github({ runs: [remote({ status: 'in_progress', conclusion: null })] });
  result = await collect(root, gh);
  assert.equal(ga4Of(result).reason, 'actions_run_active'); assert.equal(gh.calls.dispatches, 0);
  // (d) GitHub state unreadable is not absence.
  root = stateRoot(t); gh = github({ failList: true });
  result = await collect(root, gh);
  assert.equal(ga4Of(result).reason, 'actions_owner_state_unreadable'); assert.equal(gh.calls.dispatches, 0);
  // (e) the guard also holds when called directly, without a handoff result, through the artifact-name lookup.
  // 18:30 JST with today's scheduled run finished: only the name lookup can stop the dispatch.
  const evening = new Date('2026-10-15T09:30:00Z'), named = [{ id: 1, name: 'acquisition-ga4-funnel-2026-10-10' }];
  root = stateRoot(t); gh = github({ runs: [remote({ createdAt: RUN_AT })], nameListing: named });
  const direct = collectAnalytics({ stateRoot: root, now: evening, run: gh.run, stopDoc: GO });
  assert.deepEqual([direct.status, direct.reason], ['deferred_to_actions_owner', 'actions_artifact_exists']); assert.equal(gh.calls.dispatches, 0);
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', run: github({ nameListing: named }).run, now: NOW, stopDoc: GO }), 'actions_artifact_exists');
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', handoff: { ga4_artifact_ends: ['2026-10-10'] }, stopDoc: GO, run: () => assert.fail('no read needed') }), 'actions_artifact_exists');
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', handoff: { ga4_artifact_ends: [], active_runs: [7] }, stopDoc: GO, run: () => assert.fail('no read needed') }), 'actions_run_active');
  // (f) a local session before today's scheduled run must not query the end-date first.
  root = stateRoot(t); gh = github({});
  result = await collect(root, gh);
  assert.equal(ga4Of(result).reason, 'actions_owner_pending_today'); assert.equal(gh.calls.dispatches, 0);
  const manualOnly = github({ runs: [remote({ event: 'workflow_dispatch', createdAt: RUN_AT })] });
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', run: manualOnly.run, now: NOW, stopDoc: GO }), 'actions_owner_pending_today', 'a manual dry-run is not the scheduled owner');
  // (g) a stopped acquisition route also stops the local fallback; a ledger without the route fails closed.
  const stopped = { stopped: false, agents: { acquisition: { stopped: true, reason: 'test' } } };
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', stopDoc: stopped, run: () => assert.fail('no read when stopped') }), 'acquisition_stopped');
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', stopDoc: { stopped: false, agents: {} }, run: () => assert.fail('no read') }), 'stop_ledger_unreadable');
  root = stateRoot(t); gh = github({ runs: [remote({ createdAt: RUN_AT })] });
  assert.equal(collectAnalytics({ stateRoot: root, now: NOW, run: gh.run, stopDoc: stopped }).reason, 'acquisition_stopped'); assert.equal(gh.calls.dispatches, 0);
  // Positive control: today's scheduled run finished without a GA4 artifact, or its grace passed:
  // the legacy fallback dispatches exactly once.
  root = stateRoot(t); gh = github({ runs: [remote({ createdAt: RUN_AT })] });
  const fallback = collectAnalytics({ stateRoot: root, now: NOW, run: gh.run, stopDoc: GO });
  assert.equal(fallback.status, 'dispatched'); assert.equal(gh.calls.dispatches, 1);
  const late = github({});
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', run: late.run, now: new Date('2026-10-15T09:30:00Z'), stopDoc: GO }), null, '18:30 JST without a scheduled run');
  assert.equal(ga4ActionsGuard({ end: '2026-10-10', run: late.run, now: new Date('2026-10-15T08:59:59Z'), stopDoc: GO }), 'actions_owner_pending_today');
});

test('a legacy analytics-read run is admitted only as a main-branch dispatch of this repository, never by its public title alone', t => {
  homeWithKey(t);
  fs.writeFileSync(path.join(process.env.HOME, '.local/share/simplememo-analytics/keys/recipient-private.pem'), KEYS.privateKey, { mode: 0o600 });
  const root = stateRoot(t), receipts = path.join(root, 'data/collection-receipts');
  fs.mkdirSync(receipts, { recursive: true, mode: 0o700 });
  const w = collectionWindow('ga4-funnel', NOW), id = 777, title = 'Analytics API legacy-request';
  const file = path.join(receipts, `ga4-funnel-${w.end}.json`);
  const pending = JSON.stringify({ schema_version: 1, source: 'ga4-funnel', window: w, request_tag: 'legacy-request', status: 'dispatched', cap_bytes: 2 * 1024 ** 3 });
  fs.writeFileSync(file, pending);
  // A forged run controls its title, its envelope (sealed to the public key) and every field inside it.
  const payload = { report: 'ga4-funnel', start: w.start, end: w.end, run_id: String(id), source_sha: HEAD, status: 'complete', total_bytes_billed: 1 };
  const legacy = ({ detail = {}, listing = [{ databaseId: id, displayTitle: title, status: 'completed', conclusion: 'success', headSha: HEAD }] } = {}) => {
    const calls = { lists: [], api: [], downloads: 0 };
    const run = (cmd, args) => {
      assert.equal(cmd, 'gh');
      if (args[0] === 'run' && args[1] === 'list') { calls.lists.push(args); return JSON.stringify(listing); }
      if (args[0] === 'api') {
        calls.api.push(args[1]);
        return JSON.stringify({ id, display_title: title, event: 'workflow_dispatch', head_branch: 'main', head_sha: HEAD,
          path: '.github/workflows/analytics-read.yml', status: 'completed', conclusion: 'success',
          repository: { full_name: 'simplememofast/simplememo' }, head_repository: { full_name: 'simplememofast/simplememo' }, ...detail });
      }
      if (args[0] === 'run' && args[1] === 'download') {
        calls.downloads++;
        fs.writeFileSync(path.join(args[args.indexOf('--dir') + 1], 'analytics.enc.json'), JSON.stringify(seal(payload, KEYS.publicKey)));
        return '';
      }
      return assert.fail('unexpected gh ' + args.join(' '));
    };
    return { run, calls };
  };
  const forged = [{ head_repository: { full_name: 'attacker/simplememo' } }, { repository: { full_name: 'attacker/simplememo' } },
    { event: 'pull_request' }, { event: 'pull_request_target' }, { head_branch: 'feature' }, { path: '.github/workflows/other.yml' },
    { head_sha: 'b'.repeat(40) }, { id: id + 1 }, { display_title: 'Analytics API other-request' }];
  for (const detail of forged) {
    const gh = legacy({ detail });
    const result = collectAnalytics({ stateRoot: root, now: NOW, run: gh.run });
    assert.equal(result.lookup_state, 'unexpected_run_identity_requires_diagnosis', JSON.stringify(detail));
    assert.equal(result.status, 'dispatched'); assert.equal(gh.calls.downloads, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), pending, 'a rejected run is not recorded against the receipt');
  }
  // A listed id that is not a positive integer is never put into an API path.
  const odd = legacy({ listing: [{ databaseId: '777/../../x', displayTitle: title, status: 'completed', conclusion: 'success', headSha: HEAD }] });
  assert.equal(collectAnalytics({ stateRoot: root, now: NOW, run: odd.run }).lookup_state, 'unexpected_run_identity_requires_diagnosis');
  assert.deepEqual([odd.calls.api.length, odd.calls.downloads], [0, 0]);
  assert.equal(fs.existsSync(path.join(root, `data/analytics-${id}`)), false);
  // Positive control: the listing asks GitHub for main-branch dispatches only, and the real run is admitted.
  const gh = legacy();
  const verified = collectAnalytics({ stateRoot: root, now: NOW, run: gh.run });
  const list = gh.calls.lists[0];
  assert.equal(list[list.indexOf('--branch') + 1], 'main'); assert.equal(list[list.indexOf('--event') + 1], 'workflow_dispatch');
  assert.deepEqual(gh.calls.api, [`repos/simplememofast/simplememo/actions/runs/${id}`]);
  assert.equal(verified.status, 'verified'); assert.equal(verified.run_id, id); assert.equal(verified.source_commit, HEAD); assert.equal(gh.calls.downloads, 1);
});

test('an unreadable or foreign local private key is retried by the next ingest, never recorded as a verdict', t => {
  const root = stateRoot(t), gh = github(scheduled());
  for (const key of [path.join(root, 'missing.pem'), path.join(root, 'other.pem')]) {
    fs.writeFileSync(path.join(root, 'other.pem'), OTHER.privateKey, { mode: 0o600 });
    const h = ingest(root, gh, { privateKeyFile: key });
    assert.equal(h.status, 'unavailable'); assert.equal(h.failures[0].reason, 'recipient_private_key_unavailable');
    assert.equal(h.runs_considered, 0); assert.equal(gh.calls.downloads, 0);
    assert.equal(fs.readdirSync(path.join(root, 'data/acquisition-actions/runs')).length, 0, 'no final record');
  }
  const later = ingest(root, gh);
  assert.deepEqual([later.status, later.latest.ga4, later.latest.appsflyer], ['verified', 'admitted', 'admitted']);
  assert.equal(receipt(root, 'ga4-funnel-2026-10-10.json').status, 'verified');
});

test('a re-run keeps the first attempt as the collection attempt', t => {
  const r = remote({ attempt: 2 }), base = scheduled({ r });
  base.jobs[r.id] = [...['gate', 'ga4', 'appsflyer'].map(n => job(n, 'success', r, [], 1)),
    job('gate', 'success', r, [], 2), job('ga4', 'skipped', r, [], 2), job('appsflyer', 'skipped', r, [], 2)];
  const root = stateRoot(t), h = ingest(root, github(base));
  assert.deepEqual([h.latest.ga4, h.latest.appsflyer], ['admitted', 'admitted']);
  const a = receipt(root, 'appsflyer-2026-10-14.json');
  assert.deepEqual([a.origin.run_attempt, a.origin.latest_run_attempt], [1, 2]);
  assert.equal(receipt(root, 'ga4-funnel-2026-10-10.json').request_tag, 'actions-501-1');
  assert.deepEqual(fs.readdirSync(path.join(root, 'data/acquisition-actions/runs')), ['501-1.json']);
});

test('integrity verdicts, an unverified environment and a repository-level token keep the ingest out of verified', t => {
  const tampered = stateRoot(t);
  const h = ingest(tampered, github(scheduled({ af: afPayload({ mutate: p => { p.provenance.event = 'workflow_dispatch'; } }) })));
  assert.equal(h.status, 'alert'); assert.deepEqual(h.alerts, [{ run_id: 501, source: 'appsflyer', state: 'provenance_mismatch' }]);
  assert.deepEqual(acquisitionHandoffStatus({ stateRoot: tampered }).alert_states, ['provenance_mismatch']);
  assert.equal(receipt(tampered, 'ga4-funnel-2026-10-10.json').status, 'verified', 'the other source is still admitted');
  // Key registered, environment check failed before the token step: no artifact, nothing to retry.
  const r = remote(), unverified = scheduled({ r, af: null, afJob: 'failure' });
  unverified.jobs[r.id][2] = job('appsflyer', 'failure', r, [{ name: H.ENVIRONMENT_STEP, status: 'completed', conclusion: 'failure' }]);
  const env = stateRoot(t), e = ingest(env, github(unverified));
  assert.deepEqual([e.latest.appsflyer, e.appsflyer_key, e.status], ['environment_unverified', 'environment_unverified', 'alert']);
  assert.match(acquisitionHandoffStatus({ stateRoot: env }).action, /deployment branches to main/);
  const pinsFailed = scheduled({ r, af: null, afJob: 'failure' });
  pinsFailed.jobs[r.id][2] = job('appsflyer', 'failure', r, [{ name: H.PINS_STEP, status: 'completed', conclusion: 'failure' }]);
  const pins = ingest(stateRoot(t), github(pinsFailed));
  assert.deepEqual([pins.latest.appsflyer, pins.status, pins.appsflyer_key], ['pins_mismatch', 'alert', 'registered']);
  // A repository-level copy of the token would reach every job of the workflow.
  const misplaced = stateRoot(t), m = ingest(misplaced, github({ ...scheduled(), repoSecrets: ['GCP_SERVICE_ACCOUNT_JSON', H.APPSFLYER_SECRET] }));
  assert.deepEqual([m.status, m.appsflyer_secret_scope], ['alert', 'repository_secret_present']);
  assert.match(acquisitionHandoffStatus({ stateRoot: misplaced }).action, /Delete the repository-level/);
  assert.equal(ingest(stateRoot(t), github({ ...scheduled(), repoSecrets: null })).appsflyer_secret_scope, 'unknown');
});

test('padded GA4 envelopes are admitted without the padding; non-space padding is refused', async t => {
  const { padToBucket } = await import('../scripts/export-analytics.mjs');
  const root = stateRoot(t), h = ingest(root, github(scheduled({ ga4: padToBucket(ga4Payload(), H.GA4_PAD_BUCKET) })));
  assert.equal(h.latest.ga4, 'admitted');
  const output = JSON.parse(fs.readFileSync(receipt(root, 'ga4-funnel-2026-10-10.json').output, 'utf8'));
  assert.equal('padding' in output, false); assert.equal(output.report, 'ga4-funnel');
  const odd = stateRoot(t), o = ingest(odd, github(scheduled({ ga4: { ...ga4Payload(), padding: '  x' } })));
  assert.equal(o.latest.ga4, 'provenance_mismatch'); assert.equal(receipt(odd, 'ga4-funnel-2026-10-10.json'), null);
});

test('the local AppsFlyer reader waits for the Actions owner only while that owner will read', async t => {
  const registered = { appsflyer_key: 'registered', active_runs: [], appsflyer_pending_ends: [], latest_schedule_at: null };
  const end = '2026-10-14';
  assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: registered, now: NOW }), 'actions_owner_pending_today');
  assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: { ...registered, latest_schedule_at: RUN_AT }, now: NOW }), null);
  assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: registered, now: new Date('2026-10-15T09:30:00Z') }), null, 'grace passed');
  assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: { ...registered, latest_schedule_at: RUN_AT, active_runs: [9] }, now: NOW }), 'actions_run_active');
  assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: { ...registered, latest_schedule_at: RUN_AT, appsflyer_pending_ends: [end] }, now: NOW }), 'actions_artifact_pending');
  for (const key of ['key_pending', 'environment_unverified', 'unknown'])
    assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: { ...registered, appsflyer_key: key }, now: NOW }), null, key);
  assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: null, now: NOW }), null);
  // Through collectAppsFlyer: a deferral reads nothing; key_pending and an Actions failure receipt fall back to the local reader.
  let reads = 0;
  const run = (name, args) => {
    if (name === 'git') return args[0] === 'rev-parse' ? 'a'.repeat(40) : '# existing reviewed reader';
    assert.equal(name, 'python3'); reads++;
    const dest = path.join(args.at(-1), 'run-' + reads); fs.mkdirSync(dest, { mode: 0o700 });
    fs.writeFileSync(path.join(dest, 'report.csv'), CSV);
    fs.writeFileSync(path.join(dest, 'result.json'), JSON.stringify({ ok: true, http_status: 200,
      parameters: { from: args[2], to: args[4] }, quality: { sha256: sha(CSV), row_cap_hit: false } }));
    return JSON.stringify({ ok: true, output: dest });
  };
  const root = stateRoot(t);
  const waited = await collectAppsFlyer({ stateRoot: root, now: NOW, run, actionsGuard: true, stopDoc: GO, actionsHandoff: registered });
  assert.deepEqual([waited.status, waited.reason, reads], ['deferred_to_actions_owner', 'actions_owner_pending_today', 0]);
  assert.equal(receipt(root, 'appsflyer-2026-10-14.json'), null);
  const pending = await collectAppsFlyer({ stateRoot: root, now: NOW, run, actionsGuard: true, stopDoc: GO, actionsHandoff: { ...registered, appsflyer_key: 'key_pending' } });
  assert.deepEqual([pending.status, reads], ['verified', 1]);
  const failedRoot = stateRoot(t), failed = github(scheduled({ ga4: null, af: afPayload({ ok: false }), afJob: 'failure' }));
  ingest(failedRoot, failed);
  assert.equal(receipt(failedRoot, 'appsflyer-2026-10-14.json').failure, 'actions_reader_failed');
  const fallback = await collectAppsFlyer({ stateRoot: failedRoot, now: NOW, run, actionsGuard: true, stopDoc: GO, actionsHandoff: registered });
  assert.deepEqual([fallback.status, reads], ['verified', 2]);
  // The acquisition stop route stops this reader too; an unreadable ledger is not "go".
  const stopped = { stopped: false, agents: { acquisition: { stopped: true, reason: 'test' } } };
  assert.equal(appsflyerActionsGuard({ end, handoff: null, now: NOW, stopDoc: stopped }), 'acquisition_stopped');
  assert.equal(appsflyerActionsGuard({ end, handoff: null, now: NOW, stopDoc: { stopped: false, agents: {} } }), 'stop_ledger_unreadable');
  const haltedRoot = stateRoot(t);
  const halted = await collectAppsFlyer({ stateRoot: haltedRoot, now: NOW, run, actionsGuard: true, stopDoc: stopped, actionsHandoff: null });
  assert.deepEqual([halted.status, halted.reason, reads], ['deferred_to_actions_owner', 'acquisition_stopped', 2]);
  assert.equal(receipt(haltedRoot, 'appsflyer-2026-10-14.json'), null);
});

// Scheduled-run health. The previous day's run started late (08:40 JST), as observed since 2026-10-15.
const LOST_AT = '2026-10-13T23:40:00Z';
const LATER_AT = '2026-10-15T01:00:00Z';
// A run that left nothing to admit: no artifact, or only the expired ones named. gate null: no jobs at all
// (startup failure, or cancelled before the gate).
function lostRun({ id = 500, createdAt = LOST_AT, event = 'schedule', gate = 'success', ga4 = 'failure', appsflyer = 'failure', artifacts = [] } = {}) {
  const r = remote({ id, event, createdAt, conclusion: 'failure' });
  return { runs: [r], jobs: { [id]: gate === null ? [] : [job('gate', gate, r), job('ga4', ga4, r), job('appsflyer', appsflyer, r)] },
    artifacts: { [id]: artifacts.map(name => artifact(r, name, { expired: true })) }, envelopes: {} };
}
const merge = (...parts) => ({ runs: parts.flatMap(p => p.runs), jobs: Object.assign({}, ...parts.map(p => p.jobs)),
  artifacts: Object.assign({}, ...parts.map(p => p.artifacts)), envelopes: Object.assign({}, ...parts.map(p => p.envelopes)) });
const lostAlerts = (id, verdicts, createdAt = LOST_AT) => Object.entries(verdicts)
  .map(([source, verdict]) => ({ run_id: id, created_at: createdAt, source, state: 'scheduled_collection_lost', verdict }));
const LOST = /^A scheduled acquisition-daily run left a source without data/;
const SILENT = /No scheduled acquisition-daily run was created within 1680 minutes/;
// A run whose jobs failed after sealing their failure (export-analytics.mjs status error; the reader's HTTP 401),
// with windows taken from its own start time.
function sealedRun({ id = 500, createdAt = LOST_AT, event = 'schedule', ga4Status = 'error', afOk = false } = {}) {
  const r = remote({ id, event, createdAt, conclusion: 'failure' });
  const g = H.ga4ArtifactName(collectionWindow('ga4-funnel', new Date(createdAt)).end);
  const a = H.appsflyerArtifactName(collectionWindow('appsflyer', new Date(createdAt)).end);
  return { runs: [r], jobs: { [id]: [job('gate', 'success', r), job('ga4', 'failure', r), job('appsflyer', afOk ? 'success' : 'failure', r)] },
    artifacts: { [id]: [artifact(r, g), artifact(r, a)] },
    envelopes: { [`${id}:${g}`]: seal(ga4Payload({ id, observedAt: createdAt, status: ga4Status }), KEYS.publicKey),
      [`${id}:${a}`]: seal(afPayload({ id, event, startedAt: createdAt, ok: afOk }), KEYS.publicKey) } };
}
// The existing local AppsFlyer reader (python3), faked; counts reads.
function localReader() {
  const reader = { reads: 0 };
  reader.run = (name, args) => {
    if (name === 'git') return args[0] === 'rev-parse' ? 'a'.repeat(40) : '# existing reviewed reader';
    assert.equal(name, 'python3'); reader.reads++;
    const dest = path.join(args.at(-1), 'run-' + reader.reads); fs.mkdirSync(dest, { mode: 0o700 });
    fs.writeFileSync(path.join(dest, 'report.csv'), CSV);
    fs.writeFileSync(path.join(dest, 'result.json'), JSON.stringify({ ok: true, http_status: 200,
      parameters: { from: args[2], to: args[4] }, quality: { sha256: sha(CSV), row_cap_hit: false } }));
    return JSON.stringify({ ok: true, output: dest });
  };
  return reader;
}

test('a scheduled run that lost a source alerts, and nothing the readers use changes', async t => {
  const cases = [
    ['job failed without artifact', {}, { ga4: 'job_failed_without_artifact', appsflyer: 'job_failed_without_artifact' }],
    ['job finished without artifact', { ga4: 'success', appsflyer: 'success' }, { ga4: 'artifact_missing', appsflyer: 'artifact_missing' }],
    ['artifact expired before admission', { ga4: 'success', appsflyer: 'success',
      artifacts: ['acquisition-ga4-funnel-2026-10-09', 'acquisition-appsflyer-2026-10-13'] }, { ga4: 'artifact_expired', appsflyer: 'artifact_expired' }],
    ['gate failed', { gate: 'failure', ga4: 'skipped', appsflyer: 'skipped' }, { ga4: 'gate_failure', appsflyer: 'gate_failure' }],
    ['no jobs', { gate: null }, { ga4: 'gate_absent', appsflyer: 'gate_absent' }],
    ['one source only', { ga4: 'success', appsflyer: 'skipped', artifacts: [] }, { ga4: 'artifact_missing' }],
  ];
  for (const [label, options, verdicts] of cases) {
    const root = stateRoot(t), gh = github(lostRun(options)), h = ingest(root, gh);
    assert.equal(h.status, 'alert', label);
    assert.deepEqual(h.alerts, lostAlerts(500, verdicts), label);
    const status = acquisitionHandoffStatus({ stateRoot: root });
    assert.deepEqual(status.alert_states, ['scheduled_collection_lost'], label); assert.match(status.action, LOST, label);
    for (const state of Object.values(verdicts).filter(v => !v.startsWith('gate_'))) assert(SCHEDULE_LOSS_STATES.includes(state), state);
    // The verdict is derived, never written into the immutable run record; the next ingest reuses the record byte for byte.
    const recordFile = path.join(root, 'data/acquisition-actions/runs/500-1.json'), record = fs.readFileSync(recordFile);
    assert.equal(JSON.parse(record).final, true); assert(!('alerts' in JSON.parse(record)), label);
    assert.equal(ingest(root, gh).status, 'alert', label); assert.deepEqual(fs.readFileSync(recordFile), record, label);
    assert.deepEqual(fs.readdirSync(path.join(root, 'data/collection-receipts')), [], `${label}: no receipt`);
    assert.equal(gh.calls.dispatches, 0, label);
    // Both guards read neither status nor alerts: the same handoff relabelled verified gives the same answers.
    const relabelled = { ...h, status: 'verified', alerts: [] };
    for (const now of [NOW, new Date('2026-10-15T09:30:00Z')]) {
      for (const end of ['2026-10-10', '2026-10-14']) {
        assert.equal(appsflyerActionsGuard({ end, stopDoc: GO, handoff: h, now }), appsflyerActionsGuard({ end, stopDoc: GO, handoff: relabelled, now }), label);
        assert.equal(ga4ActionsGuard({ end, stopDoc: GO, handoff: h, now, run: github(lostRun(options)).run }),
          ga4ActionsGuard({ end, stopDoc: GO, handoff: relabelled, now, run: github(lostRun(options)).run }), label);
      }
    }
  }
  // After a lost AppsFlyer job the local reader still reads, as before (18:30 JST, the scheduled run's grace passed).
  const reader = localReader();
  const root = stateRoot(t), h = ingest(root, github(lostRun()));
  const local = await collectAppsFlyer({ stateRoot: root, now: new Date('2026-10-15T09:30:00Z'), run: reader.run, actionsGuard: true, stopDoc: GO, actionsHandoff: h });
  assert.deepEqual([local.status, reader.reads, h.appsflyer_key], ['verified', 1, 'unknown']);
});

test('a sealed GA4 failure on a scheduled run is a loss with no fallback; a sealed AppsFlyer failure is read again locally', async t => {
  const root = stateRoot(t), gh = github(sealedRun({ id: 501, createdAt: RUN_AT })), h = ingest(root, gh);
  assert.deepEqual([h.latest.ga4, h.latest.appsflyer, h.status], ['admitted_failed', 'admitted_failed', 'alert']);
  assert.deepEqual(h.alerts, lostAlerts(501, { ga4: 'admitted_failed' }, RUN_AT));
  assert.deepEqual([receipt(root, 'ga4-funnel-2026-10-10.json').failure, receipt(root, 'appsflyer-2026-10-14.json').failure], ['error', 'actions_reader_failed']);
  const status = acquisitionHandoffStatus({ stateRoot: root });
  assert.deepEqual(status.alert_states, ['scheduled_collection_lost']); assert.match(status.action, LOST);
  // Why GA4 alerts: after the grace hour the failed receipt is returned as it is, and nothing is dispatched.
  const evening = new Date('2026-10-15T09:30:00Z');
  const ga4 = collectAnalytics({ stateRoot: root, now: evening, run: gh.run, actionsHandoff: h, stopDoc: GO });
  assert.deepEqual([ga4.status, ga4.failure, gh.calls.dispatches], ['failed', 'error', 0]);
  // Why AppsFlyer does not: the local reader reads the same end-date over the Actions failure receipt.
  const reader = localReader();
  const local = await collectAppsFlyer({ stateRoot: root, now: evening, run: reader.run, actionsGuard: true, stopDoc: GO, actionsHandoff: h });
  assert.deepEqual([local.status, reader.reads, receipt(root, 'appsflyer-2026-10-14.json').status], ['verified', 1, 'verified']);
  // Health is derived again on each ingest; the GA4 loss stays until a later scheduled run delivers GA4.
  assert.deepEqual(ingest(root, gh).alerts, lostAlerts(501, { ga4: 'admitted_failed' }, RUN_AT));
  const recovered = ingest(stateRoot(t), github(merge(sealedRun(), scheduled())));
  assert.deepEqual([recovered.latest.ga4, recovered.status, recovered.alerts], ['admitted', 'verified', []]);
  // Every sealed GA4 status that is not complete counts (export-analytics.mjs exits 1 for these).
  for (const ga4Status of ['partial', 'blocked', 'incomplete_daily_tables', 'incomplete_date_coverage']) {
    assert.deepEqual(ingest(stateRoot(t), github(sealedRun({ id: 501, createdAt: RUN_AT, ga4Status }))).alerts,
      lostAlerts(501, { ga4: 'admitted_failed' }, RUN_AT), ga4Status);
  }
  // A manual run's sealed failure raises nothing (the earlier scheduled run keeps the schedule alive).
  const manual = merge(lostRun({ id: 499, ga4: 'skipped', appsflyer: 'skipped' }), sealedRun({ id: 502, createdAt: RUN_AT, event: 'workflow_dispatch' }));
  const byHand = ingest(stateRoot(t), github(manual));
  assert.deepEqual([byHand.latest.run_id, byHand.latest.ga4, byHand.status, byHand.alerts], [502, 'admitted_failed', 'verified', []]);
  // An admission made while the record was unfinished reads already_admitted later; it is still the run's sealed failure.
  const split = stateRoot(t), waiting = ingest(split, github({ ...sealedRun({ id: 501, createdAt: RUN_AT, afOk: true }), upstream: null }));
  assert.deepEqual([waiting.latest.ga4, waiting.latest.appsflyer, waiting.alerts], ['admitted_failed', 'reader_reference_unavailable', lostAlerts(501, { ga4: 'admitted_failed' }, RUN_AT)]);
  const done = ingest(split, github(sealedRun({ id: 501, createdAt: RUN_AT, afOk: true })));
  assert.deepEqual([done.latest.ga4, done.latest.appsflyer, done.alerts], ['already_admitted', 'admitted', lostAlerts(501, { ga4: 'admitted_failed' }, RUN_AT)]);
});

test('a source admitted before its artifact expired is not reported lost', t => {
  // The AppsFlyer reader reference was unavailable, so the record stayed unfinished until both artifacts expired.
  const root = stateRoot(t), first = ingest(root, github({ ...scheduled(), upstream: null }));
  assert.deepEqual([first.latest.ga4, first.latest.appsflyer, first.status, first.alerts], ['admitted', 'reader_reference_unavailable', 'unavailable', []]);
  const expired = scheduled();
  expired.artifacts[501] = expired.artifacts[501].map(a => ({ ...a, expired: true }));
  const h = ingest(root, github(expired));
  // The frozen record says artifact_expired for both; the receipt run 501 wrote for GA4 decides that GA4 arrived.
  const record = JSON.parse(fs.readFileSync(path.join(root, 'data/acquisition-actions/runs/501-1.json')));
  assert.deepEqual([record.final, record.ga4.state, record.appsflyer.state], [true, 'artifact_expired', 'artifact_expired']);
  assert.equal(receipt(root, 'ga4-funnel-2026-10-10.json').origin.run_id, 501);
  assert.deepEqual(h.alerts, lostAlerts(501, { appsflyer: 'artifact_expired' }, RUN_AT));
  // A receipt from another run for the same end-date is not this run's delivery.
  const other = stateRoot(t), dir = path.join(other, 'data/collection-receipts'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, 'ga4-funnel-2026-10-09.json'), JSON.stringify({ status: 'verified', origin: { run_id: 499, run_attempt: 1 } }));
  const lost = ingest(other, github(lostRun({ ga4: 'success', appsflyer: 'success', artifacts: ['acquisition-ga4-funnel-2026-10-09'] })));
  assert.deepEqual(lost.alerts, lostAlerts(500, { ga4: 'artifact_expired', appsflyer: 'artifact_missing' }));
});

test('without any delivery a loss disappears once the lost run leaves the 15-day run listing', t => {
  // A long emergency stop: daily scheduled runs whose gate succeeded and skipped both jobs.
  const listingDays = H.RETENTION_DAYS + 1, edge = new Date(Date.parse(LOST_AT) + listingDays * 864e5);
  const stoppedAt = new Date(edge.getTime() - 3600000).toISOString();
  const runs = merge(lostRun(), lostRun({ id: 600, createdAt: stoppedAt, ga4: 'skipped', appsflyer: 'skipped' }));
  const root = stateRoot(t);
  const inside = ingest(root, github(runs), { now: edge });
  assert.deepEqual(inside.alerts, lostAlerts(500, { ga4: 'job_failed_without_artifact', appsflyer: 'job_failed_without_artifact' }));
  const outside = ingest(root, github(runs), { now: new Date(edge.getTime() + 1000) });
  assert.deepEqual([outside.status, outside.alerts, outside.runs_considered], ['verified', [], 1]);
  assert(fs.existsSync(path.join(root, 'data/acquisition-actions/runs/500-1.json')), 'the record stays; only the listing moved on');
});

test('the status action keeps every open problem: a key or integrity action never hides a scheduled one', t => {
  const pending = lostRun({ ga4: 'failure', appsflyer: 'success' });
  pending.jobs[500][2] = job('appsflyer', 'success', pending.runs[0], [{ name: H.KEY_PENDING_STEP, status: 'completed', conclusion: 'success' }]);
  const root = stateRoot(t), h = ingest(root, github(pending));
  assert.deepEqual([h.appsflyer_key, h.alerts], ['key_pending', lostAlerts(500, { ga4: 'job_failed_without_artifact' })]);
  const status = acquisitionHandoffStatus({ stateRoot: root });
  assert.match(status.action, /^Owner registers APPSFLYER_AGGREGATE_API_TOKEN/);
  assert.match(status.action, /A scheduled acquisition-daily run left a source without data/);
});

test('manual runs, dry runs and a gate that decided not to collect never raise scheduled_collection_lost', t => {
  // Emergency stop and "end-date already collected" look the same to the ingest: the gate succeeded and skipped the job.
  const decided = lostRun({ id: 501, createdAt: RUN_AT, ga4: 'skipped', appsflyer: 'skipped' });
  let h = ingest(stateRoot(t), github(decided));
  assert.deepEqual([h.status, h.latest.ga4, h.latest.appsflyer, h.alerts], ['verified', 'not_run', 'not_run', []]);
  const manual = merge(scheduled(), lostRun({ id: 502, createdAt: LATER_AT, event: 'workflow_dispatch' }),
    lostRun({ id: 503, createdAt: LATER_AT, event: 'workflow_dispatch', gate: 'failure', ga4: 'skipped', appsflyer: 'skipped' }));
  h = ingest(stateRoot(t), github(manual));
  assert.deepEqual([h.status, h.latest.run_id, h.latest.ga4, h.alerts, h.latest_schedule_at], ['verified', 503, 'not_run', [], RUN_AT]);
  const dry = lostRun({ id: 504, createdAt: LATER_AT, event: 'workflow_dispatch', ga4: 'success', appsflyer: 'skipped' });
  dry.artifacts[504] = [artifact(dry.runs[0], 'acquisition-ga4-dryrun-504')];
  h = ingest(stateRoot(t), github(merge(scheduled(), dry)));
  assert.deepEqual([h.status, h.latest.ga4, h.alerts], ['verified', 'dry_run', []]);
  // The integrity verdicts are not scheduled-only: a manual run whose envelope does not open still alerts.
  const foreign = scheduled({ r: remote({ id: 505, event: 'workflow_dispatch', createdAt: RUN_AT }), ga4: ga4Payload({ id: 505 }),
    af: afPayload({ id: 505, event: 'workflow_dispatch' }), sealTo: OTHER.publicKey });
  h = ingest(stateRoot(t), github(merge(lostRun({ id: 499, ga4: 'skipped', appsflyer: 'skipped' }), foreign)));
  assert.deepEqual([h.status, h.alerts.map(a => [a.run_id, a.state])], ['alert', [[505, 'envelope_invalid'], [505, 'envelope_invalid']]]);
});

test('a lost source clears when a later scheduled run delivers it; a stop, a manual export or a failed receipt does not', t => {
  const cleared = ingest(stateRoot(t), github(merge(lostRun(), scheduled())));
  assert.deepEqual([cleared.status, cleared.alerts], ['verified', []]);
  // Per source: GA4 came back, AppsFlyer failed again; both AppsFlyer losses stay listed.
  const partly = ingest(stateRoot(t), github(merge(lostRun(), scheduled({ af: null, afJob: 'failure' }))));
  assert.deepEqual(partly.alerts, [...lostAlerts(500, { appsflyer: 'job_failed_without_artifact' }),
    ...lostAlerts(501, { appsflyer: 'job_failed_without_artifact' }, RUN_AT)]);
  // A stopped (or already-collected) scheduled run and a manual export run do not clear it.
  const stopped = ingest(stateRoot(t), github(merge(lostRun(), lostRun({ id: 501, createdAt: RUN_AT, ga4: 'skipped', appsflyer: 'skipped' }))));
  assert.deepEqual(stopped.alerts, lostAlerts(500, { ga4: 'job_failed_without_artifact', appsflyer: 'job_failed_without_artifact' }));
  const manual = scheduled({ r: remote({ event: 'workflow_dispatch' }), af: afPayload({ event: 'workflow_dispatch' }) });
  const byHand = ingest(stateRoot(t), github(merge(lostRun(), manual)));
  assert.deepEqual([byHand.latest.ga4, byHand.latest.appsflyer, byHand.status], ['admitted', 'admitted', 'alert']);
  assert.equal(byHand.alerts.length, 2);
  // A delivery before the loss does not clear it.
  const after = ingest(stateRoot(t), github(merge(scheduled(), lostRun({ id: 502, createdAt: LATER_AT }))));
  assert.deepEqual(after.alerts, lostAlerts(502, { ga4: 'job_failed_without_artifact', appsflyer: 'job_failed_without_artifact' }, LATER_AT));
  // A verified receipt that already existed for the end-date counts as delivered, and so does key_pending for AppsFlyer
  // (the local reader owns AppsFlyer again until the secret is registered).
  const kept = stateRoot(t), dir = path.join(kept, 'data/collection-receipts'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const name of ['ga4-funnel-2026-10-10.json', 'appsflyer-2026-10-14.json']) fs.writeFileSync(path.join(dir, name), JSON.stringify({ status: 'verified' }));
  const retained = ingest(kept, github(merge(lostRun(), scheduled())));
  assert.deepEqual([retained.latest.ga4, retained.latest.appsflyer, retained.status], ['existing_receipt_retained', 'existing_receipt_retained', 'verified']);
  const pending = merge(lostRun(), scheduled({ af: null }));
  pending.jobs[501][2] = job('appsflyer', 'success', pending.runs[1], [{ name: H.KEY_PENDING_STEP, status: 'completed', conclusion: 'success' }]);
  const rested = ingest(stateRoot(t), github(pending));
  assert.deepEqual([rested.latest.appsflyer, rested.appsflyer_key, rested.status, rested.alerts], ['key_pending', 'key_pending', 'verified', []]);
  // A failed receipt is never a delivery. GA4: a later sealed failure adds its own loss; AppsFlyer: it neither
  // clears the older loss nor adds one (the local reader reads that end-date again).
  const failedLater = ingest(stateRoot(t), github(merge(lostRun(), sealedRun({ id: 501, createdAt: RUN_AT }))));
  assert.deepEqual(failedLater.alerts, [...lostAlerts(500, { ga4: 'job_failed_without_artifact', appsflyer: 'job_failed_without_artifact' }),
    ...lostAlerts(501, { ga4: 'admitted_failed' }, RUN_AT)]);
  // A failed GA4 receipt that already existed for the end-date (here a failed legacy dispatch) is kept, so the
  // scheduled data never arrives: a loss too. A verified one is a delivery (above).
  const legacy = stateRoot(t), legacyDir = path.join(legacy, 'data/collection-receipts'); fs.mkdirSync(legacyDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(legacyDir, 'ga4-funnel-2026-10-10.json'), JSON.stringify({ status: 'failed', failure: 'remote_query_or_preparation_failed' }));
  const blocked = ingest(legacy, github(merge(lostRun(), scheduled())));
  assert.deepEqual([blocked.latest.ga4, blocked.latest.appsflyer], ['existing_receipt_retained', 'admitted']);
  assert.deepEqual(blocked.alerts, [...lostAlerts(500, { ga4: 'job_failed_without_artifact' }), ...lostAlerts(501, { ga4: 'existing_receipt_failed' }, RUN_AT)]);
  // Only a verified receipt delivers. One still pending when the run was recorded (a legacy GA4 dispatch in flight)
  // neither clears the older loss nor adds one.
  const inFlight = stateRoot(t), flightDir = path.join(inFlight, 'data/collection-receipts'); fs.mkdirSync(flightDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(flightDir, 'ga4-funnel-2026-10-10.json'), JSON.stringify({ status: 'dispatched' }));
  const dispatched = ingest(inFlight, github(merge(lostRun(), scheduled())));
  assert.deepEqual([dispatched.latest.ga4, dispatched.latest.appsflyer], ['existing_receipt_retained', 'admitted']);
  assert.deepEqual(dispatched.alerts, lostAlerts(500, { ga4: 'job_failed_without_artifact' }));
  // A verified admission made by an earlier ingest of the then-unfinished record (already_admitted) is a delivery.
  const earlier = stateRoot(t);
  assert.deepEqual(ingest(earlier, github({ ...merge(lostRun(), scheduled()), upstream: null })).alerts, lostAlerts(500, { appsflyer: 'job_failed_without_artifact' }));
  const readmitted = ingest(earlier, github(merge(lostRun(), scheduled())));
  assert.deepEqual([readmitted.latest.ga4, readmitted.latest.appsflyer, readmitted.status, readmitted.alerts], ['already_admitted', 'admitted', 'verified', []]);
  // Integrity alerts keep their own action text and their own lifetime; the loss is listed beside them.
  const tampered = merge(lostRun(), scheduled({ af: afPayload({ mutate: p => { p.provenance.event = 'workflow_dispatch'; } }) }));
  const both = stateRoot(t), b = ingest(both, github(tampered));
  assert.deepEqual(b.alerts, [{ run_id: 501, source: 'appsflyer', state: 'provenance_mismatch' }, ...lostAlerts(500, { appsflyer: 'job_failed_without_artifact' })]);
  const status = acquisitionHandoffStatus({ stateRoot: both });
  assert.deepEqual(status.alert_states, ['provenance_mismatch', 'scheduled_collection_lost']); assert.match(status.action, /integrity of an Actions artifact/);
  assert(ALERT_STATES.includes('provenance_mismatch'));
});

test('no scheduled run within the cron-silence limit alerts, and the next scheduled run clears it', t => {
  assert.equal(SCHEDULE_SILENCE_MINUTES, SCHEDULE_EXPECTATIONS.find(e => e.path === H.ACQUISITION_WORKFLOW).max_silence_minutes);
  assert.equal(SCHEDULE_SILENCE_MINUTES, 1680);
  const at = (base, minutes, seconds = 0) => new Date(Date.parse(base) + minutes * 60000 + seconds * 1000);
  const limit = at(RUN_AT, SCHEDULE_SILENCE_MINUTES);
  assert.equal(ingest(stateRoot(t), github(scheduled()), { now: limit }).status, 'verified', 'exactly at the limit is alive');
  const late = stateRoot(t), silent = ingest(late, github(scheduled()), { now: at(RUN_AT, SCHEDULE_SILENCE_MINUTES, 1) });
  assert.equal(silent.status, 'alert');
  assert.deepEqual(silent.alerts, [{ source: 'schedule', state: 'scheduled_run_silent', latest_schedule_at: RUN_AT, max_silence_minutes: 1680 }]);
  const status = acquisitionHandoffStatus({ stateRoot: late });
  assert.deepEqual(status.alert_states, ['scheduled_run_silent']); assert.match(status.action, /^No scheduled acquisition-daily run was created within 1680 minutes/);
  // The next scheduled run clears it as soon as GitHub creates it, before it finishes.
  const next = remote({ id: 502, status: 'queued', conclusion: null, createdAt: at(RUN_AT, SCHEDULE_SILENCE_MINUTES).toISOString() });
  const resumed = ingest(late, github({ ...scheduled(), runs: [...scheduled().runs, next] }), { now: at(RUN_AT, SCHEDULE_SILENCE_MINUTES, 1) });
  assert.deepEqual([resumed.status, resumed.active_runs, resumed.alerts], ['verified', [502], []]);
  // No scheduled run in the listing, or only manual runs: silent. An unreadable listing is unavailable, not silent.
  const none = ingest(stateRoot(t), github({}));
  assert.deepEqual([none.status, none.alerts], ['alert', [{ source: 'schedule', state: 'scheduled_run_silent', latest_schedule_at: null, max_silence_minutes: 1680 }]]);
  const manualOnly = ingest(stateRoot(t), github(scheduled({ r: remote({ event: 'workflow_dispatch' }), af: afPayload({ event: 'workflow_dispatch' }) })));
  assert.deepEqual([manualOnly.status, manualOnly.alerts.map(a => a.state)], ['alert', ['scheduled_run_silent']]);
  const unreadable = ingest(stateRoot(t), github({ ...scheduled(), failList: true }));
  assert.deepEqual([unreadable.status, unreadable.alerts], ['unavailable', []]);
  // Observed start times (UTC created_at, nominal cron 21:23): about two hours late every day stays well inside.
  for (const [previous, now] of [['2026-10-15T23:42:21Z', '2026-10-16T23:39:49Z'], ['2026-10-16T23:39:50Z', '2026-10-17T23:11:55Z'],
    ['2026-10-17T23:11:56Z', '2026-10-18T23:20:43Z']]) {
    const h = ingest(stateRoot(t), github(lostRun({ id: 600, createdAt: previous, ga4: 'skipped', appsflyer: 'skipped' })), { now: new Date(now) });
    assert.equal(h.status, 'verified', `${previous} → ${now}`);
  }
  // Only a start more than four hours later than the previous day's reaches the limit.
  const previous = lostRun({ id: 600, createdAt: '2026-10-17T23:11:56Z', ga4: 'skipped', appsflyer: 'skipped' });
  assert.equal(ingest(stateRoot(t), github(previous), { now: new Date('2026-10-19T03:11:56Z') }).status, 'verified');
  assert.equal(ingest(stateRoot(t), github(previous), { now: new Date('2026-10-19T03:11:57Z') }).alerts[0].state, 'scheduled_run_silent');
  // A loss and a silence together: both states are listed, the loss action first, then the silence action.
  const quiet = stateRoot(t);
  ingest(quiet, github(lostRun()), { now: at(LOST_AT, SCHEDULE_SILENCE_MINUTES, 1) });
  const q = acquisitionHandoffStatus({ stateRoot: quiet });
  assert.deepEqual(q.alert_states, ['scheduled_collection_lost', 'scheduled_run_silent']); assert.match(q.action, LOST); assert.match(q.action, SILENT);
  // The silence action sends the operator to the workflow's own run list and state, not to an issue that may not exist.
  assert.match(status.action, /run list and state in GitHub Actions: disabled/); assert.doesNotMatch(status.action, /read the cron-health/i);
});
