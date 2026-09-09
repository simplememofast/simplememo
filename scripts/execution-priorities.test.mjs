import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritize } from './execution-priorities.mjs';

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

test('expired assessments lose their execution recommendation and estimate', () => {
  const r = prioritize(coverage, { entries: [assessment('transfer', { expires_at: now.toISOString() })] }, now);
  const row = r.opportunities.find(t => t.task === 'transfer');
  assert.equal(row.state, 'inspect');
  assert.equal(row.estimated_minutes, null);
  assert.equal(row.assessment_stale, true);
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
