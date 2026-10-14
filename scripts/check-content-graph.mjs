#!/usr/bin/env node
// data/content-graph.json の整合検査。
//
// このファイルは「更新されない記録」になった瞬間に負債へ変わる
// （OBSIDIAN_INTERNAL_LINK_PLAN.md CIゲート案）。だからJSONの導入と同時に
// この検査を入れる。守るのは次の8点だけで、内部リンクの网羅性そのものは
// check-internal-redirects.mjs の仕事（ここでは重複させない。7・8 が見るのも
// 台帳が宣言した親子だけ）。
//
//   1. URLキーが実在ページを指す（404の台帳化を防ぐ）
//   2. parent が実在キーで、自分自身でない
//   3. siblings / nextStep が実在ページ（外部は App Store のみ許可）
//   4. cluster / intent / funnel / productRelevance が宣言済みの語彙に収まる
//   5. productRelevance が growth/lib/gsc.mjs の businessRelevance と矛盾しない
//      （台帳と週次集計が別の相場観を持つと、キュー判断が静かに割れる）
//   6. /obsidian/ 配下の全JAページが登録されている（オートパイロットの
//      担当領域は登録漏れを許さない。それ以外の領域は段階導入のため任意）
//   7. [CHILD] parent を宣言した子へ、親ページが実際に <a> でリンクしている
//      （OBSIDIAN_INTERNAL_LINK_PLAN.md §11 Child「ピラーからのみ。全子記事へ」。
//      コメント・<script>・<template> の中のリンクは数えない）
//   8. [CHILD-EN] 子と親の両方に英語ページ（data/i18n/pages.json）がディスクに
//      在るとき、英語の親も英語の子へリンクしている
//
// 7・8 は 2026-10-14 に足した。台帳は親を宣言していたのに、/obsidian/ は
// 宣言した子17本へリンクしていなかった。**宣言だけで、誰も突き合わせて
// いなかった。**同じ日の GSC「検出 - インデックス未登録」53件の一因で、
// ハブに載らない子は、サイトマップのほかに Google が辿る道が細くなる。
//
// exit 0 = pass / 1 = fail。CIでは SEO Validation の1ステップとして走る。

import { run as runScenarios } from './lib/selftest.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { businessRelevance } from '../growth/lib/gsc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_PATH = path.join(ROOT, 'data', 'content-graph.json');
const I18N_PATH = path.join(ROOT, 'data', 'i18n', 'pages.json');
const ORIGIN = 'https://simplememofast.com';
// リンクの拾い方は seo-check.js の [ORPHAN]/[HUB] と**同じ関数**を使う。
// 2本の検査が「リンクがある」を別々に定義すると、片方だけ緑になる。
const { linkedPages, pageKey } = createRequire(import.meta.url)('./lib/seo-site.js');

