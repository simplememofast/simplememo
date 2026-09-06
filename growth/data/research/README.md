# growth/data/research/ — 調査データの確定値置き場

/data/ 配下の調査ページに載せる確定集計の転記先。集計の実行手順は
`growth/queries/` の各ランブックにあり、**このディレクトリに置かれた値だけが
ページに掲載してよい値**（生値・暫定値はここに置かない）。

## 音声シフト：方法v2と公開条件（2026-09-06）

[現行手順](../../queries/voice-shift-90d.md)と[実SQL](../../queries/voice-shift-v2.sql)を使う。
v2は診断後の訂正なので、旧90日調査の事前登録済み結果とは扱わない。
現時点では確定した結果ファイルを置いていない。

公開用ファイルには、少なくとも`protocol`、半開区間の期間・タイムゾーン、
取得日時、SQL・元実装の版、内部除外（設定数・解決数・限界）、
候補・曖昧端末の除外和集合・対象端末数、各表の分母と不明数を残す。
初回入力は保存到達端末、初日の長さと受信時間帯は保存イベントが分母。
後者は寄与端末数も併記する。Obsidianは有効観測・既知状態・未観測を区別する。
内部のID・メールハッシュ、認証情報、個票はファイルに含めない。

SQL出力の合計が一致しても、保持・記録開始日・欠測・実機の確認条件が未解決なら、
診断結果はリポジトリ外に保持する。公開自動化は行わない。

## 旧v1書式の履歴（現行結果の転記には使わない）

以下の0件は旧書式の例であり、実績でも確定結果でもない。

```json
{
  "window": "2026-05-30..2026-08-27",
  "executed_at": "2026-08-28",
  "internal_exclusion": { "enabled": true, "configured": 0, "resolved": 0 },
  "first_send_input_method": {
    "n_installs": 0,
    "rows": [ { "method": "voice", "installs": 0 }, { "method": "keyboard", "installs": 0 }, { "method": "unknown", "installs": 0 } ]
  },
  "day0_memo_length_buckets": { "n_events": 0, "rows": [ { "bucket": "", "events": 0 } ] },
  "jst_hour_distribution": { "n_events": 0, "ja_locale_ratio": null, "rows": [ { "jst_hour": 0, "events": 0 } ] },
  "obsidian_configured": { "new_installs": 0, "configured": 0 }
}
```

- n < 30 の表はページに公開しない（ランブック §0）。
- 窓・実行日・内部除外の内訳が無い転記は不完全として扱い、ページに反映しない。
