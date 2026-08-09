# Obsidian Topic Map — 2026-08-09

指示書 §4〜§6。**推測のクラスタ表ではなく、実測需要に紐づけた地図**にしてある。

出典: `growth/data/gsc/2026-08-09`（2026-07-11〜08-07 / 28日）。
「実測」欄が空のクエリは **このサイトでまだ表示が発生していない**（需要が無いとは限らない）。

> **重要な限界**: GSCのクエリエクスポートは上位1,000行で打ち切られ、
> 匿名化クエリも除外される。したがって表に無い＝ゼロではない。
> 本表の実測値は**下限**として読むこと。

---

## 分類軸

| 軸 | 値 |
|---|---|
| Intent | Informational / How-to / Troubleshooting / Comparison / Commercial / Navigational |
| Funnel | Awareness / Problem-aware / Solution-aware / **Workflow-aware** / Product-aware / Ready-to-install |
| Relevance | HIGH / MEDIUM / LOW / NONE |

**Workflow-aware** がこのサイトの勝負どころ。「Obsidianは使っているが、
外出先での入力が面倒」と気づいた瞬間の層で、SimpleMemoの存在理由と正確に一致する。

---

## Tier A — Obsidian × SimpleMemo 強親和（Relevance HIGH）

**ここが全体の最優先。CTRが実証済みで、Tier 1（課金）に最も近い。**

| Query | 実測 imp | CTR | pos | Intent | Funnel | 現状 |
|---|---:|---:|---:|---|---|---|
| obsidian 音声入力 | **130** | **18.5%** | 4.5 | How-to | Workflow-aware | ✅ `/blog/obsidian-voice-input` が獲得 |
| obsidian 音声入力 iphone | 29 | **17.2%** | 3.2 | How-to | Workflow-aware | ✅ 同上 |
| obsidian 録音 | 16 | 12.5% | 7.6 | How-to | Workflow-aware | ⚠️ 弱い |
| **obsidian apple watch** | 24 | **0.0%** | **6.0** | How-to | Workflow-aware | ❌ 汎用 `/apple-watch/` へ着地の疑い |
| **obsidian 文字起こし** | 17 | **0.0%** | 7.2 | How-to | Solution-aware | ❌ 語が本文に無い |
| **obsidian 音声 文字起こし** | 10 | **0.0%** | 6.5 | How-to | Solution-aware | ❌ 同上 |
| **obsidian 録音 文字起こし** | 10 | **0.0%** | 7.8 | How-to | Solution-aware | ❌ 同上 |
| **obsidian 音声** | 9 | **0.0%** | 5.1 | Informational | Problem-aware | ❌ 同上 |
| obsidian siri | — | — | — | How-to | Workflow-aware | `/siri/` あり（20 imp / CTR 10.0%） |
| obsidian airpods | — | — | — | How-to | Workflow-aware | `/siri/` が兼任 |
| obsidian クイックキャプチャ | — | — | — | How-to | Workflow-aware | ページ不在 |
| obsidian 外出先 メモ | — | — | — | How-to | Workflow-aware | ページ不在 |
| obsidian ハンズフリー | — | — | — | How-to | Workflow-aware | `/hands-free/` あり（30 imp） |

**Tier A の要点**: 「文字起こし」系4クエリ計46 impが、pos 5〜8で**全て0クリック**。
`/blog/obsidian-voice-input` は CTR 18.5% を出す強い記事なのに、
**「文字起こし」という語で書かれていない**だけで取りこぼしている。
新規記事ではなく、既存の勝ち記事へのセクション追加で解ける。

---

## Tier B — Obsidian一般トラフィック（Relevance MEDIUM）

| Query | 実測 imp | CTR | pos | Intent | Funnel | 現状 |
|---|---:|---:|---:|---|---|---|
| obsidian 使い方 iphone | 68 | 5.9% | 7.6 | How-to | Solution-aware | ⚠️ 分散 |
| obsidian iphone 使い方 | 45 | 6.7% | 8.1 | How-to | Solution-aware | ⚠️ 同上（表記ゆれで2語） |
| **セカンドブレイン obsidian** | **42** | **0.0%** | 8.8 | Informational | Awareness | ❌ `/methods/second-brain/` はメール軸 |
| obsidian セカンドブレイン | 26 | 7.7% | 7.2 | Informational | Awareness | ⚠️ 語順違いでCTR差 |
| **obsidian iphone** | 26 | **0.0%** | 11.0 | Informational | Problem-aware | ❌ 2ページ目 |
| obsidian iphone デイリーノート | 25 | 12.0% | 7.4 | How-to | Workflow-aware | ✅ 効いている |
| obsidian outlook 連携 | 18 | 5.6% | 7.7 | How-to | Solution-aware | ⚠️ |
| **email to obsidian** | 12 | **0.0%** | 10.6 | How-to | Solution-aware | ❌ JA版が19 impと弱い |
| **obsidian memo** | 12 | **0.0%** | 11.7 | Informational | Awareness | ❌ |
| **obsidian ジャーナリング** | 9 | **0.0%** | 11.7 | Informational | Awareness | ❌ |
| obsidian 活用事例 | 9 | 33.3% | 10.6 | Informational | Awareness | ✅ CTR高い |
| obsidian iphone アプリ | 9 | 22.2% | 9.9 | Informational | Solution-aware | ✅ |
| **obsidian 解約** | 10 | 0.0% | 11.8 | Troubleshooting | — | Relevance **NONE**。作らない |

