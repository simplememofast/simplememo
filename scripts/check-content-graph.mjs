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
// ただし凍結中の実験が持つ親（/obsidian/ など）は今は変えられないので、
// data/link-gate-deferrals.json に名指し・理由・期限つきで書いたものだけを
// 警告（deferred 行）へ下ろす。解釈は seo-check.js と同じ scripts/lib/link-deferrals.js。
//
// exit 0 = pass / 1 = fail。CIでは SEO Validation の1ステップとして走る。

import { run as runScenarios } from './lib/selftest.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { businessRelevance } from '../growth/lib/gsc.mjs';
import { OPEN_STATUSES } from '../growth/lib/ledger.mjs';
import { todayJst } from './lib/jst.mjs';

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

// 保留（data/link-gate-deferrals.json）の解釈も seo-check.js の [HUB]/[ORPHAN] と
// **同じ1本**を使う。「何を・いつまで外すか」を2本が別々に読むと、片方だけが緩む。
const { readLinkDeferrals, settleLinkFindings, OPEN_STATUSES: DEFERRAL_OPEN_STATUSES, todayTokyo } =
  createRequire(import.meta.url)('./lib/link-deferrals.js');

/**
 * 宣言した親 → 子のリンクが、親ページに実際にあるか（[CHILD] / [CHILD-EN]）。
 *
 * **純関数にしてある**ので、壊して落ちることを確かめられる。差し替えられるのは
 * 4つ: `readHtml`（URL → HTML か null）、`registry`（data/i18n/pages.json の中身）、
 * `exists`（validateGraph と同じ）、`deferrals`（保留台帳・実験の一覧・今日の日付）。
 * ディスクと時計を用意せずに判定を試すため。
 *
 * 英語側は「子と親の両方に英語ページがあり、どちらもディスクに在る」ときだけ見る。
 * 英語版がまだ無い子を、英語の親が載せていないのは正しい。
 *
 * 戻り値は `{ errors, deferred, counts }`。効いている保留に当たった指摘は errors に
 * 入らず deferred（警告の行）に入る。失効・未使用の保留と読めない台帳は errors。
 */
