const { chromium } = require('/Users/hajimeataka/simplememo/node_modules/playwright');
const OUT = '/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad/work-seo-visual';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await ctx.route(/google-analytics|googletagmanager|analytics\.ahrefs|cloudflareinsights/, r => r.abort());
  const page = await ctx.newPage();
  await page.goto('https://simplememofast.com/', { waitUntil: 'load', timeout: 60000 });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H + 800; y += 400) { await page.evaluate(y => window.scrollTo(0, y), y); await sleep(250); }
  await sleep(1500);
  const info = await page.evaluate(() => {
    const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.'); return s; };
    const band = [13900, 16300];
    const secs = [...document.querySelectorAll('main > *, body > section, body > div, section')].map(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { sel: sel(e), top: Math.round(r.top + scrollY), h: Math.round(r.height), op: cs.opacity, vis: cs.visibility, cv: cs.contentVisibility, textLen: (e.innerText || '').trim().length }; }).filter(x => x.h > 0 && x.top + x.h > band[0] && x.top < band[1]);
    const hidden = [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity === '0').map(e => { const r = e.getBoundingClientRect(); return { sel: sel(e), top: Math.round(r.top + scrollY), h: Math.round(r.height) }; });
    return { docH: document.documentElement.scrollHeight, secs, hidden };
  });
  console.log(JSON.stringify(info, null, 0));
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(500);
  await page.screenshot({ path: `${OUT}/root-mobile-scrolled2.png`, fullPage: true, scale: 'css' });
  await b.close();
})();
