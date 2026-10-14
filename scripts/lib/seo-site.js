/** Site-wide SEO checks. Their root and report arrays are owned by the CLI.
 * Importing this module performs no reads or checks; detector behavior stays unchanged.
 */
const fs = require('fs');
const path = require('path');
const { getMetaContent } = require('./seo-page');
const { pageKey } = require('./site-files');
const { readLinkDeferrals, settleLinkFindings } = require('./link-deferrals');

/**
 * Language directory → the locale name data/i18n/pages.json registers it under.
 * zh/ is 'zh-Hans' there, not 'zh': keying on the directory name would make a
 * link between a registered and an unregistered zh/ page look cross-language.
 */
const LOCALE_DIRS = {
  en: 'en', zh: 'zh-Hans', 'zh-Hant': 'zh-Hant', ko: 'ko', es: 'es',
  'pt-BR': 'pt-BR', id: 'id', ar: 'ar', tr: 'tr', ja: 'ja',
};

/** Language of an unregistered page: its first path segment, else Japanese. */
const localeOfPath = (urlPath) => {
  const dir = urlPath.split('/')[1];
  return Object.hasOwn(LOCALE_DIRS, dir) ? LOCALE_DIRS[dir] : 'ja';
};

/** '/', '/en/', '/zh/', … — the top of a language, not a section hub. */
const LANGUAGE_ROOTS = new Set(['/', ...Object.keys(LOCALE_DIRS).map((dir) => `/${dir}/`)]);

/**
 * The hrefs of <a> elements, and nothing else.
 *
 * Not <link rel="alternate" hreflang>, not a JSON-LD url, and not an <a> that
 * exists only inside an HTML comment, a <script> string or an inert
 * <template> — none of those is a link a reader (or Googlebot's link graph)
 * gets from the page. Attribute order and quote style do not matter; the
 * attributes are tokenised so an `href=` inside another attribute's value is
 * not mistaken for the real one.
 */
function anchorHrefs(html) {
  const src = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template\s*>/gi, ' ');
  const out = [];
  for (const tag of src.matchAll(/<a\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) {
    for (const a of tag[1].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g)) {
      if (a[1].toLowerCase() !== 'href') continue;
      out.push((a[2] ?? a[3] ?? a[4] ?? '').replace(/&amp;/g, '&').trim());
      break;
    }
  }
  return out;
}

/**
 * Page keys (see pageKey) that the <a> elements of one document point at.
 * Relative hrefs resolve against the page's own URL; off-site, mailto: and
 * similar links are dropped; query and fragment are ignored.
 */
function linkedPages(html, pageUrlPath, origin) {
  const out = new Set();
  for (const href of anchorHrefs(html)) {
    let url;
    try { url = new URL(href, origin + pageUrlPath); } catch { continue; }
    if (url.origin !== origin) continue;
    let pathname = url.pathname;
    try { pathname = decodeURIComponent(pathname); } catch { /* keep the encoded form */ }
    out.add(pageKey(pathname));
  }
  return out;
}

