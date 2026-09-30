import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POLICY_URL, readCompanyBudget, sha256, validateCompanyBudget, evaluateCompanySpending } from './lib/company-monthly-budget.mjs';
const historyPolicyRaw = fs.readFileSync(new URL('../docs/history/company-monthly-budget-20260913.json', import.meta.url), 'utf8');
const historyReceiptRaw = fs.readFileSync(new URL('../docs/history/company-monthly-budget-execution-20260913.json', import.meta.url), 'utf8');
const policy = JSON.parse(historyPolicyRaw);
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

// September cases above keep the actual historical policy; current-month cases
// below read the real canonical loader and use zero-cost requests for time edges.
test('September policy and actual receipt remain exact historical evidence', () => {
  const receipt = JSON.parse(historyReceiptRaw);
  assert.equal(sha256(historyPolicyRaw), 'aee2d9eb2ecf765d5b0d3b958346c2fc5c07911b529aa1a3a8c3c9999dc4e575');
  assert.equal(sha256(historyReceiptRaw), 'c2c14a7867357b62f95359ac70fb5240f99d7d4a266712e7d75c75b466778356');
  assert.equal(receipt.policy_sha256, sha256(historyPolicyRaw));
  assert.equal(receipt.decision_id, policy.decision_id);
  assert.equal(policy.month, '2026-09');
});
test('canonical monthly policy is effective at start and expires exactly at end', () => {
  const { policy: current, sha256: rawHash } = readCompanyBudget();
  assert.deepEqual(validateCompanyBudget(current), []);
  assert.equal(rawHash, sha256(fs.readFileSync(POLICY_URL, 'utf8')));
  const start = Date.parse(current.effective_from), end = Date.parse(current.effective_until);
  const zero = { ...request, requested_commitment_jpy: 0 };
  for (const [time, allowed] of [[start - 1, false], [start, true], [end - 1, true], [end, false], [end + 1, false]]) {
    const result = evaluateCompanySpending(current, zero, new Date(time).toISOString());
    assert.equal(result.allowed_by_budget, allowed);
    assert.equal(result.decision_id, current.decision_id);
  }
  assert.equal(evaluateCompanySpending(current, zero, 'invalid').allowed_by_budget, false);
});
test('canonical policy retains zero extra spend, unknown inputs and existing obligations', () => {
  const { policy: current } = readCompanyBudget();
  const within = current.effective_from;
  assert.equal(evaluateCompanySpending(current, request, within).allowed_by_budget, false);
  for (const value of [null, -1, '0', Infinity, 0.5]) {
    assert.equal(evaluateCompanySpending(current, { ...request, requested_commitment_jpy: value }, within).allowed_by_budget, false);
  }
  assert.equal(current.protect_existing_obligations, true);
  assert.equal(current.ordinary_envelope_is_payment_hard_cap, false);
  assert.equal(current.unresolved_liabilities, true);
  const obligation = { id: 'canonical-existing', kind: 'existing_obligation', obligation_evidence: 'synthetic-contract' };
  for (const time of [new Date(Date.parse(current.effective_from) - 1).toISOString(), current.effective_until]) {
    assert.equal(evaluateCompanySpending(current, obligation, time).disposition, 'preserve_existing_obligation');
  }
  assert.equal(evaluateCompanySpending(current, { ...obligation, obligation_evidence: null }, within).allowed_by_budget, false);
});
