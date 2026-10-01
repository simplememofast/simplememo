import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChecks,LIMITS,ORIGIN,sha256,parseManifest,verifyResponse,checkSecondaryHtml,boundedRetryAfter,expectedMime,PRODUCTION_PACING} from './full-public-assets-readback.mjs';

// Controlled requests and a fake clock only: no HTTP, public delivery or runtime-success claim.
process.umask(0o077);
const HERE=path.dirname(fileURLToPath(import.meta.url));
const SOURCE_COMMIT='4bbec239663b52994c7ae6cf93e6c18cd9deba50';
const canonical=d=>Buffer.from(JSON.stringify(d,null,2)+'\n');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class FakeClock{
 time=Date.parse('2026-10-01T00:00:00Z');next=1;timers=new Map();
 now=()=>this.time;
 setTimeout=(fn,ms)=>{const id=this.next++;this.timers.set(id,{at:this.time+Math.max(0,ms),fn});return id;};
 clearTimeout=id=>this.timers.delete(id);
 delay=(ms,signal)=>new Promise((resolve,reject)=>{if(signal.aborted){reject(signal.reason);return;}let id;const abort=()=>{this.clearTimeout(id);signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});id=this.setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);});
 async finish(p){
  let settled=false,result,error;p.then(r=>{result=r;settled=true;},e=>{error=e;settled=true;});
  for(let n=0;n<10000&&!settled;n++){
   await flush();if(settled)break;
   const entries=[...this.timers].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0]);if(!entries.length){await new Promise(resolve=>setTimeout(resolve,5));continue;}
   const [id,timer]=entries[0];this.time=timer.at;this.timers.delete(id);timer.fn();
  }
  assert(settled,'Controlled fixture bounded pump');if(error)throw error;return result;
 }
}
function fixture(count=9){
 const dir=fs.mkdtempSync(path.join(HERE,'.rate-safety-'));const root=path.join(dir,'checkout');fs.mkdirSync(root);
 const bodies=new Map(),entries=[];
 for(let n=1;n<=count;n++){const p='/assets/downloads/rate-safety/'+n+'.txt',body=Buffer.from('pinned body '+n+'\n');const dest=path.join(root,p.slice(1));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);bodies.set(p,body);entries.push({collection:'C22',role:'original',path:p,bytes:body.length,sha256:sha256(body)});}
 const manifestBytes=canonical({version:1,origin:ORIGIN,collections:[{id:'C22',expectedEntries:count,originalRawCount:count,followupRawCount:0,editorialCount:0,sourceMapSha256:'a'.repeat(64)}],entries});
 return {dir,root,bodies,manifestBytes,outputDir:path.join(dir,'evidence'),sourceCommit:SOURCE_COMMIT,remove:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function responder(clock,bodies,select=()=>({})){const starts=[],aborts=[];
 const request=(row,signal)=>{
  starts.push({ordinal:row.ordinal,at:clock.now()});const {status=200,delay=0,retryAfter=null,body=bodies.get(row.path),mime=row.kind==='secondary-html'?'text/html':expectedMime(row)[0],hang=false}=select(row);
  return new Promise((resolve,reject)=>{let timer;
   const abort=()=>{clock.clearTimeout(timer);aborts.push(row.ordinal);signal.removeEventListener('abort',abort);reject(signal.reason);};
   const respond=()=>{signal.removeEventListener('abort',abort);let sent=false;resolve({status,headers:{get:name=>name==='content-type'?mime:name==='retry-after'?retryAfter:null},body:{getReader:()=>({read:async()=>{if(signal.aborted)throw signal.reason;if(sent)return {done:true};sent=true;return {done:false,value:body};}})}});};
   if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});if(delay>0)timer=clock.setTimeout(respond,delay);else if(!hang)respond();
  });
 };return {request,starts,aborts};}
