#!/usr/bin/env node
// Prospective decisions and their settlements. No metric approvals or scoring weights live here.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { judge, loadContext as eligibilityContext, todayJst } from './autonomy-eligibility.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const shift = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const finite = Number.isFinite;
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2 : null; };
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const write = (f, x) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), JSON.stringify(x, null, 2) + '\n'); };
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
export const METRICS = ['shipping_day_rate', 'publishing_day_rate', 'time_to_detect_hours', 'unresolved_failures', 'usd_per_shipped', 'eligibility_unrecorded_rate'];
// Mathematical domains of the readers above, not configurable scoring targets.
const RATE_METRICS = new Set(['shipping_day_rate', 'publishing_day_rate', 'eligibility_unrecorded_rate']);
export const intentPath = id => `data/decision-intents/${id}.json`;
export function approvedMetric(metrics, id) {
  const m = metrics.metrics.find(x => x.id === id);
  return m?.tier === 'A' && typeof m.approved_by === 'string' && m.approved_by.trim() && dateOK(m.approved_at) && METRICS.includes(id) ? m : null;
}

// Missing days/unknown cost do not become zero. Daily observations are closed JST days.
export function observe(metric, date, runs, costs = []) {
  const day = runs.filter(r => r.date_jst === date);
  const ships = day.filter(r => r.outcome === 'shipped');
  if (!day.length) return { value: null, n: 0, reason: 'missing_day' };
  let value = null, n = day.length;
  if (metric === 'shipping_day_rate') value = Number(ships.length > 0);
  else if (metric === 'publishing_day_rate') value = Number(ships.some(r => ['A', 'B', 'C', 'D', 'E'].includes(r.lane)));
  else if (metric === 'time_to_detect_hours') {
    const faults = day.filter(r => ['execution', 'cost', 'absent'].includes(r.failure_stage));
    const hours = faults.map(r => (Date.parse(r.detected_at) - Date.parse(r.failed_at)) / 36e5);
    n = faults.length;
    if (hours.length && hours.every(h => finite(h) && h >= 0)) value = median(hours);
  } else if (metric === 'unresolved_failures') {
    const prior = runs.filter(r => r.date_jst <= date);
    value = prior.filter(r => ['execution', 'cost', 'absent'].includes(r.failure_stage)
      && !prior.some(x => x.outcome === 'shipped' && x.repair_of?.includes(r.run_id))).length;
    n = prior.length;
  } else if (metric === 'usd_per_shipped') {
    const attempted = day.filter(r => r.attempted);
    const amounts = attempted.map(r => costs.find(c => c.run_id === r.external_ref || c.run_id === r.run_id)?.total_cost_usd);
    n = attempted.length;
    if (ships.length && n && amounts.every(x => finite(x) && x >= 0)) value = amounts.reduce((a, b) => a + b, 0) / ships.length;
  } else if (metric === 'eligibility_unrecorded_rate') {
    const rejected = day.filter(r => r.failure_stage === 'eligibility');
    n = rejected.length;
    if (n) value = rejected.filter(r => !r.gate_code || r.eligibility_verdict === 'declined_unrecorded').length / n;
  }
  return { value, n, reason: value === null ? 'insufficient_observations' : null };
}

export function forecast(metric, date, runs, costs) {
  const model = metric.null_model;
  if (model.kind === 'zero') return { value: 0, n: 0, samples: [] };
  const days = model.kind === 'same_weekday_median'
    ? Array.from({ length: model.k }, (_, i) => shift(date, -7 * (i + 1)))
    : Array.from({ length: model.window_days }, (_, i) => shift(date, -i - 1));
  const samples = days.map(d => ({ date: d, ...observe(metric.id, d, runs, costs) }));
  const values = samples.map(x => x.value).filter(finite);
  // Event metrics need at least 3 observations; daily rates need the complete window.
  const daily = ['shipping_day_rate', 'publishing_day_rate', 'unresolved_failures'].includes(metric.id);
  const minimum = daily || model.kind === 'same_weekday_median' ? days.length : 3;
  return { value: values.length >= minimum ? median(values) : null, n: values.length, samples };
}

const domainMaximum = id => RATE_METRICS.has(id) ? 1 : Infinity;
const improvementPossible = (metric, value) => finite(value)
  && (metric.direction === 'up' ? value < domainMaximum(metric.id) : value > 0);

