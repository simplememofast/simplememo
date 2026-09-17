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

function fixture(states, { pending = [], ready = true, complete = true } = {}) {
  let clock = 0, read = 0, checks = 0;
  const positions = [], revealed = [], waits = [];
  const page = {
    async evaluate(fn, arg) {
      assert.equal(fn.constructor.name, 'Function', 'No page-side asynchronous timer');
      if (arg !== undefined) { positions.push(arg); return; }
      if (String(fn).includes('scrollHeight')) return typeof states === 'function' ? states(positions.at(-1)) : states[Math.min(read++, states.length - 1)];
      return complete;
    },
    async waitForTimeout(ms) { clock += ms; waits.push(ms); },
    locator() {
      return {
        async evaluateAll() { return pending; },
        nth(index) {
          return {
            async scrollIntoViewIfNeeded() { revealed.push(index); },
            async evaluate(fn) { assert.equal(fn.constructor.name, 'Function'); return typeof ready === 'function' ? ready(checks++) : ready; },
          };
        },
      };
    },
  };
  return { page, positions, revealed, waits, now: () => clock };
}

test('resamples growing page height and reveals pending lazy images', async () => {
  const f = fixture([{ top: 0, height: 2100, viewport: 900 }, { top: 700, height: 3500, viewport: 900 }, { top: 1400, height: 3500, viewport: 900 }, { top: 2100, height: 3500, viewport: 900 }, { top: 2600, height: 3500, viewport: 900 }], { pending: [2], ready: i => i > 0 });
  await loadLazyImages(f.page, { now: f.now });
  assert.deepEqual(f.positions, [0, 700, 1400, 2100, 2600]);
  assert.deepEqual(f.revealed, [2]);
  assert.deepEqual(f.waits, [100, 100, 100, 100, 100]);
});

test('unbounded page growth is rejected rather than silently passing', async () => {
  const f = fixture(top => ({ top, height: top + 3000, viewport: 900 }));
  await assert.rejects(loadLazyImages(f.page, { maxSteps: 3, now: f.now }), /bounded scrolling/);
  assert.equal(f.positions.length, 4);
});

test('an onscreen image that never loads still fails', async () => {
  const f = fixture([{ top: 0, height: 500, viewport: 900 }], { pending: [0], ready: false });
  await assert.rejects(loadLazyImages(f.page, { now: f.now }), /did not load while onscreen/);
  assert.equal(f.now(), 10000);
});

test('bad geometry, final image failure and read errors cannot pass', async () => {
  for (const state of [null, { top: 0, height: NaN, viewport: 900 }, { top: 0, height: 500, viewport: 0 }]) {
    const f = fixture([state]);
    await assert.rejects(loadLazyImages(f.page, { now: f.now }), /Invalid scroll geometry/);
  }
  const f = fixture([{ top: 0, height: 500, viewport: 900 }], { complete: false });
  await assert.rejects(loadLazyImages(f.page, { now: f.now }), /remains incomplete/);
  await assert.rejects(loadLazyImages({ evaluate: async () => { throw Error('read failed'); } }), /read failed/);
});
