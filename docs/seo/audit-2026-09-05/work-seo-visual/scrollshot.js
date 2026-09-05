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
  for (let y = 0; y < H; y += 600) { await page.evaluate(y => window.scrollTo(0, y), y); await sleep(120); }
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(800);
  const pos = await page.evaluate(() => { const q = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width), right: Math.round(r.right) }; }; const cards = [...document.querySelectorAll('.pricing-card')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }); const pc = document.querySelector('.pricing-cards'); return { press: q('.press-band'), pricing: q('.pricing-cards'), cards, pcScroll: pc ? pc.scrollWidth - pc.clientWidth : null, zp: q('.zp__stamp'), docH: document.documentElement.scrollHeight, revealHidden: [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity === '0').length, revealTotal: document.querySelectorAll('.reveal').length }; });
  console.log(JSON.stringify(pos));
  await page.screenshot({ path: `${OUT}/root-mobile-scrolled.png`, fullPage: true, scale: 'css' });
  const { Image } = { Image: null };
  await b.close();
})();
