import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once, EventEmitter } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { webDriverCall, stopDrivers, driverDiagnostic, REQUEST_TIMEOUT_MS,
  ensureDisplay, terminateOwnedProcess } from './lib/webkit-driver.mjs';

function ownedFixture(onKill) {
  const proc = Object.assign(new EventEmitter(), { pid: 123, exitCode: null, signalCode: null });
  proc.kill = signal => {
    onKill();
    queueMicrotask(() => { proc.signalCode = signal; proc.emit('exit', null, signal); });
    return true;
  };
  return proc;
}

function displayFixture(code) {
  let child;
  return { options: { env: {}, xvfbPath: process.execPath,
    spawnFn: (_file, args, options) => {
      assert.deepEqual(args.slice(0, 2), ['-displayfd', '3']);
      assert(!args.includes(':99'));
      child = spawn(process.execPath, ['-e', code], options);
      return child;
    } }, get child() { return child; } };
}

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
  const d = { session: 'fixture', call: webDriverCall(port), proc: ownedFixture(() => killed.push('driver')) };
  await stopDrivers([d], { proc: ownedFixture(() => killed.push('display')) }, { deadlineMs: 80 });
  assert.equal(deletions, 1);
  assert.deepEqual(killed, ['driver', 'display']);
});

test('startup failure without a session still cleans up only owned processes', async () => {
  const killed = [];
  await stopDrivers([{ session: null, call: () => { throw Error('no DELETE before session'); },
    proc: ownedFixture(() => killed.push('driver')) }], { proc: null });
  assert.deepEqual(killed, ['driver']);
});

test('Xvfb readiness waits for a complete display number on the private pipe', { timeout: 3_000 }, async t => {
  const fixture = displayFixture(`const fs = require('fs'); fs.writeSync(3, '4');
    setTimeout(() => fs.writeSync(3, '2\\n'), 40); setInterval(() => {}, 1000);`);
  t.after(() => terminateOwnedProcess(fixture.child));
  const disp = await ensureDisplay(fixture.options);
  assert.equal(disp.display, ':42');
  await stopDrivers([], disp);
  assert(fixture.child.exitCode !== null || fixture.child.signalCode !== null);
});

test('cold readiness beyond five seconds still connects and reaps the owned process', { timeout: 10_000 }, async t => {
  const fixture = displayFixture(`setTimeout(() => require('fs').writeSync(3, '43\\n'), 5_500); setInterval(() => {}, 1000);`);
  t.after(() => terminateOwnedProcess(fixture.child));
  const disp = await ensureDisplay(fixture.options);
  assert.equal(disp.display, ':43');
  await stopDrivers([], disp);
  assert(fixture.child.exitCode !== null || fixture.child.signalCode !== null);
});

test('a configured external display is preserved and never spawned or terminated', async () => {
  const disp = await ensureDisplay({ env: { DISPLAY: ':external' }, spawnFn: () => { throw Error('must not spawn'); } });
  assert.deepEqual(disp, { display: ':external', proc: null });
  await stopDrivers([], disp);
});

test('Xvfb exits before readiness with its actual stderr retained', { timeout: 3_000 }, async t => {
  const fixture = displayFixture(`require('fs').writeSync(2, 'fatal-display-startup\\n'); process.exit(1);`);
  t.after(() => terminateOwnedProcess(fixture.child));
  await assert.rejects(ensureDisplay(fixture.options), error => {
    assert.match(error.message, /before ready|without a display/);
    assert.match(error.diagnostics.join(' '), /fatal-display-startup/);
    return true;
  });
});

test('invalid Xvfb readiness and a hung startup are rejected and reaped', { timeout: 5_000 }, async t => {
  for (const [response, expected] of [['bad\n', /invalid display/], ['65536\n', /invalid display/],
    ['x'.repeat(40), /too long/], ['', /timed out/]]) {
    const fixture = displayFixture(`require('fs').writeSync(3, ${JSON.stringify(response)}); setInterval(() => {}, 1000);`);
    t.after(() => terminateOwnedProcess(fixture.child));
    await assert.rejects(ensureDisplay({ ...fixture.options, startupMs: 250 }), expected);
    assert(fixture.child.exitCode !== null || fixture.child.signalCode !== null);
  }
});

test('Xvfb spawn errors remain diagnostic and bounded', { timeout: 3_000 }, async () => {
  await assert.rejects(ensureDisplay({ env: {}, xvfbPath: process.execPath,
    spawnFn: (_file, args, options) => spawn('/missing-simplememo-xvfb-fixture', args, options) }), error => {
    assert.match(error.message, /ENOENT/);
    assert.match(error.diagnostics.join(' '), /ENOENT/);
    return true;
  });
});

test('owned children that ignore SIGTERM are killed and awaited', { timeout: 3_000 }, async t => {
  const proc = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);`],
    { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL'); });
  await once(proc.stdout, 'data');
  await terminateOwnedProcess(proc, { graceMs: 60, killMs: 1000 });
  assert.equal(proc.signalCode, 'SIGKILL');
});

test('Linux CI: independent real Xvfb displays remain connectable across cleanup',
  { skip: process.platform !== 'linux' ? 'requires Linux Xvfb' :
    !fs.existsSync('/usr/bin/Xvfb') || !fs.existsSync('/usr/bin/xdpyinfo')
      ? 'Xvfb/xdpyinfo unavailable; real display readiness is unverified' : false, timeout: 45_000 }, async t => {
    const start = async label => {
      const started = Date.now();
      try {
        t.signal.throwIfAborted();
        const disp = await ensureDisplay({ env: {}, spawnFn: (...args) => {
          // Register ownership before readiness can outlive the test deadline.
          const proc = spawn(...args);
          t.after(() => terminateOwnedProcess(proc));
          return proc;
        } });
        t.signal.throwIfAborted();
        t.diagnostic(`${label}: ready ${disp.display} after ${Date.now() - started}ms`);
        return disp;
      } catch (error) {
        t.diagnostic(`${label}: ${error.message}; ${(error.diagnostics ?? []).join('; ')}`);
        throw error;
      }
    };
    const check = display => execFileSync('/usr/bin/xdpyinfo', ['-display', display], { stdio: 'pipe', timeout: 2_000 });
    // Repeated cleanup/reallocation exposed intermittent startup failures in CI.
    // Use the bounded cold-start deadline and retain every connectivity assertion.
    for (let round = 1; round <= 3; round++) {
      const first = await start(`${round}/first`);
      const second = await start(`${round}/second`);
      assert.notEqual(first.display, second.display);
      check(first.display); check(second.display);
      await stopDrivers([], second);
      check(first.display);
      const third = await start(`${round}/replacement`);
      check(third.display);
      check(first.display);
      await stopDrivers([], third);
      await stopDrivers([], first);
    }
  });

test('driver diagnostics distinguish process exit and stderr, with bounded single-line output', () => {
  const result = driverDiagnostic({ port: 4700, proc: { pid: 123, exitCode: 1, signalCode: null },
    spawnError: 'EACCES', stderr: 'driver failed\n' + 'x'.repeat(4_000) + '\nlast-error-marker' });
  assert.match(result, /port=4700 pid=123 exit=1 signal=none spawn_error=EACCES/);
  assert(!result.includes('\n'));
  assert(result.length <= 600);
  assert(result.endsWith('last-error-marker'));
});
