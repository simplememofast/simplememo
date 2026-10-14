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

test('every indexable HTML page with an own-app CTA or next-step card includes tracking and GA4', () => {
  const files = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const missing = [];
  for (const file of files) {
    const html = fs.readFileSync(path.join(root.pathname, file), 'utf8');
    if (/<meta\b[^>]*name=["']robots["'][^>]*noindex/i.test(html)) continue;
    // The tracker also sends next_step_click/next_step_impression for the card.
    if (!/href=["']https:\/\/apps\.apple\.com\/[^"']*id6758438948(?:[?\/"'])/i.test(html)
      && !/<a\b[^>]*\bdata-next-step=/i.test(html)) continue;
    if (!/src=["']\/js\/app-store-tracking\.js\?v=/.test(html)) missing.push(`${file}: tracker`);
    if (!/G-EPZVZKCVQG|src=["']\/js\/analytics\.js\?v=/.test(html)) missing.push(`${file}: GA4`);
  }
  assert.deepEqual(missing, []);
});

// Pages that tell visitors nothing about them is collected. Keys omit the locale
// directory. They must stay free of analytics: change the promise first.
const NO_ANALYTICS = {
  // Open-source browser-local app. Every locale's guide.html says the app
  // "has no analytics or external scripts".
  'memo-inbox/index.html': 'Memo Inbox promises no analytics',
  'memo-inbox/guide.html': 'Memo Inbox promises no analytics',
  // Says typed notes are not sent. scripts/build-citation-assets.py omits the
  // analytics bootstrap on purpose (docs/citation-assets.md), and
  // scripts/verify-citation-assets.cjs rejects any request made while it is used.
  'resources/obsidian-inbox/index.html': 'the Markdown tool omits analytics by design',
};
const LOCALE_DIR = /^(?:ja|en|zh|zh-Hant|ko|es|pt-BR|id|ar|tr)\//;

test('every indexable public page loads GA4 unless it promised visitors no analytics', () => {
  const robots = fs.readFileSync(new URL('robots.txt', root), 'utf8');
  const everyone = robots.split(/\n\s*\n/).find(group => /^User-agent:\s*\*\s*$/im.test(group));
  const disallowed = [...(everyone ?? '').matchAll(/^Disallow:\s*\/(\S*)/gim)].map(match => match[1]);
  assert.ok(disallowed.length && !disallowed.includes(''), 'robots.txt rules for * not understood');
  const files = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  const missing = [], broken = [], exempt = new Set();
  let tagged = 0;
  for (const file of files) {
    if (disallowed.some(prefix => file.startsWith(prefix))) continue;
    const html = fs.readFileSync(path.join(root.pathname, file), 'utf8');
    if (/<meta\b(?=[^>]*\bname=["']?robots\b)(?=[^>]*\bcontent=["'][^"']*\bnoindex)[^>]*>/i.test(html)) continue;
    const key = file.replace(LOCALE_DIR, '');
    if (Object.hasOwn(NO_ANALYTICS, key)) {
      exempt.add(key);
      if (/G-EPZVZKCVQG|googletagmanager\.com|\/js\/analytics\.js|analytics\.ahrefs\.com/.test(html)) broken.push(`${file}: ${NO_ANALYTICS[key]}`);
    } else if (/G-EPZVZKCVQG|src=["']\/js\/analytics\.js\?v=/.test(html)) tagged++;
    else missing.push(file);
  }
  assert.ok(tagged > 1000, `only ${tagged} pages checked`);
  assert.deepEqual(missing, []);
  assert.deepEqual(broken, []);
  assert.deepEqual(Object.keys(NO_ANALYTICS).filter(key => !exempt.has(key)), [], 'stale exemption');
});

test('every inline GA4 loader queues production config before deferred loading and blocks previews', () => {
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
        const production = ['simplememofast.com', 'www.simplememofast.com'].includes(hostname);
        if (production) {
          const commands = Array.from(context.dataLayer, args => args[0]);
          assert.deepEqual(commands, ['js', 'config'], `${file} on ${hostname}`);
          const configs = Array.from(context.dataLayer).filter(args => args[0] === 'config');
          assert.equal(configs.length, 1, file);
          assert.equal(configs[0][1], 'G-EPZVZKCVQG', file);
        } else {
          assert.equal(context.dataLayer, undefined, file);
          assert.equal(listeners.length, 0, `${file} on ${hostname}`);
        }
        listeners.forEach(callback => callback());
        assert.equal(appended.length, production ? 1 : 0, `${file} on ${hostname}`);
        if (production) assert.equal(appended[0].onload, undefined, file);
      }
    }
  }
  assert.ok(checked > 0, 'No inline loaders were checked');
});
