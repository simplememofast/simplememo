import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {atomicJson,privateState,opportunities,auditObservation} from './company-loop.mjs';
import {currentAutomationAssessment} from './company-automation-health.mjs';
import {recordAutomationDiagnosis} from './company-automation-diagnoses.mjs';

const now=new Date('2026-09-14T07:00:00Z');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t) {
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'company-current-health-'));fs.chmodSync(stateRoot,0o700);
  t.after(()=>fs.rmSync(stateRoot,{recursive:true,force:true}));
  privateState(path.join(stateRoot,'discovery'));
  const row={job_name:'service_notice_monitor',cron_expression:'0 * * * *',runs:21,failures:1,runs_with_output:0,
    last_failure:Date.parse('2026-09-13T10:00:49Z'),last_run:Date.parse('2026-09-14T06:00:02Z'),
    last_no_error:Date.parse('2026-09-14T06:00:03Z'),latest_finished:Date.parse('2026-09-14T06:00:03Z'),
    latest_errors:0,latest_thrown:0,latest_eligible:0,latest_sent:0,latest_reason:'service_notice_inactive'};
  const rawFile=path.join(stateRoot,'discovery/cloudflare-cron-health.json'),metaFile=path.join(stateRoot,'discovery/cloudflare-cron-health-meta.json');
  const job={id:'cloudflare:simplememo-api:service_notice_monitor',name:row.job_name,owner:'existing monitor',execution_state:'observed',
    last_failure:{at:new Date(row.last_failure).toISOString()},health:{state:'errors_observed',runs_30d:21,failures_30d:1},history_scope:'30 days'};
  const save=()=>{
    atomicJson(rawFile,[{success:true,results:[row]}]);const raw_sha256=hash(fs.readFileSync(rawFile));
    const observed_at='2026-09-14T06:59:00Z';
    atomicJson(metaFile,{current_run_evidence_version:1,profile:'observe',method:'fixed aggregate SELECT',scope_days:30,raw_sha256,observed_at});
    job.current_observation={schema_version:1,source:'discovery/cloudflare-cron-health.json',raw_sha256,observed_at,
      latest_failure_ms:row.last_failure,latest_no_error_ms:row.last_no_error,
      latest_results:[{cron_expression:row.cron_expression,started_at_ms:row.last_run,finished_at_ms:row.latest_finished,
        errors:row.latest_errors,thrown:row.latest_thrown,eligible:row.latest_eligible,sent:row.latest_sent,reason:row.latest_reason}]};
    job.last_failure.at=new Date(row.last_failure).toISOString();
  };
  save();return {stateRoot,row,job,rawFile,metaFile,save,assess:()=>currentAutomationAssessment(job,now,stateRoot)};
}

function reviewedVfu(t) {
  const f=fixture(t);f.row.job_name='vfu_regular';f.row.latest_reason='daily_cap_reached';
  f.job.id='cloudflare:simplememo-api:vfu_regular';f.job.name='vfu_regular';f.save();
  const file=name=>path.join(f.stateRoot,name),source=file('sanitized-source.json'),investigation=file('investigation.json'),evidence=file('review.json');
  atomicJson(source,{findings:'Example provider rejects a test domain; no replay performed.'});
  const p={schema_version:1,job_id:f.job.id,failure_finished_at_ms:f.row.last_failure,checked_at:'2026-09-14T06:57:00Z',
    findings:['The retained failure has been inspected; no safe replay or repair is justified.'],
    sources:[{path:'sanitized-source.json',sha256:hash(fs.readFileSync(source))}],no_send_or_cron_trigger:true,disposition:'no_safe_action'};
  atomicJson(investigation,p);
  const r={schema_version:1,job_id:f.job.id,failure_finished_at_ms:f.row.last_failure,reviewed_at:'2026-09-14T06:58:00Z',
    review_after:'2026-09-14T07:30:00Z',decision:'reviewed_no_safe_action',rationale:'The existing owner is retained; no safe immediate repair is justified by these findings.',
    next_condition:'Inspect a new failure, changed owner result, invalid evidence or expiration of this review.',
    investigation:{path:'investigation.json',sha256:hash(fs.readFileSync(investigation))}};
  atomicJson(evidence,r);
  const history={schema_version:1,reviews:[{id:f.job.id,classification:'existing_residual_outcomes',evidence:['old.json'],observed_result:{errors:6}},
    {id:'unrelated',classification:'permission_limit'}]};
  atomicJson(file('failure-classifications.json'),history);atomicJson(file('automation-registry.json'),{jobs:[f.job]});
  return {...f,r,p,source,investigation,evidence,history,file,
    record:()=>recordAutomationDiagnosis({stateRoot:f.stateRoot,evidenceFile:evidence,now}),
    editReview:patch=>{Object.assign(r,patch);atomicJson(evidence,r);}};
}

