// Adapters over the existing instruments. Never redefine their denominator.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { summarize as coverageSummary } from '../../scripts/automation-rate.mjs';
import { analyse as gapSummary, BLOCKERS } from '../../scripts/autonomy-gap.mjs';
import { summarize as runSummary } from '../../scripts/autopilot-runs.mjs';
import { score, loadContext } from '../../scripts/autonomy-score.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
export const taskKey = task => digest([task.area, task.task]);

export function formalMetrics({ coverage = read('data/automation-coverage.json'),
  runs = read('data/autopilot-runs.json'), costs = read('data/autopilot-cost.json'),
  autonomy = score(loadContext()), now = new Date() } = {}) {
  const c = coverageSummary(coverage).overall;
  const gaps = gapSummary(coverage);
  const r = runSummary(runs, { costDoc: costs });
  const sources = Object.fromEntries([
    'scripts/automation-rate.mjs', 'scripts/autonomy-gap.mjs', 'scripts/autopilot-runs.mjs',
    'scripts/autonomy-score.mjs', 'data/automation-coverage.json', 'data/autonomy-score.json',
    'data/autopilot-runs.json', 'data/autopilot-cost.json',
  ].map(file => [file, digest(fs.readFileSync(path.join(ROOT, file), 'utf8'))]));
  const definition = (id, formula, numerator, denominator, value, source, exclusions, version) => ({
    id, formula, numerator, denominator, value, source, source_sha256: sources[source],
    exclusions, version, last_calculated: now.toISOString(),
  });
  return {
    schema_version: 1, calculated_at: now.toISOString(), sources,
    scope_fingerprint: digest(coverage.tasks.map(t => [taskKey(t), t.executor === 'intentional_no'])),
    policy_fingerprint: sources['data/autonomy-score.json'],
    task_cohort: coverage.tasks.map(t => ({ key: taskKey(t), task: t.task, area: t.area, executor: t.executor })),
    metrics: [
      definition('ai_execution_rate', '(ai_autonomous + ai_executes_gated) / doing', c.ai_executes, c.doing,
        c.ai_execution_rate, 'scripts/automation-rate.mjs', ['nobody', 'intentional_no'], 'legacy-coverage-v1'),
      definition('overall_automation_rate', '(ai_autonomous + ai_executes_gated) / defined', c.ai_executes, c.defined,
        c.overall_automation_rate, 'scripts/automation-rate.mjs', ['intentional_no'], 'legacy-coverage-v1'),
      definition('ai_involvement_rate', '(ai_executes + ai_proposes) / doing', c.ai_executes + c.counts.ai_proposes, c.doing,
        c.ai_involvement_rate, 'scripts/automation-rate.mjs', ['nobody', 'intentional_no'], 'legacy-coverage-v1'),
      definition('coverage_rate', 'doing / defined', c.doing, c.defined,
        c.coverage_rate, 'scripts/automation-rate.mjs', ['intentional_no'], 'legacy-coverage-v1'),
      definition('ai_completion_rate', 'shipped / attempted', r.totals.shipped, r.totals.attempted,
        r.completion_rate, 'scripts/autopilot-runs.mjs', ['unattempted eligibility and duplicate skips'], 'legacy-runs-v1'),
      definition('reachable_automation', 'classified_current_boundary_ceiling / defined', gaps.ceiling, gaps.denominator,
        gaps.ceiling_rate, 'scripts/autonomy-gap.mjs', ['intentional_no'], 'legacy-gap-v1'),
      definition('boundary_delegation', 'classified_ceiling_with_all_handover / defined', gaps.ceiling_with_handover, gaps.denominator,
        gaps.ceiling_with_handover_rate, 'scripts/autonomy-gap.mjs', ['intentional_no'], 'legacy-gap-v1'),
      definition('autonomy_score', 'existing VDC + UMR + RA + EP + TUC with existing holds and carry policy',
        autonomy.total, autonomy.max, autonomy.total, 'scripts/autonomy-score.mjs',
        ['existing instrument policy; not the task-coverage rate'], 'legacy-score-policy-' + read('data/autonomy-score.json').version),
    ],
    autonomy_instrument: autonomy,
    runs: { totals: r.totals, window: r.window, completion_rate: r.completion_rate,
      human_intervention_rate: r.human_intervention_rate, cost: r.cost },
    warning: 'Task coverage, shipped/attempted, diagnostic human touches and the 100-point instrument remain distinct. Ceilings are not performance.',
  };
}

