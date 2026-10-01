import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BUSINESS_MEASUREMENT_CONTRACT,businessPolicy,businessTaskId,inventoryBusinessRates,measuredBusinessRates,sustainedTarget,jstDay,weekKey,recordBusinessWeek,validateBusinessPolicy,businessScope,fixedScopeAssessment,businessStatus,currentGoalAssessment} from '../growth/lib/business-automation.mjs';
import {renderBusinessChart,validateWeeklySeries,privateWeeklyChart,exportWeeklyAggregates} from './business-automation.mjs';
import {taskKey} from '../growth/lib/company-metrics.mjs';
const now=new Date('2026-09-30T14:00:00Z');
const coverage={measured_at:'2026-09-15',tasks:[
  {area:'app',task:'machine gate',executor:'ai_executes_gated'},
  {area:'company',task:'filing',executor:'human_only'},
  {area:'company',task:'declined',executor:'intentional_no'}]};
const observed=(t)=>({task_id:businessTaskId(t),state:'observed',evidence_ref:'run-completion',
  source_window:{from:'2026-09-03',through:'2026-09-30'},trigger_evidence_ref:'triggers',human_activity_evidence_ref:'human-observability',
  last_occurrence_at:'2026-09-30T01:00:00Z',occurrences:4,trigger_coverage_complete:true,human_activity_coverage_complete:true,
  human_touches:0,ai_used:true,origin:'scheduled',all_occurrences_succeeded:true,safety_passed:true,
  stages:Object.fromEntries(['detect','decide','execute','verify','report','learn'].map(k=>[k,'agent']))});
const fixture=()=>({schema_version:1,window:{from:'2026-09-03',through:'2026-09-30'},
  observation:{kind:'runtime_source_snapshot',at:'2026-09-30T12:00:00Z',evidence_ref:'original-runtime-snapshot'},
  review:{kind:'human',at:'2026-09-30T13:00:00Z',evidence_ref:'original-receipts-review'},tasks:coverage.tasks.slice(0,2).map(observed)});
const score=d=>measuredBusinessRates(d,coverage,{now});

test('all-scope rates retain human/nobody and legacy conditional rates',()=>{
 const c=structuredClone(coverage);c.tasks.push({area:'app',task:'missing',executor:'nobody'},{area:'app',task:'draft',executor:'ai_proposes'});
 const s=inventoryBusinessRates(c);assert.equal(s.overall.defined,4);assert.equal(s.overall.declared_execution_rate,.25);
 assert.equal(s.overall.declared_ai_utilization_rate,.5);assert.equal(s.overall.ai_execution_rate,1/3);assert.equal(s.target.achieved_in_actual_operation,false);
});
test('IDs preserve existing Company identity across classification changes',()=>{assert.equal(businessTaskId(coverage.tasks[0]),taskKey(coverage.tasks[0]));});
test('JST Monday buckets cross UTC midnight correctly',()=>{assert.equal(weekKey('2026-09-27T14:59:59Z'),'2026-09-21');assert.equal(weekKey('2026-09-27T15:00:00Z'),'2026-09-28');});
test('no runtime evidence is unknown, never classification-as-zero-touch',()=>{const s=score(null);assert.equal(s.state,'NO_EVIDENCE');assert.equal(s.verified_full_automation_rate,null);});
test('full chain, native origin and complete trigger/human coverage admit the explicit measurement method',()=>{
 const s=score(fixture());assert.equal(s.state,'MEASURED');assert.equal(s.verified_full_automation_rate,1);
 assert.equal(s.measurement_contract,BUSINESS_MEASUREMENT_CONTRACT);assert.deepEqual(s.measurement_scope,businessScope(coverage));
});
test('human touch/manual origin/human stage do not qualify as full automation',()=>{
 for(const mutate of [t=>t.human_touches=1,t=>t.origin='manual',t=>t.stages.decide='human',t=>t.all_occurrences_succeeded=false,t=>t.safety_passed=false]) {
  const d=fixture();mutate(d.tasks[0]);assert.equal(score(d).verified_full_automation_rate,.5);assert.equal(score(d).verified_ai_utilization_rate,1);
 }
});
test('unknown and not-due rows retain whole-scope denominator and null point',()=>{for(const state of ['unknown','not_due']){const d=fixture();d.tasks[1]={task_id:businessTaskId(coverage.tasks[1]),state};const s=score(d);assert.equal(s.verified_full_automation_rate,null);assert.equal(s.confirmed_full_automation_lower_bound,.5);assert.equal(s.unknown_tasks,1);}});
test('missing rows remain unknown; duplicate/foreign/retired rows cannot pad numerator',()=>{
 const d=fixture();d.tasks.pop();assert.equal(score(d).state,'PARTIAL_EVIDENCE');
 for(const extra of [fixture().tasks[0],observed(coverage.tasks[2]),{task_id:'foreign',state:'human_only',evidence_ref:'r'}]){const x=fixture();x.tasks.push(extra);assert.equal(score(x).state,'INVALID_EVIDENCE');}
});
test('self-review, future/stale window and missing actual observation are refused',()=>{
 for(const mutate of [d=>d.review.kind='agent',d=>d.review.at='2026-10-01T00:00:00Z',d=>d.window.through='2026-09-29',d=>d.tasks[0].human_activity_coverage_complete=false,d=>d.tasks[0].occurrences=0,d=>d.tasks[0].source_window.from='2026-08-01',d=>d.tasks[0].last_occurrence_at='2026-08-01T00:00:00Z']){const d=fixture();mutate(d);assert.equal(score(d).state,'INVALID_EVIDENCE');}
});
test('partial stage knowledge cannot be compensated by healthy execution',()=>{const d=fixture();d.tasks[0].stages.decide='unknown';assert.equal(score(d).unknown_tasks,1);assert.equal(score(d).verified_full_automation_rate,null);});
test('observed savings need all tasks and prospective observed baseline',()=>{
 const d=fixture();const b={measurement:'observed',baseline_minutes:20,actual_minutes:10,baseline_evidence_ref:'baseline',actual_evidence_ref:'actual',baseline_recorded_at:'2026-09-03T00:00:00Z',first_occurrence_at:'2026-09-04T00:00:00Z'};
 d.tasks[0].burden=b;assert.equal(score(d).observed_work_saved_rate,null);d.tasks[1].burden=b;assert.equal(score(d).observed_work_saved_rate,.5);
 d.tasks[0].burden={...b,baseline_recorded_at:'2026-09-05T00:00:00Z'};assert.equal(score(d).state,'INVALID_EVIDENCE');
});
const targetCoverage=JSON.parse(fs.readFileSync(new URL('../data/automation-coverage.json',import.meta.url)));
const targetPolicy=businessPolicy();
const targetNow=new Date('2026-11-01T01:00:00Z');
const targetPoints=(full=179)=>['2026-10-05','2026-10-12','2026-10-19','2026-10-26'].map(week=>({
 week,scope_key:targetPolicy.fixed_scope.included_scope_key,excluded_scope_key:targetPolicy.fixed_scope.excluded_scope_key,
 policy_id:targetPolicy.policy_id,actual:{state:'MEASURED',policy_id:targetPolicy.policy_id,scope_completeness:'attested',
 measurement_contract:BUSINESS_MEASUREMENT_CONTRACT,measurement_scope:businessScope(targetCoverage),
 defined_tasks:192,unknown_tasks:0,verified_full_tasks:full,verified_full_automation_rate:full/192,
 confirmed_full_automation_lower_bound:full/192,
 source_observed_at:week+'T01:00:00Z',window:{from:new Date(Date.parse(week)-27*86400000).toISOString().slice(0,10),through:week}}}));
