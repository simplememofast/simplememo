'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { inspectCandidate, readEnvironmentConfiguration, readEnvironmentApproval, resolveCandidate, CacheAccessContextError } = require('./cache_access_context.cjs');
const MAIN = 'a'.repeat(40), HEAD = 'b'.repeat(40), RUN = 12345;
const SECRET = 'SYNTHETIC_UNTRUSTED_RESPONSE_MUST_NOT_ESCAPE';
const now = Date.parse('2026-10-22T10:00:00Z');
const until = '2026-10-22T10:30:00Z';
const hash = data => createHash('sha256').update(data).digest('hex');
function content(manifest) {
  const bytes = Buffer.from(JSON.stringify(manifest));
  return { type: 'file', path: 'assets/home-perf/manifest.json', encoding: 'base64', size: bytes.length,
    content: bytes.toString('base64'), sha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') };
}
function fixture() {
  const context = { repository: 'simplememofast/simplememo', eventName: 'workflow_dispatch', ref: 'refs/heads/main',
    workflowRef: 'simplememofast/simplememo/.github/workflows/home-perf-cache-approved.yml@refs/heads/main',
    workflowSha: MAIN, sha: MAIN, checkoutSha: MAIN, runAttempt: 1, actor: 'simplememofast', triggeringActor: 'simplememofast' };
  const assets = {};
  for (const [name, bytes] of [['image.avif', Buffer.from('synthetic image')], ['font.woff2', Buffer.from('synthetic font')]]) {
    const digest = hash(bytes), [stem, ext] = name.split('.');
    assets[`assets/home-perf/${stem}-${digest.slice(0, 12)}.${ext}`] = { bytes: bytes.length, sha256: digest };
  }
  const data = {
    pr: { number: 2175, state: 'open', merged: false, user: { login: 'simplememofast' },
      base: { ref: 'main', repo: { full_name: 'simplememofast/simplememo', fork: false } },
      head: { sha: HEAD, repo: { full_name: 'simplememofast/simplememo', fork: false } }, body: SECRET },
    checks: [{ id: 1, name: 'Cloudflare Pages', status: 'completed', conclusion: 'success', head_sha: HEAD,
      app: { id: 85455, slug: 'cloudflare-workers-and-pages' },
      details_url: 'https://dash.cloudflare.com/?to=/6f37d8ca103aa4af6a3722fc3c3e1ef6/pages/view/simplememo/1234abcd-0000-4000-8000-000000000000',
      output: { summary: "<a href='https://1234abcd.simplememo-596.pages.dev'>https://1234abcd.simplememo-596.pages.dev</a>" } }],
    manifest: content({ version: 1, assets, script: 'throw new Error(' + SECRET + ')', pages: {}, inputs: {} }),
    run: { id: RUN, repository: { full_name: 'simplememofast/simplememo', fork: false },
      head_repository: { full_name: 'simplememofast/simplememo', fork: false }, event: 'workflow_dispatch', head_branch: 'main',
      head_sha: MAIN, path: '.github/workflows/home-perf-cache-approved.yml', actor: { login: 'simplememofast' },
      triggering_actor: { login: 'simplememofast' }, run_attempt: 1, display_title: 'Homepage cache PR 2175 @ ' + HEAD,
      status: 'in_progress', conclusion: null, created_at: '2026-10-22T09:50:00Z' },
    environment: { id: 456, name: 'preview-cache-ci', deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { login: 'simplememofast' } }] }, { type: 'branch_policy' }] },
    branches: { total_count: 1, branch_policies: [{ id: 789, name: 'main', type: 'branch' }] },
    reviews: [{ state: 'approved', user: { login: 'simplememofast' }, environments: [{ id: 456, name: 'preview-cache-ci' }], comment: SECRET }],
  };
  const calls = [], hooks = {};
  function method(name, read) {
    return async args => {
      calls.push({ name, args: structuredClone(args) });
      assert.equal(args.owner, 'simplememofast'); assert.equal(args.repo, 'simplememo');
      assert.equal(args.request.timeout, 10000);
      const response = { status: 200, data: structuredClone(read(args)) };
      return hooks[name] ? await hooks[name](args, response) ?? response : response;
    };
  }
  const github = { rest: {
    pulls: { get: method('pulls.get', () => data.pr) },
    checks: { listForRef: method('checks.listForRef', args => ({ total_count: data.checks.length, check_runs: data.checks.slice((args.page - 1) * 100, args.page * 100) })) },
    repos: { getContent: method('repos.getContent', () => data.manifest), getEnvironment: method('repos.getEnvironment', () => data.environment),
      listDeploymentBranchPolicies: method('repos.listDeploymentBranchPolicies', () => data.branches) },
    actions: { getWorkflowRun: method('actions.getWorkflowRun', () => data.run), getReviewsForRun: method('actions.getReviewsForRun', () => data.reviews) },
  } };
  const configurationReadback = { environmentName: 'preview-cache-ci', environmentId: 456, mainBranchOnly: true, requiredReviewer: 'simplememofast',
    preventSelfReview: false, adminBypassDisabled: true, observedAt: '2026-10-22T09:00:00Z', authorizationNotAfter: '2026-10-23T09:00:00Z' };
  return { data, calls, hooks, github, context, configurationReadback,
    candidate: { github, context, checkoutSha: MAIN, request: { pullRequestNumber: '2175', approvedHeadSha: HEAD }, validUntil: until, now },
    approval: { github, runId: RUN, headSha: HEAD, context: { ...context, runId: RUN }, now, validUntil: until, configurationReadback } };
}
function staticError(expected) {
  return error => {
    assert.ok(error instanceof CacheAccessContextError);
    if (expected) assert.equal(error.code, expected);
    assert.deepEqual(JSON.parse(JSON.stringify(error)), { code: error.code });
    assert.match(error.message, /^[A-Z_]+$/);
    assert.equal(error.cause, undefined);
    assert.ok(!String(error.stack).includes(SECRET));
    return true;
  };
}
async function rejectedCandidate(change, code) { const f = fixture(); change(f); await assert.rejects(inspectCandidate(f.candidate), staticError(code)); return f; }
async function rejectedApproval(change, code) { const f = fixture(); change(f); await assert.rejects(readEnvironmentApproval(f.approval), staticError(code)); return f; }

