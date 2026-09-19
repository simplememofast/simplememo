# App Intentsスキーマと任意の索引 — PRD

作成日: 2026-09-05
状態: 設計案
対象リポジトリ: `simplememo-ios`

2026-09-20再照合。独立したSDK検証を実施中。製品への公開は共通CaptureとRoutingの受入条件待ち。

## 0. 一行定義

既存のSiri/Shortcuts入口を再利用し、実際に利用できるNotes/Remindersスキーマと、既定オフのタイトル・タグ索引を検証する。

## 1. なぜこの機能か

iOS main `17dcad9` の `SimpleMemo/SimpleMemoAppIntents.swift` にはStartVoiceMemoIntent / NewMemoIntentなどがある。
`AppIntentMemoSender.swift` と画面Captureも既存機能である。
提案のNotes/RemindersスキーマとIndexedEntityはmain検索では未確認。
9/5のSDK名・API綴り・対応時期の予測を現在の仕様としてコピーせず、実装時にApple公式資料と利用SDKで照合する。

### 2026-09-19のSDK照合

Appleの現行資料とXcode 27 SDKでは、対象のNotes/RemindersスキーマはiOS 27以降。
マクロは `@AppIntent(schema:)` / `@AppEntity(schema:)`。旧案の綴りをそのまま実装へ移さない。
[createNote](https://developer.apple.com/documentation/appintents/appschema/notesintent/createnote) は名前だけでなく本文・添付・ピン・フォルダの項目を持つ。
[note](https://developer.apple.com/documentation/appintents/appschema/notesentity/note) にも本文などの任意項目があるため、タイトルとタグだけというプライバシー要件は、単にEntity名を採用するだけでは成立しない。
本文をEntityの返却値・検索用属性・索引へ渡さないことを、それぞれ検証する。

[createReminder](https://developer.apple.com/documentation/appintents/appschema/remindersintent/createreminder) は期限・繰り返し・場所・添付なども受け取る。
既存EventKit経路が扱わない入力は、黙って捨てて成功を返さない。
Routing未出荷の版ではIntentを公開しないという条件は維持し、実行時フラグだけで登録を抑止できると仮定しない。
SDKの確認は、スキーマ実装・登録メタデータ・iOS 27の実行試験・Siriでの解決の完了ではない。

### 2026-09-20のコンパイル・メタデータ検証

Xcode 27.0（27A266a）/ iPhone Simulator SDK 27.0で、製品ターゲット外の検証用定義をコンパイルし、AppleのApp Intentsメタデータ生成も成功した。
対象は `.notes.createNote` / `.reminders.createReminder` と、引数・返却値が参照するNote / Folder / Account / Reminder / List / Section / LocationTriggerおよび2種の列挙型。
Query識別子の一意性と文字列解決もメタデータ検査で確認した。

単なる型チェックではスキーマ違反を検出できない。比較用にCreateNoteのnameをIntへ変更した定義と、Noteのcontent項目を省いた定義は、どちらもSwiftコンパイルは通るがメタデータ生成で対応するエラーになった。
`content`は値が任意でも宣言の省略はできない。本文非公開の製品実装では値を返さない処理と検索・索引への非流出を別々に検証する。

この検証ではQueryは空配列を返し、performは常にエラーを返す。宛先へアクセスせず、アプリ登録・Siri実行・保存成功・プライバシー契約の完成を証明しない。
既存Obsidianの日次ファイル追記を「新しいNoteの作成」と同一視せず、保存済みEntityのID・再解決・削除・未対応入力・登録抑止を具体化する。これらのコード作業は実機待ちで一括停止する項目ではない。

再利用するSDK契約検査と、JSON構造・破損・未対応形式・拡張内の登録漏れを検出する6回帰をPR594へ追加した。実際にビルドしたappの5 actionsとwidgetの1 actionを読み取り、未出荷のNotes/Remindersスキーマが登録されていないことを確認した。これは現在の登録内容の検査であり、将来の登録を自動制御する機能ではない。

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
- [x] 現行SDKでスキーマの名称、引数、対応OSをコンパイルとメタデータ生成で確認する。上記の検証用定義と2種の不正定義による比較まで完了。
- [ ] 既存保存処理へ接続したperform、実Entityの解決、製品の登録メタデータと実行方法を確認する。
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
