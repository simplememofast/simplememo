// node --test scripts/autopilot-publish.test.mjs
// Real git, a local bare repository as the remote, no network and no credential.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pack, verifyHandoff, pushBranch, record, validateRequest, prPayload, openPr, checkWiring, gitEnv,
  PublishError, RECORD_IDENTITY, MAX_REPAIR_TARGETS, handoffFileState, MAIN_EXECUTION_COPY,
  recordStepDiagnostic, defaultRunner } from './autopilot-publish.mjs';
import { save as saveDiagnostics } from './autopilot-diagnostics.mjs';
import { classifyAutopilotChange, hardDenyReason, isAutopilotBranch, RECORD_PATHS } from './lib/autopilot-paths.mjs';
import { validate as validateRuns } from './autopilot-runs.mjs';

process.env.GIT_CONFIG_GLOBAL = '/dev/null'; // the developer's global git config must not shape the result
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = '20261020';
const BRANCH = `claude/obsidian-auto-${DAY}`;
const BOT = { name: 'claude[bot]', email: '41898282+claude[bot]@users.noreply.github.com' };
const TOKEN = 'ghp_TEST_SENTINEL_TOKEN_never_on_disk';

function sh(cwd, args, who = BOT, extra = {}) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: who.name, GIT_AUTHOR_EMAIL: who.email,
      GIT_COMMITTER_NAME: who.name, GIT_COMMITTER_EMAIL: who.email, ...extra } }).trim();
}

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

const request = (extra = {}) => ({ action: 'pr', title: '記事: Obsidian の新しい比較', body: '本文',
  run: { run_id: `ap-${DAY}-actions-123`, outcome: 'shipped', lane: 'A', action: 'new-article', artifact: '/obsidian/x/' }, ...extra });
// 2026-10-26 (run 40249667656, PR #2168): a maintenance day's run.artifact, a description instead of a site path.
const DESCRIBED = 'growth/experiments/experiments.json: gsc-obsidian-install-20260922-r2 evaluated as inconclusive';

// A failure already on main, as Act's reconcile writes it (valid under autopilot-runs.mjs validate()).
const failedRow = (run_id, date_jst = '2026-10-19') => ({ run_id, date_jst, route: 'actions', attempted: true, outcome: 'failed',
  failure_reason: 'CI red', failure_class: 'ci_red', failure_stage: 'execution', external_ref: '77', interventions: [], source: 'test' });
// The real ledger CLI and what it imports, so record() appends with the repository's own rules.
const RUNS_CLI = ['scripts/autopilot-runs.mjs', 'scripts/lib/read-ledger.mjs', 'scripts/lib/autopilot-gate-codes.mjs',
  'scripts/lib/intervention-observation.mjs'];

