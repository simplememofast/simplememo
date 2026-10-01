import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {recordHumanTouch,humanBurdenStatus,observabilityStatus,recordCommand} from './company-observability.mjs';
import {businessCoverage,businessTaskId} from './business-automation.mjs';
import {acquireLock} from './company-loop.mjs';

const NOW=new Date('2026-10-01T06:00:00Z');
const coverage=businessCoverage();
const task=coverage.tasks.find(t=>t.executor!=='intentional_no');
const taskId=businessTaskId(task);
const privateWrite=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});
function fixture(t,changes={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'company-human-work-'));fs.chmodSync(root,0o700);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const evidenceFile=path.join(root,'synthetic-private-timing.json');
  const value={schema_version:1,kind:'observed_human_work',event_id:'synthetic-event-1',run_id:'synthetic-run-1',
    task_id:taskId,stage:'verify',touch_kind:'manual_verification',occurred_at:'2026-09-30T12:00:00Z',
    duration_minutes:5.5,measured_at:'2026-09-30T12:30:00Z',measurement:'observed',...changes};
  privateWrite(evidenceFile,value);
  const args={stateRoot:root,eventId:value.event_id,runId:value.run_id,stage:value.stage,kind:value.touch_kind,
    evidenceFile,occurredAt:value.occurred_at,taskId:value.task_id,durationMinutes:value.duration_minutes,
    measuredAt:value.measured_at,now:NOW};
  return {root,evidenceFile,value,args,record:overrides=>recordHumanTouch({...args,...overrides}),
    status:overrides=>humanBurdenStatus({stateRoot:root,now:NOW,...overrides}),
    rewrite:overrides=>privateWrite(evidenceFile,{...value,...overrides})};
}

test('source-verified positive human timing is immutable, idempotent, private and safe to aggregate',t=>{
  const f=fixture(t),first=f.record();
  assert.deepEqual(f.record(),first);
  assert.equal(first.duration_minutes,5.5);assert.equal(first.task_id,taskId);
  assert.equal(fs.statSync(path.join(f.root,'human-touch-events','synthetic-event-1.json')).mode&0o077,0);
  const status=f.status(),row=status.by_task.find(r=>r.task_id===taskId);
  assert.equal(status.defined_tasks,192);assert.equal(status.reported_events,1);assert.equal(status.measured_events,1);
  assert.equal(status.measured_positive_minutes,5.5);assert.equal(status.reported_human_minutes,5.5);
  assert.equal(row.measured_positive_minutes,5.5);assert.equal(row.reported_human_minutes,5.5);
  assert.equal(status.by_stage.verify.measured_positive_minutes,5.5);
  assert.equal(status.by_kind.manual_verification.reported_human_minutes,5.5);
  assert.equal(status.by_kind.approval.reported_human_minutes,null);
  assert.equal(status.by_task.find(r=>r.task_id!==taskId).reported_human_minutes,null);
  assert.equal(status.company_human_minutes,null);assert.equal(status.observed_work_saved_rate,null);
  assert.equal(status.zero_touch_completion_rate,null);assert.equal(status.company_activity_coverage,'not_proven');
  assert.doesNotMatch(JSON.stringify(status),/synthetic-event|synthetic-run|synthetic-private|sha256|evidence|company-human-work-/);
  assert.deepEqual(observabilityStatus({stateRoot:f.root,now:NOW}).human_work,status);
  f.rewrite({duration_minutes:6});
  assert.throws(()=>f.record({durationMinutes:6}),/different evidence/);
});

test('legacy positive events remain untimed and unknown without retrofitting historical minutes',t=>{
  const f=fixture(t);f.record();
  const evidence=path.join(f.root,'synthetic-legacy.txt');fs.writeFileSync(evidence,'A synthetic approval occurred; elapsed human effort was not recorded.');
  const args={stateRoot:f.root,eventId:'legacy-event',runId:'legacy-run',stage:'decide',kind:'approval',
    evidenceFile:evidence,occurredAt:'2026-09-30T13:00:00Z',now:NOW};
  recordHumanTouch(args);recordHumanTouch(args);
  const status=f.status();assert.equal(status.reported_events,2);assert.equal(status.measured_events,1);
  assert.equal(status.unmeasured_events,1);assert.equal(status.unbound_events,1);
  assert.equal(status.measured_positive_minutes,5.5);assert.equal(status.reported_human_minutes,null);
  assert.equal(status.by_task.find(r=>r.task_id===taskId).reported_human_minutes,null);
  assert.equal(status.by_kind.approval.reported_events,1);assert.equal(status.by_kind.approval.reported_human_minutes,null);
  assert.equal(status.company_human_minutes,null);assert.equal(status.zero_touch_completion_rate,null);
  assert.throws(()=>recordHumanTouch({...args,taskId,durationMinutes:2,measuredAt:args.occurredAt}),/private timing/);
});

