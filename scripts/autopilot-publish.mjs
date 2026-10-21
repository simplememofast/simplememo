#!/usr/bin/env node
/**
 * Model-free publication of the Obsidian Autopilot (Actions route).
 *
 * The job where the model runs (job `autopilot` of obsidian-autopilot.yml) holds no
 * write credential: no GH_PAT, a read-only job token, no id-token, and a checkout
 * without persisted credentials. The model only commits locally. Its work leaves
 * that runner as an untrusted handoff (git bundle + request JSON + exit JSON), and
 * the `publish` job — a fresh runner that runs only this file from the workflow
 * commit, never the model — verifies it, pushes the day branch without force,
 * opens the PR, records the PR number with trusted code and pushes that record.
 *
 *   --pack     (model job, from a $GITHUB_SHA worktree) bundle the committed work
 *   --verify   (publish job, no credential) verdict: publish | push_only | none |
 *              duplicate | stopped | rejected_<code>
 *   --push     (PUBLISH_TOKEN) fast-forward push to claude/obsidian-auto-<day> only
 *   --open-pr  (PUBLISH_TOKEN) POST /pulls with the sanitized request
 *   --record   (no credential) run-ledger row with the PR number + regenerated report
 *   --check    workflow wiring guard;  --selftest  offline self-check
 *
 * Job logs are public: this file prints typed codes and counts only, never paths,
 * titles, commit messages, git stderr or credentials.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { OUTCOMES, validate as validateRuns } from './autopilot-runs.mjs';
import { hardDenyReason, MAX_COMMITS, MAX_TOTAL_BYTES, RECORD_PATHS } from './lib/autopilot-paths.mjs';

const require = createRequire(import.meta.url);
const { findUnapprovedPrincipals } = require('./merge-identity-check.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = 'simplememofast/simplememo';
export const REMOTE = `https://github.com/${REPO}.git`;
export const HANDOFF_REF = 'refs/autopilot/handoff';
export const QUARANTINE_REF = 'refs/autopilot/quarantine/head';
export const REMOTE_DAY_REF = 'refs/autopilot/quarantine/remote-day';
export const RECORD_IDENTITY = Object.freeze({ name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' });
const MAX_JSON_BYTES = 64 * 1024;
const MAX_BUNDLE_BYTES = 60 * 1024 * 1024;
const MAX_TITLE = 200;
const MAX_BODY = 30_000;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
export const REQUEST_ACTIONS = ['pr', 'push_only', 'none'];
export const VERDICTS = ['publish', 'push_only', 'none', 'duplicate', 'stopped'];
// repair_of (lane F): the run_ids a repair day names. Same shape the ledger holds (an array of
// run_ids); each must already exist in main's run ledger and must not be the run's own id.
export const MAX_REPAIR_TARGETS = 20;
const RUN_REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
// Act's interpretRun and the wiring checks read these step names by substring.
export const RESERVED_STEP_WORDS = ['Gate', 'Claude Code', '緊急停止', '封じ込め', '予算ゲート', '振り分け',
  '使用量上限', '資格情報かを切り分ける', '実行中の支出閾値で停止', 'ターン上限で停止', '判定コード:'];
export const PUBLISH_SECRET_STEPS = ['Push the work branch', 'Open the PR', 'Push the ledger commit'];

const sha40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const dayOk = value => typeof value === 'string' && /^\d{8}$/.test(value);
export const dayBranch = day => { assert(dayOk(day), 'day must be YYYYMMDD'); return `claude/obsidian-auto-${day}`; };
export class PublishError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new PublishError(code); };

// Git never runs repository hooks/fsmonitor here, ignores system config and never prompts.
export function gitEnv(token = null, base = process.env) {
  const env = { ...base, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_ASKPASS: 'echo', GCM_INTERACTIVE: 'never' };
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key)) delete env[key];
  delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE; delete env.GIT_OBJECT_DIRECTORY;
  if (token) {
    // The credential lives only in this child's environment: never argv, never .git/config.
    // A credential-bearing git reads no global config either (url.insteadOf / http.proxy planted
    // in ~/.gitconfig by an earlier step could redirect the push).
    env.GIT_CONFIG_GLOBAL = '/dev/null';
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  }
  return env;
}

export function git(cwd, args, { token = null, input, allowFail = false, encoding = 'utf8' } = {}) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], {
    cwd, env: gitEnv(token), input, encoding, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    if (allowFail) return null;
    fail('git_failed');
  }
  return result.stdout;
}

function readBounded(file, limit = MAX_JSON_BYTES) {
  let fd;
  try {
    if (!fs.lstatSync(file).isFile()) return { reason: 'not_file' };
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) return { reason: 'oversized' };
    const buffer = Buffer.alloc(limit + 1);
    const length = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (length > limit) return { reason: 'oversized' };
    return { bytes: buffer.subarray(0, length) };
  } catch (error) {
    return { reason: error.code === 'ENOENT' ? 'missing' : 'unreadable' };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function readJson(file) {
  const read = readBounded(file);
  if (!read.bytes) return { reason: read.reason };
  try { return { value: JSON.parse(read.bytes.toString('utf8')) }; } catch { return { reason: 'invalid_json' }; }
}

// ── request (written by the model: untrusted) ──────────────────────────────
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;
// Same vocabulary as the ledger's classes (no_artifact, usage_limit, route-absent, runner-timeout, ...).
const FAILURE_CLASS = /^[a-z][a-z0-9_-]{0,47}$/;
const plain = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

/**
 * Returns { request } or { code }. The run fields are re-validated by autopilot-runs.mjs when appended;
 * repair_of is checked here for shape and against main's ledger by repairOfCode() (verify and record).
 */
