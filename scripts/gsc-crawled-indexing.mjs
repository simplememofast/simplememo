#!/usr/bin/env node
// Owner's 2026-09-16 and 2026-09-29 GSC samples: serving policy, not Google's indexing verdict.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://simplememofast.com";
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const olderCases = JSON.parse(read("docs/seo/gsc-crawled-cases-2026-09-16.json")).cases;
const latestCases = JSON.parse(read("docs/seo/gsc-crawled-cases-2026-09-29.json")).cases;
assert.equal(olderCases.length, 60);
assert.equal(latestCases.length, 50);
const bySource = new Map(olderCases.map(c => [c.from, c]));
for (const c of latestCases) {
  const previous = bySource.get(c.from);
  if (previous) assert.deepEqual(c, previous, `${c.from}: supplied reports disagree`);
  bySource.set(c.from, c);
}
const cases = [...bySource.values()];
// Publication coverage is separate from the owner's historical GSC samples.
const publicationPaths = [
  { kind: "html", url: "/obsidian/plugins/templater/" },
  { kind: "html", url: "/obsidian/plugins/quickadd/" },
  { kind: "asset", url: "/assets/downloads/obsidian-templater/Daily.md" },
  { kind: "asset", url: "/assets/img/obsidian-templater/daily-trigger-on.png" },
  { kind: "asset", url: "/assets/downloads/obsidian-quickadd/inbox-after-two.md" },
  { kind: "asset", url: "/assets/img/obsidian-quickadd/inbox-result.png" },
  { kind: "html", url: "/obsidian/zettelkasten/" },
  { kind: "asset", url: "/assets/downloads/obsidian-zettelkasten/final-note.md" },
  { kind: "asset", url: "/assets/img/obsidian-zettelkasten/graph-final.png" },
  { kind: "html", url: "/obsidian/troubleshooting/sync-conflict/" },
  { kind: "asset", url: "/assets/downloads/obsidian-sync-conflict/resolved-note.md" },
  { kind: "asset", url: "/assets/img/obsidian-sync-conflict/resolved-reopened.png" },
  { kind: "html", url: "/obsidian/graph-view/" },
  { kind: "asset", url: "/assets/downloads/obsidian-graph-view/追加メモ.md" },
  { kind: "asset", url: "/assets/img/obsidian-graph-view/local-depth-2.png" },
  { kind: "html", url: "/obsidian/canvas/" },
  { kind: "asset", url: "/assets/downloads/obsidian-canvas/Untitled.canvas" },
  { kind: "asset", url: "/assets/img/obsidian-canvas/reopened-canvas.png" },
  { kind: "html", url: "/obsidian/ai-plugins/" },
  { kind: "asset", url: "/assets/downloads/obsidian-ai-plugins/source-quotes-20260930.json" },
  { kind: "asset", url: "/assets/img/og/obsidian-ai-plugins.png" },
  { kind: "html", url: "/obsidian/backup/" },
  { kind: "asset", url: "/assets/downloads/obsidian-backup/observation-note.md" },
  { kind: "asset", url: "/assets/img/obsidian-backup/file-recovery-restored-reopened.png" },
  { kind: "html", url: "/obsidian/templates/" },
  { kind: "asset", url: "/assets/downloads/obsidian-templates/applied-01-daily-note.md" },
  { kind: "asset", url: "/assets/img/obsidian-templates/01-daily-note-reopened.png" },
  { kind: "html", url: "/obsidian/troubleshooting/slow-startup/" },
  { kind: "asset", url: "/assets/downloads/obsidian-slow-startup/startup-trials-20260930.csv" },
  { kind: "asset", url: "/assets/img/obsidian/slow-startup/trial-03-actual-gui.png" },
  { kind: "html", url: "/obsidian/markdown-guide/" },
  { kind: "asset", url: "/assets/img/obsidian-markdown-final/G03-reading-top-original.png" },
  { kind: "asset", url: "/assets/downloads/obsidian-markdown-catalogue/G03 HTMLブロックとインライン.md" },
  { kind: "html", url: "/obsidian/uri-scheme/" },
  { kind: "asset", url: "/assets/evidence/uri-scheme-20260930/images/encoded-content.png" },
  { kind: "asset", url: "/assets/evidence/uri-scheme-20260930/results/38-action-parameter-units.json" },
  { kind: "html", url: "/obsidian/compare/anytype/" },
  { kind: "asset", url: "/assets/img/obsidian-compare-anytype/anytype-welcome.png" },
  { kind: "asset", url: "/assets/downloads/obsidian-compare-anytype/index.md" },
  { kind: "html", url: "/obsidian/import/" },
  { kind: "asset", url: "/assets/downloads/obsidian-import/notion-attachment.md" },
  { kind: "asset", url: "/assets/img/obsidian-import/notion-finished.png" },
  { kind: "html", url: "/obsidian/daily-note-plugins/" },
  { kind: "asset", url: "/assets/downloads/obsidian-daily-note-plugins/daily-saved.md" },
  { kind: "asset", url: "/assets/img/obsidian-daily-note-plugins/daily.png" },
  { kind: "html", url: "/resources/obsidian-uri/" },
  { kind: "asset", url: "/assets/img/obsidian-uri-generator/encoded-content.png" },
  { kind: "asset", url: "/assets/downloads/obsidian-uri-generator/encoded-new-saved.md" },
  { kind: "html", url: "/obsidian/community/" },
  { kind: "asset", url: "/assets/downloads/obsidian-community/source-update-observations.json" },
  { kind: "asset", url: "/assets/img/og/obsidian-community.png" },
  { kind: "html", url: "/obsidian/properties/" },
  { kind: "asset", url: "/assets/img/obsidian-properties/properties-final.png" },
  { kind: "asset", url: "/assets/downloads/obsidian-properties/記録/調査A.md" },
  { kind: "html", url: "/obsidian/publish/" },
  { kind: "asset", url: "/assets/img/obsidian-publish/quartz-home-desktop.png" },
  { kind: "asset", url: "/assets/downloads/obsidian-publish/index.md" },
  { kind: "html", url: "/obsidian/use-cases/" },
  { kind: "asset", url: "/assets/img/og/obsidian-use-cases.png" },
  { kind: "asset", url: "/assets/downloads/obsidian-use-cases/role-mapping.json" },
  // A7 is one metadata publication comparison after the original 60 cases.
  { kind: "html", url: "/glossary/pkm/", checkDescriptions: true },
  // A1 is one structured metadata comparison after the original 60 and A7.
  { kind: "html", url: "/en/blog/ios26-speechanalyzer-live-mic", checkTechArticleMetadata: true },
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
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

function headTitle(html, urlPath) {
  const heads = [...clean(html).matchAll(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/gi)];
  assert.equal(heads.length, 1, `${urlPath}: one complete real head is required`);
  const titles = [...heads[0][1].matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];
  assert.equal(titles.length, 1, `${urlPath}: one title in the real head is required`);
  const title = titles[0][1].trim().replace(/\s+/g, " ");
  assert(title, `${urlPath}: empty title`);
  return title;
}

function descriptionAttributes(tag, urlPath) {
  const attributes = new Map();
  for (const [, name, doubleQuoted, singleQuoted, unquoted] of tag.matchAll(/\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/g)) {
    const key = name.toLowerCase();
    assert(!attributes.has(key), `${urlPath}: duplicate description element attribute ${key}`);
    attributes.set(key, (doubleQuoted ?? singleQuoted ?? unquoted ?? "").replace(/&amp;/g, "&"));
  }
  return attributes;
}

function descriptionJson(source, urlPath) {
  const value = JSON.parse(source), stack = [];
  // JSON.parse otherwise silently accepts duplicate keys in an object.
  for (const [token] of source.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],]/g)) {
    if (token === "{") stack.push({ keys: new Set(), expectingKey: true });
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (token === ",") { if (stack.at(-1)) stack.at(-1).expectingKey = true; }
    else if (stack.at(-1)?.expectingKey) {
      const key = JSON.parse(token), object = stack.at(-1);
      assert(!object.keys.has(key), `${urlPath}: duplicate JSON-LD key ${key}`);
      object.keys.add(key);
      object.expectingKey = false;
    }
  }
  return value;
}

