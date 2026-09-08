(() => {
  'use strict';
  const root = document.getElementById('aes-demo');
  if (!root) return;
  const create = root.querySelector('[data-demo-create]');
  const tamper = root.querySelector('[data-demo-tamper]');
  const verify = root.querySelector('[data-demo-verify]');
  const plaintext = 'Review the draft at 10:00.';
  let sample = null;
  let busy = false;
  const show = (state) => {
    root.querySelectorAll('[data-demo-state]').forEach((item) => {
      item.hidden = item.dataset.demoState !== state;
    });
    root.dataset.result = state;
  };
  const controls = () => {
    create.disabled = busy;
    tamper.disabled = verify.disabled = busy || !sample;
    root.setAttribute('aria-busy', String(busy));
  };
  const hex = (bytes) => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
  const run = async (operation) => {
    if (busy) return;
    busy = true;
    controls();
    show('working');
    try { await operation(); }
    catch {
      sample = null;
      root.querySelector('[data-demo-bytes]').hidden = true;
      show('error');
    } finally {
      busy = false;
      controls();
    }
  };
  if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) {
    show('unsupported');
    return;
  }
  create.addEventListener('click', () => run(async () => {
    sample = null;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const algorithm = { name: 'AES-GCM', iv, tagLength: 128 };
    const sealed = new Uint8Array(await crypto.subtle.encrypt(algorithm, key, new TextEncoder().encode(plaintext)));
    const opened = await crypto.subtle.decrypt(algorithm, key, sealed);
    if (new TextDecoder().decode(opened) !== plaintext) throw new Error('Round-trip mismatch');
    sample = { key, algorithm, sealed };
    root.querySelector('[data-demo-nonce]').textContent = hex(iv);
    root.querySelector('[data-demo-cipher]').textContent = hex(sealed.slice(0, -16));
    root.querySelector('[data-demo-tag]').textContent = hex(sealed.slice(-16));
    root.querySelector('[data-demo-bytes]').hidden = false;
    show('verified');
  }));
  tamper.addEventListener('click', () => run(async () => {
    if (!sample) throw new Error('No sample');
    const changed = sample.sealed.slice();
    changed[0] ^= 1;
    try {
      await crypto.subtle.decrypt(sample.algorithm, sample.key, changed);
    } catch (error) {
      if (error.name !== 'OperationError') throw error;
      show('rejected');
      return;
    }
    throw new Error('Changed ciphertext unexpectedly verified');
  }));
  verify.addEventListener('click', () => run(async () => {
    if (!sample) throw new Error('No sample');
    const opened = await crypto.subtle.decrypt(sample.algorithm, sample.key, sample.sealed);
    if (new TextDecoder().decode(opened) !== plaintext) throw new Error('Round-trip mismatch');
    show('verified');
  }));
  controls();
  show('ready');
})();
