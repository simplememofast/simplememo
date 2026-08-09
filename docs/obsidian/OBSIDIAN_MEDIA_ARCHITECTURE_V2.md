# Obsidian Media Architecture v2 — 2026-08-09

指示書 v2 §116 の調査結果と設計。**コードは変更していない。**

数値の出典は `growth/data/gsc/2026-08-09`（2026-07-11〜08-07 / 28日 / 実測）と
リポジトリ走査。既存レポート由来の値は都度明記する。

---

## 0. 先に伝えるべき2点

### 0-1. この環境では iOS Simulator を一切動かせない

```
OS: Ubuntu 24.04 (Linux 6.18.5)
xcrun / xcodebuild / simctl / swift : すべて NOT AVAILABLE
```

指示書 §15〜§34 と §105 の PoC は **macOS 上でしか実行できない**。
本セッションでできるのは「設計とスクリプトの記述」までで、
**boot / build / install / screenshot の実行と検証はできない**。

書けるが動かせないものを「実装した」と報告しない。実行環境の手当て
（オーナーのMacか、GitHub Actions の `macos-latest` ランナー）が前提になる。
§29 の「Simulator と実機を区別する」原則をこの階層にも適用し、本設計では

```
Written (未実行) / Simulator verified / Physical device verified
```

の3状態を使う。現時点で書くものはすべて **Written** から始まる。

### 0-2. iOS側の自動化基盤は指示書の想定よりはるかに先行している

§105 は「まず boot→build→install→launch→1画面→assert→screenshot 1枚」を
最初の成功条件に置いているが、**このうち screenshot 以外は既に存在する**。

| 指示書が「作る」としているもの | 実態 |
|---|---|
| §20 Screenshot Mode | ✅ `SimpleMemo/QA/QATestSupport.swift` に launch environment 契約が集約済み。Releaseでは `#if DEBUG` で完全に無効化 |
| §21 Seed Data | ✅ `UITEST_FIXTURE=verified\|unverified` / `UITEST_TODAY_SENT=<n>` / `UITEST_PREFILL_TEXT` |
| §19 accessibilityIdentifier | ✅ アプリ側21箇所 + `QAUITestBase.swift` の `enum AX` に契約として複製 |
| §18 Deep Link | ✅ `simplememo://compose?voice=1`（URL scheme登録済み・SceneDelegate/AppIntents で処理） |
| §18 Launch Argument | ✅ 上記に加え `UITEST_NETWORK=success\|offline\|timeout\|server500\|rateLimited`、`UITEST_SUBSCRIPTION=free\|premium\|expired`、`UITEST_LOCALE`、`UITEST_OBSIDIAN_MODE=sandbox` |
| §16 UI Test target | ✅ `SimpleMemoUITests` に9ファイル、TestPlan 5本（FastUnit / iOS-PR / Nightly / ReleaseSmoke / Watch） |
| **Screenshot取得** | ❌ **ゼロ**。`XCTAttachment` / `screenshot` の使用箇所が1件もない |

つまり **本当に無いのはスクリーンショット取得と、その記事連携だけ**である。
§105 の PoC を素直に作ると、既にあるものを作り直すことになる。
実際の不足分は `IOS_SIMULATOR_AUTOMATION_PLAN.md` に切り出した。

---

## 1. Current Site

| | |
|---|---|
| 形式 | ビルドなしの静的HTML / Cloudflare Pages（mainへのマージ＝本番デプロイ） |
| ページ数 | JA 188（インデックス対象）/ EN 41 / 他8ロケール各1 |
| Obsidianに言及するページ | **198**（サイトのほぼ全ページ。ブランド名に "Obsidian連携" が入るため） |
| URLに Obsidian/音声/Watch/Siri を持つ JAページ | **16** |
| 既存ハブ | `/obsidian/` `/voice-input/` `/apple-watch/` `/siri/` `/ai-tags/` `/hands-free/` `/fastest-voice-memo/` |
| CI | SEO Validation 7ゲート（seo-check / URL正規化175 / 内部リンク11,268 / constants / CTA / 実験期限 / sitemap） |
| Growth Loop | ✅ 2026-08-09 に `growth/` として導入済み（GSC取り込み・実験台帳・週次レポート） |
| Navigation | 使い方 / 活用事例 / 比較 / メソッド / ブログ / FAQ / About / Dev Log — **Obsidian入口が無い** |

