# Obsidian Automation Plan — 2026-08-09

指示書 §43〜§46 / §54〜§57 / §63 / §64 / §92〜§95。

**この文書の結論: 指示書 §63 が挙げる `scripts/seo/` の大半は 2026-08-09 に実装済み。
新規に作るのは3つだけ。**

---

## 既存（2026-08-09 導入・main にマージ済み）

| 指示書 §63 の候補 | 実態 |
|---|---|
| `ingest-gsc` | ✅ `growth/scripts/ingest-gsc.mjs`（日本語ヘッダ・BOM・引用符対応、合計は日別表から） |
| `detect-opportunities` | ✅ `growth/scripts/analyze.mjs --only opportunities` |
| `detect-decay` | ✅ 同 `--only decay`（**次スナップショットで初稼働**。比較対象が2つ必要） |
| `detect-cannibalization` | ✅ 同 `--only cannibalisation`（**クエリ×ページのエクスポート待ち**） |
| `detect-unanswered-intent` | ✅ 同 `--only unanswered`（**2026-08-09 実装**。期待クリック数3以上で足切り・下記A3） |
| `build-weekly-report` | ✅ `growth/scripts/weekly-report.mjs` |
| §93 Experiment Ledger | ✅ `growth/experiments/experiments.json` |
| §94 Evaluation Date 検知 | ✅ `growth/scripts/check-experiments.mjs`（CIで注釈・非ブロッキング） |
| §92 GSCの machine-readable 化 | ✅ `growth/data/gsc/<label>/`（コミット済み） |
| §95 CTA A/B（placement別） | ✅ `data-cta-placement` + `ct=…__<placement>` + `seo_cta_impression` |
| §55 refresh-queue.json | ✅ `growth/content/refresh-queue.json`（本日追加） |
| §56 new-queue.json | ✅ `growth/content/new-queue.json`（本日追加） |
| `suggest-links` | ⚠️ `scripts/add-internal-links.js` は存在するがルールがハードコード |
| `build-topic-map` | ❌ 未実装 |
| `generate-brief` | ❌ 未実装 |
| `refresh-article` | ❌ 未実装 |

**再実装しない。** 既にあるものを作り直すのは、今回の調査で最も避けるべきこと。

---

## 新規に作るもの（3つだけ）

### A1. クラスタ別集計を週次レポートへ（§64）

現在の週次レポートは「Paid-relevant / Low-relevance」の2分割まで。
指示書 §64 が求める Voice / Watch / AirPods / Quick Capture のクラスタ別セクションが無い。

**必要なのは新スクリプトではなく、`weekly-report.mjs` への追加**である。
クラスタ定義は `growth/lib/gsc.mjs` の `BUSINESS_RELEVANCE` と
`data/content-graph.json`（導入予定）から引く。

出力イメージ:

```md
## Obsidian clusters

| cluster | pages | imp | clicks | CTR |
|---|---:|---:|---:|---:|
| obsidian-voice   | 4 |   802 | 74 | 9.2% |
| obsidian-watch   | 3 | 1,062 | 24 | 2.3% |
| obsidian-compare | 2 |    93 |  2 | 2.2% |
```

Effort: S。**これが入るまで、Obsidianクラスタの成長を週次で追えない。**

### A2. `build-topic-map`（§4 / §44 の New Query Discovery）

スナップショットのクエリから Obsidian関連を抽出し、
`docs/obsidian/OBSIDIAN_TOPIC_MAP.md` の実測欄を再生成する。

**手で書いた地図は必ず腐る。** 今日作った Topic Map も、
次のスナップショットで数値がずれる。生成物にしておく。

同時に §44 の New Query Discovery を兼ねる:

```
前スナップショットに無く、今回現れた Obsidian関連クエリ
 かつ imp >= 5
  → 新規需要候補として new-queue.json へ提案
```

Effort: S〜M。

### A3. `detect-unanswered-intent` — 実装済み（2026-08-09）。ただし当初案は間違っていた

当初、この節はこう書いていた:

```
clicks == 0
かつ position <= 12      （順位は取れている）
かつ impressions >= 8    （偶然ではない）
```

そして「今回 249 imp の取りこぼしを見つけた最も価値のある分析」だと書いた。
**これは誤りだった。** `impressions >= 8` は「偶然ではない」ことを保証しない。

