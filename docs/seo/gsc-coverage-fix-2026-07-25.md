# GSCインデックス登録カバレッジ 3バケット — 恒久対策 2026-07-25

データソース: GSCページインデックス登録レポート（最終更新 2026-07-10、検証不合格 07-11）の3バケット
— リダイレクトあり79 / 404 7 / クロール済み-インデックス未登録86。
07-16（`gsc-analysis-2026-07-16.md`）・07-19（`gsc-coverage-triage-2026-07-19.md`）と同一データセット。

**前2回との違い**: 07-16/07-19は「大半が仕様どおり・残像」と判定してトリアージで止めた。
本レポートは *その判定を維持したまま*、**Googleが同じURLを再クロールし続ける原因そのものを潰す**
エッジ側の恒久対策を実装した回である。加えて、3バケットの調査中に見つかった
**サイト全体のAIO欠陥（隠しEN本文が生HTMLの60〜66%を占める）** を修正した。

---

## 1. 実施サマリ

| # | 対象バケット | 施策 | 効果 |
|---|---|---|---|
| 1 | 404 (7) | 捏造スラッグ6件を **410 Gone** で応答 | 404は「後で再確認」、410は「二度と存在しない」。Googleのインデックス除外が大幅に速くなり、バケットから消える |
| 2 | リダイレクト (79) | 退役パス表をMiddlewareへ集約し、**全変種を1ホップ化** | `?lang=` + 退役スラッグ等が2ホップ→1ホップ。中間URLがGSCに計上されなくなる |
| 3 | リダイレクト (79) / 未登録 (86) | 参照系パラメータ（`ref`/`from`/`source`/`q`）を**301で剥がす**＋robots.txtのパラメータDisallowを**撤去** | 被リンク由来の重複URLを正規URLへ統合。robotsブロックは「Googleが正規化シグナルを読めない」状態を作るため逆効果だった |
| 4 | 未登録 (86) / AIO全般 | dual-DOMの言語ブロックに **`lang` 属性を付与**（158ファイル / 18,964要素） | 生HTMLの60〜66%を占める隠しEN本文が、初めて機械可読に言語識別される |
| 5 | 全般 | タイトル7件・ディスクリプション5件の長さ超過を修正 | SERPでの途中切れ解消。`seo-check` のTITLE/DESC警告 **12→0** |

`node scripts/seo-check.js` → **0 errors / 164 warnings**（12→0でTITLE・DESC警告が消え、
残りは全て後述§5の HREFLANG 警告。errorsは従来どおり0）。

---

## 2. 404バケット: 410 Gone への切替

対象6スラッグ（`functions/_middleware.js` の `GONE`）:

```
/blog/offline-first-outbox-teardown
/blog/email-inbox-as-task-manager
/blog/energy-budget-field-notes
/blog/ios-cold-start-1-4s-to-287ms
/blog/i-was-wrong-about-todo-debt
/blog/no-third-party-deps-ios-18-months
```

いずれも 07-02 / 07-16 に **git全履歴・全ソース・全sitemapに存在しない**ことを検証済みの
捏造スラッグ（HN風英語スラッグ + 自社用語の模倣 = バックリンク・インジェクション）。

**なぜ今まで消えなかったか**: 404は「一時的に無いだけかもしれない」という意味なので、
Googleは数ヶ月にわたり再クロールを繰り返す。実際 GSC の前回クロール日は 05-31〜07-09 と
継続的に更新されていた。410 Gone は「このURLは意図的に恒久削除された」という明示シグナルで、
Googleは再クロールを打ち切りインデックスから落とす。リダイレクトではないので
**捏造URLに正規ページの評価を渡すこともない** — 07-02オーナー決定（リダイレクト不可）と矛盾しない。

`.html` 付きでリクエストされた場合も正規化後に判定するため、両形とも410になる。

`/cdn-cgi/l/email-protection`（7件目）は Cloudflare がPages Functionsより前段で処理するため
コード側で触れない。サイトHTMLに `email-protection` リンクは **0件**（実測）で、
robots.txt の `Disallow: /cdn-cgi/` も従来どおり維持。自然消滅を待つ。

---

## 3. リダイレクトバケット: 1ホップ化とパラメータ正規化

### 3-1. 退役パスをMiddlewareへ集約（2ホップ → 1ホップ）

従来 `_redirects`（静的）と Middleware（動的）に退役パスが分散しており、
Pages Functions が `_redirects` より **先に** 走るため、次のような多段ホップが発生していた:

```
/blog/memo-shuukan-tips.html?lang=ja
  → 301 (Middleware: .html剥がし)  /blog/memo-shuukan-tips
  → 301 (_redirects)               /blog/memo-habit
```

