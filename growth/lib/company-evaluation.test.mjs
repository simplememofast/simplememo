import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {ROOT} from './company-metrics.mjs';
import {prepareExperimentEvaluation,executeExperimentEvaluation,finishExperimentEvaluation,evaluationDecisionTrace} from './company-evaluation.mjs';
import {protectedPaths,verifyDecision} from '../../scripts/decision-ci.mjs';

// All inputs, Git history, child CLI calls and public responses below are local
// synthetic fixtures. No current Company state, external API or real run is used.
const LEDGER='growth/experiments/experiments.json';
const NOW=new Date(Date.now()-5000);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=x=>structuredClone(x);

function fixture(t,{decision='measurement_failed',mode='review'}={}) {
  const outer=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'company-evaluation-')));
  fs.chmodSync(outer,0o700);t.after(()=>fs.rmSync(outer,{recursive:true,force:true}));
  const root=path.join(outer,'repo'),stateRoot=path.join(outer,'state');
  fs.mkdirSync(root,{mode:0o700});fs.mkdirSync(stateRoot,{mode:0o700});
  fs.mkdirSync(path.join(stateRoot,'runs'),{mode:0o700});
  const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});};
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
  // Copy the real CLI and its relative import closure. This is the production
  // evidence gate, not a substitute implementation of an evaluated outcome.
  const copied=new Set();
  const copyModule=relative=>{
    if(copied.has(relative))return;copied.add(relative);
    const original=path.join(ROOT,relative),bytes=fs.readFileSync(original);
    fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});
    fs.writeFileSync(path.join(root,relative),bytes);
    for(const m of bytes.toString().matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.(?:mjs|js))['"]/g)) {
      copyModule(path.normalize(path.join(path.dirname(relative),m[1])));
    }
  };
  for(const file of ['growth/scripts/experiments.mjs','growth/lib/company-evaluation.mjs',
    'growth/lib/company-decision.mjs','growth/lib/company-proof.mjs','growth/lib/company-measurement.mjs',
    'scripts/company-os.mjs','scripts/decision-ci.mjs','scripts/decision-monitor.mjs'])copyModule(file);
  for(const file of ['scripts/codex-routine-observer.py','scripts/codex-autopilot-preflight.mjs',
    'scripts/autopilot-gate.mjs','scripts/codex-recovery-permit.py','docs/codex-autopilot-execution.md',
    'docs/obsidian/AUTOPILOT_RUNBOOK.md','docs/autonomy/OPERATING_RUNBOOK.md','CLAUDE.md']) {
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(ROOT,file),path.join(root,file));
  }
  for(const file of ['data/emergency-stop.json','data/authority-matrix.json','data/company-monthly-budget.json',
    'data/eligibility-policy.json','data/autonomy-score.json','data/model-routing.json','data/autopilot-cost.json',
    'data/autopilot-status.json','data/value-metrics.json','data/autopilot-runs.json','data/value-contracts.json']) {
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(ROOT,file),path.join(root,file));
  }
  write(path.join(root,'data/emergency-stop.json'),{stopped:false,agents:{'owner-session':{stopped:false},actions:{stopped:false}}});
  // Only this synthetic repository gets a current-month, zero-additional-spend
  // policy. The real budget and the production expiry gate remain unchanged.
  const budgetFile=path.join(root,'data/company-monthly-budget.json'),budget=read(budgetFile);
  const jst=new Date(+NOW+9*3600000),month=jst.toISOString().slice(0,7);
  const nextMonth=new Date(Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth()+1,1)).toISOString().slice(0,7);
  write(budgetFile,{...budget,decision_id:'fixture-budget-'+month,month,
    effective_from:month+'-01T00:00:00+09:00',effective_until:nextMonth+'-01T00:00:00+09:00'});
  const target={id:'fixture-next-step',page:'/fixture/',type:'next_step_card',status:'running',
    started_at:'2026-08-11',evaluation_at:'2026-09-25',target_metric:'next_step_click',
    baseline:{clicks:3,window:'2026-07-13..2026-08-09',source:'Synthetic legacy unrelated count without a typed target baseline'},
    decision:null,evaluated_at:null,notes:['Original note must be retained.'],
    guard:{min_sample:17,loss_limit:.2},owner:'fixture-owner',
    control:{kind:'pre_post',note:'Synthetic pre/post control',confounders:['Seasonal differences remain unknown.']},
    min_sample:{metric:'next_step_click',threshold:17,rationale:'Synthetic minimum for this original fixture'},
    stop_conditions:['Stop if the original retained loss guard is triggered.'],
    private_unknown:null};
  const other={...clone(target),id:'fixture-unrelated',page:'/unrelated/',started_at:'2026-08-01',
    evaluation_at:'2026-12-31',notes:['Unrelated conditions and notes remain exact.']};
  const contract={source:'ga4',definition:'Synthetic next_step_click event count v1',unit:'count',
    time_zone:'Asia/Tokyo',scope:{pages:['/fixture/']},lag_days:5};
  if(decision!=='measurement_failed' && decision!=='abandoned' && mode!=='snapshot') {
    target.baseline={metric:target.target_metric,value:0,window:'2026-07-13..2026-08-09'};
    target.measurement_contract=contract;
  }
  const snapshotDir=path.join(root,'growth/data/gsc/fixture-complete');
  if(mode==='snapshot') {
    target.target_metric='ctr';target.type='faq_add';
    target.measurement_scope={kind:'query_page',page:target.page,query:'fixture exact query'};
    target.baseline={clicks:1,impressions:100,position:9,window:'2026-07-13..2026-08-09'};
    write(path.join(snapshotDir,'meta.json'),{period_start:'2026-08-12',period_end:'2026-09-08',search_type:'WEB',time_zone:'America/Los_Angeles',complete_window:true});
    write(path.join(snapshotDir,'dates.json'),Array.from({length:28},(_,i)=>({date:new Date(Date.parse('2026-08-12')+i*86400000).toISOString().slice(0,10),clicks:2,impressions:100})));
    write(path.join(snapshotDir,'query-pages.json'),[{page:target.page,query:target.measurement_scope.query,clicks:2,impressions:100,position:8}]);
  }
  const original={schema_version:1,version:7,notes:['Synthetic ledger metadata remains exact.'],experiments:[target,other]};
  write(path.join(root,LEDGER),original);
  const reviewFile=path.join(stateRoot,'review.json'),artifactFile=path.join(stateRoot,'original-row.json');
  write(artifactFile,target);
  let review={schema_version:1,experiment_id:target.id,target_metric:target.target_metric,decision,
    kind:'diagnostic',reviewed_by:'Fixture',rationale:'The original row lacks a typed metric baseline and measurement contract.',
    findings:['Typed baseline.metric/value and measurement_contract are absent in this synthetic source.'],
    artifacts:[{path:path.basename(artifactFile),sha256:sha(fs.readFileSync(artifactFile))}]};
  if(decision!=='measurement_failed' && decision!=='abandoned' && mode!=='snapshot') {
    const baselineFile=path.join(stateRoot,'baseline.json'),postFile=path.join(stateRoot,'post.json');
    write(baselineFile,{rows:[{value:0}]});write(postFile,{rows:[{value:3}]});
    const period=(start,end,value,file)=>({start,end,value,extraction:'Synthetic local aggregate fixture',complete:true,
      definition:contract.definition,unit:contract.unit,time_zone:contract.time_zone,scope:contract.scope,
      artifact:{path:path.basename(file),sha256:sha(fs.readFileSync(file))}});
    review={schema_version:1,experiment_id:target.id,target_metric:target.target_metric,decision,kind:'comparison',
      source:contract.source,definition:contract.definition,unit:contract.unit,time_zone:contract.time_zone,scope:contract.scope,
      reviewed_by:'Fixture',rationale:'Synthetic source-specific comparison; no causal or significance claim.',
      baseline:period('2026-07-13','2026-08-09',0,baselineFile),post:period('2026-08-12','2026-09-08',3,postFile),
      limitations:['Synthetic extraction only; no causal effect or full human observation is proven.']};
  }
  write(reviewFile,review);
  let gitTime=NOW.toISOString();
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],
    env:{...process.env,GIT_AUTHOR_DATE:gitTime,GIT_COMMITTER_DATE:gitTime}}).trim();
  git('init','-q','-b','claude/company-evaluation-fixture');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  git('add','.');git('commit','-qm','Synthetic original source');
  const source=git('rev-parse','HEAD'),id=randomUUID(),runId='fixture-evaluation-run',contractId='fixture-evaluation-contract';
  const candidate={id:'evaluate:'+target.id,kind:'evaluate_existing_experiment',permission:'AUTO',executable:true,
    priority:60,evidence:[target.id,target.evaluation_at],owner:'existing growth experiment ledger'};
  const alternative={id:'diagnose:fixture',kind:'diagnose_automation',permission:'AUTO',executable:true,priority:30,evidence:['fixture']};
  const candidates=[candidate,alternative];
  const runFile=path.join(stateRoot,'runs',id+'.json');
  let origin={proof:{state:'not_a_recorded_automation_run',thread_id:randomUUID()},gate_receipt:null,
    host_turn:{turn_id:randomUUID(),started_at:new Date(+NOW-1000).toISOString(),state:'in_progress',finished_at:null}},shared=false;
  const originReader=()=>clone(origin);
  const record={schema_version:3,id,status:'observed_decision_requires_execution',route:'owner-session',origin:'goal',origin_proof:origin.proof,
    started_at:NOW.toISOString(),observed_at:NOW.toISOString(),source_commit:source,
    observation_fingerprint:'b'.repeat(64),selected:candidate,candidates,prior_autopilot_run_ids:[],
    stages:{detect:'completed',decide:'pending',execute:'pending',verify:'pending'},
    execution_boundary:{stopped:false,owner_session_stopped:false}};
  write(runFile,record);
  const input={schema_version:1,candidate_id:candidate.id,contract_id:contractId,run_id:runId,
    rationale:'A due original experiment needs a bounded explicit evaluation of its own metric.',
    source_to_action:'The original target and private artifacts justify only this selected evaluation.',
    alternatives:[{id:alternative.id,reason:'This fixture diagnostic has no higher-priority operating repair.'}],
    scope:{paths:[LEDGER],artifact:null},evaluation:{experiment_id:target.id,decision,mode,
      ...(mode==='snapshot'?{snapshot:'fixture-complete',note:'Synthetic complete exact-query comparison; causal effect and significance remain unknown.'}:
        mode==='administrative'?{note:'Administrative closure only; no measured efficacy is claimed.'}:
        {review_file:reviewFile,review_sha256:sha(fs.readFileSync(reviewFile))})}};
  const inputFile=path.join(stateRoot,'prepare.json');write(inputFile,input);
  let ghOverrides={},childCalls=0,fetched=0,mergedAt,lastChild;
  const call=(name,args)=>{
    if(name==='gh') {
      if(args[0]==='pr')return JSON.stringify(ghOverrides.pr ?? {number:1,state:'MERGED',baseRefName:'main',
        headRefOid:git('rev-parse','HEAD'),mergedAt,
        mergeCommit:{oid:git('rev-parse','HEAD')},url:'https://github.com/simplememofast/simplememo/pull/1',files:[{path:LEDGER}]});
      if(args[0]==='api' && args.some(x=>x.includes('/check-runs')))return JSON.stringify(ghOverrides.pages ?? {
        total_count:1,check_runs:[{id:2,name:'Cloudflare Pages',head_sha:git('rev-parse','HEAD'),status:'completed',conclusion:'success',details_url:'https://example.invalid/fixture-deployment'}]});
      return JSON.stringify(ghOverrides.runs ?? [{databaseId:1,headSha:git('rev-parse','HEAD'),event:'pull_request',status:'completed',conclusion:'success'}]);
    }
    if(args[0]==='ls-remote') {
      const branch=args.at(-1);if(branch.startsWith('claude/obsidian-auto-'))return shared?git('rev-parse','HEAD')+'\trefs/heads/'+branch+'\n':'';
      return git('rev-parse','HEAD')+'\trefs/heads/'+branch+'\n';
    }
    if(args[0]==='fetch' || args.at(-1)==='origin/main')return '';
    return execFileSync(name,args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],
      env:{...process.env,GIT_AUTHOR_DATE:gitTime,GIT_COMMITTER_DATE:gitTime}});
  };
  const prepare=over=>prepareExperimentEvaluation({stateRoot,id,evidenceFile:inputFile,root,now:NOW,currentCandidates:candidates,call,originReader,...over});
  const declare=async()=>{
    const prepared=await prepare();write(path.join(root,prepared.intent_path),prepared.intent);
    gitTime=new Date(+NOW+1000).toISOString();git('add','.');git('commit','-qm','Synthetic prospective declaration');
    return prepared;
  };
  const actualChild=({command,args,cwd})=>{
    const bound=read(runFile);assert.equal(bound.status,'executing_existing_experiment_evaluation');
    assert.ok(bound.evaluation_bound.launch_sha256,'prospective launch is retained before the actual child');
    childCalls++;const child=spawnSync(command,args,{cwd,encoding:'utf8',
      env:{...process.env,GROWTH_GSC_DIR:path.join(root,'growth/data/gsc')}});
    lastChild=child;
    return{exit_code:child.status,signal:child.signal,stdout:child.stdout,stderr:child.stderr,timed_out:false};
  };
  const execute=async over=>{try{return await executeExperimentEvaluation({stateRoot,id,root,now:new Date(+NOW+2000),call,child:actualChild,originReader,...over});}
    catch(error){if(lastChild && lastChild.status!==0)throw new Error(error.message+'; synthetic child exit '+lastChild.status+': '+lastChild.stderr.trim().split('\n')[0]);throw error;}};
  const commit=()=>{mergedAt=new Date().toISOString();gitTime=mergedAt;
    git('add','.');git('commit','-qm','Synthetic evaluated output');return git('rev-parse','HEAD');};
  const finishFile=path.join(stateRoot,'finish.json');
  const finish=async(over={})=>{
    const execution=read(runFile).evaluation_execution;
    write(finishFile,{schema_version:1,kind:'experiment_evaluation',company_run_id:id,pr:1,execution_sha256:execution.sha256,
      learning:'Synthetic original outcome retained; no efficacy, complete intervention coverage or H0 is inferred.'});
    return finishExperimentEvaluation({stateRoot,id,evidenceFile:finishFile,root,now:new Date(),call,
      fetchImpl:async url=>{fetched++;
        if(url.endsWith('/scripts/company-os.mjs'))return{ok:false,status:404,url};
        const bytes=fs.readFileSync(path.join(root,'data/autopilot-status.json'));
        return{ok:true,status:200,url,text:async()=>bytes.toString(),arrayBuffer:async()=>bytes};},...over});
  };
  return{outer,root,stateRoot,write,read,git,call,source,id,runId,runFile,input,inputFile,review,reviewFile,
    artifactFile,snapshotDir,target,other,original,candidates,prepare,declare,execute,commit,finish,finishFile,
    actualChild,get childCalls(){return childCalls;},get fetched(){return fetched;},
    setGh:over=>{ghOverrides=over;},setGitTime:x=>{gitTime=x;},
    get origin(){return clone(origin);},setOrigin:x=>{origin=clone(x);},setShared:x=>{shared=x;}};
}

