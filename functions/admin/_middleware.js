// /admin/* is protected by Cloudflare Access (Zero Trust) at the edge.
//
// Identity allowlist (e.g. only hajimeataka@gmail.com via Google SSO) is
// configured in the Cloudflare Zero Trust dashboard → Access → Applications,
// not here. This middleware deliberately has no allowlist of its own; its
// only job is to refuse any request that did not come through Access and to
// strip caching from authenticated responses.
//
// Why presence of `CF-Access-Authenticated-User-Email` is enough:
// Cloudflare strips client-supplied `CF-*` request headers before they reach
// the origin, so an attacker hitting Pages Functions directly cannot forge
// this header. Defense-in-depth JWT verification (validating
// `CF-Access-Jwt-Assertion` against the team JWKS endpoint) can be added
// later — see Cloudflare's "Validate JWTs" docs.
//
// IMPORTANT pre-deploy step: a Zero Trust Application MUST be configured to
// gate `simplememofast.com/admin/*`. Without it, all admin requests will
// return 403 here and `/admin/` becomes inaccessible to everyone, including
// the legitimate operator. The deploy is fail-closed by design.

const NO_STORE = "private, no-store";

function deny(message, status) {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": NO_STORE,
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function onRequest(context) {
  const { request } = context;
  const accessUser = request.headers.get("CF-Access-Authenticated-User-Email");

  if (!accessUser) {
    return deny(
      "Forbidden.\n\n" +
      "This area requires Cloudflare Access SSO. If you reached this page " +
      "from the public internet, the Cloudflare Access policy is not " +
      "configured correctly for /admin/*.\n",
      403,
    );
  }

  const upstream = await context.next();

  // Strip CDN/browser caching from every admin response. The site-wide
  // _headers rule sets `Cache-Control: public, max-age=3600` for `/*` —
  // without this override, an authenticated JSON payload could be served
  // from Cloudflare's edge cache to a different visitor.
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
