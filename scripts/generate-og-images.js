#!/usr/bin/env node
/**
 * OG Image Generator for simplememofast.com
 * Generates unique OG images (1200x630) for each page using Playwright.
 *
 * Usage:
 *   node scripts/generate-og-images.js              # Generate for all pages
 *   node scripts/generate-og-images.js --missing     # Only pages without custom OG image
 *   node scripts/generate-og-images.js --only index  # Generate only specific slug
 *
 * Requires: npx playwright install chromium
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'assets', 'img', 'og');
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tiktok', 'en'];

// App icon as base64 data URI (read at startup)
let APP_ICON_DATA_URI = '';

function loadAppIcon() {
  const iconPath = path.join(ROOT_DIR, 'assets', 'img', 'app-icon-256.png');
  if (fs.existsSync(iconPath)) {
    const data = fs.readFileSync(iconPath);
    APP_ICON_DATA_URI = `data:image/png;base64,${data.toString('base64')}`;
  }
}

function getAllHtmlFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.includes(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllHtmlFiles(fullPath));
      } else if (entry.name.endsWith('.html') && entry.name !== '404.html') {
        results.push(fullPath);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

function getPageTitle(content) {
  const match = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match) return 'Simple Memo';
  let title = match[1].trim();
  title = title.replace(/\s*[—|]\s*Captio式シンプルメモ.*$/g, '');
  title = title.replace(/\s*[—|]\s*Simple Memo.*$/g, '');
  return title || 'Simple Memo';
}

function getPageSlug(filePath) {
  let relative = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  relative = relative.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  return relative.replace(/\//g, '-') || 'index';
}

/**
 * Smart title formatting: split into main title + subtitle for better layout
 */
function formatTitle(title, slug) {
  // Special cases for key pages
  const specialTitles = {
    'index': {
      main: 'Captio式シンプルメモ',
      sub: '自分にメール送信するメモアプリ'
    },
  };

  if (specialTitles[slug]) return specialTitles[slug];

  // Auto-split: if title has — or | separator, split there
  const separators = [' — ', ' | ', '｜'];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx > 0) {
      return {
        main: title.substring(0, idx),
        sub: title.substring(idx + sep.length)
      };
    }
  }

  // Long single titles: try to find a natural break point
  if (title.length > 20) {
    // Look for particles/punctuation to break at
    const breakChars = ['の', 'を', 'に', 'で', 'と', 'が', 'は', '・', '、'];
    const midpoint = Math.floor(title.length / 2);
    let bestBreak = -1;
    let bestDist = Infinity;
    for (let i = 0; i < title.length; i++) {
      if (breakChars.includes(title[i]) && Math.abs(i - midpoint) < bestDist) {
        bestDist = Math.abs(i - midpoint);
        bestBreak = i;
      }
    }
    if (bestBreak > 0 && bestBreak < title.length - 2) {
      return {
        main: title.substring(0, bestBreak + 1),
        sub: title.substring(bestBreak + 1)
      };
    }
  }

  return { main: title, sub: '' };
}

function generateHtml(title, slug) {
  const formatted = formatTitle(title, slug);
  const mainFontSize = formatted.main.length > 18 ? '46px' : '54px';
  const hasSubtitle = formatted.sub && formatted.sub.length > 0;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1200px;
  height: 630px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #030306;
  font-family: 'Noto Sans JP', -apple-system, sans-serif;
  overflow: hidden;
  position: relative;
}

/* Mesh gradient background */
.bg-gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 70% 20%, rgba(30, 100, 220, 0.25) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 20% 80%, rgba(0, 180, 255, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse 50% 40% at 90% 70%, rgba(80, 40, 200, 0.12) 0%, transparent 50%),
    linear-gradient(160deg, #050510 0%, #0a1525 40%, #0c1a30 60%, #050510 100%);
}

