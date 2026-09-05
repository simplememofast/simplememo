#!/usr/bin/env node
/** Completion dispatch is a second wakeup path, not a second model invocation.
 * GitHub API evidence, rather than a supplied boolean, determines unattended origin.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'simplememofast/simplememo';
export const NOTIFY_JOB = 'Notify Autopilot Act';
const BOT = 'github-actions[bot]';

export function primaryJob(jobs) {
  // Adding a post-job must not make its successful dispatch look like a successful model run.
  return jobs.find(job => job.name === 'autopilot') ?? null;
}

export function primarySteps(jobs) {
  return primaryJob(jobs)?.steps ?? null;
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
  // The recipient must have been created during this parent's successful dispatch job.
  const start = Date.parse(notification?.started_at), end = Date.parse(notification?.completed_at);
  return Number.isFinite(sentAt) && Number.isFinite(start) && Number.isFinite(end)
    && start <= sentAt && sentAt <= end && end - start <= 180_000;
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
  assert.match(job, /needs: autopilot/);
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
  assert.match(act, /git merge --no-edit origin\/main/);
  assert.doesNotMatch(act, /git stash/);
  assert.match(source, /await completionOrigin\(\)/);
  assert.match(source, /primarySteps\(\(await jr\.json\(\)\)\.jobs \?\? \[\]\)/);
  assert.match(source, /jobId = primaryJob\(\(await jr\.json\(\)\)\.jobs \?\? \[\]\)\?\.id/);
  return true;
}

function testPendingBranch(act) {
  const block = act.split('      - name: Prepare ledger branch before observation\n')[1]?.split('\n      #')[0];
  assert.ok(block, 'Pending branch preparation is missing');
  const shell = block.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'act-branch-'));
  const cwd = path.join(root, 'work');
  const env = { ...process.env, RUNNER_TEMP: root, PATH: `${root}:${process.env.PATH}`,
    GIT_AUTHOR_NAME: 'test', GIT_COMMITTER_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.test', GIT_COMMITTER_EMAIL: 'test@example.test' };
  const git = (...args) => execFileSync('git', args, { cwd, env, stdio: 'pipe' });
  try {
    fs.mkdirSync(cwd);
    execFileSync('git', ['init', '--bare', path.join(root, 'origin')], { stdio: 'pipe' });
    git('init', '-b', 'main'); git('remote', 'add', 'origin', path.join(root, 'origin'));
    fs.mkdirSync(path.join(cwd, 'data')); fs.mkdirSync(path.join(cwd, 'scripts'));
    fs.writeFileSync(path.join(cwd, 'data/autopilot-runs.json'), '[]\n');
    fs.writeFileSync(path.join(cwd, 'scripts/trusted'), 'v1\n');
    git('add', '.'); git('commit', '-m', 'base'); git('push', '-u', 'origin', 'main');
    const day = execFileSync('date', ['+%Y%m%d'], { env: { ...env, TZ: 'Asia/Tokyo' }, encoding: 'utf8' }).trim();
    const branch = `claude/autopilot-act-${day}`;
    git('checkout', '-b', branch);
    fs.writeFileSync(path.join(cwd, 'data/autopilot-runs.json'), '[1]\n');
    git('commit', '-am', 'first observation'); git('push', '-u', 'origin', branch);
    git('checkout', 'main');
    fs.writeFileSync(path.join(cwd, 'scripts/trusted'), 'v2\n');
    git('commit', '-am', 'new trusted code'); git('push', 'origin', 'main');
    fs.writeFileSync(path.join(root, 'gh'), '#!/bin/sh\nprintf "123\\n"\n', { mode: 0o700 });
    execFileSync('bash', ['-e', '-c', shell], { cwd, env, stdio: 'pipe' });
    assert.equal(fs.readFileSync(path.join(cwd, 'data/autopilot-runs.json'), 'utf8'), '[1]\n');
    assert.equal(fs.readFileSync(path.join(cwd, 'scripts/trusted'), 'utf8'), 'v2\n');
    fs.writeFileSync(path.join(cwd, 'data/autopilot-runs.json'), '[1,2]\n');
    git('commit', '-am', 'second observation'); git('push', 'origin', branch);
    git('checkout', 'main');
    execFileSync('bash', ['-e', '-c', shell], { cwd, env, stdio: 'pipe' });
    assert.equal(fs.readFileSync(path.join(cwd, 'data/autopilot-runs.json'), 'utf8'), '[1,2]\n');
    fs.writeFileSync(path.join(cwd, 'scripts/untrusted'), 'must not execute\n');
    git('add', '.'); git('commit', '-m', 'unexpected code'); git('push', 'origin', branch);
    git('checkout', 'main');
    let rejected;
    try { execFileSync('bash', ['-e', '-c', shell], { cwd, env, stdio: 'pipe' }); } catch (error) { rejected = error; }
    assert.equal(rejected?.status, 1);
    assert.match(rejected.stdout.toString(), /Unexpected pending PR path: scripts\/untrusted/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
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
    { run_attempt: 2 }, { created_at: '2026-09-05T00:05:00Z' }, { created_at: 'invalid' }]) {
    assert.equal((await run({ get: mock({ ...current, ...changed }) })).automatic, false);
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
  assert.equal(primarySteps([...jobs, { name: 'autopilot', steps: modelSteps }]), modelSteps);
  assert.equal(primarySteps(jobs), null);
  const primary = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  const act = fs.readFileSync(path.join(ROOT, '.github/workflows/autopilot-act.yml'), 'utf8');
  const source = fs.readFileSync(path.join(ROOT, 'scripts/autopilot-act.mjs'), 'utf8');
  checkWiring(primary, act, source);
  testPendingBranch(act);
  for (const mutated of [primary.replace('needs: autopilot', 'needs: absent'),
    primary.replace('createDispatchEvent', 'getWorkflow'),
    primary.replace('github-token: ${{ github.token }}', 'github-token: ${{ secrets.GH_PAT }}'),
    primary.replace('actions: read', 'actions: write')]) {
    assert.throws(() => checkWiring(mutated, act, source));
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
