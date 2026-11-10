import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

// 2026-11-10 audit: cdnjs was allowed in script-src only for the retired admin
// tools. It must not come back into the site-wide CSP, and no served page
// outside admin/ may load from it.
test('the site-wide CSP no longer allows cdnjs, and only retired admin pages reference it', async () => {
  const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  const csp = headers.split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l)) ?? '';
  assert.ok(csp.includes("script-src 'self'"), 'CSP line must be found');
  assert.doesNotMatch(csp, /cdnjs\.cloudflare\.com/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  const { execFileSync } = await import('node:child_process');
  // fileURLToPath, not .pathname: .pathname keeps percent-escapes (a space is
  // %20), so git would be handed a directory that does not exist.
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = execFileSync('git', ['-C', root, 'ls-files', '-z', '*.html'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const offenders = files.filter((f) => !f.startsWith('admin/')
    && readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes('cdnjs.cloudflare.com'));
  assert.deepEqual(offenders, []);
});
