# 日本語トップ（/index.html）の注記

`index.html` の HTML コメントと `<style data-home-design>` の CSS コメントは、
2026-11-13 の v3c でここへ移した。トップの HTML は gzip で 43,410B を超えると
Lighthouse の模擬環境で3往復目に入り、FCP と LCP が約150ms 遅れる
（`scripts/perf/verify_home.py` が予算を検査する）。注記は読み手には届かないので、
ページの外に置く。

生成器が読むコメントだけは `index.html` に残している。消すと生成器が壊れる。

- `<!-- home-perf preload -->` 〜 `<!-- /home-perf preload -->`（`scripts/perf/build_home.py`）
- `<!-- style preload -->` 〜 `<!-- /style preload -->`（site-chrome.css と App Store バッジの preload を囲む。リポジトリの生成器は読まないが、差し替えの目印として残す）
- `<!-- i18n: managed by scripts/normalize_i18n_head.py -->`
- `<!-- site-chrome:bootstrap -->`、`quick`、`intro` の開閉（`scripts/sync_shared_chrome.py`）
- `<!-- One named next step … -->`（`scripts/add-next-step.py`）

## どこを直しても必要なこと

- **`index.html` を直したら `build_home.py --write` を回す。** `style.min.css` と
  `site-design.css` は、このページで使うクラスと id だけに絞ってインラインにしてある。
  ページの文字やクラスが変わると絞り方が変わり、`verify_home.py` が「Stale inline …」で落ちる。
  `js/site-chrome.js`・`js/app-store-tracking.js`・`js/home-film.js` を変えたときも同じ。
  フォントの検査があるので、専用の venv の Python で回す。
- **JSON-LD に HTML の実体参照を書かない。** `<script type="application/ld+json">` の中は
  HTML として解釈されないので、`&nbsp;` はそのまま検索エンジンへ渡る（v3b で一度出た）。
  本文の改行止めの `&nbsp;` は、図解動画ブロック・script・属性には入れない。
  FAQ の答えの改行止めは U+00A0 を使う。
- 共有の CSS は `html` に `scroll-behavior:smooth` を指定している。このページは
  `html{scroll-behavior:auto}` で打ち消す。下の節は遅延描画で、600px の仮の高さに対して
  滑らかに動くと、Tab で移ったフォーカスが画面外（1,300〜4,000px 手前）で止まっていた。
  ページ内リンクは、近い目標だけ滑らかに動かし、遠い目標へは跳ぶ（末尾のスクリプト）。

## ヒーロー（`.hero--photo`）

- 構造は `scripts/perf/build_home.py` が持つ。**picture → shade → footer の順に依存している。**
  PageSpeed のブラウザ検査は `.hero a[href*="apps.apple.com"]` と
  `.hero__photograph img` を読む。
- 見出しの語は **clip-path で出し、opacity は使わない。** 半透明の途中で監査が色を測ると、
  コントラスト不足と判定される（A11y が 96 に落ちた）。
- 1024px 以上では、ヒーローが初画面で終わるように縦の寸法を `svh` で詰めてある
  （1366×768・1280×800・1024×768 で 136〜177px はみ出し、QR とメモカードが隠れていた）。
  写真は左から出し、AirPods が写るようにしている。

## 使い方（`#how`）

- 文言は、アプリが初回起動で出すものと同じにする（マイクの許可、届け先の確認）。
  最初の1分に驚きがないように。
- 端末の枠（ベゼル）は `<img>` ではなく包む要素に付ける。`<img>` の border は、
  遅延画像の読み込み前に箱を 23px 高くする（縦横比が border を含む箱に当たるため）。
- 画面画像は AVIF（540w・640w）を優先し、WebP に落ちる。

## 口コミ（`#reviews`）

- App Store の実際の口コミを、原文のまま、出典つきで、全体の評価と一緒に置く。
  「使い方」のすぐ後に置き、機能の説明より先に証拠を見せる。
