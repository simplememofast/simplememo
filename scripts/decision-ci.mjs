#!/usr/bin/env node
// CI uses base-branch policy, never policy supplied by an autonomous PR.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contractProblems, approvedMetric, METRICS, verifyHistory, selectContract, predictionFeedback } from './value-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'simplememofast/simplememo';
export const protectedPaths = ['data/value-metrics.json', 'data/autonomy-score.json', 'data/eligibility-policy.json', 'data/authority-matrix.json',
  'data/value-contracts.json', 'data/decision-recovery.json', 'data/decision-review.json',
  'scripts/value-contracts.mjs', 'scripts/decision-ci.mjs', 'scripts/decision-monitor.mjs', 'scripts/decision-review.mjs', 'scripts/autonomy-score.mjs', 'scripts/autonomy-eligibility.mjs',
  'scripts/lib/decision-origin.mjs', 'scripts/decision-monitor-local.py',
  'scripts/autopilot-budget.mjs', 'scripts/check-credential-probe.mjs'];
export function required(branch, paths, metrics) {
  if (!/^claude\/obsidian-auto-/.test(branch)) return false;
  const bookkeeping = p => ['data/autopilot-runs.json', 'data/autopilot-status.json', 'docs/obsidian/AUTOPILOT_LOG.md'].includes(p) || p.startsWith('data/decision-rejections/');
  return METRICS.some(id => approvedMetric(metrics, id)) && paths.some(p => !bookkeeping(p));
}
const gitAt = cwd => (...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();

export function boundRun(contract, before, after) {
  assert(Array.isArray(before) && Array.isArray(after), 'run ledgers required');
  assert(!before.some(r => r.run_id === contract.run_id), 'contract cannot reuse a historical run');
  const matching = after.filter(r => r.run_id === contract.run_id);
  assert.equal(matching.length, 1, 'contract must bind exactly one run by run_id');
  const run = matching[0];
  assert.equal(run.outcome, 'shipped', 'implementation requires a shipped run');
  assert(Number.isInteger(run.pr) && run.pr > 0, 'shipped run requires a numeric PR');
  assert.equal(run.lane, contract.input?.lane, 'run lane differs from selected candidate');
  assert.equal(run.action, contract.input?.action, 'run action differs from selected candidate');
  const previousIds = new Set(before.map(r => r.run_id));
  assert.equal(after.filter(r => r.outcome === 'shipped' && !previousIds.has(r.run_id)).length, 1,
    'one contract cannot cover multiple new shipped runs');
  return run;
}

export function verifyPullBinding(pr, run, branch, head) {
  assert.equal(pr?.number, run.pr, 'run PR number differs from the checked PR');
  assert.equal(pr?.base?.ref, 'main', 'decision PR must target main');
  assert.equal(pr?.base?.repo?.full_name, REPO, 'decision PR targets another repository');
  assert.equal(pr?.head?.repo?.full_name, REPO, 'decision PR comes from another repository');
  assert.equal(pr?.head?.ref, branch, 'run PR points to another branch');
  assert.equal(pr?.head?.sha, head, 'run PR does not contain the checked head');
}

export async function verifyDecision({ branch, head, baseRef, pr = null, cwd = ROOT }) {
  const git = gitAt(cwd);
  const base = git('merge-base', baseRef, head);
  const metrics = JSON.parse(git('show', `${baseRef}:data/value-metrics.json`));
  const files = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
  const forbidden = files.filter(p => protectedPaths.includes(p) || p.startsWith('.github/workflows/'));
  if (forbidden.length) throw new Error(`autonomous decision cannot change its gate or policy: ${forbidden.join(', ')}`);
  if (!required(branch, files, metrics)) return { state: 'not_required' };
  const intents = files.filter(p => /^data\/decision-intents\/[a-z0-9-]+\.json$/.test(p));
  if (intents.length !== 1) throw new Error('exactly one prospective decision contract is required');
  const c = JSON.parse(git('show', `${head}:${intents[0]}`));
  const problems = contractProblems(c, metrics);
  if (problems.length) throw new Error(problems.join('; '));
  const history = verifyHistory(c, base, head, cwd);
  const atDeclaration = f => JSON.parse(git('show', `${history.declaration_sha}^:${f}`));
  // A policy-code upgrade must not rewrite an older immutable declaration.
  // This source is from its parent commit, not from the candidate's supplied JSON.
  const selectorSource = git('show', `${history.declaration_sha}^:scripts/value-contracts.mjs`);
  const feedbackRequired = /^export const SELECTION_FEEDBACK_VERSION = 1;$/m.test(selectorSource);
  const recomputed = await selectContract(c.candidates, { metrics: atDeclaration('data/value-metrics.json'),
    runs: atDeclaration('data/autopilot-runs.json').runs, costs: atDeclaration('data/autopilot-cost.json').runs,
    now: new Date(c.created_at), eligibility: {
      policy: atDeclaration('data/eligibility-policy.json'), scorePolicy: atDeclaration('data/autonomy-score.json'),
      authority: atDeclaration('data/authority-matrix.json'), routing: atDeclaration('data/model-routing.json'),
      costDoc: atDeclaration('data/autopilot-cost.json'),
    } }, atDeclaration('data/decision-review.json'), atDeclaration('data/value-contracts.json').contracts, { feedbackRequired });
  assert.deepEqual(c, recomputed, 'selection, baseline, forecast, budget and eligibility must reproduce from pre-change data');
  const added = git('diff', '--name-only', '--diff-filter=A', base, head).split('\n');
  if (c.eligibility.reversibility_class === 'R0' && added.some(p => p.endsWith('.html'))) throw new Error('a new public URL is R1, never R0');
  const addedAt = git('show', '-s', '--format=%cI', history.declaration_sha);
  if (Math.abs(Date.parse(addedAt) - Date.parse(c.created_at)) > 3600000) throw new Error('declaration timestamp differs from commit by more than an hour');
  const declarationOnly = files.every(p => p === intents[0]);
  // The first push deliberately precedes implementation and PR creation. It may
  // validate a declaration, but an open PR must also bind its actual shipped run.
  if (!pr && declarationOnly) return { state: 'declared', id: c.id, ...history };
  const run = boundRun(c, JSON.parse(git('show', `${base}:data/autopilot-runs.json`)).runs,
    JSON.parse(git('show', `${head}:data/autopilot-runs.json`)).runs);
  assert(history.changed_lines > 0 || history.binary_bytes > 0, 'selected candidate has no implemented change');
  // Pushes can validate local records, but only a PR event identifies the PR
  // being shipped. Auto-merge waits for that event on autonomous picker branches.
  if (!pr) return { state: 'awaiting_pr_validation', id: c.id, run_id: run.run_id, ...history };
  verifyPullBinding(pr, run, branch, head);
  return { state: 'bound', id: c.id, run_id: run.run_id, pr: run.pr, ...history };
}

async function selftest() {
  const m = { metrics: [{ id: 'shipping_day_rate', tier: 'A', approved_by: 'owner', approved_at: '2026-08-01',
    direction: 'up', null_model: { kind: 'trailing_median', window_days: 3 } }] };
  assert.equal(required('claude/obsidian-auto-20260905', ['index.html'], m), true);
  assert.equal(required('claude/obsidian-auto-20260905', ['data/autopilot-status.json'], m), false);
  assert.equal(required('Codex/human-directed', ['index.html'], m), false);
  assert.equal(required('claude/obsidian-auto-20260905', ['index.html'], { metrics: [] }), false);

  // Execute the actual workflow body: declaration-only push success must never
  // merge a picker PR, while other validated branches retain their merge path.
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/auto-merge.yml'), 'utf8');
  const body = workflow.match(/          script: \|\n((?:            .*\n|\n)+)/)?.[1];
  assert(body, 'auto-merge workflow script required');
  const executeMerge = new (Object.getPrototypeOf(async function () {}).constructor)('context', 'github', 'core', body);
  for (const [branch, event, expected] of [
    ['claude/obsidian-auto-test', 'push', 0], ['claude/obsidian-auto-test', undefined, 0],
    ['claude/obsidian-auto-test', 'pull_request', 1], ['Codex/user-directed', 'push', 1],
  ]) {
    let merged = 0;
    const sha = 'a'.repeat(40);
    await executeMerge({ repo: { owner: 'simplememofast', repo: 'simplememo' }, payload: { workflow_run: { head_branch: branch, head_sha: sha, event } } },
      { rest: { pulls: {
        list: async () => ({ data: [{ number: 123, draft: false, base: { ref: 'main' }, head: { sha, repo: { full_name: REPO } } }] }),
        merge: async args => { assert.equal(args.sha, sha); merged++; return { data: { sha: 'b'.repeat(40) } }; },
      } } }, { info() {}, notice() {}, setOutput() {} });
    assert.equal(merged, expected, `auto-merge must respect declaration/PR boundary: ${branch} ${event}`);
  }

  // Use real declaration/implementation commits and the production verifier.
  // All records below are disposable fixtures; no remote writes or scoring.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-ci-test-'));
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-09-04T00:00:00Z', GIT_COMMITTER_DATE: '2026-09-04T00:00:00Z' } }).trim();
  const save = (file, value) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + '\n'); };
  const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  try {
    g('init'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid');
    const before = [1, 2, 3].map(i => ({ run_id: `old-${i}`, date_jst: `2026-09-0${i}`, outcome: 'no_run' }));
    for (const file of ['eligibility-policy.json', 'autonomy-score.json', 'authority-matrix.json', 'model-routing.json', 'autopilot-cost.json']) {
      save(`data/${file}`, JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8')));
    }
    save('data/value-metrics.json', m); save('data/autopilot-runs.json', { runs: before });
    save('data/decision-review.json', { selections: [] }); save('data/value-contracts.json', { contracts: [] });
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts/value-contracts.mjs'), 'export const SELECTION_FEEDBACK_VERSION = 1;\n');
    fs.writeFileSync(path.join(dir, 'index.html'), 'before\n'); g('add', '.'); g('commit', '-m', 'fixture base');
    const baseRef = g('rev-parse', 'HEAD');
    const candidate = { id: 'binding-test', run_id: 'test-run', metric: 'shipping_day_rate', touches: ['index.html'],
      lane: 'A', action: 'refresh', evidence_date: '2026-09-03', predicted_usd: 0, predicted_delta: .1, p: .8,
      calibration: { snapshot_sha256: predictionFeedback([], { before: new Date('2026-09-04T00:00:00Z') }).snapshot_sha256,
        reason: 'No prior settlements; current evidence supports a tentative forecast rather than demonstrated calibration.' },
      horizon_days: 1, max_changed_lines: 100, rank: 1, counterfactual: { id: 'alternative', reason: 'Compare two bounded improvements' } };
    const choices = [candidate, { ...candidate, id: 'alternative', rank: .9,
      counterfactual: { id: candidate.id, reason: 'Compare two bounded improvements' } }];
    const c = await selectContract(choices, { metrics: m, runs: before, costs: read('data/autopilot-cost.json').runs,
      now: new Date('2026-09-04T00:00:00Z'), eligibility: {
        policy: read('data/eligibility-policy.json'), scorePolicy: read('data/autonomy-score.json'),
        authority: read('data/authority-matrix.json'), routing: read('data/model-routing.json'), costDoc: read('data/autopilot-cost.json'),
      } }, { selections: [] }, []);
    save(`data/decision-intents/${c.id}.json`, c); g('add', '.'); g('commit', '-m', 'declare fixture');
    const declared = g('rev-parse', 'HEAD');
    const branch = 'claude/obsidian-auto-test';
    const options = { cwd: dir, branch, baseRef, head: declared };
    assert.equal((await verifyDecision(options)).state, 'declared');
    await assert.rejects(verifyDecision({ ...options, pr: {} }), /bind exactly one run/);
    fs.writeFileSync(path.join(dir, 'index.html'), 'after\n'); g('add', '.'); g('commit', '-m', 'implement fixture');
    const implemented = g('rev-parse', 'HEAD');
    await assert.rejects(verifyDecision({ ...options, head: implemented }), /bind exactly one run/);
    const run = { run_id: c.run_id, outcome: 'shipped', lane: 'A', action: 'refresh', pr: 123 };
    save('data/autopilot-runs.json', { runs: [...before, run] }); g('add', '.'); g('commit', '-m', 'record fixture run');
    const head = g('rev-parse', 'HEAD');
    const pr = { number: 123, base: { ref: 'main', repo: { full_name: REPO } }, head: { ref: branch, sha: head, repo: { full_name: REPO } } };
    assert.equal((await verifyDecision({ ...options, head, pr })).state, 'bound');
    assert.equal((await verifyDecision({ ...options, head })).state, 'awaiting_pr_validation');
    for (const change of [{ number: 124 }, { head: { ...pr.head, sha: implemented } }, { head: { ...pr.head, ref: 'other' } },
      { head: { ...pr.head, repo: { full_name: 'other/repo' } } }, { base: { ...pr.base, ref: 'other' } }]) {
      await assert.rejects(verifyDecision({ ...options, head, pr: { ...pr, ...change } }));
    }
    for (const change of [{ run_id: 'wrong-run' }, { outcome: 'failed' }, { pr: null }, { lane: 'F' }, { action: 'new' }]) {
      assert.throws(() => boundRun(c, before, [...before, { ...run, ...change }]));
    }
    assert.throws(() => boundRun(c, [...before, run], [...before, run]), /historical run/);
    assert.throws(() => boundRun(c, before, [...before, run, run]), /exactly one run/);
    assert.throws(() => boundRun(c, before, [...before, run, { ...run, run_id: 'uncovered' }]), /multiple new shipped/);
    fs.writeFileSync(path.join(dir, 'index.html'), 'before\n'); g('add', '.'); g('commit', '-m', 'remove fixture implementation');
    const emptyHead = g('rev-parse', 'HEAD');
    await assert.rejects(verifyDecision({ ...options, head: emptyHead, pr: { ...pr, head: { ...pr.head, sha: emptyHead } } }), /no implemented change/);
    // The verifier must reject hand-authored declarations that bypass the CLI,
    // and cannot use a field in that declaration to opt out of the new rule.
    for (const kind of ['missing-reference', 'stale-reference', 'missing-selection-receipt']) {
      g('checkout', '--detach', baseRef);
      const bad = structuredClone(c);
      if (kind === 'missing-reference') for (const x of bad.candidates) delete x.calibration;
      if (kind === 'stale-reference') for (const x of bad.candidates) x.calibration.snapshot_sha256 = '0'.repeat(64);
      if (kind === 'missing-selection-receipt') delete bad.selection.calibration;
      save(`data/decision-intents/${c.id}.json`, bad); g('add', '.'); g('commit', '-m', kind);
      await assert.rejects(verifyDecision({ ...options, head: g('rev-parse', 'HEAD') }), /calibration|must reproduce/, kind);
    }
    // The deployed pre-upgrade contract format remains verifiable against its
    // own parent. This is version compatibility, not a candidate-controlled flag.
    g('checkout', '--detach', baseRef);
    fs.writeFileSync(path.join(dir, 'scripts/value-contracts.mjs'), '// legacy selector\n');
    g('add', '.'); g('commit', '-m', 'legacy fixture base');
    const legacyBase = g('rev-parse', 'HEAD');
    const legacy = structuredClone(c);
    delete legacy.selection.calibration;
    for (const x of legacy.candidates) delete x.calibration;
    save(`data/decision-intents/${c.id}.json`, legacy); g('add', '.'); g('commit', '-m', 'legacy declaration');
    assert.equal((await verifyDecision({ ...options, baseRef: legacyBase, head: g('rev-parse', 'HEAD') })).state, 'declared');
  } finally { fs.rmSync(dir, { recursive: true }); }
  console.log('decision-ci: real Git declaration-to-run binding and PR-only autonomous merge checks passed');
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest();
  if (!process.env.GITHUB_EVENT_PATH) { console.log('decision-ci: local schema tests only; PR history is enforced by CI'); return; }
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const branch = pr?.head.ref ?? process.env.GITHUB_REF_NAME;
  if (!/^claude\/obsidian-auto-/.test(branch ?? '')) { console.log('decision-ci: not an autonomous picker branch'); return; }
  gitAt(ROOT)('fetch', 'origin', 'main');
  const result = await verifyDecision({ branch, head: pr?.head.sha ?? process.env.GITHUB_SHA,
    baseRef: pr?.base.sha ?? 'origin/main', pr,
  });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
