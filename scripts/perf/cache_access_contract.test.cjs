'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { inspect } = require('node:util');
const { verifyCacheContract } = require('./cache_access_contract.cjs');

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'public, no-cache';
const MANIFEST = '/assets/home-perf/manifest.json';
const MISSING = '/assets/home-perf/missing-000000000000.avif';
const SECRET = 'SYNTHETIC-PRIVATE-CREDENTIAL-DO-NOT-REFLECT';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function response(body, cache, extra = {}, status = 200) {
  return { status, body: Buffer.from(body), rawHeaders: Object.entries({ 'Cache-Control': cache, ...extra }).flat() };
}

function replaceHeader(row, name, value) {
  row.rawHeaders = row.rawHeaders.filter((_, i, all) => all[i - i % 2].toLowerCase() !== name.toLowerCase());
  if (value !== null) row.rawHeaders.push(name, value);
}

function fixture(mutate) {
  const manifest = { version: 1, headSha: 'a'.repeat(40), assets: {} };
  const baseline = new Map(), calls = [];
  const paths = ['avif', 'avif', 'woff2', 'woff2'].map((type, index) => {
    const body = Buffer.from('canonical fixture ' + index), hash = digest(body);
    const file = `assets/home-perf/fixture-${index}-${hash.slice(0, 12)}.${type}`;
    manifest.assets[file] = { bytes: body.length, sha256: hash };
    baseline.set('/' + file, response(body, IMMUTABLE, {
      'Content-Type': type === 'avif' ? 'image/avif' : 'font/woff2',
      'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', ETag: '"asset-' + index + '"',
    }));
    return '/' + file;
  });
  baseline.set('/', response('<!doctype html><html>home</html>', REVALIDATE, { 'Content-Type': 'text/html; charset=utf-8' }));
  baseline.set('/en/', response('English home', REVALIDATE));
  baseline.set(MANIFEST, response('{"assets":{}}', REVALIDATE, { ETag: 'W/"manifest"' }));
  baseline.set(MISSING, response('missing', 'public, max-age=0', {}, 404));
  const samples = [paths[0], paths[2], MANIFEST];
  async function request(input) {
    calls.push(structuredClone(input));
    let result = input.headers
      ? response('', input.path === MANIFEST ? REVALIDATE : IMMUTABLE, {}, 304)
      : baseline.get(input.path);
    assert.ok(result, 'all requested paths must be canonical fixture paths');
    result = { status: result.status, body: Buffer.from(result.body), rawHeaders: result.rawHeaders.slice() };
    return mutate ? (await mutate(result, input, calls)) ?? result : result;
  }
  return { manifest, request, paths, calls, samples, baseline };
}

function safeReceipt(receipt) {
  assert.deepEqual(Object.keys(receipt), ['version', 'verified', 'input_valid', 'assets', 'controls', 'conditionals']);
  assert.equal(receipt.version, 1);
  assert.equal(typeof receipt.verified, 'boolean');
  assert.equal(typeof receipt.input_valid, 'boolean');
  for (const group of ['assets', 'controls', 'conditionals']) {
    for (const row of receipt[group]) {
      const fields = group === 'assets' ? ['index'] : group === 'controls' ? ['role'] : ['role', 'method'];
      assert.deepEqual(Object.keys(row), [...fields, 'status', 'bytes', 'set_cookie_present', 'checks']);
      assert.ok(row.status === null || (Number.isInteger(row.status) && row.status >= 200 && row.status <= 599));
      assert.ok(row.bytes === null || (Number.isInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 4 * 1024 * 1024));
      assert.ok(row.set_cookie_present === null || typeof row.set_cookie_present === 'boolean');
      for (const check of Object.values(row.checks)) assert.equal(typeof check, 'boolean');
    }
  }
  for (const serialized of [JSON.stringify(receipt), inspect(receipt, { depth: null })]) {
    assert.ok(!serialized.includes(SECRET));
    assert.ok(!serialized.includes('/assets/'));
    assert.ok(!serialized.includes('https://'));
    assert.ok(!serialized.includes('rawHeaders'));
  }
}

