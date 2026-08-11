#!/usr/bin/env node
/**
 * Behavioural tests for functions/_middleware.js — the edge URL normalizer.
 *
 * Every case here is a URL shape Google Search Console actually reported for
 * simplememofast.com. The GSC "Page with redirect" / "Alternate page with
 * proper canonical tag" buckets are fed by two things: variants that resolve
 * with 200 (true duplicates) and variants that take more than one hop (GSC
 * counts every intermediate URL separately). So the assertions are not just
 * "does it redirect" but:
 *
 *   1. the right status (301 / 410 / 404 / pass-through),
 *   2. the right destination, and
 *   3. ONE HOP — feeding any 301 destination back through the middleware must
 *      produce no further redirect.
 *
 * Usage: node scripts/check-url-normalization.mjs
 * Exit 0 = all pass, 1 = failures.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://simplememofast.com";

// The middleware is plain ESM but the repo has no package.json (`"type":
// "module"`), so a bare import of a .js file would be parsed as CommonJS.
// Load it through a data: URL instead, which is always module-scoped.
const src = readFileSync(path.join(ROOT, "functions/_middleware.js"), "utf8");
const { onRequest } = await import(
  "data:text/javascript," + encodeURIComponent(src)
);

const PASSTHROUGH = Symbol("passthrough");

async function run(urlPath) {
  const res = await onRequest({
    request: new Request(ORIGIN + urlPath),
    next: async () => PASSTHROUGH,
  });
  if (res === PASSTHROUGH) return { kind: "pass" };
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    return {
      kind: "redirect",
      status: res.status,
      to: loc.startsWith(ORIGIN) ? loc.slice(ORIGIN.length) : loc,
    };
  }
  return { kind: "status", status: res.status };
}

const failures = [];
let checked = 0;

function fail(msg) {
  failures.push(msg);
}

/** Assert a single 301 to `to`, and that `to` is itself terminal. */
async function redirects(from, to) {
  checked++;
  const r = await run(from);
  if (r.kind !== "redirect") {
    return fail(`${from} → expected 301 to ${to}, got ${JSON.stringify(r)}`);
  }
  if (r.status !== 301) {
    return fail(`${from} → expected status 301, got ${r.status}`);
  }
  if (r.to !== to) {
    return fail(`${from} → expected ${to}, got ${r.to}`);
  }
  const second = await run(r.to);
  if (second.kind === "redirect") {
    fail(
      `${from} → ${r.to} is NOT one hop: destination redirects again to ${second.to}`,
    );
  }
}

async function gone(urlPath) {
  checked++;
  const r = await run(urlPath);
  if (r.kind !== "status" || r.status !== 410) {
    fail(`${urlPath} → expected 410 Gone, got ${JSON.stringify(r)}`);
  }
}

async function notFound(urlPath) {
  checked++;
  const r = await run(urlPath);
  if (r.kind !== "status" || r.status !== 404) {
    fail(`${urlPath} → expected 404, got ${JSON.stringify(r)}`);
  }
}

async function servesDirectly(urlPath) {
  checked++;
  const r = await run(urlPath);
  if (r.kind !== "pass") {
    fail(`${urlPath} → expected pass-through (200), got ${JSON.stringify(r)}`);
  }
}

// ── 1. Duplicate slashes ─────────────────────────────────────────────────
// GSC 2026-08-05, "Alternate page with proper canonical tag" (5 of 7 rows).
// Pages resolves these to 200, so the canonical tag was the only thing
// holding them out of the index.
await redirects("/en/vs/note-to-self-mail//", "/en/vs/note-to-self-mail/");
await redirects("/en/vs/notion//", "/en/vs/notion/");
await redirects("/en/vs/obsidian//", "/en/vs/obsidian/");
await redirects("/en/vs/apple-notes//", "/en/vs/apple-notes/");
await redirects("/en/vs/evernote//", "/en/vs/evernote/");
await redirects("/blog///instant-capture-workflow", "/blog/instant-capture-workflow");
await redirects("//", "/");

