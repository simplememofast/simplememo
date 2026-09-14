import test from 'node:test';
import assert from 'node:assert/strict';
import {apiDay,normalizeBing,summarizeBingDays,collectBingApi,validateBingPayload,BING_METHODS,BING_SITE,offsetDay} from './bing-webmaster.mjs';

const now=new Date('2026-09-14T14:00:00Z');
const creds={client_id:'fixture-client',client_secret:'private-client-secret',refresh_token:'private-refresh-token'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const daily=()=>Array.from({length:28},(_,i)=>({Date:offsetDay('2026-08-16',i),Clicks:i+1,Impressions:(i+1)*10}));
const fixture=(method)=>({d:method===BING_METHODS[0]?daily():daily().map(r=>({...r,Query:method==='GetPageStats'?BING_SITE+'test':'test query',AvgClickPosition:2,AvgImpressionPosition:4}))});
function service({overrides={}}={}) {
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});const method=new URL(url).pathname.split('/').at(-1);
    if(overrides[method])return overrides[method](calls.filter(c=>c.url===url).length);
    return method==='token'?reply({access_token:'ephemeral-access',expires_in:3600}):reply(fixture(method));
  };return {calls,fetchImpl};
}
test('provider dates, invalid dates, null counts and duplicate rows stay explicit',()=>{
  assert.equal(apiDay('/Date(1789171200000+0000)/'),'2026-09-12');
  for(const d of ['2026-02-30','yesterday',null])assert.throws(()=>apiDay(d));
  for(const Clicks of [null,'1',-1,Infinity])assert.throws(()=>normalizeBing(BING_METHODS[0],{d:[{Date:'2026-09-12',Clicks,Impressions:10}]}));
  assert.throws(()=>normalizeBing(BING_METHODS[0],{d:[daily()[0],daily()[0]]}),/duplicate/);
  assert.throws(()=>normalizeBing('SubmitUrl',{d:[]}),/schema/);
  assert.throws(()=>normalizeBing('GetPageStats',{d:[{...daily()[0],Query:'https://other.example/'}]}),/wrong_site/);
});
test('window comparisons require every date and use summed counts for CTR',()=>{
  const rows=normalizeBing(BING_METHODS[0],fixture(BING_METHODS[0]));
  const result=summarizeBingDays(rows);assert.equal(result.status,'complete');assert.equal(result.clicks,175);assert.equal(result.ctr,0.1);
  const missing=summarizeBingDays(rows.filter(r=>r.date!=='2026-09-09'));assert.equal(missing.clicks,null);assert.deepEqual(missing.missing_dates,['2026-09-09']);
  const zeros=summarizeBingDays(rows.map(r=>({...r,clicks:0,impressions:0})));assert.equal(zeros.clicks,0);assert.equal(zeros.ctr,null);
});
test('Bing -1 click positions preserve dimension rows and counts without inventing a rank',()=>{
  for(const method of ['GetQueryStats','GetPageStats'])for(const Clicks of [0,3]){
    const row={Date:'2026-09-12',Clicks,Impressions:10,Query:method==='GetPageStats'?BING_SITE+'test':'test query',AvgClickPosition:-1,AvgImpressionPosition:4};
    const [normalized]=normalizeBing(method,{d:[row]});
    assert.equal(normalized.avg_click_position,null);assert.equal(normalized.avg_impression_position,4);
    assert.equal(normalized.clicks,Clicks);assert.equal(normalized.impressions,10);
    for(const value of [-2,'-1',NaN,Infinity])assert.throws(()=>normalizeBing(method,{d:[{...row,AvgClickPosition:value}]}),/invalid_position/);
    assert.throws(()=>normalizeBing(method,{d:[{...row,AvgImpressionPosition:-1}]}),/invalid_position/);
    assert.throws(()=>normalizeBing(method,{d:[{...row,Clicks:-1}]}),/invalid_count/);
  }
});
test('unavailable click positions survive collection and canonical payload validation',async()=>{
  const missing=method=>reply({d:fixture(method).d.map(row=>({...row,AvgClickPosition:-1}))});
  const s=service({overrides:{GetQueryStats:()=>missing('GetQueryStats'),GetPageStats:()=>missing('GetPageStats')}});
  const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,now});
  assert.equal(p.status,'collected');
  for(const method of ['GetQueryStats','GetPageStats']){
    assert.equal(p.sources[method].rows.length,28);
    assert(p.sources[method].rows.every(row=>row.avg_click_position===null));
  }
  validateBingPayload(p,{now});
  const tampered=structuredClone(p);tampered.sources.GetQueryStats.rows[0].avg_click_position=-1;
  assert.throws(()=>validateBingPayload(tampered,{now}),/noncanonical_rows/);
});
test('refresh followed by only three read methods, with no credentials in output or URLs',async()=>{
  const s=service();const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,wait:async()=>{},now});
  assert.equal(p.status,'collected');assert.equal(s.calls.length,4);
  assert.equal(new URLSearchParams(s.calls[0].opts.body).get('grant_type'),'refresh_token');
  for(const call of s.calls.slice(1)){assert.equal(call.opts.method,'GET');assert.equal(call.opts.redirect,'error');assert.equal(call.opts.headers.Authorization,'Bearer ephemeral-access');assert.equal(new URL(call.url).searchParams.get('siteUrl'),BING_SITE);}
  const out=JSON.stringify(p);for(const secret of [...Object.values(creds),'ephemeral-access'])assert(!out.includes(secret));
  for(const {url} of s.calls)assert(!url.includes('secret')&&!url.includes('token='));
  validateBingPayload(p,{now});
});
test('429 and 503 retry at most three times; successful independent methods continue',async()=>{
  const s=service({overrides:{GetQueryStats:n=>n<3?reply({error:'do not retain'},503):reply(fixture('GetQueryStats')),GetPageStats:()=>reply({},429)}});
  const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,wait:async()=>{},now});
  assert.equal(p.sources.GetQueryStats.status,'collected');assert.equal(p.sources.GetPageStats.status,'unavailable');
  assert.equal(s.calls.filter(c=>c.url.includes('GetPageStats')).length,3);assert.equal(p.status,'partial');
  assert(!JSON.stringify(p).includes('do not retain'));validateBingPayload(p,{now});
});
test('401 never loops and prevents further authenticated API reads',async()=>{
  const s=service({overrides:{GetRankAndTrafficStats:()=>reply({error:'secret response'},401)}});
  const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,wait:async()=>{},now});
  assert.equal(s.calls.length,2);assert.equal(p.sources.GetRankAndTrafficStats.reason,'auth_required');assert.equal(p.status,'partial');
  assert.throws(()=>validateBingPayload(p,{now}),/stale_provider_data/);
});
test('token revocation, changed refresh token and missing configuration stop before data reads',async()=>{
  const revoked=service({overrides:{token:()=>reply({error:'invalid_grant'},400)}});
  await assert.rejects(collectBingApi({credentials:creds,fetchImpl:revoked.fetchImpl,wait:async()=>{},now}),/auth_required/);assert.equal(revoked.calls.length,1);
  const rotated=service({overrides:{token:()=>reply({access_token:'private-access',expires_in:3600,refresh_token:'new-private-refresh'})}});
  await assert.rejects(collectBingApi({credentials:creds,fetchImpl:rotated.fetchImpl,now}),/refresh_rotation_required/);assert.equal(rotated.calls.length,1);
  await assert.rejects(collectBingApi({credentials:{},fetchImpl:()=>assert.fail('must not fetch')}),/not_configured/);
});
test('oversized and malformed responses are not admitted',async()=>{
  const s=service({overrides:{GetQueryStats:()=>new Response('x',{headers:{'content-length':String(9*1024**2)}}),GetPageStats:()=>reply({d:[{Date:'2026-09-12',Clicks:null,Impressions:3,Query:BING_SITE}]})}});
  const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,wait:async()=>{},now});
  assert.equal(p.sources.GetQueryStats.reason,'response_too_large');assert.equal(p.sources.GetPageStats.reason,'invalid_count');
});
test('altered aggregate, future data and wrong source provenance are rejected',async()=>{
  const s=service();const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,now});
  const altered=structuredClone(p);altered.summary.latest7.clicks=0;assert.throws(()=>validateBingPayload(altered,{now}),/summary_mismatch/);
  const future=structuredClone(p);future.observed_at='2026-09-15T00:00:00Z';assert.throws(()=>validateBingPayload(future,{now}),/future/);
  const other=structuredClone(p);other.site='https://other.example/';assert.throws(()=>validateBingPayload(other,{now}),/wrong_source/);
  assert.throws(()=>validateBingPayload(p,{now,remote:{}}),/provenance/);
});