/** origin (bare) + model workspace + trusted tools clone, all under one temp directory. */
function fixture({ stopped = false, statusDate = '2026-10-19', runs = [], trustedFiles = [] } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-publish-')));
  const origin = path.join(root, 'origin.git');
  const seed = path.join(root, 'seed');
  sh(root, ['init', '-q', '--bare', '-b', 'main', origin]);
  sh(root, ['init', '-q', '-b', 'main', seed]);
  write(seed, 'data/emergency-stop.json', JSON.stringify({ stopped, agents: { actions: { stopped: false } } }));
  write(seed, 'data/autopilot-status.json', JSON.stringify({ date_jst: statusDate }));
  write(seed, 'data/autopilot-runs.json', JSON.stringify({ runs }, null, 2) + '\n');
  write(seed, 'obsidian/index.html', '<p>hub</p>\n');
  write(seed, 'scripts/trusted-marker.txt', 'trusted\n');
  for (const file of trustedFiles) write(seed, file, fs.readFileSync(path.join(ROOT, file)));
  sh(seed, ['add', '-A']); sh(seed, ['commit', '-q', '-m', 'base'], { name: 'SimpleMemo Developer', email: 'simplememo.com@gmail.com' });
  sh(seed, ['push', '-q', origin, 'main']);
  const work = path.join(root, 'work');
  const tools = path.join(root, 'tools');
  sh(root, ['clone', '-q', origin, work]);
  sh(root, ['clone', '-q', origin, tools]);
  sh(work, ['checkout', '-q', '-b', BRANCH]);
  const temp = path.join(root, 'runner-temp');
  fs.mkdirSync(temp);
  return { root, origin, work, tools, temp, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function commitPage(f, who = BOT, message = 'feat: page', file = 'obsidian/new/index.html', text = '<p>new</p>\n') {
  write(f.work, file, text);
  sh(f.work, ['add', '-A']); sh(f.work, ['commit', '-q', '-m', message], who);
}

async function handoff(f, { req = request(), takeover = false, outcome = 'success', listPrs = async () => [], force = false } = {}) {
  if (req) fs.writeFileSync(path.join(f.temp, 'autopilot-pr-request.json'), JSON.stringify(req));
  const out = path.join(f.temp, `handoff-${Math.random().toString(36).slice(2)}`);
  pack({ workspace: f.work, out, day: DAY, takeover, runnerTemp: f.temp });
  return verifyHandoff({ handoff: out, repo: f.tools, day: DAY, takeover, force, modelOutcome: outcome, remote: f.origin, listPrs })
    .then(result => ({ ...result, out }));
}

async function verdictOf(f, options) {
  try { return (await handoff(f, options)).verdict; } catch (error) {
    if (error instanceof PublishError) return error.code;
    throw error;
  }
}

test('path classes', () => {
  assert.equal(isAutopilotBranch(BRANCH), true);
  assert.equal(isAutopilotBranch('claude/obsidian-auto-2026102'), false);
  for (const [file, opts, code] of [['.github/workflows/a.yml', {}, 'denied_github'], ['x/.git/hooks/pre-commit', {}, 'denied_segment'],
    ['node_modules/a.js', {}, 'denied_segment'], ['.gitattributes', {}, 'denied_root_file'], ['a/.env.local', {}, 'denied_secret_file'],
    ['deploy.pem', {}, 'denied_secret_file'], ['growth/data/gsc/2026-10-20/q.json', { gscDay: '2026-10-20' }, 'denied_live_gsc'],
    ['a', { mode: '120000' }, 'denied_symlink'], ['a', { mode: '160000' }, 'denied_gitlink'],
    ['a', { size: 5 * 1024 * 1024 + 1 }, 'denied_size'], ['a/../b', {}, 'invalid_path'], ['a\nb', {}, 'invalid_path']]) {
    assert.equal(hardDenyReason(file, opts), code, file);
  }
  assert.equal(hardDenyReason('obsidian/index.html', { mode: '100644', size: 100 }), null);
  assert.deepEqual(classifyAutopilotChange(['data/autopilot-status.json', 'ko/autopilot/index.html']), { class: 'ledger', reasons: [] });
  assert.equal(classifyAutopilotChange([{ path: 'data/decision-intents/x.json', status: 'A' }]).class, 'ledger');
  assert.equal(classifyAutopilotChange([{ path: 'data/decision-intents/x.json', status: 'M' }]).class, 'approval');
  assert.equal(classifyAutopilotChange(['obsidian/index.html']).class, 'approval');
});

test('request schema', () => {
  assert.equal(validateRequest(request(), DAY).request.action, 'pr');
  for (const [raw, code] of [[null, 'request_shape'], [{ action: 'merge' }, 'request_action'], [request({ title: '' }), 'request_title'],
    [request({ title: 'x'.repeat(201) }), 'request_title'], [request({ title: 'a\rb' }), 'request_title'],
    [request({ body: 'x'.repeat(30_001) }), 'request_body'], [request({ labels: ['automerge'] }), 'request_unknown_field'],
    [request({ run: { ...request().run, run_id: 'ap-20261019-actions' } }), 'request_run_id'],
    [request({ run: { ...request().run, outcome: 'skipped_gate' } }), 'request_outcome'],
    [request({ run: { ...request().run, lane: 'Z' } }), 'request_lane'],
    [request({ run: { ...request().run, pr: 1 } }), 'request_run_unknown_field']]) {
    assert.equal(validateRequest(raw, DAY).code, code, code);
  }
  assert.deepEqual(validateRequest({ action: 'none' }, DAY).request, { action: 'none' });
  // A day that did not ship names why and what kind, as the ledger and selfheal --check require.
  const noShip = (extra = {}) => request({ run: { run_id: `ap-${DAY}-actions-123`, outcome: 'no_artifact', lane: 'E', action: 'skip',
    failure_reason: '基準を満たす候補が無かった', failure_class: 'no_artifact', ...extra } });
  assert.equal(validateRequest(noShip(), DAY).request.run.failure_class, 'no_artifact');
  assert.equal(validateRequest(noShip({ failure_class: 'runner-timeout' }), DAY).request.run.failure_class, 'runner-timeout',
    'the ledger vocabulary includes hyphenated classes');
  for (const [extra, code] of [[{ failure_reason: undefined }, 'request_failure_reason'], [{ failure_reason: null }, 'request_failure_reason'],
    [{ failure_reason: '' }, 'request_failure_reason'], [{ failure_class: undefined }, 'request_failure_class'],
    [{ failure_class: null }, 'request_failure_class'], [{ failure_class: 'No Artifact' }, 'request_failure_class'],
    [{ failure_class: '-x' }, 'request_failure_class'], [{ outcome: 'failed', failure_class: undefined }, 'request_failure_class']]) {
    assert.equal(validateRequest(noShip(extra), DAY).code, code, JSON.stringify(extra));
  }
  assert.equal(validateRequest(request(), DAY).request.run.failure_class, undefined, 'a shipped day needs neither');
  // Lane F: repair_of is an array of run_ids, never the run's own id.
  const repair = repair_of => request({ run: { ...request().run, lane: 'F', action: 'maintenance', repair_of } });
  const targets = ['ap-20261019-actions-77', 'sm-20260905-queue-collision'];
  assert.deepEqual(validateRequest(repair(targets), DAY).request.run.repair_of, targets);
  assert.equal(validateRequest(repair(null), DAY).request.run.repair_of, undefined, 'null is the same as absent');
  for (const [value, code] of [['ap-20261019-actions-77', 'request_repair_of'], [[], 'request_repair_of'], [[7], 'request_repair_of'],
    [['ap x'], 'request_repair_of'], [['../ap'], 'request_repair_of'], [['ap-1', 'ap-1'], 'request_repair_of'], [[{}], 'request_repair_of'],
    [Array.from({ length: MAX_REPAIR_TARGETS + 1 }, (_, i) => `ap-${i}`), 'request_repair_of'],
    [[`ap-${DAY}-actions-123`], 'request_repair_of_self']]) {
    assert.equal(validateRequest(repair(value), DAY).code, code, JSON.stringify(value));
  }
  // run.artifact is checked for shape only: what it names decides the ledger row in record(), not the day.
  const described = request({ run: { ...request().run, action: 'maintenance', artifact: DESCRIBED } });
  assert.equal(validateRequest(described, DAY).request?.run.artifact, DESCRIBED, 'a described artifact does not refuse the day');
  const payload = prPayload(validateRequest(request({ body: 'a\u0000b‮c' }), DAY).request, DAY);
  assert.equal(payload.body, 'abc', 'the PR body is the request body, nothing appended');
  assert.equal(payload.head, BRANCH); assert.equal(payload.base, 'main');
});

test('a valid handoff is published by a plain fast-forward push; the token never touches disk or output', async () => {
  const f = fixture();
  try {
    commitPage(f);
    const result = await handoff(f);
    assert.equal(result.verdict, 'publish');
    assert.equal(result.commit_count, 1);
    assert.equal(result.head, sh(f.work, ['rev-parse', 'HEAD']));
    assert.equal(pushBranch({ repo: f.tools, sha: result.head, day: DAY, token: TOKEN, remote: f.origin }), true);
    assert.equal(sh(f.origin, ['rev-parse', `refs/heads/${BRANCH}`]), result.head);
    for (const dir of [f.tools, f.origin]) {
      const config = fs.readFileSync(path.join(dir, dir === f.origin ? 'config' : '.git/config'), 'utf8');
      assert(!config.includes(TOKEN) && !config.includes(Buffer.from(`x-access-token:${TOKEN}`).toString('base64')));
    }
    // A credential-bearing git ignores global config (no planted url.insteadOf / http.proxy).
    assert.equal(gitEnv(TOKEN, { HOME: '/home/runner' }).GIT_CONFIG_GLOBAL, '/dev/null');
    assert.equal(gitEnv(null, { HOME: '/home/runner' }).GIT_CONFIG_GLOBAL, undefined);
    // A non-fast-forward update is refused, never forced.
    sh(f.work, ['commit', '-q', '--amend', '-m', 'rewritten']);
    const other = sh(f.work, ['rev-parse', 'HEAD']);
    const again = await handoff(f, { takeover: true });
    assert.equal(again.verdict, 'duplicate');
    sh(f.tools, ['fetch', '-q', path.join(again.out, 'work.bundle'), `refs/autopilot/handoff:refs/test/other`]);
    assert.equal(pushBranch({ repo: f.tools, sha: other, day: DAY, token: TOKEN, remote: f.origin }), false);
    assert.equal(sh(f.origin, ['rev-parse', `refs/heads/${BRANCH}`]), result.head);
    const source = fs.readFileSync(path.join(ROOT, 'scripts/autopilot-publish.mjs'), 'utf8');
    const code = source.split('export function pushBranch')[1].split('\n}\n')[0].split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    assert.doesNotMatch(code, /--force|\+\$\{|force-with-lease/);
  } finally { f.cleanup(); }
});

test('forbidden identities are never published', async () => {
  for (const [who, message] of [[{ name: 'Real Person', email: 'person@example.com' }, 'feat'],
    [BOT, 'feat\n\nCo-authored-by: Real Person <person@example.com>']]) {
    const f = fixture();
    try { commitPage(f, who, message); assert.equal(await verdictOf(f), 'rejected_identity'); } finally { f.cleanup(); }
  }
  const f = fixture();
  try { // forged committer only
    write(f.work, 'obsidian/a.html', 'a');
    sh(f.work, ['add', '-A']);
    sh(f.work, ['commit', '-q', '-m', 'x'], BOT, { GIT_COMMITTER_NAME: 'Someone', GIT_COMMITTER_EMAIL: 'someone@example.com' });
    assert.equal(await verdictOf(f), 'rejected_identity');
  } finally { f.cleanup(); }
});

test('denied paths, modes and sizes are refused in any commit', async () => {
  const cases = [
    ['workflow', f => commitPage(f, BOT, 'x', '.github/workflows/evil.yml', 'on: push'), 'rejected_denied_github'],
    ['added then removed', f => { commitPage(f, BOT, 'x', '.github/workflows/evil.yml', 'on: push');
      sh(f.work, ['rm', '-q', '.github/workflows/evil.yml']); sh(f.work, ['commit', '-q', '-m', 'rm']); }, 'rejected_denied_github'],
    ['symlink', f => { fs.symlinkSync('/etc/passwd', path.join(f.work, 'obsidian/link')); sh(f.work, ['add', '-A']);
      sh(f.work, ['commit', '-q', '-m', 'x']); }, 'rejected_denied_symlink'],
    ['gitlink', f => { sh(f.work, ['update-index', '--add', '--cacheinfo', `160000,${sh(f.work, ['rev-parse', 'HEAD'])},vendor`]);
      sh(f.work, ['commit', '-q', '-m', 'x']); }, 'rejected_denied_gitlink'],
    ['oversize', f => commitPage(f, BOT, 'x', 'obsidian/big.bin', Buffer.alloc(5 * 1024 * 1024 + 1)), 'rejected_denied_size'],
    ['dependency tree', f => commitPage(f, BOT, 'x', 'site/node_modules/evil.js', 'x'), 'rejected_denied_segment'],
    ['root package manifest', f => commitPage(f, BOT, 'x', 'package.json', '{"type":"module"}'), 'rejected_denied_root_file'],
  ];
  for (const [name, mutate, code] of cases) {
    const f = fixture();
    try { mutate(f); assert.equal(await verdictOf(f), code, name); } finally { f.cleanup(); }
  }
});

test('history, bundle and request tampering is refused', async () => {
  let f = fixture();
  try { // unrelated history: an orphan commit has no base on main
    sh(f.work, ['checkout', '-q', '--orphan', 'orphan']); commitPage(f);
    const out = path.join(f.temp, 'h');
    fs.mkdirSync(out);
    sh(f.work, ['update-ref', 'refs/autopilot/handoff', 'HEAD']);
    sh(f.work, ['bundle', 'create', '-q', path.join(out, 'work.bundle'), 'refs/autopilot/handoff']);
    fs.writeFileSync(path.join(out, 'manifest.json'), '{}');
    fs.writeFileSync(path.join(out, 'request.json'), JSON.stringify(request()));
    await assert.rejects(verifyHandoff({ handoff: out, repo: f.tools, day: DAY, modelOutcome: 'success', remote: f.origin, listPrs: async () => [] }),
      error => error.code === 'rejected_unrelated_history');
  } finally { f.cleanup(); }
  f = fixture();
  try { // two heads in one bundle
    commitPage(f);
    sh(f.work, ['update-ref', 'refs/autopilot/handoff', 'HEAD']);
    const out = path.join(f.temp, 'h');
    fs.mkdirSync(out);
    sh(f.work, ['bundle', 'create', '-q', path.join(out, 'work.bundle'), 'refs/autopilot/handoff', BRANCH, '^origin/main']);
    fs.writeFileSync(path.join(out, 'manifest.json'), '{}');
    await assert.rejects(verifyHandoff({ handoff: out, repo: f.tools, day: DAY, modelOutcome: 'success', remote: f.origin, listPrs: async () => [] }),
      error => error.code === 'rejected_bundle_heads');
    // a corrupted bundle
    fs.writeFileSync(path.join(out, 'work.bundle'), '# v2 git bundle\ngarbage\n');
    await assert.rejects(verifyHandoff({ handoff: out, repo: f.tools, day: DAY, modelOutcome: 'success', remote: f.origin, listPrs: async () => [] }),
      error => /^rejected_bundle_/.test(error.code));
  } finally { f.cleanup(); }
  f = fixture();
  try {
    commitPage(f);
    assert.equal(await verdictOf(f, { req: request({ title: 'x\ny' }) }), 'rejected_request_title');
    fs.rmSync(path.join(f.temp, 'autopilot-pr-request.json'));
    assert.equal(await verdictOf(f, { req: null }), 'rejected_request_missing');
    // A failed model run still pushes valid committed work, without a PR and without a request.
    assert.equal(await verdictOf(f, { req: null, outcome: 'failure' }), 'push_only');
    assert.equal(await verdictOf(f, { req: { action: 'none' } }), 'none');
    // A non-shipped request without its failure class is refused before anything is pushed.
    const noClass = request({ run: { run_id: `ap-${DAY}-actions-123`, outcome: 'no_artifact', failure_reason: '候補なし' } });
    assert.equal(await verdictOf(f, { req: noClass }), 'rejected_request_failure_class');
    assert.equal(sh(f.origin, ['for-each-ref', '--format=%(refname)', `refs/heads/${BRANCH}`]), '', 'nothing was pushed');
  } finally { f.cleanup(); }
  f = fixture();
  try { // nothing committed
    assert.equal(await verdictOf(f), 'none');
  } finally { f.cleanup(); }
});

test('claim, duplicate and emergency stop are re-checked at publish time', async () => {
  let f = fixture({ stopped: true });
  try { commitPage(f); assert.equal(await verdictOf(f), 'stopped'); } finally { f.cleanup(); }
  f = fixture({ statusDate: '2026-10-20' });
  try {
    commitPage(f);
    assert.equal(await verdictOf(f), 'duplicate', 'main already has today');
    assert.equal(await verdictOf(f, { force: true }), 'publish', 'a forced manual run may overwrite the status');
  } finally { f.cleanup(); }
  f = fixture();
  try {
    commitPage(f);
    assert.equal(await verdictOf(f, { listPrs: async () => [{ number: 7 }] }), 'duplicate', 'a PR for the day exists');
    await assert.rejects(handoff(f, { listPrs: async () => { throw new PublishError('rejected_pr_inventory'); } }));
    // Another route claimed the day meanwhile.
    const claim = path.join(f.root, 'claim');
    sh(f.root, ['clone', '-q', f.origin, claim]);
    sh(claim, ['checkout', '-q', '-b', BRANCH]);
    sh(claim, ['commit', '-q', '--allow-empty', '-m', 'claim']);
    sh(claim, ['push', '-q', 'origin', BRANCH]);
    assert.equal(await verdictOf(f), 'duplicate', 'claimed by another route');
    assert.equal(await verdictOf(f, { takeover: true }), 'duplicate', 'takeover on a base that is not the current claim');
    // A takeover stacked on the current claim is a fast-forward and publishes.
    sh(f.work, ['fetch', '-q', 'origin', BRANCH]);
    sh(f.work, ['checkout', '-q', '-B', BRANCH, `origin/${BRANCH}`]);
    commitPage(f);
    const result = await handoff(f, { takeover: true });
    assert.equal(result.verdict, 'publish');
    assert.equal(pushBranch({ repo: f.tools, sha: result.head, day: DAY, token: TOKEN, remote: f.origin }), true);
  } finally { f.cleanup(); }
});

test('record failures expose typed diagnostics without child output, paths or exception text', () => {
  const secret = 'private-title /private/path ghp_SENTINEL';
  const result = { status: 1, stdout: Buffer.from(secret), stderr: Buffer.from(secret + '\n8 incomplete translations; no HTML written.\n') };
  const diagnostic = recordStepDiagnostic(result);
  assert.equal(diagnostic.incomplete_translations, 8);
  assert.equal(diagnostic.exit_status, 1);
  assert.equal(diagnostic.stdout_bytes, Buffer.byteLength(secret));
  assert.equal(recordStepDiagnostic({ stderr: 'private/path → ko: ja:ed9210ee05e32a3a8155: missing; en:62b2f340ef14cbccff44: stale source' }).reported_missing_units, 1);
  assert.equal(recordStepDiagnostic({ stderr: 'private/path → ko: en:62b2f340ef14cbccff44: stale source' }).reported_stale_units, 1);
  assert(!JSON.stringify(diagnostic).includes(secret));
  for (const code of ['ETIMEDOUT', 'ENOBUFS', 'ENOENT', 'EACCES', secret]) {
    const d = recordStepDiagnostic({ status: null, signal: secret, error: { code, message: secret } });
    assert.equal(d.process_error, code === secret ? 'other' : code);
    assert.equal(d.exit_status, null);
    assert.equal(d.signal, null);
    assert.equal(d.incomplete_translations, null);
    assert(!JSON.stringify(d).includes(secret));
  }
  assert.equal(recordStepDiagnostic({ stderr: '8 incomplete translations; no HTML written.\n9 incomplete translations; no HTML written.\n' }).incomplete_translations, null);
  const messages = [], original = console.error;
  console.error = message => messages.push(message);
  try {
    assert.throws(() => defaultRunner(ROOT, process.execPath, ['-e',
      `process.stdout.write(${JSON.stringify(secret)}); process.stderr.write('8 incomplete translations; no HTML written.\\n'); process.exit(1)`]), PublishError);
  } finally { console.error = original; }
  assert.equal(messages.length, 1);
  assert.equal(JSON.parse(messages[0].split('record step diagnostic: ')[1]).incomplete_translations, 8);
  assert(!messages.join('').includes(secret));
});

test('record runs trusted code over the branch data and commits only record paths', async () => {
  const f = fixture();
  try {
    write(f.work, 'scripts/json.py', 'raise SystemExit("planted")\n');
    write(f.work, 'scripts/trusted-marker.txt', 'model version\n');
    commitPage(f);
    const result = await handoff(f);
    assert.equal(result.verdict, 'publish');
    const calls = [];
    const runner = (cwd, command, args) => {
      calls.push([command, ...args].join(' '));
      // During trusted execution, the overlay has replaced the branch's scripts entirely.
      assert.equal(fs.existsSync(path.join(cwd, 'scripts/json.py')), false);
      assert.equal(fs.readFileSync(path.join(cwd, 'scripts/trusted-marker.txt'), 'utf8'), 'trusted\n');
      if (args.includes('--append')) {
        const runs = JSON.parse(fs.readFileSync(path.join(cwd, 'data/autopilot-runs.json'), 'utf8'));
        runs.runs.push({ run_id: args[args.indexOf('--run-id') + 1], pr: Number(args[args.indexOf('--pr') + 1]) });
        fs.writeFileSync(path.join(cwd, 'data/autopilot-runs.json'), JSON.stringify(runs));
      }
      if (args.includes('--publish-report')) write(cwd, 'autopilot/index.html', '<p>report</p>');
    };
    const work = path.join(f.temp, 'record-work');
    const req = validateRequest(request(), DAY).request;
    const out = record({ repo: f.tools, trusted: f.tools, sha: result.head, day: DAY, pr: 42, request: req, runId: '123', work, runner });
    assert.equal(out.changed, 2);
    assert.deepEqual(calls.map(c => c.split(' ').slice(0, 3).join(' ')), ['node scripts/autopilot-runs.mjs --append',
      'node scripts/autopilot-runs.mjs --write-status', 'node scripts/decision-monitor.mjs --publish-report', 'python3 -E -s', 'python3 -E -s']);
    assert(calls[0].includes('--pr 42') && calls[0].includes('--external-ref 123') && calls[0].includes('--route actions'));
    assert.deepEqual(sh(f.tools, ['diff', '--name-only', result.head, out.sha]).split('\n').sort(), ['autopilot/index.html', 'data/autopilot-runs.json']);
    assert.equal(sh(f.tools, ['log', '-1', '--format=%an <%ae>|%cn <%ce>', out.sha]),
      `${RECORD_IDENTITY.name} <${RECORD_IDENTITY.email}>|${RECORD_IDENTITY.name} <${RECORD_IDENTITY.email}>`);
    // The branch's own files are back; nothing from the overlay is committed.
    assert.equal(sh(f.tools, ['show', `${out.sha}:scripts/trusted-marker.txt`]), 'model version');
    assert.equal(pushBranch({ repo: f.tools, sha: result.head, day: DAY, token: TOKEN, remote: f.origin }), true);
    assert.equal(pushBranch({ repo: f.tools, sha: out.sha, day: DAY, token: TOKEN, remote: f.origin }), true);

    // Only the record paths may change, each still held to the hard-deny rule. A translation of the
    // session's own page that this step would write is refused: the session builds its translations.
    let n = 0;
    for (const [mutate, ok] of [[cwd => write(cwd, '.github/workflows/x.yml', 'on: push'), false],
      [cwd => fs.symlinkSync('/etc/passwd', path.join(cwd, 'ko/link.html')), false],
      [cwd => fs.rmSync(path.join(cwd, 'obsidian/index.html')), false],
      [cwd => write(cwd, 'ko/obsidian/new/index.html', '<p>번역</p>'), false],
      [cwd => write(cwd, 'data/i18n/translations/ko.json', '{}'), false],
      [cwd => { fs.mkdirSync(path.join(cwd, 'ko/autopilot')); fs.symlinkSync('/etc/passwd', path.join(cwd, 'ko/autopilot/index.html')); }, false],
      [cwd => write(cwd, 'ko/autopilot/index.html', '<p>보고서</p>'), true]]) {
      const run = () => record({ repo: f.tools, trusted: f.tools, sha: result.head, day: DAY, pr: 42, request: req, runId: '123',
        work: path.join(f.temp, `record-${n++}`), runner: (cwd, command, args) => {
          if (args.includes('--publish-report')) { fs.mkdirSync(path.join(cwd, 'ko'), { recursive: true }); mutate(cwd); } } });
      if (ok) assert.equal(run().changed, 1); else assert.throws(run, error => error.code === 'record_unexpected_change');
    }
  } finally { f.cleanup(); }
});

test('record refuses a reconciled observation of the same execution under another row ID', () => {
  const f = fixture();
  try {
    const row = { run_id: `ap-${DAY}-actions`, date_jst: '2026-10-20', route: 'actions', attempted: true,
      outcome: 'no_artifact', external_ref: '123', source: 'act-reconcile' };
    write(f.work, 'data/autopilot-runs.json', JSON.stringify({ runs: [row] }) + '\n');
    commitPage(f);
    let calls = 0;
    assert.throws(() => record({ repo: f.work, trusted: f.tools, sha: sh(f.work, ['rev-parse', 'HEAD']), day: DAY, pr: 9,
      request: validateRequest(request(), DAY).request, runId: '123', work: path.join(f.temp, 'record-duplicate'),
      runner: () => { calls++; } }), error => error.code === 'record_duplicate_external_ref');
    assert.equal(calls, 0, 'refused before append or regeneration');
  } finally { f.cleanup(); }
});

test('record binds an existing session row instead of appending a second one', async () => {
  const f = fixture();
  try {
    const row = { run_id: `ap-${DAY}-actions-123`, date_jst: '2026-10-20', route: 'actions', attempted: true, outcome: 'shipped',
      pr: null, external_ref: '123', source: 'session', interventions: [] };
    write(f.work, 'data/autopilot-runs.json', JSON.stringify({ runs: [row] }, null, 2) + '\n');
    commitPage(f);
    const result = await handoff(f);
    const out = record({ repo: f.tools, trusted: f.tools, sha: result.head, day: DAY, pr: 9, request: validateRequest(request(), DAY).request,
      runId: '123', work: path.join(f.temp, 'record-work'), runner: () => {} });
    assert.equal(JSON.parse(sh(f.tools, ['show', `${out.sha}:data/autopilot-runs.json`])).runs[0].pr, 9);
    assert.throws(() => record({ repo: f.tools, trusted: f.tools, sha: result.head, day: DAY, pr: 9,
      request: validateRequest(request(), DAY).request, runId: '999', work: path.join(f.temp, 'record-foreign'), runner: () => {} }),
    error => error.code === 'record_foreign_row');
  } finally { f.cleanup(); }
});

test('record refuses a session row that disagrees with the request or lacks its failure class, before writing anything', async () => {
  const noShip = request({ run: { run_id: `ap-${DAY}-actions-123`, outcome: 'no_artifact', lane: 'E', action: 'skip',
    failure_reason: '基準を満たす候補が無かった', failure_class: 'no_artifact' } });
  const row = { run_id: `ap-${DAY}-actions-123`, date_jst: '2026-10-20', route: 'actions', attempted: true, outcome: 'no_artifact',
    failure_reason: '基準を満たす候補が無かった', failure_class: 'no_artifact', failure_stage: 'execution', pr: null, external_ref: '123',
    source: 'session', interventions: [] };
  assert.deepEqual(validateRuns({ runs: [row] }), [], 'fixture: a valid session row');
  let n = 0;
  for (const [change, req, code] of [[{ failure_class: undefined }, noShip, 'record_row_failure_class'],
    [{ failure_class: 'No Class' }, noShip, 'record_row_failure_class'],
    [{}, request(), 'record_row_outcome'],
    [{ outcome: 'failed' }, noShip, 'record_row_outcome'],
    [{}, noShip, null]]) {
    const f = fixture();
    try {
      const session = { ...row, ...change };
      if (change.failure_class === undefined && 'failure_class' in change) delete session.failure_class;
      write(f.work, 'data/autopilot-runs.json', JSON.stringify({ runs: [session] }, null, 2) + '\n');
      commitPage(f);
      const result = await handoff(f, { req });
      assert.equal(result.verdict, 'publish');
      const calls = [];
      const run = () => record({ repo: f.tools, trusted: f.tools, sha: result.head, day: DAY, pr: 9, request: result.request,
        runId: '123', work: path.join(f.temp, `record-${n++}`), runner: (...args) => calls.push(args) });
      if (code) {
        assert.throws(run, error => error.code === code, JSON.stringify(change));
        assert.equal(calls.length, 0, 'nothing ran and nothing was written');
      } else {
        const out = run();
        const bound = JSON.parse(sh(f.tools, ['show', `${out.sha}:data/autopilot-runs.json`])).runs[0];
        assert.deepEqual(bound, { ...row, pr: 9 }, 'only the PR number is bound');
      }
    } finally { f.cleanup(); }
  }
});

test('lane F: repair_of must name runs that are already on main', async () => {
  const target = 'ap-20261019-actions-77';
  const f = fixture({ runs: [failedRow(target)] });
  try {
    commitPage(f);
    const repair = repair_of => request({ run: { ...request().run, lane: 'F', action: 'maintenance', repair_of } });
    const ok = await handoff(f, { req: repair([target]) });
    assert.equal(ok.verdict, 'publish');
    assert.deepEqual(ok.request.run.repair_of, [target]);
    assert.equal(await verdictOf(f, { req: repair(['ap-20261018-actions-9']) }), 'rejected_request_repair_of_unknown');
    assert.equal(await verdictOf(f, { req: repair([`ap-${DAY}-actions-123`]) }), 'rejected_request_repair_of_self');
    assert.equal(await verdictOf(f, { req: repair('not-an-array') }), 'rejected_request_repair_of');
    // A failure row the branch adds to its own ledger is not a repair target: only main's rows count.
    write(f.work, 'data/autopilot-runs.json', JSON.stringify({ runs: [failedRow(target), failedRow('ap-20261020-actions-fake', '2026-10-20')] }, null, 2) + '\n');
    sh(f.work, ['add', '-A']); sh(f.work, ['commit', '-q', '-m', 'ledger']);
    assert.equal(await verdictOf(f, { req: repair(['ap-20261020-actions-fake']) }), 'rejected_request_repair_of_unknown');
    assert.equal(await verdictOf(f, { req: request() }), 'publish', 'a request without repair_of is unchanged');
  } finally { f.cleanup(); }
});

test('lane F: record writes repair_of on the appended row and validates the ledger', async () => {
  const target = 'ap-20261019-actions-77';
  const f = fixture({ runs: [failedRow(target)], trustedFiles: RUNS_CLI });
  try {
    commitPage(f);
    const req = request({ title: '修理: CI', run: { run_id: `ap-${DAY}-actions-123`, outcome: 'shipped', lane: 'F', action: 'maintenance',
      artifact: 'scripts/x.mjs', repair_of: [target] } });
    const result = await handoff(f, { req });
    assert.equal(result.verdict, 'publish');
    // The trusted overlay's real autopilot-runs.mjs --append writes the row; generators are not run here.
    const runner = (cwd, command, args) => {
      if (args[0] === 'scripts/autopilot-runs.mjs') execFileSync(command, args, { cwd, stdio: 'pipe', env: { ...process.env, GITHUB_ACTIONS: '' } });
    };
    const record1 = (request, name) => record({ repo: f.tools, trusted: f.tools, sha: result.head, day: DAY, pr: 77, request, runId: '123',
      work: path.join(f.temp, name), runner });
    const out = record1(result.request, 'record-work');
    const runs = JSON.parse(sh(f.tools, ['show', `${out.sha}:data/autopilot-runs.json`])).runs;
    const row = runs.find(r => r.run_id === `ap-${DAY}-actions-123`);
    assert.deepEqual(row.repair_of, [target]);
    assert.equal(row.pr, 77); assert.equal(row.lane, 'F'); assert.equal(row.route, 'actions'); assert.equal(String(row.external_ref), '123');
    assert.deepEqual(runs.find(r => r.run_id === target), failedRow(target), 'the repaired row itself is not rewritten');
    assert.deepEqual(validateRuns({ runs }), []);
    // A request that did not pass --verify still cannot name a run main does not have.
    for (const repair_of of [['ap-20261001-actions-1'], [`ap-${DAY}-actions-123`]]) {
      assert.throws(() => record1({ ...result.request, run: { ...result.request.run, repair_of } }, `record-${repair_of[0]}`),
        error => error.code === 'record_repair_of_unknown');
    }
    // Without repair_of the appended row carries none.
    const plain = { ...result.request, run: { ...result.request.run, repair_of: undefined } };
    delete plain.run.repair_of;
    const out2 = record1(plain, 'record-plain');
    const row2 = JSON.parse(sh(f.tools, ['show', `${out2.sha}:data/autopilot-runs.json`])).runs.find(r => r.run_id === `ap-${DAY}-actions-123`);
    assert.equal(row2.repair_of, undefined); assert.equal(row2.pr, 77);
  } finally { f.cleanup(); }
});

test('record recounts the status JSON from the ledger, so the CI ledger checks pass on the record head', async () => {
  // Today in JST: autopilot-runs.mjs --check also holds the ledger to being current.
  const dash = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const day = dash.replaceAll('-', '');
  const { validate: selfheal } = await import('./autopilot-selfheal.mjs');
  const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/authority-matrix.json'), 'utf8'));
  const SITE = 'https://simplememofast.com';
  const PAGE = '/obsidian/getting-started/';
  const shipped = (artifact, action = 'refresh') => ({ run_id: `ap-${day}-actions-123`, outcome: 'shipped', lane: 'A', action, artifact });
  const CONTROLS = `${PAGE}\u0000\n\u0007\u202e`;
  // [name, request run, the status JSON's article (and action), the row's artifact, the omitted code, --check passes]
  for (const [name, run, article, artifact, omitted, passes] of [
    ['no_artifact', { run_id: `ap-${day}-actions-123`, outcome: 'no_artifact', lane: 'E', action: 'skip',
      failure_reason: '基準を満たす候補が無かった', failure_class: 'no_artifact' }, { url: '/obsidian/x/' }, null, null, true],
    ['shipped', shipped('/obsidian/x/'), { url: '/obsidian/x/' }, '/obsidian/x/', null, true],
    // 2026-10-26 (PR #2168): a day without an article (§5-2 article null, no new/refresh) records no artifact and passes,
    // whatever its request wrote there: a description, a repository file, or an existing page it edited.
    ['described', shipped(DESCRIBED, 'maintenance'), null, null, 'no_article_day', true],
    ['repository file', shipped('/growth/experiments/experiments.json', 'maintenance'), null, null, 'no_article_day', true],
    ['traversal', shipped('/../etc/passwd', 'maintenance'), null, null, 'no_article_day', true],
    ['maintenance, edited page', shipped(PAGE, 'maintenance'), null, null, 'no_article_day', true],
    ['wiring, edited page URL', shipped(`https://www.simplememofast.com${PAGE}`, 'wiring'), null, null, 'no_article_day', true],
    // An article day: a public page is kept and compared; a status JSON naming an older page, or none, fails (2026-08-14).
    ['page', shipped(PAGE), { url: `${SITE}${PAGE}` }, PAGE, null, true],
    ['page URL', shipped(`${SITE}${PAGE}`), { url: `${SITE}${PAGE}` }, PAGE, null, true],
    ['bare page', shipped('obsidian/getting-started/'), { url: `${SITE}${PAGE}` }, PAGE, null, true],
    ['page, null status', shipped(PAGE), null, PAGE, null, false],
    ['page URL, null status', shipped(`${SITE}${PAGE}`), null, PAGE, null, false],
    ['page, stale status', shipped(PAGE), { url: `${SITE}/obsidian/x/` }, PAGE, null, false],
    ['www page, stale status', shipped(`https://www.simplememofast.com${PAGE}`), { url: `${SITE}/obsidian/x/` }, PAGE, null, false],
    ['http page, stale status', shipped(`http://simplememofast.com${PAGE}`), { url: `${SITE}/obsidian/x/` }, PAGE, null, false],
    ['bare page, stale status', shipped('obsidian/getting-started/'), { url: `${SITE}/obsidian/x/` }, PAGE, null, false],
    // The request's action is free text; the status JSON's action (§5-2) naming an article day keeps the page too.
    ['status action refresh, null status', shipped(PAGE, 'maintenance'), { action: 'refresh', article: null }, PAGE, null, false],
    // A maintenance day whose status JSON still names another page: kept, and fails.
    ['maintenance, stale status', shipped(PAGE, 'maintenance'), { url: `${SITE}/obsidian/x/` }, PAGE, null, false],
    // Not a public page (a fixture, a docs preview): left out on an article day too.
    ['fixture', shipped('/fixtures/x.html'), { url: '/obsidian/x/' }, null, 'not_a_page', true],
    ['docs preview', shipped('/docs/preview.html'), { url: '/obsidian/x/' }, null, 'not_a_page', true],
    ['refresh, described', shipped(DESCRIBED), { url: '/obsidian/x/' }, null, 'not_a_site_path', true],
    // A status article.url with control characters is no article and never reaches the row (or spawnSync's arguments).
    ['control characters, maintenance', shipped(PAGE, 'maintenance'), { url: CONTROLS }, null, 'no_article_day', true],
    ['control characters, refresh', shipped(PAGE), { url: CONTROLS }, PAGE, null, false],
    // 2026-09-13: a data file the status article names too.
    ['status file', shipped('/data/x.json', 'wiring'), { url: `${SITE}/data/x.json` }, '/data/x.json', null, true]]) {
    const f = fixture({ trustedFiles: RUNS_CLI, runs: [failedRow('ap-20261019-actions-77')] });
    try {
      // The session: today's status JSON (its runs block counted before today's row exists) and a commit.
      // `article` is the status JSON's article, or { action, article } when the case sets the status action too.
      const status = article && 'action' in article ? article : { article };
      write(f.work, 'data/autopilot-status.json', JSON.stringify({ date_jst: dash, ...status,
        runs: { window: { days: 1 }, totals: { runs: 1, attempted: 1, shipped: 0, failed: 1, no_run: 0 } } }, null, 2) + '\n');
      for (const file of ['obsidian/getting-started/index.html', 'fixtures/x.html', 'docs/preview.html']) write(f.work, file, '<p>page</p>\n');
      for (const file of ['data/x.json', 'growth/experiments/experiments.json']) write(f.work, file, '{}\n');
      // The registry of public pages (data/i18n/pages.json): fixtures/ and docs/ are not in it.
      write(f.work, 'data/i18n/pages.json', JSON.stringify({ pages: ['obsidian/index.html', 'obsidian/x/index.html', `${PAGE.slice(1)}index.html`]
        .map(file => ({ source: file, pages: { ja: file } })) }));
      commitPage(f, BOT, 'feat: page', 'obsidian/x/index.html');
      sh(f.tools, ['fetch', '-q', f.work, BRANCH]);
      const sha = sh(f.work, ['rev-parse', 'HEAD']);
      const req = validateRequest(request({ run }), day).request;
      assert(req, name);
      const ledgerCheck = (skipStatus, label) => {
        const out = record({ repo: f.tools, trusted: f.tools, sha, day, pr: 77, request: req, runId: '123', work: path.join(f.temp, label),
          runner: (cwd, command, args) => {
            if (args[0] !== 'scripts/autopilot-runs.mjs' || (skipStatus && args.includes('--write-status'))) return;
            execFileSync(command, args, { cwd, stdio: 'pipe', env: { ...process.env, GITHUB_ACTIONS: '' } });
          } });
        const head = path.join(f.temp, `${label}-head`);
        sh(f.tools, ['worktree', 'add', '-q', '--detach', head, out.sha]);
        const check = spawnSync(process.execPath, ['scripts/autopilot-runs.mjs', '--check'], { cwd: head, encoding: 'utf8' });
        return { out, check, runs: JSON.parse(fs.readFileSync(path.join(head, 'data/autopilot-runs.json'), 'utf8')) };
      };
      const synced = ledgerCheck(false, `record-${name}`);
      assert.equal(synced.runs.runs.find(r => r.run_id === run.run_id).artifact, artifact, `${name}: the row's artifact`);
      assert(synced.runs.runs.every(r => !/[\u0000-\u001f\u007f\u202e]/.test(r.artifact ?? '')), `${name}: no control character in a row`);
      assert.equal(synced.out.artifact_omitted, omitted, `${name}: the omitted artifact's code`);
      if (passes) assert.equal(synced.check.status, 0, `${name}: ${synced.check.stderr}`);
      else {
        assert.equal(synced.check.status, 1, `${name}: a page day whose status JSON does not name the page fails`);
        assert.match(synced.check.stderr, /を出荷した記録なのに、status JSON の article は/, name);
      }
      assert.deepEqual(sh(f.tools, ['diff', '--name-only', sha, synced.out.sha]).split('\n').sort(),
        ['data/autopilot-runs.json', 'data/autopilot-status.json'], 'the record commit carries the recounted status JSON');
      assert.deepEqual(selfheal(synced.runs, matrix), [], `${name}: Self-repair boundary`);
      // Without the recount, the same head fails the ledger check one run behind (finding F93).
      const stale = ledgerCheck(true, `record-${name}-stale`);
      assert.equal(stale.check.status, 1);
      assert.match(stale.check.stderr, /runs\.totals\.runs/);
    } finally { f.cleanup(); }
  }
});

// ── 2026-10-22: the handoff files, and one resume of the same session when they are missing ──
const SESSION = 'bf8acc9e-2dec-4cca-8674-f9d04adcd74a';
const outputsOf = file => Object.fromEntries((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n').filter(Boolean)
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const executionFile = (turns, usd, denied = []) => JSON.stringify([{ type: 'system', subtype: 'init' }, { type: 'result', subtype: 'success',
  is_error: false, num_turns: turns, total_cost_usd: usd, permission_denials: denied.map(tool_name => ({ tool_name })) }]);
const REQUEST_FILE = 'autopilot-pr-request.json', EXIT_FILE = 'autopilot-exit.json';

/**
 * The model job's tail as obsidian-autopilot.yml wires it, with the two claude-code-action steps stubbed:
 * the check (real CLI, the step's env) → the resume (a stub, run only under the step's `if:`, which
 * checkWiring pins) → the summary (real CLI) → pack; then the publish job's verify and diagnostic receipt.
 */
const minutesAgo = minutes => String(Math.floor(Date.now() / 1000) - minutes * 60);
async function modelJobTail(f, { outcome = 'success', mainWrites = {}, resumeWrites = {}, sessionId = SESSION, budget = '20',
  jobStarted = minutesAgo(48), structured, structuredText } = {}) {
  const exec = path.join(f.temp, 'claude-execution-output.json');
  const main = JSON.parse(executionFile(236, 15.41336, ['Write']));
  if (structured !== undefined) main[main.length - 1].structured_output = structured;
  // A value JSON.stringify cannot serialise (nested thousands deep) is spliced in as text.
  const text = JSON.stringify(main);
  fs.writeFileSync(exec, structuredText === undefined ? text : `${text.slice(0, -2)},"structured_output":${structuredText}}]`);
  for (const [name, text] of Object.entries(mainWrites)) fs.writeFileSync(path.join(f.temp, name), text);
  const stepEnv = extra => ({ ...process.env, GITHUB_ACTIONS: '', RUNNER_TEMP: f.temp, EXEC_FILE: exec, ...extra });
  const checkOutput = path.join(f.temp, 'github-output-handoff-files');
  const check = spawnSync(process.execPath, [path.join(ROOT, 'scripts/autopilot-publish.mjs'), '--inspect-handoff'], { encoding: 'utf8',
    env: stepEnv({ GITHUB_OUTPUT: checkOutput, MODEL_OUTCOME: outcome, SESSION_ID: sessionId, RUNTIME_BUDGET_USD: budget,
      JOB_STARTED_EPOCH: jobStarted }) });
  assert.equal(check.status, 0, check.stderr);
  assert(!check.stdout.includes(f.temp), 'the check prints typed states only');
  const checked = outputsOf(checkOutput);
  let resumeOutcome = 'skipped';
  if (outcome === 'success' && checked.resume === 'true') {
    resumeOutcome = 'success';
    // The resumed session: the action rewrites its execution file; the session writes what the case says.
    fs.writeFileSync(exec, executionFile(4, 0.5));
    for (const [name, text] of Object.entries(resumeWrites)) fs.writeFileSync(path.join(f.temp, name), text);
  }
  const summary = spawnSync(process.execPath, [path.join(ROOT, 'scripts/autopilot-diagnostics.mjs'), '--summarize'], { encoding: 'utf8',
    env: stepEnv({ RESUME_OUTCOME: resumeOutcome, RESUME_DECISION: checked.resume_decision ?? '', REQUEST_AFTER_MAIN: checked.request_after_main ?? '',
      EXIT_AFTER_MAIN: checked.exit_after_main ?? '', MAIN_EXECUTION_SHA256: checked.main_execution_sha256 ?? '',
      HANDOFF_SOURCE: checked.handoff_source ?? '' }) });
  assert.equal(summary.status, 0, summary.stderr);
  const out = path.join(f.temp, 'autopilot-handoff');
  pack({ workspace: f.work, out, day: DAY, runnerTemp: f.temp });
  let verified;
  try { verified = await verifyHandoff({ handoff: out, repo: f.tools, day: DAY, modelOutcome: outcome, remote: f.origin, listPrs: async () => [] }); }
  catch (error) { if (!(error instanceof PublishError)) throw error; verified = { verdict: error.code }; }
  const receipt = saveDiagnostics(path.join(f.temp, 'autopilot-diagnostic'), { RUNNER_TEMP: f.temp, MODEL_OUTCOME: outcome }, { handoff: out });
  return { checked, resumed: resumeOutcome !== 'skipped', verified, receipt, out };
}
const nothingPushed = f => assert.equal(sh(f.origin, ['for-each-ref', '--format=%(refname)', `refs/heads/${BRANCH}`]), '', 'nothing was pushed');

test('handoff file states: only a bounded regular file holding a JSON object is present', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-handoff-state-')));
  try {
    const at = name => path.join(dir, name);
    fs.writeFileSync(at('valid'), JSON.stringify(request()));
    fs.writeFileSync(at('oversized'), `{"x":"${'a'.repeat(64 * 1024)}"}`);
    fs.writeFileSync(at('text'), 'I will write the request and finish.');
    fs.writeFileSync(at('array'), '[]');
    fs.writeFileSync(at('null'), 'null');
    fs.symlinkSync(at('valid'), at('link'));
    fs.mkdirSync(at('directory'));
    for (const [name, state] of [['valid', 'present'], ['missing', 'missing'], ['oversized', 'oversized'], ['text', 'invalid_json'],
      ['array', 'not_object'], ['null', 'not_object'], ['link', 'not_file'], ['directory', 'not_file']]) {
      assert.equal(handoffFileState(at(name)), state, name);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('resume (a): the main session wrote neither file, the resumed session writes both, and the day publishes', async () => {
  const f = fixture();
  try {
    commitPage(f);
    const r = await modelJobTail(f, { resumeWrites: { [REQUEST_FILE]: JSON.stringify(request()), [EXIT_FILE]: JSON.stringify({ code: 'shipped_pr' }) } });
    assert.deepEqual(r.checked, { request_after_main: 'missing', exit_after_main: 'missing', missing: 'request,exit', resume: 'true',
      handoff_source: 'none', structured_output: 'absent', resume_decision: 'resume', main_execution_sha256: r.checked.main_execution_sha256, session_id: SESSION, resume_budget_usd: '3.00' });
    assert.match(r.checked.main_execution_sha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.readFileSync(path.join(f.temp, MAIN_EXECUTION_COPY), 'utf8'), executionFile(236, 15.41336, ['Write']), 'the main session\'s log is kept');
    assert.equal(r.verified.verdict, 'publish');
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(r.out, 'manifest.json'), 'utf8')).files).sort(),
      ['exit.json', 'request.json', 'summary.json', 'work.bundle']);
    assert.equal(pushBranch({ repo: f.tools, sha: r.verified.head, day: DAY, token: TOKEN, remote: f.origin }), true);
    for (const [key, value] of Object.entries({ request_after_main: 'missing', exit_after_main: 'missing', resume_decision: 'resume',
      resume_outcome: 'success', request_after_resume: 'present', exit_after_resume: 'present', model_exit_code: 'shipped_pr',
      num_turns: 236, permission_denials_count: 1, denied_tool_counts: { Write: 1 }, resume_num_turns: 4, resume_permission_denials_count: 0 })) {
      assert.deepEqual(r.receipt[key], value, key);
    }
  } finally { f.cleanup(); }
});

test('structured (a): the 2026-10-24 shape — no files, the structured result — publishes without a resume', async () => {
  const f = fixture();
  try {
    commitPage(f);
    const r = await modelJobTail(f, { structured: { exit_code: 'shipped_pr', request: request() },
      resumeWrites: { [REQUEST_FILE]: JSON.stringify({ action: 'none' }) } });
    assert.equal(r.resumed, false);
    assert.deepEqual([r.checked.request_after_main, r.checked.exit_after_main, r.checked.handoff_source, r.checked.structured_output,
      r.checked.resume_decision, r.checked.session_id], ['missing', 'missing', 'structured', 'present', 'not_needed', undefined]);
    assert.equal(r.verified.verdict, 'publish');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.out, 'request.json'), 'utf8')), request());
    for (const [key, value] of Object.entries({ model_exit_code: 'shipped_pr', handoff_source: 'structured', structured_output: 'present',
      request_after_main: 'missing', resume_outcome: 'skipped' })) assert.deepEqual(r.receipt[key], value, key);
  } finally { f.cleanup(); }
});

