'use strict';
// Bounded, read-only public response verification; no analytics submissions.
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../..');
const origin = new URL(process.env.PERF_ORIGIN || 'https://simplememofast.com');
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password || !(origin.hostname === 'simplememofast.com' || /^[a-z0-9-]+\.simplememo-596\.pages\.dev$/.test(origin.hostname))) throw Error('Unapproved test origin');
const output = process.env.PERF_RESULTS;
if (!output) throw Error('PERF_RESULTS required');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/home-perf/manifest.json')));
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const receipt = { checked_at: new Date().toISOString(), origin: origin.origin, expected_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), verified: false };
  try {
    const ctx = await browser.newContext();
    await ctx.route('**/*', r => new URL(r.request().url()).origin === origin.origin && ['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort());
    const page = await ctx.newPage();
    const response = await page.goto(origin.origin + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (response?.status() !== 200) throw Error('Homepage HTTP ' + response?.status());
    // Return every observation before asserting, including errors and headers.
    // A failed Promise must not erase the evidence from other in-flight requests.
    const observations = await page.evaluate(async entries => {
      const assets = {}, controls = {}, conditionals = {}, failures = [];
      const immutable = 'public, max-age=31536000, immutable', revalidate = 'public, no-cache';
      async function read(file, init = {}) {
        const r = await fetch(file, { cache: 'no-store', signal: AbortSignal.timeout(20000), ...init });
        const data = await r.arrayBuffer();
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
        return { status: r.status, bytes: data.byteLength, sha256, cache_control: r.headers.get('cache-control'), content_type: r.headers.get('content-type'), cors: r.headers.get('access-control-allow-origin'), nosniff: r.headers.get('x-content-type-options'), etag: r.headers.get('etag'), cf_cache_status: r.headers.get('cf-cache-status'), cf_ray: r.headers.get('cf-ray') };
      }
      let index = 0;
      async function worker() {
        while (index < entries.length) {
          const [file, expected] = entries[index++];
          try {
            const row = assets[file] = await read('/' + file);
            if (row.status !== 200 || row.sha256 !== expected.sha256 || row.bytes !== expected.bytes) failures.push('Asset bytes/status differ: ' + file);
            if (row.cache_control !== immutable) failures.push('Incorrect/duplicate cache policy: ' + file + ' ' + row.cache_control);
            if (row.cors !== '*' || row.nosniff !== 'nosniff' || !row.etag) failures.push('Required original asset headers missing: ' + file);
            const expectedType = file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.webp') ? 'image/webp' : 'image/avif';
            if (row.content_type?.split(';')[0].trim() !== expectedType) failures.push('Incorrect asset Content-Type: ' + file);
          } catch (e) { assets[file] = { error: String(e) }; failures.push('Asset read failed: ' + file + ' ' + e); }
        }
      }
      await Promise.all(Array.from({ length: 4 }, worker));
      for (const file of ['/', '/en/', '/assets/home-perf/manifest.json', '/assets/home-perf/missing-000000000000.avif']) {
        try { controls[file] = await read(file); } catch (e) { controls[file] = { error: String(e) }; failures.push('Control read failed: ' + file); }
      }
      for (const file of ['/', '/en/', '/assets/home-perf/manifest.json']) if (controls[file].status !== 200 || controls[file].cache_control !== revalidate) failures.push('Mutable response no longer revalidates: ' + file);
      const missing = controls['/assets/home-perf/missing-000000000000.avif'];
      if (missing.status !== 404 || missing.cache_control?.includes('31536000')) failures.push('Error response was given immutable success policy');
      // Use the exact canonical URLs, not unique query strings which could hide
      // stale CDN metadata. GET and HEAD must both preserve bodyless 304 policy.
      const samples = [entries.find(([f]) => f.endsWith('.avif'))?.[0], entries.find(([f]) => f.endsWith('.woff2'))?.[0], entries.find(([f]) => f.endsWith('.webp'))?.[0]];
      if (samples.some(f => !f)) failures.push('Manifest lacks an image or font control');
      const validators = samples.filter(Boolean).map(file => ['/' + file, assets[file]?.etag, immutable]);
      validators.push(['/assets/home-perf/manifest.json', controls['/assets/home-perf/manifest.json'].etag, revalidate]);
      for (const [file, etag, policy] of validators) for (const method of ['GET', 'HEAD']) {
        const key = method + ' ' + file;
        if (!etag) { conditionals[key] = { error: 'Missing baseline ETag' }; failures.push('Cannot verify conditional response: ' + key); continue; }
        try {
          const row = conditionals[key] = await read(file, { method, headers: { 'If-None-Match': etag } });
          if (row.status !== 304 || row.bytes !== 0 || row.cache_control !== policy) failures.push('Incorrect conditional status/body/cache policy: ' + key);
        } catch (e) { conditionals[key] = { error: String(e) }; failures.push('Conditional read failed: ' + key); }
      }
      return { assets, controls, conditionals, failures };
    }, Object.entries(manifest.assets));
    Object.assign(receipt, observations);
    if (receipt.failures.length) throw Error(receipt.failures.join('\n'));
    receipt.verified = true;
    console.log('PASS: ' + Object.keys(receipt.assets).length + ' canonical asset hashes/policies, mutable/error controls and ' + Object.keys(receipt.conditionals).length + ' conditional GET/HEAD policies.');
  } catch (e) { receipt.error = String(e); throw e; }
  finally { fs.writeFileSync(path.join(output, 'cache-response-proof.json'), JSON.stringify(receipt, null, 2) + '\n'); await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
