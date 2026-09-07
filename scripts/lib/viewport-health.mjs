// A CI success is not evidence that its report-only browser measurement ran.
export const MARKER = 'SIMPLEMEMO_VIEWPORT_V1 ';
export const STEP = 'Landing pages do not scroll sideways (report-only)';
const GROUPS = ['blink_deep', 'blink_sweep', 'webkit'];
const sha = x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const integer = x => Number.isSafeInteger(x) && x >= 0;
const id = x => Number.isSafeInteger(x) && x > 0;

export function measurementGroup(result, requests) {
  const key = r => JSON.stringify([r.page, r.width]);
  const expected = new Set(requests.map(key));
  const rows = result?.results ?? [];
  const seen = new Set(rows.map(key));
  const valid = result?.measurable === true && Array.isArray(result.results)
    && Array.isArray(result.failures) && Array.isArray(result.problems)
    && rows.every(r => expected.has(key(r)) && Number.isFinite(r.over) && r.over >= 0)
    && seen.size === rows.length && expected.size === requests.length;
  return { expected: expected.size, measured: seen.size,
    failures: result?.failures?.length ?? 0, problems: result?.problems?.length ?? 0,
    complete: valid && expected.size > 0 && seen.size === expected.size && result.failures.length === 0 };
}

export function reportState(report) {
  if (report?.version !== 1 || !integer(report.static_problems)) return 'unknown';
  for (const name of GROUPS) {
    const g = report.groups?.[name];
    if (!g || !['expected', 'measured', 'failures', 'problems'].every(k => integer(g[k]))
      || g.expected === 0 || typeof g.complete !== 'boolean'
      || g.problems > g.measured
      || (g.complete && (g.measured !== g.expected || g.failures !== 0))) return 'unknown';
  }
  if (GROUPS.some(k => !report.groups[k].complete)) return 'unmeasurable';
  return report.static_problems || GROUPS.some(k => report.groups[k].problems) ? 'overflow' : 'healthy';
}

// Only an exact, timestamped output line inside the actual measurement step.
// Echoed commands, test fixtures, duplicate markers and other steps cannot close an action.
export function parseReport(log, step) {
  const start = Date.parse(step?.started_at), end = Date.parse(step?.completed_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const matches = [];
  for (const line of log.split('\n')) {
    const m = line.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) SIMPLEMEMO_VIEWPORT_V1 (\{.*\})\r?$/);
    if (!m || m[2].length > 4096) continue;
    const t = Date.parse(m[1]);
    // The jobs API timestamps have second precision; logs have subsecond precision.
    if (!Number.isFinite(t) || t < start || t >= end + 1000) continue;
    try { matches.push(JSON.parse(m[2])); } catch { return null; }
  }
  return matches.length === 1 && reportState(matches[0]) !== 'unknown' ? matches[0] : null;
}

async function boundedText(response, limit) {
  const reader = response.body.getReader();
  const parts = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('response_too_large');
      parts.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(parts).toString('utf8');
}

