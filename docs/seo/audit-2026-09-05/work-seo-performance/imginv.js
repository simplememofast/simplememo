const fs = require('fs'), path = require('path');
const ROOT = process.argv[2];
const EXCL = /^(node_modules|docs|growth|fixtures|functions|scripts|data)(\/|$)/;
function walk(d, acc) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const rel = path.relative(ROOT, path.join(d, e.name)); if (EXCL.test(rel)) continue; if (e.isDirectory()) walk(path.join(d, e.name), acc); else if (e.name.endsWith('.html')) acc.push(rel); } return acc; }
const files = walk(ROOT, []).sort();
const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attrs(s) { const o = {}; let m; ATTR.lastIndex = 0; while ((m = ATTR.exec(s))) { o[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''; } return o; }
function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }
function resolve(page, ref) { if (!ref) return null; ref = ref.split('?')[0].split('#')[0]; if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) return null; return ref.startsWith('/') ? path.join(ROOT, ref) : path.join(ROOT, path.dirname(page), ref); }
const R = { files: files.length, imgs: 0, noAlt: [], emptyAlt: 0, noDims: [], lazy: 0, lazyAboveFold: [], eager: 0, fetchHigh: [], pictures: 0, pictureWebp: 0, pictureAvif: 0, srcExt: {}, srcsetImgs: 0, noscriptImgs: 0, hiddenLangImgs: 0, brokenRefs: [], pagesWithImgs: 0, ogBig: [], ogMissingFile: [], preloadImgs: [], heroes: [] };
const fileSizes = {}; // path -> {bytes, pages:Set}
function noteFile(page, ref, ctx) { const abs = resolve(page, ref); if (!abs) return; if (!fs.existsSync(abs)) { R.brokenRefs.push({ page, ref, ctx }); return; } const st = fs.statSync(abs); const key = path.relative(ROOT, abs); fileSizes[key] = fileSizes[key] || { bytes: st.size, pages: new Set() }; fileSizes[key].pages.add(page); }
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // strip comments
  const s = src.replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length));
  const bodyStart = s.search(/<body[\s>]/); const firstSection = s.search(/<(main|section)[\s>]/); const secondSection = (() => { const i = s.indexOf('<section', firstSection + 8); return i < 0 ? s.length : i; })();
  const heroRe = /<(header|section|div)[^>]*class="[^"]*\bhero\b[^"]*"/i; const heroStart = s.search(heroRe);
  // hidden lang ranges (approximate: data-lang="en" div start to matching by depth is hard; mark tags inside via a simple depth scan)
  let hidden = []; { const re = /<div[^>]*data-lang="en"[^>]*>/g; let m; while ((m = re.exec(s))) { let depth = 1, i = re.lastIndex; const tag = /<\/?div\b[^>]*>/g; tag.lastIndex = i; let t; while (depth > 0 && (t = tag.exec(s))) { depth += t[0].startsWith('</') ? -1 : 1; i = tag.lastIndex; } hidden.push([m.index, i]); } }
  const inHidden = (i) => hidden.some(([a, b]) => i >= a && i < b);
  const noscripts = []; { const re = /<noscript[\s>][\s\S]*?<\/noscript>/g; let m; while ((m = re.exec(s))) noscripts.push([m.index, m.index + m[0].length]); }
  const inNoscript = (i) => noscripts.some(([a, b]) => i >= a && i < b);
  let pageHas = false;
  { const re = /<picture[\s>][\s\S]*?<\/picture>/g; let m; while ((m = re.exec(s))) { R.pictures++; if (/<source[^>]*type="image\/webp"/.test(m[0])) R.pictureWebp++; if (/<source[^>]*type="image\/avif"/.test(m[0])) R.pictureAvif++; } }
  { const re = /<source\b([^>]*)>/g; let m; while ((m = re.exec(s))) { const a = attrs(m[1]); if (a.srcset) for (const u of a.srcset.split(',')) noteFile(f, u.trim().split(/\s+/)[0], 'source'); } }
  { const re = /<link\b([^>]*)>/g; let m; while ((m = re.exec(s))) { const a = attrs(m[1]); if (a.rel === 'preload' && a.as === 'image') { R.preloadImgs.push({ page: f, line: lineOf(s, m.index), href: a.href, imagesrcset: a.imagesrcset, fetchpriority: a.fetchpriority, media: a.media }); if (a.href) noteFile(f, a.href, 'preload'); if (a.imagesrcset) for (const u of a.imagesrcset.split(',')) noteFile(f, u.trim().split(/\s+/)[0], 'preload'); } } }
  { const re = /<meta\b([^>]*)>/g; let m; while ((m = re.exec(s))) { const a = attrs(m[1]); if ((a.property === 'og:image' || a.name === 'twitter:image') && a.content) { const ref = a.content.replace(/^https:\/\/simplememofast\.com/, ''); const abs = resolve(f, ref); if (!abs) continue; if (!fs.existsSync(abs)) R.ogMissingFile.push({ page: f, ref }); else { const sz = fs.statSync(abs).size; if (sz > 300 * 1024) R.ogBig.push({ page: f, ref, bytes: sz }); } } } }
  const re = /<img\b([^>]*)>/g; let m;
  while ((m = re.exec(s))) {
    const a = attrs(m[1]); const line = lineOf(s, m.index); R.imgs++; pageHas = true;
    if (inNoscript(m.index)) R.noscriptImgs++;
    if (inHidden(m.index)) R.hiddenLangImgs++;
    if (!('alt' in a)) R.noAlt.push(`${f}:${line} src=${(a.src||'').slice(0,60)}`); else if (a.alt.trim() === '') R.emptyAlt++;
    if (!a.width || !a.height) R.noDims.push(`${f}:${line} src=${(a.src||'').slice(0,60)} w=${a.width||'-'} h=${a.height||'-'}`);
    if (a.loading === 'lazy') { R.lazy++; const aboveFold = (heroStart >= 0 && m.index > heroStart && m.index < heroStart + 6000) || (firstSection >= 0 && m.index > firstSection && m.index < secondSection); if (aboveFold && !inHidden(m.index) && !inNoscript(m.index)) R.lazyAboveFold.push(`${f}:${line} src=${(a.src||'').slice(0,70)}`); } else if (a.loading === 'eager') R.eager++;
    if (a.fetchpriority === 'high') R.fetchHigh.push(`${f}:${line} src=${(a.src||'').slice(0,70)} lazy=${a.loading||'-'}`);
    if (a.srcset) { R.srcsetImgs++; for (const u of a.srcset.split(',')) noteFile(f, u.trim().split(/\s+/)[0], 'srcset'); }
    const ext = ((a.src||'').split('?')[0].split('.').pop() || '').toLowerCase().slice(0, 5); R.srcExt[ext] = (R.srcExt[ext] || 0) + 1;
    noteFile(f, a.src, 'img');
    if (heroStart >= 0 && m.index > heroStart && m.index < heroStart + 6000 && !inHidden(m.index)) R.heroes.push({ page: f, line, src: (a.src||'').slice(0, 80), loading: a.loading || '-', fetchpriority: a.fetchpriority || '-', width: a.width, height: a.height, srcset: !!a.srcset, sizes: a.sizes || '-' });
  }
  if (pageHas) R.pagesWithImgs++;
}
const biggest = Object.entries(fileSizes).map(([k, v]) => ({ file: k, bytes: v.bytes, pages: v.pages.size, sample: [...v.pages].slice(0, 3) })).sort((a, b) => b.bytes - a.bytes);
R.top15 = biggest.slice(0, 15);
R.refFiles = biggest.length; R.refBytesTotal = biggest.reduce((a, b) => a + b.bytes, 0);
R.noAltCount = R.noAlt.length; R.noDimsCount = R.noDims.length;
fs.writeFileSync(process.argv[3], JSON.stringify(R, null, 1));
const { noAlt, noDims, heroes, preloadImgs, ...summary } = R; console.log(JSON.stringify(summary, null, 1));
console.log('noAlt:', noAlt.slice(0, 30).join('\n')); console.log('noDims:', noDims.slice(0, 40).join('\n'));
