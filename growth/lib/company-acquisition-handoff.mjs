// Local, on-demand ingest of acquisition-daily.yml. Only GitHub reads: no workflow
// dispatch, no provider query and no retry of a remote run happens here.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { unseal } from './analytics-envelope.mjs';
import { privateState, atomicJson } from './company-loop.mjs';
import { collectionWindow, verifyAppsFlyer } from './company-data.mjs';
import { ACQUISITION_REPO, ACQUISITION_WORKFLOW, ACQUISITION_WORKFLOW_REF, RETENTION_DAYS, JOBS, KEY_PENDING_STEP,
  PINS_STEP, ENVIRONMENT_STEP, APPSFLYER_READER_PATH, APPSFLYER_READER_UPSTREAM, APPSFLYER_READER_SHA256, APPSFLYER_HANDOFF_SCHEMA,
  APPSFLYER_CREDENTIAL_ORIGIN, APPSFLYER_SECRET, APPSFLYER_ENVIRONMENT, COLLECTION_ATTEMPT, RECIPIENT_SPKI_SHA256,
  GA4_ARTIFACT, GA4_DRYRUN_ARTIFACT, APPSFLYER_ARTIFACT, GA4_ENVELOPE, APPSFLYER_ENVELOPE,
  ENVELOPE_LIMIT, ga4ArtifactName, acceptedRun, validDay, acquisitionStop } from './acquisition-handoff.mjs';
import { SCHEDULE_EXPECTATIONS } from '../../scripts/lib/cron-silence.mjs';

const DAY = 86400000;
const CAP_BYTES = 2 * 1024 ** 3;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The scheduled run is nominally 06:23 JST and observed hours late. Until this JST
// hour, a day without a finished scheduled run still belongs to the Actions owner.
export const SCHEDULE_GRACE_JST_HOUR = 18;
const jst = at => new Date(Date.parse(at) + 9 * 3600000);
const jstDay = at => jst(at).toISOString().slice(0, 10);
const WORKFLOW_FILE = path.posix.basename(ACQUISITION_WORKFLOW);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const command = (name, args, options = {}) => execFileSync(name, args, {
  encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 ** 2, stdio: ['pipe', 'pipe', 'pipe'], ...options });
class Final extends Error {}       // Recorded once; never retried.
const final = state => { throw new Final(state); };
// Final states that mean the artifact or the setup is not what the workflow promises. They keep
// the ingest out of 'verified' while the run stays inside the retention window, even after later successes.
export const ALERT_STATES = Object.freeze(['envelope_invalid', 'envelope_files_unexpected', 'provenance_mismatch',
  'reader_divergence', 'duplicate_artifacts', 'artifact_size_invalid', 'pins_mismatch', 'environment_unverified']);
// scheduled_collection_lost: a scheduled run left a source without data. Verdicts:
// - SCHEDULE_LOSS_STATES: the job failed or finished without an artifact, or the artifact had expired when the
//   run was inventoried (unless that run's own receipt exists; see scheduleOutcome);
// - gate_<conclusion>: the gate did not succeed, so both sources were lost;
// - GA4 only, a failed receipt (see failedReceipt): admitted_failed (the run's own sealed failure) or
//   existing_receipt_failed (a failed receipt for that end-date already existed and was kept).
// Only event=schedule runs raise it. Manual runs, dry runs and a gate that decided not to collect (stop, end-date
// already collected) never raise it; the integrity ALERT_STATES above apply to every run, manual ones included.
// It clears when a later scheduled run delivers that source (SCHEDULE_DELIVERED_STATES with a verified receipt;
// key_pending hands AppsFlyer back to the local reader). It also disappears, without any delivery, once the lost
// run leaves the run listing (RETENTION_DAYS + 1 days), so an emergency stop longer than that hides an old loss.
// While a completed run is re-run, GitHub lists it as in progress and its record sits out until the re-run
// completes: its own loss, or a delivery that cleared an older one, is re-evaluated then.
export const SCHEDULE_LOSS_STATES = Object.freeze(['job_failed_without_artifact', 'artifact_missing', 'artifact_expired']);
export const SCHEDULE_DELIVERED_STATES = Object.freeze(['admitted', 'already_admitted', 'existing_receipt_retained', 'key_pending']);
// Liveness uses the same limit and boundary as cron-health for this workflow (scripts/lib/cron-silence.mjs: one
// day plus four hours for delayed starts), measured from the newest scheduled run GitHub created, queued and
// in-progress runs included. Actual starts drift two to three hours after the nominal 21:23 UTC, so only a change
// in that delay of over four hours from one day to the next reaches it. Cron Health is not a second witness of
// the same gap: it opens issues only from its daily 07:00 JST run or a manual dispatch, and a disabled workflow makes it fail instead.
export const SCHEDULE_SILENCE_MINUTES = SCHEDULE_EXPECTATIONS.find(e => e.path === ACQUISITION_WORKFLOW)?.max_silence_minutes ?? null;

