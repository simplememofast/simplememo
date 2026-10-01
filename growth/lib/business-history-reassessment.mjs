// Reassesses owner-declared immutable historical sources, never as a new execution.
import {isDeepStrictEqual} from 'node:util';
import {
  BUSINESS_MEASUREMENT_CONTRACT, fixedScopeAssessment, measuredBusinessRates,
  currentGoalAssessment, sustainedTarget, validateBusinessPolicy, weekKey,
} from './business-automation.mjs';

const admitted = actual => ['MEASURED','PARTIAL_EVIDENCE'].includes(actual?.state);
const ref = value => typeof value==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value);
const iso = value => typeof value==='string' && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null;
const metadata = new Set(['target_state','policy_id','assurance','measurement_contract','measurement_scope']);
const facts = actual => Object.fromEntries(Object.entries(actual??{}).filter(([key])=>!metadata.has(key)));
const sourceAssuranceText = 'Owner verification of retained immutable originals and task bindings is required. '
  +'This calculator does not independently authenticate the reviewer or original sources. '
  +'Matching aggregate facts alone cannot prove task-binding immutability.';
const hasSourceAssurance = (assurance,docs,at) => {
  if(assurance?.kind!=='owner_verified_immutable_originals' || assurance.task_bindings_verified!==true
    || !Array.isArray(assurance.observation_refs) || assurance.review?.kind!=='human'
    || !ref(assurance.review.evidence_ref))return false;
  const reviewedAt=iso(assurance.review.at),declaredRefs=assurance.observation_refs;
  const originalRefs=docs.map(doc=>doc?.observation?.evidence_ref);
  if(!reviewedAt || Date.parse(reviewedAt)>at.getTime()
    || declaredRefs.length!==originalRefs.length || declaredRefs.some(value=>!ref(value))
    || originalRefs.some(value=>!ref(value)) || new Set(declaredRefs).size!==declaredRefs.length
    || new Set(originalRefs).size!==originalRefs.length
    || originalRefs.some(value=>!declaredRefs.includes(value)))return false;
  return docs.every(doc=>{
    const originalReviewAt=iso(doc?.review?.at);
    return originalReviewAt!==null && Date.parse(originalReviewAt)<=Date.parse(reviewedAt);
  });
};
const reasons = () => ({invalid_parameters:0,invalid_history:0,unverified_weekly_point:0,
  source_assurance_required:0,
  runtime_snapshot_missing:0,ambiguous_runtime_snapshot:0,original_observation_missing:0,
  ambiguous_original_observation:0,original_source_metadata:0,fixed_scope_mismatch:0,
  source_validation_failed:0,measurement_facts_mismatch:0,unmatched_original_observation:0,
  unmatched_runtime_snapshot:0});

/** Pure, private-input assessment. The caller retains originals; this module has no I/O.
 * sourceAssurance is a mandatory caller declaration that the owner has checked provenance,
 * immutability and task bindings against retained approved originals. The declaration itself
 * is not independently authenticated here. confirmed_original_observations counts only declared
 * owner-verified sources whose recalculated aggregate facts match the immutable history.
 * Older policy labels and verdicts stay in the source history. Only an original source bound
 * to its immutable snapshot and original week can supply a temporary current-method point. */
