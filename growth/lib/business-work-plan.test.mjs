import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {businessWorkPlan, loadBusinessWorkPlan, publicBusinessTaskId} from './business-work-plan.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, `data/${name}.json`), 'utf8'));
const now = new Date('2026-10-01T01:00:00Z');
const input = () => ({coverage: read('automation-coverage'), policy: read('business-automation-policy'),
  authority: read('authority-matrix'), corporate: read('corporate-obligations'), financial: read('financial-policy'), now});
const clone = value => JSON.parse(JSON.stringify(value));
const observations = (p, value = 10, saved = 20) => p.backlog.slice(0, 1).map(r => ({task_id: r.task_id,
  measurement: 'observed', window: {from: '2026-09-04', through: '2026-10-01'}, human_activity_coverage_complete: true,
  business_value: {measurement: 'observed', kind: 'verified_operational_outputs', unit: 'count', amount: value, evidence_ref: 'synthetic-value'},
  burden: {measurement: 'observed', baseline_minutes: 40, actual_minutes: 40 - saved,
    baseline_recorded_at: '2026-09-03T00:00:00Z', first_occurrence_at: '2026-09-04T00:00:00Z',
    baseline_evidence_ref: 'synthetic-baseline', actual_evidence_ref: 'synthetic-time'},
  cost: {measurement: 'observed', currency: 'JPY', amount: 0, evidence_ref: 'synthetic-cost'}}));

test('canonical scope preserves 203 registrations, 11 exclusions and the full 192 denominator', () => {
  const p = loadBusinessWorkPlan({now});
  assert.deepEqual(p.inventory, {registered: 203, explicitly_out_of_scope: 11, denominator: 192,
    declared_ai_execution: 164, declared_ai_utilization: 171, nonexecution: 28,
    counts: {ai_autonomous: 12, ai_executes_gated: 152, ai_proposes: 7, nobody: 12, human_only: 9, intentional_no: 11},
    denominator_changed: false, executor_changed: false});
  assert.equal(p.domains.length, 13);
  assert.equal(p.domains.reduce((n, d) => n + d.in_scope, 0), 192);
  assert.equal(p.domains.reduce((n, d) => n + d.nonexecution, 0), 28);
  assert.equal(p.backlog.length, 28);
  assert(p.backlog.every(r => r.priority_score === null && r.comparison.state === 'unknown' && !r.eligible_for_execution));
  assert.equal(p.runtime_measurement_performed, false);
  assert.equal(p.corporate_scope_completeness, 'not_attested');
  assert.equal(p.comparison.selected, null);
  assert.deepEqual(p.comparison.frontier_groups, []);
});

test('corporate candidates identify exact existing rows, including intentionally excluded sales', () => {
  const p = businessWorkPlan(input());
  assert.deepEqual(p.scope_reviews.map(c => c.overlaps.map(r => r.row)), [
    [195, 196, 126, 191, 192], [127, 123, 120, 126, 191, 192], [117, 104, 111, 120, 116],
  ]);
  for (const candidate of p.scope_reviews) {
    assert.equal(candidate.admitted_to_denominator, false);
    assert.equal(candidate.runtime_completed, false);
    assert.deepEqual(candidate.missing_overlap_definitions, []);
    assert(candidate.overlaps.every(r => r.task_id === publicBusinessTaskId(r)));
    assert(candidate.scope_gaps.length && candidate.approval_gaps.length);
  }
  assert.equal(p.scope_reviews[0].overlaps[0].executor, 'intentional_no');
  assert.equal(p.scope_reviews[0].overlaps[1].executor, 'intentional_no');
});

test('row order and implementation classification cannot change public task identity or scope', () => {
  const i = input(), first = businessWorkPlan(i), changed = clone(i.coverage);
  changed.tasks.reverse();
  changed.tasks.find(t => t.task === '仕訳・請求・領収書・月次締めの統合').executor = 'ai_executes_gated';
  const p = businessWorkPlan({...i, coverage: changed});
  assert.equal(p.inventory.denominator, 192);
  assert.equal(p.improvement_checklists[0].targets[0].task_id, first.improvement_checklists[0].targets[0].task_id);
  assert.equal(p.improvement_checklists[0].runtime_completed, false);
  assert.equal(p.comparison.selected, null);
});

