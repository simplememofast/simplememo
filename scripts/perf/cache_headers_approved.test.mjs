import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

// Candidate integration tests: do not include this file in the independent
// trusted-producer bootstrap, whose existing cache workflow remains unchanged.
const workflow = fs.readFileSync(new URL('../../.github/workflows/home-perf-cache.yml', import.meta.url), 'utf8');
const candidate = workflow.split('  candidate-regressions:\n')[1]?.split('\n  cache-contract:')[0];
const consumer = workflow.split('\n  cache-contract:\n')[1];
const approved = "github.event_name == 'pull_request' && github.event.pull_request.number == 2164";
const ordinary = "github.event_name != 'pull_request' || github.event.pull_request.number != 2164";
function step(name) {
  const start = consumer.indexOf('      - name: ' + name + '\n');
  assert.ok(start >= 0, name);
  const end = consumer.indexOf('\n      - ', start + 1);
  return consumer.slice(start, end < 0 ? undefined : end);
}
function source(name) {
  const lines = step(name).split('          script: |\n')[1];
  assert.ok(lines, name);
  return lines.split('\n').map(line => line.replace(/^            /, '')).join('\n');
}

test('candidate code runs on a separate read-only runner and its failure blocks the existing cache job', () => {
  assert.ok(candidate && consumer);
  assert.match(candidate, /permissions:\n      contents: read/);
  assert.match(candidate, /node --test scripts\/perf\/cache_headers\*\.test\.mjs scripts\/perf\/cache_access\*\.test\.cjs/);
  assert.match(consumer, /^    needs: candidate-regressions\n/);
  assert.match(consumer, /^    needs: candidate-regressions\n    if: \$\{\{ always\(\) \}\}/);
  assert.doesNotMatch(consumer, /continue-on-error|node --test/);
  assert.doesNotMatch(workflow, /secrets\.|environment:|pull_request_target:|:\s*write\b/);
});

test('failed, cancelled or skipped candidate regressions fail the existing required check explicitly', () => {
  const guard = step('Require successful candidate regressions');
  assert.match(guard, /CANDIDATE_RESULT: \$\{\{ needs\.candidate-regressions\.result \}\}/);
  assert.ok(consumer.indexOf(guard) < consumer.indexOf('      - name: Resolve trusted main verifier'));
  const script = guard.match(/^        run: (.+)$/m)?.[1];
  assert.ok(script);
  for (const value of ['success', 'failure', 'cancelled', 'skipped', '']) {
    const result = spawnSync('/bin/sh', ['-c', script], { env: { CANDIDATE_RESULT: value } });
    assert.equal(result.error, undefined);
    assert.equal(result.status === 0, value === 'success', value);
  }
});

test('the approved consumer checks out measured immutable main and has no fallback to candidate code', () => {
  assert.match(step('Checkout trusted main verifier'), /ref: \$\{\{ steps\.trusted\.outputs\.sha \}\}/);
  assert.ok(step('Checkout trusted main verifier').includes('if: ' + approved));
  assert.ok(step('Checkout public cache target').includes('if: ' + ordinary));
  assert.match(step('Record verifier checkout'), /git rev-parse HEAD/);
  assert.match(step('Verify approved preview proof'), /checkoutSha: process\.env\.TRUSTED_CHECKOUT_SHA/);
  assert.doesNotMatch(step('Verify approved preview proof'), /inputs\.|head\.ref|download-artifact/);
});

test('production and other PRs retain real response checks; PR 2164 requires complete successful proof', () => {
  for (const name of ['Resolve the exact successful deployment', 'Install pinned browser client', 'Verify real response bodies and cache policies']) {
    assert.ok(step(name).includes('if: ' + ordinary));
  }
  assert.ok(step('Verify approved preview proof').includes('if: ' + approved));
  assert.match(step('Verify approved preview proof'), /receipt\.verified !== true\) core\.setFailed/);
  assert.match(step('Verify real response bodies and cache policies'), /node scripts\/perf\/cache_headers\.cjs/);
  assert.match(step('Resolve the exact successful deployment'), /https:\/\/simplememofast\.com/);
});

async function resolve(response, thrown) {
  const outputs = [], failures = [], calls = [];
  const fn = vm.runInNewContext('(async () => {' + source('Resolve trusted main verifier') + '\n})', {
    github: { rest: { repos: { getBranch: async params => {
      calls.push(params);
      if (thrown) throw new Error(thrown);
      return response;
    } } } },
    core: { setOutput: (...args) => outputs.push(args), setFailed: value => failures.push(value) },
  });
  await fn();
  return { outputs, failures, calls };
}

test('main resolver reads the fixed repository and emits only an exact immutable SHA', async () => {
  const result = await resolve({ status: 200, data: { name: 'main', commit: { sha: 'a'.repeat(40) } } });
  assert.deepEqual(result.outputs, [['sha', 'a'.repeat(40)]]);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.calls)), [{ owner: 'simplememofast', repo: 'simplememo', branch: 'main', request: { timeout: 10000 } }]);
});

test('missing, mutable, malformed or non-main resolver data fails without emitting a checkout ref', async () => {
  for (const data of [null, {}, { name: 'other', commit: { sha: 'a'.repeat(40) } },
    ...['main', 'a'.repeat(40) + '\n', 'A'.repeat(40), null].map(sha => ({ name: 'main', commit: { sha } }))]) {
    const result = await resolve({ status: 200, data });
    assert.deepEqual(result.outputs, []);
    assert.deepEqual(result.failures, ['TRUSTED_MAIN_RESOLUTION_FAILED']);
  }
});

test('resolver permission and transport failures remain failures without reflecting API details', async () => {
  for (const [response, thrown] of [[{ status: 403, data: { name: 'main', commit: { sha: 'a'.repeat(40) } } }],
    [null, 'SYNTHETIC_PRIVATE_API_BODY']]) {
    const result = await resolve(response, thrown);
    assert.deepEqual(result.outputs, []);
    assert.deepEqual(result.failures, ['TRUSTED_MAIN_RESOLUTION_FAILED']);
  }
});
