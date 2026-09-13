import test from 'node:test';
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
import { summarizeGa4 } from './company-review.mjs';
import { verifyMergedChange, verifyNativeIntegration,verifyPublishedArtifact,verifyOperationalDelivery,verifyIntegrationLedger,verifyActionDelivery } from './company-proof.mjs';

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'company-test-')); fs.chmodSync(dir, 0o700);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir;
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

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
  assert.equal(result.status,'partial');assert.equal(result.receipts[0].source,'asc');assert.equal(result.failures.length,2);
  assert.equal(fs.readdirSync(path.join(stateRoot,'data/collection-events')).length,1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateRoot,'data/latest-collection.json'))).failures.length,2);
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
