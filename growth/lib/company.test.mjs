import test from 'node:test';
import './company-search.test.mjs';
import './daily-gsc-handoff.test.mjs';
import './company-native-evidence.test.mjs';
import './company-mentions.test.mjs';
import './company-automation-health.test.mjs';
import './company-aio.test.mjs';
import './company-cta-measurement.test.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import { boundedRead, privateState, acquireLock, cadenceKey, prioritize, experimentView } from './company-loop.mjs';
import { collectionWindow, collectAppsFlyer, verifyAppsFlyer, collectAnalytics, connectionView, collectData, collectAsc } from './company-data.mjs';
import { formalMetrics, compareMetrics, humanTouchMetrics } from './company-metrics.mjs';
import { nativeOrigin } from './company-origin.mjs';
import { evaluateOperationalFollowup } from './company-followup.mjs';
import { growthFollowups, registerGrowthFollowup, evaluateGrowthFollowup } from './company-growth-followup.mjs';
import { gscBaseline, gscScope } from './experiment-evidence.mjs';
import { recordCommand, recordHumanTouch, observabilityStatus } from './company-observability.mjs';
import { summarizeGa4 } from './company-review.mjs';
import { verifyMergedChange, verifyNativeIntegration,verifyPublishedArtifact,verifyOperationalDelivery,verifyIntegrationLedger,verifyActionDelivery } from './company-proof.mjs';

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'company-test-')); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir;
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('Growth follow-ups preserve original decisions, remain pending with time, and admit only the registered mature cohort', t => {
  const root=directory(t), now=new Date('2026-09-13T11:00:00Z');
  const parent={id:'search-1',status:'evaluated',decision:'inconclusive',evaluated_at:'2026-09-01',
    page:'/example',type:'title_test',started_at:'2026-08-01',target_metric:'ctr',
    baseline:{clicks:20,impressions:100,ctr:.2,position:5,window:'2026-07-01..2026-07-28'},min_sample:{metric:'clicks',threshold:10}};
  parent.evidence={kind:'gsc_comparison',source:'gsc',target_metric:parent.target_metric,baseline:gscBaseline(parent),scope:gscScope(parent)};
  const original=JSON.stringify(parent);
  const args={stateRoot:root,experimentId:parent.id,evaluationDate:'2026-10-14',postStart:'2026-09-14',postEnd:'2026-10-11',rationale:'Recheck with a separate mature window',now,experiments:[parent]};
  const registered=registerGrowthFollowup(args);
  assert.equal(registerGrowthFollowup(args).id,registered.id);
  assert.equal(growthFollowups({stateRoot:root,now}).reviews.length,1);
  assert.equal(growthFollowups({stateRoot:root,now}).reviews[0].due,false);
  assert.throws(()=>registerGrowthFollowup({...args,postEnd:'2026-10-10'}),/window length/);
  assert.throws(()=>registerGrowthFollowup({...args,evaluationDate:'2026-10-15'}),/active review/);
  assert.throws(()=>registerGrowthFollowup({...args,experiments:[{...parent,min_sample:null}]}),/sample floor/);
  assert.throws(()=>registerGrowthFollowup({...args,experiments:[{...parent,baseline:{...parent.baseline,impressions:null}}]}),/numeric|impressions/);
  assert.throws(()=>registerGrowthFollowup({...args,experiments:[{...parent,page:'/other'}]}),/scope/);
  const later=new Date('2026-10-14T11:00:00Z');
  assert.equal(growthFollowups({stateRoot:root,now:later}).reviews[0].status,'RUNNING');
  assert.equal(growthFollowups({stateRoot:root,now:later}).reviews[0].due,true);
  const snapshot=path.join(root,'snapshot');fs.mkdirSync(snapshot);
  const write=(name,value)=>fs.writeFileSync(path.join(snapshot,name+'.json'),JSON.stringify(value));
  write('meta',{period_start:'2026-09-14',period_end:'2026-10-11',search_type:'WEB',time_zone:'America/Los_Angeles'});
  write('dates',Array.from({length:28},(_,i)=>({date:new Date(Date.parse('2026-09-14')+i*86400000).toISOString().slice(0,10),clicks:1,impressions:10,position:5})));
  write('pages',[{page:'/wrong',clicks:3,impressions:100,position:5}]);
  const evaluate={stateRoot:root,id:registered.id,snapshotDirectory:snapshot,decision:'inconclusive',rationale:'Read the scope and overlapping changes',now:later};
  const before=fs.readFileSync(path.join(root,'growth-followups.json'),'utf8');
  assert.throws(()=>evaluateGrowthFollowup({...evaluate,now}),/due/);
  assert.throws(()=>evaluateGrowthFollowup(evaluate),/matching measurement row/);
  assert.equal(fs.readFileSync(path.join(root,'growth-followups.json'),'utf8'),before);
  write('pages',[{page:'/example',clicks:3,impressions:100,position:5}]);
  assert.throws(()=>evaluateGrowthFollowup({...evaluate,decision:'keep'}),/sample/);
  write('meta',{period_start:'2026-09-13',period_end:'2026-10-10'});
  assert.throws(()=>evaluateGrowthFollowup(evaluate),/registered follow-up window/);
  write('meta',{period_start:'2026-09-14',period_end:'2026-10-11'});
  const result=evaluateGrowthFollowup(evaluate);
  assert.equal(result.status,'EVALUATED');assert.equal(result.decision,'inconclusive');
  assert.equal(result.evidence.post.clicks,3);assert.equal(result.parent.decision,'inconclusive');
  assert.equal(JSON.stringify(parent),original);
  assert.throws(()=>evaluateGrowthFollowup(evaluate),/due/);
  assert.equal(fs.statSync(path.join(root,'growth-followups.json')).mode&0o077,0);
  const doc=JSON.parse(fs.readFileSync(path.join(root,'growth-followups.json')));doc.reviews[0].parent.baseline.impressions=50;
  fs.writeFileSync(path.join(root,'growth-followups.json'),JSON.stringify(doc));
  assert.throws(()=>growthFollowups({stateRoot:root,now}),/integrity/);
});

