'use strict';

// Pure admission of an existing trusted workflow's GitHub API metadata. No
// network, credentials, artifact, check-write, environment or logging access.
//
// TRUST BOUNDARY: the caller must fetch these JSON bodies from GitHub itself,
// pin expected workflowId/trustedMainSha/environmentId independently, and load
// this validator from reviewed code. Adapter envelopes identify the actual
// request route, not fields invented inside the GitHub response:
// jobs: {repository, runId, runAttempt:1, data:{total_count,jobs}} from
//   GET /repos/{repository}/actions/runs/{runId}/attempts/1/jobs
// reviews: {repository, runId, data:[...]} from
//   GET /repos/{repository}/actions/runs/{runId}/approvals
// Do not accept these envelopes, expected values or API bodies from a PR artifact.
// GitHub's review JSON has no run_id or approval timestamp. Its binding comes
// from the trusted adapter's exact API route; this pure function cannot prove
// that a caller actually used that route or independently authenticate JSON.
//
// A successful run-name alone is not proof. The pinned producer must emit the
// exact final proof job only after all response contracts pass. The caller must
// ALSO re-read the current PR and deployment and use authorizeCacheCheck for
// provider App identity, account/project/origin and exact candidate SHA. Those
// objects are intentionally outside this proof schema: this module cannot
// independently detect a forged provider check or a changed PR/deployment.
//
// API field references (not a claim of runtime readback for the future workflow):
// https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run
// https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run
// https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt
const REPOSITORY = 'simplememofast/simplememo';
const OWNER = 'simplememofast';
const ENVIRONMENT = 'preview-cache-ci';
const WORKFLOW = '.github/workflows/home-perf-cache-approved.yml';
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function need(condition) { if (!condition) throw new Error('INVALID_CACHE_PROOF'); }
function exact(pattern, value) { return typeof value === 'string' && pattern.exec(value)?.[0] === value; }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }

function record(value, keys) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  const own = Reflect.ownKeys(value);
  need(own.length <= 256);
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    need(typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
  }
  if (keys) need(own.length === keys.length && keys.every(key => Object.hasOwn(value, key)));
  return value;
}

function list(value, maximum) {
  need(Array.isArray(value) && value.length <= maximum);
  need(Reflect.ownKeys(value).length === value.length + 1);
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    need(d && d.enumerable && Object.hasOwn(d, 'value'));
  }
  return value;
}

// GitHub step examples use RFC3339 offsets, while run/job examples use UTC.
// Validate the calendar before applying the offset; Date.parse alone silently
// rolls invalid dates forward. Receipt timestamps are normalized, never echoed.
function instant(value) {
  need(typeof value === 'string' && value.length <= 29);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  need(match && match[0] === value);
  const canonical = match[1] + '.' + (match[2] || '').padEnd(3, '0') + 'Z';
  const local = Date.parse(canonical);
  need(Number.isFinite(local) && new Date(local).toISOString() === canonical);
  let offset = 0;
  if (match[3] !== 'Z') {
    const hours = Number(match[3].slice(1, 3)), minutes = Number(match[3].slice(4));
    need(hours <= 23 && minutes <= 59);
    offset = (hours * 60 + minutes) * 60000 * (match[3][0] === '+' ? 1 : -1);
  }
  return local - offset;
}

function identity(value) {
  record(value);
  need(value.full_name === REPOSITORY && value.fork === false);
}

function checkExpected(expected, now) {
  record(expected, ['candidateHeadSha', 'manifestSha256', 'deploymentId', 'workflowId',
    'trustedMainSha', 'environmentId', 'validUntil']);
  need(exact(SHA, expected.candidateHeadSha) && exact(SHA, expected.trustedMainSha)
    && exact(SHA256, expected.manifestSha256) && exact(UUID, expected.deploymentId));
  need(positive(expected.workflowId) && positive(expected.environmentId));
  need(Number.isSafeInteger(now) && now >= 0);
  need(typeof expected.validUntil === 'string' && expected.validUntil.endsWith('Z'));
  const deadline = instant(expected.validUntil);
  need(now < deadline);
  return deadline;
}

function checkRun(run, expected) {
  record(run);
  need(positive(run.id) && run.workflow_id === expected.workflowId);
  // REST examples include @main; plain paths are also used. Do not accept
  // arbitrary refs, URLs, similarly named workflows or substring matches.
  need(run.path === WORKFLOW || run.path === WORKFLOW + '@main');
  need(run.event === 'workflow_dispatch' && run.head_branch === 'main'
    && run.head_sha === expected.trustedMainSha && run.run_attempt === 1);
  need(run.status === 'completed' && run.conclusion === 'success');
  record(run.actor); record(run.triggering_actor);
  need(run.actor.login === OWNER && run.triggering_actor.login === OWNER);
  identity(run.repository); identity(run.head_repository);
  need(run.display_title === 'Homepage cache PR 2139 @ ' + expected.candidateHeadSha);
}

