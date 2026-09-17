import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
export async function main(){
const require=createRequire(import.meta.url),pw=require('playwright');
const [baseline,candidate]=process.argv.slice(2).map(p=>fs.realpathSync(p));
assert(baseline&&candidate&&baseline!==candidate,'Two distinct site checkouts are required');
const engine=process.env.QA_BROWSER||'chromium';
const output=process.env.QA_RESULTS||'/tmp/section-qa';fs.mkdirSync(output,{recursive:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg'};
async function serve(root){
 const server=http.createServer((req,res)=>{try{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==root&&!file.startsWith(root+path.sep))throw Error('Outside root');
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  let data=fs.readFileSync(file);const type=types[path.extname(file)]||'application/octet-stream';
  res.setHeader('Content-Type',type);
  if(/text\/|json|svg/.test(type)&&/gzip/.test(req.headers['accept-encoding']||'')){data=zlib.gzipSync(data);res.setHeader('Content-Encoding','gzip');}
  res.setHeader('Content-Length',data.length);res.end(data);
 }catch{res.writeHead(404);res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {server,url:'http://127.0.0.1:'+server.address().port};
}
const servers=await Promise.all([serve(baseline),serve(candidate)]);
const options=engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{};
const browser=await pw[engine].launch(options),results=[];
const cases=[{width:320,js:true},{width:412,js:true},{width:768,js:true},{width:1440,js:true},{width:390,js:false}];
async function measurePage(url,label,c){
 const context=await browser.newContext({viewport:{width:c.width,height:823},javaScriptEnabled:c.js,reducedMotion:'reduce'});
 const page=await context.newPage();
 try{
  await page.goto(url+'/',{waitUntil:'networkidle'});await wait(500);
  await page.reload({waitUntil:'networkidle'});await wait(500);
  const headings=await page.locator('h1,h2,h3').allTextContents();
  const hero=await page.locator('.hero').boundingBox();
  await page.screenshot({path:path.join(output,`${engine}-${c.width}-${c.js}-${label}-top.png`)});
  const sections=page.locator('main > section'),count=await sections.count(),heights=[];
  for(let i=0;i<count;i++){
   const section=sections.nth(i);await section.scrollIntoViewIfNeeded();await wait(400);
   assert(await section.isVisible(),'Section is not visible '+i);
   const box=await section.boundingBox();assert(box&&box.height>0,'Empty section '+i);heights.push(box.height);
   if(i===Math.floor(count/2)||i===count-1)await page.screenshot({path:path.join(output,`${engine}-${c.width}-${c.js}-${label}-section-${i}.png`)});
  }
  const hashes=await page.locator('a[href^="#"]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('href')).filter(v=>v&&v.length>1))]);
  const anchors=[];
  for(const hash of hashes){
   const id=decodeURIComponent(hash.slice(1));const target=page.locator('[id='+JSON.stringify(id)+']');
   if(await target.count()!==1)continue;
   await page.goto(url+'/'+hash,{waitUntil:'load'});await page.reload({waitUntil:'load'});await wait(600);
   const box=await target.boundingBox();anchors.push({hash,y:box?.y,height:box?.height});
  }
  await page.goto(url+'/',{waitUntil:'networkidle'});await wait(300);
  const lastLink=page.locator('main a[href*="apps.apple.com"]').last();await lastLink.focus();await wait(400);
  const focus=await lastLink.boundingBox();assert(focus&&focus.y<823&&focus.y+focus.height>0,'Focused CTA is outside viewport');
  await page.emulateMedia({media:'print'});await wait(300);
  const printHeights=await page.locator('main > section').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,visibility:getComputedStyle(n).contentVisibility})));
  // Existing shared CSS already uses auto on four sections; compare actual print styles and geometry against the baseline below.
  await page.emulateMedia({media:'screen'});
  await page.goto(url+'/en/',{waitUntil:'networkidle'});await wait(300);
  await page.reload({waitUntil:'networkidle'});await wait(300);
  for(const section of await page.locator('main > section').all()){await section.scrollIntoViewIfNeeded();await wait(80);}
  const enHeight=await page.locator('main').boundingBox();
  const enDeferred=await page.locator('main > section').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).contentVisibility!=='visible').length);
  // Four existing English sections also use auto; require the exact same count as baseline.
  return {headings,hero,heights,anchors,printHeights,enHeight,enDeferred};
 }finally{await context.close();}
}
try{
 for(const c of cases){
  const a=await measurePage(servers[0].url,'baseline',c);
  const b=await measurePage(servers[1].url,'candidate',c);
  fs.writeFileSync(path.join(output,`${engine}-${c.width}-${c.js}-geometry.json`),JSON.stringify({baseline:a,candidate:b},null,2));
  assert.deepEqual(b.headings,a.headings,'Headings changed');
  assert.deepEqual(b.hero,a.hero,'Hero geometry changed');
  assert.equal(b.heights.length,a.heights.length,'Section count changed');
  a.heights.forEach((h,i)=>assert(Math.abs(h-b.heights[i])<1,`Section ${i} height ${h} vs ${b.heights[i]}`));
  assert.equal(b.anchors.length,a.anchors.length,'Anchor count changed');
  a.anchors.forEach((anchor,i)=>{assert.equal(b.anchors[i].hash,anchor.hash);assert(Math.abs(anchor.y-b.anchors[i].y)<2,`Anchor ${anchor.hash} moved: ${anchor.y} vs ${b.anchors[i].y}`);});
  a.printHeights.forEach((n,i)=>{assert.equal(b.printHeights[i].visibility,n.visibility,'Print style changed '+i);assert(Math.abs(n.height-b.printHeights[i].height)<1,'Print geometry changed '+i);});
  assert.deepEqual(b.enHeight,a.enHeight,'English geometry changed');assert.equal(b.enDeferred,a.enDeferred,'English rendering policy changed');
  const result={browser:engine,width:c.width,javascript:c.js,sections:a.heights.length,anchors:a.anchors.length,status:'success'};
  results.push(result);console.log(JSON.stringify(result));
 }
}catch(error){results.push({status:'failure',error:String(error)});throw error;}
finally{
 fs.writeFileSync(path.join(output,engine+'-summary.json'),JSON.stringify(results,null,2));
 await browser.close();servers.forEach(s=>s.server.close());
}

}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