// Approval alone does not mean a directional contract can be declared today.
// Expose the same observed baseline and mathematical bounds that prepare uses,
// before the picker spends a run inventing candidates for a saturated metric.
export function readiness({ metrics, runs, costs = [], now }) {
  const today = todayJst(now);
  const approved = METRICS.filter(id => approvedMetric(metrics, id));
  const observations = approved.map(id => {
    const metric = approvedMetric(metrics, id);
    const baseline = observe(id, shift(today, -1), runs, costs);
    const model = forecast(metric, today, runs, costs);
    const missing = !finite(baseline.value) || !finite(model.value);
    return { metric: id, direction: metric.direction, baseline_date: shift(today, -1),
      baseline: baseline.value, null_forecast: model.value, forecast_observed_days: model.n,
      state: missing ? 'awaiting_observations' : improvementPossible(metric, model.value)
        ? 'forecast_available' : 'no_directional_room',
      reason: missing ? 'A measured prior-day baseline and the approved comparison window are required.'
        : improvementPossible(metric, model.value) ? 'Candidate eligibility, scope, cost and actual prediction still require validation.'
        : 'The approved comparison is already at the best possible outcome. Do not weaken the gate or manufacture a decline.',
    };
  });
  return { approved, pending_owner: METRICS.filter(id => !approvedMetric(metrics, id)), date_jst: today,
    forecast_available: observations.filter(r => r.state === 'forecast_available').map(r => r.metric), observations };
}

export function contractProblems(c, metrics) {
  const p = [];
  const require = (ok, why) => { if (!ok) p.push(why); };
  require(/^[a-z0-9][a-z0-9-]{2,99}$/.test(c?.id ?? ''), 'invalid contract id');
  require(typeof c?.run_id === 'string' && c.run_id.length > 0, 'run_id required');
  const m = approvedMetric(metrics, c?.metric);
  require(Boolean(m), 'metric must have human approval and a supported reader');
  require(finite(Date.parse(c?.created_at)), 'created_at required');
  require(Number.isInteger(c?.horizon_days) && c.horizon_days >= 1 && c.horizon_days <= 28, 'horizon_days must be 1..28');
  require(finite(c?.baseline), 'measured baseline required');
  require(finite(c?.null_model?.value), 'null forecast required');
  require(finite(c?.predicted_delta) && c.predicted_delta !== 0, 'nonzero predicted_delta required');
  require(finite(c?.p) && c.p >= 0 && c.p <= 1, 'probability must be 0..1');
  require(finite(c?.rank_gap) && c.rank_gap >= 0, 'rank_gap required');
  require(c?.counterfactual?.id && c.counterfactual.id !== c.id && typeof c.counterfactual.reason === 'string' && c.counterfactual.reason.length >= 10, 'runner-up and comparison required');
  require(c?.eligibility?.criteria && Object.values(c.eligibility.criteria).length === 5 && Object.values(c.eligibility.criteria).every(x => x.result === 'pass'), 'all five eligibility criteria must pass');
  require(['R0', 'R1'].includes(c?.eligibility?.reversibility_class), 'R0/R1 only');
  require(Array.isArray(c?.touches) && c.touches.length > 0 && c.touches.every(safePath), 'bounded paths required');
  require(Number.isInteger(c?.max_changed_lines) && c.max_changed_lines > 0 && c.max_changed_lines <= 1500, 'diff budget must be 1..1500 lines');
  require(Number.isInteger(c?.max_binary_bytes) && c.max_binary_bytes >= 0 && c.max_binary_bytes <= 5242880, 'binary budget must be 0..5 MiB');
  require(finite(c?.predicted_usd) && c.predicted_usd >= 0, 'cost prediction required');
  if (m) {
    require(m.approved_at <= todayJst(new Date(c.created_at)), 'metric approval must precede declaration');
    require(c.metric_policy_hash === digest(m), 'metric policy changed since declaration');
    require(c.null_model?.kind === m.null_model.kind, 'null model kind differs from approved policy');
    require(c.predicted_delta * (m.direction === 'up' ? 1 : -1) > 0, 'prediction must match approved direction');
    const maximum = domainMaximum(m.id);
    const inDomain = value => finite(value) && value >= 0 && value <= maximum;
    require(inDomain(c.baseline), 'baseline outside metric domain');
    require(inDomain(c.null_model?.value), 'null forecast outside metric domain');
    require(inDomain(c.null_model?.value + c.predicted_delta), 'predicted outcome outside metric domain');
    require(improvementPossible(m, c.null_model?.value),
      'null forecast already at the best possible outcome; directional improvement is impossible');
  }
  return p;
}

