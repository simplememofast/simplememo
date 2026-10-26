'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { inspect } = require('node:util');
const { verifyCacheProof } = require('./cache_access_proof.cjs');

const REPO = 'simplememofast/simplememo', OWNER = 'simplememofast';
const HEAD = 'a'.repeat(40), MAIN = 'b'.repeat(40), MANIFEST = 'c'.repeat(64);
const DEPLOYMENT = '1234abcd-0000-4000-8000-000000000000';
const SECRET = 'SYNTHETIC-PRIVATE-API-CONTENT-NOT-FOR-RECEIPTS';
const at = second => `2026-10-22T12:00:${String(second).padStart(2, '0')}Z`;

function step(number, name, start, end) {
  return { number, name, status: 'completed', conclusion: 'success', started_at: at(start), completed_at: at(end) };
}

function fixture() {
  const run = {
    id: 1234567, workflow_id: 98765, path: '.github/workflows/home-perf-cache-approved.yml',
    event: 'workflow_dispatch', head_branch: 'main', head_sha: MAIN, run_attempt: 1,
    status: 'completed', conclusion: 'success', actor: { login: OWNER }, triggering_actor: { login: OWNER },
    repository: { full_name: REPO, fork: false }, head_repository: { full_name: REPO, fork: false },
    display_title: 'Homepage cache PR 2175 @ ' + HEAD,
    created_at: at(0), run_started_at: at(1), updated_at: at(55),
  };
  const jobs = [
    { id: 101, name: 'Resolve cache PR 2175 @ ' + HEAD, started_at: at(2), completed_at: at(10),
      steps: [step(1, 'Set up job', 2, 3), step(2, 'Resolve reviewed candidate', 3, 9), step(3, 'Complete job', 9, 10)] },
    { id: 102, name: 'Verify reviewed cache PR 2175 @ ' + HEAD, started_at: at(15), completed_at: at(40),
      steps: [step(1, 'Set up job', 15, 16), step(2, 'Authorize reviewed preview', 16, 20),
        step(3, 'Verify response contract', 20, 39), step(4, 'Complete job', 39, 40)] },
    { id: 103, name: 'Cache proof ' + HEAD + ' ' + MANIFEST + ' ' + DEPLOYMENT, started_at: at(45), completed_at: at(50),
      steps: [step(1, 'Set up job', 45, 46), step(2, 'Seal successful proof', 46, 49), step(3, 'Complete job', 49, 50)] },
  ].map(job => ({ ...job, run_id: run.id, run_attempt: 1, head_sha: MAIN, status: 'completed', conclusion: 'success' }));
  return {
    run, jobs: { repository: REPO, runId: run.id, runAttempt: 1, data: { total_count: jobs.length, jobs } },
    reviews: { repository: REPO, runId: run.id, data: [
      { state: 'approved', user: { login: OWNER }, environments: [{ id: 456, name: 'preview-cache-ci' }], comment: 'Owner reviewed the exact candidate.' },
    ] },
    expected: { candidateHeadSha: HEAD, manifestSha256: MANIFEST, deploymentId: DEPLOYMENT,
      workflowId: run.workflow_id, trustedMainSha: MAIN, environmentId: 456, validUntil: '2026-10-22T13:00:00Z' },
    now: Date.parse(at(59)),
  };
}

function receiptSafe(result) {
  assert.deepEqual(Object.keys(result), ['version', 'verified', 'checks', 'bound']);
  assert.equal(result.version, 1);
  assert.equal(typeof result.verified, 'boolean');
  assert.deepEqual(Object.keys(result.checks), ['input', 'run', 'jobs', 'review', 'time']);
  assert.ok(Object.values(result.checks).every(value => typeof value === 'boolean'));
  if (!result.verified) assert.equal(result.bound, null);
  for (const text of [JSON.stringify(result), inspect(result, { depth: null })]) {
    assert.ok(!text.includes(SECRET));
    assert.ok(!text.includes('https://'));
    assert.ok(!text.includes('Owner reviewed'));
    assert.ok(!text.includes('rawError'));
  }
}

