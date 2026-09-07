import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARKER, STEP, measurementGroup, reportState, parseReport, observeViewport } from './lib/viewport-health.mjs';
import { derive, merge, reconcile, classify, validateLedger } from './autopilot-act.mjs';

const repo = 'simplememofast/simplememo';
const main = 'a'.repeat(40), head = 'b'.repeat(40);
const start = '2026-09-07T10:00:00Z', end = '2026-09-07T10:10:00Z';
const now = Date.parse('2026-09-07T12:00:00Z');
const step = { name: STEP, status: 'completed', conclusion: 'success', started_at: start, completed_at: end };
const request = [{ page: '/', width: 320 }, { page: '/', width: 360 }];
const result = { measurable: true, results: request.map(r => ({ ...r, over: 0 })), failures: [], problems: [] };
const good = () => ({ version: 1, static_problems: 0, groups: Object.fromEntries(
  ['blink_deep', 'blink_sweep', 'webkit'].map(k => [k, measurementGroup(result, request)])) });
const line = report => `${end.replace('00Z', '00.5000000Z')} ${MARKER}${JSON.stringify(report)}\n`;

function fixture({ report = good(), log = line(report), change = () => {}, mainChanged = false,
  rerun = false, denial = false, pending = false, direct = false } = {}) {
  const run = { id: 100, run_attempt: 1, head_sha: direct ? main : head, repository: { full_name: repo },
    head_repository: { full_name: repo }, path: '.github/workflows/seo-check.yml',
    event: direct ? 'push' : 'pull_request', head_branch: direct ? 'main' : 'Codex/example',
    status: pending ? 'in_progress' : 'completed', conclusion: 'success', run_started_at: start };
  const pr = { merged_at: end, merge_commit_sha: main, base: { ref: 'main', repo: { full_name: repo } },
    head: { sha: head, repo: { full_name: repo } } };
  const job = { id: 200, run_id: 100, head_sha: run.head_sha, status: 'completed', steps: [structuredClone(step)] };
  const state = { run, prs: direct ? [] : [pr], job, total: 1 };
  change(state);
  const calls = []; let refs = 0;
  const json = x => new Response(JSON.stringify(x));
  async function fetchImpl(url, options) {
    calls.push(url);
    assert.equal(options.method, undefined, 'only GET requests');
    if (url === 'https://logs.example/signed') {
      assert.equal(options.headers, undefined, 'no credential on signed download');
      return new Response(log);
    }
    assert.ok(url.startsWith(`https://api.github.com/repos/${repo}/`));
    if (denial) return new Response('', { status: 403 });
    const route = url.replace(`https://api.github.com/repos/${repo}`, '');
    if (route === '/git/ref/heads/main') return json({ object: { sha: ++refs > 1 && mainChanged ? 'c'.repeat(40) : main } });
    if (route.startsWith('/commits/')) return json(state.prs);
    if (route.startsWith('/actions/workflows/')) return json({ total_count: state.total, workflow_runs: [state.run] });
    if (route.endsWith('/jobs?per_page=100')) return json({ total_count: 1, jobs: [state.job] });
    if (route === '/actions/jobs/200/logs') return new Response(null, { status: 302, headers: { location: 'https://logs.example/signed' } });
    if (route === '/actions/runs/100') return json({ ...state.run, run_attempt: rerun ? 2 : 1 });
    throw new Error(`Unexpected fixture request: ${route}`);
  }
  return { fetchImpl, calls };
}
const observe = async options => {
  const f = fixture(options);
  return observeViewport({ repo, token: 'fixture', now, fetchImpl: f.fetchImpl });
};

test('coverage needs each requested combination once, including disabled/unmeasurable engines', () => {
  assert.equal(measurementGroup(result, request).complete, true);
  for (const r of [null, { measurable: false }, { ...result, results: [] },
    { ...result, results: [result.results[0], result.results[0]] },
    { ...result, results: [{ page: '/other', width: 320, over: 0 }, result.results[1]] },
    { ...result, failures: [{ page: '/', width: 320 }] },
    { ...result, results: result.results.map(r => ({ ...r, over: NaN })) }]) {
    assert.equal(measurementGroup(r, request).complete, false);
  }
});

test('report cannot turn missing data or impossible coverage into zero defects', () => {
  assert.equal(reportState(good()), 'healthy');
  for (const edit of [r => delete r.groups.webkit, r => r.groups.webkit.measured--,
    r => r.groups.webkit.failures++, r => r.groups.webkit.expected = 0,
    r => r.groups.webkit.complete = 'yes', r => delete r.static_problems]) {
    const r = good(); edit(r); assert.equal(reportState(r), 'unknown');
  }
  const r = good(); r.groups.webkit.complete = false;
  assert.equal(reportState(r), 'unmeasurable');
  r.groups.webkit.complete = true; r.groups.webkit.problems = 1;
  assert.equal(reportState(r), 'overflow');
});

test('only one exact marker in the measured step is accepted', () => {
  assert.deepEqual(parseReport(line(good()), step), good());
  for (const log of ['', line(good()).repeat(2), `echo ${line(good())}`,
    line(good()).replace('10:10:', '10:11:'), line(good()).replace('10:10:', '09:59:'),
    `${start} ${MARKER}{broken}\n`]) assert.equal(parseReport(log, step), null);
});

