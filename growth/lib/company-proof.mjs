import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { ROOT, formalMetrics, compareMetrics } from './company-metrics.mjs';
import { atomicJson, privateState, acquireLock } from './company-loop.mjs';
import { verifyAppsFlyer } from './company-data.mjs';
import { startOperationalFollowup } from './company-followup.mjs';
import {decisionCommitment,verifyDecisionContract,verifyDecisionDelivery,decisionTrace,candidateDigest} from './company-decision.mjs';
import {verifyMeasurementInput,verifyMeasurementDelivery} from './company-measurement.mjs';
import {observe,opportunities} from './company-loop.mjs';
import {intentPath} from '../../scripts/value-contracts.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const run = (name,args,opts={}) => execFileSync(name,args,{ cwd: ROOT, encoding:'utf8', timeout:60000,
  maxBuffer:8*1024*1024, stdio:['pipe','pipe','pipe'], ...opts });

export function verifyMergedChange(pr, call = run, { requireIntegration = true } = {}) {
  if (!Number.isInteger(pr) || pr < 1) throw new Error('A real numeric PR is required');
  const repo = 'simplememofast/simplememo';
  const pull = JSON.parse(call('gh',['pr','view',String(pr),'--repo',repo,'--json','number,state,baseRefName,headRefOid,mergedAt,mergeCommit,url,files']));
  if (pull.state !== 'MERGED' || pull.baseRefName !== 'main' || !pull.mergedAt || !pull.mergeCommit?.oid) throw new Error('PR is not merged to main');
  const checks = JSON.parse(call('gh',['run','list','--repo',repo,'--workflow','seo-check.yml','--commit',pull.headRefOid,
    '--limit','30','--json','databaseId,headSha,event,status,conclusion']));
  const verified = checks.find(c => c.headSha === pull.headRefOid && c.event === 'pull_request' && c.status === 'completed' && c.conclusion === 'success');
  if (!verified) throw new Error('Exact final PR SHA has no successful SEO Validation');
  call('git',['fetch','origin','main']);
  call('git',['merge-base','--is-ancestor',pull.mergeCommit.oid,'origin/main']);
  if (requireIntegration && !pull.files.some(f => ['scripts/company-os.mjs','growth/lib/company-data.mjs'].includes(f.path))) throw new Error('PR does not contain this integration');
  return { pr, url: pull.url, head_sha: pull.headRefOid, merge_sha: pull.mergeCommit.oid, merged_at: pull.mergedAt, validation_run: verified.databaseId };
}

