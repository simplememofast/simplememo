import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { decide } from './monthly-budget.mjs';
import { costSnapshot, fingerprint, AI_BUDGET_DOMAIN, MANDATE_ID, appliedDecisionProblems } from './lib/monthly-budget-decision.mjs';
import { runtimeBudget } from './autopilot-budget.mjs';

function fixture() {
  const state = Object.fromEntries(Object.entries({ cost:'autopilot-cost',policy:'financial-policy',
    authority:'authority-matrix',approvals:'spend-approvals' }).map(([k,f]) => [k,JSON.parse(fs.readFileSync(new URL(`../data/${f}.json`, import.meta.url),'utf8'))]));
  // The fixture is anchored before the first AI decision, independently of
  // whether that decision has since been committed to the live ledger.
  state.approvals.approvals = state.approvals.approvals.slice(0,2); state.approvals.next_seq = 3;
  const domain = state.authority.domains.find(d => d.domain === AI_BUDGET_DOMAIN);
  domain.threshold = {...domain.threshold,monthly_usd_cap:280,set_by:'owner',approval_ref:'data/spend-approvals.json#seq=2'};
  domain.monthly_budget_delegation = { id:MANDATE_ID,approved_by:'owner',approved_at:'2026-09-07',
    evidence:'Owner explicitly delegates monthly budget decisions to AI for continuing business execution.',enabled:true };
  state.cost.budget.monthly_usd_cap = 280;
  const proposal = { month:'2026-09',as_of:'2026-09-07',expected_seq:3,monthly_usd_cap:280,
    task_caps:{article:125,repair:115,analysis:12,pr:12,qa_triage:8,audit:8},
    rationale:'Retain the monthly total; allocate the observed operating pool between articles and repairs while retaining small reserves. This is a partial-month decision and does not estimate unobserved CCR spending.' };
  proposal.observation_sha256 = fingerprint(costSnapshot(state.cost, proposal.month, proposal.as_of));
  return {state,proposal};
}

test('executes an AI decision without rewriting historical owner approvals', () => {
  const {state,proposal} = fixture(), original = structuredClone(state);
  const next = decide(state,proposal);
  assert.deepEqual(state,original);
  assert.deepEqual(next.approvals.approvals.slice(0,2),original.approvals.approvals);
  assert.deepEqual(next.approvals.approvals[2].approved_by,['ai']);
  assert.deepEqual(appliedDecisionProblems(next.cost,next.approvals.approvals[2]),[]);
});

for (const [name, mutate, pattern] of [
  ['missing mandate', s => delete s.authority.domains.find(d=>d.domain===AI_BUDGET_DOMAIN).monthly_budget_delegation, /mandate/],
  ['revoked mandate', s => s.authority.domains.find(d=>d.domain===AI_BUDGET_DOMAIN).monthly_budget_delegation.enabled=false, /mandate/],
  ['changed costs', s => s.cost.runs.find(r=>r.date_jst==='2026-09-01').total_cost_usd+=1, /observations changed/],
  ['unknown cost', s => s.cost.runs.find(r=>r.date_jst==='2026-09-01').total_cost_usd=null, /total_cost_usd/],
  ['inconsistent sequence', s => s.approvals.next_seq++, /next_seq/],
]) test(`rejects ${name}`, () => {
  const {state,proposal} = fixture(); mutate(state);
  assert.throws(()=>decide(state,proposal),pattern);
});

for (const [name, mutate, pattern] of [
  ['overspent allocations', p => p.task_caps.repair=200, /allocations|合計/],
  ['removed task', p => delete p.task_caps.audit, /Every existing/],
  ['cap increase before 14 days', p => p.monthly_usd_cap=300, /14日以上/],
  ['cap increase above allowed step', p => {p.monthly_usd_cap=400;p.as_of='2026-09-20';}, /観測|observations|承認者|変更幅/],
  ['missing explanation', p => p.rationale='', /explain|note|理由/],
  ['NaN amount', p => p.monthly_usd_cap=NaN, /finite|positive|number/],
  ['stale decision sequence', p => p.expected_seq=2, /Another budget decision/],
]) test(`rejects ${name}`, () => {
  const {state,proposal} = fixture(); mutate(proposal);
  assert.throws(()=>decide(state,proposal),pattern);
});

test('new allocations actually constrain the existing runtime budget gate', () => {
  const {state,proposal} = fixture(), next=decide(state,proposal);
  const routing=JSON.parse(fs.readFileSync(new URL('../data/model-routing.json',import.meta.url),'utf8'));
  routing.rules.article.max_usd_per_run = 1000;
  // Exhaust only article's newly assigned budget. Repair must still work;
  // neither a new cap nor an invalid ledger may silently remove the gate.
  const current=next.cost.runs.filter(r=>r.date_jst.startsWith('2026-09') && r.task_kind==='article')
    .reduce((n,r)=>n+r.total_cost_usd,0);
  next.cost.runs.push({run_id:'fixture-budget-consumption',route:'actions',date_jst:'2026-09-07',
    task_kind:'article',total_cost_usd:125-current,num_turns:1,outcome:'no_artifact',
    reviewed_by:'human',reviewed_at:'2026-09-07',review_note:'Synthetic budget boundary fixture only'});
  assert.throws(()=>runtimeBudget(next.cost,routing,'article','2026-09'),/no positive/);
  assert.ok(runtimeBudget(next.cost,routing,'repair','2026-09').usd>0);
});

test('manual drift in applied allocations is rejected', () => {
  const {state,proposal}=fixture(), next=decide(state,proposal);
  next.cost.budget.task_budgets.article.monthly_usd_cap++;
  assert.ok(appliedDecisionProblems(next.cost,next.approvals.approvals.at(-1)).length>0);
});

test('an AI increase within policy works after 14 days; a retained total does not restart the interval', () => {
  const {state,proposal}=fixture(), retained=decide(state,proposal);
  const increase={...proposal,expected_seq:4,as_of:'2026-09-17',monthly_usd_cap:300};
  increase.observation_sha256=fingerprint(costSnapshot(retained.cost,increase.month,increase.as_of));
  const next=decide(retained,increase);
  assert.equal(next.cost.budget.monthly_usd_cap,300);
  assert.deepEqual(next.approvals.approvals.at(-1).approved_by,['ai']);
});

test('a forged current cap cannot masquerade as a retained total', () => {
  const {state,proposal}=fixture();
  state.cost.budget.monthly_usd_cap=400; proposal.monthly_usd_cap=400;
  assert.throws(()=>decide(state,proposal),/Existing budget is inconsistent/);
});