実装して回したところ、この条件では20行・4,387 impが引っかかった。
だが上位の多くは**期待クリック数が1未満**——0クリックが正常な行だった。
249 imp の「発見」の実体は、合計1.3クリックしか期待できない4クエリだった。

実装した条件は次のとおり:

```
clicks == 0
かつ position <= 12
かつ impressions × 期待CTR(position) >= 3   ← 追加
```

期待3クリックに対して0が返る確率は偶然でも約5%（e^-3）。
ここを超えて初めて「見に行く価値がある」と言える。
並び順も imp ではなく**期待クリック数**にした。impで並べると
最もノイズの多い行が上に来る。

結果は20行 → **6行**。Obsidianクラスタは1行も残らなかった。

**この検出器の価値は、前回手作業で得た結論を再現したことではなく、
それが間違いだったと示したことにある。**

Effort: XS（実装済み・`analyze.mjs --only unanswered`）。

---

## 作らないもの

| 指示書の項目 | 判断 |
|---|---|
| `generate-brief` / `refresh-article`（記事生成） | **当面作らない。** Verification ゲート（§86）を満たせる環境（macOS）が無い状態で生成能力だけ増やすと、検証されない記事が積み上がる |
| Programmatic SEO（§47） | ループが1周（次スナップショット）してから判断 |
| サイト内検索（§80） | 記事数が増えてから |
| RSS（§70） | 運用工数に見合わない |

---

## Existing Page First の自動化（§45）

新規キューへ項目を足す前に、必ず既存ページとの照合を通す:

```
候補クエリ
 ↓
growth/data/gsc の pages.json から、そのクエリで既に順位を持つページを探す
 ↓  （クエリ×ページがあれば確実。無ければクラスタ推定）
あり → Refresh / Expand として refresh-queue.json へ
なし → New として new-queue.json へ
```

**クエリ×ページのエクスポートが無いと、この判定が推測になる。**
今回 R2 / R4 / R5 が `blocked_by` になっているのはこのため。
オーナー作業3分で3件が一気に前進する。

---

## Cannibalization（§46）

`analyze.mjs --only cannibalisation` は実装済みだが、
**クエリ×ページのデータが無いため未稼働**。

稼働後に見るべき既知の疑い:

```
line-keep クラスタ 4URL（/blog/line-keep-alternative ほか）
音声 4LP（/voice-input/ /hands-free/ /fastest-voice-memo/ /siri/）
/apple-watch/ vs /apple-watch-obsidian/     ← 最優先
obsidian iphone 系（/blog/obsidian-iphone-memo と他ページの分散）
```

処置の選択肢は Merge / Intent split / Canonical / Redirect。
**本サイトでは Intent split を第一候補とする。** 301は
`functions/_middleware.js` の1ホップ設計とGSCのリダイレクトバケットに
影響するため、コンテンツ側で解けるなら触らない。

---

## Content Decay（§54）

`analyze.mjs --only decay` は実装済み・**次スナップショットで初稼働**。

分類ロジック（実装済み）:

```
Δposition > 1.5             → ranking loss
Δimpressions < -20%         → demand or indexing loss
CTR が前回の80%未満          → CTR loss (SERP change / snippet)
それ以外                     → mixed
```

---

## 運用サイクル（人間の稼働 §62）

```
週1回・約6分（人間）
  1. GSCエクスポート（5分）        growth/GSC_OWNER_ACTION.md
  2. 週次レポートを読む（1分）     growth/reports/YYYY-MM-DD-weekly.md

それ以外（Claude Code）
  取り込み → 機会抽出 → 未回答意図検出 → 衰退検知 → カニバリ検知
  → キュー更新 → 実験台帳の期限確認 → 実装 → PR
```

**人間の判断が要るのは4つだけ**（§62）:

```
最終承認 / ブランド判断 / 一次情報の提供 / 実機限定の確認
```

うち「実機限定の確認」は、SimpleMemo の主力訴求
（音声品質・AirPods・Watch）がすべてここに入るため、
**想定より重い**（`ARTICLE_VERIFICATION_PLAN.md` 参照）。
ここを軽く見積もると、検証済みコンテンツの生産速度を過大に見積もることになる。
