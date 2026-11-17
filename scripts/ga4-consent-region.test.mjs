// GA4 は EEA・英国・スイス（と国が分からない訪問）では読み込まない（EU 監査 E34・D11）。
// functions/lib/ga-geo.js と、それを呼ぶ functions/_middleware.js の検査。SEO Validation で走る。
//
// HTMLRewriter は Workers の実行環境にしか無いので、ここでは scripts/lib/html-rewriter-model.mjs
// （lol-html の "script" まわりの模型）で動かす。模型と本物の一致は CI では確かめられない
// （workerd が無い）。2026-11-16 に手元の workerd で、全 HTML について出力の一致を確かめた。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CONSENT_REGIONS, GA_MEASUREMENT_ID, isConsentRegion, skipsGoogleAnalytics, isGoogleAnalyticsHost,
  isGoogleAnalyticsScriptSrc, isGoogleAnalyticsInlineScript, withoutGoogleAnalyticsSources,
  gaScriptHandlers, looksLikeDocumentPath, applyAnalyticsPolicy,
} from '../functions/lib/ga-geo.js';
import { onRequest } from '../functions/_middleware.js';
import { rewriteScripts, scriptRewriterModel } from './lib/html-rewriter-model.mjs';
import { parseHeaders, constructRules, compileRules, staticAssetHeaders } from './lib/pages-headers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://simplememofast.com';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const GA_TRACE = /G-EPZVZKCVQG|googletagmanager|\/js\/analytics\.js/;

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
  const visit = (cf) => { const r = new Request(ORIGIN + '/'); if (cf !== undefined) Object.defineProperty(r, 'cf', { value: cf }); return r; };
  assert.equal(skipsGoogleAnalytics(visit(undefined)), true);
  assert.equal(skipsGoogleAnalytics(visit(null)), true);
  assert.equal(skipsGoogleAnalytics(visit({})), true);
  assert.equal(skipsGoogleAnalytics(visit({ country: 'JP' })), false);
  assert.equal(skipsGoogleAnalytics(visit({ country: 'DE', isEUCountry: '1' })), true);
  assert.equal(skipsGoogleAnalytics(visit({ country: 'CH' })), true);
  // A spoofed header is not the decision.
  const spoofed = new Request(ORIGIN + '/', { headers: { 'cf-ipcountry': 'JP' } });
  assert.equal(skipsGoogleAnalytics(spoofed), true);
});

test('GA hosts, script sources and inline loaders are recognised, and nothing else', () => {
  for (const host of ['googletagmanager.com', 'www.googletagmanager.com', 'region1.google-analytics.com', 'www.google-analytics.com', 'analytics.google.com', 'region1.analytics.google.com', 'www.googletagmanager.com.']) {
    assert.equal(isGoogleAnalyticsHost(host), true, host);
  }
  for (const host of ['notgoogletagmanager.com', 'googletagmanager.com.evil.test', 'analytics.ahrefs.com', 'google.com', 'cloudflareinsights.com', '', null]) {
    assert.equal(isGoogleAnalyticsHost(host), false, String(host));
  }
  for (const src of [`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`, '//www.googletagmanager.com/gtag/js', 'https://www.google-analytics.com/analytics.js',
    '/js/analytics.js?v=594a4939aa', '/js/analytics.js', 'https://simplememofast.com/js/analytics.js', ' /js/analytics.js ']) {
    assert.equal(isGoogleAnalyticsScriptSrc(src), true, src);
  }
  for (const src of ['https://analytics.ahrefs.com/analytics.js', '/js/app-store-tracking.js?v=1', '/js/analytics.json', '/js/analytics.js.map',
    'https://static.cloudflareinsights.com/beacon.min.js', 'https://example.com/js/analytics.js', '', '   ', null, 'http://[bad']) {
    assert.equal(isGoogleAnalyticsScriptSrc(src), false, String(src));
  }
  assert.equal(isGoogleAnalyticsInlineScript(read('index.html').match(/<script>([^<]*G-EPZVZKCVQG[^<]*)<\/script>/)[1]), true);
  assert.equal(isGoogleAnalyticsInlineScript("window.dataLayer = window.dataLayer || []; window.dataLayer.push({event:'ai_tags_cta_click'});"), false);
  assert.equal(isGoogleAnalyticsInlineScript('{"@context":"https://schema.org"}'), false);
});

