# ct= が空だった理由は配線ではなく、**トークンが細かすぎたこと**

`simplememofast/simplememo-ios#243` で「ASC の Campaign 列は 5,018 Counts すべて空欄」と
記録し、**原因は確定していない**と書いた。確かめたので、その記録。

---

## 1. Apple の一次情報に、閾値が2つ書いてある

[App Store Connect Help / Campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links/) より（原文ママ）:

> Campaigns appear in Analytics only after a minimum of 24 hours since their launch.
> Metrics that reach a minimum threshold of 5 will be visible in the dashboard.

> Data for a particular campaign will appear in the dashboard once it has generated
> **first-time downloads from at least five individual users.**

そして長さの制限:

> You can use up to **30** alphanumeric characters and spaces, and the following
> punctuation marks and characters: `[ ] / \ - ~ + = <> : ; , . _ ' " * & $ % # @ ? ! | { } ( )`

## 2. 数えると、閾値を越えられる設計になっていない

**実測（`data/asc/` の App Downloads Standard）:**

    2026-08-24..25 (2日)  初回DL 9件  → 4.5/日
    2026-08-25..26 (2日)  初回DL 10件 → 5.0/日

**サイト側のトークン数: 670**（`grep -roh 'ct=[^&"]*' --include=*.html | sort -u`）

初回DLは月におよそ **150件**。1キャンペーンが見えるには **5件**要る。
つまり **月に閾値を越えられるのは、全部が理想的に1点へ集中しても最大30トークン。**
**670 個あるので、少なくとも 95% は構造的に永久に現れない。**

さらに実際の初回DLの大半は App Store 検索経由（Source Type: App Store search 138 対
Web referrer 12。ただしこの内訳は更新を含む全ダウンロードのもので、
**初回DLだけの内訳は取れていない**ので、web経由の初回DL数は推定していない）。
どちらにせよ現実の天井は 30 よりずっと低い。

**これは配線の不具合ではない。**トークン設計が、このアプリのインストール規模に対して
2桁ほど細かすぎる。**「パイプラインを作れば出る」でも「ct= が壊れている」でもなく、
出るはずのない粒度で出そうとしていた。**

## 3. ついでに、長さの上限も破っていた

`scripts/tag-cta-placements.js` のコメントはこう書いていた:

> Apple's campaign-token length ceiling is **not something this repo can verify
> from here**, so the check is conservative and explicit rather than trusting a
> remembered number: **40** chars

**確かめられた。30 である。**推測値 40 は上限を10文字ぶん見逃していた。

実測すると **670 トークン中 182（27.2%）が 30 文字超**、最長 42 文字
（`blog-fastest-memo-app-benchmark-jp__bottom`）。

超過したときに Apple が切り詰めるのか捨てるのかは**書かれていない。**
確かめていないので、ここでは「上限を超えている」以上のことを書かない。

## 4. 直したもの / 直していないもの

**直した:** `CT_MAX` を 40 → 30。一次情報の引用をコメントに入れた。
**ファイルは1つも変わらない** —— 置換は既に `__placement` を持つトークンには
何もしない（冪等）ので、効くのはこれから生成される分だけ。

**直していない:** 既に出荷済みの 182 トークン。直すと ASC 側の集計単位が変わり、
それまでの履歴と繋がらない。代わりに `--check` が**報告のみ**で数を出すようにした
（`check-benchmark.mjs` と同じ扱い）。**見えていない状態にはしない。**

## 5. これで #243 の「次に何をすれば決まるか」が1つ片づいた

| 当時の問い | 今の答え |
|---|---|
| Campaign が空である理由 | **粒度。**閾値5に対しトークン670、初回DL 5/日 |
| ct= は直せるのか | **直せる。**トークンを粗くすればよい。別経路は要らない |
| ct= 以外の経路を設計するか | **不要。**設計する前に、トークンを減らすほうが先 |

## 6. 決めていない —— どこまで粗くするか