const targetSustained=p=>sustainedTarget(p,targetPolicy,{now:targetNow,coverage:targetCoverage});
test('fixed192 needs179 real full tasks for inclusive93, retained178 is below target',()=>{
 assert.equal(targetSustained(targetPoints(179)),true);assert.equal(targetSustained(targetPoints(178)),false);
 assert.equal(inventoryBusinessRates(targetCoverage).target.minimum_automated_tasks,179);
 assert.equal(inventoryBusinessRates(targetCoverage).target.additional_declared_tasks_needed,15);
});
test('missing measurement method, different fixed sets and broken weeks cannot prove four-week achievement',()=>{
 for(const mutate of [p=>delete p[0].actual.measurement_contract,p=>p[0].actual.measurement_contract='old-unverified-method',
  p=>delete p[0].actual.measurement_scope,p=>p[0].actual.measurement_scope.excluded_scope_key='a'.repeat(64),
  p=>p[0].scope_key='a'.repeat(64),p=>p[0].excluded_scope_key='a'.repeat(64),
  p=>p[0].week='2026-09-29',p=>p[0].actual.state='PARTIAL_EVIDENCE',p=>p[0].actual.scope_completeness='not_attested',
  p=>{p[0].actual.source_observed_at='2026-10-01T00:56:07Z';p[0].week='2026-09-28';p[0].actual.window={from:'2026-09-04',through:'2026-10-01'}}]) {
  const points=targetPoints();mutate(points);assert.equal(targetSustained(points),false);
 }
});
test('same verified method and fixed cohort are not disqualified solely by old or missing policy labels',()=>{
 for(const mutate of [p=>p[0].policy_id='business-automation-v1',p=>delete p[0].policy_id,
  p=>p[0].actual.policy_id=null,p=>p[0].actual.policy_id=targetPolicy.previous_policy.policy_id]) {
  const points=targetPoints();mutate(points);const before=structuredClone(points);
  assert.equal(targetSustained(points),true);assert.deepEqual(points,before);
 }
 const points=targetPoints();
 ['2026-09-07','2026-09-14','2026-09-21','2026-09-28'].forEach((week,i)=>{
  points[i].week=week;points[i].actual.source_observed_at=week+'T01:00:00Z';
  points[i].actual.window={from:new Date(Date.parse(week)-27*86400000).toISOString().slice(0,10),through:week};
 });
 const original=structuredClone(points);
 assert.equal(sustainedTarget(points,targetPolicy,{now:new Date('2026-10-01T01:00:00Z'),coverage:targetCoverage}),true);
 assert.deepEqual(points,original);
 delete points[0].actual.measurement_contract;
 assert.equal(sustainedTarget(points,targetPolicy,{now:new Date('2026-10-01T01:00:00Z'),coverage:targetCoverage}),false);
});
test('179 confirmed tasks and13 unknown tasks prove the lower bound for four fresh weeks without an exact rate',()=>{
 const points=targetPoints();
 points.forEach(p=>{p.actual.state='PARTIAL_EVIDENCE';p.actual.unknown_tasks=13;p.actual.verified_full_automation_rate=null;});
 const original=structuredClone(points);
 assert.equal(targetSustained(points),true);assert.deepEqual(points,original);
 assert(points.every(p=>p.actual.unknown_tasks===13 && p.actual.verified_full_automation_rate===null));
 for(const mutate of [p=>{p[0].actual.verified_full_tasks=178;p[0].actual.unknown_tasks=14;p[0].actual.confirmed_full_automation_lower_bound=178/192;},
  p=>p[0].actual.confirmed_full_automation_lower_bound=.99,p=>p[0].actual.verified_full_automation_rate=179/192,
  p=>p[0].actual.unknown_tasks=0,p=>p[0].actual.scope_completeness='not_attested']) {
  const changed=structuredClone(points);mutate(changed);assert.equal(targetSustained(changed),false);
 }
});
test('aggregate omits individual IDs, references and sensitive input extensions',()=>{const d=fixture();d.private_note='never-copy-this';const s=JSON.stringify(score(d));for(const x of ['never-copy-this','original-receipts-review',businessTaskId(coverage.tasks[0])])assert.equal(s.includes(x),false);});
test('policy cannot shrink the denominator or turn unknown into success',()=>{for(const mutate of [p=>p.missing_evidence='success',p=>p.denominator='doing-only',p=>p.ranker_reward=true]){const p=structuredClone(businessPolicy());mutate(p);assert.deepEqual(validateBusinessPolicy(p),['business_policy']);}});
test('weekly hook reuses the existing owner and writes only private aggregate history',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'business-week-'));
 try{const r=recordBusinessWeek({stateRoot:dir,coverage,now});assert.equal(r.point.actual.state,'NO_EVIDENCE');assert.equal(r.sustained_above_target,false);assert.equal(fs.statSync(path.join(dir,'business-automation/weekly.json')).mode&0o077,0);assert.equal(fs.statSync(path.join(dir,'business-automation')).mode&0o077,0);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('historical initial series rejects filling missing actual data with ledger rates',()=>{
 const d=JSON.parse(fs.readFileSync(new URL('../data/business-automation-weekly.json',import.meta.url)));
 assert.deepEqual(validateWeeklySeries(d),[]);d.points[0].actual.verified_full_automation_rate=.8;assert.ok(validateWeeklySeries(d).includes('historical_runtime_claim'));
});
test('charts have a full 0–100 axis, missing-data label and privacy-safe actual overlay',()=>{
 const d=JSON.parse(fs.readFileSync(new URL('../data/business-automation-weekly.json',import.meta.url))),svg=renderBusinessChart(d);
 assert.match(svg,/100%/);assert.match(svg,/欠測は0%ではありません/);assert.match(svg,/93%/);assert.match(svg,/90%/);
 const h={points:[{week:'2026-09-28',as_of:'2026-09-30',scope_key:'fixed',observed_at:'2026-09-30T14:00:00.000Z',inventory:{overall:{declared_execution_rate:.8,declared_ai_utilization_rate:.9}},actual:{source_observed_at:'2026-09-30T14:00:00.000Z',verified_full_automation_rate:.5,verified_ai_utilization_rate:.9},private_note:'private-input-do-not-copy'}]};
 const rendered=privateWeeklyChart(h,d);assert.equal(rendered.includes('private-input-do-not-copy'),false);assert.equal(rendered.includes('週次の実運用証拠は未確認'),false);
});
const base=()=>JSON.parse(fs.readFileSync(new URL('../data/business-automation-weekly.json',import.meta.url)));
const publicHistory=d=>{
 const p=d.points.at(-1),n=p.inventory.defined_tasks;
 return {schema_version:1,points:[{week:p.week,as_of:d.through,observed_at:d.generated_at,scope_key:p.inventory.scope_fingerprint,
  inventory:{inventory_measured_at:p.inventory.inventory_measured_at,overall:{defined:n,ai_executes:p.inventory.ai_executes,counts:{ai_proposes:p.inventory.ai_proposes}}},
  actual:{state:'MEASURED',source_observed_at:d.generated_at,window:{from:new Date(Date.parse(d.through)-27*86400000).toISOString().slice(0,10),through:d.through},scope_completeness:'not_attested',defined_tasks:n,unknown_tasks:0,
   measurement_contract:BUSINESS_MEASUREMENT_CONTRACT,measurement_scope:businessScope(targetCoverage),confirmed_full_automation_lower_bound:164/n,
   verified_full_tasks:164,verified_ai_utilization_tasks:171,verified_full_automation_rate:164/n,verified_ai_utilization_rate:171/n,observed_work_saved_rate:null},
  private_ref:'never-publish-this-original-reference',private_note:'never-publish-this-note'}]};
};
test('public export whitelists aggregate fields, admits arithmetic and preserves missing March',()=>{
 const d=base(),h=publicHistory(d),e=exportWeeklyAggregates(h,d);
 assert.deepEqual(validateWeeklySeries(e),[]);assert.equal(e.points[0].actual.verified_full_automation_rate,null);
 assert.equal(e.points.at(-1).actual.verified_full_automation_rate,164/192);
 assert.equal(JSON.stringify(e).includes('never-publish'),false);
});
const publicPolicyHistory=(d,policyId=targetPolicy.policy_id)=>{
 const h=publicHistory(d),p=h.points[0],a=p.actual;
 p.policy_id=policyId;a.policy_id=policyId;p.excluded_scope_key=targetPolicy.fixed_scope.excluded_scope_key;
 a.scope_completeness='attested';a.verified_full_tasks=179;a.verified_ai_utilization_tasks=179;
 a.confirmed_full_automation_lower_bound=179/192;
 a.verified_full_automation_rate=179/192;a.verified_ai_utilization_rate=179/192;
 return h;
};
test('public legacy and null labels preserve above93 arithmetic but missing method proof receives no goal credit',()=>{
 for(const id of [undefined,null,targetPolicy.previous_policy.policy_id]) {
  const d=base(),h=publicPolicyHistory(d,id),p=h.points[0];
  if(id===undefined){delete p.policy_id;delete p.actual.policy_id;}
  delete p.excluded_scope_key;
  delete p.actual.measurement_contract;delete p.actual.measurement_scope;
  const e=exportWeeklyAggregates(h,d),a=e.points.at(-1).actual;
  assert.deepEqual(validateWeeklySeries(e),[]);assert.equal(a.policy_id,id??null);
  assert.equal(a.excluded_scope_fingerprint,null);assert.equal(a.verified_full_tasks,179);
  assert.equal(a.verified_full_automation_rate,179/192);assert.equal(a.source_observed_at,d.generated_at);
  assert.equal(currentGoalAssessment(a,targetCoverage,{now:new Date(d.generated_at)}).one_window_qualified,false);
  assert.deepEqual(exportWeeklyAggregates({schema_version:1,points:[]},d,e).points.at(-1).actual,a);
 }
});
test('public current method requires both fixed sets and192 tasks, while the source can predate policy activation',()=>{
 const d=base(),h=publicPolicyHistory(d),e=exportWeeklyAggregates(h,d),a=e.points.at(-1).actual;
 assert.deepEqual(validateWeeklySeries(e),[]);assert.equal(a.policy_id,targetPolicy.policy_id);
 assert.equal(a.excluded_scope_fingerprint,targetPolicy.fixed_scope.excluded_scope_key);
 assert.equal(currentGoalAssessment(a,targetCoverage,{now:new Date(d.generated_at)}).one_window_qualified,true);
 for(const mutate of [h=>h.points[0].scope_key='a'.repeat(64),h=>delete h.points[0].excluded_scope_key,
  h=>h.points[0].excluded_scope_key='b'.repeat(64),
  h=>{const p=h.points[0];p.inventory.overall.defined=193;p.actual.defined_tasks=193;
    p.actual.verified_full_automation_rate=179/193;p.actual.verified_ai_utilization_rate=179/193;p.actual.confirmed_full_automation_lower_bound=179/193;}]) {
  const changed=publicPolicyHistory(d);mutate(changed);
  assert.throws(()=>exportWeeklyAggregates(changed,d),/weekly_aggregate_rejected/);
 }
 const earlier=publicPolicyHistory(d),p=earlier.points[0],at=new Date(Date.parse(targetPolicy.effective_at)-1000).toISOString();
 p.observed_at=at;p.actual.source_observed_at=at;p.week=weekKey(at);
 const through=jstDay(at);p.actual.window={from:new Date(Date.parse(through)-27*86400000).toISOString().slice(0,10),through};
 const exported=exportWeeklyAggregates(earlier,d),actual=exported.points.at(-1).actual;
 assert.equal(actual.source_observed_at,at);assert.equal(actual.verified_full_tasks,179);
 assert.equal(currentGoalAssessment(actual,targetCoverage,{now:new Date(d.generated_at)}).one_window_qualified,true);
});
test('public export retains the qualifying179-of192 lower bound alongside13 unknown and a null exact rate',()=>{
 const d=base(),h=publicPolicyHistory(d),a=h.points[0].actual;
 a.state='PARTIAL_EVIDENCE';a.unknown_tasks=13;a.verified_full_automation_rate=null;a.verified_ai_utilization_rate=null;
 const e=exportWeeklyAggregates(h,d),actual=e.points.at(-1).actual;
 assert.deepEqual(validateWeeklySeries(e),[]);assert.equal(actual.verified_full_tasks,179);
 assert.equal(actual.defined_tasks,192);assert.equal(actual.unknown_tasks,13);
 assert.equal(actual.verified_full_automation_rate,null);assert.equal(actual.confirmed_full_automation_lower_bound,179/192);
 assert.equal(actual.measurement_contract,BUSINESS_MEASUREMENT_CONTRACT);
 assert.deepEqual(actual.measurement_scope,businessScope(targetCoverage));
 const goal=currentGoalAssessment(actual,targetCoverage,{now:new Date(d.generated_at)});
 assert.equal(goal.one_window_qualified,true);assert.equal(goal.evidence_basis,'confirmed_runtime_lower_bound');
 assert.equal(goal.exact_rate_confirmed,false);
});
test('a newer qualified lower-bound source can replace the earlier exact178 public point without changing the old point',()=>{
 const d=base(),morning=publicPolicyHistory(d),a=morning.points[0].actual;
 a.verified_full_tasks=178;a.verified_ai_utilization_tasks=178;a.verified_full_automation_rate=178/192;
 a.verified_ai_utilization_rate=178/192;a.confirmed_full_automation_lower_bound=178/192;
 const previous=exportWeeklyAggregates(morning,d),original=structuredClone(previous);
 const lateBase=structuredClone(d);lateBase.generated_at=new Date(Date.parse(d.generated_at)+60000).toISOString();
 const late=publicPolicyHistory(lateBase),p=late.points[0];
 p.actual.state='PARTIAL_EVIDENCE';p.actual.unknown_tasks=13;
 p.actual.verified_full_automation_rate=null;p.actual.verified_ai_utilization_rate=null;
 const changed=exportWeeklyAggregates(late,lateBase,previous),actual=changed.points.at(-1).actual;
 assert.equal(actual.state,'PARTIAL_EVIDENCE');assert.equal(actual.verified_full_tasks,179);
 assert.equal(actual.unknown_tasks,13);assert.equal(actual.verified_full_automation_rate,null);
 assert.equal(actual.source_observed_at,lateBase.generated_at);assert.equal(actual.confirmed_full_automation_lower_bound,179/192);
 assert.deepEqual(previous,original);
 for(const mutate of [a=>delete a.measurement_contract,a=>delete a.measurement_scope,
  a=>a.measurement_scope.excluded_scope_key='a'.repeat(64),a=>a.scope_completeness='not_attested',
  a=>a.window.from=new Date(Date.parse(a.window.from)+86400000).toISOString().slice(0,10)]) {
  const deficient=structuredClone(late);mutate(deficient.points[0].actual);
  const held=exportWeeklyAggregates(deficient,lateBase,previous);
  assert.deepEqual(held.points.at(-1).actual,previous.points.at(-1).actual);
 }
});
test('unknown private method values and scope extensions cannot cross the public export boundary',()=>{
 const marker='SYNTHETIC_PRIVATE_METHOD_SCOPE_MUST_NOT_RETURN';
 for(const mutate of [a=>a.measurement_contract=marker,a=>a.measurement_scope.included_scope_key=marker,
  a=>a.measurement_scope.private_note=marker]) {
  const d=base(),h=publicPolicyHistory(d);mutate(h.points[0].actual);
  const e=exportWeeklyAggregates(h,d);
  assert(!JSON.stringify(e).includes(marker));assert.deepEqual(validateWeeklySeries(e),[]);
  if(h.points[0].actual.measurement_contract!==BUSINESS_MEASUREMENT_CONTRACT
    ||h.points[0].actual.measurement_scope.included_scope_key!==targetPolicy.fixed_scope.included_scope_key) {
    assert(!Object.hasOwn(e.points.at(-1).actual,'measurement_contract'));
    assert.equal(currentGoalAssessment(e.points.at(-1).actual,targetCoverage,{now:new Date(d.generated_at)}).one_window_qualified,false);
  }
 }
});
test('unknown private policy and exclusion strings are omitted from both new and preserved public points',()=>{
 const d=base(),h=publicHistory(d),policyText='synthetic-private-policy-do-not-publish',scopeText='synthetic-private-exclusion-do-not-publish';
 h.points[0].policy_id=policyText;h.points[0].actual.policy_id=policyText;h.points[0].excluded_scope_key=scopeText;
 const e=exportWeeklyAggregates(h,d),a=e.points.at(-1).actual;
 assert.equal(a.policy_id,null);assert.equal(a.excluded_scope_fingerprint,null);
 assert.equal(a.verified_full_automation_rate,164/192);
 for(const text of [policyText,scopeText])assert.equal(JSON.stringify(e).includes(text),false);
 const previous=structuredClone(e);previous.points.at(-1).actual.policy_id=policyText;
 previous.points.at(-1).actual.excluded_scope_fingerprint=scopeText;
 assert.ok(validateWeeklySeries(previous).includes('runtime_policy_identity'));
 const preserved=exportWeeklyAggregates({schema_version:1,points:[]},d,previous);
 for(const text of [policyText,scopeText])assert.equal(JSON.stringify(preserved).includes(text),false);
 assert.equal(preserved.points.at(-1).actual.policy_id,null);
});
test('a top-level current label cannot promote an old or undeclared original policy',()=>{
 for(const id of [undefined,null,targetPolicy.previous_policy.policy_id,'synthetic-private-policy-do-not-publish']) {
  const d=base(),h=publicPolicyHistory(d);if(id===undefined)delete h.points[0].actual.policy_id;else h.points[0].actual.policy_id=id;
  assert.throws(()=>exportWeeklyAggregates(h,d));
 }
});
test('public export rejects changed scope and fabricated numerator arithmetic',()=>{
 for(const mutate of [h=>h.points[0].scope_key='other-scope',h=>h.points[0].actual.verified_full_tasks=200,h=>h.points[0].actual.verified_full_automation_rate=.99]) {
  const d=base(),h=publicHistory(d);mutate(h);assert.throws(()=>exportWeeklyAggregates(h,d));
 }
});
test('published measurements survive missing or partial private history',()=>{
 const d=base(),h=publicHistory(d),previous=exportWeeklyAggregates(h,d);
 assert.deepEqual(exportWeeklyAggregates({schema_version:1,points:[]},d,previous).points.at(-1).actual,previous.points.at(-1).actual);
 h.points[0].actual.state='PARTIAL_EVIDENCE';assert.deepEqual(exportWeeklyAggregates(h,d,previous).points.at(-1).actual,previous.points.at(-1).actual);
});
test('public-to-private graph transition breaks lines when scope changes',()=>{
 const d=base(),last=d.points.at(-1),h={points:[{week:last.week,as_of:d.through,scope_key:'new-scope',inventory:{overall:{declared_execution_rate:.85,declared_ai_utilization_rate:.89}},actual:{verified_full_automation_rate:null,verified_ai_utilization_rate:null}}]};
 const changed=privateWeeklyChart(h,d);h.points[0].scope_key=last.inventory.scope_fingerprint;
 const same=privateWeeklyChart(h,d);assert.notEqual(changed,same);
});
test('a later same-week inventory change preserves the original measured runtime cohort',()=>{
 const d=base(),previous=exportWeeklyAggregates(publicHistory(d),d),next=structuredClone(d),inv=next.points.at(-1).inventory;
 inv.defined_tasks++;inv.scope_fingerprint='a'.repeat(64);inv.declared_execution_rate=inv.ai_executes/inv.defined_tasks;
 inv.declared_ai_utilization_rate=(inv.ai_executes+inv.ai_proposes)/inv.defined_tasks;inv.scope_changed=true;
 const e=exportWeeklyAggregates({schema_version:1,points:[]},next,previous);
 assert.deepEqual(validateWeeklySeries(e),[]);assert.equal(e.points.at(-1).actual.defined_tasks,192);
 assert.equal(e.points.at(-1).inventory.defined_tasks,193);assert.equal(e.points.at(-1).actual.scope_fingerprint,previous.points.at(-1).actual.scope_fingerprint);
});
test('nested private metadata is never copied and free-form date annotations are rejected',()=>{
 const d=base(),h=publicHistory(d);h.points[0].actual.window.private_evidence_ref='never-publish-window-reference';
 h.points[0].actual.measurement_scope.private_note='never-publish-scope-reference';
 const e=exportWeeklyAggregates(h,d);assert.equal(JSON.stringify(e).includes('never-publish-window-reference'),false);
 assert.equal(JSON.stringify(e).includes('never-publish-scope-reference'),false);
 for(const mutate of [h=>h.points[0].observed_at+=' (never-publish-date-note)',h=>h.points[0].inventory.inventory_measured_at='never-publish-private-date',h=>h.points[0].actual.window.from='2026-09-03 (private-note)']){
  const h=publicHistory(d);mutate(h);assert.throws(()=>exportWeeklyAggregates(h,d));
 }
});
test('older valid observations cannot replace a newer published measurement',()=>{
 const d=base(),h=publicHistory(d),previous=exportWeeklyAggregates(h,d);
 h.points[0].observed_at=new Date(Date.parse(d.generated_at)-60000).toISOString();h.points[0].actual.source_observed_at=h.points[0].observed_at;
 h.points[0].actual.verified_full_tasks=165;h.points[0].actual.verified_full_automation_rate=165/192;
 assert.deepEqual(exportWeeklyAggregates(h,d,previous).points.at(-1).actual,previous.points.at(-1).actual);
});

test('diagnostics keep failures, manual work and each unknown stage visible without inventing a rate',()=>{
 const d=fixture();d.tasks[0].all_occurrences_succeeded=false;d.tasks[0].human_touches=2;
 d.tasks[0].origin='manual';d.tasks[1].stages.learn='unknown';
 const s=score(d);assert.equal(s.verified_full_automation_rate,null);assert.equal(s.diagnostics.failed_tasks,1);
 assert.equal(s.diagnostics.human_intervened_tasks,1);assert.equal(s.diagnostics.reported_human_touches,2);
 assert.equal(s.diagnostics.unknown_stage_tasks.learn,1);assert.equal(s.diagnostics.unknown_stage_tasks.verify,0);
});
test('actual effort increase and currency subtotals are separate from incomplete company rates',()=>{
 const d=fixture();d.tasks[0].burden={measurement:'observed',baseline_minutes:20,actual_minutes:40,
   baseline_evidence_ref:'before',actual_evidence_ref:'after',baseline_recorded_at:'2026-09-03T00:00:00Z',first_occurrence_at:'2026-09-04T00:00:00Z'};
 d.tasks[0].cost={measurement:'observed',usd:2,evidence_ref:'exclusive-task-cost',allocation:'task_window_exclusive',source_window:d.window};
 const s=score(d);assert.equal(s.observed_work_saved_rate,null);assert.equal(s.burden.actual_minutes_subtotal,40);
 assert.equal(s.burden.observed_minutes_delta,20);assert.equal(s.burden.observed_work_increased,true);
 assert.equal(s.burden.actual_minutes_total,null);assert.equal(s.cost.usd_subtotal,2);assert.equal(s.cost.usd_total,null);assert.equal(s.cost.jpy_subtotal,null);
});
test('burden baseline and first occurrence cannot follow the same task last occurrence or source snapshot',()=>{
 const d=fixture();d.tasks[0].last_occurrence_at='2026-09-05T00:00:00Z';
 d.tasks[0].burden={measurement:'observed',baseline_minutes:20,actual_minutes:10,baseline_evidence_ref:'before',actual_evidence_ref:'after',baseline_recorded_at:'2026-09-28T00:00:00Z',first_occurrence_at:'2026-09-29T00:00:00Z'};
 assert.equal(score(d).state,'INVALID_EVIDENCE');
});
test('costs cannot silently double count shared receipts or estimated allocations',()=>{
 for(const mutate of [d=>d.tasks[0].cost.allocation='shared_invoice_total',d=>d.tasks[0].cost.measurement='estimated',
   d=>d.tasks[1].cost={...d.tasks[0].cost},d=>d.tasks[0].cost.source_window={from:'2026-09-01',through:'2026-09-30'}]) {
  const d=fixture();d.tasks[0].cost={measurement:'observed',usd:2,evidence_ref:'exclusive-cost',allocation:'task_window_exclusive',source_window:d.window};
  mutate(d);assert.equal(score(d).state,'INVALID_EVIDENCE');
 }
});
test('review time cannot substitute for a current source observation',()=>{
 for(const mutate of [d=>delete d.observation,d=>d.observation.at='2026-09-29T12:00:00Z',
   d=>d.observation.at='2026-09-30T13:30:00Z',d=>d.tasks[0].last_occurrence_at='2026-09-30T12:30:00Z']) {
  const d=fixture();mutate(d);assert.equal(score(d).state,'INVALID_EVIDENCE');
 }
 assert.equal(score(fixture()).source_observed_at,'2026-09-30T12:00:00.000Z');
 assert.equal(score(fixture()).target_state,'fixed_scope_mismatch');
});
test('weekly re-reads are idempotent and retain original observations plus current unknown readback',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'business-revision-'));fs.mkdirSync(path.join(dir,'data'),{mode:0o700});
 const file=path.join(dir,'data/business-automation-observations.json');
 try {
  const d=fixture();fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});
  const first=recordBusinessWeek({stateRoot:dir,coverage,now});assert.equal(first.new_runtime_measurement,true);
  d.review.at='2026-09-30T13:30:00Z';fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});
  const again=recordBusinessWeek({stateRoot:dir,coverage,now});assert.equal(again.new_runtime_measurement,false);
  assert.equal(again.point.observed_at,first.point.observed_at);
  fs.unlinkSync(file);const changed=structuredClone(coverage);changed.tasks.push({area:'company',task:'new',executor:'nobody'});
  const missing=recordBusinessWeek({stateRoot:dir,coverage:changed,now});assert.equal(missing.retained_prior_measurement,true);
  assert.equal(missing.point.actual.defined_tasks,2);assert.equal(missing.current_read.defined_tasks,3);
  assert.equal(missing.sustained_above_target,false);assert.equal(missing.current_read.state,'NO_EVIDENCE');
  const h=JSON.parse(fs.readFileSync(path.join(dir,'business-automation/weekly.json')));
  assert.equal(h.observations.length,2);assert.equal(h.observations[0].basis,'runtime_review');assert.equal(h.observations[1].basis,'unverified_read');
  assert.equal(JSON.stringify(again).includes('original-runtime-snapshot'),false);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('the same source receipt cannot be rewritten or relabeled as a new measurement',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'business-rewrite-'));fs.mkdirSync(path.join(dir,'data'),{mode:0o700});
 const file=path.join(dir,'data/business-automation-observations.json');
 try {
  const d=fixture();fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});recordBusinessWeek({stateRoot:dir,coverage,now});
  for(const mutate of [d=>d.observation.at='2026-09-30T12:30:00Z',d=>d.tasks[0].human_touches=1]) {
   const next=structuredClone(d);mutate(next);fs.writeFileSync(file,JSON.stringify(next),{mode:0o600});
   assert.throws(()=>recordBusinessWeek({stateRoot:dir,coverage,now}),/conflicting_runtime_review/);
  }
  const h=JSON.parse(fs.readFileSync(path.join(dir,'business-automation/weekly.json')));assert.equal(h.observations.length,1);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('sustained achievement rejects future windows, wrong denominator and current-scope replacement',()=>{
 assert.equal(targetSustained(targetPoints()),true);
 for(const mutate of [p=>p.forEach(v=>delete v.scope_key),p=>p[3].actual.source_observed_at='2026-11-02T01:00:00Z',
  p=>{p[0].actual.defined_tasks=193;p[0].actual.verified_full_automation_rate=179/193},p=>delete p[0].actual.window]) {
  const points=targetPoints();mutate(points);assert.equal(targetSustained(points),false);
 }
 const changed=structuredClone(targetCoverage);
 changed.tasks[0].task='synthetic replacement with the same task count';
 assert.equal(sustainedTarget(targetPoints(),targetPolicy,{now:targetNow,coverage:changed}),false);
});
test('past four-week achievement remains historical and never proves current maintenance without this week source',()=>{
 const points=targetPoints(),original=structuredClone(points);
 const assess=at=>sustainedTarget(points,targetPolicy,{now:new Date(at),coverage:targetCoverage});
 assert.equal(assess('2026-11-01T14:59:59Z'),true);
 assert.equal(assess('2026-11-01T15:00:00Z'),false); // Next Monday in JST, with no new source.
 assert.equal(assess('2026-12-01T01:00:00Z'),false);
 const reread=structuredClone(points);reread.at(-1).observed_at='2026-12-01T01:00:00Z';
 assert.equal(sustainedTarget(reread,targetPolicy,{now:new Date('2026-12-01T01:00:00Z'),coverage:targetCoverage}),false);
 assert.deepEqual(points,original);assert.equal(assess('2026-11-01T01:00:00Z'),true);
});
test('export refuses promoting the command reread timestamp to a source measurement',()=>{
 const d=base(),h=publicHistory(d);h.points[0].actual.source_observed_at=new Date(Date.parse(h.points[0].observed_at)-60000).toISOString();
 assert.throws(()=>exportWeeklyAggregates(h,d),/runtime_source_time_mismatch/);
 delete h.points[0].actual.source_observed_at;assert.throws(()=>exportWeeklyAggregates(h,d),/runtime_source_time_mismatch/);
 const rendered=privateWeeklyChart(h,d);assert.match(rendered,/週次の実運用証拠は未確認/);
});

