import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {browserBing,bingView,bingCapture,bingWeek,bingReport,collectBingHandoff} from './company-bing.mjs';
import {bingHash,offsetDay,BING_SITE,BING_REPO,BING_WORKFLOW,collectBingApi} from './bing-webmaster.mjs';
import {seal} from './analytics-envelope.mjs';
const now=new Date('2026-09-14T14:00:00Z');
const temp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bing-test-'));fs.chmodSync(dir,0o700);t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
function observation(root,{at=now,mutate=()=>{}}={}) {
  const dateRows=Array.from({length:28},(_,i)=>({date:offsetDay('2026-08-16',i),clicks:1,impressions:10}));
  const o={schema_version:1,property:BING_SITE,method:'authenticated_visible_browser_ui_dom',origin:'manual',observed_at:at.toISOString(),
    search:{state:'collected',scope:'All',retained_daily_rows:dateRows},
    ai:{state:'collected',daily_rows:dateRows.map(r=>({date:r.date,citations_display:'2',citations_exact:2,cited_pages:1})),displayed_total_citations:'56',grounding_queries:[],pages:[]}};
  mutate(o);const dir=path.join(root,'data/bing-webmaster',bingWeek(at));fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file=path.join(dir,'observed-ui.json');fs.writeFileSync(file,JSON.stringify(o),{mode:0o600});
  fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify({files:[{file:'observed-ui.json',sha256:bingHash(fs.readFileSync(file))}]}),{mode:0o600});return file;
}
test('manual UI evidence is separate from unavailable API and survives rendering',t=>{
  const root=temp(t);observation(root);const v=bingView({stateRoot:root,now});
  assert.equal(v.api.status,'unavailable');assert.equal(v.browser.ai.latest7.citations,14);assert.equal(v.browser.search.latest7.clicks,7);
  assert.equal(v.browser.scheduled_execution_verified,false);assert(bingReport(v).join('\n').includes('Bing AI citations'));
  assert.equal(bingCapture({stateRoot:root,now,action:'begin'}).status,'complete');
});
test('rounded values remain unknown and missing days never become zeros',t=>{
  const root=temp(t);observation(root,{mutate:o=>{o.ai.daily_rows.at(-1).citations_exact=null;o.ai.daily_rows.at(-1).citations_display='1K';o.search.retained_daily_rows.splice(-2,1);}});
  const v=browserBing({stateRoot:root,now});assert.equal(v.ai.latest7.citations,null);assert.equal(v.search.latest7.clicks,null);assert.equal(v.search.latest7.status,'partial');
});
test('tampered, wrong-property, future, stale and malformed browser evidence fail closed',t=>{
  for(const mutate of [o=>o.property='https://other.example/',o=>o.observed_at='2026-09-15T00:00:00Z',o=>o.observed_at='2026-09-01T00:00:00Z']) {
    const root=temp(t);observation(root,{mutate});assert.equal(browserBing({stateRoot:root,now}).status,'unavailable');
  }
  const root=temp(t),file=observation(root);fs.appendFileSync(file,' ');assert.equal(browserBing({stateRoot:root,now}).status,'unavailable');
});
test('reservation, bounded delayed retries and auth blocking persist across ticks',t=>{
  const root=temp(t);let time=now;
  for(let i=0;i<3;i++) {
    const r=bingCapture({stateRoot:root,now:time,action:'begin'});assert.equal(r.status,'reserved');
    assert.equal(bingCapture({stateRoot:root,now:time,action:'begin'}).status,'in_progress');
    assert.throws(()=>bingCapture({stateRoot:root,now:time,action:'fail',attemptId:'wrong',outcome:'provider_transient'}));
    const result=bingCapture({stateRoot:root,now:time,action:'fail',attemptId:r.attempt_id,outcome:'provider_transient'});
    assert.equal(result.status,i<2?'retry_later':'retry_budget_exhausted');time=new Date(+time+7*3600000);
  }
  const authRoot=temp(t),r=bingCapture({stateRoot:authRoot,now,action:'begin'});
  assert.equal(bingCapture({stateRoot:authRoot,now,action:'fail',attemptId:r.attempt_id,outcome:'auth_required'}).status,'auth_required');
  assert.equal(bingCapture({stateRoot:authRoot,now:new Date(+now+8*86400000),action:'begin'}).status,'auth_required');
});
test('complete requires a matching attempt and newer verified output',t=>{
  const root=temp(t),r=bingCapture({stateRoot:root,now,action:'begin'});
  assert.throws(()=>bingCapture({stateRoot:root,now,action:'complete',attemptId:r.attempt_id}));
  observation(root,{at:new Date(+now+1000)});
  assert.throws(()=>bingCapture({stateRoot:root,now:new Date(+now+2000),action:'complete',attemptId:'wrong'}));
  assert.equal(bingCapture({stateRoot:root,now:new Date(+now+2000),action:'complete',attemptId:r.attempt_id}).status,'complete');
  const s=JSON.parse(fs.readFileSync(path.join(root,'data/bing-webmaster/capture-2026-W38.json')));assert.equal(s.attempts[0].status,'verified');
});
test('encrypted provider handoff checks its own job even when GSC workflow failed',async t=>{
  const root=temp(t),keys=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const keyFile=path.join(root,'private.pem');fs.writeFileSync(keyFile,keys.privateKey,{mode:0o600});
  const fetchImpl=async url=>new Response(JSON.stringify(url.endsWith('/token')?{access_token:'test',expires_in:3600}:{d:Array.from({length:28},(_,i)=>({Date:offsetDay('2026-08-16',i),Clicks:1,Impressions:10,Query:url.includes('GetPageStats')?BING_SITE:'test'}))}));
  const p=await collectBingApi({credentials:{client_id:'x',client_secret:'y',refresh_token:'z'},fetchImpl,now});
  const remote={id:123,run_attempt:1,repository:{full_name:BING_REPO},path:BING_WORKFLOW,head_branch:'main',status:'completed',conclusion:'failure',event:'schedule',head_sha:'a'.repeat(40),run_started_at:new Date(+now-60000).toISOString(),updated_at:new Date(+now+60000).toISOString()};
  p.provenance={repository:BING_REPO,workflow:BING_WORKFLOW,run_id:'123',run_attempt:1,source_sha:remote.head_sha,event:'schedule'};
  const envelope=seal(p,keys.publicKey);let downloads=0;
  const run=(cmd,args)=>{
    assert.equal(cmd,'gh');assert(!args.includes('workflow'));
    if(args[0]==='run'){downloads++;fs.writeFileSync(path.join(args[args.indexOf('--dir')+1],'bing-search.enc.json'),JSON.stringify(envelope));return '';}
    const u=args[1];if(u.includes('/workflows/'))return JSON.stringify({workflow_runs:[remote]});
    if(u.includes('/jobs'))return JSON.stringify({jobs:[{name:'Bing search read-only',conclusion:'success'}]});
    return JSON.stringify({artifacts:[{id:2,name:'bing-search-encrypted-123-1',size_in_bytes:4000,expired:false}]});
  };
  const r=collectBingHandoff({stateRoot:root,now:new Date(+now+120000),run,privateKeyFile:keyFile});assert.equal(r.status,'verified');assert.equal(downloads,1);
  const v=bingView({stateRoot:root,now:new Date(+now+120000)});assert.equal(v.api.status,'verified');assert.equal(v.api.scheduled_provider_execution,true);assert.equal(v.api.scheduled_company_execution_verified,false);
  const cached=collectBingHandoff({stateRoot:root,now:new Date(+now+130000),run,privateKeyFile:keyFile});assert.equal(cached.reused,true);assert.equal(downloads,1);
  const altered=JSON.parse(fs.readFileSync(r.output));altered.summary.latest7.clicks=99;fs.writeFileSync(r.output,JSON.stringify(altered));assert.equal(bingView({stateRoot:root,now}).api.status,'unavailable');
});
test('missing provider job retains an explicit unavailable result, never a new dispatch',t=>{
  const root=temp(t);const r=collectBingHandoff({stateRoot:root,now,run:()=>JSON.stringify({workflow_runs:[]})});assert.equal(r.status,'unavailable');assert.equal(r.new_dispatches,0);
});

