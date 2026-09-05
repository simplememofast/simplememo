#!/usr/bin/env node
// A branch or today's public status is not an output receipt for this run.
// Capture the remote baseline before the model and verify a fresh, run-bound PR
// record afterwards. Verification reads immutable commits, never the model's tree.
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validate as validateRuns, deriveStage } from './autopilot-runs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const unknown = why => ({ verdict: 'unknown', why });
const missing = why => ({ verdict: 'missing', why });

export function runIdentity(env) {
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.match(env.GITHUB_RUN_ID ?? '', /^[1-9]\d*$/);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^[1-9]\d*$/);
  assert.match(env.TODAY_DASH ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert(sha(env.GITHUB_SHA), 'workflow commit required');
  return { repo: env.GITHUB_REPOSITORY, run_id: env.GITHUB_RUN_ID, attempt: Number(env.GITHUB_RUN_ATTEMPT),
    day: env.TODAY_DASH, branch: `claude/obsidian-auto-${env.TODAY_DASH.replaceAll('-', '')}`, base_sha: env.GITHUB_SHA };
}

export function githubReader(repo, token, fetchImpl = fetch) {
  assert(token, 'existing GitHub credential required');
  return async endpoint => {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}${endpoint}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'simplememo-output-verifier' },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) return null;
    assert(response.ok, `GitHub read failed (${response.status})`);
    return response.json();
  };
}

async function branchHead(get, branch) {
  const ref = await get(`/git/ref/heads/${encodeURIComponent(branch)}`);
  if (ref === null) return null;
  assert.equal(ref?.ref, `refs/heads/${branch}`, 'wrong branch ref');
  assert.equal(ref.object?.type, 'commit', 'branch must point to a commit');
  assert(sha(ref.object.sha), 'branch SHA missing');
  return ref.object.sha;
}

export async function capture(identity, get, now = new Date()) {
  try {
    return { ...identity, version: 1, verdict: 'ready', branch_sha: await branchHead(get, identity.branch), captured_at: now.toISOString() };
  } catch { return { ...identity, version: 1, ...unknown('開始前のリモート状態を取得できなかった') }; }
}

async function runsAt(get, head) {
  const blob = await get(`/contents/data/autopilot-runs.json?ref=${head}`);
  if (blob === null) return null;
  assert.equal(blob?.type, 'file', 'run ledger is not a file');
  assert.equal(blob.encoding, 'base64', 'run ledger content unavailable');
  assert.equal(typeof blob.content, 'string', 'run ledger content missing');
  const doc = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
  assert(Array.isArray(doc?.runs), 'run ledger is incomplete');
  return doc.runs;
}