async function execute(f,select,{requestMs=LIMITS.requestMs,overallMs=LIMITS.overallMs,observeRequest}={}){
 const clock=new FakeClock(),r=responder(clock,f.bodies,select);
 const report=await clock.finish(runChecks({root:f.root,manifestBytes:f.manifestBytes,sourceCommit:f.sourceCommit,outputDir:f.outputDir,mode:'production',testTiming:{now:clock.now,delay:clock.delay},request:r.request,requestMs,overallMs,...(observeRequest?{observeRequest}: {})}));
 return {report,clock,...r};
}

test('global starts remain >=1s apart while respecting maximum four active requests',async()=>{
 const f=fixture(9);try{const {report,starts,clock}=await execute(f,()=>({delay:4000}));assert.equal(PRODUCTION_PACING.minStartGapMs,1000);assert.equal(starts[0].at-clock.time+report.elapsedMs,PRODUCTION_PACING.cooldownMs);assert.equal(report.mode,'private-production-pacing-test');assert.equal(report.productionPacing.actualInitialCooldownMs,PRODUCTION_PACING.cooldownMs);assert.equal(report.status,'PASS');assert.equal(report.passed,9);assert.equal(report.maxActiveRequests,4);assert.equal(report.retryCount,0);assert.equal(starts.length,9);for(let i=1;i<starts.length;i++)assert(starts[i].at-starts[i-1].at>=1000);assert(report.entries.every(e=>e.attempts===1));}finally{f.remove();}
});
test('429 stops every new request, cancels other in-flight requests, preserves failure body and unattempted queue',async()=>{
 const f=fixture(9);const errorBody=Buffer.from('bounded rate-limited response\n');try{
  const {report,starts,aborts}=await execute(f,row=>row.ordinal===4?{delay:100,status:429,retryAfter:'7',body:errorBody}:{delay:6000});
  assert.deepEqual(starts.map(x=>x.ordinal),[1,2,3,4]);assert.deepEqual(aborts.sort(),[1,2,3]);assert.equal(report.status,'INCOMPLETE');assert.equal(report.completed,false);assert.equal(report.failed,1);assert.equal(report.incomplete,8);assert.equal(report.passed,0);assert.equal(report.retryCount,0);
  const failed=report.entries[3];assert.equal(failed.status,429);assert.equal(failed.state,'FAILED');assert.equal(failed.truncated,false);assert.equal(failed.actualSha256,sha256(errorBody));assert(fs.readFileSync(path.join(f.outputDir,failed.bodyArtifact)).equals(errorBody));assert.deepEqual(failed.retryAfter,{state:'recorded',kind:'delay-seconds',seconds:7,retry:false});
  assert(report.entries.slice(0,3).every(e=>e.state==='INCOMPLETE'&&e.attempts===1));assert(report.entries.slice(4).every(e=>e.state==='INCOMPLETE'&&e.attempts===0&&!e.bodyArtifact));assert(starts.every(x=>x.at<=report.rateLimitObserved.observedAtMs));
 }finally{f.remove();}
});
test('429 on final target remains FAILED, never all-pass or retried',async()=>{const f=fixture(1);try{const {report,starts}=await execute(f,()=>({status:429,retryAfter:'Wed, 01 Oct 2026 00:00:05 GMT'}));assert.equal(report.status,'FAILED');assert.equal(report.failed,1);assert.equal(report.completed,true);assert.equal(starts.length,1);assert.equal(report.rateLimitObserved.retryAfter.kind,'http-date');assert.equal(report.retryCount,0);}finally{f.remove();}});
test('deadline while waiting for next global slot performs zero additional GETs',async()=>{
 const f=fixture(4);try{const {report,starts}=await execute(f,()=>({}),{overallMs:PRODUCTION_PACING.cooldownMs+500});assert.equal(starts.length,1);assert.equal(report.passed,1);assert.equal(report.failed,0);assert.equal(report.incomplete,3);assert.equal(report.status,'INCOMPLETE');assert.equal(report.interruption,'overall-ceiling');assert(report.entries.slice(1).every(e=>e.attempts===0));}finally{f.remove();}
});
test('overall deadline cancels active requests without turning them or queued rows into success',async()=>{
 const f=fixture(7);try{const {report,starts,aborts}=await execute(f,()=>({delay:7000}),{overallMs:PRODUCTION_PACING.cooldownMs+2500});assert.deepEqual(starts.map(e=>e.ordinal),[1,2,3]);assert.deepEqual(aborts.sort(),[1,2,3]);assert.equal(report.passed,0);assert.equal(report.failed,0);assert.equal(report.incomplete,7);assert.equal(report.status,'INCOMPLETE');assert.equal(report.elapsedMs,PRODUCTION_PACING.cooldownMs+2500);}finally{f.remove();}
});
test('signal cancellation preserves explicit incomplete state and no later requests',async()=>{
 const f=fixture(5);try{const {report,starts}=await execute(f,()=>({delay:6000}),{observeRequest:row=>{if(row.ordinal===2)process.emit('SIGTERM');}});assert.deepEqual(starts.map(e=>e.ordinal),[1]);assert.equal(report.status,'INCOMPLETE');assert.equal(report.interruption,'SIGTERM');assert.equal(report.passed,0);assert.equal(report.incomplete,5);}finally{f.remove();}
});
test('request timeout remains failure, one attempt, with bounded partial evidence',async()=>{
 const f=fixture(2);try{const {report,starts}=await execute(f,()=>({hang:true}),{requestMs:20});assert.equal(report.failed,2);assert.equal(report.status,'FAILED');assert.equal(report.completed,true);assert.equal(starts.length,2);assert(report.entries.every(e=>e.error==='request-timeout'&&e.attempts===1&&e.truncated===true));}finally{f.remove();}
});
test('production rejects request/clock/observer/spacing/limit overrides before creating output',async()=>{
 const f=fixture(1);try{const base={root:f.root,manifestBytes:f.manifestBytes,sourceCommit:SOURCE_COMMIT,outputDir:f.outputDir};for(const override of [{request:async()=>{}},{clock:new FakeClock()},{observeRequest:()=>{}},{startIntervalMs:0},{concurrency:5},{requestMs:9999},{overallMs:599999},{testTiming:{now:()=>0,delay:async()=>{}}}]){await assert.rejects(runChecks({...base,...override}));assert.equal(fs.existsSync(f.outputDir),false);}assert.deepEqual({attempts:LIMITS.attempts,concurrency:LIMITS.concurrency,startIntervalMs:PRODUCTION_PACING.minStartGapMs,requestMs:LIMITS.requestMs,overallMs:LIMITS.overallMs},{attempts:1,concurrency:4,startIntervalMs:1000,requestMs:10000,overallMs:600000});}finally{f.remove();}
});
test('bounded Retry-After records numeric/date values, does not record arbitrary header contents or retry',()=>{
 const now=Date.parse('2026-10-01T00:00:00Z');assert.deepEqual(boundedRetryAfter(null,now),{state:'absent'});assert.equal(boundedRetryAfter('86400',now).seconds,86400);assert.equal(boundedRetryAfter('Thu, 01 Oct 2026 00:00:03 GMT',now).delayMs,3000);for(const value of ['86401','9999999999','-1','0.5','not-a-date','x'.repeat(129),'Fri, 02 Oct 2026 00:00:01 GMT'])assert.deepEqual(boundedRetryAfter(value,now),{state:'invalid_or_out_of_bounds'});
});
test('original raw equality contract rejects wrong status, MIME, bytes, SHA and truncation',()=>{const e={path:'/assets/downloads/a.txt',bytes:3,sha256:sha256(Buffer.from('abc'))},r={status:200,mime:'text/plain',bytes:3,sha256:e.sha256,truncated:false};verifyResponse(e,r);for(const wrong of [{status:429},{mime:'text/html'},{bytes:2},{sha256:'b'.repeat(64)},{truncated:true}])assert.throws(()=>verifyResponse(e,{...r,...wrong}));});
test('source/hash and secondary noindex preflight remain strict and issue no requests on failure',async()=>{
 const f=fixture(1);try{fs.writeFileSync(path.join(f.root,'assets/downloads/rate-safety/1.txt'),'wrong');const {report,starts}=await execute(f,()=>({}));assert.equal(starts.length,0);assert.equal(report.status,'FAILED');assert.equal(report.phase,'preflight_failed');const target={expectedTitle:'Pinned title',canonical:ORIGIN+'/obsidian/uri-scheme/results/',index:false};const head=`<head><title>Pinned title</title><link rel="canonical" href="${target.canonical}"><meta name="robots" content="noindex,follow"></head>`;checkSecondaryHtml(Buffer.from(head),target);assert.throws(()=>checkSecondaryHtml(Buffer.from(head.replace('noindex,follow','index,follow')),target));assert.throws(()=>parseManifest(canonical([])));}finally{f.remove();}
});
test('all manifest-pinned raw assets and secondary HTML must pass unchanged checks',async()=>{
 const root=process.cwd(),manifestBytes=fs.readFileSync(path.join(root,'data/full-public-assets-manifest.json')),m=parseManifest(manifestBytes);const expectedRaw=m.entries.length,expectedHtml=(m.secondaryHtml??[]).length,expectedTotal=expectedRaw+expectedHtml,expectedElapsedMs=PRODUCTION_PACING.cooldownMs+(expectedTotal-1)*PRODUCTION_PACING.minStartGapMs;const dir=fs.mkdtempSync(path.join(HERE,'.rate-safety-'));try{
  const bodies=new Map();for(const e of m.entries)bodies.set(e.path,fs.readFileSync(path.join(root,e.path.slice(1))));for(const e of m.secondaryHtml??[])bodies.set(e.path,fs.readFileSync(path.join(root,e.sourceFile)));
  const {report,starts}=await execute({root,dir,manifestBytes,bodies,sourceCommit:SOURCE_COMMIT,outputDir:path.join(dir,'evidence')},()=>({}));assert.equal(report.mode,'private-production-pacing-test');assert.match(report.pacingClockScope,/no real production HTTP or delivery claim/);assert.equal(report.status,'PASS');assert.equal(report.passed,expectedTotal);assert.equal(report.rawEntries,expectedRaw);assert.equal(report.secondaryHtmlEntries,expectedHtml);assert.equal(report.dedicatedTargets,expectedTotal);assert.equal(report.failed,0);assert.equal(report.incomplete,0);assert.equal(report.completed,true);assert.equal(report.retryCount,0);assert.equal(starts.length,expectedTotal);assert(report.entries.filter(e=>e.kind==='raw').every(e=>e.rawByteEquality&&e.actualSha256===e.sha256));assert.equal(report.entries.filter(e=>e.kind==='raw').length,expectedRaw);const html=report.entries.filter(e=>e.kind==='secondary-html');assert.equal(html.length,expectedHtml);assert(html.every(e=>e.index===false&&e.rawByteEquality===false));assert.equal(report.elapsedMs,expectedElapsedMs);for(let i=1;i<starts.length;i++)assert(starts[i].at-starts[i-1].at>=1000);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('deadline inside initial upstream60s cooldown starts no requests',async()=>{
 const f=fixture(4);try{const {report,starts}=await execute(f,()=>({}),{overallMs:500});assert.equal(starts.length,0);assert.equal(report.passed,0);assert.equal(report.failed,0);assert.equal(report.incomplete,4);assert.equal(report.status,'INCOMPLETE');assert(report.entries.every(e=>e.attempts===0));}finally{f.remove();}
});
test('upstream C23 exactly two nonstandard namespaces remain permitted; arbitrary siblings rejected',()=>{
 const f=fixture(1);try{const m=parseManifest(f.manifestBytes);m.collections[0].id='C23';m.collections[0].expectedEntries=2;m.collections[0].originalRawCount=2;m.entries=[{...m.entries[0],collection:'C23',path:'/assets/data/obsidian-uri-generator-fixed-results.json'},{...m.entries[0],collection:'C23',path:'/js/obsidian-uri-generator.js'}];assert.equal(parseManifest(canonical(m)).entries.length,2);for(const bad of ['/assets/data/other.json','/js/other.js']){const wrong=structuredClone(m);wrong.entries[0].path=bad;assert.throws(()=>parseManifest(canonical(wrong)));}}finally{f.remove();}
});
