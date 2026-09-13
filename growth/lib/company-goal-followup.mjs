import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {privateState,atomicJson,acquireLock} from './company-loop.mjs';
import {nativeOrigin} from './company-origin.mjs';
import {evaluateOperationalFollowup} from './company-followup.mjs';

const CONTRACT='docs/autonomy/RESIDUAL_OPERATIONS_GOAL.md';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const instant=x=>typeof x==='string' ? Date.parse(x) : NaN;
function context(stateRoot) {
  const root=privateState(stateRoot),goal=read(path.join(root,'GOAL_STATE.json'));
  if(!UUID.test(goal.native_goal_thread??'') || !goal.objective?.includes(CONTRACT)) throw new Error('Unrecognized residual Goal');
  return {root,goal};
}
function experiment(root,id) {
  const e=read(path.join(root,'operational-experiments.json')).experiments.find(e=>e.id===id);
  if(!e || !UUID.test(e.integration_run??'') || e.id!=='appsflyer-native-consumer-'+e.integration_run ||
     !Number.isFinite(instant(e.date)) || !Number.isFinite(instant(e.evaluation_date)) ||
     instant(e.evaluation_date)<instant(e.date)+7*86400000 || e.minimum_distinct_native_days!==7) throw new Error('Invalid registered seven-day experiment');
  return e;
}
export function registerGoalFollowup({stateRoot,experimentId,thread=process.env.CODEX_THREAD_ID,now=new Date()}) {
  const {root,goal}=context(stateRoot);
  if(thread!==goal.native_goal_thread || goal.status!=='IN_PROGRESS') throw new Error('Only the active residual Goal thread can register its follow-up');
  const e=experiment(root,experimentId), file=path.join(root,'goal-followup-target.json');
  const entry={schema_version:1,target_thread_id:thread,contract:CONTRACT,experiment_id:e.id,expected_owner:'obsidian',registered_at:now.toISOString()};
  const release=acquireLock(root,'goal-followup.lock');if(!release)return{status:'busy'};
  try {
    if(fs.existsSync(file)) {
      const old=read(file);
      if(old.target_thread_id!==thread || old.experiment_id!==e.id || old.contract!==CONTRACT) throw new Error('Existing Goal target differs; do not replace it');
      return {status:'already_registered',target:old};
    }
    atomicJson(file,entry);return {status:'registered',target:entry};
  } finally {release();}
}
function nativeThread(thread) {
  return JSON.parse(execFileSync('python3',[fileURLToPath(new URL('../../scripts/codex-routine-observer.py',import.meta.url)),'--thread-state',thread],
    {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
}
function observations(root,e,now,readThread) {
  const dir=path.join(root,'data/collection-events');
  if(!fs.existsSync(dir))return {rows:[],failures:[]};
  const candidates=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>({file:f,event:read(path.join(dir,f))}))
    .filter(({event:v})=>v?.native_origin?.state==='native_execution_record' && v.native_origin.automation_id==='obsidian' &&
      !(Number.isFinite(instant(v.observed_at)) && instant(v.observed_at)<instant(e.date)));
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
// This prepares a tool handoff. It never invokes a model, sends a message or changes Goal status.
export function goalWake({stateRoot,now=new Date(),reserve=false,origin=nativeOrigin,readThread=nativeThread}={}) {
  const root=privateState(stateRoot),file=path.join(root,'goal-followup-target.json');
  if(!fs.existsSync(file))return{status:'not_registered'};
  const {goal}=context(root);
  if(!['IN_PROGRESS','BLOCKED'].includes(goal.status))return{status:'goal_not_pending'};
  const target=read(file);
  if(target.schema_version!==1 || target.contract!==CONTRACT || target.target_thread_id!==goal.native_goal_thread || target.expected_owner!=='obsidian') throw new Error('Goal handoff target mismatch');
  const e=experiment(root,target.experiment_id), {rows,failures}=observations(root,e,now,readThread);
  // Do not improve a rate by silently dropping unverified claimed native runs.
  if(failures.length)return {status:'native_evidence_unverified',failures,natural_events:rows.length};
  const eligible=rows.map(x=>x.event);
  const evaluation=evaluateOperationalFollowup({...e,status:'RUNNING'},eligible,now);
  const first=rows.find(x=>x.event.receipts.some(r=>r.source==='appsflyer' && r.receipt?.status==='verified'));
  // A date or stored WIN label cannot substitute for real native collection events.
  const milestone=evaluation.due && evaluation.actual_impact?.distinct_days>=7 ? 'seven_native_days' : first ? 'first_native_collection' : null;
  if(!milestone)return {status:'waiting_for_native_evidence',evaluation_date:e.evaluation_date,natural_events:rows.length};
  const id=hash({thread:target.target_thread_id,experiment:e.id,milestone});
  const dir=privateState(path.join(root,'goal-wake-events')),eventFile=path.join(dir,id+'.json');
  const release=acquireLock(root,'goal-followup.lock');if(!release)return{status:'busy'};
  try {
    if(fs.existsSync(eventFile)) {
      const old=read(eventFile);
      if(old.schema_version!==1 || old.id!==id || old.target_thread_id!==target.target_thread_id ||
        old.marker!=='[company-goal-wake:'+id+']' || !['delivery_unconfirmed','received'].includes(old.status)) throw new Error('Invalid reserved Goal event');
      return {status:old.status==='received'?'already_received':'reconcile_delivery',event_id:id,target_thread_id:old.target_thread_id,
        marker:old.marker,reason:'A send was reserved; inspect the existing target thread for this marker. Never blindly send it again.'};
    }
    const marker='[company-goal-wake:'+id+']';
    const evidence=(milestone==='first_native_collection'?[first]:rows).map(x=>({file:x.file,sha256:hash(x.event),native_transcript_sha256:x.native_transcript_sha256}));
    const message=marker+'\n既存のSimpleMemo日次運転で、'+(milestone==='first_native_collection'?'初回の検証済み自然データ収集':'7日分の自然実行に基づく評価可能な証拠')+'を確認しました。'+
      CONTRACT+' と ~/.config/simplememo/company-os/GOAL_STATE.json、goal-wake-events/'+id+'.json の原典を確認して既存Goalを再評価してください。これは完了通知ではありません。受信したこの通知IDを company-os.mjs acknowledge-goal-wake --event '+id+' で記録し、実際の残件を続行してください。人間の手動依頼や新しい自然実行として数えず、Goal状態はネイティブ機能で確認してください。';
    if(!reserve)return {status:'ready',event_id:id,milestone,target_thread_id:target.target_thread_id,marker,message};
    const source=origin();
    if(source.state!=='native_execution_record' || source.automation_id!=='obsidian' || !UUID.test(source.thread_id??'') || source.thread_id===target.target_thread_id) throw new Error('Only the admitted existing daily owner may reserve a wake');
    const record={schema_version:1,id,status:'delivery_unconfirmed',reserved_at:now.toISOString(),milestone,
      target_thread_id:target.target_thread_id,sender_origin:source,marker,message,evidence,
      evaluation:milestone==='seven_native_days'?evaluation.actual_impact:null,
      delivery_policy:'one reserved native tool send; uncertain delivery requires reconciliation; no automatic resend',goal_completed:false};
    atomicJson(eventFile,record);
    return {status:'dispatch_once',event_id:id,target_thread_id:target.target_thread_id,marker,message};
  } finally {release();}
}
export function acknowledgeGoalWake({stateRoot,eventId,thread=process.env.CODEX_THREAD_ID,now=new Date()}) {
  const {root,goal}=context(stateRoot);
  if(thread!==goal.native_goal_thread || !/^[a-f0-9]{64}$/.test(eventId??'')) throw new Error('Only the receiving Goal thread can acknowledge this event');
  const release=acquireLock(root,'goal-followup.lock');if(!release)return{status:'busy'};
  try {
    const file=path.join(root,'goal-wake-events',eventId+'.json'),r=read(file);
    if(r.id!==eventId || r.target_thread_id!==thread)throw new Error('Goal event target mismatch');
    if(r.status==='received')return{status:'already_received',event_id:eventId};
    if(r.status!=='delivery_unconfirmed')throw new Error('Unknown Goal event state');
    atomicJson(file,{...r,status:'received',received_at:now.toISOString(),acknowledgement:'agent_reported_in_receiving_host_thread; not independent transport proof'});
    return{status:'received',event_id:eventId,goal_completed:false};
  } finally {release();}
}
