import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRouteInventory, classifyAcquisitionUrl, inspectPage, isPublicSourcePath, sitemapUrls, main } from './site-route-inventory.mjs';

const apple = 'https://apps.apple.com/jp/app/id6758438948';
const pilot = 'https://simplememofast.onelink.me/it5q/l250gib4';
const wide = 'https://simplememofast.onelink.me/it5q?pid=owned_web&c=website_bridge_v1';
const tracker = '<script defer src="/js/app-store-tracking.js?v=123"></script>';
const banner = '<meta name="apple-itunes-app" content="app-id=6758438948">';
const anchor = (href, attrs = '') => `<a href="${href}" ${attrs}>Get app</a>`;
const optInTracker = tracker.replace(' defer', ' data-sitewide-app-routes="true" defer');
const trackerSource = fs.readFileSync(new URL('../js/app-store-tracking.js', import.meta.url), 'utf8');

test('URL classes keep the exact pilot, sitewide long/short links and QA distinct', () => {
  assert.equal(classifyAcquisitionUrl(apple).route, 'direct_apple');
  assert.equal(classifyAcquisitionUrl(pilot).route, 'onelink_pilot');
  assert.equal(classifyAcquisitionUrl(wide).route, 'onelink_sitewide');
  assert.equal(classifyAcquisitionUrl(wide.replace('/it5q?', '/it5q/abcd1234?')).route, 'onelink_sitewide');
  assert.equal(classifyAcquisitionUrl(wide.replace('&', '&amp;')).route, 'onelink_sitewide');
  for (const url of [pilot + '?pid=owned_web&c=website_bridge_v1', pilot + '#changed',
    wide + '&c=another', wide.replace('owned_web', 'other'), wide.replace('website_bridge_v1', 'unknown')])
    assert.equal(classifyAcquisitionUrl(url).route, 'onelink_unclassified');
  for (const url of [wide.replace('/it5q?', '/it5q/4x0jfkpw?'), wide.replace('owned_web', 'seo_aio_qa'),
    wide.replace('/it5q?', '/it5q/4x0jfkpw/?'),
    wide.replace('website_bridge_v1', 'obsidian_bridge_qa_20260907')])
    assert.equal(classifyAcquisitionUrl(url).route, 'onelink_qa');
});

test('URL classification rejects host/app spoofing and never counts navigation placeholders', () => {
  for (const href of ['https://apps.apple.com.evil.test/jp/app/id6758438948',
    'https://apps.apple.com/jp/app/id67584389480', 'https://apps.apple.com/jp/app/id123',
    'https://simplememofast.onelink.me@evil.test/it5q/l250gib4',
    'https://user:password@simplememofast.onelink.me/it5q/l250gib4', '#', '#section', '', undefined])
    assert.equal(classifyAcquisitionUrl(href), null);
  assert.deepEqual(classifyAcquisitionUrl(apple.replace('https:', 'http:')), { route: 'direct_apple', https: false });
});

test('app utility, Universal Link and web app routes remain separate from install attribution', () => {
  assert.equal(classifyAcquisitionUrl('/compose').route, 'universal_link');
  assert.equal(classifyAcquisitionUrl('/verify.html?code=000000').route, 'universal_link');
  assert.equal(classifyAcquisitionUrl('/en/compose').route, 'localized_app_utility');
  assert.equal(classifyAcquisitionUrl('/memo-inbox/').route, 'web_app');
  assert.equal(classifyAcquisitionUrl('/memo-inbox/guide'), null);
  assert.equal(classifyAcquisitionUrl('simplememo://compose').route, 'custom_app_scheme');
  assert.equal(classifyAcquisitionUrl('obsidian://open?vault=example'), null);
});

test('HTML tokenizer ignores comments/raw text/templates while preserving quoted attributes', () => {
  const hidden = anchor(apple);
  const html = `<head>${banner}${tracker}</head><!-- ${hidden} -->`
    + `<script>const example = '${hidden}';</script><style>${hidden}</style><textarea>${hidden}</textarea>`
    + `<template>${hidden}<template>${hidden}</template></template>`
    + `<A HREF='${apple}?ct=a&gt;b' DATA-CTA-PLACEMENT=hero>${'Download'}</A>`
    + `<a href='https://example.test' href='${apple}'>duplicate attr</a>`;
  const page = inspectPage({ file: 'index.html', html });
  assert.equal(page.placements.filter(p => p.route === 'direct_apple').length, 1);
  assert.equal(page.placements.find(p => p.route === 'direct_apple').placement, 'hero');
  assert.equal(page.placements.filter(p => p.route === 'smart_app_banner').length, 1);
  assert.equal(page.store_tracker_script_declared, true);
});

