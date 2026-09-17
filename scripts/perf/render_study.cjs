'use strict';
// Branch-only experiment. Never publish a variant or modify the checked-out site.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const OUT = process.env.PERF_RESULTS;
if (!OUT) throw new Error('PERF_RESULTS is required');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'fef330a2d305a704d0c214b43959ee145f488567';
const variants = ['baseline', 'section-defer', 'font-swap'];
const DEFER = '@media screen{.home-photo main>section:not(.hero){content-visibility:auto;contain-intrinsic-size:auto 1000px}.home-photo main>section:target{content-visibility:visible}}';
function transform(html, variant) {
  if (variant === 'baseline') return html;
  if (variant === 'section-defer') return html.replace('</head>', '<style data-render-study="section-defer">' + DEFER + '</style>\n</head>');
  if (variant === 'font-swap') return html.replace(/(<style data-home-perf="base">)([\s\S]*?)(<\/style>)/, (_, open, css, close) => open + css.replace(/font-display:optional/g, 'font-display:swap') + close);
  throw new Error('Unknown variant');
}
const mimes = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.avif':'image/avif','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
async function server(variant, port) {
  const s = http.createServer((req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let file = path.resolve(ROOT, '.' + name);
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file) && !path.extname(file)) file += '.html';
      let data = fs.readFileSync(file);
      if (file === path.join(ROOT, 'index.html') || file === path.join(ROOT, 'en/index.html')) data = Buffer.from(transform(data.toString(), variant));
      const type = mimes[path.extname(file)] || 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'no-store');
      if (/text\/|json|svg/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) { data = zlib.gzipSync(data); res.setHeader('Content-Encoding','gzip'); res.setHeader('Vary','Accept-Encoding'); }
      res.setHeader('Content-Length', data.length); res.end(data);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { s.once('error', reject); s.listen(port, '127.0.0.1', resolve); });
  return s;
}
function metric(report, key) {
  const value = report.audits[key]?.numericValue;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid metric: ' + key);
  return value;
}
async function measure(url, label, extra = []) {
  const logfile = fs.openSync(path.join(OUT, label + '.log'), 'w');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [require.resolve('lighthouse/cli/index.js'), url, '--only-categories=performance,accessibility,best-practices,seo','--output=json','--output-path=' + path.join(OUT,label+'.json'),'--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage','--quiet', ...extra], { stdio: ['ignore', logfile, logfile] });
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(label + ': timeout')); }, 90000);
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(label + ': exit ' + code)); });
    });
  } finally { fs.closeSync(logfile); }
  const r = JSON.parse(fs.readFileSync(path.join(OUT,label+'.json')));
  if (r.runtimeError || r.lighthouseVersion !== '12.8.2' || r.configSettings.formFactor !== 'mobile' || r.configSettings.blockedUrlPatterns?.length) throw new Error(label + ': changed measurement conditions');
  const row = {label, url, at:r.fetchTime, score:r.categories.performance.score*100,
    lcp:metric(r,'largest-contentful-paint'), fcp:metric(r,'first-contentful-paint'), cls:metric(r,'cumulative-layout-shift'), tbt:metric(r,'total-blocking-time'), bytes:metric(r,'total-byte-weight'),
    observed:r.audits.metrics?.details?.items?.[0], categories:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,v.score]))};
  console.log(JSON.stringify({label,score:row.score,lcp:row.lcp,fcp:row.fcp,cls:row.cls,bytes:row.bytes}));
  return row;
}
const median = xs => { const s=[...xs].sort((a,b)=>a-b); return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2; };
async function main() {
  const protocol = {base:BASE, commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(), variants, language:'ja', runsEach:5,
    order:'deterministic balanced rotation, same runner, fresh browser each', productionTraceRuns:3,
    rule:'Experimental screen only. Advance a candidate only with >=150ms paired-median LCP saving, no lower median score, every CLS <=0.01 and all non-performance categories 100. No winner is automatically deployed; independent confirmation and full functional checks required.',
    interpretation:'Lighthouse 12.8.2 default simulated mobile. No request interception. Localhost naturally does not initialize production GA. Traces and adverse results retained. Neither local scores nor before/after host variation establish production or CrUX improvements.'};
  fs.writeFileSync(path.join(OUT,'protocol.json'),JSON.stringify(protocol,null,2));
  for (const file of ['index.html','en/index.html','assets/css/home-hero.css','assets/css/style.min.css']) {
    const before=execFileSync('git',['show',BASE+':'+file],{cwd:ROOT});
    if (!before.equals(fs.readFileSync(path.join(ROOT,file)))) throw new Error('Experimental base changed: '+file);
  }
  const servers=[]; const rows=[];
  try {
    for (let i=0;i<variants.length;i++) servers.push(await server(variants[i], 8765+i));
    for (let run=1;run<=5;run++) {
      const order=run%2?[...variants.slice(run%3),...variants.slice(0,run%3)]:[...variants].reverse();
      for (const v of order) { rows.push(await measure('http://127.0.0.1:'+(8765+variants.indexOf(v))+'/',v+'-'+run)); fs.writeFileSync(path.join(OUT,'rows.json'),JSON.stringify(rows,null,2)); }
    }
    const summary={};
    for (const v of variants) {
      const selected=rows.filter(r=>r.label.startsWith(v+'-'));
      const paired=selected.map(r=>rows.find(b=>b.label==='baseline-'+r.label.split('-').at(-1)).lcp-r.lcp);
      summary[v]={n:selected.length, scores:selected.map(r=>r.score), lcp:selected.map(r=>r.lcp), medianLcp:median(selected.map(r=>r.lcp)), medianFcp:median(selected.map(r=>r.fcp)), medianBytes:median(selected.map(r=>r.bytes)), pairedSavings:paired, medianPairedSaving:median(paired), allCls:selected.map(r=>r.cls)};
    }
    fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(summary,null,2)); console.log('SUMMARY',JSON.stringify(summary));
    for (let run=1;run<=3;run++) rows.push(await measure('https://simplememofast.com/','production-trace-'+run,['--save-assets']));
    fs.writeFileSync(path.join(OUT,'rows.json'),JSON.stringify(rows,null,2));
  } finally { for (const s of servers) s.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
