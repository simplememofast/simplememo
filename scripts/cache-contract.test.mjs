// Homepage cache contract, checked before merge (SEO Validation, seo-core).
//
// Why this runs here and not against a preview:
// - Cache policies are a one-way door. A document served with a long or immutable
//   policy (or a far Expires) can stay in visitors' browsers for up to a year, and
//   no later deploy can take it back.
// - Pages previews sit behind Cloudflare Access since 2026-10-20, and CI holds no
//   credentials for them (decided 2026-11-12). The old preview fetch could only fail
//   at the Access login, and it never gated auto-merge (auto-merge waits for SEO
//   Validation only).
// - So the pre-merge check is deterministic and offline, and it computes what Pages
//   would actually send: `_headers` through a port of Pages' own parser and matcher
//   (scripts/lib/pages-headers.mjs), then the real Functions middleware executed on
//   top, for every HTML document in the repository. The real edge is measured after
//   deployment by .github/workflows/home-perf-cache.yml.
//
// Shapes the model does not cover fail instead of passing silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  parseHeaders, constructRules, compileRules, matchRules, staticAssetHeaders, attachHeaders, CACHE_CONTROL_BROWSER,
} from './lib/pages-headers.mjs';

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
const SKIP_DIRS = new Set(['.git', 'node_modules', '.wrangler']);

/** Why a Cache-Control value is too long-lived for a document, or null. */
export function longLivedReason(value) {
  if (!value) return null;
  for (const raw of value.split(',')) {
    const directive = raw.trim().toLowerCase();
    if (directive === 'immutable') return 'immutable';
    const age = directive.match(/^(max-age|s-maxage|stale-while-revalidate|stale-if-error)\s*=\s*"?(\d+)"?$/);
    if (age && Number(age[2]) > DOCUMENT_MAX_AGE) return `${age[1]}=${age[2]}`;
  }
  return null;
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
  }
  for (const rulePath of dropped) problems.push(`_headers: Pages drops the rule ${rulePath} (its pattern does not compile, e.g. two "*")`);
  for (const { path: rulePath, crossHost } of compiled) if (crossHost) problems.push(`_headers: host-specific rule ${rulePath} is not modelled here; extend scripts/cache-contract.test.mjs first`);
  return { compiled, problems };
}

/** Canonical URL paths of every HTML file in the repository (what Pages serves). */
export function documentPaths(root = ROOT) {
  const out = [];
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.posix.join(rel, entry.name));
      } else if (entry.name.endsWith('.html')) {
        const file = path.posix.join(rel, entry.name);
        out.push(file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + file.slice(0, -'index.html'.length) : '/' + file.slice(0, -'.html'.length));
      }
    }
  };
  walk('');
  // A 200 rewrite in _redirects serves a document under its source path, and Pages
  // matches _headers against that source path.
  const redirects = path.join(root, '_redirects');
  if (fs.existsSync(redirects)) {
    for (const line of fs.readFileSync(redirects, 'utf8').split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (!parts[0] || parts[0].startsWith('#') || !/^200!?$/.test(parts[2] || '')) continue;
      out.push(parts[0].replace(/\*/g, 'cache-contract-probe').replace(/:[A-Za-z]\w*/g, 'cache-contract-probe'));
    }
  }
  return [...new Set(out)].sort();
}

/** Every Pages Function, imported. Shapes that Node cannot run here are reported, not skipped. */
export async function loadFunctions(root = ROOT) {
  const middlewares = [];
  const routes = [];
  const problems = [];
  if (fs.existsSync(path.join(root, '_worker.js'))) problems.push('_worker.js (advanced mode) replaces Functions; extend scripts/cache-contract.test.mjs first');
  const walk = async rel => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const file = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!/\.(?:m?js|ts|tsx|jsx)$/.test(entry.name)) continue;
      if (!/\.m?js$/.test(entry.name)) { problems.push(`${file}: Pages builds .ts/.tsx/.jsx Functions, which this check cannot execute; extend it first`); continue; }
      const dir = path.posix.dirname(file).replace(/^functions\/?/, '');
      if (/^_middleware\.m?js$/.test(entry.name)) {
        const mod = await import(pathToFileURL(path.join(root, file)).href);
        const handler = mod.onRequest ?? mod.onRequestGet;
        const handlers = [handler].flat().filter(Boolean);
        if (!handlers.length || handlers.some(h => typeof h !== 'function')) problems.push(`${file}: no onRequest/onRequestGet function to run`);
        middlewares.push({ file, dir, handlers });
      } else {
        // File routes: [name] is one segment, [[name]] is any depth, index is the directory.
        const route = path.posix.join(dir, entry.name.replace(/\.m?js$/, '')).replace(/(^|\/)index$/, '$1');
        const source = route.split('/').filter(Boolean).map(seg => /^\[\[.+\]\]$/.test(seg) ? '.*' : /^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
        routes.push({ file, regExp: new RegExp('^/' + source + '/?$') });
      }
    }
  };
  if (fs.existsSync(path.join(root, 'functions'))) await walk('functions');
  middlewares.sort((a, b) => a.dir.split('/').filter(Boolean).length - b.dir.split('/').filter(Boolean).length);
  return { middlewares, routes, problems };
}

