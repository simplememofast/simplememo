import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POLICY_URL, validateCompanyBudget, evaluateCompanySpending } from './lib/company-monthly-budget.mjs';
const policy = JSON.parse(fs.readFileSync(POLICY_URL, 'utf8'));
const now = '2026-09-17T00:30:00Z';
const request = { id: 'fixture', kind: 'new_discretionary', currency: 'JPY', requested_commitment_jpy: 1 };
test('new optional paid commitments are held, while zero-cost work keeps its other gates', () => {
  assert.equal(evaluateCompanySpending(policy, request, now).allowed_by_budget, false);
  assert.equal(evaluateCompanySpending(policy, { ...request, requested_commitment_jpy: 0 }, now).allowed_by_budget, true);
  for (const value of [null, -1, '0', Infinity, 0.5]) assert.equal(evaluateCompanySpending(policy, { ...request, requested_commitment_jpy: value }, now).allowed_by_budget, false);
});
test('a new budget does not reject existing wages, contracts, or liabilities', () => {
  const obligation = { id: 'fixture-existing', kind: 'existing_obligation', obligation_evidence: 'fixture-contract' };
  const result = evaluateCompanySpending(policy, obligation, now);
  assert.equal(result.disposition, 'preserve_existing_obligation');
  assert.match(result.reasons[0], /other payment controls/);
  assert.equal(evaluateCompanySpending(policy, { ...obligation, obligation_evidence: null }, now).allowed_by_budget, false);
});
test('validity expires at the September JST boundary without inventing an October budget', () => {
  assert.equal(evaluateCompanySpending(policy, { ...request, requested_commitment_jpy: 0 }, '2026-09-30T14:59:59Z').allowed_by_budget, true);
  for (const t of ['2026-09-30T15:00:00Z', '2026-09-01T00:00:00Z', 'invalid']) assert.equal(evaluateCompanySpending(policy, request, t).allowed_by_budget, false);
});
test('removing evidence, obligation protection or changing the cap invalidates this decision', () => {
  for (const key of ['private_decision_sha256', 'private_evidence_sha256', 'protect_existing_obligations', 'effective_until']) {
    const invalid = structuredClone(policy); delete invalid[key];
    assert.ok(validateCompanyBudget(invalid).length);
  }
  const invalid = structuredClone(policy); invalid.additional_discretionary_commitments.cap_jpy = 33000;
  assert.ok(validateCompanyBudget(invalid).length);
});
