# 自律提出ゲートの実行と未受付の記録

以下は2026-09-11 11:34 UTC時点の履歴。AI実行率は157/179 = 87.709497%、総合自動化率157/199 = 78.894472%。
今回の修正・ゲート通過・未提出下書きには加点していない。

2026-09-12追記：同じ1342の[自律提出受付を確認](delegated-review-acceptance-20260912.md)した。
以下の失敗・復旧記録は当時の事実として残す。

対象は既存のTestFlight 5.8.54（1342）、source SHA
`a1cb757ba4a5f5730f50030c9d7b75704de2cb13`。
[同一版の実機6/6](../data/physical-device-verification-20260911.json)と
対象SHAのCI、24時間soak、日英リリースノート、段階公開を照合した。
新しいTestFlightビルドや購入は行っていない。

## 実際に進めた経路

- [iOS PR479](https://github.com/simplememofast/simplememo-ios/pull/479)：
  appVersionを含まない審査とアプリ本体を含む審査を区別する。
  全PRチェック成功後にmainへマージ。
- [run34593134781](https://github.com/simplememofast/simplememo-ios/actions/runs/34593134781)：
  release-blocker件数を取得できず、強制ゲートで停止。提出は実行されなかった。
- [iOS PR480](https://github.com/simplememofast/simplememo-ios/pull/480)：
  提出ゲートと再利用呼び出し元へ`issues: read`を追加。取得失敗時の停止は維持。
- [run34593711850](https://github.com/simplememofast/simplememo-ios/actions/runs/34593711850)：
  恒常委任で強制ゲートを通過し、build1342を選択した。
  ただしAppleが「iOSの進行中審査は最大2件」として最終提出を拒否した。
  版は`READY_FOR_REVIEW`、申請の`submittedDate`はnullで、受付済みではない。
- [iOS PR481](https://github.com/simplememofast/simplememo-ios/pull/481)：
  同時審査数の検査と、同じ版の未提出アプリ項目だけを除く限定復旧を追加。
  PR480・481は提出用Ruby・ワークフローの変更で、対応する静的検証・境界試験と
  敵対的レビューを通過後にマージ。アプリ本体の新ビルドではない。

既存の2件は購読本体と購読グループ情報の審査である。
これらを取り下げず、空きが出た時点で同じ検証済みビルドの材料を取り直す。
Appleの[同時審査仕様](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/overview-of-submitting-for-review)は
プラットフォームごと最大2件。未提出下書きは進行中の件数へ含めない。
不明な状態・プラットフォーム・項目の欠測は空き扱いしない。

## 限定復旧の完了

[復旧run34594538248](https://github.com/simplememofast/simplememo-ios/actions/runs/34594538248)は成功。
2026-09-11 11:34 UTCのApple API再取得で、5.8.54は`PREPARE_FOR_SUBMISSION`、
ビルド1342・`AFTER_APPROVAL`・段階公開設定の維持を確認した。
今回作成された未提出下書きからアプリ項目だけが外れ、既存の購読関連2件は
元の`WAITING_FOR_REVIEW`と提出日時を維持している。
復旧自体は審査提出ではなく、実行率の加点対象ではない。

## 完了判定

同一の版・ビルドに対する提出受付をApple側で確認してから、task76の分類を移す。
その場合は158/179 = 88.268156%となるが、現在の実績ではない。
Apple承認後の公開はtask78で別途確認する。
`AFTER_APPROVAL`や段階公開の設定だけを公開済みへ数えない。
PR TIMESの次回稿も未配信であり、実測99%超の条件を維持する。
