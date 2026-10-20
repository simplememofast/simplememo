// /admin/* is protected by Cloudflare Access (Zero Trust) at the edge.
//
// Identity allowlist is configured in the Cloudflare Zero Trust dashboard
// (Access → Applications), not here. This middleware deliberately has no
// allowlist of its own; its only job is to refuse any request that did not
// come through Access and to strip caching from authenticated responses.
//
// Why the Access JWT is verified here, not just checked for presence:
// a `Cf-Access-*` request header only means something if Access put it
// there. This Pages project also answers on hostnames that no Access
// application necessarily covers (`simplememo-596.pages.dev` and the
// per-deployment `<hash>.simplememo-596.pages.dev`), and nothing guarantees
// that a client-supplied `Cf-Access-*` header is removed on those. So the
// gate is the token itself: every request must carry
// `Cf-Access-Jwt-Assertion`, and that JWT must
//
//   - be RS256-signed by one of the team's Access keys, published at
//     https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs,
//   - have `iss` equal to https://<ACCESS_TEAM_DOMAIN>,
//   - list one of the ACCESS_AUD tags in `aud` (a token minted for another
//     Access application of the same team is refused), and
//   - be inside its `exp` / `nbf` window.
//
// `Cf-Access-Authenticated-User-Email` is no longer accepted on its own: it
// is an unsigned header and proves nothing. Service tokens
// (`CF-Access-Client-Id` / `CF-Access-Client-Secret`) keep working, because
// Access exchanges them for the same signed JWT before the request arrives.
//
// Configuration (Pages → Settings → Environment variables, Production):
//
//   ACCESS_TEAM_DOMAIN  the Zero Trust team domain, e.g.
//                       `<team>.cloudflareaccess.com`
//   ACCESS_AUD          the Access application's "Application Audience (AUD)
//                       Tag". Several tags may be given, separated by commas,
//                       when more than one Access application fronts /admin/*.
//
// Missing or malformed configuration fails closed: every /admin/* request is
// refused until both are set (and the project redeployed).
//
// Deployments built before this check keep their old middleware and the
// secrets bound when they were built; see admin/brand/docs/setup.md §8.

const NO_STORE = "private, no-store";

// Tolerance for clock skew when checking `exp` / `nbf`, in seconds.
const CLOCK_SKEW_SEC = 60;
// How long fetched signing keys are reused before being fetched again.
const KEYS_TTL_MS = 10 * 60 * 1000;
// A token whose `kid` is not in the cache triggers at most one refetch per
// this interval (covers Access key rotation without letting random `kid`
// values turn every request into an outbound fetch).
const KEYS_UNKNOWN_KID_COOLDOWN_MS = 30 * 1000;

const TEAM_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

// Per-isolate cache of the team's public signing keys (plain JWK data, keyed
// by `kid`). Only plain data is cached, never a promise or an I/O object, so
// nothing is shared across requests that the Workers runtime would refuse.
let keyCache = null; // { certsUrl, keys: Map<kid, jwk>, fetchedAt }

function deny(message, status, debugHeaders) {
  const headers = {
    "Content-Type": "text/plain; charset=UTF-8",
    "Cache-Control": NO_STORE,
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (debugHeaders) {
    // Surface what we did and didn't see so an operator can tell at a glance
    // (in the browser DevTools Network tab) whether Access actually injected
    // its headers. The values are booleans / short reason codes, never the
    // raw header content.
    headers["X-Auth-Debug"] = debugHeaders;
  }
  return new Response(message, { status, headers });
}

function readConfig(env) {
  const domain = String((env && env.ACCESS_TEAM_DOMAIN) || "")
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//, "")
    .replace(/\/+$/, "");
  const auds = String((env && env.ACCESS_AUD) || "")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!TEAM_DOMAIN_RE.test(domain) || auds.length === 0) return null;
  return {
    issuer: "https://" + domain,
    certsUrl: "https://" + domain + "/cdn-cgi/access/certs",
    auds,
  };
}

