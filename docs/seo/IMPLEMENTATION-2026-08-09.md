# Implementation Report — 2026-08-09

指示書 v2 の §34「再承認なしで作業可能」4件（P0-1 / P0-3 / P0-4 / P0-5）を実装した。
P0-2 のみ GSC 実データが必要なため未完了で、§18 のとおり他作業は止めていない。

コミット5本（監査レポート1 + 実装4）。267ファイル / +4,100 / −1,167。

---

## What changed

| | 施策 | 状態 |
|---|---|---|
| P0-1 | Growth Loop の状態をリポジトリに持たせる | ✅ 完了 |
| P0-2 | 凍結中11ページの評価・凍結解除 | ⏸ **GSCデータ待ち**（§18の手順を用意） |
| P0-3 | line-keep の検索意図適合 | ✅ 完了（最小工数） |
| P0-4 | llms.txt / JSON-LD 版数是正 | ✅ 完了（SSOT化まで） |
| P0-5 | CTA placement 計測次元 | ✅ 完了 |

---

## Why

指示書 §37 の指摘どおり、問題は SEO 技術力でもコンテンツ量でもなく
**「評価日が来ても誰も判断しない」構造**だった。実装は全てそこに向けている。

12ページのリタイトルが評価日を11日超過して放置されたのは、注意力の問題ではない。
**期限切れになれる成果物が存在しなかった**。計画はレポートの散文にしかなく、
散文は手を挙げない。したがって最初にやるべきは記事でもタイトルでもなく、
「期限切れになれるファイル」を作ることだった。

---

## Files changed

### 新規

```
growth/README.md                     ループの設計と判断根拠
growth/GSC_OWNER_ACTION.md           人間の5分手順（判断を求めない）
growth/experiments/experiments.json  実験台帳（14件）
growth/lib/csv.mjs                   GSC CSV（BOM・引用符・日本語ヘッダ対応）
growth/lib/gsc.mjs                   スナップショット / 期待CTRカーブ / URL正規化 / 事業関連度
growth/lib/ledger.mjs                台帳の読み書き・検証・due導出
growth/scripts/ingest-gsc.mjs        CSV → コミット可能なスナップショット
growth/scripts/analyze.mjs           機会スコア / CTRギャップ / 衰退 / カニバリ
growth/scripts/experiments.mjs       list / due / show / add / evaluate / reschedule
growth/scripts/check-experiments.mjs CIゲート
growth/scripts/weekly-report.mjs     週次レポート生成
scripts/tag-cta-placements.js        CTA配置の機械分類（--check / --write）
docs/seo/GROWTH-AUDIT-2026-08-09.md  監査レポート
```

### 変更

```
.github/workflows/seo-check.yml   CIゲート2本追加
functions/_middleware.js          /growth/ を404対象に追加
robots.txt                        /growth/ Disallow
scripts/check-url-normalization.mjs  /growth/ 到達不能アサーション3件（172→175）
scripts/sync_constants.js         softwareVersion + llms.txt ルール追加
data/site-constants.json          appVersion + 出典メモ
llms.txt                          版数・Siri/AirPods・TestFlight注記
js/app-store-tracking.js          4次元 + seo_cta_impression
blog/line-keep-alternative.html   「どこ」FAQ（JA/EN + JSON-LD）
*.html（240ファイル）              CTA 912本に data-cta-* / ct= 配置、?v= 更新
```

---

## Measurement added

### 1. GSC がデータになった

`growth/data/gsc/<label>/` に正規化JSONを**コミットする**。散文はdiffできないが
JSONはできる。8月の判断を10月に同じバイト列から再導出できる。

CSVパーサは日本語ロケールのエクスポートを前提にしている
（`上位のクエリ,クリック数,表示回数,CTR,掲載順位` / BOM / `"2,150"` の引用符）。
ファイル名ではなく**列で**種別を判定するため、`クエリ.csv` のままで読める。

### 2. 期待CTRカーブを自サイトのデータから導出

