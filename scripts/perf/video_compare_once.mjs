import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const source=fs.realpathSync(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const {withoutVideoRule}=await import(pathToFileURL(path.join(source,'scripts/perf/video_rule.mjs')));
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
if(commit!=='c221e3cd69276b4dbb8b5da6f54de4a4414d84ac')throw Error('Wrong comparison source');
const protocol={source:commit,lighthouse:'12.8.2',pairs:5,order:'baseline/candidate then candidate/baseline alternately',scope:'Independent integrated element-only confirmation; Japanese fonts-noto-cjk installed as in the screened element experiment. Same-runner gzip loopback, fresh default simulated-mobile browsers; no Lighthouse interception. Hostname-guarded production GA naturally does not initialize on localhost. Not production or CrUX.',acceptance:{layoutMedianReductionAtLeast:0.1,lcpMedianRegressionMaxMs:100,scoreMedianNotLower:true,allClsMax:0.01,allOtherCategories100:true},sourceHashes:{}};
for(const name of ['index.html','en/index.html','assets/css/home-hero.css']){const data=fs.readFileSync(path.join(source,name));withoutVideoRule(data.toString());protocol.sourceHashes[name]=createHash('sha256').update(data).digest('hex');}
fs.writeFileSync(path.join(out,'protocol.json'),JSON.stringify(protocol,null,2));
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
async function serve(control){
 const server=http.createServer((req,res)=>{try{
  let file=path.resolve(source,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file!==source&&!file.startsWith(source+path.sep))throw Error('Outside source');
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  let data=fs.readFileSync(file);const type=types[path.extname(file)]||'application/octet-stream';
  if(control&&['index.html','en/index.html','assets/css/home-hero.css'].includes(path.relative(source,file)))data=Buffer.from(withoutVideoRule(data.toString()));
  res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');
  if(/text\/|json|svg/.test(type)&&/gzip/.test(req.headers['accept-encoding']||'')){data=zlib.gzipSync(data);res.setHeader('Content-Encoding','gzip');}
  res.setHeader('Content-Length',data.length);res.end(data);
 }catch{res.writeHead(404);res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {server,url:'http://127.0.0.1:'+server.address().port+'/'};
}
const servers=await Promise.all([serve(true),serve(false)]),rows=[];
const median=values=>{const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
async function measure(variant,run){
 const label=variant+'-'+run,url=servers[variant==='baseline'?0:1].url,report=path.join(out,label+'.json'),log=fs.openSync(path.join(out,label+'.log'),'w');
 const args=[path.join(process.env.COMPARE_TOOLS,'node_modules/lighthouse/cli/index.js'),url,'--only-categories=performance,accessibility,best-practices,seo','--output=json','--output-path='+report,'--save-assets','--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--quiet'];
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env:{...process.env,CHROME_PATH:'/usr/bin/google-chrome'},stdio:['ignore',log,log]});const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Timeout '+label));},120000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);fs.closeSync(log);code===0?resolve():reject(Error('Lighthouse exit '+code+' '+label));});});
 const r=JSON.parse(fs.readFileSync(report)),c=r.configSettings,a=r.audits;
 if(r.runtimeError||r.lighthouseVersion!=='12.8.2'||r.requestedUrl!==url||r.finalDisplayedUrl!==url||c.formFactor!=='mobile'||c.throttlingMethod!=='simulate'||c.blockedUrlPatterns?.length||c.disableStorageReset!==false)throw Error('Invalid measurement '+label);
 const categories=Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.score]));
 if(Object.values(categories).some(v=>!finite(v)||v>1))throw Error('Invalid category '+label);
 const row={variant,run,at:r.fetchTime,host:r.environment.hostUserAgent,load:os.loadavg(),score:categories.performance*100,lcp:a['largest-contentful-paint'].numericValue,fcp:a['first-contentful-paint'].numericValue,tbt:a['total-blocking-time'].numericValue,cls:a['cumulative-layout-shift'].numericValue,bytes:a['total-byte-weight'].numericValue,layout:a['mainthread-work-breakdown'].details.items.find(v=>v.group==='styleLayout')?.duration,categories,reportSha256:createHash('sha256').update(fs.readFileSync(report)).digest('hex')};
 for(const key of ['score','lcp','fcp','tbt','cls','bytes','layout'])if(!finite(row[key]))throw Error('Invalid '+key+' '+label);
 rows.push(row);fs.writeFileSync(path.join(out,'rows.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
}
let summary;
try{
 for(let run=1;run<=5;run++)for(const variant of run%2?['baseline','candidate']:['candidate','baseline'])await measure(variant,run);
 const groups=Object.fromEntries(['baseline','candidate'].map(v=>{const selected=rows.filter(r=>r.variant===v);return[v,{scores:selected.map(r=>r.score),...Object.fromEntries(['score','lcp','fcp','tbt','cls','bytes','layout'].map(k=>[k,{min:Math.min(...selected.map(r=>r[k])),median:median(selected.map(r=>r[k])),max:Math.max(...selected.map(r=>r[k]))}]))}];}));
 const reduction=1-groups.candidate.layout.median/groups.baseline.layout.median;
 const paired=rows.filter(r=>r.variant==='baseline').map(r=>r.lcp-rows.find(v=>v.variant==='candidate'&&v.run===r.run).lcp);
 const accepted=reduction>=0.1&&groups.candidate.lcp.median<=groups.baseline.lcp.median+100&&groups.candidate.score.median>=groups.baseline.score.median&&rows.filter(r=>r.variant==='candidate').every(r=>r.cls<=0.01&&Object.entries(r.categories).every(([k,v])=>k==='performance'||v===1));
 summary={protocol,groups,layoutReduction:reduction,pairedLcpSavingsMs:paired,medianPairedSavingMs:median(paired),accepted,rows};
 if(!accepted)process.exitCode=1;
}catch(error){summary={protocol,accepted:false,error:String(error),rows};process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log('SUMMARY '+JSON.stringify(summary));for(const s of servers)s.server.close();}