test('structured (b): the structured result wins over files the model wrote; an unusable one changes nothing', async () => {
  for (const [label, structured, verdict, source] of [
    ['valid over stale files', { exit_code: 'no_ship_pr', request: { action: 'push_only' } }, 'push_only', 'structured'],
    ['invalid (extra key)', { exit_code: 'other', request: { action: 'none' }, note: 'x' }, 'publish', 'files'],
  ]) {
    const f = fixture();
    try {
      commitPage(f);
      const r = await modelJobTail(f, { structured,
        mainWrites: { [REQUEST_FILE]: JSON.stringify(request()), [EXIT_FILE]: JSON.stringify({ code: 'shipped_pr' }) } });
      assert.equal(r.verified.verdict, verdict, label); assert.equal(r.checked.handoff_source, source, label);
      assert.equal(r.resumed, false, label);
    } finally { f.cleanup(); }
  }
});

test('structured (c): a structured result nested 10,000 deep is invalid; the check and the summary finish on the files', async () => {
  const deep = `{"exit_code":"no_ship_pr","request":{"action":"push_only","run":${'['.repeat(10_000)}${']'.repeat(10_000)}}}`;
  const f = fixture();
  try {
    commitPage(f);
    const r = await modelJobTail(f, { structuredText: deep,
      mainWrites: { [REQUEST_FILE]: JSON.stringify(request()), [EXIT_FILE]: JSON.stringify({ code: 'shipped_pr' }) } });
    assert.deepEqual([r.checked.structured_output, r.checked.handoff_source, r.checked.resume_decision, r.resumed],
      ['invalid', 'files', 'not_needed', false]);
    assert.equal(r.verified.verdict, 'publish');
    for (const [key, value] of Object.entries({ structured_output: 'invalid', handoff_source: 'files', model_exit_code: 'shipped_pr',
      request_after_main: 'present', num_turns: 236 })) assert.deepEqual(r.receipt[key], value, key);
  } finally { f.cleanup(); }
});

