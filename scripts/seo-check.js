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

function getAllHtmlFiles(dir) {
  return collectHtmlFiles(dir, { skipDirs: SKIP_DIRS, skipFiles: SKIP_FILES });
}

function getRelative(filePath) {
  return path.relative(ROOT_DIR, filePath);
}

/**
 * Read one attribute off the first <meta> tag whose `key` attribute equals
 * `value`, regardless of attribute order or quote style. Scoping the scan to
 * a single tag is what keeps a value containing an apostrophe (or a page that
 * writes `content` before `name`) from being mis-measured.
 * Returns null when no such tag exists.
 */
function getMetaContent(html, key, value) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const a of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      attrs[a[1].toLowerCase()] = a[3] !== undefined ? a[3] : a[4];
    }
    if ((attrs[key] || '').toLowerCase() === value) {
      return attrs.content !== undefined ? attrs.content : null;
    }
  }
  return null;
}

/**
 * ISO 8601 date-time carrying an explicit timezone — `Z` or `±hh:mm`.
 * A bare `2026-08-11` fails, and so does a local time with no offset.
 */
const ISO_DATETIME_TZ =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Every JSON-LD node on a page, flattened: top-level objects, arrays of them,
 * and the members of an `@graph`. Yields the nested objects too, since a
 * VideoObject is as likely to hang off `video:` or `mainEntity:` as it is to
 * be the block's root.
 *
 * A block that does not parse is reported and skipped rather than thrown on:
 * the extraction below is a regex, and a page that defeats it should not be
 * able to fail the build on its own.
 */
function jsonLdNodes(html, rel) {
  const nodes = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      nodes.push(value);
      Object.values(value).forEach(walk);
    }
  };
  const blocks =
    html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try {
      walk(JSON.parse(body));
    } catch (e) {
      warnings.push(`[SCHEMA] Unparseable JSON-LD block (${e.message}): ${rel}`);
    }
  }
  return nodes;
}

