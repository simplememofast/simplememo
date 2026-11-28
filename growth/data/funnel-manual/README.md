# growth/data/funnel-manual/ — 月次フルファネルの手動転記

`growth/scripts/full-funnel.mjs` が読む月次の手動値。GSC行はsnapshotから自動で
埋まるが、GA4とApp Store Connectは**この表に入る値をこのリポジトリへ運ぶ経路が無い**ため、
ここに**人が転記**する。ファイル名は `YYYY-MM.json`。

[2026-10-14] 以前は「エクスポート経路が無い」と書いていたが、取得そのものは非公開側で動いている
（GA4はBigQueryエクスポートを `analytics-read.yml` で読む・`workflow_dispatch` のみ／
ASCはiOSリポジトリの `asc-analytics.yml` が日次取得）。
どれもここへは書き込まない。**ここが空でも、取得が止まっているとは限らない。**
`growth/data/appstore/` にある `ingest-asc` の合計は全DL種別（更新・再DLを含む）・全流入元の合算なので、
`asc_installs` の代わりにしない。

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
  "source": "GA4探索・ASC App Analytics/サブスクリプション（2026-09-01閲覧）"
}
```

- 2026年11月は任意の利用分析の終了を含む。11月分以降の24時間以内の初回送信到達率は評価不能として転記を終了した。`activation_rate` と `funnel_window` は今後入力しない。10月分までの保存済みの旧台帳の観測値は歴史資料として表示する。
- `asc_installs` はAppleの初回ダウンロード数だけを扱う。認証アドレス数・送信相関記録・Appleのダウンロード数の間で人数を照合したり、初回送信到達率を推定したりしない。
- `d1_retention` はASCベンチマーク画面の値。**Appleピア比較の百分位（上位25%等）は
  対外に出さない**（v4 §5-5）。この台帳は社内用だが、レポートへの転載時に注意。
- 窓はソースごとに違ってよい（GA4は暦月・ASCは表示期間）。
  そのまま書く。無理に揃えて数字を按分しない。
