// Prospective linkage into the existing experiment ledger, not another registry
// or collector. Raw sources and comparisons remain in private Company state.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {ROOT,digest} from './company-metrics.mjs';
import {privateState,atomicJson,acquireLock} from './company-loop.mjs';
import {companySearch} from './company-search.mjs';
import {companyAio,validateAioBytes} from './company-aio.mjs';
import {period,gscBaseline,gscEvidence,reviewEvidence,privateEvidenceReference,fingerprint} from './experiment-evidence.mjs';
import {validate,isOpen,saveLedger} from './ledger.mjs';
import {experimentScope} from './experiment-overlap.mjs';
import {growthFollowups} from './company-growth-followup.mjs';
import {decisionTrace,decisionCommitment} from './company-decision.mjs';
import {nativeOrigin} from './company-origin.mjs';
import {nativeEventEvidence,nativeThread} from './company-native-evidence.mjs';
import {verifyRetainedCompanyDelivery} from './company-proof.mjs';

export const EXPERIMENTS='growth/experiments/experiments.json';
const DAY=86400000,read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const date=(at,zone='UTC')=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const plus=(d,n)=>new Date(Date.parse(d)+n*DAY).toISOString().slice(0,10);
const text=s=>typeof s==='string' && s.trim().length>=20 && s.length<=2000;
const idOk=s=>/^[a-z0-9][a-z0-9-]{2,99}$/.test(s??'');
const normalized=p=>p.replace(/\.html$/,'').replace(/\/$/,'')||'/';
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const ledger=root=>read(path.join(root,EXPERIMENTS));
const validLedger=l=>assert.deepEqual(validate(l),[],'canonical experiment ledger validation failed');
function owned(file,dir) {
  const real=fs.realpathSync(file),st=fs.statSync(real);
  assert(real.startsWith(fs.realpathSync(dir)+path.sep)&&st.isFile()&&st.uid===process.getuid()&&!(st.mode&0o077),'owned private measurement input required');
  return real;
}
function available(page,experiments,followups=[],except=null) {
  for(const e of [...experiments.filter(isOpen),...followups.filter(r=>r.status==='RUNNING').map(r=>({...r.parent,id:r.id}))]) {
    if(e.id===except)continue;
    const s=experimentScope(e);
    assert(!s.global&&!s.pages.includes(normalized(page)),'target is owned by an active experiment/follow-up: '+e.id);
  }
}
function stash(dir,value) {
  const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value,null,2)+'\n');
  const sha256=fingerprint(bytes),file='measurement-source-'+sha256+'.json';
  try{fs.writeFileSync(path.join(dir,file),bytes,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  assert.equal(fingerprint(fs.readFileSync(owned(path.join(dir,file),dir))),sha256);
  return{file,sha256};
}
function sourceBytes(plan,dir) {
  assert.equal(plan.source.file,'measurement-source-'+plan.source.sha256+'.json');
  const bytes=fs.readFileSync(owned(path.join(dir,plan.source.file),dir));
  assert.equal(fingerprint(bytes),plan.source.sha256,'measurement source changed');return bytes;
}
export function loadMeasurement({stateRoot,id,sha256}) {
  assert(idOk(id),'invalid measurement ID');const dir=privateState(stateRoot);
  const p=read(owned(path.join(dir,'measurement-plan-'+id+'.json'),dir));
  assert.equal(p.schema_version,1);assert.equal(p.id,id);
  assert.equal(p.sha256,digest(Object.fromEntries(Object.entries(p).filter(([k])=>k!=='sha256'))),'measurement plan changed');
  if(sha256)assert.equal(p.sha256,sha256,'decision measurement commitment changed');
  sourceBytes(p,dir);validLedger({experiments:[p.experiment]});return p;
}
export function prepareMeasurement({stateRoot,evidenceFile,root=ROOT,now=new Date(),search=companySearch}) {
  const dir=privateState(stateRoot),release=acquireLock(dir);if(!release)return{status:'busy'};
  try {
    const input=read(owned(evidenceFile,dir));
    assert(idOk(input.id)&&typeof input.page==='string'&&/^\/(?!\/)(?:[A-Za-z0-9/_-]+(?:\.html)?\/?)?$/.test(input.page),'exact same-site page and measurement ID required');
    assert(text(input.hypothesis)&&text(input.decision_rule),'prospective hypothesis and interpretation rule required');
    const original=ledger(root);validLedger(original);
    assert(!original.experiments.some(e=>e.id===input.id),'experiment ID already exists; never retrofit a plan');
    available(input.page,original.experiments,growthFollowups({stateRoot:dir,now}).reviews);
    let snapshot,baseline,contract,source,metric=input.target_metric;
    if(input.source==='gsc') {
      assert(['ctr','position','impressions'].includes(metric),'exact GSC page metric required');
      const current=search({stateRoot:dir,now});
      assert(current.evidence.actionable,'current admitted GSC source required');snapshot=current.snapshot;
      const rows=snapshot.pages.filter(r=>r.page===input.page);assert.equal(rows.length,1,'missing/ambiguous page baseline is not zero');
      const row=rows[0];assert(row.impressions>0,'numeric nonzero-volume baseline required');
      baseline={metric,value:metric==='ctr'?row.clicks/row.impressions:row[metric],clicks:row.clicks,impressions:row.impressions,
        ctr:row.clicks/row.impressions,position:row.position,window:snapshot.meta.period_start+'..'+snapshot.meta.period_end};
      source={kind:'gsc',...stash(dir,{snapshot,provenance:current.evidence}),provenance:current.evidence};
      contract={source:'gsc',definition:'Original WEB GSC exact page '+metric,unit:metric==='ctr'?'ratio':metric==='position'?'position':'count',time_zone:'America/Los_Angeles',scope:{kind:'page',page:input.page},lag_days:3};
      assert(['clicks','impressions'].includes(input.min_sample?.metric),'GSC sample floor must use clicks or impressions');
    } else {
      assert.equal(input.source,'ai_citations');assert.equal(metric,'ai_citations');
      const current=companyAio({root,now});assert(current.decision_input.actionable,'current original AIO probe required');
      const bytes=fs.readFileSync(path.join(root,'data/ai-visibility-probe.json'));
      assert.equal(fingerprint(bytes),current.decision_input.sha256);
      const probe=validateAioBytes(bytes,{at:now}),day=probe.observed_at.slice(0,10);
      baseline={metric,value:probe.unaided_own_site_citation_rate,window:plus(day,-6)+'..'+day};
      source={kind:'ai_citations',...stash(dir,bytes),run_id:probe.run_id,observed_at:probe.observed_at};
      contract={source:'ai_citations',definition:'Own-site citation fraction in one original unaided fixed-question probe per seven-day window',unit:'ratio',time_zone:'UTC',
        scope:{series:probe.series,protocol_sha256:digest(probe.protocol),questions:probe.observations.map(q=>({id:q.question_id,text:q.question})),unaided_questions:probe.unaided_valid_questions},lag_days:1};
      assert.equal(input.min_sample?.metric,'unaided_valid_questions');assert(input.min_sample.threshold>=4,'retain all original unaided questions');
      // Include every run in the fixed cohort, deduplicate the latest/archive
      // copies by run ID; never choose the most favorable report.
      const cohort=aioCohort({root,contract,start:plus(day,-6),end:day,now});
      assert.equal(cohort.length,1,'baseline cohort requires exactly one complete original probe');assert.equal(cohort[0].probe.run_id,probe.run_id);
    }
    const [start,end]=baseline.window.split('..'),before=period(start,end),post=period(input.post_start,input.post_end);
    period(input.started_at,input.evaluation_at);
    assert(input.started_at>=date(now,contract.time_zone)&&end<input.started_at,'baseline must precede a prospective launch day');
    assert.equal(before.days,input.source==='gsc'?28:7,'preserve the original source window');assert.equal(before.days,post.days,'equal comparison windows required');
    assert(input.post_start>input.started_at&&Date.parse(input.post_end)-Date.parse(input.started_at)>=28*DAY,'retain at least a 28-day observation horizon');
    assert(Date.parse(input.evaluation_at)-Date.parse(input.post_end)>=contract.lag_days*DAY,'evaluation must respect source lag');
    assert(Number.isSafeInteger(input.min_sample?.threshold)&&input.min_sample.threshold>0&&text(input.min_sample.rationale),'explicit positive sample floor and rationale required');
    assert(Array.isArray(input.guardrails)&&input.guardrails.length>0&&input.guardrails.every(text),'concrete guardrails required');
    const e={id:input.id,page:input.page,type:'company_'+input.source+'_treatment',hypothesis:input.hypothesis,source:{pr:null,commit:null},
      started_at:input.started_at,evaluation_at:input.evaluation_at,status:'running',target_metric:metric,baseline:{...baseline,source:source.kind+':'+source.sha256},
      measurement_contract:contract,measurement_scope:input.source==='gsc'?contract.scope:undefined,
      control:input.control,min_sample:input.min_sample,stop_conditions:input.stop_conditions,guardrails:input.guardrails,
      decision_rule:input.decision_rule,post_window:post,decision:null,evaluated_at:null,notes:[]};
    validLedger({experiments:[e]});
    if(input.source==='gsc')gscBaseline(e);
    const plan={schema_version:1,id:input.id,prepared_at:now.toISOString(),source,experiment:e};plan.sha256=digest(plan);
    const file=path.join(dir,'measurement-plan-'+input.id+'.json');
    assert(!fs.existsSync(file),'measurement plan is immutable; use a new ID before deciding');atomicJson(file,plan);
    return{status:'prepared',measurement:{id:plan.id,sha256:plan.sha256},baseline:e.baseline,post_window:post,evaluation_at:e.evaluation_at,
      next:'Include measurement in the prospective Company decision. Declare and bind first, then register-measurement and commit that registry change alone before implementing the page.'};
  } finally {release();}
}
export function verifyMeasurementInput(receipt,{stateRoot,input=receipt.decision?.input,at=receipt.decision?.recorded_at}={}) {
  if(receipt.schema_version<3||input.scope.artifact===null)return null;
  assert(input.measurement,'prospective Growth measurement plan required for content');
  const p=loadMeasurement({stateRoot,...input.measurement});
  assert.equal(p.experiment.page,input.scope.artifact,'measurement target differs from action');
  assert(Date.parse(p.prepared_at)<=Date.parse(at),'measurement must precede the decision');return p;
}
const rowFor=(p,r)=>({...p.experiment,company_measurement:{schema_version:1,plan_sha256:p.sha256,company_run_id:r.id,decision_sha256:r.decision.sha256}});
export async function registerMeasurement({stateRoot,id,root=ROOT,now=new Date()}) {
  assert(/^[a-f0-9-]{36}$/.test(id??''),'invalid Company run ID');
  const dir=privateState(stateRoot),release=acquireLock(dir);if(!release)return{status:'busy'};
  try {
    const r=read(owned(path.join(dir,'runs',id+'.json'),dir));
    decisionCommitment(r);
    const p=verifyMeasurementInput(r,{stateRoot:dir});assert(p,'new content decision required');
    assert.equal(r.status,'observed_decision_requires_execution');assert.equal(r.bound_decision_sha256,r.decision.sha256,'bind the pushed declaration first');
    assert.equal(r.bound_autopilot_run_id,r.decision.input.run_id);assert(r.bound_declaration_sha,'declaration SHA required');
    assert(p.experiment.started_at>=date(now,p.experiment.measurement_contract.time_zone),'prospective launch date has passed');
    const l=ledger(root),e=rowFor(p,r);validLedger(l);
    const old=l.experiments.find(x=>x.id===e.id);if(old){assert.deepEqual(old,e,'registered experiment changed');return{status:'already_registered',id:e.id};}
    assert.equal(git(root,['status','--porcelain']),'','registration must precede implementation from a clean declaration');
    assert.equal(git(root,['rev-parse','HEAD']),r.bound_declaration_sha,'register on the exact bound declaration');
    available(e.page,l.experiments,growthFollowups({stateRoot:dir,now}).reviews);
    l.experiments.push(e);validLedger(l);saveLedger(l,path.join(root,EXPERIMENTS));
    return{status:'registered',id:e.id,path:EXPERIMENTS,next:'Commit only the experiment registry before changing the declared page. Normal original contract/CI/claim gates still apply.'};
  } finally {release();}
}
export function verifyMeasurementDelivery(receipt,{stateRoot,root=ROOT,head,mergeSha=head,mergedAt,call=(name,args)=>execFileSync(name,args,{cwd:root,encoding:'utf8'})}) {
  const p=verifyMeasurementInput(receipt,{stateRoot});if(!p)return null;
  const expected=rowFor(p,receipt),r=receipt;
  const show=sha=>JSON.parse(call('git',['show',sha+':'+EXPERIMENTS])).experiments;
  assert(!show(r.bound_declaration_sha).some(e=>e.id===p.id),'baseline was retrofitted onto an existing experiment');
  const commits=call('git',['rev-list','--reverse','--first-parent',r.bound_declaration_sha+'..'+head]).trim().split('\n').filter(Boolean);
  const registration=commits.find(sha=>show(sha).some(e=>e.id===p.id));assert(registration,'canonical experiment registration missing');
  assert.deepEqual(show(registration).find(e=>e.id===p.id),expected,'registration differs from sealed prospective plan');
  assert.deepEqual(show(head).find(e=>e.id===p.id),expected,'measurement contract changed after registration');
  assert.deepEqual(show(mergeSha).find(e=>e.id===p.id),expected,'merged measurement differs from the validated head');
  const changed=call('git',['diff-tree','--no-commit-id','--name-only','-r',registration]).trim().split('\n');
  assert.deepEqual(changed,[EXPERIMENTS],'commit the experiment registry alone before implementation');
  call('git',['diff','--quiet',r.bound_declaration_sha,registration,'--',...r.decision.input.scope.paths.filter(p=>p!==EXPERIMENTS)]);
  assert.equal(date(new Date(mergedAt),p.experiment.measurement_contract.time_zone),p.experiment.started_at,'actual launch day differs from prospective treatment date; do not shift the baseline retrospectively');
  return{state:'registered_waiting_for_mature_evidence',experiment_id:p.id,plan_sha256:p.sha256,registration_sha:registration,
    source:p.source.kind,evaluation_at:p.experiment.evaluation_at,post_window:p.experiment.post_window};
}

function aioCohort({root,contract,start,end,now}) {
  const dir=path.join(root,'data/ai-visibility-history'),files=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>path.join(dir,f)):[];
  const latest=path.join(root,'data/ai-visibility-probe.json');if(fs.existsSync(latest))files.push(latest);
  const runs=new Map();
  for(const file of files) {
    const raw=fs.readFileSync(file),candidate=JSON.parse(raw),day=candidate.observed_at?.slice(0,10);
    if(candidate.series!==contract.scope.series||!day||day<start||day>end)continue;
    assert(Date.parse(candidate.observed_at)<=+now,'future probe rejected');
    const probe=validateAioBytes(raw,{at:candidate.observed_at});
    assert.equal(digest(probe.protocol),contract.scope.protocol_sha256,'AIO protocol changed');
    assert.deepEqual(probe.observations.map(q=>({id:q.question_id,text:q.question})),contract.scope.questions,'AIO question cohort changed');
    assert.equal(probe.unaided_valid_questions,contract.scope.unaided_questions,'AIO sample changed');
    const old=runs.get(probe.run_id);if(old)assert.equal(fingerprint(old.raw),fingerprint(raw),'conflicting copies of one AIO run');
    else runs.set(probe.run_id,{raw,probe});
  }
  return [...runs.values()];
}
function linkedExperiment({stateRoot,id,root,experiment}) {
  const e=experiment??ledger(root).experiments.find(e=>e.id===id);assert(e?.company_measurement?.schema_version===1,'not a prospectively linked Company experiment');
  const p=loadMeasurement({stateRoot,id,sha256:e.company_measurement.plan_sha256});
  const r=read(owned(path.join(stateRoot,'runs',e.company_measurement.company_run_id+'.json'),stateRoot));
  decisionCommitment(r);
  const proof=r.evidence_of_completion;
  assert.equal(r.status,'verified_existing_autopilot','real deployed Company output required before evaluation');
  assert.equal(proof?.decision_trace?.state,'verified');assert.equal(proof.decision_trace.decision_sha256,e.company_measurement.decision_sha256);
  assert.equal(r.followup?.plan_sha256,p.sha256,'completion must verify this measurement registration');
  const expected=rowFor(p,r);
  for(const k of Object.keys(expected).filter(k=>!['status','decision','evaluated_at','notes'].includes(k)))assert.deepEqual(e[k],expected[k],'registered measurement changed: '+k);
  return{e,p,r};
}
function retainedGscPost(p,{stateRoot,now,search=companySearch}) {
  const file=path.join(stateRoot,'measurement-post-'+p.sha256+'.json');
  if(fs.existsSync(file)) {
    const ref=read(owned(file,stateRoot));assert.equal(ref.plan_sha256,p.sha256);
    assert(Date.parse(ref.captured_at)<=+now,'future captured post source');
    return JSON.parse(sourceBytes({source:ref.source},stateRoot));
  }
  const current=search({stateRoot,now}),w=p.experiment.post_window;
  if(!current.evidence.actionable||current.snapshot?.meta.period_start!==w.start||current.snapshot?.meta.period_end!==w.end)return null;
  revalidateGscBaseline(p,stateRoot);
  gscEvidence(p.experiment,current.snapshot,{asOf:date(now),decision:'inconclusive'});
  const bundle={snapshot:current.snapshot,provenance:current.evidence};
  atomicJson(file,{plan_sha256:p.sha256,captured_at:now.toISOString(),source:stash(stateRoot,bundle)});
  return bundle;
}
function revalidateGscBaseline(p,stateRoot) {
  const rows=JSON.parse(sourceBytes(p,stateRoot)).snapshot.pages.filter(r=>r.page===p.experiment.page);assert.equal(rows.length,1);
  for(const key of ['clicks','impressions','position'])assert.equal(rows[0][key],p.experiment.baseline[key],'registered GSC baseline differs from original extraction');
  assert.equal(rows[0].clicks/rows[0].impressions,p.experiment.baseline.ctr);
  assert.equal(gscBaseline(p.experiment).value,p.experiment.baseline.value);return rows[0];
}
export function measurementComparison({stateRoot,id,root=ROOT,now=new Date(),search=companySearch,decision='inconclusive',rationale='Source comparison only; the existing daily owner must review guardrails and interpretation.'}) {
  const dir=privateState(stateRoot),{e,p}=linkedExperiment({stateRoot:dir,id,root});
  assert(['running','frozen'].includes(e.status),'preserve existing evaluated outcomes');
  assert(date(now)>=e.evaluation_at,'measurement is not due');
  const bytes=sourceBytes(p,dir),post=e.post_window;
  let evidence,sample;
  if(p.source.kind==='gsc') {
    const baseline=revalidateGscBaseline(p,dir);
    const current=retainedGscPost(p,{stateRoot:dir,now,search});assert(current,'post snapshot differs from registered window or is not admitted');
    assert.equal(current.snapshot.meta.period_start,post.start,'post snapshot differs from registered window');assert.equal(current.snapshot.meta.period_end,post.end);
    const ref=stash(dir,current);
    evidence=gscEvidence(e,current.snapshot,{asOf:date(now),decision,files:[p.source,ref]});
    sample={before:baseline[e.min_sample.metric],after:evidence.post[e.min_sample.metric],threshold:e.min_sample.threshold};
  } else {
    const b=validateAioBytes(bytes,{at:p.source.observed_at}),rows=aioCohort({root,contract:e.measurement_contract,start:post.start,end:post.end,now});
    assert.equal(rows.length,1,'post cohort needs exactly one original successful probe; missing is not zero');
    assert.notEqual(rows[0].probe.run_id,b.run_id,'baseline probe cannot be replayed as post');
    assert(!rows[0].probe.observations.some(q=>b.observations.some(old=>old.thread_id===q.thread_id)),'baseline question sessions cannot be replayed as post');
    const after=rows[0].probe,rawRef=stash(dir,rows[0].raw),c=e.measurement_contract;
    // The existing generic evidence gate requires measurement rows. Retain the
    // independently validated originals and seal the extracted rows separately.
    const beforeRef=stash(dir,{source:'ai_citations',original_report:p.source.sha256,rows:b.observations});
    const ref=stash(dir,{source:'ai_citations',original_report:rawRef.sha256,rows:after.observations});
    const item=(window,value,artifact)=>({...window,value,complete:true,...c,extraction:'Original validator recomputed fixed-question unaided_own_site_citation_rate',artifact:{path:artifact.file,sha256:artifact.sha256}});
    const [start,end]=e.baseline.window.split('..');
    evidence=reviewEvidence(e,{schema_version:1,experiment_id:e.id,target_metric:e.target_metric,decision,kind:'comparison',reviewed_by:'existing Company daily owner source adapter',rationale,...c,
      baseline:item(period(start,end),b.unaided_own_site_citation_rate,beforeRef),post:item(post,after.unaided_own_site_citation_rate,ref),
      limitations:['One small fixed-question sample per window; descriptive visibility only, no significance, traffic, installs or causal uplift claim.','Concurrent changes and external model/search changes require the daily owner review.']},
      {baseDir:dir,asOf:date(now),decision});
    evidence.original_probe_validation={before_run_id:b.run_id,after_run_id:after.run_id,before_raw_sha256:p.source.sha256,after_raw_sha256:rawRef.sha256,protocol_sha256:c.scope.protocol_sha256};
    sample={before:b.unaided_valid_questions,after:after.unaided_valid_questions,threshold:e.min_sample.threshold};
  }
  evidence.rationale=rationale;
  const sufficient=sample.before>=sample.threshold&&sample.after>=sample.threshold;
  assert(sufficient||decision==='inconclusive','insufficient registered sample permits only inconclusive');
  return{status:'ready_for_decision',experiment_id:id,evidence,sample,sufficient,guardrails:e.guardrails,decision_rule:e.decision_rule,
    next:'Review confounders and guardrails, then evaluate-measurement with a private decision. Original claim/contract gates apply to any resulting code change; keep is not WIN.'};
}
export async function evaluateMeasurement({stateRoot,id,evidenceFile,root=ROOT,now=new Date(),origin=nativeOrigin}) {
  const dir=privateState(stateRoot),release=acquireLock(dir);if(!release)return{status:'busy'};
  try {
    const review=read(owned(evidenceFile,dir));
    assert(['keep','revert','iterate','inconclusive'].includes(review.decision)&&text(review.rationale),'documented source-specific decision required');
    const {e}=linkedExperiment({stateRoot:dir,id,root});
    assert(Array.isArray(review.guardrail_findings)&&review.guardrail_findings.length===e.guardrails.length&&review.guardrail_findings.every(text),'review each registered guardrail');
    assert(text(review.confounders),'review concurrent changes and source limitations');
    const result=measurementComparison({stateRoot:dir,id,root,now,decision:review.decision,rationale:review.rationale});
    const evidence={...result.evidence,agent_review:{...review,sample:result.sample,reviewed_at:now.toISOString(),native_origin:origin()}};
    const ref=await privateEvidenceReference(evidence,{directory:path.join(dir,'experiment-evidence'),experimentId:id,decision:review.decision,evaluatedAt:date(now)});
    const l=ledger(root),target=l.experiments.find(x=>x.id===id);assert.deepEqual(target,e,'experiment changed during evaluation');
    Object.assign(target,{status:'evaluated',decision:review.decision,evaluated_at:date(now),evidence:ref});
    target.notes.push(date(now)+': Existing Company owner reviewed the registered source/window and guardrails. Evidence '+ref.sha256+'; descriptive comparison, no automatic WIN or causal credit.');
    validLedger(l);saveLedger(l,path.join(root,EXPERIMENTS));
    return{status:'evaluated',experiment_id:id,decision:review.decision,evidence:ref,
      next:['iterate','revert'].includes(review.decision)?'Existing daily owner must select and execute the resulting change through prospective decision, claim and CI gates. Evaluation is not delivery.':'Preserve this learning in future selection; do not infer a measured WIN.'};
  } finally {release();}
}
export function measurementStatus({stateRoot,root=ROOT,now=new Date()}) {
  const l=ledger(root);validLedger(l);const rows=[];
  for(const e of l.experiments.filter(e=>e.company_measurement)) {
    try {
      const linked=linkedExperiment({stateRoot,id:e.id,root});
      if(!isOpen(e)){
        const parent=evaluatedResult(e,linked.p,{stateRoot,now});
        const dir=path.join(stateRoot,'runs');
        const completed=fs.readdirSync(dir).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f)).map(f=>read(path.join(dir,f)))
          .find(r=>r.decision?.input?.parent_experiment===e.id&&isDeepStrictEqual(r.decision.input.parent_result,parent)
            &&r.decision.input.scope.artifact===e.page&&r.candidates?.find(c=>c.id===r.decision.input.candidate_id)?.experiment_id===e.id
            &&Date.parse(r.decision.recorded_at)>=Date.parse(parent.reviewed_at)
            &&Date.parse(r.evidence_of_completion?.merge?.merged_at)>=Date.parse(parent.reviewed_at)
            &&Date.parse(r.evidence_of_completion?.merge?.merged_at)<=+now&&decisionTrace(r).state==='verified');
        rows.push({id:e.id,page:e.page,status:'evaluated',decision:e.decision,evidence:e.evidence,completed_next_run:completed?.id??null,
          parent_result:parent,next_action:!completed&&['iterate','revert'].includes(e.decision)?'review_original_decision_for_action':null});continue;
      }
      // The daily source is a rolling window. Preserve an exact mature cohort
      // when the original owner sees it, even if review is scheduled later.
      if(linked.p.source.kind==='gsc')retainedGscPost(linked.p,{stateRoot,now});
      if(date(now)<e.evaluation_at){rows.push({id:e.id,status:'waiting_for_window',evaluation_at:e.evaluation_at});continue;}
      const r=measurementComparison({stateRoot,id:e.id,root,now});
      rows.push({id:e.id,status:r.status,sample:r.sample,source:e.measurement_contract.source});
    }catch(error){rows.push({id:e.id,status:'source_or_delivery_unavailable',reason:error.message,evaluation_at:e.evaluation_at});}
  }
  return{source:EXPERIMENTS,experiments:rows,interpretation:'Prospective Company experiments only. Historical source definitions and outcomes remain unchanged; no queries, probes or metrics credit.'};
}

