// Business percentages are reports, never task-selection rewards or new authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {summarize} from '../../scripts/automation-rate.mjs';
import {readPrivateInput} from '../../scripts/autonomy-outcome-score.mjs';

export const BUSINESS_POLICY_PATH = 'data/business-automation-policy.json';
export const ROOT = path.resolve(import.meta.dirname, '../..');
export const businessPolicy = () => JSON.parse(fs.readFileSync(path.join(ROOT, BUSINESS_POLICY_PATH)));
export const businessCoverage = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/automation-coverage.json')));
// Same non-secret task identity as the existing Company ledger; executor changes do not change ID.
export const businessTaskId = t => createHash('sha256').update(JSON.stringify([t.area, t.task])).digest('hex');
export const jstDay = now => new Date(new Date(now).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const weekKey = now => {
  const d = new Date(jstDay(now));
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
};
const date = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const ref = s => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(s);
const STAGES = ['detect','decide','execute','verify','report','learn'];
const stamp = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s));

export function validateBusinessPolicy(p) {
  return p?.schema_version === 1 && p.policy_owner === 'human' && p.preserve_legacy_items === true
    && p.denominator === 'all registered tasks except explicitly intentional_no' && p.missing_evidence === 'unknown'
    && p.window_days === 28 && p.target?.metric === 'verified_full_automation_rate'
    && p.target.strictly_greater_than === 0.9 && p.target.sustained_weeks === 4 && p.ranker_reward === false
    && p.timezone === 'Asia/Tokyo' && date(p.history_from) && p.existing_owner === 'obsidian'
    && p.scope_completeness === 'not_attested' && Array.isArray(p.new_business_candidates)
    && p.new_business_candidates.every(x=>ref(x.id) && x.state === 'scope_review_required' && Array.isArray(x.overlap_review))
    ? [] : ['business_policy'];
}

export function inventoryBusinessRates(coverage) {
  const s = summarize(coverage);
  const add = t => ({...t, declared_execution_rate: t.overall_automation_rate,
    declared_ai_utilization_rate: t.defined ? (t.ai_executes + t.counts.ai_proposes) / t.defined : null});
  const c = add(s.overall);
  const needed = Math.floor(c.defined * 0.9) + 1;
  return {basis:'inventory_classification_not_runtime_proof', inventory_measured_at:coverage.measured_at,
    scope_completeness:'not_attested', overall:c,
    by_area:Object.fromEntries(Object.entries(s.by_area).map(([k,v])=>[k,add(v)])),
    target:{threshold:0.9, strict:true, minimum_automated_tasks:needed,
      additional_declared_tasks_needed:Math.max(0,needed-c.ai_executes), achieved_in_actual_operation:false}};
}

/** Admission of explicitly reviewed, value-free observations. It cannot authenticate the reviewer
 * or independently audit all human activity. The original receipts must be checked by that reviewer.
 * An empty intervention list, script existence or a healthy job alone is insufficient. */
