# App Intentsスキーマと任意の索引 — PRD

作成日: 2026-09-05
状態: 実装中
対象リポジトリ: `simplememo-ios`

2026-09-20再照合。Remindersの実perform/EntityQuery・任意のタイトル索引と消去を接続し、native検証と2種類のビルドのmetadata照合まで完了。標準版は未登録、Draft・機能OFFを維持。Notesの保存先、primary-remindersの計測契約、実機受入は未完了。

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

再利用するSDK契約検査と、JSON構造・破損・未対応形式・拡張内の登録漏れを検出する6回帰をPR594へ追加した。実際にビルドしたappの5 actionsとwidgetの1 actionを読み取り、未出荷のNotes/Remindersスキーマが登録されていないことを確認した。音声変更時のhead `c52db6925a8c2b2081c1c638b0209d7b65d8bcd4` のビルド済みappも5 actions、widgetも1 actionで、Notes/Remindersスキーマが未登録であることを再確認した。これは現在の登録内容の検査であり、将来の登録を自動制御する機能ではない。

### 未登録primary-reminders adapterの実装

PR594 head `44f2d783a6063c1cce43ca43b6a6854a974dca9b` で、明示Reminders宛てのMemoCaptureを実EventKit writerへ渡す接続処理を追加した。通常メールを先に送らず、未対応のリスト/セクション、画像、フラグ、タグ、URL、繰り返し、場所指定は副作用の前に拒否する。

受付・試行・確認receiptを端末鍵で暗号化し、再試行は同じ受付と保存先を維持する。保存後の読戻しが不確かな場合は成功や再作成へ進まない。ID解決は確認済みの実項目だけを対象とし、返却データに本文を含めない。取消・消去中のcallbackを拒否し、消去は外部Remindersの項目を削除しない。

関連10 suite・494 native testsが成功（失敗/skip0）。このうちadapterは22件で、実EKReminderオブジェクトの必須開始日/Gregorian/TZ/通知設定と、模擬保存先による保存失敗・二重作成防止・消去・再起動を確認した。実機での権限、EventKit保存/同期、Siriの成功ではない。ビルド済みapp5 actionsとwidget1 actionにNotes/Remindersスキーマが未登録であることも読戻した。

この時点のadapterには製品callerがなかった。下記の変更で接続したが、primary-remindersのoutcome計測契約は未接続で、補助Routing journalからNSMを作らない。Notesは別の残件で、廃止済みのObsidian「1メモ=1ファイル」を日次/Inbox追記の代わりに無断で復活させない。

### Remindersの製品接続と登録境界

PR594 head `6a304f1743843e2e702738958dbabb52a27db86a` で、実際のcreateReminder performから共通MemoCaptureと既存adapterへ接続した。権限拒否後など同じOS invocationの再試行は同じ受付を保持し、不確かな保存を再作成しない。別の新しいユーザー要求を本文一致で統合する仕組みではない。

EntityQueryは確認済みreceiptのID・元のlist・capture markerを再照合し、現在のタイトル・期日などを返す。list IDは端末内の不透明なUUIDに変換し、本文やEventKitの識別子を外へ返さない。未対応のlist指定、添付、タグなどは従来のvalidatorで保存前に拒否する。

検索設定は既定オフ。明示オン時だけ、タイトル専用の別IndexedEntityを使う。schemaに必須のlist/日付/本文などが自動索引に混ざらないよう分け、実CSSearchableItemで本文・textContent・URL・keywordsがないことを確認した。タグは未対応のため登録しない。オフ・消去は探索を先に閉じ、処理中の寄贈の後で削除する。設定/通知/performの更新予約は同期化し、後着Taskで順序を入れ替えない。

同意と削除待ち状態は暗号化した保護ファイルへatomic writeと読戻しで保存する。解除時は旧オン記録を先に削除し、置換書込みが失敗しても再起動でオンが復活しない。全Routing storeの世代を同期失効させてからOSの削除を待つ。OSがファイル削除自体を拒否した場合は解除未完了として扱う。Core Spotlightの削除受付は、実機UIから検索結果が消えた証明ではない。

すべての非空要求は機能/入力/権限判定の前に既存の受付と因果順序フックへ入る。primary-remindersをemail/Obsidian/Notionへ置き換えず、到達の未確認IDはunknownに残す。分母自体が不明なら率を出さない。読取Queryと索引操作は保存件数にしない。

検証用Debugだけ `SIMPLEMEMO_REMINDER_INTENT_CONDITIONS=SIMPLEMEMO_REMINDER_INTENTS` を指定する。実schema/queriesはこのコンパイル条件の内側で、標準Debug/Releaseには設定しない。実行にはiOS 27と既存のRouting gateも必要。

- 検証用ビルド: 8 suite、389件中387成功・失敗0・skip2。skipはiOS 27専用schema実行と実機の保護属性。手元はiOS 26.5。タイトル専用IndexedEntity投影はiOS 18以降で動くため、その実オブジェクトは26.5で検査した。
- 検証用metadata: 6 actions、5 entities、5 queries。createReminder登録あり、Notesなし、タイトル投影の自動索引プロパティなし。
- 標準ビルド: 39成功・失敗/skip0。appは既存5 actions、widgetは1 action、Notes/Reminders登録なし。
- 275 source hashが実行前後/commitで一致。独立再レビューP1/P2なし。同headの全5 remote CI成功。Cloud1744の全9ページを照合し、1,718試験×4モデル=6,872実行、6,868成功・失敗0・実機保護属性4skipを確認した。Cloudは標準構成のため、検証用schemaの実行や実機受入を証明しない。

Siriでの実行、実権限/EventKit同期、Spotlight実表示の消去、同一配布版の計測適格性は未受入。Notesの保存先も未決定。追加TestFlight、機能有効化、App Review提出、実行率への加点は行っていない。

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

createNoteの実保存先・新規Entityの意味は未決定。既存日次/Inbox追記を新規Noteと同一視せず、初期対応範囲を確認中。
updateNoteは採用未決定。決めるのは: 既存の送信後の編集契約とVISIONを確認した担当。
Siriの将来対応を前提とした告知・公開日は確定していない。

## 7. 測り方

入口別の受付・実保存・失敗・欠測を同一版で測る。索引の利用、解除、同意の母数も分ける。
OS側の解決が確認できない経路を正常・0件扱いしない。
