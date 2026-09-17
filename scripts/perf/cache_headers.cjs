'use strict';
// Bounded, read-only public response verification; no analytics submissions.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..');
const origin=new URL(process.env.PERF_ORIGIN || 'https://simplememofast.com');
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||!(origin.hostname==='simplememofast.com'||/^[a-z0-9-]+\.simplememo-596\.pages\.dev$/.test(origin.hostname)))throw Error('Unapproved test origin');
const output=process.env.PERF_RESULTS;
if(!output)throw Error('PERF_RESULTS required');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/home-perf/manifest.json')));
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const receipt={checked_at:new Date().toISOString(),origin:origin.origin,expected_commit:process.env.GITHUB_SHA,verified:false};
 try{
  const ctx=await browser.newContext();
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin.origin&&r.request().method()==='GET'?r.continue():r.abort());
  const page=await ctx.newPage();
  const response=await page.goto(origin.origin+'/',{waitUntil:'domcontentloaded',timeout:30000});
  if(response?.status()!==200)throw Error('Homepage HTTP '+response?.status());
  receipt.assets=await page.evaluate(async entries=>{
   const out={};let index=0;
   async function worker(){while(index<entries.length){const [file,expected]=entries[index++];const res=await fetch('/'+file,{cache:'no-cache',signal:AbortSignal.timeout(20000)});const data=await res.arrayBuffer();const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');const row={status:res.status,bytes:data.byteLength,sha256,cache_control:res.headers.get('cache-control'),content_type:res.headers.get('content-type'),cors:res.headers.get('access-control-allow-origin'),nosniff:res.headers.get('x-content-type-options'),etag:res.headers.get('etag')};out[file]=row;
    if(res.status!==200||sha256!==expected.sha256||row.bytes!==expected.bytes)throw Error('Asset bytes/status differ: '+file);
    if(row.cache_control!=='public, max-age=31536000, immutable')throw Error('Incorrect/duplicate cache policy: '+file+' '+row.cache_control);
    if(row.cors!=='*'||row.nosniff!=='nosniff'||!row.etag)throw Error('Required original asset headers missing: '+file);
   }}await Promise.all(Array.from({length:4},worker));return out;
  },Object.entries(manifest.assets));
  receipt.controls=await page.evaluate(async()=>{
   const checks={};
   for(const file of ['/', '/en/', '/assets/home-perf/manifest.json','/assets/home-perf/missing-000000000000.avif']){const r=await fetch(file,{cache:'no-cache',signal:AbortSignal.timeout(20000)});checks[file]={status:r.status,cache_control:r.headers.get('cache-control'),content_type:r.headers.get('content-type'),nosniff:r.headers.get('x-content-type-options')};}
   return checks;
  });
  for(const file of ['/','/en/','/assets/home-perf/manifest.json'])if(receipt.controls[file].status!==200||receipt.controls[file].cache_control!=='public, no-cache')throw Error('Mutable response no longer revalidates: '+file);
  if(receipt.controls['/assets/home-perf/missing-000000000000.avif'].status!==404||receipt.controls['/assets/home-perf/missing-000000000000.avif'].cache_control?.includes('31536000'))throw Error('Error response was given immutable success policy');
  receipt.verified=true;
  console.log('PASS: '+Object.keys(receipt.assets).length+' asset hashes, one-year policies, original asset headers and mutable/error controls.');
 }catch(e){receipt.error=String(e);throw e;}
 finally{fs.writeFileSync(path.join(output,'cache-response-proof.json'),JSON.stringify(receipt,null,2)+'\n');await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
