import test from 'node:test';
import assert from 'node:assert/strict';
import { measure } from './check-viewport-overflow.mjs';

// The report-only audit must not hide an incompatible renderer-pool API.
// CI installs Chromium and playwright-core before this required integration test.
test('CI Chromium worker pool measures every requested route and width', {
  skip: process.env.CI !== 'true' ? 'requires the CI browser installation' : false,
}, async () => {
  const pages = ['/', '/en/'], widths = [320, 900];
  const result = await measure({ pages, widths, concurrency: 2 });
  assert.equal(result.measurable, true, result.why);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.results.map(row => row.page + ':' + row.width).sort(),
    pages.flatMap(page => widths.map(width => page + ':' + width)).sort());
  assert(result.results.every(row => row.vw === row.width));
});
