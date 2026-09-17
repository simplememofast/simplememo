import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForFonts} from './sections_wait.mjs';

test('polls a synchronous primitive without touching the page readiness promise', async () => {
  let calls = 0;
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {fonts: {
    get status() { return ++calls < 3 ? 'loading' : 'loaded'; },
    get ready() { throw new Error('Do not wait on page promises with JavaScript disabled'); },
  }}});
  try {
    await waitForFonts({evaluate: async read => {
      const value = read();
      assert.equal(typeof value, 'string', 'The evaluated result must be a primitive');
      return value;
    }}, {timeoutMs: 1000, intervalMs: 1});
    assert.equal(calls, 3);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('already-loaded fonts do not wait or retry', async () => {
  let calls = 0;
  await waitForFonts({evaluate: async () => { calls++; return 'loaded'; }});
  assert.equal(calls, 1);
});

test('never-loaded fonts fail within the deadline, not silently pass', async () => {
  await assert.rejects(waitForFonts({evaluate: async () => 'loading'}, {timeoutMs: 20, intervalMs: 1}), /timed out/);
});

test('a stalled browser status read is also bounded', async () => {
  await assert.rejects(waitForFonts({evaluate: () => new Promise(() => {})}, {timeoutMs: 20, intervalMs: 1}), /status read timed out/);
});

test('browser failures and invalid states stay failures', async () => {
  const error = new Error('browser disconnected');
  await assert.rejects(waitForFonts({evaluate: async () => { throw error; }}), e => e === error);
  for (const value of [undefined, null, true, 0, 'unknown']) {
    await assert.rejects(waitForFonts({evaluate: async () => value}), /Unexpected font status/);
  }
});

test('rejects invalid deadlines before calling the browser', async () => {
  for (const value of [0, -1, NaN, Infinity, '10']) {
    for (const key of ['timeoutMs', 'intervalMs']) {
      await assert.rejects(waitForFonts({evaluate: () => { throw new Error('must not read'); }}, {[key]: value}), TypeError);
    }
  }
});
