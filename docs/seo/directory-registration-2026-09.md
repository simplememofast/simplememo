# 登録型・申請型の被リンク施策 — 実行台帳（2026-09-19）

作成日：2026-09-19 JST。実行者：Cowork セッション（ブラウザ操作 + 公開フォーム送信）。

この文書は**実際に送信・確認した操作の記録**である。掲載を約束された記録ではない。
`PUBLISHED` は**公開ページで実リンクを確認できたものだけ**に使う。送信しただけのものは
`SUBMITTED` のままにする。

## 0. このセッションの制約（結果の読み方）

以下は実行不能だったため、該当サイトは `BLOCKED` として次アクションを1行で残した。
数を作るために制約を回避していない。

- **新規アカウント作成・パスワード入力を行わない**（セッションのポリシー）。
  既存ログインが残っているサービス（Product Hunt / GitHub / Indie Hackers）は利用した。
- **CAPTCHA・人間確認の回答を行わない**（同）。算数クイズ形式も対象。
  Launching Next はこの形で止まったが、**人がクイズだけ answer して送信ボタンを押し、
  それ以外の入力はセッション側が用意する**という分担で通った。以後この型を使う。
- **有料掲載・広告・相互リンクの購入を行わない**（依頼者の指示）。
- **メール送信を伴う編集部への売り込みを行わない**。本リポジトリの
  `growth/plans/ja-editorial-links-2026-09-18.json` が「営業送信は別途承認」と定めているため、
  今回の権限では送信しない。
- `simplememofast/simplememo-ops` は**このセッションのGitHub権限に含まれておらず読めなかった**。
  指示にあった4本のドラフト（`listing-noteapps-info.md` / `listing-saashub.md` /
  `listing-toolfinder.md` / `listing-g2.md` / `alternativeto-listing.md` /
  `producthunt-launch.md`）は**未読**である。各サイトの現況は下表のとおり
  一次情報（当該サイト本体）から取り直した。

> **その後の変更（2026-09-22〜23）：** オーナーの指示により、`support@simplememofast.com` からの Gmail 送信と、
> 窓口が受付を明示している媒体への送信を行っている（§5.8〜§5.12）。上の「メール送信を伴う売り込みを行わない」は
> 2026-09-19 時点の制約である。`simplememofast/simplememo-ops` は 2026-09-23 にブラウザ経由で読んだ（§5.12）。
> アカウント作成・パスワード入力・CAPTCHA の回答・有料掲載を行わない点は変わっていない。

## 1. 登録・申請台帳

| Priority | Service | Type | Status | Submitted | Published | Website backlink | Public URL | Blocker | Next action |
| -------- | ------- | ---- | ------ | --------- | --------- | ---------------- | ---------- | ------- | ----------- |
| P0-1 | NoteApps.info | SUBMISSION | SUBMITTED | 2026-09-19 | no | pending | https://nextnoteapps.featureupvote.com/suggestions/702301/simple-memo-captiostyle | モデレーター承認待ち | 承認後に本体40アプリ索引への採否を待つ。必要なら corrections@noteapps.info へ訂正連絡 |
| P0-2 | SaaSHub（Simple Memo） | SELF_REGISTER | ALREADY_EXISTS ＋ 改善 SUBMITTED | 2026-09-19 | yes | **dofollow**（一覧ページ） | https://www.saashub.com/simplememo-fast-alternatives | 変更は承認制 | ドメイン付きメール（support@simplememofast.com）で Verify すると承認待ちなしで編集可 |
| P0-3 | Tool Finder（toolfinder.com） | SELF_REGISTER | BLOCKED | — | — | — | https://toolfinder.com/submit | **有料のみ**（$29 一回 / $79 年） | 今回は購入しない。無料枠が復活しないか四半期ごとに再確認 |
| P0-4 | G2 | SELF_REGISTER | BLOCKED | — | — | — | https://sell.g2.com/create-a-profile | セラー登録に **LinkedIn またはビジネスメール認証**が必須。当セッションはアカウントを作成しない | 人が myG2 にビジネスメールで登録 → `/products/new` から無料プロフィール申請（審査3〜5営業日） |
| P0-5 | Capterra | — | NOT_ELIGIBLE | — | — | — | https://www.capterra.com/legal/listing-guidelines/ | 掲載基準が「personal productivity solutions, product clones and/or personal apps」を除外 | 対象外。GetApp / Software Advice も同系列のため同じ基準とみなす |
| P0-6 | フリーソフト100（JA-091） | SUBMISSION | SUBMITTED | 2026-09-19 | no | pending | https://freesoft-100.com/about/form_software.html | 掲載まで1〜2か月・不採用時は連絡なし | 11月頃に `freesoft-100.com` 内検索で掲載有無を確認 |
| 既存 | AlternativeTo | — | ALREADY_EXISTS | — | yes | **nofollow**（`rel="nofollow noopener"`） | https://alternativeto.net/software/simple-memo--captio-style/about/ | 編集にはアカウント必要。**2026-09-23 確認：オーナーは iPhone で `SimpleMemoFast`（2026-03-26 登録）としてログイン済み**。代替一覧5件（Pensieve / Email Me App / Note To Self Mail / Captio / Note To Myself）のうち **Captio は経費精算アプリ**のまま。**2026-09-23 夜：代替一覧の件数表示は10件（上の5件は昼の記録。増えたのか数え方の違いかは未確認）で、経費精算の Captio が先頭（3 likes）。Mac の Chrome は未ログイン**（§5.17） | 情報は最新（2026-09-06更新）。App Store リンクの旧スラッグのみ将来更新。経費精算の Captio を代替一覧から外す（オーナー判断待ち #3） |
| 既存 | Product Hunt | — | ALREADY_EXISTS | — | yes | **ugc**（`rel="noreferrer noopener ugc"`）・当該ページは `noindex, nofollow` | https://www.producthunt.com/products/simple-memo-captio-style | — | 重複ローンチを作らない。下書き1件は未投稿のまま |
| 発見 | awesome-obsidian（GitHub） | SUBMISSION | **PUBLISHED** | 2026-09-06 | **2026-09-08 マージ済** | あり（**nofollow**）→ `https://simplememofast.com/en/obsidian/` | https://github.com/awesome-obsidian/awesome-obsidian | — | 既に公開済。GitHub の README リンクは常に nofollow なので、価値は awesome 系ミラー（awesome.ecosyste.ms 等）への波及側にある。後日確認 |
| 発見 | This Week in Obsidian（週刊ニュースレター・Substack） | SUBMISSION | **PUBLISHED** | 2026-09-06 | **2026-09-08 #38 に掲載** | **dofollow**（本文の `<a>` に rel なし・meta robots / X-Robots-Tag なし）→ `https://simplememofast.com/en/resources/obsidian-inbox/` | https://thisweekinobsidian.substack.com/p/this-week-in-obsidian-38 | — | 2026-09-23 に発見（§5.17）。公式の提案テンプレート（z08-studio/this-week-in-obsidian#8、simplememofast 名義）経由。GitHub 側の issue とアーカイブの .md は nofollow。**2件目の提案は出さない** |
| 発見 | Swift Package Index | SUBMISSION | **PUBLISHED** | 2026-09-06 | **2026-09-07 マージ済** | あり（**nofollow**）→ `https://simplememofast.com/voice-input/`（README 内。README 部分は後から読み込まれ、初回 HTML には無い） | https://swiftpackageindex.com/simplememofast/ios26-speechanalyzer-live-mic | — | 2026-09-23 に発見（§5.17）。PackageList#15105 → 自動 PR #15107 がマージ。参照ドメインとしては nofollow なので価値は小さい |
| 追加 | SaaSHub（Memo Inbox） | SELF_REGISTER | SUBMITTED | 2026-09-19 | no | pending | https://www.saashub.com/memo-inbox （承認後） | 無料枠のため最大32日待ち | 承認後にロゴ・価格・詳細説明を追記 |
| 追加 | Indie Hackers Products DB | SELF_REGISTER | ALREADY_EXISTS（2026-09-23 確認） | — | yes | **nofollow**（`rel="nofollow noopener"`）・ページは **`noindex`** | https://www.indiehackers.com/product/simple-memo | `memolife23` では作れないが、**別アカウント `SimpleMemo` 名義のページが既にある**（作成日は未確認） | 参照ドメインには数えない（noindex）。重複ページは作らない。制限解除の問い合わせも不要になった |
| 追加 | alternative.me（Simple Memo） | SELF_REGISTER | **未登録**（2026-09-23） | — | — | — | https://alternative.me/ | 2026-09-23 にオーナーが「登録済み」と答えたのは **AlternativeTo（alternativeto.net）のことだった**（スクリーンショットで確認）。alternative.me は別サイトで、公開検索（`/api/search?q=simple%20memo`）は0件。同サイトの外部リンクは `rel="nofollow"`（`/captio` で実測）、ソフトの項目は薄く Obsidian も無い | **2026-09-23 オーナー判断：登録する。**アカウント作成と入力は外部の GPT エージェントに依頼（依頼文を渡した：名乗り・有料不可・CAPTCHA は人・代替は Apple Notes と Google Keep だけ・Captio は紐づけない）。公開されたら `rel`・`meta robots` を実測 |
| 追加 | SourceForge（Memo Inbox） | SELF_REGISTER | **外部エージェントに依頼中**（2026-09-23、オーナーが GPT に依頼） | — | — | — | https://sourceforge.net/projects/memo-inbox/ （予定。取れなければ `memoinbox` など） | アカウント作成はこちらでは行わない。依頼文は §5.13 の入力値に、名乗り・有料不可・CAPTCHA は人・GitHub 連携（OAuth）は使わない、を加えたもの | 報告を受けたら公開ページの `rel`・`meta robots` を実測（`curl` は 403 になるのでブラウザで見る） |
| 追加 | PR TIMES（「対話メモ」提供開始のリリース） | PRESS_RELEASE | **配信予約済み**（所有者の作業） | 2026-09-23 予約 | 2026-09-24 08:30 予定 | 未確認 | https://prtimes.jp/main/html/rd/p/000000011.000182412.html （予定URL） | — | 公開後にリンクの `rel`・`meta robots`・転載先を実測する（2026-09-24 10:30 JST に自己確認を予約済み） |
| 追加 | Launching Next | SELF_REGISTER | SUBMITTED | 2026-09-19 | no | pending | https://www.launchingnext.com/submit/ （受付番号 152234） | 無料枠は**審査待ち約4か月**と表示される。$99 の Fast-Track 上乗せは購入しない | 2027-01頃に `launchingnext.com` 内で掲載有無を確認 |
| 追加 | tehtbl/awesome-note-taking | SUBMISSION | SUBMITTED | 2026-09-19 | no | PR内（`https://simplememofast.com/`） | https://github.com/tehtbl/awesome-note-taking/pull/144 | レビュー待ち | マージされれば Proprietary 節に掲載される |
| 追加 | brettkromkamp/awesome-knowledge-management | SUBMISSION | SUBMITTED | 2026-09-19 | no | PR内（`https://simplememofast.com/`） | https://github.com/brettkromkamp/awesome-knowledge-management/pull/83 | レビュー待ち | 845スター・追加頻度が高く、今回で最も期待値が高い |
| 追加 | kmaasrud/awesome-obsidian | SUBMISSION | SUBMITTED | 2026-09-19 | no | PR内（`https://simplememofast.com/en/obsidian/`） | https://github.com/kmaasrud/awesome-obsidian/pull/135 | 未処理PRが46件あり滞留気味 | 反応がなければ Memo Inbox（MIT）への差し替えを提案済み |
| 追加 | pjpoulose/awesome-second-brain | SUBMISSION | SUBMITTED | 2026-09-19 | no | PR内（`https://simplememofast.com/`） | https://github.com/pjpoulose/awesome-second-brain/pull/1 | レビュー待ち | 同リポジトリで最初のPR。CONTRIBUTING準拠で提出 |
| 追加 | jyguyomarch/awesome-productivity | SUBMISSION | SUBMITTED | 2026-09-19 | no | PR内（`https://simplememofast.com/`） | https://github.com/jyguyomarch/awesome-productivity/pull/386 | レビュー待ち | Note Management 節の末尾に追加 |
| 追加 | doanhthong/awesome-pkm | SUBMISSION | SUBMITTED | 2026-09-19 | no | PR内（`https://simplememofast.com/`） | https://github.com/doanhthong/awesome-pkm/pull/23 | 未処理PRが9件あり滞留気味 | — |
| 追加 | Obsidian公式フォーラム | SUBMISSION | BLOCKED | — | — | — | https://forum.obsidian.md/c/share-showcase/9 | アカウント `SimpleMemoFast` でトピックを作成できない（`/new-topic` が `/categories` へ転送される）。投稿0件のため信頼レベル不足と見られる | 既存スレッドへ返信して信頼レベルを上げるか、モデレーターに相談。なお同フォーラムの外部リンクは `rel="noopener nofollow ugc"` |
| 追加 | Obsidian Hub（publish.obsidian.md/hub） | SUBMISSION | NOT_ELIGIBLE | — | — | — | https://github.com/community-archive/obsidian-hub | リポジトリが **2026-08-01 にアーカイブされ read-only**。`obsidian-community` から `community-archive` へ移管済みでPRを受け付けない | 対象外。`02.04 Auxiliary Tools` に Drafts が載っており枠としては適合していたが、もう更新されない |
| 追加 | Obsidian公式フォーラム（プロフィール） | SELF_REGISTER | **PUBLISHED** | 2026-09-19 | **2026-09-19** | あり（`rel="noopener nofollow ugc"`） | https://forum.obsidian.md/u/SimpleMemoFast/summary | — | 新しい参照ドメイン。トピック作成は別途 BLOCKED のまま |
| 追加 | GitHub（プロフィール） | SELF_REGISTER | ALREADY_EXISTS ＋ 修正 | 2026-09-19 | yes | あり | https://github.com/simplememofast | — | 表示名の誤字と旧ブランド「Simple Memo Faset - Captio-style」を「Simple Memo - for Obsidian」へ修正。bio と所在地を追加。awesome系6PRの表示名がこれで揃った |
| 追加 | note（プロフィール） | — | ALREADY_EXISTS | — | yes | あり（`rel="noopener nofollow"`） | https://note.com/simplememo | — | 既にリンク済み。追加作業なし |
| 追加 | Softpedia | — | NOT_ELIGIBLE | — | — | — | https://www.softpedia.com/user/submit.shtml | Windows / Mac / Linux のダウンロード配布ソフトのみ | 対象外 |
| 追加 | Uneed | SELF_REGISTER | BLOCKED | — | — | — | https://www.uneed.best/submit-a-tool | 最終保存にアカウント作成が必要 | 人がアカウントを作れば数分で完了 |
| 追加 | Slant | SELF_REGISTER | BLOCKED | — | — | — | https://www.slant.co/ | サイトが HTTP 526 を返し到達不能 | 復旧後に再訪 |
| 追加 | アプリソムリエ | — | NOT_ELIGIBLE | — | — | — | appsomm.jp | ドメインが消滅（DNS NXDOMAIN） | 候補から削除 |

