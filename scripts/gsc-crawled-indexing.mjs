#!/usr/bin/env node
// Owner's 2026-09-16 GSC sample: serving policy, not Google's indexing verdict.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://simplememofast.com";
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const { cases } = JSON.parse(read("docs/seo/gsc-crawled-cases-2026-09-16.json"));
const clean = (html) => html.replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i"));
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").replace(/&amp;/g, "&");
};
const noindex = (value) => /(?:^|[\s,:])(?:noindex|none)(?:[\s,]|$)/i.test(value || "");
const htmlFile = (urlPath) => urlPath.slice(1) + (urlPath.endsWith("/") ? "index.html" : ".html");

function checkHtml(html, urlPath) {
  const document = clean(html);
  const head = document.split(/<\/head\s*>/i)[0];
  const canonical = [...head.matchAll(/<link\b[^>]*>/gi)]
    .filter(([tag]) => attr(tag, "rel").toLowerCase().split(/\s+/).includes("canonical"))
    .map(([tag]) => attr(tag, "href"));
  assert.deepEqual(canonical, [ORIGIN + urlPath], `${urlPath}: one self-canonical in the real head is required`);
  for (const [tag] of document.matchAll(/<meta\b[^>]*>/gi)) {
    if (/^(robots|googlebot)$/i.test(attr(tag, "name"))) {
      assert(!noindex(attr(tag, "content")), `${urlPath}: HTML is noindex`);
    }
  }
}

function configuredRobots(headers, urlPath) {
  let matches = false;
  const values = [];
  for (const line of headers.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      matches = new RegExp(`^${pattern}$`).test(urlPath);
    } else if (matches && /^\s+X-Robots-Tag\s*:/i.test(line)) {
      values.push(line.slice(line.indexOf(":") + 1).trim());
    }
  }
  return values.join(", ");
}

// Only the applicable Googlebot group, otherwise *, governs these checks.
function robotsAllows(text, urlPath) {
  const groups = [];
  let agents = [], rules = [];
  const flush = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).toLowerCase(), value = line.slice(i + 1).trim();
    if (key === "user-agent") { if (rules.length) flush(); agents.push(value.toLowerCase()); }
    else if ((key === "allow" || key === "disallow") && value && agents.length) rules.push({ key, value });
  }
  flush();
  const specific = groups.filter(g => g.agents.includes("googlebot"));
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes("*"));
  const matched = applicable.flatMap(g => g.rules).filter(({ value }) => {
    const end = value.endsWith("$");
    const pattern = (end ? value.slice(0, -1) : value).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + pattern + (end ? "$" : "")).test(urlPath);
  }).sort((a, b) => b.value.length - a.value.length || (a.key === "allow" ? -1 : 1));
  return matched.length === 0 || matched[0].key === "allow";
}

function selftest() {
  const valid = `<head><link href='${ORIGIN}/press/' rel='canonical'></head><body>Press</body>`;
  checkHtml(valid, "/press/");
  assert.throws(() => checkHtml(valid.replace("/press/", "/wrong/"), "/press/"));
  assert.throws(() => checkHtml(valid.replace("</head>", '<meta content="noindex" name="robots"></head>'), "/press/"));
  assert.throws(() => checkHtml(valid.replace("</body>", '<meta content="none" name="googlebot"></body>'), "/press/"));
  assert.throws(() => checkHtml(`<head><!--${valid}--></head>`, "/press/"));
  assert.throws(() => checkHtml(`<head><script>${valid}</script></head>`, "/press/"));
  assert.throws(() => checkHtml(valid.replace("</head>", `<link rel="canonical" href="${ORIGIN}/press/"></head>`), "/press/"));
  const config = '/*\n  Cache-Control: public, no-cache\n/data/*.json\n  X-Robots-Tag: noindex\n';
  assert(noindex(configuredRobots(config, "/data/autopilot-runs.json")));
  assert(!noindex(configuredRobots(config, "/press/")));
  assert(!noindex(configuredRobots(config, "/data/x.json.html")));
  assert(!noindex(configuredRobots(config.replace("noindex", "index"), "/data/x.json")));
  assert(robotsAllows("User-agent: *\nAllow: /\nUser-agent: CCBot\nDisallow: /", "/data/x.json"));
  assert(!robotsAllows("User-agent: *\nDisallow: /data/", "/data/x.json"));
  assert(robotsAllows("User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /data/", "/data/x.json"));
  console.log("GSC indexing detector self-tests passed (positive and deliberate failure cases)");
}

