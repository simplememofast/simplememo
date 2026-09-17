import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { cachePolicy, onRequest, PREFIX, IMMUTABLE, REVALIDATE } from '../../functions/assets/home-perf/_middleware.js';
const ROOT = new URL('../../', import.meta.url);
const asset = 'noto-ja-bold-subset-a2217dddbd7b.woff2';
const request = (file = asset, init = {}) => new Request('https://simplememofast.com' + PREFIX + file, init);
const response = (headers = {}, status = 200) => new Response(status === 304 ? null : 'exact static bytes', { status, headers: { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=604800, immutable', ...headers } });

test('all current generated assets have real content-hash filenames and qualify', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('assets/home-perf/manifest.json', ROOT)));
  assert.ok(Object.keys(manifest.assets).length > 0);
  for (const [file, expected] of Object.entries(manifest.assets)) {
    const hash = createHash('sha256').update(fs.readFileSync(new URL(file, ROOT))).digest('hex');
    assert.equal(hash, expected.sha256); assert.ok(file.includes('-' + hash.slice(0, 12) + '.'));
    const contentType = file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.webp') ? 'image/webp' : 'image/avif';
    assert.equal(cachePolicy(new Request('https://simplememofast.com/' + file), response({ 'content-type': contentType })), IMMUTABLE);
  }
});
test('manifest remains revalidated, not immutable', () => {
  assert.equal(cachePolicy(request('manifest.json'), response({ 'content-type': 'application/json; charset=utf-8' })), REVALIDATE);
  assert.equal(cachePolicy(request('manifest.json'), response({ 'content-type': 'text/html' })), null);
});
test('HEAD, query strings and a preview host keep the same content-addressed policy', () => {
  assert.equal(cachePolicy(request(asset + '?v=testing', { method: 'HEAD' }), response()), IMMUTABLE);
  assert.equal(cachePolicy(new Request('https://example.simplememo-596.pages.dev' + PREFIX + asset), response()), IMMUTABLE);
});
test('never override error statuses or other methods', () => {
  for (const status of [201, 206, 301, 304, 400, 401, 403, 404, 410, 500]) assert.equal(cachePolicy(request(), response({}, status)), null);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal(cachePolicy(request(asset, {method}), response()), null);
});
test('keep authenticated ranged private cookie and user-varying responses untouched', () => {
  for (const headers of [{authorization:'Bearer synthetic'}, {range:'bytes=0-9'}]) assert.equal(cachePolicy(request(asset,{headers}),response()),null);
  for (const headers of [{'cache-control':'private, max-age=0'}, {'cache-control':'public, no-store'}, {'cache-control':'PRIVATE="set-cookie"'}, {'set-cookie':'synthetic=1'}, {vary:'Cookie'}, {vary:'Accept-Encoding, Authorization'}, {vary:'*'}]) assert.equal(cachePolicy(request(), response(headers)), null);
});
test('do not accidentally grant immutable cache to unversioned metadata aliases or HTML', () => {
  for (const file of ['manifest.json','noto-ja.woff2','x-1234.woff2','x-ABCDEF123456.avif','dir/'+asset,'%2e%2e/'+asset,'x-123456789abc.js',asset+'/']) assert.equal(cachePolicy(request(file), response()), null);
  for (const url of ['https://simplememofast.com/','https://simplememofast.com/en/','https://simplememofast.com/admin/'+asset,'https://simplememofast.com/assets/fonts/'+asset]) assert.equal(cachePolicy(new Request(url), response()),null);
  for(const type of ['text/html','text/plain','image/png','application/octet-stream']) assert.equal(cachePolicy(request(),response({'content-type':type})),null);
});
test('next is called once, all original bytes and other headers survive, duplicate max-age removed', async () => {
  const bytes = new Uint8Array([0,1,2,255,254,87]);
  const headers = {'content-type':'font/woff2','cache-control':'public, no-cache, max-age=604800','content-encoding':'br',etag:'"synthetic"','access-control-allow-origin':'*','x-content-type-options':'nosniff',vary:'Accept-Encoding'};
  const original = new Response(bytes,{headers});let calls=0;
  const result=await onRequest({request:request(),next:async()=>{calls++;return original;}});
  assert.equal(calls,1);assert.equal(result.headers.get('cache-control'),IMMUTABLE);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
  for(const [key,value] of Object.entries(headers))if(key!=='cache-control')assert.equal(result.headers.get(key),value);
});
test('non-target and already-correct responses preserve object identity', async () => {
  for(const [req,res] of [[new Request('https://simplememofast.com/'),response()],[request(),response({'cache-control':IMMUTABLE})],[request(),response({},404)]])assert.equal(await onRequest({request:req,next:async()=>res}),res);
});
test('upstream errors propagate without fabricated successful responses',async()=>{
  await assert.rejects(onRequest({request:request(),next:async()=>{throw Error('synthetic upstream failure');}}),/upstream failure/);
});