test('preserves every successful asset, mutable, missing, conditional GET and HEAD contract', async () => {
  const f = fixture(), result = await verifyCacheContract(f);
  assert.equal(result.verified, true);
  safeReceipt(result);
  assert.equal(result.assets.length, 4);
  assert.equal(result.controls.length, 4);
  assert.equal(result.conditionals.length, 6);
  assert.equal(f.calls.length, 14);
  assert.deepEqual(f.calls.map(c => c.path).slice(0, 5), ['/', ...f.paths]);
  for (const group of ['assets', 'controls', 'conditionals']) {
    assert.ok(result[group].every(row => Object.values(row.checks).every(Boolean)));
    assert.ok(result[group].every(row => row.set_cookie_present === false));
  }
  for (let i = 0; i < 3; i++) {
    const conditional = f.calls.filter(c => c.path === f.samples[i] && c.headers);
    assert.deepEqual(conditional.map(c => c.method), ['GET', 'HEAD']);
    assert.deepEqual(conditional.map(c => c.headers), Array(2).fill({ 'If-None-Match': i === 2 ? 'W/"manifest"' : '"asset-' + i * 2 + '"' }));
  }
  for (const call of f.calls) {
    assert.ok(['GET', 'HEAD'].includes(call.method));
    assert.ok(!call.path.includes('?'));
    assert.deepEqual(Object.keys(call.headers || {}), call.headers ? ['If-None-Match'] : []);
  }
});

const assetMutations = {
  status: r => { r.status = 201; },
  hash: r => { r.body[0] ^= 1; },
  bytes: r => { r.body = r.body.subarray(1); },
  cache_control: r => replaceHeader(r, 'Cache-Control', REVALIDATE),
  cors: r => replaceHeader(r, 'Access-Control-Allow-Origin', 'https://wrong.example'),
  nosniff: r => replaceHeader(r, 'X-Content-Type-Options', null),
  etag: r => replaceHeader(r, 'ETag', null),
  content_type: r => replaceHeader(r, 'Content-Type', 'application/octet-stream'),
};
for (let asset = 0; asset < 4; asset++) {
  for (const [check, mutate] of Object.entries(assetMutations)) {
    test(`asset ${asset}: breaking ${check} fails, including nonsample assets`, async () => {
      const f = fixture((r, q) => { if (q.path === f.paths[asset] && !q.headers) mutate(r); });
      const result = await verifyCacheContract(f);
      assert.equal(result.verified, false);
      assert.equal(result.assets[asset].checks[check], false);
      assert.equal(f.calls.filter(q => f.paths.includes(q.path) && !q.headers).length, 4);
      safeReceipt(result);
    });
  }
}

for (const [role, path] of [['root', '/'], ['en', '/en/'], ['manifest', MANIFEST]]) {
  for (const check of ['status', 'cache_control']) {
    test(`mutable ${role}: breaking ${check} fails`, async () => {
      const f = fixture((r, q) => {
        if (q.path === path && !q.headers) {
          if (check === 'status') r.status = 201;
          else replaceHeader(r, 'Cache-Control', IMMUTABLE);
        }
      });
      const result = await verifyCacheContract(f);
      assert.equal(result.verified, false);
      assert.equal(result.controls.find(r => r.role === role).checks[check], false);
    });
  }
}

for (const [label, mutate] of [
  ['status', r => { r.status = 200; }],
  ['one year lifetime', r => replaceHeader(r, 'Cache-Control', 'public, max-age=31536000')],
  ['immutable at zero lifetime', r => replaceHeader(r, 'Cache-Control', 'public, max-age=0, IMMUTABLE')],
]) {
  test(`missing control: ${label} fails`, async () => {
    const f = fixture((r, q) => { if (q.path === MISSING) mutate(r); });
    const result = await verifyCacheContract(f);
    assert.equal(result.verified, false);
    assert.equal(result.controls[3].checks[label === 'status' ? 'status' : 'cache_control'], false);
  });
}

test('missing control may omit a cache header, as in the existing verifier', async () => {
  const f = fixture((r, q) => { if (q.path === MISSING) replaceHeader(r, 'Cache-Control', null); });
  assert.equal((await verifyCacheContract(f)).verified, true);
});

