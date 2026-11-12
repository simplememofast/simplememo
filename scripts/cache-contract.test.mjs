// Homepage cache contract, checked before merge (SEO Validation, seo-core).
//
// Why this runs here and not against a preview:
// - Cache policies are a one-way door. A document served with a long or immutable
//   policy, a far Expires, or no explicit freshness at all can stay in visitors'
//   browsers for months, and no later deploy can take it back.
// - Pages previews sit behind Cloudflare Access since 2026-10-20, and CI holds no
//   credentials for them (decided 2026-11-12). The old preview fetch could only fail
//   at the Access login, and it never gated auto-merge (auto-merge waits for SEO
//   Validation only).
// - So the pre-merge check is deterministic and offline. For every HTML document in
//   the repository it computes what Pages would send: `_headers` through a port of
//   Pages' own parser and matcher (scripts/lib/pages-headers.mjs), and the Functions
//   chain through a port of Pages' router (scripts/lib/pages-functions.mjs) with the
//   real handlers executed. Several request shapes are tried (plain GET, browser
//   navigation, HEAD, query string, conditional/304), and every document is also
//   checked with `_headers` alone (`_routes.json` exclusions and Functions fail-open).
//   The real edge is measured after deployment by .github/workflows/home-perf-cache.yml.
//
// What the model cannot see fails instead of passing silently: env-dependent handlers,
// handlers that cannot run here, ambiguous routes, invalid `_headers` lines, URL
// placeholders in freshness headers, a missing 404.html, an advanced-mode _worker.js.
// Known limits (see docs/perf/cache-contract-20261112.md): behaviour that depends on
// time, cookies or randomness, and HTML produced by route Functions written in
// TypeScript/JSX, which this check cannot execute.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  parseHeaders, constructRules, compileRules, matchRules, attachHeaders, staticAssetHeaders, CACHE_CONTROL_BROWSER,
} from './lib/pages-headers.mjs';
import { buildRoutes, handlerChain, runChain } from './lib/pages-functions.mjs';

// The home-perf middleware and production-workflow tests live next to the code
// they cover. Importing them registers their tests in this run.
import './perf/cache_headers.test.mjs';
import './perf/cache_headers_navigation.test.mjs';
import './perf/cache_headers_revalidation.test.mjs';
import './perf/cache_headers_workflow.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://simplememofast.com';
const REVALIDATE = 'public, no-cache';
const HOME_ROOTS = ['/', '/en/'];
// A document may be reused without asking for at most an hour (/verify and /compose
// use max-age=3600 next to the site-wide no-cache today).
const DOCUMENT_MAX_AGE = 3600;
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const PROBE = 'cache-contract-probe';
const NAVIGATION = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-site': 'none', 'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

/** Why a Cache-Control value lets a document be reused for too long, or null. */
export function longLivedReason(value) {
  if (!value) return null;
  const directives = value.split(',').map(d => d.trim().toLowerCase());
  const revalidates = directives.includes('no-cache') || directives.includes('no-store');
  for (const directive of directives) {
    if (directive === 'immutable') return 'immutable';
    const age = directive.match(/^(max-age|s-maxage|stale-while-revalidate|stale-if-error)\s*=\s*"?(\d+)"?$/);
    if (!age) continue;
    // stale-* only widens reuse when the response may be reused at all.
    if (age[1].startsWith('stale-') && revalidates) continue;
    if (Number(age[2]) > DOCUMENT_MAX_AGE) return `${age[1]}=${age[2]}`;
  }
  return null;
}

/** True when a Cache-Control value states freshness explicitly (no heuristic reuse). */
export function hasExplicitFreshness(value) {
  if (!value) return false;
  return value.split(',').map(d => d.trim().toLowerCase()).some(d => d === 'no-cache' || d === 'no-store' || /^max-age\s*=\s*"?\d+"?$/.test(d));
}

