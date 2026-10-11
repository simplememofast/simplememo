// Prospective business-action proof for the existing experiment evaluator.
// This is not shipped-code proof or complete human-intervention observation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {ROOT,digest} from './company-metrics.mjs';
import {privateState,acquireLock,atomicJson,observe,opportunities} from './company-loop.mjs';
import {DECISIONS,isDue,validate} from './ledger.mjs';
import {reviewEvidence,gscEvidence} from './experiment-evidence.mjs';
import {judge,todayJst} from '../../scripts/autonomy-eligibility.mjs';
import {evaluateCompanySpending} from '../../scripts/lib/company-monthly-budget.mjs';
import {verifyMergedChange,verifyOperationalDelivery} from './company-proof.mjs';
import {nativeOrigin} from './company-origin.mjs';

export const EVALUATION_LEDGER='growth/experiments/experiments.json';
export const EVALUATION_STATUS='verified_existing_experiment_evaluation';
export const evaluationIntentPath=id=>{
  assert(typeof id==='string' && /^[a-z0-9][a-z0-9-]{2,99}$/.test(id),'invalid typed intent ID');
  return `docs/autonomy/company-evaluation-intents/${id}.json`;
};
const ALLOWED=['status','decision','evaluated_at','evidence'];
const SHA=/^[a-f0-9]{64}$/;
const COMMIT=/^[a-f0-9]{40}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_FILE=4*1024*1024;
const CODE=['growth/lib/company-evaluation.mjs','growth/lib/company-decision.mjs','growth/lib/company-proof.mjs',
  'growth/lib/company-loop.mjs','growth/lib/company-metrics.mjs','growth/lib/company-measurement.mjs',
  'growth/lib/experiment-evidence.mjs','growth/lib/ledger.mjs','growth/lib/experiment-coexistence.mjs',
  'growth/lib/gsc.mjs','growth/scripts/experiments.mjs','scripts/company-os.mjs',
  'scripts/autonomy-eligibility.mjs','scripts/lib/company-monthly-budget.mjs','scripts/decision-ci.mjs','scripts/decision-monitor.mjs',
  'growth/lib/company-origin.mjs','scripts/codex-routine-observer.py',
  'scripts/codex-autopilot-preflight.mjs','scripts/autopilot-gate.mjs','scripts/codex-recovery-permit.py',
  'docs/codex-autopilot-execution.md','docs/obsidian/AUTOPILOT_RUNBOOK.md','docs/autonomy/OPERATING_RUNBOOK.md','CLAUDE.md'];
