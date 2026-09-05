#!/usr/bin/env node
// Browser verification against a local preview or deployed site.
// Usage: node scripts/verify-citation-assets.cjs http://127.0.0.1:8769 /tmp/evidence
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const origin = process.argv[2] || 'http://127.0.0.1:8769';
const evidence = process.argv[3];
const paths = ['/en/autopilot/', '/press/', '/en/press/', '/resources/obsidian-inbox/', '/en/resources/obsidian-inbox/'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (evidence) await fs.mkdir(evidence, { recursive: true });
  try {
    for (const pathname of paths) {
      const response = await page.goto(origin + pathname);
      assert.equal(response.status(), 200, pathname);
      assert.equal(await page.locator('h1').count(), 1, pathname + ' has one main heading');
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://simplememofast.com' + pathname);
      assert.equal(await page.locator('html').getAttribute('lang'), pathname.startsWith('/en/') ? 'en' : 'ja');
      assert.equal(await page.locator('link[rel=alternate][hreflang]').count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, pathname + ' fits mobile');
      assert.equal(await page.locator('img').evaluateAll(imgs => imgs.every(img => !img.complete || img.naturalWidth > 0)), true, pathname + ' images load');
      if (evidence) await page.screenshot({ path: path.join(evidence, pathname.slice(1).replaceAll('/', '-') + 'mobile.png'), fullPage: true });
    }
    const report = await context.request.get(origin + '/assets/downloads/autopilot-runs-2026-09-02.csv');
    assert.equal(report.status(), 200);
    const csvRows = (await report.text()).trim().split('\n').slice(1).map(line => line.split(','));
    assert.equal(csvRows.length, 41);
    assert.equal(csvRows.filter(row => row[3] === 'true').length, 28);
    assert.equal(csvRows.filter(row => row[4] === 'shipped').length, 19);
    assert.equal(csvRows.filter(row => row[3] === 'true' && row[6]).length, 7);
    const worksheet = (await (await context.request.get(origin + '/assets/downloads/capture-measurement-worksheet.csv')).text()).trim().split('\n');
    assert.equal(worksheet.length, 51);
    assert(worksheet.slice(1).every(row => row.split(',').slice(2).every(value => value === '')), 'worksheet contains no invented measurements');
    for (const pathname of ['/resources/obsidian-inbox/', '/en/resources/obsidian-inbox/']) {
      await page.goto(origin + pathname);
      const sent = [];
      const observe = request => sent.push(request.url() + ' ' + (request.postData() || ''));
      page.on('request', observe);
      await page.locator('#destination').selectOption('daily');
      await page.locator('#note-date').fill('2026-09-05');
      await page.locator('#note-time').fill('08:07');
      await page.locator('#style').selectOption('task');
      const privateText = 'PRIVATE-NOTE-7827 <img src=x onerror=alert(1)>\nsecond line';
      await page.locator('#memo').fill(privateText);
      assert.equal(await page.locator('#markdown-preview').textContent(), '# 2026-09-05\n\n- [ ] 08:07 ' + privateText.replace('\n', '\n  ') + '\n');
      assert.equal(await page.locator('#markdown-preview img').count(), 0, 'untrusted text stays text');
      await page.locator('#timestamp').uncheck();
      assert.equal(await page.locator('#markdown-preview').textContent(), '# 2026-09-05\n\n- [ ] ' + privateText.replace('\n', '\n  ') + '\n');
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#download-markdown').click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), '2026-09-05.md');
      assert.equal(await fs.readFile(await download.path(), 'utf8'), await page.locator('#markdown-preview').textContent());
      await page.locator('#destination').selectOption('inbox');
      await page.locator('#heading').fill('');
      assert((await page.locator('#markdown-preview').textContent()).startsWith('# Inbox\n'));
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
      });
      await page.locator('#copy-markdown').click();
      assert((await page.locator('#tool-status').textContent()).length > 10, 'clipboard denial provides a visible fallback');
      assert.equal((await page.evaluate(() => getSelection().toString())).trimEnd(), (await page.locator('#markdown-preview').textContent()).trimEnd());
      assert(!sent.some(value => value.includes('PRIVATE-NOTE-7827')), 'typed content is not transmitted');
      assert(!sent.some(value => /^https?:/.test(value)), 'editing and downloading need no network requests');
      page.off('request', observe);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin + '/en/autopilot/');
    if (evidence) await page.screenshot({ path: path.join(evidence, 'autopilot-desktop.png'), fullPage: true });
    const noScript = await browser.newContext({ javaScriptEnabled: false });
    const fallback = await noScript.newPage();
    await fallback.goto(origin + '/en/resources/obsidian-inbox/');
    assert(await fallback.locator('noscript').isVisible(), 'download alternatives remain visible without JavaScript');
    assert.equal((await noScript.request.get(origin + '/assets/downloads/obsidian-inbox-en.md')).status(), 200);
    await noScript.close();
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log('PASS: five mobile pages; canonical/languages; source counts; blank worksheet; bilingual generation, literal text, download bytes, privacy, clipboard fallback, and no-JS downloads.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
