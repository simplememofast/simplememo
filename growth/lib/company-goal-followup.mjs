import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {privateState,atomicJson,acquireLock} from './company-loop.mjs';
import {nativeOrigin} from './company-origin.mjs';
import {evaluateOperationalFollowup} from './company-followup.mjs';
import {nativeCollections,nativeThread} from './company-native-evidence.mjs';
import {measurementHandoffEvidence} from './company-measurement.mjs';

const CONTRACT='docs/autonomy/RESIDUAL_OPERATIONS_GOAL.md';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const instant=x=>typeof x==='string' ? Date.parse(x) : NaN;
const growthKinds=new Set(['verified_growth_delivery','reviewed_growth_measurement']);
const milestoneId=(target,event)=>hash({thread:target.target_thread_id,experiment:event.experiment_id??target.experiment_id,
  milestone:event.milestone,...(growthKinds.has(event.milestone)?{identity:event.identity}:{})});
function validEvent(record,id,target) {
  if(record.schema_version!==1||record.id!==id||record.target_thread_id!==target.target_thread_id||
    record.marker!=='[company-goal-wake:'+id+']'||!['delivery_unconfirmed','received'].includes(record.status))throw new Error('Invalid reserved Goal event');
  if(growthKinds.has(record.milestone)) {
    if(!/^[a-z0-9][a-z0-9-]{2,99}$/.test(record.experiment_id??'')||!/^[a-f0-9]{64}$/.test(record.identity??''))throw new Error('Invalid Growth event identity');
  } else if(!['first_native_collection','seven_native_days'].includes(record.milestone))throw new Error('Unknown Goal milestone');
  if(milestoneId(target,record)!==id)throw new Error('Goal event identity changed');
}
const reservedResult=(record,failures=[])=>({status:record.status==='received'?'already_received':'reconcile_delivery',event_id:record.id,
  target_thread_id:record.target_thread_id,marker:record.marker,failures,
  reason:'A send was reserved; inspect the existing target thread for this marker. Never blindly send it again.'});
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
// This prepares a tool handoff. It never invokes a model, sends a message or changes Goal status.
export function goalWake({stateRoot,now=new Date(),reserve=false,origin=nativeOrigin,readThread=nativeThread,readGrowth=measurementHandoffEvidence}={}) {
  const root=privateState(stateRoot),file=path.join(root,'goal-followup-target.json');
  if(!fs.existsSync(file))return{status:'not_registered'};
  const {goal}=context(root);
  if(!['IN_PROGRESS','BLOCKED'].includes(goal.status))return{status:'goal_not_pending'};
  const target=read(file);
  if(target.schema_version!==1 || target.contract!==CONTRACT || target.target_thread_id!==goal.native_goal_thread || target.expected_owner!=='obsidian') throw new Error('Goal handoff target mismatch');
  const e=experiment(root,target.experiment_id),dir=path.join(root,'goal-wake-events');
  const release=acquireLock(root,'goal-followup.lock');if(!release)return{status:'busy'};
  try {
    const retained=new Map();
    if(fs.existsSync(dir)) {
      privateState(dir);
      for(const file of fs.readdirSync(dir).filter(f=>/^[a-f0-9]{64}\.json$/.test(f))) {
        const record=read(path.join(dir,file));
        if(record.target_thread_id!==target.target_thread_id)continue;
        const id=file.slice(0,-5);validEvent(record,id,target);retained.set(id,record);
      }
    }
    // Uncertain delivery is reconciled before another milestone can send. This
    // does not require repeating paid work or revalidating a now-stale source.
    const pending=[...retained.values()].find(r=>r.status==='delivery_unconfirmed');if(pending)return reservedResult(pending);
    const candidates=[],failures=[];let rows=[],collectionFailed=false;
    try {
      const collected=nativeCollections({stateRoot:root,since:e.date,now,readThread});rows=collected.rows;
      failures.push(...collected.failures);collectionFailed=collected.failures.length>0;
      // Never turn a subset of unverified claimed native runs into a better rate.
      if(!collectionFailed) {
        const evaluation=evaluateOperationalFollowup({...e,status:'RUNNING'},rows.map(x=>x.event),now);
        const first=rows.find(x=>x.event.receipts.some(r=>r.source==='appsflyer'&&r.receipt?.status==='verified'));
        const milestone=evaluation.due&&evaluation.actual_impact?.distinct_days>=7?'seven_native_days':first?'first_native_collection':null;
        if(milestone)candidates.push({milestone,experiment_id:e.id,
          evidence:(milestone==='first_native_collection'?[first]:rows).map(x=>({file:x.file,sha256:hash(x.event),native_transcript_sha256:x.native_transcript_sha256})),
          evaluation:milestone==='seven_native_days'?evaluation.actual_impact:null});
      }
    }catch{collectionFailed=true;failures.push({source:'native_collection',reason:'native_evidence_read_or_validation_failed'});}
    try {
      const growth=readGrowth({stateRoot:root,now,readThread,excludeIdentities:[...retained.values()].filter(r=>r.status==='received'&&growthKinds.has(r.milestone)).map(r=>r.identity)});
      failures.push(...growth.failures);candidates.push(...growth.events);
    }catch{failures.push({source:'growth_goal_evidence',reason:'growth_evidence_read_or_validation_failed'});}
    const selected=candidates.find(c=>!retained.has(milestoneId(target,c)));
    if(!selected) {
      const received=candidates.map(c=>retained.get(milestoneId(target,c))).find(Boolean);
      if(received)return reservedResult(received,failures);
      return{status:collectionFailed?'native_evidence_unverified':'waiting_for_native_evidence',failures,evaluation_date:e.evaluation_date,natural_events:rows.length};
    }
    const {milestone}=selected,id=milestoneId(target,selected),eventFile=path.join(dir,id+'.json');
    const marker='[company-goal-wake:'+id+']';
    const descriptions={first_native_collection:'初回の検証済み自然データ収集',seven_native_days:'7日分の自然実行に基づく評価可能な証拠',
      verified_growth_delivery:'測定計画と判断に結び付いたGrowth施策の検証済み公開',reviewed_growth_measurement:'元の測定期間・原典に一致するGrowth評価結果'};
    const message=marker+'\n既存のSimpleMemo日次運転で、'+descriptions[milestone]+'を確認しました。'+
      CONTRACT+' と ~/.config/simplememo/company-os/GOAL_STATE.json、goal-wake-events/'+id+'.json の原典を確認して既存Goalを再評価してください。これは完了通知ではありません。受信したこの通知IDを company-os.mjs acknowledge-goal-wake --event '+id+' で記録し、実際の残件を続行してください。人間の手動依頼や新しい自然実行として数えず、Goal状態はネイティブ機能で確認してください。';
    if(!reserve)return {status:'ready',event_id:id,milestone,target_thread_id:target.target_thread_id,marker,message,failures};
    const source=origin();
    if(source.state!=='native_execution_record' || source.automation_id!=='obsidian' || !UUID.test(source.thread_id??'') || source.thread_id===target.target_thread_id) throw new Error('Only the admitted existing daily owner may reserve a wake');
    const record={schema_version:1,id,status:'delivery_unconfirmed',reserved_at:now.toISOString(),milestone,
      target_thread_id:target.target_thread_id,sender_origin:source,marker,message,evidence:selected.evidence,
      ...(growthKinds.has(milestone)?{experiment_id:selected.experiment_id,identity:selected.identity,occurred_at:selected.occurred_at,
        native_origin:selected.native_origin,native_proof:selected.native_proof,source_main_sha:selected.source_main_sha}:{}),
      evaluation:selected.evaluation??null,source_failures:failures,
      delivery_policy:'one reserved native tool send; uncertain delivery requires reconciliation; no automatic resend',goal_completed:false};
    privateState(dir);atomicJson(eventFile,record);
    return {status:'dispatch_once',event_id:id,target_thread_id:target.target_thread_id,marker,message,failures};
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
