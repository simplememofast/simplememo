'use strict';
// Browser dependencies are installed only in the audit runner, never the site.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CASES = [
  ...[320, 375, 390, 412, 430, 768, 1440].map(width => ({ width, dpr: 1 })),
  { width: 390, dpr: 2 }, { width: 390, dpr: 3 }, { width: 412, dpr: 1.75 },
  { width: 412, dpr: 3 },
  { width: 390, dpr: 1, javascript: false },
];
const OBSIDIAN_CASES = [
  ...[320, 375, 390, 430, 768, 1440].map(width => ({ width, javascript: true })),
  { width: 390, javascript: false },
];

function allowedRequest(url, method, base) {
  const parsed = new URL(url);
  return parsed.origin === new URL(base).origin && method === 'GET' && !parsed.pathname.startsWith('/cdn-cgi/rum');
}

// Check the actual clickable surface, not just a matching href. A decorative
// overlay once left the homepage App Store badge visually present but inert.
function assertHitTarget(target, label) {
  assert(target && target.visible, `${label}: visible clickable target`);
  assert(target.hit, `${label}: another element intercepts the center`);
  assert(target.width >= 24 && target.height >= 44, `${label}: readable touch target`);
  assert(target.left >= -1 && target.right <= target.viewport + 1, `${label}: clipped horizontally`);
}

// The reviewed portrait's face area is expressed in the original 1536×1024
// image coordinates. Check the CSS crop rather than trusting object-position.
function portraitCoverage({ width, height, objectFit, objectPosition }) {
  assert(['cover', 'contain'].includes(objectFit), 'Portrait preserves its aspect ratio');
  const position = objectPosition.split(/\s+/).map(value => {
    assert(/^[0-9.]+%$/.test(value), 'Portrait uses auditable percentage positioning');
    return Number.parseFloat(value) / 100;
  });
  assert.equal(position.length, 2, 'Portrait position has two axes');
  const scale = Math[objectFit === 'cover' ? 'max' : 'min'](width / 1536, height / 1024);
  const offsetX = (width - 1536 * scale) * position[0];
  const offsetY = (height - 1024 * scale) * position[1];
  const face = { left: offsetX + 300 * scale, right: offsetX + 700 * scale,
    top: offsetY + 100 * scale, bottom: offsetY + 560 * scale };
  const fits = face.left >= -1 && face.top >= -1 && face.right <= width + 1 && face.bottom <= height + 1;
  return { ...face, width, height, fits };
}

// Text ranges and control surfaces, rather than the copy's enclosing box,
// distinguish harmless overlap with the photograph's fade from covering a face.
function portraitPresentation() {
  const hero = document.querySelector('main .hero');
  const image = hero.querySelector('.hero__photograph img');
  const rect = element => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const style = getComputedStyle(image), obstacles = [];
  const walker = document.createTreeWalker(hero, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim() || node.parentElement.closest('script,style')) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width && r.height) obstacles.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    }
  }
  for (const control of hero.querySelectorAll('a,button')) {
    const r = rect(control);
    if (r.width && r.height) obstacles.push(r);
  }
  return { image: { ...rect(image), objectFit: style.objectFit, objectPosition: style.objectPosition },
    copy: rect(hero.querySelector('.hero-copy')), heading: rect(hero.querySelector('h1')),
    cta: rect(hero.querySelector('.hero-actions .store-link')), obstacles,
    viewport: { width: innerWidth, height: innerHeight } };
}

function assertPortraitPresentation(measurement) {
  const { image, copy, heading, cta, obstacles, viewport } = measurement;
  const face = portraitCoverage(image);
  assert(face.fits, 'Portrait face remains inside the crop');
  const visibleFace = { left: image.left + face.left, right: image.left + face.right,
    top: image.top + face.top, bottom: image.top + face.bottom };
  assert(obstacles.length > 0, 'Portrait text and controls were actually measured');
  const overlaps = obstacles.filter(r => r.left < visibleFace.right && r.right > visibleFace.left
    && r.top < visibleFace.bottom && r.bottom > visibleFace.top);
  assert.equal(overlaps.length, 0, `Text or controls cover the portrait face: ${JSON.stringify(overlaps.slice(0, 3))}`);
  if (viewport.width <= 820) {
    assert(image.top < heading.top, 'Mobile photograph precedes the headline visually');
    assert(copy.top <= image.bottom + 32, 'Mobile portrait and copy remain adjacent');
  }
  if (viewport.width <= 430) {
    assert(image.top >= 0 && heading.bottom <= viewport.height && cta.bottom <= viewport.height,
      'Mobile portrait, headline and download share the initial viewport');
  }
  return { ...face, copyGap: copy.top - image.bottom };
}

