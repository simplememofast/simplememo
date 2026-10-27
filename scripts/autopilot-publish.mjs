#!/usr/bin/env node
/**
 * Model-free publication of the Obsidian Autopilot (Actions route).
 *
 * The job where the model runs (job `autopilot` of obsidian-autopilot.yml) holds no
 * write credential: no GH_PAT, a read-only job token, no id-token, and a checkout
 * without persisted credentials. The model only commits locally. Its work leaves
 * that runner as an untrusted handoff (git bundle + request JSON + exit JSON), and
 * the `publish` job — a fresh runner that runs only this file from the workflow
 * commit, never the model — verifies it, pushes the day branch without force,
 * opens the PR, records the PR number with trusted code and pushes that record.
 *
 *   --inspect-handoff (model job, after the model, from a $GITHUB_SHA worktree) are the
 *              request and exit files there; resume the same session once for them?
 *   --pack     (model job, from a $GITHUB_SHA worktree) bundle the committed work
 *   --verify   (publish job, no credential) verdict: publish | push_only | none |
 *              duplicate | stopped | rejected_<code>
 *   --push     (PUBLISH_TOKEN) fast-forward push to claude/obsidian-auto-<day> only
 *   --open-pr  (PUBLISH_TOKEN) POST /pulls with the sanitized request
 *   --record   (no credential) run-ledger row with the PR number + regenerated report
 *   --check    workflow wiring guard;  --selftest  offline self-check
 *
 * Job logs are public: this file prints typed codes and counts only, never paths,
 * titles, commit messages, git stderr or credentials.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { OUTCOMES, validate as validateRuns } from './autopilot-runs.mjs';
import { hardDenyReason, MAX_COMMITS, MAX_TOTAL_BYTES, RECORD_PATHS } from './lib/autopilot-paths.mjs';
import { GATED_LEDGERS, ledgerChange } from './lib/ledger-append-only.mjs';
import { needsTranslationCheck, runTranslationCheck } from './lib/translation-check.mjs';

const require = createRequire(import.meta.url);
const { findUnapprovedPrincipals } = require('./merge-identity-check.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = 'simplememofast/simplememo';
export const REMOTE = `https://github.com/${REPO}.git`;
export const HANDOFF_REF = 'refs/autopilot/handoff';
export const QUARANTINE_REF = 'refs/autopilot/quarantine/head';
export const REMOTE_DAY_REF = 'refs/autopilot/quarantine/remote-day';
export const RECORD_IDENTITY = Object.freeze({ name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' });
const MAX_JSON_BYTES = 64 * 1024;
const MAX_BUNDLE_BYTES = 60 * 1024 * 1024;
const MAX_TITLE = 200;
const MAX_BODY = 30_000;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export const REQUEST_ACTIONS = ['pr', 'push_only', 'none'];
export const VERDICTS = ['publish', 'push_only', 'none', 'duplicate', 'stopped'];
// repair_of (lane F): the run_ids a repair day names. Same shape the ledger holds (an array of
// run_ids); each must already exist in main's run ledger and must not be the run's own id.
export const MAX_REPAIR_TARGETS = 20;
const RUN_REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
// Act's interpretRun and the wiring checks read these step names by substring.
export const RESERVED_STEP_WORDS = ['Gate', 'Claude Code', '緊急停止', '封じ込め', '予算ゲート', '振り分け',
  '使用量上限', '資格情報かを切り分ける', '実行中の支出閾値で停止', 'ターン上限で停止', '判定コード:'];
export const PUBLISH_SECRET_STEPS = ['Push the work branch', 'Open the PR', 'Push the ledger commit'];

const sha40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const dayOk = value => typeof value === 'string' && /^\d{8}$/.test(value);
export const dayBranch = day => { assert(dayOk(day), 'day must be YYYYMMDD'); return `claude/obsidian-auto-${day}`; };
export class PublishError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new PublishError(code); };

// Git never runs repository hooks/fsmonitor here, ignores system config and never prompts.
export function gitEnv(token = null, base = process.env) {
  const env = { ...base, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_ASKPASS: 'echo', GCM_INTERACTIVE: 'never' };
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key)) delete env[key];
  delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE; delete env.GIT_OBJECT_DIRECTORY;
  if (token) {
    // The credential lives only in this child's environment: never argv, never .git/config.
    // A credential-bearing git reads no global config either (url.insteadOf / http.proxy planted
    // in ~/.gitconfig by an earlier step could redirect the push).
    env.GIT_CONFIG_GLOBAL = '/dev/null';
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  }
  return env;
}

export function git(cwd, args, { token = null, input, allowFail = false, encoding = 'utf8' } = {}) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
    cwd, env: gitEnv(token), input, encoding, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    if (allowFail) return null;
    fail('git_failed');
  }
  return result.stdout;
}

export function readBounded(file, limit = MAX_JSON_BYTES) {
  let fd;
  try {
    if (!fs.lstatSync(file).isFile()) return { reason: 'not_file' };
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) return { reason: 'oversized' };
    // Sized by the file, not the limit (the execution file's limit is large); a file that grows
    // while it is read is not trusted.
    const buffer = Buffer.alloc(stat.size + 1);
    const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (length > stat.size) return { reason: 'unreadable' };
    return { bytes: buffer.subarray(0, length) };
  } catch (error) {
    return { reason: error.code === 'ENOENT' ? 'missing' : 'unreadable' };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function readJson(file) {
  const read = readBounded(file);
  if (!read.bytes) return { reason: read.reason };
  try { return { value: JSON.parse(read.bytes.toString('utf8')) }; } catch { return { reason: 'invalid_json' }; }
}

// ── after the model (model job, from a $GITHUB_SHA worktree; every file there is untrusted) ──
// 2026-10-22 (run 39701630744): the model committed its work and ended without writing the request
// (prompt step 5) or the exit code (step 8), so the day published nothing. When either is missing
// after a successful main step, the workflow resumes the same session once, with a fixed prompt that
// asks only for those files, narrower tools, a small turn cap and a budget inside the run's cap.
export const HANDOFF_FILES = Object.freeze({ request: 'autopilot-pr-request.json', exit: 'autopilot-exit.json' });
export const EXECUTION_FILE = 'claude-execution-output.json';
// The resume rewrites the action's execution file: the main session's is copied first (diagnostics/cost).
export const MAIN_EXECUTION_COPY = 'autopilot-execution-main.json';
// The bounded execution summary travels in the handoff (a job output carrying JSON was dropped by the runner).
export const SUMMARY_FILE = 'autopilot-summary.json';
export const FILE_STATES = ['present', 'missing', 'not_file', 'oversized', 'unreadable', 'invalid_json', 'not_object'];
export const RESUME_DECISIONS = ['not_needed', 'nothing_to_publish', 'model_not_success', 'session_id_invalid', 'time_unknown',
  'time_short', 'cost_unknown', 'budget_exhausted', 'resume'];
// max_usd/max_turns/minutes are the resume step's ceilings; below min_usd of the run's remaining budget there is
// no room for the few calls the files need, so the resume is not started.
export const RESUME_LIMITS = Object.freeze({ max_usd: 3, min_usd: 0.5, max_turns: 12, minutes: 8 });
// The model job's limit, and room for what runs outside the resume: the checkout before the Gate step starts the
// job's clock, and the steps after the resume (audit, cost, checkpoint, summary, pack, upload; ~1 minute in all on
// 2026-10-22). A resume that does not fit would cut the job before the handoff is uploaded.
export const JOB_TIME = Object.freeze({ job_minutes: 90, outside_minutes: 5 });
// A day that ends at prompt step 0 writes only the exit code (step 8): no request is expected.
export const NO_REQUEST_EXIT_CODE = 'skipped_already_done';
// A long session (the 2026-10-22 trial ran 236 turns) must not make the main cost unreadable.
export const MAX_EXECUTION_BYTES = 128 * 1024 * 1024;
// 2026-10-24 (run 40047075713): the main session again ended without either file (2 of 2 trials), and the
// resume ran 0 turns: on resume, Claude Code 2.1.245 first answers a stale notice for a background task the
// main session left running (shouldQuery:false → result with num_turns 0), and the pinned action stops at that
// first result. Two changes, both through claude_args of the main step:
//  - the final handoff is the session's structured result (--json-schema HANDOFF_SCHEMA). When the model ends
//    its turn without calling StructuredOutput, the CLI itself tells it to (verified on 2.1.245, 2026-10-24),
//    so the handoff no longer depends on the model remembering two files. --inspect-handoff copies that result
//    into the two files; the publish job validates them exactly as before (same author: the model).
//  - background tasks are off (MAIN_SETTINGS): no task outlives the session, so a resume meets no stale notice.
//    Long checks run in the foreground, bounded by the Bash timeouts set here (default 10 min, max 40 min).
// The exit codes are the receipt's (autopilot-diagnostics.mjs re-exports this list).
export const EXIT_CODES = Object.freeze(['shipped_pr', 'no_ship_pr', 'skipped_already_done', 'blocked_unverifiable',
  'blocked_scope', 'blocked_local_check', 'abandoned_after_declaration', 'tool_denied', 'other']);
// Same limits as validateRequest (which the publish job still applies in full); [0-9] instead of \d keeps the
// schema free of backslashes inside claude_args.
export const HANDOFF_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['exit_code', 'request'], properties: {
  exit_code: { type: 'string', enum: [...EXIT_CODES] },
  request: { type: 'object', additionalProperties: false, required: ['action'], properties: {
    action: { type: 'string', enum: ['pr', 'push_only', 'none'] },
    title: { type: 'string', minLength: 1, maxLength: 200 },
    body: { type: 'string', maxLength: 30000 },
    run: { type: 'object', additionalProperties: false, required: ['run_id', 'outcome'], properties: {
      run_id: { type: 'string', pattern: '^ap-[0-9]{8}-actions(-[0-9]{1,20})?$' },
      outcome: { type: 'string', enum: ['shipped', 'no_artifact', 'failed'] },
      lane: { type: 'string', pattern: '^[A-F]$' },
      action: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' },
      artifact: { type: 'string', maxLength: 300 },
      failure_reason: { type: 'string', maxLength: 500 },
      failure_class: { type: 'string', pattern: '^[a-z][a-z0-9_-]{0,47}$' },
      repair_of: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } } } } } } } });
// The main step's process settings (claude_args --settings): background tasks off, foreground limits on.
export const MAIN_SETTINGS = '{"env":{"CLAUDE_CODE_DISABLE_BACKGROUND_TASKS":"1","BASH_DEFAULT_TIMEOUT_MS":"600000","BASH_MAX_TIMEOUT_MS":"2400000"}}';
// Tools that start CLI-tracked background work or schedule later turns; none of them can be answered in this route.
export const MAIN_DISALLOWED_TOOLS = 'Monitor,Workflow,ScheduleWakeup,CronCreate,CronDelete,RemoteTrigger,PushNotification';
export const HANDOFF_SOURCES = ['structured', 'files', 'none'];
export const STRUCTURED_STATES = ['present', 'absent', 'invalid', 'unreadable'];
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const validSessionId = value => typeof value === 'string' && SESSION_ID.test(value);
const usdValue = value => typeof value === 'string' && /^\d{1,6}(?:\.\d{1,20})?$/.test(value) ? Number(value) : null;

/** present when the file is a bounded regular file (no symlink) holding a JSON object; else why not. */
export function handoffFileState(file) {
  const read = readJson(file);
  if (read.reason) return FILE_STATES.includes(read.reason) ? read.reason : 'unreadable';
  return read.value && typeof read.value === 'object' && !Array.isArray(read.value) ? 'present' : 'not_object';
}

export function handoffFileStates(runnerTemp) {
  return { request: handoffFileState(path.join(runnerTemp, HANDOFF_FILES.request)),
    exit: handoffFileState(path.join(runnerTemp, HANDOFF_FILES.exit)) };
}

/** The main session's execution file (written by the pinned action after the session): hash and cost. */
export function readMainExecution(runnerTemp, execFile = '') {
  const expected = path.join(runnerTemp, EXECUTION_FILE);
  if (execFile && path.resolve(execFile) !== expected) return { reason: 'unexpected_path' };
  const read = readBounded(expected, MAX_EXECUTION_BYTES);
  if (!read.bytes) return { reason: read.reason };
  const sha256 = createHash('sha256').update(read.bytes).digest('hex');
  let doc;
  try { doc = JSON.parse(read.bytes.toString('utf8')); } catch { return { sha256, bytes: read.bytes, reason: 'invalid_json' }; }
  const result = (Array.isArray(doc) ? [...doc].reverse() : [doc]).find(item => item?.type === 'result');
  const cost = result?.total_cost_usd;
  return { sha256, bytes: read.bytes, doc, cost: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null };
}

// The request is model-written: its shape is bounded before anything serialises it. A value nested some
// thousands deep makes JSON.stringify throw RangeError, which took --inspect-handoff and --summarize down with
// it. Iterative, never recursive; the byte count is a lower bound of the serialised size (UTF-8 never has fewer
// bytes than UTF-16 units), so a request within MAX_JSON_BYTES is never turned away here. A container's commas
// and keys are counted before its children are queued, so a very wide one is turned away without queuing them.
export const MAX_STRUCTURED_DEPTH = 16;
function boundedShape(value, maxDepth, maxBytes) {
  const stack = [[value, 1]];
  let bytes = 0;
  while (stack.length) {
    const [item, depth] = stack.pop();
    bytes += typeof item === 'string' ? item.length + 2 : 1;
    if (item !== null && typeof item === 'object') {
      if (depth > maxDepth) return false;
      const children = Object.values(item);
      bytes += Math.max(children.length - 1, 0);
      if (!Array.isArray(item)) for (const key of Object.keys(item)) bytes += key.length + 3;
      if (bytes > maxBytes) return false;
      for (const child of children) stack.push([child, depth + 1]);
    }
    if (bytes > maxBytes) return false;
  }
  return true;
}

