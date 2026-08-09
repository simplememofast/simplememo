# Obsidian URL Plan — 2026-08-09

指示書 §8 / §112。**結論を先に書く。**

# 既存URLは1本も動かさない

指示書 §8 は `/obsidian/voice-input/` のような階層を提案しているが、
**本サイトでは移行しないほうがよい**。理由は3つある。

1. **移行対象がサイト最強の資産である。**
   `/blog/obsidian-voice-input` は 588 imp / 64 clicks / CTR 10.9% / pos 5.3 で、
   Obsidianクラスタのクリックの **45%** を1本で稼いでいる。
   301はリンク評価を引き継ぐが、順位の一時的な揺れは避けられない。
   **サイト最大の勝ち筋を、構造の美しさのために賭ける理由が無い。**

2. **URL正規化が既に精密に組まれている。** `functions/_middleware.js` は
   `//` 畳み込み → `.html` 剥がし → `?lang=` 剥がし → 退役パス解決を
   **1ホップの301**にまとめ、`scripts/check-url-normalization.mjs` の
   175アサーションで固定されている。ここに新たな移行を足すと、
   GSCの「ページにリダイレクトがあります」バケット（08-08時点で88件）を
   再び増やす。前回の対応で減らしたばかりである。

3. **指示書自身が §8 で「既存の /blog/... が既に強い場合は無理に移行しない。
   301リスクを避ける」と書いている。** ここはまさにその場合にあたる。

**新規ページのみ階層URLを使う。** 既存と新規でURL流儀が混在するが、
それは移行リスクより安い。Googleは階層の一貫性を順位要因にしていない。

---

## 新規URL設計（新しく作るものだけ）

```
/obsidian/                      既存ハブ（中身を作り替える・URLは維持）
/obsidian/voice-input/          新規 — 音声入力ピラー
/obsidian/quick-capture/        新規 — クイックキャプチャ ピラー
/obsidian/compare/              新規 — 「Obsidian vs X」ハブ
/obsidian/compare/logseq/       新規 — 68 imp の受け皿
/obsidian/second-brain/         新規 — 42 imp の0クリック回収
```

**`/obsidian/voice-input/` と既存 `/blog/obsidian-voice-input` の関係**が
この設計の要注意点。同じ主題で2URLはカニバリを作る。役割を分ける:

| URL | 役割 | 扱うIntent |
|---|---|---|
| `/blog/obsidian-voice-input`（既存・強い） | **手順の決定版**。4つの方法の実比較 | How-to「どうやる」 |
| `/obsidian/voice-input/`（新規ピラー） | **クラスタの入口**。定義・選択肢の地図・子記事への分岐 | Informational「何ができる」 |

ピラーは手順を書かない。書くと既存記事と正面衝突する。
**ピラーの本文は「どれを選ぶか」の判断材料に限定し、手順は既存記事へ送る。**

この分離が守れないなら、**ピラーを作らず既存記事を強化するほうがよい**。
カニバリで両方沈むより、1本が pos 5.3 を維持するほうが価値が高い。

---

## Existing URL Mapping（§112）

Obsidianクラスタの既存16ページ + 関連EN。判定は実測に基づく。

### Keep（触らない）

| URL | 実測 | 理由 |
|---|---|---|
| `/blog/obsidian-voice-input` | 588 imp / CTR 10.9% / pos 5.3 | サイト最強。**URLも本文構成も変えない**（§Refreshでセクション追加のみ） |
| `/fastest-voice-memo/` | 17 imp / CTR 17.6% | 母数は小さいがCTR最高帯 |
| `/siri/` | 20 imp / CTR 10.0% | 公開直後（08-05）。評価はまだ |
| `/apple-watch-obsidian/` | 36 imp / CTR 8.3% / pos 6.1 | 特化ページとして機能している |

### Refresh（本文を足す・URLは維持）

