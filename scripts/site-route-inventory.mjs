#!/usr/bin/env node
// Source inventory only. Never visits a link, decodes a QR, or runs a collector.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import siteFiles from './lib/site-files.js';

const { collectHtmlFiles, toUrlPath, pageKey } = siteFiles;
const SITE = 'https://simplememofast.com';
const PILOT = 'https://simplememofast.onelink.me/it5q/l250gib4';
const QA_PATH = '/it5q/4x0jfkpw';
export const SITEWIDE_CAMPAIGN = 'website_bridge_v1';
export const EXCLUDED_DIRECTORIES = Object.freeze([
  'admin', 'docs', 'fixtures', 'scripts', 'assets', 'tools', 'growth', 'drafts', 'node_modules', 'build',
]);
const PILOT_FILES = ['obsidian/index.html', ...['ar', 'es', 'id', 'ko', 'pt-BR', 'tr', 'zh', 'zh-Hant']
  .map(locale => `${locale}/obsidian/index.html`)];
const ROUTES = ['direct_apple', 'onelink_pilot', 'onelink_sitewide', 'onelink_qa',
  'onelink_unclassified', 'smart_app_banner', 'qr_image', 'universal_link',
  'localized_app_utility', 'web_app', 'custom_app_scheme', 'app_link_placeholder'];

function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (all, entity) => {
    const names = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (entity[0] !== '#') return names[entity.toLowerCase()];
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
  });
}