const SITE_CSP = (() => {
  const line = read('_headers').split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l));
  assert.ok(line, 'the site-wide CSP line');
  return line.replace(/^\s+Content-Security-Policy:\s*/, '');
})();

test('the CSP loses the GA hosts and nothing else', () => {
  assert.match(SITE_CSP, /googletagmanager/, 'the fixture must still contain GA for this test to mean anything');
  const narrowed = withoutGoogleAnalyticsSources(SITE_CSP);
  assert.doesNotMatch(narrowed, /googletagmanager|google-analytics|analytics\.google/);
  const directives = (csp) => csp.split(';').map((d) => d.trim()).filter(Boolean);
  const before = directives(SITE_CSP);
  const after = directives(narrowed);
  assert.deepEqual(after.map((d) => d.split(/\s+/)[0]), before.map((d) => d.split(/\s+/)[0]), 'same directives, same order');
  for (const [i, d] of before.entries()) {
    const kept = d.split(/\s+/).filter((s) => !/googletagmanager|google-analytics|analytics\.google/.test(s));
    assert.equal(after[i], kept.join(' '), d.split(/\s+/)[0]);
  }
  for (const keep of ["'self'", "'unsafe-inline'", 'https://analytics.ahrefs.com', 'https://static.cloudflareinsights.com', 'https://cloudflareinsights.com',
    'https://api.simplememofast.com', 'https://tools.applemediaservices.com', 'https://*.ahrefs.com', 'https://fazier.com', "frame-ancestors 'none'", "form-action 'self'"]) {
    assert.ok(narrowed.includes(keep), keep);
  }
  assert.equal(withoutGoogleAnalyticsSources("script-src https://www.googletagmanager.com; img-src data:"), "script-src 'none'; img-src data:");
  assert.equal(withoutGoogleAnalyticsSources("connect-src 'self' https://*.google-analytics.com:443/g/ https://notgoogletagmanager.com"), "connect-src 'self' https://notgoogletagmanager.com");
  assert.equal(withoutGoogleAnalyticsSources("default-src 'self'; ; sandbox"), "default-src 'self'; sandbox");
  assert.equal(withoutGoogleAnalyticsSources(null), null);
});

test('document paths are told apart from assets', () => {
  for (const p of ['/', '/en/', '/blog/memo-habit', '/404.html', '/faq.htm', '/memo-inbox/LICENSE']) assert.equal(looksLikeDocumentPath(p), true, p);
  for (const p of ['/style.css', '/js/analytics.js', '/assets/og/x.png', '/data/x.json', '/sitemap.xml']) assert.equal(looksLikeDocumentPath(p), false, p);
});

// 実装とは別の書き方で「GA を除いた HTML」を作る（模型と handlers の両方を検算する）。
function expectedWithoutGa(html) {
  return html
    .replace(/<script\b[^>]*\bsrc="\/js\/analytics\.js(?:\?[^"]*)?"[^>]*>\s*<\/script\s*>/g, '')
    .replace(/<script>([\s\S]*?)<\/script>/g, (whole, body) => (body.includes(GA_MEASUREMENT_ID) ? '<script></script>' : whole));
}

// ローダー全体が 1 つの IIFE であること。ほかの処理が同じ script に混ざっていたら、
// 中身を空にするとその処理も消える。新しい形は、混ざっていないことを確かめてからここへ足す。
const PURE_LOADER = new RegExp('^' + [
  String.raw`\(function\(\) \{ if \(!/\^\(www\\\.\)\?simplememofast\\\.com\$/\.test\(location\.hostname\)\) return;`,
  String.raw` window\.dataLayer = window\.dataLayer \|\| \[\]; function gtag\(\)\{window\.dataLayer\.push\(arguments\);\}`,
  String.raw` gtag\('js', new Date\(\)\); gtag\('config', 'G-EPZVZKCVQG'(?:, [\s\S]*?)?\);`,
  String.raw` window\.addEventListener\('load', function\(\) \{ var ric = window\.requestIdleCallback \|\| function\(cb\) \{ setTimeout\(cb, 1\); \};`,
  String.raw` ric\(function\(\) \{ var s = document\.createElement\('script'\); s\.src = 'https://www\.googletagmanager\.com/gtag/js\?id=G-EPZVZKCVQG';`,
  String.raw` s\.async = true; document\.head\.appendChild\(s\); \}\); \}\); \}\)\(\);`,
].join('') + '$');

