import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { reconcileSnapshots, assertPinnedRefs, canonical, RUNS, COST, ACTIONS, HISTORY, ELIGIBILITY, renderReconciliationReport } from './lib/autopilot-act-reconcile.mjs';
import { prepare } from './autopilot-act-reconcile.mjs';
const text = d => JSON.stringify(d, null, 2) + '\n';
const run = (id, ref) => ({ run_id: id, external_ref: ref, date_jst: '2026-11-05', route: 'actions', source: 'act-reconcile',
  attempted: false, outcome: 'skipped_gate', interventions: null });
const cost = (id, amount = 1) => ({ run_id: id, date_jst: '2026-11-05', route: 'actions', total_cost_usd: amount,
  task_kind: 'analysis', outcome: 'skipped_gate', task_kind_source: { provider: 'github_job_log', run_id: id,
    job_id: '1234', run_attempt: 1, step_number: 4, observed_at: '2026-11-05T02:40:00Z', task_kind: 'analysis' } });
const action = { id: 'act-a', state: 'acknowledged', evidence: 'Owner decision', force_owner: 'human',
  close_check: { kind: 'cost_covers_runs', params: { exclude: ['legacy'] } }, last_seen_jst: '2026-11-04' };
function fixture() {
  const base = {
    [RUNS]: text({ runs: [run('a', '100')] }),
    [COST]: text({ budget: { max: 1 }, runs: [cost('100')] }),
    [ACTIONS]: text({ last_run_jst: '2026-11-04', actions: [action], escalation_review_authorization: 'unchanged' }),
    [HISTORY]: text({ snapshots: [{ at: '2026-11-04', total: 5 }] }),
    [ELIGIBILITY]: text({ enforcement: 'record_plus_r2_block', last_judged_jst: '2026-11-04', judgements: [{ candidate_id: 'act-a', judged_jst: '2026-11-04', halted: true }] }),
  };
  const refs = { base: 'a'.repeat(40), main: 'b'.repeat(40), pending: 'c'.repeat(40) };
  return { base, main: structuredClone(base), pending: structuredClone(base), changedPaths: [], refs, observedRefs: { ...refs } };
}
function change(input, side, file, fn) {
  const d = JSON.parse(input[side][file]); fn(d); input[side][file] = text(d);
  if (side === 'pending' && !input.changedPaths.includes(file)) input.changedPaths.push(file);
}
function rejects(input, code) { assert.throws(() => reconcileSnapshots(input), e => e.code === code); }
const resultDoc = (result, file) => JSON.parse(result.files[file]);