function attributes(tag) {
  const result = {};
  const body = tag.replace(/^<\/?[\w:-]+/, '').replace(/\/?\s*>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of body.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    // HTML uses the first duplicate attribute, not the last one.
    if (!Object.hasOwn(result, name)) result[name] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

export function isPublicSourcePath(file) {
  if (typeof file !== 'string' || !file.endsWith('.html') || file.includes('\\') || file.startsWith('/')) return false;
  const parts = file.split('/');
  return parts.every(part => part && !part.startsWith('.'))
    && (parts.length === 1 || !EXCLUDED_DIRECTORIES.includes(parts[0]));
}

/** Classify declared URLs; this does not validate provider configuration or traffic. */
export function classifyAcquisitionUrl(href, { pageUrl = SITE + '/', sitewideCampaigns = [SITEWIDE_CAMPAIGN] } = {}) {
  if (typeof href !== 'string' || !href.trim() || href.trim().startsWith('#')) return null;
  let url;
  try { url = new URL(decode(href.trim()), pageUrl); } catch { return null; }
  if (url.username || url.password) return null;
  const web = ['http:', 'https:'].includes(url.protocol);
  if (web && url.hostname === 'apps.apple.com' && /\/id6758438948(?:\/|$)/.test(url.pathname))
    return { route: 'direct_apple', https: url.protocol === 'https:' };
  if (url.origin === 'https://simplememofast.onelink.me') {
    const template = /^\/it5q(?:\/[A-Za-z0-9]{8})?\/?$/.test(url.pathname);
    if (!template) return { route: 'onelink_unclassified', reason: 'other_template_or_path' };
    const sources = url.searchParams.getAll('pid'), campaigns = url.searchParams.getAll('c');
    if (url.pathname.replace(/\/$/, '') === QA_PATH || sources.includes('seo_aio_qa') || campaigns.includes('obsidian_bridge_qa_20260907'))
      return { route: 'onelink_qa' };
    if (url.href === PILOT) return { route: 'onelink_pilot', exact_reserved_url: true };
    // A query override on the reserved pilot link must not silently become sitewide.
    if (url.pathname.replace(/\/$/, '') === '/it5q/l250gib4')
      return { route: 'onelink_unclassified', reason: 'reserved_pilot_url_modified' };
    if (sources.length === 1 && sources[0] === 'owned_web' && campaigns.length === 1
      && sitewideCampaigns.includes(campaigns[0])) return { route: 'onelink_sitewide' };
    return { route: 'onelink_unclassified', reason: 'campaign_not_verified_in_source_allowlist' };
  }
  if (web && ['simplememofast.com', 'www.simplememofast.com'].includes(url.hostname)) {
    const route = pageKey(url.pathname);
    if (['/compose', '/verify'].includes(route)) return { route: 'universal_link' };
    if (/^\/(?:ar|en|es|id|ko|pt-BR|tr|zh|zh-Hant)\/(?:compose|verify)$/.test(route))
      return { route: 'localized_app_utility' };
    if (route === '/memo-inbox') return { route: 'web_app' };
  }
  if (['simplememo:', 'simplememoapp:'].includes(url.protocol)) return { route: 'custom_app_scheme' };
  return null;
}

/** Small static tokenizer: comments, raw-text elements and inert templates are not anchors. */
export function inspectPage({ file, html }, options = {}) {
  const route = toUrlPath('/', '/' + file);
  const page = { file, route, meta_noindex: false, store_tracker_script_declared: false,
    sitewide_opt_in_declared: false, offline_predicate_evaluated: false,
    placements: [], qr_assets: [] };
  const anchors = [], trackerDeclarations = [];
  let inHead = false, templateDepth = 0;
  const tokens = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<\/?[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  for (const match of html.matchAll(tokens)) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    const name = /^<\/?([\w:-]+)/.exec(token)[1].toLowerCase();
    const closing = token.startsWith('</');
    if (name === 'template') { templateDepth += closing ? -Math.min(1, templateDepth) : 1; continue; }
    if (templateDepth) continue;
    if (name === 'head') { inHead = !closing; continue; }
    if (closing) continue;
    const opening = /^<(?:[^>"']|"[^"]*"|'[^']*')*>/.exec(token)?.[0];
    if (!opening) continue;
    const a = attributes(opening);
    if (name === 'script' && a.src) {
      try {
        const src = new URL(a.src, SITE + route);
        if (src.origin === SITE && src.pathname === '/js/app-store-tracking.js') {
          page.store_tracker_script_declared = true;
          trackerDeclarations.push(a);
          if (a['data-sitewide-app-routes'] === 'true') page.sitewide_opt_in_declared = true;
        }
      } catch { /* malformed source is not a tracker declaration */ }
    }
    if (name === 'meta' && inHead) {
      if ((a.name ?? '').toLowerCase() === 'robots' && /\bnoindex\b/i.test(a.content ?? '')) page.meta_noindex = true;
      if ((a.name ?? '').toLowerCase() === 'apple-itunes-app'
        && /(?:^|,\s*)app-id=6758438948(?:,|$)/.test(a.content ?? '')) page.placements.push({ route: 'smart_app_banner' });
    }
    if (name === 'img' && a.src) {
      try {
        const src = new URL(a.src, SITE + route);
        if (src.origin === SITE && /^\/assets\/img\/qr-[^/]+\.(?:svg|png|webp|jpe?g)$/i.test(src.pathname)) {
          page.placements.push({ route: 'qr_image' }); page.qr_assets.push(src.pathname);
        }
      } catch { /* not a declared local QR asset */ }
    }
    if (name !== 'a') continue;
    const entry = { attrs: a, placement: null }; anchors.push(entry);
    if (a.href === '#' && /^appLink(?:Ja|En)$/.test(a.id ?? '')) {
      page.placements.push({ route: 'app_link_placeholder' }); continue;
    }
    const classified = classifyAcquisitionUrl(a.href, { ...options, pageUrl: SITE + route });
    if (!classified) continue;
    entry.placement = { ...classified, placement: a['data-cta-placement'] ?? null,
      cluster: a['data-cta-cluster'] ?? null, variant: a['data-cta-variant'] ?? null,
      app_route: a['data-app-route'] ?? null, app_scope: a['data-app-traffic'] ?? null };
    page.placements.push(entry.placement);
  }
  evaluateRoutes(page, anchors, trackerDeclarations, options.trackerScript);
  return page;
}

/** Run this repository's tracker against detached mock anchors, without events or browser/network APIs.
 * The source is an explicit input, compiled once by buildRouteInventory; only status labels leave the mock.
 * This evaluates conversion eligibility, not browser execution, visibility, consent or event delivery.
 */
function evaluateRoutes(page, entries, declarations, script) {
  let excluded = !page.store_tracker_script_declared ? 'excluded_tracker_missing'
    : !page.sitewide_opt_in_declared ? 'excluded_not_opted_in'
      : declarations.length !== 1 ? 'unevaluated_multiple_tracker_declarations'
        : !script ? 'unevaluated_tracker_source_missing' : null;
  const relevant = entries.filter(e => e.placement && (e.placement.route === 'direct_apple'
    || e.placement.route.startsWith('onelink_')));
  if (excluded) {
    for (const entry of relevant) entry.placement.offline_route_status = excluded;
    return;
  }
  const mockAnchors = entries.map(entry => {
    const attrs = { ...entry.attrs };
    return { getAttribute: name => Object.hasOwn(attrs, name) ? attrs[name] : null,
      hasAttribute: name => Object.hasOwn(attrs, name), setAttribute: (name, value) => { attrs[name] = String(value); } };
  });
  const selected = anchor => (anchor.getAttribute('href') ?? '').includes('apps.apple.com')
    || anchor.getAttribute('data-app-route') === 'onelink' || anchor.hasAttribute('data-next-step');
  const expectedSelector = 'a[href*="apps.apple.com"],a[data-app-route="onelink"],a[data-next-step]';
  const sandbox = { URL, location: Object.freeze({ hostname: 'simplememofast.com',
    href: SITE + page.route, pathname: page.route }), document: {
    currentScript: { getAttribute: name => declarations[0][name] ?? null },
    readyState: 'complete', addEventListener() {},
    querySelectorAll(selector) {
      if (selector !== expectedSelector) throw new Error('Tracker selector changed; update inventory DOM mock');
      return mockAnchors.filter(selected);
    },
  } };
  sandbox.window = sandbox;
  script.runInNewContext(sandbox, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
  page.offline_predicate_evaluated = true;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i], anchor = mockAnchors[i];
    if (!relevant.includes(entry)) continue;
    let status = anchor.getAttribute('data-sitewide-app-route-status');
    if (status && !/^(?:converted|unsupported-[a-z-]+)$/.test(status))
      throw new Error('Unexpected tracker status; update inventory contract');
    if (!status) status = entry.attrs['data-app-route'] === 'onelink'
      ? (anchor.getAttribute('href') === entry.attrs.href ? 'preserved_existing_onelink' : 'unexpected_existing_route_change')
      : anchor.hasAttribute('data-next-step') ? 'excluded_next_step' : !selected(anchor)
        ? 'excluded_tracker_selector' : 'unevaluated_no_status';
    entry.placement.offline_route_status = status;
  }
}

/** Read only <url><loc> entries, not sitemap-index references or alternate hrefs. */
export function sitemapUrls(xml) {
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<(?:\w+:)?urlset\b/i.test(clean)) return [];
  return [...clean.matchAll(/<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc\s*>/gi)]
    .flatMap(match => {
      try {
        const url = new URL(decode(match[1].trim()));
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
          && ['simplememofast.com', 'www.simplememofast.com'].includes(url.hostname) ? [url.href] : [];
      } catch { return []; }
    });
}

function summarize(pages) {
  const routes = Object.fromEntries(ROUTES.map(route => [route, {
    pages: 0, placements: 0, pages_with_tracker_script: 0, placements_on_pages_with_tracker_script: 0,
  }]));
  for (const page of pages) for (const route of ROUTES) {
    const count = page.placements.filter(p => p.route === route).length;
    if (!count) continue;
    const row = routes[route]; row.pages++; row.placements += count;
    if (page.store_tracker_script_declared) { row.pages_with_tracker_script++; row.placements_on_pages_with_tracker_script += count; }
  }
  const direct = pages.flatMap(page => page.placements.filter(p => p.route === 'direct_apple'));
  const statuses = {};
  for (const placement of direct) {
    const status = placement.offline_route_status;
    statuses[status] = (statuses[status] ?? 0) + 1;
  }
  return { pages: pages.length, meta_noindex_pages: pages.filter(p => p.meta_noindex).length,
    pages_with_tracker_script: pages.filter(p => p.store_tracker_script_declared).length,
    unique_qr_assets: new Set(pages.flatMap(p => p.qr_assets)).size,
    sitewide_runtime: { opt_in_pages: pages.filter(p => p.sitewide_opt_in_declared).length,
      offline_predicate_evaluated_pages: pages.filter(p => p.offline_predicate_evaluated).length,
      eligible_direct_placements: statuses.converted ?? 0,
      eligible_direct_pages: pages.filter(p => p.placements.some(a => a.route === 'direct_apple' && a.offline_route_status === 'converted')).length,
      direct_placement_statuses: statuses }, routes };
}

/** Pure aggregation over supplied public HTML bytes; no file/network/provider access. */
export function buildRouteInventory({ pages, urls = [], trackerSource = null, ...options }) {
  const keys = new Set(urls.flatMap(value => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        && ['simplememofast.com', 'www.simplememofast.com'].includes(url.hostname) ? [pageKey(url.pathname)] : [];
    } catch { return []; }
  }));
  const trackerScript = trackerSource === null ? null : new vm.Script(trackerSource, { filename: 'app-store-tracking.js' });
  const files = new Set();
  const inspected = pages.filter(p => isPublicSourcePath(p.file)).map(input => {
    if (files.has(input.file)) throw new Error('Duplicate source page: ' + input.file);
    files.add(input.file);
    const page = inspectPage(input, { ...options, trackerScript }); page.sitemap_listed = keys.has(pageKey(page.route)); return page;
  }).sort((a, b) => a.file.localeCompare(b.file));
  const pilot = inspected.flatMap(page => page.placements.filter(p => p.route === 'onelink_pilot')
    .map(p => ({ file: page.file, placement: p.placement, app_route: p.app_route, app_scope: p.app_scope,
      variant: p.variant, cluster: p.cluster, tracker_script: page.store_tracker_script_declared })));
  const exact = pilot.length === 9 && PILOT_FILES.every(file => pilot.filter(p => p.file === file
    && p.placement === 'hero' && p.app_route === 'onelink' && p.app_scope === 'pilot'
    && p.variant === 'onelink_v1' && p.cluster === 'obsidian' && p.tracker_script).length === 1);
  return { schema_version: 1, evidence_kind: 'source_declared', live_verified: false, traffic_coverage: null,
    offline_runtime_evaluation: { tracker_source_sha256: trackerSource === null ? null
      : createHash('sha256').update(trackerSource).digest('hex'), browser_executed: false,
      network_access: false, events_dispatched: false },
    definitions: { page: 'One public-source HTML file; sitemap membership uses normalized route keys.',
      placement: 'One declared anchor/meta/img node, including hidden or responsive duplicates; categories may overlap.',
      excluded_root_directories: EXCLUDED_DIRECTORIES, tracker: 'Local script tag presence only, not execution, consent, route support or event delivery.',
      qr: 'Local qr-* image references only; payloads are not decoded.',
      direct_apple: 'Source href count, including links eligible for runtime OneLink conversion; not an unsupported-link count.',
      runtime_eligible: 'Actual local tracker applied to detached anchor mocks on an opted-in page; no navigation or events.',
      sitewide_campaigns: options.sitewideCampaigns ?? [SITEWIDE_CAMPAIGN] },
    public_source: summarize(inspected), sitemap_listed: summarize(inspected.filter(p => p.sitemap_listed)),
    pilot: { expected_placements: 9, state: exact ? 'source_matches_nine_hero_contract' : 'source_differs_from_nine_hero_contract', placements: pilot },
    excluded_from_anchor_expansion: ['smart_app_banner', 'qr_image', 'universal_link', 'localized_app_utility', 'web_app', 'custom_app_scheme', 'app_link_placeholder'],
    limitations: ['No published-page, exposure, traffic, install or first-launch coverage is inferred.',
      'Native Safari banner taps and QR scans do not become page anchor click events.',
      'Dynamic navigation and rendered visibility are not evaluated; source placeholders are separate.',
      'Offline conversion eligibility does not establish deployed script execution or provider redirect behavior.',
      'Existing pilot/QA series remain distinct from sitewide; modified reserved pilot URLs are unclassified.'],
    pages: inspected };
}

