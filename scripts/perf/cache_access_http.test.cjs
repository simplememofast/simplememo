'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { inspect } = require('node:util');
const { spawnSync } = require('node:child_process');
const { createCacheAccessTransport, CacheAccessError } = require('./cache_access_http.cjs');

const origin = 'https://0123abcd.simplememo-596.pages.dev';
const image = '/assets/home-perf/example-0123456789ab.avif';
const font = '/assets/home-perf/example-abcdef012345.woff2';
const paths = ['/', '/en/', '/assets/home-perf/manifest.json',
  '/assets/home-perf/missing-000000000000.avif', image, font];
const credentials = Object.freeze({ clientId: 'synthetic-client.access', clientSecret: 'SYNTHETIC_ONLY_TOKEN_0123456789' });
const config = extra => ({ origin, paths, credentials, ...extra });

// Test-only subprocess entrypoint: never makes a real request and uses only the
// fixed synthetic credentials above. It also checks sticky load-time detection.
if (process.argv.includes('--cache-access-diagnostics-probe')) {
  if (process.argv.includes('--clear-debug-after-load')) delete process.env.NODE_DEBUG;
  if (process.argv.includes('--set-debug-after-load')) process.env.NODE_DEBUG = 'http';
  try {
    createCacheAccessTransport(config(), () => { throw Error('UNEXPECTED_REQUEST'); });
    process.stdout.write('UNEXPECTED_SUCCESS');
  } catch (error) {
    process.stdout.write(JSON.stringify(error));
  }
  process.exit(0);
}

function hasCode(code) {
  return error => {
    assert.ok(error instanceof CacheAccessError);
    assert.equal(error.message, code);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(error)), { code });
    assert.doesNotMatch(inspect(error), /SYNTHETIC_ONLY|synthetic-client|pages\.dev|127\.0\.0\.1/);
    return true;
  };
}

async function fixture(t) {
  const aRequests = [], bRequests = [], outgoing = [];
  let handler = (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', 'image/avif');
    res.setHeader('ETag', '"synthetic-etag"');
    if (req.headers['if-none-match']) res.writeHead(304).end();
    else res.end(req.method === 'HEAD' ? undefined : 'synthetic body');
  };
  const a = http.createServer((req, res) => {
    aRequests.push({ path: req.url, method: req.method, headers: req.headers });
    handler(req, res);
  });
  const b = http.createServer((req, res) => {
    bRequests.push({ path: req.url, method: req.method, headers: req.headers });
    res.end('unapproved origin');
  });
  for (const server of [a, b]) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await Promise.all([a, b].map(server => new Promise(resolve => {
      server.closeAllConnections();
      server.close(resolve);
    })));
  });
  // Only this test factory remaps the fully validated production request to a
  // loopback HTTP server. The library has no insecure/loopback option or env flag.
  const factory = (options, callback) => {
    outgoing.push(options);
    assert.equal(options.protocol, 'https:');
    assert.equal(options.hostname, '0123abcd.simplememo-596.pages.dev');
    assert.equal(options.port, 443);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.agent, false);
    assert.equal(options.maxHeaderSize, 16384);
    return http.request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port: a.address().port }, callback);
  };
  return { aRequests, bRequests, outgoing, factory,
    setHandler: value => { handler = value; },
    secondOrigin: 'http://127.0.0.1:' + b.address().port,
    transport: extra => createCacheAccessTransport(config(extra), factory) };
}

test('real loopback GET/HEAD preserves raw response bytes, duplicates and TLS defaults', async t => {
  const f = await fixture(t);
  f.setHandler((req, res) => {
    res.setHeader('Cache-Control', ['public, no-cache', 'public, no-cache']);
    res.setHeader('ETag', '"validator"');
    res.end(req.method === 'HEAD' ? undefined : Buffer.from([0, 1, 2, 255]));
  });
  const client = f.transport();
  const get = await client.request({ path: image });
  const head = await client.request({ path: image, method: 'HEAD' });
  assert.equal(get.status, 200);
  assert.deepEqual(get.body, Buffer.from([0, 1, 2, 255]));
  assert.equal(get.rawHeaders.filter(value => value.toLowerCase() === 'cache-control').length, 2);
  assert.equal(head.body.length, 0);
  assert.equal(f.aRequests.length, 2);
  assert.equal(f.bRequests.length, 0);
  for (const request of f.aRequests) {
    assert.equal(request.headers['cf-access-client-id'], credentials.clientId);
    assert.equal(request.headers['cf-access-client-secret'], credentials.clientSecret);
    assert.equal(request.headers['accept-encoding'], 'identity');
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers.referer, undefined);
  }
});

