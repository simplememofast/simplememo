# growth/data/appstore/ — App Store Connect 手動転記の置き場

ASC には repo から届くエクスポート API が無いため、ここのファイルは**人が転記する**。
GA4/GSC と違い、置かなければ永久に空のままで、週次レポートは空の雛形を出し続ける。

## cpp-weekly.json — CPP別 閲覧数/DL（v4 R1 の測定面）

ASC → App Analytics → **カスタムプロダクトページ** の一覧から転記する。
`id` は `data/cpp-map.json` の `id` と一致させる。デフォルト商品ページは `(default)`。

```json
{
  "window": "2026-08-11..2026-08-17",
  "source": "ASC App Analytics カスタムプロダクトページ（2026-08-18閲覧）",
  "rows": [
    { "id": "(default)",   "views": 0, "downloads": 0 },
    { "id": "mail-to-self", "views": 0, "downloads": 0 },
    { "id": "obsidian-vault", "views": 0, "downloads": 0 }
  ]
}
```

- `views` = プロダクトページ閲覧数、`downloads` = 初回ダウンロード。CVR はレポート側で計算する。
- 窓は GSC スナップショットに合わせる必要はない（ASC の表示期間をそのまま書く）。
- 過去分を残したいときは `cpp-weekly-YYYY-MM-DD.json` として複製してから上書きする。

CPP 側の実測が空である間の参照値（90日・〜2026-08-18、v4 §1）:
デフォルト CVR **2.45%**・mail-to-self **5.42%**（15DL・n=15）。