function checkJobs(envelope, run, expected) {
  record(envelope, ['repository', 'runId', 'runAttempt', 'data']);
  need(envelope.repository === REPOSITORY && envelope.runId === run.id && envelope.runAttempt === 1);
  record(envelope.data, ['total_count', 'jobs']);
  const jobs = list(envelope.data.jobs, 3);
  need(envelope.data.total_count === 3 && jobs.length === 3);
  const specs = [
    ['Resolve cache PR 2139 @ ' + expected.candidateHeadSha, ['Resolve reviewed candidate']],
    ['Verify reviewed cache PR 2139 @ ' + expected.candidateHeadSha, ['Authorize reviewed preview', 'Verify response contract']],
    ['Cache proof ' + expected.candidateHeadSha + ' ' + expected.manifestSha256 + ' ' + expected.deploymentId, ['Seal successful proof']],
  ];
  const ids = new Set(), names = new Map();
  for (const job of jobs) {
    record(job);
    need(positive(job.id) && !ids.has(job.id)); ids.add(job.id);
    need(typeof job.name === 'string' && job.name.length <= 256 && !names.has(job.name));
    names.set(job.name, job);
    need(job.run_id === run.id && job.head_sha === expected.trustedMainSha);
    // The public job examples omit run_attempt. Require the exact-attempt API
    // envelope above, and reject a conflicting field whenever GitHub supplies it.
    if (Object.hasOwn(job, 'run_attempt')) need(job.run_attempt === 1);
    need(job.status === 'completed' && job.conclusion === 'success');
    const steps = list(job.steps, 100);
    need(steps.length > 0);
    const numbers = new Set(), stepNames = new Set();
    for (const step of steps) {
      record(step);
      need(positive(step.number) && !numbers.has(step.number)); numbers.add(step.number);
      need(typeof step.name === 'string' && step.name.length > 0 && step.name.length <= 256 && !stepNames.has(step.name));
      stepNames.add(step.name);
      // A workflow/job may look successful despite a continue-on-error step.
      // Reject every failed, skipped, cancelled, neutral or unfinished step.
      need(step.status === 'completed' && step.conclusion === 'success');
    }
  }
  return specs.map(([name, required]) => {
    const job = names.get(name);
    need(job !== undefined);
    need(required.every(name => job.steps.some(step => step.name === name)));
    // Required verification must authorize the exact preview before its read.
    if (required.length > 1) {
      need(job.steps.find(step => step.name === required[0]).number
        < job.steps.find(step => step.name === required[1]).number);
    }
    return job;
  });
}

function checkReview(envelope, run, expected) {
  record(envelope, ['repository', 'runId', 'data']);
  need(envelope.repository === REPOSITORY && envelope.runId === run.id);
  const rows = list(envelope.data, 1);
  // Multiple/rejected/ambiguous reviews are not silently reduced to an approval.
  need(rows.length === 1);
  const review = record(rows[0]);
  need(review.state === 'approved');
  record(review.user);
  need(review.user.login === OWNER);
  const environments = list(review.environments, 1);
  need(environments.length === 1);
  record(environments[0]);
  need(environments[0].id === expected.environmentId && environments[0].name === ENVIRONMENT);
}

function checkTimes(run, jobs, now, deadline) {
  const created = instant(run.created_at), started = instant(run.run_started_at), updated = instant(run.updated_at);
  need(created >= 0 && created <= started && started <= updated && updated <= now && updated < deadline);
  let previousEnd = started;
  for (const job of jobs) {
    const start = instant(job.started_at), end = instant(job.completed_at);
    need(previousEnd <= start && start <= end && end <= updated && end < deadline);
    const steps = [...job.steps].sort((a, b) => a.number - b.number);
    let previousStepEnd = start;
    for (const step of steps) {
      const stepStart = instant(step.started_at), stepEnd = instant(step.completed_at);
      need(previousStepEnd <= stepStart && stepStart <= stepEnd && stepEnd <= end);
      previousStepEnd = stepEnd;
    }
    previousEnd = end;
  }
  // Workflow runs expose updated_at, not a reliable completed_at field. The
  // last dependent proof job's completed_at supplies the completion bound.
  return previousEnd;
}

function verifyCacheProof(input) {
  const result = { version: 1, verified: false,
    checks: { input: false, run: false, jobs: false, review: false, time: false }, bound: null };
  try {
    record(input, ['run', 'jobs', 'reviews', 'expected', 'now']);
    const { run, jobs, reviews, expected, now } = input;
    const deadline = checkExpected(expected, now);
    result.checks.input = true;
    checkRun(run, expected); result.checks.run = true;
    const orderedJobs = checkJobs(jobs, run, expected); result.checks.jobs = true;
    checkReview(reviews, run, expected); result.checks.review = true;
    const completed = checkTimes(run, orderedJobs, now, deadline); result.checks.time = true;
    result.bound = {
      run_id: run.id, run_attempt: 1, workflow_id: expected.workflowId, environment_id: expected.environmentId,
      candidate_head_sha: expected.candidateHeadSha, manifest_sha256: expected.manifestSha256,
      deployment_id: expected.deploymentId, trusted_main_sha: expected.trustedMainSha,
      completed_at: new Date(completed).toISOString(), valid_until: new Date(deadline).toISOString(),
    };
    result.verified = true;
  } catch {
    // Never reflect native exceptions, response strings, comments or URLs.
  }
  return result;
}

module.exports = { verifyCacheProof };
