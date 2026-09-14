import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {atomicJson,privateState,opportunities,auditObservation} from './company-loop.mjs';
import {currentAutomationAssessment} from './company-automation-health.mjs';

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