const POLICIES=['data/emergency-stop.json','data/authority-matrix.json','data/company-monthly-budget.json',
  'data/eligibility-policy.json','data/autonomy-score.json','data/model-routing.json','data/autopilot-cost.json'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const encoded=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const candidateHash=c=>digest(JSON.parse(JSON.stringify(c,(k,v)=>k==='checked_at'?undefined:v)));
const object=x=>x!==null && typeof x==='object' && !Array.isArray(x);
const text=x=>typeof x==='string' && x.trim().length>=20 && x.length<=2000;
function exact(x,keys){assert(object(x) && Object.keys(x).length===keys.length && keys.every(k=>Object.hasOwn(x,k)),'unexpected or missing typed fields');}
function stamp(now){assert(now instanceof Date && Number.isFinite(+now) && +now<=Date.now(),'invalid or future actual time');return now.toISOString();}
function time(value){
  const parts=typeof value==='string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  assert(parts,'dated actual event required');const [year,month,day,hour,minute,second]=parts.slice(1,7).map(Number),wall=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  assert(wall.getUTCFullYear()===year && wall.getUTCMonth()===month-1 && wall.getUTCDate()===day && hour<24 && minute<60 && second<60,'invalid actual calendar time');
  if(parts[7]!=='Z'){const [hours,minutes]=parts[7].slice(1).split(':').map(Number);assert(hours<=23 && minutes<60,'invalid time offset');}
  const n=Date.parse(value);assert(Number.isFinite(n),'invalid actual event time');return n;
}
const run=(name,args,opts={})=>execFileSync(name,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe'],...opts});
function git(call,root,args){return call('git',args,{cwd:root}).trim();}
function clean(call,root){const head=git(call,root,['rev-parse','HEAD']);assert(COMMIT.test(head),'committed source required');assert.equal(git(call,root,['status','--porcelain']),'','clean source required');return head;}
function bytes(file,{base,privateFile=false}={}){
  assert(typeof file==='string','exact file path required');const p=path.resolve(file),boundary=fs.realpathSync(base);
  assert(p.startsWith(boundary+path.sep),'file outside allowed root');
  for(let at=p;at!==boundary;at=path.dirname(at))assert(!fs.lstatSync(at).isSymbolicLink(),'symlink evidence not allowed');
  const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {const s=fs.fstatSync(fd);assert(s.isFile() && s.size>0 && s.size<=MAX_FILE,'bounded regular evidence required');
    if(privateFile)assert(s.uid===process.getuid() && !(s.mode&0o077),'owned private evidence required');
    const b=fs.readFileSync(fd);assert(b.length===s.size,'evidence changed during read');return b;
  } finally {fs.closeSync(fd);}
}
function parse(b){const x=JSON.parse(b);const walk=v=>{if(typeof v==='number')assert(Number.isFinite(v),'nonfinite JSON value');if(v && typeof v==='object')for(const z of Object.values(v))walk(z);};walk(x);return x;}
const read=(file,base,priv=true)=>parse(bytes(file,{base,privateFile:priv}));
function saveOnce(file,x){const b=encoded(x);const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,b);}finally{fs.closeSync(fd);}return hash(b);}
function saveRawOnce(file,b){const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,b);}finally{fs.closeSync(fd);}return hash(b);}
function replaceEvaluatedLedger(file,expected,next){
  const fd=fs.openSync(file,fs.constants.O_RDWR|fs.constants.O_NOFOLLOW);
  try{assert(fs.fstatSync(fd).isFile(),'regular original ledger required');const current=fs.readFileSync(fd);assert.equal(hash(current),hash(expected),'concurrent ledger write prevents packaging');fs.ftruncateSync(fd,0);fs.writeSync(fd,next,0,next.length,0);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function loadRun(dir,id){assert(UUID.test(id),'exact Company UUID required');const r=read(path.join(dir,'runs',id+'.json'),dir);assert(r.id===id && [2,3].includes(r.schema_version),'new Company receipt required');return r;}
function persist(dir,r){atomicJson(path.join(dir,'runs',r.id+'.json'),r);atomicJson(path.join(dir,'latest-run.json'),r);}
function pins(root){return Object.fromEntries([...CODE,...POLICIES,EVALUATION_LEDGER].map(p=>[p,hash(bytes(path.join(root,p),{base:root}))]));}
function verifyPins(p,root,{ledger=true}={}){for(const [file,h]of Object.entries(p))if(ledger || file!==EVALUATION_LEDGER)assert.equal(hash(bytes(path.join(root,file),{base:root})),h,'sealed source changed: '+file);}
function runContext(r){return {started_at:r.started_at,observed_at:r.observed_at,route:r.route,origin:r.origin,
  origin_proof:r.origin_proof,execution_boundary:r.execution_boundary,selected:r.selected??null,candidates_sha256:digest(r.candidates)};}
// Only the existing host observer supplies production origin evidence. The
// callback is a synthetic-test seam; it is never an accepted CLI input.
function actualOrigin({root,call}){
  let row=null;const proof=nativeOrigin({call:(name,args,opts)=>{const raw=call(name,args,{cwd:root,...opts});row=parse(Buffer.from(raw));return raw;}});
  const last=row?.latest_turn;return {proof,gate_receipt:row?.gate_receipt??null,
    host_turn:last?{turn_id:last.turn_id,started_at:last.started_at,state:last.state,finished_at:last.finished_at}:null};
}
function rejectOtherTurnAction(r,dir,thread,turn,now){
  const files=fs.readdirSync(path.join(dir,'runs')).filter(f=>UUID.test(f.slice(0,-5)) && f.endsWith('.json'));assert(files.length<=1000,'bounded run registry required');
  for(const file of files){if(file===r.id+'.json')continue;const other=read(path.join(dir,'runs',file),dir);
    const priorThread=other.decision?.seal?.execution_origin?.thread_id??other.origin_proof?.thread_id;
    const acted=other.decision!=null || other.bound_autopilot_run_id!=null || other.evaluation_bound!=null || other.evaluation_execution!=null
      || other.evidence_of_completion!=null || ['running','completed','failed'].includes(other.stages?.execute);
    if(!acted)continue;
    if(typeof priorThread!=='string' || !UUID.test(priorThread)){
      assert(time(other.started_at)<=+now && time(other.started_at)<time(turn.started_at),'another current-window action has unknown host ownership');continue;
    }
    if(priorThread!==thread)continue;
    const priorTurn=other.decision?.seal?.execution_origin?.host_turn?.turn_id??other.origin_proof?.original_turn_id;
    assert(priorTurn!==turn.turn_id,'another Company action already owns this host turn');
    assert(time(other.started_at)<=+now,'another action has an unknown or future window');
    // A legacy action without a turn ID is historical only when its real
    // recorded start precedes this host turn. Never invent a missing identity.
    if(typeof priorTurn!=='string' || !UUID.test(priorTurn))assert(time(other.started_at)<time(turn.started_at),'another action in this host turn has unknown identity');
    else assert(time(other.started_at)<time(turn.started_at),'another current-window action has inconsistent turn identity');
  }
}
function executionOrigin(r,dir,root,call,now,originReader){
  assert(time(r.started_at)<=time(r.observed_at) && time(r.observed_at)<=+now && +now-time(r.observed_at)<=6*3600000,'fresh actual observation required');
  const current=originReader({root,call});exact(current,['proof','gate_receipt','host_turn']);const p=current.proof,turn=current.host_turn;
  assert(object(p) && object(r.origin_proof),'actual host origin is unknown');
  exact(turn,['turn_id','started_at','state','finished_at']);
  assert(typeof turn.turn_id==='string' && UUID.test(turn.turn_id) && turn.state==='in_progress' && turn.finished_at===null && time(turn.started_at)<=time(r.started_at),'actual live host turn required');
  assert(typeof p.thread_id==='string' && UUID.test(p.thread_id),'actual host thread required');rejectOtherTurnAction(r,dir,p.thread_id,turn,now);
  const day=todayJst(now),branch='claude/obsidian-auto-'+day.replaceAll('-','');
  const raw=git(call,root,['ls-remote','--heads','origin',branch]);
  let shared=null;if(raw){const fields=raw.split(/\s+/);assert(fields.length===2 && COMMIT.test(fields[0]) && fields[1]==='refs/heads/'+branch,'unknown shared claim result');shared=fields[0];}
  if(r.route==='owner-session'){
    assert(['manual','goal'].includes(r.origin),'owner-session origin label conflicts with its route');
    exact(p,['state','thread_id']);exact(r.origin_proof,['state','thread_id']);
    assert(p.state==='not_a_recorded_automation_run' && UUID.test(p.thread_id) && isDeepStrictEqual(p,r.origin_proof),'manual origin conflicts with the actual native execution or is unknown');
    assert(current.gate_receipt===null && shared===null,'an existing shared daily claim blocks owner-session evaluation');
    return {route:r.route,origin:r.origin,thread_id:p.thread_id,host_turn:turn,origin_proof_sha256:digest(p),gate_receipt_sha256:null,shared_branch:branch,claim_state:'observed_absent'};
  }
  assert(r.route==='actions' && r.origin==='codex-automation','scheduled origin label conflicts with its route');
  const keys=['state','thread_id','automation_id','original_turn_id','observed_at','gate_receipt_sha256','planned_slot'];exact(p,keys);exact(r.origin_proof,keys);
  assert(p.state==='native_execution_record' && p.automation_id==='obsidian' && typeof p.original_turn_id==='string' && UUID.test(p.original_turn_id) && typeof p.gate_receipt_sha256==='string' && SHA.test(p.gate_receipt_sha256),'original native scheduled origin required');
  assert(turn.turn_id===p.original_turn_id,'scheduled execution requires its original live turn');
  const stable=x=>Object.fromEntries(Object.entries(x).filter(([k])=>k!=='observed_at'));
  assert(isDeepStrictEqual(stable(p),stable(r.origin_proof)) && time(p.observed_at)<=Date.now() && Date.now()-time(p.observed_at)<=300000,'original native turn or preflight changed');
  const g=current.gate_receipt;exact(g,['version','thread_id','turn_id','observed_at','admitted','code','input_sha256','script_sha256','sha256']);
  assert(g.version===1 && g.admitted===true && g.thread_id===p.thread_id && g.turn_id===p.original_turn_id && /^[a-z][a-z0-9_]{0,79}$/.test(g.code) && SHA.test(g.input_sha256) && SHA.test(g.script_sha256),'original admitted preflight required');
  const body=Object.fromEntries(Object.entries(g).filter(([k])=>k!=='sha256').sort(([a],[b])=>a.localeCompare(b)));
  assert(g.sha256===hash(Buffer.from(JSON.stringify(body))) && g.sha256===p.gate_receipt_sha256,'original gate receipt digest differs');
  assert(time(g.observed_at)<=time(r.observed_at) && g.script_sha256===hash(bytes(path.join(root,'scripts/codex-autopilot-preflight.mjs'),{base:root})),'preflight chronology or source differs');
  assert(git(call,root,['branch','--show-current'])===branch && shared===git(call,root,['rev-parse','HEAD']),'exact published shared daily claim required');
  return {route:r.route,origin:r.origin,thread_id:p.thread_id,host_turn:turn,origin_proof_sha256:digest(stable(p)),gate_receipt_sha256:g.sha256,gate_input_sha256:g.input_sha256,gate_script_sha256:g.script_sha256,shared_branch:branch,claim_state:'exact_owned_head'};
}
function policyGate(r,root,now){
  assert(['owner-session','actions'].includes(r.route),'unknown execution route');
  assert(r.execution_boundary?.stopped===false && r.execution_boundary[r.route==='actions'?'actions_stopped':'owner_session_stopped']===false,'observed stop blocks evaluation');
  const stop=read(path.join(root,'data/emergency-stop.json'),root,false);
  assert(stop.stopped===false && stop.agents?.[r.route]?.stopped===false,'current stop blocks evaluation');
  const budget=read(path.join(root,'data/company-monthly-budget.json'),root,false);
  const assessed=evaluateCompanySpending(budget,{id:'company-evaluation-'+r.id,kind:'new_discretionary',currency:'JPY',requested_commitment_jpy:0},stamp(now));
  assert(assessed.allowed_by_budget===true && assessed.disposition==='no_additional_spend','existing company budget holds evaluation');
  const ctx={policy:read(path.join(root,'data/eligibility-policy.json'),root,false),scorePolicy:read(path.join(root,'data/autonomy-score.json'),root,false),
    authority:read(path.join(root,'data/authority-matrix.json'),root,false),routing:read(path.join(root,'data/model-routing.json'),root,false),
    costDoc:read(path.join(root,'data/autopilot-cost.json'),root,false),today:todayJst(now)};
  const eligibility=judge({id:'company-evaluation-'+r.id,kind:'analysis',auto:'executeExperimentEvaluation',reversibility_class:'R0',
    touches:[EVALUATION_LEDGER],evidence_date:todayJst(new Date(r.observed_at)),created_jst:todayJst(new Date(r.observed_at)),predicted_usd:0},ctx);
  assert(eligibility.reversibility_class==='R0' && Object.values(eligibility.criteria).length===5 && Object.values(eligibility.criteria).every(c=>c.result==='pass'),'original five eligibility criteria must pass');
  return {budget_sha256:hash(bytes(path.join(root,'data/company-monthly-budget.json'),{base:root})),budget_decision:assessed.decision_id,eligibility};
}
function evidenceInput(exp,input,dir,root,now){
  assert(object(input) && DECISIONS.includes(input.decision) && input.experiment_id===exp.id,'evaluation differs from original experiment');
  const asOf=stamp(now).slice(0,10),sources={};let admitted,argv;
  if(input.mode==='review'){
    exact(input,['experiment_id','decision','mode','review_file','review_sha256']);assert(SHA.test(input.review_sha256),'review digest required');
    const file=path.resolve(input.review_file),b=bytes(file,{base:dir,privateFile:true});assert.equal(hash(b),input.review_sha256,'review changed');
    const review=parse(b),refs=review.kind==='diagnostic'?review.artifacts:[review.baseline?.artifact,review.post?.artifact];
    assert(Array.isArray(refs) && refs.length>0 && refs.length<=50,'bounded original evidence artifacts required');
    sources[file]=hash(b);
    for(const ref of refs){assert(object(ref) && typeof ref.path==='string' && SHA.test(ref.sha256),'source artifact binding required');const p=path.resolve(path.dirname(file),ref.path);const raw=bytes(p,{base:dir,privateFile:true});assert.equal(hash(raw),ref.sha256,'source artifact changed');sources[p]=hash(raw);}
    admitted=reviewEvidence(exp,review,{baseDir:path.dirname(file),asOf,decision:input.decision,manifestSha256:hash(b)});
    argv=['--review',file];
  } else if(input.mode==='snapshot'){
    exact(input,['experiment_id','decision','mode','snapshot','note']);assert(typeof input.snapshot==='string' && /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(input.snapshot) && text(input.note),'exact snapshot and interpretation required');
    assert(!['measurement_failed','abandoned'].includes(input.decision),'snapshot cannot supply a diagnostic or administrative decision');
    const base=path.join(root,'growth/data/gsc',input.snapshot),dimension=exp.measurement_scope?.kind==='query_page'?'query-pages':'pages';
    const data={label:input.snapshot},files=[];
    for(const name of ['meta','dates',dimension]){const p=path.join(base,name+'.json'),b=bytes(p,{base:root});sources[p]=hash(b);data[name==='query-pages'?'queryPages':name]=parse(b);files.push({name:input.snapshot+'/'+name+'.json',sha256:hash(b)});}
    admitted=gscEvidence(exp,data,{asOf,decision:input.decision,files});admitted.rationale=input.note;
    argv=['--snapshot',input.snapshot,'--note',input.note];
  } else {
    exact(input,['experiment_id','decision','mode','note']);assert(input.mode==='administrative' && input.decision==='abandoned' && text(input.note),'administrative closure requires its original separate outcome');
    admitted={schema_version:1,kind:'administrative',gsc_snapshots:[],rationale:input.note,validation:'administrative closure; no claim of measured efficacy or an unreachable metric'};argv=['--note',input.note];
  }
  return {admitted,sources,argv};
}
function checkSeal(r){
  const d=r.decision;assert(d?.schema_version===1 && d.kind==='experiment_evaluation' && d.company_run_id===r.id,'typed prospective decision required');
  assert.equal(d.source_commit,r.source_commit);assert.equal(d.observation_fingerprint,r.observation_fingerprint);
  assert(isDeepStrictEqual(d.seal.run_context,runContext(r)),'sealed original run context changed');
  const c=r.candidates.find(c=>c.id===d.input.candidate_id);assert(c?.kind==='evaluate_existing_experiment' && c.permission==='AUTO' && c.executable===true,'sealed eligible candidate required');
  assert.equal(candidateHash(c),d.candidate_sha256);assert.equal(d.sha256,digest(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='sha256'))),'decision seal changed');
  return d;
}
function intent(d){return {schema_version:1,kind:'existing_experiment_evaluation',company_run_id:d.company_run_id,contract_id:d.input.contract_id,action_id:d.input.run_id,
  prepared_at:d.recorded_at,source_commit:d.source_commit,observation_fingerprint:d.observation_fingerprint,candidate_sha256:d.candidate_sha256,decision_sha256:d.sha256,
  observed_at:d.seal.run_context.observed_at,execution_route:d.seal.run_context.route,recorded_origin:d.seal.run_context.origin,
  original_ledger_sha256:d.seal.source_pins[EVALUATION_LEDGER],original_experiment_sha256:digest(d.seal.original_experiment),review_evidence_sha256:digest(d.seal.evidence),
  expected_evaluation_date:d.recorded_at.slice(0,10),expected_private_bundle_sha256:hash(encoded(expectedBundle(d))),expected_source_kind:d.seal.evidence.admitted.kind,
  source_pins:d.seal.source_pins,run_context_sha256:digest(d.seal.run_context),execution_origin_sha256:digest(d.seal.execution_origin),eligibility_sha256:digest(d.seal.policy.eligibility),
  eligibility_criteria:Object.fromEntries(Object.entries(d.seal.policy.eligibility.criteria).map(([key,value])=>[key,value.result])),
  experiment_id:d.input.evaluation.experiment_id,decision:d.input.evaluation.decision,reversibility_class:'R0',max_changed_lines:1500,max_binary_bytes:0,
  cost_scope:'Deterministic evaluator child invokes no paid API; parent Goal/model/PR/CI actual cost remains unknown',child_incremental_paid_api_usd:0,parent_actual_cost_usd:null,
  interpretation:'Prospective existing-evaluator business action only; no measured WIN, canonical shipped-code credit or complete parent intervention proof.'};}