test('preflight projects fixed-repo metadata and bounded data without issuing an approval capability', async () => {
  const f = fixture(), result = await inspectCandidate(f.candidate);
  assert.deepEqual(Object.keys(result), ['headSha', 'manifestSha256', 'deploymentId', 'previewOrigin', 'manifest']);
  assert.equal(result.headSha, HEAD); assert.equal(result.previewOrigin, 'https://1234abcd.simplememo-596.pages.dev');
  assert.equal(result.manifestSha256, hash(JSON.stringify(result.manifest)));
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.manifest.assets));
  assert.ok(!JSON.stringify(result).includes(SECRET));
  assert.deepEqual(f.calls.map(c => c.name), ['pulls.get', 'checks.listForRef', 'repos.getContent', 'pulls.get']);
  assert.equal(f.calls[1].args.ref, HEAD); assert.equal(f.calls[1].args.filter, 'all');
  assert.equal(f.calls[2].args.path, 'assets/home-perf/manifest.json'); assert.equal(f.calls[2].args.ref, HEAD);
  await assert.rejects(resolveCandidate({ ...f.candidate, approval: result }), staticError('APPROVAL_REQUIRED'));
});

test('live-shaped owner review plus separately fixed settings creates a single-use exact-run capability', async () => {
  const f = fixture(), approval = await readEnvironmentApproval(f.approval);
  assert.ok(Object.isFrozen(approval)); assert.equal(approval.runId, RUN); assert.equal(approval.headSha, HEAD);
  assert.equal(f.calls.filter(c => c.name === 'actions.getReviewsForRun')[0].args.run_id, RUN);
  const result = await resolveCandidate({ ...f.candidate, approval });
  assert.equal(result.authorization.headSha, HEAD);
  assert.equal(result.authorization.manifestSha256, hash(result.gateInput.reviewedManifest));
  assert.equal(result.gateInput.policy.cloudflareAppId, 85455);
  assert.equal(Object.hasOwn(result.gateInput.context, 'runId'), false);
  assert.equal(Object.getOwnPropertyDescriptor(result, 'gateInput').enumerable, false);
  await assert.rejects(resolveCandidate({ ...f.candidate, approval }), staticError('APPROVAL_REQUIRED'));
});

