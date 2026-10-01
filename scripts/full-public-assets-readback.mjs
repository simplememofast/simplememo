#!/usr/bin/env node
// Fixed-origin full raw-asset evidence, independent of ordinary GSC/HTML checks.
// Default: manifest validation only. --live: one request per pinned asset.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
export const ORIGIN = 'https://simplememofast.com';
export const LIMITS = Object.freeze({attempts:1, concurrency:4, requestMs:10000, overallMs:600000, maxEntries:4096, maxAssetBytes:64*1024*1024, maxTotalBytes:512*1024*1024});
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST='data/full-public-assets-manifest.json';
const REPORT='full-public-assets-http';
const MIME=Object.freeze({
 '.png':['image/png'],'.jpg':['image/jpeg'],'.jpeg':['image/jpeg'],'.webp':['image/webp'],'.gif':['image/gif'],'.svg':['image/svg+xml'],
 '.md':['text/plain','text/markdown','text/x-markdown','application/octet-stream'],'.csv':['text/csv','text/plain','application/octet-stream'],'.json':['application/json','text/plain'],
 '.zip':['application/zip','application/x-zip-compressed','application/octet-stream'],'.pdf':['application/pdf'],'.canvas':['application/json','text/plain','application/octet-stream'],'.base':['text/plain','application/yaml','text/yaml','application/x-yaml','application/octet-stream'],'.enex':['application/xml','text/xml','text/plain','application/octet-stream'],
 '.txt':['text/plain'],'.css':['text/css'],'.js':['application/javascript','text/javascript'],'.mp4':['video/mp4'],'.webm':['video/webm'],'.mov':['video/quicktime'],'.mp3':['audio/mpeg'],'.wav':['audio/wav','audio/x-wav'],'.ogg':['audio/ogg','video/ogg']
});
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const json=d=>JSON.stringify(d,null,2)+'\n';
const keys=(d,allowed)=>assert.deepEqual(Object.keys(d).sort(),[...allowed].sort(),'Unexpected manifest/data keys');
const plain=d=>d!==null && typeof d==='object' && !Array.isArray(d);
export function parseManifest(raw){
 assert(Buffer.isBuffer(raw) && raw.length<=4*1024*1024,'Manifest must be bounded UTF8 bytes');
 const text=raw.toString('utf8');assert(Buffer.from(text).equals(raw),'Invalid UTF8');
 const m=JSON.parse(text);assert(json(m)===text,'Canonical JSON required; duplicate keys and noncanonical data rejected');
 assert(plain(m));keys(m,['version','origin','collections','entries',...(Object.hasOwn(m,'secondaryHtml')?['secondaryHtml']:[])]);assert.equal(m.version,1);assert.equal(m.origin,ORIGIN,'Only fixed production origin');
 assert(Array.isArray(m.collections)&&m.collections.length>0&&m.collections.length<=256);assert(Array.isArray(m.entries)&&m.entries.length>0&&m.entries.length<=LIMITS.maxEntries);
 const collections=new Map();
 for(const c of m.collections){
  assert(plain(c));keys(c,['id','expectedEntries','originalRawCount','followupRawCount','editorialCount','sourceMapSha256',...(Object.hasOwn(c,'derivedCount')?['derivedCount']:[])]);assert(/^C[0-9]{1,3}$/.test(c.id));assert(!collections.has(c.id),'Duplicate collection');
  for(const k of ['expectedEntries','originalRawCount','followupRawCount','editorialCount'])assert(Number.isSafeInteger(c[k])&&c[k]>=0);
  assert(Number.isSafeInteger(c.derivedCount??0)&&(c.derivedCount??0)>=0);assert(c.expectedEntries>0&&c.expectedEntries===c.originalRawCount+c.followupRawCount+c.editorialCount+(c.derivedCount??0));assert(typeof c.sourceMapSha256==='string'&&/^[a-f0-9]{64}$/.test(c.sourceMapSha256));collections.set(c.id,c);
 }
 const seen=new Set();let total=0;const counts=new Map([...collections].map(([id])=>[id,{original:0,followup:0,editorial:0,derived:0}]));
 for(const e of m.entries){
  assert(plain(e));keys(e,['collection','role','path','bytes','sha256']);assert(collections.has(e.collection));assert(['original','followup','editorial','derived'].includes(e.role));
  assert(typeof e.path==='string'&&e.path.length<=512&&(/^\/assets\/(img|downloads|evidence|css|js)\//.test(e.path)||['/assets/data/obsidian-uri-generator-fixed-results.json','/js/obsidian-uri-generator.js'].includes(e.path)),'Only original public asset namespaces or the two exact C23 paths');
  assert(!/[\x00-\x1f\x7f\\%?#:]/.test(e.path),'No controls, backslash, supplied encoding, query, fragment or scheme; literal filename spaces preserved');
  assert(!e.path.includes('//')&&path.posix.normalize(e.path)===e.path&&!e.path.split('/').some(x=>x==='.'||x==='..'),'No traversal or ambiguous paths');
  assert(Object.hasOwn(MIME,path.posix.extname(e.path).toLowerCase()),'Allowed raw asset extension only; HTML/docs are separate checks');
  const u=new URL(e.path,ORIGIN);assert.equal(u.origin,ORIGIN);assert.equal(decodeURI(u.pathname),e.path);assert.equal(u.search,'');assert.equal(u.hash,'');
  assert(!seen.has(e.path),'Duplicate public path');seen.add(e.path);assert(Number.isSafeInteger(e.bytes)&&e.bytes>0&&e.bytes<=LIMITS.maxAssetBytes);assert(typeof e.sha256==='string'&&/^[a-f0-9]{64}$/.test(e.sha256));total+=e.bytes;counts.get(e.collection)[e.role]++;
 }
 assert(total<=LIMITS.maxTotalBytes,'Bounded full body inventory');
 for(const [id,c] of collections){const n=counts.get(id);assert.equal(n.original,c.originalRawCount);assert.equal(n.followup,c.followupRawCount);assert.equal(n.editorial,c.editorialCount);assert.equal(n.derived,c.derivedCount??0);}
 assert(Array.isArray(m.secondaryHtml??[])&&(m.secondaryHtml??[]).length<=1,'At most one separately reviewed C22 secondary HTML');
 for(const e of m.secondaryHtml??[]){
  assert(plain(e));keys(e,['collection','path','sourceFile','sourceBytes','sourceSha256','expectedTitle','canonical','robots','index']);
  assert.equal(e.collection,'C22');assert(collections.has('C22'));assert.equal(e.path,'/obsidian/uri-scheme/results/');assert.equal(e.sourceFile,'obsidian/uri-scheme/results/index.html');
  assert.equal(e.canonical,ORIGIN+e.path);assert.equal(e.robots,'noindex,follow');assert.equal(e.index,false,'Secondary HTML must preserve indexfalse policy');
  assert(typeof e.expectedTitle==='string'&&e.expectedTitle.length>0&&e.expectedTitle.length<=512&&!/[\x00-\x1f\x7f]/.test(e.expectedTitle));
  assert(Number.isSafeInteger(e.sourceBytes)&&e.sourceBytes>0&&e.sourceBytes<=1024*1024);assert(typeof e.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(e.sourceSha256));
 }
 assert(m.entries.length+(m.secondaryHtml??[]).length<=LIMITS.maxEntries);return m;
}
const cleanHtml=s=>s.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
const attribute=(tag,name)=>{const m=tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,'i'));return (m?.[1]??m?.[2]??m?.[3]??'').replace(/&amp;/g,'&');};
export function checkSecondaryHtml(bytes,target){
 const text=bytes.toString('utf8');assert(Buffer.from(text).equals(bytes),'HTML body valid UTF8 required');const heads=[...cleanHtml(text).matchAll(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/gi)];assert.equal(heads.length,1,'One complete real HTML head');const head=heads[0][1];
 const titles=[...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];assert.equal(titles.length,1,'One real head title');const title=titles[0][1].trim().replace(/\s+/g,' ');assert.equal(title,target.expectedTitle,'Secondary title differs from checkout');
 const canonical=[...head.matchAll(/<link\b[^>]*>/gi)].filter(([tag])=>attribute(tag,'rel').toLowerCase().split(/\s+/).includes('canonical')).map(([tag])=>attribute(tag,'href'));assert.deepEqual(canonical,[target.canonical],'One selfcanonical');
 const robots=[...head.matchAll(/<meta\b[^>]*>/gi)].filter(([tag])=>attribute(tag,'name').toLowerCase()==='robots').map(([tag])=>attribute(tag,'content').toLowerCase().split(/[\s,]+/).filter(Boolean).sort());assert.deepEqual(robots,[['follow','noindex']],'Preserve secondary noindex,follow declaration');
 for(const [tag] of head.matchAll(/<meta\b[^>]*>/gi)){if(attribute(tag,'name').toLowerCase()==='googlebot')assert(!attribute(tag,'content').toLowerCase().split(/[\s,]+/).includes('index'),'Conflicting googlebot index declaration');}
 assert.equal(target.index,false);return {actualTitle:title,actualCanonical:canonical[0],actualRobots:'noindex,follow',index:false,scope:'Finite title/canonical/noindex declarations, not raw HTML equality or search indexing verdict'};
}
export function expectedMime(e){return MIME[path.posix.extname(e.path).toLowerCase()];}
export function verifyResponse(e,row){
 assert.equal(row.status,200,'Direct HTTP200 required');assert(expectedMime(e).includes(row.mime),'MIME outside fixed extension policy');assert.equal(row.bytes,e.bytes,'Body byte count differs');assert.equal(row.sha256,e.sha256,'Body SHA256 differs');assert.equal(row.truncated,false,'Partial body cannot pass');
}
export function readCheckoutAsset(root,e){
 const realRoot=fs.realpathSync(root);assert(!fs.lstatSync(root).isSymbolicLink(),'Checkout root symlink rejected');
 let f=root;
 for(const part of e.path.slice(1).split('/')){f=path.join(f,part);assert(!fs.lstatSync(f).isSymbolicLink(),'Asset or parent symlink rejected');}
 assert(fs.statSync(f).isFile(),'Checkout source must be a regular file');assert(fs.realpathSync(f).startsWith(realRoot+path.sep),'Source outside checkout');
 const b=fs.readFileSync(f);assert.equal(b.length,e.bytes,'Checkout source bytes differ from pinned manifest');assert.equal(sha256(b),e.sha256,'Checkout source hash differs from pinned manifest');return b;
}
const productionRequest=(e,signal)=>fetch(new URL(e.path,ORIGIN),{method:'GET',redirect:'manual',signal}); // No supplied credentials, proxy, header, origin or query option.
export const PRODUCTION_PACING=Object.freeze({cooldownMs:60000,minStartGapMs:1000});
const abortReason=signal=>signal.reason instanceof Error?signal.reason:Error(String(signal.reason||'aborted'));
const waitDelay=(ms,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted){reject(abortReason(signal));return;}
 let timer;const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
 const abort=()=>{cleanup();reject(abortReason(signal));};signal.addEventListener('abort',abort,{once:true});
 timer=setTimeout(()=>{cleanup();resolve();},Math.ceil(Math.max(0,ms)));
});
const awaitWithAbort=(promise,signal)=>new Promise((resolve,reject)=>{
 if(signal.aborted){reject(abortReason(signal));return;}
 const abort=()=>{signal.removeEventListener('abort',abort);reject(abortReason(signal));};signal.addEventListener('abort',abort,{once:true});
 promise.then(x=>{signal.removeEventListener('abort',abort);resolve(x);},e=>{signal.removeEventListener('abort',abort);reject(e);});
});
// The clock seam below is exercised only by private deterministic tests. The CLI
// has no pacing/timing override and uses actual monotonic elapsed time.
export function createProductionPacer({validatedAt,deadline,signal,now,delay,cancel,onWait=()=>{},onStart=()=>{}}){
 let nextStart=validatedAt+PRODUCTION_PACING.cooldownMs,lastStart=null,tail=Promise.resolve();
 return {async acquire(row){
  const queuedAt=now(),previous=tail;let release;tail=new Promise(resolve=>{release=resolve;});let released=false;
  const unlock=()=>{if(!released){released=true;release();}};
  try{
   await awaitWithAbort(previous,signal);if(signal.aborted)throw abortReason(signal);
   const remaining=deadline-now(),plannedWait=Math.max(0,nextStart-now());onWait(row,{queuedAtMs:queuedAt,eligibleAtMs:nextStart,plannedWaitMs:plannedWait,remainingBudgetMs:remaining,actualWaitMs:null});
   if(remaining<=10){cancel('overall-ceiling');throw abortReason(signal);}
   if(plannedWait>=remaining){await delay(Math.max(0,remaining),signal);cancel('overall-ceiling');throw abortReason(signal);}
   while(now()<nextStart){
    if(signal.aborted)throw abortReason(signal);
    const waitRemaining=deadline-now();if(waitRemaining<=10){cancel('overall-ceiling');throw abortReason(signal);}
    const eligibleWait=Math.max(0,nextStart-now());
    if(eligibleWait>=waitRemaining){await delay(Math.max(0,waitRemaining),signal);cancel('overall-ceiling');throw abortReason(signal);}
    await delay(Math.ceil(eligibleWait),signal);
   }
   if(signal.aborted)throw abortReason(signal);
   if(deadline-now()<=10){cancel('overall-ceiling');throw abortReason(signal);}
   return {invoke(fn){
    if(signal.aborted)throw abortReason(signal);const at=now();
    if(deadline-at<=10){cancel('overall-ceiling');throw abortReason(signal);}
    assert(at>=nextStart,'Production cooldown/global minimum start gap required');const gap=lastStart===null?null:at-lastStart;assert(gap===null||gap>=PRODUCTION_PACING.minStartGapMs);
    try{return fn();}finally{const returnedAt=Math.max(at,now());nextStart=returnedAt+PRODUCTION_PACING.minStartGapMs;lastStart=returnedAt;try{onStart(row,{requestStartMs:at,requestCallbackReturnedMs:returnedAt,actualWaitMs:at-queuedAt,globalStartGapMs:gap,startGapMeaning:"Lower bound: this pre-callback timestamp minus previous callback-return timestamp; actual GET invocation gap is at least this value",initialCooldownMs:gap===null?at-validatedAt:null});}finally{unlock();}}
   },abandon:unlock};
  }catch(error){unlock();throw error;}
 }};
}