test('Growth registration rejects backdated windows, immature dates and non-comparable legacy experiments',t=>{
  const root=directory(t),now=new Date('2026-09-13T11:00:00Z');
  const args={stateRoot:root,experimentId:'cta',evaluationDate:'2026-10-14',postStart:'2026-09-14',postEnd:'2026-10-11',rationale:'Review',now,experiments:[{id:'cta',status:'evaluated',decision:'measurement_failed',target_metric:'app_store_clicks'}]};
  assert.throws(()=>registerGrowthFollowup(args),/measured GSC/);
  assert.throws(()=>registerGrowthFollowup({...args,postStart:'2026-09-13'}),/future window/);
  assert.throws(()=>registerGrowthFollowup({...args,evaluationDate:'2026-10-12'}),/maturity/);
  assert.throws(()=>registerGrowthFollowup({...args,postEnd:'2026-02-31'}),/calendar date/);
});

test('one corrupt follow-up store does not hide the other source result',t=>{
  const root=directory(t);
  const run=()=>JSON.parse(execFileSync(process.execPath,['scripts/company-os.mjs','follow-up','--state-root',root],{encoding:'utf8'}));
  fs.writeFileSync(path.join(root,'operational-experiments.json'),'{broken');
  let result=run();assert.equal(result.growth.reviews.length,0);assert.equal(result.operational,null);
  assert.deepEqual(result.failures.map(f=>f.source),['operational_followup']);
  fs.unlinkSync(path.join(root,'operational-experiments.json'));
  fs.writeFileSync(path.join(root,'growth-followups.json'),'{broken');
  result=run();assert.equal(result.status,'no_operational_followup_registered');assert.equal(result.growth,null);
  assert.deepEqual(result.failures.map(f=>f.source),['growth_followup']);
});

