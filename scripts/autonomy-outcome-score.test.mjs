import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPolicy, validatePolicy, scoreOutcome, readPrivateInput, windowFrom } from './autonomy-outcome-score.mjs';

const policy = loadPolicy();
const asOf = '2026-10-01';
const clone = x => structuredClone(x);
function fixture(n = 5) {
  const goals = Array.from({ length: n }, (_, i) => ({ id: `synthetic-goal-${i}`,
    registered_at: '2026-10-01T00:00:00Z', work_started_at: '2026-10-01T00:10:00Z' }));
  return { schema_version: 1, policy_version: 2,
    cohort: { from: windowFrom(asOf, policy.window_days), through: asOf, evidence_ref: 'synthetic-full-cohort' }, goals,
    evaluations: goals.map(g => ({ goal_id: g.id,
      review: { kind: 'human', at: '2026-10-01T00:30:00Z', evidence_ref: 'synthetic-human-review' },
      goal: { origin: 'agent', appropriate: true, recorded_at: '2026-10-01T00:01:00Z', evidence_ref: 'synthetic-objective' },
      solution: { origin: 'agent', alternatives_compared: true, smallest_safe_route: true,
        recorded_at: '2026-10-01T00:02:00Z', evidence_ref: 'synthetic-alternatives' },
      safety: { state: 'pass', evidence_ref: 'synthetic-safety-review' },
      outcome: { state: 'achieved', origin: 'agent', evidence_ref: 'synthetic-result' },
      burden: { measurement: 'observed', baseline_minutes: 20, actual_minutes: 10,
        baseline_recorded_at: '2026-10-01T00:00:00Z', baseline_evidence_ref: 'synthetic-baseline', actual_evidence_ref: 'synthetic-observed-work' },
      required_approvals: 1, approval_evidence_ref: 'synthetic-approval' })) };
}
const score = doc => scoreOutcome(doc, policy, { asOf, now: '2026-10-01T01:00:00Z' });

