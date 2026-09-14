// Recover only a stalled publication already admitted by pendingPublication.
// A retry revalidates the current PR merge tree; it never merges or edits it.
import assert from 'node:assert/strict';

const REPO = 'simplememofast/simplememo';
const SHA = /^[a-f0-9]{40}$/;
const AGE = 30 * 60 * 1000;
const LIMIT = 30;

function eligiblePr(pr, pending) {
  return pr?.number === pending.pr && pr.state === 'open' && pr.draft === false
    && pr.head?.sha === pending.head && SHA.test(pending.head)
    && pr.head.ref.startsWith('Codex/decision-observe-')
    && pr.head.repo?.full_name === REPO && pr.base?.repo?.full_name === REPO
    && pr.base.ref === 'main' && pr.mergeable === true && pr.mergeable_state === 'clean';
}

function identity(run, pr) {
  return Number.isSafeInteger(run?.id) && run.id > 0 && run.repository?.full_name === REPO
    && run.path === '.github/workflows/seo-check.yml' && run.name === 'SEO Validation'
    && run.event === 'pull_request' && run.head_sha === pr.head.sha && run.head_branch === pr.head.ref;
}

export function publicationRetryPlan(pending, pr, response, now = new Date()) {
  const waiting = reason => ({state: 'waiting', reason, pr: pending.pr});
  if (!eligiblePr(pr, pending)) return waiting('pr_not_current_ready_clean');
  assert(Array.isArray(response?.workflow_runs) && Number.isSafeInteger(response.total_count)
    && response.total_count === response.workflow_runs.length && response.total_count < LIMIT,
  'publication CI inventory incomplete');
  const rows = response.workflow_runs;
  if (!rows.length) return waiting('no_validation');
  assert(rows.every(r => identity(r, pr) && Number.isFinite(Date.parse(r.created_at))
    && Number.isFinite(Date.parse(r.updated_at)) && Date.parse(r.created_at) <= Date.parse(r.updated_at)
    && Date.parse(r.updated_at) <= +now), 'publication CI identity or timestamp unavailable');
  assert(new Set(rows.map(r => r.id)).size === rows.length, 'duplicate publication CI run');
  if (rows.some(r => r.status !== 'completed')) return waiting('validation_active_or_unknown');
  if (rows.some(r => r.run_attempt !== 1)) return waiting('one_retry_limit_or_unknown_attempt');
  const latest = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0];
  if (latest.conclusion !== 'success') return waiting('latest_validation_not_successful');
  if (+now - Date.parse(latest.updated_at) < AGE) return waiting('allow_original_merge_to_finish');
  return {state: 'retry_ready', pr: pr.number, head: pr.head.sha, run_id: latest.id,
    prior_attempt: 1, prior_updated_at: latest.updated_at,
    reason: 'stalled_ready_clean_generated_PR_after_successful_original_validation'};
}

export function retryPendingPublication(pending, {request, rerun, stopped, now = new Date()} = {}) {
  // Multiple pending publications may have a dependency. Do not choose one or
  // spend a retry while their ordering needs investigation.
  if (pending.length !== 1) return {state: 'waiting', reason: 'pending_publication_count', count: pending.length};
  const item = pending[0];
  if (item.draft) return {state: 'waiting', reason: 'draft', pr: item.pr};
  let submitting = false;
  try {
    assert(Number.isSafeInteger(item.pr) && item.pr > 0 && SHA.test(item.head), 'invalid verified publication');
    const pr = request(`pulls/${item.pr}`);
    if (!eligiblePr(pr, item)) return {state: 'waiting', reason: 'pr_not_current_ready_clean', pr: item.pr};
    const runsRoute = `actions/workflows/seo-check.yml/runs?head_sha=${item.head}&event=pull_request&per_page=${LIMIT}`;
    const response = request(runsRoute);
    const plan = publicationRetryPlan(item, pr, response, now);
    if (plan.state !== 'retry_ready') return plan;
    const current = request(`actions/runs/${plan.run_id}`);
    const fresh = request(`pulls/${item.pr}`);
    const branch = request(`git/ref/heads/${pr.head.ref}`);
    if (!identity(current, pr) || current.status !== 'completed' || current.conclusion !== 'success'
      || current.run_attempt !== 1 || current.updated_at !== plan.prior_updated_at
      || !eligiblePr(fresh, item) || fresh.head.ref !== pr.head.ref || branch?.object?.sha !== item.head)
      return {state: 'waiting', reason: 'publication_changed_before_retry', pr: item.pr};
    const finalPlan = publicationRetryPlan(item, fresh, request(runsRoute), now);
    if (finalPlan.state !== 'retry_ready' || finalPlan.run_id !== plan.run_id
      || finalPlan.prior_updated_at !== plan.prior_updated_at)
      return {state: 'waiting', reason: 'validation_changed_before_retry', pr: item.pr};
    if (stopped()) return {state: 'waiting', reason: 'emergency_stop', pr: item.pr};
    submitting = true;
    rerun(plan.run_id);
    return {...plan, state: 'validation_retry_requested', business_completion: false,
      next: 'Original SEO Validation and exact-head auto-merge must verify delivery; no second retry on this run.'};
  } catch {
    // Never echo credential-bearing transport errors or retry an uncertain POST.
    return {state: 'unavailable', reason: submitting ? 'retry_delivery_unconfirmed' : 'retry_evidence_unavailable',
      pr: item.pr, new_permission_requested: false,
      next: 'Inspect the same existing CI run on the next owner tick; active/second attempts prevent another request. Do not broaden credentials.'};
  }
}
