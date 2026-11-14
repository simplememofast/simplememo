import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { hasCurrentInlineSharedCss } from './inline_styles.mjs';
const css = "@font-face{font-family:'Noto Sans JP';src:url('/original.woff2')}body{margin:0}.wrap{max-width:100%}";
const layout = 'body{margin:0}.wrap{max-width:100%}';
const inline = rules => `<style data-home-perf="base">\n${rules}\n</style>`;
test('accepts the exact shared layout with different font delivery', () => {
  assert.equal(hasCurrentInlineSharedCss(inline(layout), css), true);
  assert.equal(hasCurrentInlineSharedCss(inline("@font-face{font-family:'Noto Sans JP';src:url('/subset.woff2')}" + layout), css), true);
});
test('rejects a stale copy, missing rules, empty source and a marker alone', () => {
  for (const html of [inline(layout.replace('100%', '200%')), inline(''), '<p data-home-perf="base">assets/css/style.min.css</p>']) assert.equal(hasCurrentInlineSharedCss(html, css), false);
  assert.equal(hasCurrentInlineSharedCss(inline(layout), ''), false);
});
test('a comment-only difference carries no rules and does not make a copy stale', () => {
  assert.equal(hasCurrentInlineSharedCss(inline('p{x:1}'), '/* note */p{x:1}/* end */'), true);
  assert.equal(hasCurrentInlineSharedCss(inline('p{x:1}'), '/* note */p{x:2}'), false);
});
test('accepts a purged copy that keeps every nameless rule verbatim and in order', () => {
  const source = "@font-face{font-family:'Noto Sans JP';src:url('/original.woff2')}body{margin:0}.wrap,.gone{max-width:100%}@media (min-width:1px){.gone{x:1}img{max-width:100%}}.gone:hover{x:2}@keyframes spin{to{transform:rotate(1turn)}}";
  const purged = 'body{margin:0}.wrap{max-width:100%}@media (min-width:1px){img{max-width:100%}}@keyframes spin{to{transform:rotate(1turn)}}';
  assert.equal(hasCurrentInlineSharedCss(inline(purged), source), true);
  for (const broken of [
    '.wrap{max-width:100%}@media (min-width:1px){img{max-width:100%}}@keyframes spin{to{transform:rotate(1turn)}}', // element rule dropped
    'body{margin:0}.wrap{max-width:100%}@keyframes spin{to{transform:rotate(1turn)}}', // nameless rule inside @media dropped
    'body{margin:0}.wrap{max-width:100%}@media (min-width:1px){img{max-width:100%}}', // at-rule dropped
    'body{margin:0}.wrap{max-width:200%}@media (min-width:1px){img{max-width:100%}}@keyframes spin{to{transform:rotate(1turn)}}', // stale body
    '.wrap{max-width:100%}body{margin:0}@media (min-width:1px){img{max-width:100%}}@keyframes spin{to{transform:rotate(1turn)}}', // reordered
    `${purged}.extra{x:1}`, // rule the source does not have
  ]) assert.equal(hasCurrentInlineSharedCss(inline(broken), source), false, broken);
  assert.equal(hasCurrentInlineSharedCss(inline('p{x:1}'), 'p,.gone{x:1}'), true);
  assert.equal(hasCurrentInlineSharedCss(inline('.gone{x:1}'), 'p,.gone{x:1}'), false, 'nameless selector dropped from a list');
});
test('rejects inactive or ambiguous copies', () => {
  for (const html of [`<!-- ${inline(layout)} -->`, `<script type="text/plain">${inline(layout)}</script>`, inline(layout) + inline(layout), inline(layout).replace('<style ', '<style media="print" ')]) assert.equal(hasCurrentInlineSharedCss(html, css), false);
});
test('legacy homepages receive the current shared layout, and corruption is detected', () => {
  const shared = fs.readFileSync(new URL('../../assets/css/style.min.css', import.meta.url), 'utf8');
  for (const file of ['../../en/index.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.equal(hasCurrentInlineSharedCss(html, shared), true, file);
    assert.equal(hasCurrentInlineSharedCss(html.replace('data-home-perf="base"', 'data-home-perf="missing"'), shared), false, file);
    assert.equal(hasCurrentInlineSharedCss(html, shared + '\nbody{margin:1px}'), false, file);
  }
});

test('the editorial homepage uses its source-hashed stylesheet without stale legacy inline CSS', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../assets/css/home-editorial.css', import.meta.url));
  const hash = crypto.createHash('sha256').update(css).digest('hex').slice(0, 10);
  assert(/<body[^>]*class="[^"]*\bsm-editorial\b/.test(html), 'Explicit layout profile');
  const links = [...html.matchAll(/<link\b[^>]*href="(\/assets\/css\/home-editorial\.css[^"]*)"[^>]*>/g)];
  assert.equal(links.length, 1, 'Exactly one editorial stylesheet');
  assert.equal(links[0][1], `/assets/css/home-editorial.css?v=${hash}`);
  assert(!/<style[^>]*data-home-perf=/.test(html), 'No dormant legacy styles');
  assert(!/href="\/assets\/css\/(?:style\.min|home-hero|site-design)\.css/.test(html), 'No competing legacy styles');
});
