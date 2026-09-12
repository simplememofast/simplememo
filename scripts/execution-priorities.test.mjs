import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritize } from './execution-priorities.mjs';
import { analyse, planTo, executionPlan } from './autonomy-gap.mjs';

const now = new Date('2026-09-09T07:00:00Z');
const task = (name, executor, blocker = 'not_started') => ({ area: 'A', task: name, executor, blocker });
const coverage = { tasks: [task('done', 'ai_autonomous'), task('transfer', 'ai_proposes'),
  task('start', 'nobody'), task('physical', 'human_only', 'physical_human'), task('excluded', 'intentional_no')] };
const assessment = (name, over = {}) => ({ area: 'A', task: name, state: 'act', estimated_minutes: 30,
  observed_at: '2026-09-09T06:00:00Z', expires_at: '2026-09-10T06:00:00Z',
  evidence: ['scripts/execution-priorities.mjs'], next_step: 'Execute and verify', ...over });

test('existing transfers gain more than starting a task; neither changes the inventory', () => {
  const before = JSON.stringify(coverage);
  const r = prioritize(coverage, { entries: [assessment('transfer'), assessment('start')] }, now);
  assert.equal(r.opportunities[0].task, 'transfer');
  assert.equal(r.opportunities[0].potential.denominator, 3);
  assert.equal(r.opportunities[1].potential.denominator, 4);
  assert.equal(r.current.ai_executes, 1);
  assert.equal(r.target_ai_execution_rate, 0.98);
  assert.equal(r.target_comparison, 'strictly_greater');
  assert.equal(r.current.defined, 4);
  assert.equal(JSON.stringify(coverage), before);
  assert.deepEqual(new Set(r.opportunities.map(t => t.task)), new Set(['transfer', 'start', 'physical']));
});

test('waiting work and physical boundaries cannot become a quick win', () => {
  const r = prioritize(coverage, { entries: [assessment('transfer', { state: 'wait', estimated_minutes: 1 }),
    assessment('physical', { estimated_minutes: 1 })] }, now);
  assert.equal(r.opportunities[0].task, 'start');
  assert.equal(r.opportunities.find(t => t.task === 'physical').state, 'boundary');
});

test('delegation cannot add a circular dispatch prerequisite to the achievable ceiling', () => {
  const doc = { tasks: [task('done', 'ai_autonomous'),
    task('dispatch', 'human_only', 'circular_prerequisite'),
    task('consent', 'ai_proposes', 'human_consent')] };
  const before = JSON.stringify(doc);
  const r = prioritize(doc, { entries: [assessment('dispatch', { state: 'act' })] }, now);
  assert.equal(r.opportunities.find(t => t.task === 'dispatch').state, 'boundary');
  assert.equal(analyse(doc).ceiling, 1);
  assert.equal(analyse(doc).ceiling_with_handover, 1);
  assert.equal(planTo(doc, 0.999).steps.length, 0);
  assert.equal(executionPlan(doc).classified_ceiling.numerator, 1);
  assert.equal(JSON.stringify(doc), before);
});

test('expired assessments lose their execution recommendation and estimate', () => {
  const r = prioritize(coverage, { entries: [assessment('transfer', { expires_at: now.toISOString() })] }, now);
  const row = r.opportunities.find(t => t.task === 'transfer');
  assert.equal(row.state, 'inspect');
  assert.equal(row.estimated_minutes, null);
  assert.equal(row.assessment_stale, true);
  assert.equal(row.estimated_delta_pp_per_hour, null);
  assert.deepEqual(row.evidence, []);
  assert.notEqual(row.next_step, 'Execute and verify');
});

test('expiry preserves waiting reasons instead of promoting unresolved work to inspection', () => {
  const prior = assessment('start', { state: 'wait', expires_at: now.toISOString(),
    next_step: 'Resume only after real delivery evidence is available' });
  const before = JSON.stringify(prior);
  const result = prioritize(coverage, { entries: [prior] }, now);
  const row = result.opportunities.find(candidate => candidate.task === 'start');
  assert.equal(row.state, 'wait');
  assert.equal(row.assessment_stale, true);
  assert.equal(row.last_assessed_at, prior.observed_at);
  assert.equal(row.estimated_minutes, null);
  assert.equal(row.estimated_delta_pp_per_hour, null);
  assert.equal(row.next_step, prior.next_step);
  assert.deepEqual(row.evidence, prior.evidence);
  assert.equal(JSON.stringify(prior), before);
});

