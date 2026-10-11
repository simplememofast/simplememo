import {supportFixture} from './measurement-support.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ROOT,digest} from './company-metrics.mjs';
import {prepareMeasurement,loadMeasurement,verifyMeasurementInput,registerMeasurement,verifyMeasurementDelivery,verifyMeasurementMergeScope,measurementComparison,evaluateMeasurement,measurementStatus,measurementHandoffEvidence,EXPERIMENTS} from './company-measurement.mjs';
import {verifyRetainedCompanyDelivery} from './company-proof.mjs';
import {candidateDigest,decisionTrace,decisionCommitment,prepareCompanyDecision} from './company-decision.mjs';
import {opportunities,experimentView} from './company-loop.mjs';
import {measuresPageCtr} from './ledger.mjs';
import {registerGrowthFollowup} from './company-growth-followup.mjs';

// Original synthetic probe builder; no model, query, production run or metric.
const good=JSON.parse(execFileSync('python3',['-B','-c',`import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('fixtures',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
print(json.dumps(m.CodexProbeTests().report()))`,path.join(ROOT,'scripts/codex-ai-visibility-probe.test.py')],{encoding:'utf8'}));
test('a newly linked revert judgment is not reported as a completed code rollback',()=>{
  const e={id:'fixture',page:'/fixture/',status:'evaluated',decision:'revert',company_measurement:{schema_version:1}};
  assert.equal(experimentView(e,'2026-10-20').status,'INCONCLUSIVE');
  assert.equal(experimentView({...e,company_measurement:undefined},'2026-10-20').status,'ROLLED_BACK','retain the explicitly compatible legacy view');
});
function fixture(t,{source='ai_citations',threshold=4,route='owner-session'}={}) {
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
  write(path.join(root,'data/autopilot-runs.json'),{runs:[]});
  const page='/obsidian/fixture/',target='obsidian/fixture/index.html';fs.mkdirSync(path.join(root,'obsidian/fixture'),{recursive:true});fs.writeFileSync(path.join(root,target),'before\n');
  git('add','.');git('commit','-qm','fixture base');const sourceCommit=git('rev-parse','HEAD');
  const now=new Date('2026-09-14T01:00:00Z'),id=randomUUID();
  const input={id:'fixture-measurement',page,change_paths:[target],source,target_metric:source==='gsc'?'ctr':'ai_citations',
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
      measurement:prepared.measurement,scope:{artifact:page,paths:[...input.change_paths]}};
    const r={schema_version:3,id,source_commit:sourceCommit,observation_fingerprint:'a'.repeat(64),candidates:[candidate,{id:'other'}],observed_at:now.toISOString(),started_at:now.toISOString(),status:'observed_decision_requires_execution',
      execution_boundary:{stopped:false},route,stages:{}};
    write(receiptFile,r);const df=path.join(stateRoot,'decision.json');write(df,decisionInput);
    prepareCompanyDecision({stateRoot,id,evidenceFile:df,now,currentCandidates:r.candidates,root});
    write(path.join(root,'data/decision-intents/fixture-contract.json'),{id:'fixture-contract',run_id:'fixture-run',candidates:[{id:'fixture-contract',company_decision:decisionCommitment(read(receiptFile))}]});
    // Declaration transport/selection has independent real-git tests in
    // company-decision.test. This fixture tests the subsequent registry order.
    git('add','.');git('commit','-qm','fixture declaration');
    const saved=read(receiptFile);Object.assign(saved,{bound_decision_sha256:saved.decision.sha256,bound_declaration_sha:git('rev-parse','HEAD'),bound_autopilot_run_id:'fixture-run'});write(receiptFile,saved);
    return saved;
  };
  const register=async()=>{const r=bind();await registerMeasurement({stateRoot,id,root,now});git('add',EXPERIMENTS);git('commit','-qm','fixture registry');return r;};
  const deliver=async()=>{const r=await register();fs.writeFileSync(path.join(root,target),'after\n');
    write(path.join(root,'data/autopilot-runs.json'),{runs:[{run_id:'fixture-run',outcome:'shipped',attempted:true,route,pr:1,artifact:page}]});
    git('add',target,'data/autopilot-runs.json');git('commit','-qm','fixture treatment');
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
test('sealed sitemap inheritance survives delivery and retained verification without changing measurement or manual origin',async t=>{
  const f=fixture(t),sitemap='sitemap-ja.xml';
  f.input.change_paths.push(sitemap);f.input.supporting_changes=[{path:sitemap,kind:'sitemap_lastmod'}];f.write(f.inputFile,f.input);
  const original='<urlset>\n<url><loc>https://simplememofast.com'+f.page+'</loc><lastmod>2026-09-13</lastmod></url>'+'\n'.repeat(12)+
    '<url><loc>https://simplememofast.com/other/</loc><lastmod>2026-09-12</lastmod></url>\n</urlset>\n';
  const put=text=>fs.writeFileSync(path.join(f.root,sitemap),text);
  put(original);f.git('add',sitemap);f.git('commit','-qm','fixture original sitemap');
  const r=await f.register(),planFile=path.join(f.stateRoot,'measurement-plan-'+f.input.id+'.json'),planBytes=fs.readFileSync(planFile);
  put(original.replace('2026-09-13','2026-09-15'));fs.writeFileSync(path.join(f.root,f.target),'after\n');
  f.write(path.join(f.root,'data/autopilot-runs.json'),{runs:[{run_id:'fixture-run',outcome:'shipped',attempted:true,route:r.route,pr:1,artifact:f.page}]});
  f.git('add','.');f.git('commit','-qm','fixture treatment');const head=f.git('rev-parse','HEAD');
  f.git('checkout','-qb','parallel',r.bound_declaration_sha);put(original.replace('2026-09-12','2026-09-14'));
  f.git('add',sitemap);f.git('commit','-qm','fixture concurrent date');
  f.git('merge','--squash',head);f.git('commit','-qm','fixture published squash');const mergeSha=f.git('rev-parse','HEAD'),mergedAt='2026-09-15T12:00:00Z';
  f.git('update-ref','refs/remotes/origin/main',mergeSha);
  const options={stateRoot:f.stateRoot,root:f.root,head,mergeSha,mergedAt,call:f.call};
  const proof=verifyMeasurementMergeScope(r,options),followup=verifyMeasurementDelivery(r,options);
  assert.equal(proof.version,'company-merge-scope-v2');assert.equal(followup.state,'registered_waiting_for_mature_evidence');
  assert.equal(followup.evaluation_at,f.input.evaluation_at);assert.equal(r.route,'owner-session');assert.deepEqual(fs.readFileSync(planFile),planBytes);
  const merge={pr:1,head_sha:head,merge_sha:mergeSha,merged_at:mergedAt,validation_run:2};
  Object.assign(r,{status:'verified_existing_autopilot',followup,evidence_of_completion:{merge,decision_trace:{state:'verified',decision_sha256:r.decision.sha256,merge_scope_verification:proof}}});
  const call=(name,args)=>{
    if(name!=='gh')return f.call(name,args);
    if(args[0]==='pr')return JSON.stringify({state:'MERGED',baseRefName:'main',headRefOid:head,mergeCommit:{oid:mergeSha},mergedAt,files:[]});
    assert.deepEqual(args,['api','repos/simplememofast/simplememo/actions/runs/2']);
    return JSON.stringify({id:2,head_sha:head,event:'pull_request',status:'completed',conclusion:'success',name:'SEO Validation',path:'.github/workflows/seo-check.yml'});
  };
  const retained=()=>verifyRetainedCompanyDelivery(r,{stateRoot:f.stateRoot,root:f.root,call});
  assert.equal(retained().merge_sha,mergeSha);
  delete r.evidence_of_completion.decision_trace.merge_scope_verification;
  assert.throws(retained,/Retained merge scope proof changed/,'old receipts cannot silently acquire the new proof');
  r.evidence_of_completion.decision_trace.merge_scope_verification={...proof,published_tree:'a'.repeat(40)};
  assert.throws(retained,/Retained merge scope proof changed/);
  r.evidence_of_completion.decision_trace.merge_scope_verification=proof;
  const plan=f.read(planFile);plan.experiment.evaluation_at='2026-10-16';f.write(planFile,plan);
  assert.throws(retained,/hash|changed|differs|mismatch/);fs.writeFileSync(planFile,planBytes);
  const loaded=loadMeasurement({stateRoot:f.stateRoot,...r.decision.input.measurement}),sourceFile=path.join(f.stateRoot,loaded.source.file),sourceBytes=fs.readFileSync(sourceFile);
  fs.appendFileSync(sourceFile,' ');assert.throws(retained,/hash|changed|differs|mismatch/);fs.writeFileSync(sourceFile,sourceBytes);
  assert.equal(retained().merge_sha,mergeSha);assert.equal(r.route,'owner-session');
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

// Synthetic native lifecycle states are deliberately injected. They never
// create a real scheduler execution, Goal event or production metric credit.
async function handoffFixture(t) {
  const f=fixture(t,{route:'actions'}),r=await f.deliver(),deliveryThread=randomUUID(),reviewThread=randomUUID();
  const proof=thread=>({state:'native_execution_record',automation_id:'obsidian',thread_id:thread,
    original_turn_id:thread,gate_receipt_sha256:digest(thread+'gate')});
  const readThread=thread=>({thread_id:thread,automation_id:'obsidian',original_turn_id:thread,
    original_turn:{turn_id:thread,state:'completed',started_at:thread===deliveryThread?'2026-09-14T00:00:00Z':'2026-10-15T00:00:00Z',
      finished_at:thread===deliveryThread?'2026-09-15T13:00:00Z':'2026-10-15T13:00:00Z'},
    gate_receipt:{admitted:true,thread_id:thread,turn_id:thread,sha256:proof(thread).gate_receipt_sha256,
      observed_at:thread===deliveryThread?'2026-09-14T00:00:00Z':'2026-10-15T00:00:00Z'},
    transcript_sha256:digest(thread+'transcript'),observed_at:'2026-10-15T13:00:00Z'});
  Object.assign(r,{route:'actions',origin:'codex-automation',origin_proof:proof(deliveryThread),finished_at:'2026-09-15T12:30:00Z'});
  r.evidence_of_completion.merge={merge_sha:f.git('rev-parse','HEAD'),head_sha:f.git('rev-parse','HEAD'),pr:1,validation_run:2,merged_at:'2026-09-15T12:00:00Z'};
  f.write(f.receiptFile,r);
  const merge=structuredClone(r.evidence_of_completion.merge);
  const remoteCall=(name,args)=>{
    if(name!=='gh')return f.call(name,args);
    if(args[0]==='pr'&&args[1]==='view') {
      assert.equal(args[2],'1');return JSON.stringify({number:1,state:'MERGED',baseRefName:'main',headRefOid:merge.head_sha,
        mergedAt:merge.merged_at,mergeCommit:{oid:merge.merge_sha},url:'https://example.invalid/fixture-pr',files:[]});
    }
    assert.deepEqual(args,['api','repos/simplememofast/simplememo/actions/runs/2']);return JSON.stringify({id:2,head_sha:merge.head_sha,event:'pull_request',status:'completed',conclusion:'success',name:'SEO Validation',path:'.github/workflows/seo-check.yml'});
  };
  const now=new Date('2026-10-15T13:00:00Z');
  const options={stateRoot:f.stateRoot,root:f.root,now,readThread,call:remoteCall,
    readCanonical:()=>{f.git('update-ref','refs/remotes/origin/main',f.git('rev-parse','HEAD'));return{sha:f.git('rev-parse','HEAD'),ledger:JSON.parse(f.git('show','HEAD:'+EXPERIMENTS))};}};
  return {...f,r,deliveryThread,reviewThread,proof,readThread,options};
}
test('Growth handoff uses prospective committed delivery and source-bound native review, never an uncommitted evaluation',async t=>{
  const f=await handoffFixture(t),read=overrides=>measurementHandoffEvidence({...f.options,...overrides});
  let out=read();assert.equal(out.events.length,1);assert.deepEqual(out.failures,[]);
  const delivered=out.events[0];assert.equal(delivered.milestone,'verified_growth_delivery');assert.equal(delivered.evidence.page,f.page);
  assert.equal(delivered.native_proof.native_transcript_sha256,f.readThread(f.deliveryThread).transcript_sha256);
  f.probe('2026-10-14T12:00:00Z');const review=path.join(f.stateRoot,'native-review.json');
  f.write(review,{decision:'inconclusive',rationale:'The synthetic fixed cohort has no attributable improvement.',
    guardrail_findings:['The synthetic delivery preserves the registered guardrail.'],confounders:'Other changes and provider effects prevent a causal conclusion.'});
  const evaluated=await evaluateMeasurement({stateRoot:f.stateRoot,id:f.input.id,evidenceFile:review,root:f.root,now:new Date('2026-10-15T12:00:00Z'),origin:()=>f.proof(f.reviewThread)});
  assert.deepEqual(read().events.map(e=>e.milestone),['verified_growth_delivery'],'working-copy result is not committed evidence');
  f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture admitted review');
  out=read();assert.deepEqual(out.failures,[]);assert.equal(out.events.length,2);
  const measured=out.events[1];assert.equal(measured.milestone,'reviewed_growth_measurement');assert.equal(measured.evidence.decision,'inconclusive');
  assert.equal(measured.evidence.evidence_sha256,evaluated.evidence.sha256);assert.match(measured.evidence.interpretation,/not an automatic WIN/);
  const received=read({excludeIdentities:[delivered.identity,measured.identity],readThread:()=>{throw new Error('received identities must not reread old native threads');},
    call:()=>{throw new Error('received identities must not query old remote proof');}});
  assert.deepEqual(received.events,[]);assert.deepEqual(received.failures,[]);assert.equal(received.skipped.length,2);
  const artifact=path.join(f.stateRoot,'experiment-evidence',evaluated.evidence.artifact),bundle=f.read(artifact);bundle.evidence.agent_review.decision='keep';f.write(artifact,bundle);
  out=read();assert.equal(out.events.length,1);assert.equal(out.failures[0].milestone,'reviewed_growth_measurement','private hash mismatch must remain visible');
});
test('Growth delivery rejects stale or mismatched native lifecycle and merge proof without relabeling manual work',async t=>{
  const f=await handoffFixture(t),read=overrides=>measurementHandoffEvidence({...f.options,...overrides});
  for(const mutate of [s=>({...s,automation_id:'other'}),s=>({...s,transcript_sha256:null}),s=>({...s,original_turn_id:randomUUID()}),
    s=>({...s,gate_receipt:{...s.gate_receipt,sha256:'a'.repeat(64)}}),s=>({...s,original_turn:{...s.original_turn,finished_at:'2026-09-14T02:00:00Z'}})]) {
    const out=read({readThread:thread=>mutate(f.readThread(thread))});assert.equal(out.events.length,0);assert.equal(out.failures[0].reason,'native_origin_unavailable_or_mismatched');
  }
  assert.equal(read({now:new Date('2026-09-14T02:00:00Z')}).events.length,0,'future delivery cannot be admitted');
  const original=structuredClone(f.r.evidence_of_completion.merge);
  for(const change of [{merge_sha:f.r.source_commit},{head_sha:f.r.source_commit},{pr:3},{validation_run:3}]) {
    f.r.evidence_of_completion.merge={...original,...change};f.write(f.receiptFile,f.r);
    const rejected=read();assert.equal(rejected.events.length,0,JSON.stringify(change));
    assert.equal(rejected.failures[0].reason,'original_delivery_reverification_failed');
  }
  f.r.evidence_of_completion.merge=original;
  // Even a shaped remote response cannot make an unrelated in-history commit
  // introduce this canonical run and its prospective experiment registration.
  f.r.evidence_of_completion.merge={...original,merge_sha:f.r.source_commit,head_sha:f.r.source_commit};f.write(f.receiptFile,f.r);
  const unbound=read({call:(name,args)=>{
    const raw=f.options.call(name,args);if(name!=='gh')return raw;
    const v=JSON.parse(raw);if(args[0]==='pr'){v.headRefOid=f.r.source_commit;v.mergeCommit.oid=f.r.source_commit;}else v.head_sha=f.r.source_commit;
    return JSON.stringify(v);
  }});assert.equal(unbound.events.length,0);assert.equal(unbound.failures[0].reason,'original_delivery_reverification_failed');
  f.r.evidence_of_completion.merge=original;
  f.write(f.receiptFile,f.r);
  const wrongWorkflow=read({call:(name,args)=>{
    const raw=f.options.call(name,args);if(name!=='gh'||args[0]!=='api')return raw;
    return JSON.stringify({...JSON.parse(raw),path:'.github/workflows/another.yml'});
  }});assert.equal(wrongWorkflow.events.length,0,'same workflow name and head cannot replace the original seo-check.yml');
  assert.equal(wrongWorkflow.failures[0].reason,'original_delivery_reverification_failed');
  f.r.route='owner-session';f.write(f.receiptFile,f.r);
  let out=read();assert.deepEqual(out.events,[]);assert.deepEqual(out.failures,[]);assert.equal(out.skipped[0].reason,'not_a_claimed_native_event');
  const originalMerge=f.r.evidence_of_completion.merge.merge_sha;
  f.r.route='actions';f.r.evidence_of_completion.merge.merge_sha='a'.repeat(40);f.write(f.receiptFile,f.r);
  assert.equal(read().events.length,0,'a receipt cannot claim a merge outside canonical main history');
  f.r.evidence_of_completion.merge.merge_sha=originalMerge;
  f.r.route='actions';f.r.evidence_of_completion.merge.validation_run=null;f.write(f.receiptFile,f.r);
  out=read();assert.equal(out.events.length,0);assert.equal(out.failures[0].reason,'prospective_delivery_evidence_unavailable_or_mismatched');
});
test('a committed manual evaluation remains available for analysis but does not become a native Goal milestone',async t=>{
  const f=await handoffFixture(t);f.probe('2026-10-14T12:00:00Z');const file=path.join(f.stateRoot,'manual-review.json');
  f.write(file,{decision:'inconclusive',rationale:'A manual fixture review preserves the original limited cohort.',
    guardrail_findings:['The fixture has no observed guardrail regression.'],confounders:'A small nonrandomized cohort cannot establish a causal effect.'});
  await evaluateMeasurement({stateRoot:f.stateRoot,id:f.input.id,evidenceFile:file,root:f.root,now:new Date('2026-10-15T12:00:00Z'),origin:()=>({state:'not_a_recorded_automation_run'})});
  f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture manual review');
  const out=measurementHandoffEvidence(f.options);assert.deepEqual(out.failures,[]);
  assert.deepEqual(out.events.map(e=>e.milestone),['verified_growth_delivery']);
  assert.equal(out.skipped[0].milestone,'reviewed_growth_measurement');assert.equal(out.skipped[0].reason,'not_a_claimed_native_event');
});

test('prospective observation coexistence admits a page but retains backlink ownership and later conflicts',async t=>{
  const {contractHash}=await import('./experiment-coexistence.mjs');
  const f=fixture(t),plan=f.prepare(),base=loadMeasurement({stateRoot:f.stateRoot,...plan.measurement}).experiment;
  fs.rmSync(path.join(f.stateRoot,'measurement-plan-'+f.input.id+'.json'));
  const global={...base,id:'global-owner',page:'(サイト全体 + サイト外4面)'};delete global.change_paths;
  global.coexistence={schema_version:1,experiment_id:global.id,from:'exclusive_intervention',to:'nonexclusive_observation',decided_at:'2026-09-13T00:00:00Z',effective_at:'2026-09-13T00:00:00Z',authorized_by:'user',authorization:{request:'反映させてデプロイ',thread_id:'01a0a1b9-4982-70f3-b2d6-eed77be68e26'},original_contract_sha256:contractHash(global),interpretation:'descriptive_only_no_isolated_causal_claim',reason:'Explicit synthetic transition preserves the original experiment contract.'};
  const owner={...base,id:'hub-owner',page:'/hub/',change_paths:['hub/index.html']};
  f.write(path.join(f.root,EXPERIMENTS),{experiments:[global,owner]});
  f.input.change_paths=[f.target,'hub/index.html'];f.write(f.inputFile,f.input);assert.throws(f.prepare,/owned by an active/);
  f.input.change_paths=[f.target];f.write(f.inputFile,f.input);
  f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture global observation');
  const r=f.bind();
  const l=f.read(path.join(f.root,EXPERIMENTS));l.experiments.push({...base,id:'later-owner'});f.write(path.join(f.root,EXPERIMENTS),l);
  await assert.rejects(()=>registerMeasurement({stateRoot:f.stateRoot,id:f.id,root:f.root,now:f.now}),/owned by an active/);
  f.git('checkout','--',EXPERIMENTS);await registerMeasurement({stateRoot:f.stateRoot,id:f.id,root:f.root,now:f.now});f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture registration');
  fs.writeFileSync(path.join(f.root,f.target),'after');fs.writeFileSync(path.join(f.root,'undeclared.html'),'unreported collateral change');f.git('add','.');f.git('commit','-qm','fixture undeclared change');
  assert.throws(()=>verifyMeasurementDelivery(r,{stateRoot:f.stateRoot,root:f.root,head:f.git('rev-parse','HEAD'),mergedAt:'2026-09-15T12:00:00Z',call:f.call}),/undeclared measurement change/);
});


test('prospective page support reaches registration, real-Git CI and delivery without releasing another page',async t=>{
  const {verifyDecision}=await import('../../scripts/decision-ci.mjs');
  const f=fixture(t,{source:'gsc'}),q='data/distribution-queue.json';
  f.input.change_paths.push(q);f.input.supporting_changes=[{path:q,kind:'distribution_seed',id:'20260915-fixture'}];f.write(f.inputFile,f.input);
  f.write(path.join(f.root,q),{items:[{id:'20260901-existing',url:'https://simplememofast.com/protected'}]});
  f.write(path.join(f.root,'data/value-metrics.json'),{metrics:[]});
  const first=f.prepare(),base=loadMeasurement({stateRoot:f.stateRoot,...first.measurement}).experiment;
  fs.rmSync(path.join(f.stateRoot,'measurement-plan-'+f.input.id+'.json'));
  const owner={...base,id:'protected-owner',page:'/protected',change_paths:['protected/index.html']};delete owner.supporting_changes;
  f.write(path.join(f.root,EXPERIMENTS),{experiments:[owner]});f.git('add','.');f.git('commit','-qm','fixture existing shared support and protected owner');
  const baseRef=f.git('rev-parse','HEAD'),r=await f.register(),item={...supportFixture().item,id:'20260915-fixture',date_jst:'2026-09-15',url:'https://simplememofast.com'+f.page};
  const original=f.read(path.join(f.root,q));f.write(path.join(f.root,q),{...original,items:[item,...original.items]});fs.writeFileSync(path.join(f.root,f.target),'after\n');
  f.git('add','.');f.git('commit','-qm','fixture bounded article support');
  const options=()=>({branch:'Codex/fixture',head:f.git('rev-parse','HEAD'),baseRef,cwd:f.root});
  assert.equal((await verifyDecision(options())).state,'not_required','measurement gates still run before optional value-contract routing');
  const delivery=()=>verifyMeasurementDelivery(r,{stateRoot:f.stateRoot,root:f.root,head:f.git('rev-parse','HEAD'),mergedAt:'2026-09-15T12:00:00Z',call:f.call});
  assert.equal(delivery().state,'registered_waiting_for_mature_evidence');
  const goodHead=f.git('rev-parse','HEAD');
  // Rewrite only this disposable fixture's prospective declaration, preserving
  // the valid registration/treatment commits, to exercise the actual CI entry.
  for(const absentId of [undefined,'']) {
    f.git('checkout','--detach',goodHead+'^^');
    const declarationPath='data/decision-intents/fixture-contract.json',declaration=f.read(path.join(f.root,declarationPath));
    declaration.id=absentId;declaration.candidates[0].id=absentId;
    f.write(path.join(f.root,declarationPath),declaration);f.git('add',declarationPath);f.git('commit','--amend','--no-edit');
    f.git('cherry-pick',goodHead+'^',goodHead);
    await assert.rejects(()=>verifyDecision(options()),/requires a valid selected candidate ID/);
  }
  f.git('checkout','--detach',goodHead);
  const missing=f.read(path.join(f.root,EXPERIMENTS));delete missing.experiments.find(e=>e.id===f.input.id).company_measurement;
  f.write(path.join(f.root,EXPERIMENTS),missing);f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture unregistered support owner');
  await assert.rejects(()=>verifyDecision(options()),/requires prospective Company measurement registration/);
  f.git('checkout',goodHead,'--',EXPERIMENTS);f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture restore measurement binding');
  const mutated=f.read(path.join(f.root,q));mutated.items[1].url='https://simplememofast.com/changed';f.write(path.join(f.root,q),mutated);f.git('add',q);f.git('commit','-qm','fixture unrelated queue corruption');
  await assert.rejects(()=>verifyDecision(options()),/only one new seed/);assert.throws(delivery,/only one new seed/);
  f.git('checkout',goodHead,'--',q);f.git('add',q);f.git('commit','-qm','fixture restore exact queue');
  const l=f.read(path.join(f.root,EXPERIMENTS)),old=l.experiments.find(e=>e.id==='protected-owner');old.change_paths.push(q);old.supporting_changes=[{path:q,kind:'distribution_seed',id:'20260915-protected'}];f.write(path.join(f.root,EXPERIMENTS),l);f.git('add',EXPERIMENTS);f.git('commit','-qm','fixture reinterpret previous owner');
  await assert.rejects(()=>verifyDecision(options()),/cannot reinterpret existing support ownership/);
});