function createSiteChecks({ rootDir: ROOT_DIR, siteUrl: SITE_URL, errors, warnings,
  getAllHtmlFiles, getRelative }) {
  function checkSitemap(rootDir = ROOT_DIR, { quiet = false } = {}) {
    const seenMaps = new Set();
    const urls = new Set();
    const fail = (message) => errors.push(`[SITEMAP] ${message}`);
    const decode = (value) => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    const localPath = (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.origin !== SITE_URL || parsed.search || parsed.hash) throw new Error('non-canonical origin/query/fragment');
        const file = path.resolve(rootDir, '.' + decodeURIComponent(parsed.pathname));
        if (file !== path.resolve(rootDir) && !file.startsWith(path.resolve(rootDir) + path.sep)) throw new Error('outside site root');
        return file;
      } catch (e) {
        fail(`Invalid URL: ${url} (${e.message})`);
        return null;
      }
    };
    const visit = (url) => {
      if (seenMaps.has(url)) { fail(`Repeated or cyclic sitemap: ${url}`); return; }
      seenMaps.add(url);
      const file = localPath(url);
      if (!file) return;
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { fail(`Missing sitemap: ${url}`); return; }
      const xml = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      const index = /<sitemapindex\b[^>]*>[\s\S]*<\/sitemapindex>/.test(xml);
      if (!index && !/<urlset\b[^>]*>[\s\S]*<\/urlset>/.test(xml)) { fail(`Invalid sitemap root: ${url}`); return; }
      const entries = [...xml.matchAll(index ? /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/g : /<url\b[^>]*>([\s\S]*?)<\/url>/g)];
      if (!entries.length) fail(`Empty sitemap: ${url}`);
      for (const entry of entries) {
        const locs = [...entry[1].matchAll(/<loc\b[^>]*>([^<]*)<\/loc>/g)];
        if (locs.length !== 1 || !locs[0][1].trim()) { fail(`Entry needs one loc: ${url}`); continue; }
        const loc = decode(locs[0][1].trim());
        if (index) { visit(loc); continue; }
        if (urls.has(loc)) { fail(`Duplicate page URL: ${loc}`); continue; }
        urls.add(loc);
        const base = localPath(loc);
        if (!base) continue;
        const candidates = loc.endsWith('/') ? [path.join(base, 'index.html')] : [base + '.html', path.join(base, 'index.html')];
        const page = candidates.find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
        if (!page) { fail(`Missing page: ${loc}`); continue; }
        const html = fs.readFileSync(page, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
        for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
          if (['robots', 'googlebot'].some((name) => /\b(?:noindex|none)\b/i.test(getMetaContent(tag, 'name', name) || ''))) {
            fail(`Noindex page in sitemap: ${loc}`);
          }
        }
        const canonicals = [];
        for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
          const attrs = {};
          for (const m of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[3] ?? m[4];
          if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) canonicals.push(decode(attrs.href || ''));
        }
        if (canonicals.length !== 1 || canonicals[0] !== loc) fail(`Canonical differs from sitemap URL: ${loc}`);
      }
    };
    visit(`${SITE_URL}/sitemap.xml`);
    if (!quiet) console.log(`  Sitemap: ${urls.size} page URLs (${seenMaps.size} XML files)`);
  }

  function checkRobots() {
    const robotsPath = path.join(ROOT_DIR, 'robots.txt');
    if (!fs.existsSync(robotsPath)) {
      errors.push('[ROBOTS] robots.txt not found');
      return;
    }

    const content = fs.readFileSync(robotsPath, 'utf8');
    if (!content.includes('Sitemap:')) {
      warnings.push('[ROBOTS] No Sitemap directive in robots.txt');
    }

    // A `Disallow` on a query-parameter pattern is always a mistake here.
    // Blocking the URL stops Googlebot from fetching it, so it never sees the
    // canonical or the 301 that would retire it — the URL does not drop out of
    // the index, it parks in Search Console as "blocked by robots.txt" instead.
    // This exact regression put 79 URLs in that bucket (unblocked for `?lang=`
    // in PR #270, for `utm_*`/`ref`/`from`/`source` in PR #412). Parameter URLs
    // are handled at the edge in functions/_middleware.js — never here.
    for (const line of content.split('\n')) {
      const rule = line.trim();
      if (/^Disallow:\s*\S*[?*]?\?/i.test(rule)) {
        errors.push(`[ROBOTS] Parameter URLs must not be Disallowed (handle at the edge): ${rule}`);
      }
    }
  }

  /**
   * URL hygiene: every internal reference must already be the canonical form.
   *
   * Each non-canonical form below mints a second crawlable URL for the same
   * page. The edge redirects them, but a redirect Google has to discover is
   * still a crawl it did not need to spend, and it lands in the "Page with
   * redirect" bucket in the meantime. These invariants were verified by hand in
   * five consecutive audits (07-02, 07-07, 07-16, 07-19, 07-25); encoding them
   * here is what stops the sixth.
   */
  function checkUrlHygiene() {
    const SELF = /^https?:\/\/(www\.)?simplememofast\.com/i;
    const TRACKING = ['ref=', 'from=', 'source=', 'utm_', 'fbclid=', 'gclid='];
    let checked = 0;

    for (const file of getAllHtmlFiles(ROOT_DIR)) {
      const rel = getRelative(file);
      const content = fs.readFileSync(file, 'utf8');

      for (const m of content.matchAll(/href="([^"]*)"/g)) {
        const href = m[1];
        const isAbsoluteSelf = SELF.test(href);
        // Site-internal only: a leading single "/" path, or an absolute URL
        // pointing back at our own host. Everything else is off-site.
        if (!isAbsoluteSelf && !(href.startsWith('/') && !href.startsWith('//'))) continue;
        checked++;

        if (/^http:\/\//i.test(href)) {
          errors.push(`[URL] Insecure self-link (use https or a root-relative path): ${rel} → ${href}`);
        }
        if (/^https?:\/\/www\./i.test(href)) {
          errors.push(`[URL] www host redirects to the apex — link the apex: ${rel} → ${href}`);
        }

        const pathAndQuery = isAbsoluteSelf ? href.replace(SELF, '') : href;
        const [pathname, query = ''] = pathAndQuery.split('#')[0].split('?');

        if (pathname.includes('//')) {
          errors.push(`[URL] Double slash in path: ${rel} → ${href}`);
        }
        if (pathname.endsWith('.html')) {
          errors.push(`[URL] Link the extensionless canonical, not the .html form: ${rel} → ${href}`);
        }
        if (query) {
          if (/(^|&)lang=/.test(query)) {
            errors.push(`[URL] ?lang= is stripped by a 301 — link the canonical URL: ${rel} → ${href}`);
          }
          for (const param of TRACKING) {
            if (query.includes(param)) {
              errors.push(`[URL] Tracking parameter on an internal link: ${rel} → ${href}`);
              break;
            }
          }
        }
      }
    }

    console.log(`  URL hygiene: ${checked} internal links`);
  }

  /**
   * The edge owns two lists of URLs that must never be advertised: paths that
   * 301 elsewhere (functions/_middleware.js RETIRED + _redirects) and paths that
   * answer 410 (RETIRED's sibling GONE). Shipping either in a sitemap tells
   * Google to go crawl a URL we have just told it to forget.
   *
   * Also asserts the middleware's RETIRED map is fully covered by _redirects.
   * The middleware runs first and is the fast path; _redirects is the fallback
   * if a Functions deploy fails, so it has to know every retired path too.
   */
  function checkEdgeRules() {
    const mwPath = path.join(ROOT_DIR, 'functions/_middleware.js');
    const redirectsPath = path.join(ROOT_DIR, '_redirects');
    if (!fs.existsSync(mwPath) || !fs.existsSync(redirectsPath)) {
      errors.push('[EDGE] functions/_middleware.js or _redirects is missing');
      return;
    }

    const mw = fs.readFileSync(mwPath, 'utf8');
    const retired = new Map();
    // RETIRED/GONE はモジュールスコープの宣言（インデント無しで閉じる）。
    // 閉じ括弧は行頭アンカー（^）で取る: lazy な [\s\S]*? だけだと、将来
    // 閉じ括弧のインデントが変わったときに次の行頭 `};` まで黙って
    // 読み過ぎ、無関係のリテラルを retired として拾ってしまう。
    const retiredBlock = mw.match(/^const RETIRED = \{([\s\S]*?)^\};/m);
    if (retiredBlock) {
      for (const m of retiredBlock[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) retired.set(m[1], m[2]);
    }
    const gone = new Set();
    const goneBlock = mw.match(/^const GONE = new Set\(\[([\s\S]*?)^\]\);/m);
    if (goneBlock) {
      for (const m of goneBlock[1].matchAll(/"([^"]+)"/g)) gone.add(m[1]);
    }
    if (!retired.size || !gone.size) {
      errors.push('[EDGE] Could not parse RETIRED/GONE from functions/_middleware.js');
      return;
    }

    const fallback = new Map();
    for (const line of fs.readFileSync(redirectsPath, 'utf8').split('\n')) {
      const m = line.trim().match(/^(\/\S*)\s+(\S+)\s+30[18]$/);
      if (m) fallback.set(m[1], m[2]);
    }
    for (const [from, to] of retired) {
      if (fallback.get(from) !== to) {
        errors.push(`[EDGE] _redirects fallback missing or divergent for ${from} → ${to} (got ${fallback.get(from) || 'nothing'})`);
      }
    }

    for (const name of ['sitemap-ja.xml', 'sitemap-en.xml', 'sitemap-locales.xml']) {
      const p = path.join(ROOT_DIR, name);
      if (!fs.existsSync(p)) continue;
      for (const m of fs.readFileSync(p, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
        const pathname = m[1].replace(/^https?:\/\/[^/]+/, '');
        if (retired.has(pathname)) {
          errors.push(`[EDGE] ${name} lists a 301'd URL: ${pathname} → ${retired.get(pathname)}`);
        }
        if (gone.has(pathname)) {
          errors.push(`[EDGE] ${name} lists a 410 Gone URL: ${pathname}`);
        }
      }
    }

    console.log(`  Edge rules: ${retired.size} retired paths, ${gone.size} gone slugs`);
  }

  /**
   * Page paths ('/x/', '/x') listed by sitemap.xml and the sitemaps it indexes.
   * Validation is checkSitemap's job; this only reads, and skips what it cannot.
   */
  function sitemapPagePaths(rootDir) {
    const paths = [];
    const seen = new Set();
    // Malformed %-escapes are checkSitemap's to report; here they are skipped, not thrown.
    const localPath = (url) => {
      if (!url.startsWith(`${SITE_URL}/`)) return null;
      try { return decodeURIComponent(url.slice(SITE_URL.length)); } catch { return null; }
    };
    const visit = (url) => {
      const rel = localPath(url);
      if (seen.has(url) || rel === null) return;
      seen.add(url);
      const file = path.join(rootDir, rel);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
      const xml = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      const index = /<sitemapindex\b/.test(xml);
      for (const m of xml.matchAll(/<loc\b[^>]*>\s*([^<\s]+)\s*<\/loc>/g)) {
        const loc = m[1].replace(/&amp;/g, '&');
        if (index) { visit(loc); continue; }
        const page = localPath(loc);
        if (page !== null) paths.push(page);
      }
    };
    visit(`${SITE_URL}/sitemap.xml`);
    return paths;
  }

  /**
   * Orphans and section hubs, counted the way a crawler discovers a page.
   *
   * GSC reported 53 pages as "Discovered – currently not indexed" on
   * 2026-10-14 — all published 2026-09-19 … 10-08, all 200 + self-canonical.
   * The old version of this check (a warning) counted any `href="…"` anywhere
   * in any file, so the <link rel="alternate" hreflang> tags and the
   * language-switcher links between a page's own translations made every new
   * page look linked. Run against that day's HEAD it reported 0 orphans; this
   * version names 39 orphans and 324 missing hub links (15 and 68 of them in
   * ja/en, the rest in the generated locales).
   *
   *   [ORPHAN] an indexable page (listed in the sitemaps) with no <a> link from
   *            another indexable page of the SAME language outside its own
   *            translation group. A link from a page Google is not asked to
   *            index (tiktok/, compose, verify, admin/) does not count.
   *   [HUB]    when the page's parent directory (/obsidian/ for
   *            /obsidian/airpods/, /en/blog/ for /en/blog/foo) is itself an
   *            indexable page and not a language root, that hub links to it.
   *            docs/obsidian/OBSIDIAN_INTERNAL_LINK_PLAN.md §11: "Child
   *            ピラーからのみ。全子記事へ".
   *
   * Languages and translation groups come from data/i18n/pages.json (it puts
   * memo-inbox/ in English and ja/memo-inbox/ in Japanese — the path alone
   * would get both wrong); unregistered pages fall back to their first path
   * segment, else Japanese. Both rules are errors: a page nothing links to is
   * a page Google may know about and never crawl.
   *
   * Some links the rules demand must not be added yet (a frozen experiment's
   * hub, pages awaiting a consolidation decision). Those are listed by name,
   * with a reason and an expiry, in data/link-gate-deferrals.json and settled
   * by lib/link-deferrals.js — the same module check-content-graph.mjs uses for
   * [CHILD]. A deferred finding is still printed, as a warning; a lapsed or
   * unused deferral, or a ledger that cannot be read, is an error.
   * `deferrals` is injectable so the self-test does not read the real ledger
   * or the real clock.
   */
  function checkOrphanPages(rootDir = ROOT_DIR, { quiet = false, deferrals = null } = {}) {
    const urls = sitemapPagePaths(rootDir);
    if (!urls.length) {
      // 0 pages read is not "no orphans" — it is a check that looked at nothing.
      errors.push('[ORPHAN] No page URLs could be read from sitemap.xml — the orphan check cannot run');
      return;
    }
    let registry;
    try {
      registry = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/i18n/pages.json'), 'utf8'));
    } catch (e) {
      errors.push(`[ORPHAN] data/i18n/pages.json is unreadable (${e.message}) — page languages are unknown, so the orphan check cannot run`);
      return;
    }
    const registered = new Map();
    (registry.pages || []).forEach((entry, i) => {
      for (const [locale, file] of Object.entries(entry.pages || {})) {
        registered.set(pageKey(`/${file}`), { lang: locale, group: `#${i}` });
      }
    });

    const read = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
    const pages = new Map();
    for (const url of urls) {
      const base = path.join(rootDir, url);
      // Read straight away rather than exists + stat + read: this runs for ~2,500 pages.
      const html = url.endsWith('/') ? read(path.join(base, 'index.html'))
        : read(base + '.html') ?? read(path.join(base, 'index.html'));
      if (html === null) continue; // checkSitemap reports the missing page
      const key = pageKey(url);
      const entry = registered.get(key);
      pages.set(key, {
        url,
        lang: entry ? entry.lang : localeOfPath(key),
        // An unregistered page is a group of one, so a link to itself never counts.
        group: entry ? entry.group : key,
        links: linkedPages(html, url, SITE_URL),
        sameLanguage: 0,
        otherInbound: 0,
      });
    }

    let counted = 0;
    for (const source of pages.values()) {
      for (const to of source.links) {
        const target = pages.get(to);
        if (!target) continue;
        if (target.lang === source.lang && target.group !== source.group) {
          target.sameLanguage++;
          counted++;
        } else {
          target.otherInbound++;
        }
      }
    }

    // Collected first, then settled against the deferral ledger as one batch:
    // "this deferral matches nothing" can only be decided after every finding is known.
    const findings = [];
    for (const [key, page] of pages) {
      if (!page.sameLanguage) {
        const others = page.otherInbound
          ? `only ${page.otherInbound} link(s) from its own translations or other languages`
          : 'no inbound links at all';
        findings.push({ rule: 'ORPHAN', page: page.url,
          message: `[ORPHAN] No same-language (${page.lang}) page links here (${others}): ${page.url}` });
      }
      const trimmed = page.url.replace(/\/+$/, '');
      if (!trimmed) continue;
      const parent = trimmed.slice(0, trimmed.lastIndexOf('/') + 1);
      if (LANGUAGE_ROOTS.has(parent)) continue;
      const hub = pages.get(pageKey(parent));
      if (hub && !hub.links.has(key)) {
        findings.push({ rule: 'HUB', parent: hub.url, child: page.url,
          message: `[HUB] Section hub does not link its child page (add it to the hub): ${hub.url} → ${page.url}` });
      }
    }

    const settled = settleLinkFindings(findings, {
      owner: 'seo-check', registry, deferrals: deferrals ?? readLinkDeferrals(rootDir),
    });
    errors.push(...settled.errors);
    warnings.push(...settled.deferred);

    if (!quiet) {
      const held = Object.entries(settled.counts).map(([id, n]) => `${id} ${n}`).join(', ');
      console.log(`  Orphans/hubs: ${pages.size} indexable pages, ${counted} same-language links`
        + (held ? `; ${settled.deferred.length} deferred (${held})` : ''));
    }
  }

  /**
   * llms.txt freshness (old dates warn; missing dates fail).
   *
   * AI assistants treat the file's own stamps as the freshness signal (the file
   * says so), which cuts both ways: when the stamps go stale, every AI answer
   * citing us repeats old facts with full confidence. That actually happened —
   * the old shared "Current facts" block still said v5.7.3 on 2026-08-20 while 97% of new
   * installs were already on 5.7.8 (GROWTH_ROI_PLAN_2026-08-20.md §2-5). Nothing
   * reported it, because nothing was looking.
   *
   * Why warn rather than fail: the correct values (store version, rating count,
   * price) require a storefront lookup or owner confirmation, which offline CI cannot do. A
   * red build here would block unrelated deploys on a fact only the owner can
   * fetch. A *missing or unparseable* stamp is an error, though — an
   * unreadable stamp would disable this check silently and forever.
   */
  function checkLlmsFreshness() {
    const llmsPath = path.join(ROOT_DIR, 'llms.txt');
    if (!fs.existsSync(llmsPath)) {
      errors.push('[LLMS] llms.txt not found at site root');
      return;
    }
    const text = fs.readFileSync(llmsPath, 'utf8');
    const stamps = [
      // The file-level stamp the file itself declares authoritative (§Versioning).
      ['Last updated', /\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/, 30],
      ['Japan App Store version', /Japan App Store version [0-9][0-9.]* \(verified (\d{4}-\d{2}-\d{2})\)/, 30],
      ['Japan App Store rating', /Japan App Store rating \d\.\d \(\d+ ratings; verified (\d{4}-\d{2}-\d{2})\)/, 30],
      ['Japan subscription prices', /Premium ¥\d+\/mo or ¥[\d,]+\/yr \(owner-confirmed (\d{4}-\d{2}-\d{2})\)/, 180],
    ];
    for (const [name, re, staleDays] of stamps) {
      const m = text.match(re);
      const date = m ? new Date(`${m[1]}T00:00:00Z`) : null;
      if (!date || Number.isNaN(date.getTime())) {
        errors.push(`[LLMS] llms.txt "${name}" stamp is missing or unparseable — the freshness check cannot run`);
        continue;
      }
      const age = Math.floor((Date.now() - date.getTime()) / 86400000);
      if (age > staleDays) {
        warnings.push(
          `[LLMS] llms.txt "${name}" is ${age} days old (> ${staleDays}): ` +
          'Recheck this fact at its stated source before changing its value or verification date.',
        );
      }
    }
  }


  return { checkSitemap, checkRobots, checkUrlHygiene, checkEdgeRules, checkOrphanPages, checkLlmsFreshness };
}

module.exports = { createSiteChecks, anchorHrefs, linkedPages, pageKey };
