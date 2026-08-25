#!/usr/bin/env node
/**
 * data/*.json のうち**どれを公開するか**を明示し、実際の配信と突き合わせる。
 *
 *   node scripts/check-publication.mjs           # 表示
 *   node scripts/check-publication.mjs --write   # _redirects の遮断ブロックを更新
 *   node scripts/check-publication.mjs --check   # CI
 *   node scripts/check-publication.mjs --selftest
 *
 * 【なぜ要るか — 2026-08-25 に気づいた】
 * Cloudflare Pages は**リポジトリの中身をそのまま配信する。**除外設定は無い。
 * つまり `data/*.json` は34件すべてが `https://simplememofast.com/data/...` で
 * 読める状態にあった。**サイトが意図して参照しているのは6件だけ。**
 * 残り28件は、静的ホスティングの副作用で公開されていた。
 *
 * その中には次のものが含まれる:
 *
 *   credential-expiry.json … **どんな資格情報が存在するか**の一覧
 *   injection-surface.json … **攻撃面の棚卸し**
 *   corporate-obligations.json … 法人の期限・記録
 *   financial-policy.json  … 上限・損失限度・観測した売上
 *   spend-approvals.json / vendor-register.json … 支出承認と取引先
 *
 * **どれも秘密そのものではない**（鍵の値は入っていない）。だが
 * 「何があるか」の地図であって、公開するかどうかは**選んで決めるべきこと**で、
 * 静的ホスティングの既定で決まってよいことではない。
 *
 * **そして実際にこの穴を踏んだ。**2026-08-25、⑦法人経営の欄を埋める作業で
 * `officer_compensation`（役員報酬の有無）を corporate-obligations.json に
 * 書き込んだ。**登記事項ではない情報を、公開ディレクトリへ、確認せずに置いた。**
 *
 * 【この検査が守ること】
 *   1. data/*.json は**全件が方針に載っていること**（新しいファイルは分類するまで落ちる）
 *   2. private のものは _redirects で実際に 404 になっていること
 *   3. public のものは**サイトから実際に参照されていること**
 *      （参照が消えたのに公開のまま残る、を防ぐ）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = path.join(ROOT, 'data/publication-policy.json');
export const REDIRECTS_PATH = path.join(ROOT, '_redirects');
const DATA_DIR = path.join(ROOT, 'data');

export const BEGIN = '# BEGIN data-publication (scripts/check-publication.mjs --write)';
export const END = '# END data-publication';

export function listDataFiles(dir = DATA_DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

/** サイトの HTML から実際に参照されている data ファイル。 */
export function referencedFiles(root = ROOT) {
  const found = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.html')) {
        const t = fs.readFileSync(p, 'utf8');
        for (const m of t.matchAll(/\/data\/([a-z0-9-]+\.json)/g)) found.add(m[1]);
      }
    }
  };
  walk(root);
  return found;
}

/** private のファイルを 404 にする _redirects ブロックを組む。 */
export function buildBlock(policy) {
  const priv = Object.entries(policy.files)
    .filter(([, v]) => !v.public)
    .map(([f]) => f)
    .sort();
  const lines = [
    BEGIN,
    '# **静的ホスティングは既定で全部配信する。**公開しないと決めたものは',
    '# ここで明示的に 404 にする。一覧は data/publication-policy.json が正。',
    ...priv.map((f) => `/data/${f}    /404.html    404`),
    END,
  ];
  return lines.join('\n');
}

export function validate(policy, { files, referenced }) {
  const problems = [];
  const listed = new Set(Object.keys(policy.files || {}));

  for (const f of files) {
    if (!listed.has(f)) {
      problems.push(`data/${f} が publication-policy.json に無い`
        + ' — **分類するまで通さない。**公開してよいかを既定で決めさせない');
    }
  }
  for (const f of listed) {
    if (!files.includes(f)) problems.push(`publication-policy.json の ${f} が実在しない`);
    const v = policy.files[f];
    if (typeof v.public !== 'boolean') problems.push(`${f}: public を真偽値で書くこと`);
    if (!v.why) problems.push(`${f}: why が無い — **公開する/しない の理由を残す**`);
    // 公開と言っているのに、どこからも参照されていない
    if (v.public && !referenced.has(f) && !v.allow_unreferenced) {
      problems.push(`${f}: public だがサイトのどこからも参照されていない`
        + ' — 参照が消えたのに公開のまま残っている可能性。'
        + ' 意図してURLだけ公開するなら allow_unreferenced: true を書く');
    }
  }
  return problems;
}

