'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { inspect } = require('node:util');
const { verifyPublishedProof } = require('./cache_access_consumer.cjs');

const OWNER = 'simplememofast', REPOSITORY = OWNER + '/simplememo';
const HEAD = 'a'.repeat(40), MAIN = 'b'.repeat(40), OTHER = 'c'.repeat(40);
const WORKFLOW = '.github/workflows/home-perf-cache-approved.yml';
const CONFIGURATION = 'scripts/perf/cache_access_configuration.json';
const DEPLOYMENT = '1234abcd-0000-4000-8000-000000000000';
const PRIVATE = 'SYNTHETIC_PRIVATE_API_CONTENT';
const T0 = Date.parse('2026-10-22T12:00:00Z');
const at = seconds => new Date(T0 + seconds * 1000).toISOString();
const digest = value => createHash('sha256').update(value).digest('hex');
function content(path, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  return { type: 'file', path, encoding: 'base64', size: bytes.length,
    sha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'), content: bytes.toString('base64') };
}
const step = (number, name, start, end) => ({ number, name, status: 'completed', conclusion: 'success', started_at: at(start), completed_at: at(end) });

function fixture() {
  const assets = {};
  for (const [extension, body] of [['avif', 'image bytes'], ['woff2', 'font bytes']]) {
    const sha256 = digest(body);
    assets['assets/home-perf/example-' + sha256.slice(0, 12) + '.' + extension] = { bytes: Buffer.byteLength(body), sha256 };
  }
  const manifest = { version: 1, assets };
  const manifestSha256 = digest(JSON.stringify({ version: 1, headSha: HEAD, assets }));
  const run = {
    id: 1234567, run_number: 42, workflow_id: 98765, path: WORKFLOW,
    event: 'workflow_dispatch', head_branch: 'main', head_sha: MAIN, run_attempt: 1,
    status: 'completed', conclusion: 'success', actor: { login: OWNER }, triggering_actor: { login: OWNER },
    repository: { full_name: REPOSITORY, fork: false }, head_repository: { full_name: REPOSITORY, fork: false },
    display_title: 'Homepage cache PR 2175 @ ' + HEAD,
    created_at: at(0), run_started_at: at(1), updated_at: at(55),
  };
  const configurationReadback = { environmentName: 'preview-cache-ci', environmentId: 456, mainBranchOnly: true,
    requiredReviewer: OWNER, preventSelfReview: false, adminBypassDisabled: true,
    observedAt: at(-3600), authorizationNotAfter: at(86400) };
  const state = {
    branch: { name: 'main', commit: { sha: MAIN } },
    workflow: { id: 98765, path: WORKFLOW, state: 'active' },
    configuration: { configurationReadback }, configurationResponse: null,
    run, runs: [run], totalRuns: null, manifest,
    pr: { number: 2175, state: 'open', merged: false, user: { login: OWNER },
      base: { ref: 'main', repo: { full_name: REPOSITORY, fork: false } },
      head: { sha: HEAD, repo: { full_name: REPOSITORY, fork: false } } },
    checks: { total_count: 1, check_runs: [{ id: 7001, name: 'Cloudflare Pages', head_sha: HEAD,
      status: 'completed', conclusion: 'success', app: { id: 85455, slug: 'cloudflare-workers-and-pages' },
      details_url: 'https://dash.cloudflare.com/?to=/6f37d8ca103aa4af6a3722fc3c3e1ef6/pages/view/simplememo/' + DEPLOYMENT,
      output: { summary: '[Preview](https://1234abcd.simplememo-596.pages.dev)' } }] },
    environment: { id: 456, name: 'preview-cache-ci',
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [{ type: 'required_reviewers', prevent_self_review: false,
        reviewers: [{ type: 'User', reviewer: { login: OWNER } }] }] },
    branches: { total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] },
    reviews: [{ state: 'approved', user: { login: OWNER }, environments: [{ id: 456, name: 'preview-cache-ci' }], comment: PRIVATE }],
    jobs: { total_count: 3, jobs: [
      { id: 101, name: 'Resolve cache PR 2175 @ ' + HEAD, started_at: at(2), completed_at: at(10),
        steps: [step(1, 'Set up job', 2, 3), step(2, 'Resolve reviewed candidate', 3, 9), step(3, 'Complete job', 9, 10)] },
      { id: 102, name: 'Verify reviewed cache PR 2175 @ ' + HEAD, started_at: at(15), completed_at: at(40),
        steps: [step(1, 'Set up job', 15, 16), step(2, 'Authorize reviewed preview', 16, 20),
          step(3, 'Verify response contract', 20, 39), step(4, 'Complete job', 39, 40)] },
      { id: 103, name: 'Cache proof ' + HEAD + ' ' + manifestSha256 + ' ' + DEPLOYMENT, started_at: at(45), completed_at: at(50),
        steps: [step(1, 'Set up job', 45, 46), step(2, 'Seal successful proof', 46, 49), step(3, 'Complete job', 49, 50)] },
    ].map(job => ({ ...job, run_id: run.id, run_attempt: 1, head_sha: MAIN, status: 'completed', conclusion: 'success' })) },
    handlers: {}, calls: [], counts: {}, now: () => T0 + 59000,
  };
  const github = { rest: { repos: {}, actions: {}, pulls: {}, checks: {} } };
  const install = (group, method, handler) => {
    const key = group + '.' + method;
    github.rest[group][method] = async params => {
      assert.equal(params.owner, OWNER);
      assert.equal(params.repo, 'simplememo');
      assert.equal(params.request.timeout, 10000);
      state.calls.push({ key, params: structuredClone(params) });
      const count = state.counts[key] = (state.counts[key] || 0) + 1;
      const data = state.handlers[key] ? state.handlers[key](params, count) : handler(params);
      return { status: 200, data: structuredClone(data) };
    };
  };
  install('repos', 'getBranch', params => { assert.equal(params.branch, 'main'); return state.branch; });
  install('repos', 'getContent', params => {
    if (params.path === CONFIGURATION) {
      assert.equal(params.ref, MAIN, 'configuration must come from exact main, never the PR');
      return state.configurationResponse || content(CONFIGURATION, state.configuration);
    }
    assert.equal(params.path, 'assets/home-perf/manifest.json');
    assert.equal(params.ref, HEAD, 'only manifest data is read from the exact candidate');
    return content(params.path, state.manifest);
  });
  install('repos', 'getEnvironment', params => { assert.equal(params.environment_name, 'preview-cache-ci'); return state.environment; });
  install('repos', 'listDeploymentBranchPolicies', params => {
    assert.equal(params.environment_name, 'preview-cache-ci'); assert.equal(params.per_page, 100); assert.equal(params.page, 1);
    return state.branches;
  });
  install('actions', 'getWorkflow', params => { assert.equal(params.workflow_id, 'home-perf-cache-approved.yml'); return state.workflow; });
  install('actions', 'listWorkflowRuns', params => {
    assert.equal(params.workflow_id, 98765); assert.equal(params.branch, 'main'); assert.equal(params.event, 'workflow_dispatch');
    assert.equal(params.per_page, 100); assert.equal(params.page, 1);
    for (const forbidden of ['status', 'actor', 'head_sha']) assert.equal(Object.hasOwn(params, forbidden), false);
    return { total_count: state.totalRuns ?? state.runs.length, workflow_runs: state.runs };
  });
  install('actions', 'getWorkflowRun', params => { assert.equal(params.run_id, state.run.id); return state.run; });
  install('actions', 'listJobsForWorkflowRunAttempt', params => {
    assert.equal(params.run_id, state.run.id); assert.equal(params.attempt_number, 1);
    assert.equal(params.per_page, 100); assert.equal(params.page, 1); return state.jobs;
  });
  install('actions', 'getReviewsForRun', params => { assert.equal(params.run_id, state.run.id); return state.reviews; });
  install('pulls', 'get', params => { assert.equal(params.pull_number, 2175); return state.pr; });
  install('checks', 'listForRef', params => {
    assert.equal(params.ref, HEAD); assert.equal(params.filter, 'all'); assert.equal(params.per_page, 100); assert.equal(params.page, 1);
    return state.checks;
  });
  state.github = github;
  state.verify = () => verifyPublishedProof({ github, headSha: HEAD, checkoutSha: MAIN, now: state.now });
  return state;
}

