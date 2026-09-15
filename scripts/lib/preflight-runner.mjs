import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// These overrides take precedence over cwd; inheriting one can make a mirror's
// git add/commit operate on the source repository. Names from git's local-env-vars.
const GIT_REPOSITORY_ENV = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT', 'GIT_OBJECT_DIRECTORY', 'GIT_DIR', 'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE', 'GIT_GRAFT_FILE', 'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE', 'GIT_PREFIX',
  'GIT_SHALLOW_FILE', 'GIT_COMMON_DIR',
];

/** Make a disposable, committed copy beside the repo so sibling inputs remain visible. */
export function makeMirror(root, { git = (args, cwd) => spawnSync('git', args, {
  cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
}) } = {}) {
  const override = GIT_REPOSITORY_ENV.find((key) => process.env[key] !== undefined);
  if (override) throw new Error(`Cannot safely mirror with Git environment override: ${override}`);
  const checkedGit = (args, cwd) => {
    const result = git(args, cwd);
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.error?.message || result.stderr || result.status}`);
    }
    return result.stdout;
  };
  const tracked = checkedGit(['ls-files', '-z'], root).split('\0').filter(Boolean);
  const untracked = checkedGit(['ls-files', '--others', '--exclude-standard', '-z'], root)
    .split('\0').filter(Boolean);
  let directory;
  const cleanup = () => {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  };
  try {
    directory = fs.mkdtempSync(path.join(path.dirname(root), '.preflight-mirror-'));
    for (const rel of new Set([...tracked, ...untracked])) {
      const src = path.join(root, rel);
      let stat;
      try { stat = fs.lstatSync(src); }
      catch (e) {
        if (e.code === 'ENOENT') continue; // A tracked file deleted in the working tree.
        throw e;
      }
      // Following a link can let a generator modify files outside its disposable copy.
      if (!stat.isFile()) throw new Error(`Cannot safely mirror non-regular file: ${rel}`);
      const dst = path.join(directory, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    checkedGit(['-c', 'init.defaultBranch=main', 'init', '-q'], directory);
    checkedGit(['add', '-A'], directory);
    checkedGit(['-c', 'core.hooksPath=/dev/null',
      '-c', 'user.email=preflight@local', '-c', 'user.name=preflight',
      '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'preflight mirror'], directory);
    return { directory, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

/** Run checks without ever falling back to the user's tree for a destructive check. */
export function runChecks(commands, { root, createMirror = makeMirror, execute = spawnSync,
  log = console.log } = {}) {
  const failed = [];
  let mirror;
  const cleanup = () => mirror?.cleanup();
  process.once('exit', cleanup);
  try {
    for (const command of commands) {
      const label = `${command.script} ${command.args.join(' ')}`.trim().replace(/^scripts\//, '');
      try {
        let cwd = root;
        if (command.script.endsWith('check-generators.mjs') && command.args.includes('--run')) {
          mirror ??= createMirror(root);
          if (!mirror?.directory) throw new Error('検証用の鏡を作れないため実行しません');
          cwd = mirror.directory;
        }
        const runner = !command.runner || command.runner === 'node' ? process.execPath : command.runner;
        const result = execute(runner, [command.script, ...command.args], {
          cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        });
        if (result.status !== 0) {
          const details = [result.stdout, result.stderr, result.error?.message,
            result.signal && `signal: ${result.signal}`].filter(Boolean).join('\n').trim();
          throw new Error(details || `exit status: ${result.status}`);
        }
        log(`  ok    ${label}`);
      } catch (e) {
        failed.push({ label, out: e.message });
        log(`  FAIL  ${label}`);
      }
    }
  } finally {
    process.removeListener('exit', cleanup);
    cleanup();
  }
  return failed;
}