/**
 * The session's structured result (--json-schema), as the bytes of the two handoff files, or why not.
 * Shape only: the request is model-written either way and the publish job validates it in full.
 */
export function structuredHandoff(doc) {
  const result = (Array.isArray(doc) ? [...doc].reverse() : [doc]).find(item => item?.type === 'result');
  const value = result?.structured_output;
  if (value === undefined || value === null) return { state: 'absent' };
  if (typeof value !== 'object' || Array.isArray(value)) return { state: 'invalid' };
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'exit_code,request' || !EXIT_CODES.includes(value.exit_code)) return { state: 'invalid' };
  if (!value.request || typeof value.request !== 'object' || Array.isArray(value.request)) return { state: 'invalid' };
  if (!boundedShape(value.request, MAX_STRUCTURED_DEPTH, MAX_JSON_BYTES)) return { state: 'invalid' };
  const request = Buffer.from(JSON.stringify(value.request));
  if (request.length > MAX_JSON_BYTES) return { state: 'invalid' };
  return { state: 'present', request, exit: Buffer.from(JSON.stringify({ code: value.exit_code })) };
}

// Never through whatever is at the path (a planted link or file): a fresh file in a fresh directory, renamed
// over it (rename replaces a link itself, never its target; a directory there makes it fail, and the state says so).
function materialize(runnerTemp, name, bytes) {
  const dir = fs.mkdtempSync(path.join(runnerTemp, 'autopilot-structured-'));
  try {
    const fresh = path.join(dir, name);
    fs.writeFileSync(fresh, bytes, { mode: 0o600, flag: 'wx' });
    fs.renameSync(fresh, path.join(runnerTemp, name));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Pure: resume once only for a successful main step whose files are missing, within the job's time and the run's budget. */
export function resumeDecision({ modelOutcome, states, exitCode, sessionId, elapsedSeconds, runtimeBudgetUsd, mainCostUsd }) {
  if (states.request === 'present' && states.exit === 'present') return { decision: 'not_needed' };
  if (states.request === 'missing' && states.exit === 'present' && exitCode === NO_REQUEST_EXIT_CODE) return { decision: 'nothing_to_publish' };
  // A failed main step publishes push_only, which never reads the request; a limit stop must not spend more.
  if (modelOutcome !== 'success') return { decision: 'model_not_success' };
  if (!validSessionId(sessionId)) return { decision: 'session_id_invalid' };
  // A request already written publishes without the resume; a resume cut by the job's limit would lose it.
  if (!(Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0)) return { decision: 'time_unknown' };
  if (elapsedSeconds > (JOB_TIME.job_minutes - JOB_TIME.outside_minutes - RESUME_LIMITS.minutes) * 60) return { decision: 'time_short' };
  // The run's cap (scripts/autopilot-budget.mjs --runtime-budget) covers the main session and the resume.
  if (!(Number.isFinite(runtimeBudgetUsd) && runtimeBudgetUsd > 0 && Number.isFinite(mainCostUsd) && mainCostUsd >= 0)) {
    return { decision: 'cost_unknown' };
  }
  const usd = Math.floor(Math.min(RESUME_LIMITS.max_usd, runtimeBudgetUsd - mainCostUsd) * 100) / 100;
  if (!(usd >= RESUME_LIMITS.min_usd)) return { decision: 'budget_exhausted' };
  return { decision: 'resume', session_id: sessionId, budget_usd: usd.toFixed(2) };
}

export function inspectAfterModel({ runnerTemp, modelOutcome, sessionId, runtimeBudgetUsd, execFile, jobStartedEpoch, now = Date.now() }) {
  assert(path.isAbsolute(runnerTemp ?? ''), 'absolute RUNNER_TEMP required');
  // What the model wrote itself (reported as *_after_main), then the session's structured result over it.
  const written = handoffFileStates(runnerTemp);
  const main = readMainExecution(runnerTemp, execFile);
  const structured = main.doc !== undefined ? structuredHandoff(main.doc) : { state: 'unreadable' };
  if (structured.state === 'present') {
    for (const key of ['request', 'exit']) {
      try { materialize(runnerTemp, HANDOFF_FILES[key], structured[key]); } catch { /* the state below says what is there */ }
    }
  }
  const states = structured.state === 'present' ? handoffFileStates(runnerTemp) : written;
  const source = states.request === 'present' && states.exit === 'present'
    ? (structured.state === 'present' ? 'structured' : 'files') : 'none';
  const exit = states.exit === 'present' ? readJson(path.join(runnerTemp, HANDOFF_FILES.exit)).value : null;
  // The Gate step's `date +%s` (the job's clock, recorded before the model ran).
  const started = typeof jobStartedEpoch === 'string' && /^\d{10}$/.test(jobStartedEpoch) ? Number(jobStartedEpoch) : NaN;
  const decided = resumeDecision({ modelOutcome, states, exitCode: exit?.code, sessionId, elapsedSeconds: Math.floor(now / 1000) - started,
    runtimeBudgetUsd: usdValue(runtimeBudgetUsd), mainCostUsd: main.cost });
  if (decided.decision === 'resume') {
    // Never over an existing path (a planted file or link): readers then find a copy that does not
    // match main_execution_sha256 and report it as unknown. The resume itself does not depend on it.
    try { fs.writeFileSync(path.join(runnerTemp, MAIN_EXECUTION_COPY), main.bytes, { mode: 0o600, flag: 'wx' }); } catch { /* see above */ }
  }
  return { states, written, handoff_source: source, structured_output: structured.state, ...decided, main_execution_sha256: main.sha256 ?? null };
}

/** GITHUB_OUTPUT values: typed only. session_id and the budget are set only for a resume. */
export function inspectOutputs(result) {
  const missing = ['request', 'exit'].filter(name => result.states[name] !== 'present');
  const written = result.written ?? result.states;
  return { request_after_main: written.request, exit_after_main: written.exit,
    missing: missing.length ? missing.join(',') : 'none', resume: result.decision === 'resume',
    handoff_source: HANDOFF_SOURCES.includes(result.handoff_source) ? result.handoff_source : 'none',
    structured_output: STRUCTURED_STATES.includes(result.structured_output) ? result.structured_output : 'unreadable',
    resume_decision: result.decision, main_execution_sha256: result.main_execution_sha256 ?? '',
    ...(result.decision === 'resume' ? { session_id: result.session_id, resume_budget_usd: result.budget_usd } : {}) };
}

// ── request (written by the model: untrusted) ──────────────────────────────
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;
// Same vocabulary as the ledger's classes (no_artifact, usage_limit, route-absent, runner-timeout, ...).
const FAILURE_CLASS = /^[a-z][a-z0-9_-]{0,47}$/;
const plain = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

/**
 * Returns { request } or { code }. The run fields are re-validated by autopilot-runs.mjs when appended;
 * repair_of is checked here for shape and against main's ledger by repairOfCode() (verify and record).
 */
export function validateRequest(raw, day) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { code: 'request_shape' };
  const allowed = new Set(['action', 'title', 'body', 'run']);
  if (Object.keys(raw).some(key => !allowed.has(key))) return { code: 'request_unknown_field' };
  if (!REQUEST_ACTIONS.includes(raw.action)) return { code: 'request_action' };
  if (raw.action !== 'pr') return { request: { action: raw.action } };
  if (!plain(raw.title, MAX_TITLE)) return { code: 'request_title' };
  if (typeof raw.body !== 'string' || raw.body.length > MAX_BODY) return { code: 'request_body' };
  const run = raw.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return { code: 'request_run' };
  const runFields = new Set(['run_id', 'outcome', 'lane', 'action', 'artifact', 'failure_reason', 'failure_class', 'repair_of']);
  if (Object.keys(run).some(key => !runFields.has(key))) return { code: 'request_run_unknown_field' };
  const id = /^ap-(\d{8})-actions(?:-\d{1,20})?$/.exec(run.run_id ?? '');
  if (!id || id[1] !== day) return { code: 'request_run_id' };
  if (!OUTCOMES.includes(run.outcome) || !['shipped', 'no_artifact', 'failed'].includes(run.outcome)) return { code: 'request_outcome' };
  if (run.lane != null && !/^[A-F]$/.test(run.lane)) return { code: 'request_lane' };
  if (run.action != null && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(run.action)) return { code: 'request_run_action' };
  // Only the shape is checked here, not what the artifact names: refusing discards the day's committed work (nothing
  // pushed) over a field only the ledger reads. record() decides what the row records (ledgerArtifact).
  if (run.artifact != null && !plain(run.artifact, 300)) return { code: 'request_artifact' };
  if (run.failure_reason != null && !plain(run.failure_reason, 500)) return { code: 'request_failure_reason' };
  if (run.failure_class != null && !FAILURE_CLASS.test(run.failure_class)) return { code: 'request_failure_class' };
  // A day that did not ship is recorded with why (autopilot-runs.mjs validate() requires failure_reason)
  // and what kind (autopilot-selfheal.mjs --check requires failure_class). Refused here, before any push,
  // instead of failing in record after the PR is open.
  if (run.outcome !== 'shipped' && run.failure_reason == null) return { code: 'request_failure_reason' };
  if (run.outcome !== 'shipped' && run.failure_class == null) return { code: 'request_failure_class' };
  if (run.repair_of != null) {
    const targets = run.repair_of;
    if (!Array.isArray(targets) || !targets.length || targets.length > MAX_REPAIR_TARGETS
      || !targets.every(target => typeof target === 'string' && RUN_REF.test(target))
      || new Set(targets).size !== targets.length) return { code: 'request_repair_of' };
    if (targets.includes(run.run_id)) return { code: 'request_repair_of_self' };
  }
  return { request: { action: 'pr', title: raw.title.replace(CONTROL, ''), body: raw.body.replace(CONTROL, ''),
    run: Object.fromEntries(Object.entries(run).filter(([, value]) => value != null)
      .map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) } };
}

/** run_ids of main's run ledger as last fetched (the trusted base), or null when unreadable. */
export function baseRunIds(repo) {
  const text = git(repo, ['show', 'refs/remotes/origin/main:data/autopilot-runs.json'], { allowFail: true });
  try {
    const doc = JSON.parse(text);
    return Array.isArray(doc?.runs) ? new Set(doc.runs.map(row => row?.run_id).filter(id => typeof id === 'string')) : null;
  } catch { return null; }
}

/** null when the run names no repair, or names only existing runs other than itself; else a typed code. */
export function repairOfCode(run, ids) {
  if (run?.repair_of == null) return null;
  if (!ids) return 'repair_of_base_unreadable';
  // A run without its own id cannot name a repair (fails closed instead of dropping the self check).
  if (typeof run.run_id !== 'string' || run.repair_of.includes(run.run_id)) return 'repair_of_unknown';
  return run.repair_of.every(target => ids.has(target)) ? null : 'repair_of_unknown';
}

export function prPayload(request, day) {
  return { title: request.title, head: dayBranch(day), base: 'main',
    body: request.body.slice(0, MAX_BODY), maintainer_can_modify: false, draft: false };
}

// ── pack (model job; output is untrusted by construction) ─────────────────
export function pack({ workspace, out, day, takeover = false, runnerTemp = process.env.RUNNER_TEMP }) {
  assert(path.isAbsolute(workspace) && path.isAbsolute(out), 'absolute paths required');
  const real = fs.realpathSync(workspace);
  const parent = fs.realpathSync(path.dirname(out));
  assert(!(parent + path.sep).startsWith(real + path.sep) && parent !== real, 'handoff must be outside the repository');
  fs.mkdirSync(out, { mode: 0o700 });
  const manifest = { schema_version: 1, day, takeover: takeover === true, head: null, base: null, commit_count: 0, files: {} };
  const head = git(workspace, ['rev-parse', '--verify', 'HEAD^{commit}'], { allowFail: true })?.trim();
  let base = null;
  if (takeover) {
    const claim = git(workspace, ['rev-parse', '--verify', `refs/remotes/origin/${dayBranch(day)}^{commit}`], { allowFail: true })?.trim();
    if (claim && git(workspace, ['merge-base', '--is-ancestor', claim, head], { allowFail: true }) !== null) base = claim;
  }
  base ??= git(workspace, ['merge-base', head, 'refs/remotes/origin/main'], { allowFail: true })?.trim() ?? null;
  if (sha40(head) && sha40(base) && head !== base) {
    manifest.head = head; manifest.base = base;
    manifest.commit_count = Number(git(workspace, ['rev-list', '--count', head, `^${base}`]).trim());
    git(workspace, ['update-ref', HANDOFF_REF, head]);
    git(workspace, ['bundle', 'create', path.join(out, 'work.bundle'), HANDOFF_REF, `^${base}`]);
  }
  // summary.json: the bounded execution summary (scripts/autopilot-diagnostics.mjs --summarize, typed
  // fields only), re-validated by the publish job's receipt. Its sha256 is in the manifest like the rest.
  for (const [from, to] of [[HANDOFF_FILES.request, 'request.json'], [HANDOFF_FILES.exit, 'exit.json'], [SUMMARY_FILE, 'summary.json']]) {
    const read = runnerTemp ? readBounded(path.join(runnerTemp, from)) : { reason: 'missing' };
    if (read.bytes) fs.writeFileSync(path.join(out, to), read.bytes, { mode: 0o600, flag: 'wx' });
  }
  for (const name of ['work.bundle', 'request.json', 'exit.json', 'summary.json']) {
    const file = path.join(out, name);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    manifest.files[name] = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { commit_count: manifest.commit_count, bundled: Boolean(manifest.head) };
}

// ── verify (publish job, no credential) ────────────────────────────────────
function parseRaw(text) {
  // diff-tree/diff --raw -z: ":<old> <new> <oldsha> <newsha> <status>\0<path>\0"
  const fields = text.split('\0');
  const entries = [];
  let i = 0;
  while (i < fields.length) {
    const meta = fields[i].replace(/^\n/, '');
    if (!meta) { i += 1; continue; }
    const m = /^:(\d{6}) (\d{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z])\d*$/.exec(meta);
    if (!m || fields[i + 1] === undefined) fail('rejected_unparsed_diff');
    entries.push({ oldMode: m[1], mode: m[2], oldSha: m[3], sha: m[4], status: m[5], path: fields[i + 1] });
    i += 2;
  }
  return entries;
}

function blobSizes(repo, shas) {
  const unique = [...new Set(shas.filter(s => s && !/^0{40}$/.test(s)))];
  if (!unique.length) return new Map();
  const out = git(repo, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { input: unique.join('\n') + '\n' });
  const sizes = new Map();
  for (const line of out.trim().split('\n')) {
    const [sha, type, size] = line.split(' ');
    if (type !== 'blob') fail('rejected_object_type');
    sizes.set(sha, Number(size));
  }
  return sizes;
}

function checkEntries(repo, entries, gscDay) {
  // Mode and path first: a gitlink or symlink is refused before any object is read.
  for (const entry of entries) {
    const reason = hardDenyReason(entry.path, { mode: entry.mode, gscDay });
    if (reason) fail(`rejected_${reason}`);
  }
  const sizes = blobSizes(repo, entries.filter(e => e.status !== 'D').map(e => e.sha));
  for (const entry of entries) {
    if (!['A', 'M', 'D', 'T'].includes(entry.status)) fail('rejected_diff_status');
    const reason = hardDenyReason(entry.path, { mode: entry.mode, size: entry.status === 'D' ? null : sizes.get(entry.sha) ?? null, gscDay });
    if (reason) fail(`rejected_${reason}`);
  }
  return sizes;
}

function mainEntry(repo, cache, file) {
  if (!cache.map) {
    cache.map = new Map();
    const listing = git(repo, ['ls-tree', '-r', '-z', '--full-tree', 'refs/remotes/origin/main']);
    for (const row of listing.split('\0').filter(Boolean)) {
      const tab = row.indexOf('\t');
      const [mode, , sha] = row.slice(0, tab).split(' ');
      cache.map.set(row.slice(tab + 1), `${mode} ${sha}`);
    }
  }
  return cache.map.get(file) ?? null;
}

function commitPrincipals(repo, commits) {
  const out = git(repo, ['show', '-s', '--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e', ...commits]);
  return out.split('\x1e').map(part => part.replace(/^\n/, '')).filter(Boolean).map(part => {
    const [sha, an, ae, cn, ce, ...message] = part.split('\0');
    return { sha, commit: { author: { name: an, email: ae }, committer: { name: cn, email: ce }, message: message.join('\0') } };
  });
}

/**
 * Everything in the handoff is model-controlled. Returns { verdict, head, commit_count, request }.
 * listPrs(branch) -> [{number}] (GitHub read, state=all); prodStatusDate() -> 'YYYY-MM-DD' | null.
 */
export async function verifyHandoff({ handoff, repo, day, takeover = false, force = false, modelOutcome,
  remote = 'origin', readToken = null, listPrs, prodStatusDate = async () => null, gscDay = null,
  translations = checkTranslations }) {
  const branch = dayBranch(day);
  const dash = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  if (!['success', 'failure'].includes(modelOutcome)) fail('rejected_model_outcome');
  const manifest = readJson(path.join(handoff, 'manifest.json'));
  if (!manifest.value) fail('rejected_handoff_missing');
  const bundle = path.join(handoff, 'work.bundle');
  if (!fs.existsSync(bundle)) return { verdict: 'none', commit_count: 0 };
  const st = fs.lstatSync(bundle);
  if (!st.isFile() || st.size > MAX_BUNDLE_BYTES) fail('rejected_bundle_size');

  // Fresh remote state, never the handoff's claims.
  // readToken is the job's read-only token (contents: read); it never reaches a push.
  git(repo, ['fetch', '--no-tags', '--quiet', remote, '+refs/heads/main:refs/remotes/origin/main'], { token: readToken });
  const remoteDay = git(repo, ['ls-remote', '--heads', remote, `refs/heads/${branch}`], { token: readToken }).trim().split(/\s+/)[0] || null;
  if (remoteDay) git(repo, ['fetch', '--no-tags', '--quiet', remote, `+refs/heads/${branch}:${REMOTE_DAY_REF}`], { token: readToken });

  const stop = (() => {
    const text = git(repo, ['show', 'refs/remotes/origin/main:data/emergency-stop.json'], { allowFail: true });
    try { const d = JSON.parse(text); return Boolean(d.stopped || d.agents?.actions?.stopped); } catch { return true; }
  })();
  if (stop) return { verdict: 'stopped', commit_count: 0 };

  if (git(repo, ['bundle', 'verify', '--quiet', bundle], { allowFail: true }) === null) fail('rejected_bundle_verify');
  const heads = git(repo, ['bundle', 'list-heads', bundle]).trim().split('\n').filter(Boolean);
  if (heads.length !== 1 || heads[0].split(' ')[1] !== HANDOFF_REF) fail('rejected_bundle_heads');
  git(repo, ['update-ref', '-d', QUARANTINE_REF], { allowFail: true });
  if (git(repo, ['-c', 'transfer.fsckObjects=true', '-c', 'fetch.fsckObjects=true', 'fetch', '--no-tags', '--quiet',
    bundle, `+${HANDOFF_REF}:${QUARANTINE_REF}`], { allowFail: true }) === null) fail('rejected_bundle_fetch');
  const head = git(repo, ['rev-parse', '--verify', `${QUARANTINE_REF}^{commit}`]).trim();

  const ancestor = (a, b) => git(repo, ['merge-base', '--is-ancestor', a, b], { allowFail: true }) !== null;
  if (ancestor(head, 'refs/remotes/origin/main')) return { verdict: 'none', head, commit_count: 0 };
  const base = git(repo, ['merge-base', head, 'refs/remotes/origin/main'], { allowFail: true })?.trim();
  if (!sha40(base)) fail('rejected_unrelated_history');
  const commits = git(repo, ['rev-list', '--reverse', head, '^refs/remotes/origin/main']).trim().split('\n').filter(Boolean);
  if (!commits.length) return { verdict: 'none', head, commit_count: 0 };
  if (commits.length > MAX_COMMITS) fail('rejected_too_many_commits');

  // Claim and duplicate checks: the day branch is claimed by this push, not earlier.
  if (remoteDay) {
    if (!(takeover || force)) return { verdict: 'duplicate', head, commit_count: commits.length };
    if (!ancestor(REMOTE_DAY_REF, head)) return { verdict: 'duplicate', head, commit_count: commits.length };
  }
  const prs = await listPrs(branch);
  if (!Array.isArray(prs)) fail('rejected_pr_inventory');
  if (prs.length) return { verdict: 'duplicate', head, commit_count: commits.length };
  if (!force) {
    const mainStatus = git(repo, ['show', 'refs/remotes/origin/main:data/autopilot-status.json'], { allowFail: true });
    let mainDate = null; try { mainDate = JSON.parse(mainStatus).date_jst; } catch { /* unreadable is not today */ }
    let prodDate = null; try { prodDate = await prodStatusDate(); } catch { /* unknown is not a duplicate */ }
    if (mainDate === dash || prodDate === dash) return { verdict: 'duplicate', head, commit_count: commits.length };
  }

  // Path, mode and size policy over every pushed commit and over the final tree.
  const cache = {};
  let total = 0;
  const seen = new Set();
  for (const commit of commits) {
    const parents = git(repo, ['rev-list', '--parents', '-n', '1', commit]).trim().split(' ').slice(1);
    for (const extra of parents.slice(1)) if (!ancestor(extra, 'refs/remotes/origin/main')) fail('rejected_merge_commit');
    let entries = parseRaw(git(repo, ['diff-tree', '-r', '-z', '--raw', '--no-abbrev', '--no-renames', '--no-commit-id',
      parents[0] ?? EMPTY_TREE, commit]));
    // A merge of main brings main's (already public, trusted) content: only check what differs from main.
    if (parents.length > 1) entries = entries.filter(e => mainEntry(repo, cache, e.path) !== `${e.mode} ${e.sha}`);
    const sizes = checkEntries(repo, entries, gscDay);
    for (const e of entries) if (e.status !== 'D' && !seen.has(e.sha)) { seen.add(e.sha); total += sizes.get(e.sha) ?? 0; }
    if (total > MAX_TOTAL_BYTES) fail('rejected_total_size');
  }
  checkEntries(repo, parseRaw(git(repo, ['diff', '-z', '--raw', '--no-abbrev', '--no-renames', '--no-ext-diff', '--no-textconv', base, head])), gscDay);

  // A forbidden identity must never reach a public branch (same rule as auto-merge).
  if (findUnapprovedPrincipals(commitPrincipals(repo, commits)).length) fail('rejected_identity');

  // The ledgers that gate the Autopilot (containment, budget) change only the way the runbook asks for
  // (scripts/lib/ledger-append-only.mjs), compared with the merge base. Checked on push_only days too: the branch is public.
  for (const file of GATED_LEDGERS) {
    const code = ledgerChange(file, git(repo, ['show', `${base}:${file}`], { allowFail: true }),
      git(repo, ['show', `${head}:${file}`], { allowFail: true }), { day: dash });
    if (code) fail(`rejected_ledger_${code}`);
  }

  if (modelOutcome === 'failure') return { verdict: 'push_only', head, commit_count: commits.length };
  const raw = readJson(path.join(handoff, 'request.json'));
  if (!raw.value) fail(`rejected_request_${raw.reason}`);
  const checked = validateRequest(raw.value, day);
  if (!checked.request) fail(`rejected_${checked.code}`);
  // A repair names failures already on main (just fetched), never rows the branch itself added.
  const repairCode = checked.request.run?.repair_of ? repairOfCode(checked.request.run, baseRunIds(repo)) : null;
  if (repairCode) fail(`rejected_request_${repairCode}`);
  const verdict = checked.request.action === 'pr' ? 'publish' : checked.request.action;
  // A PR's pages carry their translations (prompt step 4). Checked here, before anything is pushed: the record step
  // cannot translate, and found it only after the PR was open (2026-10-27, scripts/lib/translation-check.mjs).
  if (verdict === 'publish') {
    const code = translations({ repo, base, head });
    if (code) fail(`rejected_translations_${code}`);
  }
  return { verdict, head, commit_count: commits.length, request: checked.request };
}

// ── push / open PR (PUBLISH_TOKEN, nothing else) ───────────────────────────
export function pushBranch({ repo, sha, day, token, remote = REMOTE }) {
  assert(sha40(sha), 'sha required');
  assert(token, 'PUBLISH_TOKEN required');
  // Plain fast-forward push of one ref. Never --force/--force-with-lease, never tags.
  const ok = git(repo, ['push', '--no-verify', '--porcelain', remote, `${sha}:refs/heads/${dayBranch(day)}`], { token, allowFail: true });
  return ok !== null;
}

export async function openPr({ request, day, token, fetchImpl = fetch }) {
  assert(token, 'PUBLISH_TOKEN required');
  const response = await fetchImpl(`https://api.github.com/repos/${REPO}/pulls`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
      'content-type': 'application/json', 'user-agent': 'simplememo-autopilot-publish' },
    body: JSON.stringify(prPayload(request, day)),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 201) fail(`open_pr_http_${response.status}`);
  const pr = await response.json();
  if (!Number.isInteger(pr?.number) || pr.number <= 0 || pr.head?.ref !== dayBranch(day)) fail('open_pr_response');
  return pr.number;
}

// ── record (no credential): trusted code over the pushed branch's data ─────
const OVERLAY = ['scripts', 'growth/scripts', 'growth/lib'];

// A work tree of sha with the trusted scripts over the branch's own (record() and the translation check).
function trustedTree({ repo, trusted, sha, work, code }) {
  git(repo, ['worktree', 'add', '--detach', '--quiet', work, sha]);
  if (fs.existsSync(path.join(work, 'node_modules'))) fail(code);
  for (const dir of OVERLAY) {
    fs.rmSync(path.join(work, dir), { recursive: true, force: true });
    if (fs.existsSync(path.join(trusted, dir))) fs.cpSync(path.join(trusted, dir), path.join(work, dir), { recursive: true, verbatimSymlinks: true });
  }
}

/**
 * Before the PR: SEO Validation's translation check on the handoff head, with the workflow commit's scripts (repo's
 * work tree), when the branch changed more than the run ledgers. null when it passes or there is nothing to check,
 * else a reason code (scripts/lib/translation-check.mjs). CI runs the branch's own scripts on the PR merge instead,
 * so a branch that edits the translation scripts, or races a change on main, can still differ there; the record
 * step then still binds its row.
 */
export function checkTranslations({ repo, base, head, runner }) {
  const changed = git(repo, ['diff', '--name-only', '-z', '--no-renames', base, head]).split('\0').filter(Boolean);
  if (!needsTranslationCheck(changed)) return null;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-translations-'));
  const work = path.join(root, 'tree');
  try {
    trustedTree({ repo, trusted: repo, sha: head, work, code: 'rejected_translations_node_modules' });
    return runTranslationCheck(work, runner);
  } finally {
    git(repo, ['worktree', 'remove', '--force', work], { allowFail: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
}
export const SITE_ORIGIN = 'https://simplememofast.com';
// The same site on http and on the www host (www answers with a 301 to SITE_ORIGIN, same path: _redirects and
// functions/_middleware.js step 0). --check compares pathnames whatever the origin, so a URL on any of them names the page.
const SITE_ORIGINS = new Set([SITE_ORIGIN, 'http://simplememofast.com', 'https://www.simplememofast.com', 'http://www.simplememofast.com']);
// Runbook §5-2: the actions whose status JSON names an article (its streak counts 記事(new/refresh)); on the others
// (wiring, maintenance, skip, repair) article may be null.
const ARTICLE_ACTIONS = new Set(['new', 'refresh']);
// Why record() leaves run.artifact out of the row: the only part of it the job log prints.
export const ARTIFACT_OMITTED = ['no_article_day', 'not_a_site_path', 'not_a_page'];
// The characters the site's page paths use, in segments that never start with a dot: no '.', '..', hidden
// directory or empty segment, so the file a path names stays inside the tree.
const PAGE_PATH = /^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*(?:[A-Za-z0-9_-][A-Za-z0-9._-]*)?$/;

// autopilot-runs.mjs normalizeArtifact(), which --check applies to both sides: an absolute URL's pathname, else the text.
const comparedForm = value => { try { return new URL(value).pathname; } catch { return value; } };
// Model-written text a ledger row may carry: a request field's limits (plain, 300) and no control (C0, DEL, C1), format
// (bidi controls and marks, zero-width characters, BOM) or line/paragraph separator character either.
const ROW_UNSAFE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const rowText = value => plain(value, 300) && !ROW_UNSAFE.test(value);

/**
 * Is a file (relative to tree) a public page? data/i18n/pages.json lists them, every locale of every group: it is the
 * repository's own list, and build_site_translations.py --check (SEO Validation) fails any HTML outside admin/, docs/,
 * fixtures/, scripts/, tools/, growth/, assets/, screenshots/ and dot directories that it does not list. So the branch's
 * registry can only add a page (a row CI holds to the status JSON) or drop one CI already fails. Unreadable: every
 * file counts, the stricter row (CI fails that tree anyway).
 */
export function publicPages(tree) {
  try {
    const file = path.join(tree, 'data/i18n/pages.json');
    if (fs.lstatSync(file).isFile()) {
      const listed = new Set(JSON.parse(fs.readFileSync(file, 'utf8')).pages.flatMap(group => Object.values(group.pages)));
      return candidate => listed.has(candidate);
    }
  } catch { /* unreadable */ }
  return () => true;
}

/**
 * The public page under tree that serves a site path ('/x/' → x/index.html, '/x' → x.html or x/index.html), or null:
 * listed by isPublic (publicPages()), and a regular file reached without a symlink, in this case.
 */
export function pageFile(tree, sitePath, isPublic = publicPages(tree)) {
  if (typeof sitePath !== 'string' || !PAGE_PATH.test(sitePath)) return null;
  const rel = sitePath.slice(1);
  const candidates = sitePath.endsWith('/') ? [`${rel}index.html`] : rel.endsWith('.html') ? [rel] : [`${rel}.html`, `${rel}/index.html`];
  const root = fs.realpathSync.native(tree);
  for (const candidate of candidates.filter(isPublic)) {
    const file = path.join(root, candidate);
    // A regular file reached without a symlink anywhere on the way (and, on a case-insensitive disk, in this case).
    try { if (fs.lstatSync(file).isFile() && fs.realpathSync.native(file) === file) return candidate; } catch { /* absent */ }
  }
  return null;
}

/**
 * The site path a value names, or null. Trimmed; an absolute URL of this site (http or https, with or without www), or
 * a path from the site root ('//host/x' is another site); its pathname, so a query and a fragment are dropped and dot
 * segments resolved. Without the leading '/', only a public page ('obsidian/x/' → '/obsidian/x/'): a description or a
 * repository path ('scripts/x.mjs') is null.
 */
export function artifactSitePath(value, tree, isPublic = publicPages(tree)) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  let url = null;
  try { url = new URL(text); } catch { /* not absolute */ }
  // http(s) only: 'blob:https://simplememofast.com/x/' has this site's origin, and its pathname is the whole inner URL.
  if (url) return ['http:', 'https:'].includes(url.protocol) && SITE_ORIGINS.has(url.origin) ? url.pathname : null;
  if (!text.startsWith('/')) return pageFile(tree, `/${text}`, isPublic) ? `/${text}` : null;
  try { url = new URL(text, SITE_ORIGIN); } catch { return null; }
  return url.origin === SITE_ORIGIN ? url.pathname : null;
}

/**
 * What the appended ledger row records for a present run.artifact (model-written), or why nothing (ARTIFACT_OMITTED).
 * autopilot-runs.mjs --check holds the latest day's shipped rows with an artifact to the status JSON's article.url,
 * which Runbook §5-2 leaves null on a day without an article. The status article is used only when it is text a row
 * may carry (rowText); otherwise the day has no usable article and the text is never copied.
 *   1. The same page or path as the status article: kept, in the form --check reads the article, so the two agree.
 *   2. No usable status article and no article action (actions: the request's run.action and the status JSON's
 *      action, §5-2): left out. The action decides, not the artifact: the same existing page is a refresh day's
 *      article and a maintenance day's edit, and only the first is one the status JSON names (PR #2168).
 *   3. A public page: kept as its canonical path ('/x/', '/x'), so an article day whose status article is null or
 *      names another page still fails CI (2026-08-14). Anything else (a description, a file that is not a public
 *      page) is left out.
 * Never refused: the PR body carries what the request said.
 */
export function ledgerArtifact(artifact, { tree, statusUrl = null, actions = [] }) {
  const isPublic = publicPages(tree);
  const key = artifactSitePath(artifact, tree, isPublic);
  const page = pageFile(tree, key, isPublic);
  const status = rowText(statusUrl) ? statusUrl : null;
  if (status) {
    const form = comparedForm(status);
    const statusKey = artifactSitePath(status, tree, isPublic);
    const same = form === comparedForm(artifact) || (key && statusKey === key) || (page && pageFile(tree, statusKey, isPublic) === page);
    // Kept only if --check reads the kept form as itself: 'urn:isbn:1' reads as 'isbn:1', which reads as '1'.
    if (same && rowText(form) && comparedForm(form) === form) return { artifact: form, omitted: null };
  }
  if (!status && !actions.some(action => ARTICLE_ACTIONS.has(action))) return { artifact: null, omitted: 'no_article_day' };
  if (page) return { artifact: `/${page.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')}`, omitted: null };
  return { artifact: null, omitted: key ? 'not_a_page' : 'not_a_site_path' };
}

export function record({ repo, trusted, sha, day, pr, request, runId, work, runner = defaultRunner }) {
  assert(sha40(sha) && Number.isInteger(pr) && pr > 0, 'sha and PR number required');
  assert(/^[1-9]\d*$/.test(runId ?? ''), 'run id required');
  assert(path.isAbsolute(work) && !fs.existsSync(work), 'fresh absolute work tree required');
  trustedTree({ repo, trusted, sha, work, code: 'record_node_modules' });
  const dash = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  const run = request.run;
  const runsFile = path.join(work, 'data/autopilot-runs.json');
  const doc = JSON.parse(fs.readFileSync(runsFile, 'utf8'));
  const existing = (doc.runs ?? []).find(row => row.run_id === run.run_id);
  let artifactOmitted = null;
  if (existing) {
    // The session recorded its row itself: bind it to this PR (and to the requested repair_of), nothing else.
    if (existing.route !== 'actions' || existing.date_jst !== dash || String(existing.external_ref) !== runId) fail('record_foreign_row');
    // Only a row that already says what the request says: the same outcome and, on a day that did not
    // ship, a failure class (selfheal --check refuses a failed row without one). Refused before anything
    // is written; nothing from the request is copied into a row the session wrote.
    if (existing.outcome !== run.outcome) fail('record_row_outcome');
    if (run.outcome !== 'shipped' && !(typeof existing.failure_class === 'string' && FAILURE_CLASS.test(existing.failure_class))) fail('record_row_failure_class');
    existing.pr = pr;
  } else {
    // 2026-10-26 (run 40249667656, PR #2168): a maintenance day's request described its work in run.artifact, the
    // row took the text, and the PR failed SEO Validation against the status JSON's article (null that day). The row
    // gets what ledgerArtifact() keeps, decided on this tree's pages and status JSON.
    let status = null;
    try { status = JSON.parse(fs.readFileSync(path.join(work, 'data/autopilot-status.json'), 'utf8')); }
    catch { /* unreadable: --write-status and autopilot-runs.mjs --check report it */ }
    const kept = run.artifact == null ? { artifact: null, omitted: null }
      : ledgerArtifact(run.artifact, { tree: work, statusUrl: status?.article?.url, actions: [run.action, status?.action] });
    artifactOmitted = kept.omitted;
    const fields = { ...run, artifact: kept.artifact };
    const args = ['scripts/autopilot-runs.mjs', '--append', '--run-id', run.run_id, '--date', dash, '--route', 'actions',
      '--outcome', run.outcome, '--pr', String(pr), '--external-ref', runId];
    for (const [key, flag] of [['lane', '--lane'], ['action', '--action'], ['artifact', '--artifact'],
      ['failure_reason', '--failure-reason'], ['failure_class', '--failure-class']]) if (fields[key] != null) args.push(flag, fields[key]);
    runner(work, 'node', args);
  }
  if (existing || run.repair_of) {
    // autopilot-runs.mjs --append has no repair_of flag: write it on the appended row, then validate
    // the whole ledger again (the ledger's own rules plus the self-repair rule that targets exist).
    const ledger = existing ? doc : JSON.parse(fs.readFileSync(runsFile, 'utf8'));
    const row = (ledger.runs ?? []).find(r => r.run_id === run.run_id);
    if (!row) fail('record_row_missing');
    if (run.repair_of) row.repair_of = [...run.repair_of];
    // Re-checked here: this step reads the request again from the handoff. (A row the session wrote itself
    // with its own repair_of is refused earlier, by verifyHandoff's ledger rule.) Targets must be on main and in this ledger.
    if (row.repair_of != null) {
      const ids = new Set(ledger.runs.map(r => r.run_id));
      if (!Array.isArray(row.repair_of) || repairOfCode(row, baseRunIds(repo)) || row.repair_of.some(target => !ids.has(target))) {
        fail('record_repair_of_unknown');
      }
    }
    if (validateRuns(ledger).length) fail('record_invalid_ledger');
    fs.writeFileSync(runsFile, JSON.stringify(ledger, null, 2) + '\n');
  }
  // The session wrote the status JSON before this row existed; its runs block is recounted from the
  // ledger now, in the same commit (autopilot-runs.mjs --check compares the two).
  runner(work, 'node', ['scripts/autopilot-runs.mjs', '--write-status']);
  runner(work, 'node', ['scripts/decision-monitor.mjs', '--publish-report']);
  runner(work, 'python3', ['-E', '-s', 'scripts/build_site_translations.py', '--write']);
  runner(work, 'python3', ['-E', '-s', 'scripts/generate_sitemap.py']);
  // Put the branch's own files back, then only the record paths may differ.
  git(work, ['checkout', '--quiet', 'HEAD', '--', ...OVERLAY.filter(dir => git(work, ['ls-tree', '-d', 'HEAD', dir]).trim())]);
  git(work, ['clean', '-fdxq', '--', ...OVERLAY]);
  const changed = git(work, ['status', '--porcelain', '-z', '--untracked-files=all']).split('\0').filter(Boolean).map(row => row.slice(3));
  // Only the record paths may change (RECORD_PATHS): the generators rebuild every translation, but a
  // page the session edited arrives with the translations the session built; one this step would
  // write is refused, not published. Each file is also held to the rule for the model's commits
  // (hardDenyReason: no symlink, no oversized file).
  for (const file of changed) {
    if (!RECORD_PATHS.includes(file)) fail('record_unexpected_change');
    const st = fs.lstatSync(path.join(work, file), { throwIfNoEntry: false });
    if (!st) continue;
    const mode = st.isSymbolicLink() ? '120000' : st.isFile() ? ((st.mode & 0o111) ? '100755' : '100644') : 'other';
    if (hardDenyReason(file, { mode, size: st.isFile() ? st.size : null })) fail('record_unexpected_change');
  }
  if (!changed.length) return { sha, changed: 0, artifact_omitted: artifactOmitted };
  git(work, ['add', '--', ...changed]);
  git(work, ['-c', `user.name=${RECORD_IDENTITY.name}`, '-c', `user.email=${RECORD_IDENTITY.email}`, 'commit', '--no-verify', '--quiet',
    '-m', `chore(autopilot): record PR #${pr} for ${run.run_id}`]);
  return { sha: git(work, ['rev-parse', 'HEAD']).trim(), changed: changed.length, artifact_omitted: artifactOmitted };
}

function defaultRunner(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, stdio: ['ignore', 'ignore', 'ignore'],
    // The script directory is the trusted overlay; python3 -E -s ignores PYTHON* variables and user site.
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 15 * 60_000 });
  if (result.status !== 0) fail(`record_step_failed_${path.basename(args.find(a => a.endsWith('.mjs') || a.endsWith('.py')) ?? command).replace(/\W/g, '_')}`);
}

// ── workflow wiring guard ──────────────────────────────────────────────────
export function splitJobs(source) {
  const body = source.split('\njobs:\n')[1];
  assert(body, 'jobs section missing');
  const jobs = new Map();
  const names = [...body.matchAll(/^  ([A-Za-z0-9_-]+):\n/gm)];
  names.forEach((m, i) => jobs.set(m[1], body.slice(m.index, names[i + 1]?.index ?? body.length)));
  return jobs;
}

const activeLines = text => text.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
const stepsOf = job => activeLines(job).split(/\n(?=      - name: )/).slice(1);
const stepName = step => step.match(/^      - name: (.*)$/m)?.[1].replace(/^"|"$/g, '') ?? '';

// A model step's `claude_args: |` block as the action receives it: a literal block runs on past blank lines, to
// the first non-blank line indented less than its content (12 spaces here). stepsOf has dropped `#` lines, as
// the action does before it splits the arguments.
function claudeArgsLines(step) {
  const lines = step.split('\n');
  const at = lines.indexOf('          claude_args: |');
  assert(at !== -1 && lines.filter(line => /^\s*claude_args\s*:/.test(line)).length === 1, 'each model step has one claude_args block');
  const block = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() && !line.startsWith(' '.repeat(12))) break;
    block.push(line.slice(12));
  }
  return block;
}