**コンテンツ生成パイプラインは存在しない。** `scripts/` にあるのは検証（seo-check ほか）と
配信（sitemap / OG画像 / IndexNow）のみで、記事の企画・執筆・品質ゲートは未実装。

---

## 2. Existing Winning Pages

### 2-1. Obsidian需要は「小さいが濃い」

```
Obsidian関連クエリ  129語 / 1,030 imp / 70 clicks / CTR 6.80%
サイト全体                38,599 imp / 813 clicks / CTR 2.11%
```

**表示回数の約2.7%しかないのに、クリックの8.6%を占める。CTRはサイト平均の3.2倍。**

指示書の仮説（Obsidian需要こそSimpleMemoと相性が良い）は、推測ではなく
**このサイトの実データで裏付けられている**。これが本設計の土台になる。

### 2-2. 勝っているページ

| ページ | imp | clicks | CTR | pos |
|---|---:|---:|---:|---:|
| `/blog/obsidian-voice-input` | 588 | **64** | **10.9%** | 5.3 |
| `/obsidian/` | 827 | 37 | 4.5% | 8.0 |
| `/apple-watch/` | 954 | 20 | 2.1% | 7.5 |
| `/fastest-voice-memo/` | 17 | 3 | 17.6% | 6.2 |
| `/apple-watch-obsidian/` | 36 | 3 | **8.3%** | 6.1 |
| `/siri/` | 20 | 2 | 10.0% | 6.9 |

クエリ側でも「obsidian 音声入力」130 imp / CTR **18.5%** / pos 4.5、
「obsidian 音声入力 iphone」29 imp / CTR **17.2%** / pos 3.2。

**音声 × Obsidian は既に勝っている。**面展開の基準記事は `/blog/obsidian-voice-input` で確定。

### 2-3. EN側がクラスタの足を引っ張っている

```
JA  15ページ / 2,892 imp / 143 clicks / CTR 4.94%
EN  10ページ / 1,343 imp /  13 clicks / CTR 0.97%
```

EN はクラスタ表示の **32%** を占めながらクリックの **8%** しか生んでいない。CTRは5分の1。
`/en/obsidian/` は 132 imp で **クリック0**（pos 14.1）。

指示書が目指すのは「Obsidianを使う**日本語**ユーザーが参照するサイト」であり、
データもそれを支持する。**EN の Obsidian 面は拡張しない。** 既存分の維持に留める。

---

## 3. 最大の発見: 答えていない意図が249 imp ある

順位は取れているのにクリック0のクエリ（pos≤12・imp≥8）:

| imp | pos | query | 現状の問題 |
|---:|---:|---|---|
| 42 | 8.8 | セカンドブレイン obsidian | `/methods/second-brain/` はメール軸で、Obsidian軸の解が無い |
| 26 | 11.0 | obsidian iphone | 該当ページが `/blog/obsidian-iphone-memo`（24 imp）だが弱い |
| 24 | **6.0** | **obsidian apple watch** | **6位で0クリック**。§3-1参照 |
| 23 | 9.2 | logseqとobsidian どちらが 良い | 比較ページ不在 |
| 17 | 7.2 | obsidian 文字起こし | 音声入力記事はあるが「文字起こし」語で答えていない |
| 10 | 6.5 | obsidian 音声 文字起こし | 同上 |
| 10 | 7.8 | obsidian 録音 文字起こし | 同上 |
| 9 | 5.1 | obsidian 音声 | 同上 |
| 12 | 10.6 | email to obsidian | JA版 `/blog/email-to-obsidian` は19 imp と弱い |
| 9 | 7.3 | capacities vs obsidian | `/vs/capacities/` はSimpleMemo比較でObsidian比較ではない |

**合計249 imp が0クリック。** 新規需要の開拓ではなく、
**既に順位を持っている面で答えを出していない**のが主症状である。

### 3-1. `/apple-watch/` と `/apple-watch-obsidian/` の意図取り違え

