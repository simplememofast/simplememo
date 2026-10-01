import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { privateState, atomicJson, acquireLock } from './company-loop.mjs';
import { nativeOrigin } from './company-origin.mjs';
import { nativeResourceStatus } from './company-resource-usage.mjs';
import {businessCoverage, businessTaskId, jstDay} from './business-automation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stages = ['detect', 'decide', 'execute', 'verify', 'report', 'learn'];
const kinds = ['manual_start', 'manual_decision', 'manual_execution', 'manual_verification', 'manual_reporting', 'approval', 'credential'];
const commands = ['prepare-measurement','register-measurement','measurement-comparison','evaluate-measurement','measurement-status','prepare-decision','decision-trace','follow-up','register-growth-followup','evaluate-growth-followup','register-goal-followup','goal-wake','acknowledge-goal-wake','bind','finish','collect','run','autonomy-lift','growth-autopilot','autonomy-status','autonomy-audit','growth-audit','review','growth-status','content-gap','aio-audit','observability-status','human-burden-status','record-human-touch','record-mention-review','resolve-mention-review','cta-measurement','record-cta-diagnosis','record-automation-diagnosis','record-apple-ads-observation'];
const directory = (root, child) => privateState(path.join(privateState(root), child));
const identity = value => typeof value==='string' && /^[a-zA-Z0-9._-]{1,160}$/.test(value);
const day = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const stamp = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && day(value.slice(0,10)) && Number.isFinite(Date.parse(value));
const timingKeys = ['schema_version','kind','event_id','run_id','task_id','stage','touch_kind','occurred_at','duration_minutes','measured_at','measurement'];
const timingFields = ['task_id','duration_minutes','measured_at','measurement'];

// Read only a small, sanitized timing declaration; never copy its original bytes.
function privateTimingSource(root, file) {
  try {
    if(typeof file!=='string')throw new Error('private');
    const full=path.resolve(root,file);
    if(fs.lstatSync(full).isSymbolicLink() || !fs.realpathSync(full).startsWith(root+path.sep))throw new Error('private');
    for(let p=path.dirname(full);fs.realpathSync(p)!==root;p=path.dirname(p)) {
      const stat=fs.lstatSync(p);
      if(!fs.realpathSync(p).startsWith(root+path.sep) || !stat.isDirectory() || stat.isSymbolicLink()
        || stat.uid!==process.getuid() || (stat.mode&0o077))throw new Error('private');
    }
    const fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {
      const stat=fs.fstatSync(fd);
      if(!stat.isFile() || stat.uid!==process.getuid() || (stat.mode&0o077) || !fs.realpathSync(full).startsWith(root+path.sep))throw new Error('private');
      if(stat.size<1 || stat.size>65536)throw new Error('limit');
      const bytes=fs.readFileSync(fd);
      if(bytes.length<1 || bytes.length>65536)throw new Error('limit');
      const value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));
      return {value,bytes,file:path.relative(root,fs.realpathSync(full))};
    } finally {fs.closeSync(fd);}
  } catch {throw new Error('Owned private timing evidence must be a bounded valid JSON file');}
}

function timingDeclaration(record, now, taskIds) {
  if(!taskIds.has(record.task_id) || !Number.isFinite(record.duration_minutes) || record.duration_minutes<=0
    || record.measurement!=='observed' || !stamp(record.occurred_at) || !stamp(record.measured_at)
    || Date.parse(record.measured_at)<Date.parse(record.occurred_at) || Date.parse(record.measured_at)>now.getTime())throw new Error('A current task and positive observed human minutes with nonfuture measurement time are required');
  return {schema_version:1,kind:'observed_human_work',event_id:record.event_id,run_id:record.run_id,
    task_id:record.task_id,stage:record.stage,touch_kind:record.touch_kind,occurred_at:record.occurred_at,
    duration_minutes:record.duration_minutes,measured_at:record.measured_at,measurement:'observed'};
}