function headDescriptions(html, urlPath, structuredFields = [["article", "Article", "description"], ["definedTerm", "DefinedTerm", "description"]]) {
  const document = html.replace(/<!--[\s\S]*?-->/g, block => " ".repeat(block.length));
  // Retain JSON-LD for parsing, but mask raw-text elements when locating the head.
  const masked = document.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, block => " ".repeat(block.length));
  const heads = [...masked.matchAll(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/gi)];
  assert.equal(heads.length, 1, `${urlPath}: one complete real head is required for descriptions`);
  const head = document.slice(heads[0].index, heads[0].index + heads[0][0].length);
  const meta = [...clean(head).matchAll(/<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)].map(([tag]) => tag);
  const descriptions = {};
  for (const [key, attribute, selector] of [["meta", "name", "description"], ["openGraph", "property", "og:description"], ["twitter", "name", "twitter:description"]]) {
    const selected = meta.filter(tag => attr(tag, attribute).toLowerCase() === selector);
    assert.equal(selected.length, 1, `${urlPath}: one ${selector} in the real head is required`);
    const attributes = descriptionAttributes(selected[0], urlPath), value = attributes.get("content");
    assert(typeof value === "string" && value.trim(), `${urlPath}: empty ${selector}`);
    descriptions[key] = value;
  }
  const nodes = [];
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      nodes.push(value);
      for (const [key, nested] of Object.entries(value)) if (key !== "@context") visit(nested);
    }
  };
  for (const [tag, , source] of head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const opening = tag.slice(0, tag.indexOf(">") + 1);
    if (attr(opening, "type").toLowerCase() !== "application/ld+json") continue;
    descriptionAttributes(opening, urlPath);
    visit(descriptionJson(source, urlPath));
  }
  for (const [key, type, field] of structuredFields) {
    const selected = nodes.filter(node => [node["@type"]].flat().some(value => [type, `https://schema.org/${type}`, `http://schema.org/${type}`].includes(value)));
    assert.equal(selected.length, 1, `${urlPath}: one JSON-LD ${type} in the real head is required`);
    const value = selected[0][field];
    assert(typeof value === "string" && value.trim(), `${urlPath}: empty JSON-LD ${type}.${field}`);
    descriptions[key] = value;
  }
  return descriptions;
}

function headTechArticleMetadata(html, urlPath) {
  return headDescriptions(html, urlPath, [["techArticleHeadline", "TechArticle", "headline"], ["techArticleDescription", "TechArticle", "description"], ["techArticleDateModified", "TechArticle", "dateModified"]]);
}

function publicationTargets(readBytes = file => readFileSync(path.join(ROOT, file))) {
  return publicationPaths.map(target => {
    const file = target.kind === "html" ? htmlFile(target.url) : target.url.slice(1);
    const bytes = readBytes(file);
    assert(bytes.length > 0, `${target.url}: publication source is empty`);
    return target.kind === "html"
      ? { ...target, expectedTitle: headTitle(bytes.toString("utf8"), target.url),
        ...(target.checkDescriptions ? { expectedDescriptions: headDescriptions(bytes.toString("utf8"), target.url) } : {}),
        ...(target.checkTechArticleMetadata ? { expectedTechArticleMetadata: headTechArticleMetadata(bytes.toString("utf8"), target.url) } : {}) }
      : { ...target, expectedSha256: sha256(bytes), expectedBytes: bytes.length };
  });
}

function publicationResponse(target, response) {
  const row = { ...target, status: response.status, contentType: response.contentType, xRobotsTag: response.robots, observedAt: response.observedAt };
  if (target.kind === "asset") {
    row.actualSha256 = sha256(response.bytes);
    row.actualBytes = response.bytes.length;
  }
  try {
    assert.equal(response.status, 200, `${target.url}: publication must be a direct 200`);
    if (target.kind === "html") {
      row.actualTitle = headTitle(response.body, target.url);
      assert(/^text\/html(?:\s*;|$)/i.test(response.contentType || ""), `${target.url}: not an HTML response`);
      checkHtml(response.body, target.url);
      assert(!noindex(response.robots), `${target.url}: live publication HTML is noindex`);
      assert.equal(row.actualTitle, target.expectedTitle, `${target.url}: live title differs from checkout`);
      if (target.checkDescriptions) {
        row.actualDescriptions = headDescriptions(response.body, target.url);
        for (const [field, expected] of Object.entries(target.expectedDescriptions)) {
          assert.equal(row.actualDescriptions[field], expected, `${target.url}: live ${field} description differs from checkout`);
        }
      }
      if (target.checkTechArticleMetadata) {
        row.actualTechArticleMetadata = headTechArticleMetadata(response.body, target.url);
        for (const [field, expected] of Object.entries(target.expectedTechArticleMetadata)) {
          assert.equal(row.actualTechArticleMetadata[field], expected, `${target.url}: live ${field} metadata differs from checkout`);
        }
      }
    } else {
      if (target.url.endsWith(".png")) assert(/^image\/png(?:\s*;|$)/i.test(response.contentType || ""), `${target.url}: not a PNG response`);
      assert.equal(row.actualSha256, target.expectedSha256, `${target.url}: served bytes differ from checkout`);
    }
    row.ok = true;
  } catch (error) { row.ok = false; row.error = error.message; }
  return row;
}