```
/apple-watch/           954 imp / CTR 2.1% / pos 7.5   ← 汎用ページ
/apple-watch-obsidian/   36 imp / CTR 8.3% / pos 6.1   ← Obsidian特化ページ
クエリ「obsidian apple watch」24 imp / 0 clicks / pos 6.0
```

Obsidian×Watch の意図が、CTR 8.3% を出している特化ページではなく
CTR 2.1% の汎用ページに着地している疑いが強い。**確定にはクエリ×ページの
エクスポートが要る**（`growth/GSC_OWNER_ACTION.md` 手順3・3分）。

これは記事を増やす話ではなく、**既存2ページの役割分担と内部リンクの問題**。

---

## 4. Topic Map / URL / Internal Link / Content Queue / Conversion

分量が大きいため別ファイルに分けた。本書はそれらの索引を兼ねる。

| 文書 | 扱う範囲 |
|---|---|
| `OBSIDIAN_TOPIC_MAP.md` | クラスタ定義・Intent分類・Business Relevance・実測需要 |
| `OBSIDIAN_URL_PLAN.md` | URL設計と既存URLの Keep/Refresh/Merge 判定 |
| `OBSIDIAN_INTERNAL_LINK_PLAN.md` | Parent/Sibling/Child モデルとメタデータ層 |
| `OBSIDIAN_CONTENT_QUEUE.md` | 何を作り何を直すか（機械可読キュー付き） |
| `OBSIDIAN_CONVERSION_PLAN.md` | Relevance別CTA設計と計測 |
| `OBSIDIAN_AUTOMATION_PLAN.md` | growth/ の拡張（既存との重複を排除） |
| `IOS_SIMULATOR_AUTOMATION_PLAN.md` | 実在する基盤と、本当に足りないもの |
| `ARTICLE_VERIFICATION_PLAN.md` | 主張抽出→検証→記事反映 |
| `SCREENSHOT_PIPELINE_PLAN.md` | 撮影・QA・記事挿入・陳腐化検知 |
| `OBSIDIAN_90DAY_ROADMAP.md` | 期待値順の実行計画（P0/P1/P2） |

---

## 5. Navigation

現在のグローバルナビに **Obsidian への入口が無い**
（使い方 / 活用事例 / 比較 / メソッド / ブログ / FAQ / About / Dev Log）。

サイトを「Obsidianを調べる場所」にするなら、ここが最初の構造的欠落。
ただしナビ項目の追加は全240ページのHTML書き換えになるため、
**`/obsidian/` ハブの中身を整えてから**行う（順序を逆にすると空のハブへ送客する）。

提案（過密回避のため既存を1つ畳む）:

```
Obsidian ← 新規（/obsidian/）
使い方
比較
活用事例
ブログ
```

---

## 6. Measurement

2026-08-09 に導入済みの `growth/` をそのまま使う。**新しい計測基盤は作らない。**

- GSCスナップショット → `growth/data/gsc/<label>/`（コミット済み・差分追跡可）
- 実験台帳 → `growth/experiments/experiments.json`（評価期限をCIが検知）
- CTA配置 → `data-cta-placement|cluster|variant` + `ct=…__<placement>`
- 週次レポート → `growth/scripts/weekly-report.mjs`

Obsidian向けに足りないのは **クラスタ単位の集計**のみ（§64 の Voice/Watch/AirPods/
Quick Capture セクション）。`OBSIDIAN_AUTOMATION_PLAN.md` で扱う。

---

## 7. 判断基準に対する現時点の回答（§118）

> 「これは simplememofast.com を Obsidian日本語圏の参照サイトに近づけるか？」

近づける施策は **既存面の答えの充実**であって、記事の量産ではない。
249 imp の0クリック意図が、順位を持ったまま放置されている。

> 「その結果、SimpleMemoに最も相性の良いユーザーを増やせるか？」

Obsidian経由の読者は CTR 3.2倍。**同じクリック1回の価値が他クラスタより高い**。
line-keep（CTR 0.9% / Business Relevance 0.3）に投じる工数をこちらへ移すべき。

> 「重要な主張は、コード・Simulator・実機のいずれかで検証されているか？」

現時点で **検証済み記事はゼロ**。ただし基盤は8割できており、
不足はスクリーンショット取得のみ。ここは投資対効果が非常に高い
——ただし **macOS実行環境が前提**（§0-1）。