export function validateRequest(raw, day) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { code: 'request_shape' };
  const allowed = new Set(['action', 'title', 'body', 'run']);
  if (Object.keys(raw).some(key => !allowed.has(key))) return { code: 'request_unknown_field' };
  if (!REQUEST_ACTIONS.includes(raw.action)) return { code: 'request_action' };
  if (raw.action !== 'pr') return { request: { action: raw.action } };
  if (!plain(raw.title, MAX_TITLE)) return { code: 'request_title' };
  if (typeof raw.body !== 'string' || raw.body.length > MAX_BODY) return { code: 'request_body' };
  const run = raw.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return { code: 'request_run' };
  const runFields = new Set(['run_id', 'outcome', 'lane', 'action', 'artifact', 'failure_reason', 'failure_class', 'repair_of']);
  if (Object.keys(run).some(key => !runFields.has(key))) return { code: 'request_run_unknown_field' };
  const id = /^ap-(\d{8})-actions(?:-\d{1,20})?$/.exec(run.run_id ?? '');
  if (!id || id[1] !== day) return { code: 'request_run_id' };
  if (!OUTCOMES.includes(run.outcome) || !['shipped', 'no_artifact', 'failed'].includes(run.outcome)) return { code: 'request_outcome' };
  if (run.lane != null && !/^[A-F]$/.test(run.lane)) return { code: 'request_lane' };
  if (run.action != null && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(run.action)) return { code: 'request_run_action' };
  if (run.artifact != null && !plain(run.artifact, 300)) return { code: 'request_artifact' };
  if (run.failure_reason != null && !plain(run.failure_reason, 500)) return { code: 'request_failure_reason' };
  if (run.failure_class != null && !(typeof run.failure_class === 'string' && FAILURE_CLASS.test(run.failure_class))) return { code: 'request_failure_class' };
  // A day that did not ship is recorded with why (autopilot-runs.mjs validate() requires failure_reason)
  // and what kind (autopilot-selfheal.mjs --check requires failure_class). Refused here, before any push,
  // instead of failing in record after the PR is open.
  if (run.outcome !== 'shipped' && run.failure_reason == null) return { code: 'request_failure_reason' };
  if (run.outcome !== 'shipped' && run.failure_class == null) return { code: 'request_failure_class' };
  if (run.repair_of != null) {
    const targets = run.repair_of;
    if (!Array.isArray(targets) || !targets.length || targets.length > MAX_REPAIR_TARGETS
      || !targets.every(target => typeof target === 'string' && RUN_REF.test(target))
      || new Set(targets).size !== targets.length) return { code: 'request_repair_of' };
    if (targets.includes(run.run_id)) return { code: 'request_repair_of_self' };
  }
  return { request: { action: 'pr', title: raw.title.replace(CONTROL, ''), body: raw.body.replace(CONTROL, ''),
    run: Object.fromEntries(Object.entries(run).filter(([, value]) => value != null)
      .map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) } };
}

/** run_ids of main's run ledger as last fetched (the trusted base), or null when unreadable. */
export function baseRunIds(repo) {
  const text = git(repo, ['show', 'refs/remotes/origin/main:data/autopilot-runs.json'], { allowFail: true });
  try {
    const doc = JSON.parse(text);
    return Array.isArray(doc?.runs) ? new Set(doc.runs.map(row => row?.run_id).filter(id => typeof id === 'string')) : null;
  } catch { return null; }
}

/** null when the run names no repair, or names only existing runs other than itself; else a typed code. */
export function repairOfCode(run, ids) {
  if (run?.repair_of == null) return null;
  if (!ids) return 'repair_of_base_unreadable';
  // A run without its own id cannot name a repair (fails closed instead of dropping the self check).
  if (typeof run.run_id !== 'string' || run.repair_of.includes(run.run_id)) return 'repair_of_unknown';
  return run.repair_of.every(target => ids.has(target)) ? null : 'repair_of_unknown';
}

export function prPayload(request, day) {
  return { title: request.title, head: dayBranch(day), base: 'main',
    body: request.body.slice(0, MAX_BODY), maintainer_can_modify: false, draft: false };
}

