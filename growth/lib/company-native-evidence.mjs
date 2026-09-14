import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const instant=x=>typeof x==='string' ? Date.parse(x) : NaN;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));

export function nativeThread(thread) {
  return JSON.parse(execFileSync('python3',[fileURLToPath(new URL('../../scripts/codex-routine-observer.py',import.meta.url)),'--thread-state',thread],
    {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
}

// Shared with the existing Goal wake verifier. A stored origin label alone
// cannot prove that collection happened inside an admitted original turn.
export function nativeCollections({stateRoot,since='1970-01-01T00:00:00Z',now=new Date(),readThread=nativeThread}) {
  const dir=path.join(stateRoot,'data/collection-events');
  if(!fs.existsSync(dir))return {rows:[],failures:[]};
  const candidates=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>({file:f,event:read(path.join(dir,f))}))
    .filter(({event:v})=>v?.native_origin?.state==='native_execution_record' && v.native_origin.automation_id==='obsidian' &&
      !(Number.isFinite(instant(v.observed_at)) && instant(v.observed_at)<instant(since)));
  const rows=[],failures=[],states=new Map();
  if(new Set(candidates.map(x=>x.event.native_origin.thread_id)).size>64)throw new Error('Native evidence scope exceeds bounded inspection; do not sample the denominator');
  for(const row of candidates) {
    const v=row.event,source=v.native_origin,at=instant(v.observed_at);
    try {
      if(v.schema_version!==1 || !Number.isFinite(at) || at>now.getTime() || !Array.isArray(v.receipts) ||
        !UUID.test(source.thread_id??'') || !UUID.test(source.original_turn_id??'') || !/^[a-f0-9]{64}$/.test(source.gate_receipt_sha256??'')) throw new Error('Invalid native claim');
      if(!states.has(source.thread_id)) {
        try {states.set(source.thread_id,readThread(source.thread_id));} catch {states.set(source.thread_id,null);}
      }
      const state=states.get(source.thread_id),first=state?.original_turn,gate=state?.gate_receipt;
      const end=first?.finished_at===null && first.state==='in_progress'?now.getTime():instant(first?.finished_at);
      if(state?.thread_id!==source.thread_id || state.automation_id!=='obsidian' || state.original_turn_id!==source.original_turn_id ||
        first?.turn_id!==source.original_turn_id || gate?.admitted!==true || gate.thread_id!==source.thread_id ||
        gate.turn_id!==source.original_turn_id || gate.sha256!==source.gate_receipt_sha256 ||
        !(instant(first.started_at)<=instant(gate.observed_at) && instant(gate.observed_at)<=at && at<=end && at<=instant(state.observed_at))) throw new Error('Native source mismatch');
      rows.push({...row,native_transcript_sha256:state.transcript_sha256});
    } catch {failures.push({file:row.file,reason:'native_origin_unavailable_or_mismatched'});}
  }
  return {rows:rows.sort((a,b)=>instant(a.event.observed_at)-instant(b.event.observed_at) || a.file.localeCompare(b.file)),failures};
}

export function appsflyerConsumerEvidence(options) {
  const base={schema_version:1,owner:'obsidian',scope:'Historical original-turn collection; not current scheduler health, seven-day acceptance or parent zero-touch proof'};
  try {
    const {rows,failures}=nativeCollections(options);
    const latest=[...new Map(rows.map(r=>[r.event.native_origin.thread_id,r])).values()];
    const attempted=rows.filter(r=>r.event.receipts.some(x=>x?.source==='appsflyer') || r.event.failures?.some(x=>x?.source==='appsflyer'));
    const latestSource=[...new Map(attempted.map(r=>[r.event.native_origin.thread_id,r])).values()];
    const successful=latestSource.filter(r=>!r.event.failures?.some(x=>x?.source==='appsflyer') &&
      r.event.receipts.some(x=>x?.source==='appsflyer' && x.receipt?.status==='verified'));
    return {...base,state:failures.length?'unverified':successful.length?'verified':'not_observed',
      observed_native_runs:latest.length,appsflyer_attempted_native_runs:latestSource.length,successful_native_runs:successful.length,failures,
      evidence:successful.map(r=>({file:r.file,thread_id:r.event.native_origin.thread_id,
        original_turn_id:r.event.native_origin.original_turn_id,observed_at:r.event.observed_at,
        gate_receipt_sha256:r.event.native_origin.gate_receipt_sha256,native_transcript_sha256:r.native_transcript_sha256}))};
  } catch {
    return {...base,state:'unverified',observed_native_runs:null,appsflyer_attempted_native_runs:null,successful_native_runs:null,evidence:[],
      failures:[{reason:'native_evidence_read_or_validation_failed'}]};
  }
}
