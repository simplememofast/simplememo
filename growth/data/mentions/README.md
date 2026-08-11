# Mention & Competitor Watch — WebSearchベース（APIキー不要）

毎日運転のオートパイロットセッションが持つWebSearchツールで実行する
外部言及の定点観測。外部APIキー・課金は使わない。

**週1回**（保守レーンの一部として）、次の固定クエリ群を検索し、
`YYYY-MM-DD.json` に構造化して保存する:

```
"シンプルメモ Obsidian"           ブランド言及の新規発生
"simplememofast"                  ドメイン言及
"Obsidian メモアプリ おすすめ"     競合リスト記事に載っているか
"Obsidian 音声入力"               勝ち筋面の新規競合記事
"Obsidian Logseq 比較"            自記事の競合状況
"Captio 代替"                     ブランド継承面
```

スキーマ:

```json
{
  "date": "YYYY-MM-DD",
  "queries": [{
    "q": "検索語",
    "new_mentions": [{"url": "", "title": "", "mentions_us": true, "context": "1行"}],
    "competitor_listicles": [{"url": "", "includes_us": false}]
  }],
  "diff_from_last": "前回スナップショットとの差分1〜3行",
  "actions_suggested": ["リスト記事Xに掲載依頼の余地", "..."]
}
```

**原則:** 検索結果の要約に主観を混ぜない。差分が空なら空と書く
（「変化なし」も記録。ゼロは異常ではない）。actions_suggested は
提案止まりで、実施はキュー判断（ノイズフロア）を通す。
