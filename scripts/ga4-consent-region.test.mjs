// GA4 は EEA・英国・スイス（と国が分からない訪問）では読み込まない（EU 監査 E34・D11）。
// 2026-11-17 から静的既定オフ: 静的な HTML は GA4 を持たず、許可する地域への HTML にだけ
// root middleware が GA4 を足す（functions/lib/ga-geo.js の冒頭）。SEO Validation で走る。
//
// 確かめること
//   1. 地域の判定（一覧は実装と別に書いて突き合わせる）
//   2. 静的な HTML と _headers に GA4 が無いこと（Functions を通らない経路の安全）
//   3. 目印を戻した本文が、ローダーの原本と同じ形になること（計測の継続）
//   4. middleware の応答: 地域ごとの本文・CSP・キャッシュの見出し・検証子・HEAD・404・206
//   5. GA4 を足した版がエッジや共有キャッシュに残らない見出しであること
//   6. 既存の Cookie を消す動作が、既定で無効であること
//
// HTMLRewriter は Workers の実行環境にしか無いので、ここでは scripts/lib/html-rewriter-model.mjs
// （lol-html の "script" まわりの模型）で動かす。模型と本物の一致は CI では確かめられない
// （workerd が無い）。手元で確かめた記録は PR の本文。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CONSENT_REGIONS, GA_MEASUREMENT_ID, GA_CSP_SOURCES, GA_MARKER_SELECTOR, EXPIRE_EXISTING_GA_COOKIES, GA_COOKIE_NAMES,
  isConsentRegion, skipsGoogleAnalytics, isGoogleAnalyticsHost, withGoogleAnalyticsSources, withoutGoogleAnalyticsSources,
  gaInjectionHandlers, looksLikeDocumentPath, applyAnalyticsPolicy, gaCookieExpiry,
} from '../functions/lib/ga-geo.js';
import { GA_INLINE_LOADERS, GA_MARKER_TYPE, GA_DEFERRED, gaLoaderElement } from '../functions/lib/ga-loaders.js';
import { onRequest } from '../functions/_middleware.js';
import { scriptRewriterModel } from './lib/html-rewriter-model.mjs';
import { activate, markersIn, markerFor, staticProblems, toStaticMarkers, GA_TRACE, MARKER } from './lib/ga4-static.mjs';
import { parseHeaders, constructRules, compileRules, staticAssetHeaders } from './lib/pages-headers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://simplememofast.com';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const FILES = execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean);
// 動く GA4（目印の外の GA の痕跡）。目印そのもの（deferred の data-src）は数えない。
const executableGa = (html) => GA_TRACE.test(html.replace(MARKER, ''));
const loaderCount = (html) => (html.match(/<script>[^<]*G-EPZVZKCVQG[^<]*<\/script>|<script src="\/js\/analytics\.js\?v=[0-9a-f]+" defer><\/script>/g) || []).length;

// ---------------------------------------------------------------- 1. 地域の判定

// 一覧は実装と別に書く（実装の打ち間違い・消し忘れを、同じ間違いで通さない）。
const EXPECTED_CORE = [
  // EU 27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA（EU の外）
  'IS', 'LI', 'NO',
  // 英国・スイス
  'GB', 'CH',
  // EU の領域で国コードが別のもの
  'GF', 'GP', 'MQ', 'RE', 'YT', 'MF', 'AX',
];
// 安全側に足したもの。外すなら、ga-geo.js とここを同時に直す。
const EXPECTED_EXTRA = ['IC', 'EA', 'GG', 'JE', 'IM', 'GI', 'EU'];
const OUTSIDE = ['JP', 'US', 'KR', 'CN', 'TW', 'HK', 'SG', 'IN', 'ID', 'TH', 'VN', 'PH', 'MY', 'AU', 'NZ',
  'CA', 'MX', 'BR', 'AR', 'CL', 'TR', 'SA', 'AE', 'IL', 'ZA', 'NG', 'EG', 'RU', 'UA', 'RS', 'BA',
  'AL', 'MK', 'ME', 'MD', 'BY', 'GE', 'AM', 'AZ', 'AD', 'MC', 'SM', 'VA', 'FO', 'GL', 'SJ', 'PM', 'BL'];

