#!/usr/bin/env node
// Trusted main code prepares an Act branch from immutable Git object IDs. A
// pending branch supplies data only: its scripts and generated pages never run.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate as validateRuns } from './autopilot-runs.mjs';
import { validate as validateCost } from './autopilot-budget.mjs';
import { reconcileSnapshots, verifyPreparedHistory, RUNS, COST, ACTIONS, HISTORY, ELIGIBILITY } from './lib/autopilot-act-reconcile.mjs';
const required = [RUNS, COST, ACTIONS, HISTORY, ELIGIBILITY];
const sha = x => /^[a-f0-9]{40}$/.test(x);
export function prepareBranch({ cwd = process.cwd(), branch, mainSha, pendingSha = '', receipt, gitEnv = process.env }) {
  if (!/^claude\/autopilot-act-[0-9]{8}$/.test(branch ?? '') || !sha(mainSha)
    || (pendingSha && !sha(pendingSha))) throw new Error('Invalid pinned branch or commit');
  const git = args => execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trimEnd();
  const read = (ref, file) => git(['show', `${ref}:${file}`]) + '\n';
  if (git(['status', '--porcelain'])) throw new Error('Working tree is not clean');
  if (git(['rev-parse', '--verify', `${mainSha}^{commit}`]) !== mainSha) throw new Error('Main commit is unreadable');
  // Re-check the stop at the exact main that will seed the branch, not only at
  // the older checkout used by the workflow's first emergency-stop step.
  const stop = JSON.parse(read(mainSha, 'data/emergency-stop.json'));
  const act = stop.agents?.act;
  if (stop.stopped !== false || (act && act.stopped !== false)) throw new Error('Emergency stop is set or unreadable');
  let plan = null;
  if (pendingSha) {
    if (git(['rev-parse', '--verify', `${pendingSha}^{commit}`]) !== pendingSha) throw new Error('Pending commit is unreadable');
    const baseSha = git(['merge-base', '--all', mainSha, pendingSha]);
    if (!sha(baseSha)) throw new Error('A unique merge base is required');
    const changedPaths = git(['diff', '--name-only', baseSha, pendingSha]).split('\n').filter(Boolean);
    const files = [...new Set([...required, ...changedPaths])];
    const snapshots = Object.fromEntries([['base', baseSha], ['main', mainSha], ['pending', pendingSha]]
      .map(([name, ref]) => [name, Object.fromEntries(files.map(file => [file, read(ref, file)]))]));
    const refs = { base: baseSha, main: mainSha, pending: pendingSha };
    plan = reconcileSnapshots({ ...snapshots, changedPaths, refs, observedRefs: refs });
    const problems = [...validateRuns(JSON.parse(plan.files[RUNS])), ...validateCost(JSON.parse(plan.files[COST]))];
    if (problems.length) throw new Error(`Reconciled ledger validation failed: ${problems.join('; ')}`);
  }
  if (!plan) {
    const snapshot = Object.fromEntries(required.map(file => [file, read(mainSha, file)]));
    const refs = { base: mainSha, main: mainSha, pending: mainSha };
    plan = reconcileSnapshots({ base: snapshot, main: snapshot, pending: snapshot, changedPaths: [], refs, observedRefs: refs });
  }
  // These are independently read remote refs, not fields copied from a manifest.
  // Checking both immediately before local mutation narrows a race; the exact
  // pending SHA is also carried to the later push's explicit compare-and-swap lease.
  const remote = git(['ls-remote', '--heads', 'origin', 'refs/heads/main', `refs/heads/${branch}`]);
  const observed = new Map(remote.split('\n').filter(Boolean).map(line => {
    const [value, ref] = line.split(/\s+/); if (!sha(value) || !ref) throw new Error('Unreadable remote ref'); return [ref, value];
  }));
  if (observed.get('refs/heads/main') !== mainSha || (observed.get(`refs/heads/${branch}`) ?? '') !== pendingSha) throw new Error('Remote ref moved; recompute before preparing');
  // All decisions and source reads have succeeded. No remote state changes here.
  git(['checkout', '-B', branch, mainSha]);
  if (plan) for (const [relative, text] of Object.entries(plan.files)) {
    const destination = path.join(cwd, relative);
    // Preserve main's exact bytes for semantic no-ops. Large generated logs need
    // no formatting-only diff and existing owner data must not drift.
    const current = fs.readFileSync(destination, 'utf8');
    if (JSON.stringify(JSON.parse(current)) !== JSON.stringify(JSON.parse(text))) fs.writeFileSync(destination, text);
  }
  if (receipt) fs.writeFileSync(receipt, JSON.stringify(plan?.receipt ?? { version: 1, status: 'new_branch_from_main', refs: { main: mainSha, pending: null } }, null, 2) + '\n');
  return { mainSha, pendingSha, imported: plan?.receipt.facts ?? {} };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify-history') {
    try {
      if (process.argv.length !== 4) throw new Error('Expected one receipt path');
      const receipt = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
      const current = Object.fromEntries([HISTORY, ELIGIBILITY].map(file => [file, fs.readFileSync(file, 'utf8')]));
      verifyPreparedHistory(receipt, current, new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
      console.log('Prior-day history preserved');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else if (process.argv.length !== 6) { console.error('Usage: node scripts/autopilot-act-prepare.mjs BRANCH MAIN_SHA PENDING_SHA_OR_DASH RECEIPT'); process.exitCode = 2; }
  else try { console.log(JSON.stringify(prepareBranch({ branch: process.argv[2], mainSha: process.argv[3], pendingSha: process.argv[4] === '-' ? '' : process.argv[4], receipt: process.argv[5] }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