test('forged, serialized, cross-context and stale approval objects never enable candidate resolution', async () => {
  for (const mutate of [input => { input.approval = structuredClone(input.approval); },
    input => { input.request = { ...input.request, approvedHeadSha: MAIN }; },
    input => { input.validUntil = '2026-10-22T10:31:00Z'; }, input => { input.now += 60001; },
    input => { input.now -= 1; }, input => { input.github = { ...input.github }; },
    input => { input.context = { ...input.context, runAttempt: 2 }; }]) {
    const f = fixture(), input = { ...f.candidate, approval: await readEnvironmentApproval(f.approval) };
    const before = f.calls.length; mutate(input);
    await assert.rejects(resolveCandidate(input), staticError());
    assert.equal(f.calls.length, before);
  }
});

test('unapproved repo, event, ref, actor, checkout, request or expired deadline fail before any API read', async () => {
  for (const mutate of [f => { f.candidate.context.repository = 'other/simplememo'; }, f => { f.candidate.context.eventName = 'pull_request'; },
    f => { f.candidate.context.ref = 'refs/heads/candidate'; }, f => { f.candidate.context.actor = 'contributor'; },
    f => { f.candidate.context.triggeringActor = 'contributor'; }, f => { f.candidate.checkoutSha = HEAD; },
    f => { f.candidate.request.pullRequestNumber = '2136'; }, f => { f.candidate.request.pullRequestNumber = 2139; },
    f => { f.candidate.request.pullRequestNumber = '2139'; }, f => { f.candidate.request.approvedHeadSha = 'invalid'; },
    f => { f.candidate.request.pullRequestNumber = 2164; }, f => { f.candidate.request.pullRequestNumber = '2164'; },
    f => { f.candidate.request.approvedHeadSha += '\n'; },
    f => { f.candidate.validUntil = '2026-02-30T10:30:00Z'; }, f => { f.candidate.now = Date.parse(until); }]) {
    const f = await rejectedCandidate(mutate); assert.equal(f.calls.length, 0);
  }
});

test('fresh PR requires an open owner-authored nonfork exact head targeting same-repo main', async () => {
  for (const mutate of [pr => { pr.number = 2139; }, pr => { pr.number = 2164; }, pr => { pr.state = 'closed'; }, pr => { pr.merged = true; }, pr => { pr.user.login = 'contributor'; },
    pr => { pr.head.sha = MAIN; }, pr => { pr.head.repo.fork = true; }, pr => { pr.head.repo.full_name = 'contributor/simplememo'; },
    pr => { pr.base.repo.fork = true; }, pr => { pr.base.ref = 'candidate'; }, pr => { pr.base.repo.full_name = 'other/simplememo'; }]) {
    await rejectedCandidate(f => mutate(f.data.pr), 'PR_INVALID');
  }
  await rejectedCandidate(f => { let count = 0; f.hooks['pulls.get'] = (_args, response) => { if (++count === 2) response.data.head.sha = MAIN; }; }, 'CANDIDATE_REJECTED');
});

test('bounded check pagination visits no more than three exact-SHA pages', async () => {
  const f = fixture();
  for (let id = 2; id <= 201; id++) f.data.checks.push({ id, head_sha: HEAD, name: 'ordinary check' });
  assert.equal((await inspectCandidate(f.candidate)).headSha, HEAD);
  assert.deepEqual(f.calls.filter(c => c.name === 'checks.listForRef').map(c => c.args.page), [1, 2, 3]);
  await rejectedCandidate(f => { f.hooks['checks.listForRef'] = (_args, r) => { r.data.total_count = 301; }; }, 'CHECK_LIST_INVALID');
  await rejectedCandidate(f => { f.data.checks.push({ ...f.data.checks[0] }); }, 'CHECK_LIST_INVALID');
  await rejectedCandidate(f => { f.hooks['checks.listForRef'] = (_args, r) => { r.data.total_count = 2; }; }, 'CHECK_LIST_CHANGED');
  await rejectedCandidate(f => { f.data.checks[0].head_sha = MAIN; }, 'CHECK_LIST_INVALID');
});

