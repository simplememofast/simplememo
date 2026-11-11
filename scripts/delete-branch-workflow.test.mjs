// Replays the real `Delete` step of .github/workflows/delete-branch.yml against
// throwaway git repositories (a bare "origin" and a fresh clone of it), so the
// guard that decides whether a claude/ branch is already in main is tested as
// written, not as a copy. Run through scripts/ci-security.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function deleteStep() {
  const text = fs.readFileSync(new URL('../.github/workflows/delete-branch.yml', import.meta.url), 'utf8');
  const section = text.split('      - name: Delete\n')[1];
  assert(section, 'the Delete step must exist');
  const lines = section.split('\n');
  const start = lines.indexOf('        run: |');
  assert(start >= 0, 'the Delete step must have a run block');
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) { body.push(''); continue; }
    if (!line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  assert.match(body.join('\n'), /git push --force-with-lease="refs\/heads\/\$BRANCH:\$sha" origin ":refs\/heads\/\$BRANCH"/);
  return body.join('\n');
}

// Only git's defaults: no system/global config and none of the caller's
// GIT_CONFIG_* variables (rename detection stays on, as on a fresh runner).
function gitEnv(home) {
  return {
    PATH: process.env.PATH, HOME: home, LANG: 'C.UTF-8',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(home, 'gitconfig'),
    GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-branch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = gitEnv(dir);
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout;
  };
  const origin = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, work);
  const write = (name, body) => {
    fs.mkdirSync(path.dirname(path.join(work, name)), { recursive: true });
    fs.writeFileSync(path.join(work, name), body);
  };
  const commit = (msg) => { git(work, 'add', '-A'); git(work, 'commit', '-q', '-m', msg); };
  const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n';
  write('a.txt', long);
  write('docs/基本.md', 'base\n');
  write('dl/My Note.md', 'base\n');
  commit('base');
  git(work, 'push', '-q', 'origin', 'main');

  // Runs the real step in a fresh clone, as actions/checkout with fetch-depth: 0 leaves it.
  // race: { dir, ref } pushes `ref` from `dir` to origin right before the step's own push (the
  // delete), through a git shim placed first on PATH: a push that lands after the check.
  const runStep = (branch, { race } = {}) => {
    const runner = path.join(fs.mkdtempSync(path.join(dir, 'runner-')), 'checkout');
    git(dir, 'clone', '-q', origin, runner);
    const temp = fs.mkdtempSync(path.join(dir, 'tmp-'));
    const summary = path.join(temp, 'summary.md');
    const stepEnv = { ...env, BRANCH: branch, RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary };
    if (race) {
      const shim = fs.mkdtempSync(path.join(dir, 'shim-'));
      const realGit = spawnSync('bash', ['-c', 'command -v git'], { env, encoding: 'utf8' }).stdout.trim();
      fs.writeFileSync(path.join(shim, 'git'), [
        '#!/bin/bash',
        'if [ "$1" = push ] && [ ! -e "$RACE_DONE" ]; then',
        '  : > "$RACE_DONE"',
        '  "$REAL_GIT" -C "$RACE_DIR" push -q origin "$RACE_REF" || exit 99',
        'fi',
        'exec "$REAL_GIT" "$@"',
        '',
      ].join('\n'), { mode: 0o755 });
      Object.assign(stepEnv, { PATH: `${shim}:${env.PATH}`, REAL_GIT: realGit, RACE_DONE: path.join(shim, 'done'),
        RACE_DIR: race.dir, RACE_REF: race.ref });
    }
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', deleteStep()], {
      cwd: runner, encoding: 'utf8', env: stepEnv,
    });
    const head = spawnSync('git', ['ls-remote', '--exit-code', '--heads', origin, branch], { env, encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr, remains: head.status === 0, head: head.stdout.split('\t')[0] };
  };
  return { git, work, write, commit, long, runStep };
}

test('a branch whose unmerged change is the source half of a rename is kept', (t) => {
  const f = fixture(t);
  // The PR #851 race: the validated commit (add b.txt, a moved copy of a.txt) is
  // squash-merged, then a commit deleting a.txt lands on the branch after the merge.
  f.git(f.work, 'checkout', '-q', '-b', 'claude/rename-race');
  f.write('b.txt', f.long);
  f.commit('add b.txt');
  f.git(f.work, 'push', '-q', 'origin', 'claude/rename-race');
  f.git(f.work, 'checkout', '-q', 'main');
  f.write('b.txt', f.long);
  f.commit('squash: add b.txt');
  f.git(f.work, 'push', '-q', 'origin', 'main');
  f.git(f.work, 'checkout', '-q', 'claude/rename-race');
  f.git(f.work, 'rm', '-q', 'a.txt');
  f.commit('remove a.txt after the merge');
  f.git(f.work, 'push', '-q', 'origin', 'claude/rename-race');

  const r = f.runStep('claude/rename-race');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /main に無い差分がある/);
  assert.equal(r.remains, true, 'the unmerged deletion of a.txt must not be lost');
});