function safe(result, expected = false) {
  assert.equal(result.verified, expected);
  assert.equal(result.version, 1);
  assert.ok(Object.isFrozen(result));
  if (!expected) { assert.equal(result.bound, null); assert.match(result.code, /^[A-Z_]+$/); }
  for (const text of [JSON.stringify(result), inspect(result, { depth: null })]) {
    assert.ok(!text.includes(PRIVATE)); assert.ok(!text.includes('https://')); assert.ok(!text.includes('comment'));
  }
}

test('current-main configuration, fresh candidate, exact producer and approved environment yield only safe proof', async () => {
  const f = fixture();
  const result = await f.verify();
  safe(result, true);
  assert.equal(result.bound.candidate_head_sha, HEAD);
  assert.equal(result.bound.trusted_main_sha, MAIN);
  assert.equal(result.bound.deployment_id, DEPLOYMENT);
  assert.equal(result.bound.environment_id, 456);
  assert.equal(result.bound.valid_until, at(3600));
  assert.equal(f.counts['repos.getBranch'], 2);
  assert.equal(f.counts['actions.listWorkflowRuns'], 2);
  assert.equal(f.counts['repos.getEnvironment'], 2);
  assert.equal(f.counts['pulls.get'], 4);
  assert.ok(f.calls.every(call => !/secret|artifact|download|create|update|dispatch|rerun/i.test(call.key)));
});