/** What a GET of `urlPath` returns: the middleware chain, then the static asset. */
export async function serve(urlPath, { compiled, functions, extraMiddleware = [] }) {
  const route = functions.routes.find(r => r.regExp.test(urlPath));
  if (route) throw new Error(`${urlPath} is answered by the Function ${route.file}; extend scripts/cache-contract.test.mjs to model it`);
  const applies = ({ dir }) => dir === '' || urlPath === '/' + dir || urlPath.startsWith('/' + dir + '/');
  const handlers = [...functions.middlewares.filter(applies).flatMap(m => m.handlers), ...extraMiddleware];
  const request = new Request(ORIGIN + urlPath);
  const asset = () => new Response('<!doctype html><title>cache contract</title>', { status: 200, headers: staticAssetHeaders(compiled, ORIGIN + urlPath) });
  const dispatch = i => i === handlers.length ? Promise.resolve(asset()) : Promise.resolve(handlers[i]({
    request, env: {}, params: {}, data: {}, functionPath: urlPath,
    waitUntil() {}, passThroughOnException() {}, next: () => dispatch(i + 1),
  }));
  return dispatch(0);
}

/** Every way the served documents break the contract. */
export async function documentProblems({ compiled, functions, documents, extraMiddleware = [] }) {
  const problems = [];
  for (const doc of documents) {
    let response;
    try { response = await serve(doc, { compiled, functions, extraMiddleware }); }
    catch (e) { problems.push(`${doc}: ${e.message}`); continue; }
    const cacheControl = response.headers.get('cache-control');
    const reason = longLivedReason(cacheControl);
    if (reason) {
      const from = matchRules(compiled, ORIGIN + doc).filter(m => Object.keys(m.set).some(k => k.toLowerCase() === 'cache-control')).map(m => m.path);
      problems.push(`${doc}: "${cacheControl}" (${reason}) would let browsers keep this document. _headers rules setting it: ${from.join(', ') || 'none (a Function set it)'}`);
    }
    if (response.headers.has('expires')) problems.push(`${doc}: Expires "${response.headers.get('expires')}" overrides revalidation for documents`);
    if (HOME_ROOTS.includes(doc) && cacheControl !== REVALIDATE) problems.push(`${doc}: expected exactly "${REVALIDATE}", got "${cacheControl}"`);
  }
  return problems;
}

const headersText = fs.readFileSync(path.join(ROOT, '_headers'), 'utf8');
const model = headersModel(headersText);
const functions = await loadFunctions();
const documents = documentPaths();

test('_headers parses cleanly under Pages\' own rules', () => {
  assert.deepEqual(model.problems, []);
});

test('every Function is runnable by this check', () => {
  assert.deepEqual(functions.problems, []);
  assert.ok(functions.middlewares.some(m => m.dir === ''), 'the root middleware is modelled');
});

test('every served document keeps a short policy; the home roots stay exactly "public, no-cache"', async () => {
  assert.ok(documents.length > 100, `only ${documents.length} documents found`);
  for (const root of HOME_ROOTS) assert.ok(documents.includes(root), root);
  assert.deepEqual(await documentProblems({ compiled: model.compiled, functions, documents }), []);
});

