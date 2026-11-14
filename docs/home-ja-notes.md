# 日本語トップ（/index.html）の注記

## 現行：2026-11-14 の editorial デザイン

日本語トップは `body.sm-editorial`、`assets/css/home-editorial.css` の構成へ変更した。
以下の2026-11-13版の記録は旧デザインの履歴であり、現行の編集手順には使わない。
英語トップの生成と表示は従来のまま。

- 女性の画像は既存の生成画像を再利用し、「写真はイメージです」を表示する。顔の範囲を
  デスクトップとスマートフォン幅で確認する。写真に本文やボタンを重ねない。
- ページ表示用のJavaScript、外部Webフォント、動画は追加しない。FAQと言語選択はnative details。
- canonical、hreflang、FAQを含むJSON-LD、GA4・Ahrefs、App Store計測と既存のアプリIDを保持する。
  料金と評価の根拠は既存台帳。運営情報の過去比較と採点条件は公開台帳の折りたたみに残す。
- 日本語記事 `blog/obsidian-voice-input.html` は同じ基礎CSSと `article-editorial.css` を使う。
  8言語の記事は既存translation catalogから生成する。見出し・導線の変更後は翻訳も同期する。
- CSS変更後は `node scripts/check-css-version.mjs --write`。ホーム変更後は専用のhash固定venvで
  `python scripts/perf/build_home.py --write`、続いて `--check` と `test_editorial_home.py` を実行する。
  共通ナビ、デザイン、CTA、CPP、sitewide app routesの生成結果も同じコミットへ含める。
- 新プロファイルは外部CSSのhash、画像source/preload、顔の切り抜き、CTAの遮蔽、FAQ操作を検査する。
  旧動画の台帳・asset integrity検査は残すが、日本語トップには非表示動画やVideoObjectを残さない。
- 現行デザインは通常表示でsectionを遅延描画しない。Section Renderingのcontrolも同一で、
  deferralの効果比較は対象外と記録する。本文の表示、fragment、focus、printの実測は続ける。
- 公開後は実HTMLと版付きCSS URLの実体を照合する。CI成功は実機インストール完了の証明ではない。
  集客・継続利用・LTVの変化は未測定であり、デザインの効果として断定しない。

## 旧デザインの記録（2026-11-13〜14）

`index.html` の HTML コメントと `<style data-home-design>` の CSS コメントは、
2026-11-13 の v3c でここへ移した。トップの HTML は gzip で 43,410B を超えると
Lighthouse の模擬環境で3往復目に入り、FCP と LCP が約150ms 遅れる
（`scripts/perf/verify_home.py` が予算を検査する）。注記は読み手には届かないので、
ページの外に置く。

生成器が読むコメントだけは `index.html` に残している。消すと生成器が壊れる。

- `<!-- home-perf preload -->` 〜 `<!-- /home-perf preload -->`（`scripts/perf/build_home.py`。2026-11-13 にヒーロー写真を外してからは英語トップにだけある。日本語トップには生成器が入れない）
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
- 藤色（`--hp-am`）は、押せるものと光（経路図のハブ、年額カード）にだけ使う。
  キッカー・番号・章ラベルなどの飾りの文字は `--hp-muted`。
- 1200px 以上では、節の見出しを 5:7 の2列に組む（左にキッカーと H2、右にリード）。
  `:has()` を使うので、対応しないブラウザでは1段組みに戻るだけ。#fit と #story も
  900px 以上で同じ 5:7。

## ヒーロー（`.hero--photo`）

- **人物写真は使わない**（2026-11-13 のオーナー判断。画像生成の iPhone・AirPods を着けた人物を外した。
  実写が無いので人物そのものを外す）。人物・生成した端末・傾けた端末・Siri の球や波形・Obsidian を
  思わせる結晶も置かない。新しい画像を足すなら実際のアプリ画面か、HTML/CSS で描いたものに限る。