Middleware に `RETIRED` マップを置き、**`?lang=` 剥がし → `.html` 剥がし → 退役パス解決を
1回の301にまとめた**。GSCはリダイレクトチェーンの中間URLも「ページにリダイレクトがあります」
として計上するため、ホップ数の削減がそのままバケット件数の削減になる。

実測（`Response` を直接検証、全ケース1ホップ）:

| リクエスト | 結果 |
|---|---|
| `/blog/memo-shuukan-tips.html?lang=ja` | 301 → `/blog/memo-habit` |
| `/blog/captio-discontinued.html?lang=ja` | 301 → `/blog/captio-discontinued` |
| `/vs/trello/?lang=en` | 301 → `/vs/` |
| `/privacy-policy/` | 301 → `/privacy` |
| `/en/blog/why-captio-died` | 301 → `/en/captio-alternative/` |
| `/blog/energy-budget-field-notes[.html]` | **410** |

`_redirects` は Functions のデプロイ失敗時のフォールバックとして残置（両者を同期させる旨をコメント記載）。

### 3-2. 参照系パラメータの301剥がし + robots.txt Disallow撤去

GSCに残っていた実例:

```
https://simplememofast.com/?ref=launches.uicomet.com
https://simplememofast.com/?from=AppAgg.com&utm_campaign=…&utm_medium=referral&utm_source=…
https://simplememofast.com/blog/?q={search_term_string}
```

**robots.txtでブロックしていたのが逆効果だった**。robotsでDisallowすると Googlebot は
そのURLを取得できず、したがって canonical も301も**永遠に見られない** — URLはインデックスから
消えるのではなく「ブロック済み」として滞留し続ける。これは `?lang=` を意図的に
Disallowしていない理由（Middlewareのコメントに既述）とまったく同じ論理で、
`ref`/`from`/`source`/utm系にだけ適用されていなかった。

対応:

- **`ref` / `from` / `source` / `q` は301で剥がす** — 文書ではなく流入元を表すパラメータなので、
  被リンクの評価を正規URLへ統合できる。`?q=` は撤去済みSearchActionスキーマの残骸リテラル
- **`utm_*` / `gclid` / `fbclid` は301しない** — GA4と広告プラットフォームが着地URLから読むため、
  リダイレクトすると計測が壊れる。自己参照canonicalによる重複解決に委ねる
- **robots.txt から6行のパラメータDisallowを撤去** — 上記2経路のどちらも、
  Googlebotがページを取得できて初めて機能するため

`/?from=AppAgg.com&utm_campaign=…` は `?utm_campaign=…&utm_medium=referral&utm_source=…` を
保持したまま301する（計測を壊さず重複だけ畳む）ことを実測で確認済み。

---

## 4. AIO恒久対策: dual-DOMに `lang` 属性を付与（本PR最大の変更）

### 4-1. 発見した欠陥

本サイトの大半のページは日英双方の本文を1つのHTMLに同梱し、
`[data-lang="en"]{display:none}` で非アクティブ側を隠している（dual-DOM）。
バケット調査中に、この構造の**生HTML上の比率**を実測した:

| ページ | 生テキスト総量 | JAブロック | ENブロック | **EN比率** |
|---|---|---|---|---|
| `/vs/standard-notes/` | 12,517字 | 4,283 | 7,984 | **63.8%** |
| `/methods/zettelkasten/` | 12,504字 | 4,199 | 8,042 | **64.3%** |
| `/use-cases/commute/` | 8,193字 | 2,508 | 5,431 | **66.3%** |
| `/blog/how-to-choose-memo-app` | 12,207字 | 4,459 | 7,290 | **59.7%** |
| `/glossary/pkm/` | 4,890字 | 1,720 | 2,927 | **59.9%** |

そして **言語宣言は `<html lang="ja">` ただ1つ**、個々のブロックに `lang` 属性は
**0件**（実測）だった。

つまり CSS を適用しない読み手 — **GPTBot / ClaudeBot / PerplexityBot などのAIクローラ、
リーダーモード抽出、翻訳ツール** — から見ると、本サイトの158ページは
「日本語と宣言されているのに本文の6割強が英語で、しかも文単位で交互に混ざった文書」
に見える。AIによる引用・要約の質を直接損なう構造であり、
**AIO対策としては最優先で潰すべき欠陥**だった。
Google自身のレンダラはCSSを適用するので可視JAのみを索引する（したがって
これがインデックス未登録の *証明された* 原因とまでは言えない）が、
AI側の抽出品質には確実に効いている。

### 4-2. 対応

`scripts/annotate-lang-parts.js`（新規・冪等・`--check` でCI検証可）を追加し、
`data-lang="ja|en"` を持つ全要素に対応する `lang` 属性を付与した。

