#!/usr/bin/env node
/**
 * SEO Validation Script for simplememofast.com
 * Checks: canonical, hreflang, title, description, noindex, structured data,
 * internal links, orphan pages.
 *
 * Usage: node scripts/seo-check.js
 * Exit code 0 = all pass, 1 = warnings found, 2 = errors found
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');
const { getMetaContent, validatePage } = require('./lib/seo-page');
const { createSiteChecks } = require('./lib/seo-site');

const SITE_URL = 'https://simplememofast.com';
const ROOT_DIR = path.resolve(__dirname, '..');

// build/ は dashboard.mjs の生成物（.gitignore 済み）。生成してから検査を回すと
// 存在しないページの構造化データ欠落で落ちるので、走査から外す。
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'build'];
const SKIP_FILES = ['404.html'];

/** The one node every page describing our app must converge on. See check 10. */
const CANONICAL_APP_ID = 'https://simplememofast.com/#app';
/** Read from the constants file so a rename lands in one place, not two. */
const OWN_APP_NAMES = (() => {
  const c = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'data/site-constants.json'), 'utf8'),
  );
  return new Set([c.appNameJa, c.appNameEn, ...c.alternateNames]);
})();

const errors = [];
const warnings = [];

const { checkSitemap, checkRobots, checkUrlHygiene, checkEdgeRules, checkOrphanPages, checkLlmsFreshness } =
  createSiteChecks({ rootDir: ROOT_DIR, siteUrl: SITE_URL, errors, warnings, getAllHtmlFiles, getRelative });

function getAllHtmlFiles(dir) {
  return collectHtmlFiles(dir, { skipDirs: SKIP_DIRS, skipFiles: SKIP_FILES });
}

function getRelative(filePath) {
  return path.relative(ROOT_DIR, filePath);
}

/**
 * Every URL this site publishes, as canonical extension-less paths.
 *
 * Memoised: checkFile() runs per page and the hreflang rule needs to ask
 * "does the other language exist?", which is a question about the whole site,
 * not the file in hand. Walking the tree once and reusing the Set keeps that
 * lookup O(1) instead of re-reading 240 directories per page.
 */
let siteUrlCache = null;
function getSiteUrls() {
  if (!siteUrlCache) {
    siteUrlCache = new Set(
      getAllHtmlFiles(ROOT_DIR).map((f) => toUrlPath(ROOT_DIR, f)),
    );
  }
  return siteUrlCache;
}

function checkFile(filePath) {
  const result = validatePage(fs.readFileSync(filePath, 'utf8'), {
    rel: getRelative(filePath),
    pageUrl: toUrlPath(ROOT_DIR, filePath),
    getSiteUrls,
    ownAppNames: OWN_APP_NAMES,
    canonicalAppId: CANONICAL_APP_ID,
  });
  errors.push(...result.errors);
  warnings.push(...result.warnings);
}

