// OneLink pilot guard (#1047, live 2026-10-15 11:31 JST). The pilot's AppsFlyer campaign (the short code) and its
// GA4 series (bridge_scope "pilot") are meant to count the nine hub hero anchors and nothing else. Before this
// guard no CI check compared the real checkout with that: tag-cta-placements.js and apply-cpp-ppid.js look only at
// direct App Store links, and scripts/site-route-inventory.mjs (#2100) runs in CI on fixtures only, skips admin/
// and assets/, ignores the short code outside an exact anchor href, classifies the QA link without ever failing on
// it and requires the tracker <script> tag. A hand edit of one generated translation was already red
// (build_site_translations.py --check), but a hero reverted in the source page and regenerated, or the short link
// or the pilot label copied to another page, script or redirect, would pass and quietly change what is counted.
//
// growth/onelink-pilot.json is the switch. `active` pins the nine anchors; `rolled_back`, flipped in the PR that
// restores the heroes (growth/ONELINK_PILOT.md 「不具合時の戻し方」), requires the pilot code and labels to be gone.
// Read: <a> start-tag attributes outside comments, raw-text elements and templates, and whole-token occurrences
// of the two short codes in every site file after decoding the usual escapes. Not read: the tracker <script> tag,
// labels, text or layout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { internalPrefixes } from '../../scripts/check-publication.mjs';
import siteFileHelpers from '../../scripts/lib/site-files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST_PATH = 'growth/onelink-pilot.json';
export const STATES = Object.freeze(['active', 'rolled_back']);
// The only file that may hold the QA code: the tracker compares the clicked path with it so that the QA link is
// always reported as bridge_scope "qa" (js/app-store-tracking.js bridgeDims).
export const QA_CLASSIFIER_FILE = 'js/app-store-tracking.js';
// GA4 counts a click or impression as the pilot's when the anchor has data-app-route="onelink" and
// data-app-traffic="pilot" and its href is a /it5q/<8 characters> short link other than the QA one
// (js/app-store-tracking.js bridgeDims; growth/sql/analytics/ga4-funnel.sql saw_onelink / clicked_onelink).
// The short code is not part of that test, so the label itself is pinned: these manifest attributes (with
// data-cta-variant, the pilot's variant label) may sit only on the hero anchors while active, and nowhere once
// rolled back (the documented rollback removes the first two and sets the variant back to v1).
export const PILOT_MARKERS = Object.freeze(['data-app-route', 'data-app-traffic', 'data-cta-variant']);
const SHORT_URL = /^https:\/\/([a-z0-9-]+\.onelink\.me)\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/;
// Not text, never scanned. QR payloads are not decoded (same limit as site-route-inventory).
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|m4a|zip|gz|pdf)$/i;
const HTML = /\.html?$/i;
// Dot entries are not site content, except .well-known (served for app links).
const SERVED_DOT = new Set(['.well-known']);
// Comments, raw-text elements and inert templates hold no clickable anchor.
const INERT = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
const START_A = /<a(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const codePoint = n => Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : null;

function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (all, entity) => {
    const names = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (entity[0] !== '#') return names[entity.toLowerCase()];
    return codePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))) ?? all;
  });
}

/** Attribute name (lower-cased) → every value it was given. HTML keeps only the first; duplicates are reported. */
function attributes(tag) {
  const out = new Map();
  const body = tag.replace(/^<a/i, '').replace(/\/?\s*>$/, '');
  for (const [, name, dq, sq, bare] of body.matchAll(ATTRIBUTE)) {
    const key = name.toLowerCase();
    out.set(key, [...(out.get(key) ?? []), decode(dq ?? sq ?? bare ?? '')]);
  }
  return out;
}

const anchors = html => [...html.replace(INERT, ' ').matchAll(START_A)].map(([tag]) => attributes(tag));

