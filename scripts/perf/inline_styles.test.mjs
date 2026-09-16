import assert from 'node:assert/strict';
import fs from 'node:fs';
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
test('rejects inactive or ambiguous copies', () => {
  for (const html of [`<!-- ${inline(layout)} -->`, `<script type="text/plain">${inline(layout)}</script>`, inline(layout) + inline(layout), inline(layout).replace('<style ', '<style media="print" ')]) assert.equal(hasCurrentInlineSharedCss(html, css), false);
});
test('both real homepages receive the current shared layout, and corruption is detected', () => {
  const shared = fs.readFileSync(new URL('../../assets/css/style.min.css', import.meta.url), 'utf8');
  for (const file of ['../../index.html', '../../en/index.html']) {
    const html = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.equal(hasCurrentInlineSharedCss(html, shared), true, file);
    assert.equal(hasCurrentInlineSharedCss(html.replace('data-home-perf="base"', 'data-home-perf="missing"'), shared), false, file);
    assert.equal(hasCurrentInlineSharedCss(html, shared + '\n/* source changed */'), false, file);
  }
});
