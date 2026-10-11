import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG_URL = 'googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
const paths = execFileSync('git', ['ls-files', '-z', '*.html'], { cwd: ROOT })
  .toString('utf8').split('\0').filter(Boolean);

function loader(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]).filter((body) => body.includes(TAG_URL));
  assert.equal(scripts.length, 1, `${file}: one GA4 loader`);
  return scripts[0];
}

test('every tracked GA4 page queues its config before deferred loading and custom events', () => {
  const tagged = paths.filter((file) => fs.readFileSync(path.join(ROOT, file), 'utf8').includes(TAG_URL));
  assert.ok(tagged.length >= 400, 'the site-wide GA4 inventory should not silently shrink');
  for (const file of tagged) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!html.includes('/js/analytics.js'), `${file}: do not configure GA4 twice`);
    const script = loader(file);
    assert.equal((script.match(/gtag\('js'/g) || []).length, 1, file);
    assert.equal((script.match(/gtag\('config'/g) || []).length, 1, file);
    assert.ok(script.indexOf("gtag('js'") < script.indexOf("gtag('config'"), file);
    assert.ok(script.indexOf("gtag('config'") < script.indexOf("window.addEventListener('load'"), file);
    assert.ok(script.indexOf("gtag('config'") < script.indexOf('document.head.appendChild('), file);
    assert.ok(!/\b(?:s|sc)\.onload\s*=/.test(script), file);
    assert.ok(script.includes('simplememofast\\.com'), file);
    new vm.Script(script, { filename: file });
  }
});

test('a production page queues config immediately, while the network tag stays deferred', () => {
  let load;
  let idle;
  const appended = [];
  const window = {
    addEventListener(name, callback) { assert.equal(name, 'load'); load = callback; },
    requestIdleCallback(callback) { idle = callback; },
  };
  const document = {
    createElement(name) { assert.equal(name, 'script'); return {}; },
    head: { appendChild(script) { appended.push(script); } },
  };
  vm.runInNewContext(loader('obsidian/getting-started/index.html'), {
    window, document, location: { hostname: 'simplememofast.com', pathname: '/obsidian/getting-started/' }, Date,
  });
  assert.deepEqual(Array.from(window.dataLayer, (args) => args[0]), ['js', 'config']);
  assert.equal(window.dataLayer[1][1], 'G-EPZVZKCVQG');
  assert.equal(window.dataLayer[1][2].page_language, 'ja');
  assert.equal(appended.length, 0);
  window.dataLayer.push(['event', 'seo_cta_impression']);
  assert.deepEqual(Array.from(window.dataLayer, (args) => args[0]), ['js', 'config', 'event']);
  load();
  assert.equal(appended.length, 0);
  idle();
  assert.equal(appended.length, 1);
  assert.equal(appended[0].async, true);
  assert.match(appended[0].src, /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=/);
  assert.equal(appended[0].onload, undefined);
});

test('preview hosts neither queue GA4 commands nor load the tag', () => {
  const window = { addEventListener() { throw new Error('unexpected handler'); } };
  vm.runInNewContext(loader('en/blog/obsidian-voice-input.html'), {
    window, location: { hostname: 'preview.simplememo.pages.dev', pathname: '/en/blog/obsidian-voice-input' },
  });
  assert.equal(window.dataLayer, undefined);
});