test('same immutable deployment duplicates are acceptable while distinct successes are ambiguous', async () => {
  const f = fixture(); f.data.checks.push({ ...structuredClone(f.data.checks[0]), id: 2 });
  assert.equal((await inspectCandidate(f.candidate)).previewOrigin, 'https://1234abcd.simplememo-596.pages.dev');
  await rejectedCandidate(f => {
    const other = structuredClone(f.data.checks[0]); other.id = 2;
    other.details_url = other.details_url.replace('1234abcd', '8765abcd');
    other.output.summary = other.output.summary.replaceAll('1234abcd', '8765abcd'); f.data.checks.push(other);
  }, 'DEPLOYMENT_AMBIGUOUS');
  for (const mutate of [c => { c.app.id = 4242; }, c => { c.app.slug = 'spoof'; }, c => { c.conclusion = 'failure'; },
    c => { c.status = 'in_progress'; }]) await rejectedCandidate(f => mutate(f.data.checks[0]), 'DEPLOYMENT_UNAVAILABLE');
  await rejectedCandidate(f => { f.data.checks[0].details_url += '&extra=1'; }, 'CANDIDATE_REJECTED');
});

test('manifest content is strict bounded base64 file data bound to its returned Git blob', async () => {
  for (const mutate of [m => { m.type = 'symlink'; }, m => { m.path = 'candidate.js'; }, m => { m.encoding = 'none'; },
    m => { m.sha = MAIN; }, m => { m.size++; }, m => { m.size = 128 * 1024 + 1; },
    m => { m.content = '%%%'; }, m => { m.content = m.content.replace(/.$/, '!'); }, m => { m.content = 'A'.repeat(180001); }]) {
    await rejectedCandidate(f => mutate(f.data.manifest), 'MANIFEST_INVALID');
  }
  await rejectedCandidate(f => { f.data.manifest = content({ version: 2, assets: {} }); }, 'MANIFEST_INVALID');
  await rejectedCandidate(f => { f.data.manifest = content({ version: 1, assets: { '../candidate.js': { bytes: 1, sha256: 'a'.repeat(64) } } }); }, 'CANDIDATE_REJECTED');
  const f = fixture(); f.data.manifest.content = f.data.manifest.content.match(/.{1,60}/g).join('\n') + '\n';
  assert.equal((await inspectCandidate(f.candidate)).headSha, HEAD);
});

