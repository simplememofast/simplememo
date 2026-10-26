import { createHash } from 'node:crypto';

// Preparatory, pure validation only: no API, filesystem, workflow or merge action.
// expected must come from trusted, fresh head/base/actual merge-tree observations.
// A FUTURE trusted adapter must authenticate a complete run list + direct run,
// establish the actual workflow source, verify downloaded archive bytes against
// the provider digest, and derive receiptText FROM THAT SAME archive. Comparing
// the normalized digests below does not implement or authenticate that transport.
// A true result is conditional viewport-reuse eligibility, never permission to
// skip a gate, approve credentials, merge, or reuse the PR2175 cache proof.

export const MAX_VIEWPORT_REUSE_AGE_MS = 24 * 60 * 60 * 1000;
const GROUPS = ['blink_deep', 'blink_sweep', 'webkit'];
const DIGESTS = ['checker', 'dependencies', 'matrix', 'browser', 'toolchain'];
const MAX_CASES = 50_000, MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
const EXPECTED = ['repository', 'pullRequestNumber', 'headSha', 'baseSha', 'mergeSha',
  'mergeTreeSha', 'workflowId', 'workflowPath', 'workflowSourceSha', 'digests', 'matrix', 'maxAgeMs'];
const RUN = ['id', 'number', 'attempt', 'pullRequestNumber', 'repository', 'repositoryFork',
  'headRepository', 'headRepositoryFork', 'headSha', 'event', 'workflowId', 'workflowPath',
  'workflowSourceSha', 'sourceRepository', 'sourceFork', 'status', 'conclusion',
  'createdAt', 'startedAt', 'completedAt'];
const SOURCE = ['repository', 'runId', 'runAttempt', 'workflowId', 'workflowPath', 'workflowSourceSha'];
const TARGET = ['pullRequestNumber', 'headSha', 'baseSha', 'mergeSha', 'mergeTreeSha', 'mergeParents'];
const ARTIFACT = ['id', 'name', 'repository', 'runId', 'runAttempt', 'expired',
  'archiveSha256', 'downloadSha256', 'receiptSha256'];
const GROUP = ['expected', 'measured', 'complete', 'failures', 'problems', 'unmeasured', 'cases'];
const sha1 = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const sha256 = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const positive = x => Number.isSafeInteger(x) && x > 0;
const hash = x => createHash('sha256').update(x).digest('hex');
class ReuseError extends Error {}
function need(ok, reason) { if (!ok) throw new ReuseError(reason); }
function record(value, keys, reason) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), reason);
  const own = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  need(own.length === keys.length && keys.every(k => own.includes(k)
    && descriptors[k].enumerable && Object.hasOwn(descriptors[k], 'value')), reason);
  return value;
}
function array(value, max, reason) {
  need(Array.isArray(value) && value.length <= max, reason);
  const own = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  need(own.length === value.length + 1, reason);
  for (let i = 0; i < value.length; i++) need(descriptors[i]?.enumerable
    && Object.hasOwn(descriptors[i], 'value'), reason);
  return value;
}
function instant(value, reason) {
  need(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value), reason);
  const ms = Date.parse(value);
  need(Number.isSafeInteger(ms) && ms >= 0
    && new Date(ms).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z')), reason);
  return ms;
}
function matrixValue(matrix) {
  record(matrix, GROUPS, 'MATRIX_INVALID');
  let total = 0;
  const normalized = {};
  for (const group of GROUPS) {
    const cases = array(matrix[group], MAX_CASES, 'MATRIX_INVALID');
    need(cases.length > 0 && cases.every(x => typeof x === 'string' && x.length > 0
      && x.length <= 512 && !/[\u0000-\u001f\u007f]/.test(x))
      && new Set(cases).size === cases.length, 'MATRIX_INVALID');
    total += cases.length;
    normalized[group] = [...cases].sort();
  }
  need(total <= MAX_CASES, 'MATRIX_INVALID');
  return normalized;
}

// Case identifiers are inert strings derived by a trusted matrix selector.
// The producer and verifier must use this same order-independent encoding.
export function viewportMatrixDigest(matrix) { return hash(JSON.stringify(matrixValue(matrix))); }

