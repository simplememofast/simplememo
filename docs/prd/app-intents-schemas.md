# App Intentsスキーマと任意の索引 — PRD

作成日: 2026-09-05
状態: 設計案
対象リポジトリ: `simplememo-ios`

2026-09-19再照合。共通CaptureとRoutingの受入条件待ち。

## 0. 一行定義

既存のSiri/Shortcuts入口を再利用し、実際に利用できるNotes/Remindersスキーマと、既定オフのタイトル・タグ索引を検証する。

## 1. なぜこの機能か

iOS main `17dcad9` の `SimpleMemo/SimpleMemoAppIntents.swift` にはStartVoiceMemoIntent / NewMemoIntentなどがある。
`AppIntentMemoSender.swift` と画面Captureも既存機能である。
提案のNotes/RemindersスキーマとIndexedEntityはmain検索では未確認。
9/5のSDK名・API綴り・対応時期の予測を現在の仕様としてコピーせず、実装時にApple公式資料と利用SDKで照合する。

## 2. VISION §13 のチェック

1. **Capture Coverage / Zero-decision 率を上げるか**: 既存の標準入口から保存への到達を支える。効果は未検証。
2. **整理するUIを増やしていないか**: OS入口と任意設定だけを扱う。
3. **Destinationを所有しようとしていないか**: 保存は既存配送とEventKitへ渡す。
4. **共通Capture Objectを通るか**: 既存受付ID・MemoCaptureを再利用する。
5. **修正が学習資産になるか**: Routing側の端末内記録へ接続する。
6. **AIを前面に出していないか**: Siri/Shortcuts/検索の操作として案内する。

**Routing Level**: 新しい判定を作らず、Routing側のLevel 1→2を利用する。

## 3. 受入条件

- [ ] 前提の共通CaptureとReminders/Calendarが統合・検証済みである。
- [ ] 現行SDKでスキーマの名称、引数、対応OS、実行方法をコンパイルして確認する。
- [ ] 既存Intentと画面Captureの機能を重複登録せず、送信・キャンセル・再試行を保つ。
- [ ] 索引は既定オフ。明示オン時だけタイトル・タグを使い、本文を索引しない。
- [ ] オフ・削除で索引を消し、保存内容の保護と既存削除契約を維持する。
- [ ] 日本語・英語、対応OS・非対応OS、利用できる実機入口を検証する。
- [ ] Remindersが未出荷なら、それを呼ぶIntentを提供しない。

## 4. UX

既存のSiri/Shortcutsの操作を保持し、検索への表示は利用者が選ぶ。
未提供のOS機能・日本語対応・アプリ更新なしの将来対応を約束しない。

## 5. 多言語

| 要素 | JA | EN |
|---|---|---|
| 任意設定案 | メモのタイトルをSpotlightに表示 | Show memo titles in Spotlight |
| 補足案 | 本文は表示しません。オフで索引を削除します | Memo text is not shown. Turning this off removes the index. |

## 6. 決めていないこと

updateNoteは採用未決定。決めるのは: 既存の送信後の編集契約とVISIONを確認した担当。
Siriの将来対応を前提とした告知・公開日は確定していない。

## 7. 測り方

入口別の受付・実保存・失敗・欠測を同一版で測る。索引の利用、解除、同意の母数も分ける。
OS側の解決が確認できない経路を正常・0件扱いしない。
