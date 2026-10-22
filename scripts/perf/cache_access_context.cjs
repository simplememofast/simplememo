'use strict';

const { createHash } = require('node:crypto');
const { authorizeCacheCheck } = require('./cache_access_gate.cjs');

// Inactive, dependency-injected GitHub reader: no client construction, secrets,
// environment reads, logging or candidate code execution. The trusted main
// caller must measure checkoutSha, supply authentic Actions context, and load
// configurationReadback/validUntil from independently reviewed main config.
// Neither dispatch inputs nor PR files are a settings/approval source.
// Runtime callers should pass now: Date.now, not a captured pre-approval time.
const OWNER = 'simplememofast', REPO = 'simplememo', FULL_REPO = OWNER + '/' + REPO;
const WORKFLOW_PATH = '.github/workflows/home-perf-cache-approved.yml';
const WORKFLOW_REF = FULL_REPO + '/' + WORKFLOW_PATH + '@refs/heads/main';
const ENVIRONMENT = 'preview-cache-ci', MANIFEST_PATH = 'assets/home-perf/manifest.json';
const MAX_MANIFEST = 128 * 1024, HOUR = 3600000, WEEK = 7 * 24 * HOUR;
const CONTEXT_KEYS = ['repository', 'eventName', 'ref', 'workflowRef', 'workflowSha', 'sha', 'checkoutSha', 'runAttempt', 'actor', 'triggeringActor'];
const approvals = new WeakMap();