export async function bindExistingRun({stateRoot,id,autopilotRunId,call=run,cwd=ROOT,now=new Date(),currentCandidates}) {
  if (!/^[a-f0-9-]{36}$/.test(id) || !/^[A-Za-z0-9._-]{1,160}$/.test(autopilotRunId ?? '')) throw new Error('Invalid run identity');
  const dir=privateState(stateRoot), release=acquireLock(dir);
  if (!release) return {status:'busy'};
  try {
    const file=path.join(dir,'runs',id+'.json'), receipt=read(file);
    if (![2,3].includes(receipt.schema_version) || receipt.status !== 'observed_decision_requires_execution') throw new Error('A new prospective observed action is required');
    decisionCommitment(receipt);
    verifyMeasurementInput(receipt,{stateRoot:dir});
    if(receipt.decision.input.run_id!==autopilotRunId)throw new Error('Canonical run differs from the recorded decision');
    if (receipt.bound_autopilot_run_id && receipt.bound_autopilot_run_id !== autopilotRunId) throw new Error('Existing binding is immutable');
    if(receipt.bound_autopilot_run_id) {
      if(receipt.bound_decision_sha256!==receipt.decision.sha256)throw new Error('Decision changed after binding');
      return receipt; // A retry must not move the pre-execution timestamp.
    }
    if (read(path.join(cwd,'data/autopilot-runs.json')).runs.some(r=>r.run_id===autopilotRunId) || receipt.prior_autopilot_run_ids?.includes(autopilotRunId)) throw new Error('Cannot bind a historical run retrospectively');
    const stop=read(path.join(cwd,'data/emergency-stop.json'));
    if(stop.stopped!==false || stop.agents?.[receipt.route]?.stopped!==false)throw new Error('Current stop blocks binding');
    const candidates=currentCandidates??opportunities(observe({stateRoot:dir,now}));
    if(!candidates.some(c=>c.id===receipt.decision.input.candidate_id && candidateDigest(c)===receipt.decision.candidate_sha256))throw new Error('Candidate evidence or eligibility changed before binding');
    const head=call('git',['rev-parse','HEAD']).trim();
    const contract=JSON.parse(call('git',['show',head+':'+intentPath(receipt.decision.input.contract_id)]));
    if(Date.parse(contract.created_at)>now.getTime() || now.getTime()-Date.parse(receipt.observed_at)>6*3600000)throw new Error('Current prospective contract required');
    const history=await verifyDecisionContract(receipt,contract,call,{head,cwd});
    const branch=call('git',['branch','--show-current']).trim();
    if(!branch || call('git',['ls-remote','--heads','origin',branch]).trim().split(/\s+/)[0]!==head)throw new Error('Push the declaration before binding implementation');
    receipt.bound_autopilot_run_id=autopilotRunId; receipt.bound_at=now.toISOString();
    receipt.bound_decision_sha256=receipt.decision.sha256;receipt.bound_declaration_sha=history.declaration_sha;
    receipt.stages.decide='completed';
    atomicJson(file,receipt); atomicJson(path.join(dir,'latest-run.json'),receipt); return receipt;
  } finally {release();}
}

