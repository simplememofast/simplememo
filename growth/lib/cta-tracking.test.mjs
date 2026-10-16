import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// The existing SEO CI entry also exercises the offline routing inventory and
// opt-in updater. Both suites use only detached fixtures and temporary files.
import '../../scripts/enable-sitewide-app-routes.test.mjs';
import '../../scripts/site-route-inventory.test.mjs';

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
function browser(links, hostname = 'simplememofast.com', options = {}) {
  const handlers = [], observed = [];
  let notify;
  const context = {
    URL, WeakSet, WeakMap, location: { hostname, href: `https://${hostname}/vs/logseq/`, pathname: '/vs/logseq/' },
    document: { readyState: 'complete', currentScript: { getAttribute: key => key === 'data-sitewide-app-routes' && options.sitewide ? 'true' : null }, querySelectorAll: () => links,
      addEventListener: (type, callback) => { if (type === 'click') handlers.push(callback); } },
    IntersectionObserver: class {
      constructor(callback) { notify = callback; }
      observe(node) { observed.push(node); }
      unobserve() {}
    },
  };
  if (options.noObserver) delete context.IntersectionObserver;
  if (options.noWeakMap) context.WeakMap = undefined;
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

const sitewideUrl = 'https://simplememofast.onelink.me/it5q?pid=owned_web&c=website_bridge_v1';
const sitewideBrowser = (links, options = {}) => browser(links, 'simplememofast.com', { sitewide: true, ...options });

test('sitewide route preserves safe public store parameters and sends one separate fixed-payload event', () => {
  const original = 'https://apps.apple.com/jp/app/id6758438948?pt=128498560&ct=web_obsidian_v1&mt=8&ppid=0253a7f9-3c1a-4294-95bc-e6d800af5733';
  const own = element(original, { 'data-cta-placement': 'footer', 'data-cta-cluster': 'obsidian' });
  const b = sitewideBrowser([own]);
  const href = own.getAttribute('href');
  const route = new URL(href);
  assert.equal(route.origin + route.pathname, 'https://simplememofast.onelink.me/it5q');
  assert.equal(route.searchParams.get('pid'), 'owned_web');
  assert.equal(route.searchParams.get('c'), 'website_bridge_v1');
  assert.equal(route.searchParams.get('af_ios_url'), original);
  assert.equal(route.searchParams.get('af_web_dp'), original);
  assert.equal(route.searchParams.get('af_ios_store_cpp'), '0253a7f9-3c1a-4294-95bc-e6d800af5733');
  assert.equal(own.getAttribute('data-sitewide-app-route-status'), 'converted');
  b.run(); b.show(own, 0.49); b.show(own, 0.5); b.show(own, 1); b.click(own);
  assert.deepEqual(b.events().map(e => e[1]), ['web_to_app_impression', 'web_to_app_click']);
  for (const e of b.events()) {
    assert.equal(e[2].link_url, sitewideUrl);
    assert.equal(e[2].bridge_scope, 'sitewide');
    assert.equal(e[2].link_route, 'onelink');
    assert.equal(e[2].measurement_version, '2026-09-07');
    assert.equal(e[2].placement, 'footer');
    assert.ok(!Object.hasOwn(e[2], 'ct'));
    assert.ok(!JSON.stringify(e).includes('128498560'));
    assert.ok(!JSON.stringify(e).includes('0253a7f9'));
  }
  assert.equal(own.getAttribute('href'), href);
});

test('sitewide opt-in and production host are both required; no observer still routes links', () => {
  const original = 'https://apps.apple.com/app/id6758438948?ct=jp__nav';
  for (const host of ['simplememofast.com', 'localhost', 'preview.simplememo.pages.dev']) {
    const own = element(original);
    const b = browser([own], host, { sitewide: host !== 'simplememofast.com' });
    b.click(own);
    assert.equal(own.getAttribute('href'), original);
    assert.ok(!b.events().some(e => e[1] === 'web_to_app_click'));
  }
  const own = element(original);
  const b = sitewideBrowser([own], { noObserver: true });
  assert.equal(own.getAttribute('data-sitewide-app-route-status'), 'converted');
  b.click(own);
  assert.deepEqual(b.events().map(e => e[1]), ['web_to_app_click']);
});

test('sitewide routing handles dynamic links on click without creating synthetic impressions', () => {
  const b = sitewideBrowser([]);
  const own = element('https://apps.apple.com/us/app/id6758438948?ct=en__mid');
  b.click(own); b.click(own);
  assert.equal(own.getAttribute('data-sitewide-app-route-status'), 'converted');
  assert.deepEqual(b.events().map(e => e[1]), ['web_to_app_click', 'web_to_app_click']);
  assert.equal(b.observed.length, 0);
});

test('sitewide routing never changes the pilot or QA href, attributes or event scope', () => {
  const links = ['l250gib4', '4x0jfkpw'].map((short, index) => element(
    `https://simplememofast.onelink.me/it5q/${short}?public=unchanged#unchanged`,
    { ...bridgeAttrs, 'data-app-traffic': index ? 'qa' : 'pilot' }
  ));
  const original = links.map(a => a.getAttribute('href'));
  const b = sitewideBrowser(links);
  links.forEach((a, index) => {
    b.click(a); b.show(a, 1);
    assert.equal(a.getAttribute('href'), original[index]);
    assert.equal(a.getAttribute('data-sitewide-app-route-status'), null);
  });
  assert.deepEqual(b.events().map(e => e[2].bridge_scope), ['pilot', 'pilot', 'qa', 'qa']);
  const fallback = element('https://apps.apple.com/app/id6758438948?ct=original_fallback', { ...bridgeAttrs });
  const fallbackBrowser = sitewideBrowser([fallback]); fallbackBrowser.click(fallback);
  assert.equal(fallback.getAttribute('href'), 'https://apps.apple.com/app/id6758438948?ct=original_fallback');
  assert.deepEqual(fallbackBrowser.events().map(e => e[1]), ['app_store_click', 'seo_cta_click']);
});

test('unsupported store routes retain navigation and never become sitewide events', () => {
  const invalid = [
    ['https://apps.apple.com/app/id6758438948?email=person@example.test', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?ct=web_other_v1&unknown=secret', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?ct=web_other_v1&ct=other', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?ct=person%40example.test', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?ct=%invalid', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?pt=not_numeric', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?mt=9', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?ppid=secret', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948#token', 'unsupported-fragment'],
    ['https://apps.apple.com.evil.test/app/id6758438948', 'unsupported-url'],
    ['https://user:pass@apps.apple.com/app/id6758438948', 'unsupported-url'],
    ['https://apps.apple.com:443/app/id6758438948', 'unsupported-url'],
    ['https://apps.apple.com:8443/app/id6758438948', 'unsupported-url'],
    ['https://apps.apple.com/app/id67584389480', 'unsupported-url'],
    ['https://apps.apple.com/app/id6758438948/other-app', 'unsupported-url'],
    ['http://apps.apple.com/app/id6758438948', 'unsupported-url'],
  ];
  const links = invalid.map(([href]) => element(href));
  const b = sitewideBrowser(links);
  links.forEach((a, index) => {
    b.click(a);
    assert.equal(a.getAttribute('href'), invalid[index][0]);
    assert.equal(a.getAttribute('data-sitewide-app-route-status'), invalid[index][1]);
  });
  assert.ok(!b.events().some(e => e[1].startsWith('web_to_app')));
});

test('sitewide never forwards document identifiers and refuses mutated or forged long URLs', () => {
  const own = element('https://apps.apple.com/app/id6758438948?ct=web_other_v1');
  const b = sitewideBrowser([own]);
  b.context.location.href += '?email=private@example.test#auth-secret';
  const dynamic = element('https://apps.apple.com/app/id6758438948?ct=web_other_v1');
  b.click(dynamic);
  assert.ok(!dynamic.getAttribute('href').includes('private'));
  assert.ok(!dynamic.getAttribute('href').includes('auth-secret'));
  const forged = element(sitewideUrl + '&af_web_dp=https://evil.example', {
    'data-app-route': 'onelink', 'data-app-traffic': 'sitewide'
  });
  const before = b.events().length;
  own.setAttribute('href', own.getAttribute('href') + '&email=private@example.test');
  b.click(own); b.show(own, 1); b.click(forged);
  assert.equal(b.events().length, before);
  assert.ok(!JSON.stringify(b.events()).includes('private'));
});

test('missing WeakMap disables only sitewide conversion, preserving direct tracking', () => {
  const original = 'https://apps.apple.com/app/id6758438948?ct=jp__nav';
  const own = element(original);
  const b = sitewideBrowser([own], { noWeakMap: true });
  b.click(own); b.show(own, 1);
  assert.equal(own.getAttribute('href'), original);
  assert.deepEqual(b.events().map(e => e[1]), ['app_store_click', 'seo_cta_click', 'seo_cta_impression']);
});

test('grammatically valid unknown identifiers are not forwarded to the sitewide provider', () => {
  const invalid = [
    ['https://apps.apple.com/app/id6758438948?ct=visitor123', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?pt=123456789', 'unsupported-parameters'],
    ['https://apps.apple.com/app/id6758438948?ppid=986fd599-f09b-4624-8310-287e380336b9', 'unsupported-parameters'],
    ['https://apps.apple.com/us/app/visitor123/id6758438948?ct=web_other_v1', 'unsupported-path'],
    ['https://apps.apple.com/us/app/private%40example.test/id6758438948', 'unsupported-path'],
  ];
  const b = sitewideBrowser([]);
  for (const [href, status] of invalid) {
    const own = element(href);
    b.click(own);
    assert.equal(own.getAttribute('href'), href);
    assert.equal(own.getAttribute('data-sitewide-app-route-status'), status);
  }
  assert.ok(!b.events().some(e => e[1].startsWith('web_to_app')));
});

test('all reviewed public campaign, provider and product-page values remain routable', () => {
  const values = {
    ct: ['en__bottom', 'en__mid', 'en__nav', 'jp__bottom', 'jp__mid', 'jp__nav', 'web_obsidian_v1', 'web_other_v1'],
    pt: ['128498560'], mt: ['8'],
    ppid: ['0253a7f9-3c1a-4294-95bc-e6d800af5733', '0dee88d1-7fcb-4ed8-b5cc-2b8ffa05f8ed',
      '1408d7a4-3249-4c87-a079-e13032312579', '3d126d78-2267-4a6c-a860-c69707ab90a5',
      '43019675-348f-489a-914f-065c753a2b1e', '45b35116-b5b3-4b97-9256-0c97289681b6',
      '4b75e642-3dd9-425c-8ff7-9db0cc859eb6', '65666dba-3ce5-43bd-830e-da97de8eaf11'],
  };
  const links = Object.entries(values).flatMap(([key, values]) => values.map(value =>
    element(`https://apps.apple.com/us/app/id6758438948?${key}=${value}`)));
  sitewideBrowser(links);
  assert.ok(links.every(link => link.getAttribute('data-sitewide-app-route-status') === 'converted'));
});

test('the two exact public reference URLs retain nested destinations with fixed event URLs', () => {
  for (const original of [
    'https://apps.apple.com/jp/app/id6758438948?see-all=reviews',
    'https://apps.apple.com/jp/app/id6758438948#information',
  ]) {
    const own = element(original, { 'data-cta-placement': 'reference' });
    const b = sitewideBrowser([own]);
    assert.equal(own.getAttribute('data-sitewide-app-route-status'), 'converted');
    const route = new URL(own.getAttribute('href'));
    assert.equal(route.hash, '');
    assert.equal(route.searchParams.get('af_ios_url'), original);
    assert.equal(route.searchParams.get('af_web_dp'), original);
    assert.equal(route.searchParams.has('af_ios_store_cpp'), false);
    assert.deepEqual([...route.searchParams.keys()], ['pid', 'c', 'af_ios_url', 'af_web_dp']);
    b.show(own, 1); b.click(own);
    assert.deepEqual(b.events().map(e => e[1]), ['web_to_app_impression', 'web_to_app_click']);
    assert.ok(b.events().every(e => e[2].link_url === sitewideUrl
      && e[2].bridge_scope === 'sitewide' && e[2].placement === 'reference'));
    assert.ok(!JSON.stringify(b.events()).includes('see-all'));
    assert.ok(!JSON.stringify(b.events()).includes('#information'));
  }
});

test('reference exceptions reject missing values, arbitrary fragments and undeclared combinations', () => {
  const invalid = [
    'https://apps.apple.com/jp/app/id6758438948?see-all=',
    'https://apps.apple.com/jp/app/id6758438948?see-all=visitor123',
    'https://apps.apple.com/jp/app/id6758438948?see-all=reviews&see-all=reviews',
    'https://apps.apple.com/jp/app/id6758438948?see-all=reviews&email=private@example.test',
    'https://apps.apple.com/jp/app/id6758438948?see-all=reviews&ct=web_other_v1',
    'https://apps.apple.com/jp/app/id6758438948?see-all=reviews#information',
    'https://apps.apple.com/jp/app/id6758438948?ct=web_other_v1#information',
    'https://apps.apple.com/jp/app/id6758438948#information-private',
    'https://apps.apple.com/jp/app/id6758438948#email=private@example.test',
    'https://apps.apple.com/us/app/id6758438948?see-all=reviews',
    'https://apps.apple.com/us/app/id6758438948#information',
  ];
  const links = invalid.map(href => element(href));
  const b = sitewideBrowser(links);
  links.forEach((own, index) => {
    b.click(own);
    assert.equal(own.getAttribute('href'), invalid[index]);
    assert.ok(own.getAttribute('data-sitewide-app-route-status').startsWith('unsupported-'));
  });
  assert.ok(!b.events().some(e => e[1].startsWith('web_to_app')));
});