function evaluatedResult(e,p,{stateRoot,now}) {
  const ref=e.evidence;
  assert.equal(e.status,'evaluated');assert.equal(ref?.kind,'private_reference','admitted evaluation evidence required');
  assert.equal(ref.artifact,'experiment-evidence-'+ref.sha256+'.json');
  const bytes=fs.readFileSync(owned(path.join(stateRoot,'experiment-evidence',ref.artifact),stateRoot));assert.equal(fingerprint(bytes),ref.sha256,'evaluation evidence changed');
  const b=JSON.parse(bytes),v=b.evidence;
  assert.equal(b.experiment_id,e.id);assert.equal(b.decision,e.decision,'evaluated decision changed');assert.equal(b.evaluated_at,e.evaluated_at);
  assert.equal(v.source,p.source.kind);assert.equal(v.target_metric,e.target_metric);
  assert.equal(v.kind,p.source.kind==='gsc'?'gsc_comparison':'manual_comparison');
  assert.equal(v.baseline.value,e.baseline.value);assert.equal(v.baseline.start+'..'+v.baseline.end,e.baseline.window);
  assert.equal(v.post.start,e.post_window.start);assert.equal(v.post.end,e.post_window.end);
  assert.deepEqual(v.scope,e.measurement_contract.scope);assert.equal(v.agent_review?.decision,e.decision);
  const at=Date.parse(v.agent_review.reviewed_at);assert(Number.isFinite(at)&&at<=+now&&date(new Date(at))===e.evaluated_at,'invalid retained evaluation time');
  return{experiment_id:e.id,decision:e.decision,evidence_sha256:ref.sha256,reviewed_at:v.agent_review.reviewed_at,page:e.page};
}