async function checkControl(page, control, label) {
  await control.scrollIntoViewIfNeeded();
  assertHitTarget(await control.evaluate(el => {
    const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { visible: r.width > 0 && r.height > 0, hit: hit === el || el.contains(hit),
      width: r.width, height: r.height, left: r.left, right: r.right, viewport: innerWidth };
  }), label);
  await control.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert(await control.evaluate(el => {
    const s = getComputedStyle(el);
    return document.activeElement === el && (parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none');
  }), `${label}: keyboard focus remains visible`);
}

async function checkLanguageMenu(page) {
  const languages = page.locator('[data-site-header] .site-languages');
  const summary = languages.locator('summary');
  await checkControl(page, summary, 'language disclosure');
  await summary.press('Enter');
  assert.equal(await languages.getAttribute('open'), '', 'Language choices open from the keyboard');
  const english = languages.locator('a[data-site-locale="en"]');
  await checkControl(page, english, 'English language route');
  assert(await english.isVisible(), 'Language route is visible');
  assertReadableTextGeometry(await page.evaluate(readableTextGeometry));
  await summary.press('Enter');
  assert.equal(await languages.getAttribute('open'), null, 'Language choices close from the keyboard');
}

// Measure text itself: body overflow-x:clip may hide a wide child while
// document.scrollWidth looks healthy. Real horizontal scrollers are excluded.
function readableTextGeometry() {
  const rects = [];
  for (const region of document.querySelectorAll('[data-site-header], main, [data-site-footer]')) {
    const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!node.textContent.trim() || !parent || parent.closest('script,style,noscript')) continue;
      let scrollable = false;
      for (let ancestor = parent; ancestor; ancestor = ancestor.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(ancestor).overflowX) && ancestor.scrollWidth > ancestor.clientWidth + 1) {
          scrollable = true; break;
        }
      }
      if (scrollable) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && rect.height > 0) rects.push({ left: rect.left, right: rect.right });
      }
    }
  }
  return { viewport: innerWidth, rects };
}
function assertReadableTextGeometry(measurement) {
  assert(measurement.rects.length > 0, 'Editorial readable text was actually measured');
  const overflow = measurement.rects.filter(rect => rect.left < -1 || rect.right > measurement.viewport + 1);
  assert.equal(overflow.length, 0, `Editorial text is clipped despite the body safety net: ${JSON.stringify(overflow.slice(0, 5))}`);
}