test('native banners, QR declarations and dynamic app placeholders are counted without simulated events', () => {
  const page = inspectPage({ file: 'compose.html', html: `<head>${banner}</head>${banner}`
    + '<img src="/assets/img/qr-obsidian-ja.svg"><img src="/assets/img/qr-obsidian-ja.svg">'
    + '<img src="https://elsewhere.test/assets/img/qr-other.svg"><a id="appLinkJa" href="#">Open</a>' });
  assert.equal(page.placements.filter(p => p.route === 'smart_app_banner').length, 1);
  assert.equal(page.placements.filter(p => p.route === 'qr_image').length, 2);
  assert.equal(new Set(page.qr_assets).size, 1);
  assert.equal(page.placements.filter(p => p.route === 'app_link_placeholder').length, 1);
  assert.equal(page.placements.filter(p => p.route === 'universal_link').length, 0);
  assert.equal(page.store_tracker_script_declared, false);
});

test('sitemap membership uses only own-site urlset locations and normalizes extension variants', () => {
  assert.equal(isPublicSourcePath('drafts/index.html'), false);
  assert.equal(isPublicSourcePath('en/vs/drafts/index.html'), true);
  assert.equal(isPublicSourcePath('en/.private/index.html'), false);
  const urls = sitemapUrls('<urlset><url><loc>https://simplememofast.com/faq.html</loc>'
    + '<xhtml:link href="https://simplememofast.com/other"/></url>'
    + '<url><loc>https://evil.test/foreign</loc></url></urlset>');
  assert.deepEqual(urls, ['https://simplememofast.com/faq.html']);
  assert.deepEqual(sitemapUrls('<sitemapindex><sitemap><loc>https://simplememofast.com/sitemap-ja.xml</loc></sitemap></sitemapindex>'), []);
  const result = buildRouteInventory({ pages: [{ file: 'faq.html', html: tracker + anchor(apple) },
    { file: 'compose.html', html: '<head><meta name="robots" content="noindex"></head>' + anchor(apple) },
    { file: 'admin/index.html', html: anchor(apple) }, { file: 'templates/index.html', html: banner }], urls });
  assert.equal(result.public_source.pages, 3);
  assert.equal(result.sitemap_listed.pages, 1);
  assert.equal(result.public_source.meta_noindex_pages, 1);
  assert.equal(result.public_source.routes.direct_apple.placements, 2);
  assert.equal(result.public_source.routes.direct_apple.placements_on_pages_with_tracker_script, 1);
  assert.equal(result.evidence_kind, 'source_declared'); assert.equal(result.traffic_coverage, null);
  assert.equal(buildRouteInventory({ pages: [{ file: 'faq.html', html: '' }],
    urls: ['https://evil.test/faq', 'not-a-url'] }).sitemap_listed.pages, 0);
});

test('offline evaluation uses the actual tracker predicate without mistaking source Apple hrefs for unsupported routes', () => {
  const html = optInTracker + anchor(apple + '?ct=web_other_v1&pt=128498560&mt=8')
    + anchor(apple + '?unknown=example') + anchor(apple + '?ct=web_other_v1&ct=web_other_v1')
    + anchor(apple + '#section') + anchor(apple.replace('https:', 'http:'))
    + anchor(apple) + anchor(apple.replace('/jp/', '/us/'))
    + anchor(apple + '?see-all=reviews') + anchor(apple + '#information')
    + anchor(pilot, 'data-app-route="onelink" data-app-traffic="pilot"');
  const result = buildRouteInventory({ pages: [{ file: 'index.html', html }], trackerSource });
  assert.equal(result.public_source.routes.direct_apple.placements, 9);
  assert.equal(result.public_source.sitewide_runtime.eligible_direct_placements, 1);
  assert.deepEqual(result.public_source.sitewide_runtime.direct_placement_statuses,
    { 'unsupported-apple-attribution': 1, 'unsupported-parameters': 2,
      'unsupported-fragment': 1, 'unsupported-url': 1, converted: 1,
      'unsupported-storefront': 1, 'unsupported-reference': 2 });
  assert.equal(result.public_source.sitewide_runtime.eligible_direct_pages, 1);
  assert.equal(result.public_source.sitewide_runtime.opt_in_pages, 1);
  assert.equal(result.public_source.sitewide_runtime.offline_predicate_evaluated_pages, 1);
  assert.equal(result.pages[0].placements.find(p => p.route === 'onelink_pilot').offline_route_status,
    'preserved_existing_onelink');
  assert.match(result.offline_runtime_evaluation.tracker_source_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.offline_runtime_evaluation.browser_executed, false);
  assert.equal(result.offline_runtime_evaluation.events_dispatched, false);
  assert.equal(JSON.stringify(result).includes('unknown=example'), false);
});