for (const [role, sample] of [['image', 0], ['font', 1], ['manifest', 2]]) {
  for (const method of ['GET', 'HEAD']) {
    for (const check of ['status', 'bytes', 'cache_control']) {
      test(`conditional ${role} ${method}: breaking ${check} fails`, async () => {
        const f = fixture((r, q) => {
          if (q.headers && q.path === f.samples[sample] && q.method === method) {
            if (check === 'status') r.status = 200;
            if (check === 'bytes') r.body = Buffer.from('unexpected');
            if (check === 'cache_control') replaceHeader(r, 'Cache-Control', 'private, no-store');
          }
        });
        const result = await verifyCacheContract(f);
        assert.equal(result.verified, false);
        assert.equal(result.conditionals.find(r => r.role === role && r.method === method).checks[check], false);
      });
    }
  }
}

for (let selected = 0; selected < 14; selected++) {
  test(`raw duplicate Cache-Control fails even with identical values: request ${selected}`, async () => {
    const f = fixture((r, q, calls) => {
      if (calls.length - 1 === selected) {
        const i = r.rawHeaders.findIndex(value => value === 'Cache-Control');
        r.rawHeaders.push('cAcHe-CoNtRoL', r.rawHeaders[i + 1]);
      }
    });
    const result = await verifyCacheContract(f);
    assert.equal(result.verified, false);
    assert.ok([...result.assets, ...result.controls, ...result.conditionals].some(row => !row.checks.cache_control));
  });
}

for (const [label, mutate] of [
  ['non-HTML root', r => replaceHeader(r, 'Content-Type', 'application/json')],
  ['HTTP200 without Content-Type', r => replaceHeader(r, 'Content-Type', null)],
  ['redirect', r => { r.status = 302; }],
  ['access denied', r => { r.status = 403; }],
]) {
  test(`${label} fails before further requests`, async () => {
    const f = fixture((r, q) => { if (q.path === '/') mutate(r); });
    const result = await verifyCacheContract(f);
    assert.equal(result.verified, false);
    assert.equal(f.calls.length, 1);
  });
}

for (const [label, mutate] of [
  ['missing', r => replaceHeader(r, 'ETag', null)],
  ['duplicate', r => r.rawHeaders.push('etag', '"other"')],
  ['unquoted', r => replaceHeader(r, 'ETag', 'not-an-entity-tag')],
  ['CRLF injection', r => replaceHeader(r, 'ETag', '"tag"\r\nOther: ' + SECRET)],
  ['too long', r => replaceHeader(r, 'ETag', '"' + 'x'.repeat(1025) + '"')],
]) {
  test(`unsafe ${label} baseline validator is never replayed or replaced by another asset`, async () => {
    const f = fixture((r, q) => { if (q.path === f.paths[0] && !q.headers) mutate(r); });
    const result = await verifyCacheContract(f);
    assert.equal(result.verified, false);
    assert.ok(!f.calls.some(q => q.path === f.paths[0] && q.headers));
    assert.ok(!f.calls.some(q => q.path === f.paths[1] && q.headers));
    assert.equal(result.conditionals[0].checks.baseline_etag, false);
    safeReceipt(result);
  });
}

test('manifest baseline ETag is required for both conditional methods', async () => {
  const f = fixture((r, q) => { if (q.path === MANIFEST && !q.headers) replaceHeader(r, 'ETag', null); });
  const result = await verifyCacheContract(f);
  assert.equal(result.verified, false);
  assert.equal(result.controls[2].checks.etag, false);
  assert.ok(!f.calls.some(q => q.path === MANIFEST && q.headers));
  assert.ok(result.conditionals.slice(4).every(r => !r.checks.baseline_etag));
});

