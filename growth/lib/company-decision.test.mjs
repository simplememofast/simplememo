import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ROOT} from './company-metrics.mjs';
import {prepareCompanyDecision,decisionTraceStatus,verifyDecisionDelivery} from './company-decision.mjs';
import {bindExistingRun,finishExistingRun} from './company-proof.mjs';
import {selectContract,predictionFeedback} from '../../scripts/value-contracts.mjs';
import {loadContext as eligibilityContext} from '../../scripts/autonomy-eligibility.mjs';

// Local synthetic repositories exercise real immutable declaration history.
// They are never production runs, contracts, score inputs or collection receipts.
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'company-decision-'));fs.chmodSync(root,0o700);
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const cwd=path.join(root,'repo'),stateRoot=path.join(root,'state');
  fs.mkdirSync(cwd);fs.mkdirSync(stateRoot,{mode:0o700});fs.mkdirSync(path.join(stateRoot,'runs'),{mode:0o700});
  let gitTime='2026-09-04T00:00:00Z';
  const call=(name,args)=>execFileSync(name,args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_AUTHOR_DATE:gitTime,GIT_COMMITTER_DATE:gitTime}});
  const git=(...a)=>call('git',a).trim();
  git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  const write=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n',{mode:0o600});};
  const now=new Date('2026-09-04T00:00:00Z'),id='11111111-1111-4111-8111-111111111111',runId='fixture-run';
  const metrics={metrics:[{id:'publishing_day_rate',tier:'A',approved_by:'fixture-owner',approved_at:'2026-08-01',direction:'up',null_model:{kind:'trailing_median',window_days:3}}]};
  write(path.join(cwd,'data/value-metrics.json'),metrics);
  const historical=[1,2,3].map(i=>({run_id:'r'+i,date_jst:'2026-09-0'+i,outcome:'no_run'}));
  write(path.join(cwd,'data/autopilot-runs.json'),{runs:historical});
  for(const p of ['data/eligibility-policy.json','data/autonomy-score.json','data/authority-matrix.json','data/model-routing.json','scripts/value-contracts.mjs']) {
    fs.mkdirSync(path.dirname(path.join(cwd,p)),{recursive:true});fs.copyFileSync(path.join(ROOT,p),path.join(cwd,p));
  }
  write(path.join(cwd,'data/autopilot-cost.json'),{runs:[]});write(path.join(cwd,'data/decision-review.json'),{selections:[]});
  write(path.join(cwd,'data/value-contracts.json'),{contracts:[]});
  write(path.join(cwd,'data/emergency-stop.json'),{stopped:false,agents:{'owner-session':{stopped:false}}});
  fs.mkdirSync(path.join(cwd,'obsidian/example'),{recursive:true});fs.writeFileSync(path.join(cwd,'obsidian/example/index.html'),'<html>before</html>\n');fs.writeFileSync(path.join(cwd,'obsidian/existing.html'),'<html>existing</html>\n');
  git('add','.');git('commit','-qm','fixture base');const source=git('rev-parse','HEAD');
  const other={id:'diagnose:fixture',kind:'diagnose_automation',permission:'AUTO',executable:true,priority:80,evidence:['failure-1']};
  const candidate={id:'content:fixture',kind:'existing_content_queue',permission:'AUTO',executable:true,priority:60,evidence:[{question:'fixture-question',sha256:'a'.repeat(64)}]};
  const candidates=[other,candidate];
  const receipt={schema_version:2,id,status:'observed_decision_requires_execution',route:'owner-session',started_at:now.toISOString(),observed_at:now.toISOString(),
    source_commit:source,observation_fingerprint:'b'.repeat(64),selected:other,candidates,prior_autopilot_run_ids:[],
    stages:{detect:'completed',decide:'pending',execute:'pending',verify:'pending'},execution_boundary:{stopped:false,owner_session_stopped:false}};
  const file=path.join(stateRoot,'runs',id+'.json'),inputFile=path.join(stateRoot,'input.json');write(file,receipt);
  const input={schema_version:1,candidate_id:candidate.id,contract_id:'fixture-contract',run_id:runId,
    rationale:'The reviewed failure has no safe repair; the content candidate has retained evidence.',
    source_to_action:'The observed question calls for the concrete retained example on this selected page.',
    alternatives:[{id:other.id,reason:'The current failure is investigated and no justified repair is available.'}],
    scope:{artifact:'/obsidian/example/',paths:['obsidian/example/index.html']}};
  write(inputFile,input);
  const load=()=>JSON.parse(fs.readFileSync(file));
  const prepare=()=>prepareCompanyDecision({stateRoot,id,evidenceFile:inputFile,now,currentCandidates:candidates});
  const declare=async({mutateContract,newPage=false}={})=>{
    const commitment=prepare().commitment;
    const candidate={id:input.contract_id,run_id:runId,metric:'publishing_day_rate',touches:input.scope.paths,lane:newPage?'E':'A',action:newPage?'new':'refresh',kind:'article',
      evidence_date:'2026-09-03',predicted_usd:0,predicted_delta:1,p:.2,horizon_days:1,max_changed_lines:100,max_binary_bytes:0,rank_gap:.5,rank:1,
      counterfactual:{id:'fixture-other',reason:'Independent candidate comparison.'},company_decision:commitment,
      calibration:{snapshot_sha256:predictionFeedback([],{before:now}).snapshot_sha256,reason:'No settled observations; the probability remains an explicit uncertain forecast.'}};
    const choices=[candidate,{...candidate,id:'fixture-other',rank:.5,counterfactual:{id:candidate.id,reason:'Independent candidate comparison.'}}];
    const contract=await selectContract(choices,{metrics,runs:historical,costs:[],now:new Date(+now+1000),eligibility:eligibilityContext({today:'2026-09-04'})},{selections:[]},[]);
    if(mutateContract)mutateContract(contract);gitTime=new Date(+now+1000).toISOString();
    write(path.join(cwd,'data/decision-intents/fixture-contract.json'),contract);git('add','.');git('commit','-qm','fixture declaration');
    const declaration=git('rev-parse','HEAD');
    execFileSync('git',['init','--bare','-q',path.join(root,'remote')]);git('remote','add','origin',path.join(root,'remote'));git('push','-q','origin','HEAD');
    return{contract,declaration};
  };
  const bind=()=>bindExistingRun({stateRoot,id,autopilotRunId:runId,call,cwd,now:new Date(+now+2000),currentCandidates:candidates});
  const deliver=({newPage=false}={})=>{gitTime=new Date(+now+3000).toISOString();
    const row={run_id:runId,outcome:'shipped',attempted:true,route:'owner-session',lane:newPage?'E':'A',action:newPage?'new':'refresh',artifact:input.scope.artifact,pr:1};
    const target=path.join(cwd,input.scope.paths[0]);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'<html>fixture</html>\n');
    write(path.join(cwd,'data/autopilot-runs.json'),{runs:[...historical,row]});git('add','.');git('commit','-qm','fixture implementation');
    const head=git('rev-parse','HEAD');return{row,merge:{pr:1,merge_sha:head,head_sha:head,merged_at:new Date(+now+3000).toISOString()}};
  };
  return{root,cwd,stateRoot,now,id,runId,input,inputFile,file,write,load,call,git,candidates,prepare,declare,bind,deliver};
}

