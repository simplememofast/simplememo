#!/usr/bin/env node
/**
 * Keep every cache-busted asset's query in step with its contents.
 *
 *   node scripts/check-css-version.mjs [--write]
 *
 * The version is derived from a hash of the file itself, so it cannot be
 * forgotten. It was, once: the QR styles shipped on 2026-08-10 with the query
 * still reading `?v=20260805-read`, so browsers and the CDN kept serving the
 * previous stylesheet. The markup was live and correct while none of its rules
 * applied — the desktop-only rule included, which put a QR in front of mobile
 * readers. Nothing failed; the page just quietly rendered against stale CSS,
 * and this environment cannot fetch the site to notice.
 *
 * The JS entry was added on 2026-08-11 for the same reason, before it could
 * bite a second time. `js/app-store-tracking.js` was carrying a hand-written
 * `?v=20260809` across 231 pages while `_headers` serves `/*.js` as
 * `immutable, max-age=604800`. Adding the next_step_click handler to that file
 * without moving the query would have published a week of pages whose card
 * fires no event — and the resulting silence would have read as "readers
 * ignored the card", which is the opposite of what happened.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');

/** Every asset served with an immutable cache header and referenced with ?v=. */
const ASSETS = [
  'assets/css/style.min.css',
  // 共有CSSを読まない17面のための「網」。immutable で配るので ?v= が要る。
  'assets/css/safety-net.css',
  'js/app-store-tracking.js',
  'js/lang.js',
  'js/contact-form.js',
  // /siri/ のアプリ内ガイド。2026-08-11 に3例目が出た。#462 が英語5枚を
  // onboarding-en-1..5.png で出し、その直後に #463 が同じURLへ別の画面を
  // 入れた（en-2 が phrase → invoke に変わる並び替え）。`/assets/*` は
  // immutable/max-age=604800 なので、CDNは #462 のバイトを掴んだまま。
  // 実際に en-1/3/5 が cf-cache-status: HIT で旧画像を返しており、英語の帯は
  // dialogue と checklist が二重に並んで phrase と delivery が消えていた。
  // 日本語6枚も #428 から5日間配ったURLを中身だけ差し替えているため同じ。
  ...[1, 2, 3, 4, 5, 6].flatMap((n) => [
    `assets/img/siri/onboarding-${n}.png`,
    `assets/img/siri/onboarding-en-${n}.png`,
  ]),
];

/**
 * 資産1つぶんの照合器を作る。**純関数にしてある**ので、
 * 「合っていない ?v= を落とすか」を自己テストで確かめられる。
 *
 * どんなクエリにも当てる（手書きの値を重複させず置き換えるため）。
 */
export function matcherFor(asset, hash) {
  return {
    asset,
    hash,
    re: new RegExp(`(/${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\?v=[^"']*)?`, 'g'),
  };
}

/** HTML 1枚を照合する。合っていれば null、ずれていれば直した HTML を返す。 */
export function staleIn(html, matcher) {
  if (!html.includes(matcher.asset)) return null;
  const next = html.replace(matcher.re, `/${matcher.asset}?v=${matcher.hash}`);
  return next === html ? null : next;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 2026-08-10 に実際に本番へ出た形を固定する。markup が新しくなったのに
// ?v= が据え置きで、CDNとブラウザは前のスタイルシートを配り続けた。
// **新しい規則は1つも適用されず、何もエラーを報告しなかった。**
// 2026-08-11 には js/lang.js で同じことが起きていた（1か月古いまま配布）。
const SCENARIOS = [
  ['**?v= が古いと検出する**（markup だけ新しくなり CDN が旧版を配り続ける形）', () => {
    const m = matcherFor('assets/css/style.min.css', 'newhash123');
    const out = staleIn('<link href="/assets/css/style.min.css?v=oldhash">', m);
    if (out === null) throw new Error('ずれているのに検出しなかった（**この検査は何も見ていない**）');
    if (!out.includes('?v=newhash123')) throw new Error(`直し方が違う: ${out}`);
  }],
  ['**?v= が無いのも検出する**（付け忘れは永久キャッシュと同義）', () => {
    const m = matcherFor('js/lang.js', 'abc0123456');
    if (staleIn('<script src="/js/lang.js"></script>', m) === null) {
      throw new Error('クエリ無しを見逃した');
    }
  }],
  ['合っていれば何も言わない（偽陽性を作らない）', () => {
    const m = matcherFor('js/lang.js', 'abc0123456');
    if (staleIn('<script src="/js/lang.js?v=abc0123456"></script>', m) !== null) {
      throw new Error('合っているのに検出した');
    }
  }],
  ['その資産を参照していないページは対象外', () => {
    const m = matcherFor('js/lang.js', 'abc0123456');
    if (staleIn('<p>なにもない</p>', m) !== null) throw new Error('無関係なページを拾った');
  }],
  ['**ファイル名の正規表現メタ文字で壊れない**（.min.css のドット）', () => {
    const m = matcherFor('assets/css/style.min.css', 'h');
    // ドットが任意1文字として効いていたら styleXminYcss にも当たってしまう
    if (staleIn('<link href="/assets/css/styleXminYcss?v=z">', m) !== null) {
      throw new Error('ドットが任意1文字として効いている');
    }
  }],
];

// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
if (process.argv.includes('--selftest')) {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const { collectHtmlFiles, toUrlPath } = createRequire(import.meta.url)('./lib/site-files.js');
const files = collectHtmlFiles(ROOT, {
  skipDirs: ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'growth'],
});

const targets = ASSETS.filter((a) => fs.existsSync(path.join(ROOT, a))).map((asset) => ({
  asset,
  hash: crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(ROOT, asset)))
    .digest('hex')
    .slice(0, 10),
  // Any query at all, so a hand-written value is replaced rather than duplicated.
  re: new RegExp(`(/${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\?v=[^"']*)?`, 'g'),
}));

const stale = new Map();
let fixed = 0;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  let updated = html;
  for (const t of targets) {
    if (!updated.includes(t.asset)) continue;
    const next = updated.replace(t.re, `/${t.asset}?v=${t.hash}`);
    if (next !== updated) {
      if (!stale.has(t.asset)) stale.set(t.asset, []);
      stale.get(t.asset).push(toUrlPath(ROOT, file));
      updated = next;
    }
  }
  if (updated !== html && write) { fs.writeFileSync(file, updated); fixed++; }
}

if (write) {
  console.log(`updated ${fixed} file(s):`);
  for (const t of targets) console.log(`  ${t.asset} → ?v=${t.hash}`);
  process.exit(0);
}

if (stale.size) {
  const lines = [];
  for (const [asset, pages] of stale) {
    const { hash } = targets.find((t) => t.asset === asset);
    lines.push(`  ${asset} hashes to ${hash}; ${pages.length} page(s) request another version`);
    lines.push(...pages.slice(0, 5).map((p) => `      ${p}`));
    if (pages.length > 5) lines.push(`      … ${pages.length - 5} more`);
  }
  console.error(
    'FAIL: an asset changed without its cache-busting query changing, so visitors keep the old file.\n\n'
    + lines.join('\n')
    + '\n\nFix:  node scripts/check-css-version.mjs --write\n'
  );
  process.exit(2);
}

console.log('OK: every page requests the current version of '
  + targets.map((t) => `${path.basename(t.asset)}?v=${t.hash}`).join(', '));
}
