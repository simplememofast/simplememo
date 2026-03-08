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

const SITE_URL = 'https://simplememofast.com';
const ROOT_DIR = path.resolve(__dirname, '..');

const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git'];
const SKIP_FILES = ['404.html'];

const errors = [];
const warnings = [];

function getAllHtmlFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.includes(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllHtmlFiles(fullPath));
      } else if (entry.name.endsWith('.html') && !SKIP_FILES.includes(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

function getRelative(filePath) {
  return path.relative(ROOT_DIR, filePath);
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
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
    || content.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']/i);
  if (!descMatch || !descMatch[1].trim()) {
    errors.push(`[DESC] Missing meta description: ${rel}`);
  } else if (descMatch[1].length > 160) {
    warnings.push(`[DESC] Description too long (${descMatch[1].length} chars): ${rel}`);
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

    let pageUrl = '/' + rel.replace(/\\/g, '/');
    if (pageUrl.endsWith('/index.html')) pageUrl = pageUrl.replace('/index.html', '/');
    else if (pageUrl.endsWith('.html')) pageUrl = pageUrl.replace('.html', '');

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
