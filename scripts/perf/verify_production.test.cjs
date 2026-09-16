'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pageMatches } = require('./verify_production.cjs');
for (const file of ['index.html', 'en/index.html']) {
  test(`deployment comparison requires the actual optimized styles, sources and parse order: ${file}`, () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    assert.equal(pageMatches(html, html), true);
    assert.equal(pageMatches('<html>not deployed</html>', html), false);
    assert.equal(pageMatches(html.replaceAll('/assets/home-perf/', '/assets/old/'), html), false);
    assert.equal(pageMatches(html.replace('id="hero-title"', 'id="missing-title"'), html), false);
    assert.equal(pageMatches('<picture class="hero__photograph">' + html, html), false);
    assert.equal(pageMatches(html, ''), false);
  });
}
