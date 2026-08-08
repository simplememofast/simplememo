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

const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git'];
const SKIP_FILES = ['404.html'];

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

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rel = getRelative(filePath);
  const isNoindex = /content\s*=\s*["'][^"']*noindex/i.test(content);

  // Skip noindex pages for most checks
  if (isNoindex) {
    return;
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
  if (!content.includes('hreflang=')) {
    warnings.push(`[HREFLANG] Missing hreflang tag: ${rel}`);
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
