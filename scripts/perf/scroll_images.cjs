'use strict';
// Test driver only: page timers may be disabled; all waits remain in Node.
async function loadLazyImages(page, { maxSteps = 120, now = Date.now } = {}) {
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 120) throw new Error('Invalid scroll bound');
  const totalDeadline = now() + 45000;
  let bottom = false;
  await page.evaluate(position => scrollTo(0, position), 0);
  for (let step = 0; step < maxSteps && now() < totalDeadline; step++) {
    const state = await page.evaluate(() => ({ top: scrollY, height: document.body.scrollHeight, viewport: innerHeight }));
    if (!state || ![state.top, state.height, state.viewport].every(Number.isFinite) || state.top < 0 || state.height < 0 || state.viewport <= 0) throw new Error('Invalid scroll geometry');
    if (state.top + state.viewport >= state.height - 1) { bottom = true; break; }
    // Deferred sections can change page height when they become relevant.
    await page.evaluate(position => scrollTo(0, position), Math.min(state.top + 700, state.height - state.viewport));
    await page.waitForTimeout(100);
  }
  if (!bottom) throw new Error('Page did not reach the footer within bounded scrolling');
  const pending = await page.locator('img').evaluateAll(images => images.map((image, index) => ({
    index, pending: new URL(image.currentSrc || image.src).origin === location.origin && image.getBoundingClientRect().width > 0 && (!image.complete || image.naturalWidth === 0),
  })).filter(image => image.pending).map(image => image.index));
  for (const index of pending) {
    if (now() >= totalDeadline) throw new Error('Image verification exceeded the total deadline');
    const image = page.locator('img').nth(index);
    await image.scrollIntoViewIfNeeded({ timeout: Math.min(10000, totalDeadline - now()) });
    const deadline = Math.min(totalDeadline, now() + 10000);
    while (!await image.evaluate(node => node.complete && node.naturalWidth > 0)) {
      if (now() >= deadline) throw new Error(`Image ${index} did not load while onscreen within 10 seconds`);
      await page.waitForTimeout(100);
    }
  }
  const complete = await page.evaluate(() => [...document.images].filter(image => new URL(image.currentSrc || image.src).origin === location.origin && image.getBoundingClientRect().width > 0).every(image => image.complete && image.naturalWidth > 0));
  if (!complete) throw new Error('A visible same-origin image remains incomplete');
}
module.exports = { loadLazyImages };