export function reassessBusinessHistory(history, originalObservations, {coverage,policy,sourceAssurance,now=new Date()}={}) {
  const at=new Date(now),validTime=Number.isFinite(at.getTime()),reason_counts=reasons();
  const result={basis:'historical_original_observations_reassessment',evaluated_at:validTime?at.toISOString():null,
    assessment_policy_id:null,measurement_contract:BUSINESS_MEASUREMENT_CONTRACT,assurance:sourceAssuranceText,
    state:'NO_REASSESSABLE_EVIDENCE',weekly_points:0,confirmed_original_observations:0,
    missing_original_observations:0,rejected_original_observations:0,unverified_weekly_points:0,
    unmatched_original_observations:0,unmatched_runtime_snapshots:0,qualifying_weekly_observations:0,
    reason_counts,current_93_four_week_qualified:false,current_evidence_basis:null,current_window_summary:null,
    new_runtime_measurement:false,runtime_execution_credit:0};
  if(!validTime || !coverage || validateBusinessPolicy(policy).length || !Array.isArray(originalObservations)) {
    reason_counts.invalid_parameters++;return {...result,state:'INVALID_PARAMETERS'};
  }
  result.assessment_policy_id=policy.policy_id;
  if(history?.schema_version!==1 || !Array.isArray(history.points) || !Array.isArray(history.observations)) {
    reason_counts.invalid_history++;return {...result,state:'INVALID_HISTORY'};
  }
  let fixed;
  try {fixed=fixedScopeAssessment(coverage,policy).matches_target_scope;}
  catch {reason_counts.invalid_parameters++;return {...result,state:'INVALID_PARAMETERS'};}
  if(!fixed){reason_counts.fixed_scope_mismatch++;return {...result,state:'FIXED_SCOPE_MISMATCH'};}
  result.weekly_points=history.points.length;
  if(!hasSourceAssurance(sourceAssurance,originalObservations,at)) {
    reason_counts.source_assurance_required++;return {...result,state:'SOURCE_ASSURANCE_REQUIRED'};
  }

  const originals=new Map(),snapshots=history.observations.filter(snapshot=>snapshot?.basis==='runtime_review');
  const usedOriginals=new Set(),usedSnapshots=new Set(),snapshotRefs=new Map(),seenWeeks=new Set();
  for(const doc of originalObservations) {
    const key=doc?.observation?.evidence_ref;
    if(ref(key)){if(!originals.has(key))originals.set(key,[]);originals.get(key).push(doc);}
  }
  for(const snapshot of snapshots) {
    if(ref(snapshot.measurement_ref))snapshotRefs.set(snapshot.measurement_ref,(snapshotRefs.get(snapshot.measurement_ref)??0)+1);
  }
  const candidates=[];
  for(const point of history.points) {
    const candidate={week:point?.week,actual:{state:'REASSESSMENT_UNVERIFIED'}};
    candidates.push(candidate);
    if(typeof point?.week!=='string' || seenWeeks.has(point.week)) {
      reason_counts.invalid_history++;return {...result,state:'INVALID_HISTORY'};
    }
    seenWeeks.add(point.week);
    if(!admitted(point.actual)) {
      result.unverified_weekly_points++;reason_counts.unverified_weekly_point++;continue;
    }
    const matches=snapshots.filter(snapshot=>snapshot.week===point.week
      && snapshot.source_observed_at===point.actual.source_observed_at);
    if(!matches.length){result.rejected_original_observations++;reason_counts.runtime_snapshot_missing++;continue;}
    const snapshot=matches[0];
    for(const match of matches)usedSnapshots.add(match);
    if(matches.length!==1 || !ref(snapshot.measurement_ref) || snapshotRefs.get(snapshot.measurement_ref)!==1) {
      result.rejected_original_observations++;reason_counts.ambiguous_runtime_snapshot++;continue;
    }
    const docs=originals.get(snapshot.measurement_ref)??[];
    if(!docs.length){result.missing_original_observations++;reason_counts.original_observation_missing++;continue;}
    for(const doc of docs)usedOriginals.add(doc);
    if(docs.length!==1){result.rejected_original_observations++;reason_counts.ambiguous_original_observation++;continue;}
    const doc=docs[0],sourceAt=iso(doc?.observation?.at),reviewAt=iso(doc?.review?.at);
    if(!sourceAt || !reviewAt || Date.parse(reviewAt)>at.getTime()
      || snapshot.source_observed_at!==sourceAt || snapshot.actual?.source_observed_at!==sourceAt
      || point.actual.source_observed_at!==sourceAt || point.observed_at!==sourceAt
      || snapshot.week!==weekKey(sourceAt) || point.week!==snapshot.week) {
      result.rejected_original_observations++;reason_counts.original_source_metadata++;continue;
    }
    const scope=policy.fixed_scope;
    if(point.scope_key!==scope.included_scope_key || snapshot.scope_key!==scope.included_scope_key
      || point.excluded_scope_key!==scope.excluded_scope_key || snapshot.excluded_scope_key!==scope.excluded_scope_key
      || [point.actual,snapshot.actual].some(original=>original.measurement_scope!=null
        && !isDeepStrictEqual(original.measurement_scope,scope))) {
      result.rejected_original_observations++;reason_counts.fixed_scope_mismatch++;continue;
    }
    let actual;
    try {actual=measuredBusinessRates(doc,coverage,{policy,now:new Date(reviewAt)});}
    catch {actual=null;}
    if(!admitted(actual) || actual.measurement_contract!==BUSINESS_MEASUREMENT_CONTRACT
      || !isDeepStrictEqual(actual.measurement_scope,scope)) {
      result.rejected_original_observations++;reason_counts.source_validation_failed++;continue;
    }
    if(!isDeepStrictEqual(facts(snapshot.actual),facts(actual)) || !isDeepStrictEqual(facts(point.actual),facts(actual))) {
      result.rejected_original_observations++;reason_counts.measurement_facts_mismatch++;continue;
    }
    result.confirmed_original_observations++;
    result.qualifying_weekly_observations+=Number(currentGoalAssessment(actual,coverage,{policy,now:new Date(reviewAt)}).one_window_qualified);
    Object.assign(candidate,{scope_key:point.scope_key,excluded_scope_key:point.excluded_scope_key,
      policy_id:point.policy_id??null,actual});
  }
  result.unmatched_original_observations=originalObservations.filter(doc=>!usedOriginals.has(doc)).length;
  result.unmatched_runtime_snapshots=snapshots.filter(snapshot=>!usedSnapshots.has(snapshot)).length;
  reason_counts.unmatched_original_observation=result.unmatched_original_observations;
  reason_counts.unmatched_runtime_snapshot=result.unmatched_runtime_snapshots;
  result.current_93_four_week_qualified=sustainedTarget(candidates,policy,{coverage,now:at});
  if(result.current_93_four_week_qualified)result.current_evidence_basis=candidates.slice(-policy.target.sustained_weeks)
    .some(point=>point.actual.state==='PARTIAL_EVIDENCE')?'confirmed_runtime_lower_bound':'exact_runtime_rate';
  const latest=candidates.at(-1);
  if(latest?.week===weekKey(at) && currentGoalAssessment(latest.actual,coverage,{policy,now:at}).evidence_basis!==null) {
    const actual=latest.actual;
    result.current_window_summary={confirmed_full_tasks:actual.verified_full_tasks,unknown_tasks:actual.unknown_tasks,
      exact_rate:actual.verified_full_automation_rate,confirmed_lower_bound:actual.confirmed_full_automation_lower_bound};
  }
  result.state=result.confirmed_original_observations
    ? result.missing_original_observations || result.rejected_original_observations
      || result.unmatched_original_observations || result.unmatched_runtime_snapshots?'PARTIAL_REASSESSMENT':'REASSESSED'
    :'NO_REASSESSABLE_EVIDENCE';
  return result;
}