function readSource(file, root) {
  const stat = fs.lstatSync(file), resolved = fs.realpathSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !resolved.startsWith(root + path.sep))
    throw new Error('Source must be a regular file inside root: ' + file);
  return fs.readFileSync(file, 'utf8');
}

export function main(args = process.argv.slice(2)) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), output = null, summaryOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (['--root', '--output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (args[i] === '--root') root = path.resolve(args[++i]); else output = path.resolve(args[++i]);
    } else if (args[i] === '--summary-only') summaryOnly = true;
    else throw new Error('Usage: site-route-inventory.mjs [--root DIR] [--output FILE] [--summary-only]');
  }
  root = fs.realpathSync(root);
  // Exclusions apply at the project root. /vs/drafts/ is a real public
  // comparison page, while /drafts/ is an unpublished workspace directory.
  const files = fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || EXCLUDED_DIRECTORIES.includes(entry.name)) return [];
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? collectHtmlFiles(file, { tolerateReadErrors: false })
      : entry.name.endsWith('.html') ? [file] : [];
  });
  const pages = files.map(file => ({ file: path.relative(root, file).split(path.sep).join('/'), html: readSource(file, root) }));
  const urls = ['sitemap.xml', 'sitemap-ja.xml', 'sitemap-en.xml', 'sitemap-locales.xml'].flatMap(name => {
    const file = path.join(root, name); return fs.existsSync(file) ? sitemapUrls(readSource(file, root)) : [];
  });
  const trackerFile = path.join(root, 'js', 'app-store-tracking.js');
  const trackerSource = fs.existsSync(trackerFile) ? readSource(trackerFile, root) : null;
  const result = buildRouteInventory({ pages, urls, trackerSource });
  result.generated_at = new Date().toISOString(); result.source_kind = 'local_public_source_files';
  result.snapshot_atomic = false;
  if (summaryOnly) delete result.pages;
  const serialized = JSON.stringify(result, null, 2) + '\n';
  if (output) fs.writeFileSync(output, serialized, { flag: 'wx' }); else process.stdout.write(serialized);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
