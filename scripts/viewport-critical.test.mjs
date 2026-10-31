import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { criticalContract, observeCriticalPage, assessCriticalMeasurement, validateCriticalResults } from './lib/viewport-critical.mjs';

const origin = 'http://127.0.0.1:8765';
const requests = ['/', '/en/', '/autopilot/'].flatMap(page => ['blink', 'webkit'].map(engine => ({ page, width: 320, engine })));
function record(request = requests[0]) {
  const contract = criticalContract(request.page);
  return {
    ...request,
    navigation: { status: 200, origin, finalUrl: origin + request.page, redirected: false },
    monitoring: { pageErrors: 'before-navigation', resourceErrors: 'before-navigation', settled: true },
    pageErrors: [], resourceErrors: [],
    observation: {
      schema: 'simplememo-critical-dom-v1', path: request.page, readyState: 'complete',
      viewportWidth: request.width, documentWidth: request.width,
      main: { count: 1, visible: true, nonEmpty: true },
      heading: { count: 1, visible: true, nonEmpty: true },
      links: contract.requiredLinks.map(link => ({ key: link.key, count: 1, usable: 1,
        hrefs: [link.key === 'primary-download' ? 'https://apps.apple.com/jp/app/id6758438948?pt=fixture' : origin + '/en/autopilot/'] })),
      images: contract.requiredImages.map(image => ({ key: image.key, count: 1, loaded: 1 })),
      viewportImages: { count: 1, loaded: 1 },
    },
  };
}

test('all critical pages need complete healthy evidence in both engines', () => {
  assert.equal(validateCriticalResults(requests.map(record), requests).pass, true);
  assert.throws(() => criticalContract('/unknown/'), /unsupported_critical_page/);
});

test('blank 200, missing/duplicate heading, hidden main and transparent CTA fail', () => {
  const mutations = [
    r => { r.observation.main.nonEmpty = false; r.observation.heading.count = 0; },
    r => { r.observation.heading.count = 0; },
    r => { r.observation.heading.count = 2; },
    r => { r.observation.main.visible = false; },
    r => { r.observation.links[0].usable = 0; r.observation.links[0].hrefs = []; },
  ];
  for (const mutate of mutations) { const r = record(); mutate(r); assert.equal(assessCriticalMeasurement(r).pass, false); }
});

test('HTTP error page, redirect, wrong route and wrong origin cannot pass on a clean DOM', () => {
  for (const mutate of [r => { r.navigation.status = 404; }, r => { r.navigation.redirected = true; },
    r => { r.navigation.finalUrl = origin + '/404.html'; }, r => { r.navigation.finalUrl = 'https://foreign.example/'; },
    r => { r.observation.path = '/404.html'; }, r => { delete r.navigation; }]) {
    const r = record(); mutate(r); assert.equal(assessCriticalMeasurement(r).pass, false);
  }
});

test('early JavaScript errors and resource 404 fail; late or absent monitoring is not success', () => {
  for (const mutate of [r => r.pageErrors.push('initial script failure'),
    r => r.resourceErrors.push({ status: 404, path: '/assets/missing.css' }),
    r => { r.monitoring.pageErrors = 'after-load'; }, r => { r.monitoring.resourceErrors = 'after-load'; },
    r => { r.monitoring.settled = false; }, r => { delete r.monitoring; }, r => { delete r.pageErrors; }]) {
    const r = record(); mutate(r); assert.equal(assessCriticalMeasurement(r).pass, false);
  }
});

test('WebKit-only overflow, unavailable engine and missing/duplicate widths fail coverage', () => {
  const good = requests.map(record);
  const overflow = structuredClone(good);
  overflow.find(r => r.engine === 'webkit').observation.documentWidth = 322;
  assert.equal(validateCriticalResults(overflow, requests).pass, false);
  assert.equal(validateCriticalResults(good.filter(r => r.engine !== 'webkit'), requests).pass, false);
  assert.equal(validateCriticalResults([good[0], good[0], ...good.slice(2)], requests).pass, false);
  assert.equal(validateCriticalResults([...good, good[0]], requests).pass, false);
  assert.equal(validateCriticalResults([...good, record({ page: '/', engine: 'blink', width: 390 })], requests).pass, false);
  assert.equal(validateCriticalResults(good, [...requests, requests[0]]).pass, false);
  assert.equal(validateCriticalResults([], []).pass, false);
});

