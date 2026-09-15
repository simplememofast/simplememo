import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {appleAdsConnection} from './company-connection-evidence.mjs';
import {recordAppleAdsObservation} from './company-connection-observations.mjs';
import {atomicJson,acquireLock} from './company-loop.mjs';
const now=new Date('2026-09-13T12:25:00Z');
const receipt={schema_version:1,method:'authenticated_visible_browser_ui',account_scope:'SimpleMemo',identity_verified:true,
  provider:'AppsFlyer',app_id:'id6758438948',url:'https://hq1.appsflyer.com/discovery/overview',observed_at:'2026-09-13T12:24:00Z',
  attribution_state:'active',cost_state:'invalid_credentials',cost_last_sync:'Never'};
const appURL='https://hq1.appsflyer.com/marketplace/integrated-partners/id6758438948/iossearchads_int';
test('an active attribution integration with invalid cost credentials stays partial with unknown cost',()=>{
  const r=appleAdsConnection(receipt,now);
  assert.equal(r.status,'PARTIAL'); assert.equal(r.cost_integration_state,'invalid_credentials');
  assert.equal(r.cost,null); assert.equal(r.data_verified,false); assert.equal(r.cost_last_sync,'Never');
  assert.equal(appleAdsConnection({...receipt,cost_state:'connected'},now).data_verified,false);
});
test('the exact SimpleMemo Apple Ads detail page admits the same partial evidence as the overview',()=>{
  assert.deepEqual(appleAdsConnection({...receipt,url:appURL},now),appleAdsConnection(receipt,now));
  const connected=appleAdsConnection({...receipt,url:appURL,cost_state:'connected'},now);
  assert.equal(connected.status,'PARTIAL'); assert.equal(connected.cost,null); assert.equal(connected.data_verified,false);
});
test('lookalike origins, another app or partner, and unrelated settings pages cannot supply this evidence',()=>{
  for(const url of [appURL.replace('https:','http:'),appURL.replace('hq1.','hq2.'),
    appURL.replace('appsflyer.com','appsflyer.com.example.com'),
    appURL.replace('id6758438948','id0000000000'),appURL.replace('iossearchads_int','other_int'),
    `${appURL}?app_id=id0000000000`,`${appURL}/extra`,
    'https://hq1.appsflyer.com/cost-settings/overview','https://hq1.appsflyer.com/account-settings/myplan']) {
    assert.equal(appleAdsConnection({...receipt,url},now).status,'BLOCKED',url);
  }
});
test('other identities, future/stale observations and malformed states cannot establish a connection',()=>{
  for (const url of [receipt.url,appURL]) for (const patch of [{app_id:'other'},{account_scope:'other'},
    {identity_verified:false},{provider:'other'},{method:'unverified'},{url:'https://example.com'},
    {observed_at:'2026-09-14T00:00:00Z'},{observed_at:'2026-09-01T00:00:00Z'},{observed_at:null},{observed_at:{toString:null,valueOf:null}},
    {attribution_state:'invented'},{cost_state:'success'}]) assert.equal(appleAdsConnection({...receipt,url,...patch},now).status,'BLOCKED');
  for(const r of [null,[],{}])assert.equal(appleAdsConnection(r,now).status,'BLOCKED');
});

const observed={...receipt,url:appURL,cost_state:'unknown',cost_status_observed:'No data',
  mutations_performed:false,cost_entitlement_verified:false,limitations:['UI configuration only; no data receipt.']};
