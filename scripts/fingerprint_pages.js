#!/usr/bin/env node
/**
 * Computed-style fingerprinting harness for no-op refactor verification.
 *
 * For each page, serializes getComputedStyle() of every element (plus
 * ::before/::after) into a text file. Run once before a refactor and once
 * after, then diff the two directories — any visual cascade change shows
 * up as a per-element property diff, independent of screenshots.
 *
 * Determinism: external requests are blocked, CSS animations/transitions
 * are disabled, and .reveal elements are forced visible in both runs.
 *
 * Usage: node scripts/fingerprint_pages.js <outDir> [baseUrl]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const PAGES = [
  '', 'en/', 'zh/', 'zh-Hant/', 'ko/', 'es/', 'pt-BR/', 'id/', 'ar/', 'tr/',
  'guides/', 'guides/gmail/', 'blog/', 'blog/best-memo-apps-2026.html',
  'blog/line-keep-alternative.html', 'vs/', 'vs/notion/', 'vs/apple-notes/',
  'use-cases/', 'methods/', 'methods/gtd/', 'glossary/', 'devlog/',
  'devlog/day1.html', 'faq.html', 'about/', 'obsidian/', 'voice-input/',
  'captio-alternative/', 'note-to-email/', 'captio/', 'how-to/', 'templates/',
  'contact.html', 'terms.html', 'privacy.html', 'legal.html', '404.html',
];

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || 'http://localhost:8899/';
  if (!outDir) { console.error('usage: fingerprint_pages.js <outDir> [baseUrl]'); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  await page.route('**/*', (route) => {
    route.request().url().startsWith(base.replace(/\/$/, ''))
      ? route.continue()
      : route.abort();
  });

  for (const p of PAGES) {
    const name = (p || 'home').replace(/[\/.]+/g, '_');
    try {
      await page.goto(base + p, { waitUntil: 'load', timeout: 20000 });
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('visible')));
      await page.waitForTimeout(120);
      const fp = await page.evaluate(() => {
        const lines = [];
        document.querySelectorAll('*').forEach((el, i) => {
          const id = `${i}|${el.tagName}|${(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || ''}`;
          for (const pseudo of [null, '::before', '::after']) {
            const cs = getComputedStyle(el, pseudo);
            const body = Array.from(cs).map((prop) => `${prop}:${cs.getPropertyValue(prop)}`).join(';');
            lines.push(`${id}|${pseudo || 'self'}|${body}`);
          }
        });
        return lines.join('\n');
      });
      fs.writeFileSync(path.join(outDir, name + '.txt'), fp);
      console.log('ok', p || '/');
    } catch (e) {
      console.log('FAIL', p, e.message.split('\n')[0]);
    }
  }
  await browser.close();
}

main();