/** A node's `@type`, always as an array — schema.org allows one or many. */
function nodeTypes(node) {
  const type = node['@type'];
  if (Array.isArray(type)) return type;
  return type ? [type] : [];
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
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = getRelative(filePath);
  const pageUrl = toUrlPath(ROOT_DIR, filePath);
  const isNoindex = /content\s*=\s*["'][^"']*noindex/i.test(content);

  // Skip noindex pages for most checks
  if (isNoindex) {
    return;
  }

  // 0. Language-switch markup that nothing switches.
  //
  // `data-lang` spans are inert on their own: the stylesheet hides
  // [data-lang="en"] and js/lang.js is what reveals the right one. A page
  // carrying those spans WITHOUT that script renders the Japanese span and
  // only the Japanese span — including on pages declaring <html lang="en">.
  //
  // This shipped on 2026-08-11: the next-step card was written with both
  // spans and added site-wide, which put a Japanese-only card at the foot of
  // 39 English pages. Every existing check passed, because none of them knew
  // what language a page was supposed to be in. This one does.
  if (/data-lang\s*=\s*["']ja["']/i.test(content) && !/lang\.js/i.test(content)) {
    const langAttr = content.match(/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i);
    const declared = langAttr ? langAttr[1].toLowerCase() : '';
    if (declared.startsWith('en')) {
      errors.push(`[LANG] English page renders Japanese-only data-lang spans (no lang.js to switch them): ${rel}`);
    } else {
      warnings.push(`[LANG] data-lang spans present but no lang.js to switch them: ${rel}`);
    }
  }

  // 1. Title tag
  const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titleMatch || !titleMatch[1].trim()) {
    errors.push(`[TITLE] Missing or empty <title> tag: ${rel}`);
  } else if (titleMatch[1].length > 70) {
    warnings.push(`[TITLE] Title too long (${titleMatch[1].length} chars): ${rel}`);
  }

  // 2. Meta description
  //
  // Parsed per <meta> tag rather than with one document-wide regex. Two
  // real bugs made that necessary:
  //   - `content="([^"']*)"` stopped the value at the first apostrophe, so
  //     `content="…memos aren't. Set up…"` measured 35 chars instead of 141
  //     and skipped the >160 check entirely.
  //   - Widening it to a lazy `[\s\S]*?` then over-matched in the other
  //     direction on the ~15 pages that write the attributes content-first
  //     (`<meta content="…" name="description"/>`): the pattern anchored on
  //     an earlier `<meta content="…">` tag and swallowed everything up to
  //     the description, reporting 1,400+ chars.
  const desc = getMetaContent(content, 'name', 'description');
  if (desc === null || !desc.trim()) {
    errors.push(`[DESC] Missing meta description: ${rel}`);
  } else if (desc.length > 160) {
    warnings.push(`[DESC] Description too long (${desc.length} chars): ${rel}`);
  } else if (desc.length < 110) {
    // Ahrefs' Site Audit flags anything under 100 characters as "Meta
    // description too short" (59 pages in the 2026-08-05 crawl). 110 keeps a
    // margin above that line.
    warnings.push(`[DESC] Description too short (${desc.length} chars): ${rel}`);
  }

  // 3. Canonical tag
  if (!content.includes('rel="canonical"')) {
    errors.push(`[CANONICAL] Missing canonical tag: ${rel}`);
  }

  // 4. Hreflang tag
  //
  // Only meaningful when the other language actually exists as its own URL.
  // hreflang declares "the same document lives at this other address"; on a
  // page that has no counterpart there is no address to declare, so the tag
  // cannot be added and the warning can never be cleared.
  //
  // Unconditional, this warned on 163 of 240 pages — every JA-only article,
  // glossary entry, use-case and /vs/ comparison that has no /en/ twin. All
  // 163 were unfixable, and they buried the checks that do need acting on
  // (the run printed 163 warnings, 0 of them actionable). The 71 pages that
  // DO have a counterpart already carry a correct ja/en/x-default triple, so
  // the real gap this check exists to catch was, and is, empty.
  //
  // Note this is NOT the same thing as the site's bilingual `data-lang`
  // markup: 158 pages ship both languages inline at ONE url. That is what
  // check 0 above polices. Those pages are single-URL by design and are
  // correctly silent here.
  const counterpartUrl = pageUrl.startsWith('/en/')
    ? pageUrl.slice('/en'.length)
    : '/en' + pageUrl;
  if (getSiteUrls().has(counterpartUrl) && !content.includes('hreflang=')) {
    warnings.push(
      `[HREFLANG] Missing hreflang tag (counterpart ${counterpartUrl} exists): ${rel}`,
    );
  }

  // 5. Structured data (JSON-LD)
  if (!content.includes('application/ld+json')) {
    warnings.push(`[SCHEMA] No structured data (JSON-LD): ${rel}`);
  }

  // 6. OG tags
  if (!content.includes('og:title')) {
    warnings.push(`[OG] Missing og:title: ${rel}`);
  }

  // 7. Viewport
  if (!content.includes('viewport')) {
    errors.push(`[VIEWPORT] Missing viewport meta tag: ${rel}`);
  }

  // 8. Check for ?lang= in href attributes (should not exist in HTML source)
  const langParamLinks = content.match(/href="[^"]*\?lang=/g);
  if (langParamLinks) {
    warnings.push(`[LANG-PARAM] Found ${langParamLinks.length} links with ?lang= in source HTML: ${rel}`);
  }

  // 9. Check for deprecated schema types
  if (content.includes('"@type": "HowTo"') || content.includes('"@type":"HowTo"')) {
    errors.push(`[SCHEMA] Deprecated HowTo schema found: ${rel}`);
  }

  // 10. Our own SoftwareApplication must carry the canonical @id.
  //
  // JSON-LD merges nodes by @id. A node naming our app without one is a
  // SEPARATE entity as far as a consumer is concerned, so the same product
  // gets published as several competing things — which is the exact condition
  // brand-2026-08-11-entity-merge exists to undo.
  //
  // That experiment was recorded as "resolved inside and out" on 2026-08-11
  // on the strength of a count over Organization nodes, all 223 of which did
  // point at the canonical @id. Nobody had counted SoftwareApplication, and
  // six of ours (ai-tags ja/en, apple-watch ja/en, voices,
  // en/send-email-to-yourself) carried no @id at all. A check that runs over
  // Organization cannot see that; this one looks at the node type that was
  // actually broken.
  //
  // Competitor apps are the reason this matches on the NAME rather than on
  // the type alone: /en/send-email-to-yourself/ lists seven rival apps as
  // SoftwareApplication nodes, and those must stay separate entities with no
  // @id of ours.
  for (const m of content.matchAll(/"@type":\s?"SoftwareApplication"([\s\S]{0,400}?)"name":\s?"([^"]+)"/g)) {
    const [between, name] = [m[1], m[2]];
    if (!OWN_APP_NAMES.has(name)) continue;          // a rival's node
    if (between.includes(CANONICAL_APP_ID)) continue; // @id already inside
    // The @id may also sit after the name within the same node.
    const after = content.slice(m.index, m.index + 1200);
    if (after.includes(CANONICAL_APP_ID)) continue;
    errors.push(
      `[SCHEMA] SoftwareApplication "${name}" is missing @id "${CANONICAL_APP_ID}" ` +
      `— it publishes as a separate entity: ${rel}`,
    );
  }

  // 11. VideoObject date-time properties need a time AND a timezone.
  //
  // Schema.org accepts a bare Date for uploadDate; Google's video structured
  // data does not, and reports anything without an offset as「日時値が無効
  // です」/「タイムゾーンがありません」. The five explainer videos shipped on
  // 2026-08-11 with `"uploadDate":"2026-08-11"`, and Search Console flagged
  // all five on 2026-08-12 (WNC-10030322). Nothing here could have caught it:
  // check 5 only asks whether a page has any JSON-LD at all, so a video whose
  // publication date Google cannot read still passed.
  //
  // Non-critical today, which is exactly why it needs a guard — Google's own
  // notice says non-critical issues get reclassified as critical, and by then
  // the markup would be one copied template away from spreading to every new
  // video page.
  for (const node of jsonLdNodes(content, rel)) {
    if (!nodeTypes(node).includes('VideoObject')) continue;
    const name = node.name || node['@id'] || '(unnamed)';
    if (node.uploadDate === undefined) {
      errors.push(`[SCHEMA] VideoObject missing required uploadDate (${name}): ${rel}`);
    }
    // `expires` and the BroadcastEvent start/end pair are the other
    // date-times Google reads off a video; same format rule applies.
    for (const prop of ['uploadDate', 'expires', 'startDate', 'endDate']) {
      const value = node[prop];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !ISO_DATETIME_TZ.test(value)) {
        errors.push(
          `[SCHEMA] VideoObject ${prop} needs a time and a timezone offset ` +
          `(got "${value}", want e.g. 2026-08-11T13:42:48+09:00) in ${name}: ${rel}`,
        );
      }
    }
  }
}

