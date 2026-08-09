# Obsidian Internal Link Plan — 2026-08-09

指示書 §11〜§13。

## 現状（実測）

| | |
|---|---|
| 孤立ページ | **0**（全188ページが最低1本の文脈内部リンクを持つ） |
| 内部リンク総数 | 11,268本（すべて直接200・CIで固定） |
| 文脈内部リンクが1〜2本のページ | 19 |
| `/ai-tags/` の文脈被リンク | **1本**（トップページのみ） |

**構造は健全である。** 指示書 §13 が想定する「無差別リンク」の問題も無い。
足りないのは本数ではなく **関係の型** で、これが §11 の Parent/Sibling/Child にあたる。

---

## 最大の課題: メタデータ層が存在しない

指示書 §12 は frontmatter を前提にしているが、**本サイトは frontmatter を持たない**。
ビルドなしの静的HTMLで、Markdownソースも存在しない。

したがって §12 をそのまま実装することはできない。選択肢は3つ:

| 案 | 内容 | 評価 |
|---|---|---|
| A. HTMLに `data-*` 属性 | `<body data-cluster="voice" data-intent="how-to">` | HTML240ファイルの一括編集。CTA属性で実績あり |
| B. HTMLコメント | `<!-- seo: {...} -->` | パースが脆い。CIで守りにくい |
| C. **別JSON** | `data/content-graph.json` にURLキーで集約 | **推奨** |

### C を推す理由

- **既存文化と一致する。** `data/site-constants.json` が同じ形（単一JSON＋
  `sync_constants.js` がCIで整合を強制）で既に機能している
- **240ファイルを触らずに済む。** メタデータの追加・修正が1ファイルで完結し、
  差分レビューが可能。A案はメタデータを1つ直すたびに巨大diffになる
- **`growth/` から直接読める。** 週次レポートのクラスタ別集計
  （指示書 §64 の Voice/Watch/AirPods/Quick Capture セクション）が
  HTMLをパースせずに書ける
- **CIで守れる。** 「JSONに載っているURLが実在するか」「実在ページが
  JSONに載っているか」を双方向で検証できる

### スキーマ案

```json
{
  "/blog/obsidian-voice-input": {
    "cluster": "obsidian-voice",
    "intent": "how-to",
    "funnel": "workflow-aware",
    "productRelevance": "high",
    "parent": "/obsidian/voice-input/",
    "siblings": ["/blog/obsidian-iphone-memo", "/apple-watch-obsidian/"],
    "nextStep": "/siri/",
    "verified": null,
    "testedSimpleMemoVersion": null,
    "screenshotVersion": null
  }
}
```

`verified` / `testedSimpleMemoVersion` / `screenshotVersion` は
指示書 §79 / §108 / §109 用。**今は null で置き、Simulator基盤が動いてから埋める。**
先にフィールドだけ用意しておくと、後から全ページに追記する手間が消える。

---

## リンク関係のモデル（§11）

各ページが持つべき関係:

```
Parent       クラスタのピラーへ1本（必須）
Sibling      同クラスタの隣接ページへ1〜3本
Child        ピラーからのみ。全子記事へ
Next Step    読了後の自然な次の行動（ファネルを1段進める）
```

**Next Step が最も重要**で、かつ現在最も欠けている。
例: `/blog/obsidian-voice-input`（音声入力の方法を知った）を読み終えた人の
次の疑問は「iPhoneを触らずにやりたい」であり、`/siri/` や
`/apple-watch-obsidian/` へ送るべきだが、その導線が設計されていない。

---

## 今すぐ効く配線（データ根拠あり）

### 1. `/apple-watch/` → `/apple-watch-obsidian/`（最優先）

```
/apple-watch/           954 imp / CTR 2.1% / pos 7.5
/apple-watch-obsidian/   36 imp / CTR 8.3% / pos 6.1
クエリ「obsidian apple watch」24 imp / 0 clicks / pos 6.0
```

Obsidian×Watch の意図が汎用ページに着地している疑いが強い。
`/apple-watch/` 本文の早い位置に Obsidian 文脈のリンクを置く。

**ただし確定にはクエリ×ページのエクスポートが要る。** 3分の作業で
「どちらのページが 24 imp を受けているか」が判明する。
仮説のまま大きく動かさない。

### 2. `/blog/obsidian-voice-input` → `/siri/` / `/apple-watch-obsidian/`

サイト最強ページ（64クリック）から、CTRは高いが母数の小さい2ページへ送る。
**サイト内で最も価値のある送客経路**で、現在ほぼ使われていない。

### 3. `/ai-tags/` の被リンクを1本→3本以上へ

Cluster C（AIメモ）のピラー候補が、トップページからの1本だけで支えられている。
`/blog/obsidian-voice-input`（音声→AIタグ付けの流れが自然）と
`/obsidian/` から配線する。

### 4. `/methods/second-brain/` ↔ `/obsidian/`

「セカンドブレイン obsidian」42 imp が0クリック。
`/methods/second-brain/`（721 imp / CTR 3.9%）はメール軸で書かれており、
Obsidian軸の節と相互リンクが要る。

---

## Internal Link Engine（§13）

`scripts/add-internal-links.js` が既に存在するが、
**ルールがハードコードされている**（「blog → guides/vs/methods」等の固定表）。
クラスタを増やすたびにコードを書き換えることになる。

`data/content-graph.json` 導入後は、エンジンをこう変える:

```
入力: 対象URL
 ↓
content-graph.json から cluster / intent / funnel を引く
 ↓
同 cluster の Parent / Sibling を候補化
 ↓
既存リンクと重複するものを除外
 ↓
本文中に自然な挿入位置があるか判定（既存の「関連記事」ブロック優先）
 ↓
提案を出力（--write で適用）
```

**無差別リンク禁止（§13）を機械的に守る仕組み**として、
「同クラスタ内 or 明示的 nextStep のみ」を許可条件にする。
クラスタをまたぐリンクは JSON に明示された関係だけ通す。

---

## CIゲート案

`content-graph.json` を入れるなら、同時に検証も入れる。
入れないと、既存のSEOレポート群と同じ「更新されない記録」になる。

```
1. JSON上のURLが実在するか（404を指していないか）
2. 実在するJAページがJSONに載っているか（載り忘れ検出）
3. parent に指定されたURLが実在し、かつ自分自身でないか
4. cluster 値が growth/lib/gsc.mjs の BUSINESS_RELEVANCE と矛盾しないか
```

4が地味に効く。クラスタを足したのに `BUSINESS_RELEVANCE` へ登録し忘れると、
**週次レポートの「Paid-relevant opportunities」に新クラスタが出てこない**——
気づきにくく、気づいたときには数週間分の判断を取り逃している。

---

## 実行順

1. `data/content-graph.json` を Obsidianクラスタ16ページ分だけで開始
   （全188ページを一度に埋めない。使われる保証が無いものを先に作らない）
2. 上記「今すぐ効く配線」4件を手で入れて効果を測る
3. 効いたら `add-internal-links.js` をJSON駆動へ書き換える
4. CIゲート追加
5. 対象を全ページへ拡大

**2で効果が確認できなければ3以降はやらない。** 内部リンクは
既に健全（孤立0）なので、エンジンを作ること自体が目的化しやすい。