### リンク属性の確認結果（2026-09-19 実測）

| 掲載先 | ページ | 出リンクの rel | ページの robots |
| --- | --- | --- | --- |
| SaaSHub | `/simplememo-fast-alternatives` | **なし＝dofollow** | 指定なし |
| SaaSHub | `/simplememo-fast` | `nofollow` | `noindex, follow` |
| AlternativeTo | `/software/simple-memo--captio-style/about/` | `nofollow noopener` | `index, follow` |
| Product Hunt | `/products/simple-memo-captio-style` と各ローンチ | `noreferrer noopener ugc` | `noindex, nofollow`（ログイン状態で観測） |
| Product Hunt | `/@simple_memo_captio_style`（プロフィール） | `noreferrer` のみ＝**nofollowは付かない** | ただしページが `noindex, nofollow`（同上） |
| Obsidian フォーラム | `/u/SimpleMemoFast/summary` | `noopener nofollow ugc` | 指定なし |
| note | `/simplememo` | `noopener nofollow` | 指定なし |
| awesome-obsidian（GitHub） | リポジトリのREADME | `nofollow`（GitHubの仕様） | — |
| This Week in Obsidian（2026-09-23 追記） | Substack `/p/this-week-in-obsidian-38` | **なし＝dofollow**（サーバーが返す HTML で確認） | 指定なし（X-Robots-Tag も無し） |
| Swift Package Index（2026-09-23 追記） | `/simplememofast/ios26-speechanalyzer-live-mic` | `nofollow`（README 内） | 指定なし |

**現時点で dofollow が確認できているのは SaaSHub の一覧ページ1本だけ。**
> **2026-09-23 追記：** 台帳の外で 2026-09-06 に出ていた This Week in Obsidian #38（Substack）も dofollow だった（§5.17）。dofollow の確認は**2本**になった。

Product Hunt のプロフィールは `rel` に nofollow が無いが、ページ自体が `noindex, nofollow` を
返すため評価は期待しない（**ログイン状態での観測**であり、クローラ向けの応答は未確認）。
ただし AlternativeTo と Product Hunt は実ユーザーのいる媒体なので、nofollow でも掲載価値は残す。

### 集計

- 新規公開：**1 件**（forum.obsidian.md のプロフィールに実リンクが載った。nofollow）
- 既に公開されていた新規参照ドメインの発見：**1 件**（github.com / awesome-obsidian、2026-09-08 マージ）
- 申請完了：**10 件**（フリーソフト100 / SaaSHub「Memo Inbox」新規 / NoteApps.info 情報更新 / Launching Next / awesome系6リストへのPR）
- 既存掲載の改善申請：**1 件**（SaaSHub「Simple Memo」の全項目訂正）
- 既存掲載の点検のみ：**2 件**（AlternativeTo / Product Hunt）
- BLOCKED：**7 件**（うち1件はすまほん!! — reCAPTCHA v3 により送信不成立、§5.6）
- 対象外：**5 件**（うち1件はコリス — 「営業メールはお断りいたします」と明記、§5.6）
- 公開窓口を確認したが送信が保留になったもの：**5 件**（applech2 / Macお宝鑑定団 / 気になる、記になる… / ガジェットショット / 技術評論社、§5.6）

2026-09-22 追加分（§5.7）：

- 送信完了：**1 件**（bamka.info。アプリのレビュー依頼を明示的に受け付けている窓口）
- 窓口の実測記録：**48 件**（`ASSET_REQUIRED` 53件を除く全47候補で窓口未確認がゼロになった）
- メールのみの良い窓口：**2 件**（さくらのナレッジの著者募集／CoRRiENTE のレビュー依頼受付）
- 受付対象外と判断：**7 件**（ジャンル外・営業不可・有料のみ・受付終了）

2026-09-22 追加送信（§5.8）：

- 送信完了：**5 件**（bamka.info / 技術評論社 gihyo.jp / ガジェットショット / AAPL Ch. / Macお宝鑑定団）
- 判断で送らなかった：**1 件**（気になる、記になる…＝窓口が公開コメント欄のため）
- **送信済み4件に identity policy 違反あり**（開発者個人の実名を使用。取り消し不可。→§5.8）

2026-09-22 窓口再調査（§5.11）：

- 送信完了：**1 件**（CodeZine の寄稿・取材企画応募。技術記事として応募）
- 状態が確定：**6 件**（`WINDOW_UNVERIFIED` 16 → 10 に減った）
- 英語圏ディレクトリ：**登録できたもの 0 件**（主要ディレクトリはアカウント必須、iOS系awesomeリストはApp Storeリンク）

2026-09-22 メール送信（§5.9）：

- 送信完了：**4 件**（さくらのナレッジ / Mac Fan / Think IT / CoRRiENTE）
- いずれも identity policy 準拠（名乗り・署名は「シンプルメモ開発者／株式会社ユリカ」）
- これで 2026-09-22 の送信は **計9媒体**（フォーム5・メール4）。**掲載確認はいずれも未了**

うち awesome系6件は 2026-09-19 に `simplememofast` アカウントでPRを出した。
すべて1行追加のみ、各リストの CONTRIBUTING に沿った書式で、**本文に「開発者本人である」と明記**している。
いずれも GitHub の README リンクなので `rel="nofollow"` が付く。**期待しているのは
リンク評価ではなく、awesome系リストが多数のミラー（awesome.ecosyste.ms、LibHunt 等）へ
転載されることによる参照ドメインの広がりと、実ユーザーの流入である。**

### 実装上のつまずき（次回同じ穴に落ちないための記録）

Launching Next の初回送信は `Write a brief sentence about the startup` で弾かれた。
原因は**このセッション側のバグ**で、`document.getElementsByName('description')` が
`<meta name="description">` と入力欄の**2つ**を返し、先頭の meta を掴んでいた。
meta 要素に `.value` を代入しても expando プロパティが生えるだけなので、
読み返しても値が入って見え、入力欄は空のまま送信されていた。

**フォームに値を入れるときは `input[name=...]` / `textarea[name=...]` / `select[name=...]`
で要素型を明示して取得する。** `getElementsByName` は使わない。
また送信が失敗して再描画されると、ラジオ選択とチェックボックスは既定値に戻る
（ニュースレター購読が勝手に入り直す）ので、再送信前に必ず全項目を読み直す。

## 2. 既存掲載の点検結果

### AlternativeTo — 問題なし

- ページは公開中・`index, follow`。`simplememofast.com/` へのリンクはあるが **nofollow**。
- 説明文は現行仕様と一致（AES-GCM は端末内・E2EEではない／Free 3通/日／$2.99・$29.99／
  Apple Watch・音声入力・Obsidian追記）。「Captio・Tupil と提携していない」と明記済み。
- **「Captio＝経費管理ソフト」との混同は起きていない。** AlternativeTo の `Captio`
  （`/software/captio/`）は Business & Commerce カテゴリの出張経費管理サービスで、
  Simple Memo はその alternative として紐付いていない。紐付いているのは
  Strflow / Pensieve / Email Me App / Note To Self Mail / Email Me など正しい相手。
- 残る軽微な点：App Store リンクが旧スラッグ `captio-style-simple-memo`（IDリダイレクトで到達可）。

### Product Hunt — 重複を作らないこと

- プロダクトページ名は既に現行の「Simple Memo — for Obsidian」。
- ローンチは2件（2026-02-14 / 2026-03-31）。**3件目の下書きが未投稿のまま残っている。**
  今回は投稿しない（依頼者指示：重複投稿を作らない）。
- リンクは `rel="noreferrer noopener ugc"`、プロダクト／ローンチ両ページとも
  `noindex, nofollow` を返した（ログイン状態での観測）。SEO上の寄与は期待しない。
  ただし実ユーザーのいる媒体なので掲載自体の価値は残す。

## 3. SaaSHub に送った訂正内容（旧掲載の誤りの記録）

旧掲載には**サイトの現行事実と矛盾する記述**が残っていた。訂正申請に含めた主な差分：

| 項目 | 旧掲載 | 訂正後（根拠） |
| --- | --- | --- |
| 製品名 | SimpleMemo Fast | Simple Memo - for Obsidian（`data/site-constants.json`） |
| 起動速度 | launch in 0.3s | 約0.4秒・ウォーム起動・5回の中央値（`data/benchmark.json` / `/blog/benchmark-methodology`） |
| 送信速度 | 150ms send time | **削除**（現在は公開していない数値） |
| 料金 | $2.99/mo（7日間無制限トライアル後） | 無料3通/日はずっと無料・トライアルなし。$2.99/月・$29.99/年（`/faq`, `data/site-constants.json`） |
| 暗号化 | AES-GCM encryption | 端末内 Outbox とキューのみ AES-GCM-256、鍵は Keychain。**E2EEではない**（SMTP配送） |
| 公開日 | 2026-02-01 | 2026-02-12（App Store `releaseDate`） |
| Obsidian | Obsidian sync | 追記（append）。コミュニティプラグイン不要／フォルダ未選択時は URLスキームへフォールバック |

「7日間無制限トライアル」は本リポジトリの CI（`scripts/check-pr-facts.mjs`）が
**廃止済みの事実として明示的に警戒している記述**である。外部ディレクトリ側に残っていたので落とした。

## 4. 今回使った事実の出所（登録文面の根拠）

すべて一次情報で取り直した。過去ドラフトの数値は使っていない。

| 項目 | 値 | 出所 |
| --- | --- | --- |
| 正式名称（日） | Obsidian連携シンプルメモ | `data/site-constants.json` |
| 正式名称（英） | Simple Memo - for Obsidian | 同上 |
| App Store 表示名 | `Simple Memo - Obsidian Voice`（US） / `シンプルメモ - Obsidian連携・高速音声入力`（JP） | iTunes Lookup API 2026-09-19 |
| App Store URL | https://apps.apple.com/us/app/id6758438948 | 同上 |
| 公開日 | 2026-02-12 | iTunes Lookup `releaseDate` |
| 対応OS | iOS / iPadOS 16.0 以降 | iTunes Lookup `minimumOsVersion` ＋ `/faq` |
| 対応言語 | 9言語（ar, en, fr, de, ja, pt, ru, zh, es） | iTunes Lookup `languageCodesISO2A` |
| 料金 | 無料3通/日（期限なし）／$2.99・月、$29.99・年／¥500・月、¥5,000・年 | `data/site-constants.json`, `/faq`, `/en/` |
| 起動速度 | 約0.4秒（ウォーム、n=5、range 0.366–0.433） | `data/benchmark.json` |
| 暗号化 | 端末内 Outbox・送信履歴を AES-GCM-256（鍵は Keychain）。**E2EEではない** | `llms.txt`, `/privacy-architecture/` |
| 会社 | 株式会社ユリカ / YURIKA, K.K.（日本） | `/about/`, iTunes `sellerName` |
| サポート窓口 | support@simplememofast.com | サイト内 |
| Captio との関係 | Captio のワークフローに着想を得た**独立した代替アプリ**。公式後継でも承認済みでもない。Captio 側の事実は開発元の終了告知どおり「**クラウドサービスは 2024-10-01 に終了**、App Store からは**その告知の約2年前に撤退**」（2026-09-23 訂正。当初この行は「2024年10月に App Store から消えた」と書いていたが、告知と矛盾する —— §5.12） | `/about/`, `/en/`, https://captio.co/ |

**使わなかった数値：** レーティング（`site-constants.json` は 2026-09-05 時点で 4.2/25 だが、
2026-09-19 の JP Lookup は 4.39/23 を返した。日々動くため登録文面には入れていない）、
バージョン番号（JP Lookup が 5.8.1、US Lookup が 5.8.57 と食い違ったため未使用）、
「independently benchmarked」等の第三者検証を示唆する表現（証拠なし）。

## 5. `ja-editorial-links-2026-09-18.json` 100件の再分類

依頼の4区分で全100件を分類した。結果は JSON 側の
`execution_classification` フィールドに機械可読で入れてある。

| 区分 | 初回分類 | 資産再監査後 | 内訳 |
| --- | ---: | ---: | --- |
| `SELF_REGISTER` | **0** | **0** | この100件に自己登録型ディレクトリは1件も含まれていない |
| `SUBMISSION` | **2** | **2** | JA-012（すまほん!!・**送信不成立**→§5.6）／JA-091（フリーソフト100・**送信済**） |
| `EDITORIAL_OUTREACH` | 13 | **45** | 打診だけで成立しうるもの。**+32件は資産再監査で昇格**（→§5.5） |
| `ASSET_REQUIRED` | 85 | **53** | 実機検証・実例集・調査・サンプルコードなどの**新規制作がまだ必要**なもの |

**この100件は「登録施策のリスト」ではなく「編集リンク獲得のリスト」である。**
今回の最優先方針（登録 ＞ 申請 ＞ 編集部 ＞ 個別アウトリーチ）に照らすと、
第1・第2優先で消化できるのは実質2件しかなく、残り98件は後段（第3・第4優先）に属する。
ただし資産再監査（§5.5）で、後段のうち32件は**新規制作なしで打診できる状態**だと判明した。
登録型の在庫は**この100件の外から探す必要がある**（→ §6）。

分類の根拠：`proposal` と `action` に資料・教材・検証・実測・調査・ツール・テンプレート等の
制作物が要求されているかで機械的に判定し、窓口の実在を確認できた2件だけ `SUBMISSION` に上げた。
`SUBMISSION` 判定は**窓口を実際に開いて確認した件のみ**。推定で昇格させていない。

### JA-091 の扱いの変更