function expectedBundle(d){return {schema_version:1,experiment_id:d.input.evaluation.experiment_id,decision:d.input.evaluation.decision,
  evaluated_at:d.recorded_at.slice(0,10),evidence:d.seal.evidence.admitted};}
function actionDir(dir,id){const p=path.join(dir,'experiment-evaluations',id);fs.mkdirSync(p,{recursive:true,mode:0o700});assert(fs.lstatSync(p).isDirectory() && !(fs.statSync(p).mode&0o077) && fs.realpathSync(p)===p,'private action directory required');return p;}
function rejectDuplicate(dir,r,experiment){
  const files=fs.readdirSync(path.join(dir,'runs')).filter(f=>UUID.test(f.slice(0,-5)) && f.endsWith('.json'));assert(files.length<=1000,'bounded run registry required');
  for(const file of files){if(file===r.id+'.json')continue;const other=read(path.join(dir,'runs',file),dir);
    if(other.decision?.kind==='experiment_evaluation' && other.decision.input.evaluation.experiment_id===experiment && other.status!==EVALUATION_STATUS)throw new Error('another sealed evaluation owns this experiment');}
}
export function prepareExperimentEvaluation({stateRoot,id,evidenceFile,root=ROOT,now=new Date(),currentCandidates,call=run,originReader=actualOrigin}){
  const dir=privateState(stateRoot),release=acquireLock(dir);if(!release)return{status:'busy'};
  try {const r=loadRun(dir,id),input=read(path.resolve(evidenceFile),dir);
    assert(r.status==='observed_decision_requires_execution','new prospective observation required');
    exact(input,['schema_version','candidate_id','contract_id','run_id','rationale','source_to_action','alternatives','scope','evaluation']);
    assert(input.schema_version===1 && text(input.rationale) && text(input.source_to_action),'documented source-to-action decision required');
    evaluationIntentPath(input.contract_id);assert(typeof input.run_id==='string' && /^[A-Za-z0-9._-]{1,160}$/.test(input.run_id),'typed action identity required');
    assert(isDeepStrictEqual(input.scope,{paths:[EVALUATION_LEDGER],artifact:null}),'only the original experiment ledger may change');
    const c=r.candidates.find(c=>c.id===input.candidate_id);assert(c?.kind==='evaluate_existing_experiment' && c.permission==='AUTO' && c.executable===true && Number.isFinite(c.priority),'eligible original experiment candidate required');
    assert(c.id==='evaluate:'+input.evaluation.experiment_id,'candidate experiment identity differs');
    assert(Array.isArray(input.alternatives) && input.alternatives.length>0 && input.alternatives.length<=10 && input.alternatives.every(a=>a.id!==c.id && r.candidates.some(c=>c.id===a.id) && text(a.reason)),'compare another observed action');
    if(r.decision){assert(isDeepStrictEqual(r.decision.input,input),'immutable decision replay required');const d=checkSeal(r);return{status:'already_recorded',id,intent_path:evaluationIntentPath(input.contract_id),intent:intent(d),commitment:{schema_version:1,company_run_id:id,sha256:d.sha256}};}
    assert(!r.bound_autopilot_run_id && !r.evaluation_bound && !r.evaluation_execution,'cannot retrofit an executed action');
    assert.equal(clean(call,root),r.source_commit,'the actual new observation must bind the current adapter source');
    assert(time(r.started_at)<=time(r.observed_at) && time(r.observed_at)<=+now && +now-time(r.observed_at)<=6*3600000,'fresh actual observation required');
    const current=currentCandidates??opportunities(observe({stateRoot:dir,now}));assert(current.some(x=>x.id===c.id && candidateHash(x)===candidateHash(c)),'candidate source changed');
    const original=parse(bytes(path.join(root,EVALUATION_LEDGER),{base:root}));assert(validate(original).length===0 && Array.isArray(original.experiments),'original valid ledger required');
    const matches=original.experiments.filter(e=>e.id===input.evaluation.experiment_id);assert(matches.length===1 && isDue(matches[0],stamp(now).slice(0,10)),'exact original due experiment required');
    const gate=policyGate(r,root,now),origin=executionOrigin(r,dir,root,call,now,originReader),evidence=evidenceInput(matches[0],input.evaluation,dir,root,now);rejectDuplicate(dir,r,matches[0].id);
    const d={schema_version:1,kind:'experiment_evaluation',company_run_id:id,recorded_at:stamp(now),source_commit:r.source_commit,
      observation_fingerprint:r.observation_fingerprint,candidate_sha256:candidateHash(c),initial_recommendation:r.selected?.id??null,input,
      seal:{source_pins:pins(root),original_ledger:original,original_experiment:matches[0],evidence,policy:gate,run_context:runContext(r),execution_origin:origin},
      interpretation:'Prospective typed existing-evaluator intent. Published declaration and actual specialized execution remain required; no effect or H0 credit.'};
    d.sha256=digest(d);r.decision=d;r.stages.decide='recorded_pending_evaluation_intent';
    saveOnce(path.join(actionDir(dir,id),'prepared-intent.json'),intent(d));persist(dir,r);
    return{status:'recorded',id,intent_path:evaluationIntentPath(input.contract_id),intent:intent(d),commitment:{schema_version:1,company_run_id:id,sha256:d.sha256},next:'Commit and push this digest-only typed intent alone, then execute-evaluation from its clean declaration checkout.'};
  }finally{release();}
}
function declared(r,root,call,now){
  const d=checkSeal(r),head=clean(call,root),p=evaluationIntentPath(d.input.contract_id);
  assert.notEqual(head,d.source_commit,'publish the typed intent before execution');git(call,root,['merge-base','--is-ancestor',d.source_commit,head]);
  assert(git(call,root,['rev-list',d.source_commit+'..'+head])===head && git(call,root,['show','-s','--format=%P',head])===d.source_commit,'a sole-parent standalone declaration must immediately follow its sealed source');
  assert.deepEqual(parse(call('git',['show',head+':'+p],{cwd:root})),intent(d),'published typed intent differs from the sealed action');
  assert.deepEqual(git(call,root,['diff','--name-only',d.source_commit,head]).split('\n'),[p],'declaration must precede implementation');
  const commitAt=git(call,root,['show','-s','--format=%cI',head]);assert(time(commitAt)>=time(d.recorded_at) && time(commitAt)<=+now,'actual declaration chronology required');
  const branch=git(call,root,['branch','--show-current']);assert(/^claude\//.test(branch) && branch!=='main' && git(call,root,['ls-remote','--heads','origin',branch]).split(/\s+/)[0]===head,'push the exact approved declaration branch before execution');
  verifyPins(d.seal.source_pins,root);return{declaration_sha:head,intent_path:p,intent_sha256:hash(encoded(intent(d))),decision_sha256:d.sha256,bound_at:stamp(now)};
}
const childDefault=({command,args,cwd})=>{const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});return{exit_code:r.status,signal:r.signal,stdout:r.stdout??'',stderr:r.stderr??'',timed_out:r.error?.code==='ETIMEDOUT'};};
function targetProjection(original,raw,id,input,asOf){
  exact(raw,Object.keys(original));assert(Array.isArray(raw.experiments) && raw.experiments.length===original.experiments.length && validate(raw).length===0,'CLI result must preserve the original valid ledger');
  const originalIds=original.experiments.map(e=>e.id);assert(new Set(originalIds).size===originalIds.length && new Set(raw.experiments.map(e=>e.id)).size===originalIds.length,'duplicate experiment identity');
  for(const k of Object.keys(original).filter(k=>k!=='experiments'))assert(isDeepStrictEqual(raw[k],original[k]),'non-target ledger metadata changed');
  const output=structuredClone(original),before=original.experiments.find(e=>e.id===id),actual=raw.experiments.find(e=>e.id===id);assert(actual,'missing evaluated target');
  for(const prior of original.experiments){const next=raw.experiments.find(e=>e.id===prior.id);assert(next,'CLI removed original row');
    if(prior.id!==id)assert(isDeepStrictEqual(prior,next),'CLI changed another experiment');}
  assert(actual.status==='evaluated' && actual.decision===input.decision && actual.evaluated_at===asOf,'CLI outcome differs from the sealed decision');
  const allowed=new Set([...ALLOWED,...(input.mode==='review'?[]:['notes'])]);
  for(const key of new Set([...Object.keys(before),...Object.keys(actual)]))if(!allowed.has(key))assert(isDeepStrictEqual(before[key],actual[key]),'original experiment condition changed');
  if(input.mode!=='review')assert(isDeepStrictEqual(actual.notes,[...(before.notes??[]),asOf+': '+input.note]),'CLI note differs from sealed interpretation');
  const projected=output.experiments.find(e=>e.id===id);for(const k of ALLOWED)projected[k]=actual[k];
  assert(validate(output).length===0,'projected ledger invalid');return output;
}
function recheckEvidence(d,dir,root,now){const current=evidenceInput(d.seal.original_experiment,d.input.evaluation,dir,root,now);assert(isDeepStrictEqual(current,d.seal.evidence),'sealed review/measurement evidence changed');return current;}
export function evaluationDecisionCommitment(r){const d=checkSeal(r);return{schema_version:1,company_run_id:r.id,sha256:d.sha256};}
function executionSeal(r){const e=r.evaluation_execution;assert(e?.schema_version===1 && e.company_run_id===r.id && e.decision_sha256===checkSeal(r).sha256,'actual typed execution required');assert.equal(e.sha256,digest(Object.fromEntries(Object.entries(e).filter(([k])=>k!=='sha256'))),'execution evidence changed');assert(e.child.exit_code===0 && typeof e.child.exit_code==='number' && e.child.signal===null && e.child.timed_out===false,'known actual child success required');return e;}
export async function executeExperimentEvaluation({stateRoot,id,root=ROOT,now=new Date(),call=run,child=childDefault,originReader=actualOrigin}){
  const dir=privateState(stateRoot),release=acquireLock(dir);if(!release)return{status:'busy'};
  try {const r=loadRun(dir,id);assert(r.status==='observed_decision_requires_execution','only a new unexecuted observation may run');const d=checkSeal(r);
    assert(!r.evaluation_bound && !r.evaluation_execution,'an attempted evaluation is never silently repeated');
    assert(+now-time(r.observed_at)<=6*3600000 && time(d.recorded_at)<=+now,'current pre-execution decision required');
    policyGate(r,root,now);assert(isDeepStrictEqual(executionOrigin(r,dir,root,call,now,originReader),d.seal.execution_origin),'sealed execution origin or shared claim changed');rejectDuplicate(dir,r,d.input.evaluation.experiment_id);recheckEvidence(d,dir,root,now);
    assert(stamp(now).slice(0,10)===d.recorded_at.slice(0,10),'the prepared evaluation day expired before execution');
    const stage=actionDir(dir,id);assert(isDeepStrictEqual(read(path.join(stage,'prepared-intent.json'),dir),intent(d)),'retained preparation changed');
    const bound=declared(r,root,call,now),evidenceDirectory=path.join(stage,'evidence');fs.mkdirSync(evidenceDirectory,{mode:0o700});
    const args=[path.join(root,'growth/scripts/experiments.mjs'),'evaluate',d.input.evaluation.experiment_id,'--decision',d.input.evaluation.decision,...d.seal.evidence.argv,'--private-evidence-dir',evidenceDirectory];
    const launch={schema_version:1,company_run_id:id,decision_sha256:d.sha256,...bound,command:'node growth/scripts/experiments.mjs evaluate',argv_sha256:digest(args),started_at:stamp(now)};
    const launchSha=saveOnce(path.join(stage,'launch.json'),launch);r.evaluation_bound={...bound,launch_sha256:launchSha};r.status='executing_existing_experiment_evaluation';r.stages.decide='completed';r.stages.execute='running';persist(dir,r);
    let result;
    try{result=await child({command:process.execPath,args,cwd:root});}catch{result={exit_code:null,signal:null,stdout:'',stderr:'',timed_out:false};}
    const completed=new Date(),meta={exit_code:typeof result?.exit_code==='number'?result.exit_code:null,signal:result?.signal===null?null:'unknown_or_signalled',timed_out:typeof result?.timed_out==='boolean'?result.timed_out:null,stdout_sha256:hash(Buffer.from(result?.stdout??'')),stderr_sha256:hash(Buffer.from(result?.stderr??''))};
    // A partial write or unknown child exit is preserved as a failure, never a replay.
    try{
      assert(typeZero(meta.exit_code) && meta.signal===null && meta.timed_out===false,'actual child did not finish successfully');
      const raw=bytes(path.join(root,EVALUATION_LEDGER),{base:root}),rawLedger=parse(raw),asOf=stamp(completed).slice(0,10);
      assert(asOf===stamp(now).slice(0,10),'midnight crossed; preserve actual outcome and observe again');
      const packaged=targetProjection(d.seal.original_ledger,rawLedger,d.input.evaluation.experiment_id,d.input.evaluation,asOf);
      const target=packaged.experiments.find(e=>e.id===d.input.evaluation.experiment_id),reference=target.evidence;
      assert(reference?.kind==='private_reference' && SHA.test(reference.sha256) && typeof reference.artifact==='string' && /^experiment-evidence-[a-f0-9]{64}\.json$/.test(reference.artifact),'private admitted result evidence required');
      const bundleBytes=bytes(path.join(evidenceDirectory,reference.artifact),{base:dir,privateFile:true}),bundle=parse(bundleBytes);assert.equal(hash(bundleBytes),reference.sha256,'result private bundle changed');
      assert.equal(reference.sha256,intent(d).expected_private_bundle_sha256,'actual result differs from the predeclared private bundle');
      assert(bundle.schema_version===1 && bundle.experiment_id===target.id && bundle.decision===target.decision && bundle.evaluated_at===asOf && isDeepStrictEqual(bundle.evidence,recheckEvidence(d,dir,root,completed).admitted),'CLI result does not reuse the sealed original evidence gate');
      verifyPins(d.seal.source_pins,root,{ledger:false});assert.equal(git(call,root,['rev-parse','HEAD']),bound.declaration_sha,'source checkout changed during execution');
      assert.deepEqual(git(call,root,['diff','--name-only']).split('\n'),[EVALUATION_LEDGER],'specialized CLI changed unrelated tracked source');
      assert.equal(git(call,root,['status','--porcelain']),'M '+EVALUATION_LEDGER,'concurrent index or untracked source change');
      saveRawOnce(path.join(stage,'raw-child-ledger.json'),raw);
      const final=encoded(packaged);replaceEvaluatedLedger(path.join(root,EVALUATION_LEDGER),raw,final);
      const e={schema_version:1,company_run_id:id,decision_sha256:d.sha256,...bound,launch_sha256:launchSha,started_at:stamp(now),completed_at:stamp(completed),
        child:meta,raw_child_ledger_sha256:hash(raw),original_ledger_sha256:d.seal.source_pins[EVALUATION_LEDGER],published_ledger_sha256:hash(final),
        private_bundle:{path:path.join(evidenceDirectory,reference.artifact),sha256:reference.sha256},result_target_sha256:digest(target),
        packaging:{non_target_rows_semantically_unchanged:true,original_row_order_preserved:true,original_notes_preserved:true,raw_child_sort_and_note_retained_privately:true,allowed_target_fields:ALLOWED}};
      e.sha256=digest(e);saveOnce(path.join(stage,'execution.json'),e);r.evaluation_execution=e;r.status='executed_pending_evaluation_delivery';r.stages.execute='completed';r.stages.verify='pending';persist(dir,r);
      return{status:r.status,id,execution_sha256:e.sha256,result_ledger_sha256:e.published_ledger_sha256,execution_file:path.join(stage,'execution.json'),Company_verified_finish:false,parent_H0_proven:false};
    }catch(error){r.status='failed_existing_experiment_evaluation';r.stages.execute='failed';r.stages.verify='not_completed';r.evaluation_failure={category:'execution_or_evidence_validation_failed',
      gate_error:{name:typeof error?.name==='string'?error.name.slice(0,100):'UnknownError',message:typeof error?.message==='string'?error.message.slice(0,2000):'No retained gate detail'},
      child:meta,launch_sha256:launchSha,completed_at:stamp(completed)};persist(dir,r);throw new Error('Existing evaluation failed closed; retain this attempted run and its source, never replay or infer completion');}
  }finally{release();}
}
const typeZero=x=>typeof x==='number' && Number.isInteger(x) && x===0;
function retainedExecution(r,dir){const e=executionSeal(r),d=checkSeal(r),stage=actionDir(dir,r.id);assert(isDeepStrictEqual(read(path.join(stage,'execution.json'),dir),e),'immutable execution file differs');
  const launch=bytes(path.join(stage,'launch.json'),{base:dir,privateFile:true});assert.equal(hash(launch),e.launch_sha256,'pre-execution launch evidence changed');
  const l=parse(launch);assert(l.company_run_id===r.id && l.decision_sha256===d.sha256 && l.declaration_sha===e.declaration_sha && l.started_at===e.started_at,'launch identity changed');
  const raw=bytes(path.join(stage,'raw-child-ledger.json'),{base:dir,privateFile:true});assert.equal(hash(raw),e.raw_child_ledger_sha256,'raw child outcome changed');
  const projected=targetProjection(d.seal.original_ledger,parse(raw),d.input.evaluation.experiment_id,d.input.evaluation,e.completed_at.slice(0,10));assert.equal(hash(encoded(projected)),e.published_ledger_sha256,'retained evaluated output differs');return e;}