test('every EEA, UK and Swiss code (and the EU territories with their own codes) skips GA4', () => {
  assert.equal(EXPECTED_CORE.length, 27 + 3 + 2 + 7);
  for (const code of EXPECTED_CORE) {
    assert.equal(isConsentRegion(code), true, code);
    assert.equal(isConsentRegion(code.toLowerCase()), true, code.toLowerCase());
  }
  for (const code of EXPECTED_EXTRA) assert.equal(isConsentRegion(code), true, code);
  assert.deepEqual([...CONSENT_REGIONS].sort(), [...EXPECTED_CORE, ...EXPECTED_EXTRA].sort());
});

test('visitors from elsewhere keep GA4', () => {
  for (const code of OUTSIDE) assert.equal(isConsentRegion(code), false, code);
  assert.equal(isConsentRegion(' jp '), false);
  assert.equal(isConsentRegion('JP', false), false);
  assert.equal(isConsentRegion('JP', null), false);
});

test('an unknown or malformed country skips GA4 (safe side)', () => {
  for (const value of [undefined, null, '', ' ', 'XX', 'ZZ', 'T1', 'A1', 'A2', 'GBR', 'G', 'J1', 5, {}, []]) {
    assert.equal(isConsentRegion(value), true, JSON.stringify(value));
  }
  // Cloudflare says EU even when the code is not in the list.
  assert.equal(isConsentRegion('JP', '1'), true);
  assert.equal(isConsentRegion('JP', true), true);
});

test('the decision reads request.cf, and a request without cf skips GA4', () => {
  assert.equal(skipsGoogleAnalytics(visit('/', undefined)), true);
  assert.equal(skipsGoogleAnalytics(visit('/', null)), true);
  assert.equal(skipsGoogleAnalytics(visit('/', {})), true);
  assert.equal(skipsGoogleAnalytics(visit('/', { country: 'JP' })), false);
  assert.equal(skipsGoogleAnalytics(visit('/', { country: 'DE', isEUCountry: '1' })), true);
  assert.equal(skipsGoogleAnalytics(visit('/', { country: 'CH' })), true);
  // A spoofed header is not the decision.
  const spoofed = new Request(ORIGIN + '/', { headers: { 'cf-ipcountry': 'JP' } });
  assert.equal(skipsGoogleAnalytics(spoofed), true);
});

test('GA hosts are recognised, and nothing else', () => {
  for (const host of ['googletagmanager.com', 'www.googletagmanager.com', 'region1.google-analytics.com', 'www.google-analytics.com', 'analytics.google.com', 'region1.analytics.google.com', 'www.googletagmanager.com.']) {
    assert.equal(isGoogleAnalyticsHost(host), true, host);
  }
  for (const host of ['notgoogletagmanager.com', 'googletagmanager.com.evil.test', 'analytics.ahrefs.com', 'google.com', 'cloudflareinsights.com', '', null]) {
    assert.equal(isGoogleAnalyticsHost(host), false, String(host));
  }
});

test('document paths are told apart from assets', () => {
  for (const p of ['/', '/en/', '/blog/memo-habit', '/404.html', '/faq.htm', '/memo-inbox/LICENSE']) assert.equal(looksLikeDocumentPath(p), true, p);
  for (const p of ['/style.css', '/js/analytics.js', '/assets/og/x.png', '/data/x.json', '/sitemap.xml']) assert.equal(looksLikeDocumentPath(p), false, p);
});

// ------------------------------------- 2. 静的な HTML と _headers（Functions を通らない経路）

const SITE_CSP = (() => {
  const line = read('_headers').split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l));
  assert.ok(line, 'the site-wide CSP line');
  return line.replace(/^\s+Content-Security-Policy:\s*/, '');
})();

// 2026-11-16 まで _headers にあった CSP（GA のホストを含む）。許可する地域への HTML は、
// これと同じ集合の CSP を受け取る（計測の継続）。
const CSP_UNTIL_20261116 = "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://tools.applemediaservices.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://*.ahrefs.com https://fazier.com; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://analytics.ahrefs.com https://static.cloudflareinsights.com; connect-src 'self' https://api.simplememofast.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://analytics.google.com https://*.ahrefs.com https://cloudflareinsights.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const cspSets = (csp) => Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((p) => p[0]).map(([name, ...sources]) => [name, [...sources].sort()]));
const GA_SOURCE = /googletagmanager|google-analytics|analytics\.google/;