// The words the pinned action splits claude_args into (shell-quote), for the plain forms only: bare text and
// '…' / "…" parts, joined when adjacent. Whatever shell-quote would read another way (a backslash, `$` outside
// single quotes — it expands to nothing —, `#` outside quotes — a comment to the end —, a backtick, an open
// quote) fails the check instead of being guessed at. Actions replaces ${{ }} before the action sees it.
function claudeArgWords(lines) {
  const words = [];
  const part = /'[^'\\]*'|"[^"\\$`]*"|[^\s'"\\$#`]+/y;
  for (const raw of lines) {
    if (raw.trim().startsWith('#')) continue;
    const line = raw.replace(/\$\{\{[^}]*\}\}/g, 'EXPR');
    let i = 0;
    while (i < line.length) {
      if (line[i] === ' ' || line[i] === '\t') { i++; continue; }
      const start = i;
      let word = '', m;
      while ((part.lastIndex = i, m = part.exec(line))) {
        word += /^['"]/.test(m[0]) ? m[0].slice(1, -1) : m[0];
        i = part.lastIndex;
      }
      assert(i > start && (i === line.length || line[i] === ' ' || line[i] === '\t'),
        'claude_args holds plain words only (no \\, $, # or ` outside single quotes, no open quote)');
      words.push(word);
    }
  }
  return words;
}