// A Goal receives already committed evidence from its existing owner. This is
// neither another experiment evaluator nor a claim of a causal Growth win.
export function measurementHandoffEvidence({stateRoot,root=ROOT,now=new Date(),readThread=nativeThread,excludeIdentities=[],
  call=(name,args)=>execFileSync(name,args,{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']}),
  readCanonical=()=>({sha:git(root,['rev-parse','origin/main']),ledger:JSON.parse(git(root,['show','origin/main:'+EXPERIMENTS]))})}={}) {
  const dir=privateState(stateRoot),events=[],failures=[],skipped=[];
  const canonical=readCanonical();assert.match(canonical.sha,/^[a-f0-9]{40}$/);validLedger(canonical.ledger);
  const states=new Map();
  const received=new Set(excludeIdentities);
  const thread=id=>{if(!states.has(id)){assert(states.size<64,'bounded native verification capacity exceeded');try{states.set(id,readThread(id));}catch{states.set(id,null);}}return states.get(id);};
  const deliveries=new Set();
  const admit=(candidate,claimedNative,receipt)=>{
    if(received.has(candidate.identity)){skipped.push({experiment_id:candidate.experiment_id,milestone:candidate.milestone,reason:'already_received_identity'});return;}
    if(!claimedNative){skipped.push({experiment_id:candidate.experiment_id,milestone:candidate.milestone,reason:'not_a_claimed_native_event'});return;}
    try {
      if(!deliveries.has(receipt.id)){verifyRetainedCompanyDelivery(receipt,{stateRoot:dir,root,call});deliveries.add(receipt.id);}
    }catch{failures.push({experiment_id:candidate.experiment_id,milestone:candidate.milestone,reason:'original_delivery_reverification_failed'});return;}
    try {
      const proof=nativeEventEvidence(candidate.native_origin,candidate.occurred_at,{now,readThread:thread});
      events.push({...candidate,native_proof:proof,source_main_sha:canonical.sha});
    }catch{failures.push({experiment_id:candidate.experiment_id,milestone:candidate.milestone,reason:'native_origin_unavailable_or_mismatched'});}
  };
  for(const e of canonical.ledger.experiments.filter(e=>e.company_measurement)) {
    let linked;
    try {
      linked=linkedExperiment({stateRoot:dir,root,id:e.id,experiment:e});
      const {r,p}=linked,merge=r.evidence_of_completion?.merge;
      assert(r.schema_version>=3&&decisionTrace(r).state==='verified','prospective verified delivery required');
      assert.match(merge?.merge_sha??'',/^[a-f0-9]{40}$/);assert.match(merge.head_sha??'',/^[a-f0-9]{40}$/);
      assert(Number.isSafeInteger(merge.pr)&&merge.pr>0&&Number.isSafeInteger(merge.validation_run)&&merge.validation_run>0,'exact verified PR and CI identity required');
      git(root,['merge-base','--is-ancestor',merge.merge_sha,canonical.sha]);
      const finished=Date.parse(r.finished_at),merged=Date.parse(merge.merged_at);
      assert(Number.isFinite(finished)&&finished<=+now&&merged<=finished&&Date.parse(r.decision.recorded_at)<=merged,'delivery chronology required');
      assert.equal(r.followup.experiment_id,e.id);assert.equal(r.followup.state,'registered_waiting_for_mature_evidence');
      const receiptBytes=fs.readFileSync(owned(path.join(dir,'runs',r.id+'.json'),dir));
      admit({milestone:'verified_growth_delivery',experiment_id:e.id,occurred_at:r.finished_at,native_origin:r.origin_proof,
        identity:digest({experiment:e.id,decision:r.decision.sha256,merge:merge.merge_sha}),
        evidence:{company_run_id:r.id,receipt_file:'runs/'+r.id+'.json',receipt_sha256:fingerprint(receiptBytes),decision_sha256:r.decision.sha256,
          plan_sha256:p.sha256,merge_sha:merge.merge_sha,head_sha:merge.head_sha,pr:merge.pr,validation_run:merge.validation_run,page:e.page,source:p.source.kind}},
        r.route==='actions'&&r.origin==='codex-automation',r);
    }catch{failures.push({experiment_id:e.id,milestone:'verified_growth_delivery',reason:'prospective_delivery_evidence_unavailable_or_mismatched'});continue;}
    if(e.status!=='evaluated')continue;
    try {
      const result=evaluatedResult(e,linked.p,{stateRoot:dir,now});
      const bundle=read(owned(path.join(dir,'experiment-evidence',e.evidence.artifact),dir)),review=bundle.evidence.agent_review;
      assert(Date.parse(linked.r.finished_at)<=Date.parse(result.reviewed_at)&&date(new Date(result.reviewed_at))>=e.evaluation_at,'evaluation must follow delivered treatment and original due date');
      admit({milestone:'reviewed_growth_measurement',experiment_id:e.id,occurred_at:result.reviewed_at,native_origin:review.native_origin,
        identity:digest({experiment:e.id,evidence:result.evidence_sha256}),
        evidence:{...result,plan_sha256:linked.p.sha256,evidence_file:'experiment-evidence/'+e.evidence.artifact,
          source:linked.p.source.kind,post_window:e.post_window,interpretation:'Admitted source-specific review, not an automatic WIN or completed follow-on action.'}},
        review.native_origin?.state==='native_execution_record',linked.r);
    }catch{failures.push({experiment_id:e.id,milestone:'reviewed_growth_measurement',reason:'evaluated_evidence_unavailable_or_mismatched'});}
  }
  events.sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.identity.localeCompare(b.identity));
  return{events,failures,skipped,scope:'Committed prospective Growth evidence plus original native turn/gate proof; not a formal rate or completion claim.'};
}
