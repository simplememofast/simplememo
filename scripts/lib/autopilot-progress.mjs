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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = progressCommand(process.argv.slice(2));
    if (process.argv[2] === '--progress-finish') {
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'saved=true\n');
      console.log('Bounded progress receipt saved (untrusted diagnostic hints only).');
    } else console.log(`AUTOPILOT_PROGRESS ${JSON.stringify(result)}`);
  } catch {
    console.error('Bounded progress unavailable; no execution or publication verdict is changed.');
    process.exitCode = 1;
  }
}
