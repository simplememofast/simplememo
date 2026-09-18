import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/autopilot-act.yml'), 'utf8');

// Execute the actual workflow shell, not a second implementation. The block
// extractor deliberately rejects unknown indentation instead of silently
// testing an empty script. All external commands below are shell stubs.
function stepScript(name) {
  const marker = `      - name: ${name}\n`;
  assert.equal(workflow.split(marker).length, 2, `unique step: ${name}`);
  const tail = workflow.split(marker)[1];
  const end = tail.indexOf('\n      - ');
  const step = end < 0 ? tail : tail.slice(0, end);
  const start = step.indexOf('        run: |\n');
  assert.notEqual(start, -1, `literal run block: ${name}`);
  const lines = [];
  for (const line of step.slice(start + '        run: |\n'.length).split('\n')) {
    if (!line.trim()) { lines.push(''); continue; }
    if (!line.startsWith('          ')) break;
    lines.push(line.slice(10));
  }
  assert.ok(lines.some(line => line.trim()), `nonempty script: ${name}`);
  return lines.join('\n');
}

const prepare = stepScript('Prepare ledger branch before observation');
const publish = stepScript('変更があればPRにする');
const branch = 'claude/autopilot-act-20260917';

const stubs = String.raw`
record() { printf '%s' "$1" >> "$CALL_LOG"; shift; printf '\t%s' "$@" >> "$CALL_LOG"; printf '\n' >> "$CALL_LOG"; }
git() {
  record git "$@"
  case "$1" in
    symbolic-ref) if [ "$DETACHED" = 1 ]; then return 1; fi; printf '%s\n' "$CHECKED_OUT_BRANCH"; return "$SYMBOLIC_EXIT" ;;
    status) if [ "$HAS_CHANGES" = 1 ]; then printf ' M data/autopilot-status.json\n'; fi ;;
    commit) return "$COMMIT_EXIT" ;;
    push) return "$PUSH_EXIT" ;;
    diff) if [ -n "$PENDING_PATH" ]; then printf '%s\n' "$PENDING_PATH"; fi ;;
    checkout) return "$CHECKOUT_EXIT" ;;
    config|fetch|merge|add) return 0 ;;
    *) printf 'unexpected git command: %s\n' "$1" >&2; return 90 ;;
  esac
}
gh() {
  record gh "$@"
  case "$1 $2" in
    'pr list') if [ "$LIST_EXIT" != 0 ]; then return "$LIST_EXIT"; fi; printf '%s\n' "$OPEN_PR" ;;
    'pr create') return 0 ;;
    *) printf 'unexpected gh command\n' >&2; return 91 ;;
  esac
}
date() {
  record date "$@"
  case "$*" in
    +%Y%m%d) printf '%s\n' "$CLOCK_DAY" ;;
    +%Y-%m-%d) printf '%s\n' "$CLOCK_DATE" ;;
    *) return 92 ;;
  esac
}
cat() {
  record cat "$@"
  if [ "$*" != /tmp/act.txt ]; then return 93; fi
  printf 'synthetic report; no production data\n'
}
`;

function run(script, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-publish-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const log = path.join(dir, 'calls');
  const output = path.join(dir, 'output');
  fs.writeFileSync(log, '');
  fs.writeFileSync(output, '');
  try {
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', stubs + script], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 5000,
      // Do not inherit credentials, shell hooks, Git config or owner files.
      // An empty PATH also prevents an un-stubbed command from doing real work.
      env: {
        PATH: bin, HOME: dir, RUNNER_TEMP: dir,
        CALL_LOG: log, GITHUB_OUTPUT: output,
        PREPARED_BRANCH: branch, CHECKED_OUT_BRANCH: branch,
        CLOCK_DAY: '20260918', CLOCK_DATE: '2026-09-18', HAS_CHANGES: '1', OPEN_PR: '',
        LIST_EXIT: '0', COMMIT_EXIT: '0', PUSH_EXIT: '0',
        CHECKOUT_EXIT: '0', SYMBOLIC_EXIT: '0', DETACHED: '0', PENDING_PATH: '',
        ...overrides,
      },
    });
    assert.ifError(result.error);
    return { ...result, calls: fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => line.split('\t')),
      output: fs.readFileSync(output, 'utf8') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const callsOf = (result, command, subcommand) => result.calls.filter(parts => parts[0] === command && parts[1] === subcommand);
function noWrites(result) {
  assert.equal(callsOf(result, 'git', 'add').length, 0);
  assert.equal(callsOf(result, 'git', 'commit').length, 0);
  assert.equal(callsOf(result, 'git', 'push').length, 0);
  assert.equal(callsOf(result, 'gh', 'pr').filter(parts => parts[2] === 'create').length, 0);
}