`buildCtrCurve()` がスナップショット自身から順位別CTRを算出し、
500imp未満のバケットのみ参照値にフォールバックする。一般的な曲線は英語圏・
商用寄りのサンプルで高く出るため、そのまま使うと**通常の成績を「機会」に見せる**。
どのバケットが実測かは `meta.ctr_curve_derived_positions` に記録される。

### 3. CTA が配置別に測れるようになった

```
nav 469 / hero 207 / bottom 165 / mid 34 / reference 37   （計912本）
```

- `data-cta-placement|cluster|variant` → GA4（長さ制限なし・variant枠あり）
- `ct=…__<placement>` → App Store Connect（**インストールに届く唯一の経路**）
- `seo_cta_impression`（IntersectionObserver・50%可視・1PV1回）→ CTRの分母

分母が無いと「CTAの成績が悪い」と「そこまで誰もスクロールしていない」を
区別できず、この2つは打つ手が正反対になる。

---

## Experiments migrated

**PR #367 / #374 / #376 の実diffから12件**を抽出して台帳化した。before/after
タイトルは転記ではなく git の実データ。

| 実験 | ページ数 | 評価日 |
|---|---|---|
| #367 (07-01) | 8 | 2026-07-29 |
| #374 (07-02) | 2 | 2026-07-30 |
| #376 (07-02) | 2 | 2026-07-30 |

### 移行中に見つかった誤り

**`/blog/best-memo-apps-2026` は一度もリタイトルされていない。**