test('exact investigated VFU failure no longer monopolizes selection, while history and other opportunities remain intact',t=>{
  const f=reviewedVfu(t),before=JSON.stringify(f.job);assert(f.assess().needs_diagnosis);
  const first=f.record();assert.equal(first.status,'recorded');assert.equal(f.record().status,'already_recorded');
  const assessment=f.assess();assert.equal(assessment.state,'reviewed_no_safe_action');assert.equal(assessment.needs_diagnosis,false);
  const stored=JSON.parse(fs.readFileSync(f.file('failure-classifications.json')));
  const {decisions,...kept}=stored.reviews[0];assert.deepEqual(kept,f.history.reviews[0]);assert.deepEqual(stored.reviews[1],f.history.reviews[1]);
  assert.equal(decisions.length,1);assert.equal(JSON.stringify(f.job),before);
  const other={...f.job,id:'other-owner'},o={observed_at:now.toISOString(),automation:{failures:[f.job,other],discovery_gaps:[]},growth:{},failures:[]};
  const original=opportunities(o);f.job.current_assessment=assessment;
  assert.deepEqual(opportunities(o),original.filter(c=>c.id!=='diagnose:'+f.job.id));
  assert.equal(auditObservation(o).unreliable_automations.length,2);
  assert.equal(fs.statSync(f.file('failure-classifications.json')).mode&0o777,0o600);
});

test('new failures, expiry, failing, active or unknown owner outcomes reopen reviewed VFU diagnosis',t=>{
  const f=reviewedVfu(t);f.record();const original=structuredClone(f.row);
  for(const patch of [{last_failure:f.row.last_failure+1},{latest_errors:1},{latest_errors:null},{latest_thrown:1},
    {latest_eligible:1},{latest_sent:1},{latest_reason:'no_eligible'},{latest_reason:null},{cron_expression:'*/30 * * * *'},
    {latest_finished:null},{last_no_error:f.row.last_no_error-1}]) {
    Object.assign(f.row,original,patch);f.save();assert(f.assess().needs_diagnosis,JSON.stringify(patch));
  }
  Object.assign(f.row,original);f.save();
  assert(currentAutomationAssessment(f.job,new Date('2026-09-14T07:30:00Z'),f.stateRoot).needs_diagnosis);
  assert.equal(currentAutomationAssessment({...f.job,id:'other-owner'},now,f.stateRoot).needs_diagnosis,true);
});

test('diagnosis cannot be forged by cached flags, altered investigation, nonprivate evidence or stale receipts',t=>{
  const f=reviewedVfu(t);f.record();
  fs.appendFileSync(f.source,'\n');assert(f.assess().needs_diagnosis);
  atomicJson(f.source,{findings:'Example provider rejects a test domain; no replay performed.'});assert.equal(f.assess().needs_diagnosis,false);
  fs.chmodSync(f.source,0o644);assert(f.assess().needs_diagnosis);fs.chmodSync(f.source,0o600);
  f.job.health.failures_30d=0;assert(f.assess().needs_diagnosis);f.job.health.failures_30d=1;
  const file=f.file('failure-classifications.json'),d=JSON.parse(fs.readFileSync(file));
  d.reviews[0].decisions[0].review.rationale='Forged extension of the old diagnosis to hide a new issue.';atomicJson(file,d);assert(f.assess().needs_diagnosis);
});