function reject(change, phase) {
  const f = fixture();
  change(f);
  const result = verifyCacheProof(f);
  assert.equal(result.verified, false);
  if (phase) assert.equal(result.checks[phase], false);
  receiptSafe(result);
}

test('only the exact complete main workflow, candidate, deployment and approval produce bound proof', () => {
  const f = fixture(), before = structuredClone(f), result = verifyCacheProof(f);
  assert.equal(result.verified, true);
  assert.ok(Object.values(result.checks).every(Boolean));
  assert.deepEqual(result.bound, {
    run_id: 1234567, run_attempt: 1, workflow_id: 98765, environment_id: 456,
    candidate_head_sha: HEAD, manifest_sha256: MANIFEST, deployment_id: DEPLOYMENT, trusted_main_sha: MAIN,
    completed_at: '2026-10-22T12:00:50.000Z', valid_until: '2026-10-22T13:00:00.000Z',
  });
  assert.deepEqual(f, before);
  receiptSafe(result);
});

test('documented @main path and absent optional job.run_attempt are bound by the exact-attempt envelope', () => {
  const f = fixture();
  f.run.path += '@main';
  for (const job of f.jobs.data.jobs) delete job.run_attempt;
  assert.equal(verifyCacheProof(f).verified, true);
  f.jobs.runAttempt = 2;
  assert.equal(verifyCacheProof(f).verified, false);
});

test('job API array ordering is irrelevant; dependency time ordering and step numbers remain mandatory', () => {
  const f = fixture();
  f.jobs.data.jobs.reverse();
  for (const job of f.jobs.data.jobs) job.steps.reverse();
  assert.equal(verifyCacheProof(f).verified, true);
});

for (const [key, values] of Object.entries({
  candidateHeadSha: [undefined, '', HEAD + '\n', 'x'.repeat(40)],
  trustedMainSha: [undefined, 'B'.repeat(40), 'b'.repeat(39)],
  manifestSha256: [undefined, 'c'.repeat(63), MANIFEST + '\n'],
  deploymentId: [undefined, '1234abcd', DEPLOYMENT + '/'],
  workflowId: [undefined, 0, -1, 1.5, '98765', Number.MAX_SAFE_INTEGER + 1],
  environmentId: [undefined, 0, -1, 1.5, '456'],
})) {
  test(`trusted expected ${key} has no guessed defaults or permissive coercion`, () => {
    for (const value of values) reject(f => { f.expected[key] = value; }, 'input');
  });
}

test('expected is an exact policy schema, not arbitrary caller metadata', () => {
  reject(f => { f.expected.providerAppId = 85455; }, 'input');
  reject(f => { f.expected.pullRequestNumber = 2136; }, 'input');
  reject(f => { delete f.expected.validUntil; }, 'input');
  reject(f => { f.expected = null; }, 'input');
});

for (const [key, values] of Object.entries({
  id: [undefined, 0, '1234567'], workflow_id: [undefined, 98766, '98765'],
  path: ['.github/workflows/home-perf-cache.yml', '.github/workflows/home-perf-cache-approved.yml@candidate',
    '.github/workflows/home-perf-cache-approved.yml@refs/tags/main', 'https://example.invalid/' + SECRET],
  event: ['pull_request', 'pull_request_target', 'workflow_run', 'push'],
  head_branch: ['candidate', 'refs/heads/main', undefined], head_sha: [HEAD, undefined],
  run_attempt: [0, 2, '1', undefined], status: ['queued', 'in_progress', undefined],
  conclusion: ['failure', 'skipped', 'neutral', 'cancelled', null],
  display_title: ['Homepage cache PR 2136 @ ' + HEAD, 'Homepage cache PR 2139 @ ' + HEAD, 'Homepage cache PR 2164 @ ' + HEAD, 'Homepage cache PR 2175 @ ' + MAIN,
    'Homepage cache PR 2175 @ ' + HEAD + ' extra'],
})) {
  test(`run ${key} must match the trusted source and exact reviewed candidate`, () => {
    for (const value of values) reject(f => { f.run[key] = value; }, 'run');
  });
}