export function checkRedirects(policy, redirectsText) {
  const problems = [];
  const block = buildBlock(policy);
  if (!redirectsText.includes(BEGIN)) {
    problems.push('_redirects に遮断ブロックが無い — `--write` を実行すること');
    return problems;
  }
  const start = redirectsText.indexOf(BEGIN);
  const end = redirectsText.indexOf(END) + END.length;
  const current = redirectsText.slice(start, end);
  if (current !== block) {
    problems.push('_redirects の遮断ブロックが方針とずれている'
      + ' — `node scripts/check-publication.mjs --write` を同じコミットに含めること');
  }
  return problems;
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };

  const pol = { files: {
    'a.json': { public: true, why: 'サイトが読む' },
    'b.json': { public: false, why: '内部だけ' },
  } };
  t('未分類のファイルは落ちる',
    validate(pol, { files: ['a.json', 'b.json', 'c.json'], referenced: new Set(['a.json']) })
      .some((p) => p.includes('c.json')));
  t('理由の無い行は落ちる',
    validate({ files: { 'a.json': { public: true } } }, { files: ['a.json'], referenced: new Set(['a.json']) })
      .some((p) => p.includes('why')));
  t('public なのに参照が無ければ落ちる',
    validate(pol, { files: ['a.json', 'b.json'], referenced: new Set() })
      .some((p) => p.includes('参照されていない')));
  t('allow_unreferenced を書けば通る',
    validate({ files: { 'a.json': { public: true, why: 'x', allow_unreferenced: true } } },
      { files: ['a.json'], referenced: new Set() }).length === 0);
  t('private は参照が無くても落ちない',
    !validate(pol, { files: ['a.json', 'b.json'], referenced: new Set(['a.json']) })
      .some((p) => p.includes('b.json') && p.includes('参照')));

  const block = buildBlock(pol);
  t('private だけが 404 になる', block.includes('/data/b.json') && !block.includes('/data/a.json'));
  t('遮断ブロックの欠落を検出する', checkRedirects(pol, 'nothing').length === 1);
  t('ずれを検出する', checkRedirects(pol, `${BEGIN}\nwrong\n${END}`).length === 1);
  t('一致すれば通る', checkRedirects(pol, `head\n${block}\ntail`).length === 0);

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const files = listDataFiles();
  const referenced = referencedFiles();
  const problems = validate(policy, { files, referenced });

  const pub = Object.entries(policy.files).filter(([, v]) => v.public).map(([f]) => f);
  const priv = Object.entries(policy.files).filter(([, v]) => !v.public).map(([f]) => f);
  console.log(`data/*.json ${files.length} 件 — 公開 ${pub.length} / 非公開 ${priv.length}\n`);
  console.log('  公開:');
  for (const f of pub) console.log(`    ${f}  — ${policy.files[f].why}`);
  console.log(`\n  非公開（_redirects で 404）: ${priv.length} 件`);

  if (process.argv.includes('--write')) {
    let text = fs.readFileSync(REDIRECTS_PATH, 'utf8');
    const block = buildBlock(policy);
    if (text.includes(BEGIN)) {
      const s = text.indexOf(BEGIN);
      const e = text.indexOf(END) + END.length;
      text = text.slice(0, s) + block + text.slice(e);
    } else {
      text = `${text.trimEnd()}\n\n${block}\n`;
    }
    fs.writeFileSync(REDIRECTS_PATH, text);
    console.log('\n  → _redirects を更新');
    process.exit(0);
  }

  problems.push(...checkRedirects(policy, fs.readFileSync(REDIRECTS_PATH, 'utf8')));
  if (problems.length) {
    console.error('\n公開方針: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n分類・遮断・参照に食い違いなし。');
}