test('conditional GET and HEAD require a baseline ETag on the exact same path', async t => {
  const f = await fixture(t);
  const client = f.transport();
  const headers = { 'If-None-Match': '"synthetic-etag"' };
  await assert.rejects(client.request({ path: image, headers }), hasCode('VALIDATOR_NOT_APPROVED'));
  await client.request({ path: image });
  await assert.rejects(client.request({ path: font, headers }), hasCode('VALIDATOR_NOT_APPROVED'));
  await assert.rejects(client.request({ path: image, headers: { 'If-None-Match': '"different"' } }), hasCode('VALIDATOR_NOT_APPROVED'));
  for (const method of ['GET', 'HEAD']) {
    const result = await client.request({ path: image, method, headers });
    assert.equal(result.status, 304);
    assert.equal(result.body.length, 0);
  }
  assert.equal(f.aRequests.length, 3);
  assert.equal(f.bRequests.length, 0);
});

for (const status of [300, 301, 302, 303, 305, 306, 307, 308, 399]) {
  test(`HTTP ${status} never follows a redirect to a second real origin`, async t => {
    const f = await fixture(t);
    f.setHandler((_req, res) => res.writeHead(status, { Location: f.secondOrigin + '/admin?token=' + credentials.clientSecret }).end('redirect'));
    await assert.rejects(f.transport().request({ path: '/' }), hasCode('REDIRECT_NOT_ALLOWED'));
    assert.equal(f.aRequests.length, 1);
    assert.equal(f.bRequests.length, 0);
  });
}

test('same-origin redirects never request admin or other allowed paths', async t => {
  const f = await fixture(t);
  const client = f.transport();
  for (const destination of ['/admin', '/en/', image, origin + '/admin']) {
    f.setHandler((_req, res) => res.writeHead(302, { Location: destination }).end());
    await assert.rejects(client.request({ path: '/' }), hasCode('REDIRECT_NOT_ALLOWED'));
  }
  assert.deepEqual(f.aRequests.map(request => request.path), ['/', '/', '/', '/']);
  assert.equal(f.bRequests.length, 0);
});

test('different host, admin, query, aliases and POST are rejected before any network request', async t => {
  const f = await fixture(t);
  const client = f.transport();
  for (const path of [f.secondOrigin + '/', origin + '/', '//127.0.0.1/admin', '/admin', '/admin/',
    '/api/echo', '/cdn-cgi/access', '/?token=x', image + '?x=1', image + '#x', '/en', '/en//',
    '/assets/home-perf/../admin', '/assets/home-perf/%2e%2e/admin', image + '\n', '/assets/home-perf/unlisted-0123456789ab.avif']) {
    await assert.rejects(client.request({ path }), hasCode('PATH_NOT_ALLOWED'));
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'CONNECT', 'get', 'GET\r\n']) {
    await assert.rejects(client.request({ path: '/', method }), hasCode('METHOD_NOT_ALLOWED'));
  }
  for (const headers of [{ Cookie: 'synthetic' }, { Authorization: 'synthetic' },
    { 'CF-Access-Client-Secret': 'synthetic' }, { 'If-None-Match': '"synthetic"', Referer: f.secondOrigin }]) {
    await assert.rejects(client.request({ path: '/', headers }), hasCode('HEADERS_NOT_ALLOWED'));
  }
  assert.equal(f.outgoing.length, 0);
  assert.equal(f.aRequests.length, 0);
  assert.equal(f.bRequests.length, 0);
});

test('only an exact lowercase eight-hex preview origin is accepted', () => {
  let called = 0;
  const factory = () => { called++; };
  for (const value of ['http://0123abcd.simplememo-596.pages.dev', 'https://simplememofast.com',
    'https://main.simplememo-596.pages.dev', 'https://0123abcde.simplememo-596.pages.dev',
    origin + '/', origin + ':443', origin + ':8443', origin + '?x=1', origin + '#x', origin + '\n',
    origin + '.evil.example', 'https://0123ABCD.simplememo-596.pages.dev',
    'https://user:pass@0123abcd.simplememo-596.pages.dev', 'https://127.0.0.1']) {
    assert.throws(() => createCacheAccessTransport(config({ origin: value }), factory), hasCode('INVALID_ORIGIN'));
  }
  assert.equal(called, 0);
});

test('allowlist rejects noncanonical, duplicate and accessor paths before credential use', () => {
  for (const paths of [[], ['/admin'], [image + '\n'], [image, image], ['/assets/home-perf/example.avif'],
    ['/assets/home-perf/nested/example-0123456789ab.avif'], ['/assets/home-perf/x-0123456789ab.svg']]) {
    assert.throws(() => createCacheAccessTransport(config({ paths })), hasCode('INVALID_PATHS'));
  }
  let called = false;
  const accessor = [];
  Object.defineProperty(accessor, '0', { get() { called = true; return '/'; } });
  assert.throws(() => createCacheAccessTransport(config({ paths: accessor })), hasCode('INVALID_PATHS'));
  assert.equal(called, false);
});

