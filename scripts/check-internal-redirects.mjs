#!/usr/bin/env node
/**
 * Internal link auditor — every internal link must resolve to a direct 200.
 *
 * Ahrefs' "Pages with links to redirects" report counts a page as broken when
 * one of its links lands on a 3xx. For INTERNAL links that is entirely
 * self-inflicted: the site controls both ends, so a link to a URL that
 * redirects is just a stale href. This script resolves every internal `href`
 * and `src` against the real filesystem AND the edge middleware, and fails on
 * anything that would not be served directly.
 *
 * `href`/`src` are not the only crawlable URLs on a page. Googlebot also
 * follows absolute URLs in JSON-LD (`url`, `@id`, `item`, …) and reads
 * `<meta content="…">`. Those were unaudited until 2026-08-11 — which is how
 * five `.html` URLs in /comparison/'s ItemList and two `apple-itunes-app`
 * app-arguments sat pointing at 301s while this script reported "all clean",
 * quietly feeding the GSC "Page with redirect" bucket. They are checked here
 * under exactly the same rule.
 *
 * Resolution mirrors Cloudflare Pages' static-asset behaviour:
 *   /foo/      → foo/index.html            (200)
 *   /foo       → foo.html                  (200)
 *   /foo       → foo/index.html            (308 to /foo/ — flagged)
 *   /foo.html  → 301 to /foo               (flagged, middleware rule 2)
 *   missing    → 404                       (flagged)
 *
 * Usage: node scripts/check-internal-redirects.mjs
 * Exit 0 = clean, 1 = findings.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://simplememofast.com";
const require = createRequire(import.meta.url);
const { collectHtmlFiles } = require("./lib/site-files");

const src = readFileSync(path.join(ROOT, "functions/_middleware.js"), "utf8");
const { onRequest } = await import(
  "data:text/javascript," + encodeURIComponent(src)
);

const PASSTHROUGH = Symbol("passthrough");

/** What the edge would do with this path, before static assets are consulted. */
async function edge(urlPath) {
  const res = await onRequest({
    request: new Request(ORIGIN + urlPath),
    next: async () => PASSTHROUGH,
  });
  if (res === PASSTHROUGH) return null;
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    return `${res.status} → ${loc.startsWith(ORIGIN) ? loc.slice(ORIGIN.length) : loc}`;
  }
  return `${res.status}`;
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

/**
 * How Pages would serve this path once the middleware passed it through.
 * Returns null when it is a direct 200, or a description of the problem.
 */
function staticResolve(urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\//, ""));
  const abs = path.join(ROOT, rel);

  if (urlPath.endsWith("/")) {
    return isFile(path.join(abs, "index.html"))
      ? null
      : `404 (no ${path.posix.join(urlPath, "index.html")})`;
  }
  if (isFile(abs)) return null; // asset served as-is
  if (isFile(abs + ".html")) return null; // extension-less page
  if (isDir(abs)) return `308 → ${urlPath}/ (directory needs a trailing slash)`;
  return "404 (no such file)";
}

// Paths deliberately served outside the static tree.
const EDGE_ONLY = new Set(["/verify", "/compose"]);

const findings = [];
const files = collectHtmlFiles(ROOT, {
  skipDirs: ["node_modules", "scripts", "docs", "screenshots", ".git", "admin"],
  skipFiles: [],
});

let linkCount = 0;
const cache = new Map();

// Cloudflare's Email Address Obfuscation rewrites any `mailto:` it finds in
// the HTML into `/cdn-cgi/l/email-protection#<hex>`. Googlebot reads that
// href straight out of the raw markup, follows it, and gets a 404 — which is
// how `/cdn-cgi/l/email-protection` ended up in the GSC "Not found (404)"
// bucket. `<!--email_off-->` is Cloudflare's supported opt-out; without it the
// 404 comes back the moment someone adds a new contact link.
const MAILTO_ANCHOR = /<a[^>]*href="mailto:[^"]*"[^>]*>/g;
const EMAIL_OFF = "<!--email_off-->";

