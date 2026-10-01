import test from 'node:test';
import assert from 'node:assert/strict';
import {
  businessCoverage,businessPolicy,businessTaskId,measuredBusinessRates,sustainedTarget,
} from './business-automation.mjs';
import {reassessBusinessHistory} from './business-history-reassessment.mjs';

const coverage=businessCoverage(),policy=businessPolicy(),now=new Date('2026-10-01T01:00:00Z');
const weeks=['2026-09-07','2026-09-14','2026-09-21','2026-09-28'];
const stages=Object.fromEntries(['detect','decide','execute','verify','report','learn'].map(stage=>[stage,'agent']));
const shift=(day,n)=>new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10);
const declaredSourceAssurance=docs=>({kind:'owner_verified_immutable_originals',task_bindings_verified:true,
  observation_refs:docs.map(doc=>doc.observation.evidence_ref),
  review:{kind:'human',at:now.toISOString(),evidence_ref:'synthetic-owner-originals-review'}});
const source=week=>{
  const window={from:shift(week,-27),through:week};
  return {schema_version:1,policy_id:policy.previous_policy.policy_id,window,
    observation:{kind:'runtime_source_snapshot',at:week+'T01:00:00Z',evidence_ref:'synthetic-original-'+week},
    review:{kind:'human',at:week+'T01:00:00Z',evidence_ref:'synthetic-review-'+week},
    scope:{company_wide_complete:true,evidence_ref:'synthetic-company-census'},
    tasks:coverage.tasks.filter(task=>task.executor!=='intentional_no').map((task,index)=>index>=179
      ? {task_id:businessTaskId(task),state:'unimplemented',evidence_ref:'synthetic-unimplemented'}
      : {task_id:businessTaskId(task),state:'observed',evidence_ref:'synthetic-business-result',
        source_window:window,trigger_evidence_ref:'synthetic-trigger',human_activity_evidence_ref:'synthetic-human-activity',
        last_occurrence_at:week+'T00:30:00Z',occurrences:1,trigger_coverage_complete:true,human_activity_coverage_complete:true,
        human_touches:0,ai_used:true,origin:'scheduled',all_occurrences_succeeded:true,safety_passed:true,stages:{...stages}})};
};
const fixture=(mutateSource=()=>{})=>{
  const docs=weeks.map(source),points=[],observations=[];
  for(const doc of docs) {
    mutateSource(doc);
    const actual=measuredBusinessRates(doc,coverage,{policy,now:new Date(doc.review.at)});
    assert.ok(['MEASURED','PARTIAL_EVIDENCE'].includes(actual.state));
    delete actual.measurement_contract;delete actual.measurement_scope;
    actual.target_state='one_window_above_target';
    const originalAt=new Date(doc.observation.at).toISOString(),week=doc.window.through;
    const bound={week,scope_key:policy.fixed_scope.included_scope_key,excluded_scope_key:policy.fixed_scope.excluded_scope_key,
      policy_id:doc.policy_id,source_observed_at:originalAt,actual};
    observations.push({...structuredClone(bound),basis:'runtime_review',measurement_ref:doc.observation.evidence_ref});
    points.push({...structuredClone(bound),observed_at:originalAt});
  }
  return {history:{schema_version:1,points,observations},docs,sourceAssurance:declaredSourceAssurance(docs)};
};
const assess=(f,at=now)=>reassessBusinessHistory(f.history,f.docs,{coverage,policy,sourceAssurance:f.sourceAssurance,now:at});
const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};

