#!/usr/bin/env node
/**
 * Wire App Store CTAs to their Custom Product Page (CPP) via ppid=.
 *
 *   node scripts/apply-cpp-ppid.js --check   # CI: exit 1 if hrefs drift from data/cpp-map.json
 *   node scripts/apply-cpp-ppid.js --write   # apply the map to the hrefs
 *
 * The problem this solves: 34 CPPs exist in App Store Connect and none were
 * reachable from the site, so every visitor landed on the default product page
 * (CVR 2.45%). The one CPP that ever got traffic — mail-to-self — converted at
 * 5.42%, and beyond conversion the ppid is what lets ASC answer "which page
 * produced which installs" per product-page variant. The CTAs already carry
 * pt= and ct=<page>__<placement>; this script adds only the missing ppid.
 *
 * Single source of truth is data/cpp-map.json:
 *   - a page matching a map entry with a UUID ppid → every own CTA on it
 *     carries exactly that ppid
 *   - ppid null in the map = owner has not supplied the UUID yet (TODO).
 *     Nothing is written, and --check reports it as a notice, not a failure
 *   - a page outside the map (or mapped with null) must carry no ppid at all —
 *     the default product page is the control group for CPP CVR comparisons,
 *     so unmapped pages must stay unwired
 *
 * What is deliberately NOT touched: pt=, ct= (both value and placement
 * suffix), mt=, data-cta-* attributes, reference links (own-app links without
 * a ct= token), and competitor App Store links. tag-cta-placements.js owns
 * placement; this script owns ppid; they compose because they edit disjoint
 * parts of the same anchors.
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tools', 'growth'];
const MAP_FILE = path.join(ROOT_DIR, 'data/cpp-map.json');

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const CHECK = args.has('--check');
if (!WRITE && !CHECK) {
  console.error('usage: apply-cpp-ppid.js --check | --write');
  process.exit(2);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same anchor conventions as tag-cta-placements.js — see the comments there. */
const PARAM_CT = /(?:[?&]|&amp;)ct=/;
const PARAM_PPID = /((?:[?&]|&amp;)ppid=)([^"&]*)/;

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const malformed = [];
for (const cpp of map.cpps) {
  if (cpp.ppid != null && !UUID_RE.test(cpp.ppid)) {
    malformed.push(`${cpp.id}: ppid "${cpp.ppid}" is not a UUID — copy it from the CPP URL in App Store Connect`);
  }
}
if (malformed.length) {
  // A malformed map must fail even in --check: shipping a token Apple ignores
  // would silently send every click back to the default product page while
  // the ledger says the page is wired.
  malformed.forEach((m) => console.error(`  ${m}`));
  console.error('FAIL: data/cpp-map.json is malformed.');
  process.exit(1);
}

/** First matching map entry wins; the current patterns are disjoint anyway. */
function cppFor(urlPath) {
  for (const cpp of map.cpps) {
    if (cpp.match.some((re) => new RegExp(re).test(urlPath))) return cpp;
  }
  return null;
}

/**
 * Set, replace or remove the ppid param on one own-CTA anchor tag.
 * `want` is a UUID string or null (null = the param must be absent).
 */
function applyPpid(tag, want) {
  const has = tag.match(PARAM_PPID);
  if (want == null) {
    if (!has) return tag;
    // Drop the param and its separator; if ppid was first (`?ppid=X&…`), the
    // following separator is promoted to `?` so the query stays well-formed.
    return tag
      .replace(/\?ppid=[^"&]*(?:&amp;|&)/, '?')
      .replace(/\?ppid=[^"&]*(?=")/, '?')
      .replace(/(?:&amp;|&)ppid=[^"&]*/, '')
      .replace(/\?(?=")/, '');
  }
  if (has) return tag.replace(PARAM_PPID, `$1${want}`);
  // Insert as the first query param, matching the shape App Store Connect's
  // own campaign-link generator produces for CPP links.
  return tag.replace(/(apps\.apple\.com\/[^"?]*\?)/, `$1ppid=${want}&amp;`);
}

const problems = [];
let touched = 0;
let filesChanged = 0;
let wiredPages = 0;
const pendingByCpp = new Map(); // cpp id → page count waiting on a UUID

for (const file of collectHtmlFiles(ROOT_DIR, { skipDirs: SKIP_DIRS, skipFiles: ['404.html'] })) {
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;
  const rel = path.relative(ROOT_DIR, file);
  const urlPath = toUrlPath(ROOT_DIR, file);
  const cpp = cppFor(urlPath);
  const want = cpp && cpp.ppid ? cpp.ppid : null;
  if (cpp && !cpp.ppid) pendingByCpp.set(cpp.id, (pendingByCpp.get(cpp.id) || 0) + 1);

  const anchors = [];
  for (const m of html.matchAll(/<a\b[^>]*href="[^"]*apps\.apple\.com[^"]*"[^>]*>/gi)) {
    // Own app + carries a campaign token = a CTA we measure. Everything else
    // (competitor store links, inline reference links) is editorial and must
    // never gain a ppid.
    if (/id6758438948/.test(m[0]) && PARAM_CT.test(m[0])) {
      anchors.push({ tag: m[0], index: m.index });
    }
  }
  if (!anchors.length) continue;

  for (const a of [...anchors].reverse()) {
    const next = applyPpid(a.tag, want);
    if (next === a.tag) continue;
    touched++;
    if (WRITE) {
      html = html.slice(0, a.index) + next + html.slice(a.index + a.tag.length);
    } else {
      const cur = (a.tag.match(PARAM_PPID) || [])[2];
      problems.push(want == null
        ? `${rel}: CTA carries ppid=${cur} but the page is not wired in data/cpp-map.json — run --write to remove it`
        : `${rel}: CTA ppid is ${cur ? `"${cur}"` : 'missing'}, map says ${want} (${cpp.id}) — run --write`);
    }
  }
  if (want != null) wiredPages++;

  if (WRITE && html !== orig) {
    fs.writeFileSync(file, html);
    filesChanged++;
  }
}

if (pendingByCpp.size) {
  const total = [...pendingByCpp.values()].reduce((a, b) => a + b, 0);
  console.log(`  note: ${total} page(s) across ${pendingByCpp.size} CPP(s) are mapped but waiting on a ppid UUID (TODO — owner input):`);
  for (const [id, n] of pendingByCpp) console.log(`    ${id}: ${n} page(s)`);
}

if (WRITE) {
  console.log(`done: ${touched} CTA(s) updated across ${filesChanged} file(s); ${wiredPages} page(s) fully wired`);
  process.exit(0);
}
problems.forEach((p) => console.log(`  ${p}`));
if (problems.length) {
  console.error(`FAIL: ${problems.length} CTA(s) drift from data/cpp-map.json — node scripts/apply-cpp-ppid.js --write`);
  process.exit(1);
}
console.log(`OK: CTAs match data/cpp-map.json (${wiredPages} page(s) wired with a ppid)`);
