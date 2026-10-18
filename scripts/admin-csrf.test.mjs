// CSRF regressions for /admin/* (CWE-352): a cross-site page must not be able
// to drive the state-changing admin endpoints with the admin's Access cookie.
// Network-isolated: every outbound fetch goes to a local recorder.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const moduleURL = (src) => 'data:text/javascript,' + encodeURIComponent(src);
const sharedURL = moduleURL(read('functions/admin/api/_shared.js'));
const load = (rel) => import(moduleURL(
  read(rel).replace(/(['"])\.\/_shared\.js\1/, JSON.stringify(sharedURL))));

const { onRequest: middleware } = await load('functions/admin/_middleware.js');
const { onRequest: xPost } = await load('functions/admin/api/x-post.js');
const { onRequest: xDelete } = await load('functions/admin/api/x-delete.js');
const { onRequestPost: postTikTok } = await load('functions/admin/api/post-tiktok.js');

const SITE = 'https://simplememofast.com';
const ACCESS = { 'Cf-Access-Jwt-Assertion': 'fixture-jwt' };
const X_ENV = {};
for (const prefix of ['X_', 'X_EN_']) {
  for (const k of ['API_KEY', 'API_SECRET', 'ACCESS_TOKEN', 'ACCESS_TOKEN_SECRET']) X_ENV[prefix + k] = 'fixture';
}
const TIKTOK_ENV = { POSTIZ_API_KEY: 'fixture', POSTIZ_TIKTOK_ID: 'fixture' };

// The exploit body from the report: a text/plain form whose body parses as JSON.
const FORM_BODY = '{"text":"attacker","account":"en","x":"="}';

function adminRequest(pathname, { method = 'POST', headers = {}, body } = {}) {
  return new Request(SITE + pathname, { method, headers: { ...ACCESS, ...headers }, body });
}

async function throughMiddleware(request) {
  let reached = false;
  const response = await middleware({
    request,
    next: async () => { reached = true; return new Response('handler'); },
  });
  return { response, reached };
}

async function withFetch(fn) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ data: { id: '1' } }), { status: 201 });
  };
  try { return { result: await fn(), calls }; } finally { globalThis.fetch = original; }
}

