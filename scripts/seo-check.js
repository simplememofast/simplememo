#!/usr/bin/env node
/**
 * SEO Validation Script for simplememofast.com
 * Checks: canonical, hreflang, title, description, noindex, structured data,
 * internal links, orphan pages and section-hub → child links (per language).
 *
 * Usage: node scripts/seo-check.js
 * Exit code 0 = all pass, 1 = warnings found, 2 = errors found
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');
const { getMetaContent, validatePage } = require('./lib/seo-page');
const { createSiteChecks } = require('./lib/seo-site');
const { readLinkDeferrals, todayTokyo } = require('./lib/link-deferrals');

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

  // [ORPHAN]/[HUB] on an isolated bilingual site. The old orphan check counted
  // any href="…" in any file, so the hreflang <link>s and the language switcher
  // between a page's own translations made every page look linked — it reported
  // 0 orphans on the day GSC listed 53 pages as "Discovered – currently not
  // indexed" (2026-10-14). Each case below is one of the ways a page looked
  // linked without being linked.
  const linkDir = path.join(dir, 'links');
  const LINK_PAGES = {
    'index.html': '<a href="/guide/">Guide</a><a href="/solo">Solo</a><a href="/ja/box/">Box</a>',
    'solo.html': '<a href="/">Top</a>',
    'guide/index.html': `<a href="/">Top</a><a class="card" href='a'>A</a>`,
    'guide/a.html': '<a href="/guide/">Guide</a>',
    'en/index.html': '<a href="/en/guide/">Guide</a><a href="/en/solo">Solo</a><a href="/box/">Box</a>',
    'en/solo.html': '<a href="/en/">Top</a><a hreflang="ja" href="/solo">日本語</a>',
    'en/guide/index.html': '<a href="/en/">Top</a><a href="/en/guide/a">A</a>',
    'en/guide/a.html': '<a href="/en/guide/">Guide</a>',
    // The memo-inbox shape: box/ is the English page and ja/box/ its Japanese
    // translation. Only data/i18n/pages.json knows that; the path says both are ja.
    'box/index.html': '<a href="/en/">Top</a><a href="/ja/box/">日本語</a>',
    'ja/box/index.html': '<a href="/">Top</a><a href="/box/">English</a>',
  };
  const LINK_REGISTRY = {
    version: 1,
    pages: [
      ['index.html', 'en/index.html'], ['solo.html', 'en/solo.html'],
      ['guide/index.html', 'en/guide/index.html'], ['guide/a.html', 'en/guide/a.html'],
      ['ja/box/index.html', 'box/index.html'],
    ].map(([ja, en]) => ({ pages: { ja, en } })),
  };
  // 保留台帳（data/link-gate-deferrals.json）は差し込む —— 実物の台帳も実物の
  // 時計も読まない。空の台帳なら、保留が無かった頃と同じ判定になる。
  const TODAY = '2026-10-14';
  const NO_DEFERRALS = { ledger: { deferrals: [] }, experiments: [], today: TODAY };
  /**
   * 合成サイトを書いて checkOrphanPages を1回走らせる。`deferrals` は差し込む形か、
   * 書いたサイトを受け取る関数（ディスクから読む経路を試すとき）。`raw` は HTML 以外のファイル。
   */
  const linkRun = (over = {}, {
    sitemap = true, base = LINK_PAGES, registry = LINK_REGISTRY, deferrals = NO_DEFERRALS, raw = {},
  } = {}) => {
    fs.rmSync(linkDir, { recursive: true, force: true });
    const files = { ...base, ...over };
    for (const [file, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(linkDir, file)), { recursive: true });
      fs.writeFileSync(path.join(linkDir, file), `<html><body>${body}</body></html>`);
    }
    for (const [file, text] of Object.entries(raw)) {
      fs.mkdirSync(path.dirname(path.join(linkDir, file)), { recursive: true });
      fs.writeFileSync(path.join(linkDir, file), text);
    }
    fs.mkdirSync(path.join(linkDir, 'data/i18n'), { recursive: true });
    fs.writeFileSync(path.join(linkDir, 'data/i18n/pages.json'), JSON.stringify(registry));
    if (sitemap) {
      const locs = Object.keys(files).map((f) => `${SITE_URL}/${f.replace(/index\.html$/, '').replace(/\.html$/, '')}`);
      fs.writeFileSync(path.join(linkDir, 'sitemap.xml'), indexXml('pages.xml'));
      fs.writeFileSync(path.join(linkDir, 'pages.xml'), urlXml(locs));
    }
    errors.length = 0;
    warnings.length = 0;
    checkOrphanPages(linkDir, { quiet: true, deferrals: typeof deferrals === 'function' ? deferrals(linkDir) : deferrals });
    const result = { errors: [...errors], warnings: [...warnings] };
    errors.length = 0;
    warnings.length = 0;
    return result;
  };
  const linkReport = (over, opts) => linkRun(over, opts).errors;
  const orphan = (r, url) => r.some((e) => e.startsWith('[ORPHAN]') && e.endsWith(`: ${url}`));
  const hub = (r, parent, child) => r.some((e) => e.startsWith('[HUB]') && e.endsWith(`: ${parent} → ${child}`));
  const noSolo = '<a href="/guide/">Guide</a><a href="/ja/box/">Box</a>';
  const linkTests = [
    // 揃ったサイトが黙らなければ、下の「落ちる」はノイズで通っているかもしれない。
    ['揃ったサイトは何も言わない', () => linkReport().length === 0],
    ['hreflang の <link> だけで繋がったページは孤立',
      () => orphan(linkReport({ 'index.html': noSolo + '<link rel="alternate" hreflang="ja" href="/solo">' }), '/solo')],
    ['翻訳の言語切替リンク（/en/solo → /solo）だけでは孤立',
      () => orphan(linkReport({ 'index.html': noSolo }), '/solo')],
    ['翻訳ではない別言語のページ（/en/ → /solo）からのリンクも数えない',
      () => orphan(linkReport({ 'index.html': noSolo, 'en/index.html': LINK_PAGES['en/index.html'] + '<a href="/solo">Solo</a>' }), '/solo')],
    ['言語は台帳で決まる（box/ は英語。日本語のトップからのリンクは数えない）',
      () => orphan(linkReport({
        'index.html': LINK_PAGES['index.html'] + '<a href="/box/">Box</a>',
        'en/index.html': '<a href="/en/guide/">Guide</a><a href="/en/solo">Solo</a>',
      }), '/box/')],
    ['HTML コメントの中の <a> は数えない',
      () => orphan(linkReport({ 'index.html': noSolo + '<!-- <a href="/solo">Solo</a> -->' }), '/solo')],
    ['<script> と <template> の中の <a> は数えない',
      () => orphan(linkReport({ 'index.html': noSolo + `<script>s = '<a href="/solo">';</script><template><a href="/solo">Solo</a></template>` }), '/solo')],
    ['自分自身へのリンクは数えない',
      () => orphan(linkReport({ 'index.html': noSolo, 'solo.html': '<a href="/">Top</a><a href="/solo">Solo</a>' }), '/solo')],
    ['同じ言語のリンクなら通る（.html / index.html の形でも同じページ）',
      () => linkReport({ 'index.html': '<a href="/guide/index.html">Guide</a><a href="solo.html">Solo</a><a href="/ja/box/">Box</a>' }).length === 0],
    ['親ハブが子を載せていなければ落ちる（ほかのページから繋がっていても）', () => {
      const r = linkReport({ 'guide/index.html': '<a href="/">Top</a>', 'solo.html': '<a href="/">Top</a><a href="/guide/a">A</a>' });
      return hub(r, '/guide/', '/guide/a') && !orphan(r, '/guide/a');
    }],
    ['英語の親ハブも同じ（/en/guide/ → /en/guide/a）',
      () => hub(linkReport({ 'en/guide/index.html': '<a href="/en/">Top</a>', 'en/solo.html': '<a href="/en/">Top</a><a href="/en/guide/a">A</a>' }), '/en/guide/', '/en/guide/a')],
    ['言語ルートは親ハブ扱いしない（/ が /solo を、/en/ が /en/solo を載せなくてよい）',
      () => linkReport({
        'index.html': noSolo,
        'guide/index.html': `<a href="/">Top</a><a class="card" href='a'>A</a><a href="/solo">Solo</a>`,
        'en/index.html': '<a href="/en/guide/">Guide</a><a href="/box/">Box</a>',
        'en/guide/index.html': '<a href="/en/">Top</a><a href="/en/guide/a">A</a><a href="/en/solo">Solo</a>',
      }).length === 0],
    ['sitemap が読めなければ落ちる（0件は「孤立なし」ではない）',
      () => linkReport({}, { sitemap: false }).some((e) => e.startsWith('[ORPHAN]') && e.includes('cannot run'))],
  ];
  for (const [name, check] of linkTests) t(`[ORPHAN/HUB] ${name}`, check());

  // 保留（data/link-gate-deferrals.json / lib/link-deferrals.js）。
  //
  // 2026-10-14 の実データの形を3言語に縮めた合成サイト: 日本語が元のハブ /hub/
  // （英語は手で書き、韓国語は日本語から生成 —— /obsidian/ の形）と、英語が元で
  // 日本語・韓国語が生成の held（#2031 の統合保留ページの形）。**外れてよいのは
  // 生成された側だけ**で、手で書く英語ページは保留の外に残ることを毎回見る。
  const LANG_DIRS = ['', 'en/', 'ko/'];
  const DEFER_PAGES = Object.fromEntries(LANG_DIRS.flatMap((d) => [
    [`${d}index.html`, `<a href="/${d}hub/">Hub</a>`],
    [`${d}hub/index.html`, `<a href="/${d}">Top</a><a href="kid">Kid</a><a href="held">Held</a>`],
    [`${d}hub/kid.html`, `<a href="/${d}hub/">Hub</a>`],
    [`${d}hub/held.html`, `<a href="/${d}hub/">Hub</a>`],
  ]));
  const DEFER_REGISTRY = {
    version: 1,
    pages: [
      ...['index.html', 'hub/index.html', 'hub/kid.html'].map((ja) => ({
        source: ja, sourceLocale: 'ja', existing: { ja, en: `en/${ja}` },
        pages: { ja, en: `en/${ja}`, ko: `ko/${ja}` },
      })),
      { source: 'en/hub/held.html', sourceLocale: 'en', existing: { en: 'en/hub/held.html' },
        pages: { ja: 'hub/held.html', en: 'en/hub/held.html', ko: 'ko/hub/held.html' } },
    ],
  };
  /** ハブが kid を載せない（kid はトップから繋がっているので孤立はしない）。言語を選べる。 */
  const noKid = (dirs = LANG_DIRS) => Object.fromEntries(dirs.flatMap((d) => [
    [`${d}index.html`, `<a href="/${d}hub/">Hub</a><a href="/${d}hub/kid">Kid</a>`],
    [`${d}hub/index.html`, `<a href="/${d}">Top</a><a href="held">Held</a>`],
  ]));
  /** ハブが held を載せず、ほかの同じ言語のページも載せない（[HUB] と [ORPHAN] の両方）。 */
  const noHeld = (dirs = LANG_DIRS) => Object.fromEntries(dirs.map((d) =>
    [`${d}hub/index.html`, `<a href="/${d}">Top</a><a href="kid">Kid</a>`]));
  const EXPERIMENTS = [
    { id: 'exp-open', status: 'running' }, { id: 'exp-frozen', status: 'frozen' },
    { id: 'exp-done', status: 'evaluated' }, { id: 'exp-cancelled', status: 'cancelled' },
  ];
  const hubHold = {
    id: 'hub-hold', kind: 'hub', page: '/hub/', rules: ['HUB'], experiments: ['exp-open'],
    until: '2026-11-08', reason: '凍結中の検体', added: TODAY,
  };
  const pageHold = {
    id: 'held-hold', kind: 'page', page: '/hub/held', rules: ['HUB', 'ORPHAN'], experiments: [],
    until: '2026-11-08', reason: '統合待ちの検体', added: TODAY,
  };
  const holds = (...deferrals) => ({ ledger: { deferrals }, experiments: EXPERIMENTS, today: TODAY });
  const deferRun = (over, deferrals, opts = {}) =>
    linkRun(over, { base: DEFER_PAGES, registry: DEFER_REGISTRY, deferrals, ...opts });
  /** 警告に、その指摘が保留の id・期限・理由つきで出ているか。 */
  const deferredAs = (r, tail, d) => r.warnings.some((w) => w.startsWith('[DEFERRED] ')
    && w.includes(`${tail} — deferral ${d.id} until ${d.until}: ${d.reason}`));
  const deferral = (r, needle) => r.errors.some((e) => e.startsWith('[DEFERRAL] ') && e.includes(needle));
  const allHubErrors = (r) => LANG_DIRS.every((d) => hub(r.errors, `/${d}hub/`, `/${d}hub/kid`));
  const deferralTests = [
    // 下の「外れる」「外れない」の前提。揃っていれば何も言わず、壊せば3言語とも error。
    ['合成サイトは揃っていれば何も言わない', () => {
      const r = deferRun({}, holds());
      return r.errors.length === 0 && r.warnings.length === 0;
    }],
    ['保留が無ければ、ハブの漏れは3言語とも error', () => {
      const r = deferRun(noKid(), holds());
      return r.errors.length === 3 && allHubErrors(r);
    }],
    ['**ハブの保留は日本語のハブと生成された翻訳（ko）だけを警告へ下ろし、手で書く英語のハブは落とす**', () => {
      const r = deferRun(noKid(), holds(hubHold));
      return r.errors.length === 1 && hub(r.errors, '/en/hub/', '/en/hub/kid')
        && r.warnings.length === 2
        && deferredAs(r, ': /hub/ → /hub/kid', hubHold) && deferredAs(r, ': /ko/hub/ → /ko/hub/kid', hubHold);
    }],
    ['**ページの保留は [HUB] の子と [ORPHAN] を警告へ下ろす（生成された日本語・韓国語）。翻訳元の英語は落とす**', () => {
      const r = deferRun(noHeld(), holds(pageHold));
      return r.errors.length === 2
        && hub(r.errors, '/en/hub/', '/en/hub/held') && orphan(r.errors, '/en/hub/held')
        && r.warnings.length === 4
        && deferredAs(r, ': /hub/ → /hub/held', pageHold) && deferredAs(r, ': /hub/held', pageHold)
        && deferredAs(r, ': /ko/hub/ → /ko/hub/held', pageHold) && deferredAs(r, ': /ko/hub/held', pageHold);
    }],
    ['**期限を過ぎた保留は何も外さず、[DEFERRAL] has lapsed を1件だけ足す**', () => {
      const r = deferRun(noKid(), holds({ ...hubHold, added: '2026-10-01', until: '2026-10-13' }));
      const lapsed = r.errors.filter((e) => e.startsWith('[DEFERRAL] hub-hold has lapsed (until 2026-10-13 has passed'));
      return allHubErrors(r) && lapsed.length === 1 && r.errors.length === 4 && r.warnings.length === 0;
    }],
    ['期限の当日はまだ効いている（Asia/Tokyo の暦日・当日を含む）', () => {
      const r = deferRun(noKid(), holds({ ...hubHold, until: TODAY }));
      return r.errors.length === 1 && r.warnings.length === 2;
    }],
    ['todayTokyo は UTC 15:00 で日付が変わる（CI のランナーは UTC）', () =>
      todayTokyo(new Date('2026-11-08T14:59:59Z')) === '2026-11-08'
        && todayTokyo(new Date('2026-11-08T15:00:00Z')) === '2026-11-09'],
    ['**名指しした実験がすべて閉じたら、期限前でも失効**', () => {
      const r = deferRun(noKid(), holds({ ...hubHold, experiments: ['exp-done', 'exp-cancelled'] }));
      return allHubErrors(r) && deferral(r, 'hub-hold has lapsed (every experiment it waits on is closed: exp-done=evaluated, exp-cancelled=cancelled)')
        && r.warnings.length === 0;
    }],
    ['実験が1つでも開いていれば効く（running も frozen も開いている）', () =>
      ['exp-open', 'exp-frozen'].every((open) => {
        const r = deferRun(noKid(), holds({ ...hubHold, experiments: ['exp-done', open] }));
        return r.errors.length === 1 && r.warnings.length === 2;
      })],
    ['**1件も当たらない保留は落ちる**（リンクを足したら台帳から消す）', () => {
      const r = deferRun({}, holds(hubHold));
      return r.errors.length === 1 && deferral(r, 'hub-hold rule HUB matches nothing — remove it');
    }],
    ['規則ごとに見る（[HUB] しか出ていない held の保留は、ORPHAN が未使用で落ちる）', () => {
      // 日本語のハブだけが held を載せず、日本語のトップは載せている → [HUB] だけが出る
      const r = deferRun({ ...noHeld(['']), 'index.html': '<a href="/hub/">Hub</a><a href="/hub/held">Held</a>' },
        holds(pageHold));
      return r.errors.length === 1 && deferral(r, 'held-hold rule ORPHAN matches nothing — remove it')
        && r.warnings.length === 1 && deferredAs(r, ': /hub/ → /hub/held', pageHold);
    }],
    ['content-graph の規則（CHILD）だけの保留は、seo-check では当たり外れを数えない', () => {
      const r = deferRun({}, holds({ ...hubHold, rules: ['CHILD'] }));
      return r.errors.length === 0 && r.warnings.length === 0;
    }],
    ['**知らない実験を名指しした台帳は何も外さない**', () => {
      const r = deferRun(noKid(), holds({ ...hubHold, experiments: ['exp-typo'] }));
      return allHubErrors(r) && deferral(r, 'unknown experiment "exp-typo"') && r.warnings.length === 0;
    }],
    ...[
      ['キーの綴り違い（deferals）', { ledger: { deferals: [hubHold] }, experiments: EXPERIMENTS, today: TODAY }],
      ['台帳が null', { ledger: null, experiments: EXPERIMENTS, today: TODAY }],
      ['実験台帳が読めない', { ledger: { deferrals: [hubHold] }, experiments: undefined, today: TODAY }],
      ['暦に無い until', holds({ ...hubHold, until: '2026-11-31' })],
      ['知らない kind', holds({ ...hubHold, kind: 'hubs' })],
      ['知らない rule', holds({ ...hubHold, rules: ['HUBS'] })],
      ['kind に意味の無い rule（hub の ORPHAN）', holds({ ...hubHold, rules: ['HUB', 'ORPHAN'] })],
      ['id の重複', holds(hubHold, { ...pageHold, id: 'hub-hold' })],
      ['理由が空', holds({ ...hubHold, reason: ' ' })],
      ['知らないキー（untill）', holds({ ...hubHold, untill: '2026-11-08' })],
      ['experiments が無い', holds({ ...hubHold, experiments: undefined })],
      ['today が日付でない', { ...holds(hubHold), today: '2026-10-14T00:00' }],
    ].map(([what, input]) => [`**壊れた台帳は何も外さない** — ${what}`, () => {
      const r = deferRun(noKid(), input);
      return allHubErrors(r) && r.errors.some((e) => e.startsWith('[DEFERRAL] ')) && r.warnings.length === 0;
    }]),
    ['**台帳ファイルが無ければ落ちる**（コミットしてある台帳が無いのは「保留なし」ではない）', () => {
      const r = deferRun(noKid(), (site) => readLinkDeferrals(site, { today: TODAY }),
        { raw: { 'growth/experiments/experiments.json': JSON.stringify({ experiments: EXPERIMENTS }) } });
      return allHubErrors(r) && deferral(r, 'data/link-gate-deferrals.json is unreadable') && r.warnings.length === 0;
    }],
    ['ディスクの台帳も差し込みと同じに読む', () => {
      const r = deferRun(noKid(), (site) => readLinkDeferrals(site, { today: TODAY }), {
        raw: {
          'growth/experiments/experiments.json': JSON.stringify({ experiments: EXPERIMENTS }),
          'data/link-gate-deferrals.json': JSON.stringify({ deferrals: [hubHold] }),
        },
      });
      return r.errors.length === 1 && r.warnings.length === 2;
    }],
  ];
  for (const [name, check] of deferralTests) t(`[DEFERRAL] ${name}`, check());

  fs.rmSync(dir, { recursive: true, force: true });

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`自己テスト ${testCount} 件中 ${failures.length} 件失敗`);
  process.exit(failures.length ? 1 : 0);
}

if (process.argv.includes('--selftest')) runSelfTest();
main();
