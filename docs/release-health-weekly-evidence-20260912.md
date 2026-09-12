# 公開判定の週次健康度：本番収集と残る条件

確認日時：2026-09-12T10:05:02Z。AI実行率は158/179（88.268156424581%）のまま。
今回の実装・収集だけでは、App Store公開や課金導線改善の実行実績を加点しない。

## 実装と本番稼働

- [iOS PR494](https://github.com/simplememofast/simplememo-ios/pull/494)を全CI成功後、2026-09-12T10:03:19Zにマージ。マージSHAは`bc71fa78f7756d740680c9a7846af171f75b7e71`。
- [ASC Analytics run34687436498](https://github.com/simplememofast/simplememo-ios/actions/runs/34687436498)はそのSHAで通常の全対象収集を実行し、成功した。集計保存コミットは`836d6f36281b0dd51c5ce0de20e18d1e2caa733c`。
- 続く[ASC Metrics run34687491662](https://github.com/simplememofast/simplememo-ios/actions/runs/34687491662)も成功。`create_request=false`で公開版履歴と判定材料を読み取り、`46816f29fba6a68c323adba2f795a69eb15b8a0d`へ保存した。
- 健康度12テスト・112 assertions、材料整形278件、Analytics96件、パイプライン5テスト・110 assertionsが成功。独立レビューも完了した。TestFlight配信は行っていない。

## 実際に取得できたもの

対象は同じ確定週の`App Sessions Standard`と`App Crashes`。Appleの報告に含まれるiPhone/iPadの同意済み利用を扱う。Expandedや日次の部分集計はこの母数へ混ぜない。

| 項目 | 読み戻した結果 |
|---|---|
| 固定対象週 | 2026-08-31〜2026-09-06 |
| 現在公開版 | 5.8.54 |
| 事前に定めた比較版 | 直前公開版5.8.46。65件の完全なASC版履歴から選定 |
| 週次セッション報告 | 取得済み。processingDate=2026-09-11、取得時刻2026-09-12T10:03:54Z |
| 対象2版のセッション | どちらもその週の版別内訳に無い。全版合計で代用しない |
| 週次クラッシュ報告 | 未受信。確認時刻2026-09-12T10:04:13Z |
| 判定材料 | `weekly_health.state=unavailable`、`reason=version_missing_or_invalid`。`health.sessions`と両率は欠測 |

集計は非公開のiOSリポジトリ内`data/asc-release-health/`にあり、生の行、署名付きURL、認証情報は保存しない。この文書は保存済み集計と判定材料の確認結果だけを示す。

## 次の実行条件

率を計算する経路は実装・本番稼働済み。今後は既存の日次収集で、固定対象週と両版の実報告が届いたかを確認する。両版それぞれ100セッション以上、同じ週・アプリ・端末範囲、24時間以内の取得が必要。データがある別版や古い週を選び直さない。

[Appleの訂正仕様](https://developer.apple.com/documentation/analytics-reports/data-completeness-corrections)に従い、対象Dateの最新訂正で週全体を置換する。削除された版を旧instanceから補完しない。別週だけの新しい訂正は対象週を消さず、空・競合・取得失敗は古い成功値を復活させない。失敗状態も保存先へ反映する。

App Store公開（task78）と課金導線改善（task142）は引き続き待機。率が得られた後も、既存の1ポイント以内の悪化幅、承認後6時間、kill後7日、段階公開、日次上限などの条件を満たし、実際の適用を確認する必要がある。5.8.54の既存の自動公開を、後から独立ゲート通過へ読み替えない。今回の収集処理のための再提出や小幅TestFlightは不要。
