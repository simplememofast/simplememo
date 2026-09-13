import fs from 'node:fs';
import crypto from 'node:crypto';

export const POLICY_URL = new URL('../../data/company-monthly-budget.json', import.meta.url);
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
export function readCompanyBudget() {
  const raw = fs.readFileSync(POLICY_URL, 'utf8');
  return { policy: JSON.parse(raw), sha256: sha256(raw) };
}

export function validateCompanyBudget(p) {
  const errors = [];
  if (p?.schema_version !== 1 || p?.scope !== 'company_wide' || p?.status !== 'active'
      || p?.decided_by !== 'ai' || !p?.owner_delegation || !p?.decision_id) errors.push('Invalid company budget decision');
  const start = Date.parse(p?.effective_from), end = Date.parse(p?.effective_until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end
      || !/^\d{4}-\d{2}$/.test(p?.month ?? '')
      || new Date(start + 9 * 3600000).toISOString().slice(0, 7) !== p.month
      || new Date(end - 1 + 9 * 3600000).toISOString().slice(0, 7) !== p.month) errors.push('Invalid monthly validity period');
  if (!/^[a-f0-9]{64}$/.test(p?.private_decision_sha256 ?? '')
      || !/^[a-f0-9]{64}$/.test(p?.private_evidence_sha256 ?? '')) errors.push('Missing private budget evidence digest');
  if (p?.additional_discretionary_commitments?.currency !== 'JPY'
      || p?.additional_discretionary_commitments?.cap_jpy !== 0) errors.push('This decision permits no additional discretionary paid commitments');
  if (p?.protect_existing_obligations !== true || p?.ordinary_envelope_is_payment_hard_cap !== false
      || p?.unresolved_liabilities !== true || p?.expiry_behavior !== 'new_decision_required') errors.push('Missing obligation protection or expiry handling');
  return errors;
}

// This is a budget decision only: an allowed result never supplies payment,
// publication, vendor, tax, or contract authority and never cancels obligations.
export function evaluateCompanySpending(p, request, now = new Date().toISOString()) {
  const reasons = validateCompanyBudget(p);
  const result = { decision_id: p?.decision_id ?? null, assessed_at: now,
    allowed_by_budget: false, disposition: 'hold', reasons };
  if (reasons.length) return result;
  if (!request?.id || !['new_discretionary', 'existing_obligation'].includes(request.kind)) {
    reasons.push('Unclassified spending request'); return result;
  }
  if (request.kind === 'existing_obligation') {
    if (!request.obligation_evidence) { reasons.push('Existing obligation evidence required'); return result; }
    return { ...result, allowed_by_budget: true, disposition: 'preserve_existing_obligation',
      reasons: ['Existing obligation remains due; other payment controls and cash verification still apply'] };
  }
  const time = Date.parse(now);
  if (!Number.isFinite(time) || time < Date.parse(p.effective_from) || time >= Date.parse(p.effective_until)) {
    reasons.push('No effective company monthly budget; a new decision is required'); return result;
  }
  if (request.currency !== 'JPY' || !Number.isSafeInteger(request.requested_commitment_jpy)
      || request.requested_commitment_jpy < 0) {
    reasons.push('Unknown additional commitment amount or currency'); return result;
  }
  if (request.requested_commitment_jpy > p.additional_discretionary_commitments.cap_jpy) {
    reasons.push('Company monthly budget: additional discretionary commitment exceeds 0 JPY'); return result;
  }
  return { ...result, allowed_by_budget: true, disposition: 'no_additional_spend', reasons: [] };
}
