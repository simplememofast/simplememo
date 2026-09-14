import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {registerGoalFollowup,goalWake as rawGoalWake,acknowledgeGoalWake} from './company-goal-followup.mjs';
import {atomicJson,privateState} from './company-loop.mjs';
const target='11111111-1111-1111-1111-111111111111',sender='22222222-2222-2222-2222-222222222222';
const integration='33333333-3333-3333-3333-333333333333',experimentId='appsflyer-native-consumer-'+integration;
const date='2026-09-13T06:57:14Z',due='2026-09-20T06:57:14Z';
const origin=()=>({state:'native_execution_record',automation_id:'obsidian',thread_id:sender});
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const turn=thread=>thread.replace('-2222-2222-','-4444-4444-');
function nativeState(thread) {
  const day=thread===sender?14:Number(thread.slice(0,2));
  return {thread_id:thread,automation_id:'obsidian',original_turn_id:turn(thread),observed_at:'2026-10-01T00:00:00Z',
    original_turn:{turn_id:turn(thread),started_at:`2026-09-${day}T00:00:00Z`,finished_at:`2026-09-${day}T01:00:00Z`,state:'completed'},
    gate_receipt:{admitted:true,thread_id:thread,turn_id:turn(thread),sha256:digest(thread+'gate'),observed_at:`2026-09-${day}T00:00:00Z`},
    transcript_sha256:digest(thread+'transcript')};
}
const goalWake=args=>rawGoalWake({readThread:nativeState,readGrowth:()=>({events:[],failures:[]}),...args});
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'company-goal-test-'));fs.chmodSync(root,0o700);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  atomicJson(path.join(root,'GOAL_STATE.json'),{native_goal_thread:target,status:'IN_PROGRESS',objective:'Complete docs/autonomy/RESIDUAL_OPERATIONS_GOAL.md'});
  atomicJson(path.join(root,'operational-experiments.json'),{schema_version:1,experiments:[{id:experimentId,integration_run:integration,date,evaluation_date:due,minimum_distinct_native_days:7,status:'RUNNING'}]});
  const events=privateState(path.join(root,'data/collection-events'));
  registerGoalFollowup({stateRoot:root,experimentId,thread:target,now:new Date(date)});
  return {root,events};
}
function event(day,thread=sender) {return {schema_version:1,observed_at:`2026-09-${day}T00:00:00Z`,native_origin:{...origin(),thread_id:thread,
  original_turn_id:turn(thread),gate_receipt_sha256:digest(thread+'gate')},receipts:[{source:'appsflyer',receipt:{status:'verified'}}]};}