function publicationCrawl(row, robots, sitemap) {
  if (!row.ok || row.kind !== "html") return row;
  try {
    assert(robotsAllows(robots, row.url), `${row.url}: live robots.txt blocks publication`);
    assert(sitemap.includes(`<loc>${ORIGIN}${row.url}</loc>`), `${row.url}: publication absent from live sitemap`);
  } catch (error) { return { ...row, ok: false, error: error.message }; }
  return row;
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

async function selftest() {
  const valid = `<head><link href='${ORIGIN}/press/' rel='canonical'></head><body>Press</body>`;
  checkHtml(valid, "/press/");
  assert.throws(() => checkHtml(valid.replace("/press/", "/wrong/"), "/press/"));
  assert.throws(() => checkHtml(valid.replace("</head>", '<meta content="noindex" name="robots"></head>'), "/press/"));
  assert.throws(() => checkHtml(valid.replace("</body>", '<meta content="none" name="googlebot"></body>'), "/press/"));
  assert.throws(() => checkHtml(`<head><!--${valid}--></head>`, "/press/"));
  assert.throws(() => checkHtml(`<head><script>${valid}</script></head>`, "/press/"));
  assert.throws(() => checkHtml(valid.replace("</head>", `<link rel="canonical" href="${ORIGIN}/press/"></head>`), "/press/"));
  const config = '/*\n  Cache-Control: public, no-cache\n/data/*.json\n  X-Robots-Tag: noindex\n/assets/downloads/*.csv\n  X-Robots-Tag: noindex\n';
  assert(noindex(configuredRobots(config, "/data/autopilot-runs.json")));
  assert(noindex(configuredRobots(config, "/assets/downloads/example.csv")));
  assert(!noindex(configuredRobots(config, "/press/")));
  assert(!noindex(configuredRobots(config, "/data/x.json.html")));
  assert(!noindex(configuredRobots(config, "/assets/downloads/example.csv.html")));
  assert(!noindex(configuredRobots(config.replace("noindex", "index"), "/data/x.json")));
  assert(robotsAllows("User-agent: *\nAllow: /\nUser-agent: CCBot\nDisallow: /", "/data/x.json"));
  assert(!robotsAllows("User-agent: *\nDisallow: /data/", "/data/x.json"));
  assert(robotsAllows("User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /data/", "/data/x.json"));
  const fixtureHtml = (url, title) => `<html><head><title>${title}</title><link rel="canonical" href="${ORIGIN}${url}"></head><body>Fixture</body></html>`;
  const a7Descriptions = { meta: "A7 meta 日本語 & current", openGraph: "A7 Open Graph current", twitter: "A7 Twitter current", article: "A7 Article current", definedTerm: "A7 DefinedTerm current" };
  const fixtureA7Html = (url, title, descriptions = a7Descriptions) => fixtureHtml(url, title).replace("</head>",
    `<meta name="description" content="${descriptions.meta?.replace(/&/g, "&amp;") ?? ""}"><meta property="og:description" content="${descriptions.openGraph ?? ""}"><meta name="twitter:description" content="${descriptions.twitter ?? ""}">` +
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": ["Article"], description: descriptions.article }, { "@type": "https://schema.org/DefinedTerm", description: descriptions.definedTerm }] })}</script></head>`);
  const a1Metadata = { meta: "A1 meta current", openGraph: "A1 Open Graph current", twitter: "A1 Twitter current", techArticleHeadline: "A1 structured headline current", techArticleDescription: "A1 structured description current", techArticleDateModified: "2026-09-09" };
  const fixtureA1Html = (url, title, metadata = a1Metadata) => fixtureHtml(url, title).replace("</head>",
    `<meta name="description" content="${metadata.meta ?? ""}"><meta property="og:description" content="${metadata.openGraph ?? ""}"><meta name="twitter:description" content="${metadata.twitter ?? ""}">` +
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": ["https://schema.org/TechArticle"], headline: metadata.techArticleHeadline, description: metadata.techArticleDescription, dateModified: metadata.techArticleDateModified }] })}</script></head>`);
  const fixtureBytes = new Map(publicationPaths.map(target => [target.kind === "html" ? htmlFile(target.url) : target.url.slice(1),
    target.kind === "html" ? Buffer.from((target.checkDescriptions ? fixtureA7Html : target.checkTechArticleMetadata ? fixtureA1Html : fixtureHtml)(target.url, `Synthetic ${target.url}`))
      : target.url.endsWith(".png") ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]) : Buffer.from("Synthetic 日本語\nsecond capture\n")]));
  const readBytes = file => { assert(fixtureBytes.has(file), `Unexpected synthetic source: ${file}`); return fixtureBytes.get(file); };
  const publication = publicationTargets(readBytes), htmlTarget = publication[0], pngTarget = publication.find(target => target.url.endsWith(".png"));
  assert.equal(publication.length, 62);
  const a7Target = publication.at(-2), a7Html = readBytes(htmlFile(a7Target.url)).toString("utf8");
  assert.equal(a7Target.url, "/glossary/pkm/");
  assert.equal(publication.filter(target => target.checkDescriptions).length, 1);
  assert.deepEqual(a7Target.expectedDescriptions, a7Descriptions);
  const a1Target = publication.at(-1), a1Html = readBytes(htmlFile(a1Target.url)).toString("utf8");
  assert.equal(a1Target.url, "/en/blog/ios26-speechanalyzer-live-mic");
  assert.equal(htmlFile(a1Target.url), "en/blog/ios26-speechanalyzer-live-mic.html", "A1 must preserve its extensionless nonslash canonical");
  assert.equal(publication.filter(target => target.checkTechArticleMetadata).length, 1);
  assert.deepEqual(a1Target.expectedTechArticleMetadata, a1Metadata);
  assert.throws(() => publicationTargets(() => { throw new Error("Missing publication source"); }), /Missing publication source/);
  const html = fixtureHtml(htmlTarget.url, htmlTarget.expectedTitle);
  assert.equal(headTitle(html.replace("<body>", "<body><title>Wrong body title</title>"), htmlTarget.url), htmlTarget.expectedTitle);
  assert.equal(headTitle(html.replace("<head>", "<head><!--<title>Wrong</title>--><script><title>Wrong</title></script>"), htmlTarget.url), htmlTarget.expectedTitle);
  assert.throws(() => headTitle(html.replace("</head>", "<title>Duplicate</title></head>"), htmlTarget.url));
  assert.throws(() => headTitle(html.replace(/<title>.*?<\/title>/, ""), htmlTarget.url));
  const responseSnapshot = (bytes, contentType = "text/html", status = 200, robots = null) => ({ status, contentType, robots, bytes, body: bytes.toString("utf8") });
  const goodHtml = publicationResponse(htmlTarget, responseSnapshot(Buffer.from(html)));
  assert(goodHtml.ok);
  const goodA7 = publicationResponse(a7Target, responseSnapshot(Buffer.from(a7Html)));
  assert(goodA7.ok, "Different descriptions across the five source fields are legitimate");
  assert.deepEqual(goodA7.actualDescriptions, a7Descriptions);
  assert.deepEqual(goodA7.expectedDescriptions, a7Descriptions);
  for (const field of Object.keys(a7Descriptions)) {
    const staleDescriptions = { ...a7Descriptions, [field]: `Previous ${field} description` };
    const staleA7 = publicationResponse(a7Target, responseSnapshot(Buffer.from(fixtureA7Html(a7Target.url, a7Target.expectedTitle, staleDescriptions))));
    assert.equal(staleA7.actualTitle, a7Target.expectedTitle, "Same title must not hide stale A7 metadata");
    assert(!staleA7.ok);
    assert(staleA7.error.includes(`live ${field} description differs from checkout`));
    assert.deepEqual(staleA7.actualDescriptions, staleDescriptions);
    assert.deepEqual(staleA7.expectedDescriptions, a7Descriptions);
    const missing = fixtureA7Html(a7Target.url, a7Target.expectedTitle, { ...a7Descriptions, [field]: undefined });
    assert.throws(() => headDescriptions(missing, a7Target.url), /empty/);
  }
  const oldDescriptions = Object.fromEntries(Object.keys(a7Descriptions).map(field => [field, `Previous ${field} description`]));
  const allStaleA7 = publicationResponse(a7Target, responseSnapshot(Buffer.from(fixtureA7Html(a7Target.url, a7Target.expectedTitle, oldDescriptions))));
  assert.equal(allStaleA7.actualTitle, a7Target.expectedTitle);
  assert(!allStaleA7.ok);
  assert.deepEqual(allStaleA7.actualDescriptions, oldDescriptions);
  for (const tag of a7Html.matchAll(/<meta\b[^>]*>/g)) {
    assert.throws(() => headDescriptions(a7Html.replace(tag[0], ""), a7Target.url), /one .* in the real head/);
    assert.throws(() => headDescriptions(a7Html.replace(tag[0], tag[0] + tag[0]), a7Target.url), /one .* in the real head/);
  }
  for (const type of ["Article", "DefinedTerm"]) {
    const duplicate = `<script type="application/ld+json">${JSON.stringify({ "@type": type, description: "Duplicate" })}</script>`;
    assert.throws(() => headDescriptions(a7Html.replace("</head>", duplicate + "</head>"), a7Target.url), /one JSON-LD .* in the real head/);
  }
  assert.throws(() => headDescriptions(a7Html.replace('name="description"', 'name="description" content="Previous"'), a7Target.url), /duplicate description element attribute content/);
  assert.throws(() => headDescriptions(a7Html.replace('"description":"A7 Article current"', '"description":"Previous","description":"A7 Article current"'), a7Target.url), /duplicate JSON-LD key description/);
  assert.throws(() => headDescriptions(a7Html.replace('"@graph":', '"@graph":broken'), a7Target.url), SyntaxError);
  const decoy = `<head><meta name="description" content="Decoy"></head>`;
  assert.deepEqual(headDescriptions(a7Html.replace("<head>", `<head><!--${decoy}--><script>${JSON.stringify(decoy)}</script>`).replace("<body>", `<body>${a7Html.match(/<meta\b[^>]*>/)[0]}<script type="application/ld+json">{"@type":"Article","description":"Body decoy"}</script>`), a7Target.url), a7Descriptions);
  assert.deepEqual(headDescriptions(a7Html.replace("<head>", `<head><script>const metadata = 'type="application/ld+json"';</script>`), a7Target.url), a7Descriptions);
  const markupDescriptions = { ...a7Descriptions, article: decoy };
  assert.deepEqual(headDescriptions(fixtureA7Html(a7Target.url, a7Target.expectedTitle, markupDescriptions), a7Target.url), markupDescriptions);
  const goodA1 = publicationResponse(a1Target, responseSnapshot(Buffer.from(a1Html)));
  assert(goodA1.ok, "TechArticle and meta descriptions need not be identical");
  assert.deepEqual(goodA1.actualTechArticleMetadata, a1Metadata);
  assert.deepEqual(goodA1.expectedTechArticleMetadata, a1Metadata);
  for (const field of Object.keys(a1Metadata)) {
    const staleMetadata = { ...a1Metadata, [field]: field === "techArticleDateModified" ? "2026-06-16" : `Previous ${field}` };
    const staleA1 = publicationResponse(a1Target, responseSnapshot(Buffer.from(fixtureA1Html(a1Target.url, a1Target.expectedTitle, staleMetadata))));
    assert.equal(staleA1.actualTitle, a1Target.expectedTitle, "Same title must not hide stale A1 metadata");
    assert(!staleA1.ok);
    assert(staleA1.error.includes(`live ${field} metadata differs from checkout`));
    assert.deepEqual(staleA1.actualTechArticleMetadata, staleMetadata);
    assert.deepEqual(staleA1.expectedTechArticleMetadata, a1Metadata);
    assert.throws(() => headTechArticleMetadata(fixtureA1Html(a1Target.url, a1Target.expectedTitle, { ...a1Metadata, [field]: undefined }), a1Target.url), /empty/);
  }
  const oldA1Metadata = { ...a1Metadata, techArticleHeadline: "Previous headline", techArticleDescription: "Previous description", techArticleDateModified: "2026-06-16" };
  const allStaleA1 = publicationResponse(a1Target, responseSnapshot(Buffer.from(fixtureA1Html(a1Target.url, a1Target.expectedTitle, oldA1Metadata))));
  assert.equal(allStaleA1.actualTitle, a1Target.expectedTitle);
  assert(!allStaleA1.ok);
  assert.deepEqual(allStaleA1.actualTechArticleMetadata, oldA1Metadata);
  for (const tag of a1Html.matchAll(/<meta\b[^>]*>/g)) {
    assert.throws(() => headTechArticleMetadata(a1Html.replace(tag[0], ""), a1Target.url), /one .* in the real head/);
    assert.throws(() => headTechArticleMetadata(a1Html.replace(tag[0], tag[0] + tag[0]), a1Target.url), /one .* in the real head/);
  }
  for (const type of ["TechArticle", "http://schema.org/TechArticle"]) {
    const duplicate = `<script type="application/ld+json">${JSON.stringify({ "@type": type, headline: "Duplicate", description: "Duplicate", dateModified: "2026-09-09" })}</script>`;
    assert.throws(() => headTechArticleMetadata(a1Html.replace("</head>", duplicate + "</head>"), a1Target.url), /one JSON-LD TechArticle in the real head/);
  }
  assert.throws(() => headTechArticleMetadata(a1Html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ""), a1Target.url), /one JSON-LD TechArticle in the real head/);
  assert.throws(() => headTechArticleMetadata(a1Html.replace('name="description"', 'name="description" content="Previous"'), a1Target.url), /duplicate description element attribute content/);
  for (const [field, value] of [["headline", a1Metadata.techArticleHeadline], ["description", a1Metadata.techArticleDescription], ["dateModified", a1Metadata.techArticleDateModified]]) {
    const keyValue = `${JSON.stringify(field)}:${JSON.stringify(value)}`;
    assert.throws(() => headTechArticleMetadata(a1Html.replace(keyValue, `${JSON.stringify(field)}:"Previous",${keyValue}`), a1Target.url), new RegExp(`duplicate JSON-LD key ${field}`));
    assert.throws(() => headTechArticleMetadata(a1Html.replace(keyValue, `${JSON.stringify(field)}:null`), a1Target.url), /empty JSON-LD TechArticle/);
  }
  assert.throws(() => headTechArticleMetadata(a1Html.replace('"@graph":', '"@graph":broken'), a1Target.url), SyntaxError);
  assert.deepEqual(headTechArticleMetadata(a1Html.replace("<head>", `<head><!--${decoy}--><script>${JSON.stringify(decoy)}</script>`).replace("<body>", `<body>${a1Html.match(/<meta\b[^>]*>/)[0]}<script type="application/ld+json">{"@type":"TechArticle","headline":"Body decoy","description":"Body decoy","dateModified":"2026-06-16"}</script>`), a1Target.url), a1Metadata);
  assert(!publicationResponse(htmlTarget, responseSnapshot(Buffer.from(html.replace(htmlTarget.expectedTitle, "Stale title")))).ok);
  assert(!publicationResponse(htmlTarget, responseSnapshot(Buffer.from(html), "text/html", 404)).ok);
  assert(!publicationResponse(htmlTarget, responseSnapshot(Buffer.from(html), "text/plain")).ok);
  assert(!publicationResponse(htmlTarget, responseSnapshot(Buffer.from(html), "text/html", 200, "noindex")).ok);
  assert(!publicationResponse(htmlTarget, responseSnapshot(Buffer.from(html.replace(htmlTarget.url, "/wrong/")))).ok);
  assert(!publicationCrawl(goodHtml, "User-agent: *\nAllow: /", "").ok);
  assert(!publicationCrawl(goodHtml, "User-agent: *\nDisallow: /obsidian/", `<loc>${ORIGIN}${htmlTarget.url}</loc>`).ok);
  const pngBytes = readBytes(pngTarget.url.slice(1));
  assert(publicationResponse(pngTarget, responseSnapshot(pngBytes, "image/png")).ok);
  assert(!publicationResponse(pngTarget, responseSnapshot(Buffer.from(pngBytes.toString("utf8")), "image/png")).ok, "PNG comparison must retain non-UTF8 bytes");
  assert(!publicationResponse(pngTarget, responseSnapshot(pngBytes, "text/html")).ok);
  for (const target of publication.filter(target => target.url.endsWith(".md"))) {
    const bytes = readBytes(target.url.slice(1));
    assert(publicationResponse(target, responseSnapshot(bytes, "application/octet-stream")).ok);
    assert(!publicationResponse(target, responseSnapshot(Buffer.concat([bytes, Buffer.from("changed")]), "text/plain")).ok);
  }
  const allSitemap = [...new Set([...cases.map(c => c.to), ...publication.filter(c => c.kind === "html").map(c => c.url)])].map(url => `<loc>${ORIGIN}${url}</loc>`).join("\n");
  const makeRequest = ({ staleTitle = false, staleSitemap = false, staleAsset = false, staleDescriptions = false, staleTechArticleMetadata = false, unavailable = false } = {}) => {
    const calls = new Map();
    return { calls, request: async (url, method) => {
      const key = `${method} ${url}`, call = (calls.get(key) || 0) + 1;
      calls.set(key, call);
      if (method === "HEAD") return new Response(null, { headers: { "X-Robots-Tag": "noindex" } });
      if (url === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
      if (url.startsWith("/sitemap-")) return new Response(staleSitemap && call === 1 ? "<urlset></urlset>" : allSitemap);
      const target = publication.find(c => c.url === url);
      if (target) {
        if (unavailable && target === htmlTarget) return new Response("Missing", { status: 404 });
        let bytes = readBytes(target.kind === "html" ? htmlFile(url) : url.slice(1));
        if (staleTitle && target === htmlTarget && call === 1) bytes = Buffer.from(fixtureHtml(url, "Stale title"));
        if (staleAsset && target === pngTarget && call === 1) bytes = Buffer.from("Stale PNG");
        if (staleDescriptions && target === a7Target && call === 1) bytes = Buffer.from(fixtureA7Html(url, target.expectedTitle, oldDescriptions));
        if (staleTechArticleMetadata && target === a1Target && call === 1) bytes = Buffer.from(fixtureA1Html(url, target.expectedTitle, oldA1Metadata));
        return new Response(bytes, { headers: { "Content-Type": target.kind === "html" ? "text/html" : url.endsWith(".png") ? "image/png" : "text/plain" } });
      }
      const c = cases.find(c => c.from === url);
      if (c?.kind === "redirect") return new Response(null, { status: 301, headers: { Location: c.to } });
      if (c?.kind === "data") return new Response("{}", { headers: { "Content-Type": "application/json", "X-Robots-Tag": "noindex" } });
      if (c?.kind === "asset") return new Response("header\nvalue\n", { headers: { "Content-Type": "text/csv", "X-Robots-Tag": "noindex" } });
      assert(cases.some(c => c.to === url), `Unexpected synthetic request: ${url}`);
      return new Response(fixtureHtml(url, "Existing fixture"), { headers: { "Content-Type": "text/html" } });
    } };
  };
  const stale = makeRequest({ staleTitle: true, staleSitemap: true, staleAsset: true, staleDescriptions: true, staleTechArticleMetadata: true }), cache = snapshotCache(stale.request), delays = [];
  const ready = await propagation(publication, cache, async ms => delays.push(ms));
  assert(ready.ready);
  assert.equal(ready.attempts, 2);
  assert.deepEqual(delays, [5000]);
  assert.equal(stale.calls.get(`GET ${htmlTarget.url}`), 2);
  assert.equal(stale.calls.get(`GET ${pngTarget.url}`), 2);
  assert.equal(stale.calls.get(`GET ${a7Target.url}`), 2, "Stale A7 descriptions must invalidate the same-title snapshot");
  assert.deepEqual(ready.publication.at(-2).actualDescriptions, a7Descriptions);
  assert.equal(stale.calls.get(`GET ${a1Target.url}`), 2, "Stale A1 structured metadata must invalidate the same-title snapshot");
  assert.deepEqual(ready.publication.at(-1).actualTechArticleMetadata, a1Metadata);
  assert.equal(stale.calls.get(`GET ${publication[1].url}`), 1, "Sitemap lag must not duplicate successful HTML GETs");
  for (const target of publication) await cache.snapshot(target.url);
  assert.equal(stale.calls.get(`GET ${htmlTarget.url}`), 2, "Final verification must reuse the successful publication snapshot");
  assert.equal(stale.calls.get(`GET ${a7Target.url}`), 2, "Final verification must reuse the matched A7 description snapshot");
  assert.equal(stale.calls.get(`GET ${a1Target.url}`), 2, "Final verification must reuse the matched A1 structured metadata snapshot");
  const unavailable = makeRequest({ unavailable: true }), boundedDelays = [];
  const failed = await propagation(publication, snapshotCache(unavailable.request), async ms => boundedDelays.push(ms));
  assert(!failed.ready);
  assert.equal(failed.attempts, 18);
  assert.equal(boundedDelays.length, 17);
  assert(boundedDelays.every(ms => ms === 5000));
  assert.equal(unavailable.calls.get(`GET ${htmlTarget.url}`), 18);
  assert.equal(unavailable.calls.get(`GET ${publication[1].url}`), 1);
  assert.equal(failed.publication.find(row => row.url === htmlTarget.url).status, 404);
  const expired = makeRequest();
  assert.equal((await propagation(publication, snapshotCache(expired.request), async () => {}, 1, () => 1)).attempts, 0);
  assert.equal(expired.calls.size, 0, "Expired propagation budget must perform no requests");
  const baseline = makeRequest(), baselineReports = [];
  const baselineReport = await liveAudit(false, { request: baseline.request, readBytes: () => { throw new Error("PR baseline must not load candidate sources"); }, saveReport: report => baselineReports.push(report), logReport: () => {} });
  assert.equal(baselineReport.passed, 85);
  assert.equal(baselineReport.publication.skipped, 62);
  assert(baselineReport.ok);
  assert.equal(baselineReports.length, 1);
  for (const target of publication) assert(!baseline.calls.has(`GET ${target.url}`), "PR baseline must not fetch unpublished candidates");
  const deployed = makeRequest(), deployedReports = [];
  const deployedReport = await liveAudit(true, { request: deployed.request, readBytes, wait: async () => {}, saveReport: report => deployedReports.push(report), logReport: () => {} });
  assert.equal(deployedReport.passed, 85);
  assert.equal(deployedReport.publication.passed, 62);
  assert.deepEqual(deployedReport.publication.cases.at(-2).actualDescriptions, a7Descriptions);
  assert.deepEqual(deployedReport.publication.cases.at(-2).expectedDescriptions, a7Descriptions);
  assert.deepEqual(deployedReport.publication.cases.at(-1).actualTechArticleMetadata, a1Metadata);
  assert.deepEqual(deployedReport.publication.cases.at(-1).expectedTechArticleMetadata, a1Metadata);
  assert.equal(deployedReport.publication.failed, 0);
  assert(deployedReport.ok);
  assert.equal(deployedReport.costUsd, null);
  for (const target of publication) assert.equal(deployed.calls.get(`GET ${target.url}`), 1);
  const failureReports = [], missing = makeRequest({ unavailable: true });
  await assert.rejects(liveAudit(true, { request: missing.request, readBytes, wait: async () => {}, saveReport: report => failureReports.push(report), logReport: () => {} }), /bounded propagation check/);
  assert.equal(failureReports.length, 1, "Propagation failure must retain report evidence");
  assert.equal(failureReports[0].publication.failed, 1);
  assert.equal(failureReports[0].publication.cases.find(row => row.url === htmlTarget.url).status, 404);
  assert.equal(failureReports[0].skipped, 85);
  assert(!failureReports[0].ok);
  const sourceFailureReports = [];
  await assert.rejects(liveAudit(true, { request: async () => { throw new Error("Missing sources must fail before HTTP"); }, readBytes: () => { throw new Error("Missing publication source"); }, saveReport: report => sourceFailureReports.push(report), logReport: () => {} }), /Missing publication source/);
  assert.equal(sourceFailureReports[0].publication.skipped, 62);
  assert(!sourceFailureReports[0].ok, "An incomplete strict run cannot pass");
  const controlReports = [], controlFailure = makeRequest();
  await assert.rejects(liveAudit(false, { request: async (url, method) => url === "/robots.txt" ? new Response("Missing", { status: 503 }) : controlFailure.request(url, method), saveReport: report => controlReports.push(report), logReport: () => {} }), /robots.txt must return 200/);
  assert.equal(controlReports.length, 1, "Crawl-control failure must retain report evidence");
  console.log("GSC indexing detector and publication regression self-tests passed (synthetic sources and HTTP responses; no network)");
  console.log("A7 real-head description regression passed: five independent same-title stale-field failures, source uniqueness and malformed JSON checks, retained expected/actual descriptions");
  console.log("A1 TechArticle regression passed: independent same-title stale headline/description/dateModified failures plus three meta descriptions, unique real-head source extraction, malformed JSON rejection, bounded cached-stale propagation and retained expected/actual metadata");
}

async function sourceAudit() {
  const { loadEdgeMiddleware, edgeResult } = await import("./lib/edge-middleware.mjs");
  const middleware = await loadEdgeMiddleware(ROOT);
  const sitemap = read("sitemap-ja.xml") + read("sitemap-en.xml"), headers = read("_headers"), robots = read("robots.txt");
  const policy = JSON.parse(read("data/publication-policy.json"));
  const publication = publicationTargets();
  const targets = new Set();
  for (const c of cases) {
    const result = await edgeResult(middleware, ORIGIN + c.from, ORIGIN);
    assert.deepEqual(result, c.kind === "redirect" ? { kind: "redirect", status: 301, to: c.to } : { kind: "pass" }, c.from);
    assert(robotsAllows(robots, c.from), `${c.from}: Google must be able to fetch the redirect/noindex/canonical`);
    if (c.kind === "data" || c.kind === "asset") {
      if (c.kind === "data") {
        assert.equal(policy.files[c.from.slice("/data/".length)]?.served_by_site, true, `${c.from}: preserve publication policy`);
        JSON.parse(read(c.from.slice(1)));
      } else {
        assert(c.from.startsWith("/assets/downloads/") && c.from.endsWith(".csv"));
        assert(read(c.from.slice(1)).length > 0, `${c.from}: downloadable CSV missing`);
      }
      assert(noindex(configuredRobots(headers, c.from)), `${c.from}: missing noindex response rule`);
      const response = await middleware({
        request: new Request(ORIGIN + c.from),
        next: async () => new Response("asset body", { headers: { "Content-Type": c.kind === "data" ? "application/json" : "text/csv", "Cache-Control": "public, max-age=3600" } }),
      });
      assert.equal(response.status, 200, `${c.from}: raw asset response status changed`);
      assert(noindex(response.headers.get("x-robots-tag")), `${c.from}: middleware lost noindex on a cached asset`);
      assert.equal(response.headers.get("cache-control"), "public, max-age=3600", `${c.from}: raw asset cache policy changed`);
      assert.equal(await response.text(), "asset body", `${c.from}: raw asset body changed`);
      const conditional = await middleware({
        request: new Request(ORIGIN + c.from, { headers: { "If-None-Match": '"cached-raw"' } }),
        next: async () => new Response(null, { status: 304, headers: { ETag: '"cached-raw"', "Cache-Control": "public, max-age=3600" } }),
      });
      assert.equal(conditional.status, 304, `${c.from}: conditional response status changed`);
      assert(noindex(conditional.headers.get("x-robots-tag")), `${c.from}: conditional response lost noindex`);
      assert.equal(conditional.headers.get("etag"), '"cached-raw"', `${c.from}: conditional response ETag changed`);
      assert.equal(conditional.headers.get("cache-control"), "public, max-age=3600", `${c.from}: conditional response cache policy changed`);
      assert.equal(conditional.body, null, `${c.from}: conditional response acquired a body`);
      assert(!sitemap.includes(`<loc>${ORIGIN}${c.from}</loc>`), `${c.from}: raw file must not be in sitemap`);
    } else targets.add(c.to);
  }
  for (const target of publication) {
    assert.deepEqual(await edgeResult(middleware, ORIGIN + target.url, ORIGIN), { kind: "pass" }, `${target.url}: publication must be served directly`);
    assert(robotsAllows(robots, target.url), `${target.url}: publication blocked in robots.txt`);
    if (target.kind === "html") targets.add(target.url);
    else {
      const bytes = readFileSync(path.join(ROOT, target.url.slice(1)));
      const response = await middleware({ request: new Request(ORIGIN + target.url), next: async () => new Response(bytes) });
      assert.equal(response.status, 200, `${target.url}: publication asset response status changed`);
      assert.equal(sha256(Buffer.from(await response.arrayBuffer())), target.expectedSha256, `${target.url}: middleware changed publication bytes`);
    }
  }
  for (const target of targets) {
    assert.deepEqual(await edgeResult(middleware, ORIGIN + target, ORIGIN), { kind: "pass" }, `${target}: second redirect`);
    const response = await middleware({ request: new Request(ORIGIN + target), next: async () => new Response("html body") });
    assert(!noindex(response.headers.get("x-robots-tag")), `${target}: middleware noindexed HTML`);
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
  const inbound = new Map([...cases.filter(c => c.kind === "html").map(c => c.to), ...publication.filter(c => c.kind === "html").map(c => c.url)].map(url => [url, new Set()]));
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
  console.log(JSON.stringify({ mode: "source", cases: cases.length, kinds: counts(), publication: { html: publicationPaths.filter(target => target.kind === "html").length, assets: publicationPaths.filter(target => target.kind === "asset").length, cases: publication }, uniqueHtmlTargets: targets.size, inbound: Object.fromEntries([...inbound].map(([p, v]) => [p, v.size])) }, null, 2));
}

const counts = () => Object.fromEntries(["redirect", "html", "data", "asset"].map(kind => [kind, cases.filter(c => c.kind === kind).length]));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function get(urlPath, method = "GET", deadline = Infinity) {
  // A full audit fetches over 100 distinct URLs. Pace requests and retry an
  // explicit 429; it is a rate limit, not evidence that a URL is unavailable.
  for (let attempt = 0; attempt < 5; attempt++) {
    assert(deadline - Date.now() > 250, "HTTP verification time budget exhausted");
    await pause(250);
    const response = await fetch(ORIGIN + urlPath, { method, redirect: "manual", signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))), headers: { "User-Agent": "SimpleMemo-GSC-Regression/1.0", "Cache-Control": "no-cache" } });
    if (response.status !== 429 || attempt === 4) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    await response.body?.cancel();
    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : Math.min(5000 * 2 ** attempt, 30000);
    assert(deadline - Date.now() > delay, "HTTP verification time budget exhausted during rate-limit retry");
    await pause(delay);
  }
}

