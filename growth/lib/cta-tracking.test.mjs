import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/app-store-tracking.js', import.meta.url), 'utf8');
function element(href, attrs = {}) {
  return {
    getAttribute: key => key === 'href' ? href : attrs[key] ?? null,
    setAttribute: (key, value) => { if (key === 'href') href = value; else attrs[key] = value; },
    hasAttribute: key => Object.hasOwn(attrs, key),
    closest(selector) {
      return selector.includes('data-next-step') ? (this.hasAttribute('data-next-step') ? this : null)
        : href.includes('apps.apple.com') || (selector.includes('data-app-route') && attrs['data-app-route'] === 'onelink') ? this : null;
    },
  };
}
function browser(links, hostname = 'simplememofast.com') {
  const handlers = [], observed = [];
  let notify;
  const context = {
    URL, WeakSet, location: { hostname, href: `https://${hostname}/vs/logseq/`, pathname: '/vs/logseq/' },
    document: { readyState: 'complete', querySelectorAll: () => links,
      addEventListener: (type, callback) => { if (type === 'click') handlers.push(callback); } },
    IntersectionObserver: class {
      constructor(callback) { notify = callback; }
      observe(node) { observed.push(node); }
      unobserve() {}
    },
  };
  context.window = context;
  vm.createContext(context);
  const run = () => vm.runInContext(source, context);
  run();
  return { context, observed, run,
    click: node => handlers.forEach(fn => fn({ target: node })),
    show: (node, ratio) => notify([{ target: node, isIntersecting: ratio > 0, intersectionRatio: ratio }]),
    events: () => Array.from(context.dataLayer || [], args => Array.from(args)),
  };
}

test('only this app contributes to acquisition events and impressions', () => {
  const own = element('https://apps.apple.com/jp/app/id6758438948?ct=jp%20obsidian');
  const rival = element('https://apps.apple.com/us/app/logseq/id1601013908');
  const fake = element('https://apps.apple.com.evil.example/app/id6758438948');
  const otherId = element('https://apps.apple.com/app/id67584389480');
  const b = browser([own, rival, fake, otherId]);
  assert.deepEqual(b.observed, [own]);
  for (const node of [rival, fake, otherId]) b.click(node);
  assert.equal(b.events().length, 0);
  b.click(own);
  assert.deepEqual(b.events().map(e => e[1]), ['app_store_click', 'seo_cta_click']);
  assert.equal(b.events()[0][2].ct, 'jp obsidian');
  assert.equal(b.events()[0][2].measurement_version, '2026-09-05');
});

test('preview and local QA never enqueue production acquisition events', () => {
  const own = element('https://apps.apple.com/app/id6758438948');
  for (const host of ['127.0.0.1', 'localhost', 'preview.simplememo.pages.dev']) {
    const b = browser([own], host);
    b.click(own);
    assert.equal(b.events().length, 0);
    assert.equal(b.observed.length, 0);
  }
});

test('half-visible threshold and one impression per element are enforced', () => {
  const own = element('https://apps.apple.com/app/id6758438948');
  const next = element('/obsidian/', { 'data-next-step': 'learn' });
  const b = browser([own, next]);
  b.show(own, 0.1);
  assert.equal(b.events().length, 0);
  b.show(own, 0.5); b.show(own, 1); b.show(next, 0.8);
  assert.deepEqual(b.events().map(e => e[1]), ['seo_cta_impression', 'next_step_impression']);
});

test('loading the tracker twice does not double clicks; malformed ct does not suppress navigation metrics', () => {
  const own = element('https://apps.apple.com/app/id6758438948?ct=%invalid');
  const b = browser([own]); b.run(); b.click(own);
  assert.equal(b.events().filter(e => e[1] === 'app_store_click').length, 1);
  assert.equal(b.events()[0][2].ct, '%invalid');
});

