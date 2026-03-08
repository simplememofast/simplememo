#!/usr/bin/env node
/**
 * Internal Linking Automation for simplememofast.com
 *
 * Adds contextual "Related Content" blocks to pages that lack them.
 * Rules:
 * - Blog posts → related guides, vs pages, methods
 * - VS pages → captio-alternative, note-to-email, other vs pages
 * - Guides → methods, blog posts, FAQ
 * - Use cases → guides, blog posts, captio-alternative
 *
 * Only adds links if a "related" section doesn't already exist.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Key pages to link to from relevant contexts
const KEY_PAGES = {
  captioAlt: { url: '/captio-alternative/', ja: 'Captio代替アプリ比較', en: 'Captio Alternatives' },
  noteToEmail: { url: '/note-to-email/', ja: '自分にメール送信する方法', en: 'How to Email Yourself' },
  vsIndex: { url: '/vs/', ja: 'メモアプリ比較一覧', en: 'Compare Memo Apps' },
  guidesIndex: { url: '/guides/', ja: '使い方ガイド', en: 'Setup Guides' },
  faq: { url: '/faq', ja: 'よくあるご質問', en: 'FAQ' },
  blog: { url: '/blog/', ja: 'ブログ記事一覧', en: 'All Blog Posts' },
  methodsIndex: { url: '/methods/', ja: 'メソッド一覧', en: 'All Methods' },
};

// Related link mappings by page type
const LINK_RULES = {
  blog: [KEY_PAGES.captioAlt, KEY_PAGES.noteToEmail, KEY_PAGES.vsIndex, KEY_PAGES.guidesIndex],
  vs: [KEY_PAGES.captioAlt, KEY_PAGES.noteToEmail, KEY_PAGES.faq, KEY_PAGES.guidesIndex],
  guides: [KEY_PAGES.methodsIndex, KEY_PAGES.blog, KEY_PAGES.faq, KEY_PAGES.noteToEmail],
  methods: [KEY_PAGES.guidesIndex, KEY_PAGES.blog, KEY_PAGES.vsIndex],
  'use-cases': [KEY_PAGES.captioAlt, KEY_PAGES.guidesIndex, KEY_PAGES.blog, KEY_PAGES.vsIndex],
  glossary: [KEY_PAGES.methodsIndex, KEY_PAGES.blog, KEY_PAGES.faq],
  devlog: [KEY_PAGES.captioAlt, KEY_PAGES.blog, KEY_PAGES.vsIndex],
};

function getPageType(filePath) {
  const relative = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  for (const type of Object.keys(LINK_RULES)) {
    if (relative.startsWith(type + '/')) return type;
  }
  return null;
}

function getPageUrl(filePath) {
  const relative = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  let url = '/' + relative;
  if (url.endsWith('/index.html')) url = url.replace('/index.html', '/');
  else if (url.endsWith('.html')) url = url.replace('.html', '');
  return url;
}

function buildRelatedBlock(links, currentUrl) {
  // Filter out self-links
  const filtered = links.filter(l => l.url !== currentUrl && !currentUrl.startsWith(l.url.slice(0, -1)));
  if (filtered.length === 0) return null;

  let html = '\n<!-- SEO: Auto-generated related content links -->\n';
  html += '<section class="related-links" style="margin-top:3rem;padding-top:2rem;border-top:1px solid var(--border,rgba(100,160,220,0.10));">\n';
  html += '  <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem;">\n';
  html += '    <span data-lang="ja">関連コンテンツ</span>\n';
  html += '    <span data-lang="en">Related Content</span>\n';
  html += '  </h3>\n';
  html += '  <ul style="list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px;">\n';

  for (const link of filtered) {
    html += `    <li><a href="${link.url}" style="display:inline-flex;align-items:center;padding:8px 16px;font-size:.875rem;color:var(--accent,#6ab4ff);border:1px solid var(--border-highlight,rgba(100,180,255,0.22));border-radius:8px;text-decoration:none;min-height:48px;transition:all .25s ease;">`;
    html += `<span data-lang="ja">${link.ja}</span>`;
    html += `<span data-lang="en">${link.en}</span>`;
    html += `</a></li>\n`;
  }

  html += '  </ul>\n';
  html += '</section>\n';
  return html;
}

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const pageType = getPageType(filePath);
  if (!pageType) return false;

  const currentUrl = getPageUrl(filePath);

  // Skip index pages
  if (currentUrl === `/${pageType}/`) return false;

  // Skip if already has related links
  if (content.includes('related-links') || content.includes('関連コンテンツ')) return false;

  const links = LINK_RULES[pageType];
  const block = buildRelatedBlock(links, currentUrl);
  if (!block) return false;

  // Find insertion point: before the last </section> before </main> or before footer
  // Strategy: insert before the footer-cta section or before </main>
  let insertPoint;

  // Try to insert before footer-cta
  const footerCtaIdx = content.lastIndexOf('class="footer-cta"');
  if (footerCtaIdx !== -1) {
    // Find the <section that contains footer-cta
    const sectionStart = content.lastIndexOf('<section', footerCtaIdx);
    if (sectionStart !== -1) {
      insertPoint = sectionStart;
    }
  }

  // Fallback: insert before </main>
  if (!insertPoint) {
    const mainClose = content.lastIndexOf('</main>');
    if (mainClose !== -1) {
      insertPoint = mainClose;
    }
  }

  // Fallback: insert before footer
  if (!insertPoint) {
    const footer = content.lastIndexOf('<footer');
    if (footer !== -1) {
      insertPoint = footer;
    }
  }

  if (!insertPoint) return false;

  const newContent = content.slice(0, insertPoint) + block + content.slice(insertPoint);
  fs.writeFileSync(filePath, newContent);
  return true;
}

function findOrphanPages() {
  const allFiles = [];
  const allLinks = new Set();

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', 'scripts', 'docs', 'screenshots', 'admin', 'tiktok'].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) scanDir(fullPath);
      else if (entry.name.endsWith('.html') && entry.name !== '404.html') allFiles.push(fullPath);
    }
  }

  scanDir(ROOT_DIR);

  // Collect all internal links
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/href="(\/[^"]*?)"/g) || [];
    for (const m of matches) {
      const href = m.replace(/href="/, '').replace(/"$/, '').split('?')[0].split('#')[0];
      allLinks.add(href);
    }
  }

  // Find pages with zero inbound links
  const orphans = [];
  for (const file of allFiles) {
    const url = getPageUrl(file);
    if (url === '/') continue;
    const hasLink = allLinks.has(url) || allLinks.has(url + '/') || allLinks.has(url.replace(/\/$/, ''));
    if (!hasLink) orphans.push(url);
  }

  return orphans;
}

function main() {
  console.log('=== Internal Linking Automation ===\n');

  let modified = 0;
  const pageTypes = Object.keys(LINK_RULES);

  for (const pageType of pageTypes) {
    const dir = path.join(ROOT_DIR, pageType);
    if (!fs.existsSync(dir)) continue;

    const files = [];
    function scanDir(d) {
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fp = path.join(d, entry.name);
        if (entry.isDirectory()) scanDir(fp);
        else if (entry.name.endsWith('.html')) files.push(fp);
      }
    }
    scanDir(dir);

    for (const file of files) {
      if (processFile(file)) {
        const rel = path.relative(ROOT_DIR, file);
        console.log(`✓ ${rel}`);
        modified++;
      }
    }
  }

  console.log(`\n✓ Added related links to ${modified} pages`);

  // Report orphan pages
  console.log('\n--- Orphan Page Detection ---');
  const orphans = findOrphanPages();
  if (orphans.length > 0) {
    console.log(`⚠️  ${orphans.length} pages with no inbound internal links:`);
    orphans.forEach(o => console.log(`  ${o}`));
  } else {
    console.log('✅ No orphan pages detected');
  }
}

main();
