#!/usr/bin/env node
// Exercise the actual workflow shell using a local fake CLI, without credentials or models.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function classifyModelLimit(doc, { maxBudgetUsd, maxTurns } = {}) {
  const results = (Array.isArray(doc) ? doc : [doc]).filter(r => r?.type === 'result');
  if (results.length !== 1) return 'unknown';
  const r = results[0];
  if (r.is_error !== true || !Number.isSafeInteger(r.num_turns) || r.num_turns < 1
    || !Number.isFinite(r.total_cost_usd) || r.total_cost_usd < 0) return 'unknown';
  if (r.subtype === 'error_max_budget_usd' && Number.isFinite(maxBudgetUsd) && maxBudgetUsd > 0
    && r.total_cost_usd >= maxBudgetUsd) return 'budget';
  if (r.subtype === 'error_max_turns' && Number.isSafeInteger(maxTurns) && maxTurns > 0
    && r.num_turns >= maxTurns) return 'turns';
  return 'unknown';
}

export function validateModelLimit(workflow) {
  const blocks = workflow.split(/^ {6}- name: /m).slice(1);
  const named = name => blocks.find(b => b.startsWith(name + '\n'));
  const classification = named('SDKの停止理由を確認');
  assert.match(classification ?? '', /^ {8}id: model_limit$/m);
  assert.match(classification ?? '', /^ {8}if: always\(\) && steps\.claude\.outcome == 'failure'$/m);
  assert(classification?.includes('node "$RUNNER_TEMP/output-tools/scripts/check-credential-probe.mjs" --classify-limit "$f"'));
  assert(classification.includes('--max-budget-usd "$MAX_BUDGET_USD" --max-turns 250'));
  assert(classification.includes('MAX_BUDGET_USD: ${{ steps.route.outputs.runtime_budget_usd }}'));
  const claude = blocks.find(b => /^ {8}id: claude$/m.test(b));
  assert.match(claude ?? '', /^ {12}--max-turns 250$/m, 'classifier must use the actual declared turn limit');
  const readiness = named('切り分け用のCLIを確認');
  assert(readiness?.includes("steps.model_limit.outputs.verdict != 'budget' && steps.model_limit.outputs.verdict != 'turns'"), 'known SDK limits must suppress the paid diagnostic');
  for (const [name, verdict] of [['実行中の支出閾値で停止', 'budget'], ['ターン上限で停止', 'turns']]) {
    const block = named(name);
    assert(block?.includes(`steps.model_limit.outputs.verdict == '${verdict}'`) && block.includes('exit 1'), 'verified limit must remain an unsuccessful run');
  }
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-model-limit-')));
  try {
    const scripts = path.join(temp, 'output-tools/scripts'); fs.mkdirSync(scripts, { recursive: true });
    fs.copyFileSync(fileURLToPath(import.meta.url), path.join(scripts, 'check-credential-probe.mjs'));
    const shell = classification.split('        run: |\n')[1].split('\n')
      .filter(line => !line.trim() || line.startsWith('          ')).map(line => line.slice(10)).join('\n');
    const base = { type: 'result', subtype: 'error_max_budget_usd', is_error: true, num_turns: 1, total_cost_usd: 0.045 };
    const cases = [[base, 'budget'], [[{ type: 'system' }, base], 'budget'],
      [{ ...base, subtype: 'error_max_turns', num_turns: 251 }, 'turns'],
      [{ ...base, subtype: 'success', is_error: false }, 'unknown'],
      [{ ...base, is_error: false }, 'unknown'], [{ ...base, type: 'assistant' }, 'unknown'],
      [{ ...base, subtype: 'error_max_turns', num_turns: 10 }, 'unknown'],
      [{ ...base, total_cost_usd: 0 }, 'unknown'], [{ ...base, num_turns: null }, 'unknown'],
      [{ ...base, subtype: 'error_during_execution' }, 'unknown'], [[base, base], 'unknown'],
      [null, 'unknown'], ['invalid JSON', 'unknown']];
    for (const [doc, expected] of cases) {
      const file = path.join(temp, 'result.json');
      fs.writeFileSync(file, typeof doc === 'string' ? doc : JSON.stringify(doc));
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--classify-limit', file,
        '--max-budget-usd', '0.0001', '--max-turns', '250'], { encoding: 'utf8' });
      assert.equal(r.status, 0); assert.equal(r.stdout.trim(), expected);
      const output = path.join(temp, 'outputs'); fs.writeFileSync(output, '');
      const execution = spawnSync('/bin/bash', ['-e', '-c', shell], { cwd: temp, encoding: 'utf8',
        env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, RUNNER_TEMP: temp, EXEC_FILE: file,
          MAX_BUDGET_USD: '0.0001', GITHUB_OUTPUT: output } });
      assert.equal(execution.status, 0, execution.stderr);
      assert.equal(fs.readFileSync(output, 'utf8').trim(), `verdict=${expected}`, 'actual workflow did not record the verified SDK termination');
    }
    assert.equal(classifyModelLimit(base, { maxBudgetUsd: NaN, maxTurns: 250 }), 'unknown');
    assert.equal(classifyModelLimit({ ...base, total_cost_usd: Infinity }, { maxBudgetUsd: 0.01 }), 'unknown');
    assert.equal(classifyModelLimit({ ...base, subtype: 'error_max_turns', num_turns: 251 }, { maxTurns: 0 }), 'unknown');
    return cases.length;
  } finally { fs.rmSync(temp, { recursive: true }); }
}

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
  if (process.argv[2] === '--classify-limit') {
    const value = flag => { const i = process.argv.indexOf(flag); return i >= 0 ? Number(process.argv[i + 1]) : NaN; };
    let doc;
    try { doc = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')); } catch { doc = null; }
    console.log(classifyModelLimit(doc, { maxBudgetUsd: value('--max-budget-usd'), maxTurns: value('--max-turns') }));
    process.exit(0);
  }
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  const limits = validateModelLimit(workflow);
  const count = validateProbe(workflow);
  assert.throws(() => validateProbe(workflow.replace('let verdict = "unknown";', 'let verdict = "credential";')));
  assert.throws(() => validateProbe(workflow.replace("steps.credprobe.outputs.verdict == 'unknown'", 'false')));
  console.log(`Credential diagnostic: ${count} actual-shell fixtures, ${limits} model-limit CLI fixtures and misclassification/disconnection mutations passed`);
}
