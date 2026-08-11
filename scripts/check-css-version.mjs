#!/usr/bin/env node
/**
 * Keep the stylesheet's cache-busting query in step with its contents.
 *
 *   node scripts/check-css-version.mjs [--write]
 *
 * The version is derived from a hash of the CSS itself, so it cannot be
 * forgotten. It was, once: the QR styles shipped on 2026-08-10 with the query
 * still reading `?v=20260805-read`, so browsers and the CDN kept serving the
 * previous stylesheet. The markup was live and correct while none of its rules
 * applied — the desktop-only rule included, which put a QR in front of mobile
 * readers. Nothing failed; the page just quietly rendered against stale CSS,
 * and this environment cannot fetch the site to notice.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS = 'assets/css/style.min.css';
const write = process.argv.includes('--write');

const hash = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, CSS)))
  .digest('hex')
  .slice(0, 10);

const { collectHtmlFiles, toUrlPath } = createRequire(import.meta.url)('./lib/site-files.js');
const files = collectHtmlFiles(ROOT, {
  skipDirs: ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'growth'],
});

// Any query at all, so a hand-written value is replaced rather than duplicated.
const REF = /(\/assets\/css\/style\.min\.css)(\?v=[^"']*)?/g;

const stale = [];
let fixed = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes(CSS)) continue;

  const want = `/${CSS}?v=${hash}`;
  const updated = html.replace(REF, want);
  if (updated === html) continue;

  if (write) { fs.writeFileSync(file, updated); fixed++; }
  else stale.push(toUrlPath(ROOT, file));
}

if (write) {
  console.log(`css version ${hash}: updated ${fixed} file(s)`);
  process.exit(0);
}

if (stale.length) {
  console.error(
    `FAIL: ${CSS} hashes to ${hash} but ${stale.length} page(s) still request another version.\n`
    + `The stylesheet changed without its cache-busting query changing, so visitors keep the old CSS.\n\n`
    + stale.slice(0, 10).map((p) => `  ${p}`).join('\n')
    + (stale.length > 10 ? `\n  … ${stale.length - 10} more` : '')
    + `\n\nFix:  node scripts/check-css-version.mjs --write\n`
  );
  process.exit(2);
}

console.log(`OK: every page requests style.min.css?v=${hash} (matches file contents)`);