const reject=action=>assert.rejects(async()=>action());
function stateBytes(root) {
  const result={};
  const visit=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,e.name);if(e.isDirectory())visit(file);
    else if(e.isFile())result[path.relative(root,file)]=sha(fs.readFileSync(file));
  }};visit(root);return result;
}

test('diagnostic evaluates the actual original CLI once, preserves all non-outcome data and never proves efficacy or H0',async t=>{
  const f=fixture(t),prepared=await f.declare();
  assert.equal(prepared.status,'recorded');
  assert.equal(JSON.stringify(prepared.intent).includes(f.review.rationale),false,'private rationale cannot enter the public declaration');
  const executed=await f.execute(),record=f.read(f.runFile),actual=f.read(path.join(f.root,LEDGER));
  assert.equal(executed.status,'executed_pending_evaluation_delivery');assert.equal(f.childCalls,1);
  assert.equal(executed.Company_verified_finish,false);assert.equal(executed.parent_H0_proven,false);
  assert.deepEqual(actual.experiments.map(e=>e.id),f.original.experiments.map(e=>e.id));
  assert.deepEqual(actual.experiments[1],f.other);
  for(const key of Object.keys(f.target).filter(k=>!['status','decision','evaluated_at','evidence'].includes(k)))assert.deepEqual(actual.experiments[0][key],f.target[key]);
  assert.equal(actual.experiments[0].decision,'measurement_failed');
  assert.equal(actual.experiments[0].evidence.kind,'private_reference');
  assert.equal(f.read(record.evaluation_execution.private_bundle.path).evidence.kind,'measurement_diagnostic');
  const raw=f.read(path.join(f.stateRoot,'experiment-evaluations',f.id,'raw-child-ledger.json'));
  assert.notDeepEqual(raw.experiments.map(e=>e.id),actual.experiments.map(e=>e.id),'raw CLI sorting is retained, not silently attributed to the target');
  assert.ok(Date.parse(record.evaluation_bound.bound_at)<=Date.parse(record.evaluation_execution.started_at));
  assert.equal(evaluationDecisionTrace(record).state,'pending');
  f.commit();const completed=await f.finish();
  assert.equal(completed.status,'verified_existing_experiment_evaluation');
  assert.equal(evaluationDecisionTrace(completed).state,'verified');
  assert.equal(completed.human_interventions,null);assert.equal(completed.parent_human_touches,null);
  assert.equal(completed.parent_zero_touch_completion,null);
  assert.equal(completed.evidence_of_completion.decision,'measurement_failed');
  assert.equal(Object.hasOwn(completed,'company_rate'),false);assert.equal(Object.hasOwn(completed,'bound_autopilot_run_id'),false);
  assert.equal(fs.statSync(f.runFile).mode&0o077,0);
});

