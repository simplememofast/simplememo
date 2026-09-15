import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './company-metrics.mjs';
import { privateState, atomicJson, acquireLock } from './company-loop.mjs';
import { fingerprint, gscEvidence, gscBaseline, gscScope, period } from './experiment-evidence.mjs';
import { isDeepStrictEqual } from 'node:util';

const fileName = 'growth-followups.json';
const date = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
  return value;
};
const today = now => now.toISOString().slice(0, 10);
const parentHash = parent => fingerprint(JSON.stringify(parent));
const canonical = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/experiments/experiments.json'))).experiments;

export function growthFollowups({ stateRoot, now = new Date() }) {
  const file = path.join(privateState(stateRoot), fileName);
  const doc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { schema_version: 1, reviews: [] };
  if (doc.schema_version !== 1 || !Array.isArray(doc.reviews)) throw new Error('Invalid Growth follow-up store');
  const seen = new Set();
  return { ...doc, reviews: doc.reviews.map(r => {
    if (seen.has(r.id) || !['RUNNING', 'EVALUATED'].includes(r.status) || parentHash(r.parent) !== r.parent_sha256) throw new Error('Growth follow-up identity or parent integrity failed');
    seen.add(r.id);
    for(const key of ['registered_at','evaluated_at'])if(r[key]!=null&&!Number.isFinite(Date.parse(r[key])))throw new Error('Invalid follow-up lifecycle timestamp');
    date(r.evaluation_date); date(r.post_start); date(r.post_end);
    const status=r.status==='EVALUATED'&&r.evaluated_at&&Date.parse(r.evaluated_at)>+now?'RUNNING':r.status;
    return { ...r, status, due: status === 'RUNNING' && r.evaluation_date <= today(now) };
  }).filter(r=>!r.registered_at||Date.parse(r.registered_at)<=+now) };
}

export function registerGrowthFollowup({ stateRoot, experimentId, evaluationDate, postStart, postEnd, rationale,
  now = new Date(), experiments = canonical() }) {
  date(evaluationDate); date(postStart); date(postEnd);
  if (!rationale?.trim() || evaluationDate <= today(now) || postStart <= today(now) || postEnd < postStart || Date.parse(evaluationDate) - Date.parse(postEnd) < 3 * 86400000) throw new Error('Follow-up requires a future window, GSC maturity and rationale');
  const parent = experiments.find(e => e.id === experimentId);
  if (parent?.status !== 'evaluated' || !['ctr', 'position', 'impressions'].includes(parent.target_metric)
    || !['keep', 'iterate', 'inconclusive'].includes(parent.decision)) throw new Error('Only an admitted, measured GSC review can register this follow-up');
  const baseline=gscBaseline(parent);
  if (baseline.days !== period(postStart, postEnd).days) throw new Error('Follow-up must preserve the original window length');
  if (!['clicks', 'impressions'].includes(parent.min_sample?.metric) || !Number.isSafeInteger(parent.min_sample.threshold) || parent.min_sample.threshold <= 0) throw new Error('A valid registered GSC sample floor is required');
  let priorEvidence=parent.evidence;
  if (priorEvidence?.kind === 'private_reference') {
    if (!/^[a-f0-9]{64}$/.test(priorEvidence.sha256 ?? '') || priorEvidence.artifact !== 'experiment-evidence-' + priorEvidence.sha256 + '.json') throw new Error('Invalid parent evidence reference');
    const bytes=fs.readFileSync(path.join(privateState(path.join(stateRoot, 'experiment-evidence')), priorEvidence.artifact));
    const bundle=JSON.parse(bytes);
    if (fingerprint(bytes) !== priorEvidence.sha256 || bundle.experiment_id !== parent.id || bundle.decision !== parent.decision) throw new Error('Parent evidence integrity failed');
    priorEvidence=bundle.evidence;
  }
  if (priorEvidence?.kind !== 'gsc_comparison' || priorEvidence.source !== 'gsc' || priorEvidence.target_metric !== parent.target_metric
    || !isDeepStrictEqual(priorEvidence.scope, gscScope(parent)) || priorEvidence.baseline?.registered_baseline_sha256 !== baseline.registered_baseline_sha256) throw new Error('Measured GSC parent evidence must match its current baseline and scope');
  const release = acquireLock(stateRoot, 'growth-followup.lock');
  if (!release) throw new Error('Growth follow-up is busy');
  try {
    const doc = growthFollowups({ stateRoot, now });
    const id = experimentId + '--review-' + evaluationDate;
    const existing = doc.reviews.find(r => r.id === id);
    if (existing) {
      if (existing.post_start !== postStart || existing.post_end !== postEnd || existing.parent_sha256 !== parentHash(parent)) throw new Error('Existing registration differs; do not overwrite its history');
      return existing;
    }
    if (doc.reviews.some(r => r.parent.id === experimentId && r.status === 'RUNNING')) throw new Error('An active review already owns this experiment');
    const record = { id, kind: 'gsc_followup', status: 'RUNNING', registered_at: now.toISOString(),
      owner: 'existing obsidian daily owner', parent: structuredClone(parent), parent_sha256: parentHash(parent),
      evaluation_date: evaluationDate, post_start: postStart, post_end: postEnd, rationale,
      decision: null, evidence: null, interpretation: 'Later monitoring against the unchanged original baseline; no new treatment, formal score credit or isolated causal claim.' };
    doc.reviews.push(record); atomicJson(path.join(stateRoot, fileName), doc); return record;
  } finally { release(); }
}

export function evaluateGrowthFollowup({ stateRoot, id, snapshotDirectory, decision, rationale, now = new Date() }) {
  if (!['keep', 'iterate', 'inconclusive', 'revert'].includes(decision) || !rationale?.trim()) throw new Error('An explicit measured decision and rationale are required');
  const release = acquireLock(stateRoot, 'growth-followup.lock');
  if (!release) throw new Error('Growth follow-up is busy');
  try {
    const doc = growthFollowups({ stateRoot, now }), r = doc.reviews.find(x => x.id === id);
    if (!r || !r.due) throw new Error('Only a due, unevaluated Growth follow-up can be evaluated');
    const directory = path.resolve(snapshotDirectory), files = [];
    const read = name => {
      const bytes = fs.readFileSync(path.join(directory, name + '.json'));
      files.push({ name: name + '.json', sha256: fingerprint(bytes) }); return JSON.parse(bytes);
    };
    const snapshot = { label: path.basename(directory), meta: read('meta'), dates: read('dates') };
    const queryPage = r.parent.measurement_scope?.kind === 'query_page';
    snapshot[queryPage ? 'queryPages' : 'pages'] = read(queryPage ? 'query-pages' : 'pages');
    if (snapshot.meta.period_start !== r.post_start || snapshot.meta.period_end !== r.post_end) throw new Error('Snapshot does not match the registered follow-up window');
    const evidence = gscEvidence(r.parent, snapshot, { asOf: today(now), decision, files });
    const sample = r.parent.min_sample;
    if (decision !== 'inconclusive' && sample && !(Number.isFinite(evidence.post[sample.metric]) && evidence.post[sample.metric] >= sample.threshold)) throw new Error('Insufficient or unobserved registered sample; retain inconclusive');
    Object.assign(r, { status: 'EVALUATED', due: false, evaluated_at: now.toISOString(), decision,
      evidence: { ...evidence, rationale }, learning: 'Keep decisions preserve the current implementation; no automatic WIN or causal inference. Revert requires a separately verified code action.' });
    atomicJson(path.join(stateRoot, fileName), doc); return r;
  } finally { release(); }
}
