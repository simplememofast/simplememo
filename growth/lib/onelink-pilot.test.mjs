// OneLink pilot の冒頭ボタン9個の見張り。実際のチェックアウトを先に見て、次に一時ツリーで各規則が落ちることを示す。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import siteFiles from '../../scripts/lib/site-files.js';
import { classifyAcquisitionUrl, buildRouteInventory } from '../../scripts/site-route-inventory.mjs';
import { PILOT_HUB_PATHS } from './company-acquisition.mjs';
import { pilotGuardProblems, measurementRecordProblems, MANIFEST_PATH, STATES, PILOT_MARKERS, QA_CLASSIFIER_FILE } from './onelink-pilot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_PATH), 'utf8'));
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/publication-policy.json'), 'utf8'));
const TRACKER = fs.readFileSync(path.join(ROOT, QA_CLASSIFIER_FILE), 'utf8');
const CODE = MANIFEST.short_url.split('/').at(-1), QA_CODE = MANIFEST.qa_short_url.split('/').at(-1);
// Another 8-character code under the same template. Never fetched (opening a real short link counts as a click).
const OTHER_SHORT_URL = MANIFEST.short_url.replace(CODE, 'ab12cd34');
const APPLE = 'https://apps.apple.com/jp/app/id6758438948?ppid=1408d7a4-3249-4c87-a079-e13032312579&amp;pt=128498560&amp;ct=web_obsidian_v1&amp;mt=8';
const attrs = (extra = {}) => Object.entries({ ...MANIFEST.anchor.attributes, ...extra })
  .filter(([, v]) => v !== null).map(([k, v]) => `${k}="${v}"`).join(' ');
const hero = (extra = {}, cls = MANIFEST.anchor.class_token) =>
  `<a${cls === null ? '' : ` class="${cls}"`} ${attrs(extra)} href="${MANIFEST.short_url}" aria-label="Download">`;