for(const decision of ['keep','revert','iterate','inconclusive'])test('normal '+decision+' uses the original GA4 comparison gate and exact baseline, not diagnostic substitution',async t=>{
  const f=fixture(t,{decision});await f.declare();await f.execute();
  const r=f.read(f.runFile),bundle=f.read(r.evaluation_execution.private_bundle.path);
  assert.equal(bundle.evidence.kind,'manual_comparison');assert.equal(bundle.evidence.source,'ga4');
  assert.equal(bundle.evidence.baseline.value,0);assert.equal(bundle.evidence.post.value,3);
  assert.deepEqual(bundle.evidence.scope,f.target.measurement_contract.scope);
  f.commit();const completed=await f.finish();assert.equal(completed.evidence_of_completion.decision,decision);
  assert.equal(completed.parent_zero_touch_completion,null);
  assert.match(completed.followup.interpretation,/fresh prospective/);
});

test('administrative abandonment keeps original notes publicly and actual CLI-added rationale privately',async t=>{
  const f=fixture(t,{decision:'abandoned',mode:'administrative'});await f.declare();await f.execute();
  const r=f.read(f.runFile),actual=f.read(path.join(f.root,LEDGER)),raw=f.read(path.join(f.stateRoot,'experiment-evaluations',f.id,'raw-child-ledger.json'));
  assert.deepEqual(actual.experiments[0].notes,f.target.notes);
  assert.equal(raw.experiments.find(e=>e.id===f.target.id).notes.length,f.target.notes.length+1);
  assert.equal(f.read(r.evaluation_execution.private_bundle.path).evidence.kind,'administrative');
  f.commit();const done=await f.finish();assert.equal(done.evidence_of_completion.decision,'abandoned');
  assert.equal(done.parent_zero_touch_completion,null);
});

test('snapshot mode executes the original complete GSC exact-query gate and binds all three dimension files',async t=>{
  const f=fixture(t,{decision:'keep',mode:'snapshot'});await f.declare();await f.execute();
  const r=f.read(f.runFile),bundle=f.read(r.evaluation_execution.private_bundle.path);
  assert.equal(bundle.evidence.kind,'gsc_comparison');
  assert.deepEqual(bundle.evidence.scope,{kind:'query_page',page:'/fixture/',query:'fixture exact query'});
  assert.equal(bundle.evidence.post.days,28);assert.equal(bundle.evidence.post.value,.02);
  assert.equal(bundle.evidence.artifacts.length,3);assert.equal(f.childCalls,1);
  f.commit();assert.equal((await f.finish()).status,'verified_existing_experiment_evaluation');
});

for(const [name,change] of [
  ['wrong exact query',f=>f.write(path.join(f.snapshotDir,'query-pages.json'),[{page:'/fixture/',query:'different query',clicks:2,impressions:100,position:8}])],
  ['missing date coverage',f=>{const p=path.join(f.snapshotDir,'dates.json');f.write(p,f.read(p).slice(1));}],
  ['unequal post window',f=>{const p=path.join(f.snapshotDir,'meta.json');f.write(p,{...f.read(p),period_end:'2026-09-07'});}],
])test('snapshot mode refuses '+name+' without a child',async t=>{
  const f=fixture(t,{decision:'keep',mode:'snapshot'});change(f);f.git('add','.');f.git('commit','-qm','Synthetic invalid source dimension');
  const r=f.read(f.runFile);r.source_commit=f.git('rev-parse','HEAD');f.write(f.runFile,r);
  await reject(()=>f.prepare());assert.equal(f.childCalls,0);
});

