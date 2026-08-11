#!/usr/bin/env node
// data/content-graph.json の整合検査。
//
// このファイルは「更新されない記録」になった瞬間に負債へ変わる
// （OBSIDIAN_INTERNAL_LINK_PLAN.md CIゲート案）。だからJSONの導入と同時に
// この検査を入れる。守るのは次の6点だけで、内部リンクの网羅性そのものは
// check-internal-redirects.mjs の仕事（ここでは重複させない）。
//
//   1. URLキーが実在ページを指す（404の台帳化を防ぐ）
//   2. parent が実在キーで、自分自身でない
//   3. siblings / nextStep が実在ページ（外部は App Store のみ許可）
//   4. cluster / intent / funnel / productRelevance が宣言済みの語彙に収まる
//   5. productRelevance が growth/lib/gsc.mjs の businessRelevance と矛盾しない
//      （台帳と週次集計が別の相場観を持つと、キュー判断が静かに割れる）
//   6. /obsidian/ 配下の全JAページが登録されている（オートパイロットの
//      担当領域は登録漏れを許さない。それ以外の領域は段階導入のため任意）
//
// exit 0 = pass / 1 = fail。CIでは SEO Validation の1ステップとして走る。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { businessRelevance } from '../growth/lib/gsc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_PATH = path.join(ROOT, 'data', 'content-graph.json');

const errors = [];

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

const raw = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
const meta = raw._meta || {};
const clusters = new Set(meta.clusters || []);
const intents = new Set(meta.intents || []);
const funnels = new Set(meta.funnels || []);
const entries = Object.entries(raw).filter(([k]) => !k.startsWith('_'));
const keys = new Set(entries.map(([k]) => k));

if (clusters.size === 0) errors.push('[META] _meta.clusters is empty');

const RELEVANCE_BUCKET = (v) => (v >= 0.9 ? 'high' : v >= 0.5 ? 'medium' : 'low');

for (const [url, e] of entries) {
  if (!pageExists(url)) errors.push(`[URL] graph key has no page on disk: ${url}`);

  if (e.parent !== null) {
    if (e.parent === url) errors.push(`[PARENT] self-reference: ${url}`);
    else if (!keys.has(e.parent)) errors.push(`[PARENT] not a graph key: ${url} -> ${e.parent}`);
  }

  for (const s of e.siblings || []) {
    if (s === url) errors.push(`[SIBLING] self-reference: ${url}`);
    else if (!pageExists(s)) errors.push(`[SIBLING] page missing on disk: ${url} -> ${s}`);
  }
  if ((e.siblings || []).length > 4) {
    errors.push(`[SIBLING] more than 4 (§13 無差別リンク防止): ${url}`);
  }

  if (e.nextStep !== null && e.nextStep !== undefined) {
    const ok = e.nextStep.startsWith('https://apps.apple.com/') || pageExists(e.nextStep);
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
console.log(`content-graph: ${entries.length} entries OK (URL/parent/siblings/nextStep/vocabulary/relevance/coverage)`);