// The documented rollback target (growth/ONELINK_PILOT.md 「不具合時の戻し方」).
const restored = `<a class="lpr-btn-primary" data-cta-variant="v1" data-cta-cluster="obsidian" data-cta-placement="hero" href="${APPLE}" aria-label="Download">`;
const page = (anchor, more = '') => `<!doctype html><html><head><script src="/js/app-store-tracking.js?v=1" data-sitewide-app-routes="true" defer></script></head>
<body><section class="hero">${anchor}App Store</a></section><a href="${APPLE}" data-cta-placement="footer">Store</a>${more}</body></html>`;
const [SOURCE, TRANSLATED] = [MANIFEST.pages[0], MANIFEST.pages.at(-1)];
const UNSERVED_DATA = Object.entries(POLICY.files).find(([, v]) => v.served_by_site === false)[0];
const SERVED_DATA = Object.entries(POLICY.files).find(([, v]) => v.served_by_site === true)[0];
const urlPath = p => siteFiles.toUrlPath('/', '/' + p);
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A tree built from the real manifest, middleware and publication policy; only the site files are synthetic.
function fixture(t, { state = 'active', manifest = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onelink-pilot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  for (const rel of ['functions/_middleware.js', 'data/publication-policy.json']) write(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  write(MANIFEST_PATH, JSON.stringify({ ...MANIFEST, state, ...manifest }, null, 2));
  for (const p of MANIFEST.pages) write(p, page(state === 'active' ? hero() : restored));
  write('blog/other.html', page(restored));
  write(QA_CLASSIFIER_FILE, `d.bridge_scope = url.pathname === "/it5q/${QA_CODE}" ? "qa" : scope;\n`);
  const edit = (rel, fn) => write(rel, fn(fs.readFileSync(path.join(root, rel), 'utf8')));
  return { root, write, edit, problems: () => pilotGuardProblems({ root }) };
}
const fails = (f, pattern, label) => {
  const problems = f.problems();
  assert(problems.some(p => pattern.test(p)), `${label}: expected ${pattern}, got ${JSON.stringify(problems)}`);
};

// js/app-store-tracking.js run offline on one detached anchor: the bridge_scope it would report for a click.
// No navigation, no network; the same stub-DOM approach as growth/lib/cta-tracking.test.mjs.
function trackerScope(href, attributes) {
  const values = { ...attributes }, handlers = [];
  const a = { getAttribute: k => k === 'href' ? href : values[k] ?? null, setAttribute: (k, v) => { if (k === 'href') href = v; else values[k] = v; },
    hasAttribute: k => Object.hasOwn(values, k), closest: selector => selector.includes('data-next-step') ? null : a };
  const context = { URL, WeakSet, WeakMap, location: { hostname: 'simplememofast.com', href: 'https://simplememofast.com/', pathname: '/' },
    document: { readyState: 'complete', currentScript: { getAttribute: () => null }, querySelectorAll: () => [],
      addEventListener: (type, fn) => { if (type === 'click') handlers.push(fn); } } };
  context.window = context; vm.createContext(context); vm.runInContext(TRACKER, context);
  handlers.forEach(fn => fn({ target: a }));
  return Array.from(context.dataLayer ?? [], args => Array.from(args)).find(e => e[1] === 'web_to_app_click')?.[2]?.bridge_scope ?? null;
}

test('the checkout matches growth/onelink-pilot.json', () => {
  assert.deepEqual(pilotGuardProblems(), []);
  assert(STATES.includes(MANIFEST.state));
  assert.equal(MANIFEST.pages.length, 9);
  assert.deepEqual(Object.keys(MANIFEST.anchor.attributes).sort(),
    ['data-app-route', 'data-app-traffic', 'data-cta-cluster', 'data-cta-placement', 'data-cta-variant']);
  assert.deepEqual(Object.keys(MANIFEST.qa_classifier_files), [QA_CLASSIFIER_FILE]);
});

test('the manifest agrees with the measurement record, the route inventory and the pilot metric', () => {
  // The scope recorded when the pilot went live (growth/ONELINK_PILOT.md 開始記録), or a pending change (next test).
  const changes = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/experiments/experiments.json'), 'utf8')).measurement_changes;
  assert.deepEqual(measurementRecordProblems(MANIFEST, changes), []);
  // scripts/site-route-inventory.mjs (#2100) keeps its own copy of both links and of the nine files; the
  // inventory's nine-hero contract holds for these pages exactly when its PILOT_FILES are the same pages.
  assert.equal(classifyAcquisitionUrl(MANIFEST.short_url)?.route, 'onelink_pilot');
  assert.equal(classifyAcquisitionUrl(MANIFEST.qa_short_url)?.route, 'onelink_qa');
  const contract = pages => buildRouteInventory({ pages: pages.map(file => ({ file, html: page(hero()) })) }).pilot.state;
  assert.equal(contract(MANIFEST.pages), 'source_matches_nine_hero_contract');
  assert.notEqual(contract([...MANIFEST.pages.slice(1), 'en/obsidian/index.html']), 'source_matches_nine_hero_contract', 'the inventory check discriminates');
  // growth/lib/company-acquisition.mjs filters the pilot's hub-landing metric with its own list.
  assert.deepEqual([...PILOT_HUB_PATHS].sort(), MANIFEST.pages.map(urlPath).sort());
});

test('a scope change is recorded only after it is live: unrecorded_scope_change bridges the two PRs', () => {
  const v1 = { version: 'v1-2026-10-15', type: 'measurement_route_change', scope: ['/obsidian/', '/ar/obsidian/'] };
  const other = { version: 'unrelated', type: 'measurement_route_change', scope: ['/blog/'] };
  // Named after the actual start, which is unknown before the deploy.
  const v2 = { version: 'v2-2026-11-02', type: 'measurement_route_change', scope: ['/obsidian/', '/ar/obsidian/', '/en/obsidian/'] };
  const live = { measurement_change: v1.version, unrecorded_scope_change: null, pages: ['obsidian/index.html', 'ar/obsidian/index.html'] };
  assert.deepEqual(measurementRecordProblems(live, [v1]), []);
  const widened = { ...live, pages: [...live.pages, 'en/obsidian/index.html'] };
  const text = (m, changes) => measurementRecordProblems(m, changes).join('\n');
  assert.match(text(widened, [v1]), /unrecorded_scope_change に短い説明/, 'a changed scope without the note');
  // PR 1 (before the deploy): pages changed, a note, and no record or version name yet.
  const changing = { ...widened, unrecorded_scope_change: 'add /en/obsidian/ hero' };
  assert.deepEqual(measurementRecordProblems(changing, [v1, other]), []);
  // PR 2 (after the deploy is verified): the record is found by its scope, whatever it is called, and forces the switch.
  assert.match(text(changing, [v1, other, v2]), /記録 v2-2026-11-02 が pages と同じ scope で足された/);
  assert.deepEqual(measurementRecordProblems({ ...widened, measurement_change: v2.version }, [v1, other, v2]), []);
  // An older record with the same scope does not count as the new one (a later revert is recorded again).
  assert.deepEqual(measurementRecordProblems({ ...live, measurement_change: v2.version, unrecorded_scope_change: 'back to two hubs' }, [v1, v2]), []);
  assert.match(text({ ...live, unrecorded_scope_change: 'stale' }, [v1]), /scope と同じなのに unrecorded_scope_change が残っている/, 'a stale note');
  for (const note of ['', '  ', 7]) assert.match(text({ ...widened, unrecorded_scope_change: note }, [v1]), /null か、まだ記録していない範囲変更の短い説明/, String(note));
  for (const changes of [[], [v1, v1], [{ ...v1, type: 'other' }]]) assert.match(text(live, changes), /ちょうど1件ない/);
});

test('positive control: an active tree passes, whatever the tracker tag, attribute order, quoting, case or label', t => {
  const f = fixture(t);
  assert.deepEqual(f.problems(), []);
  f.edit(SOURCE, html => html.replace(/<script src="\/js\/app-store-tracking\.js[^>]*><\/script>/, ''));
  f.edit(MANIFEST.pages[1], html => html.replace('app-store-tracking.js?v=1', 'app-store-tracking.js?v=2026-10-19'));
  f.edit(TRANSLATED, html => html.replace(hero(), `<A HREF='${MANIFEST.short_url}' target="_blank" ${attrs()} CLASS="cta lpr-btn-primary big" aria-label="별 &gt; 다운로드">`));
  assert.deepEqual(f.problems(), [], 'no dependency on the tracker tag, attribute order, quotes, extra classes or label');
  // Other OneLink links without the pilot label are outside this guard (the sitewide route is added at run time).
  f.write('blog/plain.html', page(`<a href="${OTHER_SHORT_URL}">`));
  assert.deepEqual(f.problems(), []);
  // Internal paths and data files the site does not serve may quote both links and the label.
  for (const rel of ['docs/pilot.html', 'growth/pilot.md', 'data/i18n/pilot.json', 'fixtures/pilot.html', 'scripts/pilot.mjs',
    `data/${UNSERVED_DATA}`, '.github/workflows/pilot.yml', 'CLAUDE.md', 'node_modules/x/pilot.js', 'assets/img/pilot.png']) {
    f.write(rel, `${hero()}x</a> ${MANIFEST.qa_short_url}`);
  }
  assert.deepEqual(f.problems(), []);
});

test('a hero reverted to Apple, modified, commented out or moved into a script fails', t => {
  for (const rel of [SOURCE, TRANSLATED]) {
    const f = fixture(t);
    f.edit(rel, html => html.replace(hero(), restored));
    fails(f, new RegExp(`^${rel}: href がちょうど .* の <a> が 0 個`), rel);
  }
  for (const [label, href] of [['query', `${MANIFEST.short_url}?af_sub1=x`], ['trailing slash', `${MANIFEST.short_url}/`], ['http', MANIFEST.short_url.replace('https:', 'http:')]]) {
    const f = fixture(t);
    f.edit(SOURCE, html => html.replace(`href="${MANIFEST.short_url}"`, `href="${href}"`));
    fails(f, /<a> が 0 個/, label);
  }
  const commented = fixture(t);
  commented.edit(SOURCE, html => html.replace(hero(), `<!-- ${hero()} -->${restored}`));
  fails(commented, /<a> が 0 個.*コメント/, 'a commented-out hero is not an anchor');
  const scripted = fixture(t);
  scripted.edit(SOURCE, html => html.replace(hero(), `<script>const markup = '${hero()}';</script>${restored}`));
  fails(scripted, /<a> が 0 個/, 'an anchor inside a script string is not an anchor');
  const templated = fixture(t);
  templated.edit(SOURCE, html => html.replace(hero(), `<template>${hero()}App Store</a></template>${restored}`));
  fails(templated, /<a> が 0 個/, 'an inert template is not an anchor');
});

test('every measurement attribute and the class token must be on the hero, once', t => {
  for (const name of Object.keys(MANIFEST.anchor.attributes)) {
    const missing = fixture(t);
    missing.edit(TRANSLATED, html => html.replace(hero(), hero({ [name]: null })));
    fails(missing, new RegExp(`${name} が .*（無し）`), `${name} missing`);
    const wrong = fixture(t);
    wrong.edit(TRANSLATED, html => html.replace(hero(), hero({ [name]: 'other' })));
    fails(wrong, new RegExp(`${name} が "${MANIFEST.anchor.attributes[name]}" の1つでない（"other"）`), `${name} changed`);
  }
  // HTML keeps the first of duplicated attributes; other readers may not, so either order is ambiguous.
  const twice = fixture(t);
  twice.edit(SOURCE, html => html.replace(hero(), hero().replace('<a ', '<a data-cta-placement="footer" ')));
  fails(twice, /data-cta-placement が "hero" の1つでない（"footer", "hero"）/, 'duplicated attribute, wrong value first');
  const after = fixture(t);
  after.edit(SOURCE, html => html.replace(hero(), hero().replace('aria-label', 'data-cta-placement="footer" aria-label')));
  fails(after, /data-cta-placement が "hero" の1つでない（"hero", "footer"）/, 'duplicated attribute, pinned value first');
  const unstyled = fixture(t);
  unstyled.edit(SOURCE, html => html.replace(hero(), hero({}, 'lpr-btn-secondary')));
  fails(unstyled, /class に lpr-btn-primary が無い（"lpr-btn-secondary"）/, 'class token');
  const noClass = fixture(t);
  noClass.edit(SOURCE, html => html.replace(hero(), hero({}, null)));
  fails(noClass, /class に lpr-btn-primary が無い（無し）/, 'no class');
  const twoHrefs = fixture(t);
  twoHrefs.edit(SOURCE, html => html.replace(hero(), hero().replace('aria-label', `href="${APPLE}" aria-label`)));
  fails(twoHrefs, /href が 2 個/, 'second href');
});

test('the pilot code appears only in the hero href of the listed pages', t => {
  const second = fixture(t);
  second.edit(SOURCE, html => html.replace('</body>', `${hero({ 'data-cta-placement': 'footer' })}again</a></body>`));
  fails(second, /<a> が 2 個/, 'second pilot anchor on a hub');
  for (const [label, more] of [['JSON-LD', `<script type="application/ld+json">{"url":"${MANIFEST.short_url}"}</script>`],
    ['comment', `<!-- ${MANIFEST.short_url} -->`], ['text', `<p>simplememofast.onelink.me/it5q/${CODE}?x=1</p>`]]) {
    const f = fixture(t);
    f.edit(TRANSLATED, html => html.replace('</body>', `${more}</body>`));
    fails(f, /冒頭ボタンの href のほかにもある（2 か所/, label);
  }
  // Pages, scripts, redirects and served data alike: anything that routes a visitor to the pilot link counts.
  for (const [rel, text] of [['blog/other.html', page(hero())], ['en/obsidian/index.html', page(hero())],
    ['admin/x.html', page(hero())], ['assets/embed/x.html', page(hero())], ['js/other.js', `location.href = "${MANIFEST.short_url}";`],
    ['_redirects', `/app ${MANIFEST.short_url} 302`], ['functions/go.js', `return Response.redirect("${MANIFEST.short_url}")`],
    [`data/${SERVED_DATA}`, `{"link":"${MANIFEST.short_url}"}`], ['llms.txt', MANIFEST.short_url], ['.well-known/app.json', MANIFEST.short_url]]) {
    const f = fixture(t);
    f.write(rel, text);
    fails(f, new RegExp(`^${escape(rel)}: pilot の短縮コード .*冒頭ボタンだけ`), rel);
  }
});

test('a short code in another spelling is still found: percent, entity and script escapes, upper case', t => {
  const percent = MANIFEST.short_url.replaceAll(':', '%3A').replaceAll('/', '%2F');
  const entity = (s, code) => s.replace(`/${code}`, `/&#${code.charCodeAt(0)};${code.slice(1)}`);
  for (const [rel, text] of [
    ['index.html', page(`<a href="https://x.com/intent/post?url=${percent}">`)],
    ['index.html', page(`<a href="https://x.com/intent/post?url=${percent.replaceAll('%', '%25')}">`)],
    ['functions/go.js', `return Response.redirect(decodeURIComponent("${percent.replaceAll('%2F', '%2f')}"));`],
    ['js/new.js', `location.href = "${MANIFEST.short_url.replaceAll('/', '\\/')}";`],
    ['js/new.js', `location.href = "${MANIFEST.short_url.replaceAll('/', '\\u002F')}";`],
    ['index.html', page(`<a href="${entity(MANIFEST.short_url, CODE)}">`)],
    ['index.html', page(`<a href="${MANIFEST.short_url.replace(`/${CODE}`, `/&#x${CODE.charCodeAt(0).toString(16)};${CODE.slice(1)}`)}">`)],
    ['index.html', page(`<a href="${MANIFEST.short_url.replace(CODE, CODE.toUpperCase())}">`)],
  ]) {
    const f = fixture(t);
    f.write(rel, text);
    fails(f, new RegExp(`^${escape(rel)}: pilot の短縮コード`), text);
  }
  const hub = fixture(t);
  hub.edit(TRANSLATED, html => html.replace('</body>', `<a href="https://x.com/intent/post?url=${percent}">share</a></body>`));
  fails(hub, /冒頭ボタンの href のほかにもある（2 か所/, 'an encoded copy on a hub');
  const qa = fixture(t);
  qa.write('blog/qa.html', page(`<a href="${entity(MANIFEST.qa_short_url, QA_CODE)}">`));
  fails(qa, /^blog\/qa\.html: QA の短縮コード/, 'QA code behind an entity');
});

test('the pilot label GA4 counts sits only on the hero anchors, whatever the short code or href', t => {
  const labelled = (href, extra = {}) => `<a class="lpr-btn-primary" ${attrs(extra)} href="${href}">`;
  for (const [label, rel, edit] of [
    ['a copied hero with another short code on another page', 'index.html', () => page(labelled(OTHER_SHORT_URL))],
    ['a second hero with another short code on a hub', SOURCE, html => html.replace('</body>', `${labelled(OTHER_SHORT_URL)}x</a></body>`)],
    ['a second anchor on a hub with the label and a direct Apple link', SOURCE, html => html.replace('</body>', `${labelled(APPLE)}x</a></body>`)],
    ['only the route and traffic label on another page', 'blog/other.html',
      () => page(`<a data-app-route="onelink" data-app-traffic="pilot" href="${OTHER_SHORT_URL}">`)],
    ['the label in other letter case', 'blog/other.html', () => page(`<a data-app-traffic=" Pilot " href="${OTHER_SHORT_URL}">`)],
    ['only the pilot variant on an Apple link', 'blog/other.html', () => page(`<a data-cta-variant="onelink_v1" href="${APPLE}">`)],
  ]) {
    const f = fixture(t);
    if (rel === SOURCE) f.edit(rel, edit); else f.write(rel, edit());
    fails(f, new RegExp(`^${escape(rel)}: pilot の目印（.*GA4 は短縮コードを問わず`), label);
  }
  // What the tracker itself reports as the pilot always carries the label this guard pins (route and traffic).
  const candidates = [
    [OTHER_SHORT_URL, { 'data-app-route': 'onelink', 'data-app-traffic': 'pilot' }],
    [OTHER_SHORT_URL.replace('https:', ''), { 'data-app-route': 'onelink', 'data-app-traffic': 'pilot' }],
    [OTHER_SHORT_URL.replace('simplememofast', 'SimpleMemoFast') + '?x=1', { 'data-app-route': 'onelink', 'data-app-traffic': 'pilot' }],
    [OTHER_SHORT_URL, { 'data-app-route': 'onelink', 'data-app-traffic': 'qa' }],
    [OTHER_SHORT_URL, {}],
  ];
  const scopes = candidates.map(([href, a]) => trackerScope(href, a));
  assert.deepEqual(scopes, ['pilot', 'pilot', 'pilot', 'qa', null], 'the tracker classifies by the label, not by the short code');
  candidates.forEach(([href, a], i) => {
    if (scopes[i] !== 'pilot') return;
    const f = fixture(t);
    f.write('blog/copy.html', page(`<a ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ')} href="${href}">`));
    fails(f, /^blog\/copy\.html: pilot の目印/, href);
  });
  assert.deepEqual(PILOT_MARKERS.filter(k => !Object.hasOwn(MANIFEST.anchor.attributes, k)), []);
});

test('the QA code is in no site file except the tracker classifier, which may not hold the full QA link', t => {
  for (const state of STATES) {
    const f = fixture(t, { state });
    assert.deepEqual(f.problems(), [], `${state}: the listed classifier may hold the QA path`);
    f.edit('blog/other.html', html => html.replace('</body>', `<a href="${MANIFEST.qa_short_url}">QA</a></body>`));
    fails(f, /^blog\/other\.html: QA の短縮コード/, state);
    const hub = fixture(t, { state });
    hub.edit(SOURCE, html => html.replace('</body>', `<!-- ${MANIFEST.qa_short_url} --></body>`));
    fails(hub, new RegExp(`^${SOURCE}: QA の短縮コード`), `${state} hub comment`);
    const script = fixture(t, { state });
    script.write('js/other.js', `a.href = "${MANIFEST.qa_short_url}";`);
    fails(script, /^js\/other\.js: QA の短縮コード/, `${state} unlisted script`);
  }
  // The listed file is otherwise exempt as a whole, but it cannot hand out the QA link itself.
  const redirect = fixture(t);
  redirect.edit(QA_CLASSIFIER_FILE, text => `${text}if (location.hash === "#qa") location.href = "${MANIFEST.qa_short_url}";\n`);
  fails(redirect, new RegExp(`^${escape(QA_CLASSIFIER_FILE)}: QA の短縮URLそのもの`), 'full QA link in the classifier');
  for (const file of ['blog/other.html', '_redirects', 'js/other.js']) {
    const listed = fixture(t, { manifest: { qa_classifier_files: { ...MANIFEST.qa_classifier_files, [file]: 'not allowed' } } });
    fails(listed, /qa_classifier_files に書けるのは js\/app-store-tracking\.js/, `${file} can never be listed`);
  }
});

test('rolled_back is the documented rollback switch and is two-sided', t => {
  assert.deepEqual(fixture(t, { state: 'rolled_back' }).problems(), [], 'heroes restored with the switch flipped');
  const removed = fixture(t, { state: 'rolled_back' });
  fs.rmSync(path.join(removed.root, TRANSLATED));
  assert.deepEqual(removed.problems(), [], 'rolled back: the pages are no longer required');
  const half = fixture(t, { state: 'rolled_back' });
  half.edit(TRANSLATED, () => page(hero()));
  fails(half, new RegExp(`^${TRANSLATED}: pilot の短縮コード .*state は rolled_back`), 'switch flipped while a hero still points to the pilot');
  // Links back to Apple but the labels left behind: GA4 would keep a pilot variant and the route opt-in.
  for (const [label, extra] of [['route, traffic and variant kept', {}], ['variant kept', { 'data-app-route': null, 'data-app-traffic': null }],
    ['route kept', { 'data-app-traffic': null, 'data-cta-variant': 'v1' }]]) {
    const f = fixture(t, { state: 'rolled_back' });
    f.edit(SOURCE, html => html.replace(restored, `<a class="lpr-btn-primary" ${attrs(extra)} href="${APPLE}">`));
    fails(f, new RegExp(`^${SOURCE}: pilot の目印.*state は rolled_back。戻したら目印も外す`), label);
  }
  const unflipped = fixture(t);
  for (const p of MANIFEST.pages) unflipped.edit(p, html => html.replace(hero(), restored));
  assert.equal(unflipped.problems().length, MANIFEST.pages.length, 'heroes restored without flipping the switch');
});

test('a missing, malformed or unknown manifest is never read as rolled back', t => {
  const missing = fixture(t, { state: 'rolled_back' });
  fs.rmSync(path.join(missing.root, MANIFEST_PATH));
  fails(missing, /を読めない — 無い・壊れた manifest/, 'missing');
  const broken = fixture(t);
  broken.edit(MANIFEST_PATH, text => text.slice(0, -3));
  fails(broken, /を読めない/, 'malformed JSON');
  const withoutTraffic = Object.fromEntries(Object.entries(MANIFEST.anchor.attributes).filter(([k]) => k !== 'data-app-traffic'));
  for (const [label, manifest, pattern] of [
    ['unknown state', { state: 'paused' }, /state は active \/ rolled_back/],
    ['no state', { state: undefined }, /state は active \/ rolled_back/],
    ['same short codes', { qa_short_url: MANIFEST.short_url }, /別々の短縮URLでない/],
    ['same short codes in another case', { qa_short_url: MANIFEST.short_url.replace(CODE, CODE.toUpperCase()) }, /別々の短縮URLでない/],
    ['non-OneLink URL', { short_url: 'https://apps.apple.com/jp/app/id6758438948' }, /別々の短縮URLでない/],
    ['empty attributes', { anchor: { ...MANIFEST.anchor, attributes: {} } }, /anchor は class_token/],
    ['styling attribute', { anchor: { ...MANIFEST.anchor, attributes: { class: 'lpr-btn-primary' } } }, /anchor は class_token/],
    ['no traffic label', { anchor: { ...MANIFEST.anchor, attributes: withoutTraffic } }, /anchor は class_token/],
    ['class list as token', { anchor: { ...MANIFEST.anchor, class_token: 'a b' } }, /anchor は class_token/],
    ['no pages', { pages: [] }, /pages は重複の無い/],
    ['duplicate page', { pages: [...MANIFEST.pages, SOURCE] }, /pages は重複の無い/],
    ['absolute page', { pages: ['/obsidian/index.html'] }, /pages は重複の無い/],
    ['parent page', { pages: ['../obsidian/index.html'] }, /pages は重複の無い/],
    ['no classifier list', { qa_classifier_files: undefined }, /qa_classifier_files/],
  ]) {
    fails(fixture(t, { manifest }), pattern, label);
  }
  const gone = fixture(t);
  fs.rmSync(path.join(gone.root, TRANSLATED));
  fails(gone, new RegExp(`^${TRANSLATED}: pilot の対象ページがサイトのファイルに無い`), 'an active hub page removed');
});

test('an unreadable site boundary fails instead of scanning a guessed set of files', t => {
  const prefixes = fixture(t);
  prefixes.edit('functions/_middleware.js', text => text.replace('const INTERNAL_PREFIXES', 'const PREFIXES'));
  fails(prefixes, /INTERNAL_PREFIXES を読めない/, 'served-path list unreadable');
  const policy = fixture(t);
  policy.write('data/publication-policy.json', '{}');
  fails(policy, /publication-policy\.json の files を読めない/, 'publication policy unreadable');
});

// A test cannot notice its own deletion: removing the step shows only in review. This pins the rest, so the
// step stays in the seo-check job, runs this file, and cannot be made conditional or non-blocking.
test('SEO Validation runs this file in the seo-check job, unconditionally and blocking', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/seo-check.yml'), 'utf8');
  const jobs = workflow.split('\n  routine-health:\n');
  assert.equal(jobs.length, 2, 'seo-check.yml still has the seo-check job followed by routine-health');
  const step = /\n {6}- name: OneLink pilot hero anchors match growth\/onelink-pilot\.json\n((?: {8}.*\n)+)/.exec(jobs[0]);
  assert(step, 'the step is in the seo-check job');
  assert.match(step[1], /^ {8}run: node --test growth\/lib\/onelink-pilot\.test\.mjs$/m);
  assert.doesNotMatch(step[1], /^ {8}(?:if|continue-on-error):/m);
});
