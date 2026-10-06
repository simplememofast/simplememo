#!/usr/bin/env node
// Public diagnostic receipt: finite states, counts and hashes only. No remote
// calls, raw SDK messages, tool inputs, final text, paths or exception messages.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_EXECUTION_BYTES = 32 * 1024 * 1024;
const TOOLS = new Set(['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'TodoWrite', 'NotebookEdit', 'Task', 'BashOutput', 'KillShell', 'ToolSearch']);
const REASONS = {
  verified: ['verified_current_run_record'],
  missing: ['no_matching_pr', 'no_current_run_record', 'invalid_or_stale_record'],
  unknown: ['unknown_snapshot', 'unknown_remote_read', 'unknown_evidence', 'unknown_concurrent_update'],
};
const SUBTYPES = ['success', 'error_max_turns', 'error_max_budget_usd',
  'error_during_execution', 'error_max_structured_output_retries'];
const CHECKPOINT_REASONS = ['saved', 'no_unpublished_page_changes', 'capture_failed'];
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const envCount = value => typeof value === 'string' && /^\d+$/.test(value) ? count(Number(value)) : null;
const oneOf = (value, values) => values.includes(value) ? value : null;
const hash = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value) ? value : null;

export function modelSummary(execution) {
  const result = Array.isArray(execution)
    ? [...execution].reverse().find(item => item?.type === 'result')
    : execution?.type === 'result' ? execution : null;
  const raw = result?.permission_denials;
  const denialCount = Array.isArray(raw) ? raw.length : count(result?.permission_denials_count);
  let deniedToolCounts = null;
  if (Array.isArray(raw)) {
    deniedToolCounts = {};
    for (const item of raw) {
      const tool = TOOLS.has(item?.tool_name) ? item.tool_name : 'unknown';
      deniedToolCounts[tool] = (deniedToolCounts[tool] ?? 0) + 1;
    }
  }
  return {
    result_subtype: oneOf(result?.subtype, SUBTYPES),
    is_error: typeof result?.is_error === 'boolean' ? result.is_error : null,
    num_turns: count(result?.num_turns),
    permission_denials_count: denialCount,
    denied_tool_counts: deniedToolCounts,
  };
}

export function receipt(env, execution = null, executionHash = null, readReason = null) {
  const model = modelSummary(execution);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(env.TODAY_DASH ?? '') ? env.TODAY_DASH : null;
  const verdict = oneOf(env.OUTPUT_VERDICT, Object.keys(REASONS));
  const checkpointOutcome = oneOf(env.CHECKPOINT_OUTCOME, ['success', 'failure', 'skipped', 'cancelled']);
  const result = {
    schema_version: 1,
    github_run_id: /^[1-9]\d{0,19}$/.test(env.GITHUB_RUN_ID ?? '') ? env.GITHUB_RUN_ID : null,
    github_run_attempt: envCount(env.GITHUB_RUN_ATTEMPT) > 0 ? envCount(env.GITHUB_RUN_ATTEMPT) : null,
    workflow_sha: hash(env.GITHUB_SHA, 40),
    expected_branch: day ? `claude/obsidian-auto-${day.replaceAll('-', '')}` : null,
    model_outcome: oneOf(env.MODEL_OUTCOME, ['success', 'failure']),
    ...model,
    output_verdict: verdict,
    output_reason_code: oneOf(env.OUTPUT_REASON_CODE, REASONS[verdict] ?? []),
    matching_pr_count: envCount(env.MATCHING_PR_COUNT),
    // Observations across inspected PR heads; null means no such head was read.
    current_run_record_count: envCount(env.CURRENT_RUN_RECORD_COUNT),
    current_run_record_scope: 'inspected_pr_heads',
    remote_head_sha: hash(env.REMOTE_HEAD_SHA, 40),
    checkpoint_outcome: checkpointOutcome,
    checkpoint_saved: ['true', 'false'].includes(env.CHECKPOINT_SAVED) ? env.CHECKPOINT_SAVED === 'true' : null,
    checkpoint_reason: oneOf(env.CHECKPOINT_REASON, CHECKPOINT_REASONS),
    declared_page_change_count: envCount(env.DECLARED_PAGE_CHANGE_COUNT),
    execution_file_sha256: hash(executionHash, 64),
    production_verified: false,
  };
  result.observations_unknown = Object.entries(result).filter(([, value]) => value === null).map(([key]) => key);
  if (readReason) result.observations_unknown.push(oneOf(readReason,
    ['execution_file_missing', 'execution_file_unavailable', 'execution_file_oversized',
      'execution_file_invalid_json', 'execution_file_unexpected_path']) ?? 'execution_file_unavailable');
  return result;
}

function readExecution(env) {
  // The pinned action writes this exact file. Refuse alternate files and leaf
  // symlinks instead of reading arbitrary paths supplied by model-controlled data.
  const expected = path.join(env.RUNNER_TEMP, 'claude-execution-output.json');
  if (env.EXEC_FILE && path.resolve(env.EXEC_FILE) !== expected) return { reason: 'execution_file_unexpected_path' };
  let fd;
  try {
    if (!fs.lstatSync(expected).isFile()) return { reason: 'execution_file_unavailable' };
    fd = fs.openSync(expected, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return { reason: 'execution_file_unavailable' };
    if (stat.size > MAX_EXECUTION_BYTES) return { reason: 'execution_file_oversized' };
    // Bound the read as well as the initial size check, even if the file grows.
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0, n;
    while (length < buffer.length && (n = fs.readSync(fd, buffer, length, buffer.length - length, null))) length += n;
    if (length !== stat.size || fs.fstatSync(fd).size !== stat.size) return { reason: 'execution_file_unavailable' };
    const bytes = buffer.subarray(0, length);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    try { return { execution: JSON.parse(bytes.toString('utf8')), sha256 }; }
    catch { return { sha256, reason: 'execution_file_invalid_json' }; }
  } catch (error) {
    return { reason: error.code === 'ENOENT' ? 'execution_file_missing' : 'execution_file_unavailable' };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function save(output, env = process.env) {
  assert(path.isAbsolute(env.RUNNER_TEMP ?? '') && path.isAbsolute(output), 'absolute temp paths required');
  assert.equal(path.basename(output), 'autopilot-diagnostic');
  assert.equal(fs.realpathSync(path.dirname(output)), fs.realpathSync(env.RUNNER_TEMP));
  const read = readExecution(env);
  const data = receipt(env, read.execution, read.sha256, read.reason);
  fs.mkdirSync(output, { mode: 0o700 }); // never reuse a directory or upload its prior contents
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return data;
}

export function checkWiring(source) {
  const step = source.split('      - name: Preserve bounded execution diagnostics\n')[1]?.split('\n      - name:')[0];
  assert(step, 'diagnostic receipt must be wired');
  assert.match(step, /!cancelled\(\) &&\s+\(steps\.claude\.outcome == 'success' \|\| steps\.claude\.outcome == 'failure'\)/);
  assert.match(step, /git worktree add --detach "\$RUNNER_TEMP\/diagnostic-tools" "\$GITHUB_SHA"/);
  assert.match(step, /node "\$RUNNER_TEMP\/diagnostic-tools\/scripts\/autopilot-diagnostics.mjs" --save "\$RUNNER_TEMP\/autopilot-diagnostic"/);
  assert.match(step, /OUTPUT_REASON_CODE: \$\{\{ steps.output.outputs.reason_code \}\}/);
  assert.match(step, /CHECKPOINT_REASON: \$\{\{ steps.checkpoint.outputs.reason \}\}/);
  const upload = source.split('      - name: Upload bounded execution diagnostics\n')[1]?.split('\n  #')[0];
  assert(upload, 'diagnostic upload must be wired');
  assert.match(upload, /if: always\(\) && steps.diagnostics.outputs.saved == 'true'/);
  assert.match(upload, /uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(upload, /path: \$\{\{ runner.temp \}\}\/autopilot-diagnostic\n/);
  assert.match(upload, /retention-days: 7\n/);
  assert.doesNotMatch(source, /show_full_output:\s*['"]?true/);
}

async function main() {
  if (process.argv.includes('--selftest')) return (await import('./autopilot-diagnostics.test.mjs')).selftest();
  if (process.argv.includes('--check')) return checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
  assert.equal(process.argv[2], '--save');
  save(process.argv[3]);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'saved=true\n');
  console.log('Bounded diagnostic receipt saved (no raw execution data).');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(process.argv.includes('--selftest') ? error.stack
      : 'Bounded diagnostics unavailable; original execution verdict is unchanged.');
    process.exitCode = 1;
  });
}