test('GSC dimension bytes changed after the prospective seal cannot be evaluated',async t=>{
  const f=fixture(t,{decision:'keep',mode:'snapshot'});await f.declare();
  const p=path.join(f.snapshotDir,'query-pages.json'),rows=f.read(p);rows[0].clicks=3;f.write(p,rows);
  await reject(()=>f.execute());assert.equal(f.childCalls,0);
});

test('a future or invalid actual operation time cannot create a prospective proof',async t=>{
  const f=fixture(t);await reject(()=>f.prepare({now:new Date(Date.now()+60000)}));
  await reject(()=>f.prepare({now:new Date(NaN)}));assert.equal(f.childCalls,0);
});

for(const [name,change] of [
  ['missing candidate',f=>{f.input.candidate_id='evaluate:missing';f.write(f.inputFile,f.input);}],
  ['wrong target',f=>{f.input.evaluation.experiment_id=f.other.id;f.write(f.inputFile,f.input);}],
  ['public scope bypass',f=>{f.input.scope.paths.push('index.html');f.write(f.inputFile,f.input);}],
  ['no alternative',f=>{f.input.alternatives=[];f.write(f.inputFile,f.input);}],
  ['unknown mode',f=>{f.input.evaluation.mode='force';f.write(f.inputFile,f.input);}],
  ['force field bypass',f=>{f.input.evaluation.force=true;f.write(f.inputFile,f.input);}],
  ['wrong private review digest',f=>{f.input.evaluation.review_sha256='a'.repeat(64);f.write(f.inputFile,f.input);}],
  ['private artifact changed',f=>f.write(f.artifactFile,{id:'unrelated source'})],
  ['world-readable private review',f=>fs.chmodSync(f.reviewFile,0o644)],
  ['symlink private artifact',f=>{fs.unlinkSync(f.artifactFile);fs.symlinkSync(f.reviewFile,f.artifactFile);}],
  ['source mismatch',f=>{const r=f.read(f.runFile);r.source_commit='c'.repeat(40);f.write(f.runFile,r);}],
  ['future observation',f=>{const r=f.read(f.runFile);r.observed_at=new Date(+NOW+100000).toISOString();f.write(f.runFile,r);}],
  ['old observation',f=>{const r=f.read(f.runFile);r.started_at=r.observed_at=new Date(+NOW-7*3600000).toISOString();f.write(f.runFile,r);}],
  ['retrospective old Company run',f=>{const r=f.read(f.runFile);r.evaluation_bound={bound_at:r.started_at};f.write(f.runFile,r);}],
  ['unknown stop',f=>{const r=f.read(f.runFile);r.execution_boundary.stopped=null;f.write(f.runFile,r);}],
  ['candidate changed since observation',f=>{f.candidates[0]={...f.candidates[0],priority:61};}],
])test('prepare fails closed for '+name+' without a child or target mutation',async t=>{
  const f=fixture(t),before=fs.readFileSync(path.join(f.root,LEDGER));change(f);
  await reject(()=>f.prepare());assert.equal(f.childCalls,0);assert.deepEqual(fs.readFileSync(path.join(f.root,LEDGER)),before);
  assert.equal(f.read(f.runFile).stages.execute,'pending');
});

for(const [name,change] of [
  ['primary metric source substitution',f=>{f.review.source='gsc';}],
  ['wrong registered definition',f=>{f.review.definition+=' changed';}],
  ['different timezone',f=>{f.review.time_zone='UTC';}],
  ['wrong page scope',f=>{f.review.scope={pages:['/other/']};}],
  ['wrong baseline value',f=>{f.review.baseline.value=1;}],
  ['incomplete post period',f=>{f.review.post.complete=false;}],
  ['unequal periods',f=>{f.review.post.end='2026-09-07';}],
  ['comparison artifact metadata only',f=>{const p=path.join(f.stateRoot,f.review.post.artifact.path);f.write(p,{status:'complete'});f.review.post.artifact.sha256=sha(fs.readFileSync(p));}],
])test('the normal comparison gate rejects '+name+' before execution',async t=>{
  const f=fixture(t,{decision:'keep'});change(f);f.write(f.reviewFile,f.review);
  f.input.evaluation.review_sha256=sha(fs.readFileSync(f.reviewFile));f.write(f.inputFile,f.input);
  await reject(()=>f.prepare());assert.equal(f.childCalls,0);
});

for(const [name,change] of [
  ['no declaration',()=>{}],
  ['changed sealed code',f=>fs.appendFileSync(path.join(f.root,'growth/lib/ledger.mjs'),'\n// changed source\n')],
  ['changed private input',f=>f.write(f.reviewFile,{...f.review,rationale:'Changed private interpretation after prebinding.'})],
  ['changed original condition',f=>{const x=f.read(path.join(f.root,LEDGER));x.experiments[0].guard.min_sample=1;f.write(path.join(f.root,LEDGER),x);}],
  ['late declared commit',f=>{f.setGitTime('2099-01-01T00:00:00Z');f.git('commit','--amend','--no-edit');}],
])test('execution refuses '+name+' instead of binding after implementation',async t=>{
  const f=fixture(t);if(name==='no declaration')await f.prepare();else await f.declare();change(f);
  const before=fs.readFileSync(path.join(f.root,LEDGER));await reject(()=>f.execute());
  assert.equal(f.childCalls,0);assert.deepEqual(fs.readFileSync(path.join(f.root,LEDGER)),before);
});

for(const [name,child] of [
  ['unknown exit',()=>({exit_code:null,signal:null,stdout:'success',stderr:'',timed_out:false})],
  ['string zero',()=>({exit_code:'0',signal:null,stdout:'',stderr:'',timed_out:false})],
  ['boolean zero',()=>({exit_code:false,signal:null,stdout:'',stderr:'',timed_out:false})],
  ['signalled exit',()=>({exit_code:0,signal:'SIGTERM',stdout:'',stderr:'',timed_out:false})],
  ['timed-out exit',()=>({exit_code:0,signal:null,timed_out:true,stdout:'',stderr:''})],
  ['zero without actual ledger output',()=>({exit_code:0,signal:null,stdout:'evaluated',stderr:'',timed_out:false})],
])test('actual child '+name+' cannot acquire execution or be silently replayed',async t=>{
  const f=fixture(t);await f.declare();let calls=0;
  await reject(()=>f.execute({child:args=>{calls++;return child(args);}}));
  const failed=f.read(f.runFile);assert.equal(failed.status,'failed_existing_experiment_evaluation');
  assert.equal(Object.hasOwn(failed,'evaluation_execution'),false);assert.equal(evaluationDecisionTrace(failed).state,'pending');
  const before=stateBytes(f.stateRoot);await reject(()=>f.execute({child:()=>{calls++;return{};}}));
  assert.equal(calls,1);assert.deepEqual(stateBytes(f.stateRoot),before);
});