test('checked-in null readback remains inactive after only main/configuration reads', async () => {
  const f = fixture(); f.configuration.configurationReadback = null;
  const result = await f.verify(); safe(result);
  assert.equal(result.code, 'CONFIGURATION_UNVERIFIED');
  assert.deepEqual(f.calls.map(call => call.key), ['repos.getBranch', 'repos.getContent']);
});

test('caller configuration, malformed SHA and unsupported inputs cannot override main settings', async () => {
  const f = fixture();
  for (const input of [null, {}, { github: f.github, headSha: HEAD + '\n', checkoutSha: MAIN },
    { github: f.github, headSha: HEAD, checkoutSha: MAIN, configurationReadback: f.configuration.configurationReadback },
    { github: f.github, headSha: HEAD, checkoutSha: MAIN, now: T0 + 59000 },
    { github: f.github, headSha: HEAD, checkoutSha: MAIN, expected: {} }]) {
    const result = await verifyPublishedProof(input); safe(result); assert.equal(result.code, 'INPUT_INVALID');
  }
  assert.equal(f.calls.length, 0);
});

test('missing checkout SHA cannot infer an executing checkout from the main API', async () => {
  const f = fixture();
  const result = await verifyPublishedProof({ github: f.github, headSha: HEAD, now: f.now });
  safe(result); assert.equal(result.code, 'INPUT_INVALID');
  assert.equal(f.calls.length, 0);
});

test('malformed checkout SHA is rejected before any API read', async () => {
  for (const checkoutSha of [undefined, null, 1, '', MAIN.slice(1), MAIN + 'b', MAIN.toUpperCase(), MAIN + '\n', PRIVATE]) {
    const f = fixture();
    const result = await verifyPublishedProof({ github: f.github, headSha: HEAD, checkoutSha, now: f.now });
    safe(result); assert.equal(result.code, 'INPUT_INVALID');
    assert.equal(f.calls.length, 0);
  }
});

test('changed main or a candidate checkout rejects before configuration and proof API reads', async () => {
  for (const [checkoutSha, currentMainSha] of [[OTHER, MAIN], [HEAD, MAIN], [MAIN, OTHER]]) {
    const f = fixture(); f.branch.commit.sha = currentMainSha;
    const result = await verifyPublishedProof({ github: f.github, headSha: HEAD, checkoutSha, now: f.now });
    safe(result); assert.equal(result.code, 'CHECKOUT_MISMATCH');
    assert.deepEqual(f.calls.map(call => call.key), ['repos.getBranch']);
  }
});