// Copies in another spelling count too: numeric character references (with or without the semicolon), percent
// encoding (repeated, as in a link nested inside a share URL) and JavaScript escapes are decoded, and the code is
// matched without regard to case. A link assembled at run time from separate pieces is still not seen.
export function normalise(text) {
  let out = text, previous = null;
  for (let round = 0; round < 4 && out !== previous; round++) {
    previous = out;
    out = out.replace(/&#x([0-9a-f]+);?|&#(\d+);?/gi, (all, hex, dec) => codePoint(hex ? parseInt(hex, 16) : Number(dec)) ?? all)
      .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (all, braced, u, x) => codePoint(parseInt(braced ?? u ?? x, 16)) ?? all)
      .replace(/\\\//g, '/')
      .replace(/%([0-9a-f]{2})/gi, (all, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return out;
}
// Whole-token count anywhere in the (normalised) file: href, text, comments, scripts, JSON, a query string or
// another host.
const occurrences = (text, code) => text.match(new RegExp(`(?<![A-Za-z0-9])${code}(?![A-Za-z0-9])`, 'gi'))?.length ?? 0;
const hasMarker = (anchor, name, value) => (anchor.get(name) ?? []).some(v => v.trim().toLowerCase() === value.toLowerCase());

/** Shape only. A missing, malformed or unknown manifest is never read as rolled back. */
export function manifestProblems(m) {
  if (!plain(m)) return [`${MANIFEST_PATH} がオブジェクトでない`];
  const problems = [];
  if (!STATES.includes(m.state)) problems.push(`${MANIFEST_PATH} の state は ${STATES.join(' / ')} のどちらか（読めない値を rolled_back と読まない）`);
  const pilot = SHORT_URL.exec(m.short_url ?? ''), qa = SHORT_URL.exec(m.qa_short_url ?? '');
  if (!pilot || !qa || pilot[3].toLowerCase() === qa[3].toLowerCase()) problems.push(`${MANIFEST_PATH} の short_url / qa_short_url が OneLink の別々の短縮URLでない`);
  const a = m.anchor;
  if (!plain(a) || typeof a.class_token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(a.class_token) || !plain(a.attributes)
    || !Object.keys(a.attributes).length || Object.entries(a.attributes).some(([k, v]) => !/^data-[a-z0-9-]+$/.test(k) || typeof v !== 'string' || !v)
    || PILOT_MARKERS.some(k => !Object.hasOwn(a.attributes, k))) {
    problems.push(`${MANIFEST_PATH} の anchor は class_token（1語）と attributes（data-* と空でない値の組。${PILOT_MARKERS.join('・')} を含む）`);
  }
  if (!Array.isArray(m.pages) || !m.pages.length || new Set(m.pages).size !== m.pages.length
    || m.pages.some(p => typeof p !== 'string' || !HTML.test(p) || !/^[^/\\][^\\]*$/.test(p) || p.split('/').some(s => !s || s === '.' || s === '..'))) {
    problems.push(`${MANIFEST_PATH} の pages は重複の無い .html の相対パスの一覧`);
  }
  if (!plain(m.qa_classifier_files) || Object.entries(m.qa_classifier_files)
    .some(([file, why]) => file !== QA_CLASSIFIER_FILE || typeof why !== 'string' || !why.trim())) {
    problems.push(`${MANIFEST_PATH} の qa_classifier_files に書けるのは ${QA_CLASSIFIER_FILE}（QAの短縮パスで分類する計測スクリプト）と理由だけ（QAのリンクを配るファイルを例外にしない）`);
  }
  return problems;
}

/**
 * Site files: everything Pages publishes or routes from (including _redirects, _headers and functions/), minus
 * what functions/_middleware.js answers 404 for: INTERNAL_PREFIXES, /CLAUDE.md and the data/*.json files
 * data/publication-policy.json does not serve. Other dot entries, node_modules and binary files are not read.
 */
export function siteFiles(root = ROOT) {
  const prefixes = internalPrefixes(read(root, 'functions/_middleware.js'));
  if (!prefixes?.length) throw new Error('functions/_middleware.js の INTERNAL_PREFIXES を読めない — 配信の境界が分からないまま見張らない');
  const policy = JSON.parse(read(root, 'data/publication-policy.json'));
  if (!plain(policy?.files)) throw new Error('data/publication-policy.json の files を読めない');
  const unserved = new Set(Object.entries(policy.files).filter(([, v]) => v?.served_by_site === false).map(([f]) => `data/${f}`));
  const internal = rel => prefixes.some(p => `/${rel}` === p || `/${rel}`.startsWith(p + '/'));
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if ((entry.name.startsWith('.') && !(dir === '' && SERVED_DOT.has(entry.name))) || entry.name === 'node_modules' || internal(rel)) continue;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile() && rel !== 'CLAUDE.md' && !unserved.has(rel) && !BINARY.test(rel)) out.push(rel);
    }
  };
  walk('');
  return out.sort();
}

/** Returns [] when the checkout matches the manifest; otherwise one line per problem. */
export function pilotGuardProblems({ root = ROOT } = {}) {
  let m;
  try { m = JSON.parse(read(root, MANIFEST_PATH)); }
  catch { return [`${MANIFEST_PATH} を読めない — 無い・壊れた manifest を「戻した」とは読まない`]; }
  const problems = manifestProblems(m);
  if (problems.length) return problems;
  let files;
  try { files = siteFiles(root); } catch (error) { return [error.message]; }
  const [, host, template, code] = SHORT_URL.exec(m.short_url), [, qaHost, qaTemplate, qaCode] = SHORT_URL.exec(m.qa_short_url);
  const qaUrl = new RegExp(`${qaHost.replaceAll('.', '\\.')}/${qaTemplate}/${qaCode}(?![A-Za-z0-9])`, 'i');
  const active = m.state === 'active', hubs = new Set(active ? m.pages : []), present = new Set(files);
  const markers = PILOT_MARKERS.map(name => [name, m.anchor.attributes[name]]);
  for (const page of hubs) if (!present.has(page)) problems.push(`${page}: pilot の対象ページがサイトのファイルに無い（state が active の間は ${m.pages.length} ページとも要る）`);
  for (const file of files) {
    const raw = read(root, file), text = normalise(raw), seen = occurrences(text, code);
    if (occurrences(text, qaCode)) {
      if (!Object.hasOwn(m.qa_classifier_files, file)) {
        problems.push(`${file}: QA の短縮コード ${qaCode} がある — QAと本番のクリックを混ぜない（例外は ${MANIFEST_PATH} の qa_classifier_files だけ）`);
      } else if (qaUrl.test(text)) {
        problems.push(`${file}: QA の短縮URLそのもの（${qaHost}/${qaTemplate}/${qaCode}）がある — 例外のファイルでも、置けるのは分類に使うパスだけ`);
      }
    }
    const list = HTML.test(file) ? anchors(raw) : [];
    const hits = hubs.has(file) ? list.filter(a => a.get('href')?.[0] === m.short_url) : [];
    // The pilot label outside the hero anchors (any page, any href, including other short codes and Apple links).
    for (const anchor of list) {
      if (hits.includes(anchor)) continue;
      const carried = markers.filter(([name, value]) => hasMarker(anchor, name, value));
      if (carried.length) {
        problems.push(`${file}: pilot の目印（${carried.map(([n, v]) => `${n}="${v}"`).join(' ')}）を持つ <a> がある（href ${anchor.get('href')?.[0] ?? '無し'}） — `
          + (active ? `GA4 は短縮コードを問わずこの目印で pilot と数える。目印は ${MANIFEST_PATH} の pages の冒頭ボタンだけ`
            : `state は rolled_back。戻したら目印も外す（data-app-route / data-app-traffic を外し、variant を v1 に）`));
      }
    }
    if (!hubs.has(file)) {
      if (seen) problems.push(`${file}: pilot の短縮コード ${code} がある — `
        + (active ? `pilot は ${MANIFEST_PATH} の pages の冒頭ボタンだけ` : `state は rolled_back。戻したらサイトのどこにも置かない`));
      continue;
    }
    if (hits.length !== 1) {
      problems.push(`${file}: href がちょうど ${m.short_url} の <a> が ${hits.length} 個（冒頭ボタンの1個だけのはず。コメント・script・template の中は数えない）`);
      continue;
    }
    const hero = hits[0], values = name => hero.get(name) ?? [];
    for (const [name, value] of Object.entries(m.anchor.attributes)) {
      const got = values(name);
      if (got.length !== 1 || got[0] !== value) problems.push(`${file}: pilot の <a> の ${name} が "${value}" の1つでない（${got.length ? got.map(v => `"${v}"`).join(', ') : '無し'}）`);
    }
    const classes = values('class');
    if (classes.length !== 1 || !classes[0].split(/\s+/).includes(m.anchor.class_token)) {
      problems.push(`${file}: pilot の <a> の class に ${m.anchor.class_token} が無い（${classes.length ? classes.map(v => `"${v}"`).join(', ') : '無し'}）`);
    }
    if (values('href').length !== 1) problems.push(`${file}: pilot の <a> に href が ${values('href').length} 個ある`);
    if (seen !== 1) problems.push(`${file}: pilot の短縮コード ${code} が冒頭ボタンの href のほかにもある（${seen} か所。コメント・本文・スクリプトと、別の書き方も数える）`);
  }
  return problems;
}

// The site's own page-to-URL rule (scripts/lib/site-files.js), as measurement_changes scopes are written.
const urlPath = page => siteFileHelpers.toUrlPath('/', '/' + page);

/**
 * The manifest against growth/experiments/experiments.json measurement_changes. `measurement_change` names the
 * record of the scope that went live; `pages` must equal its scope. A scope change is recorded only after it is
 * live, with the actual start time (growth/ONELINK_PILOT.md: never the preparation date; version names carry the
 * start date), so the PR that changes the pages only sets `unrecorded_scope_change` to a short note. The record
 * appended later is found by its scope, not by a name chosen in advance: once a measurement_route_change record
 * after the current one has the same scope as `pages`, `measurement_change` must point at it and the note must go.
 */
export function measurementRecordProblems(m, measurementChanges) {
  if (!plain(m) || !Array.isArray(m.pages) || !Array.isArray(measurementChanges)) return ['manifest か measurement_changes を読めない'];
  const at = measurementChanges.findIndex(c => c?.version === m.measurement_change);
  const recorded = measurementChanges.filter(c => c?.version === m.measurement_change);
  if (typeof m.measurement_change !== 'string' || recorded.length !== 1 || recorded[0].type !== 'measurement_route_change' || !Array.isArray(recorded[0].scope)) {
    return [`measurement_changes に版 ${m.measurement_change} の measurement_route_change がちょうど1件ない`];
  }
  const pages = m.pages.map(urlPath).sort();
  const covers = c => c?.type === 'measurement_route_change' && Array.isArray(c.scope)
    && c.scope.length === pages.length && [...c.scope].sort().every((p, i) => p === pages[i]);
  const note = m.unrecorded_scope_change ?? null;
  if (note === null) {
    return covers(recorded[0]) ? [] : [`pages（${pages.join(' ')}）が記録 ${m.measurement_change} の scope（${[...recorded[0].scope].sort().join(' ')}）と違う — `
      + '範囲を変えるPRは unrecorded_scope_change に短い説明を書き、本番反映の後で記録する'];
  }
  if (typeof note !== 'string' || !note.trim()) return ['unrecorded_scope_change は null か、まだ記録していない範囲変更の短い説明'];
  if (covers(recorded[0])) return [`pages が記録 ${m.measurement_change} の scope と同じなのに unrecorded_scope_change が残っている`];
  const later = measurementChanges.slice(at + 1).find(covers);
  return later ? [`記録 ${later.version} が pages と同じ scope で足された — 同じPRで measurement_change をその版にし、unrecorded_scope_change を null に戻す`] : [];
}