// Read only current main. Squash merges use the exact merged PR head's CI;
// a PR still open, another head, a fork or an older main cannot supply recovery.
export async function observeViewport({ repo, token, fetchImpl = fetch, now = Date.now() }) {
  let evidence = {};
  const unknown = reason => ({ ...evidence, state: 'unknown', reason });
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !token) return unknown('credentials_unavailable');
  const base = `https://api.github.com/repos/${repo}`;
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
  async function get(route) {
    const r = await fetchImpl(base + route, { headers, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`api_http_${r.status}`);
    return JSON.parse(await boundedText(r, 2 * 1024 * 1024));
  }
  try {
    const main = (await get('/git/ref/heads/main'))?.object?.sha;
    if (!sha(main)) return unknown('invalid_main');
    evidence = { main_sha: main };
    const prs = await get(`/commits/${main}/pulls?per_page=100`);
    if (!Array.isArray(prs) || prs.length >= 100) return unknown('ambiguous_pr_list');
    const merged = prs.filter(p => p.merged_at && p.merge_commit_sha === main
      && p.base?.ref === 'main' && p.base?.repo?.full_name === repo
      && p.head?.repo?.full_name === repo && sha(p.head?.sha));
    if (merged.length > 1) return unknown('ambiguous_merged_pr');
    const head = merged[0]?.head.sha ?? main;
    evidence.head_sha = head;
    const listing = await get(`/actions/workflows/seo-check.yml/runs?head_sha=${head}&per_page=100`);
    if (!Array.isArray(listing.workflow_runs) || listing.total_count > 100) return unknown('incomplete_run_list');
    const runs = listing.workflow_runs.filter(r => r.head_sha === head
      && r.repository?.full_name === repo && r.head_repository?.full_name === repo
      && r.path === '.github/workflows/seo-check.yml'
      && (merged.length ? r.event === 'pull_request' : r.event === 'push' && r.head_branch === 'main'));
    runs.sort((a, b) => Date.parse(b.run_started_at) - Date.parse(a.run_started_at) || b.id - a.id);
    const run = runs[0];
    if (!run || !id(run.id) || !id(run.run_attempt)) return unknown('no_qualifying_run');
    evidence = { ...evidence, run_id: run.id, attempt: run.run_attempt, started_at: run.run_started_at,
      url: `https://github.com/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}` };
    const age = now - Date.parse(run.run_started_at);
    if (!Number.isFinite(age) || age < 0 || age > 7 * 86400_000) return unknown('stale_run');
    if (run.status !== 'completed') return unknown('run_pending');
    const jobs = await get(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
    if (!Array.isArray(jobs.jobs) || jobs.total_count > 100) return unknown('incomplete_jobs');
    const matches = jobs.jobs.filter(j => j.run_id === run.id && j.head_sha === head
      && j.status === 'completed' && j.steps?.some(s => s.name === STEP));
    if (matches.length !== 1 || !id(matches[0].id)) return unknown('measurement_job_missing');
    const job = matches[0];
    const steps = job.steps.filter(s => s.name === STEP);
    if (steps.length !== 1 || steps[0].status !== 'completed'
      || steps[0].conclusion !== 'success') return unknown('measurement_step_incomplete');
    evidence.job_id = job.id;
    const redirect = await fetchImpl(`${base}/actions/jobs/${job.id}/logs`, {
      headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (redirect.status !== 302) return unknown(`logs_http_${redirect.status}`);
    const location = new URL(redirect.headers.get('location'));
    if (location.protocol !== 'https:' || location.username || location.password) return unknown('invalid_log_url');
    // Signed log URLs are downloaded without passing the repository credential.
    const download = await fetchImpl(location.href, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!download.ok) return unknown(`download_http_${download.status}`);
    const report = parseReport(await boundedText(download, 8 * 1024 * 1024), steps[0]);
    // Reruns and concurrent main changes invalidate the observation; don't fall back.
    const currentRun = await get(`/actions/runs/${run.id}`);
    const currentMain = (await get('/git/ref/heads/main'))?.object?.sha;
    if (currentMain !== main || currentRun.run_attempt !== run.run_attempt
      || currentRun.status !== 'completed' || currentRun.head_sha !== head) return unknown('observation_changed');
    return report ? { ...evidence, state: reportState(report), report }
      : unknown('measurement_report_missing_or_invalid');
  } catch (e) {
    // Never publish response bodies, signed download URLs or provider error text.
    return unknown(/^api_http_\d+$/.test(e.message) ? e.message : 'observation_failed');
  }
}

export function deriveViewportActions(ctx) {
  const v = ctx.viewport;
  if (!v || v.state === 'healthy' || v.reason === 'run_pending') return [];
  return [{ id: 'act-viewport-measurement', source: 'viewport', domain: null, auto: null,
    touches: ['scripts/check-viewport-overflow.mjs', 'scripts/lib/webkit-driver.mjs'],
    title: '描画検査の未測定・横はみ出しを解消する',
    detail: `最新mainの描画検査: ${v.state} (${v.reason ?? v.state})。${v.url ?? '検証ログ未取得'}。`
      + 'Blink深い面・全面とWebKitの全対象を実測し、新しい横はみ出しゼロを確認する。CI全体の成功だけで閉じない。',
    // An API outage must not overwrite the last positively observed fault.
    // merge() preserves existing params not supplied by a new derivation.
    close_check: { kind: 'viewport_measured', params: ['unmeasurable', 'overflow'].includes(v.state)
      ? { run_id: v.run_id, attempt: v.attempt, started_at: v.started_at, main_sha: v.main_sha }
      : {} } }];
}

export function viewportMeasured(params, ctx) {
  const v = ctx.viewport;
  if (v?.state !== 'healthy' || reportState(v.report) !== 'healthy' || !sha(v.main_sha)
    || !sha(v.head_sha) || !id(v.run_id) || !id(v.attempt)) {
    return { closed: false, evidence: `描画の全範囲実測は未確認 (${v?.reason ?? v?.state ?? 'unknown'})` };
  }
  if (!Number.isFinite(Date.parse(v.started_at)) || (params.started_at
    && (!Number.isFinite(Date.parse(params.started_at)) || Date.parse(v.started_at) < Date.parse(params.started_at)
    || (v.run_id === params.run_id && v.attempt <= params.attempt)))) {
    return { closed: false, evidence: '障害以降の新しい実測結果ではない' };
  }
  return { closed: true, evidence: `最新main ${v.main_sha} の全範囲実測・新規横はみ出し0: ${v.url}` };
}
