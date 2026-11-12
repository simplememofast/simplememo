// Homepage cache contract, checked before merge (SEO Validation, seo-core).
//
// Why this runs here and not against a preview:
// - Cache policies are a one-way door. HTML or an error page served with a long
//   or immutable policy can stay in visitors' browsers for up to a year, and no
//   later deploy can take it back.
// - Pages previews sit behind Cloudflare Access since 2026-10-20, and CI holds no
//   credentials for them (decided 2026-11-12). The old preview fetch in
//   home-perf-cache.yml could only fail at the Access login, and it never gated
//   auto-merge (auto-merge waits for SEO Validation only).
// - So the pre-merge check is deterministic and offline: the _headers rules, the
//   Functions that may set Cache-Control, and the home-perf middleware's own unit
//   tests. The real edge is measured after deployment by
//   .github/workflows/home-perf-cache.yml (daily and on main pushes).
//
// The checks are deliberately conservative. A rule shape this file does not model
// fails instead of passing silently; extend the model first.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The home-perf middleware and production-workflow tests live next to the code
// they cover. Importing them registers their tests in this run.
import './perf/cache_headers.test.mjs';
import './perf/cache_headers_navigation.test.mjs';
import './perf/cache_headers_revalidation.test.mjs';
import './perf/cache_headers_workflow.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REVALIDATE = 'public, no-cache';

/** Parse Cloudflare Pages `_headers` into ordered rules. */
export function parseHeaders(text) {
  const rules = [];
  let current = null;
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    const at = `_headers:${index + 1}`;
    if (!trimmed || trimmed.startsWith('#')) return;
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/')) throw new Error(`${at}: only absolute-path rules are modelled; extend scripts/cache-contract.test.mjs first`);
      if (/:[A-Za-z_]/.test(line)) throw new Error(`${at}: placeholder rules are not modelled; extend scripts/cache-contract.test.mjs first`);
      current = { pattern: trimmed, line: index + 1, headers: [] };
      rules.push(current);
      return;
    }
    if (!current) throw new Error(`${at}: header line before any rule`);
    const detach = trimmed.match(/^!\s*([A-Za-z0-9-]+)$/);
    if (detach) {
      current.headers.push({ name: detach[1].toLowerCase(), detach: true, line: index + 1 });
      return;
    }
    const header = trimmed.match(/^([A-Za-z0-9-]+)\s*:\s*(.*)$/);
    if (!header) throw new Error(`${at}: unreadable header line`);
    current.headers.push({ name: header[1].toLowerCase(), value: header[2].trim(), line: index + 1 });
  });
  return rules;
}

/** Pages splat matching: `*` matches any run of characters, including `/`. */
export function matches(pattern, urlPath) {
  const source = pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + source + '$').test(urlPath);
}

/**
 * Every Cache-Control value that the matching rules contribute, in file order.
 * A `! Cache-Control` line drops what earlier rules set. Whether Pages joins or
 * overrides duplicates does not matter here: HTML must receive exactly one value.
 */
export function cacheControl(rules, urlPath) {
  let values = [];
  for (const rule of rules) {
    if (!matches(rule.pattern, urlPath)) continue;
    for (const header of rule.headers) {
      if (header.name !== 'cache-control') continue;
      if (header.detach) values = [];
      else values.push({ value: header.value, line: header.line, pattern: rule.pattern });
    }
  }
  return values;
}

/** True when a policy would let a browser keep the response without asking for a day or more. */
export function longLived(value) {
  const maxAge = value.match(/(?:^|,)\s*(?:s-)?max-age\s*=\s*(\d+)/i);
  return /\bimmutable\b/i.test(value) || (maxAge !== null && Number(maxAge[1]) > 86400);
}

// Rules that may carry long or immutable policies: fingerprinted or versioned
// static files only. HTML never matches these patterns.
const ASSET_PATTERN = /^\/assets\/|^\/\*\.(?:css|js|woff2?|avif|webp|png|jpe?g|gif|svg|ico)$/;

// Representative document paths, including language roots and missing pages
// (Pages answers those with 404.html under the requested path's rules).
const DOCUMENTS = ['/', '/index.html', '/en/', '/en/index.html', '/obsidian/', '/en/obsidian/',
  '/no-such-page-000000', '/no-such-page-000000/', '/en/no-such-page-000000/',
  '/no-such-page-000000.html', '/404.html'];

const headersText = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
const rules = parseHeaders(headersText);

test('_headers: documents and error pages receive exactly one revalidating policy', () => {
  for (const doc of DOCUMENTS) {
    const values = cacheControl(rules, doc);
    assert.deepEqual(values.map(v => v.value), [REVALIDATE],
      `${doc}: expected only "${REVALIDATE}", got ${JSON.stringify(values)}`);
  }
});

test('_headers: long or immutable policies only on static asset patterns', () => {
  for (const rule of rules) {
    for (const header of rule.headers) {
      if (header.name !== 'cache-control' || header.detach || !longLived(header.value)) continue;
      assert.match(rule.pattern, ASSET_PATTERN,
        `_headers:${header.line}: "${header.value}" on ${rule.pattern} could reach HTML; keep long policies on /assets/* or static file extensions`);
      for (const doc of DOCUMENTS) assert.equal(matches(rule.pattern, doc), false, `${rule.pattern} matches ${doc}`);
    }
  }
});

test('Functions: only the home-perf middleware may set long or immutable policies', () => {
  const allowed = new Set(['functions/assets/home-perf/_middleware.js']);
  const offenders = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(?:m?js|ts)$/.test(entry.name) && !allowed.has(rel)) {
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const longAge = [...text.matchAll(/max-age\s*=\s*(\d+)/gi)].some(m => Number(m[1]) > 86400);
        if (/\bimmutable\b/i.test(text) || longAge) offenders.push(rel);
      }
    }
  };
  walk('functions');
  assert.deepEqual(offenders, [],
    'Long-lived caching outside functions/assets/home-perf/_middleware.js. Put asset policies in that middleware (its unit tests run here), or extend this check with the reason.');
});

test('model self-test: the checks fail on the mistakes they exist for', () => {
  const broken = [
    // A language-wide long policy reaching HTML.
    headersText + '\n/en/*\n  Cache-Control: public, max-age=31536000, immutable\n',
    // A second policy on every document (malformed when joined).
    headersText + '\n/*\n  Cache-Control: public, max-age=3600\n',
    // The site-wide revalidation rule dropped.
    headersText.replace(/^(\s*)Cache-Control: public, no-cache$/m, '$1X-Removed: yes'),
  ];
  for (const text of broken) {
    const parsed = parseHeaders(text);
    const bad = DOCUMENTS.some(doc => JSON.stringify(cacheControl(parsed, doc).map(v => v.value)) !== JSON.stringify([REVALIDATE]));
    assert.ok(bad, 'a broken _headers variant passed the document check');
  }
  assert.ok(longLived('public, max-age=31536000, immutable'));
  assert.ok(longLived('public, max-age=604800'));
  assert.ok(!longLived('public, max-age=3600'));
  assert.ok(!longLived(REVALIDATE));
  assert.ok(!longLived('private, no-store'));
  assert.throws(() => parseHeaders('https://example.com/*\n  Cache-Control: public\n'));
  assert.throws(() => parseHeaders('/blog/:slug\n  Cache-Control: public\n'));
  assert.ok(matches('/*', '/') && matches('/*.css', '/a/b.css') && !matches('/assets/*', '/en/'));
});