export function compareMetrics(before, after) {
  const sameScope = before.scope_fingerprint === after.scope_fingerprint;
  const old = new Map(before.metrics.map(x => [x.id, x]));
  const prior = new Map(before.task_cohort.map(t => [t.key, t]));
  const current = new Map(after.task_cohort.map(t => [t.key, t]));
  const executes = t => ['ai_autonomous', 'ai_executes_gated'].includes(t?.executor);
  const transferred = before.task_cohort.filter(t => ['ai_proposes', 'human_only'].includes(t.executor) && executes(current.get(t.key)));
  const activated = before.task_cohort.filter(t => t.executor === 'nobody' && executes(current.get(t.key)));
  const removed = before.task_cohort.filter(t => !current.has(t.key));
  const newlyExcluded = before.task_cohort.filter(t => t.executor !== 'intentional_no' && current.get(t.key)?.executor === 'intentional_no');
  return {
    before: before.calculated_at, after: after.calculated_at, same_scope: sameScope,
    removed_tasks: removed, newly_excluded_tasks: newlyExcluded,
    new_workloads: after.task_cohort.filter(t => !prior.has(t.key)),
    existing_human_tasks_transferred: transferred,
    previously_unperformed_tasks_activated: activated,
    baseline_cohort_automation: {
      numerator: before.task_cohort.filter(t => t.executor !== 'intentional_no' && executes(current.get(t.key))).length,
      denominator: before.task_cohort.filter(t => t.executor !== 'intentional_no').length,
      missing_tasks_count_as_unexecuted: true,
    },
    metrics: after.metrics.map(m => {
      const b = old.get(m.id);
      const formulaComparable = b?.version === m.version && b?.formula === m.formula && b?.source_sha256 === m.source_sha256;
      const policyComparable = m.id !== 'autonomy_score' || before.policy_fingerprint === after.policy_fingerprint;
      const scopeComparable = ['ai_completion_rate', 'autonomy_score'].includes(m.id) || sameScope;
      const comparable = formulaComparable && policyComparable && scopeComparable;
      return { id: m.id, previous: b?.value ?? null, current: m.value, comparable,
        delta: comparable && Number.isFinite(m.value) && Number.isFinite(b?.value) ? m.value - b.value : null,
        reason: comparable ? null : 'definition, policy or scope changed; do not claim operational improvement' };
    }),
  };
}

export function humanTouchMetrics(runsDoc) {
  const attempted = runsDoc.runs.filter(r => r.attempted);
  const shipped = attempted.filter(r => r.outcome === 'shipped');
  const observed = shipped.filter(r => Array.isArray(r.interventions));
  const touches = observed.flatMap(r => r.interventions);
  const unknown = shipped.length - observed.length;
  const kinds = kind => attempted.filter(r => r.interventions?.some(i => i.kind === kind)).length;
  return {
    version: 'recorded-human-touch-v1', source: 'data/autopilot-runs.json',
    successful_outputs: shipped.length, intervention_field_observed: observed.length, unknown_successes: unknown,
    recorded_touches_per_successful_output: unknown || !shipped.length ? null : touches.length / shipped.length,
    recorded_zero_touch_completion_rate: unknown || !shipped.length ? null : observed.filter(r => !r.interventions.length).length / shipped.length,
    manual_starts: attempted.filter(r => r.interventions?.some(i => ['bootstrap', 'request'].includes(i.kind))).length,
    manual_starts_by_kind: { bootstrap: kinds('bootstrap'), request: kinds('request') },
    manual_starts_note: 'Distinct runs with a recorded bootstrap/request; historical unrecorded starts remain unknown.',
    human_blocked_runs: null,
    recorded_owner_required_failures: attempted.filter(r => r.failure_class === 'owner_required').length,
    manual_decisions: null, manual_verification: null, manual_reporting: null,
    missing_dimensions: ['historical manual decision/verification/reporting events not separately instrumented'],
    warning: 'No recorded intervention is not proof of native scheduled origin. Bootstrap and manual runs remain labeled.',
  };
}

export function autonomyLedger(coverage, registry = { jobs: [] }) {
  const summary = coverageSummary(coverage).overall;
  return coverage.tasks.map((t, i) => {
    const matching = registry.jobs.filter(j => j.autonomy_contribution?.includes(i));
    const executes = ['ai_autonomous', 'ai_executes_gated'].includes(t.executor);
    const human = t.executor === 'human_only' ? 'H4' : t.executor === 'ai_proposes' ? 'H3' : t.executor === 'nobody' ? 'H5' : null;
    const stage = name => ({ state: 'not_separately_measured', evidence: t.evidence,
      meaning: name === 'execute' ? t.executor : 'Existing executor class does not establish this stage' });
    return {
      id: taskKey(t), source_index: i, domain: t.area, task: t.task,
      frequency: matching.map(j => ({ job_id: j.id, schedule: j.schedule, timezone: j.timezone })),
      detect: stage('detect'), decide: stage('decide'), execute: stage('execute'), verify: stage('verify'), report: stage('report'), learn: stage('learn'),
      human_touch: { level: human, basis: human ? 'conservative existing executor classification; verify in run receipts' : 'not inferable from machine gates or executor label alone' },
      permission_boundary: t.blocker === 'policy_boundary' ? 'APPROVAL' : ['physical_human', 'human_consent'].includes(t.blocker) ? 'MANUAL' : 'consult_existing_authority_matrix',
      automation_status: t.executor,
      current_score_contribution: { metric: 'overall_automation_rate', numerator: executes ? 1 : 0,
        denominator: t.executor === 'intentional_no' ? 0 : 1, current_defined_tasks: summary.defined },
      maximum_reachable: executes ? 'currently_executed' : BLOCKERS[t.blocker]?.klass ?? 'not_classified',
      next_improvement: t.unblocked_by ?? t.note ?? 'Instrument missing human handoffs and stage-specific evidence',
      source: 'data/automation-coverage.json', evidence: t.evidence,
    };
  });
}