async function checkEditorialControls(page) {
  const navigation = page.locator('header[data-site-header] nav a[href]');
  assert(await navigation.count() >= 4, 'Editorial navigation retains every visible route');
  for (let i = 0; i < await navigation.count(); i++) {
    const link = navigation.nth(i);
    // Native language choices remain hidden until their disclosure is opened.
    if (await link.evaluate(el => !!el.closest('details'))) continue;
    assert(await link.isVisible(), 'Primary navigation remains available without a hamburger');
  }
  for (const selector of ['header .header-cta', '.hero a[href*="apps.apple.com"]']) {
    const link = page.locator(selector).first();
    await link.scrollIntoViewIfNeeded();
    const target = await link.evaluate(el => {
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { visible: r.width > 0 && r.height > 0, hit: hit === el || el.contains(hit), width: r.width, height: r.height, left: r.left, right: r.right, viewport: innerWidth };
    });
    assertHitTarget(target, selector);
    assert(new URL(await link.getAttribute('href'), page.url()).pathname.includes('id6758438948'), 'Download target retains the published app ID');
  }
  const faq = page.locator('.faqs details').first();
  assert(await faq.count(), 'Editorial page retains native FAQ controls');
  const summary = faq.locator('summary');
  await summary.click();
  assert.equal(await faq.getAttribute('open'), '', 'Native FAQ opens on click');
  await summary.press('Enter');
  assert.equal(await faq.getAttribute('open'), null, 'Native FAQ closes from the keyboard');
  await checkLanguageMenu(page);
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
          const editorial = !!await page.locator('body.sm-editorial').count();
          record.layout = editorial ? 'editorial' : 'legacy';
          assert(!editorial || !locale, 'Editorial homepage profile is Japanese only');
          await page.evaluate(() => document.fonts.ready);
          assert(await page.locator('h1').isVisible(), 'Heading is visible');
          assert(await page.locator('.hero a[href*="apps.apple.com"]').first().isVisible(), 'Primary conversion link is visible');
          if (locale || editorial) {
            assert(await page.locator('.hero__photograph img').evaluate(img => img.complete && img.naturalWidth > 0), 'Hero image loaded');
          } else {
            // The Japanese hero has no photo since 2026-11-13 (owner decision): the memo and the note it lands in.
            assert.equal(await page.locator('.hero__photograph').count(), 0, 'Japanese hero has no photograph');
            assert(await page.locator('.hero .hp-stage').isVisible(), 'Japanese hero shows the memo and the note');
          }
          assert(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `${label}: horizontal overflow`);
          if (editorial) {
            record.portrait = assertPortraitPresentation(await page.evaluate(portraitPresentation));
          }
          if (locale) {
            assert.equal(await page.locator('.global-nav__logo img').getAttribute('alt'), '', 'Decorative logo must not repeat the adjacent accessible link text');
            assert((await page.locator('.global-nav__logo').innerText()).trim().length > 0, 'Navigation link retains its accessible text');
          }
          if (editorial) {
            await checkEditorialControls(page);
          } else if (javascript) {
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
          if (editorial) assertReadableTextGeometry(await page.evaluate(readableTextGeometry));
          // A PR audit can still see the previous homepage in production.
          if (!locale && !editorial && await page.locator('body.capture-full').count()) {
            await page.locator('.capture-full .pricing-cards').scrollIntoViewIfNeeded();
            const prices = await page.locator('.capture-full .pricing-card').evaluateAll(cards => cards.map(card => {
              const price = card.querySelector('.pricing-card__price,.pricing-card__price-row');
              const bounds = card.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(price);
              return { text: price.textContent.trim(), fits: price.scrollWidth <= price.clientWidth + 1 &&
                [...range.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right) };
            }));
            assert.equal(prices.length, 3, 'All three Japanese price cards are checked');
            assert(prices.every(price => price.fits), `Price text must remain readable inside each card: ${JSON.stringify(prices)}`);
          }
          if (editorial) {
            const prices = await page.locator('.plans .plan').evaluateAll(cards => cards.map(card => {
              const price = card.querySelector('.price'), bounds = card.getBoundingClientRect();
              const range = document.createRange(); range.selectNodeContents(price);
              return { text: price.textContent.trim(), fits: price.scrollWidth <= price.clientWidth + 1 &&
                [...range.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right),
                fontSize: parseFloat(getComputedStyle(price).fontSize) };
            }));
            assert.equal(prices.length, 2, 'Editorial Free and Premium prices are both checked');
            assert(prices.every(price => price.fits && price.fontSize >= 32), `Editorial price text remains readable: ${JSON.stringify(prices)}`);
            record.prices = prices;
          }
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
          if (!locale && !editorial) {
            // No photo, so no stale preload may fetch one either.
            assert.deepEqual(heroRequests, [], 'The Japanese page requests no hero photograph');
          } else {
            assert.equal(heroRequests.length, 1, 'Responsive preload and picture must reuse one hero request');
            const hero = record.images.find(image => /voice-airpods-pro-bright-/.test(image.url));
            assert(hero, 'The displayed hero must be in the checked inventory');
            if (!editorial && ((width === 390 && dpr === 3) || (width === 1440 && dpr === 1))) {
              assert(/-1200-[a-f0-9]{12}\.avif$/.test(hero.url), 'Use the correctly sized 1200px hero');
            }
            if (!editorial && width === 412 && dpr === 3) {
              // 412pt at 3x needs 1,236px; English has no 1320w candidate (R10).
              assert(/-1536-[a-f0-9]{12}\.avif$/.test(hero.url), 'Wider triple-density displays use the 1536w hero');
            }
            record.heroResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /\/voice-airpods-pro-bright-/.test(entry.name)).map(entry => ({url: entry.name, encodedBodySize: entry.encodedBodySize, transferSize: entry.transferSize, initiatorType: entry.initiatorType})));
            assert.equal(record.heroResources.length, 1, 'Responsive preload and picture must reuse one request');
            assert.equal(record.heroResources[0].url, hero.url, 'Measured request must be the displayed hero');
            const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/home-perf/manifest.json'), 'utf8'));
            const expected = manifest.assets[new URL(hero.url).pathname.slice(1)];
            assert(expected, 'Displayed hero must be in the verified manifest');
            assert.equal(record.heroResources[0].encodedBodySize, expected.bytes, 'Encoded response bytes must match the immutable asset');
          }
          await page.evaluate(() => scrollTo(0, 0));
          if (dpr === 1 || dpr === 1.75) await page.screenshot({ path: path.join(output, label + '.png') });
          if (editorial && dpr === 1) await page.screenshot({ path: path.join(output, label + '-full.png'), fullPage: true });
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
    // 960×900: a mouse window between the phone and desktop layouts, where the in-page QRs show since
    // 2026-11-14 (hover:hover and pointer:fine) and make the hero taller.
    for (const [width, height] of [[390, 664], [960, 900], [1440, 900]]) results.push(await checkInPageLinks(browser, base, width, height, output));
    for (const scenario of OBSIDIAN_CASES) {
      const record = { origin: base, route: '/obsidian/', ...scenario, pass: false };
      results.push(record);
      try { await checkObsidian(browser, base, scenario, output, record); }
      finally { fs.writeFileSync(path.join(output, 'browser-checks.json'), JSON.stringify(results, null, 2) + '\n'); }
    }
    fs.writeFileSync(path.join(output, 'browser-checks.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(`PASS: ${results.length} homepage/Obsidian viewport/density/JavaScript scenarios at ${base}.`);
  } finally { await browser.close(); }
}

