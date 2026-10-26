// Draft only. Not started or runtime validated. No third-party dependencies.
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const routes = new Map([
  ['/positive.html', {file:'positive.html',type:'text/html; charset=utf-8'}],
  ['/performance-negative.html', {file:'performance-negative.html',type:'text/html; charset=utf-8'}],
  ['/delayed-hero.avif', {file:'delayed-hero.avif',type:'image/avif',delay:4000}],
]);
for (const route of routes.values()) route.body = readFileSync(new URL(route.file, import.meta.url));
const robots = Buffer.from('User-agent: *\nAllow: /\n');
const maxRequests = 64;
const maxBytes = 1024 * 1024;
let requests = 0;
let scheduledBytes = 0;
const timers = new Set();
const server = http.createServer({maxHeaderSize:4096}, (req,res) => {
  requests++;
  if (requests > maxRequests || !['GET','HEAD'].includes(req.method)) {
    res.writeHead(429); res.end(); return;
  }
  let route = routes.get(req.url);
  if (req.url === '/robots.txt') route = {body:robots,type:'text/plain; charset=utf-8'};
  if (!route) { res.writeHead(404); res.end(); return; }
  scheduledBytes += route.body.length;
  if (scheduledBytes > maxBytes) { res.writeHead(429); res.end(); return; }
  const accepted = performance.now();
  const send = () => {
    if (res.destroyed) return;
    res.writeHead(200, {'Content-Type':route.type,'Content-Length':route.body.length,
      'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : route.body);
    console.log(JSON.stringify({path:req.url,method:req.method,status:200,bytes:route.body.length,delayMs:performance.now()-accepted}));
  };
  if (route.delay) {
    const timer = setTimeout(() => { timers.delete(timer); send(); }, route.delay);
    timers.add(timer);
  } else send();
});
server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.keepAliveTimeout = 1000;
function stop() {
  for (const timer of timers) clearTimeout(timer);
  server.closeAllConnections();
  server.close();
  clearTimeout(lifetime);
}
const lifetime = setTimeout(stop, 250000);
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
server.listen(8766, '127.0.0.1', () => {
  console.log(JSON.stringify({status:'listening',host:'127.0.0.1',port:server.address().port,
    maxRequests,maxBytes,lifetimeMs:250000,root:fileURLToPath(new URL('.',import.meta.url))}));
});