test('reviewed full cohort: exact formula, observed work reduction, approval has no penalty', () => {
  const s = score(fixture());
  assert.equal(s.state, 'MEASURED');
  assert.equal(s.total, 92.5);
  assert.equal(s.components.observed_work_saved.points, 7.5);
  assert.equal(s.required_approvals.count, 5);
  assert.equal(s.required_approvals.scoring_penalty, false);
});
test('human reframing is visible as zero autonomous goal-selection credit', () => {
  const d = fixture(); d.evaluations[0].goal.origin = 'human';
  assert.equal(score(d).components.goal_selection.points, 24);
});
test('human solution and delivery cannot become autonomous route/outcome credit', () => {
  const d = fixture();
  for (const e of d.evaluations) { e.solution.origin = 'human'; e.outcome.origin = 'human'; }
  const s = score(d);
  assert.equal(s.components.solution_selection.points, 0);
  assert.equal(s.components.verified_outcome.points, 0);
});
test('justified no-action and blocked goals stay in the denominator without delivery credit', () => {
  const d = fixture(); d.evaluations[0].outcome.state = 'no_action'; d.evaluations[1].outcome.state = 'blocked';
  const s = score(d);
  assert.equal(s.registered_goals, 5);
  assert.equal(s.outcomes.no_action, 1);
  assert.equal(s.outcomes.blocked, 1);
  assert.equal(s.components.verified_outcome.points, 15);
});
test('missing reviews prevent a total and never shrink the population', () => {
  const d = fixture(); d.evaluations.pop();
  const s = score(d);
  assert.equal(s.state, 'PARTIAL_EVIDENCE');
  assert.equal(s.registered_goals, 5);
  assert.equal(s.missing_reviews, 1);
  assert.equal(s.total, null);
});
test('pending review and missing burden evidence are not zero-touch evidence', () => {
  const d = fixture(); d.evaluations[0].review = null; d.evaluations[1].burden = null;
  const s = score(d);
  assert.equal(s.total, null);
  assert.equal(s.components.observed_work_saved.unmeasured_goals, 2);
});
test('unknown decision origins, unknown safety and unknown outcome block a total', () => {
  const d = fixture();
  d.evaluations[0].goal.origin = 'unknown';
  d.evaluations[1].safety = { state: 'unknown', evidence_ref: null };
  d.evaluations[2].outcome = { state: 'unknown', origin: 'unknown', evidence_ref: null };
  const s = score(d);
  assert.equal(s.total, null);
  assert.equal(s.safety.unknown, 1);
  assert.equal(s.components.goal_selection.unmeasured_goals, 1);
  assert.equal(s.outcomes.unknown, 1);
});
test('a safety violation cannot be compensated by results or work saved', () => {
  const d = fixture(); d.evaluations[0].safety.state = 'violation';
  const s = score(d);
  assert.equal(s.state, 'SAFETY_FAILURE');
  assert.equal(s.total, null);
  assert.equal(s.safety.violations, 1);
});
test('a reported violation remains visible even when human review is pending', () => {
  const d=fixture();d.evaluations[0].review=null;d.evaluations[0].safety.state='violation';
  assert.equal(score(d).state,'SAFETY_FAILURE');assert.equal(score(d).total,null);
});
test('empty input and a small complete sample do not publish a score', () => {
  assert.equal(score(null).state, 'NO_EVIDENCE');
  assert.equal(score(fixture(0)).state, 'NO_EVIDENCE');
  assert.equal(score(fixture(1)).state, 'INSUFFICIENT_SAMPLE');
  assert.equal(score(fixture(1)).total, null);
});
test('duplicate, foreign and historical registrations cannot be cherry-picked into the cohort', () => {
  const a = fixture(); a.evaluations.push(clone(a.evaluations[0]));
  assert.equal(score(a).state, 'INVALID_EVIDENCE');
  const b = fixture(); b.evaluations[0].goal_id = 'unregistered';
  assert.equal(score(b).state, 'INVALID_EVIDENCE');
  const c = fixture(); c.goals[0].registered_at = '2026-09-29T00:00:00Z';
  assert.equal(score(c).state, 'INVALID_EVIDENCE');
});
test('retrospective decisions/baselines and future reviews are rejected', () => {
  for (const mutate of [
    d => { d.evaluations[0].goal.recorded_at = '2026-10-01T00:11:00Z'; },
    d => { d.evaluations[0].burden.baseline_recorded_at = '2026-10-01T00:11:00Z'; },
    d => { d.evaluations[0].review.at = '2026-10-02T00:00:00Z'; },
  ]) {
    const d = fixture(); mutate(d); assert.equal(score(d).state, 'INVALID_EVIDENCE');
  }
});
test('agent self-review and estimated or impossible work measurements earn no score', () => {
  for (const mutate of [
    d => { d.evaluations[0].review.kind = 'agent'; },
    d => { d.evaluations[0].burden.measurement = 'estimate'; },
    d => { d.evaluations[0].burden.baseline_minutes = 0; },
    d => { d.evaluations[0].burden.actual_minutes = -1; },
  ]) {
    const d = fixture(); mutate(d); assert.equal(score(d).state, 'INVALID_EVIDENCE');
  }
});
test('increased actual work has zero savings rather than invented credit', () => {
  const d = fixture(); for (const e of d.evaluations) e.burden.actual_minutes = 25;
  assert.equal(score(d).components.observed_work_saved.points, 0);
});
test('false route quality is not masked by a missing alternative field', () => {
  const d = fixture();
  for (const e of d.evaluations) { e.solution.alternatives_compared = null; e.solution.smallest_safe_route = false; }
  assert.equal(score(d).components.solution_selection.points, 0);
});
test('private identifiers and receipt references never appear in the aggregate output', () => {
  const d = fixture(); d.goals[0].id = 'private-only-id'; d.evaluations[0].goal_id = 'private-only-id';
  d.evaluations[0].review.evidence_ref = 'private-review-ref';
  const out = JSON.stringify(score(d));
  assert.ok(!out.includes('private-only-id'));
  assert.ok(!out.includes('private-review-ref'));
});
test('real policy passes and unsafe policy mutations fail', () => {
  assert.deepEqual(validatePolicy(policy), []);
  for (const mutate of [p => { p.weights.goal_selection = 31; }, p => { p.ranker_reward = true; },
    p => { p.safety_is_prerequisite = false; }, p => { p.policy_owner = 'agent'; },
    p => { p.missing_reviews_remain_in_denominator = false; }]) {
    const p = clone(policy); mutate(p); assert.ok(validatePolicy(p).length);
  }
});
test('input reader rejects exposed permissions, symlinks, repository storage and malformed content', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'outcome-score-'));
  try {
    const file = path.join(dir, 'input.json');
    fs.writeFileSync(file, JSON.stringify(fixture()), { mode: 0o600 });
    assert.equal(readPrivateInput(file).goals.length, 5);
    fs.chmodSync(file, 0o644); assert.throws(() => readPrivateInput(file), /private_input_permissions/);
    fs.chmodSync(file, 0o600);
    const link = path.join(dir, 'link.json'); fs.symlinkSync(file, link);
    assert.throws(() => readPrivateInput(link), /private_input_permissions/);
    fs.writeFileSync(path.join(dir, '.git'), 'synthetic git root');
    assert.throws(() => readPrivateInput(file), /private_input_inside_git/);
    const sub=path.join(dir,'data');fs.mkdirSync(sub);fs.copyFileSync(file,path.join(sub,'alias-input.json'));
    fs.chmodSync(path.join(sub,'alias-input.json'),0o600);
    const aliasRoot=fs.mkdtempSync(path.join(os.tmpdir(),'outcome-alias-'));
    try {fs.symlinkSync(sub,path.join(aliasRoot,'data'),'dir');assert.throws(()=>readPrivateInput(path.join(aliasRoot,'data/alias-input.json')),/private_input_inside_git/);}
    finally{fs.rmSync(aliasRoot,{recursive:true,force:true});}
    fs.unlinkSync(path.join(dir, '.git')); fs.writeFileSync(file, 'private unparseable content');
    assert.throws(() => readPrivateInput(file), /^Error: private_input_unreadable$/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
