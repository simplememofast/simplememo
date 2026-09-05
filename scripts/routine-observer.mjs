#!/usr/bin/env node
// Read-only observer. No model calls, trigger changes, login, or credential refresh.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeRoutines, diagnose, validate } from './check-routine-runs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ID = /^trig_[A-Za-z0-9]+$/;
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const timestamp = () => new Date().toISOString();

export function checkWiring(workflow) {
  const start = workflow.indexOf('- name: Observe registered routine runs');
  assert(start > workflow.indexOf('- name: Prepare ledger branch before observation'), 'Read pending ledger before observing');
  const end = workflow.indexOf('\n      - name:', start + 1);
  const step = workflow.slice(start, end);
  assert.match(step, /CLAUDE_CODE_OAUTH_TOKEN: \$\{\{ secrets.CLAUDE_CODE_OAUTH_TOKEN \}\}/);
  assert.match(step, /run: node scripts\/routine-observer.mjs --apply/);
  assert.equal((workflow.match(/CLAUDE_CODE_OAUTH_TOKEN/g) ?? []).length, 2, 'Keep credential scoped to the observer step');
  assert(start < workflow.indexOf('id: act'), 'Observe before deriving actions');
  assert.match(workflow, /data\/routine-runs\.json\|autopilot\/index\.html/);
  assert.match(workflow, /data\/autonomy-score-history\.json data\/routine-runs\.json autopilot\/index\.html/);
  assert.match(workflow, /node scripts\/check-routine-runs.mjs --check/);
}

export async function collect({ token, fetchImpl = fetch, now = timestamp, maxPages = 30 } = {}) {
  assert(typeof token === 'string' && token.length > 0, 'Routine observation credential unavailable');
  const records = [], ids = new Set(), cursors = new Set();
  let cursor;
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL('https://api.anthropic.com/v1/code/triggers');
    url.searchParams.set('limit', '100');
    url.searchParams.set('include_last_run', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'ccr-triggers-2026-01-30' } });
    assert.equal(response.status, 200, `Routine observation HTTP ${response.status}`);
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Routine observation returned invalid JSON'); }
    assert(Array.isArray(payload?.data) && typeof payload.has_more === 'boolean', 'Incomplete routine inventory');
    for (const row of payload.data) {
      assert(ID.test(row?.id) && !ids.has(row.id), 'Invalid or duplicate routine identity');
      assert(typeof row.enabled === 'boolean' && typeof row.name === 'string', 'Unknown routine state');
      assert(typeof row.ended_reason === 'string', 'Unknown routine lifecycle');
      if (row.ended_reason) {
        assert(row.ended_reason === 'run_once_fired' && row.enabled === false && !row.cron_expression
          && time(row.run_once_at) && time(row.last_fired_at)
          && Date.parse(row.last_fired_at) >= Date.parse(row.run_once_at), 'Unverified ended routine');
      } else {
        // The real API omits last_run before the first fire. That remains an
        // unknown run (diagnose reports never_ran for recurring schedules).
        assert(row.last_run === null || (row.last_run === undefined && row.last_fired_at == null) || (row.last_run && ['PENDING', 'SUCCEEDED', 'FAILED']
          .includes(row.last_run.status?.replace('ROUTINE_RUN_STATUS_', ''))), 'Unknown routine run status');
        if (row.last_run) {
          assert(time(row.last_run.fired_at), 'Routine run timestamp missing');
          if (row.last_run.status.replace('ROUTINE_RUN_STATUS_', '') !== 'PENDING') assert(time(row.last_run.finished_at), 'Routine completion timestamp missing');
        }
      }
      // The API also returns prompts, connector settings, and session context.
      // Keep only operating metadata; never persist the raw response.
      const normalized = normalizeRoutines([row])[0];
      records.push({ ...normalized, ended_reason: row.ended_reason,
        last_run_session_id: row.last_run?.session_id ?? null });
      ids.add(row.id);
    }
    if (!payload.has_more) {
      const observed_at = now();
      assert(time(observed_at), 'Observation timestamp missing');
      for (const record of records) {
        for (const key of ['last_fired_at', 'last_run_fired_at', 'last_run_finished_at']) {
          assert(record[key] === null || (time(record[key]) && Date.parse(record[key]) <= Date.parse(observed_at)), 'Future or invalid routine observation');
        }
        if (record.last_run_finished_at !== null) assert(Date.parse(record.last_run_finished_at) >= Date.parse(record.last_run_fired_at), 'Reversed run timestamps');
      }
      return { observed_at, pages: page, complete: true, records };
    }
    assert(typeof payload.next_cursor === 'string' && payload.next_cursor.length > 0
      && payload.next_cursor.length <= 2048 && !cursors.has(payload.next_cursor), 'Incomplete routine pagination');
    cursor = payload.next_cursor; cursors.add(cursor);
  }
  throw new Error('Routine inventory page limit reached');
}