function snapshotCache(request = get, deadline = Infinity) {
  const cache = new Map();
  return {
    async snapshot(url, method = "GET", requestDeadline = deadline) {
      const key = `${method} ${url}`;
      if (!cache.has(key)) cache.set(key, (async () => {
        const response = await request(url, method, Math.min(deadline, requestDeadline));
        const bytes = Buffer.from(await response.arrayBuffer());
        return { status: response.status, location: response.headers.get("location"), robots: response.headers.get("x-robots-tag"), contentType: response.headers.get("content-type"), bytes, body: bytes.toString("utf8"), observedAt: new Date().toISOString() };
      })());
      return cache.get(key);
    },
    invalidate(url, method = "GET") { cache.delete(`${method} ${url}`); },
  };
}

async function propagation(publication, cache, wait = pause, deadline = Infinity, now = Date.now) {
  const rawPolicyPaths = ["/data/eligibility-policy.json", "/assets/downloads/autopilot-runs-2026-09-02.csv"];
  const controlPaths = ["/robots.txt", "/sitemap-ja.xml", "/sitemap-en.xml"];
  const state = { ready: false, attempts: 0, maxAttempts: 18, intervalMs: 5000, rawPolicy: [], controls: [], publication: [] };
  for (let attempt = 0; attempt < 18; attempt++) {
    if (now() >= deadline) { state.error = "Publication propagation time budget exhausted"; break; }
    state.attempts++;
    state.rawPolicy = [];
    for (const url of rawPolicyPaths) {
      const row = { url };
      try {
        const response = await cache.snapshot(url, "HEAD", deadline);
        row.status = response.status;
        row.noindexObserved = noindex(response.robots);
        assert(row.status === 200 && row.noindexObserved, `${url}: raw-file noindex policy not ready`);
        row.ok = true;
      } catch (error) { row.ok = false; row.error = error.message; cache.invalidate(url, "HEAD"); }
      state.rawPolicy.push(row);
    }
    const controls = new Map();
    state.controls = [];
    for (const url of controlPaths) {
      const row = { url };
      try {
        const response = await cache.snapshot(url, "GET", deadline);
        row.status = response.status;
        assert.equal(response.status, 200, `${url}: publication crawl control not ready`);
        controls.set(url, response.body);
        row.ok = true;
      } catch (error) { row.ok = false; row.error = error.message; cache.invalidate(url); }
      state.controls.push(row);
    }
    const robots = controls.get("/robots.txt") || "", sitemap = (controls.get("/sitemap-ja.xml") || "") + (controls.get("/sitemap-en.xml") || "");
    state.publication = [];
    for (const target of publication) {
      let row;
      try {
        row = publicationResponse(target, await cache.snapshot(target.url, "GET", deadline));
        if (!row.ok) cache.invalidate(target.url);
        else if (target.kind === "html") {
          row = publicationCrawl(row, robots, sitemap);
          if (!robotsAllows(robots, target.url)) cache.invalidate("/robots.txt");
          if (!sitemap.includes(`<loc>${ORIGIN}${target.url}</loc>`)) {
            cache.invalidate("/sitemap-ja.xml");
            cache.invalidate("/sitemap-en.xml");
          }
        }
      } catch (error) { row = { ...target, ok: false, error: error.message }; cache.invalidate(target.url); }
      state.publication.push(row);
    }
    state.ready = [...state.rawPolicy, ...state.controls, ...state.publication].every(row => row.ok);
    if (state.ready) break;
    if (attempt < 17 && now() + 5000 < deadline) await wait(5000);
    else if (attempt < 17) { state.error = "Publication propagation time budget exhausted"; break; }
  }
  return state;
}

