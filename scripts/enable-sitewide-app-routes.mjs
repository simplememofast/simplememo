#!/usr/bin/env node
// Opt in existing tracker consumers only. Never add tracking to a new page or
// alter static anchors, QR images, native banners, pilot/QA links or other assets.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { collectHtmlFiles } = createRequire(import.meta.url)('./lib/site-files.js');
const TRACKER_SRC = /\bsrc\s*=\s*(["'])\/js\/app-store-tracking\.js(?:\?v=[^"'<>]*)?\1/i;

export function enableSitewideAppRoutes(html, version) {
  if (!/^[a-f0-9]{10}$/.test(version)) throw new Error('Expected the tracker SHA-256 prefix');
  // Consume complete script elements so script-like strings in inline code are
  // not treated as real tracker tags. Preserve comments and every other byte.
  return html.replace(/<!--[\s\S]*?-->|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>/gi, element => {
    if (element.startsWith('<!--')) return element;
    const tag = /^<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(element)[0];
    if (!TRACKER_SRC.test(tag)) return element;
    let updated = tag.replace(TRACKER_SRC, `src="/js/app-store-tracking.js?v=${version}"`);
    updated = updated.replace(/\sdata-sitewide-app-routes(?=[\s=>])(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
    updated = updated.replace(/>$/, ' data-sitewide-app-routes="true">');
    return updated + element.slice(tag.length);
  });
}

export function updateExistingTrackerPages(root, { write = false } = {}) {
  const version = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'js/app-store-tracking.js')))
    .digest('hex').slice(0, 10);
  const files = collectHtmlFiles(root, {
    skipDirs: ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'growth'],
    tolerateReadErrors: false,
  });
  const changed = [];
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = enableSitewideAppRoutes(before, version);
    if (before === after) continue;
    changed.push(path.relative(root, file).split(path.sep).join('/'));
    if (write) fs.writeFileSync(file, after);
  }
  return { tracker_version: version, changed_pages: changed.length, paths: changed, write };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unknown = process.argv.slice(2).filter(arg => arg !== '--write');
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  console.log(JSON.stringify(updateExistingTrackerPages(ROOT, { write: process.argv.includes('--write') }), null, 2));
}