- 写真の代わりに `.hp-stage`（aria-hidden）が、紙のメモ（入力）と、それが残った先
  （Obsidian のデイリーノートの1行と、自分宛てのメール）を HTML/CSS で描く。1024px 以上はコピーの右、
  1023px 以下はコピーの下。文字の大きさはステージ幅（cqi）と画面の高さ（svh）の小さい方で決める（13〜18px）。
  - 紙色はメモの紙だけ。ノートは #how 04 の例（`figure.hp-vault`）と同じ暗いパネル（`--hp-panel`）。
    藤色はデイリーノートの見出しの小さな点だけ。青はアプリの送信とマイクの青。
  - 文面は公開ページの範囲：メモと「- 20:48 …」は #how 04 の例、マイクのボタンは #how の画面と alt、
    「自分宛て」は #how 03、差出人「シンプルメモ」は #start。メールの件名は描かない（既定の件名はサイトに
    書いていない）。時刻つきの追記は、設定「タイムスタンプを付けて追記」がオンのときの形。
  - 前の2行（「- 07:12 朝の散歩で浮かんだ記事見出し案」「- 09:34 買い物: コーヒー豆、牛乳」）は
    /obsidian/ のデモの文をそのまま使う（2026-11-14 の v5。それまでは灰色の棒）。前の行は `--hp-muted`。
    1023px 以下は 09:34 の1行だけ、374px 以下は前の行を隠す（新しい行を初画面に残すため）。
  - 動きは1回だけで約3.3秒で止まる（マイク→語→送信→ノートの行→メール）。新しい行は1字ずつではなく
    まとめて落ちて入り（`hp-drop`）、藤色の光（`::before` の `hp-glow`）が一度だけ出る。光の擬似要素だけが
    opacity を動かし、文字は clip-path のまま。prefers-reduced-motion では `::before` も含めて動かさず、
    完成形を出す。print では隠す。
  - ステージの下の `p.hp-stage__cap` に「図は届き方の例です。」と、Obsidian へは設定のあとから追記されること、
    アプリ内の音声入力は iOS 26 以降の対応機種であることを書く（実際の画面と誤認されないための注記。
    図解動画の「実機画面の録画ではありません」と #how の「（例）」にそろえた）。ステージごと aria-hidden。
- 写真が無いので、日本語トップには `<picture class="hero__photograph">`・`div.hero__shade`・写真の preload が無い。
  `scripts/perf/build_home.py` は `PHOTO_PAGES`（英語トップだけ）にだけ写真の preload と AVIF の source を入れ、
  picture と shade を footer の前へ動かす。PageSpeed のブラウザ検査は、日本語では写真のリクエストが0件で
  `.hero .hp-stage` が見えることを、英語では `.hero__photograph img` を確かめる。共有の `home-hero.css`
  （英語と共用）の写真と shade の規則は、日本語では使われないまま残る。
- H1 の CSS は 2026-11-20 のタイトル評価まで変えない（2行は display:block のまま）。LCP はデスクトップで
  H1 の行、狭いモバイルと 1024×640 ではサブの段落。どちらも最初の描画の文字で、時刻は同じ。
- 見出しの語は **clip-path で出し、opacity は使わない。** 半透明の途中で監査が色を測ると、
  コントラスト不足と判定される（A11y が 96 に落ちた）。
- 1024px 以上では、ヒーローが初画面で終わるように縦の寸法を `svh` で詰めてある
  （1366×768・1280×800・1024×768 で 136〜177px はみ出し、QR とメモカードが隠れていた）。
  11サイズ（1024×640〜1920×960）で、QR とメモとノートが初画面に全部入る。
- アイブロウは飾りの文字なので `--hp-muted`。768〜1023px のサブは 1rem（それまでは 13.4px で、全幅で一番小さかった）。
- サブは「話せば、自分宛てのメールとObsidianに残る。／送り先は、毎回選ばなくていい。」（v5）。ページのほかの
  場所はすべて「自分宛てのメール」と書いているので、ヒーローの見える文字にもそろえた。

## 使い方（`#how`）

- 文言は、アプリが初回起動で出すものと同じにする（マイクの許可、届け先の確認）。
  最初の1分に驚きがないように。
- 端末の枠（ベゼル）は `<img>` ではなく包む要素に付ける。`<img>` の border は、
  遅延画像の読み込み前に箱を 23px 高くする（縦横比が border を含む箱に当たるため）。
- 画面画像は AVIF（540w・640w）を優先し、WebP に落ちる。
- 900px 以上では電話が手順に沿って留まり（sticky）、04 が画面に入ると Obsidian 連携の
  設定画面に替わる（末尾のスクリプトの IntersectionObserver が `.is-on` を付ける）。
  キャプションの切り替えも 900px 以上だけ。899px 以下では設定画面の画像を読み込まない。
- 04 に、デイリーノートに追記される形の例（`figure.hp-vault`）を置く。
- 電話の切り替えは、04 の上端が画面の上 45% に入ってから（IntersectionObserver の rootMargin `0px 0px -55% 0px`）。
  900px 以上は、節の下余白を格子の2行目に置き換えて sticky の距離を延ばしている。**この2つは一緒に変える**
  （rootMargin だけ変えると、04 で設定画面の全体が見える位置が減る）。