export function measuredBusinessRates(doc, coverage, {now = new Date(), policy = businessPolicy()} = {}) {
  const tasks = coverage.tasks.filter(t=>t.executor !== 'intentional_no');
  const ids = new Set(tasks.map(businessTaskId)), n = tasks.length;
  const empty = {basis:'reviewed_runtime_observations', defined_tasks:n,
    verified_full_automation_rate:null, verified_ai_utilization_rate:null, observed_work_saved_rate:null,
    verified_full_tasks:0, verified_ai_utilization_tasks:0, unknown_tasks:n,
    scope_completeness:'not_attested', target_state:'unverified',
    assurance:'Reviewer declarations require original receipts and complete human-activity coverage. The calculator does not independently authenticate them. Registered scope is not an exhaustive corporate census.'};
  if (validateBusinessPolicy(policy).length) return {...empty,state:'INVALID_POLICY'};
  if (doc === null) return {...empty,state:'NO_EVIDENCE'};
  const through = jstDay(now), from = new Date(Date.parse(through) - (policy.window_days-1)*86400000).toISOString().slice(0,10);
  if (doc?.schema_version !== 1 || doc.window?.from !== from || doc.window?.through !== through
    || doc.review?.kind !== 'human' || !ref(doc.review?.evidence_ref) || !stamp(doc.review?.at)
    || Date.parse(doc.review.at) > new Date(now).getTime() || jstDay(doc.review.at) !== through
    || !Array.isArray(doc.tasks)) return {...empty,state:'INVALID_EVIDENCE'};
  const seen = new Set();
  let full = 0, utilization = 0, known = 0, burdenKnown = 0, baseline = 0, actual = 0;
  for (const t of doc.tasks) {
    if (!ids.has(t?.task_id) || seen.has(t.task_id)) return {...empty,state:'INVALID_EVIDENCE'};
    seen.add(t.task_id);
    if (t.state === 'unknown' || t.state === 'not_due') continue; // Still in the full denominator.
    if (!['observed','unimplemented','human_only'].includes(t.state) || !ref(t.evidence_ref)) return {...empty,state:'INVALID_EVIDENCE'};
    if (t.state !== 'observed') { known++; continue; }
    if (t.source_window?.from !== from || t.source_window?.through !== through
      || !ref(t.trigger_evidence_ref) || !ref(t.human_activity_evidence_ref)
      || !stamp(t.last_occurrence_at) || jstDay(t.last_occurrence_at) < from
      || jstDay(t.last_occurrence_at) > through || Date.parse(t.last_occurrence_at) > Date.parse(doc.review.at)
      || !Number.isSafeInteger(t.occurrences) || t.occurrences < 1 || t.trigger_coverage_complete !== true
      || t.human_activity_coverage_complete !== true || !Number.isSafeInteger(t.human_touches) || t.human_touches < 0
      || typeof t.ai_used !== 'boolean' || !['scheduled','event','manual','mixed'].includes(t.origin)
      || typeof t.all_occurrences_succeeded !== 'boolean' || typeof t.safety_passed !== 'boolean'
      || !STAGES.every(k=>['agent','human','unknown'].includes(t.stages?.[k]))) return {...empty,state:'INVALID_EVIDENCE'};
    if (STAGES.some(k=>t.stages[k] === 'unknown')) continue;
    known++; utilization += Number(t.ai_used);
    full += Number(t.ai_used && t.human_touches === 0 && ['scheduled','event'].includes(t.origin)
      && t.all_occurrences_succeeded && t.safety_passed && STAGES.every(k=>t.stages[k] === 'agent'));
    if (t.burden != null) {
      const b=t.burden;
      if (b.measurement !== 'observed' || !Number.isFinite(b.baseline_minutes) || b.baseline_minutes <= 0
        || !Number.isFinite(b.actual_minutes) || b.actual_minutes < 0
        || !ref(b.baseline_evidence_ref) || !ref(b.actual_evidence_ref) || !stamp(b.baseline_recorded_at)
        || !stamp(b.first_occurrence_at) || Date.parse(b.baseline_recorded_at) > Date.parse(b.first_occurrence_at)
        || jstDay(b.first_occurrence_at) < from || jstDay(b.first_occurrence_at) > through
        || Date.parse(b.first_occurrence_at) > Date.parse(doc.review.at)) return {...empty,state:'INVALID_EVIDENCE'};
      burdenKnown++; baseline+=b.baseline_minutes; actual+=b.actual_minutes;
    }
  }
  const complete = known === n && n > 0;
  const scopeAttested=doc.scope?.company_wide_complete === true && ref(doc.scope.evidence_ref);
  return {...empty, state:complete ? 'MEASURED' : 'PARTIAL_EVIDENCE', window:{from,through},
    scope_completeness:scopeAttested ? 'attested' : 'not_attested',
    verified_full_tasks:full, verified_ai_utilization_tasks:utilization, unknown_tasks:n-known,
    verified_full_automation_rate:complete ? full/n : null,
    verified_ai_utilization_rate:complete ? utilization/n : null,
    confirmed_full_automation_lower_bound:n ? full/n : null,
    possible_full_automation_upper_bound:n ? (full+n-known)/n : null,
    observed_work_saved_rate:burdenKnown === n && n > 0 ? Math.max(0,Math.min(1,1-actual/baseline)) : null,
    burden_measured_tasks:burdenKnown,
    target_state:complete && full/n > policy.target.strictly_greater_than ? 'one_window_above_target' : complete ? 'below_target' : 'unverified'};
}

export function businessStatus({stateRoot, now = new Date(), coverage = businessCoverage()} = {}) {
  let actual;
  try { actual = measuredBusinessRates(readPrivateInput(path.join(stateRoot,'data/business-automation-observations.json')), coverage, {now}); }
  catch { actual = {...measuredBusinessRates(null,coverage,{now}),state:'UNAVAILABLE'}; }
  return {instrument:'business-automation-v1', as_of:jstDay(now), inventory:inventoryBusinessRates(coverage), actual};
}

export function sustainedTarget(points, policy = businessPolicy()) {
  const p=points.slice(-policy.target.sustained_weeks);
  return p.length === policy.target.sustained_weeks && p.every((v,i)=>v.actual?.state === 'MEASURED'
    && v.actual.verified_full_automation_rate > policy.target.strictly_greater_than
    && v.actual.scope_completeness === 'attested' && v.scope_key === p[0].scope_key
    && (!i || Date.parse(v.week) - Date.parse(p[i-1].week) === 7*86400000));
}

// Runs inside the existing weekly review, no additional scheduler or remote calls.
export function recordBusinessWeek({stateRoot,now = new Date(),coverage = businessCoverage()} = {}) {
  const status = businessStatus({stateRoot,now,coverage}), week = weekKey(now);
  const dir=path.join(stateRoot,'business-automation');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,'weekly.json');
  const history=readPrivateInput(file) ?? {schema_version:1,points:[]};
  if(history.schema_version !== 1 || !Array.isArray(history.points)) throw new Error('business_weekly_history');
  // Scope changes are incomparable; changing an executor does not change the scope identity.
  const scope_key = createHash('sha256').update(JSON.stringify(coverage.tasks.filter(t=>t.executor!=='intentional_no').map(businessTaskId).sort())).digest('hex');
  const point={week,observed_at:new Date(now).toISOString(),scope_key,...status};
  const previous=history.points.find(p=>p.week===week);
  // A later stale/missing read must not erase an already admitted observation.
  if (previous?.actual?.state === 'MEASURED' && status.actual.state !== 'MEASURED') return {point:previous,sustained_above_target:false,retained_prior_measurement:true,current_read_unverified:true};
  history.points=history.points.filter(p=>p.week!==week).concat(point).sort((a,b)=>a.week.localeCompare(b.week));
  const tmp=file+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(history,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);
  return {point,sustained_above_target:sustainedTarget(history.points)};
}
