# 購読評価と返金の実観測（2026-09-10）

AI実行率の定義・実行者・加点は変更しない。task11の古い「統合未実装」を、現在の実装と実観測の不足へ更新する。task146は実際の返金通知待ちを維持する。個別インストールや取引情報、非公開集計の数値はこの文書へ掲載しない。

## 同一コホートの評価

API [PR #306](https://github.com/simplememofast/simplememo-api/pull/306) は、既存の日次Retention Evaluationに購読cohort readerを追加した。PRの同一head `7e1c611c8c8c54358a415cb5ea4411d391ea83c4` で4チェックが成功し、main `26be97f312f3f4b2812ae1d176b3bbd70622350d` に反映した。

既存workflow [34440775851](https://github.com/simplememofast/simplememo-api/actions/runs/34440775851) を同じmain SHAで実行し、2026-09-10 05:22:07 UTCの本番評価をartifactと非公開APIリポジトリへ保存した。実行・保存の全stepが成功している。

同じ2週・同じas_ofの4読取は成功したが、購読cohortの適格対象は両週とも空だった。旧usage対象の元の初回起動にrelease/ios_device contextが無く、既定の除外条件を満たさない。旧usageの母数を新しい集計へ流用せず、両sectionを別々に保持した。判定は `continue_measurement`、解約率とLTVはnull、完全なライフサイクル履歴は未計測である。

19件のPython検証が成功した。完成稿レビューで見つかった「一部の正の分母が残りの未計測を隠す」問題を修正し、各指標で非ゼロ除外を常に記録する。限定再レビューで追加P1/P2は無かった。

次に必要なのは、同じ元の初回起動からの実観測・成熟・購読との対応と、課金/解約履歴の不足の解消。コードと空の集計が動いたことは、task11の業務完了の証拠にはならない。`ai_proposes` を維持し、blockerだけを `verification_pending` に更新する。日次ジョブは既存のものを継続し、追加の計測許可・新しい定期実行・native配布は作っていない。

## 返金通知

2026-09-10 05:09 UTC、本番D1の `apple_refund_events` を型・環境別に集計した。読取は成功、保持された通知は空、`rows_written=0`。これは保持対象の現在の観測であり、全期間に返金が存在しないという証明ではない。

受信・JWS検証・保持は既存実装を使う。実際の返金通知を受けた証拠がないため、task146は `nobody` / `verification_pending` のまま。テスト通知を返金に読み替えず、この記録のための新規購入や返金も行っていない。

両業務の詳細な集計証拠は非公開APIリポジトリとローカルの `AI-Execution-2026-09-10` に保存した。今回の記録更新はPR TIMESの上書き・予約・配信を行わない。