test('nonfinite dimensions and absent or inconsistent image/link observations fail', () => {
  for (const mutate of [r => { r.observation.viewportWidth = 390; },
    r => { r.observation.documentWidth = NaN; }, r => { r.observation.documentWidth = Infinity; },
    r => { r.observation.images = []; }, r => { r.observation.images[0].loaded = 0; },
    r => { r.observation.viewportImages.loaded = 0; }, r => { r.observation.viewportImages.loaded = 2; },
    r => { r.observation.links = []; }, r => { r.observation.links.push(r.observation.links[0]); },
    r => { r.observation.links[0].hrefs[0] = 'https://apps.apple.com.evil.example/jp/app/id6758438948'; },
    r => { r.observation.links[0].hrefs[0] = 'https://apps.apple.com/jp/app/id000'; },
    r => { r.observation.links[0].hrefs[0] = 'javascript:alert(1)'; }]) {
    const r = record(); mutate(r); assert.equal(assessCriticalMeasurement(r).pass, false);
  }
});

// Small DOM doubles exercise the actual serialized in-page function, including
// ancestor styles. This is not a browser integration test or a rendering claim.
function domFixture(page = '/') {
  const element = ({ text = '', attrs = {}, style = {}, parent = null, rect = {}, ...other } = {}) => ({
    innerText: text, textContent: text, parentElement: parent,
    style: { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto', ...style },
    getAttribute: name => attrs[name] ?? null,
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30, ...rect }),
    ...other,
  });
  const main = element({ text: 'Actual page content' });
  const heading = element({ text: 'SimpleMemo', parent: main });
  const link = element({ attrs: { 'aria-label': 'Download' }, parent: main,
    href: page === '/autopilot/' ? origin + '/en/autopilot/' : 'https://apps.apple.com/jp/app/id6758438948' });
  const image = element({ parent: main, complete: true, naturalWidth: 750 });
  const contract = criticalContract(page);
  const nodes = new Map([['main', [main]], ['main h1', [heading]], [contract.requiredLinks[0].selector, [link]]]);
  if (contract.requiredImages.length) nodes.set(contract.requiredImages[0].selector, [image]);
  const document = {
    defaultView: { getComputedStyle: el => el.style, location: { pathname: page } },
    querySelectorAll: selector => nodes.get(selector) ?? [],
    documentElement: { clientWidth: 320, clientHeight: 900, scrollWidth: 320 },
    readyState: 'complete', images: [image],
  };
  const observe = () => JSON.parse(JSON.stringify(vm.runInNewContext(
    `(${observeCriticalPage.toString()})(${JSON.stringify(contract)})`, { document })));
  return { main, heading, link, image, nodes, document, observe };
}

test('serialized observer is independent of module state and supports the fixed markup contracts', () => {
  for (const request of requests) {
    const fixture = domFixture(request.page);
    const r = record(request); r.observation = fixture.observe();
    assert.equal(assessCriticalMeasurement(r).pass, true);
  }
});

test('observer detects invisible ancestors, empty heading, disabled CTA and broken image', () => {
  for (const mutate of [f => { f.main.style.opacity = '0'; },
    f => { f.heading.innerText = f.heading.textContent = '  '; },
    f => { f.link.style.opacity = '0'; }, f => { f.link.style.pointerEvents = 'none'; },
    f => { f.link.hidden = true; }, f => { f.image.naturalWidth = 0; },
    f => { f.nodes.set('main', []); }]) {
    const f = domFixture(); mutate(f); const r = record(); r.observation = f.observe();
    assert.equal(assessCriticalMeasurement(r).pass, false);
  }
});

test('hidden child text and accessible labels cannot fill an empty rendered main or heading', () => {
  for (const name of ['main', 'heading']) {
    const f = domFixture();
    f[name].innerText = '';
    f[name].textContent = 'Text from a display:none child';
    f[name].getAttribute = attr => attr === 'aria-label' ? 'Accessible label only' : null;
    const r = record(); r.observation = f.observe();
    assert.equal(r.observation[name].nonEmpty, false);
    assert.equal(assessCriticalMeasurement(r).pass, false);
  }
});

test('required CTA is rejected when an ancestor disables pointer events', () => {
  const f = domFixture();
  f.main.style.pointerEvents = 'none';
  assert.equal(f.link.style.pointerEvents, 'auto');
  const r = record(); r.observation = f.observe();
  assert.equal(r.observation.links[0].usable, 0);
  assert.equal(assessCriticalMeasurement(r).pass, false);
});

test('offscreen lazy images are not claimed to have been loaded by this probe', () => {
  const f = domFixture('/autopilot/');
  f.image.complete = false;
  f.image.getBoundingClientRect = () => ({ left: 0, top: 1500, right: 100, bottom: 1600, width: 100, height: 100 });
  const o = f.observe();
  assert.deepEqual(o.viewportImages, { count: 0, loaded: 0 });
});
