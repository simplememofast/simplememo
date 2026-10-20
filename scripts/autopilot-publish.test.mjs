// node --test scripts/autopilot-publish.test.mjs
// Real git, a local bare repository as the remote, no network and no credential.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pack, verifyHandoff, pushBranch, record, validateRequest, prPayload, openPr, checkWiring,
  PublishError, RECORD_IDENTITY, MAX_REPAIR_TARGETS } from './autopilot-publish.mjs';
import { classifyAutopilotChange, hardDenyReason, isAutopilotBranch } from './lib/autopilot-paths.mjs';
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
      'node scripts/decision-monitor.mjs --publish-report', 'python3 -E -s', 'python3 -E -s']);
    assert(calls[0].includes('--pr 42') && calls[0].includes('--external-ref 123') && calls[0].includes('--route actions'));
    assert.deepEqual(sh(f.tools, ['diff', '--name-only', result.head, out.sha]).split('\n').sort(), ['autopilot/index.html', 'data/autopilot-runs.json']);
    assert.equal(sh(f.tools, ['log', '-1', '--format=%an <%ae>|%cn <%ce>', out.sha]),
      `${RECORD_IDENTITY.name} <${RECORD_IDENTITY.email}>|${RECORD_IDENTITY.name} <${RECORD_IDENTITY.email}>`);
    // The branch's own files are back; nothing from the overlay is committed.
    assert.equal(sh(f.tools, ['show', `${out.sha}:scripts/trusted-marker.txt`]), 'model version');
    assert.equal(pushBranch({ repo: f.tools, sha: result.head, day: DAY, token: TOKEN, remote: f.origin }), true);
    assert.equal(pushBranch({ repo: f.tools, sha: out.sha, day: DAY, token: TOKEN, remote: f.origin }), true);

    // Generator output is held to the hard-deny rule; ordinary translation pages are accepted.
    let n = 0;
    for (const [mutate, ok] of [[cwd => write(cwd, '.github/workflows/x.yml', 'on: push'), false],
      [cwd => fs.symlinkSync('/etc/passwd', path.join(cwd, 'ko/link.html')), false],
      [cwd => fs.rmSync(path.join(cwd, 'obsidian/index.html')), false],
      [cwd => write(cwd, 'ko/obsidian/new/index.html', '<p>번역</p>'), true]]) {
      const run = () => record({ repo: f.tools, trusted: f.tools, sha: result.head, day: DAY, pr: 42, request: req, runId: '123',
        work: path.join(f.temp, `record-${n++}`), runner: (cwd, command, args) => {
          if (args.includes('--publish-report')) { fs.mkdirSync(path.join(cwd, 'ko'), { recursive: true }); mutate(cwd); } } });
      if (ok) assert.equal(run().changed, 1); else assert.throws(run, error => error.code === 'record_unexpected_change');
    }
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
