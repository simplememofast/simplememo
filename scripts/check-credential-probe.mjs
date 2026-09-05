#!/usr/bin/env node
// Exercise the actual workflow shell using a local fake CLI, without credentials or models.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateProbe(workflow) {
  const step = workflow.split('      - name: 即死が資格情報かを切り分ける\n')[1];
  assert(step, 'Credential diagnostic step is missing');
  const run = step.split('        run: |\n')[1];
  assert(run, 'Credential diagnostic shell is missing');
  const lines = [];
  for (const line of run.split('\n')) {
    if (line.trim() && !line.startsWith('          ')) break;
    lines.push(line.slice(10));
  }
  const script = lines.join('\n');
  assert.match(workflow, /name: 資格情報の診断は判定不能/);
  assert.match(workflow, /steps\.credprobe\.outputs\.verdict == 'unknown'/);
  assert.match(workflow, /steps\.credprobe\.outcome == 'failure' && steps\.credprobe\.outputs\.verdict != 'credential'/);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-probe-test-'));
  try {
    fs.writeFileSync(path.join(temp, 'claude'), '#!/bin/sh\nprintf \'%s\\n\' "$PROBE_FIXTURE"\nexit "$PROBE_FIXTURE_EXIT"\n', { mode: 0o700 });
    const good = { type: 'result', is_error: false, result: 'PROBE_OK' };
    const bad = { type: 'result', is_error: true };
    const fixtures = [
      [good, 0, 'ok', 0],
      [good, 1, 'unknown', 0],
      [{ ...bad, api_error_status: 401, result: 'authentication rejected' }, 1, 'credential', 1],
      [{ ...bad, api_error_status: 403, result: 'permission denied' }, 1, 'unknown', 0],
      [{ ...bad, api_error_status: 503, result: 'service unavailable' }, 1, 'unknown', 0],
      [{ ...bad, api_error_status: 429, result: "You've hit your weekly limit" }, 1, 'usage_limit', 0],
      [{ ...bad, api_error_status: 429, result: "You've hit your session limit" }, 1, 'usage_limit', 0],
      [{ ...bad, api_error_status: 429, result: 'Too many requests' }, 1, 'unknown', 0],
      ['network connection failed', 1, 'unknown', 0],
      ['{"is_error":false,', 1, 'unknown', 0],
      [null, 1, 'unknown', 0],
      [{ type: 'system', is_error: false }, 0, 'unknown', 0],
    ];
    for (const [data, cliExit, verdict, exit] of fixtures) {
      const output = path.join(temp, 'outputs');
      fs.writeFileSync(output, '');
      const result = spawnSync('/bin/bash', ['-c', script], {
        cwd: temp, encoding: 'utf8', timeout: 5000,
        // A constructed environment prevents a failed assertion from exposing host secrets.
        env: { PATH: `${temp}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
          GITHUB_OUTPUT: output, PROBE_FIXTURE: typeof data === 'string' ? data : JSON.stringify(data),
          PROBE_FIXTURE_EXIT: String(cliExit) },
      });
      assert.equal(result.status, exit, `Diagnostic exit: ${verdict}`);
      const written = fs.readFileSync(output, 'utf8');
      assert.equal(written.match(/^verdict=(\w+)$/m)?.[1], verdict, `Classification for HTTP ${data?.api_error_status ?? 'unknown'}`);
      assert.equal((written.match(/^verdict=/gm) ?? []).length, 1);
    }
    return fixtures.length;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  const count = validateProbe(workflow);
  assert.throws(() => validateProbe(workflow.replace('let verdict = "unknown";', 'let verdict = "credential";')));
  assert.throws(() => validateProbe(workflow.replace("steps.credprobe.outputs.verdict == 'unknown'", 'false')));
  console.log(`Credential diagnostic: ${count} actual-shell fixtures and misclassification/disconnection mutations passed`);
}
