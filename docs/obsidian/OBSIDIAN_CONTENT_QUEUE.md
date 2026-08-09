# Obsidian Content Queue — 2026-08-09

指示書 §45 / §55 / §56 / §61 / §87。

**本数を先に決めない。** 実測の取りこぼし順に並べ、上から着手する。

機械可読版: `growth/content/refresh-queue.json` / `growth/content/new-queue.json`
（本書はその読み物版。数値の正は JSON 側）

---

## 判定の原則: Existing Page First（§45）

新規を書く前に必ず「既に順位を持つページがあるか」を見る。
今回の調査では、**Obsidianクラスタの0クリック249 impのうち約7割が
「既存ページが順位を持っているのに答えていない」ケース**だった。

したがって当面のキューは **Refresh が主、New が従** になる。

---

## Refresh Queue（優先順）

### R1. `/blog/obsidian-voice-input` に「文字起こし」を足す

| | |
|---|---|
| 現状 | 588 imp / 64 clicks / **CTR 10.9%** / pos 5.3（サイト最強） |
| 取りこぼし | 「obsidian 文字起こし」17 imp pos7.2 / 「obsidian 音声 文字起こし」10 imp pos6.5 / 「obsidian 録音 文字起こし」10 imp pos7.8 / 「obsidian 音声」9 imp pos5.1 — **計46 imp すべて0クリック** |
| 原因 | 順位は取れているのに、記事本文が「音声入力」語で書かれ「文字起こし」語が無い |
| 施策 | 「音声入力と文字起こしの違い」＋「録音した音声をObsidianへ文字起こしする」節を追加。既存構成は壊さない |
| Impact | 中（+8〜15クリック/月） / Confidence **高** / Effort S |
| 注意 | **タイトルは触らない。** サイト最強ページを実験台にしない |

### R2. `/apple-watch/` から Obsidian導線

| | |
|---|---|
| 現状 | 954 imp / **CTR 2.1%** / pos 7.5（クラスタ最大impで最低CTR） |
| 取りこぼし | 「obsidian apple watch」24 imp / **0 clicks** / pos 6.0 |
| 仮説 | Obsidian×Watchの意図が、CTR 8.3%の `/apple-watch-obsidian/` ではなく汎用ページに着地 |
| 施策 | 本文早期にObsidian文脈の導線。**その前にクエリ×ページで着地先を確定**（3分） |
| Impact | 中 / Confidence **中**（要データ） / Effort S |

### R3. `/methods/second-brain/` に Obsidian軸

| | |
|---|---|
| 現状 | 721 imp / CTR 3.9% / pos 8.0（期待2.5%を上回る良ページ） |
| 取りこぼし | 「セカンドブレイン obsidian」**42 imp / 0 clicks** / pos 8.8 — Obsidianクラスタ単一最大の未回答 |
| 補足 | 語順違いの「obsidian セカンドブレイン」26 impは CTR 7.7%。需要は獲れる |
| 施策 | Obsidianでセカンドブレインを作る節を追加し、両語順を自然に含む |
| Impact | 中 / Confidence 高 / Effort S |

### R4. `/blog/obsidian-iphone-memo` の強化

| | |
|---|---|
| 現状 | 24 imp / CTR 4.2% / pos 9.2（弱い） |
| 取りこぼし | 「obsidian iphone」26 imp 0クリック pos11.0 / 「オブシディアン iphone」8 imp 0クリック pos9.5 / 「obsidian memo」12 imp 0クリック pos11.7 |
| 課題 | 一方で「obsidian 使い方 iphone」68 imp・「obsidian iphone 使い方」45 impは CTR 6%前後で獲れている。**着地ページが分散している疑い** |
| 施策 | クエリ×ページで着地を確認 → 統合か棲み分けを決める |
| Impact | 中 / Confidence **低**（着地不明） / Effort M |

### R5. `/voice-input/` の役割明確化

音声4LP（`/voice-input/` 167 imp・`/hands-free/` 30・`/fastest-voice-memo/` 17・
`/siri/` 20）が同じ主題を別々に主張している。`/voice-input/` は最大impで最低CTR（3.0%）。