test('both owner principals and both nonfork repository identities are mandatory', () => {
  for (const principal of ['actor', 'triggering_actor']) {
    for (const login of ['third-party', 'github-actions[bot]', 'SimpleMemoFast', undefined]) {
      reject(f => { f.run[principal].login = login; }, 'run');
    }
  }
  for (const repository of ['repository', 'head_repository']) {
    reject(f => { f.run[repository].full_name = 'attacker/simplememo'; }, 'run');
    reject(f => { f.run[repository].fork = true; }, 'run');
    reject(f => { delete f.run[repository].fork; }, 'run');
    reject(f => { f.run[repository] = null; }, 'run');
  }
});

test('a matching run-name alone, another green workflow or a provider App lookalike is never proof', () => {
  reject(f => { f.jobs.data = { total_count: 0, jobs: [] }; }, 'jobs');
  reject(f => { f.run.workflow_id++; f.run.app = { id: 85455, slug: 'cloudflare-workers-and-pages' }; }, 'run');
  reject(f => { f.run = { name: 'Cloudflare Pages', head_sha: HEAD, status: 'completed', conclusion: 'success',
    app: { id: 85455, slug: 'cloudflare-workers-and-pages' }, display_title: f.run.display_title }; }, 'run');
  reject(f => { f.checkRun = { app: { id: 9999, slug: 'spoofed-provider' } }; }, 'input');
});

test('previous PR 2164 jobs cannot seal a proof relabeled as the newly approved PR', () => {
  for (const i of [0, 1]) {
    reject(f => { f.jobs.data.jobs[i].name = f.jobs.data.jobs[i].name.replace('PR 2175', 'PR 2164'); }, 'jobs');
  }
  reject(f => {
    for (const job of f.jobs.data.jobs) job.name = job.name.replace('PR 2175', 'PR 2164');
  }, 'jobs');
});

test('every adapter envelope must identify this repository, exact run and first attempt', () => {
  for (const envelope of ['jobs', 'reviews']) {
    reject(f => { f[envelope].repository = 'other/simplememo'; }, envelope === 'jobs' ? 'jobs' : 'review');
    reject(f => { f[envelope].runId++; }, envelope === 'jobs' ? 'jobs' : 'review');
    reject(f => { delete f[envelope].runId; }, envelope === 'jobs' ? 'jobs' : 'review');
    reject(f => { f[envelope] = f[envelope].data; }, envelope === 'jobs' ? 'jobs' : 'review');
  }
  for (const attempt of [undefined, 0, 2, '1']) reject(f => { f.jobs.runAttempt = attempt; }, 'jobs');
});

test('truncated, extra or duplicate job lists fail instead of selecting one green subset', () => {
  reject(f => { f.jobs.data.total_count = 4; }, 'jobs');
  reject(f => { f.jobs.data.total_count = '3'; }, 'jobs');
  reject(f => { f.jobs.data.jobs.pop(); }, 'jobs');
  reject(f => { f.jobs.data.jobs.pop(); f.jobs.data.total_count = 2; }, 'jobs');
  reject(f => { f.jobs.data.jobs.push(structuredClone(f.jobs.data.jobs[0])); f.jobs.data.total_count++; }, 'jobs');
  reject(f => { f.jobs.data.jobs[1].id = f.jobs.data.jobs[0].id; }, 'jobs');
  reject(f => { f.jobs.data.jobs[1].name = f.jobs.data.jobs[0].name; }, 'jobs');
  reject(f => { delete f.jobs.data.jobs[1]; }, 'jobs');
});