test('partial UI sources retain the healthy section and retries preserve it',t=>{
  const root=temp(t);observation(root,{mutate:o=>o.search.retained_daily_rows[0].clicks=null});
  const v=browserBing({stateRoot:root,now});assert.equal(v.search.status,'unavailable');assert.equal(v.ai.latest7.citations,14);
  assert(bingReport(bingView({stateRoot:root,now})).join('\n').includes('| Bing AI citations | 14 |'));
  const r=bingCapture({stateRoot:root,now,action:'begin'});assert.deepEqual(r.preserve_sections,['ai']);
  const second=temp(t);observation(second,{mutate:o=>delete o.ai});
  assert.equal(browserBing({stateRoot:second,now}).search.latest7.clicks,7);
});
test('a held capture mutation lock prevents completion or failure races',t=>{
  const root=temp(t),r=bingCapture({stateRoot:root,now,action:'begin'});
  const lock=path.join(root,'data/bing-webmaster/capture.lock');fs.writeFileSync(lock,'');
  assert.equal(bingCapture({stateRoot:root,now,action:'fail',attemptId:r.attempt_id,outcome:'auth_required'}).status,'busy');
  assert.equal(bingCapture({stateRoot:root,now}).status,'in_progress');
});
test('confirmed authentication recovery persists after its observation becomes stale',t=>{
  const root=temp(t),r=bingCapture({stateRoot:root,now,action:'begin'});
  bingCapture({stateRoot:root,now,action:'fail',attemptId:r.attempt_id,outcome:'auth_required'});
  const recovered=new Date(+now+1000);observation(root,{at:recovered});
  assert.equal(bingCapture({stateRoot:root,now:recovered,action:'begin'}).status,'complete');
  const auth=JSON.parse(fs.readFileSync(path.join(root,'data/bing-webmaster/capture-auth.json')));assert.equal(auth.resolved_at,recovered.toISOString());
  assert.equal(bingCapture({stateRoot:root,now:new Date('2026-09-20T14:05:00Z')}).status,'due');
  assert.equal(bingCapture({stateRoot:root,now:new Date(+now+8*86400000),action:'begin'}).status,'reserved');
});
test('JST week rollover retains a running owner and can close its original attempt',t=>{
  const root=temp(t),sunday=new Date('2026-09-13T14:59:00Z'),monday=new Date('2026-09-13T15:01:00Z');
  const r=bingCapture({stateRoot:root,now:sunday,action:'begin'});assert.equal(r.week,'2026-W37');
  const blocked=bingCapture({stateRoot:root,now:monday,action:'begin'});assert.equal(blocked.status,'in_progress');assert.equal(blocked.attempt_id,r.attempt_id);
  observation(root,{at:monday});
  assert.equal(bingCapture({stateRoot:root,now:monday,action:'complete',attemptId:r.attempt_id}).status,'complete');
  const old=JSON.parse(fs.readFileSync(path.join(root,'data/bing-webmaster/capture-2026-W37.json')));assert.equal(old.attempts[0].status,'verified');
  const second=temp(t),r2=bingCapture({stateRoot:second,now:sunday,action:'begin'});
  assert.equal(bingCapture({stateRoot:second,now:monday,action:'fail',attemptId:r2.attempt_id,outcome:'provider_transient'}).status,'prior_week_attempt_closed');
  assert.equal(bingCapture({stateRoot:second,now:monday,action:'begin'}).status,'reserved');
});

test('a capture saved before midnight can complete its original week after rollover',t=>{
  const root=temp(t),start=new Date('2026-09-13T14:58:00Z'),saved=new Date('2026-09-13T14:59:00Z'),end=new Date('2026-09-13T15:01:00Z');
  const r=bingCapture({stateRoot:root,now:start,action:'begin'});observation(root,{at:saved});
  const done=bingCapture({stateRoot:root,now:end,action:'complete',attemptId:r.attempt_id});assert.equal(done.status,'complete');assert.equal(done.week,'2026-W37');assert.equal(done.current_week,'2026-W38');
  assert.equal(bingCapture({stateRoot:root,now:end,action:'begin'}).status,'reserved');
});
