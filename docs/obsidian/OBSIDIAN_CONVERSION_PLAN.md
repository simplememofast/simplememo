# Obsidian Conversion Plan — 2026-08-09

指示書 §39〜§42 / §66〜§68 / §95〜§98。

## 現状（2026-08-09 実装済み）

CTA計測は今日すでに入った。**新しい計測基盤は作らない。**

```
data-cta-placement   nav / hero / mid / bottom / reference
data-cta-cluster     obsidian / voice / watch / captio / line-keep / ai / vs / …
data-cta-variant     v1
ct=<page>__<placement>   → App Store Connect（インストールまで追える唯一の経路）
GA4: app_store_click / seo_cta_click / seo_cta_impression
```

指示書 §41 が要求する `page / placement / variant / cluster` は充足済み。
§42 の Apple campaign token 連携も入っている。

---

## 実測で判明した構造的問題

CTA配置の内訳（912本を機械分類）:

```
nav        469
bottom     261
mid        101
hero        44
reference   37
```

**hero がわずか44本、bottom が261本。** つまり**大半のページは、
読み切った人にしかCTAを見せていない**。

これは指示書 §39 の「Relevance別にCTAを出し分ける」以前の問題である。
HIGH relevance ページでも、読者の大半はCTAに到達する前に離脱している可能性が高い。

**ただし現時点では仮説にすぎない。** `seo_cta_impression` を今日入れたので、
次サイクルには「何人がCTAを見たか」の実数が出る。
**それを見てから配置を動かす。** 今動かすと、入れたばかりの計測の初期値を
自分で汚すことになる。

---

## Relevance別CTA設計（§39 / §40）

`growth/lib/gsc.mjs` の `BUSINESS_RELEVANCE` と一致させる。

### HIGH — CTA強め（hero + bottom の2箇所）

対象: `/obsidian/` `/blog/obsidian-*` `/siri/` `/voice-input/` `/hands-free/`
`/fastest-voice-memo/` `/apple-watch-obsidian/` `/ai-tags/`

意図別コピー（§40）:

| 文脈 | コピー方針 |
|---|---|
| Obsidian 音声入力 | Obsidianへの入力をもっと速くしたいなら |
| Apple Watch | Apple Watchから思いつきをすぐObsidianへ送りたいなら |
| AirPods / Siri | AirPodsから手を使わずにObsidianへメモしたいなら |
| クイックキャプチャ | 思いついた瞬間にObsidianへ残したいなら |

**現状は全ページほぼ同一コピー**（JAページの65%がApp Storeリンクちょうど4本）。
意図別への置換は**新規ページを作らずにCVRを動かせる数少ない施策**である。

### MEDIUM — Inline CTA 1箇所

対象: `/vs/*` `/use-cases/*` `/guides/*` `/methods/*` `/apple-watch/`（汎用）

本文の文脈に沿った1文＋リンク。バッジの多重掲出はしない。

### LOW — 記事末のみ、または無し

対象: `/glossary/*` `/devlog/*` `/blog/line-keep-*`

**line-keep クラスタは Relevance 0.3。** 5,291 impを持つが読者は
「LINEの機能の現在地」を知りたい層で、メモアプリ乗り換え意欲は薄い。
ここに強いCTAを置いても転換せず、ページの信頼だけ削る。

---

## 公平性（§68）

比較記事では **SimpleMemoが向かないケースを書く**。既に実践されている:

- `/blog/line-keep-alternative`「画像メモには対応していません」→ Apple Notes / Google Keep を推奨
- `/en/vs/google-keep-vs-apple-notes/`「Apple製品だけなら Apple Notes」と先に断言

この姿勢は維持する。§67 の通り「SimpleMemoならこうできる」と明示するのは
問題ないが、**比較の結論を歪めない**。

---

## Custom Product Page 連携（§96）

Apple側で CPP を作れるなら、SEO記事の意図別に送り分けられる:

```
/obsidian/*        → Obsidian連携訴求のCPP
/apple-watch*      → Apple Watch訴求のCPP
/siri/             → AirPods/Siri訴求のCPP
```

`ct=` は既にページ×配置で分かれているため、**CPP側のIDを足すだけで接続できる**。

ただし **CPPの作成はオーナー作業**（App Store Connect）で、
本セッションからは `apps.apple.com` 自体に到達できない。優先度は Month 2 以降。

---

## SEO / ASO 連携（§97 / §98）

GSCで実測された語のうち、ASOキーワード候補として価値が高いもの:

| GSC語 | imp | CTR | ASO候補として |
|---|---:|---:|---|
| obsidian 音声入力 | 130 | **18.5%** | 最有力。CTRが需要の濃さを示す |
| obsidian 音声入力 iphone | 29 | 17.2% | 同上 |
| obsidian apple watch | 24 | 0% | 順位はあるので需要は実在 |
| セカンドブレイン | 42+26 | — | 語としての認知あり |

逆方向（App Store search terms → SEO）は、
**App Store Connect のデータが必要**でオーナー作業。

現在のアプリ名「Obsidian連携シンプルメモ - 最速の音声入力搭載」は
既に「Obsidian」「音声入力」を含んでおり、GSCの勝ち筋と一致している。
**ASO側は既に正しい方向を向いている。**

---

## 測定できるようになったこと / まだできないこと

| | 状態 |
|---|---|
| どのページがApp Store遷移を生んだか | ✅ `ct=` + GA4 |
| どの**配置**が遷移を生んだか | ✅ 2026-08-09から |
| CTAを何人が**見た**か | ✅ 2026-08-09から（次サイクルで初データ） |
| クラスタ別の遷移 | ✅ `data-cta-cluster` |
| インストール数への接続 | ⚠️ App Store Connect側の手動突合が必要 |
| Activation / Paid への接続 | ❌ **未接続**。プロダクト分析基盤が無い |

最後の行が最大の欠落である。指示書 §0 の North Star は Paid だが、
**現在サイト側から追えるのは App Store 遷移まで**。
その先（Install → Activation → Paid）は App Store Connect の集計値としてしか見えず、
「どのSEO記事の読者が課金したか」は誰にも分からない。

これは記事やCTAの改善では埋まらない。`ct=` によるキャンペーン別の
インストール・課金の集計が App Store Connect で取れるなら、
`growth/data/appstore/` に取り込むのが次の一手になる
（ディレクトリは作成済み・中身は空）。
