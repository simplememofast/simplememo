#!/usr/bin/env node
/** Completion dispatch is a second wakeup path, not a second model invocation.
 * GitHub API evidence, rather than a supplied boolean, determines unattended origin.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'simplememofast/simplememo';
export const NOTIFY_JOB = 'Notify Autopilot Act';
const BOT = 'github-actions[bot]';
// GitHub accepts the dispatch inside the notify job but creates the recipient run
// asynchronously. Observed lags: 0s (10-08), +1s (10-13), +2s (10-06). Requiring
// sentAt <= end reclassified those unattended detections as session-started.
export const DISPATCH_LAG_MS = 60_000;

export function primaryJob(jobs) {
  // Adding a post-job must not make its successful dispatch look like a successful model run.
  return jobs.find(job => job.name === 'autopilot') ?? null;
}

// The output check and its verdict run in the model-free `publish` job (it opens the PR).
// Act reads one run as the model job's steps followed by the publish job's steps.
export function primarySteps(jobs) {
  const primary = primaryJob(jobs);
  if (!primary?.steps) return null;
  const publish = jobs.find(job => job.name === 'publish');
  return [...primary.steps, ...(publish?.steps ?? [])];
}

function isRun(run, id, workflow) {
  return String(run?.id) === String(id) && run.path === `.github/workflows/${workflow}`
    && run.repository?.full_name === REPO && run.head_repository?.full_name === REPO
    && run.head_branch === 'main';
}

export function automaticCompletion(current, upstream, jobs) {
  if (current.event !== 'repository_dispatch' || current.run_attempt !== 1
    || current.actor?.login !== BOT || current.triggering_actor?.login !== BOT
    || upstream.event !== 'schedule' || upstream.run_attempt !== 1
    || upstream.status !== 'completed') return false;
  const sentAt = Date.parse(current.created_at);
  const notification = jobs.find(job => job.name === NOTIFY_JOB && job.conclusion === 'success');
  // The recipient must have been created by this parent's successful dispatch job:
  // not before it started, and no later than GitHub's run-creation lag after it ended.
  const start = Date.parse(notification?.started_at), end = Date.parse(notification?.completed_at);
  return Number.isFinite(sentAt) && Number.isFinite(start) && Number.isFinite(end)
    && start <= sentAt && sentAt <= end + DISPATCH_LAG_MS && end - start <= 180_000;
}

export async function completionOrigin({ env = process.env, event, get, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  if (!['schedule', 'workflow_run', 'repository_dispatch'].includes(env.GITHUB_EVENT_NAME)) return null;
  event ??= env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {};
  assert.equal(env.GITHUB_REPOSITORY, REPO, 'Completion is restricted to the production repository');
  assert.match(String(env.GITHUB_RUN_ID), /^[1-9]\d*$/, 'Missing current run id');
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  get ??= async endpoint => {
    assert.ok(token, 'GitHub read token is required');
    const response = await fetch(`https://api.github.com/repos/${REPO}${endpoint}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(20_000),
    });
    assert.ok(response.ok, `Completion evidence unavailable (HTTP ${response.status})`);
    return response.json();
  };
  const current = await get(`/actions/runs/${env.GITHUB_RUN_ID}`);
  assert.ok(isRun(current, env.GITHUB_RUN_ID, 'autopilot-act.yml'), 'Wrong recipient workflow or branch');
  assert.equal(current.event, env.GITHUB_EVENT_NAME, 'Monitor event does not match GitHub evidence');
  const firstAttempt = current.run_attempt === 1 && String(env.GITHUB_RUN_ATTEMPT) === '1';
  if (env.GITHUB_EVENT_NAME === 'schedule') {
    return { upstream_run_id: String(current.id), automatic: firstAttempt };
  }
  if (env.GITHUB_EVENT_NAME === 'workflow_run') {
    const parentId = event.workflow_run?.id;
    assert.match(String(parentId), /^[1-9]\d*$/, 'Missing workflow_run parent');
    const parent = await get(`/actions/runs/${parentId}`);
    assert.ok(['obsidian-autopilot.yml', 'autopilot-health.yml', 'cron-health.yml', 'auto-merge.yml']
      .some(workflow => isRun(parent, parentId, workflow)), 'Wrong workflow_run parent');
    if (parent.path === '.github/workflows/auto-merge.yml') {
      assert.ok(parent.status === 'completed' && parent.conclusion === 'success'
        && parent.event === 'workflow_run', 'Unverified routine publication');
      // Publication can originate in a human-directed change. It is a wakeup,
      // never retroactive evidence of unattended fault detection.
      return { upstream_run_id: String(parentId), automatic: false };
    }
    return { upstream_run_id: String(parentId), automatic: firstAttempt
      && parent.status === 'completed' && parent.event === 'schedule' && parent.run_attempt === 1 };
  }
  assert.equal(event.action, 'autopilot-completed', 'Wrong completion event type');
  const upstreamId = event.client_payload?.upstream_run_id;
  assert.match(String(upstreamId), /^[1-9]\d*$/, 'Invalid upstream run id');
  assert.notEqual(String(upstreamId), String(env.GITHUB_RUN_ID), 'Cannot notify itself');
  let upstream;
  // The dispatching job still belongs to the parent run. Wait for its final result,
  // otherwise reconcile-runs would skip precisely the run that woke this observer.
  for (let attempt = 0; attempt <= 12; attempt++) {
    upstream = await get(`/actions/runs/${upstreamId}`);
    assert.ok(isRun(upstream, upstreamId, 'obsidian-autopilot.yml'), 'Wrong upstream workflow or branch');
    if (upstream.status === 'completed') break;
    assert.ok(attempt < 12, 'Upstream still incomplete after bounded completion wait');
    await sleep(10_000);
  }
  const { jobs = [] } = await get(`/actions/runs/${upstreamId}/attempts/${upstream.run_attempt}/jobs?per_page=100`);
  const automatic = automaticCompletion(current, upstream, jobs)
    && String(env.GITHUB_RUN_ATTEMPT) === '1';
  return { upstream_run_id: String(upstreamId), automatic };
}

export function checkWiring(primary, act, source) {
  const job = primary.split('\n  notify-completion:\n')[1];
  assert.ok(job, 'Completion notification job is missing');
  assert.match(job, /name: Notify Autopilot Act/);
  assert.match(job, /needs: \[autopilot, publish\]/);
  assert.match(job, /if: always\(\) && github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /continue-on-error: true/);
  assert.match(job, /permissions:\n      contents: write\n    steps:/);
  assert.doesNotMatch(job, /secrets\.|checkout|actions: write|pull-requests: write/);
  assert.match(job, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(job, /createDispatchEvent/);
  assert.match(job, /event_type: 'autopilot-completed'/);
  assert.match(job, /upstream_run_id: String\(context\.runId\)/);
  assert.doesNotMatch(primary.split('\n  notify-completion:\n')[0], /actions: write/);
  assert.match(act, /repository_dispatch:\n    types: \[autopilot-completed\]/);
  assert.match(act, /workflow_run:[\s\S]*?types: \[completed\]/);
  assert.match(act, /cron: '0 0 \* \* \*'/);
  assert.ok(act.indexOf('Prepare ledger branch before observation') < act.indexOf('id: act\n'), 'Load pending ledger before deriving observations');
  assert.match(act, /node scripts\/autopilot-act-prepare\.mjs \"\$DAY\" \"\$MAIN_SHA\"/);
  assert.match(act, /--force-with-lease=refs\/heads\/\$DAY:\$PREPARED_PENDING_SHA/);
  assert.match(act, /autopilot-act-prepare\.mjs --verify-history/);
  assert.doesNotMatch(act, /git merge --no-edit/);
  assert.doesNotMatch(act, /git stash/);
  assert.match(source, /await completionOrigin\(\)/);
  assert.match(source, /primarySteps\(\(await jr\.json\(\)\)\.jobs \?\? \[\]\)/);
  assert.match(source, /job = primaryJob\(\(await jr\.json\(\)\)\.jobs \?\? \[\]\); jobId = job\?\.id/);
  return true;
}

function testPendingBranch(act) {
  // The same tests are also part of refactor.test.mjs. They execute the real
  // workflow shell with isolated commands and the actual reconciler against
  // local Git remotes, including concurrent writes and fail-closed decisions.
  assert.match(act, /node scripts\/autopilot-act-prepare\.mjs/);
  execFileSync(process.execPath, ['--test', 'scripts/autopilot-act-prepare.test.mjs',
    'scripts/autopilot-act-publish.test.mjs'], { cwd: ROOT, stdio: 'pipe' });
}

async function selftest() {
  const upstream = { id: 1, path: '.github/workflows/obsidian-autopilot.yml',
    repository: { full_name: REPO }, head_repository: { full_name: REPO }, head_branch: 'main',
    event: 'schedule', run_attempt: 1, status: 'completed' };
  const current = { ...upstream, id: 2, path: '.github/workflows/autopilot-act.yml', event: 'repository_dispatch',
    actor: { login: BOT }, triggering_actor: { login: BOT }, created_at: '2026-09-05T00:00:10Z' };
  const jobs = [{ name: NOTIFY_JOB, conclusion: 'success', started_at: '2026-09-05T00:00:00Z', completed_at: '2026-09-05T00:00:15Z' }];
  const env = { GITHUB_REPOSITORY: REPO, GITHUB_EVENT_NAME: 'repository_dispatch', GITHUB_RUN_ID: '2', GITHUB_RUN_ATTEMPT: '1' };
  const event = { action: 'autopilot-completed', client_payload: { upstream_run_id: '1' } };
  const mock = (c = current, u = upstream, j = jobs) => async endpoint => endpoint.endsWith('/2') ? c
    : endpoint.includes('/jobs?') ? { jobs: j } : u;
  const run = (options = {}) => completionOrigin({ env, event, get: mock(), ...options });
  assert.deepEqual(await run(), { upstream_run_id: '1', automatic: true });
  for (const changed of [{ actor: { login: 'owner' } }, { triggering_actor: { login: 'owner' } },
    { run_attempt: 2 }, { created_at: '2026-09-05T00:05:00Z' }, { created_at: 'invalid' },
    { created_at: '2026-09-04T23:59:59Z' }, { created_at: '2026-09-05T00:01:16Z' }]) {
    assert.equal((await run({ get: mock({ ...current, ...changed }) })).automatic, false);
  }
  // 2026-10-06: Notify ended 02:45:50Z, GitHub created the recipient 02:45:52Z.
  for (const created_at of ['2026-09-05T00:00:17Z', '2026-09-05T00:01:15Z']) {
    assert.equal((await run({ get: mock({ ...current, created_at }) })).automatic, true, `creation lag ${created_at}`);
  }
  for (const changed of [{ event: 'workflow_dispatch' }, { run_attempt: 2 }]) {
    assert.equal((await run({ get: mock(current, { ...upstream, ...changed }) })).automatic, false);
  }
  assert.equal((await run({ env: { ...env, GITHUB_RUN_ATTEMPT: '2' } })).automatic, false);
  for (const altered of [[], [{ ...jobs[0], conclusion: 'failure' }], [{ ...jobs[0], completed_at: null }]]) {
    assert.equal((await run({ get: mock(current, upstream, altered) })).automatic, false);
  }
  for (const changed of [{ head_branch: 'feature' }, { path: '.github/workflows/unrelated.yml' },
    { id: 3 }, { head_repository: { full_name: 'someone/fork' } }]) {
    await assert.rejects(run({ get: mock(current, { ...upstream, ...changed }) }), /Wrong upstream/);
  }
  await assert.rejects(run({ get: mock({ ...current, head_branch: 'feature' }) }), /Wrong recipient/);
  await assert.rejects(run({ event: { ...event, client_payload: { upstream_run_id: '../secret' } } }), /Invalid upstream/);
  await assert.rejects(run({ get: async () => { throw Error('HTTP 403'); } }), /HTTP 403/);
  await assert.rejects(run({ event: { ...event, client_payload: {} } }), /Invalid upstream/);
  await assert.rejects(run({ event: { ...event, action: 'unknown' } }), /Wrong completion event/);
  assert.equal(await run({ env: { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }, get: () => { throw Error('No API expected'); } }), null);
  for (const monitorEvent of ['schedule', 'workflow_run']) {
    const triggered = { ...current, event: monitorEvent };
    const options = { env: { ...env, GITHUB_EVENT_NAME: monitorEvent },
      event: { workflow_run: { id: 1 } }, get: mock(triggered) };
    assert.equal((await run(options)).automatic, true);
    assert.equal((await run({ ...options, get: mock({ ...triggered, run_attempt: 2 }) })).automatic, false);
    assert.equal((await run({ ...options, env: { ...options.env, GITHUB_RUN_ATTEMPT: '2' } })).automatic, false);
    if (monitorEvent === 'workflow_run') {
      for (const changed of [{ event: 'workflow_dispatch' }, { run_attempt: 2 }]) {
        assert.equal((await run({ ...options, get: mock(triggered, { ...upstream, ...changed }) })).automatic, false);
      }
      await assert.rejects(run({ ...options, get: mock(triggered, { ...upstream, path: '.github/workflows/other.yml' }) }), /Wrong workflow_run parent/);
      const publication = { ...upstream, path: '.github/workflows/auto-merge.yml', event: 'workflow_run', conclusion: 'success' };
      assert.equal((await run({ ...options, get: mock(triggered, publication) })).automatic, false);
      for (const changed of [{ conclusion: 'failure' }, { status: 'in_progress' },
        { event: 'workflow_dispatch' }, { head_repository: { full_name: 'someone/fork' } }, { head_branch: 'feature' }])
        await assert.rejects(run({ ...options, get: mock(triggered, { ...publication, ...changed }) }));
    }
  }
  let waits = 0, reads = 0;
  const poll = async endpoint => endpoint.endsWith('/1') && ++reads < 3
    ? { ...upstream, status: 'in_progress' } : mock()(endpoint);
  assert.equal((await run({ get: poll, sleep: async () => { waits++; } })).automatic, true);
  assert.equal(waits, 2);
  waits = 0;
  await assert.rejects(run({ get: mock(current, { ...upstream, status: 'in_progress' }),
    sleep: async () => { waits++; } }), /bounded completion wait/);
  assert.equal(waits, 12);
  const modelSteps = [{ name: 'Claude Code', conclusion: 'failure' }];
  assert.deepEqual(primarySteps([...jobs, { name: 'autopilot', steps: modelSteps }]), modelSteps);
  const publishSteps = [{ name: '成果物判定: verified', conclusion: 'success' }];
  assert.deepEqual(primarySteps([...jobs, { name: 'publish', steps: publishSteps }, { name: 'autopilot', steps: modelSteps }]),
    [...modelSteps, ...publishSteps]);
  assert.equal(primarySteps([...jobs, { name: 'publish', steps: publishSteps }]), null);
  assert.equal(primarySteps(jobs), null);
  const primary = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  const act = fs.readFileSync(path.join(ROOT, '.github/workflows/autopilot-act.yml'), 'utf8');
  const source = fs.readFileSync(path.join(ROOT, 'scripts/autopilot-act.mjs'), 'utf8');
  checkWiring(primary, act, source);
  testPendingBranch(act);
  for (const mutated of [primary.replace('needs: [autopilot, publish]', 'needs: autopilot'),
    primary.replace('createDispatchEvent', 'getWorkflow'),
    primary.replace('github-token: ${{ github.token }}', 'github-token: ${{ secrets.GH_PAT }}'),
    primary.replace('actions: read', 'actions: write')]) {
    assert.throws(() => checkWiring(mutated, act, source));
  }
  for (const altered of [act.replace('node scripts/autopilot-act-prepare.mjs', 'node scripts/missing.mjs'),
    act.replace('--force-with-lease=refs/heads/$DAY:$PREPARED_PENDING_SHA', '--force'),
    act.replace('autopilot-act-prepare.mjs --verify-history', 'missing-history-check')]) {
    assert.throws(() => checkWiring(primary, altered, source));
  }
  console.log('autopilot-completion: provenance, bounded wait, primary job selection and disconnected wiring rejected');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--selftest')) await selftest();
    else if (process.argv.includes('--check')) {
      checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'),
        fs.readFileSync(path.join(ROOT, '.github/workflows/autopilot-act.yml'), 'utf8'),
        fs.readFileSync(path.join(ROOT, 'scripts/autopilot-act.mjs'), 'utf8'));
      console.log('autopilot-completion: workflow wiring checked');
    } else throw Error('Use --selftest or --check');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

