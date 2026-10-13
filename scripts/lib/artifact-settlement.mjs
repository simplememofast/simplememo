// A daily run whose artifact PR was rejected by CI did not ship. Act used to skip
// every successful run ("PR identification is too much for a machine"), so the
// 2026-10-05 run 37249907984 (PR #1993, decision-ci rejected 6 undeclared paths)
// stayed out of the run ledger for 8 days and was recorded by hand on 10-13.
//
// Settle only what cannot ship any more; defer every doubt (a deferred run keeps
// act-ledger-sync open, so it is not silent):
//   - closed without merge, with the final head's latest SEO Validation failed
//   - open and not a draft, with that validation failed SETTLE_MS ago and the head unchanged
// A PR closed without a failed validation was declined by a person, not by CI:
// this module does not decide what that run was.
import { runsAt } from '../autopilot-output.mjs';

const SHA = /^[a-f0-9]{40}$/;
const LIMIT = 30;
// Unattended artifact PRs merge within an hour of a green validation. Six hours
// leaves a fix or re-run time to land, and Act wakes 4-5 times a day, so the record
// still arrives within the no_artifact rule's 24 hours (escalation-rules.json).
export const SETTLE_MS = 6 * 3600 * 1000;

const time = value => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);

function validationRun(run, pr, repo) {
  return Number.isSafeInteger(run?.id) && run.id > 0 && run.repository?.full_name === repo
    && run.path === '.github/workflows/seo-check.yml' && run.name === 'SEO Validation'
    && run.event === 'pull_request' && run.head_sha === pr.head.sha && run.head_branch === pr.head.ref
    && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0 && time(run.created_at) !== null;
}

async function failedValidation(get, pr, repo, now) {
  const response = await get(`/actions/workflows/seo-check.yml/runs?head_sha=${pr.head.sha}&event=pull_request&per_page=${LIMIT}`);
  const rows = response?.workflow_runs;
  if (!Array.isArray(rows) || response.total_count !== rows.length || rows.length >= LIMIT) return { reason: 'validation_inventory_incomplete' };
  if (!rows.every(r => validationRun(r, pr, repo))) return { reason: 'validation_identity_mismatch' };
  if (rows.length === 0) return { reason: 'no_validation' };
  if (rows.some(r => r.status !== 'completed')) return { reason: 'validating' };
  const latest = [...rows].sort((a, b) => time(b.created_at) - time(a.created_at) || b.id - a.id)[0];
  if (latest.conclusion !== 'failure') return { reason: `latest_validation_${latest.conclusion}` };
  const jobs = await get(`/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs?per_page=100`);
  const named = Array.isArray(jobs?.jobs) ? jobs.jobs.filter(j => j?.name === 'seo-check') : [];
  if (named.length !== 1 || named[0].conclusion !== 'failure') return { reason: 'validation_job_unknown' };
  const steps = Array.isArray(named[0].steps) ? named[0].steps : [];
  const failed = steps.filter(s => s?.conclusion === 'failure' && time(s.completed_at) !== null)
    .sort((a, b) => time(a.completed_at) - time(b.completed_at));
  const step = failed[0] ?? null;
  const at = step ? time(step.completed_at) : time(named[0].completed_at);
  // Never substitute the run's creation time or "now" for an unknown failure time.
  if (at === null || at > now || at < time(latest.created_at)) return { reason: 'failure_time_unknown' };
  // Keep GitHub's own timestamp string (the ledger's other failed_at values use the same form).
  return { run: latest, failed_at: step ? step.completed_at : named[0].completed_at,
    step: step && typeof step.name === 'string' ? step.name : null,
    step_number: step && Number.isSafeInteger(step.number) ? step.number : null };
}

const DAY_MS = 24 * 3600 * 1000;
const failedStep = (jobs, step, jobName) => Array.isArray(jobs?.jobs) && jobs.jobs.some(j => jobName(String(j?.name))
  && Array.isArray(j.steps) && j.steps.some(s => s?.conclusion === 'failure' && s.name === step));

/**
 * A red main fails every PR at the same step (09-16..19 the /autopilot/ date score,
 * 10-09..13 the generated-translation check). That is not this run's failure, and
 * recording it would also stop the route (no_artifact is past its repair limit).
 * Red when main's latest daily validation (within a day) or another PR validated
 * within 12 hours failed at the same step. At most 5 sibling runs are opened.
 */
