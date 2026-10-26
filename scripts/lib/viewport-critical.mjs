// DOM observations supplement overflow measurements; they do not replace the
// existing homepage interaction, static SEO, link or full-viewport checks.
export const CRITICAL_PAGES = Object.freeze(['/', '/en/', '/autopilot/']);

export function criticalContract(page) {
  if (!CRITICAL_PAGES.includes(page)) throw new Error('unsupported_critical_page');
  return {
    page,
    requiredLinks: page === '/autopilot/'
      ? [{ key: 'english-report', selector: 'main a[href="/en/autopilot/"]' }]
      : [{ key: 'primary-download', selector: '.hero a[href*="apps.apple.com"]' }],
    requiredImages: page === '/autopilot/' ? []
      : [{ key: 'hero', selector: '.hero__photograph img' }],
  };
}

// Standalone, read-only function suitable for page.evaluate or a same-origin
// WebDriver frame. Pass criticalContract(page) explicitly; there are no module
// captures. The runner must wait for fonts / required images and bounded page
// settlement first. This function neither clicks links nor makes requests.
export function observeCriticalPage(contract) {
  const doc = document;
  const win = doc.defaultView;
  const normalized = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  // Empty rendered text must stay empty: textContent can contain only hidden
  // descendants. Accessible labels name links but do not render main/h1 text.
  const renderedText = el => normalized(typeof el?.innerText === 'string' ? el.innerText : el?.textContent);
  const linkLabel = el => renderedText(el) || normalized(el?.getAttribute('aria-label'))
    || normalized(el?.querySelector('img')?.getAttribute('alt'));
  const visible = el => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    for (let current = el; current; current = current.parentElement) {
      const style = win.getComputedStyle(current);
      if (current.hidden || style.display === 'none' || style.visibility === 'hidden'
        || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  const pointerEnabled = el => {
    for (let current = el; current; current = current.parentElement) {
      if (win.getComputedStyle(current).pointerEvents === 'none') return false;
    }
    return true;
  };
  const elements = selector => [...doc.querySelectorAll(selector)];
  const content = selector => {
    const found = elements(selector);
    return { count: found.length, visible: found.some(visible),
      nonEmpty: found.some(el => visible(el) && renderedText(el).length > 0) };
  };
  const loadedImage = el => visible(el) && el.complete === true && el.naturalWidth > 0;
  const de = doc.documentElement;
  const viewportWidth = de.clientWidth;
  const viewportHeight = de.clientHeight;
  const visibleImages = [...doc.images].filter(el => {
    if (!visible(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;
  });
  return {
    schema: 'simplememo-critical-dom-v1',
    path: win.location.pathname,
    readyState: doc.readyState,
    viewportWidth,
    documentWidth: de.scrollWidth,
    main: content('main'),
    heading: content('main h1'),
    links: contract.requiredLinks.map(requirement => {
      const found = elements(requirement.selector);
      const usable = found.filter(el => visible(el) && linkLabel(el).length > 0
        && el.getAttribute('aria-disabled') !== 'true'
        && pointerEnabled(el));
      return { key: requirement.key, count: found.length, usable: usable.length,
        hrefs: usable.map(el => el.href) };
    }),
    images: contract.requiredImages.map(requirement => {
      const found = elements(requirement.selector);
      return { key: requirement.key, count: found.length, loaded: found.filter(loadedImage).length };
    }),
    viewportImages: { count: visibleImages.length, loaded: visibleImages.filter(loadedImage).length },
  };
}

const integer = value => Number.isSafeInteger(value) && value >= 0;
const dimension = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const engines = new Set(['blink', 'webkit']);
const validRequest = r => r && CRITICAL_PAGES.includes(r.page)
  && Number.isSafeInteger(r.width) && r.width > 0 && engines.has(r.engine);

// The DOM cannot observe HTTP status or exceptions thrown before observation.
// A trusted adapter must start both listeners BEFORE navigation, retain every
// failure, and supply a final same-origin URL and actual navigation response.
// Missing instrumentation is unmeasured, never inferred from an empty array.
export function assessCriticalMeasurement(record) {
  const reasons = [];
  const reject = reason => { if (!reasons.includes(reason)) reasons.push(reason); };
  if (!validRequest(record)) return { pass: false, reasons: ['invalid_request'] };
  const contract = criticalContract(record.page);
  const nav = record.navigation;
  try {
    const origin = new URL(nav?.origin);
    const final = new URL(nav?.finalUrl);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password
      || final.origin !== origin.origin || final.pathname !== record.page
      || final.search || final.hash || nav.status !== 200 || nav.redirected !== false) reject('navigation_failed');
  } catch { reject('navigation_unmeasured'); }
  const monitoring = record.monitoring;
  if (monitoring?.pageErrors !== 'before-navigation' || monitoring?.resourceErrors !== 'before-navigation'
    || monitoring?.settled !== true) reject('monitoring_incomplete');
  if (!Array.isArray(record.pageErrors) || !Array.isArray(record.resourceErrors)) reject('errors_unmeasured');
  else if (record.pageErrors.length || record.resourceErrors.length) reject('page_or_resource_error');
  const o = record.observation;
  if (o?.schema !== 'simplememo-critical-dom-v1' || o.path !== record.page
    || !['interactive', 'complete'].includes(o.readyState)) reject('dom_unmeasured');
  if (!dimension(o?.viewportWidth) || !dimension(o?.documentWidth)
    || o.viewportWidth !== record.width) reject('dimensions_unmeasured');
  else if (o.documentWidth - o.viewportWidth > 1) reject('horizontal_overflow');
  for (const name of ['main', 'heading']) {
    const value = o?.[name];
    if (value?.count !== 1 || value.visible !== true || value.nonEmpty !== true) reject(`${name}_missing_or_hidden`);
  }
  const exactKeys = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
    && new Set(actual.map(x => x?.key)).size === expected.length
    && expected.every(e => actual.some(a => a?.key === e.key));
  if (!exactKeys(o?.links, contract.requiredLinks)) reject('links_unmeasured');
  else for (const link of o.links) {
    if (!integer(link.count) || !integer(link.usable) || link.usable === 0 || link.usable > link.count
      || !Array.isArray(link.hrefs) || link.hrefs.length !== link.usable) { reject('required_link_unusable'); continue; }
    for (const href of link.hrefs) {
      try {
        const target = new URL(href);
        if (target.username || target.password || (link.key === 'primary-download'
          ? target.protocol !== 'https:' || target.hostname !== 'apps.apple.com' || !/\/id6758438948$/.test(target.pathname)
          : target.origin !== new URL(nav?.origin).origin || target.pathname !== '/en/autopilot/'
            || target.search || target.hash)) reject('required_link_target');
      } catch { reject('required_link_target'); }
    }
  }
  if (!exactKeys(o?.images, contract.requiredImages)) reject('images_unmeasured');
  else if (o.images.some(img => img.count !== 1 || img.loaded !== 1)) reject('required_image_unloaded');
  if (!integer(o?.viewportImages?.count) || !integer(o?.viewportImages?.loaded)
    || o.viewportImages.count !== o.viewportImages.loaded) reject('viewport_image_unloaded');
  return { pass: reasons.length === 0, reasons };
}

// Keep engine identity in the coverage key. A Blink result cannot stand in for
// a missing WebKit result, and duplicated rows cannot fill a missing width.
export function validateCriticalResults(records, requests) {
  const key = r => JSON.stringify([r.page, r.width, r.engine]);
  if (!Array.isArray(requests) || requests.length === 0 || !requests.every(validRequest)
    || new Set(requests.map(key)).size !== requests.length) {
    return { pass: false, reasons: ['invalid_expected_matrix'], expected: 0, measured: 0, failures: [] };
  }
  const expected = new Set(requests.map(key));
  if (!Array.isArray(records)) return { pass: false, reasons: ['results_unmeasured'], expected: expected.size, measured: 0, failures: [] };
  const seen = new Set();
  const reasons = [];
  const failures = [];
  for (const record of records) {
    if (!validRequest(record) || !expected.has(key(record))) { reasons.push('unexpected_result'); continue; }
    if (seen.has(key(record))) reasons.push('duplicate_result');
    seen.add(key(record));
    const result = assessCriticalMeasurement(record);
    if (!result.pass) failures.push({ page: record.page, width: record.width, engine: record.engine, reasons: result.reasons });
  }
  if (seen.size !== expected.size) reasons.push('missing_result');
  return { pass: reasons.length === 0 && failures.length === 0, reasons: [...new Set(reasons)],
    expected: expected.size, measured: seen.size, failures };
}
