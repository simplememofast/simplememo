#!/usr/bin/env node
/**
 * Owner approval for unattended Autopilot PRs (security audit F2/F3).
 *
 *   node scripts/autopilot-approval-check.mjs --selftest
 *
 * Owner decision (2026-10-20): "PRs that change HTML/JS or scripts need human
 * approval (no auto-merge)", for the unattended day branches
 * claude/obsidian-auto-<YYYYMMDD> only (the Actions route and the Mac Codex
 * automation). Every other branch keeps today's auto-merge behaviour.
 *
 * .github/workflows/auto-merge.yml loads this file from main (trusted code):
 *   - job auto-merge: a validated Autopilot PR still auto-merges when every
 *     changed path is a run ledger (LEDGER, or a newly added decision intent or
 *     rejection file). Anything else is class 'approval', GENERATED outputs
 *     (/autopilot/, its translations, sitemaps) included until a regeneration
 *     verifier exists. The PR stays open and labelled, and the run hands it to
 *     the job below. Any error in this evaluation withholds that PR only.
 *   - job merge-after-approval (environment autopilot-approval) runs after the
 *     owner approves. It merges only if that environment really has the owner as
 *     a required reviewer (GitHub creates a missing environment unprotected),
 *     the JST day is still the validated one (sitemap lastmod is the squash
 *     commit's JST date), and the PR still has the validated head, file list and
 *     identities.
 *
 * Pure functions only; the GitHub calls stay in the workflow. --selftest also runs
 * the workflow's own script bodies against a mocked GitHub client (no network).
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DAY_BRANCH, GENERATED, LEDGER, hardDenyReason, isAutopilotBranch, isLedgerPath } from './lib/autopilot-paths.mjs';

export { isAutopilotBranch };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APPROVAL_ENVIRONMENT = 'autopilot-approval';
export const APPROVAL_REVIEWER = 'simplememofast';
export const APPROVAL_LABEL = 'autopilot:owner-approval';
// GitHub's PR files endpoint lists at most 3000 files; beyond that the list is incomplete.
export const MAX_LISTED_FILES = 3000;
const MAX_SUMMARY_ROWS = 50;
const KNOWN_STATUSES = new Set(['added', 'removed', 'modified', 'renamed', 'copied', 'changed', 'unchanged']);
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * files: entries of GitHub pulls.listFiles; changedFiles: pulls.get().changed_files.
 * 'ledger' only when the list is complete and every entry is an added/modified ledger
 * path. GENERATED counts as approval (owner decision 3A). Anything unreadable is approval.
 */
export function autoMergeClass(files, changedFiles) {
  if (!Array.isArray(files)) return { class: 'approval', reasons: ['file_list_unavailable'] };
  if (!Number.isInteger(changedFiles) || changedFiles < 1 || changedFiles > MAX_LISTED_FILES
    || files.length !== changedFiles) {
    return { class: 'approval', reasons: ['file_list_incomplete'] };
  }
  const reasons = [];
  for (const entry of files) {
    const file = entry?.filename;
    const status = entry?.status;
    if (typeof file !== 'string' || !KNOWN_STATUSES.has(status)) { reasons.push('unreadable_entry'); continue; }
    if (hardDenyReason(file)) { reasons.push(`hard_deny:${file}`); continue; }
    // Renames and copies touch a second path; removals and mode changes are not appends.
    const appended = status === 'added' || status === 'modified';
    const moved = typeof entry.previous_filename === 'string';
    if (moved || !appended || !isLedgerPath(file, status === 'added' ? 'A' : 'M')) reasons.push(`approval:${file}`);
  }
  return { class: reasons.length === 0 ? 'ledger' : 'approval', reasons };
}

