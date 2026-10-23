import './admin-retirement.test.mjs';
// Exercise the real publishing shell with synthetic, network-isolated commands.
import './autopilot-act-publish.test.mjs';
import './lib/refactor-behavior.test.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { extractCommands, auditExtraction } from './preflight.mjs';
import { makeMirror, runChecks } from './lib/preflight-runner.mjs';
import { run } from './lib/selftest.mjs';

// A failed regression must never fall through to a real external request.
globalThis.fetch = async () => { throw new Error('Network access is disabled in these tests'); };

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
test('workflow extraction preserves inline/block order and deduplicates commands', () => {
  const yaml = `
steps:
  - run: node scripts/a.mjs --check
  - run: |
      node growth/scripts/b.mjs --selftest
      node scripts/a.mjs --check
      node scripts/a.mjs --selftest
  - run: node scripts/refactor.test.mjs
`;
  assert.deepEqual(extractCommands(yaml), [
    { runner: 'node', script: 'scripts/a.mjs', args: ['--check'] },
    { runner: 'node', script: 'growth/scripts/b.mjs', args: ['--selftest'] },
    { runner: 'node', script: 'scripts/a.mjs', args: ['--selftest'] },
    { runner: 'node', script: 'scripts/refactor.test.mjs', args: [] },
  ]);
  assert.equal(auditExtraction(yaml).taken, 5);
});

test('unsupported commands are reported and never partially executed', () => {
  const groups = {
    composed: ['node scripts/a.mjs && echo yes', 'node scripts/a.mjs > result'],
    variable: ['node scripts/a.mjs $filter', 'node scripts/a.mjs $(pwd)', 'node scripts/a.mjs `pwd`'],
    out_of_scope: ['npx playwright test'],
    unknown: ['node scripts/a.mjs.bak', 'node scripts/a.mjs "two words"',
      'node scripts/a.mjs # comment', 'node --test tools/refactor.test.mjs'],
  };
  for (const [kind, lines] of Object.entries(groups)) {
    for (const line of lines) {
      for (const prefix of ['', 'run: ', '- run: ']) {
        assert.deepEqual(extractCommands(prefix + line), [], line);
        assert.deepEqual(auditExtraction(prefix + line).dropped[kind], [line], line);
      }
    }
  }
});

test('empty input does not produce checks', () => {
  for (const input of [null, undefined, '', '# node scripts/a.mjs']) {
    assert.deepEqual(extractCommands(input), []);
    assert.equal(auditExtraction(input).taken, 0);
  }
});

