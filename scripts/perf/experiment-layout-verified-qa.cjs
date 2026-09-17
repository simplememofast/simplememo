'use strict';
// Functional comparison only. Never submit analytics, forms or App Store visits.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const CASES=[{width:320,dpr:1},{width:390,dpr:3},{width:412,dpr:1.75},{width:768,dpr:1},{width:1440,dpr:1},{width:390,dpr:1,nojs:true}];
function cls(entries){let best=0,sum=0,start=0,last=0;for(const e of entries){if(e.hadRecentInput)continue;if(e.startTime-last<1000&&e.startTime-start<5000)sum+=e.value;else{sum=e.value;start=e.startTime;}last=e.startTime;best=Math.max(best,sum);}return best;}
exports.run=async function({ports,output}){
 const results=[],baselines={},printBaselines={},screenBaselines={};
 fs.writeFileSync(path.join(output,'qa-protocol.json'),JSON.stringify({engines:['chromium','webkit'],cases:CASES,variants:['baseline','deferred'],locales:['ja','en'],measurements:'No Lighthouse reruns. Five-pair speed evidence remains artifact10478512577.',requirements:['Hero and CTA visible','No horizontal overflow','Bounded full-page scroll','Every visible-layout image actually centered and loaded','Unchanged headings, metadata and links','Deep anchors reachable','FAQ and menu work','Print style and text match baseline','English/desktop section styles match baseline','Chromium full-scroll CLS<=0.1','No script or same-origin HTTP error'],diagnosis:'Previous WebKit image failures included baseline cases. Run35177473142 proved that affected images remained outside the viewport; centering their section and then actual image loaded every tested image. This protocol validates rectangles and does not force eager loading, change sources, skip failed images or relax CLS.',missingMetric:'WebKit and disabled-JavaScript unavailable Layout Instability API stays null.'},null,2));
 for(const engine of ['chromium','webkit']){
  const browser=engine==='chromium'?await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']}):await webkit.launch();
  try{for(const locale of ['ja','en'])for(const scenario of CASES)for(const variant of ['baseline','deferred']){
   const {width,dpr,nojs}=scenario,base='http://127.0.0.1:'+ports[variant],key=[engine,locale,width,dpr,nojs?'nojs':'js'].join('-'),label=key+'-'+variant;
   const record={engine,locale,variant,...scenario,pass:false};results.push(record);
   const context=await browser.newContext({viewport:{width,height:823},deviceScaleFactor:dpr,javaScriptEnabled:!nojs,reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('response',r=>{if(new URL(r.url()).origin===base&&r.status()>=400)errors.push(r.status()+' '+r.url());});
   await page.route('**/*',r=>r.request().method()==='GET'&&new URL(r.request().url()).origin===base?r.continue():r.abort());
   if(!nojs)await page.addInitScript(()=>{window.layoutShifts=null;if(PerformanceObserver.supportedEntryTypes?.includes('layout-shift')){window.layoutShifts=[];new PerformanceObserver(list=>{for(const x of list.getEntries())window.layoutShifts.push({value:x.value,startTime:x.startTime,hadRecentInput:x.hadRecentInput});}).observe({type:'layout-shift',buffered:true});}});
   try{
    assert.equal((await page.goto(base+(locale==='ja'?'/':'/en/'),{waitUntil:'networkidle'})).status(),200);
    for(let i=0;i<50;i++){if(await page.evaluate(()=>document.fonts.status==='loaded'))break;await page.waitForTimeout(100);}
    assert(await page.locator('h1').isVisible());
    assert(await page.locator('.hero a[href*="apps.apple.com"]').first().isVisible());
    assert(await page.locator('.hero__photograph img').evaluate(n=>n.complete&&n.naturalWidth>0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Initial horizontal overflow');
    const fingerprint=await page.evaluate(()=>({title:document.title,headings:[...document.querySelectorAll('h1,h2,h3,h4')].map(n=>n.textContent),links:[...document.querySelectorAll('a')].map(n=>[n.getAttribute('href'),n.textContent,n.getAttribute('data-cta-placement'),n.getAttribute('data-cta-position')]),meta:[...document.querySelectorAll('meta')].map(n=>n.outerHTML)}));
    if(variant==='baseline')baselines[key]=fingerprint;else assert.deepEqual(fingerprint,baselines[key],'Content or link identity changed');
    record.screenStyles=await page.locator('main>section').evaluateAll(ns=>ns.map(n=>[getComputedStyle(n).contentVisibility,getComputedStyle(n).containIntrinsicSize]));
    if(variant==='baseline')screenBaselines[key]=record.screenStyles;
    record.initialCls=await page.evaluate(()=>window.layoutShifts||null);if(record.initialCls)record.initialCls=cls(record.initialCls);
    if([320,412,1440].includes(width))await page.screenshot({path:path.join(output,label+'-top.png')});
    let bottom=false;
    for(let step=0;step<100;step++){
     const s=await page.evaluate(()=>({top:scrollY,height:document.documentElement.scrollHeight,view:innerHeight}));
     if(s.top+s.view>=s.height-2){bottom=true;break;}
     await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),s.top+600);await page.waitForTimeout(100);
    }
    assert(bottom,'Bounded scrolling did not reach footer');
    record.imagePositions=[];
    const count=await page.locator('img').count();
    for(let index=0;index<count;index++){
     const image=page.locator('img').nth(index);
     const relevant=await image.evaluate(n=>new URL(n.currentSrc||n.src).origin===location.origin&&n.getBoundingClientRect().width>0);
     if(!relevant)continue;
     await image.evaluate(n=>(n.closest('section')||n).scrollIntoView({block:'center',behavior:'instant'}));
     await page.waitForTimeout(150);
     let state;
     for(let attempt=0;attempt<40;attempt++){
      await image.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(250);
      state=await image.evaluate(n=>{const r=n.getBoundingClientRect();return {src:n.currentSrc,loaded:n.complete&&n.naturalWidth>0,top:r.top,bottom:r.bottom,width:r.width,height:r.height,viewport:innerHeight};});
      if(state.loaded&&state.bottom>0&&state.top<state.viewport&&state.height>0)break;
     }
     record.imagePositions.push({index,...state});
     assert(state.loaded&&state.bottom>0&&state.top<state.viewport&&state.height>0,'Image '+index+' failed while actually centered: '+JSON.stringify(state));
    }
    record.images=await page.locator('img').evaluateAll(ns=>ns.filter(n=>new URL(n.currentSrc||n.src).origin===location.origin&&n.getBoundingClientRect().width>0).map(n=>({src:n.currentSrc,loaded:n.complete&&n.naturalWidth>0})));
    assert(record.images.every(n=>n.loaded),'An image became incomplete after visiting it');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'After-scroll horizontal overflow');
    record.scrollShifts=await page.evaluate(()=>window.layoutShifts||null);record.scrollCls=record.scrollShifts?cls(record.scrollShifts):null;
    if(record.scrollCls!==null)assert(record.scrollCls<=.1,'Full-scroll CLS exceeds0.1: '+record.scrollCls);
    const ids=await page.locator('main [id]').evaluateAll(ns=>ns.filter(n=>/^H[1-4]$/.test(n.tagName)||n.tagName==='SECTION').map(n=>n.id));
    record.anchors=[];
    for(const id of [...new Set([ids[0],ids[Math.floor(ids.length/2)],ids.at(-1)])].filter(Boolean)){
     await page.evaluate(id=>{location.hash=id;document.getElementById(id).scrollIntoView({block:'center',behavior:'instant'});},id);await page.waitForTimeout(200);
     const r=await page.evaluate(id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight};},id);
     assert(r.height>0&&r.bottom>0&&r.top<r.viewport,'Anchor unreachable: '+id);record.anchors.push({id,...r});
    }
    const details=page.locator('details').first();if(await details.count()){await details.locator('summary').click();assert(await details.evaluate(n=>n.open),'FAQ did not open');await details.locator('summary').click();}
    if(!nojs){const toggle=page.locator('.global-nav__hamburger');if(await toggle.count()&&await toggle.isVisible()){await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await toggle.click();}}
    await page.emulateMedia({media:'print'});
    record.print={styles:await page.locator('main>section').evaluateAll(ns=>ns.map(n=>[getComputedStyle(n).contentVisibility,getComputedStyle(n).containIntrinsicSize])),text:await page.locator('body').innerText()};
    if(variant==='baseline')printBaselines[key]=record.print;else assert.deepEqual(record.print,printBaselines[key],'Print rules or printable text changed');
    assert(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'Print content collapsed');
    await page.emulateMedia({media:'screen'});
    if(locale==='en'||width>=1024)assert.deepEqual(record.screenStyles,screenBaselines[key],'Non-target section rules changed');
    assert.deepEqual(errors,[]);record.pass=true;
   }catch(e){record.error=String(e);record.browserErrors=errors;await page.screenshot({path:path.join(output,label+'-failed.png')}).catch(()=>{});}
   finally{await context.close();fs.writeFileSync(path.join(output,'qa-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({label,pass:record.pass,scrollCls:record.scrollCls,error:record.error}));}
  }}finally{await browser.close();}
 }
 assert.equal(results.length,48);assert(results.every(r=>r.pass),'One or more functional scenarios failed; do not ship');
};
