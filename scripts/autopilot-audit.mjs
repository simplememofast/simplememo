#!/usr/bin/env node
// Post-model audit: after the model stops, trusted tools compare the day's declaration
// with what the model left behind (committed, uncommitted and untracked work). The
// model is asked to run `decision-ci --verify-local` itself (prompt 4-1); this runs
// whether or not it did. 2026-10-06 ended with subtype=success, no PR and an empty
// workspace record; nobody could say what had been changed.
//
// Diagnostic only, never a gate: it does not change the execution verdict.
// What leaves the runner (public artifact): finite codes, counts, and repository paths
// that already exist on main (their names are public anyway). A new path is reported
// only as a count under its nearest directory that exists on main. File contents,
// commit messages, exception text and the names of new files never leave.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyLocal } from './decision-ci.mjs';
import { historyBookkeeping } from './value-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LIST = 50;
export const VERDICTS = ['clean', 'problems', 'not_on_day_branch', 'unavailable'];
// verifyLocal's problem messages, in its own order, mapped to finite codes.
const PROBLEMS = [
  ['autonomous decision cannot change its gate or policy', 'protected_path'],
  ['declaration not committed and pushed first', 'declaration_uncommitted'],
  ['more than one live declaration', 'multiple_declarations'],
  ['undeclared path', 'undeclared_committed'],
  ['implementation preceded declaration', 'implementation_before_declaration'],
  ['intent was not added before implementation', 'intent_not_added_first'],
  ['actual diff exceeds declared budget', 'budget_exceeded'],
  ['actual binary diff exceeds declared budget', 'budget_exceeded'],
  ['intent is immutable', 'intent_mutated'],
  ['intent changed after declaration', 'intent_mutated'],
  ['uncommitted changes outside the declaration', 'uncommitted_outside'],
  ['untracked files outside the declaration', 'untracked_outside'],
  ['a prospective contract is required', 'contract_required'],
];
export const CODES = [...new Set(PROBLEMS.map(([, code]) => code)), 'other'];
export const classify = problem => PROBLEMS.find(([prefix]) => String(problem).startsWith(prefix))?.[1] ?? 'other';

