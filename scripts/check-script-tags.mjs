#!/usr/bin/env node
// 各ページの <script> が閉じているか。
//
// なぜ専用の検査がいるか
// ----------------------
// seo-check.js は title も description も canonical も正規表現で読む。
// 正規表現は「その要素がHTMLパーサから見えるか」を知らないので、閉じていない
// <script> の内側に落ちた <title> でも普通に拾ってしまう。
//
// 2026-08-13、これが実際に本番へ出た。/blog/google-keep-shutdown を既存記事の
// head から組み立てたとき、切り出す行範囲が </script> の手前で終わっていた。
// 結果、<script> が開きっぱなしになり、次に現れる </script>（最初のJSON-LD
// ブロックの末尾）までの全部 — <title>、meta description、canonical、
// og:*/twitter:*、favicon、BlogPosting の JSON-LD — がスクリプト本文として
// 飲み込まれた。
//
// それでも SEO Validation の12ゲートは全部緑だった。Chromium でスクリーン
// ショットを撮っても崩れて見えない（<body> は正常に描画されるため）。
// 実際にDOMを組ませて初めて title="" と分かる、という種類の壊れ方をする。
//
// 検査の中身は開きタグと閉じタグの数を数えるだけで、意図的に安い。
// 導入時点で252ファイル中の不一致は0件なので、1件でも出れば本物である。
// exit 0 = pass / 1 = fail。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { collectHtmlFiles } = createRequire(import.meta.url)('./lib/site-files');

/**
 * 1ファイル分の判定。**純関数にしてある**ので、自己テストで
 * 「壊したら落ちる」を確かめられる（走査と判定が混ざっていると確かめられない）。
 *
 * `<script` は属性の有無を問わず開始タグにだけ当てる（\b があるので
 * JS 内の createElement('script') のような文字列には当たらない）。
 */
export function unbalanced(html) {
  const open = (html.match(/<script\b/gi) || []).length;
  const close = (html.match(/<\/script\s*>/gi) || []).length;
  return open === close ? null : { open, close };
}

export function scanFiles(fileList, read = (f) => fs.readFileSync(f, 'utf8')) {
  const found = [];
  for (const file of fileList) {
    const r = unbalanced(read(file));
    if (r) found.push({ rel: path.relative(ROOT, file), ...r });
  }
  return found;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 2026-08-13 に本番へ出た実物と同じ形を固定する。閉じ忘れた <script> が
// 次の </script> までの head を飲み込み、12ゲート全部が緑のまま出荷された。
const SCENARIOS = [
  ['閉じている HTML は通る', () => {
    if (unbalanced('<html><script>x</script></html>') !== null) throw new Error('通るべき');
  }],
  ['**閉じ忘れた <script> は落ちる**（次の </script> まで head を飲み込む形）', () => {
    const r = unbalanced('<head><script type="application/ld+json">{}\n<title>t</title></head>');
    if (!r) throw new Error('壊したのに落ちなかった（**この検査は何も見ていない**）');
    if (r.open !== 1 || r.close !== 0) throw new Error(`数え方が違う: ${JSON.stringify(r)}`);
  }],
  ['属性つきの開始タグも数える', () => {
    if (unbalanced('<script src="a.js">') === null) throw new Error('落ちるべき');
  }],
  ['**JS 内の文字列には当たらない**（偽陽性を作らない）', () => {
    if (unbalanced('<script>createElement("script")</script>') !== null) {
      throw new Error('createElement の中身に当たっている');
    }
  }],
  ['閉じタグの空白ゆらぎを数える', () => {
    if (unbalanced('<script>x</script >') !== null) throw new Error('</script > も閉じタグ');
  }],
  ['実データが検査を通る', () => {
    const found = scanFiles(collectHtmlFiles(ROOT, {
      skipDirs: ['node_modules', '.git', 'screenshots'], skipFiles: [],
    }));
    if (found.length) throw new Error(`実データで ${found.length} 件`);
  }],
];

if (process.argv.includes('--selftest')) {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const files = collectHtmlFiles(ROOT, {
  skipDirs: ['node_modules', '.git', 'screenshots'],
  skipFiles: [],
});

const problems = scanFiles(files);

if (problems.length) {
  console.error('閉じていない <script> があります:');
  for (const p of problems) {
    console.error(`  ${p.rel} — 開き ${p.open} / 閉じ ${p.close}`);
  }
  console.error(
    '\n開きっぱなしの <script> は、次の </script> までの head を丸ごと飲み込みます。' +
      '\ntitle・description・canonical・JSON-LD がクローラから消えるので、これは落とします。',
  );
  process.exit(1);
}

console.log(`script tags: ${files.length} files checked, all balanced`);