function base64UrlToBytes(segment) {
  if (!BASE64URL_RE.test(segment)) throw new Error("not base64url");
  const b64 =
    segment.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((segment.length + 3) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonSegment(segment) {
  const value = JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("not a JSON object");
  }
  return value;
}

// Fetch the team's signing keys. Throws when none can be loaded; the caller
// turns that into a refusal (fail closed).
async function fetchSigningKeys(certsUrl) {
  const res = await fetch(certsUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Access certs HTTP " + res.status);
  const body = await res.json();
  const keys = new Map();
  const list = body && Array.isArray(body.keys) ? body.keys : [];
  for (const k of list) {
    if (
      k &&
      k.kty === "RSA" &&
      typeof k.kid === "string" &&
      typeof k.n === "string" &&
      typeof k.e === "string" &&
      (k.alg === undefined || k.alg === "RS256") &&
      (k.use === undefined || k.use === "sig")
    ) {
      keys.set(k.kid, { kty: "RSA", n: k.n, e: k.e });
    }
  }
  if (keys.size === 0) throw new Error("Access certs carry no RS256 key");
  return keys;
}

async function signingKeyFor(cfg, kid) {
  const now = Date.now();
  let cache = keyCache && keyCache.certsUrl === cfg.certsUrl ? keyCache : null;
  const expired = !cache || now - cache.fetchedAt > KEYS_TTL_MS;
  const unknownKid =
    cache !== null &&
    !cache.keys.has(kid) &&
    now - cache.fetchedAt > KEYS_UNKNOWN_KID_COOLDOWN_MS;
  if (expired || unknownKid) {
    const keys = await fetchSigningKeys(cfg.certsUrl);
    cache = { certsUrl: cfg.certsUrl, keys, fetchedAt: Date.now() };
    keyCache = cache;
  }
  return cache.keys.get(kid) || null;
}

// Returns { ok: true, claims } or { ok: false, reason }. Throws only when the
// signing keys cannot be loaded.
async function verifyAccessJwt(token, cfg) {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };

  let header;
  let claims;
  let signature;
  try {
    header = decodeJsonSegment(parts[0]);
    claims = decodeJsonSegment(parts[1]);
    signature = base64UrlToBytes(parts[2]);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // Only RS256 is accepted, whatever the token claims: this rules out
  // `alg: none` and HMAC-with-the-public-key confusion.
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid === "") {
    return { ok: false, reason: "alg" };
  }

  const jwk = await signingKeyFor(cfg, header.kid);
  if (!jwk) return { ok: false, reason: "kid" };

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      new TextEncoder().encode(parts[0] + "." + parts[1]),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "signature" };

  // Claims are only looked at once the signature holds.
  if (claims.iss !== cfg.issuer) return { ok: false, reason: "iss" };

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.some((a) => typeof a === "string" && cfg.auds.includes(a))) {
    return { ok: false, reason: "aud" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    typeof claims.exp !== "number" ||
    !Number.isFinite(claims.exp) ||
    nowSec >= claims.exp + CLOCK_SKEW_SEC
  ) {
    return { ok: false, reason: "exp" };
  }
  if (
    claims.nbf !== undefined &&
    (typeof claims.nbf !== "number" ||
      !Number.isFinite(claims.nbf) ||
      nowSec + CLOCK_SKEW_SEC < claims.nbf)
  ) {
    return { ok: false, reason: "nbf" };
  }

  return { ok: true, claims };
}

export async function onRequest(context) {
  const { request } = context;

  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  const cookie = request.headers.get("Cookie") || "";
  const debug = (reason) =>
    `jwt=${jwt ? "1" : "0"} email=${email ? "1" : "0"} ` +
    `cf_ray=${request.headers.get("Cf-Ray") ? "1" : "0"} ` +
    `cf_appsession=${cookie.includes("CF_AppSession") ? "1" : "0"} ` +
    `cf_authorization=${cookie.includes("CF_Authorization") ? "1" : "0"} ` +
    `reason=${reason}`;

  if (!jwt) {
    return deny(
      "Forbidden.\n\n" +
      "This area requires Cloudflare Access SSO. If you reached this page " +
      "from the public internet, the Cloudflare Access policy is not " +
      "configured correctly for /admin/*.\n",
      403,
      debug("no_jwt"),
    );
  }

  const cfg = readConfig(context.env);
  if (!cfg) {
    return deny(
      "Internal Server Error.\n\n" +
      "Cloudflare Access token verification is not configured for this " +
      "deployment (ACCESS_TEAM_DOMAIN / ACCESS_AUD).\n",
      500,
      debug("not_configured"),
    );
  }

  let result;
  try {
    result = await verifyAccessJwt(jwt, cfg);
  } catch {
    return deny(
      "Service Unavailable.\n\n" +
      "Could not load the Cloudflare Access signing keys to verify this " +
      "request. Try again shortly.\n",
      503,
      debug("keys_unavailable"),
    );
  }
  if (!result.ok) {
    return deny(
      "Forbidden.\n\n" +
      "The Cloudflare Access token on this request could not be verified.\n",
      403,
      debug(result.reason),
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
