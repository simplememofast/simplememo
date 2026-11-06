import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { prepareBranch } from './autopilot-act-prepare.mjs';
const branch = 'claude/autopilot-act-20261105';
const run = (id, ref) => ({ run_id: id, external_ref: ref, date_jst: '2026-11-05', route: 'actions', source: 'act-reconcile',
 attempted: false, outcome: 'skipped_gate', failure_stage: 'eligibility', eligibility_verdict: 'declined_by_design', gate_code: 'skip_repair_limit', interventions: null });
function repository() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-git-prepare-'));
  const env = { PATH: '/usr/bin:/bin', HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
  const git = (cwd, ...args) => execFileSync('/usr/bin/git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(dir, 'init', '--bare', 'origin.git'); git(dir, 'clone', path.join(dir, 'origin.git'), 'work');
  const cwd = path.join(dir, 'work');
  const write = (file, d) => { const p = path.join(cwd, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2) + '\n'); };
  const read = file => JSON.parse(fs.readFileSync(path.join(cwd, file)));
  for (const [file, d] of Object.entries({
    'data/autopilot-runs.json': { runs: [run('a', '100')] },
    'data/autopilot-cost.json': { budget: { monthly_usd_cap: 100, on_exceed: 'skip_run' }, runs: [] },
    'data/autopilot-actions.json': { actions: [] },
    'data/autonomy-score-history.json': { snapshots: [] },
    'data/eligibility-log.json': { judgements: [] },
    'data/emergency-stop.json': { stopped: false, agents: { act: { stopped: false } } },
    'data/autopilot-actions-report.json': { value: 'base' },
  })) write(file, d);
  const commit = msg => { git(cwd, 'add', '.'); git(cwd, 'commit', '-m', msg); return git(cwd, 'rev-parse', 'HEAD'); };
  commit('base'); git(cwd, 'branch', '-M', 'main'); git(cwd, 'push', 'origin', 'main');
  const baseSha = git(cwd, 'rev-parse', 'HEAD');
  return { dir, cwd, env, git, write, read, commit, baseSha, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
function diverge(r) {
  r.git(r.cwd, 'checkout', '-b', branch);
  r.write('data/autopilot-runs.json', { runs: [run('a', '100'), run('pending', '200')] });
  r.write('data/autopilot-actions-report.json', { value: 'pending' });
  const pendingSha = r.commit('pending'); r.git(r.cwd, 'push', 'origin', branch);
  r.git(r.cwd, 'checkout', 'main');
  r.write('data/autopilot-runs.json', { runs: [run('a', '100'), run('main', '300')] });
  r.write('data/autopilot-actions-report.json', { value: 'main' });
  const mainSha = r.commit('main'); r.git(r.cwd, 'push', 'origin', 'main');
  return { cwd: r.cwd, gitEnv: r.env, branch, mainSha, pendingSha, receipt: path.join(r.dir, 'receipt.json') };
}
test('real git divergence preserves both run rows and regenerates from main report', () => {
  const r = repository(); try {
    const args = diverge(r);
    assert.throws(() => r.git(r.cwd, 'merge', '--no-commit', '--no-ff', branch)); r.git(r.cwd, 'merge', '--abort');
    prepareBranch(args);
    assert.deepEqual(r.read('data/autopilot-runs.json').runs.map(x => x.run_id), ['a', 'main', 'pending']);
    assert.deepEqual(r.read('data/autopilot-actions-report.json'), { value: 'main' });
    assert.equal(r.git(r.cwd, 'symbolic-ref', '--short', 'HEAD'), branch);
    assert.equal(r.git(r.cwd, 'ls-remote', 'origin', `refs/heads/${branch}`).split(/\s+/)[0], args.pendingSha);
    assert.equal(JSON.parse(fs.readFileSync(args.receipt)).status, 'prepared_not_publishable');
  } finally { r.cleanup(); }
});
for (const which of ['main', 'pending']) test(`real remote ${which} movement aborts without local data writes`, () => {
  const r = repository(); try {
    const args = diverge(r), head = r.git(r.cwd, 'rev-parse', 'HEAD'), before = fs.readFileSync(path.join(r.cwd, 'data/autopilot-runs.json'));
    r.git(path.join(r.dir, 'origin.git'), 'update-ref', which === 'main' ? 'refs/heads/main' : `refs/heads/${branch}`, r.baseSha);
    assert.throws(() => prepareBranch(args), /Remote ref moved/);
    assert.equal(r.git(r.cwd, 'rev-parse', 'HEAD'), head); assert.deepEqual(fs.readFileSync(path.join(r.cwd, 'data/autopilot-runs.json')), before); assert.ok(!fs.existsSync(args.receipt));
  } finally { r.cleanup(); }
});
test('new remote branch creation aborts a previously empty lease', () => {
  const r = repository(); try {
    r.git(path.join(r.dir, 'origin.git'), 'update-ref', `refs/heads/${branch}`, r.baseSha);
    assert.throws(() => prepareBranch({ cwd: r.cwd, gitEnv: r.env, branch, mainSha: r.baseSha, pendingSha: '' }), /Remote ref moved/);
    assert.equal(r.git(r.cwd, 'symbolic-ref', '--short', 'HEAD'), 'main');
  } finally { r.cleanup(); }
});
test('fresh main emergency stop blocks preparation', () => {
  const r = repository(); try {
    r.write('data/emergency-stop.json', { stopped: true }); const mainSha = r.commit('stop'); r.git(r.cwd, 'push', 'origin', 'main');
    assert.throws(() => prepareBranch({ cwd: r.cwd, gitEnv: r.env, branch, mainSha }), /Emergency stop/);
    assert.equal(r.git(r.cwd, 'symbolic-ref', '--short', 'HEAD'), 'main');
  } finally { r.cleanup(); }
});
test('unknown pending changes fail before checkout', () => {
  const r = repository(); try {
    r.git(r.cwd, 'checkout', '-b', branch); r.write('scripts/unknown.json', { unsafe: true }); const pendingSha = r.commit('unknown'); r.git(r.cwd, 'push', 'origin', branch); r.git(r.cwd, 'checkout', 'main');
    assert.throws(() => prepareBranch({ cwd: r.cwd, gitEnv: r.env, branch, mainSha: r.baseSha, pendingSha }));
    assert.equal(r.git(r.cwd, 'symbolic-ref', '--short', 'HEAD'), 'main');
  } finally { r.cleanup(); }
});
test('criss-cross history with two merge bases is rejected before checkout', () => {
  const r = repository(); try {
    const tree = r.git(r.cwd, 'rev-parse', 'HEAD^{tree}');
    const a = r.git(r.cwd, 'commit-tree', tree, '-p', r.baseSha, '-m', 'a');
    const b = r.git(r.cwd, 'commit-tree', tree, '-p', r.baseSha, '-m', 'b');
    const mainSha = r.git(r.cwd, 'commit-tree', tree, '-p', a, '-p', b, '-m', 'left');
    const pendingSha = r.git(r.cwd, 'commit-tree', tree, '-p', b, '-p', a, '-m', 'right');
    assert.equal(r.git(r.cwd, 'merge-base', '--all', mainSha, pendingSha).split('\n').length, 2);
    assert.throws(() => prepareBranch({ cwd: r.cwd, gitEnv: r.env, branch, mainSha, pendingSha }), /unique merge base/);
    assert.equal(r.git(r.cwd, 'symbolic-ref', '--short', 'HEAD'), 'main');
  } finally { r.cleanup(); }
});
