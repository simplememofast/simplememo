// Business percentages are reports, never task-selection rewards or new authority.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {summarize} from '../../scripts/automation-rate.mjs';
import {readPrivateInput} from '../../scripts/autonomy-outcome-score.mjs';
import {privateState,acquireLock} from './company-loop.mjs';

export const BUSINESS_POLICY_PATH = 'data/business-automation-policy.json';
// Measurement quality is separate from the target's administrative policy label.
export const BUSINESS_MEASUREMENT_CONTRACT = 'business-runtime-six-stage-source-v2';
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
const stamp = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)
  && date(s.slice(0,10)) && Number.isFinite(Date.parse(s));
const FIXED_INCLUDED = '484912ecbe75013c7aa221c8f2a82682e013c1114c7e1f490c645351777196ac';
const FIXED_EXCLUDED = '5f472cbed0e70603664fd0368068fcf8f80e7854950d027598936fdce68a559a';
const scopeKey = tasks => createHash('sha256').update(JSON.stringify(tasks.map(businessTaskId).sort())).digest('hex');

export function businessScope(coverage) {
  const included=coverage.tasks.filter(t=>t.executor!=='intentional_no'),excluded=coverage.tasks.filter(t=>t.executor==='intentional_no');
  return {registered_tasks:coverage.tasks.length,defined_tasks:included.length,excluded_tasks:excluded.length,
    included_scope_key:scopeKey(included),excluded_scope_key:scopeKey(excluded)};
}

export function fixedScopeAssessment(coverage,policy=businessPolicy()) {
  const current=businessScope(coverage),fixed=policy.fixed_scope;
  const valid=validateBusinessPolicy(policy).length===0;
  const matches=valid&&Object.keys(current).every(k=>current[k]===fixed?.[k]);
  return {state:matches?'fixed_scope_matches':'fixed_scope_mismatch',matches_target_scope:matches,
    current,required:valid?Object.fromEntries(Object.keys(current).map(k=>[k,fixed[k]])):null,
    denominator_reduction_allowed:false};
}

export function currentGoalAssessment(actual,coverage,{policy=businessPolicy(),now=new Date()}={}) {
  const scope=fixedScopeAssessment(coverage,policy),n=policy.fixed_scope?.defined_tasks??192,nowTime=new Date(now).getTime();
  const base={policy_id:policy.policy_id,policy_revision:policy.revision,effective_at:policy.effective_at,
    threshold:policy.target?.at_least,inclusive:true,defined_tasks:n,minimum_automated_tasks:Math.ceil(n*.93),
    sustained_weeks:4,scope,one_window_qualified:false,sustained_qualified:false,runtime_execution_credit:0,
    evidence_basis:null,confirmed_full_tasks:actual?.verified_full_tasks??0,unknown_tasks:actual?.unknown_tasks??n,
    confirmed_rate_lower_bound:null,exact_rate_confirmed:false};
  let state;
  if(validateBusinessPolicy(policy).length)state='invalid_policy';
  else if(!scope.matches_target_scope)state='fixed_scope_mismatch';
  else if(!['MEASURED','PARTIAL_EVIDENCE'].includes(actual?.state)||actual.defined_tasks!==n
    ||actual.measurement_contract!==BUSINESS_MEASUREMENT_CONTRACT
    ||!Object.keys(scope.current).every(k=>actual.measurement_scope?.[k]===scope.current[k])
    ||!Number.isSafeInteger(actual.unknown_tasks)||actual.unknown_tasks<0||actual.unknown_tasks>n
    ||(actual.state==='MEASURED')!==(actual.unknown_tasks===0))state='runtime_unverified';
  else if(!Number.isFinite(nowTime)||!stamp(actual.source_observed_at)
    ||Date.parse(actual.source_observed_at)>nowTime
    ||actual.window?.through!==jstDay(actual.source_observed_at)
    ||actual.window?.from!==new Date(Date.parse(actual.window.through)-27*86400000).toISOString().slice(0,10))state='source_observation_unverified';
  else if(actual.scope_completeness!=='attested')state='corporate_scope_unverified';
  else if(!Number.isSafeInteger(actual.verified_full_tasks)||actual.verified_full_tasks<0||actual.verified_full_tasks>n-actual.unknown_tasks
    ||actual.verified_full_automation_rate!==(actual.state==='MEASURED'?actual.verified_full_tasks/n:null)
    ||actual.confirmed_full_automation_lower_bound!==actual.verified_full_tasks/n)state='runtime_arithmetic_unverified';
  else if(actual.verified_full_tasks<n*.93)state='below_target';
  else state='one_window_at_target';
  const valid=['below_target','one_window_at_target'].includes(state);
  return {...base,state,one_window_qualified:state==='one_window_at_target',
    evidence_basis:valid?(actual.state==='MEASURED'?'exact_runtime_rate':'confirmed_runtime_lower_bound'):null,
    confirmed_rate_lower_bound:valid?actual.verified_full_tasks/n:null,exact_rate_confirmed:valid&&actual.state==='MEASURED'};
}

