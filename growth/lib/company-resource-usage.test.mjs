import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {collectNativeResources,nativeResourceStatus,validateNativeResources} from './company-resource-usage.mjs';

const NOW=new Date('2026-09-15T04:00:00Z');
const report=()=>({schema_version:2,observed_at:NOW.toISOString(),registered:['obsidian','obsidian-2'],
  scope:'private_original_scheduled_turn_counters',billing_usd:null,model_price_estimate_usd:null,limitations:[],runs:[{
    thread_id:'00000000-0000-0000-0000-000000000001',automation_id:'obsidian',original_turn_id:'00000000-0000-0000-0000-000000000002',
    original_turn_state:'failed',started_at:'2026-09-15T01:00:00Z',finished_at:'2026-09-15T02:00:00Z',
    usage:{state:'observed',reason:null,samples:2,last_sample_at:'2026-09-15T01:59:00Z',original_prefix_sha256:'a'.repeat(64),
      coverage:'host_reported_through_last_sample; not billed usage or proof of complete model accounting',
      counters:{input_tokens:100,cached_input_tokens:80,cache_write_input_tokens:0,output_tokens:5,reasoning_output_tokens:2,total_tokens:105}}}]});
function setup(t) {const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-resources-'));fs.chmodSync(root,0o700);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
const run=d=>()=>JSON.stringify(d);

test('private resource collection keeps failed original usage, cache distinction and null money',t=>{
  const stateRoot=setup(t),d=report();
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(d)}).status,'verified');
  const status=nativeResourceStatus({stateRoot,now:NOW});
  assert.equal(status.original_failed_runs_included,1);assert.equal(status.recorded_counter_totals.total_tokens,105);
  assert.equal(status.recorded_counter_totals.cached_input_tokens,80);assert.equal(status.billing_usd,null);
  assert.equal(status.cost_per_shipped_improvement_usd,null);
  assert.equal(fs.statSync(path.join(stateRoot,'data/native-resource-usage.json')).mode&0o777,0o600);
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(d)}).status,'verified');
  assert.equal(nativeResourceStatus({stateRoot,now:NOW}).recorded_counter_totals.total_tokens,105);
});

test('missing original counters remain an explicit unknown row, never zero or omitted',t=>{
  const stateRoot=setup(t),d=report();d.runs[0].usage={state:'unknown',reason:'usage_not_observed',counters:null,original_prefix_sha256:'a'.repeat(64)};
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(d)}).status,'partial');
  const s=nativeResourceStatus({stateRoot,now:NOW});assert.equal(s.unknown_counter_runs,1);assert.equal(s.recorded_counter_totals,null);
});

test('a later/manual usage change cannot rewrite closed original counters or hide failed refresh',t=>{
  const stateRoot=setup(t),d=report();collectNativeResources({stateRoot,now:NOW,run:run(d)});
  const file=path.join(stateRoot,'data/native-resource-usage.json'),before=fs.readFileSync(file,'utf8');
  d.runs[0].usage.counters.input_tokens+=10;d.runs[0].usage.counters.total_tokens+=10;
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(d)}).status,'unavailable');
  assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(nativeResourceStatus({stateRoot,now:NOW}).status,'unavailable');
});

test('closed failed lifecycle and source fingerprint stay fixed even with unknown counters',t=>{
  const stateRoot=setup(t),d=report();d.runs[0].usage={state:'unknown',reason:'usage_not_observed',counters:null,original_prefix_sha256:'a'.repeat(64)};
  collectNativeResources({stateRoot,now:NOW,run:run(d)});
  const file=path.join(stateRoot,'data/native-resource-usage.json'),before=fs.readFileSync(file,'utf8');
  for(const change of [r=>r.original_turn_state='completed',r=>r.finished_at='2026-09-15T02:01:00Z',
    r=>r.usage.original_prefix_sha256='b'.repeat(64)]) {
    const changed=structuredClone(d);change(changed.runs[0]);
    assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(changed)}).status,'unavailable');
    assert.equal(fs.readFileSync(file,'utf8'),before);
  }
});

test('source disappearance or failure preserves prior evidence without claiming current success',t=>{
  const stateRoot=setup(t),d=report();collectNativeResources({stateRoot,now:NOW,run:run(d)});
  d.runs=[];assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(d)}).status,'unavailable');
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:()=>{throw Error('private-token');}}).status,'unavailable');
  assert.equal(nativeResourceStatus({stateRoot,now:NOW}).registered_runs,1);
  assert.doesNotMatch(fs.readFileSync(path.join(stateRoot,'data/native-resource-usage.json.health.json'),'utf8'),/private-token/);
});

test('resource observation expires even if no new original run appears',t=>{
  const stateRoot=setup(t);collectNativeResources({stateRoot,now:NOW,run:run(report())});
  assert.equal(nativeResourceStatus({stateRoot,now:new Date(+NOW+37*3600000)}).status,'stale');
});

test('legacy private v1 upgrades once without relaxing the closed failed lifecycle',t=>{
  const stateRoot=setup(t),legacy=report();legacy.schema_version=1;
  legacy.runs[0].usage={state:'unknown',reason:'usage_not_observed',counters:null};
  const file=path.join(stateRoot,'data/native-resource-usage.json');fs.mkdirSync(path.dirname(file),{mode:0o700});
  fs.writeFileSync(file,JSON.stringify(legacy),{mode:0o600});
  const current=structuredClone(legacy);current.schema_version=2;current.runs[0].usage.original_prefix_sha256='a'.repeat(64);
  const altered=structuredClone(current);altered.runs[0].original_turn_state='completed';
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(altered)}).status,'unavailable');
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(current)}).status,'partial');
  assert.equal(JSON.parse(fs.readFileSync(file)).schema_version,2);
  assert.equal(collectNativeResources({stateRoot,now:NOW,run:run(legacy)}).status,'unavailable');
});

test('validator rejects forged cost, unknown counters, duplicate identities and arithmetic inconsistency',()=>{
  for(const change of [d=>d.billing_usd=0,d=>d.runs.push(structuredClone(d.runs[0])),
    d=>d.runs[0].usage.counters.input_tokens=true,d=>d.runs[0].usage.counters.total_tokens=106,
    d=>d.runs[0].usage.counters.cached_input_tokens=101,d=>d.runs[0].usage.counters.private='secret',
    d=>d.runs[0].usage.last_sample_at='2026-09-15T03:00:00Z']) {
    const d=report();change(d);assert.throws(()=>validateNativeResources(d,NOW));
  }
});
