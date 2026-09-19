# Reminders / Calendarへの候補とワンタップ保存 — PRD

作成日: 2026-09-05
状態: 実装中
対象リポジトリ: `simplememo-ios`

2026-09-20再照合。端末内推論の判断は9/7 ADR-001へ更新済み。

## 0. 一行定義

共通Captureから用事・予定の保存先候補を示し、利用者の操作でRemindersまたはCalendarへ保存する。

## 1. なぜこの機能か

`docs/VISION.md` §4.2、§5.1、§6と `docs/adr/ADR-001-text-inference-placement.md` に対応する。
ローカルRoutingブランチ `6ddc66a` にDestinationRouter / EventKitWriter / RoutingCoordinator / Correction記録の試作がある。
元の試作ブランチは保全し、[iOS PR594](https://github.com/simplememofast/simplememo-ios/pull/594)（Draft）で既存Captureへ統合中。
最新照合headは `bb527d5998400c1a2fd98fddb9f647ab3b61fde0`。機能フラグは既定OFF、mainへの統合と出荷は未完了。
既存MemoCapture・CaptureInstructionを置き換えて計測を失う統合はしない。

## 2. VISION §13 のチェック

1. **Capture Coverage / Zero-decision 率を上げるか**: 外部保存先へ届くまでの操作を減らす。Level 1の選択をZero-decision成功と数えない。
2. **整理するUIを増やしていないか**: 候補と既存設定に留め、一覧・管理画面は作らない。
3. **Destinationを所有しようとしていないか**: EventKitで保存し、Todo/Calendar本体は所有しない。
4. **共通Capture Objectを通るか**: 既存受付IDと保存指示へ接続し、入口別の判定器を作らない。
5. **修正が学習資産になるか**: 選択変更を端末内に記録し、本文・Contextをサーバ学習へ送らない。
6. **AIを前面に出していないか**: 保存先の候補と結果で説明する。

**Routing Level**: Level 1 Suggest→Level 2 One-tap。Level 3の自動保存を追加しない。

## 3. 受入条件

- [ ] 共通Captureへ統合し、既存メール・Obsidian・Notionの宛先保持と受付計測を保つ。
- [ ] 明示ルールを優先し、利用者が選べる端末内モデルまたはローカルルールで候補を出す。クラウド推論へ送らない。
- [ ] 閾値0.7、日付のみの「明日」は9:00、予定の長さ60分という既存案を検証する。
- [ ] RemindersとCalendarを同じ版に含め、作成・権限拒否・重複・取消・オフラインを検証する。
- [ ] 保存先への書込が確認できた場合だけ成功を表示し、失敗時に本文と元宛先を保全する。
- [ ] Correction記録は端末内のinput_hash / predicted / confidence / selected / source / device / atのみとし、本文そのものは保存しない。保護・保存期間・削除・移行を定め、本文を分析へ載せない。
- [x] 日本語・英語の日時解釈を各50文以上で検証し、誤りも保持する。上記headのDestinationRouterTests 29件がiOS 26.5 Simulatorで成功。専用corpusは各50入力（49例文と空入力1件）。既存・追加回帰を含む同suite全体では空入力を除く日本語66・英語81の異なる例文を検証した。修正前の100入力では6文の不一致を再現し、失敗結果を非公開で保全した。夜中をまたぐ時刻、開始・終了時刻の順序、不正入力の追加回帰も成功。端末内モデルの精度や実配送の合格ではない。
- [ ] 同じ配布版でWatchを含む現行入口を確認する。片方未完了なら同梱版を出さない。

## 4. UX

既存の送信画面で保存先候補を提示し、明示操作後に結果を返す。
既定の保存先を無断変更しない。Obsidianへの追記は利用者の雛形を尊重する。

## 5. 多言語

| 要素 | JA | EN |
|---|---|---|
| 候補 | リマインダー / カレンダー | Reminders / Calendar |
| 権限前置きボタン | 続ける | Continue |
| 失敗 | 保存できませんでした。メモは残っています | Could not save. Your memo is retained. |

## 6. 決めていないこと

端末内Correctionの保存・移行方法は未完了。決めるのは: 実装担当が現行保護・削除契約と照合して具体化する。
現在のChoice記録はCapture UUIDのハッシュ・予測先・選択先・確信度・時刻を暗号化し、30日/200件で保持する。本文のハッシュではなく、source/deviceも未収録のため、上記Correction契約やPersonal Routing Graphの完成とは扱わない。保存形式・移行・消去の設計と実装は、実機確認とは独立して進められる残作業。
当面無料という9/5の案は料金変更の実行指示ではない。課金の変更は既存の判断・公開手順で別途扱う。

## 7. 測り方

候補提示、選択、作成確認、修正、失敗と母数を同じ版で保持する。
Zero-decision率は既存計測契約に従い、同意・全受付・全保存先の証拠が揃うまで算出しない。