test('child output modifying an unrelated row or original condition is preserved as failed, not repackaged as success',async t=>{
  for(const target of ['unrelated','condition']) {
    const f=fixture(t);await f.declare();await reject(()=>f.execute({child:args=>{
      const result=f.actualChild(args),raw=f.read(path.join(f.root,LEDGER));
      if(target==='unrelated')raw.experiments.find(e=>e.id===f.other.id).notes.push('unrelated mutation');
      else raw.experiments.find(e=>e.id===f.target.id).evaluation_at='2026-09-01';
      f.write(path.join(f.root,LEDGER),raw);return result;
    }}));assert.equal(f.read(f.runFile).status,'failed_existing_experiment_evaluation');
  }
});

test('already-evaluated historical experiments and another prospective owner cannot be redeclared',async t=>{
  const f=fixture(t);await f.declare();await f.execute();f.commit();await f.finish();
  const before=stateBytes(f.stateRoot);await reject(()=>f.prepare());await reject(()=>f.execute());
  assert.deepEqual(stateBytes(f.stateRoot),before);assert.equal(f.childCalls,1);
  const g=fixture(t);const second=clone(g.read(g.runFile));second.id=randomUUID();await g.prepare();
  g.write(path.join(g.stateRoot,'runs',second.id+'.json'),second);
  await reject(()=>g.prepare({id:second.id}));assert.equal(g.childCalls,0);
});

test('finish rejects typed evidence forgery, missing actual execution and legacy old-run completion',async t=>{
  const f=fixture(t);await f.declare();const before=stateBytes(f.stateRoot);
  f.write(f.finishFile,{schema_version:1,kind:'experiment_evaluation',company_run_id:f.id,pr:1,execution_sha256:'a'.repeat(64),
    learning:'Synthetic incomplete execution cannot be retroactively converted into a completed business run.'});
  await reject(()=>finishExperimentEvaluation({stateRoot:f.stateRoot,id:f.id,evidenceFile:f.finishFile,root:f.root,call:f.call,now:new Date()}));
  assert.equal(f.read(f.runFile).status,'observed_decision_requires_execution');
  assert.deepEqual(stateBytes(f.stateRoot),{...before,'finish.json':sha(fs.readFileSync(f.finishFile))});
  await f.execute();f.commit();const r=f.read(f.runFile);r.evaluation_execution.child.exit_code='0';f.write(f.runFile,r);
  await reject(()=>f.finish());assert.equal(f.fetched,0);
});

for(const [name,over] of [
  ['unrelated final head',f=>({pr:{number:1,state:'MERGED',baseRefName:'main',headRefOid:'a'.repeat(40),mergedAt:new Date().toISOString(),mergeCommit:{oid:f.git('rev-parse','HEAD')}}})],
  ['manual CI substituted for ordinary PR CI',f=>({runs:[{databaseId:1,headSha:f.git('rev-parse','HEAD'),event:'workflow_dispatch',status:'completed',conclusion:'success'}]})],
  ['failed CI',f=>({runs:[{databaseId:1,headSha:f.git('rev-parse','HEAD'),event:'pull_request',status:'completed',conclusion:'failure'}]})],
  ['unmerged PR',()=>({pr:{number:1,state:'OPEN',baseRefName:'main'}})],
])test('delivery refuses '+name+' without finalizing a real evaluation',async t=>{
  const f=fixture(t);await f.declare();await f.execute();f.commit();f.setGh(over(f));
  await reject(()=>f.finish());assert.equal(f.read(f.runFile).status,'executed_pending_evaluation_delivery');assert.equal(f.fetched,0);
});

test('concurrent unrelated ledger edits or different served bytes cannot complete the evaluation',async t=>{
  const f=fixture(t);await f.declare();await f.execute();f.commit();
  await reject(()=>f.finish({fetchImpl:async url=>({ok:true,status:200,url,text:async()=>'{}\n',arrayBuffer:async()=>Buffer.from('{}\n')})}));
  assert.equal(f.read(f.runFile).status,'executed_pending_evaluation_delivery');
  const x=f.read(path.join(f.root,LEDGER));x.experiments[1].notes.push('later concurrent edit');f.write(path.join(f.root,LEDGER),x);
  f.commit();await reject(()=>f.finish());
});

test('a forged retained raw child receipt or private result bundle cannot finish an otherwise valid delivery',async t=>{
  for(const target of ['raw','bundle']) {
    const f=fixture(t);await f.declare();await f.execute();f.commit();
    const r=f.read(f.runFile),file=target==='raw'?path.join(f.stateRoot,'experiment-evaluations',f.id,'raw-child-ledger.json'):r.evaluation_execution.private_bundle.path;
    const changed=f.read(file);changed.forged_summary='Claimed pass without matching retained original bytes';f.write(file,changed);
    await reject(()=>f.finish());assert.equal(f.read(f.runFile).status,'executed_pending_evaluation_delivery');assert.equal(f.fetched,0);
  }
});

test('identical completed delivery replay leaves all private runs and events byte-identical',async t=>{
  const f=fixture(t);await f.declare();await f.execute();f.commit();const completed=await f.finish();
  const before=stateBytes(f.stateRoot),fetched=f.fetched;
  assert.deepEqual(await f.finish(),completed);assert.deepEqual(stateBytes(f.stateRoot),before);
  assert.equal(f.fetched,fetched);assert.equal(f.childCalls,1);
  const changed=clone(completed);changed.human_interventions=[];
  assert.equal(evaluationDecisionTrace(changed).state,'invalid_trace');
});

test('an autonomous implementation cannot edit the new verifier to bypass its own evaluation proof',async t=>{
  const f=fixture(t);assert.ok(protectedPaths.includes('growth/lib/company-evaluation.mjs'));
  f.write(path.join(f.root,'data/value-metrics.json'),{metrics:[]});f.git('add','.');f.git('commit','-qm','Synthetic approved-metric input');
  const base=f.git('rev-parse','HEAD');fs.appendFileSync(path.join(f.root,'growth/lib/company-evaluation.mjs'),'\n// forged verifier change\n');
  f.git('add','.');f.git('commit','-qm','Synthetic forbidden gate edit');
  await assert.rejects(()=>verifyDecision({branch:'claude/obsidian-auto-fixture',head:f.git('rev-parse','HEAD'),baseRef:base,cwd:f.root}),/cannot change its gate or policy/);
});

for(const [name,change] of [
  ['unobserved host origin',f=>f.setOrigin({...f.origin,proof:null,gate_receipt:null})],
  ['different original host thread',f=>f.setOrigin({...f.origin,proof:{...f.origin.proof,thread_id:randomUUID()},gate_receipt:null})],
  ['scheduled label on an owner route',f=>{const r=f.read(f.runFile);r.origin='codex-automation';f.write(f.runFile,r);}],
  ['owner route with an admitted gate',f=>f.setOrigin({...f.origin,gate_receipt:{admitted:true}})],
  ['already published shared daily claim',f=>f.setShared(true)],
])test('origin and shared-claim gate rejects '+name+' before a new intent or child',async t=>{
  const f=fixture(t);change(f);await reject(()=>f.prepare());assert.equal(f.childCalls,0);
  assert.equal(Object.hasOwn(f.read(f.runFile),'decision'),false);
});

