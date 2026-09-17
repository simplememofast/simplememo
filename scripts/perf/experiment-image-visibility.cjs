'use strict';
// Read-only local browser diagnostics. No network request outside the test origin.
const fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
exports.run=async function({ports,output}){
 const results=[];
 for(const engine of ['chromium','webkit']){
  const browser=engine==='chromium'?await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}):await webkit.launch();
  try{for(const spec of [{width:320,dpr:1},{width:390,dpr:3}])for(const variant of ['baseline','deferred']){
   const base='http://127.0.0.1:'+ports[variant],label=[engine,spec.width,spec.dpr,variant].join('-');
   const record={label,engine,variant,...spec,images:[],requests:[],failures:[]};results.push(record);
   const context=await browser.newContext({viewport:{width:spec.width,height:823},deviceScaleFactor:spec.dpr,reducedMotion:'reduce'});
   const page=await context.newPage();
   await page.route('**/*',r=>r.request().method()==='GET'&&new URL(r.request().url()).origin===base?r.continue():r.abort());
   page.on('response',r=>{if(/image/.test(r.headers()['content-type']||''))record.requests.push({url:r.url(),status:r.status()});});
   page.on('requestfailed',r=>record.failures.push({url:r.url(),error:r.failure()}));
   try{
    await page.goto(base+'/',{waitUntil:'networkidle'});
    for(let step=0;step<100;step++){
     const p=await page.evaluate(()=>({top:scrollY,height:document.documentElement.scrollHeight,viewport:innerHeight}));
     if(p.top+p.viewport>=p.height-2)break;
     await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),p.top+600);await page.waitForTimeout(100);
    }
    const count=await page.locator('img').count();
    for(let index=0;index<count;index++){
     const image=page.locator('img').nth(index);
     const snapshots=[];const state=async()=>image.evaluate(n=>{const r=n.getBoundingClientRect(),p=n.closest('section');return {src:n.currentSrc,complete:n.complete,naturalWidth:n.naturalWidth,top:r.top,bottom:r.bottom,width:r.width,height:r.height,viewport:innerHeight,scrollY,section:p?.className,sectionVisibility:p?getComputedStyle(p).contentVisibility:null};});
     snapshots.push({phase:'before',...await state()});
     if(snapshots[0].width===0)continue;
     await image.evaluate(n=>{(n.closest('section')||n).scrollIntoView({block:'center',behavior:'instant'});});
     await page.waitForTimeout(150);
     for(let attempt=0;attempt<20;attempt++){
      await image.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
      await page.waitForTimeout(250);
      const s=await state();snapshots.push({phase:'centered',attempt,...s});
      if(s.complete&&s.naturalWidth>0&&s.bottom>0&&s.top<s.viewport)break;
     }
     const s=snapshots.at(-1);record.images.push({index,pass:s.complete&&s.naturalWidth>0&&s.bottom>0&&s.top<s.viewport,snapshots});
     if(!record.images.at(-1).pass)await page.screenshot({path:path.join(output,label+'-image-'+index+'.png')});
    }
    record.finalStates=await page.locator('img').evaluateAll(ns=>ns.map((n,index)=>({index,src:n.currentSrc,complete:n.complete,naturalWidth:n.naturalWidth})));
    record.pass=record.images.every(n=>n.pass);
   }catch(e){record.error=String(e);record.pass=false;}
   finally{await context.close();fs.writeFileSync(path.join(output,'image-visibility.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({label,pass:record.pass,error:record.error,failed:record.images.filter(x=>!x.pass)}));}
  }}finally{await browser.close();}
 }
};