- 03 に、受信箱に届く形の例（`figure.hp-vault.hp-inbox`、件名はメモの1行目）を置く。
- 04 には、Obsidian を使う人がインストール前に知りたい3点を置く（v5）：iPhone がノートのファイルに直接追記し
  当社のサーバーを通らないこと（#details）、デイリーノートは選んだフォルダの yyyy-MM-dd.md でアプリは
  Obsidian 側の日付形式を読み取らないこと（#start）、追記の書式は設定で変えられること（/obsidian/ の FAQ）。
  「Obsidian書き込みテスト」の文は #start の2枚目にだけ置く（重複させない）。

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
- Apple Watch は、送信と Obsidian への追記をペアの iPhone が行う（/apple-watch/ の公開文）。
  Watch の通信だけでは送信が完結しないことを、章の注記に書く。

## 届け先（`#destinations`）

- VISION §1・§9。Obsidian・メール・Notion は競合ではなく、メモの届け先として書く。
- Notion で書けることは /notion/ の公開文の範囲（1件1ページ、最初の空でない行がタイトル、
  設定の「Notion 連携」→ Notion の画面で許可 → Private に作成、データベースは選べない）。
  Free で Notion が使えるかの明記は、オーナーの確認待ち。

## 図解動画（`#capture-film`）

- `scripts/build_home_film.py` が作る、音声なしの図解動画。
- 文言・構造・資産・VideoObject は `scripts/check_home_film.py` が台帳と照合する
  （`data/benchmark.json` と `assets/video/capture-home.json`）。

## 詳細・向き不向き（`#details`・`#fit`）

- インストール前に、できないことも書いて期待をそろえる。
- VISION §8：アプリに整理の画面はない。
- 「メモの通り道」の文は、/privacy-architecture/・/faq・/notion/・/privacy の公開文の範囲で書く
  （Obsidian への追記は当社のサーバーを通らない、メールと Notion は通るが本文は恒常的に保存しない）。
  「一切」「匿名」「エンドツーエンド暗号化」は使わない。

## 料金（`#pricing`）

- 値は `data/site-constants.json` から `scripts/sync_constants.js` が入れる。
  **¥500/月 と ¥5,000/年 は、料金の区域の中で1つのテキストのまま置く。**
  sync_constants が書き換えるのはこの2つだけなので、派生した金額（月あたりなど）は書かない。
- `browser_checks.cjs` が `.pricing-card` が3つあることを確かめる。
- 768px 以上は subgrid で3枚のカードの行（名前・価格・特典）をそろえる（`@supports` の外は flex のまま）。
- 「送信無制限※」のすぐそばに、短時間の連続送信には安全のための制限があることを書く
  （打消し表示を強調表示の近くに。FAQ 5問目と offers の description も同じ）。
- 共有 CSS はプレミアムのカードに暖色の光を付ける。この配色では染みに見えるので、
  `::after` を消している。
- 価格の下の注記に、自動更新の課金の時期（更新日の24時間以内）と止め方（24時間より前に解約）を書き、
  /legal と /terms へのリンクを置く（legal.html の文の裏返し）。
- iPhone の Safari には句単位の改行（auto-phrase）が無く、短い文が句の途中で割れる。料金カードの短い文には
  `word-break:keep-all` と `<wbr>` を使い、句読点と `<wbr>` だけで折る（中段 CTA の文・#how の例・Siri の吹き出しは
  全幅で keep-all）。料金は 360〜767px と 1200px 以上だけ。常に当てると、3列のカードで最長の句がカードを越えた
  （780〜980px で最大 65px、1040〜1100px で 25px、320px で 13px）。
  `.hp-fit__col li` には当てない。360px で「アプリの中でフォルダやタグを整理したい（」に折れ目が無く、
  インクが列から 11.4px はみ出した（実測。375px からは収まる）。

## 締め（`#get`）と入れたあと（`#start`）

- `#start` には、入れたあとの人（「今はしない」を選んだ人や Smart App Banner から来た人）が着地する。
  カードは「まず一言、送ってみる」→「ObsidianかNotionにも残す」→「声の入口を1つ決める」の順。
  1枚目は送信元のアドレス（noreply@mail.simplememofast.com、faq.html と同じ）と、迷惑メール・Gmail の
  「プロモーション」タブの確かめ方（/guides/gmail/）。本番の HTML でメールアドレスは書き換えられない
  （Cloudflare のメールの難読化は効いていない。2026-11-13 に faq の本番と main の一致で確認）。
  2枚目はフォルダの選び方と「Obsidian書き込みテスト」での確かめ方、Notion の道（/notion/ と #destinations の手順）。
  3枚目は Siri とアクションボタンの設定への2本のリンク。h2 の下にリードは置かない（v3d で消した判断のまま）。