class CacheAccessContextError extends Error {
  constructor(code) { super(code); this.name = 'CacheAccessContextError'; this.code = code; }
  toJSON() { return { code: this.code }; }
}
function fail(code) { throw new CacheAccessContextError(code); }
function need(ok, code) { if (!ok) fail(code); }
function record(value, code, keys) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    need(typeof key === 'string' && d.enumerable && Object.hasOwn(d, 'value'), code);
  }
  if (keys) need(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), code);
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function sha(value) { return typeof value === 'string' && value.length === 40 && /^[a-f0-9]{40}$/.test(value); }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return Number.isFinite(time) && new Date(time).toISOString() === canonical ? time : NaN;
}
function clock(now, validUntil) {
  const time = typeof now === 'function' ? now() : now, expiry = timestamp(validUntil);
  need(Number.isSafeInteger(time) && time >= 0 && Number.isFinite(expiry) && time < expiry, 'APPROVAL_EXPIRED');
  return time;
}
function contextData(context, checkoutSha, withRunId = false) {
  record(context, 'CONTEXT_INVALID', withRunId ? [...CONTEXT_KEYS, 'runId'] : CONTEXT_KEYS);
  need(context.repository === FULL_REPO && context.eventName === 'workflow_dispatch'
    && context.ref === 'refs/heads/main' && context.workflowRef === WORKFLOW_REF
    && context.actor === OWNER && context.triggeringActor === OWNER
    && (context.runAttempt === 1 || context.runAttempt === '1')
    && sha(checkoutSha) && checkoutSha === context.checkoutSha && checkoutSha === context.sha
    && checkoutSha === context.workflowSha, 'CONTEXT_INVALID');
  if (withRunId) need(positive(context.runId), 'CONTEXT_INVALID');
  return freeze(Object.fromEntries(CONTEXT_KEYS.map(key => [key, context[key]])));
}
function requestData(request) {
  record(request, 'REQUEST_INVALID', ['pullRequestNumber', 'approvedHeadSha']);
  need((request.pullRequestNumber === 2139 || request.pullRequestNumber === '2139') && sha(request.approvedHeadSha), 'REQUEST_INVALID');
  return freeze({ pullRequestNumber: 2139, approvedHeadSha: request.approvedHeadSha });
}
async function get(github, group, method, params, code) {
  try {
    const api = github.rest[group];
    const result = await api[method]({ owner: OWNER, repo: REPO, ...params, request: { timeout: 10000 } });
    need(result?.status === 200, code);
    return result.data;
  } catch { fail(code); }
}
function pullData(value) {
  record(value, 'PR_INVALID'); record(value.user, 'PR_INVALID');
  record(value.base, 'PR_INVALID'); record(value.base.repo, 'PR_INVALID');
  record(value.head, 'PR_INVALID'); record(value.head.repo, 'PR_INVALID');
  return { number: value.number, state: value.state, merged: value.merged, user: { login: value.user.login },
    base: { ref: value.base.ref, repo: { full_name: value.base.repo.full_name, fork: value.base.repo.fork } },
    head: { sha: value.head.sha, repo: { full_name: value.head.repo.full_name, fork: value.head.repo.fork } } };
}
function checkData(value) {
  record(value, 'CHECK_INVALID'); record(value.app, 'CHECK_INVALID'); record(value.output, 'CHECK_INVALID');
  return { id: value.id, name: value.name, status: value.status, conclusion: value.conclusion, head_sha: value.head_sha,
    app: { id: value.app.id, slug: value.app.slug }, details_url: value.details_url, output: { summary: value.output.summary } };
}
function manifestData(value, headSha) {
  record(value, 'MANIFEST_INVALID');
  need(value.type === 'file' && value.path === MANIFEST_PATH && value.encoding === 'base64'
    && Number.isSafeInteger(value.size) && value.size > 0 && value.size <= MAX_MANIFEST
    && sha(value.sha) && typeof value.content === 'string' && value.content.length <= 180000, 'MANIFEST_INVALID');
  const encoded = value.content.replace(/\r?\n/g, '');
  need(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), 'MANIFEST_INVALID');
  const bytes = Buffer.from(encoded, 'base64');
  need(bytes.length === value.size && bytes.toString('base64') === encoded
    && createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex') === value.sha, 'MANIFEST_INVALID');
  let original;
  try { original = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('MANIFEST_INVALID'); }
  record(original, 'MANIFEST_INVALID');
  need(original.version === 1, 'MANIFEST_INVALID');
  // Other JSON metadata is not imported, evaluated or copied into executable
  // locations. SHA approval covers the fetched immutable manifest as data.
  return JSON.stringify({ version: original.version, headSha, assets: original.assets });
}
async function candidate(input) {
  const context = contextData(input.context, input.checkoutSha), request = requestData(input.request);
  const { github, now, validUntil } = input, headSha = request.approvedHeadSha;
  clock(now, validUntil);
  const pr = pullData(await get(github, 'pulls', 'get', { pull_number: 2139 }, 'PR_READ_FAILED'));
  need(pr.number === 2139 && pr.state === 'open' && pr.merged === false && pr.user.login === OWNER
    && pr.base.ref === 'main' && pr.base.repo.full_name === FULL_REPO && pr.base.repo.fork === false
    && pr.head.sha === headSha && pr.head.repo.full_name === FULL_REPO && pr.head.repo.fork === false, 'PR_INVALID');
  const checks = [], ids = new Set();
  let total;
  for (let page = 1; page <= 3; page++) {
    const data = await get(github, 'checks', 'listForRef', { ref: headSha, filter: 'all', per_page: 100, page }, 'CHECKS_READ_FAILED');
    record(data, 'CHECK_LIST_INVALID');
    need(Number.isSafeInteger(data.total_count) && data.total_count >= 0 && data.total_count <= 300
      && Array.isArray(data.check_runs) && data.check_runs.length <= 100, 'CHECK_LIST_INVALID');
    total ??= data.total_count;
    need(data.total_count === total && data.check_runs.length === Math.min(100, total - checks.length), 'CHECK_LIST_CHANGED');
    for (const check of data.check_runs) {
      record(check, 'CHECK_INVALID');
      need(positive(check.id) && !ids.has(check.id) && check.head_sha === headSha, 'CHECK_LIST_INVALID');
      ids.add(check.id); checks.push(check);
    }
    if (checks.length === total) break;
  }
  need(checks.length === total, 'CHECK_LIST_INCOMPLETE');
  const raw = manifestData(await get(github, 'repos', 'getContent', { path: MANIFEST_PATH, ref: headSha }, 'MANIFEST_READ_FAILED'), headSha);
  const manifestSha256 = createHash('sha256').update(raw).digest('hex');
  const policy = { approvedPullRequestNumber: 2139, approvedHeadSha: headSha, validUntil,
    cloudflareAppId: 85455, cloudflareAppSlug: 'cloudflare-workers-and-pages',
    cloudflareAccountId: '6f37d8ca103aa4af6a3722fc3c3e1ef6', cloudflareProjectName: 'simplememo', expectedManifestSha256: manifestSha256 };
  // Re-read the PR after bounded content/check reads; never authorize a moved or
  // closed head merely because it matched before those asynchronous operations.
  const freshPr = pullData(await get(github, 'pulls', 'get', { pull_number: 2139 }, 'PR_READ_FAILED'));
  let result;
  for (const value of checks) {
    if (value.name !== 'Cloudflare Pages' || value.status !== 'completed' || value.conclusion !== 'success') continue;
    record(value.app, 'CHECK_INVALID');
    if (value.app.id !== 85455 || value.app.slug !== 'cloudflare-workers-and-pages') continue;
    const gateInput = { context, request, pullRequest: freshPr, checkRun: checkData(value), policy, reviewedManifest: raw, now: clock(now, validUntil) };
    let authorization;
    try { authorization = authorizeCacheCheck(gateInput); } catch { fail('CANDIDATE_REJECTED'); }
    if (result) need(result.authorization.deploymentId === authorization.deploymentId
      && result.authorization.previewOrigin === authorization.previewOrigin, 'DEPLOYMENT_AMBIGUOUS');
    else result = { gateInput: freeze(gateInput), authorization: freeze({ ...authorization, manifestSha256 }) };
  }
  need(result, 'DEPLOYMENT_UNAVAILABLE');
  clock(now, validUntil);
  return result;
}
async function inspectCandidate(input) {
  try {
    record(input, 'INPUT_INVALID', ['github', 'context', 'checkoutSha', 'request', 'validUntil', 'now']);
    const { authorization: a } = await candidate(input);
    // Preflight metadata cannot be used as an approval capability or expose the
    // gateInput/authorization interface consumed by the credentialed caller.
    return freeze({ headSha: a.headSha, manifestSha256: a.manifestSha256, deploymentId: a.deploymentId, previewOrigin: a.previewOrigin, manifest: a.manifest });
  } catch (error) { if (error instanceof CacheAccessContextError) throw error; fail('INPUT_INVALID'); }
}