test('partial timing bindings and zero, negative, nonnumeric or nonfinite minutes are rejected',t=>{
  const f=fixture(t);
  for(const field of ['taskId','durationMinutes','measuredAt'])assert.throws(()=>f.record({[field]:undefined}),/supplied together/);
  for(const durationMinutes of [0,-1,NaN,Infinity,'5.5',null])assert.throws(()=>f.record({durationMinutes}),/positive observed human minutes/);
  assert.equal(f.status().reported_events,0);
});

test('only current canonical public task identities in the non-excluded denominator are accepted',t=>{
  const f=fixture(t),excluded=coverage.tasks.find(t=>t.executor==='intentional_no');
  for(const id of ['unregistered',task.task,businessTaskId(excluded),'0'.repeat(64)]) {
    f.rewrite({task_id:id});assert.throws(()=>f.record({taskId:id}),/current task/);
  }
  assert.equal(f.status().defined_tasks,coverage.tasks.filter(t=>t.executor!=='intentional_no').length);
  assert.equal(f.status().reported_events,0);
});

test('timed evidence must contain only the exact sanitized declaration matching every event field',t=>{
  const f=fixture(t);
  for(const patch of [{event_id:'different'}, {run_id:'different'}, {stage:'execute'}, {touch_kind:'approval'},
    {occurred_at:'2026-09-30T12:01:00Z'}, {duration_minutes:3}, {measured_at:'2026-09-30T12:31:00Z'},
    {measurement:'estimate'}, {kind:'component_command'}, {schema_version:2}, {source_text:'synthetic private text'}]) {
    f.rewrite(patch);assert.throws(()=>f.record(),/Sanitized timing evidence/);
  }
  const missing={...f.value};delete missing.measurement;privateWrite(f.evidenceFile,missing);
  assert.throws(()=>f.record(),/Sanitized timing evidence/);
  assert.equal(f.status().reported_events,0);
});

test('actual measurement timestamps must be timezone-qualified, nonfuture and no earlier than the event',t=>{
  const f=fixture(t);
  for(const measuredAt of ['2026-09-30T11:59:59Z','2026-10-02T00:00:00Z','2026-09-30T12:30:00','2026-02-31T12:30:00Z','invalid']) {
    f.rewrite({measured_at:measuredAt});assert.throws(()=>f.record({measuredAt}),/nonfuture measurement time/);
  }
  f.rewrite({occurred_at:'2026-09-30T12:00:00'});
  assert.throws(()=>f.record({occurredAt:'2026-09-30T12:00:00'}),/nonfuture measurement time/);
});

test('timing sources require owned private files, private parents and no symlinks or external paths',t=>{
  const f=fixture(t);fs.chmodSync(f.evidenceFile,0o644);
  assert.throws(()=>f.record(),/Owned private timing evidence/);fs.chmodSync(f.evidenceFile,0o600);
  const other=fixture(t);assert.throws(()=>f.record({evidenceFile:other.evidenceFile}),/Owned private timing evidence/);
  const link=path.join(f.root,'linked.json');fs.symlinkSync(f.evidenceFile,link);
  assert.throws(()=>f.record({evidenceFile:link}),/Owned private timing evidence/);
  const sub=path.join(f.root,'public-parent');fs.mkdirSync(sub,{mode:0o755});privateWrite(path.join(sub,'timing.json'),f.value);
  assert.throws(()=>f.record({evidenceFile:path.join(sub,'timing.json')}),/Owned private timing evidence/);
  fs.chmodSync(sub,0o700);fs.symlinkSync(sub,path.join(f.root,'linked-parent'));
  assert.throws(()=>f.record({evidenceFile:path.join(f.root,'linked-parent','timing.json')}),/Owned private timing evidence/);
  fs.writeFileSync(f.evidenceFile,'x'.repeat(65537));assert.throws(()=>f.record(),/bounded valid JSON/);
});