// ── pack (model job; output is untrusted by construction) ─────────────────
export function pack({ workspace, out, day, takeover = false, runnerTemp = process.env.RUNNER_TEMP }) {
  assert(path.isAbsolute(workspace) && path.isAbsolute(out), 'absolute paths required');
  const real = fs.realpathSync(workspace);
  const parent = fs.realpathSync(path.dirname(out));
  assert(!(parent + path.sep).startsWith(real + path.sep) && parent !== real, 'handoff must be outside the repository');
  fs.mkdirSync(out, { mode: 0o700 });
  const manifest = { schema_version: 1, day, takeover: takeover === true, head: null, base: null, commit_count: 0, files: {} };
  const head = git(workspace, ['rev-parse', '--verify', 'HEAD^{commit}'], { allowFail: true })?.trim();
  let base = null;
  if (takeover) {
    const claim = git(workspace, ['rev-parse', '--verify', `refs/remotes/origin/${dayBranch(day)}^{commit}`], { allowFail: true })?.trim();
    if (claim && git(workspace, ['merge-base', '--is-ancestor', claim, head], { allowFail: true }) !== null) base = claim;
  }
  base ??= git(workspace, ['merge-base', head, 'refs/remotes/origin/main'], { allowFail: true })?.trim() ?? null;
  if (sha40(head) && sha40(base) && head !== base) {
    manifest.head = head; manifest.base = base;
    manifest.commit_count = Number(git(workspace, ['rev-list', '--count', head, `^${base}`]).trim());
    git(workspace, ['update-ref', HANDOFF_REF, head]);
    git(workspace, ['bundle', 'create', path.join(out, 'work.bundle'), HANDOFF_REF, `^${base}`]);
  }
  for (const [from, to] of [['autopilot-pr-request.json', 'request.json'], ['autopilot-exit.json', 'exit.json']]) {
    const read = runnerTemp ? readBounded(path.join(runnerTemp, from)) : { reason: 'missing' };
    if (read.bytes) fs.writeFileSync(path.join(out, to), read.bytes, { mode: 0o600, flag: 'wx' });
  }
  for (const name of ['work.bundle', 'request.json', 'exit.json']) {
    const file = path.join(out, name);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    manifest.files[name] = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return { commit_count: manifest.commit_count, bundled: Boolean(manifest.head) };
}

// ── verify (publish job, no credential) ────────────────────────────────────
function parseRaw(text) {
  // diff-tree/diff --raw -z: ":<old> <new> <oldsha> <newsha> <status>\0<path>\0"
  const fields = text.split('\0');
  const entries = [];
  let i = 0;
  while (i < fields.length) {
    const meta = fields[i].replace(/^\n/, '');
    if (!meta) { i += 1; continue; }
    const m = /^:(\d{6}) (\d{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([A-Z])\d*$/.exec(meta);
    if (!m || fields[i + 1] === undefined) fail('rejected_unparsed_diff');
    entries.push({ oldMode: m[1], mode: m[2], oldSha: m[3], sha: m[4], status: m[5], path: fields[i + 1] });
    i += 2;
  }
  return entries;
}

function blobSizes(repo, shas) {
  const unique = [...new Set(shas.filter(s => s && !/^0{40}$/.test(s)))];
  if (!unique.length) return new Map();
  const out = git(repo, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { input: unique.join('\n') + '\n' });
  const sizes = new Map();
  for (const line of out.trim().split('\n')) {
    const [sha, type, size] = line.split(' ');
    if (type !== 'blob') fail('rejected_object_type');
    sizes.set(sha, Number(size));
  }
  return sizes;
}

function checkEntries(repo, entries, gscDay) {
  // Mode and path first: a gitlink or symlink is refused before any object is read.
  for (const entry of entries) {
    const reason = hardDenyReason(entry.path, { mode: entry.mode, gscDay });
    if (reason) fail(`rejected_${reason}`);
  }
  const sizes = blobSizes(repo, entries.filter(e => e.status !== 'D').map(e => e.sha));
  for (const entry of entries) {
    if (!['A', 'M', 'D', 'T'].includes(entry.status)) fail('rejected_diff_status');
    const reason = hardDenyReason(entry.path, { mode: entry.mode, size: entry.status === 'D' ? null : sizes.get(entry.sha) ?? null, gscDay });
    if (reason) fail(`rejected_${reason}`);
  }
  return sizes;
}

function mainEntry(repo, cache, file) {
  if (!cache.map) {
    cache.map = new Map();
    const listing = git(repo, ['ls-tree', '-r', '-z', '--full-tree', 'refs/remotes/origin/main']);
    for (const row of listing.split('\0').filter(Boolean)) {
      const tab = row.indexOf('\t');
      const [mode, , sha] = row.slice(0, tab).split(' ');
      cache.map.set(row.slice(tab + 1), `${mode} ${sha}`);
    }
  }
  return cache.map.get(file) ?? null;
}

function commitPrincipals(repo, commits) {
  const out = git(repo, ['show', '-s', '--format=%H%x00%an%x00%ae%x00%cn%x00%ce%x00%B%x1e', ...commits]);
  return out.split('\x1e').map(part => part.replace(/^\n/, '')).filter(Boolean).map(part => {
    const [sha, an, ae, cn, ce, ...message] = part.split('\0');
    return { sha, commit: { author: { name: an, email: ae }, committer: { name: cn, email: ce }, message: message.join('\0') } };
  });
}

/**
 * Everything in the handoff is model-controlled. Returns { verdict, head, commit_count, request }.
 * listPrs(branch) -> [{number}] (GitHub read, state=all); prodStatusDate() -> 'YYYY-MM-DD' | null.
 */
export async function verifyHandoff({ handoff, repo, day, takeover = false, force = false, modelOutcome,
  remote = 'origin', readToken = null, listPrs, prodStatusDate = async () => null, gscDay = null }) {
  const branch = dayBranch(day);
  const dash = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  if (!['success', 'failure'].includes(modelOutcome)) fail('rejected_model_outcome');
  const manifest = readJson(path.join(handoff, 'manifest.json'));
  if (!manifest.value) fail('rejected_handoff_missing');
  const bundle = path.join(handoff, 'work.bundle');
  if (!fs.existsSync(bundle)) return { verdict: 'none', commit_count: 0 };
  const st = fs.lstatSync(bundle);
  if (!st.isFile() || st.size > MAX_BUNDLE_BYTES) fail('rejected_bundle_size');

  // Fresh remote state, never the handoff's claims.
  // readToken is the job's read-only token (contents: read); it never reaches a push.
  git(repo, ['fetch', '--no-tags', '--quiet', remote, '+refs/heads/main:refs/remotes/origin/main'], { token: readToken });
  const remoteDay = git(repo, ['ls-remote', '--heads', remote, `refs/heads/${branch}`], { token: readToken }).trim().split(/\s+/)[0] || null;
  if (remoteDay) git(repo, ['fetch', '--no-tags', '--quiet', remote, `+refs/heads/${branch}:${REMOTE_DAY_REF}`], { token: readToken });

  const stop = (() => {
    const text = git(repo, ['show', 'refs/remotes/origin/main:data/emergency-stop.json'], { allowFail: true });
    try { const d = JSON.parse(text); return Boolean(d.stopped || d.agents?.actions?.stopped); } catch { return true; }
  })();
  if (stop) return { verdict: 'stopped', commit_count: 0 };

  if (git(repo, ['bundle', 'verify', '--quiet', bundle], { allowFail: true }) === null) fail('rejected_bundle_verify');
  const heads = git(repo, ['bundle', 'list-heads', bundle]).trim().split('\n').filter(Boolean);
  if (heads.length !== 1 || heads[0].split(' ')[1] !== HANDOFF_REF) fail('rejected_bundle_heads');
  git(repo, ['update-ref', '-d', QUARANTINE_REF], { allowFail: true });
  if (git(repo, ['-c', 'transfer.fsckObjects=true', '-c', 'fetch.fsckObjects=true', 'fetch', '--no-tags', '--quiet',
    bundle, `+${HANDOFF_REF}:${QUARANTINE_REF}`], { allowFail: true }) === null) fail('rejected_bundle_fetch');
  const head = git(repo, ['rev-parse', '--verify', `${QUARANTINE_REF}^{commit}`]).trim();

  const ancestor = (a, b) => git(repo, ['merge-base', '--is-ancestor', a, b], { allowFail: true }) !== null;
  if (ancestor(head, 'refs/remotes/origin/main')) return { verdict: 'none', head, commit_count: 0 };
  const base = git(repo, ['merge-base', head, 'refs/remotes/origin/main'], { allowFail: true })?.trim();
  if (!sha40(base)) fail('rejected_unrelated_history');
  const commits = git(repo, ['rev-list', '--reverse', head, '^refs/remotes/origin/main']).trim().split('\n').filter(Boolean);
  if (!commits.length) return { verdict: 'none', head, commit_count: 0 };
  if (commits.length > MAX_COMMITS) fail('rejected_too_many_commits');

  // Claim and duplicate checks: the day branch is claimed by this push, not earlier.
  if (remoteDay) {
    if (!(takeover || force)) return { verdict: 'duplicate', head, commit_count: commits.length };
    if (!ancestor(REMOTE_DAY_REF, head)) return { verdict: 'duplicate', head, commit_count: commits.length };
  }
  const prs = await listPrs(branch);
  if (!Array.isArray(prs)) fail('rejected_pr_inventory');
  if (prs.length) return { verdict: 'duplicate', head, commit_count: commits.length };
  if (!force) {
    const mainStatus = git(repo, ['show', 'refs/remotes/origin/main:data/autopilot-status.json'], { allowFail: true });
    let mainDate = null; try { mainDate = JSON.parse(mainStatus).date_jst; } catch { /* unreadable is not today */ }
    let prodDate = null; try { prodDate = await prodStatusDate(); } catch { /* unknown is not a duplicate */ }
    if (mainDate === dash || prodDate === dash) return { verdict: 'duplicate', head, commit_count: commits.length };
  }

  // Path, mode and size policy over every pushed commit and over the final tree.
  const cache = {};
  let total = 0;
  const seen = new Set();
  for (const commit of commits) {
    const parents = git(repo, ['rev-list', '--parents', '-n', '1', commit]).trim().split(' ').slice(1);
    for (const extra of parents.slice(1)) if (!ancestor(extra, 'refs/remotes/origin/main')) fail('rejected_merge_commit');
    let entries = parseRaw(git(repo, ['diff-tree', '-r', '-z', '--raw', '--no-abbrev', '--no-renames', '--no-commit-id',
      parents[0] ?? EMPTY_TREE, commit]));
    // A merge of main brings main's (already public, trusted) content: only check what differs from main.
    if (parents.length > 1) entries = entries.filter(e => mainEntry(repo, cache, e.path) !== `${e.mode} ${e.sha}`);
    const sizes = checkEntries(repo, entries, gscDay);
    for (const e of entries) if (e.status !== 'D' && !seen.has(e.sha)) { seen.add(e.sha); total += sizes.get(e.sha) ?? 0; }
    if (total > MAX_TOTAL_BYTES) fail('rejected_total_size');
  }
  checkEntries(repo, parseRaw(git(repo, ['diff', '-z', '--raw', '--no-abbrev', '--no-renames', '--no-ext-diff', '--no-textconv', base, head])), gscDay);

  // A forbidden identity must never reach a public branch (same rule as auto-merge).
  if (findUnapprovedPrincipals(commitPrincipals(repo, commits)).length) fail('rejected_identity');

  if (modelOutcome === 'failure') return { verdict: 'push_only', head, commit_count: commits.length };
  const raw = readJson(path.join(handoff, 'request.json'));
  if (!raw.value) fail(`rejected_request_${raw.reason}`);
  const checked = validateRequest(raw.value, day);
  if (!checked.request) fail(`rejected_${checked.code}`);
  // A repair names failures already on main (just fetched), never rows the branch itself added.
  const repairCode = checked.request.run?.repair_of ? repairOfCode(checked.request.run, baseRunIds(repo)) : null;
  if (repairCode) fail(`rejected_request_${repairCode}`);
  const verdict = checked.request.action === 'pr' ? 'publish' : checked.request.action;
  return { verdict, head, commit_count: commits.length, request: checked.request };
}

// ── push / open PR (PUBLISH_TOKEN, nothing else) ───────────────────────────
export function pushBranch({ repo, sha, day, token, remote = REMOTE }) {
  assert(sha40(sha), 'sha required');
  assert(token, 'PUBLISH_TOKEN required');
  // Plain fast-forward push of one ref. Never --force/--force-with-lease, never tags.
  const ok = git(repo, ['push', '--no-verify', '--porcelain', remote, `${sha}:refs/heads/${dayBranch(day)}`], { token, allowFail: true });
  return ok !== null;
}

export async function openPr({ request, day, token, fetchImpl = fetch }) {
  assert(token, 'PUBLISH_TOKEN required');
  const response = await fetchImpl(`https://api.github.com/repos/${REPO}/pulls`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
      'content-type': 'application/json', 'user-agent': 'simplememo-autopilot-publish' },
    body: JSON.stringify(prPayload(request, day)),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 201) fail(`open_pr_http_${response.status}`);
  const pr = await response.json();
  if (!Number.isInteger(pr?.number) || pr.number <= 0 || pr.head?.ref !== dayBranch(day)) fail('open_pr_response');
  return pr.number;
}

// ── record (no credential): trusted code over the pushed branch's data ─────
const OVERLAY = ['scripts', 'growth/scripts', 'growth/lib'];

export function record({ repo, trusted, sha, day, pr, request, runId, work, runner = defaultRunner }) {
  assert(sha40(sha) && Number.isInteger(pr) && pr > 0, 'sha and PR number required');
  assert(/^[1-9]\d*$/.test(runId ?? ''), 'run id required');
  assert(path.isAbsolute(work) && !fs.existsSync(work), 'fresh absolute work tree required');
  git(repo, ['worktree', 'add', '--detach', '--quiet', work, sha]);
  if (fs.existsSync(path.join(work, 'node_modules'))) fail('record_node_modules');
  for (const dir of OVERLAY) {
    fs.rmSync(path.join(work, dir), { recursive: true, force: true });
    if (fs.existsSync(path.join(trusted, dir))) fs.cpSync(path.join(trusted, dir), path.join(work, dir), { recursive: true, verbatimSymlinks: true });
  }
  const dash = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  const run = request.run;
  const runsFile = path.join(work, 'data/autopilot-runs.json');
  const doc = JSON.parse(fs.readFileSync(runsFile, 'utf8'));
  const existing = (doc.runs ?? []).find(row => row.run_id === run.run_id);
  if (existing) {
    // The session recorded its row itself: bind it to this PR (and to the requested repair_of), nothing else.
    if (existing.route !== 'actions' || existing.date_jst !== dash || String(existing.external_ref) !== runId) fail('record_foreign_row');
    // Only a row that already says what the request says: the same outcome and, on a day that did not
    // ship, the same failure class (selfheal --check refuses a failed row without one). Refused before anything
    // is written; nothing from the request is copied into a row the session wrote.
    if (existing.outcome !== run.outcome) fail('record_row_outcome');
    if (run.outcome !== 'shipped' && !(typeof existing.failure_class === 'string' && FAILURE_CLASS.test(existing.failure_class)
      && existing.failure_class === run.failure_class)) fail('record_row_failure_class');
    existing.pr = pr;
  } else {
    const args = ['scripts/autopilot-runs.mjs', '--append', '--run-id', run.run_id, '--date', dash, '--route', 'actions',
      '--outcome', run.outcome, '--pr', String(pr), '--external-ref', runId];
    for (const [key, flag] of [['lane', '--lane'], ['action', '--action'], ['artifact', '--artifact'],
      ['failure_reason', '--failure-reason'], ['failure_class', '--failure-class']]) if (run[key] != null) args.push(flag, run[key]);
    runner(work, 'node', args);
  }
  if (existing || run.repair_of) {
    // autopilot-runs.mjs --append has no repair_of flag: write it on the appended row, then validate
    // the whole ledger again (the ledger's own rules plus the self-repair rule that targets exist).
    const ledger = existing ? doc : JSON.parse(fs.readFileSync(runsFile, 'utf8'));
    const row = (ledger.runs ?? []).find(r => r.run_id === run.run_id);
    if (!row) fail('record_row_missing');
    if (run.repair_of) row.repair_of = [...run.repair_of];
    // Re-checked here: this step reads the request again from the handoff, and a row the session
    // wrote itself may carry its own repair_of. Targets must be on main and in this ledger.
    if (row.repair_of != null) {
      const ids = new Set(ledger.runs.map(r => r.run_id));
      if (!Array.isArray(row.repair_of) || repairOfCode(row, baseRunIds(repo)) || row.repair_of.some(target => !ids.has(target))) {
        fail('record_repair_of_unknown');
      }
    }
    if (validateRuns(ledger).length) fail('record_invalid_ledger');
    fs.writeFileSync(runsFile, JSON.stringify(ledger, null, 2) + '\n');
  }
  // The session wrote the status JSON before this row existed; its runs block is recounted from the
  // ledger now, in the same commit (autopilot-runs.mjs --check compares the two).
  runner(work, 'node', ['scripts/autopilot-runs.mjs', '--write-status']);
  runner(work, 'node', ['scripts/decision-monitor.mjs', '--publish-report']);
  runner(work, 'python3', ['-E', '-s', 'scripts/build_site_translations.py', '--write']);
  runner(work, 'python3', ['-E', '-s', 'scripts/generate_sitemap.py']);
  // Put the branch's own files back, then only the record paths may differ.
  git(work, ['checkout', '--quiet', 'HEAD', '--', ...OVERLAY.filter(dir => git(work, ['ls-tree', '-d', 'HEAD', dir]).trim())]);
  git(work, ['clean', '-fdxq', '--', ...OVERLAY]);
  const changed = git(work, ['status', '--porcelain', '-z', '--untracked-files=all']).split('\0').filter(Boolean).map(row => row.slice(3));
  // Only the record paths may change (RECORD_PATHS): the generators rebuild every translation, but a
  // page the session edited arrives with the translations the session built; one this step would
  // write is refused, not published. Each file is also held to the rule for the model's commits
  // (hardDenyReason: no symlink, no oversized file).
  for (const file of changed) {
    if (!RECORD_PATHS.includes(file)) fail('record_unexpected_change');
    const st = fs.lstatSync(path.join(work, file), { throwIfNoEntry: false });
    if (!st) continue;
    const mode = st.isSymbolicLink() ? '120000' : st.isFile() ? ((st.mode & 0o111) ? '100755' : '100644') : 'other';
    if (hardDenyReason(file, { mode, size: st.isFile() ? st.size : null })) fail('record_unexpected_change');
  }
  if (!changed.length) return { sha, changed: 0 };
  git(work, ['add', '--', ...changed]);
  git(work, ['-c', `user.name=${RECORD_IDENTITY.name}`, '-c', `user.email=${RECORD_IDENTITY.email}`, 'commit', '--no-verify', '--quiet',
    '-m', `chore(autopilot): record PR #${pr} for ${run.run_id}`]);
  return { sha: git(work, ['rev-parse', 'HEAD']).trim(), changed: changed.length };
}

function defaultRunner(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, stdio: ['ignore', 'ignore', 'ignore'],
    // The script directory is the trusted overlay; python3 -E -s ignores PYTHON* variables and user site.
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, timeout: 15 * 60_000 });
  if (result.status !== 0) fail(`record_step_failed_${path.basename(args.find(a => a.endsWith('.mjs') || a.endsWith('.py')) ?? command).replace(/\W/g, '_')}`);
}