test('resume (b): the resumed session writes nothing either: rejected_request_missing, nothing pushed', async () => {
  for (const resumeWrites of [{}, { [REQUEST_FILE]: 'I will write it now.', [EXIT_FILE]: '{"code":"other"' }]) {
    const f = fixture();
    try {
      commitPage(f);
      const r = await modelJobTail(f, { resumeWrites });
      assert.equal(r.checked.resume, 'true');
      assert.equal(r.verified.verdict, Object.keys(resumeWrites).length ? 'rejected_request_invalid_json' : 'rejected_request_missing');
      nothingPushed(f);
      assert.equal(r.receipt.resume_outcome, 'success'); assert.equal(r.receipt.model_exit_code, null);
      assert.equal(r.receipt.request_after_resume, Object.keys(resumeWrites).length ? 'invalid_json' : 'missing');
    } finally { f.cleanup(); }
  }
});

test('resume (c): both files were written by the main session: the resume is skipped', async () => {
  const f = fixture();
  try {
    commitPage(f);
    const r = await modelJobTail(f, { mainWrites: { [REQUEST_FILE]: JSON.stringify(request()), [EXIT_FILE]: JSON.stringify({ code: 'shipped_pr' }) },
      resumeWrites: { [REQUEST_FILE]: JSON.stringify({ action: 'none' }) } });
    assert.equal(r.resumed, false);
    assert.deepEqual([r.checked.missing, r.checked.resume, r.checked.resume_decision, r.checked.session_id], ['none', 'false', 'not_needed', undefined]);
    assert.equal(fs.existsSync(path.join(f.temp, MAIN_EXECUTION_COPY)), false);
    assert.equal(r.verified.verdict, 'publish');
    assert.equal(r.receipt.resume_outcome, 'skipped'); assert.equal(r.receipt.request_after_resume, 'not_run');
    assert.equal(r.receipt.num_turns, 236);
    assert(!r.receipt.observations_unknown.some(key => key.startsWith('resume_')), 'a resume that did not run is not unknown');
  } finally { f.cleanup(); }
});