test('writer requires a current investigation, preserves immutable decisions and bounds the review period',t=>{
  const f=reviewedVfu(t),original=structuredClone(f.r);
  for(const patch of [{decision:'recovered'},{job_id:'other-owner'},{failure_finished_at_ms:1},{rationale:'ok'},
    {reviewed_at:'2026-09-14T07:01:00Z'},{reviewed_at:'2026-09-14T06:56:00Z'},
    {review_after:'2026-09-15T07:00:00Z'},{review_after:'2026-09-14T06:59:00Z'}]) {
    f.editReview({...original,...patch});assert.throws(f.record,undefined,JSON.stringify(patch));
  }
  f.editReview(original);f.record();f.editReview({review_after:'2026-09-14T08:00:00Z'});assert.throws(f.record,/overwritten|extended/);
  f.editReview(original);atomicJson(f.file('automation-registry.json'),{jobs:[]});assert.throws(f.record,/current job/);
});

test('a later actual investigation can append a renewal without erasing the expired decision',t=>{
  const f=reviewedVfu(t);f.record();
  f.p.checked_at='2026-09-14T07:31:00Z';atomicJson(f.investigation,f.p);
  f.editReview({reviewed_at:'2026-09-14T07:32:00Z',review_after:'2026-09-14T08:00:00Z',
    investigation:{path:'investigation.json',sha256:hash(fs.readFileSync(f.investigation))}});
  // A renewal uses separate evidence files; never overwrite the first proof.
  atomicJson(f.file('renewal.json'),f.p);
  f.editReview({investigation:{path:'renewal.json',sha256:hash(fs.readFileSync(f.file('renewal.json')))}});
  f.p.checked_at='2026-09-14T06:57:00Z';atomicJson(f.investigation,f.p);
  const later=new Date('2026-09-14T07:33:00Z');
  assert.equal(recordAutomationDiagnosis({stateRoot:f.stateRoot,evidenceFile:f.evidence,now:later}).status,'recorded');
  const saved=JSON.parse(fs.readFileSync(f.file('failure-classifications.json')));assert.equal(saved.reviews[0].decisions.length,2);
  assert.equal(currentAutomationAssessment(f.job,later,f.stateRoot).needs_diagnosis,false);
});

test('a new hash and review date cannot renew an old investigation in writes or readback',t=>{
  const f=reviewedVfu(t);f.record();
  atomicJson(f.file('old-investigation-reformatted.json'),{...f.p,note:'Formatting or supplementary text is not a new investigation.'});
  f.editReview({reviewed_at:'2026-09-14T07:32:00Z',review_after:'2026-09-14T08:00:00Z',
    investigation:{path:'old-investigation-reformatted.json',sha256:hash(fs.readFileSync(f.file('old-investigation-reformatted.json')))}});
  const later=new Date('2026-09-14T07:33:00Z');
  assert.throws(()=>recordAutomationDiagnosis({stateRoot:f.stateRoot,evidenceFile:f.evidence,now:later}),/new investigation/);
  const file=f.file('failure-classifications.json'),d=JSON.parse(fs.readFileSync(file));
  d.reviews[0].decisions.push({schema_version:1,id:hash(JSON.stringify([f.r.job_id,f.r.failure_finished_at_ms,f.r.investigation.sha256])),
    recorded_at:later.toISOString(),review_sha256:hash(JSON.stringify(f.r)),review:f.r});
  atomicJson(file,d);assert.equal(currentAutomationAssessment(f.job,later,f.stateRoot).needs_diagnosis,true);
});