function verifyTimingSource(root, record, now, taskIds) {
  const expected=timingDeclaration(record,now,taskIds),source=privateTimingSource(root,record.evidence?.file);
  const value=source.value;
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==timingKeys.length
    || !timingKeys.every(k=>Object.hasOwn(value,k) && value[k]===expected[k]))throw new Error('Sanitized timing evidence must match the measured event');
  if(record.evidence.sha256!==hash(source.bytes))throw new Error('Timing source integrity verification failed');
  return source;
}

// Subprocess measurements are not observations of all parent-session handoffs.
export function recordCommand({stateRoot, command, startedAt, durationMs, result, failed=false, origin=nativeOrigin(), now=new Date()}) {
  if (!commands.includes(command) || !Number.isFinite(durationMs) || durationMs < 0 || !Number.isFinite(Date.parse(startedAt)) || Date.parse(startedAt)>now.getTime()) throw new Error('Invalid command measurement');
  const resultBytes=JSON.stringify(result ?? null);
  const record={schema_version:1,kind:'component_command',id:randomUUID(),command,started_at:startedAt,
    observed_at:now.toISOString(),duration_ms:durationMs,execution_state:failed?'failed':'returned',
    result_status:typeof result?.status==='string'?result.status:null,result_sha256:hash(resultBytes),
    source_failures:result?.failures?.length ?? result?.source_failures?.length ?? null,
    company_run_id:!['record-mention-review','resolve-mention-review','record-apple-ads-observation'].includes(command) && typeof result?.id==='string'?result.id:null,origin,
    stages:Object.fromEntries(stages.map(stage=>[stage,{state:result?.stages?.[stage] ?? 'not_observed',human_touches:null}])),
    parent_human_touches:null,parent_zero_touch_completion:null,
    cost:{parent_model_usd:null,parent_model_tokens:null,api_usd:null,bigquery_usd:null,
      reason:'Elapsed subprocess time is measured; parent model billing and complete human interventions are not exposed by this CLI. Existing source receipts and formal cost ledgers remain authoritative.'},
    scope:'Company CLI subprocess; a returned command is not a shipped improvement or proof of H0. No historical inference.'};
  atomicJson(path.join(directory(stateRoot,'command-events'),record.id+'.json'),record);return record;
}

export function recordHumanTouch({stateRoot, eventId, runId, stage, kind, evidenceFile, occurredAt,
  taskId, durationMinutes, measuredAt, now=new Date()}) {
  if (!identity(eventId) || !identity(runId) || !stages.includes(stage) || !kinds.includes(kind)
    || !Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt)>now.getTime()) throw new Error('A real event identity, run, stage, kind and nonfuture time are required');
  const timingProvided=[taskId,durationMinutes,measuredAt].map(v=>v!==undefined);
  if(timingProvided.some(Boolean) && !timingProvided.every(Boolean))throw new Error('Task, duration minutes and measured time must be supplied together');
  const timed=timingProvided.every(Boolean);
  let source,root;
  if(timed) {
    root=privateState(stateRoot);source=privateTimingSource(root,evidenceFile);
    const taskIds=new Set(businessCoverage().tasks.filter(t=>t.executor!=='intentional_no').map(businessTaskId));
    const expected=timingDeclaration({event_id:eventId,run_id:runId,stage,touch_kind:kind,occurred_at:occurredAt,
      task_id:taskId,duration_minutes:durationMinutes,measured_at:measuredAt,measurement:'observed'},now,taskIds);
    if(!source.value || typeof source.value!=='object' || Array.isArray(source.value)
      || Object.keys(source.value).length!==timingKeys.length || !timingKeys.every(k=>Object.hasOwn(source.value,k) && source.value[k]===expected[k]))throw new Error('Sanitized timing evidence must match the measured event');
  }
  const bytes=source?.bytes ?? fs.readFileSync(evidenceFile);if(!bytes.length) throw new Error('Human event evidence cannot be empty');
  const record={schema_version:1,kind:'reported_human_touch',event_id:eventId,run_id:runId,stage,touch_kind:kind,occurred_at:occurredAt,
    ...(timed ? {task_id:taskId,duration_minutes:durationMinutes,measured_at:measuredAt,measurement:'observed'} : {}),
    evidence:{name:path.basename(evidenceFile),sha256:hash(bytes),...(timed ? {file:source.file} : {})},
    validation:'Source file integrity is retained; the event interpretation is agent-reported. Positive events only; absence never establishes zero touch.'};
  const dir=directory(stateRoot,'human-touch-events'),file=path.join(dir,eventId+'.json'),serialized=JSON.stringify(record,null,2)+'\n';
  const release=acquireLock(stateRoot,'human-touch.lock');if(!release)throw new Error('Human event writer is busy');
  try {
    if(fs.existsSync(file)) {
      if(fs.lstatSync(file).isSymbolicLink() || fs.readFileSync(file,'utf8')!==serialized)throw new Error('Human event identity already exists with different evidence');
    } else atomicJson(file,record);
    return record;
  } finally {release();}
}