元の企画は「無料の日本語Markdown整形ツールを新規開発して掲載してもらう」だった。
**新規開発は不要だった** — 既に公開済みの
[Obsidian Inbox用Markdown生成ツール](https://simplememofast.com/resources/obsidian-inbox/)
が、フリーソフト100の受付区分「フリーソフト：Web アプリ」に合致する。

フリーソフト100は **iOSアプリ本体を受け付けていない**（「Windows で動作しないソフト」は
推薦対象外と明記）。そのため本体ではなく無料Webツールを自薦した。区分・対応OS・提供元・
使い方を記入し、2026-09-19 に送信完了。

## 5.5 `ASSET_REQUIRED` 85件の資産再監査（2026-09-19）

初回分類では `action` の文面に「検証」「教材」「ツール」「資料」等の語があれば
機械的に `ASSET_REQUIRED` に落としていた。**これは過剰に厳しかった** —
要求されている資料の多くは既に公開済みだった可能性がある、という仮説で再監査した。

**方法**：85件それぞれの `action` が求める資料を、公開中の自社ページと突合した。
突合先は blog 59本 / en/blog 16本 / devlog 5本 / use-cases 21本 / glossary 20語 /
methods 6本 / guides 9本 / 無料Webツール2本（`/resources/obsidian-inbox/`・`/memo-inbox/`）/
roadmap / press / autopilot。**台帳に書いた参照URLは1件ずつ HTTP ステータスを確認し、
200 が返ったものだけを残した**（`/data/decision-intents.json` など404だった3本は記載から外した）。

| 判定 | 件数 | 意味 |
| --- | ---: | --- |
| `ASSET_READY` | **32** | 提案に必要な資料が**すでに公開されている**。新規制作は不要で、残るのは打診の可否判断だけ |
| `ASSET_PARTIAL` | 24 | 中核部分は公開済みだが、動画・図版・実例ログなど一部が欠けている |
| `ASSET_MISSING` | 29 | ユーザーテスト・調査・サンプルコード等が未着手で、制作しないと成立しない |

`ASSET_READY` の32件は `execution_classification.bucket` を `EDITORIAL_OUTREACH` に変更した。
判定・根拠URL・不足分は JSON の各候補の `asset_audit` フィールドに機械可読で入っている。

**`ASSET_READY` に上がった32件**（括弧内は根拠として使える公開URL）：

- JA-004 CoRRiENTE / JA-023 シゴタノ！ / JA-010 misclog — `/guides/inbox-memo-organization/`・`/methods/inbox-zero/`・`/templates/`
- JA-005 Mac Fan / JA-063 WEEL / JA-064 和から / JA-100 TOMUP — `/blog/email-to-obsidian`・`/blog/obsidian-iphone-memo`・`/obsidian/`
- JA-031 技術評論社 / JA-032 CodeZine / JA-048 IIJ / JA-050 さくらのナレッジ / JA-085 SendGrid — `/devlog/outbox-architecture`・`/devlog/relay-api-design`・`/memo-inbox/`（MITでソース公開）
- JA-035 Think IT / JA-058 Webクリエイターボックス / JA-059 コリス / JA-028 増井技術士事務所 — `/resources/obsidian-inbox/`（登録不要の無料Webツール）
- JA-020 SMATU / JA-027 徳本昌大 / JA-025 No Second Life / JA-026 独立を楽しくするブログ / JA-066 THE LANCER / JA-067 クラウドワークス / JA-068 LISKUL / JA-069 LIG / JA-036 エンジニアtype — 該当する `/use-cases/` 各ページ
- JA-040 PC-Webzine — `/comparison/`・`/blog/which-memo-app-flowchart`
- JA-021 Lifehacking.jp / JA-065 グッドシステム — `/blog/information-organization-guide`・`/blog/memo-app-service-shutdown-risk`
- JA-092 初心者のためのOffice講座 — `/guides/outlook/`
- JA-009 Gadgetouch / JA-015 文具のとびら / JA-016 美崎栄一郎

**注意**：`ASSET_READY` は「資料が揃っている」という意味であって、
**掲載や被リンクが得られるという意味ではない**。各媒体が取り上げるかどうかは先方の判断であり、
本台帳では掲載を確認できたものだけを published 相当として扱う方針を維持する。

## 5.6 公開窓口の実地確認（9媒体・2026-09-19）

実際に窓口を開いて、項目・ログイン要否・ボット対策・掲載方針の記載を確認した。

| ID | 媒体 | 窓口 | 状態 | 確認した記載 |
| --- | --- | --- | --- | --- |
| JA-012 | すまほん!! | `https://smhn.info/contact` | **BLOCKED** | 用件に「レビューの依頼」区分あり。送信を試みたが reCAPTCHA v3 が spam 判定（詳細下記） |
| JA-001 | AAPL Ch. | `https://applech2.com/contact-form` | 窓口確認済 | 名前／メール／題名／本文の4項目。ログイン不要。`/contact` は404 |
| JA-002 | Macお宝鑑定団 | `https://www.macotakara.jp/contact/` | 窓口確認済 | 「メールに対してのお返事は、多忙に付き御遠慮させて頂いております」と明記 |
| JA-003 | 気になる、記になる… | `https://taisy0.com/contact` | 窓口確認済 | 「ニュースのタレコミ…などあればこちらからお願い致します」と明記 |
| JA-011 | ガジェットショット | `https://gadget-shot.com/contact` | 窓口確認済 | 「レビューのご依頼は原則として商品の無償提供を条件に承っております」。無料枠があるため条件は満たせる。有料PR記事は先方も当方も不可 |
| JA-031 | 技術評論社 | `https://gihyo.jp/site/inquiry` | 窓口確認済 | 「gihyo.jpへの記事寄稿に関するお問い合わせ」区分あり。製品情報提供の区分はない |
| JA-059 | コリス | `https://coliss.com/contact/` | **NOT_ELIGIBLE** | 「営業メールはお断りいたします」と明記。資産は揃っているが送信しない |
| JA-032 | CodeZine | — | 未確認 | 問い合わせページが 403 を返し内容を確認できず |
| JA-033 | Publickey | — | 未確認 | `contact.html` が 404。窓口の所在を特定できず |

### すまほん!! への送信が成立しなかった件（JA-012）

用件区分「レビューの依頼」を選び、**すまほん!! 向けに個別に書いた本文**
（アプリ概要・料金・実測値の出所・E2EEではない旨の明示・第三者検証を受けていない旨・
原稿の事前確認を求めない旨・掲載可否は先方に一任する旨）で送信した。結果：

```
form data-status="spam"
メッセージの送信に失敗しました。間をおいてもう一度お試しいただくか、別の手段で管理者にお問い合わせ下さい。
```

Contact Form 7 の `spam` ステータスで、**reCAPTCHA v3 のスコア判定による自動拒否**。
ボット判定を回避する操作は行わないため、BLOCKED として記録し次へ進んだ。
人が同じ本文を手で送れば通る可能性は高い（本文自体は spam ではない）。

### 残る5媒体への送信が保留になった理由

窓口を確認できた applech2・macotakara・taisy0・gadget-shot・gihyo の5件は、
本文を用意した段階で**この実行環境の安全分類が「掲載依頼フォームの送信」を
利用者の明示承認が必要な操作として保留した**。回避はしていない。
5件とも一斉送信ではなく個別本文を前提としており、
`growth/plans/ja-editorial-links-2026-09-18.json` の運用方針
（一斉送信・有料契約・リンク交換を行わない）とは矛盾しない。

## 5.7 残る窓口の一斉確認（39媒体・2026-09-22）

§5.5 で `EDITORIAL_OUTREACH` に昇格した45件のうち、窓口が未確認だった39件を全件確認した。
**これで `ASSET_REQUIRED` 53件を除く全47件に窓口の実測記録が付き、窓口未確認はゼロになった。**

**手順**：まず39ドメインに `/contact` `/contact/` `/inquiry/` `/about/` `/contact-us/`
`/otoiawase/` `/form/` の7パターンで HTTP プローブをかけ、200 が返った窓口と主要媒体を
個別に開いて、項目・ログイン要否・ボット対策・掲載方針の記載を読んだ。

| 判定 | 件数 | 意味 |
| --- | ---: | --- |
| `WINDOW_VERIFIED` | 19 | 公開フォームを確認。ただし多くは方針の記載が無い一般窓口 |
| `WINDOW_UNVERIFIED` | 16 | 403 / 404 / TLSエラー等で窓口を特定できなかった |
| `NOT_ELIGIBLE` | 7 | 受付対象外と読める（下表） |
| `WINDOW_VERIFIED_EMAIL_ONLY` | 2 | フォームが無くメールのみ |
| `BLOCKED` | 2 | 窓口はあるが送れない |
| `SUBMITTED` | 1 | **送信完了（bamka.info）** |
| `NOT_AVAILABLE` | 1 | 窓口そのものが機能していない |

### 送信した1件 — bamka.info（JA-013）

問い合わせページに受付内容として
**「製品のレビュー記事執筆依頼」「WEBサービスやアプリのレビュー記事執筆依頼」
「アプリのプロトタイプのユーザーテスト」** が明示されていた。
窓口の目的とこちらの用件が一致しているため、bamka さん向けに個別に書いた本文で送信し、
Googleフォームの完了画面「回答を記録しました。」を確認した（2026-09-22）。

本文には、無償で試せること・**金銭を対価とするPR記事の依頼ではないこと**・
原稿の事前確認を求めないこと・評価内容と掲載可否を一任することを明記している。
**掲載の確約ではない。** 掲載を確認できるまで `PUBLISHED` には上げない。

### 今回見つかった良い窓口（メールのみ → **2026-09-22 に送信済み、§5.9**）

| ID | 媒体 | 窓口 | なぜ良いか |
| --- | --- | --- | --- |
| JA-050 | さくらのナレッジ | [著者募集](https://knowledge.sakura.ad.jp/call-for-authors/) | **著者募集が公開されている。** テーマは事前相談、2000〜6000字。セミナー・企業情報の告知に「ご利用いただくこともOKです」と明記され、**自社への言及が許容されている数少ない窓口**。資産は `ASSET_READY`（`/devlog/relay-api-design`・`/memo-inbox/`）で、新規制作なしで企画を出せる |
| JA-004 | CoRRiENTE | `https://corriente.jp/contact/` | 受付内容に「製品のレビュー依頼（メーカー様・代理店様）」「プレスリリースのご送付」を明示 |

両方ともフォームが無くメールのみ。**この確認時点では送っていない**（メール送信の権限が無かった）。
本文は `docs/seo/media-pitch-drafts-2026-09-22.md` に用意した。
→ **その後、所有者からメール送信の許可を得て 2026-09-22 に両方とも送信済み（§5.9）。**

### 送れなかった2件（BLOCKED）

- **Mac Fan（JA-005）** — [プレスリリース受付フォーム](https://book.mynavi.jp/quest/id=732)は正規の窓口で、
  「Mac、iPhone、iPadなど、Apple製品関連のサービス情報およびリリースを募集しています」と明記。
  ログインもCAPTCHAも無い。**しかし電話番号が必須**で、株式会社ユリカは特定商取引法表記で
  「原則メール」としており公開電話番号が無い。**番号を創作して埋めることはしない**ので送信できない。
  同ページに `mnp-macfan-release@mynavi.jp` も併記されており、**メールなら電話番号は不要**。
  → **2026-09-22 にこのメール窓口へ送信済み（§5.9）。フォーム自体は電話番号必須のままで未解決。**
- **すまほん!!（JA-012）** — §5.6 の通り reCAPTCHA v3 の spam 判定。

### 受付対象外と判断した7件

| ID | 媒体 | 根拠（実際の記載） |
| --- | --- | --- |
| JA-029 | 結城浩 | 「恐れ入りますが、献本はご遠慮いただいております。」 |
| JA-059 | コリス | 「営業メールはお断りいたします」 |
| JA-035 | Think IT | 問い合わせフォームは「このフォームの受付は終了しました。」。プレスリリースはメールのみで「問い合わせフォームへのリリース送付はご遠慮ください」 |
| JA-068 | LISKUL | 公開されているのは成果報酬型の記事広告のみ。**有料掲載は本施策の禁止事項** |
| JA-010 | misclog | レビュー受付は「ガジェット（ケースやカバーなど含む）ジャンル」。iOSアプリはジャンル外 |
| JA-015 | 文具のとびら | 「文具新製品情報、ニュースをぜひお寄せください」と専用フォームがあるが、対象は文具の新製品。iOSアプリはジャンル外 |
| JA-063 | WEEL | 公開されているのは無料相談と営業用フォームのみで、編集部への情報提供窓口が無い |

**ジャンル外の窓口に送らなかったのは意図的**。受付対象を読まずに送れば件数は増えるが、
それは依頼者が禁止した「規約に反する大量登録」と実質的に同じで、媒体側の信頼も失う。

### 送らなかった19件（`WINDOW_VERIFIED`）の扱い

公開フォームはあるが、**受付内容に製品紹介・レビュー依頼・情報提供が挙げられていない**
一般の問い合わせ窓口。ushigyu / jMatsuzaki / 徳本昌大 / Webクリエイターボックス /
独立を楽しくするブログ / グッドシステム / No Second Life / STUDY HACKER / ロフトワーク /
LIG / Stock / エンジニアtype / 美崎栄一郎 ほか。

ここに一律で送ると、本文を変えていても実質的な一斉送信になる。
`growth/plans/ja-editorial-links-2026-09-18.json` の運用方針
（一斉送信・有料契約・リンク交換を行わない）に反するため、**送っていない**。
個別に関係を作ってから送るか、送らないかは人の判断に委ねる。

なお LIG は「営業目的の方は、必ず 営業・協業用フォームからご提案ください。」と明記しており、
自社製品の掲載依頼は営業扱いになる可能性が高い。

## 5.8 2026-09-22 追加送信と、identity policy 違反の記録

### 送信できた4件

| ID | 媒体 | 窓口 | 確認した完了表示 |
| --- | --- | --- | --- |
| JA-013 | bamka.info | Googleフォーム | 「回答を記録しました。」 |
| JA-031 | 技術評論社 gihyo.jp | [記事寄稿の問い合わせフォーム](https://gihyo.jp/site/inquiry/form?type=gihyojp-contrib) | 「お問い合わせありがとうございます」 |
| JA-011 | ガジェットショット | `https://gadget-shot.com/contact` | 「お問い合わせは送信されました。」 |
| JA-001 | AAPL Ch. | `https://applech2.com/contact-form` | 「ありがとうございます。メッセージは送信されました。」 |

いずれも媒体ごとに別の本文で、リンク要求・原稿の事前確認要求・有料PR記事の依頼を含まない。
**掲載の確約ではないので `PUBLISHED` には上げない。**

### 送らなかった2件（この日の判断）

- **気になる、記になる…（JA-003）** — 「お問い合わせ（タレコミ）」ページの投稿欄は、
  **WordPress のコメントフォーム**（項目は コメント／名前／メール／サイト、ボタンは「コメントを送信」）だった。
  送ると**公開コメントとして第三者に見える**形になり、私信としてのタレコミとは性質が違う。
  企業名入りの売り込みを他人のブログに公開コメントとして貼る形になるため、**送らずに人の判断へ回す**。
- ~~**Macお宝鑑定団（JA-002）**~~ — いったん中断したが、**identity を直したうえで同日中に送信完了**（下記）。

### 送信し直した1件 —— Macお宝鑑定団（JA-002）

identity を直したあとに送信し、3段（内容の入力 → 内容の確認 → 送信完了）を経て
`/contact/thanks.html` に到達したことを確認した。
**確認画面で送信者名が `SimpleMemo Developer（株式会社ユリカ）` と表示されるのを目視してから送信している。**
この媒体は「メールに対してのお返事は、多忙に付き御遠慮させて頂いております」と明記しているので、
本文の冒頭で「返信は不要です」と断り、情報提供のみにとどめた。

**2026-09-22 の送信は計5媒体。うち identity policy に沿っているのはこの1件だけ。**

### identity policy 違反 —— 先行して送った4件に個人名が入っている

**上記4件の送信者名・本文の名乗り・署名に、開発者個人の実名を使ってしまった。これは誤り。**

このリポジトリの運用では、対外的な名乗りは
**`SimpleMemo Developer`（日本語なら「シンプルメモ開発者」）／個人名が必須の欄だけ `AI ATAKA`／
会社名は「株式会社ユリカ・YURIKA, K.K.」**に限られる（`docs/seo/media-pitch-drafts-2026-09-19.md`
§送信前の確認事項1、および私有の identity policy）。**個人名は使わない。**

4件すべてで、次の3か所に実名が入った（実名そのものはここに再掲しない）：

- 氏名欄：`実名（株式会社ユリカ）`
- 本文の名乗り：「株式会社ユリカの〈実名〉と申します」
- 署名の1行目：`実名（読み仮名）`（続く 株式会社ユリカ ／ support@simplememofast.com ／ サイトURL は正しい）

**送信済みのため取り消せない。** 会社名と返信先は正しいので連絡経路に問題はないが、
不要な個人名が4媒体の受信箱に残っている。訂正連絡を出すかどうかは人の判断に委ねる
（こちらから追って送ると催促に見えるため、当方からは自動では出さない）。

**再発防止**：`media-pitch-drafts-2026-09-22.md` の「送る前の確認」1番を
identity の規則に差し替え、下書き本文からも個人名を全て除去した
（下書きファイルに実名が1文字も含まれないことを確認済み）。
**送信直前に送信者欄・署名・引用を含む全文を読み戻して照合する**手順を明記した。

## 5.9 メールのみの窓口4媒体へ送信（2026-09-22）

所有者から `support@simplememofast.com` で Gmail 経由のメール送信を許可されたため、
フォームが無い・使えない4媒体へ、媒体ごとに別の本文で送信した。

| ID | 媒体 | 宛先 | 種別 | 結果 |
| --- | --- | --- | --- | --- |
| JA-050 | さくらのナレッジ | `knowledge-ml@sakura.ad.jp` | 著者募集への応募 | **送信完了** |
| JA-005 | Mac Fan | `mnp-macfan-release@mynavi.jp` | プレスリリース | **送信完了** |
| JA-035 | Think IT | `release@thinkit.co.jp` | プレスリリース | **送信完了** |
| JA-004 | CoRRiENTE | `press@corriente.top` | 製品レビュー依頼 | **送信完了** |

4件とも Gmail の完了表示「メッセージを送信しました」を確認している。
**掲載の確約ではない。** 掲載を確認できるまで `PUBLISHED` には上げない。
`growth/plans/ja-editorial-links-2026-09-18.json` では
`submission_window.outcome` を `SUBMITTED_EMAIL` に更新し、
送信前の値を `outcome_before_send` に残した。

### 送信手順で必ず守ったこと

1. **差出人を毎回明示的に切り替える。** このアカウントの Gmail は
   **既定の差出人が開発者個人の実名を含む**。エイリアス
   `Simple Memo <support@simplememofast.com>` は既定ではないので、
   作成のたびに選び直す必要がある。
2. **送信直前に読み戻して照合する。** 差出人・宛先・件名・本文・署名を
   DOM から読み直して確認してから送信した。
   実際、Think IT の1通では**本文を修正した拍子に差出人が黙って実名へ戻っていた**のを
   この読み戻しで捕まえている。1回でも省いていたら5件目の違反になっていた。
3. **名乗りと署名は「シンプルメモ開発者／株式会社ユリカ」に統一。**
   4通とも開発者個人の実名を含まないことを送信前に確認済み。

### 媒体ごとの判断

- **さくらのナレッジ（JA-050）** — 公開されている著者募集への応募。テーマは事前相談、
  2000〜6000字。「セミナー・企業情報の告知にご利用いただくこともOK」と明記されており、
  自社への言及が許容されている数少ない窓口。企画は送信キュー設計の技術記事として出した。
- **Mac Fan（JA-005）** — 受付フォームは電話番号が必須で、株式会社ユリカは特定商取引法表記で
  「原則メール」としており公開電話番号が無い。**番号は創作しない**ので、同ページに併記された
  プレスリリース用メールアドレスを使った。
- **Think IT（JA-035）** — 問い合わせフォームは受付終了。かつ
  「問い合わせフォームへのリリース送付はご遠慮ください」と明記されているので**フォームは使わず**、
  指定のメールアドレスへ送った。技術者向け媒体なので、実装（MIT公開）を前に出した本文にしている。
- **CoRRiENTE（JA-004）** — 送信前に contact ページでアドレスを目視確認した。
  **サイトは `corriente.jp` だがメールは `corriente.top` ドメイン**で、台帳のドメインとは異なる。
  また広告掲載ページで「サービスや商品、新規アプリ等のレビュー記事」が
  **有料の広告メニューとして列挙されている**ため、本文で
  「編集部によるレビューのご検討のお願いであり、有料メニューの依頼ではない／
  当方は有料掲載を購入しない方針」と明記した。

### 送信に使った本文の数値を、送信前に出典と突き合わせた

| 主張 | 出典 | 結果 |
| --- | --- | --- |
| v5.8.66 / iOS 16.0以降 / 9言語 / 2026-02-12公開 | iTunes Lookup API（`id 6758438948`） | 一致（言語コードは10個だが `ZH` が重複しており実質9言語） |
| 無料で1日3通・月額500円・年額5,000円 | `data/site-constants.json` | 一致 |
| ウォーム起動0.40秒（n=5、範囲 0.366〜0.433秒） | `data/benchmark.json` の `ready` / `ready_range` | 一致（公開ページ側は 0.37–0.43 に丸めている） |
| Apple Watch は入力側で送信はペアの iPhone 経由 | `docs/pr-autopilot-2026-09-inventory.md`（Watch→iPhone送信の重複排除バグ記録） | 裏付けあり |
| 端末内は AES-GCM、ただし配送は E2EE ではない | `/devlog/privacy-first-design` | 一致 |

本文に載せた5本のURLは、送信前にすべて HTTP 200 を確認している。

### 残った後始末

Gmail の下書きに、`computer type` で本文の体裁が崩れた CoRRiENTE 宛の**旧下書きが1通**残っている。
**データの削除はしない方針**なので消していない。人が手で捨てるか、そのままでも実害はない。

## 5.10 オーナー確認で解消した2件（2026-09-22）

長く「人が判断しないと進まない」として残っていた2件が、オーナーの回答で片付いた。

### 価格の確認 → `llms.txt` の期限切れが解消

`scripts/seo-check.js` が出していた
`[LLMS] llms.txt "Current facts (as of …)" is 31 days old` の原因は、
`stampDate()` が `appVersionNote` / `ratingNote` / `priceNote` の**最も古い検証日**を採ることと、
アプリ内課金の価格が iTunes Lookup API では取得できずオーナーしか確認できないことだった。
**日付だけ進めるのは検証の捏造になる**ので、こちらでは動かさずに保留していた。

2026-09-22、オーナーが **¥500/月・¥5,000/年が現行のまま**であることを確認。
`priceNote` の日付を `2026-09-22` に更新し `node scripts/sync_constants.js --write` を実行した結果、
`llms.txt` のスタンプが `2026-08-22` → `2026-09-20` に進み
（`appVersionNote` / `ratingNote` の 2026-09-20 が新たな最古日になった）、
**`seo-check` は 0 errors / 0 warnings** になった。

### 電話番号の公開 → 電話番号必須フォームが使えるようになった

株式会社ユリカは特定商取引法表記で「原則メール」としており公開電話番号が無かったため、
**電話番号が必須の受付フォーム（Mac Fan ほか）には送れなかった**。
**番号を創作して埋めることはしない**方針なので、メール窓口で代替していた（§5.9）。

2026-09-22、オーナーの指示により **050-1793-7505** を公開した。反映先：

| 反映先 | 内容 |
| --- | --- |
| `legal.html`（特定商取引法に基づく表記） | 「電話番号：050-1793-7505」を追加。「原則メール」は「お問い合わせは原則メールで承っております」に変更 |
| `en/legal.html` | `Telephone: +81-50-1793-7505` を追加 |
| `contact.html` / `en/contact.html` | 「お電話でのご連絡」として `tel:` リンクを表示 |
| 組織 JSON-LD（`index.html` / `contact.html` と英語版、計6ブロック） | `ContactPoint.telephone` に `+81-50-1793-7505` を追加 |

特定商取引法は原則として電話番号の記載を求めているので、**法令表記としても以前より正確**になった。
JSON-LD は全ブロックのパースを確認済み。

**Mac Fan（JA-005）へはすでにメールで送信済みなので、フォームから再送はしない。**
この変更が効くのは、今後あらわれる「電話番号必須」の窓口に対してである。

## 5.11 窓口未確認16件の再調査と、英語圏ディレクトリの棚卸し（2026-09-22）

### CodeZine に寄稿応募した（JA-032・優先度A）—— **これが今回いちばんの収穫**

前回 403 で中身を確認できなかった CodeZine に、
**[寄稿・取材企画の応募ページ](https://codezine.jp/offering) が公開されていた。**

注意事項に **「製品やサービスの宣伝を目的とした内容…は対象外」** と明記されているので、
製品紹介ではなく**技術記事**として応募した。題材は次のとおり。

> **そのベンチマーク、ウォーム起動かもしれません**
> —— iOSアプリの「起動から入力可能まで」を画面収録のフレーム解析で同条件比較する

中身は計測手法と、**自分の公開ベンチマークが誤っていた話**である。
「コールド起動で計測」と書いていたが、強制終了して5秒待つ手順を踏んでも
iOS 26 では実際にはウォームで立ち上がっていた、と全起動の録画を見直して確認し、訂正した。
その経緯と、中央値だけでなく範囲と n 数を併記する理由、二峰性の分布の扱い、
「最初の文字が出るまで」を採用しなかった理由（打鍵は手の時間）までを扱う。

Googleフォームの完了表示 **「ご応募ありがとうございました。」** を確認済み。
記事の形式は「寄稿」、カテゴリは「アプリケーション開発」。
氏名欄が**ペンネーム可**だったので「シンプルメモ開発者」を使った。
**「すべてのご応募に返信は致しかねます」と明記**されているので、返信が無くても追わない。

### 状態が確定した6件

| ID | 媒体 | 再調査後 | 分かったこと |
| --- | --- | --- | --- |
| JA-032 | CodeZine | **SUBMITTED** | `/offering` に寄稿・取材企画の応募フォーム。上記のとおり応募済み |
| JA-033 | Publickey | `WINDOW_VERIFIED_EMAIL_ONLY` | 404 だった `/contact.html` ではなく **`/about-us.html`** に窓口。全般は `comment[at]publickey.jp`、**プレスリリース専用に `release[at]publickey.jp`** があり「ITベンダのみなさまのプレスリリースや発表会のご案内などをお待ちしております」と明示 |
| JA-030 | keinolog | `WINDOW_VERIFIED` | `/contact` 系ではなく**日本語スラッグの `/お問い合わせ`** にフォーム。Obsidian・タスク管理を扱う個人ブログで関連性は高い |
| JA-028 | 増井技術士事務所 | `WINDOW_VERIFIED_EMAIL_ONLY` | `/profile/contact.html` に `info@masuipeo.com` |
| JA-060 | could（yasuhisa.com） | `NOT_ELIGIBLE` | 「相談する」は**デザイン顧問業務の受注窓口**で、掲載・紹介の窓口ではない |
| JA-064 | 和から | `NOT_ELIGIBLE` | TLS の失敗はUA変更で解消。ただし数学・データサイエンスの教室でジャンル不一致 |

**残り10件は依然として窓口の所在が確認できていない**（ozpa表4 / SMATU.net / シゴタノ！ /
PC-Webzine / IIJ Engineers Blog / THE LANCER / クラウドワークスのメディア /
SendGrid日本語サイト / 初心者のためのOffice講座 / TOMUPのメディア）。

### 送らなかった3件の理由

Publickey・keinolog・増井技術士事務所は窓口を特定できたが、送っていない。

- **Publickey** — プレスリリースを明示的に募集しているが、媒体の軸はエンタープライズIT・
  クラウド・Web標準。個人向けメモアプリとは距離がある。送るなら Relay API
  （Cloudflare Workers）側の話に寄せる必要があり、その原稿はまだない。
- **keinolog** — 受付方針の記載がない一般窓口。§5.7 で決めた「方針の記載がない一般の
  問い合わせフォームには送らない」に従う。関連性は高いので、**人が送ると決めるなら良い候補**。
- **増井技術士事務所** — 窓口の目的は事務所への相談であって、掲載・紹介の受付ではない。

### 英語圏ディレクトリ —— **無料・非アカウントで登録できるものは見つからなかった**

優先順位の一番上が「登録だけで完了できる施策」なので、英語圏で増やせないか実地で確認した。
**結論は、このセッションからは1件も登録できない**である。理由は2つ。

**1. 主要ディレクトリはすべてアカウント作成が必須**（当セッションはアカウントを作らない）

| ディレクトリ | 確認結果 |
| --- | --- |
| SourceForge / G2 / Crunchbase / StackShare / TrustRadius / GoodFirms | ベンダーアカウント必須 |
| alternative.me | 「a user account is required to create new entries」と明記 |
| OpenAlternative | `/submit` がサインインページ |
| F6S / Wellfound / Peerlist / Indie Hackers | アカウント必須（IH は §1 のとおり別途 BLOCKED） |
| Uneed / Fazier / PitchWall / DevHunt / StartupBuffer / EarlyHunt | アカウント必須 |
| Tool Finder | 有料のみ（§1 で確認済み） |
| Capterra / GetApp / Software Advice | 掲載基準が個人向けアプリを除外（§1 で確認済み） |

**2. iOS アプリ系の awesome リストは、リンク先が App Store でホームページではない**

`deluks/awesome-ios-apps` の contributing は
**「The primary link for the app should point to its App Store page, not its homepage.」**
と定めている。Productivity 節があり iPhone / iPad / Watch / subscription のバッジもあって
条件は合うが、**自社ドメインへの被リンクにはならない**（星8件で流入も見込めない）。
`naughtyspirit/awesome-ios-apps` も同型。**PRを出す価値がないと判断した。**

前回PRを出した6リスト（note-taking / knowledge-management / obsidian / second-brain /
productivity / pkm）がホームページリンクだったのは、それらが**アプリの一覧ではなく
ツール・手法の一覧**だからである。同型のリストはすでに出し尽くしている。

**→ 人がアカウントを1回作れば、あとの入力・説明文・カテゴリ選択はこちらで進められる。**
費用対効果が高い順に SourceForge（Memo Inbox が MIT なので適合）、alternative.me、
OpenAlternative、F6S。

## 5.12 明示的に受け付けている窓口への送信と、残タスクの棚卸し（2026-09-23）

選んだ基準は1つだけ —— **窓口の文面に、製品情報・プレスリリース・レビュー依頼を受け付けると書いてあること。**
§5.7 で決めた「受付方針の記載が無い一般の問い合わせ窓口には送らない」はそのまま守っている。

### 送信した8件

| ID | 媒体 | 受け付けている根拠（窓口の文面） | 経路 | 完了表示 |
| --- | --- | --- | --- | --- |
| JA-016 | 美崎栄一郎公式サイト | 受付内容に「…商品のご提供などに関するお問い合わせ」 | Googleフォーム | 「回答を記録しました。」 |
| JA-062 | STUDY HACKER | お問い合わせの種類に **「取材・プレスリリース送付など」** | Googleフォーム | 「回答を記録しました。」 |
| JA-006 | ushigyu | /advertisement/ に **「記事掲載の確約が無くてもよいのであれば製品・サービスの提供は基本的に歓迎」** | メール（info@ushigyu.net） | Gmail「メッセージを送信しました」 |
| JA-036 | エンジニアtype | フォーム名が **「取材や情報提供に関するお問い合わせ（エンジニアtype）」**、区分に「情報提供、タイアップ記事などのご相談」 | 専用フォーム（確認画面あり） | 「送信が完了しました。」 |
| JA-009 | Gadgetouch | /contact/ に **「…プレスリリース・情報提供…などは以下のフォームからお願いします」** | form-mailer（確認画面あり） | 「回答の送信が完了しました。」＋自動返信 |
| JA-007 | 男子ハック | 「掲載をご希望のテーマ/商品/サービスのご連絡は下記お申し込みフォームより」、アプリのレビュー依頼はアプリへのリンク等を添えるよう明記 | Contact Form 7（種別＝サービスのご紹介（アプリ）） | 「ありがとうございます。メッセージは送信されました。」 |
| JA-008 | ディレイマニア | **「製品・WEBサービスのレビュー依頼なども受け付けております」** | Contact Form 7 | 「あなたのメッセージは送信されました。ありがとうございました。」 |
| — | MakeUseOf（英語） | Contact の Editorial Inquiries に **「Topic Ideas, Feedback, Corrections or Suggestions」** | メール（editorial@makeuseof.com） | Gmail「メッセージを送信しました」 |

守ったこと（JA-016 は本文の全文控えを残していないため、下の2〜3点目は残り7件について確認できた範囲）：

- 名乗り・署名は「シンプルメモ開発者／株式会社ユリカ」（英語は *Simple Memo Developer / YURIKA, K.K.*）、返信先は `support@simplememofast.com`。
  メールは差出人に `Simple Memo <support@simplememofast.com>` を明示選択し、送信直前に `input[name=from]`・件名・本文の長さ・署名を読み戻した。
  フォームも送信前に入力値を読み戻し、**開発者個人の実名が入っていないこと**を確認した。
- 数値は送信前に一次情報と照合した：価格・無料枠・トライアルなしは `data/site-constants.json`、対応OS・公開日・アプリ名は iTunes Lookup、
  0.40秒は `/blog/benchmark-methodology`（iPhone 16e・iOS 26.5.2・ウォーム起動・5回の中央値）。**第三者検証は受けていない**と毎回書いた。
- 「金銭を対価とする記事広告の依頼ではない」「リンクの指定はしない」「返信不要」を書いた。**掲載の確約ではない**ので `PUBLISHED` には上げていない。

### 媒体ごとの判断

- **ushigyu（JA-006）** — フォームに既定オンのチェック欄があり「送信の前にチェックを外してください」と指示している。
  **これはボット対策なので操作していない。**ページ自体が「送信がうまくいかない場合は」と併記しているメールアドレスへ送った。
  「デメリットも正直に書く方針」とあったので、無料枠が1日3通であること・E2E暗号化ではないことを先に書いた。
- **エンジニアtype（JA-036）** — 前回の記録（汎用フォーム・区分未確認）は誤りで、エンジニアtype専用の情報提供窓口だった。
  区分名に「タイアップ記事」が含まれるので、本文冒頭で**有償タイアップの相談ではない**と明記した。
- **Gadgetouch（JA-009）** — 前回の記録（レビュー依頼の可否は明記なし）は、フォーム側だけを見ていたため。
  サイト側の /contact/ に「プレスリリース・情報提供」の受付が明記されていた。Apple Watch 対応時の PR TIMES リリースを添えた。
- **男子ハック（JA-007）・ディレイマニア（JA-008）** — どちらも `ASSET_REQUIRED`（比較動画・会議録音機との検証が未作成）だったが、
  **窓口がアプリのレビュー依頼そのものを受け付けていた**ので、資料なしで成立する用件（アプリの紹介）に絞って送った。
  男子ハックはプロモーションコードを求めているが**約束はしていない**（有料機能も確認したい場合は知らせてほしい、とだけ書いた）。
  ディレイマニアの窓口は請負メニュー（レビュー記事執筆依頼など）を兼ねているので、**有償の依頼ではない**と冒頭に書いた。
  男子ハックは1回目の操作でフォームの状態が `validating` のまま止まり送信要求が出なかった。応答が無いことを確かめてから
  読み込み直して**1回だけ**送った（二重送信なし）。
- **MakeUseOf（英語）** — 2012年の記事 *Open, Write, And Send: 5 Alternative Note Apps For iOS Devices* が、
  Squarespace Note には [No Longer Available] を付けているのに **Captio（$1.99）を現行アプリとして載せたまま**だった。
  **訂正提案**として、開発元の終了告知（captio.co：App Store からは告知の約2年前に撤退、クラウドサービスは2024-10-01に終了）を示し、
  あわせて「Captio のワークフローに着想を得た独立アプリを開発している」と開示した（公認・後継とは書いていない）。
  候補JSONの外（英語媒体）なので、ここにだけ記録する。

### 英語圏メディア（ops リポジトリの TODO にあった4件＋競合1件）

| 媒体 | 結論 | 理由 |
| --- | --- | --- |
| MakeUseOf | **送信済み**（上記） | 訂正・提案の受付を明記 |
| MacStories | **送らない（既送）** | Gmail の送信済みに **2026-09-06 付で編集長宛ての英文ピッチ**がある（別経路で送信済み）。二重に送らない。なお about ページは編集者の個人アドレスのみで、アプリ紹介の受付方針は書かれていない |
| Zapier Blog | 送らない（オーナー判断） | ゲスト寄稿は受付中。ただし「アプリ比較・ベストアプリ一覧は受け付けない」「**AI生成の文章は不可**」「本人の実務経験に基づくこと」が条件。こちらでは書けない。オーナー本人が書くなら候補 |
| ろぼいんブログ（roboin.io） | 送らない | 連絡はメール・X の DM。受付が明記されているのは **記事広告（有償）だけ**。有料掲載は買わない |
| note2selfmail.app | 対象外 | ops の案は「相互リンク／メンション提案」で、禁止事項（不自然な相互リンク契約）に当たる |

ops リポジトリ（`simplememofast/simplememo-ops`、非公開）の `drafts/TODO-seo-next-actions.md`（2026-03-21）は
ブラウザ経由で読めた。上記以外の項目の現況：NoteApps（§1・訂正コメント承認待ち）、AlternativeTo（下記「見つかった問題」）、
Indie Hackers / Show HN / Reddit（コミュニティ投稿はアカウント所有者の判断。IH は§6.6のとおり noindex）、
Toolfinder（有料）、ClickUp Blog・AppSumo（適合が低い）、SaaSHub・Capterra・G2（§1）。
**March 版のピッチ文面には現在の事実と合わない数値（0.3秒・150ms など）が含まれている可能性があるので、再利用しない。**

### 窓口未確認10件 → 全件確定（`WINDOW_UNVERIFIED` は0件）

実ブラウザで開き直し、トップの全リンクから問い合わせ・運営者情報への導線を抽出した。

| ID | 媒体 | 確定した状態 | 分かったこと |
| --- | --- | --- | --- |
| JA-017 | OZPA表4 | `NOT_AVAILABLE` | 問い合わせ・運営者情報への導線なし。外部リンクは X のみ（2026年も更新あり） |
| JA-020 | SMATU.net | `NOT_AVAILABLE` | 導線なし。最新は2025年12月の1件 |
| JA-023 | シゴタノ！ | `NOT_ELIGIBLE` | フォームに **「協業・営業・広告・宣伝・情報交換に類するお問い合わせには一切対応しておりません」**。最新記事は2023-08 |
| JA-040 | PC-Webzine | `NOT_ELIGIBLE` | ダイワボウ情報システムの**IT販売店向けB2B媒体**。外部の情報提供窓口なし |
| JA-048 | IIJ Engineers Blog | `NOT_ELIGIBLE` | 自社技術者の発信媒体。外部からの窓口なし |
| JA-066 | THE LANCER | `WINDOW_VERIFIED` | 運営会社のコーポレート窓口のみ（「メディア取材・プレスリリースについて」区分あり）。媒体への掲載受付は書かれていない → 送らない |
| JA-067 | クラウドワークスのメディア | `WINDOW_VERIFIED_EMAIL_ONLY` | 運営者情報にメールアドレス。受付方針なし → 送らない |
| JA-085 | SendGrid日本語サイト | `NOT_ELIGIBLE` | 窓口は SendGrid 利用者向け。当アプリの配送は SendGrid ではない |
| JA-092 | 初心者のためのOffice講座 | `NOT_AVAILABLE` | 「間違いがあれば連絡を」とあるだけで、製品情報の受付は無い |
| JA-100 | TOMUPのメディア | `WINDOW_VERIFIED` | メールアドレス＋本文だけの汎用フォーム。受付方針なし → 送らない |

### `ASSET_REQUIRED` 51件の制作判断

判断の軸は「資料を作れば被リンクに近づくか」。**送り先が外部からの持ち込みを受け付けていなければ、
資料を作っても送れない。**そこで11件は窓口を実地で確認し、残りは資料の性質と媒体の種類で分けた。
各候補の `asset_audit.asset_decision` に理由と工数（S/M/L）を書いてある。

| 判断 | 件数 | ID | 中身 |
| --- | ---: | --- | --- |
| `SENT_WITHOUT_ASSET` | 2 | JA-007, JA-008 | 窓口がレビュー依頼を明示的に受け付けていたので、資料なしで送った（上記） |
| `DEFER_BUILDABLE` | 5 | JA-014, 018, 037, 061, 093 | 記入例・運用図・テンプレート・シートは**こちらで作れる（工数S）**が、送り先に明示の受付窓口が無い（確認済み：014 は有償の相談窓口、018・037 は窓口 404、061 は受付方針なし、093 は導線なし）。窓口が見つかるか、ページ単体でサイトに置く価値があると判断したら作る |
| `DEFER_OWNER_EVIDENCE` | 17 | JA-019, 022, 039, 052, 057, 071, 078, 079, 080, 081, 083, 084, 086, 087, 088, 089, 090 | 実機での確認・本人の実例・実利用者の事例・社内の判断記録など**実在の証拠**が要る。**作り話で埋められない**ので、オーナー（か実利用者）の協力が前提 |
| `DEFER_HIGH_COST` | 5 | JA-034, 038, 043, 053, 054 | デモツール・調査・ユーザーテスト・共同調査。工数Lで、被リンクの見込みに割に合わない |
| `NOT_ELIGIBLE_INHOUSE` | 8 | JA-041, 042, 044, 045, 046, 047, 049, 051 | 自社の技術者・社員が書く媒体（Goodpatch の月次まとめは社内で話題になったものの紹介）。外部の資料を受け付ける前提が無い |
| `LONG_TERM_ONLY` | 14 | JA-055, 070, 072–077, 094–099 | 出版社・学会・業界団体・NPO。書籍企画・研究発表・共同実証などの**長期共同企画**としてしか成立しない。優先順位は最下位なので今回は着手しない |

**結論：今すぐ作る価値がある資料は無い。**作れるもの（5件）は送り先が無く、送り先がありうるもの（17件）は実在の証拠が要る。

### 既存施策の現況（2026-09-22〜23 に確認）

- **awesome 系 6PR** — すべて Open、メンテナのコメントなし。こちらから追加で送るものは無い。
- **SaaSHub** — 訂正は反映済みで、リンクは dofollow のまま。**Memo Inbox の掲載ページは noindex でリンクも無い**ので、参照ドメインには数えない（`PUBLISHED` にしない）。
- **NoteApps.info** — 訂正コメントは承認待ち。
- **返信** — 届いているのは自動受付だけ（Macお宝鑑定団の受付確認、技術評論社の受付案内、本日の Gadgetouch の自動返信）。人からの返信は0件。
- **`data/routine-runs.json`** — Codex 側の #1537 で解消済み。`check-routine-runs.mjs --check` は緑（未対応の注意書きは残る）。

### 見つかった問題（4件）

1. **AlternativeTo の Simple Memo の代替一覧に、経費精算アプリの「Captio」（Captio Tech・スペイン）が載っている。**
   AlternativeTo の `/software/captio/` はこの経費精算アプリで、活動履歴では **`simplememo` アカウントが約7か月前に
   「Simple Memo の代替」として追加**している。読者には無関係のアプリを案内していることになる。
   外すにはログインが要るので**オーナー作業**（こちらはパスワードを入力しない）。
2. **Captio の App Store 撤退時期の誤記がサイト13ファイルにある。**開発元の告知（captio.co）は
   「App Store からは約2年前に撤退、クラウドサービスは2024-10-01に終了」なのに、サイトは「2024年10月に App Store から削除」と書き、
   英語版の一部は「開発元は公式発表をしていない」とも書いている。**この台帳の §4 事実表にも同じ誤りがあったので直した。**
   公開ページの修正は一括編集が向くので **Codex へ回した**（`docs/codex-request-captio-dates-and-store-facts-2026-09-23.md` 依頼A）。
3. **App Store の公開版が 5.9.9 に上がった（2026-09-22 23:13 UTC）のに、`check-store-facts.mjs --net` は「ずれなし」と出す。**
   このサンドボックスからは Node の `fetch` が CDN の古い応答（5.8.66）を掴み、`curl` や時刻付きクエリでは 5.9.9 が返った。
   サイトは26ファイルで 5.8.66 を名乗っている。検査の修正と同期は **Codex へ回した**（同じ依頼文の依頼B）。
4. **2026-09-23 09:00 JST から、`SEO Validation` の `Corporate obligations` が全PRで落ちている。**
   `data/corporate-obligations.json` で、規約改定により 2026-09-08 に `unreviewed` へ戻された4社（apple / google_cloud / firebase / registrar）の
   16マスが猶予14日を越えた（UTC の日付で判定するので 09:00 JST に一斉に赤くなった）。**このPRも含め、`claude/`・`Codex/` の自動マージが止まる。**
   規約の読み直しは法的判断の欄なので、こちらでは触らず **Codex 依頼の最優先（依頼C）** にした。
   同じ形で 2026-09-30（anthropic / search_console / github）と 2026-10-07（appsflyer）にも落ちる。

## 5.13 オーナー判断の反映（2026-09-23）

§7 の「オーナー判断待ち」から4点を選択式で確認した。

| 事項 | オーナーの判断 | こちらで実行したこと |
| --- | --- | --- |
| CI の赤（`Corporate obligations`） | **Codex に依頼C を渡す** | 依頼文をファイルで渡した。解けたら PR #1541 をリベースで最新化して再検証し、自動マージまで見届ける |
| 英語圏ディレクトリのアカウント | **SourceForge と alternative.me の2つだけ作る** | アカウント作成はオーナー。入力する文面は下に用意した |
| 受付方針の記載が無い窓口（15件） | **関連の強い2件（keinolog・Publickey）だけ送る** | Publickey は送信、keinolog は送信がサーバー側で拒否された（下記） |
| オーナーの手作業 | **すまほん!! に手で送る** | 送信用の本文（名乗り・数値を点検済み）を渡した。送信日を受け取ったら JA-012 を更新する |

AlternativeTo の誤った Captio の除去、Gmail の既定差出人、Zapier への寄稿、Product Hunt の下書きは選ばれなかったので**保留のまま**。

### Publickey（JA-033）—— 送信済み

`release@publickey.jp`（about-us ページのプレスリリース送付先）へ、差出人 `Simple Memo <support@simplememofast.com>` で送った。
送信前に差出人・件名・本文（1,131字）・署名を読み戻した。媒体の軸（エンタープライズIT・クラウド）に合わせ、製品紹介ではなく次の2点を情報提供した。

1. メモのメール配送を Cloudflare Workers の Relay API で中継し、本文は TLS で通過するだけで恒常保存もログ記録もしない設計（出典 `/devlog/relay-api-design`・`/privacy-architecture/`）。SMTP 配送なので E2E 暗号化ではない、という限界も書いた。
2. ブラウザ内で完結する Memo Inbox（MIT、2026-09-07 公開、GitHub の公開リポジトリあり）。

### keinolog（JA-030）—— `BLOCKED`

フォーム（Contact Form 7・reCAPTCHA v3）から**1回だけ**送信を試みたが、送信先の REST API
（`/wp-json/contact-form-7/v1/contact-forms/2458/feedback`）が **HTTP 403** を返し、完了表示は出なかった。
ボット判定の回避や再送はしない。フォーム以外の公開連絡先は見当たらない。

### 英語圏ディレクトリに入力する文面（アカウント作成待ち）

**SourceForge —— Memo Inbox を「Import from GitHub」で登録する**（オープンソースのディレクトリなので、MIT の Memo Inbox が適合）

| 項目 | 入力値 |
| --- | --- |
| Project name | Memo Inbox |
| Repository | https://github.com/simplememofast/memo-inbox |
| Homepage | https://simplememofast.com/memo-inbox/ |
| Summary | A browser-local note inbox with search, tags, trash recovery, and Markdown export |
| License / OS / Language | MIT / Web-based (OS independent) / JavaScript |
| Category | Note taking |

> Memo Inbox is a standalone, open-source (MIT) note inbox that runs entirely in your browser. Save short notes with an optional title and tags, search them, move them to trash and restore them, and export everything as a Markdown ZIP you can drop into an Obsidian vault or any Markdown folder. There is no account, no cloud sync, and no analytics or external scripts; notes are not sent to a server. Notes live in this browser's storage, so export a backup regularly. Made by Simple Memo Developer (YURIKA, K.K.).

**alternative.me —— Simple Memo（iOS アプリ）を登録する**

| 項目 | 入力値 |
| --- | --- |
| Name | Simple Memo |
| Website | https://simplememofast.com/en/ |
| App Store | https://apps.apple.com/app/id6758438948 |
| Platforms | iPhone, iPad, Apple Watch |
| Pricing | Freemium（Free: 3 notes/day; Premium $2.99/month or $29.99/year; no free trial） |
| Category / tags | Note-taking, Productivity, email-yourself, quick capture |
| Alternative to | 既存エントリを見てから付ける。**Captio は同名の経費精算アプリと取り違えやすい**（AlternativeTo で実際に起きた・§5.12）ので、email-yourself の Captio が無ければ付けない。候補は Email Me / Note To Self Mail |

> Simple Memo is an iPhone app for capturing a short note and emailing it to yourself in one tap: open it, type or dictate, and send — the note lands in your own inbox. It also works from Apple Watch (voice memos are relayed via the paired iPhone) and can optionally append notes to an Obsidian vault. It is free for up to 3 notes a day; Premium is $2.99/month or $29.99/year, with no free trial. The on-device outbox is encrypted with AES-GCM, but delivery uses standard SMTP, so it is not end-to-end encrypted. Inspired by Captio's workflow; not affiliated with Captio or its developer.

数値の出所は §4 と同じ（価格は 2026-09-22 にオーナー確認、`data/site-constants.json`）。**起動速度とバージョン番号は入れていない**
（速度は測定条件の説明なしに一覧へ載せない。バージョンは日々動く）。登録後は、公開ページの `meta robots` と自社リンクの `rel` を実測してから台帳に記録する。

## 5.14 媒体からの返信と対応（2026-09-23）

### 美崎栄一郎公式サイト（JA-016）—— プレミアムの無料オファーコードを送付（メールの記述と実際の設定が食い違っている）

- **10:38** 本人から support@ 宛てに返信。フォームの内容を確認した、いろいろ確認してみたいのでプロモーションコードを送ってほしい、という内容。
- **12:23** `Simple Memo <support@simplememofast.com>` から返信で送付。本文の中身は、コード、使い方（アプリのURL → 引き換えURL → 反映されないときは「購入を復元」）、
  「プレミアムプラン1か月無料」、「無料期間が終わると自動で終了し、請求は発生しない・解約不要」、「紹介の有無・内容は任せる」。
  送信前に差出人・宛先1件・件名・本文・署名を読み戻し、送信済みフォルダでも確かめた。
- コードはオーナーが App Store Connect で作った（こちらには ASC にサインインする手段が無い）。**コードの文字列はこの公開リポジトリに書かない。**
- 掲載の確約ではないので `PUBLISHED` には上げていない（候補JSON の `media_response` に記録）。

**送信後（12:20 のスクリーンショット）に分かった、実際のオファー設定：**

| 項目 | 実際の設定 | 12:23 のメールに書いたこと |
| --- | --- | --- |
| 無料期間 | **最初の1年間は無料**（参照名「Sample」） | 1か月無料 |
| 期間後の自動更新 | **未確認**（スクリーンショットに写っていない） | 自動で終了し、請求は発生しない・解約不要 |
| 対象 | 新規サブスクリプション登録者のみ | （書いていない） |
| プラン | 未確認（月額か年額か） | 「月額プランへの切り替えは発生しない」 |
| コード | カスタムコード・プロダクション500件・期限 2026-12-31・175の国と地域 | コードとリンクのみ |

- **原因はこちらにある。**メール本文を、オーナーの回答（「自動更新しない・無料1か月」）だけを根拠に書き、オファーの詳細画面を見ずに送った。
- **リスク：**自動更新する設定なら、1年後（2027年9月ごろ）に通常料金の請求が始まる。そうなると、メールの「請求は発生しない」が誤りになる。期間の食い違いは長い方向なので、相手の不利益になりうるのは請求の点だけ。
- **オーナー判断（2026-09-23）：訂正メールは送らない。**

### 分かったこと —— 「プロモーションコード」を頼まれたら、オファーコードで応じる

| | アプリ本体のプロモコード | サブスクのオファーコード（カスタムコード） |
| --- | --- | --- |
| できること | アプリの無料ダウンロード | プレミアムを無料・割引で提供（今回は最初の1年間無料） |
| シンプルメモでの意味 | **無い**（アプリはもともと無料） | ある |
| 今も作れるか | 作れる（今回も1件発行された。未使用なら 2026-10-20 米国太平洋時間に失効） | 作れる |
| 引き換え方法 | App Store でコードを入力 | **引き換えURL か、アプリ内**。App Store の「ギフトカードまたはコードを使う」では使えない場合がある |

- 2026-03-26 以降は、**アプリ内課金向けのプロモコードを新しく作れない**（Apple Developer News、2025-10-29 発表）。
  ASC の「プロモーションコード」で作れるのはアプリ本体のコードだけで、見出しは「『iOS 5.9.9』用プロモーションコード」のようにバージョン名になる。
- 今回も、最初に発行されたのはこのアプリ本体のコードだった。送る前に止めた。**見出しが月額プランの名前になっているかどうか**で見分けられる。
- 次に頼まれたときの手順（男子ハック JA-007 も、窓口の案内で「プロモーションコード」に触れている）：
  月額プラン →「オファーコードを作成」→「自動更新しない」にチェック → 対象は新規・既存・期限切れ → 無料・1か月 →
  カスタムコード（媒体ごとに別のコードにし、上限は小さく）。
  **本文を書く前に、オファーの詳細画面（オファータイプ・カスタマーの利用資格・期間後の自動更新）とプラン名を、画面かスクリーンショットで確かめる。**
  口頭の回答だけで期間や「請求は発生しない」を書かない（今回はそれで期間を誤り、自動更新も未確認のまま送った）。
- 引き換えURL の形式は `https://apps.apple.com/redeem?ctx=offercodes&id=6758438948&code=<CODE>`。
  カスタムコードが使えるようになるまでの時間は Apple のヘルプに書かれていない（使い捨てコードは「最大1時間」）。本文では「少し時間がかかることがある」とだけ書いた。

## 5.15 自分だけで進められる施策の再点検（2026-09-23 午後）

オーナーの操作なしで完了できる施策が残っていないかを、もう一度洗い出した。**結論：今は残っていない。**
先へ進むには、オーナーの操作（アカウント作成・ログイン）か、判断（受付方針が書かれていない窓口へ送るか）が要る。

| 確認したもの | 結果 | 判断 |
| --- | --- | --- |
| 媒体からの返信（Gmail） | 人からの返信は美崎様1件だけ（§5.14）。ほかはガジェタッチ・Macお宝鑑定団・技術評論社の自動受付と、ニュースレター | 対応済み |
| CI（`Corporate obligations`） | main は `b33946b` のまま、16マスで赤 | Codex 依頼C の待ち。PR #1541 は止まったまま |
| SaaSHub の所有者認証（Verify） | ログインが要る（ログアウト状態） | 見送り。Simple Memo の訂正は反映済みで、認証しても増えるものが小さい |
| Indie Hackers の製品ページ | `SimpleMemo` 名義の `/product/simple-memo` が既にある。**`noindex`**・リンクは nofollow | 数えない。§1 を更新 |
| App Store の製品ページ | 「デベロッパWebサイト」「プライバシーポリシー」から自社へリンク済み（`nofollow noopener noreferrer`、jp・us とも） | 追加でやることは無い |
| SourceForge / alternative.me | アカウントはまだ無い（SourceForge はログイン画面、確認メールも無い） | オーナーの作成待ち（§5.13） |
| Ness Labs（Tools for Thought の紹介インタビュー） | partnerships ページに *We conduct sponsored interviews* とある＝**有料** | 対象外（有料掲載は買わない） |
| iPhone Life | 「アプリの宣伝方法」ページ（/getpublicity）が消えてトップへ転送。残る窓口は寄稿者の募集だけ | 対象外 |
| Apple World Today | *we do not accept unsolicited items* | 対象外 |
| iDownloadBlog / 9to5Mac など | 窓口はニュースのタレコミ用アドレスだけで、アプリの紹介を受け付けるとは書いていない | §5.7 の方針で送らない（送るならオーナー判断） |
| AppAdvice | ドメインが解決しない | 対象外 |
| alexanderop/awesome-local-first（Memo Inbox の候補） | 作例の節に localStorage だけで動く小さなアプリも並ぶが、メンテナが「すでに多くの人に使われているものだけ」と明記 | Memo Inbox（v0.1.0）は条件を満たさないので出さない |
| mundimark/awesome-markdown-editors | Markdown エディタの一覧。Simple Memo も Memo Inbox もエディタではない | 適合が弱いので出さない |
| 738/awesome-apple-watch | watchOS のライブラリ・サンプルコードの一覧 | 対象外 |
| PKM Weekly | 投稿・情報提供の受付が書かれていない | §5.7 の方針で送らない |
| Obsidian Roundup | 休刊。ドメインは別サイト（カジノ）になっていた | 対象外 |

**新たに分かったこと：**2026-09-24 08:30 に、所有者の PR TIMES リリース（「対話メモ」の提供開始）が配信予約されている（§1 に追記）。
公開されたら、リリースページと転載先のリンク属性を実測する。**リリース本文の機能・数値は、こちらでは検証していないので、ほかの送信文に転記しない。**

## 5.16 英語圏の Apple 系メディアへ3件送信（2026-09-23、オーナー判断）

§5.15 のあと、オーナーが「英語圏メディアに数件送る」を選んだ（AskUserQuestion の回答）。
アプリ紹介の受付が窓口に**明記されていない**所も含むので、§5.7 の方針（明記のある窓口だけ）の**例外としてオーナーが承認した**扱い。件数は3件に絞った。

| 媒体 | 宛先 | 窓口の文面 | 件名 | 送信（JST） |
| --- | --- | --- | --- | --- |
| MacRumors | tips@macrumors.com | contact ページに *Please send any product information for consideration for coverage directly to our editorial team*（tips@ と share.php を案内）＝**製品情報の受付が明記されている** | Product info: Simple Memo adds Dialogue Memo, which asks follow-up questions using Apple Intelligence | 13:38 |
| 9to5Mac | tips@9to5mac.com | contact ページに *For news tips, email the newsroom at tips@9to5mac.com*（ニュースのタレコミ用。アプリ紹介の受付は明記なし） | Tip: Simple Memo adds Dialogue Memo, a note that asks follow-up questions with Apple Intelligence | 13:39 |
| iDownloadBlog | tips@idownloadblog.com | contact ページに *News tips: tips@idownloadblog.com*（同上） | Tip: iPhone capture app Simple Memo adds Dialogue Memo (Apple Intelligence) | 13:40 |

- **話題は「対話メモ（Dialogue Memo）」。**事実は App Store の公開情報（iTunes Lookup の `description` と `releaseNotes`、2026-09-23 取得）だけから書いた：
  「未完成の考えを話し、音声の短い追加質問に答えて読めるメモにする」「質問とメモの整理は iPhone 上の Apple Intelligence を使う（ストアの記載どおりと明記）」
  「iOS 26 以降・Apple Intelligence が有効な対応 iPhone・対応言語モデルが必要」「通常の入力と音声入力はそのまま使える」。
  PR TIMES の未公開リリース（9/24 08:30）の文面は使っていない。
- ほかの事実：1タップで自分宛てに送信（英語サイトの表記）、Apple Watch・Siri ショートカット、Markdown で選んだフォルダ（Obsidian の vault など）へ追記、
  無料は1日3通・Premium $2.99/月・$29.99/年・無料体験なし（`data/site-constants.json`、価格は 2026-09-22 にオーナー確認）、
  Captio のワークフローに着想を得た独立アプリ（Captio のサービス終了は 2024年10月、captio.co の告知）、SMTP 配送なので E2E 暗号化ではない。
- **バージョン番号と評価は書いていない。**起動速度（0.40秒）も今回は入れていない。
- 送信前に、差出人 `Simple Memo <support@simplememofast.com>`・宛先1件・件名・本文を読み戻し、実名・バージョン番号が無いことを確かめた。3件とも送信済みフォルダで確認した。
- 3媒体とも Gmail の送信済みに過去の連絡は無い（5月の1件は社内メモで無関係）。「返信不要」と書いた。**掲載の確約ではない。**

## 5.17 台帳の外で出ていた掲載申請2件を発見・実測（2026-09-23 夜）

週刊ニュースレター **This Week in Obsidian** の README が、情報提供を GitHub の issue テンプレートで受け付けている
（Name / Link / Why is it useful? / 「作者か関係者か」の4欄）。Simple Memo を出す前に重複を確かめたところ、
**同じ窓口を simplememofast 名義で 2026-09-06 に使っていて、既に掲載されていた。**この台帳には記録が無かった。

そこで GitHub で `author:simplememofast -user:simplememofast`（自社リポジトリ以外で simplememofast が立てた issue / PR）を検索し、
全件を台帳と突き合わせた。**9件のうち7件は記録済み**（§6.5 の awesome 系6件、§1 の awesome-obsidian #10）。
**残る2件が記録漏れ**だった。同じ条件で「コメントだけした issue / PR」も検索したが0件。

| 窓口 | 提出（simplememofast 名義） | 掲載 | 自社リンク | リンク属性（2026-09-23 実測） |
| --- | --- | --- | --- | --- |
| This Week in Obsidian（Substack） | 2026-09-06 09:06 JST、提案 issue [z08-studio/this-week-in-obsidian#8](https://github.com/z08-studio/this-week-in-obsidian/issues/8)。公式テンプレートで、「作者か関係者か」は Yes | [#38](https://thisweekinobsidian.substack.com/p/this-week-in-obsidian-38)（2026-09-08 19:29 JST 公開）の Community Discussions に `[Show]` として掲載。メンテナが掲載 URL を付けて issue を閉じた | `https://simplememofast.com/en/resources/obsidian-inbox/` | Substack 本文：サーバーが返す HTML の `<a>` に **rel なし（dofollow）**、meta robots・X-Robots-Tag なし。GitHub の issue 本文とアーカイブの .md は nofollow |
| Swift Package Index | 2026-09-06、PackageList#15105（パッケージ追加の定型 issue。自動 PR の作成は 20:04 JST） | 自動 PR #15107 が 2026-09-07 15:14 JST にマージ。[パッケージページ](https://swiftpackageindex.com/simplememofast/ios26-speechanalyzer-live-mic)が公開中 | README 内の `https://simplememofast.com/voice-input/` | **nofollow**。README 部分は後から読み込まれ、初回 HTML には無い。meta robots なし |

- **誰が出したかは、このリポジトリからは分からない。**同じ日に Codex のブランチ（`codex/add-inbox-generator`）から
  awesome-obsidian #10 が出ているので、同じ作業の一部と見られる。ただし確認はしていない。
- **This Week in Obsidian に、アプリ本体の2件目は出さない。**理由は3つ。
  1. 同じ参照ドメイン（`thisweekinobsidian.substack.com`）から、すでに dofollow のリンクがある。2件目では参照ドメインが増えない。
  2. 前回は「無料・登録不要のブラウザツールで、アプリとは独立して使える」として出して採用された。2週間あまりで同じ名義から
     有料アプリの自薦を続けると、個人運営の媒体に宣伝と受け取られかねない。本当に伝える価値のある話題が出たときに窓口を失う。
  3. 出し直す条件：Obsidian 利用者に直接効く変更（vault への書き込み方式など）が公開され、前回から1か月以上空いたときに1件だけ。
  4. **2026-09-23 夜、オーナーも「出さない」を選んだ**（選択肢で確認）。
- 同じ検索で、§6.5 の awesome 系6件が**すべて Open のまま、メンテナの反応が無い**（最後の動きは 2026-09-19 の提出）ことも確かめた。
  こちらから催促はしない（毎週の掲載確認タスクで見ている）。
- **AlternativeTo**（オーナー判断待ち #3）：2026-09-23 夜、alternativeto.net は開けるようになっていた（昼は Chrome の権限で拒否されていた）。
  ただし Mac の Chrome は**未ログイン**。代替一覧の件数表示は10件（昼は5件と記録。増えたのか数え方の違いかは未確認）で、**経費精算の Captio が先頭**（3 likes）。そのカードには
  2026-07-01 付けで利用者の否定コメント（*This is not the correct Captio app.*）が付いている。
  外すにはログインが要るので、オーナーのログイン待ちのまま。

## 5.18 Memo Inbox を awesome-no-login-web-apps へ提出（2026-09-23 夜、オーナー了承のうえ PR #612）

§5.17 のあと、登録不要のブラウザツール（Memo Inbox）に合う「受付が明記された」一覧を探した。

- **[aviaryan/awesome-no-login-web-apps](https://github.com/aviaryan/awesome-no-login-web-apps)**：ログイン不要で使える Web アプリの一覧。
  CONTRIBUTING に追加の書き方（節の末尾に足す・長所と大きな短所を書く・文末はピリオド）があり、PR テンプレートもある。
  2026-09-08 にメンテナが外部からの追加 PR を**少なくとも29件**まとめてマージしている（直近50コミットの浅い clone で数えた下限）＝**活動中で自薦を受け付けている**。
  一方で、アプリが実際に動かない PR は理由を書いて閉じている（例：ドメインが売りに出ていた #547）。
- 追加先は **Notepads and Notebooks** の末尾。重複なし（`memo` で PR を検索して該当なし）。公開アプリは 200 を返し、
  読み込むスクリプトは自前の `app.*.js` と JSON-LD だけ（Google Analytics なし）であることを確かめた。
- 用意した1行（事実は `simplememofast/memo-inbox` の README から。短所の「同期なし・バックアップが要る」も書いた）：

  ```
  * [Memo Inbox](https://simplememofast.com/memo-inbox/) - Open-source (MIT) note inbox that runs entirely in the browser, with tags, search, trash and Markdown ZIP export. Notes stay in this browser's local storage with no sync, so export a backup regularly.
  ```

- **経緯：**フォーク（`simplememofast/awesome-no-login-web-apps`）を作ったところで、変更した README をフォークへ上げる操作が
  実行環境の権限確認（公開の場を新しく作る操作）で止められた。回避はせず、オーナーに選択肢で確認した。
  **2026-09-23 夜、オーナーが「出す」を選んだ**ので、同じ1行で提出した。
- **提出：[aviaryan/awesome-no-login-web-apps#612](https://github.com/aviaryan/awesome-no-login-web-apps/pull/612)**
  （2026-09-23 21:54 JST、`Add Memo Inbox`）。差分は `1 addition & 0 deletions`。本文は PR テンプレートどおり
  （アプリの URL・説明・3項目のチェック）。「Memo Inbox の保守者（Simple Memo Developer）である」と明記し、
  合わなければ閉じてよいと書いた。送信前に、ログイン名（simplememofast）・タイトル・本文・提出先（上流リポジトリ）を読み戻し、
  実名が無いことを確かめた。
- リンクの価値：GitHub 上のリンクなので **nofollow**（PR 本文のリンクで実測。README に載っても同じ）。
  主な効果は一覧を見る人に知ってもらうこと。**掲載の確約ではない。**

同じ時間帯に確かめたこと：

- **SourceForge / alternative.me（GPT に依頼中）**：20:50 ごろ（JST）の時点で、`/projects/memo-inbox/` と `/u/simplememofast/` は 404、
  alternative.me の検索は0件。まだ公開されていない。
- **awesome 系ミラーへの波及（§1 の「後日確認」）**：trackawesomelist.com は awesome-obsidian/awesome-obsidian を追跡しておらず 404。
  awesome.ecosyste.ms はボット確認の画面が出たので、回避せずに打ち切った。**ミラー経由のリンクは確認できていない。**
- **OpenAlternative**（オープンソースの代替ソフト一覧。Memo Inbox の候補）：`/submit` はサインイン画面へ転送される＝アカウントが要る。
  こちらはアカウントを作らないので見送り。出すならオーナーがアカウントを作る（§6 の候補と同じ扱い）。
- **媒体からの返信**：21:58 JST に Gmail（support@ 宛て・直近1日）を確認。新しい返信は無し（美崎様の1件は対応済み。ほかは自動受付・ニュースレター・Product Hunt のフォーラム通知）。

## 6. 次に登録すべき候補（今回消化できなかったもの）

優先度順。すべて無料・自薦可のものだけを残し、有料掲載専用・相互リンク必須・
自動生成型ディレクトリは外した。

1. **G2** — 人がビジネスメールで myG2 に登録すれば無料プロフィール申請が通る。DR最大。
2. **Indie Hackers Products DB** — アカウント制限の解除だけ。既にログイン済み。
3. ~~Launching Next~~ — **2026-09-19 送信済**（受付番号 152234、無料枠は待ち約4か月）。
4. **Uneed / MicroLaunch / Fazier / Peerlist / DevHunt / BetaList** — 無料枠あり。各アカウント作成が必要。
5. ~~tehtbl/awesome-note-taking~~ — **2026-09-19 にPR提出済**（#144）。以下も同日提出：
   awesome-knowledge-management #83 / awesome-obsidian(kmaasrud) #135 /
   awesome-second-brain #1 / awesome-productivity #386 / awesome-pkm #23。
   次にやることは**レビュー対応だけ**で、こちらから追加で送るものは無い。

6. **kmaasrud/awesome-obsidian**（External Tools › Other）— GitHubリポジトリ形式の表なので、
   iOSアプリ本体ではなく MIT ライセンスの `simplememofast/memo-inbox` を出す方が体裁に合う。
7. **doanhthong/awesome-pkm** / **brettkromkamp/awesome-knowledge-management** — どちらも
   Simple Memo 未掲載。PR受付中。
8. **すまほん!!（JA-012）** — レビュー依頼フォームあり。ただし送信は「営業送信」に当たるため
   別途承認が必要（本リポジトリの既存ポリシー）。

**除外した候補と理由：** Tool Finder（$29の有料掲載のみ）／Capterra・GetApp・Software Advice
（個人向け生産性アプリを掲載基準で除外）／Softpedia（Windows/Mac/Linux配布ソフトのみ）／
StartupRanking（相互リンクのバッジ設置が実質必須）／PreApps（$3,000〜の有料）。

## 6.5 awesome系リストへの提出（2026-09-19 追加分）

GitHub の awesome 系リストは、登録フォームこそ無いが**PRという定型の掲載申請窓口**を持ち、
自薦を明示的に受け付けている。今回はこれを「簡単な掲載申請」として処理した。

| リスト | スター | 提出先の節 | PR | 備考 |
| --- | ---: | --- | --- | --- |
| tehtbl/awesome-note-taking | — | Proprietary | [#144](https://github.com/tehtbl/awesome-note-taking/pull/144) | 100+アプリの現行リスト。`Save` と `Simplenote` の間 |
| brettkromkamp/awesome-knowledge-management | 845 | Platforms, Applications and Tools | [#83](https://github.com/brettkromkamp/awesome-knowledge-management/pull/83) | 追加頻度が高い。ガイドライン通り節の末尾へ |
| kmaasrud/awesome-obsidian | 9.3k | External Tools › Other | [#135](https://github.com/kmaasrud/awesome-obsidian/pull/135) | 未処理PR46件。表の他行は全てGitHubリポジトリなので体裁が浮く旨をPRで自己申告 |
| pjpoulose/awesome-second-brain | — | Note-Taking & PKM Apps | [#1](https://github.com/pjpoulose/awesome-second-brain/pull/1) | 同リポジトリ初のPR。1文・130字以内・タグ指定を遵守 |
| jyguyomarch/awesome-productivity | — | Tools and Apps › Note Management | [#386](https://github.com/jyguyomarch/awesome-productivity/pull/386) | 節の末尾へ |
| doanhthong/awesome-pkm | 108 | Note-taking Tools › SaaS with free plan | [#23](https://github.com/doanhthong/awesome-pkm/pull/23) | 未処理PR9件 |
| aviaryan/awesome-no-login-web-apps（**Memo Inbox**、2026-09-23 追加） | — | Notepads and Notebooks | [#612](https://github.com/aviaryan/awesome-no-login-web-apps/pull/612) | 登録不要の Web アプリ一覧。§5.18 |

守ったこと：

- **1リスト1行、1PR。**差分は必ず `1 file changed / 1 insertion` に収めた。
- 各リストの CONTRIBUTING を読み、配置（末尾か辞書順か）・書式・タグ・アイコンを合わせた。
- **本文で「開発者本人である」と明記**し、方針に合わなければ閉じてよいと書いた。
- 誇張しない。kmaasrud では `rel` ではなくアイコンの話として、**E2EEではない**ことを理由に
  🔒 を付けない判断を明示した。awesome-note-taking では同様に 🔁（同期）も付けていない。
- awesome-privacy への提出は**見送った**。同リストは「プロジェクトのWebサイトにユーザー追跡が無いこと」を
  条件にしており、`simplememofast.com` のトップページには Google Analytics（`G-EPZVZKCVQG`）が入っている。
  `/memo-inbox/` 配下だけは第三者スクリプトが1本も無いことを確認したが、サイト全体としては条件を
  満たさないため、条件を満たすふりをして出すことはしない。

## 6.6 既存アカウントのプロフィール整備（2026-09-19）

新規アカウントが作れない制約の下でも、**既にログインが残っているサービスのプロフィールを
埋めることで参照ドメインは増やせる。**今回それで1件増えた。

| サービス | 状態 | 結果 |
| --- | --- | --- |
| Obsidian公式フォーラム | Web Site 欄が空だった | `https://simplememofast.com/` と所在地を登録。**公開プロフィールに実リンクが出たことを確認**（`rel="noopener nofollow ugc"`） |
| GitHub | リンクは既にあった | 表示名が `Simple Memo Faset - Captio-style`（**誤字＋旧ブランド**）だったので `Simple Memo - for Obsidian` に修正。bio と所在地も追加 |
| Product Hunt | 既にリンク済み | Website / App Store / LinkedIn / Twitter が揃っている。追加不要 |
| note | 既にリンク済み | 追加不要 |
| Indie Hackers | 到達不能（2026-09-19 時点） | `/settings` が Not found、`/<user>` はリダイレクトループ。products 作成不可と同じ制限と見られる。**→ 2026-09-22 に到達方法が判明（下記）** |

GitHub の表示名修正は副次的だが効く —— **本日出した awesome系6件のPRすべてに、
この名前が投稿者名として並ぶ。**誤字のまま6リストのメンテナに見せずに済んだ。

### 追記（2026-09-22）Indie Hackers は埋められたが、**SEO 的には無価値**だった

到達できなかったのは URL の推測が違っていただけだった。正しい経路は
**ヘッダーのアバター → SETTINGS → `/<user>/settings`、編集は `/<user>/editing`**。
アカウントは `memolife23` でログイン済み。

`NAME` と `BIO` がどちらも空だったので、**SimpleMemo Developer** と、
アプリの説明＋`https://simplememofast.com/` を入れて保存した（`?saved=profile` を確認）。

**ただし公開プロフィールは `<meta name="robots" content="noindex">` だった。**
さらに、保存した bio が公開ページに描画されていない（表示されるのはユーザー名・アバター・
最近のコメントのみ）。**参照ドメインとしては数えられない。**

`Social Links` セクションを足す導線もあるが、ページ自体が noindex なので**足さなかった**。

**ここから得た手順**：プロフィール欄を埋めに行く前に、まず公開ページの
`meta robots` とリンクの `rel` を実測する。noindex なら埋める価値は
（SEO 目的では）無い。forum.obsidian.md は index されていたから効いた。

### 出さなかった候補

- **fhoehl/awesome-zettelkasten** — `Apps` 節に Napkin のようなキャプチャ系も並んでおり枠としては
  入りうるが、Simple Memo はノートを保存も連結もしない。**適合が弱いので出さない。**
  小さなキュレーションリストに筋の悪いPRを出すのは、件数より損になる。
- **awesome-privacy** — §6.5 に記載の理由（サイト全体に Google Analytics）。
- **BubuAnabelas/awesome-markdown（957スター）** — `Tools › Miscellaneous` 節は
  「Markdown Tables Generator」のような**単機能のWebツール**を 🌐 付きで載せており、
  `/resources/obsidian-inbox/`（登録不要・ブラウザ内完結・無料のMarkdown生成ツール）は
  内容として適合する。1行の差分も用意した。
  **それでも出さなかった。最終コミットが3年前、未処理PRが71件**で、実質メンテナンスが
  止まっているため。死んだリストの待ち行列を1本伸ばしても被リンクにはならない。
  リストが再開したら出す（差分：`mdformat` の次、`remark` の前にアルファベット順で1行）。

### 実装上のつまずき 2 — ボット対策と安全分類の切り分け

窓口が「開いている」ことと「自動で送信できる」ことは別物だった。今回の2種類の壁は性質が違う。

1. **reCAPTCHA v3（すまほん!!）** — 不可視のスコア判定。ページ自身がトークンを発行するため
   画面上に解くべき課題は出ないが、スコアが低ければサーバ側が `spam` として捨てる。
   **これはボット検知なので回避しない。** 判定されたら BLOCKED として記録して次へ進む。
2. **実行環境の安全分類** — 掲載依頼フォームの送信そのものが `Real-World Transactions` として
   保留された。こちらは技術的な壁ではなく権限の問題で、**利用者の明示承認があれば解ける**。

次回は、窓口確認（WebFetch で可）と本文作成までを先に全件まとめて終わらせ、
送信だけを最後に一括で承認してもらう順序にすると手戻りが少ない。

## 7. 未解決の課題

> **2026-09-23 の整理：** 解消済みの項目は取り消し線を付けて残し、新しく見つかった課題は末尾に足した。
> いま人の判断が要るものは末尾の「オーナー判断待ち（2026-09-23 時点）」にまとめてある。

- ~~**`simplememofast-ops` を読めていない。**~~ **2026-09-23 に解消。** 非公開リポジトリ
  `simplememofast/simplememo-ops` の `drafts/TODO-seo-next-actions.md`（2026-03-21）をブラウザ経由で読み、
  各項目の現況を §5.12 にまとめた。March 版のピッチ文面は現在の事実と合わない数値を含む可能性があるので再利用しない。
- **Product Hunt の未投稿ローンチ下書きが1件残っている。** 投稿するか消すかは人の判断。
- **NoteApps.info の提案は2026-03に立てられたまま "Under consideration"。** 今回の訂正コメントは
  2026-09-23 時点でも承認待ち。承認されても索引入りは別判断。
- ~~**窓口を確認済みの5媒体への送信が保留中。**~~ **2026-09-22 に送信済み（§5.8）。**
  ただし先行4件は実名入り（identity policy 違反）で、訂正連絡は出さないとオーナーが決めた（下記）。
- **すまほん!! は reCAPTCHA v3 で自動送信できない。** 本文は
  `docs/seo/media-pitch-drafts-2026-09-19.md` にあるので、人が手で送れば通る可能性が高い。
- ~~**CodeZine（403）と Publickey（404）は窓口の所在が未確認。**~~ **解消（§5.11）。** CodeZine は応募済み、
  Publickey はプレスリリース用アドレスを確認（送るかは人の判断・下記）。
- ~~**`ASSET_MISSING` 29件は制作判断が必要。**~~ **2026-09-23 に判断済み（§5.12）。**
  `ASSET_REQUIRED` 51件のうち2件は資料なしで送れる窓口だったので送信、残り49件に `asset_decision` を付けた。
  今すぐ作る価値がある資料は無い、という結論。
- ~~**`data/site-constants.json` がストアとずれている。**~~ **2026-09-20 に解消済み。**
  2026-09-19 時点では version 5.8.9 / 評価 4.2・25件で実態（5.8.66 / 4.12・26件）とずれていたが、
  2026-09-22 に再確認したところ `appVersion` 5.8.66・`ratingValue` 4.1・`ratingCount` 26 に
  同期されており、ストアの値と一致している。
- ~~**代わりに `llms.txt` の「Current facts (as of …)」が期限切れになった（2026-09-22 から）。**~~ **同日解消（下の項目と §5.10）。**
  `scripts/seo-check.js` が警告を出す（errors 0 / warnings 1）。
  **CI は落ちない**（`.github/workflows/seo-check.yml` は「Exit code 1 = warnings only (acceptable)」
  として exit 1 を許容し、2以上だけで落とす）ので、PRのマージは止まらない。
  原因は価格で、`stampDate()` が `appVersionNote` / `ratingNote` / `priceNote` の
  **最も古い検証日**を採るため、`priceNote` の 2026-08-22 が全体を引っ張っている。
  バージョンと評価は 2026-09-20 に機械検証済みだが、**アプリ内課金の価格は iTunes Lookup では
  取得できず、所有者が確認するしかない**。日付だけ進めるのは検証の捏造になるのでやらない。
  → **人が ¥500 / ¥5,000 が現行であることを確認し、`priceNote` の日付を更新してから
  `node scripts/sync_constants.js --write` を実行する**、が正しい直し方。
- ~~**Mac Fan に送るなら電話番号を公開するか決める必要がある。**~~ **解消（§5.10）。**
  2026-09-22 にメール窓口 `mnp-macfan-release@mynavi.jp` へ送信済み（§5.9）で、
  同日オーナーの指示により**会社の電話番号 050-1793-7505 をサイトに公開した**ので、
  電話番号必須のフォーム（Mac Fan ほか）も今後は使える。
- ~~**さくらのナレッジの著者募集が最有力。**~~ **2026-09-22 に応募メールを送信済み（§5.9）。**
  自社への言及が許容されていて資産も揃っているため、返信が来た場合の優先度は依然として最も高い。
  返信が無ければ追わない（本文にもその旨を書いてある）。
- **送信済みの返信待ち。** 候補JSON上で SUBMITTED 12・SUBMITTED_EMAIL 6（計18件、2026-09-23 の Publickey を含む）に、英語の MakeUseOf 1件と、
  2026-09-23 午後に送った英語圏 Apple 系メディア3件（MacRumors / 9to5Mac / iDownloadBlog、§5.16）。
  **いずれも掲載の確約ではない。** 2026-09-23 時点で届いているのは自動受付の返信だけで、人からの返信は0件。
  掲載を確認できるまで `PUBLISHED` には上げない。週次の掲載確認タスクが Gmail とこの台帳を見て追う。
- ~~**`llms.txt` の「Current facts」が期限切れ。**~~ **2026-09-22 に解消（§5.10）。**
  オーナーが ¥500 / ¥5,000 が現行であることを確認したため `priceNote` の日付を更新し、
  `node scripts/sync_constants.js --write` を実行した。`seo-check` は **0 errors / 0 warnings**。
- ~~**`WINDOW_UNVERIFIED` 16件は窓口の所在が分からないまま。**~~ **0件になった（§5.11 で10件、§5.12 で残り10件を確定）。**
  明示的な受付のある窓口は無く、送信対象は増えなかった。
- **英語圏ディレクトリは、人がアカウントを1回作るかどうかの判断待ち（§5.11）。**
  主要ディレクトリはすべてアカウント必須で、このセッションからは登録できない。
  作ってもらえれば、あとの入力・説明文・カテゴリ選択はこちらで進められる。
  費用対効果が高い順に SourceForge / alternative.me / OpenAlternative / F6S。
- **CodeZine の寄稿が通った場合、2000字以上の技術記事を書く必要がある。**
  題材は計測手法（公開済みの `/blog/benchmark-methodology` が下地）で、新規取材は不要。
  返信が来てから着手すればよい。
- **先行して送った4件に開発者個人の実名が入っている（identity policy 違反）。**
  5件目（Macお宝鑑定団）は修正後なので問題ない。 ~~訂正連絡を出すかどうかの判断が要る。~~
  **2026-09-22 にオーナーが「訂正連絡は出さない」と決めた。**
  下書き側は修正済みで、以後の送信では `SimpleMemo Developer` / `AI ATAKA` のみを使う（2026-09-23 の8件も準拠）。
- **気になる、記になる… の窓口は公開コメント欄だった。** 公開投稿になるので送っていない。
  送るかどうかは人の判断。
- **週次の掲載確認タスクは動いている。** 2026-09-21 の定期実行は4秒で FAILED だったが、
  2026-09-22 10:29 の手動発火は `SUCCEEDED`（10:44 終了・約15分）。一過性だった。
  2026-09-23 に指示文を更新し、確認対象に CodeZine と 2026-09-23 の8件、Captio の事実の書き方、
  Codex 依頼の進捗確認を足した（次回は 2026-09-28 の 09:00 JST 頃、承認不要で実行される設定）。
- ~~**`data/routine-runs.json` の整合は Codex へ回した**（`docs/codex-request-routine-runs-2026-09-22.md`）。~~
  **Codex 側の #1537 で解消済み。** 2026-09-23 に `node scripts/check-routine-runs.mjs --check` が緑（exit 0）であることを確認した
  （個別GETが404の停止済みタスクについての注意書きは残る）。
- **AlternativeTo の Simple Memo の代替一覧に、経費精算アプリの Captio が載っている（§5.12）。**
  `simplememo` アカウントが約7か月前に追加したもの。外すにはログインが要るのでオーナー作業。
- **Captio の App Store 撤退時期の誤記（サイト13ファイル）と、ストア検査が CDN の古い応答で 5.9.9 を見落とす件は
  Codex へ回した**（`docs/codex-request-captio-dates-and-store-facts-2026-09-23.md` 依頼A・B）。この台帳の §4 事実表は直した。
- **CI が 2026-09-23 09:00 JST から赤い（`Corporate obligations`・§5.12）。**全PRの自動マージが止まる。
  規約の読み直し（法的判断）が要るので同じ依頼文の依頼C（最優先）に回した。オーナー判断待ち表の #11。
- **`ASSET_REQUIRED` の `DEFER_BUILDABLE` 5件（記入例・運用図・テンプレート・シート）は、窓口が見つかれば工数Sで作れる。**
  送り先が無い今は作らない。ページ単体でサイトに置く価値があると判断した場合は別途。

### オーナー判断待ち（2026-09-23 時点）

| # | 事項 | こちらでできないこと・理由 | 判断してもらえれば、こちらで進められること |
| --- | --- | --- | --- |
| 1 | ~~英語圏ディレクトリのアカウント作成~~ → **2026-09-23 判断：SourceForge と alternative.me の2つだけオーナーが作る**（§5.13）→ 同日、**SourceForge は GPT に依頼**（依頼文を渡した）。**alternative.me は未登録**（オーナーの「登録済み」は AlternativeTo のことだった）→ 同日、**登録すると判断**し、GPT への依頼文を渡した（外部リンクは nofollow で価値は小さいことは説明済み） | アカウント作成は行わない | SourceForge は公開されたら §1 の行でリンク属性を実測する（毎週の掲載確認タスクにも入れた） |
| 2 | G2・Uneed などアカウント必須の登録（~~Indie Hackers の制限解除~~ → 2026-09-23 不要と判明。`SimpleMemo` 名義の製品ページが既にある。ただし noindex、§5.15） | 同上 | 同上 |
| 3 | AlternativeTo の代替一覧から経費精算 Captio を外す（2026-09-23 時点でまだ載っている）→ **2026-09-23 判断：オーナーが Mac の Chrome でログインし、操作はこちらで行う** | ログイン（パスワード入力）を行わない。**2026-09-23 夜：サイトは開けるようになったが、Mac の Chrome は未ログインだった。オーナーは「あとでログインする」を選んだ** | ログインを確認したら外し、公開ページで外れたことを確かめる |
| 4 | ~~すまほん!! へ手動送信~~ → **2026-09-23 判断：オーナーが手で送る**（本文は渡した） | reCAPTCHA は回避しない | 送信日を受け取ったら JA-012 を更新 |
| 5 | 気になる、記になる… の公開コメント欄へ投稿するか | 公開投稿は人の判断 | 文面の用意 |
| 6 | ~~受付方針の記載が無い窓口へ送るか~~ → **2026-09-23 判断：keinolog と Publickey の2件だけ**。Publickey は送信済み、keinolog はサーバー側 403 で `BLOCKED`（§5.13）。残る13件は送らない | — | — |
| 7 | Zapier Blog へのゲスト寄稿 | 「AI生成の文章は不可」が条件 | 企画の骨子づくり（本文は本人） |
| 8 | Product Hunt の未投稿下書き（投稿か削除か） | 削除は行わない | 投稿文面の見直し |
| 9 | Gmail の既定の差出人を `support@simplememofast.com` にするか | アカウント設定の変更は行わない | — （今は毎回手で切り替えて読み戻している） |
| 10 | Gmail に残る体裁の崩れた CoRRiENTE 宛て旧下書き1通 | 削除は行わない | — |
| 11 | **CI の赤（`Corporate obligations`）** —— apple / google_cloud / firebase / registrar の16マス → **2026-09-23 判断：Codex に依頼C を渡す** | 条項の判定は法的判断の欄で、この作業の範囲外 | 解けたら PR #1541 をリベースで最新化して再検証する |
| 12 | 美崎様向けオファーコードの上限（500） | ASC の操作はサインインが要る | オファーは**最初の1年間無料**・新規登録者のみ。記事などで共有されると、最大500人が1年間無料になる。意図していなければ、引き換えを確認したあと ASC の「無効化」で新しい引き換えを止められる（引き換え済みの分への影響は未確認）。止めるかどうかはオーナーが判断する（§5.14） |
| 13 | ~~美崎様へのメールの訂正（「1か月無料・請求なし」と送ったが、実際は1年無料・自動更新は未確認）~~ → **2026-09-23 判断：訂正しない** | — | 残るリスク：自動更新する設定なら、2027年9月ごろに請求が始まる（§5.14） |
| 14 | ~~Memo Inbox を awesome-no-login-web-apps へ PR で出すか~~ → **2026-09-23 判断：出す** → 同日 [#612](https://github.com/aviaryan/awesome-no-login-web-apps/pull/612) を提出（§5.18） | — | 審査の結果を毎週の掲載確認で見る |
