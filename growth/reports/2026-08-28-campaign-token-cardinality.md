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
