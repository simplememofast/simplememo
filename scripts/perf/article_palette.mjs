import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Exercise the requested article palette in the existing three-engine render job.
export async function checkArticlePalette(browser, url, output, engine) {
  const results = [];
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({viewport: {width, height: 900}, reducedMotion: 'reduce'});
    try {
      const page = await context.newPage();
      await page.goto(url + '/blog/obsidian-voice-input.html', {waitUntil: 'networkidle'});
      const state = await page.evaluate(() => {
        const style = getComputedStyle(document.body);
        return {background: style.backgroundColor, color: style.color,
          overflow: document.documentElement.scrollWidth - innerWidth,
          title: document.querySelector('h1')?.textContent};
      });
      assert.equal(state.background, 'rgb(8, 7, 12)', 'Original Japanese black background');
      assert.equal(state.color, 'rgb(238, 234, 245)', 'Readable original text color');
      assert(state.title && state.overflow <= 1, 'Article title present and no page overflow');
      assert.equal(await page.locator('body').getAttribute('data-voice-layout'), 'restored', 'Historical article hierarchy restored');
      assert.equal(await page.locator('.ce-stage--phone .ce-device img').count(), 1, 'Historical phone frame restored');
      const route = page.locator('.ce-route').first();
      assert.equal(await route.evaluate(n => getComputedStyle(n).transitionDuration), '0s', 'Reduced motion disables route transitions');
      await page.emulateMedia({reducedMotion:'no-preference'});
      assert(await route.evaluate(n => parseFloat(getComputedStyle(n).transitionDuration) > 0), 'Original hover transition restored');
      await page.emulateMedia({reducedMotion:'reduce'});
      // Warm lazy images before the full-page visual review.
      for (const image of await page.locator('main img').all()) {
        await image.scrollIntoViewIfNeeded();
        await page.waitForFunction(n => n.complete && n.naturalWidth > 0, await image.elementHandle(), {timeout:15000});
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({path: path.join(output, `${engine}-article-${width}.png`), fullPage: true});
      const faq = page.locator('.faq-details').first();
      await faq.locator('summary').click();
      assert(await faq.evaluate(n => n.open), 'FAQ remains operable');
      await page.emulateMedia({media: 'print'});
      assert.equal(await page.locator('body').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(255, 255, 255)', 'Print background remains white');
      await page.emulateMedia({media: 'screen'});
      await page.goto(url + '/es/blog/obsidian-voice-input.html', {waitUntil: 'networkidle'});
      assert.equal(await page.locator('body').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(245, 243, 237)', 'Translated article palette remains unchanged');
      results.push({width, ...state, status: 'success'});
    } finally { await context.close(); }
  }
  fs.writeFileSync(path.join(output, `${engine}-article-palette.json`), JSON.stringify(results, null, 2));
}
