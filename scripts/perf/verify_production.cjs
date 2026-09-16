'use strict';
// Verify the real public browser response, not merely a successful build job.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'https://simplememofast.com';

function pageMatches(html, expected) {
  const styles = [...expected.matchAll(/<style data-home-perf="(?:base|hero)">([\s\S]*?)<\/style>/g)].map(m => m[1]);
  const sources = expected.match(/<source data-home-perf="image"[^>]*>/g) || [];
  return styles.length === 2 && sources.length > 0
    && styles.every(style => html.includes(style)) && sources.every(source => html.includes(source))
    && html.indexOf('id="hero-title"') > 0
    && html.indexOf('id="hero-title"') < html.indexOf('<picture class="hero__photograph">');
}

async function observe(browser, output) {
  const receipt = { checked_at: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), origin: ORIGIN, transport: 'real Chromium navigation and same-origin browser fetch', pages: {}, assets: {}, verified: false };
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    for (const [file, url, locale] of [['index.html', '/', 'ja'], ['en/index.html', '/en/', 'en']]) {
      const response = await page.goto(ORIGIN + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response || response.status() !== 200) throw new Error(`${url}: HTTP ${response?.status()}`);
      const html = await response.text();
      fs.writeFileSync(path.join(output, `verified-response-${locale}.html`), html);
      const headers = response.headers();
      receipt.pages[file] = { status: response.status(), matches_checkout: pageMatches(html, fs.readFileSync(path.join(ROOT, file), 'utf8')), html_bytes: Buffer.byteLength(html), content_type: headers['content-type'], cache_control: headers['cache-control'] };
    }
    if (!Object.values(receipt.pages).every(p => p.matches_checkout)) return receipt;
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/home-perf/manifest.json'), 'utf8'));
    receipt.assets = await page.evaluate(async entries => {
      const results = {};
      let index = 0;
      const worker = async () => {
        while (index < entries.length) {
          const [asset, expected] = entries[index++];
          const response = await fetch('/' + asset, { cache: 'no-cache' });
          if (response.status !== 200) throw new Error(`${asset}: HTTP ${response.status}`);
          const data = await response.arrayBuffer();
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
          if (hash !== expected.sha256) throw new Error(`Deployed asset differs from checkout: ${asset}`);
          results[asset] = { status: response.status, bytes: data.byteLength, sha256: hash, content_type: response.headers.get('content-type'), cache_control: response.headers.get('cache-control') };
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      return results;
    }, Object.entries(manifest.assets));
    receipt.verified = Object.keys(receipt.assets).length === Object.keys(manifest.assets).length;
    return receipt;
  } finally { await context.close(); }
}

async function main() {
  const { chromium } = require('playwright');
  const output = process.env.PERF_RESULTS || '/tmp/home-perf';
  fs.mkdirSync(output, { recursive: true });
  const required = process.argv.includes('--require');
  const deadline = Date.now() + (required ? 240000 : 0);
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    while (true) {
      let receipt;
      try { receipt = await observe(browser, output); }
      catch (error) { receipt = { checked_at: new Date().toISOString(), verified: false, error: String(error) }; }
      fs.writeFileSync(path.join(output, 'production-deployment.json'), JSON.stringify(receipt, null, 2) + '\n');
      if (receipt.verified) {
        console.log(`PASS: both public homepages and ${Object.keys(receipt.assets).length} deployed asset hashes match this checkout.`);
        return;
      }
      if (Date.now() >= deadline) {
        console.log(JSON.stringify(receipt, null, 2));
        if (required) throw new Error('Production did not match this checkout within the verification window.');
        console.log('OBSERVATION: production is not verified as this revision; no deployment claim is made.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  } finally { await browser.close(); }
}

module.exports = { pageMatches };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