test('middleware refuses cross-site state-changing requests before any handler runs', async () => {
  const refused = [
    ['cross-site form', { 'Origin': 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }, 'sec-fetch-site'],
    ['same-site subdomain', { 'Origin': 'https://x.simplememofast.com', 'Sec-Fetch-Site': 'same-site' }, 'sec-fetch-site'],
    ['opaque origin', { 'Origin': 'null' }, 'origin'],
    ['foreign origin only', { 'Origin': 'https://evil.example' }, 'origin'],
    ['same-origin claim with foreign Origin', { 'Origin': 'https://evil.example', 'Sec-Fetch-Site': 'same-origin' }, 'origin'],
    // A browser that sends neither header (pre-2019, or headers stripped):
    // only a body a cross-site page cannot send is accepted.
    ['legacy text/plain form', {}, 'no-origin-non-json'],
  ];
  for (const [name, headers, reason] of refused) {
    for (const pathname of ['/admin/api/x-post', '/admin/api/x-delete', '/admin/api/post-tiktok', '/admin/api/upload']) {
      const { response, reached } = await throughMiddleware(adminRequest(pathname, { headers, body: FORM_BODY }));
      assert.equal(response.status, 403, `${name} ${pathname}`);
      assert.equal(reached, false, `${name} ${pathname}`);
      assert.equal(response.headers.get('X-Auth-Debug'), `csrf=${reason}`, `${name} ${pathname}`);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
  }
  const legacyUploads = [
    ['multipart', (() => { const f = new FormData(); f.append('file', new Blob(['x'], { type: 'image/png' }), 'a.png'); return f; })()],
    ['urlencoded', new URLSearchParams({ text: 'attacker' })],
    ['no content type', new Uint8Array([123, 125])],
  ];
  for (const [name, body] of legacyUploads) {
    const { response, reached } = await throughMiddleware(adminRequest('/admin/api/upload', { body }));
    assert.equal(response.status, 403, name);
    assert.equal(reached, false, name);
  }
});

test('middleware still lets same-origin pages, JSON scripts and reads through', async () => {
  const form = new FormData();
  form.append('file', new Blob(['x'], { type: 'image/png' }), 'slide_1.png');
  const allowed = [
    ['admin UI upload', adminRequest('/admin/api/upload', {
      headers: { 'Origin': SITE, 'Sec-Fetch-Site': 'same-origin' }, body: form })],
    ['admin UI JSON', adminRequest('/admin/api/post-tiktok', {
      headers: { 'Origin': SITE, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: '{}' })],
    ['Origin only (no Fetch Metadata)', adminRequest('/admin/api/x-post', {
      headers: { 'Origin': SITE, 'Content-Type': 'application/json' }, body: '{}' })],
    ['curl / service token JSON', adminRequest('/admin/api/x-post', {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{}' })],
    ['cross-site GET', adminRequest('/admin/api/x-verify?action=env', {
      method: 'GET', headers: { 'Sec-Fetch-Site': 'cross-site' } })],
  ];
  for (const [name, request] of allowed) {
    const { response, reached } = await throughMiddleware(request);
    assert.equal(reached, true, name);
    assert.equal(response.status, 200, name);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store', name);
  }
});

test('middleware keeps refusing requests that did not pass Access, whatever their origin', async () => {
  const request = new Request(SITE + '/admin/api/x-post', {
    method: 'POST', headers: { 'Origin': SITE, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' }, body: '{}' });
  const { response, reached } = await throughMiddleware(request);
  assert.equal(response.status, 403);
  assert.equal(reached, false);
  assert.match(response.headers.get('X-Auth-Debug'), /^jwt=0 email=0 /);
});

test('JSON endpoints refuse a text/plain body that parses as JSON, before any upstream call', async () => {
  const cases = [
    ['x-post', () => xPost({ request: adminRequest('/admin/api/x-post', { body: FORM_BODY }), env: X_ENV })],
    ['x-delete', () => xDelete({ request: adminRequest('/admin/api/x-delete', { body: '{"id":"123"}' }), env: X_ENV })],
    ['post-tiktok', () => postTikTok({ request: adminRequest('/admin/api/post-tiktok', {
      body: '{"images":[{"id":"1","path":"p"}],"caption":"c"}' }), env: TIKTOK_ENV })],
  ];
  for (const [name, call] of cases) {
    const { result, calls } = await withFetch(call);
    assert.equal(result.status, 415, name);
    assert.equal(calls.length, 0, name);
  }
});

test('JSON endpoints still accept application/json', async () => {
  const post = await withFetch(() => xPost({ request: adminRequest('/admin/api/x-post', {
    headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: '{"text":"hello","account":"en"}' }), env: X_ENV }));
  assert.equal(post.result.status, 200);
  assert.deepEqual((await post.result.json()).sent, { text: 'hello' });
  assert.deepEqual(post.calls.map((c) => c.url), ['https://api.x.com/2/tweets']);

  const del = await withFetch(() => xDelete({ request: adminRequest('/admin/api/x-delete', {
    headers: { 'Content-Type': 'application/json' }, body: '{"id":"123"}' }), env: X_ENV }));
  assert.equal(del.result.status, 200);
  assert.deepEqual(del.calls.map((c) => [c.url, c.init.method]), [['https://api.x.com/2/tweets/123', 'DELETE']]);

  const tiktok = await withFetch(() => postTikTok({ request: adminRequest('/admin/api/post-tiktok', {
    headers: { 'Content-Type': 'application/json' }, body: '{"images":[{"id":"1","path":"p"}],"caption":"c"}' }), env: TIKTOK_ENV }));
  assert.equal(tiktok.result.status, 201);
  assert.deepEqual(tiktok.calls.map((c) => c.url), ['https://api.postiz.com/public/v1/posts']);
});