async function sourceAudit() {
  const { loadEdgeMiddleware, edgeResult } = await import("./lib/edge-middleware.mjs");
  const middleware = await loadEdgeMiddleware(ROOT);
  const sitemap = read("sitemap-ja.xml"), headers = read("_headers"), robots = read("robots.txt");
  const policy = JSON.parse(read("data/publication-policy.json"));
  const targets = new Set();
  for (const c of cases) {
    const result = await edgeResult(middleware, ORIGIN + c.from, ORIGIN);
    assert.deepEqual(result, c.kind === "redirect" ? { kind: "redirect", status: 301, to: c.to } : { kind: "pass" }, c.from);
    assert(robotsAllows(robots, c.from), `${c.from}: Google must be able to fetch the redirect/noindex/canonical`);
    if (c.kind === "data") {
      assert.equal(policy.files[c.from.slice("/data/".length)]?.served_by_site, true, `${c.from}: preserve publication policy`);
      JSON.parse(read(c.from.slice(1)));
      assert(noindex(configuredRobots(headers, c.from)), `${c.from}: missing noindex response rule`);
      assert(!sitemap.includes(`<loc>${ORIGIN}${c.from}</loc>`), `${c.from}: JSON must not be in sitemap`);
    } else targets.add(c.to);
  }
  for (const target of targets) {
    assert.deepEqual(await edgeResult(middleware, ORIGIN + target, ORIGIN), { kind: "pass" }, `${target}: second redirect`);
    checkHtml(read(htmlFile(target)), target);
    assert(!noindex(configuredRobots(headers, target)), `${target}: noindex response rule covers HTML`);
    assert(sitemap.includes(`<loc>${ORIGIN}${target}</loc>`), `${target}: absent from sitemap`);
    assert(robotsAllows(robots, target), `${target}: canonical blocked in robots.txt`);
  }
  // The user's pasted Markdown truncated a search-template link. All plausible
  // literal spellings must fold to the same blog index, without a second hop.
  for (const q of ["{search_term_string", "{search_term_string)"]) {
    assert.deepEqual(await edgeResult(middleware, ORIGIN + "/blog/?q=" + q, ORIGIN), { kind: "redirect", status: 301, to: "/blog/" });
  }
  const inbound = new Map(cases.filter(c => c.kind === "html").map(c => [c.to, new Set()]));
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["node_modules", "docs", "scripts", "tools", "growth", "fixtures", "admin", "data"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".html")) {
        const source = "/" + path.relative(ROOT, full).split(path.sep).join("/").replace(/index\.html$/, "").replace(/\.html$/, "");
        for (const [tag] of clean(readFileSync(full, "utf8")).matchAll(/<a\b[^>]*>/gi)) {
          try {
            const target = new URL(attr(tag, "href"), ORIGIN + source);
            if (target.origin === ORIGIN && !target.search && target.pathname !== source) inbound.get(target.pathname)?.add(source);
          } catch { /* Non-URL navigation is not an inbound crawl link. */ }
        }
      }
    }
  }
  walk(ROOT);
  for (const [target, sources] of inbound) assert(sources.size > 0, `${target}: no direct public internal link`);
  console.log(JSON.stringify({ mode: "source", cases: cases.length, kinds: counts(), uniqueHtmlTargets: targets.size, inbound: Object.fromEntries([...inbound].map(([p, v]) => [p, v.size])) }, null, 2));
}

const counts = () => Object.fromEntries(["redirect", "html", "data"].map(kind => [kind, cases.filter(c => c.kind === kind).length]));
async function get(urlPath, method = "GET") {
  return fetch(ORIGIN + urlPath, { method, redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "SimpleMemo-GSC-Regression/1.0", "Cache-Control": "no-cache" } });
}

