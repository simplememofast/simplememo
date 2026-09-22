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

## 1. 登録・申請台帳

| Priority | Service | Type | Status | Submitted | Published | Website backlink | Public URL | Blocker | Next action |
| -------- | ------- | ---- | ------ | --------- | --------- | ---------------- | ---------- | ------- | ----------- |
| P0-1 | NoteApps.info | SUBMISSION | SUBMITTED | 2026-09-19 | no | pending | https://nextnoteapps.featureupvote.com/suggestions/702301/simple-memo-captiostyle | モデレーター承認待ち | 承認後に本体40アプリ索引への採否を待つ。必要なら corrections@noteapps.info へ訂正連絡 |
| P0-2 | SaaSHub（Simple Memo） | SELF_REGISTER | ALREADY_EXISTS ＋ 改善 SUBMITTED | 2026-09-19 | yes | **dofollow**（一覧ページ） | https://www.saashub.com/simplememo-fast-alternatives | 変更は承認制 | ドメイン付きメール（support@simplememofast.com）で Verify すると承認待ちなしで編集可 |
| P0-3 | Tool Finder（toolfinder.com） | SELF_REGISTER | BLOCKED | — | — | — | https://toolfinder.com/submit | **有料のみ**（$29 一回 / $79 年） | 今回は購入しない。無料枠が復活しないか四半期ごとに再確認 |
| P0-4 | G2 | SELF_REGISTER | BLOCKED | — | — | — | https://sell.g2.com/create-a-profile | セラー登録に **LinkedIn またはビジネスメール認証**が必須。当セッションはアカウントを作成しない | 人が myG2 にビジネスメールで登録 → `/products/new` から無料プロフィール申請（審査3〜5営業日） |
| P0-5 | Capterra | — | NOT_ELIGIBLE | — | — | — | https://www.capterra.com/legal/listing-guidelines/ | 掲載基準が「personal productivity solutions, product clones and/or personal apps」を除外 | 対象外。GetApp / Software Advice も同系列のため同じ基準とみなす |
| P0-6 | フリーソフト100（JA-091） | SUBMISSION | SUBMITTED | 2026-09-19 | no | pending | https://freesoft-100.com/about/form_software.html | 掲載まで1〜2か月・不採用時は連絡なし | 11月頃に `freesoft-100.com` 内検索で掲載有無を確認 |
| 既存 | AlternativeTo | — | ALREADY_EXISTS | — | yes | **nofollow**（`rel="nofollow noopener"`） | https://alternativeto.net/software/simple-memo--captio-style/about/ | 編集にはアカウント必要 | 情報は最新（2026-09-06更新）。App Store リンクの旧スラッグのみ将来更新 |
| 既存 | Product Hunt | — | ALREADY_EXISTS | — | yes | **ugc**（`rel="noreferrer noopener ugc"`）・当該ページは `noindex, nofollow` | https://www.producthunt.com/products/simple-memo-captio-style | — | 重複ローンチを作らない。下書き1件は未投稿のまま |
| 発見 | awesome-obsidian（GitHub） | SUBMISSION | **PUBLISHED** | 2026-09-06 | **2026-09-08 マージ済** | あり（**nofollow**）→ `https://simplememofast.com/en/obsidian/` | https://github.com/awesome-obsidian/awesome-obsidian | — | 既に公開済。GitHub の README リンクは常に nofollow なので、価値は awesome 系ミラー（awesome.ecosyste.ms 等）への波及側にある。後日確認 |
| 追加 | SaaSHub（Memo Inbox） | SELF_REGISTER | SUBMITTED | 2026-09-19 | no | pending | https://www.saashub.com/memo-inbox （承認後） | 無料枠のため最大32日待ち | 承認後にロゴ・価格・詳細説明を追記 |
| 追加 | Indie Hackers Products DB | SELF_REGISTER | BLOCKED | — | — | — | https://www.indiehackers.com/products/new | アカウント `memolife23` が **"Your account cannot create or edit products"** | IH サポートに制限解除を問い合わせる（人の操作1回） |
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

**現時点で dofollow が確認できているのは SaaSHub の一覧ページ1本だけ。**
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
| Captio との関係 | 2024年10月に App Store から消えた Captio の**独立した代替実装**。公式後継でも承認済みでもない | `/about/`, `/en/` |

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

### 今回見つかった良い窓口（メールのみ・未送信）