test('a new shared claim or changed native proof between preparation and execution blocks the child',async t=>{
  for(const changed of ['claim','proof']) {
    const f=fixture(t);await f.declare();
    if(changed==='claim')f.setShared(true);else f.setOrigin({...f.origin,proof:{...f.origin.proof,thread_id:randomUUID()},gate_receipt:null});
    await reject(()=>f.execute());assert.equal(f.childCalls,0);
    assert.equal(Object.hasOwn(f.read(f.runFile),'evaluation_bound'),false);
  }
});

test('the original run times, origin, boundary and full candidate context are immutable after prebinding',async t=>{
  for(const field of ['started_at','origin','execution_boundary','candidates']) {
    const f=fixture(t);await f.declare();const r=f.read(f.runFile);
    if(field==='started_at')r.started_at=new Date(+NOW-1000).toISOString();
    if(field==='origin')r.origin='manual';
    if(field==='execution_boundary')r.execution_boundary.unrelated_new_claim=true;
    if(field==='candidates')r.candidates[1].priority++;
    f.write(f.runFile,r);await reject(()=>f.execute());assert.equal(f.childCalls,0);
  }
});

function scheduledOrigin(f) {
  const record=f.read(f.runFile),threadId=randomUUID(),turnId=randomUUID();
  const gate={version:1,thread_id:threadId,turn_id:turnId,observed_at:new Date(+NOW-1000).toISOString(),
    admitted:true,code:'admitted',input_sha256:'a'.repeat(64),
    script_sha256:sha(fs.readFileSync(path.join(f.root,'scripts/codex-autopilot-preflight.mjs')))};
  gate.sha256=sha(Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(gate).sort(([a],[b])=>a.localeCompare(b))))));
  const proof={state:'native_execution_record',thread_id:threadId,automation_id:'obsidian',original_turn_id:turnId,
    observed_at:new Date().toISOString(),gate_receipt_sha256:gate.sha256,planned_slot:NOW.toISOString()};
  record.route='actions';record.origin='codex-automation';record.origin_proof=proof;
  record.execution_boundary={stopped:false,actions_stopped:false};f.write(f.runFile,record);
  f.setOrigin({proof,gate_receipt:gate,
    host_turn:{turn_id:turnId,started_at:new Date(+NOW-1000).toISOString(),state:'in_progress',finished_at:null}});f.setShared(true);
  const day=new Date(+NOW+9*3600000).toISOString().slice(0,10).replaceAll('-','');
  f.git('checkout','-qb','claude/obsidian-auto-'+day);
  return{proof,gate};
}

test('scheduled execution needs the original admitted native gate and the exact shared daily branch',async t=>{
  const f=fixture(t);scheduledOrigin(f);await f.declare();await f.execute();
  const r=f.read(f.runFile);assert.equal(f.childCalls,1);
  assert.equal(r.decision.seal.execution_origin.claim_state,'exact_owned_head');
  assert.equal(r.decision.seal.execution_origin.origin,'codex-automation');
  assert.equal(r.decision.seal.policy.eligibility.reversibility_class,'R0');
  f.commit();const done=await f.finish();assert.equal(done.status,'verified_existing_experiment_evaluation');
  assert.equal(done.parent_zero_touch_completion,null,'synthetic native identity is not full human observation');
});

for(const [name,change] of [
  ['missing native gate',f=>f.setOrigin({...f.origin,gate_receipt:null})],
  ['rejected native gate',f=>f.setOrigin({...f.origin,gate_receipt:{...f.origin.gate_receipt,admitted:false}})],
  ['wrong preflight checksum',f=>f.setOrigin({...f.origin,gate_receipt:{...f.origin.gate_receipt,script_sha256:'b'.repeat(64)}})],
  ['missing shared native branch',f=>f.setShared(false)],
  ['future native observation',f=>{const x=f.origin;x.proof.observed_at=new Date(Date.now()+60000).toISOString();f.setOrigin(x);}],
])test('scheduled origin rejects '+name+' without dispatching any evaluator',async t=>{
  const f=fixture(t);scheduledOrigin(f);change(f);await reject(()=>f.prepare());assert.equal(f.childCalls,0);
});

for(const [name,change] of [
  ['missing live host turn',f=>f.setOrigin({...f.origin,host_turn:null})],
  ['finished host turn',f=>f.setOrigin({...f.origin,host_turn:{...f.origin.host_turn,state:'completed',finished_at:new Date().toISOString()}})],
  ['retroactive Company start before this live host turn',f=>f.setOrigin({...f.origin,host_turn:{...f.origin.host_turn,started_at:new Date(+NOW+1).toISOString()}})],
  ['invalid host calendar',f=>f.setOrigin({...f.origin,host_turn:{...f.origin.host_turn,started_at:'2026-02-31T00:00:00Z'}})],
])test('the v3 host turn gate rejects '+name+' before preparing an action',async t=>{
  const f=fixture(t);change(f);await reject(()=>f.prepare());assert.equal(f.childCalls,0);
});

test('the live host turn cannot change between intent preparation and execution',async t=>{
  const f=fixture(t);await f.declare();f.setOrigin({...f.origin,host_turn:{...f.origin.host_turn,turn_id:randomUUID()}});
  await reject(()=>f.execute());assert.equal(f.childCalls,0);assert.equal(Object.hasOwn(f.read(f.runFile),'evaluation_bound'),false);
});

test('a scheduled origin must refer to the original live host turn, not an unrelated resumed turn',async t=>{
  const f=fixture(t);scheduledOrigin(f);f.setOrigin({...f.origin,host_turn:{...f.origin.host_turn,turn_id:randomUUID()}});
  await reject(()=>f.prepare());assert.equal(f.childCalls,0);
});

for(const action of ['decision','bound','execution','completion','running','failed','unknown_turn'])test('a current window '+action+' Company action blocks a second action in the same host turn',async t=>{
  const f=fixture(t),prior=clone(f.read(f.runFile));prior.id=randomUUID();
  const sameOrigin={thread_id:f.origin.proof.thread_id,host_turn:clone(f.origin.host_turn)};
  if(action==='decision')prior.decision={seal:{execution_origin:sameOrigin}};
  if(action==='bound')prior.evaluation_bound={bound_at:NOW.toISOString()};
  if(action==='execution')prior.evaluation_execution={completed_at:NOW.toISOString()};
  if(action==='completion')prior.evidence_of_completion={kind:'unrelated existing action'};
  if(action==='running' || action==='failed')prior.stages.execute=action;
  if(action==='unknown_turn')prior.decision={kind:'legacy action with no retained native turn'};
  f.write(path.join(f.stateRoot,'runs',prior.id+'.json'),prior);
  await reject(()=>f.prepare());assert.equal(f.childCalls,0);
  assert.equal(Object.hasOwn(f.read(f.runFile),'decision'),false);
});