test('analysis CLI delivers complete JSON to a pipe before exiting', () => {
  const result = spawnSync(process.execPath, ['growth/scripts/analyze.mjs', '--json'], {
    cwd: ROOT, encoding: 'utf8', timeout: 15000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(typeof parsed.snapshot, 'string');
  assert.ok(Array.isArray(parsed.unanswered));
  assert.ok(Array.isArray(parsed.opportunities));
});

for (const args of [['--only'], ['--only', '--list'], ['--only', 'no-such-refactor-check'], ['--unknown']]) {
  test(`preflight CLI rejects ${args.join(' ')}`, () => {
    const result = spawnSync(process.execPath, ['scripts/preflight.mjs', ...args], {
      cwd: ROOT, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 2, result.stderr);
    assert.doesNotMatch(result.stdout, /0 本失敗/);
  });
}

test('preflight CLI still selects and runs an existing check', () => {
  const result = spawnSync(process.execPath, ['scripts/preflight.mjs', '--only', 'check-css-version'], {
    cwd: ROOT, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /1 本中 0 本失敗/);
});

const generator = { script: 'scripts/check-generators.mjs', args: ['--run'] };
const readonly = { script: 'scripts/check-generators.mjs', args: ['--check'] };

for (const createMirror of [() => null, () => { throw new Error('copy failed'); }]) {
  test('mirror failure skips the generator and still runs subsequent read-only checks', () => {
    const executed = [];
    const failed = runChecks([generator, readonly], {
      root: '/fixture', createMirror, log() {},
      execute(_node, args, options) { executed.push({ args, cwd: options.cwd }); return { status: 0 }; },
    });
    assert.deepEqual(executed, [{ args: [readonly.script, '--check'], cwd: '/fixture' }]);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].label, 'check-generators.mjs --run');
  });
}

test('runner reports spawn errors, signals and thrown failures, then cleans the mirror', () => {
  const exitListeners = process.listenerCount('exit');
  let cleaned = 0;
  let attempts = 0;
  const failed = runChecks([generator, readonly, readonly], {
    root: '/fixture', log() {},
    createMirror: () => ({ directory: '/mirror', cleanup: () => { cleaned++; } }),
    execute(_node, _args, options) {
      attempts++;
      if (attempts === 1) {
        assert.equal(options.cwd, '/mirror');
        return { status: null, error: new Error('ENOENT') };
      }
      if (attempts === 2) return { status: null, signal: 'SIGTERM' };
      throw new Error('execution failed');
    },
  });
  assert.equal(attempts, 3);
  assert.equal(cleaned, 1);
  assert.equal(process.listenerCount('exit'), exitListeners);
  assert.deepEqual(failed.map((f) => f.out), ['ENOENT', 'signal: SIGTERM', 'execution failed']);
});

test('runner disposes the mirror after a successful generator', () => {
  let cleaned = false;
  assert.deepEqual(runChecks([generator], {
    root: '/fixture', log() {}, execute: () => ({ status: 0 }),
    createMirror: () => ({ directory: '/mirror', cleanup: () => { cleaned = true; } }),
  }), []);
  assert.equal(cleaned, true);
});

test('runner preserves Python and grouped Node test invocations', () => {
  const commands = extractCommands('run: python3 scripts/example.py --check\n'
    + 'run: node --test scripts/first.test.mjs growth/lib/second.test.mjs');
  const calls = [];
  assert.deepEqual(runChecks(commands, {
    root: '/fixture', log() {},
    execute(runner, args) { calls.push([runner, ...args]); return { status: 0 }; },
  }), []);
  assert.deepEqual(calls, [
    ['python3', 'scripts/example.py', '--check'],
    [process.execPath, '--test', 'scripts/first.test.mjs', 'growth/lib/second.test.mjs'],
  ]);
});

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-refactor-'));
  const root = path.join(parent, 'repo');
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return { parent, root };
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('mirror captures edits, untracked files and deletions without changing the source', (t) => {
  const { root, parent } = fixture(t);
  git(['init', '-q'], root);
  fs.writeFileSync(path.join(root, 'edited.txt'), 'before');
  fs.writeFileSync(path.join(root, 'deleted.txt'), 'delete me');
  git(['add', '-A'], root);
  git(['-c', 'user.name=SimpleMemo Developer', '-c', 'user.email=refactor@local',
    '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture'], root);
  fs.writeFileSync(path.join(root, 'edited.txt'), 'after');
  fs.unlinkSync(path.join(root, 'deleted.txt'));
  fs.writeFileSync(path.join(root, 'new.txt'), 'new');
  fs.writeFileSync(path.join(root, 'executable.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const beforeStatus = git(['status', '--porcelain'], root);
  const mirror = makeMirror(root);
  t.after(mirror.cleanup);
  assert.equal(path.dirname(mirror.directory), parent);
  assert.equal(git(['status', '--porcelain'], mirror.directory), '');
  assert.equal(fs.readFileSync(path.join(mirror.directory, 'edited.txt'), 'utf8'), 'after');
  assert.equal(fs.readFileSync(path.join(mirror.directory, 'new.txt'), 'utf8'), 'new');
  assert.equal(fs.existsSync(path.join(mirror.directory, 'deleted.txt')), false);
  assert.equal(fs.statSync(path.join(mirror.directory, 'executable.sh')).mode & 0o111, 0o111);
  fs.writeFileSync(path.join(mirror.directory, 'edited.txt'), 'generator wrote here');
  mirror.cleanup();
  assert.equal(fs.existsSync(mirror.directory), false);
  assert.equal(fs.readFileSync(path.join(root, 'edited.txt'), 'utf8'), 'after');
  assert.equal(git(['status', '--porcelain'], root), beforeStatus);
});

for (const failedCommand of ['ls-files', 'init', 'add', 'commit']) {
  test(`mirror rejects git ${failedCommand} failure and removes partial copies`, (t) => {
    const { root, parent } = fixture(t);
    assert.throws(() => makeMirror(root, { git(args) {
      return args.includes(failedCommand)
        ? { status: 1, stderr: 'fixture failure' }
        : { status: 0, stdout: '' };
    } }), /fixture failure/);
    assert.deepEqual(fs.readdirSync(parent), ['repo']);
  });
}

test('mirror refuses symlinks rather than exposing their targets to generators', (t) => {
  const { root, parent } = fixture(t);
  fs.writeFileSync(path.join(parent, 'private.txt'), 'untouched');
  fs.symlinkSync('../private.txt', path.join(root, 'link'));
  assert.throws(() => makeMirror(root, { git: () => ({ status: 0, stdout: 'link\0' }) }), /non-regular/);
  assert.deepEqual(fs.readdirSync(parent).sort(), ['private.txt', 'repo']);
  assert.equal(fs.readFileSync(path.join(parent, 'private.txt'), 'utf8'), 'untouched');
});

for (const key of ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_CONFIG_COUNT']) {
  test(`mirror refuses ${key} before touching the source or creating a copy`, (t) => {
    const { root, parent } = fixture(t);
    const source = path.join(root, 'source-index');
    fs.writeFileSync(source, 'untouched');
    const previous = process.env[key];
    process.env[key] = key === 'GIT_CONFIG_COUNT' ? '0' : source;
    try {
      assert.throws(() => makeMirror(root), new RegExp(key));
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
    assert.deepEqual(fs.readdirSync(parent), ['repo']);
    assert.equal(fs.readFileSync(source, 'utf8'), 'untouched');
  });
}

test('shared selftest runner continues after failures and retains the failure count', () => {
  const originalLog = console.log;
  const logs = [];
  let reached = false;
  console.log = (line) => logs.push(line);
  try {
    assert.equal(run([
      ['broken', () => { throw new Error('deliberate'); }],
      ['later', () => { reached = true; }],
    ]), 1);
  } finally { console.log = originalLog; }
  assert.equal(reached, true);
  assert.deepEqual(logs, ['  FAIL broken\n       deliberate', '  ok   later', '\n  自己テスト 2 件中 1 件失敗']);
});