export function safePath(p) {
  return typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !/[\\\x00-\x1f*?\[\]]/.test(p)
    && !p.split('/').some(s => s === '..' || s === '.' || !s);
}

export function prepare(candidate, ctx) {
  const m = approvedMetric(ctx.metrics, candidate.metric);
  if (!m) throw new Error('metric_not_approved: data/value-metrics.json requires the owner’s per-metric approval');
  const today = todayJst(ctx.now);
  const decision = judge({ created_jst: today, ...candidate }, { ...ctx.eligibility, today });
  if (Object.values(decision.criteria).some(x => x.result !== 'pass')) throw new Error(`ineligible: ${decision.reasons.join('; ')}`);
  const baseline = observe(m.id, shift(today, -1), ctx.runs, ctx.costs);
  const nullModel = forecast(m, today, ctx.runs, ctx.costs);
  const c = {
    id: candidate.id, run_id: candidate.run_id, created_at: ctx.now.toISOString(),
    metric: m.id, metric_policy_hash: digest(m), baseline: baseline.value, baseline_date: shift(today, -1),
    null_model: { kind: m.null_model.kind, ...nullModel }, predicted_delta: candidate.predicted_delta,
    p: candidate.p, horizon_days: candidate.horizon_days, counterfactual: candidate.counterfactual,
    rank_gap: candidate.rank_gap, touches: candidate.touches, max_changed_lines: candidate.max_changed_lines,
    max_binary_bytes: candidate.max_binary_bytes ?? 5242880,
    predicted_usd: candidate.predicted_usd, eligibility: decision,
    evidence: { source_hash: digest({ runs: ctx.runs, costs: ctx.costs }), date: candidate.evidence_date },
    rollback: { mode: 'revert_static_only', paths: candidate.touches.filter(staticPath) },
  };
  c.input = Object.fromEntries(['id', 'run_id', 'metric', 'touches', 'lane', 'action', 'domain', 'reversibility_class',
    'evidence_date', 'predicted_usd', 'predicted_delta', 'p', 'horizon_days', 'max_changed_lines', 'counterfactual', 'rank_gap',
    'scope', 'created_jst', 'max_binary_bytes'].filter(k => candidate[k] !== undefined).map(k => [k, candidate[k]]));
  const problems = contractProblems(c, ctx.metrics);
  if (problems.length) throw new Error(problems.join('; '));
  return c;
}

export const staticPath = p => safePath(p) && /^(?:index\.html|(?:en|obsidian|blog|use-cases|vs)\/.*\.html|assets\/.*\.(?:png|jpg|jpeg|webp|svg))$/.test(p);

// Delivery evidence is independent of the picker. PR commit history supplies the declaration time.
export function settle(c, delivery, ctx) {
  const problems = contractProblems(c, ctx.metrics);
  if (problems.length) return { state: 'blocked', reasons: problems };
  if (!delivery?.verified || delivery.intent_hash !== digest(c) || !finite(Date.parse(delivery.deployed_at))) return { state: 'awaiting_deployment' };
  const start = shift(todayJst(new Date(delivery.deployed_at)), 1);
  const end = shift(start, c.horizon_days - 1);
  if (todayJst(ctx.now) <= end) return { state: 'pending', due_after_jst: end };
  const samples = Array.from({ length: c.horizon_days }, (_, i) => ({ date: shift(start, i), ...observe(c.metric, shift(start, i), ctx.runs, ctx.costs) }));
  if (samples.some(s => !finite(s.value))) return { state: 'awaiting_data', due_after_jst: end, missing: samples.filter(s => s.value === null).map(s => s.date) };
  const actual = samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
  const delta = actual - c.null_model.value;
  const event = Number(delta * Math.sign(c.predicted_delta) > 0);
  return { state: 'settled', settled_at: ctx.now.toISOString(), actual, delta, event,
    brier: (c.p - event) ** 2, samples, observation_hash: digest(samples),
    delivery, due_after_jst: end, note: 'Directional calibration against the frozen null model; not a causal estimate.' };
}

