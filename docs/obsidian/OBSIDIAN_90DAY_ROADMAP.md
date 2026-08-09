# Obsidian 90-Day Roadmap — 2026-08-09

指示書 §99〜§103 / §117。

各施策に Impact / Confidence / Effort / SEO impact / Paid impact /
Automation level / Verification value / Human time を付す。

**前提となる制約を2つ先に置く:**

1. **macOS環境が無い限り、Simulator関連はすべて着手できない。**
   ロードマップ上で「実行可能」と「記述のみ」を分ける。
2. **クエリ×ページのエクスポート（3分）が3つの施策をブロックしている。**
   これが最も費用対効果の高いオーナー作業。

---

# P0 — 今すぐ（Month 1 前半）

### P0-1. 「未回答の意図」検出を自動化する

| | |
|---|---|
| Impact | **高**（今回の手作業で249 impの取りこぼしを発見した視点そのもの） |
| Confidence | **高**（既に1回機能している） |
| Effort | **XS**（`analyze.mjs` に `--only unanswered` を足すだけ） |
| SEO impact | 間接（発見の質） |
| Paid impact | 間接 |
| Automation | **完全自動** |
| Verification value | — |
| Human time | 0 |

`clicks == 0 && position <= 12 && impressions >= 8` を毎週自動抽出。
今回の最大の発見を再現可能にする。**ロードマップ中で最も安く、最も効く。**

### P0-2. `/blog/obsidian-voice-input` に「文字起こし」を足す（R1）

| | |
|---|---|
| Impact | 中（+8〜15クリック/月） |
| Confidence | **高**（46 impがpos5〜8で0クリック＝答えが無いだけ） |
| Effort | S |
| SEO impact | 直接 |
| Paid impact | **高**（Relevance HIGH・CTR 10.9%の記事の読者） |
| Automation | 手動（本文追記） |
| Verification value | 低（新規機能主張を含まないため検証ゲート不要） |
| Human time | 承認のみ |

**タイトルは触らない。** サイト最強ページを実験台にしない。

### P0-3. クエリ×ページのエクスポート（オーナー3分）

| | |
|---|---|
| Impact | **高**（3施策のブロック解除 + カニバリ検知の初稼働） |
| Confidence | 高 |
| Effort | XS |
| Human time | **3分** |

ブロック解除される施策:

```
R2  /apple-watch/ → /apple-watch-obsidian/ の導線（着地先の確定）
R4  /blog/obsidian-iphone-memo の強化（分散の実態把握）
R5  音声4LPの統廃合判断
+   /obsidian/ のCTR低下原因（クエリ構成が広がったかの確認）
```

優先すべきページは `growth/GSC_OWNER_ACTION.md` 手順3に記載済み。

### P0-4. `/methods/second-brain/` に Obsidian軸（R3）

| | |
|---|---|
| Impact | 中（42 imp・クラスタ単一最大の未回答） |
| Confidence | 高 |
| Effort | S |
| Paid impact | 中 |
| Human time | 承認のみ |

### P0-5. 週次レポートにクラスタ別集計（A1）

| | |
|---|---|
| Impact | 中（間接・可視化） |
| Confidence | 高 |
| Effort | S |
| Automation | 完全自動 |
| Human time | 0 |

**これが入るまで Obsidianクラスタの成長を週次で追えない。**
Month 2 のスケール判断に必要。

---

# P1 — Month 1 後半 〜 Month 2

### P1-1. Simulator スクリーンショット PoC

| | |
|---|---|
| Impact | 中〜高（§89 の Content Moat「AI-generated but simulator-verified」の起点） |
| Confidence | **中**（基盤は8割あるが、この環境で実行検証できていない） |
| Effort | S（既存 `SettingsAndObsidianUITests` に撮影を足すだけ） |
| Verification value | **最高** |
| Human time | macOS実行 + 画像の視覚QA |
| **前提** | **macOS環境。無ければ着手不可** |

`IOS_SIMULATOR_AUTOMATION_PLAN.md` の通り、作るのは撮影ヘルパと
xcresult展開だけ。新しいランナーは書かない。

### P1-2. `data/content-graph.json` 導入（Obsidian 16ページ分のみ）

| | |
|---|---|
| Impact | 中（内部リンク・陳腐化検知・クラスタ集計の土台） |
| Confidence | 中 |
| Effort | M |
| Automation | 半自動 |

**全188ページを一度に埋めない。** 使われる保証のないメタデータを
先に作らない。Obsidianクラスタで有効性を確認してから広げる。

### P1-3. 内部リンク配線4件（データ根拠あり）

