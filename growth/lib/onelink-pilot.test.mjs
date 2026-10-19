// OneLink pilot の冒頭ボタン9個の見張り。実際のチェックアウトを先に見て、次に一時ツリーで各規則が落ちることを示す。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import siteFiles from '../../scripts/lib/site-files.js';
import { classifyAcquisitionUrl } from '../../scripts/site-route-inventory.mjs';
import { pilotGuardProblems, MANIFEST_PATH, STATES } from './onelink-pilot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_PATH), 'utf8'));
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/publication-policy.json'), 'utf8'));
const CODE = MANIFEST.short_url.split('/').at(-1), QA_CODE = MANIFEST.qa_short_url.split('/').at(-1);
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

// A tree built from the real manifest, middleware and publication policy; only the site files are synthetic.
function fixture(t, { state = 'active', manifest = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onelink-pilot-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  for (const rel of ['functions/_middleware.js', 'data/publication-policy.json']) write(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  write(MANIFEST_PATH, JSON.stringify({ ...MANIFEST, state, ...manifest }, null, 2));
  for (const p of MANIFEST.pages) write(p, page(state === 'active' ? hero() : restored));
  write('blog/other.html', page(restored));
  write('js/app-store-tracking.js', `d.bridge_scope = url.pathname === "/it5q/${QA_CODE}" ? "qa" : scope;\n`);
  const edit = (rel, fn) => write(rel, fn(fs.readFileSync(path.join(root, rel), 'utf8')));
  return { root, write, edit, problems: () => pilotGuardProblems({ root }) };
}
const fails = (f, pattern, label) => {
  const problems = f.problems();
  assert(problems.some(p => pattern.test(p)), `${label}: expected ${pattern}, got ${JSON.stringify(problems)}`);
};

test('the checkout matches growth/onelink-pilot.json', () => {
  assert.deepEqual(pilotGuardProblems(), []);
  assert(STATES.includes(MANIFEST.state));
  assert.equal(MANIFEST.pages.length, 9);
  assert.deepEqual(Object.keys(MANIFEST.anchor.attributes).sort(),
    ['data-app-route', 'data-app-traffic', 'data-cta-cluster', 'data-cta-placement', 'data-cta-variant']);
});

test('the manifest agrees with the measurement record and the route inventory', () => {
  // The scope recorded when the pilot went live (growth/ONELINK_PILOT.md 開始記録); a new scope needs a new record.
  const changes = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/experiments/experiments.json'), 'utf8'))
    .measurement_changes.filter(c => c?.version === MANIFEST.measurement_change);
  assert.equal(changes.length, 1, `measurement_changes に版 ${MANIFEST.measurement_change} がちょうど1件`);
  assert.equal(changes[0].type, 'measurement_route_change');
  assert.deepEqual([...changes[0].scope].sort(), MANIFEST.pages.map(p => siteFiles.toUrlPath('/', '/' + p)).sort());
  // scripts/site-route-inventory.mjs (#2100) keeps its own copy of both links; the two must name the same series.
  assert.equal(classifyAcquisitionUrl(MANIFEST.short_url)?.route, 'onelink_pilot');
  assert.equal(classifyAcquisitionUrl(MANIFEST.qa_short_url)?.route, 'onelink_qa');
});

test('positive control: an active tree passes, whatever the tracker tag, attribute order, quoting, case or label', t => {
  const f = fixture(t);
  assert.deepEqual(f.problems(), []);
  f.edit(SOURCE, html => html.replace(/<script src="\/js\/app-store-tracking\.js[^>]*><\/script>/, ''));
  f.edit(MANIFEST.pages[1], html => html.replace('app-store-tracking.js?v=1', 'app-store-tracking.js?v=2026-10-19'));
  f.edit(TRANSLATED, html => html.replace(hero(), `<A HREF='${MANIFEST.short_url}' target="_blank" ${attrs()} CLASS="cta lpr-btn-primary big" aria-label="별 &gt; 다운로드">`));
  assert.deepEqual(f.problems(), [], 'no dependency on the tracker tag, attribute order, quotes, extra classes or label');
  // Internal paths and data files the site does not serve may quote both links.
  for (const rel of ['docs/pilot.html', 'growth/pilot.md', 'data/i18n/pilot.json', 'fixtures/pilot.html', 'scripts/pilot.mjs',
    `data/${UNSERVED_DATA}`, '.github/workflows/pilot.yml', 'CLAUDE.md', 'node_modules/x/pilot.js', 'assets/img/pilot.png']) {
    f.write(rel, `<a href="${MANIFEST.short_url}">x</a> ${MANIFEST.qa_short_url}`);
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
    fails(f, new RegExp(`^${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: pilot の短縮コード .*冒頭ボタンだけ`), rel);
  }
});

test('the QA code is in no site file except a listed non-HTML classifier, in either state', t => {
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
  const listedHtml = fixture(t, { manifest: { qa_classifier_files: { ...MANIFEST.qa_classifier_files, 'blog/other.html': 'not allowed' } } });
  fails(listedHtml, /qa_classifier_files は「非HTMLのファイル → 理由」/, 'HTML can never be listed');
});

test('rolled_back is the documented rollback switch and is two-sided', t => {
  assert.deepEqual(fixture(t, { state: 'rolled_back' }).problems(), [], 'heroes restored with the switch flipped');
  const removed = fixture(t, { state: 'rolled_back' });
  fs.rmSync(path.join(removed.root, TRANSLATED));
  assert.deepEqual(removed.problems(), [], 'rolled back: the pages are no longer required');
  const half = fixture(t, { state: 'rolled_back' });
  half.edit(TRANSLATED, () => page(hero()));
  fails(half, new RegExp(`^${TRANSLATED}: pilot の短縮コード .*state は rolled_back`), 'switch flipped while a hero still points to the pilot');
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
  for (const [label, manifest, pattern] of [
    ['unknown state', { state: 'paused' }, /state は active \/ rolled_back/],
    ['no state', { state: undefined }, /state は active \/ rolled_back/],
    ['same short codes', { qa_short_url: MANIFEST.short_url }, /別々の短縮URLでない/],
    ['non-OneLink URL', { short_url: 'https://apps.apple.com/jp/app/id6758438948' }, /別々の短縮URLでない/],
    ['empty attributes', { anchor: { ...MANIFEST.anchor, attributes: {} } }, /anchor は class_token/],
    ['styling attribute', { anchor: { ...MANIFEST.anchor, attributes: { class: 'lpr-btn-primary' } } }, /anchor は class_token/],
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
