// /admin/* is protected by Cloudflare Access (Zero Trust) at the edge.
//
// Identity allowlist is configured in the Cloudflare Zero Trust dashboard
// (Access → Applications), not here. This middleware deliberately has no
// allowlist of its own; its only job is to refuse any request that did not
// come through Access, to refuse cross-origin state-changing requests (CSRF,
// see isCrossOrigin) and to strip caching from authenticated responses.
//
// Why presence of a `Cf-Access-*` header is enough:
// Cloudflare strips client-supplied `Cf-*` request headers before they reach
// the origin, so an attacker hitting Pages Functions directly cannot forge
// these headers. We accept either of two markers Access injects after a
// successful authentication:
//
//   - `Cf-Access-Jwt-Assertion`: signed JWT, present for every request that
//     passed Access regardless of identity provider. This is the primary
//     check.
//   - `Cf-Access-Authenticated-User-Email`: identity-bearing header. Present
//     for IdPs that expose an email (Google SSO, One-Time PIN). Used as a
//     secondary signal and surfaced in the request log.
//
// We treat the JWT presence as authoritative because some IdP configurations
// (or future identity types like service tokens / mTLS) won't expose an
// email but always carry the JWT.
//
// Defense-in-depth JWT signature verification (validating against the team's
// JWKS at <team>.cloudflareaccess.com/cdn-cgi/access/certs) can be added
// later if needed; for now header presence is the gate, and Cloudflare's
// header-stripping guarantee is what makes that safe.

const NO_STORE = "private, no-store";

function deny(message, status, debugHeaders) {
  const headers = {
    "Content-Type": "text/plain; charset=UTF-8",
    "Cache-Control": NO_STORE,
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (debugHeaders) {
    // Surface what we did and didn't see so an operator can tell at a glance
    // (in the browser DevTools Network tab) whether Access actually injected
    // its headers. The values are booleans, not the raw header content.
    headers["X-Auth-Debug"] = debugHeaders;
  }
  return new Response(message, { status, headers });
}

// True when the browser itself reports that another origin made the request.
// Current browsers attach `Origin` to every request whose method is not
// GET/HEAD (as "null" when privacy rules hide the real value) and
// `Sec-Fetch-Site` to every HTTPS request; a web page can neither forge nor
// remove either. Clients that are not browsers (e.g. curl in the
// x-post-*-scheduled workflows) send neither and cannot be used for CSRF, so
// a missing header is not treated as cross-origin — the same rule as
// functions/api/survey.js. Comparing against the request's OWN origin keeps
// *.pages.dev preview deployments working.
function isCrossOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin !== null && origin !== new URL(request.url).origin) return true;
  const site = request.headers.get("Sec-Fetch-Site");
  return site !== null && site !== "same-origin" && site !== "none";
}

export async function onRequest(context) {
  const { request } = context;

  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");

  if (!jwt && !email) {
    const dbg =
      `jwt=${jwt ? "1" : "0"} email=${email ? "1" : "0"} ` +
      `cf_ray=${request.headers.get("Cf-Ray") ? "1" : "0"} ` +
      `cf_appsession=${(request.headers.get("Cookie") || "").includes("CF_AppSession") ? "1" : "0"} ` +
      `cf_authorization=${(request.headers.get("Cookie") || "").includes("CF_Authorization") ? "1" : "0"}`;
    return deny(
      "Forbidden.\n\n" +
      "This area requires Cloudflare Access SSO. If you reached this page " +
      "from the public internet, the Cloudflare Access policy is not " +
      "configured correctly for /admin/*.\n",
      403,
      dbg,
    );
  }

  // CSRF: Access treats the CF_Authorization cookie as proof of login, and
  // the browser attaches that cookie to requests other sites make it send
  // too (an auto-submitted form, fetch with mode "no-cors"). Access then
  // injects the headers checked above, so they prove who is logged in, not
  // that the admin meant to send this request. Every method other than
  // GET/HEAD is treated as state-changing (x-post, x-delete, post-tiktok and
  // upload all act on POST), so such requests must come from this origin.
  if (request.method !== "GET" && request.method !== "HEAD" && isCrossOrigin(request)) {
    return deny(
      "Forbidden.\n\n" +
      "Cross-origin requests that can change state are refused.\n",
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