test('fresh original inactive monitor removes repeat diagnosis, retaining historical failures and other priorities',t=>{
  const f=fixture(t),before=JSON.stringify(f.job),assessment=f.assess();
  assert.equal(assessment.state,'verified_inactive_monitor');assert.equal(assessment.needs_diagnosis,false);
  assert.equal(assessment.historical_failures_retained,1);assert.equal(JSON.stringify(f.job),before);
  const other={...f.job,id:'cloudflare:simplememo-api:vfu_regular',name:'vfu_regular'};
  const o={observed_at:now.toISOString(),automation:{failures:[f.job,other],discovery_gaps:[]},growth:{},failures:[]};
  const prior=opportunities(o),vfu=prior.find(c=>c.id.endsWith('vfu_regular'));
  f.job.current_assessment=assessment;
  const after=opportunities(o);assert.equal(after.length,1);assert.deepEqual(after[0],vfu);
  const audit=auditObservation(o);assert.equal(audit.unreliable_automations.length,2);
  assert.equal(audit.unreliable_automations[0].state,'errors_observed');assert.equal(f.job.health.failures_30d,1);
});

test('active, skipped, failing, unknown, stale, future or inconsistent results retain diagnosis',t=>{
  const f=fixture(t),original=structuredClone(f.row);
  for(const patch of [{latest_reason:'service_notice_active:example:r1',latest_eligible:1},
    {latest_reason:'daily_cap_reached'},{latest_reason:'service_notice_monitor_unavailable'},
    {latest_errors:1},{latest_errors:null},{latest_errors:false},{latest_thrown:1},
    {latest_eligible:null},{latest_sent:1},{cron_expression:'0 6 * * *'},
    {latest_finished:null},{latest_finished:Date.parse('2026-09-14T05:59:00Z')},
    {last_no_error:Date.parse('2026-09-14T05:59:00Z')},
    {last_failure:Date.parse('2026-09-14T06:00:03Z')},
    {latest_finished:Date.parse('2026-09-14T07:01:00Z'),last_no_error:Date.parse('2026-09-14T07:01:00Z')},
    {last_run:Date.parse('2026-09-14T04:00:00Z'),latest_finished:Date.parse('2026-09-14T04:00:01Z'),last_no_error:Date.parse('2026-09-14T04:00:01Z')}]) {
    Object.assign(f.row,original,patch);f.save();assert.equal(f.assess().needs_diagnosis,true,JSON.stringify(patch));
  }
  Object.assign(f.row,original);f.save();
  assert.equal(currentAutomationAssessment(f.job,new Date('2026-09-14T09:00:00Z'),f.stateRoot).needs_diagnosis,true);
  assert.equal(currentAutomationAssessment(f.job,new Date('2026-09-14T06:58:00Z'),f.stateRoot).needs_diagnosis,true);
  assert.equal(currentAutomationAssessment({...f.job,id:'cloudflare:simplememo-api:vfu_regular'},now,f.stateRoot).needs_diagnosis,true);
});

test('cached flags cannot hide changed source, bad provenance, unsafe files or forged projections',t=>{
  const f=fixture(t);
  f.job.current_observation.latest_results[0].errors=1;assert(f.assess().needs_diagnosis);f.save();
  for(const patch of [{profile:'worker-deploy'},{current_run_evidence_version:true},{raw_sha256:'a'.repeat(64)},
    {observed_at:'2026-09-14T06:58:00Z'},{scope_days:1}]) {
    atomicJson(f.metaFile,{...JSON.parse(fs.readFileSync(f.metaFile)),...patch});assert(f.assess().needs_diagnosis);f.save();
  }
  atomicJson(f.rawFile,[{success:true,results:[{...f.row,latest_errors:1}]}]);assert(f.assess().needs_diagnosis);f.save();
  fs.chmodSync(f.rawFile,0o644);assert(f.assess().needs_diagnosis);fs.chmodSync(f.rawFile,0o600);
  f.job.current_observation.latest_results=[null];assert(f.assess().needs_diagnosis);f.save();
  f.job.last_failure.at='2026-09-14T06:30:00Z';assert(f.assess().needs_diagnosis);f.save();
  fs.unlinkSync(f.metaFile);assert(f.assess().needs_diagnosis);
});