test('a historical previous-turn action does not permanently prohibit this chat from a genuine new host turn',async t=>{
  const f=fixture(t),prior=clone(f.read(f.runFile));prior.id=randomUUID();
  prior.started_at=prior.observed_at=new Date(+NOW-2000).toISOString();prior.stages.execute='completed';
  prior.decision={kind:'unrelated historical operating action',seal:{execution_origin:{thread_id:f.origin.proof.thread_id,
    host_turn:{turn_id:randomUUID(),started_at:new Date(+NOW-3000).toISOString(),state:'in_progress',finished_at:null}}}};
  f.write(path.join(f.stateRoot,'runs',prior.id+'.json'),prior);
  assert.equal((await f.prepare()).status,'recorded');assert.equal(f.childCalls,0);
});

for(const [name,change] of [
  ['missing thread in the current window',p=>{delete p.origin_proof;}],
  ['invalid thread in the current window',p=>{p.origin_proof.thread_id='not-a-thread-uuid';}],
  ['missing thread and missing start',p=>{delete p.origin_proof;delete p.started_at;}],
  ['invalid thread and invalid calendar start',p=>{p.origin_proof.thread_id='not-a-thread-uuid';p.started_at='2026-02-31T00:00:00Z';}],
  ['missing thread and a future start',p=>{delete p.origin_proof;p.started_at=new Date(+NOW+60000).toISOString();}],
])test('unknown ownership rejects an acted record with '+name+' before another action',async t=>{
  const f=fixture(t),prior=clone(f.read(f.runFile));prior.id=randomUUID();prior.stages.execute='completed';change(prior);
  f.write(path.join(f.stateRoot,'runs',prior.id+'.json'),prior);
  await reject(()=>f.prepare());assert.equal(f.childCalls,0);
  assert.equal(Object.hasOwn(f.read(f.runFile),'decision'),false);
});

test('unknown ownership on a provably past record remains historical rather than blocking every future turn',async t=>{
  const f=fixture(t),prior=clone(f.read(f.runFile));prior.id=randomUUID();prior.stages.execute='completed';
  delete prior.origin_proof;prior.started_at=prior.observed_at=new Date(+NOW-2000).toISOString();
  f.write(path.join(f.stateRoot,'runs',prior.id+'.json'),prior);
  assert.equal((await f.prepare()).status,'recorded');assert.equal(f.childCalls,0);
});

test('a proven different thread does not acquire ownership of this current thread through registry proximity',async t=>{
  const f=fixture(t),prior=clone(f.read(f.runFile));prior.id=randomUUID();prior.stages.execute='completed';
  prior.origin_proof.thread_id=randomUUID();
  f.write(path.join(f.stateRoot,'runs',prior.id+'.json'),prior);
  assert.equal((await f.prepare()).status,'recorded');assert.equal(f.childCalls,0);
});

test('a prospective manual owner route remains executable without claiming a natural automation origin',async t=>{
  const f=fixture(t),r=f.read(f.runFile);r.origin='manual';f.write(f.runFile,r);
  await f.declare();await f.execute();f.commit();const done=await f.finish();
  assert.equal(done.status,'verified_existing_experiment_evaluation');assert.equal(f.childCalls,1);
  assert.equal(f.read(f.runFile).decision.seal.execution_origin.origin,'manual');
  assert.equal(done.parent_zero_touch_completion,null);
});

for(const relative of ['growth/lib/company-evaluation.mjs','data/company-monthly-budget.json'])test('finish rejects a changed current sealed verifier or policy: '+relative,async t=>{
  const f=fixture(t);await f.declare();await f.execute();f.commit();
  fs.appendFileSync(path.join(f.root,relative),'\n');
  await reject(()=>f.finish());assert.equal(f.fetched,0);assert.equal(f.childCalls,1);
  assert.notEqual(f.read(f.runFile).status,'verified_existing_experiment_evaluation');
});

const nativePull=(f,head)=>({number:1,
  base:{ref:'main',repo:{full_name:'simplememofast/simplememo'}},
  head:{ref:f.git('branch','--show-current'),sha:head,repo:{full_name:'simplememofast/simplememo'}}});
const publicDecision=(f,head,over={})=>verifyDecision({branch:f.git('branch','--show-current'),head,
  baseRef:f.source,cwd:f.root,pr:nativePull(f,head),...over});

test('native typed evaluation passes the real ordinary decision verifier from actual declaration and original CLI Git commits',async t=>{
  const f=fixture(t);scheduledOrigin(f);const declared=await f.declare(),declaration=f.git('rev-parse','HEAD');
  const pushIntent=await publicDecision(f,declaration,{pr:null});
  assert.equal(pushIntent.state,'declared_only');assert.equal(pushIntent.private_admission_verified,false);
  await reject(()=>publicDecision(f,declaration));
  await f.execute();const head=f.commit();
  const privateBefore=stateBytes(f.stateRoot),canonicalBefore=f.git('show',f.source+':data/autopilot-runs.json');
  assert.equal((await publicDecision(f,head,{pr:null})).state,'awaiting_pr_validation');
  const result=await publicDecision(f,head);
  assert.equal(result.state,'contract_verified');
  assert.equal(result.private_admission_verified,false,'public Git proves the bounded declaration and projection, not private metric admission');
  assert.equal(result.business_completed,false);
  assert.deepEqual(stateBytes(f.stateRoot),privateBefore,'read-only CI does not turn the private run into a finished Company run');
  assert.equal(f.git('show',head+':data/autopilot-runs.json'),canonicalBefore,'no canonical shipped run is invented');
  assert.equal(f.childCalls,1);assert.equal(f.fetched,0);
  assert.equal(f.read(f.runFile).status,'executed_pending_evaluation_delivery');
  assert.equal(JSON.stringify(declared.intent).includes(f.review.rationale),false);
});

test('ordinary native evaluation CI rejects wrong PR repository, head, branch or base instead of trusting CI success labels',async t=>{
  const f=fixture(t);scheduledOrigin(f);await f.declare();await f.execute();const head=f.commit(),pr=nativePull(f,head);
  assert.equal((await publicDecision(f,head)).state,'contract_verified','the complete fixture must pass before testing PR binding failures');
  for(const changed of [
    {head:{...pr.head,repo:{full_name:'other/repo'}}},
    {base:{...pr.base,repo:{full_name:'other/repo'}}},
    {head:{...pr.head,sha:f.source}},
    {head:{...pr.head,ref:'claude/other-action'}},
    {base:{...pr.base,ref:'other-branch'}},
  ])await reject(()=>publicDecision(f,head,{pr:{...pr,...changed}}));
  assert.equal(f.childCalls,1);assert.equal(f.fetched,0);
});

