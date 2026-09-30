/** Site-wide SEO checks. Their root and report arrays are owned by the CLI.
 * Importing this module performs no reads or checks; detector behavior stays unchanged.
 */
const fs = require('fs');
const path = require('path');
const { toUrlPath } = require('./site-files');
const { getMetaContent } = require('./seo-page');

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

  function checkOrphanPages() {
    const files = getAllHtmlFiles(ROOT_DIR);
    const allContent = {};
    const internalLinks = new Set();

    // Read all files and extract internal links
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      allContent[file] = content;

      const hrefMatches = content.match(/href="([^"]*?)"/g) || [];
      for (const match of hrefMatches) {
        const href = match.replace(/href="/, '').replace(/"$/, '');
        if (href.startsWith('/') && !href.startsWith('//')) {
          internalLinks.add(href.split('?')[0].split('#')[0]);
        }
      }
    }

    // Check each page for incoming links
    for (const file of files) {
      const content = allContent[file];
      if (/content\s*=\s*["'][^"']*noindex/i.test(content)) continue;

      const pageUrl = toUrlPath(ROOT_DIR, file);

      // Skip homepage
      if (pageUrl === '/') continue;

      // Check if any page links to this one
      const hasInbound = internalLinks.has(pageUrl) ||
                         internalLinks.has(pageUrl + '/') ||
                         internalLinks.has(pageUrl + '.html');

      if (!hasInbound) {
        warnings.push(`[ORPHAN] No internal links point to: ${pageUrl}`);
      }
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

module.exports = { createSiteChecks };
