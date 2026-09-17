'use strict';
// Isolated functional comparison. Telemetry blocked here, never in Lighthouse.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),OUT=process.env.PERF_RESULTS;
const CSS='@media screen{.home-photo main>section:not(.hero){content-visibility:auto;contain-intrinsic-size:auto 1000px}.home-photo main>section:target{content-visibility:visible}}';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.json':'application/json'};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function server(port,variant){const s=http.createServer((req,res)=>{try{let f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(f!==ROOT&&!f.startsWith(ROOT+path.sep))throw Error('path');if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');let data=fs.readFileSync(f);if(variant==='candidate'&&(f===ROOT+'/index.html'||f===ROOT+'/en/index.html'))data=Buffer.from(data.toString().replace('</head>','<style>'+CSS+'</style></head>'));res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.writeHead(404);res.end();}});return new Promise((resolve,reject)=>{s.once('error',reject);s.listen(port,'127.0.0.1',()=>resolve(s));});}
async function snapshot(browser,engine,lang,width,js,variant){
 const port=variant==='baseline'?8865:8866,origin='http://127.0.0.1:'+port,url=origin+(lang==='en'?'/en/':'/');
 const context=await browser.newContext({viewport:{width,height:823},deviceScaleFactor:1,javaScriptEnabled:js,reducedMotion:'reduce',locale:lang==='ja'?'ja-JP':'en-US'});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===origin&&r.request().method()==='GET'?r.continue():r.abort();});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 try{
  await p.goto(url,{waitUntil:'load',timeout:30000});await delay(350);
  const label=[engine,lang,width,js?'js':'nojs',variant].join('-');
  await p.screenshot({path:path.join(OUT,label+'-top.png')});
  const sections=p.locator('main>section');const n=await sections.count();
  for(let j=0;j<n;j++){await sections.nth(j).evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await delay(180);}
  await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await delay(200);
  const rects=await p.evaluate(()=>[...document.querySelectorAll('main>section,main>figure')].map(e=>{const r=e.getBoundingClientRect();return{id:e.id,cls:e.className,x:r.x,y:r.y+scrollY,w:r.width,h:r.height};}));
  const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  const text=await p.locator('main').inner_text();
  const imgs=await p.locator('main img').evaluateAll(xs=>xs.map(e=>({src:e.currentSrc,complete:e.complete,width:e.naturalWidth})));
  const anchors=await p.locator('a[href^="#"]').evaluateAll(xs=>[...new Set(xs.map(e=>e.getAttribute('href')))].filter(x=>x.length>1));
  const targetResults=[];
  for(const a of anchors){await p.goto(url+a,{waitUntil:'load',timeout:30000});await delay(400);targetResults.push(await p.evaluate(id=>{const e=document.getElementById(id);const r=e?.getBoundingClientRect();return{id,exists:!!e,y:r?.y,h:r?.height,visible:!!r&&r.height>0&&r.y<innerHeight&&r.bottom>0};},a.slice(1)));}
  await p.emulateMedia({media:'print'});await delay(200);
  const print=await p.evaluate(()=>[...document.querySelectorAll('main>section')].map(e=>({id:e.id,h:e.getBoundingClientRect().height,cv:getComputedStyle(e).contentVisibility})));
  return{engine,lang,width,js,variant,errors,rects,overflow,text,imgs,anchors:targetResults,print};
 }finally{await context.close();}
}
async function main(){fs.mkdirSync(OUT,{recursive:true});const servers=[await server(8865,'baseline'),await server(8866,'candidate')],rows=[],failures=[];
 try{for(const engine of ['chromium','webkit']){const browser=await(engine==='chromium'?chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}):webkit.launch());try{
  for(const lang of ['ja','en'])for(const width of [320,390,412,768,1024,1440])for(const js of(width===390?[true,false]:[true])){
   const pair=[];for(const variant of ['baseline','candidate']){const row=await snapshot(browser,engine,lang,width,js,variant);pair.push(row);rows.push(row);fs.writeFileSync(path.join(OUT,'compat-rows.json'),JSON.stringify(rows,null,2));}
   const [b,c]=pair;const problems=[];
   if(c.errors.length)problems.push({errors:c.errors});if(c.overflow&&!b.overflow)problems.push('new horizontal overflow');if(c.text!==b.text)problems.push('main text mismatch');
   if(c.rects.length!==b.rects.length)problems.push('section count');
   c.rects.forEach((r,i)=>{if(!b.rects[i]||['x','y','w','h'].some(k=>Math.abs(r[k]-b.rects[i][k])>1))problems.push({geometry:{before:b.rects[i],after:r}});});
   c.anchors.forEach((r,i)=>{if(!r.exists||(!r.visible&&b.anchors[i]?.visible))problems.push({anchor:r,baseline:b.anchors[i]});});
   c.print.forEach((r,i)=>{if(Math.abs(r.h-b.print[i]?.h)>1)problems.push({print:r,before:b.print[i]});});
   if(problems.length)failures.push({engine,lang,width,js,problems});console.log(JSON.stringify({engine,lang,width,js,problems:problems.length}));
  }
 }finally{await browser.close();}}
 }finally{for(const s of servers)s.close();}
 fs.writeFileSync(path.join(OUT,'compat-summary.json'),JSON.stringify({rows:rows.length,failures,scope:'Functional tests only; telemetry blocked. No performance or CrUX claim.'},null,2));
 if(failures.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