test('ordinary native evaluation CI rejects mixed gates, arbitrary pages and every non-outcome mutation in real Git',async t=>{
  const f=fixture(t);scheduledOrigin(f);const declared=await f.declare();await f.execute();const valid=f.commit();
  assert.equal((await publicDecision(f,valid)).state,'contract_verified','no missing source may substitute for the intended mutation guard');
  const intent=()=>f.read(path.join(f.root,declared.intent_path));
  const saveIntent=x=>f.write(path.join(f.root,declared.intent_path),x);
  const saveLedger=mutate=>{const x=f.read(path.join(f.root,LEDGER));mutate(x);f.write(path.join(f.root,LEDGER),x);};
  const mutations=[
    ['malformed intent basename',()=>fs.renameSync(path.join(f.root,declared.intent_path),path.join(f.root,'docs/autonomy/company-evaluation-intents/FIXTURE.json'))],
    ['original decision gate mixed in',()=>f.write(path.join(f.root,'data/decision-intents/fixture-mixed.json'),{id:'fixture-mixed',run_id:'invented-shipped-run'})],
    ['arbitrary public page',()=>fs.writeFileSync(path.join(f.root,'index.html'),'<h1>Undeclared treatment</h1>\n')],
    ['protected verifier',()=>fs.appendFileSync(path.join(f.root,'growth/lib/company-evaluation.mjs'),'\n// untrusted verifier rewrite\n')],
    ['current budget policy',()=>{const p=path.join(f.root,'data/company-monthly-budget.json');f.write(p,{...f.read(p),untrusted_override:true});}],
    ['canonical shipped row',()=>{const p=path.join(f.root,'data/autopilot-runs.json'),x=f.read(p);x.runs.push({run_id:'invented-shipped-run',outcome:'shipped',pr:1});f.write(p,x);}],
    ['original target condition',()=>saveLedger(x=>{x.experiments[0].guard.min_sample=1;})],
    ['non-target row',()=>saveLedger(x=>{x.experiments[1].notes.push('unrelated mutation');})],
    ['original target notes',()=>saveLedger(x=>{x.experiments[0].notes.push('unsealed public rationale');})],
    ['original row order',()=>saveLedger(x=>{x.experiments.reverse();})],
    ['ledger metadata',()=>saveLedger(x=>{x.version++;})],
    ['unknown outcome decision',()=>saveLedger(x=>{x.experiments[0].decision='claimed_pass';})],
    ['future outcome date',()=>saveLedger(x=>{x.experiments[0].evaluated_at='2099-01-01';})],
    ['forged private result digest',()=>saveLedger(x=>{x.experiments[0].evidence.sha256='a'.repeat(64);})],
    ['old source epoch',()=>saveIntent({...intent(),source_commit:'a'.repeat(40)})],
    ['forged original ledger seal',()=>saveIntent({...intent(),original_ledger_sha256:'a'.repeat(64)})],
    ['unknown public decision',()=>saveIntent({...intent(),decision:'claimed_pass'})],
    ['child outcome claimed in public intent',()=>saveIntent({...intent(),child:{exit_code:0,claimed_private_admission:true}})],
  ];
  for(const [name,mutate] of mutations) {
    f.git('reset','--hard',valid);f.git('clean','-fd');mutate();const head=f.commit();
    await assert.rejects(()=>publicDecision(f,head),undefined,name);
  }
  assert.equal(f.childCalls,1);assert.equal(f.fetched,0);
});

test('ordinary native evaluation CI rejects a retrospective declaration committed together with already-evaluated output',async t=>{
  const f=fixture(t);scheduledOrigin(f);const declared=await f.declare();await f.execute();
  const evaluated=fs.readFileSync(path.join(f.root,LEDGER)),valid=f.commit();
  assert.equal((await publicDecision(f,valid)).state,'contract_verified');
  f.git('reset','--hard',f.source);f.git('clean','-fd');
  f.write(path.join(f.root,declared.intent_path),declared.intent);fs.writeFileSync(path.join(f.root,LEDGER),evaluated);
  const late=f.commit();await reject(()=>publicDecision(f,late));assert.equal(f.childCalls,1);assert.equal(f.fetched,0);
});

test('public CI rejects an offset literal day even when its preparation instant precedes the real declaration',async t=>{
  const f=fixture(t),declared=await f.declare();await f.execute();const evaluated=f.read(path.join(f.root,LEDGER)),valid=f.commit();
  assert.equal((await publicDecision(f,valid)).state,'contract_verified');
  const instant=Date.parse(declared.intent.prepared_at),hours=new Date(instant).getUTCHours()>=12?14:-12;
  const wall=new Date(instant+hours*3600000).toISOString().replace('Z',(hours>0?'+':'-')+String(Math.abs(hours)).padStart(2,'0')+':00');
  assert.equal(Date.parse(wall),instant);assert.notEqual(wall.slice(0,10),declared.intent.expected_evaluation_date);
  const forged={...declared.intent,prepared_at:wall,expected_evaluation_date:wall.slice(0,10)};
  evaluated.experiments.find(e=>e.id===f.target.id).evaluated_at=forged.expected_evaluation_date;
  f.git('reset','--hard',f.source);f.git('clean','-fd');f.write(path.join(f.root,declared.intent_path),forged);
  f.setGitTime(new Date(instant+1000).toISOString());f.git('add','.');f.git('commit','-qm','Synthetic offset declaration');
  assert.ok(Date.parse(f.git('show','-s','--format=%cI','HEAD'))>=Date.parse(forged.prepared_at),'chronology is valid so the literal/UTC mismatch is the rejected condition');
  f.write(path.join(f.root,LEDGER),evaluated);const head=f.commit();
  await assert.rejects(()=>publicDecision(f,head),/canonical|predeclared evaluation day/i);
  assert.equal(f.childCalls,1);assert.equal(f.fetched,0);
});

test('the actual --check entrypoint validates manual typed PRs, rejects invalid outcomes and preserves the untyped manual skip',async t=>{
  const f=fixture(t),manual=f.read(f.runFile);manual.origin='manual';f.write(f.runFile,manual);
  await f.declare();await f.execute();const valid=f.commit();
  assert.equal((await publicDecision(f,valid)).state,'contract_verified');
  f.git('branch','main',f.source);f.git('remote','add','origin',f.root);
  const eventFile=path.join(f.stateRoot,'synthetic-pr-event.json');
  const check=head=>{
    const pr=nativePull(f,head);pr.base.sha=f.source;f.write(eventFile,{pull_request:pr});
    return spawnSync(process.execPath,[path.join(f.root,'scripts/decision-ci.mjs'),'--check'],{
      cwd:f.root,encoding:'utf8',timeout:60000,
      env:{...process.env,GITHUB_EVENT_PATH:eventFile,GITHUB_EVENT_NAME:'pull_request',GITHUB_SHA:head,GITHUB_REF_NAME:pr.head.ref}});
  };
  const passed=check(valid);assert.equal(passed.signal,null);assert.equal(passed.status,0,passed.stderr);
  assert.equal(JSON.parse(passed.stdout).state,'contract_verified');
  assert.equal(JSON.parse(passed.stdout).private_admission_verified,false);
  const changed=f.read(path.join(f.root,LEDGER));changed.experiments[0].decision='claimed_pass';f.write(path.join(f.root,LEDGER),changed);
  const invalid=check(f.commit());assert.equal(invalid.signal,null);assert.equal(invalid.status,1);
  assert.match(invalid.stderr,/invalid|decision|evaluation/i);
  f.git('reset','--hard',f.source);f.git('clean','-fd');fs.writeFileSync(path.join(f.root,'index.html'),'<h1>Unrelated manual fixture</h1>\n');
  const untyped=check(f.commit());assert.equal(untyped.signal,null);assert.equal(untyped.status,0,untyped.stderr);
  assert.match(untyped.stdout,/not an autonomous picker branch/);
  assert.equal(f.childCalls,1);assert.equal(f.fetched,0);
});