test('same-quality old-policy originals are reassessed without relabeling or new measurements',()=>{
  const f=fixture(),original=structuredClone(f);
  assert.equal(sustainedTarget(f.history.points,policy,{coverage,now}),false);
  freeze(f);const result=assess(f);
  assert.equal(result.state,'REASSESSED');assert.equal(result.confirmed_original_observations,4);
  assert.equal(result.qualifying_weekly_observations,4);assert.equal(result.current_93_four_week_qualified,true);
  assert.equal(result.current_evidence_basis,'exact_runtime_rate');
  assert.deepEqual(result.current_window_summary,{confirmed_full_tasks:179,unknown_tasks:0,exact_rate:179/192,confirmed_lower_bound:179/192});
  assert.equal(result.basis,'historical_original_observations_reassessment');assert.equal(result.evaluated_at,now.toISOString());
  assert.match(result.assurance,/does not independently authenticate/);
  assert.equal(result.new_runtime_measurement,false);assert.equal(result.runtime_execution_credit,0);
  assert.deepEqual(f,original);
});
test('policy labels and current method declarations alone cannot replace original sources',()=>{
  const f=fixture();f.docs=[];f.sourceAssurance=declaredSourceAssurance(f.docs);
  for(const point of f.history.points)point.policy_id=policy.policy_id;
  const result=assess(f);
  assert.equal(result.current_93_four_week_qualified,false);assert.equal(result.confirmed_original_observations,0);
  assert.equal(result.missing_original_observations,4);assert.equal(result.new_runtime_measurement,false);
  assert.equal(result.current_evidence_basis,null);assert.equal(result.current_window_summary,null);
});
test('original references must match immutable snapshots, without returning mismatched references',()=>{
  const f=fixture();f.docs[0].observation.evidence_ref='synthetic-private-mismatched-original';
  f.sourceAssurance=declaredSourceAssurance(f.docs);
  const result=assess(f);
  assert.equal(result.current_93_four_week_qualified,false);assert.equal(result.confirmed_original_observations,3);
  assert.equal(result.missing_original_observations,1);assert.equal(result.unmatched_original_observations,1);
  assert.equal(JSON.stringify(result).includes('synthetic-private-mismatched-original'),false);
});
test('missing original timestamps, original windows and source-to-review chronology fail closed',()=>{
  for(const mutate of [f=>delete f.history.observations[0].source_observed_at,
    f=>delete f.history.points[0].actual.source_observed_at,f=>delete f.docs[0].observation.at,
    f=>delete f.docs[0].window,f=>f.docs[0].review.at='2026-09-07T00:00:00Z',
    f=>f.docs[3].review.at='2026-12-01T01:00:00Z']) {
    const f=fixture();mutate(f);const result=assess(f);
    assert.equal(result.current_93_four_week_qualified,false);
    assert.ok(result.rejected_original_observations>0 || result.state==='SOURCE_ASSURANCE_REQUIRED');
  }
});
test('both original included and excluded identities are mandatory, with no same-size substitution',()=>{
  for(const mutate of [f=>delete f.history.points[0].excluded_scope_key,
    f=>delete f.history.observations[0].excluded_scope_key,f=>f.history.observations[0].scope_key='a'.repeat(64),
    f=>f.history.points[0].excluded_scope_key='b'.repeat(64),
    f=>f.history.points[0].actual.measurement_scope={...policy.fixed_scope,excluded_scope_key:'a'.repeat(64)},
    f=>f.history.observations[0].actual.measurement_scope={...policy.fixed_scope,defined_tasks:191}]) {
    const f=fixture();mutate(f);const result=assess(f);
    assert.equal(result.current_93_four_week_qualified,false);assert.equal(result.reason_counts.fixed_scope_mismatch,1);
  }
  const f=fixture(),changed=structuredClone(coverage);changed.tasks[0].task='synthetic same-size substitution';
  const result=reassessBusinessHistory(f.history,f.docs,{coverage:changed,policy,now});
  assert.equal(result.state,'FIXED_SCOPE_MISMATCH');assert.equal(result.current_93_four_week_qualified,false);
  const valid=fixture();for(const collection of [valid.history.points,valid.history.observations])collection[0].actual.measurement_scope={...policy.fixed_scope};
  assert.equal(assess(valid).current_93_four_week_qualified,true);
});
test('the original point and immutable snapshot must both match recomputed arithmetic and diagnostics',()=>{
  for(const mutate of [a=>a.verified_full_tasks=180,a=>a.diagnostics.failed_tasks=1,a=>a.burden.actual_minutes_subtotal=20,
    a=>a.cost.usd_subtotal=3,a=>a.state='PARTIAL_EVIDENCE',a=>a.window.from='2026-08-01']) {
    for(const location of ['points','observations']) {
      const f=fixture();mutate(f.history[location][0].actual);const result=assess(f);
      assert.equal(result.current_93_four_week_qualified,false);assert.equal(result.reason_counts.measurement_facts_mismatch,1);
    }
  }
});
test('changed original source facts cannot agree merely because both old aggregates were forged',()=>{
  const f=fixture();for(const collection of [f.history.points,f.history.observations])collection[0].actual.verified_full_tasks=180;
  const result=assess(f);assert.equal(result.current_93_four_week_qualified,false);
  assert.equal(result.reason_counts.measurement_facts_mismatch,1);
});
test('current-method revalidation requires actual trigger, human activity and all stage evidence',()=>{
  for(const mutate of [d=>d.tasks[0].trigger_coverage_complete=false,d=>d.tasks[0].human_activity_coverage_complete=false,
    d=>d.tasks[0].occurrences=0,d=>delete d.tasks[0].trigger_evidence_ref,d=>delete d.tasks[0].human_activity_evidence_ref,
    d=>d.tasks[0].stages.learn='unknown',d=>d.tasks[0].human_touches=1,d=>d.tasks[0].origin='manual']) {
    const f=fixture();mutate(f.docs[0]);const result=assess(f);
    assert.equal(result.current_93_four_week_qualified,false);assert.equal(result.confirmed_original_observations,3);
  }
});
test('company scope must be confirmed in the original source and original facts',()=>{
  const f=fixture();f.docs[0].scope.company_wide_complete=false;
  const result=assess(f);assert.equal(result.current_93_four_week_qualified,false);
  assert.equal(result.reason_counts.measurement_facts_mismatch,1);
  const unattested=fixture(d=>d.scope.company_wide_complete=false),unchanged=assess(unattested);
  assert.equal(unchanged.confirmed_original_observations,4);assert.equal(unchanged.qualifying_weekly_observations,0);
  assert.equal(unchanged.current_93_four_week_qualified,false);
});
test('179 confirmed full tasks admit a historical lower bound without inventing an exact rate',()=>{
  const f=fixture(d=>{for(let i=179;i<d.tasks.length;i++)d.tasks[i]={task_id:d.tasks[i].task_id,state:'unknown'};});
  assert.equal(f.history.points[0].actual.state,'PARTIAL_EVIDENCE');
  assert.equal(f.history.points[0].actual.verified_full_automation_rate,null);
  assert.equal(f.history.points[0].actual.unknown_tasks,13);
  const result=assess(f);assert.equal(result.confirmed_original_observations,4);
  assert.equal(result.current_93_four_week_qualified,true);assert.equal(result.qualifying_weekly_observations,4);
  assert.equal(result.current_evidence_basis,'confirmed_runtime_lower_bound');
  assert.deepEqual(result.current_window_summary,{confirmed_full_tasks:179,unknown_tasks:13,exact_rate:null,confirmed_lower_bound:179/192});
  assert.equal(f.history.points[0].actual.verified_full_automation_rate,null);
  const below=fixture(d=>d.tasks[178]={task_id:d.tasks[178].task_id,state:'unknown'});
  const belowResult=assess(below);assert.equal(belowResult.current_93_four_week_qualified,false);
  assert.equal(belowResult.current_evidence_basis,null);assert.equal(belowResult.current_window_summary.unknown_tasks,1);
});
test('historical four-week measurements never establish December maintenance without a current source',()=>{
  const f=fixture(),original=structuredClone(f),result=assess(f,new Date('2026-12-01T01:00:00Z'));
  assert.equal(result.confirmed_original_observations,4);assert.equal(result.qualifying_weekly_observations,4);
  assert.equal(result.current_93_four_week_qualified,false);assert.deepEqual(f,original);
  assert.equal(result.current_evidence_basis,null);assert.equal(result.current_window_summary,null);
});
test('a reread or relabeled week cannot turn the same original measurement into a new week',()=>{
  const f=fixture();f.history.points[3].week='2026-10-05';f.history.points[3].observed_at='2026-10-05T01:00:00.000Z';
  const result=assess(f,new Date('2026-10-05T02:00:00Z'));
  assert.equal(result.current_93_four_week_qualified,false);assert.equal(result.reason_counts.runtime_snapshot_missing,1);
  assert.equal(result.current_window_summary,null);
  const relabeled=fixture();for(const collection of [relabeled.history.points,relabeled.history.observations])collection[3].week='2026-10-05';
  assert.equal(assess(relabeled,new Date('2026-10-05T02:00:00Z')).reason_counts.original_source_metadata,1);
});
test('one missing original observation blocks its week even when the other three proofs are complete',()=>{
  const f=fixture();f.docs.splice(1,1);f.sourceAssurance=declaredSourceAssurance(f.docs);const result=assess(f);
  assert.equal(result.confirmed_original_observations,3);assert.equal(result.missing_original_observations,1);
  assert.equal(result.current_93_four_week_qualified,false);
});
test('duplicate source bindings and originals with no corresponding point do not supply evidence',()=>{
  const duplicate=fixture();duplicate.docs.push(structuredClone(duplicate.docs[0]));
  assert.equal(assess(duplicate).state,'SOURCE_ASSURANCE_REQUIRED');
  assert.equal(assess(duplicate).current_93_four_week_qualified,false);
  const snapshots=fixture();snapshots.history.observations[1].measurement_ref=snapshots.history.observations[0].measurement_ref;
  assert.equal(assess(snapshots).reason_counts.ambiguous_runtime_snapshot,2);
  const orphan=fixture();orphan.history.points=[];const result=assess(orphan);
  assert.equal(result.confirmed_original_observations,0);assert.equal(result.unmatched_original_observations,4);
  assert.equal(result.unmatched_runtime_snapshots,4);assert.equal(result.current_93_four_week_qualified,false);
});
test('private references, original document extensions and old policy text never appear in results',()=>{
  const f=fixture();f.docs[0].private_note='synthetic-private-document-extension';
  f.history.points[0].policy_id='synthetic-private-policy-label';
  const result=assess(f),output=JSON.stringify(result);
  for(const text of ['synthetic-original-','synthetic-review-','synthetic-business-result','synthetic-private-document-extension',
    'synthetic-private-policy-label',businessTaskId(coverage.tasks[0])])assert.equal(output.includes(text),false);
  assert.equal(result.current_93_four_week_qualified,true);
});
test('invalid parameters and non-runtime history are reported without fallback credit or exceptions',()=>{
  const f=fixture();
  for(const result of [reassessBusinessHistory(f.history,f.docs),
    reassessBusinessHistory(null,f.docs,{coverage,policy,now}),
    reassessBusinessHistory(f.history,f.docs,{coverage,policy,now:new Date('invalid')})]) {
    assert.equal(result.current_93_four_week_qualified,false);assert.equal(result.new_runtime_measurement,false);
    assert.equal(result.confirmed_original_observations,0);
  }
  const unread=fixture();unread.history.points[0].actual={state:'NO_EVIDENCE'};
  assert.equal(assess(unread).unverified_weekly_points,1);assert.equal(assess(unread).current_93_four_week_qualified,false);
});
test('owner verification of immutable originals and task bindings is mandatory, not inferred from equal aggregates',()=>{
  for(const mutate of [f=>delete f.sourceAssurance,
    f=>f.sourceAssurance.observation_refs.pop(),
    f=>f.sourceAssurance.observation_refs[1]=f.sourceAssurance.observation_refs[0],
    f=>f.sourceAssurance.task_bindings_verified=false,
    f=>f.sourceAssurance.review.kind='agent',
    f=>delete f.sourceAssurance.review.evidence_ref,
    f=>f.sourceAssurance.review.at='2026-09-27T01:00:00Z',
    f=>f.sourceAssurance.review.at='2026-10-01T01:00:01Z']) {
    const f=fixture();mutate(f);const result=assess(f);
    assert.equal(result.state,'SOURCE_ASSURANCE_REQUIRED');assert.equal(result.reason_counts.source_assurance_required,1);
    assert.equal(result.confirmed_original_observations,0);assert.equal(result.current_93_four_week_qualified,false);
    assert.equal(result.current_evidence_basis,null);assert.equal(result.current_window_summary,null);
    assert.equal(result.new_runtime_measurement,false);assert.equal(result.runtime_execution_credit,0);
  }
  const exchanged=fixture();
  for(const doc of exchanged.docs) {
    [doc.tasks[0].task_id,doc.tasks[179].task_id]=[doc.tasks[179].task_id,doc.tasks[0].task_id];
  }
  delete exchanged.sourceAssurance;
  assert.equal(assess(exchanged).state,'SOURCE_ASSURANCE_REQUIRED');
  // A false declaration cannot be independently detected by this pure aggregate calculator.
  // The owner must check task bindings against retained originals before invoking it.
  exchanged.sourceAssurance=declaredSourceAssurance(exchanged.docs);
  const declared=assess(exchanged);
  assert.equal(declared.current_93_four_week_qualified,true);
  assert.match(declared.assurance,/Matching aggregate facts alone cannot prove task-binding immutability/);
  assert.equal(JSON.stringify(declared).includes('synthetic-owner-originals-review'),false);
});
