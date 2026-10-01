import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {businessPolicy,businessTaskId,inventoryBusinessRates,measuredBusinessRates,sustainedTarget,weekKey,recordBusinessWeek,validateBusinessPolicy} from '../growth/lib/business-automation.mjs';
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
test('full chain, native origin and complete trigger/human coverage admit machine gates',()=>{const s=score(fixture());assert.equal(s.state,'MEASURED');assert.equal(s.verified_full_automation_rate,1);});
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
test('90% exactly, interrupted weeks or denominator changes do not prove sustained >90%',()=>{
  const points=['2026-09-07','2026-09-14','2026-09-21','2026-09-28'].map(week=>({week,scope_key:'a'.repeat(64),actual:{state:'MEASURED',scope_completeness:'attested',defined_tasks:100,unknown_tasks:0,verified_full_tasks:91,verified_full_automation_rate:.91,source_observed_at:week+'T01:00:00Z',window:{from:new Date(Date.parse(week)-27*86400000).toISOString().slice(0,10),through:week}}}));assert.equal(sustainedTarget(points),true);
 for(const mutate of [p=>p[0].actual.verified_full_automation_rate=.9,p=>p[0].scope_key='changed',p=>p[0].week='2026-08-31',p=>p[0].actual.state='PARTIAL_EVIDENCE',p=>p[0].actual.scope_completeness='not_attested']){const p=structuredClone(points);mutate(p);assert.equal(sustainedTarget(p),false);}
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
 assert.match(svg,/100%/);assert.match(svg,/欠測は0%ではありません/);assert.match(svg,/90%/);
 const h={points:[{week:'2026-09-28',as_of:'2026-09-30',scope_key:'fixed',observed_at:'2026-09-30T14:00:00.000Z',inventory:{overall:{declared_execution_rate:.8,declared_ai_utilization_rate:.9}},actual:{source_observed_at:'2026-09-30T14:00:00.000Z',verified_full_automation_rate:.5,verified_ai_utilization_rate:.9},private_note:'private-input-do-not-copy'}]};
 const rendered=privateWeeklyChart(h,d);assert.equal(rendered.includes('private-input-do-not-copy'),false);assert.equal(rendered.includes('週次の実運用証拠は未確認'),false);
});
const base=()=>JSON.parse(fs.readFileSync(new URL('../data/business-automation-weekly.json',import.meta.url)));
const publicHistory=d=>{
 const p=d.points.at(-1),n=p.inventory.defined_tasks;
 return {schema_version:1,points:[{week:p.week,as_of:d.through,observed_at:d.generated_at,scope_key:p.inventory.scope_fingerprint,
  inventory:{inventory_measured_at:p.inventory.inventory_measured_at,overall:{defined:n,ai_executes:p.inventory.ai_executes,counts:{ai_proposes:p.inventory.ai_proposes}}},
  actual:{state:'MEASURED',source_observed_at:d.generated_at,window:{from:'2026-09-03',through:'2026-09-30'},scope_completeness:'not_attested',defined_tasks:n,unknown_tasks:0,
   verified_full_tasks:164,verified_ai_utilization_tasks:171,verified_full_automation_rate:164/n,verified_ai_utilization_rate:171/n,observed_work_saved_rate:null},
  private_ref:'never-publish-this-original-reference',private_note:'never-publish-this-note'}]};
};
test('public export whitelists aggregate fields, admits arithmetic and preserves missing March',()=>{
 const d=base(),h=publicHistory(d),e=exportWeeklyAggregates(h,d);
 assert.deepEqual(validateWeeklySeries(e),[]);assert.equal(e.points[0].actual.verified_full_automation_rate,null);
 assert.equal(e.points.at(-1).actual.verified_full_automation_rate,164/192);
 assert.equal(JSON.stringify(e).includes('never-publish'),false);
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
 const e=exportWeeklyAggregates(h,d);assert.equal(JSON.stringify(e).includes('never-publish-window-reference'),false);
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
 assert.equal(score(fixture()).target_state,'scope_unverified_above_threshold');
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
test('sustained achievement rejects missing identity, future windows and changing cohort size',()=>{
 const points=['2026-09-07','2026-09-14','2026-09-21','2026-09-28'].map(week=>({week,scope_key:'a'.repeat(64),actual:{state:'MEASURED',scope_completeness:'attested',defined_tasks:100,unknown_tasks:0,verified_full_tasks:91,verified_full_automation_rate:.91,source_observed_at:week+'T01:00:00Z',window:{from:new Date(Date.parse(week)-27*86400000).toISOString().slice(0,10),through:week}}}));
 assert.equal(sustainedTarget(points,businessPolicy(),{now}),true);
 for(const mutate of [p=>p.forEach(v=>delete v.scope_key),p=>p[0].actual.source_observed_at='2026-10-05T01:00:00Z',
   p=>{p[0].actual.defined_tasks=101;p[0].actual.verified_full_automation_rate=91/101},p=>delete p[0].actual.window]) {
  const p=structuredClone(points);mutate(p);assert.equal(sustainedTarget(p,businessPolicy(),{now}),false);
 }
});
test('export refuses promoting the command reread timestamp to a source measurement',()=>{
 const d=base(),h=publicHistory(d);h.points[0].actual.source_observed_at=new Date(Date.parse(h.points[0].observed_at)-60000).toISOString();
 assert.throws(()=>exportWeeklyAggregates(h,d),/runtime_source_time_mismatch/);
 delete h.points[0].actual.source_observed_at;assert.throws(()=>exportWeeklyAggregates(h,d),/runtime_source_time_mismatch/);
 const rendered=privateWeeklyChart(h,d);assert.match(rendered,/週次の実運用証拠は未確認/);
});
