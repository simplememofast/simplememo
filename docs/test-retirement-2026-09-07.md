# 2026-09-07 テスト整理の実行記録

対象は `simplememo-ios/SimpleMemoTests/PaywallAnnualEmphasisTests.swift`。
[PR #400](https://github.com/simplememofast/simplememo-ios/pull/400) の最終変更は
`d2a2735413e57b72be723d82cba7cb5e5c4a6a14`。

## 置き換えた検査

独立した `testBothEmphasisModesApplyWithoutCrash` は、バッジ表示状態を検査する
`testBadgeVisibilityFollowsTextInBothEmphasisModes` に統合した。
旧 `testBadgeVisibilityFollowsText` と合わせた2メソッドを1メソッドにし、
このクラスのテストメソッドは9件から8件になった。

| 旧検査が確認していた条件 | 統合後の確認 |
| --- | --- |
| recommended と文字ありで表示 | 両モード × 文字ありの表示を検査 |
| secondary と nil で非表示 | 両モード × nil の非表示を検査 |
| secondary と空白で非表示 | 両モード × 空白の非表示を検査 |
| secondary/nil → recommended/nil を適用でき、最後は非表示 | 同じ切替を明示的に実行し、両段階で非表示を検査 |

空文字も両モードで検査する。各マトリクス条件の前に表示状態へ戻すので、
非表示への更新を省略した実装が初期状態だけで通ることを防ぐ。
価格からの割引表示計算など、残る7メソッドは変更していない。

これはテスト数の削減だけを根拠にした記録ではなく、旧検査の責務を移して
独立したスモークテストを不要にした実行記録である。年額商品が未取得のときの
コントローラ側の選択や、全リポジトリの未使用テスト検出を証明するものではない。

## 検証

最終変更で iOS 26.5 Simulator の `SimpleMemoQA` / `SimpleMemo-FastUnit` を使い、
対象クラス8件が成功、失敗・スキップとも0件。プロジェクト整合性検査も成功。
Xcode Cloud のビルドと FastUnit、および GitHub の static / parity をマージ条件とする。

全CI成功を確認し、2026-09-07T10:09:30Zにマージ済み。マージコミットは
`c1d5984710554a1c2125b76728062abecaad9a6f`。
Xcode Cloud ビルド `5b9b9a9a-c536-4b94-b0b5-3093868e0803` の
Build は10:04:10Z、FastUnitは10:07:53Zに成功。static / parity も成功した。
