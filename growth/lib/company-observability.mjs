import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { privateState, atomicJson, acquireLock } from './company-loop.mjs';
import { nativeOrigin } from './company-origin.mjs';
import { nativeResourceStatus } from './company-resource-usage.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stages = ['detect', 'decide', 'execute', 'verify', 'report', 'learn'];
const kinds = ['manual_start', 'manual_decision', 'manual_execution', 'manual_verification', 'manual_reporting', 'approval', 'credential'];
const commands = ['acquisition-status','prepare-measurement','register-measurement','measurement-comparison','evaluate-measurement','measurement-status','prepare-decision','decision-trace','follow-up','register-growth-followup','evaluate-growth-followup','register-goal-followup','goal-wake','acknowledge-goal-wake','bind','finish','collect','run','autonomy-lift','growth-autopilot','autonomy-status','autonomy-audit','growth-audit','review','growth-status','content-gap','aio-audit','observability-status','record-human-touch','record-mention-review','resolve-mention-review','cta-measurement','record-cta-diagnosis','record-automation-diagnosis','record-apple-ads-observation'];
const directory = (root, child) => privateState(path.join(privateState(root), child));

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

export function recordHumanTouch({stateRoot, eventId, runId, stage, kind, evidenceFile, occurredAt, now=new Date()}) {
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(eventId ?? '') || !/^[a-zA-Z0-9._-]{1,160}$/.test(runId ?? '') || !stages.includes(stage) || !kinds.includes(kind)
    || !Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt)>now.getTime()) throw new Error('A real event identity, run, stage, kind and nonfuture time are required');
  const bytes=fs.readFileSync(evidenceFile);if(!bytes.length) throw new Error('Human event evidence cannot be empty');
  const record={schema_version:1,kind:'reported_human_touch',event_id:eventId,run_id:runId,stage,touch_kind:kind,occurred_at:occurredAt,
    evidence:{name:path.basename(evidenceFile),sha256:hash(bytes)},
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

// Supplemental reports are scoped to one prospective Company run. They do
// not replace canonical intervention arrays or establish complete observation.
const companyId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const eventId = /^[a-zA-Z0-9._-]{1,160}$/;
const sourceHash = /^[a-f0-9]{64}$/;
const eventLimit = 1024, eventBytes = 64 * 1024;
function privateJson(file, maxBytes=eventBytes) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {
    const stat=fs.fstatSync(fd);
    if(!stat.isFile() || stat.uid!==process.getuid() || (stat.mode&0o077) || stat.size>maxBytes)throw new Error('private_event_invalid');
    const raw=Buffer.alloc(stat.size+1),size=fs.readSync(fd,raw,0,raw.length,0);
    const after=fs.fstatSync(fd);
    if(size!==stat.size || after.size!==stat.size || after.mtimeMs!==stat.mtimeMs)throw new Error('private_event_changed');
    const bytes=raw.subarray(0,size);if(!Buffer.from(bytes.toString('utf8')).equals(bytes))throw new Error('private_event_encoding_invalid');
    const doc=JSON.parse(bytes.toString('utf8'));
    return {doc,sha256:hash(bytes),bytes};
  } finally {fs.closeSync(fd);}
}
function privateDirectory(file) {
  const stat=fs.lstatSync(file);
  if(!stat.isDirectory() || stat.isSymbolicLink() || stat.uid!==process.getuid() || (stat.mode&0o077))throw new Error('private_store_invalid');
}
function observedTime(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;
  const time=Date.parse(value),[y,m,d]=value.slice(0,10).split('-').map(Number),calendar=new Date(Date.UTC(y,m-1,d));
  return calendar.getUTCFullYear()===y && calendar.getUTCMonth()===m-1 && calendar.getUTCDate()===d ? time : NaN;
}
// Date.parse retains milliseconds. Preserve the remaining fractional digits
// for window comparisons so a later submillisecond event cannot round inside.
function observedInstant(value) {
  const fraction=/\.(\d{1,9})/.exec(value)?.[1]??'';
  return BigInt(observedTime(value))*1000000n+BigInt(fraction.padEnd(9,'0').slice(3)||'0');
}
export function parentReportedInterventions({stateRoot,runId,startedAt,finishedAt,canonicalInterventions=null,expectedEventStoreSha256=null,now=new Date()}) {
  const events=[],errors=[],start=observedTime(startedAt),finish=observedTime(finishedAt);
  const summary={schema_version:1,scope:'agent_reported_positive_events_for_exact_company_run',company_run_id:runId,
    window:{started_at:startedAt,finished_at:finishedAt},state:'observation_unknown',coverage:'partial_agent_reported_only',
    reported_count_lower_bound:null,stage_reported_lower_bounds:null,events,event_store_sha256:null,
    canonical_interventions:{source:'data/autopilot-runs.json',recorded_count:Array.isArray(canonicalInterventions)?canonicalInterventions.length:null,
      recorded_zero:Array.isArray(canonicalInterventions)?canonicalInterventions.length===0:null},discrepancies:[],errors,
    parent_human_touches:null,parent_zero_touch_completion:null,
    limitation:'Event interpretation is agent-reported. Claimed original source hashes are retained, not reverified; no full parent observation or H0 inference.'};
  if(typeof stateRoot!=='string' || !stateRoot || typeof runId!=='string' || !companyId.test(runId) || !Number.isFinite(start) || !Number.isFinite(finish) || finish<start || !(now instanceof Date) || !Number.isFinite(now.getTime()) || finish>now.getTime()
    || (expectedEventStoreSha256!==null && (typeof expectedEventStoreSha256!=='string' || !sourceHash.test(expectedEventStoreSha256)))) {
    errors.push({code:'run_window_or_expected_digest_invalid'});return summary;
  }
  if(observedInstant(finishedAt)<observedInstant(startedAt) || observedInstant(finishedAt)>BigInt(now.getTime())*1000000n) {
    errors.push({code:'run_window_or_expected_digest_invalid'});return summary;
  }
  const dir=path.join(path.resolve(stateRoot),'human-touch-events');let files=[];
  try {
    privateDirectory(path.resolve(stateRoot));
    try{privateDirectory(dir);files=fs.readdirSync(dir).filter(name=>name.endsWith('.json')).sort();}
    catch(error){if(error.code!=='ENOENT')throw error;errors.push({code:'event_store_not_present'});}
    if(files.length>eventLimit)throw new Error('event_store_limit');
  } catch {
    errors.push({code:'event_store_unreadable_or_unbounded'});return summary;
  }
  const seen=new Set();
  for(const file of files) {
    try {
      if(!eventId.test(file.slice(0,-5)))throw new Error('event_filename_invalid');
      const {doc:e,sha256,bytes}=privateJson(path.join(dir,file));
      // These are exact recordHumanTouch writer records. Reject duplicate JSON
      // keys, altered schema/format, aliased IDs and nonfinite field coercions.
      if(bytes.toString('utf8')!==JSON.stringify(e,null,2)+'\n'
        || Object.keys(e).sort().join(',')!=='event_id,evidence,kind,occurred_at,run_id,schema_version,stage,touch_kind,validation'
        || Object.keys(e.evidence??{}).sort().join(',')!=='name,sha256' || e.schema_version!==1 || e.kind!=='reported_human_touch'
        || typeof e.event_id!=='string' || !eventId.test(e.event_id) || file!==e.event_id+'.json'
        || typeof e.run_id!=='string' || !eventId.test(e.run_id) || !stages.includes(e.stage) || !kinds.includes(e.touch_kind)
        || e.validation!=='Source file integrity is retained; the event interpretation is agent-reported. Positive events only; absence never establishes zero touch.'
        || typeof e.evidence?.name!=='string' || !e.evidence.name
        || path.basename(e.evidence.name)!==e.evidence.name || typeof e.evidence?.sha256!=='string' || !sourceHash.test(e.evidence.sha256)
        || !Number.isFinite(observedTime(e.occurred_at)))throw new Error('event_fields_invalid');
      if(e.run_id!==runId)continue; // Company UUID and canonical run ID are not aliases.
      if(seen.has(e.event_id))throw new Error('duplicate_event');seen.add(e.event_id);
      const at=observedInstant(e.occurred_at);
      if(at<observedInstant(startedAt) || at>observedInstant(finishedAt))throw new Error('event_outside_run_window');
      events.push({event_id:e.event_id,company_run_id:e.run_id,stage:e.stage,kind:e.touch_kind,occurred_at:e.occurred_at,
        event_file:{relative_path:'human-touch-events/'+file,sha256},
        source_evidence:{name:e.evidence.name,claimed_sha256:e.evidence.sha256,source_integrity_reverified:false},evidence_provenance:'agent_reported'});
    } catch {errors.push({code:'event_unreadable_invalid_or_outside_window',event_file:file});}
  }
  summary.event_store_sha256=hash(JSON.stringify(events.map(e=>[e.event_id,e.event_file.sha256])));
  if(expectedEventStoreSha256!==null && expectedEventStoreSha256!==summary.event_store_sha256)errors.push({code:'event_store_changed_after_finish'});
  const unavailable=errors.some(e=>e.code!=='event_store_not_present');
  summary.reported_count_lower_bound=unavailable && !events.length?null:events.length;
  summary.stage_reported_lower_bounds=summary.reported_count_lower_bound===null?null:Object.fromEntries(stages.map(stage=>[stage,events.filter(e=>e.stage===stage).length]));
  summary.state=errors.length?'observation_unknown':events.length?'reported_positive_events':'no_matching_reported_events';
  if(events.length && summary.canonical_interventions.recorded_zero===true)summary.discrepancies.push({code:'reported_positive_vs_canonical_recorded_zero'});
  return summary;
}
function exactFields(value,fields) {
  return value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')===fields.split(' ').sort().join(',');
}
function retainedParentReport(p,r) {
  const start=observedTime(r.started_at),finish=observedTime(r.finished_at);
  if(!Number.isFinite(start) || !Number.isFinite(finish) || observedInstant(r.finished_at)<observedInstant(r.started_at)
    || observedInstant(r.finished_at)>BigInt(Date.now())*1000000n)throw new Error('retained_parent_window_invalid');
  const integer=n=>Number.isSafeInteger(n) && n>=0 && n<=eventLimit;
  const nullable=n=>n===null || integer(n);
  const codes=['run_window_or_expected_digest_invalid','event_store_not_present','event_store_unreadable_or_unbounded','event_unreadable_invalid_or_outside_window','event_store_changed_after_finish'];
  const count=Array.isArray(r.human_interventions)?r.human_interventions.length:null;
  const discrepancy=count===0 && p?.events?.length>0;
  if(!exactFields(p,'schema_version scope company_run_id window state coverage reported_count_lower_bound stage_reported_lower_bounds events event_store_sha256 canonical_interventions discrepancies errors parent_human_touches parent_zero_touch_completion limitation')
    || p.schema_version!==1 || p.scope!=='agent_reported_positive_events_for_exact_company_run' || p.company_run_id!==r.id
    || !exactFields(p.window,'started_at finished_at') || p.window.started_at!==r.started_at || p.window.finished_at!==r.finished_at
    || !['observation_unknown','reported_positive_events','no_matching_reported_events'].includes(p.state) || p.coverage!=='partial_agent_reported_only'
    || p.parent_human_touches!==null || p.parent_zero_touch_completion!==null || !nullable(p.reported_count_lower_bound)
    || !Array.isArray(p.events) || p.events.length>eventLimit || !Array.isArray(p.errors) || p.errors.length>eventLimit+2
    || !exactFields(p.canonical_interventions,'source recorded_count recorded_zero') || p.canonical_interventions.source!=='data/autopilot-runs.json'
    || p.canonical_interventions.recorded_count!==count || p.canonical_interventions.recorded_zero!==(count===null?null:count===0)
    || !Array.isArray(p.discrepancies) || p.discrepancies.length!==(discrepancy?1:0)
    || p.discrepancies.some(e=>!exactFields(e,'code') || e.code!=='reported_positive_vs_canonical_recorded_zero')
    || p.limitation!=='Event interpretation is agent-reported. Claimed original source hashes are retained, not reverified; no full parent observation or H0 inference.')throw new Error('retained_parent_invalid');
  const identities=new Set();
  for(const e of p.events) {
    if(!exactFields(e,'event_id company_run_id stage kind occurred_at event_file source_evidence evidence_provenance')
      || typeof e.event_id!=='string' || !eventId.test(e.event_id) || identities.has(e.event_id) || e.company_run_id!==r.id
      || !stages.includes(e.stage) || !kinds.includes(e.kind) || !Number.isFinite(observedTime(e.occurred_at))
      || !Number.isFinite(observedTime(r.started_at)) || !Number.isFinite(observedTime(r.finished_at))
      || observedInstant(e.occurred_at)<observedInstant(r.started_at) || observedInstant(e.occurred_at)>observedInstant(r.finished_at)
      || !exactFields(e.event_file,'relative_path sha256') || e.event_file.relative_path!=='human-touch-events/'+e.event_id+'.json'
      || typeof e.event_file.sha256!=='string' || !sourceHash.test(e.event_file.sha256)
      || !exactFields(e.source_evidence,'name claimed_sha256 source_integrity_reverified') || typeof e.source_evidence.name!=='string'
      || !e.source_evidence.name || path.basename(e.source_evidence.name)!==e.source_evidence.name
      || typeof e.source_evidence.claimed_sha256!=='string' || !sourceHash.test(e.source_evidence.claimed_sha256)
      || e.source_evidence.source_integrity_reverified!==false || e.evidence_provenance!=='agent_reported')throw new Error('retained_parent_event_invalid');
    identities.add(e.event_id);
  }
  for(const e of p.errors) {
    if(!codes.includes(e?.code) || !exactFields(e,e.code==='event_unreadable_invalid_or_outside_window'?'code event_file':'code')
      || (Object.hasOwn(e,'event_file') && (typeof e.event_file!=='string' || e.event_file.length>255 || path.basename(e.event_file)!==e.event_file)))throw new Error('retained_parent_error_invalid');
  }
  if(p.reported_count_lower_bound===null) {
    if(p.stage_reported_lower_bounds!==null || p.events.length || !p.errors.length)throw new Error('retained_parent_count_invalid');
  } else if(p.reported_count_lower_bound!==p.events.length || !exactFields(p.stage_reported_lower_bounds,stages.join(' '))
    || stages.some(stage=>!integer(p.stage_reported_lower_bounds[stage]) || p.stage_reported_lower_bounds[stage]!==p.events.filter(e=>e.stage===stage).length))throw new Error('retained_parent_count_invalid');
  if(p.state!==(p.errors.length?'observation_unknown':p.events.length?'reported_positive_events':'no_matching_reported_events'))throw new Error('retained_parent_state_invalid');
  if(p.event_store_sha256===null) {
    if(!p.errors.length || p.events.length)throw new Error('retained_parent_digest_invalid');
  } else if(typeof p.event_store_sha256!=='string' || !sourceHash.test(p.event_store_sha256)
    || p.event_store_sha256!==hash(JSON.stringify(p.events.map(e=>[e.event_id,e.event_file.sha256]))))throw new Error('retained_parent_digest_invalid');
  // Keep the full original privately, but expose only this typed projection.
  // No source names, raw records, arbitrary retained fields or H0 assertions.
  return {schema_version:1,company_run_id:r.id,window:{started_at:r.started_at,finished_at:r.finished_at},state:p.state,
    coverage:'partial_agent_reported_only',reported_count_lower_bound:p.reported_count_lower_bound,
    stage_reported_lower_bounds:p.stage_reported_lower_bounds===null?null:Object.fromEntries(stages.map(stage=>[stage,p.stage_reported_lower_bounds[stage]])),
    event_store_sha256:p.event_store_sha256,errors:p.errors.map(e=>({code:e.code})),
    parent_human_touches:null,parent_zero_touch_completion:null};
}

