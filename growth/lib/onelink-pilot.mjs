// OneLink pilot guard (#1047, live 2026-10-15 11:31 JST). The pilot's AppsFlyer campaign is meant to count the
// nine hub hero anchors and nothing else. Before this guard nothing in CI read the real checkout:
// tag-cta-placements.js and apply-cpp-ppid.js look only at direct App Store links, and scripts/site-route-inventory.mjs (#2100) runs in
// CI on fixtures only, skips admin/ and assets/, ignores the short code outside an exact anchor href, never looks
// at the QA link and requires the tracker <script> tag. A hero reverted by a regenerated translation, or the short
// link copied to another page, script or redirect, would pass and quietly change what the campaign counts.
//
// growth/onelink-pilot.json is the switch. `active` pins the nine anchors; `rolled_back`, flipped in the PR that
// restores the heroes (growth/ONELINK_PILOT.md 「不具合時の戻し方」), requires the pilot code to be gone.
// Read: <a> start-tag attributes outside comments, raw-text elements and templates, and whole-token occurrences
// of the two short codes in every site file. Not read: the tracker <script> tag, labels, text or layout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { internalPrefixes } from '../../scripts/check-publication.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MANIFEST_PATH = 'growth/onelink-pilot.json';
export const STATES = Object.freeze(['active', 'rolled_back']);
const SHORT_URL = /^https:\/\/[a-z0-9-]+\.onelink\.me\/[A-Za-z0-9]+\/([A-Za-z0-9]+)$/;
// Not text, never scanned. QR payloads are not decoded (same limit as site-route-inventory).
const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|m4a|zip|gz|pdf)$/i;
// Dot entries are not site content, except .well-known (served for app links).
const SERVED_DOT = new Set(['.well-known']);
// Comments, raw-text elements and inert templates hold no clickable anchor.
const INERT = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|template)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?(?:<\/\1\s*>|$)/gi;
const START_A = /<a(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);

function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (all, entity) => {
    const names = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (entity[0] !== '#') return names[entity.toLowerCase()];
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
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
// Whole-token count anywhere in the file (href, text, comments, scripts, JSON), so a copy cannot hide behind
// another URL form, a query string or a different host.
const occurrences = (text, code) => text.match(new RegExp(`(?<![A-Za-z0-9])${code}(?![A-Za-z0-9])`, 'g'))?.length ?? 0;

/** Shape only. A missing, malformed or unknown manifest is never read as rolled back. */
export function manifestProblems(m) {
  if (!plain(m)) return [`${MANIFEST_PATH} がオブジェクトでない`];
  const problems = [];
  if (!STATES.includes(m.state)) problems.push(`${MANIFEST_PATH} の state は ${STATES.join(' / ')} のどちらか（読めない値を rolled_back と読まない）`);
  const pilot = SHORT_URL.exec(m.short_url ?? ''), qa = SHORT_URL.exec(m.qa_short_url ?? '');
  if (!pilot || !qa || pilot[1] === qa[1]) problems.push(`${MANIFEST_PATH} の short_url / qa_short_url が OneLink の別々の短縮URLでない`);
  const a = m.anchor;
  if (!plain(a) || typeof a.class_token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(a.class_token) || !plain(a.attributes)
    || !Object.keys(a.attributes).length || Object.entries(a.attributes).some(([k, v]) => !/^data-[a-z0-9-]+$/.test(k) || typeof v !== 'string' || !v)) {
    problems.push(`${MANIFEST_PATH} の anchor は class_token（1語）と attributes（data-* と空でない値の組）`);
  }
  if (!Array.isArray(m.pages) || !m.pages.length || new Set(m.pages).size !== m.pages.length
    || m.pages.some(p => typeof p !== 'string' || !/^[^/\\][^\\]*\.html$/.test(p) || p.split('/').some(s => !s || s === '.' || s === '..'))) {
    problems.push(`${MANIFEST_PATH} の pages は重複の無い .html の相対パスの一覧`);
  }
  if (!plain(m.qa_classifier_files) || Object.entries(m.qa_classifier_files)
    .some(([file, why]) => /\.html?$/i.test(file) || typeof why !== 'string' || !why.trim())) {
    problems.push(`${MANIFEST_PATH} の qa_classifier_files は「非HTMLのファイル → 理由」の組（QAのリンクは公開HTMLに置かない）`);
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
  const [, code] = SHORT_URL.exec(m.short_url), [, qaCode] = SHORT_URL.exec(m.qa_short_url);
  const active = m.state === 'active', hubs = new Set(active ? m.pages : []), present = new Set(files);
  for (const page of hubs) if (!present.has(page)) problems.push(`${page}: pilot の対象ページがサイトのファイルに無い（state が active の間は ${m.pages.length} ページとも要る）`);
  for (const file of files) {
    const text = read(root, file), seen = occurrences(text, code);
    if (occurrences(text, qaCode) && !Object.hasOwn(m.qa_classifier_files, file)) {
      problems.push(`${file}: QA の短縮コード ${qaCode} がある — QAと本番のクリックを混ぜない（例外は ${MANIFEST_PATH} の qa_classifier_files だけ）`);
    }
    if (!hubs.has(file)) {
      if (seen) problems.push(`${file}: pilot の短縮コード ${code} がある — `
        + (active ? `pilot は ${MANIFEST_PATH} の pages の冒頭ボタンだけ` : `state は rolled_back。戻したらサイトのどこにも置かない`));
      continue;
    }
    const hits = anchors(text).filter(a => a.get('href')?.[0] === m.short_url);
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
    if (seen !== 1) problems.push(`${file}: pilot の短縮コード ${code} が冒頭ボタンの href のほかにもある（${seen} か所。コメント・本文・スクリプトも数える）`);
  }
  return problems;
}
