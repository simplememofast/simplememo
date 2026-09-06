import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/contact-form.js', import.meta.url), 'utf8');
function page(locale = 'ja', response = { status: 200, data: { success: true } }) {
  const elements = Object.fromEntries(['form', 'body', 'email', 'submit', 'status', 'counter',
    'device', 'os', 'version', 'steps', 'expected', 'actual'].map(key => [key, {
    value: '', textContent: '', handlers: {}, attributes: {}, disabled: false,
    addEventListener(event, callback) { this.handlers[event] = callback; },
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() { this.focused = true; }
  }]));
  elements.form.reset = () => Object.values(elements).forEach(el => { el.value = ''; });
  const requests = [];
  const document = {
    getElementById(id) { return elements[id.replace('inquiry-', '')]; },
    documentElement: { getAttribute() { return locale; } },
    addEventListener() {}
  };
  vm.runInNewContext(source, { document, fetch: async (url, options) => {
    requests.push({ url, payload: JSON.parse(options.body) });
    if (response instanceof Error) throw response;
    return { status: response.status, json: async () => response.data };
  }});
  return { elements, requests, async submit() {
    elements.form.handlers.submit({ preventDefault() {} });
    await new Promise(setImmediate);
  }};
}

test('ordinary inquiries do not acquire empty reproduction sections or inferred device facts', async () => {
  const p = page();
  p.elements.body.value = '  A question  ';
  await p.submit();
  assert.equal(p.requests[0].payload.body, 'A question');
  assert.equal(p.requests[0].payload.app_version, null);
  assert.equal(p.requests[0].payload.device, '');
  assert.equal(p.requests[0].payload.os, '');
});

for (const locale of ['ja', 'en']) {
  test(`${locale} reproduction details and explicit version reach the existing request body`, async () => {
    const p = page(locale);
    Object.assign(p.elements.body, { value: 'Sync fails' });
    p.elements.steps.value = 'Open Watch app\nTap send';
    p.elements.expected.value = 'Memo delivered';
    p.elements.actual.value = 'Still waiting';
    p.elements.version.value = ' 5.8.20 ';
    p.elements.device.value = 'Apple Watch Series 9';
    p.elements.os.value = 'watchOS 26';
    p.elements.steps.handlers.input();
    const count = p.elements.counter.textContent;
    await p.submit();
    const { payload } = p.requests[0];
    assert.ok(payload.body.includes(locale === 'ja' ? '再現手順:\n' : 'Steps to reproduce:\n'));
    assert.ok(payload.body.includes('Open Watch app\nTap send'));
    assert.ok(payload.body.includes('Memo delivered'));
    assert.ok(payload.body.includes('Still waiting'));
    assert.equal(payload.app_version, '5.8.20');
    assert.equal(payload.device, 'Apple Watch Series 9');
    assert.equal(count, `${payload.body.length} / 4000`);
    assert.equal(p.elements.steps.value, '');
    assert.equal(p.elements.counter.textContent, '0 / 4000');
  });
}

test('combined text and headings enforce the server limit without truncation or sending', async () => {
  const p = page();
  p.elements.body.value = 'a'.repeat(3990);
  p.elements.steps.value = 'b'.repeat(100);
  await p.submit();
  assert.equal(p.requests.length, 0);
  assert.equal(p.elements.status.attributes.role, 'alert');
  assert.equal(p.elements.steps.value.length, 100);
});

test('partial details are optional and empty sections are omitted', async () => {
  const p = page();
  p.elements.body.value = 'Problem';
  p.elements.steps.value = '   ';
  p.elements.actual.value = 'Waiting';
  await p.submit();
  assert.equal(p.requests[0].payload.body, 'Problem\n\n実際の結果:\nWaiting');
});

for (const response of [{ status: 429, data: {} }, new Error('offline')]) {
  test(`failed delivery retains reproduction details (${response.status || response.message})`, async () => {
    const p = page('en', response);
    p.elements.body.value = 'Problem';
    p.elements.steps.value = 'Open app';
    await p.submit();
    assert.equal(p.elements.steps.value, 'Open app');
    assert.equal(p.elements.body.value, 'Problem');
    assert.equal(p.elements.submit.disabled, false);
    assert.equal(p.elements.status.attributes.role, 'alert');
  });
}

test('empty primary message still requests a description', async () => {
  const p = page();
  p.elements.steps.value = 'Open app';
  await p.submit();
  assert.equal(p.requests.length, 0);
  assert.equal(p.elements.body.focused, true);
});