test('configuration content must be bounded exact-path UTF8 JSON with a valid git blob hash', async () => {
  for (const mutate of [
    r => { r.path = 'candidate/config.json'; }, r => { r.type = 'symlink'; }, r => { r.encoding = 'none'; },
    r => { r.size = 4097; }, r => { r.size++; }, r => { r.sha = OTHER; }, r => { r.content += '!'; },
    r => Object.assign(r, content(CONFIGURATION, Buffer.from([255, 254]))),
    r => Object.assign(r, content(CONFIGURATION, '{invalid JSON')),
    r => Object.assign(r, content(CONFIGURATION, { configurationReadback: {}, extra: PRIVATE })),
  ]) {
    const f = fixture(); f.configurationResponse = content(CONFIGURATION, f.configuration); mutate(f.configurationResponse);
    const result = await f.verify(); safe(result); assert.equal(result.code, 'CONFIGURATION_INVALID');
    assert.equal(f.calls.length, 2);
  }
});

test('unregistered or disabled workflow is not replaced by a similarly named green run', async () => {
  for (const mutate of [f => { f.workflow.state = 'disabled_manually'; }, f => { f.workflow.path = '.github/workflows/other.yml'; },
    f => { f.workflow.id = '98765'; }]) {
    const f = fixture(); mutate(f); safe(await f.verify()); assert.equal(f.counts['actions.listWorkflowRuns'], undefined);
  }
});

test('no proof, wrong target, truncated list and malformed run list fail closed', async () => {
  for (const mutate of [f => { f.runs = []; }, f => { f.run.display_title = 'Homepage cache PR 2136 @ ' + HEAD; },
    f => { f.run.display_title = 'Homepage cache PR 2164 @ ' + HEAD; },
    f => { f.totalRuns = 2; }, f => { f.runs.push(structuredClone(f.run)); },
    f => { f.run.created_at = at(60); }, f => { f.run.event = 'pull_request'; }]) {
    const f = fixture(); mutate(f); safe(await f.verify());
  }
});

test('previous PR 2164 success is neither a selectable proof nor reusable job evidence', async () => {
  const previous = fixture();
  previous.run.display_title = 'Homepage cache PR 2164 @ ' + HEAD;
  for (const job of previous.jobs.jobs) job.name = job.name.replace('PR 2175', 'PR 2164');
  const absent = await previous.verify(); safe(absent);
  assert.equal(absent.code, 'PROOF_UNAVAILABLE');
  assert.equal(previous.counts['actions.getWorkflowRun'], undefined);

  for (const i of [0, 1]) {
    const relabeled = fixture();
    relabeled.jobs.jobs[i].name = relabeled.jobs.jobs[i].name.replace('PR 2175', 'PR 2164');
    const rejected = await relabeled.verify(); safe(rejected);
    assert.equal(rejected.code, 'PROOF_REJECTED');
  }
});

test('a newer failure or unfinished run prevents fallback to an older matching success', async () => {
  for (const status of ['queued', 'in_progress', 'completed']) {
    const f = fixture(), older = structuredClone(f.run);
    older.id--; older.run_number--; older.created_at = at(-60);
    f.run.status = status; f.run.conclusion = status === 'completed' ? 'failure' : null;
    f.runs = [older, f.run];
    const result = await f.verify(); safe(result); assert.equal(result.code, 'RUN_INVALID');
    assert.equal(f.counts['actions.listJobsForWorkflowRunAttempt'], undefined);
  }
});

test('a full first page still fails when more than 100 runs could hide a newer matching result', async () => {
  const f = fixture();
  f.runs = [f.run, ...Array.from({ length: 99 }, (_, i) => ({ ...structuredClone(f.run),
    id: 2000000 + i, run_number: 100 + i, created_at: at(-200 - i),
    display_title: 'Homepage cache PR 2175 @ ' + OTHER }))];
  f.totalRuns = 101;
  const result = await f.verify(); safe(result); assert.equal(result.code, 'RUN_LIST_INVALID');
  assert.equal(f.counts['actions.getWorkflowRun'], undefined);
});

