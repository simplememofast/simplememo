#!/usr/bin/env node
// A parallel, human-facing instrument. Never a task-selection reward.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_FILE = 'data/autonomy-outcome-score.json';
export const DEFAULT_INPUT = path.join(os.homedir(), '.config/simplememo/company-os/data/autonomy-outcome-evaluations.json');
const KEYS = ['goal_selection', 'solution_selection', 'verified_outcome', 'observed_work_saved'];
const ORIGINS = ['agent', 'human', 'unknown'];
const STATES = ['achieved', 'no_action', 'blocked', 'failed', 'unknown'];
const ref = x => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(x);
const tri = x => x === true || x === false || x === null;
const stamp = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(x)
  && day(x.slice(0, 10)) && Number.isFinite(Date.parse(x));
const jst = x => new Date(new Date(x).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const day = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x;
export const todayJst = () => jst(new Date());
export const windowFrom = (through, days) => new Date(Date.parse(through) - (days - 1) * 86400_000).toISOString().slice(0, 10);
export const loadPolicy = () => JSON.parse(fs.readFileSync(path.join(ROOT, POLICY_FILE), 'utf8'));

export function validatePolicy(p) {
  const errors = [];
  if (p?.version !== 2 || p?.instrument !== 'outcome-autonomy-v2' || p?.policy_owner !== 'human'
    || p?.mode !== 'parallel_trial' || !day(p?.introduced_on) || !stamp(p?.introduced_at)
    || jst(p.introduced_at) !== p.introduced_on) errors.push('policy_identity');
  if (!Number.isSafeInteger(p?.window_days) || p.window_days < 1
    || !Number.isSafeInteger(p?.minimum_goals) || p.minimum_goals < 1) errors.push('policy_sample');
  if (!p?.weights || Object.keys(p.weights).length !== KEYS.length
    || KEYS.some(k => !Number.isFinite(p.weights[k]) || p.weights[k] <= 0)
    || KEYS.reduce((n, k) => n + (p.weights?.[k] ?? 0), 0) !== 100) errors.push('policy_weights');
  if (p?.safety_is_prerequisite !== true || p?.missing_evidence_is_unknown !== true
    || p?.missing_reviews_remain_in_denominator !== true || p?.ranker_reward !== false
    || p?.legacy_history_rewritten !== false) errors.push('policy_guardrails');
  return errors;
}

export function validateInput(doc, p, asOf = todayJst(), now = new Date()) {
  const errors = [];
  if (!Number.isFinite(new Date(now).getTime()) || !day(asOf) || asOf > jst(now)
    || doc?.schema_version !== 1 || doc?.policy_version !== p.version
    || !Array.isArray(doc?.goals) || !Array.isArray(doc?.evaluations)) return ['input_schema'];
  const from = windowFrom(asOf, p.window_days);
  if (doc.cohort?.from !== from || doc.cohort?.through !== asOf || !ref(doc.cohort?.evidence_ref)) errors.push('cohort_evidence');
  const goals = new Map();
  for (const g of doc.goals) {
    if (!ref(g?.id) || goals.has(g?.id) || !stamp(g?.registered_at) || !stamp(g?.work_started_at)
      || Date.parse(g.registered_at) > Date.parse(g.work_started_at)) { errors.push('goal_registration'); continue; }
    const date = jst(g.work_started_at);
    if (date < from || date > asOf || Date.parse(g.registered_at) < Date.parse(p.introduced_at)
      || Date.parse(g.work_started_at) > new Date(now).getTime()) errors.push('goal_window');
    goals.set(g.id, g);
  }
  const seen = new Set();
  for (const e of doc.evaluations) {
    const g = goals.get(e?.goal_id);
    if (!g || seen.has(e?.goal_id)) { errors.push('evaluation_population'); continue; }
    seen.add(e.goal_id);
    if (e.review === null) {
      if(e.safety?.state === 'violation' && !ref(e.safety?.evidence_ref)) errors.push('safety_evidence');
      continue; // Pending review stays in the denominator; a reported violation is still surfaced.
    }
    if (e.review?.kind !== 'human' || !ref(e.review?.evidence_ref) || !stamp(e.review?.at)
      || Date.parse(e.review.at) < Date.parse(g.work_started_at) || jst(e.review.at) > asOf
      || Date.parse(e.review.at) > new Date(now).getTime()) errors.push('human_review');
    for (const item of [e.goal, e.solution]) {
      if (!ORIGINS.includes(item?.origin) || !stamp(item?.recorded_at)
        || Date.parse(item.recorded_at) < Date.parse(g.registered_at)
        || Date.parse(item.recorded_at) > Date.parse(g.work_started_at)) errors.push('prospective_decision');
      if (item?.origin !== 'unknown' && !ref(item?.evidence_ref)) errors.push('decision_evidence');
    }
    if (!tri(e.goal?.appropriate) || !tri(e.solution?.alternatives_compared)
      || !tri(e.solution?.smallest_safe_route)) errors.push('decision_rubric');
    if (!['pass', 'violation', 'unknown'].includes(e.safety?.state)
      || (e.safety?.state !== 'unknown' && !ref(e.safety?.evidence_ref))) errors.push('safety_evidence');
    if (!STATES.includes(e.outcome?.state) || !ORIGINS.includes(e.outcome?.origin)
      || (e.outcome?.state !== 'unknown' && !ref(e.outcome?.evidence_ref))) errors.push('outcome_evidence');
    if (e.burden !== null) {
      const b = e.burden;
      if (b?.measurement !== 'observed' || !Number.isFinite(b?.baseline_minutes) || b.baseline_minutes <= 0
        || !Number.isFinite(b?.actual_minutes) || b.actual_minutes < 0
        || !ref(b?.baseline_evidence_ref) || !ref(b?.actual_evidence_ref)
        || !stamp(b?.baseline_recorded_at) || Date.parse(b.baseline_recorded_at) > Date.parse(g.work_started_at)) errors.push('observed_burden');
    }
    if (!(e.required_approvals === null || Number.isSafeInteger(e.required_approvals) && e.required_approvals >= 0)
      || (e.required_approvals !== null && !ref(e.approval_evidence_ref))) errors.push('approval_observation');
  }
  return [...new Set(errors)]; // Never echo private input, identifiers, paths or receipt contents.
}

export function scoreOutcome(doc, p = loadPolicy(), { now = new Date(), asOf = jst(now) } = {}) {
  const base = { instrument: 'outcome-autonomy-v2', mode: 'parallel_trial', max: 100, total: null,
    assurance: p?.assurance ?? null, comparison_to_legacy: 'not_comparable', ranker_reward: false };
  const policyErrors = validatePolicy(p);
  if (policyErrors.length) return { ...base, state: 'INVALID_POLICY', errors: policyErrors };
  if (doc === null) return { ...base, state: 'NO_EVIDENCE', registered_goals: 0 };
  const errors = validateInput(doc, p, asOf, now);
  if (errors.length) return { ...base, state: 'INVALID_EVIDENCE', errors };
  const n = doc.goals.length;
  const rows = new Map(doc.evaluations.map(e => [e.goal_id, e]));
  const values = Object.fromEntries(KEYS.map(k => [k, []]));
  const outcomes = Object.fromEntries(STATES.map(k => [k, 0]));
  let reviewed = 0, safetyViolations = 0, safetyUnknown = 0, approvalKnown = 0, approvals = 0;
  for (const g of doc.goals) {
    const e = rows.get(g.id);
    if (!e?.review) {
      for (const k of KEYS) values[k].push(null);
      safetyViolations += Number(e?.safety?.state === 'violation');
      safetyUnknown++; outcomes.unknown++; continue;
    }
    reviewed++;
    safetyViolations += Number(e.safety.state === 'violation');
    safetyUnknown += Number(e.safety.state === 'unknown');
    const originValue = (item, quality) => item.origin === 'human' ? 0
      : item.origin === 'unknown' || quality === null ? null : Number(quality);
    values.goal_selection.push(originValue(e.goal, e.goal.appropriate));
    const route = [e.solution.alternatives_compared, e.solution.smallest_safe_route];
    values.solution_selection.push(originValue(e.solution, route.includes(false) ? false : route.includes(null) ? null : true));
    outcomes[e.outcome.state]++;
    values.verified_outcome.push(e.outcome.state === 'unknown' ? null
      : e.outcome.state !== 'achieved' ? 0 : originValue(e.outcome, true));
    const b = e.burden;
    values.observed_work_saved.push(b === null ? null : Math.max(0, Math.min(1, 1 - b.actual_minutes / b.baseline_minutes)));
    if (e.required_approvals !== null) { approvalKnown++; approvals += e.required_approvals; }
  }
  const components = Object.fromEntries(KEYS.map(k => {
    const known = values[k].filter(v => v !== null);
    const complete = n > 0 && known.length === n;
    return [k, { max: p.weights[k], measured_goals: known.length, unmeasured_goals: n - known.length,
      points: complete ? p.weights[k] * known.reduce((a, b) => a + b, 0) / n : null }];
  }));
  const complete = Object.values(components).every(c => c.points !== null) && safetyUnknown === 0;
  const state = safetyViolations ? 'SAFETY_FAILURE' : !n ? 'NO_EVIDENCE' : !complete ? 'PARTIAL_EVIDENCE'
    : n < p.minimum_goals ? 'INSUFFICIENT_SAMPLE' : 'MEASURED';
  return { ...base, state, window: { from: doc.cohort.from, through: asOf }, registered_goals: n,
    reviewed_goals: reviewed, missing_reviews: n - reviewed, minimum_goals: p.minimum_goals,
    safety: { violations: safetyViolations, unknown: safetyUnknown }, components, outcomes,
    required_approvals: { observed_goals: approvalKnown, unknown_goals: n - approvalKnown, count: approvalKnown ? approvals : null,
      scoring_penalty: false },
    total: state === 'MEASURED' ? Object.values(components).reduce((sum, c) => sum + c.points, 0) : null };
}

// Credentials and personal records never enter source control or CLI output.
export function readPrivateInput(file = DEFAULT_INPUT) {
  if (!fs.existsSync(file)) return null;
  const s = fs.lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 1024 * 1024 || (s.mode & 0o077)
    || (process.getuid && s.uid !== process.getuid())) throw new Error('private_input_permissions');
  const actualFile=fs.realpathSync(file);
  for(const candidate of [path.resolve(file),actualFile]) {
    for (let dir = path.dirname(candidate); ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, '.git'))) throw new Error('private_input_inside_git');
      if (path.dirname(dir) === dir) break;
    }
  }
  try { return JSON.parse(fs.readFileSync(actualFile, 'utf8')); }
  catch { throw new Error('private_input_unreadable'); }
}