async function baseRed(get, repo, branch, failure) {
  const at = time(failure.failed_at);
  const daily = await get('/actions/workflows/main-daily-validation.yml/runs?branch=main&status=completed&per_page=1');
  if (!Array.isArray(daily?.workflow_runs)) throw Error('main validation unreadable');
  const last = daily.workflow_runs[0];
  if (last && last.conclusion === 'failure' && Math.abs(time(last.updated_at) - at) <= DAY_MS
    && failedStep(await get(`/actions/runs/${last.id}/attempts/${last.run_attempt}/jobs?per_page=100`), failure.step,
      name => name.endsWith('seo-check'))) return 'main_daily_validation';
  const recent = await get('/actions/workflows/seo-check.yml/runs?event=pull_request&status=completed&per_page=30');
  if (!Array.isArray(recent?.workflow_runs)) throw Error('sibling validations unreadable');
  const siblings = recent.workflow_runs.filter(r => r?.conclusion === 'failure' && r.head_branch !== branch
    && r.repository?.full_name === repo && Math.abs(time(r.created_at) - at) <= SETTLE_MS * 2).slice(0, 5);
  for (const r of siblings) {
    if (failedStep(await get(`/actions/runs/${r.id}/attempts/${r.run_attempt}/jobs?per_page=100`), failure.step,
      name => name === 'seo-check')) return 'sibling_pr_validation';
  }
  return null;
}

/**
 * Decide whether a successful daily run's artifact PR can no longer ship.
 * Returns { state: 'unshippable', ... } or { state: 'defer', reason }.
 * `get` is githubReader(repo, token): null on 404, throws on other failures.
 */
export async function settleArtifactPr(run, { repo, get, now = Date.now() }) {
  const defer = (reason, extra = {}) => ({ state: 'defer', reason, ...extra });
  try {
    if (!Number.isSafeInteger(run?.id) || !/^\d{4}-\d{2}-\d{2}$/.test(String(run?.jst_date))) return defer('run_identity_unknown');
    const branch = `claude/obsidian-auto-${run.jst_date.replaceAll('-', '')}`;
    const listed = [];
    let complete = false;
    for (let page = 1; page <= 5; page++) {
      const rows = await get('/pulls?state=all&base=main&head='
        + encodeURIComponent(`${repo.split('/')[0]}:${branch}`) + `&sort=created&direction=asc&per_page=100&page=${page}`);
      if (!Array.isArray(rows)) return defer('pr_inventory_unavailable');
      listed.push(...rows);
      if (rows.length < 100) { complete = true; break; }
    }
    if (!complete) return defer('pr_inventory_truncated');
    const bound = [];
    for (const item of listed) {
      if (!Number.isSafeInteger(item?.number) || item.number <= 0) return defer('pr_inventory_invalid');
      const pr = await get(`/pulls/${item.number}`);
      if (pr?.number !== item.number) return defer('pr_unreadable');
      if (pr.head?.ref !== branch || pr.head.repo?.full_name !== repo || pr.base?.ref !== 'main'
        || pr.base.repo?.full_name !== repo || !SHA.test(String(pr.head.sha))) continue;
      const rows = await runsAt(get, pr.head.sha);
      if (rows === null) continue;
      const own = rows.filter(r => String(r?.external_ref) === String(run.id));
      if (own.length === 0) continue;
      if (own.length > 1) return defer('ambiguous_run_record', { pr: pr.number });
      // The model's own row must name this PR, as autopilot-output verify() requires.
      if (own[0].route !== 'actions' || own[0].date_jst !== run.jst_date || own[0].pr !== pr.number) continue;
      bound.push({ pr, row: own[0] });
    }
    if (bound.length === 0) return defer('no_bound_pr');
    if (bound.length > 1) return defer('ambiguous_pr', { prs: bound.map(b => b.pr.number) });
    const [{ pr, row }] = bound;
    // A merged PR brings its own row; a draft is an operator hold.
    if (pr.merged === true) return defer('merged', { pr: pr.number });
    if (pr.state !== 'open' && pr.state !== 'closed') return defer('pr_state_unknown', { pr: pr.number });
    if (pr.state === 'open' && pr.draft !== false) return defer('draft_or_unknown', { pr: pr.number });
    const v = await failedValidation(get, pr, repo, now);
    if (!v.run) return defer(pr.state === 'closed' ? `closed_${v.reason}` : v.reason, { pr: pr.number });
    if (pr.state === 'open' && now - time(v.failed_at) < SETTLE_MS) return defer('settling', { pr: pr.number, failed_at: v.failed_at });
    // Without the failing step's name a red main cannot be told apart.
    if (v.step === null) return defer('failure_step_unknown', { pr: pr.number });
    const red = await baseRed(get, repo, branch, v);
    if (red) return defer('base_red', { pr: pr.number, evidence: red });
    // Re-read right before deciding: a re-run, a push or a merge may have landed meanwhile.
    const current = await get(`/actions/runs/${v.run.id}`);
    if (!validationRun(current, pr, repo) || current.status !== 'completed' || current.conclusion !== 'failure'
      || current.run_attempt !== v.run.run_attempt) return defer('validation_changed', { pr: pr.number });
    const fresh = await get(`/pulls/${pr.number}`);
    if (fresh?.number !== pr.number || fresh.head?.sha !== pr.head.sha || fresh.merged === true || fresh.state !== pr.state) {
      return defer('pr_changed', { pr: pr.number });
    }
    if (pr.state === 'open') {
      const ref = await get(`/git/ref/heads/${encodeURIComponent(branch)}`);
      if (ref?.object?.sha !== pr.head.sha) return defer('branch_moved', { pr: pr.number });
    }
    return { state: 'unshippable', reason: pr.state === 'closed' ? 'closed_after_failed_validation' : 'validation_failed_settled',
      pr: pr.number, row, failed_at: v.failed_at, validation_run_id: v.run.id, step: v.step, step_number: v.step_number };
  } catch {
    // Never echo transport errors (they can carry credentials) or guess on a failed read.
    return defer('read_failed');
  }
}

