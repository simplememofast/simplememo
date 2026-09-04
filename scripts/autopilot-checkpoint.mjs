#!/usr/bin/env node
// Preserve only declared public page work when a model run fails. Never archive
// the workspace, environment, conversation, credentials or collected analytics.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contractProblems, prepare, staticPath, verifyHistory } from './value-contracts.mjs';
import { loadContext } from './autonomy-eligibility.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PATCH = 8 * 1024 * 1024;
const sha = value => createHash('sha256').update(value).digest('hex');
const git = (cwd, args, options = {}) => execFileSync('git', args,
  { cwd, encoding: 'utf8', maxBuffer: MAX_PATCH, ...options });
const rev = (cwd, ref) => git(cwd, ['rev-parse', '--verify', ref]).trim();

function declaration(cwd, fork, base) {
  const files = git(cwd, ['diff', '--name-only', '--diff-filter=A', fork, base, '--', 'data/decision-intents/'])
    .trim().split('\n').filter(Boolean);
  assert.equal(files.length, 1, 'exactly one committed declaration required');
  const raw = git(cwd, ['show', `${base}:${files[0]}`]);
  const intent = JSON.parse(raw);
  const metrics = JSON.parse(git(cwd, ['show', `${base}:data/value-metrics.json`]));
  assert.deepEqual(contractProblems(intent, metrics), [], 'valid approved declaration required');
  verifyHistory(intent, fork, base, cwd);
  const allowed = intent.touches.filter(staticPath);
  assert(allowed.length, 'no declared public page paths');
  return { file: files[0], hash: sha(raw), allowed };
}

function ordinaryFiles(cwd, files) {
  for (const file of files) {
    const abs = path.join(cwd, file);
    // Check every existing ancestor too: a directory symlink can escape the tree.
    let part = cwd;
    for (const segment of file.split('/')) {
      part = path.join(part, segment);
      let stat;
      try { stat = fs.lstatSync(part); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      assert(!stat.isSymbolicLink(), 'symlinks are not checkpointed');
    }
    if (fs.existsSync(abs)) assert(fs.statSync(abs).isFile(), 'ordinary files required');
  }
}

export function capture({ cwd, fork, base, output, runId, attempt = 1 }) {
  assert(path.isAbsolute(output) && path.relative(cwd, output).startsWith(`..${path.sep}`), 'output must be outside repository');
  assert(/^\d+$/.test(String(runId)) && Number.isInteger(attempt) && attempt > 0, 'run identity required');
  git(cwd, ['merge-base', '--is-ancestor', base, 'HEAD']);
  const d = declaration(cwd, fork, base);
  ordinaryFiles(cwd, d.allowed);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-index-'));
  let patch;
  try {
    // A separate index includes new assets without touching the agent's index.
    const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, 'index') };
    git(cwd, ['read-tree', base], { env });
    const present = d.allowed.filter(f => fs.existsSync(path.join(cwd, f))
      || git(cwd, ['ls-tree', base, '--', f]).trim());
    if (present.length) git(cwd, ['add', '-A', '--', ...present], { env });
    patch = git(cwd, ['diff', '--cached', '--binary', '--full-index', '--no-renames', base, '--', ...d.allowed], { env, encoding: 'buffer' });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (!patch.length) return { saved: false, reason: 'no_unpublished_page_changes' };
  assert(patch.length <= MAX_PATCH, 'checkpoint exceeds size limit');
  const meta = { version: 1, run_id: String(runId), attempt, base_sha: base, fork_sha: fork,
    intent_file: d.file, intent_hash: d.hash, patch_hash: sha(patch), created_at: new Date().toISOString() };
  // Refuse a pre-existing directory: only these two generated files may upload.
  fs.mkdirSync(output);
  fs.writeFileSync(path.join(output, 'work.patch'), patch, { mode: 0o600 });
  fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify(meta, null, 2) + '\n', { mode: 0o600 });
  return { saved: true, bytes: patch.length, intent: d.file, base_sha: base };
}

