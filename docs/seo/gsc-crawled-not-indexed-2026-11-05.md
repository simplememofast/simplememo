# GSC「クロール済み - インデックス未登録」182件（2026-11-05）

オーナー提供の一覧182件を `gsc-crawled-cases-2026-11-05.json` に全件保存した。
レポート最終更新は提示どおり2026-10-23、検証開始2026-09-29、不合格2026-10-10。
個別クロール日には10-25まで含まれる。表示日時の食い違いを推測で補正していない。
空白を含む21URLも行末まで保持し、クエリや日本語ファイル名を切り捨てていない。

この変更は配信方針と表示不具合の修正。Googleが未登録にした原因や、修正後の登録を
断定するものではない。URL検査のGoogle選択canonical・取得HTML・現在の登録判定は未確認。

## 現状の全件照合

基準コードは `e4431b97f7d183175c672c737be79858b4bdb187`。
2026-11-05の公開HTTP監査は今回182件と過去のケースを統合した311件すべてを実行し、
応答・転送先・canonical・サイトマップ・robotsの既存条件を確認した。
`--baseline` は未公開変更の反映を要求しない。成功は登録済み・デプロイ済みの証明ではない。

| 配信用途 | 今回の件数 | 観測と対応 |
|---|---:|---|
| 正規HTML | 15 | 直接200・自己canonical・noindexなし・サイトマップ掲載。ソース内の直接内部リンクも確認 |
| 旧URL・言語クエリ | 23 | 301で最終の正規URLへ。終点は200・自己canonical。既存の転送を維持 |
| `/data/` のJSON/CSV | 29 | JSON28件はnoindex済み。`benchmark-2026.csv` 1件に追加 |
| 配布例・生の検証データ・LICENSE | 111 | CSV5件はnoindex済み。残る106件に追加 |
| MP4/WEBM動画 | 4 | 200・適切な動画MIME・noindexなし。取得と既存の検索許可を維持 |
| 計 | 182 | |

生データ・配布ファイル140件のうち、33件は既にnoindex、107件は未設定だった。
今回一覧と10-14一覧123件の共通URLは44件。既存監査の合格を今回全件の検証と読み替えていない。
全期間の重複除去後は311件（HTML106、転送60、既存noindex HTML1、生データ29、配布111、動画4）。

代表の8多言語ページは、実際の翻訳本文・11本のhreflangを持っていた。
`/zh/siri/` にも中国語12ページから15本の直接リンクがあり、孤立していない。
canonicalの翻訳元への付け替え、正規ページの一律noindex、無関係な内部リンク追加は行わない。

## 修正

### 生ファイルのnoindex

`_headers` と `functions/_middleware.js` の両方に同じ対象を設定する。

- `/data/`: `.json`、`.csv`
- `/assets/downloads/`: `.md`、`.json`、`.csv`、`.swift`、`.canvas`
- `/assets/evidence/`: `.md`、`.json`
- `/memo-inbox/LICENSE`: 完全一致

本文、Content-Type、ETag、キャッシュ、200/206/304を維持する。エラー応答と既存の
配信禁止ルールは変えない。robots.txtでは取得を禁止せず、Googleがnoindexを読めるようにする。
画像・音声・動画・PDFや説明用HTMLは対象外。サイトマップの対象URL集合も変更しない。

Unicodeが原因ではない。従来の条件が `/data/*.json` と `/assets/downloads/*.csv` のみで、
Markdown等が日本語名・ASCII名の両方で対象外になっていた。

### AI-tagsの初期デモ

韓国語など8言語のAI-tagsページでは、音声入力は翻訳されているのに、初期表示のノートは
日本語のままだった。タブ操作後は既存の承認済み翻訳に切り替わるため、表示が食い違っていた。

生成器で初期 `#demo-note` だけを、完全一致する承認済みプログラム文字列の訳に揃える。
通常の `pre/code` や利用者の入力を翻訳する保護規則は変更しない。8生成ページの差分は
初期デモ内だけ。翻訳カタログ・実行時JS・人手編集のJA/ENページは変更しない。
新たな母語話者レビューは未実施。既存訳を再利用しており、未登録との因果関係は未証明。

## 検証と残件

- GSC source/selftest: 今回182件を含む311件。本文・MIME・304・206・エラー保持、
  UTF-8/エンコード済みパス、クエリ、対象外画像・動画・HTMLを検査。
  JSON/CSVの既存MIME検査は維持し、新規形式のみ必要な汎用MIMEを許可。
- URL正規化: 1321件。publication方針: selftest31件と整合性チェック。
- 翻訳: pipeline38件、validation27件。8言語の初期デモと実際のタブ用文字列の一致を確認。
- 全翻訳生成物2161件に差分なし。サイトマップ2387ページのURL集合・内容履歴のlastmod一致。
  lastmod更新は今回修正したAI-tagsの8ページだけ。
- セキュリティ・admin退役: 28件。公開asset検査: 14件。
  macOSのテスト用TMPDIRは実体パスへ正規化して実行し、検査コードは変更していない。
- 全サイトSEO検査は終了コード1、エラー0・警告2655。隔離した変更前HEADでも全文同一。
  DESC1646・TITLE779・既存保留227・LLMS鮮度3。警告やゲートを弱めて通していない。

本番へのマージ・デプロイ、Search Consoleでの検証再開・登録リクエストはこの作業では行わない。
公開が別途承認された後、既存 `GSC Crawled URL Checks` の `--live` が新しいnoindexを含めて
厳格に確認する。Google再クロール後、生ファイルは意図した除外として評価し、正規HTMLは
URL検査と実際の検索表示を確認する。件数ゼロを成功条件にせず、登録を保証しない。

## 仕様の根拠

- [Google: noindex（HTTPヘッダーと取得許可）](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Google: 多言語ページ（翻訳本文とhreflang）](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google: 動画SEO（動画ファイルの取得とインデックス許可）](https://developers.google.com/search/docs/appearance/video)
- [Search Console: ページ登録レポート](https://support.google.com/webmasters/answer/7440203?hl=en)
