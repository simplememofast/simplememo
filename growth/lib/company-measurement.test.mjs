import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT,digest} from './company-metrics.mjs';
import {prepareMeasurement,loadMeasurement,verifyMeasurementInput,registerMeasurement,verifyMeasurementDelivery,measurementComparison,evaluateMeasurement,measurementStatus,EXPERIMENTS} from './company-measurement.mjs';
import {candidateDigest,decisionTrace,prepareCompanyDecision} from './company-decision.mjs';
import {opportunities} from './company-loop.mjs';
import {measuresPageCtr} from './ledger.mjs';
import {registerGrowthFollowup} from './company-growth-followup.mjs';

// Original synthetic probe builder; no model, query, production run or metric.
const good=JSON.parse(execFileSync('python3',['-B','-c',`import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('fixtures',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
print(json.dumps(m.CodexProbeTests().report()))`,path.join(ROOT,'scripts/codex-ai-visibility-probe.test.py')],{encoding:'utf8'}));
function fixture(t,{source='ai_citations',threshold=4}={}) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'company-measurement-'));fs.chmodSync(tmp,0o700);t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const root=path.join(tmp,'repo'),stateRoot=path.join(tmp,'state');fs.mkdirSync(root);fs.mkdirSync(stateRoot,{mode:0o700});
  const write=(file,obj)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(obj,null,2)+'\n',{mode:0o600});};
  const read=file=>JSON.parse(fs.readFileSync(file));
  const call=(name,args)=>execFileSync(name,args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const git=(...a)=>call('git',a).trim();git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  const probe=(at,mutate=()=>{})=>{
    const p=structuredClone(good);p.run_id=randomUUID();p.started_at=at.replace('Z','+00:00');p.observed_at=p.started_at;
    p.observations.forEach(q=>{q.thread_id=randomUUID();});mutate(p);
    write(path.join(root,'data/ai-visibility-probe.json'),p);write(path.join(root,'data/ai-visibility-history',p.run_id+'.json'),p);return p;
  };
  const beforeProbe=probe('2026-09-12T12:00:00Z');
  write(path.join(root,EXPERIMENTS),{version:1,experiments:[]});
  const page='/obsidian/fixture/',target='obsidian/fixture/index.html';fs.mkdirSync(path.join(root,'obsidian/fixture'),{recursive:true});fs.writeFileSync(path.join(root,target),'before\n');
  git('add','.');git('commit','-qm','fixture base');const sourceCommit=git('rev-parse','HEAD');
  const now=new Date('2026-09-14T01:00:00Z'),id=randomUUID();
  const input={id:'fixture-measurement',page,source,target_metric:source==='gsc'?'ctr':'ai_citations',
    started_at:'2026-09-15',post_start:source==='gsc'?'2026-09-16':'2026-10-08',post_end:'2026-10-14',evaluation_at:source==='gsc'?'2026-10-17':'2026-10-15',
    hypothesis:'The specific owned-page answer will improve its measured search or citation visibility.',
    decision_rule:'Use descriptive comparisons and original guardrails; low volume or confounding means inconclusive.',
    min_sample:{metric:source==='gsc'?'impressions':'unaided_valid_questions',threshold,rationale:'Retain the full original cohort without excluding difficult observations.'},
    control:{kind:'pre_post',note:'Same source and scope; no randomized control.',confounders:['Other website changes and provider/model changes.']},
    stop_conditions:['Do not overlap another active treatment on the same page.'],guardrails:['Existing exact-head validation and deployed target must remain healthy.']};
  if(source==='gsc')input.post_end='2026-10-13';
  const inputFile=path.join(stateRoot,'input.json');write(inputFile,input);
  const snapshot=(start,end,impressions=200)=>({label:end,meta:{period_start:start,period_end:end,source:'fixture',search_type:'WEB',time_zone:'America/Los_Angeles',complete_window:true},
    dates:Array.from({length:28},(_,i)=>({date:new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10),clicks:1,impressions:10})),
    pages:[{page,clicks:2,impressions,ctr:2/impressions,position:8}],queryPages:[]});
  const baseline=snapshot('2026-08-15','2026-09-11');
  const search=()=>({evidence:{actionable:true,source:'synthetic_fixture'},snapshot:baseline});
  const prepare=()=>prepareMeasurement({stateRoot,evidenceFile:inputFile,root,now,search});
  const receiptFile=path.join(stateRoot,'runs',id+'.json');
  const candidate={id:'content:fixture',kind:'existing_content_queue',permission:'AUTO',executable:true,priority:1,evidence:['synthetic']};
  const bind=()=>{
    const prepared=prepare(),decisionInput={schema_version:1,candidate_id:candidate.id,contract_id:'fixture-contract',run_id:'fixture-run',rationale:'The observed fixed cohort supports investigating this concrete page.',
      source_to_action:'The fixture evidence is preserved to test prospective binding only.',alternatives:[{id:'other',reason:'Another candidate has lower estimated business relevance in this fixture.'}],
      measurement:prepared.measurement,scope:{artifact:page,paths:[target]}};
    const r={schema_version:3,id,source_commit:sourceCommit,observation_fingerprint:'a'.repeat(64),candidates:[candidate,{id:'other'}],observed_at:now.toISOString(),status:'observed_decision_requires_execution',
      execution_boundary:{stopped:false},route:'owner-session',stages:{}};
    write(receiptFile,r);const df=path.join(stateRoot,'decision.json');write(df,decisionInput);
    prepareCompanyDecision({stateRoot,id,evidenceFile:df,now,currentCandidates:r.candidates});
    // Declaration transport/selection has independent real-git tests in
    // company-decision.test. This fixture tests the subsequent registry order.
    fs.writeFileSync(path.join(root,'fixture-declaration'),'seal\n');git('add','.');git('commit','-qm','fixture declaration');
    const saved=read(receiptFile);Object.assign(saved,{bound_decision_sha256:saved.decision.sha256,bound_declaration_sha:git('rev-parse','HEAD'),bound_autopilot_run_id:'fixture-run'});write(receiptFile,saved);
    return saved;
  };
  const register=async()=>{const r=bind();await registerMeasurement({stateRoot,id,root,now});git('add',EXPERIMENTS);git('commit','-qm','fixture registry');return r;};
  const deliver=async()=>{const r=await register();fs.writeFileSync(path.join(root,target),'after\n');git('add',target);git('commit','-qm','fixture treatment');
    const proof=verifyMeasurementDelivery(r,{stateRoot,root,head:git('rev-parse','HEAD'),mergedAt:'2026-09-15T12:00:00Z',call});
    Object.assign(r,{status:'verified_existing_autopilot',followup:proof,evidence_of_completion:{decision_trace:{state:'verified',decision_sha256:r.decision.sha256},canonical_run_id:'fixture-run',artifact:page}});write(receiptFile,r);return r;};
  return{root,stateRoot,now,id,input,inputFile,write,read,git,call,prepare,bind,register,deliver,receiptFile,probe,beforeProbe,snapshot,search,page,target};
}

