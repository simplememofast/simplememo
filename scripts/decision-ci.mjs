#!/usr/bin/env node
// CI uses base-branch policy, never policy supplied by an autonomous PR.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contractProblems, approvedMetric, METRICS, verifyHistory, selectContract } from './value-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const protectedPaths = ['data/value-metrics.json', 'data/autonomy-score.json', 'data/eligibility-policy.json', 'data/authority-matrix.json',
  'data/value-contracts.json', 'data/decision-recovery.json', 'data/decision-review.json',
  'scripts/value-contracts.mjs', 'scripts/decision-ci.mjs', 'scripts/decision-monitor.mjs', 'scripts/decision-review.mjs', 'scripts/autonomy-score.mjs', 'scripts/autonomy-eligibility.mjs'];
export function required(branch, paths, metrics) {
  if (!/^claude\/obsidian-auto-/.test(branch)) return false;
  const bookkeeping = p => ['data/autopilot-runs.json', 'data/autopilot-status.json', 'docs/obsidian/AUTOPILOT_LOG.md'].includes(p) || p.startsWith('data/decision-rejections/');
  return METRICS.some(id => approvedMetric(metrics, id)) && paths.some(p => !bookkeeping(p));
}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
async function main() {
  if (process.argv.includes('--selftest')) {
    const m = { metrics: [{ id: 'shipping_day_rate', tier: 'A', approved_by: 'owner', approved_at: '2026-09-04' }] };
    assert.equal(required('claude/obsidian-auto-20260905', ['index.html'], m), true);
    assert.equal(required('claude/obsidian-auto-20260905', ['data/autopilot-status.json'], m), false);
    assert.equal(required('Codex/human-directed', ['index.html'], m), false);
    assert.equal(required('claude/obsidian-auto-20260905', ['index.html'], { metrics: [] }), false);
    console.log('decision-ci: prospective autonomous changes require contracts; bookkeeping and user-directed changes are distinct'); return;
  }
  if (!process.env.GITHUB_EVENT_PATH) { console.log('decision-ci: local schema tests only; PR history is enforced by CI'); return; }
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const branch = pr?.head.ref ?? process.env.GITHUB_REF_NAME;
  if (!/^claude\/obsidian-auto-/.test(branch ?? '')) { console.log('decision-ci: not an autonomous picker branch'); return; }
  const head = pr?.head.sha ?? process.env.GITHUB_SHA;
  const baseRef = pr?.base.sha ?? 'origin/main';
  git('fetch', 'origin', 'main');
  const base = git('merge-base', baseRef, head);
  const metrics = JSON.parse(git('show', `${baseRef}:data/value-metrics.json`));
  const files = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
  const forbidden = files.filter(p => protectedPaths.includes(p) || p.startsWith('.github/workflows/'));
  if (forbidden.length) throw new Error(`autonomous decision cannot change its gate or policy: ${forbidden.join(', ')}`);
  if (!required(branch, files, metrics)) { console.log('decision-ci: no business change or metrics await owner approval'); return; }
  const intents = files.filter(p => /^data\/decision-intents\/[a-z0-9-]+\.json$/.test(p));
  if (intents.length !== 1) throw new Error('exactly one prospective decision contract is required');
  const c = JSON.parse(git('show', `${head}:${intents[0]}`));
  const problems = contractProblems(c, metrics);
  if (problems.length) throw new Error(problems.join('; '));
  const history = verifyHistory(c, base, head);
  const atDeclaration = f => JSON.parse(git('show', `${history.declaration_sha}^:${f}`));
  const recomputed = await selectContract(c.candidates, { metrics: atDeclaration('data/value-metrics.json'),
    runs: atDeclaration('data/autopilot-runs.json').runs, costs: atDeclaration('data/autopilot-cost.json').runs,
    now: new Date(c.created_at), eligibility: {
      policy: atDeclaration('data/eligibility-policy.json'), scorePolicy: atDeclaration('data/autonomy-score.json'),
      authority: atDeclaration('data/authority-matrix.json'), routing: atDeclaration('data/model-routing.json'),
      costDoc: atDeclaration('data/autopilot-cost.json'),
    } }, atDeclaration('data/decision-review.json'), atDeclaration('data/value-contracts.json').contracts);
  assert.deepEqual(c, recomputed, 'selection, baseline, forecast, budget and eligibility must reproduce from pre-change data');
  const added = git('diff', '--name-only', '--diff-filter=A', base, head).split('\n');
  if (c.eligibility.reversibility_class === 'R0' && added.some(p => p.endsWith('.html'))) throw new Error('a new public URL is R1, never R0');
  const addedAt = git('show', '-s', '--format=%cI', history.declaration_sha);
  if (Math.abs(Date.parse(addedAt) - Date.parse(c.created_at)) > 3600000) throw new Error('declaration timestamp differs from commit by more than an hour');
  console.log(`Verified prospective decision ${c.id}: ${history.changed_lines} declared lines`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