for (let i = 0; i < 3; i++) {
  test(`job ${i} binds exact run, source SHA, attempt, name and successful state`, () => {
    for (const [key, values] of Object.entries({ id: [0, '101'], run_id: [undefined, 7654321],
      run_attempt: [0, 2, '1'], head_sha: [HEAD, undefined], name: [SECRET, undefined],
      status: ['queued', 'in_progress'], conclusion: ['failure', 'skipped', 'cancelled', 'neutral', null] })) {
      for (const value of values) reject(f => { f.jobs.data.jobs[i][key] = value; }, 'jobs');
    }
  });
  test(`job ${i} cannot omit mandatory steps or hide failure behind overall success`, () => {
    reject(f => { f.jobs.data.jobs[i].steps = []; }, 'jobs');
    reject(f => { f.jobs.data.jobs[i].steps.splice(1, 1); }, 'jobs');
    for (const conclusion of ['failure', 'skipped', 'cancelled', 'neutral', null]) {
      reject(f => { f.jobs.data.jobs[i].steps[0].conclusion = conclusion; }, 'jobs');
      reject(f => { f.jobs.data.jobs[i].steps[1].conclusion = conclusion; }, 'jobs');
    }
    reject(f => { f.jobs.data.jobs[i].steps[0].status = 'in_progress'; }, 'jobs');
    reject(f => { f.jobs.data.jobs[i].steps.push(structuredClone(f.jobs.data.jobs[i].steps[0])); }, 'jobs');
    reject(f => { f.jobs.data.jobs[i].steps[0].number = f.jobs.data.jobs[i].steps[1].number; }, 'jobs');
    reject(f => { f.jobs.data.jobs[i].steps[0].name = f.jobs.data.jobs[i].steps[1].name; }, 'jobs');
    reject(f => { f.jobs.data.jobs[i].steps[0].number = 0; }, 'jobs');
  });
}

test('sealing must bind manifest and deployment as well as candidate SHA', () => {
  reject(f => { f.jobs.data.jobs[2].name = 'Cache proof ' + HEAD; }, 'jobs');
  reject(f => { f.jobs.data.jobs[2].name = f.jobs.data.jobs[2].name.replace(MANIFEST, 'd'.repeat(64)); }, 'jobs');
  reject(f => { f.jobs.data.jobs[2].name = f.jobs.data.jobs[2].name.replace(DEPLOYMENT, '8765abcd-0000-4000-8000-000000000000'); }, 'jobs');
  reject(f => { f.jobs.data.jobs[2].name += ' '; }, 'jobs');
  reject(f => { f.jobs.data.jobs[1].steps[2].number = 1; f.jobs.data.jobs[1].steps[0].number = 3; }, 'jobs');
});

test('an exact single owner approval for the read-back Environment is required', () => {
  for (const state of ['rejected', 'pending', 'dismissed', undefined]) reject(f => { f.reviews.data[0].state = state; }, 'review');
  for (const login of ['attacker', 'github-actions[bot]', undefined]) reject(f => { f.reviews.data[0].user.login = login; }, 'review');
  reject(f => { f.reviews.data = []; }, 'review');
  reject(f => { f.reviews.data.push(structuredClone(f.reviews.data[0])); }, 'review');
  reject(f => { f.reviews.data.unshift({ state: 'rejected', user: { login: OWNER }, environments: [{ id: 456, name: 'preview-cache-ci' }] }); }, 'review');
  reject(f => { f.reviews.data[0].environments = []; }, 'review');
  reject(f => { f.reviews.data[0].environments[0].id++; }, 'review');
  reject(f => { f.reviews.data[0].environments[0].name = 'production'; }, 'review');
  reject(f => { f.reviews.data[0].environments.push({ id: 789, name: 'another' }); }, 'review');
});

test('review bodies need no invented run_id, attempt or timestamp fields', () => {
  const f = fixture();
  assert.equal('run_id' in f.reviews.data[0], false);
  assert.equal('submitted_at' in f.reviews.data[0], false);
  assert.equal(verifyCacheProof(f).verified, true);
});

test('expiry is checked at exact deadline with an explicit valid clock', () => {
  for (const now of [undefined, -1, NaN, Infinity, '2026-10-22T12:00:59Z', Date.parse('2026-10-22T13:00:00Z')]) {
    reject(f => { f.now = now; }, 'input');
  }
  for (const validUntil of [undefined, '', '2026-02-30T13:00:00Z', '2026-10-22',
    '2026-10-22T13:00:00+00:00', '2026-10-22T13:00:00Z\n']) {
    reject(f => { f.expected.validUntil = validUntil; }, 'input');
  }
  const f = fixture(); f.now = Date.parse(f.expected.validUntil) - 1;
  assert.equal(verifyCacheProof(f).verified, true);
});

for (const field of ['created_at', 'run_started_at', 'updated_at']) {
  test(`run ${field} must be a real nonfuture ordered timestamp`, () => {
    for (const value of [undefined, null, SECRET, '2026-02-30T12:00:00Z', '2026-10-22T12:01:00Z', at(0) + '\n']) {
      reject(f => { f.run[field] = value; }, 'time');
    }
  });
}