export function restore({ cwd, directory }) {
  const meta = JSON.parse(fs.readFileSync(path.join(directory, 'checkpoint.json'), 'utf8'));
  assert.equal(meta.version, 1, 'unsupported checkpoint');
  assert(/^[a-f0-9]{40}$/.test(meta.base_sha) && /^[a-f0-9]{40}$/.test(meta.fork_sha), 'commit identity required');
  assert.equal(rev(cwd, 'HEAD'), meta.base_sha, 'restore only onto the recorded commit');
  assert.equal(git(cwd, ['status', '--porcelain']).trim(), '', 'restore requires a completely clean tree');
  const d = declaration(cwd, meta.fork_sha, meta.base_sha);
  assert.equal(meta.intent_file, d.file, 'declaration path mismatch');
  assert.equal(meta.intent_hash, d.hash, 'declaration changed');
  const patchFile = path.join(directory, 'work.patch');
  assert(fs.statSync(patchFile).size <= MAX_PATCH, 'checkpoint exceeds size limit');
  const patch = fs.readFileSync(patchFile);
  assert.equal(sha(patch), meta.patch_hash, 'checkpoint damaged');
  assert(!/^(?:rename from|rename to|copy from|copy to) /m.test(patch.toString()), 'rename/copy patches are not restored');
  assert(!/^(?:(?:new file mode|old mode|new mode|deleted file mode) |index [a-f0-9]+\.\.[a-f0-9]+ )(?:120000|160000)$/m.test(patch.toString()), 'symlink/submodule patches are not restored');
  const stats = git(cwd, ['apply', '--numstat', '-z', '-'], { input: patch });
  const files = stats.split('\0').filter(Boolean).map(row => row.split('\t').slice(2).join('\t'));
  assert(files.length && files.every(f => d.allowed.includes(f)), 'patch contains undeclared or non-page paths');
  ordinaryFiles(cwd, files);
  // Git's index check also prevents overwriting local/untracked work.
  git(cwd, ['apply', '--check', '--index', '-'], { input: patch });
  git(cwd, ['apply', '--index', '-'], { input: patch });
  // Restoring is not shipping: the declaration and the full CI still apply.
  return { restored: files, source_run: meta.run_id, source_attempt: meta.attempt };
}

export function checkWiring(source) {
  assert(source.includes('node "$RUNNER_TEMP/checkpoint-tools/scripts/autopilot-checkpoint.mjs" --save'), 'failure checkpoint must execute from trusted tools');
  assert(source.includes('git worktree add --detach "$RUNNER_TEMP/checkpoint-tools" "$GITHUB_SHA"'), 'tools must come from the workflow commit');
  assert(source.includes('--workspace "$GITHUB_WORKSPACE"'), 'capture the failed workspace, not the trusted tools tree');
  assert(source.includes("failure() && steps.claude.outcome == 'failure'"), 'checkpoint is for failed model runs');
  assert(source.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'pinned artifact upload required');
  assert(source.includes("steps.checkpoint.outputs.saved == 'true'"), 'upload only a successfully saved checkpoint');
  assert(source.includes('path: ${{ runner.temp }}/autopilot-checkpoint'), 'upload only the bounded checkpoint directory');
}