| ID | 媒体 | 窓口 | なぜ良いか |
| --- | --- | --- | --- |
| JA-050 | さくらのナレッジ | [著者募集](https://knowledge.sakura.ad.jp/call-for-authors/) | **著者募集が公開されている。** テーマは事前相談、2000〜6000字。セミナー・企業情報の告知に「ご利用いただくこともOKです」と明記され、**自社への言及が許容されている数少ない窓口**。資産は `ASSET_READY`（`/devlog/relay-api-design`・`/memo-inbox/`）で、新規制作なしで企画を出せる |
| JA-004 | CoRRiENTE | `https://corriente.jp/contact/` | 受付内容に「製品のレビュー依頼（メーカー様・代理店様）」「プレスリリースのご送付」を明示 |

両方ともフォームが無くメールのみで、**メール送信はこのセッションの権限外**のため送っていない。
本文は `docs/seo/media-pitch-drafts-2026-09-22.md` に用意した。

### 送れなかった2件（BLOCKED）

- **Mac Fan（JA-005）** — [プレスリリース受付フォーム](https://book.mynavi.jp/quest/id=732)は正規の窓口で、
  「Mac、iPhone、iPadなど、Apple製品関連のサービス情報およびリリースを募集しています」と明記。
  ログインもCAPTCHAも無い。**しかし電話番号が必須**で、株式会社ユリカは特定商取引法表記で
  「原則メール」としており公開電話番号が無い。**番号を創作して埋めることはしない**ので送信できない。
  同ページに `mnp-macfan-release@mynavi.jp` も併記されており、**メールなら電話番号は不要**。
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
| Indie Hackers | 到達不能 | `/settings` が Not found、`/<user>` はリダイレクトループ。products 作成不可と同じ制限と見られる |

GitHub の表示名修正は副次的だが効く —— **本日出した awesome系6件のPRすべてに、
この名前が投稿者名として並ぶ。**誤字のまま6リストのメンテナに見せずに済んだ。

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

- **`simplememofast-ops` を読めていない。** 過去ドラフトに今回と矛盾する記述や、
  既に送信済みの窓口が書かれている可能性がある。次回はこのリポジトリを
  セッションのソースに含めてから実行すること。
- **Product Hunt の未投稿ローンチ下書きが1件残っている。** 投稿するか消すかは人の判断。
- **NoteApps.info の提案は2026-03に立てられたまま "Under consideration"。** 今回の訂正コメントが
  承認されても索引入りは別判断。
- **窓口を確認済みの5媒体への送信が保留中。** applech2 / Macお宝鑑定団 /
  気になる、記になる… / ガジェットショット / 技術評論社。
  **本文は媒体ごとに個別に書いて `docs/seo/media-pitch-drafts-2026-09-19.md` に置いてある**
  （5本とも別文面・未送信）。送信の可否は人の承認が要る。
- **すまほん!! は reCAPTCHA v3 で自動送信できない。** 本文は
  `docs/seo/media-pitch-drafts-2026-09-19.md` にあるので、人が手で送れば通る可能性が高い。
- **CodeZine（403）と Publickey（404）は窓口の所在が未確認。** 別経路を探す必要がある。
- **`ASSET_MISSING` 29件は制作判断が必要。** ユーザーテスト・小規模調査・サンプルコード・
  動画など、いずれも相応の工数がかかる。費用対効果を見てから着手すること。
- ~~**`data/site-constants.json` がストアとずれている。**~~ **2026-09-20 に解消済み。**
  2026-09-19 時点では version 5.8.9 / 評価 4.2・25件で実態（5.8.66 / 4.12・26件）とずれていたが、
  2026-09-22 に再確認したところ `appVersion` 5.8.66・`ratingValue` 4.1・`ratingCount` 26 に
  同期されており、ストアの値と一致している。
- **代わりに `llms.txt` の「Current facts (as of …)」が期限切れになった（2026-09-22 から）。**
  `scripts/seo-check.js` が警告を出す（errors 0 / warnings 1）。
  **CI は落ちない**（`.github/workflows/seo-check.yml` は「Exit code 1 = warnings only (acceptable)」
  として exit 1 を許容し、2以上だけで落とす）ので、PRのマージは止まらない。
  原因は価格で、`stampDate()` が `appVersionNote` / `ratingNote` / `priceNote` の
  **最も古い検証日**を採るため、`priceNote` の 2026-08-22 が全体を引っ張っている。
  バージョンと評価は 2026-09-20 に機械検証済みだが、**アプリ内課金の価格は iTunes Lookup では
  取得できず、所有者が確認するしかない**。日付だけ進めるのは検証の捏造になるのでやらない。
  → **人が ¥500 / ¥5,000 が現行であることを確認し、`priceNote` の日付を更新してから
  `node scripts/sync_constants.js --write` を実行する**、が正しい直し方。
- **Mac Fan に送るなら電話番号を公開するか決める必要がある。** フォームは電話番号が必須。
  公開したくなければ `mnp-macfan-release@mynavi.jp` 宛のメールで送る（電話番号不要）。
- **さくらのナレッジの著者募集が最有力。** 自社への言及が許容されていて、資産も揃っている。
  応募はメールのみなので人が送る必要がある。本文は `docs/seo/media-pitch-drafts-2026-09-22.md`。
- **`WINDOW_UNVERIFIED` 16件は窓口の所在が分からないまま。** 403 / 404 / TLSエラーが理由で、
  窓口が無いとは限らない。必要なら人が手で開いて確認する。
- **先行して送った4件に開発者個人の実名が入っている（identity policy 違反）。**
  5件目（Macお宝鑑定団）は修正後なので問題ない。 訂正連絡を出すかどうかの判断が要る。
  下書き側は修正済みで、以後の送信では `SimpleMemo Developer` / `AI ATAKA` のみを使う。
- **気になる、記になる… の窓口は公開コメント欄だった。** 公開投稿になるので送っていない。
  送るかどうかは人の判断。
- **週次の掲載確認タスクは動いている。** 2026-09-21 の定期実行は4秒で FAILED だったが、
  2026-09-22 10:29 の手動発火は `SUCCEEDED`（10:44 終了・約15分）。一過性だった。
- **`data/routine-runs.json` の整合は Codex へ回した**（`docs/codex-request-routine-runs-2026-09-22.md`）。
  `include_completed=true` は単純な解決にならないことまで実測で確認済み
  （open_findings の単発予約は戻るが、ページングがあり全件同期すると台帳が膨れる）。
  判断が要るのは実質2件に絞れている。