async function liveAudit(strict) {
  // Bound deployment propagation checks. Failure is a failed verification,
  // never silently re-labelled as a successful deployment.
  if (strict) {
    let ready = false;
    for (let attempt = 0; attempt < 18; attempt++) {
      try {
        const probes = await Promise.all(cases.filter(c => c.kind === "data").map(c => get(c.from, "HEAD")));
        ready = probes.every(r => r.status === 200 && noindex(r.headers.get("x-robots-tag")));
      } catch { ready = false; }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    assert(ready, "Production did not expose the new JSON noindex policy within the bounded propagation check");
  }
  const cache = new Map();
  async function snapshot(p) {
    if (!cache.has(p)) cache.set(p, (async () => {
      const r = await get(p);
      return { status: r.status, location: r.headers.get("location"), robots: r.headers.get("x-robots-tag"), contentType: r.headers.get("content-type"), body: await r.text() };
    })());
    return cache.get(p);
  }
  const report = { mode: strict ? "production-verification" : "production-baseline", observedAt: new Date().toISOString(), sourceCommit: process.env.GITHUB_SHA || null, note: "HTTP serving checks, not a Google URL Inspection result or exact production-revision attestation", kinds: counts(), cases: [] };
  const robotsResponse = await snapshot("/robots.txt"), sitemapResponse = await snapshot("/sitemap-ja.xml");
  assert.equal(robotsResponse.status, 200, "Live robots.txt must return 200");
  assert.equal(sitemapResponse.status, 200, "Live sitemap must return 200");
  const robots = robotsResponse.body, sitemap = sitemapResponse.body;
  for (const c of cases) {
    const row = { ...c };
    try {
      const first = await snapshot(c.from);
      row.status = first.status;
      assert.equal(first.status, c.kind === "redirect" ? 301 : 200, `${c.from}: unexpected initial HTTP status`);
      if (c.kind === "redirect") {
        assert(first.location, `${c.from}: missing Location`);
        assert.equal(new URL(first.location, ORIGIN + c.from).href, ORIGIN + c.to, `${c.from}: unexpected redirect target`);
      }
      const final = await snapshot(c.to);
      assert.equal(final.status, 200, `${c.to}: final target is not a direct 200`);
      assert(robotsAllows(robots, c.from) && robotsAllows(robots, c.to), `${c.from}: robots.txt prevents Google's verification`);
      row.finalStatus = final.status;
      row.xRobotsTag = final.robots;
      if (c.kind === "data") {
        assert(/application\/json/i.test(final.contentType || ""), `${c.to}: not a JSON response`);
        JSON.parse(final.body);
        row.noindexObserved = noindex(final.robots);
        if (strict) assert(row.noindexObserved, `${c.to}: missing live noindex header`);
      } else {
        checkHtml(final.body, c.to);
        assert(!noindex(final.robots), `${c.to}: live HTML is noindex`);
        assert(sitemap.includes(`<loc>${ORIGIN}${c.to}</loc>`), `${c.to}: absent from live sitemap`);
      }
      row.ok = true;
    } catch (error) { row.ok = false; row.error = error.message; }
    report.cases.push(row);
  }
  report.passed = report.cases.filter(c => c.ok).length;
  report.failed = report.cases.length - report.passed;
  writeFileSync(path.join(ROOT, "gsc-indexing-http-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.failed, 0, `GSC HTTP checks failed: ${report.failed}/${cases.length}`);
}

assert.equal(cases.length, 60, "The complete supplied sample must remain covered");
assert.equal(new Set(cases.map(c => c.from)).size, 60, "Duplicate fixture URL");
assert.deepEqual(counts(), { redirect: 51, html: 7, data: 2 });
for (const c of cases) assert(c.from.startsWith("/") && c.to.startsWith("/") && !c.to.includes("?"));
if (process.argv.includes("--selftest")) selftest();
else if (process.argv.includes("--live")) await liveAudit(true);
else if (process.argv.includes("--baseline")) await liveAudit(false);
else { selftest(); await sourceAudit(); }
