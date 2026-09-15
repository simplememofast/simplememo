import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {privateState, atomicJson, acquireLock} from './company-loop.mjs';

const FILE='native-resource-usage.json';
const FIELDS=['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'];
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const fail=()=>{throw new Error('Native resource evidence is unavailable or invalid');};
const instant=x=>typeof x==='string'?Date.parse(x):NaN;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

export function validateNativeResources(d,now=new Date()) {
  if(!exact(d,['schema_version','observed_at','registered','scope','runs','billing_usd','model_price_estimate_usd','limitations'])||![1,2].includes(d.schema_version)||
    JSON.stringify(d.registered)!=='["obsidian","obsidian-2"]'||d.scope!=='private_original_scheduled_turn_counters'||
    !Number.isFinite(instant(d.observed_at))||instant(d.observed_at)>+now||d.billing_usd!==null||d.model_price_estimate_usd!==null||
    !Array.isArray(d.runs)||d.runs.length>256||!Array.isArray(d.limitations)||d.limitations.some(x=>typeof x!=='string'))fail();
  const seen=new Set();
  for(const r of d.runs) {
    if(!exact(r,['thread_id','automation_id','original_turn_id','original_turn_state','started_at','finished_at','usage'])||
      !UUID.test(r.thread_id)||seen.has(r.thread_id)||!d.registered.includes(r.automation_id))fail();
    seen.add(r.thread_id);
    if(r.original_turn_id===null) {if(r.original_turn_state!==null||r.started_at!==null||r.finished_at!==null||r.usage?.state!=='unknown')fail();}
    else if(!UUID.test(r.original_turn_id)||!['in_progress','completed','failed','aborted'].includes(r.original_turn_state)||
      !Number.isFinite(instant(r.started_at))||instant(r.started_at)>instant(d.observed_at)||
      (r.original_turn_state==='in_progress'?r.finished_at!==null:
        !(instant(r.started_at)<=instant(r.finished_at)&&instant(r.finished_at)<=instant(d.observed_at))))fail();
    const u=r.usage;
    if(u?.state==='unknown') {
      if(!exact(u,d.schema_version===1?['state','reason','counters']:['state','reason','counters','original_prefix_sha256'])||u.counters!==null||
        (d.schema_version===2&&u.original_prefix_sha256!==null&&!HASH.test(u.original_prefix_sha256))||
        !['transcript_unavailable','transcript_missing_or_too_large','usage_not_observed','usage_invalid_or_unattributable'].includes(u.reason))fail();
      if(d.schema_version===2&&['usage_not_observed','usage_invalid_or_unattributable'].includes(u.reason)&&!HASH.test(u.original_prefix_sha256??''))fail();
    } else if(u?.state==='observed') {
      if(!exact(u,['state','reason','counters','samples','last_sample_at','original_prefix_sha256','coverage'])||u.reason!==null||
        !exact(u.counters,FIELDS)||!FIELDS.every(k=>Number.isSafeInteger(u.counters[k])&&u.counters[k]>=0)||
        !Number.isSafeInteger(u.samples)||u.samples<1||!HASH.test(u.original_prefix_sha256)||
        !(instant(r.started_at)<=instant(u.last_sample_at)&&instant(u.last_sample_at)<=instant(r.finished_at??d.observed_at))||
        u.coverage!=='host_reported_through_last_sample; not billed usage or proof of complete model accounting')fail();
      const c=u.counters;
      if(c.input_tokens+c.output_tokens!==c.total_tokens||c.cached_input_tokens>c.input_tokens||
        c.cache_write_input_tokens>c.input_tokens||c.reasoning_output_tokens>c.output_tokens)fail();
    } else fail();
  }
  return d;
}

function readPrivate(file,now) {
  const st=fs.lstatSync(file);
  if(!st.isFile()||st.size>4*1024*1024)fail();
  return validateNativeResources(JSON.parse(fs.readFileSync(file,'utf8')),now);
}