test('valid singleton headers ignore field-name case, keep allowed MIME parameters and weak ETags', async () => {
  const f = fixture((r, q) => {
    r.rawHeaders = r.rawHeaders.map((v, i) => i % 2 === 0 ? v.toLowerCase() : v);
    if (q.path === '/') replaceHeader(r, 'Content-Type', 'TEXT/HTML; charset=utf-8');
    if (f.paths.includes(q.path) && !q.headers) {
      replaceHeader(r, 'Content-Type', q.path.endsWith('.woff2') ? 'font/woff2; charset=binary' : 'image/avif; charset=binary');
      replaceHeader(r, 'ETag', 'W/"fixture"');
    }
  });
  assert.equal((await verifyCacheContract(f)).verified, true);
});

test('transport-private non-enumerable fields are accepted without serialization', async () => {
  const f = fixture(r => Object.defineProperties({ status: r.status }, {
    rawHeaders: { value: Object.freeze(r.rawHeaders) }, body: { value: r.body },
    toJSON: { value() { throw Error('response serialization must never occur'); } },
  }));
  assert.equal((await verifyCacheContract(f)).verified, true);
});

for (const [label, mutate] of [
  ['exception', () => { throw new Error(SECRET); }],
  ['hostile exception formatter', () => { throw { toString() { throw new Error(SECRET); }, message: SECRET }; }],
  ['echoed body', r => { r.body = Buffer.from(SECRET); }],
  ['echoed Cache-Control', r => replaceHeader(r, 'Cache-Control', SECRET)],
  ['echoed Content-Type', r => replaceHeader(r, 'Content-Type', SECRET)],
]) {
  test(`candidate ${label} fails without leaking response/exception/credential into receipt or console`, async t => {
    const logs = ['log', 'error', 'warn'].map(method => t.mock.method(console, method, () => {}));
    const f = fixture((r, q) => { if (q.path === f.paths[1]) mutate(r); });
    const result = await verifyCacheContract(f);
    assert.equal(result.verified, false);
    safeReceipt(result);
    for (const log of logs) assert.equal(log.mock.callCount(), 0);
  });
}

test('private ETag/cookie/location/header echoes are never included in a successful receipt', async () => {
  const f = fixture((r, q) => {
    r.rawHeaders.push('Set-Cookie', SECRET, 'X-Private', SECRET, 'Location', 'https://example.invalid/' + SECRET);
    if (!q.headers && (f.paths.includes(q.path) || q.path === MANIFEST)) replaceHeader(r, 'ETag', '"' + SECRET + '"');
  });
  const result = await verifyCacheContract(f);
  assert.equal(result.verified, true);
  assert.equal(f.calls.filter(q => q.headers?.['If-None-Match'] === '"' + SECRET + '"').length, 6);
  assert.ok([...result.assets, ...result.controls, ...result.conditionals].every(row => row.set_cookie_present === true));
  safeReceipt(result);
});

for (const [label, mutate] of [
  ['status string', r => { r.status = SECRET; }],
  ['out-of-range status', r => { r.status = 999; }],
  ['body string', r => { r.body = SECRET; }],
  ['oversized body', r => { r.body = Buffer.alloc(4 * 1024 * 1024 + 1); }],
  ['odd header array', r => { r.rawHeaders.push(SECRET); }],
  ['invalid header name', r => { r.rawHeaders.push('Bad Header', SECRET); }],
  ['invalid header value', r => { r.rawHeaders.push('Bad', SECRET + '\n'); }],
  ['oversized headers', r => { r.rawHeaders.push('Large', 'x'.repeat(16384)); }],
  ['too many raw headers', r => { for (let i = 0; i < 129; i++) r.rawHeaders.push('X-Extra', 'x'); }],
  ['compressed bytes', r => { r.rawHeaders.push('Content-Encoding', 'gzip'); }],
  ['duplicate identity encodings', r => { r.rawHeaders.push('Content-Encoding', 'identity', 'content-encoding', 'identity'); }],
  ['status getter', r => Object.defineProperty(r, 'status', { get() { throw new Error(SECRET); } })],
  ['header getter', r => Object.defineProperty(r.rawHeaders, '0', { get() { throw new Error(SECRET); } })],
]) {
  test(`malformed ${label} fails safely and other asset checks continue`, async () => {
    const f = fixture((r, q) => { if (q.path === f.paths[0] && !q.headers) mutate(r); });
    const result = await verifyCacheContract(f);
    assert.equal(result.verified, false);
    assert.equal(result.assets[0].checks.response, false);
    assert.equal(result.assets[3].checks.response, true);
    safeReceipt(result);
  });
}