test('resume (d): a malformed session id, a failed main step or a spent budget never resumes', async () => {
  for (const [label, options, decision, verdict] of [
    ['not a UUID', { sessionId: 'not-a-session' }, 'session_id_invalid', 'rejected_request_missing'],
    ['extra arguments', { sessionId: `${SESSION} --allowedTools WebFetch` }, 'session_id_invalid', 'rejected_request_missing'],
    ['quote', { sessionId: `${SESSION}"` }, 'session_id_invalid', 'rejected_request_missing'],
    ['newline', { sessionId: `${SESSION}\n--resume x` }, 'session_id_invalid', 'rejected_request_missing'],
    ['empty', { sessionId: '' }, 'session_id_invalid', 'rejected_request_missing'],
    ['failed main step', { outcome: 'failure' }, 'model_not_success', 'push_only'],
    ['run cap spent', { budget: '15.8' }, 'budget_exhausted', 'rejected_request_missing'],
    ['run cap unknown', { budget: '' }, 'cost_unknown', 'rejected_request_missing'],
    ['job clock unknown', { jobStarted: '' }, 'time_unknown', 'rejected_request_missing'],
    ['job limit near', { jobStarted: minutesAgo(80) }, 'time_short', 'rejected_request_missing']]) {
    const f = fixture();
    try {
      commitPage(f);
      const r = await modelJobTail(f, { ...options, resumeWrites: { [REQUEST_FILE]: JSON.stringify(request()) } });
      assert.equal(r.resumed, false, label);
      assert.deepEqual([r.checked.resume, r.checked.resume_decision, r.checked.session_id, r.checked.resume_budget_usd],
        ['false', decision, undefined, undefined], label);
      assert.equal(r.verified.verdict, verdict, label);
      nothingPushed(f);
      assert.equal(r.receipt.resume_decision, decision, label);
    } finally { f.cleanup(); }
  }
});