閾値5を月内で越えられる本数が上限なので、**現実的には数本**しか置けない。
候補（粗い順）:

    言語のみ                    2本   jp / en
    言語 × 配置                 8本   jp__hero / jp__mid / …
    クラスタ × 言語            20-30本  obsidian-jp / free-memo-jp / captio-jp / …

**どれを選ぶかは「何を知りたいか」で決まるので、こちらでは決めない。**
ただし選ぶときに効く事実を2つ置いておく:

- **ページ単位の粒度は GA4 側に残る。**`data-cta-placement / cluster / variant` は
  長さ制限が無く、クリックまでは今のまま測れる。ct= が要るのは**インストールと課金**だけ
- **トークンを変えると履歴が切れる。**`tag-cta-placements.js` の既存コメントが
  「一度きりの回復可能なコスト」と書いているとおりで、変えるなら一度でまとめて変えるのが安い

---

# 追記 2026-08-28 — 畳んだ

上の §6 で「どこまで粗くするかは決めていない」と書いた分の実装記録。
**`{言語}__{配置}` の8トークン**にした。

    670 → 8

    446  jp__nav      102  en__bottom
    122  jp__mid       87  en__mid
     86  jp__bottom    73  en__nav
     22  jp__hero      25  en__hero

最長10文字（Apple の上限30に対して十分）。**30文字超のトークンは0件になった**
（畳む前は182種類・最長42文字）。

## 副次的に、取り残されていた266件のCTAに配置が付いた

畳む前は `{ページ}-{言語}__{配置}` が上限を超えるページで、
**スクリプトが配置の付与を諦めてページ単位トークンのまま残していた**（266 CTA）。
base が消えて長さの制約が無くなったので、**全963 CTAが配置を持つ**ようになった。

    畳む前: OK: every App Store CTA carries placement/... (266 keep page-level ct=)
    畳んだ後: OK: every App Store CTA carries placement/... (0 keep page-level ct=)

## 途中で、既に一度直されていた欠陥を踏み直した

`--write` が**毎回1件だけラベルを変え、`--check` と永久に食い違った**。
`vs/line-keep-memo/` の CTA が1つ、mid ↔ bottom で振動していた。

原因はスクリプト自身のコメントに既に書いてある:

> Measuring the live document is not idempotent: adding data-cta-* makes the HTML
> longer, which shifts every later anchor's byte offset, which moves its position
> fraction. … **Normalising first** means the same page always yields the same placements

**正規化が `data-cta-*` だけで、ct= を含んでいなかった。**
トークンの長さが 25文字→7文字 と変われば、同じことが起きる。
`stripCtaAttrs` が ct= の中身も固定長へ潰すようにした。
**以後どんなトークン設計へ変えても位置は動かない。**

## 走っている実験2件に触れた（どちらも評価日 2026-09-13）

**`cta-2026-08-10-strongest-page-inline`** — target_metric が
`ct=blog-obsidian-voice-input-jp__mid` を名指ししていた。
**測定は失われていない** —— GA4 は `page_path` と `data-cta-placement` を
ct= とは別の列で記録しているので、
`page_path=/blog/obsidian-voice-input AND placement=mid` で同じ系列が読める。
**フィルタする列が変わっただけ。**target_metric を書き換え、
9/13 の読み方を注記した。

**`cta-2026-08-10-desktop-qr`** — こちらは**現状のままでは評価できない**ことが分かった。
target_metric が名指しする `__qr` トークンは**サイトに1つも存在しない**（実測0件）で、
仮に有っても閾値5に届かない。この実験のノート自身が
「**NOT MEASURABLE IN GA4** … The only readout is App Store Connect campaign data」
と書いており、**その唯一の読み口が塞がっている。**
決定は書いていない（評価日は 9/13、判断は持ち主のもの）が、
**待っても出ない**ことは今分かっている。

## 直していないもの

**トークンの言語とページのロケールの食い違い 210件**
（root(JA) に別言語 179 / `/en/` に別言語 31）。
dual-DOM の言語別CTAで説明が付く部分もあるが**確かめていない。**
ここで直すと粒度の変更と言語の付け替えが同じ変更に混ざるので、
**言語は今の値を保った。**`--check` が報告のみで数える。
