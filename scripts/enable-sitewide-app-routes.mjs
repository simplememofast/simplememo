#!/usr/bin/env node
// Keep the existing tracker tags on the current tracker hash and decide where the sitewide OneLink opt-in
// (data-sitewide-app-routes="true", js/app-store-tracking.js) stays. Never add tracking to a new page or alter
// static anchors, QR images, native banners, pilot/QA links or other assets.
//
// 2026-11-17 owner decision: the app drops the AppsFlyer SDK in its next version, so the site stops sending
// App Store links through AppsFlyer OneLink (website_bridge_v1). The opt-in is removed from every page except the
// ones below: an open exclusive experiment still owns them (growth/lib/experiment-overlap.mjs ownershipConflict),
// so their tracker tag is left as it was until that experiment is decided. Their generated translations follow
// the source page (scripts/build_site_translations.py copies the tag), so they stay too.
// When an experiment here is decided, delete its rows and run this with --write in the same PR. The rows are not
// checked against the experiment's state on purpose: a closed experiment must not turn every PR red overnight.
// Removing the last row is not the end of the work: the tracker's sitewide code and the nine hero pilot links
// (growth/ONELINK_PILOT.md 「終了の決定」) go in their own change.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files.js');
const { generatedSourceFileOf } = require('./lib/localized-sources.js');
const TRACKER_SRC = /\bsrc\s*=\s*(["'])\/js\/app-store-tracking\.js(?:\?v=[^"'<>]*)?\1/i;
const OPT_IN_ATTR = /\sdata-sitewide-app-routes(?=[\s=>])(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi;

/** Source page → the open experiment(s) that still own it (as of 2026-11-17). */
export const OPT_IN_HELD = Object.freeze({
  'index.html': 'video-2026-08-11-five-clips, title-2026-08-20-home-grammar',
  'ai-tags/index.html': 'video-2026-08-11-five-clips',
  'apple-watch/index.html': 'video-2026-08-11-five-clips',
  'obsidian/index.html': 'video-2026-08-11-five-clips',
  'siri/index.html': 'video-2026-08-11-five-clips',
  'blog/business-memo-apps-2026.html': 'aio-2026-08-12-entity-attribution',
  'blog/memo-app-hikaku-matome.html': 'aio-2026-08-12-entity-attribution',
  'en/blog/best-memo-apps-2026.html': 'aio-2026-08-12-entity-attribution',
  'en/blog/offline-first-comparison.html': 'aio-2026-08-12-entity-attribution',
  'en/blog/ios-quick-capture-comparison.html': 'en-2026-08-11-native-rewrite',
  'en/iphone-shortcuts-email-guide/index.html': 'en-2026-08-11-native-rewrite',
  'en/vs/google-keep-vs-apple-notes/index.html': 'en-2026-08-11-native-rewrite',
  'methods/second-brain/index.html': 'title-2026-11-11-second-brain-term',
});

/** A held source page, or a generated translation whose source page is held. */
export function optInHeld(rel) {
  if (Object.hasOwn(OPT_IN_HELD, rel)) return true;
  const source = generatedSourceFileOf(toUrlPath('/', '/' + rel));
  return source !== null && Object.hasOwn(OPT_IN_HELD, source);
}

/** Refresh the tracker hash and set the opt-in on (optIn) or off. Comments and inline-script strings stay. */
export function setSitewideAppRoutes(html, version, optIn) {
  if (!/^[a-f0-9]{10}$/.test(version)) throw new Error('Expected the tracker SHA-256 prefix');
  // Consume complete script elements so script-like strings in inline code are
  // not treated as real tracker tags. Preserve comments and every other byte.
  return html.replace(/<!--[\s\S]*?-->|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>/gi, element => {
    if (element.startsWith('<!--')) return element;
    const tag = /^<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(element)[0];
    if (!TRACKER_SRC.test(tag)) return element;
    let updated = tag.replace(TRACKER_SRC, `src="/js/app-store-tracking.js?v=${version}"`);
    updated = updated.replace(OPT_IN_ATTR, '');
    if (optIn) updated = updated.replace(/>$/, ' data-sitewide-app-routes="true">');
    return updated + element.slice(tag.length);
  });
}

export function enableSitewideAppRoutes(html, version) {
  return setSitewideAppRoutes(html, version, true);
}

export function updateExistingTrackerPages(root, { write = false, held = optInHeld } = {}) {
  const version = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'js/app-store-tracking.js')))
    .digest('hex').slice(0, 10);
  const files = collectHtmlFiles(root, {
    skipDirs: ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'growth'],
    tolerateReadErrors: false,
  });
  const changed = [];
  const optedIn = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    const before = fs.readFileSync(file, 'utf8');
    const optIn = held(rel);
    const after = setSitewideAppRoutes(before, version, optIn);
    if (optIn && after !== setSitewideAppRoutes(before, version, false)) optedIn.push(rel);
    if (before === after) continue;
    changed.push(rel);
    if (write) fs.writeFileSync(file, after);
  }
  return { tracker_version: version, changed_pages: changed.length, paths: changed,
    opt_in_held_pages: optedIn.length, write };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const unknown = process.argv.slice(2).filter(arg => arg !== '--write');
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  console.log(JSON.stringify(updateExistingTrackerPages(ROOT, { write: process.argv.includes('--write') }), null, 2));
}
