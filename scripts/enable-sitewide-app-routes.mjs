#!/usr/bin/env node
// Keep the existing tracker tags on the current tracker hash and keep the retired sitewide OneLink opt-in
// (data-sitewide-app-routes, read by js/app-store-tracking.js) off every page. Never add tracking to a new page or
// alter static anchors, QR images, native banners or other assets.
//
// 2026-11-17 owner decision: the app drops the AppsFlyer SDK in its next version, so the site stops sending
// App Store links through AppsFlyer OneLink (website_bridge_v1 and the nine-hero pilot). The opt-in is removed from
// every page, including the pages open experiments own (the owner approved changing those too; the concurrent change
// is recorded in each experiment's notes in growth/experiments/experiments.json). Generated translations copy the
// tag from their source page (scripts/build_site_translations.py), so they follow without a list.
// The tracker still reads the attribute and keeps its OneLink branches; with no page opting in they never run.
// Removing them changes every page's ?v= and is a separate change (growth/ONELINK_PILOT.md 「終了の決定」).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { collectHtmlFiles } = createRequire(import.meta.url)('./lib/site-files.js');
const TRACKER_SRC = /\bsrc\s*=\s*(["'])\/js\/app-store-tracking\.js(?:\?v=[^"'<>]*)?\1/i;
const OPT_IN_ATTR = /\sdata-sitewide-app-routes(?=[\s=>])(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;

/** Refresh the tracker hash and drop every spelling of the opt-in. Comments and inline-script strings stay. */
export function disableSitewideAppRoutes(html, version) {
  if (!/^[a-f0-9]{10}$/.test(version)) throw new Error('Expected the tracker SHA-256 prefix');
  // Consume complete script elements so script-like strings in inline code are
  // not treated as real tracker tags. Preserve comments and every other byte.
  return html.replace(/<!--[\s\S]*?-->|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>/gi, element => {
    if (element.startsWith('<!--')) return element;
    const tag = /^<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(element)[0];
    if (!TRACKER_SRC.test(tag)) return element;
    const updated = tag.replace(TRACKER_SRC, `src="/js/app-store-tracking.js?v=${version}"`).replace(OPT_IN_ATTR, '');
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
    const after = disableSitewideAppRoutes(before, version);
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
