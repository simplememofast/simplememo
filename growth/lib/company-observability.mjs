import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { privateState, atomicJson, acquireLock } from './company-loop.mjs';
import { nativeOrigin } from './company-origin.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stages = ['detect', 'decide', 'execute', 'verify', 'report', 'learn'];
const kinds = ['manual_start', 'manual_decision', 'manual_execution', 'manual_verification', 'manual_reporting', 'approval', 'credential'];
const commands = ['follow-up','register-growth-followup','evaluate-growth-followup','register-goal-followup','goal-wake','acknowledge-goal-wake','bind','finish','collect','run','autonomy-lift','growth-autopilot','autonomy-status','autonomy-audit','growth-audit','review','growth-status','content-gap','aio-audit','observability-status','record-human-touch'];
const directory = (root, child) => privateState(path.join(privateState(root), child));

// Subprocess measurements are not observations of all parent-session handoffs.
export function recordCommand({stateRoot, command, startedAt, durationMs, result, failed=false, origin=nativeOrigin(), now=new Date()}) {
  if (!commands.includes(command) || !Number.isFinite(durationMs) || durationMs < 0 || !Number.isFinite(Date.parse(startedAt)) || Date.parse(startedAt)>now.getTime()) throw new Error('Invalid command measurement');
  const resultBytes=JSON.stringify(result ?? null);
  const record={schema_version:1,kind:'component_command',id:randomUUID(),command,started_at:startedAt,
    observed_at:now.toISOString(),duration_ms:durationMs,execution_state:failed?'failed':'returned',
    result_status:typeof result?.status==='string'?result.status:null,result_sha256:hash(resultBytes),
    source_failures:result?.failures?.length ?? result?.source_failures?.length ?? null,
    company_run_id:typeof result?.id==='string'?result.id:null,origin,
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
    unknowns:['Unobserved historical events and parent-stage intervention coverage remain unknown.','No invoice-matched parent model/API cost is available here. Runtime milliseconds are not money.'],failures};
}
