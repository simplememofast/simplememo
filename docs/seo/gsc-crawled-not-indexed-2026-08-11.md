# GSC「クロール済み - インデックス未登録」68件 の実態調査（2026-08-11）

対象レポート: ページのインデックス登録 →「クロール済み - インデックス未登録」
最終更新日 2026/08/07 / 該当 68件 / **検証: 失敗（開始 2026/07/28、不合格 2026/08/05）**

## 結論を先に

**68件のうち 61件は、すでに直っているか、直す対象ではない。**
コードに新しい欠陥があって68件出ているわけではない。

| 区分 | 件数 | 状態 |
|---|---:|---|
| クエリ付き変種（`?lang=` / `?q=`） | 35 | `functions/_middleware.js` が 301 済み。**対応不要** |
| `.html` 変種 | 16 | 同上。**対応不要** |
| 正規URL・すでに掲載され流入あり | 10 | レポートが古いだけ。**対応不要** |
| 正規URL・表示回数ゼロ | **7** | **これだけが実際の問題** |
| 合計 | 68 | |

## なぜ「検証: 失敗」になったか

検証が落ちたのはサイト側の不備ではなく、**再クロール待ちの滞留**が原因。

- 51件（クエリ変種35 + `.html`変種16）の最終クロール日は **2026/03〜06**。
  エッジ正規化が入ったのは `functions/_middleware.js` の投入時
  （2026-07-07 / 拡張 2026-07-26）で、**これらのURLは301が実装された後に
  一度も再クロールされていない**。GSCは前回クロール時の判定を保持し続ける。
- 検証期間（07/28〜08/05）はわずか8日。68URLを抱えたバケットを
  この期間で再クロールし切れる見込みはなく、**同じ状態でもう一度
  「検証」を押しても、また落ちる。**

→ 変種URLについては追加の実装余地がない。301は正しく、レポートの
   ドレインを待つのが唯一の正解。

### 「すでに掲載されている」10件の根拠

`growth/data/gsc/2026-08-09/pages.json`（レポートより2日新しい実測）で、
未登録とされたURLのうち10件が表示回数・クリックを獲得している。

| URL | クリック | 表示 | 平均掲載順位 |
|---|---:|---:|---:|
| `/blog/iphone-memo-katsuyou` | 2 | 35 | 8.9 |
| `/vs/bear/` | 2 | 29 | 6.0 |
| `/blog/business-memo-apps-2026` | 0 | 7 | 7.4 |
| `/devlog/day1` | 0 | 6 | 12.0 |
| `/vs/anytype/` | 0 | 4 | 8.0 |
| `/glossary/timeboxing/` | 0 | 3 | 10.3 |
| `/blog/instant-capture-workflow` | 0 | 2 | 10.5 |
| `/vs/todoist/` | 0 | 1 | 1.0 |
| `/blog/freelance-memo-management` | 0 | 1 | 19.0 |
| `/en/blog/why-captio-died` | 0 | 5 | 9.4 |

（`/en/blog/why-captio-died` は 2026-08-08 に 301 済み。掲載は301前の残存）

## 実際の問題: 表示回数ゼロの7件

7件すべてが **サイト内カニバリゼーション**で説明できる。技術的欠陥
（noindex・canonical誤り・リンク切れ・サイトマップ漏れ・薄すぎる本文）は
7件のいずれにも該当しない — canonicalは全件自己参照で正しく、全件が
サイトマップに載り、本文も 4,000〜18,000 文字ある。

| 未登録ページ | 表示 | 競合している既存ページ | 競合側の実績 |
|---|---:|---|---|
| `/blog/memo-app-free-guide` | 0 | `/blog/free-memo-apps-ranking` | 33クリック / 4,027表示 |
| `/blog/line-keep-migration` | 0 | `/blog/line-keep-alternative` ほか計4本 | 45クリック / 5,291表示 |
| `/devlog/captio-alternative` | 0 | `/captio-alternative/` ほか計6本 | 3クリック / 38表示 |
| `/vs/captioo/` | 0 | 同上（Captioクラスタ） | — |
| `/vs/goodnotes/` | 0 | `/vs/` テンプレート群 | — |
| `/vs/mem/` | 0 | 同上 | — |
| `/guides/draft-autosave/` | 0 | `/guides/` はメール連携ガイド群 | — |

