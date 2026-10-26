import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyViewportReuse, viewportMatrixDigest, MAX_VIEWPORT_REUSE_AGE_MS } from './lib/viewport-reuse.mjs';

// Fabricated metadata and measurements only; no API, browser, filesystem or CI.
const digest = text => createHash('sha256').update(text).digest('hex');
const sha = c => c.repeat(40), hex = c => c.repeat(64);
const createdAt = '2026-10-26T01:00:00Z', startedAt = '2026-10-26T01:01:00Z';
const measuredAt = '2026-10-26T01:10:00Z', completedAt = '2026-10-26T01:11:00Z';
const groups = ['blink_deep', 'blink_sweep', 'webkit'];
function fixture() {
  const matrix = Object.fromEntries(groups.map(g => [g, [`${g}:/@320`, `${g}:/en/@390`]]));
  const expected = { repository: 'simplememofast/simplememo', pullRequestNumber: 3000,
    headSha: sha('a'), baseSha: sha('b'), mergeSha: sha('c'), mergeTreeSha: sha('d'),
    workflowId: 10, workflowPath: '.github/workflows/viewport-full.yml', workflowSourceSha: sha('b'),
    digests: { checker: hex('1'), dependencies: hex('2'), matrix: viewportMatrixDigest(matrix),
      browser: hex('3'), toolchain: hex('4') }, matrix, maxAgeMs: 3_600_000 };
  const run = { id: 100, number: 12, attempt: 1, pullRequestNumber: expected.pullRequestNumber,
    repository: expected.repository, repositoryFork: false, headRepository: expected.repository,
    headRepositoryFork: false, headSha: expected.headSha, event: 'pull_request',
    workflowId: expected.workflowId, workflowPath: expected.workflowPath,
    workflowSourceSha: expected.workflowSourceSha, sourceRepository: expected.repository,
    sourceFork: false, status: 'completed', conclusion: 'success', createdAt, startedAt, completedAt };
  const receipt = { version: 1, scope: 'full-viewport', source: { repository: expected.repository,
    runId: run.id, runAttempt: run.attempt, workflowId: expected.workflowId,
    workflowPath: expected.workflowPath, workflowSourceSha: expected.workflowSourceSha },
  target: { pullRequestNumber: expected.pullRequestNumber, headSha: expected.headSha,
    baseSha: expected.baseSha, mergeSha: expected.mergeSha, mergeTreeSha: expected.mergeTreeSha,
    mergeParents: [expected.baseSha, expected.headSha] }, digests: { ...expected.digests }, measuredAt,
  staticProblems: 0, groups: Object.fromEntries(groups.map(g => [g, { expected: 2, measured: 2,
    complete: true, failures: 0, problems: 0, unmeasured: 0, cases: [...matrix[g]] }])) };
  const input = { expected, runList: { totalCount: 1, items: [run] }, currentRun: { ...run },
    artifactList: { totalCount: 1, items: [{ id: 200, name: 'viewport-full-receipt', repository: expected.repository,
      runId: run.id, runAttempt: run.attempt, expired: false,
      archiveSha256: hex('5'), downloadSha256: hex('5'), receiptSha256: '' }] },
    receiptText: '', now: Date.parse('2026-10-26T01:15:00Z') };
  return { input, receipt, seal() { input.receiptText = JSON.stringify(receipt) + '\n';
    input.artifactList.items[0].receiptSha256 = digest(input.receiptText); return input; } };
}
function fails(input, reason) {
  const result = verifyViewportReuse(input);
  assert.deepEqual(result, { reuseEligible: false, reason, bound: null });
  assert.equal(Object.isFrozen(result), true);
}
function editRun(f, key, value) { f.input.runList.items[0][key] = value; f.input.currentRun[key] = value; }

test('matching full evidence is eligible without mutating inputs or authorizing any other gate', () => {
  const f = fixture(), input = f.seal(), before = structuredClone(input);
  const out = verifyViewportReuse(input);
  assert.equal(out.reuseEligible, true); assert.equal(out.bound.measuredCases, 6);
  assert.equal(out.bound.validUntil, '2026-10-26T02:00:00.000Z');
  assert.deepEqual(input, before); assert.equal(Object.isFrozen(out.bound), true);
  assert.deepEqual(Object.keys(out), ['reuseEligible', 'reason', 'bound']);
});

