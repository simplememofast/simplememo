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

/**
 * **入れ子にできないコメントに、書き込みが割り込んでいないか。**
 *
 * [2026-09-03] `/captio-alternative/` の `<head>` に、本番でこう出ていた:
 *
 *     <!-- JSON-LD: FAQPage is auto-generated near  <!-- faq-schema: … -->
 *     <script type="application/ld+json">{…}</script>
 *     </head> by scripts/inject_faq_schema.py -->
 *
 * `scripts/inject_faq_schema.py` が「最初の `</head>` の直前へ入れる」実装で、
 * その最初の `</head>` が**注釈の文言の中**にあった。**HTMLのコメントは入れ子にできない**ので、
 * コメントは差し込まれたブロックの最初の `-->` で終わり、
 * 残った `</head> by scripts/inject_faq_schema.py -->` が**生のマークアップになった。**
 *
 * 帰結は2つ。**`</head>` が本来より 790 行手前へ移り**、以降の JSON-LD と
 * 計測タグが `<body>` へ落ちた。そして
 * **`by scripts/inject_faq_schema.py -->` が、その本番ページの本文1行目に表示されていた。**
 *
 * **SEOの12ゲートは全部緑だった。**この検査が `<script>` の数だけを見ていたのと同じ理由で、
 * 正規表現はコメントの内と外を区別しない。
 *
 * 見るのは2つだけ: **コメントの中に `<!--` があるか**（割り込みの跡）と、
 * **どのコメントにも属さない `-->` があるか**（はみ出した尻尾）。
 */
export function commentDefects(html) {
  const out = [];
  const re = /<!--([\s\S]*?)-->/g;
  const spans = [];
  let m;
  while ((m = re.exec(html))) {
    spans.push([m.index, m.index + m[0].length]);
    if (m[1].includes('<!--')) {
      out.push({ kind: 'nested', at: m.index,
        text: m[0].replace(/\s+/g, ' ').slice(0, 100) });
    }
  }
  const inside = (i) => spans.some(([a, b]) => i >= a && i < b);
  for (const t of html.matchAll(/-->/g)) {
    if (!inside(t.index)) {
      out.push({ kind: 'stray-close', at: t.index,
        text: html.slice(Math.max(0, t.index - 60), t.index + 3).replace(/\s+/g, ' ') });
    }
  }
  return out;
}

/**
 * **要素の開閉が合っているか。**閉じ忘れ・余分な閉じタグ・交差した入れ子を挙げる。
 *
 * [2026-09-03] 全269面を初めて通したところ 5面で崩れていた:
 * `</html>` が無い（`/autopilot/` —— **プレスリリースの着地面**）、
 * `</span>` のつもりで `</p>` を書いた、列0に裸の `</div>` が3つ、
 * `faq.html` は `<div class="container">` と `<div class="lang-body">` が
 * **`</main>` まで閉じていなかった。**
 *
 * どれもブラウザが黙って直すので**画面では気づけない。**
 * `check-script-tags` が `<script>` 専用だったので、他の要素は誰も数えていなかった。
 *
 * **終了タグを省略できる要素は数えない**（`<p>` `<li>` `<td>` 等）。
 * 省略は仕様どおりで、落とすと過検出になる。
 */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'source', 'track', 'wbr']);
const OPTIONAL_END = new Set(['p', 'li', 'dt', 'dd', 'option', 'thead', 'tbody',
  'tfoot', 'tr', 'td', 'th', 'rt', 'rp']);
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

export function structureDefects(html) {
  // コメント・script・style は**同じ長さの空白へ潰す**（行番号を保つため）
  const blank = (m) => ' '.repeat(m.length);
  const src = html.replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<script[\s\S]*?<\/script>/gi, blank)
    .replace(/<style[\s\S]*?<\/style>/gi, blank);
  const lineAt = (i) => html.slice(0, i).split('\n').length;
  const stack = []; const out = []; let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(src))) {
    const [, close, raw, , self] = m; const tag = raw.toLowerCase();
    if (close) {
      let i = stack.length - 1;
      for (; i >= 0; i--) if (stack[i].tag === tag) break;
      if (i < 0) {
        if (!OPTIONAL_END.has(tag)) out.push({ kind: 'stray-end', tag, line: lineAt(m.index) });
        continue;
      }
      for (let j = stack.length - 1; j > i; j--) {
        if (!OPTIONAL_END.has(stack[j].tag)) {
          out.push({ kind: 'implicit-close', tag: stack[j].tag, line: stack[j].line,
            by: tag, byLine: lineAt(m.index) });
        }
      }
      stack.length = i; continue;
    }
    if (VOID_TAGS.has(tag) || self) continue;
    stack.push({ tag, line: lineAt(m.index) });
  }
  for (const s of stack) {
    if (!OPTIONAL_END.has(s.tag)) out.push({ kind: 'never-closed', tag: s.tag, line: s.line });
  }
  return out;
}

export function scanFiles(fileList, read = (f) => fs.readFileSync(f, 'utf8')) {
  const found = [];
  for (const file of fileList) {
    const html = read(file);
    const rel = path.relative(ROOT, file);
    const r = unbalanced(html);
    if (r) found.push({ rel, kind: 'script', ...r });
    for (const c of commentDefects(html)) found.push({ rel, ...c });
    for (const d of structureDefects(html)) found.push({ rel, ...d });
  }
  return found;
}

