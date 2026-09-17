'use strict';
// Temporary, isolated local comparison. Not a site or tracking-code change.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const {spawn} = require('node:child_process');
const root=process.cwd(),output=process.env.PERF_RESULTS;
if(!output||!process.env.LIGHTHOUSE_CLI)throw Error('Missing paths');
fs.mkdirSync(output,{recursive:true});
const defer='.home-photo:lang(ja) main>section:not(.hero){content-visibility:auto;contain-intrinsic-size:auto 600px}';
const breaks='.home-photo:lang(ja),.home-photo:lang(ja) h1,.home-photo:lang(ja) h2,.home-photo:lang(ja) h3,.home-photo:lang(ja) h4{word-break:normal}';
const wrap=s=>'@media screen and (max-width:1023px){'+s+'}';
const variants=process.env.CONFIRM==='1'?{baseline:'',combined:wrap(defer+breaks)}:{baseline:'',deferred:wrap(defer),combined:wrap(defer+breaks)};
const runs=process.env.CONFIRM==='1'?5:3;
const protocol={source:'4ff1cde9b24776458dab420284a5e090ac38beeb',phase:runs===5?'independent confirmation':'screening',variants,runsPerVariant:runs,scope:'Japanese homepage on mobile screens only; desktop, print and English unchanged',conditions:'Lighthouse 12.8.2 standard simulated mobile; same host/local gzip; cold browser; no request interception; localhost naturally does not initialize production GA',acceptance:'Median paired LCP reduction >=150ms, median score not lower, at least 4/5 pairs no more than100ms slower in confirmation, CLS<=.01 and non-performance categories100; functional/scroll/anchor/print checks mandatory before adoption'};
fs.writeFileSync(path.join(output,'protocol.json'),JSON.stringify(protocol,null,2));
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.avif':'image/avif','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4'};
const original=fs.readFileSync(path.join(root,'index.html'),'utf8'),servers=[],rows=[];
async function server(variant,index){
 const srv=http.createServer((req,res)=>{try{
   const u=new URL(req.url,'http://localhost');let f=path.resolve(root,'.'+decodeURIComponent(u.pathname));
   if(f!==root&&!f.startsWith(root+path.sep))throw Error('Invalid path');
   if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
   if(!fs.existsSync(f)&&!path.extname(f)&&fs.existsSync(f+'.html'))f+='.html';
   let b=f===path.join(root,'index.html')?Buffer.from(original.replace('</head>','<style data-render-experiment>'+variants[variant]+'</style></head>')):fs.readFileSync(f);
   const type=types[path.extname(f)]||'application/octet-stream';res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');
   if(/text|json|svg/.test(type)&&/gzip/.test(req.headers['accept-encoding']||'')){b=zlib.gzipSync(b);res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');}
   res.setHeader('Content-Length',b.length);res.end(b);
  }catch{res.writeHead(404);res.end();}});
 await new Promise((resolve,reject)=>{srv.once('error',reject);srv.listen(18765+index,'127.0.0.1',resolve);});servers.push(srv);
}
const median=v=>{v=[...v].sort((a,b)=>a-b);return v[Math.floor(v.length/2)];};
async function measure(variant,run){
 const label=variant+'-'+run,index=Object.keys(variants).indexOf(variant),log=fs.openSync(path.join(output,label+'.log'),'w');
 const args=[process.env.LIGHTHOUSE_CLI,'http://127.0.0.1:'+(18765+index)+'/','--only-categories=performance,accessibility,best-practices,seo','--save-assets','--output=json','--output-path='+path.join(output,label+'.json'),'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--quiet'];
 try{await new Promise((resolve,reject)=>{const c=spawn(process.execPath,args,{stdio:['ignore',log,log]});const timer=setTimeout(()=>{c.kill('SIGTERM');reject(Error('Timeout '+label));},90000);c.once('error',reject);c.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Exit '+code+' '+label));});});}finally{fs.closeSync(log);}
 const r=JSON.parse(fs.readFileSync(path.join(output,label+'.json'),'utf8'));if(r.runtimeError)throw Error(JSON.stringify(r.runtimeError));
 const a=r.audits;rows.push({variant,run,score:r.categories.performance.score*100,lcp:a['largest-contentful-paint'].numericValue,fcp:a['first-contentful-paint'].numericValue,tbt:a['total-blocking-time'].numericValue,cls:a['cumulative-layout-shift'].numericValue,bytes:a['total-byte-weight'].numericValue,observedLcp:a.metrics.details.items[0].observedLargestContentfulPaint,categories:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.score]))});
 fs.writeFileSync(path.join(output,'rows.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.at(-1)));
}
(async()=>{try{
 const keys=Object.keys(variants);for(let i=0;i<keys.length;i++)await server(keys[i],i);
 for(let run=1;run<=runs;run++){const order=run%2?keys:[...keys].reverse();for(const v of order)await measure(v,run);}
 const summary=Object.fromEntries(keys.map(v=>{const rs=rows.filter(r=>r.variant===v);return[v,{scores:rs.map(r=>r.score),medianScore:median(rs.map(r=>r.score)),medianLcp:median(rs.map(r=>r.lcp)),allChecks:rs.every(r=>r.cls<=.01&&Object.entries(r.categories).filter(([k])=>k!=='performance').every(([,x])=>x===1))}];}));
 for(const v of keys.slice(1)){const saving=Array.from({length:runs},(_,i)=>rows.find(r=>r.variant==='baseline'&&r.run===i+1).lcp-rows.find(r=>r.variant===v&&r.run===i+1).lcp);summary[v].pairedSavings=saving;summary[v].medianPairedSaving=median(saving);summary[v].advance=median(saving)>=150&&summary[v].medianScore>=summary.baseline.medianScore&&summary[v].allChecks&&(runs!==5||saving.filter(v=>v>=-100).length>=4);}
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));console.log('SUMMARY '+JSON.stringify(summary));
 if(process.env.QA_SCRIPT){const {run}=require(path.resolve(process.env.QA_SCRIPT));await run({ports:Object.fromEntries(keys.map((v,i)=>[v,18765+i])),output,root});}
}finally{for(const s of servers)s.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