test('manual observations and elapsed dates cannot wake a Goal; no registration stays compatible',t=>{
  const {root,events}=fixture(t);
  atomicJson(path.join(events,'manual.json'),{...event(14),native_origin:{state:'not_a_recorded_automation_run'}});
  const result=goalWake({stateRoot:root,now:new Date('2026-10-01T00:00:00Z'),reserve:true,origin});
  assert.equal(result.status,'waiting_for_native_evidence');assert.equal(fs.existsSync(path.join(root,'goal-wake-events')),false);
  fs.unlinkSync(path.join(root,'goal-followup-target.json'));fs.unlinkSync(path.join(root,'GOAL_STATE.json'));
  assert.equal(goalWake({stateRoot:root}).status,'not_registered');
});
test('actual first evidence permits one reserved send, excludes manual dispatch and requires target acknowledgement',t=>{
  const {root,events}=fixture(t),now=new Date('2026-09-14T01:00:00Z');atomicJson(path.join(events,'native.json'),event(14));
  assert.equal(goalWake({stateRoot:root,now}).status,'ready');
  assert.throws(()=>goalWake({stateRoot:root,now,reserve:true,origin:()=>({state:'not_a_recorded_automation_run'})}),/admitted/);
  const first=goalWake({stateRoot:root,now,reserve:true,origin});assert.equal(first.status,'dispatch_once');
  assert.equal(goalWake({stateRoot:root,now,reserve:true,origin}).status,'reconcile_delivery');
  assert.throws(()=>acknowledgeGoalWake({stateRoot:root,eventId:first.event_id,thread:sender,now}),/receiving/);
  assert.equal(acknowledgeGoalWake({stateRoot:root,eventId:first.event_id,thread:target,now}).status,'received');
  assert.equal(goalWake({stateRoot:root,now,reserve:true,origin}).status,'already_received');
  const stored=JSON.parse(fs.readFileSync(path.join(root,'goal-wake-events',first.event_id+'.json')));assert.equal(stored.goal_completed,false);assert.match(stored.acknowledgement,/agent_reported/);
});
test('seven days require seven distinct native threads and maturity, not repeated calls or a stored WIN',t=>{
  const {root,events}=fixture(t),now=new Date('2026-09-20T08:00:00Z');
  for(let day=14;day<=20;day++)atomicJson(path.join(events,day+'.json'),event(14));
  let r=goalWake({stateRoot:root,now});assert.equal(r.milestone,'first_native_collection');
  for(let day=14;day<=20;day++)atomicJson(path.join(events,day+'.json'),event(day,`${String(day).repeat(4)}-2222-2222-2222-222222222222`));
  r=goalWake({stateRoot:root,now:new Date('2026-09-20T01:00:00Z')});assert.equal(r.milestone,'first_native_collection');
  r=goalWake({stateRoot:root,now,reserve:true,origin});assert.equal(r.status,'dispatch_once');
  const stored=JSON.parse(fs.readFileSync(path.join(root,'goal-wake-events',r.event_id+'.json')));
  assert.equal(stored.milestone,'seven_native_days');assert.equal(stored.evaluation.distinct_days,7);
  assert.equal(fs.readdirSync(path.join(root,'goal-wake-events')).length,1);
  for(const file of fs.readdirSync(events))fs.unlinkSync(path.join(events,file));
  const ledger=JSON.parse(fs.readFileSync(path.join(root,'operational-experiments.json')));ledger.experiments[0].status='WIN';atomicJson(path.join(root,'operational-experiments.json'),ledger);
  assert.equal(goalWake({stateRoot:root,now}).status,'reconcile_delivery','missing source cannot erase an uncertain send');
  acknowledgeGoalWake({stateRoot:root,eventId:r.event_id,thread:target,now});
  assert.equal(goalWake({stateRoot:root,now}).status,'waiting_for_native_evidence','stored WIN is not native evidence');
});
test('future, missing gate and malformed evidence do not attest a milestone or erase another source',t=>{
  const {root,events}=fixture(t),now=new Date('2026-09-14T01:00:00Z');
  atomicJson(path.join(events,'future.json'),event(20));const invalid=event(14);delete invalid.native_origin.gate_receipt_sha256;
  atomicJson(path.join(events,'invalid.json'),invalid);assert.equal(goalWake({stateRoot:root,now}).status,'native_evidence_unverified');
  fs.writeFileSync(path.join(events,'corrupt.json'),'{bad');
  const failed=goalWake({stateRoot:root,now});assert.equal(failed.status,'native_evidence_unverified');
  assert.ok(failed.failures.some(f=>f.reason==='native_evidence_read_or_validation_failed'));
  assert.equal(fs.existsSync(path.join(root,'goal-wake-events')),false);
});
test('shaped native claims require matching authoritative owner, original turn, gate and lifecycle',t=>{
  const {root,events}=fixture(t),now=new Date('2026-09-14T02:00:00Z');atomicJson(path.join(events,'native.json'),event(14));
  for(const mutate of [s=>({...s,automation_id:'different'}),s=>({...s,original_turn_id:target}),s=>({...s,gate_receipt:{...s.gate_receipt,admitted:false}}),
    s=>({...s,gate_receipt:{...s.gate_receipt,sha256:'a'.repeat(64)}}),s=>({...s,original_turn:{...s.original_turn,finished_at:'2026-09-13T23:59:59Z'}}),
    s=>({...s,gate_receipt:{...s.gate_receipt,observed_at:'2026-09-14T00:00:01Z'}}),()=>null]) {
    const r=goalWake({stateRoot:root,now,reserve:true,origin,readThread:t=>mutate(nativeState(t))});
    assert.equal(r.status,'native_evidence_unverified');assert.equal(r.failures.length,1);
  }
  const r=goalWake({stateRoot:root,now,readThread:()=>{throw new Error('missing transcript')}});assert.equal(r.status,'native_evidence_unverified');
  assert.equal(fs.existsSync(path.join(root,'goal-wake-events')),false);
});
test('registration cannot retarget another host thread or relax the seven-day experiment',t=>{
  const {root}=fixture(t);assert.equal(registerGoalFollowup({stateRoot:root,experimentId,thread:target}).status,'already_registered');
  assert.throws(()=>registerGoalFollowup({stateRoot:root,experimentId,thread:sender}),/Only/);
  const doc=JSON.parse(fs.readFileSync(path.join(root,'operational-experiments.json')));doc.experiments[0].minimum_distinct_native_days=1;atomicJson(path.join(root,'operational-experiments.json'),doc);
  assert.throws(()=>goalWake({stateRoot:root}),/seven-day/);
});
const growthEvent=(milestone='verified_growth_delivery')=>({milestone,experiment_id:'fixture-growth',identity:digest(milestone),
  occurred_at:'2026-09-14T00:00:00Z',native_origin:origin(),native_proof:{native_transcript_sha256:digest('transcript')},
  source_main_sha:'a'.repeat(40),evidence:{receipt_sha256:digest('receipt')}});
