// Observable contracts for the refactored detectors and traversal policies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectHtmlFiles, walkHtmlFiles } from './site-files.js';
import { validatePage, getMetaContent } from './seo-page.js';
import { createSiteChecks } from './seo-site.js';
import { allPages } from '../check-viewport-overflow.mjs';
import { derive, interpretRun } from '../autopilot-act.mjs';

const siteUrl = 'https://simplememofast.com';
const head = '<title>Example</title>'
  + `<meta name="description" content="${'d'.repeat(120)}">`
  + '<link rel="canonical" href="/">'
  + '<meta name="viewport" content="width=device-width">'
  + ['title', 'type', 'url', 'image'].map(k => `<meta property="og:${k}" content="Example">`).join('')
  + '<meta name="twitter:card" content="summary_large_image">';
const page = content => `<html lang="ja"><head>${head}</head><body>${content}</body></html>`;
const context = { rel: 'sample/index.html', pageUrl: '/sample/',
  getSiteUrls: () => new Set(['/sample/', '/en/sample/']),
  ownAppNames: new Set(['SimpleMemo']), canonicalAppId: siteUrl + '/#app' };
const validate = (html, extra = {}) => validatePage(html, { ...context, ...extra });
const tags = messages => messages.map(m => m.match(/^\[[^\]]+\]/)[0]);

test('page reports retain rule order, counterpart lookup and noindex short circuit', () => {
  let lookups = 0;
  const getSiteUrls = () => { lookups++; return new Set(['/en/sample/']); };
  assert.deepEqual(tags(validate('', { getSiteUrls }).errors),
    ['[TITLE]', '[DESC]', '[CANONICAL]', '[OG]', '[OG]', '[OG]', '[OG]', '[TWITTER]', '[VIEWPORT]']);
  assert.equal(lookups, 1);
  assert.deepEqual(tags(validate('').warnings), ['[HREFLANG]', '[SCHEMA]']);
  assert.deepEqual(validate('<meta content="noindex" name="robots">', { getSiteUrls }),
    { errors: [], warnings: [] });
  assert.equal(lookups, 1);
  // Retain the old broad detector, including a description that says noindex.
  assert.deepEqual(validate('<meta name="description" content="noindex explained">'),
    { errors: [], warnings: [] });
  assert.deepEqual(tags(validate('', { getSiteUrls: () => new Set() }).warnings), ['[SCHEMA]']);
});

test('metadata keeps quote handling, first matching tag and exact length boundaries', () => {
  assert.equal(getMetaContent('<meta CONTENT="notes aren\'t lost" NAME="description">', 'name', 'description'), "notes aren't lost");
  assert.equal(getMetaContent("<meta content='first' name='description'><meta name='description' content='second'>", 'name', 'description'), 'first');
  assert.equal(getMetaContent('<meta name="description">', 'name', 'description'), null);
  for (const [length, warns] of [[109, true], [110, false], [160, false], [161, true]]) {
    const html = page('').replace('d'.repeat(120), 'd'.repeat(length));
    assert.equal(validate(html).warnings.some(m => m.startsWith('[DESC]')), warns, String(length));
  }
  for (const [length, warns] of [[70, false], [71, true]]) {
    assert.equal(validate(page('').replace('<title>Example</title>', `<title>${'t'.repeat(length)}</title>`))
      .warnings.some(m => m.startsWith('[TITLE]')), warns, String(length));
  }
});

