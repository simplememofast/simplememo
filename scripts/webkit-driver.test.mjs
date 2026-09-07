import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { webDriverCall, stopDrivers, driverDiagnostic, REQUEST_TIMEOUT_MS } from './lib/webkit-driver.mjs';

async function server(t, handle) {
  const srv = http.createServer(handle);
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  t.after(async () => {
    srv.closeAllConnections();
    await new Promise(resolve => srv.close(resolve));
  });
  return srv.address().port;
}

test('successful WebDriver response retains the command and value', async t => {
  let received;
  const port = await server(t, async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received = { method: req.method, path: req.url, body: JSON.parse(body) };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ value: { sessionId: 'fixture-session' } }));
  });
  const value = await webDriverCall(port)('POST', '/session', { capabilities: {} });
  assert.deepEqual(value, { sessionId: 'fixture-session' });
  assert.deepEqual(received, { method: 'POST', path: '/session', body: { capabilities: {} } });
  assert(REQUEST_TIMEOUT_MS > 60_000, 'transport deadline must allow the script deadline response');
});

test('transport failure records the failed stage and native cause', async () => {
  const call = webDriverCall(4701, { fetchImpl: async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }) });
  } });
  await assert.rejects(call('POST', '/session', {}), error => {
    assert.match(error.message, /4701 POST \/session/);
    assert.match(error.message, /ECONNREFUSED/);
    assert.match(error.message, /deadline=75000ms/);
    assert.equal(error.cause.message, 'fetch failed');
    return true;
  });
});

test('a driver that never sends headers is bounded by the real fetch deadline', { timeout: 3_000 }, async t => {
  const port = await server(t, () => {});
  await assert.rejects(webDriverCall(port, { timeoutMs: 80 })('POST', '/session', {}), /TimeoutError.*deadline=80ms/);
});

test('a stalled JSON body is also bounded', { timeout: 3_000 }, async t => {
  const port = await server(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"value":');
  });
  await assert.rejects(webDriverCall(port, { timeoutMs: 80 })('POST', '/session', {}), /(?:AbortError|TimeoutError).*deadline=80ms/);
});

test('HTTP errors preserve status and WebDriver diagnosis', async t => {
  const port = await server(t, (_req, res) => {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ value: { error: 'session not created' } }));
  });
  await assert.rejects(webDriverCall(port)('POST', '/session', {}), /HTTP 500:.*session not created/);
});

test('malformed JSON is a failed command, not undefined success', async t => {
  const port = await server(t, (_req, res) => res.end('not-json'));
  await assert.rejects(webDriverCall(port)('POST', '/session', {}), /POST \/session: SyntaxError/);
});

test('stalled session deletion cannot prevent owned driver and display cleanup', { timeout: 3_000 }, async t => {
  let deletions = 0;
  const port = await server(t, req => { if (req.method === 'DELETE') deletions++; });
  const killed = [];
  const d = { session: 'fixture', call: webDriverCall(port), proc: { kill: () => killed.push('driver') } };
  await stopDrivers([d], { proc: { kill: () => killed.push('display') } }, { deadlineMs: 80 });
  assert.equal(deletions, 1);
  assert.deepEqual(killed, ['driver', 'display']);
});

test('startup failure without a session still cleans up only owned processes', async () => {
  const killed = [];
  await stopDrivers([{ session: null, call: () => { throw Error('no DELETE before session'); },
    proc: { kill: () => killed.push('driver') } }], { proc: null });
  assert.deepEqual(killed, ['driver']);
});

test('driver diagnostics distinguish process exit and stderr, with bounded single-line output', () => {
  const result = driverDiagnostic({ port: 4700, proc: { pid: 123, exitCode: 1, signalCode: null },
    spawnError: 'EACCES', stderr: 'driver failed\n' + 'x'.repeat(4_000) + '\nlast-error-marker' });
  assert.match(result, /port=4700 pid=123 exit=1 signal=none spawn_error=EACCES/);
  assert(!result.includes('\n'));
  assert(result.length <= 600);
  assert(result.endsWith('last-error-marker'));
});
