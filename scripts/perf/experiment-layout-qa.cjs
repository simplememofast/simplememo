'use strict';
// Functional experiment only. Never submit analytics, send forms or leave origin.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const CASES=[{width:320,dpr:1},{width:390,dpr:3},{width:412,dpr:1.75},{width:768,dpr:1},{width:1440,dpr:1},{width:390,dpr:1,nojs:true}];
function cls(entries){let best=0,sum=0,start=0,last=0;for(const e of entries){if(e.hadRecentInput)continue;if(e.startTime-last<1000&&e.startTime-start<5000){sum+=e.value;}else{sum=e.value;start=e.startTime;}last=e.startTime;best=Math.max(best,sum);}return best;}
exports.run=async function({ports,output}){
 const results=[],baselines={};
 fs.writeFileSync(path.join(output,'qa-protocol.json'),JSON.stringify({engines:['chromium','webkit'],cases:CASES,locales:['ja','en'],variants:['baseline','combined'],requirements:['Every above-fold hero/CTA visible','No horizontal overflow','Complete bounded top-to-bottom scrolling','All same-origin visible images loaded','Existing links/text unchanged','Deep heading anchors reachable','FAQ opens','Print does not defer content','Initial and full-scroll Chromium CLS<=0.1','No HTTP/JS errors'],note:'Functional telemetry blocked. WebKit/JS-disabled absent Layout Instability API is reported as null, not zero.'},null,2));
 for(const engine of ['chromium','webkit']){
  const browser=engine==='chromium'?await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}):await webkit.launch();
  try{for(const locale of ['ja','en'])for(const scenario of CASES)for(const variant of ['baseline','combined']){
   const {width,dpr,nojs}=scenario,base='http://127.0.0.1:'+ports[variant],key=[engine,locale,width,dpr,nojs?'nojs':'js'].join('-'),label=key+'-'+variant;
   const record={engine,locale,variant,...scenario,pass:false};results.push(record);
   const context=await browser.newContext({viewport:{width,height:823},deviceScaleFactor:dpr,javaScriptEnabled:!nojs,reducedMotion:'reduce'});
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('response',r=>{if(new URL(r.url()).origin===base&&r.status()>=400)errors.push(r.status()+' '+r.url());});
   await page.route('**/*',route=>route.request().method()==='GET'&&new URL(route.request().url()).origin===base?route.continue():route.abort());
   if(!nojs)await page.addInitScript(()=>{window.layoutShifts=null;if(PerformanceObserver.supportedEntryTypes?.includes('layout-shift')){window.layoutShifts=[];new PerformanceObserver(list=>{for(const x of list.getEntries())window.layoutShifts.push({value:x.value,startTime:x.startTime,hadRecentInput:x.hadRecentInput});}).observe({type:'layout-shift',buffered:true});}});
   try{
    assert.equal((await page.goto(base+(locale==='ja'?'/':'/en/'),{waitUntil:'networkidle'})).status(),200);
    for(let i=0;i<50;i++){if(await page.evaluate(()=>document.fonts.status==='loaded'))break;await page.waitForTimeout(100);}
    assert(await page.locator('h1').isVisible());
    assert(await page.locator('.hero a[href*="apps.apple.com"]').first().isVisible());
    assert(await page.locator('.hero__photograph img').evaluate(i=>i.complete&&i.naturalWidth>0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'initial overflow');
    const fingerprint=await page.evaluate(()=>({title:document.title,headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(n=>n.textContent),links:[...document.querySelectorAll('a')].map(n=>[n.getAttribute('href'),n.textContent,n.getAttribute('data-cta-placement'),n.getAttribute('data-cta-position')]),meta:[...document.querySelectorAll('meta')].map(n=>n.outerHTML)}));
    if(variant==='baseline')baselines[key]=fingerprint;else assert.deepEqual(fingerprint,baselines[key],'Content and link identities changed');
    record.initialCls=await page.evaluate(()=>window.layoutShifts||null);if(record.initialCls)record.initialCls=cls(record.initialCls);
    if([320,412,1440].includes(width))await page.screenshot({path:path.join(output,label+'-top.png')});
    let bottom=false;
    for(let step=0;step<100;step++){
      const position=await page.evaluate(()=>({y:scrollY,height:document.documentElement.scrollHeight,view:innerHeight}));
      if(position.y+position.view>=position.height-2){bottom=true;break;}
      await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),position.y+600);await page.waitForTimeout(100);
    }
    assert(bottom,'bounded scrolling did not reach the footer');
    for(let i=0;i<50;i++){
      if(await page.evaluate(()=>[...document.images].filter(n=>n.getBoundingClientRect().width>0&&new URL(n.currentSrc||n.src).origin===location.origin).every(n=>n.complete&&n.naturalWidth>0)))break;
      await page.waitForTimeout(100);
    }
    record.images=await page.evaluate(()=>[...document.images].filter(n=>n.getBoundingClientRect().width>0&&new URL(n.currentSrc||n.src).origin===location.origin).map(n=>({src:n.currentSrc,loaded:n.complete&&n.naturalWidth>0})));
    assert(record.images.every(n=>n.loaded),'An image remained unloaded after scrolling');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'after-scroll overflow');
    record.scrollShifts=await page.evaluate(()=>window.layoutShifts||null);
    record.scrollCls=record.scrollShifts?cls(record.scrollShifts):null;
    if(record.scrollCls!==null)assert(record.scrollCls<=.1,'full-scroll CLS exceeds 0.1: '+record.scrollCls);
    const ids=await page.locator('main [id]').evaluateAll(nodes=>nodes.filter(n=>/^H[1-4]$/.test(n.tagName)||n.tagName==='SECTION').map(n=>n.id));
    record.anchors=[];
    for(const id of [...new Set([ids[0],ids[Math.floor(ids.length/2)],ids.at(-1)])].filter(Boolean)){
      await page.evaluate(id=>{location.hash=id;document.getElementById(id).scrollIntoView({block:'center',behavior:'instant'});},id);await page.waitForTimeout(200);
      const rect=await page.evaluate(id=>{const n=document.getElementById(id),r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight};},id);
      assert(rect.height>0&&rect.bottom>0&&rect.top<rect.viewport,'Anchor not reachable: '+id);record.anchors.push({id,...rect});
    }
    const details=page.locator('details').first();if(await details.count()){
      await details.locator('summary').click();assert(await details.evaluate(n=>n.open),'FAQ did not open');await details.locator('summary').click();
    }
    if(!nojs){const toggle=page.locator('.global-nav__hamburger');if(await toggle.count()&&await toggle.isVisible()){await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await toggle.click();}}
    await page.emulateMedia({media:'print'});
    assert(await page.locator('main>section').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).contentVisibility==='visible')),'Print unexpectedly defers a section');
    assert(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'Print content collapsed');
    await page.emulateMedia({media:'screen'});
    if(locale==='en'||width>=1024)assert(await page.locator('main>section').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).contentVisibility==='visible')),'Non-target page changed');
    assert.deepEqual(errors,[]);record.pass=true;
   }catch(e){record.error=String(e);record.browserErrors=errors;await page.screenshot({path:path.join(output,label+'-failed.png')}).catch(()=>{});}
   finally{await context.close();fs.writeFileSync(path.join(output,'qa-results.json'),JSON.stringify(results,null,2));console.log('QA '+JSON.stringify({label,pass:record.pass,scrollCls:record.scrollCls,error:record.error}));}
  }}finally{await browser.close();}
 }
 assert(results.length===48);assert(results.every(r=>r.pass),'One or more functional scenarios failed; do not ship');
};
