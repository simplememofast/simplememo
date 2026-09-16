'use strict';
// Playwright is installed in the audit runner, never in the production site.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:8765';
const output = process.env.PERF_RESULTS || '/tmp/home-perf';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const results = [];
  try {
    for (const locale of ['', 'en/']) {
      for (const width of [320, 390, 412, 768, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const failures = [];
        page.on('pageerror', error => failures.push(String(error)));
        page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
        // Local functional tests do not send analytics events or follow store links.
        // Lighthouse production measurements do not use this routing rule.
        await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        await page.goto(base + '/' + locale, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        assert(await page.locator('h1').isVisible(), 'Heading is visible');
        assert(await page.locator('.hero a[href*="apps.apple.com"]').first().isVisible(), 'Primary conversion link is visible');
        assert(await page.locator('.hero__photograph img').evaluate(img => img.complete && img.naturalWidth > 0), 'Hero image loaded');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(overflow <= 1, `${locale} width ${width} overflows by ${overflow}px`);
        const toggle = page.locator('.global-nav__hamburger');
        assert.equal(await toggle.count(), 1);
        if (await toggle.isVisible()) {
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Mobile navigation opens');
          await toggle.click();
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Mobile navigation closes');
        }
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) {
            scrollTo(0, y);
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        });
        await page.waitForTimeout(500);
        const broken = await page.locator('img').evaluateAll(images => images.filter(img => new URL(img.currentSrc || img.src).origin === location.origin && img.getBoundingClientRect().width > 0 && !img.naturalWidth).map(img => img.currentSrc || img.src));
        assert.deepEqual(broken, [], 'All visible same-origin lazy images load after scrolling (external services intentionally blocked)');
        assert.deepEqual(failures, [], 'No JavaScript errors or missing local resources');
        await page.evaluate(() => scrollTo(0, 0));
        if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, `${locale ? 'en' : 'ja'}-${width}.png`) });
        results.push({ locale: locale || 'ja', width, javascript: true, pass: true });
        await context.close();
      }
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(base + '/' + locale, { waitUntil: 'load' });
      assert(await page.locator('h1').isVisible());
      assert(await page.locator('.hero a[href*="apps.apple.com"]').first().isVisible());
      assert(await page.locator('.hero__photograph img').evaluate(img => img.complete && img.naturalWidth > 0));
      results.push({ locale: locale || 'ja', width: 390, javascript: false, pass: true });
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'browser-checks.json'), JSON.stringify(results, null, 2));
    console.log(`PASS: ${results.length} homepage viewport/JavaScript scenarios.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