// Supplemental positive-event accounting, not a corporate time census or an H0 gate.
export function humanBurdenStatus({stateRoot,now=new Date(),window}={}) {
  if(!Number.isFinite(now.getTime()))throw new Error('A valid human-work observation time is required');
  const through=window?.through ?? jstDay(now);
  if(!day(through))throw new Error('A valid nonfuture JST human-work window is required');
  const from=window?.from ?? new Date(Date.parse(through)-27*86400000).toISOString().slice(0,10);
  if(!day(from) || !day(through) || from>through || through>jstDay(now))throw new Error('A valid nonfuture JST human-work window is required');
  const tasks=businessCoverage().tasks.filter(t=>t.executor!=='intentional_no'),taskIds=new Set(tasks.map(businessTaskId));
  const counter=()=>({reported_events:0,measured_events:0,unmeasured_events:0,invalid_events:0,
    measured_positive_minutes:null,reported_human_minutes:null});
  const rows=new Map(tasks.map(t=>[businessTaskId(t),{task_id:businessTaskId(t),...counter()}]));
  const byStage=Object.fromEntries(stages.map(s=>[s,counter()])),byKind=Object.fromEntries(kinds.map(k=>[k,counter()]));
  const failures=[];
  let reported=0,measured=0,unmeasured=0,unbound=0,invalid=0,subtotal=0,root,dir,files=[];
  try {root=privateState(stateRoot);dir=directory(root,'human-touch-events');files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));}
  catch {failures.push({reason:'human_event_store_unavailable'});}
  const seen=new Set();
  for(const file of files) {
    let record;
    try {
      record=privateTimingSource(root,path.join(dir,file)).value;
      // Invalid time cannot establish that an event falls outside this window.
      if(stamp(record?.occurred_at) && (jstDay(record.occurred_at)<from || jstDay(record.occurred_at)>through))continue;
      if(record?.schema_version!==1 || record.kind!=='reported_human_touch' || !identity(record.event_id)
        || file!==record.event_id+'.json' || seen.has(record.event_id) || !identity(record.run_id)
        || !kinds.includes(record.touch_kind) || !stages.includes(record.stage) || !stamp(record.occurred_at)
        || Date.parse(record.occurred_at)>now.getTime())throw new Error('invalid event');
      seen.add(record.event_id);
    } catch {invalid++;failures.push({reason:'human_event_read_or_fields_invalid'});continue;}
    reported++;
    const row=rows.get(record.task_id);
    const groups=[byStage[record.stage],byKind[record.touch_kind]];
    if(row)groups.push(row);else unbound++;
    for(const group of groups)group.reported_events++;
    if(!timingFields.some(k=>Object.hasOwn(record,k))) {
      unmeasured++;for(const group of groups)group.unmeasured_events++;continue;
    }
    try {
      if(!timingFields.every(k=>Object.hasOwn(record,k)))throw new Error('partial timing');
      verifyTimingSource(root,record,now,taskIds);
      if(!Number.isFinite(subtotal+record.duration_minutes))throw new Error('overflow');
      measured++;subtotal+=record.duration_minutes;
      for(const group of groups) {
        group.measured_events++;group.measured_positive_minutes=(group.measured_positive_minutes ?? 0)+record.duration_minutes;
      }
    } catch {
      invalid++;unmeasured++;for(const group of groups){group.invalid_events++;group.unmeasured_events++;}
      failures.push({reason:'human_timing_or_source_unverified'});
    }
  }
  for(const row of rows.values()) {
    if(row.reported_events>0 && row.measured_events===row.reported_events && !unbound && !failures.length)row.reported_human_minutes=row.measured_positive_minutes;
  }
  for(const group of [...Object.values(byStage),...Object.values(byKind)]) {
    if(group.reported_events>0 && group.measured_events===group.reported_events && !failures.length)group.reported_human_minutes=group.measured_positive_minutes;
  }
  return {schema_version:1,instrument:'reported-human-work-v1',window:{from,through,timezone:'Asia/Tokyo'},
    scope:'Positive human events reported to the existing Company recorder; unreported work is unknown.',
    defined_tasks:tasks.length,reported_events:reported,measured_events:measured,unmeasured_events:unmeasured,
    unbound_events:unbound,invalid_events:invalid,tasks_with_measured_events:[...rows.values()].filter(r=>r.measured_events>0).length,
    measured_positive_minutes:measured ? subtotal : null,
    reported_human_minutes:reported>0 && measured===reported && !failures.length ? subtotal : null,
    company_human_minutes:null,observed_work_saved_rate:null,zero_touch_completion_rate:null,
    company_activity_coverage:'not_proven',by_task:[...rows.values()],by_stage:byStage,by_kind:byKind,failures,
    assurance:'Durations are source-grounded declarations of actual positive human effort. Source matching is not independent proof of all activity or a measured baseline. Missing timing stays unknown; machine runtime, absent events and code readiness give no savings or full-automation credit.'};
}