test('an expired deferral remains deferred without a new assessment', () => {
  const result = prioritize(coverage, { entries: [assessment('start', {
    state: 'defer', expires_at: now.toISOString(), next_step: 'Wait for a relevant business need',
  })] }, now);
  const row = result.opportunities.find(candidate => candidate.task === 'start');
  assert.equal(row.state, 'defer');
  assert.equal(row.assessment_stale, true);
  assert.equal(row.estimated_delta_pp_per_hour, null);
});

test('a new act assessment can resume held work but cannot override physical boundaries', () => {
  const result = prioritize(coverage, { entries: [assessment('start'), assessment('physical')] }, now);
  const resumed = result.opportunities.find(candidate => candidate.task === 'start');
  const boundary = result.opportunities.find(candidate => candidate.task === 'physical');
  assert.equal(resumed.state, 'act');
  assert.ok(resumed.estimated_delta_pp_per_hour > 0);
  assert.equal(boundary.state, 'boundary');
  assert.equal(boundary.estimated_delta_pp_per_hour, null);
});

test('fresh waiting work never claims immediately executable score per hour', () => {
  const result = prioritize(coverage, { entries: [assessment('transfer', { state: 'wait', estimated_minutes: 1 })] }, now);
  const row = result.opportunities.find(candidate => candidate.task === 'transfer');
  assert.equal(row.estimated_minutes, 1);
  assert.equal(row.estimated_delta_pp_per_hour, null);
  assert.ok(row.potential.delta_pp > 0);
});

test('fresh act assessments cannot override unmet inventory prerequisites', () => {
  const doc = structuredClone(coverage);
  doc.tasks[1].blocked_on = [{ file: 'data/does-not-exist.json', path: 'count', atLeast: 28 }];
  const r = prioritize(doc, { entries: [assessment('transfer')] }, now);
  const row = r.opportunities.find(t => t.task === 'transfer');
  assert.equal(row.state, 'wait');
  assert.equal(row.unmet_prerequisites.length, 1);
});

test('effort sorts eligible work without hiding low impact or unknown tasks', () => {
  const r = prioritize(coverage, { entries: [assessment('transfer', { estimated_minutes: 180 }),
    assessment('start', { estimated_minutes: 10 })] }, now);
  assert.equal(r.opportunities[0].task, 'start');
  assert.equal(r.opportunities.length, 3);
});

test('invalid estimates, forged dates, missing tasks and duplicate identities are rejected', () => {
  for (const entries of [[assessment('absent')], [assessment('transfer'), assessment('transfer')],
    [assessment('transfer', { estimated_minutes: 0 })], [assessment('transfer', { evidence: [] })],
    [assessment('transfer', { observed_at: '2027-01-01' })], [assessment('transfer', { expires_at: 'invalid' })]]) {
    assert.throws(() => prioritize(coverage, { entries }, now));
  }
});

test('evidence must reference a real repository file', () => {
  for (const evidence of ['x', [null], [' '], ['missing.md'], ['../outside.md'], ['/tmp/source.md']]) {
    assert.throws(() => prioritize(coverage, { entries: [assessment('transfer', { evidence })] }, now));
  }
  assert.throws(() => prioritize(coverage, {}, now));
});

const dispatch = (executor = 'human_only') => ({ area: '③ 自律型マーケティング',
  task: 'PR TIMES への配信操作', executor, blocker: 'verification_pending' });
const consent = () => ({ area: '⑪ データ・プライバシー', task: '収集同意',
  executor: 'ai_proposes', blocker: 'human_consent' });
