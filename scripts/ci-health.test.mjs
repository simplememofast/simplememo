import test from 'node:test';
import assert from 'node:assert/strict';
import { collect, summarize } from './ci-health.mjs';

const run = { databaseId: 1, workflowName: 'checks', headSha: 'abc', conclusion: 'success',
  attempt: 2, createdAt: '2026-09-07T00:00:00Z', url: 'https://example.test/1' };

test('only observed failed attempts on the same SHA qualify as rerun candidates', () => {
  for (const previous of [[], [{ conclusion: 'cancelled', head_sha: 'abc', run_attempt: 1 }],
    [{ conclusion: 'failure', head_sha: 'different', run_attempt: 1 }]]) {
    assert.equal(summarize([run], {}, { 1: previous }).rerunCandidates.length, 0);
  }
  assert.equal(summarize([run], {}, { 1: [
    { conclusion: 'failure', head_sha: 'abc', run_attempt: 1 },
  ] }).rerunCandidates.length, 1);
});

test('failed jobs without step results remain visible; pending is not success', () => {
  const report = summarize([{ ...run, conclusion: 'failure' },
    { ...run, databaseId: 2, createdAt: '2026-09-08T00:00:00Z', conclusion: '' }],
  { 1: { jobs: [{ name: 'runner setup', conclusion: 'failure' }] } }, {});
  assert.deepEqual(report.failures[0].jobs, ['runner setup']);
  assert.equal(report.workflows[0].latest.conclusion, 'pending');
});

test('read failure aborts instead of producing a healthy report', () => {
  assert.throws(() => collect('simplememofast/simplememo', 10, args => {
    if (args[1] === 'list') return [{ ...run, conclusion: 'failure' }];
    throw new Error('read denied');
  }), /read denied/);
});

test('collector reads attempt history but never dispatches or retries', () => {
  const calls = [];
  const report = collect('simplememofast/simplememo-ios', 20, args => {
    calls.push(args);
    return args[1] === 'list' ? [run] : { conclusion: 'failure', head_sha: 'abc', run_attempt: 1 };
  });
  assert.equal(report.rerunCandidates.length, 1);
  assert.deepEqual(calls.map(a => a.slice(0, 2)), [['run', 'list'], ['api',
    'repos/simplememofast/simplememo-ios/actions/runs/1/attempts/1']]);
  assert.throws(() => collect('someone/other'), /Unsupported/);
  assert.throws(() => collect('simplememofast/simplememo', NaN), /Limit/);
});