- **158ファイル / 18,964要素** に付与
- `lang` は HTML標準の「文書内での言語の切り替え」表明であり、AIクローラ・
  抽出パイプラインが言語を分離するための唯一の標準的手掛かり
- **WCAG 3.1.2 (Language of Parts) の不適合も同時に解消** — 従来はスクリーンリーダーが
  英語本文を日本語の音声エンジンで読み上げていた
- 表示・挙動は不変: `/js/lang.js` は `data-lang` と `.active` クラスのみを見ており、
  `lang` は参照しない（`document.documentElement.lang` だけは読むが、これは `<html>` 要素で今回対象外）
- `<style>` / `<script>` 内のCSSセレクタ（トグルの実体）は書き換え対象から除外

**検証**:
- 変更後の168 HTMLファイルすべてを HTMLパーサで走査 → **18,964要素すべてが `data-lang` と一致する `lang` を保持、破損0件**
- 変更前後でタグを除去した可視テキストを比較 → **意図的に文言を変えた11ファイル以外は完全一致**（属性追加のみで本文は無改変）
- 再実行で差分0（冪等性を確認）

### 4-3. 恒久的な解決との関係

本質的な解決は「1ページ = 1言語 = 1URL」であり、既存の `scripts/strip_dual_dom.py` が
**EN版URLを持つ21ページ**についてそれを実施済み。今回の `lang` 付与は、
**EN版URLをまだ持たない残り158ページ**に対する、低リスクで即効性のある橋渡しである。
EN版URLを新設した時点で `strip_dual_dom.py` の対象に移せばよい。

---

## 5. HREFLANG警告164件を「あえて残した」理由

`seo-check.js` は on-page hreflang を持たない164ページを警告する。今回**意図的に追加しなかった**。

これらは EN本文をページ内に抱えているものの **EN専用URLが存在しない**ため、
宣言できる代替URLが無い。自己参照のみの hreflang は Google にとって no-op であり、
164ページ × 2行の無意味なマークアップを増やすだけになる。
`sitemap-ja.xml` 側もこれらのURLには hreflang を出しておらず（実測）、
**現状のシグナルは矛盾なく整合している**。

EN版URLを新設したページから順に、既存の3点セット
（`hreflang="ja"` / `hreflang="en"` / `x-default`）を付けていくのが正しい順序。
警告はその進捗メーターとして残す。

---

## 6. タイトル・ディスクリプション長の修正

| ファイル | 種別 | 変更 |
|---|---|---|
| `ar/index.html` | title | 86 → 68字 |
| `es/index.html` | title | 81 → 69字 |
| `id/index.html` | title | 93 → 69字 |
| `pt-BR/index.html` | title | 85 → 70字 |
| `tr/index.html` | title | 96 → 67字 |
| `blog/productivity-methods-comparison.html` | title | 71 → 62字 |
| `en/blog/ios26-speechanalyzer-live-mic.html` | title | 81 → 62字 |
| `en/ai-tags/index.html` | description | 163 → 148字 |
| `en/blog/fleeting-notes.html` | description | 175 → 152字 |
| `en/blog/ios26-speechanalyzer-live-mic.html` | description | 170 → 158字 |
| `en/blog/obsidian-iphone-memo.html` | description | 178 → 160字 |
| `en/blog/obsidian-voice-input.html` | description | 175 → 152字 |

ブランドサフィックス `| Simple Memo - for Obsidian` は全ロケールで統一されているため維持し、
先頭の訴求部だけを短縮した（ko / zh / zh-Hant の既存の簡潔な書式に合わせた）。
sitemapの `lastmod` は**実際に本文が変わったこの11ページのみ**更新。
`lang` 属性付与の158ページは技術的マークアップの変更であり、
コンテンツ更新を偽装しないため lastmod は据え置いた。

---

## 7. マージ後の自動実行 / オーナーアクション

**自動**:
- IndexNow送信: 本PRで本文が変わった11URL

**オーナーアクション（GSC、任意）**:
1. **「見つかりませんでした（404）」バケットの「検証を開始」を押す** — 今回初めて押す価値がある。
   410化により再クロールで恒久除外に入る
2. **「ページにリダイレクトがあります」バケットも押してよい** — 1ホップ化により、
   従来カウントされていた中間URLが解消される
3. 「クロール済み - インデックス未登録」は従来どおり放置で可

**次サイクルの評価軸**:
- 8月第1週のGSCカバレッジで 404バケット 7 → 1（`/cdn-cgi/…` のみ）を確認
- リダイレクトバケットの件数推移（1ホップ化の効果は反映に数週間かかる）
- AI経由クエリの引用品質 — `lang` 付与後に AI Overviews / Perplexity での
  日本語ページ引用が英語混じりにならないかを目視確認
