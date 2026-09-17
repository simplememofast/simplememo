// Only content-addressed public homepage assets receive long browser caching.
// The parent URL/auth/publication middleware remains authoritative. Do not
// buffer, alter or re-encode bodies, and never cache private/error responses.
export const PREFIX = '/assets/home-perf/';
export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const REVALIDATE = 'public, no-cache';

export function cachePolicy(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) return null;
  // Conditional responses carry cache metadata too. Pages can omit Content-Type
  // on 304; rejecting every 304 left the old/duplicate _headers policy in place.
  const notModified = response.status === 304
    && (request.headers.has('if-none-match') || request.headers.has('if-modified-since'));
  if (response.status !== 200 && !notModified) return null;
  if (request.headers.has('authorization') || request.headers.has('range')) return null;
  if (response.headers.has('set-cookie')
      || /(?:^|,)\s*(?:private|no-store)\b/i.test(response.headers.get('cache-control') || '')
      || /(?:^|,)\s*(?:cookie|authorization|\*)\s*(?:,|$)/i.test(response.headers.get('vary') || '')) return null;
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(PREFIX)) return null;
  const file = pathname.slice(PREFIX.length);
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  // Only a truly omitted type is allowed on conditional 304. A conflicting or
  // empty Content-Type remains ineligible; 200 must always have the proper type.
  const compatible = expected => type === expected
    || (notModified && !response.headers.has('content-type'));
  if (file === 'manifest.json' && compatible('application/json')) return REVALIDATE;
  // No unhashed filenames, nested paths, percent-encoded aliases or HTML.
  if (/^[a-z0-9-]+-[0-9a-f]{12}\.woff2$/.test(file) && compatible('font/woff2')) return IMMUTABLE;
  if (/^[a-z0-9-]+-[0-9a-f]{12}\.avif$/.test(file) && compatible('image/avif')) return IMMUTABLE;
  if (/^[a-z0-9-]+-[0-9a-f]{12}\.webp$/.test(file) && compatible('image/webp')) return IMMUTABLE;
  return null;
}

export async function onRequest(context) {
  const response = await context.next();
  const policy = cachePolicy(context.request, response);
  if (policy === null || response.headers.get('cache-control') === policy) return response;
  const headers = new Headers(response.headers);
  // set(), not append(): _headers may otherwise leave multiple max-age values.
  headers.set('Cache-Control', policy);
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
  });
}