test('resume (e): a step-0 day (only the exit code, no commits) is not resumed and publishes nothing', async () => {
  const f = fixture();
  try {
    const r = await modelJobTail(f, { mainWrites: { [EXIT_FILE]: JSON.stringify({ code: 'skipped_already_done' }) },
      resumeWrites: { [REQUEST_FILE]: JSON.stringify(request()) } });
    assert.equal(r.resumed, false);
    assert.deepEqual([r.checked.missing, r.checked.resume, r.checked.resume_decision], ['request', 'false', 'nothing_to_publish']);
    assert.equal(r.verified.verdict, 'none');
    nothingPushed(f);
    assert.equal(r.receipt.resume_decision, 'nothing_to_publish'); assert.equal(r.receipt.model_exit_code, 'skipped_already_done');
  } finally { f.cleanup(); }
});

test('resume (f): near the job limit a written request publishes without the resume', async () => {
  const f = fixture();
  try {
    commitPage(f);
    const r = await modelJobTail(f, { jobStarted: minutesAgo(80), mainWrites: { [REQUEST_FILE]: JSON.stringify(request()) } });
    assert.equal(r.resumed, false);
    assert.deepEqual([r.checked.missing, r.checked.resume, r.checked.resume_decision], ['exit', 'false', 'time_short']);
    assert.equal(r.verified.verdict, 'publish');
    assert.equal(r.receipt.resume_decision, 'time_short');
  } finally { f.cleanup(); }
});