- 900px 未満は横にスクロールする1列。次のカードが少し見える。各カードの出典リンクに
  フォーカスが入ると、末尾のスクリプトがそのカードを帯の中へ送る。
  帯に `position:relative` を付けて、視覚的に隠した `.hp-sr` を帯の中に収める。
- 紙の節。枠付きの箱は置かず、カードは紙片＋影。利用者の言葉だけ明朝体で、運営の言葉はゴシック。
- **遅延描画の仮の高さは、実寸以上にする。** Lighthouse の axe は描画を飛ばした中身を
  実寸で並べるので、仮の高さが低いと紙のカードが次の暗い節に重なり、
  その文字がコントラスト不足と判定される。実寸は 900px 未満で最大 1,219px、
  900px 以上で 1,039px（2026-11-13）。仮の高さは 1,250px と 1,060px。

## 入口（`#anywhere`）

- VISION §3.2（画面を見ずに残す）。条件は主張のすぐ隣に書く。
- Siri の合言葉は、ヒーローのメモと同じ紙の吹き出しで見せる（話した言葉がそのまま書かれる）。

## 届け先（`#destinations`）

- VISION §1・§9。Obsidian・メール・Notion は競合ではなく、メモの届け先として書く。

## 図解動画（`#capture-film`）

- `scripts/build_home_film.py` が作る、音声なしの図解動画。
- 文言・構造・資産・VideoObject は `scripts/check_home_film.py` が台帳と照合する
  （`data/benchmark.json` と `assets/video/capture-home.json`）。

## 詳細・向き不向き（`#details`・`#fit`）

- インストール前に、できないことも書いて期待をそろえる。
- VISION §8：アプリに整理の画面はない。

## 料金（`#pricing`）

- 値は `data/site-constants.json` から `scripts/sync_constants.js` が入れる。
  **¥500/月 と ¥5,000/年 は、料金の区域の中で1つのテキストのまま置く。**
  sync_constants が書き換えるのはこの2つだけなので、派生した金額（月あたりなど）は書かない。
- `browser_checks.cjs` が `.pricing-card` が3つあることを確かめる。
- 共有 CSS はプレミアムのカードに暖色の光を付ける。この配色では染みに見えるので、
  `::after` を消している。

## 締め（`#get`）と入れたあと（`#start`）

- `#start` には、入れたあとの人（「今はしない」を選んだ人や Smart App Banner から来た人）が着地する。
- ヒーローの「使い始めた方へ」から来た人には、`#start` が画面にある間、
  下部のバーと追従 QR を出さない。
- 地色は黒のまま（2026-11-12 のオーナー判断）。紙やクリームの地にしない。

## FAQ（`#faq`）

- head の FAQPage JSON-LD と同じ文にする（`scripts/inject_faq_schema.py --check`）。
  `FAQ_DETAILS_RE` が details の書き方をそのまま読むので、マークアップの形を変えない。

## 物語・運営（`#story`・`#ops`）

- 物語は AI 検索に引用される平易な定義を兼ねる。Captio は代替・着想としてだけ書く。
- 運営の節の率と件数は、2026-09-03 のプレスリリースと同じ数字と境界で、
  `data/automation-coverage.json` と `data/autopilot-runs.json` に対して
  `scripts/check-autopilot-page.mjs` が照合する。

## 下部バーと追従 QR

- 下部のインストールバー（767px 以下）と、デスクトップの追従 QR は、
  ページ内のバッジや QR が画面にない間だけ出る。隠れているバーにはフォーカスが入らない。
- 1024px 以上では QR カード（右端から 16px、幅 108px）が右下に追従する。ヒーローより後の節と
  図解動画は右に 140px のレールを空け、本文とカードの間を 16px 取っている。
  行末の全角の閉じ括弧は、空白の半分が箱の外へはみ出して測られる（text-spacing-trim）ので、
  間を 8px にすると 1366px で括弧がカードの下に入った。フッターが見える間も隠す。
- ヘッダーなどの不透明な面には、背景のぼかしを付けない。

## 次の一歩（`aside.next-step`）

- `scripts/add-next-step.py` が生成する。1ページに行き先は1つだけ。
