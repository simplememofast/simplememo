import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {saveReview} from './company-review.mjs';
import {businessCoverage,businessTaskId,businessPolicy} from './business-automation.mjs';

const now=new Date('2026-10-01T01:00:00Z');
function setup(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'business-review-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const formal={scope_fingerprint:'synthetic',metrics:[],task_cohort:[],sources:{},calculated_at:now.toISOString()};
 fs.writeFileSync(path.join(root,'metrics-baseline.json'),JSON.stringify(formal),{mode:0o600});
 return {root,o:{formal_metrics:formal,growth:{connections:{},experiments:[]},human_touches:{manual_starts:null},automation:{failures:[],discovery_gaps:[]}}};
}
const payload=root=>JSON.parse(fs.readFileSync(path.join(root,'reviews/weekly-2026-09-28.json')));

test('existing weekly review preserves missing runtime, human cost and auxiliary evidence, and rereads stay quiet',t=>{
 const {root,o}=setup(t),first=saveReview(o,{stateRoot:root,cadence:'weekly',now});
 const p=payload(root),text=fs.readFileSync(first.markdown,'utf8');
 assert.equal(p.business_automation.inventory.overall.defined,192);
 assert.equal(p.business_automation.actual.verified_full_automation_rate,null);
 assert.equal(p.business_automation.actual.unknown_tasks,192);
 assert.equal(p.business_automation.current_goal.minimum_automated_tasks,179);
 assert.equal(p.business_automation.current_goal.threshold,.93);
 assert.equal(p.business_automation.current_goal.scope.matches_target_scope,true);
 assert.equal(p.business_automation.current_goal.state,'runtime_unverified');
 assert.equal(p.human_work.company_human_minutes,null);assert.equal(p.outcome_autonomy.total,null);
 assert.equal(p.business_weekly.sustained_above_target,false);assert.equal(p.business_work_plan.inventory.nonexecution,28);
 assert.match(text,/baseline unknown minutes; actual unknown minutes/);assert.match(text,/full automation unknown/);
 assert.match(text,/USD unknown; JPY unknown/);assert.match(text,/unknown\/100/);
 assert.match(text,/at least 93%.*fixed 192 tasks and same 11 exclusions/);
 assert.equal(fs.existsSync(path.join(root,'business-automation/weekly.svg')),true);
 for(const file of [first.markdown,path.join(root,'business-automation/weekly.json'),path.join(root,'business-automation/weekly.svg')])assert.equal(fs.statSync(file).mode&0o077,0);
 const second=saveReview(o,{stateRoot:root,cadence:'weekly',now:new Date(now.getTime()+60000)});
 assert.equal(second.notification,'quiet');assert.equal(payload(root).business_weekly.new_runtime_measurement,false);
});
test('weekly report reads a current-policy 179-of-192 observation without treating one week as four',t=>{
 const {root,o}=setup(t),window={from:'2026-09-04',through:'2026-10-01'};
 fs.mkdirSync(path.join(root,'data'),{mode:0o700});
 const doc={schema_version:1,policy_id:businessPolicy().policy_id,window,
  observation:{kind:'runtime_source_snapshot',at:'2026-10-01T00:59:00Z',evidence_ref:'synthetic-fixed-source'},
  review:{kind:'human',at:'2026-10-01T00:59:30Z',evidence_ref:'synthetic-fixed-review'},
  scope:{company_wide_complete:true,evidence_ref:'synthetic-corporate-scope'},
  tasks:businessCoverage().tasks.filter(t=>t.executor!=='intentional_no').map((task,i)=>({
   task_id:businessTaskId(task),state:'observed',evidence_ref:'synthetic-output-'+i,source_window:window,
   trigger_evidence_ref:'synthetic-trigger-'+i,human_activity_evidence_ref:'synthetic-human-coverage-'+i,
   last_occurrence_at:'2026-10-01T00:58:00Z',occurrences:1,trigger_coverage_complete:true,human_activity_coverage_complete:true,
   human_touches:i<179?0:1,ai_used:true,origin:i<179?'scheduled':'manual',all_occurrences_succeeded:true,safety_passed:true,
   stages:Object.fromEntries(['detect','decide','execute','verify','report','learn'].map(k=>[k,i<179?'agent':'human']))}))};
 fs.writeFileSync(path.join(root,'data/business-automation-observations.json'),JSON.stringify(doc),{mode:0o600});
 const r=saveReview(o,{stateRoot:root,cadence:'weekly',now}),p=payload(root);
 assert.equal(p.business_automation.actual.verified_full_tasks,179);
 assert.equal(p.business_automation.current_goal.one_window_qualified,true);
 assert.equal(p.business_weekly.sustained_above_target,false);
 assert.equal(p.business_automation.actual.cost.usd_total,null);assert.equal(p.business_automation.actual.burden.actual_minutes_total,null);
 assert.match(fs.readFileSync(r.markdown,'utf8'),/Required full tasks: 179.*goal state: one_window_at_target; sustained: unverified/);
});
test('weekly degradation keeps historical evidence and reports current unknown work separately',t=>{
 const {root,o}=setup(t);fs.mkdirSync(path.join(root,'data'),{mode:0o700});
 const file=path.join(root,'data/business-automation-observations.json');
 const window={from:'2026-09-04',through:'2026-10-01'};
 const doc={schema_version:1,window,observation:{kind:'runtime_source_snapshot',at:'2026-10-01T00:20:00Z',evidence_ref:'synthetic-window'},
  review:{kind:'human',at:'2026-10-01T00:30:00Z',evidence_ref:'synthetic-review'},tasks:[{
   task_id:businessTaskId(businessCoverage().tasks.find(t=>t.executor!=='intentional_no')),state:'observed',evidence_ref:'synthetic-output',
   source_window:window,trigger_evidence_ref:'synthetic-trigger',human_activity_evidence_ref:'synthetic-human-coverage',
   last_occurrence_at:'2026-10-01T00:00:00Z',occurrences:1,trigger_coverage_complete:true,human_activity_coverage_complete:true,
   human_touches:1,ai_used:true,origin:'manual',all_occurrences_succeeded:false,safety_passed:true,
   stages:Object.fromEntries(['detect','decide','execute','verify','report','learn'].map(k=>[k,'agent']))}]};
 fs.writeFileSync(file,JSON.stringify(doc),{mode:0o600});saveReview(o,{stateRoot:root,cadence:'weekly',now});
 assert.equal(payload(root).business_automation.actual.diagnostics.failed_tasks,1);
 assert.equal(payload(root).business_automation.actual.diagnostics.human_intervened_tasks,1);
 fs.unlinkSync(file);const r=saveReview(o,{stateRoot:root,cadence:'weekly',now});const p=payload(root);
 assert.equal(p.business_automation.actual.state,'NO_EVIDENCE');assert.equal(p.business_weekly.retained_prior_measurement,true);
 assert.equal(p.business_weekly.point.actual.state,'PARTIAL_EVIDENCE');assert.equal(p.business_weekly.current_read.unknown_tasks,192);
 assert.equal(p.business_weekly.sustained_above_target,false);assert.match(fs.readFileSync(r.markdown,'utf8'),/Current read remains separate/);
});
test('human timing CLI returns only a safe acknowledgement, with no original metadata',t=>{
 const {root}=setup(t),taskId=businessTaskId(businessCoverage().tasks.find(t=>t.executor!=='intentional_no'));
 const occurredAt=new Date(Date.now()-120000).toISOString(),measuredAt=new Date(Date.now()-60000).toISOString();
 const file=path.join(root,'synthetic-timing.json');
 fs.writeFileSync(file,JSON.stringify({schema_version:1,kind:'observed_human_work',event_id:'private-event',run_id:'private-run',task_id:taskId,
  stage:'verify',touch_kind:'manual_verification',occurred_at:occurredAt,duration_minutes:1,measured_at:measuredAt,measurement:'observed'}),{mode:0o600});
 const bytes=execFileSync(process.execPath,['scripts/company-os.mjs','record-human-touch','--state-root',root,
  '--event','private-event','--run','private-run','--task',taskId,'--stage','verify','--kind','manual_verification',
  '--occurred-at',occurredAt,'--minutes','1','--measured-at',measuredAt,'--evidence',file],{encoding:'utf8'});
 const r=JSON.parse(bytes);assert.equal(r.measured_minutes,1);assert.equal(r.runtime_completion_credit,0);
 for(const secret of [root,'private-event','private-run','synthetic-timing.json','sha256',taskId])assert.equal(bytes.includes(secret),false);
});