- ヒーローの「入れた方へ：最初にすること」から来た人には、`#start` が画面にある間、
  下部のバーと追従 QR を出さない。
- `#get` のバッジの下に、評価とパスワード不要を置く。商標の注記は `#explore` の末尾へ移した。
- FAQ を `#get` の前へ移す案は見送った。390×664 で、`#details` の最後のリンクから Tab すると、
  遅延描画の節（仮の高さ 600px）を跨いだ FAQ の summary が画面の 1,367px 下に止まった。
  移すなら、遠い節の summary へのフォーカスの着地を先に直す。
- 地色は黒のまま（2026-11-12 のオーナー判断）。紙やクリームの地にしない。

## FAQ（`#faq`）

- head の FAQPage JSON-LD と同じ文にする（`scripts/inject_faq_schema.py --check`）。
  `FAQ_DETAILS_RE` が details の書き方をそのまま読むので、マークアップの形を変えない。

## 物語・運営（`#story`・`#ops`）

- 物語は AI 検索に引用される平易な定義を兼ねる。Captio は代替・着想としてだけ書く。
- 開発者の表記は SimpleMemo Developer、運営は法人名（フッター・/privacy・/legal と同じ表記）。個人名は出さない。
- 運営の節の率と件数は、2026-09-03 のプレスリリースと同じ数字と境界で、
  `data/automation-coverage.json` と `data/autopilot-runs.json` に対して
  `scripts/check-autopilot-page.mjs` が照合する。
- 運営の節では「アプリが育つ」とは書かない（AI の運転が直すのは公式サイトと運営基盤で、アプリ本体は人の経路）。
  条件がそろわず止まる日も台帳に残ることを書く。

## 下部バーと追従 QR

- 下部のインストールバー（767px 以下）と、デスクトップの追従 QR は、
  ページ内のバッジや QR が画面にない間だけ出る。隠れているバーにはフォーカスが入らない。
  下部のバーは `aside`（aria-label「アプリの入手」）。`div` だと axe の region に1件かかっていた。
- **QR の表示寸法は 45 の倍数（90px）にする。** `qr-home-ja.svg` は viewBox 45（37モジュール＋静音域4）で、
  白い静音域を自分で持つので padding は付けない。88px＋padding で描くと1モジュールが 1.69px になり、
  1倍表示で輪郭が灰色ににじむ（v4 まで）。90px なら 2px/モジュールで整数の画素に乗る。
- 本文の QR は 1024px 以上に加えて、768〜1023px でもマウスの環境（`hover:hover` かつ `pointer:fine`）では出す
  （PC の狭いウィンドウで QR が1つも出なかった）。900・960px ではそのぶんヒーローが伸び、メールの段が
  初画面から外れる（バッジ・QR・メモ・ノートの新しい行は残る）。追従カードとレールは 1024px 以上のまま
  （レールの規則が図解動画の右余白も決めるので、図解動画の CSS を触れる PR-C で一緒に扱う）。
- 強制カラー（forced-colors）では、メモの外形・送信の丸・マイク・吹き出し・口コミの枠を CanvasText で戻す。
- 下部のバーには評価（★4.1・28件の評価）と無料枠を出す。バーと `#get` の評価は、
  ヒーローと口コミと同じく `sync_constants.js` の評価の組で台帳と一緒に書き換わる。
  374px 以下ではバーのアイコンを外す（評価の行が収まらない）。
- 追従 QR カードにも評価を出す（同じ評価の組で同期）。見出しはヒーローと締めと同じ「iPhoneで続ける」。
  中段の QR は「iPhoneで読み取る」のまま（読み取る操作の指示を残すため）。
- 幅 767px 以下かつ高さ 500px 以下（横向きの小さな iPhone、400% 拡大）では、
  下部のバーを出さず、ヘッダーも固定しない。
- 1024px 以上では QR カード（右端から 16px、幅 108px）が右下に追従する。ヒーローより後の節と
  図解動画は右に 140px のレールを空け、本文とカードの間を 16px 取っている。
  行末の全角の閉じ括弧は、空白の半分が箱の外へはみ出して測られる（text-spacing-trim）ので、
  間を 8px にすると 1366px で括弧がカードの下に入った。フッターが見える間も隠す。
- ヘッダーなどの不透明な面には、背景のぼかしを付けない。

## 次の一歩（`aside.next-step`）

- `scripts/add-next-step.py` が生成する。1ページに行き先は1つだけ。