// ── workflow wiring guard ──────────────────────────────────────────────────
export function splitJobs(source) {
  const body = source.split('\njobs:\n')[1];
  assert(body, 'jobs section missing');
  const jobs = new Map();
  const names = [...body.matchAll(/^  ([A-Za-z0-9_-]+):\n/gm)];
  names.forEach((m, i) => jobs.set(m[1], body.slice(m.index, names[i + 1]?.index ?? body.length)));
  return jobs;
}

const activeLines = text => text.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
const stepsOf = job => activeLines(job).split(/\n(?=      - name: )/).slice(1);
const stepName = step => step.match(/^      - name: (.*)$/m)?.[1].replace(/^"|"$/g, '') ?? '';

export function checkWiring(source) {
  assert.match(source, /\npermissions: \{\}\n/, 'workflow-level permissions must be empty');
  assert.doesNotMatch(activeLines(source), /id-token/, 'no job may request an OIDC token');
  const jobs = splitJobs(source);
  assert.deepEqual([...jobs.keys()], ['autopilot', 'publish', 'notify-completion'], 'job order: autopilot, publish, notify-completion');
  const model = activeLines(jobs.get('autopilot'));
  assert.match(model, /\n    permissions:\n      contents: read\n/, 'model job must declare read-only permissions');
  assert.doesNotMatch(model, /: write\b/, 'model job must hold no write permission');
  assert.doesNotMatch(model, /GH_PAT|PUBLISH_TOKEN/, 'GH_PAT must not be anywhere in the model job');
  const modelSecrets = [...model.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]);
  assert(modelSecrets.every(name => ['CLAUDE_CODE_OAUTH_TOKEN', 'GCP_SERVICE_ACCOUNT_JSON'].includes(name)), 'unexpected secret in the model job');
  const modelCheckouts = stepsOf(jobs.get('autopilot')).filter(step => /uses: actions\/checkout@/.test(step));
  assert(modelCheckouts.length === 1 && modelCheckouts.every(step => /persist-credentials: false/.test(step) && !/token:/.test(step)),
    'model checkout must not persist a credential');
  const claude = stepsOf(jobs.get('autopilot')).find(step => /\n        id: claude\n/.test(step));
  assert(claude && /github_token: \$\{\{ github\.token \}\}/.test(claude)
    && [...claude.matchAll(/GH_TOKEN: (.*)/g)].every(m => m[1].trim() === '${{ github.token }}'), 'model step gets only the read-only job token');
  const packStep = stepsOf(jobs.get('autopilot')).find(step => stepName(step) === 'Pack the work for the publish job');
  assert(packStep && /worktree add --detach "\$RUNNER_TEMP\/pack-tools" "\$GITHUB_SHA"/.test(packStep)
    && /node "\$RUNNER_TEMP\/pack-tools\/scripts\/autopilot-publish\.mjs" --pack/.test(packStep), 'pack must run from the workflow commit');

  const publish = jobs.get('publish');
  const pub = activeLines(publish);
  assert.match(pub, /\n    needs: autopilot\n/, 'publish runs after the model job');
  assert.match(pub, /\n    permissions:\n      contents: read\n/, 'publish job token is read-only (pushes use GH_PAT in named steps only)');
  assert.doesNotMatch(pub, /: write\b/);
  assert.doesNotMatch(pub, /claude-code-action|claude_code_oauth_token|CLAUDE_CODE_OAUTH_TOKEN|GCP_SERVICE_ACCOUNT_JSON/, 'no model and no model credential in publish');
  const steps = stepsOf(publish);
  const checkout = steps.find(step => /uses: actions\/checkout@/.test(step));
  assert(checkout && /ref: \$\{\{ github\.sha \}\}/.test(checkout) && /path: tools/.test(checkout)
    && /persist-credentials: false/.test(checkout) && !/token:/.test(checkout), 'publish checks out the workflow commit without credentials');
  // This job holds GH_PAT later: its actions are pinned to a full commit SHA, never a moving tag.
  assert(steps.filter(step => /uses: /.test(step)).every(step => /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}(?:\s|$)/.test(step)),
    'publish actions must be pinned to a full commit SHA');
  for (const step of steps) {
    const name = stepName(step);
    assert(!RESERVED_STEP_WORDS.some(word => name.includes(word)), `publish step name collides with Act's step keys: ${name}`);
    const secrets = [...step.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(m => m[1]);
    if (PUBLISH_SECRET_STEPS.includes(name)) {
      assert.deepEqual(secrets, ['GH_PAT'], `${name} must receive GH_PAT and nothing else`);
      assert.match(step, /PUBLISH_TOKEN: \$\{\{ secrets\.GH_PAT \}\}/);
    } else assert.equal(secrets.length, 0, `secret outside the publish credential steps: ${name}`);
    for (const m of step.matchAll(/\b(?:node|python3)\s+(\S+)/g)) {
      assert(/^"?\$GITHUB_WORKSPACE\/tools\/scripts\//.test(m[1]) || /^"?\$RUNNER_TEMP\/[a-z-]+-tools\/scripts\//.test(m[1]) || m[1] === '-e',
        `publish executes only workflow-commit tools: ${name}`);
    }
    // Pushes happen only inside the tool (plain fast-forward); no step pushes by itself.
    assert.doesNotMatch(step, /git\s+push|force-with-lease|--force\b(?!-run)/, 'publish never force-pushes');
  }
  for (const name of PUBLISH_SECRET_STEPS) assert(steps.some(step => stepName(step) === name), `missing publish step ${name}`);
  const notify = jobs.get('notify-completion');
  assert.match(notify, /\n    needs: \[autopilot, publish\]\n/, 'notify-completion waits for both jobs');
  return true;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function arg(argv, name, fallback = undefined) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${String(v ?? '').replace(/[\r\n]/g, '')}\n`).join(''));
}

function githubReadPrs(token) {
  return async branch => {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'simplememo-autopilot-publish',
      ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const response = await fetch(`https://api.github.com/repos/${REPO}/pulls?state=all&head=${encodeURIComponent(`simplememofast:${branch}`)}&per_page=100`,
      { headers, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) fail('rejected_pr_inventory');
    return response.json();
  };
}