test('command telemetry retains partial states and unknown parent touches/cost without promoting a command to H0',t=>{
  const root=directory(t),now=new Date('2026-09-13T12:00:00Z');
  const base={stateRoot:root,command:'collect',startedAt:'2026-09-13T11:59:58Z',durationMs:2000,origin:{state:'not_a_recorded_automation_run'},now};
  const r=recordCommand({...base,result:{status:'partial',failures:[{source:'gsc'}]}});
  assert.equal(r.execution_state,'returned');assert.equal(r.result_status,'partial');assert.equal(r.source_failures,1);
  assert.equal(r.parent_human_touches,null);assert.equal(r.cost.parent_model_usd,null);
  recordCommand({...base,failed:true});
  let status=observabilityStatus({stateRoot:root});assert.equal(status.command_invocations,2);assert.equal(status.failed_commands,1);
  assert.equal(status.native_component_invocations,0);assert.equal(status.zero_touch_completion_rate,null);
  assert.equal(status.cost_per_shipped_improvement_usd,null);assert.equal(status.elapsed_ms,4000);
  assert.throws(()=>recordCommand({...base,durationMs:-1}),/measurement/);
  fs.writeFileSync(path.join(root,'command-events','broken.json'),'{bad');
  status=observabilityStatus({stateRoot:root});assert.equal(status.command_invocations,2);assert.equal(status.failures.length,1);
});

test('reported human events are positive-only, immutable, evidenced and deduplicated',t=>{
  const root=directory(t),file=path.join(root,'source.txt');fs.writeFileSync(file,'synthetic test approval, not a production event');
  const args={stateRoot:root,eventId:'message-1',runId:'run-1',stage:'execute',kind:'approval',evidenceFile:file,occurredAt:'2026-09-13T11:00:00Z',now:new Date('2026-09-13T12:00:00Z')};
  recordHumanTouch(args);recordHumanTouch(args);
  let status=observabilityStatus({stateRoot:root});assert.equal(status.reported_human_touches.approval,1);
  assert.equal(status.stage_observations.execute.reported_human_touches,1);assert.equal(status.human_touches_per_successful_output,null);
  assert.throws(()=>recordHumanTouch({...args,kind:'manual_start'}),/different evidence/);
  assert.throws(()=>recordHumanTouch({...args,occurredAt:'2026-09-14T00:00:00Z'}),/nonfuture/);
  fs.writeFileSync(file,'different evidence');assert.throws(()=>recordHumanTouch(args),/different evidence/);
  assert.equal(fs.statSync(path.join(root,'human-touch-events','message-1.json')).mode&0o077,0);
});

test('browser inventory is scoped and expires; reused native IDs cannot hide missing owners', () => {
  execFileSync('python3', ['-c', `
import copy, datetime as dt, importlib.util, json, tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory','scripts/company-inventory.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
now=dt.datetime.now(dt.timezone.utc)
receipt={'schema_version':1,'method':'authenticated_visible_browser_ui','account_scope':'SimpleMemo','identity_verified':True,
 'observed_at':now.isoformat(),'chatgpt_tasks':{'url':'https://chatgpt.com/scheduled','filters':{k:{'state':'observed','visible_count':0} for k in ['active','paused','completed']}},
 'gcp':{'project':'yurika-simplememo','cloud_scheduler':{'state':'service_disabled','retained_definitions':'unknown'}}}
assert m.browser_observation(receipt,now)['chatgpt_empty']
assert not m.browser_observation(receipt,now+dt.timedelta(days=8))['chatgpt_empty']
assert not m.browser_observation(receipt,now-dt.timedelta(seconds=1))['chatgpt_empty']
for field,value in [('account_scope','another account'),('identity_verified',False),('observed_at','invalid'),('method','API')]:
 bad=copy.deepcopy(receipt);bad[field]=value;assert not m.browser_observation(bad,now)['chatgpt_empty']
for kind in ['active','paused','completed']:
 bad=copy.deepcopy(receipt);del bad['chatgpt_tasks']['filters'][kind];assert not m.browser_observation(bad,now)['chatgpt_empty']
 for count in [1,False,None]:
  bad=copy.deepcopy(receipt);bad['chatgpt_tasks']['filters'][kind]['visible_count']=count;assert not m.browser_observation(bad,now)['chatgpt_empty']
bad=copy.deepcopy(receipt);bad['gcp']['project']='another';assert not m.browser_observation(bad,now)['gcp']
assert m.documented_owner_matches({'name':'SimpleMemo funnel','schedule':'FREQ=DAILY','trigger':['heartbeat']},r'funnel')
assert not m.documented_owner_matches({'name':'SimpleMemo funnel','schedule':'FREQ=DAILY;COUNT=1','trigger':['heartbeat']},r'funnel')
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp)
 (p/'browser-inventory.json').write_text(json.dumps(receipt))
 (p/'codex.json').write_text(json.dumps({'automations':[{'id':'simplememo','name':'Authentication reminder','kind':'heartbeat','rrule':'FREQ=DAILY;COUNT=1','status':'PAUSED'}]}))
 (p/'gcp-schedules.json').write_text(json.dumps({'scheduler_inventory':{'project':'yurika-simplememo','status':'partial','services':{'scheduler':{'issues':[{'reason':'SERVICE_DISABLED'}]},'transfers':{'issues':[{'reason':'IAM_PERMISSION_DENIED'}]}}}}))
 registry=m.build(p);gaps={g['id']:g for g in registry['known_gaps']}
 assert 'chatgpt-current' not in gaps
 assert gaps['codex-simplememo']['id_present'] and gaps['codex-simplememo']['state']=='identity_unverified'
 assert gaps['gcp-schedulers']['evidence']['transfers'][0]['reason']=='IAM_PERMISSION_DENIED'
 assert gaps['gcp-schedulers']['browser_observation']['cloud_scheduler']['retained_definitions']=='unknown'
 assert next(j for j in registry['jobs'] if j['id']=='report:chatgpt-reddit')['execution_state']=='historically_paused_not_in_current_account_views'
 assert next(j for j in registry['jobs'] if j['id']=='codex:simplememo')['execution_state']=='PAUSED'
 for broken in ['[]','null','{invalid']:
  (p/'browser-inventory.json').write_text(broken)
  partial=m.build(p)
  assert any(g['id']=='chatgpt-current' for g in partial['known_gaps'])
  assert any(j['id']=='codex:simplememo' for j in partial['jobs'])
  assert next(s for s in partial['discovery_surfaces'] if s['id']=='browser-inventory.json')['reason']=='invalid_or_unreadable_receipt'
`], { cwd: path.resolve(import.meta.dirname, '../..'), stdio: 'pipe' });
});