// ── 2. .html variants, now site-wide ─────────────────────────────────────
// GSC 2026-08-05, "Page with redirect" — 30+ rows are bare `.html` variants.
await redirects("/blog/meeting-memo-template.html", "/blog/meeting-memo-template");
await redirects("/blog/email-yourself-memo.html", "/blog/email-yourself-memo");
await redirects("/blog/second-brain-capture-first.html", "/blog/second-brain-capture-first");
await redirects("/devlog/day1.html", "/devlog/day1");
await redirects("/faq.html", "/faq");
await redirects("/contact.html", "/contact");
await redirects("/legal.html", "/legal");
await redirects("/en/faq.html", "/en/faq");
await redirects("/en/blog/best-memo-apps-2026.html", "/en/blog/best-memo-apps-2026");
// index.html must fold to the directory form, never to `/…/index`.
await redirects("/index.html", "/");
await redirects("/en/index.html", "/en/");
await redirects("/vs/notion/index.html", "/vs/notion/");
await redirects("/glossary/pkm/index.html", "/glossary/pkm/");
// Pages' own error document keeps its extension.
await servesDirectly("/404.html");

// ── 3. ?lang= — never a real parameter on this site ──────────────────────
await redirects("/?lang=en", "/");
await redirects("/?lang=ja", "/");
await redirects("/vs/ticktick/?lang=en", "/vs/ticktick/");
await redirects("/guides/?lang=ja", "/guides/");
await redirects("/blog/fastest-memo-app-benchmark?lang=en", "/blog/fastest-memo-app-benchmark");
// The combination that used to cost three hops.
await redirects("/blog/line-keep-alternative.html?lang=ja", "/blog/line-keep-alternative");
await redirects("/blog/iphone-memo-tips.html?lang=ja", "/blog/iphone-memo-tips");

// ── 4. Referral / attribution params ─────────────────────────────────────
await redirects("/?ref=launches.uicomet.com", "/");
await redirects("/?ref=producthunt", "/");
await redirects("/blog/?q=%7Bsearch_term_string%7D", "/blog/");
// utm_* must survive: GA4 reads them off the landing URL.
await redirects(
  "/?from=AppAgg.com&utm_campaign=AppAgg.com&utm_medium=referral&utm_source=AppAgg.com",
  "/?utm_campaign=AppAgg.com&utm_medium=referral&utm_source=AppAgg.com",
);
await servesDirectly("/?utm_source=newsletter&utm_medium=email");
await servesDirectly("/?gclid=abc123");

// ── 5. Retired paths — one hop from every variant ────────────────────────
await redirects("/blog/captio-alternatives-comparison", "/captio-alternative/");
await redirects("/blog/captio-alternatives-comparison.html", "/captio-alternative/");
await redirects("/blog/captio-alternatives-comparison?lang=ja", "/captio-alternative/");
await redirects("/blog/captio-alternatives-comparison.html?lang=ja", "/captio-alternative/");
await redirects("/blog/memo-shuukan-tips", "/blog/memo-habit");
await redirects("/blog/memo-shuukan-tips.html", "/blog/memo-habit");
await redirects("/en/blog/why-captio-died", "/en/captio-alternative/");
await redirects("/en/blog/why-captio-died.html", "/en/captio-alternative/");
await redirects("/blog/memo-app-free-guide", "/blog/free-memo-apps-ranking");
await redirects("/blog/memo-app-free-guide.html", "/blog/free-memo-apps-ranking");
await redirects("/blog/memo-app-free-guide?lang=ja", "/blog/free-memo-apps-ranking");
await redirects("/devlog/captio-alternative", "/captio-alternative/");
await redirects("/devlog/captio-alternative.html", "/captio-alternative/");
await redirects("/devlog/captio-alternative?lang=en", "/captio-alternative/");
await redirects("/blog/line-keep-migration", "/blog/line-keep-alternative");
await redirects("/blog/line-keep-migration.html", "/blog/line-keep-alternative");
await redirects("/blog/line-keep-migration.html?lang=ja", "/blog/line-keep-alternative");
await redirects("/vs/mem/", "/vs/");
await redirects("/vs/mem/index.html", "/vs/");
await redirects("/vs/mem/?lang=en", "/vs/");
await redirects("/privacy-policy", "/privacy");
await redirects("/privacy-policy/", "/privacy");
await redirects("/vs/whatsapp/", "/vs/");
await redirects("/vs/telegram/", "/vs/");
await redirects("/vs/trello/", "/vs/");
await redirects("/vs/slack-self-dm/", "/vs/");
await redirects("/vs/telegram/?lang=ja", "/vs/");

