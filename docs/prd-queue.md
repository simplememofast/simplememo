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
| 共通Capture | [iOS PR594](https://github.com/simplememofast/simplememo-ios/pull/594)（Draft）で既存MemoCapture / MemoDeliveryへ統合。受付ID・時刻・元の保存先を保持。関連テスト成功 | 必要なCIと同一版の実配送を確認 |
| サイドボタン | PR594（Draft）で統合。既存下書きを保護し、実際のCapture結果へ返答を対応づける。既定OFF | 実機の適格性・entitlement、音声/割込/背景動作、同じ版での確認 |
| Reminders / Calendar | PR594（Draft）で明示的な追加保存、端末内判定、暗号化journal、Capture別receiptによるObsidian注記を実装。既定OFF | 実FileProvider・実保存/権限、JA/EN精度と同一版QA |
| App Intentsスキーマ | 通常のSiri/Shortcutsは実装済み。現行SDKで対象スキーマのiOS 27要件とAPIを照合 | 共通Capture/Routingの受入、本文非公開の実装、登録メタデータと実行試験 |
| Notion提供 | iOS/APIに実装済み。9/4のサーバーOAuth・実保存・本文読取・同一ID再送は確認済み | 現在の提供状態・同意範囲・同じ配布版の実機配送を確認 |

初回はiOS main `17dcad9`、API main `c6ed249` と照合。9/19の追記ではiOS PR594の統合基底 `f6906b4`（PR590/591を含む）とDraft差分を確認した。PR594はマージ・有効化・配布ではない。Notion手順は[API PR358](https://github.com/simplememofast/simplememo-api/pull/358)で訂正済みだが、提供受入条件の完了には数えない。

PR594の最新照合headは `90f230210849f300940435ef8e1cd76102520de9`。main `e3431b2` の対話メモと待機ゲートを取り込み、対話への切替中とScene経由のモーダル保護を確認した。新しい専用iOS 26.5 Simulatorの14 suite・307テストは `9beff2cf9f55470db05b7f8a1c4f00b81a952549` で成功した。後続差分は再送検証用fixtureの対応のみで、アプリとテストのソースは同一。前処理全体も9種の保存/回復probeを含めてローカルで成功した。過去の307件という同じ件数の結果とは別の実行である。

CIはPR本文と現在のチェック欄を正本にする。再利用Simulatorでの署名不足・設定/キュー残留を伴う失敗と中断は別記録として保持し、旧データを削除して合格扱いにはしていない。実機確認・配布・フラグ有効化・正式加点は未成立。旧prototypeブランチは保全したままで、`exact_branch_prs_found: 0`は当初その名前で検索した結果を保持する。

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
