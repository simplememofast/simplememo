'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { CASES, allowedRequest } = require('./browser_checks.cjs');

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