// End to end on a copy of this repository: a model commit for today goes through pack → verify → push →
// record with the real generators, and the record head, merged into main as SEO Validation checks it out,
// must pass the SEO Validation steps that read these files. Offline (the remote is a local bare repository,
// GitHub reads are stubbed). The generators rebuild every translation (minutes each), so it is opt-in;
// the cases share one seeded origin. One case per test, so they can also run as separate processes
// (--test-name-pattern).
const E2E_SKIP = process.env.AUTOPILOT_PUBLISH_E2E !== '1'
  && 'set AUTOPILOT_PUBLISH_E2E=1 (real generators on a copy of this repository, several minutes per case)';
const OWNER = { name: 'SimpleMemo Developer', email: 'simplememo.com@gmail.com' };
// A translated public page (registered in data/i18n/pages.json, generated locales, English editorial).
const E2E_PAGE = 'press/index.html';
let e2eRepo = null;
after(() => e2eRepo?.cleanup());
function seededRepo() {
  if (e2eRepo) return e2eRepo;
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-e2e-')));
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
  try {
    // main = this checkout's HEAD plus any uncommitted change under test.
    const seed = path.join(root, 'seed.git'), origin = path.join(root, 'origin.git');
    sh(root, ['clone', '-q', '--bare', '--shared', ROOT, seed]);
    const index = { ...process.env, GIT_INDEX_FILE: path.join(root, 'index') };
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    execFileSync('git', ['read-tree', head], { cwd: seed, env: index });
    const uncommitted = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: ROOT, maxBuffer: 256 << 20 });
    if (uncommitted.length) execFileSync('git', ['apply', '--cached'], { cwd: seed, env: index, input: uncommitted });
    const tree = execFileSync('git', ['write-tree'], { cwd: seed, env: index, encoding: 'utf8' }).trim();
    sh(seed, ['update-ref', 'refs/heads/main', sh(seed, ['commit-tree', tree, '-p', head, '-m', 'main under test'], OWNER)]);
    sh(root, ['clone', '-q', '--bare', '--shared', seed, origin]);
    // Checkouts without images (nothing here reads them).
    const checkout = (to, ref) => {
      sh(root, ['clone', '-q', '--shared', '--no-checkout', origin, to]);
      sh(to, ['sparse-checkout', 'set', '--no-cone', '/*', '!*.png', '!*.jpg', '!*.jpeg', '!*.webp', '!*.gif', '!*.mp4']);
      sh(to, ['checkout', '-q', ref]);
    };
    const tools = path.join(root, 'tools'), work = path.join(root, 'work'), check = path.join(root, 'check');
    for (const dir of [tools, work, check]) checkout(dir, 'main');
    e2eRepo = { root, origin, tools, work, check, cleanup };
    return e2eRepo;
  } catch (error) { cleanup(); throw error; }
}
// The steps run as CI runs them: not as children of this test runner (a nested `node --test`, such as the
// one codex-recovery-permit.py --selftest starts under autopilot-selfheal.mjs --check, reads NODE_TEST_CONTEXT).
const runEnv = (extra = {}) => {
  const env = { ...process.env, GITHUB_ACTIONS: '', ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
};
const run = (cwd, command, args, extra = {}) => spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 256 << 20, env: runEnv(extra) });
const runAsync = (cwd, command, args) => new Promise(resolve => {
  const child = spawn(command, args, { cwd, env: runEnv() });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
  child.on('close', status => resolve({ status, stdout, stderr }));
});
const ok = (result, label) => {
  assert.equal(result.status, 0, `${label}: ${result.stderr.slice(-2500)}\n${result.stdout.slice(-1500)}`);
  return result.stdout;
};