test('run and dependent job chronology cannot be inverted or fabricated', () => {
  reject(f => { f.run.created_at = at(2); }, 'time');
  reject(f => { f.run.run_started_at = at(3); }, 'time');
  reject(f => { f.run.updated_at = at(49); }, 'time');
  reject(f => { f.jobs.data.jobs[1].started_at = at(9); }, 'time');
  reject(f => { f.jobs.data.jobs[2].started_at = at(39); }, 'time');
  for (let i = 0; i < 3; i++) {
    reject(f => { f.jobs.data.jobs[i].started_at = null; }, 'time');
    reject(f => { f.jobs.data.jobs[i].completed_at = null; }, 'time');
    reject(f => { f.jobs.data.jobs[i].completed_at = '2026-10-22T12:01:00Z'; }, 'time');
    reject(f => { f.jobs.data.jobs[i].completed_at = at(1); }, 'time');
  }
});

test('all step times must be present, ordered and inside their job', () => {
  for (let i = 0; i < 3; i++) {
    reject(f => { f.jobs.data.jobs[i].steps[0].started_at = undefined; }, 'time');
    reject(f => { f.jobs.data.jobs[i].steps[1].completed_at = undefined; }, 'time');
    reject(f => { f.jobs.data.jobs[i].steps[0].started_at = at(0); }, 'time');
    reject(f => { f.jobs.data.jobs[i].steps[1].started_at = at(0); }, 'time');
    reject(f => { f.jobs.data.jobs[i].steps[1].completed_at = at(58); }, 'time');
  }
});

test('RFC3339 step offsets from official examples are accepted without date rollover', () => {
  const f = fixture();
  f.jobs.data.jobs[0].steps[0].started_at = '2026-10-22T04:00:02.000-08:00';
  f.jobs.data.jobs[0].steps[0].completed_at = '2026-10-22T14:00:03+02:00';
  assert.equal(verifyCacheProof(f).verified, true);
  f.jobs.data.jobs[0].steps[0].started_at = '2026-10-22T04:00:02.000-24:00';
  assert.equal(verifyCacheProof(f).verified, false);
});

test('unrelated raw metadata and comments never enter a successful receipt', () => {
  const f = fixture();
  f.run.url = 'https://example.invalid/' + SECRET;
  f.run.rawError = SECRET;
  f.reviews.data[0].comment = SECRET;
  f.run.head_commit = { message: SECRET };
  for (const job of f.jobs.data.jobs) job.html_url = 'https://example.invalid/' + SECRET;
  const result = verifyCacheProof(f);
  assert.equal(result.verified, true);
  receiptSafe(result);
});

test('malformed objects, getters, proxies and sparse arrays fail without invoking formatters or logging', t => {
  const logs = ['log', 'warn', 'error'].map(name => t.mock.method(console, name, () => {}));
  for (const input of [undefined, null, [], SECRET, new Proxy({}, { ownKeys() { throw Error(SECRET); } })]) {
    const result = verifyCacheProof(input);
    assert.equal(result.verified, false);
    receiptSafe(result);
  }
  for (const change of [
    f => { Object.defineProperty(f, 'run', { get() { throw Error(SECRET); } }); },
    f => { Object.defineProperty(f.run, 'id', { get() { throw Error(SECRET); } }); },
    f => { Object.defineProperty(f.reviews.data, '0', { get() { throw Error(SECRET); } }); },
    f => { delete f.reviews.data[0]; },
    f => { f.run[Symbol('secret')] = SECRET; },
    f => { Object.setPrototypeOf(f.expected, { inherited: SECRET }); },
  ]) reject(change);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test('output contains copied bounded primitives and no mutable source objects', () => {
  const f = fixture(), result = verifyCacheProof(f), before = structuredClone(result);
  f.run.id = 999;
  f.expected.candidateHeadSha = MAIN;
  f.expected.environmentId = 789;
  f.jobs.data.jobs[2].completed_at = at(58);
  assert.deepEqual(result, before);
});