// The model controlled this repository's .git/config. Command-line style config wins
// over it, so a planted core.fsmonitor command cannot run when trusted code reads the tree.
export function hardenedEnv(env = process.env) {
  const n = /^\d+$/.test(env.GIT_CONFIG_COUNT ?? '') ? Number(env.GIT_CONFIG_COUNT) : 0;
  return { ...env, GIT_CONFIG_COUNT: String(n + 1), [`GIT_CONFIG_KEY_${n}`]: 'core.fsmonitor',
    [`GIT_CONFIG_VALUE_${n}`]: 'false', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
}

const lines = text => text.split('\n').filter(Boolean);

// verifyLocal runs its own git with process.env, so the CLI hardens process.env itself.
export function audit({ cwd, day, baseRef = 'origin/main', verify = verifyLocal, env = hardenedEnv() }) {
  // stderr is piped and dropped: git warnings name paths (e.g. CRLF on a new file) and the job log is public.
  const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.match(String(day), /^\d{4}-\d{2}-\d{2}$/, 'day required');
  const expected = `claude/obsidian-auto-${day.replaceAll('-', '')}`;
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const head = git('rev-parse', 'HEAD');
  const base = git('merge-base', baseRef, head);
  const tracking = (() => {
    try { return git('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${expected}`); } catch { return null; }
  })();
  const committed = lines(git('diff', '--name-only', '--no-renames', base, head));
  const uncommitted = lines(git('diff', '--name-only', '--no-renames', 'HEAD'));
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'));
  const intents = committed.filter(p => /^data\/decision-intents\/[a-z0-9-]+\.json$/.test(p));
  // Paths outside the one live declaration, counted as the CI gate counts them: commits after the
  // declaration (verifyHistory checks added..head), plus uncommitted and untracked work; declarations,
  // retirements and the gate's bookkeeping set are not outside.
  let outside = null;
  if (intents.length === 1) {
    const touches = JSON.parse(git('show', `${head}:${intents[0]}`)).touches;
    const added = lines(git('log', '--format=%H', '--diff-filter=A', `${base}..${head}`, '--', intents[0])).at(-1);
    const allowed = historyBookkeeping(base, git, head);
    if (Array.isArray(touches) && added) {
      const after = lines(git('diff', '--name-only', '--no-renames', added, head));
      outside = [...new Set([...after, ...uncommitted, ...untracked])]
        .filter(p => !p.startsWith('data/decision-intents/') && !p.startsWith('data/decision-rejections/')
          && !touches.includes(p) && !allowed.has(p));
    }
  }
  const problems = verify({ cwd, baseRef }).problems;
  const codes = [...new Set(problems.map(classify))].sort();
  // Public names only: files on main and their directories.
  const onMain = new Set(lines(git('ls-tree', '-r', '--name-only', base)));
  const dirs = new Set([...onMain].flatMap(p => p.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))));
  const known = list => list.filter(p => onMain.has(p)).sort().slice(0, MAX_LIST);
  const newUnder = {};
  for (const p of new Set([...committed, ...uncommitted, ...untracked])) {
    if (onMain.has(p)) continue;
    const parts = p.split('/').slice(0, -1);
    while (parts.length && !dirs.has(parts.join('/'))) parts.pop();
    const where = parts.length ? parts.join('/') : '.';
    newUnder[where] = (newUnder[where] ?? 0) + 1;
  }
  const report = {
    schema_version: 1,
    verdict: branch !== expected ? 'not_on_day_branch' : codes.length ? 'problems' : 'clean',
    codes,
    on_day_branch: branch === expected,
    head_pushed: tracking === null ? null : tracking === head,
    commits_ahead: Number(git('rev-list', '--count', `${base}..${head}`)),
    declaration_count: intents.length,
    counts: { committed: committed.length, uncommitted: uncommitted.length, untracked: untracked.length,
      outside_declaration: outside === null ? null : outside.length },
    paths_on_main: { committed: known(committed), uncommitted: known(uncommitted),
      outside_declaration: outside === null ? null : known(outside) },
    new_paths: { count: Object.values(newUnder).reduce((a, b) => a + b, 0), by_directory_on_main: newUnder },
  };
  return report;
}

export function save(output, { cwd, day, env = process.env }) {
  assert(path.isAbsolute(env.RUNNER_TEMP ?? '') && path.isAbsolute(output), 'absolute temp paths required');
  assert.equal(path.basename(output), 'autopilot-audit');
  assert.equal(fs.realpathSync(path.dirname(output)), fs.realpathSync(env.RUNNER_TEMP));
  let report;
  try { report = audit({ cwd, day }); }
  catch { report = { schema_version: 1, verdict: 'unavailable', codes: [] }; }
  fs.mkdirSync(output, { mode: 0o700 }); // never reuse a directory or upload its prior contents
  fs.writeFileSync(path.join(output, 'audit.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return report;
}

export function checkWiring(source) {
  const step = source.split('      - name: Audit the declaration against the work after the model\n')[1]?.split('\n      - name:')[0];
  assert(step, 'post-model audit must be wired');
  assert.match(step, /(^|\n)        id: audit\n/);
  assert.match(step, /!cancelled\(\) &&\s+\(steps\.claude\.outcome == 'success' \|\| steps\.claude\.outcome == 'failure'\)/);
  assert.match(step, /\n        continue-on-error: true\n/, 'the audit must not change the execution verdict');
  // Adding the worktree checks files out: a planted post-checkout hook or fsmonitor must not run.
  assert.match(step, /git -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false worktree add --detach "\$RUNNER_TEMP\/audit-tools" "\$GITHUB_SHA"/,
    'tools must come from the workflow commit, without the model\'s hooks');
  // stderr dropped: verifyLocal's git (decision-ci) inherits it, and git warnings can name new files.
  assert.match(step, /node "\$RUNNER_TEMP\/audit-tools\/scripts\/autopilot-audit.mjs" --save "\$RUNNER_TEMP\/autopilot-audit" --workspace "\$GITHUB_WORKSPACE" 2>\/dev\/null\n/,
    'the audit must not write git warnings (they can name new files) to the public log');
  assert.doesNotMatch(step, /secrets\./, 'the audit needs no credential');
  const upload = source.split('      - name: Upload the post-model audit\n')[1]?.split('\n      - name:')[0];
  assert(upload, 'audit upload must be wired');
  assert.match(upload, /if: always\(\) && steps.audit.outputs.saved == 'true'/);
  assert.match(upload, /\n        continue-on-error: true\n/);
  assert.match(upload, /uses: actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(upload, /path: \$\{\{ runner.temp \}\}\/autopilot-audit\n/);
  assert.match(upload, /retention-days: 7\n/);
  // The audit runs before checkpoint/diagnostics touch the workspace's git state.
  assert(source.indexOf('Audit the declaration against the work after the model') < source.indexOf('Preserve declared page work after model or output failure'),
    'audit must read the workspace before the checkpoint fetches into it');
}

export function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-audit-'));
  const env = hardenedEnv({ ...process.env, GIT_CONFIG_NOSYSTEM: '1', HOME: dir });
  const g = (...a) => execFileSync('git', a, { cwd: dir, env, encoding: 'utf8' }).trim();
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
  let passed = 0;
  const check = (cond, msg) => { assert(cond, msg); passed++; };
  try {
    g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@example.com'); g('config', 'user.name', 't');
    write('index.html', 'a\n'); write('assets/img/og/old.png', 'x'); write('data/autopilot-runs.json', '{"runs":[]}\n');
    write('data/autopilot-status.json', '{}\n'); write('autopilot/index.html', 'r\n');
    g('add', '.'); g('commit', '-qm', 'base'); g('update-ref', 'refs/remotes/origin/main', 'HEAD');
    g('checkout', '-qb', 'claude/obsidian-auto-20261015');
    // Retire-then-redeclare: a rejection record and the declaration itself are never outside.
    write('data/decision-rejections/old.json', '{}\n'); g('add', '.'); g('commit', '-qm', 'retire');
    write('data/decision-intents/x.json', JSON.stringify({ touches: ['index.html'] }, null, 2));
    g('add', '.'); g('commit', '-qm', 'declare');
    write('index.html', 'b\n'); write('data/autopilot-runs.json', '{"runs":[1]}\n');
    write('assets/img/og/secret-name-AKIA0000.png', 'y'); write('brand-new-dir/deep/leak-name.txt', 'z');
    g('add', '.'); g('commit', '-qm', 'work'); g('update-ref', 'refs/remotes/origin/claude/obsidian-auto-20261015', 'HEAD');
    write('autopilot/index.html', 'edited\n'); write('untracked-leak-name.md', 'u');
    // A planted fsmonitor hook must never run inside the trusted audit.
    const marker = path.join(dir, 'fsmonitor-ran');
    write('hook.sh', `#!/bin/sh\ntouch "${marker}"\n`); fs.chmodSync(path.join(dir, 'hook.sh'), 0o755);
    execFileSync('git', ['config', 'core.fsmonitor', path.join(dir, 'hook.sh')], { cwd: dir });
    // Control: without the hardening the planted hook does run.
    execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: dir, env: { ...process.env, HOME: dir } });
    check(fs.existsSync(marker), 'control: the planted fsmonitor hook should fire without hardening');
    fs.rmSync(marker);
    const fake = { problems: ['undeclared path: assets/img/og/secret-name-AKIA0000.png, brand-new-dir/deep/leak-name.txt',
      'untracked files outside the declaration (fail once added): untracked-leak-name.md, hook.sh', 'something new'] };
    const report = audit({ cwd: dir, day: '2026-10-15', verify: () => fake, env });
    check(!fs.existsSync(marker), 'a model-planted core.fsmonitor ran during the audit');
    check(report.verdict === 'problems' && JSON.stringify(report.codes) === JSON.stringify(['other', 'undeclared_committed', 'untracked_outside']),
      `codes: ${JSON.stringify(report.codes)}`);
    check(report.on_day_branch === true && report.head_pushed === true && report.commits_ahead === 3 && report.declaration_count === 1, 'branch facts');
    check(report.counts.committed === 6 && report.counts.uncommitted === 1 && report.counts.untracked === 2, `counts ${JSON.stringify(report.counts)}`);
    // index.html is declared; data/autopilot-runs.json and autopilot/index.html are bookkeeping.
    check(report.counts.outside_declaration === 4, `outside ${report.counts.outside_declaration}`);
    check(JSON.stringify(report.paths_on_main.committed) === JSON.stringify(['data/autopilot-runs.json', 'index.html']), 'known committed names');
    check(JSON.stringify(report.paths_on_main.outside_declaration) === JSON.stringify([]), 'new names must not appear as known');
    // The new declaration counts under data/ by name-free count, like every other new path.
    check(report.new_paths.count === 6 && report.new_paths.by_directory_on_main['assets/img/og'] === 1
      && report.new_paths.by_directory_on_main.data === 2 && report.new_paths.by_directory_on_main['.'] === 3,
    `new paths ${JSON.stringify(report.new_paths)}`);
    const text = JSON.stringify(report);
    for (const leak of ['AKIA0000', 'leak-name', 'brand-new-dir', 'hook.sh', 'something new', 'x.json', 'old.json'])
      check(!text.includes(leak), `a new name or free text left the runner: ${leak}`);
    // Not on the day branch, and no push.
    g('checkout', '-q', '-b', 'claude/other');
    const away = audit({ cwd: dir, day: '2026-10-15', verify: () => ({ problems: [] }), env });
    check(away.verdict === 'not_on_day_branch' && away.on_day_branch === false, 'off-branch verdict');
    g('checkout', '-q', 'claude/obsidian-auto-20261015'); g('update-ref', '-d', 'refs/remotes/origin/claude/obsidian-auto-20261015');
    check(audit({ cwd: dir, day: '2026-10-15', verify: () => ({ problems: [] }), env }).head_pushed === null, 'no tracking ref is unknown, not false');
    check(audit({ cwd: dir, day: '2026-10-15', verify: () => ({ problems: [] }), env }).verdict === 'clean', 'clean verdict');
    // The real verifier runs end to end, under the CLI's process-wide hardening.
    const saved = { ...process.env };
    Object.assign(process.env, hardenedEnv(process.env), { HOME: dir });
    try { check(Array.isArray(audit({ cwd: dir, day: '2026-10-15', env }).codes), 'real verifyLocal'); }
    finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
    check(!fs.existsSync(marker), 'the real verifier ran a planted fsmonitor hook');
    for (const problem of PROBLEMS) check(classify(`${problem[0]}: x`) === problem[1], `classify ${problem[0]}`);
    check(classify('anything else') === 'other' && CODES.includes('other'), 'unknown problems are other');
    const hardened = hardenedEnv({ GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'a', GIT_CONFIG_VALUE_0: 'b' });
    check(hardened.GIT_CONFIG_COUNT === '3' && hardened.GIT_CONFIG_KEY_2 === 'core.fsmonitor' && hardened.GIT_CONFIG_KEY_0 === 'a',
      'hardening appends to existing command-line config');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
  const wiring = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  for (const [from, to, label] of [["        id: audit\n", '', 'id'], ['        continue-on-error: true\n        env:\n          TODAY_DASH', '        env:\n          TODAY_DASH', 'continue-on-error'],
    ['"$RUNNER_TEMP/audit-tools" "$GITHUB_SHA"', '"$RUNNER_TEMP/audit-tools" HEAD', 'trusted commit'],
    ['--workspace "$GITHUB_WORKSPACE" 2>/dev/null', '--workspace "$GITHUB_WORKSPACE"', 'stderr kept']]) {
    assert.throws(() => checkWiring(wiring.replace(from, to)), undefined, `wiring check missed ${label}`);
    passed++;
  }
  console.log(`audit: ${passed} checks passed (fsmonitor hardening, public names only, codes, wiring)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  if (args.includes('--check')) return checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
  assert(args.includes('--save') && args.includes('--workspace'), '--save <dir> --workspace <repo> required');
  const day = process.env.TODAY_DASH;
  Object.assign(process.env, hardenedEnv(process.env));
  const report = save(path.resolve(args[args.indexOf('--save') + 1]),
    { cwd: path.resolve(args[args.indexOf('--workspace') + 1]), day });
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `saved=true\nverdict=${report.verdict}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### モデル後の照合\n\n- 判定: \`${report.verdict}\`\n`
      + `- 理由のコード: ${report.codes.length ? report.codes.map(c => `\`${c}\``).join(' ') : 'なし'}\n`);
  }
  console.log(`Post-model audit saved: ${report.verdict}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    if (process.argv.includes('--selftest') || process.argv.includes('--check')) { console.error(error.stack); process.exitCode = 1; return; }
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'saved=false\nverdict=unavailable\n');
    console.error('Post-model audit unavailable; the execution verdict is unchanged.');
    process.exitCode = 1;
  });
}
