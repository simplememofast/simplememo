import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from './cache_headers.cjs';

const baseURL = 'https://example.simplememo-596.pages.dev';
const root = baseURL + '/';

async function run(t, options = {}) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-navigation-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const state = { probes: 0, closed: false };
  const handlers = {};
  const response = options.noResponse ? null : {
    url: () => options.responseURL || options.url || root,
    status: () => options.status ?? 200,
    headers: () => ({ 'content-type': options.contentType ?? 'text/html; charset=utf-8' }),
  };
  const page = {
    url: () => options.url || root,
    on: (name, handler) => { handlers[name] = handler; },
    goto: async (url, config) => {
      assert.equal(url, root);
      assert.equal(config.timeout, 30000);
      for (const url of options.failedURLs || []) handlers.requestfailed({
        url: () => url, method: () => 'GET', failure: () => ({ errorText: 'net::ERR_FAILED' }),
      });
      return response;
    },
    evaluate: async (_callback, entries) => {
      state.probes++;
      assert.ok(entries.length > 0, 'real manifest still reaches the asset probe');
      return { assets: {}, controls: {}, conditionals: {}, failures: options.failures || [] };
    },
  };
  const chromium = { launch: async () => ({
    newContext: async () => ({ route: async (_pattern, handler) => { state.route = handler; }, newPage: async () => page }),
    close: async () => { state.closed = true; },
  }) };
  try { await main({ baseURL, output, chromium }); } catch (error) { state.error = error; }
  state.receipt = JSON.parse(fs.readFileSync(path.join(output, 'cache-response-proof.json'), 'utf8'));
  assert.equal(state.closed, true, 'browser closes on success and failure');
  return state;
}

test('Access login HTTP 200 fails before executing an asset probe in the wrong origin', async t => {
  const state = await run(t, { url: 'https://simplememo.cloudflareaccess.com/cdn-cgi/access/login/example?token=synthetic-secret#private' });
  assert.match(String(state.error), /Unexpected homepage navigation/);
  assert.equal(state.probes, 0);
  assert.equal(state.receipt.verified, false);
  assert.equal(state.receipt.navigation.same_origin, false);
  assert.doesNotMatch(JSON.stringify(state.receipt), /synthetic-secret|private/);
});

for (const [name, options, error] of [
  ['same-origin login path', { url: baseURL + '/login' }, /Unexpected homepage navigation/],
  ['homepage query redirect', { url: root + '?login=1' }, /Unexpected homepage navigation/],
  ['mismatched final response', { responseURL: 'https://simplememo.cloudflareaccess.com/' }, /Unexpected homepage navigation/],
  ['non-200 homepage', { status: 403 }, /Homepage HTTP 403/],
  ['missing navigation response', { noResponse: true }, /Homepage HTTP undefined/],
  ['non-HTML homepage', { contentType: 'application/json' }, /Homepage Content-Type/],
]) test(`${name} cannot reach the asset probe`, async t => {
  const state = await run(t, options);
  assert.match(String(state.error), error);
  assert.equal(state.probes, 0);
  assert.equal(state.receipt.verified, false);
});

test('approved homepage reaches existing asset verification; failures remain blocking', async t => {
  const state = await run(t, { failures: ['Asset bytes/status differ: synthetic.avif'] });
  assert.equal(state.probes, 1);
  assert.match(String(state.error), /Asset bytes\/status differ/);
  assert.equal(state.receipt.verified, false);
});

test('approved homepage can pass and request routing still forbids cross-origin and writes', async t => {
  const state = await run(t);
  assert.equal(state.error, undefined);
  assert.equal(state.probes, 1);
  assert.equal(state.receipt.verified, true);
  for (const [url, method, expected] of [
    [root, 'GET', 'continue'], [root, 'HEAD', 'continue'],
    [root, 'POST', 'abort'], ['https://simplememo.cloudflareaccess.com/', 'GET', 'abort'],
  ]) {
    let decision;
    await state.route({ request: () => ({ url: () => url, method: () => method }),
      continue: () => { decision = 'continue'; }, abort: () => { decision = 'abort'; } });
    assert.equal(decision, expected);
  }
});