export function verifiedSettlement(c) {
  const s = c?.settlement;
  return s?.state === 'settled' && finite(s.actual) && finite(s.brier) && s.brier >= 0 && s.brier <= 1
    && [0, 1].includes(s.event) && finite(Date.parse(s.settled_at)) && s.delivery?.verified === true
    && /^[a-f0-9]{40}$/.test(s.delivery?.merge_sha ?? '') && /^[a-f0-9]{64}$/.test(s.observation_hash ?? '')
    && Array.isArray(s.samples) && s.samples.length === c.horizon_days && s.samples.every(x => finite(x.value))
    && digest(s.samples) === s.observation_hash && s.delivery.intent_hash === digest(c.intent)
    && Date.parse(c.intent?.created_at) < Date.parse(s.delivery.deployed_at)
    && s.brier === (c.intent.p - s.event) ** 2;
}

export async function selectContract(candidates, ctx, state, contracts) {
  const { choose, review } = await import('./decision-review.mjs');
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 10 || candidates.some(c => !finite(c.rank)) || new Set(candidates.map(c => c.id)).size !== candidates.length) throw new Error('2..10 distinct ranked candidates required');
  const ranked = [...candidates].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  const normalized = candidates.map(c => {
    const other = ranked.find(x => x.id !== c.id);
    if (c.counterfactual?.id !== other.id) throw new Error('counterfactual must identify the highest-ranked alternative');
    return { ...c, rank_gap: ranked[0].rank - ranked[1].rank };
  });
  const eligible = normalized.map(c => {
    try { prepare(c, ctx); return { ...c, eligible: true }; }
    catch (error) { return { ...c, eligible: false, rejection: error.message }; }
  });
  const selection = choose(eligible, state, review(contracts, state));
  if (!selection.selected) throw new Error(`no eligible candidate with approved metrics and fresh observations: ${eligible.map(c => `${c.id}: ${c.rejection}`).join('; ')}`);
  return { ...prepare(normalized.find(c => c.id === selection.selected), ctx), selection, candidates: normalized };
}

export function feedback(contracts) {
  const settled = contracts.filter(verifiedSettlement);
  return { settled: settled.length, mean_brier: settled.length ? settled.reduce((s, c) => s + c.settlement.brier, 0) / settled.length : null,
    by_metric: Object.fromEntries(METRICS.map(id => {
      const rows = settled.filter(c => c.intent.metric === id);
      return [id, { n: rows.length, mean_brier: rows.length ? rows.reduce((s, c) => s + c.settlement.brier, 0) / rows.length : null }];
    })), scoring_rule: 'raw_brier_only' };
}

// A declaration whose declaring run died is retired, never implemented: its run_id is already a
// historical run, so boundRun would refuse to bind it to a later ship. Retirement keeps the record
// under data/decision-rejections/ (bookkeeping for decision-ci) and frees the day for a fresh declaration.
export function retireIntent(intent, { reason, now = new Date(), contracts = [], runs = [] } = {}) {
  const problems = [];
  const id = intent?.id;
  if (!(typeof id === 'string' && /^[a-z0-9][a-z0-9-]{2,99}$/.test(id))) problems.push('invalid intent id');
  if (!(typeof intent?.run_id === 'string' && intent.run_id.length > 0)) problems.push('intent has no run_id');
  if (!(typeof reason === 'string' && reason.trim().length >= 8)) problems.push('a reason of at least 8 characters is required');
  if (contracts.some(c => c.id === id)) problems.push('contract already registered; retirement is only for declarations that never shipped');
  if (runs.some(r => r.run_id === intent?.run_id && r.outcome === 'shipped')) problems.push('declaring run shipped; a shipped declaration is settled, not retired');
  if (problems.length) throw new Error(problems.join('; '));
  const declaring = runs.find(r => r.run_id === intent.run_id);
  let declaringRun = null;
  if (declaring) declaringRun = { outcome: declaring.outcome ?? null, failure_class: declaring.failure_class ?? null };
  return {
    id, run_id: intent.run_id, at: now.toISOString(), stage: 'execution', reason: reason.trim(),
    retired_from: intentPath(id), metric: intent.metric ?? null, declared_at: intent.created_at ?? null,
    declared_lane: intent.input?.lane ?? null, declared_action: intent.input?.action ?? null,
    declaring_run: declaringRun,
  };
}

