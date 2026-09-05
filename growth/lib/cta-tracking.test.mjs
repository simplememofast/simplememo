import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/app-store-tracking.js', import.meta.url), 'utf8');
function element(href, attrs = {}) {
  return {
    getAttribute: key => key === 'href' ? href : attrs[key] ?? null,
    hasAttribute: key => Object.hasOwn(attrs, key),
    closest(selector) {
      return selector.includes('data-next-step') ? (this.hasAttribute('data-next-step') ? this : null)
        : href.includes('apps.apple.com') ? this : null;
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
