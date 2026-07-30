#!/usr/bin/env node
/**
 * Add self-referencing hreflang tags to all HTML pages.
 * - JA pages (root): adds hreflang="ja" self-reference
 * - EN pages (/en/): adds hreflang="en" self-reference + ja alternate
 * - Homepage pair: already has hreflang, skip
 *
 * Also ensures every page has a canonical tag.
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');

const SITE_URL = 'https://simplememofast.com';
const ROOT_DIR = path.resolve(__dirname, '..');

const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tiktok'];
const SKIP_FILES = ['404.html'];

function getAllHtmlFiles(dir) {
  // tolerateReadErrors: false — this script has always let an unreadable
  // directory surface as a hard failure rather than silently skipping pages.
  return collectHtmlFiles(dir, {
    skipDirs: SKIP_DIRS,
    skipFiles: SKIP_FILES,
    tolerateReadErrors: false,
  });
}

function getCanonicalUrl(filePath) {
  return SITE_URL + toUrlPath(ROOT_DIR, filePath);
}

function getPageLang(filePath) {
  const relative = path.relative(ROOT_DIR, filePath);
  return relative.startsWith('en/') || relative.startsWith('en\\') ? 'en' : 'ja';
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const canonicalUrl = getCanonicalUrl(filePath);
  const lang = getPageLang(filePath);
  let modified = false;

  // Skip if already has self-referencing hreflang (homepages)
  if (content.includes('hreflang="ja"') && content.includes('hreflang="en"')) {
    return { skipped: true, reason: 'already has hreflang pair' };
  }

  // Check if page is noindex
  if (/content\s*=\s*["'][^"']*noindex/i.test(content)) {
    return { skipped: true, reason: 'noindex page' };
  }

  // Build hreflang tag
  const hreflangTag = `<link rel="alternate" hreflang="${lang}" href="${canonicalUrl}">`;

  // Check if hreflang already exists
  if (!content.includes(`hreflang="${lang}"`)) {
    // Insert after canonical tag, or after last meta tag in <head>
    const canonicalMatch = content.match(/<link\s+rel="canonical"[^>]*>/);
    if (canonicalMatch) {
      content = content.replace(
        canonicalMatch[0],
        canonicalMatch[0] + '\n    ' + hreflangTag
      );
      modified = true;
    } else {
      // No canonical tag — add both canonical and hreflang before </head>
      const canonicalTag = `<link rel="canonical" href="${canonicalUrl}">`;
      content = content.replace(
        '</head>',
        `    ${canonicalTag}\n    ${hreflangTag}\n</head>`
      );
      modified = true;
    }
  }

  // Ensure canonical exists
  if (!content.includes('rel="canonical"')) {
    const canonicalTag = `<link rel="canonical" href="${canonicalUrl}">`;
    content = content.replace(
      '</head>',
      `    ${canonicalTag}\n</head>`
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    return { modified: true, lang, url: canonicalUrl };
  }

  return { skipped: true, reason: 'no changes needed' };
}

function main() {
  const files = getAllHtmlFiles(ROOT_DIR);
  let modifiedCount = 0;
  let skippedCount = 0;

  console.log(`Processing ${files.length} HTML files...\n`);

  for (const file of files) {
    const relative = path.relative(ROOT_DIR, file);
    const result = processFile(file);

    if (result.modified) {
      console.log(`✓ ${relative} → hreflang="${result.lang}"`);
      modifiedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n✓ Modified: ${modifiedCount} files`);
  console.log(`  Skipped: ${skippedCount} files`);
}

main();
