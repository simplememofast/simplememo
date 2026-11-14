'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pageMatches, editorialProfile, knownPlatformScript, deliveryAssetsFor } = require('./verify_production.cjs');
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
test('a page without a hero photograph is not verified by a response that still has one', () => {
  const withPhoto = fixture(nativeVideo);
  const without = withPhoto.replace(/<picture class="hero__photograph">[\s\S]*?<\/picture>/, '<source data-home-perf="image" srcset="/assets/home-perf/banner.avif">');
  assert.equal(pageMatches(without, without), true);
  assert.equal(pageMatches(withPhoto.replace('<source data-home-perf="image" srcset="/assets/home-perf/example.avif">', '<source data-home-perf="image" srcset="/assets/home-perf/banner.avif">'), without), false);
});
test('unrelated platform-injected script does not invalidate unchanged native media', () => {
  const expected = fixture(nativeVideo);
  assert.equal(pageMatches(expected.replace('</html>', '<script defer src="/injected.js"></script></html>'), expected), true);
});

test('editorial profile cannot be selected by script strings, comments or duplicate bodies', () => {
  assert(editorialProfile('<body class="sm-editorial"></body>'));
  assert(!editorialProfile('<!-- <body class="sm-editorial"> --><body></body>'));
  assert(!editorialProfile(`<script>const html = '<body class="sm-editorial">';</script><body></body>`));
  assert(!editorialProfile('<body class="sm-editorial"></body><body></body>'));
});

test('editorial deployment requires the reviewed copy, CSS, metadata and analytics', () => {
  const expected = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  assert(pageMatches(expected, expected));
  for (const altered of [
    expected.replace('sm-editorial', 'legacy-home'),
    expected.replace(/home-editorial\.css\?v=[a-f0-9]+/, 'home-editorial.css?v=0000000000'),
    expected.replace('思いついたら、', 'Previous release'),
    expected.replace('data-sitewide-app-routes="true"', 'data-sitewide-app-routes="false"'),
    expected.replace('<meta name="description"', '<meta name="missing-description"'),
    expected.replace('</head>', '<meta name="robots" content="noindex"></head>'),
    expected.replace('</head>', '<link rel="canonical" href="https://wrong.invalid/"></head>'),
    expected.replace('</head>', '<link rel="stylesheet" href="/assets/old.css"></head>'),
    expected.replace('</head>', '<base href="https://wrong.invalid/"></head>'),
    expected.replace('</head>', '<LINK REL="stylesheet" HREF="/assets/old.css"></head>'),
  ]) assert.equal(pageMatches(altered, expected), false);
  assert(pageMatches(expected.replace('</body>', `<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v123abc" data-cf-beacon='{"token":"public-analytics-id"}'></script></body>`), expected));
});

test('editorial verification rejects hidden roots, language changes, extra CSS and duplicate tracking', () => {
  const expected = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const tracker = expected.match(/<script[^>]*src="\/js\/app-store-tracking\.js[^"]*"[^>]*><\/script>/)[0];
  for (const altered of [
    expected.replace('<body ', '<body hidden '),
    expected.replace('<body ', '<body style="display:none" '),
    expected.replace('<html lang="ja"', '<html lang="en"'),
    expected.replace('</head>', '<style>body{display:none}</style></head>'),
    expected.replace('</body>', tracker + '</body>'),
    expected.replace('</head>', '<script src="/platform.js"></script></head>'),
    expected.replace('</body>', '<div style="position:fixed;inset:0">overlay</div></body>'),
  ]) assert.equal(pageMatches(altered, expected), false);
});