test('renamed overlap and unmapped corporate additions remain unresolved, without guessed duplicate matches', () => {
  const i = input();
  i.coverage.tasks.find(t => t.task === '仕訳・請求・領収書・月次締めの統合').task = '仕訳統合の改名';
  i.policy.new_business_candidates.push({id: 'unmapped-new-candidate', task: 'Unmapped scope'});
  const p = businessWorkPlan(i);
  assert.equal(p.improvement_checklists[0].targets.length, 0);
  assert.equal(p.improvement_checklists[0].missing_definitions.length, 1);
  assert.equal(p.scope_reviews[1].missing_overlap_definitions.length, 1);
  assert(p.source_gaps.includes('corporate_candidate_definition_unmapped'));
  assert.equal(p.inventory.denominator, 192);
  assert.equal(p.corporate_scope_completeness, 'not_attested');
});

test('accounting, profitability and effect observation keep existing authority and measurement gaps', () => {
  const p = businessWorkPlan(input());
  assert.deepEqual(p.improvement_checklists.map(a => a.targets.map(r => r.row)), [[120], [104, 111], [15, 12, 113]]);
  assert(p.improvement_checklists.every(a => a.state === 'draft_only_evidence_review'
    && a.before_after.verified_full_tasks === null && a.before_after.human_minutes === null && a.before_after.cost === null
    && a.before_after.target_change === 0 && !a.new_authority && !a.runtime_completed));
  assert.equal(p.boundaries.find(b => b.domain === '契約・支払い・送金').requires_approval, true);
  assert.equal(p.boundaries.find(b => b.domain === '価格・プラン・無料枠の変更').requires_approval, true);
  assert(p.boundaries.every(b => !b.grants_new_authority));
  assert.equal(p.unconfirmed_deadline_count, 1);
  assert.equal(p.corporate_records.find(r => r.id === 'board-minutes').recorded_exists, false);
  assert.equal(p.financial_observation.profitability_verified, false);
});

test('missing public boundary or deadline evidence stays unknown', () => {
  const i = input(), p = businessWorkPlan({...i, authority: {}, corporate: {}});
  assert(p.boundaries.every(b => b.state === 'unknown' && b.requires_approval === null));
  assert.equal(p.unconfirmed_deadline_count, null);
  assert(p.corporate_records.every(r => r.recorded_exists === null));
});

test('observed comparisons need value, pre-recorded time and complete human activity', () => {
  const i = input(), p = businessWorkPlan(i), admitted = observations(p);
  const valid = businessWorkPlan({...i, observations: admitted});
  assert.equal(valid.backlog[0].comparison.state, 'observed_declaration');
  assert.equal(valid.backlog[0].comparison.human_work.saved_minutes, 20);
  assert.equal(valid.comparison.selected, null);
  assert.equal(valid.runtime_measurement_performed, false);
  for (const mutate of [
    o => {delete o.business_value;},
    o => {o.human_activity_coverage_complete = false;},
    o => {o.burden.baseline_recorded_at = '2026-09-05T00:00:00Z';},
    o => {o.burden.baseline_minutes = 0;},
    o => {o.business_value.measurement = 'estimated';},
    o => {o.business_value.amount = 10.5;},
    o => {o.window.through = '2026-10-02';},
    o => {o.burden.first_occurrence_at = '2026-09-04T00:00:00';},
    o => {o.cost.amount = -1;},
  ]) {
    const bad = clone(admitted); mutate(bad[0]);
    const result = businessWorkPlan({...i, observations: bad});
    assert.equal(result.backlog[0].comparison.state, 'unverified_input');
    assert.deepEqual(result.comparison.frontier_groups, []);
  }
});

