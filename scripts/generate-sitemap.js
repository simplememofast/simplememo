#!/usr/bin/env node
/**
 * Sitemap Generator for simplememofast.com
 * Generates sitemap.xml from the file system.
 * Excludes noindex pages, admin, 404, and redirect pages.
 * Uses file modification time for lastmod.
 */

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://simplememofast.com';
const ROOT_DIR = path.resolve(__dirname, '..');

// Pages to exclude from sitemap
const EXCLUDED_PATHS = [
  '/admin/',
  '/tiktok/',
  '/404.html',
  '/node_modules/',
  '/scripts/',
  '/docs/',
  '/screenshots/',
];

// Glossary pages whose canonical points to /methods/ (exclude from sitemap)
const CANONICAL_CONFLICT_PAGES = [
  '/glossary/gtd/',
  '/glossary/inbox-zero/',
  '/glossary/pomodoro/',
  '/glossary/second-brain/',
  '/glossary/zettelkasten/',
];

// Pages with hreflang alternates (JA path -> EN path)
const HREFLANG_PAIRS = {
  '/': '/en/',
  '/captio-alternative/': '/en/captio-alternative/',
  '/note-to-email/': '/en/note-to-email/',
};

function getAllHtmlFiles(dir, basePath = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = basePath + '/' + entry.name;

    // Skip excluded directories
    if (EXCLUDED_PATHS.some(ex => relativePath.startsWith(ex))) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;

    if (entry.isDirectory()) {
      results.push(...getAllHtmlFiles(fullPath, relativePath));
    } else if (entry.name.endsWith('.html')) {
      results.push({ fullPath, relativePath });
    }
  }

  return results;
}

function isNoindex(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return /content\s*=\s*["'][^"']*noindex[^"']*["']/i.test(content);
  } catch {
    return false;
  }
}

function getLastModified(filePath) {
  const stat = fs.statSync(filePath);
  return stat.mtime.toISOString().split('T')[0];
}

function filePathToUrl(relativePath) {
  // /index.html -> /
  // /blog/post.html -> /blog/post
  // /vs/notion/index.html -> /vs/notion/

  let url = relativePath;

  if (url.endsWith('/index.html')) {
    url = url.replace('/index.html', '/');
  } else if (url.endsWith('.html')) {
    url = url.replace('.html', '');
  }

  return url;
}

function generateSitemap() {
  const files = getAllHtmlFiles(ROOT_DIR);

  // Filter out noindex pages and non-content files
  const pages = files
    .filter(f => !isNoindex(f.fullPath))
    .filter(f => !EXCLUDED_PATHS.some(ex => f.relativePath.startsWith(ex)))
    .filter(f => !CANONICAL_CONFLICT_PAGES.includes(filePathToUrl(f.relativePath)))
    .map(f => ({
      url: filePathToUrl(f.relativePath),
      lastmod: getLastModified(f.fullPath),
    }))
    .sort((a, b) => a.url.localeCompare(b.url));

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  xml += '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';

  for (const page of pages) {
    const fullUrl = SITE_URL + page.url;
    xml += '  <url>\n';
    xml += `    <loc>${fullUrl}</loc>\n`;
    xml += `    <lastmod>${page.lastmod}</lastmod>\n`;

    // Add hreflang for pages with language alternates
    if (HREFLANG_PAIRS[page.url]) {
      const altUrl = SITE_URL + HREFLANG_PAIRS[page.url];
      xml += `    <xhtml:link rel="alternate" hreflang="ja" href="${fullUrl}" />\n`;
      xml += `    <xhtml:link rel="alternate" hreflang="en" href="${altUrl}" />\n`;
      xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${fullUrl}" />\n`;
    } else if (Object.values(HREFLANG_PAIRS).includes(page.url)) {
      // This is the EN alternate page
      const jaUrl = Object.keys(HREFLANG_PAIRS).find(k => HREFLANG_PAIRS[k] === page.url);
      if (jaUrl) {
        const jaFullUrl = SITE_URL + jaUrl;
        xml += `    <xhtml:link rel="alternate" hreflang="ja" href="${jaFullUrl}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="en" href="${fullUrl}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${jaFullUrl}" />\n`;
      }
    }

    xml += '  </url>\n';
  }

  xml += '</urlset>\n';

  const outputPath = path.join(ROOT_DIR, 'sitemap.xml');
  fs.writeFileSync(outputPath, xml);
  console.log(`✓ Sitemap generated: ${pages.length} URLs → ${outputPath}`);
  return pages.length;
}

generateSitemap();