test('schema traversal retains nested nodes, own-app scoping and time-zone validation', () => {
  const nodePage = node => page(`<script type="application/ld+json">${JSON.stringify(node)}</script>`);
  const nodes = { '@graph': [
    { '@type': ['BlogPosting', 'TechArticle'], dependencies: 'Xcode' },
    { '@type': 'SoftwareApplication', name: 'Competitor' },
    { '@type': 'Review', reviewRating: { ratingValue: 5 } },
    { video: { '@type': 'VideoObject', uploadDate: '2026-09-30T09:00:00+09:00' } },
  ] };
  assert.deepEqual(validate(nodePage(nodes)).errors, []);
  const own = validate(nodePage({ '@type': 'SoftwareApplication', name: 'SimpleMemo' }));
  assert.equal(own.errors.length, 1);
  assert.match(own.errors[0], /missing @id/);
  const invalid = validate(nodePage([
    { '@type': 'BlogPosting', dependencies: 'Xcode', proficiencyLevel: 'Expert' },
    { '@type': 'Review' },
    { '@type': 'VideoObject', name: 'Clip', uploadDate: '2026-09-30', expires: 12 },
  ]));
  assert.deepEqual(invalid.errors.map(m => m.split(': ')[0]), [
    '[SCHEMA] proficiencyLevel belongs to TechArticle', '[SCHEMA] dependencies belongs to TechArticle',
    '[SCHEMA] Review missing required reviewRating.ratingValue',
    '[SCHEMA] VideoObject uploadDate needs a time and a timezone offset (got "2026-09-30", want e.g. 2026-08-11T13:42:48+09:00) in Clip',
    '[SCHEMA] VideoObject expires needs a time and a timezone offset (got "12", want e.g. 2026-08-11T13:42:48+09:00) in Clip',
  ]);
  assert.equal(validate(nodePage({ '@type': 'VideoObject' })).errors.length, 1);
  const malformed = validate(page('<script type="application/ld+json">{bad}</script>'));
  assert.deepEqual(malformed.errors, []);
  assert.equal(malformed.warnings.filter(m => m.startsWith('[SCHEMA] Unparseable')).length, 1);
  assert.deepEqual(validate(nodePage(nodes)).errors, [], 'reports cannot leak between calls');
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-behavior-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel, content = '') => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  return { root, write };
}

test('site checks use their own root and keep the caller-owned report arrays', t => {
  const first = fixture(t), second = fixture(t);
  first.write('robots.txt', 'Disallow: /*?lang=\n');
  second.write('robots.txt', 'Sitemap: https://simplememofast.com/sitemap.xml\n');
  const make = rootDir => {
    const errors = [], warnings = [];
    return { errors, warnings, checks: createSiteChecks({ rootDir, siteUrl, errors, warnings,
      getAllHtmlFiles: () => [], getRelative: file => path.relative(rootDir, file) }) };
  };
  const a = make(first.root), b = make(second.root);
  a.checks.checkRobots();
  b.checks.checkRobots();
  assert.equal(a.errors.length, 1);
  assert.equal(a.warnings.length, 1);
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.warnings, []);
  a.errors.length = 0;
  a.checks.checkRobots();
  assert.equal(a.errors.length, 1, 'the CLI can reset an existing report array');
});

test('fact freshness retains separate 30-day and 180-day windows', t => {
  const { root, write } = fixture(t);
  const now = Date.parse('2026-09-30T00:00:00Z');
  t.mock.method(Date, 'now', () => now);
  const day = age => new Date(now - age * 86400000).toISOString().slice(0, 10);
  const errors = [], warnings = [];
  const checks = createSiteChecks({ rootDir: root, siteUrl, errors, warnings,
    getAllHtmlFiles: () => [], getRelative: file => path.relative(root, file) });
  const facts = (storeAge, priceAge) => `**Last updated:** ${day(storeAge)}\n`
    + `Japan App Store version 5.9.9 (verified ${day(storeAge)})\n`
    + `Japan App Store rating 4.4 (22 ratings; verified ${day(storeAge)})\n`
    + `Premium ¥100/mo or ¥1,000/yr (owner-confirmed ${day(priceAge)})\n`;
  write('llms.txt', facts(30, 180));
  checks.checkLlmsFreshness();
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  write('llms.txt', facts(31, 180));
  checks.checkLlmsFreshness();
  assert.equal(warnings.length, 3);
  assert.equal(warnings.some(m => m.includes('subscription prices')), false);
  warnings.length = 0;
  write('llms.txt', facts(30, 181));
  checks.checkLlmsFreshness();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /subscription prices.*181 days old/);
  warnings.length = 0;
  write('llms.txt', 'No verification dates');
  checks.checkLlmsFreshness();
  assert.equal(errors.length, 4);
  assert.deepEqual(warnings, []);
});

