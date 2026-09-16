// Owner-supplied 87-row GSC sample plus independently reproduced edge cases.
// These are URL/delivery regressions, not assertions about Google's index.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEdgeMiddleware, edgeResult } from './lib/edge-middleware.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://simplememofast.com';
const middleware = await loadEdgeMiddleware(ROOT);
const edge = (url) => edgeResult(middleware, new URL(url, ORIGIN).href, ORIGIN);
const { cases } = JSON.parse(readFileSync(path.join(ROOT,
  'docs/seo/gsc-redirect-cases-2026-09-16.json'), 'utf8'));
const sitemap = ['sitemap-ja.xml', 'sitemap-en.xml']
  .map(f => readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
}
function verifyDocument(target) {
  const u = new URL(target, ORIGIN);
  assert.equal(u.origin, ORIGIN);
  const filename = u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname + '.html';
  const full = path.join(ROOT, filename.slice(1));
  assert.ok(statSync(full).isFile(), `${target}: no directly served document`);
  const html = readFileSync(full, 'utf8');
  const canonicals = (html.match(/<link\b[^>]*>/gi) || [])
    .filter(tag => attribute(tag, 'rel')?.toLowerCase() === 'canonical')
    .map(tag => attribute(tag, 'href'));
  assert.deepEqual(canonicals, [ORIGIN + u.pathname], `${target}: canonical`);
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (/^(robots|googlebot)$/i.test(attribute(tag, 'name') || '')) {
      assert.doesNotMatch(attribute(tag, 'content') || '', /\b(noindex|none)\b/i);
    }
  }
  assert.ok(sitemap.includes(`<loc>${ORIGIN}${u.pathname}</loc>`), `${target}: absent from sitemap`);
}
async function redirect(from, to) {
  assert.deepEqual(await edge(from), { kind: 'redirect', status: 301, to });
  assert.deepEqual(await edge(to), { kind: 'pass' }, `${to}: middleware redirects again`);
  verifyDocument(to); // pass-through alone can still mean a Pages 308 or 404.
}

test('the 87 original rows remain distinct and have live canonical destinations', async t => {
  assert.equal(cases.length, 87);
  assert.equal(new Set(cases.map(c => c.from)).size, 87);
  assert.equal(new Set(cases.map(c => c.to)).size, 57);
  for (const c of cases) await t.test(`row ${c.row}: ${c.from}`, async () => {
    const u = new URL(c.from);
    assert.ok(['http:', 'https:'].includes(u.protocol));
    assert.ok(['simplememofast.com', 'www.simplememofast.com'].includes(u.hostname));
    assert.equal(c.status, c.from === c.to ? 200 : 301);
    // HTTPS upgrade belongs to Cloudflare configuration, not this module.
    // The live Python audit tests the unmodified HTTP originals separately.
    u.protocol = 'https:';
    if (u.href === c.to) assert.deepEqual(await edge(u.href), { kind: 'pass' });
    else await redirect(u.href, new URL(c.to).pathname);
    verifyDocument(c.to);
  });
});

test('English alias and query/host cleanup are a single redirect', async () => {
  for (const from of ['/en', '/en?lang=en', '/en?lang=ja',
    'https://www.simplememofast.com/en?lang=en']) await redirect(from, '/en/');
  await redirect('/en?lang=en&utm_source=audit&gclid=123&fbclid=456',
    '/en/?utm_source=audit&gclid=123&fbclid=456');
});

test('retired slashless comparisons no longer fall through to 404', async () => {
  const fallback = readFileSync(path.join(ROOT, '_redirects'), 'utf8')
    .split('\n').map(line => line.trim().split(/\s+/));
  for (const slug of ['whatsapp', 'telegram', 'trello', 'slack-self-dm']) {
    for (const suffix of ['', '?lang=ja', '.html?lang=en', '/index.html?ref=external']) {
      await redirect(`/vs/${slug}${suffix}`, '/vs/');
    }
    await redirect(`https://www.simplememofast.com/vs/${slug}?lang=en&utm_source=audit`,
      '/vs/?utm_source=audit');
    assert.ok(fallback.some(([from, to, status]) =>
      from === `/vs/${slug}` && to === '/vs/' && status === '301'));
  }
  assert.ok(fallback.some(([from, to, status]) => from === '/en' && to === '/en/' && status === '301'));
});

test('stray-paren backlink variants supplement, not replace, original row 12', async () => {
  assert.equal(cases[11].from, ORIGIN + '/');
  for (const from of ['/)', '/%29', '/)?lang=ja', '/%29?lang=ja']) await redirect(from, '/');
});

test('unknown slugs and authenticated paths are not redirected by the new aliases', async () => {
  for (const from of ['/en-unknown', '/vs/trello-unknown', '/admin/api/upload?lang=en']) {
    assert.deepEqual(await edge(from), { kind: 'pass' });
  }
});

test('the direct-document assertion rejects a native Pages directory redirect', () => {
  assert.throws(() => verifyDocument('/en/vs'), /ENOENT|directly served/);
});