export function validateBusinessPolicy(p) {
  return p?.schema_version === 1 && p.policy_owner === 'human' && p.preserve_legacy_items === true
    && p.revision===2 && p.policy_id==='business-automation-fixed192-gte93-v2' && p.effective_at==='2026-10-01T00:56:08Z'
    && p.previous_policy?.policy_id==='business-automation-v1' && p.previous_policy.revision===1
    && p.previous_policy.target?.metric==='verified_full_automation_rate'
    && p.previous_policy.target.strictly_greater_than===0.9 && p.previous_policy.target.sustained_weeks===4
    && p.previous_policy.superseded_at===p.effective_at && p.previous_policy.retroactive_credit===false
    && p.denominator === 'all registered tasks except explicitly intentional_no' && p.missing_evidence === 'unknown'
    && p.window_days === 28 && p.target?.metric === 'verified_full_automation_rate'
    && p.target.at_least === 0.93 && !Object.hasOwn(p.target,'strictly_greater_than') && p.target.sustained_weeks === 4 && p.ranker_reward === false
    && p.fixed_scope?.registered_tasks===203 && p.fixed_scope.defined_tasks===192 && p.fixed_scope.excluded_tasks===11
    && p.fixed_scope.included_scope_key===FIXED_INCLUDED && p.fixed_scope.excluded_scope_key===FIXED_EXCLUDED
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
  const needed = 179;
  return {basis:'inventory_classification_not_runtime_proof', inventory_measured_at:coverage.measured_at,
    scope_completeness:'not_attested', overall:c,
    by_area:Object.fromEntries(Object.entries(s.by_area).map(([k,v])=>[k,add(v)])),
    target:{threshold:0.93, strict:false, inclusive:true, defined_tasks:192, minimum_automated_tasks:needed,
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
    scope_completeness:'not_attested', target_state:'unverified', source_observed_at:null,policy_id:null,
    measurement_contract:null,measurement_scope:null,
    diagnostics:{observed_tasks:0,not_due_tasks:0,unimplemented_tasks:0,human_only_tasks:0,
      failed_tasks:0,safety_failed_tasks:0,human_intervened_tasks:0,reported_human_touches:0,
      unknown_stage_tasks:Object.fromEntries(STAGES.map(k=>[k,n])),
      basis:'Counts describe admitted rows only; missing rows and unobserved failures or interventions remain unknown.'},
    burden:{measured_tasks:0,baseline_minutes_subtotal:null,actual_minutes_subtotal:null,actual_minutes_total:null,
      observed_minutes_delta:null,observed_work_increased:null},
    cost:{measured_tasks:0,usd_subtotal:null,jpy_subtotal:null,usd_total:null,jpy_total:null,
      basis:'Observed currency amounts only; no estimates, currency conversion or zero-cost inference.'},
    assurance:'Reviewer declarations require original receipts and complete human-activity coverage. The calculator does not independently authenticate them. Registered scope is not an exhaustive corporate census.'};
  if (validateBusinessPolicy(policy).length) return {...empty,state:'INVALID_POLICY'};
  if (doc === null) return {...empty,state:'NO_EVIDENCE'};
  const through = jstDay(now), from = new Date(Date.parse(through) - (policy.window_days-1)*86400000).toISOString().slice(0,10);
  if (doc?.schema_version !== 1 || doc.window?.from !== from || doc.window?.through !== through
    || doc.review?.kind !== 'human' || !ref(doc.review?.evidence_ref) || !stamp(doc.review?.at)
    || Date.parse(doc.review.at) > new Date(now).getTime() || jstDay(doc.review.at) !== through
    || doc.observation?.kind!=='runtime_source_snapshot' || !ref(doc.observation?.evidence_ref)
    || !stamp(doc.observation?.at) || jstDay(doc.observation.at)!==through
    || Date.parse(doc.observation.at)>Date.parse(doc.review.at)
    || !Array.isArray(doc.tasks)) return {...empty,state:'INVALID_EVIDENCE'};
  const seen = new Set();
  let full = 0, utilization = 0, known = 0, burdenKnown = 0, baseline = 0, actual = 0;
  const diagnostics=structuredClone(empty.diagnostics);
  const costRefs=new Set();
  let costKnown=0,usd=0,jpy=0,usdKnown=0,jpyKnown=0;
  for (const t of doc.tasks) {
    if (!ids.has(t?.task_id) || seen.has(t.task_id)) return {...empty,state:'INVALID_EVIDENCE'};
    seen.add(t.task_id);
    if (t.state === 'unknown' || t.state === 'not_due') {
      diagnostics.not_due_tasks+=Number(t.state==='not_due');
      continue; // Still in the full denominator.
    }
    if (!['observed','unimplemented','human_only'].includes(t.state) || !ref(t.evidence_ref)) return {...empty,state:'INVALID_EVIDENCE'};
    if (t.state !== 'observed') {
      known++; diagnostics[t.state+'_tasks']++; continue;
    }
    if (t.source_window?.from !== from || t.source_window?.through !== through
      || !ref(t.trigger_evidence_ref) || !ref(t.human_activity_evidence_ref)
      || !stamp(t.last_occurrence_at) || jstDay(t.last_occurrence_at) < from
      || jstDay(t.last_occurrence_at) > through || Date.parse(t.last_occurrence_at) > Date.parse(doc.observation.at)
      || !Number.isSafeInteger(t.occurrences) || t.occurrences < 1 || t.trigger_coverage_complete !== true
      || t.human_activity_coverage_complete !== true || !Number.isSafeInteger(t.human_touches) || t.human_touches < 0
      || typeof t.ai_used !== 'boolean' || !['scheduled','event','manual','mixed'].includes(t.origin)
      || typeof t.all_occurrences_succeeded !== 'boolean' || typeof t.safety_passed !== 'boolean'
      || !STAGES.every(k=>['agent','human','unknown'].includes(t.stages?.[k]))) return {...empty,state:'INVALID_EVIDENCE'};
    diagnostics.observed_tasks++;
    diagnostics.failed_tasks+=Number(!t.all_occurrences_succeeded);
    diagnostics.safety_failed_tasks+=Number(!t.safety_passed);
    diagnostics.human_intervened_tasks+=Number(t.human_touches>0 || ['manual','mixed'].includes(t.origin) || STAGES.some(k=>t.stages[k]==='human'));
    diagnostics.reported_human_touches+=t.human_touches;
    for(const k of STAGES) diagnostics.unknown_stage_tasks[k]-=Number(t.stages[k]!=='unknown');
    if (t.burden != null) {
      const b=t.burden;
      if (b.measurement !== 'observed' || !Number.isFinite(b.baseline_minutes) || b.baseline_minutes <= 0
        || !Number.isFinite(b.actual_minutes) || b.actual_minutes < 0
        || !ref(b.baseline_evidence_ref) || !ref(b.actual_evidence_ref) || !stamp(b.baseline_recorded_at)
        || !stamp(b.first_occurrence_at) || Date.parse(b.baseline_recorded_at) > Date.parse(b.first_occurrence_at)
        || jstDay(b.first_occurrence_at) < from || jstDay(b.first_occurrence_at) > through
        || Date.parse(b.first_occurrence_at) > Date.parse(t.last_occurrence_at)) return {...empty,state:'INVALID_EVIDENCE'};
      burdenKnown++; baseline+=b.baseline_minutes; actual+=b.actual_minutes;
    }
    if(t.cost!=null) {
      const c=t.cost;
      if(c.measurement!=='observed' || !ref(c.evidence_ref)
        || c.allocation!=='task_window_exclusive' || c.source_window?.from!==from || c.source_window?.through!==through
        || costRefs.has(c.evidence_ref)
        || !['usd','jpy'].some(k=>c[k]!=null)
        || ['usd','jpy'].some(k=>c[k]!=null && (!Number.isFinite(c[k]) || c[k]<0))) return {...empty,state:'INVALID_EVIDENCE'};
      costRefs.add(c.evidence_ref);
      costKnown++;
      if(c.usd!=null){usdKnown++;usd+=c.usd;}
      if(c.jpy!=null){jpyKnown++;jpy+=c.jpy;}
    }
    if (STAGES.some(k=>t.stages[k] === 'unknown')) continue;
    known++; utilization += Number(t.ai_used);
    full += Number(t.ai_used && t.human_touches === 0 && ['scheduled','event'].includes(t.origin)
      && t.all_occurrences_succeeded && t.safety_passed && STAGES.every(k=>t.stages[k] === 'agent'));
  }
  if(![baseline,actual,usd,jpy].every(Number.isFinite) || !Number.isSafeInteger(diagnostics.reported_human_touches))return {...empty,state:'INVALID_EVIDENCE'};
  const complete = known === n && n > 0;
  const scopeAttested=doc.scope?.company_wide_complete === true && ref(doc.scope.evidence_ref);
  const result={...empty, state:complete ? 'MEASURED' : 'PARTIAL_EVIDENCE', window:{from,through},
    measurement_contract:BUSINESS_MEASUREMENT_CONTRACT,measurement_scope:businessScope(coverage),
    scope_completeness:scopeAttested ? 'attested' : 'not_attested', source_observed_at:new Date(doc.observation.at).toISOString(),
    policy_id:doc.policy_id===policy.policy_id?policy.policy_id
      :doc.policy_id===policy.previous_policy.policy_id?policy.previous_policy.policy_id:null,
    diagnostics,
    verified_full_tasks:full, verified_ai_utilization_tasks:utilization, unknown_tasks:n-known,
    verified_full_automation_rate:complete ? full/n : null,
    verified_ai_utilization_rate:complete ? utilization/n : null,
    confirmed_full_automation_lower_bound:n ? full/n : null,
    possible_full_automation_upper_bound:n ? (full+n-known)/n : null,
    observed_work_saved_rate:burdenKnown === n && n > 0 ? Math.max(0,Math.min(1,1-actual/baseline)) : null,
    burden_measured_tasks:burdenKnown,
    burden:{measured_tasks:burdenKnown,baseline_minutes_subtotal:burdenKnown?baseline:null,
      actual_minutes_subtotal:burdenKnown?actual:null,actual_minutes_total:burdenKnown===n&&n>0?actual:null,
      observed_minutes_delta:burdenKnown?actual-baseline:null,observed_work_increased:burdenKnown?actual>baseline:null},
    cost:{...empty.cost,measured_tasks:costKnown,usd_subtotal:usdKnown?usd:null,jpy_subtotal:jpyKnown?jpy:null,
      usd_total:usdKnown===n&&n>0?usd:null,jpy_total:jpyKnown===n&&n>0?jpy:null},
    target_state:'unverified'};
  result.target_state=currentGoalAssessment(result,coverage,{policy,now}).state;
  return result;
}

export function businessStatus({stateRoot, now = new Date(), coverage = businessCoverage(),observations} = {}) {
  let actual;
  try { actual = measuredBusinessRates(observations===undefined?readPrivateInput(path.join(stateRoot,'data/business-automation-observations.json')):observations, coverage, {now}); }
  catch { actual = {...measuredBusinessRates(null,coverage,{now}),state:'UNAVAILABLE'}; }
  return {instrument:'business-automation-v1', as_of:jstDay(now), inventory:inventoryBusinessRates(coverage), actual,
    current_goal:currentGoalAssessment(actual,coverage,{now})};
}

export function sustainedTarget(points, policy = businessPolicy(), {now=new Date(),coverage=businessCoverage()} = {}) {
  if(validateBusinessPolicy(policy).length||!fixedScopeAssessment(coverage,policy).matches_target_scope)return false;
  const p=points.slice(-policy.target.sustained_weeks);
  // Historical four-week evidence stays in the ledger; current maintenance requires this JST week.
  const nowTime=new Date(now).getTime();
  return Number.isFinite(nowTime) && p.length === policy.target.sustained_weeks
    && p.at(-1)?.week===weekKey(now) && p.every((v,i)=>currentGoalAssessment(v.actual,coverage,{policy,now}).one_window_qualified
    && v.scope_key===policy.fixed_scope.included_scope_key && v.excluded_scope_key===policy.fixed_scope.excluded_scope_key
    && stamp(v.actual.source_observed_at)
    && Date.parse(v.actual.source_observed_at)<=nowTime
    && weekKey(v.actual.source_observed_at)===v.week
    && v.actual.window?.through===jstDay(v.actual.source_observed_at)
    && v.actual.window?.from===new Date(Date.parse(v.actual.window.through)-27*86400000).toISOString().slice(0,10)
    && v.actual.defined_tasks===policy.fixed_scope.defined_tasks
    && v.actual.defined_tasks===p[0].actual.defined_tasks
    && Number.isSafeInteger(v.actual.verified_full_tasks) && v.actual.verified_full_tasks<=v.actual.defined_tasks
    && v.actual.confirmed_full_automation_lower_bound >= policy.target.at_least
    && v.actual.scope_completeness === 'attested' && v.scope_key === p[0].scope_key
    && (!i || Date.parse(v.week) - Date.parse(p[i-1].week) === 7*86400000));
}

// Runs inside the existing weekly review, no additional scheduler or remote calls.
export function recordBusinessWeek({stateRoot,now = new Date(),coverage = businessCoverage()} = {}) {
  let observations;
  try {observations=readPrivateInput(path.join(stateRoot,'data/business-automation-observations.json'));}
  catch {observations=undefined;}
  const status = businessStatus({stateRoot,now,coverage,observations}), week = weekKey(now);
  const dir=privateState(path.join(privateState(stateRoot),'business-automation'));
  const file=path.join(dir,'weekly.json');
  const release=acquireLock(dir,'weekly.lock');
  if(!release)throw new Error('business_weekly_busy');
  try {
  const history=readPrivateInput(file) ?? {schema_version:1,points:[],observations:[]};
  if(history.schema_version !== 1 || !Array.isArray(history.points)) throw new Error('business_weekly_history');
  if(history.observations===undefined)history.observations=[];
  if(!Array.isArray(history.observations))throw new Error('business_weekly_observations');
  // Scope changes are incomparable; changing an executor does not change the scope identity.
  const scope=businessScope(coverage),scope_key=scope.included_scope_key,excluded_scope_key=scope.excluded_scope_key;
  const point={week,observed_at:status.actual.source_observed_at??new Date(now).toISOString(),scope_key,excluded_scope_key,
    policy_id:status.actual.policy_id,...status};
  // Store aggregate changes, not private originals. A re-read is never a new runtime measurement.
  const admitted=['MEASURED','PARTIAL_EVIDENCE'].includes(status.actual.state);
  const snapshot={basis:admitted?'runtime_review':'unverified_read',week,scope_key,excluded_scope_key,policy_id:status.actual.policy_id,
    source_observed_at:status.actual.source_observed_at,actual:status.actual};
  // This stable, non-secret source receipt ID stays private and is never returned or exported.
  if(admitted)snapshot.measurement_ref=observations.observation.evidence_ref;
  const same=history.observations.find(p=>p.basis==='runtime_review'&&admitted
    && p.measurement_ref===snapshot.measurement_ref);
  // Earlier receipts lack policy/exclusion metadata. Compare their original measurement facts,
  // preserve that absence and the old policy verdict, and never promote a re-read to new credit.
  const legacy=same&&!Object.hasOwn(same,'policy_id')&&!Object.hasOwn(same,'excluded_scope_key')
    &&!Object.hasOwn(same.actual,'policy_id');
  const comparable=structuredClone(snapshot);
  if(legacy){delete comparable.policy_id;delete comparable.excluded_scope_key;delete comparable.actual.policy_id;
    comparable.actual.target_state=same.actual.target_state;}
  const previousMethod=same&&!Object.hasOwn(same.actual,'measurement_contract');
  if(previousMethod){delete comparable.actual.measurement_contract;delete comparable.actual.measurement_scope;
    comparable.actual.target_state=same.actual.target_state;}
  if(same&&!isDeepStrictEqual(same,comparable))throw new Error('conflicting_runtime_review');
  const repeated=JSON.stringify(history.observations.at(-1))===JSON.stringify(snapshot);
  if(!same&&!repeated)history.observations.push(snapshot);
  const previous=history.points.find(p=>p.week===week);
  // A later stale/missing read must not erase an already admitted observation.
  const retain=previous && (['MEASURED','PARTIAL_EVIDENCE'].includes(previous.actual?.state)&&!admitted
    || previous.actual?.state==='MEASURED'&&status.actual.state!=='MEASURED'&&!status.current_goal.one_window_qualified
    || (legacy||previousMethod)&&previous.actual?.source_observed_at===same.source_observed_at
    || admitted&&previous.actual?.source_observed_at&&Date.parse(previous.actual.source_observed_at)>Date.parse(status.actual.source_observed_at));
  if(!retain)history.points=history.points.filter(p=>p.week!==week).concat(point).sort((a,b)=>a.week.localeCompare(b.week));
  const tmp=file+'.'+randomUUID()+'.tmp';
  try {fs.writeFileSync(tmp,JSON.stringify(history,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
  finally {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  return {point:retain?previous:point,current_read:status.actual,
    sustained_above_target:!retain&&sustainedTarget(history.points, businessPolicy(), {now,coverage}),
    retained_prior_measurement:!!retain,current_read_unverified:!!retain,
    new_runtime_measurement:admitted&&!same&&!repeated};
  } finally {release();}
}