test('extended D1 query preserves every original aggregate and picks one exact latest result',()=>{
  execFileSync('python3',['-c',String.raw`
import importlib.util,sqlite3,time
spec=importlib.util.spec_from_file_location('discovery','scripts/company-discover.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
db.execute('CREATE TABLE cron_run_log(id INTEGER PRIMARY KEY,job_name TEXT,cron_expression TEXT,started_at INTEGER,finished_at INTEGER,eligible INTEGER,sent INTEGER,errors INTEGER,last_error TEXT,reason TEXT)')
n=int(time.time()*1000)
rows=[(1,'service_notice_monitor','0 * * * *',n-90000,n-89999,None,None,1,None,'service_notice_monitor_unavailable'),
 (2,'service_notice_monitor','0 * * * *',n-60000,n-59999,0,0,0,None,'service_notice_inactive'),
 (3,'vfu_regular','0 * * * *',n-90000,n-89999,1,0,0,'Error','failed'),
 (4,'vfu_regular','0 * * * *',n-60000,n-59999,None,None,None,None,'daily_cap_reached'),
 (5,'tie','cron',n-30000,n-29999,1,1,0,None,'first'),
 (6,'tie','cron',n-30000,n-29999,0,0,1,None,'second'),
 (7,'unfinished','cron',n-30000,None,None,None,None,None,None),
 (8,'old','cron',n-40*86400000,n-40*86400000+1,1,1,0,None,'old')]
db.executemany('INSERT INTO cron_run_log VALUES(?,?,?,?,?,?,?,?,?,?)',rows)
legacy='SELECT job_name,cron_expression,COUNT(*) AS runs,MAX(started_at) AS last_run,MAX(CASE WHEN COALESCE(errors,0)=0 AND last_error IS NULL THEN finished_at END) AS last_no_error,MAX(CASE WHEN errors>0 OR last_error IS NOT NULL THEN finished_at END) AS last_failure,SUM(CASE WHEN errors>0 OR last_error IS NOT NULL THEN 1 ELSE 0 END) AS failures,SUM(CASE WHEN sent>0 THEN 1 ELSE 0 END) AS runs_with_output FROM cron_run_log WHERE started_at >= (unixepoch()-2592000)*1000 GROUP BY job_name,cron_expression'
old=[dict(r) for r in db.execute(legacy)];new=[dict(r) for r in db.execute(m.CLOUDFLARE_HEALTH_SQL)]
assert [{k:r[k] for k in old[0]} for r in new]==old
by={r['job_name']:r for r in new}
assert by['service_notice_monitor']['failures']==1 and by['service_notice_monitor']['latest_reason']=='service_notice_inactive'
assert by['tie']['latest_reason']=='second' and by['tie']['latest_errors']==1
assert by['vfu_regular']['latest_errors'] is None and by['unfinished']['latest_finished'] is None
assert 'old' not in by
`],{encoding:'utf8'});
});

test('original registry builder admits current evidence only with matching raw receipt metadata',t=>{
  const f=fixture(t);
  const build=()=>JSON.parse(execFileSync('python3',['-c',String.raw`
import importlib.util,json,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('inventory','scripts/company-inventory.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=m.build(Path(sys.argv[1])/'discovery')
print(json.dumps(next(j for j in r['jobs'] if j['id']=='cloudflare:simplememo-api:service_notice_monitor')))
`,f.stateRoot],{encoding:'utf8'}));
  const job=build();assert.equal(job.health.failures_30d,1);
  assert.equal(currentAutomationAssessment(job,now,f.stateRoot).needs_diagnosis,false);
  fs.appendFileSync(f.rawFile,'\n');assert.equal(build().current_observation,null);
  f.save();atomicJson(f.metaFile,[]);assert.equal(build().current_observation,null);
});