const manifestMutations = {
  version: m => { m.version = 2; },
  head: m => { m.headSha = 'a'.repeat(40) + '\n'; },
  'extra metadata': m => { m.untrusted = SECRET; },
  'empty assets': m => { m.assets = {}; },
  'missing image': m => { for (const p of Object.keys(m.assets)) if (p.endsWith('.avif')) delete m.assets[p]; },
  'missing font': m => { for (const p of Object.keys(m.assets)) if (p.endsWith('.woff2')) delete m.assets[p]; },
  'zero bytes': m => { Object.values(m.assets)[0].bytes = 0; },
  'fractional bytes': m => { Object.values(m.assets)[0].bytes = 1.5; },
  'too many bytes': m => { Object.values(m.assets)[0].bytes = 4 * 1024 * 1024 + 1; },
  'hash mismatch': m => { Object.values(m.assets)[0].sha256 = 'a'.repeat(64); },
  'extra asset metadata': m => { Object.values(m.assets)[0].url = SECRET; },
  'prototype object': m => { Object.setPrototypeOf(m.assets, { inherited: SECRET }); },
  getter: m => { Object.defineProperty(m, 'headSha', { get() { throw Error(SECRET); } }); },
  symbol: m => { m[Symbol('secret')] = SECRET; },
};
for (const [label, mutate] of Object.entries(manifestMutations)) {
  test(`unapproved manifest ${label} cannot issue a request`, async () => {
    const f = fixture();
    mutate(f.manifest);
    const result = await verifyCacheContract(f);
    assert.equal(result.verified, false);
    assert.equal(result.input_valid, false);
    assert.equal(f.calls.length, 0);
    safeReceipt(result);
  });
}

for (const path of ['https://example.invalid/' + SECRET, '../' + SECRET, '/assets/home-perf/test.avif',
  'assets/home-perf/nested/file-000000000000.avif', 'assets/home-perf/test-000000000000.avif?secret=' + SECRET,
  'assets/home-perf/test-000000000000.avif\n']) {
  test('noncanonical manifest path fails without reflecting it', async () => {
    const f = fixture(), [first] = Object.keys(f.manifest.assets);
    f.manifest.assets[path] = f.manifest.assets[first];
    delete f.manifest.assets[first];
    const result = await verifyCacheContract(f);
    assert.equal(result.input_valid, false);
    assert.equal(f.calls.length, 0);
    safeReceipt(result);
  });
}

test('manifest count and total byte bounds fail closed', async () => {
  for (const count of [9, 257]) {
    const f = fixture(), original = Object.values(f.manifest.assets)[0];
    f.manifest.assets = {};
    for (let i = 0; i < count; i++) {
      f.manifest.assets[`assets/home-perf/bounded-${i}-${original.sha256.slice(0, 12)}.${i ? 'avif' : 'woff2'}`] = {
        sha256: original.sha256, bytes: count === 9 ? 4 * 1024 * 1024 : original.bytes,
      };
    }
    assert.equal((await verifyCacheContract(f)).input_valid, false);
    assert.equal(f.calls.length, 0);
  }
});

test('manifest fields are copied before any async request can mutate them', async () => {
  const f = fixture((r, q) => {
    if (q.path === '/') {
      for (const asset of Object.values(f.manifest.assets)) { asset.bytes = 1; asset.sha256 = 'a'.repeat(64); }
      f.manifest.assets = {};
    }
  });
  assert.equal((await verifyCacheContract(f)).verified, true);
});

test('absent or invalid envelope, manifest or request fails without any effect', async () => {
  const accessor = { request() { throw Error(SECRET); } };
  Object.defineProperty(accessor, 'manifest', { get() { throw Error(SECRET); } });
  for (const input of [undefined, null, [], SECRET, accessor, {}, { manifest: fixture().manifest }, { request() { throw Error(SECRET); } }]) {
    const result = await verifyCacheContract(input);
    assert.equal(result.input_valid, false);
    safeReceipt(result);
  }
});