function configurationData(value, now, validUntil) {
  const time = clock(now, validUntil);
  const cfg = record(value, 'CONFIGURATION_UNVERIFIED', ['environmentName', 'environmentId', 'mainBranchOnly',
    'requiredReviewer', 'preventSelfReview', 'adminBypassDisabled', 'observedAt', 'authorizationNotAfter']);
  const observedAt = timestamp(cfg.observedAt), notAfter = timestamp(cfg.authorizationNotAfter), expiry = timestamp(validUntil);
  need(cfg.environmentName === ENVIRONMENT && positive(cfg.environmentId) && cfg.mainBranchOnly === true && cfg.requiredReviewer === OWNER
    && cfg.preventSelfReview === false && cfg.adminBypassDisabled === true && Number.isFinite(observedAt)
    && Number.isFinite(notAfter) && observedAt <= time && time < notAfter
    && notAfter <= observedAt + WEEK && expiry <= notAfter, 'CONFIGURATION_UNVERIFIED');
  return freeze({ ...cfg });
}

// Shared settings-only reader: it never creates an approval capability, and
// completed-run proof consumers must independently validate their own run and
// reviews. The bypass setting still comes from separately fixed UI readback,
// bound to the immutable Environment ID so same-name recreation cannot reuse it.
async function readEnvironmentConfiguration(input) {
  try {
    record(input, 'INPUT_INVALID', ['github', 'configurationReadback', 'validUntil', 'now']);
    const { github, now, validUntil } = input;
    const cfg = configurationData(input.configurationReadback, now, validUntil);
    // can_admins_bypass is NOT part of GitHub's published environment REST
    // schema. The independently fixed UI readback above supplies that setting;
    // no fictional API field/default is accepted. Caller-specific owner approval
    // must still be read independently before any credential use.
    const environment = record(await get(github, 'repos', 'getEnvironment', { environment_name: ENVIRONMENT }, 'ENVIRONMENT_READ_FAILED'), 'ENVIRONMENT_INVALID');
    record(environment.deployment_branch_policy, 'ENVIRONMENT_INVALID');
    need(environment.id === cfg.environmentId && environment.name === ENVIRONMENT
      && environment.deployment_branch_policy.protected_branches === false
      && environment.deployment_branch_policy.custom_branch_policies === true && Array.isArray(environment.protection_rules)
      && environment.protection_rules.length <= 100, 'ENVIRONMENT_INVALID');
    const environmentId = environment.id;
    let reviewers = 0;
    for (const rule of environment.protection_rules) {
      record(rule, 'ENVIRONMENT_INVALID');
      need(['required_reviewers', 'branch_policy', 'wait_timer'].includes(rule.type), 'ENVIRONMENT_INVALID');
      if (rule.type !== 'required_reviewers') continue;
      reviewers++;
      need(rule.prevent_self_review === false && Array.isArray(rule.reviewers) && rule.reviewers.length === 1, 'ENVIRONMENT_INVALID');
      const reviewer = record(rule.reviewers[0], 'ENVIRONMENT_INVALID'); record(reviewer.reviewer, 'ENVIRONMENT_INVALID');
      need(reviewer.type === 'User' && reviewer.reviewer.login === OWNER, 'ENVIRONMENT_INVALID');
    }
    need(reviewers === 1, 'ENVIRONMENT_INVALID');
    const branches = record(await get(github, 'repos', 'listDeploymentBranchPolicies', { environment_name: ENVIRONMENT, per_page: 100, page: 1 }, 'BRANCH_POLICY_READ_FAILED'), 'BRANCH_POLICY_INVALID');
    need(branches.total_count === 1 && Array.isArray(branches.branch_policies) && branches.branch_policies.length === 1, 'BRANCH_POLICY_INVALID');
    const branch = record(branches.branch_policies[0], 'BRANCH_POLICY_INVALID');
    need(branch.name === 'main' && branch.type === 'branch', 'BRANCH_POLICY_INVALID');
    clock(now, validUntil);
    return freeze({ environmentId });
  } catch (error) { if (error instanceof CacheAccessContextError) throw error; fail('INPUT_INVALID'); }
}

