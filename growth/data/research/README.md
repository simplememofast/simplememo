# growth/data/research/ — 調査データの確定値置き場

/data/ 配下の調査ページに載せる確定集計の転記先。集計の実行手順は
`growth/queries/` の各ランブックにあり、**このディレクトリに置かれた値だけが
ページに掲載してよい値**（生値・暫定値はここに置かない）。

## voice-shift-90d.json（/data/voice-shift/ 用）

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
