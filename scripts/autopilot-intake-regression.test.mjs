import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codexRunIntake } from './lib/codex-run-intake.mjs';

const thread = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000003';
const now = Date.parse('2026-09-17T03:00:00Z');
const observation = (id = thread) => ({ codex_observation: {
  schema_version: 3, source: 'local_codex_scheduler_and_session_store',
  scheduler_query_complete: true, observed_at: '2026-09-17T02:00:00Z',
  runs: [{ thread_id: id, automation_id: 'obsidian', created_at: '2026-09-17T00:00:00Z',
    transcript: { state: 'observed', sha256: 'a'.repeat(64), turns: [{
      turn_id: '00000000-0000-0000-0000-000000000002',
      started_at: '2026-09-17T00:00:00Z', finished_at: '2026-09-17T00:10:00Z', state: 'failed',
    }] } }],
} });
const manual = id => ({ run_id: id, external_ref: `codex:${thread}`,
  date_jst: '2026-09-16', route: 'owner-session', source: 'session',
  attempted: true, outcome: 'shipped', pr: id === 'task-a' ? 100 : 101,
  interventions: [{ kind: 'request', note: 'Synthetic owner-directed task' }],
});
const intake = (runs, id = thread) => codexRunIntake(observation(id), { runs }, { now });
test('different owner tasks may share a session without becoming scheduled runs', () => {
  const rows = [manual('task-a'), manual('task-b')];
  const before = structuredClone(rows);
  assert.deepEqual(intake(rows), { valid: true, rows: [], triage: [], unresolved: [] });
  assert.deepEqual(rows, before, 'retain all manual outcomes and intervention evidence');
});
test('manual session grouping does not hide a distinct failed scheduled run', () => {
  const result = intake([manual('task-a'), manual('task-b')], other);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].external_ref, `codex:${other}`);
  assert.equal(result.rows[0].outcome, 'failed');
  assert.equal(result.rows[0].needs_triage, true);
});
for (const [label, change] of [
  ['scheduled record', { route: 'actions', source: 'act-reconcile' }],
  ['mixed origin', { source: 'act-reconcile-session' }],
  ['pending triage', { needs_triage: true }],
  ['same task id', { run_id: 'task-a' }],
]) test(`ambiguous repeated reference still rejects ${label}`, () => {
  const a = manual('task-a'), b = { ...manual('task-b'), ...change };
  for (const rows of [[a, b], [b, a]]) assert.throws(() => intake(rows), /duplicate Codex ledger/);
});
test('multiple scheduled rows are still forbidden', () => {
  const a = { ...manual('a'), route: 'actions', source: 'act-reconcile' };
  assert.throws(() => intake([a, { ...a, run_id: 'b' }]), /duplicate Codex ledger/);
});
// Replay the real workflow's act run block using an offline fake producer.
// In particular, bash -e alone must not let tee hide a failed producer.
function actBlock() {
  const text = fs.readFileSync(new URL('../.github/workflows/autopilot-act.yml', import.meta.url), 'utf8');
  const section = text.split('      - name: 実行（導出 → 突き合わせ → 自動実行）\n')[1];
  assert(section, 'actual actuator step must exist');
  const lines = section.split('\n');
  const start = lines.indexOf('        run: |');
  assert(start >= 0, 'actual run block must exist');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) { body.push(''); continue; }
    if (!line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n').replaceAll('${{ inputs.dry_run }}', 'false');
}
function replay(exit, badTee = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-failure-contract-'));
  try {
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nprintf "synthetic report\\n"\nexit "$FAKE_EXIT"\n', { mode: 0o700 });
    if (badTee) fs.writeFileSync(path.join(bin, 'tee'), '#!/bin/sh\ncat >/dev/null\nexit 23\n', { mode: 0o700 });
    const summary = path.join(dir, 'summary');
    const script = actBlock().replaceAll('/tmp/act.txt', path.join(dir, 'act.txt'));
    const run = spawnSync('bash', ['-e', '-c', script], { cwd: dir, encoding: 'utf8', timeout: 5000,
      env: { PATH: `${bin}:/usr/bin:/bin`, FAKE_EXIT: String(exit), GITHUB_STEP_SUMMARY: summary } });
    assert.ifError(run.error);
    return { status: run.status, summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : null };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('act producer failure survives tee and does not publish a summary', () => {
  assert.deepEqual(replay(42), { status: 42, summary: null });
});
test('act log-writer failure is also fatal', () => {
  assert.deepEqual(replay(0, true), { status: 23, summary: null });
});
test('successful act still writes its exact output once', () => {
  assert.deepEqual(replay(0), { status: 0, summary: 'synthetic report\n' });
});
test('a repeated third owner task id is not hidden by the first task', () => {
  assert.throws(() => intake([manual('task-a'), manual('task-b'), manual('task-b')]), /duplicate Codex ledger/);
});
test('three genuinely distinct owner tasks preserve the full ledger', () => {
  const rows = ['task-a', 'task-b', 'task-c'].map(manual);
  const before = JSON.stringify(rows);
  assert.equal(intake(rows).rows.length, 0);
  assert.equal(JSON.stringify(rows), before);
});
