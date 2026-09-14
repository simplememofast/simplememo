import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {unseal} from './analytics-envelope.mjs';
import {DAILY_REPO, DAILY_WORKFLOW, DAILY_LIMIT, dailyHash, snapshotFromDaily, retainedDaily,
  dailyJobsEndpoint, verifyDailyJobProof} from './daily-gsc-handoff.mjs';
import {privateState, atomicJson} from './company-loop.mjs';

const command = (name, args, opts = {}) => execFileSync(name, args, {encoding: 'utf8', timeout: 60000,
  maxBuffer: 4 * 1024 ** 2, stdio: ['pipe', 'pipe', 'pipe'], ...opts});

// Only GitHub reads. Missing/invalid artifacts never cause a workflow dispatch.
export function collectDailyGsc({stateRoot, now = new Date(), run = command,
  privateKeyFile = path.join(os.homedir(), '.local/share/simplememo-analytics/keys/recipient-private.pem')} = {}) {
  const directory = privateState(path.join(stateRoot, 'data/seo-daily')), failures = [];
  const json = args => JSON.parse(run('gh', args));
  const list = json(['api', `repos/${DAILY_REPO}/actions/workflows/seo-daily.yml/runs?branch=main&status=completed&per_page=3`]);
  for (const remote of list.workflow_runs ?? []) {
    try {
      if (remote.repository?.full_name !== DAILY_REPO || remote.path !== DAILY_WORKFLOW || remote.head_branch !== 'main'
        || remote.status !== 'completed' || !['success', 'failure'].includes(remote.conclusion) || !['schedule', 'workflow_dispatch'].includes(remote.event)
        || !Number.isSafeInteger(remote.id) || !Number.isSafeInteger(remote.run_attempt)) throw new Error('remote');
      let gscJobProof = null;
      if (remote.conclusion === 'failure') {
        const endpoint = dailyJobsEndpoint(remote), inventory = json(['api', endpoint]);
        gscJobProof = {schema_version: 1, endpoint, run_id: remote.id, run_attempt: remote.run_attempt,
          source_sha: remote.head_sha, observed_at: now.toISOString(), inventory};
        verifyDailyJobProof(gscJobProof, {remote, now});
      }
      const provenance = {workflow_conclusion: remote.conclusion, gsc_job_id: gscJobProof?.inventory.jobs.find(j => j.name === 'measure')?.id ?? null};
      const id = String(remote.id), dir = privateState(path.join(directory, id + '-' + remote.run_attempt));
      const output = path.join(dir, 'snapshot.json'), cached = path.join(dir, 'receipt.json');
      if (fs.existsSync(cached)) {
        const r = JSON.parse(fs.readFileSync(cached, 'utf8')), bytes = fs.readFileSync(output);
        if (r.status !== 'verified' || r.source !== 'gsc_daily_handoff' || r.run_id !== remote.id
          || r.source_commit !== remote.head_sha || r.output !== output || r.sha256 !== dailyHash(bytes)) throw new Error('cached receipt');
        const snapshot = snapshotFromDaily(JSON.parse(bytes), {now, remote, gscJobProof});
        const receipt = {...r, remote, gsc_job_proof: gscJobProof, window: {start: snapshot.meta.period_start, end: snapshot.meta.period_end}, reused: true};
        atomicJson(path.join(directory, 'latest.json'), receipt);
        atomicJson(path.join(directory, 'health.json'), {status: 'verified', run_id: remote.id, observed_at: now.toISOString(), ...provenance, failures});
        return receipt;
      }
      const listing = json(['api', `repos/${DAILY_REPO}/actions/runs/${id}/artifacts`]);
      const matches = listing.artifacts?.filter(a => a.name === 'seo-daily-encrypted-' + id + '-' + remote.run_attempt && !a.expired);
      if (matches?.length !== 1) {failures.push({run_id: id, reason: 'encrypted_artifact_not_available'}); continue;}
      const artifact = matches[0];
      if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes > DAILY_LIMIT * 2) throw new Error('size');
      // Fresh temporary download prevents an old or uncertain transfer being admitted.
      const download = fs.mkdtempSync(path.join(dir, 'download-')); fs.chmodSync(download, 0o700);
      try {
        run('gh', ['run', 'download', id, '--repo', DAILY_REPO, '--name', artifact.name, '--dir', download]);
        const names = fs.readdirSync(download);
        if (names.length !== 1 || names[0] !== 'seo-daily.enc.json') throw new Error('files');
        const file = path.join(download, names[0]), stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > DAILY_LIMIT * 2) throw new Error('envelope');
        const payload = unseal(JSON.parse(fs.readFileSync(file, 'utf8')), fs.readFileSync(privateKeyFile, 'utf8'));
        const snapshot = snapshotFromDaily(payload, {now, remote, gscJobProof});
        atomicJson(output, payload);
        const receipt = {schema_version: 1, source: 'gsc_daily_handoff', status: 'verified', collected_at: now.toISOString(),
          run_id: remote.id, source_commit: remote.head_sha, remote, gsc_job_proof: gscJobProof, artifact_id: artifact.id,
          envelope_sha256: dailyHash(fs.readFileSync(file)), output, sha256: dailyHash(fs.readFileSync(output)),
          window: {start: snapshot.meta.period_start, end: snapshot.meta.period_end}, new_queries: 0,
          query_cost_usd: null, note: 'Existing SEO Daily queries reused; monetary query cost is unavailable, not zero. Native Company origin is separate.'};
        atomicJson(cached, receipt); atomicJson(path.join(directory, 'latest.json'), receipt);
        atomicJson(path.join(directory, 'health.json'), {status: 'verified', run_id: remote.id, observed_at: now.toISOString(), ...provenance, failures});
        return receipt;
      } finally {fs.rmSync(download, {recursive: true, force: true});}
    } catch {failures.push({run_id: remote.id, reason: 'remote_handoff_unavailable_or_invalid', retry: 'read_again_on_next_existing_tick'});}
  }
  let retained = null;
  try {retained = retainedDaily({stateRoot, now});} catch { /* failure stays explicit */ }
  const health = {source: 'gsc_daily_handoff', status: 'unavailable', observed_at: now.toISOString(), failures,
    retained_admitted_run: retained?.receipt.run_id ?? null, new_queries: 0};
  atomicJson(path.join(directory, 'health.json'), health); return health;
}