/** Fixtures only (Act's --selftest calls this). Every doubt must defer; only two shapes settle. */
export async function settlementSelftest() {
  const { default: assert } = await import('node:assert/strict');
  const repo = 'o/r', head = 'a'.repeat(40), other = 'b'.repeat(40);
  const branch = 'claude/obsidian-auto-20261005';
  const run = { id: 555, jst_date: '2026-10-05' };
  const listRoute = `/pulls?state=all&base=main&head=${encodeURIComponent(`o:${branch}`)}&sort=created&direction=asc&per_page=100&page=1`;
  const pr = over => ({ number: 7, state: 'open', draft: false, merged: false,
    head: { ref: branch, sha: head, repo: { full_name: repo } }, base: { ref: 'main', repo: { full_name: repo } }, ...over });
  const row = over => ({ run_id: 'ap-20261005-actions-555', date_jst: '2026-10-05', route: 'actions', outcome: 'shipped',
    pr: 7, external_ref: '555', lane: 'C', action: 'refresh', ...over });
  const vrun = over => ({ id: 900, run_attempt: 1, status: 'completed', conclusion: 'failure', created_at: '2026-10-05T01:00:00Z',
    repository: { full_name: repo }, path: '.github/workflows/seo-check.yml', name: 'SEO Validation', event: 'pull_request',
    head_sha: head, head_branch: branch, ...over });
  const steps = [{ number: 5, name: 'Checkout', conclusion: 'success', completed_at: '2026-10-05T01:10:00Z' },
    { number: 18, name: 'Prospective decisions and recovery safety', conclusion: 'failure', completed_at: '2026-10-05T01:49:11Z' }];
  const encoded = rows => ({ type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify({ runs: rows })).toString('base64') });
  // o: { list, prs (first read), fresh (second read), rows, validations, jobs, current, ref, fail }
  const world = (o = {}) => {
    const reads = {};
    return async endpoint => {
      reads[endpoint] = (reads[endpoint] ?? 0) + 1;
      if (o.fail && endpoint.startsWith(o.fail)) throw Error('network');
      if (endpoint === listRoute) return 'list' in o ? o.list : [{ number: 7 }];
      const pull = endpoint.match(/^\/pulls\/(\d+)$/);
      if (pull) {
        const first = (o.prs ?? [pr()]).find(p => p.number === Number(pull[1]));
        return reads[endpoint] === 1 ? first : (o.fresh ?? first);
      }
      if (endpoint.startsWith('/contents/data/autopilot-runs.json?ref=')) {
        if (o.rowsFor) return encoded(o.rowsFor(endpoint.split('ref=')[1]));
        return 'rows' in o ? (o.rows === null ? null : encoded(o.rows)) : encoded([row()]);
      }
      if (endpoint.startsWith('/actions/workflows/seo-check.yml/runs?head_sha=')) {
        const rows = o.validations ?? [vrun()];
        return { total_count: o.total ?? rows.length, workflow_runs: rows };
      }
      if (endpoint.startsWith('/actions/workflows/main-daily-validation.yml/runs?')) {
        return 'daily' in o ? o.daily : { workflow_runs: [{ id: 700, run_attempt: 1, conclusion: 'success', updated_at: '2026-10-04T17:00:00Z' }] };
      }
      if (endpoint.startsWith('/actions/workflows/seo-check.yml/runs?event=pull_request&status=completed')) {
        return 'siblings' in o ? o.siblings : { workflow_runs: [] };
      }
      const otherJobs = endpoint.match(/^\/actions\/runs\/(700|8\d\d)\/attempts\/\d+\/jobs/);
      if (otherJobs) return (o.otherJobs ?? {})[otherJobs[1]] ?? { jobs: [] };
      if (/^\/actions\/runs\/\d+\/attempts\/\d+\/jobs/.test(endpoint)) {
        return o.jobs ?? { jobs: [{ name: 'seo-check', conclusion: 'failure', completed_at: '2026-10-05T01:50:00Z', steps }] };
      }
      if (/^\/actions\/runs\/\d+$/.test(endpoint)) return o.current ?? vrun();
      if (endpoint.startsWith('/git/ref/heads/')) return 'ref' in o ? o.ref : { object: { sha: head } };
      throw Error(`unexpected endpoint ${endpoint}`);
    };
  };
  const later = Date.parse('2026-10-05T12:00:00Z');
  const settle = (o, now = later, r = run) => settleArtifactPr(r, { repo, get: world(o), now });
  const deferred = async (o, reason, now) => {
    const got = await settle(o, now);
    assert.equal(got.state, 'defer', `${reason}: settled instead of deferring`);
    assert.equal(got.reason, reason);
  };

  const open = await settle({});
  assert.equal(open.state, 'unshippable');
  assert.equal(open.reason, 'validation_failed_settled');
  assert.equal(open.failed_at, '2026-10-05T01:49:11Z', 'failure time is the failed step, not the run or now');
  assert.equal(open.pr, 7);
  assert.equal(open.validation_run_id, 900);
  assert.equal(open.step_number, 18);
  assert.equal(open.row.run_id, 'ap-20261005-actions-555');
  // Within the settle window a fix or a re-run can still land.
  await deferred({}, 'settling', Date.parse('2026-10-05T07:49:10Z'));
  assert.equal((await settle({}, Date.parse('2026-10-05T07:49:11Z'))).state, 'unshippable');
  // Closed without merge after a failed validation is terminal: no window.
  const closed = await settle({ prs: [pr({ state: 'closed' })] }, Date.parse('2026-10-05T01:59:00Z'));
  assert.equal(closed.state, 'unshippable');
  assert.equal(closed.reason, 'closed_after_failed_validation');

  await deferred({ prs: [pr({ merged: true, state: 'closed' })] }, 'merged');
  await deferred({ prs: [pr({ draft: true })] }, 'draft_or_unknown');
  await deferred({ prs: [pr({ draft: undefined })] }, 'draft_or_unknown');
  await deferred({ prs: [pr({ state: 'weird' })] }, 'pr_state_unknown');
  // A person closed it without CI rejecting it: not this module's call.
  await deferred({ prs: [pr({ state: 'closed' })], validations: [vrun({ conclusion: 'success' })] }, 'closed_latest_validation_success');
  await deferred({ validations: [vrun({ status: 'in_progress', conclusion: null })] }, 'validating');
  await deferred({ validations: [vrun({ conclusion: 'success' })] }, 'latest_validation_success');
  await deferred({ validations: [vrun({ conclusion: 'cancelled' })] }, 'latest_validation_cancelled');
  await deferred({ validations: [vrun(), vrun({ id: 901, conclusion: 'success', created_at: '2026-10-05T03:00:00Z' })] },
    'latest_validation_success');
  await deferred({ validations: [] }, 'no_validation');
  await deferred({ validations: [vrun({ head_branch: 'claude/other' })] }, 'validation_identity_mismatch');
  await deferred({ validations: [vrun({ head_sha: other })] }, 'validation_identity_mismatch');
  await deferred({ validations: [vrun({ name: 'Other' })] }, 'validation_identity_mismatch');
  await deferred({ total: 2 }, 'validation_inventory_incomplete');
  await deferred({ jobs: { jobs: [] } }, 'validation_job_unknown');
  await deferred({ jobs: { jobs: [{ name: 'seo-check', conclusion: 'failure', completed_at: null, steps: [] }] } }, 'failure_time_unknown');
  await deferred({ jobs: { jobs: [{ name: 'seo-check', conclusion: 'failure', completed_at: '2026-10-05T00:59:00Z', steps: [] }] } },
    'failure_time_unknown');
  // No bound PR: the run's row is absent, names another PR, or the PR is a fork.
  await deferred({ rows: [] }, 'no_bound_pr');
  await deferred({ rows: null }, 'no_bound_pr');
  await deferred({ rows: [row({ pr: 8 })] }, 'no_bound_pr');
  await deferred({ rows: [row({ date_jst: '2026-10-06' })] }, 'no_bound_pr');
  await deferred({ prs: [pr({ head: { ref: branch, sha: head, repo: { full_name: 'fork/r' } } })] }, 'no_bound_pr');
  await deferred({ rows: [row(), row({ run_id: 'x' })] }, 'ambiguous_run_record');
  // Two PRs on the same day branch both carrying this run's row (each naming itself).
  const second = pr({ number: 8, head: { ref: branch, sha: other, repo: { full_name: repo } } });
  await deferred({ list: [{ number: 7 }, { number: 8 }], prs: [pr(), second],
    rowsFor: sha => [row({ pr: sha === head ? 7 : 8 })] }, 'ambiguous_pr');
  // The other PR's row naming PR 7 does not bind PR 8, so PR 7 alone settles.
  assert.equal((await settle({ list: [{ number: 7 }, { number: 8 }], prs: [pr(), second] })).pr, 7);
  // Re-read before deciding: a re-run, a push, a merge or a moved branch defers.
  await deferred({ current: vrun({ conclusion: 'success' }) }, 'validation_changed');
  await deferred({ current: vrun({ run_attempt: 2 }) }, 'validation_changed');
  await deferred({ fresh: pr({ head: { ref: branch, sha: other, repo: { full_name: repo } } }) }, 'pr_changed');
  await deferred({ fresh: pr({ merged: true, state: 'closed' }) }, 'pr_changed');
  await deferred({ ref: { object: { sha: other } } }, 'branch_moved');
  await deferred({ ref: null }, 'branch_moved');
  // A red main is not this run's failure: main's daily validation or a sibling PR failed at the same step.
  const step18 = name => ({ jobs: [{ name, conclusion: 'failure',
    steps: [{ number: 18, name: 'Prospective decisions and recovery safety', conclusion: 'failure', completed_at: '2026-10-05T01:40:00Z' }] }] });
  const redDaily = { workflow_runs: [{ id: 700, run_attempt: 1, conclusion: 'failure', updated_at: '2026-10-04T17:00:00Z' }] };
  await deferred({ daily: redDaily, otherJobs: { 700: step18('validation / seo-check') } }, 'base_red');
  assert.equal((await settle({ daily: redDaily, otherJobs: { 700: { jobs: [{ name: 'validation / seo-check', conclusion: 'failure',
    steps: [{ name: 'Another step', conclusion: 'failure' }] }] } } })).state, 'unshippable', 'a different failing step on main is not base red');
  assert.equal((await settle({ daily: { workflow_runs: [{ ...redDaily.workflow_runs[0], updated_at: '2026-10-02T00:00:00Z' }] },
    otherJobs: { 700: step18('validation / seo-check') } })).state, 'unshippable', 'an old red main does not excuse today');
  const sibling = over => ({ workflow_runs: [{ id: 801, run_attempt: 1, conclusion: 'failure', head_branch: 'claude/other-fix',
    repository: { full_name: repo }, created_at: '2026-10-05T03:00:00Z', ...over }] });
  await deferred({ siblings: sibling(), otherJobs: { 801: step18('seo-check') } }, 'base_red');
  for (const over of [{ head_branch: branch }, { created_at: '2026-10-06T03:00:00Z' }, { conclusion: 'success' }, { repository: { full_name: 'fork/r' } }]) {
    assert.equal((await settle({ siblings: sibling(over), otherJobs: { 801: step18('seo-check') } })).state, 'unshippable',
      `sibling not comparable: ${JSON.stringify(over)}`);
  }
  await deferred({ jobs: { jobs: [{ name: 'seo-check', conclusion: 'failure', completed_at: '2026-10-05T01:50:00Z', steps: [] }] } },
    'failure_step_unknown');
  for (const broken of [{ daily: null }, { siblings: null }]) await deferred(broken, 'read_failed');
  // Unreadable is never absence.
  for (const fail of ['/pulls?', '/pulls/7', '/contents/', '/actions/workflows/', '/actions/runs/900/attempts', '/git/ref'])
    await deferred({ fail }, 'read_failed');
  await deferred({ list: null }, 'pr_inventory_unavailable');
  await deferred({ list: [{ number: 'x' }] }, 'pr_inventory_invalid');
  assert.equal((await settle({}, later, { id: 555, jst_date: '2026/10/05' })).reason, 'run_identity_unknown');
  return 'artifact settlement: 2 settled shapes, every doubt deferred';
}