test('compact GA4 retains scope, missing counts and union semantics and weights rates by sessions',()=>{
  const base={landing_scope:'production',session_channel:'Organic Search',sessions_with_cta_impression:1,sessions_with_own_app_click_24h:1,sessions_with_onelink_click_24h:1,sessions_with_any_app_route_click_24h:1,sessions_with_onelink_qa_click_24h:0};
  const reports=[{file:'ga4-funnel.sql',result:[{...base,observed_started_sessions:1},{...base,observed_started_sessions:'99'},{...base,landing_scope:'missing_landing_page',observed_started_sessions:5,sessions_with_cta_impression:null}]}];
  const s=summarizeGa4(reports),rows=s.by_landing_scope_and_session_channel;
  assert.equal(rows.length,2);assert.equal(rows[0].observed_started_sessions,100);assert.equal(rows[0].own_app_click_session_rate_24h,.02);
  assert.equal(rows[0].sessions_with_any_app_route_click_24h,2);assert.equal(rows[1].sessions_with_cta_impression,null);
  assert.equal(s.quality_by_hostname_scope,null);assert.equal(summarizeGa4(null),null);
  reports.push({file:'ga4-quality.sql',result:[{hostname_scope:'production',event_date:'20260909',recorded_events:1},{hostname_scope:'production',event_date:'20260906',recorded_events:2}]});
  assert.deepEqual(summarizeGa4(reports).quality_observed_event_dates,['20260906','20260909']);
  assert.equal(summarizeGa4(reports).quality_rows_without_valid_date,0);
  reports[0].result[0].observed_started_sessions='';assert.equal(summarizeGa4(reports).by_landing_scope_and_session_channel[0].observed_started_sessions,null);
});

test('mature windows use the source timezone and preserve existing lag', () => {
  const now = new Date('2026-09-13T05:00:00Z');
  assert.deepEqual(collectionWindow('gsc', now), { start: '2026-08-13', end: '2026-09-09' });
  assert.deepEqual(collectionWindow('ga4-funnel', now), { start: '2026-09-06', end: '2026-09-08' });
  assert.deepEqual(collectionWindow('appsflyer', now), { start: '2026-08-16', end: '2026-09-12' });
  assert.throws(() => collectionWindow('arbitrary_paid_query', now));
  assert.throws(() => collectionWindow('ga4-funnel', new Date('2026-09-07T00:00:00Z')));
});

