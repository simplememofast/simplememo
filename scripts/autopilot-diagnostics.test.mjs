import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { modelSummary, receipt, save, checkWiring } from './autopilot-diagnostics.mjs';
import { interpretRun } from './autopilot-act.mjs';

export async function selftest() {
  let tests = 0;
  const test = (name, fn) => { try { fn(); tests++; } catch (error) { error.message = name + ': ' + error.message; throw error; } };
  const secret = 'PRIVATE_SENTINEL_DO_NOT_EXPORT';
  const env = { GITHUB_RUN_ID: '37403744008', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40),
    TODAY_DASH: '2026-10-06', MODEL_OUTCOME: 'success', OUTPUT_VERDICT: 'missing',
    OUTPUT_REASON_CODE: 'no_matching_pr', MATCHING_PR_COUNT: '0', CURRENT_RUN_RECORD_COUNT: '',
    CHECKPOINT_OUTCOME: 'success', CHECKPOINT_SAVED: 'false', CHECKPOINT_REASON: 'no_unpublished_page_changes',
    DECLARED_PAGE_CHANGE_COUNT: '0', GH_TOKEN: secret };
  const raw = { type: 'result', subtype: 'success', is_error: false, num_turns: 165, total_cost_usd: 8.6843,
    result: secret, permission_denials_count: 99, permission_denials: [
      { tool_name: 'Bash', tool_use_id: secret, tool_input: { command: secret } },
      { tool_name: secret, tool_input: { url: 'https://example.invalid/?token=' + secret } },
    ] };
  test('raw array wins over stale count; strings and tool input never leave projection', () => {
    const r = receipt(env, [{ type: 'assistant', content: secret }, raw]);
    assert.equal(r.permission_denials_count, 2);
    assert.deepEqual(r.denied_tool_counts, { Bash: 1, unknown: 1 });
    assert.equal(r.output_reason_code, 'no_matching_pr');
    assert.equal(r.matching_pr_count, 0); assert.equal(r.current_run_record_count, null);
    assert(!JSON.stringify(r).includes(secret));
  });
  test('last result is selected without trusting messages that only have cost', () => {
    assert.equal(modelSummary([raw, { type: 'result', subtype: 'error_max_turns', num_turns: 250 },
      { type: 'assistant', total_cost_usd: 0 }]).result_subtype, 'error_max_turns');
  });
  test('legacy count stays available but tool details are unknown', () => {
    const r = modelSummary({ type: 'result', permission_denials_count: 2 });
    assert.equal(r.permission_denials_count, 2); assert.equal(r.denied_tool_counts, null);
  });
  test('empty denial array is observed zero', () => assert.equal(modelSummary({ type: 'result', permission_denials: [] }).permission_denials_count, 0));
  for (const value of [undefined, null, -1, 1.5, true, '2', {}]) test('invalid or absent count is unknown', () => {
    assert.equal(modelSummary({ type: 'result', permission_denials_count: value }).permission_denials_count, null);
  });
  test('unknown result and environment fields cannot carry raw text', () => {
    const poisoned = Object.fromEntries(Object.keys(env).map(key => [key, secret]));
    const r = receipt(poisoned, { ...raw, subtype: secret, is_error: secret, num_turns: secret }, secret, secret);
    assert(!JSON.stringify(r).includes(secret));
    assert.equal(r.github_run_id, null); assert.equal(r.result_subtype, null);
    assert(r.observations_unknown.includes('num_turns'));
  });
  test('verdict and reason must belong together', () => assert.equal(receipt({ ...env, OUTPUT_REASON_CODE: 'unknown_remote_read' }).output_reason_code, null));
  test('skipped model verification remains unknown, not missing/zero', () => {
    const r = receipt({ ...env, MODEL_OUTCOME: 'failure', OUTPUT_VERDICT: '', OUTPUT_REASON_CODE: '', MATCHING_PR_COUNT: '' });
    assert.equal(r.output_verdict, null); assert.equal(r.matching_pr_count, null); assert.equal(r.production_verified, false);
  });

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  test('workflow keeps both failure paths, trusted source, bounded upload and privacy', () => checkWiring(workflow));
  for (const [from, to] of [
    ["steps.claude.outcome == 'success' || steps.claude.outcome == 'failure'", "steps.claude.outcome == 'success'"],
    ['diagnostic-tools" "$GITHUB_SHA"', 'diagnostic-tools" "HEAD"'],
    ['path: ${{ runner.temp }}/autopilot-diagnostic', 'path: ${{ runner.temp }}'],
    ["steps.diagnostics.outputs.saved == 'true'", 'true'],
    ["steps.diagnostics.outputs.saved == 'true'\n        continue-on-error: true", "steps.diagnostics.outputs.saved == 'true'"],
  ]) test('broken diagnostic wiring is rejected', () => assert.throws(() => checkWiring(workflow.replace(from, to))));

  test('optional diagnostic upload cannot reclassify verified output as no_artifact', () => {
    const steps = [
      { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'success' },
      { name: '成果物の実行IDを照合', conclusion: 'success' },
      { name: '成果物判定: verified', conclusion: 'success' },
      { name: 'Preserve bounded execution diagnostics', conclusion: 'success' },
    ];
    const run = { status: 'completed', conclusion: 'success', steps };
    assert.equal(interpretRun(run).outcome, 'shipped');
    assert.equal(interpretRun({ ...run, conclusion: 'failure', steps: [...steps,
      { name: 'Upload bounded execution diagnostics', conclusion: 'failure' }] }).outcome, 'no_artifact');
    // GitHub applies continue-on-error to the step conclusion and keeps the job successful.
    // checkWiring above requires that policy on the actual upload step.
    assert.equal(interpretRun({ ...run, steps: [...steps,
      { name: 'Upload bounded execution diagnostics', outcome: 'failure', conclusion: 'success' }] }).outcome, 'shipped');
  });

  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-diagnostic-test-')));
  try {
    const output = path.join(temp, 'autopilot-diagnostic');
    const execution = path.join(temp, 'claude-execution-output.json');
    const args = { ...env, RUNNER_TEMP: temp, EXEC_FILE: execution };
    const clean = () => fs.rmSync(output, { recursive: true, force: true });
    test('CLI saves one safe receipt with private permissions', () => {
      fs.writeFileSync(execution, JSON.stringify([raw]));
      const stepOutput = path.join(temp, 'step-output');
      const cli = spawnSync(process.execPath, [path.join(root, 'scripts/autopilot-diagnostics.mjs'), '--save', output],
        { encoding: 'utf8', env: { ...process.env, ...args, GITHUB_OUTPUT: stepOutput } });
      assert.equal(cli.status, 0, cli.stderr);
      assert.equal(fs.readFileSync(stepOutput, 'utf8'), 'saved=true\n');
      assert.deepEqual(fs.readdirSync(output), ['receipt.json']);
      const text = fs.readFileSync(path.join(output, 'receipt.json'), 'utf8');
      assert(!text.includes(secret)); assert(!cli.stdout.includes(secret)); assert(!cli.stderr.includes(secret));
      const r = JSON.parse(text);
      assert.equal(r.permission_denials_count, 2); assert.match(r.execution_file_sha256, /^[a-f0-9]{64}$/);
      assert.equal(fs.statSync(path.join(output, 'receipt.json')).mode & 0o077, 0);
      assert.equal(fs.statSync(output).mode & 0o077, 0);
    });
    test('pre-existing output directory cannot upload unrelated contents', () => {
      fs.writeFileSync(path.join(output, 'private.txt'), secret);
      assert.throws(() => save(output, args));
    });
    clean();
    test('malformed JSON is hashed but its bytes are never returned', () => {
      fs.writeFileSync(execution, secret);
      const r = save(output, args);
      assert.equal(r.permission_denials_count, null);
      assert(r.observations_unknown.includes('execution_file_invalid_json'));
      assert(!JSON.stringify(r).includes(secret));
    });
    clean(); fs.unlinkSync(execution);
    test('missing execution file does not suppress independent checkpoint observations', () => {
      const r = save(output, { ...args, CHECKPOINT_SAVED: 'true', CHECKPOINT_REASON: 'saved', DECLARED_PAGE_CHANGE_COUNT: '2' });
      assert.equal(r.checkpoint_saved, true); assert.equal(r.declared_page_change_count, 2);
      assert.equal(r.permission_denials_count, null); assert(r.observations_unknown.includes('execution_file_missing'));
    });
    clean();
    test('alternate execution path is never read', () => {
      const r = save(output, { ...args, EXEC_FILE: path.join(temp, 'private.txt') });
      assert(r.observations_unknown.includes('execution_file_unexpected_path')); assert.equal(r.execution_file_sha256, null);
    });
    clean();
    test('symlink execution file is never read', () => {
      const privatePath = path.join(temp, 'private.json'); fs.writeFileSync(privatePath, JSON.stringify(raw));
      fs.symlinkSync(privatePath, execution);
      const r = save(output, args); assert.equal(r.execution_file_sha256, null);
      assert(r.observations_unknown.includes('execution_file_unavailable'));
    });
    clean(); fs.unlinkSync(execution);
    test('oversized input remains explicitly unknown', () => {
      fs.writeFileSync(execution, ''); fs.truncateSync(execution, 32 * 1024 * 1024 + 1);
      const r = save(output, args); assert(r.observations_unknown.includes('execution_file_oversized'));
    });
    clean();
    test('checkpoint capture failure is preserved independently of model success', () => {
      const r = receipt({ ...env, CHECKPOINT_OUTCOME: 'failure', CHECKPOINT_SAVED: 'false', CHECKPOINT_REASON: 'capture_failed', DECLARED_PAGE_CHANGE_COUNT: '' }, raw);
      assert.equal(r.checkpoint_saved, false); assert.equal(r.checkpoint_reason, 'capture_failed');
      assert.equal(r.declared_page_change_count, null); assert.equal(r.output_verdict, 'missing');
    });
    // Test the Python actually embedded in the workflow; no duplicate parser fixture.
    const embedded = workflow.match(/          python3 - "\$f" <<'PY' \| tee -a "\$GITHUB_STEP_SUMMARY"\n([\s\S]*?)\n          PY/);
    assert(embedded, 'cost extraction heredoc required');
    const python = embedded[1].split('\n').map(line => line.slice(10)).join('\n');
    for (const [fields, expected] of [[raw, '2'], [{ permission_denials: [] }, '0'],
      [{ permission_denials_count: 3 }, '3'], [{}, 'None'], [{ permission_denials_count: true }, 'None']]) {
      test('actual cost extractor agrees on denial count and unknown', () => {
        fs.writeFileSync(execution, JSON.stringify([{ type: 'result', total_cost_usd: 0.1, num_turns: 1, ...fields }]));
        const cli = spawnSync('python3', ['-', execution], { input: python, encoding: 'utf8', cwd: root,
          env: { ...process.env, GITHUB_RUN_ID: '123', TASK_KIND: '' } });
        assert.equal(cli.status, 0, cli.stderr); assert(cli.stdout.includes('permission_denials ' + expected));
        assert(!cli.stdout.includes(secret));
      });
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  console.log(`diagnostics: ${tests} privacy, missingness, workflow and real CLI/cost checks passed`);
}
