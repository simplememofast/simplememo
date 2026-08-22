/**
 * POST /api/survey
 *
 * Same-origin receiver for the roadmap survey on /roadmap/ and /en/roadmap/.
 * Validates cheaply, then forwards the body server-side to the Relay Worker
 * (`POST https://api.simplememofast.com/v1/survey/response`), which is what
 * actually writes to D1 `survey_responses`.
 *
 * Why the hop exists rather than posting to the Worker from the browser:
 *
 *   1. `_headers` pins `connect-src 'self'` for the whole site. A direct
 *      fetch to api.simplememofast.com is refused by the page's own CSP, and
 *      widening connect-src for one form would widen it for all 240 pages.
 *   2. The Worker has no CORS surface at all (see src/index.ts routeRequest).
 *      Adding preflight handling to a hardened API so a marketing page can
 *      submit a form is the wrong trade — this keeps the browser talking only
 *      to its own origin.
 *
 * No secrets and no bindings are required here, so this deploys with the
 * static site and needs no Cloudflare Pages dashboard configuration.
 *
 * The upstream JSON is passed through verbatim. That is deliberate: when the
 * survey gate is off or the D1 migration has not been applied yet, the reader
 * is told the form is not accepting answers instead of watching a spinner
 * succeed into a void.
 */

const UPSTREAM = 'https://api.simplememofast.com/v1/survey/response';

/** Matches the Worker's own ceiling; free text is capped at 1000 chars there. */
const MAX_BODY_BYTES = 16 * 1024;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // A survey POST must never sit in a cache — /* sets max-age=3600 site-wide.
  'Cache-Control': 'no-store',
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  const { request } = context;

  // Same-origin only. Comparing against the request's OWN origin (rather than
  // a hard-coded apex) keeps *.pages.dev preview deployments working, which a
  // literal allowlist would silently break every time a PR preview is opened.
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ ok: false, error: 'bad_origin' }, 403);
  }

  const declaredLength = parseInt(request.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'too_large' }, 413);
  }

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, error: 'bad_body' }, 400);
  }
  if (raw.length > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'too_large' }, 413);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  let upstream;
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Preserve the reader's IP so the Worker's per-day cap counts people
        // rather than counting this one Pages Function.
        'cf-connecting-ip': request.headers.get('cf-connecting-ip') || '',
      },
      body: JSON.stringify(body),
    });
  } catch {
    return json({ ok: false, error: 'upstream_unreachable' }, 502);
  }

  const text = await upstream.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Upstream answered with something that isn't JSON. Don't echo it — an
    // HTML error page from an edge would land in the reader's browser as our
    // own markup.
    return json({ ok: false, error: 'upstream_error' }, 502);
  }
  return json(parsed, upstream.status);
}

/** Anything but POST. Keeps a stray GET from rendering the 404 page as JSON. */
export async function onRequest(context) {
  if (context.request.method === 'POST') return onRequestPost(context);
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  }
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}
