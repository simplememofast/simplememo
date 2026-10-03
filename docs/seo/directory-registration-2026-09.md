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
| 追加 | iOS Dev Directory（Dev Log） | SUBMISSION | **PUBLISHED** | 2026-09-23 | **2026-09-24 18:19 JST マージ**（メンテナ：「feed_url を足したのでマージする」）→ 一覧に掲載 | **dofollow**：Company Blogs の「Simple Memo Dev Log」→ `https://simplememofast.com/en/devlog/`（2026-09-24 実測。DOM では `rel="noopener"` のみ、サーバーの HTML は rel なし＝9/23 実測）。同じ行にフィードと GitHub へのリンク | https://iosdevdirectory.com/#companies-en （PR https://github.com/iOSDevDirectory/iOSDevDirectory/pull/1432 ） | — | iOS Feeds がフィードを読み始めたか、SwiftLee などの巡回に載るかを見る（§5.28） |
| 追加 | Indie Dev Monday（Look at me 欄） | SUBMISSION | SUBMITTED_EMAIL | 2026-09-23 | no | pending（号内リンクは大半が rel なし＝dofollow） | https://indiedevmonday.com/ | 採用は編集者次第。返事は来ないこともある | 新しい号（https://indiedevmonday.com/issues ）に載ったかを見る。催促しない（§5.19） |
| 候補 | Uneed / Microlaunch / Fazier | SELF_REGISTER | 未登録（GPT 依頼文を用意） | — | — | 3つとも公開ページの「Visit website」が **dofollow**（2026-09-23 実測） | https://www.uneed.best/ ・ https://microlaunch.net/ ・ https://fazier.com/ | アカウント作成が要る（こちらでは作らない） | オーナーが GPT に依頼文を渡す（オーナー判断待ち #15） |
| 追加 | SaaSHub（Memo Inbox） | SELF_REGISTER | SUBMITTED | 2026-09-19 | no | pending | https://www.saashub.com/memo-inbox （承認後） | 無料枠のため最大32日待ち | 承認後にロゴ・価格・詳細説明を追記 |
| 追加 | Indie Hackers Products DB | SELF_REGISTER | ALREADY_EXISTS（2026-09-23 確認） | — | yes | **nofollow**（`rel="nofollow noopener"`）・ページは **`noindex`** | https://www.indiehackers.com/product/simple-memo | `memolife23` では作れないが、**別アカウント `SimpleMemo` 名義のページが既にある**（作成日は未確認） | 参照ドメインには数えない（noindex）。重複ページは作らない。制限解除の問い合わせも不要になった |
| 追加 | alternative.me（Simple Memo） | SELF_REGISTER | **未登録**（2026-09-23） | — | — | — | https://alternative.me/ | 2026-09-23 にオーナーが「登録済み」と答えたのは **AlternativeTo（alternativeto.net）のことだった**（スクリーンショットで確認）。alternative.me は別サイトで、公開検索（`/api/search?q=simple%20memo`）は0件。同サイトの外部リンクは `rel="nofollow"`（`/captio` で実測）、ソフトの項目は薄く Obsidian も無い | **2026-09-23 オーナー判断：登録する。**アカウント作成と入力は外部の GPT エージェントに依頼（依頼文を渡した：名乗り・有料不可・CAPTCHA は人・代替は Apple Notes と Google Keep だけ・Captio は紐づけない）。公開されたら `rel`・`meta robots` を実測 |
| 追加 | SourceForge（Memo Inbox） | SELF_REGISTER | **外部エージェントに依頼中**（2026-09-23、オーナーが GPT に依頼） | — | — | — | https://sourceforge.net/projects/memo-inbox/ （予定。取れなければ `memoinbox` など） | アカウント作成はこちらでは行わない。依頼文は §5.13 の入力値に、名乗り・有料不可・CAPTCHA は人・GitHub 連携（OAuth）は使わない、を加えたもの | 報告を受けたら公開ページの `rel`・`meta robots` を実測（`curl` は 403 になるのでブラウザで見る） |
| 追加 | PR TIMES（「対話メモ」提供開始のリリース） | PRESS_RELEASE | **PUBLISHED**（所有者の作業） | 2026-09-23 予約 | **2026-09-24 09:12 公開**（ページの表示。予約は 08:30 だった） | あり（**nofollow**）：本文4本（`nofollow ugc noopener`×3・`nofollow noopener noreferrer`×1、`/obsidian/` と `/`）＋会社概要1本（`noopener noreferrer nofollow`）。ページは `index,follow`、X-Robots-Tag なし、canonical は自分自身（2026-09-24 10:30 台に実測） | https://prtimes.jp/main/html/rd/p/000000011.000182412.html | — | 転載先は 10:30 台の時点で未確認（§5.15 追記）。BCN＋R・CLASSY・ウレぴあ総研に載ったら rel を実測する **→ 9/24 夜：財経新聞（`zaikei.co.jp/releases/3626774/`）への転載を確認。サイトへの3本と App Store へのリンクはすべて `nofollow ugc noopener`、robots 指定なし。NEWSRELEA.SE（`newsrelea.se/MLOYa6`）の原文転載も同じく全部 nofollow（§5.28）。9/25：ASCII STARTUP（`ascii.jp/elem/000/004/436/4436722/`、9/24 09:12:51）も原文転載で、ページは **`noindex`**、サイトへの3本・App Store への4本はすべて `nofollow ugc noopener`（§5.29）** |
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
| dev.to（2026-09-24 追記・台帳の外の既存リンク） | `/simple_memo` の記事33本のうち16本 | **22本すべて nofollow なし＝dofollow**（サーバーが返す HTML で確認） | `max-snippet:-1, …` のみ（noindex なし） |
| はてなブログ（2026-09-24 追記・台帳の外の既存リンク） | `simplememofast.hatenablog.com` の本文（フィード30件中6件にサイトへのリンク） | **なし＝dofollow**（本文の `<a>` に rel なし） | `max-image-preview:large` のみ |
| WordPress.com（2026-09-24 追記） | `simplememofast.wordpress.com`（記事は 2026-09-06 の1本だけ） | **なし＝dofollow** | 指定なし |
| note（2026-09-24 追記・記事本文） | `/simplememo/n/…` 51本の本文リンク82本 | `noopener nofollow`（**82本すべて**） | `max-image-preview:large` |
| Zenn（2026-09-24 追記） | `zenn.dev/simplememo` の記事12本 | `nofollow noopener noreferrer`（34本すべて） | 指定なし |
| Qiita（2026-09-24 追記） | `qiita.com/simplememo` の記事 | `nofollow noopener` | `max-image-preview:large` |
| Medium（2026-09-24 追記） | `medium.com/@simplememo.com` の記事 | `noopener ugc nofollow` | `index,follow` |
| Hashnode（2026-09-24 追記） | `simplememo.hashnode.dev`（記事0本。他ブログの記事で実測） | `noopener noreferrer nofollow ugc` | — |
| Substack（2026-09-24 追記） | `simplememo.substack.com` の記事（2026-03-27 の1本だけ） | 本文のリンク自体は rel なし | **`noindex`**（記事ページ）→ 効果なし |

**現時点で dofollow が確認できているのは SaaSHub の一覧ページ1本だけ。**
> **2026-09-23 追記：** 台帳の外で 2026-09-06 に出ていた This Week in Obsidian #38（Substack）も dofollow だった（§5.17）。dofollow の確認は**2本**になった。
> **2026-09-24 追記：** 台帳の外で投稿されていた dev.to（`simple_memo`、2026-05-08〜09-18）からのリンク22本も dofollow だった（§5.21）。この作業で得たリンクではないが、dofollow の参照ドメインとしては**3つ目**。
> **2026-09-24 追記（2）：** 自分で記事を出せる投稿先を全部実測した（§5.27）。**dofollow で定期投稿できるのは dev.to とはてなブログの2つだけ**（WordPress.com も dofollow だが1本で止まっている）。note・Zenn・Qiita・Medium・Hashnode は本文のリンクまで nofollow、Substack は記事ページが noindex だった。

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
| JA-050 | さくらのナレッジ | `knowledge-ml@sakura.ad.jp` | 著者募集への応募 | **送信完了** → 10/1 企画が通り、構成案を送った（掲載は12月以降の見込み。§5.45） → 10/2 原稿の下書きを作った（送っていない。事実をコードで確かめてからオーナーに確認してもらう。§5.46） |
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

> **2026-09-24 追記（10:30 JST の自己確認）：**リリースは **09:12 に公開**されていた（ページの表示。予約は 08:30）。
> リリースページのサイトへのリンク5本は**すべて nofollow**（本文4本・会社概要1本）、ページは `index,follow`（§1 の PR TIMES 行）。
> **転載先はまだ見つからない**：Google の過去24時間の検索（`"対話メモ" シンプルメモ`）では、リリースページと PR TIMES 公式の X（@PRTIMES_TECH / @PRTIMES_STUP）の投稿だけ。
> 時事ドットコム（`/jc/article?k=000000011.000182412&g=prt`）とエキサイト（`/news/article/Prtimes_2026-09-24-182412-11/`）は URL の型で直接開いたが、どちらも 404。
> CLASSY の PR TIMES 一覧は先頭がまだ 9/23 の分で、今日のリリースは未取り込み。
> **参考（過去のリリースの転載先を実測）**：
>
> | 転載先（過去のリリース） | サイトへのリンク | ページの robots |
> | --- | --- | --- |
> | CLASSY（`/prtimes/item-110367/`、Obsidian 連携のリリース） | 5本すべて `nofollow ugc noopener` | `max-image-preview:large`（index） |
> | ウレぴあ総研（`/articles/-/3407166`、Siri 送信のリリース） | サーバーが返す HTML にリンクなし | `max-image-preview:large` |
> | BCN＋R（`/news/detail/20260818_652609.html`、同じリリース） | **1本、`rel="noopener"` のみ＝dofollow** | `INDEX,FOLLOW` |
>
> BCN＋R は前回のリリースを当日のうちに記事にしていた。今回も載れば dofollow のリンクが1本増える見込み（載るかどうかは先方次第）。
> 夜の見回り（`trig_01RuicHFnFnh2LgcAcAx7FTE`）で転載先をもう一度探す。**リリース本文の機能・数値はほかの送信文に転記しない**方針は変えない。

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

## 5.19 開発者コミュニティ向けの窓口（2026-09-23 夜、オーナー承認）

オーナーの「他にできること」に対して、**開発者向けの記事（Dev Log と iOS 26 SpeechAnalyzer の2本）**を足場に、
iOS 開発者のニュースレター・一覧を調べた。受付の書き方とリンク属性を実測してから、オーナーに選択肢で確認した。

| 窓口 | 受付（公式の書き方） | リンク属性（2026-09-23 実測） | 結果 |
| --- | --- | --- | --- |
| **iOS Dev Directory**（iOS 開発ブログの一覧） | GitHub の `blogs.json` に PR。会社のブログは「Company Blogs」へ（MAINTAINERS.md が一番多い間違いとして名指し）。**迷ったら載せる方針** | 一覧の外部リンクはサーバーの HTML で rel なし（DOM では `noopener` のみ）＝**dofollow**、meta robots なし | **提出**：[#1432](https://github.com/iOSDevDirectory/iOSDevDirectory/pull/1432)（23:24 JST）。`Simple Memo Dev Log` / 著者 `YURIKA, K.K.` / `https://simplememofast.com/en/devlog/`。6行追加 |
| **Indie Dev Monday**（個人開発者の週刊ニュースレター） | 号内の「Look at me」欄に *Send it to lookatme@indiedevmonday.com*。最新号は #149（2026-08-17） | 号内リンクは18本中14本が rel なし＝**dofollow** | **送信**：support@ から1通（23:26 JST）。件名 *Look at me: Simple Memo adds Dialogue Memo*。送信済みで差出人・宛先を確認 |
| iOS Dev Weekly（Dave Verwer） | 公式のリンク提案フォーム（アカウント不要、*I wrote it* を選べる） | 号内リンクは18本中16本が rel なし | **送らない**（オーナーの選択）。候補だった記事は 9/18 のカスタム語彙記事 |
| iOS Feeds | 登録はしない。**iOS Dev Directory に載ったブログのフィードを読む**とサイトに明記 | 外部リンク 101本中80本が rel なし | フィードが要る → 下の PR #1546 |
| SwiftLee Weekly | 受付なし。**iOS Dev Directory と iOS Feeds を巡回**すると明記 | — | 対象外（一覧経由で見つけてもらう） |
| Fatbobman's Swift Weekly | X での連絡だけ | — | 対象外 |
| iOS Goodies | GitHub の PR | — | 2021-11 で更新が止まっているので対象外 |

- **本文の事実**：Indie Dev Monday へのメールは、§5.16 と同じく App Store の公開情報（iTunes Lookup）とサイトの定数だけで書いた
  （1タップで自分宛てに送信、選んだフォルダ（Obsidian の vault など）へ Markdown で追記、Apple Watch、Dialogue Memo の条件、無料は1日3通・Premium $2.99/月・$29.99/年）。
  **バージョン番号・評価・起動速度は書いていない。**iOS Dev Directory の PR 本文も、Dev Log の各記事の題名にある事柄だけを書いた。
- **RSS フィード（オーナーの選択：こちらで PR を作る）**：[#1546](https://github.com/simplememofast/simplememo/pull/1546)。
  `en/devlog/feed.xml`（Dev Log 5本＋SpeechAnalyzer 2本）と生成器 `scripts/generate_dev_feed.py`（`--check` / `--selftest`）、`_headers` の Content-Type。
  HTML は変えていない。手元では main と同じ検査結果（`seo-check.js` 0件ほか8本）。**main の CI が `Corporate obligations` で赤のままなので、#1546 も止まる。**
  main が直ったら #1546 を最新化（Update branch）→ 再検証が通れば自動マージ → 公開を確かめてから、iOS Dev Directory に `feed_url` を足す PR を出す。
- **アカウントが要る新製品紹介サイト**：Uneed・Microlaunch・Fazier の公開ページを1件ずつ開き、「Visit website」の rel を実測した（3つとも nofollow なし、Uneed と Fazier は `index, follow`、Microlaunch は robots 指定なし）。
  こちらはアカウントを作らないので、GPT に渡す依頼文を用意した（無料枠のみ・有料の順番飛ばしは選ばない・名乗り・CAPTCHA は人）。Peerlist と G2 は今回外した。

## 5.20 開発記事を1本（Foundation Models）—— オーナーが公開を承認し Ready にした（2026-09-24）

§5.19 のあと、オーナーが「開発記事をもう1本」を選んだ。狙いは、開発者向けの経路（iOS Dev Directory → iOS Feeds・iOS Dev Weekly・SwiftLee）に
流せる、**実装の実体験に基づいた記事**を増やすこと。

- **記事**：[#1547](https://github.com/simplememofast/simplememo/pull/1547) `/en/blog/foundation-models-choose-not-write`
  *Let the on-device model choose, not write: a voice follow-up loop with Foundation Models*。英語ブログ一覧の先頭と sitemap にも追加。
- **事実の出どころ**：非公開の iOS リポジトリ（`simplememo-ios` main `a40b270`）の対話メモ実装
  （`DialogueMemoEngine.swift` ほか3ファイル）と、リリース・QA 文書だけ。Chrome のログイン済みセッションで読んだ（書き込みはしていない）。
  主題は「モデルには `@Generable` の enum と文番号しか返させず、見える言葉はすべてコードが書く」設計と、実機テストで見つかった3件
  （繰り返し・注釈・顔文字、言語混在で付いた前置き、Boolean の組み合わせが stop に偏った件）。
- **書かなかったもの**：プロンプトの全文、アプリの版番号、速度・精度などの性能値。数値は実装の定数だけ（最大6問、文脈上限3,600字など）。
  Apple の一次資料9本は、ドキュメントの JSON で実在を確かめた（存在しないパスは 404 になることも確認）。
- **手元の検査**：main と同じ18本の検査がすべて通過（`seo-check.js` 0件）。幅390px・1280pxで横スクロールなし。確認用 PDF をオーナーに渡した。
- **draft にした理由**：非公開の実装の中身を公開することになるので、公開の可否と事実の確認をオーナーに任せる。
  Ready にすれば、main の CI が直ったあとの検証成功で自動マージされる（CI が赤の間は止まる）。公開日を変えるなら日付と sitemap を直す。
- **公開後の予定**：iOS Dev Weekly のリンク提案フォームに出すか判断（前回はオーナーが見送り）。フィード PR #1546 がマージ済みなら
  `EXTRA_PAGES` にこの記事を足してフィードを作り直す。
- **2026-09-24 07時台（JST）：オーナーが確認用 PDF を見て「このまま公開する」を選んだ。**指摘なし・本文の変更なしで Ready に切り替え、
  PR 題名から「（下書き・オーナー確認待ち）」を外した（auto-merge は squash なので、PR 題名がそのまま main のコミット題名になる）。
  Ready に切り替えたことで検証が走り直したが（run 35927524798）、失敗は `Corporate obligations` の1手順だけで、予想どおりマージされていない。
  **まだ公開されていない。**
- **CI で走っていない検査を手元で補った**：CI は `Corporate obligations` で失敗した時点で後ろの約40本を飛ばしており、
  sitemap の検査（`generate_sitemap.py --selftest` / `--check`）も、この PR の CI ではまだ走っていない。PR の head（`34251b6`）そのものを
  別の作業ツリーで検査し、両方とも通った（`208 URLs`・`lastmod が内容履歴と一致`）。
- **公開日のずれに注意**：`generate_sitemap.py` は lastmod を first-parent の**コミット日時（JST）**から出す。PR の検証はマージ用の
  コミット、main ではマージ時の squash コミットが基準になるので、**マージが 9/25 以降にずれたら、その日付で sitemap を作り直さないと
  検証が落ちる。**そのときは本文の `Published:` と JSON-LD の `datePublished` / `dateModified` も実際の公開日に直す（公開前の日付を残さない）。

## 5.21 公開前の点検、台帳の外の既存リンク、窓口の追加調査（2026-09-24 朝）

- **CI が飛ばした検査を手元で実行した（#1547・#1546）**：CI は `Corporate obligations`（139手順のうち98番目）で失敗した時点で、後ろの41本を飛ばしている。
  PR の head（#1547 `34251b6`・#1546 `dd4f76d`）と main（`b33946b`）で、その41本を同じ手順で走らせた。
  **40本は3つとも通過し、残る1本（`Autopilot page vs ledger`）は3つとも同じ内容で失敗した。**
  失敗は `/autopilot/` の自律スコア4項目（合計・vdc・umr・tuc）で、ページが 2026-09-23 時点の値のまま JST の日付が変わったため
  （CLAUDE.md「/autopilot/ の自律スコアは日付で動く」と同じ形）。main で時計だけを 9/23 12時（JST）にすると不一致0件、9/24 12時にすると4件で、
  **日付だけが原因**と確かめた。記事・フィードの変更とは関係がない。
  → **`Corporate obligations` が直っても、それだけでは main は緑にならない。**`/autopilot/` を書き換える #1548（`Codex/decision-observe-*`）か
  日次同期が main に入れば解ける見込み（未確認）。
- **`Corporate obligations` の現状**：Codex の [#1544](https://github.com/simplememofast/simplememo/pull/1544)（draft）の本文によると、規約台帳の16項目は
  **人が条項を確認し終えるまで失敗が続く**（#1544 はその確認を代わりにしないので draft のまま）。
  つまり #1541・#1546・#1547 の自動マージは、オーナー側の規約確認が終わるまで止まる。
- **台帳の外の既存リンク（dev.to）**：`dev.to/simple_memo` の記事33本（2026-05-08〜09-18）のうち16本に、サイトへのリンクが計22本ある。
  サーバーが返す HTML で**22本とも nofollow なし**、ページの robots は `max-snippet:-1, …` だけで noindex は無い。
  リンク先は `/`（7本）・`/obsidian/`（4本）・SpeechAnalyzer の2記事（各4本。この2記事は dev.to 側の正規 URL もサイトを指す）・
  `/en/obsidian/`・`/voice-input/`・`/captio-alternative/`（各1本）。**この投稿はこの作業で行ったものではない**（投稿の運用は別にある）。
- **SourceForge**：2026-09-23 23:53 に support@ 宛てで「Confirm your SourceForge account」が届いている
  （ユーザー名 `simplememofast`、名前 `AI ATAKA`。名乗りは規則どおり）。有効化のリンクを押すのはアカウント作成の一部なので、こちらでは押さない
  （依頼文でもオーナーの作業にしてある）。メールには「ニュースレターの購読もあわせて確認」とあるので、有効化のあとで購読がオフかを確かめる。
- **開発者向けの窓口を追加で調べた（受付の書き方を確認）**：

  | 窓口 | 結果 |
  | --- | --- |
  | Mobile Dev Weekly | ドメインの登録が切れている（2026-09-24、「registration has expired」の表示）→ 対象外 |
  | Those Who Swift（Substack） | about ページに受付の記載が無い（連絡先は LinkedIn / X だけ）→ 明示の受付が無いので対象外 |
  | awesome-core-ai（GitHub） | 対象は iOS 27 の Core AI（Core ML の後継）に限られる。Foundation Models / SpeechAnalyzer の記事は枠の外 → 対象外 |

- **掲載の確認（07時台）**：iOS Dev Directory #1432・awesome-no-login-web-apps #612・awesome 系6本（#144 / #83 / #135 / #1 / #386 / #23）は
  すべて open でコメントなし。媒体からの返信も無い（support@ 宛ては自動応答と配信メールだけ）。AlternativeTo は Chrome が未ログインのまま（判断待ち #3）。

## 5.22 オーナー判断（2026-09-24 朝）：記事は規約の読み直しを待つ、公開後は iOS Dev Weekly と dev.to

§5.21 の点検結果を渡して、選択肢で3点を確認した。

- **記事 #1547 と RSS #1546 の公開 →「規約の読み直しを先に」（推奨を選択）。**手動マージはしない。
  `Corporate obligations` は、読み直しが済むまで全マージを止めて確認を促す仕組みなので、その意図どおりに待つ。
  - **注意（読み直しを反映する PR を作る人へ）**：その PR 自身も、作った日の `/autopilot/` が最新でないと `Autopilot page vs ledger` で落ちる。
    日次同期の PR（`claude/autopilot-act-*`）や #1548 は `Corporate obligations` で落ちて先に入れないので、**どちらか一方だけでは main が緑にならない。**
    CLAUDE.md の手順どおり、同じ PR に `node scripts/decision-monitor.mjs --publish-report` の結果（と `python3 scripts/generate_sitemap.py`）も入れるのが確実。
  - main が緑になったら、こちらで #1547・#1546・#1541 を最新化する。公開が 9/25 以降になる #1547 は、同じ更新で本文の日付・JSON-LD・sitemap を実際の公開日に直す
    （直さなければ、PR の検証用マージコミットの日付と sitemap の lastmod がずれて検査が落ちるはずなので、古い日付のまま自動で出る可能性は低い。
    ただしマージコミットの日付の付き方は GitHub の仕様を読んで確かめたわけではない）。
- **公開後の告知 →「iOS Dev Weekly に提案」と「dev.to に転載」の両方。**手順と文面は `docs/seo/post-publication-drafts-2026-09-24.md` に置いた。
  - iOS Dev Weekly のフォーム（`suggest.iosdevweekly.com`、2026-09-24 に項目を確認、CAPTCHA なし）には
    *If this link is from a blog already listed in the iOS Dev Directory, Dave will already see it … via RSS* とある。
    **iOS Dev Directory（#1432）にフィード付きで載り、そのフィードに記事が入っているなら、フォームは使わない。**それ以外ならフォームで提案する。
  - dev.to は `simple_memo` アカウントで、正規 URL をサイトに向けた短縮版（SpeechAnalyzer の2本と同じ形）。
- **SourceForge の確認メール →「自分で有効化する」。**オーナーが「Activate Your Account」を押し、ニュースレター購読がオンなら外す。
  プロジェクトページが公開されたら、こちらで rel と robots を実測して §1 に記録する。

## 5.23 意外な残タスクの洗い出し（2026-09-24 昼、オーナーの「意外な残タスクを、徹底」）

外から見て「進んでいるはず」のものを、実物（API・git・公開ページ・手元での検査の実行）で1件ずつ確かめ直した。

| 対象 | 分かったこと | 対応 |
| --- | --- | --- |
| **CI の赤** | 赤は1つではなく**3つ**（`Mention watch cadence` が 9/24 から、`Corporate obligations`、`Autopilot page vs ledger`）。直す PR がそれぞれ別で（#1552 / 人の規約読み直し / #1551）、**どの PR もほかの2つで落ちる**ので、自動マージでは永久に入らない。時計だけを進めた試算では、9/25 に2件、9/30 までにさらに1件増え、規約の未読マスは 9/30 に28件・10/07 に32件になる | Codex への依頼文に**依頼D**として書いた（`docs/codex-request-captio-dates-and-store-facts-2026-09-23.md`）。規約の読み直しは8社32マスをまとめて行う必要がある |
| **#1552 に隠れた失敗** | 言及ウォッチを再開する #1552（Codex・draft）は、`company-mentions.test.mjs` の固定時計（2026-09-14）のせいで、9/14 より後のスナップショットを「未来の観測」として弾かれ、テストが1件落ちる。`Corporate obligations` より後ろの手順なので、CI にはまだ出ていない（#1552 のブランチで実行して確認） | 依頼D に原因と直し方の案を書いた。検査を緩める方向は取らない |
| 言及ウォッチ | 最新が 9/13 で期限切れ。こちらでも固定6クエリを検索してスナップショットを作ったが、**#1552 が同じ日付の分を先に出していた**ので、重複する PR は出さずに捨てた | #1552 に任せる |
| iOS Dev Directory #1432 | 相手の `Validate JSON` は「初めての投稿者なのでメンテナの承認待ち」（action_required）。失敗ではない。手元で相手のスキーマ検査を通し、並び順も正しいことを確かめた | 待つだけ |
| **awesome 系 PR の相手先** | 7件のうち4件は、相手のリストの保守が止まっていた：kmaasrud/awesome-obsidian（最後のマージ 2023-11）、jyguyomarch/awesome-productivity（2023-05）、doanhthong/awesome-pkm（2022-03）、pjpoulose/awesome-second-brain（マージの実績なし）。動いているのは awesome-knowledge-management（最後のマージ 9/12）・awesome-no-login-web-apps（9/08）で、awesome-note-taking は遅い（4/20） | 4件は開けたままにする（害はない）が、**掲載の見込みには数えない**。代わりになる、保守されているリストは見つからなかった（knowfox/awesome-pkm は2021年、devrsi0n/awesome-apple-notes は2024年で止まっている） |
| アカウントが要る登録 | SourceForge は予定の URL（`/projects/memo-inbox/`）が 404（有効化待ち）。alternative.me は検索0件。Uneed・Microlaunch・Fazier は、推測した製品 URL（`/tool/simple-memo` など）がどれも無かった（サイト内検索のページが無いので、確証ではない） | オーナー側の作業待ち（判断待ち #15・#20） |
| **投稿の流れ** | dev.to（`simple_memo`）の最後の投稿は 9/18（それまでは2〜4日おき）、note（`@simplememo`）は 9/19（3〜4日おき）で、**どちらも止まって見える**。dev.to のリンクは dofollow なので、止まると被リンクの増え方が落ちる | 運用はこの作業の外。意図的かどうかをオーナーに確認する |
| Codex への依頼A | Captio の撤退時期の誤記（13ファイル）は、まだどの PR も触っていない。検索結果に出る自社記事 `/blog/captio-discontinued` の題名には「後継アプリ」が残っている | 誰が直すかをオーナーに確認する |
| こちらの PR | #1541・#1546・#1547 に固有の失敗は無い（CI が飛ばした手順も手元で確認済み）。#1547 と #1551 は `sitemap.xml` の同じ行に触れるので、先に #1551 が入ったら #1547 の最新化で sitemap を作り直す | 最新化のときに対応 |
| Gmail の下書き | Simple Memo 関連の下書き9通のうち、送り忘れの外部向けは無い（CoRRiENTE 宛ての旧下書き1通はオーナー判断で残している） | なし |
| 定期タスク | 有効なタスクはすべて最後の実行が成功。失敗は無い | なし |

## 5.24 オーナー判断（2026-09-24 昼）：規約は8社まとめて、まとめ役は Claude、依頼A も Claude、投稿の停止は原因を調べる

§5.23 を渡して、選択肢で4点を確認した。

- **規約の読み直し →「8社32マスをまとめて」。**公開ページで各社の今の版を確かめたところ、前回の読み（8/28〜8/29）の後に本文の版が変わったのは
  **google_cloud・firebase・registrar の3社（12マス）だけ**だった。残る5社（apple・anthropic・github・search_console・appsflyer）は版の日付が前回より前のままで、
  「同じ版であることを確かめて前回の判定を付け直す」で済む見込み（詳細と未確定の点は Codex への依頼文の依頼D）。
- **3つの赤の解き方 →「Claude がまとめ役」。**手元で main に #1552・#1551・テストの時計の直し・規約の仮の読み直しを重ねて全手順を流し、
  **#1552 に隠れた2つ目の失敗（18ページを変えたのに sitemap を作り直していない）**以外は全部通ることを確かめた。
  1本にまとめる PR は、**オーナーの読み直しが終わった日に**、その日の日次同期と sitemap の作り直しを入れて作る（同期と sitemap が日付で古くなるため）。
- **依頼A（Captio の撤退時期と「後継」）→「Claude が直す PR を作る」。**作業中（別 PR）。
- **dev.to と note の投稿の停止 →「原因を調べてほしい」。**作業中。

## 5.25 依頼A を PR #1553 で出した／投稿の停止を調べた（2026-09-24 午後）

### 依頼A → [PR #1553](https://github.com/simplememofast/simplememo/pull/1553)（Claude が作成・Ready）

28ファイル。依頼Aの3種類（撤退とサービス終了の混同・「公式発表なし」・「後継」）に加えて、直す途中で見つけた**同じ系統の誤り**も入れた。

- **日本語 `/captio-alternative/` と関連ページが、英語版の修正から取り残されていた。**2026-09-06 に `en/captio-alternative/` だけが直されている
  （commit 551358b99：終了原因の推測を削り、Cloudflare と Resend への依存を明記）。日本語版には「Captioの終了原因は公式には不明ですが、外部API依存が一因と推測」が残り、
  これは captio.co の告知（理由を述べている）と矛盾する誤り。`/blog/memo-app-service-shutdown-risk` にも同じ文があった。
- **シンプルメモの継続性・独立性の言い過ぎ**：「外部プロバイダのポリシー変更で停止するリスクがありません」「単一障害点がありません」「データは永久に残ります」
  「doesn't depend on any third-party email API」「encrypts on-device … before transmission」。英語版の修正と `/privacy`（E2E 暗号化ではない）に合わせた。
- **Captio のリリース年「2011年頃」は誤り。**Engadget（2010-09-30）の時点で App Store に出ていた（開発者は Boonbits の Ben Lenarts、当時 $0.99）。44か所を 2010 に直した。
- **出典と食い違う数字を削除**：「$2.99 の買い切り」「$1.99 でリリース」「4.5★以上」「v2.90」（第三者のアプリ一覧では最終版 2.9.1・2021年6月17日）。
- 段落を書き直した14ページの `dateModified` と表示上の最終更新日を 2026-09-24 に。
- **sitemap は入れていない。**先にマージされる PR の sitemap と衝突するため。main の赤が解けた日に「Update branch」→ sitemap を作り直して足す（手順は PR 本文）。
- 手元の全137手順：失敗は main と同じ3件だけ（出力もバイト単位で同じ）。アップロード後、28ファイルの blob が手元と一致することを確認した。

### dev.to と note の投稿の停止 —— 分かったことと、分からないこと

| 見たもの | 分かったこと |
| --- | --- |
| note（`@simplememo`、Chrome で確認） | ログインは切れていない。最後の公開は **9/19 09:49**。下書きも 9/5 の「タイトル未設定」1件以降は増えていない（＝公開に失敗して下書きに逃げた形跡も無い）。9/2 までは3日おきの 16:3x に規則的で、9/5 以降は時刻がばらばら |
| dev.to（`simple_memo`、Chrome で確認） | ログインは切れていない。最後の公開は **9/18 20:59**（SpeechAnalyzer の転載）、連載は 9/16 が最後。**9/16 の記事と同じ題の下書きが1件残っている**（重複。削除はしていない） |
| X の自動返信（同じ Mac の定期タスク） | 9/23 10:56・19:42〜19:48、9/24 10:56〜11:02 と**1日2回動いている**。Mac・デスクトップアプリ・定期タスクの仕組み・Chrome 拡張は今日も動いている |
| クラウドの定期タスク | note・dev.to の投稿タスクは無い（どちらも Mac 上のタスク。9/5 にクラウドから移したものと同じ系統） |
| タスクの記録 | `~/Documents/Claude/Scheduled`（note の state.json と logs/ の置き場所）は、このセッションに付与できないとシステムが拒否した。記録は読めていない |

**読み**：全体が止まったのではなく、**note と dev.to の2つのタスクだけ**が 9/18〜19 から動いていない。一時停止・オフになっている、承認待ちで止まっている、
途中の条件で抜けている、のどれかと読むが、**確定できていない**。確定には、デスクトップアプリの定期タスク一覧で2つの状態と最後の実行結果を見るか、
`~/Documents/Claude/Scheduled` をデスクトップのフォルダ選択でこのセッションにつないでもらい、記録を読む必要がある（判断待ち #24）。

### ついでに見つけたもの（この PR には入れていない）

- **`admin/reddit/drafts.json`（Reddit 返信の下書き、5/6 生成）**：古い「2024年10月に App Store から削除」「開発元は声明なし」「spiritual successor」を含む。
  1件は日本語の問い合わせ文で、今の名乗りの規則（本文は「シンプルメモ開発者」）に合わない名乗り方をしている。人がコピーして投稿する運用なので、
  このまま使うと誤りが外に出る。生成元は `docs/cross-platform-engagement/`（判断待ち #25）。
- **日本語 `/captio-alternative/` の「2026年5月実測」の速度比較と「起動0.4秒」**：英語版は 9/6 に「計測比較ではない」と書き直している。
  サイト内でも `en/send-email-to-yourself/` は「約1.0秒」、`en/blog/best-note-to-self-apps-2026` は「0.4s」で食い違う（判断待ち #26）。
- Captio 以外のページの「永久保存」（`/line-keep/` など）や「送信前に暗号化」（英語の比較ページに多数）も、英語版の修正の基準で見ると言い過ぎ（判断待ち #27）。

## 5.26 赤が解けてからの半日（2026-09-24 午後）：main に8本、言い過ぎの直し、iOS Dev Directory にフィード

### オーナー判断（午後、選択式）

- **規約の読み直し（#21）**：版が変わった3社の抜き書きを見て **「12マスとも前回どおり」**、残る5社20マスも「前回どおり」→ 32マスを付け直した（#1555）。
- **3つの赤（#22）**：#1555 で1本にまとめて解いた。**#1553（#23）**は「赤が解けたら自動マージ」。
- **残り3件（#25〜#27）**：Reddit の下書きを直す／日本語 `/captio-alternative/` の速度を英語版に合わせる／他ページの言い過ぎを洗い出して直す —— **3つとも**。
- **規約の指紋**：「本文だけに絞る PR を作る」→ #1560。**定期タスク（#24）**：オーナーがデスクトップの一覧を自分で見る。

### main に入ったもの（2026-09-24、JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 14:24 | [#1555](https://github.com/simplememofast/simplememo/pull/1555) | CI の3つの赤をまとめて解く（規約32マスの付け直し・言及ウォッチ・日次同期・テストの時計・sitemap） |
| 14:50 | [#1556](https://github.com/simplememofast/simplememo/pull/1556) | Reddit／note 返信の下書き20本の事実・名乗り・表現（#25） |
| 14:53 | [#1553](https://github.com/simplememofast/simplememo/pull/1553) | Captio の事実（依頼A）。日本語 `/captio-alternative/` の速度の扱いも英語版に合わせて同じ PR に入れた（#23・#26） |
| 14:56 | [#1546](https://github.com/simplememofast/simplememo/pull/1546) | 開発記事の RSS フィード。公開を確認（`application/rss+xml`、7件） |
| 15:16 | [#1559](https://github.com/simplememofast/simplememo/pull/1559) | サービス終了リスク記事の `dateModified` |
| 15:39 | [#1560](https://github.com/simplememofast/simplememo/pull/1560) | 規約の指紋を本文だけに取る（メニューの揺れで人の判定を戻さない）＋ search_console を日本版に |
| 15:57 | [#1561](https://github.com/simplememofast/simplememo/pull/1561) | （Codex）AppsFlyer の見張りを公開 MSA に。main で週次取得と同じ処理を流し、**11社とも unchanged**（9/28 の週次で戻るマスは無い見込み） |
| 16:10 | [#1562](https://github.com/simplememofast/simplememo/pull/1562) | サイトの言い過ぎ 第1弾（35ページ：本文の保存・配達の保証・測定条件・「外部メールAPIからの脱却」）（#27） |

ほかに #1557・#1558・#1548（運用・Codex）も入った。

### 出したもの

- **[#1564](https://github.com/simplememofast/simplememo/pull/1564) 言い過ぎ 第2弾（検証が通れば自動マージ）**：比較記事2本（英 `best-note-to-self-apps-2026`・日 `email-yourself-app-comparison`）。
  英語版は**リンク切れ5本**（Pigeon・EmailMe・MeMail・Note to Self Mail・Apple Notes）と、App Store の説明と逆の記述（Pigeon の料金・添付・宛先、MeMail は有料、EmailMe の「無料・課金なし」）が見つかった。
  他社の事実は 9/24 に App Store と公式情報で確かめ直し、確かめられない点は「Not verified here／ここでは未確認」。記録の無い計測（端末・回数・秒数）は表ごと外した。
  **9/24 のうちにマージされなければ sitemap の作り直しが要る。**
- **iOS Dev Directory [#1432](https://github.com/iOSDevDirectory/iOSDevDirectory/pull/1432) に `feed_url` を追加**（1行。相手のスキーマで検査済み。フィードと一覧の URL はどちらも 200 でリダイレクトなし）。PR 本文の「フィードはまだ無い」も直した。メンテナのワークフロー承認待ちは変わらない。

### 意外な残タスク（午後に見つけたもの）

| 対象 | 分かったこと | 対応 |
| --- | --- | --- |
| **#1547（開発記事）** | 9/24 11:24 に**同じアカウントで draft に戻っている**（こちらの操作ではない）。待つ理由だった規約の読み直し（#18）は #1555 で済んだ。公開するなら、#1546・#1562 の後なので、フィード（`EXTRA_PAGES`）への追加と sitemap の作り直しが要る | 判断待ち #29 |
| **公開リポジトリの実名** | オーナー個人のユーザー名が `docs/` の31ファイル・40か所に残る（手元の作業パス、個人の Gmail アドレス4か所、`github.com/` のハンドル）。サイトの HTML には無い。今の版から消しても履歴には残る | 判断待ち #30 |
| 宣伝文句 | トップなどの「起動 0.4秒」（記録はウォーム起動）、「Never lose an idea」系の見出し、開発記録の題「Zero Message Loss」（フィードにも出る）、「永久保存」の見出し | 判断待ち #31 |
| 言い過ぎの次の候補 | `en/send-email-to-yourself/` の Pigeon の料金・オフライン（今日の App Store の説明と合わない）、比較ハブのカード（「実測検証」「Fastest 0.4s」）、`en/vs/ios-shortcuts/`「オフラインでは黙って失敗」、`vs/mail-to-self/` | 判断待ち #32 |
| 他人の PR | #1552（言及ウォッチ）・#1551（9/24 の日次同期）は #1555 に同じ中身が入った。#1542・#1543・#1550 は赤の時期に作られたまま | 持ち主（Codex・運用）の判断。こちらは触らない |

## 5.27 DoFollow の定期投稿先の棚卸しと、投稿の GitHub Actions への移設（2026-09-24〜25）

オーナーの依頼：「simplememofast.com の DoFollow リンクを獲得するために定期投稿するべきアカウントを過去の履歴からすべて見直して、
定期タスク化していない場合は適切かつ最大限パフォーマンスし必ず自動化が成功するように設定して、設定済みのタスクについても
自動投稿が直近で失敗していたら必ず自動化が成功するように修正もしくは新しく立ち上げて」。

### 棚卸し（公開面で実測。2026-09-24 夜）

| 投稿先 | 自社リンク | 記事数 | 最後の公開 | 状態 |
| --- | --- | ---: | --- | --- |
| dev.to `simple_memo` | **dofollow** | 34 | 9/24 18:01（Foundation Models の短縮転載・§5.22 の告知） | 定期の連載は 9/16 が最後。3〜4日おきだった |
| はてなブログ `simplememofast` | **dofollow** | 30+ | 9/22 21:29 | 9/8 → 9/17 に9日空き。**同じ題材の「Day20」が2本**（9/8・9/17） |
| WordPress.com `simplememofast` | **dofollow** | 1 | 9/6 | 1本で止まっている |
| Substack `simplememo` | 記事ページが noindex | 1 | 3/27 | 効果なし |
| note / Zenn / Qiita / Medium | nofollow | 51 / 41 / 20+ / 10+ | 9/19 / 9/22 / 9/19 / 9/22 | DoFollow の対象外（ブランド・AI 検索向けとしては残る） |
| X / Reddit / Indie Hackers / Obsidian フォーラム | nofollow（ugc） | — | — | 同上 |

- クラウドの定期タスクに、dev.to・はてな・note・Zenn・Qiita・Medium の投稿タスクは**1件も無い。**全部 Mac のローカル定期タスクで、
  設定とログ（`~/Claude/Scheduled`）はこのセッションに付与できない保護領域だった（フォルダ要求はシステムが拒否、Claude アプリは画面操作の対象外）。
  **止まった原因は確定できていない。**9/2〜9/5 を境に、どの媒体も「決まった時刻に3日おき」から「ばらばらの時刻」に変わっている。
- **過去記事の品質の問題**（DoFollow の維持に直結する）:
  - リポジトリに出典の無い数値：はてなの「起動187ms」「開封率83%（通知をやめて46%→83%）」、dev.to の「cold start 280 ms」など。
    公式の値は約0.4秒（ウォーム起動・`data/benchmark.json`）。187ms は 3月の旧計測（iPhone 15 Pro・v1.0）由来の可能性があるが、確かめていない
  - はてなの 9/17 の記事は「収益は買い切りひとつだけ」と書いている（実際はサブスクリプション。9/8 の記事は正しい価格を書いている）
  - dev.to の33本のうち AI 開示（Fully Autonomous）が付いているのは2本だけ。多くが一人称の体験談の形
- **反証として重く見たもの**:
  - DEV は 2026-08-26 に AI 開示の欄を導入し、「未開示の AI 記事」「合成した内容を本人の体験として出すこと」をアカウント停止の対象と明記した。
    2022 年のガイドラインは AI 記事の目的が「主に個人のブランディングや SEO 操作」であることも禁じている。**停止されると過去の dofollow リンクごと失う**
  - Forem のソースで確かめた：`ai_disclosure_level` は API で渡せる（`fully_autonomous` など）。Fully Autonomous は一部のフィードから外れ、
    関連度も下がるが、**リンクの rel は変わらない**（9/8・9/12 の記事で実測）。ページが noindex / nofollow になるのは記事のスコアが基準未満のとき（`skip_indexing?`）
  - はてな利用規約 6-3 は「検索サイトが認めていない手段による検索サイト最適化行為」を禁じている。Google のスパムポリシーはリンク目的の大量生成（scaled content abuse）を名指ししている
  - → **投稿数を増やす方向ではなく、読者に役立つ記事を約3日に1本・正直な開示つきで続ける**のが、DoFollow を最も長く保つやり方と判断した

### オーナー判断（選択式）

- 方式の提案（対象は dev.to とはてな／GitHub Actions＋公式API／正直な開示と事実ガード／各3日に1本）に **「go」**
- CLAUDE.md の「新しい種類の対外送信は、錠前ができるまで始めない」（同日 18:21 マージ）との関係 → **「既存の種類として継続」**。権限表に名指しで記録した
- GitHub への反映 → **Chrome で PR を作る**／投稿用の鍵 → **オーナーが自分で Secrets に貼る**（AI は鍵を読まない・入力しない）
- 旧ローカルタスク → **dev.to・はてなの分は止める**（デスクトップアプリの定期タスク画面でオーナーが行う）

### 作ったもの

- `.github/workflows/devlog-syndication.yml` — 12:17 / 20:47 JST の1日2枠、matrix で dev.to → はてなの順に1本ずつ。手動実行の既定は dry_run
- `scripts/devlog-syndication.mjs` — 門（緊急停止・**公開面の最新投稿**から66時間・24時間に1本）、文脈、検査、投稿、公開確認。自己テスト18件
  - **状態ファイルを持たない。**公開面を見るので、旧タスクが投稿しても二重にならず、落ちた枠は次の枠が拾い直す
  - 検査：本文の数字は記事が宣言した出典ファイルか一次ファイルにあるものだけ（字で書いた数量も同じ）／`check-pr-facts.mjs` の配信原稿の規則／
    禁止表現・売り込み／人間の開発者を名乗る文・一人称の上限／自社リンクは sitemap の正規URLだけ（1〜2本、はてなは1〜3本）・全リンクの実在／既存記事との題名の近さ／名前一覧との照合（ハッシュ＋Secrets `IDENTITY_DENYLIST`）
  - 投稿：dev.to は `ai_disclosure_level=fully_autonomous` を付け、公開面で読み戻す（付いていなければ付け直し、それでも駄目なら落とす）。はてなは本文末尾に固定の開示文
  - 公開確認：公開ページで自社リンクの rel と meta robots を実測し、nofollow / noindex なら落とす
  - **鍵を持つのは投稿ステップだけ。**執筆（Claude Code）には Read / Write / Edit / Glob / Grep しか渡さない
- `docs/syndication/RUNBOOK.md` — 執筆の手順書（題材は記事ネタ台帳の種 → 無ければサイトのページ）
- 台帳：`data/emergency-stop.json`（経路 `syndication`）・`data/credential-expiry.json`（`DEVTO_API_KEY`・`HATENA_API_KEY`、`IDENTITY_DENYLIST` は対象外の欄）・
  `data/model-routing.json`（`syndication`：sonnet、手直しは opus）・`data/injection-surface.json`・`data/authority-matrix.json`（新しい領域）・`data/autonomy-score.json`（R2）

### 手元で確かめたこと

- `node scripts/preflight.mjs`：失敗は main と同じ環境依存の6件だけ（qrcode 等の未導入）。`seo-check.js` は 0 errors
- actionlint で新しいワークフローの式を検査（問題なし）
- 検査の較正：人が書いた見本（英語896語・日本語2,072字）で、英語は通過、日本語は長さだけ不足（下限2,500字）を正しく指摘。数字の捏造・本人の名乗り・旧名は落ちる
- 公開確認：既存の dev.to とはてなの記事で、dofollow と robots を正しく読めることを確認

### 残ること

- マージ後：dry_run → はてなの実投稿 → dev.to の実投稿（24時間の上限が明けてから）で、公開ページの rel・robots・AI 開示まで確認する
- 毎日の見張り（クラウドの定期タスク）：両媒体の最後の投稿からの時間・最新記事の rel と robots・Actions の失敗を見て、異常のときだけ通知する
- **旧ローカルタスクの停止（オーナー）**。止めないと、出典の無い数値を含む記事が出続ける可能性がある
- 過去記事の誤り（187ms・開封率・「買い切り」など）の訂正をするかは未決（判断待ち #34）
- WordPress.com（dofollow・1本）は API に OAuth アプリが要るので、今回は対象外（判断待ち #35）
- GitHub Pages の `simplememofast.github.io`（Developer Hub・dofollow）が旧名「Captio式シンプルメモ」のまま

### 2026-09-25 追記：マージ後の模擬実行と試験実行

- PR #1585 は 09:07 JST にマージ（main `37ca7893`）。ワークフロー・スクリプト・台帳の blob が手元のコミットと一致することを確認した
- **模擬実行（手元）**：本番と同じ手順書とプロンプトを、本番の執筆と同系統のモデル（Sonnet）に渡し、道具も Read / Write / Edit / Glob / Grep に絞った。
  はてな 2,810字・dev.to 995語で、**どちらも1回目の検査を通った**（自社リンク1本・一人称0・出典の無い数字0）。所要は17分と12分
- **GitHub Actions での試験実行**（run 36083023810・はてな・dry_run・force）：執筆9分・26ターン・$1.58 →
  1回目の検査は**長さ不足（2,312字、下限2,500字）** → 手直し（Opus）で2,806字 → 再検証を通過 → 試験のため投稿せず。全体12分52秒で success。
  **検査で落ちた記事を、手直しの段が1回で直せることは確かめられた。**投稿（API）と公開確認は鍵が無いので未確認
- 試験実行で見つかった欠陥（直した）:
  - **成果物が空だった。**`.syndication/` は隠しディレクトリ扱いで、upload-artifact v4 の既定では1ファイルも上がらない → `include-hidden-files: true`
  - **要約の費用の行が2行とも同じ値だった。**claude-code-action の実行記録は毎回同じパスに書かれ、手直しが執筆の記録を上書きする → 各段の直後に数字だけ退避する
  - 長さ不足で手直しに回った → 手順書に数え方と目安（地の文で3,000〜4,500字／900〜1,400語）を足した
  - 時間切れの余裕が薄い（模擬の最長17分に対し執筆の上限25分） → 執筆40分・手直し25分・ジョブ90分
  - 試験実行が門の間隔で止まる（dev.to は24時間の上限で試せなかった） → dry_run は間隔と24時間の上限を見ない（停止と「読めない」は止める。投稿しないことは publish `--dry-run` が保証する）
- **日次 cron は数時間遅れて配信される。**CLAUDE.md の PageSpeed の節は約2時間50分だったが、この workflow の初回 schedule（run 36115263090）は公称 12:17 JST に対して **17:52 JST（5時間35分遅れ）**だった。門は公開面の時刻で判断するので、遅れても間隔は崩れない
- その初回 schedule では、はてなが投稿時刻（前回から68時間）を迎えていたが、**「鍵が無い」で設計どおり止まった**（投稿なし・run は赤）。dev.to は24時間の上限で対象外
- dev.to の試験実行（run 36120865064・dry_run、#1597 の門の変更後）：執筆23ターン・$0.95、**1回目の検査で通過**（1,165語・自社リンク1本・一人称0）、成果物も上がった。全体4分4秒
- 鍵：`DEVTO_API_KEY`・`HATENA_API_KEY` は 10:40 JST 時点で**未登録**（Secrets の名前一覧で確認。値は読んでいない）。未登録のまま枠が来ると「鍵が無い」で明示的に落ちる。**鍵の読み取り・入力は AI には許されていないので、登録はオーナー作業のまま**
- 旧ローカルタスク：このセッションから Mac に届かず、止められていない（オーナー作業のまま）。止まっていなくても、門が公開面を見るので二重投稿にはならない
- **見張りを2段にした**：
  - `scripts/devlog-syndication.mjs watch` — 公開面だけを読む（鍵不要）。各媒体の最新投稿からの時間（80時間超で注意・96時間超で異常）、この経路の最新記事の自社リンクの rel と meta robots、dev.to の AI 開示、2026-09-25 以降の「この経路以外の投稿」（旧ローカルタスクか手動）
  - ワークフローの `watch` ジョブ — 枠のたびに上を実行し、異常なら run を赤くする（GitHub の失敗通知に乗る）。**cron そのものが配信されない場合はこのジョブも走らない**ので、外にもう1段置いた
  - クラウドの定期タスク「dev.to・はてな自動配信の見張り（毎朝）」（`trig_01K9FTtLdN5HpyHKxCjLbbUB`、08:52 JST）— main を取得して `watch` を実行し、注意・異常のときだけ選択肢つきで通知する。読むだけ（投稿・GitHub への変更・鍵の扱いはしない）
- 反証として残すもの：9/24 に別のセッションが dev.to へ出した転載（Foundation Models）は、API の `ai_disclosure_level` が `not_disclosed` だった。DEV の 2026-08-26 の方針では未開示の AI 記事は停止の対象になりうる。**この経路の記事ではないので見張りは異常に数えない**が、アカウント単位のリスクとしては残る

### 2026-09-26 追記：旧タスクの投稿・Day21 の訂正・フィードの読み方の欠陥

- **旧ローカルのはてなタスクがまだ動いていた。**9/25 21:34 JST に「【開発日誌 Day21】21本の継続が、アプリの設計を直した」を投稿。
  自社サイトへのリンクが0本（被リンクにならない）、「買い切りだけで回す設計」（実際は Free＋Premium の月額・年額）、出典の無い「開封率83%」「100人」「58通・週20分」「18ビルド」、AI 開示なし。
  新しい仕組みの門は公開面の最新投稿を見るので、**はてなの自動配信は次の66時間後（9/28）まで後ろにずれた**（二重投稿はしない＝設計どおり）
- オーナー判断（選択式）：鍵は「今から登録する」、旧タスクは「今アプリで止める」（Claude アプリは画面操作の対象外で、AI からは止められない）、Day21 の誤りは「**Day21 だけ直す**」
- **Day21 を Chrome の編集画面で訂正した**（9/26 12:16 JST）：料金形態の文、出典の無い数字（表の4行と本文3か所）を外し、末尾に「追記（2026-09-26）」の注記。
  公開ページで反映を確認（`dateModified` 2026-09-26T12:16:23+09:00、該当の数字0件）。9/8・9/17 など他の記事は未訂正（判断待ち #34 のまま）
- **見張りの読み方の欠陥を、実データで見つけて直した。**はてなの公開フィードの link は `<link href="…"/>`（rel も type も無い）で、
  `rel="alternate" type="text/html"` の決め打ちでは URL が null になっていた。**自己テストの見本がこの形ではなかったので、テストは通っていた。**
  見本を実測の形にし、属性の順番と省略に依らない読み方（`entryAlternateUrl`）にした。投稿直後の応答から公開URLを読む所も同じ関数に揃えた
  （読めないと、投稿は済んだのに run が落ち、次の枠では「同じ題名があるが URL を読めない」で止まり続ける形だった）
- 鍵：9/26 12:17 JST 時点でも未登録
- **#1617 の欠陥は見張りだけの話ではなかった。**はてなの文脈（`existing_posts`＝既存記事の題名と書き出し）が URL の `null` をキーに1件へ潰れていて、
  30本すべてが「【開発日誌 Day7】…」の1題名になっていた（修正前の文脈ファイルで確認）。**執筆も題名の近さの検査も、はてなの既存記事を実質1本しか見ていなかった。**
  修正後の実データでは30本すべての題名が並ぶ。dev.to は API から読むので影響なし
- はてなの試験実行（run 36215894729・#1617 の後・dry_run）：執筆29ターン・$1.20、**1回目の検査で通過**（3,327字）。手順書に足した長さの目安が効いた
- **未確認：本文末尾の印（HTML コメント）がはてなの公開面に残るか。**既存の30本に HTML コメントを含む記事が無く、試せない。残らない場合、はてなの「使用済みの題材」が文脈に載らない。
  公開確認（verify）と見張り（watch）がこれを検出して知らせるようにした（公開の失敗にはしない）。最初のはてなの自動配信で確かめ、残らなければ印を本文として読める形に直す
- **dev.to の AI 開示の確認を、作成直後の公開面の遅れに強くした。**これまでは作成の直後に公開 API を1回読むだけで、404（まだ反映されていない）でも投稿の段が落ちる形だった
  （記事は出ているのに run が赤くなり、次の枠は66時間後なので付け直しも走らない）。作成・更新の応答に値があればそれで確かめ、公開 API の 404 は待って読み直す。付け直しても未開示なら従来どおり落とす。鍵が無いので実 API では未確認（自己テストは fetch を差し替えて5通り）

### 2026-09-29 追記：初回の本番・公開面のキャッシュ（二重投稿の手前）・はてなの執筆の上限

- 鍵：オーナーが 9/29 20:19〜20:22 JST に登録（`DEVTO_API_KEY`・`HATENA_API_KEY`。値は見ていない。Secrets の名前一覧で確認）
- **dev.to の初回の本番（run 36561085228・手動・publish）：公開を確認。**
  https://dev.to/simple_memo/a-null-return-hid-three-billed-runs-inside-an-automation-ledger-jmg （20:26 JST）。
  執筆35ターン $1.22 → 1回目の検査は description の長さで落ち → 手直し15ターン $0.79 で通過（1,038語）。
  meta robots は `max-snippet:-1, max-image-preview:large, max-video-preview:-1`（noindex なし）、自社リンク https://simplememofast.com/en/autopilot/ は `rel="noopener noreferrer"`（nofollow なし）、
  公開 API の `ai_disclosure_level` は `fully_autonomous`、本文の印と開示文あり
- **同じ run の見張りが「最新は122.4時間前」として赤くした。原因は dev.to の公開一覧のキャッシュ。**
  Fastly が Accept-Encoding ごとに別のキャッシュを持ち（`Vary: Accept-Encoding, Origin, X-Loggedin`）、Node の fetch が受ける gzip 側は
  **age 92,695秒（25.7時間）**で、投稿の10分後も新しい記事が無かった。Accept-Encoding の無い curl は MISS で新しい内容を受けた。
  クエリを足しても（キャッシュのキーに入らない）、`Cache-Control: no-cache` を送っても古いまま。Vary にある Origin を毎回変えると MISS（age 0・2回実測）
- **誤警報では済まなかった。門も同じ一覧を読む。**main の門を投稿の15分後に手元で回すと、dev.to を「投稿する（最新から122.7時間）」と判定した。
  24時間の上限も同じ古い一覧で数えるので止まらない。**次の枠で dev.to に2本目が出る形だった。**
  はてなの公開フィードも age 6,206秒の応答を返し、クエリを足すと age 0 になった
- 直したこと（この追記と同じ PR）：
  - 公開面をキャッシュに当たらない要求で読む（dev.to は Origin を毎回変える・はてなはクエリを毎回変える）。**古い応答（age 600秒超）は「読めない」として投稿しない**
  - 投稿の直前に、キャッシュの無い認証済みの一覧（dev.to の `me/all`・はてなの AtomPub）で24時間の上限と66時間の間隔を確かめ直す（force は間隔だけ越える）。一覧が空なら出さない
  - 記事の作成（POST）は 5xx と通信の失敗で送り直さない（作成済みかもしれない）。429 だけ待って送り直す
  - 見張りは、この run の投稿の結果（成果物の `published.json`）も数える
  - 手元で確かめた：修正後の門は dev.to を `daily_cap`（直近24時間に1本）と判定する。自己テスト29件、足した検査は壊すと落ちることを7通りずつ確かめた
- **測り方の罠：同じ URL でも、クライアントによって違う内容を受ける。**最初は「公開一覧は投稿の数分後に反映される（curl で3分35秒後に新しかった）」と読みかけた。
  新しかったのは curl の非圧縮側の初回 MISS で、Node が読む gzip 側は25.7時間前のままだった。**「反映の遅れ」ではなく「キャッシュの分かれ方」。**確かめるときは本番と同じクライアントで測る
- **はてなの初回の本番（run 36561413162・手動・publish）：執筆が61ターンで上限（60）に達して落ち、投稿されなかった**（$2.29）。
  記事ファイルは残っていて、題名「「直った」と「直ったと確認した」は、別の記録だった」・題材 S-20260907-fixed-but-unconfirmed が要約に出たが、検証に回らなかった。
  9/26 の試験実行は29ターンで、ばらつきが大きい。上限を100に上げ、上限に達しても書けた記事は検証に回すようにした（**検証が関門**。記事が無ければ落とす）。はてなは次の枠が拾い直す
- 未確認のまま：はてなの印（HTML コメント）が公開面に残るか（はてなの自動配信の記事がまだ無い）

### 2026-09-29 追記（夜）：はてなの初回の投稿と、印が消える件

- **#1667 のマージ後、はてなを手動で本番に出し直した（run 36566063885）：公開を確認。**
  https://simplememofast.hatenablog.com/entry/2026/09/29/211832 （21:18 JST）「故障は直っていたのに、台帳は7日『未修理』と書き続けた」。
  **執筆70ターン**（$2.58。旧上限60なら今回も落ちていた）、1回目の検査で通過（3,644字）。meta robots は `max-image-preview:large`（noindex なし）、
  自社リンク https://simplememofast.com/autopilot/ は rel なし（dofollow）、本文末尾に開示文。同じ run の見張りは dev.to・はてなとも新しい記事を読めた（キャッシュを通さない読み方が効いた）
- **はてなは本文の HTML コメントを公開面（ページ・フィード）から消す。**上の「未確認」は「残らない」で確定。
  このままだと、はてなの「使用済みの題材」が常に空になり、**次の枠で同じ種（S-20260907-fixed-but-unconfirmed）をまた選びうる**（今回の2回の試行はどちらもこの種だった）
- 直したこと（この追記と同じ PR）：はてなの本文末尾、開示文の後ろに「題材の記録: <種の ID>」を**見える形で**付け、印と両方から読む。
  この記事（211832）は見える記録より前なので、題材を `LEGACY_HATENA_BASES` の表で引き当てる（表は増やさない）。
  手元の実データで、はてなの文脈の使用済みの題材が1件（この種）になり、見張りは「異常なし」になった。
  手順書に「数え直しに何度もターンを使わない」を足した（正確な数は検査が数える）

### 2026-09-30 追記：修正後の初回の定期実行と、dev.to の過去記事の AI 開示

- **修正後の初回の定期実行（run 36602079858・schedule）：二重投稿なし。**公称 20:47 JST の枠が 9/30 02:02 JST に届いた（5時間15分遅れ）。
  門は dev.to・はてなとも見送り（直近24時間に1本）、見張りは「異常なし」（dev.to 5.6時間前・はてな 4.7時間前、dofollow・開示とも維持）。
  **修正前の門なら、この枠で dev.to に2本目が出ていた**（9/29 の手元の再現で「投稿する（最新から122.7時間）」）
- **dev.to の過去記事の AI 開示（オーナー判断「A」＝8/26 以降の未開示6本を Fully Autonomous に）：6本とも変更を確認。**
  DEV は 2026-08-26 の告知で「未開示の低品質な AI 記事・合成した内容を本人の体験として出すこと」をアカウント停止の対象になりうるとしている（段階的に運用、過去記事への適用は明記なし）。
  - 3本（4731895・4685114・4574866）は編集画面の「AI Disclosure」で選んで保存
  - 3本（4664708・4547329・4513632）は古い形式（Jekyll front matter）の編集画面で、開示の欄が無い。
    front matter に `ai_disclosure_level: fully_autonomous` を1行足して保存した（この鍵は forem/forem の `app/models/article.rb` の `set_ai_disclosure_from_front_matter` が読む）
  - 公開 API で6本とも `fully_autonomous`。タグ・シリーズ・正規URL・公開日は不変。本文の長さは front matter の3本だけ +38字（足した1行）で、ほかの3本は不変
  - 8/26 より前の26本は未開示のまま（判断の範囲外）。本人の体験として書かれた文（"I hit" など）は開示しても残る —— 中身を見直すかは別の判断

### 2026-09-30 追記（朝）：過去記事の開示の残り26本・Developer Hub の旧名・過去記事の数字と料金の訂正（オーナー判断 ①②③）

- **① dev.to の 8/26 より前の26本も Fully Autonomous に（オーナー判断「全部 Fully Autonomous」）：26本とも変更を確認。**
  20本は編集画面の「AI Disclosure」、6本は古い形式（Jekyll front matter）に `ai_disclosure_level: fully_autonomous` を1行足した。
  公開 API で26本とも `fully_autonomous`。タグ・シリーズ・正規URL・公開日・題名は不変、本文の長さは front matter の6本だけ +38字（足した1行）。
  **これで dev.to の35本すべてが開示済み**（今回の26本は 2026-05-08〜08-25 公開）
- **③ GitHub Pages の Developer Hub（simplememofast/simplememofast.github.io）の旧名を現行名に（オーナー判断「直す」）。**
  「Captio式シンプルメモ」→「Obsidian連携シンプルメモ」を8ファイル38か所。トップの JSON-LD は `alternateName` の先頭に旧名を残した（旧名で探す人と検索エンジンの同定のため）。
  公開面の6ページで新しい名前を確認（旧名はトップの `alternateName` の1か所だけ）。
  **リポジトリの説明文（About）は旧名のまま** —— リポジトリの設定の変更なのでオーナーに残した
- **② はてなの過去記事の数字と料金の訂正（オーナー判断「数字と料金だけ直す」＝Day21 と同じ方法：誤った文を外し、末尾に追記）：8本を直し、残りは止めた。**
  - 直した8本：09/22・08/28・09/01・08/04・08/12・08/22・07/28・07/30。公開面で、対象の数字（187ms・280 ms・83%・46%・100人・開封率の数字・買い切り）が0件、
    末尾に「追記（2026-09-30）」があり、robots は `max-image-preview:large` のまま（Day21 は 09-26 に訂正済み）
  - 直す必要なし2本：06/21（「内部は最大100人」は TestFlight の仕様で、利用者数ではない）、
    09/08（買い切りを「約束できる期間を測れていない」と見送っており、料金と矛盾しない）
  - **止まった：08/21 の編集画面へ移る操作が、自動の安全確認に「頼まれていない変更」として止められた。**
    オーナーの判断は出ていたが、確認を回り道で越えることはしない。**残りははてな13本と dev.to 2本で、オーナーの改めての判断待ち**
    - 文の中の数字を外せば済むもの：はてな 08/21・08/25・09/04・07/24・07/21・07/15・06/15・06/09、dev.to 3657185
    - 題名や記事の前提が数字そのもので、文を外すと記事が成り立たないもの：07/18 Day14（100人・62人など）・07/07 Day12（開封率83%）・
      07/09 比較（起動187ms）・05/27 Day6（200ms の一線）・09/17 Day20（買い切り）、dev.to 4197612（題名に 280 ms）
  - 起動時間の基準は `data/benchmark.json`（iPhone 16e・ウォーム起動・タップから入力できるまで・5回の中央値 0.4秒）。
    3月の旧計測（iPhone 15 Pro・v1.0）でも自社は約1.0秒で、**187ms・280 ms はこのリポジトリのどの計測にも無い**。
    料金の基準はトップの料金プラン（Free：1日3通まで／Premium：月額 ¥500・年額 ¥5,000）
  - **範囲外で見つけた、裏づけの無い数字（オーナー判断の対象外なので未着手）**：214件・4分の3（07/30・08/12・08/22）、
    58通・週20分（09/01 Day19 の題名と本文、09/17 にも引用）、作り始めて9ヶ月（09/04）。「10言語」はサイトの記載と一致していて誤りではない
- はてなブログからサイトへのリンクは、43本中7本の本文にだけある（サイドバー等には無い・すべて rel なし）。
  同じドメインからの本数を増やしても効き目は小さいので、過去記事にリンクを足すことはしていない

### 2026-10-01 追記：過去記事の訂正の残り（オーナーの改めての判断）・古い dev.to 投稿タスクの停止

- **9/30 朝に安全確認で止まった訂正を、オーナーの改めての判断（選択式・10/1 朝）で再開した。**
  判断：残りの訂正は「私が直す＋冒頭訂正」、古い dev.to タスクは「私が止める」、GitHub の操作は「Chrome で続けてよい」、範囲外の数字は「一覧で確認する」
- **はてな13本を直した（10/1 09:12〜09:22 JST）。**
  - 文の中の数字を外し、末尾に追記：08/21・08/25・09/04・07/24・07/21・07/15・06/15・06/09。
    07/24 は、旧題名を引いたリンクの文字（「【開発日誌 Day14】100人のユーザーが言わなかったこと」）も新しい題名に合わせた。
    06/09 は Day6 へのリンクを残し、リンクの文字だけ「起動の速さ」にした
  - 題名や記事の前提が数字そのものの5本は、題名から数字を外し、冒頭に引用の形で訂正を置いた（本文はそのまま）：
    07/18 Day14 →「ユーザーが言わなかったこと」、07/07 Day12 →「プッシュ通知をやめて、メール一本にした」、
    07/09 →「iOSメモアプリ比較2026：起動の速さはどこで決まるか」、05/27 Day6 →「iOSの起動速度に一線を引く」、
    09/17 Day20 は題名そのまま（冒頭で料金を訂正：買い切りではなく Free＋Premium の月額・年額）
  - 追記・訂正の日付は、見直して判断した 2026-09-30 のまま（反映は 10/1）
  - **43本を全部読み直した**：対象の数字が残るのは、冒頭に訂正を置いた5本の本文だけ。自社リンクの本数は 9/30 から変わらず、rel・robots も不変
- **dev.to 2本を直した**：3657185（280 ms の2か所を外し、末尾に Update）、4197612（題名を「What I learned cutting my iOS cold start」にし、冒頭に Correction）。
  公開 API で、URL・タグ・正規URL・公開日・AI 開示（fully_autonomous）が不変、3657185 の自社リンク（rel なし＝dofollow）も残っていることを確認
- **古い dev.to 投稿タスク「Devto simplememo 3day」（`trig_018ymsi2pW4uHW6Xi3omz2Kk`、火・金 22:00 JST）を無効にした（削除ではない）。**
  9/26 に「古いタスクは止める」と判断されていたが、クラウドの定期タスクとしては有効のままだった（作成 9/25・その後の更新なし）。
  9/18 を最後に投稿も返信もしていなかった（dev.to の公開データ）。AI 開示なしの一人称の記事を出す仕様で、新しい仕組みが失敗した日には出るおそれがあった
- **PR #1706 はマージ済み**（9/30 10:28 JST）。9/30 の2回の定期実行（run 36698138033・36748351470）は、両媒体とも門で見送り、見張りは成功（設計どおり）
- **範囲外の数字**（送信履歴の件数・サポートの件数と時間・開発の期間と本数・ベータの人数と反応・自分で測った数値・AI と開発した記録・審査・作業量）は、
  記事ごとの一覧を渡し、オーナーが8分類とも「記録がある」と回答した → そのまま残した

### 2026-10-02 追記：古いはてなタスクがまだ投稿していた件と、ほかの投稿先の棚卸し

- **古いはてなタスク（Hatena simplememofast 3day）が、10/1 21:33 JST に投稿していた**：「メモアプリの月額と買い切りは、使う年数で決まる」。
  本文に「自分は、作っているメモアプリを買い切りにした」（誤り）、AI 開示なし、自社リンクなし。新しい仕組みのはてなの門は公開面の最新投稿を見るので、はてなの次の枠は 10/4 までずれた（二重投稿はしない）
  - オーナー判断（選択式）で、冒頭に引用の形で料金の訂正を置いた（10/2 15:06 JST、本文・URL・題名は不変、robots 不変）
  - このタスクは 10/2 09:10 JST にクラウドの定期タスクとして作り直されていた（`trig_01Ag2PBDRNwv71aoXoaqoEDM`、次は 10/4 21:00 JST）。
    オーナー判断「止める」で無効にしようとしたが、15:10 JST の時点でクラウドの一覧から消えていて（同時に作られた投稿系の定期タスクもまとめて消えた）、ここからは止められなかった。
    **Mac の Claude アプリ側のタスクとして残っている可能性があり、止めるのはオーナー作業**
- **ほかの投稿先の棚卸し（読むだけ・変更なし）**：9/24 の棚卸しは Mac のローカルのタスクが読めず、dev.to・はてな・WordPress.com・Substack・note・Zenn・Qiita・Medium しか見ていなかった。
  10/2 に投稿系の定期タスク11件がクラウドに現れたので、指示書と公開面（各アカウントの直近2本の自社リンクの rel）を読んだ
  - **dofollow の投稿先がさらに7つあった**：はてな「メモの設計図」（simplememofast.hatenadiary.jp）、Exblog（simplememo.exblog.jp）、Blogger（captio-style.blogspot.com）、
    FC2（captio.blog.fc2.com）、Ameblo（ameblo.jp/capito-simple-memo、描画後も rel なし）、ALIS（alis.to/simplememo、描画後も rel なし）、Livedoor（captio.livedoor.blog）
  - **Livedoor は 9/22 を最後に止まっている**。ほかは 9/30〜10/1 まで約3日おきに投稿している
  - nofollow：Zenn・note・Qiita・Medium（9/24 と同じ）
  - 記事の誤り：Qiita の開発日誌 Day36・Day37 に「起動の58ms」「250ms削った」「起動0.3秒」、ALIS の 9/24 の記事に「起動に0.3秒、送信に150ミリ秒」（公式は約0.4秒）。
    指示書の5件（メモの設計図・Ameblo・ALIS・Qiita・note）に「起動0.3秒」とある。直近2本を見た範囲では、どの投稿先にも AI の開示は見当たらない
  - これらを新しい仕組みに載せるか・指示書を直すか・止めるかは、オーナーの判断待ち

### 2026-10-03 追記：投稿先を2つ足し、dofollow の7媒体と Qiita の過去記事の数字を直した

- **オーナー判断（10/3・選択式）**：はてな「メモの設計図」とライブドアは「新しい仕組みに移す（推奨）」。Exblog・Blogger・FC2・Ameblo・ALIS は「Mac のまま、直し文を用意（推奨）」。
  過去記事は「全部読んで直す（推奨）」（dofollow の7媒体と Qiita。方法は はてなと同じ）。CLAUDE.md L4-03 の「名指しの例外」はこの判断
- **自動配信に2媒体を足した**（[#1917](https://github.com/simplememofast/simplememo/pull/1917)、10/3 15:43 JST マージ）
  - はてな「メモの設計図」（kind hatena・同じ HATENA_API_KEY）とライブドア（AtomPub・LIVEDOOR_API_KEY・カテゴリは「メモ術」に固定・本文は依存なしの Markdown→HTML）
  - 日本語の3媒体は「使った題材」を共有する（同じ種から日本語の似た記事を3本出さない）。新しい2媒体の開示文は「シンプルメモの開発元が運営するブログ」と明記した
  - LIVEDOOR_API_KEY が未登録の間は、門が `key_pending` で休み（失敗にしない）、見張りも注意にとどめる。dev.to・はてなは今までどおり、投稿する番に鍵が無ければ落とす
  - 試験実行（dry_run）：run 37104243701（メモの設計図・7分。執筆40ターン・検証は1回目で通過・題名「メモが『届いた』は、用事が『終わった』の証拠にならない」）と run 37104268633（ライブドア・13分。執筆36ターン・1回目で通過・「判定を二箇所に持つ設計は、なぜ片方だけ直るのか」）。どちらも投稿はしていない。見張りは、メモの設計図が「この経路の初投稿前（unknown）」、ライブドアが「鍵待ち（warn）」で、想定どおり
- **過去記事の訂正（公開面で確認）**
  - はてな「メモの設計図」16本：紹介文の「起動0.3秒」「およそ1秒」と、受信箱に届くまでの「10秒」を文から外し、末尾に追記。
    08/04 の「起動から入力まで約1秒で終わるはずの動作」は一般論として残した
  - Qiita 26本（開発日誌 Day2〜Day37）：題名や前提が数字の8本は冒頭に訂正（Day4・Day13・Day36・Day37 は題名から数字を外した）、18本は文から外して末尾に追記。
    タグと公開状態は変わっていないことを API で確認。ストックした人への変更の通知は送っていない
  - Blogger 2本（06/12「起動0.3秒は…」は題名を変えて冒頭に訂正、05/25 は文から外した）・ALIS 1本・Exblog 1本
  - **残り**：ライブドア3本（この Chrome にライブドアのログインが無い）、FC2 5本（Chrome の安全上の制限で管理画面を開けない）。直し文はオーナーに渡した
  - 範囲外として残したもの：体験談の件数・期間などの数字（はてなの範囲外8分類と同じ扱い）、Qiita Day6 の「起動0.3秒を目標値として」（目標値）、
    Qiita Day8 の元の Captio についての「起動0.3秒」、Blogger 05/27 の Captio の設計の考え方としての「0.3秒」
- **はてなの見張りの警告（見込み）**：旧ローカルタスクの 10/1 21:33 JST の投稿で、はてなの門は 10/4 15:33 JST まで閉じている。この経路の最新（9/29 21:18 JST）から
  96時間を超える 10/3 21:18 JST 以降、見張りが「この経路の停滞」の alert を出す見込み。10/4 の枠で投稿されれば解消する（前倒しの投稿はしていない）
- **Mac のまま続ける5タスク**：指示書の先頭に貼る「事実と開示のルール」と、タスクごとの置き換えを用意した（貼るのはオーナー）
- **毎朝の見張り（定期タスク）**：名前を4媒体に変えた。指示文の更新は Mac 側の承認が要るので保留（`watch` コマンド自体は4媒体を見る）
- **オーナーの回答（10/3・選択式）と残るオーナー作業**：ライブドアは「ログインと鍵の登録をする」（登録とログインのあと、過去記事3本の訂正と試験はこちらで行う）、
  FC2 の5本は「Mac の FC2 タスクに直させる」（直し文の5章B を指示書に貼る）、旧タスク2つ（メモの設計図・ライブドア）は「アプリで止める」、
  見張りの指示文は「このままでよい」。Mac の5タスクの指示書の貼り替えもオーナー作業

## 5.28 夕方から翌朝（2026-09-24 17:40〜09-25）：記事の公開と告知、iOS Dev Directory に掲載（dofollow）、実名の伏せ字、宣伝文句、言い過ぎの第3・第4弾

（§5.27 は同じ日に別の作業（DoFollow の定期投稿先の棚卸し）で入ったので、こちらの記録は §5.28 にした。）

### オーナー判断（選択式）

- **開発記事 #1547（判断待ち #29）→「今日公開する」。**フィード（`EXTRA_PAGES`）と sitemap を入れて Ready → 17:46 マージ。
- **公開リポジトリの実名（#30）→「今の版から伏せ字にする」。**履歴は書き換えない。
- **宣伝文句（#31）→「0.4秒は主要ページに条件を添える」「Never lose／Zero Message Loss／永久保存は言い換える」。**

### main に入ったもの（2026-09-24、JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 17:46 | [#1547](https://github.com/simplememofast/simplememo/pull/1547) | 開発記事「Let the on-device model choose, not write」（Foundation Models）を公開 |
| 17:54 | [#1567](https://github.com/simplememofast/simplememo/pull/1567) | `docs/` の31ファイル・40行のオーナー個人のユーザー名・アドレス・手元のパスを伏せ字に（#30） |
| 18:43 | [#1573](https://github.com/simplememofast/simplememo/pull/1573) | #31 の実施：0.4秒に計測条件（主要ページ）、見出し52ルールの言い換え、JSON-LD の別名を今の App Store 名に、比較ハブの古い数字（10アプリ・1.2秒・3.5秒）を正本に。**開発フィードの作り直しと CI 検査の追加**、#1547 の記事をフィードに追加 |

ほかに #1566（Notion の配信原稿）・#1568〜#1571（運用・Codex）・#1574（Codex：マージ時の名乗りの検査）も入った。

### 公開後の告知（#19 の実行）

- **iOS Dev Weekly**：9/24 17:57 ごろ、公式の提案フォームから送った（名乗り「Simple Memo Developer」、連絡先 support@simplememofast.com、「I wrote it!」、ブログ記事＝はい、ライブラリ＝いいえ）。載るかどうかは号（金曜発行）で分かる。号内リンクは18本中16本が rel なし（§5.19）。
- **dev.to**：`simple_memo` で転載を公開（[記事](https://dev.to/simple_memo/let-the-on-device-model-choose-not-write-a-voice-follow-up-loop-with-foundation-models-4go5)）。正規 URL はサイトの記事、タグは swift・ios・ai・llm。本文中のサイトへのリンクは rel なし（dofollow）、robots に noindex なし。
- **開発フィード**：9/24 18:4x、`/en/devlog/feed.xml` が8件で配信され、新しい記事・Outbox 記事の新しい題・relay 記事の新しい説明文が載っていることを確かめた（iOS Dev Directory #1432 の `feed_url` もこのフィード）。

### 被リンク：iOS Dev Directory に掲載（dofollow）

- [#1432](https://github.com/iOSDevDirectory/iOSDevDirectory/pull/1432) は **9/24 18:19 JST にマージ**された。メンテナのコメントは「feed_url を足したのでマージする」——§5.26 でフィードの公開を待ってから `feed_url` を足したのが決め手だった。
- https://iosdevdirectory.com/ の Company Blogs に **「Simple Memo Dev Log」→ `https://simplememofast.com/en/devlog/`** が載った。DOM では `rel="noopener"` のみ（nofollow なし）で、サーバーの HTML は rel なし（9/23 に一覧の他の行で実測）＝**dofollow**。同じ行にフィード（`/en/devlog/feed.xml`）と GitHub へのリンク。
- この一覧は iOS Feeds（フィードを読む）と SwiftLee Weekly（一覧と iOS Feeds を巡回）の入口（§5.19）。フィードに #1547 の記事が入ったので、そこから拾われるかを見る。
- 反省：#1573 の PR 本文を直したときに `iOSDevDirectory/iOSDevDirectory#1432` と書いたため、相手の PR に「mentioned this pull request」が1件付いた。相手のリポジトリへの参照は、今後はコード書式（自動リンクされない形）にする。

### PR TIMES（「対話メモ」のリリース）の転載

- **財経新聞（`zaikei.co.jp/releases/3626774/`、9/24 09:12:51 掲載）**を見つけた。サイトへのリンク3本（`/obsidian/`・`/` ×2）と App Store へのリンクは**すべて `nofollow ugc noopener`**。robots の指定なし（index）、canonical は自ページ。
- **NEWSRELEA.SE（`newsrelea.se/MLOYa6`、9/24 11:05 に掲載通知のメール）**：原文転載。サイトへのリンク3本（`/obsidian/`・`/` ×2）と App Store へのリンク4本は**すべて `nofollow ugc noopener`**。robots・canonical の指定なし。
- ほかの転載は、検索（`"対話メモ" シンプルメモ 株式会社ユリカ`、リリースの題の完全一致）では見つからなかった。9/26 まで毎晩の確認で探す。

### 媒体・読者からの返信（9/24〜25、support@ の受信箱）

| 差出人 | 中身 | 対応 |
| --- | --- | --- |
| エンジニアtype編集部（9/24 13:30） | 9/23 の情報提供へのお礼。**取り上げられるのは有料のタイアップ記事の場合だけ**、とのこと | 有料の記事広告は禁止事項なので進めない。こちらの送信文で「返信は不要」と書いてあったので返信もしない |
| 読者（`useTether.io` の創業者、9/25 9:19） | dev.to の過去記事（「no list」）を読んだとして、顧客の声をどう製品に反映しているかの30分の聞き取りの依頼（売り込みではないと明記） | 被リンクとは関係しない。受けるかはオーナーの判断（未返信）。記事が開発者本人の体験として読まれている例で、§5.27 の「dev.to の一人称の記事」の問題とつながる |
| ほか | Google 公式を名乗る市場データの売り込み、DMM のタイアップの営業、日経トレンディの広告枠の案内、自社名を AI に聞く診断の営業 | すべて有料・営業。対応しない |

### 意外な残タスク（夕方から夜に見つけて直したもの）

| 見つけたこと | 対応 |
| --- | --- |
| **開発フィードのずれ**：#1563（Codex、16:57）が relay-api-design の説明文を変えたが、フィードを作り直していなかった（フィードだけ古い説明文で配られていた）。フィードの一致は CI で検査されていなかった | #1573 で作り直し、`seo-check.yml` に「Developer feed matches the articles」を追加。検査を6通りに壊して落ちることを確かめ、自己検証の台帳（`data/check-selftests.json`）に登録。canonical の重複を見逃すことが分かり selftest を1件追加 |
| **#1547 の記事がフィードに入っていなかった**（公開の PR では `EXTRA_PAGES` を足していなかった） | #1573 で追加 |
| **#1573 の言い換えが届いていなかった所**：開発記事の meta description（＝フィードの説明文）の「yet messages are never lost」、about の「Guaranteed Delivery Even Offline」「No Memo Text Ever Stored on Server」、FAQ・用語集の「失われません」「確実に届きます」「guarantees delivery」、冪等性の「絶対にありません」 | 第3弾 [#1575](https://github.com/simplememofast/simplememo/pull/1575)（9/24 21:19 マージ） |
| **Captio の書き方のルール違反**：「Captioの精神を受け継ぐ」「スピリットを引き継ぎ」「哲学を受け継ぎ」「inherits Captio's …」「what Captio would be if it were built fresh in 2026」、Captio にもあった一時的なオフライン保存を「Captioにはなかった」とする記述（英語の captio-alternative と逆）、根拠の無い「多くのCaptioユーザーが違和感なく移行」 | 第3弾 #1575 |
| **他社の事実**：Pigeon（オフラインモード追加済み・Pro は買い切り、9/24 の米国 App Store）、iOS ショートカットの「オフラインでは黙って失敗」（サイト自身の手引きは「メールアプリ次第」）、「ほとんどのアプリは SMTP 設定が必要」 | 第3弾 #1575 |
| **裏付けのない「多くのユーザーが」**：「使い比べるとシンプルメモに統一する方がほとんど」「most users consolidate」など6ページ | 第3弾 #1575 |
| **Captio の終了理由の推測**：「iOS 16 以降の互換性問題」「ユーザーから『送信ボタンが反応しない』との報告」 | 第3弾 #1575：開発元が告知で挙げた理由に合わせた |
| **「消えない」「消えません」「nothing is lost」「Never miss」の残り**（hands-free・下書き自動保存・Siri・Obsidian 配下など）、**他言語トップの「0.4秒でメールへ」**（0.4秒はウォーム起動の時間で送信の時間ではない） | 第4弾 [#1591](https://github.com/simplememofast/simplememo/pull/1591)（9/25 10:37 マージ。日付をまたいだので `dateModified` と sitemap は 9/25 で作り直した）。題を変えた5ページは OG 画像も作り直した |
| **比較ハブのカードが記事と合っていない**：`/blog/email-yourself-memo` へのカードが「シンプルメモ・Moca・PEN・MeMail を実測検証」と書くが、記事は Gmail・Outlook・Apple Mail の手順の記事で、4アプリは出てこず「実測した比較ではない」と明記。**`en/send-email-to-yourself/` の他社の記述が古い**：Boomerang（今は「Yoyo : Email myself」、アプリ内課金と複数ファイル送信あり）、Email Me（今は「Audio Notes \| Email Me」、購読と買い切り、Watch のオフライン待ち行列あり）、推定の評価「4.7 (est.)」、他社アプリの `aggregateRating`（監査 L8） | 第5弾 [#1596](https://github.com/simplememofast/simplememo/pull/1596)（**9/25 10:55 マージ**。9/25 の米国 App Store で確認） |
| **#1574（Codex）でマージ時の名乗りの検査が入った** | こちらのコミット（作者 SimpleMemo Developer、Co-Authored-By: Claude Opus 5.5）は同じ関数で問題なし |

### まだ残っているもの

- **新しい種類の対外送信は凍結中**（CLAUDE.md、2026-09-24 18:21 の #1568。オーナー判断 L4-03）。こちらは凍結の後に新しい送信をしていない（iOS Dev Weekly への提案は 17:57 で凍結の前）。新しい媒体への掲載依頼・フォーム送信は、送信者欄を機械で照合する錠前ができるか、オーナーが名指しで例外を出すまで止まる。上の読者からの聞き取りの依頼への返信も、新しい宛先への送信に当たる。
- 毎晩の確認（send_later、`trig_016LVCiUZGKtHUAQt81Jg877`、9/25 12:00Z）。10/08 まで毎日かけ直す。

## 5.29 2026-09-25 昼〜夜：言い過ぎの第5・第6弾、転載1件（ASCII STARTUP・noindex）、計測の台帳への記録

### main に入ったもの（2026-09-25、JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10:55 | [#1596](https://github.com/simplememofast/simplememo/pull/1596) | 第5弾：比較ハブのカード（記事と合っていなかった）、`en/send-email-to-yourself/` の他社の古い記述（Boomerang＝今の Yoyo、Email Me＝今の Audio Notes）と他社アプリの `aggregateRating` |
| 10:56 | [#1592](https://github.com/simplememofast/simplememo/pull/1592) | この台帳の §5.28 |
| 21:40 | [#1607](https://github.com/simplememofast/simplememo/pull/1607) | 第6弾（112ファイル・91コミット）：下の「見つけたこと」 |

### 第6弾で見つけたこと（意外な残タスク）

| 見つけたこと | 対応 |
| --- | --- |
| **3か月前の一括置換で壊れた文**：#359（2026-06-23）が送信時間「150ms」を本文から外すとき「ワンタップ／one-tap」に機械的に置き換え、「sends in one tap at one-tap」「with one tap with one tap」「ワンタップ以内にメールが届く」「送信速度：ワンタップ ／ 標準」「計測方法：結果 ワンタップ」「約ワンタップで最速でした」「Send-to-Reset の目標：ワンタップ以下」が残っていた | 数字は戻さず（150ms を本文から外したのはオーナーの6月の方針）、文を直した。数字の無い「送信速度」行は行ごと外した |
| **#460（2026-08-11）が他社の実測値を逆向きに書き換えていた**：`en/send-email-to-yourself/` で Email Me の送信 0.4 秒（同じページの表の値）が本文5か所で「~1s」になり、「Email Me was fastest at ~1s, followed by Simple Memo at 1.0s」になっていた | 表と3月の原稿に合わせて戻した。題の「(Fastest in 0.4s)」はページ自身の結果と合わないので外した |
| **「AI機能がない」**：AI タグ自動付与（2026年7月提供）の後も `vs/tana`・`blog/ai-vs-simple-memo`・`blog/how-to-choose-memo-app`（日英）が「AI機能がありません」「意図的にAIを搭載しない」「自動分類：なし」のままだった | 端末内のタイトル・タグ・種別の自動付与に合わせて直した |
| **プライバシーの断定**：「no tracking」（iOS アプリは AppsFlyer SDK を起動する）、「no data retention」「zero-server」「ゼロサーバー保存」「Your notes never leave your iPhone」 | 正本の言い方（メモ本文はサーバーに恒常的に保存しない／タグ付けのためにメモを外部サーバーへ送らない）に揃えた |
| 消えない系・「最速」の断定の残り、古い数字（「0.4 seconds cold start, 0.15 seconds warm start」「送信0.15秒」「起動 約1秒」）、出典の無い「Standard Notes の有料ユーザー数は前年比40%増」 | 第6弾 |
| **トップページはフォントのサブセットと字形の一覧で守られている**（`scripts/perf/verify_home.py`）。文言を変えて字形の集合が変わると CI が落ちる | リンク文言を「起動の速いメモアプリを探す」にして字形の集合を変えないようにした |
| **計測の台帳に記録が無かった**：言い過ぎの修正（第1〜6弾と判断31の実施、#1562〜#1607 の7本）で、実行中の実験の対象ページ（トップ・/ai-tags/・/obsidian/・/siri/・/blog/memo-app-hikaku-matome）の description・本文と、JSON-LD の別名（ブランドの実験）が変わり、全コンテンツページの実験（engage、評価日 9/25）の期間の最後の2日に169ページ（うち題12ページ）の文言が変わった。9/5・9/19 の変更では各実験に note を付けていたが、今回は付いていなかった | この PR で、影響する7つの実験に note、`growth/data/annotations.json` に 2026-09-24 の行を足した（開始日・評価日・判定基準は変えない） |

### PR TIMES（「対話メモ」のリリース）の転載

- **ASCII STARTUP（`ascii.jp/elem/000/004/436/4436722/`、9/24 09:12:51）**：原文転載。ページは **`<meta name="robots" content="noindex">`**。サイトへの3本（`/obsidian/`・`/` ×2）と App Store への4本は**すべて `nofollow ugc noopener`**。SEO 上の被リンクには数えない（露出のみ）。
- これで転載は財経新聞・NEWSRELEA.SE・ASCII STARTUP の3件（すべて nofollow）。検索は 9/26 の晩まで続ける。

### 告知の結果待ち

- **iOS Dev Weekly**：9/25 21 時台（JST）の時点で最新は Issue 768（9/18）。9/25 号（769）はまだ出ていない。
- **iOS Feeds**：トップに #1547 の記事は見当たらない。

### 受信箱（support@、読むだけ）

- 媒体からの返信は無し。営業のメール（有料のセミナー・支払い代行など）と通知のみ。
- 読者（`useTether.io` の創業者）からの聞き取りの依頼は未返信のまま（新しい宛先への送信に当たるので、凍結中はオーナーの判断待ち）。

### 次の弾（未着手）

- 英語ページの「~1-second launch」（#359 の 6 月の値）を正本の「0.4 秒（ウォーム起動）」に揃える。
- `en/blog/fastest-note-app-iphone-2026`：3月の測定の表（Simple Memo「0.05s」「0.15s total」）が残る。`data/benchmark.json` の `otherPublishedRuns` で唯一 `currentPageUpdatedOn` が無い。姉妹ページ2本（#988・#1000）と同じ形で撤回・正本化する。
- `en/captio-migration-guide` の競合の起動時間（正本と不一致）、`en/blog/captio-shutdown-alternatives` の比較表の他社の記述。
- `blog/brain-science-memo`（日英）の「忘却曲線によると20秒後から」「1日後に74%」（エビングハウスの最初の測定は20分後、1日後はおよそ66%）。

### 毎晩の確認

- 9/25 21:00 の回（`trig_016LVCiUZGKtHUAQt81Jg877`）は発火済みで、その確認がこの節。9/26 21:00 を予約した（`trig_01BQm2Zz44nwywtenj7Ww4nm`）。10/08 まで毎日かけ直す。

## 5.30 2026-09-26 午前〜昼：言い過ぎの第7弾（速度の数字・トップの動画・記憶の研究の記事）、計測の台帳への記録

### main に入ったもの（2026-09-26、JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 13:19 | [#1618](https://github.com/simplememofast/simplememo/pull/1618) | 第7弾（第8弾を合流。124ファイル・78コミット）：下の「見つけたこと」 |
| 9/26 13:39 | [#1619](https://github.com/simplememofast/simplememo/pull/1619) | 影響する4つの実験（title-2026-08-20-home-grammar・video-2026-08-11-five-clips・aio-2026-08-11-answer-blocks・engage-2026-08-11-next-step）に同日の note、`growth/data/annotations.json` に 2026-09-26 の行、この §5.30 |

### 第7弾で見つけたこと（意外な残タスク）

| 見つけたこと | 対応 |
| --- | --- |
| **比較ページの他社の起動時間が、サイト自身の計測記録（`data/benchmark.json`、8/11・iPhone 16e・ウォーム起動）と合っていなかった**。日本語の `vs/apple-notes` は Apple Notes を「0.4秒」（記録は1.726秒。#460 の一括置換が他社の数字にも当たった）、Google Keep「〜1.5秒」（2.068秒）、Evernote「3〜5秒」（2.5秒）、OneNote「3〜6秒」（2.6秒）、Bear「数秒」（0.917秒）など | 記録のある6アプリは記録の値に条件を添え、計測していない他社（Craft・Heptabase・Tana ほか）は比較ハブと同じく「目安・未計測」 |
| **記録の無い「計測した」文**：「iPhone 15 Proで100回ずつ計測」（Joplin・選び方の記事）、「実機テストで常に0.4秒で安定」、ブログ一覧の「iPhone 15 Proで10アプリを実測」 | 記録のある内容（開発者の計測・iPhone 16e・ウォーム起動）に置き換え、無いものは消した |
| **0.4秒を送信・入力完了の時間として使った文**（「Send ideas to email in 0.4 seconds」「0.4秒で入力→送信が完了」など） | 記録は「タップから入力できるまで」なので「タップから0.4秒で書き始め」に |
| **英語の「~1-second launch」約60か所**（#359・6月の一括置換の残り） | 正本の「0.4s launch (warm, iPhone 16e)」に |
| **トップの動画 `launch-1s` の1枚目「起動して、書いて、送る。そこまでで約1秒。」**、棒グラフの注記「各5回」（実際は4〜10回、Drafts だけ最速値） | 1枚目を「入力できるまで0.4秒」＋「書く時間と送信は含みません」にして作り直し、動画の URL は変えず `?v=` でキャッシュを切り替えた |
| **`en/blog/fastest-note-app-iphone-2026` の3月の表・倍率・「conducted independently」** | 姉妹ページ2本（#988・#1000）と同じ形で撤回し、8/11 の記録で載せ直した |
| **`blog/brain-science-memo`（日英）の研究の引用の誤り**（「1日で74%忘れる」＝6日後の値、「手書きで29%高い」、「20秒後から」＝別の研究、ツァイガルニク効果の断定ほか） | 研究の条件と限界つきに書き直して改題（「メモと記憶の研究でわかること」）、OG 画像を作り直し、18ページの関連リンクの文言を追従 |
| 英語6ページの meta description にナビの文字列（「… Guides Use Cases Compare Methods Blog Glossary FAQ About」） | 本文の1文目に戻した |

### 次の弾（第9弾、作業中）

- **比較ページ11本（日英）の冒頭の体験談**：「1週間ずつ使い比べた結果」「2週間並行利用して…3倍速い」「乗り換えたユーザーの声を分析すると」「Evernoteを5年以上使い込んだ」「10日間検証して圧勝」「OneNoteを半年使った後に」「1ヶ月間並行利用」「3ヶ月試した経験」。どれも記録が無い → `vs/roam-research` などで使っている開示文（開発元が公開仕様で整理、利用期間の記録は公開していない）に揃える。
- **ブログの体験談と利用者の声**：「私自身…500件以上…9割が埋もれた」「半年間運用…成約率に最も影響」「3ヶ月間運用…3分の1」「100日以上…完了率が倍以上」、「営業経験のあるユーザーから『成約率が2割上がった』と聞いた」ほか。
- **出典の無い数字**：「ハーバード・ビジネス・レビューの調査：生産性23%」「McKinsey：再利用40%・抜け漏れ60%」「成約率42%」「Buffer『State of Remote Work 2026』：67%」（Buffer の調査は2023年版まで）「運動皮質で記憶定着40%」「Stack Overflow の再検索に平均15分」ほか。確認できない参考文献（Mankins 2019「How to Take Better Notes」HBR）も外す。
- **研究の取り違え**：速度ベンチマークの記事の「ワーキングメモリがアイデアを保持できるのは約18秒」（Peterson & Peterson 1959 は、復唱できない状態での子音3文字の再生）と、それを元にした「使える時間の約13%」。用語集の忘却曲線（節約率を忘却率とし、6日後を1週間後としていた）。「習慣化は平均66日、メモは21日で定着」（Lally ほか 2010 は中央値66日・18〜254日）。
- **題の「生産性3倍」「開発効率を2倍」**（OG 画像も題から作られている）。英語21ページの meta description のナビ文字列の残り。

### 毎晩の確認

- 9/26 21:00 の回（`trig_01BQm2Zz44nwywtenj7Ww4nm`）は予約どおり。10/08 まで毎日かけ直す。

## 5.31 2026-09-26 午後：言い過ぎの第9〜第13弾、参考文献の点検、計測の台帳への記録

### main に入ったもの（2026-09-26、JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 14:14 | [#1621](https://github.com/simplememofast/simplememo/pull/1621) | 第9弾（88ファイル・83ページ）：記録の無い体験談、出典の無い数字、研究の取り違え、題の倍率（OG 画像2枚） |
| 14:51 | [#1623](https://github.com/simplememofast/simplememo/pull/1623) | 第10弾（31ファイル・29ページ）：届く・残ることの保証、トップの「見逃しゼロ」 |
| 15:47 | [#1624](https://github.com/simplememofast/simplememo/pull/1624) | 第11弾（94ファイル・92ページ）：参考文献の点検、第10弾のあとに残っていた言い過ぎ |
| 16:11 | [#1625](https://github.com/simplememofast/simplememo/pull/1625) | 第12弾（28ファイル・25ページ）：子育てページの題の「忘れない」（OG 画像）、#1618 の改題に追従していなかった関連リンク、朝のメモの記事の「3つの科学的理由」、「最大の原因」 |
| 16:36 | [#1626](https://github.com/simplememofast/simplememo/pull/1626) | 第13弾（21ファイル・19ページ）：集計していない利用データ（速度ベンチマークの記事）、心理学の用語の取り違え、「いかなる攻撃パターンにも」ほか |
| 9/26 17:08 | [#1627](https://github.com/simplememofast/simplememo/pull/1627) | 影響する実験（aio-2026-08-11-answer-blocks・aio-2026-08-12-entity-attribution・engage-2026-08-11-wait-test・engage-2026-08-11-next-step・title-2026-08-20-home-grammar・video-2026-08-11-five-clips）に同日の note、`growth/data/annotations.json` に弾ごとの行、この §5.31、オーナー判断の表に #38・#39 |

### 見つけたこと（意外な残タスク）

| 見つけたこと | 対応 |
| --- | --- |
| **比較ページ11本（日英）の冒頭の体験談**（「1週間ずつ使い比べた」「Evernoteを5年以上使い込んだ」ほか）と、ブログの体験談・利用者の声（「成約率が2割上がった」ほか）に記録が無い | 開示文（開発元が公開仕様と開発者の起動時間の計測で整理、利用期間の記録は公開していない）に揃え、体験談と声は外した（第9弾） |
| **出典の無い数字**（「HBR：生産性23%」「McKinsey：再利用40%・抜け漏れ60%」「成約率42%」「Buffer 2026：67%」ほか）と**研究の取り違え**（「ワーキングメモリがアイデアを保持できるのは約18秒」、忘却曲線、「習慣化は平均66日、メモは21日」） | 外すか、元の研究の条件どおりに直した。題の「生産性3倍」「開発効率を2倍」も改題（第9弾） |
| **届く・残ることを保証する言い切り**（「確実にメモを送信」「確実に配信」「guaranteed message delivery」「delivers reliably」ほか）が、利用規約 §7（「当社は、メール送信の到達や即時性を保証しません。」）と食い違っていた。トップの「メモの『見逃し』がゼロ」も | 送れなかったメモは端末の送信待ちに残し、つながったら再送する、という実際の動きの説明に（第10弾） |
| **参考文献に見つからない出典**：Wirecutter（比較ページ18本とブログ3本）・TechRadar・Mollick 2023 HBR・HBR の架空の題5本・「Wikipedia — Transactional Outbox Pattern」・Wired・Reddit・Moving.com・USDA・リクルートワークス・SUUMO | 外した。Outbox は microservices.io の「Pattern: Transactional outbox」に置き換え（第11弾） |
| **別の論文・団体を開くリンク**：PubMed のリンクがマウスの脳の研究、「ペットフード協会」が日本生産性本部、「日本健康教育学会誌」が『医療経済研究』、英語版の GTD の欄に別の論文 | 正しい論文・ページに（第11弾） |
| **書誌の誤りと、原題と違う「和訳の題」**：Askvik 2020 の掲載誌、Plummer の年、Storey ほかの会議と題、DevEx の筆頭著者、Randler 2009 の掲載誌（日英とも末尾が「DOI」という文字だけ）、Randler・Masicampo・Emmons・Gollwitzer の和訳の題、GTD の邦題 | Crossref と出版社のページで確かめて直し、DOI か記事のリンクを付けた（第11弾） |
| **リンク切れ・改版**：Cirillo のポモドーロ・テクニック（2種類とも 404、6ページ）、McKinsey と Deloitte のリンクが 2026年版を開く、PARA の改題 | 公式サイト・引用している年の版に（第11弾） |
| **「…ゼロ」「Never forget」の約束**（「買い忘れゼロ」「引っ越し完了まで漏れゼロ」「zero forgotten items」「Never forget an item」ほか）と、子育てページの題「ママ・パパの「忘れない」を叶える」「Never Forget Again」 | 「減らせる」「忘れにくくなる」に。子育てページは改題して OG 画像を作り直した（第11・第12弾） |
| **#1618 の改題（「メモと記憶の研究でわかること」）に追従していなかった関連リンク**（「脳科学とメモ」「Brain Science of Memos」10ページ） | 新しい題に合わせた（第12弾） |
| **根拠の無い脳の説明**：朝のメモの記事の「3つの科学的理由」（起床後2〜4時間は前頭前皮質が最も活性化・意志力は有限・ザイガルニク効果）、「プライミング効果」、手書きの記事の「前頭前皮質を活性化」、アイデアのページの「デフォルトモードネットワーク」 | 研究の条件どおりの書き方か、経験として言える書き方に。自我消耗の説には再現研究（Hagger ほか 2016）を添えた（第12弾） |
| **集計していない利用データ**：速度ベンチマークの記事（日英）の「シンプルメモの利用者は1日平均5〜8通、Notion 中心の利用者は1〜2通」「1日10個のアイデアのうち8個と3〜4個、年間約1,500個の差」「行動科学では摩擦の削減が最も効果的」 | 外した。利用者のメモ数の集計は公開していないことを明記（第13弾） |
| **心理学の用語の取り違え**：48時間ルールを「ホット・コールド共感ギャップ」で「魅力が半減」、ツァイガルニク効果を「未完了のタスクが脳のリソースを消費し続ける現象」（GTD の用語集・メソッド、ポモドーロの FAQ） | 用語の意味どおりに直し、GTD は「オープンループ」、ポモドーロは Masicampo & Baumeister 2011 の実験の内容に（第13弾） |
| リレーの設計の「いかなる攻撃パターンに対しても最終防衛線」、バレットジャーナルの「世界中に数百万人」、「科学的根拠と実務経験に基づく」、ウォータールー大学の学習支援ページを「研究」 | 言い換え（第13弾） |

### 残したもの・確かめきれなかったもの

- 実在を確かめた一般的な資料（G2・TrustRadius のカテゴリ、TechCrunch の Craft の記事、Heptabase のブログ、各アプリの App Store など）は、リンクを足さずに残した。
- 確かめきれなかったもの：Radicati の PDF（取得できず。URL が `2024/01` のままで 404 の可能性）、PCMag のおすすめ記事（取得不可）、LINE Keep 終了の告知の出どころが「LINE公式ブログ」か（終了の事実は確か）、Mail to Self の現行の App Store 掲載。
- 「最強」「圧倒的」など、計測の主張ではない一般的な形容は残した。
- 比較ページの「向いている人」の「確実に」（下の #38）と、`/en/siri` の画像の alt（アプリ内ガイドの文言の書き写し。下の #39）。
- 比較ページの料金の誤り（シンプルメモ自身の料金を「$5/month（$50/year）」「Pro $200/yr」と書いた日英5ページ、他社の古い料金・プラン名）は、公式の料金ページと日本の App Store で確かめて第14弾（別の PR）で直す。ブログの料金の記述は、その次に点検する。

### 毎晩の確認

- 9/26 21:00 の回（`trig_01BQm2Zz44nwywtenj7Ww4nm`）は予約どおり。10/08 まで毎日かけ直す。

## 5.32 2026-09-26 夕方：料金と他社の事実の点検（第14〜第19弾）

### main に入ったもの（2026-09-26、JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 17:08 | [#1627](https://github.com/simplememofast/simplememo/pull/1627) | 第9〜第13弾を計測の台帳に記録（§5.31、オーナー判断 #38・#39） |
| 17:22 | [#1628](https://github.com/simplememofast/simplememo/pull/1628) | 第14弾（25ファイル・25ページ）：シンプルメモ自身の料金の誤り（7ページ）、他社11サービスの料金・プラン、Day One の無料プランの E2E 暗号化 |
| 17:38 | [#1629](https://github.com/simplememofast/simplememo/pull/1629) | 第15弾（12ファイル・10ページ）：ブログの他社料金、Obsidian Sync の Standard/Plus のページの訂正 |
| 17:45 | [#1630](https://github.com/simplememofast/simplememo/pull/1630) | 第16弾（1ページ）：オフライン比較記事（シンプルメモは E2E 暗号化ではない、他社のオフライン・暗号化） |
| 18:03 | [#1631](https://github.com/simplememofast/simplememo/pull/1631) | 第17弾（14ページ）：記事の上に表示している「最終更新」「Last updated」の日付を dateModified に揃えた（本文は不変） |
| 18:14 | [#1632](https://github.com/simplememofast/simplememo/pull/1632) | 第18弾（5ページ）：Google Keep の比較（Keep は保存時も暗号化、Gmail も Google、7日間の試用は無い、「永久に残る」） |
| 18:53 | [#1633](https://github.com/simplememofast/simplememo/pull/1633) | 第19弾（19ページ）：比較表の他社のオフライン・暗号化のセル、Tana（公式アプリがある）と Goodnotes（計測していない秒数・「100%」）の比較ページ、第15弾の Evernote「Personal 月額1,700円」の訂正 |
| 9/26 19:21 | [#1634](https://github.com/simplememofast/simplememo/pull/1634) | 影響する実験（aio-2026-08-12-entity-attribution・engage-2026-08-11-next-step）に同日の note、`growth/data/annotations.json` に弾ごとの行、この §5.32、オーナー判断の表に #40〜#42 |

### 見つけたこと（意外な残タスク）

| 見つけたこと | 対応 |
| --- | --- |
| **シンプルメモ自身の料金の誤り**：「$5/month（$50/year）」（`en/vs/day-one`・`drafts`・`ticktick`）、「Pro $200/yr」（`heptabase` の表、日英）、「about $13/month total」（`en/vs/craft`、$5 で計算）、「年額2,800円」（`line-keep`）。プラン名を「Pro」とした箇所も | `data/site-constants.json`（2026-09-22 にオーナー確認）の値（月額500円・年額5,000円／$2.99・$29.99）と Premium に（第14弾）。9/26 に App Store の公開ページのアプリ内課金の一覧（jp・us）でも同じ値を確認 |
| **他社の古い料金・プラン**：TickTick（$35.99→$49.99、日本は年額3,580円→8,000円）、Drafts（Pro $2.99/月・$49.99/年→$1.99・$19.99）、Bear（~$1.99/年・年額1,500円〜→$2.99/月・$29.99/年、日本は月400円・年4,500円）、Craft（Pro 月750円→Plus 月1,580円）、Goodnotes、Heptabase、Notion Business、Tana、Stock、Evernote の無料枠 | 英語ページは公式の料金ページ、日本語ページは日本の App Store のアプリ内課金の一覧で確かめて直した。確かめきれない買い切り価格と Tana は金額を書かずに公式を案内（第14弾） |
| **Day One の無料プラン**：「無料は1ジャーナル・日記データは暗号化されずに保存」→ 公式では無料の Basic にジャーナル無制限と E2E 暗号化 | 紹介文・表・違い・FAQ（日英）を訂正し、「無料で暗号化を使いたい」の項目を外した（第14弾） |
| **ブログの他社料金**：Bear 月150円、Standard Notes 月400円〜、Evernote 月700円〜・月60MB・年¥9,300〜、Obsidian「商用利用には年$50のライセンスが必要」「チーム共有機能は無い」、Obsidian Sync 月1,000円〜、Craft「Pro $5/月」、Drafts「$25/year」 | 直した（第15弾） |
| **Obsidian Sync の Standard/Plus のページ**が「Plus の料金と保存容量は確認できていない」のままで、サイト内の料金ページ（9/9 確認）と食い違っていた | Obsidian の Sync のページとヘルプの値（Plus は年払いで月$8・10保管庫・10 GB・1ファイル200 MB）で、訂正の注記を付けて書き直した（第15弾） |
| **オフライン比較記事**：シンプルメモを「E2E 暗号化」「サーバーは平文を見ない」、「2分ごとに再送」、Apple Notes「サーバーに暗号化されずに保存」、Obsidian「公式のモバイルアプリが無い」、Google Keep「オフラインでは作成も編集もできない」、Notion「実質オンライン専用」ほか | プライバシーポリシー・開発記録・各社の公式ヘルプどおりに直した（第16弾） |
| **表示の「最終更新」の日付が古いまま**（JSON-LD の dateModified は更新していたのに、記事の上の署名行の日付が 3月22日・8月12日などのまま、14ページ） | 署名行の最初の1か所だけ dateModified に揃えた。事実を確かめた日を示す開示文（「Updated September 9, 2026. The author develops …」）は変えていない（第17弾） |
| **Google Keep の比較ページ**：Keep の暗号化を「転送中のみ」（Keep のヘルプでは通信中と保存時）、「Google にデータを渡す必要がない」（送り先が Gmail なら Google に保存される）、「クラウド非依存」、「メールとして永続的に残る」、英語の CTA「Try 7 days.」（試用期間は無い） | Keep のヘルプ・プライバシーポリシー・App Store の表示どおりに直した（第18弾） |
| **比較表の他社の「なし」「有料プランのみ」**：Stock「オンライン必須」（公式ではノート・タスクはオフラインでも利用可）、Tana「なし（Webベース）」（デスクトップ版はオフライン対応）、LINE Keep メモ・メモポスト・Moca の暗号化・オフライン「なし」「端末レベルのみ」（出典が無い）、Evernote「有料プランのみ」（2024年2月に無料へ開放と報じられたが、2026年のプラン改定後は公式ページで確かめられない） | 公式情報どおりに直し、確かめられないものは「公開情報では確認できず」「使えるプランは公式で確認」にして優劣の色を外した（第19弾） |
| **Tana と Goodnotes の比較ページ**：Tana を「Web アプリ（スマホはブラウザ経由）」（公式の iOS・Android アプリがある）、「常に0.4秒」「90%のシーン」、表でシンプルメモの AI を「なし」（端末内でタイトル・タグ・種別を付ける）。Goodnotes はシンプルメモ「5秒で送信完了」、Goodnotes「最低でも15〜20秒」、「メール検索で100%の精度」、暗号化「なし」（公式は保存データを暗号化）、ペンの種類 | 公式のドキュメント・ヘルプ・App Store どおりに直し、計測していない秒数は外した（第19弾） |
| **第15弾の私の誤り**：日本語のブログ3本に「日本の App Store では Personal が月額1,700円」と書いたが、Evernote のヘルプでは Personal は提供を終えた旧プラン（現行は Starter と Advanced）。App Store の一覧には旧プランの課金項目も並ぶ | 金額を外して「料金は公式サイトで確認」に。`/vs/notion-vs-evernote` の注意書き（旧 Personal・Professional の料金を現行価格として使わない）と同じ扱い（第19弾） |

### 残したもの・確かめきれなかったもの

- Roam Research の料金（公式の料金ページが JavaScript だけで表示され、取得できない）。ページには「公式の公開情報に基づく・変わることがある」の注記が既にある。
- Capacities の円の表示（9/9 に日本から確認した記述）、Goodnotes の買い切り（特別版）の価格（App Store の表示が複数ある）。
- evernote.com はこの環境から取得できない（robots.txt）。Evernote の金額は日英とも書かず、公式サイトを案内している（日本語ページの「Personal 月額1,700円」は第19弾で外した）。オフラインノートを使えるプランも確かめられていない。
- 英語ページでシンプルメモの料金を円で書いている箇所（「Premium is JPY 500/month」など）は、日本の価格として誤りではないので残した。
- 「ずっと無料」「free forever」（下の #40）。

### 次にやること

- 他社の料金は変わるので、比較ページとブログの料金は四半期ごとに確かめ直す（今回の手順：英語は公式の料金ページ、日本語は日本の App Store のアプリ内課金の一覧。**App Store の一覧には提供を終えた旧プランも並ぶので、プラン名が公式の現行プランと合うかも確かめる**。確かめられない値は書かずに公式を案内する）。
- Evernote のオフラインノートの対象プランと円の料金は、evernote.com を読める環境で確かめる。

## 5.33 2026-09-26 夜〜09-29：他社の事実とシンプルメモ自身の機能の点検（第20〜第24弾）、転載探しの締め、台帳の付け忘れの補記

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/26 19:42 | [#1635](https://github.com/simplememofast/simplememo/pull/1635) | 第20弾（11ページ）：自分宛てメールの比較ページ（Email Me・Note To Self Mail・Captioo・mail-to-self・iOS ショートカット、日英）と /voices/ の Captio の書き方 |
| 9/26 20:10 | [#1636](https://github.com/simplememofast/simplememo/pull/1636) | 第21弾（12ページ）：Obsidian・PKM 系の比較ページ。/vs/obsidian の FAQ が Obsidian 連携を否定していた（「Vault に直接書き込めない」）、英語 CTA の「Full features for 7 days.」、他社の誤り |
| 9/26 20:40 | [#1637](https://github.com/simplememofast/simplememo/pull/1637) | 第22弾（22ページ）：Apple Notes・Simplenote・OneNote・Roam ほか、無料プランの「機能制限なし」「no feature gates」（「Obsidianのみに保存」は Premium） |
| 9/29 20:46 | [#1665](https://github.com/simplememofast/simplememo/pull/1665) | 第23弾（39ページ）：/vs/ の一覧表と比較ページの計測していない起動時間、他社の暗号化・オフラインのセル、シンプルメモ自身の AI・タグ・音声入力・Apple Watch を「なし」としていたセル |
| 9/29 21:14 | [#1669](https://github.com/simplememofast/simplememo/pull/1669) | 第24弾（9ページ）：Captio のページ群（終了理由の作り話・出典の無い引用）、/en/send-email-to-yourself・/en/captio-migration-guide・/en/blog/best-note-to-self-apps-2026 の他社とシンプルメモの誤り、/vs/ の導入文と /en/blog/how-to-email-yourself-note-iphone の「1秒以内に送信」「タグなし」 |
| 9/29 21:40 | [#1671](https://github.com/simplememofast/simplememo/pull/1671) | 計測の台帳の note（第17弾と第20〜第24弾、#1618・#1629・#1631・#1633 の付け忘れを含む）、`growth/data/annotations.json` の6行、この §5.33、オーナー判断 #37・#42 の更新 |
| 9/29 22:00 | [#1675](https://github.com/simplememofast/simplememo/pull/1675) | 第25弾（11ページ）：Captio との関係の言い過ぎ（英語のページの「The Captio Replacement」「the most direct Captio replacement … is it」「The Closest Match」「CLOSEST TO CAPTIO」「the three most popular Captio replacements」「the ideal destination」、日本語の比較記事の「最も近い」）を「Captio alternative」「同じ open-type-send の流れ」に。/en/vs/drafts の FAQ の「type and auto-send」も |
| 9/29 22:25 | [#1676](https://github.com/simplememofast/simplememo/pull/1676) | 第25弾の計測の台帳の note（engage-2026-08-11-next-step・brand-2026-08-11-entity-merge）と annotations の行、§5.33 の追記、オーナー判断 #41 の追記 |
| 9/29 22:57 | [#1678](https://github.com/simplememofast/simplememo/pull/1678) | 第26弾（17ページ）：オーナー判断 #38 に沿って、比較ページの「向いている人」の欄の「確実に」「reliable」を「オフラインで書いたメモも、つながったら送りたい」に。/faq（日英）の「極限まで速く・確実に」、/en/vs/line-keep-memo の CTA の説明「More reliable memo storage than LINE Keep.」も |
| 9/29 23:22 | [#1680](https://github.com/simplememofast/simplememo/pull/1680) | 第26弾の計測の台帳の note と annotations の行、9/29 のオーナー判断（#36・#38・#40・#41）の記録 |

### オーナーの判断（9/29 22:27、毎晩の確認の報告への回答）

| # | 判断 | 対応 |
| --- | --- | --- |
| 36 | `useTether.io` の聞き取りの依頼に**返信しない** | 送信の凍結中のため。support@ は読むだけの確認を続ける |
| 38 | 比較ページの「確実に」を**言い換える** | 第26弾 [#1678](https://github.com/simplememofast/simplememo/pull/1678)（9/29 22:57）で実施 |
| 40 | 「ずっと無料」「free forever」「恒久的に」を**「利用期間の制限なし」に言い換える** | 第27弾 [#1703](https://github.com/simplememofast/simplememo/pull/1703)（9/30 10:02）で実施（§5.34）。利用規約は変えていない（#43）。以下は 9/29 時点の予定：9/30 に実施予定。約79ページのほか、JSON-LD の offer の説明を作る `scripts/inject_app_schema.py`（とそのテスト）、`scripts/check-pr-facts.mjs` の案内文、`llms.txt` も同じ言い方にそろえる。App Store の説明文（`docs/aso_metadata_*.md`）はサイトからは変えられない |
| 41 | 計測の無い所要時間を**言い換える**（「数秒で」「すぐに」に。数字は計測した0.4秒だけ残す） | 第28弾 [#1709](https://github.com/simplememofast/simplememo/pull/1709)（9/30 11:05）で実施（§5.34）。`/fastest-voice-memo` は #1701 が先に書き直した。アプリの画面は #44。以下は 9/29 時点の予定：9/30 に実施予定。`/fastest-voice-memo`（日英）の「実測で約5秒」を含む。アプリの画面の「最短5秒」はサイトからは変えられない |

### 中断（9/26 21:07〜9/29 20:07）

- アカウントの週の利用上限に達し（解除は 9/29 08:00 JST）、ブラウザ操作の安全確認も止まったため、第23弾のアップロード（33ディレクトリ中23）の途中で止まった。
- その間に main へ #1638〜#1664 が入った（多くは定期の自動作業。#1651 は 9/28 の SEO 監査の修正で全424ファイル：speakable の除去、FAQ の JSON-LD と表示の整合、App Store の版と評価の更新ほか。#1652 は OG 画像の軽量化）。9/26 の作りかけのブランチ `claude/vs-pages-batch23-2026-09-26`（PR なし）はこれと食い違うので使わず、9/29 の main から第23弾を作り直した（日付は 9/29）。
- 9/26 21:00 に予約していた毎晩の確認は 9/29 20:07 に届いた。

### 見つけたこと（意外な残タスク）

| 見つけたこと | 対応 |
| --- | --- |
| **比較表でシンプルメモ自身の機能を「なし」としていた**：AI（Craft・メモポスト）、タグ（Evernote・Google Keep、Tana の本文）、音声メモ（Google Keep）、Apple Watch（Drafts・/en/send-email-to-yourself）、自動化（/en/blog/captio-shutdown-alternatives）、「AI処理を行わないため第三者サーバーへのデータ送信なし」（/blog/ai-vs-simple-memo）。端末内 AI のタイトル・タグ付与（2026年7月から）より前の書き方が残っていた | 第23・第24弾で直した（根拠は `/ai-tags/`、`/voice-input/`、`/apple-watch/`、App Store の説明） |
| **/vs/ の一覧表**：※の無い起動時間は編集部の目安値のまま、Apple Notes「iCloud E2E」、Google Keep・Notion の暗号化「なし」、LINE Keep メモ「終了」ほか | 第23弾 |
| **/en/blog/captio-shutdown-alternatives が Captio の終了理由を作っていた**（「市場の変化で有料の単機能アプリが売れなくなった」「広告だらけにしたくないので自分の条件で終えた」と開発者が言ったことにしていた）。ほかに Note to Self Mail を「Captio の終了後に登場」（実際は 2016年から）、他社の起動時間（1.2秒・1.4秒・2〜3秒）、「広告あり」「アカウント必須」 | captio.co の告知の文（資源を割けなくなった、約2年前に App Store から撤退、「email yourself」で探すよう案内）に合わせた（第24弾） |
| **/blog/captio-discontinued**（日英）：「2秒でメールの受信箱へ」の引用と「多くのブログやポッドキャストで紹介」「メモアプリの完成形」、Captio の送信速度「約1-2秒」 | 出典の無い引用と数字を外し、Engadget（2010年9月）の紹介にした（第24弾） |
| **/en/captio-migration-guide**：Drafts の「Mail アクションは Pro 限定、無いとメールを送れない」（無料でも組み込み・Directory のアクションは実行でき、作成・編集が Pro） | 第24弾 |
| **/en/send-email-to-yourself**：Note To Self Mail の Pro の中身（App Store では添付・スケッチ・音声・スキャン、US $4.99）と「ドイツ発・欧州で有名」、Drafts の「Fastest text capture」（同じページの計測では最も遅い 1.5秒）、シンプルメモの評価「4.4」（US の実物は 9/29 に 5.0・1件） | 第24弾 |
| **シンプルメモの宛先は1つ**（アプリの設定の宛先は1件、変更は設定で）なのに、/en/blog/best-note-to-self-apps-2026 の表は「Multiple」 | 第24弾 |
| **オーナー判断 #37（ホーム画面ウィジェット）**：iOS のソースに「声でメモ」ウィジェット（ホーム画面の小・ロック画面の丸。タップでアプリを開いて音声入力を始める）と、iOS 18 以降のコントロールセンター／ロック画面のコントロールがある | 事実として確認できたので #37 を閉じる。サイトの「ホーム画面にウィジェットを追加」「ロック画面ウィジェット」は正しい |
| **オーナー判断 #42（版と評価）**：9/28 の #1651 で、公開ページは 5.9.9・評価 4.1（27件、日本）に更新済み | #42 を閉じる |
| **Captio との関係の言い過ぎが英語のページに残っていた**：「Download Simple Memo -- The Captio Replacement」（定冠詞つきで、公式の後継と読める）、「the most direct Captio replacement, Simple Memo is it」、「The Closest Match」「CLOSEST TO CAPTIO」、「the three most popular Captio replacements」。「開く→書く→送る」の流れは Note To Self Mail などほかのアプリにもあり、「いちばん近い」は確かめられない | 第25弾で「Captio alternative」「同じ流れ」に直した（オーナーの決まり：Captio については「Captio alternative」「Captio のワークフローに着想を得た」だけを使う）。`meta keywords` の検索語と /en/captio-alternative の題「Best Captio Alternative in 2026」は残した |
| **計測の台帳の付け忘れ**：第17弾（#1631）の note と annotations の行、#1618 の aio-2026-08-12-entity-attribution、#1629・#1631・#1633 の aio-2026-08-11-answer-blocks（どちらも /blog/business-memo-apps-2026 が対象） | この PR で補記した |
| **定期の確認のうち「被リンク掲載確認」「SaaSHub の承認確認」（どちらも毎週月曜）が 9/28 に失敗** | 利用上限の期間中の実行で、中身の問題ではない見込み。次回（10/5）の結果を見る |

### PR TIMES（「対話メモ」）の転載・紹介（探索は 9/29 で終了）

- 新しく見つけた紹介：**AppBank（9/24、編集記事）**。サイトへのリンク2本（`/obsidian/`・`/`）と App Store へのリンクは **rel なし（follow）**、robots は index 可。**Memolith（9/24、他社の開発者ブログのニュース）**。リンクは PR TIMES だけで、シンプルメモのサイトへのリンクは無い（index 可）。
- 以前からあったのに台帳に無かった紹介：**AppBank（8/03、AI タグの記事）**。`/`・`/ai-tags/` と App Store へ rel なし。**Yahoo!ニュース PR（7/8、プレスリリースをもとに AI が作成した記事）**。`/`・`/apple-watch/` と App Store へ rel なし、robots は noarchive（index 可）。
- 転載（すべて nofollow）は財経新聞・NEWSRELEA.SE・ASCII STARTUP の3件のまま。

### 告知の結果

- iOS Dev Weekly 769号（9/25）に #1547 の記事は載っていない。iOS Feeds の新着にも無い（登録していない）。

### 受信箱（support@、読むだけ）

- 9/26〜9/29 の受信は Product Hunt の通知1通だけ。返信の要るものは無い。

### 次にやること

- 9/26 の毎晩の確認の依頼にあった次の弾（英語の「~1-second launch」、`en/blog/fastest-note-app-iphone-2026` の撤回と書き直し、`en/captio-migration-guide` の競合値、`blog/brain-science-memo` の忘却曲線）は、読んで確かめたところ対応済みだった：英語の「~1-second launch」と fastest-note-app-iphone-2026（訂正の告知つきで計測の記録に合わせて書き直し）は 9/26 の #1618（第7弾）、captio-migration-guide の競合値は第24弾、忘却曲線も #1618（エビングハウスの記録の値と条件、Murre & Dros 2015 の再現。英語版の参考文献は #1624 で点検）。
- `fastest-voice-memo`（日英）の「実測で約5秒」「タップ位置と所要時間は実測値」には、計測の記録がリポジトリに無い（アプリの画面の文言も「最短5秒」）。オーナー判断 #41 に追記した。
- オーナー判断 #40（「利用期間の制限なし」への言い換え）と #41（計測の無い所要時間の言い換え）を 9/30 に第27・第28弾として行う（どちらもページ数が多く、日付をまたぐとサイトマップの lastmod がずれるため、9/29 の夜には始めなかった）。
- 毎晩の確認は 9/30 20:40 JST に予約した（Chrome を使う他の定期作業と重ならないよう 21:00 から動かした）。10/08 まで毎日かけ直す。

## 5.34 2026-09-30：オーナー判断 #40・#41 の実施（第27・第28弾）、8言語のトップの誤り（第29弾）、並行する事実訂正との重なり

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/30 10:02 | [#1703](https://github.com/simplememofast/simplememo/pull/1703) | 第27弾（74ページ・JSON-LD の生成・`llms.txt`）：オーナー判断 #40 に沿って、無料プランの「ずっと無料」「free forever」「永久免费」ほかを「利用期間の制限なし」「with no time limit」に。`/how-to`（日英）の「全機能を制限なくお試しください」（「Obsidianのみに保存」は Premium）も外した |
| 9/30 11:05 | [#1709](https://github.com/simplememofast/simplememo/pull/1709) | 第28弾（112ページ）：オーナー判断 #41 に沿って、計っていない所要時間（「設定は3分で完了」「3-Minute Setup」「5秒で送信」「10秒以内に記録」「under 10 seconds」ほか）を「すぐに」「数秒で」に。0.4秒は「タップから0.4秒で書き始められる」（記録・送信までの時間とは書かない）。出典の無い「Ideas last about 7 seconds」「3秒ルール」を外した |
| 9/30 11:31 | [#1711](https://github.com/simplememofast/simplememo/pull/1711) | 第29弾（16ページ）：8言語のトップ（es・pt-BR・ko・zh・zh-Hant・id・tr・ar）の FAQ の誤り（SMTP の設定が要る、サーバーに一切保存しない、アプリは日本語と英語だけ）と「約1秒」「最速」「最高の Captio の代わり」「失わない」を、/faq・/en/faq と App Store の言語の欄に合わせて直した。あわせて利用例（teachers・health・journaling・entrepreneurs・freelancers）と /en/send-email-to-yourself のプライバシーの答えの言い過ぎ（「第三者には共有されない」「クラウドに保存しない」「第三者サーバーにデータは保存されない」など）を /en/faq の書き方にそろえた |
| 9/30 12:03 | [#1713](https://github.com/simplememofast/simplememo/pull/1713) | 第27〜第29弾の計測の台帳の note と annotations の行、この §5.34、オーナー判断 #40・#41 の完了、#43・#44 の追加 |

### 並行する事実訂正との重なり（意外な残タスク）

- 9/30 は別の作業（#1683・#1701 ほか、PR の題は「事実訂正」）も同じサイトの言い過ぎを直している。**#1701（9/30 09:41）が `/fastest-voice-memo/`（日英）を書き直し**（5秒の保証・ロック解除不要・未計測の比較を撤回、題を「iPhoneのアクションボタンで音声メモを開く設定と条件」に）、09:36 に出した第27弾 #1703 と Article の `dateModified` の行で衝突した。
- 衝突した2ファイルを **#1701 の版に、JSON-LD の Free の offer の言い換え（`scripts/inject_app_schema.py` で作り直した1行）だけを載せた版** に差し替えて解いた（ブランチに2コミット）。手元で main と合流させた結果は衝突なしで、合流後の中身に CI と同じ手順を流して 141 手順中 138 が通過（残る 3 は手元では流していない手順。§5.35 の訂正を参照）。経緯は #1703 にコメントした。
- 第28弾では、このページ向けに用意していた書き換え（題・h1・FAQ・デモの時間の表示）を捨て、ほかのページからのリンクの文言だけを新しい題に合わせた（「アクションボタンで音声メモ」「Voice Memo with the Action Button」。トップの帯は文字数を変えない）。
- 同じく #1704（9/30 10:28）が `/voice-input/`（日英）のリンクの文言（「アクションボタンで声のメモを呼び出す」「Open Voice Memo with the Action button」）と秒数の保証を先に直していて、第28弾のブランチと衝突した。この2ページは #1704 の版をブランチに載せて解いた（第28弾はこの2ページを変えない）。
- 以後の弾は、作る直前に main の直近のマージと変更するファイルの重なりを確かめる。同じページを別々に直すと、衝突するか、片方の直しが消える。

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **利用規約（`/terms`・`/en/terms`）の「Free：原則 1日3通まで（初日から適用・ずっと無料）」** | 契約の本文なので第27弾では変えていない。オーナー判断 #43 |
| **`scripts/check-pr-facts.mjs` の案内文**「現行は初日から恒久的に『1日N通までずっと無料』」（公開ページではなく検査の出力） | このファイルはレビュー返信の門の指紋（`data/review-gate-pin.json`）で留められていて、1文字でも変えると `simplememo-ios` の日次の門が止まる（第27弾の手元の検査で `Review reply gate pin` が落ちて判明）。変えていない。変えるなら iOS 側の指紋の更新と同じ時に |
| **App Store の実物（9/30、日米）の説明文には「ずっと無料」「forever」「約1秒」「最短」「5秒」「無料体験」は無い**（日本：「無料プランでは1日3件までメモを送信できます」、米国：「The free plan allows up to 3 memo sends per day.」。WebFetch で本文を読んで確認。レビューの文は除く）。一方、`docs/aso_metadata_*.md`（6月の下書き）には「After trial: 3 free sends per day, forever」「Free forever」（英語）、「約1秒で起動」「もう忘れません」（日本語）が残る | 下書きは公開面ではなく、読むスクリプトも無い。App Store Connect に貼り直すときは、この下書きではなく実物を元にする |
| App Store の実物の版は 5.9.11（9/30、日米）。サイトの JSON-LD の `softwareVersion` は 5.9.9 | 版の数字は日次の App Store の事実の検査（`scripts/check-store-facts.mjs` と Codex の #1576）の担当。この作業では触れない |
| アプリの画面の「おすすめの使い方（最短5秒）」（旧 `/fastest-voice-memo/` の FAQ による） | サイトからは変えられない。オーナー判断 #44 |
| **8言語のトップ（es・pt-BR・ko・zh・zh-Hant・id・tr・ar）が、日本語・英語のページで直し終えた誤りをまとめて残していた**：FAQ に「SMTP に対応したメールなら使える。アカウントや SMTP の設定を入力する」（実際は宛先を決めて認証するだけで、パスワードや SMTP の設定は不要）、「サーバーに一切保存しない」「端末から受信箱へ直接届く」（実際は送るときだけ送信用のサーバーを通る）、「アプリは日本語と英語だけ」（App Store では10言語。es・pt・zh・zh-Hant・ar を含み、ko・id・tr は含まない）。ほかに「約1秒で送信」「最速のアプリ」「最高の Captio の代わり」「メモを失わない」 | 第29弾で `/faq`・`/en/faq` と App Store の言語の欄に合わせて直した。これまでの弾は日本語・英語のページを対象にした一括置換で、8言語のトップは言い回しが違うため漏れていた |
| 第27弾の PR の本文で、影響する実験のうち aio-2026-08-11-answer-blocks（`/ai-tags/` の FAQ の料金の答え）、internal-link-2026-09-02-003（`/obsidian/` の JSON-LD）、gsc-note-to-email-20260923（`/note-to-email/` の JSON-LD と lastmod）を書き漏らした | この PR で note を付けた |

### 残したもの

- `/vs/captioo`（日英）の「永久無料」「free forever」：Captioo 自身の App Store の記載の引用。
- 計測した 0.4秒（iPhone 16e・ウォーム起動・タップから入力できるまで）、ほかのアプリの計測値（ベンチマークの記事）、読者の習慣の時間（ポモドーロの25分、GTD の2分ルール、朝メモの3分テンプレートなど。アプリの速さの主張ではない）。

## 5.35 2026-09-30 昼：Captio のページ（第30弾）、計っていない所要時間の残り（第31弾）、メモの送信元アドレス（第32弾）、利用例の宛先とオフラインの再送（第33弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/30 12:07 | [#1714](https://github.com/simplememofast/simplememo/pull/1714) | 第30弾（Captio のページ5つ）：Captio の事実（添付・表示言語・件名）を MacStories「Captio 2.0 Released」と旧 App Store の説明（v2.8.1）に合わせ、シンプルメモ自身の機能の誤り（件名フィールド・複数の宛先・Premium の送信履歴・Android・ウィジェットの追加の仕方・送信完了の通知・設定アイコンの位置）と「Captio以上」などの比較を直した |
| 9/30 12:37 | [#1716](https://github.com/simplememofast/simplememo/pull/1716) | 第31弾（54ページ）：オーナー判断 #41 の漏れ（「約1分」「3分」「30秒セットアップ」ほか）、計っていないアプリとの速さの比較（「圧倒的に速い」ほか）、`/faq`・`/en/faq` の「200〜300ミリ秒台」を計測の0.4秒に、`/vs/apple-notes`（日英）の「ウィジェット不要」を訂正 |
| 9/30 13:02 | [#1718](https://github.com/simplememofast/simplememo/pull/1718) | 第32弾（20ページ）：設定ガイドと読み物の52か所の送信元 `noreply@simplememofast.com` を実際の `noreply@mail.simplememofast.com` に。`/faq`・`/en/faq` の対応デバイス（iPad→Apple Watch）・サーバーの保存・暗号化の範囲、`/en/send-email-to-yourself` の TL;DR |
| 9/30 13:49 | [#1720](https://github.com/simplememofast/simplememo/pull/1720) | 第33弾（49ページ）：利用例（日英36ページ）の宛先の誤り（「送信先を複数設定」「2つ目の宛先」「自分と共有リストの両方に送る」。宛先は1つ）、オフラインの再送の言い切り、計っていない所要時間、「永続保存」、出典のない数字。比較ページと設定ガイドの同じ種類の残りも |
| 9/30 14:13 | [#1723](https://github.com/simplememofast/simplememo/pull/1723) | 第30〜第33弾の計測の台帳の note と annotations の行、この §5.35、#45・#46 の追加、§5.34 の訂正 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **メモの送信元アドレスが52か所で誤っていた**：Gmail・Outlook・Yahoo!メール・iCloud・独自ドメイン・Gmailのスターの設定ガイドと読み物が、フィルタ・許可リスト・検索の例に `noreply@simplememofast.com` を案内していた。実際の送信元は `noreply@mail.simplememofast.com`（`/faq` と同じ。9/29 にアプリから送ったメモも、この送信元から届き、`noreply@simplememofast.com` から届いたメールは0件） | 第32弾で直した。アドレスが5文字長くなるので、20ページで `<details>` を開いて、アドレスを含む語が画面と囲みの箱からはみ出さないことを Blink（5幅）と WebKitGTK（3幅）で描画して確かめた（0件）。`docs/obsidian/AUTOPILOT_RUNBOOK.md` には、9/3 に `from:noreply@simplememofast.com` が WebKit で +1px はみ出した記録がある（いまは `overflow-wrap: break-word` の網で折り返す） |
| **`/faq`・`/en/faq` の対応デバイスに iPad（iPadOS 16.0以降）**。App Store の互換性の欄（日米、9/30）は iPhone と Apple Watch だけ | 第32弾で Apple Watch（watchOS 9.0以降）に |
| **利用例の36ページ（日英）が、宛先が複数あるように書いていた**（仕事のタスク・子育て・買い物リスト・料理・ペット・起業家・ライター）。メーリングリストを宛先にする案も「全員に即共有」「リアルタイム」と書き、自分宛てではなくなることと、そのアドレスで認証コードを受け取る必要があることを書いていなかった | 第33弾で直した。宛先が1つであることは `/faq`（新しいアドレスを認証すると以降はすべて新しいアドレスへ）、公開ロードマップ、iOS のソース（`recipientEmail` の1つ）で確かめた |
| **オフラインの再送を言い切った文**（「地上に出た時点で自動的に送信されるので、何もする必要はありません」「the moment you emerge… Not a single note is lost」）。`/faq` は「次回アプリ起動時またはバックグラウンドタスクとして再送を試みる」「通信が戻ったらアプリを開いて確かめる」と書いている。iOS の実装メモ（`docs/phase0_findings.md`）でも、再送の契機は回線復帰（`NWPathMonitor`）・バックグラウンド処理（`BGTask`）・起動の3つ | 第33弾で言い切った文だけ直した。「電波が戻ったら自動送信」のような短い書き方は `/faq` と同じ言い方なので残した |
| **出典のない数字**：アイデアのページの数字の欄「30秒 ひらめきが消えるまでの時間」「~30s How fast ideas fade from memory」（第13弾で FAQ だけ直して、数字の欄が残っていた）、「面接の記憶は30分が限界」、「3日で日課になる」 | 第33弾で外した（数字の欄は「3通 無料プランで1日に送れる数」に） |
| **英語版だけに残っていた言い過ぎ**：`/en/vs/line-keep-memo` の「permanently saved… eliminating the risk」「zero risk of data loss」（日本語版は「メールの保存は、お使いのメールサービスの方針に従います」に直してあった）、`/en/use-cases/reading-notes` の「No need to confirm delivery」（日本語版は「送信の結果は後で送信履歴から確かめられます」）、`/en/vs/bear`・`/en/vs/obsidian`・`/en/vs/apple-notes` の「in under a second」 | 第33弾で日本語版にそろえた。日本語版だけを直す弾が多かったため、英語版に同じ種類の残りがないかを次の弾でも見る |
| **条件の無い「最速」「Fastest」が日英で約30か所** | オーナー判断 #45 |
| **`/faq` のレート制限の表（端末ごとに1日20通、全体で1日90通）と Premium の「送信無制限」が食い違って見える** | オーナー判断 #46（送信用のサーバーの設定はこのリポジトリに無く、どちらが正しいか確かめられない） |
| Captio の事実の出典：MacStories「Captio 2.0 Released」（1行目が件名・件名の接頭語・添付・1か月分のアーカイブ・$1.99）、旧 App Store の説明（v2.8.1：共有拡張で text, links, photos を送れる、オフラインでは端末に一時保存、言語は English・Dutch・Swedish） | 第30弾の根拠。Captio の暗号化・ウィジェット・宛先の数は確かめられないので「記録なし」「ここでは未確認」にした |
| **手元の CI の結果の書き方の訂正**：第14弾以降の PR の本文と §5.34 に「141（140）手順のうち 138（137）が通過、3 は main への push 時だけ動く手順で対象外」と書いていたが、push 時だけ動くのは IndexNow の通知の1つだけ。残る2つ（WebKit の導入、横スクロールの確認（報告のみ））は重いので手元では流していない手順で、PR の CI では動いている | 第32弾の PR から正しい書き方に。§5.34 の同じ書き方も直した。これまでの PR の本文は直していない |
| 第27〜第29弾の台帳の PR（#1713）が、同じ時間帯の別の作業（#1712）と experiments・annotations の末尾で衝突した | 末尾から2つ手前に差し込む書き方にして解いた（この PR も同じ書き方） |

### 残したもの

- 「電波が戻ったら自動送信」のような短い書き方（`/faq` と同じ言い方で、再送の契機の1つと合う）。
- `/en/send-email-to-yourself` の速度の表（iPhone 15 Pro・コールド起動・2026年3月の別の計測。方法はページに明記）。
- `/use-cases/meeting-notes`（日英）の「会議中の30秒」（このページが扱う範囲の言い方）、`/en/devlog/day1` の「Captio が1秒以内に届けてくれた」（開発者の思い出として書かれた記事）、使い方の場面の時間（「電車が来るまで2分」など）。
- 差出人の表示名（日本語の設定では「シンプルメモ」、英語では「Simple Memo」と表示されるものがある）。

## 5.36 2026-09-30 午後：だれのサーバーか（第34弾）、llms.txt（第35弾）、App Store の検索語（第36弾）、公開版 5.9.11（第37弾）、設定の歯車の位置（第38弾）、FAQ と送信用のサーバーのソース（第39弾）、アプリの表示と違うボタン・設定の名前（第40・第41弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/30 14:11 | [#1722](https://github.com/simplememofast/simplememo/pull/1722) | 第34弾（16ページ）：「no server copy」「サーバー非保存」「サーバーにデータが残らない」を、だれのサーバーか分かる言い方（シンプルメモのサーバーに／自社サーバーに）に。利用例の言い切りの残り（「Zero chance of forgetting」「一つも逃さない」「あらゆる瞬間のひらめきを逃しません」） |
| 9/30 14:23 | [#1724](https://github.com/simplememofast/simplememo/pull/1724) | 第35弾（`llms.txt`）：iPad 版は無い、Captio との関係、だれのサーバーか、メールアドレスのハッシュの保存（リマインダーのオプトインにかかわらず作られる）、アプリの表示言語10とサイトの言語 |
| 9/30 14:43 | [#1725](https://github.com/simplememofast/simplememo/pull/1725) | 第36弾（10ページ）：設定ガイドの App Store の検索語「Simple Memo Fast」を、英語は「Simple Memo」、日本語は「Obsidian連携シンプルメモ」だけに。`/en/blog/captio-discontinued` の検索語も |
| 9/30 14:55 | [#1726](https://github.com/simplememofast/simplememo/pull/1726) | 第37弾：App Store の公開版 5.9.9 → 5.9.11（9/30 08:54 JST 公開）。JSON-LD の softwareVersion（26ページ）と `llms.txt` の版・確認日 |
| 9/30 15:09 | [#1728](https://github.com/simplememofast/simplememo/pull/1728) | 第38弾（13ページ）：設定ガイドの歯車の位置「右下」→「左上」、FAQ（日英）の「左上の履歴ボタン（時計アイコン）」の場所を外した |
| 9/30 15:36 | [#1729](https://github.com/simplememofast/simplememo/pull/1729) | 第39弾（4ページ）：`/faq`・`/en/faq` の送信の上限の表（古い仕様書の値）、「サーバーに残りますか？」の答え（プライバシーポリシーと食い違っていた）、差出人名（日本語のアプリでは「シンプルメモ」）。`/devlog/relay-api-design`（日英）に上限の追記 |
| 9/30 15:43 | [#1730](https://github.com/simplememofast/simplememo/pull/1730) | 第40弾（5ページ）：日本語の設定ガイドのボタン名「確認する」→「認証」、「コードを再送する」→「コードを再送信」、認証メールの件名（「認証コード」を含む）と差出人名 |
| 9/30 15:48 | [#1731](https://github.com/simplememofast/simplememo/pull/1731) | 第41弾（3ページ）：設定の名前「利用解析」→「利用状況の分析」（`/privacy-architecture/`・`/blog/memo-app-privacy`）、「音声自動入力」→「起動時に音声入力を自動オン」（`/blog/obsidian-voice-input`） |
| 9/30 16:06 | [#1732](https://github.com/simplememofast/simplememo/pull/1732) | 第34〜第41弾の計測の台帳の note と annotations の行、この §5.36、オーナー判断 #46 の解決・#47・#48 の追加 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **公開版の更新は自動では入らない**：日次のワークフロー（`seo-daily.yml` の「Store facts vs App Store (report only)」）は `node scripts/check-store-facts.mjs --net` でずれを報告するだけで、`--write` を付けない（人が実物を読んで動かす、というワークフローのコメントのとおり）。第35弾の PR の本文に「版と評価は日次の同期が直す（Codex の #1576 の担当）」と書いたのは誤りで、#1576 は確かめ方を変える PR | 第37弾で 5.9.11 に。#1724 の本文を訂正した。毎晩の確認で `--net` を流し、ずれがあれば `--write` と `sync_constants.js --write` の PR を出す |
| **ガイドの App Store の検索語「Simple Memo Fast」**：どのストアでもアプリの名前ではなく、iTunes Search API（9/30）で米国9番目・英国3番目・日本7番目。「Simple Memo」は米英加豪で1番目、「Obsidian連携シンプルメモ」は日本で1番目 | 第36弾で直した。検索 API の並びは App Store アプリの検索結果の近似なので、ページには順位を書いていない |
| **設定の歯車の位置**：設定ガイド（日英11ページ）は「右下」。App Store のスクリーンショット（日本のストア、9/30）とサイトの画像 `assets/img/obsidian-voice-input/01-compose.webp`（8/11）は、どちらも左上に歯車・右上に送信・右下にマイク。FAQ の「左上の履歴ボタン（時計アイコン）」はどちらの画像にも写っていない | 第38弾で歯車を左上に、履歴は場所を書かない言い方にした（履歴の画面そのものは開発記事 day1 などにある） |
| **だれのサーバーか**：「no server copy」「サーバー非保存」は、配信サービス（Resend）まで含めてどこにも残らないように読める。プライバシーポリシーと `/faq` の約束は「当社は恒常的に保存しない」まで | 第34弾・第35弾で「シンプルメモのサーバーに」「自社サーバーに」と書き分けた |
| **`llms.txt` のメールアドレスの保存**：「only when reminder emails are opted into」と書いていたが、プライバシーポリシーは送信 ID と宛先アドレスのハッシュの対応を Cloudflare D1 に作ると書き、リマインダーのオプトインを条件にしていない | 第35弾でポリシーに合わせた |
| **FAQ の送信の上限の表が古かった**：`/faq`・`/en/faq` の表（端末ごとに1分2通・1日20通、IP ごとに1時間10通、全体で1日90通）は古い仕様書の値。送信用のサーバー（非公開の `simplememo-api`）のソースでは、端末ごとの上限は2026年6月1日、全体の1日の上限は6月2日に撤去され、いまは IP アドレスごとの1時間あたりの上限だけ | 第39弾で直した。オーナー判断 #46（Premium の「送信無制限」との食い違い）はこれで解けた。値そのものは FAQ に書いていない |
| **「サーバーに残りますか？」の答えがプライバシーポリシーと食い違っていた**：FAQ は「残りません」「すべてハッシュ化・匿名化」「128bit ハッシュ（レート制限用）」「デバイストークンもハッシュ化されレート制限計測にのみ利用」。ポリシーは「送信IDと宛先メールアドレスのハッシュの対応を D1 に保存」「完全に匿名の情報として扱わない」。ソースでも、認証の記録は端末ごとの識別子とメールアドレスのハッシュの組（1年） | 第39弾でポリシーとソースに合わせた。ソースを読んで気づいた、プライバシーポリシーの書き方に関わる点は、公開の台帳ではなくオーナーに直接確かめる |
| **差出人名**：送信用のサーバーは、アプリの言語が日本語のとき差出人名を「シンプルメモ」、それ以外で「Simple Memo」にしている。`/faq` は「Simple Memo &lt;noreply@…&gt;」だった | 第39弾で直した（§5.35 の「残したもの」の差出人名の件はこれで解けた） |
| **アプリに無いボタン・設定の名前**：サイトが「」で示す名前を、iOS アプリ（非公開の `simplememo-ios`、main）の表示文字列（日英）と照らした。日本語の設定ガイドの「確認する」（アプリは「認証」）・「コードを再送する」（「コードを再送信」）、プライバシーのページの「利用解析」（アプリとポリシーは「利用状況の分析」）、音声入力の記事の「音声自動入力」（「起動時に音声入力を自動オン」）が無かった。英語のページはアプリと合っていた | 第40弾・第41弾で直した。ガイドの「メモ入力画面 → 歯車 → 設定」で宛先を入れる流れは、初回の案内の画面（「メールアドレスを教えてください」）との関係を実機で確かめていないので残した |
| **App Store のアプリ名がサイトの名前と違う**：米国「Simple Memo - Obsidian Voice」、日本「シンプルメモ - Obsidian連携・高速音声入力」 | オーナー判断 #47 |
| **App Store のスクリーンショットの「0.3秒起動」**：サイトの計測は 0.4 秒で、0.3 秒の記録は見当たらない | オーナー判断 #48 |

### 残したもの

- `/en/captio-alternative/` の検索語「Simple Memo - for Obsidian」（米英で2番目に出る。名前の扱いは #47 で決める）。
- `/en/captio-migration-guide/` のウィジェットを追加するときの検索語（ウィジェットの一覧はホーム画面のアプリ名で出るもので、確かめていない）。
- `/voices/`（日英）の利用者の声と「今後の対応」（送信ボタンの位置の検討。当時の記録）。
- 手順の言葉とアプリの画面の名前の細かなずれ（「宛先」「テスト送信」など。設定画面の画像は確認済みの状態しか写っておらず、入力の流れは確かめられない）。
- 利用規約の「サーバ側レート制限（例：端末あたりの1日上限等）」（契約の本文。変えるなら改定の手続き）、開発日誌 day1 の設計時の上限のコード（その日の記録）。

## 5.37 2026-09-30 夕方：実装と違う説明（第42〜第47弾）、記録の無い数値（第48弾）、AIタグ自動追加と自動録音の条件（第49〜第51弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/30 16:34 | [#1734](https://github.com/simplememofast/simplememo/pull/1734) | 第42弾（5ページ）：`/about/`（日英）の「Outbox は CoreData」→ AES-GCM で暗号化した端末内のファイル、「設計レベルで排除」の言い過ぎ、`/blog/memo-app-service-shutdown-risk` の AES-GCM の説明（端末内の暗号化で、通信は TLS）、`/devlog/day1`（日英）に言語と送信の上限の「2026-09 追記」 |
| 9/30 16:43 | [#1735](https://github.com/simplememofast/simplememo/pull/1735) | 第43弾（3ページ）：用語集「Outboxアーキテクチャ」（日英）の接続の監視・送信の表示・「配信された」・「完全削除」を実装どおりに、英語の E2E 用語集の「サーバーに何も保存しない」 |
| 9/30 16:56 | [#1736](https://github.com/simplememofast/simplememo/pull/1736) | 第44弾（7ページ＋`llms.txt`）：Apple Watch で自動で開くのは標準の入力画面、送信はペアリング中の iPhone が行う |
| 9/30 16:59 | [#1737](https://github.com/simplememofast/simplememo/pull/1737) | 第45弾（`/hands-free/` 日英）：「圏外でも3重に残す」→ 下書きは送信と同時に消える、自動音声入力の条件、プライバシー欄 |
| 9/30 17:07 | [#1738](https://github.com/simplememofast/simplememo/pull/1738) | 第46弾（`faq.html`・`llms.txt`）：「外部分析 SDK は使用していません」→ AppsFlyer SDK も組み込んでいる。`llms.txt` の宛先ハッシュ・鍵の保管 |
| 9/30 17:16 | [#1740](https://github.com/simplememofast/simplememo/pull/1740) | 第47弾（8ページ）：FAQ（日英）のプライバシーオーバーレイ（いまは有効でない）、Day1 の追記、関連リンクの紹介文、英語 FAQ の後回しの2問（Apple Watch・SDK） |
| 9/30 17:27 | [#1742](https://github.com/simplememofast/simplememo/pull/1742) | 第48弾：日本語トップの「150ms 送信リクエスト時間（API往復）」を外した（計測の記録が無い）、計測方法の記事（日英）に理由。フォントの部分集合の作り直し |
| 9/30 17:51 | [#1744](https://github.com/simplememofast/simplememo/pull/1744) | 第49弾（7ファイル）：AIタグ自動追加は Obsidian 連携と設定のオン（既定オフ）が条件（`/ai-tags/` 日英・FAQ の件名の決まり・`llms.txt`）、`/hands-free/` の自動音声入力の条件の残り |
| 9/30 19:22 | [#1749](https://github.com/simplememofast/simplememo/pull/1749) | 第50弾（トップ10言語）：AIタグ自動追加の条件、メールに入るのは件名の短いタイトルだけ（タグ・種別は Obsidian のノート）。英語トップの meta description・og/twitter の説明も。フォントの部分集合の作り直し |
| 9/30 19:28 | [#1752](https://github.com/simplememofast/simplememo/pull/1752) | 第51弾（30ページ＋`llms.txt`）：比較表・FAQ・本文の自動録音と AIタグ自動追加の言い切りに条件 |
| 9/30 19:48 | [#1754](https://github.com/simplememofast/simplememo/pull/1754) | 第42〜第51弾の計測の台帳の note と annotations の行、この §5.37、オーナー判断 #49〜#51 の追加、§5.36 の「この PR」の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **AIタグ自動追加は既定オフのオプトイン**：`simplememo-ios` の `SettingsManager.aiFormatEnabled` は既定 false、`MemoFormatPipeline.isActive` は機能フラグ・Obsidian 連携オン・ユーザーの明示オンの3つがそろったときだけ。サイトは「新しい操作はゼロ」「タグはAIが自動で付けます」「you never tag anything by hand」と、全員に自動で付くように書いていた | 第49〜第51弾で直した。アプリの既定や案内をどうするかはオーナー判断 #49。Premium を条件にするフラグ（`ai_requires_pro`）は既定オフで、API の配信値も false（いまは無料で使える、という書き方はそのまま） |
| **メールに入るのはタイトルだけ**：`SendManager.swift` は `MemoFormatPipeline` を件名（短いタイトル）にだけ使い、本文にタグは入らない。タグ・種別付きの追記は Obsidian のノート（`ObsidianManager.appendWithFormatting`）。トップのバナーは「整えてから、メールと Obsidian へ届けます」だった | 第50弾で書き分けた |
| **起動時の自動録音も既定オフ**：`voiceAutoStartEnabled` は既定 false、効くのは iOS 26 以降の音声入力対応端末だけ（非対応ではトグルが出ない） | 第45・第49・第51弾で条件を書いた |
| **アプリの表示言語の食い違い**：`LocalizationManager` の言語の一覧に ru・zh-Hant が無く、it・ko は翻訳が無い（端末の言語が ru なら英語、zh-Hant なら簡体字になる。pt-BR は pt.lproj に読み替えていて問題なし） | オーナー判断 #51。サイトの「10言語」は App Store の表記どおりなので、判断が出るまで変えない |
| **ほかの言語のアプリの表示名**：「AIタグ自動追加」の表示文字列は日本語と英語（"AI Auto-Tagging"）だけで、ほかの言語は `LocalizationManager` の英語のフォールバックで "AI Auto-Tagging" と出る | 第50弾の8言語のトップは設定の名前を英語の表示名で書いた |
| **記録の無い「150ms」**：トップの数字の帯の「送信リクエスト時間（API往復）」は `data/benchmark.json` にも CSV にも記録が無い。`150<span>ms</span>` と分かれていて、これまでの文字列の検索に掛からなかった | 第48弾で外した（オーナー判断 #41 のとおり） |
| **プライバシーオーバーレイは有効でない**：FAQ は「見えません。自動で被せられます」と答えていた | 第47弾で直した。アプリで有効にするかはオーナー判断 #50 |
| **Outbox は Core Data ではない**：`OutboxManager.swift` は AES-GCM で暗号化した1つのファイル（`outbox.enc`）。リポジトリに Core Data は無い | 第42弾で直した |
| **同じ直しの重なり**：`/hands-free/` の og:description・twitter:description の条件は、別の作業の #1748（9/30 18:50）が先に入れた | 第51弾から外した（同じ文言なので衝突を避けた） |
| **Codex の下書き #1733**（`en/faq.html` の Apple Watch の問い）：同じ文を第47弾 #1740 に取り込んだため、`en/faq.html` で衝突する状態 | #1733 は開いたまま。閉じるかどうかは Codex の担当か、オーナー |
| **awesome 系リスト**：§6.5 の7件はすべて open のまま、コメントなし（9/30 16:05 に確認） | 台帳の状態（提出済み・レビュー待ち）は変えない |

### 残したもの

- 「摩擦ゼロ」「zero friction」などの慣用の言い方（数値や機能の断定ではない）。
- `/about/` の「すべて一人で担当」（開発者本人の紹介）。
- 英語トップの題「AI Auto-Tagging Notes to Email & Obsidian」（実験の台帳で英語トップは対象外・英語への投資は凍結中とされており、題の変更はこの修正の範囲外）。
- 処理の場所（端末内・外部送信なし）だけを述べる文、「AI は端末内のタイトル・タグ付けにとどめている」という機能の範囲の説明、「AIタグが欲しい人に向く」「乗り換える理由」のような機能の有無の比較（`/vs/email-me-app/` など）。
- 「Lock Screen widget」の記述（英語の記事の一部）：iPhone のウィジェットはホーム画面（小）とロック画面（円形）に対応しており（`SimpleMemoWidget.swift` の supportedFamilies）、記述どおり。コントロールセンターの操作（iOS 18 以降）と Apple Watch の文字盤・スマートスタックも、ソースにある。

## 5.38 2026-09-30 夜：FAQ の解約手順のプラン名（第52弾）、/download/ の旧名（第53弾）、毎晩の確認

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/30 20:11 | [#1756](https://github.com/simplememofast/simplememo/pull/1756) | 第52弾：`/faq`・`/en/faq` の解約手順のプラン名を App Store の表示に（日本「シンプルメモ：プレミアム」「シンプルメモ：年間プレミアム」、米国 "Simple Memo Premium"・"Simple Memo Annual Premium"） |
| 9/30 20:17 | [#1757](https://github.com/simplememofast/simplememo/pull/1757) | 第53弾：`/en/download/` の日本の App Store の旧名を “Captio式シンプルメモ” に戻した（#1484 の日英分離でサイトの英語名が入っていた）。`/download/`（日英）の AIタグ自動追加に条件 |
| 9/30 20:38 | [#1759](https://github.com/simplememofast/simplememo/pull/1759) | 第52・第53弾の計測の台帳の note と annotations の行、この §5.38、オーナー判断 #52 の追加、§5.37 の「この PR」の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **FAQ の解約手順のプラン名**：「Simple Memo Premium」を選ぶ、としていたが、日本の App Store のプラン名は「シンプルメモ：プレミアム」（¥500）と「シンプルメモ：年間プレミアム」（¥5,000）。米国は "Simple Memo Premium"（$2.99）と "Simple Memo Annual Premium"（$29.99） | 第52弾で直した。サイトの価格の記載はすべて一致 |
| **日英分離（#1484）で入れ替わった旧名**：`/en/download/` の「formerly “Simple Memo - for Obsidian”」は、原文（#941）の “Captio式シンプルメモ” の位置にサイトの英語名が入ったもの。#1484 の直前の英語の文で「Captio式」を含むのはこの1か所だけだった | 第53弾で原文に戻した |
| **ページの題の言い切り**：`/hands-free/` と英語トップの題 | オーナー判断 #52 |
| **ソースと一致していたもの**：iPhone のウィジェット（ホーム画面の小・ロック画面の円形）、コントロールセンターの操作（iOS 18 以降）、Apple Watch の文字盤とスマートスタック、Siri の発話（「〜で残す」ほか。`/siri/` の表どおり）、Outbox の再送の上限（5回）、オフラインの音声認識のための言語モデルの取得、履歴からの共有 | 直していない |

### 告知の結果

- iOS Dev Weekly：9/30 20時台の時点で最新は 769号（9/25）。次号（770）は 10/2（金）の見込み。

### 受信箱（support@、読むだけ）

- 9/27〜9/30 の受信（support@ 宛て）：9/28 に利用者からの問い合わせ1件があり、同日 19:02 にサポートが返信済み（利用者からも同日にお礼の返信）。9/29 の記録（「Product Hunt の通知1通だけ」）は検索の条件が狭く、この件を拾えていなかったので訂正する。ほかは通知・ニュースレター（Product Hunt・Indie Hackers ほか）、DMARC の週報、SaaSHub の確認メール、アカウントのセキュリティ通知（中身はオーナーに直接伝える）。こちらから返信の要るものは無い（返信はしていない）。

### awesome 系リスト（§6.5）

- 7件すべて open のまま、コメントなし（9/30 20:20 に確認）。台帳の状態（提出済み・レビュー待ち）は変えない。

### 次にやること

- 毎晩の確認は 10/1 20:40 JST に予約した。10/08 まで毎日かけ直す。
- オーナー判断待ち：#43〜#45、#47〜#52。公開の台帳に書かない確認事項が1件（オーナーに直接）。

## 5.39 2026-09-30 夜（続き）：Siri の言い回しと条件（第54〜第56弾）、英語の利用例（第57弾）、遅延の数字の残り（第58弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/30 21:28 | [#1762](https://github.com/simplememofast/simplememo/pull/1762) | 第54弾（12ページ＋サイトマップ）：英語2ページの "Hey Siri, save with Simple Memo" → "send a memo with Simple Memo"（アプリが登録している言い回し）。`/how-to/` 日英の「Hey Siri、メモ」→「シンプルメモで残す」「シンプルメモで音声メモ」。`/obsidian/airpods/` ほかの「画面を見ずに」「0操作・0画面」「両方に届きます」「同時に届く」に `/siri/`（#1727）と同じ条件。ブログの経路④に自動オンの条件 |
| 9/30 21:35 | [#1763](https://github.com/simplememofast/simplememo/pull/1763) | 第55弾：トップの AirPods の1文（「だけで、スマホを触らずメールとObsidianへ」→「と話しかけて本文を答えれば、アプリを開かずにメールやObsidianへ」）。フォントのサブセットを作り直し |
| 9/30 21:50 | [#1765](https://github.com/simplememofast/simplememo/pull/1765) | 第56弾：`/hands-free/` 日英の「画面を見ず・触らず、声だけで」（開くときと送るときは画面の操作が要る。運転中の安全の欄と FAQ も）、「話しただけで Obsidian とメールに」（送信したとき）、「開いた瞬間に」。`/ai-tags/` 日英の音声の手順カードに自動オンの条件と iOS 26 以降 |
| 9/30 21:56 | [#1766](https://github.com/simplememofast/simplememo/pull/1766) | 第57弾：`/en/use-cases/freelancers` の「次のメモでクライアントを Cc に」（Cc の機能は無い）→ 受け取ったメールの転送。students・managers の崩れた文「arrives withwith one tap」 |
| 9/30 22:07 | [#1767](https://github.com/simplememofast/simplememo/pull/1767) | 第58弾：`/en/blog/` の記事一覧のカードと `llms.txt` の「~0.3–0.5s (real) latency」（記事が計測ではないと書いて外した数字）。`llms.txt` の `/hands-free/` の行を「送信で Obsidian に追記」に |
| 9/30 22:26 | [#1768](https://github.com/simplememofast/simplememo/pull/1768) | 第54〜第58弾の計測の台帳の note と annotations の行、この §5.39、オーナー判断 #53・#54 の追加、§5.38 の「この PR」の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **英語の Siri の言い回しが、アプリに登録されていなかった**：“Hey Siri, save with Simple Memo” は日本語「シンプルメモで残す」の直訳。アプリ（`SimpleMemoAppIntents.swift`）が登録している英語の送信フレーズは “Send a memo with …” “Send … memo” “Memo with …”。`/how-to/` の「Hey Siri、メモ」も登録されていない | 第54弾で直した。英語の言い回しはコードで確かめたもので、英語の Siri での実機の確認はしていない（`/en/siri/` と同じ扱い） |
| **`/siri/` の条件（#1727）がほかのページに広がっていなかった**：ロック中は解除や画面操作が要ることがある、通常モードのメール送信と保管庫への追記は別の経路。保管庫への書き込みが失敗したときの切り替え（Obsidian を開く）が、Siri からロック中に呼ばれたときに働くかは確かめていない | 第54〜第56弾で本文・説明文・構造化データを直した。題とリンクと画像はオーナー判断 #53 |
| **`/hands-free/` の「画面を見ず・触らず」**：アプリで録音して送るには開くときと送るときに画面の操作が要り、書いている途中のメモを自動で送る機能は無い。運転中の安全の欄にもこの言い方があった | 第56弾で直した。触れずに送れるのは Siri の「シンプルメモで残す」（ロック中の条件つき） |
| **英語の利用例だけにあった誤り**：Cc（送信先は1つで Cc は無い）、崩れた文 | 第57弾で直した |
| **記事が外した数字が記事の外に残っていた**：`/en/blog/ios26-speechanalyzer-live-mic` は遅延の数字を外し「今の確認は遅延を示さない」と書いているのに、`/en/blog/` のカードと `llms.txt` が「~0.3–0.5s latency」のままだった | 第58弾で直した |
| **アプリの画面の言い切り**：おすすめの使い方の画面の「…割り当てておくと、画面を見ないままメモが終わります」。アクションボタンで開いたあとも送信のタップが要る | アプリの文言なのでオーナー判断 #44 に足した |
| **英語の社名が2つある**：フッターの「Yurika Inc.」と、App Store・規約・`/en/about/` の「YURIKA, K.K.」 | オーナー判断 #54 |
| **ソースと一致していたもの**：`/fastest-voice-memo/` の「声でメモ」と「シンプルメモで音声メモ」（`StartVoiceMemoIntent`。日本語の題「声でメモ」）、`/siri/` の言い回しの表（◎「〜で残す」ほか。2026-08-05 の実機検証と食い違わない）、Apple Watch の watchOS 9.0 以降（App Store の表示）、「Obsidianのみに保存」「Notionのみに保存」が Premium で有効にするものであること | 直していない |

### 次にやること

- 毎晩の確認は 10/1 20:40 JST に予約済み。10/08 まで毎日かけ直す。
- オーナー判断待ち：#43〜#45、#47〜#54。公開の台帳に書かない確認事項が1件（オーナーに直接）。

## 5.40 2026-09-30 深夜〜10/1 未明：メールと保管庫の「同時に」（第59弾）、英語の音声入力ガイド（第60弾）、0.4秒の意味と出典の無い数字（第61弾）、手書きの記事の写真の案内とAI比較の記事（第62弾）、送信・テンプレートの説明（第63弾）、検証の止まりと日付をまたいだ sitemap

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 9/30 22:42 | [#1769](https://github.com/simplememofast/simplememo/pull/1769) | 第59弾（9ページ＋サイトマップ、11か所）：「自分宛メールに届くと同時に保管庫へ追記」などを別の経路として書き直し（`/obsidian/daily-note/`、`/obsidian/shortcuts-not-working/` 日英、`/obsidian/apple-watch-not-working/` 日英、`/blog/fleeting-notes`、`/vs/obsidian-share-sheet/` 日英）。`/glossary/second-brain/` の「すべてのインスピレーションを逃さず」 |
| 9/30 22:53 | [#1771](https://github.com/simplememofast/simplememo/pull/1771) | 第60弾（2ページ、22か所）：`/en/blog/obsidian-voice-input` を直してある日本語版にそろえた（公式 Capture アクション、音声入力の条件、メールと保管庫は別の経路、0.4秒の範囲、Free は1日3通、表と FAQ）。日本語版は「Obsidianだけに保存するモード（Premium）」 |
| 9/30 23:23 | [#1772](https://github.com/simplememofast/simplememo/pull/1772) | 第61弾（36ページ＋サイトマップ2つ、72か所）：0.4秒をキャプチャ・保存・送信の時間として書いていた所を「タップから0.4秒で書き始められる」に。出典の無い数字（95%・毎日平均20分）、記録の無い体験談（会議40分→25分）、見つからない文献（Kinds & Meier 2021）を外し、手書きの記事を2021年の再現研究にそろえた |
| 9/30 23:49 | [#1773](https://github.com/simplememofast/simplememo/pull/1773) | 第62弾（4ページ、34か所）：`/blog/digital-vs-handwritten-notes` 日英の「手書きメモの写真をシンプルメモで送る」（テキスト専用で送れない）と「手書きは記憶に有利」の言い切り（回答ブロック・説明文・表・コツ）、英語の「zero idea loss」。`/blog/ai-vs-simple-memo` の日本語 FAQ「AI非搭載」、英語の「not stored on servers」、「AI機能はオフライン不可」 |
| 10/1 01:43 | [#1779](https://github.com/simplememofast/simplememo/pull/1779) | CI：`.github/workflows/seo-check.yml` の WebKit の導入手順に `timeout-minutes: 10`。apt が失敗せずに止まったとき、検証がジョブ既定の360分まで終わらずマージが止まるのを防ぐ（下の「見つけたこと」） |
| 10/1 01:47 | [#1774](https://github.com/simplememofast/simplememo/pull/1774) | 第63弾（4ページ＋サイトマップ3つ、7か所）：`/vs/drafts/` の FAQ「入力→自動送信」（送信はタップ）。`/en/blog/offline-first-comparison` の「Email is delivered, receipt is logged」「The moment you reconnect … delivers all queued notes」（アプリが記録するのは送信の受け付けで、再送は次にアプリを開いたときかバックグラウンド）。`/blog/morning-memo-routine` 日英の「メモアプリの定型文・プリセット」（本文の定型文の機能は無く、テンプレートは貼り付け）。最初の検証が止まっているうちに日付をまたいだので、sitemap の lastmod をマージ参照の上で作り直して足した（下の「見つけたこと」） |
| 10/1 02:10 | [#1780](https://github.com/simplememofast/simplememo/pull/1780) | 第59〜第63弾の計測の台帳の note と annotations の行、この §5.40（#1779 と、日付をまたいだ sitemap の記録を含む）、オーナー判断 #55 の追加、§5.30〜§5.32・§5.39 の「この PR」の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **メールと保管庫を「同時に」と書いたページが9つ残っていた**：`/siri/`（#1727）と第54〜第56弾で直した「別の経路」の説明が、Obsidian 配下と比較ページに届いていなかった | 第59弾で直した |
| **片方の言語だけが古いまま残っていた**：`/en/blog/obsidian-voice-input` は日本語版（9/5 と第41・第51弾）の修正が入っておらず、「audio never leaves the device」「simultaneously」「0.4s…effectively zero」「fastest」「Offline: Yes」が残っていた。`/en/blog/ai-vs-simple-memo` の「not stored on servers」（日本語版は第34弾で直した）。逆に `/blog/digital-vs-handwritten-notes` は英語版の本文だけが再現研究を反映し、`/blog/ai-vs-simple-memo` は英語版の FAQ だけが「端末内の AI」に直っていた | 第60〜第62弾で直した。日本語版だけが直った最近の PR（#1722・#1731・#1738・#1748・#1752）と所要時間の言い換え（#1703・#1709・#1716）を日英の組で見直し、残っていたのはこの4組 |
| **アプリに無い機能の案内**：`/blog/digital-vs-handwritten-notes` 日英が「手書きメモの写真をシンプルメモで自分のメールに送る」バックアップを勧めていた。シンプルメモはテキスト専用で写真は送れない（サイト自身の比較表どおり）。ほかのページに写真・画像をシンプルメモで送るという案内は無かった | 第62弾で直した |
| **「AI非搭載」の残り**：`/blog/ai-vs-simple-memo` の日本語 FAQ が、7月の AIタグ自動追加より前の「AIは非搭載」のままだった | 第62弾で直した |
| **送信と記録の説明の残り**：「入力→自動送信」（`/vs/drafts/`）、「Email is delivered, receipt is logged」「The moment you reconnect … delivers all queued notes」（`/en/blog/offline-first-comparison`。aio-2026-08-12-entity-attribution の対象記事）、「メモアプリの定型文・プリセットに登録」（`/blog/morning-memo-routine` 日英） | 第63弾で直した。シンプルメモが自動で送る・写真を送る・本文のテンプレートを持つ、という案内はほかに見つからなかった |
| **0.4秒の意味の取り違え**：計測はタップから入力できるまでなのに、「0.4秒でキャプチャ」「0.4秒で保存」「0.4秒でメモ→メール送信」「Capture in 0.4s」と、書く・送る・保存する時間のように書いた所が約50か所 | 第61弾で直した。「起動0.4秒」と起動の時間として書いている所は、オーナー判断 #31 のとおり変えていない |
| **出典の無い数字と、見つからない文献**：「『後でメモしよう』は95%の確率で忘れます」（日英）、「毎日平均20分を浪費」（日英）、記録の無い体験談「会議時間が平均40分から25分に短縮」、「Kinds & Meier（2021）」（ページの参考文献にも、9/9 の文献の照合にも無く、検索でも見つからない） | 第61弾で外した。ほかの著者名つきの引用（約60件）は 9/9 の照合（`docs/seo/reference-identity-corrections-2026-09-09.json`）か既知の文献で、`Perlow, Hadley & Eun (2017)`（HBR）も実在 |
| **Obsidian 1.14（早期アクセス）の iOS 26 向け Quick Capture**：ロック画面・コントロールセンター・ショートカットから、保管庫の読み込みを待たずにメモを残せる（9/2 の 1.14.0 の変更履歴。9/29 の 1.14.3 もまだ早期アクセス）。公開版になると、「Obsidian を開いて保管庫の読み込みを待つ」前提の比較の書き方が古くなる | いまは公開版 1.13 の説明が正しい（`/vs/obsidian-share-sheet/` などは早期アクセスとして書いている）。1.14 が公開版になったら比較ページを見直す（次にやること） |
| **回答ブロックの研究の言い切り**：aio-2026-08-11-answer-blocks の対象の `/blog/digital-vs-handwritten-notes` の回答ブロックが「記憶への定着と理解の深さでは手書きが有利」「併用が最も多く…定着」と言い切っていた（同じページの本文と FAQ、`/blog/brain-science-memo` は2021年の再現研究を載せている） | 第62弾で、第49弾（#1744）と同じ扱いで直し、実験に note を付けた |
| **PR の本文の実験の書き漏れ**：第61弾（#1772）の本文に、対象ページ `/blog/digital-vs-handwritten-notes` を持つ aio-2026-08-11-answer-blocks が抜けていた（ページの一覧を部分一致で照合したため） | 9/30 に PR の本文を訂正し、この PR で実験に note を付けた。以後は実験の `page`・`pages` の URL と完全一致で照合している |
| **検証が止まったまま終わらない**：#1774 の検証（SEO Validation #4014 の1回目）が、WebKit の導入手順で `sudo apt-get update -qq` のあと何も出さずに1時間22分止まった（9/30 23:42〜10/1 01:05 に取り消し）。この手順の `continue-on-error` は失敗にしか効かず、止まりには手順にもジョブにも上限が無かった（既定の360分まで待つ）。流し直しでは同じ手順が27秒で通り、同じ時間帯の #1775・#1777・#1770 の検証も通っている。一方、同じ夜の #1774 の次の検証（#4024）では、同じ手順が11分12秒かかって通った（遅いが止まってはいない） | 取り消して流し直し、#1779 で10分の上限を付けた（`obsidian-autopilot.yml` の日本語フォントの手順と同じ形）。上限が10分だと、#4024 のような遅い回は WebKit の計測が「測れなかった」になる（横スクロールの確認は報告のみで、マージは止めない）。延ばすかどうかは、次に同じことが起きたときの記録で決める。止まった原因は、出力が無いのでログからは分からない。タイムアウトした手順が先へ進むことは、まだ実際には起きていない |
| **日付をまたいだマージで sitemap の lastmod がずれる形**：`scripts/sitemap_lastmod.py` は、ページを変えた first-parent のコミットの JST 日付を lastmod にする。#1774 は 9/30 に作った sitemap（9/30）のまま 10/1 に squash されると main の内容履歴（10/1）とずれ、そのあとに開く PR の検証が `WRONG LASTMOD`（5件）で落ちる形だった（squash 後と同じ形を手元で作って確認） | CLAUDE.md の手順どおり、マージ参照の上で `generate_sitemap.py` を回した出力を #1774 に足した（10/1 01:22）。0時をまたいで持ち越す PR は、マージの前に作り直す |
| **題と CTA の見出しの誇張**：「ひらめきを逃さない」（題）、「完璧」「最高の」「Perfect」「ideal」「Lightning Speed」「究極」 | オーナー判断 #55 |
| **確かめて問題が無かったもの**：8言語のトップの 0.4 秒（どれもウォーム起動・iPhone 16e の条件つき）、`/en/blog/revenue-report-2025` の書きかけ（noindex・サイトマップ外・どこからもリンクされていない。7/2 の監査どおり）、新しい `/obsidian/plugins/quickadd/`・`/obsidian/plugins/templater/`（シンプルメモについて確かめていない範囲を明記している） | 直していない |

### 次にやること

- 毎晩の確認は 10/1 20:40 JST に予約済み。10/08 まで毎日かけ直す。
- 0時をまたいで持ち越した PR は、マージ参照の上で sitemap を作り直してからマージに回す（第63弾で実施）。
- Obsidian 1.14 が公開版になったら（obsidian.md/changelog の「Mobile (Public)」）、Quick Capture を踏まえて比較ページの「保管庫の読み込み」の書き方を見直す。
- オーナー判断待ち：#43〜#45、#47〜#55。公開の台帳に書かない確認事項は、オーナーに直接伝える。

## 5.41 2026-10-01 未明：他社アプリの説明（Moca・メモポスト）、片方の言語だけ古いページ、作り話の「話題」と「実例」、英語の Captio のページ（第64〜第75弾）、#1779 の上限が働いた回

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/1 02:27 | [#1781](https://github.com/simplememofast/simplememo/pull/1781) | 第64弾（6ページ＋サイトマップ2つ、41か所）：`/vs/` 日英の FAQ「メールの受信箱が唯一の保存先」「タグ機能は無い」（同じページの冒頭は Obsidian への追記を書いていた）。`/obsidian/sync/` 日英の Syncthing「無料・全プラットフォーム対応」（iPhone・iPad は Obsidian の公式ヘルプで公式には非対応、Android は公式アプリの開発が終わりコミュニティ版。参考文献に2本）。`/blog/chatgpt-memo-workflow` 日英の「翌日にはほぼ消えます」「7±2（ミラーの法則）」（サイト自身の研究ページと食い違う）と「唯一」「最強」「30分→2分」 |
| 10/1 02:35 | [#1782](https://github.com/simplememofast/simplememo/pull/1782) | 第65弾（7ページ＋サイトマップ2つ、31か所）：`/vs/moca/` 日英が Moca を「メモの保存先はアプリ内」「機種変更で失われる」と逆に書いていた（App Store の説明ではアプリ内に保存せずメールで送る）。計測していない「速い」、根拠の無い「標準メール送信」。`/en/` の「capture-to-email (0.4s vs Drafts' 0.9s)」、`/en/blog/productivity-methods-comparison` の「email in 0.4s」、`/blog/which-memo-app-flowchart` 日英の Drafts「起動0.8秒」 |
| 10/1 02:51 | [#1784](https://github.com/simplememofast/simplememo/pull/1784) | 第66弾（2ページ＋サイトマップ2つ、41か所）：`/vs/memo-post/` 日英のメモポスト：公式サイトに無い「AI処理のためにメモをサーバーに保存」（本文と FAQ）、「デスクトップ対応」（Mac は App Store から iPhone・iPad 向けアプリとして、Android もある）、無料プランと料金、計測していない起動速度。日本語の Premium「月額$2.99」→「月額500円・年額5,000円」 |
| 10/1 03:02 | [#1785](https://github.com/simplememofast/simplememo/pull/1785) | 第67弾（10ページ＋サイトマップ2つ、41か所）：`/blog/minimalist-digital-memo` 日英の「アプリ内にデータを貯めず」（端末内に暗号化した送信履歴が残る）、著書から「」で引いた確認できない一文、「追加のバックアップ戦略は一切不要」、記録の無い体験談と出典の無い数字。`/vs/day-one/`・`/vs/tana/`・`/vs/roam-research/`・`/vs/line-keep-memo/` 日英の出典の無い一般化 |
| 10/1 03:30 | [#1786](https://github.com/simplememofast/simplememo/pull/1786) | 第68弾（4ページ＋サイトマップ2つ、19か所）：`/use-cases/writers/` 日英の「件名に日付とキーワードが並び」（件名に日付は入らない）。`/methods/gtd/` 日英の「ほぼ確実に忘れます」「最適なツール」「完璧に対応」「Absolutely.」と、作った人物の1日の見出し「実際のシナリオ」「Real Scenario」。検証の WebKit の導入が #1779 の上限で打ち切られたまま通った（下の「見つけたこと」） |
| 10/1 03:36 | [#1788](https://github.com/simplememofast/simplememo/pull/1788) | 第69弾（2ページ＋サイトマップ2つ、26か所）：`/en/blog/ai-information-workflow` を 9/29 に書き直された日本語版にそろえた（出典の無い「メールは10年以上保存」、アプリが付けない「Memo」ラベルの手順、顧客のヒアリングや感情のメモを注意なしに AI へ貼る案内）。日英の「ラベルで自動的に整理」「劇的に向上」「最も重要なテクニック」 |
| 10/1 04:00 | [#1789](https://github.com/simplememofast/simplememo/pull/1789) | 第70弾（10ページ＋サイトマップ2つ、83か所）：`/blog/gen-z-memo` 日英の「TikTokで話題のCaptio式」「#captio式メモ」「#CaptioStyle」（題・見出し・CTA を含む）と、名前の無い TikTok クリエイターの発言を削除し、題を「書いてすぐ送るCaptio式とは」「Write and Send, Captio-Style」に。出典の無い流行の言い切り、Captio の「設計思想を受け継いだ」、Evernote の手順。`/methods/` の4ページ日英の「実際のシナリオ」「Real Scenario」 |
| 10/1 04:05 | [#1791](https://github.com/simplememofast/simplememo/pull/1791) | 第71弾（1ページ＋サイトマップ、13か所）：`/en/captio-alternative/` の「App Size: Under 10 MB」（App Store の掲載は約21MB）、Gmail のフィルタの「sender: Simple Memo - for Obsidian」（差出人名は「シンプルメモ」か「Simple Memo」→ 送信元アドレスに）、「Real-World Scenarios: How People Use Simple Memo」「the most common scenarios … every day」、Android の人への「Email Me」（Apple の端末向けだけ） |
| 10/1 04:15 | [#1792](https://github.com/simplememofast/simplememo/pull/1792) | 第72弾（3ページ＋サイトマップ2つ、37か所）：`/en/blog/reading-notes-guide` と `/en/vs/ios-shortcuts/` を 9/29 に書き直された日本語版にそろえた（出典の無い「If you read 50 books a year … over a decade」「80% of a book's value … in 20% of its pages」「more than 2 seconds … is unsuitable」、「you may have experienced it breaking」「multiple cases reported」、計測していない「5-10 minutes」、「implements email sending natively」）。日英の「丸写しは…記憶にほとんど残りません」 |
| 10/1 04:25 | [#1793](https://github.com/simplememofast/simplememo/pull/1793) | 第73弾（4ページ＋サイトマップ2つ、14か所）：`/vs/note-to-self-mail/` 日英の「顕著な違い」「4つの技術的優位」「diverge significantly」「technical differentiators」（同じページの表では Note To Self Mail の起動速度は未計測、オフラインと暗号化は不明）。`/vs/mail-to-self/` 日英の、メーラーで送ると通信エラーで「消えてしまう」（本文と FAQ）、「摩擦は半分以下」「根本的に変えます」 |
| 10/1 09:36 | [#1808](https://github.com/simplememofast/simplememo/pull/1808) | 第74弾（1ページ＋サイトマップ、10か所）：`/en/blog/how-to-email-yourself-note-iphone` の確かめられない「The app has become the preferred solution for thousands of power users」、計測していない「Slower to start than a dedicated app」、表の「Voice Support: Limited」、フィルタの「emails from yourself」 |
| 10/1 09:38 | [#1809](https://github.com/simplememofast/simplememo/pull/1809) | 第75弾（2ページ＋サイトマップ2つ、8か所）：`/voices/` 日英の、初期テスターへの当時の回答「自分のメールに送る一択」「メモは必ずメール送信される」「AI機能は載っていない」を「当時の」とし、その後の変化を足した |
| 10/1 10:56 | [#1822](https://github.com/simplememofast/simplememo/pull/1822) | 第64〜第75弾の計測の台帳の note と annotations の行、この §5.41、オーナー判断 #56 の追加と判断の委任（10/1）の記録、§5.40 の「この PR」の行（`docs/` のブランチから出した #1816 を `claude/` のブランチから出し直したもの。§5.42） |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **実在の他社アプリを、確かめられない・逆の事実で不利に書いていた**：`/vs/moca/`（Moca。App Store の説明とは逆の「アプリ内保存」と、そこから推した「機種変更で失われる」）、`/vs/memo-post/`（メモポスト。公式サイトに無い「サーバーに保存」、「デスクトップ対応」、無料プランの中身）。どちらも開発者名の出ている個人のアプリ | 第65・第66弾で、App Store の説明・公式サイト・開発者の note（いずれも 10/1 に確認）に合わせた。確かめられない点は「公開情報では確認できず」「当サイトでは未計測」と書いた |
| **同じページの中で FAQ だけが古い**：`/vs/` の冒頭は Obsidian への追記を書いているのに、FAQ（表示と JSON-LD）が「受信箱が唯一の保存先」「タグ機能は無い」のままだった | 第64弾で直した |
| **他社の対応端末の書き過ぎ**：`/obsidian/sync/` の Syncthing「全プラットフォーム対応」。Obsidian の公式ヘルプは iPhone・iPad を公式には非対応の選択肢に挙げ、Android の公式アプリは開発が終わっている | 第64弾で直し、出典を参考文献に足した（内部リンクは不変。internal-link-2026-09-02-003 に note） |
| **サイト自身の研究ページと食い違う記憶の話**：`/blog/chatgpt-memo-workflow` の「翌日にはほぼ消えます」「7±2（ミラーの法則）」。`/blog/memo-taking-tips`（Ebbinghaus の節約率は1日後34%）・`/blog/brain-science-memo`（Cowan 2001 の3〜5チャンク）と合わない | 第64弾で直した |
| **0.4秒と Drafts の数字の残り**：「capture-to-email 0.4s」「email in 0.4s」（0.4秒はタップから入力できるまで）、Drafts の「0.8秒」（計測は最速0.9秒・中央値1.45秒） | 第65弾で直した。第61弾（#1772）の取りこぼし |
| **アプリの仕組みと違う説明**：「アプリ内にデータを貯めない」（端末内に暗号化した送信履歴が残る）、「件名に日付」（件名は1行目かテンプレート＋1行目、AIタグ自動追加ならタイトル。日付は入らない）、「件名・日付・ラベルで自動的に整理される」（ラベルはフィルタか手作業）、Gmail のフィルタの差出人名「Simple Memo - for Obsidian」 | 第67〜第69弾・第71弾で直した。件名に日付が入ると読める書き方は、ほかに無かった |
| **片方の言語だけが古い（続き）**：9/29 の #1668（別の作業）は3ページの日本語版だけを書き直していた。英語版には「メールは10年以上保存」「Memo ラベル」、顧客や感情のメモを注意なしに AI へ貼る案内（`/en/blog/ai-information-workflow`）、「50 books a year … over a decade」「80% … in 20% of its pages」（`/en/blog/reading-notes-guide`）、「you may have experienced it breaking」「multiple cases reported」「5-10 minutes」（`/en/vs/ios-shortcuts/`）が残っていた | 第69・第72弾で英語版をそろえた。ほかの作業が日本語版だけを直した最近の PR（#1681・#1684 など）は、英語版もすでに直っていた |
| **作り話を「話題」「実例」として見せていた**：`/blog/gen-z-memo` の「TikTokで話題のCaptio式」「#captio式メモ」（検索では、Captio式はシンプルメモ自身のページ・アプリ名・プレスリリースにしか出てこない）と、名前の無い TikTok クリエイターの発言。`/methods/` の5ページの、作った人物の1日を「実際のシナリオ」とする見出し。`/en/captio-alternative/` の「How People Use Simple Memo」「the most common scenarios where former Captio users rely on Simple Memo every day」 | 第68・第70・第71弾で直した。`/use-cases/` の「実際のシナリオ例」「リアルなシナリオ例」「Real Scenario Examples」（約40ページ）は、名前の無い場面の例の一覧で、特定の人の体験として書いていないので変えていない |
| **表では「未計測」「不明」なのに、本文で差や優位を言い切る**：`/vs/note-to-self-mail/` の「顕著な違い」「4つの技術的優位」、`/vs/mail-to-self/` の「メーラーだと通信エラーで消える」 | 第73弾で、分かっている違いだけにした |
| **確かめられない利用者数・古くなった「今の答え」**：`/en/blog/how-to-email-yourself-note-iphone` の「thousands of power users」（日本の App Store の評価は27件）。`/voices/` の初期テスターへの回答が、Obsidian 連携・Obsidian だけに保存・AIタグ自動追加より前のまま「現在の考え」になっていた（冒頭で引いている App Store のレビューは公開レビューに実在） | 第74・第75弾で直した。`/voices/` のほかのカードは §5.36 のとおり当時の記録として残した |
| **他社アプリの勧め方の誤り**：`/en/captio-alternative/` の FAQ が、Android の人に「Email Me」を勧めていた（[公式サイト](https://emailmeapp.net/) では Apple の端末向けだけ）。同じページのアプリの容量「Under 10 MB」（App Store の掲載は 20,776,960 バイト） | 第71弾で直した |
| **#1779 の上限が初めて働いた**：#1786 の検証（SEO Validation #4033）で、WebKit の導入が「timed out after 10 minutes」（10分13秒、10/1 03:07 ごろ〜）。検証はそのまま先へ進み、横スクロールの確認は WebKit なし（Blink だけ）で報告して、24分31秒で通った（03:30 にマージ）。apt の止まりは今夜2回目（1回目は 9/30 深夜の #4014） | 設計どおり。上限が無ければ、ジョブ既定の360分まで待った可能性がある。もう一度起きたら、WebKit の導入の経路（apt のミラーやキャッシュ）を見直す |
| **手元の検証で disk が一杯になった**：手元で CI と同じ手順を流すたびに、作業用の一時フォルダ（1回あたり約170MB）が消えずに残り、10/1 04:20 ごろに空きが無くなった（GA4 の SQL のテストが venv を作れずに失敗）。サイトにも CI にも影響は無い | 一時フォルダを消して流し直した。以後は流すたびに片付ける |
| **確かめて残したもの**：Outbox の再送の「when connectivity returns」「オンライン復帰時に自動再送」など（回線の復帰を NWPathMonitor で検知して送り直し、閉じているときは次の起動かバックグラウンドのタスク。`/en/devlog/outbox-architecture` と `/faq` のとおり）。トップの「LINE Keep終了後のテキストメモ保存先としても最適です」（#55 と同じ種類。計測中の実験の対象ページ）。「Captio式」という呼び方そのもの（シンプルメモ自身の呼び方で、App Store のアプリ名にもある） | 直していない |
| **記録の無い3月の計測が1ページに残っている**：`/en/send-email-to-yourself` の2026年3月の計測（8アプリの起動・送信の秒数、「We installed and tested every major … app」、題の「5 Methods Tested」）。1回ごとの記録がリポジトリに無い。ほかのページ（`/blog/memo-app-speed-test-2026`・`/blog/iphone-memo-app-fast`・`/en/blog/fastest-note-app-iphone-2026`）は、同じ理由で3月の数字を取り下げている（`data/benchmark.json` の `otherPublishedRuns`） | §5.35 で「方法がページに明記されている」として残したが、記録が無い点はほかのページと同じなので、オーナー判断 #56 にした |

### 次にやること

- 毎晩の確認は 10/1 20:40 JST に予約済み。10/08 まで毎日かけ直す。
- Obsidian 1.14 が公開版になったら、Quick Capture を踏まえて比較ページの「保管庫の読み込み」の書き方を見直す（§5.40 のとおり）。
- 実在の個人のアプリとの比較ページは、公式情報（App Store の説明・公式サイト）と照らし合わせて見直しを続ける。
- 10/1 朝、オーナーからサイトの文言の判断を任された（「あなたにおまかせ」）。#45 は ②（「最速」を使わない言い方）、#55 は ①（条件のない言い切りをやめる）で、第76弾として進めている。#52・#53・#56 も表の推奨（①）で続ける。ただし英語トップ `/en/` の題は、title-2026-08-20-home-grammar の注記（英語トップは対象外で、変えるなら別に起票）と GROWTH_ROI_PLAN の R10（英語への新しい投資の凍結）があり、本文と説明文はすでに条件つきなので、題は変えずに残す（③）。`/autopilot/` の「AirPodsに話すだけでObsidianへ（Siri対応）」は、過去のプレスリリースの件名を載せた表なので変えない。
- オーナー判断待ち（アプリ・規約・社名など、サイトの文言だけでは決められないもの）：#43、#44、#47〜#51、#54。公開の台帳に書かない確認事項は、オーナーに直接伝える。

## 5.42 2026-10-01 朝：オーナーの「おまかせ」で判断 #45・#52・#53・#55・#56 を実施（第76〜第79弾）、保存の言い切りと LINE Keep の2ページ（第80弾）、PR の出し直し

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/1 10:54 | [#1821](https://github.com/simplememofast/simplememo/pull/1821) | 第78弾（オーナー判断 #56 ①。1ページ＋サイトマップ、47か所）：`/en/send-email-to-yourself` の、1回ごとの記録が無い2026年3月の起動・送信の秒数（8アプリ）と、それに基づく順位づけを取り下げた。8/11 の計測（タップから入力できるまで）にあるシンプルメモ・Drafts・メモの3つだけを載せ、ほかは Not measured。題を「How to Email Yourself on iPhone: 8 Ways Compared (2026)」にし、訂正の欄（前の版へのリンク）を足した。#1818 を出し直したもの |
| 10/1 10:56 | [#1820](https://github.com/simplememofast/simplememo/pull/1820) | 第76弾（オーナー判断 #45 ②・#55 ①。59ページ＋開発記録のフィード＋サイトマップ2つ、90か所）：CTA の見出し・タグライン・説明文の条件の無い「最速」「Fastest」（台帳の30か所＋同じ種類の残り10か所）を「すぐ書き始められる」などに。題・CTA の見出しの「逃さない」「完璧」「最高」「究極」「Perfect」「ideal」「at Lightning Speed」などを言い換えた（題を変えたのは `/use-cases/ideas/`・`/use-cases/commute/`・`/use-cases/entrepreneurs/`）。`/blog/iphone-memo-tips` 日英の、Spotlight が「Gmail の中身まで」検索するという記述も直した。#1815 を出し直したもの |
| 10/1 10:56 | [#1822](https://github.com/simplememofast/simplememo/pull/1822) | 第64〜第75弾の台帳（§5.41）。#1816 を出し直したもの |
| 10/1 11:21 | [#1823](https://github.com/simplememofast/simplememo/pull/1823) | 第77弾（オーナー判断 #52 ①・#53 ①。7ページ＋OG画像1枚＋生成スクリプト＋サイトマップ2つ、23か所）：`/hands-free/` 日英の題に「設定すれば」「with auto-start on」、`/obsidian/airpods/` の題・見出し「AirPodsに話すだけで」→「AirPodsからSiriで」（OG 画像も作り直した）、`/siri/` の題「スマホを触らず」→「アプリを開かず」、トップ・`/hands-free/`・`/apple-watch/` のリンクの文言 |
| 10/1 11:26 | [#1824](https://github.com/simplememofast/simplememo/pull/1824) | 第79弾（6ページ＋サイトマップ2つ、47か所）：`/blog/iphone-memo-tips` 日英の「シンプルメモで送ったメモは iCloud と Gmail の両方に保存」（宛先のメールに届き、連携していれば保管庫にも追記される別の経路）、「1通1件で自動的に守られる」、メモの同期をバックアップとした説明、背面タップに「メモアプリの起動」を割り当てる（割り当てられるのはシステムの操作とショートカット）、ロック画面ウィジェットの説明（入力画面は出ない・置き場所は時刻の下）、根拠の無い一般化。`/vs/line-keep-memo/` の CTA の「もっと確実なメモ保存」（英語版は #38 で直し済み）、`/methods/` 日英の「完全に統合」、`/en/faq` の「never expires」（#40 の言い方に） |
| 10/1 11:48 | [#1825](https://github.com/simplememofast/simplememo/pull/1825) | 第80弾（7ページ＋サイトマップ、66か所）：`/line-keep/` の「サービス終了の心配なし」「データの永続性が保証」「アプリが消えてもメモは消えません」（送ったメモは受信箱に残る、送信待ちは端末の中）、説明文の「LINE Keepメモが使えなくなった方へ」（Keepメモは継続中）、計測の無い LINE との比較（「さらに高速」「もっと速く、安全に」）、比較表の Keepメモの「LINEサーバー」「エクスポート不可」「通信暗号化のみ」「非対応」（公開情報では確認できず）。`/vs/line-keep-memo/` 日英の「エクスポート機能がない」（日英5か所ずつ）、「瞬時に」「最も安全な」「最もシンプルな保険」。`/blog/memo-app-service-shutdown-risk` の「メールボックスに永続」、極低の基準の「運営の安定性も高い」、Standard Notes をローカルファイル型とした誤り。`/blog/open-source-memo-apps`・`/blog/which-memo-app-flowchart` 日英の「アプリが消えても」 |
| 10/1 12:10 | [#1827](https://github.com/simplememofast/simplememo/pull/1827) | 第76〜第80弾の計測の台帳の note と annotations の行、この §5.42、オーナー判断 #45・#52・#53・#55・#56 の実施の記録、§5.41 の「この PR」の行 |

### オーナーの判断（10/1 朝「あなたにおまかせ」）

10/1 朝、オーナーからサイトの文言の判断を任された。表の推奨どおりに進めた。

| # | 判断 | 対応 |
| --- | --- | --- |
| 45 | ② 「最速」を使わない言い方にする | 第76弾 [#1820](https://github.com/simplememofast/simplememo/pull/1820)。`/comparison` のように「計測した8アプリで最速」と条件を書いた所と、ベンチマークの記事の題は残した |
| 52 | ① 題にも条件を入れる（英語トップの題だけ ③） | 第77弾 [#1823](https://github.com/simplememofast/simplememo/pull/1823)。英語トップ `/en/` の題は、title-2026-08-20-home-grammar の注記（英語トップは対象外で、変えるなら別に起票）と GROWTH_ROI_PLAN の R10（英語への新しい投資の凍結）のため変えていない。本文と説明文はすでに条件つき |
| 53 | ① 題にも条件を入れる | 第77弾 [#1823](https://github.com/simplememofast/simplememo/pull/1823)。`/autopilot/` の「AirPodsに話すだけでObsidianへ（Siri対応）」は過去のプレスリリースの件名を載せた表なので変えていない。トップの Siri のバナー画像（画像の中の「スマホを触らず、声で残す」）と代替テキストは、画像を作り直すまで変えない（オーナー側の作業） |
| 55 | ① 条件のない言い切りをやめる | 第76弾 [#1820](https://github.com/simplememofast/simplememo/pull/1820) |
| 56 | ① 3月の数字を取り下げる | 第78弾 [#1821](https://github.com/simplememofast/simplememo/pull/1821) |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **自動マージは `claude/`・`Codex/` で始まるブランチだけ**：`.github/workflows/auto-merge.yml` は SEO Validation の成功を受けて動くが、対象はブランチ名が `claude/` か `Codex/` で始まる PR だけ。10/1 朝に `fix/`・`docs/` のブランチから出した #1815・#1816・#1818 は、検証が通ったまま止まっていた | 同じ中身を `claude/` のブランチから [#1820](https://github.com/simplememofast/simplememo/pull/1820)・[#1822](https://github.com/simplememofast/simplememo/pull/1822)・[#1821](https://github.com/simplememofast/simplememo/pull/1821) として出し直し、元の3本はコメントを付けて閉じた。以後は `claude/` で始める。使わなくなったブランチ（`fix/copy-batch76-owner-45-55`・`docs/ledger-batch64-75`・`fix/facts-batch78-owner-56`・`fix/copy-batch77-owner-52-53`）は残している（消すかはオーナーの判断） |
| **同じ行を変える2本は、先の1本が入ってから作る**：自動マージは1つの親のコミット（"Merge validated PR #N"）で入るので、#1820 と同じ行（`/hands-free/` の JSON-LD）を変えていた第77弾の最初の版（`fix/copy-batch77-owner-52-53`）は衝突する | #1820 が入った後の main から第77弾を作り直した（#1823）。第79弾・第80弾も、同じファイルを変える先の PR が入ってから作った |
| **サイトマップに手で足された行**：#1807（10/1 09:36）が `sitemap-ja.xml` に足した hreflang の行は `scripts/generate_sitemap.py` の出力に無いので、作り直すと消える | 第76弾ではサイトマップを作り直さず、lastmod だけを書き換えた。その後 #1817（10:41、別の作業）が同じ18行を外したので、いまは `generate_sitemap.py --check` と一致 |
| **OG 画像の字体**：第77弾で `scripts/generate-og-batch.js` から `/obsidian/airpods/` の OG 画像を作り直したところ、今回は Google Fonts の Noto Sans JP が読み込まれ、同じスクリプトで前に作られたほかの画像（代わりの字体）と字体が少し違った | 1枚だけなので、そのまま。ほかの画像を作り直すときに字体をそろえる |
| **iPhone の機能とアプリの仕組みの誤り**：`/blog/iphone-memo-tips` の「iCloud と Gmail の両方に保存」、背面タップに「メモアプリの起動」、ロック画面ウィジェットが入力画面を出す、メモの同期をバックアップとする説明 | 第79弾で直した（Apple の背面タップとショートカットの案内を PR に記載） |
| **判断の取りこぼし**：#38（LINE Keep の CTA）は英語版だけ、#40（「利用期間の制限なし」）は `/en/faq` の「never expires」（表示と JSON-LD）が残っていた | 第79弾で直した |
| **保存の言い切りと、他社について確かめられない記述**：`/line-keep/` の「サービス終了の心配なし」「データの永続性が保証」、`/vs/line-keep-memo/` 日英の「Keepメモにはエクスポート機能がない」（[LINE の公式ヘルプ](https://help2.line.me/line/smartphone/sp?contentId=20017696&lang=ja)に書き出しの記述が無く、確かめられない）、`/blog/memo-app-service-shutdown-risk` の「メールボックスに永続」と、Standard Notes をローカルファイル型とした誤り、Obsidian の「アプリが消えてもデータは残る」（iPhone で「このiPhone内」に置いた保管庫は、アプリの削除で一緒に消える） | 第80弾で直した。送ったメモが受信箱に残ることは書き、送信待ちのメモが端末の中にあることと、残る期間がメールサービスの方針しだいであることを添えた。`/blog/line-keep-alternative` は 9/6 に公式ヘルプにもとづいて書き直されていて、言い切りは無かった |
| **GitHub のウェブ画面の操作**：ブラウザの表示領域が 0×0 のままなので、ボタンはページ内のスクリプトで押している。#1825 の作成では「Create pull request」のボタンを押しても送信されず、フォームの送信（requestSubmit）で作れた（重複の PR は無い） | 作ったあとに PR の一覧で重複が無いことを確かめる |

### 次にやること

- 毎晩の確認は 10/1 20:40 JST に予約済み。10/08 まで毎日かけ直す。
- オーナー判断待ち（アプリ・規約・社名など、サイトの文言だけでは決められないもの）：#43、#44、#47〜#51、#54。トップの Siri のバナー画像の作り直し（#53 の残り）。公開の台帳に書かない確認事項は、オーナーに直接伝える。
- Obsidian 1.14 が公開版になったら、比較ページの「保管庫の読み込み」の書き方を見直す（§5.40 のとおり）。

## 5.43 2026-10-01 昼：暗号化の範囲（第81弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/1 12:04 | [#1826](https://github.com/simplememofast/simplememo/pull/1826) | 第81弾（18ページ＋サイトマップ2つ、26か所）：シンプルメモの AES-GCM は端末内の送信待ちのメモと送信履歴だけで、配送は E2E 暗号化ではない。`/blog/how-to-choose-memo-app` 日英の暗号化の比較で「強」（E2E の次、サーバー側の暗号化より上）に置いていた → 「端末内のAES-GCM暗号化＋メールでの配送（中）」。`/blog/business-memo-apps-2026` 日英の「セキュリティ最重視 → Standard Notes or シンプルメモ」からシンプルメモを外し、表を「端末内AES-GCM（E2Eではない）」に（日本語のカード名の重複も直した）。`/guides/` 日英の Proton Mail のカード「二重保護で最もプライベート」→ 届いたメモは Proton のゼロアクセス暗号化、配送は E2E ではない。`/vs/`・`/vs/bear/`・`/blog/captio-discontinued` 日英、`/en/send-email-to-yourself`、`/en/` の「AES-GCM」に「端末内」。`/vs/bear/` の Bear の「iCloud標準」に付いていた否定の印を外した。「No SMTP」「The ultimate … comparison」→ SMTP 設定不要・比較 |
| 10/1 12:31 | [#1828](https://github.com/simplememofast/simplememo/pull/1828) | 第81弾の計測の台帳の note と annotations の行、この §5.43、§5.42 の「この PR」の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **端末内の暗号化を、E2E やサーバー側の暗号化と同じ物差しで上に並べていた**：暗号化の比較の「強」、ビジネス向けの記事の「セキュリティ最重視」のおすすめ、`/vs/bear/` の肯定・否定の印。守っているのは端末内の送信待ちと送信履歴で、送ったメモはメールサービス側の暗号化に従う | 第81弾で直した。`/privacy-architecture/`・`/about/`・`llms.txt` の書き方（端末内・E2E ではない）にそろえた |
| **カードだけが本文と食い違う**：`/guides/` の Proton Mail のカードは「二重保護で最もプライベート」だったが、`/guides/proton-mail/` の本文は「経路全体が E2EE になるわけではない」と書いていた | 第81弾でカードを本文に合わせた |
| **GitHub のアップロード画面で、ファイルの入力欄の位置がずれることがある**：画面に「There was an error while loading」が出た回は、入力欄が3つ後ろにずれていた（`growth/experiments`）。間違った位置には送られず、エラーで止まる | 画面を読み直して位置を確かめてから送った。中身はアップロード後に手元と差分 0 を確かめている |

### 次にやること

- 毎晩の確認は 10/1 20:40 JST に予約済み。10/08 まで毎日かけ直す。
- オーナー判断待ち：#43、#44、#47〜#51、#54、トップの Siri のバナー画像（#53 の残り）。公開の台帳に書かない確認事項は、オーナーに直接伝える。

## 5.44 2026-10-01 昼（続き）：検索・到着の「即座に」（第82弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/1 12:39 | [#1829](https://github.com/simplememofast/simplememo/pull/1829) | 第82弾（8ページ＋サイトマップ2つ、14か所）：`/vs/simplenote/` 日英の「書いたら即座に受信トレイへ届けたいならシンプルメモが最適」「Instant delivery to your inbox?」、`/vs/stock/` 日英の「過去のメモを即座に見つけられます」「can instantly find any past memo」（FAQ の表示と JSON-LD を含む）、`/blog/minimalist-digital-memo` 日英の「検索で瞬時に見つかります」「instantly searchable」、`/blog/iphone-memo-tips` 日英の見出し「Spotlight検索でメモを瞬時に見つける」「背面タップでメモアプリを即起動」 |
| 10/1 12:59 | [#1831](https://github.com/simplememofast/simplememo/pull/1831) | 第82弾の計測の台帳の note と annotations の行、この §5.44、§5.43 の「この PR」の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **検索や到着の速さの言い切りが残っていた**：「即座に見つけられる」「瞬時に見つかる」「Instant delivery」。検索の速さはメールアプリしだいで、到着の時間は `/blog/email-yourself-memo` などで「一律には保証されない」と書いている | 第82弾で直した。「即座にメモ」「即座に送信」のように書き始め・送信の操作を言う所は、届く速さを言っていないので残した |

### 次にやること

- 毎晩の確認は 10/1 20:40 JST に予約済み。10/08 まで毎日かけ直す。
- オーナー判断待ち：#43、#44、#47〜#51、#54、トップの Siri のバナー画像（#53 の残り）。公開の台帳に書かない確認事項は、オーナーに直接伝える。

## 5.45 2026-10-01 夕方〜夜：オーナーの判断（10/1 午後）、英語の社名（第83弾）、利用規約の改定案（下書き）、トップの Siri のバナー画像（第84弾）、OG 画像の文言（第85弾）、紹介用資料の注記（第86弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/1 18:48 | [#1839](https://github.com/simplememofast/simplememo/pull/1839) | 第83弾（英語209ページ＋データ1つ＋生成スクリプト2本＋文書1つ＋サイトマップ）：英語ページのフッターの社名「Yurika Inc.」→「YURIKA, K.K.」（オーナー判断 #54 ①。`data/site-constants.json` の `copyrightLineEn` と `node scripts/sync_constants.js --write`）。App Store の販売元・`/en/about/`・`/en/terms`・`/en/privacy`・`publisher` と同じ表記。英語ページを作り直す生成スクリプト2本の同じ文字列も直した |
| 10/1 21:13 | [#1841](https://github.com/simplememofast/simplememo/pull/1841) | 第84弾（トップ＋画像3つ＋AVIF 5つ＋フォント4つ＋manifest＋文書）：トップの Siri のバナー画像の中の文言「スマホを触らず、声で残す」→「アプリを開かず、声で残す」と代替テキスト（#53 の残り）。WebP・JPEG は同じ URL のまま中身が変わるので、参照に `?v=` を付けた |
| 10/1 21:56 | [#1842](https://github.com/simplememofast/simplememo/pull/1842) | 第85弾（OG 画像 作り直し30枚・新規4枚＋HTML 65ファイルの参照＋生成スクリプト2本＋サイトマップ3つ）：SNS やチャットに出る OG 画像の文言を、今の題と事実にそろえた（他言語トップ5つの「0.3秒」、`/en/captio-alternative/` の「Fastest ~1s」、トップの「最速の音声自動入力・起動約1秒」、「TikTokで話題」「取りこぼしゼロ」「LINE Keepメモ 終了」「逃さない」「完璧な旅程」「最強のタスク管理」など）。同じ URL の画像は参照に `?v=` |
| 10/1 22:29 | [#1844](https://github.com/simplememofast/simplememo/pull/1844) | 第86弾（紹介用資料 日英＋生成スクリプト＋サイトマップ）：`/press/`・`/en/press/` の Siri のアプリ内ガイド画面と Siri の説明動画に、`/siri/`・`/obsidian/airpods/` と同じ「従来の表現」の注記を付けた。Obsidian の説明動画の説明「入力→自分宛メール→保管庫への追記」を、`/obsidian/` と同じ「メールと保管庫の両方に残す流れで、メールを経由する仕組みではない」にそろえた |
| 10/1 22:58 | [#1845](https://github.com/simplememofast/simplememo/pull/1845) | 第83〜第86弾の計測の台帳の note と annotations の行、この §5.45、§5.44 の「この PR」の行、§7 の #43・#44・#47〜#51・#53・#54 と新しい #57 |

### 下書き（main に入れていない）

| PR | 中身 |
| --- | --- |
| [#1840](https://github.com/simplememofast/simplememo/pull/1840)（draft） | 利用規約 第3条の改定案（#43）：「（初日から適用・ずっと無料）」「(applies from day one; free forever)」→「（初日から適用・利用期間の制限なし）」「(applies from day one; no time limit)」。改定日（仮に 2026年10月15日）と改定履歴を付けた。公開されるのは「Ready for review」を押してから。改定日・周知のしかた・アプリの中の規約の扱いはオーナーが決める |

### オーナーの判断（10/1 午後）

| # | 判断 | 対応 |
| --- | --- | --- |
| 54 | ① 「YURIKA, K.K.」にそろえる | 第83弾 [#1839](https://github.com/simplememofast/simplememo/pull/1839) |
| 43 | 改定案を用意する | 下書きの [#1840](https://github.com/simplememofast/simplememo/pull/1840) |
| 53 の残り | トップの Siri のバナー画像を作り直す（「アプリを開かず、声で残す」＋代替テキスト） | 第84弾 [#1841](https://github.com/simplememofast/simplememo/pull/1841) |
| 44・47〜51 | アプリ側の課題を、開発向けの作業表にまとめる | まとめてオーナーに渡した（アプリの変更はサイトの外。公開の台帳に書かない確認事項も同じ表に入れた） |
| — | 使わなくなったブランチ4本を消す | `fix/copy-batch76-owner-45-55`・`docs/ledger-batch64-75`・`fix/facts-batch78-owner-56`・`fix/copy-batch77-owner-52-53` を消した（10/1 18:45 ごろ）。前の3本は、出し直した [#1820](https://github.com/simplememofast/simplememo/pull/1820)・[#1822](https://github.com/simplememofast/simplememo/pull/1822)・[#1821](https://github.com/simplememofast/simplememo/pull/1821) と同じコミットで main に入っている（閉じた #1815・#1816・#1818 の画面から戻せる）。4本目は [#1823](https://github.com/simplememofast/simplememo/pull/1823) で作り直した版の元 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **OG 画像は、題を直しても古いまま残る**：OG 画像は作ったときの題の文字を焼き込むので、第1〜第82弾で題を直しても、SNS やチャットに出る画像には「0.3秒」「Fastest ~1s」「TikTokで話題」「取りこぼしゼロ」「LINE Keepメモ 終了」などが残っていた。公開中のページが使う OG 画像 242 枚を OCR（tesseract）で読み、今の題と照らして見つけた | 第85弾で作り直した。題と同じ文言の画像（ベンチマーク記事の「最速メモアプリはどれ？」、`/blog/obsidian-iphone-memo` の「最速のクイックキャプチャは？」、`/blog/instant-capture-workflow` の「最速の方法」など）は、題の判断なので残した |
| **同じ URL のまま画像を差し替えると、古い画像が出続けうる**：`/assets/*` は7日 immutable で、CDN が差し替え前の画像を返した前例がある（`scripts/check-css-version.mjs` の注記）。SNS も画像を URL ごとに覚える。第77弾の `/obsidian/airpods/` の OG 画像も同じ URL のまま差し替えていた | 第84弾・第85弾では参照に `?v=`（中身の SHA-256 の先頭10桁）を付け、`/obsidian/airpods/` にも付けた。`check-css-version.mjs` は srcset の中の `?v=` を扱えない（`?v=` の後ろを引用符まで1つの値として読む）ので、バナーは手で付けた（`docs/siri-hero-banner-brief.md`） |
| **アップロード用に置いた画像に、来歴の署名が付くことがあった**：作業環境の出力フォルダに置いた画像に、あとから C2PA の来歴情報（Anthropic の署名。画素は同じで、バイトが約5.7KB増える）が付いていた。第84弾の最初のアップロード（バナー画像3枚）はこれを含んでいた | 署名の無い元のファイルで上書きし、ブランチと手元の検証した木の差分 0 を確かめた。以後、アップロードする画像は別のフォルダから送り、アップロード後に差分 0 を確かめる |
| **ほかの記事の画像を使い回していたページ**：`/vs/captioo/`・`/blog/captioo-alternative`（日英）と `/vs/` の一覧の Captioo の項目は、別の記事の画像（「Captio代替サービス完全比較2026 全7候補を実際に使って検証」）を使っていた | 第85弾で、それぞれの題の画像を作った |
| **ページの中の画像と動画の文字**：OG 画像に続けて、公開中のページが使う画像（259組）を OCR で、説明動画5本を1秒ごとのフレームで読んだ。Siri のアプリ内ガイド画面（実機の画面）には「iPhoneはポケットのまま」「どのAirPodsでも同じです」「メールとObsidianに、同時に届く」「圏外でも消えない」（英語版は "Phone stays pocketed"・"‘Hey Siri’ always works"・"Nothing is lost offline" など）が残る。`/siri/`・`/obsidian/airpods/` は注記済みだったが、紹介用資料（日英）は注記が無かった。`scripts/build-videos.py` で作る説明動画にも、Obsidian の「メールで自分に送ると…自動で追記されます」と「メールで送信 → 追記」の図、AI タグの「自動で付けます」（オンにする条件が無い）、Siri の字幕「メールとObsidianに、同時に届く」と最後の「手を使わずに、残す。」が残る | 第86弾で紹介用資料に注記を付け、Obsidian の動画の説明を `/obsidian/` とそろえた。ガイド画面の文言はアプリ側の作業、動画を作り直すかはオーナー判断（§7 #57）。`/autopilot/` の図の見出し「運営の自律度は5か月で10倍」は図の系列から計算され、図の中に「以前は再構成」とあるので残した |
| **使われていない古い画像**：`og/siri.png`・`og/siri-20260928.jpg`（前の OGP・プレス素材）と英語の `og/siri-en*`・`siri-banner-en.*` には「スマホを触らず」「hands-free」「your phone stays in your pocket」が残る。9/30 の #1727 から、どのページからも参照されていない | 残した。プレス素材として使うなら作り直しが要る |

### 毎晩の確認（10/1 20:40 JST の予約分。22:00 前後に実施）

- **main と手元の一致**：[#1839](https://github.com/simplememofast/simplememo/pull/1839)・[#1841](https://github.com/simplememofast/simplememo/pull/1841)・[#1842](https://github.com/simplememofast/simplememo/pull/1842)・[#1844](https://github.com/simplememofast/simplememo/pull/1844) は、手元で検証した木と同じ（`git diff` が空）。
- **iOS Dev Weekly**：770号（10/2 の号）はまだ出ていない（10/1 22:00 JST の時点で最新は 769号・9/25）。#1547 の記事が載るかは次の確認で見る。
- **受信箱（support@、読むだけ。返信はしていない）**：
  - **さくらのナレッジ（JA-050）**：編集部から 10/1 14:37 に返信があり、9/22 に応募した企画（送信キューの設計）で**話を進めることになった**。まず構成案を、とのこと。掲載は媒体の予算の都合で12月以降の見込み。同じ日の 14:50 に support@ から構成案を返信済み（この台帳には記録が無かったので、ここに記録する）。
  - **AppAddict**（appaddict.app。アプリのレビューサイト）：10/1 21:04 に提出の受付の返信（定型）。レビューは約束されず、連絡が無ければ今回は見送り、とのこと。**この提出は台帳に記録が無い**。こちらからの返信は要らない（有料機能を試す権利が要るときは向こうから連絡が来る、とある）。
  - アプリ広告の営業メールが1件（広告の購入は禁止事項なので対応しない）。ほかは通知・ニュースレター。
- **awesome 系リスト（§6.5）**：7件すべて open のまま、コメントなし（10/1 22:00 ごろ確認）。
- **CI**：[#1841](https://github.com/simplememofast/simplememo/pull/1841) の「Homepage Section Rendering」の chromium が1回失敗した（JavaScript なし・幅390px で、アプリのプレビューの節（`main > section` の9番目）の高さが基準と 2px 違った）。[#1841](https://github.com/simplememofast/simplememo/pull/1841) はこの節を変えておらず、同じトップを含む [#1842](https://github.com/simplememofast/simplememo/pull/1842) では3つのブラウザとも通った → 一時的な揺れとして記録する。自動マージの条件（SEO Validation）には入っていない。

### 次にやること

- 毎晩の確認は 10/2 20:40 JST に予約した（10/1 の分は上のとおり）。10/08 まで毎日かけ直す。
- 説明動画3本（Siri・Obsidian・AI タグ）を、ページの説明（第49・54・59弾）に合わせて作り直すか（§7 #57）をオーナーに聞く。
- さくらのナレッジ：構成案への編集部の返事を待つ。通れば原稿（4,000字前後）を書く。記事の事実は、アプリのコードと `/devlog/outbox-architecture` で確かめてから書く。
- オーナー判断待ち：#43 の公開（改定日・周知のしかた）。アプリ側の課題（#44・#47〜#51）は開発向けの作業表で進める。公開の台帳に書かない確認事項は、オーナーに直接伝える。
- 題に残る「最速」（ベンチマーク以外の記事。`/blog/instant-capture-workflow` の「最速の方法」など）を変えるかは、題の判断として洗い出してから聞く。
- Obsidian 1.14 が公開版になったら、比較ページの「保管庫の読み込み」の書き方を見直す（§5.40）。

## 5.46 2026-10-02：オーナーの判断（10/1 夜・10/2）、説明動画3本（第87弾）、題の「最速」（第88弾）、問い合わせ・プライバシーポリシー・規約のお知らせ（第89弾）、開発記事の数字と言い切り（第90弾）、本文の「逃さない」と「200〜300ms」（第91弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/2 15:26 | [#1879](https://github.com/simplememofast/simplememo/pull/1879) | 第87弾（動画3本＋ポスター2つ＋英語字幕＋manifest＋生成スクリプト2本＋ページ6つ＋サイトマップ）：説明動画3本（Siri・Obsidian・AI タグ）の文言を本文にそろえて作り直した（オーナー判断 ①）。Obsidian は「メールとは別に、保管庫へ追記」、AI タグは「Obsidian連携でオンにすれば（既定はオフ）」、Siri は6画面になったガイドに字幕を付け直し、「同時に届く」の画面に従来の表現の注記、終わりの「AirPodsのステム長押しからも呼び出せます」を「機種と設定で違います」に、締めを「アプリを開かず、声で残す。」に。同じ URL のまま中身が変わるので参照に `?v=` |
| 10/2 15:47 | [#1881](https://github.com/simplememofast/simplememo/pull/1881) | 第88弾（記事 日英＋一覧2つ＋OG 画像＋サイトマップ）：`/blog/instant-capture-workflow`（日英）の題から「最速」「The Fastest Way」を外した（オーナー判断 ②）。説明の「逃さない」「0.4秒で実現」と CTA の「0.4秒起動」「オフライン暗号化」も、これまでの判断の書き方にそろえた |
| 10/2 16:03 | [#1882](https://github.com/simplememofast/simplememo/pull/1882) | 第89弾（問い合わせ・プライバシーポリシー・利用規約 日英＋サイトマップ）：問い合わせのフォームへの返信は自動の定型のご案内だけで、担当者の返信が要るときは support@ へメール、と案内（④）。プライバシーポリシー 5(A) にリマインダーの案内メール（⑤）。利用規約に 10/15 の改定のお知らせ（③） |
| 10/2 16:26 | [#1883](https://github.com/simplememofast/simplememo/pull/1883) | 第90弾（開発記事 日英6ページ＋英語の記事1つ＋よくある質問 日英＋フィード＋サイトマップ）：計測の記録の無い数字（「どの国からでも数十ミリ秒」「レート制限チェックも数十ミリ秒」「世界中から数十ms」）と言い切り（「なりすまし送信は不可能」「送信した瞬間に処理が完了」「高い到達率」、アプリ全体の話としての「外部依存ゼロ」の利点）を直し、Keychain の説明をアプリのコードで確かめた設定（この端末だけ・最初のロック解除のあとから読める）にし、Resend の無料枠の誤り（「月100通」→ 1日100通・月3,000通）を直した。再送の「指数バックオフ（1秒→2秒→4秒→8秒…）」は送信待ちの再送の実装と合わないので、再送のきっかけ（回線の復帰・起動時・バックグラウンド）と回数の上限の書き方に（`/devlog/day1`・`/en/blog/offline-first-comparison` も）。重複送信の防止の説明（「Relay API は受信したメッセージIDを記録」「冪等性の保証」）も、実装どおり「メッセージIDを Resend の Idempotency-Key として渡し、Resend が24時間覚えている」に（`/faq` も） |
| 10/2 16:49 | [#1884](https://github.com/simplememofast/simplememo/pull/1884) | 第91弾（本文5ページ＋開発記事 日英10ページ＋フィード＋サイトマップ）：本文の「逃さない」のうち約束に読める5か所を「その場で書き留める」などに（オーナー判断 #58 ①）。開発記事の記録の無い「実機計測で 200〜300ms」を外し、目標（500ms以下）と記録の残る画面録画の計測（0.17秒・0.4秒）だけに（#59 ②）。関連記事のカードの「500ms以下を実現する」→「目標にした」 |
| 10/2 17:13 | [#1886](https://github.com/simplememofast/simplememo/pull/1886) | 第87〜第91弾の計測の台帳の note と annotations の行、この §5.46、§5.45 の「この PR」の行、§5.9 の JA-050、§7 の #43・#57 と新しい #58・#59 |

### オーナーの判断（10/1 夜・10/2）

| # | 判断 | 対応 |
| --- | --- | --- |
| ① | 説明動画3本を作り直す（事実をそろえ、締めは「アプリを開かず、声で残す。」） | 第87弾 [#1879](https://github.com/simplememofast/simplememo/pull/1879) |
| ② | 題の「最速」は、計測の無い2本（`/blog/instant-capture-workflow` 日英）だけ変える | 第88弾 [#1881](https://github.com/simplememofast/simplememo/pull/1881)。ベンチマークの記事の題など、計測の記録がある題は残した |
| ③ | 利用規約の改定は 2026年10月15日適用で、今週お知らせを出す（改定日と改定履歴を付ける。アプリの中の規約は開発向けの作業表へ） | 第89弾 [#1882](https://github.com/simplememofast/simplememo/pull/1882) でお知らせを載せた。本文の改定は 10/15 の朝に、下書きの [#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す（予約済み） |
| ④ | 問い合わせフォームは、サイトの文言を直す（返信は自動の定型のご案内だけ。担当者の返信が要るなら support@ へメール） | 第89弾 [#1882](https://github.com/simplememofast/simplememo/pull/1882) |
| ⑤ | リマインダーの案内メールは、プライバシーポリシーに書き足す | 第89弾 [#1882](https://github.com/simplememofast/simplememo/pull/1882) |
| #58（10/2） | 本文に残る「逃さない」は、約束に読める所だけ直す | 第91弾 [#1884](https://github.com/simplememofast/simplememo/pull/1884)（5か所。目的の言い方は残した） |
| #59（10/2） | 開発記事の「実機計測で 200〜300ms」は、数字を外して目標だけにする | 第91弾 [#1884](https://github.com/simplememofast/simplememo/pull/1884)（記録の残る画面録画の計測は残した） |
| ⑥ | さくらのナレッジの原稿は Claude が下書きを作る（コードと `/devlog/outbox-architecture` で事実を確かめ、オーナーの確認のあとで送る） | 下書きを作った（10/2。非公開の文書で、編集部には送っていない）。アプリと送信用サーバーのコードで確かめる事実は一覧にして、確かめるまで原稿に印を付けてある |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **英語ページのパンくずの名前は見出しから作る規則**：第88弾で英語の題をコロン入りに変え、パンくずの名前も同じにしたら、手元の検査で `scripts/finalize_split_pages.py --check` が落ちた。英語ページのパンくずの名前は h1 の文字をつないで作る規則で、ほかの記事も同じ形 | 規則どおりの名前にした（CI の検査と同じ） |
| **説明動画の終わりの言い切り**：Siri の説明動画の終わりの画面「AirPodsのステム長押しからも呼び出せます」と英語字幕 "You can also activate Siri from your AirPods" は、`/siri/` の説明（AirPods Pro・AirPods 4（ANC）は長押しが既定でノイズコントロールで、Siri は起動しない）と食い違っていた。作り直した動画をフレームで見て気づいた | 第87弾で「ステムの長押しで呼べるかは、機種と設定で違います」に（英語字幕と `/en/siri/` の書き起こしも） |
| **開発記事の数字と言い切り**：`/devlog/relay-api-design` の「どの国からでも数十ミリ秒」などは計測の記録が無く、Resend の無料枠「月100通」は誤り（料金ページでは1日100通・月3,000通）。`/devlog/outbox-architecture` の「Keychainはセキュアエンクレーブに紐づいており、バックアップからはアクセスできない」は、アプリのコードの設定（`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`）で確かめると、言い方が不正確だった（ほかのアプリから読めず、バックアップから別の端末へ移らない、が正しい）。記事のコード例（鍵が読めなければ新しく作る形）は書いた時点の簡略版で、今のコードは読み取りエラーを「鍵が無い」と扱わない。「外部依存ゼロ」の利点のうちダウンロードサイズとビルドはアプリ全体の話で、アプリ全体では外部の SDK（Google サインイン、Firebase、AppsFlyer）も使っている（`/devlog/privacy-first-design`） | 第90弾 [#1883](https://github.com/simplememofast/simplememo/pull/1883)。送信元のドメインの SPF・DKIM・DMARC は DNS で確かめた。あわせて、再送の「指数バックオフ（1秒→2秒→4秒→8秒…）」も、アプリのコードで確かめると送信待ちの再送には使われていなかったので、再送のきっかけの書き方にした。重複送信の防止も、送信用サーバーが自分でメッセージIDを記録するのではなく、Resend の Idempotency-Key（24時間保持）に任せる形だったので、そう書いた（`/faq` の「冪等性保証」も） |
| **開発記事の「実機計測で 200〜300ms」**：`/devlog/uikit-vs-swiftui`（日英）の Time-to-Text の実測値（os_signpost）は、台帳に計測の記録（日時・端末・回数）の場所が無い | オーナーに聞いた（§7 #59）→ 10/2 判断：数字を外して目標だけにする → 第91弾 [#1884](https://github.com/simplememofast/simplememo/pull/1884) |
| **本文に残る「逃さない」**：題・説明・OG 画像の「逃さない」は第34・59・76・85弾で直したが、本文には「逃さない」「逃さず」が11ページに残る（`/blog/ai-information-workflow`・`/blog/business-memo-apps-2026`・`/blog/captio-discontinued`・`/methods/`・`/use-cases/`・`/use-cases/job-hunting/`・`/use-cases/writers/`・`/vs/bear/`・`/vs/craft/`・`/vs/day-one/`・`/vs/heptabase/`）。多くは「アイデアを逃さないための」という目的の言い方 | オーナーに聞いた（§7 #58）→ 10/2 判断：約束に読める所だけ直す → 第91弾 [#1884](https://github.com/simplememofast/simplememo/pull/1884)（5か所） |

### 次にやること

- 毎晩の確認（10/2 20:40 JST の予約分）。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。
- さくらのナレッジ：編集部の返事を待つ。原稿の下書きの事実は、鍵の扱い・再送のきっかけ・重複の防止をアプリと送信用サーバーのコードで確かめた（第90弾の記事の直しと同じ）。残りを確かめてから、オーナーに確認してもらう。
- アプリ側の課題は開発向けの作業表で進める。

## 5.47 2026-10-02 夕方：よくある質問の鍵の保管・アプリ削除時の Keychain・再送と重複の防止（第92弾）、社名の表記ゆれとよくある質問の重複（第93弾）、用語集 Outbox の「重複送信も防止」（第94弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/2 17:17 | [#1887](https://github.com/simplememofast/simplememo/pull/1887) | 第92弾（よくある質問 日英＋開発記事 Day1 日英）：`/faq` の「Keychain内のデータもアンインストール時に削除されます」を、iOS の仕組みどおり「アプリを削除しても端末に残ることがある（暗号化したメモのファイルはアプリと一緒に消える）」に。「暗号化キーは端末のセキュアエンクレーブで保護」を Keychain の実際の設定（この端末だけ・最初のロック解除のあとから読める）に。重複送信の防止の言い切り（「二重に送信されることはありません」「実メールは1通だけ正しく届きます」）を24時間の範囲つきに、再送の説明（「充電中、Wi-Fi接続中など」「通常は数分以内に復旧します」）を実際のきっかけと回数の上限に。`/devlog/day1` の「Relay API側で重複チェックを行う」に 2026-10 の追記（今は Resend の Idempotency-Key、24時間） |
| 10/2 17:48 | [#1890](https://github.com/simplememofast/simplememo/pull/1890) | 第93弾（英語の Obsidian ガイド10ページ＋`/en/about/`＋よくある質問 日英＋サイトマップ）：「Yurica Inc.」を「YURIKA, K.K.」に（オーナー判断 #54 ①の英語の社名）。`/faq` の「株式会社YURIKA」を「株式会社ユリカ」に（`/legal` の販売事業者名と同じ）。`/faq` のトラブルシューティングの最後で重複していた3問を外した（FAQPage も 71件 → 68件） |
| 10/2 18:10 | [#1892](https://github.com/simplememofast/simplememo/pull/1892) | 第94弾（用語集 日英＋サイトマップ）：`/glossary/outbox-architecture` の定義「『ネットワーク障害時のデータ損失』と『重複送信』の両方を防止します」を、Outbox だけでは応答の失われたメッセージが送り直されるので、受け取る側の重複防止（冪等キー）と組み合わせる、シンプルメモではメッセージIDを冪等キーとして渡し24時間の重複を防ぐ、に |
| 10/2 18:36 | [#1895](https://github.com/simplememofast/simplememo/pull/1895) | 第92〜第94弾の計測の台帳の note と annotations の行、この §5.47、§5.46 の「この PR」の行、§7 の新しい #60 |
| 10/2 21:09 | [#1896](https://github.com/simplememofast/simplememo/pull/1896) | 第95弾（`llms.txt`＋よくある質問 日英）：`llms.txt` の「AES-GCM-256 for the Outbox queue and send history only」を、入力中の下書きも含める書き方に（同じファイルの「Draft auto-save (on-device AES-GCM)」と `/guides/draft-autosave/` と食い違っていた。アプリでも下書きは AES-GCM で暗号化して保存）。`/faq` の「すべてのメモデータ（Outbox・履歴）」にも入力中の下書きを足した |
| 10/2 21:49 | [#1897](https://github.com/simplememofast/simplememo/pull/1897) | 第95弾の annotations の行、§5.47 の毎晩の確認と「この PR」の行 |
| 10/2 22:09 | [#1898](https://github.com/simplememofast/simplememo/pull/1898) | 第96弾（JSON-LD の公開版26ページ＋`data/site-constants.json`＋`llms.txt`＋Captioo の4ページ＋英語の記事1つ＋サイトマップ）：App Store の公開版 5.9.11 → 5.9.12（10/2 10:19 JST 公開。第37弾 [#1726](https://github.com/simplememofast/simplememo/pull/1726) と同じ手順）。`/blog/captioo-alternative`（日英）と `/vs/captioo/`（日英）の「App Store で『Captio』を検索すると Captioo とシンプルメモが並ぶ」を、確かめられる範囲（App Store では Captioo が見つかる。日本語の記事は、Google では日本語のページが出ることがある、も）に。`/en/blog/instant-capture-workflow` の見える更新日を dateModified に合わせた（第88弾の残り） |
| 10/2 22:44 | [#1899](https://github.com/simplememofast/simplememo/pull/1899) | 第96弾の annotations の行と 5.9.12 の公開の行、第96弾の計測の台帳の note、§5.47 の「見つけたこと」の3行と「この PR」の行、毎晩の確認の「事実訂正の次の弾」、§7 #47 の追記 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **「Keychain内のデータもアンインストール時に削除されます」**（`/faq` 日英）：iOS はアプリを削除しても Keychain の項目を消すとは約束しておらず、Apple の開発者フォーラムでの Apple の技術者の説明では、今は残る。アプリのコードにも、削除のあとに消す処理は無い | 第92弾 [#1887](https://github.com/simplememofast/simplememo/pull/1887)。「残ることがある」と書き、暗号化したメモのファイルはアプリと一緒に消えること、送ったメモは送り先（受信箱・保管庫・Notion）に残ることを足した |
| **「端末のセキュアエンクレーブで保護されます」**（`/faq` 日英）：`/glossary/aes-gcm/` の「Keychain保存なら鍵はSecure Enclaveから出ませんか？→そうとは限りません」と食い違っていた。履歴の質問の「鍵が Data Protection レベル（completeUntilFirstUserAuthentication）で保護」も、鍵の設定とファイルの保護を混ぜていた | 第92弾 [#1887](https://github.com/simplememofast/simplememo/pull/1887)。`/devlog/outbox-architecture`（第90弾）と同じ、Keychain の実際の設定の書き方に |
| **第90弾の残り**：`/devlog/relay-api-design` と `/faq` の重複送信の防止は第90弾で直したが、`/devlog/day1` の5節「冪等性の保証」（「Relay API側で重複チェックを行う」「同じメモを二重に受信することはない」）と、`/faq` のほかの3問（通信の暗号化・「未送信」と表示されたのに届いた・同じ本文の連続送信）に、同じ言い切りと、アプリの版の名前を使った書き方が残っていた | 第92弾 [#1887](https://github.com/simplememofast/simplememo/pull/1887)。Day1 は同じ記事のレート制限と同じ「追記」の形にした |
| **社名の表記ゆれ**：第83弾 [#1839](https://github.com/simplememofast/simplememo/pull/1839) は英語ページのフッターの社名を「YURIKA, K.K.」にそろえたが、本文の注記（英語の Obsidian ガイド10ページの「independent app by Yurica Inc.」）と `/en/about/` の会社の欄（「Yurica Inc.」）、`/faq` の「株式会社YURIKA」が残っていた | 第93弾 [#1890](https://github.com/simplememofast/simplememo/pull/1890)。`/en/blog/ios26-speechanalyzer-live-mic` のコード例の語（"Yurica"）は、音声認識に渡す語の例なので残した |
| **台帳の書き込みの誤り（[#1886](https://github.com/simplememofast/simplememo/pull/1886)）**：§7 の #58・#59 の行に、PR の番号と時刻が差し込まれず「{L(N91)}（{W91}」の文字のまま載った（行を足す処理で、差し込みの書き方を誤った） | [#1891](https://github.com/simplememofast/simplememo/pull/1891)（10/2 17:55）で直った。この PR では、書き込んだあとに差し込みの残り（`{L(`・`{W`）が無いことを確かめた |
| **用語集の「重複送信も防止」**：`/glossary/outbox-architecture`（日英）の定義は、Outbox パターンだけで重複送信も防ぐと書いていた。第90弾・第92弾で直した説明（重複は Resend の冪等キーで防ぐ）と食い違う | 第94弾 [#1892](https://github.com/simplememofast/simplememo/pull/1892) |
| **よくある質問の重複**：`/faq`（日英）のトラブルシューティングの最後に、すぐ下の「お問い合わせ・サポート」と「使い方」にある3問が、同じ答えでもう一度入っていた（FAQPage にも二重に入っていた） | 第93弾 [#1890](https://github.com/simplememofast/simplememo/pull/1890) で外した |
| **「摩擦ゼロ」「ゼロフリクション」「frictionless」**：シンプルメモについて「キャプチャの摩擦をゼロにしています」「摩擦ゼロのメモ体験」「Zero-friction memo experience」などと言い切る所が、日本語8ページ・英語9ページほどに残る（題・説明・見出し・CTA を含む）。「逃さない」（§7 #58）と同じ種類の言い切り。方法の説明（Zettelkasten の一時メモの原則など）と、Captio を使っていたころの話は別。Gmail のスター運用ガイドの「二度と埋もれない」も同じ種類 | オーナーに聞く（§7 #60） |
| **App Store の公開版 5.9.12 と日本のストアの名前**：10/2 10:19 JST に 5.9.12 が公開された（iTunes Lookup の日本・米国・英国のストア）。日本のストアの名前は、9/30 の確認の「シンプルメモ - Obsidian連携・高速音声入力」から「Obsidian連携音声シンプルメモ」に変わった（ドイツ・フランス・韓国・台湾・中国も同じ名前。米国・英国・カナダ・オーストラリア・インドは「Simple Memo - Obsidian Voice」のまま） | 公開版は第96弾 [#1898](https://github.com/simplememofast/simplememo/pull/1898) で直した。名前は §7 #47（アプリ側の作業）に追記し、開発向けの作業表にも書いた。サイトが案内している検索語（日本「Obsidian連携シンプルメモ」、米英「Simple Memo」）は、今も1番目に出る（iTunes Search API） |
| **「Captio」の検索でシンプルメモが並ぶ**：`/blog/captioo-alternative`（日英）と `/vs/captioo/`（日英）は、App Store で「Captio」を検索すると Captioo とシンプルメモが並ぶ、と書いていた（英語の記事は、App Store の名前ではない「Simple Memo - for Obsidian」の名前で）。10/2 の App Store のウェブの検索（日本・米国）と iTunes Search API（日本・米国、50件まで）では、シンプルメモは出ない（Captioo は出る） | 第96弾 [#1898](https://github.com/simplememofast/simplememo/pull/1898)。日本語の記事は、Search Console で確かめられる Google の側（「captio」の検索に日本語のページが出る。直近28日の平均順位 1.7〜9.9）だけ残した。英語のページは Google でも上位に出ていない（平均順位 38〜67）ので書かない |
| **第88弾の残り**：`/en/blog/instant-capture-workflow` の見える更新日が「September 5, 2026」のままだった（第88弾 [#1881](https://github.com/simplememofast/simplememo/pull/1881) で題を変え、dateModified は 10/2 にしていた。日本語のページは 10/2） | 第96弾 [#1898](https://github.com/simplememofast/simplememo/pull/1898) |

### 毎晩の確認（10/2 20:40 JST の予約分。20:45 前後に実施）

- **main と手元の一致**：今日マージした第87〜第94弾と台帳（[#1879](https://github.com/simplememofast/simplememo/pull/1879)・[#1881](https://github.com/simplememofast/simplememo/pull/1881)・[#1882](https://github.com/simplememofast/simplememo/pull/1882)・[#1883](https://github.com/simplememofast/simplememo/pull/1883)・[#1884](https://github.com/simplememofast/simplememo/pull/1884)・[#1886](https://github.com/simplememofast/simplememo/pull/1886)・[#1887](https://github.com/simplememofast/simplememo/pull/1887)・[#1890](https://github.com/simplememofast/simplememo/pull/1890)・[#1892](https://github.com/simplememofast/simplememo/pull/1892)・[#1895](https://github.com/simplememofast/simplememo/pull/1895)）と 10/1 の [#1842](https://github.com/simplememofast/simplememo/pull/1842)・[#1845](https://github.com/simplememofast/simplememo/pull/1845) は、マージの時点で手元の検証した木と同じ。その後に変わったファイルは、こちらの次の弾か、ほかの作業の変更（台帳の差し込みの直しの [#1891](https://github.com/simplememofast/simplememo/pull/1891) など）だけ。本番のページにも第92〜第94弾の文言が出ていることを確かめた（`/faq`・`/en/faq`・`/en/about/`・`/glossary/outbox-architecture/`）。
- **iOS Dev Weekly**：770号（10/2 の号）は 20:45 JST の時点でまだ出ていない（最新は 769号・9/25）。#1547 の記事が載るかは次の確認で見る。
- **受信箱（support@、読むだけ。返信はしていない）**：返信の要るものは無い。新しく届いたのは、SEO ツールの営業メール1件（サイトを無料で診断する、という提案）、テレビ番組からの紹介の提案1件（対話メモについて。費用の有無は本文の冒頭だけでは分からない。新しい種類の対外送信は凍結中なので返信していない）、ほかは利用中のサービスの規約改定のお知らせ・通知・ニュースレター。
- **awesome 系リスト（§6.5）**：7件すべて open のまま、メンテナの反応なし（20:50 ごろ確認）。
- **事実訂正の次の弾**：第95弾 [#1896](https://github.com/simplememofast/simplememo/pull/1896)（10/2 21:09）、第96弾 [#1898](https://github.com/simplememofast/simplememo/pull/1898)（10/2 22:09）。

### 次にやること

- 毎晩の確認は 10/3 20:40 JST に予約した（10/2 の分は上のとおり）。10/08 まで毎日かけ直す。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。
- さくらのナレッジ：編集部の返事を待つ。原稿の下書きの事実の確認を進めた（送信待ちの保存の順番・失敗の種類ごとの扱い・送り直しの順番）。再送の節の書き方は、オーナーに確認してから決める。

## 5.48 2026-10-03：オーナーの判断（10/3）、「摩擦ゼロ」の言い切りとプライバシーポリシーのインストール識別子（第97弾）

### オーナーの判断（10/3、選択式）

- **§7 #60（シンプルメモについての「摩擦ゼロ」「ゼロフリクション」「frictionless」）**：① 約束に読める所だけ直す → 第97弾 [#1911](https://github.com/simplememofast/simplememo/pull/1911)。
- **プライバシーポリシーのインストール識別子**：アプリを削除しても識別子が端末に残り、再インストール後も同じ識別子を使うことがある点を、プライバシーポリシーに書き足す（アプリの動きは変えない）→ 第97弾 [#1911](https://github.com/simplememofast/simplememo/pull/1911)。§5.47 の第92弾で `/faq` に書いた「iOS の仕組み上、アプリを削除しても端末に残ることがある」の、プライバシーポリシーの側。
- **§7 #47（App Store の名前とサイトの名前）**：③ このまま。ストアの名前は検索向けの名前、サイトの名前（「Obsidian連携シンプルメモ」「Simple Memo - for Obsidian」）はブランド名として扱う。実行中の brand-2026-08-11-entity-merge の評価日（2026-11-11）まで動かさない。
- **さくらのナレッジの原稿**：送り直しの節は、今のアプリの実装どおりに書く（下書きを直した。原稿は編集部の返事を待っている）。

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/3 13:31 | [#1911](https://github.com/simplememofast/simplememo/pull/1911) | 第97弾（日本語11ページ・英語13ページ＋プライバシーポリシー 日英＋サイトマップ）：§7 #60 の「約束に読める所だけ直す」。シンプルメモについて「摩擦ゼロ」「ゼロフリクション」「frictionless」「zero-friction」「二度と埋もれさせない」と言い切っていた所のうち、題・説明・見出し・ボタンの文言・比較の言い切りを「手間の少ない」「low-friction」などに（同じカードの「実行率が劇的に向上」「探す手間ゼロ」なども）。プライバシーポリシー（日英）の 1(B) と 12 に、インストール識別子は端末のキーチェーンに保存すること、iOS の仕組み上アプリを削除しても残ることがあり、その場合は再インストール後も同じ識別子を使うこと（AppsFlyer の Customer User ID も同じ識別子）を書き足した（最終更新日 10/3） |
| 10/3 13:52 | [#1913](https://github.com/simplememofast/simplememo/pull/1913) | 第97弾の annotations の行、この §5.48、§5.47 の「この PR」の行、§7 #60・#47 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **直さなかった「摩擦ゼロ」**：方法の説明（`/blog/fleeting-notes`（日英）の Zettelkasten の一時メモの原則、`/blog/memo-habit`（日英）の習慣の段階、`/en/methods/gtd/` の「GTD works best when capture is as frictionless as possible」）、Captio を使っていたころの話（`/devlog/day1`（日英）・`/en/about/`・`/en/captio-migration-guide/`）、メールや Gmail の一般的な使い方の説明（`/en/blog/engineer-code-snippets`・`/en/blog/student-memo-app`） | シンプルメモの約束ではないので残した（第97弾 [#1911](https://github.com/simplememofast/simplememo/pull/1911) の本文に一覧） |
| **よくある質問のオフラインのバナー**（`/faq`「画面上部にオレンジ色のバナーで『オフライン - 接続時に送信します』と表示されます。ネットワークが復旧すると、バナーは自動的に消えます。」、`/en/faq` も同じ）：アプリの表示と合っているかを確かめた（10/2 夜。圏外になると入力画面の上にオレンジ色のバナーが出て、回線が戻ると消える） | 直さない（説明どおり） |
| **テレビ番組からの紹介の提案（10/2 受信）**：§5.47 の毎晩の確認では「費用の有無は本文の冒頭だけでは分からない」としたが、本文に有料の制作と明記されていた（8/19 にも同じ会社から同じ種類の提案） | 返信しない（広告の購入にあたる） |

### 次にやること

- 毎晩の確認は 10/3 20:40 JST に予約してある。10/08 まで毎日かけ直す。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。
- さくらのナレッジ：編集部の返事を待つ。

## 5.49 2026-10-03 午後：「ゼロ」「取りこぼさない」の残りと設定・送り先の説明（第98弾）、下書きの自動保存をアプリの作りに（第99・100弾）、Captio の SMTP と「正統進化」・設定の「入力するだけ」・受信箱の整理ガイド（第100弾）、Obsidian の保管庫の場所と連携の条件（第101弾）、無料プランの機能と比較ページの「選ぶならこんな人」（第102弾）、比較の一覧の古いアプリ数とプライバシーの勧め（第103・104弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/3 14:17 | [#1914](https://github.com/simplememofast/simplememo/pull/1914) | 第98弾（日本語22ページ・英語20ページ＋サイトマップ）：§7 #60 の続き。「ゼロ」「取りこぼさない」「漏れなく」の言い切りの残り（`/` の「追加料金なし・アプリ容量ゼロ」、「手間がゼロ」「キャプチャの摩擦を限りなくゼロに近づけます」「zero-miss」など）と、設定・送り先の説明（比較表の「設定不要」→「少ない（メールアドレスの登録と確認）」、Drafts との比較の送り先、Gmail のラベルは共有できず共有は Google グループ、など）。「ロック解除から0.4秒」→ アイコンのタップから0.4秒（ウォーム起動の実測） |
| 10/3 14:43 | [#1915](https://github.com/simplememofast/simplememo/pull/1915) | 第99弾（日本語5ページ・英語9ページ＋サイトマップ）：下書きの自動保存の説明をアプリの作りに（入力が止まって約0.4秒後と背面に回るときに保存、落ちたときは最後に保存した時点まで、「重くなりません」を言い切らない）。公開ロードマップの「いまできること」に Obsidian・Notion 連携の条件。`/vs/google-keep/`（日英）の「受信トレイで即座に確認」。英語の言い切りの残り（LINE Keep・ひらめき・手書きとの比較・SMTP・Drafts） |
| 10/3 15:21 | [#1916](https://github.com/simplememofast/simplememo/pull/1916) | 第100弾（日本語9ページ・英語9ページ＋llms.txt＋サイトマップ）：①下書きの説明の残り（「打つそばから保存」→「入力が止まると保存」、「iPhone の中だけ・クラウドには送らない」→ アプリが送ることはなく、iPhone のバックアップには暗号化されたまま含まれることがある）②Captio：`/glossary/smtp/`（日英）の「旧Captioはユーザーの SMTP サーバーに直接接続していた」と `/glossary/captio-method/`（日英）の「正統進化」「The True Evolution of Captio」「modern evolution」③「メールアドレスを入力するだけ」→「登録して確認すれば」④`/guides/inbox-memo-organization/`（日英。6月の本文のまま）の差出人の絞り込み・画像を送れる前提の `has:attachment`・iPhone のメールのルール・.mbox の取り込み・容量の数字・記録の無い「たびたびいただく質問」など |
| 10/3 15:52 | [#1918](https://github.com/simplememofast/simplememo/pull/1918) | 第101弾（日本語8ページ・英語8ページ＋サイトマップ）：Obsidian 連携の説明で、保管庫の置き場所を「iCloud Drive の中」に限っていた所（`/hands-free/` の準備、`/apple-watch-obsidian/`・`/obsidian/daily-note/` の手順など）を「iCloud Drive か『このiPhone内』」に、連携の条件を書かずに「デイリーノートへ自動追記します」と言い切っていた所（`/obsidian/compare/`・`/obsidian/shortcuts-not-working/` など）に「連携をオンにしていれば」。`/en/blog/inbox-zero-workflow-tips-2026`（英語だけ、6月の本文）の「One tap, and it's in your inbox」と根拠のない数字 |
| 10/3 16:29 | [#1919](https://github.com/simplememofast/simplememo/pull/1919) | 第102弾（日本語6ページ・英語10ページ＋サイトマップ）：`/vs/ticktick/`（日英）の「無料プランは機能面での制約は一切ありません」「zero feature restrictions」と `/vs/standard-notes/`（日英）の「無料で機能制限なく使いたい」（Obsidian だけに保存するモードは Premium）。比較ページの「選ぶならこんな人」の一覧の言い過ぎ：「サーバーに保存しない」の主語（→ アプリのサーバー）、「メモの暗号化」（→ 端末内）、`/vs/moca/`（日英）の「業務メモのセキュリティを重視する」「Handle sensitive or work-related memos」、`/vs/anytype/` の「メール経由で即座に共有」、英語の「Can't afford …」。`/en/blog/best-note-to-self-apps-2026` の「For sensitive content, look for on-device encryption + minimal-server architecture」。英語の「in your inbox」「land in your inbox」と、`/en/vs/anytype/`・`/en/vs/joplin/` の設定の説明 |
| 10/3 17:12 | [#1920](https://github.com/simplememofast/simplememo/pull/1920) | 第103弾（本文は日本語4ページ・英語4ページ＋サイトマップ。英語の比較ページ36ページはパンくずの名前だけ）：`/vs/`（日英）の見出しの「16アプリ」「8つのメモアプリ」「16 Popular Apps」（一覧表は25アプリ、比較ページは38本）→ 数を書かない言い方に。英語の見出しから作られるパンくず（BreadcrumbList の2番目の名前）を `finalize_split_pages.py --apply` で39ページ更新。`/vs/apple-notes/` の「クラウドに頼らない設計」「No Cloud Dependency」、`/vs/day-one/` の「iCloudを使わず」「余計な情報を一切付けません」。`/blog/which-memo-app-flowchart`（日英）でプライバシー重視の人に E2E 暗号化のアプリと同じ並びで勧めていた所・早見表の ◎・「個人情報の登録も不要」・「ダウンロード後すぐに使えます」 |
| 10/3 17:37 | [#1921](https://github.com/simplememofast/simplememo/pull/1921) | 第104弾（日本語2ページ・英語2ページ。4ページとも更新日はすでに 10/3 なので、更新日とサイトマップは変わらない）：`/vs/`（日英）の「『プライバシー』重視 → シンプルメモ（プライバシーファーストのアーキテクチャ）」→「Standard Notes / シンプルメモ」（読まれては困る内容の保管はエンドツーエンド暗号化のアプリ、シンプルメモはアプリのサーバーに本文を残さない設計でE2E暗号化ではない）。`/vs/standard-notes/`（日英）の「暗号化されたデータがサーバーに存在すること自体がリスク」（比べる相手のメールは、受信箱にメールサービスが読める形で残る）→ トレードオフはノートを読めるアプリが限られること、と送ったメモはメールサービスに残ること。日本語の比較表「無料プランの機能：制限なし（送信数のみ）」→「1日3通まで（『Obsidianのみに保存』はPremium）」 |
| 10/3 18:10 | [#1923](https://github.com/simplememofast/simplememo/pull/1923) | §5.48 の「この PR」の行、この §5.49、第98〜104弾の annotations の行、`/` の2つの実験（video-2026-08-11-five-clips・title-2026-08-20-home-grammar）と en-2026-08-11-native-rewrite の note、§7 #61・#62 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **Captio の送り方の誤り**：`/glossary/smtp/`（日英）が「旧Captioはユーザーのメールアカウントの SMTP サーバーに直接接続していた（サーバー名・ポート・アプリパスワードが必要だった）」と書いていた。Captio の App Store の説明文では、設定なしでは Amazon SES のメールサーバーから送り、IMAP を設定すれば受信箱へ直接入れる方式 | 第100弾 [#1916](https://github.com/simplememofast/simplememo/pull/1916) で Captio の名前を外し、「自分のメールアカウントから送る方式のアプリでは」に |
| **Captio の後継に読める書き方の残り**：`/glossary/captio-method/` の CTA の題「Captioメソッドの正統進化」「The True Evolution of Captio」、英語の説明文（5か所）の「Simple Memo's modern evolution」 | 第100弾で「Captio のワークフローに着想を得た」に（Captio の書き方の決まり。§7 の「公式後継」「公認」を使わない、と同じ） |
| **下書きは端末のバックアップに含まれる**：アプリの作りでは、下書きは暗号化したファイルとして端末に置かれ、バックアップの対象から外していない（鍵は「この端末だけ」の設定）。`/guides/draft-autosave/` の「iPhone の中だけ」「クラウドには送らない」は、iCloud バックアップを使う人には言い過ぎ | 第100弾で「アプリが送ることはない。バックアップには暗号化されたまま含まれることがあるが、ほかの端末では読めない」に（プライバシーポリシー・よくある質問の鍵の説明と同じ。アプリの動きは変えない） |
| **`/guides/inbox-memo-organization/`（日英）が6月の本文のまま**：画像を送れる前提の説明、iPhone のメールでルールが作れる（iCloud メール用だけ）、Gmail に無いメニュー、.mbox を Obsidian・Notion に取り込める（どちらも .mbox に対応していない。10/3 に公式の一覧で確認） | 第100弾で直した |
| **確認コードは6桁**（サイトの説明どおり）。設定の説明の「メールアドレスを入力するだけ」は確認の手順を落としていた | 第100弾で「登録して確認すれば」に。「設定するだけ」の言い方（約15か所）は、確認も含むと読めるので残した |
| **Obsidian 連携の保管庫の場所**：アプリは iCloud Drive か「このiPhone内」にあり、ファイル App から開ける保管庫フォルダに書き込める（`/obsidian/` はそう書いている）。`/obsidian/sync/`（日英）は「Git や Syncthing だけで運用している保管庫は今は対象外」、`/hands-free/`（日英）の準備は「保管庫が iCloud Drive 上にある」と書いていて、できることを狭く書いている | 実験の対象でないページは第101弾 [#1918](https://github.com/simplememofast/simplememo/pull/1918) で直した。`/obsidian/sync/`・`/obsidian/plugins/`（日英）は internal-link-2026-09-02-003 の対象（評価 10/12）なので 10/13 以降に、`/obsidian/compare/logseq/`（日英）の同じ種類の文（「自動追記します」に連携の条件が無い）は aio-2026-08-12-logseq-answer-block の対象（評価 11/12）なので 11/13 以降に直す |
| **条件なしの「0.4秒起動」「0.4s launch」**：ブログ・活用事例・比較ページなど約140ページ・約240か所に残る（§7 #31 は「主要ページに条件を添える」だった） | §7 #61 としてオーナーに聞く |
| **「v3.9（2026年7月）で Apple Watch に対応」**（`/`・`/en/` の本文、`/` のレビュー紹介「この声を受けて、v3.9でApple Watchに対応しました」）：App Store Connect の配信の履歴では 3.4 が 6/10、3.9 が 7/4 に配信準備完了。Watch への対応がどの版で公開されたかで、書き方が変わる | §7 #62 としてオーナーに聞く（`/` は実験の対象なので、直すなら note を付ける） |
| **無料プランを「機能の制限なし」と書いていた所**：`/vs/ticktick/`（日英）と `/vs/standard-notes/`（日英）。`/faq` のとおり、メールを送らず Obsidian だけに保存するモードは Premium の機能 | 第102弾 [#1919](https://github.com/simplememofast/simplememo/pull/1919) で「1日3通まで（Obsidian だけに保存するモードは Premium）」に |
| **比較ページの「選ぶならこんな人」の一覧**（`/vs/` の日英 54ページ分を抜き出して読んだ）：「サーバーへのデータ保存を避けたい」「メモ本文をサーバーに保存させたくない」（送ったメモは受信箱、つまりメールサービスのサーバーに残る。英語はすでに「the memo app's own servers」）、「メモの暗号化が重要」（英語は on-device）、`/vs/moca/` の「業務メモのセキュリティを重視する」（サイト自身の案内は、機密性の高い内容はエンドツーエンド暗号化のアプリへ） | 第102弾で直した。「〜したい」の言い方で、できることを言い切っていない項目（「取りこぼしたくない」など）は残した |
| **`/en/blog/offline-first-comparison` の「Privacy-Focused Capture … Best choice: Simple Memo … capture sensitive information without network transmission」**：メールで送るアプリを「通信せずに機密を書き留めたい人」に勧めていて、送信待ちはつながると自動で送られる（「送ると決めるまで端末に置く」ではない） | aio-2026-08-12-entity-attribution の対象（評価 11/12）なので 11/13 以降に直す |
| **比較の一覧の見出しの古いアプリ数**：`/vs/` は「vs 16アプリ」と「8つのメモアプリ」、`/en/vs/` は「vs 16 Popular Apps」。一覧表は25アプリ、比較ページは38本。英語の見出しは `/en/vs/*` 全ページのパンくずの名前にもなっていた | 第103弾 [#1920](https://github.com/simplememofast/simplememo/pull/1920) で数を書かない言い方に。パンくずは自動で更新（en-2026-08-11-native-rewrite の対象 `/en/vs/google-keep-vs-apple-notes/` も名前だけ変わるので note を付けた） |
| **プライバシー重視の人への勧め**：`/blog/which-memo-app-flowchart`（日英）が、機密情報・医療情報について「アプリのサーバーに本文を残さない設計か、エンドツーエンド暗号化かで選ぶ」と2つを同じ並びに置き、早見表でシンプルメモのプライバシーを E2E 暗号化のアプリと同じ ◎ にしていた。日本語は「個人情報の登録も不要」（送り先のメールアドレスは登録する） | 第103弾で直した。`/vs/`（日英）の「『プライバシー』重視 → シンプルメモ」と `/vs/standard-notes/` の「暗号化データがサーバーにあること自体がリスク」は第104弾 [#1921](https://github.com/simplememofast/simplememo/pull/1921)。同じ種類の勧めが `/en/blog/business-memo-apps-2026`（「Security first — Standard Notes or Simple Memo」）・`/blog/memo-app-hikaku-matome`（「多くのユーザーに支持されています」）にもあるが、aio-2026-08-11-answer-blocks・aio-2026-08-12-entity-attribution の対象（評価 11/11・11/12）なので評価のあとに直す |
| **新しい実験 gsc-email-yourself-title-20261003**（`/blog/email-yourself-memo`、10/3 開始、評価 11/2） | 第98〜104弾はこのページを変えていない |

### 次にやること

- 毎晩の確認は 10/3 20:40 JST に予約してある。10/08 まで毎日かけ直す。
- 10/13 以降：`/obsidian/sync/`・`/obsidian/plugins/`（日英）の保管庫の場所と連携の条件。11/12 以降：`/obsidian/compare/logseq/`、`/en/blog/offline-first-comparison` の「Privacy-Focused Capture」、`/en/blog/business-memo-apps-2026` の「Security first」、`/blog/memo-app-hikaku-matome` の「多くのユーザーに支持」（それぞれの実験の評価のあと）。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。
- さくらのナレッジ：編集部の返事を待つ。

## 5.50 2026-10-03 夜：プランの表の Premium だけの機能（第105・106弾）、件名の決まり（第107弾）、守っていない約束と見える最終更新日（第108弾）、メール設定ガイドのオフラインの答えとダウンロードページ（第109弾）、「設定」の道順と iCloud メール（第110弾）、「SMTP不要の送信」（第111弾）、英語ページの Premium の料金（第112弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/3 18:09 | [#1922](https://github.com/simplememofast/simplememo/pull/1922) | 第105弾（日本語2ページ・英語2ページ＋サイトマップ）：`/faq`（日英）の「プランの違い」の表が、送信上限のほかは無料とプレミアムで同じ（○ ○）行だけで、プレミアムだけの機能（メールを送らず Obsidian だけに保存）が抜けていたので行を足した（FAQPage も）。`/use-cases/freelancers/`（日英）の「すべてのタスクを受信トレイに届けます」「dropping every task directly into your inbox the moment it surfaces」→ 送れる、に |
| 10/3 18:26 | [#1925](https://github.com/simplememofast/simplememo/pull/1925) | 第106弾（`llms.txt` だけ）：Premium の説明に「メールを送らず Obsidian だけに保存するのも Premium」、ハンズフリーの行の「送ると端末の Obsidian ノートに追記」に連携の条件（設定でオンにしたとき・選んだ保管庫フォルダのノート） |
| 10/3 18:50 | [#1926](https://github.com/simplememofast/simplememo/pull/1926) | 第107弾（日本語8ページ・英語9ページ＋サイトマップ）：件名の決まりをアプリの作りに。`/guides/gmail/`（日英）の「件名のカスタマイズ機能は準備中」「planned for a future update」（設定の「件名」は前からあり、`/faq` にも書いてある）→ 1行目が件名・設定の「件名」は先頭に付く・署名は本文の最後。`/how-to/`・`/use-cases/entrepreneurs/`・`/journaling/`・`/meeting-notes/`・`/work-tasks/`（日英）の、設定の「件名」で [IDEA]・[FEEDBACK]・[JOURNAL] などをメモごとに付けられるように読める所 → 1行目の先頭に書く。`/en/note-to-email/` の FAQ、`/blog/idea-memo-organization`（日英）の「件名に書いて送信」、`/blog/work-efficiency-memo`（日英）の「完了したら件名に DONE」（受け取ったメールの件名は Gmail などでは変えられない）→ スター・フラグを外す。`/en/use-cases/entrepreneurs/` の「No valuable idea falls through the cracks」 |
| 10/3 18:59 | [#1927](https://github.com/simplememofast/simplememo/pull/1927) | 第108弾（日本語2ページ・英語1ページ＋サイトマップ）：`/blog/benchmark-methodology`（日英）の「計測の画面収録を GitHub で公開準備中・公開しだいリンク」（公開しているリポジトリに動画は無い）→ いまは公開していない、「iOS やアプリの更新のたびに再テストしてこのページを更新することをお約束します」（表は 8/11 の計測・アプリ 5.7.3 のまま）→ 表は 8/11 の計測で、その後の更新で結果が変わりうる、見える「最終更新日 2026-08-11」→ 10/3。`/blog/obsidian-voice-fastest-route` の「（追記予定）…2026-08-27以降に確定…この位置に追記します」→ `/data/voice-shift/` と同じく、公開できる確定集計が無いので載せていない |
| 10/3 19:16 | [#1928](https://github.com/simplememofast/simplememo/pull/1928) | 第109弾（日本語6ページ・英語6ページ＋サイトマップ）：メール設定ガイド（日英5ページずつ）の「オフライン時に書いたメモはどうなりますか？」の答え（書いただけのメモも自動で送られるように読めた）→ 送信ボタンを押したメモだけが送信待ち（Outbox）に入って暗号化して保存され、つながると送られる。書きかけは下書きとして暗号化して保存。`/en/guides/gmail/` の「No memos are ever lost.」と、履歴の「all past memos and their delivery status」（履歴は最近のものだけ残り、表示は送信の状態）。`/download/`（日英）の音声入力に条件（iOS 26以降の対応機種・言語）、「届きます」→ 送られます、「届いたメモが保管庫へ」→ 送ったメモが、「¥0（ずっと）」→ 利用期間の制限なし（§7 #40） |
| 10/3 19:36 | [#1929](https://github.com/simplememofast/simplememo/pull/1929) | 第110弾（日本語3ページ・英語3ページ＋サイトマップ）：「設定 → Apple ID → …」の道順（いまの「設定」の一番上は自分の名前。Apple の案内も「設定」→ 自分の名前）を、`/guides/icloud/`（日英）・`/faq`（日英）の「メディアと購入」・`/blog/captioo-alternative`（日英）の解約で直した。iCloud ガイドの「iCloud メールを有効にするとアドレスが自動で作られる」→ 画面の案内で作る・あとから変えられない、「オフだとメールは受信されない」→ この iPhone のメールAppで見られない（スイッチは端末ごと） |
| 10/3 19:53 | [#1930](https://github.com/simplememofast/simplememo/pull/1930) | 第111弾（日本語2ページ・英語1ページ。3ページとも更新日はすでに 10/3）：Captio メソッドの用語ページ（日英）の「SMTP不要の送信」「SMTP-free sending」と `/vs/mail-to-self/` の説明文の「SMTP不要」→ SMTP の設定が要らない送信（アプリは HTTPS でリレーに渡し、メールは通常の SMTP で配送される） |
| 10/3 20:16 | [#1931](https://github.com/simplememofast/simplememo/pull/1931) | 第112弾（英語4ページ＋サイトマップ）：英語の活用事例3ページ（管理職・ペットの世話・研究者）と `/en/vs/standard-notes/` が Premium の料金を日本の円だけ（「500 yen/month」「JPY 500/month」）で書いていたのを、英語のほかのページと同じ「$2.99/month（日本では ¥500）」に |
| 10/3 20:38 | [#1932](https://github.com/simplememofast/simplememo/pull/1932) | §5.49 の「この PR」の行、この §5.50、第105〜112弾の annotations の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **よくある質問のプランの表に Premium だけの機能が無かった**：表は送信上限のほかすべて「○ ○」で、同じページの下の質問（「メールを送らずObsidianだけに保存する機能はPremiumで利用できます」）と食い違っていた。`llms.txt` の Premium の説明も「送信無制限」だけ | 第105弾 [#1922](https://github.com/simplememofast/simplememo/pull/1922)・第106弾 [#1925](https://github.com/simplememofast/simplememo/pull/1925) |
| **件名の決まりの説明のずれ**：アプリでは、件名は「設定の『件名』（既定は空）＋空白＋メモの1行目」、空なら1行目だけ、60文字まで、Obsidian 連携で AIタグ自動追加をオンにしているときは端末内で作った短いタイトル（`/faq` のとおり）。`/guides/gmail/`（日英）だけが「準備中」と書き、使い方・活用事例は、1つしかない設定の「件名」でメモごとに目印を変えられるように書いていた。アプリに件名の入力欄は無い | 第107弾 [#1926](https://github.com/simplememofast/simplememo/pull/1926) で、メモごとの目印は1行目の先頭に書く、に |
| **日本語の `/note-to-email/` の FAQ も同じ書き方**（「件名と署名はアプリ内で自由に設定できます」） | gsc-note-to-email-20260923（評価 10/23）の対象なので、10/24 以降に直す |
| **サイトが自分で書いて守れていない約束**：計測の画面収録の公開（「公開準備中」）、アプリや iOS の更新のたびの再テスト（「お約束します」）、利用実態の追記（「2026-08-27以降に確定…追記します」） | 第108弾 [#1927](https://github.com/simplememofast/simplememo/pull/1927) で、いまの状態をそのまま書く文に（約束をやめた。動画を公開するか、測り直すかは別の判断） |
| **見える「最終更新日」と `dateModified` のずれ**（サイト全体を数えた）：`/blog/benchmark-methodology`（日英）と `/autopilot/`（「最終更新 2026-09-04」、`dateModified` は 9/17） | 前の2ページは第108弾で直した。`/autopilot/` は自動運用の記録のページで、各節の計測時点を本文で書き分けているので触っていない |
| **オフラインの答えの書き方**：アプリでは、送信ボタンを押したメモだけが送信待ちに入り、つながると送られる。送っていない書きかけは下書き（これも暗号化して保存。自動では送られない） | 第109弾 [#1928](https://github.com/simplememofast/simplememo/pull/1928) |
| **履歴は最近のものだけ残る**：`/en/guides/gmail/` は「all past memos and their delivery status」。アプリでは新しいものから一定の件数を残し、表示は送信の状態（Sent・Pending・Failed） | 第109弾で直した。日本語版（「過去に送信したメモのリストと送信ステータス」）は変えていない |
| **ダウンロードページの音声入力に条件が無かった**：ページの上は「iOS 16.0以降」、音声入力は iOS 26以降の対応機種・言語（`/voice-input/`） | 第109弾で直した |
| **「設定」の道順の「Apple ID」**：いまの iOS の「設定」の一番上は自分の名前（Apple ID は Apple Account に名前が変わった）。Apple の案内（日英、10/3 に読んだ）も「設定」→ 自分の名前 → … | 第110弾 [#1929](https://github.com/simplememofast/simplememo/pull/1929) で直した。`/legal`（日英、特定商取引法に基づく表示）の「設定」＞「Apple ID」＞「サブスクリプション」は法定の表示なので残した（直すなら次に表示を改めるとき）。道順でない「同じApple IDでサインイン」などの呼び方も残した |
| **「SMTP不要の送信」**：アプリはメモを HTTPS でリレーに渡し、メールそのものは通常の SMTP で配送される（`llms.txt` も「delivery over standard SMTP」）。ほとんどのページは「SMTP設定不要」と書いていた | 第111弾 [#1930](https://github.com/simplememofast/simplememo/pull/1930) で、Captio メソッドの用語ページ（日英）と `/vs/mail-to-self/` の説明文を直した |
| **英語のページの円だけの料金**：英語のサイトは「$2.99/month or $29.99/year（日本では ¥500 / ¥5,000）」で書いているのに、4ページが「500 yen/month」だけだった | 第112弾 [#1931](https://github.com/simplememofast/simplememo/pull/1931) |
| **`/download/`（日英）の「日本のApp Storeでは『シンプルメモ - Obsidian連携・高速音声入力』として提供」**：日本のストアの名前は 10/2 から「Obsidian連携音声シンプルメモ」（10/3 夜もそのまま） | §7 #47 の判断（名前は brand-2026-08-11-entity-merge の評価日 11/11 まで動かさない）に合わせ、11/12 以降に直す。JSON-LD の alternateName の並びも同じ |
| **ロケールのトップページ（中・繁・韓・西・葡・印尼・亜・土）の「会議のあと」の段落**：「受信箱は毎日見るので、紙や開かないアプリに埋もれない」 | 毎日受信箱を見るという習慣を前提にした言い方で、アプリの性能の約束ではないので残した（§7 #58 の判断の範囲） |

### 毎晩の確認（10/3 20:40 JST の予約分。20:10〜20:45 に実施）

- **main と手元の一致**：今日の夕方からマージした第105〜第112弾と台帳（[#1922](https://github.com/simplememofast/simplememo/pull/1922)・[#1923](https://github.com/simplememofast/simplememo/pull/1923)・[#1925](https://github.com/simplememofast/simplememo/pull/1925)・[#1926](https://github.com/simplememofast/simplememo/pull/1926)・[#1927](https://github.com/simplememofast/simplememo/pull/1927)・[#1928](https://github.com/simplememofast/simplememo/pull/1928)・[#1929](https://github.com/simplememofast/simplememo/pull/1929)・[#1930](https://github.com/simplememofast/simplememo/pull/1930)・[#1931](https://github.com/simplememofast/simplememo/pull/1931)）は、変えたファイルが手元で検証した木と同じ（`git diff` が空。サイトマップは、あとからマージした弾の分が足されて main で `generate_sitemap.py --check` が通る）。どれも本番に出ていることを確かめた。
- **iOS Dev Weekly**：770号（10/2 発行。10/3 に確認）には #1547 の記事は載らなかった。次の 771号は 10/9 の予定。770号は、Google が Firebase の SDK に壊れた設定を配り、それに頼るアプリの多くが動かなくなった件に触れている（シンプルメモも Firebase の認証・App Check を使う。サイト側からは影響が分からないので、オーナーへの報告に書いた）。
- **App Store（日本）**：公開版は 5.9.12 のまま、評価 4.1（27件）。日本のストアの名前は「Obsidian連携音声シンプルメモ」（10/2 から。§7 #47）。米国は「Simple Memo - Obsidian Voice」、5.9.12。
- **受信箱（support@、読むだけ。返信はしていない）**：返信の要るものは無い。10/2 の確認のあとに届いたのは、通知・ニュースレター（Instagram・Indie Hackers・LINE 公式アカウントの案内）と、別の作業でこちらから出した問い合わせの受付の控え1件。迷惑メールのフォルダには、セミナーの案内1件だけ。
- **awesome 系リスト（§6.5）**：7件すべて open のまま、メンテナの反応なし（20:10 ごろ確認）。
- **事実訂正の次の弾**：第105〜第112弾（上の表）。

### 次にやること

- 毎晩の確認は 10/4 20:40 JST に予約した。10/08 まで毎日かけ直す。
- 10/13 以降：`/obsidian/sync/`・`/obsidian/plugins/`（日英）の保管庫の場所と連携の条件。10/24 以降：`/note-to-email/`（日本語）の FAQ「件名や署名はカスタマイズできますか？」。11/12 以降：`/obsidian/compare/logseq/`、`/en/blog/offline-first-comparison` の「Privacy-Focused Capture」、`/en/blog/business-memo-apps-2026` の「Security first」、`/blog/memo-app-hikaku-matome` の「多くのユーザーに支持」（それぞれの実験の評価のあと）、`/download/`（日英）の日本のストアの名前（§7 #47）。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。
- オーナーに聞いている §7 #61（条件なしの0.4秒）・#62（Apple Watch に対応した版）の答えを待つ。

## 5.51 2026-10-03 夜（続き）：オーナーの判断 #61・#62、Apple Watch に対応した版と月（第113弾）、0.4秒の起動に計測の条件（第114〜118弾）、実験の対象ページの一覧の取りこぼし

オーナーの答え（10/3 20:40 すぎ、選択式）：§7 #61「① 条件を添える」、§7 #62「③ 版と月を書かない」。

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/3 22:08 | [#1933](https://github.com/simplememofast/simplememo/pull/1933) | 第113弾（日本語3ページ・英語2ページ＋`llms.txt`）：§7 #62 ③。`/`・`/en/` の「2026年7月のv3.9でApple Watchに対応」「Version 3.9 (July 2026) adds Apple Watch support」（本文と JSON-LD の説明）、`/` のレビュー紹介の「v3.9で」、`/faq`（日英）の「v3.4から」「since v3.4」、`llms.txt` のプレスリリースの行の「v3.9」を外した。同じ文の「メールとObsidianの両方に」には `/apple-watch-obsidian/` と同じ条件（iPhone で Obsidian 連携をオンにしていれば）。文字が増えたのでトップのフォントの部分集合を作り直した（`assets/home-perf/`） |
| 10/3 22:28 | [#1934](https://github.com/simplememofast/simplememo/pull/1934) | 第114弾（ブログ 日本語29・英語28ページ＋サイトマップ）：§7 #61 ①の1本目。条件の書いていない0.4秒に「（iPhone 16e・ウォーム起動の実測）」「(warm launch, iPhone 16e)」、説明文は短く「（ウォーム起動の実測）」。FAQ は見える答えと FAQPage の両方。`/blog/email-management-tips` の「効率化化」の誤字も |
| 10/3 22:49 | [#1935](https://github.com/simplememofast/simplememo/pull/1935) | 第115弾（比較 日本語25・英語27ページ＋サイトマップ）：同じ書き方。比較表の「起動速度」の行の見出しに条件（計測はどのアプリもウォーム起動）。0.4秒を入力・キャプチャにかかる時間として書いていた6か所（`/vs/tana/`・`/vs/anytype/`・`/vs/heptabase/`）を書き始められるまでの時間に、アイコンの置き場所の助言（`/vs/note-to-self-mail/` 日英）から数字を外した |
| 10/3 23:09 | [#1936](https://github.com/simplememofast/simplememo/pull/1936) | 第116弾（活用事例 日本語17・英語17ページ＋サイトマップ）：同じ書き方。`/en/use-cases/ideas/` の H1 とパンくずにも |
| 10/3 23:33 | [#1937](https://github.com/simplememofast/simplememo/pull/1937) | 第117弾（用語集・メソッド・ガイド・使い方・紹介・声・LINE Keep・Captio など 日本語23・英語21・繁体字1ページ＋サイトマップ）：同じ書き方。`/line-keep/` の比較表の見出し（LINE Keep の欄はもともと「未計測」）、`/en/note-to-email/` のカードの見出し、`/zh-Hant/` は繁体字で「熱啟動，iPhone 16e 實測」 |
| 10/3 23:44 | [#1938](https://github.com/simplememofast/simplememo/pull/1938) | 第118弾（`/faq`・`/en/faq` の冒頭の要約と `llms.txt`）：同じ書き方。`/en/faq` の要約の「stores zero memo content on servers」→「does not persistently store memo bodies on its servers (transit only during send)」（同じページの FAQ の答え・日本語版・`llms.txt` と同じ言い方） |
| 10/4 00:39 | [#1939](https://github.com/simplememofast/simplememo/pull/1939) | §5.50 の「この PR」の行、この §5.51、§7 #61・#62 の判断と #63、第113〜118弾の annotations の行、3つの実験（video-2026-08-11-five-clips・title-2026-08-20-home-grammar・aio-2026-08-11-answer-blocks）の note |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **実行中の実験の対象ページの一覧の取りこぼし**：#61 では実験の対象ページを避けて評価日のあとに回していたが、そのための一覧から、aio-2026-08-11-answer-blocks の `pages` の欄にある `/blog/digital-vs-handwritten-notes`・`/blog/meeting-memo-template`・`/blog/best-memo-apps-2026` が抜けていた（`/apple-watch/`・`/ai-tags/` も、この実験の評価日 11/11 ではなく動画の実験の 10/11 で数えていた）。第114弾 [#1934](https://github.com/simplememofast/simplememo/pull/1934) で `/blog/digital-vs-handwritten-notes` の3か所（カード・段落・CTA。回答ブロックの外）に条件を足し、PR の本文でもこの実験を書き漏らした | 戻すとまた変更が増えるので戻さず、その実験に交絡の note を足した（このPR）。一覧は experiments.json の `page`・`pages` の両方から作り直し、第117・118弾はそれで確かめた（対象ページは0）。ほかの2ページは第113〜118弾で変えていない |
| **[#1933](https://github.com/simplememofast/simplememo/pull/1933) の CI の赤**：Homepage Section Rendering の chromium だけが、変えていない9番目の区画の高さ（±2px）で落ちた。firefox・webkit は通り、前の実行は緑 | 一時的な揺れとみて、落ちた job だけを再実行して通った |
| **日付が変わった 0:00（JST）に、main と開いている PR の `Autopilot page vs ledger` が赤**：`/autopilot/` の自律スコアは日付で値が動く（CLAUDE.md「/autopilot/ の自律スコアは日付で動く」）。この PR（[#1939](https://github.com/simplememofast/simplememo/pull/1939)）の最初の検証もこれだけで落ちた | 手で数字は直さず、自動の更新 [#1941](https://github.com/simplememofast/simplememo/pull/1941)（10/4 00:20）が main に入るのを待って、検証をやり直した |
| **`/en/faq` の要約の「stores zero memo content on servers」**：送るときにメモ本文はリレー（Cloudflare Workers）と配送（Resend）を通る。同じページの答えは「not persistently stored」 | 第118弾 [#1938](https://github.com/simplememofast/simplememo/pull/1938) |
| **#61 で理由を書いて残した所**：計測の記事の本文（冒頭で条件を書いている）、計測方法のページ（日英）、0.4秒が何ではないかを説明する文、読者の質問、計測方法の記事へのリンクの文、下書きの自動保存の「約0.4秒」（入力が止まってから保存までの時間で、起動の話ではない）、`/en/blog/revenue-report-2025` の2025年の記録 | 残した |
| **#61 の実験の対象ページ（5ページ・19か所）**：`/ai-tags/`（1か所）・`/blog/fastest-memo-app-benchmark`（9か所）、`/blog/business-memo-apps-2026`（5か所）・`/blog/memo-app-hikaku-matome`（3か所）・`/en/blog/offline-first-comparison`（1か所） | 前の2ページは 11/12 以降、後の3ページは 11/13 以降（それぞれの実験の評価のあと） |
| **下書きのまま公開されている `/en/blog/revenue-report-2025`**：数字が「[X,XXX]」「[XX%]」のまま、ページの上に「DRAFT: This article contains placeholder data」。noindex・nofollow で、サイトマップにもサイト内のリンクにも無いが、URL を知っていれば開ける。「I'll update this table monthly」という約束もある | 触っていない。§7 #63 としてオーナーに聞く |

### 次にやること

- 毎晩の確認は 10/4 20:40 JST に予約済み（10/08 まで毎日かけ直す）。
- 11/12 以降：`/ai-tags/`・`/blog/fastest-memo-app-benchmark` の条件なしの0.4秒。11/13 以降：`/blog/business-memo-apps-2026`・`/blog/memo-app-hikaku-matome`・`/en/blog/offline-first-comparison`（§7 #61 の残り）。
- 10/13 以降：`/obsidian/sync/`・`/obsidian/plugins/`（日英）の保管庫の場所と連携の条件。10/24 以降：`/note-to-email/`（日本語）の FAQ。11/12 以降：§5.50 の残り（`/obsidian/compare/logseq/` ほか、`/download/` の日本のストアの名前）。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。
- §7 #63 をオーナーに聞く。

## 5.52 2026-10-04 未明：履歴の操作・ユーザーの声・Notion の説明（第119弾）、オフラインで「送信した」メモ（第120弾）、公開されている README、ウィジェットとコントロールの条件・「ワンタップで届く」（第121弾）、設定画面の道順（第122弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/4 00:46 | [#1942](https://github.com/simplememofast/simplememo/pull/1942) | 第119弾（日本語3・英語3ページ＋サイトマップ）：よくある質問（日英）の履歴の操作を今のアプリに合わせた。タップでは何も起きず**長押し**で、送れていないメモ（未送信・失敗）だけに「再送信」が出て、送信済みのメモは共有シートが開く（Obsidian だけに保存するメモは「もう一度書き込む」）。状態の表示は送れていないメモだけ（「未送信」「失敗」）、「最大リトライ超過」という表示は無い（止まったメモは「失敗」）、宛先のクリアのボタンは「クリアして最初から」で最初の設定の画面に戻る、英語版の状態の名前（Unsent→Pending）とアラートの文言。ユーザーの声（日英）の「今後の対応」「ロードマップに入れました」「次回のマイナーアップデートで改修予定」を当時の答えとして書き直し、その後に変わったこと（アプリの実装で確かめたものだけ）を書き添え、Slack への送信の説明を Slack のヘルプに合わせた。Notion 連携（日英）の「履歴から本文をコピー・送り直し」→ 長押しで「Notionへの保存を再試行」 |
| 10/4 01:14 | [#1943](https://github.com/simplememofast/simplememo/pull/1943) | 第120弾（日本語10・英語18ページ＋サイトマップ）：「オフライン（圏外）で**書いた**メモは送信待ちに入り、つながったら自動で送られる」→「オフラインで**送信した**メモは…」。送信待ちに入るのは送信ボタンを押したメモだけで、書いただけのメモは下書きとして端末に残り（暗号化）、自動では送られない。`/vs/moca/` の「送る前のメモを送信待ちに残し」も。`/how-to/`（日英）の「ワンタップで自分のメールに届きます」「Delivered to your email with one tap」→「送られます」「One tap sends it」 |
| 10/4 01:37 | [#1944](https://github.com/simplememofast/simplememo/pull/1944) | `README.md`（`/README.md` でそのまま公開されている）：「No analytics/tracking」（本番のページは GA4 を読み込む）、「WCAG 2.1 Level AA compliant」（監査の記録が無い）、「/support はメールへ転送」（いまは 404）、「CSS 約12KB」「外部依存なし」、実在しないファイル構成と古い配色を、いまのサイトに合わせた。SNS の停止のメモとデプロイの節はそのまま |
| 10/4 01:47 | [#1945](https://github.com/simplememofast/simplememo/pull/1945) | 第121弾（日本語16・英語15ページ＋サイトマップ）：「ウィジェットをタップすると声のメモが始まる」「iOS 18以降はコントロールセンターから1タップで音声メモ」に条件を書き足した（ウィジェットは iOS 17以降、コントロールは iOS 18以降。そのまま音声入力が始まるのは iOS 26以降の対応機種・言語だけで、それより前はメモの画面が開くだけ）。「ワンタップで自分のメールに届きます」「ワンタップでメール送信が完了」「One-tap email delivery」「Delivered to your inbox with one tap」→「送られます」「one-tap send」、比べた実測の無い「Craft を開いて AI 機能にたどり着く前に送信完了」「before you even open OneNote」、実測の無い「Zoomを閉じてから30秒以内に」（→「すぐに」）を外した。FAQ は見える答えと FAQPage の両方 |
| 10/4 02:16 | [#1946](https://github.com/simplememofast/simplememo/pull/1946) | 第122弾（日本語8・英語12ページ＋サイトマップ）：設定画面の道順を今のアプリに合わせた。「設定 → 詳細設定」「Settings → Advanced settings」という欄は無く、「起動時に音声入力を自動オン」「高音質録音」「送信サウンド」は「音声入力とサウンド」（iOS 26 より前の端末では「サウンドと触覚」）、「Obsidian 連携」は「Obsidian」の欄にある。Obsidian の送り先の選択肢「Inboxノート」→ アプリの表示どおり「指定したノート」（既定のノート名は Inbox）。「プラグイン不要・アプリを開かずバックグラウンドで」に、保管庫のフォルダを選んでいるとき、という条件（`/guides/`・`/en/guides/`・`/en/`）。FAQPage を生成している3ページは `inject_faq_schema.py` で作り直した |
| 10/4 02:40 | [#1947](https://github.com/simplememofast/simplememo/pull/1947) | §5.51 の「この PR」の行、この §5.52、§7 #64、第119〜122弾の annotations の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **よくある質問の履歴の操作が、今のアプリと違っていた**：「履歴でメモを**タップ**して『再送信』『共有』を選ぶ」と書いていたが、タップでは何も起きず、**長押し**で、送信済みのメモは共有シートがすぐ開き、「再送信」が出るのは送れていないメモだけ。状態の表示（「送信済み / 未送信 / 失敗」）も送信済みには出ない。英語版はアプリに無い「Unsent」「max retries exceeded」、違う文言のアラートを載せていた | 第119弾 [#1942](https://github.com/simplememofast/simplememo/pull/1942)。操作と表示の名前は、アプリの実装と画面の文言（日英）で確かめた |
| **ユーザーの声の「今後の対応」「ロードマップに入れました」「次回のマイナーアップデートで改修予定」**：5月ごろの答えが、今の予定のように残っていた。「ロードマップに入れました」と書いた項目は、いまの公開ロードマップには載っていない | 第119弾 [#1942](https://github.com/simplememofast/simplememo/pull/1942)。当時の答えとして書き直し、冒頭で公開ロードマップへ案内した。その後に変わったこと（キーボードで入力欄が隠れる件の修正、履歴の検索欄、案内のメモの自動送信をやめたこと、長押しの共有シート）を書き添えた |
| **Notion 連携の「履歴から本文をコピーしたり送り直したりできる」**：保存待ちのメモの長押しメニューにコピーは無い | 第119弾 [#1942](https://github.com/simplememofast/simplememo/pull/1942)（長押しで「Notionへの保存を再試行」） |
| **「オフラインで書いたメモは送信待ちに入る」**：送信待ちに入るのは送信ボタンを押したメモだけ。メール設定ガイドの FAQ は第109弾 [#1928](https://github.com/simplememofast/simplememo/pull/1928) で直していたが、ほかの28ページは「書いたメモ」のままだった | 第120弾 [#1943](https://github.com/simplememofast/simplememo/pull/1943)。読者の望みを書いた「向いている人」の行、端末内の暗号化だけを言う文、Captio の説明は残した |
| **公開されている README**：`/README.md` は 200（text/markdown）で配信されている（ミドルウェアが 404 にしているのは `/CLAUDE.md` と内部のフォルダだけ）。中身は「No analytics/tracking」「WCAG 2.1 Level AA compliant」「/support はメールへ転送」など、いまのサイトに当てはまらない記述だった | [#1944](https://github.com/simplememofast/simplememo/pull/1944)。README を配信しないようにする（ミドルウェアに足す）変更はしていない |
| **ウィジェットとコントロールの条件**：アプリは iOS 16 から動くが、「声でメモ」のウィジェットは iOS 17、コントロールセンター／ロック画面のコントロールは iOS 18 から。タップしてそのまま音声入力が始まるのは iOS 26以降の対応機種・言語だけで、それより前ではメモの画面が開くだけ（マイクのボタンも出ない）。12ページで条件なしに「タップで声のメモが始まる」と書いていた | 第121弾 [#1945](https://github.com/simplememofast/simplememo/pull/1945)。アプリの実装と、公開版より前のタグ（5.9.0〜5.9.11）の設定で確かめた。`/siri/`（日本語）は実行中の実験の対象なので 10/11 のあと |
| **「ワンタップで届く」「送信完了」の残り**：第63・109・120弾で直した書き方が19ページに残っていた。比べた実測の無い比較（Craft・OneNote）も | 第121弾 [#1945](https://github.com/simplememofast/simplememo/pull/1945)。「メモはメールで届く」「Memos arrive in your inbox」のような仕組みの説明（約50ページ）は、ワンタップで届くと約束する書き方ではないので残した（§7 #60） |
| **設定画面の「詳細設定」という道順**：「設定 → 詳細設定 →『起動時に音声入力を自動オン』」「Settings → Advanced settings」と11ページで書いていたが、今の設定画面にその欄は無い（公開版より前のタグ 5.8.26 の時点で、Notion・Obsidian・Apple Watch・音声入力とサウンドの欄に分かれている）。Obsidian の送り先の「Inboxノート」もアプリの表示（「指定したノート」）と違い、「アプリを開かずバックグラウンドで」は保管庫のフォルダを選んでいないと当てはまらない（送信時に Obsidian が一瞬開く） | 第122弾 [#1946](https://github.com/simplememofast/simplememo/pull/1946)。`/siri/`（日本語）の「設定 → 詳細設定」（高音質録音）と `/`（日本語）の「アプリを開かずバックグラウンドで」は実験の対象なので、それぞれの評価日のあと |
| **サイトのアクセス解析がプライバシーポリシーに書かれていない**：本番の443ページ（463ページ中）で Google アナリティクス 4 を読み込んでいるが、プライバシーポリシー（日英）はアプリについての説明で、サイトの Google アナリティクスや Cookie に触れていない。Google アナリティクスの利用規約（2023-05-15 更新）は、Google アナリティクスを使っていることとデータの収集・処理の仕組みを開示すること、Cookie などの使用をプライバシーポリシーで通知することを求めている | ポリシーの文言を変えるので、オーナーに聞く（§7 #64） |

### 次にやること

- 10/11 のあと：`/siri/`（日本語）の「コントロールセンターの1タップ音声メモはiOS 18以降」に、そのまま声のメモが始まるのは iOS 26以降の対応機種・言語という条件を足し、「高音質録音」の「設定 → 詳細設定」を「音声入力とサウンド」にする（英語版は第121・122弾で直した）。
- 11/21 以降：`/`（日本語）の「プラグイン不要・アプリを開かずバックグラウンドで」に、保管庫のフォルダを選んでいるときという条件を足す（「圏外で書いたメモ」と一緒に）。
- 毎晩の確認は 10/4 20:40 JST に予約済み。
- 11/12 以降：`/ai-tags/`・`/blog/fastest-memo-app-benchmark` の条件なしの0.4秒。11/13 以降：`/blog/business-memo-apps-2026`・`/blog/memo-app-hikaku-matome`・`/en/blog/offline-first-comparison`（§7 #61 の残り）。
- 10/13 以降：`/obsidian/sync/`・`/obsidian/plugins/`（日英）の保管庫の場所と連携の条件。10/24 以降：`/note-to-email/`（日本語）の FAQ。11/12 以降：§5.50 の残り（`/obsidian/compare/logseq/` ほか、`/download/` の日本のストアの名前）。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。
- §7 #63・#64 をオーナーに聞く。

## 5.53 2026-10-04 未明：認証の前の送信は予約（第123弾）、各言語のトップ（第124弾）、音声入力は iOS 26 以降（第125弾）、0.4秒は中央値（第126弾）

### main に入ったもの（JST）

| 時刻 | PR | 中身 |
| --- | --- | --- |
| 10/4 02:49 | [#1948](https://github.com/simplememofast/simplememo/pull/1948) | 第123弾（日本語1・英語2ページ＋サイトマップ）：よくある質問（日英）の「認証が完了するまで、メモの送信はできません」→「認証が済むまで、メモはメールで送られません（『送信を予約しました』と表示されたメモは、端末に残り、認証が済むと送られます）」。宛先のクリアの答えも。`/en/ai-tags/` の「to-dos and ideas into your Inbox note, logs into your daily note」→ 設定の「送り先」で選んだノートに入る |
| 10/4 03:08 | [#1949](https://github.com/simplememofast/simplememo/pull/1949) | 第124弾（各言語のトップ8ページ＋サイトマップ）：オフラインの答えを「オフラインで送ったメモ」に（中国語は「書いた」メモと書いていた）、AI タグの節の「端末内で文字起こし」に iOS 26 以降・対応言語の条件、中国語（簡体字・繁体字）の0.4秒の見出し・OG の説明に iPhone 16e、中央値を「0.4秒以内」と書いた3文を「タップから0.4秒で入力できる」に |
| 10/4 03:17 | [#1950](https://github.com/simplememofast/simplememo/pull/1950) | 第125弾（英語4・日本語2ページ）：音声入力は iOS 26 以降の対応機種・言語で、という条件を英語のトップ（機能カード・AI タグの節・紹介文・音声入力の節・構造化データ）・`/en/ai-tags/`・使い方（日英）の Siri の「音声メモ」・ガイドの一覧（日英）のカードに足した。ガイドの一覧の「どのガイドも5分以内で読み終わる」「Each guide takes less than 5 minutes to read」を削除 |
| 10/4 03:27 | [#1951](https://github.com/simplememofast/simplememo/pull/1951) | 第126弾（日本語3・英語4ページ＋`llms.txt`＋サイトマップ・開発記事の RSS）：メモのコツの記事（日英）の「起動が0.4秒以内のアプリを選ぶ」→「開いてすぐ書き始められるアプリを選ぶ」、`/en/vs/roam-research/` の「typing within 0.4 seconds」→ 中央値と書く。開発記事 `/devlog/uikit-vs-swiftui`（日英）の構造化データの `dependencies`「Xcode 16, Swift 6, iOS 17+」→「UIKit, Xcode Instruments (os_signpost)」。`llms.txt` のハンズフリーの行に iOS 26 の条件 |
| — | この PR | §5.52 の「この PR」の行、この §5.53、第123〜126弾の annotations の行 |

### 見つけたこと

| 見つけたこと | 対応 |
| --- | --- |
| **認証の前に送信をタップしたときの説明**：よくある質問（日英）は「認証が完了するまで、メモの送信はできません」と書いていたが、今のアプリでは、宛先が未設定・未認証のまま送信をタップすると「送信を予約しました。宛先を確認したら届きます」と表示され、メモは端末に暗号化して残り、認証が済むと送られる | 第123弾 [#1948](https://github.com/simplememofast/simplememo/pull/1948)。予約の動きは今後の設定で変わることもあるので、答えは画面の表示に結びつけて書いた |
| **AI タグの種別で送り先が変わる、という説明**：`/en/ai-tags/` が「やること・アイデアは Inbox、記録はデイリーノートへ」と書いていたが、アプリは種別を判定するだけで、追記先は設定の「送り先」で選んだノート | 第123弾 [#1948](https://github.com/simplememofast/simplememo/pull/1948)。日本語の `/ai-tags/` の同じ書き方は実行中の実験の対象なので 11/12 以降 |
| **各言語のトップに、日本語・英語で直した食い違いが残っていた**：オフラインの答え（中国語は「書いた」メモが自動で送られると書いていた）、音声入力の条件なし、中国語の0.4秒に端末名が無い・中央値を「0.4秒以内」と書いた文 | 第124弾 [#1949](https://github.com/simplememofast/simplememo/pull/1949)。8言語の訳は、各言語の今の文の言い回し（送信待ちの呼び方など）を使って意味だけを変えた |
| **音声入力の条件**：アプリの音声入力は iOS 26 以降の対応機種・言語でしか使えない（それより前はマイクのボタンが出ない）。英語のトップは「Auto-start on launch (iOS 26+)」と自動オンにだけ条件を付けていて、マイクをタップする音声入力は古い iOS でも使えるように読めた。Siri の「音声メモ」も、iOS 26 より前はメモの画面が開くだけ | 第125弾 [#1950](https://github.com/simplememofast/simplememo/pull/1950)。日本語のトップの同じ書き方（「✓ 起動時に自動オン（iOS 26+）」）は実験の評価日のあと（11/21 以降） |
| **ガイドの一覧の「どのガイドも5分以内で読み終わる」**：一覧から行けるページの多くは5分を超える（Captio の2ページは約15〜24分、`/obsidian/` は約9〜13分） | 第125弾 [#1950](https://github.com/simplememofast/simplememo/pull/1950)（一文を削除）。用語集の「3分で読めます」（4ページ）は本文が約2〜3分で、そのまま |
| **「0.4秒以内」**：0.4秒はウォーム起動5回の中央値（0.366〜0.433秒、`data/benchmark.json`）で、上限ではない。メモのコツの記事は、開発者の中央値を「アプリの選び方」の基準にしていた | 第126弾 [#1951](https://github.com/simplememofast/simplememo/pull/1951) |
| **開発記事の構造化データの「Xcode 16, Swift 6, iOS 17+」**：本文にその前提は無く、アプリは iOS 16.0 から動く | 第126弾 [#1951](https://github.com/simplememofast/simplememo/pull/1951) |
| **ストアの値**：10/4 03:00 に `check-store-facts.mjs --net` で実物と突き合わせた（評価 4.1・27件・公開版 5.9.12）。ずれなし | 変更なし |
| **公開ロードマップの「送る入口を増やす（共有シート・Action Button・Mac）」**：アクションボタンへの「声でメモ」の割り当ては今でもできる。ロードマップの項目は「見ているものをそのまま送る」入口のことで、アンケートの選択肢にはそう書いてある | オーナーの予定の書き方なので変えていない |

### 次にやること

- 10/11 のあと：`/siri/`（日本語）の「コントロールセンターの1タップ音声メモはiOS 18以降」に iOS 26以降の対応機種・言語の条件、「高音質録音」の「設定 → 詳細設定」を「音声入力とサウンド」に。
- 11/12 以降：日本語の `/ai-tags/` の「やること・アイデアはInboxへ、記録はデイリーノートへ」と条件なしの0.4秒、`/blog/fastest-memo-app-benchmark`。11/13 以降：§7 #61 の残り（`/blog/business-memo-apps-2026`・`/blog/memo-app-hikaku-matome`・`/en/blog/offline-first-comparison`）。
- 11/21 以降：日本語のトップ（`/`）の音声入力の条件・「プラグイン不要・アプリを開かずバックグラウンドで」の条件・「圏外で書いたメモ」。
- 10/13 以降：`/obsidian/sync/`・`/obsidian/plugins/`（日英）。10/24 以降：`/note-to-email/`（日本語）の FAQ。11/12 以降：§5.50 の残り。
- 10/15 の朝：利用規約の本文の改定（[#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す。予約済み）。毎晩の確認は 10/4 20:40 JST に予約済み。
- §7 #63・#64 をオーナーに聞く。

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

### オーナー判断待ち（2026-09-24 時点）

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
| 15 | Uneed・Microlaunch・Fazier への登録（§5.19） | アカウント作成を行わない | 依頼文（`Uneed・Microlaunch・Fazier登録_GPT依頼文.txt`）を GPT に渡してもらえれば、公開後に rel と robots を実測して §1 に記録する |
| 16 | ~~main の CI（#11）が直ったあとの #1546 の最新化~~ → **2026-09-24 14:56 マージ**（フィードの公開を確認） | — | 同日、iOS Dev Directory #1432 に `feed_url` を追加した（§5.26） |
| 17 | ~~開発記事 #1547（draft）の公開可否と事実確認（§5.20）~~ → **2026-09-24 判断：このまま公開する** → 同日 Ready に切り替えた | — | main の CI（#11）が直れば、検証成功で自動マージされる。**マージが 9/25 以降になるなら、先に日付と sitemap を直す**。公開後、フィード（#1546 がマージ済みなら）に足す。iOS Dev Weekly へ出すかは、公開後にあらためて判断してもらう（前回は見送り） → #19 で判断済み **→ 9/24 11:24 に同じアカウントで draft に戻っていた（#29）** **→ 9/24 17:46 マージ（#1547）** |
| 18 | ~~記事 #1547・RSS #1546 を、規約の読み直しを待たずに手動でマージするか~~ → **2026-09-24 判断：待つ（規約の読み直しを先に）**（§5.22） | 規約の条項の読み直しは人の判断 | 読み直しを反映する PR には、同じ日の `/autopilot/` の更新も入れないと main が緑にならない（§5.22）。緑になったら、こちらで3本の PR を最新化し、#1547 の日付を公開日に直す **→ 読み直しは #1555（9/24 14:24）で済んだ** |
| 19 | ~~公開後に記事をどこへ出すか~~ → **2026-09-24 判断：iOS Dev Weekly に提案＋dev.to に転載** → **同日実行**：iOS Dev Weekly は 17:57 ごろ提案フォームから送信、dev.to は `simple_memo` で転載を公開（正規 URL はサイト、リンクは dofollow）（§5.28） | — | 号に載ったかを金曜に確かめる |
| 20 | SourceForge のアカウント有効化（2026-09-23 23:53 に確認メール） → **2026-09-24 判断：オーナーが有効化する** | 有効化はアカウント作成の一部なので押さない | 有効化とプロジェクト公開のあと、rel と robots を実測して §1 に記録する |
| 21 | ~~規約の読み直しの範囲~~ → **2026-09-24 判断：8社32マスをまとめて（オーナー）** → 同日、**3社の抜き書きを見て「12マスとも前回どおり」**、5社20マスも前回どおり | — | #1555 で記録（マージ済み） |
| 22 | ~~3つの赤の解き方~~ → **2026-09-24 判断：Claude がまとめ役** → 同日 [#1555](https://github.com/simplememofast/simplememo/pull/1555) でまとめて解いた（14:24 マージ） | — | — |
| 23 | ~~依頼A を誰が直すか~~ → **2026-09-24 判断：Claude が PR を作る** → 同日 [#1553](https://github.com/simplememofast/simplememo/pull/1553)（14:53 マージ） | — | — |
| 24 | dev.to と note の投稿の停止 → **2026-09-24 調査：2つのタスクだけが 9/18〜19 から動いていない**（X の自動返信は今日も動く。§5.25） | タスクの記録（`~/Documents/Claude/Scheduled`）はこのセッションに付与できない | デスクトップアプリの定期タスク一覧で2つの状態と最後の実行結果を見てもらうか、そのフォルダをフォルダ選択でつないでもらえれば、記録から原因を確定する **→ 9/24 判断：オーナーがデスクトップの定期タスク一覧を自分で見る**  **→ 9/24 夜：dev.to・はてなの投稿は GitHub Actions へ移すと決まった（§5.27）。旧ローカルタスクの dev.to・はてな分はオーナーが止める** |
| 25 | ~~`admin/reddit/drafts.json` の古い Captio の事実・「spiritual successor」・名乗り方~~ → **2026-09-24 判断：直す** → 同日 [#1556](https://github.com/simplememofast/simplememo/pull/1556)（14:50 マージ） | — | — |
| 26 | ~~日本語 `/captio-alternative/` の「実測」速度比較と「起動0.4秒」~~ → **2026-09-24 判断：英語版に合わせる** → #1553 に入れた（14:53 マージ） | — | — |
| 27 | ~~Captio 以外のページの「永久保存」「送信前に暗号化」など~~ → **2026-09-24 判断：洗い出して直す** → 第1弾 [#1562](https://github.com/simplememofast/simplememo/pull/1562)（35ページ、16:10 マージ）、第2弾 [#1564](https://github.com/simplememofast/simplememo/pull/1564)（比較記事2本） | 見出しや宣伝文句の言い方は人の判断（#31） | 次の候補は #32 |
| 28 | dev.to に残る重複下書き（9/16 の記事と同じ題） | 削除は行わない | — |
| 29 | ~~開発記事 #1547 が draft に戻っている~~ → **2026-09-24 判断：今日公開する** → フィードと sitemap を入れて Ready → 17:46 マージ（§5.28） | — | — |
| 30 | ~~公開リポジトリの `docs/` に残るオーナー個人のユーザー名~~ → **2026-09-24 判断：今の版から伏せ字にする** → [#1567](https://github.com/simplememofast/simplememo/pull/1567)（17:54 マージ。31ファイル・40行） | 履歴の書き換えは行わない | — |
| 31 | ~~宣伝文句（0.4秒・Never lose・Zero Message Loss・永久保存）~~ → **2026-09-24 判断：主要ページに条件を添える／言い換える** → [#1573](https://github.com/simplememofast/simplememo/pull/1573)（18:43 マージ） | — | 届かなかった所は第3弾・第4弾へ（§5.28） |
| 32 | 言い過ぎの第3弾 → [#1575](https://github.com/simplememofast/simplememo/pull/1575)（9/24 21:19 マージ。43ページ：Captio の書き方・配達の保証・他社の事実・プライバシーの言い切り・裏付けのない「多くのユーザー」）、第4弾 → [#1591](https://github.com/simplememofast/simplememo/pull/1591)（9/25 10:37 マージ。「消えない」などの残り・他言語トップの 0.4秒） | — | 第5弾 [#1596](https://github.com/simplememofast/simplememo/pull/1596)（Boomerang・Email Me の古い記述、比較ハブのカード、他社の `aggregateRating`）（§5.28） |
| 33 | 投稿用の鍵を GitHub Secrets に登録（`DEVTO_API_KEY`・`HATENA_API_KEY`、任意で `IDENTITY_DENYLIST`）（§5.27） | 鍵の値を読む・入力することは行わない | 登録されれば、devlog-syndication の dry_run → 実投稿 → 公開面での rel・robots・AI 開示の確認まで進める |
| 34 | はてな・dev.to の過去記事にある出典の無い数値（起動187ms・開封率83%・「収益は買い切り」など）を訂正するか（§5.27） | 公開済み記事の書き換えは人の判断 | 訂正するなら、記事ごとに正しい値（`data/benchmark.json`・`data/site-constants.json`）と出典を並べた一覧を作る |
| 35 | WordPress.com（`simplememofast.wordpress.com`・dofollow・1本）を定期投稿の対象に加えるか（§5.27） | 投稿 API に OAuth アプリの登録が要る（アカウント設定の操作） | 加えるなら、同じ門・検査を使う投稿先として devlog-syndication に足す |
| 36 | ~~読者（`useTether.io` の創業者、9/25）からの聞き取りの依頼（30分）に返信するか（§5.28・§5.29）~~ → **2026-09-29 判断：返信しない**（§5.33） | 新しい宛先への送信は、送信の錠前ができるまで始めない（CLAUDE.md、2026-09-24 のオーナー判断） | 返信するなら文面を用意し、`Simple Memo <support@simplememofast.com>` から読み戻して送る |
| 37 | ~~**ホーム画面ウィジェットはあるか**（§5.30）~~ → **2026-09-29 確認：ある**（iOS のソースに「声でメモ」ウィジェット：ホーム画面の小・ロック画面の丸。§5.33） | アプリの機能はサイトの記述だけでは確かめられない。App Store の説明で確認できるのは「コントロールセンター／ロック画面から1タップで音声メモ（iOS 18以降）」だけ。サイトには「ホーム画面にシンプルメモのウィジェットを追加」（`en/captio-alternative`・`en/captio-migration-guide`）、「独自のロック画面ウィジェット」（`en/blog/captio-shutdown-alternatives`）と、「ウィジェットは不要」（`en/vs/apple-notes` の FAQ）が混在 | 有無が分かれば、該当ページの書き方を揃える（第9弾では `blog/iphone-memo-tips`（日英）の「ウィジェットから0.4秒」だけを、確認できる事実に直す） |
| 38 | ~~比較ページの「向いている人」の欄の「確実に」（「オフラインでもメモを確実に送りたい」など、日英あわせて約12ページ）を残すか（§5.31）~~ → **2026-09-29 判断：言い換える** → [#1678](https://github.com/simplememofast/simplememo/pull/1678)（9/29 22:57 マージ、17ページ） | 読者の希望の書き方だが、アプリが確実に送れると読める。どちらに寄せるかは表現の方針の判断 | 言い換えるなら「オフラインで書いたメモを送信待ちに残したい」などに揃える |
| 39 | アプリ内ガイド（5枚目）の文言「nothing is lost offline」を変えるか（§5.31） | アプリの画面の文言はサイトからは変えられない。`/en/siri` の画像の alt はこの画面を書き写している | 変えるなら、新しい画面に合わせて画像と alt を差し替える |
| 40 | ~~「ずっと無料」「free forever」「恒久的に」（日英あわせて約70ページ、特定商取引法に基づく表記の「Free：原則 1日3通まで（初日から適用・ずっと無料）」とJSON-LD の offer の説明にも）を残すか（§5.32）~~ → **2026-09-29 判断：「利用期間の制限なし」に言い換える** → 第27弾 [#1703](https://github.com/simplememofast/simplememo/pull/1703)（9/30 10:02 マージ、74ページ・JSON-LD の生成・`llms.txt`。§5.34）。利用規約の同じ言い方は #43 | 無料プランを将来も続ける約束として読める。利用規約 §9 は「事前通知なく、本サービスの内容変更、追加、停止または終了を行うことがあります」 | 言い換えるなら「無料プランに利用期間の制限はありません」「no time limit」に揃える（第14弾の Tana のページはこの書き方にした） |
| 41 | ~~計測の無い所要時間（「5秒で完了」「片手3秒でメモ→送信」「10秒以内に記録」「30秒で設定」「under 10 seconds」など、use-cases・methods・用語集を中心に日英あわせて約60ページ）を残すか（§5.32）。9/29 追記：`/fastest-voice-memo`（日英）の「実測で約5秒」「所要時間は実測値」も計測の記録が無い（§5.33）~~ → **2026-09-29 判断：言い換える**（「数秒で」「すぐに」に。数字は計測した0.4秒だけ残す）→ 第28弾 [#1709](https://github.com/simplememofast/simplememo/pull/1709)（9/30 11:05 マージ、112ページ。§5.34）。アプリの画面の表記は #44 | 0.4秒と違って計測の記録が無く、読者の操作の速さにもよる。#31 は 0.4秒への条件の付け方だけを決めたので、表現の方針の判断が要る | 外すなら「数秒で」「すぐに」などに言い換え、計測した0.4秒だけを数字で残す。残すなら「目安」と添える |
| 42 | ~~公開ページの版と評価の件数（5.8.66・26件。App Store の実物は 9/26 に 5.9.9・27件）を更新するか（§5.32）~~ → **9/28 の #1651 で 5.9.9・4.1（27件）に更新済み**（§5.33） | Codex の #1576（ストア検査の修正、draft）が「公開ページの訂正と、元のリリースの門（original release gates）が整うまで draft」としている。約40ファイルに及び、門の中身はこちらで確かめられない | 更新するなら #1576 を先に入れ、`sync_constants.js --write` でそろえる PR を作る |
| 43 | 利用規約（`/terms`・`/en/terms`）の「Free：原則 1日3通まで（初日から適用・ずっと無料）」を変えるか（§5.34） → **2026-10-01 判断：改定案を用意する** → 下書きの [#1840](https://github.com/simplememofast/simplememo/pull/1840)（改定日は仮に 2026年10月15日。改定日・周知のしかた・アプリの中の規約の扱いを決めてから公開する。§5.45） → **2026-10-01 夜 判断：2026年10月15日適用で、今週お知らせを出す** → 第89弾 [#1882](https://github.com/simplememofast/simplememo/pull/1882) でお知らせ。本文は 10/15 の朝に [#1840](https://github.com/simplememofast/simplememo/pull/1840) を今の main から出し直す（§5.46） | 契約の本文なので、変えるなら規約の変更の手続き（変更の周知と効力の発生日）が要る。書き換えの判断と手続きは人の判断 | 変えるなら、改定日・周知の文と一緒に「利用期間の制限なし」へそろえる PR を作る |
| 44 | アプリの画面の「おすすめの使い方（最短5秒）」（旧 `/fastest-voice-memo/` の FAQ による。現行版の表記はこちらでは未確認）を変えるか（§5.34）。同じ画面の説明文「…割り当てておくと、画面を見ないままメモが終わります」（`recommended_flow.lead`）も、アクションボタンで開いたあとに送信のタップが要るので言い過ぎ（§5.39） → **2026-10-01 判断：アプリ側の作業として、開発向けの作業表にまとめた**（§5.45） | アプリの画面の文言はサイトからは変えられない。サイトは #1701・第28弾で「5秒」の保証をやめた | 変えるなら、サイトの説明（「声でメモ」の設定の手順）と同じ言い方の候補を用意する |
| 45 | ~~条件の無い「最速」「Fastest」（CTA の見出し「最速のメモキャプチャを体験する」（4ページ）「Try the Fastest Memo App」「Try the fastest memo app for free」、タグライン「最速のメモ体験を、すべての人に」「The fastest memo experience, for everyone」（`/about`）、説明文「Fastest memo app for designers.」、見出し「一時メモの最速キャプチャツール」「Evernoteを補完する最速キャプチャ」「The Fastest Kanban Inbox」など、日英で約30か所）をどうするか（§5.35）~~ → **2026-10-01 判断（オーナーの「あなたにおまかせ」）：② 最速を使わない言い方にする** → 第76弾 [#1820](https://github.com/simplememofast/simplememo/pull/1820)（10/1 10:56 マージ。§5.42） | 当サイトの計測（8アプリ・iPhone 16e・ウォーム起動・タップから入力できるまで）で最も短かったのは事実だが、条件を書かずに「最速」と言うと、どの端末・どの比べ方でも最速に読める。`/comparison` のように「計測した8アプリで最速」と条件を書いた所と、ベンチマークの記事の題（「最速メモアプリはどれ？」）は候補に入れていない | ① 条件を添える（「当サイトの計測で最速」など）、② 最速を使わない言い方にする（「タップから0.4秒で書き始められる」など）、③ このまま、のどれかを選んでもらえれば、その方針で一括の PR を作る |
| 46 | ~~`/faq`・`/en/faq` の「レート制限」の表（1分あたり2通・1日あたり20通（端末）、1時間あたり10通（IP）、1日あたり90通（全体））と、Premium の「送信無制限」の関係（§5.35）~~ → **9/30 送信用のサーバーのソースで確認：端末ごとの上限と全体の1日の上限は2026年6月に撤去済みで、いまは IP アドレスごとの1時間あたりの上限だけ → 第39弾 [#1729](https://github.com/simplememofast/simplememo/pull/1729) で FAQ を直した**（§5.36）。利用規約の「例：端末あたりの1日上限等」は契約の本文なので残した | 表のとおりなら、Premium でも端末ごとに1日20通、サービス全体で1日90通が上限になり、「送信無制限」と食い違う。表が古いのか、上限が今もこの値なのかは、送信用のサーバー（このリポジトリには無い）の設定を見ないと分からない | 現在の上限を教えてもらえれば、表を直すか、Premium の説明に「不正利用を防ぐための上限あり」と書き添えるかを、その値に合わせて PR にする |
| 47 | ~~App Store のアプリ名（米国「Simple Memo - Obsidian Voice」、日本「シンプルメモ - Obsidian連携・高速音声入力」。9/30 の iTunes Lookup。英国・カナダ・オーストラリア・インドは米国と同じ、ドイツ・フランスは日本の名前）と、サイトのアプリ名（「Simple Memo - for Obsidian」「Obsidian連携シンプルメモ」。`data/site-constants.json` の appNameEn・appNameJa、JSON-LD の name、`llms.txt` の推奨名）が違う。どちらにそろえるか（§5.36）~~ → **2026-10-01 判断：アプリ側の作業として、開発向けの作業表にまとめた**（§5.45）。**10/2**：公開版 5.9.12 で、日本のストアの名前が「Obsidian連携音声シンプルメモ」に変わった（ドイツ・フランス・韓国・台湾・中国も同じ。米国などは「Simple Memo - Obsidian Voice」のまま）。サイトの名前との違いは「音声」の2文字（§5.47。開発向けの作業表にも追記） → **2026-10-03 判断：③ このまま**（ストアの名前は検索向けの名前、サイトの名前はブランド名として扱う。brand-2026-08-11-entity-merge の評価日 2026-11-11 まで動かさない。§5.48） | 名前は実行中の brand-2026-08-11-entity-merge（サイト全体）の対象で、変えると実験の交絡になる。ストアの名前は App Store Connect で決まり、サイトからは変えられない | ① サイトをストアに合わせる（JSON-LD の name は残して alternateName に足す、など段階を選べる）、② ストアをサイトに合わせる（App Store Connect の変更はオーナー）、③ このまま（ストアは検索向けの名前、サイトはブランド名として扱う）。①なら一括の PR を作る |
| 48 | App Store のスクリーンショット（2枚目「思いついたら、もうメモに。」）の「0.3秒起動」。サイトは計測した 0.4 秒（iPhone 16e・ウォーム起動・5回の中央値）だけを使っている（§5.36） → **2026-10-01 判断：アプリ側の作業として、開発向けの作業表にまとめた**（§5.45） | ストアの画像はサイトからは変えられない。0.3 秒の計測の記録（端末・条件）はこのリポジトリに見当たらない（`data/benchmark.json` には、以前「0.3s」を「~1s」へ一括で置き換えた経緯（PR #359）の記録があるだけ） | 0.3 秒の計測の記録があれば、その条件を `data/benchmark.json` に足す。無ければ、次にスクリーンショットを差し替えるときに 0.4 秒か数字の無い言い方に |
| 49 | **AIタグ自動追加（アプリの「AIタグ自動追加」）は既定オフ**で、Obsidian 連携を設定した人だけがオンにできる。サイトは第49〜第51弾でこの条件を書いた。アプリの既定や案内をどうするか（§5.37） → **2026-10-01 判断：アプリ側の作業として、開発向けの作業表にまとめた**（§5.45） | `simplememo-ios` の `SettingsManager.aiFormatEnabled` は既定 false（明示オプトイン）。`OnboardingViewController.swift` のコメントは「既定 OFF のため、Obsidian を設定しても存在に気づかず、タイトル・タグ・プロパティが付かないユーザーが多い。設定で勝手に ON にはせず、ここで明示的に選ばせる」 | ① このまま（サイトは条件つきで説明）、② 案内（オンボーディング・設定画面）で選ばせる形を強める、③ 既定をオンにする（体験とプライバシーの判断）。②③はアプリの変更で、サイトは結果に合わせて直す |
| 50 | **アプリスイッチャーでメモを隠す保護（プライバシーオーバーレイ）が有効になっていない**。サイトは第47弾で「有効ではない」に直した（`/devlog/privacy-first-design` はそれ以前から訂正済み）。アプリで有効にするか（§5.37） → **2026-10-01 判断：アプリ側の作業として、開発向けの作業表にまとめた**（§5.45） | 表示の処理はソースに残っているが呼ばれていない（`SceneDelegate.swift`）。表示中のメモがアプリスイッチャーの画像に残りうる | ① 有効にする（アプリの変更と審査。サイトは有効になった版から説明を戻す）、② このまま |
| 51 | **アプリの表示言語が、App Store の表記（10言語）と実際の切り替えで食い違う**：アプリ内の言語の一覧（`LocalizationManager.swift` の `SupportedLanguage`）は ja・en・es・fr・de・it・pt-BR・ko・zh-Hans・ar。一方、同梱の翻訳（`*.lproj`）は ar・de・en・es・fr・ja・pt・ru・zh-Hans・zh-Hant。このため、ロシア語の端末は英語、繁体字中国語の端末は簡体字で表示され、一覧にあるイタリア語・韓国語は翻訳が無く英語になる（§5.37） → **2026-10-01 判断：アプリ側の作業として、開発向けの作業表にまとめた**（§5.45） | App Store の言語の表記は同梱の翻訳から決まる（10言語）。サイトは「10言語に対応」（`/vs/email-me-app/`・`llms.txt` など）と App Store の表記どおりに書いている | ① アプリを直す（一覧に ru・zh-Hant を足し、it・ko を外すか翻訳を足す。サイトはそのまま）、② サイトを実際に合わせる（「10言語」を、アプリ内で選べる言語に言い換える）、③ 両方 |
| 52 | ~~**ページの題（title）に、条件なしの言い切りが残る**：`/hands-free/` の「ハンズフリー音声メモ — 移動中も開くだけで自動録音・圏外でも端末に残る」（og:title・twitter:title も同じ趣旨）、英語トップの「AI Auto-Tagging Notes to Email & Obsidian」。本文・説明文・構造化データは第49〜第53弾と #1748 で条件つきに直したが、題は変えていない（§5.38）~~ → **2026-10-01 判断（「あなたにおまかせ」）：① 題にも条件を入れる**（英語トップの題だけ ③）→ 第77弾 [#1823](https://github.com/simplememofast/simplememo/pull/1823)（10/1 11:21 マージ。§5.42） | 題は検索結果の見出しで、順位や実行中の実験の読み（`/` の title-2026-08-20-home-grammar。英語トップは対象外とされている）に響くので、変える前に判断を取る | ① 題にも条件を入れる（例：「設定すれば開くだけで自動録音」）、② 題は機能の名前の言い方に変える（例：「自動録音にも対応」）、③ このまま（本文と説明文で条件を示す） |
| 53 | ~~**Siri・AirPods の題とリンクの言い切り**：`/obsidian/airpods/` の題・見出し「AirPodsに話すだけでObsidianへ残す」、`/siri/` の題「スマホを触らずSiriでObsidianへ送る」、それを写したリンクの文言（トップ・`/hands-free/` の「AirPodsから、スマホを触らず送る」、`/apple-watch/`・`/autopilot/` の「AirPodsに話すだけでObsidianへ」）、トップの Siri のバナー画像（画像の中の文言と代替テキスト）。本文・説明文・構造化データは #1727 と第54〜第56弾で条件つきに直したが、題とリンクと画像は変えていない（§5.39）~~ → **2026-10-01 判断（「あなたにおまかせ」）：① 題にも条件を入れる** → 第77弾 [#1823](https://github.com/simplememofast/simplememo/pull/1823)（10/1 11:21 マージ。§5.42）。`/autopilot/` のプレスリリースの件名の表は変えていない（過去の件名の記録）。トップの Siri のバナー画像（画像の中の文言と代替テキスト）は、10/1 午後の判断で作り直した → 第84弾 [#1841](https://github.com/simplememofast/simplememo/pull/1841)（10/1 21:13 マージ。§5.45） | 題は検索結果の見出しで、順位と実行中の実験の読み（`/` の title-2026-08-20-home-grammar、`/siri/` を含む video-2026-08-11-five-clips）に響く。画像は作り直しが要る | ① 題にも条件を入れる（例：「AirPodsからSiriでObsidianへ送る」）、② 機能の名前の言い方に変える（例：「AirPodsとSiriで音声メモ」）、③ このまま（本文で条件を示す） |
| 54 | ~~**英語の社名の書き方がそろっていない**：英語ページのフッター（約210ページ。`data/site-constants.json` の `copyrightLineEn`）は「Yurika Inc.」、App Store の販売元（iTunes の `sellerName`）・`/en/about/` の本文・`/en/terms`・`/en/privacy`・`site-constants.json` の `publisher`・この台帳の会社欄は「YURIKA, K.K.」~~ → **2026-10-01 判断：① 「YURIKA, K.K.」にそろえる** → 第83弾 [#1839](https://github.com/simplememofast/simplememo/pull/1839)（10/1 18:48 マージ。英語の全209ページのフッター。§5.45） | 同じ会社が英語で2つの名前になっていて、AI の検索や読む人が同じ会社だと結び付けにくい（aio-2026-08-12-entity-attribution・brand-2026-08-11-entity-merge の読みにも響く）。英語の全ページのフッターが変わるので判断を取る | ① 「YURIKA, K.K.」にそろえる（App Store・規約と同じ）、② 「Yurika Inc.」のまま（英語の通称として台帳に書く）、③ フッターだけ併記 |
| 55 | ~~**題と CTA の見出しに残る誇張**：`/use-cases/ideas/` の題「アイデアメモアプリ — ひらめきを逃さない」と JSON-LD の headline、CTA の見出し・説明文の「GTDのキャプチャを完璧にする」（`/glossary/gtd/`・`/methods/gtd/`）「Inbox Zeroを実践する最高のキャプチャツール」「最適なメモキャプチャ」（`/glossary/inbox-zero/`）「究極のシンプルメモを体験」、英語の「Perfect Your GTD Capture」「The Perfect Capture Tool for Inbox Zero」「the ideal capture tool」「… at Lightning Speed」（`/en/glossary/markdown/`・`/en/glossary/spaced-repetition/`・`/en/use-cases/writers/`）「Experience ultimate simplicity」など約18か所（§5.40）~~ → **2026-10-01 判断（「あなたにおまかせ」）：① 条件のない言い切りをやめる** → 第76弾 [#1820](https://github.com/simplememofast/simplememo/pull/1820)（10/1 10:56 マージ。§5.42） | 計測や機能の誤りではないが、第34弾・第59弾で直した「逃さない」「すべてを」と同じ種類の言い切り。題は検索結果の見出しで、CTA の見出しは計測中の CTA の読みにも響くので、まとめて判断を取る | ① 条件のない言い切りをやめる（例：「GTDのキャプチャを手早く」「Capture Markdown Notes Quickly」）、② 題だけ残して CTA を直す、③ このまま |
| 56 | ~~**`/en/send-email-to-yourself` の2026年3月の計測に、1回ごとの記録が残っていない**：8アプリの起動・送信の秒数（シンプルメモは「起動1.0秒・送信1.0秒」、Pigeon「0.8秒」、Email Me「送信0.4秒」など）、「We installed and tested every major … app」、題の「5 Methods Tested」（§5.41）~~ → **2026-10-01 判断（「あなたにおまかせ」）：① 3月の数字を取り下げる** → 第78弾 [#1821](https://github.com/simplememofast/simplememo/pull/1821)（10/1 10:54 マージ。§5.42） | ほかのページ（`/blog/memo-app-speed-test-2026`・`/blog/iphone-memo-app-fast`・`/en/blog/fastest-note-app-iphone-2026`）は、同じく記録の無い3月の数字を取り下げ、8/11 の計測に置き換えた（`data/benchmark.json` の `otherPublishedRuns`）。このページは §5.35 で「方法がページに明記されている」として残したが、記録が無い点は同じ。シンプルメモの「起動1.0秒（コールド）」は、公開している 0.4 秒（ウォーム）と条件が違う | ① 3月の数字を取り下げ、8/11 に計測したアプリはその数字、計測していないアプリは「未計測」にする（題と導入も合わせる）、② 「2026年3月の、1回ごとの記録が残っていない計測」と明記して残す、③ このまま |
| 57 | **アプリ内の Siri ガイド（6画面）と説明動画の文言**：ガイド画面（実機）の「iPhoneはポケットのまま」「どのAirPodsでも同じです」「メールとObsidianに、同時に届く」「圏外でも消えない」（英語版 "Phone stays pocketed"・"Works the same on every AirPods"・"‘Hey Siri’ always works"・"It lands in email and Obsidian at once"・"Nothing is lost offline"）。サイトが作る説明動画（`scripts/build-videos.py`）の、Obsidian の「メールで自分に送ると…自動で追記されます」「メールで送信 → 追記」、AI タグの「自動で付けます」、Siri の字幕「同時に届く」と最後の「手を使わずに、残す。」（§5.45） → **2026-10-01 夜 判断：① 動画を作り直す（締めは「アプリを開かず、声で残す。」）** → 第87弾 [#1879](https://github.com/simplememofast/simplememo/pull/1879)（10/2 15:26。§5.46）。ガイド画面の文言はアプリ側の作業として残る | ガイド画面の文言はアプリの中にあり、サイトからは変えられない。メールと保管庫は別の経路で、ロック中は解除が要る場合がある（`/siri/`）。AI タグは Obsidian 連携と設定のオンが条件（既定はオフ）。動画を載せているページ（`/siri/`・`/obsidian/airpods/`・`/obsidian/`・`/ai-tags/`・紹介用資料）は、本文・説明で条件を書いてある（第86弾で紹介用資料も） | ガイド画面の文言は、アプリ側の作業として開発向けの作業表に入れる。動画は ① ページの説明に合わせて作り直す（同じ URL なので参照に `?v=`）② 注記のまま残す |
| 58 | ~~**本文に残る「逃さない」**：`/blog/ai-information-workflow`・`/blog/business-memo-apps-2026`・`/blog/captio-discontinued`・`/methods/`・`/use-cases/`・`/use-cases/job-hunting/`・`/use-cases/writers/`・`/vs/bear/`・`/vs/craft/`・`/vs/day-one/`・`/vs/heptabase/` の本文（例：「考えを逃さないためのツール」「その瞬間を逃さないためのツールとしてCaptioは最適でした」「考えを逃さないことだけに最適化されています」）~~ → **2026-10-02 判断：② 約束に読める所だけ直す** → 第91弾 [#1884](https://github.com/simplememofast/simplememo/pull/1884)（10/2 16:49。5か所。§5.46。`/blog/captio-discontinued` の「最適でした」は Captio の説明で、シンプルメモの約束ではないので残した） | 題・説明・OG 画像の「逃さない」は直してある（第34・59・76・85弾）。本文は目的を言う書き方が多く、保証の言い切りとまでは言えない所もあるので、どこまで直すかの判断が要る | ① 本文も「その場で書き留める」などに直す ② 保証に読める所（「最適化されています」「最適でした」と組み合わさった所）だけ直す ③ このまま |
| 59 | ~~**開発記事の「実機計測で 200〜300ms」**：`/devlog/uikit-vs-swiftui`（日英）の「Time-to-Text 500ms以下という非機能要件…実機計測で 200〜300ms を安定して達成」とよくある質問の「実機で200〜300ms台で安定」~~ → **2026-10-02 判断：② 数字を外して目標だけにする** → 第91弾 [#1884](https://github.com/simplememofast/simplememo/pull/1884)（10/2 16:49。`/devlog/day1` も。§5.46） | 台帳に計測の記録（日時・端末・回数・測った区間）の場所が無い。サイトの起動時間は、記録のある「0.4秒（ウォーム起動の実測）」にそろえてきた | ① 記録があれば、条件（端末・区間・回数）と一緒に残す ② 記録が無ければ数字を外し、目標（500ms以下）だけにする ③ このまま |
| 60 | ~~**シンプルメモについての「摩擦ゼロ」「ゼロフリクション」「frictionless」**：`/use-cases/reading-notes/`「強みは『ゼロフリクションのキャプチャ』」、`/blog/memo-habit` の CTA「摩擦ゼロのメモ体験」、`/vs/evernote/`「キャプチャだけに特化することで摩擦をゼロにしています」、`/glossary/inbox-zero/`・`/glossary/kanban/`・`/glossary/gtd/`、`/methods/`・`/methods/gtd/` の見出し「ゼロフリクション・キャプチャ」、英語の同じページと `/en/methods/` の説明「Simple Memo strengthens your productivity system with frictionless capture」、`/en/vs/` のカード「zero-friction Simple Memo」など。`/guides/gmail-star-todo/` の「メモを、二度と埋もれさせない」も同じ種類~~ → **2026-10-03 判断：① 約束に読める所だけ直す** → 第97弾 [#1911](https://github.com/simplememofast/simplememo/pull/1911)（10/3 13:31。日本語11ページ・英語13ページ。§5.48）。方法の説明と、Captio を使っていたころの話は残した | 「逃さない」（#58）と同じく、計測や確認ができない言い切り。方法の説明（Zettelkasten の一時メモの原則「摩擦ゼロで書き留める」など）と、Captio を使っていたころの話は対象外 | ① 約束に読める所だけ「摩擦の少ない」などに直す ② 全部直す ③ このまま |
| 61 | ~~**条件なしの「0.4秒起動」「0.4s launch」「Launches in 0.4 seconds」**：ブログ・活用事例・比較ページ・CTA などに約140ページ・約240か所（2026-10-03 の数え）。計測（iPhone 16e・ウォーム起動・アイコンのタップから入力できるまでの中央値）は記録があるが、条件を書かずに「0.4秒で起動」と言うと、どの端末・冷えた状態からの起動でも0.4秒に読める（§5.49）~~ → **2026-10-03 判断：① 条件を添える** → 第114〜118弾 [#1934](https://github.com/simplememofast/simplememo/pull/1934)（ブログ）・[#1935](https://github.com/simplememofast/simplememo/pull/1935)（比較）・[#1936](https://github.com/simplememofast/simplememo/pull/1936)（活用事例）・[#1937](https://github.com/simplememofast/simplememo/pull/1937)（用語集・メソッドほか）・[#1938](https://github.com/simplememofast/simplememo/pull/1938)（よくある質問・`llms.txt`）（10/3 22:28〜23:44。§5.51）。計測の記事の本文などは理由を書いて残した。実験の対象の5ページは評価日のあと（11/12・11/13 以降） | §7 #31 は「主要ページに条件を添える」で、残りは範囲の外として残してきた。数が多く、題・CTA にも入っているので判断が要る | ① 条件を添える（「タップから0.4秒で書き始められる（ウォーム起動の実測）」など） ② 数字を外して「すぐ書き始められる」などにする ③ このまま（主要ページだけ条件つき） |
| 62 | ~~**Apple Watch に対応した版**：`/` と `/en/` は「2026年7月のv3.9で Apple Watchに対応」、`/` のレビュー紹介は「この声を受けて（6月のレビュー）、v3.9でApple Watchに対応しました」。App Store Connect の配信の履歴では 3.4 が 6/10、3.9 が 7/4（§5.49）~~ → **2026-10-03 判断：③ 版と月を書かない** → 第113弾 [#1933](https://github.com/simplememofast/simplememo/pull/1933)（10/3 22:08。日本語3ページ・英語2ページ＋`llms.txt`。§5.51） | どの版で Watch のアプリを公開し、どの版で Watch から送ったメモが Obsidian にも入るようになったかは、こちらでは公開の記録から確かめきれない | ① Watch の対応は 3.4（6月）、Obsidian への追記は 3.9（7月）と書き分ける ② いまの書き方のまま（3.9 で対応） ③ 版と月を書かない |
| 63 | **下書きのまま公開されている `/en/blog/revenue-report-2025`**：数字が「[X,XXX]」「[XX%]」のままで、ページの上に「DRAFT: This article contains placeholder data」と出る。noindex・nofollow で、サイトマップにもサイト内のリンクにも無いが、URL を知っていれば開ける。「I'll update this table monthly」という約束もある（§5.51） | 売上・利用者数などの数字はオーナーしか持っていないので、仕上げるか、公開をやめるかはこちらでは決められない | ① このまま（下書きの表示・noindex のまま） ② 公開をやめる（ページを消して `/en/blog/` へ転送） ③ 実際の数字で仕上げる（数字はオーナーから） |
| 64 | **サイトの Google アナリティクスがプライバシーポリシーに書かれていない**：本番の443ページで Google アナリティクス 4 を読み込んでいるが、プライバシーポリシー（日英）はアプリの説明で、サイトのアクセス解析・Cookie に触れていない（§5.52） | Google アナリティクスの利用規約は、使っていることと収集・処理の仕組みの開示、Cookie などの使用のプライバシーポリシーでの通知を求めている。ポリシーの文言を変えるので、P-10 と同じくオーナーの判断 | ① ポリシーに書き足す（サイトで Google アナリティクスを使っていること、Cookie で集める情報の種類、Google の説明ページへのリンク、オプトアウトの方法） ② このまま ③ サイトの Google アナリティクスをやめる |
