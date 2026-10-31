'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, 'diagnosis_cpu_20261031.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1);
const source = scripts[0][1];

function fixture(script = source, visibilityState = 'visible') {
  const marks = [], timers = [], delays = [];
  let callback, options, disconnected = 0;
  class PerformanceObserver {
    constructor(fn) { callback = fn; }
    observe(value) { options = value; }
    disconnect() { disconnected++; }
  }
  vm.runInNewContext(script, {
    PerformanceObserver,
    document: {visibilityState},
    performance: {mark(name) { marks.push(name); }},
    setTimeout(fn, delay) { timers.push(fn); delays.push(delay); },
  });
  return {marks, timers, delays,
    observe(name) { callback({getEntries: () => [{name}]}); },
    get options() { return options; },
    get disconnected() { return disconnected; },
    finish() {
      let count = 0;
      while (timers.length) {
        assert.ok(count++ < 6, 'fixed protocol must not add tasks or retry');
        timers.shift()();
      }
    }};
}

test('control is self-contained and CSP permits only its exact inline script', () => {
  const hash = createHash('sha256').update(source).digest('base64');
  assert.ok(html.includes("default-src 'none'; script-src 'sha256-" + hash + "'; img-src data:"));
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.ok(!/<(?:script|img|iframe|audio|video)[^>]*\bsrc=/i.test(html));
  assert.ok(html.includes('<link rel="icon" href="data:,">'));
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|Worker|localStorage|sessionStorage)\s*\(/.test(source));
});

test('fixed work waits for FCP, schedules once, and consumes exact checksums', () => {
  const f = fixture();
  assert.equal(f.options.type, 'paint');
  assert.equal(f.options.buffered, true);
  f.observe('first-paint');
  assert.equal(f.timers.length, 0);
  f.observe('first-contentful-paint');
  f.observe('first-contentful-paint');
  assert.equal(f.disconnected, 1);
  assert.equal(f.timers.length, 1);
  f.finish();
  const expected = ['cpu-control-v1:fcp-seen'];
  for (const phase of ['warmup', 'sample']) {
    for (let index = 1; index <= (phase === 'warmup' ? 2 : 3); index++) {
      expected.push(`cpu-control-v1:${phase}:${index}:start`);
      expected.push(`cpu-control-v1:${phase}:${index}:end:${phase === 'warmup' ? 148855246 : 3576595659}`);
    }
  }
  expected.push('cpu-control-v1:done');
  assert.deepEqual(f.marks, expected);
  assert.deepEqual(f.delays, [100, 50, 50, 50, 50]);
});

test('hidden control produces a failure marker instead of a complete result', () => {
  const f = fixture(source, 'hidden');
  f.observe('first-contentful-paint');
  f.finish();
  assert.deepEqual(f.marks, ['cpu-control-v1:fcp-seen', 'cpu-control-v1:error:hidden']);
});

test('less work changes the checksum and cannot complete the control', () => {
  const changed = source.replaceAll('iterations: 16777216', 'iterations: 8388608');
  assert.notEqual(changed, source);
  const f = fixture(changed);
  f.observe('first-contentful-paint');
  f.finish();
  assert.ok(f.marks.includes('cpu-control-v1:error:checksum'));
  assert.ok(!f.marks.includes('cpu-control-v1:done'));
  assert.equal(f.marks.filter(name => name.startsWith('cpu-control-v1:sample:')).length, 2);
});
