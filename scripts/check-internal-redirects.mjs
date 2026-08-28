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
 * under exactly the same rule. Sitemap <loc>s and their hreflang alternates
 * joined on 2026-08-20 for the same reason: they were the last crawl source
 * this audit did not read, and the one Google trusts most.
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

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
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
const JSONLD_KEYS = [
  "url", "@id", "item", "contentUrl", "mainEntityOfPage",
  "target", "image", "logo", "thumbnailUrl",
];
const JSONLD_URL = new RegExp(
  `"(${JSONLD_KEYS.join("|")})"\\s*:\\s*"(https://simplememofast\\.com[^"]*)"`,
  "g",
);
const META_CONTENT = /<meta[^>]*\scontent="([^"]*)"/g;
const ABSOLUTE_SELF = /https:\/\/simplememofast\.com[^\s"'<>)\]]*/g;
const HREF_SRC = /(?:href|src)="([^"]+)"/g;
const SITEMAP_LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
const SITEMAP_ALT = /<xhtml:link[^>]*\shref="([^"]+)"/g;

let metaCount = 0;

// ── 抽出器 ───────────────────────────────────────────────────────────
// **純関数にして、種別ごとに数えられるようにしてある。**理由は下の
// EXTRACTION_FLOORS を読むこと。

export function extractHrefs(html) {
  return [...html.matchAll(HREF_SRC)].map((m) => ({ kind: "href/src", url: m[1] }));
}

export function extractAbsolute(html) {
  const out = [];
  for (const m of html.matchAll(JSONLD_URL)) out.push({ kind: `JSON-LD ${m[1]}`, url: m[2] });
  for (const m of html.matchAll(META_CONTENT)) {
    for (const u of m[1].matchAll(ABSOLUTE_SELF)) out.push({ kind: "meta content", url: u[0] });
  }
  return out;
}

export function extractSitemapUrls(xml) {
  const out = [];
  for (const m of xml.matchAll(SITEMAP_LOC)) out.push({ kind: "sitemap <loc>", url: m[1] });
  for (const m of xml.matchAll(SITEMAP_ALT)) out.push({ kind: "sitemap hreflang", url: m[1] });
  return out;
}

