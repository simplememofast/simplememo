# 購入データの観測日数を同期する

ASC APIによる実データ取得と集計は、非公開の`simplememo-ios`リポジトリで行う。
公開側は`growth/scripts/revenue-series.mjs`を通じて、日数・対象窓・生成時刻だけを写す。
金額、購入行、流入元、個人情報はこの写しに含めない。

## 日別v2の意味

`asc_revenue_v2`はAppleのStandard購入レポートから、最新processingDateの版を日付単位で選ぶ。
`covered_days`は**現在の28日窓に確定版がある日数**であり、旧スパンの累計暦日数ではない。
日付の移動・新しい訂正・欠測により減ることがある。日次の行がない日を売上0にしない。

読み手は日別の処理日と欠測・暫定・矛盾の日付を照合してから写す。
日数を28に書き換えただけの出力、未来の生成時刻、不正な日付、未知schemaは受け入れない。
旧スパンからv2への移行、新しいv2の訂正による日数減少は受け入れる。
古い生成時刻・古い対象窓への巻き戻し、同じ生成時刻で異なる内容、v2から旧スパンへの復帰は拒否する。

`monthly_ready`は互換用の名称で、28日分の観測完了だけを意味する。
確定入金・利益・月額への換算・SEO/AIOの純LTVを計算できるという意味ではない。
完全な暦週・暦月にはAppleのWeekly/Monthlyとの別途照合が必要。

## 更新

既定の取得元は`../simplememo-ios/data/revenue/series.json`。
隔離した作業場所やAPIで回収した固定スナップショットを使う場合は、
`ASC_REVENUE_SERIES_PATH`へ非公開ファイルの絶対パスを設定して同じ生成器を実行する。
認証情報をこの変数へ入れない。APIを呼ぶ変数ではない。

```sh
node growth/scripts/revenue-series.mjs --selftest
node growth/scripts/revenue-series.mjs --write
node growth/scripts/revenue-series.mjs --check
```

更新されるのは`data/revenue-series.json`と、方針の`revenue_history_days`。
読み取れない入力を0日に変換しない。CIで非公開リポジトリが見えない場合も、既存の写しを保持する。
取得元のschema・実行時刻・対象窓は非公開の分析証跡と合わせて確認する。