function main() {
  console.log('=== SEO Validation Report ===\n');

  const files = getAllHtmlFiles(ROOT_DIR);
  console.log(`Checking ${files.length} HTML files...\n`);

  for (const file of files) {
    checkFile(file);
  }

  checkSitemap();
  checkRobots();
  checkUrlHygiene();
  checkEdgeRules();
  checkOrphanPages();
  checkLlmsFreshness();

  // Report
  if (errors.length > 0) {
    console.log(`\n❌ ERRORS (${errors.length}):`);
    errors.forEach(e => console.log(`  ${e}`));
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
    warnings.forEach(w => console.log(`  ${w}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n✅ All checks passed!');
  }

  console.log(`\nSummary: ${errors.length} errors, ${warnings.length} warnings`);

  // Exit code
  if (errors.length > 0) process.exit(2);
  if (warnings.length > 0) process.exit(1);
  process.exit(0);
}

/**
 * Prove the gates actually fire.
 *
 * data/check-selftests.json: "落ちることを確かめていない検査は、無いのと同じ".
 * This is the repo's primary SEO gate and it had no self-test, because
 * check-selftests.mjs enumerates `.mjs` checks only and cannot see a `.js`
 * one — see data/autopilot-actions.json#act-ci-selftest-ratchet-js-blind.
 * That is exactly the shape this project keeps finding: a check reporting
 * "no problems" about ground it never looked at.
 *
 * The precedent is concrete. On 2026-08-13 a new page's head landed inside an
 * unclosed <script> and all twelve gates went green, because they read
 * title/description/canonical with regexes that happily match inside script
 * bodies. check-script-tags.mjs now guards that specific hole; this proves the
 * gates themselves still bite.
 *
 * Synthetic pages are written under os.tmpdir(), never inside the repo — a
 * fixture that lands in the working tree gets committed sooner or later, and
 * a deliberately broken page is the last thing that should ship.
 */
function runSelfTest() {
  const os = require('os');
  const failures = [];
  let testCount = 0;
  const t = (name, cond) => { testCount++; if (!cond) failures.push(name); };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-check-selftest-'));
  /** Run checkFile over one synthetic page and return what it reported. */
  const report = (html) => {
    const file = path.join(dir, 'page.html');
    fs.writeFileSync(file, html);
    errors.length = 0;
    warnings.length = 0;
    checkFile(file);
    const got = { errors: [...errors], warnings: [...warnings] };
    errors.length = 0;
    warnings.length = 0;
    return got;
  };
  const head = [
    '<title>t</title>',
    `<meta name="description" content="${'d'.repeat(120)}">`,
    '<link rel="canonical" href="https://simplememofast.com/">',
    '<meta name="viewport" content="width=device-width">',
    '<meta property="og:title" content="Example">',
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="https://simplememofast.com/">',
    '<meta property="og:image" content="https://simplememofast.com/og.png">',
    '<meta name="twitter:card" content="summary_large_image">',
  ].join('');
  const page = (over = {}) => {
    const parts = { html: '<html lang="ja">', head, body: '<body></body>', ...over };
    return `${parts.html}<head>${parts.head}</head>${parts.body}</html>`;
  };
  const has = (r, tag) => [...r.errors, ...r.warnings].some((m) => m.startsWith(tag));

  // A page with nothing wrong must stay quiet — otherwise every assertion
  // below could be passing on noise rather than on the gate under test.
  t('揃ったページは何も言わない', report(page()).errors.length === 0);

  for (const property of ['og:title', 'og:type', 'og:url', 'og:image']) {
    const tag = new RegExp(`<meta property="${property}"[^>]*>`);
    t(`[OG] missing ${property} fails`, has(report(page({ head: head.replace(tag, '') })), '[OG]'));
    t(`[OG] empty ${property} fails`, has(report(page({ head: head.replace(tag, `<meta property="${property}" content=" ">`) })), '[OG]'));
  }
  t('[TWITTER] missing card fails', has(report(page({ head: head.replace(/<meta name="twitter:card"[^>]*>/, '') })), '[TWITTER]'));
  t('[OG] reversed attributes and single quotes work', !has(report(page({ head: head.replace('<meta property="og:image" content="https://simplememofast.com/og.png">', "<meta content='https://simplememofast.com/og.png' property='og:image'>") })), '[OG]'));
  const withNode = (node) => page({ head: head + `<script type="application/ld+json">${JSON.stringify(node)}</script>` });
  t('[SCHEMA] TechArticle properties on BlogPosting fail', has(report(withNode({ '@type': 'BlogPosting', dependencies: 'Xcode' })), '[SCHEMA]'));
  t('[SCHEMA] co-typed technical blog is valid', report(withNode({ '@type': ['BlogPosting', 'TechArticle'], dependencies: 'Xcode', proficiencyLevel: 'Expert' })).errors.length === 0);
  t('[SCHEMA] unrated review fails', has(report(withNode({ '@type': 'Review', reviewBody: 'Helpful' })), '[SCHEMA]'));
  t('[SCHEMA] rated review passes', report(withNode({ '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: 5 } })).errors.length === 0);

  t('[TITLE] title が無ければ落ちる', has(report(page({ head: head.replace('<title>t</title>', '') })), '[TITLE]'));
  t('[TITLE] title が空でも落ちる', has(report(page({ head: head.replace('<title>t</title>', '<title>  </title>') })), '[TITLE]'));
  t('[DESC] description が無ければ落ちる',
    has(report(page({ head: head.replace(/<meta name="description"[^>]*>/, '') })), '[DESC]'));
  t('[CANONICAL] canonical が無ければ落ちる',
    has(report(page({ head: head.replace(/<link rel="canonical"[^>]*>/, '') })), '[CANONICAL]'));
  t('[VIEWPORT] viewport が無ければ落ちる',
    has(report(page({ head: head.replace(/<meta name="viewport"[^>]*>/, '') })), '[VIEWPORT]'));
  t('[SCHEMA] 廃止された HowTo は落ちる',
    has(report(page({ body: '<body><script type="application/ld+json">{"@type":"HowTo"}</script></body>' })), '[SCHEMA]'));
  // 2026-08-11 に実際に出荷された形。英語ページに日本語専用の span が並ぶ。
  t('[LANG] 英語ページの ja span を lang.js 無しで出したら落ちる',
    has(report(page({ html: '<html lang="en">', body: '<body><span data-lang="ja">あ</span></body>' })), '[LANG]'));
  t('[LANG] lang.js があれば言わない',
    !has(report(page({ html: '<html lang="en">', body: '<body><span data-lang="ja">あ</span><script src="/js/lang.js"></script></body>' })), '[LANG]'));
  // noindex は早期 return するので、**壊れていても何も出ないのが正**。
  t('noindex のページは検査しない',
    report(page({ head: '<meta name="robots" content="noindex">' })).errors.length === 0);

  // getMetaContent の2件は、どちらも**実際に起きた誤計測**の再発検査（本体のコメント参照）。
  const apos = getMetaContent(`<meta name="description" content="memos aren't. ${'x'.repeat(130)}">`, 'name', 'description');
  t('description のアポストロフィで値が切れない', apos !== null && apos.length > 100);
  const first = getMetaContent('<meta content="other" name="og:x"><meta content="wanted" name="description">', 'name', 'description');
  t('content を先に書いた meta でも正しい tag から読む', first === 'wanted');

  // Exercise the actual recursive checker using an isolated site, including
  // the noindex-in-child case that the old index-only scan silently skipped.
  const mapDir = path.join(dir, 'site');
  fs.mkdirSync(mapDir);
  const indexXml = (loc) => `<sitemapindex><sitemap><loc>${SITE_URL}/${loc}</loc></sitemap></sitemapindex>`;
  const urlXml = (entries) => `<urlset>${entries.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
  const target = `${SITE_URL}/sample`;
  const validPage = `<link href="${target}" rel="canonical">`;
  const sitemapReport = ({ body = validPage, entries = [target], index = indexXml('child.xml'), child = null } = {}) => {
    fs.writeFileSync(path.join(mapDir, 'sitemap.xml'), index);
    fs.writeFileSync(path.join(mapDir, 'child.xml'), child ?? urlXml(entries));
    fs.writeFileSync(path.join(mapDir, 'sample.html'), body);
    errors.length = 0;
    checkSitemap(mapDir, { quiet: true });
    const result = [...errors];
    errors.length = 0;
    return result;
  };
  const sitemapTests = [
    ['valid child sitemap passes', () => sitemapReport().length === 0],
    ['child noindex fails regardless of meta attribute order', () => sitemapReport({ body: validPage + '<meta content="noindex,follow" name="robots">' }).some((e) => e.includes('Noindex'))],
    ['googlebot none fails', () => sitemapReport({ body: validPage + '<meta name="googlebot" content="none">' }).some((e) => e.includes('Noindex'))],
    ['unrelated description mentioning noindex passes', () => sitemapReport({ body: validPage + '<meta name="description" content="noindex explained">' }).length === 0],
    ['missing page fails', () => sitemapReport({ entries: [`${SITE_URL}/missing`] }).some((e) => e.includes('Missing page'))],
    ['duplicate page fails', () => sitemapReport({ entries: [target, target] }).some((e) => e.includes('Duplicate'))],
    ['canonical mismatch fails', () => sitemapReport({ body: validPage.replace('/sample', '/other') }).some((e) => e.includes('Canonical'))],
    ['missing canonical fails', () => sitemapReport({ body: '<h1>Example</h1>' }).some((e) => e.includes('Canonical'))],
    ['missing child fails', () => sitemapReport({ index: indexXml('missing.xml') }).some((e) => e.includes('Missing sitemap'))],
    ['cycle fails without recursion loop', () => sitemapReport({ child: indexXml('sitemap.xml') }).some((e) => e.includes('cyclic'))],
    ['foreign sitemap fails', () => sitemapReport({ index: indexXml('child.xml').replace(SITE_URL, 'https://example.org') }).some((e) => e.includes('Invalid URL'))],
    ['nested index passes', () => { fs.writeFileSync(path.join(mapDir, 'leaf.xml'), urlXml([target])); return sitemapReport({ child: indexXml('leaf.xml') }).length === 0; }],
    ['homepage resolves to root index.html', () => { fs.writeFileSync(path.join(mapDir, 'index.html'), `<link rel="canonical" href="${SITE_URL}/">`); return sitemapReport({ entries: [`${SITE_URL}/`] }).length === 0; }],
    ['urlset root also passes', () => sitemapReport({ index: urlXml([target]) }).length === 0],
  ];
  for (const [name, check] of sitemapTests) t(`[SITEMAP] ${name}`, check());

  fs.rmSync(dir, { recursive: true, force: true });

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`自己テスト ${testCount} 件中 ${failures.length} 件失敗`);
  process.exit(failures.length ? 1 : 0);
}

if (process.argv.includes('--selftest')) runSelfTest();
main();