/** 指摘を1行にする。**何を直せばいいかを、読んだ人がその場で分かる形で。** */
export function describe(p) {
  switch (p.kind) {
    case 'script': return `${p.rel} — <script> 開き ${p.open} / 閉じ ${p.close}`;
    case 'nested': return `${p.rel} — **コメントの中に <!-- がある**（書き込みが割り込んだ跡）\n      ${p.text}`;
    case 'stray-close': return `${p.rel} — **どのコメントにも属さない --> がある**（コメントが途中で終わっている）\n      …${p.text}`;
    case 'stray-end': return `${p.rel}:${p.line} — 余分な </${p.tag}>`;
    case 'implicit-close': return `${p.rel}:${p.line} — <${p.tag}> が </${p.by}>（${p.byLine}行目）で暗黙に閉じた（入れ子が交差している）`;
    case 'never-closed': return `${p.rel}:${p.line} — <${p.tag}> が最後まで閉じない`;
    default: return `${p.rel} — ${JSON.stringify(p)}`;
  }
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
  ['**コメントへの割り込みは落ちる**（2026-09-03 に本番の本文1行目へ出た形）', () => {
    const broken = '<head>\n  <!-- near </head> by x.py  <!-- injected -->\n'
      + '  <script type="application/ld+json">{}</script>\n</head> by x.py -->\n';
    const d = commentDefects(broken);
    if (!d.some((x) => x.kind === 'nested')) throw new Error('割り込みの跡を見ていない');
    if (!d.some((x) => x.kind === 'stray-close')) throw new Error('はみ出した --> を見ていない');
  }],
  ['**正しいコメントは落とさない**（連続していても入れ子ではない）', () => {
    const ok = '<!-- a --><!-- b -->\n<!-- 複数行\n     続き -->\n<div>x</div>';
    if (commentDefects(ok).length) throw new Error(JSON.stringify(commentDefects(ok)));
  }],
  ['**閉じない要素は落ちる**（`/autopilot/` に </html> が無かった）', () => {
    const d = structureDefects('<html><body><div>x</div></body>');
    if (!d.some((x) => x.kind === 'never-closed' && x.tag === 'html')) throw new Error(JSON.stringify(d));
  }],
  ['**余分な閉じタグは落ちる**（列0に裸の </div> が3つあった）', () => {
    const d = structureDefects('<section><div>x</div></div></section>');
    if (!d.some((x) => x.kind === 'stray-end' && x.tag === 'div')) throw new Error(JSON.stringify(d));
  }],
  ['**交差した入れ子は落ちる**（</span> のつもりで </p> を書いた形）', () => {
    const d = structureDefects('<p><span>x</p>');
    if (!d.some((x) => x.kind === 'implicit-close' && x.tag === 'span')) throw new Error(JSON.stringify(d));
  }],
  ['終了タグを省略できる要素は落とさない（**仕様どおりの書き方を禁止しない**）', () => {
    for (const html of ['<div><p>a<p>b</div>', '<ul><li>a<li>b</ul>',
      '<table><tr><td>a<td>b</table>']) {
      const d = structureDefects(html);
      if (d.length) throw new Error(`${html} → ${JSON.stringify(d)}`);
    }
  }],
  ['**script / style / コメントの中のタグは数えない**（偽陽性を作らない）', () => {
    const html = '<div><script>if(a<b){}</script><style>/* <div> */</style>'
      + '<!-- <div> --></div>';
    const d = structureDefects(html);
    if (d.length) throw new Error(JSON.stringify(d));
  }],
  ['実データが検査を通る', () => {
    const found = scanFiles(collectHtmlFiles(ROOT, {
      skipDirs: ['node_modules', '.git', 'screenshots'], skipFiles: [],
    }));
    if (found.length) throw new Error(`実データで ${found.length} 件`);
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

const files = collectHtmlFiles(ROOT, {
  skipDirs: ['node_modules', '.git', 'screenshots'],
  skipFiles: [],
});

const problems = scanFiles(files);

if (problems.length) {
  console.error(`マークアップが壊れている面があります（${problems.length} 件）:`);
  for (const p of problems) console.error(`  ${describe(p)}`);
  console.error(
    '\n開きっぱなしの <script> は、次の </script> までの head を丸ごと飲み込みます。'
    + '\ntitle・description・canonical・JSON-LD がクローラから消えます。'
    + '\n\nコメントへの割り込みも同じ種類の壊れ方をします —— **HTMLのコメントは入れ子にできない**ので、'
    + '\n差し込みが注釈の中へ入ると、そこでコメントが終わり、残りが**本文の文字として表示されます。**'
    + '\n2026-09-03、`by scripts/inject_faq_schema.py -->` が本番ページの**本文1行目**に出ていました。'
    + '\n\nどれもブラウザが黙って直すので**画面では気づけず、SEOの12ゲートも緑のままです。**',
  );
  process.exit(1);
}

console.log(`マークアップ: ${files.length} 面 — <script> の開閉・コメントの入れ子・要素の開閉、すべて整合`);
}