`git log -S'<title>'` が返すのはページ作成時（`3abaf029`）の1件のみ。
`ahrefs-gsc-analysis-2026-07-07.md` §3-1 が「リタイトル日 7/1 (#367)」と
記載していたのは誤りで、**2,035imp のページが存在しない実験を理由に
6週間凍結されていた**。

削除せず `status: cancelled` で記録した。台帳に問い合わせた人が
「凍結されていない」と分かる必要があるため。

散文の台帳では起きえた取り違えが、機械可読にした初日に1件出た。

---

## Overdue experiments

```
12件 overdue（最古11日超過）
```

CIで毎回 `::warning::` 注釈 + ジョブサマリ表として表示される。

**意図的にCIを落としていない。** SEO Validation のgreenが auto-merge の本番
デプロイ条件なので、未評価のリタイトルで落とすと無関係な修正まで止まり、
「デプロイを通すために判断を追認する」圧力が生まれる。可視性は確保しつつ
人質は取らない設計にした。`--strict` は定期ジョブ/ローカル用。

台帳の**パースエラーは落とす**。壊れたエントリは永久に due にならないため、
ゲート自体を無音で無効化してしまう。

---

## Owner action required

### 1. GSC エクスポート（約5分・週1回）— これだけが人間の定期作業

手順: **`growth/GSC_OWNER_ACTION.md`**（判断を求めない手順書）

```sh
# growth/input/ に解凍して置いたあと
node growth/scripts/ingest-gsc.mjs --label 2026-08-09 --period 2026-07-12..2026-08-08
node growth/scripts/weekly-report.mjs --write
```

取り込み直後の合計値が GSC 画面と一致するか確認すること（28日なら
クリック450〜550程度が目安）。

### 2. 凍結中12実験の評価（P0-2・約15分）

GSCスナップショット投入後:

```sh
node growth/scripts/experiments.mjs due
node growth/scripts/experiments.mjs evaluate <id> --decision keep|revert|iterate|inconclusive
```

`evaluate` は**変更後のGSCデータが無いと記録を拒否する**。記憶から
「keep」と書けてしまうなら、置き換えた運用と同じものに戻るため。

> **重要**: `title-2026-07-01-002`（line-keep）の判断は **2026-07-01〜07-29 の窓
> からのみ**読むこと。同ページに 08-09 のFAQ追加が入っており、以降は交絡する。
> 07-29までのデータは既にGSCに記録済みなので遡って壊れてはいない。

### ~~3. App Store 公開版数の確認~~ → ✅ 完了（2026-08-09）

オーナーが App Store Connect で **5.7.3 が配信中**であることを確認。
`appVersion` を 5.7.3 に更新し、JSON-LD 12ブロックと llms.txt へ伝播済み。

**当初 5.0.3 を採用したのは誤りだった。** `release.yml` が TestFlight 経路で
App Review 提出が opt-in（`submit_review` 既定 false）であることから
「5.5.0〜5.7.3 は TestFlight 止まり」と推測したが、実際には審査を通って
公開されていた。ビルド経路の既定値からリリース状態は決まらない。

教訓として `appVersionNote` には「両者は正当に乖離しうるので、
リポジトリの MARKETING_VERSION ではなく公開版を入れる」旨を残した。
再確認コマンド:

```sh
curl -s 'https://itunes.apple.com/lookup?id=6758438948&country=jp' | grep -o '"version":"[^"]*"'
```

### 4. LINE Keep ページの手順詳細（任意）

`guide.line.me` / `help.line.me` が遮断されており、07-16草案にあった
保存期間・引き継ぎ手順・メニュー階層は**書いていない**。LINE公式ヘルプで
確認できる人が追記すれば、「どこ」クエリへの回答がさらに強くなる。

---

## Expected KPI impact

| 施策 | Tier | 期待値 | 根拠の強さ |
|---|---|---|---|
| P0-3 line-keep 「どこ」 | Tier 2 | 490 imp/月 × CTR 0%→4% ≒ **+20 クリック/月** | 高（答えが無かったのは実測） |
| P0-3 波及（クラスタ全体） | Tier 2 | 4,045 imp の CTR 改善は**タイトル判断待ち** | 中 |
| P0-4 版数是正 | AIO | 引用精度。クリック増は0 | 高（不一致は実測） |
| P0-1 / P0-5 | — | **直接の増加は0**。以降の施策の精度と評価可能性を決める | — |

**P0全体でのSEOクリック期待値は +20〜30/月程度**にとどまる。監査時の
「+113/月」は line-keep 本体（4,045 imp）のCTR改善を含んだ数字で、
そこはタイトル実験の判断（P0-2）が前提になるため今回は着手していない。

指示書 §11 の指摘どおり、**これだけでは90日 Paid 1,000 には全く足りない**。
今回の投資対象は流入そのものではなく、**次の一手を期待値順に選べる状態**である。

---

## CI / Test result

```
seo-check.js                    0 errors / 165 warnings（全てHREFLANG・意図的残置）
check-url-normalization.mjs     175 checks passed（172 → +3 /growth/ 到達不能）
check-internal-redirects.mjs    11,268 links, all direct 200
sync_constants.js --check       OK
tag-cta-placements.js --check   OK（44本はページ単位ct維持・GA4側は影響なし）
check-experiments.mjs           12 overdue を検出・注釈出力
generate_sitemap.py --dry-run   OK
```

FAQ回答レイヤのパリティは 14/14 一致を実測。
`tag-cta-placements.js` は冪等（2回目の実行で0件変更）。

---

## Next P0

**P0-2 の完了**。オーナーのGSCエクスポート → 12実験の判断。
これが済むまで対象12ページはタイトル変更を重ねられない（§35）。

判断が出たら、`decision: revert` のものは台帳に before タイトルが
記録済みなのでそのまま戻せる。

---

## Next Tier-1 Growth Action

**音声 × Obsidian の面展開**（指示書 §12-13 / §27）。

Tier 1 への最短路であることは既にデータが示している:

```
/blog/obsidian-voice-input   CTR 10.5% / pos 6.2
obsidian 音声入力（クエリ）    CTR 18.8% / pos 4.5
```

line-keep（CTR 0.9% / Business Relevance 0.3）と比べて桁が違う。

ただし着手前に**音声4LPの担当インテント確定**が必要
（`/voice-input/` `/hands-free/` `/fastest-voice-memo/` `/siri/` が
似た主題を別々に主張している）。これを飛ばすとカニバリを増やすだけになる。

CTA計測（P0-5）が入ったので、今回からは**どの配置のCTAが
App Store 遷移を生んだか**まで追える。面展開の効果を
クリックではなくインストールで評価できる最初のサイクルになる。