/** `_headers` as Pages reads it, plus every reason the model refuses it. */
export function headersModel(text) {
  const parsed = parseHeaders(text);
  const rules = constructRules(parsed);
  const { compiled, dropped } = compileRules(rules);
  const problems = [];
  for (const entry of parsed.invalid) problems.push(`_headers${entry.lineNumber ? ':' + entry.lineNumber : ''}: Pages would ignore this line or rule (${entry.message})`);
  const seen = new Map();
  for (const rule of parsed.rules) {
    if (seen.has(rule.path)) problems.push(`_headers:${rule.lineNumber}: a second block for ${rule.path} (first at line ${seen.get(rule.path)}) replaces the first one entirely in Pages. Merge the two blocks.`);
    else seen.set(rule.path, rule.lineNumber);
    for (const [name, value] of Object.entries(rule.headers)) {
      if (['cache-control', 'expires', 'last-modified'].includes(name) && /:[A-Za-z]\w*/.test(value)) {
        problems.push(`_headers:${rule.lineNumber}: ${name} on ${rule.path} uses a URL placeholder ("${value}"), so a request could choose its own freshness`);
      }
    }
  }
  for (const rulePath of dropped) problems.push(`_headers: Pages drops the rule ${rulePath} (its pattern does not compile, e.g. two "*")`);
  return { compiled, problems };
}

const instantiate = pattern => pattern.replace(/:[A-Za-z]\w*\*?/g, PROBE).replace(/\*/g, PROBE);
const patternRegExp = pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]\w*/g, '[^/]+')).join('.*') + '$');

/** Canonical URL paths of every HTML document in a site tree, and what the model refuses. */
export function sitePaths(root, compiled) {
  const documents = new Set();
  const problems = [];
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const file = rel ? path.posix.join(rel, entry.name) : entry.name;
      if (entry.isSymbolicLink()) { problems.push(`${file}: symbolic links are not modelled (Pages follows them when uploading)`); continue; }
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(file); continue; }
      if (!/\.(?:html?|xhtml)$/i.test(entry.name)) continue;
      if (entry.name.endsWith('.html')) documents.add(file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + file.slice(0, -'index.html'.length) : '/' + file.slice(0, -'.html'.length));
      else documents.add('/' + file);
    }
  };
  walk('');
  if (!fs.existsSync(path.join(root, '404.html'))) problems.push('404.html is missing at the top level: Pages then answers every missing path with /index.html (SPA mode)');
  if (fs.existsSync(path.join(root, '_worker.js'))) problems.push('_worker.js (Pages advanced mode) replaces functions/ and answers every request; this check cannot model it');
  // A 200 rewrite serves a document under its source path, and Pages matches _headers
  // against that source path: check the source and every _headers rule it overlaps.
  const redirects = path.join(root, '_redirects');
  if (fs.existsSync(redirects)) {
    for (const line of fs.readFileSync(redirects, 'utf8').split('\n')) {
      const [source, , status] = line.trim().split(/\s+/);
      if (!source || source.startsWith('#') || !/^200!?$/.test(status || '')) continue;
      documents.add(instantiate(source));
      const sourceRe = patternRegExp(source);
      for (const { path: rulePath, crossHost } of compiled) if (!crossHost && sourceRe.test(instantiate(rulePath))) documents.add(instantiate(rulePath));
    }
  }
  return { documents: [...documents].sort(), problems };
}

const etagFor = urlPath => `"${createHash('sha256').update(urlPath).digest('hex').slice(0, 20)}"`;

/** The asset server: serveAsset() (200 or 304 for a matching If-None-Match), then _headers. */
function assetServer(compiled) {
  return request => {
    const url = new URL(request.url);
    const etag = etagFor(url.pathname);
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch.split(',').map(v => v.trim().replace(/^W\//, '')).includes(etag)) {
      return new Response(null, { status: 304, headers: attachHeaders(new Headers({ etag }), matchRules(compiled, url.href)) });
    }
    const headers = staticAssetHeaders(compiled, url.href);
    headers.set('etag', etag);
    return new Response(request.method === 'HEAD' ? null : '<!doctype html><title>cache contract</title>', { status: 200, headers });
  };
}

/** env as the handlers see it: ASSETS works, every other read is recorded. */
function envFor(assets, reads) {
  const base = { ASSETS: { fetch: (input, init) => assets(new Request(typeof input === 'string' ? new URL(input, ORIGIN).toString() : input, init)) } };
  return new Proxy(base, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'string' && key !== 'then') reads.add(key);
      return undefined;
    },
    has(target, key) {
      if (typeof key === 'string') reads.add(key);
      return key in target;
    },
  });
}