test('every tracked page loses all of GA4 and only GA4 (model of HTMLRewriter)', () => {
  const files = execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean);
  let tagged = 0;
  let loaders = 0;
  let deferred = 0;
  for (const file of files) {
    const html = read(file);
    for (const [, body] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)) {
      if (!isGoogleAnalyticsInlineScript(body)) continue;
      loaders += 1;
      assert.match(body.trim().replace(/\s+/g, ' '), PURE_LOADER, `${file}: an inline script with the GA ID is not a pure loader; emptying it would remove other code`);
    }
    deferred += (html.match(/<script\b[^>]*\bsrc="\/js\/analytics\.js/g) || []).length;
    const out = rewriteScripts(html, [gaScriptHandlers()]);
    if (GA_TRACE.test(html)) tagged += 1;
    assert.doesNotMatch(out, GA_TRACE, `${file}: GA4 is still referenced`);
    assert.equal(out, expectedWithoutGa(html), `${file}: something other than GA4 changed`);
  }
  // The inventory must not silently shrink to nothing (same guard as ga4-tag-order.test.mjs).
  assert.ok(tagged >= 400, `only ${tagged} pages reference GA4`);
  assert.ok(loaders >= 400 && deferred >= 1, `${loaders} inline loaders, ${deferred} deferred loaders`);
});

test('the handlers give the same result however lol-html chunks the text', () => {
  for (const file of ['index.html', 'legal.html', '404.html', 'ai-tags/index.html', 'tr/faq.html']) {
    const html = read(file);
    const reference = rewriteScripts(html, [gaScriptHandlers()]);
    for (const opts of [{ chunkSize: 1, trailingEmptyChunk: true }, { chunkSize: 1, trailingEmptyChunk: false }, { chunkSize: 7, trailingEmptyChunk: false }, { chunkSize: 1e9, trailingEmptyChunk: true }, { chunkSize: 1e9, trailingEmptyChunk: false }]) {
      assert.equal(rewriteScripts(html, [gaScriptHandlers()], opts), reference, `${file} ${JSON.stringify(opts)}`);
    }
  }
  // Inline content goes back as raw text. Without { html: true } the model escapes it,
  // as lol-html does, and this breaks.
  const js = '<script>if (a < b && c > "d") {}</script>';
  assert.equal(rewriteScripts(js, [gaScriptHandlers()], { chunkSize: 3 }), js);
  assert.equal(rewriteScripts('<!-- <script src="/js/analytics.js"></script> -->', [gaScriptHandlers()]), '<!-- <script src="/js/analytics.js"></script> -->');
});

// --- the root middleware, end to end, with the asset server modelled from _headers ---

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

async function serve(request, asset, { Rewriter = scriptRewriterModel() } = {}) {
  const forwarded = [];
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'HTMLRewriter');
  globalThis.HTMLRewriter = Rewriter;
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

const CASES = [
  ['/', 'index.html'],
  ['/en/', 'en/index.html'],
  ['/legal', 'legal.html'],
  ['/ar/faq', 'ar/faq.html'],
];

test('EEA, UK, Swiss and unknown visitors get the page without GA4, with the same cache policy', async () => {
  for (const cf of [{ country: 'FR', isEUCountry: '1' }, { country: 'GB' }, { country: 'CH' }, { country: 'NO' }, { country: 'XX' }, { country: 'T1' }, undefined]) {
    for (const [urlPath, file] of CASES) {
      const where = `${urlPath} ${JSON.stringify(cf)}`;
      const asset = assetFor(file);
      const original = asset(new Request(ORIGIN + urlPath));
      const { response, body } = await serve(visit(urlPath, cf), asset);
      assert.equal(response.status, 200, where);
      assert.equal(body, expectedWithoutGa(read(file)), where);
      assert.doesNotMatch(body, GA_TRACE, where);
      assert.match(body, /analytics\.ahrefs\.com/, `${where}: Ahrefs is a separate decision and stays`);
      assert.equal(response.headers.get('cache-control'), original.headers.get('cache-control'), where);
      assert.equal(response.headers.get('cache-control'), 'public, no-cache', where);
      assert.equal(response.headers.get('expires'), null, where);
      assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store', where);
      assert.equal(response.headers.get('etag'), null, `${where}: the asset's validator does not validate the rewritten body`);
      assert.equal(response.headers.get('last-modified'), null, where);
      assert.equal(response.headers.get('content-security-policy'), withoutGoogleAnalyticsSources(SITE_CSP), where);
      assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8', where);
      assert.equal(response.headers.get('x-frame-options'), 'DENY', where);
    }
  }
});

