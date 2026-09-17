'use strict';
// Browser dependencies are installed only in the audit runner, never the site.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CASES = [
  ...[320, 390, 412, 768, 1440].map(width => ({ width, dpr: 1 })),
  { width: 390, dpr: 2 }, { width: 390, dpr: 3 }, { width: 412, dpr: 1.75 },
  { width: 390, dpr: 1, javascript: false },
];

function allowedRequest(url, method, base) {
  const parsed = new URL(url);
  return parsed.origin === new URL(base).origin && method === 'GET' && !parsed.pathname.startsWith('/cdn-cgi/rum');
}

// Drive timers from the runner: page timers do not fire when JavaScript is
// disabled. Bound the scroll using one height snapshot and poll image state
// from Node rather than waiting on an in-page async loop or animation frame.
async function loadLazyImages(page) {
  // Offscreen containment can change the document height as sections render.
  // Visit a fixed DOM inventory first; keep the bounded scroll and strict image
  // assertions below. Runner timers also work with page JavaScript disabled.
  const sections = page.locator('main > section');
  const count = await sections.count();
  for (let index = 0; index < count; index++) {
    await sections.nth(index).scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(50);
  }
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.evaluate(position => scrollTo(0, position), y);
    await page.waitForTimeout(50);
  }
  const deadline = Date.now() + 10000;
  while (true) {
    const complete = await page.evaluate(() => [...document.images].filter(img => new URL(img.currentSrc || img.src).origin === location.origin && img.getBoundingClientRect().width > 0).every(img => img.complete && img.naturalWidth > 0));
    if (complete) return;
    if (Date.now() >= deadline) throw new Error('Visible same-origin images did not load within 10 seconds');
    await page.waitForTimeout(100);
  }
}

async function main() {
  const { chromium } = require('playwright');
  const base = (process.env.PERF_BASE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
  assert(['http://127.0.0.1:8765', 'https://simplememofast.com'].includes(base), 'Only the local server or public homepages may be tested');
  const output = process.env.PERF_RESULTS || '/tmp/home-perf';
  fs.mkdirSync(output, { recursive: true });
  const results = [];
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    for (const locale of ['', 'en/']) {
      for (const scenario of CASES) {
        const { width, dpr } = scenario;
        const javascript = scenario.javascript !== false;
        const label = `${locale ? 'en' : 'ja'}-${width}${dpr === 1 ? '' : `-dpr-${dpr}`}${javascript ? '' : '-nojs'}`;
        const record = { origin: base, locale: locale || 'ja', width, dpr, javascript, pass: false };
        results.push(record);
        const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr, javaScriptEnabled: javascript, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const failures = [];
        page.on('pageerror', error => failures.push(String(error)));
        page.on('response', response => { if (new URL(response.url()).origin === new URL(base).origin && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
        // This applies even with JavaScript disabled. Never submit analytics or
        // follow an App Store link during functional testing. Lighthouse does
        // not use this rule and retains normal production analytics.
        await page.route('**/*', route => allowedRequest(route.request().url(), route.request().method(), base) ? route.continue() : route.abort());
        try {
          const response = await page.goto(base + '/' + locale, { waitUntil: 'networkidle', timeout: 30000 });
          assert.equal(response.status(), 200);
          await page.evaluate(() => document.fonts.ready);
          assert(await page.locator('h1').isVisible(), 'Heading is visible');
          assert(await page.locator('.hero a[href*="apps.apple.com"]').first().isVisible(), 'Primary conversion link is visible');
          assert(await page.locator('.hero__photograph img').evaluate(img => img.complete && img.naturalWidth > 0), 'Hero image loaded');
          assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `${label}: horizontal overflow`);
          if (locale) {
            assert.equal(await page.locator('.global-nav__logo img').getAttribute('alt'), '', 'Decorative logo must not repeat the adjacent accessible link text');
            assert((await page.locator('.global-nav__logo').innerText()).trim().length > 0, 'Navigation link retains its accessible text');
          }
          if (javascript) {
            const toggle = page.locator('.global-nav__hamburger');
            assert.equal(await toggle.count(), 1);
            if (await toggle.isVisible()) {
              await toggle.click();
              assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
              await toggle.click();
              assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
            }
          }
          await loadLazyImages(page);
          assert.deepEqual(failures, [], 'No JavaScript errors or missing same-origin resources');
          record.images = await page.locator('picture:has(source[data-home-perf="image"]) img').evaluateAll(images => images.map(img => ({ url: img.currentSrc, cssWidth: img.getBoundingClientRect().width, dpr: devicePixelRatio })));
          for (const image of record.images) {
            const match = image.url.match(/-(\d+)-[a-f0-9]{12}\.avif$/);
            assert(match, `Expected a generated AVIF: ${image.url}`);
            assert(Number(match[1]) >= image.cssWidth * dpr || Number(match[1]) >= 1448, 'Responsive source must preserve sufficient physical-pixel detail or use its native maximum');
          }
          if (width === 412 && dpr === 1.75) {
            assert(record.images.every(image => /-750-[a-f0-9]{12}\.avif$/.test(image.url)), 'Intermediate-density viewport uses 750px assets rather than 900px');
          }
          const heroRequests = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /\/voice-airpods-pro-bright-/.test(entry.name)).map(entry => entry.name));
          assert.equal(heroRequests.length, 1, 'Responsive preload and picture must reuse one hero request');
          await page.evaluate(() => scrollTo(0, 0));
          if (width === 390 || width === 1440 || dpr === 1.75) await page.screenshot({ path: path.join(output, label + '.png') });
          record.pass = true;
        } catch (error) {
          record.error = String(error);
          record.failures = failures;
          await page.screenshot({ path: path.join(output, label + '-failure.png') }).catch(() => {});
          throw error;
        } finally {
          await context.close();
          fs.writeFileSync(path.join(output, 'browser-checks.json'), JSON.stringify(results, null, 2) + '\n');
        }
      }
    }
    console.log(`PASS: ${results.length} homepage viewport/density/JavaScript scenarios at ${base}.`);
  } finally { await browser.close(); }
}

module.exports = { CASES, allowedRequest, loadLazyImages };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
