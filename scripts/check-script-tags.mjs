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

const files = collectHtmlFiles(ROOT, {
  skipDirs: ['node_modules', '.git', 'screenshots'],
  skipFiles: [],
});

const problems = [];
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  // `<script` は属性の有無を問わず開始タグにだけ当てる（\b があるので
  // JS 内の createElement('script') のような文字列には当たらない）。
  const open = (html.match(/<script\b/gi) || []).length;
  const close = (html.match(/<\/script\s*>/gi) || []).length;
  if (open !== close) {
    problems.push({ rel: path.relative(ROOT, file), open, close });
  }
}

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