test('transient reads heal within cap; credentials never retry', async () => {
  let n = 0;
  const healed = await boundedRead(async () => { if (++n < 3) throw { status: 503 }; return 'ok'; }, { sleep: async () => {} });
  assert.equal(healed.value, 'ok'); assert.equal(healed.attempts, 3); assert.equal(healed.events.length, 2);
  n = 0;
  const blocked = await boundedRead(async () => { n++; throw { status: 403, message: 'must not leak a private server response' }; });
  assert.equal(n, 1); assert.equal(blocked.failure, 'permission_or_credential');
  assert(!JSON.stringify(blocked).includes('private server'));
  await assert.rejects(() => boundedRead(() => {}, { attempts: 4 }));
});

test('private state cannot resolve into Git through an ancestor symlink', t => {
  const base = directory(t), git = path.join(base, 'checkout'); fs.mkdirSync(git, { mode: 0o700 }); fs.mkdirSync(path.join(git, '.git'));
  fs.symlinkSync(git, path.join(base, 'alias'));
  assert.throws(() => privateState(path.join(base, 'alias', 'data')), /Git/);
  const unsafe = path.join(base, 'world-readable'); fs.mkdirSync(unsafe, { mode: 0o755 });
  assert.throws(() => privateState(unsafe), /0700/);
});

test('a live owner prevents duplicate execution, malformed locks do not heal by age', t => {
  const base = directory(t), release = acquireLock(base);
  assert.equal(acquireLock(base), null); release();
  fs.writeFileSync(path.join(base, 'master-loop.lock'), JSON.stringify({ pid: -1, at: '2000-01-01' }));
  assert.throws(() => acquireLock(base), /Unverified/);
});

test('denominator pruning never appears as an operating improvement', () => {
  const before = formalMetrics();
  const after = structuredClone(before);
  after.scope_fingerprint = 'changed'; after.task_cohort.pop();
  after.metrics.find(m => m.id === 'overall_automation_rate').value = 1;
  const comparison = compareMetrics(before, after);
  assert.equal(comparison.removed_tasks.length, 1);
  assert.equal(comparison.metrics.find(m => m.id === 'overall_automation_rate').delta, null);
  assert.equal(comparison.baseline_cohort_automation.denominator, before.task_cohort.filter(t => t.executor !== 'intentional_no').length);
  assert.equal(comparison.existing_human_tasks_transferred.length, 0);
});

test('human starts count distinct runs and unobserved handoffs stay unknown', () => {
  const value = humanTouchMetrics({ runs: [{ attempted: true, outcome: 'shipped', interventions: [{ kind: 'bootstrap' }, { kind: 'request' }] },
    { attempted: true, outcome: 'shipped' }] });
  assert.equal(value.manual_starts, 1); assert.equal(value.unknown_successes, 1);
  assert.equal(value.recorded_zero_touch_completion_rate, null);
  assert.equal(value.human_blocked_runs, null);
});

test('permission gates outrank high scores; legacy keep is not invented WIN', () => {
  const factors = Object.fromEntries(['frequency','human_time_saved','manual_touches','reversibility','safety','ease','reliability','business_impact','growth_impact','reuse','affordability','permission_readiness'].map(k => [k, 100]));
  const values = prioritize([{ id: 'paid-release', permission: 'APPROVAL', executable: true, factors },
    { id: 'safe-reader', permission: 'AUTO', executable: true, factors: { ...factors, growth_impact: 40 } }]);
  assert.equal(values[0].id, 'safe-reader'); assert.equal(values[1].priority, null);
  assert.equal(experimentView({ id: 'x', status: 'evaluated', decision: 'keep' }, '2026-09-13').status, 'INCONCLUSIVE');
  assert.equal(cadenceKey('weekly', new Date('2026-09-13T16:00:00Z')), '2026-09-14');
  assert.equal(cadenceKey('monthly', new Date('2026-09-30T16:00:00Z')), '2026-10');
});