test('syntactically valid but undeclared public values and paths are excluded by the actual tracker', () => {
  const unknown = ['?ct=public_campaign', '?pt=123', '?mt=9',
    '?ppid=00000000-0000-4000-8000-000000000000'];
  const html = optInTracker + unknown.map(query => anchor(apple + query)).join('')
    + anchor(apple.replace('/app/', '/app/unknown-slug/'))
    + anchor(apple + '?ppid=0253a7f9-3c1a-4294-95bc-e6d800af5733');
  const result = buildRouteInventory({ pages: [{ file: 'index.html', html }], trackerSource });
  assert.deepEqual(result.public_source.sitewide_runtime.direct_placement_statuses,
    { 'unsupported-parameters': 4, 'unsupported-path': 1, converted: 1 });
  assert.equal(result.public_source.routes.direct_apple.placements, 6);
  assert.equal(result.public_source.sitewide_runtime.eligible_direct_placements, 1);
});

test('missing trackers, missing source, opt-out, duplicate scripts and next-step anchors stay explicit', () => {
  const cases = [
    ['', 'excluded_tracker_missing'], [tracker, 'excluded_not_opted_in'],
    [optInTracker + tracker, 'unevaluated_multiple_tracker_declarations'],
  ];
  for (const [declaration, status] of cases) {
    const result = buildRouteInventory({ pages: [{ file: 'index.html', html: declaration + anchor(apple) }], trackerSource });
    assert.deepEqual(result.public_source.sitewide_runtime.direct_placement_statuses, { [status]: 1 });
    assert.equal(result.public_source.sitewide_runtime.eligible_direct_placements, 0);
  }
  const missing = buildRouteInventory({ pages: [{ file: 'index.html', html: optInTracker + anchor(apple) }] });
  assert.equal(missing.pages[0].placements[0].offline_route_status, 'unevaluated_tracker_source_missing');
  const next = buildRouteInventory({ pages: [{ file: 'index.html', html: optInTracker + anchor(apple, 'data-next-step="get"') }], trackerSource });
  assert.equal(next.pages[0].placements[0].offline_route_status, 'excluded_next_step');
});

test('offline evaluator fails explicitly if the tracker selector contract changes', () => {
  assert.throws(() => buildRouteInventory({ pages: [{ file: 'index.html', html: optInTracker + anchor(apple) }],
    trackerSource: 'document.querySelectorAll("a.different");' }), /selector changed/);
});

test('nine-hero contract detects changes, extra pilot uses and English being outside it', () => {
  const files = ['obsidian/index.html', ...['ar', 'es', 'id', 'ko', 'pt-BR', 'tr', 'zh', 'zh-Hant'].map(l => `${l}/obsidian/index.html`)];
  const html = tracker + anchor(pilot, 'data-app-route="onelink" data-app-traffic="pilot" data-cta-placement="hero" data-cta-cluster="obsidian" data-cta-variant="onelink_v1"');
  const pages = files.map(file => ({ file, html }));
  pages.push({ file: 'en/obsidian/index.html', html: tracker + anchor(apple, 'data-cta-placement="hero"') });
  assert.equal(buildRouteInventory({ pages }).pilot.state, 'source_matches_nine_hero_contract');
  assert.equal(buildRouteInventory({ pages: [...pages, { file: 'other.html', html }] }).pilot.state, 'source_differs_from_nine_hero_contract');
  assert.equal(buildRouteInventory({ pages: pages.map((p, i) => i ? p : { ...p, html: html.replace('hero', 'bottom') }) }).pilot.state, 'source_differs_from_nine_hero_contract');
  assert.throws(() => buildRouteInventory({ pages: [pages[0], pages[0]] }), /Duplicate/);
});

test('CLI reads public HTML only, emits a report and refuses symlink sources and output overwrite', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-route-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'admin')); fs.mkdirSync(path.join(root, '.private'));
  fs.mkdirSync(path.join(root, 'vs', 'drafts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'vs', 'drafts', 'index.html'), 'public comparison');
  fs.writeFileSync(path.join(root, 'index.html'), '<head>' + banner + '</head>' + tracker + anchor(apple));
  fs.writeFileSync(path.join(root, 'admin', 'private.html'), 'not public');
  fs.writeFileSync(path.join(root, '.private', 'secret.html'), 'not public');
  fs.writeFileSync(path.join(root, 'sitemap-ja.xml'), '<urlset><url><loc>https://simplememofast.com/</loc></url></urlset>');
  const output = path.join(root, 'inventory.json');
  const report = main(['--root', root, '--output', output, '--summary-only']);
  assert.equal(report.public_source.pages, 2); assert.equal(report.sitemap_listed.pages, 1);
  assert.equal(Object.hasOwn(report, 'pages'), false);
  assert.equal(JSON.parse(fs.readFileSync(output)).live_verified, false);
  assert.throws(() => main(['--root', root, '--output', output]), /EEXIST/);
  fs.symlinkSync(path.join(root, 'admin', 'private.html'), path.join(root, 'linked.html'));
  assert.throws(() => main(['--root', root, '--output', path.join(root, 'never.json')]), /regular file/);
  assert.throws(() => main(['--unknown']), /Usage/);
});