test('only the existing Cloudflare beacon shape is exempted, at most once', () => {
  const expected = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const beacon = '<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v123abc" crossorigin="anonymous"></script>';
  assert(knownPlatformScript(beacon));
  assert(pageMatches(expected.replace('</body>', beacon + '</body>'), expected));
  assert(!pageMatches(expected.replace('</body>', beacon + beacon + '</body>'), expected));
  for (const invalid of [
    beacon.replace('static.cloudflareinsights.com', 'static.cloudflareinsights.com.attacker.invalid'),
    beacon.replace(' defer ', ' onload="run()" defer '),
    beacon.replace('</script>', 'run()</script>'),
    beacon.replace('/beacon.min.js/v123abc', '/other.js'),
    beacon.replace('https:', 'http:'),
  ]) {
    assert(!knownPlatformScript(invalid));
    assert(!pageMatches(expected.replace('</body>', invalid + '</body>'), expected));
  }
});

test('the observed Cloudflare module beacon preserves the same strict boundary', () => {
  const expected = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const beacon = `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/vce701823e78c4301a35b7e07294d87301792088814092" integrity="sha512-test" data-cf-beacon='{"version":"2024.11.0","token":"public-analytics-id","r":1,"spa":2}' crossorigin="anonymous"></script>`;
  assert(knownPlatformScript(beacon));
  assert(pageMatches(expected.replace('</body>', beacon + '</body>'), expected));
  const classic = beacon.replace('type="module"', 'defer');
  assert(!pageMatches(expected.replace('</body>', beacon + beacon + '</body>'), expected));
  assert(!pageMatches(expected.replace('</body>', beacon + classic + '</body>'), expected));
  for (const invalid of [
    beacon.replace('type="module"', ''),
    beacon.replace('type="module"', 'type="text/javascript"'),
    beacon.replace('type="module"', 'defer type="text/javascript"'),
    beacon.replace('type="module"', 'type="module" type="module"'),
    beacon.replace('type="module"', 'type="module" async'),
    beacon.replace('type="module"', 'type="module" onload="run()"'),
    beacon.replace('static.cloudflareinsights.com', 'static.cloudflareinsights.com.attacker.invalid'),
    beacon.replace('/beacon.min.js/', '/other.min.js/'),
    beacon.replace('https:', 'http:'),
    beacon.replace('crossorigin="anonymous"', 'crossorigin="anonymous" nonce="extra"'),
    beacon.replace('vce701823e78c4301a35b7e07294d87301792088814092', 'vce701823e78c4301a35b7e07294d87301792088814092?extra=1'),
    beacon.replace('</script>', 'run()</script>'),
  ]) {
    assert(!knownPlatformScript(invalid));
    assert(!pageMatches(expected.replace('</body>', invalid + '</body>'), expected));
  }
});

test('asset verification fetches the exact versioned stylesheet seen in the response', () => {
  const root = path.resolve(__dirname, '../..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/home-perf/manifest.json'), 'utf8'));
  const assets = deliveryAssetsFor(manifest, html, root);
  const href = html.match(/href="(\/assets\/css\/home-editorial\.css\?v=[a-f0-9]{10})"/)[1];
  assert(assets[href.slice(1)]);
  assert(!assets['assets/css/home-editorial.css'], 'Never verify a different unversioned cache key');
  assert.equal(assets[href.slice(1)].sha256, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'assets/css/home-editorial.css'))).digest('hex'));
  assert.throws(() => deliveryAssetsFor(manifest, html.replace(/home-editorial\.css\?v=[a-f0-9]+/, 'home-editorial.css'), root), /versioned stylesheet/);
  const safety = html.match(/href="(\/assets\/css\/safety-net\.css\?v=[a-f0-9]{10})"/)[1];
  assert(assets[safety.slice(1)], 'Neutral overflow protection is verified at its real cache key');
  assert(!assets['assets/css/safety-net.css']);
  assert.equal(assets[safety.slice(1)].sha256, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'assets/css/safety-net.css'))).digest('hex'));
  assert.throws(() => deliveryAssetsFor(manifest, html.replace(/safety-net\.css\?v=[a-f0-9]+/, 'safety-net.css'), root), /versioned stylesheet/);
});
