#!/usr/bin/env node
/**
 * Add `lang` attributes to dual-DOM language blocks.
 *
 * Most pages on this site ship both languages in one document and hide the
 * inactive one with `[data-lang="en"]{display:none}`. That works for humans
 * and for Google (its renderer applies the CSS and only indexes the visible
 * half), but the *raw* HTML tells a different story: on a typical JA page
 * roughly 60-66% of the text nodes are the hidden English copy, and the only
 * language declaration in the document is `<html lang="ja">`.
 *
 * Anything that reads the HTML without applying CSS — AI crawlers (GPTBot,
 * ClaudeBot, PerplexityBot, …), reader-mode extractors, translation tooling —
 * therefore ingests an interleaved JA/EN document labelled entirely Japanese.
 *
 * `lang` on the individual blocks fixes that at the source: it is the standard
 * way to mark a change of language mid-document (HTML "language of parts",
 * also WCAG 3.1.2, which this markup currently fails — screen readers
 * pronounce the English half with a Japanese voice), it costs nothing
 * visually, and it changes no behaviour: /js/lang.js keys off `data-lang` and
 * the `.active` class, never off `lang`.
 *
 * The proper long-term fix is a real /en/ URL per page, which strip_dual_dom.py
 * performs for pages that have an English counterpart. This script covers the
 * pages that do not yet have one.
 *
 * Idempotent: elements that already carry a `lang` attribute are left alone.
 * Occurrences inside <style> and <script> (the CSS selectors that drive the
 * toggle) are skipped.
 *
 * Usage: node scripts/annotate-lang-parts.js [--check]
 *   --check  report what would change and exit 1 if anything would, without
 *            writing. Intended for CI.
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles } = require('./lib/site-files');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin'];

// <tag ... data-lang="ja|en" ...>  — `data-lang-btn` does not match because
// the attribute name is followed by `="`.
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const DATA_LANG = /\sdata-lang\s*=\s*"(ja|en)"/;
const HAS_LANG = /\slang\s*=\s*"/;

function htmlFiles(dir) {
  // No skipFiles: unlike the other scripts this one deliberately annotates
  // 404.html too. tolerateReadErrors: false keeps its fail-loud behaviour.
  return collectHtmlFiles(dir, { skipDirs: SKIP_DIRS, tolerateReadErrors: false });
}

/** Byte ranges of <style>/<script> bodies, which must not be rewritten. */
function inertRanges(src) {
  const ranges = [];
  for (const m of src.matchAll(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi)) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function annotate(src) {
  const inert = inertRanges(src);
  const isInert = (i) => inert.some(([a, b]) => i >= a && i < b);

  const edits = [];
  OPEN_TAG.lastIndex = 0;
  let m;
  while ((m = OPEN_TAG.exec(src))) {
    if (isInert(m.index)) continue;
    const attrs = m[2];
    const lang = attrs.match(DATA_LANG);
    if (!lang || HAS_LANG.test(attrs)) continue;
    // Insert immediately after the tag name so the pair reads together.
    edits.push({ at: m.index + 1 + m[1].length, text: ` lang="${lang[1]}"` });
  }

  let out = src;
  for (let i = edits.length - 1; i >= 0; i--) {
    out = out.slice(0, edits[i].at) + edits[i].text + out.slice(edits[i].at);
  }
  return { out, count: edits.length };
}

function main() {
  const check = process.argv.includes('--check');
  let files = 0;
  let attrs = 0;

  for (const file of htmlFiles(ROOT_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    const { out, count } = annotate(src);
    if (!count) continue;
    files++;
    attrs += count;
    if (!check) fs.writeFileSync(file, out);
    console.log(`${check ? '!' : '✓'} ${path.relative(ROOT_DIR, file)} → +${count} lang attrs`);
  }

  console.log(
    check
      ? `\n${files} file(s) / ${attrs} element(s) missing a lang attribute`
      : `\n✓ ${files} file(s) annotated, ${attrs} lang attribute(s) added`
  );
  if (check && files) process.exit(1);
}

main();