async function readEnvironmentApproval(input) {
  try {
    record(input, 'INPUT_INVALID', ['github', 'runId', 'headSha', 'context', 'now', 'validUntil', 'configurationReadback']);
    const context = contextData(input.context, input.context?.checkoutSha, true);
    const { github, now, validUntil, runId, headSha } = input;
    need(positive(runId) && runId === input.context.runId && sha(headSha), 'RUN_INVALID');
    const initialNow = clock(now, validUntil), expiry = timestamp(validUntil);
    const configurationReadback = configurationData(input.configurationReadback, now, validUntil);
    const run = record(await get(github, 'actions', 'getWorkflowRun', { run_id: runId }, 'RUN_READ_FAILED'), 'RUN_INVALID');
    record(run.repository, 'RUN_INVALID'); record(run.head_repository, 'RUN_INVALID');
    record(run.actor, 'RUN_INVALID'); record(run.triggering_actor, 'RUN_INVALID');
    const createdAt = timestamp(run.created_at);
    need(run.id === runId && run.repository.full_name === FULL_REPO && run.repository.fork === false
      && run.head_repository.full_name === FULL_REPO && run.head_repository.fork === false
      && run.event === 'workflow_dispatch' && run.head_branch === 'main'
      && run.head_sha === context.sha && [WORKFLOW_PATH, WORKFLOW_PATH + '@main'].includes(run.path)
      && run.actor.login === OWNER && run.triggering_actor.login === OWNER && run.run_attempt === 1
      && run.display_title === 'Homepage cache PR 2139 @ ' + headSha && run.status === 'in_progress'
      && run.conclusion === null && Number.isFinite(createdAt) && createdAt <= initialNow && expiry <= createdAt + HOUR, 'RUN_INVALID');
    const { environmentId } = await readEnvironmentConfiguration({ github, configurationReadback, now, validUntil });
    // Official endpoint: GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals
    // https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run
    // Review timestamps/run_attempt are not fields in this response. Bind its
    // exact run endpoint to attempt 1 and the independently fetched run metadata.
    const reviews = await get(github, 'actions', 'getReviewsForRun', { run_id: runId }, 'APPROVAL_READ_FAILED');
    need(Array.isArray(reviews) && reviews.length > 0 && reviews.length <= 100, 'ENVIRONMENT_NOT_APPROVED');
    let matches = 0;
    for (const review of reviews) {
      record(review, 'ENVIRONMENT_NOT_APPROVED'); record(review.user, 'ENVIRONMENT_NOT_APPROVED');
      need(Array.isArray(review.environments) && review.environments.length <= 100, 'ENVIRONMENT_NOT_APPROVED');
      for (const env of review.environments) {
        record(env, 'ENVIRONMENT_NOT_APPROVED');
        if (env.id !== environmentId && env.name !== ENVIRONMENT) continue;
        need(env.id === environmentId && env.name === ENVIRONMENT && review.state === 'approved'
          && review.user.login === OWNER, 'ENVIRONMENT_NOT_APPROVED');
        matches++;
      }
    }
    need(matches === 1, 'ENVIRONMENT_NOT_APPROVED');
    const issuedAt = clock(now, validUntil);
    need(issuedAt >= initialNow, 'APPROVAL_EXPIRED');
    const approval = freeze({ version: 1, runId, headSha, validUntil, environmentId });
    approvals.set(approval, { github, context, issuedAt });
    return approval;
  } catch (error) { if (error instanceof CacheAccessContextError) throw error; fail('INPUT_INVALID'); }
}