// URL（正準形）→ 実ファイル。サイトの2流儀（末尾スラッシュ=ディレクトリ /
// 拡張子なし=フラット.html）は generate_sitemap / gsc.mjs の toPath と同じ前提。
function urlToFile(url) {
  if (!url.startsWith('/')) return null;
  const rel = url.endsWith('/') ? `${url}index.html` : `${url}.html`;
  return path.join(ROOT, rel.replace(/^\//, ''));
}

function pageExists(url) {
  const f = urlToFile(url);
  return f !== null && fs.existsSync(f);
}

/**
 * 台帳1つぶんの判定。**純関数にしてある**ので、壊して落ちることを確かめられる。
 * `pageExists` を差し替えられるのは、ディスクを用意せずに判定を試すため。
 */
export function validateGraph(raw, { exists = pageExists } = {}) {
  const errors = [];
  const meta = raw._meta || {};
  const clusters = new Set(meta.clusters || []);
  const intents = new Set(meta.intents || []);
  const funnels = new Set(meta.funnels || []);
  const entries = Object.entries(raw).filter(([k]) => !k.startsWith('_'));
  const keys = new Set(entries.map(([k]) => k));

  if (clusters.size === 0) errors.push('[META] _meta.clusters is empty');

for (const [url, e] of entries) {
  if (!exists(url)) errors.push(`[URL] graph key has no page on disk: ${url}`);

  if (e.parent !== null) {
    if (e.parent === url) errors.push(`[PARENT] self-reference: ${url}`);
    else if (!keys.has(e.parent)) errors.push(`[PARENT] not a graph key: ${url} -> ${e.parent}`);
  }

  for (const s of e.siblings || []) {
    if (s === url) errors.push(`[SIBLING] self-reference: ${url}`);
    else if (!exists(s)) errors.push(`[SIBLING] page missing on disk: ${url} -> ${s}`);
  }
  if ((e.siblings || []).length > 4) {
    errors.push(`[SIBLING] more than 4 (§13 無差別リンク防止): ${url}`);
  }

  if (e.nextStep !== null && e.nextStep !== undefined) {
    const ok = e.nextStep.startsWith('https://apps.apple.com/') || exists(e.nextStep);
    if (!ok) errors.push(`[NEXTSTEP] page missing on disk: ${url} -> ${e.nextStep}`);
  }

  if (!clusters.has(e.cluster)) errors.push(`[CLUSTER] undeclared cluster '${e.cluster}': ${url}`);
  if (!intents.has(e.intent)) errors.push(`[INTENT] undeclared intent '${e.intent}': ${url}`);
  if (!funnels.has(e.funnel)) errors.push(`[FUNNEL] undeclared funnel '${e.funnel}': ${url}`);

  const expected = RELEVANCE_BUCKET(businessRelevance(url));
  if (e.productRelevance !== expected) {
    errors.push(
      `[RELEVANCE] ${url}: graph says '${e.productRelevance}' but growth/lib/gsc.mjs `
      + `businessRelevance=${businessRelevance(url)} (${expected}) — 台帳を直すか BUSINESS_RELEVANCE を直すか、どちらかに揃える`,
    );
  }
}
  return { errors, entries, keys };
}

const RELEVANCE_BUCKET = (v) => (v >= 0.9 ? 'high' : v >= 0.5 ? 'medium' : 'low');

/** そのページの HTML。無ければ null（不在そのものは [URL] が報告する）。 */
function readPageHtml(url) {
  const f = urlToFile(url);
  return f !== null && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
}

/** data/i18n/pages.json の1ファイル → 正準URL（'en/x/index.html' → '/en/x/'）。 */
const fileToUrl = (file) => `/${file.replace(/index\.html$/, '').replace(/\.html$/, '')}`;

/**
 * 宣言した親 → 子のリンクが、親ページに実際にあるか（[CHILD] / [CHILD-EN]）。
 *
 * **純関数にしてある**ので、壊して落ちることを確かめられる。差し替えられるのは
 * 3つ: `readHtml`（URL → HTML か null）、`registry`（data/i18n/pages.json の中身）、
 * `exists`（validateGraph と同じ）。ディスクを用意せずに判定を試すため。
 *
 * 英語側は「子と親の両方に英語ページがあり、どちらもディスクに在る」ときだけ見る。
 * 英語版がまだ無い子を、英語の親が載せていないのは正しい。
 */
export function validateChildLinks(raw, {
  readHtml = readPageHtml,
  registry = null,
  exists = pageExists,
} = {}) {
  const errors = [];
  const reg = registry ?? JSON.parse(fs.readFileSync(I18N_PATH, 'utf8'));
  const english = new Map();
  for (const group of reg.pages || []) {
    const { ja, en } = group.pages || {};
    if (ja && en) english.set(pageKey(fileToUrl(ja)), fileToUrl(en));
  }
  const linkCache = new Map();
  const linksOf = (url) => {
    if (!linkCache.has(url)) {
      const html = readHtml(url);
      linkCache.set(url, html === null ? null : linkedPages(html, url, ORIGIN));
    }
    return linkCache.get(url);
  };

  for (const [url, e] of Object.entries(raw).filter(([k]) => !k.startsWith('_'))) {
    if (e.parent === null || e.parent === undefined || e.parent === url) continue;
    const links = linksOf(e.parent);
    if (links && !links.has(pageKey(url))) {
      errors.push(`[CHILD] parent page does not link its child (§11 Child: 全子記事へ): ${e.parent} -> ${url}`);
    }
    const enChild = english.get(pageKey(url));
    const enParent = english.get(pageKey(e.parent));
    if (!enChild || !enParent || !exists(enChild) || !exists(enParent)) continue;
    const enLinks = linksOf(enParent);
    if (enLinks && !enLinks.has(pageKey(enChild))) {
      errors.push(`[CHILD-EN] English parent does not link its English child (§11 Child): ${enParent} -> ${enChild}`);
    }
  }
  return errors;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const META = { clusters: ['c'], intents: ['i'], funnels: ['f'] };
const OK_ENTRY = {
  parent: null, siblings: [], nextStep: null,
  cluster: 'c', intent: 'i', funnel: 'f', productRelevance: null,
};
function graphWith(over = {}, metaOver = {}) {
  const e = { ...OK_ENTRY, ...over };
  // productRelevance は businessRelevance と一致させる必要があるので実測から取る
  e.productRelevance = RELEVANCE_BUCKET(businessRelevance('/x/'));
  return { _meta: { ...META, ...metaOver }, '/x/': e };
}
const alwaysExists = () => true;
const SCENARIOS = [
  ['素の台帳は通る', () => {
    const r = validateGraph(graphWith(), { exists: alwaysExists });
    if (r.errors.length) throw new Error(r.errors.join(' / '));
  }],
  ['**ページがディスクに無ければ落ちる**', () => {
    const r = validateGraph(graphWith(), { exists: () => false });
    if (!r.errors.some((e) => e.startsWith('[URL]'))) throw new Error('検出しなかった');
  }],
  ['親の自己参照は落ちる', () => {
    const r = validateGraph(graphWith({ parent: '/x/' }), { exists: alwaysExists });
    if (!r.errors.some((e) => e.includes('[PARENT] self-reference'))) throw new Error('検出しなかった');
  }],
  ['**兄弟が5件以上は落ちる**（§13 無差別リンク防止）', () => {
    const r = validateGraph(graphWith({ siblings: ['/a/', '/b/', '/c/', '/d/', '/e/'] }),
      { exists: alwaysExists });
    if (!r.errors.some((e) => e.includes('more than 4'))) throw new Error('検出しなかった');
  }],
  ['宣言していない cluster / intent / funnel は落ちる', () => {
    const r = validateGraph(graphWith({ cluster: 'zzz', intent: 'yyy', funnel: 'xxx' }),
      { exists: alwaysExists });
    for (const tag of ['[CLUSTER]', '[INTENT]', '[FUNNEL]']) {
      if (!r.errors.some((e) => e.startsWith(tag))) throw new Error(`${tag} を検出しなかった`);
    }
  }],
  ['**関連度が gsc.mjs とずれたら落ちる**（台帳と実装のどちらかに揃える）', () => {
    const g = graphWith();
    g['/x/'].productRelevance = g['/x/'].productRelevance === 'high' ? 'low' : 'high';
    const r = validateGraph(g, { exists: alwaysExists });
    if (!r.errors.some((e) => e.startsWith('[RELEVANCE]'))) throw new Error('検出しなかった');
  }],
  ['_meta.clusters が空なら落ちる', () => {
    const r = validateGraph(graphWith({}, { clusters: [] }), { exists: alwaysExists });
    if (!r.errors.some((e) => e.startsWith('[META]'))) throw new Error('検出しなかった');
  }],
  ['実データが検査を通る', () => {
    const raw = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
    const r = validateGraph(raw);
    if (r.errors.length) throw new Error(`実データで ${r.errors.length} 件`);
  }],
  ...childScenarios(),
];

// [CHILD] / [CHILD-EN]: 親 /p/ と子 /p/c/ の最小の台帳に、HTML を差し込んで試す。
function childScenarios() {
  const graph = { _meta: META, '/p/': { ...OK_ENTRY }, '/p/c/': { ...OK_ENTRY, parent: '/p/' } };
  const NO_I18N = { pages: [] };
  const I18N = {
    pages: [
      { pages: { ja: 'p/index.html', en: 'en/p/index.html' } },
      { pages: { ja: 'p/c/index.html', en: 'en/p/c/index.html' } },
    ],
  };
  const pages = (html) => (url) => html[url] ?? null;
  const LINKED = '<a href="/p/c/">子</a>';
  const child = (html, opts = {}) => validateChildLinks(graph,
    { readHtml: pages(html), registry: NO_I18N, exists: alwaysExists, ...opts });
  const tagged = (errors, tag) => errors.some((e) => e.startsWith(`${tag} `));
  return [
    // 通る側が黙らなければ、下の「落ちる」はノイズで通っているかもしれない。
    ['親が子へリンクしていれば通る（相対リンク・属性の順序・引用符は問わない）', () => {
      const r = child({ '/p/': `<a class="card" href='c/'>子</a>` });
      if (r.length) throw new Error(r.join(' / '));
    }],
    ['**親が子へリンクしていなければ落ちる**（[CHILD]）', () => {
      if (!tagged(child({ '/p/': '<a href="/q/">別</a>' }), '[CHILD]')) throw new Error('検出しなかった');
    }],
    ['**コメントの中にしか無いリンクは数えない**', () => {
      if (!tagged(child({ '/p/': `<!-- ${LINKED} -->` }), '[CHILD]')) throw new Error('検出しなかった');
    }],
    ['<script> の文字列や hreflang の <link> もリンクではない', () => {
      const html = `<link rel="alternate" hreflang="ja" href="/p/c/"><script>s = '${LINKED}';</script>`;
      if (!tagged(child({ '/p/': html }), '[CHILD]')) throw new Error('検出しなかった');
    }],
    ['**英語の親が英語の子へリンクしていなければ落ちる**（[CHILD-EN]）', () => {
      const r = child({ '/p/': LINKED, '/en/p/': '<a href="/en/">Top</a>' }, { registry: I18N });
      if (!tagged(r, '[CHILD-EN]')) throw new Error('検出しなかった');
      if (tagged(r, '[CHILD]')) throw new Error('日本語側は揃っているのに [CHILD] が出た');
    }],
    ['英語の親子が揃っていれば通る', () => {
      const r = child({ '/p/': LINKED, '/en/p/': '<a href="/en/p/c/">Child</a>' }, { registry: I18N });
      if (r.length) throw new Error(r.join(' / '));
    }],
    ['英語の子がディスクに無ければ [CHILD-EN] は見ない（英語版がまだ無い子）', () => {
      const r = child({ '/p/': LINKED, '/en/p/': '<a href="/en/">Top</a>' },
        { registry: I18N, exists: (u) => u !== '/en/p/c/' });
      if (r.length) throw new Error(r.join(' / '));
    }],
    ['実データで、宣言した親 → 子のリンクが揃っている', () => {
      const raw = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
      const r = validateChildLinks(raw);
      if (r.length) throw new Error(`実データで ${r.length} 件: ${r.slice(0, 3).join(' / ')}`);
    }],
  ];
}

// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
if (process.argv.includes('--selftest')) {
  process.exit(runScenarios(SCENARIOS) === 0 ? 0 : 1);
}

const raw = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
const { errors, entries, keys } = validateGraph(raw);
errors.push(...validateChildLinks(raw));

// /obsidian/ 配下（JA）は全ページ登録必須 — オートパイロットの担当領域。
function walkObsidianPages(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkObsidianPages(full, acc);
    else if (name === 'index.html') {
      const url = `/${path.relative(ROOT, dir).replace(/\\/g, '/')}/`;
      acc.push(url);
    }
  }
  return acc;
}
for (const url of walkObsidianPages(path.join(ROOT, 'obsidian'), [])) {
  if (!keys.has(url)) {
    errors.push(`[COVERAGE] /obsidian/ page not registered in content-graph.json: ${url}`);
  }
}

if (errors.length > 0) {
  console.error(`content-graph: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`content-graph: ${entries.length} entries OK (URL/parent/siblings/nextStep/vocabulary/relevance/coverage/child links)`);
}