test('the unchanged original selector preserves and reproduces the public commitment without publishing private rationale',async()=>{
  const now=new Date('2026-09-04T00:00:00Z');
  const metrics={metrics:[{id:'shipping_day_rate',tier:'A',approved_by:'fixture-owner',approved_at:'2026-08-01',direction:'up',null_model:{kind:'trailing_median',window_days:3}}]};
  const ctx={metrics,runs:[1,2,3].map(i=>({run_id:'r'+i,date_jst:'2026-09-0'+i,outcome:'no_run'})),costs:[],now,eligibility:eligibilityContext({today:'2026-09-04'})};
  const seal={schema_version:1,company_run_id:'11111111-1111-4111-8111-111111111111',sha256:'a'.repeat(64)};
  const c={id:'fixture-first',run_id:'fixture-run',metric:'shipping_day_rate',touches:['index.html'],lane:'A',action:'refresh',kind:'article',
    evidence_date:'2026-09-03',predicted_usd:0,predicted_delta:.1,p:.2,horizon_days:1,max_changed_lines:100,rank_gap:.1,rank:1,
    counterfactual:{id:'fixture-second',reason:'Independent candidate comparison.'},company_decision:seal,
    calibration:{snapshot_sha256:predictionFeedback([],{before:now}).snapshot_sha256,reason:'No settled observations; the probability remains an explicit uncertain forecast.'}};
  const candidates=[c,{...c,id:'fixture-second',rank:.5,counterfactual:{id:c.id,reason:'Independent candidate comparison.'}}];
  const selected=await selectContract(candidates,ctx,{selections:[]},[]);
  assert.deepEqual(selected.candidates.find(x=>x.id===selected.id).company_decision,seal);
  assert.deepEqual(await selectContract(selected.candidates,ctx,{selections:[]},[]),selected);
  assert.equal(JSON.stringify(selected).includes('source_to_action'),false);
});