test('HTML traversal preserves ordering and each caller\'s hidden/skip/error policy', t => {
  const { root, write } = fixture(t);
  for (const rel of ['a.html', 'b/deep.html', 'b/index.html', 'c.html', '.hidden/page.html',
    '.hidden.html', '404.html', 'fixtures/broken.html', 'node_modules/vendor.html']) write(rel);
  const names = files => files.map(file => path.relative(root, file));
  const options = { skipDirs: ['node_modules', 'fixtures'], skipFiles: ['404.html'], tolerateReadErrors: false };
  assert.deepEqual(names(collectHtmlFiles(root, options)), ['a.html', 'b/deep.html', 'b/index.html', 'c.html']);
  assert.deepEqual([...walkHtmlFiles(root, options)], collectHtmlFiles(root, options));
  assert.deepEqual(names(collectHtmlFiles(root, { ...options, skipHidden: false })),
    ['.hidden/page.html', '.hidden.html', 'a.html', 'b/deep.html', 'b/index.html', 'c.html']);
  assert.deepEqual(allPages(root), ['/.hidden.html', '/.hidden/page.html', '/404.html', '/a.html', '/b/', '/b/deep.html', '/c.html']);
  const missing = path.join(root, 'missing');
  assert.deepEqual(collectHtmlFiles(missing), []);
  assert.throws(() => collectHtmlFiles(missing, { tolerateReadErrors: false }), { code: 'ENOENT' });
});

test('lazy traversal yields the current page before opening a later directory', t => {
  const { root, write } = fixture(t);
  const first = write('a.html');
  write('b/later.html');
  const iterator = walkHtmlFiles(root, { tolerateReadErrors: false });
  assert.deepEqual(iterator.next(), { value: first, done: false });
  fs.rmSync(path.join(root, 'b'), { recursive: true });
  assert.throws(() => iterator.next(), { code: 'ENOENT' });
});

test('action derivation keeps rule order, existing context and ownership decisions', () => {
  const ctx = { today: '2026-09-30', now: Date.parse('2026-09-30T00:00:00Z'),
    viewport: { state: 'unknown' },
    issues: new Map([[7, { number: 7, title: 'Health', state: 'open', labels: ['ops/cron-failure'] }]]),
    selfheal: { targets: [{ run_id: 'failed-run', failure_class: 'no_artifact', repair_attempts_for_class: 3, escalate: true }] },
    workflowRuns: [{ id: 123, status: 'completed', conclusion: 'success', steps: [] }],
    runsDoc: { runs: [] }, statusDoc: { date_jst: '2026-09-28' },
    budget: { run_caps: { unreviewed: [{ run_id: 'cost-run', date_jst: '2026-09-29', task_kind: 'repair', cost: 3, cap: 1, times: 3 }] } },
  };
  const before = structuredClone(ctx);
  const actions = derive(ctx);
  assert.deepEqual(actions.map(a => a.id), [
    'act-viewport-measurement', 'act-health-7', 'act-selfheal-escalated-no_artifact',
    'act-ledger-sync', 'act-status-stale', 'act-budget-overrun-cost-run',
  ]);
  assert.equal(actions[2].force_owner, 'human');
  assert.equal(actions[2].auto, 'contain');
  assert.equal(actions[3].auto, 'reconcile-runs');
  assert.equal(actions.at(-1).force_owner, 'human');
  assert.deepEqual(ctx, before);
  assert.deepEqual(derive({ today: '2026-09-30', now: ctx.now }), []);
});

test('failed-run interpretation keeps uncertainty and observed diagnostic precedence', () => {
  const step = name => ({ name, conclusion: 'failure' });
  const run = { status: 'completed', conclusion: 'failure', steps: [
    { ...step('Claude Code'), started_at: '2026-09-30T00:00:00Z', completed_at: '2026-09-30T00:00:01Z' },
    step('使用量上限'), step('資格情報かを切り分ける'),
  ] };
  assert.equal(interpretRun(run).failure_class, 'usage_limit');
  assert.equal(interpretRun(run).needs_triage, false);
  run.steps.push(step('実行中の支出閾値で停止'));
  assert.equal(interpretRun(run).failure_class, null);
  assert.equal(interpretRun(run).needs_triage, true);
  assert.match(interpretRun(run).failure_reason, /SDK/);
  assert.equal(interpretRun({ status: 'in_progress', steps: run.steps }), null);
  assert.deepEqual(interpretRun({ status: 'completed', conclusion: 'success', steps: [] }),
    { unverified: true, note: '主系モデルのステップ情報を確認できず、着手・結果を判定できない。再取得まで運転台帳への追記を保留する' });
});