test('source-derived AIO baseline stays private and cannot be prepared retrospectively, overwritten or mixed with an owned treatment',t=>{
  const f=fixture(t);const r=f.prepare(),p=loadMeasurement({stateRoot:f.stateRoot,...r.measurement});
  assert.equal(p.experiment.baseline.value,f.beforeProbe.unaided_own_site_citation_rate);assert.equal(p.experiment.measurement_contract.scope.series,f.beforeProbe.series);
  assert.equal(fs.statSync(path.join(f.stateRoot,p.source.file)).mode&0o077,0);
  assert.throws(f.prepare,/immutable/);assert.equal(f.read(path.join(f.root,EXPERIMENTS)).experiments.length,0);
  f.input.id='another-plan';f.input.started_at='2026-09-10';f.write(f.inputFile,f.input);assert.throws(f.prepare,/prospective launch/);
  f.input.started_at='2026-09-15';f.write(f.inputFile,f.input);
  f.write(path.join(f.root,EXPERIMENTS),{experiments:[{...p.experiment,id:'existing-owner'}]});assert.throws(f.prepare,/owned by an active/);
});
test('new Company content decisions require a plan for their exact target',t=>{
  const f=fixture(t),r={schema_version:3};
  assert.throws(()=>verifyMeasurementInput(r,{stateRoot:f.stateRoot,input:{scope:{artifact:f.page}},at:f.now.toISOString()}),/measurement plan required/);
  const m=f.prepare().measurement;
  assert.throws(()=>verifyMeasurementInput(r,{stateRoot:f.stateRoot,input:{measurement:m,scope:{artifact:'/other/'}},at:f.now.toISOString()}),/differs from action/);
});
test('registry must follow binding, precede the page in a separate commit and preserve actual launch day',async t=>{
  const f=fixture(t),r=await f.register();
  assert.throws(()=>verifyMeasurementDelivery(r,{stateRoot:f.stateRoot,root:f.root,head:f.git('rev-parse','HEAD'),mergedAt:'2026-09-16T12:00:00Z',call:f.call}),/actual launch day/);
  const l=f.read(path.join(f.root,EXPERIMENTS));l.experiments[0].baseline.value=.9;f.write(path.join(f.root,EXPERIMENTS),l);f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture invalid change');
  assert.throws(()=>verifyMeasurementDelivery(r,{stateRoot:f.stateRoot,root:f.root,head:f.git('rev-parse','HEAD'),mergedAt:'2026-09-15T12:00:00Z',call:f.call}),/contract changed/);
});
test('page edits before registry are rejected even if the final files appear correct',async t=>{
  const f=fixture(t),r=f.bind();fs.writeFileSync(path.join(f.root,f.target),'too early\n');
  await assert.rejects(()=>registerMeasurement({stateRoot:f.stateRoot,id:f.id,root:f.root,now:f.now}),/clean declaration/);
  fs.writeFileSync(path.join(f.root,f.target),'before\n');await registerMeasurement({stateRoot:f.stateRoot,id:f.id,root:f.root,now:f.now});
  fs.writeFileSync(path.join(f.root,f.target),'same commit is too late\n');f.git('add','.');f.git('commit','-qm','fixture forbidden simultaneous registration');
  assert.throws(()=>verifyMeasurementDelivery(r,{stateRoot:f.stateRoot,root:f.root,head:f.git('rev-parse','HEAD'),mergedAt:'2026-09-15T12:00:00Z',call:f.call}),/registry alone/);
});
test('AIO comparison uses original validated cohort and writes admitted private evidence to the existing ledger, then exposes an action',async t=>{
  const f=fixture(t);await f.deliver();
  assert.throws(()=>measurementComparison({stateRoot:f.stateRoot,id:f.input.id,root:f.root,now:new Date('2026-10-14T23:00Z')}),/not due/);
  assert.throws(()=>measurementComparison({stateRoot:f.stateRoot,id:f.input.id,root:f.root,now:new Date('2026-10-15T12:00Z')}),/post cohort/);
  f.probe('2026-10-14T12:00:00Z');const now=new Date('2026-10-15T12:00Z');
  const c=measurementComparison({stateRoot:f.stateRoot,id:f.input.id,root:f.root,now});assert.equal(c.status,'ready_for_decision');assert.equal(c.evidence.source,'ai_citations');assert.equal(c.sample.before,4);assert.equal(c.sample.after,4);
  const review=path.join(f.stateRoot,'review.json');f.write(review,{decision:'iterate',rationale:'The small fixed cohort warrants a bounded content iteration, without a causal uplift claim.',guardrail_findings:['The fixture retains exact delivery and original validation with no observed regression.'],confounders:'Other sources and model changes prevent attributing this descriptive comparison to one page.'});
  const out=await evaluateMeasurement({stateRoot:f.stateRoot,id:f.input.id,evidenceFile:review,root:f.root,now});assert.equal(out.status,'evaluated');assert.equal(out.evidence.kind,'private_reference');
  const raw=fs.readFileSync(path.join(f.root,EXPERIMENTS),'utf8');assert(!raw.includes('transcript_sha256'));assert(!raw.includes(f.stateRoot));
  await assert.rejects(()=>evaluateMeasurement({stateRoot:f.stateRoot,id:f.input.id,evidenceFile:review,root:f.root,now}),/preserve existing/);
  const status=measurementStatus({stateRoot:f.stateRoot,root:f.root,now});assert.equal(status.experiments[0].next_action,'review_original_decision_for_action');
  const candidates=opportunities({growth:{measurements:status},automation:{failures:[]}});assert.equal(candidates[0].experiment_id,f.input.id);assert.equal(candidates[0].target_page,f.page);
  for(const variant of ['valid','wrong_target','early_decision']) {
    const child=f.read(f.receiptFile);child.id=randomUUID();child.decision.company_run_id=child.id;
    Object.assign(child.decision.input,{parent_experiment:f.input.id,parent_result:status.experiments[0].parent_result});
    child.candidates.find(c=>c.id===child.decision.input.candidate_id).experiment_id=f.input.id;
    child.candidates.find(c=>c.id===child.decision.input.candidate_id).parent_result=status.experiments[0].parent_result;
    child.decision.candidate_sha256=candidateDigest(child.candidates.find(c=>c.id===child.decision.input.candidate_id));
    child.decision.recorded_at=variant==='early_decision'?'2026-10-14T12:00:00Z':'2026-10-16T12:00:00Z';
    if(variant==='wrong_target'){child.decision.input.scope={artifact:'/unrelated/',paths:['unrelated/index.html']};child.evidence_of_completion.artifact='/unrelated/';}
    child.decision.sha256=digest(Object.fromEntries(Object.entries(child.decision).filter(([k])=>k!=='sha256')));child.bound_decision_sha256=child.decision.sha256;
    child.evidence_of_completion.decision_trace.decision_sha256=child.decision.sha256;child.evidence_of_completion.merge={merged_at:'2026-10-17T12:00:00Z'};
    f.write(path.join(f.stateRoot,'runs',child.id+'.json'),child);
    assert.equal(decisionTrace(child).state,'verified','fixture must pass the separate retained delivery trace gate');
    assert.equal(measurementStatus({stateRoot:f.stateRoot,root:f.root,now:new Date('2026-10-18T12:00:00Z')}).experiments[0].next_action,variant==='valid'?null:'review_original_decision_for_action',variant);
    fs.rmSync(path.join(f.stateRoot,'runs',child.id+'.json'));
  }
  const l=f.read(path.join(f.root,EXPERIMENTS));l.experiments[0].decision='revert';f.write(path.join(f.root,EXPERIMENTS),l);
  assert.equal(measurementStatus({stateRoot:f.stateRoot,root:f.root,now}).experiments[0].status,'source_or_delivery_unavailable');
  l.experiments[0].decision='iterate';f.write(path.join(f.root,EXPERIMENTS),l);
  fs.rmSync(path.join(f.stateRoot,'experiment-evidence',out.evidence.artifact));
  assert.equal(measurementStatus({stateRoot:f.stateRoot,root:f.root,now}).experiments[0].status,'source_or_delivery_unavailable');
});
test('AIO mismatched series, repeated sessions, multiple runs and protocol drift cannot become a favorable post sample',async t=>{
  const f=fixture(t);await f.deliver();const now=new Date('2026-10-15T12:00Z'),compare=()=>measurementComparison({stateRoot:f.stateRoot,id:f.input.id,root:f.root,now});
  const p=f.probe('2026-10-14T12:00:00Z',p=>{p.series='claude-sonnet-web-v1';});assert.throws(compare,/post cohort/);
  fs.rmSync(path.join(f.root,'data/ai-visibility-history',p.run_id+'.json'));
  const q=f.probe('2026-10-14T12:00:00Z',p=>p.observations.forEach((q,i)=>{q.thread_id=f.beforeProbe.observations[i].thread_id;}));assert.throws(compare,/sessions cannot be replayed/);
  fs.rmSync(path.join(f.root,'data/ai-visibility-history',q.run_id+'.json'));
  const bad=f.probe('2026-10-14T12:00:00Z',p=>{p.protocol.repository_context=true;});assert.throws(compare,/validation failed/);
  fs.rmSync(path.join(f.root,'data/ai-visibility-history',bad.run_id+'.json'));f.probe('2026-10-12T12:00:00Z');f.probe('2026-10-14T12:00:00Z');assert.throws(compare,/exactly one/);
});
test('GSC adapter preserves exact 28-day cohorts, original evidence admission and minimum sample',async t=>{
  const f=fixture(t,{source:'gsc',threshold:100});await f.deliver();const now=new Date('2026-10-17T12:00Z');
  const options={stateRoot:f.stateRoot,id:f.input.id,root:f.root,now,search:()=>({evidence:{actionable:true},snapshot:f.snapshot('2026-09-16','2026-10-13')})};
  const c=measurementComparison(options);assert.equal(c.evidence.kind,'gsc_comparison');assert.equal(c.evidence.baseline.days,28);assert.equal(c.sufficient,true);
  assert.equal(measurementComparison({...options,search:()=>{throw new Error('must reuse captured cohort');}}).evidence.post.value,c.evidence.post.value);
  const clearCapture=()=>{for(const name of fs.readdirSync(f.stateRoot).filter(n=>n.startsWith('measurement-post-')))fs.rmSync(path.join(f.stateRoot,name));};
  clearCapture();
  assert.throws(()=>measurementComparison({...options,search:()=>({evidence:{actionable:true},snapshot:f.snapshot('2026-09-17','2026-10-14')})}),/registered window/);
  const short=f.snapshot('2026-09-16','2026-10-13');short.dates.pop();assert.throws(()=>measurementComparison({...options,search:()=>({evidence:{actionable:true},snapshot:short})}),/coverage/);
  const thin=()=>({evidence:{actionable:true},snapshot:f.snapshot('2026-09-16','2026-10-13',20)});
  assert.throws(()=>measurementComparison({...options,decision:'keep',search:thin}),/only inconclusive/);assert.equal(measurementComparison({...options,search:thin}).sufficient,false);
  const review=path.join(f.stateRoot,'review.json');f.write(review,{decision:'inconclusive',rationale:'The exact source cohort is measured but the registered sample floor is not reached.',guardrail_findings:['The fixture retains the original delivery with no indicated validation regression.'],confounders:'The available sample and other page changes prevent inferring a treatment effect.'});
  await evaluateMeasurement({stateRoot:f.stateRoot,id:f.input.id,evidenceFile:review,root:f.root,now});
  const experiments=f.read(path.join(f.root,EXPERIMENTS)).experiments;assert.equal(measuresPageCtr(experiments[0]),true);
  const followup=registerGrowthFollowup({stateRoot:f.stateRoot,experimentId:f.input.id,evaluationDate:'2026-11-17',postStart:'2026-10-18',postEnd:'2026-11-14',rationale:'Recheck the same registered source after another complete mature observation period.',now,experiments});
  assert(followup.id,'existing GSC follow-up must accept the canonical baseline and evidence hash');
});
