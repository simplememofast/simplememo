#!/usr/bin/env node
// AI monthly-budget decisions. --apply writes a reviewable Git change; it does
// not purchase anything or bypass deployment CI. Never run --apply in generators.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_BUDGET_DOMAIN, MANDATE_ID, costSnapshot, fingerprint,
  monthlyDecisionProblems, appliedDecisionProblems } from './lib/monthly-budget-decision.mjs';
import { validate as validateCost, runtimeBudget } from './autopilot-budget.mjs';
import { validate, validateApprovals, validateAuthorityBudget } from './check-financial-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { cost: 'data/autopilot-cost.json', policy: 'data/financial-policy.json',
  authority: 'data/authority-matrix.json', approvals: 'data/spend-approvals.json' };

export function decide(input, proposal) {
  const state = structuredClone(input), { cost, policy, authority, approvals } = state;
  const before = [
    ...validateCost(cost),
    ...validateApprovals(approvals, { policy, authority, monthlyCap: cost.budget.monthly_usd_cap }),
    ...validateAuthorityBudget(authority, approvals, cost.budget.monthly_usd_cap),
  ];
  if (before.length) throw new Error(`Existing budget is inconsistent: ${before.join('; ')}`);
  const rows = costSnapshot(cost, proposal.month, proposal.as_of);
  if (fingerprint(rows) !== proposal.observation_sha256) throw new Error('Cost observations changed; reassess before applying');
  if (approvals.next_seq !== proposal.expected_seq) throw new Error('Another budget decision was recorded; reassess');
  if (proposal.as_of < authority.domains.find(d => d.domain === AI_BUDGET_DOMAIN)?.monthly_budget_delegation?.approved_at) {
    throw new Error('Decision predates owner delegation');
  }
  if (JSON.stringify(Object.keys(proposal.task_caps).sort()) !== JSON.stringify(Object.keys(cost.budget.task_budgets).sort())) {
    throw new Error('Every existing task allocation must be preserved');
  }
  const approval = {
    seq: approvals.next_seq, domain: AI_BUDGET_DOMAIN,
    from_usd: cost.budget.monthly_usd_cap, to_usd: proposal.monthly_usd_cap,
    approved_at: proposal.as_of, approved_by: ['ai'], authorization_ref: MANDATE_ID,
    note: proposal.rationale, two_person_required: false,
    two_person_reason: 'オーナーの包括委任に基づくAI決定。既存の変更幅以内で、変更間隔と損失上限を維持する。',
    monthly_decision: { actor: 'ai', month: proposal.month, as_of: proposal.as_of,
      observed_runs: rows, observation_sha256: fingerprint(rows),
      cost_scope: 'observed_actions_only', ccr_cost: 'unobserved',
      basis: 'partial_month_observations', task_caps: proposal.task_caps,
      rationale: proposal.rationale },
  };
  const domain = authority.domains.find(d => d.domain === AI_BUDGET_DOMAIN);
  const limit = policy.change_limits.find(c => c.domain === AI_BUDGET_DOMAIN);
  if (!domain || !limit) throw new Error('Budget domain is missing');
  const ref = `data/spend-approvals.json#seq=${approval.seq}`;
  approvals.approvals.push(approval); approvals.next_seq++;
  cost.budget.monthly_usd_cap = approval.to_usd;
  cost.budget.cap_set_by = 'ai'; cost.budget.decision_ref = ref;
  cost.budget.cap_note = `${proposal.rationale}\n決定: ${ref}。副系CCRは未観測、月次実測完了とは扱わない。`;
  cost.budget.task_budgets_set_by = 'ai_monthly_decision';
  for (const [kind, cap] of Object.entries(proposal.task_caps)) {
    cost.budget.task_budgets[kind] = { monthly_usd_cap: cap, note: `${proposal.as_of} AI月次決定。${ref}の実績・理由に基づく配分。` };
  }
  domain.threshold = { ...domain.threshold, monthly_usd_cap: approval.to_usd,
    set_by: 'ai', approval_ref: ref, note: `${ref}でAIが決定。主系の実行ゲートに適用し、副系の残額は保証しない。` };
  limit.current_monthly_usd = approval.to_usd; limit.cap_set_by = 'ai'; limit.who_decides = 'ai';
  const problems = [
    ...monthlyDecisionProblems(approval, authority), ...validateCost(cost),
    ...validate(policy, { authority, monthlyCap: approval.to_usd }),
    ...validateApprovals(approvals, { policy, authority, monthlyCap: approval.to_usd }),
    ...validateAuthorityBudget(authority, approvals, approval.to_usd),
    ...appliedDecisionProblems(cost, approval),
  ];
  if (problems.length) throw new Error(problems.join('\n'));
  return state;
}

function readState() {
  return Object.fromEntries(Object.entries(FILES).map(([k,f]) => [k, JSON.parse(fs.readFileSync(path.join(ROOT,f), 'utf8'))]));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = process.argv.slice(2), state = readState();
    if (args[0] === '--apply' && args.length === 2) {
      const proposal = JSON.parse(fs.readFileSync(args[1], 'utf8'));
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
      if (proposal.as_of !== today) throw new Error('Apply requires today’s reviewed observations');
      const next = decide(state, proposal);
      // Validate all four results before touching any file. Git/CI deployment
      // publishes these together; no runtime control plane is changed here.
      for (const [k,f] of Object.entries(FILES)) fs.writeFileSync(path.join(ROOT,f), JSON.stringify(next[k], null, 2)+'\n');
      console.log(`Recorded AI monthly decision #${next.approvals.next_seq-1}; commit and deploy the four ledgers together.`);
    } else if (args[0] === '--check') {
      const latest = state.approvals.approvals.filter(a => a.domain === AI_BUDGET_DOMAIN).at(-1);
      if (!latest?.monthly_decision) throw new Error('No executed AI monthly decision');
      const p = [...monthlyDecisionProblems(latest, state.authority), ...appliedDecisionProblems(state.cost, latest)];
      if (p.length) throw new Error(p.join('\n'));
      const routing = JSON.parse(fs.readFileSync(path.join(ROOT,'data/model-routing.json'),'utf8'));
      for (const kind of ['article','repair']) console.log(kind, runtimeBudget(state.cost,routing,kind,latest.monthly_decision.month));
    } else {
      throw new Error('Usage: monthly-budget.mjs --apply proposal.json | --check');
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
