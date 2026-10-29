#!/usr/bin/env node
// Public diagnostic receipt: finite states, counts and hashes only. No remote
// calls, raw SDK messages, tool inputs, final text, paths or exception messages.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkProgressWiring } from './lib/autopilot-progress.mjs';
import { readBounded, readJson, handoffFileStates, FILE_STATES, RESUME_DECISIONS, EXECUTION_FILE,
  MAIN_EXECUTION_COPY, SUMMARY_FILE, EXIT_CODES, HANDOFF_SCHEMA, HANDOFF_SOURCES, STRUCTURED_STATES, structuredHandoff } from './autopilot-publish.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Same bound as the resume decision in autopilot-publish.mjs (a long session must stay readable).
export const MAX_EXECUTION_BYTES = 128 * 1024 * 1024;
// Tool names a denial may carry. 2026-10-24: both denials of run 40047075713 were 'unknown' — the list predated
// Claude Code 2.1.245 (Agent/Task*, Monitor, Workflow, Skill, ScheduleWakeup, ...). Names only; never inputs.
// mcp__* tools count as 'mcp'. Anything else stays 'unknown'.
export const TOOL_NAMES = Object.freeze(['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'TodoWrite', 'NotebookEdit', 'Task', 'BashOutput', 'KillShell', 'ToolSearch',
  'Agent', 'TaskOutput', 'TaskStop', 'TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate', 'Monitor', 'Workflow', 'Skill',
  'AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode', 'ScheduleWakeup', 'CronCreate', 'CronDelete', 'CronList',
  'SendMessage', 'ListAgents', 'RemoteTrigger', 'PushNotification', 'EnterWorktree', 'ExitWorktree', 'StructuredOutput',
  'DesignSync', 'ReportFindings', 'ShareOnboardingGuide']);
const TOOLS = new Set(TOOL_NAMES);
const toolKey = name => TOOLS.has(name) ? name : typeof name === 'string' && name.startsWith('mcp__') ? 'mcp' : 'unknown';
const REASONS = {
  verified: ['verified_current_run_record'],
  missing: ['no_matching_pr', 'no_current_run_record', 'invalid_or_stale_record'],
  unknown: ['unknown_snapshot', 'unknown_remote_read', 'unknown_evidence', 'unknown_concurrent_update'],
};
const SUBTYPES = ['success', 'error_max_turns', 'error_max_budget_usd',
  'error_during_execution', 'error_max_structured_output_retries'];
const CHECKPOINT_REASONS = ['saved', 'no_unpublished_page_changes', 'capture_failed'];
// The model's own finite statement of why it stopped (prompt step 8). 2026-10-06 ended
// with subtype=success and no PR, and nothing said why. Free text is never read.
// One list with the structured result's schema (autopilot-publish.mjs HANDOFF_SCHEMA).
export { EXIT_CODES };
const MAX_EXIT_BYTES = 4096;
// Finite facts about how the main session ended (2026-10-24: neither trial said why it stopped). Counts,
// enums and booleans computed from the execution file on the model's runner; no text leaves it.
const STOP_REASONS = ['end_turn', 'tool_use', 'max_tokens', 'stop_sequence', 'pause_turn', 'refusal'];
const TERMINAL_REASONS = ['completed', 'max_turns', 'budget_exhausted', 'structured_output_retry_exhausted', 'stop_hook_prevented',
  'hook_stopped', 'background_requested', 'tool_deferred', 'tool_deferred_unavailable', 'aborted_streaming', 'aborted_tools',
  'blocking_limit', 'rapid_refill_breaker', 'prompt_too_long', 'image_error', 'model_error', 'api_error',
  'malformed_tool_use_exhausted', 'turn_setup_failed'];
const MAX_FACT = 100000;
const capped = n => Math.min(n, MAX_FACT);
const ENDING_FIELDS = ['background_started', 'background_finished', 'background_open_at_result', 'bash_timed_out',
  'moved_to_background', 'detached_commands', 'structured_reminders', 'structured_output', 'last_stop_reason', 'terminal_reason',
  'last_tool'];

const textOf = content => typeof content === 'string' ? content
  : Array.isArray(content) ? content.map(part => typeof part?.text === 'string' ? part.text : typeof part === 'string' ? part : '').join('\n') : '';