test('same-second matching runs use run_number and never response order to choose an older green', async () => {
  const f = fixture(), older = structuredClone(f.run);
  older.id--; older.run_number--;
  f.run.conclusion = 'failure'; f.runs = [older, f.run];
  safe(await f.verify());
});

test('newer unrelated candidate does not impersonate this exact display title', async () => {
  const f = fixture(), other = structuredClone(f.run);
  other.id++; other.run_number++; other.created_at = at(1); other.display_title = 'Homepage cache PR 2175 @ ' + OTHER;
  other.status = 'in_progress'; other.conclusion = null; f.runs = [other, f.run];
  safe(await f.verify(), true);
});

test('producer source, first attempt, owner principals, repository and completion all remain mandatory', async () => {
  for (const mutate of [f => { f.run.head_sha = OTHER; }, f => { f.run.run_attempt = 2; },
    f => { f.run.display_title = 'Homepage cache PR 2139 @ ' + HEAD; },
    f => { f.run.actor.login = 'attacker'; }, f => { f.run.triggering_actor.login = 'attacker'; },
    f => { f.run.head_repository.fork = true; }, f => { f.run.repository.full_name = 'attacker/simplememo'; },
    f => { f.run.path += '@candidate'; }, f => { f.run.conclusion = 'skipped'; }]) {
    const f = fixture(); mutate(f); safe(await f.verify());
  }
});

test('list/get run disagreement is rejected without treating metadata as a success receipt', async () => {
  const f = fixture();
  f.handlers['actions.getWorkflowRun'] = () => ({ ...f.run, run_attempt: 2 });
  const result = await f.verify(); safe(result); assert.equal(result.code, 'RUN_CHANGED');
});

test('fresh PR and official provider binding reject moved heads, forks, closed PRs and fake deployments', async () => {
  for (const mutate of [f => { f.pr.number = 2139; }, f => { f.pr.number = 2164; }, f => { f.pr.head.sha = OTHER; }, f => { f.pr.state = 'closed'; },
    f => { f.pr.head.repo.fork = true; }, f => { f.pr.user.login = 'attacker'; },
    f => { f.checks.check_runs[0].app.id = 1; }, f => { f.checks.check_runs[0].details_url = 'https://evil.example/' + PRIVATE; },
    f => { f.checks.check_runs[0].head_sha = OTHER; }]) {
    const f = fixture(); mutate(f); const result = await f.verify(); safe(result); assert.equal(result.code, 'CONTEXT_REJECTED');
  }
});

test('live environment protections and its exact ID cannot be supplied by proof output', async () => {
  for (const mutate of [f => { f.environment.protection_rules = []; }, f => { f.branches.branch_policies[0].name = '*'; },
    f => { f.environment.protection_rules[0].reviewers[0].reviewer.login = 'attacker'; },
    f => { f.configuration.configurationReadback.adminBypassDisabled = false; }, f => { f.environment.id++; }]) {
    const f = fixture(); mutate(f); safe(await f.verify());
  }
});

test('failed/skipped verification steps, incomplete jobs and rejected or absent approval cannot seal proof', async () => {
  for (const mutate of [f => { f.jobs.jobs[1].steps[2].conclusion = 'failure'; },
    f => { f.jobs.jobs[1].steps[2].conclusion = 'skipped'; }, f => { f.jobs.jobs[2].name = 'spoofed proof'; },
    f => { f.jobs.total_count = 4; }, f => { f.reviews = []; },
    f => { f.reviews[0].state = 'rejected'; }, f => { f.reviews[0].user.login = 'attacker'; },
    f => { f.reviews[0].environments[0].id++; }]) {
    const f = fixture(); mutate(f); const result = await f.verify(); safe(result); assert.equal(result.code, 'PROOF_REJECTED');
  }
});