test('Pages model agrees with Pages on the behaviours that matter here', () => {
  const headersFor = (text, url, opts) => staticAssetHeaders(headersModel(text).compiled, ORIGIN + url, opts);
  // No rule: the browser default from serveAsset.
  assert.equal(headersFor('/x\n  X-A: 1\n', '/').get('cache-control'), CACHE_CONTROL_BROWSER);
  // The first rule replaces the default; later matching rules append.
  assert.equal(headersFor('/*\n  Cache-Control: public, no-cache\n/a\n  Cache-Control: public, max-age=60\n', '/a').get('cache-control'), 'public, no-cache, public, max-age=60');
  // "! " detaches what earlier rules set.
  assert.equal(headersFor('/*\n  Cache-Control: public, no-cache\n/a\n  ! Cache-Control\n', '/a').get('cache-control'), null);
  // A repeated path replaces the first block, in the first block's position.
  const repeated = headersModel('/*\n  Cache-Control: public, no-cache\n  X-Frame-Options: DENY\n/a\n  X-A: 1\n/*\n  X-B: 1\n');
  assert.equal(repeated.problems.length, 1);
  const replaced = staticAssetHeaders(repeated.compiled, ORIGIN + '/');
  assert.equal(replaced.get('cache-control'), CACHE_CONTROL_BROWSER);
  assert.equal(replaced.get('x-frame-options'), null);
  // An indented absolute URL starts a rule; "!Name" without a space is invalid; two "*" are dropped.
  assert.match(headersModel('/a\n  https://simplememofast.com/en/*\n  X-A: 1\n').problems.join('\n'), /host-specific rule/);
  assert.match(headersModel('/a\n  !Cache-Control\n  X-A: 1\n').problems.join('\n'), /colon-separated/);
  assert.match(headersModel('/*/x/*\n  X-A: 1\n').problems.join('\n'), /drops the rule/);
  assert.match(headersModel('/a\n  X-A: ' + 'x'.repeat(2001) + '\n').problems.join('\n'), /maximum allowed length/);
  // A missing page is rewritten to no-store whatever _headers says.
  assert.equal(headersFor('/*\n  Cache-Control: public, max-age=31536000, immutable\n', '/missing', { status: 404 }).get('cache-control'), 'no-store');
  // Response headers keep Pages' extras.
  assert.equal(attachHeaders(new Headers({ 'content-type': 'text/html' }), []).get('x-content-type-options'), 'nosniff');
});

test('gate self-test: each dangerous change is caught', async () => {
  const check = async (text, extraMiddleware = []) => {
    const mutated = headersModel(text);
    return [...mutated.problems, ...await documentProblems({ compiled: mutated.compiled, functions, documents, extraMiddleware })];
  };
  // Baseline is clean, so every failure below comes from the mutation.
  assert.deepEqual(await check(headersText), []);
  // A language-wide long policy.
  assert.notDeepEqual(await check(headersText + '\n/en/*\n  Cache-Control: public, max-age=31536000, immutable\n'), []);
  // A second site-wide block (replaces the first one in Pages).
  assert.notDeepEqual(await check(headersText + '\n/*\n  Cross-Origin-Opener-Policy: same-origin\n'), []);
  // A far Expires on a document tree.
  assert.notDeepEqual(await check(headersText + '\n/en/*\n  ! Cache-Control\n  Expires: Fri, 31 Dec 2027 23:59:59 GMT\n'), []);
  // A Function giving every HTML response a computed one-week policy.
  const week = 7 * 24 * 60 * 60;
  const longPolicy = async ctx => {
    const res = await ctx.next();
    const out = new Response(res.body, res);
    if ((out.headers.get('content-type') || '').startsWith('text/html')) out.headers.set('Cache-Control', `public, max-age=${week}`);
    return out;
  };
  assert.notDeepEqual(await check(headersText, [longPolicy]), []);
  // A Function adding Expires.
  const expires = async ctx => { const res = await ctx.next(); const out = new Response(res.body, res); out.headers.set('Expires', 'Fri, 12 Nov 2027 00:00:00 GMT'); return out; };
  assert.notDeepEqual(await check(headersText, [expires]), []);
  assert.equal(longLivedReason('public, max-age=31536000, immutable'), 'max-age=31536000');
  assert.equal(longLivedReason('public, immutable'), 'immutable');
  assert.equal(longLivedReason('public, s-maxage=86400'), 's-maxage=86400');
  assert.equal(longLivedReason('public, no-cache, public, max-age=3600'), null);
  assert.equal(longLivedReason('private, no-store'), null);
});
