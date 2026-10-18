// /admin/* is protected by Cloudflare Access (Zero Trust) at the edge.
//
// Identity allowlist is configured in the Cloudflare Zero Trust dashboard
// (Access → Applications), not here. This middleware deliberately has no
// allowlist of its own; its jobs are to refuse any request that did not
// come through Access, to refuse cross-site state-changing requests (see the
// CSRF gate below), and to strip caching from authenticated responses.
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

// CSRF gate (CWE-352).
//
// Once Access has let a browser in, the only credential is the ambient
// CF_Authorization cookie, which the browser may also attach to a POST that a
// third-party page triggers — e.g. an auto-submitted
// `<form enctype="text/plain">` whose body happens to parse as JSON. Every
// state-changing endpoint under /admin/api/ is POST-only, so any method other
// than GET/HEAD has to show it came from this origin:
//
//   - `Sec-Fetch-Site`, when present, must be `same-origin`;
//   - `Origin`, when present, must equal this request's own origin (`null`,
//     sent after a cross-origin redirect or from a sandboxed frame, fails);
//   - a request carrying neither header (curl or a service-token workflow, but
//     also a browser too old to send them) must have an `application/json`
//     body. A cross-site page can only send that type after a CORS preflight,
//     and the preflight itself carries `Origin`, so it fails the rule above.
//
// Current browsers send both headers on every same-origin fetch() POST, so the
// admin UI keeps working.
const SAFE_METHODS = new Set(["GET", "HEAD"]);

function mediaType(request) {
  return (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
}

// Returns why the request must be refused, or null when it may proceed.
function crossSiteRefusal(request) {
  if (SAFE_METHODS.has(request.method)) return null;
  const site = request.headers.get("Sec-Fetch-Site");
  const origin = request.headers.get("Origin");
  if (site !== null && site !== "same-origin") return "sec-fetch-site";
  if (origin !== null && origin !== new URL(request.url).origin) return "origin";
  if (site === null && origin === null && mediaType(request) !== "application/json") {
    return "no-origin-non-json";
  }
  return null;
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

  const refusal = crossSiteRefusal(request);
  if (refusal) {
    return deny(
      "Forbidden.\n\n" +
      "State-changing requests to /admin/* must come from this site's own " +
      "pages. Scripts without an Origin header must send a JSON body " +
      "(Content-Type: application/json).\n",
      403,
      `csrf=${refusal}`,
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