function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'company-apple-observation-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data'),{mode:0o700});
  const put=(name,value)=>atomicJson(path.join(root,name),value);
  const get=name=>JSON.parse(fs.readFileSync(path.join(root,name)));
  const old={...observed,observed_at:'2026-09-13T12:23:00Z'};
  put('data/apple-ads-configuration.json',old);
  put('data/connections.json',{schema_version:1,updated_at:'2026-09-13T12:00:00Z',
    apple_search_ads:appleAdsConnection(old,now),ga4:{status:'PARTIAL',missing_sessions:27},
    search_console:{window:{start:'2026-08-15',end:'2026-09-12'},clicks:42}});
  put('observation.json',observed);
  const record=options=>recordAppleAdsObservation({stateRoot:root,evidenceFile:'observation.json',now,...options});
  return {root,put,get,record};
}
test('the existing configuration mapper receives an audited observation without changing other sources or claiming cost',t=>{
  const f=fixture(t),before=f.get('data/connections.json');
  const r=f.record();assert.equal(r.status,'recorded');assert.equal(r.formal_credit,0);
  assert.equal(r.connection.status,'PARTIAL');assert.equal(r.connection.cost,null);assert.equal(r.connection.data_verified,false);
  const after=f.get('data/connections.json');assert.deepEqual({...after,apple_search_ads:before.apple_search_ads},before);
  assert.deepEqual(after.apple_search_ads,appleAdsConnection(observed,now));
  const retained=f.get(r.evidence);assert.deepEqual(JSON.parse(retained.input_utf8),observed);
  assert.equal(crypto.createHash('sha256').update(retained.input_utf8).digest('hex'),retained.input_sha256);
  assert.equal(fs.statSync(path.join(f.root,r.evidence)).mode&0o777,0o600);
});
test('adopting an already retained canonical observation repairs its cached view and replays idempotently',t=>{
  const f=fixture(t);f.put('data/apple-ads-configuration.json',observed);
  const r=f.record({evidenceFile:'data/apple-ads-configuration.json'});
  assert.equal(r.status,'recorded');const bytes=fs.readFileSync(path.join(f.root,r.evidence),'utf8');
  const again=f.record({evidenceFile:'data/apple-ads-configuration.json'});
  assert.equal(again.status,'already_recorded');assert.equal(again.id,r.id);
  assert.equal(fs.readFileSync(path.join(f.root,r.evidence),'utf8'),bytes);
  assert.deepEqual(f.get('data/connections.json').apple_search_ads,appleAdsConnection(observed,now));
});
test('older observations cannot replace a newer view and conflicting same-time reports fail closed',t=>{
  const f=fixture(t);f.record();const config=f.get('data/apple-ads-configuration.json'),cache=f.get('data/connections.json');
  f.put('observation.json',{...observed,observed_at:'2026-09-13T12:23:30Z'});
  assert.equal(f.record().status,'superseded');
  f.put('observation.json',{...observed,attribution_state:'inactive'});assert.throws(()=>f.record(),/same-time/);
  assert.deepEqual(f.get('data/apple-ads-configuration.json'),config);assert.deepEqual(f.get('data/connections.json'),cache);
});
test('interrupted config or cache writes recover from the same immutable input without creating another observation',t=>{
  for(const target of ['data/apple-ads-configuration.json','data/connections.json']) {
    const f=fixture(t);let failed=false;
    assert.throws(()=>f.record({writeJson(file,value){
      if(file===path.join(fs.realpathSync(f.root),target) && !failed){failed=true;throw Error('simulated write interruption');}
      atomicJson(file,value);
    }}),/simulated write interruption/);
    const records=path.join(f.root,'data/connection-observations/apple-search-ads');
    assert.equal(fs.readdirSync(records).length,1);
    const r=f.record();assert.equal(r.status,'already_recorded');
    assert.equal(fs.readdirSync(records).length,1);
    assert.deepEqual(f.get('data/connections.json').apple_search_ads,appleAdsConnection(observed,now));
  }
});
test('invalid scope, freshness, mutations, entitlement and invented cost data produce no configuration update',t=>{
  const f=fixture(t),before=f.get('data/apple-ads-configuration.json');
  for(const patch of [{identity_verified:false},{app_id:'id0000000000'},{provider:'other'},
    {observed_at:'2026-09-14T00:00:00Z'},{observed_at:'2026-09-01T00:00:00Z'},
    {observed_at:'2026-09-13 12:24:00'},{mutations_performed:true},{cost_entitlement_verified:true},
    {cost:123},{cost_state:'connected'},{url:appURL+'?other=1'}]) {
    f.put('observation.json',{...observed,...patch});assert.throws(()=>f.record());
    assert.deepEqual(f.get('data/apple-ads-configuration.json'),before);
  }
  assert.equal(fs.existsSync(path.join(f.root,'data/connection-observations')),false);
});
test('public files, symlinks and outside-root input cannot enter the private observation history',t=>{
  const f=fixture(t),input=path.join(f.root,'observation.json');
  fs.chmodSync(input,0o644);assert.throws(()=>f.record(),/owned private/);fs.chmodSync(input,0o600);
  fs.symlinkSync(input,path.join(f.root,'link.json'));assert.throws(()=>f.record({evidenceFile:'link.json'}),/owned private/);
  const other=fixture(t);assert.throws(()=>f.record({evidenceFile:path.join(other.root,'observation.json')}),/owned private/);
});
test('invalid UTF-8 and a BOM cannot lose original bytes and strand future retries',t=>{
  const f=fixture(t),before=f.get('data/apple-ads-configuration.json'),cache=f.get('data/connections.json');
  const malformed=Buffer.from(JSON.stringify({...observed,limitations:['byte-sentinel']}));
  malformed[malformed.indexOf(Buffer.from('byte-sentinel'))]=0x80;
  for(const bytes of [malformed,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(observed))])]) {
    fs.writeFileSync(path.join(f.root,'observation.json'),bytes,{mode:0o600});assert.throws(()=>f.record());
    assert.deepEqual(f.get('data/apple-ads-configuration.json'),before);
    assert.deepEqual(f.get('data/connections.json'),cache);
    assert.equal(fs.existsSync(path.join(f.root,'data/connection-observations')),false);
  }
});
test('a corrupt cache or a newer cached observation cannot be silently replaced',t=>{
  const f=fixture(t),before=f.get('data/apple-ads-configuration.json');
  f.put('data/connections.json',{schema_version:0});assert.throws(()=>f.record(),/valid existing connection/);
  f.put('data/connections.json',{schema_version:1,apple_search_ads:{observed_at:'2026-09-13T12:24:30Z'}});
  assert.throws(()=>f.record(),/newer cached observation/);
  assert.deepEqual(f.get('data/apple-ads-configuration.json'),before);
  assert.equal(fs.existsSync(path.join(f.root,'data/connection-observations')),false);
});
test('a busy existing collection lock leaves both views unchanged',t=>{
  const f=fixture(t),before=f.get('data/connections.json'),release=acquireLock(f.root,'data-collection.lock');
  try {assert.deepEqual(f.record(),{status:'busy'});} finally {release();}
  assert.deepEqual(f.get('data/connections.json'),before);
  assert.equal(fs.existsSync(path.join(f.root,'data/connection-observations')),false);
});
test('a dangling cache link is rejected before either canonical view is changed',t=>{
  const f=fixture(t),before=f.get('data/apple-ads-configuration.json');
  fs.unlinkSync(path.join(f.root,'data/connections.json'));
  fs.symlinkSync(path.join(f.root,'missing.json'),path.join(f.root,'data/connections.json'));
  assert.throws(()=>f.record(),/owned private/);
  assert.deepEqual(f.get('data/apple-ads-configuration.json'),before);
  assert.equal(fs.existsSync(path.join(f.root,'data/connection-observations')),false);
});
test('tampered retained source bytes are rejected instead of rewriting audit history',t=>{
  const f=fixture(t),r=f.record(),d=f.get(r.evidence),before=f.get('data/connections.json');
  f.put(r.evidence,{...d,input_utf8:d.input_utf8+' '});assert.throws(()=>f.record(),/retained observation bytes/);
  assert.deepEqual(f.get('data/connections.json'),before);
});
test('an observation can be retained before the first connection view exists',t=>{
  const f=fixture(t);fs.unlinkSync(path.join(f.root,'data/connections.json'));
  const r=f.record();assert.equal(r.cached_view_updated,false);
  assert.equal(fs.existsSync(path.join(f.root,'data/connections.json')),false);
  assert.deepEqual(appleAdsConnection(f.get('data/apple-ads-configuration.json'),now),r.connection);
});