export async function finishExperimentEvaluation({stateRoot,id,evidenceFile,root=ROOT,now=new Date(),call=run,fetchImpl=fetch}){
  const dir=privateState(stateRoot),release=acquireLock(dir);if(!release)return{status:'busy'};
  try {const r=loadRun(dir,id),input=read(path.resolve(evidenceFile),dir);exact(input,['schema_version','kind','company_run_id','pr','execution_sha256','learning']);
    assert(input.schema_version===1 && input.kind==='experiment_evaluation' && input.company_run_id===id && Number.isSafeInteger(input.pr) && input.pr>0 && SHA.test(input.execution_sha256) && text(input.learning),'exact typed delivery evidence and source-specific learning required');
    if(r.status===EVALUATION_STATUS){assert(isDeepStrictEqual(r.evaluation_finish_input,input) && evaluationDecisionTrace(r).state==='verified','completion replay identity changed');return r;}
    assert(r.status==='executed_pending_evaluation_delivery','actual new specialized execution required');const d=checkSeal(r),e=retainedExecution(r,dir);assert.equal(input.execution_sha256,e.sha256);verifyPins(d.seal.source_pins,root,{ledger:false});policyGate(r,root,now);recheckEvidence(d,dir,root,now);
    assert(time(d.recorded_at)<=time(e.bound_at) && time(e.bound_at)<=time(e.started_at) && time(e.started_at)<=time(e.completed_at) && time(e.completed_at)<=+now,'actual execution chronology required');
    const sourceCall=(name,args,opts={})=>call(name,args,{cwd:root,...opts});
    const merge=verifyMergedChange(input.pr,sourceCall,{requireIntegration:false});assert(time(merge.merged_at)>=time(e.completed_at) && time(merge.merged_at)<=+now,'publication must follow this actual execution');
    git(call,root,['merge-base','--is-ancestor',e.declaration_sha,merge.head_sha]);
    const show=(sha,p)=>Buffer.from(call('git',['show',sha+':'+p],{cwd:root}));
    assert(isDeepStrictEqual(parse(show(merge.head_sha,e.intent_path)),intent(d)) && isDeepStrictEqual(parse(show(merge.merge_sha,e.intent_path)),intent(d)),'publication changed the prospective intent');
    assert.deepEqual(git(call,root,['diff','--name-only',e.declaration_sha,merge.head_sha]).split('\n'),[EVALUATION_LEDGER],'evaluation PR changed unrelated scope');
    const stat=git(call,root,['diff','--numstat',e.declaration_sha,merge.head_sha]).split('\t');assert(/^\d+$/.test(stat[0]) && /^\d+$/.test(stat[1]) && Number(stat[0])+Number(stat[1])>0 && Number(stat[0])+Number(stat[1])<=1500,'original bounded nonbinary diff required');
    for(const [p,h]of Object.entries(d.seal.source_pins))if(p!==EVALUATION_LEDGER)assert(hash(show(merge.head_sha,p))===h && hash(show(merge.merge_sha,p))===h,'published source/policy changed');
    const published=show(merge.merge_sha,EVALUATION_LEDGER);assert.equal(hash(published),e.published_ledger_sha256,'merged ledger differs from actual evaluated output');assert.equal(hash(show(merge.head_sha,EVALUATION_LEDGER)),e.published_ledger_sha256,'CI head does not bind evaluated bytes');
    const prior=parse(show(merge.merge_sha+'^',EVALUATION_LEDGER));assert(isDeepStrictEqual(prior,d.seal.original_ledger),'concurrent experiment edit prevents completion');
    const bundle=read(e.private_bundle.path,dir);assert.equal(hash(bytes(e.private_bundle.path,{base:dir,privateFile:true})),e.private_bundle.sha256);assert(isDeepStrictEqual(bundle.evidence,d.seal.evidence.admitted),'admitted private bundle changed');
    // /growth is intentionally internal. Reuse exact-merge Pages/status and
    // script-boundary proof, while the evaluated ledger is verified in Git.
    const delivery=await verifyOperationalDelivery(merge,sourceCall,fetchImpl);
    r.status=EVALUATION_STATUS;r.finished_at=stamp(now);r.stages={detect:'completed',decide:'completed',execute:'completed',verify:'completed',report:'saved',learn:'recorded'};
    r.evaluation_finish_input=input;r.evidence_of_completion={kind:'experiment_evaluation',merge,experiment_id:d.input.evaluation.experiment_id,decision:d.input.evaluation.decision,
      execution_sha256:e.sha256,source_commit:d.source_commit,intent_path:e.intent_path,intent_sha256:e.intent_sha256,published_ledger_sha256:e.published_ledger_sha256,delivery,
      decision_trace:{state:'verified',kind:'experiment_evaluation',decision_sha256:d.sha256,candidate_id:d.input.candidate_id,contract_id:d.input.contract_id},
      limitation:'Original source-specific evaluator and exact published outcome verified. No efficacy WIN, canonical shipped-code rate, complete parent coverage or H0 is inferred.'};
    // No canonical intervention row exists for this separate business action.
    r.human_interventions=null;r.parent_human_touches=null;r.parent_zero_touch_completion=null;
    r.learnings=[input.learning];
    r.followup={source:EVALUATION_LEDGER,decision:d.input.evaluation.decision,interpretation:'Evaluation closure only; iterate/revert requires a fresh prospective delivered action.'};persist(dir,r);return r;
  }finally{release();}
}
export function evaluationDecisionTrace(r){
  if(r.status!==EVALUATION_STATUS)return{state:'pending',kind:'experiment_evaluation',candidate_id:r.decision?.input.candidate_id??null};
  try{const d=checkSeal(r),e=executionSeal(r),p=r.evidence_of_completion;assert.equal(p?.kind,'experiment_evaluation');assert.equal(p.execution_sha256,e.sha256);exact(p.decision_trace,['state','kind','decision_sha256','candidate_id','contract_id']);assert.equal(p.decision_trace.state,'verified');assert.equal(p.decision_trace.decision_sha256,d.sha256);assert.equal(p.published_ledger_sha256,e.published_ledger_sha256);const input=r.evaluation_finish_input;exact(input,['schema_version','kind','company_run_id','pr','execution_sha256','learning']);assert(input.schema_version===1 && input.kind==='experiment_evaluation' && input.company_run_id===r.id && input.pr===p.merge.pr && input.execution_sha256===e.sha256 && text(input.learning));assert.deepEqual(r.learnings,[input.learning]);assert(r.human_interventions===null && r.parent_human_touches===null && r.parent_zero_touch_completion===null);return{state:'verified',kind:'experiment_evaluation',decision_sha256:d.sha256,candidate_id:d.input.candidate_id,contract_id:d.input.contract_id,verification:'Retained typed business-action proof only; no new remote read or formal rate credit.'};}catch{return{state:'invalid_trace',kind:'experiment_evaluation',reason:'retained evaluation proof mismatch'};}
}