function finishedParentReports(stateRoot,failures) {
  const dir=path.join(path.resolve(stateRoot),'runs'),result=[];
  try {
    if(!fs.existsSync(dir))return result;
    privateDirectory(path.resolve(stateRoot));privateDirectory(dir);
    const files=fs.readdirSync(dir).filter(name=>companyId.test(name.slice(0,-5)) && name.endsWith('.json')).sort();
    if(files.length>eventLimit)throw new Error('run_store_limit');
    for(const file of files) {
      try {
        const {doc:r}=privateJson(path.join(dir,file),1024*1024);
        if(!Object.hasOwn(r,'parent_reported_interventions'))continue; // No historical backfill.
        if(![2,3].includes(r.schema_version) || r.status!=='verified_existing_autopilot' || file!==r.id+'.json'
)throw new Error('run_binding_invalid');
        const atFinish=retainedParentReport(r.parent_reported_interventions,r);
        const current=parentReportedInterventions({stateRoot,runId:r.id,startedAt:r.started_at,finishedAt:r.finished_at,
          canonicalInterventions:r.human_interventions,expectedEventStoreSha256:r.parent_reported_interventions.event_store_sha256});
        result.push({...current,at_finish_summary:atFinish,at_finish_observation_unknown:atFinish.state==='observation_unknown'});
      } catch {failures.push({source:'parent_reported_interventions',artifact:file,reason:'run_read_or_binding_failed'});}
    }
  } catch {failures.push({source:'parent_reported_interventions',reason:'run_store_unavailable_or_unbounded'});}
  return result;
}

export function observabilityStatus({stateRoot}) {
  const failures=[];
  const readEvents=child=>{
    let dir,files;const records=[];
    try {dir=directory(stateRoot,child);files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));}
    catch {failures.push({source:child,reason:'event_store_unavailable'});return records;}
    for(const file of files){
      try{const record=JSON.parse(fs.readFileSync(path.join(dir,file)));if(record.schema_version!==1)throw new Error('schema');records.push(record);}
      catch{failures.push({source:child,artifact:file,reason:'event_read_or_schema_failed'});}
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
    parent_reported_interventions:finishedParentReports(stateRoot,failures),
    native_resource_usage:nativeResourceStatus({stateRoot}),
    unknowns:['Unobserved historical events and parent-stage intervention coverage remain unknown.','No invoice-matched parent model/API cost is available here. Runtime milliseconds are not money.'],failures};
}