export function reconcileObservation(previous, observation) {
  assert(observation.complete === true && time(observation.observed_at), 'Complete observation required');
  assert(Date.parse(observation.observed_at) >= Date.parse(previous.observed_at), 'Older observation rejected');
  const current = new Map(observation.records.map(r => [r.id, r]));
  const registered = new Set(previous.routines.map(r => r.id));
  assert(registered.size > 0, 'Registered SimpleMemo routines required');
  const ended = [], routines = [];
  for (const id of registered) {
    const row = current.get(id);
    assert(row, 'Registered routine missing from the complete inventory');
    if (row.ended_reason) ended.push(row);
    else {
      const { ended_reason, ...routine } = row;
      routines.push(routine);
    }
  }
  const now = Date.parse(observation.observed_at), stopIds = new Set(previous.intentional_stops.map(f => f.id));
  const oldFindings = new Map(previous.open_findings.map(f => [f.id, f]));
  const open = [], closed = [...(previous.closed_findings ?? [])];
  for (const row of routines) {
    const what = diagnose(row, { now, observedAt: now });
    const prior = oldFindings.get(row.id);
    if (stopIds.has(row.id)) {
      assert(what === 'stopped', 'Intentional stop changed; operator decision required');
      continue;
    }
    if (what) {
      const evidence = { observed_at: observation.observed_at, enabled: row.enabled,
        last_run_status: row.last_run_status, last_run_fired_at: row.last_run_fired_at,
        last_run_finished_at: row.last_run_finished_at, last_run_session_id: row.last_run_session_id,
        next_run_at: row.next_run_at };
      open.push({ ...prior, id: row.id, what, found_at: prior?.found_at ?? observation.observed_at.slice(0, 10),
        why: prior?.why ?? `実APIの観測で ${what}。原因や依頼内容の達成は未判定。実行状態の回復を次の観測で確認する。`,
        observation: evidence });
    } else if (prior) {
      assert(row.last_run_status === 'SUCCEEDED', 'A finding needs a successful run before closure');
      const priorRun = previous.routines.find(r => r.id === row.id);
      if (priorRun?.last_run_fired_at) assert(Date.parse(row.last_run_fired_at) > Date.parse(priorRun.last_run_fired_at), 'A newer successful run is required');
      closed.push({ ...prior, closed_at: observation.observed_at,
        resolution: 'APIの実行状態がSUCCEEDEDに変わった。セッションの終了状態であり、出荷・投稿・依頼内容の達成を証明しない。',
        evidence: { last_run_fired_at: row.last_run_fired_at, last_run_finished_at: row.last_run_finished_at,
          last_run_session_id: row.last_run_session_id } });
    }
  }
  for (const row of ended) {
    assert(!stopIds.has(row.id) && !oldFindings.has(row.id), 'Ended routine has an unresolved operator decision');
  }
  const next = { ...previous, observed_at: observation.observed_at, routines,
    open_findings: open, closed_findings: closed,
    // This is the count of explicitly recorded findings, not a spending or failure allowance.
    open_budget: open.length,
    observation: { source: 'Claude Code routines API', observer: 'routine-observer', method: 'GET',
      endpoint: '/v1/code/triggers', include_last_run: true, pages: observation.pages, has_more: false,
      scope: 'registered_simplememo_routines', total_records: observation.records.length,
      unregistered_current_count: observation.records.filter(r => !r.ended_reason && !registered.has(r.id)).length,
      ended_records: observation.records.filter(r => r.ended_reason).length,
      ended_since_previous: ended.map(({ id, name, ended_reason, last_fired_at }) => ({ id, name, ended_reason, last_fired_at })),
      note: '全ページを読み、登録済みのSimpleMemoタスクだけを同期。未登録タスクは件数のみ記録し、名前やプロンプトは公開しない。意図的な停止や予定は変更しない。' } };
  const checked = validate(next, { now });
  assert.equal(checked.problems.length, 0, 'Observed routine ledger is inconsistent');
  return next;
}

