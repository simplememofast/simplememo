# 製品報告から再現テストを生成した実行証跡

2026-09-09。②バグ修正の「問い合わせから再現テストを自動生成」を対象とする。実レビューに由来する生成・検証・main適用までの実行を確認した。

## 材料と実行

実際の App Store レビューが、音声入力の自動オンに強制終了・再起動が必要になると報告していた。Codex は iOS リポジトリに取得済みの実レビューと、関連する過去の修正 PR272〜274 を読み、操作手順・期待値・製品 XCTest を生成した。

レビュー本文が直接提供した事実と、既存修正から導出した background → active の手順を区別している。

生成物は iOS の `data/voice-review-repro-case.json` と `SimpleMemoTests/VoiceAutoStartLifecycleTests.swift`、[Issue455](https://github.com/simplememofast/simplememo-ios/issues/455)、[PR456](https://github.com/simplememofast/simplememo-ios/pull/456)。元データの blob/hash と対象レビューIDは非公開iOSリポジトリに保持している。

## 実行結果

- 実 ComposeViewController の起動・背景・復帰ハンドラーを通す6件が成功。
- PR272 が直した初回のみの挙動へ局所的に戻すと、復帰後の開始要求が出ず1件失敗。
- 当時の本文空ガードを戻すと、書きかけ本文の復帰で1件失敗。
- ソースを byte-for-byte で復元し、6件すべて再び成功。Skip は0件。

失敗はどちらも開始要求が期待2回に対して1回のままだった。古いバイナリ全体の再現ではなく、歴史的修正に対応する処理の差分検証である。

最終head `9fd05d8b59363dd7bda775ad25c9305748a3edef` の static・parity・Xcode Cloud Build/FastUnit/aggregate はすべて成功。2026-09-09T09:08:40Z に main `14a7ba37a7a2e1ebf99a0e6f199c2f6ef2c87dad` へマージされた。

独立レビューの指摘に基づき、共有SessionContextの時刻・発火フラグ・未設定値を含む永続カウンタを復元するfixtureへ修正した。初期化失敗時の後片付けと新規状態の復元テストも加え、最終7件すべて成功、再レビューも通過している。

実行率は154/178（86.5%）から155/178（87.1%）へ、0.561798ポイント上昇する。総合自動化率155/199=77.9%、AI関与率162/178=91.0%、カバー率178/199=89.4%。実施中の非AI業務は23件残り、99.9%は未達。タスクの定義・分母・除外条件は変えない。

## この1件の範囲

これは実製品への問い合わせを材料に、AIが再現テストとIssueを作り、CIで検証してリポジトリへ適用する実行である。⑧カスタマーサポートの問い合わせ分類器テストとは材料・対象コード・assertionが異なる。過去の製品修正そのものも、今回の得点には使わない。

マイク開始境界は XCTest の対象インスタンスだけで受ける。設定・復帰フラグ・表示条件・遅延再判定は製品実装を通すが、音声認識、実端末の録音再開、SpeechAnalyzer復旧、報告者の端末での原因確定までは証明しない。

AIが今回の依頼の中で生成・適用したことを数える。すべての将来の問い合わせから常時自動でテストを生成するサービスを新設した、とは主張しない。新しい報告では同じ証拠水準が必要になる。

リリース挙動を変えないテスト追加なのでTestFlightは配信しない。プレスリリースは実測99.9%以上になるまで配信・予約とも行わない。

CI: [Static](https://github.com/simplememofast/simplememo-ios/actions/runs/34332093546)、[Parity](https://github.com/simplememofast/simplememo-ios/actions/runs/34332093385)、[Xcode Cloud](https://appstoreconnect.apple.com/teams/f59eaca1-71dd-40ab-aa54-cca665f2afaf/apps/6758438948/ci/builds/1cd2acbc-c9e1-48ab-87e5-27614c19f6ae)。
