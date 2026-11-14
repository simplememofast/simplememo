'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { CASES, allowedRequest, loadLazyImages, assertHitTarget, portraitCoverage, readableTextGeometry, assertReadableTextGeometry } = require('./browser_checks.cjs');

test('functional requests cannot submit analytics or reach a look-alike origin', () => {
  for (const base of ['https://simplememofast.com', 'http://127.0.0.1:8765']) {
    assert(allowedRequest(base + '/assets/home-perf/test.avif', 'GET', base));
    assert(allowedRequest(base + '/en/', 'GET', base));
    assert(!allowedRequest(base + '/cdn-cgi/rum', 'GET', base));
    assert(!allowedRequest(base + '/cdn-cgi/rum?v=1', 'POST', base));
    assert(!allowedRequest(base + '/contact', 'POST', base));
    assert(!allowedRequest('https://simplememofast.com.attacker.invalid/', 'GET', base));
    assert(!allowedRequest('https://www.google-analytics.com/g/collect', 'GET', base));
    assert(!allowedRequest('https://apps.apple.com/', 'GET', base));
  }
});

test('the matrix retains all old widths and adds real mobile density cases', () => {
  assert.deepEqual(CASES.filter(c => c.dpr === 1 && c.javascript !== false).map(c => c.width), [320, 390, 412, 768, 1440]);
  assert(CASES.some(c => c.width === 412 && c.dpr === 1.75));
  assert(CASES.some(c => c.width === 390 && c.dpr === 2));
  assert(CASES.some(c => c.width === 390 && c.dpr === 3));
  assert.equal(CASES.filter(c => c.javascript === false).length, 1);
  assert(CASES.some(c => c.width === 412 && c.dpr === 3));
  assert.equal(CASES.length, 10);
});


test('lazy-image scrolling uses runner timers and a bounded height snapshot', async () => {
  const positions = [], waits = [];
  let reads = 0;
  const page = {
    locator() { return { async count() { return 0; } }; },
    async evaluate(fn, position) {
      assert.equal(fn.constructor.name, 'Function', 'No in-page async function can wait on disabled page timers');
      if (position !== undefined) { positions.push(position); return; }
      reads++;
      return reads === 1 ? 2100 : true;
    },
    async waitForTimeout(ms) { waits.push(ms); },
  };
  await loadLazyImages(page);
  assert.deepEqual(positions, [0, 700, 1400]);
  assert.deepEqual(waits, [50, 50, 50]);
  assert.equal(reads, 2);
});

test('contained sections are visited before the single height snapshot', async () => {
  const visited = [], positions = [], waits = [];
  let reads = 0, inventoryReads = 0;
  const page = {
    locator(selector) {
      assert.equal(selector, 'main > section');
      return { async count() { inventoryReads++; return 2; },
        nth(index) { return { async scrollIntoViewIfNeeded(options) {
          assert.equal(options.timeout, 5000); visited.push(index);
        } }; } };
    },
    async evaluate(fn, position) {
      assert.equal(fn.constructor.name, 'Function');
      if (position !== undefined) { positions.push(position); return; }
      assert.deepEqual(visited, [0, 1], 'Do not measure placeholder height first');
      reads++; return reads === 1 ? 2800 : reads >= 3;
    },
    async waitForTimeout(ms) { waits.push(ms); },
  };
  await loadLazyImages(page);
  assert.equal(inventoryReads, 1, 'DOM inventory must be bounded');
  assert.deepEqual(positions, [0, 700, 1400, 2100]);
  assert.deepEqual(waits, [50, 50, 50, 50, 50, 50, 100]);
  assert.equal(reads, 3, 'An unfinished image must be polled, not accepted');
});

test('a genuinely broken image still fails after contained-section traversal', async (t) => {
  let clock = 0, reads = 0;
  t.mock.method(Date, 'now', () => (clock++ === 0 ? 0 : 11000));
  const page = {
    locator() { return { async count() { return 0; } }; },
    async evaluate(fn, position) {
      if (position !== undefined) return;
      reads++; return reads === 1 ? 700 : false;
    },
    async waitForTimeout() {},
  };
  await assert.rejects(loadLazyImages(page), /Visible same-origin images did not load/);
});