async function checkObsidian(browser, base, { width, javascript }, output, record) {
  const label = `obsidian-${width}${javascript ? '' : '-nojs'}`;
  const context = await browser.newContext({ viewport: { width, height: 900 },
    javaScriptEnabled: javascript, reducedMotion: 'reduce' });
  const page = await context.newPage(), failures = [];
  page.on('pageerror', error => failures.push(String(error)));
  page.on('response', response => {
    if (new URL(response.url()).origin === new URL(base).origin && response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/*', route => allowedRequest(route.request().url(), route.request().method(), base) ? route.continue() : route.abort());
  try {
    assert.equal((await page.goto(base + '/obsidian/', { waitUntil: 'networkidle', timeout: 30000 })).status(), 200);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('h1').count(), 1);
    assert(await page.locator('h1').isVisible(), 'Obsidian heading remains visible');
    const cta = page.locator('.lpr-hero a[data-cta-placement="hero"]').first();
    assert.equal(new URL(await cta.getAttribute('href'), page.url()).hostname, 'simplememofast.onelink.me', 'Obsidian pilot route is preserved');
    assert.equal(await cta.getAttribute('data-cta-cluster'), 'obsidian');
    await checkControl(page, cta, 'Obsidian hero download');
    await page.evaluate(() => scrollTo(0, 0));
    const menu = page.locator('#navLinks'), toggle = page.locator('.global-nav__hamburger');
    if (javascript && await toggle.isVisible()) {
      await checkControl(page, toggle, 'navigation disclosure');
      await toggle.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert(await menu.locator('a').first().isVisible(), 'Expanded navigation links are visible');
      assertReadableTextGeometry(await page.evaluate(readableTextGeometry));
      await page.keyboard.press('Escape');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert(await toggle.evaluate(el => document.activeElement === el), 'Escape returns focus to the navigation toggle');
    } else {
      assert(await menu.locator('a').first().isVisible(), 'Navigation remains available without JavaScript');
    }
    await checkLanguageMenu(page);
    const faq = page.locator('.lpr-faq-item').first(), summary = faq.locator('summary');
    await checkControl(page, summary, 'Obsidian FAQ');
    await summary.press('Enter');
    assert.equal(await faq.getAttribute('open'), '', 'FAQ opens without a script dependency');
    assert(await faq.locator('.lpr-faq-a').isVisible());
    await summary.press('Enter');
    assert.equal(await faq.getAttribute('open'), null);
    const panel = page.locator('#lprDemoContent'), inbox = page.locator('#lpr-tab-inbox');
    await panel.scrollIntoViewIfNeeded();
    if (javascript) {
      await inbox.click();
      assert.equal(await inbox.getAttribute('aria-selected'), 'true');
      assert.equal(await panel.getAttribute('aria-labelledby'), 'lpr-tab-inbox');
      assert((await panel.innerText()).includes('Inbox'));
      await inbox.press('ArrowRight');
      assert.equal(await panel.getAttribute('aria-labelledby'), 'lpr-tab-mail');
      assert(await page.locator('#lpr-tab-mail').evaluate(el => document.activeElement === el));
      assertReadableTextGeometry(await page.evaluate(readableTextGeometry));
      await page.locator('#lpr-tab-mail').press('Home');
    } else {
      assert((await panel.innerText()).includes('朝の散歩'), 'Static demo example remains readable without JavaScript');
    }
    await loadLazyImages(page);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Obsidian has no horizontal overflow');
    assertReadableTextGeometry(await page.evaluate(readableTextGeometry));
    assert.deepEqual(failures, [], 'Obsidian has no JavaScript errors or missing same-origin resources');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, label + '.png') });
    await page.screenshot({ path: path.join(output, label + '-full.png'), fullPage: true });
    record.pass = true;
  } catch (error) {
    record.error = String(error); record.failures = failures;
    await page.screenshot({ path: path.join(output, label + '-failure.png') }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

/**
 * Every in-page link in the Japanese <main> must land its target under the fixed header,
 * with motion allowed. Sections below the hero render lazily against 600px placeholders,
 * so a smooth scroll to a far target once stopped 2,000-5,000px short (2026-11-13) while
 * focus moved to the off-screen heading. The scenarios above all run with reduced motion,
 * which takes the instant path and could not see it.
 */
async function checkInPageLinks(browser, base, width, height, output) {
  const record = { origin: base, locale: 'ja', width, height, check: 'in-page links, motion allowed', pass: false, links: [] };
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', isMobile: width < 768, hasTouch: width < 768 });
  const page = await context.newPage();
  await page.route('**/*', route => allowedRequest(route.request().url(), route.request().method(), base) ? route.continue() : route.abort());
  try {
    await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 30000 });
    const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('main a[href^="#"]')].map(a => a.getAttribute('href')))]
      .filter(href => href.length > 1 && href !== '#main-content' && document.getElementById(href.slice(1))));
    for (const href of hrefs) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(200);
      const link = page.locator(`main a[href="${href}"]`).first();
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.waitForTimeout(2200);
      const landing = await page.evaluate(id => {
        const target = document.getElementById(id);
        const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        const top = target.getBoundingClientRect().top;
        const atEnd = Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)) < 2;
        return { top, expected: padding + margin, atEnd, focusInside: target.contains(document.activeElement) };
      }, href.slice(1));
      record.links.push({ href, ...landing });
      assert(Math.abs(landing.top - landing.expected) <= 2 || (landing.atEnd && landing.top >= landing.expected - 2),
        `${href} at ${width}px lands ${Math.round(landing.top)}px from the top, expected ${landing.expected}px`);
      assert(landing.focusInside, `${href} at ${width}px must move focus into its target`);
    }
    // Keyboard focus crossing into a later section must stay on screen (WCAG 2.4.7 / 2.4.11).
    // With smooth scrolling, Tab from #details to the closing badge once stopped 1,300-4,000px short.
    // Each boundary gets a freshly loaded page: sections rendered earlier remember their real height
    // and would hide the failure.
    record.tabs = [];
    const sections = await page.evaluate(() => [...document.querySelectorAll('main > section')]
      .filter(section => [...section.querySelectorAll('a[href], button, summary')].some(el => el.getClientRects().length))
      .map(section => section.id || section.className.split(' ')[0]));
    for (const section of sections) {
      const fresh = await context.newPage();
      await fresh.route('**/*', route => allowedRequest(route.request().url(), route.request().method(), base) ? route.continue() : route.abort());
      await fresh.goto(base + '/', { waitUntil: 'networkidle', timeout: 30000 });
      await fresh.evaluate(name => {
        const section = document.getElementById(name) || document.querySelector(`main > section.${name}`);
        const items = [...section.querySelectorAll('a[href], button, summary')].filter(el => el.getClientRects().length);
        items[items.length - 1].focus();
      }, section);
      await fresh.waitForTimeout(300);
      await fresh.keyboard.press('Tab');
      await fresh.waitForTimeout(1500);
      const after = await fresh.evaluate(() => {
        const el = document.activeElement, rect = el.getBoundingClientRect();
        return { label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40), top: rect.top, bottom: rect.bottom, viewport: innerHeight, inMain: !!el.closest('main') };
      });
      await fresh.close();
      record.tabs.push({ from: section, ...after });
      if (after.inMain) assert(after.bottom > 0 && after.top < after.viewport, `Tab after #${section} at ${width}px leaves "${after.label}" off screen (${Math.round(after.top)}px)`);
    }
    record.pass = true;
    return record;
  } catch (error) {
    record.error = String(error);
    await page.screenshot({ path: path.join(output, `ja-${width}-in-page-links-failure.png`) }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

module.exports = { CASES, OBSIDIAN_CASES, allowedRequest, loadLazyImages, assertHitTarget, checkEditorialControls,
  portraitCoverage, portraitPresentation, assertPortraitPresentation, readableTextGeometry, assertReadableTextGeometry };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
