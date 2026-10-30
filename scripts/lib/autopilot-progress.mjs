// Crash-tolerant local milestones, independent of the action's buffered SDK output.
// Diagnostic hints only: the model shares this runner and can alter or omit them.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const PROGRESS_FILE = 'autopilot-progress.jsonl';
export const MAX_PROGRESS_BYTES = 128 * 1024;
export const MAX_PROGRESS_EVENTS = 256;
export const PROGRESS_PHASES = ['context', 'selection', 'declaration', 'implementation', 'validation', 'record', 'handoff'];
const EVENTS = ['start', 'end'];
const KEYS = ['schema_version', 'sequence', 'phase', 'event', 'at', 'exit_code', 'validation', 'provenance'];
const validExit = n => n === null || Number.isInteger(n) && n >= 0 && n <= 255;
const validation = (phase, event, code) => phase !== 'validation' || event !== 'end' || code === null
  ? 'unknown' : code === 0 ? 'reported_passed' : 'reported_failed';
const journalPath = temp => {
  assert(path.isAbsolute(temp ?? ''), 'absolute temp required');
  return path.join(fs.realpathSync(temp), PROGRESS_FILE);
};

function project(row, sequence) {
  assert(row && typeof row === 'object' && !Array.isArray(row));
  assert.deepEqual(Object.keys(row).sort(), [...KEYS].sort());
  assert.equal(row.schema_version, 1);
  assert.equal(row.sequence, sequence);
  assert(['model', ...PROGRESS_PHASES].includes(row.phase));
  assert(EVENTS.includes(row.event));
  assert(typeof row.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.at));
  assert.equal(new Date(row.at).toISOString(), row.at);
  assert(validExit(row.exit_code));
  assert(row.event === 'end' || row.exit_code === null);
  assert(row.phase !== 'model' || row.exit_code === null);
  assert.equal(row.validation, validation(row.phase, row.event, row.exit_code));
  assert.equal(row.provenance, 'untrusted_runner');
  // Reconstruct, never return an arbitrary object read from the model's runner.
  return Object.fromEntries(KEYS.map(key => [key, row[key]]));
}