// CI verifies the public, prospective type without reading Company state or
// private artifacts. Actual native origin, child execution and original
// source-specific admission remain mandatory in execute/finish.
export function verifyEvaluationDecision({branch,head,baseRef,pr=null,cwd=ROOT,git:providedGit}){
  assert(typeof branch==='string' && /^claude\//.test(branch) && typeof head==='string' && COMMIT.test(head) && typeof baseRef==='string','exact approved public decision refs required');
  const rawGit=providedGit??((...args)=>execFileSync('git',args,{cwd,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}));
  assert(typeof rawGit==='function','read-only raw Git reader required');
  const raw=(...args)=>{const b=rawGit(...args);assert(Buffer.isBuffer(b) || typeof b==='string','raw Git bytes required');return Buffer.from(b);};
  const g=(...args)=>raw(...args).toString('utf8').trim();
  const content=(ref,p)=>{const row=g('ls-tree',ref,'--',p);assert(/^(100644|100755) blob [a-f0-9]{40}\t/.test(row) && row.split('\t')[1]===p,'regular exact source blob required: '+p);const b=raw('show',ref+':'+p);assert(b.length>0 && b.length<=MAX_FILE,'bounded public source required');return b;};
  const json=(ref,p)=>parse(content(ref,p));
  const names=(a,b)=>g('diff','--name-only',a,b).split('\n').filter(Boolean);
  const base=g('merge-base',baseRef,head);assert(COMMIT.test(base),'actual public base required');
  const files=names(base,head),typed=files.filter(p=>/^docs\/autonomy\/company-evaluation-intents\/[a-z0-9-]+\.json$/.test(p));
  assert(typed.length===1,'exactly one prospective typed evaluation intent required');const p=typed[0],i=json(head,p);
  exact(i,['schema_version','kind','company_run_id','contract_id','action_id','prepared_at','source_commit','observation_fingerprint','candidate_sha256','decision_sha256',
    'observed_at','execution_route','recorded_origin','original_ledger_sha256','original_experiment_sha256','review_evidence_sha256',
    'expected_evaluation_date','expected_private_bundle_sha256','expected_source_kind','source_pins','run_context_sha256','execution_origin_sha256',
    'eligibility_sha256','eligibility_criteria','experiment_id','decision','reversibility_class','max_changed_lines','max_binary_bytes',
    'cost_scope','child_incremental_paid_api_usd','parent_actual_cost_usd','interpretation']);
  assert(i.schema_version===1 && i.kind==='existing_experiment_evaluation' && typeof i.company_run_id==='string' && UUID.test(i.company_run_id),'typed public identity required');
  assert(evaluationIntentPath(i.contract_id)===p && typeof i.action_id==='string' && /^[A-Za-z0-9._-]{1,160}$/.test(i.action_id),'typed declaration path or action identity differs');
  for(const k of ['observation_fingerprint','candidate_sha256','decision_sha256','original_ledger_sha256','original_experiment_sha256','review_evidence_sha256',
    'expected_private_bundle_sha256','run_context_sha256','execution_origin_sha256','eligibility_sha256'])assert(typeof i[k]==='string' && SHA.test(i[k]),'strict public digest required: '+k);
  assert(typeof i.source_commit==='string' && COMMIT.test(i.source_commit) && typeof i.experiment_id==='string' && DECISIONS.includes(i.decision),'original experiment or source identity required');
  assert(i.reversibility_class==='R0' && i.max_changed_lines===1500 && i.max_binary_bytes===0 && i.child_incremental_paid_api_usd===0 && i.parent_actual_cost_usd===null,'original bounded evaluation and unknown parent cost required');
  assert(i.cost_scope==='Deterministic evaluator child invokes no paid API; parent Goal/model/PR/CI actual cost remains unknown'
    && i.interpretation==='Prospective existing-evaluator business action only; no measured WIN, canonical shipped-code credit or complete parent intervention proof.','public proof scope cannot expand');
  for(const key of ['observed_at','prepared_at'])assert(i[key]===new Date(time(i[key])).toISOString(),'public observation and preparation require their exact canonical UTC stamp');
  assert(time(i.observed_at)<=time(i.prepared_at) && time(i.prepared_at)<=Date.now() && time(i.prepared_at)-time(i.observed_at)<=6*3600000,'fresh nonfuture public decision required');
  assert(typeof i.expected_evaluation_date==='string' && i.expected_evaluation_date===i.prepared_at.slice(0,10),'predeclared evaluation day required');time(i.expected_evaluation_date+'T00:00:00Z');
  const allowedKind=i.decision==='measurement_failed'?['measurement_diagnostic']:i.decision==='abandoned'?['administrative']:['manual_comparison','gsc_comparison'];
  assert(typeof i.expected_source_kind==='string' && allowedKind.includes(i.expected_source_kind),'predeclared evidence kind differs from the original outcome');
  assert(i.execution_route==='actions'?i.recorded_origin==='codex-automation':i.execution_route==='owner-session' && ['manual','goal'].includes(i.recorded_origin),'original route and origin labels differ');
  if(/^claude\/obsidian-auto-/.test(branch))assert(i.execution_route==='actions' && branch==='claude/obsidian-auto-'+todayJst(new Date(i.prepared_at)).replaceAll('-',''),'native typed decision requires its original shared day branch');
  else assert(i.execution_route==='owner-session','scheduled evaluation cannot avoid its shared branch');
  assert(g('merge-base',i.source_commit,head)===i.source_commit,'original source must precede the declaration');
  assert(!g('ls-tree',i.source_commit,'--',p) && !g('ls-tree',baseRef,'--',p),'cannot edit or replay an existing typed intent');
  const commits=g('rev-list','--reverse','--first-parent',i.source_commit+'..'+head).split('\n').filter(Boolean);assert(commits.length>0,'standalone prospective declaration required');
  const declaration=commits[0];assert(g('show','-s','--format=%P',declaration)===i.source_commit,'declaration must have the sealed source as its sole parent');
  const changed=sha=>g('diff-tree','--no-commit-id','--name-only','-r',sha).split('\n').filter(Boolean);
  assert.deepEqual(changed(declaration),[p],'typed declaration must be committed alone before implementation');
  assert(content(declaration,p).equals(content(head,p)),'typed declaration changed after execution');
  const declaredAt=g('show','-s','--format=%cI',declaration);assert(time(declaredAt)>=time(i.prepared_at) && time(declaredAt)<=Date.now(),'actual declaration must follow preparation');
  const paths=[...CODE,...POLICIES,EVALUATION_LEDGER];exact(i.source_pins,paths);
  for(const file of paths){const h=i.source_pins[file];assert(typeof h==='string' && SHA.test(h),'strict pinned source digest required');
    assert(hash(content(i.source_commit,file))===h && hash(content(declaration,file))===h,'declaration source or policy differs: '+file);
    assert(hash(content(baseRef,file))===h,'current base source or policy changed: '+file);
    if(file!==EVALUATION_LEDGER)assert(hash(content(head,file))===h,'public gate or policy changed: '+file);
  }
  // Neither this type nor a private receipt changes the original run, status,
  // metric definitions or value contracts, even on an otherwise matching PR.
  for(const file of ['data/autopilot-runs.json','data/autopilot-status.json','data/value-metrics.json','data/value-contracts.json']){
    const before=content(i.source_commit,file);assert(before.equals(content(baseRef,file)) && before.equals(content(head,file)),'canonical shipping or formal metrics changed: '+file);
  }
  const original=json(i.source_commit,EVALUATION_LEDGER);assert(validate(original).length===0 && hash(content(i.source_commit,EVALUATION_LEDGER))===i.original_ledger_sha256,'original valid ledger digest required');
  const targets=original.experiments.filter(e=>e.id===i.experiment_id);assert(targets.length===1 && isDue(targets[0],i.expected_evaluation_date) && digest(targets[0])===i.original_experiment_sha256,'exact original due experiment required');
  const stop=json(i.source_commit,'data/emergency-stop.json');assert(stop.stopped===false && stop.agents?.[i.execution_route]?.stopped===false,'original route stop blocks public evaluation');
  const budget=evaluateCompanySpending(json(i.source_commit,'data/company-monthly-budget.json'),{id:'company-evaluation-'+i.company_run_id,kind:'new_discretionary',currency:'JPY',requested_commitment_jpy:0},i.prepared_at);
  assert(budget.allowed_by_budget===true && budget.disposition==='no_additional_spend','original company budget blocks public evaluation');
  const judged=judge({id:'company-evaluation-'+i.company_run_id,kind:'analysis',auto:'executeExperimentEvaluation',reversibility_class:'R0',touches:[EVALUATION_LEDGER],
    evidence_date:todayJst(new Date(i.observed_at)),created_jst:todayJst(new Date(i.observed_at)),predicted_usd:0},
    {policy:json(i.source_commit,'data/eligibility-policy.json'),scorePolicy:json(i.source_commit,'data/autonomy-score.json'),authority:json(i.source_commit,'data/authority-matrix.json'),
      routing:json(i.source_commit,'data/model-routing.json'),costDoc:json(i.source_commit,'data/autopilot-cost.json'),today:todayJst(new Date(i.prepared_at))});
  const criteria=Object.fromEntries(Object.entries(judged.criteria).map(([k,v])=>[k,v.result]));
  assert(Object.keys(criteria).length===5 && Object.values(criteria).every(x=>x==='pass') && isDeepStrictEqual(i.eligibility_criteria,criteria) && i.eligibility_sha256===digest(judged),'original five eligibility criteria must reproduce');
  const declaredOnly=files.length===1 && files[0]===p;
  const scopeStats=g('diff','--numstat',base,head).split('\n').filter(Boolean).map(line=>line.split('\t'));
  assert(scopeStats.every(row=>row.length===3 && /^\d+$/.test(row[0]) && /^\d+$/.test(row[1])) && scopeStats.reduce((sum,row)=>sum+Number(row[0])+Number(row[1]),0)<=1500,'the complete public change must preserve the original line and binary limits');
  if(declaredOnly)assert(pr===null && commits.length===1 && hash(content(head,EVALUATION_LEDGER))===i.original_ledger_sha256,'declaration-only push cannot claim a completed PR');
  else {
    assert.deepEqual([...files].sort(),[p,EVALUATION_LEDGER].sort(),'only one typed intent and the original ledger may change');
    assert(commits.length>=2 && names(declaration,head).length===1 && names(declaration,head)[0]===EVALUATION_LEDGER,'implementation must follow the unchanged declaration');
    for(const sha of commits.slice(1)){assert(g('show','-s','--format=%P',sha).split(' ').length===1 && isDeepStrictEqual(changed(sha),[EVALUATION_LEDGER]),'implementation commit changed undeclared paths');const at=time(g('show','-s','--format=%cI',sha));assert(at>=time(declaredAt) && at<=Date.now(),'actual implementation chronology required');}
    const stat=g('diff','--numstat',declaration,head).split('\t');assert(/^\d+$/.test(stat[0]) && /^\d+$/.test(stat[1]) && Number(stat[0])+Number(stat[1])>0 && Number(stat[0])+Number(stat[1])<=1500,'original bounded nonbinary evaluation diff required');
    const after=json(head,EVALUATION_LEDGER);exact(after,Object.keys(original));assert(validate(after).length===0 && isDeepStrictEqual(after.experiments.map(e=>e.id),original.experiments.map(e=>e.id)),'original row identity and order must remain unchanged');
    for(const key of Object.keys(original).filter(k=>k!=='experiments'))assert(isDeepStrictEqual(after[key],original[key]),'original ledger metadata changed');
    let evaluated;
    for(const before of original.experiments){const row=after.experiments.find(e=>e.id===before.id);if(before.id!==i.experiment_id){assert(isDeepStrictEqual(row,before),'another experiment changed');continue;}
      evaluated=row;assert(object(row) && Object.keys(row).every(k=>Object.hasOwn(before,k) || ALLOWED.includes(k)) && Object.keys(before).every(k=>Object.hasOwn(row,k)),'target fields were added or removed');
      for(const k of new Set([...Object.keys(before),...Object.keys(row)]))if(!ALLOWED.includes(k))assert(isDeepStrictEqual(row[k],before[k]),'original experiment condition or notes changed');
    }
    assert(evaluated.status==='evaluated' && evaluated.decision===i.decision && evaluated.evaluated_at===i.expected_evaluation_date,'evaluation differs from the predeclared original outcome');
    const reference=evaluated.evidence;exact(reference,['schema_version','kind','source_kind','artifact','sha256','validation']);
    assert(reference.schema_version===1 && reference.kind==='private_reference' && allowedKind.includes(i.expected_source_kind) && reference.source_kind===i.expected_source_kind
      && reference.sha256===i.expected_private_bundle_sha256 && reference.artifact==='experiment-evidence-'+i.expected_private_bundle_sha256+'.json'
      && reference.validation==='Original evidence admission completed before private storage; resolve and verify this artifact before interpreting the outcome.','private outcome reference differs from the pre-execution commitment');
  }
  if(pr!==null){assert(Number.isSafeInteger(pr?.number) && pr.number>0 && pr.base?.ref==='main' && pr.base?.repo?.full_name==='simplememofast/simplememo'
    && pr.head?.repo?.full_name==='simplememofast/simplememo' && pr.head.ref===branch && pr.head.sha===head,'exact same-repository main PR binding required');}
  return {state:declaredOnly?'declared_only':pr===null?'awaiting_pr_validation':'contract_verified',kind:'existing_experiment_evaluation',company_run_id:i.company_run_id,
    contract_id:i.contract_id,experiment_id:i.experiment_id,decision:i.decision,source_commit:i.source_commit,declaration_sha:declaration,head_sha:head,pr:pr?.number??null,
    private_admission_verified:false,business_completed:false,parent_H0_proven:null,canonical_shipped_run_credit:0,formal_metric_credit:0,
    scope:'Public prospective evaluation contract only; actual native origin, child and private evidence are checked by execute/finish.'};
}