const bridgeAttrs = { 'data-app-route': 'onelink', 'data-app-traffic': 'pilot',
  'data-cta-placement': 'hero', 'data-cta-cluster': 'obsidian', 'data-cta-variant': 'pilot' };
const fixtureLink = 'https://simplememofast.onelink.me/it5q/test1234'; // Never fetched.

test('opt-in OneLink gets separate click and visible impression without query, fragment or ct', () => {
  const a = element(fixtureLink + '?email=private@example.test#secret', bridgeAttrs);
  const b = browser([a]); b.run(); b.show(a, 0.49); b.show(a, 0.5); b.show(a, 1); b.click(a);
  assert.deepEqual(b.events().map(e => e[1]), ['web_to_app_impression', 'web_to_app_click']);
  const d = b.events()[1][2];
  assert.equal(d.link_url, fixtureLink); assert.equal(d.link_route, 'onelink');
  assert.equal(d.bridge_scope, 'pilot'); assert.equal(d.measurement_version, '2026-09-07');
  assert.equal(d.placement, 'hero'); assert.ok(!Object.hasOwn(d, 'ct'));
  assert.ok(!JSON.stringify(b.events()).includes('private'));
  assert.equal(a.getAttribute('href'), fixtureLink + '?email=private@example.test#secret');
});

test('OneLink requires explicit route, traffic label and the owned template short URL', () => {
  const invalid = [
    element(fixtureLink), element(fixtureLink, { 'data-app-route': 'onelink' }),
    element(fixtureLink, { ...bridgeAttrs, 'data-app-traffic': 'organic' }),
    ...['http://simplememofast.onelink.me/it5q/test1234',
      'https://simplememofast.onelink.me.evil.test/it5q/test1234',
      'https://user:pass@simplememofast.onelink.me/it5q/test1234',
      'https://simplememofast.onelink.me:8443/it5q/test1234',
      'https://simplememofast.onelink.me/other/test1234',
      'https://simplememofast.onelink.me/it5q?pid=unknown',
      'https://simplememofast.com/verify?token=private'].map(href => element(href, bridgeAttrs)),
  ];
  const b = browser(invalid);
  invalid.forEach(a => b.click(a));
  assert.equal(b.events().length, 0); assert.equal(b.observed.length, 0);
});

test('known QA short link cannot enter pilot metrics even if markup says pilot', () => {
  for (const href of ['https://simplememofast.onelink.me/it5q/4x0jfkpw', fixtureLink]) {
    const a = element(href, { ...bridgeAttrs, 'data-app-traffic': href === fixtureLink ? 'qa' : 'pilot' });
    const b = browser([a]); b.click(a); b.show(a, 1);
    assert.ok(b.events().every(e => e[2].bridge_scope === 'qa'));
  }
});

test('visibility rechecks the actual route after a URL replacement', () => {
  for (const tracked of [true, false]) {
    const a = element('https://apps.apple.com/app/id6758438948?ct=direct');
    const b = browser([a]);
    a.setAttribute('href', fixtureLink);
    if (tracked) { a.setAttribute('data-app-route', 'onelink'); a.setAttribute('data-app-traffic', 'pilot'); }
    b.show(a, 1); b.click(a);
    assert.deepEqual(b.events().map(e => e[1]), tracked ? ['web_to_app_impression', 'web_to_app_click'] : []);
  }
});

test('a direct Apple fallback retains the original events and OneLink is inert on previews', () => {
  const direct = element('https://apps.apple.com/app/id6758438948?ct=fallback', bridgeAttrs);
  const b = browser([direct]); b.click(direct); b.show(direct, 1);
  assert.deepEqual(b.events().map(e => e[1]), ['app_store_click', 'seo_cta_click', 'seo_cta_impression']);
  const link = element(fixtureLink, bridgeAttrs);
  const preview = browser([link], 'preview.simplememo.pages.dev'); preview.click(link);
  assert.equal(preview.events().length, 0); assert.equal(preview.observed.length, 0);
});
