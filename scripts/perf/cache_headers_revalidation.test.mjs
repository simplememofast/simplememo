import test from 'node:test';
import assert from 'node:assert/strict';
import { cachePolicy, onRequest, IMMUTABLE, REVALIDATE } from '../../functions/assets/home-perf/_middleware.js';
const asset = '/assets/home-perf/noto-ja-bold-subset-a2217dddbd7b.woff2';
const image = '/assets/home-perf/hero-750-a5754635505f.avif';
const manifest = '/assets/home-perf/manifest.json';
const req = (path = asset, headers = {}, method = 'GET') => new Request('https://simplememofast.com' + path, { method, headers: { 'if-none-match': '"synthetic"', ...headers } });
const res = (headers = {}, status = 304) => new Response(null, { status, headers: { 'cache-control': 'public, no-cache, public, max-age=604800, immutable', ...headers } });

test('conditional GET and HEAD receive the same policy with omitted Content-Type', () => {
  for (const method of ['GET', 'HEAD']) for (const [path, policy] of [[asset, IMMUTABLE], [image, IMMUTABLE], [manifest, REVALIDATE]]) {
    assert.equal(cachePolicy(req(path, {}, method), res()), policy);
  }
});
test('If-Modified-Since is a conditional read, not only If-None-Match', () => {
  assert.equal(cachePolicy(new Request('https://simplememofast.com' + manifest, { headers: { 'if-modified-since': 'Wed, 16 Sep 2026 00:00:00 GMT' } }), res()), REVALIDATE);
});
test('unsolicited 304 and missing Content-Type on 200 stay ineligible', () => {
  for (const path of [asset, image, manifest]) {
    assert.equal(cachePolicy(new Request('https://simplememofast.com' + path), res()), null);
    assert.equal(cachePolicy(req(path), res({}, 200)), null);
  }
});
test('a declared conflicting or empty Content-Type never qualifies', () => {
  for (const path of [asset, image, manifest]) for (const type of ['', 'text/html', 'text/plain', 'application/octet-stream']) {
    assert.equal(cachePolicy(req(path), res({ 'content-type': type })), null);
  }
  for (const [path, type, policy] of [[asset, 'font/woff2', IMMUTABLE], [image, 'image/avif', IMMUTABLE], [manifest, 'application/json; charset=utf-8', REVALIDATE]]) {
    assert.equal(cachePolicy(req(path), res({ 'content-type': type })), policy);
  }
});
test('conditional reads preserve every privacy and range exclusion', () => {
  for (const path of [asset, manifest]) {
    for (const headers of [{authorization: 'Bearer synthetic'}, {range: 'bytes=0-9'}]) assert.equal(cachePolicy(req(path, headers), res()), null);
    for (const headers of [{'set-cookie':'synthetic=1'}, {'cache-control':'private'}, {'cache-control':'no-store'}, {'cache-control':'PRIVATE="set-cookie"'}, {vary:'Cookie'}, {vary:'Accept-Encoding, Authorization'}, {vary:'*'}]) assert.equal(cachePolicy(req(path), res(headers)), null);
  }
});
test('conditional status cannot widen the path, method or error-status scope', () => {
  for (const path of ['/', '/en/', '/admin/x-123456789abc.woff2', '/assets/fonts/x-123456789abc.woff2', '/assets/home-perf/noto.woff2', '/assets/home-perf/sub/x-123456789abc.avif', '/assets/home-perf/x-ABCDEF123456.avif', '/assets/home-perf/x-%61bcdef123456.avif', '/assets/home-perf/manifest.json/']) assert.equal(cachePolicy(req(path), res()), null);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal(cachePolicy(req(asset, {}, method), res()), null);
  for (const status of [201, 206, 301, 400, 401, 403, 404, 410, 500]) assert.equal(cachePolicy(req(), res({}, status)), null);
});
test('304 is bodyless; status validators and security metadata survive exactly', async () => {
  for (const path of [asset, manifest]) {
    const headers = {etag:'"synthetic"','last-modified':'Wed, 16 Sep 2026 00:00:00 GMT','access-control-allow-origin':'*','x-content-type-options':'nosniff',vary:'Accept-Encoding'};
    const upstream = res(headers);let calls=0;
    const actual = await onRequest({request:req(path),next:async()=>{calls++;return upstream;}});
    assert.equal(calls,1);assert.equal(actual.status,304);assert.equal(actual.body,null);assert.equal(await actual.text(),'');
    assert.equal(actual.headers.get('cache-control'),path===manifest?REVALIDATE:IMMUTABLE);
    for(const [key,value] of Object.entries(headers))assert.equal(actual.headers.get(key),value);
    assert.equal(actual.headers.has('content-type'),false);
  }
});
test('unchanged conditional policies retain identity and upstream failures propagate', async () => {
  const upstream = res({'cache-control':IMMUTABLE});
  assert.equal(await onRequest({request:req(),next:async()=>upstream}),upstream);
  await assert.rejects(onRequest({request:req(),next:async()=>{throw Error('upstream failure');}}),/upstream failure/);
});