## 本コミットで実施した統合（2件）

証拠が明確な2件のみ、既存の「Cannibalization fix」と同じ手順で統合した。

1. `/blog/memo-app-free-guide` → `/blog/free-memo-apps-ranking`
   どちらも 2026年の「無料メモアプリ」クラスタ。統合先が 4,027表示を
   持つ一方、統合元はゼロ。
2. `/devlog/captio-alternative` → `/captio-alternative/`
   開発日誌がランディングページと同一スラッグを占有。Captio関連は
   すでに6本あり、最も価値の低い1本を畳んだ。

変更点: `functions/_middleware.js` の `RETIRED` / `_redirects` /
`sitemap-ja.xml` / 内部リンク7か所の除去 / HTML 2ファイル削除 /
`scripts/check-url-normalization.mjs` に6ケース追加。

## 残り5件の処理（2026-08-11 追記・オーナー判断済み）

方針は「2件統合・3件強化」。表示回数はすべて 2026-08-09 の GSC 実測。

### 統合した2件

| 統合元 | → 統合先 | 判断根拠 |
|---|---|---|
| `/blog/line-keep-migration` | `/blog/line-keep-alternative` | LINE Keep記事4本中の最下位（0表示）。統合先は45クリック/5,291表示 |
| `/vs/mem/` | `/vs/` | Mem は実質終息。`/vs/` テンプレートの薄いページで0表示 |

`/blog/line-keep-migration` は**単純削除していない**。統合先が本文中で
「先に移行手順でデータを退避してから」と誘導しており、消すと導線が宙に浮き、
データ退避手順そのものが失われるため、固有価値のあった「2. データエクスポート
方法」（テキスト/画像・動画/リンク）を統合先の `#line-keep-export` に移設した
うえで301している。統合先にしか無かった `.step-box` のCSSも併せて移設済み。
重複していた章（比較表・他アプリ比較・ワークフロー・FAQ）は統合先が既に
カバーしているため引き継いでいない。

`/vs/mem/` の退避先を `/vs/` にしたのは、`/vs/whatsapp/`・`/vs/telegram/`・
`/vs/trello/`・`/vs/slack-self-dm/` と同じ既存の扱いに揃えたため。

参照の後始末: JSON-LD の `hasPart` 3件（`/vs/`・`/blog/`・`/comparison/`）、
`llms.txt`、`sitemap-ja.xml`、内部リンク9か所。アンカーテキストが退避先でも
成立するものは貼り替え、成立しないカードは除去した。
`/blog/best-memo-apps-2026`（日英）の Mem 紹介カードは、記事本文としての
価値があるためリンクだけ外してテキストは残している。

### 強化した3件

いずれも正当な用途があるため維持し、被リンクを増やした。

| ページ | 被リンク | 追加元 |
|---|---|---|
| `/vs/captioo/` | 3 → 5 | `/captio-alternative/`, `/captio/` |
| `/vs/goodnotes/` | 3 → 5 | `/use-cases/students/`, `/use-cases/reading-notes/` |
| `/guides/draft-autosave/` | 7 → 9 | `/faq`, `/blog/instant-capture-workflow` |

追加先は `docs/content-linking-rules.md` の「手動リンク推奨」に沿って、
話題が実際に隣接するページの `internal-links` ブロックに限定した
（Captioクラスタ→同名アプリの区別、手書き系ユースケース→GoodNotes比較、
下書きが消えたか気にする文脈→自動保存の解説）。

## 参考: 併せて見つかった副次的な事象（今回は未対応）

- **二言語DOM** — `/vs/*` は日本語と英語の全文を同一HTMLに同梱し、
  英語側を `[data-lang="en"]{display:none}` で隠している。`/vs/bear/` では
  レンダリング後テキストの約52%が非表示の英語。`<h1>` にも両言語が
  連結して入る（例: `LINE Keep終了後の完全移行ガイド … Complete LINE Keep
  Migration Guide`）。サイト全体のアーキテクチャであり、本件の主因では
  ないため触っていない。
- **meta description 欠落 17ページ**（大半は `/en/` 配下）。
  インデックス未登録の原因ではないが、スニペット品質には効く。
