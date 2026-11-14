'use strict';
// Verify the real public browser response, not merely a successful build job.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const ORIGIN = 'https://simplememofast.com';

function videoBlocks(html) {
  const starts = html.match(/<video\b[^>]*>/g) || [];
  const ends = html.match(/<\/video\s*>/g) || [];
  const blocks = html.match(/<video\b[^>]*>[\s\S]*?<\/video\s*>/g) || [];
  return starts.length === blocks.length && ends.length === blocks.length ? blocks : null;
}

// Only actual body markup selects a profile. Comments and JavaScript strings
// must not let an old deployment impersonate the editorial release.
function editorialProfile(html) {
  const markup = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const bodies = [...markup.matchAll(/<body\b([^>]*)>/gi)];
  if (bodies.length !== 1) return false;
  const classes = bodies[0][1].match(/\bclass\s*=\s*(["'])(.*?)\1/i);
  return !!classes && classes[2].split(/\s+/).includes('sm-editorial');
}

function sections(value, tag) {
  return value.match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi')) || [];
}

function knownPlatformScript(script) {
  const match = script.match(/^<script\b([^>]*)>([\s\S]*?)<\/script\s*>$/i);
  if (!match || match[2].trim()) return false;
  const attrs = {};
  let rest = match[1];
  while (rest.trim()) {
    const attribute = rest.match(/^\s+([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/);
    if (!attribute) return false;
    const name = attribute[1].toLowerCase();
    if (name in attrs) return false;
    attrs[name] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    rest = rest.slice(attribute[0].length);
  }
  if (!Object.keys(attrs).every(name => ['src', 'defer', 'integrity', 'data-cf-beacon', 'crossorigin'].includes(name))) return false;
  if (!('defer' in attrs) || !attrs.src) return false;
  try {
    const url = new URL(attrs.src);
    return url.protocol === 'https:' && url.hostname === 'static.cloudflareinsights.com'
      && !url.port && !url.username && !url.password && !url.search && !url.hash
      && /^\/beacon\.min\.js(?:\/v[a-f0-9]+)?$/.test(url.pathname);
  } catch { return false; }
}

function nativeDocument(value) {
  const clean = value.replace(/<!--[\s\S]*?-->/g, '');
  const scripts = sections(clean.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ''), 'script');
  const platform = scripts.filter(knownPlatformScript);
  if (platform.length > 1) return null;
  let native = clean;
  for (const script of platform) native = native.replace(script, '');
  return native;
}

function editorialPageMatches(html, expected) {
  if (!editorialProfile(html) || !editorialProfile(expected)) return false;
  const actual = nativeDocument(html), wanted = nativeDocument(expected);
  if (actual === null || wanted === null) return false;
  const markup = value => value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const openings = (value, tag) => markup(value).match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) || [];
  for (const tag of ['html', 'head', 'body']) {
    const a = openings(actual, tag), b = openings(wanted, tag);
    if (a.length !== 1 || b.length !== 1 || a[0] !== b[0]) return false;
  }
  const styles = value => sections(value.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ''), 'style');
  if (JSON.stringify(styles(actual)) !== JSON.stringify(styles(wanted))) return false;
  // Compare the entire native body too: an overlay or inline hidden attribute
  // outside main must not pass a partial content check. Ignore only inter-tag
  // whitespace introduced where the one known Cloudflare beacon was removed.
  const bodies = sections(actual, 'body'), expectedBodies = sections(wanted, 'body');
  const whitespace = value => value.replace(/>\s+</g, '><').trim();
  if (bodies.length !== 1 || expectedBodies.length !== 1 || whitespace(bodies[0]) !== whitespace(expectedBodies[0])) return false;
  // The complete native head is authoritative too. An added base URL or an
  // uppercase LINK must not evade the narrower metadata inventories below.
  const heads = sections(actual, 'head'), expectedHeads = sections(wanted, 'head');
  if (heads.length !== 1 || expectedHeads.length !== 1 || whitespace(heads[0]) !== whitespace(expectedHeads[0])) return false;
  const mains = sections(actual, 'main'), expectedMains = sections(wanted, 'main');
  if (mains.length !== 1 || expectedMains.length !== 1 || mains[0] !== expectedMains[0]) return false;
  const headers = sections(actual, 'header'), expectedHeaders = sections(wanted, 'header');
  const footers = sections(actual, 'footer'), expectedFooters = sections(wanted, 'footer');
  if (headers.length !== 1 || expectedHeaders.length !== 1 || headers[0] !== expectedHeaders[0]
      || footers.length !== 1 || expectedFooters.length !== 1 || footers[0] !== expectedFooters[0]) return false;
  const links = wanted.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) || [];
  const editorialLinks = links.filter(link => /href="\/assets\/css\/home-editorial\.css\?v=[a-f0-9]{10}"/.test(link));
  const actualLinks = actual.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) || [];
  if (editorialLinks.length !== 1 || actualLinks.length !== links.length || !links.every((link, i) => link === actualLinks[i])) return false;
  if (/<style[^>]*data-home-perf=|href="\/assets\/css\/(?:style\.min|home-hero|site-design)\.css/.test(actual)) return false;
  const sources = wanted.match(/<source data-home-perf="image"[^>]*>/g) || [];
  const actualPhotos = actual.match(/<picture class="hero__photograph">/g) || [];
  if (sources.length !== 1 || !sources.every(source => actual.includes(source)) || actualPhotos.length !== 1) return false;
  // Metadata, style blocks and every reviewed script retain their complete
  // ordered inventory. Only one recognized Cloudflare beacon is exempted.
  const metadataTags = value => value.match(/<meta\b[^>]*>|<title>[\s\S]*?<\/title>|<link\b[^>]*rel="(?:canonical|alternate|preload)"[^>]*>/g) || [];
  const metadata = metadataTags(wanted), actualMetadata = metadataTags(actual);
  const scripts = sections(wanted, 'script'), actualScripts = sections(actual, 'script');
  return metadata.length > 0 && scripts.length > 0 && metadata.length === actualMetadata.length && metadata.every((tag, i) => tag === actualMetadata[i])
    && scripts.length === actualScripts.length && scripts.every((script, i) => script === actualScripts[i]) && !/<meta\b[^>]*content="[^"]*noindex/.test(actual)
    && heroOrder(actual, wanted);
}