const NO_OBSERVER=()=>{};
const MAX_RETRY_AFTER_MS=24*60*60*1000;
export function boundedRetryAfter(value,now){
 if(value===null)return {state:'absent'};
 if(typeof value!=='string'||value.length>128)return {state:'invalid_or_out_of_bounds'};
 const text=value.trim();
 if(/^\d{1,10}$/.test(text)){
  const seconds=Number(text);if(seconds*1000<=MAX_RETRY_AFTER_MS)return {state:'recorded',kind:'delay-seconds',seconds,retry:false};
 }else if(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)){
  const at=Date.parse(text);if(Number.isFinite(at)&&Math.max(0,at-now)<=MAX_RETRY_AFTER_MS)return {state:'recorded',kind:'http-date',at:new Date(at).toISOString(),delayMs:Math.max(0,at-now),retry:false};
 }
 return {state:'invalid_or_out_of_bounds'};
}
export async function runChecks({root,manifestBytes,sourceCommit,outputDir,request=productionRequest,requestMs=LIMITS.requestMs,overallMs=LIMITS.overallMs,mode='production',observeRequest=NO_OBSERVER,testTiming=null,...unsupported}){
 // Explicit deterministic testTiming keeps upstream production pacing, but is not public delivery.
 assert.equal(Object.keys(unsupported).length,0,'No scheduling, origin, concurrency or budget override');
 assert(testTiming===null||plain(testTiming),'Private testTiming must be null or an explicit timing object');
 if(mode==='production'&&testTiming===null){assert.equal(request,productionRequest,'Production request override rejected');assert.equal(observeRequest,NO_OBSERVER,'Production observer override rejected');assert.equal(requestMs,LIMITS.requestMs,'Production request budget fixed');assert.equal(overallMs,LIMITS.overallMs,'Production overall budget fixed');}
 if(testTiming){assert.notEqual(request,productionRequest,'Private test clock requires explicit private request seam');assert.equal(mode,'production');assert(plain(testTiming));keys(testTiming,['now','delay']);assert.equal(typeof testTiming.now,'function');assert.equal(typeof testTiming.delay,'function');}
 const clock=testTiming??{now:()=>performance.now(),delay:waitDelay};
 assert(/^[a-f0-9]{40}$/.test(sourceCommit),'Actual checkout GitSHA required');assert(Number.isSafeInteger(requestMs)&&requestMs>0&&requestMs<=LIMITS.requestMs);assert(Number.isSafeInteger(overallMs)&&overallMs>0&&overallMs<=LIMITS.overallMs);
 assert(['production','private-loopback'].includes(mode));assert(!fs.existsSync(outputDir),'One attempt: fresh own evidence directory required');assert(!fs.lstatSync(path.dirname(outputDir)).isSymbolicLink(),'Evidence parent symlink rejected');
 fs.mkdirSync(outputDir);fs.mkdirSync(path.join(outputDir,'responses'));
 const started=clock.now(),deadline=started+overallMs;const report={version:1,mode:testTiming?'private-production-pacing-test':mode,origin:ORIGIN,sourceCommit,sourceCommitMeaning:'Actual ordinary run checkout git rev-parse HEAD; private-loopback is not public delivery',startedAt:new Date().toISOString(),pacingClockScope:testTiming?'Private deterministic clock/request seam; no real production HTTP or delivery claim':'Actual monotonic elapsed clock',status:'RUNNING',manifestSha256:sha256(manifestBytes),limits:{...LIMITS,effectiveRequestMs:requestMs,effectiveOverallMs:overallMs},sharedJobBudget:'Existing job10min may cancel earlier; ceiling is not availability guarantee',retryCount:0,cost:null,costMeaning:'Existing normal Actions budget/cost unknown; no additional spend or waiver claimed',priorOrdinaryChecks:'Separate original85/representative3/HTML strict/propagation gates unchanged',entries:[],failures:[],completed:false};
 const save=()=>fs.writeFileSync(path.join(outputDir,'report.json'),json(report));save();fs.writeFileSync(path.join(outputDir,'manifest.input.json'),manifestBytes);
 let manifest;
 try{manifest=parseManifest(manifestBytes);const targets=[...manifest.entries.map(e=>({...e,kind:'raw'})),...(manifest.secondaryHtml??[]).map(e=>({...e,kind:'secondary-html',expectedIndex:e.index}))];report.rawEntries=manifest.entries.length;report.secondaryHtmlEntries=(manifest.secondaryHtml??[]).length;report.dedicatedTargets=targets.length;report.entries=targets.map((e,i)=>({...e,ordinal:i+1,attempts:0,state:'QUEUED'}));save();
  for(const row of report.entries){try{if(row.kind==='raw'){readCheckoutAsset(root,row);}else{const b=readCheckoutAsset(root,{path:'/'+row.sourceFile,bytes:row.sourceBytes,sha256:row.sourceSha256});checkSecondaryHtml(b,{...row,index:row.expectedIndex});}}catch(error){row.state='SOURCE_FAILED';row.error=error.message;report.failures.push({ordinal:row.ordinal,path:row.path,phase:'checkout-source',message:error.message});}}
  if(report.failures.length)throw Error('Pinned checkout source validation failed before HTTP');
 }catch(error){for(const row of report.entries){if(row.state==='QUEUED'){row.state='INCOMPLETE';row.error='Preflight failed; HTTP not attempted';}}report.status='FAILED';report.error=error.message;report.phase='preflight_failed';report.completed=false;report.passed=0;report.failed=report.entries.filter(x=>x.state==='SOURCE_FAILED').length;report.incomplete=report.entries.filter(x=>x.state==='INCOMPLETE').length;report.finishedAt=new Date().toISOString();save();return report;}
 const overall=new AbortController();let interrupted=false;const cancel=signal=>{if(overall.signal.aborted)return;interrupted=true;report.interruption=signal;report.status='INCOMPLETE';report.completed=false;for(const row of report.entries){if(row.state==='QUEUED'){row.state='INCOMPLETE';row.error='Budget/signal cancellation; HTTP not attempted';}}overall.abort(Error(signal));save();};
 const rateLimit=(row,response)=>{
  row.retryAfter=boundedRetryAfter(response.headers.get('retry-after'),Date.now());
  if(report.rateLimitObserved)return;
  report.rateLimitObserved={ordinal:row.ordinal,path:row.path,observedAt:new Date().toISOString(),observedAtMs:clock.now(),retryAfter:row.retryAfter,retry:false};
  // Abort pacing and all peers immediately; this row retains its bounded 429 body.
  cancel('HTTP429');
 };
 const onTerm=()=>cancel('SIGTERM');const onInt=()=>cancel('SIGINT');process.once('SIGTERM',onTerm);process.once('SIGINT',onInt);
 const validatedAt=clock.now();report.productionPacing={enabled:mode==='production',...PRODUCTION_PACING,sourceValidatedAtMs:validatedAt,sourceValidationElapsedMs:validatedAt-started,budgetDeadlineMs:deadline,requestsStarted:0,actualInitialCooldownMs:null,globalStartGapsMs:[]};save();
 const pacer=mode==='production'?createProductionPacer({validatedAt,deadline,signal:overall.signal,now:clock.now,delay:clock.delay,cancel,onWait:(row,w)=>{row.productionPacing=w;save();},onStart:(row,s)=>{Object.assign(row.productionPacing,s);row.requestInitiated=true;report.productionPacing.requestsStarted++;if(s.initialCooldownMs!==null)report.productionPacing.actualInitialCooldownMs=s.initialCooldownMs;if(s.globalStartGapMs!==null)report.productionPacing.globalStartGapsMs.push(s.globalStartGapMs);save();}}):null;
 const overallTimer=setTimeout(()=>cancel('overall-ceiling'),Math.max(1,deadline-clock.now()));let cursor=0,active=0,maxActive=0;
 async function one(row,lease){
  row.state='REQUESTING';row.startedAt=new Date().toISOString();active++;maxActive=Math.max(maxActive,active);save();observeRequest(row);
  const bodyFile=path.join(outputDir,'responses',String(row.ordinal).padStart(4,'0')+'.body');const metaFile=bodyFile+'.json';const fd=fs.openSync(bodyFile,'wx');const digest=createHash('sha256');let received=0;const own=new AbortController();const timer=setTimeout(()=>own.abort(Error('request-timeout')),Math.min(requestMs,Math.max(1,deadline-clock.now())));const abort=()=>{if(row.status!==429)own.abort(overall.signal.reason);};overall.signal.addEventListener('abort',abort,{once:true});
  row.bodyArtifact=path.relative(outputDir,bodyFile);row.truncated=true;
  try{
   if(overall.signal.aborted){own.abort(overall.signal.reason);throw abortReason(overall.signal);}
   const invokeRequest=()=>{row.attempts=1;row.requestInitiated=true;return request(row,own.signal);};
   const response=await (lease?lease.invoke(invokeRequest):invokeRequest());row.status=response.status;row.mime=(response.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase();row.responseMetadataScope='Only status, Content-Type and bounded Retry-After classification; no arbitrary headers, cookies or secret response headers retained';if(row.status===429)rateLimit(row,response);save();
   const reader=response.body?.getReader();
   if(reader){for(;;){if(own.signal.aborted)throw abortReason(own.signal);const {done,value}=await reader.read();if(done)break;const remaining=(row.kind==='raw'?Math.min(LIMITS.maxAssetBytes,row.bytes+65536):1024*1024)-received;
    if(value.length>remaining){if(remaining>0){fs.writeSync(fd,value.subarray(0,remaining));digest.update(value.subarray(0,remaining));received+=remaining;}own.abort(Error('body-limit'));throw Error('Response body exceeds bounded expected size');}
    fs.writeSync(fd,value);digest.update(value);received+=value.length;}}
   if(own.signal.aborted)throw abortReason(own.signal);
   row.actualBytes=received;row.actualSha256=digest.digest('hex');row.truncated=false;fs.fsyncSync(fd);assert.equal(fs.fstatSync(fd).size,received,'Retained entity-body file byte count differs');const saved=fs.readFileSync(bodyFile);assert.equal(sha256(saved),row.actualSha256,'Retained entity-body file hash differs');
   if(row.kind==='raw'){verifyResponse(row,{status:row.status,mime:row.mime,bytes:row.actualBytes,sha256:row.actualSha256,truncated:row.truncated});row.rawByteEquality=true;}else{assert.equal(row.status,200,'Secondary direct200 required');assert.equal(row.mime,'text/html','Secondary MIME text/html required');Object.assign(row,checkSecondaryHtml(saved,{...row,index:row.expectedIndex}));row.rawByteEquality=false;}row.state='PASS';
  }catch(error){row.actualBytes=received;row.actualSha256??=digest.digest('hex');row.state=overall.signal.aborted&&row.status!==429?'INCOMPLETE':'FAILED';if(!row.requestInitiated)row.attempts=0;row.error=own.signal.aborted?(String(own.signal.reason?.message||own.signal.reason)):error.message;if(row.state==='FAILED')report.failures.push({ordinal:row.ordinal,path:row.path,phase:'HTTP/body/assertion',message:row.error});}
  finally{clearTimeout(timer);overall.signal.removeEventListener('abort',abort);fs.closeSync(fd);active--;row.finishedAt=new Date().toISOString();row.bodyMeaning='Own fetched entity-body bytes (Fetch decodes transport encoding), not TLS/wire capture; partial error body retained';fs.writeFileSync(metaFile,json(row));save();}
 }
 async function worker(){for(;;){if(overall.signal.aborted)return;if(deadline-clock.now()<=10){cancel('overall-ceiling');return;}const i=cursor++;if(i>=report.entries.length)return;const row=report.entries[i];let lease;try{lease=pacer?await pacer.acquire(row):null;if(overall.signal.aborted)return;await one(row,lease);}catch(error){if(overall.signal.aborted){row.state='INCOMPLETE';row.attempts=0;row.error='Pacing cancelled before HTTP: '+error.message;if(row.productionPacing)row.productionPacing.actualWaitMs=clock.now()-row.productionPacing.queuedAtMs;save();return;}throw error;}finally{lease?.abandon();}}}
 try{await Promise.all(Array.from({length:Math.min(LIMITS.concurrency,report.entries.length)},worker));}
 catch(error){report.failures.push({phase:'worker',message:error.message});}
 finally{clearTimeout(overallTimer);process.removeListener('SIGTERM',onTerm);process.removeListener('SIGINT',onInt);for(const row of report.entries){if(row.state==='QUEUED'||row.state==='REQUESTING'){row.state='INCOMPLETE';row.error='Shared job cancellation or checker ceiling; not success';}}
  report.maxActiveRequests=maxActive;report.completed=report.entries.every(x=>['PASS','FAILED','SOURCE_FAILED'].includes(x.state));report.status=report.entries.every(x=>x.state==='PASS')&&!interrupted&&report.failures.length===0?'PASS':report.completed?'FAILED':'INCOMPLETE';report.finishedAt=new Date().toISOString();report.elapsedMs=clock.now()-started;report.passed=report.entries.filter(x=>x.state==='PASS').length;report.failed=report.entries.filter(x=>x.state==='FAILED'||x.state==='SOURCE_FAILED').length;report.incomplete=report.entries.filter(x=>x.state==='INCOMPLETE').length;save();}
 return report;
}
let actualCheckoutCommit=null;
async function main(){
 assert(process.argv.slice(2).length<=1&&['--live','--validate',undefined].includes(process.argv[2]),'Only --validate (default) or --live; no origin/header/path/budget override');
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:process.cwd(),encoding:'utf8'}).trim();assert(/^[a-f0-9]{40}$/.test(sourceCommit));actualCheckoutCommit=sourceCommit;
 for(const f of [ROOT,path.join(ROOT,'data'),path.join(ROOT,MANIFEST)])assert(!fs.lstatSync(f).isSymbolicLink(),'Manifest or source root symlink rejected');
 const raw=fs.readFileSync(path.join(ROOT,MANIFEST));
 if(process.argv[2]!=='--live'){const m=parseManifest(raw);console.log(json({mode:'manifest-validation-only',sourceCommit,rawEntries:m.entries.length,secondaryHtmlEntries:(m.secondaryHtml??[]).length,dedicatedTargets:m.entries.length+(m.secondaryHtml??[]).length,manifestSha256:sha256(raw),HTTPRequests:0,checkoutAssetValidation:'Only --live validates actual checkout asset bytes and secondary source policy before requests',noProductionClaim:true}));return;}
 assert.equal(fs.realpathSync(process.cwd()),fs.realpathSync(ROOT),'Live requires actual repository checkout root');
 assert.equal(execFileSync('git',['rev-parse','--show-toplevel'],{cwd:ROOT,encoding:'utf8'}).trim(),ROOT,'Actual checkout required, no ancestor substitute');
 const outputDir=path.join(ROOT,REPORT);const result=await runChecks({root:ROOT,manifestBytes:raw,sourceCommit,outputDir});console.log(json({status:result.status,sourceCommit,entries:result.entries.length,passed:result.passed??0,failed:result.failed??0,incomplete:result.incomplete??0,report:REPORT+'/report.json',productionHTTP:'Fixed origin, cooldown60s/global1s pacing, max1attempt4concurrency10s/600s ceiling; 429 stops new GETs, no retry; earlier sharedjob limit applies',cost:null}));process.exitCode=result.status==='PASS'?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().catch(error=>{console.error('Full public asset verification failed: '+error.message);const failure=path.join(ROOT,'full-public-assets-http-startup-failure.json');try{fs.writeFileSync(failure,json({status:'FAILED',phase:'startup',error:error.message,at:new Date().toISOString(),sourceCommit:actualCheckoutCommit,productionClaim:false,cost:null}),{flag:'wx'});}catch{}process.exitCode=1;});
}