/** Order-independent fingerprint of the PR's file list (what the owner is asked to approve). */
export function fileListHash(files) {
  assert(Array.isArray(files), 'file list required');
  const rows = files.map(f => [String(f?.filename), String(f?.status), f?.sha ?? null, f?.previous_filename ?? null])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

/**
 * GET /repos/{o}/{r}/environments/autopilot-approval must show a required_reviewers rule
 * that names the owner. Anything else (unreadable, missing rule, other reviewers only)
 * fails closed: a workflow that references a missing environment gets an unprotected one.
 */
export function environmentProtection(environment, { name = APPROVAL_ENVIRONMENT, reviewer = APPROVAL_REVIEWER } = {}) {
  if (!environment || typeof environment !== 'object') return { ok: false, reason: 'environment_unreadable' };
  if (String(environment.name).toLowerCase() !== name) return { ok: false, reason: 'environment_name_mismatch' };
  const rules = Array.isArray(environment.protection_rules) ? environment.protection_rules : [];
  const required = rules.filter(rule => rule?.type === 'required_reviewers');
  if (required.length === 0) return { ok: false, reason: 'no_required_reviewers' };
  const named = required.some(rule => Array.isArray(rule.reviewers) && rule.reviewers.some(entry =>
    entry?.type === 'User' && typeof entry.reviewer?.login === 'string' && entry.reviewer.login.toLowerCase() === reviewer));
  return named ? { ok: true, reason: null } : { ok: false, reason: 'owner_not_required_reviewer' };
}

/** JST calendar day (YYYY-MM-DD) of an ISO timestamp or Date; null when unreadable. */
export function jstDay(value) {
  const ms = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Sitemap lastmod is content-derived from the squash commit's JST date. A PR validated on
 * day D and merged on D+1 leaves main's sitemaps stale and turns every PR red, so the
 * approval merge refuses once the JST day has changed (a refresh push is needed).
 */
export function sameJstDay(validatedAt, now) {
  const validatedDay = jstDay(validatedAt);
  const today = jstDay(now);
  return { ok: validatedDay !== null && validatedDay === today, validatedDay, today };
}

/** The auto-merge job's outputs, as handed to merge-after-approval through env. */
export function approvalInput(env) {
  const problems = [];
  const pr = String(env?.APPROVAL_PR ?? '');
  const sha = String(env?.APPROVAL_SHA ?? '');
  const files = String(env?.APPROVAL_FILES ?? '');
  const validatedAt = String(env?.VALIDATED_AT ?? '');
  if (!/^[1-9]\d{0,9}$/.test(pr)) problems.push('approval_pr');
  if (!/^[a-f0-9]{40}$/.test(sha)) problems.push('approval_sha');
  if (!/^[a-f0-9]{64}$/.test(files)) problems.push('approval_files');
  if (!ISO_UTC.test(validatedAt) || jstDay(validatedAt) === null) problems.push('validated_at');
  if (problems.length) return { ok: false, problems };
  return { ok: true, pr: Number(pr), sha, files, validatedAt };
}

// Paths and reasons come from a PR an agent wrote. Render every character outside a
// small safe set as a numeric entity, so the step summary shows text, never markup.
export function escapeText(text) {
  return Array.from(String(text), ch => (/[A-Za-z0-9/.:-]/.test(ch) ? ch : `&#${ch.codePointAt(0)};`)).join('');
}

export function approvalSummary({ pr, reasons }) {
  const list = Array.isArray(reasons) ? reasons : [];
  const lines = [
    `PR #${escapeText(pr)} は無人の自律運転ブランチで、台帳以外のパスを変えるため自動マージしなかった（2026-10-20 オーナー判断）。`,
    `出荷するなら、この run の <b>merge-after-approval</b>（Environment <code>${APPROVAL_ENVIRONMENT}</code>）を`
      + '<b>検証と同じ JST の日のうちに</b>承認する。または PR を読んで手でマージする。',
    '',
    ...list.slice(0, MAX_SUMMARY_ROWS).map(reason => `- <code>${escapeText(reason)}</code>`),
  ];
  if (list.length > MAX_SUMMARY_ROWS) lines.push(`- ほか ${list.length - MAX_SUMMARY_ROWS} 件`);
  return `${lines.join('\n')}\n`;
}

const REFUSAL_ADVICE = {
  environment: `Settings → Environments → ${APPROVAL_ENVIRONMENT} の Required reviewers に ${APPROVAL_REVIEWER} を入れる`
    + '（Deployment branches は main）。それまでは承認しても何もマージしない。PR を読んで手でマージしてもよい。',
  input: '検証のときにファイル一覧が読めなかったか、引き渡しが欠けている。この run を Re-run all jobs で再実行するか、PR を読んで手でマージする。',
  day: '検証した JST の日と今日が違う。sitemap の lastmod は squash コミットの JST 日付なので、このままマージすると main の sitemap がずれる。'
    + 'ブランチで生成物（/autopilot/・翻訳・sitemap）を作り直して push し、次の検証の承認をその日のうちに行う。',
  changed: '検証の後で PR が変わった（閉じた・draft・head・base・ブランチ・ファイル一覧）。新しい検証の承認を待つ。',
  identity: '開いた人かコミットの名義の確認に通らない。PR を読んで判断する。',
};
export const REFUSALS = {
  environment_unreadable: 'environment', environment_name_mismatch: 'environment',
  no_required_reviewers: 'environment', owner_not_required_reviewer: 'environment',
  invalid_input: 'input', not_autopilot_branch: 'changed', jst_day_changed: 'day', pr_changed: 'changed',
  file_list_changed: 'changed', unapproved_opener: 'identity', commit_identity: 'identity',
};

/** code: one of REFUSALS (fixed identifiers; anything else is shown as 'unknown'). */
export function refusalSummary(code) {
  const known = Object.hasOwn(REFUSALS, code) ? code : 'unknown';
  const advice = REFUSAL_ADVICE[REFUSALS[known]] ?? REFUSAL_ADVICE.changed;
  return `マージしなかった: <code>${known}</code>\n\n${advice}\n`;
}

// ── self-test ────────────────────────────────────────────────────────────────
// The workflow bodies are executed as GitHub runs them (github-script wraps the body in
// an async function with context/github/core/require). Fixtures are disposable.

export function workflowBodies(text) {
  const split = text.split('\n  merge-after-approval:\n');
  const body = part => part?.match(/          script: \|\n((?:            .*\n|\n)+)/)?.[1];
  return { autoMerge: body(split[0]), approval: body(split[1]), approvalJob: split[1] === undefined ? '' : `\n${split[1]}` };
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const OWNER = 'simplememofast';
const REPO_NAME = 'simplememo';
const SHA = 'a'.repeat(40);

function fixturePr(over = {}) {
  return { number: 123, state: 'open', draft: false, base: { ref: 'main' },
    head: { ref: over.branch ?? 'claude/obsidian-auto-20261020', sha: SHA, repo: { full_name: `${OWNER}/${REPO_NAME}` } },
    user: { login: OWNER }, commits: 1, changed_files: over.files?.length ?? 1, ...over.pr };
}

function mockGithub({ pr, files, environment, extraOpen = [], fail = {} }) {
  const calls = { merged: [], labels: [], listFiles: 0, listArgs: [] };
  const commits = [{ sha: SHA, commit: {
    author: { name: fail.authorName ?? 'SimpleMemo Developer', email: 'simplememo.com@gmail.com' },
    committer: { name: 'GitHub', email: 'noreply@github.com' }, message: 'Safe fixture' } }];
  const pulls = {
    list: async args => { calls.listArgs.push(args); return { data: [pr, ...extraOpen] }; },
    get: async () => ({ data: pr }),
    listCommits: async () => ({}),
    listFiles: async () => ({}),
    merge: async args => { calls.merged.push(args); return { data: { sha: 'b'.repeat(40) } }; },
  };
  const github = {
    rest: { pulls,
      users: { getByUsername: async () => ({ data: { login: OWNER, name: 'SimpleMemo Developer', email: 'simplememo.com@gmail.com' } }) },
      issues: { addLabels: async args => { if (fail.label) throw new Error('label'); calls.labels.push(args); return { data: [] }; } } },
    paginate: async (fn, args) => {
      if (fn === pulls.listCommits) return commits;
      if (fn === pulls.listFiles) { calls.listFiles++; if (fail.listFiles) throw new Error('listFiles'); return files; }
      throw new Error('unexpected paginate');
    },
    request: async (route, params) => {
      assert.equal(route, 'GET /repos/{owner}/{repo}/environments/{environment_name}');
      assert.equal(params.environment_name, APPROVAL_ENVIRONMENT);
      if (!environment) throw Object.assign(new Error('Not Found'), { status: 404 });
      return { data: environment };
    },
  };
  return { github, calls };
}

function mockCore(fail = {}) {
  const out = { outputs: {}, failed: [], summaries: [] };
  let pending = [];
  const summary = {
    addHeading(text) { pending.push(String(text)); return summary; },
    addRaw(text) { pending.push(String(text)); return summary; },
    async write() { if (fail.summary) throw new Error('summary'); out.summaries.push(pending.join('\n')); pending = []; return summary; },
  };
  return { out, core: { info() {}, notice() {}, warning() {}, summary,
    setOutput(key, value) { out.outputs[key] = value; }, setFailed(message) { out.failed.push(String(message)); } } };
}

const PROTECTED = { name: APPROVAL_ENVIRONMENT, protection_rules: [
  { type: 'wait_timer', wait_timer: 0 },
  { type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { login: OWNER } }] }] };

async function selftest() {
  let n = 0;
  const t = (cond, msg) => { assert(cond, msg); n++; };
  const file = (filename, status = 'modified', extra = {}) => ({ filename, status, sha: 'c'.repeat(40), ...extra });

  // Classification (owner decision 3A: only LEDGER paths auto-merge).
  const ledgerOnly = [file('data/autopilot-status.json'), file('data/autopilot-runs.json'), file('data/autopilot-cost.json'),
    file('docs/obsidian/AUTOPILOT_LOG.md'), file('data/decision-intents/x-20261020.json', 'added'),
    file('data/decision-rejections/y-20261020.json', 'added')];
  t(autoMergeClass(ledgerOnly, ledgerOnly.length).class === 'ledger', 'ledger-only PR auto-merges');
  t(LEDGER.every(p => autoMergeClass([file(p)], 1).class === 'ledger'), 'every LEDGER path is ledger');
  t(GENERATED.every(p => autoMergeClass([file(p)], 1).class === 'approval'), 'GENERATED needs approval (3A)');
  for (const p of ['index.html', 'obsidian/index.html', 'assets/app.js', 'scripts/autopilot-approval-check.mjs',
    'scripts/lib/autopilot-paths.mjs', 'docs/obsidian/AUTOPILOT_RUNBOOK.md', 'data/emergency-stop.json', 'functions/_middleware.js']) {
    t(autoMergeClass([file(p)], 1).reasons[0] === `approval:${p}`, `approval: ${p}`);
  }
  t(autoMergeClass([file('.github/workflows/auto-merge.yml')], 1).reasons[0].startsWith('hard_deny:'), 'hard-denied path needs approval');
  t(autoMergeClass([file('data/decision-intents/x.json', 'modified')], 1).class === 'approval', 'editing a declaration is not an append');
  t(autoMergeClass([file('data/autopilot-runs.json', 'removed')], 1).class === 'approval', 'removing a ledger is not an append');
  t(autoMergeClass([file('data/autopilot-runs.json', 'changed')], 1).class === 'approval', 'mode/type change is not an append');
  t(autoMergeClass([file('data/autopilot-status.json', 'renamed', { previous_filename: 'index.html' })], 1).class === 'approval',
    'a rename also touches its source path');
  t(autoMergeClass([file('data/autopilot-status.json', 'copied', { previous_filename: 'x.json' })], 1).class === 'approval', 'copy needs approval');
  t(autoMergeClass([file('data/autopilot-status.json', 'weird')], 1).class === 'approval', 'unknown status needs approval');
  t(autoMergeClass([{ status: 'modified' }], 1).class === 'approval', 'unreadable entry needs approval');
  t(autoMergeClass(null, 1).class === 'approval', 'no list needs approval');
  t(autoMergeClass(ledgerOnly, ledgerOnly.length + 1).class === 'approval', 'short list needs approval');
  t(autoMergeClass([], 0).class === 'approval', 'empty PR needs approval');
  t(autoMergeClass([file('data/autopilot-status.json')], MAX_LISTED_FILES + 1).class === 'approval', 'over 3000 files needs approval');

  // Fingerprint, environment protection, JST day guard, inputs, escaping.
  t(fileListHash([file('a'), file('b')]) === fileListHash([file('b'), file('a')]), 'hash ignores order');
  t(fileListHash([file('a')]) !== fileListHash([file('a', 'removed')]), 'hash covers status');
  t(fileListHash([file('a')]) !== fileListHash([{ ...file('a'), sha: 'd'.repeat(40) }]), 'hash covers content');
  t(environmentProtection(PROTECTED).ok, 'owner as required reviewer accepted');
  t(environmentProtection({ ...PROTECTED, name: 'Autopilot-Approval' }).ok, 'environment names are case-insensitive');
  t(environmentProtection(null).reason === 'environment_unreadable', 'unreadable environment refused');
  t(environmentProtection({ name: APPROVAL_ENVIRONMENT, protection_rules: [] }).reason === 'no_required_reviewers',
    'auto-created (unprotected) environment refused');
  t(environmentProtection({ name: APPROVAL_ENVIRONMENT }).reason === 'no_required_reviewers', 'missing rules refused');
  t(environmentProtection({ name: APPROVAL_ENVIRONMENT, protection_rules: [{ type: 'wait_timer', wait_timer: 5 }] }).ok === false,
    'a wait timer is not an approval');
  t(environmentProtection({ name: APPROVAL_ENVIRONMENT, protection_rules: [{ type: 'required_reviewers',
    reviewers: [{ type: 'User', reviewer: { login: 'someone-else' } }] }] }).reason === 'owner_not_required_reviewer', 'other reviewer refused');
  t(environmentProtection({ name: APPROVAL_ENVIRONMENT, protection_rules: [{ type: 'required_reviewers',
    reviewers: [{ type: 'Team', reviewer: { slug: OWNER } }] }] }).reason === 'owner_not_required_reviewer', 'team named like the owner refused');
  t(environmentProtection({ ...PROTECTED, name: 'production' }).reason === 'environment_name_mismatch', 'other environment refused');
  t(sameJstDay('2026-10-20T14:59:59Z', new Date('2026-10-20T00:00:00Z')).ok, 'same JST day (00:00Z = 09:00 JST)');
  t(!sameJstDay('2026-10-20T14:59:59Z', new Date('2026-10-20T15:00:00Z')).ok, 'JST midnight crossed');
  t(sameJstDay('2026-10-20T15:00:00Z', new Date('2026-10-21T14:59:59Z')).validatedDay === '2026-10-21', 'JST day of 15:00Z');
  t(!sameJstDay('', new Date()).ok && !sameJstDay('garbage', new Date()).ok, 'unreadable validation time refused');
  const input = { APPROVAL_PR: '123', APPROVAL_SHA: SHA, APPROVAL_FILES: 'e'.repeat(64), VALIDATED_AT: '2026-10-20T01:02:03Z' };
  t(approvalInput(input).ok && approvalInput(input).pr === 123, 'complete input accepted');
  for (const [key, value] of [['APPROVAL_PR', '0'], ['APPROVAL_PR', '12a'], ['APPROVAL_SHA', 'A'.repeat(40)],
    ['APPROVAL_FILES', ''], ['VALIDATED_AT', '2026-10-20'], ['VALIDATED_AT', '']]) {
    t(!approvalInput({ ...input, [key]: value }).ok, `input ${key}=${JSON.stringify(value)} refused`);
  }
  t(escapeText('<img src=x>[a](b)`*_') === '&#60;img&#32;src&#61;x&#62;&#91;a&#93;&#40;b&#41;&#96;&#42;&#95;', 'summary text escaped');
  t(!approvalSummary({ pr: 1, reasons: ['approval:</code><script>'] }).includes('<script>'), 'no markup from paths');
  t(approvalSummary({ pr: 1, reasons: Array.from({ length: 60 }, (_, i) => `approval:p${i}`) }).includes('ほか 10 件'), 'long lists truncated');
  t(Object.keys(REFUSALS).every(code => refusalSummary(code).includes(code)), 'every refusal has advice');

  // Workflow wiring (auto-merge.yml from this checkout).
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/auto-merge.yml'), 'utf8');
  const { autoMerge, approval, approvalJob } = workflowBodies(workflow);
  t(Boolean(autoMerge) && Boolean(approval), 'both script bodies present');
  t(autoMerge.includes(`if (${DAY_BRANCH}.test(branch))`), 'auto-merge scope is the DAY_BRANCH pattern of autopilot-paths.mjs');
  t(autoMerge.includes(`'${APPROVAL_LABEL}'`), 'auto-merge applies the approval label');
  t(/\n    needs: auto-merge\n/.test(approvalJob), 'approval job needs auto-merge');
  t(approvalJob.includes("\n    if: needs.auto-merge.outputs.approval_pr != ''\n"), 'approval job only for approval-class PRs');
  t(approvalJob.includes(`\n    environment: ${APPROVAL_ENVIRONMENT}\n`), 'approval job waits for the protected environment');
  t(/\n    concurrency:\n      group: autopilot-approval-\$\{\{ needs\.auto-merge\.outputs\.approval_pr \}\}\n      cancel-in-progress: true\n/.test(approvalJob),
    'one pending approval per PR');
  const [approvalOnly, indexnowJob = ''] = approvalJob.split('\n  indexnow-after-approval:\n');
  t(!/\n\s+run:/.test(approvalOnly), 'the job holding the write token runs no script from the merged tree');
  t(/^ {4}needs: merge-after-approval\n/.test(indexnowJob) && /\n {4}permissions:\n {6}contents: read\n {4}steps:/.test(indexnowJob),
    'IndexNow after an approved merge runs in a read-only job');
  t(!/secrets\./.test(workflow), 'auto-merge.yml uses no secrets');
  const checkouts = workflow.match(/uses: actions\/checkout@/g)?.length ?? 0;
  const unpersisted = workflow.match(/\n {10}persist-credentials: false\n/g)?.length ?? 0;
  t(checkouts > 0 && unpersisted === checkouts, 'every checkout in auto-merge.yml drops its credential');
  for (const output of ['approval_pr', 'approval_sha', 'approval_files', 'validated_at']) {
    t(workflow.includes(`\n      ${output}: \${{ steps.merge.outputs.${output} }}\n`), `auto-merge job exports ${output}`);
    t(approvalJob.includes(`: \${{ needs.auto-merge.outputs.${output} }}\n`), `approval job reads ${output} through env`);
  }
  const seo = fs.readFileSync(path.join(ROOT, '.github/workflows/seo-check.yml'), 'utf8');
  t(/\npermissions:\n  contents: read\n/.test(seo.split('\njobs:\n')[0]), 'SEO Validation runs PR code with a read-only token');
  t((seo.match(/^permissions:/gm) ?? []).length === 1, 'SEO Validation declares exactly one top-level permissions block');
  t(/\n {6}- uses: actions\/checkout@(?:v\d+|[0-9a-f]{40}(?: # v\d+(?:\.\d+)*)?)\n {8}with:\n {10}fetch-depth: 0\n {10}persist-credentials: false\n/.test(seo),
    'SEO Validation checkout keeps no credential');

  // Execute the workflow bodies.
  const identity = createRequire(import.meta.url)('./merge-identity-check.js');
  const requireIdentity = source => { assert(source.endsWith('/scripts/merge-identity-check.js')); return identity; };
  const savedEnv = { ...process.env };
  const restoreEnv = () => {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  };
  const runAutoMerge = async ({ branch = 'claude/obsidian-auto-20261020', files = [file('index.html')], pr: prOver = {},
    extraOpen = [], fail = {}, workspace = ROOT } = {}) => {
    const pr = fixturePr({ branch, files, pr: prOver });
    const { github, calls } = mockGithub({ pr, files, extraOpen, fail });
    const { core, out } = mockCore(fail);
    process.env.GITHUB_WORKSPACE = workspace;
    try {
      await new AsyncFunction('context', 'github', 'core', 'require', autoMerge)(
        { repo: { owner: OWNER, repo: REPO_NAME }, payload: { workflow_run: {
          head_branch: branch, head_sha: SHA, event: 'pull_request', created_at: '2026-10-20T01:02:03Z' } } },
        github, core, requireIdentity);
    } finally { restoreEnv(); }
    return { calls, out };
  };

  let r = await runAutoMerge({ files: ledgerOnly });
  t(r.calls.merged.length === 1 && !r.out.outputs.approval_pr && r.out.failed.length === 0, 'autopilot ledger-only PR merges');
  t(r.calls.listArgs[0]?.base === 'main', 'PR lookup is limited to main');
  for (const files of [[file('index.html')], [file('autopilot/index.html'), file('sitemap.xml')],
    [file('scripts/x.mjs'), file('data/autopilot-runs.json')]]) {
    r = await runAutoMerge({ files });
    t(r.calls.merged.length === 0 && r.out.failed.length === 0, `autopilot ${files[0].filename} waits, no setFailed`);
    t(r.out.outputs.approval_pr === '123' && r.out.outputs.approval_sha === SHA
      && r.out.outputs.approval_files === fileListHash(files) && r.out.outputs.validated_at === '2026-10-20T01:02:03Z',
    'approval outputs handed to merge-after-approval');
    t(r.calls.labels[0]?.labels?.[0] === APPROVAL_LABEL && r.out.summaries.length === 1, 'labelled and summarised');
  }
  r = await runAutoMerge({ fail: { listFiles: true } });
  t(r.calls.merged.length === 0 && r.out.failed.length === 0 && r.out.outputs.approval_pr === '123'
    && r.out.outputs.approval_files === '', 'a policy error withholds this PR only');
  r = await runAutoMerge({ workspace: path.join(ROOT, 'no-such-checkout') });
  t(r.calls.merged.length === 0 && r.out.failed.length === 0 && r.out.outputs.approval_pr === '123', 'unloadable policy withholds');
  r = await runAutoMerge({ pr: { changed_files: MAX_LISTED_FILES + 1 } });
  t(r.calls.merged.length === 0 && r.calls.listFiles === 0 && r.out.outputs.approval_pr === '123', 'over 3000 files: approval without listing');
  r = await runAutoMerge({ fail: { label: true, summary: true } });
  t(r.calls.merged.length === 0 && r.out.failed.length === 0 && r.out.outputs.approval_pr === '123', 'label/summary failures are display only');
  for (const branch of ['claude/autopilot-act-20261020', 'claude/obsidian-auto-20261020-owner-recovery', 'claude/obsidian-auto-test',
    'Codex/decision-observe-20261020', 'Codex/routine-observations', 'Codex/trend-radar-observations', 'claude/seo-weekly-snapshot']) {
    r = await runAutoMerge({ branch, files: [file('index.html'), file('scripts/x.mjs')] });
    t(r.calls.merged.length === 1 && r.calls.listFiles === 0 && !r.out.outputs.approval_pr, `${branch} keeps auto-merging`);
  }
  r = await runAutoMerge({ files: ledgerOnly, extraOpen: [fixturePr({ pr: { number: 124 } })] });
  t(r.calls.merged.length === 0 && r.out.failed.length === 1, 'more than one open PR into main withholds');

  const runApproval = async ({ environment = PROTECTED, files = [file('index.html')], pr: prOver = {}, env = {},
    branch = 'claude/obsidian-auto-20261020', fail = {} } = {}) => {
    const pr = fixturePr({ files, pr: prOver });
    const { github, calls } = mockGithub({ pr, files, environment, fail });
    const { core, out } = mockCore();
    Object.assign(process.env, { GITHUB_WORKSPACE: ROOT, APPROVAL_PR: '123', APPROVAL_SHA: SHA,
      APPROVAL_FILES: fileListHash(files), VALIDATED_AT: new Date().toISOString() }, env);
    try {
      await new AsyncFunction('context', 'github', 'core', 'require', approval)(
        { repo: { owner: OWNER, repo: REPO_NAME }, payload: { workflow_run: { head_branch: branch, head_sha: SHA, event: 'pull_request' } } },
        github, core, requireIdentity);
    } finally { restoreEnv(); }
    return { calls, out };
  };
  r = await runApproval();
  t(r.calls.merged.length === 1 && r.calls.merged[0].sha === SHA && r.calls.merged[0].merge_method === 'squash'
    && r.calls.merged[0].commit_title === 'Merge validated PR #123'
    && r.calls.merged[0].commit_message === `Source PR: https://github.com/${OWNER}/${REPO_NAME}/pull/123\nValidated head: ${SHA}`
    && r.out.outputs.merged_sha === 'b'.repeat(40) && r.out.failed.length === 0, 'approved PR merges at the validated SHA');
  const refused = (res, code) => res.calls.merged.length === 0 && res.out.failed.length === 1 && res.out.failed[0].includes(code)
    && res.out.summaries.some(s => s.includes(code));
  t(refused(await runApproval({ environment: null }), 'environment_unreadable'), 'missing environment: no merge');
  t(refused(await runApproval({ environment: { name: APPROVAL_ENVIRONMENT, protection_rules: [] } }), 'no_required_reviewers'),
    'unprotected environment: no merge');
  t(refused(await runApproval({ environment: { name: APPROVAL_ENVIRONMENT, protection_rules: [{ type: 'required_reviewers',
    reviewers: [{ type: 'User', reviewer: { login: 'x' } }] }] } }), 'owner_not_required_reviewer'), 'other reviewer: no merge');
  t(refused(await runApproval({ env: { VALIDATED_AT: new Date(Date.now() - 48 * 3600_000).toISOString() } }), 'jst_day_changed'),
    'JST day changed: no merge');
  t(refused(await runApproval({ env: { APPROVAL_FILES: '' } }), 'invalid_input'), 'missing file fingerprint: no merge');
  t(refused(await runApproval({ env: { APPROVAL_FILES: 'f'.repeat(64) } }), 'file_list_changed'), 'file list changed: no merge');
  t(refused(await runApproval({ pr: { head: { ref: 'claude/obsidian-auto-20261020', sha: 'c'.repeat(40),
    repo: { full_name: `${OWNER}/${REPO_NAME}` } } } }), 'pr_changed'), 'head moved: no merge');
  t(refused(await runApproval({ pr: { state: 'closed' } }), 'pr_changed'), 'closed PR: no merge');
  t(refused(await runApproval({ pr: { draft: true } }), 'pr_changed'), 'draft PR: no merge');
  t(refused(await runApproval({ pr: { base: { ref: 'other' } } }), 'pr_changed'), 'other base: no merge');
  t(refused(await runApproval({ pr: { head: { ref: 'claude/obsidian-auto-20261021', sha: SHA,
    repo: { full_name: `${OWNER}/${REPO_NAME}` } } } }), 'pr_changed'), 'other head branch: no merge');
  t(refused(await runApproval({ pr: { head: { ref: 'claude/obsidian-auto-20261020', sha: SHA,
    repo: { full_name: `someone/${REPO_NAME}` } } } }), 'pr_changed'), 'fork head: no merge');
  t(refused(await runApproval({ branch: 'Codex/decision-observe-20261020' }), 'not_autopilot_branch'), 'non-autopilot run: no merge');
  t(refused(await runApproval({ pr: { user: { login: 'someone' } } }), 'unapproved_opener'), 'other opener: no merge');
  t(refused(await runApproval({ fail: { authorName: 'Private Person' } }), 'commit_identity'), 'unapproved identity: no merge');
  t(refused(await runApproval({ pr: { changed_files: 2 } }), 'file_list_changed'), 'file count changed: no merge');
  console.log(`autopilot-approval-check: ${n} classification, guard and workflow checks passed`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    selftest().catch(error => { console.error(error.stack); process.exitCode = 1; });
  } else {
    console.error('Use --selftest (the workflow imports the exported functions)');
    process.exitCode = 1;
  }
}