// The stray-paren backlink, in both the raw and percent-encoded spellings.
// `_redirects` has always caught the bare form, but only as a SECOND hop
// after this middleware passed it through — so the `?lang=` variants cost
// two 301s until the rule was mirrored into RETIRED.
await redirects("/)", "/");
await redirects("/%29", "/");
await redirects("/)?lang=ja", "/");
await redirects("/%29?lang=ja", "/");

// ── 6. 410 Gone — fabricated slugs from injected backlinks ───────────────
for (const slug of [
  "/blog/offline-first-outbox-teardown",
  "/blog/email-inbox-as-task-manager",
  "/blog/energy-budget-field-notes",
  "/blog/ios-cold-start-1-4s-to-287ms",
  "/blog/i-was-wrong-about-todo-debt",
  "/blog/no-third-party-deps-ios-18-months",
]) {
  await gone(slug);
  await gone(slug + ".html");
  await gone(slug + "?lang=ja");
}

// ── 7. Internal-only paths stay unreachable, extra slashes and all ───────
await notFound("/docs/seo/FULL-AUDIT-REPORT-2026-07-07.md");
await notFound("//docs//seo/FULL-AUDIT-REPORT-2026-07-07.md");
await notFound("/scripts/seo-check.js");
await notFound("/tools/");
await notFound("/CLAUDE.md");
// growth/ carries committed GSC snapshots and App Store exports. Pages deploys
// every tracked file, so without the block these are click, impression and
// revenue figures sitting at a guessable URL.
await notFound("/growth/data/gsc/2026-08-09/queries.json");
await notFound("//growth//experiments/experiments.json");
await notFound("/growth/");

// ── 8. /admin/* keeps its Cloudflare Access auth chain ───────────────────
await servesDirectly("/admin/");
await servesDirectly("/admin/api/upload");
// …but a slash-padded variant is normalized first, then re-enters as /admin/.
await redirects("//admin/api/upload", "/admin/api/upload");

// ── 9. Canonical URLs must never redirect ────────────────────────────────
for (const p of [
  "/",
  "/en/",
  "/faq",
  "/blog/instant-capture-workflow",
  "/vs/notion/",
  "/glossary/pkm/",
  "/siri/",
  "/devlog/day1",
]) {
  await servesDirectly(p);
}

// ── 10. Structural invariant behind the site-wide .html strip ────────────
// Stripping `.html` is only unambiguous while no `X.html` has a sibling
// directory `X/`. Assert that here so a future page can't silently break it.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === ".git" || entry === "node_modules" || entry === "docs") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".html") && entry !== "index.html") out.push(full);
  }
  return out;
}
for (const file of walk(ROOT)) {
  checked++;
  const twin = file.slice(0, -".html".length);
  if (existsSync(twin) && statSync(twin).isDirectory()) {
    fail(
      `ambiguous path: ${path.relative(ROOT, file)} and ${path.relative(ROOT, twin)}/ ` +
        `both exist, so stripping .html is undefined`,
    );
  }
}

// ── Report ───────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`\nURL normalization: ${failures.length} FAILED of ${checked} checks\n`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`URL normalization: ${checked} checks passed`);
