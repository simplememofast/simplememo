import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { enableSitewideAppRoutes, updateExistingTrackerPages } from './enable-sitewide-app-routes.mjs';

const version = '012345abcd';
test('only an existing tracker script gets opt-in and its own cache version', () => {
  const before = '<a href="https://apps.apple.com/app/id6758438948">Get</a>'
    + '<meta name="apple-itunes-app" content="app-id=6758438948">'
    + '<img src="/assets/img/qr-test.svg?v=old">'
    + '<script src="/js/analytics.js?v=old" defer></script>'
    + '<script src="/js/app-store-tracking.js?v=old" defer></script>';
  const after = enableSitewideAppRoutes(before, version);
  assert.equal(after, before.replace('src="/js/app-store-tracking.js?v=old" defer',
    `src="/js/app-store-tracking.js?v=${version}" defer data-sitewide-app-routes="true"`));
  assert.equal(enableSitewideAppRoutes(after, version), after);
});

test('no tracker, lookalike src, comments and inline-script strings remain untouched', () => {
  const html = '<script src="/js/app-store-tracking.js.evil"></script>'
    + '<script src="https://evil.example/js/app-store-tracking.js"></script>'
    + '<!-- <script src="/js/app-store-tracking.js"></script> -->'
    + '<script>const example = \'<script src="/js/app-store-tracking.js">\';</script>'
    + '<a href="https://simplememofast.onelink.me/it5q/l250gib4">pilot</a>';
  assert.equal(enableSitewideAppRoutes(html, version), html);
});

test('existing false opt-in is replaced once and invalid version fails closed', () => {
  const html = "<script data-sitewide-app-routes='false' defer src='/js/app-store-tracking.js'></script>";
  const after = enableSitewideAppRoutes(html, version);
  assert.equal(after.match(/data-sitewide-app-routes/g).length, 1);
  assert.ok(after.includes('data-sitewide-app-routes="true"'));
  assert.equal(enableSitewideAppRoutes(after, version), after);
  assert.throws(() => enableSitewideAppRoutes(html, 'bad\"><script>'));
});

test('quoted greater-than characters do not truncate the script opening tag', () => {
  const before = '<script data-note="a > b" data-other=\'c > d\' src="/js/app-store-tracking.js?v=old" defer></script>';
  const after = enableSitewideAppRoutes(before, version);
  assert.equal(after, before.replace('app-store-tracking.js?v=old', `app-store-tracking.js?v=${version}`)
    .replace(' defer>', ' defer data-sitewide-app-routes="true">'));
  assert.equal(enableSitewideAppRoutes(after, version), after);
});

test('similarly named attributes survive opt-in replacement byte for byte', () => {
  const before = '<script data-sitewide-app-routes-extra="preserve" data-sitewide-app-routes="false"'
    + ' data-sitewide-app-routes2="also-preserve" src="/js/app-store-tracking.js?v=old"></script>';
  const after = enableSitewideAppRoutes(before, version);
  assert.equal(after, before.replace(' data-sitewide-app-routes="false"', '')
    .replace('app-store-tracking.js?v=old', `app-store-tracking.js?v=${version}`)
    .replace('></script>', ' data-sitewide-app-routes="true"></script>'));
  assert.equal(enableSitewideAppRoutes(after, version), after);
});

test('repository updater touches existing consumers only and defaults to a dry run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitewide-script-optin-'));
  try {
    fs.mkdirSync(path.join(root, 'js'));
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'js/app-store-tracking.js'), '// fixture');
    const source = '<script src="/js/app-store-tracking.js?v=old" defer></script>';
    fs.writeFileSync(path.join(root, 'index.html'), source);
    fs.writeFileSync(path.join(root, 'docs/example.html'), source);
    fs.writeFileSync(path.join(root, 'compose.html'), '<p>No tracker</p>');
    const dry = updateExistingTrackerPages(root);
    assert.deepEqual(dry.paths, ['index.html']);
    assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), source);
    const written = updateExistingTrackerPages(root, { write: true });
    assert.deepEqual(written.paths, ['index.html']);
    assert.equal(fs.readFileSync(path.join(root, 'docs/example.html'), 'utf8'), source);
    assert.equal(fs.readFileSync(path.join(root, 'compose.html'), 'utf8'), '<p>No tracker</p>');
    assert.equal(updateExistingTrackerPages(root).changed_pages, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