test('preparation exports its selected branch only after successful checkout', () => {
  const result = run(prepare, { CLOCK_DAY: '20260917' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `branch=${branch}\n`);
  assert.deepEqual(callsOf(result, 'git', 'checkout')[0], ['git', 'checkout', '-B', branch]);
  const failed = run(prepare, { CLOCK_DAY: '20260917', CHECKOUT_EXIT: '23' });
  assert.equal(failed.status, 23);
  assert.equal(failed.output, '');
});

test('an existing pending branch keeps its path allowlist and main merge', () => {
  const result = run(prepare, { CLOCK_DAY: '20260917', OPEN_PR: '1447', PENDING_PATH: 'autopilot/index.html' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `branch=${branch}\n`);
  assert.deepEqual(callsOf(result, 'git', 'checkout')[0], ['git', 'checkout', '-B', branch, 'FETCH_HEAD']);
  assert.deepEqual(callsOf(result, 'git', 'merge')[0], ['git', 'merge', '--no-edit', 'origin/main']);
  const rejected = run(prepare, { OPEN_PR: '1447', PENDING_PATH: 'scripts/protected.mjs' });
  assert.notEqual(rejected.status, 0);
  assert.equal(rejected.output, '');
  assert.equal(callsOf(rejected, 'git', 'checkout').length, 0);
});

for (const clock of ['20260917', '20260918', '20261001']) {
  test(`publishing at ${clock} uses the prepared branch, not the new clock date`, () => {
    const result = run(publish, { CLOCK_DAY: clock });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(callsOf(result, 'git', 'push'), [['git', 'push', '--force-with-lease', '-u', 'origin', branch]]);
    for (const call of callsOf(result, 'gh', 'pr')) {
      assert.equal(call[call.indexOf('--head') + 1], branch);
    }
  });
}

for (const [label, values] of [
  ['missing prepared branch', { PREPARED_BRANCH: '' }],
  ['main branch', { PREPARED_BRANCH: 'main', CHECKED_OUT_BRANCH: 'main' }],
  ['unexpected prepared branch', { PREPARED_BRANCH: 'claude/autopilot-act-20260917-extra' }],
  ['different checkout', { CHECKED_OUT_BRANCH: 'claude/autopilot-act-20260918' }],
  ['detached checkout', { DETACHED: '1' }],
]) {
  test(`${label} fails before any mutation`, () => {
    const result = run(publish, values);
    assert.notEqual(result.status, 0);
    noWrites(result);
  });
}

test('a branch read error is not accepted even when it prints the expected name', () => {
  const result = run(publish, { SYMBOLIC_EXIT: '20' });
  assert.equal(result.status, 20);
  noWrites(result);
});

test('un-stubbed external commands cannot fall through to real tools', () => {
  const result = run('env');
  assert.equal(result.status, 127);
  assert.equal(result.calls.length, 0);
});

test('a clean working tree remains a no-op', () => {
  const result = run(publish, { HAS_CHANGES: '0' });
  assert.equal(result.status, 0, result.stderr);
  noWrites(result);
  assert.equal(callsOf(result, 'gh', 'pr').length, 0);
});

test('an existing open PR is not duplicated after midnight', () => {
  const result = run(publish, { OPEN_PR: '1447' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(callsOf(result, 'gh', 'pr').filter(parts => parts[2] === 'create').length, 0);
});

test('a failed PR lookup remains a failure, not an empty successful lookup', () => {
  const result = run(publish, { LIST_EXIT: '19' });
  assert.equal(result.status, 19, result.stderr);
  assert.equal(callsOf(result, 'gh', 'pr').filter(parts => parts[2] === 'create').length, 0);
});

for (const [failure, code] of [['COMMIT_EXIT', 17], ['PUSH_EXIT', 18]]) {
  test(`${failure} prevents a later PR mutation`, () => {
    const result = run(publish, { [failure]: String(code) });
    assert.equal(result.status, code);
    assert.equal(callsOf(result, 'gh', 'pr').length, 0);
    if (failure === 'COMMIT_EXIT') assert.equal(callsOf(result, 'git', 'push').length, 0);
  });
}

test('the workflow passes the prepared output to the guarded publishing step', () => {
  assert.ok(/- name: Prepare ledger branch before observation\n        id: ledger_branch\n/.test(workflow), 'preparation step exports an identified output');
  assert.ok(/PREPARED_BRANCH: \$\{\{ steps\.ledger_branch\.outputs\.branch \}\}/.test(workflow), 'publishing receives the prepared output');
  const seo = fs.readFileSync(path.join(ROOT, '.github/workflows/seo-check.yml'), 'utf8');
  assert.ok(/run: node --test scripts\/refactor\.test\.mjs/.test(seo), 'normal CI runs refactor tests');
  const suite = fs.readFileSync(path.join(ROOT, 'scripts/refactor.test.mjs'), 'utf8');
  assert.ok(suite.includes("import './autopilot-act-publish.test.mjs';"), 'refactor suite runs these regressions');
});
