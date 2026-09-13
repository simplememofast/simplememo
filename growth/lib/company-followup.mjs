import fs from 'node:fs';
import path from 'node:path';
import { atomicJson, privateState } from './company-loop.mjs';

export function startOperationalFollowup({stateRoot,integrationRun,now=new Date()}) {
  const file=path.join(privateState(stateRoot),'operational-experiments.json');
  const doc=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)): {schema_version:1,experiments:[]};
  const id='appsflyer-native-consumer-'+integrationRun;
  if(doc.experiments.some(e=>e.id===id)) return doc;
  doc.experiments.push({id,hypothesis:'The existing native daily owner can select the source window, collect and validate the original AppsFlyer report without a separate human request.',
    evidence:['data/collection-receipts','scheduler-integration.json',integrationRun],action:'Integrate original reader into existing daily owner',
    date:now.toISOString(),affected_area:'acquisition analytics operations',baseline:{manual_start:'documented original reader workflow',touch_count:null,reason:'Historical touch frequency was not separately observed'},
    primary_kpi:'verified native pipeline invocations / observed native pipeline invocations',secondary_kpi:['daily coverage','failed reads','recorded human touches'],
    guardrails:['unchanged credential and report population','no duplicate same-window API call','no missing data rewritten as zero','source failures remain visible'],
    expected_impact:'Remove a separate manual collection request while retaining source quality',actual_impact:null,
    evaluation_date:new Date(now.getTime()+7*86400000).toISOString(),status:'RUNNING',decision:null,learnings:[],
    minimum_distinct_native_days:7,source:'private operational follow-up; existing content/value-contract ledgers remain canonical',integration_run:integrationRun});
  atomicJson(file,doc);return doc;
}

export function evaluateOperationalFollowup(experiment,events,now=new Date()) {
  if(Date.parse(experiment.evaluation_date)>now.getTime() || ['WIN','LOSS','ROLLED_BACK'].includes(experiment.status)) return {...experiment,due:false};
  const eligible=events.filter(e=>Date.parse(e.observed_at)>=Date.parse(experiment.date)&&Date.parse(e.observed_at)<=now.getTime()&&e.native_origin?.state==='native_execution_record'&&e.native_origin.automation_id==='obsidian');
  const byThread=new Map(eligible.map(e=>[e.native_origin.thread_id,e]));
  const observed=[...byThread.values()];
  const days=new Set(observed.map(e=>new Date(Date.parse(e.observed_at)+9*3600000).toISOString().slice(0,10)));
  const verified=observed.filter(e=>e.receipts.find(r=>r.source==='appsflyer')?.receipt.status==='verified').length;
  const enough=days.size>=experiment.minimum_distinct_native_days;
  const rate=observed.length?verified/observed.length:null;
  return {...experiment,due:true,status:!enough?'INCONCLUSIVE':rate>=.95?'WIN':'LOSS',
    decision:!enough?'collect_more_native_evidence':rate>=.95?'KEEP':'ITERATE',
    actual_impact:{observed_native_runs:observed.length,verified_native_runs:verified,distinct_days:days.size,rate,
      full_parent_zero_touch_rate:null,scope:'pipeline subprocess; parent-session intervention is not inferred'},
    last_evaluated:now.toISOString(),learnings:[!enough?'Insufficient natural invocation days; manual bootstrap does not fill the gap.':'Evaluate failures and source changes before extending the scope.']};
}

export function followUp({stateRoot,now=new Date()}) {
  const file=path.join(privateState(stateRoot),'operational-experiments.json');
  if(!fs.existsSync(file))return {status:'no_operational_followup_registered',experiments:[]};
  const dir=path.join(stateRoot,'data/collection-events');
  const events=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f)))):[];
  const doc=JSON.parse(fs.readFileSync(file));
  doc.experiments=doc.experiments.map(e=>evaluateOperationalFollowup(e,events,now));
  atomicJson(file,doc);return doc;
}