/** Workers globals the handlers may touch; the network is disabled. */
async function withRuntimeStubs(fn) {
  const names = ['fetch', 'HTMLRewriter', 'caches'];
  const saved = Object.fromEntries(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const cache = { match: async () => undefined, put: async () => {}, delete: async () => false };
  globalThis.fetch = async () => { throw new Error('network access is disabled in the cache contract check'); };
  globalThis.HTMLRewriter = class { on() { return this; } onDocument() { return this; } transform(response) { return response; } };
  globalThis.caches = { default: cache, open: async () => cache };
  try { return await fn(); } finally {
    for (const n of names) { if (saved[n]) Object.defineProperty(globalThis, n, saved[n]); else delete globalThis[n]; }
  }
}

function responseProblems(where, doc, response) {
  const out = [];
  const cacheControl = response.headers.get('cache-control');
  const reason = longLivedReason(cacheControl);
  if (reason) out.push(`${where}: "${cacheControl}" (${reason}) lets browsers reuse this document without asking`);
  if (response.headers.has('expires')) out.push(`${where}: Expires "${response.headers.get('expires')}" sets freshness for a document`);
  if (response.status >= 200 && response.status < 300 && !hasExplicitFreshness(cacheControl)) {
    out.push(`${where}: ${cacheControl ? `"${cacheControl}" states` : 'no Cache-Control, so it states'} no explicit freshness; browsers may reuse it heuristically (e.g. from Last-Modified)`);
  }
  if (HOME_ROOTS.includes(doc) && response.status === 200 && cacheControl !== REVALIDATE) out.push(`${where}: expected exactly "${REVALIDATE}", got "${cacheControl}"`);
  return out;
}

const requestsFor = doc => [
  ['GET', new Request(ORIGIN + doc)],
  ['navigation', new Request(ORIGIN + doc, { headers: NAVIGATION })],
  ['HEAD', new Request(ORIGIN + doc, { method: 'HEAD', headers: NAVIGATION })],
  ['query', new Request(`${ORIGIN}${doc}?utm_source=${PROBE}`, { headers: NAVIGATION })],
  ['conditional', new Request(ORIGIN + doc, { headers: { ...NAVIGATION, 'if-none-match': etagFor(doc) } })],
];

async function serveThroughFunctions(routes, assets, request) {
  const reads = new Set();
  const chain = handlerChain(routes, request.method, new URL(request.url).pathname);
  const response = await runChain(chain, request, { assets, env: envFor(assets, reads) });
  return { response, reads };
}

/** Every way the served documents break the contract. */
export async function documentProblems({ compiled, routes, documents }) {
  const problems = [];
  const assets = assetServer(compiled);
  await withRuntimeStubs(async () => {
    for (const doc of documents) {
      for (const [variant, request] of requestsFor(doc)) {
        const where = `${doc} [${variant}]`;
        try {
          const { response, reads } = await serveThroughFunctions(routes, assets, request);
          if (reads.size) problems.push(`${where}: a Function read env ${[...reads].join(', ')}; its production value is unknown here, so declare how it is checked first`);
          problems.push(...responseProblems(where, doc, response));
        } catch (e) {
          problems.push(`${where}: ${e.message}`);
        }
      }
      // _routes.json exclusions and Functions fail-open serve _headers alone.
      for (const [variant, request] of [['static only', new Request(ORIGIN + doc)], ['static only, conditional', new Request(ORIGIN + doc, { headers: { 'if-none-match': etagFor(doc) } })]]) {
        problems.push(...responseProblems(`${doc} [${variant}]`, doc, assets(request)));
      }
    }
  });
  return problems;
}

/** Route Functions can create HTML pages at URLs no file names; probe each GET route once. */
export async function routeProblems({ compiled, routes }) {
  const problems = [];
  const assets = assetServer(compiled);
  await withRuntimeStubs(async () => {
    for (const route of routes) {
      if (!route.module.length || (route.method && !['GET', 'HEAD'].includes(route.method))) continue;
      if (!route.module.every(ref => ref.runnable)) continue; // cannot run here; covered when it answers a document
      const probe = instantiate(route.routePath) || '/';
      const where = `${probe} [route ${route.module.map(ref => ref.file).join(', ')}]`;
      try {
        const { response } = await serveThroughFunctions(routes, assets, new Request(ORIGIN + probe, { headers: NAVIGATION }));
        if ((response.headers.get('content-type') || '').toLowerCase().startsWith('text/html')) problems.push(...responseProblems(where, probe, response));
      } catch (e) {
        problems.push(`${where}: could not be evaluated (${e.message})`);
      }
    }
  });
  return problems;
}

/** The whole contract for a site tree. */
export async function evaluate(root) {
  const headers = headersModel(fs.readFileSync(path.join(root, '_headers'), 'utf8'));
  const site = sitePaths(root, headers.compiled);
  const functions = await buildRoutes(root);
  return {
    documents: site.documents,
    routes: functions.routes,
    problems: [
      ...headers.problems, ...site.problems, ...functions.problems,
      ...await routeProblems({ compiled: headers.compiled, routes: functions.routes }),
      ...await documentProblems({ compiled: headers.compiled, routes: functions.routes, documents: site.documents }),
    ],
  };
}

const repository = await evaluate(ROOT);

test('the repository satisfies the cache contract', t => {
  t.diagnostic(`${repository.documents.length} documents x 7 request shapes, ${repository.routes.length} Function routes`);
  assert.ok(repository.documents.length > 100, `only ${repository.documents.length} documents found`);
  for (const root of HOME_ROOTS) assert.ok(repository.documents.includes(root), root);
  assert.ok(repository.routes.some(r => r.routePath === '/' && r.middleware.length), 'the root middleware is modelled');
  assert.deepEqual(repository.problems, []);
});

test('Pages models agree with Pages on the behaviours that matter here', () => {
  const headersFor = (text, url, opts) => staticAssetHeaders(headersModel(text).compiled, ORIGIN + url, opts);
  assert.equal(headersFor('/x\n  X-A: 1\n', '/').get('cache-control'), CACHE_CONTROL_BROWSER);
  assert.equal(headersFor('/*\n  Cache-Control: public, no-cache\n/a\n  Cache-Control: public, max-age=60\n', '/a').get('cache-control'), 'public, no-cache, public, max-age=60');
  assert.equal(headersFor('/*\n  Cache-Control: public, no-cache\n/a\n  ! Cache-Control\n', '/a').get('cache-control'), null);
  const repeated = headersModel('/*\n  Cache-Control: public, no-cache\n  X-Frame-Options: DENY\n/a\n  X-A: 1\n/*\n  X-B: 1\n');
  assert.equal(repeated.problems.length, 1);
  assert.equal(staticAssetHeaders(repeated.compiled, ORIGIN + '/').get('cache-control'), CACHE_CONTROL_BROWSER);
  assert.match(headersModel('/a\n  !Cache-Control\n  X-A: 1\n').problems.join('\n'), /colon-separated/);
  assert.match(headersModel('/*/x/*\n  X-A: 1\n').problems.join('\n'), /drops the rule/);
  assert.match(headersModel('/a\n  X-A: ' + 'x'.repeat(2001) + '\n').problems.join('\n'), /maximum allowed length/);
  assert.equal(headersFor('/*\n  Cache-Control: public, max-age=31536000, immutable\n', '/missing', { status: 404 }).get('cache-control'), 'no-store');
  assert.equal(attachHeaders(new Headers({ 'content-type': 'text/html' }), []).get('x-content-type-options'), 'nosniff');
  // Host-specific rules match their host only.
  assert.equal(headersFor('https://:project.pages.dev/*\n  X-Robots-Tag: noindex\n', '/').get('x-robots-tag'), null);
  assert.equal(longLivedReason('public, max-age=31536000, immutable'), 'max-age=31536000');
  assert.equal(longLivedReason('public, immutable'), 'immutable');
  assert.equal(longLivedReason('public, s-maxage=86400'), 's-maxage=86400');
  assert.equal(longLivedReason('public, no-cache, stale-if-error=86400'), null);
  assert.equal(longLivedReason('public, no-cache, public, max-age=3600'), null);
  assert.equal(hasExplicitFreshness('public'), false);
  assert.equal(hasExplicitFreshness('public, max-age=0, must-revalidate'), true);
});

// A small site: the real Functions, the real _headers and _redirects, a few documents.
async function scenario(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-contract-'));
  try {
    fs.cpSync(path.join(ROOT, 'functions'), path.join(dir, 'functions'), { recursive: true });
    for (const file of ['_headers', '_redirects']) if (fs.existsSync(path.join(ROOT, file))) fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    for (const doc of ['index.html', '404.html', 'faq.html', 'en/index.html', 'en/obsidian/index.html', `blog/${PROBE}.html`, `en/blog/${PROBE}.html`]) {
      fs.mkdirSync(path.dirname(path.join(dir, doc)), { recursive: true });
      fs.writeFileSync(path.join(dir, doc), '<!doctype html><title>doc</title>\n');
    }
    const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text); };
    const append = (file, text) => fs.appendFileSync(path.join(dir, file), text);
    await mutate({ dir, write, append });
    return (await evaluate(dir)).problems;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const LONG_HTML = `async ctx => { const res = await ctx.next(); const out = new Response(res.body, res); if ((out.headers.get('content-type') || '').startsWith('text/html')) out.headers.set('Cache-Control', 'public, max-age=86400'); return out; }`;

test('gate self-test: the baseline scenario is clean', async () => {
  assert.deepEqual(await scenario(() => {}), []);
});

test('gate self-test: every bypass found in review is blocked', async t => {
  const blocked = {
    'dynamic directory middleware functions/[lang]/_middleware.js': ({ write }) => write('functions/[lang]/_middleware.js', `export const onRequest = ${LONG_HTML};\n`),
    'an extra onRequestGet export on the root middleware': ({ append }) => append('functions/_middleware.js', `\nexport const onRequestGet = ${LONG_HTML};\n`),
    'functions/faq/[[rest]].js answering /faq': ({ write }) => write('functions/faq/[[rest]].js', `export const onRequestGet = async ctx => { const res = await ctx.env.ASSETS.fetch('/faq'); const out = new Response(res.body, res); out.headers.set('Cache-Control', 'public, max-age=86400'); return out; };\n`),
    'middleware that only targets browser navigations': ({ write }) => write('functions/blog/_middleware.js', `export const onRequest = async ctx => { const res = await ctx.next(); if (!(ctx.request.headers.get('accept') || '').includes('text/html')) return res; const out = new Response(res.body, res); out.headers.set('Cache-Control', 'public, max-age=86400'); return out; };\n`),
    'a route Function creating new HTML pages': ({ write }) => write('functions/s/[id].js', `export const onRequestGet = () => new Response('<!doctype html><p>share</p>', { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=86400' } });\n`),
    'a long policy on 304 responses only': ({ write }) => write('functions/blog/_middleware.js', `export const onRequest = async ctx => { const res = await ctx.next(); if (res.status !== 304) return res; const out = new Response(null, res); out.headers.set('Cache-Control', 'public, max-age=86400'); return out; };\n`),
    'a TTL taken from env': ({ write }) => write('functions/blog/_middleware.js', `export const onRequest = async ctx => { const res = await ctx.next(); const ttl = ctx.env.ARTICLE_BROWSER_TTL; if (!ttl) return res; const out = new Response(res.body, res); out.headers.set('Cache-Control', 'public, max-age=' + ttl); return out; };\n`),
    'no Cache-Control and a Last-Modified': ({ append }) => append('_headers', `\n/blog/*\n  ! Cache-Control\n  Last-Modified: Wed, 01 Jan 2025 00:00:00 GMT\n`),
    '_routes.json excluding a tree that _headers caches for a day': ({ append, write }) => {
      append('_headers', `\n/en/blog/*\n  ! Cache-Control\n  Cache-Control: public, max-age=86400\n`);
      write('functions/en/blog/_middleware.js', `export const onRequest = async ctx => { const res = await ctx.next(); const out = new Response(res.body, res); out.headers.set('Cache-Control', 'public, no-cache'); return out; };\n`);
      write('_routes.json', JSON.stringify({ version: 1, include: ['/*'], exclude: ['/en/blog/*'] }));
    },
    'a 200 rewrite with a rule for one of its URLs': ({ append }) => {
      append('_redirects', `\n/go/:campaign  /faq  200\n`);
      append('_headers', `\n/go/app-store\n  ! Cache-Control\n  Cache-Control: public, max-age=86400\n`);
    },
    'a URL placeholder inside Cache-Control': ({ append }) => {
      append('_redirects', `\n/ttl/:ttl  /faq  200\n`);
      append('_headers', `\n/ttl/:ttl\n  ! Cache-Control\n  Cache-Control: public, max-age=:ttl\n`);
    },
    'a second root middleware file _middleware_.js': ({ write }) => write('functions/_middleware_.js', `export const onRequest = ${LONG_HTML};\n`),
    'an upper-case route matching a lower-case document': ({ write }) => write('functions/FAQ.js', `export const onRequestGet = async ctx => { const res = await ctx.env.ASSETS.fetch('/faq'); const out = new Response(res.body, res); out.headers.set('Cache-Control', 'public, max-age=86400'); return out; };\n`),
    'a missing 404.html': ({ dir }) => fs.rmSync(path.join(dir, '404.html')),
    'a computed one-week policy in the root middleware': ({ append }) => append('functions/_middleware.js', `\nexport const onRequestHead = ${LONG_HTML.replace("'public, max-age=86400'", "'public, max-age=' + 7 * 24 * 60 * 60")};\n`),
    'Expires added by a Function': ({ write }) => write('functions/en/_middleware.js', `export const onRequest = async ctx => { const res = await ctx.next(); const out = new Response(res.body, res); out.headers.set('Expires', 'Fri, 12 Nov 2027 00:00:00 GMT'); return out; };\n`),
    'a second /* block in _headers': ({ append }) => append('_headers', `\n/*\n  Cross-Origin-Opener-Policy: same-origin\n`),
    'a language-wide immutable rule': ({ append }) => append('_headers', `\n/en/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n`),
    'a TypeScript middleware on documents': ({ write }) => write('functions/en/_middleware.ts', `export const onRequest = async (ctx: any) => ctx.next();\n`),
    'an advanced-mode _worker.js': ({ write }) => write('_worker.js', `export default { fetch: () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html', 'cache-control': 'public, max-age=86400' } }) };\n`),
  };
  for (const [name, mutate] of Object.entries(blocked)) {
    const problems = await scenario(mutate);
    assert.notDeepEqual(problems, [], `not blocked: ${name}`);
    t.diagnostic(`blocked: ${name} -> ${problems[0].slice(0, 160)}`);
  }
});

test('gate self-test: legitimate changes still pass', async () => {
  const allowed = {
    'a POST-only route on a document path': ({ write }) => { write('roadmap/index.html', '<!doctype html>\n'); write('functions/roadmap/index.js', `export const onRequestPost = () => new Response('ok', { headers: { 'cache-control': 'no-store' } });\n`); },
    'an HTMLRewriter middleware that keeps the policy': ({ write }) => write('functions/blog/_middleware.js', `export const onRequest = async ctx => new HTMLRewriter().on('main', { element() {} }).transform(await ctx.next());\n`),
    'a host-specific noindex rule': ({ append }) => append('_headers', `\nhttps://:project.pages.dev/*\n  X-Robots-Tag: noindex\n`),
    'a TypeScript JSON API route': ({ write }) => write('functions/api/ping.ts', `export const onRequestGet = () => Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });\n`),
    'HSTS and a 30-day cookie in a Function': ({ write }) => write('functions/api/hello.js', `export const onRequestGet = () => new Response('{}', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'strict-transport-security': 'max-age=31536000; includeSubDomains', 'set-cookie': 'a=b; Max-Age=2592000' } });\n`),
    'a comment mentioning immutable': ({ append }) => append('functions/_middleware.js', `\n// Headers on the response from next() are immutable; copy the Response before editing.\n`),
    'a one-year policy for video files': ({ append }) => append('_headers', `\n/*.mp4\n  Cache-Control: public, max-age=31536000, immutable\n`),
    'lower-case header names': ({ dir }) => { const file = path.join(dir, '_headers'); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^(\s*)Cache-Control: public, no-cache$/m, '$1cache-control: public, no-cache')); },
  };
  for (const [name, mutate] of Object.entries(allowed)) {
    assert.deepEqual(await scenario(mutate), [], `wrongly blocked: ${name}`);
  }
});
