# Sitemap lastmod の生成と検証

2026-09-06から、HTMLの内容を比較したGit履歴を使う。公開済みの古い日付を下限にせず、変更したHTMLの件数でも除外しない。9/5監査H6の復元案は旧40ファイル判定に依存していたため、その日付を一括採用しない。

## 何を更新として数えるか

- 本文・タイトル・見出し、検索用説明、canonical・言語対応。
- ページ上のリンク先、画像・動画等の参照と説明。
- JSON-LDの内容。キー順・空白・`dateModified` / `datePublished` / `copyrightYear` だけの変更は除く。

CSS/JSの参照、class/style、外側のレイアウト要素、著作権の年、UTM等の計測用パラメータだけの変更は数えない。App Storeの`ct`/`pt`だけの変更も除く。表示先が変わる`ppid`、ストアの国・アプリID、機能用の検索条件は残す。JSON-LDの解析に失敗した場合は無視せず、変更として検出する。JSON-LD自体の正しさは既存SEO検査で確認する。

Gitのfirst-parentの差分から、内容が変わったコミットの日付をJSTで取得する。通常マージもsquashも対象で、41ページ以上のリンク・本文・構造化データの変更を取りこぼさない。新規・未コミットの実質変更は未公開として当日の候補日を使い、コミット後に再検証する。履歴の浅いcheckoutや、追跡済みなのに履歴を解決できないページでは停止する。既存ページへ今日の日付を代入して続行しない。

サイトマップ索引のlastmodは、子XMLファイル自体が変更された日付を使う。記事の最大日付とは別の定義である。

## 編集時の手順

完全なGit履歴があるチェックアウトで実行する。

```sh
python3 scripts/generate_sitemap.py
python3 scripts/generate_sitemap.py --selftest
python3 scripts/generate_sitemap.py --check
```

HTMLの実質変更がある場合は、生成されたXMLを同じコミットへ含める。コミット・マージをまたいでJSTの日付が変わった場合も再検証する。CSSだけの変更で日付が変わった場合は、実際の差分を調べてから修正する。

`--check` はURL集合に加え、欠けた日付、古すぎる日付、水増しした日付、未来・不正な暦日、重複URL、壊れたXMLを検出する。XMLに手で新しい日付を書いても履歴との不一致で失敗する。CIも完全履歴を取得して同じ検査を実行する。

公開運転表を更新する既存の `autopilot-act.yml` も、本文の同期後に生成・検査を行い、4つのXMLを同じPRへ含める。許可する追加出力はこの4ファイルだけで、他のパスの拒否や緊急停止は維持する。

## 範囲と限界

この方法は静的HTMLのソース変更を再現する。Googleが再取得した日時や、ランキングへの効果を示すものではない。同じURLの画像バイナリの差し替え、外部データ、JavaScript実行後だけに現れる内容を独立に追跡する仕組みではない。そのような実質変更では、対応するHTMLの内容・参照を同じ変更に含め、配信後の内容を確認する。記事を再測定せずに測定日を書き換える用途には使わない。

Googleは本文・構造化データ・リンクの重要な更新に対応する、検証可能なlastmodを案内している。[Google Search Central](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)。子XMLの更新日とページ更新日の区別は[Sitemaps protocol](https://www.sitemaps.org/protocol.html#index)に従う。
