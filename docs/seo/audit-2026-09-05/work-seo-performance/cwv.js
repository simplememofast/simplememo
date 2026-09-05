const { chromium } = require('/Users/hajimeataka/simplememo/node_modules/playwright');
const fs = require('fs');
const W = __dirname;
const BASE = 'https://simplememofast.com';
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/en/', '/obsidian/', '/obsidian/plugins/', '/blog/best-memo-apps-2026', '/vs/notion/', '/apple-watch/', '/autopilot/', '/glossary/e2e-encryption/', '/es/'];
const TAG = process.env.TAG || 'run1';
const UA = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const INIT = () => {
  window.__m = { lcp: [], cls: 0, clsEntries: [], longtasks: [], fcp: null };
  const sel = (el) => el ? (el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')) : null;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp.push({ t: e.startTime, renderTime: e.renderTime, loadTime: e.loadTime, size: e.size, url: e.url, id: e.id, tag: e.element ? e.element.tagName : null, text: e.element ? (e.element.textContent || '').slice(0, 80) : null, src: e.element && e.element.currentSrc ? e.element.currentSrc : null, loading: e.element ? e.element.getAttribute('loading') : null, fetchpriority: e.element ? e.element.getAttribute('fetchpriority') : null, nodeSel: sel(e.element) }); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { window.__m.err = String(e); }
  try { let sv = 0, sf = 0, sl = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; if (sv && e.startTime - sl < 1000 && e.startTime - sf < 5000) { sv += e.value; sl = e.startTime; } else { sv = e.value; sf = e.startTime; sl = e.startTime; } if (sv > window.__m.cls) window.__m.cls = sv; window.__m.clsEntries.push({ t: e.startTime, v: e.value, srcs: (e.sources || []).map(s => sel(s.node)) }); } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.longtasks.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const out = [];
  for (const p of PAGES) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA, locale: p.startsWith('/en') ? 'en-US' : (p.startsWith('/es') ? 'es-ES' : 'ja-JP') });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const reqs = {}; const failed = [];
    cdp.on('Network.requestWillBeSent', e => { reqs[e.requestId] = { url: e.request.url, type: e.type, method: e.request.method, initiator: e.initiator && e.initiator.type, priority: e.request.initialPriority, ts: e.timestamp }; });
    cdp.on('Network.responseReceived', e => { const r = reqs[e.requestId]; if (!r) return; r.status = e.response.status; r.mime = e.response.mimeType; r.proto = e.response.protocol; const h = {}; for (const k of Object.keys(e.response.headers)) h[k.toLowerCase()] = e.response.headers[k]; r.cache_control = h['cache-control']; r.cf_cache = h['cf-cache-status']; r.enc = h['content-encoding']; r.ctype = h['content-type']; r.timing = e.response.timing ? { recv: e.response.timing.receiveHeadersEnd, send: e.response.timing.sendEnd } : null; r.fromCache = e.response.fromDiskCache || e.response.fromMemoryCache || false; });
    cdp.on('Network.loadingFinished', e => { const r = reqs[e.requestId]; if (r) { r.bytes = e.encodedDataLength; r.done = e.timestamp; } });
    cdp.on('Network.loadingFailed', e => { const r = reqs[e.requestId]; failed.push({ url: r && r.url, err: e.errorText, blocked: e.blockedReason, canceled: e.canceled }); });
    const consoleMsgs = []; page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300) }); }); page.on('pageerror', e => consoleMsgs.push({ type: 'pageerror', text: String(e).slice(0, 300) }));
    await page.addInitScript(INIT);
    const t0 = Date.now();
    let navStatus = null;
    try {
      const resp = await page.goto(BASE + p, { waitUntil: 'load', timeout: 90000 });
      navStatus = resp && resp.status();
    } catch (e) { out.push({ page: p, error: String(e) }); await context.close(); continue; }
    await sleep(4000);
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const m = window.__m || { lcp: [], cls: 0, clsEntries: [], longtasks: [], fcp: null, missing: true };
      const load = nav ? nav.loadEventEnd : null;
      const tbtEnd = (load || 0) + 2000;
      let tbt = 0; for (const lt of m.longtasks) { if (lt.t >= (m.fcp || 0) && lt.t <= tbtEnd) tbt += Math.max(0, lt.d - 50); }
      const head = document.head;
      const blockingCss = [...head.querySelectorAll('link[rel="stylesheet"]')].filter(l => !l.disabled && !(l.media && l.media !== 'all' && l.media !== 'screen')).map(l => l.href);
      const syncHeadScripts = [...head.querySelectorAll('script[src]')].filter(s => !s.async && !s.defer && s.type !== 'module').map(s => s.src);
      const inlineHeadScripts = [...head.querySelectorAll('script:not([src])')].map(s => (s.textContent||'').length);
      const inlineStyleBytes = [...document.querySelectorAll('style')].reduce((a, s) => a + (s.textContent||'').length, 0);
      const preloads = [...document.querySelectorAll('link[rel="preload"]')].map(l => ({ href: l.getAttribute('href'), imagesrcset: l.getAttribute('imagesrcset'), as: l.getAttribute('as'), type: l.getAttribute('type'), media: l.getAttribute('media'), fetchpriority: l.getAttribute('fetchpriority') }));
      let ffCount = 0; const ffDisplay = {}; const ffSrc = [];
      for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r instanceof CSSFontFaceRule) { ffCount++; const d = r.style.getPropertyValue('font-display') || '(none)'; ffDisplay[d] = (ffDisplay[d]||0)+1; ffSrc.push((r.style.getPropertyValue('src')||'').slice(0,120)); } } } catch (e) {} }
      const lcp = m.lcp[m.lcp.length - 1] || null;
      let lcpPreloaded = null, lcpImgAttrs = null;
      if (lcp && lcp.tag === 'IMG') { const el = document.querySelector('img[src="' + (lcp.src||'').replace(location.origin,'') + '"]') || [...document.images].find(i => i.currentSrc === lcp.src); const srcPath = lcp.src ? new URL(lcp.src).pathname : ''; lcpPreloaded = preloads.some(pl => (pl.href && srcPath.endsWith(pl.href.replace(/^https?:\/\/[^/]+/, ''))) || (pl.imagesrcset && pl.imagesrcset.includes(srcPath.split('/').pop()))); if (el) lcpImgAttrs = { loading: el.getAttribute('loading'), fetchpriority: el.getAttribute('fetchpriority'), decoding: el.getAttribute('decoding'), width: el.getAttribute('width'), height: el.getAttribute('height'), srcset: !!(el.srcset || (el.parentElement && el.parentElement.tagName === 'PICTURE')), inPicture: el.parentElement && el.parentElement.tagName === 'PICTURE', naturalW: el.naturalWidth, naturalH: el.naturalHeight, renderedW: el.getBoundingClientRect().width, renderedH: el.getBoundingClientRect().height }; }
      const imgs = [...document.images].map(i => ({ src: (i.currentSrc||i.src||'').replace(location.origin,''), top: i.getBoundingClientRect().top + scrollY, loading: i.getAttribute('loading'), fp: i.getAttribute('fetchpriority'), w: i.getAttribute('width'), h: i.getAttribute('height'), alt: i.getAttribute('alt') }));
      const lazyAboveFold = imgs.filter(i => i.loading === 'lazy' && i.top < 844 && i.top >= 0);
      return { ttfb: nav ? nav.responseStart - nav.requestStart : null, ttfbAbs: nav ? nav.responseStart : null, domContentLoaded: nav ? nav.domContentLoadedEventEnd : null, load, fcp: m.fcp, lcp, lcpCount: m.lcp.length, lcpPreloaded, lcpImgAttrs, cls: m.cls, clsEntries: m.clsEntries.slice(0, 10), tbt, longtasks: m.longtasks.length, longestTask: Math.max(0, ...m.longtasks.map(l => l.d)), blockingCss, syncHeadScripts, inlineHeadScripts, inlineStyleBytes, preloads, fontFaces: ffCount, fontDisplay: ffDisplay, fontsStatus: document.fonts.size, domNodes: document.getElementsByTagName('*').length, imgCount: imgs.length, lazyAboveFold, docHeight: document.documentElement.scrollHeight, transferSizeDoc: nav ? nav.transferSize : null, encodedBodyDoc: nav ? nav.encodedBodySize : null, decodedBodyDoc: nav ? nav.decodedBodySize : null, htmlLang: document.documentElement.lang, title: document.title };
    });
    const list = Object.values(reqs);
    const totalBytes = list.reduce((a, r) => a + (r.bytes || 0), 0);
    const byType = {}; for (const r of list) { const t = r.type || '?'; byType[t] = byType[t] || { n: 0, bytes: 0 }; byType[t].n++; byType[t].bytes += r.bytes || 0; }
    const thirdParty = list.filter(r => !r.url.startsWith(BASE)).map(r => ({ url: r.url.slice(0, 140), status: r.status, bytes: r.bytes, type: r.type }));
    const fonts = list.filter(r => r.type === 'Font' || /\.woff2?/.test(r.url)).map(r => ({ url: r.url.replace(BASE, ''), status: r.status, bytes: r.bytes, cache: r.cache_control, cf: r.cf_cache, priority: r.priority }));
    const statuses = {}; for (const r of list) statuses[r.status] = (statuses[r.status] || 0) + 1;
    await page.screenshot({ path: `${W}/shot-${TAG}-${p.replace(/[\/]/g, '_') || 'root'}.png`, fullPage: false });
    const rec = { page: p, tag: TAG, navStatus, wall: Date.now() - t0, ...m, requests: list.length, totalBytes, byType, statuses, thirdParty, fonts, failed, console: consoleMsgs, docHeaders: (list.find(r => r.url === BASE + p || r.url === BASE + p + '/') || {}) };
    delete rec.docHeaders.timing;
    out.push(rec);
    fs.writeFileSync(`${W}/cwv-${TAG}-${p.replace(/[\/]/g, '_') || 'root'}.json`, JSON.stringify({ ...rec, allRequests: list.map(r => ({ url: r.url, type: r.type, status: r.status, bytes: r.bytes, cache: r.cache_control, cf: r.cf_cache, enc: r.enc, priority: r.priority })) }, null, 1));
    console.log(`${p}\tstatus=${navStatus}\tTTFB=${Math.round(m.ttfb)}\tFCP=${Math.round(m.fcp)}\tLCP=${m.lcp ? Math.round(m.lcp.t) : 'n/a'} (${m.lcp && m.lcp.nodeSel})\tCLS=${m.cls.toFixed(4)}\tTBT=${Math.round(m.tbt)}\treq=${list.length}\tKB=${(totalBytes/1024).toFixed(1)}\tfailed=${failed.length}\tconsole=${consoleMsgs.length}`);
    await context.close();
    if (navStatus === 429) { console.log('429 — stopping'); break; }
    await sleep(1000);
  }
  fs.writeFileSync(`${W}/cwv-summary-${TAG}.json`, JSON.stringify(out, null, 1));
  await browser.close();
})();