// URL-valued JSON-LD keys Google resolves as links. `sameAs` is excluded on
// purpose — it points off-site by definition.
const JSONLD_URL =
  /"(?:url|@id|item|contentUrl|mainEntityOfPage|target|image|logo|thumbnailUrl)"\s*:\s*"(https:\/\/simplememofast\.com[^"]*)"/g;
const META_CONTENT = /<meta[^>]*\scontent="([^"]*)"/g;
const ABSOLUTE_SELF = /https:\/\/simplememofast\.com[^\s"'<>)\]]*/g;

let metaCount = 0;

for (const file of files) {
  const html = readFileSync(file, "utf8");
  const from = path.relative(ROOT, file);

  for (const m of html.matchAll(MAILTO_ANCHOR)) {
    const before = html.slice(Math.max(0, m.index - EMAIL_OFF.length), m.index);
    if (!before.trimEnd().endsWith(EMAIL_OFF)) {
      findings.push({
        from,
        link: m[0].match(/mailto:[^"]*/)[0],
        problem:
          "404 — bare mailto: is rewritten by Cloudflare into " +
          "/cdn-cgi/l/email-protection; wrap the <a> in <!--email_off-->…<!--/email_off-->",
      });
    }
  }

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    // External, in-page, and non-HTTP schemes are out of scope.
    if (!raw.startsWith("/") || raw.startsWith("//")) continue;

    const [beforeHash] = raw.split("#");
    if (!beforeHash) continue;
    const [pathPart, query] = beforeHash.split("?");
    if (!pathPart) continue;
    linkCount++;

    // Template placeholders such as /blog/?q={search_term_string} are not
    // real links; the middleware strips `q` anyway.
    if (pathPart.includes("{")) continue;
    if (EDGE_ONLY.has(pathPart)) continue;

    const key = query ? `${pathPart}?${query}` : pathPart;
    if (!cache.has(key)) {
      const viaEdge = await edge(key);
      cache.set(key, viaEdge ?? staticResolve(pathPart));
    }
    const problem = cache.get(key);
    if (problem) findings.push({ from, link: raw, problem });
  }

  // Same check for the absolute self-URLs in JSON-LD and <meta content>.
  const absolute = [];
  for (const m of html.matchAll(JSONLD_URL)) absolute.push(m[1]);
  for (const m of html.matchAll(META_CONTENT)) {
    for (const u of m[1].matchAll(ABSOLUTE_SELF)) absolute.push(u[0]);
  }

  for (const raw of absolute) {
    const [beforeHash] = raw.slice(ORIGIN.length).split("#");
    const [pathPart, query] = (beforeHash || "/").split("?");
    if (!pathPart || pathPart.includes("{")) continue;
    metaCount++;
    if (EDGE_ONLY.has(pathPart)) continue;

    const key = query ? `${pathPart}?${query}` : pathPart;
    if (!cache.has(key)) {
      const viaEdge = await edge(key);
      cache.set(key, viaEdge ?? staticResolve(pathPart));
    }
    const problem = cache.get(key);
    if (problem) findings.push({ from, link: raw, problem });
  }
}

if (findings.length) {
  // Group by the broken target: one stale URL usually appears on many pages.
  const byTarget = new Map();
  for (const f of findings) {
    const k = `${f.link}\t${f.problem}`;
    if (!byTarget.has(k)) byTarget.set(k, []);
    byTarget.get(k).push(f.from);
  }
  console.error(
    `\nInternal links: ${findings.length} link(s) across ${byTarget.size} distinct target(s) ` +
      `do not resolve to a direct 200 ` +
      `(${linkCount} href/src + ${metaCount} JSON-LD/meta URLs checked)\n`,
  );
  for (const [k, sources] of [...byTarget].sort((a, b) => b[1].length - a[1].length)) {
    const [link, problem] = k.split("\t");
    console.error(`  ✗ ${link}  ⇒  ${problem}`);
    console.error(
      `      on ${sources.length} page(s): ${sources.slice(0, 5).join(", ")}` +
        (sources.length > 5 ? `, …` : ""),
    );
  }
  process.exit(1);
}
console.log(
  `Internal links: ${linkCount} href/src + ${metaCount} JSON-LD/meta URLs checked, ` +
    `all resolve to a direct 200`,
);
