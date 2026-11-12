// Structure of .github/workflows/home-perf-cache.yml, the production-only cache check.
// Run from scripts/cache-contract.test.mjs (SEO Validation) so a change to the
// workflow is checked before it can ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const workflow = fs.readFileSync(new URL('../../.github/workflows/home-perf-cache.yml', import.meta.url), 'utf8');
const WAIT = "Wait for this commit's successful production deployment";
const SETTLE = 'Let the edge settle after the deployment';
const VERIFY = 'Verify production response bodies and cache policies';

function step(name) {
  const start = workflow.indexOf('      - name: ' + name + '\n');
  assert.ok(start >= 0, name);
  const end = workflow.indexOf('\n      - ', start + 1);
  return workflow.slice(start, end < 0 ? undefined : end);
}
const minutes = text => Number(text.match(/timeout-minutes: (\d+)/)?.[1]);

test('production only: no PR trigger, no credentials, read-only token', () => {
  assert.doesNotMatch(workflow, /^\s*pull_request(?:_target)?:/m);
  assert.doesNotMatch(workflow, /secrets\.|environment:|:\s*write\b|id-token/);
  assert.match(workflow, /^permissions:\n  contents: read\n  checks: read\n(?!  )/m);
  assert.match(workflow, /^  schedule:\n    - cron: '\d{1,2} \d{1,2} \* \* \*'\n/m);
  assert.match(workflow, /^  workflow_dispatch:\n/m);
  assert.match(workflow, /^  push:\n    branches: \[main\]\n/m);
  assert.match(workflow, /persist-credentials: false/);
});

test('a push or manual run never replaces a pending scheduled run', () => {
  assert.match(workflow, /^concurrency:\n(?:  #.*\n)*  group: asset-cache-production-\$\{\{ github\.event_name \}\}\n  cancel-in-progress: false\n/m);
});

test('measures the production origin and nothing else', () => {
  const origins = [...workflow.matchAll(/PERF_ORIGIN: (.+)/g)].map(m => m[1].trim());
  assert.deepEqual(origins, ['https://simplememofast.com']);
  assert.doesNotMatch(workflow, /pages\.dev/);
});

test('timeouts are per step (recorded as failures) and the job outlasts their sum', () => {
  const wait = minutes(step(WAIT)), verify = minutes(step(VERIFY)), job = minutes(workflow.split('\n    steps:\n')[0]);
  const settle = Number(step(SETTLE).match(/sleep (\d+)/)?.[1]) / 60;
  assert.ok(wait >= 31 && verify >= 15 && settle >= 7.5, JSON.stringify({ wait, verify, settle }));
  assert.ok(job >= wait + settle + verify + 5, `job ${job} < ${wait} + ${settle} + ${verify} + 5`);
});

async function runWait(responses) {
  const block = step(WAIT).split('          script: |\n')[1].split('\n');
  const end = block.findIndex(line => line !== '' && !line.startsWith('            '));
  const script = block.slice(0, end < 0 ? undefined : end).map(line => line.replace(/^            /, '')).join('\n');
  const calls = [];
  let i = 0;
  const github = { rest: { checks: { listForRef: async params => {
    calls.push(params);
    const next = responses[Math.min(i++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return { data: { check_runs: next } };
  } } } };
  const context = { repo: { owner: 'simplememofast', repo: 'simplememo' }, sha: 'a'.repeat(40) };
  const fn = vm.runInNewContext(`(async () => {${script}\n})`, { github, context, core: { info() {} }, setTimeout: resolve => resolve(), Error, Object });
  try { await fn(); return { ok: true, calls }; } catch (e) { return { ok: false, error: e.message, calls }; }
}

test('the deployment wait accepts only this commit\'s production deployment', async () => {
  const sha = 'a'.repeat(40);
  const production = (conclusion = 'success', status = 'completed') => ({ app: { id: 85455 }, head_sha: sha, status, conclusion, output: { summary: 'Deploy successful' } });
  const preview = { ...production(), output: { summary: 'Branch Preview URL: https://x' } };
  const otherApp = { ...production(), app: { id: 15368 } };
  const ok = await runWait([[production('pending', 'in_progress')], [production()]]);
  assert.equal(ok.ok, true);
  assert.deepEqual({ ...ok.calls[0], owner: undefined, repo: undefined }, { owner: undefined, repo: undefined, ref: sha, check_name: 'Cloudflare Pages', filter: 'latest', per_page: 100 });
  assert.match((await runWait([[preview]])).error, /No completed production deployment/);
  assert.match((await runWait([[otherApp]])).error, /No completed production deployment/);
  assert.match((await runWait([[production('failure')]])).error, /did not deploy this commit: failure/);
  assert.equal((await runWait([Object.assign(new Error('502'), { status: 502 }), [production()]])).ok, true);
  assert.equal((await runWait([[]])).calls.length, 180, 'about 30 minutes of polling');
});

test('one delayed retry, then a real regression fails the job', () => {
  const verify = step(VERIFY);
  const script = verify.match(/^        run: (.+)$/m)?.[1];
  assert.ok(script);
  assert.match(step(SETTLE), /if: github\.event_name == 'push'/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-retry-'));
  try {
    const log = path.join(dir, 'calls');
    fs.writeFileSync(path.join(dir, 'node'), '#!/bin/sh\nn=0\n[ -f "$CALLS" ] && n=$(grep -c . "$CALLS")\necho node >> "$CALLS"\ncase "$n" in 0) exit "$FIRST" ;; *) exit "$SECOND" ;; esac\n', { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'sleep'), '#!/bin/sh\necho "sleep $1" >> "$CALLS"\n', { mode: 0o755 });
    for (const [first, second, ok, calls] of [['0', '1', true, 'node'], ['1', '0', true, 'node,sleep 300,node'], ['1', '1', false, 'node,sleep 300,node']]) {
      fs.rmSync(log, { force: true });
      const result = spawnSync('/bin/bash', ['-e', '-c', script], { env: { PATH: dir + ':/usr/bin:/bin', CALLS: log, FIRST: first, SECOND: second } });
      assert.equal(result.status === 0, ok, `${first}/${second}`);
      assert.equal(fs.readFileSync(log, 'utf8').trim().split('\n').join(','), calls);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the proof is kept even when the check fails', () => {
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40} # v[\d.]+\n        if: always\(\)/);
  assert.match(workflow, /name: homepage-asset-cache-proof/);
});
