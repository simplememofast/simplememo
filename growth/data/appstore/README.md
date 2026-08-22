# growth/data/appstore/ — App Store Connect の測定面

## [2026-08-22] 前提を1つ訂正した

この README には長らくこう書いてあり、そのためここは空のままだった。

> ~~ASC には repo から届くエクスポート API が無いため、ここのファイルは人が転記する。~~

**これは誤り。API は2つある。**

| | 同期性 | 何が取れるか |
|---|---|---|
| `/v1/apps/{id}/customerReviews` | 同期 | 評価・本文・地域・日付 |
| `/v1/analyticsReportRequests` … | 非同期 | 表示 → プロダクトページ閲覧 → DL、売上 |

誤読の理由は分かる。**ONGOING の要求を張った当日には何も返ってこない**
（Apple 側の生成待ちで instance が出るまで日単位）。一度叩いて空だったものを
「API が無い」と読むのは自然で、そのまま6週間空の受け皿が残った。

取り込みは `../simplememo-ios/scripts/asc_metrics.rb` と
`.github/workflows/asc-metrics.yml`（日次・GETのみ）。出力は
**`../simplememo-ios/data/appstore/asc-metrics.json`**。

iOS リポジトリ側にあるのは、**ASC の署名鍵がそちらの `appstore` environment に
しか無い**ため。鍵を2リポジトリへ複製するより、パスが跨るほうが安全という判断。

`asc-metrics.json` は **`ok: false`（取得失敗）と `n: 0`（取得して0件）を
必ず別に持つ。** 混ぜると「レビューが来ていない」と「レビューを見られていない」が
同じ0になる。

### まだ機械で取れないもの

- **Sales & Trends**（売上そのもの）— `filter[vendorNumber]` が必須で、
  vendor number はどちらのリポジトリにも無く ASC API からも引けない。
  `ASC_VENDOR_NUMBER` を iOS 側の `appstore` environment に登録すれば繋がる
- **CPP別の閲覧数/DL** — 下の手動転記が引き続き必要（Analytics レポートに
  カスタムプロダクトページ単位の内訳が載ることを確認できていない。
  **確認していないものを「取れる」と書かない**）

---

## cpp-weekly.json — CPP別 閲覧数/DL（v4 R1 の測定面・**手動転記**）

置かなければ空のままで、週次レポートは空の雛形を出し続ける。

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
