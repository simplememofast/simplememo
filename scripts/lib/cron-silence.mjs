/** Scheduled-run absence is different from a failed run. Read-only observation. */
export const SCHEDULE_EXPECTATIONS = Object.freeze([
  // 15-minute schedule: tolerate twelve intervals before reporting silence.
  Object.freeze({ path: '.github/workflows/decision-monitor.yml', max_silence_minutes: 180 }),
]);

const integer = x => Number.isSafeInteger(x) && x > 0;
const timestamp = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const expectation = p => SCHEDULE_EXPECTATIONS.find(e => e.path === p);
const markerPrefix = '<!-- cron-silence ';

export async function observeScheduleSilence({ github, owner, repo, now = Date.now() }) {
  if (!Number.isFinite(now)) throw new Error('定期起動の観測日時が不正');
  const silent = [];
  for (const policy of SCHEDULE_EXPECTATIONS) {
    const { data: workflow } = await github.rest.actions.getWorkflow({ owner, repo,
      workflow_id: policy.path.split('/').at(-1) });
    if (!integer(workflow?.id) || workflow.path !== policy.path || workflow.state !== 'active'
      || !timestamp(workflow.created_at) || Date.parse(workflow.created_at) > now) {
      throw new Error(`${policy.path}: 有効な定期実行の対象を確認できない`);
    }
    const cutoff = now - policy.max_silence_minutes * 60_000;
    // Newly registered workflows get the same grace period as an existing schedule.
    if (Date.parse(workflow.created_at) > cutoff) continue;
    const { data } = await github.rest.actions.listWorkflowRuns({ owner, repo, workflow_id: workflow.id,
      event: 'schedule', created: `>=${new Date(cutoff).toISOString()}`, per_page: 1, page: 1 });
    if (!Number.isSafeInteger(data?.total_count) || data.total_count < 0 || !Array.isArray(data.workflow_runs)
      || data.workflow_runs.length > 1 || data.total_count < data.workflow_runs.length
      || (data.total_count > 0 && data.workflow_runs.length === 0)) {
      throw new Error(`${policy.path}: 定期実行一覧が不完全`);
    }
    for (const run of data.workflow_runs) {
      if (!integer(run?.id) || run.workflow_id !== workflow.id || run.event !== 'schedule'
        || !timestamp(run.created_at) || Date.parse(run.created_at) < cutoff || Date.parse(run.created_at) > now) {
        throw new Error(`${policy.path}: 定期実行の期間・対象を確認できない`);
      }
    }
    // One real scheduled start is enough for liveness; completion belongs to recovery.
    if (data.workflow_runs.length) continue;
    silent.push({ workflow_id: workflow.id, workflow_path: policy.path,
      name: workflow.name || policy.path, observed_at: new Date(now).toISOString(),
      since: new Date(cutoff).toISOString(), max_silence_minutes: policy.max_silence_minutes });
  }
  return silent;
}

export function silenceMarker(row, owner, repo, observedVia) {
  return markerPrefix + JSON.stringify({ owner, repo, workflow_id: row.workflow_id,
    workflow_path: row.workflow_path, observed_at: row.observed_at, observed_via: observedVia }) + ' -->';
}

export function silenceRefs(bodies, owner, repo, now) {
  const refs = new Map();
  for (const body of bodies) for (const line of body.split('\n')) {
    if (!line.startsWith(markerPrefix)) continue;
    if (!line.endsWith(' -->')) throw new Error('不正な定期起動欠落の記録');
    const row = JSON.parse(line.slice(markerPrefix.length, -4));
    if (row.owner !== owner || row.repo !== repo || !integer(row.workflow_id)
      || !expectation(row.workflow_path) || !timestamp(row.observed_at) || Date.parse(row.observed_at) > now) {
      throw new Error('定期起動欠落の対象・日時を確認できない');
    }
    const prior = refs.get(row.workflow_id);
    if (!prior || Date.parse(row.observed_at) > Date.parse(prior.observed_at)) refs.set(row.workflow_id, row);
  }
  return [...refs.values()];
}

