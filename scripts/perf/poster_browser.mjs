import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4'};

export async function main(){
  const root=fs.realpathSync(process.argv[2]||new URL('../../',import.meta.url).pathname);
  const output=process.env.QA_RESULTS;
  const engine=process.env.QA_BROWSER||'chromium';
  assert(output,'QA_RESULTS required');
  fs.mkdirSync(output,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/home-perf/manifest.json')));
  const posters=Object.keys(manifest.assets).filter(p=>/launch-1s-poster-1280-[0-9a-f]{12}\.webp$/.test(p));
  assert.equal(posters.length,1,'Exactly one generated poster is required');
  const posterPath='/'+posters[0], results=[];
  const server=http.createServer((req,res)=>{
    try{
      let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(file!==root&&!file.startsWith(root+path.sep))throw Error('Outside root');
      if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      let data=fs.readFileSync(file);
      const type=types[path.extname(file)]||'application/octet-stream';
      res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');
      if(type==='video/mp4'){
        res.setHeader('Accept-Ranges','bytes');
        const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if(range){
          const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),data.length-1):data.length-1;
          if(start>end){res.writeHead(416);res.end();return;}
          res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${data.length}`);
          data=data.subarray(start,end+1);
        }
      }
      res.setHeader('Content-Length',data.length);res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  const pw=require('playwright');
  const browser=await pw[engine].launch(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const poll=async(read,accept,label)=>{
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){const value=await read();if(accept(value))return value;await wait(100);}
    throw Error('Timed out: '+label);
  };
  try{
    for(const c of [{width:320,js:true},{width:412,js:true},{width:768,js:true},{width:1440,js:true},{width:390,js:false}]){
      const row={engine,...c,at:new Date().toISOString(),status:'running'};
      const ctx=await browser.newContext({viewport:{width:c.width,height:823},javaScriptEnabled:c.js,reducedMotion:'reduce'});
      ctx.setDefaultTimeout(15000);ctx.setDefaultNavigationTimeout(30000);
      await ctx.route('**/*',route=>new URL(route.request().url()).origin===origin&&route.request().method()==='GET'?route.continue():route.abort());
      try{
        const page=await ctx.newPage();
        const response=await page.goto(origin+'/',{waitUntil:'networkidle'});assert.equal(response.status(),200);
        const video=page.locator('main > figure.lp-video > video');assert.equal(await video.count(),1);
        const attrs=await video.evaluate(n=>Object.fromEntries([...n.attributes].map(a=>[a.name,a.value])));
        assert.equal(attrs.poster,posterPath);assert.equal(attrs.preload,'none');assert('controls' in attrs);assert('playsinline' in attrs);assert(!('autoplay' in attrs));
        assert.equal(await video.locator('source').getAttribute('src'),'/assets/video/launch-1s.mp4');
        await video.evaluate(n=>{window.__qaPoster=new Image();window.__qaPoster.src=n.poster;});
        row.decoded=await poll(()=>page.evaluate(()=>({complete:window.__qaPoster.complete,width:window.__qaPoster.naturalWidth,height:window.__qaPoster.naturalHeight})),v=>v.complete&&v.width===1280&&v.height===720,'poster decode');
        await video.scrollIntoViewIfNeeded();await wait(250);
        const box=await video.boundingBox();assert(box&&box.height>0&&box.y<823&&box.y+box.height>0);assert(Math.abs(box.width/box.height-16/9)<0.02,'Native video aspect ratio changed');
        row.box=box;
        await video.screenshot({path:path.join(output,`${engine}-${c.width}-${c.js}-poster.png`)});
        row.codec=await video.evaluate(n=>n.canPlayType('video/mp4; codecs="avc1.42E01E"'));
        assert(row.codec,'Runner must support the unchanged H.264 video');
        await video.evaluate(n=>{n.play().catch(e=>{n.dataset.qaError=e.name;});});
        row.playback=await poll(()=>video.evaluate(n=>({time:n.currentTime,paused:n.paused,width:n.videoWidth,height:n.videoHeight,error:n.error?.code||n.dataset.qaError||null})),v=>!v.paused&&v.time>0.15&&v.width===1280,'native playback');
        assert.equal(row.playback.error,null);assert.equal(row.playback.height,720);
        await video.evaluate(n=>n.pause());
        const caption=page.locator('figure.lp-video figcaption a');await caption.focus();assert(await caption.evaluate(n=>document.activeElement===n));
        row.focus=true;
        await page.emulateMedia({media:'print'});
        const printed=await video.boundingBox();assert(printed&&printed.height>0);row.print=true;
        await page.emulateMedia({media:'screen'});
        const fragment=await ctx.newPage();const targetResponse=await fragment.goto(origin+'/#features',{waitUntil:'networkidle'});assert.equal(targetResponse.status(),200);await wait(300);
        const target=await fragment.locator('#features').boundingBox();assert(target&&target.y<823&&target.y+target.height>0);row.fragmentY=target.y;
        assert.equal(await fragment.locator('figure.lp-video').evaluate(n=>getComputedStyle(n).contentVisibility),'visible','Rejected figure containment must not return');
        assert.equal(await fragment.locator('figure.lp-video video').evaluate(n=>getComputedStyle(n).contentVisibility),'visible','Rejected video containment must not return');
        row.status='success';results.push(row);console.log(JSON.stringify(row));
      }catch(error){row.status='failure';row.error=String(error);results.push(row);throw error;}
      finally{await ctx.close();fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(results,null,2)+'\n');}
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