for (const [field, value] of [['pullRequestNumber', 3001], ['headSha', sha('e')],
  ['baseSha', sha('e')], ['mergeSha', sha('e')], ['mergeTreeSha', sha('e')]]) {
  test(`rejects a receipt for another ${field}`, () => {
    const f = fixture(); f.receipt.target[field] = value;
    fails(f.seal(), `TARGET_${field.toUpperCase()}_MISMATCH`);
  });
}
test('same head and tree do not authorize a different main or reversed merge parents', () => {
  const f = fixture(); f.input.expected.baseSha = sha('f');
  fails(f.seal(), 'TARGET_BASESHA_MISMATCH');
  const g = fixture(); g.receipt.target.mergeParents.reverse();
  fails(g.seal(), 'MERGE_PARENTS_MISMATCH');
});
for (const field of ['checker', 'dependencies', 'matrix', 'browser', 'toolchain']) {
  test(`rejects changed ${field} verification version`, () => {
    const f = fixture(); f.receipt.digests[field] = hex('e');
    fails(f.seal(), `VERSION_${field.toUpperCase()}_MISMATCH`);
  });
}
test('matrix digest is derived from the exact complete case set, not an unverified label', () => {
  const f = fixture(); f.input.expected.matrix.webkit.push('webkit:/other/@320');
  fails(f.seal(), 'MATRIX_DIGEST_MISMATCH');
  const g = fixture(); g.input.expected.matrix.webkit[1] = g.input.expected.matrix.webkit[0];
  fails(g.seal(), 'MATRIX_INVALID');
  const h = fixture(), reversed = structuredClone(h.input.expected.matrix);
  for (const cases of Object.values(reversed)) cases.reverse();
  assert.equal(viewportMatrixDigest(reversed), h.input.expected.digests.matrix);
});
for (const [field, value, reason] of [
  ['repository', 'other/repo', 'RUN_SOURCE_UNTRUSTED'],
  ['headRepository', 'other/repo', 'RUN_SOURCE_UNTRUSTED'],
  ['sourceRepository', 'other/repo', 'RUN_SOURCE_UNTRUSTED'],
  ['repositoryFork', true, 'RUN_SOURCE_UNTRUSTED'],
  ['headRepositoryFork', true, 'RUN_SOURCE_UNTRUSTED'],
  ['sourceFork', true, 'RUN_SOURCE_UNTRUSTED'],
  ['event', 'push', 'RUN_SCOPE_MISMATCH'],
  ['headSha', sha('e'), 'RUN_SCOPE_MISMATCH'],
  ['pullRequestNumber', 3001, 'RUN_SCOPE_MISMATCH'],
  ['workflowId', 11, 'RUN_SCOPE_MISMATCH'],
  ['workflowPath', '.github/workflows/other.yml', 'RUN_SCOPE_MISMATCH'],
  ['workflowSourceSha', sha('e'), 'WORKFLOW_SOURCE_MISMATCH'],
]) {
  test(`rejects untrusted or unrelated run ${field}`, () => {
    const f = fixture(); editRun(f, field, value); fails(f.seal(), reason);
  });
}
test('latest selection cannot fall back past pending, failed, cancelled, skipped or neutral evidence', () => {
  for (const [status, conclusion, reason] of [['in_progress', null, 'LATEST_RUN_PENDING'],
    ['queued', null, 'LATEST_RUN_PENDING'], ['completed', 'failure', 'LATEST_RUN_FAILED'],
    ['completed', 'cancelled', 'LATEST_RUN_FAILED'], ['completed', 'skipped', 'LATEST_RUN_FAILED'],
    ['completed', 'neutral', 'LATEST_RUN_FAILED']]) {
    const f = fixture();
    const newer = { ...f.input.currentRun, id: 101, number: 13, createdAt: '2026-10-26T01:12:00Z',
      startedAt: '2026-10-26T01:13:00Z', completedAt: null, status, conclusion };
    f.input.runList.items.unshift(newer); f.input.runList.totalCount++;
    f.input.currentRun = { ...newer };
    fails(f.seal(), reason);
  }
});
test('equal creation time uses run number, not API order or an older successful artifact', () => {
  const f = fixture(), newer = { ...f.input.currentRun, id: 101, number: 13, conclusion: 'failure' };
  f.input.runList.items.push(newer); f.input.runList.totalCount++;
  f.input.currentRun = { ...newer }; fails(f.seal(), 'LATEST_RUN_FAILED');
});
test('a fresh direct read detects changed run attempt or status', () => {
  for (const [key, value] of [['attempt', 2], ['status', 'queued'], ['conclusion', 'failure']]) {
    const f = fixture(); f.input.currentRun[key] = value; fails(f.seal(), 'RUN_CHANGED');
  }
});
test('latest successful attempt needs its own receipt and artifact, never the older attempt', () => {
  const f = fixture(); editRun(f, 'attempt', 2); fails(f.seal(), 'ARTIFACT_SOURCE_MISMATCH');
  f.input.artifactList.items[0].runAttempt = 2; fails(f.seal(), 'RECEIPT_SOURCE_MISMATCH');
  f.receipt.source.runAttempt = 2; assert.equal(verifyViewportReuse(f.seal()).reuseEligible, true);
});
test('missing, truncated, oversized, duplicate and sparse run lists fail closed', () => {
  const empty = fixture(); empty.input.runList = { totalCount: 0, items: [] }; fails(empty.seal(), 'RUN_MISSING');
  const truncated = fixture(); truncated.input.runList.totalCount = 2; fails(truncated.seal(), 'RUN_LIST_INCOMPLETE');
  const duplicate = fixture(); duplicate.input.runList.items.push({ ...duplicate.input.currentRun });
  duplicate.input.runList.totalCount = 2; fails(duplicate.seal(), 'RUN_DUPLICATE');
  const tooMany = fixture(); tooMany.input.runList.items = Array(101).fill(tooMany.input.currentRun);
  tooMany.input.runList.totalCount = 101; fails(tooMany.seal(), 'RUN_LIST_INVALID');
  const sparse = fixture(); sparse.input.runList.items.length = 2; sparse.input.runList.totalCount = 2;
  fails(sparse.seal(), 'RUN_LIST_INVALID');
});
for (const [field, value, reason] of [
  ['repository', 'other/repo', 'ARTIFACT_SOURCE_MISMATCH'], ['runId', 99, 'ARTIFACT_SOURCE_MISMATCH'],
  ['runAttempt', 2, 'ARTIFACT_SOURCE_MISMATCH'], ['expired', true, 'ARTIFACT_UNAVAILABLE'],
  ['name', 'viewport-smoke-receipt', 'ARTIFACT_MISSING'],
  ['downloadSha256', hex('6'), 'ARTIFACT_DIGEST_MISMATCH'],
]) {
  test(`artifact ${field} cannot detach receipt from its source`, () => {
    const f = fixture(); const input = f.seal(); input.artifactList.items[0][field] = value; fails(input, reason);
  });
}
test('payload tampering, invalid JSON and duplicate keys fail even with a claimed good digest', () => {
  const f = fixture(), input = f.seal(); input.receiptText += ' '; fails(input, 'RECEIPT_DIGEST_MISMATCH');
  for (const [text, reason] of [['{broken\n', 'RECEIPT_INVALID'],
    [f.input.receiptText.replace('"version":1', '"version":0,"version":1'), 'RECEIPT_NONCANONICAL'],
    [JSON.stringify(f.receipt, null, 2) + '\n', 'RECEIPT_NONCANONICAL']]) {
    const g = fixture(), i = g.seal(); i.receiptText = text; i.artifactList.items[0].receiptSha256 = digest(text); fails(i, reason);
  }
});
test('artifact selection rejects missing, incomplete, duplicate or ambiguous listings', () => {
  // The fixture sealer needs a payload digest; remove the artifact only afterwards.
  const base = fixture(), empty = base.seal(); empty.artifactList = { totalCount: 0, items: [] };
  fails(empty, 'ARTIFACT_MISSING');
  const incomplete = fixture(), i = incomplete.seal(); i.artifactList.totalCount = 2;
  fails(i, 'ARTIFACT_LIST_INCOMPLETE');
  const duplicate = fixture(), d = duplicate.seal();
  d.artifactList.items.push({ ...d.artifactList.items[0] }); d.artifactList.totalCount = 2;
  fails(d, 'ARTIFACT_DUPLICATE');
  const ambiguous = fixture(), a = ambiguous.seal();
  a.artifactList.items.push({ ...a.artifactList.items[0], id: 201 }); a.artifactList.totalCount = 2;
  fails(a, 'ARTIFACT_AMBIGUOUS');
});
test('receipt source and scope must describe full viewport from the selected trusted workflow', () => {
  const f = fixture(); f.receipt.scope = 'smoke'; fails(f.seal(), 'RECEIPT_SCOPE_MISMATCH');
  for (const [key, value] of [['runId', 99], ['runAttempt', 2], ['workflowId', 11],
    ['workflowSourceSha', sha('e')], ['repository', 'other/repo']]) {
    const g = fixture(); g.receipt.source[key] = value; fails(g.seal(), 'RECEIPT_SOURCE_MISMATCH');
  }
});
for (const group of groups) {
  test(`${group} cannot hide problems, failures, missing cases or duplicate cases`, () => {
    for (const [field, value] of [['complete', false], ['failures', 1], ['problems', 1], ['unmeasured', 1]]) {
      const f = fixture(); f.receipt.groups[group][field] = value; fails(f.seal(), 'GROUP_NOT_HEALTHY');
    }
    for (const edit of [g => { g.measured--; }, g => { g.expected--; }, g => { g.cases.pop(); },
      g => { g.cases[1] = g.cases[0]; }, g => { g.cases[1] = 'other-case'; }]) {
      const f = fixture(); edit(f.receipt.groups[group]); fails(f.seal(), 'GROUP_COVERAGE_MISMATCH');
    }
    const missing = fixture(); delete missing.receipt.groups[group]; fails(missing.seal(), 'GROUPS_INVALID');
  });
}
test('static defects and missing static evidence cannot become zero', () => {
  for (const value of [1, null, '0', false]) {
    const f = fixture(); f.receipt.staticProblems = value; fails(f.seal(), 'STATIC_PROBLEMS');
  }
});
test('freshness is bounded from original run creation and expires at the boundary', () => {
  const f = fixture(); f.input.now = Date.parse(createdAt) + f.input.expected.maxAgeMs - 1;
  assert.equal(verifyViewportReuse(f.seal()).reuseEligible, true);
  f.input.now++; fails(f.seal(), 'RECEIPT_STALE');
  for (const value of [0, -1, Infinity, MAX_VIEWPORT_REUSE_AGE_MS + 1]) {
    const g = fixture(); g.input.expected.maxAgeMs = value; fails(g.seal(), 'EXPECTED_INVALID');
  }
});
test('future, impossible, noncanonical and out-of-run measurements are rejected', () => {
  for (const [field, value] of [['createdAt', '2026-10-26T02:00:00Z'],
    ['startedAt', '2026-10-26T00:59:00Z'], ['completedAt', '2026-10-26T02:00:00Z'],
    ['completedAt', '2026-02-30T01:11:00Z'], ['createdAt', '2026-10-26T01:00:00+00:00']]) {
    const f = fixture(); editRun(f, field, value); fails(f.seal(), 'RUN_TIME_INVALID');
  }
  for (const time of ['2026-10-26T01:00:00Z', '2026-10-26T01:12:00Z']) {
    const f = fixture(); f.receipt.measuredAt = time; fails(f.seal(), 'MEASUREMENT_TIME_INVALID');
  }
});
test('malformed inputs, extra authority fields and accessors fail without invoking accessors', () => {
  for (const input of [null, [], {}, { expected: {} }]) fails(input, 'INPUT_INVALID');
  const f = fixture(), input = f.seal(); input.authorized = true; fails(input, 'INPUT_INVALID');
  const g = fixture(), i = g.seal(); let called = false;
  Object.defineProperty(i.expected, 'headSha', { enumerable: true, get() { called = true; return sha('a'); } });
  fails(i, 'EXPECTED_INVALID'); assert.equal(called, false);
});