test('visitors from elsewhere get the page unchanged, marked not to be shared by the edge cache', async () => {
  for (const cf of [{ country: 'JP' }, { country: 'US' }, { country: 'KR', isEUCountry: false }]) {
    for (const [urlPath, file] of CASES) {
      const where = `${urlPath} ${cf.country}`;
      const asset = assetFor(file);
      const original = asset(new Request(ORIGIN + urlPath));
      const { response, body } = await serve(visit(urlPath, cf), asset);
      assert.equal(body, read(file), where);
      const expected = new Headers(original.headers);
      expected.set('cloudflare-cdn-cache-control', 'no-store');
      assert.deepEqual(Object.fromEntries(response.headers), Object.fromEntries(expected), where);
    }
  }
});

test('validators: stripped for EEA documents, forwarded otherwise; 304s pass through', async () => {
  const conditional = { headers: { 'if-none-match': '"asset"', 'if-modified-since': 'Mon, 16 Nov 2026 00:00:00 GMT' } };
  // A browser that cached the GA4 version elsewhere must not reuse it here via 304.
  const fr = await serve(visit('/', { country: 'FR' }, conditional), assetFor('index.html'));
  assert.equal(fr.forwarded.length, 1);
  assert.equal(fr.forwarded[0].headers.get('if-none-match'), null);
  assert.equal(fr.forwarded[0].headers.get('if-modified-since'), null);
  assert.equal(fr.response.status, 200);
  assert.doesNotMatch(fr.body, GA_TRACE);
  // Elsewhere the request goes on as it came.
  const notModified = (request) => new Response(null, { status: 304, headers: { etag: '"asset"', 'cache-control': 'public, no-cache' } });
  const jp = await serve(visit('/', { country: 'JP' }, conditional), notModified);
  assert.equal(jp.forwarded[0].headers.get('if-none-match'), '"asset"');
  assert.equal(jp.response.status, 304);
  // Assets keep their validators in every country (only documents carry GA4).
  const css = await serve(visit('/style.css', { country: 'FR' }, conditional), assetFor(null, { contentType: 'text/css' }));
  assert.equal(css.forwarded[0].headers.get('if-none-match'), '"asset"');
  assert.equal(css.response.headers.get('etag'), '"asset"');
  assert.equal(css.response.headers.get('cloudflare-cdn-cache-control'), null);
});

test('the 404 page and HEAD requests follow the same policy', async () => {
  const missing = await serve(visit('/no-such-page', { country: 'DE' }), assetFor('404.html', { status: 404 }));
  assert.equal(missing.response.status, 404);
  assert.doesNotMatch(missing.body, GA_TRACE);
  assert.equal(missing.response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  const head = await serve(visit('/', { country: 'FR' }, { method: 'HEAD' }), assetFor('index.html'));
  assert.equal(head.body, null);
  assert.doesNotMatch(head.response.headers.get('content-security-policy'), /googletagmanager/);
  assert.equal(head.response.headers.get('etag'), null);
});

test('without an HTMLRewriter the CSP still keeps gtag.js from loading (fail closed)', async () => {
  const request = visit('/', { country: 'FR' });
  const response = await applyAnalyticsPolicy({ request, next: async () => assetFor('index.html')(request) }, { Rewriter: undefined });
  assert.doesNotMatch(response.headers.get('content-security-policy'), /googletagmanager|google-analytics/);
  assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
});

test('redirects, 404s and 410s from the middleware are unchanged for EEA visitors', async () => {
  const never = () => { throw new Error('must not reach the asset server'); };
  const html = await serve(visit('/blog/memo-shuukan-tips.html?lang=ja', { country: 'FR' }), never);
  assert.equal(html.response.status, 301);
  assert.equal(html.response.headers.get('location'), ORIGIN + '/blog/memo-habit');
  assert.equal((await serve(visit('/docs/x.md', { country: 'FR' }), never)).response.status, 404);
  assert.equal((await serve(visit('/blog/energy-budget-field-notes', { country: 'FR' }), never)).response.status, 410);
});