`/apple-watch/`→`/apple-watch-obsidian/`（P0-3 の結果待ち）、
`/blog/obsidian-voice-input`→`/siri/`・`/apple-watch-obsidian/`、
`/ai-tags/` の被リンク1→3本、`/methods/second-brain/`↔`/obsidian/`。

Impact 中 / Confidence 中 / Effort S。

### P1-4. `/obsidian/compare/logseq/`（N1）

| | |
|---|---|
| Impact | 中（68 imp・うち23 impが0クリック） |
| Confidence | 中 |
| Effort | M |
| SEO impact | 直接 |
| Paid impact | 中 |
| Verification value | 中（モバイル入力の実測を含めるなら） |

`/vs/*` 39本がすべてSimpleMemo軸で、**Obsidian軸の比較が1本も無い**構造的空白。

### P1-5. `/obsidian/` ハブ化（**2026-09-13 以降**）

`monitor-2026-08-09-obsidian-ctr` の評価が出るまで着手しない。
今作り替えると進行中の監視が読めなくなる。

### P1-6. `/tools/obsidian-uri-generator/`（N4）

Impact 中（被リンク）/ Confidence 中 / Effort S。
サイトにインタラクティブツールが0個で、被リンク獲得がPR TIMES単発依存。

---

# P2 — Month 3 / バックログ

| # | 施策 | 理由 |
|---|---|---|
| P2-1 | Navigation に Obsidian 入口 | **ハブの中身が整ってから。** 空のハブへ送客しない。240ファイルの一括編集でもある |
| P2-2 | `/obsidian/quick-capture/` | Relevance HIGH だが**このサイトでの需要が未検証**（実測0 imp） |
| P2-3 | Plugins / Sync / AI / Beginner クラスタ | 未検証。Tier A/B の取りこぼしが先 |
| P2-4 | 記事生成の自動化（`generate-brief` / `refresh-article`） | 検証ゲートを満たせる環境が無い状態で生成能力だけ増やさない |
| P2-5 | 独自調査 + PR（§49 / §50） | 実測データが揃ってから |
| P2-6 | Custom Product Page 連携（§96） | オーナー作業（App Store Connect） |
| P2-7 | Programmatic SEO（§47） | ループが1周してから |
| P2-8 | サイト内検索 / RSS | 記事数が増えてから |

---

# Month別まとめ

## Month 1 — Foundation

```
✅ 済（2026-08-09）: GSC pipeline / Experiment ledger / CTA measurement / Content queue
P0-1  未回答意図の自動検出
P0-2  R1（文字起こし）
P0-3  クエリ×ページ（オーナー3分）
P0-4  R3（セカンドブレイン）
P0-5  クラスタ別週次レポート
P1-1  Simulator PoC ※macOS必須
P1-2  content-graph.json（Obsidian分のみ）
```

**Month 1 の成功条件は記事数ではない。**
「未回答意図が毎週自動で出てくる状態」と
「既存の勝ち記事の取りこぼしが塞がった状態」。

## Month 2 — Scale

P1-3 内部リンク / P1-4 logseq比較 / P1-5 `/obsidian/` ハブ（09-13以降）/
P1-6 ツール1本。並行して Simulator 検証を音声クラスタへ展開。

**本数は固定しない**（§101）。週次レポートの
未回答意図が枯れた分だけ New へ移す。

## Month 3 — Authority

比較クラスタ拡張 / Plugins・Sync（需要検証後）/ Linkable asset /
Benchmark content（§91）/ 独自調査+PR。

---

# 最終判断基準に対する回答（§118）

> 「Obsidian日本語圏の参照サイトに近づけるか？」

**最短路は記事量産ではなく、既に順位を持つ面で答えを出すこと。**
249 impが0クリックで放置されている。ここが埋まらないうちに
新クラスタを開拓しても、同じ取りこぼしを再生産する。

> 「SimpleMemoに最も相性の良いユーザーを増やせるか？」

Obsidian経由の読者は **CTR 6.80%（サイト平均2.11%の3.2倍）**。
表示の2.7%でクリックの8.6%を生む。**同じ1クリックの価値が他クラスタより高い。**
line-keep（CTR 0.9% / Relevance 0.3）に割く工数をこちらへ移す。

> 「重要な主張は検証されているか？」

**現時点で検証済み記事は0本。** 基盤は8割あるが、
macOS実行環境が無いため1枚も撮れていない。

そして重要な事実として、**SimpleMemo の主力訴求（音声品質・AirPods・Watch）は
Simulatorでは検証できない**。Simulator が保証できるのは
「操作手順とUIの正確さ」までで、そこを混同すると
§28 が禁じる「Simulator確認を実機確認と書く」に実質的に踏み込む。

「AI-generated but simulator-verified」を差別化にするなら、
**何が検証済みで何がそうでないかを記事ごとに明示すること**自体が
差別化の中身になる。