export async function verify(snapshot, identity, get) {
  try {
    assert.equal(snapshot?.version, 1, 'snapshot version');
    assert.equal(snapshot.verdict, 'ready', 'baseline unavailable');
    for (const key of ['repo', 'run_id', 'attempt', 'day', 'branch', 'base_sha']) assert.equal(snapshot[key], identity[key], `snapshot ${key} mismatch`);
    assert(snapshot.branch_sha === null || sha(snapshot.branch_sha), 'baseline branch SHA missing');
    assert(Number.isFinite(Date.parse(snapshot.captured_at)), 'snapshot time missing');
    const baseline = snapshot.branch_sha ?? identity.base_sha;
    const before = await runsAt(get, baseline);
    assert(before !== null, 'baseline ledger unavailable');
    const previous = before.filter(row => String(row.external_ref) === identity.run_id);
    assert(previous.length <= 1, 'ambiguous previous run identity');
    const prs = [];
    let complete = false;
    for (let page = 1; page <= 5; page++) {
      const rows = await get('/pulls?state=all&base=main&head='
        + encodeURIComponent(`${identity.repo.split('/')[0]}:${identity.branch}`)
        + `&sort=updated&direction=desc&per_page=100&page=${page}`);
      assert(Array.isArray(rows), 'PR inventory unavailable');
      prs.push(...rows);
      if (rows.length < 100) { complete = true; break; }
    }
    assert(complete, 'PR inventory truncated');
    let unreadable = false;
    for (const listed of prs) {
      assert(Number.isInteger(listed?.number) && listed.number > 0, 'invalid PR inventory');
      const pr = await get(`/pulls/${listed.number}`);
      assert(pr?.number === listed.number, 'PR disappeared during verification');
      if (pr.head?.ref !== identity.branch || pr.head.repo?.full_name !== identity.repo
        || pr.base?.ref !== 'main' || pr.base.repo?.full_name !== identity.repo
        || (pr.state !== 'open' && !(pr.state === 'closed' && pr.merged === true))) continue;
      assert(sha(pr.head.sha), 'PR head missing');
      if (pr.head.sha === baseline) continue;
      const after = await runsAt(get, pr.head.sha);
      if (after === null) continue;
      const own = after.filter(row => String(row.external_ref) === identity.run_id);
      if (own.length === 0) continue;
      assert.equal(own.length, 1, 'ambiguous current run identity');
      const row = own[0];
      if (row.route !== 'actions' || row.date_jst !== identity.day || validateRuns({ runs: [row] }).length
        || (row.outcome === 'shipped' && row.pr !== pr.number)) continue;
      // Merely opening an old branch, merging main, or reusing an old attempt's
      // identical record cannot turn previous work into this execution's output.
      if (isDeepStrictEqual(previous[0], row)) continue;
      if (pr.state === 'open' && await branchHead(get, identity.branch) !== pr.head.sha) {
        unreadable = true; continue; // a concurrent update is not proof of absence
      }
      return { verdict: 'verified', disposition: pr.merged === true ? 'merged_pr' : 'pending_pr',
        pr: pr.number, head_sha: pr.head.sha, run_id: row.run_id, external_ref: identity.run_id,
        run_outcome: row.outcome, production_verified: false,
        why: '開始前から変化したPR上の記録を今回の実行IDと照合した。本番反映・価値達成の証明ではない。' };
    }
    return unreadable ? unknown('PRとブランチが照合中に更新された')
      : missing('今回の実行IDに結びつく新しい結果記録を持つPRがない（宣言ブランチ・当日statusだけでは完了としない）');
  } catch { return unknown('リモートの取得または実行証跡の照合を完了できなかった。成果物ゼロとは断定しない。'); }
}

export function checkWiring(source) {
  const captureStep = source.split('      - name: Capture output baseline before the model\n')[1]?.split('\n      - name:')[0];
  assert(captureStep, 'baseline capture must be wired');
  assert(source.indexOf('name: Capture output baseline before the model') < source.indexOf('name: Claude Code（'), 'capture must precede the model');
  assert.match(captureStep, /git worktree add --detach "\$RUNNER_TEMP\/output-tools" "\$GITHUB_SHA"/);
  assert.match(captureStep, /node "\$RUNNER_TEMP\/output-tools\/scripts\/autopilot-output.mjs" --capture/);
  const verifyStep = source.split('      - name: 成果物の実行IDを照合\n')[1]?.split('\n      - name:')[0];
  assert(verifyStep, 'verification must be wired');
  assert.match(verifyStep, /steps\.claude\.outcome == 'success'/);
  assert.match(verifyStep, /node "\$RUNNER_TEMP\/output-tools\/scripts\/autopilot-output.mjs" --verify/);
  assert.doesNotMatch(verifyStep, /continue-on-error|git ls-remote|curl/);
  assert.match(source, /name: "成果物判定: \$\{\{ steps\.output\.outputs\.verdict \|\| 'unknown' \}\}"/);
}