/** How the session ended, as counts and enums only (null when the execution is not a message list). */
export function endingFacts(execution) {
  const none = Object.fromEntries(ENDING_FIELDS.map(key => [key, null]));
  if (!Array.isArray(execution)) return none;
  const started = new Set(), finished = new Set();
  let timedOut = 0, moved = 0, detached = 0, reminders = 0, lastTool = 'none';
  for (const m of execution) {
    // Backgrounded tasks only: a synchronous subagent also reports task_started, and finishes inside the turn.
    if (m?.type === 'system' && m.subtype === 'task_started' && m.is_backgrounded === true && typeof m.task_id === 'string') started.add(m.task_id);
    if (m?.type === 'system' && m.subtype === 'task_notification' && typeof m.task_id === 'string') finished.add(m.task_id);
    if (m?.type === 'user') {
      const id = m.tool_use_result?.backgroundTaskId;
      if (typeof id === 'string') started.add(id);
      const blocks = Array.isArray(m.message?.content) ? m.message.content : [];
      for (const block of blocks) {
        const text = block?.type === 'tool_result' ? textOf(block.content) : '';
        if (/Command timed out after/.test(text)) timedOut++;
        if (/was moved to the background/.test(text)) moved++;
      }
      if (m.isSynthetic && textOf(m.message?.content).includes('[structured-output-enforce]')) reminders++;
    }
    if (m?.type === 'assistant' && Array.isArray(m.message?.content)) {
      for (const block of m.message.content) {
        if (block?.type !== 'tool_use') continue;
        lastTool = toolKey(block.name);
        const command = block.name === 'Bash' && typeof block.input?.command === 'string' ? block.input.command : '';
        // Quoted text is not shell syntax (a URL's `?a=1&b=2`); what is left is checked for a process left behind.
        const bare = command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '');
        if (/\bnohup\b|\bsetsid\b|\bdisown\b|(?<![&<>|])&(?![&>])/.test(bare)) detached++;
      }
    }
  }
  const result = [...execution].reverse().find(item => item?.type === 'result');
  const open = [...started].filter(id => !finished.has(id)).length;
  return { background_started: capped(started.size), background_finished: capped([...finished].filter(id => started.has(id)).length),
    background_open_at_result: capped(open), bash_timed_out: capped(timedOut), moved_to_background: capped(moved),
    detached_commands: capped(detached), structured_reminders: capped(reminders),
    structured_output: result ? structuredHandoff(execution).state : null,
    last_stop_reason: oneOf(result?.stop_reason, STOP_REASONS), terminal_reason: oneOf(result?.terminal_reason, TERMINAL_REASONS),
    last_tool: lastTool };
}
// The post-model audit's verdict (scripts/autopilot-audit.mjs VERDICTS). Its paths stay in its own artifact.
export const AUDIT_VERDICTS = ['clean', 'problems', 'not_on_day_branch', 'unavailable'];
// The handoff files and the one resume of the session (obsidian-autopilot.yml, 2026-10-22). A
// state after the resume is not_run when the resume step did not start; its result fields are
// then not applicable rather than unknown.
const STEP_OUTCOMES = ['success', 'failure', 'cancelled', 'skipped'];
const RESUMED = ['success', 'failure', 'cancelled'];
const AFTER_RESUME_STATES = [...FILE_STATES, 'not_run'];
const RESUME_RESULT_FIELDS = ['resume_result_subtype', 'resume_num_turns', 'resume_permission_denials_count', 'resume_denied_tool_counts'];
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
      const tool = toolKey(item?.tool_name);
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

const resumeFields = model => ({ resume_result_subtype: model.result_subtype, resume_num_turns: model.num_turns,
  resume_permission_denials_count: model.permission_denials_count, resume_denied_tool_counts: model.denied_tool_counts });
const NO_HANDOFF = Object.freeze({ request_after_main: null, exit_after_main: null, resume_decision: null, resume_outcome: null,
  request_after_resume: null, exit_after_resume: null, ...resumeFields(modelSummary(null)) });

const NO_ENDING = Object.freeze({ ...Object.fromEntries(ENDING_FIELDS.map(key => [key, null])), handoff_source: null });

