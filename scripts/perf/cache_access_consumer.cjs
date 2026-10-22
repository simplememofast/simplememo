'use strict';

// Secret-free consumer of existing GitHub API metadata. This does not dispatch,
// rerun, approve, download artifacts/logs, publish checks, or contact Cloudflare.
// Load this module from the reviewed immutable main checkout and pass checkoutSha
// from that checkout's actual git HEAD. Configuration is fetched inside this
// module at the matching current main SHA; caller/PR settings cannot replace it.
const { createHash } = require('node:crypto');
const { inspectCandidate, readEnvironmentConfiguration } = require('./cache_access_context.cjs');
const { verifyCacheProof } = require('./cache_access_proof.cjs');

const OWNER = 'simplememofast', REPO = 'simplememo', REPOSITORY = OWNER + '/' + REPO;
const WORKFLOW_FILE = 'home-perf-cache-approved.yml';
const WORKFLOW_PATH = '.github/workflows/' + WORKFLOW_FILE;
const WORKFLOW_REF = REPOSITORY + '/' + WORKFLOW_PATH + '@refs/heads/main';
const CONFIGURATION_PATH = 'scripts/perf/cache_access_configuration.json';
const HOUR = 3600000;

class ConsumerError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function need(ok, code) { if (!ok) throw new ConsumerError(code); }
function exact(pattern, value) { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function record(value, code, keys) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  const own = Reflect.ownKeys(value);
  need(own.length <= 256, code);
  for (const key of own) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    need(typeof key === 'string' && d.enumerable && Object.hasOwn(d, 'value'), code);
  }
  if (keys) need(own.length === keys.length && keys.every(key => Object.hasOwn(value, key)), code);
  return value;
}
function instant(value, code) {
  need(exact(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/, value), code);
  const time = Date.parse(value);
  need(Number.isFinite(time) && new Date(time).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z')), code);
  return time;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function failure(code, checks) {
  return freeze({ version: 1, verified: false, code,
    checks: checks || { input: false, run: false, jobs: false, review: false, time: false }, bound: null });
}
async function get(github, group, method, params, code) {
  try {
    const result = await github.rest[group][method]({ owner: OWNER, repo: REPO, ...params, request: { timeout: 10000 } });
    need(result?.status === 200, code);
    return result.data;
  } catch { throw new ConsumerError(code); }
}
async function mainSha(github) {
  const branch = record(await get(github, 'repos', 'getBranch', { branch: 'main' }, 'MAIN_READ_FAILED'), 'MAIN_INVALID');
  record(branch.commit, 'MAIN_INVALID');
  need(branch.name === 'main' && exact(/^[a-f0-9]{40}$/, branch.commit.sha), 'MAIN_INVALID');
  return branch.commit.sha;
}
async function workflow(github) {
  const value = record(await get(github, 'actions', 'getWorkflow', { workflow_id: WORKFLOW_FILE }, 'WORKFLOW_READ_FAILED'), 'WORKFLOW_INVALID');
  need(positive(value.id) && value.path === WORKFLOW_PATH && value.state === 'active', 'WORKFLOW_INVALID');
  return value.id;
}
async function configuration(github, trustedMainSha) {
  const value = record(await get(github, 'repos', 'getContent', { path: CONFIGURATION_PATH, ref: trustedMainSha }, 'CONFIGURATION_READ_FAILED'), 'CONFIGURATION_INVALID');
  need(value.type === 'file' && value.path === CONFIGURATION_PATH && value.encoding === 'base64'
    && Number.isSafeInteger(value.size) && value.size > 0 && value.size <= 4096
    && exact(/^[a-f0-9]{40}$/, value.sha) && typeof value.content === 'string' && value.content.length <= 6000, 'CONFIGURATION_INVALID');
  const encoded = value.content.replace(/\r?\n/g, '');
  need(exact(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, encoded), 'CONFIGURATION_INVALID');
  const bytes = Buffer.from(encoded, 'base64');
  need(bytes.length === value.size && bytes.toString('base64') === encoded
    && createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') === value.sha, 'CONFIGURATION_INVALID');
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new ConsumerError('CONFIGURATION_INVALID'); }
  record(parsed, 'CONFIGURATION_INVALID', ['configurationReadback']);
  record(parsed.configurationReadback, 'CONFIGURATION_UNVERIFIED');
  return freeze(parsed.configurationReadback);
}
function runIdentity(run) {
  record(run, 'RUN_INVALID');
  for (const key of ['actor', 'triggering_actor', 'repository', 'head_repository']) record(run[key], 'RUN_INVALID');
  need(positive(run.id) && positive(run.run_number), 'RUN_INVALID');
  // Snapshot only documented proof-relevant fields. List/get endpoints can have
  // different unrelated metadata; it must never be copied into the receipt.
  const keys = ['id', 'run_number', 'workflow_id', 'path', 'event', 'head_branch', 'head_sha', 'run_attempt',
    'status', 'conclusion', 'display_title', 'created_at', 'run_started_at', 'updated_at'];
  return { ...Object.fromEntries(keys.map(key => [key, run[key]])),
    actor: run.actor.login, triggeringActor: run.triggering_actor.login,
    repository: run.repository.full_name, repositoryFork: run.repository.fork,
    headRepository: run.head_repository.full_name, headRepositoryFork: run.head_repository.fork };
}
async function latestRun(github, workflowId, headSha, clock) {
  // Official API filters: branch/event/per_page/page. In particular, do NOT use
  // status=success, actor, or head_sha: newer failed/pending/untrusted runs must
  // remain visible instead of selecting an older success.
  // https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow
  const data = record(await get(github, 'actions', 'listWorkflowRuns', {
    workflow_id: workflowId, branch: 'main', event: 'workflow_dispatch', per_page: 100, page: 1,
  }, 'RUNS_READ_FAILED'), 'RUN_LIST_INVALID');
  // The REST documentation does not promise response ordering. Require a
  // complete bounded list rather than assuming a truncated page is the newest.
  need(Number.isSafeInteger(data.total_count) && data.total_count >= 0 && data.total_count <= 100
    && Array.isArray(data.workflow_runs) && data.workflow_runs.length === data.total_count, 'RUN_LIST_INVALID');
  need(Reflect.ownKeys(data.workflow_runs).length === data.workflow_runs.length + 1, 'RUN_LIST_INVALID');
  const ids = new Set(), numbers = new Set(), matching = [];
  for (let i = 0; i < data.workflow_runs.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(data.workflow_runs, String(i));
    need(descriptor && Object.hasOwn(descriptor, 'value'), 'RUN_LIST_INVALID');
    const run = descriptor.value, identity = runIdentity(run);
    need(run.workflow_id === workflowId && run.head_branch === 'main' && run.event === 'workflow_dispatch'
      && !ids.has(run.id) && !numbers.has(run.run_number), 'RUN_LIST_INVALID');
    ids.add(run.id); numbers.add(run.run_number);
    const created = instant(run.created_at, 'RUN_LIST_INVALID');
    need(created <= clock(), 'RUN_LIST_INVALID');
    if (run.display_title === 'Homepage cache PR 2139 @ ' + headSha) matching.push({ run, identity, created });
  }
  // Fail closed if this candidate is absent from the bounded result. Never
  // hunt arbitrarily far back for a green result. Equal timestamps are ordered
  // by GitHub's workflow run_number, not response array order or guessed IDs.
  matching.sort((a, b) => b.created - a.created || b.run.run_number - a.run.run_number);
  need(matching.length > 0, 'PROOF_UNAVAILABLE');
  return matching[0];
}
function producerContext(run, workflowId, trustedMainSha, headSha) {
  runIdentity(run);
  need(run.workflow_id === workflowId && [WORKFLOW_PATH, WORKFLOW_PATH + '@main'].includes(run.path)
    && run.event === 'workflow_dispatch' && run.head_branch === 'main' && run.head_sha === trustedMainSha
    && run.run_attempt === 1 && run.status === 'completed' && run.conclusion === 'success'
    && run.actor.login === OWNER && run.triggering_actor.login === OWNER
    && run.repository.full_name === REPOSITORY && run.repository.fork === false
    && run.head_repository.full_name === REPOSITORY && run.head_repository.fork === false
    && run.display_title === 'Homepage cache PR 2139 @ ' + headSha, 'RUN_INVALID');
  // These ten keys are reconstructed from authenticated producer-run metadata,
  // never from candidate-controlled workflow outputs or artifacts. This is an
  // inspect-only context; it does not issue the credential-use capability.
  return { repository: run.repository.full_name, eventName: run.event, ref: 'refs/heads/' + run.head_branch,
    workflowRef: WORKFLOW_REF, workflowSha: run.head_sha, sha: run.head_sha, checkoutSha: run.head_sha,
    runAttempt: run.run_attempt, actor: run.actor.login, triggeringActor: run.triggering_actor.login };
}

async function verifyPublishedProof(input) {
  try {
    record(input, 'INPUT_INVALID');
    need(Object.keys(input).every(key => ['github', 'headSha', 'checkoutSha', 'now'].includes(key))
      && ['github', 'headSha', 'checkoutSha'].every(key => Object.hasOwn(input, key)), 'INPUT_INVALID');
    need(exact(/^[a-f0-9]{40}$/, input.headSha) && exact(/^[a-f0-9]{40}$/, input.checkoutSha), 'INPUT_INVALID');
    const now = input.now === undefined ? Date.now : input.now;
    need(typeof now === 'function', 'INPUT_INVALID');
    let previousTime = -1;
    const clock = () => {
      const time = now();
      need(Number.isSafeInteger(time) && time >= 0 && time >= previousTime, 'CLOCK_INVALID');
      previousTime = time;
      return time;
    };
    clock();
    const github = input.github, headSha = input.headSha, checkoutSha = input.checkoutSha;
    const trustedMainSha = await mainSha(github);
    need(checkoutSha === trustedMainSha, 'CHECKOUT_MISMATCH');
    // A null main-pinned readback is deliberately inactive. Do not enumerate
    // workflow proofs, invent settings or treat a later API read as a grant.
    const configurationReadback = await configuration(github, trustedMainSha);
    const notAfter = instant(configurationReadback.authorizationNotAfter, 'CONFIGURATION_UNVERIFIED');
    need(clock() < notAfter, 'APPROVAL_EXPIRED');
    const workflowId = await workflow(github);
    const selected = await latestRun(github, workflowId, headSha, clock);
    const run = await get(github, 'actions', 'getWorkflowRun', { run_id: selected.run.id }, 'RUN_READ_FAILED');
    need(JSON.stringify(runIdentity(run)) === JSON.stringify(selected.identity), 'RUN_CHANGED');
    const context = producerContext(run, workflowId, trustedMainSha, headSha);
    const deadline = Math.min(instant(run.created_at, 'RUN_INVALID') + HOUR, notAfter);
    need(clock() < deadline, 'APPROVAL_EXPIRED');
    const validUntil = new Date(deadline).toISOString();
    const candidate = await inspectCandidate({ github, context, checkoutSha,
      request: { pullRequestNumber: 2139, approvedHeadSha: headSha }, validUntil, now: clock });
    const environment = await readEnvironmentConfiguration({ github, configurationReadback, validUntil, now: clock });
    // Exact first-attempt and own-run routes, not latest-job, artifact or URL
    // fields from an API response. GitHub review JSON has no run_attempt field.
    // https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt
    // https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run
    const jobsData = await get(github, 'actions', 'listJobsForWorkflowRunAttempt', {
      run_id: run.id, attempt_number: 1, per_page: 100, page: 1,
    }, 'JOBS_READ_FAILED');
    const reviewsData = await get(github, 'actions', 'getReviewsForRun', { run_id: run.id }, 'REVIEWS_READ_FAILED');
    const proofInput = { run, jobs: { repository: REPOSITORY, runId: run.id, runAttempt: 1, data: jobsData },
      reviews: { repository: REPOSITORY, runId: run.id, data: reviewsData },
      expected: { candidateHeadSha: headSha, manifestSha256: candidate.manifestSha256, deploymentId: candidate.deploymentId,
        workflowId, trustedMainSha, environmentId: environment.environmentId, validUntil }, now: clock() };
    const proof = verifyCacheProof(proofInput);
    if (!proof.verified) return failure('PROOF_REJECTED', proof.checks);
    // Recheck the mutable sources after the multi-endpoint read. No API can
    // provide one atomic snapshot; a later release step still needs its own
    // exact-head gate, but changes observed during this read are not accepted.
    const freshCandidate = await inspectCandidate({ github, context, checkoutSha,
      request: { pullRequestNumber: 2139, approvedHeadSha: headSha }, validUntil, now: clock });
    need(freshCandidate.headSha === candidate.headSha && freshCandidate.manifestSha256 === candidate.manifestSha256
      && freshCandidate.deploymentId === candidate.deploymentId && freshCandidate.previewOrigin === candidate.previewOrigin, 'CANDIDATE_CHANGED');
    need(await workflow(github) === workflowId, 'WORKFLOW_CHANGED');
    const freshSelected = await latestRun(github, workflowId, headSha, clock);
    need(JSON.stringify(freshSelected.identity) === JSON.stringify(selected.identity), 'RUN_CHANGED');
    const freshEnvironment = await readEnvironmentConfiguration({ github, configurationReadback, validUntil, now: clock });
    need(freshEnvironment.environmentId === environment.environmentId, 'ENVIRONMENT_CHANGED');
    const freshReviews = await get(github, 'actions', 'getReviewsForRun', { run_id: run.id }, 'REVIEWS_READ_FAILED');
    need(await mainSha(github) === trustedMainSha, 'MAIN_CHANGED');
    const finalProof = verifyCacheProof({ ...proofInput,
      reviews: { repository: REPOSITORY, runId: run.id, data: freshReviews }, now: clock() });
    return finalProof.verified ? freeze(finalProof) : failure('PROOF_REJECTED', finalProof.checks);
  } catch (error) {
    // Context helper failures are collapsed rather than reflecting API bodies,
    // native messages, URLs, approval comments, or arbitrary error.code values.
    return failure(error instanceof ConsumerError ? error.code : 'CONTEXT_REJECTED');
  }
}

module.exports = { verifyPublishedProof };