async function prodStatusDate() {
  const response = await fetch('https://simplememofast.com/data/autopilot-status.json', { signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) return null;
  return (await response.json())?.date_jst ?? null;
}

function selftest() {
  let n = 0;
  const t = (cond, msg) => { assert(cond, msg); n++; };
  t(hardDenyReason('.github/workflows/x.yml') === 'denied_github', '.github denied');
  t(hardDenyReason('a/.git/config') === 'denied_segment', '.git segment denied');
  t(hardDenyReason('obsidian/index.html', { mode: '120000' }) === 'denied_symlink', 'symlink denied');
  t(hardDenyReason('vendor', { mode: '160000' }) === 'denied_gitlink', 'gitlink denied');
  t(hardDenyReason('obsidian/index.html', { mode: '100644', size: 10 }) === null, 'page allowed');
  t(hardDenyReason('../x') === 'invalid_path', 'traversal denied');
  const request = { action: 'pr', title: 'T', body: 'B‮', run: { run_id: 'ap-20261020-actions-1', outcome: 'shipped', lane: 'A' } };
  t(validateRequest(request, '20261020').request?.body === 'B', 'bidi controls stripped');
  t(validateRequest({ ...request, title: 'a\nb' }, '20261020').code === 'request_title', 'multi-line title refused');
  t(validateRequest({ ...request, run: { ...request.run, run_id: 'ap-20261019-actions-1' } }, '20261020').code === 'request_run_id', 'other day refused');
  t(validateRequest({ ...request, extra: 1 }, '20261020').code === 'request_unknown_field', 'unknown field refused');
  t(prPayload(validateRequest(request, '20261020').request, '20261020').body === 'B', 'PR body is the request body, nothing appended');
  const repair = { ...request, run: { ...request.run, lane: 'F', repair_of: ['ap-20261019-actions'] } };
  t(validateRequest(repair, '20261020').request?.run.repair_of?.[0] === 'ap-20261019-actions', 'repair_of carried');
  t(validateRequest({ ...repair, run: { ...repair.run, repair_of: 'ap-20261019-actions' } }, '20261020').code === 'request_repair_of', 'repair_of must be an array');
  t(validateRequest({ ...repair, run: { ...repair.run, repair_of: [request.run.run_id] } }, '20261020').code === 'request_repair_of_self', 'own id refused');
  t(repairOfCode(repair.run, new Set(['ap-20261018-actions'])) === 'repair_of_unknown', 'unknown target refused');
  t(repairOfCode(repair.run, new Set(['ap-20261019-actions'])) === null, 'known target accepted');
  t(repairOfCode(repair.run, null) === 'repair_of_base_unreadable', 'unreadable base refused');
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  checkWiring(workflow); n++;
  const publishStart = workflow.indexOf('\n  publish:\n');
  for (const [from, to] of [
    ['permissions: {}', 'permissions:\n  contents: write'],
    ['github_token: ${{ github.token }}', 'github_token: ${{ secrets.GH_PAT }}'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['needs: [autopilot, publish]', 'needs: autopilot'],
    ['PUBLISH_TOKEN: ${{ secrets.GH_PAT }}', 'PUBLISH_TOKEN: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}'],
  ]) {
    const mutated = workflow.replace(from, to);
    t(mutated !== workflow, `mutation applies: ${from}`);
    assert.throws(() => checkWiring(mutated), undefined, `mutation must fail: ${from}`); n++;
  }
  const renamed = workflow.slice(0, publishStart) + workflow.slice(publishStart).replace('name: Verify the handoff', 'name: Gate the handoff');
  assert.throws(() => checkWiring(renamed), /collides/); n++;
  const toolsMoved = workflow.slice(0, publishStart) + workflow.slice(publishStart).replace('"$GITHUB_WORKSPACE/tools/scripts/autopilot-publish.mjs" --verify', 'scripts/autopilot-publish.mjs --verify');
  t(toolsMoved !== workflow, 'tools mutation applies');
  assert.throws(() => checkWiring(toolsMoved), /workflow-commit tools/); n++;
  console.log(`autopilot-publish: ${n} path, request and workflow-wiring checks passed`);
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--selftest')) return selftest();
  if (argv.includes('--check')) {
    checkWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
    console.log('autopilot-publish: workflow wiring OK (model job has no write credential; publish runs only workflow-commit tools)');
    return;
  }
  assert(!argv.includes('--remote'), '--remote is a test-only parameter');
  const day = arg(argv, '--day');
  assert(dayOk(day), 'day must be YYYYMMDD');
  if (argv.includes('--pack')) {
    const result = pack({ workspace: path.resolve(arg(argv, '--workspace')), out: path.resolve(arg(argv, '--out')), day,
      takeover: arg(argv, '--takeover') === 'true' });
    output({ packed: 'true', commit_count: result.commit_count });
    console.log(`handoff packed: commits=${result.commit_count}`);
    return;
  }
  if (argv.includes('--verify')) {
    let result;
    try {
      result = await verifyHandoff({ handoff: path.resolve(arg(argv, '--handoff')), repo: path.resolve(arg(argv, '--repo-dir')), day,
        takeover: arg(argv, '--takeover') === 'true', force: arg(argv, '--force-run') === 'true', modelOutcome: arg(argv, '--model-outcome'),
        readToken: process.env.GH_TOKEN || null, listPrs: githubReadPrs(process.env.GH_TOKEN), prodStatusDate,
        gscDay: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10) });
    } catch (error) {
      result = { verdict: error instanceof PublishError && /^rejected_[a-z0-9_]+$/.test(error.code) ? error.code : 'rejected_verifier_error', commit_count: 0 };
    }
    output({ verdict: result.verdict, head: result.head ?? '', commit_count: result.commit_count ?? 0 });
    console.log(`handoff verdict: ${result.verdict} commits=${result.commit_count ?? 0}`);
    // A refused handoff is a failure to look at; duplicate/stopped/none publish nothing by design.
    if (result.verdict.startsWith('rejected_')) process.exitCode = 1;
    return;
  }
  if (argv.includes('--push')) {
    const ok = pushBranch({ repo: path.resolve(arg(argv, '--repo-dir')), sha: arg(argv, '--sha'), day, token: process.env.PUBLISH_TOKEN });
    output({ pushed: ok });
    console.log(`push: ${ok ? 'accepted' : 'rejected'}`);
    if (!ok) process.exitCode = 1;
    return;
  }
  const handoff = path.resolve(arg(argv, '--handoff'));
  const checked = validateRequest(readJson(path.join(handoff, 'request.json')).value, day);
  assert(checked.request?.action === 'pr', 'verified PR request required');
  if (argv.includes('--open-pr')) {
    const number = await openPr({ request: checked.request, day, token: process.env.PUBLISH_TOKEN });
    output({ pr: number });
    console.log(`pull request opened: #${number}`);
    return;
  }
  if (argv.includes('--record')) {
    const result = record({ repo: path.resolve(arg(argv, '--repo-dir')), trusted: path.resolve(arg(argv, '--repo-dir')),
      sha: arg(argv, '--sha'), day, pr: Number(arg(argv, '--pr')), request: checked.request, runId: process.env.GITHUB_RUN_ID,
      work: path.join(process.env.RUNNER_TEMP, 'record-work') });
    output({ record_sha: result.sha, record_changed: result.changed });
    console.log(`run record prepared: changed_files=${result.changed}`);
    return;
  }
  throw Error('Use --pack, --verify, --push, --open-pr, --record, --check or --selftest');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Typed codes only: git stderr, titles and paths can carry model-written text.
    console.error(`autopilot-publish failed: ${error instanceof PublishError ? error.code : process.argv.includes('--selftest') ? error.stack : 'error'}`);
    process.exitCode = 1;
  });
}