test('independent run/cost appends union without losing either side', () => {
  const x = fixture();
  for (const [side, id, ref] of [['main', 'm', '200'], ['pending', 'p', '300']]) {
    change(x, side, RUNS, d => d.runs.push(run(id, ref)));
    change(x, side, COST, d => d.runs.push(cost(ref)));
  }
  const result = reconcileSnapshots(x);
  assert.deepEqual(resultDoc(result, RUNS).runs.map(r => r.run_id), ['a', 'm', 'p']);
  assert.deepEqual(resultDoc(result, COST).runs.map(r => r.run_id), ['100', '200', '300']);
  assert.equal(resultDoc(result, COST).runs.reduce((s, r) => s + r.total_cost_usd, 0), 3);
});
test('same observed ID and payload is idempotent on repeated preparation', () => {
  const x = fixture();
  for (const side of ['main', 'pending']) change(x, side, RUNS, d => d.runs.push(run('shared', '200')));
  const a = reconcileSnapshots(x);
  assert.equal(resultDoc(a, RUNS).runs.length, 2);
  x.main = { ...x.main, ...a.files };
  const b = reconcileSnapshots(x);
  assert.deepEqual(a.files, b.files);
});
test('same ID with object-key reordering is equal', () => {
  const x = fixture(); change(x, 'pending', RUNS, d => { d.runs[0] = Object.fromEntries(Object.entries(d.runs[0]).reverse()); });
  assert.equal(resultDoc(reconcileSnapshots(x), RUNS).runs.length, 1);
});
for (const side of ['base', 'main', 'pending']) test(`duplicate ID in ${side} fails closed`, () => {
  const x = fixture(); change(x, side, RUNS, d => d.runs.push(d.runs[0])); if (side === 'base') x.changedPaths.push(RUNS); rejects(x, 'duplicate_id');
});
for (const side of ['main', 'pending']) test(`removal from ${side} cannot erase a run`, () => {
  const x = fixture(); change(x, side, RUNS, d => { d.runs = []; }); rejects(x, 'row_removed');
});
test('different rows under the same ID do not overwrite a cost', () => {
  const x = fixture(); change(x, 'main', COST, d => { d.runs[0].total_cost_usd = 2; });
  change(x, 'pending', COST, d => { d.runs[0].total_cost_usd = 0; }); rejects(x, 'row_conflict');
});
test('a newer main-only corrected result and budget remain intact', () => {
  const x = fixture(); change(x, 'main', RUNS, d => { d.runs[0].outcome = 'failed'; d.runs[0].attempted = true; });
  change(x, 'main', COST, d => { d.budget.max = 0.5; });
  const out = reconcileSnapshots(x);
  assert.equal(resultDoc(out, RUNS).runs[0].outcome, 'failed'); assert.equal(resultDoc(out, COST).budget.max, 0.5);
});
test('same GitHub run under different ledger IDs fails closed', () => {
  const x = fixture(); change(x, 'pending', RUNS, d => d.runs.push(run('alias', '100'))); rejects(x, 'duplicate_external_ref');
});
for (const key of ['repair_of', 'future_gate_override']) test(`${key} cannot ride in a new run`, () => {
  const x = fixture(); change(x, 'pending', RUNS, d => d.runs.push({ ...run('p', '300'), [key]: ['a'] })); rejects(x, 'unknown_run_field');
});
test('new owner intervention cannot ride in a run', () => {
  const x = fixture(); change(x, 'pending', RUNS, d => d.runs.push({ ...run('p', '300'), interventions: [] })); rejects(x, 'owner_intervention');
});
test('shape-valid unverified shipped run fails closed', () => {
  const x = fixture(); change(x, 'pending', RUNS, d => d.runs.push({ ...run('p', '300'), outcome: 'shipped', attempted: true })); rejects(x, 'unverified_shipping');
});
test('new cost without an observed run does not materialize', () => {
  const x = fixture(); change(x, 'pending', COST, d => d.runs.push(cost('300'))); rejects(x, 'unverified_cost_shape');
});
test('cost log identity mismatch fails closed', () => {
  const x = fixture(); change(x, 'pending', RUNS, d => d.runs.push(run('p', '300')));
  change(x, 'pending', COST, d => d.runs.push({ ...cost('300'), task_kind_source: { ...cost('300').task_kind_source, run_id: '999' } }));
  rejects(x, 'unverified_cost_source');
});
for (const key of ['cap_review', 'cost_expectation']) test(`pending ${key} cannot alter a gate`, () => {
  const x = fixture(); change(x, 'pending', RUNS, d => d.runs.push(run('p', '300')));
  change(x, 'pending', COST, d => d.runs.push({ ...cost('300'), [key]: {} })); rejects(x, 'unknown_cost_field');
});
test('pending budget change is not a row reconciliation', () => {
  const x = fixture(); change(x, 'pending', COST, d => { d.budget.max = 99; }); rejects(x, 'pending_header_changed');
});
test('NaN-like JSON infinity is rejected rather than equated to null', () => {
  const x = fixture(); x.pending[COST] = x.pending[COST].replace('"total_cost_usd": 1', '"total_cost_usd": 1e999'); x.changedPaths.push(COST); rejects(x, 'unreadable');
});
for (const [name, fn, code] of [
  ['acknowledgment', d => { d.actions[0].state = 'open'; }, 'acknowledgment_changed'],
  ['decision evidence', d => { d.actions[0].evidence = 'pretend approved'; }, 'acknowledgment_changed'],
  ['owner', d => { d.actions[0].force_owner = null; }, 'owner_or_unknown_action_change'],
  ['exclusion', d => { d.actions[0].close_check.params.exclude = []; }, 'owner_or_unknown_action_change'],
  ['unknown field', d => { d.actions[0].future_approval = true; }, 'owner_or_unknown_action_change'],
  ['top-level authorization', d => { d.escalation_review_authorization = 'expanded'; }, 'pending_header_changed'],
]) test(`pending ${name} change fails closed`, () => { const x = fixture(); change(x, 'pending', ACTIONS, fn); rejects(x, code); });
test('main owner decisions stay byte-for-byte semantically intact while old timestamps are discarded', () => {
  const x = fixture(); change(x, 'main', ACTIONS, d => { d.actions[0].evidence = 'New owner decision'; d.actions[0].force_owner = 'human'; });
  change(x, 'pending', ACTIONS, d => { d.actions[0].last_seen_jst = '2026-11-05'; d.last_run_jst = '2026-11-05'; });
  assert.equal(canonical(resultDoc(reconcileSnapshots(x), ACTIONS)), canonical(JSON.parse(x.main[ACTIONS])));
});
test('branch-only action is not silently lost', () => {
  const x = fixture(); change(x, 'pending', ACTIONS, d => d.actions.push({ ...action, id: 'branch-only' })); rejects(x, 'unreconciled_action');
});
test('emergency-stop changes are never reset to main', () => {
  const x = fixture(), file = 'data/emergency-stop.json'; x.base[file] = x.main[file] = text({ stopped: true }); x.pending[file] = text({ stopped: false }); x.changedPaths.push(file); rejects(x, 'stop_or_observation_change');
});
test('new routine observation cannot be lost behind a generated-file rule', () => {
  const x = fixture(), file = 'data/routine-runs.json'; x.base[file] = x.main[file] = text({ routines: [] }); x.pending[file] = text({ routines: [{ observed_at: 'new' }] }); x.changedPaths.push(file); rejects(x, 'stop_or_observation_change');
});
test('historical additions survive while conflicting same-day history fails closed', () => {
  const x = fixture(); change(x, 'pending', HISTORY, d => d.snapshots.push({ at: '2026-11-05', total: 6 }));
  assert.equal(resultDoc(reconcileSnapshots(x), HISTORY).snapshots.length, 2);
  change(x, 'main', HISTORY, d => d.snapshots.push({ at: '2026-11-05', total: 7 })); rejects(x, 'row_conflict');
});
test('eligibility uses candidate and day, preserves halted historical evidence', () => {
  const x = fixture(); change(x, 'pending', ELIGIBILITY, d => d.judgements.push({ candidate_id: 'act-a', judged_jst: '2026-11-05', halted: true }));
  const out = resultDoc(reconcileSnapshots(x), ELIGIBILITY); assert.equal(out.judgements.length, 2); assert.ok(out.judgements.every(r => r.halted));
});
test('old report bytes are not imported; required regeneration is explicit', () => {
  const x = fixture(), file = 'data/autopilot-actions-report.json';
  x.base[file] = '{}'; x.main[file] = '{"today":true}'; x.pending[file] = '{"stale":true}'; x.changedPaths.push(file);
  const out = reconcileSnapshots(x); assert.ok(!(file in out.files)); assert.ok(out.receipt.regenerate.includes(file));
  assert.match(renderReconciliationReport(out.receipt), /prepared_not_publishable/);
});
for (const name of ['base', 'main', 'pending']) test(`${name} moving after read fails before output`, () => {
  const x = fixture(); x.observedRefs[name] = 'd'.repeat(40); rejects(x, 'ref_moved_or_unreadable');
});
test('missing observed refs never mean stable', () => { assert.throws(() => assertPinnedRefs(fixture().refs, {})); });
test('unexpected file and path traversal fail closed', () => {
  for (const file of ['scripts/protected.mjs', '../escape', 'en/autopilot/index.html']) { const x = fixture(); x.changedPaths.push(file); rejects(x, 'unexpected_path'); }
});
test('incomplete change inventory fails closed', () => {
  const x = fixture(); change(x, 'pending', RUNS, d => d.runs.push(run('p', '300'))); x.changedPaths = []; rejects(x, 'incomplete_inventory');
});
test('CLI validates all files before output; existing destinations and symlinks are untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-offline-test-'));
  try {
    const input = path.join(dir, 'input.json'), output = path.join(dir, 'output'); const x = fixture();
    fs.writeFileSync(input, JSON.stringify(x)); const bytes = fs.readFileSync(input);
    prepare(input, output); assert.deepEqual(fs.readFileSync(input), bytes);
    const first = fs.readFileSync(path.join(output, RUNS)); assert.throws(() => prepare(input, output));
    assert.deepEqual(fs.readFileSync(path.join(output, RUNS)), first);
    const link = path.join(dir, 'link'); fs.symlinkSync(output, link); assert.throws(() => prepare(input, link));
    change(x, 'pending', COST, d => { d.budget.max = 2; }); fs.writeFileSync(input, JSON.stringify(x));
    const failed = path.join(dir, 'failed'); assert.throws(() => prepare(input, failed)); assert.ok(!fs.existsSync(failed));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('explicit Git lease rejects a competing writer without losing its ledger', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-lease-test-'));
  const env = { PATH: '/usr/bin:/bin', HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (cwd, args, okay = true) => { const r = spawnSync('/usr/bin/git', args, { cwd, env, encoding: 'utf8', timeout: 10000 }); assert.ifError(r.error); if (okay) assert.equal(r.status, 0, r.stderr); return r; };
  try {
    git(dir, ['init', '--bare', 'remote.git']); git(dir, ['clone', path.join(dir, 'remote.git'), 'first']);
    const a = path.join(dir, 'first'), remote = path.join(dir, 'remote.git');
    fs.writeFileSync(path.join(a, 'ledger'), 'base'); git(a, ['add', 'ledger']); git(a, ['commit', '-m', 'base']);
    git(a, ['push', 'origin', 'HEAD:refs/heads/act']); const expected = git(a, ['rev-parse', 'HEAD']).stdout.trim();
    git(dir, ['clone', '--branch', 'act', remote, 'second']); const b = path.join(dir, 'second');
    fs.writeFileSync(path.join(b, 'ledger'), 'concurrent fact'); git(b, ['add', 'ledger']); git(b, ['commit', '-m', 'concurrent']); git(b, ['push', 'origin', 'HEAD:refs/heads/act']);
    const winner = git(b, ['rev-parse', 'HEAD']).stdout.trim();
    // Even a background fetch updating tracking refs cannot defeat explicit lease.
    git(a, ['fetch', 'origin']); fs.writeFileSync(path.join(a, 'ledger'), 'stale plan'); git(a, ['add', 'ledger']); git(a, ['commit', '-m', 'stale']);
    const lost = git(a, ['push', `--force-with-lease=refs/heads/act:${expected}`, 'origin', 'HEAD:refs/heads/act'], false);
    assert.notEqual(lost.status, 0); assert.equal(git(remote, ['rev-parse', 'refs/heads/act']).stdout.trim(), winner);
    assert.equal(git(remote, ['show', 'refs/heads/act:ledger']).stdout, 'concurrent fact');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('manual completion is a protected owner decision, not a stale derivation', () => {
  const x = fixture();
  for (const side of ['base', 'main', 'pending']) change(x, side, ACTIONS, d => {
    d.actions[0].state = 'open'; d.actions[0].close_check = { kind: 'manual' };
  });
  change(x, 'pending', ACTIONS, d => { d.actions[0].state = 'done'; d.actions[0].closed_jst = '2026-11-05'; d.actions[0].evidence = 'Owner completed'; });
  rejects(x, 'manual_decision_changed');
  x.main[ACTIONS] = x.pending[ACTIONS];
  assert.equal(resultDoc(reconcileSnapshots(x), ACTIONS).actions[0].state, 'done');
});
test('status owner prose is protected while only its runs block is regenerated', () => {
  const x = fixture(), file = 'data/autopilot-status.json';
  x.base[file] = text({ owner_requests: ['decision'], runs: { n: 1 } });
  x.main[file] = text({ owner_requests: ['new main decision'], runs: { n: 2 } });
  x.pending[file] = text({ owner_requests: ['decision'], runs: { n: 3 } }); x.changedPaths.push(file);
  assert.equal(reconcileSnapshots(x).files[file], x.main[file]);
  x.pending[file] = text({ owner_requests: ['different owner decision'], runs: { n: 3 } }); rejects(x, 'status_owner_decision_changed');
});
test('post-generation check rejects lost or changed earlier-day history, permits today replacement', async () => {
  const { verifyPreparedHistory } = await import('./lib/autopilot-act-reconcile.mjs');
  const plan = reconcileSnapshots(fixture()), current = structuredClone(plan.files);
  verifyPreparedHistory(plan.receipt, current, '2026-11-05');
  current[HISTORY] = text({ snapshots: [] });
  assert.throws(() => verifyPreparedHistory(plan.receipt, current, '2026-11-05'), /historical_row_changed/);
  // Today's score is derived afresh by the existing generator.
  verifyPreparedHistory(plan.receipt, current, '2026-11-04');
});