function checkSitemap() {
  const sitemapPath = path.join(ROOT_DIR, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) {
    errors.push('[SITEMAP] sitemap.xml not found');
    return;
  }

  const content = fs.readFileSync(sitemapPath, 'utf8');
  const urlMatches = content.match(/<loc>[^<]+<\/loc>/g) || [];
  const urls = urlMatches.map(m => m.replace(/<\/?loc>/g, ''));

  // Check for noindex pages in sitemap
  for (const url of urls) {
    const relativePath = url.replace(SITE_URL, '');
    let filePath;

    if (relativePath.endsWith('/')) {
      filePath = path.join(ROOT_DIR, relativePath, 'index.html');
    } else {
      filePath = path.join(ROOT_DIR, relativePath + '.html');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(ROOT_DIR, relativePath, 'index.html');
      }
    }

    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      if (/content\s*=\s*["'][^"']*noindex/i.test(fileContent)) {
        errors.push(`[SITEMAP] Noindex page in sitemap: ${url}`);
      }
    }
  }

  console.log(`  Sitemap: ${urls.length} URLs`);
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
  const retiredBlock = mw.match(/const RETIRED = \{([\s\S]*?)\n {2}\};/);
  if (retiredBlock) {
    for (const m of retiredBlock[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)) retired.set(m[1], m[2]);
  }
  const gone = new Set();
  const goneBlock = mw.match(/const GONE = new Set\(\[([\s\S]*?)\n {2}\]\);/);
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
    const rel = getRelative(file);
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
 * llms.txt freshness (report-only — a warning, never a build failure).
 *
 * AI assistants treat the file's own stamps as the freshness signal (the file
 * says so), which cuts both ways: when the stamps go stale, every AI answer
 * citing us repeats old facts with full confidence. That actually happened —
 * the "Current facts" block still said v5.7.3 on 2026-08-20 while 97% of new
 * installs were already on 5.7.8 (GROWTH_ROI_PLAN_2026-08-20.md §2-5). Nothing
 * reported it, because nothing was looking.
 *
 * Why warn rather than fail: the correct values (store version, rating count,
 * price) can only be read off the App Store listing, which CI cannot do. A
 * red build here would block unrelated deploys on a fact only the owner can
 * fetch. A *missing or unparseable* stamp is an error, though — an
 * unreadable stamp would disable this check silently and forever.
 */
function checkLlmsFreshness() {
  const STALE_DAYS = 30;
  const llmsPath = path.join(ROOT_DIR, 'llms.txt');
  if (!fs.existsSync(llmsPath)) {
    errors.push('[LLMS] llms.txt not found at site root');
    return;
  }
  const text = fs.readFileSync(llmsPath, 'utf8');
  const stamps = [
    // The file-level stamp the file itself declares authoritative (§Versioning).
    ['Last updated', /\*\*Last updated:\*\*\s*(\d{4}-\d{2}-\d{2})/],
    // The stamp on the facts AI answers actually quote (version/rating/price).
    ['Current facts (as of …)', /\*\*Current facts \(as of (\d{4}-\d{2}-\d{2})\)/],
  ];
  for (const [name, re] of stamps) {
    const m = text.match(re);
    const date = m ? new Date(`${m[1]}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime())) {
      errors.push(`[LLMS] llms.txt "${name}" stamp is missing or unparseable — the freshness check cannot run`);
      continue;
    }
    const age = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (age > STALE_DAYS) {
      warnings.push(
        `[LLMS] llms.txt "${name}" is ${age} days old (> ${STALE_DAYS}): ` +
        'AI assistants cite these facts as current. Refresh version / rating count / price ' +
        'from the App Store listing (owner-verified values only) and bump the stamp.',
      );
    }
  }
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

main();