function pageMatches(html, expected) {
  if (editorialProfile(expected) || editorialProfile(html)) return editorialPageMatches(html, expected);
  const styles = [...expected.matchAll(/<style data-home-perf="(?:base|hero)">([\s\S]*?)<\/style>/g)].map(m => m[1]);
  const sources = expected.match(/<source data-home-perf="image"[^>]*>/g) || [];
  // The stylesheet/asset subset alone cannot distinguish a poster-only release
  // or rollback. Compare original native markup, including poster and sources.
  const actualVideo = videoBlocks(html), expectedVideo = videoBlocks(expected);
  return actualVideo !== null && expectedVideo !== null
    && actualVideo.length === expectedVideo.length
    && expectedVideo.every((video, i) => video === actualVideo[i])
    && styles.length === 2 && sources.length > 0
    && styles.every(style => html.includes(style)) && sources.every(source => html.includes(source))
    && html.indexOf('id="hero-title"') > 0
    && heroOrder(html, expected);
}

// English parses the title before its photograph. The Japanese hero has no photograph since
// 2026-11-13, so a response that still carries one is the previous release.
function heroOrder(html, expected) {
  const photo = '<picture class="hero__photograph">';
  if (!expected.includes(photo)) return !html.includes(photo);
  return html.indexOf('id="hero-title"') < html.indexOf(photo);
}

function deliveryAssetsFor(manifest, html, root = ROOT) {
  const assets = { ...manifest.assets };
  if (editorialProfile(html)) {
    const link = (html.match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) || [])
      .find(tag => /href="\/assets\/css\/home-editorial\.css\?v=[a-f0-9]{10}"/.test(tag));
    if (!link) throw new Error('Verified editorial response has no versioned stylesheet');
    const href = link.match(/href="([^"]+)"/)[1];
    const url = new URL(href, ORIGIN);
    const name = url.pathname.slice(1);
    const bytes = fs.readFileSync(path.join(root, name));
    // Key is the exact href from the verified public response, not pathname.
    assets[url.pathname.slice(1) + url.search] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  }
  return assets;
}

async function observe(browser, output) {
  const receipt = { checked_at: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), origin: ORIGIN, transport: 'real Chromium navigation and same-origin browser fetch', pages: {}, assets: {}, verified: false };
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const responses = {};
    for (const [file, url, locale] of [['index.html', '/', 'ja'], ['en/index.html', '/en/', 'en']]) {
      const response = await page.goto(ORIGIN + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response || response.status() !== 200) throw new Error(`${url}: HTTP ${response?.status()}`);
      const html = await response.text();
      responses[file] = html;
      fs.writeFileSync(path.join(output, `verified-response-${locale}.html`), html);
      const headers = response.headers();
      receipt.pages[file] = { status: response.status(), matches_checkout: pageMatches(html, fs.readFileSync(path.join(ROOT, file), 'utf8')), html_bytes: Buffer.byteLength(html), content_type: headers['content-type'], cache_control: headers['cache-control'] };
    }
    if (!Object.values(receipt.pages).every(p => p.matches_checkout)) return receipt;
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/home-perf/manifest.json'), 'utf8'));
    const deliveryAssets = deliveryAssetsFor(manifest, responses['index.html']);
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
    }, Object.entries(deliveryAssets));
    receipt.verified = Object.keys(receipt.assets).length === Object.keys(deliveryAssets).length;
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

module.exports = { pageMatches, editorialProfile, knownPlatformScript, deliveryAssetsFor };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