test('credentials and input errors do not echo values or execute getters', async () => {
  for (const clientSecret of ['', 'synthetic\r\nCookie: injected', ' synthetic ', 'x'.repeat(4097)]) {
    assert.throws(() => createCacheAccessTransport(config({ credentials: { ...credentials, clientSecret } })), hasCode('INVALID_CREDENTIALS'));
  }
  let called = false;
  const bad = { ...config() };
  Object.defineProperty(bad, 'origin', { get() { called = true; throw Error(credentials.clientSecret); } });
  assert.throws(() => createCacheAccessTransport(bad), hasCode('INVALID_CONFIG'));
  assert.equal(called, false);
  const client = createCacheAccessTransport(config(), () => { throw Error(credentials.clientSecret); });
  await assert.rejects(client.request({ path: '/' }), hasCode('REQUEST_ERROR'));
  await assert.rejects(client.request({ path: '/', unexpected: credentials.clientSecret }), hasCode('INVALID_REQUEST'));
});

for (const status of [401, 403]) test(`HTTP ${status} fails once without following login or retrying`, async t => {
  const f = await fixture(t);
  f.setHandler((_req, res) => res.writeHead(status, { Location: f.secondOrigin }).end(credentials.clientSecret));
  await assert.rejects(f.transport().request({ path: '/' }), hasCode('ACCESS_DENIED'));
  assert.equal(f.aRequests.length, 1);
  assert.equal(f.bRequests.length, 0);
});

test('unsolicited 304 fails before contract validation', async t => {
  const f = await fixture(t);
  f.setHandler((_req, res) => res.writeHead(304).end());
  await assert.rejects(f.transport().request({ path: image }), hasCode('UNEXPECTED_NOT_MODIFIED'));
});

test('wall-clock timeout bounds both missing headers and a slow trickle body', async t => {
  const f = await fixture(t);
  f.setHandler(() => {});
  await assert.rejects(f.transport({ timeoutMs: 30 }).request({ path: '/' }), hasCode('REQUEST_TIMEOUT'));
  f.setHandler((_req, res) => {
    res.writeHead(200);
    const interval = setInterval(() => res.write('x'), 5);
    res.on('close', () => clearInterval(interval));
  });
  await assert.rejects(f.transport({ timeoutMs: 35 }).request({ path: '/' }), hasCode('REQUEST_TIMEOUT'));
  assert.equal(f.aRequests.length, 2);
  assert.equal(f.bRequests.length, 0);
});

test('declared and streaming overflows stop before retaining an oversized body', async t => {
  const f = await fixture(t);
  f.setHandler((_req, res) => res.writeHead(200, { 'Content-Length': 1000 }).end('synthetic body'));
  await assert.rejects(f.transport({ maxBytes: 8 }).request({ path: '/' }), hasCode('RESPONSE_TOO_LARGE'));
  f.setHandler((_req, res) => { res.write('1234'); res.end('56789'); });
  await assert.rejects(f.transport({ maxBytes: 8 }).request({ path: '/' }), hasCode('RESPONSE_TOO_LARGE'));
  assert.equal(f.aRequests.length, 2);
});

test('request count and aggregate streamed bytes are bounded', async t => {
  const f = await fixture(t);
  f.setHandler((_req, res) => res.end('12345'));
  const countClient = f.transport({ maxRequests: 1 });
  await countClient.request({ path: '/' });
  await assert.rejects(countClient.request({ path: '/' }), hasCode('REQUEST_BUDGET_EXCEEDED'));
  const bytesClient = f.transport({ maxTotalBytes: 8 });
  await bytesClient.request({ path: '/' });
  await assert.rejects(bytesClient.request({ path: '/' }), hasCode('RESPONSE_TOO_LARGE'));
  assert.equal(f.aRequests.length, 3);
});

test('unexpected compressed representation is rejected instead of hashing compressed bytes', async t => {
  const f = await fixture(t);
  f.setHandler((_req, res) => res.writeHead(200, { 'Content-Encoding': 'gzip' }).end('not gzip'));
  await assert.rejects(f.transport().request({ path: image }), hasCode('UNEXPECTED_CONTENT_ENCODING'));
});

