const { chromium } = require('/Users/hajimeataka/simplememo/node_modules/playwright');
const fs = require('fs');
const OUT = '/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad/work-seo-visual';
const BASE = 'https://simplememofast.com';
const PAGES = ['/', '/en/', '/autopilot/', '/obsidian/', '/obsidian/plugins/', '/obsidian/getting-started/',
  '/blog/best-memo-apps-2026', '/blog/line-keep-alternative', '/vs/notion/', '/vs/', '/apple-watch/',
  '/captio-alternative/', '/roadmap/', '/download/', '/glossary/e2e-encryption/', '/ko/'];
const VPS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
};
const slug = p => p === '/' ? 'root' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MEASURE = () => {
  const iw = window.innerWidth, ih = window.innerHeight;
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList && el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.'); return s; };
  const pathSel = el => { const parts = []; let e = el; while (e && e !== document.body && parts.length < 4) { parts.unshift(sel(e)); e = e.parentElement; } return parts.join(' > '); };
  const isVisible = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inHiddenLang = el => { const d = el.closest('[data-lang]'); return d ? getComputedStyle(d).display === 'none' : false; };
  const all = [...document.querySelectorAll('body *')];
  const clipAnc = el => { let a = el.parentElement; while (a && a !== document.body) { const cs = getComputedStyle(a); if (['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX)) return sel(a) + ':' + cs.overflowX; a = a.parentElement; } return null; };
  // 1 overflow
  const scrollW = document.documentElement.scrollWidth, bodyScrollW = document.body.scrollWidth;
  const overAll = all.filter(el => { const r = el.getBoundingClientRect(); if (!(r.right > iw + 1 && r.width > 0 && r.height > 0)) return false; const cs = getComputedStyle(el); return cs.position !== 'fixed' && cs.visibility !== 'hidden'; });
  const over = overAll.map(el => { const r = el.getBoundingClientRect(); return { sel: pathSel(el), right: Math.round(r.right), width: Math.round(r.width), clip: clipAnc(el), tag: el.tagName } });
  const overUnclipped = over.filter(o => !o.clip);
  // 2 keep-all / nowrap on JA text (only elements that SET the property, not inherit)
  const cjk = /[　-ヿ㐀-䶿一-鿿＀-￯가-힯]/;
  const nowrapJa = all.filter(el => { const cs = getComputedStyle(el); const p = el.parentElement ? getComputedStyle(el.parentElement) : {}; const sets = (cs.wordBreak === 'keep-all' && p.wordBreak !== 'keep-all') || ((cs.whiteSpace === 'nowrap' || cs.whiteSpace === 'pre') && p.whiteSpace !== cs.whiteSpace); if (!sets) return false; if (!cjk.test(el.textContent)) return false; return isVisible(el); }).map(el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { sel: pathSel(el), wb: cs.wordBreak, ws: cs.whiteSpace, width: Math.round(r.width), right: Math.round(r.right), maxW: cs.maxWidth, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) }; });
  const nowrapJaWide = nowrapJa.filter(x => x.right > iw + 1 || x.width > iw - 2);
  // 3 above fold
  const h1s = [...document.querySelectorAll('h1')].filter(isVisible);
  const h1 = h1s[0]; const h1r = h1 ? h1.getBoundingClientRect() : null;
  const ctaSel = 'a[href*="apps.apple.com"], .app-store-badge, .global-nav__cta, .cta, .btn-primary, a.button, a.btn, .hero a.btn, .nav-cta-mobile a';
  const ctas = [...document.querySelectorAll(ctaSel)].filter(isVisible);
  const ctaAF = ctas.filter(a => { const r = a.getBoundingClientRect(); return r.top < ih && r.bottom > 0; }).map(a => { const r = a.getBoundingClientRect(); return { sel: pathSel(a), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), text: (a.getAttribute('aria-label') || a.textContent).trim().replace(/\s+/g, ' ').slice(0, 30), nav: !!a.closest('nav,.global-nav') }; });
  const imgs = [...document.querySelectorAll('img')];
  const brokenImgs = imgs.filter(i => isVisible(i) && i.complete && i.naturalWidth === 0).map(i => ({ sel: pathSel(i), src: (i.currentSrc || i.src).slice(-60) }));
  const heroImg = imgs.filter(i => isVisible(i) && !i.closest('nav,.global-nav')).find(i => { const r = i.getBoundingClientRect(); return r.top < ih && r.width >= 80; });
  const hero = heroImg ? { sel: pathSel(heroImg), nw: heroImg.naturalWidth, w: Math.round(heroImg.getBoundingClientRect().width), top: Math.round(heroImg.getBoundingClientRect().top), src: (heroImg.currentSrc || heroImg.src).slice(-60) } : null;
  const toggle = document.querySelector('.lang-dropdown__toggle');
  const navInner = document.querySelector('.global-nav__inner');
  const navR = navInner ? navInner.getBoundingClientRect() : null;
  const tr = toggle ? toggle.getBoundingClientRect() : null;
  const lang = toggle ? { visible: isVisible(toggle), w: +tr.width.toFixed(1), h: +tr.height.toFixed(1), top: Math.round(tr.top), right: Math.round(tr.right), vOffsetVsNav: navR ? +((tr.top + tr.height / 2) - (navR.top + navR.height / 2)).toFixed(1) : null } : null;
  const otherLang = [...document.querySelectorAll('.lang-switch, .lang-toggle, [data-lang-toggle], .lang-pill, .lang-switcher')].filter(isVisible).map(e => { const r = e.getBoundingClientRect(); return { sel: pathSel(e), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; });
  const hb = document.querySelector('.global-nav__hamburger');
  const hbr = hb ? hb.getBoundingClientRect() : null;
  const hamburger = hb ? { visible: isVisible(hb), w: Math.round(hbr.width), h: Math.round(hbr.height) } : null;
  const navLinks = [...document.querySelectorAll('.global-nav__links > li')].filter(isVisible);
  const navRows = new Set(navLinks.map(li => Math.round(li.getBoundingClientRect().top))).size;
  // 4 tables
  const tables = [...document.querySelectorAll('table')].filter(t => isVisible(t) && !inHiddenLang(t)).map(t => { const r = t.getBoundingClientRect(); let a = t.parentElement, container = null, cs2 = null, anc = null; while (a && a !== document.body) { const cs = getComputedStyle(a); if (['auto', 'scroll'].includes(cs.overflowX) || a.classList.contains('table-scroll')) { container = sel(a) + ':' + cs.overflowX; anc = a; break; } a = a.parentElement; } return { sel: pathSel(t), width: Math.round(r.width), right: Math.round(r.right), container, containerOverflowPx: anc ? anc.scrollWidth - anc.clientWidth : null, leaks: r.right > iw + 1 && !container }; });
  // 5 fonts
  const bodyFs = parseFloat(getComputedStyle(document.body).fontSize);
  const main = document.querySelector('main, article, .container') || document.body;
  const paras = [...main.querySelectorAll('p, li')].filter(e => isVisible(e) && !inHiddenLang(e) && e.textContent.trim().length > 30 && !e.closest('footer, nav, small, .small, figcaption'));
  const fsList = paras.map(e => parseFloat(getComputedStyle(e).fontSize));
  const minFs = fsList.length ? Math.min(...fsList) : null;
  const under16 = fsList.filter(f => f < 16).length;
  const firstP = paras.find(e => e.tagName === 'P') || paras[0];
  // 6 tap targets
  const ttEls = [...new Set([...document.querySelectorAll('nav a, header a, footer a, nav button, header button, .global-nav a, .global-nav button, a[href*="apps.apple.com"], .lang-dropdown__menu a, .app-store-badge')])].filter(e => isVisible(e) && !inHiddenLang(e));
  const tt = ttEls.map(e => { const r = e.getBoundingClientRect(); return { sel: pathSel(e), w: +r.width.toFixed(1), h: +r.height.toFixed(1), text: (e.getAttribute('aria-label') || e.textContent).trim().replace(/\s+/g, ' ').slice(0, 20) }; });
  const ttSmall = tt.filter(t => t.w < 44 || t.h < 44);
  // 7 contrast
  const parseC = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(',').map(x => parseFloat(x)); return { r: a[0], g: a[1], b: a[2], a: a.length > 3 ? a[3] : 1 }; };
  const effBg = el => { let e = el, acc = null, grad = false; while (e) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') grad = true; const c = parseC(cs.backgroundColor); if (c && c.a > 0) { if (!acc) acc = c; else { acc = { r: acc.r + (c.r - acc.r) * (1 - acc.a), g: acc.g + (c.g - acc.g) * (1 - acc.a), b: acc.b + (c.b - acc.b) * (1 - acc.a), a: acc.a + c.a * (1 - acc.a) }; } if (acc.a >= 0.999) break; } e = e.parentElement; } if (!acc) acc = { r: 255, g: 255, b: 255, a: 1 }; return { c: acc, grad }; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2); };
  const contrastOf = el => { if (!el) return null; const fg = parseC(getComputedStyle(el).color); const bg = effBg(el); return { fg: getComputedStyle(el).color, bg: `rgb(${Math.round(bg.c.r)},${Math.round(bg.c.g)},${Math.round(bg.c.b)})`, ratio: ratio(fg, bg.c), grad: bg.grad, fs: getComputedStyle(el).fontSize, sel: pathSel(el) }; };
  const textCta = ctas.find(a => a.textContent.trim().length > 1 && !a.querySelector('img') && !a.closest('nav,.global-nav'));
  const contrast = { body: contrastOf(firstP), h1: contrastOf(h1), cta: contrastOf(textCta), navCta: contrastOf(document.querySelector('.global-nav__cta')) };
  // 8 theme + misc
  const theme = { htmlBg: getComputedStyle(document.documentElement).backgroundColor, bodyBg: getComputedStyle(document.body).backgroundColor, bodyColor: getComputedStyle(document.body).color, scheme: getComputedStyle(document.documentElement).colorScheme, dataTheme: document.documentElement.getAttribute('data-theme') };
  const mojibake = (document.body.innerText.match(/�/g) || []).length;
  const docH = document.documentElement.scrollHeight;
  const ls = window.__ls || [];
  return { iw, ih, scrollW, bodyScrollW, overCount: over.length, overUnclippedCount: overUnclipped.length, overUnclipped: overUnclipped.slice(0, 3), overClipped: over.filter(o => o.clip).slice(0, 3), nowrapJaCount: nowrapJa.length, nowrapJaWide: nowrapJaWide.slice(0, 5), h1Count: h1s.length, h1: h1 ? { text: h1.textContent.trim().replace(/\s+/g, ' ').slice(0, 60), top: Math.round(h1r.top), bottom: Math.round(h1r.bottom), aboveFold: h1r.top < ih && h1r.bottom > 0, fs: getComputedStyle(h1).fontSize } : null, ctaAF, ctaTotal: ctas.length, hero, brokenImgs, imgCount: imgs.length, lang, otherLang, hamburger, navLi: navLinks.length, navRows, tables, bodyFs, minFs, under16, paraCount: paras.length, ttCount: tt.length, ttSmall: ttSmall.slice(0, 8), ttSmallCount: ttSmall.length, contrast, theme, mojibake, docH, cls: +ls.reduce((s, e) => s + e.v, 0).toFixed(4), clsSources: ls.slice(0, 5) };
};
const BOXES = () => { const ih = window.innerHeight; const vis = el => { if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && r.width > 0 && r.height > 0; }; const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }; const h1 = [...document.querySelectorAll('h1')].find(vis); const img = [...document.querySelectorAll('img')].filter(i => vis(i) && !i.closest('nav,.global-nav')).find(i => { const r = i.getBoundingClientRect(); return r.top < ih && r.width >= 80; }); const cta = [...document.querySelectorAll('a[href*="apps.apple.com"], .app-store-badge, .cta, .btn-primary, a.btn')].filter(vis).find(a => { const r = a.getBoundingClientRect(); return r.top < ih && r.bottom > 0; }); return { h1: box(h1), hero: box(img), cta: box(cta), docH: document.documentElement.scrollHeight }; };

(async () => {
  const browser = await chromium.launch();
  const results = []; let reqTotal = 0; const bad = [];
  for (const vpName of ['desktop', 'mobile']) {
    const ctx = await browser.newContext(VPS[vpName]);
    await ctx.route(/google-analytics|googletagmanager|analytics\.ahrefs|cloudflareinsights|doubleclick/, r => r.abort());
    await ctx.addInitScript(() => { window.__ls = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources || []).map(s => s.node && s.node.tagName ? s.node.tagName + (s.node.id ? '#' + s.node.id : '') + (typeof s.node.className === 'string' && s.node.className ? '.' + s.node.className.split(' ')[0] : '') : '?').slice(0, 3) }); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { } });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', e => errs.push('pageerror:' + String(e).slice(0, 100))); page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 120)); });
      page.on('response', r => { if (r.url().includes('simplememofast.com')) { reqTotal++; if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 100)); } });
      const s = slug(p), url = BASE + p, t0 = Date.now();
      const rec = { page: p, vp: vpName, slug: s };
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        rec.status = resp && resp.status(); rec.loadMs = Date.now() - t0;
        await sleep(500); rec.box500 = await page.evaluate(BOXES);
        await sleep(2500); rec.box3000 = await page.evaluate(BOXES);
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch (e) { rec.networkidle = 'timeout'; }
        await page.evaluate(() => window.scrollTo(0, 0));
        rec.m = await page.evaluate(MEASURE);
        await page.screenshot({ path: `${OUT}/${s}-${vpName}-fold.png`, fullPage: false });
        try { await page.screenshot({ path: `${OUT}/${s}-${vpName}.png`, fullPage: true, scale: 'css' }); } catch (e) { rec.fullShotErr = String(e).slice(0, 120); await page.screenshot({ path: `${OUT}/${s}-${vpName}.png`, clip: { x: 0, y: 0, width: VPS[vpName].viewport.width, height: 8000 }, scale: 'css' }); }
        if (vpName === 'mobile') {
          // hamburger open -> measure nav links
          const hb = page.locator('.global-nav__hamburger').first();
          if (await hb.count() && await hb.isVisible()) {
            await hb.click(); await sleep(400);
            rec.menu = await page.evaluate(() => { const n = document.getElementById('navLinks'); if (!n) return null; const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); const links = [...n.querySelectorAll('a')].filter(a => { const rr = a.getBoundingClientRect(); return rr.width > 0 && rr.height > 0 && getComputedStyle(a).visibility !== 'hidden'; }); return { open: n.classList.contains('open'), display: cs.display, h: Math.round(r.height), w: Math.round(r.width), right: Math.round(r.right), linkCount: links.length, small: links.filter(a => a.getBoundingClientRect().height < 44 || a.getBoundingClientRect().width < 44).map(a => { const rr = a.getBoundingClientRect(); return { text: a.textContent.trim().slice(0, 15), w: Math.round(rr.width), h: +rr.height.toFixed(1) }; }), minH: links.length ? +Math.min(...links.map(a => a.getBoundingClientRect().height)).toFixed(1) : null, scrollW: document.documentElement.scrollWidth, ariaExpanded: (document.querySelector('.global-nav__hamburger') || {}).getAttribute && document.querySelector('.global-nav__hamburger').getAttribute('aria-expanded') }; });
            await page.screenshot({ path: `${OUT}/${s}-mobile-menu.png`, fullPage: false });
            await hb.click(); await sleep(200);
          }
          const ld = page.locator('.lang-dropdown').first();
          if (await ld.count() && await ld.isVisible()) {
            await ld.click(); await sleep(300);
            rec.langMenu = await page.evaluate(() => { const m = document.querySelector('.lang-dropdown__menu'); if (!m) return null; const r = m.getBoundingClientRect(); const links = [...m.querySelectorAll('a')].filter(a => a.getBoundingClientRect().height > 0); const iw = window.innerWidth; return { open: document.querySelector('.lang-dropdown').classList.contains('open'), display: getComputedStyle(m).display, left: Math.round(r.left), right: Math.round(r.right), rightOverflow: +(r.right - iw).toFixed(1), w: Math.round(r.width), h: Math.round(r.height), linkCount: links.length, linkW: links.length ? +Math.min(...links.map(a => a.getBoundingClientRect().width)).toFixed(1) : null, linkH: links.length ? +Math.min(...links.map(a => a.getBoundingClientRect().height)).toFixed(1) : null, scrollW: document.documentElement.scrollWidth }; });
            await page.screenshot({ path: `${OUT}/${s}-mobile-lang.png`, fullPage: false });
          }
        }
        rec.errs = errs.slice(0, 5);
      } catch (e) { rec.error = String(e).slice(0, 300); }
      results.push(rec);
      console.log(`${vpName} ${p} status=${rec.status} over=${rec.m && (rec.m.scrollW - rec.m.iw)} unclipped=${rec.m && rec.m.overUnclippedCount} h1AF=${rec.m && rec.m.h1 && rec.m.h1.aboveFold} ctaAF=${rec.m && rec.m.ctaAF.length} tables=${rec.m && rec.m.tables.length} leaks=${rec.m && rec.m.tables.filter(t => t.leaks).length} ttSmall=${rec.m && rec.m.ttSmallCount} cls=${rec.m && rec.m.cls} ${rec.error || ''}`);
      await page.close();
      await sleep(1200);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ reqTotal, bad, results }, null, 1));
  console.log('DONE reqTotal=' + reqTotal + ' bad=' + bad.length);
})();