async function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  const cwd = path.join(dir, 'repo'), output = path.join(dir, 'artifact');
  fs.mkdirSync(cwd);
  const g = (...args) => git(cwd, args).trim();
  const put = (f, data) => { fs.mkdirSync(path.dirname(path.join(cwd, f)), { recursive: true }); fs.writeFileSync(path.join(cwd, f), data); };
  try {
    g('init', '-q'); g('config', 'user.email', 'test@example.invalid'); g('config', 'user.name', 'test');
    const metrics = { metrics: [{ id: 'shipping_day_rate', tier: 'A', approved_by: 'test-owner', approved_at: '2026-08-01', direction: 'up', null_model: { kind: 'trailing_median', window_days: 3 } }] };
    const runs = [1, 2, 3].map(i => ({ date_jst: `2026-09-0${i}`, outcome: 'no_run' }));
    const intent = prepare({ id: 'test-checkpoint', run_id: 'test-run', metric: 'shipping_day_rate',
      touches: ['index.html', 'assets/test.png', 'data/content-graph.json'], lane: 'A', action: 'refresh',
      evidence_date: '2026-09-03', predicted_usd: 0, predicted_delta: .1, p: .8, horizon_days: 1,
      max_changed_lines: 100, counterfactual: { id: 'runner-up', reason: 'Independent candidate comparison' }, rank_gap: .1 },
    { metrics, runs, costs: [], now: new Date('2026-09-04T00:00:00Z'), eligibility: loadContext({ today: '2026-09-04' }) });
    put('index.html', '<title>Before</title>\n'); put('data/value-metrics.json', JSON.stringify(metrics));
    g('add', '.'); g('commit', '-qm', 'baseline'); const fork = g('rev-parse', 'HEAD');
    put('data/decision-intents/test-checkpoint.json', JSON.stringify(intent, null, 2) + '\n');
    g('add', '.'); g('commit', '-qm', 'declare'); const base = g('rev-parse', 'HEAD');
    const args = { cwd, fork, base, output, runId: '123' };
    assert.equal(capture(args).saved, false);
    put('index.html', '<title>After</title>\n'); put('assets/test.png', Buffer.from([137, 80, 78, 71, 0, 1]));
    put('.env', 'private sentinel'); put('data/content-graph.json', 'excluded metadata sentinel');
    const before = g('status', '--porcelain');
    assert.equal(capture(args).saved, true);
    assert.equal(g('status', '--porcelain'), before, 'capture must not change the index');
    assert(!fs.readFileSync(path.join(output, 'work.patch'), 'utf8').includes('sentinel'));
    // Exercise the workflow CLI from this trusted checkout against a separate
    // failed workspace and a local origin, without any external API calls.
    const remote = path.join(dir, 'origin.git'), cliOutput = path.join(dir, 'cli-artifact');
    git(dir, ['init', '--bare', '-q', remote]); g('remote', 'add', 'origin', remote);
    g('push', '-q', 'origin', `${fork}:refs/heads/main`);
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
    g('checkout', '-qb', `claude/obsidian-auto-${day}`); g('push', '-qu', 'origin', 'HEAD');
    g('fetch', '-q', 'origin', 'main');
    const outFile = path.join(dir, 'github-output');
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--save', cliOutput, '--workspace', cwd],
      { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, GITHUB_REPOSITORY: 'simplememofast/simplememo',
        GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_OUTPUT: outFile } });
    assert.equal(fs.readFileSync(outFile, 'utf8').trim(), 'saved=true');
    assert.throws(() => restore({ cwd, directory: output }), /clean tree/);
    g('reset', '--hard', base); g('clean', '-fdq');
    const cliRestored = JSON.parse(execFileSync(process.execPath,
      [fileURLToPath(import.meta.url), '--restore', cliOutput, '--workspace', cwd], { encoding: 'utf8', stdio: 'pipe' }));
    assert.deepEqual(cliRestored.restored.sort(), ['assets/test.png', 'index.html']);
    assert.equal(fs.readFileSync(path.join(cwd, 'index.html'), 'utf8'), '<title>After</title>\n');
    assert.deepEqual(fs.readFileSync(path.join(cwd, 'assets/test.png')), Buffer.from([137, 80, 78, 71, 0, 1]));
    g('reset', '--hard', base); g('clean', '-fdq');
    g('commit', '--allow-empty', '-qm', 'different head');
    assert.throws(() => restore({ cwd, directory: output }), /recorded commit/);
    g('reset', '--hard', base);
    fs.appendFileSync(path.join(output, 'work.patch'), 'damage');
    assert.throws(() => restore({ cwd, directory: output }), /damaged/);
    const replacePatch = patch => {
      const meta = JSON.parse(fs.readFileSync(path.join(output, 'checkpoint.json')));
      fs.writeFileSync(path.join(output, 'work.patch'), patch); meta.patch_hash = sha(patch);
      fs.writeFileSync(path.join(output, 'checkpoint.json'), JSON.stringify(meta));
    };
    put('.env', 'injected private file'); g('add', '.env');
    replacePatch(g('diff', '--cached', '--binary', '--full-index', 'HEAD') + '\n');
    g('reset', '--hard', base); g('clean', '-fdq');
    assert.throws(() => restore({ cwd, directory: output }), /undeclared or non-page/);
    fs.mkdirSync(path.join(cwd, 'assets')); g('mv', 'data/value-metrics.json', 'assets/test.png');
    replacePatch(g('diff', '--cached', '--binary', '--full-index', '--find-renames', 'HEAD') + '\n');
    g('reset', '--hard', base); g('clean', '-fdq');
    assert.throws(() => restore({ cwd, directory: output }), /rename\/copy/);
    fs.mkdirSync(path.join(cwd, 'assets')); fs.symlinkSync('/nonexistent-private-target', path.join(cwd, 'assets/test.png'));
    assert.throws(() => capture(args), /symlinks/);
    g('add', 'assets/test.png'); replacePatch(g('diff', '--cached', '--binary', '--full-index', 'HEAD') + '\n');
    g('reset', '--hard', base); g('clean', '-fdq');
    assert.throws(() => restore({ cwd, directory: output }), /symlink/);
    assert.throws(() => capture({ ...args, fork: base }), /one committed declaration/);
    assert.throws(() => capture({ ...args, output: path.join(cwd, 'artifact') }), /outside repository/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const source = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  checkWiring(source);
  assert.throws(() => checkWiring(source.replace('checkpoint-tools/scripts/autopilot-checkpoint.mjs', 'checkpoint-tools/scripts/unused.mjs')));
  console.log('checkpoint: real Git capture/restore, new binary assets, private-file exclusion, dirty tree, integrity and failure wiring passed');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  if (args.includes('--check')) { checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8')); return; }
  const cwd = args.includes('--workspace') ? path.resolve(args[args.indexOf('--workspace') + 1]) : ROOT;
  if (args.includes('--restore')) { console.log(JSON.stringify(restore({ cwd, directory: path.resolve(args[args.indexOf('--restore') + 1]) }))); return; }
  assert(args.includes('--save'), '--save or --restore required');
  assert.equal(process.env.GITHUB_REPOSITORY, 'simplememofast/simplememo', 'expected workflow repository required');
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
  const branch = `claude/obsidian-auto-${today}`, upstream = `refs/remotes/origin/${branch}`;
  assert.equal(git(cwd, ['branch', '--show-current']).trim(), branch, 'model did not leave the expected work branch');
  git(cwd, ['fetch', '--no-tags', 'origin', `refs/heads/${branch}:${upstream}`]);
  const base = rev(cwd, upstream), fork = git(cwd, ['merge-base', 'origin/main', base]).trim();
  const result = capture({ cwd, fork, base, output: path.resolve(args[args.indexOf('--save') + 1]),
    runId: process.env.GITHUB_RUN_ID, attempt: Number(process.env.GITHUB_RUN_ATTEMPT) });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `saved=${result.saved}\n`);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