export function loadIntents() {
  const dir = path.join(ROOT, 'data/decision-intents');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => read(`data/decision-intents/${f}`)) : [];
}

// Verify the pre-declaration is a separate ancestor commit; timestamps alone are forgeable.
export function verifyHistory(c, base, head, cwd = ROOT) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  const f = intentPath(c.id);
  const commits = git('rev-list', '--reverse', `${base}..${head}`).split('\n').filter(Boolean);
  const added = commits.find(sha => git('diff-tree', '--no-commit-id', '--name-only', '-r', '--diff-filter=A', sha).split('\n').includes(f));
  if (!added) throw new Error('intent was not added before implementation');
  if (git('show', `${added}:${f}`) !== JSON.stringify(c, null, 2)) throw new Error('intent changed after declaration');
  const before = git('diff', '--name-only', base, added).split('\n').filter(Boolean);
  if (before.some(p => !p.startsWith('data/decision-intents/') && !p.startsWith('data/decision-rejections/'))) throw new Error('implementation preceded declaration');
  const nums = git('diff', '--numstat', added, head).split('\n').filter(Boolean).map(l => l.split('\t'));
  const metadata = new Set(['data/autopilot-runs.json', 'data/autopilot-status.json', 'docs/obsidian/AUTOPILOT_LOG.md', 'data/distribution-queue.json', 'autopilot/index.html']);
  let lines = 0, binaryBytes = 0;
  for (const [a, d, p] of nums) {
    if (p === f) throw new Error('intent is immutable');
    if (!c.touches.includes(p) && !metadata.has(p)) throw new Error(`undeclared path: ${p}`);
    if (c.touches.includes(p)) {
      if (a === '-' || d === '-') {
        // Deletion has no blob at head; charge the original size in that case.
        const exists = git('ls-tree', head, '--', p);
        binaryBytes += Number(git('cat-file', '-s', `${exists ? head : added}:${p}`));
      } else lines += Number(a) + Number(d);
    }
  }
  if (lines > c.max_changed_lines) throw new Error('actual diff exceeds declared budget');
  if (binaryBytes > c.max_binary_bytes) throw new Error('actual binary diff exceeds declared budget');
  return { declaration_sha: added, changed_lines: lines, binary_bytes: binaryBytes };
}

