import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {digest,ROOT} from './company-metrics.mjs';
import {privateState,atomicJson,acquireLock,observe,opportunities} from './company-loop.mjs';
import {safePath,intentPath} from '../../scripts/value-contracts.mjs';
import {boundRun,verifyDecision} from '../../scripts/decision-ci.mjs';
import {verifyMeasurementInput,verifyMeasurementOwnership,verifyMeasurementMergeScope,measurementBaselineRows,EXPERIMENTS} from './company-measurement.mjs';

const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const uuid=s=>/^[a-f0-9-]{36}$/.test(s??'');
const text=s=>typeof s==='string' && s.trim().length>=20 && s.length<=2000;
const contentKinds=new Set(['existing_content_queue','review_existing_search_page','review_mention_owned_page']);
const repairKinds=new Set(['diagnose_automation','diagnose_measurement','integrate_existing_reader']);
// The AIO validator's check time changes on every read; retained source dates,
// bytes, question evidence, permission and experiment blocks remain material.
export const candidateDigest=c=>digest(JSON.parse(JSON.stringify(c,(k,v)=>k==='checked_at'?undefined:v)));
export function artifactPaths(artifact) {
  assert(typeof artifact==='string' && artifact.startsWith('/') && !artifact.startsWith('//') && !/[?#\\%]/.test(artifact),'exact same-site artifact required');
  const p=artifact.slice(1);
  const paths=artifact.endsWith('/')?[p+'index.html']:[p,p+'.html',p+'/index.html'];
  assert(paths.every(safePath),'invalid artifact path');return paths;
}
function validateScope(candidate,scope) {
  assert(Array.isArray(scope?.paths) && scope.paths.length>0 && scope.paths.length<=50 && scope.paths.every(safePath)
    && new Set(scope.paths).size===scope.paths.length,'bounded affected paths required');
  if(contentKinds.has(candidate.kind)) {
    const files=artifactPaths(scope.artifact);
    assert(files.some(p=>p.endsWith('.html') && scope.paths.includes(p)),'selected content target must be in affected paths');
    if(candidate.target_page)assert.equal(scope.artifact.replace(/\/$/,''),candidate.target_page.replace(/\/$/,''),'artifact differs from observed target page');
  } else {
    assert(repairKinds.has(candidate.kind),'this candidate requires its existing diagnostic/evaluation command; it cannot claim a shipped page');
    assert.equal(scope.artifact,null,'an operational diagnosis cannot be completed by publishing an unrelated article');
    assert(scope.paths.some(p=>/^(scripts|growth\/lib|functions)\//.test(p)),'operational scope requires an actual implementation path');
  }
}
export function decisionCommitment(receipt) {
  const d=receipt.decision;
  assert(d?.schema_version===1 && d.company_run_id===receipt.id,'prospective Company decision required');
  assert(/^[a-f0-9]{40}$/.test(d.source_commit??'') && /^[a-f0-9]{64}$/.test(d.observation_fingerprint??''),'retained observation identity required');
  const candidate=receipt.candidates?.find(c=>c.id===d.input.candidate_id);
  assert(candidate && candidateDigest(candidate)===d.candidate_sha256,'observed candidate evidence changed');
  assert.equal(d.observation_fingerprint,receipt.observation_fingerprint,'observation identity changed');
  assert.equal(d.source_commit,receipt.source_commit,'decision source commit changed');
  validateScope(candidate,d.input.scope);
  assert.equal(d.sha256,digest(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='sha256'))),'decision integrity mismatch');
  return {schema_version:1,company_run_id:receipt.id,sha256:d.sha256};
}
export function prepareCompanyDecision({stateRoot,id,evidenceFile,now=new Date(),currentCandidates,root=ROOT}) {
  assert(uuid(id),'invalid Company run ID');
  const dir=privateState(stateRoot),release=acquireLock(dir);if(!release)return{status:'busy'};
  try {
    const file=path.join(dir,'runs',id+'.json'),receipt=read(file);
    assert([2,3].includes(receipt.schema_version) && receipt.status==='observed_decision_requires_execution','start a new prospective observation; legacy receipts cannot be upgraded');
    const source=fs.realpathSync(evidenceFile),stat=fs.statSync(source);
    assert(source.startsWith(fs.realpathSync(dir)+path.sep) && stat.isFile() && !(stat.mode&0o077) && stat.uid===process.getuid(),'private decision input required');
    const input=read(source);
    assert(input.schema_version===1 && /^[a-z0-9][a-z0-9-]{2,99}$/.test(input.contract_id??'') && /^[A-Za-z0-9._-]{1,160}$/.test(input.run_id??''),'prospective contract and canonical run identities required');
    assert(text(input.rationale) && text(input.source_to_action),'explain both the comparison and source-to-action judgment');
    const candidate=receipt.candidates.find(c=>c.id===input.candidate_id);
    assert(candidate?.permission==='AUTO' && candidate.executable===true && Number.isFinite(candidate.priority),'candidate must be observed and eligible for review');
    assert(Array.isArray(input.alternatives) && input.alternatives.length>0 && input.alternatives.length<=10 && input.alternatives.every(a=>a.id!==candidate.id && receipt.candidates.some(c=>c.id===a.id) && text(a.reason)),'compare at least one other observed candidate');
    validateScope(candidate,input.scope);
    const measurement=verifyMeasurementInput(receipt,{stateRoot:dir,input,at:now.toISOString()});
    if(measurement)verifyMeasurementOwnership(measurement,{stateRoot:dir,root,now,rows:measurementBaselineRows(measurement,{root,now})});
    if(candidate.experiment_id||input.parent_experiment||input.parent_result) {
      assert(candidate.experiment_id,'only an observed measured-result candidate can bind a parent');
      assert.equal(input.parent_experiment,candidate.experiment_id,'retain the measured parent behind this next action');
      assert.deepEqual(input.parent_result,candidate.parent_result,'bind the exact admitted evaluated result');
      assert(input.scope.artifact===input.parent_result.page&&Date.parse(now)>=Date.parse(input.parent_result.reviewed_at),'next action must follow evaluation on its actual target');
    }
    if(receipt.decision) {
      assert(isDeepStrictEqual(receipt.decision.input,input),'recorded decision is immutable; retain it and start a new observation if selection changes');
      return{status:'already_recorded',id,commitment:decisionCommitment(receipt)};
    }
    assert(!receipt.bound_autopilot_run_id,'execution is already bound');
    const age=now.getTime()-Date.parse(receipt.observed_at);
    assert(Number.isFinite(age) && age>=0 && age<=6*3600000,'current observation required');
    const latest=currentCandidates??opportunities(observe({stateRoot:dir,now}));
    assert(latest.some(c=>c.id===candidate.id && candidateDigest(c)===candidateDigest(candidate)),'candidate source or eligibility changed; observe again');
    assert(!receipt.execution_boundary.stopped && !receipt.execution_boundary[receipt.route==='actions'?'actions_stopped':'owner_session_stopped'],'stopped observation');
    const d={schema_version:1,company_run_id:id,recorded_at:now.toISOString(),source_commit:receipt.source_commit,
      observation_fingerprint:receipt.observation_fingerprint,candidate_sha256:candidateDigest(candidate),
      initial_recommendation:receipt.selected?.id??null,input,
      interpretation:'Prospective agent judgment, not independently established causality or business impact. Existing permission, contract, experiment and claim gates still apply.'};
    d.sha256=digest(d);receipt.decision=d;receipt.stages.decide='recorded_pending_contract';
    atomicJson(file,receipt);atomicJson(path.join(dir,'latest-run.json'),receipt);
    return{status:'recorded',id,commitment:decisionCommitment(receipt),next:'Copy commitment into company_decision on the matching original selector candidate; declare and push the existing value contract, then bind before implementation.'};
  } finally {release();}
}

export async function verifyDecisionContract(receipt,contract,call,{head,cwd,delivered=false}={}) {
  const commitment=decisionCommitment(receipt),d=receipt.decision;
  assert(contract.id===d.input.contract_id && contract.run_id===d.input.run_id,'contract differs from actual Company decision');
  assert.deepEqual(contract.candidates?.find(c=>c.id===contract.id)?.company_decision,commitment,'declared contract does not seal this Company decision');
  const at=Date.parse(d.recorded_at),created=Date.parse(contract.created_at);
  assert(Number.isFinite(at) && at>=Date.parse(receipt.observed_at) && Number.isFinite(created) && created>=at,'contract must follow the recorded decision');
  call('git',['merge-base','--is-ancestor',receipt.source_commit,head]);
  assert.deepEqual(JSON.parse(call('git',['show',head+':'+intentPath(contract.id)])),contract,'merged contract differs from validated PR head');
  // Reuse the entire original gate, including future additions: reproducible
  // selection, protected paths, R0/R1, timestamps, diff budgets and canonical run.
  // The Company caller requires a contract even on a user-directed branch.
  const history=await verifyDecision({branch:call('git',['branch','--show-current']).trim(),head,baseRef:receipt.source_commit,cwd,requireContract:true});
  assert(d.input.scope.paths.every(p=>contract.touches.includes(p)),'action scope exceeds declared paths');
  if(receipt.schema_version>=3 && d.input.scope.artifact!==null)assert(contract.touches.includes(EXPERIMENTS),'content contract must include its prospective experiment registration');
  const candidate=receipt.candidates.find(c=>c.id===d.input.candidate_id);
  if(contentKinds.has(candidate.kind))assert(contract.input?.kind==='article' && ['A','B','C','D','E'].includes(contract.input?.lane),'content decision requires the original content lane');
  else {
    assert(contract.input?.kind==='repair' && contract.input?.lane==='F','operational decision requires the original repair lane');
    assert(!contract.touches.some(p=>/^(index\.html|(?:en|obsidian|blog|use-cases|vs)\/.*\.html)$/.test(p)),'operational diagnosis cannot introduce an unrelated content treatment');
  }
  if(delivered) {
    const changed=call('git',['diff','--name-only',history.declaration_sha,head]).trim().split('\n');
    assert(d.input.scope.paths.every(p=>changed.includes(p)),'selected affected paths were not implemented');
    if(d.input.scope.artifact!==null)assert(artifactPaths(d.input.scope.artifact).some(p=>changed.includes(p)),'selected page was not changed');
    assert(history.changed_lines>0 || history.binary_bytes>0,'selected action has no implementation');
    assert.equal(receipt.bound_declaration_sha,history.declaration_sha,'declaration changed after binding');
    assert.equal(receipt.bound_decision_sha256,d.sha256,'decision changed after binding');
  } else {
    assert(history.changed_lines===0 && history.binary_bytes===0,'implementation must follow Company binding');
    assert(!call('git',['status','--porcelain']).trim(),'bind from the clean declaration checkout before implementation');
  }
  return history;
}
export async function verifyDecisionDelivery(receipt,contract,row,before,after,merge,call,cwd,{stateRoot}={}) {
  assert.equal(row.run_id,receipt.decision?.input.run_id,'run differs from selected decision');
  assert.equal(row.artifact,receipt.decision.input.scope.artifact,'delivered artifact differs from selected decision');
  assert(Number.isFinite(Date.parse(receipt.bound_at)) && Date.parse(receipt.bound_at)>=Date.parse(contract.created_at)
    && Date.parse(merge.merged_at)>=Date.parse(receipt.bound_at),'action must follow prospective binding');
  assert.deepEqual(boundRun(contract,before,after),row,'canonical task binding failed');
  const history=await verifyDecisionContract(receipt,contract,call,{head:merge.head_sha,cwd,delivered:true});
  const mergeScope=verifyMeasurementMergeScope(receipt,{stateRoot,head:merge.head_sha,mergeSha:merge.merge_sha,mergedAt:merge.merged_at,call});
  return {state:'verified',decision_sha256:receipt.decision.sha256,candidate_id:receipt.decision.input.candidate_id,
    contract_id:contract.id,contract_path:intentPath(contract.id),declaration_sha:history.declaration_sha,
    ...(mergeScope?{merge_scope_verification:mergeScope}:{}),
    limitation:'The frozen decision, canonical contract/run and affected output match. Relevance is an explicit agent judgment; measured effect awaits the original evaluation gate.'};
}
export function decisionTrace(receipt) {
  if(!['verified_existing_autopilot','verified_integration'].includes(receipt.status))return{state:'pending',candidate_id:receipt.decision?.input.candidate_id??null};
  if(!receipt.decision)return{state:'unproven_legacy_trace',delivery_status:receipt.status,
    initial_recommendation:receipt.selected?.id??null,artifact:receipt.evidence_of_completion?.artifact??null,
    reason:'Retained delivery evidence has no prospective source-to-action commitment. Preserve history; do not infer a complete Growth PDCA loop.'};
  try {
    const seal=decisionCommitment(receipt),proof=receipt.evidence_of_completion;
    assert.equal(proof?.decision_trace?.state,'verified');assert.equal(proof.decision_trace.decision_sha256,seal.sha256);
    assert.equal(proof.canonical_run_id,receipt.decision.input.run_id);assert.equal(proof.artifact,receipt.decision.input.scope.artifact);
    assert.equal(receipt.bound_decision_sha256,seal.sha256);
    return{...proof.decision_trace,verification:'Retained completion proof; no new remote verification or metric credit.'};
  }catch{return{state:'invalid_trace',reason:'retained decision/completion evidence mismatch'};}
}
export function decisionTraceStatus({stateRoot}) {
  const dir=path.join(stateRoot,'runs'),runs=[],failures=[];
  if(fs.existsSync(dir))for(const file of fs.readdirSync(dir).filter(f=>/^[a-f0-9-]{36}\.json$/.test(f))) {
    try {const r=read(path.join(dir,file));if(['verified_existing_autopilot','verified_integration'].includes(r.status))runs.push({id:r.id,...decisionTrace(r)});}
    catch {failures.push({source:'company_decision_trace',artifact:file,reason:'unreadable_run'});}
  }
  return{scope:'Supplemental decision continuity audit; no change to formal metrics, original run outcomes or experiment results.',runs,failures};
}
