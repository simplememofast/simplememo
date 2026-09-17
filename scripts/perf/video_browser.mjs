import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {VIDEO_RULE,withoutVideoRule} from './video_rule.mjs';
import {assertPrintPreserved} from './video_geometry.mjs';
import {waitForFonts} from './sections_wait.mjs';
export async function main(){
  const root=fs.realpathSync(process.argv[2]||new URL('../../',import.meta.url).pathname);
  const engine=process.env.QA_BROWSER||'chromium';
  const output=process.env.QA_RESULTS;assert(output,'QA_RESULTS required');fs.mkdirSync(output,{recursive:true});
  const pw=createRequire(import.meta.url)('playwright'),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4'};
  async function serve(control){
    const server=http.createServer((req,res)=>{try{
      let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(file!==root&&!file.startsWith(root+path.sep))throw Error('Outside root');
      if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      let data=fs.readFileSync(file),type=types[path.extname(file)]||'application/octet-stream';
      if(control&&['index.html','en/index.html','assets/css/home-hero.css'].includes(path.relative(root,file)))data=Buffer.from(withoutVideoRule(data.toString()));
      res.setHeader('Content-Type',type);res.setHeader('Cache-Control',type.startsWith('text/html')?'no-store':'public, max-age=3600');
      if(type==='video/mp4'){res.setHeader('Accept-Ranges','bytes');const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;if(start>end){res.writeHead(416);res.end();return;}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${data.length}`);data=data.subarray(start,end+1);}}
      else if(/text\/|json|svg/.test(type)&&/gzip/.test(req.headers['accept-encoding']||'')){data=zlib.gzipSync(data);res.setHeader('Content-Encoding','gzip');}
      res.setHeader('Content-Length',data.length);res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404);res.end();}});
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    return {server,url:'http://127.0.0.1:'+server.address().port};
  }
  const servers=await Promise.all([serve(true),serve(false)]),results=[];
  const browser=await pw[engine].launch(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  const poll=async(read,predicate,label)=>{const end=Date.now()+8000;while(Date.now()<end){const v=await read();if(predicate(v))return v;await wait(100);}throw Error('Timed out: '+label);};
  async function measure(url,label,c){
    const context=await browser.newContext({viewport:{width:c.width,height:823},javaScriptEnabled:c.js,reducedMotion:'reduce'});
    context.setDefaultTimeout(15000);context.setDefaultNavigationTimeout(30000);
    let page=await context.newPage();
    const progress=stage=>{const row={engine,label,...c,stage,at:new Date().toISOString()};fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(row));console.log(JSON.stringify(row));};
    try{
      progress('warm-fonts');await page.goto(url+'/',{waitUntil:'networkidle'});
      for(const element of await page.locator('main > section,main > figure').all()){await element.scrollIntoViewIfNeeded();await wait(120);}
      await waitForFonts(page);await page.close();page=await context.newPage();
      progress('cold-position-warm-font-comparison');await page.goto(url+'/',{waitUntil:'networkidle'});await wait(300);
      const headings=await page.locator('h1,h2,h3').allTextContents(),hero=await page.locator('.hero').boundingBox();
      const figure=page.locator('main > figure.lp-video'),video=figure.locator('video');
      assert.equal(await figure.count(),1);assert.equal(await video.count(),1);
      const initial=await figure.evaluate(n=>({y:n.getBoundingClientRect().y,visibility:getComputedStyle(n).contentVisibility}));
      await page.screenshot({path:path.join(output,`${engine}-${c.width}-${c.js}-${label}-top.png`)});
      await figure.scrollIntoViewIfNeeded();await wait(400);await waitForFonts(page);
      const box=await video.boundingBox();assert(box&&box.height>0&&box.y<823&&box.y+box.height>0,'Video is not rendered in viewport');
      assert(Math.abs(box.width/box.height-1280/720)<0.02,'Video aspect ratio changed');
      const attributes=await video.evaluate(n=>Object.fromEntries([...n.attributes].map(a=>[a.name,a.value])));
      assert.equal(attributes.preload,'none');assert('controls' in attributes);assert(!('autoplay' in attributes));
      const caption=await figure.locator('figcaption').innerText();assert(caption.length>0);
      const captionLink=figure.locator('figcaption a');await captionLink.focus();await wait(200);
      assert(await captionLink.evaluate(n=>n===document.activeElement),'Caption keyboard focus failed');
      const focused=await figure.evaluate(n=>getComputedStyle(n).contentVisibility);assert.equal(focused,'visible','Focused figure must be visible');
      await page.screenshot({path:path.join(output,`${engine}-${c.width}-${c.js}-${label}-video.png`)});
      progress('native-playback');await video.evaluate(n=>{n.muted=true;n.play().catch(e=>{n.dataset.qaPlayError=e.name+': '+e.message;});});
      const playing=await poll(()=>video.evaluate(n=>({time:n.currentTime,paused:n.paused,error:n.error?.code||n.dataset.qaPlayError||null,width:n.videoWidth,height:n.videoHeight,duration:n.duration})),v=>!v.paused&&v.time>0.15&&v.width>0,'native playback');
      assert.equal(playing.error,null);assert.equal(playing.width,1280);assert.equal(playing.height,720);
      await video.evaluate(n=>{n.pause();n.currentTime=0;});
      await page.emulateMedia({media:'print'});await wait(200);
      // Record printing after screen interaction separately: optional-font choices
      // persist for a document lifetime and can legitimately differ after deferral.
      const lifecyclePrinted=await figure.evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,visibility:getComputedStyle(n).contentVisibility}));
      assert.equal(lifecyclePrinted.visibility,'visible');assert(lifecyclePrinted.height>0);
      await page.emulateMedia({media:'screen'});
      // Compare the exact CSS rule in one document, retaining its actual optional-font choice.
      // Cross-document heights are recorded but are not a font-controlled comparison.
      await page.emulateMedia({media:'print'});await wait(200);
      const snapshot=()=>figure.evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,visibility:getComputedStyle(n).contentVisibility,caption:n.querySelector('figcaption').innerText}));
      const initialPrint=await snapshot();
      const heroStyle=page.locator('style[data-home-perf="hero"]');const originalStyle=await heroStyle.textContent();
      const otherStyle=originalStyle.includes(VIDEO_RULE)?withoutVideoRule(originalStyle):originalStyle+'\n'+VIDEO_RULE;
      let controlledPrint;
      try{
        await heroStyle.evaluate((n,css)=>{n.textContent=css;},otherStyle);await wait(300);controlledPrint=await snapshot();
        assertPrintPreserved(initialPrint,controlledPrint);
        await page.screenshot({path:path.join(output,`${engine}-${c.width}-${c.js}-${label}-print.png`)});
      }finally{await heroStyle.evaluate((n,css)=>{n.textContent=css;},originalStyle);await page.emulateMedia({media:'screen'});}
      const printed={initial:initialPrint,controlled:controlledPrint,comparison:'Same document; only the reviewed screen rule toggled; original font selection retained.'};
      const hashes=await page.locator('main [id]').evaluateAll(nodes=>{const v=document.querySelector('figure.lp-video');return nodes.filter(n=>v.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING).map(n=>'#'+encodeURIComponent(n.id)).slice(-2);});
      assert(hashes.length>0,'Expected native fragment targets below the video');const anchors=[];
      progress('native-fragments');
      for(const hash of hashes){const p=await context.newPage();try{await p.goto(url+'/'+hash,{waitUntil:'networkidle'});await wait(400);const target=p.locator('[id='+JSON.stringify(decodeURIComponent(hash.slice(1)))+']');const rect=await target.boundingBox();assert(rect&&rect.y<823&&rect.y+rect.height>0,'Fragment target outside viewport');anchors.push({hash,y:rect.y,height:rect.height});}finally{await p.close();}}
      return {headings,hero,initial,box,attributes,caption,focused,playing,lifecyclePrinted,printed,anchors};
    }finally{await context.close();}
  }
  try{
    for(const c of [{width:320,js:true},{width:412,js:true},{width:768,js:true},{width:1440,js:true},{width:390,js:false}]){
      const baseline=await measure(servers[0].url,'baseline',c),candidate=await measure(servers[1].url,'candidate',c);
      fs.writeFileSync(path.join(output,`${engine}-${c.width}-${c.js}-comparison.json`),JSON.stringify({baseline,candidate},null,2));
      assert.deepEqual(candidate.headings,baseline.headings);assert.deepEqual(candidate.hero,baseline.hero);assert.deepEqual(candidate.attributes,baseline.attributes);assert.equal(candidate.caption,baseline.caption);
      for(const key of ['width','height']){assert(Math.abs(candidate.box[key]-baseline.box[key])<1,'Video geometry changed');}
      assert.equal(candidate.anchors.length,baseline.anchors.length);
      baseline.anchors.forEach((a,i)=>{const b=candidate.anchors[i];assert.equal(a.hash,b.hash);assert(Math.abs(a.y-b.y)<2,'Native fragment landing changed');});
      const row={engine,...c,playback:true,focus:true,print:true,anchors:candidate.anchors.length,status:'success'};results.push(row);console.log(JSON.stringify(row));
    }
  }catch(error){results.push({status:'failure',error:String(error)});throw error;}
  finally{fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(results,null,2));await browser.close();servers.forEach(s=>s.server.close());}
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1;});
