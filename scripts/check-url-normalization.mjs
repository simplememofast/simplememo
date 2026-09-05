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
import { loadEdgeMiddleware, edgeResult } from "./lib/edge-middleware.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://simplememofast.com";

// data: URL 経由でロードする理由は lib/edge-middleware.mjs 参照
// （package.json が無いので .js の bare import は CJS 扱いになる）。
const onRequest = await loadEdgeMiddleware(ROOT);

async function run(urlPath) {
  // Accept either a path (checked against the canonical origin) or an
  // absolute URL (for host-normalization cases, e.g. the www host).
  const absolute = urlPath.startsWith("https://") ? urlPath : ORIGIN + urlPath;
  return edgeResult(onRequest, absolute, ORIGIN);
}

const failures = [];
let checked = 0;

function fail(msg) {
  failures.push(msg);
}

/** Assert a single 301 to `to`, and that `to` is itself terminal. */
async function redirects(from, to, { checkStaticDestination = true } = {}) {
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
  } else if (second.kind !== "pass") {
    fail(`${from} → ${r.to} is NOT a live destination: ${JSON.stringify(second)}`);
  } else if (checkStaticDestination) {
    // Middleware pass-through is not a 200: Pages may still redirect a
    // directory without a trailing slash, or return 404 for a missing file.
    const pathname = new URL(r.to, ORIGIN).pathname;
    const file = path.join(ROOT, decodeURIComponent(pathname));
    const target = pathname.endsWith("/") ? path.join(file, "index.html") : file + ".html";
    if (!existsSync(target) || !statSync(target).isFile()) {
      fail(`${from} → ${r.to} has no directly served HTML destination`);
    }
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

// ── 自己テスト（**この検査が落ちることを確かめる**） ─────────────────
//
// 本体は本番の middleware をそのまま走らせているので、「middleware が正しいか」は
// 見ている。だが **判定そのものが効いているか**は別で、helper が黙って何も
// 見ていなければ全部緑になる —— check-pr-facts で実際に踏んだ形（行ごとの走査
// だったので、折り返された文には規則が一度も当たらなかった）。
//
// そこで**わざと逆の期待を当てて、失敗が増えることを確かめる。**
// 期待どおりのときに増えないことも同時に見る（片方だけでは足りない。
// 常に落ちる検査も、常に通る検査と同じく何も見ていない）。
if (process.argv.includes("--selftest")) {
  const policy = JSON.parse(
    readFileSync(path.join(ROOT, "data/publication-policy.json"), "utf8"),
  );
  const entries = Object.entries(policy.files);
  const servedName = entries.find(([, v]) => v.served_by_site)?.[0];
  const blockedName = entries.find(([, v]) => !v.served_by_site)?.[0];
  if (!servedName || !blockedName) {
    console.error(
      "自己テストの前提が崩れている: 配信・遮断の両方が publication-policy に要る",
    );
    process.exit(1);
  }
  const served = `/data/${servedName}`;
  const blocked = `/data/${blockedName}`;

  let bad = 0;
  const expect = async (name, fn, shouldFail) => {
    failures.length = 0;
    await fn();
    const failed = failures.length > 0;
    if (failed !== shouldFail) {
      bad += 1;
      const why = shouldFail
        ? "落ちるべきなのに落ちなかった（**この判定は何も見ていない**）"
        : `落ちてはいけないのに落ちた: ${failures[0]}`;
      console.log(`  FAIL ${name}\n       ${why}`);
    } else {
      console.log(`  ok   ${name}`);
    }
    failures.length = 0;
  };

  await expect(`配信するものは通る（${served}）`, () => servesDirectly(served), false);
  await expect(`**配信するものを404扱いすると落ちる**（${served}）`, () => notFound(served), true);
  await expect(`遮断するものは404（${blocked}）`, () => notFound(blocked), false);
  await expect(`**遮断するものを配信扱いすると落ちる**（${blocked}）`, () => servesDirectly(blocked), true);
  await expect("正しい行き先の 301 は通る（/faq.html → /faq）", () => redirects("/faq.html", "/faq"), false);
  await expect("**行き先が違う 301 は落ちる**（301 が出たことだけで通さない）", () => redirects("/faq.html", "/そんなページは無い"), true);
  await expect("**410 でないものを gone 扱いすると落ちる**", () => gone(served), true);
  await expect("**存在しない転送先は落ちる**", () => redirects("/__normalization-test-missing.html", "/__normalization-test-missing"), true);
  await expect("**Pages で再転送されるディレクトリは落ちる**", () => redirects("/en?lang=ja", "/en"), true);

  console.log(`\n  自己テスト 9 件中 ${bad} 件失敗`);
  process.exit(bad === 0 ? 0 : 1);
}

// ── 0. Host: www → apex, folded into the same single 301 ─────────────────
// GSC 2026-08-17 "Page with redirect" carries http://www.simplememofast.com/.
// The http→https upgrade is the edge's own 301 (Always Use HTTPS, before
// anything in this repo); what this middleware owns is that NOTHING after it
// adds a second hop — a www URL that also needs a path or query fix must not
// mint an intermediate `https://www…/fixed-path` URL for GSC to count.
await redirects("https://www.simplememofast.com/", "/");
await redirects("https://www.simplememofast.com/blog/meeting-memo-template.html", "/blog/meeting-memo-template");
// Host + .html + ?lang= + retirement, all in ONE 301.
await redirects(
  "https://www.simplememofast.com/blog/captio-discontinued.html?lang=ja",
  "/blog/captio-discontinued",
);
await redirects("https://www.simplememofast.com/vs/trello/?lang=en", "/vs/");
// A www URL that needs no other fix still leaves via one hop (here the
// middleware's own 301; _redirects remains the fallback if Functions fail).
await redirects("https://www.simplememofast.com/vs/notion/", "/vs/notion/");
// /admin/* keeps its Cloudflare Access auth chain even on the www host;
// _redirects moves it to the apex after auth.
await servesDirectly("https://www.simplememofast.com/admin/");
// Preview/other hosts are untouched — the match is exact, not a suffix.
await servesDirectly("https://claude-branch.simplememo.pages.dev/vs/notion/");

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
// _redirects already has /vs/mem. Without the same middleware entry,
// stripping a query or .html first minted /vs/mem as an intermediate URL.
await redirects("/vs/mem", "/vs/");
await redirects("/vs/mem?lang=en", "/vs/");
await redirects("/vs/mem.html?lang=en", "/vs/");
await redirects("https://www.simplememofast.com/vs/mem?lang=en&utm_source=newsletter", "/vs/?utm_source=newsletter");
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

// data/*.json のうち「配信しない」と決めたもの。
//
// [2026-08-26] **2026-08-25 にこれを _redirects へ書いたが、一度も効いていなかった。**
// Cloudflare Pages は実在する静的ファイルを優先し、そのパスの _redirects を無視する。
// 本番での対照実験:
//
//   /privacy-policy               → 301  （ファイルが無い → _redirects が効く）
//   /data/credential-expiry.json  → 200  （ファイルが在る → 無視される）
//   /growth/experiments/...json   → 404  （middleware は効く）
//
// **設定に書いてあることを確かめる検査は、効くことを確かめない。**
// ここは middleware を実際に走らせて status を見るので、効果を確かめている。
// 一覧は data/publication-policy.json から読む（テストが方針とずれない）。
{
  const policy = JSON.parse(
    readFileSync(path.join(ROOT, "data/publication-policy.json"), "utf8"),
  );
  const entries = Object.entries(policy.files);
  const unserved = entries.filter(([, v]) => !v.served_by_site).map(([f]) => f);
  const served = entries.filter(([, v]) => v.served_by_site).map(([f]) => f);
  if (unserved.length === 0) fail("publication-policy に「配信しない」が1件も無い");
  if (served.length === 0) fail("publication-policy に「配信する」が1件も無い");
  for (const f of unserved) await notFound(`/data/${f}`);
  // **配信すると決めたものは通す。**全部404にして「守った」ことにしない。
  for (const f of served) {
    checked++;
    const r = await run(`/data/${f}`);
    if (r.kind !== "pass") {
      fail(`/data/${f} は配信する分類なのに middleware が止めた（${JSON.stringify(r)}）`);
    }
  }
}

// ── 8. /admin/* keeps its Cloudflare Access auth chain ───────────────────
await servesDirectly("/admin/");
await servesDirectly("/admin/api/upload");
// …but a slash-padded variant is normalized first, then re-enters as /admin/.
// This is an authenticated Function endpoint, not a static HTML page.
await redirects("//admin/api/upload", "/admin/api/upload", { checkStaticDestination: false });

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
