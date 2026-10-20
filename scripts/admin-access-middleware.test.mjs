// /admin/* gate (functions/admin/_middleware.js): the Cloudflare Access JWT
// must be verified, not merely present. No network: the Access certs endpoint
// is a stub, and every token is signed here with throwaway RSA keys.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = fs.readFileSync(path.join(ROOT, 'functions/admin/_middleware.js'), 'utf8');

const TEAM = 'example-team.cloudflareaccess.com';
const ISSUER = 'https://' + TEAM;
const CERTS_URL = ISSUER + '/cdn-cgi/access/certs';
const AUD = 'a'.repeat(64);
const ENV = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };

// A request that slips through must never become a real outbound call.
globalThis.fetch = async () => { throw new Error('Network access is disabled in these tests'); };

// Each test gets its own module instance, so the key cache starts empty.
let instance = 0;
async function loadMiddleware() {
  instance += 1;
  const src = SOURCE + '\n// test instance ' + instance + '\n';
  return import('data:text/javascript,' + encodeURIComponent(src));
}

const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const b64urlJson = (obj) => b64url(enc.encode(JSON.stringify(obj)));

async function newKeyPair(kid) {
  const pair = await crypto.subtle.generateKey(
    { ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return { kid, privateKey: pair.privateKey, publicJwk: { kid, kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e } };
}

const KEY = await newKeyPair('kid-current');
const ATTACKER = await newKeyPair('kid-current'); // same kid, different key
const ROTATED = await newKeyPair('kid-rotated');

async function sign(key, claims, header = {}) {
  const head = b64urlJson({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...header });
  const body = b64urlJson(claims);
  const sig = await crypto.subtle.sign(ALG.name, key.privateKey, enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64url(new Uint8Array(sig));
}

const nowSec = () => Math.floor(Date.now() / 1000);
const goodClaims = (extra = {}) => ({
  aud: [AUD], email: 'owner@example.com', exp: nowSec() + 600, iat: nowSec(), nbf: nowSec(),
  iss: ISSUER, type: 'app', sub: 'user-id', ...extra,
});

function stubCerts(keys) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url) !== CERTS_URL) throw new Error('unexpected fetch ' + url);
    return new Response(JSON.stringify({ keys: keys.map((k) => k.publicJwk) }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  return calls;
}

// `env` may be passed explicitly as undefined, so no default parameter here.
async function call(mw, headers, ...envArg) {
  const env = envArg.length ? envArg[0] : ENV;
  let nextCalls = 0;
  const context = {
    request: new Request('https://simplememo-596.pages.dev/admin/api/x-post', { method: 'POST', headers }),
    env,
    next: async () => {
      nextCalls += 1;
      return new Response('{"ok":true}', { status: 200, headers: { 'Cache-Control': 'public, max-age=3600' } });
    },
  };
  const res = await mw.onRequest(context);
  return { res, nextCalls, debug: res.headers.get('X-Auth-Debug') || '' };
}

const refused = (r, status, reason) => {
  assert.equal(r.res.status, status);
  assert.equal(r.nextCalls, 0, 'the admin handler must not run');
  assert.equal(r.res.headers.get('Cache-Control'), 'private, no-store');
  if (reason) assert.match(r.debug, new RegExp('reason=' + reason + '$'));
};

test('a valid Access JWT reaches the handler and the response is made uncacheable', async () => {
  const mw = await loadMiddleware();
  const calls = stubCerts([KEY]);
  const r = await call(mw, { 'Cf-Access-Jwt-Assertion': await sign(KEY, goodClaims()) });
  assert.equal(r.res.status, 200);
  assert.equal(r.nextCalls, 1);
  assert.equal(r.res.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(r.res.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.deepEqual(calls, [CERTS_URL]);
});

test('the reported exploit: any non-empty Cf-Access-* header no longer opens /admin/*', async () => {
  const mw = await loadMiddleware();
  stubCerts([KEY]);
  refused(await call(mw, {}), 403, 'no_jwt');
  refused(await call(mw, { 'Cf-Access-Authenticated-User-Email': 'owner@example.com' }), 403, 'no_jwt');
  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': 'x' }), 403, 'malformed');
  refused(await call(mw, {
    'Cf-Access-Jwt-Assertion': 'x',
    'Cf-Access-Authenticated-User-Email': 'owner@example.com',
  }), 403, 'malformed');
});

test('forged and confused tokens are refused before any claim is trusted', async () => {
  const mw = await loadMiddleware();
  stubCerts([KEY]);
  const claims = goodClaims();
  const forged = await sign(ATTACKER, claims);
  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': forged }), 403, 'signature');

  const [head, body] = (await sign(KEY, claims)).split('.');
  const tampered = head + '.' + b64urlJson({ ...claims, email: 'attacker@example.com' }) + '.' +
    (await sign(KEY, claims)).split('.')[2];
  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': tampered }), 403, 'signature');

  const none = b64urlJson({ alg: 'none', kid: KEY.kid }) + '.' + body + '.';
  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': none }), 403, 'alg');

  const hs = b64urlJson({ alg: 'HS256', kid: KEY.kid }) + '.' + body + '.' + b64url(enc.encode('sig'));
  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': hs }), 403, 'alg');

  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': await sign(KEY, claims, { kid: undefined }) }), 403, 'alg');
  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': head + '.' + body }), 403, 'malformed');
  refused(await call(mw, { 'Cf-Access-Jwt-Assertion': head + '.' + body + '.a+b/' }), 403, 'malformed');
});

test('iss, aud, exp and nbf are enforced on correctly signed tokens', async () => {
  const mw = await loadMiddleware();
  stubCerts([KEY]);
  const cases = [
    [{ iss: 'https://other-team.cloudflareaccess.com' }, 'iss'],
    [{ iss: undefined }, 'iss'],
    [{ aud: ['b'.repeat(64)] }, 'aud'],
    [{ aud: undefined }, 'aud'],
    [{ aud: [] }, 'aud'],
    [{ exp: nowSec() - 120 }, 'exp'],
    [{ exp: undefined }, 'exp'],
    [{ exp: String(nowSec() + 600) }, 'exp'],
    [{ nbf: nowSec() + 600 }, 'nbf'],
    [{ nbf: 'later' }, 'nbf'],
  ];
  for (const [extra, reason] of cases) {
    const token = await sign(KEY, goodClaims(extra));
    refused(await call(mw, { 'Cf-Access-Jwt-Assertion': token }), 403, reason);
  }
  // `aud` as a single string, and a service-token JWT (no email, common_name).
  for (const extra of [{ aud: AUD }, { email: undefined, common_name: 'ci.access' }]) {
    const r = await call(mw, { 'Cf-Access-Jwt-Assertion': await sign(KEY, goodClaims(extra)) });
    assert.equal(r.res.status, 200, JSON.stringify(extra));
    assert.equal(r.nextCalls, 1);
  }
});

test('missing or malformed configuration fails closed without fetching anything', async () => {
  const mw = await loadMiddleware();
  const calls = stubCerts([KEY]);
  const token = await sign(KEY, goodClaims());
  for (const env of [
    {},
    undefined,
    { ACCESS_TEAM_DOMAIN: TEAM },
    { ACCESS_AUD: AUD },
    { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: ' , ' },
    { ACCESS_TEAM_DOMAIN: 'attacker.example.com', ACCESS_AUD: AUD },
    { ACCESS_TEAM_DOMAIN: TEAM + '.attacker.example', ACCESS_AUD: AUD },
  ]) {
    refused(await call(mw, { 'Cf-Access-Jwt-Assertion': token }, env), 500, 'not_configured');
  }
  assert.deepEqual(calls, []);
});

test('configuration accepts a URL-shaped team domain and several AUD tags', async () => {
  const mw = await loadMiddleware();
  stubCerts([KEY]);
  const env = { ACCESS_TEAM_DOMAIN: ' https://' + TEAM.toUpperCase() + '/ ', ACCESS_AUD: 'c'.repeat(64) + ', ' + AUD };
  const r = await call(mw, { 'Cf-Access-Jwt-Assertion': await sign(KEY, goodClaims()) }, env);
  assert.equal(r.res.status, 200);
  assert.equal(r.nextCalls, 1);
});

test('unreachable or empty Access certs refuse the request', async () => {
  const token = await sign(KEY, goodClaims());
  for (const respond of [
    async () => { throw new Error('offline'); },
    async () => new Response('nope', { status: 500 }),
    async () => new Response('not json', { status: 200 }),
    async () => new Response(JSON.stringify({ keys: [] }), { status: 200 }),
    async () => new Response(JSON.stringify({ keys: [{ ...KEY.publicJwk, alg: 'RS512' }] }), { status: 200 }),
  ]) {
    const mw = await loadMiddleware();
    globalThis.fetch = respond;
    refused(await call(mw, { 'Cf-Access-Jwt-Assertion': token }), 503, 'keys_unavailable');
  }
});

test('key rotation is picked up, but unknown kids cannot force a fetch per request', async () => {
  const mw = await loadMiddleware();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    let published = [KEY];
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ keys: published.map((k) => k.publicJwk) }), { status: 200 });
    };
    const ok = async (key) => (await call(mw, { 'Cf-Access-Jwt-Assertion': await sign(key, goodClaims()) })).res.status;

    assert.equal(await ok(KEY), 200);
    assert.equal(await ok(KEY), 200);
    assert.equal(calls.length, 1, 'keys are cached');

    // Access rotates; a token with the new kid arrives inside the cooldown.
    published = [ROTATED, KEY];
    refused(await call(mw, { 'Cf-Access-Jwt-Assertion': await sign(ROTATED, goodClaims()) }), 403, 'kid');
    assert.equal(calls.length, 1, 'no refetch inside the cooldown');

    clock += 31 * 1000;
    assert.equal(await ok(ROTATED), 200);
    assert.equal(calls.length, 2, 'unknown kid refetches once the cooldown passed');
    for (let i = 0; i < 5; i++) {
      refused(await call(mw, {
        'Cf-Access-Jwt-Assertion': await sign(ATTACKER, goodClaims(), { kid: 'random-' + i }),
      }), 403, 'kid');
    }
    assert.equal(calls.length, 2, 'random kids inside the cooldown do not refetch');

    clock += 11 * 60 * 1000;
    published = [ROTATED];
    refused(await call(mw, { 'Cf-Access-Jwt-Assertion': await sign(KEY, goodClaims()) }), 403, 'kid');
    assert.equal(calls.length, 3, 'keys are refetched after the TTL and retired keys stop working');
  } finally {
    Date.now = realNow;
  }
});
