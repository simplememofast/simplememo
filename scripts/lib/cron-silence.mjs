/** Scheduled-run absence is different from a failed run. Read-only observation. */
export const SCHEDULE_EXPECTATIONS = Object.freeze([
  // 15-minute schedule: tolerate twelve intervals before reporting silence.
  Object.freeze({ path: '.github/workflows/decision-monitor.yml', max_silence_minutes: 180 }),
  // Daily schedule: one 24-hour interval plus four hours for delayed starts.
  Object.freeze({ path: '.github/workflows/main-daily-validation.yml', max_silence_minutes: 1680 }),
]);

const integer = x => Number.isSafeInteger(x) && x > 0;
const timestamp = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
const expectation = p => SCHEDULE_EXPECTATIONS.find(e => e.path === p);
const markerPrefix = '<!-- cron-silence ';

export async function observeScheduleSilence({ github, owner, repo, now = Date.now() }) {
  if (!Number.isFinite(now)) throw new Error('定期起動の観測日時が不正');
  const { data: repository } = await github.rest.repos.get({ owner, repo });
  const defaultBranch = repository?.default_branch;
  if (typeof defaultBranch !== 'string' || !defaultBranch.trim()) throw new Error('定期起動の既定ブランチを確認できない');
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
      event: 'schedule', branch: defaultBranch, created: `>=${new Date(cutoff).toISOString()}`, per_page: 1, page: 1 });
    if (!Number.isSafeInteger(data?.total_count) || data.total_count < 0 || !Array.isArray(data.workflow_runs)
      || data.workflow_runs.length > 1 || data.total_count < data.workflow_runs.length
      || (data.total_count > 0 && data.workflow_runs.length === 0)) {
      throw new Error(`${policy.path}: 定期実行一覧が不完全`);
    }
    for (const run of data.workflow_runs) {
      if (!integer(run?.id) || run.workflow_id !== workflow.id || run.event !== 'schedule' || run.head_branch !== defaultBranch
        || !timestamp(run.created_at) || Date.parse(run.created_at) < cutoff || Date.parse(run.created_at) > now) {
        throw new Error(`${policy.path}: 定期実行の期間・対象・既定ブランチを確認できない`);
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
  const metadata = SCHEDULE_EXPECTATIONS.map((policy, index) => ({ id: 30 + index, path: policy.path,
    state: 'active', created_at: '2026-09-01T08:00:00Z' }));
  const runs = metadata.map(workflow => ({ id: workflow.id * 10 + 1, workflow_id: workflow.id,
    event: 'schedule', head_branch: 'main', created_at: '2026-09-04T11:59:00Z' }));
  async function probe({ target = 0, workflow = metadata[target], rows = [], total = rows?.length,
    fail = null, defaultBranch = 'main', sourceRows = null } = {}) {
    const requests = [];
    const github = { rest: { repos: { get: async p => {
      requests.push(p); if (fail === 'repo') throw new Error('403'); return { data: { default_branch: defaultBranch } };
    } }, actions: {
      getWorkflow: async p => {
        requests.push(p); if (fail === 'metadata') throw new Error('403');
        const index = metadata.findIndex(w => w.path.split('/').at(-1) === p.workflow_id);
        return { data: index === target ? workflow : metadata[index] };
      },
      listWorkflowRuns: async p => {
        requests.push(p); if (fail === 'runs') throw new Error('network');
        const index = metadata.findIndex(w => w.id === p.workflow_id);
        if (index !== target) return { data: { total_count: 1, workflow_runs: [{ ...runs[index], head_branch: defaultBranch }] } };
        if (sourceRows) {
          const selected = sourceRows.filter(r => r.event === p.event && r.head_branch === p.branch
            && Date.parse(r.created_at) >= Date.parse(p.created.slice(2)));
          return { data: { total_count: selected.length, workflow_runs: selected.slice(0, p.per_page) } };
        }
        return { data: { total_count: total, workflow_runs: rows } };
      },
    } } };
    try { return { silent: await observeScheduleSilence({ github, owner: 'o', repo: 'r', now }), requests }; }
    catch (error) { return { error, requests }; }
  }
  const absent = [];
  for (const [target, policy] of SCHEDULE_EXPECTATIONS.entries()) {
    const result = await probe({ target }); absent.push(result.silent?.[0]);
    check(result.silent?.length === 1 && result.silent[0].workflow_path === policy.path,
      `${policy.path}: 定期起動が無い状態を見逃した`);
    const cutoff = new Date(now - policy.max_silence_minutes * 60_000).toISOString();
    check(result.requests.some(p => p.workflow_id === metadata[target].id && p.event === 'schedule'
      && p.branch === 'main' && p.created === `>=${cutoff}` && !('status' in p)),
    `${policy.path}: 定期起動の期間・event・既定ブランチの指定が無い`);
    for (const status of ['queued', 'in_progress', 'completed']) {
      check((await probe({ target, rows: [{ ...runs[target], status }] })).silent?.length === 0,
        `${policy.path}: 最近の${status}を起動欠落とした`);
    }
    const fresh = await probe({ target, workflow: { ...metadata[target], created_at: new Date(Date.parse(cutoff) + 1).toISOString() } });
    check(fresh.silent?.length === 0 && !fresh.requests.some(p => p.workflow_id === metadata[target].id),
      `${policy.path}: 新設直後の猶予を守らない`);
    const initialBoundary = await probe({ target, workflow: { ...metadata[target], created_at: cutoff } });
    check(initialBoundary.silent?.[0]?.workflow_path === policy.path, `${policy.path}: 初回猶予を過ぎても欠落を見逃した`);
    for (const workflow of [null, { ...metadata[target], state: 'disabled_manually' }, { ...metadata[target], id: 0 },
      { ...metadata[target], path: '.github/workflows/other.yml' }, { ...metadata[target], created_at: '2099-01-01' }]) {
      check(Boolean((await probe({ target, workflow })).error), `${policy.path}: 対象不明を正常または起動欠落にした`);
    }
    for (const rows of [[{ ...runs[target], event: 'workflow_dispatch' }], [{ ...runs[target], event: 'workflow_run' }],
      [{ ...runs[target], head_branch: 'feature' }], [{ ...runs[target], workflow_id: 99 }],
      [{ ...runs[target], created_at: new Date(Date.parse(cutoff) - 1).toISOString() }],
      [{ ...runs[target], created_at: '2099-01-01' }], [{}], null]) {
      check(Boolean((await probe({ target, rows, total: 1 })).error), `${policy.path}: 期間・対象・event・ブランチ不明を正常とした`);
    }
    for (const event of ['workflow_dispatch', 'workflow_run']) {
      check((await probe({ target, sourceRows: [{ ...runs[target], event }] })).silent?.[0]?.workflow_path === policy.path,
        `${policy.path}: ${event}を自然な定期起動の代用にした`);
    }
    check((await probe({ target, sourceRows: [{ ...runs[target], head_branch: 'feature' }] })).silent?.[0]?.workflow_path === policy.path,
      `${policy.path}: 別ブランチを既定ブランチの定期起動の代用にした`);
  }
  check((await probe({ target: 1, sourceRows: [{ ...runs[1], created_at: '2026-09-03T12:00:00Z' }] })).silent?.length === 0,
    '日次の24時間以内の自然起動を欠落とした');
  check((await probe({ target: 1, sourceRows: [{ ...runs[1], created_at: '2026-09-03T08:00:00Z' }] })).silent?.length === 0,
    '日次の28時間の猶予境界にある起動を欠落とした');
  check((await probe({ target: 1, sourceRows: [{ ...runs[1], created_at: '2026-09-03T07:59:59Z' }] })).silent?.[0]?.workflow_id === 31,
    '日次の28時間を超えた自然起動だけで欠落を隠した');
  check((await probe({ target: 1, defaultBranch: 'release', rows: [{ ...runs[1], head_branch: 'release' }] })).silent?.length === 0,
    'APIで確認した既定ブランチをmainに固定した');
  for (const options of [{ rows: [], total: 1 }, { rows: [runs[0]], total: 0 }, { total: null },
    { fail: 'metadata' }, { fail: 'runs' }, { fail: 'repo' }, { defaultBranch: null }, { defaultBranch: '' }]) {
    check(Boolean((await probe(options)).error), '不完全な観測を正常にした');
  }
  const markers = absent.map(row => silenceMarker(row ?? {}, 'o', 'r', 'workflow_dispatch'));
  const marker = markers[0];
  check(silenceRefs(markers, 'o', 'r', now).length === 2, '日次と短周期の起動欠落を同時に追跡できない');
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