test('Set-Cookie and reflected credentials remain internal and are never replayed or serialized', async t => {
  const f = await fixture(t);
  const reflected = credentials.clientSecret;
  const encoded = Buffer.from(reflected).toString('base64');
  f.setHandler((_req, res) => {
    res.setHeader('Set-Cookie', 'CF_Authorization=' + reflected + '; HttpOnly; Secure');
    res.setHeader('Content-Security-Policy', 'report-uri ' + f.secondOrigin + '/' + encoded);
    res.setHeader('ETag', '"' + reflected + '"');
    res.setHeader('Cache-Control', reflected);
    res.end(reflected + encoded);
  });
  const client = f.transport();
  const response = await client.request({ path: '/' });
  assert.equal(response.setCookiePresent, true);
  assert.ok(response.rawHeaders.includes('CF_Authorization=' + reflected + '; HttpOnly; Secure'));
  assert.equal(response.body.toString(), reflected + encoded, 'trusted validator can inspect original bytes');
  for (const output of [JSON.stringify(response), inspect(response), JSON.stringify({ ...response })]) {
    assert.ok(!output.includes(reflected));
    assert.ok(!output.includes(encoded));
    assert.ok(!output.includes(credentials.clientId));
    assert.doesNotMatch(output, /Content-Security-Policy|CF_Authorization|127\.0\.0\.1/);
  }
  await client.request({ path: '/' });
  assert.equal(f.aRequests.length, 2);
  assert.equal(f.bRequests.length, 0);
  assert.equal(f.aRequests[1].headers.cookie, undefined);
  assert.equal(f.aRequests[1].headers['cf-access-client-secret'], credentials.clientSecret);
});

test('network disconnect and protocol upgrade have static errors and no retry', async t => {
  const f = await fixture(t);
  f.setHandler((req, _res) => req.socket.destroy());
  await assert.rejects(f.transport().request({ path: '/' }), hasCode('REQUEST_ERROR'));
  f.setHandler((_req, res) => res.writeHead(101, { Connection: 'Upgrade', Upgrade: 'websocket' }).end());
  await assert.rejects(f.transport().request({ path: '/' }), hasCode('UPGRADE_NOT_ALLOWED'));
  assert.equal(f.aRequests.length, 2);
  assert.equal(f.bRequests.length, 0);
});

test('missing/error controls remain visible to the unchanged cache contract', async t => {
  const f = await fixture(t);
  f.setHandler((_req, res) => res.writeHead(404, { 'Cache-Control': 'no-store' }).end('missing'));
  const response = await f.transport().request({ path: '/assets/home-perf/missing-000000000000.avif' });
  assert.equal(response.status, 404);
  assert.equal(response.body.toString(), 'missing');
  assert.ok(response.rawHeaders.includes('no-store'));
});

test('native diagnostic/preload environments fail before credential-bearing requests', () => {
  for (const [extraEnv, extraArgs] of [
    [{ NODE_DEBUG: 'http,https' }, []],
    [{ NODE_DEBUG_NATIVE: 'http' }, []],
    [{ NODE_OPTIONS: '--trace-warnings' }, []],
    [{ NODE_DEBUG: 'http' }, ['--clear-debug-after-load']],
    [{}, ['--set-debug-after-load']],
  ]) {
    const env = { ...process.env };
    delete env.NODE_DEBUG;
    delete env.NODE_DEBUG_NATIVE;
    delete env.NODE_OPTIONS;
    Object.assign(env, extraEnv);
    const child = spawnSync(process.execPath, [__filename, '--cache-access-diagnostics-probe', ...extraArgs], {
      env, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(child.status, 0);
    assert.equal(child.error, undefined);
    assert.deepEqual(JSON.parse(child.stdout), { code: 'UNSAFE_RUNTIME' });
    for (const output of [child.stdout, child.stderr]) {
      assert.ok(!output.includes(credentials.clientSecret));
      assert.ok(!output.includes(credentials.clientId));
    }
  }
});

test('many short headers cannot hide trailing Cookie or duplicate cache policy', async t => {
  const f = await fixture(t);
  f.setHandler((_req, res) => {
    const headers = [];
    for (let i = 0; i < 2100; i++) headers.push('X', 'a');
    headers.push('Set-Cookie', 'CF_Authorization=synthetic; HttpOnly',
      'Cache-Control', 'public, no-cache', 'Cache-Control', 'no-store');
    res.writeHead(200, headers).end('body');
  });
  const response = await f.transport().request({ path: '/' });
  assert.ok(response.rawHeaders.length / 2 > 2100);
  assert.equal(response.setCookiePresent, true);
  assert.equal(response.rawHeaders.filter(value => value.toLowerCase() === 'cache-control').length, 2);
  assert.ok(response.rawHeaders.includes('no-store'));
});