test('responsive hero hints share their widths and retain original fallback and decoding', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../..', 'en/index.html'), 'utf8');
  const preload = html.match(/<link rel="preload" as="image"[^>]*imagesrcset="([^"]+)"[^>]*imagesizes="([^"]+)"/);
  const picture = html.match(/<picture class="hero__photograph">([\s\S]*?)<\/picture>/);
  assert(preload && picture, 'Both native image hints must remain');
  const source = picture[1].match(/<source data-home-perf="image"[^>]*srcset="([^"]+)"[^>]*sizes="([^"]+)"/);
  assert(source); assert.equal(source[1], preload[1]); assert.equal(source[2], preload[2]);
  // English keeps its five candidates (R10).
  assert.deepEqual([...source[1].matchAll(/ (\d+)w/g)].map(m => Number(m[1])), [600, 750, 900, 1200, 1536]);
  assert(picture[1].includes('decoding="async"'), 'Rejected decoding change must not ship');
  assert(picture[1].includes('.webp'), 'Original native fallback must survive');
});

test('the Japanese editorial hero shares preload/source hints and keeps generated-photo disclosure', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../..', 'index.html'), 'utf8');
  assert(/<body[^>]*class="[^"]*\bsm-editorial\b/.test(html), 'Explicit reviewed profile');
  const preload = html.match(/<link rel="preload" as="image"[^>]*imagesrcset="([^"]+)"[^>]*imagesizes="([^"]+)"/);
  const picture = html.match(/<picture class="hero__photograph">([\s\S]*?)<\/picture>/);
  assert(preload && picture, 'Native responsive image hints');
  const source = picture[1].match(/<source data-home-perf="image"[^>]*srcset="([^"]+)"[^>]*sizes="([^"]+)"/);
  assert(source); assert.equal(source[1], preload[1]); assert.equal(source[2], preload[2]);
  assert(source[2].includes('820px'), 'Editorial breakpoint is independent of English');
  assert(html.includes('写真はイメージです'), 'Generated portrait must not imply a testimonial');
  assert(picture[1].includes('loading="eager"') && picture[1].includes('fetchpriority="high"'));
});

test('visible-but-covered and clipped downloads fail the same hit-target contract', () => {
  const valid = { visible: true, hit: true, width: 150, height: 55, left: 20, right: 170, viewport: 390 };
  assert.doesNotThrow(() => assertHitTarget(valid, 'download'));
  assert.throws(() => assertHitTarget({ ...valid, hit: false }, 'download'), /intercepts/);
  assert.throws(() => assertHitTarget({ ...valid, visible: false }, 'download'), /visible/);
  assert.throws(() => assertHitTarget({ ...valid, height: 18 }, 'download'), /touch target/);
  assert.throws(() => assertHitTarget({ ...valid, right: 410 }, 'download'), /clipped/);
});

test('portrait coverage detects a face cropped by a shallow or off-center frame', () => {
  assert(portraitCoverage({ width: 600, height: 400, objectFit: 'cover', objectPosition: '50% 50%' }).fits);
  assert(portraitCoverage({ width: 350, height: 234, objectFit: 'cover', objectPosition: '43% 50%' }).fits);
  assert(!portraitCoverage({ width: 600, height: 100, objectFit: 'cover', objectPosition: '50% 50%' }).fits);
  assert(!portraitCoverage({ width: 150, height: 600, objectFit: 'cover', objectPosition: '100% 50%' }).fits);
  assert.throws(() => portraitCoverage({ width: 600, height: 400, objectFit: 'fill', objectPosition: '50% 50%' }), /aspect ratio/);
});


test('text geometry detects content hidden by body clip even when document width fits', () => {
  const previous = Object.fromEntries(['document','NodeFilter','getComputedStyle','innerWidth'].map(key => [key, globalThis[key]]));
  let measured;
  const body = { parentElement: null, scrollWidth: 320, clientWidth: 320, clip: 'clip' };
  const parent = { parentElement: body, scrollWidth: 320, clientWidth: 320, clip: 'visible', closest: () => null };
  const node = { parentElement: parent, textContent: 'Readable copy' };
  const rect = { left: 20, right: 340, width: 320, height: 20 };
  try {
    globalThis.innerWidth = 320;
    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    globalThis.getComputedStyle = element => ({ overflowX: element.clip });
    globalThis.document = {
      documentElement: { scrollWidth: 320, clientWidth: 320 },
      querySelectorAll: () => [{}],
      createTreeWalker: () => { let visited = false; return { nextNode() { if (visited) return null; visited = true; return node; } }; },
      createRange: () => ({ selectNodeContents(value) { measured = value; }, getClientRects: () => [rect] }),
    };
    const geometry = readableTextGeometry();
    assert.equal(measured, node, 'The real text range is inspected, not its containing box');
    assert.throws(() => assertReadableTextGeometry(geometry), /clipped/);
    rect.right = 300; rect.width = 280;
    assert.doesNotThrow(() => assertReadableTextGeometry(readableTextGeometry()));
    assert.throws(() => assertReadableTextGeometry({ viewport: 320, rects: [] }), /actually measured/);
  } finally {
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