test('a body transport failure retries, while altered status cannot promote partial data',async()=>{
  const s=service({overrides:{GetQueryStats:n=>n===1?new Response(new ReadableStream({start(c){c.error(new Error('private transport details'));}})):reply(fixture('GetQueryStats')),GetPageStats:()=>reply({},503)}});
  const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,wait:async()=>{},now});
  assert.equal(p.sources.GetQueryStats.status,'collected');assert.equal(s.calls.filter(c=>c.url.includes('GetQueryStats')).length,2);
  p.status='collected';assert.throws(()=>validateBingPayload(p,{now}),/inconsistent_payload_status/);
});
test('fresh daily totals do not promote stale query or page rows to overall success',async()=>{
  const old=method=>reply({d:fixture(method).d.map(r=>({...r,Date:'2020-'+r.Date.slice(5)}))});
  const s=service({overrides:{GetQueryStats:()=>old('GetQueryStats'),GetPageStats:()=>old('GetPageStats')}});
  const p=await collectBingApi({credentials:creds,fetchImpl:s.fetchImpl,now});
  assert.equal(p.status,'partial');assert.equal(p.sources.GetQueryStats.stale,true);assert.equal(p.sources.GetPageStats.window.end,'2020-09-12');
  validateBingPayload(p,{now});p.status='collected';assert.throws(()=>validateBingPayload(p,{now}),/inconsistent_payload_status/);
});