| URL | 実測 | 何を足すか |
|---|---|---|
| `/blog/obsidian-voice-input` | 588 / 10.9% | **「文字起こし」セクション**。4クエリ計46 impがpos5〜8で0クリック |
| `/obsidian/` | 827 / 4.5% / pos 8.0 | ハブとして作り替え（現状は製品ページ寄り）。§Hub設計 |
| `/apple-watch/` | 954 / **2.1%** / pos 7.5 | 最大imp・最低CTR。Obsidian文脈の導線を追加し `/apple-watch-obsidian/` へ送る |
| `/methods/second-brain/` | 721 / 3.9% | Obsidian軸の節を追加（「セカンドブレイン obsidian」42 imp対応） |
| `/blog/obsidian-iphone-memo` | 24 / 4.2% | 「obsidian iphone」26 imp 0クリックの受け皿として強化 |
| `/voice-input/` | 167 / 3.0% | 役割の明確化（音声4LPの整理・後述） |

### Merge 候補（要判断・今回は実行しない）

音声系4LPが同じ主題を別々に主張している:

```
/voice-input/          167 imp / CTR 3.0% / pos 7.5
/hands-free/            30 imp / CTR 3.3% / pos 5.5
/fastest-voice-memo/    17 imp / CTR 17.6% / pos 6.2
/siri/                  20 imp / CTR 10.0% / pos 6.9
```

`/voice-input/` が最大impだがCTRは最低。統廃合の判断には
**クエリ×ページのエクスポートが要る**（どのLPがどの語で出ているか不明なため）。
`growth/GSC_OWNER_ACTION.md` 手順3・3分。

**データが無いままマージしない。** 指示書 §112「削除は慎重に」に従う。

### 拡張しない（EN）

| URL | 実測 | 判定 |
|---|---|---|
| `/en/obsidian/` | 132 imp / **0 clicks** / pos 14.1 | 維持のみ |
| `/en/blog/obsidian-voice-input` | 195 / 2.1% / pos 10.5 | 維持のみ |
| `/en/blog/obsidian-iphone-memo` | 198 / 1.0% / pos 14.4 | 維持のみ |
| `/en/apple-watch/` | 158 / 0.6% / pos 9.0 | 維持のみ |
| `/en/apple-watch-obsidian/` | 72 / 1.4% / pos 6.4 | 維持のみ |

EN全体で 1,343 imp / 13 clicks / CTR 0.97%。JA（4.94%）の5分の1。
**新規EN記事は作らない。** hreflangクラスタは現状のまま保つ。

### Delete

**なし。** 削除に足る根拠を持つページが1つも無い。

---

## `/obsidian/` ハブの作り替え

現状の `/obsidian/` は 827 imp / CTR 4.5% / pos 8.0 で、
タイトルは「Obsidianに最速でメモを送る方法 — iPhoneから自動追記（プラグイン不要）」
＝**製品ページ**である。Obsidianを調べに来た人の入口にはなっていない。

ただし **このページには未解決のCTR問題がある**
（リタイトル後 7.30% → 4.47%、実験 `title-2026-07-02-011`、監視中
`monitor-2026-08-09-obsidian-ctr` / 評価日 2026-09-13）。

**したがってハブ化は 2026-09-13 の監視結果を見てから着手する。**
今ここを作り替えると、進行中の監視が読めなくなる。

それまでは `/obsidian/` を触らず、**新規ピラー（`/obsidian/voice-input/` 等）を
先に作って内部リンクで束ねる**。ハブの体裁は後から整えられる。

---

## URL命名規則（新規のみ）

```
小文字・ハイフン区切り・末尾スラッシュあり（ディレクトリ形式）
日本語スラッグは使わない
/obsidian/<cluster>/            ピラー
/obsidian/<cluster>/<topic>/    子記事
/obsidian/compare/<competitor>/ 比較
/tools/<tool-name>/             無料ツール
```

**末尾スラッシュは必須**。本サイトはディレクトリページを
`/vs/capacities/` のようにスラッシュ付きで正規化しており
（フラットな `.html` ページのみスラッシュ無し）、
`growth/lib/gsc.mjs` の `toPath()` もその2形式を前提に実ページ台帳へ照合している。
新規で流儀を混ぜると、GSCデータとページ在庫の結合が静かに失敗する。
