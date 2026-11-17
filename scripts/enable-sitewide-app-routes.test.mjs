import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { disableSitewideAppRoutes, updateExistingTrackerPages } from './enable-sitewide-app-routes.mjs';

const version = '012345abcd';
test('only an existing tracker script loses the opt-in and gets its own cache version', () => {
  const before = '<a href="https://apps.apple.com/app/id6758438948">Get</a>'
    + '<meta name="apple-itunes-app" content="app-id=6758438948">'
    + '<img src="/assets/img/qr-test.svg?v=old">'
    + '<script src="/js/analytics.js?v=old" defer></script>'
    + '<script src="/js/app-store-tracking.js?v=old" defer data-sitewide-app-routes="true"></script>';
  const after = disableSitewideAppRoutes(before, version);
  assert.equal(after, before.replace('src="/js/app-store-tracking.js?v=old" defer data-sitewide-app-routes="true"',
    `src="/js/app-store-tracking.js?v=${version}" defer`));
  assert.equal(disableSitewideAppRoutes(after, version), after);
});

test('no tracker, lookalike src, comments and inline-script strings remain untouched', () => {
  const html = '<script src="/js/app-store-tracking.js.evil" data-sitewide-app-routes="true"></script>'
    + '<script src="https://evil.example/js/app-store-tracking.js" data-sitewide-app-routes="true"></script>'
    + '<!-- <script src="/js/app-store-tracking.js" data-sitewide-app-routes="true"></script> -->'
    + '<script>const example = \'<script src="/js/app-store-tracking.js" data-sitewide-app-routes="true">\';</script>'
    + '<a href="https://apps.apple.com/jp/app/id6758438948" data-sitewide-app-routes="true">reference</a>';
  assert.equal(disableSitewideAppRoutes(html, version), html);
});

test('every spelling of the opt-in is removed once and an invalid version fails closed', () => {
  for (const spelling of ['data-sitewide-app-routes="true"', "data-sitewide-app-routes='false'",
    'data-sitewide-app-routes=true', 'DATA-SITEWIDE-APP-ROUTES="true"', 'data-sitewide-app-routes']) {
    const html = `<script ${spelling} defer src='/js/app-store-tracking.js'></script>`;
    const after = disableSitewideAppRoutes(html, version);
    assert.equal(after, `<script defer src="/js/app-store-tracking.js?v=${version}"></script>`, spelling);
    assert.equal(disableSitewideAppRoutes(after, version), after);
  }
  const twice = '<script data-sitewide-app-routes="true" src="/js/app-store-tracking.js" data-sitewide-app-routes="true"></script>';
  assert.equal(disableSitewideAppRoutes(twice, version), `<script src="/js/app-store-tracking.js?v=${version}"></script>`);
  assert.throws(() => disableSitewideAppRoutes(twice, 'bad\"><script>'));
});

test('quoted greater-than characters do not truncate the script opening tag', () => {
  const before = '<script data-note="a > b" data-other=\'c > d\' src="/js/app-store-tracking.js?v=old" defer'
    + ' data-sitewide-app-routes="true"></script>';
  const after = disableSitewideAppRoutes(before, version);
  assert.equal(after, before.replace('app-store-tracking.js?v=old', `app-store-tracking.js?v=${version}`)
    .replace(' data-sitewide-app-routes="true"', ''));
  assert.equal(disableSitewideAppRoutes(after, version), after);
});

test('similarly named attributes survive the opt-out byte for byte', () => {
  const before = '<script data-sitewide-app-routes-extra="preserve" data-sitewide-app-routes="true"'
    + ' data-sitewide-app-routes2="also-preserve" src="/js/app-store-tracking.js?v=old"></script>';
  const after = disableSitewideAppRoutes(before, version);
  assert.equal(after, '<script data-sitewide-app-routes-extra="preserve" data-sitewide-app-routes2="also-preserve"'
    + ` src="/js/app-store-tracking.js?v=${version}"></script>`);
  assert.equal(disableSitewideAppRoutes(after, version), after);
});

test('repository updater opts out every existing consumer and defaults to a dry run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitewide-script-optout-'));
  try {
    fs.mkdirSync(path.join(root, 'js'));
    fs.mkdirSync(path.join(root, 'docs'));
    fs.mkdirSync(path.join(root, 'obsidian'));
    fs.writeFileSync(path.join(root, 'js/app-store-tracking.js'), '// fixture');
    const source = '<script src="/js/app-store-tracking.js?v=old" defer data-sitewide-app-routes="true"></script>';
    fs.writeFileSync(path.join(root, 'index.html'), source);
    fs.writeFileSync(path.join(root, 'obsidian/index.html'), source.replace(' data-sitewide-app-routes="true"', ''));
    fs.writeFileSync(path.join(root, 'docs/example.html'), source);
    fs.writeFileSync(path.join(root, 'compose.html'), '<p>No tracker</p>');
    const dry = updateExistingTrackerPages(root);
    assert.deepEqual(dry.paths, ['index.html', 'obsidian/index.html']);
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), source);
    const written = updateExistingTrackerPages(root, { write: true });
    assert.deepEqual(written.paths, ['index.html', 'obsidian/index.html']);
    const opted = `<script src="/js/app-store-tracking.js?v=${written.tracker_version}" defer></script>`;
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), opted);
    assert.equal(fs.readFileSync(path.join(root, 'obsidian/index.html'), 'utf8'), opted);
    assert.equal(fs.readFileSync(path.join(root, 'docs/example.html'), 'utf8'), source);
    assert.equal(fs.readFileSync(path.join(root, 'compose.html'), 'utf8'), '<p>No tracker</p>');
    assert.equal(updateExistingTrackerPages(root).changed_pages, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
