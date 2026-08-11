#!/usr/bin/env node
/**
 * Keep competitor speed figures in step with the measurement they came from.
 *
 *   node scripts/check-benchmark.mjs [--all]
 *
 * The site published four different competitor speed tables. On 2026-08-11 an
 * English comparison page listed Apple Notes at 0.4-0.5s, Drafts at 0.6-0.7s
 * and Google Keep at 0.7-0.8s — every rival faster than our own app — and then
 * called our app "the fastest of the bunch" two lines below. That page has been
 * fixed, but it was a symptom: nothing on this site connected a number in prose
 * to the run it supposedly came from, so any page could drift on its own and
 * no check would notice.
 *
 * `data/benchmark.json` is now that connection. This script finds competitor
 * speed claims in prose and compares them to it.
 *
 * **It does not enforce, and it must not.** Three other pages publish their own
 * measured tables, and this environment has no iPhone — deciding which run is
 * correct by editing files would be manufacturing agreement, which is the
 * failure being fixed, not the fix. So conflicts are reported, the pages
 * carrying their own runs are listed as known exceptions, and a real
 * measurement session resolves them. `--all` includes those pages.
 *
 * Two buckets, because precision and recall pull against each other here:
 *   CONFLICTS  — a rival's name and a figure that matches no measured value
 *   AMBIGUOUS  — a ~1s figure beside a rival's name. Almost always our own
 *                number one table cell away, but not always: this bucket is
 *                where "Bear 〜1秒" against a measured 1.8s turned up, so it
 *                is printed rather than filtered.
 *
 * Excluded outright: a match containing our own product name (the figure is
 * ours), and a range that CONTAINS the measured value ("Notion takes 3-5
 * seconds" holds 3.8) — loose, but not wrong.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/benchmark.json'), 'utf8'));
const includeOwnRuns = process.argv.includes('--all');

/** Pages that publish their own measurement run; their numbers are theirs. */
const OWN_RUN_PAGES = new Set(
  B.otherPublishedRuns.map((r) => r.page.replace(/^\//, '') + (r.page.endsWith('/') ? 'index.html' : '.html'))
    .concat([B.canonicalPage.replace(/^\//, '') + '.html'])
);

const RIVALS = Object.entries(B.apps)
  .filter(([name]) => !name.startsWith('Simple Memo'))
  .map(([name, v]) => ({ name, ...v }));

const { collectHtmlFiles, toUrlPath } = createRequire(import.meta.url)('./lib/site-files.js');
const files = collectHtmlFiles(ROOT, {
  skipDirs: ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'growth'],
});

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');

/** Our own product, under every name it is written by. */
const OURS = /Obsidian連携シンプルメモ|Captio式シンプルメモ|シンプルメモ|Simple ?Memo|SimpleMemoFast/i;

/** A claim is only a conflict if no stated value is near a measured one. */
const NEAR = 0.35;

function conflicts(app, values) {
  return !values.some((v) => Math.abs(v - app.launch) < NEAR || Math.abs(v - app.ready) < NEAR);
}

const findings = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const ownRun = OWN_RUN_PAGES.has(rel);
  if (ownRun && !includeOwnRuns) continue;

  const text = strip(fs.readFileSync(file, 'utf8'));
  for (const app of RIVALS) {
    // Rival name, then within a short span a figure with a seconds unit.
    const re = new RegExp(
      `${app.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^.。<]{0,70}?` +
      `(\\d+\\.?\\d*)\\s*(?:[-–~〜]\\s*(\\d+\\.?\\d*)\\s*)?(?:seconds?|秒)`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      // Our own figure sitting near a rival's name is ours, not theirs. In a
      // comparison table "Notion … → Obsidian連携シンプルメモ（約1秒" the 1s
      // belongs to us; without this the report is mostly false positives and
      // stops being read.
      if (OURS.test(m[0])) continue;
      const values = [Number(m[1])].concat(m[2] ? [Number(m[2])] : []);
      // "about 1 second" / 「約1秒」 is our own published figure and no rival
      // measures anywhere near it, so a lone ~1s beside a rival's name is ours
      // with our name just outside the window — a table cell away, or the far
      // side of "faster than Notion and Evernote". Attributing it to the rival
      // produced most of what was left after the name check.
      const OUR_FIGURE = B.apps['Simple Memo - for Obsidian'].ready;
      const looksLikeOurs = values.every((v) => Math.abs(v - OUR_FIGURE) < NEAR)
        && Math.abs(app.launch - OUR_FIGURE) >= NEAR;
      // A range that straddles the measured value is loose, not wrong.
      if (values.length === 2 && values[0] <= app.launch && app.launch <= values[1]) continue;
      if (values.length === 2 && values[0] <= app.ready && app.ready <= values[1]) continue;
      if (!conflicts(app, values)) continue;
      findings.push({
        page: toUrlPath(ROOT, file), rel, ownRun, app: app.name,
        said: m[0].trim().slice(0, 64),
        measured: `${app.launch}s launch / ${app.ready}s ready`,
        // Bucketed rather than dropped. Skipping these hid a real
        // "Bear 〜1秒" against a measured 1.8s, and a consistency checker
        // that silently swallows conflicts is worse than a noisy one.
        ambiguous: looksLikeOurs,
      });
    }
  }
}

if (!findings.length) {
  console.log(`OK: no competitor speed figure conflicts with data/benchmark.json`
    + (includeOwnRuns ? '' : ` (${OWN_RUN_PAGES.size} page(s) with their own runs excluded; --all to include)`));
  process.exit(0);
}

function report(list, heading) {
  if (!list.length) return;
  const byPage = new Map();
  for (const f of list) {
    if (!byPage.has(f.rel)) byPage.set(f.rel, []);
    byPage.get(f.rel).push(f);
  }
  console.log(`${heading} — ${list.length} figure(s) across ${byPage.size} page(s):\n`);
  for (const [rel, items] of [...byPage].sort()) {
    console.log(`  ${rel}${items[0].ownRun ? '   [publishes its own run]' : ''}`);
    for (const f of items) console.log(`      "${f.said}"  —  ${f.app} measured ${f.measured}`);
  }
  console.log();
}

report(findings.filter((f) => !f.ambiguous), 'CONFLICTS');
report(findings.filter((f) => f.ambiguous),
  'AMBIGUOUS (a ~1s figure beside a rival name — usually our own number one cell away, but check)');
console.log(`\nThis is a report, not a gate. Resolving it needs a measurement run, not an edit:`);
console.log(`  ${B.methodologyPage} documents the protocol. Update data/benchmark.json from the run, then these pages.`);
// Report-only on purpose: see the header. Exit 0 so CI surfaces this without
// blocking unrelated work on a question only a device can answer.
process.exit(0);