// Only a verified receipt is a delivery. A failed one is, for GA4, also a loss: export-analytics.mjs seals a query
// error, a blocked or incomplete result and exits 1, the ingest admits it as a failed receipt, and collectAnalytics
// returns that receipt before any legacy dispatch (company-data.mjs), so the end-date stays without GA4 data.
// For AppsFlyer it is neither: collectAppsFlyer returns an existing receipt only when it is verified, has used three
// attempts or failed on permission_or_credential, so over an Actions failure receipt (attempts 1, failure
// actions_reader_failed) a collect on the same JST day (the window follows the JST date) reads that end-date again
// locally, with at most the two attempts left. If that read fails too, the failed receipt shows in that collect
// (its status partial), not here.
// A receipt still pending (a legacy GA4 dispatch in flight when the run was recorded) neither clears nor alerts.
// already_admitted carries the receipt status because an earlier ingest of a then-unfinished record admitted it.
const RECEIPT_STATES = Object.freeze(['already_admitted', 'existing_receipt_retained']);
const failedReceipt = s => s.state === 'admitted_failed' || (RECEIPT_STATES.includes(s.state) && s.status === 'failed');
const delivery = s => SCHEDULE_DELIVERED_STATES.includes(s.state) && (!RECEIPT_STATES.includes(s.state) || s.status === 'verified');
const RECEIPT_PREFIX = Object.freeze({ ga4: 'ga4-funnel', appsflyer: 'appsflyer' });

/** The receipt this run (attempt 1) wrote for the source, or null. Read only. */
function ownReceipt(receipts, r, source) {
  const end = r[`${source}_artifact_end`];
  if (!validDay(end)) return null;
  try {
    const prior = read(path.join(receipts, `${RECEIPT_PREFIX[source]}-${end}.json`));
    return prior?.origin?.run_id === r.run_id && prior.origin.run_attempt === COLLECTION_ATTEMPT ? prior : null;
  } catch { return null; }
}

// A record is rewritten until both sources are final. If the other source kept retrying until the artifacts
// expired, an admitted source turns into artifact_expired in the frozen record; the receipt that run wrote is
// the better witness, so it decides (records and receipts stay as they are).
function scheduleOutcome(r, source, receipts) {
  let s = r[source];
  if (s.state === 'artifact_expired') {
    const own = ownReceipt(receipts, r, source);
    if (own) s = { state: 'already_admitted', status: own.status ?? null };
  }
  if (SCHEDULE_LOSS_STATES.includes(s.state)) return { lost: s.state };
  if (s.state === 'not_run' && r.jobs?.gate !== 'success') return { lost: `gate_${r.jobs?.gate ?? 'absent'}` };
  if (failedReceipt(s)) return source === 'ga4' ? { lost: s.state === 'existing_receipt_retained' ? 'existing_receipt_failed' : 'admitted_failed' } : {};
  return delivery(s) ? { delivered: true } : {};
}

/** Derived on every ingest from the retained run records; the records themselves stay as first written. */
function scheduleLosses(records, receipts) {
  const scheduled = records.filter(r => r.event === 'schedule');
  const outcomes = scheduled.map(r => Object.fromEntries(['ga4', 'appsflyer'].map(source => [source, scheduleOutcome(r, source, receipts)])));
  const delivered = Object.fromEntries(['ga4', 'appsflyer'].map(source => [source, outcomes.findLastIndex(o => o[source].delivered)]));
  return scheduled.flatMap((r, i) => ['ga4', 'appsflyer'].filter(source => i > delivered[source] && outcomes[i][source].lost)
    .map(source => ({ run_id: r.run_id, created_at: r.created_at, source, state: 'scheduled_collection_lost', verdict: outcomes[i][source].lost })));
}

/** Never replaces an existing receipt, whatever its status or origin. */
function createOnce(file, value) {
  const tmp = file + '.' + crypto.randomUUID() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.linkSync(tmp, file); return true; }
  catch (error) { if (error.code === 'EEXIST') return false; throw error; }
  finally { fs.rmSync(tmp, { force: true }); }
}