export async function selftest() {
  const errors = []; const check = (yes, why) => { if (!yes) errors.push(why); };
  const now = Date.parse('2026-09-04T12:00:00Z');
  const metadata = { id: 30, name: 'Decision Monitor', path: SCHEDULE_EXPECTATIONS[0].path,
    state: 'active', created_at: '2026-09-04T08:00:00Z' };
  const run = { id: 301, workflow_id: 30, event: 'schedule', created_at: '2026-09-04T11:59:00Z' };
  async function probe({ workflow = metadata, rows = [], total = rows.length, fail = null } = {}) {
    const requests = [];
    const github = { rest: { actions: {
      getWorkflow: async p => { requests.push(p); if (fail === 'metadata') throw new Error('403'); return { data: workflow }; },
      listWorkflowRuns: async p => { requests.push(p); if (fail === 'runs') throw new Error('network');
        return { data: { total_count: total, workflow_runs: rows } }; },
    } } };
    try { return { silent: await observeScheduleSilence({ github, owner: 'o', repo: 'r', now }), requests }; }
    catch (error) { return { error, requests }; }
  }
  const absent = await probe();
  check(absent.silent?.length === 1, '定期起動が無い状態を見逃した');
  check(absent.requests.some(p => p.event === 'schedule' && p.created === '>=2026-09-04T09:00:00.000Z'
    && !('status' in p)), '定期起動の期間またはeventの指定が無い');
  for (const status of ['queued', 'in_progress', 'completed']) {
    check((await probe({ rows: [{ ...run, status }] })).silent?.length === 0, `最近の${status}を起動欠落とした`);
  }
  const fresh = await probe({ workflow: { ...metadata, created_at: '2026-09-04T11:00:00Z' } });
  check(fresh.silent?.length === 0 && fresh.requests.length === 1, '新設直後の猶予を守らない');
  for (const workflow of [null, { ...metadata, state: 'disabled_manually' }, { ...metadata, id: 0 },
    { ...metadata, path: '.github/workflows/other.yml' }, { ...metadata, created_at: '2099-01-01' }]) {
    check(Boolean((await probe({ workflow })).error), '対象不明を正常または起動欠落にした');
  }
  for (const rows of [[{ ...run, event: 'workflow_dispatch' }], [{ ...run, event: 'workflow_run' }],
    [{ ...run, workflow_id: 31 }], [{ ...run, created_at: '2026-09-04T08:00:00Z' }],
    [{ ...run, created_at: '2099-01-01' }], [{}], null]) {
    check(Boolean((await probe({ rows, total: 1 })).error), '期間・対象・event不明を正常とした');
  }
  for (const options of [{ rows: [], total: 1 }, { rows: [run], total: 0 }, { total: null },
    { fail: 'metadata' }, { fail: 'runs' }]) check(Boolean((await probe(options)).error), '不完全な観測を正常にした');
  const marker = silenceMarker(absent.silent?.[0] ?? {}, 'o', 'r', 'workflow_dispatch');
  check(silenceRefs([marker], 'o', 'r', now)[0]?.workflow_id === 30, '起動欠落の追跡参照が失われた');
  check(silenceRefs(['a link\n' + marker], 'o', 'r', now)[0]?.observed_via === 'workflow_dispatch', '手動観測の出所が失われた');
  const repeated = silenceRefs([marker.replace('12:00:00', '11:00:00'), ...Array(60).fill(marker)], 'o', 'r', now);
  check(repeated.length === 1 && repeated[0].observed_at === new Date(now).toISOString(), '日々の追記で同じ対象を重複させた、または最新の欠落を失った');
  for (const bad of [marker.replace('"repo":"r"', '"repo":"else"'), marker.replace('2026-09-04', '2099-09-04'),
    marker.replace('decision-monitor.yml', 'other.yml'), '<!-- cron-silence broken -->']) {
    try { silenceRefs([bad], 'o', 'r', now); check(false, '不正な追跡参照を無視した'); } catch { /* expected */ }
  }
  return errors;
}
