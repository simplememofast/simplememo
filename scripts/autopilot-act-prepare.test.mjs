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
    'scripts/trusted': { version: 1 },
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
  r.write('scripts/trusted', { version: 2 });
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
    assert.deepEqual(r.read('scripts/trusted'), { version: 2 });
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
test('actual preparation shell and local Git are idempotent after publishing an update', async () => {
  const { fileURLToPath } = await import('node:url');
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const r = repository(); try {
    for (const rel of ['scripts/autopilot-act-prepare.mjs', 'scripts/lib/autopilot-act-reconcile.mjs',
      'scripts/autopilot-runs.mjs', 'scripts/autopilot-budget.mjs', 'scripts/check-model-routing.mjs',
      'scripts/lib/read-ledger.mjs', 'scripts/lib/autopilot-gate-codes.mjs',
      'scripts/lib/intervention-observation.mjs', 'scripts/lib/selftest.mjs']) {
      const dest = path.join(r.cwd, rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(sourceRoot, rel), dest);
    }
    r.baseSha = r.commit('trusted preparation helpers'); r.git(r.cwd, 'push', 'origin', 'main');
    const args = diverge(r);
    const workflow = fs.readFileSync(path.join(sourceRoot, '.github/workflows/autopilot-act.yml'), 'utf8');
    const block = workflow.split('      - name: Prepare ledger branch before observation\n')[1].split('\n      #')[0];
    const shell = block.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
    const bin = path.join(r.dir, 'bin'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nprintf "123\\n"\n', { mode: 0o700 });
    fs.writeFileSync(path.join(bin, 'date'), '#!/bin/sh\nprintf "20261105\\n"\n', { mode: 0o700 });
    const env = { ...r.env, PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      RUNNER_TEMP: r.dir, GITHUB_OUTPUT: path.join(r.dir, 'step-output'), GITHUB_REPOSITORY: 'o/r', GITHUB_REPOSITORY_OWNER: 'o' };
    const prepare = () => execFileSync('/bin/bash', ['--noprofile', '--norc', '-euo', 'pipefail', '-c', shell], { cwd: r.cwd, env, stdio: 'pipe' });
    prepare();
    const before = r.read('data/autopilot-runs.json'); assert.equal(before.runs.length, 3);
    r.commit('prepared observation');
    r.git(r.cwd, 'push', `--force-with-lease=refs/heads/${branch}:${args.pendingSha}`, 'origin', `HEAD:refs/heads/${branch}`);
    r.git(r.cwd, 'checkout', 'main'); prepare();
    assert.deepEqual(r.read('data/autopilot-runs.json'), before);
    assert.deepEqual(r.read('scripts/trusted'), { version: 2 });
  } finally { r.cleanup(); }
});