test('existing AppsFlyer reader is reused once, verifies artifact and detects tampering', async t => {
  const stateRoot = directory(t); let network = 0;
  const run = (name, args) => {
    if (name === 'git') return args[0] === 'rev-parse' ? 'a'.repeat(40) : '# existing reviewed reader';
    assert.equal(name, 'python3'); network++;
    const dest = path.join(args.at(-1), 'run'); fs.mkdirSync(dest, { mode: 0o700 });
    const csv = 'Date,Installs\n2026-09-12,3\n'; fs.writeFileSync(path.join(dest, 'report.csv'), csv);
    fs.writeFileSync(path.join(dest, 'result.json'), JSON.stringify({ ok: true, http_status: 200,
      parameters: { from: args[2], to: args[4] }, quality: { sha256: hash(csv), row_cap_hit: false } }));
    return JSON.stringify({ ok: true, output: dest });
  };
  const options = { stateRoot, now: new Date('2026-09-13T05:00:00Z'), run };
  const first = await collectAppsFlyer(options); assert.equal(first.status, 'verified');
  const second = await collectAppsFlyer(options); assert.equal(second.reused, true); assert.equal(network, 1);
  fs.appendFileSync(path.join(first.output, 'report.csv'), 'tampered');
  assert.throws(() => verifyAppsFlyer(first.output));
  await assert.rejects(() => collectAppsFlyer(options)); assert.equal(network, 1);
});

test('uncertain Analytics dispatch is resumed by identity, never resubmitted', t => {
  const stateRoot = directory(t), receipts = path.join(stateRoot, 'data/collection-receipts');
  fs.mkdirSync(receipts, { recursive: true, mode: 0o700 });
  const file = path.join(receipts, 'ga4-funnel-2026-09-08.json');
  fs.writeFileSync(file, JSON.stringify({ source: 'ga4-funnel', status: 'dispatch_uncertain', request_tag: 'known-request', window: { start: '2026-09-06', end: '2026-09-08' } }));
  let calls = 0;
  const run = (name, args) => { calls++; assert.equal(name, 'gh'); assert.deepEqual(args.slice(0, 2), ['run', 'list']); return '[]'; };
  const result = collectAnalytics({ stateRoot, run, now: new Date('2026-09-14T05:00:00Z') });
  assert.equal(calls, 1); assert.equal(result.lookup_state, 'not_visible_yet');
  assert.equal(JSON.parse(fs.readFileSync(file)).request_tag, 'known-request');
  assert.equal(fs.existsSync(path.join(receipts,'ga4-funnel-2026-09-09.json')),false);
});

test('manual labels and missing native rows cannot attest a scheduled run',()=>{
  assert.equal(nativeOrigin({env:{}}).state,'unverified');
  assert.equal(nativeOrigin({env:{CODEX_THREAD_ID:'a'.repeat(36)},call:()=> 'null'}).state,'not_a_recorded_automation_run');
  assert.equal(nativeOrigin({env:{CODEX_THREAD_ID:'a'.repeat(36)},call:()=>{throw Error('unavailable');}}).state,'unverified');
  const thread='a'.repeat(36),env={CODEX_THREAD_ID:thread};
  const row={thread_id:thread,automation_id:'obsidian',state:'completed',original_turn_id:'original',latest_turn:{turn_id:'original',state:'completed'},gate_receipt:{admitted:true,turn_id:'original'}};
  assert.equal(nativeOrigin({env,call:()=>JSON.stringify(row)}).state,'unverified');
  row.state='in_progress';row.latest_turn={turn_id:'manual-followup',state:'in_progress'};
  assert.equal(nativeOrigin({env,call:()=>JSON.stringify(row)}).state,'unverified');
  row.latest_turn.turn_id='original';
  assert.equal(nativeOrigin({env,call:()=>JSON.stringify(row)}).state,'native_execution_record');
});