**クエリ×ページ無しでは統廃合を判断しない**（`OBSIDIAN_URL_PLAN.md` 参照）。

---

## New Queue（優先順）

### N1. `/obsidian/compare/logseq/`

| | |
|---|---|
| 需要 | 「logseq obsidian」23 imp / 「logseqとobsidian どちらが 良い」23 imp **0クリック** pos9.2 / 「logseq obsidian 比較」14 imp / 「obsidian logseq 比較」8 imp — **計68 imp** |
| 現状 | `/vs/*` 39ページは**全てSimpleMemo軸**で、「Obsidian vs X」が1本も無い |
| 固有価値（§47必須） | 実際に両方を触った比較表 + モバイル入力の実測（Simulator検証対象） |
| Impact | 中 / Confidence 中 / Effort M |
| 注意 | 単独クエリ「logseq」は 935 imp / CTR 2.8% で既に流入あり。着地ページを確認してから |

### N2. `/obsidian/quick-capture/`

| | |
|---|---|
| 需要 | 実測ゼロ（このサイトが未対応のため）。指示書 §4 が最重要クラスタと指定 |
| 根拠 | Relevance HIGH。SimpleMemoの存在理由そのもの |
| 固有価値 | 「思いついてからObsidianに残るまで」の手数・秒数の実測比較（§90/§91） |
| Impact | 中〜高 / Confidence **低**（需要未検証） / Effort M |

### N3. `/obsidian/voice-input/`（ピラー）

`/blog/obsidian-voice-input` とのカニバリ risk が高い。
**役割分離（ピラー＝選択肢の地図 / 既存＝手順の決定版）を守れる場合のみ作る。**
守れないなら作らず R1 に集中する。→ `OBSIDIAN_URL_PLAN.md`

### N4. `/tools/obsidian-uri-generator/`

| | |
|---|---|
| 種別 | 無料ツール（§48 / §72） |
| 根拠 | サイトにインタラクティブツールが**0個**。被リンク獲得がPR TIMES単発に全面依存 |
| Impact | 中（被リンク） / Confidence 中 / Effort S（静的+JSのみ） |
| Tool→Product導線（§73） | 生成後に「毎回これを組むより、話すだけで送る」→ SimpleMemo |

---

## 作らないもの（明示）

| 対象 | 理由 |
|---|---|
| EN版の新規Obsidian記事 | EN クラスタ CTR 0.97%（JA 4.94%）。5分の1 |
| 「obsidian 解約」 | Relevance NONE。SimpleMemoと接点が無い |
| ドイツ語クエリ（unterschiede / vergleich 計26 imp） | 対象言語外。pos 31〜37 |
| Plugins / Sync / AI / Beginner クラスタ | Month 3 まで着手しない。未検証で Confidence 低 |
| Programmatic SEO | ループが1周（次スナップショット）回るまで着手しない |

---

## Quality Gate（§86）

100点満点・**80未満は公開しない**。

```
Intent               20   検索者の質問に冒頭で答えているか
Originality          20   実測・実画面・独自比較・コードのいずれかがあるか
Verification         15   SimpleMemo機能の主張が検証されているか
Completeness         15   代替手段・注意点・失敗例を含むか
Topical Fit          10   クラスタに属し Parent/Sibling が引けるか
Internal Linking     10   Parent 1本 + Sibling 1本以上
Conversion Fit       10   Relevanceに応じたCTAか（過剰でも不足でもない）
```

**追加の絶対条件**（§86）: SimpleMemoの機能を説明する記事で
Verification 未実施のものは、合計点に関わらず自動公開しない。

現時点で **Verification を満たせる記事は0本**（Simulator実行環境が無いため）。
したがって当面、SimpleMemo機能の新規説明記事は書かない。
**Refresh（既存の言い回し追加）を優先するのは、この制約とも整合する。**

---

## Editorial Calendar（§61）

固定本数を置かない。毎週、週次レポートの出力から比率を決める。

```
Refresh          : 0クリック意図が残っている限り最優先
New High-Relevance: Refresh が枯れてから
Authority        : Month 3
Tool / Data      : 月1本を上限（作りっぱなしを防ぐ）
```