test('the observation CLI records successful, repeated and rejected handoffs without claiming a company run',t=>{
  const f=fixture(t),fresh={...observed,observed_at:new Date(Date.now()-1000).toISOString()};
  f.put('observation.json',fresh);
  const call=()=>spawnSync(process.execPath,['scripts/company-os.mjs','record-apple-ads-observation',
    '--state-root',f.root,'--evidence','observation.json'],{
    cwd:path.resolve(import.meta.dirname,'../..'),encoding:'utf8'
  });
  const events=()=>fs.readdirSync(path.join(f.root,'command-events')).map(file=>f.get('command-events/'+file));
  const results=[];
  for(const status of ['recorded','already_recorded']) {
    const run=call();assert.equal(run.status,0,run.stderr);
    assert.equal(run.stderr,'');
    const result=JSON.parse(run.stdout);results.push(result);
    assert.equal(result.status,status);assert.equal(result.formal_credit,0);
    assert.equal(result.connection.status,'PARTIAL');assert.equal(result.connection.cost,null);
    assert.equal(result.connection.data_verified,false);assert.equal(result.observed_at,fresh.observed_at);
  }
  assert.equal(results[0].id,results[1].id);
  assert.equal(fs.readdirSync(path.join(f.root,'data/connection-observations/apple-search-ads')).length,1);
  const returned=events();assert.equal(returned.length,2);
  for(const result of results) {
    const event=returned.find(e=>e.result_status===result.status);assert(event);
    assert.equal(event.execution_state,'returned');
    assert.equal(event.result_sha256,crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex'));
  }
  f.put('observation.json',{...fresh,provider:'other'});
  const failed=call();assert.notEqual(failed.status,0);
  assert.doesNotMatch(failed.stderr,/Company command observation could not be saved/);
  const all=events();assert.equal(all.length,3);
  assert.equal(all.filter(e=>e.execution_state==='failed').length,1);
  for(const event of all) {
    assert.equal(event.command,'record-apple-ads-observation');assert.equal(event.company_run_id,null);
    assert.equal(event.parent_zero_touch_completion,null);assert.equal(event.cost.parent_model_usd,null);
    assert(Object.values(event.stages).every(stage=>stage.state==='not_observed' && stage.human_touches===null));
  }
  assert.deepEqual(f.get('data/apple-ads-configuration.json'),fresh);
});
