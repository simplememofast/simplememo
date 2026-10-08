import assert from 'node:assert/strict';

// Reuse one renderer per worker, but never carry a reader's locale or other
// origin state into the next measurement. HTTP assets may stay cached.
export async function measureViewportJobs({ browser, jobs, origin, probe,
  concurrency = 6, onProgress = () => {} }) {
  assert(Number.isInteger(concurrency) && concurrency > 0, 'Positive concurrency required');
  const results = [], failures = [];
  let next = 0, completed = 0;
  const worker = async () => {
    let context, page, session;
    const close = async () => {
      if (context) await context.close().catch(() => {});
      context = page = session = null;
    };
    try {
      for (let i = next++; i < jobs.length; i = next++) {
        const job = jobs[i];
        try {
          if (!context) {
            context = await browser.newContext();
            await context.addInitScript(() => {
              // about:blank has no storage origin; actual documents do.
              try { sessionStorage.clear(); } catch {}
            });
            page = await context.newPage();
            session = await context.newCDPSession(page);
          }
          await page.goto('about:blank');
          await context.clearCookies();
          await session.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
          await page.setViewportSize({ width: job.width, height: 800 });
          await page.goto(origin + job.page, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(250);
          results.push({ ...job, ...(await page.evaluate(probe)) });
        } catch (error) {
          failures.push({ ...job, why: String(error.message || error).split('\n')[0].slice(0, 120) });
          // A crashed renderer must not prevent the remaining jobs from running.
          await close();
        }
        completed++;
        onProgress({ completed, total: jobs.length, failed: failures.length });
      }
    } finally { await close(); }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return { results, failures };
}