async function selftest() {
  let tests = 0;
  const t = async (name, fn) => { await fn(); tests++; };
  const old = 'a'.repeat(40), head = 'b'.repeat(40);
  const identity = runIdentity({ GITHUB_REPOSITORY: 'owner/repo', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: old, TODAY_DASH: '2026-09-05' });
  const row = { run_id: 'ap-20260905-actions-123', date_jst: identity.day, route: 'actions', external_ref: '123', outcome: 'shipped', attempted: true, pr: 940, source: 'session' };
  assert.deepEqual(validateRuns({ runs: [row] }), []);
  const pr = { number: 940, state: 'open', merged: false, draft: false,
    head: { ref: identity.branch, sha: head, repo: { full_name: identity.repo } },
    base: { ref: 'main', repo: { full_name: identity.repo } } };
  const fixture = ({ before = [], after = [row], current = head, prs = [pr], fresh = pr,
    broken = '', endless = false, secondPage = false } = {}) => async endpoint => {
    if (broken && endpoint.includes(broken)) throw Error('network');
    if (endpoint.startsWith('/git/ref')) return current === null ? null : { ref: `refs/heads/${identity.branch}`, object: { type: 'commit', sha: current } };
    if (endpoint.startsWith('/contents')) {
      const rows = endpoint.endsWith(old) ? before : after;
      return rows === null ? null : { type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify({ runs: rows })).toString('base64') };
    }
    if (endpoint.startsWith('/pulls?')) return (endless || (secondPage && endpoint.endsWith('page=1'))) ? Array(100).fill(pr) : prs;
    if (endpoint === '/pulls/940') return fresh;
    throw Error('unexpected endpoint');
  };
  const snapshot = await capture(identity, fixture({ current: old }));
  const check = options => verify(snapshot, identity, fixture(options));
  await t('fresh current-run PR receipt is pending, not shipped', async () => {
    const result = await check(); assert.equal(result.verdict, 'verified'); assert.equal(result.disposition, 'pending_pr'); assert.equal(result.production_verified, false);
  });
  await t('merged PR can be read after branch deletion', async () => {
    const result = await check({ current: null, fresh: { ...pr, state: 'closed', merged: true } }); assert.equal(result.verdict, 'verified'); assert.equal(result.disposition, 'merged_pr');
  });
  await t('fresh PR reread accepts an updated list head', async () => assert.equal((await check({ prs: [{ ...pr, head: { ...pr.head, sha: old } }] })).verdict, 'verified'));
  await t('second-page PR is found', async () => assert.equal((await check({ secondPage: true })).verdict, 'verified'));
  await t('draft output is still pending', async () => assert.equal((await check({ fresh: { ...pr, draft: true } })).disposition, 'pending_pr'));
  for (const options of [{ prs: [] }, { after: [] }, { after: null }, { before: [row] },
    { after: [{ ...row, external_ref: '122' }] }, { after: [{ ...row, pr: 939 }] },
    { after: [{ ...row, route: 'ccr-0920' }] }, { after: [{ ...row, date_jst: '2026-09-04' }] },
    { after: [{ ...row, attempted: false }] }, { after: [{ ...row, source: '' }] },
    { fresh: { ...pr, state: 'closed' } }, { fresh: { ...pr, base: { ...pr.base, ref: 'other' } } },
    { fresh: { ...pr, head: { ...pr.head, repo: { full_name: 'fork/repo' } } } },
    { fresh: { ...pr, head: { ...pr.head, sha: old } } }]) {
    await t('previous/unbound work cannot be this execution output', async () => assert.equal((await check(options)).verdict, 'missing'));
  }
  for (const options of [{ broken: '/pulls?' }, { broken: '/contents' }, { broken: '/git/ref' },
    { before: null }, { endless: true }, { current: old }, { current: null }, { after: [row, row] }]) {
    await t('incomplete or changing evidence is unknown', async () => assert.equal((await check(options)).verdict, 'unknown'));
  }
  for (const changed of [{ run_id: '124' }, { attempt: 2 }, { repo: 'fork/repo' }, { branch: 'other' }, { base_sha: head }, { verdict: 'unknown' }]) {
    await t('snapshot belongs to exactly this run attempt', async () => assert.equal((await verify({ ...snapshot, ...changed }, identity, fixture())).verdict, 'unknown'));
  }
  await t('failed capture is preserved as unknown', async () => assert.equal((await capture(identity, fixture({ broken: '/git/ref' }))).verdict, 'unknown'));
  await t('absent branch can create its first result', async () => {
    const absent = await capture(identity, fixture({ current: null })); assert.equal((await verify(absent, identity, fixture())).verdict, 'verified');
  });
  await t('HTTP failures are not empty inventories', async () => {
    const get = githubReader(identity.repo, 'fixture', async () => ({ ok: false, status: 503 }));
    assert.equal((await capture(identity, get)).verdict, 'unknown');
  });
  await t('verified typed failure record is not relabeled as shipped', async () => {
    const failed = { ...row, outcome: 'no_artifact', failure_reason: 'No qualifying candidate' };
    const normalized = { ...failed, ...deriveStage(failed) };
    const result = await check({ after: [normalized] });
    assert.equal(result.verdict, 'verified'); assert.equal(result.run_outcome, 'no_artifact');
  });
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'output-receipt-test-')));
  try {
    const preload = path.join(directory, 'github-fixture.mjs'), snapshotFile = path.join(directory, 'before.json');
    fs.writeFileSync(preload, `const row = ${JSON.stringify(row)}, pr = ${JSON.stringify(pr)};
      globalThis.fetch = async url => {
        const phase = process.env.SIMPLEMEMO_OUTPUT_TEST_PHASE;
        if (phase === 'unknown') return {ok:false,status:503};
        let value;
        if (url.includes('/git/ref/')) value = {ref:'refs/heads/${identity.branch}',object:{type:'commit',sha:phase === 'capture' ? '${old}' : '${head}'}};
        else if (url.includes('/contents/')) value = {type:'file',encoding:'base64',content:Buffer.from(JSON.stringify({runs:url.endsWith('${old}') || phase === 'missing' ? [] : [row]})).toString('base64')};
        else if (url.includes('/pulls?')) value = [pr];
        else if (url.endsWith('/pulls/940')) value = pr;
        else throw Error('Unexpected fixture URL');
        return {ok:true,status:200,json:async()=>value};
      };`);
    const cli = (mode, phase) => spawnSync(process.execPath, ['--import', preload, fileURLToPath(import.meta.url), mode, snapshotFile], {
      encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'fixture', GITHUB_REPOSITORY: identity.repo,
        GITHUB_RUN_ID: identity.run_id, GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: old, TODAY_DASH: identity.day,
        GITHUB_OUTPUT: path.join(directory, 'step-output'), SIMPLEMEMO_OUTPUT_TEST_PHASE: phase },
    });
    await t('real capture and verifier CLI bind a pending result', async () => {
      assert.equal(cli('--capture', 'capture').status, 0);
      const result = cli('--verify', 'verified'); assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).production_verified, false);
      assert.match(fs.readFileSync(path.join(directory, 'step-output'), 'utf8'), /verdict=verified/);
    });
    for (const verdict of ['missing', 'unknown']) await t('real verifier CLI fails with its specific verdict', async () => {
      const result = cli('--verify', verdict); assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).verdict, verdict);
    });
    await t('captured baseline is not silently overwritten', async () => assert.equal(cli('--capture', 'capture').status, 1));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
  console.log(`Output receipt selftest: ${tests} passed`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  if (args.includes('--check')) return checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
  const mode = args[0], filename = args[1];
  assert(['--capture', '--verify'].includes(mode) && path.isAbsolute(filename ?? ''), 'mode and absolute snapshot path required');
  let result;
  try {
    const identity = runIdentity(process.env);
    const get = githubReader(identity.repo, process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
    result = mode === '--capture' ? await capture(identity, get)
      : await verify(JSON.parse(fs.readFileSync(filename, 'utf8')), identity, get);
  } catch { result = unknown('開始前の証跡または今回の実行IDを確認できなかった'); }
  if (mode === '--capture') fs.writeFileSync(filename, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${result.verdict}\n`);
  if (mode === '--verify' && result.verdict !== 'verified') process.exitCode = 1;
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error(process.argv.includes('--selftest') ? error.stack : 'Output verification could not complete'); process.exitCode = 1; });