test('readback verifies source bytes and retains unknown totals on corruption without exporting private metadata',t=>{
  const f=fixture(t);f.record();f.rewrite({duration_minutes:9});
  let status=f.status();assert.equal(status.reported_events,1);assert.equal(status.invalid_events,1);
  assert.equal(status.unmeasured_events,1);assert.equal(status.measured_positive_minutes,null);
  assert.equal(status.reported_human_minutes,null);assert.deepEqual(status.failures,[{reason:'human_timing_or_source_unverified'}]);
  f.rewrite({});assert.equal(f.status().measured_positive_minutes,5.5);
  fs.unlinkSync(f.evidenceFile);status=f.status();assert.equal(status.measured_events,0);
  assert.doesNotMatch(JSON.stringify(status),/synthetic-event|synthetic-run|synthetic-private|sha256|evidence|company-human-work-/);
  fs.writeFileSync(path.join(f.root,'human-touch-events','private-name-corrupt.json'),'{synthetic-private-content',{mode:0o600});
  status=f.status();assert.equal(status.invalid_events,2);assert.equal(status.reported_human_minutes,null);
  assert.doesNotMatch(JSON.stringify(status),/private-name|synthetic-private-content/);
  assert.doesNotMatch(JSON.stringify(observabilityStatus({stateRoot:f.root,now:NOW}).failures),/private-name/);
});

test('per-window reporting uses original event time in JST and never carries events into new measurement windows',t=>{
  const f=fixture(t,{occurred_at:'2026-09-30T15:00:00Z',measured_at:'2026-09-30T15:10:00Z'});f.record();
  const same=f.status({window:{from:'2026-10-01',through:'2026-10-01'}});
  assert.equal(same.reported_events,1);assert.equal(same.measured_positive_minutes,5.5);
  const previous=f.status({window:{from:'2026-09-30',through:'2026-09-30'}});
  assert.equal(previous.reported_events,0);assert.equal(previous.reported_human_minutes,null);
  assert.equal(previous.measured_positive_minutes,null);
  assert.deepEqual(f.status().window,{from:'2026-09-04',through:'2026-10-01',timezone:'Asia/Tokyo'});
  for(const window of [{from:'2026-10-02',through:'2026-10-02'},{from:'2026-10-01',through:'2026-09-30'},
    {from:'2026-02-31',through:'2026-10-01'},{through:'invalid'}])assert.throws(()=>f.status({window}),/nonfuture JST/);
});

test('duplicate or malformed stored identities cannot inflate measured time and block reported totals',t=>{
  const f=fixture(t);f.record();
  const original=path.join(f.root,'human-touch-events','synthetic-event-1.json');
  fs.copyFileSync(original,path.join(f.root,'human-touch-events','copied-private-event.json'));
  const status=f.status();assert.equal(status.measured_events,1);assert.equal(status.measured_positive_minutes,5.5);
  assert.equal(status.invalid_events,1);assert.equal(status.reported_human_minutes,null);
  assert.equal(status.by_task.find(r=>r.task_id===taskId).reported_human_minutes,null);
});

test('the existing human-touch lock remains authoritative for measured event writes',t=>{
  const f=fixture(t),release=acquireLock(f.root,'human-touch.lock');assert(release);
  try {assert.throws(()=>f.record(),/writer is busy/);assert.equal(f.status().reported_events,0);}
  finally {release();}
  f.record();assert.equal(f.status().measured_events,1);
});

test('machine elapsed time and no reported work never establish human minutes, savings or H0',t=>{
  const f=fixture(t);
  recordCommand({stateRoot:f.root,command:'collect',startedAt:'2026-10-01T05:59:00Z',durationMs:60000,
    result:{status:'returned'},origin:{state:'not_a_recorded_automation_run'},now:NOW});
  const status=observabilityStatus({stateRoot:f.root,now:NOW});assert.equal(status.elapsed_ms,60000);
  assert.equal(status.human_work.reported_events,0);assert.equal(status.human_work.measured_positive_minutes,null);
  assert.equal(status.human_work.reported_human_minutes,null);assert.equal(status.human_work.company_human_minutes,null);
  assert.equal(status.human_work.observed_work_saved_rate,null);assert.equal(status.zero_touch_completion_rate,null);
});