test('JST window boundaries admit same-JST-day occurrences and reject future moments', () => {
  const i = input(), p = businessWorkPlan(i), o = observations(p);
  o[0].burden.first_occurrence_at = '2026-09-03T15:00:00Z'; // Sep 4 JST.
  assert.equal(businessWorkPlan({...i, observations: o}).backlog[0].comparison.state, 'observed_declaration');
  o[0].burden.first_occurrence_at = '2026-10-01T02:00:00Z';
  assert.equal(businessWorkPlan({...i, observations: o}).backlog[0].comparison.state, 'unverified_input');
});

test('Pareto comparison preserves tradeoffs and cannot compare unlike value metrics or windows', () => {
  const i = input(), p = businessWorkPlan(i), ids = p.backlog.slice(0, 4).map(r => r.task_id);
  const a = observations(p, 10, 20)[0], b = observations(p, 5, 10)[0], c = observations(p, 15, 5)[0], d = observations(p, 50, 30)[0];
  [a, b, c, d].forEach((o, n) => {o.task_id = ids[n];});
  d.business_value.kind = 'successful_customer_outcomes';
  let result = businessWorkPlan({...i, observations: [a, b, c, d]});
  assert.equal(result.comparison.frontier_groups.length, 2);
  assert.deepEqual(result.comparison.frontier_groups[0].frontier_tasks, [ids[0], ids[2]]);
  assert.deepEqual(result.comparison.frontier_groups[1].frontier_tasks, [ids[3]]);
  b.window.from = '2026-09-05'; b.burden.first_occurrence_at = '2026-09-05T00:00:00Z';
  result = businessWorkPlan({...i, observations: [a, b]});
  assert.equal(result.comparison.frontier_groups.length, 2);
  assert.equal(result.comparison.selected, null);
  assert(result.backlog.every(r => !r.eligible_for_execution && r.priority_score === null));
});

test('negative time savings, duplicate measurements and off-backlog observations are never hidden', () => {
  const i = input(), p = businessWorkPlan(i), o = observations(p, 10, -5);
  assert.equal(businessWorkPlan({...i, observations: o}).backlog[0].comparison.human_work.saved_minutes, -5);
  assert.equal(businessWorkPlan({...i, observations: [o[0], o[0]]}).backlog[0].comparison.state, 'conflicting_input');
  const outside = {...o[0], task_id: publicBusinessTaskId(i.coverage.tasks.find(t => t.executor === 'intentional_no'))};
  const result = businessWorkPlan({...i, observations: [outside]});
  assert(result.source_gaps.includes('comparison_input_outside_backlog'));
  assert.deepEqual(result.comparison.frontier_groups, []);
  assert.equal(result.inventory.denominator, 192);
});

test('report projection excludes arbitrary source fields and reference bodies, without mutating inputs', () => {
  const i = input(), p = businessWorkPlan(i), o = observations(p), marker = 'SYNTHETIC_EXCLUDED_CONTENT';
  i.coverage.tasks[0].note = marker;
  i.coverage.tasks[0].evidence = [marker];
  i.authority.domains[0].gate = marker;
  i.corporate.records[0].note = marker;
  i.financial.private_original = marker;
  o[0].private_original = marker;
  o[0].burden.actual_evidence_ref = marker;
  const before = JSON.stringify({...i, observations: o});
  const result = businessWorkPlan({...i, observations: o});
  assert(!JSON.stringify(result).includes(marker));
  assert.equal(JSON.stringify({...i, observations: o}), before);
});

test('malformed inventory, duplicated identities and reward-enabled policy fail closed', () => {
  const i = input();
  assert.throws(() => businessWorkPlan({...i, coverage: {...i.coverage, measured_at: '2026-02-30'}}), /business_inventory_invalid/);
  assert.throws(() => businessWorkPlan({...i, coverage: {...i.coverage, tasks: [...i.coverage.tasks, i.coverage.tasks[0]]}}), /business_inventory_duplicate_task/);
  const tasks = clone(i.coverage.tasks); tasks[0].area = 'unknown corporate domain';
  assert.throws(() => businessWorkPlan({...i, coverage: {...i.coverage, tasks}}), /business_inventory_invalid/);
  assert.throws(() => businessWorkPlan({...i, policy: {...i.policy, ranker_reward: true}}), /business_work_policy_invalid/);
});