export function readProgress(temp) {
  let fd;
  try {
    fd = fs.openSync(journalPath(temp), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_PROGRESS_BYTES) return { state: 'unavailable', events: [] };
    const bytes = Buffer.alloc(MAX_PROGRESS_BYTES + 1);
    let size = 0, n;
    while (size < bytes.length && (n = fs.readSync(fd, bytes, size, bytes.length - size, null))) size += n;
    if (size !== stat.size || fs.fstatSync(fd).size !== stat.size) return { state: 'unavailable', events: [] };
    const text = bytes.subarray(0, size).toString('utf8');
    const lines = text.split('\n');
    const complete = lines.pop() === '';
    const events = [];
    for (const line of lines) {
      if (events.length >= MAX_PROGRESS_EVENTS) return { state: 'invalid', events };
      try { events.push(project(JSON.parse(line), events.length + 1)); }
      catch { return { state: 'invalid', events }; }
    }
    // Keep only complete validated records before an interrupted final write.
    return { state: complete ? 'readable' : 'truncated', events };
  } catch (error) {
    return { state: error.code === 'ENOENT' ? 'missing' : 'unavailable', events: [] };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function appendProgress(temp, phase, event, exitCode = null, { initialize = false } = {}) {
  assert(['model', ...PROGRESS_PHASES].includes(phase));
  assert(EVENTS.includes(event));
  assert(validExit(exitCode));
  assert(event === 'end' || exitCode === null);
  const file = journalPath(temp);
  const lock = `${file}.lock`;
  fs.mkdirSync(lock, { mode: 0o700 }); // concurrent writers fail rather than corrupt the journal
  let fd;
  try {
    const before = initialize ? { events: [] } : readProgress(temp);
    if (!initialize) assert.equal(before.state, 'readable');
    assert(before.events.length < MAX_PROGRESS_EVENTS);
    const row = project({ schema_version: 1, sequence: before.events.length + 1, phase, event,
      at: new Date().toISOString(), exit_code: exitCode, validation: validation(phase, event, exitCode),
      provenance: 'untrusted_runner' }, before.events.length + 1);
    const bytes = Buffer.from(JSON.stringify(row) + '\n');
    fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW
      | fs.constants.O_NONBLOCK | (initialize ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0), 0o600);
    const stat = fs.fstatSync(fd);
    assert(stat.isFile() && stat.nlink === 1 && stat.size + bytes.length <= MAX_PROGRESS_BYTES);
    assert.equal(fs.writeSync(fd, bytes), bytes.length);
    fs.fsyncSync(fd); // each marker survives termination of the action process
    if (initialize) {
      const dir = fs.openSync(path.dirname(file), fs.constants.O_RDONLY);
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    }
    return row;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmdirSync(lock);
  }
}

export function saveProgress(temp, modelOutcome) {
  const read = readProgress(temp);
  const output = path.join(fs.realpathSync(temp), 'autopilot-progress');
  fs.mkdirSync(output, { mode: 0o700 }); // never upload a model-populated directory
  const receipt = { schema_version: 1, journal_state: read.state,
    model_outcome: ['success', 'failure', 'cancelled', 'skipped'].includes(modelOutcome) ? modelOutcome : null,
    events: read.events, production_verified: false, cost_observation: 'not_collected' };
  fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return receipt;
}

// ── Time box (2026-10-30) ───────────────────────────────────────────────────
// 2026-10-29 run 40803103665: the main step ran into the action's 75-minute timeout. The first declaration
// came about 65 minutes in; a declaration that left out the generated locale pages was retired and declared
// again, and the action stopped the session during the check that followed. No status, LOG or structured
// handoff was left, and nothing had told the session how much time remained. Two deadlines, measured from the
// Gate step's clock (job_started_epoch, recorded before the model ran): stop starting new work at wrap-up,
// hand off at handoff. The action's own limit (75 minutes from the step's start, which is later than the
// Gate) stays the backstop. scripts/autopilot-publish.mjs --check keeps the deadlines inside that limit and
// inside the resume's time rule. Advisory, like the journal: the file sits on the model's runner.
export const TIME_BOX = Object.freeze({ wrap_up_minutes: 60, handoff_minutes: 70, job_minutes: 90 });
export const TIME_BOX_FILE = 'autopilot-time-box.json';
export const TIME_STAGES = Object.freeze(['work', 'wrap_up', 'handoff_now', 'unknown']);
const TIME_KEYS = ['schema_version', 'job_started_epoch', 'wrap_up_epoch', 'handoff_epoch'];
const EPOCH = /^[1-9]\d{9}$/;
const MAX_TIME_BOX_BYTES = 512;
export const isoSecond = epoch => new Date(epoch * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** The deadlines for this job, from the Gate step's `date +%s`. Throws on anything else. */
export function timeBox(jobStartedEpoch, nowMs = Date.now()) {
  assert(typeof jobStartedEpoch === 'string' && EPOCH.test(jobStartedEpoch), 'job_started_epoch must be a 10-digit epoch');
  const start = Number(jobStartedEpoch);
  const now = Math.floor(nowMs / 1000);
  // Recorded earlier in this job: not in the future, not older than the job's own limit.
  assert(start <= now + 60 && start >= now - TIME_BOX.job_minutes * 60, 'job_started_epoch is not this job\'s clock');
  return { schema_version: 1, job_started_epoch: start,
    wrap_up_epoch: start + TIME_BOX.wrap_up_minutes * 60, handoff_epoch: start + TIME_BOX.handoff_minutes * 60 };
}

/** Written once, before the model, by the workflow commit's copy of this file (never through a planted path). */
export function writeTimeBox(temp, box) {
  assert(path.isAbsolute(temp ?? ''), 'absolute temp required');
  const file = path.join(fs.realpathSync(temp), TIME_BOX_FILE);
  fs.writeFileSync(file, JSON.stringify(box) + '\n', { flag: 'wx', mode: 0o400 });
  return file;
}

/** The box as written, or null: missing, a link, oversized, altered or inconsistent all read as unknown. */
export function readTimeBox(temp) {
  let fd;
  try {
    assert(path.isAbsolute(temp ?? ''));
    fd = fs.openSync(path.join(fs.realpathSync(temp), TIME_BOX_FILE),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    assert(stat.isFile() && stat.size <= MAX_TIME_BOX_BYTES);
    const box = JSON.parse(fs.readFileSync(fd, 'utf8'));
    assert(box && typeof box === 'object' && !Array.isArray(box));
    assert.deepEqual(Object.keys(box).sort(), [...TIME_KEYS].sort());
    assert.equal(box.schema_version, 1);
    for (const key of TIME_KEYS.slice(1)) assert(Number.isSafeInteger(box[key]) && EPOCH.test(String(box[key])));
    assert.equal(box.wrap_up_epoch, box.job_started_epoch + TIME_BOX.wrap_up_minutes * 60);
    assert.equal(box.handoff_epoch, box.job_started_epoch + TIME_BOX.handoff_minutes * 60);
    return Object.fromEntries(TIME_KEYS.map(key => [key, box[key]]));
  } catch {
    return null;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

/** Where the session stands: numbers and a fixed word only (no path, command or free text). */
export function timeLeft(box, nowMs = Date.now()) {
  if (!box) return { stage: 'unknown', wrap_up_in_s: null, handoff_in_s: null };
  const now = Math.floor(nowMs / 1000);
  const wrapUp = box.wrap_up_epoch - now;
  const handoff = box.handoff_epoch - now;
  return { stage: wrapUp > 0 ? 'work' : handoff > 0 ? 'wrap_up' : 'handoff_now', wrap_up_in_s: wrapUp, handoff_in_s: handoff };
}

export const timeLine = (temp, nowMs = Date.now()) => `AUTOPILOT_TIME ${JSON.stringify(timeLeft(readTimeBox(temp), nowMs))}`;

export function progressCommand(args, env = process.env) {
  if (args.length === 1 && args[0] === '--progress-init') return appendProgress(env.RUNNER_TEMP, 'model', 'start', null, { initialize: true });
  if (args.length === 1 && args[0] === '--progress-finish') {
    // The Actions outcome is authoritative for the step, but is not a process exit code.
    // A damaged journal must not prevent exporting its valid prefix.
    try { appendProgress(env.RUNNER_TEMP, 'model', 'end'); } catch { /* export explicit missingness below */ }
    return saveProgress(env.RUNNER_TEMP, env.MODEL_OUTCOME);
  }
  assert(args[0] === '--progress' && [3, 4].includes(args.length));
  const [, phase, event, code] = args;
  assert(PROGRESS_PHASES.includes(phase));
  assert(code === undefined || /^(0|[1-9]\d{0,2})$/.test(code));
  return appendProgress(env.RUNNER_TEMP, phase, event, code === undefined ? null : Number(code));
}

export function checkProgressWiring(source) {
  const model = source.split('\n  publish:\n')[0];
  const step = name => model.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const begin = step('Start bounded progress journal');
  const finish = step('Preserve bounded progress journal');
  const upload = step('Upload bounded progress journal');
  assert(begin && finish && upload, 'progress steps required');
  assert.match(begin, /steps\.gate\.outputs\.run == 'true' && steps\.budget\.outputs\.within == 'true'\s+&& steps\.route\.outputs\.run_cap_ok == 'true'/);
  assert.match(begin, /git -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false show "\$GITHUB_SHA:scripts\/lib\/autopilot-progress\.mjs"/);
  assert.match(begin, /node "\$RUNNER_TEMP\/autopilot-progress-tool\.mjs" --progress-init/);
  assert.match(finish, /!cancelled\(\) &&\s+\(steps\.claude\.outcome == 'success' \|\| steps\.claude\.outcome == 'failure'\)/);
  assert.match(finish, /MODEL_OUTCOME: \$\{\{ steps\.claude\.outcome \}\}/);
  assert.match(finish, /git -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false show "\$GITHUB_SHA:scripts\/lib\/autopilot-progress\.mjs"/);
  assert.match(finish, /node "\$progress_tool" --progress-finish/);
  assert.match(upload, /if: always\(\) && steps\.progress_finish\.outputs\.saved == 'true'/);
  assert.match(upload, /uses: actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(upload, /path: \$\{\{ runner.temp \}\}\/autopilot-progress\/progress\.json\n/);
  assert.match(upload, /retention-days: 7\n/);
  for (const part of [begin, finish, upload]) {
    assert.match(part, /\n        continue-on-error: true\n/);
    assert.match(part, /\n        timeout-minutes: 1\n/);
    assert.doesNotMatch(part, /secrets\./);
  }
  const positions = ['Start bounded progress journal', 'Claude Code（Runbook 1イテレーション実行）',
    'Preserve bounded progress journal', 'Upload bounded progress journal', 'Check the handoff files after the model']
    .map(name => model.indexOf(`      - name: ${name}\n`));
  assert(positions.every((n, i) => n >= 0 && (i === 0 || n > positions[i - 1])), 'export before any handoff resume');
  const prompt = model.split('\n').find(line => line.includes('【途中の工程記録】'));
  assert(prompt && prompt.includes('自己申告') && prompt.includes('--progress'));
  for (const phase of PROGRESS_PHASES) assert(prompt.includes(phase));
  checkTimeBoxWiring(source);
}

/**
 * The time box is set before the model by the workflow commit's copy of this file, from the Gate step's clock,
 * and the prompt tells the session both deadlines, how to read the time left, and what each stage allows.
 */
export function checkTimeBoxWiring(source) {
  const model = source.split('\n  publish:\n')[0];
  const step = name => model.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const box = step('Set the model time box');
  assert(box, 'the time box step is required');
  assert.match(box, /^        id: timebox\n/m, 'the prompt reads the time box as steps.timebox');
  assert.match(box, /steps\.gate\.outputs\.run == 'true' && steps\.budget\.outputs\.within == 'true'\s+&& steps\.route\.outputs\.run_cap_ok == 'true'/,
    'the time box is set on every day the model runs');
  assert.match(box, /\n        continue-on-error: true\n/, 'a missing time box must not stop the model');
  assert.match(box, /\n        timeout-minutes: 1\n/);
  assert(box.includes('\n          JOB_STARTED_EPOCH: ${{ steps.gate.outputs.job_started_epoch }}\n'), 'the time box reads the Gate step\'s clock');
  assert.match(box, /git -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false show "\$GITHUB_SHA:scripts\/lib\/autopilot-progress\.mjs" > "\$RUNNER_TEMP\/autopilot-time-box-tool\.mjs"\n/,
    'the time box runs the workflow commit\'s copy of this file');
  assert.match(box, /\n          node "\$RUNNER_TEMP\/autopilot-time-box-tool\.mjs" --time-box\n/);
  assert.doesNotMatch(box, /secrets\.|vars\./);
  const at = name => model.indexOf(`      - name: ${name}\n`);
  assert(at('Gate（秘密鍵・当日重複・死んだ占有の引き継ぎ）') >= 0 && at('Gate（秘密鍵・当日重複・死んだ占有の引き継ぎ）') < at('Set the model time box')
    && at('Set the model time box') < at('Claude Code（Runbook 1イテレーション実行）'), 'the time box is set after the Gate and before the model');
  const prompt = model.split('\n').find(line => line.includes('【時間の期限】'));
  assert(prompt, 'the prompt must tell the session its deadlines');
  // The rules the stages carry: no public-page work that cannot finish before wrap-up (translations and checks take
  // about 25 minutes), no command timeout past the handoff, a fallback clock, and a class for days the box stopped.
  for (const part of ['${{ steps.timebox.outputs.wrap_up_at', '${{ steps.timebox.outputs.handoff_at', '--time-left', 'AUTOPILOT_TIME',
    '`wrap_up_in_s` が1500を切っていれば選ばない', 'Bash の `timeout` は `handoff_in_s`', 'failure_class を time_box', 'UTC の期限と `date -u` を比べる',
    '最初に `date -u` を記録し',
    ...TIME_STAGES]) {
    assert(prompt.includes(part), `the deadline instructions must mention ${part}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--time-box') {
    try {
      const box = timeBox(process.env.JOB_STARTED_EPOCH);
      writeTimeBox(process.env.RUNNER_TEMP, box);
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `wrap_up_at=${isoSecond(box.wrap_up_epoch)}\nhandoff_at=${isoSecond(box.handoff_epoch)}\n`);
      }
      console.log(`Model time box: wrap up at ${isoSecond(box.wrap_up_epoch)}, hand off at ${isoSecond(box.handoff_epoch)} `
        + '(advisory; the action timeout stays the backstop).');
    } catch {
      console.error('Model time box unavailable; the session falls back to its own clock.');
      process.exitCode = 1;
    }
  } else if (args.length === 1 && args[0] === '--time-left') {
    console.log(timeLine(process.env.RUNNER_TEMP));
  } else {
    try {
      const result = progressCommand(args);
      if (args[0] === '--progress-finish') {
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'saved=true\n');
        console.log('Bounded progress receipt saved (untrusted diagnostic hints only).');
      } else console.log(`AUTOPILOT_PROGRESS ${JSON.stringify(result)}`);
    } catch {
      console.error('Bounded progress unavailable; no execution or publication verdict is changed.');
      process.exitCode = 1;
    }
    // The time left does not depend on the journal: every phase marker reports it, even when recording failed.
    if (args[0] === '--progress') console.log(timeLine(process.env.RUNNER_TEMP));
  }
}
