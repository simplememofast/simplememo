'use strict';
// Follow-up to the retained offscreen innerText mismatch. This tests actual
// on-screen content, keyboard/find access and print; it does not hide that API difference.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright');
const ROOT=path.resolve(__dirname,'../..'),OUT=process.env.PERF_RESULTS;
const CSS='@media screen{.home-photo main>section:not(.hero){content-visibility:auto;contain-intrinsic-size:auto 1000px}.home-photo main>section:target{content-visibility:visible}}';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.json':'application/json'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function server(port,variant){const s=http.createServer((req,res)=>{try{let f=path.resolve(ROOT,'.'+new URL(req.url,'http://localhost').pathname);if(f!==ROOT&&!f.startsWith(ROOT+path.sep))throw Error('path');if(fs.statSync(f).isDirectory())f=path.join(f,'index.html');let data=fs.readFileSync(f);if(variant!=='baseline'&&(f===ROOT+'/index.html'||f===ROOT+'/en/index.html'))data=Buffer.from(data.toString().replace('</head>','<style>'+CSS+(variant==='broken'?'.features{display:none!important}':'')+'</style></head>'));res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.writeHead(404);res.end();}});return new Promise((resolve,reject)=>{s.once('error',reject);s.listen(port,'127.0.0.1',()=>resolve(s));});}
const normalize=s=>s.replace(/\s+/g,' ').trim();
async function observe(browser,engine,lang,width,js,variant){
 const port={baseline:8965,candidate:8966,broken:8967}[variant],origin='http://127.0.0.1:'+port;
 const context=await browser.newContext({viewport:{width,height:823},javaScriptEnabled:js,reducedMotion:'reduce',locale:lang==='ja'?'ja-JP':'en-US'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin&&r.request().method()==='GET'?r.continue():r.abort());
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(String(e)));
 try{
  await p.goto(origin+(lang==='ja'?'/':'/en/'),{waitUntil:'load',timeout:30000});await pause(250);
  const domText=await p.locator('main').textContent();
  const nodes=p.locator('main>section,main>figure'),sections=[];
  for(let i=0,n=await nodes.count();i<n;i++){
   const node=nodes.nth(i);await node.evaluate(e=>e.scrollIntoView({behavior:'instant',block:'start'}));await pause(220);
   const item=await node.evaluate(e=>{const r=e.getBoundingClientRect();return{id:e.id,cls:e.className,text:e.innerText,x:r.x,y:r.y,w:r.width,h:r.height,visible:r.height>0&&r.y<innerHeight&&r.bottom>0};});sections.push(item);
  }
  const tabs=[];
  if(width===390&&js){await p.evaluate(()=>{scrollTo(0,0);document.activeElement?.blur();});
   for(let i=0;i<Math.min(await p.locator('main a[href]').count(),80);i++){
    await p.keyboard.press('Tab');await pause(20);tabs.push(await p.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return{tag:e.tagName,href:e.getAttribute('href'),text:e.textContent?.trim(),visible:r.height>0&&r.y<innerHeight&&r.bottom>0};}));
   }
  }
  await p.evaluate(()=>scrollTo(0,0));await pause(100);
  const find=await p.evaluate(()=>{const e=document.querySelector('main>section:last-of-type h2');const needle=e?.textContent?.trim();if(!needle||typeof window.find!=='function')return{available:false};return{available:true,needle,found:window.find(needle,false,false,true)};});await pause(150);
  const findVisible=await p.evaluate(()=>{const s=getSelection();const e=s?.anchorNode?.parentElement;const r=e?.getBoundingClientRect();return !!r&&r.height>0&&r.y<innerHeight&&r.bottom>0;});
  await p.emulateMedia({media:'print'});await pause(250);
  const print=await p.locator('main').innerText();
  return{engine,lang,width,js,variant,domText,sections,tabs,find,findVisible,print,errors};
 }finally{await context.close();}
}
function compare(b,c){const problems=[];if(b.domText!==c.domText)problems.push('DOM text changed');if(c.errors.length)problems.push({errors:c.errors});
 c.sections.forEach((r,i)=>{const old=b.sections[i];if(!old)return problems.push('section count');if(normalize(r.text)!==normalize(old.text))problems.push({visibleText:{index:i,id:r.id,cls:r.cls,before:old.text,after:r.text}});if(old.visible&&!r.visible)problems.push({notVisible:i});if(Math.abs(r.h-old.h)>1||Math.abs(r.w-old.w)>1)problems.push({geometry:{index:i,old:old.h,new:r.h}});});
 if(b.find.found&&(!c.find.found||!c.findVisible))problems.push({find:c.find,findVisible:c.findVisible});
 if(normalize(b.print)!==normalize(c.print))problems.push('print text changed');
 const identity=x=>x.map(r=>[r.tag,r.href,r.text]);if(JSON.stringify(identity(b.tabs))!==JSON.stringify(identity(c.tabs)))problems.push('keyboard focus order changed');
 c.tabs.forEach((r,i)=>{if(b.tabs[i]?.visible&&!r.visible)problems.push({invisibleFocus:i,focus:r});});return problems;}
async function main(){fs.mkdirSync(OUT,{recursive:true});const servers=[await server(8965,'baseline'),await server(8966,'candidate'),await server(8967,'broken')],rows=[],failures=[];let injected=false;
 try{for(const engine of ['chromium','webkit']){const browser=await(engine==='chromium'?chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}):webkit.launch());try{
  for(const lang of ['ja','en'])for(const width of [320,390,412,768,1024,1440])for(const js of(width===390?[true,false]:[true])){
   const b=await observe(browser,engine,lang,width,js,'baseline'),c=await observe(browser,engine,lang,width,js,'candidate');rows.push(b,c);const problems=compare(b,c);if(problems.length)failures.push({engine,lang,width,js,problems});console.log(JSON.stringify({engine,lang,width,js,problems:problems.length}));fs.writeFileSync(path.join(OUT,'visible-rows.json'),JSON.stringify(rows,null,2));
   if(engine==='chromium'&&lang==='ja'&&width===390&&js){const bad=await observe(browser,engine,lang,width,js,'broken');const caught=compare(b,bad);injected=caught.some(x=>x.visibleText||x.notVisible!==undefined);fs.writeFileSync(path.join(OUT,'injected-hidden-section.json'),JSON.stringify({caught,detected:injected},null,2));if(!injected)throw Error('Visible-content detector failed its injected hidden-section test');}
  }
 }finally{await browser.close();}}
 }finally{for(const s of servers)s.close();}
 fs.writeFileSync(path.join(OUT,'visible-summary.json'),JSON.stringify({rows:rows.length,failures,injected,priorOffscreenInnerTextDifference:'Retained and expected for skipped rendering; not declared identical. This follow-up checks visibility at the point of use.'},null,2));if(failures.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