// The action hands every word that starts with `--` to the CLI as an option (`--name value` or `--name=value`),
// and the CLI keeps the last value of a repeated option: a second one, in any form, overrides the pinned one.
// Exactly one, in the `--name value` form, its value byte-equal to the constant. Returns its index.
function onlyOption(words, names, value, message) {
  const lower = names.map(name => name.toLowerCase());
  const at = words.flatMap((word, i) => word.startsWith('--') && lower.includes(word.slice(2).split('=')[0].toLowerCase()) ? [i] : []);
  assert(at.length === 1 && words[at[0]] === `--${names[0]}` && words[at[0] + 1] === value, message);
  return at[0];
}

// Every expression Actions evaluates in the raw workflow text: each ${{ … }} (inside run/prompt blocks too,
// `#` lines included; a '…' literal may hold `}}`), and each `if:` value (an expression without ${{ }}; a
// folded one runs on over its more-indented lines).
function workflowExpressions(source) {
  const found = [];
  for (let at = source.indexOf('${{'); at !== -1; at = source.indexOf('${{', at + 3)) {
    let i = at + 3, quoted = false;
    for (; i < source.length && (quoted || !source.startsWith('}}', i)); i++) if (source[i] === "'") quoted = !quoted;
    found.push(source.slice(at + 3, i));
  }
  const lines = source.split('\n');
  lines.forEach((line, n) => {
    const key = line.match(/^(\s*(?:-\s+)?)(?:if|'if'|"if")\s*:/);
    if (!key) return;
    let text = line.slice(key[0].length);
    for (let k = n + 1; k < lines.length && (!lines[k].trim() || lines[k].search(/\S/) > key[1].length); k++) text += '\n' + lines[k];
    found.push(text);
  });
  return found;
}