export function collectNativeResources({stateRoot,now=new Date(),run=execFileSync}={}) {
  const release=acquireLock(stateRoot,'native-resource-usage.lock');
  if(!release)return {status:'busy',source:'registered_native_original_turn_counters'};
  const file=path.join(stateRoot,'data',FILE);
  try {
    privateState(path.dirname(file));
    const script=fileURLToPath(new URL('../../scripts/codex-routine-observer.py',import.meta.url));
    const d=validateNativeResources(JSON.parse(run('python3',[script,'--resource-report'],
      {encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe']})),new Date(Math.max(+now,Date.now())));
    if(d.schema_version!==2)fail(); // v1 is accepted only as retained pre-upgrade evidence
    if(fs.existsSync(file)) {
      const old=readPrivate(file,new Date(Math.max(+now,Date.now()))),byId=new Map(d.runs.map(r=>[r.thread_id,r]));
      if(instant(d.observed_at)<instant(old.observed_at))fail();
      for(const a of old.runs) {
        const b=byId.get(a.thread_id);
        if(!b||a.automation_id!==b.automation_id||(a.original_turn_id!==null&&a.original_turn_id!==b.original_turn_id))fail();
        if(a.original_turn_id!==null&&a.started_at!==b.started_at)fail();
        if(a.original_turn_id!==null&&a.original_turn_state!=='in_progress') {
          if(['original_turn_id','original_turn_state','started_at','finished_at'].some(k=>a[k]!==b[k]))fail();
          if(a.usage.original_prefix_sha256&&a.usage.original_prefix_sha256!==b.usage.original_prefix_sha256)fail();
        }
        if(a.usage.state==='observed') {
          if(b.usage.state!=='observed'||FIELDS.some(k=>b.usage.counters[k]<a.usage.counters[k]))fail();
          if(a.original_turn_state!=='in_progress'&&JSON.stringify(a)!==JSON.stringify(b))fail();
        }
      }
    }
    atomicJson(file,d);
    const receipt={status:d.runs.some(r=>r.usage.state==='unknown')?'partial':'verified',observed_at:d.observed_at,
      source:'registered_native_original_turn_counters',billing_usd:null,private_file:FILE};
    atomicJson(file+'.health.json',receipt);
    return receipt;
  } catch {
    // Keep prior evidence on a failed read; the health marker prevents stale
    // success from concealing the failed refresh. No exception text is retained.
    const receipt={status:'unavailable',observed_at:now.toISOString(),source:'registered_native_original_turn_counters',
      billing_usd:null,reason:'resource_read_or_validation_failed',private_file:FILE};
    atomicJson(file+'.health.json',receipt);
    return receipt;
  } finally {release();}
}

export function nativeResourceStatus({stateRoot,now=new Date()}) {
  try {
    const file=path.join(stateRoot,'data',FILE),d=readPrivate(file,now);
    const health=JSON.parse(fs.readFileSync(file+'.health.json','utf8'));
    if(!['verified','partial','unavailable'].includes(health.status)||!Number.isFinite(instant(health.observed_at))||
      instant(health.observed_at)>+now||(health.status!=='unavailable'&&health.observed_at!==d.observed_at))fail();
    const fresh=+now-instant(d.observed_at)<=36*3600000;
    const rows=d.runs.filter(r=>r.usage.state==='observed');
    const sum=k=>{const n=rows.reduce((n,r)=>n+r.usage.counters[k],0);return Number.isSafeInteger(n)?n:null;};
    return {status:health.status==='unavailable'?'unavailable':fresh?health.status:'stale',observed_at:d.observed_at,
      scope:d.scope,registered_runs:d.runs.length,observed_counter_runs:rows.length,unknown_counter_runs:d.runs.length-rows.length,
      original_failed_runs_included:rows.filter(r=>['failed','aborted'].includes(r.original_turn_state)).length,
      recorded_counter_totals:rows.length?Object.fromEntries(FIELDS.map(k=>[k,sum(k)])):null,
      billing_usd:null,model_price_estimate_usd:null,cost_per_shipped_improvement_usd:null,
      note:'Totals cover only observed original-turn host counters, including cached input. Unknown rows are not zero. Not billable usage, full model accounting or formal autonomy credit.'};
  } catch {return {status:'unavailable',billing_usd:null,reason:'private_resource_evidence_unavailable'};}
}