async function liveAudit(strict, { request = get, readBytes, wait = pause, now = Date.now,
  saveReport = report => writeFileSync(path.join(ROOT, "gsc-indexing-http-report.json"), JSON.stringify(report, null, 2) + "\n"),
  logReport = report => console.log(JSON.stringify(report, null, 2)) } = {}) {
  // Leave time to retain failure evidence before the existing ten-minute job limit.
  const deadline = now() + 8 * 60_000;
  const cache = snapshotCache(request, deadline), snapshot = cache.snapshot;
  const report = {
    mode: strict ? "production-verification" : "production-baseline", observedAt: new Date().toISOString(), sourceCommit: process.env.GITHUB_SHA || null,
    note: "HTTP serving checks; publication hashes attest only the listed asset bytes, not a whole-site revision, Google indexing or traffic impact",
    costUsd: null, costNote: "Ordinary CI and public HTTP verification; billed cost is not observed",
    expectedCases: cases.length, kinds: counts(), cases: [],
    publication: { required: strict, phase: strict ? "not-started" : "skipped-before-merge", expectedCases: publicationPaths.length, html: publicationPaths.filter(target => target.kind === "html").length, assets: publicationPaths.filter(target => target.kind === "asset").length, cases: [] },
  };
  try {
    // Candidate-only URLs are neither fetched nor required by the PR baseline.
    const publication = strict ? publicationTargets(readBytes) : [];
    if (strict) {
      report.publication.phase = "propagation";
      report.propagation = await propagation(publication, cache, wait, Math.min(deadline, now() + 3 * 60_000), now);
      report.publication.cases = report.propagation.publication;
      assert(report.propagation.ready, report.propagation.error || "Production publication or raw-file policy did not become ready within the bounded propagation check");
    }
    const robotsResponse = await snapshot("/robots.txt"), sitemapJaResponse = await snapshot("/sitemap-ja.xml"), sitemapEnResponse = await snapshot("/sitemap-en.xml");
    report.controls = [robotsResponse, sitemapJaResponse, sitemapEnResponse].map((response, index) => ({ url: ["/robots.txt", "/sitemap-ja.xml", "/sitemap-en.xml"][index], status: response.status, contentType: response.contentType, observedAt: response.observedAt }));
    assert.equal(robotsResponse.status, 200, "Live robots.txt must return 200");
    assert.equal(sitemapJaResponse.status, 200, "Live Japanese sitemap must return 200");
    assert.equal(sitemapEnResponse.status, 200, "Live English sitemap must return 200");
    const robots = robotsResponse.body, sitemap = sitemapJaResponse.body + sitemapEnResponse.body;
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
        if (c.kind === "data" || c.kind === "asset") {
          if (c.kind === "data") {
            assert(/application\/json/i.test(final.contentType || ""), `${c.to}: not a JSON response`);
            JSON.parse(final.body);
          } else {
            assert(/text\/csv/i.test(final.contentType || ""), `${c.to}: not a CSV response`);
            assert(final.body.length > 0, `${c.to}: empty CSV response`);
          }
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
    if (strict) {
      report.publication.phase = "verification";
      report.publication.cases = [];
      for (const target of publication) {
        try { report.publication.cases.push(publicationCrawl(publicationResponse(target, await snapshot(target.url)), robots, sitemap)); }
        catch (error) { report.publication.cases.push({ ...target, ok: false, error: error.message }); }
      }
    }
  } catch (error) { report.error = error.message; }
  finally {
    report.passed = report.cases.filter(c => c.ok).length;
    report.failed = report.cases.length - report.passed;
    report.skipped = cases.length - report.cases.length;
    report.publication.passed = report.publication.cases.filter(c => c.ok).length;
    report.publication.failed = report.publication.cases.length - report.publication.passed;
    report.publication.skipped = publicationPaths.length - report.publication.cases.length;
    if (report.publication.phase === "verification") report.publication.phase = report.publication.failed || report.publication.skipped ? "failed" : "verified";
    report.ok = !report.error && report.failed === 0 && report.skipped === 0 && (!strict || (report.publication.failed === 0 && report.publication.skipped === 0));
    saveReport(report);
    logReport(report);
  }
  assert(report.ok, report.error || `HTTP checks incomplete or failed: GSC ${report.failed} failed/${report.skipped} skipped, publication ${report.publication.failed} failed/${report.publication.skipped} skipped`);
  return report;
}

assert.equal(cases.length, 85, "Both complete supplied samples must remain covered");
assert.equal(new Set(cases.map(c => c.from)).size, 85, "Duplicate fixture URL");
assert.deepEqual(counts(), { redirect: 56, html: 15, data: 13, asset: 1 });
for (const c of cases) assert(c.from.startsWith("/") && c.to.startsWith("/") && !c.to.includes("?"));
if (process.argv.includes("--selftest")) await selftest();
else if (process.argv.includes("--live")) await liveAudit(true);
else if (process.argv.includes("--baseline")) await liveAudit(false);
else { await selftest(); await sourceAudit(); }