/** Every completed main run inside the artifact retention, page by page. */
export function listAcquisitionRuns({ json, now, perPage = 100, maxPages = 5 }) {
  const cutoff = new Date(now.getTime() - (RETENTION_DAYS + 1) * DAY).toISOString();
  const runs = []; let total = null;
  for (let page = 1; page <= maxPages; page++) {
    const data = json(['api', `repos/${ACQUISITION_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main`
      + `&exclude_pull_requests=true&created=${encodeURIComponent('>=' + cutoff)}&per_page=${perPage}&page=${page}`]);
    if (!Number.isSafeInteger(data?.total_count) || data.total_count < 0 || !Array.isArray(data.workflow_runs)
      || data.workflow_runs.length > perPage || (total !== null && data.total_count !== total)) throw new Error('run_listing_invalid');
    total = data.total_count; runs.push(...data.workflow_runs);
    if (runs.length >= total || data.workflow_runs.length < perPage) break;
  }
  if (runs.length !== total || new Set(runs.map(r => r?.id)).size !== runs.length) throw new Error('run_listing_truncated');
  return runs;
}

// Credentialed jobs run only on attempt 1 and artifacts survive re-runs, so the jobs that made
// them are read from that attempt even when the listing already shows a later one.
function inventory(json, remote) {
  const jobs = json(['api', `repos/${ACQUISITION_REPO}/actions/runs/${remote.id}/attempts/${COLLECTION_ATTEMPT}/jobs?per_page=100`]);
  if (!Array.isArray(jobs?.jobs) || jobs.total_count !== jobs.jobs.length || jobs.jobs.length > 99
    || jobs.jobs.some(j => j.run_id !== remote.id || j.run_attempt !== COLLECTION_ATTEMPT || j.head_sha !== remote.head_sha)) throw new Error('job_inventory_invalid');
  const job = name => {
    const matches = jobs.jobs.filter(j => j.name === name);
    if (matches.length > 1) throw new Error('job_inventory_invalid');
    return matches[0] ?? null;
  };
  const listing = json(['api', `repos/${ACQUISITION_REPO}/actions/runs/${remote.id}/artifacts?per_page=100`]);
  if (!Array.isArray(listing?.artifacts) || listing.total_count !== listing.artifacts.length || listing.artifacts.length > 100
    || listing.artifacts.some(a => !Number.isSafeInteger(a?.id) || typeof a.name !== 'string'
      || (a.workflow_run && a.workflow_run.id !== remote.id))) throw new Error('artifact_inventory_invalid');
  return { gate: job(JOBS.gate), ga4: job(JOBS.ga4), appsflyer: job(JOBS.appsflyer), artifacts: listing.artifacts };
}

function only(artifacts, pattern, jobRow) {
  const matches = artifacts.filter(a => pattern.test(a.name));
  if (!matches.length) {
    if (!jobRow || jobRow.conclusion === 'skipped') final('not_run');
    final(jobRow.conclusion === 'success' ? 'artifact_missing' : 'job_failed_without_artifact');
  }
  if (matches.length > 1) final('duplicate_artifacts');
  const artifact = matches[0];
  if (artifact.expired) final('artifact_expired');
  if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes > ENVELOPE_LIMIT) final('artifact_size_invalid');
  return { artifact, end: pattern.exec(artifact.name)[1] };
}