/** `<!--email_off-->` で包まれていない mailto:。Cloudflare が 404 になるURLへ書き換える。 */
export function bareMailtos(html) {
  const out = [];
  for (const m of html.matchAll(MAILTO_ANCHOR)) {
    const before = html.slice(Math.max(0, m.index - EMAIL_OFF.length), m.index);
    if (!before.trimEnd().endsWith(EMAIL_OFF)) out.push(m[0].match(/mailto:[^"]*/)[0]);
  }
  return out;
}

/**
 * 拾えた件数の下限。
 *
 * **抽出が止まっても、この検査は「全部きれい」と報告する。**0件のURLからは
 * 0件の指摘しか出ないからで、実際に2度そうなっている——
 * 2026-08-11 は JSON-LD と meta を、08-20 は sitemap を読んでいなかった。
 * 前者では /comparison/ の ItemList にある .html 5本と apple-itunes-app 2本が
 * 301 を指したまま出荷され、GSC の「リダイレクトのあるページ」へ流れ込んだ。
 * そのあいだ、この検査の出力はずっと "all clean" だった。
 *
 * 正規表現が1つ壊れれば同じ状態に戻る。**だから0件は「きれい」ではなく失格。**
 * 下限は 2026-08-26 の実測のおおよそ4割。ページの増減では鳴らず、
 * 抽出の停止・一部欠落では鳴る幅にしてある。
 *
 * **下限を下げて通さないこと。**下げた瞬間、この検査は「見ていない」に戻る。
 */
export const EXTRACTION_FLOORS = [
  // [種別, 下限, 2026-08-26 の実測]
  ["href/src", 6000, 16627],
  ["JSON-LD @id", 700, 1662],
  ["JSON-LD url", 600, 1485],
  ["meta content", 400, 1043],
  ["JSON-LD item", 280, 697],
  ["JSON-LD image", 150, 378],
  ["sitemap hreflang", 130, 326],
  ["sitemap <loc>", 100, 262],
];

/**
 * 下限を置かない種別。**「見ていない」のではなく「実測が一桁で、0を異常と
 * 断定できない」。**使われ方が増えたら下限つきへ移すこと。
 */
export const UNFLOORED = [
  ["JSON-LD mainEntityOfPage", 10],
  ["JSON-LD contentUrl", 6],
  ["JSON-LD target", 0],
  ["JSON-LD logo", 0],
  ["JSON-LD thumbnailUrl", 0],
];

/** 実際に拾えた数を下限に当てる。**純関数**なので、0件で落ちることを確かめられる。 */
export function floorFindings(census) {
  const out = [];
  for (const [kind, floor, measured] of EXTRACTION_FLOORS) {
    const got = census.get(kind) ?? 0;
    if (got < floor) {
      out.push({
        from: "(抽出)",
        link: kind,
        problem: `${got} 件しか拾えていない（下限 ${floor} / 2026-08-26 の実測 ${measured}）`
          + ` — **抽出が止まると 0 件の指摘しか出ず、「全部きれい」と報告される**`,
      });
    }
  }
  return out;
}

const census = new Map();
const tally = (items) => {
  for (const it of items) census.set(it.kind, (census.get(it.kind) ?? 0) + 1);
  return items;
};

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
if (process.argv.includes("--selftest")) {
  const SCENARIOS = [
    ["**抽出が0件なら落ちる**（2026-08-11 と 08-20 に実際に起きた形）", () => {
      const bad = floorFindings(new Map());
      if (bad.length !== EXTRACTION_FLOORS.length) {
        throw new Error(`空の集計で ${bad.length} 件しか出ない（**この下限は効いていない**）`);
      }
    }],
    ["**種別が1つだけ欠けても落ちる**（正規表現の一部欠落）", () => {
      const full = new Map(EXTRACTION_FLOORS.map(([k, , m]) => [k, m]));
      full.set("JSON-LD @id", 0);
      const bad = floorFindings(full);
      if (bad.length !== 1) throw new Error(`${bad.length} 件（1件のはず）`);
      if (bad[0].link !== "JSON-LD @id") throw new Error(bad[0].link);
    }],
    ["実測どおりなら下限は鳴らない（常に鳴る検査も何も見ていない）", () => {
      const full = new Map(EXTRACTION_FLOORS.map(([k, , m]) => [k, m]));
      const bad = floorFindings(full);
      if (bad.length) throw new Error(bad.map((b) => b.link).join(" / "));
    }],
    ["href / src を拾う", () => {
      const got = extractHrefs('<a href="/faq">x</a><img src="/a.png">').map((x) => x.url);
      if (got.length !== 2 || got[0] !== "/faq") throw new Error(JSON.stringify(got));
    }],
    ["**JSON-LD の url / @id / item を拾う**（2026-08-11 まで見ていなかった側）", () => {
      const html = '{"@id":"https://simplememofast.com/a","url":"https://simplememofast.com/b",'
        + '"item":"https://simplememofast.com/c"}';
      const kinds = extractAbsolute(html).map((x) => x.kind);
      for (const k of ["JSON-LD @id", "JSON-LD url", "JSON-LD item"]) {
        if (!kinds.includes(k)) throw new Error(`${k} を拾わない`);
      }
    }],
    ["**sameAs は拾わない**（定義上サイト外を指す）", () => {
      const html = '{"sameAs":"https://simplememofast.com/x"}';
      if (extractAbsolute(html).some((x) => x.kind.startsWith("JSON-LD"))) {
        throw new Error("sameAs を内部リンクとして拾った");
      }
    }],
    ["meta content の中の絶対URLを拾う", () => {
      const got = extractAbsolute('<meta name="x" content="https://simplememofast.com/y">');
      if (!got.some((x) => x.kind === "meta content" && x.url.endsWith("/y"))) {
        throw new Error(JSON.stringify(got));
      }
    }],
    ["**sitemap の <loc> と hreflang を拾う**（08-20 まで読んでいなかった側）", () => {
      const xml = "<loc>https://simplememofast.com/a</loc>"
        + '<xhtml:link rel="alternate" hreflang="en" href="https://simplememofast.com/en/a"/>';
      const kinds = extractSitemapUrls(xml).map((x) => x.kind);
      if (!kinds.includes("sitemap <loc>")) throw new Error("<loc> を拾わない");
      if (!kinds.includes("sitemap hreflang")) throw new Error("hreflang を拾わない");
    }],
    ["**包まれていない mailto: は指摘する**（Cloudflare が404のURLへ書き換える）", () => {
      if (!bareMailtos('<a href="mailto:a@b.c">x</a>').length) throw new Error("素の mailto を見逃した");
      if (bareMailtos('<!--email_off--><a href="mailto:a@b.c">x</a>').length) {
        throw new Error("包んであるのに指摘した");
      }
    }],
    ["staticResolve: 拡張子なしページは直に200", () => {
      if (staticResolve("/faq") !== null) throw new Error(staticResolve("/faq"));
    }],
    ["**staticResolve: 末尾スラッシュ無しのディレクトリは308**", () => {
      const r = staticResolve("/vs/notion");
      if (!r || !r.startsWith("308")) throw new Error(`${r}`);
    }],
    ["staticResolve: 無いものは404", () => {
      if (!/^404/.test(staticResolve("/そんなページは無い"))) throw new Error("404にならない");
    }],
  ];
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

for (const file of files) {
  const html = readFileSync(file, "utf8");
  const from = path.relative(ROOT, file);

  for (const link of bareMailtos(html)) {
    findings.push({
      from,
      link,
      problem:
        "404 — bare mailto: is rewritten by Cloudflare into " +
        "/cdn-cgi/l/email-protection; wrap the <a> in <!--email_off-->…<!--/email_off-->",
    });
  }

  for (const { url: raw } of tally(extractHrefs(html))) {
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
  for (const { url: raw } of tally(extractAbsolute(html))) {
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

// Sitemaps are the crawl source Google trusts most, and until 2026-08-20 the
// one this audit did not read: href/src and JSON-LD/meta are covered above,
// but a redirecting or dead <loc> would have shipped silently — straight into
// the GSC "Page with redirect" bucket from the highest-authority source there
// is. Every <loc> and every hreflang alternate in sitemap*.xml must sit on
// the canonical origin and resolve to a direct 200, same rule as everything
// else here.
let sitemapCount = 0;
const sitemapFiles = readdirSync(ROOT).filter((f) => /^sitemap[\w-]*\.xml$/.test(f));
for (const file of sitemapFiles) {
  const xml = readFileSync(path.join(ROOT, file), "utf8");

  for (const { url: raw } of tally(extractSitemapUrls(xml))) {
    sitemapCount++;
    if (raw !== ORIGIN && !raw.startsWith(ORIGIN + "/")) {
      findings.push({
        from: file,
        link: raw,
        problem: `not on the canonical origin ${ORIGIN} (www/http/foreign hosts redirect)`,
      });
      continue;
    }
    const [beforeHash] = raw.slice(ORIGIN.length).split("#");
    const [pathPart, query] = (beforeHash || "/").split("?");
    if (EDGE_ONLY.has(pathPart)) continue;

    const key = query ? `${pathPart}?${query}` : pathPart || "/";
    if (!cache.has(key)) {
      const viaEdge = await edge(key);
      cache.set(key, viaEdge ?? staticResolve(pathPart || "/"));
    }
    const problem = cache.get(key);
    if (problem) findings.push({ from: file, link: raw, problem });
  }
}

findings.push(...floorFindings(census));

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
      `(${linkCount} href/src + ${metaCount} JSON-LD/meta + ${sitemapCount} sitemap URLs checked)\n`,
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
  `Internal links: ${linkCount} href/src + ${metaCount} JSON-LD/meta + ` +
    `${sitemapCount} sitemap URLs checked, all resolve to a direct 200`,
);
console.log("\n  拾えた数（下限つき）:");
for (const [kind, floor] of EXTRACTION_FLOORS) {
  console.log(`    ${String(census.get(kind) ?? 0).padStart(6)}  ${kind}（下限 ${floor}）`);
}
console.log("  下限を置かない種別（実測が一桁で、0 を異常と断定できない）:");
for (const [kind] of UNFLOORED) {
  console.log(`    ${String(census.get(kind) ?? 0).padStart(6)}  ${kind}`);
}
}
