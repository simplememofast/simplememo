#!/usr/bin/env node
import { readCompanyBudget, validateCompanyBudget, evaluateCompanySpending } from './lib/company-monthly-budget.mjs';
import fs from 'node:fs';

const { policy, sha256 } = readCompanyBudget();
const errors = validateCompanyBudget(policy);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
const at = process.argv.indexOf('--request');
if (at >= 0) {
  const request = JSON.parse(fs.readFileSync(process.argv[at + 1], 'utf8'));
  const result = evaluateCompanySpending(policy, request);
  console.log(JSON.stringify({ policy_sha256: sha256, request_id: request.id, ...result }, null, 2));
  process.exitCode = result.allowed_by_budget ? 0 : 1;
} else {
  console.log(JSON.stringify({ decision_id: policy.decision_id, policy_sha256: sha256,
    effective_from: policy.effective_from, effective_until: policy.effective_until, errors }, null, 2));
}