const goalInventory = () => ({ tasks: [
  ...Array.from({ length: 156 }, (_, i) => task(`done${i}`, 'ai_executes_gated')),
  ...Array.from({ length: 21 }, (_, i) => task(`transfer${i}`, 'human_only')),
  consent(), dispatch(),
  ...Array.from({ length: 20 }, (_, i) => task(`new${i}`, 'nobody')),
  ...Array.from({ length: 4 }, (_, i) => task(`excluded${i}`, 'intentional_no')),
] });

test('consent and deferred dispatch remain held under the owner-revised 98% goal', () => {
  const doc = goalInventory(), before = JSON.stringify(doc);
  const r = prioritize(doc, { entries: [] }, now), bound = r.pre_dispatch_upper_bound;
  assert.equal(r.current.ai_executes, 156);
  assert.equal(r.current.doing, 179);
  assert.equal(bound.numerator, 197);
  assert.equal(bound.denominator, 199);
  assert.equal(bound.target_exceeds_upper_bound, false);
  assert.deepEqual(new Set(bound.held_tasks.map(t => t.reason)), new Set(['human_consent', 'dispatch_after_target']));
  assert.equal(JSON.stringify(doc), before);
});

test('an executed release changes the bound only through actual inventory status', () => {
  const doc = goalInventory();
  doc.tasks.find(t => t.task === 'PR TIMES への配信操作').executor = 'ai_executes_gated';
  const bound = prioritize(doc, { entries: [] }, now).pre_dispatch_upper_bound;
  assert.equal(bound.numerator, 198);
  assert.equal(bound.denominator, 199);
  assert.equal(bound.target_exceeds_upper_bound, false);
  assert.equal(bound.held_tasks.length, 1);
});

test('197 of 198 exceeds the new target although it fell below the old target', () => {
  const doc = goalInventory();
  doc.tasks.find(t => t.task === 'PR TIMES への配信操作').executor = 'ai_executes_gated';
  doc.tasks.splice(doc.tasks.findIndex(t => t.task === 'new0'), 1);
  const bound = prioritize(doc, { entries: [] }, now).pre_dispatch_upper_bound;
  assert.equal(bound.numerator, 197);
  assert.equal(bound.denominator, 198);
  assert.equal((bound.rate * 100).toFixed(1), '99.5');
  assert.equal(bound.target_exceeds_upper_bound, false);
});

test('an optimistic bound of exactly 98% cannot reach a strictly greater target', () => {
  const doc = { tasks: [...Array.from({ length: 98 }, (_, i) => task(`done-${i}`, 'ai_autonomous')), consent(), dispatch()] };
  const bound = prioritize(doc, { entries: [] }, now).pre_dispatch_upper_bound;
  assert.equal(bound.rate, 0.98);
  assert.equal(bound.target_exceeds_upper_bound, true);
});

test('a held unstarted task does not inflate the active-task denominator', () => {
  const doc = { tasks: [task('done', 'ai_autonomous'), consent(),
    dispatch('nobody'), task('start', 'nobody'), task('excluded', 'intentional_no')] };
  const bound = prioritize(doc, { entries: [] }, now).pre_dispatch_upper_bound;
  assert.equal(bound.numerator, 2);
  assert.equal(bound.denominator, 3);
  assert.equal(bound.held_tasks.length, 2);
});

test('the optimistic bound does not claim that relaxed physical boundaries are executable', () => {
  const r = prioritize(coverage, { entries: [] }, now);
  assert.equal(r.pre_dispatch_upper_bound.rate, 1);
  assert.equal(r.pre_dispatch_upper_bound.target_exceeds_upper_bound, false);
  assert.equal(r.opportunities.find(t => t.task === 'physical').state, 'boundary');
  assert.ok(r.classified_ceiling.rate < r.pre_dispatch_upper_bound.rate);
});

test('the two-task bound stays optimistic about other consent and credential boundaries', () => {
  const doc = goalInventory();
  const another = doc.tasks.find(t => t.task === 'transfer0');
  another.blocker = 'human_consent';
  const r = prioritize(doc, { entries: [] }, now);
  assert.equal(r.pre_dispatch_upper_bound.numerator, 197);
  assert.equal(r.pre_dispatch_upper_bound.held_tasks.length, 2);
  assert.equal(r.opportunities.find(t => t.task === 'transfer0').state, 'boundary');
});
