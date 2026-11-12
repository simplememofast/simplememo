// Structure of .github/workflows/home-perf-cache.yml, the production-only cache check.
// Run from scripts/cache-contract.test.mjs (SEO Validation) so a change to the
// workflow is checked before it can ship.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = fs.readFileSync(new URL('../../.github/workflows/home-perf-cache.yml', import.meta.url), 'utf8');

function step(name) {
  const start = workflow.indexOf('      - name: ' + name + '\n');
  assert.ok(start >= 0, name);
  const end = workflow.indexOf('\n      - ', start + 1);
  return workflow.slice(start, end < 0 ? undefined : end);
}

test('production only: no PR trigger, no credentials, read-only token', () => {
  assert.doesNotMatch(workflow, /^\s*pull_request(?:_target)?:/m);
  assert.doesNotMatch(workflow, /secrets\.|environment:|:\s*write\b|id-token/);
  assert.match(workflow, /^permissions:\n  contents: read\n  checks: read\n(?!  )/m);
  assert.match(workflow, /^  schedule:\n    - cron: '\d{1,2} \d{1,2} \* \* \*'\n/m);
  assert.match(workflow, /^  workflow_dispatch:\n/m);
  assert.match(workflow, /^  push:\n    branches: \[main\]\n/m);
  assert.match(workflow, /persist-credentials: false/);
});

test('measures the production origin and nothing else', () => {
  const origins = [...workflow.matchAll(/PERF_ORIGIN: (.+)/g)].map(m => m[1].trim());
  assert.deepEqual(origins, ['https://simplememofast.com']);
  assert.doesNotMatch(workflow, /pages\.dev/);
});

test('a push run waits for this exact commit to be live before measuring', () => {
  const wait = step("Wait for this commit's successful production deployment");
  assert.match(wait, /if: github\.event_name == 'push'/);
  assert.match(wait, /r\.name === 'Cloudflare Pages' && r\.head_sha === context\.sha/);
  assert.match(wait, /run\.conclusion === 'success'/);
  assert.ok(workflow.indexOf(wait) < workflow.indexOf('      - name: Verify production response bodies and cache policies'));
});

test('one delayed retry, then a real regression fails the job', () => {
  const verify = step('Verify production response bodies and cache policies');
  const script = verify.match(/^        run: (.+)$/m)?.[1];
  assert.ok(script);
  const minutes = Number(workflow.match(/timeout-minutes: (\d+)/)?.[1]);
  assert.ok(minutes >= 10, 'room for two attempts and the delay');
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