async function resolveCandidate(input) {
  try {
    record(input, 'INPUT_INVALID', ['github', 'context', 'checkoutSha', 'request', 'validUntil', 'now', 'approval']);
    const { github, now, validUntil, approval, checkoutSha } = input;
    const proof = approvals.get(approval);
    need(proof, 'APPROVAL_REQUIRED');
    // A capability is single-use and cannot be serialized/reconstituted by a
    // dispatch or artifact. Retry requires a fresh runtime Environment read.
    approvals.delete(approval);
    const context = contextData(input.context, checkoutSha), request = requestData(input.request);
    const time = clock(now, validUntil);
    need(proof.github === github && JSON.stringify(proof.context) === JSON.stringify(context)
      && approval.headSha === request.approvedHeadSha && approval.validUntil === validUntil
      && time >= proof.issuedAt && time - proof.issuedAt <= 60000, 'APPROVAL_MISMATCH');
    const result = await candidate({ github, context, checkoutSha, request, validUntil, now });
    const completedAt = clock(now, validUntil);
    need(completedAt >= proof.issuedAt && completedAt - proof.issuedAt <= 60000, 'APPROVAL_EXPIRED');
    const output = { authorization: result.authorization };
    Object.defineProperty(output, 'gateInput', { value: result.gateInput });
    return Object.freeze(output);
  } catch (error) { if (error instanceof CacheAccessContextError) throw error; fail('INPUT_INVALID'); }
}

module.exports = { inspectCandidate, readEnvironmentConfiguration, readEnvironmentApproval, resolveCandidate, CacheAccessContextError };