test('explicit reselection preserves recommendation, seals choice in original contract and binds before the matching implementation',async t=>{
  const f=fixture(t),{contract,declaration}=await f.declare();
  assert.equal(f.load().selected.id,'diagnose:fixture');assert.equal(f.load().decision.input.candidate_id,'content:fixture');
  assert.equal(f.prepare().status,'already_recorded');
  const bound=await f.bind();assert.equal(bound.bound_declaration_sha,declaration);assert.equal(bound.stages.decide,'completed');
  const {row,merge}=f.deliver();
  const before=f.load().bound_at;assert.equal((await f.bind()).bound_at,before,'idempotent bind after implementation cannot move time');
  const proof=await verifyDecisionDelivery(f.load(),contract,row,[],[row],merge,f.call,f.cwd);
  assert.equal(proof.state,'verified');assert.equal(proof.candidate_id,'content:fixture');
  assert.equal(fs.statSync(f.file).mode&0o077,0);
});

test('unrelated artifacts, changed scopes, unrelated canonical lanes and omitted actual target changes cannot complete',async t=>{
  const f=fixture(t),{contract}=await f.declare();await f.bind();const {row,merge}=f.deliver(),r=f.load();
  const check=(receipt=r,c=contract,run=row)=>verifyDecisionDelivery(receipt,c,run,[],[run],merge,f.call,f.cwd);
  await assert.rejects(()=>check(r,contract,{...row,artifact:'/other/'}),/artifact/);
  await assert.rejects(()=>check(r,contract,{...row,lane:'F'}),/lane/);
  await assert.rejects(()=>check({...r,bound_at:new Date(Date.parse(merge.merged_at)+1000).toISOString()}),/prospective/);
  await assert.rejects(()=>check({...r,bound_declaration_sha:'c'.repeat(40)}),/declaration changed/);
  const changed=structuredClone(r);changed.decision.input.scope.artifact='/another/';await assert.rejects(()=>check(changed),/artifact|integrity/);
  const changedContract=structuredClone(contract);changedContract.candidates[0].company_decision.sha256='d'.repeat(64);
  await assert.rejects(()=>check(r,changedContract),/seal/);
  // A copied source that is unchanged at the declared target cannot count as an action.
  fs.writeFileSync(path.join(f.cwd,'obsidian/example/index.html'),'<html>before</html>\n');f.git('add','.');f.git('commit','-qm','fixture removes treatment');
  await assert.rejects(()=>verifyDecisionDelivery(r,contract,row,[],[row],{...merge,head_sha:f.git('rev-parse','HEAD')},f.call,f.cwd),/not implemented|not changed|no implemented change/);
});

test('binding rejects unsealed, historical, unpushed and already implemented declarations',async t=>{
  const f=fixture(t);f.prepare();await assert.rejects(()=>f.bind());const {contract}=await f.declare();
  f.git('remote','remove','origin');await assert.rejects(()=>f.bind());f.git('remote','add','origin',path.join(f.root,'remote'));
  const original=f.load();f.write(f.file,{...original,prior_autopilot_run_ids:[f.runId]});await assert.rejects(()=>f.bind(),/historical/);f.write(f.file,original);
  const edited=structuredClone(original);edited.decision.input.rationale='A different rationale after declaration.';f.write(f.file,edited);await assert.rejects(()=>f.bind(),/integrity/);f.write(f.file,original);
  fs.writeFileSync(path.join(f.cwd,'unexpected-draft.txt'),'implementation');await assert.rejects(()=>f.bind(),/clean declaration/);fs.unlinkSync(path.join(f.cwd,'unexpected-draft.txt'));
  f.deliver();await assert.rejects(()=>f.bind(),/historical|implementation/);
  assert.equal(contract.id,'fixture-contract');
});

test('decision refuses stale, blocked, changed, insufficiently reviewed and wrong-domain observations',async t=>{
  const f=fixture(t);
  const call=over=>prepareCompanyDecision({stateRoot:f.stateRoot,id:f.id,evidenceFile:f.inputFile,now:f.now,currentCandidates:f.candidates,...over});
  assert.throws(()=>call({now:new Date(+f.now+7*3600000)}),/current observation/);
  assert.throws(()=>call({currentCandidates:[]}),/changed/);
  f.write(f.inputFile,{...f.input,alternatives:[]});assert.throws(()=>call(),/compare/);
  f.write(f.inputFile,{...f.input,candidate_id:'diagnose:fixture',alternatives:[{id:'content:fixture',reason:'A content comparison with explicit evidence.'}]});assert.throws(()=>call(),/unrelated article/);
  f.write(f.inputFile,f.input);const r=f.load();r.candidates[1].executable=false;f.write(f.file,r);assert.throws(()=>call(),/eligible/);
  r.candidates[1].executable=true;r.schema_version=1;f.write(f.file,r);assert.throws(()=>call(),/legacy/);
});

