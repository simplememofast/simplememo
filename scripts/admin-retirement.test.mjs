import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../functions/admin/_middleware.js', import.meta.url), 'utf8');
const { onRequest } = await import('data:text/javascript,' + encodeURIComponent(source));

test('retired admin never reads secrets or invokes a downstream handler', async () => {
  const env = new Proxy({}, { get() { throw new Error('retired feature read a secret'); } });
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']) {
    for (const route of ['/admin', '/admin/', '/admin/brand/', '/admin/reddit/', '/admin/api/x-post', '/admin/api/x-delete', '/admin/api/upload', '/admin/api/post-tiktok', '/admin/api/x-verify', '/admin/api/x-captio-search']) {
      const response = await onRequest({
        request: new Request('https://simplememofast.com' + route, { method,
          headers: { 'Cf-Access-Jwt-Assertion': 'even-an-authenticated-request-is-retired', 'Cf-Access-Authenticated-User-Email': 'owner@example.com' } }),
        env,
        next() { throw new Error('retired feature reached a downstream handler'); },
      });
      assert.equal(response.status, 410, method + ' ' + route);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
    }
  }
});

test('manual and scheduled legacy posting jobs remain disabled', () => {
  for (const name of ['x-post-scheduled.yml', 'x-post-en-scheduled.yml', 'auto-post-tiktok.yml']) {
    const text = readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /secrets\.|npm (?:ci|install)|node (?:auto-post|post-to-tiktok)/);
    assert.match(text, /jobs:\s*\n  post:\n(?:    #.*\n)*    if: \$\{\{ false \}\}/, name);
  }
});

// Every legacy route is inert even if invoked outside the middleware chain.
test('direct legacy API exports return 410 without fetching or reading credentials', async () => {
  const retiredURL = 'data:text/javascript,' + encodeURIComponent(source);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('retired API fetched'); };
  try {
    for (const name of ['x-post', 'x-delete', 'x-verify', 'x-captio-search', 'upload', 'post-tiktok']) {
      const src = readFileSync(new URL('../functions/admin/api/' + name + '.js', import.meta.url), 'utf8');
      const { onRequest: handler } = await import('data:text/javascript,' + encodeURIComponent(src.replace("'../_middleware.js'", JSON.stringify(retiredURL))));
      assert.equal((await handler(new Proxy({}, { get() { throw new Error('retired API read context'); } }))).status, 410);
    }
  } finally { globalThis.fetch = previousFetch; }
});
