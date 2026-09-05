import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const source = fs.readFileSync(new URL('js/analytics.js', root), 'utf8');
function browser(hostname) {
  const appended = [], listeners = [];
  const context = {
    location: { hostname },
    document: { readyState: 'loading', documentElement: { lang: 'en' },
      querySelector: () => null, createElement: () => ({}),
      head: { appendChild: script => appended.push(script) } },
    dataLayer: [['event', 'app_store_click']],
    requestIdleCallback: callback => callback(),
    addEventListener: (_, callback) => listeners.push(callback),
  };
  context.window = context;
  vm.createContext(context);
  const run = () => vm.runInContext(source, context);
  run();
  return { context, appended, listeners, run };
}

test('FAQ analytics config precedes queued clicks and loads once after window load', () => {
  const b = browser('simplememofast.com');
  b.run();
  assert.deepEqual(Array.from(b.context.dataLayer, args => args[0]), ['js', 'config', 'event']);
  assert.equal(b.context.dataLayer[1][2].page_language, 'en');
  assert.equal(b.appended.length, 0);
  assert.equal(b.listeners.length, 1);
  b.listeners[0]();
  assert.equal(b.appended.length, 1);
  assert.match(b.appended[0].src, /id=G-EPZVZKCVQG$/);
});

test('local and Pages preview visits do not load production FAQ analytics', () => {
  for (const hostname of ['localhost', 'example.simplememo.pages.dev', 'simplememofast.com.example']) {
    const b = browser(hostname);
    assert.equal(b.listeners.length, 0);
    assert.equal(b.appended.length, 0);
    assert.equal(b.context.dataLayer.length, 1);
  }
});

test('every indexable HTML page with an own-app CTA includes tracking and GA4', () => {
  const files = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const missing = [];
  for (const file of files) {
    const html = fs.readFileSync(path.join(root.pathname, file), 'utf8');
    if (/<meta\b[^>]*name=["']robots["'][^>]*noindex/i.test(html)) continue;
    if (!/href=["']https:\/\/apps\.apple\.com\/[^"']*id6758438948(?:[?\/"'])/i.test(html)) continue;
    if (!/src=["']\/js\/app-store-tracking\.js\?v=/.test(html)) missing.push(`${file}: tracker`);
    if (!/G-EPZVZKCVQG|src=["']\/js\/analytics\.js\?v=/.test(html)) missing.push(`${file}: GA4`);
  }
  assert.deepEqual(missing, []);
});

test('every inline GA4 loader blocks previews/local QA and still configures production', () => {
  const files = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  let checked = 0;
  for (const file of files) {
    const html = fs.readFileSync(path.join(root.pathname, file), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      if (!match[0].includes('G-EPZVZKCVQG')) continue;
      assert.ok(match[1].trim(), `${file}: unguarded external GA4 script`);
      checked++;
      for (const hostname of ['simplememofast.com', 'www.simplememofast.com', '127.0.0.1', 'preview.simplememo.pages.dev']) {
        const appended = [], listeners = [];
        const context = { location: { hostname, pathname: '/' + file },
          document: { createElement: () => ({}), head: { appendChild: s => appended.push(s) } },
          requestIdleCallback: callback => callback(), addEventListener: (_, callback) => listeners.push(callback) };
        context.window = context;
        vm.runInNewContext(match[1], context);
        listeners.forEach(callback => callback());
        const production = ['simplememofast.com', 'www.simplememofast.com'].includes(hostname);
        assert.equal(appended.length, production ? 1 : 0, `${file} on ${hostname}`);
        if (production) {
          appended[0].onload();
          const configs = Array.from(context.dataLayer).filter(args => args[0] === 'config');
          assert.equal(configs.length, 1, file);
          assert.equal(configs[0][1], 'G-EPZVZKCVQG', file);
        } else assert.equal(context.dataLayer, undefined, file);
      }
    }
  }
  assert.ok(checked > 0, 'No inline loaders were checked');
});