test('simultaneous stale-lock recovery admits one owner and release is ownership-safe',async t=>{
  const stateRoot=directory(t);
  const gone=Number(execFileSync(process.execPath,['-e','process.stdout.write(String(process.pid))'],{encoding:'utf8'}));
  fs.writeFileSync(path.join(stateRoot,'master-loop.lock'),JSON.stringify({pid:gone}));
  const program=`import {acquireLock} from ${JSON.stringify(new URL('./company-loop.mjs',import.meta.url).href)};process.stdin.once('data',()=>{const release=acquireLock(${JSON.stringify(stateRoot)});console.log(release?'owned':'busy');setTimeout(()=>{if(release){release();release();}process.exit(0);},400);});console.log('ready');`;
  const children=[0,1].map(()=>spawn(process.execPath,['--input-type=module','-e',program],{stdio:['pipe','pipe','pipe']}));
  t.after(()=>children.forEach(c=>c.kill()));
  const outputs=['',''];
  await Promise.all(children.map((c,i)=>new Promise((resolve,reject)=>{c.on('error',reject);c.stdout.on('data',d=>{outputs[i]+=d; if(outputs[i].includes('ready'))resolve();});})));
  const exits=children.map(c=>new Promise((resolve,reject)=>c.on('exit',code=>code===0?resolve():reject(Error('lock child failed')))));
  children.forEach(c=>c.stdin.write('go\n'));await Promise.all(exits);
  assert.equal(outputs.filter(o=>o.includes('owned')).length,1);
  assert.equal(outputs.filter(o=>o.includes('busy')).length,1);
  assert.equal(fs.existsSync(path.join(stateRoot,'master-loop.lock')),false);
});

test('corrupt aggregate does not erase independent source receipts',async t=>{
  const stateRoot=directory(t);
  const result=await collectData({stateRoot,operations:[['appsflyer',()=>{throw Error('corrupt CSV');}],['asc',()=>({status:'reused_existing_outputs'})]],makeConnections:()=>{throw Error('broken view');}});
  assert.equal(result.status,'partial');assert.equal(result.receipts[0].source,'asc');
  assert.deepEqual(result.failures.map(f=>f.source),['appsflyer','connection_view','cta_measurement']);
  assert.equal(fs.readdirSync(path.join(stateRoot,'data/collection-events')).length,1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stateRoot,'data/latest-collection.json'))).failures,result.failures);
});

test('AppsFlyer connection corruption is isolated from the ASC view',t=>{
  const stateRoot=directory(t),dir=path.join(stateRoot,'data/collection-receipts');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dir,'appsflyer-2026-09-12.json'),JSON.stringify({source:'appsflyer',window:{end:'2026-09-12'},status:'verified',output:path.join(stateRoot,'missing-csv')}));
  const result=connectionView({stateRoot});assert.equal(result.appsflyer.status,'BLOCKED');assert.equal(result.app_store_connect.status,'PARTIAL');
});

test('ASC refresh failure retains outputs as stale instead of reporting them current',t=>{
  const stateRoot=directory(t);let calls=0;
  const result=collectAsc({stateRoot,run:(name,args)=>{calls++;assert.deepEqual(args,['fetch','origin','main']);throw Error('network unavailable');}});
  assert.equal(result.status,'stale');assert.equal(calls,1);assert.equal(result.previous_outputs_retained,true);
});

test('a stale deployed page cannot pass on HTTP 200 alone',async()=>{
  const call=()=>'<html>new</html>';
  const remote=body=>async()=>({ok:true,url:'https://simplememofast.com/example/',text:async()=>body});
  await assert.rejects(()=>verifyPublishedArtifact('/example/','sha',call,remote('<html>old</html>')),/differs/);
  const proof=await verifyPublishedArtifact('/example/','sha',call,remote('<html>new</html>'));
  assert.equal(proof.artifact_source,'example/index.html');
});

test('a saved integration and open PR are not execution success',()=>{
  assert.throws(()=>verifyMergedChange(1,()=>JSON.stringify({state:'OPEN',baseRefName:'main'})),/not merged/);
  assert.throws(()=>verifyNativeIntegration(()=>JSON.stringify({status:'ACTIVE',integration_present:false})),/not persisted/);
  assert.throws(()=>verifyNativeIntegration(()=>JSON.stringify({status:'PAUSED',integration_present:true,rrule:'FREQ=DAILY;BYHOUR=6;BYMINUTE=0;BYSECOND=0'})),/not persisted/);
});

