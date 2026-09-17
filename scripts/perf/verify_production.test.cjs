'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pageMatches } = require('./verify_production.cjs');
for (const file of ['index.html', 'en/index.html']) {
  test(`deployment comparison requires the actual optimized styles, sources and parse order: ${file}`, () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    assert.equal(pageMatches(html, html), true);
    assert.equal(pageMatches('<html>not deployed</html>', html), false);
    assert.equal(pageMatches(html.replaceAll('/assets/home-perf/', '/assets/old/'), html), false);
    assert.equal(pageMatches(html.replace('id="hero-title"', 'id="missing-title"'), html), false);
    assert.equal(pageMatches('<picture class="hero__photograph">' + html, html), false);
    assert.equal(pageMatches(html, ''), false);
  });
}

const fixture = video => '<html><style data-home-perf="base">base</style><style data-home-perf="hero">hero</style><h1 id="hero-title">Original</h1><picture class="hero__photograph"><source data-home-perf="image" srcset="/assets/home-perf/example.avif"></picture>' + video + '</html>';
const nativeVideo = '<video controls preload="none" poster="/assets/video/original.jpg"><source src="/assets/video/original.mp4" type="video/mp4">Original fallback</video>';
test('poster-only release and rollback are not mistaken for deployed code', () => {
  const oldPage = fixture(nativeVideo), newPage = fixture(nativeVideo.replace('original.jpg', 'replacement.webp'));
  assert.equal(pageMatches(oldPage, oldPage), true);
  assert.equal(pageMatches(newPage, newPage), true);
  assert.equal(pageMatches(oldPage, newPage), false);
  assert.equal(pageMatches(newPage, oldPage), false);
});
test('native media source, controls and complete inventory must match', () => {
  const expected = fixture(nativeVideo);
  for (const changed of ['', nativeVideo + nativeVideo, nativeVideo.replace('original.mp4', 'other.mp4'), nativeVideo.replace(' controls', ''), nativeVideo.replace('preload="none"', 'preload="auto"')]) {
    assert.equal(pageMatches(fixture(changed), expected), false);
  }
  assert.equal(pageMatches(fixture(nativeVideo), fixture('')), false);
  assert.equal(pageMatches(fixture(''), fixture('')), true);
});
test('unterminated or unmatched native video markup cannot verify a release', () => {
  for (const broken of [nativeVideo.replace('</video>', ''), '</video>', '<video>']) {
    assert.equal(pageMatches(fixture(broken), fixture(broken)), false);
    assert.equal(pageMatches(fixture(broken), fixture(nativeVideo)), false);
  }
});
test('unrelated platform-injected script does not invalidate unchanged native media', () => {
  const expected = fixture(nativeVideo);
  assert.equal(pageMatches(expected.replace('</html>', '<script defer src="/injected.js"></script></html>'), expected), true);
});