test('both fixed task sets match public baseline and executor-only changes preserve scope',()=>{
 assert.deepEqual(businessScope(targetCoverage),targetPolicy.fixed_scope);
 assert.equal(fixedScopeAssessment(targetCoverage).matches_target_scope,true);
 const decorated=structuredClone(targetPolicy);decorated.fixed_scope.private_note='never-copy-extra-policy-field';
 assert.equal(JSON.stringify(fixedScopeAssessment(targetCoverage,decorated)).includes('never-copy-extra-policy-field'),false);
 const classified=structuredClone(targetCoverage);classified.tasks[0].executor='human_only';
 assert.equal(fixedScopeAssessment(classified).matches_target_scope,true);
 const swapped=structuredClone(targetCoverage),out=swapped.tasks.findIndex(t=>t.executor==='intentional_no');
 swapped.tasks[out].executor='human_only';swapped.tasks[0].executor='intentional_no';
 assert.equal(businessScope(swapped).defined_tasks,192);assert.equal(businessScope(swapped).excluded_tasks,11);
 assert.equal(fixedScopeAssessment(swapped).matches_target_scope,false);
});
test('current goal remains unverified on absent operational evidence and auxiliary metrics give no credit',()=>{
 const status=businessStatus({coverage:targetCoverage,observations:null,now:targetNow});
 assert.equal(status.actual.state,'NO_EVIDENCE');assert.equal(status.actual.verified_full_automation_rate,null);
 assert.equal(status.actual.verified_full_tasks,0);assert.equal(status.actual.unknown_tasks,192);
 assert.equal(status.current_goal.minimum_automated_tasks,179);assert.equal(status.current_goal.state,'runtime_unverified');
 assert.equal(status.current_goal.runtime_execution_credit,0);assert.equal(status.current_goal.scope.matches_target_scope,true);
});
test('single-window assessment requires verified method, fixed measured scope, exact arithmetic and source observation',()=>{
 const actual=targetPoints()[0].actual;
 const qualified=currentGoalAssessment(actual,targetCoverage,{now:targetNow});
 assert.equal(qualified.one_window_qualified,true);assert.equal(qualified.evidence_basis,'exact_runtime_rate');
 const invalidTime=currentGoalAssessment(actual,targetCoverage,{now:new Date('invalid')});
 assert.equal(invalidTime.one_window_qualified,false);assert.equal(invalidTime.confirmed_rate_lower_bound,null);
 for(const mutate of [a=>delete a.measurement_contract,a=>delete a.measurement_scope,
  a=>a.measurement_scope.included_scope_key='a'.repeat(64),a=>a.measurement_scope.excluded_scope_key='a'.repeat(64),
  a=>a.verified_full_tasks=178,a=>a.unknown_tasks=1,a=>a.confirmed_full_automation_lower_bound=.99,
  a=>delete a.source_observed_at,a=>a.source_observed_at='2026-11-02T01:00:00Z',
  a=>a.window.through='2026-10-06',a=>a.scope_completeness='not_attested']) {
  const a=structuredClone(actual);mutate(a);assert.equal(currentGoalAssessment(a,targetCoverage,{now:targetNow}).one_window_qualified,false);
 }
 for(const policy of [undefined,null,targetPolicy.previous_policy.policy_id]) {
  const a=structuredClone(actual);if(policy===undefined)delete a.policy_id;else a.policy_id=policy;
  assert.equal(currentGoalAssessment(a,targetCoverage,{now:targetNow}).one_window_qualified,true);
 }
});
test('invalid count or rate arithmetic has no assessment basis or displayed lower bound, while valid178 remains below target',()=>{
 const original=targetPoints()[0].actual;
 for(const mutate of [
  a=>{a.verified_full_tasks=193;a.verified_full_automation_rate=193/192;a.confirmed_full_automation_lower_bound=193/192;},
  a=>{a.verified_full_tasks=179.5;a.verified_full_automation_rate=179.5/192;a.confirmed_full_automation_lower_bound=179.5/192;},
  a=>{a.verified_full_tasks=NaN;a.verified_full_automation_rate=NaN;a.confirmed_full_automation_lower_bound=NaN;},
  a=>{a.state='PARTIAL_EVIDENCE';a.unknown_tasks=14;a.verified_full_automation_rate=null;},
  a=>a.confirmed_full_automation_lower_bound=.99,
  a=>{a.state='PARTIAL_EVIDENCE';a.unknown_tasks=13;a.verified_full_automation_rate=179/192;},
  a=>{a.verified_full_tasks=-1;a.verified_full_automation_rate=-1/192;a.confirmed_full_automation_lower_bound=-1/192;},
 ]) {
  const invalid=structuredClone(original);mutate(invalid);
  const goal=currentGoalAssessment(invalid,targetCoverage,{now:targetNow});
  assert.equal(goal.one_window_qualified,false);assert.equal(goal.state,'runtime_arithmetic_unverified');
  assert.equal(goal.evidence_basis,null);assert.equal(goal.confirmed_rate_lower_bound,null);
  assert.equal(goal.exact_rate_confirmed,false);
 }
 const below=currentGoalAssessment(targetPoints(178)[0].actual,targetCoverage,{now:targetNow});
 assert.equal(below.state,'below_target');assert.equal(below.one_window_qualified,false);
 assert.equal(below.evidence_basis,'exact_runtime_rate');assert.equal(below.confirmed_rate_lower_bound,178/192);
 assert.equal(below.exact_rate_confirmed,true);
});
test('old measured arithmetic is retained but cannot qualify for the current fixed goal',()=>{
 const d=fixture(),legacy=score(d);
 assert.equal(legacy.state,'MEASURED');assert.equal(legacy.verified_full_automation_rate,1);
 assert.equal(legacy.policy_id,null);assert.equal(legacy.target_state,'fixed_scope_mismatch');
});
test('policy cannot lower93, redefine the192 cohort, remove11 or backdate activation',()=>{
 for(const mutate of [p=>p.target.at_least=.9,p=>p.fixed_scope.defined_tasks=191,p=>p.fixed_scope.excluded_tasks=12,
  p=>p.fixed_scope.included_scope_key='a'.repeat(64),p=>p.fixed_scope.excluded_scope_key='a'.repeat(64),
  p=>p.effective_at='2026-10-01T00:00:00Z',p=>p.previous_policy.retroactive_credit=true]) {
  const p=structuredClone(targetPolicy);mutate(p);assert.deepEqual(validateBusinessPolicy(p),['business_policy']);
 }
});