// Shared setup: the branch changes dl/My Note.md, and the same change is squashed into main.
function squashMerged(f, branch) {
  f.git(f.work, 'checkout', '-q', '-b', branch);
  f.write('dl/My Note.md', 'validated change\n');
  f.commit('change');
  f.git(f.work, 'push', '-q', 'origin', branch);
  f.git(f.work, 'checkout', '-q', 'main');
  f.write('dl/My Note.md', 'validated change\n');
  f.commit('squash: change');
  f.git(f.work, 'push', '-q', 'origin', 'main');
  f.git(f.work, 'checkout', '-q', branch);
}

test('a branch whose post-merge commit puts the validated change back is kept', (t) => {
  // Re-review: the net diff from the merge-base no longer lists a file the branch changed and
  // then changed back after the squash, so it was never compared with main and the branch
  // (holding 'base' while main holds the validated change) was deleted.
  const f = fixture(t);
  squashMerged(f, 'claude/revert-race');
  f.write('dl/My Note.md', 'base\n');
  f.commit('put it back after the merge');
  f.git(f.work, 'push', '-q', 'origin', 'claude/revert-race');

  const r = f.runStep('claude/revert-race');
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /main に無い差分がある/);
  assert.equal(r.remains, true, 'the unmerged revert must not be lost');
});

test('a push that lands after the check is not deleted with the branch', (t) => {
  // Re-review: the check reads origin/$BRANCH at fetch time, but a plain delete push removes
  // whatever the branch holds at push time.
  const f = fixture(t);
  squashMerged(f, 'claude/late-push');
  f.write('late.txt', 'pushed after the check\n');
  f.commit('late');
  const late = f.git(f.work, 'rev-parse', 'HEAD').trim();

  const r = f.runStep('claude/late-push', { race: { dir: f.work, ref: 'claude/late-push' } });
  assert.notEqual(r.status, 0, r.out);
  assert.match(r.out, /照合した後にブランチが動いた/);
  assert.equal(r.remains, true);
  assert.equal(r.head, late, 'the late commit is still on the branch');
});

test('a squash-merged branch is deleted when nothing moves (the lease names the checked SHA)', (t) => {
  const f = fixture(t);
  squashMerged(f, 'claude/plain');
  const r = f.runStep('claude/plain');
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /squash で取り込み済み/);
  assert.equal(r.remains, false);
});

test('a rename that main already has is still deleted', (t) => {
  const f = fixture(t);
  f.git(f.work, 'checkout', '-q', '-b', 'claude/rename-merged');
  f.git(f.work, 'mv', 'a.txt', 'b.txt');
  f.commit('move a.txt to b.txt');
  f.git(f.work, 'push', '-q', 'origin', 'claude/rename-merged');
  f.git(f.work, 'checkout', '-q', 'main');
  f.git(f.work, 'mv', 'a.txt', 'b.txt');
  f.commit('squash: move a.txt to b.txt');
  f.git(f.work, 'push', '-q', 'origin', 'main');

  const r = f.runStep('claude/rename-merged');
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /squash で取り込み済み/);
  assert.equal(r.remains, false);
});

for (const [label, file] of [['a non-ASCII path', 'docs/基本.md'], ['a path with a space', 'dl/My Note.md']]) {
  test(`an unmerged change in ${label} is kept, and the same change squashed into main is deleted`, (t) => {
    const f = fixture(t);
    f.git(f.work, 'checkout', '-q', '-b', 'claude/unmerged');
    f.write(file, 'changed on the branch\n');
    f.commit('change');
    f.git(f.work, 'push', '-q', 'origin', 'claude/unmerged');
    const kept = f.runStep('claude/unmerged');
    assert.notEqual(kept.status, 0, kept.out);
    assert.equal(kept.remains, true);

    f.git(f.work, 'checkout', '-q', 'main');
    f.write(file, 'changed on the branch\n');
    f.commit('squash: change');
    f.git(f.work, 'push', '-q', 'origin', 'main');
    const gone = f.runStep('claude/unmerged');
    assert.equal(gone.status, 0, gone.out);
    assert.equal(gone.remains, false);
  });
}

test('only claude/ branches are deleted', (t) => {
  const f = fixture(t);
  const r = f.runStep('main');
  assert.notEqual(r.status, 0);
  assert.match(r.out, /claude\/ 配下だけを消す/);
  assert.equal(r.remains, true);
});
