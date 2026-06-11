#!/usr/bin/env node
/**
 * Single source of truth for drift-prone site values (rating, prices,
 * official names, © line) — data/site-constants.json.
 *
 *   node scripts/sync_constants.js --check   # CI: exit 1 on any drift
 *   node scripts/sync_constants.js --write   # rewrite drifted values in place
 *
 * The site is plain static HTML (no build step), so "constant reference"
 * means: detector regexes find every place OUR values are expressed, compare
 * them to the JSON, and --write propagates the JSON value. Comparison pages
 * quote competitor ratings/prices in the same formats, so every detector is
 * scoped to our own product:
 *   - JSON-LD offers are matched inside our own structured data (always ours)
 *   - visible rating pairs run only on pages whose numbers are all ours
 *   - visible prices run only inside pricing sections / plan cards
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-constants.json'), 'utf8'));

// Free-text rating/price enforcement only runs on pages whose numbers are
// exclusively OURS. Comparison pages (/vs/, listicles) legitimately quote
// competitor ratings/prices in identical formats and cannot be separated
// reliably by context, so they are governed via JSON-LD only.
const OWN_VALUE_PAGES = new Set([
  'index.html', 'en/index.html', 'voices/index.html',
  'ar/index.html', 'es/index.html', 'id/index.html', 'ko/index.html',
  'pt-BR/index.html', 'tr/index.html', 'zh/index.html', 'zh-Hant/index.html',
]);

// [description, regex, canonicalReplacement, needsBrandContext]
const RULES = [
  // JSON-LD: our own offers — always authoritative
  ['JSON-LD monthly offer price',
    /("name":\s?"Premium Monthly"[^}]{0,400}?"price":\s?")(\d+)(")/gs,
    (m, a, v, b) => a + C.priceMonthlyJpy + b, false],
  ['JSON-LD yearly offer price',
    /("name":\s?"Premium Yearly"[^}]{0,400}?"price":\s?")(\d+)(")/gs,
    (m, a, v, b) => a + C.priceYearlyJpy.replace(',', '') + b, false],
  // Visible rating pairs (value + count in one phrase), ours only
  // mid part may cross inline tags (<strong>4.4</strong> … 10件の評価)
  ['rating pair JA 「4.4…10件の評価」',
    /(\d\.\d)((?:[^{}\d]|<[^>]+>|\d(?!件の評価)){0,90}?)(\d+)(件の評価)/g,
    (m, v, mid, n, tail) => C.ratingValue + mid + C.ratingCount + tail, 'own'],
  ['rating pair EN "4.4 … 10 ratings"',
    /(\d\.\d)((?:[^{}\d]|<[^>]+>|\d(?! ratings)){0,90}?)(\d+)( ratings\b)/g,
    (m, v, mid, n, tail) => C.ratingValue + mid + C.ratingCount + tail, 'own'],
  // Visible prices: enforced ONLY inside pricing sections / plan cards —
  // anywhere else on a page ($X vs competitor) prices may be editorial.
  ['JPY monthly (月額N円 / ¥N/月)',
    /(月額|¥)(\d{3})(円|\/月)/g,
    (m, a, v, b) => a + C.priceMonthlyJpy + b, 'pricing'],
  ['JPY yearly (年額N円 / ¥N/年)',
    /(年額|¥)(\d{1,2},?\d{3})(円|\/年)/g,
    (m, a, v, b) => a + C.priceYearlyJpy + b, 'pricing'],
  ['USD monthly $N/mo',
    /(\$)(\d\.\d{2})(\s*\/\s*(?:mo\b|month))/g,
    (m, a, v, b) => a + C.priceMonthlyUsd + b, 'pricing'],
  ['USD yearly $N/yr',
    /(\$)(\d{2}\.\d{2})(\s*\/\s*(?:yr\b|year))/g,
    (m, a, v, b) => a + C.priceYearlyUsd + b, 'pricing'],
  // © line — unified string, unambiguous
  ['© line',
    /((?:©|&copy;)\s?2026[^<\n]{0,200})(?=<\/p>|\n|<\/div>)/g,
    () => C.copyrightLine, false],
];

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
if (!WRITE && !args.has('--check')) {
  console.error('usage: sync_constants.js --check | --write');
  process.exit(2);
}

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

let driftCount = 0;
let filesChanged = 0;
const report = [];

for (const file of htmlFiles(ROOT)) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  const rel = path.relative(ROOT, file);
  // byte ranges of pricing sections / plan cards on this page
  const priceZones = [];
  for (const zm of src.matchAll(/<(?:section|div)[^>]*class="[^"]*(?:pricing|plan-summary)[^"]*"[^>]*>/g)) {
    priceZones.push([zm.index, Math.min(src.length, zm.index + 4000)]);
  }
  const inPriceZone = (i) => priceZones.some(([a, b]) => i >= a && i < b);
  for (const [desc, re, build, scope] of RULES) {
    if (scope === 'own' && !OWN_VALUE_PAGES.has(rel)) continue;
    src = src.replace(re, (...args2) => {
      const m = args2[0];
      const index = args2[args2.length - 2];
      if (scope === 'pricing' && !inPriceZone(index)) return m;
      const canonical = build(...args2);
      if (m === canonical) return m;
      driftCount++;
      report.push(`${WRITE ? 'fix' : 'DRIFT'}: ${rel}: ${desc}: ${JSON.stringify(m.slice(0, 60))} -> ${JSON.stringify(canonical.slice(0, 60))}`);
      return WRITE ? canonical : m;
    });
  }
  // og:site_name must be one of the two official names
  for (const mm of src.matchAll(/og:site_name" content="([^"]+)"/g)) {
    if (mm[1] !== C.appNameJa && mm[1] !== C.appNameEn) {
      driftCount++;
      report.push(`${WRITE ? 'fix' : 'DRIFT'}: ${path.relative(ROOT, file)}: og:site_name: ${JSON.stringify(mm[1])}`);
      if (WRITE) {
        const lang = /<html[^>]*lang="ja"/.test(src) ? C.appNameJa : C.appNameEn;
        src = src.replace(mm[0], `og:site_name" content="${lang}"`);
      }
    }
  }
  if (WRITE && src !== orig) {
    fs.writeFileSync(file, src);
    filesChanged++;
  }
}

report.forEach((l) => console.log(l));
if (WRITE) {
  console.log(`done: ${driftCount} value(s) updated in ${filesChanged} file(s)`);
} else if (driftCount) {
  console.error(`FAIL: ${driftCount} value(s) drift from data/site-constants.json`);
  process.exit(1);
} else {
  console.log('OK: rating/price/©/og:site_name all match data/site-constants.json');
}