export function validateChildLinks(raw, {
  readHtml = readPageHtml,
  registry = null,
  exists = pageExists,
  deferrals = readLinkDeferrals(ROOT),
} = {}) {
  const findings = [];
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
      findings.push({ rule: 'CHILD', parent: e.parent, child: url,
        message: `[CHILD] parent page does not link its child (§11 Child: 全子記事へ): ${e.parent} -> ${url}` });
    }
    const enChild = english.get(pageKey(url));
    const enParent = english.get(pageKey(e.parent));
    if (!enChild || !enParent || !exists(enChild) || !exists(enParent)) continue;
    const enLinks = linksOf(enParent);
    if (enLinks && !enLinks.has(pageKey(enChild))) {
      findings.push({ rule: 'CHILD-EN', parent: enParent, child: enChild,
        message: `[CHILD-EN] English parent does not link its English child (§11 Child): ${enParent} -> ${enChild}` });
    }
  }
  // 全部そろってから保留に通す。「この保留は何にも当たらない」は最後にしか決められない。
  return settleLinkFindings(findings, { owner: 'content-graph', registry: reg, deferrals });
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
  // 保留台帳は差し込む（実物の台帳・実物の時計を読まない）。空なら保留が無かった頃と同じ。
  const TODAY = '2026-10-14';
  const NO_DEFERRALS = { ledger: { deferrals: [] }, experiments: [], today: TODAY };
  const settle = (html, opts = {}) => validateChildLinks(graph,
    { readHtml: pages(html), registry: NO_I18N, exists: alwaysExists, deferrals: NO_DEFERRALS, ...opts });
  const child = (html, opts) => settle(html, opts).errors;
  const tagged = (errors, tag) => errors.some((e) => e.startsWith(`${tag} `));

  // 保留の検体。日本語が元で英語を手で書き、韓国語は生成（/obsidian/ の形）。
  const DEF_I18N = {
    pages: ['p/index.html', 'p/c/index.html'].map((ja) => ({
      source: ja, sourceLocale: 'ja', existing: { ja, en: `en/${ja}` },
      pages: { ja, en: `en/${ja}`, ko: `ko/${ja}` },
    })),
  };
  const EXPERIMENTS = [{ id: 'exp-open', status: 'running' }, { id: 'exp-done', status: 'evaluated' }];
  const HOLD = {
    id: 'p-hub', kind: 'hub', page: '/p/', rules: ['CHILD'], experiments: ['exp-open'],
    until: '2026-11-08', reason: '凍結中の検体', added: TODAY,
  };
  const held = (over = {}) => ({ ledger: { deferrals: [{ ...HOLD, ...over }] }, experiments: EXPERIMENTS, today: TODAY });
  const UNLINKED = { '/p/': '<a href="/q/">別</a>' };
  const lapsedLine = (errors) => errors.filter((e) => e.startsWith('[DEFERRAL] p-hub has lapsed '));
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
    // ── 保留（data/link-gate-deferrals.json / lib/link-deferrals.js）──
    ['**効いている保留は [CHILD] を error にせず、id・期限・理由つきの deferred 行にする**', () => {
      const r = settle(UNLINKED, { registry: DEF_I18N, deferrals: held() });
      if (r.errors.length) throw new Error(r.errors.join(' / '));
      const want = '/p/ -> /p/c/ — deferral p-hub until 2026-11-08: 凍結中の検体';
      if (r.deferred.length !== 1 || !r.deferred[0].startsWith('[DEFERRED] [CHILD] ') || !r.deferred[0].endsWith(want)) {
        throw new Error(`deferred が違う: ${JSON.stringify(r.deferred)}`);
      }
    }],
    ['**期限を過ぎた保留は何も外さず、[DEFERRAL] has lapsed を足す**', () => {
      const r = settle(UNLINKED, { registry: DEF_I18N, deferrals: held({ added: '2026-10-01', until: '2026-10-13' }) });
      if (!tagged(r.errors, '[CHILD]') || lapsedLine(r.errors).length !== 1 || r.deferred.length) {
        throw new Error(`失効が効いていない: ${JSON.stringify(r)}`);
      }
    }],
    ['**名指しした実験がすべて閉じたら、期限前でも失効**', () => {
      const r = settle(UNLINKED, { registry: DEF_I18N, deferrals: held({ experiments: ['exp-done'] }) });
      if (!tagged(r.errors, '[CHILD]') || !lapsedLine(r.errors).some((e) => e.includes('exp-done=evaluated'))) {
        throw new Error(`失効が効いていない: ${JSON.stringify(r)}`);
      }
    }],
    ['**[CHILD] が1件も当たらない保留は落ちる**（リンクを足したら台帳から消す）', () => {
      const r = settle({ '/p/': LINKED }, { registry: DEF_I18N, deferrals: held() });
      if (!r.errors.includes('[DEFERRAL] p-hub rule CHILD matches nothing — remove it')) throw new Error(JSON.stringify(r.errors));
    }],
    ['日本語の親の保留は、手で書く英語の親の [CHILD-EN] を外さない', () => {
      const r = settle({ ...UNLINKED, '/en/p/': '<a href="/en/">Top</a>' },
        { registry: DEF_I18N, deferrals: held({ rules: ['CHILD', 'CHILD-EN'] }) });
      if (!tagged(r.errors, '[CHILD-EN]')) throw new Error('英語の [CHILD-EN] まで外した');
      if (tagged(r.errors, '[CHILD]') || r.deferred.length !== 1) throw new Error(`日本語の [CHILD] が外れていない: ${JSON.stringify(r)}`);
    }],
    ['seo-check の規則（HUB）だけの保留は、content-graph では当たり外れを数えない', () => {
      const r = settle({ '/p/': LINKED }, { registry: DEF_I18N, deferrals: held({ rules: ['HUB'] }) });
      if (r.errors.length || r.deferred.length) throw new Error(JSON.stringify(r));
    }],
    ['**知らない実験を名指しした台帳は何も外さない**', () => {
      const r = settle(UNLINKED, { registry: DEF_I18N, deferrals: held({ experiments: ['exp-typo'] }) });
      if (!tagged(r.errors, '[CHILD]') || !r.errors.some((e) => e.startsWith('[DEFERRAL] ') && e.includes('exp-typo'))) {
        throw new Error(JSON.stringify(r.errors));
      }
    }],
    // CommonJS の写し（seo-check.js から読むため）が正からずれると、同じ保留の
    // 失効が2本の検査で食い違う。毎回突き合わせる。
    ['保留の OPEN_STATUSES が growth/lib/ledger.mjs と同じ', () => {
      if (JSON.stringify(DEFERRAL_OPEN_STATUSES) !== JSON.stringify(OPEN_STATUSES)) {
        throw new Error(`link-deferrals.js ${JSON.stringify(DEFERRAL_OPEN_STATUSES)} / ledger.mjs ${JSON.stringify(OPEN_STATUSES)}`);
      }
    }],
    ['保留の todayTokyo が scripts/lib/jst.mjs の todayJst と同じ日付を返す', () => {
      for (const iso of ['2026-11-08T14:59:59Z', '2026-11-08T15:00:00Z', '2026-12-31T23:30:00Z']) {
        const at = new Date(iso);
        if (todayTokyo(at) !== todayJst(at)) throw new Error(`${iso}: ${todayTokyo(at)} / ${todayJst(at)}`);
      }
    }],
    ['実データで、宣言した親 → 子のリンクが揃っている（保留台帳 data/link-gate-deferrals.json を通して）', () => {
      const raw = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
      const { errors } = validateChildLinks(raw);
      if (errors.length) throw new Error(`実データで ${errors.length} 件: ${errors.slice(0, 3).join(' / ')}`);
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
const childLinks = validateChildLinks(raw);
errors.push(...childLinks.errors);
// 外したものも毎回出す（黙らせない）。終了コードには効かない。
if (childLinks.deferred.length) {
  const held = Object.entries(childLinks.counts).map(([id, n]) => `${id} ${n}`).join(', ');
  console.log(`content-graph: ${childLinks.deferred.length} finding(s) deferred by data/link-gate-deferrals.json (${held})`);
  for (const d of childLinks.deferred) console.log(`  ${d}`);
}

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