export function receipt(env, execution = null, executionHash = null, readReason = null, exit = {}, summarized = null, handoff = NO_HANDOFF,
  ending = NO_ENDING) {
  const model = summarized ?? modelSummary(execution);
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
    model_exit_code: oneOf(exit.code, EXIT_CODES),
    ...handoff,
    ...NO_ENDING, ...ending,
    post_model_audit: oneOf(env.AUDIT_VERDICT, AUDIT_VERDICTS),
    execution_file_sha256: hash(executionHash, 64),
    production_verified: false,
  };
  const notRun = result.resume_outcome === 'skipped';
  result.observations_unknown = Object.entries(result)
    .filter(([key, value]) => value === null && !(notRun && RESUME_RESULT_FIELDS.includes(key))).map(([key]) => key);
  if (readReason) result.observations_unknown.push(oneOf(readReason,
    [...READ_REASONS, 'execution_summary_unavailable']) ?? 'execution_file_unavailable');
  if (exit.reason) result.observations_unknown.push(oneOf(exit.reason,
    ['exit_report_missing', 'exit_report_unavailable', 'exit_report_oversized', 'exit_report_invalid']) ?? 'exit_report_unavailable');
  return result;
}

// The model writes this file, so read it like the execution file: one fixed path,
// no symlink, bounded size, and only the enum survives.
function readExit(env) {
  const file = path.join(env.RUNNER_TEMP, 'autopilot-exit.json');
  let fd;
  try {
    if (!fs.lstatSync(file).isFile()) return { reason: 'exit_report_unavailable' };
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return { reason: 'exit_report_unavailable' };
    if (stat.size > MAX_EXIT_BYTES) return { reason: 'exit_report_oversized' };
    const buffer = Buffer.alloc(MAX_EXIT_BYTES + 1);
    const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (length > MAX_EXIT_BYTES) return { reason: 'exit_report_oversized' };
    let parsed;
    try { parsed = JSON.parse(buffer.subarray(0, length).toString('utf8')); } catch { return { reason: 'exit_report_invalid' }; }
    const code = oneOf(parsed?.code, EXIT_CODES);
    return code ? { code } : { reason: 'exit_report_invalid' };
  } catch (error) {
    return { reason: error.code === 'ENOENT' ? 'exit_report_missing' : 'exit_report_unavailable' };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function readExecution(env) {
  // The pinned action writes this exact file. Refuse alternate files and leaf
  // symlinks instead of reading arbitrary paths supplied by model-controlled data.
  const expected = path.join(env.RUNNER_TEMP, EXECUTION_FILE);
  if (env.EXEC_FILE && path.resolve(env.EXEC_FILE) !== expected) return { reason: 'execution_file_unexpected_path' };
  return readExecutionAt(expected);
}

function readExecutionAt(expected) {
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

// The model job reduces the execution and exit files to this typed summary (a file packed
// into the handoff); the receipt is assembled in the publish job after the output check.
// execution_file_changed: after a resume, the main session's copy no longer matches the hash
// recorded before the resume ran.
const READ_REASONS = ['execution_file_missing', 'execution_file_unavailable', 'execution_file_oversized',
  'execution_file_invalid_json', 'execution_file_unexpected_path', 'execution_file_changed'];
const EXIT_REASONS = ['exit_report_missing', 'exit_report_unavailable', 'exit_report_oversized', 'exit_report_invalid'];
const MAX_SUMMARY_BYTES = 8192;

export function summarize(env = process.env) {
  const resumed = RESUMED.includes(env.RESUME_OUTCOME);
  const mainSha = hash(env.MAIN_EXECUTION_SHA256, 64);
  let read = readExecution(env);
  let resume = modelSummary(null);
  if (resumed) {
    // The resume rewrote the action's execution file. The main session's is the copy taken before
    // the resume, bound to the hash the check step recorded then; the current file is the resume's
    // only when it differs from that hash.
    const after = read;
    const copy = readExecutionAt(path.join(env.RUNNER_TEMP, MAIN_EXECUTION_COPY));
    read = copy.reason && !copy.sha256 ? copy : mainSha && copy.sha256 === mainSha ? copy : { reason: 'execution_file_changed' };
    if (mainSha && after.sha256 && after.sha256 !== mainSha) resume = modelSummary(after.execution);
  }
  const exit = readExit(env);
  const states = resumed ? handoffFileStates(env.RUNNER_TEMP) : null;
  return { ...modelSummary(read.execution), ...endingFacts(read.execution),
    handoff_source: oneOf(env.HANDOFF_SOURCE, HANDOFF_SOURCES), model_exit_code: exit.code ?? null,
    execution_file_sha256: read.sha256 ?? null, read_reason: read.reason ?? null, exit_reason: exit.reason ?? null,
    request_after_main: oneOf(env.REQUEST_AFTER_MAIN, FILE_STATES), exit_after_main: oneOf(env.EXIT_AFTER_MAIN, FILE_STATES),
    resume_decision: oneOf(env.RESUME_DECISION, RESUME_DECISIONS), resume_outcome: oneOf(env.RESUME_OUTCOME, STEP_OUTCOMES),
    request_after_resume: states?.request ?? 'not_run', exit_after_resume: states?.exit ?? 'not_run', ...resumeFields(resume) };
}

/** The summary file of the handoff, only when its sha256 is the manifest's; otherwise undefined. */
export function readHandoffSummary(handoff) {
  const manifest = readJson(path.join(handoff, 'manifest.json'));
  const read = readBounded(path.join(handoff, 'summary.json'), MAX_SUMMARY_BYTES);
  const expected = manifest.value?.files?.['summary.json']?.sha256;
  if (!read.bytes || typeof expected !== 'string' || createHash('sha256').update(read.bytes).digest('hex') !== expected) return undefined;
  return read.bytes.toString('utf8');
}

// The summary passed through the model's runner: every field is re-validated, and
// anything else (or an unparsable summary) becomes an explicit unknown.
export function fromSummary(text) {
  let raw;
  try {
    assert(typeof text === 'string' && text.length > 0 && Buffer.byteLength(text) <= MAX_SUMMARY_BYTES);
    raw = JSON.parse(text);
    assert(raw && typeof raw === 'object' && !Array.isArray(raw));
  } catch { return { model: modelSummary(null), ending: NO_ENDING, readReason: 'execution_summary_unavailable', exit: { reason: 'exit_report_unavailable' }, handoff: NO_HANDOFF }; }
  const deniedCounts = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    return entries.length <= TOOLS.size + 2 && entries.every(([tool, n]) => (TOOLS.has(tool) || tool === 'unknown' || tool === 'mcp') && count(n) !== null)
      ? Object.fromEntries(entries) : null;
  };
  const model = {
    result_subtype: oneOf(raw.result_subtype, SUBTYPES),
    is_error: typeof raw.is_error === 'boolean' ? raw.is_error : null,
    num_turns: count(raw.num_turns),
    permission_denials_count: count(raw.permission_denials_count),
    denied_tool_counts: deniedCounts(raw.denied_tool_counts),
  };
  const handoff = {
    request_after_main: oneOf(raw.request_after_main, FILE_STATES),
    exit_after_main: oneOf(raw.exit_after_main, FILE_STATES),
    resume_decision: oneOf(raw.resume_decision, RESUME_DECISIONS),
    resume_outcome: oneOf(raw.resume_outcome, STEP_OUTCOMES),
    request_after_resume: oneOf(raw.request_after_resume, AFTER_RESUME_STATES),
    exit_after_resume: oneOf(raw.exit_after_resume, AFTER_RESUME_STATES),
    resume_result_subtype: oneOf(raw.resume_result_subtype, SUBTYPES),
    resume_num_turns: count(raw.resume_num_turns),
    resume_permission_denials_count: count(raw.resume_permission_denials_count),
    resume_denied_tool_counts: deniedCounts(raw.resume_denied_tool_counts),
  };
  const ending = {
    background_started: count(raw.background_started), background_finished: count(raw.background_finished),
    background_open_at_result: count(raw.background_open_at_result), bash_timed_out: count(raw.bash_timed_out),
    moved_to_background: count(raw.moved_to_background), detached_commands: count(raw.detached_commands),
    structured_reminders: count(raw.structured_reminders), structured_output: oneOf(raw.structured_output, STRUCTURED_STATES),
    last_stop_reason: oneOf(raw.last_stop_reason, STOP_REASONS), terminal_reason: oneOf(raw.terminal_reason, TERMINAL_REASONS),
    last_tool: raw.last_tool === 'none' || raw.last_tool === 'unknown' || raw.last_tool === 'mcp' || TOOLS.has(raw.last_tool) ? raw.last_tool : null,
    handoff_source: oneOf(raw.handoff_source, HANDOFF_SOURCES) };
  const code = oneOf(raw.model_exit_code, EXIT_CODES);
  return { model, ending, executionHash: hash(raw.execution_file_sha256, 64), readReason: oneOf(raw.read_reason, READ_REASONS),
    exit: code ? { code } : { reason: oneOf(raw.exit_reason, EXIT_REASONS) ?? 'exit_report_unavailable' }, handoff };
}

export function save(output, env = process.env, { handoff } = {}) {
  assert(path.isAbsolute(env.RUNNER_TEMP ?? '') && path.isAbsolute(output), 'absolute temp paths required');
  assert.equal(path.basename(output), 'autopilot-diagnostic');
  assert.equal(fs.realpathSync(path.dirname(output)), fs.realpathSync(env.RUNNER_TEMP));
  let data;
  if (handoff !== undefined) {
    // The publish job: the summary the model job packed. Missing, altered or unparsable -> explicit unknowns.
    assert(path.isAbsolute(handoff), 'absolute handoff path required');
    const summary = fromSummary(readHandoffSummary(handoff));
    data = receipt(env, null, summary.executionHash, summary.readReason, summary.exit, summary.model, summary.handoff, summary.ending);
  } else {
    // On the runner that holds the files (tests, local use): the same typed summary the model job packs.
    const summary = fromSummary(JSON.stringify(summarize(env)));
    data = receipt(env, null, summary.executionHash, summary.readReason, summary.exit, summary.model, summary.handoff, summary.ending);
  }
  fs.mkdirSync(output, { mode: 0o700 }); // never reuse a directory or upload its prior contents
  fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return data;
}

export function checkWiring(source) {
  checkProgressWiring(source);
  // The model job reduces the execution file to a typed summary (trusted tools from the
  // workflow commit) packed into the handoff; the publish job, after the output check,
  // assembles the receipt from it.
  const [modelJob, publishJob] = source.split('\n  publish:\n');
  assert(publishJob, 'publish job must exist');
  const summary = modelJob.split('      - name: Summarize the execution file\n')[1]?.split('\n      - name:')[0];
  assert(summary, 'execution summary must be wired in the model job');
  assert.match(summary, /(^|\n)        id: exec_summary\n/);
  assert.match(summary, /!cancelled\(\) &&\s+\(steps\.claude\.outcome == 'success' \|\| steps\.claude\.outcome == 'failure'\)/);
  assert.match(summary, /\n        continue-on-error: true\n/, 'the summary must not change the execution verdict');
  assert.match(summary, /git worktree add --detach "\$RUNNER_TEMP\/diagnostic-tools" "\$GITHUB_SHA"/);
  assert.match(summary, /node "\$RUNNER_TEMP\/diagnostic-tools\/scripts\/autopilot-diagnostics.mjs" --summarize/);
  // After the resume (the files it may have written) and before pack (which puts the summary in the handoff).
  for (const line of ['RESUME_OUTCOME: ${{ steps.resume.outcome }}', 'RESUME_DECISION: ${{ steps.handoff_files.outputs.resume_decision }}',
    'REQUEST_AFTER_MAIN: ${{ steps.handoff_files.outputs.request_after_main }}', 'EXIT_AFTER_MAIN: ${{ steps.handoff_files.outputs.exit_after_main }}',
    'MAIN_EXECUTION_SHA256: ${{ steps.handoff_files.outputs.main_execution_sha256 }}']) {
    assert(summary.includes(`\n          ${line}\n`), `the summary must receive ${line.split(':')[0]}`);
  }
  const at = name => modelJob.indexOf(`      - name: ${name}\n`);
  assert(at('Resume the session once for the missing handoff files') > 0
    && at('Resume the session once for the missing handoff files') < at('Summarize the execution file')
    && at('Summarize the execution file') < at('Pack the work for the publish job'), 'summarize after the resume and before pack');
  // A job output carrying JSON is dropped by the runner in this job (2026-10-22): never pass the summary that way.
  assert.doesNotMatch(modelJob, /\n      exec_summary: /, 'the summary travels in the handoff, not as a job output');
  const step = publishJob.split('      - name: Preserve bounded execution diagnostics\n')[1]?.split('\n      - name:')[0];
  assert(step, 'diagnostic receipt must be wired');
  assert.match(step, /!cancelled\(\) &&\s+\(needs\.autopilot\.outputs\.model_outcome == 'success' \|\| needs\.autopilot\.outputs\.model_outcome == 'failure'\)/);
  assert.match(step, /node "\$GITHUB_WORKSPACE\/tools\/scripts\/autopilot-diagnostics.mjs" --save "\$RUNNER_TEMP\/autopilot-diagnostic" --handoff "\$RUNNER_TEMP\/handoff"\n/);
  assert.match(publishJob, /\n          path: \$\{\{ runner\.temp \}\}\/handoff\n/, 'the receipt reads the downloaded handoff');
  assert.doesNotMatch(step, /EXEC_SUMMARY/);
  assert.match(step, /OUTPUT_REASON_CODE: \$\{\{ steps.output.outputs.reason_code \}\}/);
  assert.match(step, /CHECKPOINT_REASON: \$\{\{ needs.autopilot.outputs.checkpoint_reason \}\}/);
  assert.match(step, /AUDIT_VERDICT: \$\{\{ needs.autopilot.outputs.audit_verdict \}\}/);
  assert.doesNotMatch(step, /secrets\./);
  const upload = publishJob.split('      - name: Upload bounded execution diagnostics\n')[1]?.split('\n  #')[0];
  assert(upload, 'diagnostic upload must be wired');
  assert.match(upload, /if: always\(\) && steps.diagnostics.outputs.saved == 'true'/);
  assert.match(upload, /\n        continue-on-error: true\n/, 'diagnostic upload must not change the execution verdict');
  assert.match(upload, /uses: actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(upload, /path: \$\{\{ runner.temp \}\}\/autopilot-diagnostic\n/);
  assert.match(upload, /retention-days: 7\n/);
  assert.doesNotMatch(source, /show_full_output:\s*['"]?true/);
  // The prompt must ask for the finite exit code the receipt reads, on that same line
  // (a word such as "other" appears elsewhere in the workflow anyway). 2026-10-24: it is the structured
  // result's exit_code (one list with HANDOFF_SCHEMA); the resume still writes the file in the same words.
  const exitStep = source.split('\n').find(line => line.includes('StructuredOutput の `exit_code`'));
  assert(exitStep, 'prompt must request the exit code in the structured result');
  for (const code of EXIT_CODES) assert(new RegExp(`(^|[^a-z_])${code}([^a-z_]|$)`).test(exitStep), `prompt must offer exit code ${code}`);
  assert.deepEqual(HANDOFF_SCHEMA.properties.exit_code.enum, [...EXIT_CODES], 'the schema offers exactly the receipt\'s exit codes');
  for (const line of ['HANDOFF_SOURCE: ${{ steps.handoff_files.outputs.handoff_source }}']) {
    assert(summary.includes(`\n          ${line}\n`), `the summary must receive ${line.split(':')[0]}`);
  }
}

async function main() {
  if (process.argv.includes('--selftest')) return (await import('./autopilot-diagnostics.test.mjs')).selftest();
  if (process.argv.includes('--check')) return checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
  if (process.argv[2] === '--summarize') {
    assert(path.isAbsolute(process.env.RUNNER_TEMP ?? ''), 'absolute RUNNER_TEMP required');
    const file = path.join(process.env.RUNNER_TEMP, SUMMARY_FILE);
    // A fresh file: never write through a planted file or link (pack copies it into the handoff).
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, JSON.stringify(summarize()) + '\n', { mode: 0o600, flag: 'wx' });
    console.log('Bounded execution summary prepared (typed fields only).');
    return;
  }
  assert.equal(process.argv[2], '--save');
  const at = process.argv.indexOf('--handoff');
  save(process.argv[3], process.env, at > 0 ? { handoff: process.argv[at + 1] } : {});
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