const fixedRuntimeFixture=(full=179,remaining='unimplemented')=>{
 const inScope=targetCoverage.tasks.filter(t=>t.executor!=='intentional_no');
 return {schema_version:1,policy_id:targetPolicy.policy_id,window:{from:'2026-09-08',through:'2026-10-05'},
  observation:{kind:'runtime_source_snapshot',at:'2026-10-05T01:00:00Z',evidence_ref:'synthetic-fixed-runtime'},
  review:{kind:'human',at:'2026-10-05T01:30:00Z',evidence_ref:'synthetic-review'},
  scope:{company_wide_complete:true,evidence_ref:'synthetic-corporate-census'},
  tasks:inScope.map((t,i)=>i>=full?{task_id:businessTaskId(t),state:remaining,evidence_ref:'synthetic-not-implemented'}
   :{...observed(t),source_window:{from:'2026-09-08',through:'2026-10-05'},last_occurrence_at:'2026-10-05T00:00:00Z'})};
};
const fixedScore=d=>measuredBusinessRates(d,targetCoverage,{now:new Date('2026-10-05T02:00:00Z')});
const datedRuntimeFixture=(full,remaining,day,sourceHour='01')=>{
 const d=fixedRuntimeFixture(full,remaining),window={from:new Date(Date.parse(day)-27*86400000).toISOString().slice(0,10),through:day};
 d.window=window;d.observation.at=`${day}T${sourceHour}:00:00Z`;d.review.at=`${day}T${sourceHour}:30:00Z`;
 d.observation.evidence_ref=`synthetic-source-${day}-${sourceHour}`;
 for(const task of d.tasks) if(task.state==='observed') {task.source_window=window;task.last_occurrence_at=day+'T00:00:00Z';}
 return d;
};
test('synthetic full fixed-cohort evidence qualifies179 but unimplemented13 stays in192',()=>{
 const admitted=fixedScore(fixedRuntimeFixture());
 assert.equal(admitted.state,'MEASURED');assert.equal(admitted.verified_full_tasks,179);
 assert.equal(admitted.defined_tasks,192);assert.equal(admitted.diagnostics.unimplemented_tasks,13);
 assert.equal(admitted.measurement_contract,BUSINESS_MEASUREMENT_CONTRACT);assert.deepEqual(admitted.measurement_scope,targetPolicy.fixed_scope);
 assert.equal(admitted.target_state,'one_window_at_target');assert.equal(fixedScore(fixedRuntimeFixture(178)).target_state,'below_target');
});
test('179 proven six-stage completions with13 unknown preserve null exact rate and qualify only by the conservative lower bound',()=>{
 const doc=fixedRuntimeFixture(179,'unknown'),before=structuredClone(doc),actual=fixedScore(doc);
 const goal=currentGoalAssessment(actual,targetCoverage,{now:targetNow});
 assert.equal(actual.state,'PARTIAL_EVIDENCE');assert.equal(actual.verified_full_tasks,179);
 assert.equal(actual.unknown_tasks,13);assert.equal(actual.defined_tasks,192);
 assert.equal(actual.verified_full_automation_rate,null);assert.equal(actual.verified_ai_utilization_rate,null);
 assert.equal(actual.confirmed_full_automation_lower_bound,179/192);assert.equal(actual.possible_full_automation_upper_bound,1);
 assert.equal(actual.target_state,'one_window_at_target');assert.equal(goal.one_window_qualified,true);
 assert.equal(goal.evidence_basis,'confirmed_runtime_lower_bound');assert.deepEqual(doc,before);
 const below=fixedScore(fixedRuntimeFixture(178,'unknown'));
 assert.equal(below.unknown_tasks,14);assert.equal(below.verified_full_automation_rate,null);
 assert.equal(currentGoalAssessment(below,targetCoverage,{now:targetNow}).one_window_qualified,false);
 const missingCompany=fixedRuntimeFixture(179,'unknown');delete missingCompany.scope;
 assert.equal(currentGoalAssessment(fixedScore(missingCompany),targetCoverage,{now:targetNow}).one_window_qualified,false);
 for(const mutate of [a=>delete a.measurement_contract,a=>delete a.measurement_scope,
  a=>a.measurement_scope.defined_tasks=191,a=>a.measurement_scope.excluded_scope_key='a'.repeat(64),
  a=>a.confirmed_full_automation_lower_bound=.94,a=>a.verified_full_automation_rate=179/192,
  a=>a.state='MEASURED',a=>a.verified_full_tasks=180,a=>delete a.window]) {
  const forged=structuredClone(actual);mutate(forged);
  assert.equal(currentGoalAssessment(forged,targetCoverage,{now:targetNow}).one_window_qualified,false);
 }
});
test('fixed runtime evidence never converts missing execution, approvals, failure or unknown stages to completion',()=>{
 for(const mutate of [t=>t.human_touches=1,t=>t.stages.decide='human',t=>t.all_occurrences_succeeded=false]) {
  const d=fixedRuntimeFixture();mutate(d.tasks[0]);const a=fixedScore(d);
  assert.equal(a.verified_full_tasks,178);assert.equal(a.target_state,'below_target');
 }
 const partial=fixedRuntimeFixture();partial.tasks[0].stages.verify='unknown';
 assert.equal(fixedScore(partial).verified_full_automation_rate,null);assert.equal(fixedScore(partial).unknown_tasks,1);
 const pending=fixedRuntimeFixture();pending.tasks[0]={task_id:pending.tasks[0].task_id,state:'not_due'};
 assert.equal(fixedScore(pending).verified_full_automation_rate,null);assert.equal(fixedScore(pending).unknown_tasks,1);
});
test('raw originals passing the six-stage method retain old or missing labels without losing threshold evidence',()=>{
 for(const id of [undefined,targetPolicy.previous_policy.policy_id]) {
  const d=fixedRuntimeFixture();if(id===undefined)delete d.policy_id;else d.policy_id=id;
  const a=fixedScore(d);assert.equal(a.verified_full_tasks,179);assert.equal(a.verified_full_automation_rate,179/192);
  assert.equal(a.target_state,'one_window_at_target');assert.equal(a.policy_id,id??null);
  assert.equal(a.measurement_contract,BUSINESS_MEASUREMENT_CONTRACT);
 }
});
test('same-quality raw proof before policy declaration retains its source time and creates no new observation',()=>{
 const doc=fixedRuntimeFixture(179,'unknown'),window={from:'2026-09-03',through:'2026-09-30'};
 doc.policy_id=targetPolicy.previous_policy.policy_id;doc.window=window;
 doc.observation.at='2026-09-30T12:00:00Z';doc.review.at='2026-09-30T13:00:00Z';
 for(const t of doc.tasks) if(t.state==='observed') {t.source_window=window;t.last_occurrence_at='2026-09-30T01:00:00Z';}
 const before=structuredClone(doc),a=measuredBusinessRates(doc,targetCoverage,{now});
 assert.equal(a.target_state,'one_window_at_target');assert.equal(a.source_observed_at,'2026-09-30T12:00:00.000Z');
 assert.equal(a.policy_id,targetPolicy.previous_policy.policy_id);assert.equal(a.unknown_tasks,13);
 assert.equal(a.verified_full_automation_rate,null);assert.deepEqual(doc,before);
 assert(!Object.hasOwn(a,'new_runtime_measurement'));
});
test('weekly receipts preserve current policy and both fixed sets without exposing the source reference',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'business-fixed-history-'));fs.mkdirSync(path.join(dir,'data'),{mode:0o700});
 const file=path.join(dir,'data/business-automation-observations.json'),at=new Date('2026-10-05T02:00:00Z');
 try {
  const d=fixedRuntimeFixture();fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});
  const recorded=recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:at});
  assert.equal(recorded.point.policy_id,targetPolicy.policy_id);
  assert.equal(recorded.point.scope_key,targetPolicy.fixed_scope.included_scope_key);
  assert.equal(recorded.point.excluded_scope_key,targetPolicy.fixed_scope.excluded_scope_key);
  assert.equal(recorded.point.observed_at,'2026-10-05T01:00:00.000Z');
  assert.equal(recorded.sustained_above_target,false);assert.equal(recorded.new_runtime_measurement,true);
  assert.equal(JSON.stringify(recorded).includes(d.observation.evidence_ref),false);
  const h=JSON.parse(fs.readFileSync(path.join(dir,'business-automation/weekly.json')));
  assert.equal(h.observations[0].policy_id,targetPolicy.policy_id);
  assert.equal(h.observations[0].excluded_scope_key,targetPolicy.fixed_scope.excluded_scope_key);
  assert.equal(h.observations[0].actual.measurement_contract,BUSINESS_MEASUREMENT_CONTRACT);
  assert.deepEqual(h.observations[0].actual.measurement_scope,targetPolicy.fixed_scope);
  d.policy_id=targetPolicy.previous_policy.policy_id;fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});
  assert.throws(()=>recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:at}),/conflicting_runtime_review/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('a later real source with179 confirmed plus13 unknown can complete four weeks after an earlier exact178 read',()=>{
 for(const corporateComplete of [true,false]) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'business-new-lower-bound-'));fs.mkdirSync(path.join(dir,'data'),{mode:0o700});
  const file=path.join(dir,'data/business-automation-observations.json'),historyFile=path.join(dir,'business-automation/weekly.json');
  try {
   for(const day of ['2026-10-05','2026-10-12','2026-10-19']) {
    fs.writeFileSync(file,JSON.stringify(datedRuntimeFixture(179,'unimplemented',day)),{mode:0o600});
    recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:new Date(day+'T02:00:00Z')});
   }
   const day='2026-10-26',morning=datedRuntimeFixture(178,'unimplemented',day);
   fs.writeFileSync(file,JSON.stringify(morning),{mode:0o600});
   const before=recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:new Date(day+'T02:00:00Z')});
   assert.equal(before.point.actual.state,'MEASURED');assert.equal(before.point.actual.verified_full_tasks,178);
   assert.equal(before.sustained_above_target,false);
   const history=JSON.parse(fs.readFileSync(historyFile));
   const originalSnapshot=structuredClone(history.observations.find(o=>o.measurement_ref===morning.observation.evidence_ref));
   const late=datedRuntimeFixture(179,'unknown',day,'03');
   if(!corporateComplete)delete late.scope;
   fs.writeFileSync(file,JSON.stringify(late),{mode:0o600});
   const result=recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:new Date(day+'T04:00:00Z')});
   const after=JSON.parse(fs.readFileSync(historyFile));
   assert.equal(result.new_runtime_measurement,true);assert.equal(result.sustained_above_target,corporateComplete);
   assert.equal(result.retained_prior_measurement,!corporateComplete);
   assert.deepEqual(after.observations.find(o=>o.measurement_ref===morning.observation.evidence_ref),originalSnapshot);
   assert(after.observations.some(o=>o.measurement_ref===late.observation.evidence_ref));
   if(corporateComplete) {
    assert.equal(result.point.actual.state,'PARTIAL_EVIDENCE');assert.equal(result.point.actual.verified_full_tasks,179);
    assert.equal(result.point.actual.unknown_tasks,13);assert.equal(result.point.actual.verified_full_automation_rate,null);
    assert.equal(result.point.current_goal.evidence_basis,'confirmed_runtime_lower_bound');
    assert.equal(result.point.observed_at,day+'T03:00:00.000Z');
   } else {
    assert.deepEqual(result.point,before.point);assert.equal(result.current_read.state,'PARTIAL_EVIDENCE');
    assert.equal(result.current_read.scope_completeness,'not_attested');
   }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
 }
});
test('pre-metadata receipts and old90 verdicts stay immutable on reread and cannot be relabeled to93',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'business-legacy-history-'));fs.mkdirSync(path.join(dir,'data'),{mode:0o700});
 const file=path.join(dir,'data/business-automation-observations.json'),historyFile=path.join(dir,'business-automation/weekly.json');
 const at=new Date('2026-10-05T02:00:00Z');
 try {
  const d=fixedRuntimeFixture();delete d.policy_id;fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});
  recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:at});
  const history=JSON.parse(fs.readFileSync(historyFile));
  for(const aggregate of [history.points[0],history.observations[0]]) {
   delete aggregate.policy_id;delete aggregate.excluded_scope_key;delete aggregate.actual.policy_id;
   delete aggregate.actual.measurement_contract;delete aggregate.actual.measurement_scope;
   aggregate.actual.target_state='one_window_above_target';
  }
  delete history.points[0].current_goal;
  fs.writeFileSync(historyFile,JSON.stringify(history),{mode:0o600});
  const legacy=structuredClone(history);
  d.policy_id=targetPolicy.policy_id;fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});
  const reread=recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:at});
  assert.equal(reread.new_runtime_measurement,false);assert.equal(reread.retained_prior_measurement,true);
  assert.equal(reread.sustained_above_target,false);assert.deepEqual(reread.point,legacy.points[0]);
  assert.equal(currentGoalAssessment(reread.point.actual,targetCoverage,{now:at}).one_window_qualified,false);
  assert.deepEqual(JSON.parse(fs.readFileSync(historyFile)),legacy);
  d.tasks[0].human_touches=1;fs.writeFileSync(file,JSON.stringify(d),{mode:0o600});
  assert.throws(()=>recordBusinessWeek({stateRoot:dir,coverage:targetCoverage,now:at}),/conflicting_runtime_review/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
