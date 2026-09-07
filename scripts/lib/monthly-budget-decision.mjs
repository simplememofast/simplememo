import { createHash } from 'node:crypto';

export const AI_BUDGET_DOMAIN = 'AI実費（開発・運用のトークン費）';
export const MANDATE_ID = 'owner-monthly-budget-20260907';
const positive = n => Number.isFinite(n) && n > 0;
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function hasMonthlyMandate(authority) {
  const domain = authority?.domains?.find(d => d.domain === AI_BUDGET_DOMAIN);
  const m = domain?.monthly_budget_delegation;
  return m?.id === MANDATE_ID && m?.approved_by === 'owner'
    && m?.approved_at === '2026-09-07' && typeof m?.evidence === 'string'
    && m.evidence.length > 20 && m?.enabled === true;
}

export function costSnapshot(cost, month, asOf) {
  if (!/^\d{4}-\d{2}$/.test(month) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)
      || !asOf.startsWith(month)) throw new Error('A decision needs its month and observation date');
  return cost.runs.filter(r => r.date_jst?.startsWith(month) && r.date_jst <= asOf)
    .map(r => ({ run_id: r.run_id, date_jst: r.date_jst, route: r.route,
      task_kind: r.task_kind ?? null, total_cost_usd: r.total_cost_usd,
      outcome: r.outcome ?? null })).sort((a,b) => a.run_id.localeCompare(b.run_id));
}

// Validate the historical decision independently of future cost rows. Its exact
// snapshot is checked against the current ledger by the writer before applying.
export function monthlyDecisionProblems(approval, authority) {
  const p = [], d = approval?.monthly_decision;
  if (!hasMonthlyMandate(authority)) p.push('owner monthly-budget mandate is missing or disabled');
  if (approval?.domain !== AI_BUDGET_DOMAIN || approval?.approved_by?.length !== 1
      || approval.approved_by[0] !== 'ai' || approval?.authorization_ref !== MANDATE_ID) {
    p.push('AI monthly decision must identify its executor, domain and owner mandate');
  }
  if (!d || d.actor !== 'ai' || d.month !== approval.approved_at?.slice(0,7)
      || d.as_of !== approval.approved_at || !/^\d{4}-\d{2}-\d{2}$/.test(d.as_of)) {
    p.push('monthly decision date and actor are missing or inconsistent');
  }
  const rows = d?.observed_runs;
  if (!Array.isArray(rows) || !rows.length || rows.some(r => !r.run_id
      || !Number.isFinite(r.total_cost_usd) || r.total_cost_usd < 0
      || r.route !== 'actions' || !r.date_jst?.startsWith(d.month) || r.date_jst > d.as_of)
      || new Set(rows?.map(r => r.run_id)).size !== rows?.length) {
    p.push('monthly decision requires unique, finite, dated observations');
  }
  if (!rows || d.observation_sha256 !== fingerprint(rows)) p.push('observation fingerprint differs');
  if (!positive(approval?.to_usd) || !positive(approval?.from_usd)) p.push('monthly amounts must be finite and positive');
  const caps = d?.task_caps;
  if (!caps || !Object.keys(caps).length || !Object.values(caps).every(positive)
      || Object.values(caps).reduce((a,b) => a+b,0) > approval.to_usd + 1e-9) {
    p.push('task allocations must be positive and within the monthly cap');
  }
  if (d?.cost_scope !== 'observed_actions_only' || d?.ccr_cost !== 'unobserved'
      || d?.basis !== 'partial_month_observations'
      || typeof d?.rationale !== 'string' || d.rationale.length < 40) {
    p.push('decision must preserve partial coverage and explain its allocation');
  }
  return p;
}

export function appliedDecisionProblems(cost, approval) {
  if (!approval?.monthly_decision) return [];
  const d = approval.monthly_decision, b = cost.budget, p = [];
  if (b.monthly_usd_cap !== approval.to_usd || b.decision_ref !== `data/spend-approvals.json#seq=${approval.seq}`
      || b.cap_set_by !== 'ai') p.push('runtime budget does not match the AI decision');
  const keys = Object.keys(b.task_budgets ?? {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(d.task_caps).sort())
      || keys.some(k => b.task_budgets[k].monthly_usd_cap !== d.task_caps[k])) {
    p.push('runtime task allocations do not match the AI decision');
  }
  return p;
}