**「セカンドブレイン obsidian」42 impが最大の未回答**。語順違いの
「obsidian セカンドブレイン」26 impは CTR 7.7% を出しているので、
需要そのものは獲れる。1ページで両方を拾う設計にする。

---

## Tier C — 比較（Relevance MEDIUM / Authority補完）

| Query | 実測 imp | CTR | pos | 現状 |
|---|---:|---:|---:|---|
| memos vs obsidian | 31 | 3.2% | 4.1 | ⚠️ 該当ページ不明 |
| dynalist obsidian / obsidian dynalist | 45 | 4.5% | 3.9 | `/vs/dynalist/`（1,416 imp）が拾っている |
| logseq obsidian（+比較・どちらが良い） | 68 | 1.5% | 7.7 | ❌ Obsidian比較ページ不在 |
| **logseqとobsidian どちらが 良い** | 23 | **0.0%** | 9.2 | ❌ |
| capacities vs obsidian | 9 | 0.0% | 7.3 | ❌ `/vs/capacities/` はSimpleMemo比較 |
| obsidian craft | 9 | 0.0% | 5.3 | ❌ |
| obsidian 比較 | 11 | 0.0% | 11.2 | ❌ ハブ不在 |
| logseq obsidian unterschiede / vergleich | 26 | 0.0% | 34 | **ドイツ語。対象外**（Relevance NONE） |

**構造的な問題**: `/vs/*` 39ページは全て「SimpleMemo vs X」であり、
**「Obsidian vs X」が1本も無い**。Obsidianを軸にした比較需要
（logseq 68 imp / capacities 9 / craft 9 / 比較 11）に受け皿が無い。

`/vs/notion-vs-obsidian/`（7 imp）だけが例外だが、ほぼ死んでいる。

---

## Tier D — 未検証クラスタ（このサイトでは表示ゼロ）

指示書 §4 が挙げる領域のうち、**実測で1 impも観測されていない**もの。
需要が無いのではなく、**このサイトがまだ何も持っていない**だけの可能性が高い。

```
Plugins:  Obsidian プラグイン / QuickAdd / Templater / Dataview / Advanced URI
Sync:     Obsidian Sync / iCloud / 同期 / Windows iPhone 同期
AI:       Obsidian AI / ChatGPT / Claude / 要約 / 自動整理
PKM:      PARA / GTD / Zettelkasten（Obsidian軸）
Beginner: Obsidianとは / 始め方 / 日本語 / Vault / 料金
```

**着手順の判断**: これらは「作れば取れるか」が未検証で、Confidence が低い。
Tier A/B の既存面（249 impの0クリック）を先に潰すほうが期待値が高い。

例外は **Plugins と Sync**。Obsidianユーザーの検索量が大きい領域で、
かつ SimpleMemo は「プラグイン不要」「同期に依存しない」という
明確な立ち位置を持つため、Tier B相当の Relevance を主張できる。
ただし Month 3 以降。

---

## Relevance 判定の根拠

| Relevance | 定義 | 例 |
|---|---|---|
| **HIGH** | Obsidianへの**入力**が主題。SimpleMemoが解決する問題そのもの | 音声入力 / Apple Watch / Siri / AirPods / クイックキャプチャ / 外出先 / 文字起こし |
| **MEDIUM** | Obsidianの運用。入力の話に自然に接続できる | iPhone / デイリーノート / Inbox / セカンドブレイン / 比較 |
| **LOW** | Obsidian一般。Authority補完としてのみ価値 | プラグイン / CSS / Dataview / Vault |
| **NONE** | SimpleMemoと接点が無い、または他言語 | 解約 / ドイツ語クエリ |

この値は `growth/lib/gsc.mjs` の `BUSINESS_RELEVANCE` に反映済み
（`/obsidian/` `/blog/obsidian-*` `/siri/` `/voice-input/` 等 = 1.0）。
新クラスタを足すときは**同ファイルにパターンを追加する**こと。
入れ忘れると週次レポートの「Paid-relevant opportunities」に出てこない。

---

## この地図から出る結論

1. **新規クラスタを開拓する前に、Tier A/B の0クリック249 impを潰す。**
   順位は既にあるので、答えを書くだけで取れる。
2. **音声クラスタは「文字起こし」語で書き直す。**
   46 impがpos5〜8で0クリック。勝ち記事へのセクション追加で解ける。
3. **「Obsidian vs X」の受け皿を作る。** `/vs/` 39本すべてがSimpleMemo軸で、
   Obsidian軸の比較が存在しない。logseq だけで68 imp。
4. **EN側のObsidian面は拡張しない。** CTR 0.97%（JAは4.94%）。
5. **Plugins / Sync / AI / Beginner は Month 3 まで着手しない。** 未検証で
   Confidence が低く、既存面の取りこぼしのほうが確実。