// Fresh 0700 directory per download; a stale or partial transfer is never admitted. The private
// key was read and matched to the pinned recipient up front, so a failure here is the envelope's.
function download({ run, remote, artifact, root, file, privatePem }) {
  const dir = fs.mkdtempSync(path.join(root, 'download-')); fs.chmodSync(dir, 0o700);
  try {
    try { run('gh', ['run', 'download', String(remote.id), '--repo', ACQUISITION_REPO, '--name', artifact.name, '--dir', dir]); }
    catch { return { retry: 'download_unavailable' }; }
    const names = fs.readdirSync(dir);
    if (names.length !== 1 || names[0] !== file) final('envelope_files_unexpected');
    const target = path.join(dir, file), stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > ENVELOPE_LIMIT) final('envelope_invalid');
    const bytes = fs.readFileSync(target);
    let payload;
    try { payload = unseal(JSON.parse(bytes.toString('utf8')), privatePem); }
    catch { final('envelope_invalid'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) final('envelope_invalid');
    return { payload, envelope_sha256: hash(bytes) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const origin = (remote, artifact, envelope) => ({ provider: 'github_actions', workflow: ACQUISITION_WORKFLOW, event: remote.event,
  run_id: remote.id, run_attempt: COLLECTION_ATTEMPT, latest_run_attempt: remote.run_attempt, head_sha: remote.head_sha, run_created_at: remote.created_at,
  artifact_id: artifact.id, artifact_name: artifact.name, envelope_sha256: envelope,
  scheduled_provider_execution: remote.event === 'schedule', scheduled_company_execution_verified: false });

function existing(file, remote) {
  if (!fs.existsSync(file)) return null;
  const prior = read(file);
  return prior.origin?.run_id === remote.id && prior.origin?.run_attempt === COLLECTION_ATTEMPT
    ? { state: 'already_admitted', status: prior.status } : { state: 'existing_receipt_retained', status: prior.status ?? null };
}

function admitGa4(ctx, remote, inv) {
  if (inv.artifacts.some(a => GA4_DRYRUN_ARTIFACT.test(a.name)) && !inv.artifacts.some(a => GA4_ARTIFACT.test(a.name))) final('dry_run');
  const { artifact, end } = only(inv.artifacts, GA4_ARTIFACT, inv.ga4);
  const file = path.join(ctx.receipts, `ga4-funnel-${end}.json`);
  const prior = existing(file, remote); if (prior) return { ...prior, end };
  const got = download({ ...ctx, remote, artifact, file: GA4_ENVELOPE });
  if (got.retry) return { state: got.retry, end, retry: true };
  // acquisition-daily.yml pads the plaintext (artifact sizes are public). Padding is spaces only and is not retained.
  const { padding, ...p } = got.payload;
  if (padding !== undefined && (typeof padding !== 'string' || /[^ ]/.test(padding))) final('provenance_mismatch');
  const observed = new Date(p.observed_at);
  let window;
  try { window = collectionWindow('ga4-funnel', observed); } catch { final('provenance_mismatch'); }
  if (p.report !== 'ga4-funnel' || p.execution !== 'export' || p.start !== window.start || p.end !== window.end || end !== window.end
    || String(p.run_id) !== String(remote.id) || p.source_sha !== remote.head_sha
    || p.project !== 'yurika-simplememo' || p.location !== 'asia-northeast1') final('provenance_mismatch');
  const base = { schema_version: 1, source: 'ga4-funnel', window, request_tag: `actions-${remote.id}-${COLLECTION_ATTEMPT}`,
    requested_at: remote.created_at, run_id: remote.id, source_commit: remote.head_sha, cap_bytes: CAP_BYTES, model_cost_usd: null,
    origin: origin(remote, artifact, got.envelope_sha256), new_dispatches: 0 };
  let receipt;
  if (p.status !== 'complete' || !Number.isFinite(p.total_bytes_billed) || p.total_bytes_billed > CAP_BYTES) {
    receipt = { ...base, status: 'failed', failure: p.status ?? 'invalid_status', total_bytes_billed: p.total_bytes_billed ?? null,
      note: 'Remote fixed query result retained as failed; the workflow and ingest never retry it.' };
  } else {
    const dir = privateState(path.join(ctx.root, `${remote.id}-${COLLECTION_ATTEMPT}`));
    const output = path.join(dir, 'ga4-funnel.json'); atomicJson(output, p);
    receipt = { ...base, status: 'verified', output, sha256: hash(fs.readFileSync(output)), verified_at: ctx.now.toISOString(),
      total_bytes_billed: p.total_bytes_billed, cost_usd: null, cost_note: 'Actual billed bytes recorded; account pricing/free tier unavailable' };
  }
  if (!createOnce(file, receipt)) return { state: 'existing_receipt_retained', end };
  return { state: receipt.status === 'verified' ? 'admitted' : 'admitted_failed', end };
}

function upstreamReader(ctx) {
  if (!ctx.upstream) {
    try {
      const sha = ctx.run('git', ['rev-parse', 'origin/main'], { cwd: ctx.apiRepo }).trim();
      const source = ctx.run('git', ['show', `${sha}:${APPSFLYER_READER_UPSTREAM}`], { cwd: ctx.apiRepo });
      ctx.upstream = { sha, sha256: hash(source) };
    } catch { ctx.upstream = { unavailable: true }; }
  }
  return ctx.upstream;
}

const stepIs = (job, name, conclusion) => Array.isArray(job?.steps) && job.steps.some(s => s.name === name && s.conclusion === conclusion);
const keyPending = job => job?.conclusion === 'success' && stepIs(job, KEY_PENDING_STEP, 'success');

function admitAppsFlyer(ctx, remote, inv) {
  const sealed = inv.artifacts.some(a => APPSFLYER_ARTIFACT.test(a.name));
  if (keyPending(inv.appsflyer) && !sealed) final('key_pending');
  // The key exists but a pre-token check failed, so the token was never placed: the pinned files or the
  // recipient differ from the workflow's pins, or the environment no longer admits main only (or was unreadable).
  if (stepIs(inv.appsflyer, PINS_STEP, 'failure') && !sealed) final('pins_mismatch');
  if (stepIs(inv.appsflyer, ENVIRONMENT_STEP, 'failure') && !sealed) final('environment_unverified');
  const { artifact, end } = only(inv.artifacts, APPSFLYER_ARTIFACT, inv.appsflyer);
  const file = path.join(ctx.receipts, `appsflyer-${end}.json`);
  const prior = existing(file, remote); if (prior) return { ...prior, end };
  const upstream = upstreamReader(ctx);
  if (upstream.unavailable) return { state: 'reader_reference_unavailable', end, retry: true };
  const got = download({ ...ctx, remote, artifact, file: APPSFLYER_ENVELOPE });
  if (got.retry) return { state: got.retry, end, retry: true };
  const p = got.payload, v = p?.provenance, result = p?.result;
  if (p?.schema !== APPSFLYER_HANDOFF_SCHEMA || v?.repository !== ACQUISITION_REPO || v.workflow !== ACQUISITION_WORKFLOW
    || v.workflow_ref !== ACQUISITION_WORKFLOW_REF || v.ref !== 'refs/heads/main' || v.run_id !== String(remote.id)
    || v.run_attempt !== COLLECTION_ATTEMPT || v.head_sha !== remote.head_sha || v.event !== remote.event
    || p.credential_origin !== APPSFLYER_CREDENTIAL_ORIGIN || p.window?.end !== end
    || !validDay(p.window?.start) || p.reader?.path !== APPSFLYER_READER_PATH) final('provenance_mismatch');
  if (p.reader.sha256 !== APPSFLYER_READER_SHA256 || upstream.sha256 !== APPSFLYER_READER_SHA256) final('reader_divergence');
  const base = { schema_version: 1, source: 'appsflyer', window: p.window, reader_commit: upstream.sha,
    reader_path: APPSFLYER_READER_PATH, reader_upstream: 'simplememo-api/' + APPSFLYER_READER_UPSTREAM, reader_sha256: p.reader.sha256,
    observed_at: p.observed_at, attempts: 1, retry_events: [], credential_origin: APPSFLYER_CREDENTIAL_ORIGIN,
    credential_note: 'result.json credential_source is the reader\'s fixed label; the value came from the Actions environment secret.',
    origin: origin(remote, artifact, got.envelope_sha256), human_touches: [], cost_usd: null,
    cost_note: 'Existing subscription/API allowance; no observed per-request charge', new_dispatches: 0 };
  let receipt;
  if (p.reader.ok !== true || result?.ok !== true) {
    receipt = { ...base, status: 'failed', failure: 'actions_reader_failed', reader_error: p.reader.error ?? null,
      http_status: p.reader.http_status ?? null, note: 'Recorded once. A local read may still run through the existing collector.' };
  } else {
    let window;
    try { window = collectionWindow('appsflyer', new Date(result.started_at)); } catch { final('provenance_mismatch'); }
    const csv = Buffer.from(p.csv_base64 ?? '', 'base64');
    if (window.start !== p.window.start || window.end !== end || result.parameters?.from !== window.start
      || result.parameters?.to !== window.end || result.http_status !== 200 || result.quality?.row_cap_hit !== false
      || hash(csv) !== result.quality.sha256) final('provenance_mismatch');
    const dir = privateState(path.join(ctx.stateRoot, 'data/appsflyer', `actions-${remote.id}-${COLLECTION_ATTEMPT}`));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    fs.writeFileSync(path.join(dir, 'report.csv'), csv, { mode: 0o600 });
    verifyAppsFlyer(dir);
    receipt = { ...base, status: 'verified', failure: null, output: dir, sha256: result.quality.sha256,
      manual_start_removed: 'Date selection, invocation, CSV integrity check and aggregate report handoff' };
  }
  if (!createOnce(file, receipt)) return { state: 'existing_receipt_retained', end };
  return { state: receipt.status === 'verified' ? 'admitted' : 'admitted_failed', end };
}

function attempt(fn) {
  try { return fn(); }
  catch (error) { if (error instanceof Final) return { state: error.message }; return { state: 'ingest_error', retry: true }; }
}

/** The private key must open envelopes for the pinned recipient; otherwise nothing is admitted or recorded. */
function recipientPrivateKey(file, expected) {
  try {
    const pem = fs.readFileSync(file, 'utf8');
    const spki = crypto.createPublicKey(crypto.createPrivateKey(pem)).export({ type: 'spki', format: 'der' });
    return hash(spki) === expected ? pem : null;
  } catch { return null; }
}

/** Names only. A repository-level copy would reach every job of the workflow, not just the environment's. */
function secretScope(json) {
  try {
    const listing = json(['api', `repos/${ACQUISITION_REPO}/actions/secrets?per_page=100`]);
    if (!Array.isArray(listing?.secrets) || listing.total_count !== listing.secrets.length) return 'unknown';
    return listing.secrets.some(s => s?.name === APPSFLYER_SECRET) ? 'repository_secret_present' : 'not_repository_secret';
  } catch { return 'unknown'; }
}

export function collectAcquisitionHandoff({ stateRoot, now = new Date(), run = command, perPage, maxPages,
  privateKeyFile = path.join(os.homedir(), '.local/share/simplememo-analytics/keys/recipient-private.pem'),
  recipientSha256 = RECIPIENT_SPKI_SHA256, apiRepo = path.join(os.homedir(), 'simplememo-api') } = {}) {
  const root = privateState(path.join(stateRoot, 'data/acquisition-actions'));
  const privatePem = recipientPrivateKey(privateKeyFile, recipientSha256);
  const ctx = { stateRoot, root, now, run, privatePem, apiRepo,
    receipts: privateState(path.join(stateRoot, 'data/collection-receipts')), runsDir: privateState(path.join(root, 'runs')) };
  const json = args => JSON.parse(run('gh', args));
  const failures = [], records = [], active = [];
  // A local key problem is retried by the next ingest; it never becomes a recorded verdict on a run.
  if (!privatePem) failures.push({ reason: 'recipient_private_key_unavailable', retry: 'next_ingest' });
  let runs = null;
  try { runs = listAcquisitionRuns({ json, now, perPage, maxPages }); }
  catch { failures.push({ reason: 'github_run_listing_unavailable', retry: 'next_ingest' }); }
  const accepted = [];
  for (const remote of [...(runs ?? [])].sort((a, b) => Date.parse(a?.created_at) - Date.parse(b?.created_at) || a.id - b.id)) {
    if (!acceptedRun(remote)) { failures.push({ run_id: remote?.id ?? null, reason: 'unexpected_run_identity' }); continue; }
    accepted.push(remote);
    if (remote.status !== 'completed') { active.push(remote.id); continue; }
    const recordFile = path.join(ctx.runsDir, `${remote.id}-${COLLECTION_ATTEMPT}.json`);
    if (fs.existsSync(recordFile)) {
      const prior = read(recordFile);
      if (prior.final === true && prior.run_id === remote.id && prior.head_sha === remote.head_sha) { records.push(prior); continue; }
    }
    if (!privatePem) continue;
    let inv;
    try { inv = inventory(json, remote); }
    catch { failures.push({ run_id: remote.id, reason: 'run_inventory_unavailable_or_invalid', retry: 'next_ingest' }); continue; }
    const record = { schema_version: 1, run_id: remote.id, run_attempt: COLLECTION_ATTEMPT, latest_run_attempt: remote.run_attempt,
      event: remote.event, head_sha: remote.head_sha, created_at: remote.created_at, conclusion: remote.conclusion, observed_at: now.toISOString(),
      jobs: Object.fromEntries(Object.keys(JOBS).map(k => [k, inv[k]?.conclusion ?? 'absent'])),
      ga4: attempt(() => admitGa4(ctx, remote, inv)), appsflyer: attempt(() => admitAppsFlyer(ctx, remote, inv)),
      ga4_artifact_end: inv.artifacts.map(a => GA4_ARTIFACT.exec(a.name)?.[1]).find(Boolean) ?? null,
      appsflyer_artifact_end: inv.artifacts.map(a => APPSFLYER_ARTIFACT.exec(a.name)?.[1]).find(Boolean) ?? null };
    record.final = !record.ga4.retry && !record.appsflyer.retry;
    atomicJson(recordFile, record); records.push(record);
    for (const source of ['ga4', 'appsflyer']) if (record[source].retry) failures.push({ run_id: remote.id, source, reason: record[source].state, retry: 'next_ingest' });
  }
  const newest = records.at(-1) ?? null;
  // Key state comes from the newest run whose AppsFlyer job decided it; skipped jobs say nothing.
  const ran = records.filter(r => !['not_run', 'dry_run', 'job_failed_without_artifact', 'artifact_missing', 'ingest_error']
    .includes(r.appsflyer.state)).at(-1);
  const scope = secretScope(json);
  const latestSchedule = accepted.filter(r => r.event === 'schedule').map(r => r.created_at).sort().at(-1) ?? null;
  // Exactly at the limit still counts as alive (same boundary as cron-silence). No scheduled run in the
  // listing at all is silence too; an unreadable listing is 'unavailable', not silence.
  const silent = runs !== null && !(Date.parse(latestSchedule) >= now.getTime() - SCHEDULE_SILENCE_MINUTES * 60000);
  const alerts = [...records.flatMap(r => ['ga4', 'appsflyer'].filter(k => ALERT_STATES.includes(r[k].state))
    .map(source => ({ run_id: r.run_id, source, state: r[source].state }))),
    ...scheduleLosses(records, ctx.receipts),
    ...(silent ? [{ source: 'schedule', state: 'scheduled_run_silent', latest_schedule_at: latestSchedule, max_silence_minutes: SCHEDULE_SILENCE_MINUTES }] : []),
    ...(scope === 'repository_secret_present' ? [{ source: 'appsflyer', state: 'repository_secret_present' }] : [])];
  const health = { schema_version: 1, source: 'acquisition_actions_handoff', workflow: ACQUISITION_WORKFLOW,
    status: runs === null ? 'unavailable' : alerts.length ? 'alert' : failures.length ? 'unavailable' : 'verified', observed_at: now.toISOString(),
    runs_considered: records.length, active_runs: active,
    ga4_artifact_ends: [...new Set(records.map(r => r.ga4_artifact_end).filter(Boolean))].sort(),
    // Artifacts seen but not yet admitted (retryable). Final verdicts leave the local reader free to fall back.
    appsflyer_pending_ends: [...new Set(records.filter(r => r.appsflyer.retry).map(r => r.appsflyer_artifact_end).filter(Boolean))].sort(),
    latest_schedule_at: latestSchedule,
    latest: newest && { run_id: newest.run_id, event: newest.event, created_at: newest.created_at,
      ga4: newest.ga4.state, appsflyer: newest.appsflyer.state },
    appsflyer_key: !ran ? 'unknown' : ['key_pending', 'environment_unverified'].includes(ran.appsflyer.state) ? ran.appsflyer.state : 'registered',
    appsflyer_environment: APPSFLYER_ENVIRONMENT, appsflyer_secret_scope: scope,
    alerts, failures, new_dispatches: 0, retention_days: RETENTION_DAYS };
  atomicJson(path.join(root, 'health.json'), health);
  return health;
}

const ACTIONS = {
  repository_secret_present: `Delete the repository-level ${APPSFLYER_SECRET}; keep it only as a secret of the ${APPSFLYER_ENVIRONMENT} environment.`,
  environment_unverified: `Limit the ${APPSFLYER_ENVIRONMENT} environment's deployment branches to main only; the token is not used until then.`,
  key_pending: `Owner registers ${APPSFLYER_SECRET} as a secret of the ${APPSFLYER_ENVIRONMENT} environment (never a repository secret); the job rests until then.`,
  alert: 'Inspect health.json alerts (integrity of an Actions artifact or setup); the local readers stay available.',
  scheduled_collection_lost: 'A scheduled acquisition-daily run left a source without data (health.json alerts: run_id, source, verdict); inspect that run. The alert changes no guard: a fallback that existed still runs (the local AppsFlyer reader; the legacy GA4 dispatch only for an end-date without an Actions artifact or receipt), and a GA4 failed receipt (admitted_failed, existing_receipt_failed) stays final. Clears when a later scheduled run delivers that source, or without any delivery once the lost run leaves the 15-day run listing.',
  scheduled_run_silent: `No scheduled acquisition-daily run was created within ${SCHEDULE_SILENCE_MINUTES} minutes (the cron-silence limit). Open the Acquisition Daily workflow's run list and state in GitHub Actions: disabled (enable it again; stop only through data/emergency-stop.json), no scheduled run created, or a start delayed past the limit. A Cron Health issue may not exist: it opens issues only from its daily 07:00 JST run or a manual dispatch, and a disabled workflow makes it fail instead. Clears when the next scheduled run appears.`,
};
const SCHEDULE_ALERTS = Object.freeze(['scheduled_collection_lost', 'scheduled_run_silent']);

// One standing action, as before: a repository-level token copy, else the AppsFlyer key state, else integrity
// alerts (they outlive later successes). A lost or silent schedule appends its own action after it, so a key or
// integrity action never hides it; each of those clears by itself.
function statusAction(h) {
  const alerts = h.alerts ?? [], states = new Set(alerts.map(a => a.state));
  const schedule = SCHEDULE_ALERTS.filter(s => states.has(s)).map(s => ACTIONS[s]);
  const integrity = alerts.some(a => ALERT_STATES.includes(a.state)) || (h.status === 'alert' && !schedule.length);
  const first = h.appsflyer_secret_scope === 'repository_secret_present' ? ACTIONS.repository_secret_present
    : ACTIONS[h.appsflyer_key] ?? (integrity ? ACTIONS.alert : null);
  return [first, ...schedule].filter(Boolean).join(' ') || null;
}

/** Stable, non-numeric view for status commands. */
export function acquisitionHandoffStatus({ stateRoot }) {
  try {
    const h = read(path.join(stateRoot, 'data/acquisition-actions/health.json'));
    const action = statusAction(h);
    return { workflow: ACQUISITION_WORKFLOW, ingest_status: h.status, ingested_at: h.observed_at,
      ga4: h.latest?.ga4 ?? 'no_completed_run', appsflyer: h.latest?.appsflyer ?? 'no_completed_run', appsflyer_key: h.appsflyer_key,
      appsflyer_secret_scope: h.appsflyer_secret_scope ?? 'unknown', alert_states: [...new Set((h.alerts ?? []).map(a => a.state))].sort(),
      ...(action ? { action } : {}) };
  } catch {
    return { workflow: ACQUISITION_WORKFLOW, ingest_status: 'not_ingested', ga4: 'unknown', appsflyer: 'unknown', appsflyer_key: 'unknown',
      appsflyer_secret_scope: 'unknown', alert_states: [], action: 'Run company-os acquisition-ingest.' };
  }
}

const scheduledToday = (handoff, now) => Number.isFinite(Date.parse(handoff?.latest_schedule_at))
  && jstDay(handoff.latest_schedule_at) === jstDay(now.toISOString());

/**
 * The local AppsFlyer reader (Mac credential) waits for the Actions owner only while that owner
 * will actually read: the secret is registered, and today's scheduled run is active or has not
 * happened yet (until the same grace hour), or its artifact awaits admission. key_pending,
 * unknown state, an unverified environment and final Actions verdicts leave the local reader as
 * before. The acquisition stop route applies here too (same as ga4ActionsGuard), so tripping it
 * stops every acquisition read, not only the workflow. Unreadable stop state is not "go".
 * Returns null when the local read may proceed.
 */
export function appsflyerActionsGuard({ end, handoff = null, now = new Date(), stopDoc = null }) {
  try { if (acquisitionStop(stopDoc ?? read(path.join(ROOT, 'data/emergency-stop.json'))).stopped) return 'acquisition_stopped'; }
  catch { return 'stop_ledger_unreadable'; }
  if (handoff?.appsflyer_key !== 'registered') return null;
  if (handoff.appsflyer_pending_ends?.includes(end)) return 'actions_artifact_pending';
  if (handoff.active_runs?.length) return 'actions_run_active';
  if (!scheduledToday(handoff, now) && jst(now.toISOString()).getUTCHours() < SCHEDULE_GRACE_JST_HOUR) return 'actions_owner_pending_today';
  return null;
}

/**
 * GA4 has one owner: acquisition-daily.yml. The legacy analytics-read dispatch is a
 * fallback only when the acquisition route is not stopped, no Actions artifact exists
 * for that end-date, no run is active, and today's scheduled run has finished (or
 * its grace has passed) without querying. Unreadable state is not absence.
 * Returns null only when a dispatch is allowed.
 */
export function ga4ActionsGuard({ end, handoff = null, run = command, now = new Date(), stopDoc = null }) {
  try { if (acquisitionStop(stopDoc ?? read(path.join(ROOT, 'data/emergency-stop.json'))).stopped) return 'acquisition_stopped'; }
  catch { return 'stop_ledger_unreadable'; }
  if (handoff?.ga4_artifact_ends?.includes(end)) return 'actions_artifact_exists';
  if (handoff?.active_runs?.length) return 'actions_run_active';
  try {
    const listing = JSON.parse(run('gh', ['api', `repos/${ACQUISITION_REPO}/actions/artifacts?name=${encodeURIComponent(ga4ArtifactName(end))}&per_page=100`]));
    if (!Number.isSafeInteger(listing?.total_count) || !Array.isArray(listing.artifacts) || listing.total_count > 100
      || listing.artifacts.length !== listing.total_count) return 'actions_owner_state_unreadable';
    if (listing.total_count > 0) return 'actions_artifact_exists';
    const runs = JSON.parse(run('gh', ['api', `repos/${ACQUISITION_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?branch=main&per_page=20`]));
    if (!Array.isArray(runs?.workflow_runs)) return 'actions_owner_state_unreadable';
    if (runs.workflow_runs.some(r => r?.status !== 'completed')) return 'actions_run_active';
    // A local session before today's scheduled run would otherwise query the same end-date first.
    const today = jstDay(now.toISOString());
    const ranToday = runs.workflow_runs.some(r => r?.event === 'schedule' && Number.isFinite(Date.parse(r.created_at))
      && jstDay(r.created_at) === today);
    if (!ranToday && jst(now.toISOString()).getUTCHours() < SCHEDULE_GRACE_JST_HOUR) return 'actions_owner_pending_today';
  } catch { return 'actions_owner_state_unreadable'; }
  return null;
}
