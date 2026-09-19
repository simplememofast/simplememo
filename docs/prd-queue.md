# 機能PRDと実装状態
更新: 2026-09-19。作成・管理: SimpleMemo Developer。

[queue.json](prd/queue.json) は実装の順序・証拠・残条件を管理する。**現在は手動で引き継ぐ台帳で、自動実装ジョブは稼働していない。**
iOSの既存ローカルブランチにある `docs/proposals/feature-autopilot.yml` は提案であり、最新mainの `.github/workflows/` に実行定義はない。この台帳の追加でジョブ・配布・提出を開始しない。

## 状態の意味

- `in_progress`: 一部コードがあるが、PRD全体の受入条件は未完了。ブランチの存在とPRの存在を分ける。
- `blocked`: 前提となるPRDの統合・検証が未完了。
- `held`: 提供条件または実アカウント確認が未成立。
- `done`: PRマージだけでなく、PRDに記載した必要な確認の証拠が揃った状態。
- `queued`: 前提成立後に着手できる未実装項目。

状態更新は、その時点のmain、既存PR、受入条件、必要な配布版の証拠を照合して行う。`prs: []` は記載した確認範囲で該当PRが見つからなかった意味で、コードが存在しない意味ではない。別名のPRまで全履歴を網羅したとは扱わない。

## 今回照合したもの

| 項目 | 現在地 | 次の成立条件 |
|---|---|---|
| 共通Capture | mainにMemoCapture / MemoDelivery / CaptureInstructionがある。古いRouting試作には別のCapture型が残る | 既存の受付ID・保存指示・旧Outbox互換性を保ち、試作を共通経路へ統合 |
| サイドボタン | 9/5のローカル試作あり。同名ブランチのPRは0件 | 共通Capture統合、最新SDK/要件照合、同じ版での実機確認 |
| Reminders / Calendar | ローカル試作あり。同名ブランチのPRは0件 | Level 1→2、端末内推論、両宛先を同じ版で検証 |
| App Intentsスキーマ | 通常のSiri/Shortcutsは実装済み。提案のNotes/Remindersスキーマ・索引はmainで未確認 | 共通CaptureとRoutingの統合後、現行SDKで対象スキーマを確認 |
| Notion提供 | iOS/APIに実装済み。実OAuth→実保存の完了証拠は未確認 | 現行公開手順・提供状態・利用者同意・同じ版の実配送を確認 |

iOS main `17dcad9`、API main `c6ed249` と照合した時点の記録。iOS PR #590は別担当の計測整備で、このキューの機能完成や新しい配布証拠に数えない。

## 現行仕様の優先順位

iOS mainの `docs/VISION.md`、`docs/adr/ADR-001-text-inference-placement.md`、
`docs/capture-nsm-measurement-contract.md`、各連携の現行コードを読む。
9/5のPRD・ローカル試作は材料として保全し、新しいmainの仕様・同意・計測を上書きしない。

旧計画の10/1審査、10/13告知、11/10〜12 Notion提供は履歴である。今回の版・日付・提出・一般公開は未確定。
実機QA、審査、公開、効果測定は別段階として記録する。5.8.67（1686）の部分証拠をv6や別SHAへ移さない。
新しいジョブを導入する場合は、重複防止・既存所有者・権限・実行費用・生成PRのCI起動・停止方法を含む実装とレビューを先に完了する。

## 検証

`node scripts/check-prd.mjs --check` がPRD本文の構造を検査する。これは実装・動作・配布の証明ではない。
キューの依存関係、参照ファイル、証拠SHAを変更時に再照合する。