/* Subtle grid pattern */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(100, 180, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(100, 180, 255, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}

/* Glow orb */
.glow-orb {
  position: absolute;
  width: 500px;
  height: 500px;
  top: -120px;
  right: -80px;
  background: radial-gradient(circle, rgba(106, 180, 255, 0.18) 0%, rgba(0, 229, 255, 0.05) 40%, transparent 70%);
  border-radius: 50%;
  filter: blur(40px);
}

.glow-orb-2 {
  position: absolute;
  width: 350px;
  height: 350px;
  bottom: -80px;
  left: 60px;
  background: radial-gradient(circle, rgba(0, 229, 255, 0.12) 0%, transparent 60%);
  border-radius: 50%;
  filter: blur(30px);
}

/* Border frame */
.frame {
  position: absolute;
  inset: 24px;
  border: 1px solid rgba(106, 180, 255, 0.12);
  border-radius: 20px;
}
.frame::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 80px;
  right: 80px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(106, 180, 255, 0.4), rgba(0, 229, 255, 0.3), transparent);
}
.frame::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 120px;
  right: 120px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(106, 180, 255, 0.2), transparent);
}

.container {
  text-align: center;
  max-width: 960px;
  padding: 60px;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.icon {
  width: 88px;
  height: 88px;
  border-radius: 22px;
  margin-bottom: 36px;
  box-shadow:
    0 0 60px rgba(106, 180, 255, 0.2),
    0 20px 40px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(106, 180, 255, 0.2);
  overflow: hidden;
}
.icon img {
  width: 100%;
  height: 100%;
  display: block;
}

h1 {
  font-size: ${mainFontSize};
  font-weight: 900;
  color: #ffffff;
  line-height: 1.25;
  margin-bottom: ${hasSubtitle ? '16px' : '24px'};
  letter-spacing: -0.02em;
  text-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}

.subtitle {
  font-size: 26px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.4;
  letter-spacing: 0.01em;
  margin-bottom: 28px;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.06em;
  padding: 8px 20px;
  background: rgba(106, 180, 255, 0.06);
  border: 1px solid rgba(106, 180, 255, 0.1);
  border-radius: 100px;
}
.brand .dot {
  width: 6px;
  height: 6px;
  background: #00e5ff;
  border-radius: 50%;
  box-shadow: 0 0 8px #00e5ff;
}
.brand .name {
  color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
}
</style>
</head>
<body>
<div class="bg-gradient"></div>
<div class="bg-grid"></div>
<div class="glow-orb"></div>
<div class="glow-orb-2"></div>
<div class="frame"></div>
<div class="container">
  <div class="icon">${APP_ICON_DATA_URI ? `<img src="${APP_ICON_DATA_URI}" alt="">` : '<div style="width:100%;height:100%;background:rgba(100,180,255,.15)"></div>'}</div>
  <h1>${formatted.main}</h1>
  ${hasSubtitle ? `<div class="subtitle">${formatted.sub}</div>` : ''}
  <div class="brand"><span class="dot"></span><span class="name">simplememofast.com</span></div>
</div>
</body>
</html>`;
}

async function generateImage(browser, title, slug, outputPath) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 630 });

  const html = generateHtml(title, slug);
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // Wait for font loading

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function main() {
  const onlyMissing = process.argv.includes('--missing');
  const onlyIdx = process.argv.indexOf('--only');
  const onlySlug = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

  // Load app icon
  loadAppIcon();

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = getAllHtmlFiles(ROOT_DIR);
  const browser = await chromium.launch();
  let generated = 0;
  let skipped = 0;

  console.log(`Processing ${files.length} pages...`);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const slug = getPageSlug(file);
    const outputPath = path.join(OUTPUT_DIR, `${slug}.png`);

    // Filter by slug if --only specified
    if (onlySlug && slug !== onlySlug) {
      skipped++;
      continue;
    }

    // Skip if image exists and --missing flag
    if (onlyMissing && fs.existsSync(outputPath)) {
      skipped++;
      continue;
    }

    const title = getPageTitle(content);
    await generateImage(browser, title, slug, outputPath);

    // Update HTML to point to new OG image
    const ogImageUrl = `https://simplememofast.com/assets/img/og/${slug}.png`;
    let updatedContent = content;

    // Update og:image
    updatedContent = updatedContent.replace(
      /(<meta\s+property="og:image"\s+content=")[^"]*(")/,
      `$1${ogImageUrl}$2`
    );

    // Update twitter:image
    updatedContent = updatedContent.replace(
      /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,
      `$1${ogImageUrl}$2`
    );

    if (updatedContent !== content) {
      fs.writeFileSync(file, updatedContent);
    }

    console.log(`✓ ${slug} → ${title.substring(0, 50)}`);
    generated++;
  }

  await browser.close();
  console.log(`\n✓ Generated: ${generated}, Skipped: ${skipped}`);
}

main().catch(console.error);