export async function verifyPublishedArtifact(artifact,mergeSha,call=run,fetchImpl=fetch) {
  if(typeof artifact!=='string' || !artifact.startsWith('/') || artifact.startsWith('//') || /[?#\\]/.test(artifact)) throw new Error('A same-site artifact is required');
  const relative=artifact.slice(1);
  if(relative.split('/').some(s=>['.','..'].includes(s)))throw new Error('Invalid artifact path');
  const candidates=artifact.endsWith('/')?[relative+'index.html']:[relative,relative+'.html',relative+'/index.html'];
  let expected,sourcePath;
  for(const candidate of candidates) {
    try {expected=call('git',['show',mergeSha+':'+candidate]);sourcePath=candidate;break;}catch{}
  }
  if(typeof expected!=='string')throw new Error('Cannot verify an artifact without its merged source');
  const response=await fetchImpl('https://simplememofast.com'+artifact,{redirect:'follow',signal:AbortSignal.timeout(20000)});
  if(!response.ok || new URL(response.url).hostname!=='simplememofast.com') throw new Error('Published artifact not verified');
  const body=await response.text();
  if(hash(body)!==hash(expected))throw new Error('Published artifact still differs from the merged source');
  return {artifact_source:sourcePath,served_sha256:hash(body)};
}

export function verifyIntegrationLedger(receipt,merge,call=run) {
  const id=receipt.bound_autopilot_run_id;
  if(!id || receipt.prior_autopilot_run_ids?.includes(id) || Date.parse(merge.merged_at)<Date.parse(receipt.started_at)) throw new Error('Integration must bind a new actual run before execution');
  const ledger=JSON.parse(call('git',['show',merge.merge_sha+':data/autopilot-runs.json']));
  const row=ledger.runs.find(r=>r.run_id===id);
  const route=receipt.route??(receipt.origin==='codex-automation'?'actions':'owner-session');
  if(!row || row.outcome!=='shipped' || row.attempted!==true || row.pr!==merge.pr || row.route!==route) throw new Error('Merged integration ledger does not match the bound action');
  const prior=JSON.parse(call('git',['show',merge.merge_sha+'^:data/autopilot-runs.json']));
  if(prior.runs.some(r=>r.run_id===id)) throw new Error('Integration merge did not introduce the bound run');
  return {canonical_run_id:id,canonical_source:'data/autopilot-runs.json',human_interventions:row.interventions??null};
}

export async function verifyOperationalDelivery(merge,call=run,fetchImpl=fetch) {
  const checks=JSON.parse(call('gh',['api',`repos/simplememofast/simplememo/commits/${merge.merge_sha}/check-runs`]));
  const pages=checks.check_runs?.find(c=>c.name==='Cloudflare Pages' && c.status==='completed' && c.conclusion==='success' && c.head_sha===merge.merge_sha);
  if(!pages) throw new Error('Merged integration has no successful exact-commit Pages deployment');
  // The middleware intentionally returns 404 for /scripts and /growth. Keep
  // that boundary; verify the actual public status consumed by the site.
  const publicOutput=await verifyPublishedArtifact('/data/autopilot-status.json',merge.merge_sha,call,fetchImpl);
  const internal=await fetchImpl('https://simplememofast.com/scripts/company-os.mjs',{redirect:'error',signal:AbortSignal.timeout(20000)});
  if(internal.status!==404) throw new Error('Internal Company script publication boundary changed');
  return {pages_check_id:pages.id,pages_deployment_url:pages.details_url,...publicOutput,internal_script_status:404,
    code_delivery:'Reviewed merge on origin/main; native owner creates its next worktree from latest main'};
}

export async function verifyActionDelivery(artifact,merge,call=run,fetchImpl=fetch) {
  // An explicit null is the existing ledger's representation for operational
  // code wiring. It still requires a real deployment and exact public status.
  return artifact===null?verifyOperationalDelivery(merge,call,fetchImpl):verifyPublishedArtifact(artifact,merge.merge_sha,call,fetchImpl);
}

export async function finishExistingRun({stateRoot,id,evidenceFile,call=run,cwd=ROOT,fetchImpl=fetch,now=new Date()}) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid Company run ID');
  const dir=privateState(stateRoot), release=acquireLock(dir);
  if (!release) return {status:'busy'};
  try {
    const file=path.join(dir,'runs',id+'.json'), receipt=read(file), evidence=read(evidenceFile);
    if (receipt.status==='verified_existing_autopilot') {
      if(evidence.run_id!==receipt.bound_autopilot_run_id || evidence.pr!==receipt.evidence_of_completion?.merge?.pr)throw new Error('Completion identity is immutable');
      if(decisionTrace(receipt).state!=='verified')throw new Error('Retained delivery has no valid prospective decision trace; preserve history, do not upgrade it');
      return receipt;
    }
    if(![2,3].includes(receipt.schema_version))throw new Error('Legacy observation cannot receive retrospective decision proof');
    decisionCommitment(receipt);
    const stops=read(path.join(cwd,'data/emergency-stop.json'));
    if(receipt.execution_boundary.stopped || receipt.execution_boundary[receipt.route==='actions'?'actions_stopped':'owner_session_stopped'] || stops.stopped!==false || stops.agents?.[receipt.route]?.stopped!==false)throw new Error('Stopped action cannot complete');
    if (evidence.kind!=='autopilot_run' || !receipt.bound_autopilot_run_id || evidence.run_id!==receipt.bound_autopilot_run_id || receipt.prior_autopilot_run_ids?.includes(evidence.run_id)) throw new Error('Actual run must have been bound before execution');
    const merge=verifyMergedChange(evidence.pr,call,{requireIntegration:false});
    if (Date.parse(merge.merged_at)<Date.parse(receipt.started_at)) throw new Error('Historical merge is not a new Company action');
    const ledger=JSON.parse(call('git',['show',merge.merge_sha+':data/autopilot-runs.json']));
    const row=ledger.runs.find(r=>r.run_id===evidence.run_id);
    if (!row || row.outcome!=='shipped' || row.attempted!==true || row.pr!==evidence.pr || row.route!==receipt.route) throw new Error('Merged canonical run does not match this action');
    const prior=JSON.parse(call('git',['show',merge.merge_sha+'^:data/autopilot-runs.json']));
    if(prior.runs.some(r=>r.run_id===evidence.run_id)) throw new Error('Merge did not introduce this run');
    const contract=JSON.parse(call('git',['show',merge.merge_sha+':'+intentPath(receipt.decision.input.contract_id)]));
    call('git',['fetch','origin',`refs/pull/${merge.pr}/head`]);
    const trace=await verifyDecisionDelivery(receipt,contract,row,prior.runs,ledger.runs,merge,call,cwd);
    const artifactProof=await verifyActionDelivery(row.artifact,merge,call,fetchImpl);
    if(row.artifact!==null && !receipt.decision.input.scope.paths.includes(artifactProof.artifact_source))throw new Error('Actually served source was not the declared changed target');
    const measurement=verifyMeasurementDelivery(receipt,{stateRoot:dir,root:cwd,head:merge.head_sha,mergeSha:merge.merge_sha,mergedAt:merge.merged_at,call});
    receipt.status='verified_existing_autopilot'; receipt.finished_at=now.toISOString();
    receipt.stages={detect:'completed',decide:'completed',execute:'completed',verify:'completed',report:'saved',learn:'recorded'};
    receipt.evidence_of_completion={merge,canonical_run_id:row.run_id,canonical_source:'data/autopilot-runs.json',artifact:row.artifact,...artifactProof,decision_trace:trace,
      limitation:'Exact final SHA CI and canonical run/merge are verified. Domain-specific effect and rollback evidence remain in the existing experiment/PR.'};
    receipt.human_interventions=row.interventions??null;
    receipt.learnings=typeof evidence.learning==='string'&&evidence.learning.length<=2000 ? [evidence.learning] : ['Implementation verified; business impact awaits its existing experiment horizon.'];
    receipt.followup=measurement??{source:'growth/experiments/experiments.json and existing value contracts',status:'preserve original evaluation date and evidence gate'};
    atomicJson(file,receipt);atomicJson(path.join(dir,'latest-run.json'),receipt);return receipt;
  } finally {release();}
}

export function verifyNativeIntegration(call = run) {
  const script = `import sqlite3,json,hashlib\nfrom pathlib import Path\np=Path.home()/'.codex/sqlite/codex-dev.db'\nc=sqlite3.connect('file:'+str(p)+'?mode=ro',uri=True)\nr=c.execute('SELECT id,status,prompt,rrule,model FROM automations WHERE id=?',('obsidian',)).fetchone()\nassert r is not None\nprompt=r[2]\nprint(json.dumps({'id':r[0],'status':r[1],'prompt_sha256':hashlib.sha256(prompt.encode()).hexdigest(),'rrule':r[3],'model':r[4],'integration_present':all(s in prompt for s in ['docs/autonomy/OPERATING_RUNBOOK.md','growth-autopilot','Daily','Weekly','Monthly','follow-up'])}))`;
  const receipt = JSON.parse(call('python3',['-c',script]));
  if (receipt.status !== 'ACTIVE' || !receipt.integration_present || receipt.rrule !== 'FREQ=DAILY;BYHOUR=6;BYMINUTE=0;BYSECOND=0') throw new Error('Native existing-owner integration not persisted');
  return { ...receipt, verification: 'native scheduler database readback', natural_run_verified: false };
}

export function verifyReaderParity(receipt, call = run) {
  const result = verifyAppsFlyer(receipt.output);
  const source = call('git',['show',receipt.reader_commit+':scripts/appsflyer_aggregate.py'],{cwd:path.join(os.homedir(),'simplememo-api')});
  if (hash(source) !== receipt.reader_sha256) throw new Error('Original reader identity changed');
  const cached = path.join(path.dirname(path.dirname(receipt.output)),'reader-cache','appsflyer-'+receipt.reader_sha256+'.py');
  if (hash(fs.readFileSync(cached)) !== receipt.reader_sha256) throw new Error('Cached original reader changed');
  const script = `import importlib.util,json,sys\nfrom pathlib import Path\ns=importlib.util.spec_from_file_location('original_reader',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nr=json.loads(Path(sys.argv[2],'result.json').read_text());q=m.inspect_csv(Path(sys.argv[2],'report.csv').read_bytes(),r['parameters']['from'],r['parameters']['to']);print(json.dumps(q))`;
  const quality = JSON.parse(call('python3',['-c',script,cached,receipt.output]));
  if (!isDeepStrictEqual(quality,result.quality)) throw new Error('Original reader output parity failed');
  return { state:'verified', reader_sha256:receipt.reader_sha256, csv_sha256:result.quality.sha256,
    method:'Recompute all quality fields from the exact retained CSV using the original reviewed parser; compare without normalizing missing values',
    population:result.population, window:receipt.window };
}

export async function finishIntegration({ stateRoot, id, evidenceFile, call = run, fetchImpl = fetch, now = new Date() }) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid Company run ID');
  const dir = privateState(stateRoot), release = acquireLock(dir);
  if (!release) return { status:'busy' };
  try {
    const file = path.join(dir,'runs',id+'.json'), receipt = read(file), evidence = read(evidenceFile);
    if (receipt.status === 'verified_integration') return receipt;
    if(receipt.schema_version!==1)throw new Error('New Company actions require the prospective autopilot_run decision verifier; pipeline_integration is legacy bootstrap evidence only');
    if (receipt.selected?.id !== 'integrate:appsflyer-consumer' || evidence.kind !== 'pipeline_integration') throw new Error('Proof does not bind the selected integration');
    const route=receipt.route??(receipt.origin==='codex-automation'?'actions':'owner-session');
    if (receipt.execution_boundary.stopped || (route==='actions'?receipt.execution_boundary.actions_stopped:receipt.execution_boundary.owner_session_stopped)) throw new Error('Stopped run cannot complete an action');
    const currentStops = read(path.join(ROOT,'data/emergency-stop.json'));
    if (currentStops.stopped !== false || currentStops.agents?.[route]?.stopped !== false) throw new Error('Current stop gate blocks completion');
    const merge = verifyMergedChange(evidence.pr,call);
    const canonical = verifyIntegrationLedger(receipt,merge,call);
    const scheduler = verifyNativeIntegration(call);
    const collection = read(evidence.collection_receipt);
    if (collection.status !== 'verified' || collection.source !== 'appsflyer') throw new Error('Verified aggregate collection required');
    const parity = verifyReaderParity(collection,call);
    const testOutput = call(process.execPath,['--test','growth/lib/company.test.mjs']);
    const delivery=await verifyOperationalDelivery(merge,call,fetchImpl);
    receipt.status='verified_integration'; receipt.finished_at=now.toISOString();
    receipt.stages={detect:'completed',decide:'completed',execute:'completed',verify:'completed',report:'saved',learn:'recorded'};
    receipt.evidence_of_completion={merge,scheduler,parity,canonical,delivery,test_output_sha256:hash(testOutput)};
    receipt.human_interventions=canonical.human_interventions;
    receipt.human_work_removed={task:'AppsFlyer report collection and handoff',previous:'documented manual reader invocation/date choice/CSV validation',
      current:'existing daily owner invokes and validates the original reader using a source-day receipt',
      legacy_task_index:49,whole_legacy_task_promoted:false,
      reason:'The multi-vendor legacy task also includes other vendors; partial integration cannot promote that whole row',
      bootstrap_human_request:true,natural_scheduled_zero_touch_proven:false};
    receipt.learnings=['Generate windows in each source timezone and preserve the source maturity rule.',
      'A successful data read does not prove an experiment win or a natural scheduled invocation.'];
    receipt.followup={next_check:'next existing daily owner run',evaluation:'seven observed daily slots; remain INCONCLUSIVE if scheduler/run evidence is missing'};
    atomicJson(file,receipt); atomicJson(path.join(dir,'latest-run.json'),receipt);
    atomicJson(path.join(dir,'scheduler-integration.json'),{...scheduler,merge,verified_at:now.toISOString()});
    startOperationalFollowup({stateRoot:dir,integrationRun:id,now});
    const metrics=formalMetrics({now}); atomicJson(path.join(dir,'metrics-current.json'),metrics);
    atomicJson(path.join(dir,'metrics-comparison.json'),compareMetrics(read(path.join(dir,'metrics-baseline.json')),metrics));
    return receipt;
  } finally { release(); }
}