export function verifyViewportReuse(input) {
  try {
    record(input, ['expected', 'runList', 'currentRun', 'artifactList', 'receiptText', 'now'], 'INPUT_INVALID');
    const { expected: e, runList, currentRun, artifactList, receiptText, now } = input;
    record(e, EXPECTED, 'EXPECTED_INVALID');
    need(e.repository === 'simplememofast/simplememo' && positive(e.pullRequestNumber)
      && ['headSha', 'baseSha', 'mergeSha', 'mergeTreeSha', 'workflowSourceSha'].every(k => sha1(e[k]))
      && positive(e.workflowId) && typeof e.workflowPath === 'string'
      && /^\.github\/workflows\/[a-z0-9-]+\.ya?ml$/.test(e.workflowPath)
      && positive(e.maxAgeMs) && e.maxAgeMs <= MAX_VIEWPORT_REUSE_AGE_MS, 'EXPECTED_INVALID');
    need(Number.isSafeInteger(now) && now >= 0, 'CLOCK_INVALID');
    record(e.digests, DIGESTS, 'DIGESTS_INVALID');
    need(DIGESTS.every(k => sha256(e.digests[k])), 'DIGESTS_INVALID');
    const matrix = matrixValue(e.matrix);
    need(viewportMatrixDigest(matrix) === e.digests.matrix, 'MATRIX_DIGEST_MISMATCH');

    // The future adapter must not filter for success or hide a newer run. This
    // bounded collection is the complete expected PR/head/workflow scope.
    record(runList, ['totalCount', 'items'], 'RUN_LIST_INVALID');
    const runs = array(runList.items, 100, 'RUN_LIST_INVALID');
    need(Number.isSafeInteger(runList.totalCount) && runList.totalCount === runs.length, 'RUN_LIST_INCOMPLETE');
    need(runs.length > 0, 'RUN_MISSING');
    const ids = new Set(), numbers = new Set(), ordered = [];
    for (const r of runs) {
      record(r, RUN, 'RUN_INVALID');
      need(positive(r.id) && positive(r.number) && positive(r.attempt)
        && sha1(r.workflowSourceSha), 'RUN_INVALID');
      need(!ids.has(r.id) && !numbers.has(r.number), 'RUN_DUPLICATE');
      ids.add(r.id); numbers.add(r.number);
      need(r.repository === e.repository && r.headRepository === e.repository
        && r.sourceRepository === e.repository && r.repositoryFork === false
        && r.headRepositoryFork === false && r.sourceFork === false, 'RUN_SOURCE_UNTRUSTED');
      need(r.pullRequestNumber === e.pullRequestNumber && r.headSha === e.headSha
        && r.event === 'pull_request' && r.workflowId === e.workflowId
        && r.workflowPath === e.workflowPath, 'RUN_SCOPE_MISMATCH');
      const created = instant(r.createdAt, 'RUN_TIME_INVALID');
      need(created <= now, 'RUN_TIME_INVALID');
      ordered.push({ run: r, created });
    }
    ordered.sort((a, b) => b.created - a.created || b.run.number - a.run.number);
    const { run, created } = ordered[0];
    record(currentRun, RUN, 'RUN_READBACK_INVALID');
    need(RUN.every(k => currentRun[k] === run[k]), 'RUN_CHANGED');
    need(run.workflowSourceSha === e.workflowSourceSha, 'WORKFLOW_SOURCE_MISMATCH');
    need(run.status === 'completed', 'LATEST_RUN_PENDING');
    need(run.conclusion === 'success', 'LATEST_RUN_FAILED');
    const started = instant(run.startedAt, 'RUN_TIME_INVALID');
    const completed = instant(run.completedAt, 'RUN_TIME_INVALID');
    need(created <= started && started <= completed && completed <= now, 'RUN_TIME_INVALID');
    const validUntil = created + e.maxAgeMs;
    need(Number.isSafeInteger(validUntil) && now < validUntil, 'RECEIPT_STALE');

    record(artifactList, ['totalCount', 'items'], 'ARTIFACT_LIST_INVALID');
    const artifacts = array(artifactList.items, 100, 'ARTIFACT_LIST_INVALID');
    need(Number.isSafeInteger(artifactList.totalCount)
      && artifactList.totalCount === artifacts.length, 'ARTIFACT_LIST_INCOMPLETE');
    const artifactIds = new Set(), matching = [];
    for (const item of artifacts) {
      record(item, ARTIFACT, 'ARTIFACT_INVALID');
      need(positive(item.id) && typeof item.name === 'string' && item.name.length > 0
        && item.name.length <= 200, 'ARTIFACT_INVALID');
      need(!artifactIds.has(item.id), 'ARTIFACT_DUPLICATE'); artifactIds.add(item.id);
      need(item.repository === e.repository && item.runId === run.id
        && item.runAttempt === run.attempt, 'ARTIFACT_SOURCE_MISMATCH');
      if (item.name === 'viewport-full-receipt') matching.push(item);
    }
    need(matching.length === 1, matching.length ? 'ARTIFACT_AMBIGUOUS' : 'ARTIFACT_MISSING');
    const a = matching[0];
    need(a.expired === false, 'ARTIFACT_UNAVAILABLE');
    need(sha256(a.archiveSha256) && sha256(a.downloadSha256) && sha256(a.receiptSha256), 'ARTIFACT_DIGEST_INVALID');
    need(a.archiveSha256 === a.downloadSha256, 'ARTIFACT_DIGEST_MISMATCH');
    need(typeof receiptText === 'string' && Buffer.byteLength(receiptText) > 0
      && Buffer.byteLength(receiptText) <= MAX_RECEIPT_BYTES, 'RECEIPT_INVALID');
    need(hash(receiptText) === a.receiptSha256, 'RECEIPT_DIGEST_MISMATCH');
    let receipt;
    try { receipt = JSON.parse(receiptText); } catch { throw new ReuseError('RECEIPT_INVALID'); }
    // Canonical JSON rejects duplicate keys and non-finite/ambiguous encodings.
    need(JSON.stringify(receipt) + '\n' === receiptText, 'RECEIPT_NONCANONICAL');
    record(receipt, ['version', 'scope', 'source', 'target', 'digests', 'measuredAt',
      'staticProblems', 'groups'], 'RECEIPT_INVALID');
    need(receipt.version === 1 && receipt.scope === 'full-viewport', 'RECEIPT_SCOPE_MISMATCH');
    record(receipt.source, SOURCE, 'RECEIPT_SOURCE_INVALID');
    const source = { repository: e.repository, runId: run.id, runAttempt: run.attempt,
      workflowId: e.workflowId, workflowPath: e.workflowPath, workflowSourceSha: e.workflowSourceSha };
    need(SOURCE.every(k => receipt.source[k] === source[k]), 'RECEIPT_SOURCE_MISMATCH');
    record(receipt.target, TARGET, 'RECEIPT_TARGET_INVALID');
    for (const k of TARGET.filter(k => k !== 'mergeParents')) need(receipt.target[k] === e[k], `TARGET_${k.toUpperCase()}_MISMATCH`);
    const parents = array(receipt.target.mergeParents, 2, 'MERGE_PARENTS_INVALID');
    need(parents.length === 2 && parents[0] === e.baseSha && parents[1] === e.headSha, 'MERGE_PARENTS_MISMATCH');
    record(receipt.digests, DIGESTS, 'RECEIPT_DIGESTS_INVALID');
    for (const k of DIGESTS) need(receipt.digests[k] === e.digests[k], `VERSION_${k.toUpperCase()}_MISMATCH`);
    const measured = instant(receipt.measuredAt, 'MEASUREMENT_TIME_INVALID');
    need(started <= measured && measured <= completed, 'MEASUREMENT_TIME_INVALID');
    need(receipt.staticProblems === 0, 'STATIC_PROBLEMS');
    record(receipt.groups, GROUPS, 'GROUPS_INVALID');
    let measuredCases = 0;
    for (const name of GROUPS) {
      const g = record(receipt.groups[name], GROUP, 'GROUP_INVALID');
      need(g.complete === true && g.failures === 0 && g.problems === 0 && g.unmeasured === 0, 'GROUP_NOT_HEALTHY');
      const cases = array(g.cases, MAX_CASES, 'GROUP_COVERAGE_MISMATCH');
      need(g.expected === matrix[name].length && g.measured === g.expected
        && cases.length === g.expected && new Set(cases).size === cases.length
        && cases.every(k => typeof k === 'string')
        && [...cases].sort().every((k, i) => k === matrix[name][i]), 'GROUP_COVERAGE_MISMATCH');
      measuredCases += cases.length;
    }
    return Object.freeze({ reuseEligible: true, reason: 'MATCHED_FULL_VIEWPORT_EVIDENCE',
      bound: Object.freeze({ sourceRunId: run.id, sourceAttempt: run.attempt,
        artifactId: a.id, artifactSha256: a.archiveSha256, receiptSha256: a.receiptSha256,
        headSha: e.headSha, baseSha: e.baseSha, mergeSha: e.mergeSha, mergeTreeSha: e.mergeTreeSha,
        workflowSourceSha: e.workflowSourceSha, measuredCases, measuredAt: receipt.measuredAt,
        validUntil: new Date(validUntil).toISOString() }) });
  } catch (error) {
    return Object.freeze({ reuseEligible: false,
      reason: error instanceof ReuseError ? error.message : 'INPUT_INVALID', bound: null });
  }
}