test('configuration readback is a required independent input and missing API bypass fields do not become defaults', async () => {
  const f = fixture(); assert.equal(Object.hasOwn(f.data.environment, 'can_admins_bypass'), false);
  assert.equal((await readEnvironmentApproval(f.approval)).headSha, HEAD);
  for (const mutate of [f => { f.approval.configurationReadback = null; }, f => { f.configurationReadback.adminBypassDisabled = false; },
    f => { delete f.configurationReadback.environmentId; }, f => { f.configurationReadback.environmentId = 0; },
    f => { delete f.configurationReadback.adminBypassDisabled; }, f => { f.configurationReadback.mainBranchOnly = false; },
    f => { f.configurationReadback.requiredReviewer = 'contributor'; }, f => { f.configurationReadback.preventSelfReview = true; },
    f => { f.configurationReadback.observedAt = '2026-10-22T11:00:00Z'; },
    f => { f.configurationReadback.authorizationNotAfter = '2026-10-30T09:00:00Z'; },
    f => { f.configurationReadback.authorizationNotAfter = '2026-10-22T10:15:00Z'; }]) {
    const f = await rejectedApproval(mutate, 'CONFIGURATION_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
});

test('shared settings-only reader returns a validated Environment ID without an approval capability', async () => {
  const f = fixture();
  const input = { github: f.github, configurationReadback: f.configurationReadback, validUntil: until, now };
  const result = await readEnvironmentConfiguration(input);
  assert.deepEqual(result, { environmentId: 456 }); assert.ok(Object.isFrozen(result));
  assert.deepEqual(f.calls.map(c => c.name), ['repos.getEnvironment', 'repos.listDeploymentBranchPolicies']);
  await assert.rejects(resolveCandidate({ ...f.candidate, approval: result }), staticError('APPROVAL_REQUIRED'));
  const before = f.calls.length;
  await assert.rejects(readEnvironmentConfiguration({ ...input, configurationReadback: null }), staticError('CONFIGURATION_UNVERIFIED'));
  assert.equal(f.calls.length, before);
  let time = now;
  f.hooks['repos.listDeploymentBranchPolicies'] = () => { time = Date.parse(until); };
  await assert.rejects(readEnvironmentConfiguration({ ...input, now: () => time }), staticError('APPROVAL_EXPIRED'));
});

test('a recreated same-name Environment cannot reuse the earlier UI settings readback', async () => {
  const f = fixture();
  f.data.environment.id++;
  f.data.reviews[0].environments[0].id = f.data.environment.id;
  await assert.rejects(readEnvironmentApproval(f.approval), staticError('ENVIRONMENT_INVALID'));
  assert.ok(!f.calls.some(call => call.name === 'actions.getReviewsForRun'));
});

test('the live run must bind repository workflow main SHA owner attempt status display title and one-hour deadline', async () => {
  for (const mutate of [r => { r.id++; }, r => { r.repository.full_name = 'other/simplememo'; }, r => { r.repository.fork = true; }, r => { r.head_repository.fork = true; },
    r => { r.event = 'pull_request_target'; }, r => { r.head_branch = 'candidate'; }, r => { r.head_sha = HEAD; },
    r => { r.path = '.github/workflows/other.yml'; }, r => { r.actor.login = 'contributor'; }, r => { r.triggering_actor.login = 'contributor'; },
    r => { r.run_attempt = 2; }, r => { r.display_title += ' '; }, r => { r.status = 'completed'; }, r => { r.conclusion = 'success'; },
    r => { r.display_title = 'Homepage cache PR 2164 @ ' + HEAD; },
    r => { r.created_at = '2026-10-22T09:00:00Z'; }, r => { r.created_at = '2026-10-22T11:00:00Z'; }]) {
    await rejectedApproval(f => mutate(f.data.run), 'RUN_INVALID');
  }
  await rejectedApproval(f => { f.approval.runId++; }, 'RUN_INVALID');
  await rejectedApproval(f => { delete f.approval.context.runId; }, 'CONTEXT_INVALID');
});

test('live Environment and selected branch policy cannot broaden the separately reviewed settings', async () => {
  for (const mutate of [e => { e.id = 0; }, e => { e.name = 'other'; }, e => { e.deployment_branch_policy.protected_branches = true; },
    e => { e.deployment_branch_policy.custom_branch_policies = false; }, e => { e.protection_rules = []; },
    e => { e.protection_rules[0].prevent_self_review = true; }, e => { e.protection_rules[0].reviewers[0].type = 'Team'; },
    e => { e.protection_rules[0].reviewers[0].reviewer.login = 'contributor'; },
    e => { e.protection_rules[0].reviewers.push(e.protection_rules[0].reviewers[0]); }]) {
    await rejectedApproval(f => mutate(f.data.environment), 'ENVIRONMENT_INVALID');
  }
  for (const mutate of [b => { b.total_count = 2; }, b => { b.branch_policies[0].name = '*'; },
    b => { b.branch_policies[0].type = 'tag'; }, b => { delete b.branch_policies[0].type; }]) {
    await rejectedApproval(f => mutate(f.data.branches), 'BRANCH_POLICY_INVALID');
  }
});

test('approvals require exactly one owner-approved matching Environment on this own run', async () => {
  for (const mutate of [r => { r[0].state = 'rejected'; }, r => { r[0].state = 'pending'; }, r => { r[0].user.login = 'contributor'; },
    r => { r[0].environments[0].id++; }, r => { r[0].environments[0].name = 'other'; }, r => { r.push(structuredClone(r[0])); }]) {
    await rejectedApproval(f => mutate(f.data.reviews), 'ENVIRONMENT_NOT_APPROVED');
  }
  await rejectedApproval(f => { f.data.reviews = []; }, 'ENVIRONMENT_NOT_APPROVED');
  const f = fixture(); f.data.reviews[0].environments[0].created_at = '1999-01-01T00:00:00Z';
  assert.equal((await readEnvironmentApproval(f.approval)).headSha, HEAD, 'Environment created_at is not an approval timestamp');
});

test('every external failure and arbitrary response text is reduced to a static error code', async () => {
  for (const method of ['pulls.get', 'checks.listForRef', 'repos.getContent']) {
    await rejectedCandidate(f => { f.hooks[method] = () => { throw Error(SECRET); }; });
  }
  for (const method of ['actions.getWorkflowRun', 'repos.getEnvironment', 'repos.listDeploymentBranchPolicies', 'actions.getReviewsForRun']) {
    await rejectedApproval(f => { f.hooks[method] = () => { throw Error(SECRET); }; });
  }
  await rejectedCandidate(f => { f.hooks['repos.getContent'] = () => ({ status: 403, data: { message: SECRET } }); }, 'MANIFEST_READ_FAILED');
});

test('clock callbacks recheck expiry after API delays and before issuing proof', async () => {
  const f = fixture(); let current = now; f.approval.now = () => current;
  f.hooks['actions.getReviewsForRun'] = () => { current = Date.parse(until); };
  await assert.rejects(readEnvironmentApproval(f.approval), staticError('APPROVAL_EXPIRED'));
  const g = fixture(); let clock = now; g.candidate.now = () => clock;
  g.hooks['repos.getContent'] = () => { clock = Date.parse(until); };
  await assert.rejects(inspectCandidate(g.candidate), staticError('APPROVAL_EXPIRED'));
  for (const offset of [-1, 60001]) {
    const h = fixture(), approval = await readEnvironmentApproval(h.approval);
    let currentTime = now;
    h.hooks['repos.getContent'] = () => { currentTime = now + offset; };
    await assert.rejects(resolveCandidate({ ...h.candidate, now: () => currentTime, approval }), staticError('APPROVAL_EXPIRED'));
  }
});

test('approval primitives are snapshotted before asynchronous response callbacks can change caller input', async () => {
  const f = fixture();
  f.hooks['repos.getEnvironment'] = () => {
    f.approval.headSha = MAIN; f.approval.runId++; f.approval.github = null;
    f.approval.now = 0; f.approval.validUntil = '2099-01-01T00:00:00Z';
  };
  const approval = await readEnvironmentApproval(f.approval);
  assert.equal(approval.headSha, HEAD); assert.equal(approval.runId, RUN);
  assert.equal(approval.validUntil, until);
  assert.equal((await resolveCandidate({ ...f.candidate, approval })).authorization.headSha, HEAD);
});

test('candidate context, request, client and deadline are snapshotted before asynchronous reads', async () => {
  const f = fixture();
  f.hooks['pulls.get'] = () => {
    f.candidate.request.approvedHeadSha = MAIN; f.candidate.context.actor = 'contributor';
    f.candidate.github = null; f.candidate.now = 0; f.candidate.validUntil = '2099-01-01T00:00:00Z';
  };
  const result = await inspectCandidate(f.candidate);
  assert.equal(result.headSha, HEAD);
  assert.equal(f.calls.filter(c => c.name === 'pulls.get').length, 2);
});

test('canonical millisecond timestamps work while unknown fields or accessors fail closed', async () => {
  const f = fixture();
  f.approval.validUntil = '2026-10-22T10:30:00.001Z';
  f.configurationReadback.observedAt = '2026-10-22T09:00:00.001Z';
  assert.equal((await readEnvironmentApproval(f.approval)).validUntil, f.approval.validUntil);
  await rejectedApproval(g => { g.approval.untrusted = SECRET; }, 'INPUT_INVALID');
  let getterRan = false;
  const g = fixture();
  Object.defineProperty(g.configurationReadback, 'adminBypassDisabled', {
    enumerable: true, get() { getterRan = true; throw Error(SECRET); },
  });
  await assert.rejects(readEnvironmentApproval(g.approval), staticError('CONFIGURATION_UNVERIFIED'));
  assert.equal(getterRan, false); assert.equal(g.calls.length, 0);
});
