const { chromium } = require('/Users/hajimeataka/simplememo/node_modules/playwright');
const OUT = '/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad/work-seo-visual';
const PAGES = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await ctx.route(/google-analytics|googletagmanager|analytics\.ahrefs|cloudflareinsights/, r => r.abort());
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const slug = p.replace(/^\/|\/$/g, '').replace(/\//g, '_');
    const r = await page.goto('https://simplememofast.com' + p, { waitUntil: 'load', timeout: 60000 });
    await sleep(2000);
    const m = await page.evaluate(() => {
      const iw = window.innerWidth;
      const out = { iw, scrollW: document.documentElement.scrollWidth, wrappers: [] };
      for (const ts of document.querySelectorAll('.table-scroll')) {
        const cs = getComputedStyle(ts); const inner = ts.firstElementChild; const ics = inner ? getComputedStyle(inner) : null; const t = ts.querySelector('table');
        out.wrappers.push({ tsScrollable: ts.scrollWidth - ts.clientWidth, tsOverflowX: cs.overflowX, bgAttach: cs.backgroundAttachment, innerTag: inner && inner.tagName + (inner.getAttribute('style') ? '[' + inner.getAttribute('style') + ']' : ''), innerScrollable: inner ? inner.scrollWidth - inner.clientWidth : null, tableW: t ? Math.round(t.getBoundingClientRect().width) : null, top: Math.round(ts.getBoundingClientRect().top + window.scrollY) });
      }
      const over = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > iw + 1 && r.width > 0 && r.height > 0 && getComputedStyle(el).position !== 'fixed'; });
      out.overUnclipped = over.filter(el => { let a = el.parentElement; while (a && a !== document.body) { if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(a).overflowX)) return false; a = a.parentElement; } return true; }).length;
      out.pills=[...document.querySelectorAll(".lang-switcher__btn, .lang-toggle__btn")].map(b=>{const r=b.getBoundingClientRect();const rng=document.createRange();rng.selectNodeContents(b);const tr=rng.getBoundingClientRect();const cs=getComputedStyle(b);return {text:b.textContent.trim().slice(0,10),w:+r.width.toFixed(1),h:+r.height.toFixed(1),labelOffsetY:+((tr.top+tr.height/2)-(r.top+r.height/2)).toFixed(1),labelOffsetX:+((tr.left+tr.width/2)-(r.left+r.width/2)).toFixed(1),display:cs.display,alignItems:cs.alignItems,visible:r.width>0&&r.height>0}});
      return out;
    });
    console.log(p, r.status(), JSON.stringify(m));
    if (m.wrappers.length) { const y = m.wrappers[0].top; await page.evaluate(y => window.scrollTo(0, Math.max(0, y - 120)), y); await sleep(300); await page.screenshot({ path: `${OUT}/${slug}-mobile-table.png`, fullPage: false }); }
    await page.close(); await sleep(1200);
  }
  await b.close();
})();
