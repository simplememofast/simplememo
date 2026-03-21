#!/usr/bin/env node
/**
 * Batch OG Image Generator - generates specific OG images (1200x630)
 * Uses same visual style as generate-og-images.js
 *
 * Usage: node scripts/generate-og-batch.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'assets', 'img', 'og');

const IMAGES = [
  { file: 'send-email-to-yourself.png', title: '8 Best Apps to Email Yourself (2026)', icon: '📧' },
  { file: 'blog-captio-shutdown-alternatives.png', title: 'Captio Shut Down? Best Alternatives', icon: '🔄' },
  { file: 'blog-how-to-email-yourself-note-iphone.png', title: 'How to Email Yourself a Note on iPhone', icon: '📱' },
  { file: 'blog-fastest-note-app-iphone-2026.png', title: 'Fastest Note Apps for iPhone 2026', icon: '⚡' },
  { file: 'blog-ios-quick-capture-comparison.png', title: 'iOS Quick Capture Apps Compared', icon: '🎯' },
  { file: 'blog-offline-first-comparison.png', title: 'Offline-First Memo Apps 2026', icon: '✈️' },
  { file: 'blog-inbox-zero-workflow-tips-2026.png', title: 'Inbox Zero Workflow Tips 2026', icon: '📥' },
  { file: 'blog-why-captio-died.png', title: 'Why Captio Died: Developer Story', icon: '📖' },
  { file: 'captio-migration-guide.png', title: 'Captio Migration Guide', icon: '🚀' },
];

function generateHtml(title, icon) {
  const fontSize = title.length > 35 ? '42px' : title.length > 25 ? '48px' : '52px';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1200px;
  height: 630px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #050508 0%, #0a1628 40%, #0d1f3c 70%, #050508 100%);
  font-family: 'Noto Sans JP', -apple-system, sans-serif;
  overflow: hidden;
  position: relative;
}
body::before {
  content: '';
  position: absolute;
  width: 600px;
  height: 600px;
  top: -100px;
  right: -100px;
  background: radial-gradient(circle, rgba(0,150,255,.12) 0, transparent 70%);
  pointer-events: none;
}
body::after {
  content: '';
  position: absolute;
  width: 400px;
  height: 400px;
  bottom: -50px;
  left: -50px;
  background: radial-gradient(circle, rgba(0,229,255,.08) 0, transparent 70%);
  pointer-events: none;
}
.container {
  text-align: center;
  max-width: 900px;
  padding: 60px;
  position: relative;
  z-index: 1;
}
.icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: rgba(100,180,255,.1);
  border: 1px solid rgba(100,180,255,.2);
  margin: 0 auto 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
}
h1 {
  font-size: ${fontSize};
  font-weight: 700;
  color: #ffffff;
  line-height: 1.3;
  margin-bottom: 20px;
  letter-spacing: -0.02em;
}
.brand {
  font-size: 20px;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.05em;
}
.accent {
  color: #6ab4ff;
}
.border-line {
  position: absolute;
  inset: 20px;
  border: 1px solid rgba(100,180,255,.1);
  border-radius: 16px;
  pointer-events: none;
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
<div class="border-line"></div>
<div class="container">
  <div class="icon">${icon}</div>
  <h1>${title}</h1>
  <div class="brand"><span class="accent">Simple Memo</span> — simplememofast.com</div>
</div>
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  let generated = 0;

  console.log(`Generating ${IMAGES.length} OG images...`);

  for (const img of IMAGES) {
    const outputPath = path.join(OUTPUT_DIR, img.file);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1200, height: 630 });

    const html = generateHtml(img.title, img.icon);
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    await page.screenshot({ path: outputPath, type: 'png' });
    await page.close();

    console.log(`  OK  ${img.file}`);
    generated++;
  }

  await browser.close();
  console.log(`\nDone: ${generated} images generated in ${OUTPUT_DIR}`);
}

main().catch(console.error);
