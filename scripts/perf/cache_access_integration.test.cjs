'use strict';

// Entirely local integration: real reviewed asset inventory and existing Pages
// middleware, synthetic authorization metadata and credentials. No Cloudflare
// or GitHub connection. The injected socket factory cannot be supplied by a PR.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { authorizeCacheCheck } = require('./cache_access_gate.cjs');
const { createCacheAccessTransport } = require('./cache_access_http.cjs');
const { verifyCacheContract } = require('./cache_access_contract.cjs');

const ROOT = path.resolve(__dirname, '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('gate, bounded transport and full contract agree on all real assets and Pages middleware', async t => {
  const sha = 'b'.repeat(40), trustedSha = 'a'.repeat(40), account = 'c'.repeat(32);
  const origin = 'https://1234abcd.simplememo-596.pages.dev';
  const deploymentId = '1234abcd-0000-4000-8000-000000000000';
  const inventoryBytes = fs.readFileSync(path.join(ROOT, 'assets/home-perf/manifest.json'));
  const inventory = JSON.parse(inventoryBytes);
  const reviewedManifest = JSON.stringify({ version: 1, headSha: sha, assets: inventory.assets });
  const gate = authorizeCacheCheck({
    context: { repository: 'simplememofast/simplememo', eventName: 'workflow_dispatch', ref: 'refs/heads/main',
      workflowRef: 'simplememofast/simplememo/.github/workflows/home-perf-cache-approved.yml@refs/heads/main',
      workflowSha: trustedSha, sha: trustedSha, checkoutSha: trustedSha,
      runAttempt: 1, actor: 'simplememofast', triggeringActor: 'simplememofast' },
    request: { pullRequestNumber: 2164, approvedHeadSha: sha },
    pullRequest: { number: 2164, state: 'open', merged: false, user: { login: 'simplememofast' },
      base: { ref: 'main', repo: { full_name: 'simplememofast/simplememo', fork: false } },
      head: { sha, repo: { full_name: 'simplememofast/simplememo', fork: false } } },
    checkRun: { name: 'Cloudflare Pages', status: 'completed', conclusion: 'success', head_sha: sha,
      app: { id: 85455, slug: 'cloudflare-workers-and-pages' },
      details_url: `https://dash.cloudflare.com/?to=/${account}/pages/view/simplememo/${deploymentId}`,
      output: { summary: `Preview: [deployment](${origin}/)` } },
    policy: { approvedPullRequestNumber: 2164, approvedHeadSha: sha, validUntil: '2026-10-22T12:00:00Z',
      cloudflareAppId: 85455, cloudflareAppSlug: 'cloudflare-workers-and-pages', cloudflareAccountId: account,
      cloudflareProjectName: 'simplememo', expectedManifestSha256: hash(reviewedManifest) },
    reviewedManifest, now: Date.parse('2026-10-22T11:00:00Z'),
  });
  const { onRequest } = await import(pathToFileURL(path.join(ROOT, 'functions/assets/home-perf/_middleware.js')).href);
  const content = new Map();
  for (const [file, expected] of Object.entries(gate.manifest.assets)) {
    const body = fs.readFileSync(path.join(ROOT, file));
    assert.equal(body.length, expected.bytes);
    assert.equal(hash(body), expected.sha256);
    content.set('/' + file, { body, type: file.endsWith('.avif') ? 'image/avif' : 'font/woff2' });
  }
  content.set('/', { body: fs.readFileSync(path.join(ROOT, 'index.html')), type: 'text/html; charset=utf-8' });
  content.set('/en/', { body: fs.readFileSync(path.join(ROOT, 'en/index.html')), type: 'text/html; charset=utf-8' });
  content.set('/assets/home-perf/manifest.json', { body: inventoryBytes, type: 'application/json' });
  const missing = '/assets/home-perf/missing-000000000000.avif';
  const credentials = { clientId: 'synthetic-integration-id', clientSecret: 'synthetic-integration-secret' };
  const observations = [];
  const server = http.createServer(async (req, res) => {
    try {
      observations.push({ path: req.url, method: req.method, cookie: req.headers.cookie });
      assert.equal(req.headers['cf-access-client-id'], credentials.clientId);
      assert.equal(req.headers['cf-access-client-secret'], credentials.clientSecret);
      assert.equal(req.headers['accept-encoding'], 'identity');
      const row = content.get(req.url);
      assert.ok(row || req.url === missing);
      const etag = row ? '"' + hash(row.body) + '"' : undefined;
      const status = !row ? 404 : req.headers['if-none-match'] === etag ? 304 : 200;
      const headers = { 'Content-Type': row?.type || 'text/plain', 'Cache-Control': 'public, no-cache',
        'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' };
      if (etag) headers.ETag = etag;
      const source = new Response(status === 304 || req.method === 'HEAD' ? null : row?.body || 'missing', { status, headers });
      const request = new Request(origin + req.url, { method: req.method, headers: req.headers });
      const response = await onRequest({ request, next: async () => source });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      // Static errors only, even when the fixture's credential assertions fail.
      res.writeHead(500);
      res.end('fixture failure');
    }
  });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const transport = createCacheAccessTransport({ origin: gate.previewOrigin,
    paths: [...content.keys(), missing], credentials }, (options, callback) => {
    assert.equal(options.hostname, new URL(origin).hostname);
    assert.equal(options.protocol, 'https:');
    assert.equal(options.port, 443);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.agent, false);
    // Only this trusted local test substitutes a loopback connection. Production
    // origin validation and HTTPS/TLS defaults are left untouched.
    return http.request({ ...options, protocol: 'http:', hostname: '127.0.0.1', port: server.address().port }, callback);
  });
  const receipt = await verifyCacheContract({ manifest: gate.manifest, request: transport.request });
  assert.equal(receipt.verified, true);
  assert.equal(receipt.assets.length, Object.keys(inventory.assets).length);
  assert.equal(receipt.controls.length, 4);
  assert.equal(receipt.conditionals.length, 6);
  assert.equal(observations.length, Object.keys(inventory.assets).length + 10);
  assert.ok(observations.every(row => row.cookie === undefined));
  const proof = JSON.stringify(receipt);
  assert.ok(!proof.includes(credentials.clientId) && !proof.includes(credentials.clientSecret));
  assert.ok(!proof.includes(origin) && !proof.includes('rawHeaders'));
});