// Reads a model step's outputs (or every step's) as a whole — toJSON(steps), toJSON(steps.claude),
// toJSON(steps.claude.outputs), a wildcard or a computed index —, which would carry the structured result.
// Contexts are case-insensitive. Single named values (outputs.<name>, outcome, conclusion) are fine.
function readsWholeModelOutputs(expression, modelIds) {
  for (const m of expression.matchAll(/(?<![\w.-])steps(?![\w-])/gi)) {
    const rest = expression.slice(m.index);
    const id = rest.match(/^steps\s*\.\s*([A-Za-z_][\w-]*)/i)?.[1];
    if (!id) return true;
    if (!modelIds.includes(id.toLowerCase())) continue;
    if (!/^steps\s*\.\s*[A-Za-z_][\w-]*\s*\.\s*(?:outcome|conclusion|outputs\s*\.\s*[A-Za-z_][\w-]*)(?![\w-])/i.test(rest)) return true;
  }
  return false;
}

export function checkWiring(source) {
  assert.match(source, /\npermissions: \{\}\n/, 'workflow-level permissions must be empty');
  assert.doesNotMatch(activeLines(source), /id-token/, 'no job may request an OIDC token');
  const jobs = splitJobs(source);
  assert.deepEqual([...jobs.keys()], ['autopilot', 'publish', 'notify-completion'], 'job order: autopilot, publish, notify-completion');
  const model = activeLines(jobs.get('autopilot'));
  assert.match(model, /\n    permissions:\n      contents: read\n/, 'model job must declare read-only permissions');
  assert.doesNotMatch(model, /: write\b/, 'model job must hold no write permission');
  assert.doesNotMatch(model, /GH_PAT|PUBLISH_TOKEN/, 'GH_PAT must not be anywhere in the model job');
  const modelSecrets = [...model.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]);
  assert(modelSecrets.every(name => ['CLAUDE_CODE_OAUTH_TOKEN', 'GCP_SERVICE_ACCOUNT_JSON'].includes(name)), 'unexpected secret in the model job');
  const modelCheckouts = stepsOf(jobs.get('autopilot')).filter(step => /uses: actions\/checkout@/.test(step));
  assert(modelCheckouts.length === 1 && modelCheckouts.every(step => /persist-credentials: false/.test(step) && !/token:/.test(step)),
    'model checkout must not persist a credential');
  const claude = stepsOf(jobs.get('autopilot')).find(step => /\n        id: claude\n/.test(step));
  assert(claude && /github_token: \$\{\{ github\.token \}\}/.test(claude)
    && [...claude.matchAll(/GH_TOKEN: (.*)/g)].every(m => m[1].trim() === '${{ github.token }}'), 'model step gets only the read-only job token');
  const packStep = stepsOf(jobs.get('autopilot')).find(step => stepName(step) === 'Pack the work for the publish job');
  assert(packStep && /worktree add --detach "\$RUNNER_TEMP\/pack-tools" "\$GITHUB_SHA"/.test(packStep)
    && /node "\$RUNNER_TEMP\/pack-tools\/scripts\/autopilot-publish\.mjs" --pack/.test(packStep), 'pack must run from the workflow commit');

  // The one resume of the session (2026-10-22): decided by workflow-commit code right after the main
  // step; the same pinned action, the model credential and the read-only job token only, Bash/Read/Write
  // only, small caps, a fixed prompt, and only after a successful main step whose files are missing.
  const modelSteps = stepsOf(jobs.get('autopilot'));
  const inspect = modelSteps.find(step => /\n        id: handoff_files\n/.test(step));
  const resume = modelSteps.find(step => /\n        id: resume\n/.test(step));
  assert(inspect && resume, 'the handoff check and the resume step must be wired');
  assert(modelSteps.indexOf(claude) + 1 === modelSteps.indexOf(inspect) && modelSteps.indexOf(inspect) + 1 === modelSteps.indexOf(resume),
    'the handoff check follows the main step, and the resume follows the check');
  assert(/git -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false worktree add --detach "\$RUNNER_TEMP\/handoff-tools" "\$GITHUB_SHA"\n/.test(inspect)
    && /\n {10}node "\$RUNNER_TEMP\/handoff-tools\/scripts\/autopilot-publish\.mjs" --inspect-handoff\n/.test(inspect)
    && /\n        if: >-\n          !cancelled\(\) &&\n          \(steps\.claude\.outcome == 'success' \|\| steps\.claude\.outcome == 'failure'\)\n/.test(inspect)
    && inspect.includes('\n          SESSION_ID: ${{ steps.claude.outputs.session_id }}\n')
    && inspect.includes('\n          RUNTIME_BUDGET_USD: ${{ steps.route.outputs.runtime_budget_usd }}\n')
    && !/secrets\./.test(inspect), 'the handoff check runs workflow-commit code after every finished main step, without a credential');
  const pinned = step => step.match(/\n        uses: (anthropics\/claude-code-action@[0-9a-f]{40})(?:\s|$)/)?.[1];
  assert.equal(modelSteps.filter(step => /uses: anthropics\/claude-code-action@/.test(step)).length, 2, 'one main session and one resume');
  assert(pinned(claude) && pinned(resume) === pinned(claude), 'the resume uses the main step\'s pinned action');
  assert.match(resume, /\n        if: >-\n          !cancelled\(\) && steps\.claude\.outcome == 'success'\n          && steps\.handoff_files\.outputs\.resume == 'true'\n/,
    'the resume runs only after a successful main step, when the check asked for it');
  assert.match(resume, /\n        continue-on-error: true\n/, 'the resume must not change the job verdict');
  assert(resume.includes(`\n        timeout-minutes: ${RESUME_LIMITS.minutes}\n`), 'the resume has the short timeout its time rule assumes');
  // The time rule (resumeDecision) reads the job's clock, recorded by the Gate step before the model ran.
  const gate = modelSteps.find(step => /\n        id: gate\n/.test(step));
  assert(gate && modelSteps.indexOf(gate) < modelSteps.indexOf(claude)
    && /\n        run: \|\n          echo "job_started_epoch=\$\(date \+%s\)" >> "\$GITHUB_OUTPUT"\n          node scripts\/autopilot-gate\.mjs --preflight\n/.test(gate)
    && inspect.includes('\n          JOB_STARTED_EPOCH: ${{ steps.gate.outputs.job_started_epoch }}\n'), 'the handoff check reads the job\'s clock from the Gate step');
  assert(model.includes(`\n    timeout-minutes: ${JOB_TIME.job_minutes}\n`), 'the job limit the resume\'s time rule assumes');
  assert.deepEqual([...resume.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]), ['CLAUDE_CODE_OAUTH_TOKEN'], 'the resume gets the model credential only');
  assert(resume.includes('\n          github_token: ${{ github.token }}\n') && !/\n        env:\n/.test(resume)
    && [...resume.matchAll(/token: (.*)/g)].length === 2, 'the resume gets only the read-only job token');
  const resumeLines = claudeArgsLines(resume);
  assert.deepEqual(resumeLines.map(line => line.trim()).filter(Boolean), ['--resume ${{ steps.handoff_files.outputs.session_id }}', `--max-turns ${RESUME_LIMITS.max_turns}`,
    '--max-budget-usd ${{ steps.handoff_files.outputs.resume_budget_usd }}', '--model ${{ steps.route.outputs.model }}',
    `--settings '${MAIN_SETTINGS}'`, '--allowedTools "Bash,Read,Write"'],
    'the resume: the validated session, small caps, the same model, no background tasks, Bash/Read/Write only');
  onlyOption(claudeArgWords(resumeLines), ['settings'], MAIN_SETTINGS, 'the resume runs without background tasks: one --settings, the constant');
  // 2026-10-24: the main session ends with a structured result and leaves no background task behind. One of
  // each option, byte-equal to the constant (an appended second one would silently win).
  const mainWords = claudeArgWords(claudeArgsLines(claude));
  onlyOption(mainWords, ['settings'], MAIN_SETTINGS, 'the main session runs without background tasks, with bounded foreground limits');
  const disallowed = onlyOption(mainWords, ['disallowedTools', 'disallowed-tools'], MAIN_DISALLOWED_TOOLS,
    'the main session cannot start monitors, workflows or scheduled turns');
  // The action reads every following word that is not an option as one more value of --disallowedTools.
  assert(mainWords[disallowed + 2] === undefined || mainWords[disallowed + 2].startsWith('--'), 'the main session\'s --disallowedTools has one value');
  onlyOption(mainWords, ['json-schema'], JSON.stringify(HANDOFF_SCHEMA), 'the main session ends with the handoff schema (HANDOFF_SCHEMA)');
  // The structured result reaches the handoff only through --inspect-handoff (workflow-commit code), never an
  // expression: neither by name (any case, dotted or bracketed) nor inside a model step's outputs read whole.
  const modelIds = [...jobs.values()].flatMap(job => stepsOf(job)).filter(step => /uses: anthropics\/claude-code-action@/.test(step))
    .map(step => step.match(/\n        id: ([\w-]+)\n/)?.[1]?.toLowerCase()).filter(Boolean);
  for (const expression of workflowExpressions(source)) {
    assert.doesNotMatch(expression, /structured_output/i, 'no expression reads the structured result');
    assert(!readsWholeModelOutputs(expression, modelIds), 'no expression reads a model step\'s outputs whole (the structured result is one of them)');
  }
  const resumePrompt = resume.split('\n          prompt: |\n')[1];
  assert(resumePrompt && !resumePrompt.includes('${{'), 'the resume prompt is fixed text');
  for (const step of [inspect, resume]) {
    const name = stepName(step);
    assert(!RESERVED_STEP_WORDS.some(word => name.includes(word)) && !/SDKの停止理由|成果物|資格情報|^公開判定:/.test(name),
      `model step name collides with Act's step keys: ${name}`);
  }

  const publish = jobs.get('publish');
  const pub = activeLines(publish);
  assert.match(pub, /\n    needs: autopilot\n/, 'publish runs after the model job');
  assert.match(pub, /\n    permissions:\n      contents: read\n/, 'publish job token is read-only (pushes use GH_PAT in named steps only)');
  assert.doesNotMatch(pub, /: write\b/);
  assert.doesNotMatch(pub, /claude-code-action|claude_code_oauth_token|CLAUDE_CODE_OAUTH_TOKEN|GCP_SERVICE_ACCOUNT_JSON/, 'no model and no model credential in publish');
  const steps = stepsOf(publish);
  const checkout = steps.find(step => /uses: actions\/checkout@/.test(step));
  assert(checkout && /ref: \$\{\{ github\.sha \}\}/.test(checkout) && /path: tools/.test(checkout)
    && /persist-credentials: false/.test(checkout) && !/token:/.test(checkout), 'publish checks out the workflow commit without credentials');
  // This job holds GH_PAT later: its actions are pinned to a full commit SHA, never a moving tag.
  assert(steps.filter(step => /uses: /.test(step)).every(step => /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}(?:\s|$)/.test(step)),
    'publish actions must be pinned to a full commit SHA');
  for (const step of steps) {
    const name = stepName(step);
    assert(!RESERVED_STEP_WORDS.some(word => name.includes(word)), `publish step name collides with Act's step keys: ${name}`);
    const secrets = [...step.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]);
    if (PUBLISH_SECRET_STEPS.includes(name)) {
      assert.deepEqual(secrets, ['GH_PAT'], `${name} must receive GH_PAT and nothing else`);
      assert.match(step, /PUBLISH_TOKEN: \$\{\{ secrets\.GH_PAT \}\}/);
    } else assert.equal(secrets.length, 0, `secret outside the publish credential steps: ${name}`);
    for (const m of step.matchAll(/\b(?:node|python3)\s+(\S+)/g)) {
      assert(/^"?\$GITHUB_WORKSPACE\/tools\/scripts\//.test(m[1]) || /^"?\$RUNNER_TEMP\/[a-z-]+-tools\/scripts\//.test(m[1]) || m[1] === '-e',
        `publish executes only workflow-commit tools: ${name}`);
    }
    // Pushes happen only inside the tool (plain fast-forward); no step pushes by itself.
    assert.doesNotMatch(step, /git\s+push|force-with-lease|--force\b(?!-run)/, 'publish never force-pushes');
  }
  for (const name of PUBLISH_SECRET_STEPS) assert(steps.some(step => stepName(step) === name), `missing publish step ${name}`);
  const notify = jobs.get('notify-completion');
  assert.match(notify, /\n    needs: \[autopilot, publish\]\n/, 'notify-completion waits for both jobs');
  return true;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function arg(argv, name, fallback = undefined) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${String(v ?? '').replace(/[\r\n]/g, '')}\n`).join(''));
}

function githubReadPrs(token) {
  return async branch => {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'simplememo-autopilot-publish',
      ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const response = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=all&head=${encodeURIComponent(`simplememofast:${branch}`)}&per_page=100`,
      { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) fail('rejected_pr_inventory');
    return response.json();
  };
}

