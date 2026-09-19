# 機能PRDと実装状態
更新: 2026-09-20。作成・管理: SimpleMemo Developer。

[queue.json](prd/queue.json) は実装の順序・証拠・残条件を管理する。**現在は手動で引き継ぐ台帳で、自動実装ジョブは稼働していない。**
iOSの既存ローカルブランチにある `docs/proposals/feature-autopilot.yml` は提案であり、最新mainの `.github/workflows/` に実行定義はない。この台帳の追加でジョブ・配布・提出を開始しない。

## 状態の意味

- `in_progress`: コードまたは独立した契約検証が進んでいるが、PRD全体の受入条件は未完了。製品コード・検証用定義・PRの存在を分ける。
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
| Reminders / Calendar | PR594（Draft）で明示的な追加保存、端末内判定、暗号化journal、Capture別receiptによるObsidian注記を実装。JA50/EN50入力ケースと時刻の回帰を含む29 native tests成功。既定OFF | Correctionのsource/device・保存/移行、実FileProvider・実保存/権限、端末内モデル精度と同一版QA |
| App Intentsスキーマ | 既存Siri/Shortcutsを保持。Xcode 27の製品外検証用定義でコンパイル・メタデータ生成成功。不正な型/必須項目欠落の2比較を検出 | 保存処理・Entityの解決・本文非公開・登録抑止の実装と実行試験。製品公開は共通Capture/Routingの受入後 |
| Notion提供 | iOS/APIに実装済み。9/4のサーバーOAuth・実保存・本文読取・同一ID再送は確認済み | 現在の提供状態・同意範囲・同じ配布版の実機配送を確認 |

初回はiOS main `17dcad9`、API main `c6ed249` と照合。9/19の追記ではiOS PR594の統合基底 `f6906b4`（PR590/591を含む）とDraft差分を確認した。PR594はマージ・有効化・配布ではない。Notion手順は[API PR358](https://github.com/simplememofast/simplememo-api/pull/358)で訂正済みだが、提供受入条件の完了には数えない。

PR594の最新照合headは `bb527d5998400c1a2fd98fddb9f647ab3b61fde0`。日本語50入力・英語50入力を追加し、6文の不一致を修正した。開始時刻の順序と夜中をまたぐ表現も補強し、同headのDestinationRouterTests 29件がiOS 26.5 Simulatorで成功。修正前の失敗結果は非公開で保持している。

過去の証拠は区別する。main `e3431b2` の対話メモと待機ゲートを取り込んだ `9beff2c` は関連14 suite・307テスト成功。`90f2302` まではアプリ/テストが同一で、前処理9種のprobeと全CIも成功し、Cloudは1,472 tests×4 Simulatorで全成功した。現在headでは日時判定のソースが変わっているため、この旧結果を現在headの全検証成功へ転用しない。

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