export function observabilityStatus({stateRoot,now=new Date()}) {
  const failures=[];
  const readEvents=child=>{
    let dir,files;const records=[];
    try {dir=directory(stateRoot,child);files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));}
    catch {failures.push({source:child,reason:'event_store_unavailable'});return records;}
    for(const file of files){
      try{const record=JSON.parse(fs.readFileSync(path.join(dir,file)));if(record.schema_version!==1)throw new Error('schema');records.push(record);}
      catch{failures.push({source:child,reason:'event_read_or_schema_failed'});}
    }
    return records;
  };
  const commands=readEvents('command-events'),touches=readEvents('human-touch-events');
  const validCommands=commands.filter(e=>e.kind==='component_command'&&Number.isFinite(e.duration_ms)&&e.duration_ms>=0);
  const validTouches=touches.filter(e=>e.kind==='reported_human_touch'&&kinds.includes(e.touch_kind)&&stages.includes(e.stage));
  if(validCommands.length!==commands.length||validTouches.length!==touches.length)failures.push({source:'observability',reason:'invalid_event_fields'});
  return {schema_version:1,scope:'Prospective supplemental observations; formal autonomy definitions and denominators are unchanged.',
    command_invocations:validCommands.length,failed_commands:validCommands.filter(e=>e.execution_state==='failed').length,
    elapsed_ms:validCommands.reduce((n,e)=>n+e.duration_ms,0),
    native_component_invocations:validCommands.filter(e=>e.origin?.state==='native_execution_record').length,
    reported_human_touches:Object.fromEntries(kinds.map(k=>[k,validTouches.filter(e=>e.touch_kind===k).length])),
    stage_observations:Object.fromEntries(stages.map(s=>[s,{command_evidence:validCommands.filter(e=>e.stages?.[s]?.state!=='not_observed'&&e.stages?.[s]?.state!==undefined).length,reported_human_touches:validTouches.filter(e=>e.stage===s).length}])),
    human_touches_per_successful_output:null,zero_touch_completion_rate:null,cost_per_shipped_improvement_usd:null,
    human_work:humanBurdenStatus({stateRoot,now}),
    native_resource_usage:nativeResourceStatus({stateRoot}),
    unknowns:['Unobserved historical events and parent-stage intervention coverage remain unknown.','No invoice-matched parent model/API cost is available here. Runtime milliseconds are not money.'],failures};
}