async function endToEnd(kind) {
  const { origin, tools, work, check, root } = seededRepo();
  const dash = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const day = dash.replaceAll('-', '');
  const branch = `claude/obsidian-auto-${day}`;
  const pr = { no_artifact: 990001, shipped_translated: 990002, shipped_untranslated: 990003 }[kind];
  const temp = path.join(root, `temp-${kind}`);
  fs.mkdirSync(temp);
  // A fresh day branch on the shared origin, and the session's checkout of main.
  spawnSync('git', ['update-ref', '-d', `refs/heads/${branch}`], { cwd: origin });
  sh(work, ['reset', '-q', '--hard']); sh(work, ['clean', '-fdq']);
  sh(work, ['fetch', '-q', 'origin']); sh(work, ['checkout', '-q', '-B', branch, 'origin/main']);
  let requestRun = { run_id: `ap-${day}-actions-${pr}`, outcome: 'no_artifact', lane: 'E', action: 'skip',
    failure_reason: 'e2e: no qualifying candidate', failure_class: 'no_artifact' };
  if (kind !== 'no_artifact') {
    // Runbook §2-1: the declaration is its own commit before the implementation. Prompt step 3-1: a page
    // edit declares the page and its generated locale pages. The edit is a date: it needs no new catalog
    // entry (the catalogs are outside the contract's eligibility scope, data/eligibility-policy.json).
    const group = JSON.parse(fs.readFileSync(path.join(work, 'data/i18n/pages.json'), 'utf8')).pages.find(g => g.source === E2E_PAGE);
    const translations = Object.keys(group.pages).filter(locale => !Object.hasOwn(group.existing, locale)).map(locale => group.pages[locale]);
    const touches = [E2E_PAGE, ...translations];
    const snapshot = JSON.parse(ok(run(work, process.execPath, ['scripts/value-contracts.mjs', '--feedback']), 'feedback')).snapshot_sha256;
    const evidence = new Date(Date.now() + 9 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
    const candidate = (id, other, rank, p) => ({ id, run_id: requestRun.run_id, rank, metric: 'publishing_day_rate', predicted_delta: 1, p,
      horizon_days: 1, counterfactual: { id: other, reason: 'End-to-end fixture: two bounded page edits compared only to exercise the publish flow.' },
      rank_gap: 0.1, touches, max_changed_lines: 100, max_binary_bytes: 0, predicted_usd: 1, lane: 'A', action: 'refresh',
      kind: 'article', scope: 'content', reversibility_class: 'R1', evidence_date: evidence,
      calibration: { snapshot_sha256: snapshot, reason: 'End-to-end fixture only: the settled forecasts were read; no calibration claim is made.' } });
    fs.writeFileSync(path.join(temp, 'candidates.json'), JSON.stringify([candidate(`e2e-a-${kind.replaceAll('_', '-')}-${day}`, `e2e-b-${day}`, 1, 0.2),
      candidate(`e2e-b-${day}`, `e2e-a-${kind.replaceAll('_', '-')}-${day}`, 0.9, 0.15)]));
    ok(run(work, process.execPath, ['scripts/value-contracts.mjs', '--select', path.join(temp, 'candidates.json')]), 'select');
    sh(work, ['add', '-A']); sh(work, ['commit', '-q', '-m', 'declare']);
    const pageFile = path.join(work, E2E_PAGE);
    const html = fs.readFileSync(pageFile, 'utf8');
    const edited = html.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日更新/, (_, y, m, d) => `${y}年${m}月${d === '2' ? '3' : '2'}日更新`);
    assert.notEqual(edited, html, 'fixture page carries an update date');
    fs.writeFileSync(pageFile, edited);
    if (kind === 'shipped_translated') {
      // Prompt step 4: the session completes the translations of its page before committing.
      ok(run(work, 'python3', ['-E', '-s', 'scripts/build_site_translations.py', '--write']), 'session build_site_translations --write');
      assert.deepEqual(sh(work, ['diff', '--name-only']).split('\n').sort(), [...touches].sort(), 'the session rebuilt exactly its page translations');
    }
    sh(work, ['add', '-A']); sh(work, ['commit', '-q', '-m', 'implement']);
    requestRun = { run_id: requestRun.run_id, outcome: 'shipped', lane: 'A', action: 'refresh', artifact: `/${E2E_PAGE.replace(/index\.html$/, '')}` };
  }
  // The session: today's status JSON (runs counted before today's row exists) and the LOG.
  const status = JSON.parse(fs.readFileSync(path.join(work, 'data/autopilot-status.json'), 'utf8'));
  Object.assign(status, { date_jst: dash, generated_at: new Date().toISOString(), pr: null, reason: `e2e ${kind}`,
    article: kind === 'no_artifact' ? null : { url: requestRun.artifact, title: 'e2e' } });
  write(work, 'data/autopilot-status.json', JSON.stringify(status, null, 2) + '\n');
  ok(run(work, process.execPath, ['scripts/autopilot-runs.mjs', '--write-status']), 'session --write-status');
  fs.appendFileSync(path.join(work, 'docs/obsidian/AUTOPILOT_LOG.md'), `\n## ${dash} (e2e ${kind})\n`);
  sh(work, ['add', '-A']); sh(work, ['commit', '-q', '-m', 'status and log']);
  ok(run(work, process.execPath, ['scripts/decision-ci.mjs', '--verify-local']), 'verify-local');
  fs.writeFileSync(path.join(temp, 'autopilot-pr-request.json'), JSON.stringify({ action: 'pr', title: `e2e ${kind}`, body: 'e2e', run: requestRun }));
  // The publish job (GitHub reads stubbed; the remote is local).
  const handoffDir = path.join(temp, 'handoff');
  pack({ workspace: work, out: handoffDir, day, runnerTemp: temp });
  const verified = await verifyHandoff({ handoff: handoffDir, repo: tools, day, force: true, modelOutcome: 'success', remote: origin,
    listPrs: async () => [], prodStatusDate: async () => null });
  assert.equal(verified.verdict, 'publish');
  assert(pushBranch({ repo: tools, sha: verified.head, day, token: TOKEN, remote: origin }));
  const recordWork = path.join(root, `record-${kind}`);
  let prHead = verified.head;
  try {
    if (kind === 'shipped_untranslated') {
      // The record step does not publish translations of the session's page: its generators would rewrite
      // them, which is outside the record paths, so it fails closed and pushes nothing more.
      assert.throws(() => record({ repo: tools, trusted: tools, sha: verified.head, day, pr, request: verified.request, runId: String(pr),
        work: recordWork }), error => error.code === 'record_unexpected_change');
    } else {
      const recorded = record({ repo: tools, trusted: tools, sha: verified.head, day, pr, request: verified.request, runId: String(pr), work: recordWork });
      for (const file of sh(tools, ['diff', '--name-only', verified.head, recorded.sha]).split('\n')) {
        assert(RECORD_PATHS.includes(file), `the record commit changes only record paths: ${file}`);
      }
      assert(pushBranch({ repo: tools, sha: recorded.sha, day, token: TOKEN, remote: origin }));
      prHead = recorded.sha;
    }
  } finally { spawnSync('git', ['worktree', 'remove', '--force', recordWork], { cwd: tools }); }
  // SEO Validation checks out the PR merged into main.
  sh(check, ['reset', '-q', '--hard']); sh(check, ['clean', '-fdq']);
  sh(check, ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main', `+refs/heads/${branch}:refs/remotes/origin/day`]);
  sh(check, ['checkout', '-q', '--detach', 'origin/main']);
  sh(check, ['merge', '-q', '--no-ff', '--no-edit', prHead], OWNER);
  const repo = { full_name: 'simplememofast/simplememo' };
  fs.writeFileSync(path.join(temp, 'event.json'), JSON.stringify({ pull_request: { number: pr,
    head: { ref: branch, sha: prHead, repo }, base: { ref: 'main', sha: sh(check, ['rev-parse', 'HEAD^1']), repo } } }));
  const decision = () => run(check, process.execPath, ['scripts/decision-ci.mjs', '--check'], { GITHUB_EVENT_PATH: path.join(temp, 'event.json') });
  if (kind === 'shipped_untranslated') {
    // The PR is left on the session's head, which SEO Validation does not pass (no bound run, stale translations).
    const result = decision();
    assert.notEqual(result.status, 0, 'decision-ci refuses the unrecorded head');
    assert.match(result.stderr, /bind exactly one run/);
    return;
  }
  const python = ['scripts/build_site_translations.py', 'scripts/generate_sitemap.py']
    .map(script => runAsync(check, 'python3', ['-E', '-s', script, '--check']).then(result => [script, result]));
  for (const args of [['scripts/autopilot-runs.mjs', '--check'], ['scripts/autopilot-selfheal.mjs', '--check'],
    ['scripts/check-autopilot-page.mjs', '--check']]) ok(run(check, process.execPath, args), `${kind}: ${args.join(' ')}`);
  const verdict = JSON.parse(ok(decision(), `${kind}: decision-ci --check`));
  assert.equal(verdict.state, kind === 'no_artifact' ? 'not_required' : 'bound');
  for (const [script, result] of await Promise.all(python)) ok(result, `${kind}: ${script} --check`);
  if (kind === 'no_artifact') {
    // The report and its translations are bookkeeping only as the generators wrote them. On the real page and
    // ledgers: a hand-written run-streaks region needs a contract (decision-ci), and a hand-written translation
    // beside the regenerated page fails the translation check.
    const page = path.join(check, 'autopilot/index.html');
    const html = fs.readFileSync(page, 'utf8');
    const edited = html.replace(/<!-- run-streaks:start -->[\s\S]*?<!-- run-streaks:end -->/,
      '<!-- run-streaks:start --><script>document.title = "x"</script><!-- run-streaks:end -->');
    assert.notEqual(edited, html);
    fs.writeFileSync(page, edited);
    const refused = decision();
    assert.equal(refused.status, 1, 'a hand-written report region is not bookkeeping');
    assert.match(refused.stderr, /exactly one prospective decision contract is required/);
    sh(check, ['checkout', '-q', '--', 'autopilot/index.html']);
    fs.appendFileSync(path.join(check, 'ar/autopilot/index.html'), '<script>document.title = "x"</script>\n');
    const stale = run(check, 'python3', ['-E', '-s', 'scripts/build_site_translations.py', '--check']);
    assert.equal(stale.status, 1, 'a hand-written report translation fails SEO Validation');
    assert.match(stale.stdout, / 1 stale/);
  }
}

for (const [kind, what] of [['no_artifact', 'a no_artifact day: the regenerated report is bookkeeping'],
  ['shipped_translated', 'a shipped day with a contract that edits a translated page and its translations'],
  ['shipped_untranslated', 'a shipped day that edits a translated page without translations fails closed']]) {
  test(`end to end (${kind}): ${what}`, { skip: E2E_SKIP, timeout: 90 * 60_000 }, () => endToEnd(kind));
}

test('opening the PR sends only the sanitized request', async () => {
  let sent;
  const number = await openPr({ request: validateRequest(request(), DAY).request, day: DAY, token: TOKEN,
    fetchImpl: async (url, init) => { sent = { url, init }; return { status: 201, json: async () => ({ number: 5, head: { ref: BRANCH } }) }; } });
  assert.equal(number, 5);
  assert.equal(sent.url, 'https://api.github.com/repos/simplememofast/simplememo/pulls');
  assert.deepEqual(Object.keys(JSON.parse(sent.init.body)).sort(), ['base', 'body', 'draft', 'head', 'maintainer_can_modify', 'title']);
  assert.equal(JSON.parse(sent.init.body).body, request().body);
  await assert.rejects(openPr({ request: validateRequest(request(), DAY).request, day: DAY, token: TOKEN,
    fetchImpl: async () => ({ status: 422, json: async () => ({}) }) }), error => error.code === 'open_pr_http_422');
});

test('workflow wiring: the model job holds no write credential', () => {
  checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
});

test('Act reads the split run (model job + publish job) with the same outcomes as before', async () => {
  const { interpretRun } = await import('./autopilot-act.mjs');
  const { primarySteps } = await import('./autopilot-completion.mjs');
  const { splitJobs } = await import('./autopilot-publish.mjs');
  const jobs = splitJobs(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
  const names = job => [...jobs.get(job).matchAll(/^      - name: (.*)$/gm)].map(m => m[1].replace(/^"|"$/g, ''));
  const moved = ['成果物の実行IDを照合', "成果物判定: ${{ steps.output.outputs.verdict || 'unknown' }}"];
  const keys = ['Claude Code', 'Gate', '緊急停止', '封じ込め', '予算ゲート', '振り分け', '成果物の実行IDを照合',
    '資格情報かを切り分ける', '実行中の支出閾値で停止', 'ターン上限で停止', '使用量上限', 'SDKの停止理由'];
  for (const name of names('publish').filter(n => !moved.includes(n))) {
    assert(!keys.some(key => name.includes(key)) && !/^(?:成果物判定|判定コード):/.test(name), `publish step collides: ${name}`);
  }
  for (const name of moved) assert(names('publish').includes(name) && !names('autopilot').includes(name), `${name} lives only in publish`);
  const model = (claude, extra = []) => [{ name: 'Gate（秘密鍵・当日重複・死んだ占有の引き継ぎ）', conclusion: 'success' },
    { name: '判定コード: run', conclusion: 'success' }, { name: 'タスク種別とモデルの振り分け', conclusion: 'success' },
    { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: claude }, ...extra];
  const publish = (verdict, output, pushed = 'success') => [{ name: 'Verify the handoff', conclusion: 'success' },
    { name: `公開判定: ${verdict}`, conclusion: 'success' }, { name: 'Push the work branch', conclusion: pushed },
    { name: '成果物の実行IDを照合', conclusion: output === 'verified' ? 'success' : 'failure' },
    { name: `成果物判定: ${output}`, conclusion: 'success' }];
  const run = (conclusion, modelSteps, publishSteps) => interpretRun({ status: 'completed', conclusion, event: 'schedule',
    steps: primarySteps([{ name: 'autopilot', steps: modelSteps }, ...(publishSteps ? [{ name: 'publish', steps: publishSteps }] : []),
      { name: 'Notify Autopilot Act', steps: [] }]) });
  assert.equal(run('success', model('success'), publish('publish', 'verified')).outcome, 'shipped');
  assert.equal(run('failure', model('success'), publish('duplicate', 'missing')).outcome, 'no_artifact');
  assert.equal(run('failure', model('success'), publish('publish', 'missing', 'failure')).outcome, 'no_artifact');
  assert.equal(run('failure', model('success'), publish('publish', 'unknown')).needs_triage, true);
  const failed = model('failure', [{ name: 'ターン上限で停止', conclusion: 'failure' }]);
  assert.deepEqual(run('failure', failed, publish('push_only', 'unknown')), run('failure', failed, null));
  const skipped = [{ name: 'Gate（秘密鍵・当日重複・死んだ占有の引き継ぎ）', conclusion: 'success' },
    { name: '判定コード: skip_already_shipped', conclusion: 'success' }, { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'skipped' }];
  assert.equal(run('success', skipped, null).outcome, 'skipped_gate');
});