async function selftest() {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/autopilot-act.yml'), 'utf8');
  checkWiring(workflow);
  assert.throws(() => checkWiring(workflow.replace('run: node scripts/routine-observer.mjs --apply', 'run: echo disconnected')));
  assert.throws(() => checkWiring(workflow.replace('data/autonomy-score-history.json data/routine-runs.json', 'data/autonomy-score-history.json')));
  const row = { id: 'trig_example1', name: 'Example', enabled: true, ended_reason: '', cron_expression: '0 0 * * *',
    last_fired_at: '2026-09-05T00:00:00Z',
    last_run: { status: 'ROUTINE_RUN_STATUS_SUCCEEDED', fired_at: '2026-09-05T00:00:00Z', finished_at: '2026-09-05T00:01:00Z', session_id: 'cse_example' },
    next_run_at: '2026-09-06T00:00:00Z', job_config: { secret: 'private-test-value' }, derived_state: { prompt: 'private-prompt' } };
  const fake = (data, has_more = false, next_cursor) => ({ status: 200, json: async () => ({ data, has_more, next_cursor }) });
  let calls = 0;
  const observed = await collect({ token: 'test-only', now: () => '2026-09-05T00:02:00Z', fetchImpl: async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(url.origin, 'https://api.anthropic.com'); assert.equal(url.searchParams.get('include_last_run'), 'true');
    calls++;
    if (calls === 1) return fake([row], true, 'page2');
    assert.equal(url.searchParams.get('cursor'), 'page2'); return fake([{ ...row, id: 'trig_example2' }]);
  } });
  assert.equal(calls, 2); assert.equal(observed.records.length, 2);
  assert(!JSON.stringify(observed).includes('private'));
  await assert.rejects(() => collect({ token: 'x', fetchImpl: async () => ({ status: 403 }) }), /HTTP 403/);
  await assert.rejects(() => collect({ token: 'x', fetchImpl: async () => ({ status: 200, json: async () => { throw new Error('private response body'); } }) }), error => error.message === 'Routine observation returned invalid JSON');
  await assert.rejects(() => collect({ token: 'x', fetchImpl: async () => fake([row], true) }), /pagination/);
  await assert.rejects(() => collect({ token: 'x', fetchImpl: async () => fake([row, row]) }), /duplicate/);
  await assert.rejects(() => collect({ token: 'x', fetchImpl: async () => fake([{ ...row, last_run: undefined }]) }), /status/);
  const notFired = await collect({ token: 'x', fetchImpl: async () => fake([{ ...row, last_run: undefined, last_fired_at: undefined }]) });
  assert.equal(notFired.records[0].last_run_status, null);
  assert.equal(diagnose(notFired.records[0], { now: Date.parse('2026-09-05T00:02:00Z') }), 'never_ran');
  await assert.rejects(() => collect({ token: 'x', maxPages: 1, fetchImpl: async () => fake([row], true, 'next') }), /page limit/);
  await assert.rejects(() => collect({ token: 'x', fetchImpl: async () => fake([{ ...row, ended_reason: 'run_once_fired' }]) }), /ended/);
  const prior = { observed_at: '2026-09-04T00:00:00Z', routines: [observed.records[0]], max_snapshot_age_days: 3,
    open_findings: [], intentional_stops: [], open_budget: 0 };
  const first = reconcileObservation(prior, observed);
  assert.equal(first.routines.length, 1); assert.equal(first.observation.unregistered_current_count, 1);
  const failed = structuredClone(observed); failed.records[0].last_run_status = 'FAILED';
  const second = reconcileObservation(first, failed);
  assert.equal(second.open_findings[0].what, 'failed'); assert.equal(second.open_budget, 1);
  const repeat = reconcileObservation(second, failed);
  assert.equal(repeat.open_findings.length, 1); assert.equal(repeat.closed_findings.length, 0);
  assert.throws(() => reconcileObservation(repeat, observed), /newer successful/);
  const later = structuredClone(observed);
  later.observed_at = '2026-09-06T00:02:00Z';
  Object.assign(later.records[0], { last_run_fired_at: '2026-09-06T00:00:00Z', last_run_finished_at: '2026-09-06T00:01:00Z', next_run_at: '2026-09-07T00:00:00Z' });
  const recovered = reconcileObservation(repeat, later);
  assert.equal(recovered.open_budget, 0); assert.equal(recovered.closed_findings.length, 1);
  assert(recovered.closed_findings[0].resolution.includes('達成を証明しない'));
  assert.throws(() => reconcileObservation(second, { ...observed, records: [] }), /missing/);
  assert.throws(() => reconcileObservation(prior, { ...observed, complete: false }), /Complete/);
  assert.throws(() => reconcileObservation(prior, { ...observed, observed_at: '2026-09-03T00:00:00Z' }), /Older/);
  assert.throws(() => reconcileObservation({ ...prior, intentional_stops: [{ id: row.id, why: 'owner stopped' }] }, observed), /Intentional/);
  console.log('routine-observer: complete pagination, private-field exclusion, failure recording, verified closure and stop preservation passed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const task = process.argv.includes('--selftest') ? selftest : async () => {
    assert(process.argv.includes('--apply') || process.argv.includes('--probe'), 'Use --apply or --probe');
    const observed = await collect({ token: process.env.CLAUDE_CODE_OAUTH_TOKEN });
    const file = path.join(ROOT, 'data/routine-runs.json');
    const prior = JSON.parse(fs.readFileSync(file, 'utf8'));
    const next = reconcileObservation(prior, observed);
    if (process.argv.includes('--apply')) fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
    console.log(JSON.stringify({ observed_at: next.observed_at, pages: observed.pages, registered: next.routines.length,
      open_findings: next.open_findings.length, unregistered_current_count: next.observation.unregistered_current_count,
      written: process.argv.includes('--apply') }));
  };
  task().catch(error => { console.error(error.message); process.exitCode = 1; });
}