test('operational delivery requires exact Pages deployment and fresh public status while scripts stay blocked',async()=>{
  const merge={merge_sha:'merged'};
  let head='merged',body='new status',internalStatus=404;
  const call=(name)=>name==='gh'?JSON.stringify({check_runs:[{id:1,name:'Cloudflare Pages',status:'completed',conclusion:'success',head_sha:head}]}):'new status';
  const remote=async url=>url.includes('/scripts/')?{status:internalStatus}:{ok:true,url,text:async()=>body};
  const proof=await verifyOperationalDelivery(merge,call,remote);
  assert.equal(proof.artifact_source,'data/autopilot-status.json');assert.equal(proof.internal_script_status,404);
  assert.equal((await verifyActionDelivery(null,merge,call,remote)).artifact_source,'data/autopilot-status.json');
  await assert.rejects(()=>verifyActionDelivery(undefined,merge,call,remote),/same-site artifact/);
  body='old status';await assert.rejects(()=>verifyOperationalDelivery(merge,call,remote),/differs/);
  body='new status';internalStatus=200;await assert.rejects(()=>verifyOperationalDelivery(merge,call,remote),/publication boundary/);
  internalStatus=404;head='different';await assert.rejects(()=>verifyOperationalDelivery(merge,call,remote),/exact-commit/);
});

test('integration proof rejects historical or mismatched ledger rows and retains the human request',()=>{
  const merge={pr:1306,merge_sha:'merged',merged_at:'2026-09-13T06:53:42Z'};
  const receipt={bound_autopilot_run_id:'new-run',origin:'goal',started_at:'2026-09-13T05:00:00Z',prior_autopilot_run_ids:[]};
  let row={run_id:'new-run',route:'owner-session',pr:1306,attempted:true,outcome:'shipped',interventions:[{kind:'request'}]},old=[];
  const call=(name,args)=>JSON.stringify({runs:args[1].includes('^:')?old:[row]});
  assert.equal(verifyIntegrationLedger(receipt,merge,call).human_interventions[0].kind,'request');
  old=[row];assert.throws(()=>verifyIntegrationLedger(receipt,merge,call),/did not introduce/);
  old=[];row={...row,route:'actions'};assert.throws(()=>verifyIntegrationLedger(receipt,merge,call),/does not match/);
  assert.throws(()=>verifyIntegrationLedger({...receipt,prior_autopilot_run_ids:['new-run']},merge,call),/new actual run/);
});

test('only the checked final PR SHA can finish; another successful SHA cannot',()=>{
  const call=(name,args)=>args[0]==='pr'?JSON.stringify({state:'MERGED',baseRefName:'main',mergedAt:'2026-09-13T00:00:00Z',mergeCommit:{oid:'merge'},headRefOid:'final',files:[]}):JSON.stringify([{headSha:'previous',event:'pull_request',status:'completed',conclusion:'success'}]);
  assert.throws(()=>verifyMergedChange(1,call),/Exact final/);
});

test('follow-up cannot turn elapsed time or manual bootstraps into natural execution evidence',()=>{
  const e={date:'2026-09-01T00:00:00Z',evaluation_date:'2026-09-08T00:00:00Z',status:'RUNNING',minimum_distinct_native_days:7};
  const manual=Array.from({length:7},(_,i)=>({observed_at:`2026-09-0${i+1}T00:00:00Z`,native_origin:{state:'not_a_recorded_automation_run'},receipts:[{source:'appsflyer',receipt:{status:'verified'}}]}));
  const result=evaluateOperationalFollowup(e,manual,new Date('2026-09-13T00:00:00Z'));
  assert.equal(result.status,'INCONCLUSIVE');assert.equal(result.actual_impact.rate,null);
  assert.equal(evaluateOperationalFollowup(e,[],new Date('2026-09-02T00:00:00Z')).due,false);
  const native=manual.map((r,i)=>({...r,native_origin:{state:'native_execution_record',automation_id:'obsidian',thread_id:String(i)}}));
  assert.equal(evaluateOperationalFollowup(e,native,new Date('2026-09-13T00:00:00Z')).status,'WIN');
  native[0].receipts[0].receipt.status='failed';
  assert.equal(evaluateOperationalFollowup(e,native,new Date('2026-09-13T00:00:00Z')).status,'LOSS');
});