async function prodStatusDate() {
  const response = await fetch('https://simplememofast.com/data/autopilot-status.json', { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) return null;
  return (await response.json())?.date_jst ?? null;
}

function selftest() {
  let n = 0;
  const t = (cond, msg) => { assert(cond, msg); n++; };
  t(hardDenyReason('.github/workflows/x.yml') === 'denied_github', '.github denied');
  t(hardDenyReason('a/.git/config') === 'denied_segment', '.git segment denied');
  t(hardDenyReason('obsidian/index.html', { mode: '120000' }) === 'denied_symlink', 'symlink denied');
  t(hardDenyReason('vendor', { mode: '160000' }) === 'denied_gitlink', 'gitlink denied');
  t(hardDenyReason('obsidian/index.html', { mode: '100644', size: 10 }) === null, 'page allowed');
  t(hardDenyReason('../x') === 'invalid_path', 'traversal denied');
  const request = { action: 'pr', title: 'T', body: 'B‮', run: { run_id: 'ap-20261020-actions-1', outcome: 'shipped', lane: 'A' } };
  t(validateRequest(request, '20261020').request?.body === 'B', 'bidi controls stripped');
  t(validateRequest({ ...request, title: 'a\nb' }, '20261020').code === 'request_title', 'multi-line title refused');
  t(validateRequest({ ...request, run: { ...request.run, run_id: 'ap-20261019-actions-1' } }, '20261020').code === 'request_run_id', 'other day refused');
  t(validateRequest({ ...request, extra: 1 }, '20261020').code === 'request_unknown_field', 'unknown field refused');
  t(prPayload(validateRequest(request, '20261020').request, '20261020').body === 'B', 'PR body is the request body, nothing appended');
  const repair = { ...request, run: { ...request.run, lane: 'F', repair_of: ['ap-20261019-actions'] } };
  t(validateRequest(repair, '20261020').request?.run.repair_of?.[0] === 'ap-20261019-actions', 'repair_of carried');
  t(validateRequest({ ...repair, run: { ...repair.run, repair_of: 'ap-20261019-actions' } }, '20261020').code === 'request_repair_of', 'repair_of must be an array');
  t(validateRequest({ ...repair, run: { ...repair.run, repair_of: [request.run.run_id] } }, '20261020').code === 'request_repair_of_self', 'own id refused');
  t(repairOfCode(repair.run, new Set(['ap-20261018-actions'])) === 'repair_of_unknown', 'unknown target refused');
  t(repairOfCode(repair.run, new Set(['ap-20261019-actions'])) === null, 'known target accepted');
  t(repairOfCode(repair.run, null) === 'repair_of_base_unreadable', 'unreadable base refused');
  // 2026-10-26 (run 40249667656): a maintenance day described its work in run.artifact. The day is not refused;
  // the ledger row records a public page (or the status article's form of it), nothing else.
  const described = 'growth/experiments/experiments.json: gsc-obsidian-install-20260922-r2 evaluated as inconclusive';
  t(validateRequest({ ...request, run: { ...request.run, action: 'maintenance', artifact: described } }, '20261020').request?.run.artifact === described,
    'a described artifact does not refuse the day');
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-artifact-'));
  try {
    for (const file of ['index.html', 'obsidian/getting-started/index.html', 'blog/memo.html', 'data/voice-shift/index.html', 'data/x.json',
      'growth/experiments/experiments.json', '.hidden/index.html', 'fixtures/x.html', 'docs/preview.html', 'admin/index.html']) {
      fs.mkdirSync(path.dirname(path.join(siteDir, file)), { recursive: true });
      fs.writeFileSync(path.join(siteDir, file), '{}');
    }
    fs.symlinkSync(path.join(siteDir, 'blog/memo.html'), path.join(siteDir, 'linked.html'));
    fs.symlinkSync(path.join(siteDir, 'obsidian'), path.join(siteDir, 'linkdir'));
    // The registry lists the public pages (and, here, a hidden one and a link: the path and file checks still refuse them).
    const registry = path.join(siteDir, 'data/i18n/pages.json');
    fs.mkdirSync(path.dirname(registry), { recursive: true });
    fs.writeFileSync(registry, JSON.stringify({ pages: [{ pages: { ja: 'index.html' } }, { pages: { ja: 'obsidian/getting-started/index.html' } },
      { pages: { ja: 'blog/memo.html' } }, { pages: { ja: 'data/voice-shift/index.html' } },
      { pages: { ja: '.hidden/index.html', en: 'linked.html', ko: 'linkdir/getting-started/index.html' } }] }));
    const kept = (artifact, statusUrl = null, actions = ['refresh']) => ledgerArtifact(artifact, { tree: siteDir, statusUrl, actions });
    const same = (actual, artifact, omitted) => actual.artifact === artifact && actual.omitted === omitted;
    const PAGE = '/obsidian/getting-started/';
    // An article day (refresh) without a status article: what the artifact names decides.
    for (const value of [described, 'scripts/x.mjs', 'obsidian/missing/', 'growth/experiments/experiments.json', 'fixtures/x.html',
      'https://evil.example/obsidian/getting-started/', '//evil.example/obsidian/getting-started/', 'https://simplememofast.com.evil.example/x/',
      'C:/x', 'mailto:a@simplememofast.com', '', '   ', '.', './', 'obsidian/getting-started/?q=1',
      // This site's origin on another scheme: the pathname of 'blob:' is the whole inner URL.
      `blob:${SITE_ORIGIN}${PAGE}`, `view-source:${SITE_ORIGIN}${PAGE}`]) {
      t(same(kept(value), null, 'not_a_site_path'), `not a site path: ${JSON.stringify(value)}`);
    }
    for (const value of ['/growth/experiments/experiments.json', '/data/x.json', '/docs/obsidian/AUTOPILOT_LOG.md', '/obsidian/missing/',
      '/../etc/passwd', '/obsidian/%2e%2e/%2e%2e/etc/passwd', '/blog%2Fmemo', '/.hidden/', '/obsidian//getting-started/', '/linked.html',
      '/fixtures/x.html', '/docs/preview.html', '/admin/', '/OBSIDIAN/getting-started/', '/obsidian/getting-started/ (refresh)',
      '/linkdir/getting-started/']) {
      t(same(kept(value), null, 'not_a_page'), `not a public page: ${value}`);
    }
    for (const [value, artifact] of [[PAGE, PAGE], ['/', '/'], ['/index.html', '/'], [`${SITE_ORIGIN}${PAGE}`, PAGE],
      [`http://simplememofast.com${PAGE}`, PAGE], [`https://www.simplememofast.com${PAGE}`, PAGE], [`http://www.simplememofast.com${PAGE}`, PAGE],
      [` ${PAGE}?q=1#a `, PAGE], ['/obsidian/getting-started', PAGE], [`${PAGE}index.html`, PAGE], ['obsidian/getting-started/', PAGE],
      ['obsidian/getting-started', PAGE], ['blog/memo', '/blog/memo'], ['/blog/memo', '/blog/memo'], ['/blog/memo.html', '/blog/memo'],
      ['/data/voice-shift/', '/data/voice-shift/']]) {
      t(same(kept(value), artifact, null), `a public page, as its canonical path: ${value}`);
    }
    // A day without an article (§5-2 article null, no new/refresh): nothing, even a page it edited (PR #2168).
    for (const actions of [['maintenance'], ['wiring', 'wiring'], ['repair'], ['skip'], [], [undefined, null], ['new-article', 'maintenance']]) {
      for (const value of [PAGE, described, '/growth/experiments/experiments.json']) {
        t(same(kept(value, null, actions), null, 'no_article_day'), `no article day ${JSON.stringify(actions)}: ${value}`);
      }
    }
    // Either action naming an article day keeps the page (CI then fails the null article, as on 2026-08-14).
    for (const actions of [['new'], ['maintenance', 'refresh'], ['new-article', 'new']]) {
      t(same(kept(PAGE, null, actions), PAGE, null), `article day ${JSON.stringify(actions)}`);
    }
    // The status article's page or path: kept as --check reads the article, on any day (2026-09-13: a data file).
    for (const [value, statusUrl, artifact] of [['/data/x.json', `${SITE_ORIGIN}/data/x.json`, '/data/x.json'],
      [PAGE, `${SITE_ORIGIN}${PAGE}index.html`, `${PAGE}index.html`], [PAGE, `${PAGE}#a`, `${PAGE}#a`], ['obsidian/getting-started/', PAGE, PAGE],
      [`https://www.simplememofast.com${PAGE}`, `http://simplememofast.com${PAGE}`, PAGE],
      // Pairs --check passes on main as text: the same compared form stays the same.
      ['/obsidian/getting-started', 'http://www.simplememofast.com/obsidian/getting-started', '/obsidian/getting-started'],
      [described, described, described], ['/data/x.json', 'https://evil.example/data/x.json', '/data/x.json'],
      // The same path that is not a page, in another form: the status article's form.
      ['/data/x.json#a', `${SITE_ORIGIN}/data/x.json`, '/data/x.json'], [' /data/./x.json ', '/data/x.json', '/data/x.json']]) {
      for (const actions of [['refresh'], ['maintenance']]) {
        t(same(kept(value, statusUrl, actions), artifact, null), `the status article's form ${JSON.stringify(actions)}: ${value} / ${statusUrl}`);
      }
    }
    // A status article that names something else: a public page is kept (CI fails it); anything else is left out.
    for (const actions of [['refresh'], ['maintenance']]) {
      t(same(kept(PAGE, `${SITE_ORIGIN}/blog/memo`, actions), PAGE, null), `a page the status article does not name ${actions}`);
      t(same(kept(`https://www.simplememofast.com${PAGE}`, '/blog/memo', actions), PAGE, null), `a www page the status article does not name ${actions}`);
      t(same(kept('/growth/x.json', '/blog/memo', actions), null, 'not_a_page'), `a file the status article does not name ${actions}`);
      t(same(kept(described, '/blog/memo', actions), null, 'not_a_site_path'), `a description the status article does not name ${actions}`);
    }
    // A status article.url that is not text a row may carry is no article, and is never copied.
    for (const statusUrl of [`${PAGE}\n`, `${PAGE}\u0007`, `${PAGE}\u202e`, `${PAGE}\u0000`, `${PAGE}?${'x'.repeat(300)}`, 42, { url: PAGE }, '',
      // C1 controls, line/paragraph separators, bidi marks, zero-width characters, BOM and the soft hyphen.
      ...['\u0085', '\u009b', '\u2028', '\u2029', '\u200e', '\u200f', '\u061c', '\u200b', '\u200d', '\u2060', '\ufeff', '\u00ad'].map(c => `${PAGE}?${c}`)]) {
      t(same(kept(PAGE, statusUrl), PAGE, null), `unusable status article, article day: ${JSON.stringify(statusUrl)}`);
      t(same(kept(PAGE, statusUrl, ['maintenance']), null, 'no_article_day'), `unusable status article, no article day: ${JSON.stringify(statusUrl)}`);
      t(same(kept(String(statusUrl), statusUrl, ['maintenance']), null, 'no_article_day'), `unusable status article, same text: ${JSON.stringify(statusUrl)}`);
    }
    // The same text whose compared form a row cannot carry ('foo:' reads as '').
    t(same(kept('foo:', 'foo:'), null, 'not_a_site_path'), 'an empty compared form is not kept');
    // The same text whose compared form --check would read again as something else ('urn:isbn:123' → 'isbn:123' → '123').
    for (const value of ['urn:isbn:123', `x:y:${PAGE}`, `blob:${SITE_ORIGIN}${PAGE}`, `view-source:${SITE_ORIGIN}${PAGE}`, 'a:foo:bar']) {
      for (const actions of [['refresh'], ['maintenance']]) {
        t(same(kept(value, value, actions), null, 'not_a_site_path'), `a compared form --check reads differently ${JSON.stringify(actions)}: ${value}`);
      }
    }
    // Without a readable registry, every HTML file counts (the stricter row); the path and file checks still hold.
    fs.rmSync(registry);
    t(same(kept('/fixtures/x.html'), '/fixtures/x', null), 'unreadable registry: every HTML file is a page');
    for (const value of ['/.hidden/', '/linked.html', '/linkdir/getting-started/', '/OBSIDIAN/getting-started/']) {
      t(same(kept(value), null, 'not_a_page'), `unreadable registry: path and file checks: ${value}`);
    }
  } finally { fs.rmSync(siteDir, { recursive: true, force: true }); }
  const session = 'bf8acc9e-2dec-4cca-8674-f9d04adcd74a';
  t(validSessionId(session), 'a session id is a lowercase UUID');
  for (const bad of ['', 'BF8ACC9E-2DEC-4CCA-8674-F9D04ADCD74A', `${session} --allowedTools WebFetch`, `${session}\n`, `"${session}"`,
    session.slice(1), `${session}0`, null, 7]) t(!validSessionId(bad), `session id refused: ${JSON.stringify(bad)}`);
  const missing = { request: 'missing', exit: 'present' };
  const decide = extra => resumeDecision({ modelOutcome: 'success', states: missing, sessionId: session, elapsedSeconds: 48 * 60,
    runtimeBudgetUsd: 20, mainCostUsd: 15.41336, ...extra });
  t(decide().decision === 'resume' && decide().budget_usd === '3.00' && decide().session_id === session, 'resume capped at $3');
  t(decide({ mainCostUsd: 18.7 }).budget_usd === '1.30', 'resume budget is what the run cap leaves');
  t(decide({ mainCostUsd: 19.6 }).decision === 'budget_exhausted', 'no resume below the floor');
  t(decide({ mainCostUsd: 21 }).decision === 'budget_exhausted', 'no resume over the run cap');
  t(decide({ mainCostUsd: null }).decision === 'cost_unknown' && decide({ runtimeBudgetUsd: null }).decision === 'cost_unknown', 'unknown cost: no resume');
  t(decide({ sessionId: 'x' }).decision === 'session_id_invalid', 'invalid session: no resume');
  t(decide({ modelOutcome: 'failure' }).decision === 'model_not_success', 'a failed main step is not resumed');
  t(decide({ states: { request: 'present', exit: 'present' } }).decision === 'not_needed', 'both present: no resume');
  t(decide({ states: { request: 'present', exit: 'invalid_json' } }).decision === 'resume', 'an unusable exit file is missing');
  // Step 0 days write only the exit code; any other code, or an unusable request, still needs the request.
  t(decide({ exitCode: 'skipped_already_done' }).decision === 'nothing_to_publish', 'a step-0 day is not resumed');
  for (const [label, extra] of [['another exit code', { exitCode: 'shipped_pr' }], ['no exit code', { exitCode: undefined }],
    ['an unusable request', { exitCode: 'skipped_already_done', states: { request: 'invalid_json', exit: 'present' } }],
    ['no exit file', { exitCode: 'skipped_already_done', states: { request: 'missing', exit: 'missing' } }]]) {
    t(decide(extra).decision === 'resume', `resumed: ${label}`);
  }
  // The job's limit: the resume (8 min) and the steps outside it (5 min) must fit in 90 minutes from the Gate step's clock.
  t(decide({ elapsedSeconds: 77 * 60 }).decision === 'resume', 'a resume that fits in the job is started');
  t(decide({ elapsedSeconds: 77 * 60 + 1 }).decision === 'time_short', 'a resume that would be cut by the job limit is not started');
  for (const elapsedSeconds of [NaN, -1, undefined, Infinity]) {
    t(decide({ elapsedSeconds }).decision === 'time_unknown', `unknown elapsed time: no resume (${elapsedSeconds})`);
  }
  t(inspectOutputs({ states: missing, decision: 'session_id_invalid', main_execution_sha256: null }).session_id === undefined,
    'no session id leaves the check unless it resumes');
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  checkWiring(workflow); n++;
  const publishStart = workflow.indexOf('\n  publish:\n');
  for (const [from, to] of [
    ['permissions: {}', 'permissions:\n  contents: write'],
    ['github_token: ${{ github.token }}', 'github_token: ${{ secrets.GH_PAT }}'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['needs: [autopilot, publish]', 'needs: autopilot'],
    ['PUBLISH_TOKEN: ${{ secrets.GH_PAT }}', 'PUBLISH_TOKEN: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}'],
  ]) {
    const mutated = workflow.replace(from, to);
    t(mutated !== workflow, `mutation applies: ${from}`);
    assert.throws(() => checkWiring(mutated), undefined, `mutation must fail: ${from}`); n++;
  }
  const renamed = workflow.slice(0, publishStart) + workflow.slice(publishStart).replace('name: Verify the handoff', 'name: Gate the handoff');
  assert.throws(() => checkWiring(renamed), /collides/); n++;
  const toolsMoved = workflow.slice(0, publishStart) + workflow.slice(publishStart).replace('"$GITHUB_WORKSPACE/tools/scripts/autopilot-publish.mjs" --verify', 'scripts/autopilot-publish.mjs --verify');
  t(toolsMoved !== workflow, 'tools mutation applies');
  assert.throws(() => checkWiring(toolsMoved), /workflow-commit tools/); n++;
  // The resume step: every weakening is refused.
  const resumeAt = workflow.indexOf('      - name: Resume the session once for the missing handoff files\n');
  const resumeEnd = workflow.indexOf('\n      - name: ', resumeAt + 1);
  for (const [from, to] of [
    ['--allowedTools "Bash,Read,Write"', '--allowedTools "Bash,Read,Write,WebFetch"'],
    ['--max-turns 12', '--max-turns 50'],
    ["\n          && steps.handoff_files.outputs.resume == 'true'", ''],
    ["steps.claude.outcome == 'success'\n", "steps.claude.outcome != 'skipped'\n"],
    ['--resume ${{ steps.handoff_files.outputs.session_id }}', '--resume ${{ steps.claude.outputs.session_id }}'],
    ['claude-code-action@925afb53776cf1a2b738c6bdbed37b4d4000ef13', 'claude-code-action@v1'],
    ['github_token: ${{ github.token }}', 'github_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}'],
    ['        continue-on-error: true\n', ''],
    ['- name: Resume the session once for the missing handoff files', '- name: Claude Code resume for the missing handoff files'],
    ['            3. ほかには何もしない。', '            3. ${{ steps.gate.outputs.today }} ほかには何もしない。'],
    [`timeout-minutes: ${RESUME_LIMITS.minutes}\n`, `timeout-minutes: ${RESUME_LIMITS.minutes + 1}\n`],
  ]) {
    const block = workflow.slice(resumeAt, resumeEnd);
    t(block.includes(from), `resume mutation applies: ${from}`);
    const mutated = workflow.slice(0, resumeAt) + block.replace(from, to) + workflow.slice(resumeEnd);
    assert.throws(() => checkWiring(mutated), undefined, `resume mutation must fail: ${from}`); n++;
  }
  // The job's clock: recorded by the Gate step, read by the check, against the job limit the rule assumes.
  for (const [from, to] of [
    ['          echo "job_started_epoch=$(date +%s)" >> "$GITHUB_OUTPUT"\n', ''],
    ['          JOB_STARTED_EPOCH: ${{ steps.gate.outputs.job_started_epoch }}\n', ''],
    ['          JOB_STARTED_EPOCH: ${{ steps.gate.outputs.job_started_epoch }}\n', '          JOB_STARTED_EPOCH: ${{ steps.resume.outputs.job_started_epoch }}\n'],
    [`    timeout-minutes: ${JOB_TIME.job_minutes}\n`, `    timeout-minutes: ${JOB_TIME.job_minutes + 30}\n`],
  ]) {
    const mutated = workflow.replace(from, to);
    t(mutated !== workflow, `clock mutation applies: ${from.trim()}`);
    assert.throws(() => checkWiring(mutated), /clock|job limit/, `clock mutation must fail: ${from.trim()}`); n++;
  }
  const now = Date.parse('2026-10-24T01:30:00Z');
  const clockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-clock-'));
  try {
    fs.writeFileSync(path.join(clockDir, EXECUTION_FILE), JSON.stringify([{ type: 'result', total_cost_usd: 15.41336, num_turns: 236 }]));
    const inspectAt = (jobStartedEpoch, extra = {}) => inspectAfterModel({ runnerTemp: clockDir, modelOutcome: 'success', sessionId: session,
      runtimeBudgetUsd: '20', jobStartedEpoch, now, ...extra }).decision;
    t(inspectAt(String(now / 1000 - 48 * 60)) === 'resume', 'the check measures the elapsed time from the Gate step\'s clock');
    t(inspectAt(String(now / 1000 - 80 * 60)) === 'time_short', 'a late check does not resume');
    for (const bad of ['', '17613', '1761300000 ', '1.7e9', `${now / 1000 - 48 * 60}\n`, undefined]) {
      t(inspectAt(bad) === 'time_unknown', `an unreadable clock does not resume: ${JSON.stringify(bad)}`);
    }
    fs.writeFileSync(path.join(clockDir, HANDOFF_FILES.exit), JSON.stringify({ code: NO_REQUEST_EXIT_CODE }));
    t(inspectAt(String(now / 1000 - 48 * 60)) === 'nothing_to_publish', 'the check reads the exit code of a step-0 day');
  } finally { fs.rmSync(clockDir, { recursive: true, force: true }); }
  const inspectMoved = workflow.replace('"$RUNNER_TEMP/handoff-tools/scripts/autopilot-publish.mjs" --inspect-handoff', 'scripts/autopilot-publish.mjs --inspect-handoff');
  t(inspectMoved !== workflow, 'inspect mutation applies');
  assert.throws(() => checkWiring(inspectMoved), /handoff check/); n++;
  // 2026-10-24: the main step's structured result and its background-free settings are pinned.
  const claudeAt = workflow.indexOf('      - name: Claude Code（Runbook 1イテレーション実行）\n');
  const claudeEnd = workflow.indexOf('\n      - name: ', claudeAt + 1);
  const schemaLine = `--json-schema '${JSON.stringify(HANDOFF_SCHEMA)}'`;
  for (const [from, to] of [
    [`            --settings '${MAIN_SETTINGS}'\n`, ''],
    ['"CLAUDE_CODE_DISABLE_BACKGROUND_TASKS":"1",', ''],
    [`            --disallowedTools "${MAIN_DISALLOWED_TOOLS}"\n`, ''],
    [`            ${schemaLine}\n`, ''],
    ['"exit_code":{"type":"string","enum":["shipped_pr",', '"exit_code":{"type":"string","enum":['],
  ]) {
    const block = workflow.slice(claudeAt, claudeEnd);
    t(block.includes(from), `main-step mutation applies: ${from.trim().slice(0, 40)}`);
    const mutated = workflow.slice(0, claudeAt) + block.replace(from, to) + workflow.slice(claudeEnd);
    assert.throws(() => checkWiring(mutated), undefined, `main-step mutation must fail: ${from.trim().slice(0, 40)}`); n++;
  }
  const exposed = workflow.replace('          RESUME_OUTCOME: ${{ steps.resume.outcome }}\n          RESUME_DECISION',
    '          RESUME_OUTCOME: ${{ steps.resume.outcome }}\n          SO: ${{ steps.claude.outputs.structured_output }}\n          RESUME_DECISION');
  t(exposed !== workflow, 'structured output exposure mutation applies');
  assert.throws(() => checkWiring(exposed), /structured result/); n++;
  // A second option appended in any form the action's parser accepts overrides the pinned one (the CLI keeps the
  // last value): the main step holds exactly one of each, the resume exactly one --settings.
  const resumeBlock = workflow.slice(resumeAt, resumeEnd);
  const settingsLine = `            --settings '${MAIN_SETTINGS}'\n`;
  const disallowedLine = `            --disallowedTools "${MAIN_DISALLOWED_TOOLS}"\n`;
  const append = (line, extra) => [line, `${line}            ${extra}\n`];
  // Every form shell-quote reads as the same option: single quotes, double quotes, unquoted, --flag=value.
  const forms = {
    'single quotes': (flag, value) => `--${flag} '${value}'`,
    'double quotes': (flag, value) => `--${flag} "${value}"`,
    unquoted: (flag, value) => `--${flag} ${value}`,
    "--flag='value'": (flag, value) => `--${flag}='${value}'`,
    '--flag=value': (flag, value) => `--${flag}=${value}`,
  };
  const appended = [];
  for (const [flag, line, value, expected] of [
    ['settings', settingsLine, '{}', /background tasks/],
    ['json-schema', `            ${schemaLine}\n`, '{}', /handoff schema/],
    ['disallowedTools', disallowedLine, 'Bash', /monitors/],
    ['disallowed-tools', disallowedLine, 'Bash', /monitors/],
  ]) {
    for (const [form, text] of Object.entries(forms)) appended.push([`second --${flag}, ${form}`, claudeAt, claudeEnd, append(line, text(flag, value)), expected]);
  }
  for (const [form, text] of Object.entries(forms)) appended.push([`resume: second --settings, ${form}`, resumeAt, resumeEnd, append(settingsLine, text('settings', '{}')), /resume/]);
  for (const [label, at, end, [from, to], expected] of [
    ...appended,
    ['second --settings, quoted name', claudeAt, claudeEnd, append(settingsLine, `'--settings' '{}'`), /background tasks/],
    ['second --settings, escaped quotes', claudeAt, claudeEnd, append(settingsLine, '--settings "{\\"env\\":{}}"'), /plain words/],
    ['second --settings, on the same line', claudeAt, claudeEnd, ['            --max-turns 250\n', "            --max-turns 250 --settings '{}'\n"], /background tasks/],
    ['second --settings, after a blank line', claudeAt, claudeEnd, ['\n          prompt: |\n', "\n\n            --settings '{}'\n          prompt: |\n"], /background tasks/],
    ['the only --settings as --settings=value', claudeAt, claudeEnd, [settingsLine, `            --settings='${MAIN_SETTINGS}'\n`], /background tasks/],
    ['a second value of --disallowedTools', claudeAt, claudeEnd, [disallowedLine, `            --disallowedTools "${MAIN_DISALLOWED_TOOLS}" "Bash"\n`], /one value/],
    ['a second claude_args block', claudeAt, claudeEnd, ['          claude_args: |\n', "          claude_args: --settings '{}'\n          claude_args: |\n"], /one claude_args/],
    ['resume: second --settings, after a blank line', resumeAt, resumeEnd, ['\n          prompt: |\n', "\n\n            --settings '{}'\n          prompt: |\n"], /resume/],
    ['resume: second --settings=value, on the same line', resumeAt, resumeEnd, ['--allowedTools "Bash,Read,Write"\n', '--allowedTools "Bash,Read,Write" --settings={}\n'], /resume/],
  ]) {
    const block = at === resumeAt ? resumeBlock : workflow.slice(claudeAt, claudeEnd);
    t(block.includes(from), `option mutation applies: ${label}`);
    const mutated = workflow.slice(0, at) + block.replace(from, to) + workflow.slice(end);
    assert.throws(() => checkWiring(mutated), expected, `option mutation must fail: ${label}`); n++;
  }
  // The structured result never reaches an expression: in the raw text (Actions expands `#` lines of run and prompt
  // blocks too), by name in any case or bracket form, nor in a model step's outputs read whole.
  const envAt = '          RESUME_OUTCOME: ${{ steps.resume.outcome }}\n          RESUME_DECISION';
  const env = expression => [envAt, `          SO: \${{ ${expression} }}\n${envAt}`];
  const runLine = '          git worktree add --detach "$RUNNER_TEMP/diagnostic-tools" "$GITHUB_SHA"\n';
  const promptLine = '            1. `docs/obsidian/AUTOPILOT_RUNBOOK.md` を読む。';
  const ifLine = "        if: always() && steps.claude.conclusion != 'skipped'\n";
  for (const [label, [from, to]] of [
    ['a # line in a run block', [runLine, `          # \${{ steps.claude.outputs.structured_output }}\n${runLine}`]],
    ['a # line in the prompt', [promptLine, `            # \${{ steps.claude.outputs.structured_output }}\n${promptLine}`]],
    ['bracket, single quotes', env("steps.claude.outputs['structured_output']")],
    ['bracket, double quotes', env('steps.claude.outputs["structured_output"]')],
    ['another case', env('steps.claude.outputs.STRUCTURED_OUTPUT')],
    ['toJSON(steps.claude.outputs)', env('toJSON(steps.claude.outputs)')],
    ['toJSON(steps.claude)', env('toJSON(steps.claude)')],
    ['toJSON(steps)', env('toJSON(steps)')],
    ['toJSON(steps.resume.outputs)', env('toJSON(steps.resume.outputs)')],
    ['toJSON(STEPS.Claude.Outputs)', env('toJSON(STEPS.Claude.Outputs)')],
    ['every output by wildcard', env("join(steps.claude.outputs.*, ',')")],
    ['a computed step', env("toJSON(steps[format('{0}', 'claude')])")],
    ['an if: condition', [ifLine, "        if: always() && steps.claude.outputs.structured_output != ''\n"]],
    ['an if : condition', [ifLine, "        if : always() && steps.claude.outputs.structured_output != ''\n"]],
    ['an if: condition reading the outputs whole', [ifLine, "        if: always() && toJSON(steps.claude.outputs) != '{}'\n"]],
  ]) {
    const mutated = workflow.replace(from, to);
    t(mutated !== workflow, `expression mutation applies: ${label}`);
    assert.throws(() => checkWiring(mutated), /structured result/, `expression mutation must fail: ${label}`); n++;
  }
  t(checkWiring(workflow.replace(...env('toJSON(steps.route.outputs)'))), 'a step that runs no model may still be read whole');
  // A structured result nested past the bound is invalid before anything serialises it (JSON.stringify throws
  // RangeError at some thousands of levels, which took --inspect-handoff and --summarize down).
  const nestedText = (depth, code = 'other') => `{"exit_code":"${code}","request":{"action":"none","run":${'['.repeat(depth)}${']'.repeat(depth)}}}`;
  for (const [depth, state] of [[MAX_STRUCTURED_DEPTH - 1, 'present'], [MAX_STRUCTURED_DEPTH, 'invalid'], [10_000, 'invalid'], [200_000, 'invalid']]) {
    t(structuredHandoff([{ type: 'result', structured_output: JSON.parse(nestedText(depth)) }]).state === state, `structured result nested ${depth} -> ${state}`);
  }
  t(structuredHandoff([{ type: 'result', structured_output: { exit_code: 'other', request: Object.fromEntries(
    Array.from({ length: 5000 }, (_, i) => [`k${i}`, 'x'.repeat(10)])) } }]).state === 'invalid', 'a wide structured result over the byte bound is invalid');
  t(structuredHandoff([{ type: 'result', structured_output: { exit_code: 'other', request: { action: 'none', run: new Array(70_000).fill(0) } } }]).state === 'invalid',
    'a structured result with a very wide array is invalid');
  // The structured result: shape only, the two files' bytes, never anything else of the result.
  const req = { action: 'pr', title: 'T', body: 'B', run: { run_id: 'ap-20261024-actions-1', outcome: 'shipped', lane: 'F' } };
  const ok = structuredHandoff([{ type: 'result', structured_output: { exit_code: 'shipped_pr', request: req }, result: 'x' }]);
  t(ok.state === 'present' && JSON.parse(ok.request).run.lane === 'F' && JSON.parse(ok.exit).code === 'shipped_pr', 'structured result read');
  for (const [label, value, state] of [['absent', undefined, 'absent'], ['null', null, 'absent'], ['array', [], 'invalid'],
    ['extra key', { exit_code: 'other', request: { action: 'none' }, note: 'x' }, 'invalid'], ['bad code', { exit_code: 'done', request: { action: 'none' } }, 'invalid'],
    ['request not object', { exit_code: 'other', request: 'pr' }, 'invalid'],
    ['oversized', { exit_code: 'other', request: { action: 'pr', body: 'a'.repeat(70_000) } }, 'invalid']]) {
    t(structuredHandoff([{ type: 'result', structured_output: value }]).state === state, `structured result ${label} -> ${state}`);
  }
  const soDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-structured-test-'));
  try {
    const decoy = path.join(soDir, 'decoy.json');
    fs.writeFileSync(decoy, 'unchanged');
    fs.symlinkSync(decoy, path.join(soDir, HANDOFF_FILES.request)); // a planted link is replaced, its target untouched
    fs.writeFileSync(path.join(soDir, EXECUTION_FILE), JSON.stringify([{ type: 'result', total_cost_usd: 5.3, num_turns: 115,
      structured_output: { exit_code: 'shipped_pr', request: req } }]));
    const r = inspectAfterModel({ runnerTemp: soDir, modelOutcome: 'success', sessionId: session, runtimeBudgetUsd: '20',
      jobStartedEpoch: String(Math.floor(Date.now() / 1000) - 30 * 60) });
    t(r.decision === 'not_needed' && r.handoff_source === 'structured' && r.written.request === 'not_file', 'structured result makes both files; no resume');
    t(fs.readFileSync(decoy, 'utf8') === 'unchanged', 'the link target is never written');
    t(validateRequest(readJson(path.join(soDir, HANDOFF_FILES.request)).value, '20261024').request?.run.run_id === 'ap-20261024-actions-1',
      'the copied request passes the publish validation unchanged');
    const o = inspectOutputs(r);
    t(o.request_after_main === 'not_file' && o.handoff_source === 'structured' && o.structured_output === 'present' && o.resume === false,
      'outputs report what the model wrote and where the handoff came from');
  } finally { fs.rmSync(soDir, { recursive: true, force: true }); }
  const deepDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-structured-deep-'));
  try {
    fs.writeFileSync(path.join(deepDir, EXECUTION_FILE),
      `[{"type":"result","total_cost_usd":5.3,"num_turns":115,"structured_output":${nestedText(10_000, 'shipped_pr')}}]`);
    fs.writeFileSync(path.join(deepDir, HANDOFF_FILES.request), JSON.stringify(req));
    fs.writeFileSync(path.join(deepDir, HANDOFF_FILES.exit), JSON.stringify({ code: 'shipped_pr' }));
    const r = inspectAfterModel({ runnerTemp: deepDir, modelOutcome: 'success', sessionId: session, runtimeBudgetUsd: '20',
      jobStartedEpoch: String(Math.floor(Date.now() / 1000) - 30 * 60) });
    t(r.structured_output === 'invalid' && r.handoff_source === 'files' && r.decision === 'not_needed'
      && readJson(path.join(deepDir, HANDOFF_FILES.request)).value?.run?.run_id === req.run.run_id,
      'a deeply nested structured result is invalid: the check finishes on the files the model wrote');
  } finally { fs.rmSync(deepDir, { recursive: true, force: true }); }
  console.log(`autopilot-publish: ${n} path, request, resume, structured-result and workflow-wiring checks passed`);
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--check')) {
    checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
    console.log('autopilot-publish: workflow wiring OK (model job has no write credential; publish runs only workflow-commit tools)');
    return;
  }
  if (argv.includes('--inspect-handoff')) {
    const result = inspectAfterModel({ runnerTemp: process.env.RUNNER_TEMP, modelOutcome: process.env.MODEL_OUTCOME,
      sessionId: process.env.SESSION_ID, runtimeBudgetUsd: process.env.RUNTIME_BUDGET_USD, execFile: process.env.EXEC_FILE,
      jobStartedEpoch: process.env.JOB_STARTED_EPOCH });
    output(inspectOutputs(result));
    console.log(`handoff files after the model: request=${result.states.request} exit=${result.states.exit} source=${result.handoff_source}`
      + ` structured=${result.structured_output} resume=${result.decision}`);
    return;
  }
  assert(!argv.includes('--remote'), '--remote is a test-only parameter');
  const day = arg(argv, '--day');
  assert(dayOk(day), 'day must be YYYYMMDD');
  if (argv.includes('--pack')) {
    const result = pack({ workspace: path.resolve(arg(argv, '--workspace')), out: path.resolve(arg(argv, '--out')), day,
      takeover: arg(argv, '--takeover') === 'true' });
    output({ packed: 'true', commit_count: result.commit_count });
    console.log(`handoff packed: commits=${result.commit_count}`);
    return;
  }
  if (argv.includes('--verify')) {
    let result;
    try {
      result = await verifyHandoff({ handoff: path.resolve(arg(argv, '--handoff')), repo: path.resolve(arg(argv, '--repo-dir')), day,
        takeover: arg(argv, '--takeover') === 'true', force: arg(argv, '--force-run') === 'true', modelOutcome: arg(argv, '--model-outcome'),
        readToken: process.env.GH_TOKEN || null, listPrs: githubReadPrs(process.env.GH_TOKEN), prodStatusDate,
        gscDay: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) });
    } catch (error) {
      result = { verdict: error instanceof PublishError && /^rejected_[a-z0-9_]+$/.test(error.code) ? error.code : 'rejected_verifier_error', commit_count: 0 };
    }
    output({ verdict: result.verdict, head: result.head ?? '', commit_count: result.commit_count ?? 0 });
    console.log(`handoff verdict: ${result.verdict} commits=${result.commit_count ?? 0}`);
    // A refused handoff is a failure to look at; duplicate/stopped/none publish nothing by design.
    if (result.verdict.startsWith('rejected_')) process.exitCode = 1;
    return;
  }
  if (argv.includes('--push')) {
    const ok = pushBranch({ repo: path.resolve(arg(argv, '--repo-dir')), sha: arg(argv, '--sha'), day, token: process.env.PUBLISH_TOKEN });
    output({ pushed: ok });
    console.log(`push: ${ok ? 'accepted' : 'rejected'}`);
    if (!ok) process.exitCode = 1;
    return;
  }
  const handoff = path.resolve(arg(argv, '--handoff'));
  const checked = validateRequest(readJson(path.join(handoff, 'request.json')).value, day);
  assert(checked.request?.action === 'pr', 'verified PR request required');
  if (argv.includes('--open-pr')) {
    const number = await openPr({ request: checked.request, day, token: process.env.PUBLISH_TOKEN });
    output({ pr: number });
    console.log(`pull request opened: #${number}`);
    return;
  }
  if (argv.includes('--record')) {
    const result = record({ repo: path.resolve(arg(argv, '--repo-dir')), trusted: path.resolve(arg(argv, '--repo-dir')),
      sha: arg(argv, '--sha'), day, pr: Number(arg(argv, '--pr')), request: checked.request, runId: process.env.GITHUB_RUN_ID,
      work: path.join(process.env.RUNNER_TEMP, 'record-work') });
    output({ record_sha: result.sha, record_changed: result.changed });
    // A fixed code only: the omitted artifact is model-written text (the PR body carries it).
    const omitted = ARTIFACT_OMITTED.includes(result.artifact_omitted) ? ` artifact=omitted_${result.artifact_omitted}` : '';
    console.log(`run record prepared: changed_files=${result.changed}${omitted}`);
    return;
  }
  throw Error('Use --inspect-handoff, --pack, --verify, --push, --open-pr, --record, --check or --selftest');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Typed codes only: git stderr, titles and paths can carry model-written text.
    console.error(`autopilot-publish failed: ${error instanceof PublishError ? error.code : process.argv.includes('--selftest') ? error.stack : 'error'}`);
    process.exitCode = 1;
  });
}