test('one-hour and configuration expiry bound proof validity without extending expired authorization', async () => {
  const shortened = fixture(); shortened.configuration.configurationReadback.authorizationNotAfter = at(90);
  const good = await shortened.verify(); safe(good, true); assert.equal(good.bound.valid_until, at(90));
  for (const mutate of [f => { f.now = () => T0 + 3600000; },
    f => { f.configuration.configurationReadback.authorizationNotAfter = at(59); }]) {
    const f = fixture(); mutate(f); const result = await f.verify(); safe(result); assert.equal(result.code, 'APPROVAL_EXPIRED');
  }
});

test('changed main, workflow registration, latest run and environment during reads invalidate proof', async () => {
  const mutations = [
    ['repos.getBranch', (f, count) => count === 1 ? f.branch : { name: 'main', commit: { sha: OTHER } }, 'MAIN_CHANGED'],
    ['actions.getWorkflow', (f, count) => count === 1 ? f.workflow : { ...f.workflow, id: 98766 }, 'WORKFLOW_CHANGED'],
    ['actions.listWorkflowRuns', (f, count) => ({ total_count: 1, workflow_runs: count === 1 ? f.runs
      : [{ ...f.run, id: f.run.id + 1, run_number: f.run.run_number + 1, status: 'in_progress', conclusion: null }] }), 'RUN_CHANGED'],
    // The context helper binds each live ID to the main-pinned configuration,
    // so a recreated environment is rejected before consumer ID comparison.
    ['repos.getEnvironment', (f, count) => count === 1 ? f.environment : { ...f.environment, id: 457 }, 'CONTEXT_REJECTED'],
  ];
  for (const [key, mutate, code] of mutations) {
    const f = fixture(); f.handlers[key] = (_params, count) => mutate(f, count);
    const result = await f.verify(); safe(result); assert.equal(result.code, code);
    if (key === 'repos.getEnvironment') {
      assert.equal(f.counts['repos.getEnvironment'], 2);
      assert.equal(f.counts['repos.listDeploymentBranchPolicies'], 1);
      assert.equal(f.counts['actions.getReviewsForRun'], 1);
      assert.equal(f.counts['repos.getBranch'], 1);
    }
  }
});

test('candidate moving after jobs/reviews were read still invalidates the result', async () => {
  const f = fixture();
  f.handlers['pulls.get'] = (_params, count) => count < 3 ? f.pr : { ...f.pr, head: { ...f.pr.head, sha: OTHER } };
  const result = await f.verify(); safe(result); assert.equal(result.code, 'CONTEXT_REJECTED');
});

test('public API failures and arbitrary error content are reduced to static safe codes', async () => {
  for (const key of ['repos.getBranch', 'repos.getContent', 'actions.getWorkflow', 'actions.listWorkflowRuns',
    'actions.getWorkflowRun', 'actions.listJobsForWorkflowRunAttempt', 'actions.getReviewsForRun',
    'pulls.get', 'checks.listForRef', 'repos.getEnvironment', 'repos.listDeploymentBranchPolicies']) {
    const f = fixture(); f.handlers[key] = () => { const error = Error('https://example.invalid/' + PRIVATE); error.code = PRIVATE; throw error; };
    safe(await f.verify());
  }
});

test('a changed approval or expired clock during final read cannot reuse the initial green proof', async () => {
  const revoked = fixture();
  revoked.handlers['actions.getReviewsForRun'] = (_params, count) => count === 1 ? revoked.reviews
    : [{ ...revoked.reviews[0], state: 'rejected' }];
  const rejected = await revoked.verify(); safe(rejected); assert.equal(rejected.code, 'PROOF_REJECTED');
  const expired = fixture(); let afterReviews = false;
  expired.handlers['actions.getReviewsForRun'] = (_params, count) => { if (count === 2) afterReviews = true; return expired.reviews; };
  expired.now = () => afterReviews ? T0 + 3600000 : T0 + 59000;
  safe(await expired.verify()); assert.equal(expired.counts['actions.getReviewsForRun'], 2);
  const backwards = fixture(); let ticks = 0;
  backwards.now = () => T0 + 59000 - ticks++;
  const invalid = await backwards.verify(); safe(invalid); assert.equal(invalid.code, 'CLOCK_INVALID');
});
