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
| awesome-obsidian（GitHub） | リポジトリのREADME | `nofollow`（GitHubの仕様） | — |

**現時点で dofollow が確認できているのは SaaSHub の一覧ページ1本だけ。**
ただし AlternativeTo と Product Hunt は実ユーザーのいる媒体なので、nofollow でも掲載価値は残す。

### 集計

- 新規公開：**0 件**（今回の送信分から公開確認できたものはまだ無い）
- 既に公開されていた新規参照ドメインの発見：**1 件**（github.com / awesome-obsidian、2026-09-08 マージ）
- 申請完了：**10 件**（フリーソフト100 / SaaSHub「Memo Inbox」新規 / NoteApps.info 情報更新 / Launching Next / awesome系6リストへのPR）
- 既存掲載の改善申請：**1 件**（SaaSHub「Simple Memo」の全項目訂正）
- 既存掲載の点検のみ：**2 件**（AlternativeTo / Product Hunt）
- BLOCKED：**6 件**
- 対象外：**3 件**

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

| 区分 | 件数 | 内訳 |
| --- | ---: | --- |
| `SELF_REGISTER` | **0** | この100件に自己登録型ディレクトリは1件も含まれていない |
| `SUBMISSION` | **2** | JA-012（すまほん!! のレビュー依頼フォーム・実在確認済）／JA-091（フリーソフト100・**本日送信済**） |
| `EDITORIAL_OUTREACH` | 13 | 資料制作を伴わず、編集部への打診だけで成立しうるもの |
| `ASSET_REQUIRED` | 85 | 実機検証パッケージ・実例集・無料Webツール・技術資料などの制作が前提のもの |

**この100件は「登録施策のリスト」ではなく「編集リンク獲得のリスト」である。**
今回の最優先方針（登録 ＞ 申請 ＞ 編集部 ＞ 個別アウトリーチ）に照らすと、
消化できるのは実質2件しかなく、残り98件は依頼者が言う後段（第3・第4優先）に属する。
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

## 7. 未解決の課題

- **`simplememofast-ops` を読めていない。** 過去ドラフトに今回と矛盾する記述や、
  既に送信済みの窓口が書かれている可能性がある。次回はこのリポジトリを
  セッションのソースに含めてから実行すること。
- **Product Hunt の未投稿ローンチ下書きが1件残っている。** 投稿するか消すかは人の判断。
- **NoteApps.info の提案は2026-03に立てられたまま "Under consideration"。** 今回の訂正コメントが
  承認されても索引入りは別判断。