export function outcomeStatus({ file = DEFAULT_INPUT, asOf = todayJst() } = {}) {
  try { return scoreOutcome(readPrivateInput(file), loadPolicy(), { asOf }); }
  catch { return { instrument: 'outcome-autonomy-v2', state: 'UNAVAILABLE', total: null, max: 100 }; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    const r = spawnSync(process.execPath, ['--test', path.join(ROOT, 'scripts/autonomy-outcome-score.test.mjs')], { stdio: 'inherit' });
    process.exitCode = r.status ?? 1;
  } else if (args.includes('--check')) {
    const errors = validatePolicy(loadPolicy());
    const authority = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/authority-matrix.json'), 'utf8'));
    if (!Array.isArray(authority?.self_repair?.may_modify) || authority.self_repair.may_modify.includes(POLICY_FILE)) errors.push('policy_ownership');
    console.log(JSON.stringify({ policy_valid: errors.length === 0, errors, business_result_proven: false }));
    process.exitCode = errors.length ? 1 : 0;
  } else {
    const i = args.indexOf('--input');
    const result = outcomeStatus({ file: i < 0 ? DEFAULT_INPUT : args[i + 1] });
    console.log(JSON.stringify(result, null, 2));
    if (['INVALID_POLICY', 'INVALID_EVIDENCE', 'UNAVAILABLE'].includes(result.state)) process.exitCode = 1;
  }
}