export async function selftest() {
  const metrics = { metrics: [{ id: 'shipping_day_rate', tier: 'A', approved_by: 'test-owner', approved_at: '2026-08-01', direction: 'up', null_model: { kind: 'trailing_median', window_days: 3 } }] };
  const runs = [1, 2, 3].map(i => ({ run_id: `r${i}`, date_jst: `2026-09-0${i}`, outcome: 'no_run' }));
  const el = eligibilityContext({ today: '2026-09-04' });
  const ctx = { metrics, runs, costs: [], now: new Date('2026-09-04T00:00:00Z'), eligibility: el };
  const candidate = { id: 'test-contract', run_id: 'test-run', metric: 'shipping_day_rate', touches: ['index.html'], lane: 'A', action: 'refresh',
    evidence_date: '2026-09-03', predicted_usd: 0, predicted_delta: .1, p: .8, horizon_days: 1,
    max_changed_lines: 100, counterfactual: { id: 'runner-up', reason: 'Independent candidate comparison' }, rank_gap: .1 };
  const c = prepare(candidate, ctx);
  assert.equal(c.baseline, 0);
  assert.equal(c.null_model.value, 0);
  assert.equal(observe('shipping_day_rate', '2026-09-10', runs).value, null);
  assert.equal(observe('usd_per_shipped', '2026-09-01', [{ date_jst: '2026-09-01', attempted: true, outcome: 'shipped' }]).value, null);
  for (const change of [{ p: 2 }, { horizon_days: 0 }, { predicted_delta: 0 }, { counterfactual: null }, { max_changed_lines: 0 }, { touches: ['../index.html'] }, { evidence_date: '2099-01-01' }]) assert.throws(() => prepare({ ...candidate, ...change }, ctx));
  assert.throws(() => prepare(candidate, { ...ctx, metrics: { metrics: [{ ...metrics.metrics[0], approved_by: null }] } }));
  // A daily rate cannot improve past 100%, even if its supplied probability is low.
  // These are local fixtures, never production contracts or recovery evidence.
  assert.equal(prepare({ ...candidate, predicted_delta: 1 }, ctx).predicted_delta, 1);
  assert.throws(() => prepare({ ...candidate, predicted_delta: 1.1 }, ctx), /predicted outcome outside metric domain/);
  const saturated = { ...ctx, runs: runs.map(r => ({ ...r, outcome: 'shipped', lane: 'F' })) };
  assert.deepEqual(readiness(ctx).forecast_available, ['shipping_day_rate']);
  assert.equal(readiness(saturated).observations[0].state, 'no_directional_room');
  assert.deepEqual(readiness(saturated).forecast_available, []);
  assert.equal(readiness({ ...ctx, runs: runs.slice(0, -1) }).observations[0].state, 'awaiting_observations');
  assert.equal(readiness({ ...ctx, metrics: { metrics: [{ ...metrics.metrics[0], approved_by: null }] } }).observations.length, 0);
  assert.equal(readiness({ ...ctx, now: new Date('2026-09-03T15:00:00Z') }).date_jst, '2026-09-04');
  assert.throws(() => prepare(candidate, saturated), /directional improvement is impossible/);
  assert.throws(() => prepare({ ...candidate, predicted_delta: Number.MIN_VALUE }, saturated), /directional improvement is impossible/);
  for (const id of ['unresolved_failures', 'eligibility_unrecorded_rate']) {
    const metric = { ...metrics.metrics[0], id, direction: 'down' };
    const policy = { metrics: [metric] };
    if (id === 'unresolved_failures') assert.equal(readiness({ ...ctx, metrics: policy }).observations[0].state, 'no_directional_room');
    const base = { ...c, metric: id, metric_policy_hash: digest(metric), predicted_delta: -1 };
    assert(contractProblems(base, policy).some(p => p.includes('directional improvement is impossible')));
    assert.equal(contractProblems({ ...base, baseline: 1, null_model: { ...base.null_model, value: 1 } }, policy).length, 0);
    assert(contractProblems({ ...base, predicted_delta: -2, baseline: 1, null_model: { ...base.null_model, value: 1 } }, policy)
      .includes('predicted outcome outside metric domain'));
  }
  const delivery = { verified: true, intent_hash: digest(c), merge_sha: 'a'.repeat(40), deployed_at: '2026-09-04T01:00:00Z' };
  assert.equal(settle(c, delivery, ctx).state, 'pending');
  const later = { ...ctx, now: new Date('2026-09-06T00:00:00Z') };
  assert.equal(settle(c, delivery, later).state, 'awaiting_data');
  later.runs = [...runs, { run_id: 'ship', date_jst: '2026-09-05', outcome: 'shipped' }];
  const settlement = settle(c, delivery, later);
  assert.equal(settlement.state, 'settled');
  assert.equal(settlement.brier, (.8 - 1) ** 2);
  const row = { id: c.id, run_id: c.run_id, intent: c, horizon_days: c.horizon_days, settlement };
  assert.equal(verifiedSettlement(row), true);
  assert.equal(verifiedSettlement({ ...row, settlement: { ...settlement, observation_hash: '0'.repeat(64) } }), false);
  assert.equal(verifiedSettlement({ run_id: 'fake', settled_at: 'today' }), false);
  assert.equal(feedback([row]).mean_brier, settlement.brier);
  const choices = [{ ...candidate, rank: 1, counterfactual: { id: 'runner-up', reason: 'First candidate has direct evidence' } },
    { ...candidate, id: 'runner-up', rank: .95, counterfactual: { id: candidate.id, reason: 'Alternative changes another operation' } }];
  const chosen = await selectContract(choices, ctx, { selections: [] }, []);
  assert.equal(chosen.selection.selected, candidate.id);
  const forced = await selectContract(choices, ctx, { selections: [], mandate: { selections: [] } }, []);
  assert.equal(forced.selection.selected, 'runner-up');
  const publishing = { ...metrics.metrics[0], id: 'publishing_day_rate' };
  const feasible = { ...saturated, metrics: { metrics: [...metrics.metrics, publishing] } };
  const mixed = [choices[0], { ...choices[1], metric: publishing.id }];
  assert.equal((await selectContract(mixed, feasible, { selections: [] }, [])).selection.selected, 'runner-up');
  await assert.rejects(selectContract(choices, saturated, { selections: [] }, []), /test-contract:.*directional improvement is impossible.*runner-up:/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-history-test-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    g('init'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid');
    fs.writeFileSync(path.join(dir, 'index.html'), 'before\n'); g('add', '.'); g('commit', '-m', 'base');
    const base = g('rev-parse', 'HEAD');
    fs.mkdirSync(path.join(dir, 'data/decision-intents'), { recursive: true });
    fs.writeFileSync(path.join(dir, intentPath(c.id)), JSON.stringify(c, null, 2) + '\n'); g('add', '.'); g('commit', '-m', 'declare');
    fs.writeFileSync(path.join(dir, 'index.html'), 'after\n'); g('add', '.'); g('commit', '-m', 'implement');
    const head = g('rev-parse', 'HEAD');
    assert.equal(verifyHistory(c, base, head, dir).changed_lines, 2);
    fs.writeFileSync(path.join(dir, 'outside.txt'), 'not declared\n'); g('add', '.'); g('commit', '-m', 'escape');
    assert.throws(() => verifyHistory(c, base, g('rev-parse', 'HEAD'), dir), /undeclared path/);
    assert.throws(() => verifyHistory({ ...c, p: .9 }, base, head, dir), /changed after/);
    assert.throws(() => verifyHistory({ ...c, id: 'missing-id' }, base, head, dir), /not added/);
    // Takeover after a declaring run died (2026-09-05): the dead declaration is retired into
    // rejections, a fresh declaration follows, and the fresh one still verifies as declaration-first.
    g('checkout', '-q', '-b', 'takeover', base);
    fs.mkdirSync(path.join(dir, 'data/decision-intents'), { recursive: true });
    fs.writeFileSync(path.join(dir, intentPath(c.id)), JSON.stringify(c, null, 2) + '\n'); g('add', '.'); g('commit', '-q', '-m', 'declare (dies)');
    const retired = retireIntent(c, { reason: 'declaring run test-run failed (usage_limit); takeover re-declares', now: new Date('2026-09-05T00:00:00Z'),
      runs: [{ run_id: c.run_id, outcome: 'failed', failure_class: 'usage_limit' }] });
    assert.equal(retired.stage, 'execution');
    assert.equal(retired.retired_from, intentPath(c.id));
    assert.equal(retired.declaring_run.failure_class, 'usage_limit');
    fs.mkdirSync(path.join(dir, 'data/decision-rejections'), { recursive: true });
    fs.writeFileSync(path.join(dir, `data/decision-rejections/${c.id}.json`), JSON.stringify(retired, null, 2) + '\n');
    fs.rmSync(path.join(dir, intentPath(c.id))); g('add', '-A'); g('commit', '-q', '-m', 'retire');
    const fresh = { ...c, id: 'test-contract-2', run_id: 'test-run-2' };
    fs.writeFileSync(path.join(dir, intentPath(fresh.id)), JSON.stringify(fresh, null, 2) + '\n'); g('add', '.'); g('commit', '-q', '-m', 'declare again');
    fs.writeFileSync(path.join(dir, 'index.html'), 'after takeover\n'); g('add', '.'); g('commit', '-q', '-m', 'implement');
    const takeoverHead = g('rev-parse', 'HEAD');
    assert.equal(verifyHistory(fresh, base, takeoverHead, dir).changed_lines, 2);
    // Exactly one live declaration remains in the branch diff (what decision-ci counts).
    const live = g('diff', '--name-only', base, takeoverHead).split('\n').filter(f => /^data\/decision-intents\//.test(f));
    assert.deepEqual(live, [intentPath(fresh.id)]);
    assert.throws(() => retireIntent(c, { reason: '' }), /reason/);
    assert.throws(() => retireIntent(c, { reason: 'long enough reason', contracts: [{ id: c.id }] }), /already registered/);
    assert.throws(() => retireIntent(c, { reason: 'long enough reason', runs: [{ run_id: c.run_id, outcome: 'shipped' }] }), /shipped/);
    assert.throws(() => retireIntent({ ...c, run_id: '' }, { reason: 'long enough reason' }), /run_id/);
  } finally { fs.rmSync(dir, { recursive: true }); }
  console.log('value-contracts: prospective contracts, approval, missing data, maturity, raw Brier and retirement checks passed');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  const metrics = read('data/value-metrics.json');
  if (args.includes('--readiness')) {
    console.log(JSON.stringify(readiness({ metrics, runs: read('data/autopilot-runs.json').runs,
      costs: read('data/autopilot-cost.json').runs, now: new Date() }), null, 2)); return;
  }
  if (args.includes('--prepare')) {
    const file = args[args.indexOf('--prepare') + 1];
    const candidate = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(candidate.id ?? '')) throw new Error('invalid candidate id');
    try {
      const c = prepare(candidate, { metrics, runs: read('data/autopilot-runs.json').runs, costs: read('data/autopilot-cost.json').runs,
        now: new Date(), eligibility: eligibilityContext() });
      const f = intentPath(c.id);
      if (fs.existsSync(path.join(ROOT, f))) throw new Error('intent already exists; never overwrite a prediction');
      // A clean checkout makes the declaration commit unambiguous.
      if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('commit or discard your existing edits before declaring');
      write(f, c); console.log(`Created ${f}. Commit and push this declaration before implementing.`);
    } catch (e) {
      write(`data/decision-rejections/${candidate.id}.json`, { id: candidate.id, at: new Date().toISOString(), stage: 'eligibility', reason: e.message }); throw e;
    }
    return;
  }
  if (args.includes('--select')) {
    const candidates = JSON.parse(fs.readFileSync(args[args.indexOf('--select') + 1], 'utf8'));
    const state = read('data/decision-review.json');
    const context = { metrics, runs: read('data/autopilot-runs.json').runs, costs: read('data/autopilot-cost.json').runs, now: new Date(), eligibility: eligibilityContext() };
    let contract;
    try { contract = await selectContract(candidates, context, state, read('data/value-contracts.json').contracts); }
    catch (e) {
      write(`data/decision-rejections/batch-${digest(candidates).slice(0, 16)}.json`, { at: new Date().toISOString(), stage: 'eligibility', reason: e.message }); throw e;
    }
    if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('declare from a clean tracked tree');
    if (fs.existsSync(path.join(ROOT, intentPath(contract.id)))) throw new Error('intent exists; cannot change prediction');
    write(intentPath(contract.id), contract);
    console.log(JSON.stringify({ intent: intentPath(contract.id), ...contract.selection }, null, 2)); return;
  }
  if (args.includes('--retire')) {
    const file = args[args.indexOf('--retire') + 1];
    const ri = args.indexOf('--reason');
    const reason = ri >= 0 ? args[ri + 1] : '';
    if (!/^data\/decision-intents\/[a-z0-9][a-z0-9-]{2,99}\.json$/.test(file ?? '')) throw new Error('--retire takes a path under data/decision-intents/');
    if (git('status', '--porcelain', '--untracked-files=no')) throw new Error('retire from a clean tracked tree');
    const intent = read(file);
    const rejection = retireIntent(intent, { reason, now: new Date(),
      contracts: read('data/value-contracts.json').contracts, runs: read('data/autopilot-runs.json').runs });
    const target = `data/decision-rejections/${intent.id}.json`;
    if (fs.existsSync(path.join(ROOT, target))) throw new Error('rejection already recorded for this id');
    write(target, rejection);
    fs.rmSync(path.join(ROOT, file));
    console.log(JSON.stringify({ retired: file, rejection: target, reason: rejection.reason }, null, 2)); return;
  }
  if (args.includes('--feedback')) { console.log(JSON.stringify(feedback(read('data/value-contracts.json').contracts), null, 2)); return; }
  const problems = loadIntents().flatMap(c => contractProblems(c, metrics).map(p => `${c.id}: ${p}`));
  for (const row of read('data/value-contracts.json').contracts) if (row.settlement?.state === 'settled' && !verifiedSettlement(row)) problems.push(`${row.id}: unverified settlement`);
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`value-contracts OK; ${loadIntents().length} declarations; approved metrics: ${METRICS.filter(id => approvedMetric(metrics, id)).length}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