test('green CI with unmeasured WebKit yields a real action; later measured run closes it and recurrence reopens', async () => {
  const report = good(); report.groups.webkit = measurementGroup(null, request);
  const viewport = await observe({ report });
  assert.equal(viewport.state, 'unmeasurable');
  const ctx = { viewport, today: '2026-09-07' }, ledger = { actions: [] };
  const candidates = derive(ctx).filter(a => a.source === 'viewport');
  merge(ledger, candidates, ctx.today); merge(ledger, candidates, ctx.today);
  assert.equal(ledger.actions.length, 1); assert.equal(ledger.actions[0].auto, null);
  reconcile(ledger, ctx); assert.equal(ledger.actions[0].state, 'open');
  const healthy = await observe();
  reconcile(ledger, { ...ctx, viewport: healthy }); // same run/attempt isn't recovery
  assert.equal(ledger.actions[0].state, 'open');
  reconcile(ledger, { ...ctx, viewport: { ...healthy, run_id: 101, started_at: end } });
  assert.equal(ledger.actions[0].state, 'done');
  merge(ledger, candidates, ctx.today); assert.equal(ledger.actions[0].state, 'open');
});

test('current-main provenance, API uncertainty and reruns never fall back to older healthy logs', async () => {
  const cases = [
    { denial: true }, { mainChanged: true }, { rerun: true }, { log: '' },
    { change: s => { s.prs[0].merged_at = null; } },
    { change: s => { s.prs[0].head.repo.full_name = 'fork/simplememo'; } },
    { change: s => { s.run.head_sha = 'c'.repeat(40); } },
    { change: s => { s.run.head_repository.full_name = 'fork/simplememo'; } },
    { change: s => { s.run.path = '.github/workflows/other.yml'; } },
    { change: s => { s.run.run_started_at = '2026-08-01T00:00:00Z'; } },
    { change: s => { s.run.run_started_at = '2026-09-08T00:00:00Z'; } },
    { change: s => { s.job.steps[0].conclusion = 'skipped'; } },
    { change: s => { s.job.head_sha = 'c'.repeat(40); } },
    { change: s => { s.total = 101; } },
  ];
  for (const c of cases) assert.equal((await observe(c)).state, 'unknown');
  assert.equal((await observe()).state, 'healthy');
  assert.equal((await observe({ direct: true })).state, 'healthy');
});

test('pending run is neither recovery nor a new repair while actively measuring', async () => {
  const viewport = await observe({ pending: true });
  assert.equal(viewport.reason, 'run_pending');
  const ctx = { viewport, today: '2026-09-07' };
  assert.equal(derive(ctx).filter(a => a.source === 'viewport').length, 0);
  const ledger = { actions: [{ id: 'act-viewport-measurement', state: 'open',
    close_check: { kind: 'viewport_measured', params: {} } }] };
  reconcile(ledger, ctx); assert.equal(ledger.actions[0].state, 'open');
});

test('large log response is bounded and unreadable observation remains open', async () => {
  const viewport = await observe({ log: 'x'.repeat(8 * 1024 * 1024 + 1) });
  assert.equal(viewport.state, 'unknown');
  const ctx = { viewport, today: '2026-09-07' }, ledger = { actions: [] };
  merge(ledger, derive(ctx).filter(a => a.source === 'viewport'), ctx.today);
  reconcile(ledger, ctx); assert.equal(ledger.actions[0].state, 'open');
});

test('read failure preserves the known fault; a read-only outage can close on the same verified run', async () => {
  const healthy = await observe(), ctx = { today: '2026-09-07' }, ledger = { actions: [] };
  const report = good(); report.groups.webkit.complete = false;
  const failed = await observe({ report });
  merge(ledger, derive({ ...ctx, viewport: failed }).filter(a => a.source === 'viewport'), ctx.today);
  const params = structuredClone(ledger.actions[0].close_check.params);
  merge(ledger, derive({ ...ctx, viewport: await observe({ denial: true }) }).filter(a => a.source === 'viewport'), ctx.today);
  assert.deepEqual(ledger.actions[0].close_check.params, params);
  reconcile(ledger, { ...ctx, viewport: healthy });
  assert.equal(ledger.actions[0].state, 'open');
  const unknownOnly = { actions: [] };
  merge(unknownOnly, derive({ ...ctx, viewport: await observe({ log: '' }) }).filter(a => a.source === 'viewport'), ctx.today);
  reconcile(unknownOnly, { ...ctx, viewport: healthy });
  assert.equal(unknownOnly.actions[0].state, 'done');
  ledger.actions[0].state = 'acknowledged';
  merge(ledger, derive({ ...ctx, viewport: failed }).filter(a => a.source === 'viewport'), ctx.today);
  assert.equal(ledger.actions[0].state, 'acknowledged');
  merge(ledger, derive({ ...ctx, viewport: { ...failed, attempt: 2 } }).filter(a => a.source === 'viewport'), ctx.today);
  assert.equal(ledger.actions[0].state, 'open');
});

test('real authority routes the candidate to an AI session without granting an unattended handler', () => {
  const matrix = JSON.parse(fs.readFileSync(new URL('../data/authority-matrix.json', import.meta.url)));
  const ledger = { actions: [] }, ctx = { today: '2026-09-07', viewport: { state: 'unknown', reason: 'observation_failed' } };
  merge(ledger, derive(ctx).filter(a => a.source === 'viewport'), ctx.today);
  const action = ledger.actions[0];
  assert.equal(classify(action, matrix).owner, 'ai');
  assert.equal(action.auto, null);
  assert.deepEqual(validateLedger(ledger, matrix), []);
  assert.equal(classify({ ...action, auto: 'not-authorized' }, matrix).owner, 'human');
  assert.equal(classify({ ...action, force_owner: 'human' }, matrix).owner, 'human');
});
