# growth/data/funnel-manual/ — 月次フルファネルの手動転記

`growth/scripts/full-funnel.mjs` が読む月次の手動値。GSC行はsnapshotから自動で
埋まるが、GA4とApp Store Connectとアプリ内ファネルはエクスポート経路が無いため、
ここに**人が転記**する。ファイル名は `YYYY-MM.json`。

```json
{
  "ga4_window": "2026-08-01..2026-08-31",
  "ga4_sessions": 0,
  "ga4_app_store_click": 0,
  "asc_window": "2026-08-01..2026-08-31",
  "asc_ppv": 0,
  "asc_installs": 0,
  "d1_retention": 0.40,
  "subs_started": 0,
  "mrr_usd": 0,
  "funnel_window": "2026-08-15..2026-08-19",
  "activation_rate": null,
  "source": "GA4探索・ASC App Analytics/サブスクリプション（2026-09-01閲覧）"
}
```

- `activation_rate` は **内部除外ありの正史**（`analytics:funnel`・v4 R12-1）の値のみを
  入れる。生値（--include-internal）を入れない——生値しか無い月は null のままにする。
- `d1_retention` はASCベンチマーク画面の値。**Appleピア比較の百分位（上位25%等）は
  対外に出さない**（v4 §5-5）。この台帳は社内用だが、レポートへの転載時に注意。
- 窓はソースごとに違ってよい（GA4は暦月・ASCは表示期間・ファネルはコホート窓）。
  そのまま書く。無理に揃えて数字を按分しない。
