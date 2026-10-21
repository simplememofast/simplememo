import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../functions/admin/_middleware.js', import.meta.url), 'utf8');
const { onRequest } = await import('data:text/javascript,' + encodeURIComponent(source));

test('retired admin never reads secrets or invokes a downstream handler', async () => {
  const env = new Proxy({}, { get() { throw new Error('retired feature read a secret'); } });
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    for (const route of ['/admin/', '/admin/brand/', '/admin/reddit/', '/admin/api/x-post', '/admin/api/x-delete', '/admin/api/upload', '/admin/api/post-tiktok', '/admin/api/x-verify']) {
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
    assert.match(text, /jobs:\s*\n  post:\n(?:    #.*\n)*    if: \$\{\{ false \}\}/, name);
  }
});
