import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORKFLOW, STEP } from './lib/viewport-health.mjs';

const read = name => fs.readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
const gate = read('seo-check.yml'), report = read(WORKFLOW);
const block = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

test('full report has identical revision triggers and an independent cancellation group', () => {
  assert.equal(block(report, 'on:\n', '\nconcurrency:'), block(gate, 'on:\n', '\n# Validate').trimEnd() + '\n');
  assert.match(report, /group: viewport-full-report-/);
  assert.match(report, /cancel-in-progress: \$\{\{ github.ref != 'refs\/heads\/main' \}\}/);
  assert.doesNotMatch(report, /pull_request_target:|workflow_run:|workflow_dispatch:|needs:/);
});

test('both workflows check out the event revision with the same pinned tools', () => {
  const setup = text => block(text, '      - uses: actions/checkout@', '      - name:');
  // Comments describe the next step and differ; compare executable setup lines.
  const executable = text => text.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')).join('\n');
  assert.equal(executable(setup(report)), executable(setup(gate)));
  assert.match(report, /persist-credentials: false/);
  assert.doesNotMatch(report, /\n\s+ref:|secrets\.|actions: write|contents: write|actions: read/);
  assert.match(report, /permissions:\n  contents: read/);
});

test('only exhaustive rendering leaves the merge gate; all browser safety tests remain mandatory', () => {
  for (const command of ['node scripts/check-viewport-overflow.mjs --static',
    'node --test scripts/webkit-driver.test.mjs scripts/viewport-health.test.mjs scripts/viewport-pool.test.mjs',
    'node --test scripts/viewport-pool-browser.test.mjs']) assert.ok(gate.includes(command), command);
  assert.doesNotMatch(gate, /node scripts\/check-viewport-overflow.mjs --report/);
  const integration = block(gate, '      - name: Viewport renderer pool browser integration', '      # 【性質テスト】');
  assert.doesNotMatch(integration, /continue-on-error|\|\| true|\n\s+if:/);
  assert.ok(report.includes(`- name: ${STEP}`));
  assert.match(report, /node scripts\/check-viewport-overflow.mjs --report\n/);
  assert.doesNotMatch(report, /--scope|--changed|--width|--pages|--reuse|\n\s+VIEWPORT_[A-Z_]+:/);
  assert.match(report, /webkit2gtk-driver xvfb x11-utils/);
  assert.match(report, /webkitgtk-webdriver xvfb x11-utils/);
});

test('daily keeps both suites while auto-merge still listens only to SEO Validation', () => {
  const daily = read('main-daily-validation.yml');
  assert.ok(daily.includes('uses: ./.github/workflows/seo-check.yml'));
  assert.ok(daily.includes(`uses: ./.github/workflows/${WORKFLOW}`));
  assert.doesNotMatch(read('auto-merge.yml'), /Viewport Full Report|viewport-full-report/);
});
