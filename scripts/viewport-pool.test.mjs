import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { measureViewportJobs } from './lib/viewport-pool.mjs';

const origin = 'http://127.0.0.1:1234';
function fixture({ failOnce, failReset = false } = {}) {
  const contexts = [], visits = [];
  let active = 0, maximum = 0, resetFailed = false;
  const browser = {
    async newContext() {
      const state = { cookies: '', local: '', session: '', database: '' };
      const events = []; let init, url, viewport;
      const context = { closed: false, events,
        async addInitScript(fn) { init = fn; },
        async clearCookies() { events.push('cookies'); state.cookies = ''; },
        async newPage() { return page; },
        async newCDPSession() { return { async send(method, args) {
          assert.equal(method, 'Storage.clearDataForOrigin');
          assert.deepEqual(args, { origin, storageTypes: 'all' });
          events.push('storage');
          if (failReset && !resetFailed) { resetFailed = true; throw Error('storage reset failed'); }
          state.local = state.database = '';
        } }; },
        async close() { assert.equal(context.closed, false); context.closed = true; active--; },
      };
      const page = {
        async goto(next, options) {
          url = next;
          if (next === 'about:blank') { events.push('blank'); return; }
          assert.deepEqual(options, { waitUntil: 'domcontentloaded' });
          assert.equal(next.startsWith(origin + '/'), true);
          vm.runInNewContext('(' + init.toString() + ')()', {
            sessionStorage: { clear() { state.session = ''; } },
          });
          assert.deepEqual(state, { cookies: '', local: '', session: '', database: '' });
          assert.deepEqual(events.slice(-4), ['blank', 'cookies', 'storage', 'viewport']);
          events.push('visit'); visits.push({ url, width: viewport.width });
          if (next === failOnce) { failOnce = null; throw Error('renderer failed'); }
        },
        async setViewportSize(size) { assert.equal(size.height, 800); viewport = size; events.push('viewport'); },
        async waitForTimeout(ms) { assert.equal(ms, 250); events.push('settle'); },
        async evaluate(probe) {
          assert.equal(probe, 'probe'); assert.equal(events.at(-1), 'settle');
          for (const key of Object.keys(state)) state[key] = url;
          return { over: url.endsWith('/wide/') ? 12 : 0, vw: viewport.width };
        },
      };
      active++; maximum = Math.max(maximum, active); contexts.push(context);
      return context;
    },
  };
  return { browser, contexts, visits, maximum: () => maximum };
}

test('all page/width pairs run once with bounded reusable renderers and isolated state', async () => {
  const f = fixture(); const progress = [];
  const jobs = ['/ja/', '/ar/', '/wide/'].flatMap(page => [320, 900, 1100].map(width => ({ page, width })));
  const out = await measureViewportJobs({ browser: f.browser, jobs, origin, probe: 'probe', concurrency: 2,
    onProgress: row => progress.push(row) });
  assert.equal(out.failures.length, 0); assert.equal(out.results.length, jobs.length);
  const key = row => row.page + ':' + row.width;
  assert.deepEqual(out.results.map(key).sort(), jobs.map(key).sort());
  assert.equal(out.results.filter(row => row.over === 12).length, 3);
  assert.equal(f.contexts.length, 2); assert.equal(f.maximum(), 2);
  assert(f.contexts.every(context => context.closed));
  assert.deepEqual(progress.map(row => row.completed), jobs.map((_, i) => i + 1));
  assert.deepEqual(progress.at(-1), { completed: jobs.length, total: jobs.length, failed: 0 });
});

test('a failed renderer is reported and replaced before remaining jobs run', async () => {
  const f = fixture({ failOnce: origin + '/broken/' });
  const jobs = ['/before/', '/broken/', '/after/'].map(page => ({ page, width: 375 }));
  const out = await measureViewportJobs({ browser: f.browser, jobs, origin, probe: 'probe', concurrency: 1 });
  assert.deepEqual(out.results.map(row => row.page), ['/before/', '/after/']);
  assert.deepEqual(out.failures, [{ page: '/broken/', width: 375, why: 'renderer failed' }]);
  assert.equal(f.contexts.length, 2); assert(f.contexts.every(context => context.closed));
});

test('failed state reset cannot be counted as a successful measurement', async () => {
  const f = fixture({ failReset: true });
  const out = await measureViewportJobs({ browser: f.browser, origin, probe: 'probe', concurrency: 1,
    jobs: [{ page: '/one/', width: 320 }, { page: '/two/', width: 320 }] });
  assert.equal(out.failures.length, 1); assert.equal(out.failures[0].why, 'storage reset failed');
  assert.deepEqual(out.results.map(row => row.page), ['/two/']);
  assert.deepEqual(f.visits.map(row => row.url), [origin + '/two/']);
});

test('empty work starts no browser contexts and invalid concurrency fails closed', async () => {
  const f = fixture();
  assert.deepEqual(await measureViewportJobs({ browser: f.browser, origin, probe: 'probe', jobs: [] }),
    { results: [], failures: [] });
  assert.equal(f.contexts.length, 0);
  for (const concurrency of [0, -1, 1.5]) {
    await assert.rejects(measureViewportJobs({ browser: f.browser, origin, jobs: [], concurrency }),
      /Positive concurrency/);
  }
});