test('real finish path verifies scope before publication, preserves legacy evidence and rejects conflicting retries',async t=>{
  const f=fixture(t),{contract}=await f.declare();await f.bind();const {row,merge}=f.deliver();
  const evidence=path.join(f.stateRoot,'finish.json');f.write(evidence,{kind:'autopilot_run',run_id:f.runId,pr:1});
  const call=(name,args)=>{
    if(name==='gh' && args[0]==='pr')return JSON.stringify({state:'MERGED',baseRefName:'main',mergedAt:merge.merged_at,mergeCommit:{oid:merge.merge_sha},headRefOid:merge.head_sha,files:[]});
    if(name==='gh')return JSON.stringify([{databaseId:1,headSha:merge.head_sha,event:'pull_request',status:'completed',conclusion:'success'}]);
    if(args[0]==='fetch')return '';
    if(args.at(-1)==='origin/main')return '';
    return f.call(name,args);
  };
  let fetched=0;
  const args={stateRoot:f.stateRoot,id:f.id,evidenceFile:evidence,call,cwd:f.cwd,now:new Date(+f.now+4000),
    fetchImpl:async url=>{fetched++;return{ok:true,url,text:async()=>'<html>fixture</html>\n'};}};
  const result=await finishExistingRun(args);assert.equal(result.evidence_of_completion.decision_trace.state,'verified');assert.equal(fetched,1);
  assert.equal(decisionTraceStatus({stateRoot:f.stateRoot}).runs[0].state,'verified');
  const bytes=fs.readFileSync(f.file,'utf8');await finishExistingRun(args);assert.equal(fs.readFileSync(f.file,'utf8'),bytes);
  f.write(evidence,{kind:'autopilot_run',run_id:f.runId,pr:2});await assert.rejects(finishExistingRun(args),/identity/);
  const legacy={...result,schema_version:1};delete legacy.decision;f.write(f.file,legacy);
  f.write(evidence,{kind:'autopilot_run',run_id:f.runId,pr:1});const old=fs.readFileSync(f.file,'utf8');
  await assert.rejects(finishExistingRun(args),/prospective/);assert.equal(fs.readFileSync(f.file,'utf8'),old);
  assert.equal(decisionTraceStatus({stateRoot:f.stateRoot}).runs[0].state,'unproven_legacy_trace');
  assert.equal(contract.id,'fixture-contract');assert.equal(row.artifact,'/obsidian/example/');
});


test('manual contract forgery and changed content at merge cannot acquire decision proof',async t=>{
  const f=fixture(t);
  await f.declare({mutateContract:c=>{c.candidates=c.candidates.slice(0,1);}});
  await assert.rejects(()=>f.bind(),/2..10 distinct/);
  const g=fixture(t),{contract}=await g.declare();await g.bind();const {row,merge}=g.deliver();
  fs.writeFileSync(path.join(g.cwd,g.input.scope.paths[0]),'<html>different merge content</html>\n');g.git('add','.');g.git('commit','-qm','fixture merge changes target');
  await assert.rejects(()=>verifyDecisionDelivery(g.load(),contract,row,[],[row],{...merge,merge_sha:g.git('rev-parse','HEAD')},g.call,g.cwd));
});

test('an alternate file change cannot verify an unchanged actually served page',async t=>{
  const f=fixture(t);f.input.scope={artifact:'/obsidian/existing.html',paths:['obsidian/existing.html.html']};f.write(f.inputFile,f.input);
  await f.declare({newPage:true});await f.bind();const {merge}=f.deliver({newPage:true});
  const evidence=path.join(f.stateRoot,'finish.json');f.write(evidence,{kind:'autopilot_run',run_id:f.runId,pr:1});
  const call=(name,args)=>{
    if(name==='gh' && args[0]==='pr')return JSON.stringify({state:'MERGED',baseRefName:'main',mergedAt:merge.merged_at,mergeCommit:{oid:merge.merge_sha},headRefOid:merge.head_sha,files:[]});
    if(name==='gh')return JSON.stringify([{databaseId:1,headSha:merge.head_sha,event:'pull_request',status:'completed',conclusion:'success'}]);
    if(args[0]==='fetch' || args.at(-1)==='origin/main')return '';
    return f.call(name,args);
  };
  const before=fs.readFileSync(f.file,'utf8');
  await assert.rejects(finishExistingRun({stateRoot:f.stateRoot,id:f.id,evidenceFile:evidence,call,cwd:f.cwd,now:new Date(+f.now+4000),
    fetchImpl:async url=>({ok:true,url,text:async()=>'<html>existing</html>\n'})}),/Actually served source/);
  assert.equal(fs.readFileSync(f.file,'utf8'),before);
});


test('Company applies the original R0 new-URL guard on every branch',async t=>{
  const f=fixture(t);f.input.scope={artifact:'/obsidian/new-url/',paths:['obsidian/new-url/index.html']};f.write(f.inputFile,f.input);
  const {contract}=await f.declare();await f.bind();const {row,merge}=f.deliver();
  await assert.rejects(()=>verifyDecisionDelivery(f.load(),contract,row,[],[row],merge,f.call,f.cwd),/new public URL is R1/);
});
