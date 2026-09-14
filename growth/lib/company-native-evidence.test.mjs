import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {appsflyerConsumerEvidence} from './company-native-evidence.mjs';
import {auditObservation,observe,atomicJson,privateState} from './company-loop.mjs';
import {connectionView} from './company-data.mjs';

const thread='11111111-1111-1111-1111-111111111111',turn='22222222-2222-2222-2222-222222222222';
const now=new Date('2026-09-14T02:00:00Z');
const origin={state:'native_execution_record',automation_id:'obsidian',thread_id:thread,original_turn_id:turn,gate_receipt_sha256:'a'.repeat(64)};
const event={schema_version:1,observed_at:'2026-09-14T00:30:00Z',native_origin:origin,receipts:[{source:'appsflyer',receipt:{status:'verified'}}]};
const native={thread_id:thread,automation_id:'obsidian',original_turn_id:turn,observed_at:now.toISOString(),
  original_turn:{turn_id:turn,started_at:'2026-09-14T00:00:00Z',finished_at:'2026-09-14T01:00:00Z',state:'completed'},
  gate_receipt:{admitted:true,thread_id:thread,turn_id:turn,sha256:'a'.repeat(64),observed_at:'2026-09-14T00:01:00Z'},transcript_sha256:'b'.repeat(64)};
function fixture(t) {
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'company-handoff-test-'));fs.chmodSync(stateRoot,0o700);
  t.after(()=>fs.rmSync(stateRoot,{recursive:true,force:true}));
  const events=privateState(path.join(stateRoot,'data/collection-events'));
  privateState(path.join(stateRoot,'data/collection-receipts'));
  atomicJson(path.join(stateRoot,'scheduler-integration.json'),{integration_present:true});
  return {stateRoot,events,now,readThread:()=>structuredClone(native)};
}
function audit(connection) {
  return auditObservation({observed_at:now.toISOString(),automation:{failures:[],discovery_gaps:[]},failures:[],
    growth:{connections:{appsflyer:connection},experiments:[]}});
}
const warned=result=>result.report_only_handoffs.some(x=>x.startsWith('AppsFlyer'));

test('audit removes the stale handoff only after native source verification and keeps other handoffs',t=>{
  const f=fixture(t);atomicJson(path.join(f.events,'native.json'),event);
  atomicJson(path.join(f.events,'same-turn.json'),{...event,observed_at:'2026-09-14T00:31:00Z'});
  let reads=0;
  const connection=connectionView({...f,readThread:()=>{reads++;return native;}}).appsflyer;
  assert.equal(reads,1);assert.equal(connection.scheduled_consumer_verified,true);
  assert.equal(connection.scheduled_consumer_evidence.observed_native_runs,1);
  assert.equal(connection.scheduled_consumer_evidence.successful_native_runs,1);
  const result=audit(connection);assert.equal(warned(result),false);
  assert.deepEqual(result.report_only_handoffs,['Historical mention suggestions require current canonical selector execution']);
  assert.equal(result.handoff_evidence.appsflyer.evidence[0].file,'same-turn.json');
  assert.equal(warned(audit({...connection,consumer_integrated:false})),true);
});

test('later independent collection preserves AppsFlyer evidence but a later source failure supersedes success',t=>{
  const f=fixture(t);atomicJson(path.join(f.events,'native.json'),event);
  atomicJson(path.join(f.events,'asc-only.json'),{...event,observed_at:'2026-09-14T00:31:00Z',receipts:[{source:'asc',receipt:{status:'verified'}}]});
  let evidence=appsflyerConsumerEvidence(f);
  assert.equal(evidence.state,'verified');assert.equal(evidence.observed_native_runs,1);
  assert.equal(evidence.appsflyer_attempted_native_runs,1);assert.equal(evidence.evidence[0].file,'native.json');
  assert.equal(warned(audit(connectionView(f).appsflyer)),false);
  atomicJson(path.join(f.events,'appsflyer-error.json'),{...event,observed_at:'2026-09-14T00:32:00Z',receipts:[],failures:[{source:'appsflyer',reason:'reader_failed'}]});
  evidence=appsflyerConsumerEvidence(f);
  assert.equal(evidence.state,'not_observed');assert.equal(evidence.appsflyer_attempted_native_runs,1);
  assert.equal(evidence.successful_native_runs,0);assert.equal(warned(audit(connectionView(f).appsflyer)),true);
});

test('saved configuration, a cached boolean and manual collection cannot dismiss the warning',t=>{
  const f=fixture(t);let reads=0;
  atomicJson(path.join(f.events,'manual.json'),{...event,native_origin:{state:'not_a_recorded_automation_run'}});
  const evidence=appsflyerConsumerEvidence({...f,readThread:()=>{reads++;return native;}});
  assert.equal(reads,0);assert.equal(evidence.state,'not_observed');
  assert.equal(warned(audit({consumer_integrated:true,scheduled_consumer_verified:true})),true);
  assert.equal(warned(audit(connectionView(f).appsflyer)),true);
});

test('forged, future, corrupt or unavailable native evidence remains explicit despite another successful event',t=>{
  const f=fixture(t);atomicJson(path.join(f.events,'native.json'),event);
  for(const patch of [{observed_at:'2026-09-15T00:30:00Z'},
    {native_origin:{...origin,gate_receipt_sha256:'c'.repeat(64)}},
    {observed_at:'2026-09-14T01:30:00Z'}]) {
    atomicJson(path.join(f.events,'invalid.json'),{...event,...patch});
    const connection=connectionView(f).appsflyer;
    assert.equal(connection.scheduled_consumer_verified,false);assert.equal(warned(audit(connection)),true);
    assert.equal(connection.scheduled_consumer_evidence.successful_native_runs,1);
    assert.equal(connection.scheduled_consumer_evidence.failures.length,1);
  }
  fs.unlinkSync(path.join(f.events,'invalid.json'));
  assert.equal(appsflyerConsumerEvidence({...f,readThread:()=>{throw new Error('unavailable');}}).state,'unverified');
  fs.writeFileSync(path.join(f.events,'broken.json'),'{bad');
  assert.equal(connectionView(f).appsflyer.scheduled_consumer_evidence.state,'unverified');
});

test('native failures stay in the observed run count and do not become successful handoffs',t=>{
  const f=fixture(t);atomicJson(path.join(f.events,'failed.json'),{...event,receipts:[{source:'appsflyer',receipt:{status:'failed'}}]});
  const evidence=appsflyerConsumerEvidence(f);
  assert.equal(evidence.state,'not_observed');assert.equal(evidence.observed_native_runs,1);assert.equal(evidence.successful_native_runs,0);
  assert.equal(warned(audit(connectionView(f).appsflyer)),true);
});

test('observe revalidates cached success and keeps independent Growth data when native lookup fails',t=>{
  const f=fixture(t);atomicJson(path.join(f.events,'native.json'),event);
  atomicJson(path.join(f.stateRoot,'data/connections.json'),{appsflyer:{consumer_integrated:true,scheduled_consumer_verified:true,
    scheduled_consumer_evidence:{state:'verified'}},ga4:{status:'CONNECTED',fixture_marker:'independent'}});
  const o=observe({stateRoot:f.stateRoot,now});
  assert.equal(o.growth.connections.appsflyer.scheduled_consumer_evidence.state,'unverified');
  assert.equal(o.growth.connections.appsflyer.scheduled_consumer_verified,false);
  assert.equal(o.growth.connections.ga4.fixture_marker,'independent');
  assert.ok(o.failures.some(x=>x.source==='native_consumer_evidence'));
  assert.equal(warned(auditObservation(o)),true);
});