test('_headers does not allow GA hosts (so Functions fail-open cannot load gtag.js)', () => {
  assert.doesNotMatch(read('_headers').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'), GA_SOURCE);
  // GA4 needs these three directives to exist; the middleware appends to them.
  for (const name of Object.keys(GA_CSP_SOURCES)) assert.ok(cspSets(SITE_CSP)[name], name);
  assert.equal(withoutGoogleAnalyticsSources(SITE_CSP), SITE_CSP);
});

test('permitted regions get the same CSP as before 2026-11-17 (as sets), and nothing more', () => {
  const widened = withGoogleAnalyticsSources(SITE_CSP);
  assert.deepEqual(cspSets(widened), cspSets(CSP_UNTIL_20261116));
  assert.equal(withoutGoogleAnalyticsSources(widened), SITE_CSP);
  assert.equal(withGoogleAnalyticsSources(widened), widened, 'idempotent');
  assert.equal(withGoogleAnalyticsSources("script-src 'none'; img-src data:; default-src 'self'"),
    `script-src ${GA_CSP_SOURCES['script-src'].join(' ')}; img-src data: ${GA_CSP_SOURCES['img-src'].join(' ')}; default-src 'self'`);
  assert.equal(withGoogleAnalyticsSources("default-src 'self'"), "default-src 'self'", 'no directive is invented');
  assert.equal(withoutGoogleAnalyticsSources("script-src https://www.googletagmanager.com; img-src data:"), "script-src 'none'; img-src data:");
  assert.equal(withoutGoogleAnalyticsSources("connect-src 'self' https://*.google-analytics.com:443/g/ https://notgoogletagmanager.com"), "connect-src 'self' https://notgoogletagmanager.com");
  assert.equal(withGoogleAnalyticsSources(null), null);
  assert.equal(withoutGoogleAnalyticsSources(null), null);
});

// HTML の仕様で JavaScript として実行される type（MIME の essence）。目印の型はこれ以外。
const JS_TYPES = ['', 'module', 'importmap', 'speculationrules', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript',
  'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2',
  'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript'];

test('the marker is a data block the browser never runs or fetches', () => {
  assert.equal(GA_MARKER_TYPE, 'text/plain');
  assert.ok(!JS_TYPES.includes(GA_MARKER_TYPE.toLowerCase()));
  for (const name of [...Object.keys(GA_INLINE_LOADERS), GA_DEFERRED]) {
    const marker = name === GA_DEFERRED ? markerFor(name, '/js/analytics.js?v=0123456789') : markerFor(name);
    assert.match(marker, /^<script type="text\/plain" data-ga4="[a-z0-9-]+"(?: data-src="[^"]+")?><\/script>$/, 'no src, no body');
    assert.equal(markersIn(marker).length, 1, marker);
  }
});

test('no tracked page loads GA4 by itself: only markers, and every marker is known', () => {
  let markers = 0;
  let deferred = 0;
  const problems = [];
  for (const file of FILES) {
    const html = read(file);
    for (const problem of staticProblems(html)) problems.push(`${file}: ${problem}`);
    for (const m of markersIn(html)) { markers += 1; if (m.name === GA_DEFERRED) deferred += 1; }
  }
  assert.deepEqual(problems, []);
  // The inventory must not silently shrink to nothing (same guard as ga4-tag-order.test.mjs).
  assert.ok(markers >= 400 && deferred >= 1, `${markers} markers, ${deferred} deferred`);
});

test('the static check catches every way GA4 can come back', () => {
  const loader = `<script>${GA_INLINE_LOADERS['lang-path-4']}</script>`;
  for (const html of [
    loader,
    '<script src="/js/analytics.js?v=594a4939aa" defer></script>',
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG"></script>',
    '<link rel="preconnect" href="https://www.googletagmanager.com">',
    '<img src="https://www.google-analytics.com/collect?v=2" alt="">',
    '<!-- <script src="/js/analytics.js"></script> -->',
    '<script type="text/plain" data-ga4="no-such-loader"></script>',
    '<script type="text/plain" data-ga4="deferred" data-src="https://evil.test/x.js"></script>',
    '<script data-ga4="lang-path-4" type="text/plain"></script>',
    '<script data-ga4="lang-path-4"></script>',
  ]) assert.notDeepEqual(staticProblems(`<head>${html}</head>`), [], html);
  assert.deepEqual(staticProblems(`<head>${markerFor('lang-path-4')}${markerFor(GA_DEFERRED, '/js/analytics.js?v=594a4939aa')}</head>`), []);
  // The policy names the cookie; that is not GA4.
  assert.deepEqual(staticProblems('<li>The cookies are named <code>_ga</code> and <code>_ga_EPZVZKCVQG</code>.</li>'), []);
});

// --------------------------------------- 3. 目印を戻した本文（許可する地域・計測の継続）

// ローダー全体が 1 つの IIFE であること（ほかの処理が混ざっていない）。
const PURE_LOADER = new RegExp('^' + [
  String.raw`\(function\(\) \{ if \(!/\^\(www\\\.\)\?simplememofast\\\.com\$/\.test\(location\.hostname\)\) return;`,
  String.raw` window\.dataLayer = window\.dataLayer \|\| \[\]; function gtag\(\)\{window\.dataLayer\.push\(arguments\);\}`,
  String.raw` gtag\('js', new Date\(\)\); gtag\('config', 'G-EPZVZKCVQG'(?:, [\s\S]*?)?\);`,
  String.raw` window\.addEventListener\('load', function\(\) \{ var ric = window\.requestIdleCallback \|\| function\(cb\) \{ setTimeout\(cb, 1\); \};`,
  String.raw` ric\(function\(\) \{ var s = document\.createElement\('script'\); s\.src = 'https://www\.googletagmanager\.com/gtag/js\?id=G-EPZVZKCVQG';`,
  String.raw` s\.async = true; document\.head\.appendChild\(s\); \}\); \}\); \}\)\(\);`,
].join('') + '$');

test('the loader table holds pure GA4 loaders, and markers build nothing else', () => {
  assert.deepEqual(Object.keys(GA_INLINE_LOADERS).sort(), ['lang-en-4', 'lang-home-4', 'lang-ja-2', 'lang-none-4', 'lang-path-2', 'lang-path-4']);
  for (const [name, body] of Object.entries(GA_INLINE_LOADERS)) {
    assert.match(body.trim().replace(/\s+/g, ' '), PURE_LOADER, name);
    assert.equal(gaLoaderElement(name), `<script>${body}</script>`);
  }
  assert.equal(gaLoaderElement(GA_DEFERRED, '/js/analytics.js?v=594a4939aa'), '<script src="/js/analytics.js?v=594a4939aa" defer></script>');
  for (const [name, src] of [[GA_DEFERRED, undefined], [GA_DEFERRED, null], [GA_DEFERRED, ''], [GA_DEFERRED, '/js/analytics.js'], [GA_DEFERRED, 'https://evil.test/js/analytics.js?v=abcdef'],
    [GA_DEFERRED, '/js/analytics.js?v=abcdef" onload="x'], [GA_DEFERRED, '/js/analytics.js?v=ABCDEF'], ['toString', undefined], ['__proto__', undefined], ['', undefined], [null, undefined], ['lang-path-4 ', undefined]]) {
    assert.equal(gaLoaderElement(name, src), null, `${name} ${src}`);
  }
});

test('every page: markers come back as the loader they replaced (string and HTMLRewriter model agree)', async () => {
  const Rewriter = scriptRewriterModel();
  let pages = 0;
  for (const file of FILES) {
    const html = read(file);
    const markers = markersIn(html).length;
    const expected = activate(html);
    assert.equal(toStaticMarkers(expected), html, `${file}: round trip`);
    assert.equal(markersIn(expected).length, 0, file);
    assert.equal(loaderCount(expected), markers, `${file}: one loader per marker`);
    if (markers === 0) { assert.equal(expected, html, file); continue; }
    pages += 1;
    const out = await new Rewriter().on(GA_MARKER_SELECTOR, gaInjectionHandlers()).transform(new Response(html)).text();
    assert.equal(out, expected, `${file}: HTMLRewriter model`);
  }
  assert.ok(pages >= 400, `${pages} pages with GA4`);
});

test('the injection handlers ignore anything that is not a known marker', async () => {
  const Rewriter = scriptRewriterModel();
  const run = (html) => new Rewriter().on(GA_MARKER_SELECTOR, gaInjectionHandlers()).transform(new Response(html)).text();
  for (const html of [
    '<script type="text/plain" data-ga4="no-such-loader"></script>',
    '<script type="text/plain" data-ga4="deferred" data-src="https://evil.test/a.js?v=abcdef"></script>',
    '<script type="text/plain" data-ga4="deferred"></script>',
    '<script data-ga4="lang-path-4"></script>',
    '<script type="module" data-ga4="lang-path-4"></script>',
    '<script>var x = "<script type=\\"text/plain\\" data-ga4=\\"lang-path-4\\">";</script>',
    '<!-- <script type="text/plain" data-ga4="lang-path-4"></script> -->',
  ]) assert.equal(await run(html), html, html);
});

// ---------------------------------------------- 4. middleware（_headers から作った静的ファイル）

const compiled = compileRules(constructRules(parseHeaders(read('_headers')))).compiled;

function visit(urlPath, cf, init = {}) {
  const request = new Request(ORIGIN + urlPath, init);
  if (cf !== undefined) Object.defineProperty(request, 'cf', { value: cf });
  return request;
}

function assetFor(file, { status = 200, contentType = 'text/html; charset=utf-8' } = {}) {
  return (request) => {
    const headers = staticAssetHeaders(compiled, request.url, { status });
    headers.set('content-type', contentType);
    headers.set('etag', '"asset"');
    headers.set('last-modified', 'Mon, 16 Nov 2026 00:00:00 GMT');
    const body = request.method === 'HEAD' ? null : file ? read(file) : 'body{}';
    return new Response(body, { status, headers });
  };
}

async function serve(request, asset, options = {}) {
  // `Rewriter: undefined` means a runtime without HTMLRewriter (not the default model).
  const Rewriter = 'Rewriter' in options ? options.Rewriter : scriptRewriterModel();
  const forwarded = [];
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'HTMLRewriter');
  if (Rewriter === undefined) delete globalThis.HTMLRewriter; else globalThis.HTMLRewriter = Rewriter;
  try {
    const response = await onRequest({
      request,
      next: async (input) => { const r = input === undefined ? request : input; forwarded.push(r); return asset(r); },
      env: {}, params: {}, data: {}, waitUntil() {}, passThroughOnException() {},
    });
    return { response, body: response.body === null ? null : await response.text(), forwarded };
  } finally {
    if (saved) Object.defineProperty(globalThis, 'HTMLRewriter', saved); else delete globalThis.HTMLRewriter;
  }
}

// 6 通りのローダーと deferred を 1 つずつ含む（下の検査で確かめる）。
const CASES = [
  ['/', 'index.html'],
  ['/en/', 'en/index.html'],
  ['/legal', 'legal.html'],
  ['/ar/faq', 'ar/faq.html'],
  ['/en/blog/ai-information-workflow', 'en/blog/ai-information-workflow.html'],
  ['/ar/obsidian/backup/', 'ar/obsidian/backup/index.html'],
  ['/ar/blog/best-note-to-self-apps-2026', 'ar/blog/best-note-to-self-apps-2026.html'],
  ['/tiktok/', 'tiktok/index.html'],
];
const CONSENT_VISITORS = [{ country: 'FR', isEUCountry: '1' }, { country: 'DE' }, { country: 'GB' }, { country: 'CH' }, { country: 'NO' },
  { country: 'XX' }, { country: 'T1' }, { country: 'JP', isEUCountry: '1' }, {}, null, undefined];
const PERMITTED_VISITORS = [{ country: 'JP' }, { country: 'US' }, { country: 'KR', isEUCountry: false }];

test('the cases cover every loader shape', () => {
  const names = new Set(CASES.flatMap(([, file]) => markersIn(read(file)).map((m) => m.name)));
  assert.deepEqual([...names].sort(), [...Object.keys(GA_INLINE_LOADERS), GA_DEFERRED].sort());
});

test('EEA, UK, Swiss and unknown visitors get the static file untouched: no GA4, no GA hosts in the CSP', async () => {
  for (const cf of CONSENT_VISITORS) {
    for (const [urlPath, file] of CASES) {
      const where = `${urlPath} ${JSON.stringify(cf)}`;
      const asset = assetFor(file);
      const original = asset(new Request(ORIGIN + urlPath));
      const { response, body } = await serve(visit(urlPath, cf), asset);
      assert.equal(response.status, 200, where);
      assert.equal(body, read(file), where);
      assert.equal(executableGa(body), false, where);
      const expected = new Headers(original.headers);
      expected.set('cloudflare-cdn-cache-control', 'no-store');
      assert.deepEqual(Object.fromEntries(response.headers), Object.fromEntries(expected), where);
      assert.doesNotMatch(response.headers.get('content-security-policy'), GA_SOURCE, where);
      assert.equal(response.headers.get('set-cookie'), null, where);
    }
  }
});

test('visitors from elsewhere get the page with GA4 back in place, marked never to be stored by the edge', async () => {
  for (const cf of PERMITTED_VISITORS) {
    for (const [urlPath, file] of CASES) {
      const where = `${urlPath} ${cf.country}`;
      const asset = assetFor(file);
      const original = asset(new Request(ORIGIN + urlPath));
      const { response, body } = await serve(visit(urlPath, cf), asset);
      assert.equal(response.status, 200, where);
      assert.equal(body, activate(read(file)), where);
      assert.equal(loaderCount(body), markersIn(read(file)).length, where);
      const expected = new Headers(original.headers);
      expected.set('cloudflare-cdn-cache-control', 'no-store');
      expected.set('content-security-policy', withGoogleAnalyticsSources(SITE_CSP));
      expected.delete('etag');
      expected.delete('last-modified');
      assert.deepEqual(Object.fromEntries(response.headers), Object.fromEntries(expected), where);
      assert.equal(response.headers.get('cache-control'), 'public, no-cache', `${where}: the cache contract`);
    }
  }
});

test('validators: stripped for permitted documents, forwarded otherwise; 304s pass through', async () => {
  const conditional = { headers: { 'if-none-match': '"asset"', 'if-modified-since': 'Mon, 16 Nov 2026 00:00:00 GMT' } };
  const notModified = () => new Response(null, { status: 304, headers: { etag: '"asset"', 'cache-control': 'public, no-cache' } });
  // A browser that kept the static version (from a visit in the EEA) must get GA4 again here.
  const jp = await serve(visit('/', { country: 'JP' }, conditional), assetFor('index.html'));
  assert.equal(jp.forwarded.length, 1);
  assert.equal(jp.forwarded[0].headers.get('if-none-match'), null);
  assert.equal(jp.forwarded[0].headers.get('if-modified-since'), null);
  assert.equal(jp.response.status, 200);
  assert.equal(jp.body, activate(read('index.html')));
  // The static version is the same for everyone, so its validators stay valid in the EEA.
  const fr = await serve(visit('/', { country: 'FR' }, conditional), notModified);
  assert.equal(fr.forwarded[0].headers.get('if-none-match'), '"asset"');
  assert.equal(fr.response.status, 304);
  assert.equal(fr.response.headers.get('etag'), '"asset"');
  // Assets keep their validators in every country.
  for (const cf of [{ country: 'JP' }, { country: 'FR' }]) {
    const css = await serve(visit('/style.css', cf, conditional), assetFor(null, { contentType: 'text/css' }));
    assert.equal(css.forwarded[0].headers.get('if-none-match'), '"asset"');
    assert.equal(css.response.headers.get('etag'), '"asset"');
    assert.equal(css.response.headers.get('cloudflare-cdn-cache-control'), null);
    assert.equal(css.body, 'body{}');
  }
});

test('the 404 page and HEAD requests follow the same policy', async () => {
  const missingJp = await serve(visit('/no-such-page', { country: 'JP' }), assetFor('404.html', { status: 404 }));
  assert.equal(missingJp.response.status, 404);
  assert.equal(missingJp.body, activate(read('404.html')));
  assert.equal(loaderCount(missingJp.body), 1);
  assert.equal(missingJp.response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  const missingDe = await serve(visit('/no-such-page', { country: 'DE' }), assetFor('404.html', { status: 404 }));
  assert.equal(missingDe.body, read('404.html'));
  assert.equal(executableGa(missingDe.body), false);
  const headJp = await serve(visit('/', { country: 'JP' }, { method: 'HEAD' }), assetFor('index.html'));
  assert.equal(headJp.body, null);
  assert.equal(headJp.response.headers.get('content-security-policy'), withGoogleAnalyticsSources(SITE_CSP));
  assert.equal(headJp.response.headers.get('etag'), null);
  assert.equal(headJp.response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  const headFr = await serve(visit('/', { country: 'FR' }, { method: 'HEAD' }), assetFor('index.html'));
  assert.equal(headFr.body, null);
  assert.doesNotMatch(headFr.response.headers.get('content-security-policy'), GA_SOURCE);
  assert.equal(headFr.response.headers.get('etag'), '"asset"');
});

test('fail closed: no HTMLRewriter, partial or error responses, other methods get no GA4', async () => {
  const noRewriter = await serve(visit('/', { country: 'JP' }), assetFor('index.html'), { Rewriter: undefined });
  assert.equal(noRewriter.body, read('index.html'));
  assert.doesNotMatch(noRewriter.response.headers.get('content-security-policy'), GA_SOURCE);
  assert.equal(noRewriter.response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  for (const status of [206, 500, 503]) {
    const r = await serve(visit('/', { country: 'JP' }), assetFor('index.html', { status }));
    assert.equal(r.body, read('index.html'), String(status));
    assert.doesNotMatch(r.response.headers.get('content-security-policy'), GA_SOURCE, String(status));
  }
  const post = await serve(visit('/', { country: 'JP' }, { method: 'POST', body: 'x' }), assetFor('index.html'));
  assert.equal(post.body, read('index.html'));
  assert.doesNotMatch(post.response.headers.get('content-security-policy'), GA_SOURCE);
});

test('Functions fail-open: the static file alone (what _headers sends) carries no GA4 anywhere', () => {
  for (const [urlPath, file] of CASES) {
    const response = assetFor(file)(new Request(ORIGIN + urlPath));
    assert.doesNotMatch(response.headers.get('content-security-policy'), GA_SOURCE, urlPath);
    assert.equal(response.headers.get('cloudflare-cdn-cache-control'), null, urlPath);
  }
  // Every page, every marker: covered by "no tracked page loads GA4 by itself".
});

test('redirects, 404s and 410s from the middleware are unchanged for every visitor', async () => {
  const never = () => { throw new Error('must not reach the asset server'); };
  for (const cf of [{ country: 'FR' }, { country: 'JP' }]) {
    const html = await serve(visit('/blog/memo-shuukan-tips.html?lang=ja', cf), never);
    assert.equal(html.response.status, 301);
    assert.equal(html.response.headers.get('location'), ORIGIN + '/blog/memo-habit');
    assert.equal((await serve(visit('/docs/x.md', cf), never)).response.status, 404);
    assert.equal((await serve(visit('/blog/energy-budget-field-notes', cf), never)).response.status, 410);
  }
});

// ------------------------------------------------ 6. 既存の Cookie を消す動作（既定で無効）

test('expiring existing GA cookies is off unless the owner turns it on', async () => {
  assert.equal(EXPIRE_EXISTING_GA_COOKIES, false, 'deleting visitors\' cookies needs the owner\'s approval and a policy line');
  assert.deepEqual(GA_COOKIE_NAMES, ['_ga', `_ga_${GA_MEASUREMENT_ID.slice(2)}`]);
  const cookie = { headers: { cookie: 'x=1; _ga=GA1.1.1.1; _ga_EPZVZKCVQG=GS2.1.s1' } };
  const off = await serve(visit('/', { country: 'FR' }, cookie), assetFor('index.html'));
  assert.equal(off.response.headers.get('set-cookie'), null);
  // Turned on: only consent-region HTML, only the GA cookies the browser sent.
  const run = (cf, init) => { const request = visit('/', cf, init); return applyAnalyticsPolicy({ request, next: async () => assetFor('index.html')(request) }, { expireCookies: true, Rewriter: scriptRewriterModel() }); };
  const on = await run({ country: 'FR' }, cookie);
  assert.deepEqual(on.headers.getSetCookie(), [
    '_ga=; Domain=simplememofast.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; SameSite=Lax',
    '_ga_EPZVZKCVQG=; Domain=simplememofast.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; SameSite=Lax',
  ]);
  assert.deepEqual((await run({ country: 'JP' }, cookie)).headers.getSetCookie(), []);
  assert.deepEqual((await run({ country: 'FR' }, {})).headers.getSetCookie(), []);
  assert.deepEqual(gaCookieExpiry('x_ga=1; _gax=2; _ga_OTHER=3'), []);
  assert.deepEqual(gaCookieExpiry(' _ga = 1 ').length, 1);
  assert.deepEqual(gaCookieExpiry(null), []);
});
