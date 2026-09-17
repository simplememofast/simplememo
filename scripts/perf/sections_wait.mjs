import {setTimeout as delay} from 'node:timers/promises';

// Read a primitive from the page: a document.fonts.ready Promise can remain
// unresolved in JavaScript-disabled browser contexts. All waiting runs in Node.
export async function waitForFonts(page, {timeoutMs = 10000, intervalMs = 50} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new TypeError('Font polling requires positive finite time limits');
  }
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Font readiness timed out');
    let timer;
    let status;
    try {
      status = await Promise.race([
        page.evaluate(() => document.fonts.status),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Font status read timed out')), remaining); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (status === 'loaded') return;
    if (status !== 'loading') throw new Error('Unexpected font status: ' + String(status));
    if (Date.now() >= deadline) throw new Error('Font readiness timed out');
    await delay(Math.min(intervalMs, Math.max(1, deadline - Date.now())));
  }
}
