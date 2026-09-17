'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { CASES, allowedRequest, loadLazyImages } = require('./browser_checks.cjs');

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
  assert.equal(CASES.length, 9);
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