test('received collection does not starve Growth delivery or review and pending transport reconciles first',t=>{
  const {root,events}=fixture(t),now=new Date('2026-09-14T01:00:00Z');atomicJson(path.join(events,'native.json'),event(14));
  const first=goalWake({stateRoot:root,now,reserve:true,origin});
  const legacy=digest(JSON.stringify({thread:target,experiment:experimentId,milestone:'first_native_collection'}));
  assert.equal(first.event_id,legacy,'existing marker identity must remain unchanged');
  acknowledgeGoalWake({stateRoot:root,eventId:first.event_id,thread:target,now});
  const delivery=growthEvent(),review=growthEvent('reviewed_growth_measurement');
  const readGrowth=({excludeIdentities})=>({events:[delivery,review].filter(e=>!excludeIdentities.includes(e.identity)),failures:[]});
  const sent=goalWake({stateRoot:root,now,reserve:true,origin,readGrowth});assert.equal(sent.status,'dispatch_once');
  const record=JSON.parse(fs.readFileSync(path.join(root,'goal-wake-events',sent.event_id+'.json')));
  assert.equal(record.milestone,delivery.milestone);assert.equal(record.identity,delivery.identity);assert.equal(record.goal_completed,false);
  const pending=goalWake({stateRoot:root,now,reserve:true,origin,readGrowth:()=>{throw new Error('must reconcile first');}});
  assert.equal(pending.status,'reconcile_delivery');assert.equal(pending.event_id,sent.event_id);
  acknowledgeGoalWake({stateRoot:root,eventId:sent.event_id,thread:target,now});
  const next=goalWake({stateRoot:root,now,reserve:true,origin,readGrowth});assert.equal(next.status,'dispatch_once');
  assert.notEqual(next.event_id,sent.event_id);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'goal-wake-events',next.event_id+'.json'))).milestone,review.milestone);
  acknowledgeGoalWake({stateRoot:root,eventId:next.event_id,thread:target,now});
  assert.equal(goalWake({stateRoot:root,now,reserve:true,origin,readGrowth}).status,'already_received');
});
test('independent Growth evidence progresses while a failed collection remains visible without seven-day credit',t=>{
  const {root,events}=fixture(t),now=new Date('2026-09-20T08:00:00Z');fs.writeFileSync(path.join(events,'bad.json'),'{bad');
  const readGrowth=()=>({events:[growthEvent()],failures:[{source:'other_growth',reason:'missing_review'}]});
  const result=goalWake({stateRoot:root,now,reserve:true,origin,readGrowth});assert.equal(result.status,'dispatch_once');
  const stored=JSON.parse(fs.readFileSync(path.join(root,'goal-wake-events',result.event_id+'.json')));
  assert.equal(stored.milestone,'verified_growth_delivery');assert.equal(stored.evaluation,null);
  assert.equal(stored.source_failures.length,2);assert.equal(result.failures.length,2);
});
test('retained Growth identity corruption is rejected and terminal Goals remain quiet',t=>{
  const {root}=fixture(t),now=new Date('2026-09-14T01:00:00Z'),readGrowth=()=>({events:[growthEvent()],failures:[]});
  const sent=goalWake({stateRoot:root,now,reserve:true,origin,readGrowth}),file=path.join(root,'goal-wake-events',sent.event_id+'.json');
  const record=JSON.parse(fs.readFileSync(file));record.identity=digest('changed');atomicJson(file,record);
  assert.throws(()=>goalWake({stateRoot:root,now,readGrowth}),/identity changed/);
  const state=JSON.parse(fs.readFileSync(path.join(root,'GOAL_STATE.json')));state.status='COMPLETE';atomicJson(path.join(root,'GOAL_STATE.json'),state);
  assert.equal(goalWake({stateRoot:root,now,readGrowth:()=>{throw new Error('terminal Goal must not inspect');}}).status,'goal_not_pending');
});
test('a failed native proof is visible in the CLI without hiding independent follow-up results',t=>{
  const {root,events}=fixture(t);atomicJson(path.join(events,'unverified.json'),event(14));
  const result=JSON.parse(execFileSync(process.execPath,['scripts/company-os.mjs','follow-up','--state-root',root],
    {cwd:path.resolve(import.meta.dirname,'../..'),encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(result.goal_wake.status,'native_evidence_unverified');
  assert.ok(result.failures.some(f=>f.source==='goal_followup'));
  assert.equal(result.experiments.length,1);assert.deepEqual(result.growth.reviews,[]);
});
