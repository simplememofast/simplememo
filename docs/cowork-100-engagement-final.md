# CoWork依頼: Captio言及 100コンテキストの個別エンゲージメント・ドラフト生成

**作成日**: 2026-05-05
**目的**: Captio (Tupil B.V.製、2024-10-01 終了の iOS ノートアプリ) を明示的に言及している 100 のオンライン・コンテキスト（Reddit / HackerNews / 英語ブログ / 日本語ブログ / フォーラム / Product Hunt / その他）に対し、**人間が個別レビューしてから手動投稿するための返信/メール下書き**を生成する。
**目標**: 100 コンテキスト × 各 1〜3 バージョンのドラフト = **約 200 個のドラフト**
**自動投稿は厳禁**。cowork はドラフトを Markdown で納品するのみ。

---

## 0. 厳守事項

### 自動投稿は禁止

- Reddit ToS違反 + アカウント永久 ban + ブランド毀損リスクのため、自動投稿コードや bot は作成しない
- ドラフトを Markdown で納品し、人間（AI Ataka）が**1 件ずつ手動レビュー → 手動投稿**

### 開発者開示必須

すべてのコメント・メール末尾に以下のいずれかを必ず含める：

**英語**:
> *Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts). Built it after using Captio for 10 years myself.*

**日本語**:
> *本サービスはCaptio（Tupil B.V.製）およびBen Lenarts氏と一切の提携関係はありません。「Captio式」は操作思想を継承する表現です。*

### 商標・なりすまし厳禁

- 「公式後継」「Captioの正規後継」「Tupil承認」など、事実と異なる主張は絶対NG
- 「Captio」「Tupil」は各社の商標。各権利者に帰属

### UTM必須

すべての simplememofast.com リンクに以下を付与：

```
?utm_source=<platform>&utm_medium=<comment|email|forum|dm>&utm_campaign=captio-engagement&utm_content=<context-id>
```

`<context-id>` は表中の `ID` 列（`P0-01`, `P1-05` 等）。

### NG 表現リスト

| 英語 | 日本語 |
|---|---|
| "the best app" | 「最高のアプリ」 |
| "perfect" | 「完璧」 |
| "the only" | 「唯一」 |
| "amazing" | 「素晴らしい」 |
| "official successor" | 「公式後継」 |
| "Tupil-approved" | 「Tupil承認」 |
| "you should use" | 「使ってください」 |
| "click here" | 「ぜひこちらから」 |

### やってはいけない3つのこと

1. **競合アプリ（Drafts/Pigeon/Apple Notes）の否定** — Reddit民は対立軸を嫌う
2. **同じ文を複数コンテキストで使い回し** — bot 検知 + 信頼喪失
3. **OP/著者の名前を呼びかける親密装い** — 不自然、逆効果

---

## 1. 背景（SimpleMemo / 株式会社ユリカ）

- **SimpleMemo**（Captio式シンプルメモ）: 2024年10月にApp Storeから削除された Captio (Tupil B.V.製、開発者 Ben Lenarts) の **後継アプリ**。2026年に株式会社ユリカ（YURIKA, K.K.）がリリース。
- **計測実績** (iPhone 15 / iOS 17, 20回平均): 起動 0.3 秒 / 送信 150ms / ブレインインボックス 2 秒未満
- AES-GCM 端末内暗号化 / オフライン Outbox / Gmail API 非依存（Cloudflare Workers + Resend API 独自基盤）
- 料金: 無料 1日3通 + Premium 月額500円 / 年額5,000円（$2.99/mo or $29.99/yr）、7日間無料トライアル
- 開発者: AI Ataka（Captio利用歴10年: 2014-2024）
- 公式LP（紹介用、UTM 付き）:
  - JA: `https://simplememofast.com/captio-alternative/?utm_source=...&utm_content=<context-id>`
  - EN: `https://simplememofast.com/en/captio-alternative/?utm_source=...&utm_content=<context-id>`
  - Captio終了経緯: `https://simplememofast.com/blog/captio-discontinued`

---

## 2. 戦略インサイト（Reddit実音声から抽出済み）

### 2-1. LP コピー（Reddit 実音声を使え）

- ❌ "Best Captio Alternative in 2026" (マーケ臭)
- ✅ "Send your thoughts straight to your inbox — the Captio replacement Reddit users have been asking for" (r/productivity 実音声 verbatim)

### 2-2. Captio の価値ワード（強調すべき）

- "fast" / "instant" / "lightning fast" / "opens in an instant" / "one button" / "0.3 second"

### 2-3. 競合との共起順位（co-mention frequency）

| Rank | App | 出現回数 |
|---|---|---|
| 1 | Things | 4 |
| 2 | Drafts | 2 |
| 3 | Apple Notes | 2 |
| 4 | IFTTT | 2 |
| 5 | Todoist | 2 |
| - | Notion / Obsidian | **0** |

→ Captio は GTD-tools クラスタ（Things, Drafts, OmniFocus, IFTTT）にいる。Notion / Obsidian クラスタには入らない。**ターゲットは r/gtd / r/productivity であり、r/Notion / r/ObsidianMD ではない**。

### 2-4. Reddit民が話題にしないもの

- **価格・サブスクの不満** （0/15記録で言及なし）
- **プライバシーの懸念** （0/15で言及なし）
- → LPで強調しすぎている可能性

### 2-5. 検証された仮説

| 仮説 | 検証 |
|---|---|
| Captio = "inbox capture", not "note management" | ✅ 確証 |
| Captio は Things/Drafts/IFTTT クラスタで比較される | ✅ 確証 |
| Captio shutdown discussion は Reddit 少 / note.com 多 | ✅ 確証 |
| Reddit Captio 言及は少数だが用途解像度高い | ✅ 確証（15記録、7 actionable） |

---

## 3. 各ドラフトに必ず含めるべき要素（チェックリスト）

各ドラフトには以下8要素を**すべて**含める：

- [ ] **冒頭1〜2文で OP/コメント主の発言に共感** （"Same here" / "I felt the same" / "記事拝見しました" 等）
- [ ] **Captio使用歴を1文で**（「I used Captio daily from 2014 to 2024」/ 「Captio利用歴10年」）
- [ ] **Captio shutdown の事実**（既知でも、新規読者向けに1文で。「2024年10月終了、Tupil 公式声明なし」）
- [ ] **SimpleMemo の存在を1文で**（売り込みではなく事実陳述として）
- [ ] **代替候補を最低1つは併記**（Drafts / Pigeon / EmailMe など、SimpleMemo一択にしない）
- [ ] **SimpleMemoの弱点を最低1つ正直に**（iOS-only / subscription / 著者バイアス）
- [ ] **開発者開示**（§0 の formula）
- [ ] **リンクは1本以下**（UTM 付与済み）

---

## 4. 100コンテキスト一覧

### P0 - 24-48h以内に対応すべき最優先 (5件)

| ID | URL | コンテキスト | 言語 | 方法 | バージョン要求 |
|---|---|---|---|---|---|
| P0-01 | https://www.reddit.com/r/productivity/comments/8pab1f/any_lightning_fast_ios_note_taking_apps_like/lueg2h2/ | "Captio... it recently stopped working. Came here looking for an alternative." (2018年だがGoogle検索流入継続) | EN | comment | 3版 (v1: 直接的、v2: リンクなし、v3: ストーリー) |
| P0-02 | https://www.reddit.com/r/apple/comments/72bs35/iftttcaptio_or_similar/ | "Wondering if anyone knows a way to connect IFTTT with Captio" (2017年) | EN | comment | 3版 |
| P0-03 | https://note.com/masatakashida/n/nd2f42fb27bed | 著者が自作Captio後継アプリを開発中（DJ MASA a.k.a. Snufkin） | JA | comment_or_email | 3版 (note.comコメント、X DM、メール) |
| P0-04 | https://note.com/39thankyou/n/n974af6dff6ad | 「さっとメモしてメールできるアプリ NOTE TO EMAIL」 — Captio代替紹介 | JA | comment | 3版 |
| P0-05 | https://www.attnoel.co.jp/blog/from-captio-to-note-to-email/ | 「Captioの代替アプリ オススメ2選+α」— SimpleMemo 未掲載。最も確度の高い掲載追加候補 | JA | お問い合わせフォーム | 3版 (詳細版、短縮版、broken-link通知のみ) |

### P1 - 1-2週で対応 (15件)

| ID | URL | コンテキスト | 言語 | 方法 |
|---|---|---|---|---|
| P1-01 | https://www.reddit.com/r/productivity/comments/l5k2xk/my_strategy_to_combat_scatter_brain/ | "Captio... sends thoughts straight to inbox. Mind. Blown." | EN | comment |
| P1-02 | https://www.reddit.com/r/productivity/comments/acsznt/a_spreadsheet_as_a_to_do_app_share_your_setup/ | Captio + IFTTT + Gmail ワークフロー実例 | EN | comment |
| P1-03 | https://www.reddit.com/r/shortcuts/comments/9zr0vs/all_actions_in_the_shortcuts_app_redditors_use/ | iOS Shortcuts のアクション一覧に Captio | EN | comment |
| P1-04 | https://www.reddit.com/r/ADHD_Programmers/comments/spshw0/i_made_a_program_in_python_that_helps_me_save_my/hwhqujd/ | "I use Captio for something sorta similar on iOS" (ADHDフレンドリー) | EN | comment |
| P1-05 | https://www.reddit.com/r/gtd/comments/jrorg2/looking_for_a_gtd_app_recommendation/gbxsqkb/ | GTD推薦スレで「Captioを使っている」 | EN | comment |
| P1-06 | （HackerNews 検索: "Captio" iOS 関連 thread #1） | HN comment | EN | comment |
| P1-07 | （HN thread #2） | HN comment | EN | comment |
| P1-08 | （HN thread #3） | HN comment | EN | comment |
| P1-09 | https://www.macstories.net/iphone/captio-lets-you-email-tasks-to-yourself-with-1-tap/ | MacStories 2010年Captio 1-tapレビュー | EN | email tips@macstories.net |
| P1-10 | https://www.macstories.net/reviews/captio-2-0-released-adds-ipad-version/ | MacStories 2012年Captio 2.0レビュー | EN | email (P1-09と統合可) |
| P1-11 | https://www.engadget.com/2010-09-30-captio-the-simple-app-that-just-might-change-your-life.html | Engadget 2010年Captio絶賛記事 | EN | email tips@engadget.com |
| P1-12 | https://www.makeuseof.com/tag/open-write-and-send-5-alternative-note-apps-for-ios-devices/ | MakeUseOf "5 Alternative Note Apps for iOS" | EN | email editors@makeuseof.com |
| P1-13 | https://teineini.net/20190312-captio/ | いつもていねいに「captioは職場の自分への備忘連絡に最適」 | JA | お問い合わせフォーム |
| P1-14 | https://webcli.jp/topics/captio/ | WebCli「ワンタッチですぐにメール送信ができる｢Captio｣」 | JA | お問い合わせフォーム |
| P1-15 | https://www.danshihack.com/2015/07/15/junp/iphoneapp-captio.html | 男子ハック「シンプルゆえに神アプリ「Captio」」 | JA | お問い合わせ or X DM @JUNP_N |

### P2 - 1ヶ月で対応 (30件)

#### 英語ブログ

| ID | URL | 言語 | 方法 |
|---|---|---|---|
| P2-01 | https://feld.com/archives/2012/04/captio-iphone-app-of-the-day/ | EN | blog comment + Twitter @bfeld |
| P2-02 | https://medium.com/@bfeld/the-superhuman-change-to-my-current-email-tools-190ad93a19c7 | EN | DM Brad Feld (P2-01と統合可) |
| P2-03 | https://jasonhorsley.medium.com/captio-will-10x-your-productivity-416db1723a79 | EN | Medium response |
| P2-04 | https://rickpastoor.com/2015/01/09/quick-productivity-tip-captio-for-iphone.html | EN | email or Twitter @rickpastoor |
| P2-05 | https://owocki.com/captio-for-iphone/ | EN | Twitter DM @owocki |
| P2-06 | https://laughingsquid.com/captio-a-quick-and-easy-way-to-send-yourself-notes/ | EN | email tips@laughingsquid.com |
| P2-07 | https://www.appenmedia.com/opinion/columnists/captio-app-makes-emailing-yourself-easy/article_de4ca7ea-dbc1-5e01-81f0-dc06bd5db777.html | EN | site contact form |
| P2-08 | https://www.applevis.com/apps/ios/productivity/captio | EN | AppleVis comment |
| P2-09 | https://www.applevis.com/apps/ios/productivity/captio-email-yourself-1-tap | EN | AppleVis comment |
| P2-10 | https://thesweetsetup.com/what-we-published-and-links-of-note-27/ | EN | contact form (Captio mention要確認) |
| P2-11 | https://note2selfmail.app/replacement-for-captio-app/ | EN | **monitor only** (直接競合) |
| P2-12 | https://www.podfeet.com/blog/2014/05/my-top-5-favorite-ipad-apps/ | EN | comment or contact form |
| P2-13 | https://apptopia.com/ios/app/370899391/about | EN | **monitor only** (data aggregator) |

#### 日本語ブログ

| ID | URL | 言語 | 方法 |
|---|---|---|---|
| P2-14 | https://note.com/chronos0909/n/n4da8c83eafae | JA | note.com comment |
| P2-15 | https://www.ryoushuukan.com/captio-app/ | JA | ブログお問い合わせ |
| P2-16 | https://kigyouhoumu.hatenadiary.com/entry/458384627.html | JA | hatena コメント |
| P2-17 | https://applion.jp/iphone/app/370899391/ | JA | applion お問い合わせ |
| P2-18 | https://app-liv.jp/168048/ | JA | app-liv お問い合わせ |
| P2-19 | https://app-liv.jp/370899391/ | JA | app-liv お問い合わせ (P2-18と統合) |
| P2-20 | https://www.app-ranking.net/id/370899391 | JA | **monitor only** |
| P2-21 | http://iphonestage.net/app/370899391/Captioワンタッチで自分にお知らせメールを送ろう | JA | **monitor only** |
| P2-22 | https://www.sungrove.co.jp/linekeep-serviceend/ | JA | お問い合わせ (LINE Keep angle) |
| P2-23 | https://www.appllio.com/line-keep-shutdown-alternation | JA | 編集部メール (LINE Keep angle) |
| P2-24 | https://roboin.io/article/2024/05/09/line-keep-alternative-apps/ | JA | お問い合わせ (LINE Keep angle) |

#### フォーラム

| ID | URL | 言語 | 方法 |
|---|---|---|---|
| P2-25 | https://www.rememberthemilk.com/forums/tips/11814/ | EN | forum reply |
| P2-26 | https://discourse.omnigroup.com/t/best-digital-capture-tool-to-use-with-ominfocus-that-ive-found/21567 | EN | forum reply |
| P2-27 | http://forums.omnigroup.com/showthread.php?t=23210 | EN | likely closed → monitor |
| P2-28 | https://forum.gettingthingsdone.com/threads/best-digital-capture-tool-ive-found.12621/ | EN | forum reply |
| P2-29 | https://forums.getdrafts.com/t/quick-capture-workflows/15368 | EN | forum reply (Captio mention要確認) |
| P2-30 | https://talk.macpowerusers.com/t/replacing-drafts/37524 | EN | forum reply (要確認) |

### P3 - monitor or batch (50件)

#### Product Hunt

| ID | URL | 方法 |
|---|---|---|
| P3-01 | https://www.producthunt.com/products/captio | comment |
| P3-02 | https://www.producthunt.com/products/captio/reviews | comment |
| P3-03 | https://sharemeow.producthunt.com/products/captio/launches | monitor |
| P3-04 | https://www.producthunt.com/products/fwrdto-me/alternatives | comment |
| P3-05 | https://www.producthunt.com/products/nano-notes-pro/alternatives | comment |
| P3-06 | https://www.producthunt.com/products/jotbox/alternatives | comment (要確認) |
| P3-07 | https://www.producthunt.com/products/fwrdto-me | monitor |
| P3-08 | https://www.producthunt.com/@benlenarts | **DO NOT CONTACT** |

#### Captio aggregator / mirror sites

| ID | URL | 方法 |
|---|---|---|
| P3-09 | https://worldsapps.com/download-captio | email correction request |
| P3-10 | https://captio-email-yourself-1-tap.appstor.io/ | email correction |
| P3-11 | https://captio-email-yourself-with-1-tap.en.softonic.com/iphone | email correction |
| P3-12 | https://itunes.apple.com/gb/app/captio-email-yourself-1-tap/id370899391?mt=8 | monitor |
| P3-13 | https://tupil.com/ | **DO NOT CONTACT** |
| P3-14 | https://captio.co/ | monitor |

#### Reddit (additional, low priority)

| ID | URL | 方法 |
|---|---|---|
| P3-15 | r/RASPBERRY_PI_PROJECTS (false positive: caption) | **skip** |
| P3-16 | r/iosapps own SimpleMemo promo | **skip** (own) |
| P3-17 | r/PrivacyGuides Captio mention | comment (要確認) |
| P3-18 | r/languagelearning | **skip** (likely Latin) |
| P3-19 | r/minimalism | **skip** (uncertain) |
| P3-20 | https://forums.macrumors.com/threads/captio.1050629/ | forum reply |

#### Indie Hackers

| ID | URL | 方法 |
|---|---|---|
| P3-21 | https://www.indiehackers.com/post/i-built-simplememofast-... | **skip** (own) |
| P3-22 | https://www.indiehackers.com/post/ive-been-reading-50-... | comment (要確認) |
| P3-23 | https://www.indiehackers.com/post/i-lost-11-users-in-30-days-... | monitor |

#### 自社プレスリリース系（all skip）

| ID | URL | 方法 |
|---|---|---|
| P3-24-28 | PR TIMES / ITmedia / 時事 / Infoseek / RBB Today | **own** |

#### Note.com 追加

| ID | URL | 方法 |
|---|---|---|
| P3-29 | https://note.com/simplememo/n/n5d8397a2663c | **own** |
| P3-30 | https://note.com/unsubscriber/n/ncac97383ddbf | comment (要確認) |

#### MacStories adjacent

| ID | URL | 方法 |
|---|---|---|
| P3-31 | https://www.macstories.net/news/affix-lets-you-email-notes-to-yourself-with-prefixes-gmail-filters-approve/ | email (P1-09と統合) |
| P3-32 | https://www.macstories.net/?s=Drafts&paged=6 | search-then-engage |

#### その他

| ID | URL | 方法 |
|---|---|---|
| P3-33 | https://www.a9note.com/idea-app/ | お問い合わせ |
| P3-34 | https://appfelstrudel.com/a/370899391/alternative-to-captio-email-yourself-with-1-tap.html | contact form |
| P3-35 | https://www.mail.com/blog/posts/email-to-yourself/25/ | email (要確認) |
| P3-36 | https://podcasts.apple.com/us/podcast/productivity-smarts/id1681647204 | monitor |
| P3-37 | https://super-productivity.com/use-cases/gtd/ | monitor |
| P3-38 | https://toolfinder.com/best/gtd-iphone-apps | inclusion request |
| P3-39 | https://gitmind.com/iphone-productivity-app.html | inclusion request |
| P3-40 | https://blog.saner.ai/best-gtd-apps/ | inclusion request |
| P3-41 | https://clickup.com/blog/getting-things-done-flowchart/ | email (低優先) |
| P3-42 | https://www.linkedin.com/pulse/how-i-streamlined-my-productivity-workflow-ben-walker | check then DM |
| P3-43 | https://mattgiaro.com/drafts-vs-apple-notes/ | comment or email |
| P3-44 | https://medium.com/@david.m.ventura/note-taking-apps-for-mac-ios-310097a76868 | Medium response (要確認) |
| P3-45 | https://medium.com/productivity-matters/a-tale-of-two-apps-c729052cce06 | Medium response (要確認) |
| P3-46 | https://www.captio.com/blog/from-your-email-to-captio | **skip** (Emburse Captio expense, 別アプリ) |
| P3-47 | https://apps.apple.com/us/app/captio-expenses/id519089785 | **skip** (別アプリ) |
| P3-48 | https://support.apple.com/guide/iphone/send-email-iph742b6abb1/ios | **skip** (Captio無関係) |
| P3-49 | https://thenextweb.com/news/theres-no-place-like-home-screen-exploring-the-philosophy-of-app-placement | check (要確認) |
| P3-50 | iphoneness/AppShopper/AppAdvice listings | check_then_engage |

---

## 5. 出力フォーマット

### 5-1. ファイル構成

cowork は以下を1つのフォルダ `engagement-drafts/` で納品：

```
engagement-drafts/
├── 00-index.md                       # 100件サマリー + 検証ステータス
├── P0-01.md                          # 詳細ドラフト 3版
├── P0-02.md                          # 同上
├── P0-03.md                          # 同上
├── P0-04.md                          # 同上
├── P0-05.md                          # 同上
├── P1-01.md                          # 詳細ドラフト 1版
├── …
├── P1-15.md
├── P2-01.md                          # テンプレ + per-context カスタマイズ
├── …
├── P2-30.md
├── P3-batch.md                       # P3 50件まとめて1ファイル（簡易ドラフト）
└── _skipped.md                       # skip対象とその理由
```

### 5-2. 各ドラフトファイルの構造

```markdown
# <ID> — <短い説明>

**URL**: <full URL>
**Context**: <Captio mention 部分の抜粋・最大3行>
**OP age**: <e.g., 2018年・necro・OPは inactive 想定>
**Subreddit/Site moderation tone**: <e.g., r/productivity は self-promo 削除厳しめ・comments OK with disclosure>
**Recommended posting time**: <e.g., weekday morning ET>
**Necro warning**: <YES/NO + 理由>
**utm_content**: <ID をそのまま使用>

---

## Draft v1 (preferred — direct help)

[本文 — 100〜200 word英語 / 200〜400字日本語]

*Disclosure: I'm the developer of SimpleMemo... [§0 formula]*

[link with UTM]

---

## Draft v2 (more conservative — no link)

[本文 — リンクなし、80〜120 word]

[disclosure as above, no link]

---

## Draft v3 (storytelling angle)

[本文 — 個人エピソード重視、120〜200 word]

[disclosure, optional link]

---

## Pre-flight checklist

- [ ] Read OP/comment in full on the actual URL (not snippet)
- [ ] Check OP recent activity
- [ ] Read last 5 comments to understand current tone
- [ ] Check site/subreddit's pinned mod rules
- [ ] Choose v1 / v2 / v3 based on context
- [ ] Customize 2-3 phrases to match thread's specific vocabulary
- [ ] Verify UTM in link
- [ ] Verify disclosure is present
- [ ] Set 24h reminder to check for replies

## Risk assessment

- **Low / Medium / High**: <理由>

## Success criteria

- [ ] Comment not removed within 24h
- [ ] At least 1 upvote / 1 visible engagement
- [ ] No mod warning in DMs
```

### 5-3. P3 50件のまとめファイル形式

P3 は per-context 個別ファイル不要。1ファイル `P3-batch.md` に各ID + 短い1行ドラフト + skip/monitor フラグ。

### 5-4. 00-index.md の形式

各IDについて：

| ID | URL | Status | Draft file | Risk | utm_content |
|---|---|---|---|---|---|
| P0-01 | https://reddit.com/.../ | ready | P0-01.md | low | lueg2h2 |
| ... | ... | ... | ... | ... | ... |

---

## 6. 詳細執筆指示（cowork が本文を書くときのガイド）

### 6-1. コンテキスト確認 (必須)

各 URL を **WebFetch で実際に取得** して読む。スニペットだけで書くと文脈ズレが起きる。確認すべき：
- Captio がどう言及されているか（praise / question / shutdown report / comparison etc.）
- スレッドのトーン（formal / casual / technical / GTD-focused etc.）
- 投稿日時 / 最終アクティブ
- コメント欄が開いているか / 閉じているか
- モデレーションルール（self-promo 禁止 / 開示要件 etc.）

### 6-2. 共感の入り方

| OP/著者の感情 | 共感フレーズ |
|---|---|
| Captio absent / lost | "Same here — was a daily user" / "私も10年使ってました" |
| Captio praise | "Had the same Mind-Blown moment" / "あの体験わかります" |
| Captio question (技術) | "Useful question — for anyone landing here in 2026..." |
| Captio shutdown awareness | "You hit the exact failure mode that..." |

### 6-3. 代替候補の併記順位

すべてのコメントで以下のうち最低2つを併記：

1. **SimpleMemo** — 0.3秒起動、AES-GCM、オフライン Outbox、free 3/day
2. **Drafts** — most powerful, action-based, $1.99/mo
3. **Pigeon** — free, modern, simpler
4. **EmailMe** — completely free, no subscription
5. **Note to Self Mail** — UI closest to Captio, Gmail OAuth required
6. **Apple Notes** — built-in but slow (4-6 taps)

### 6-4. SimpleMemo の弱点を入れる位置

ドラフトの後半で必ず1つ：

- "iOS-only (Captio was iOS-only too)" 
- "subscription pricing (Captio was one-time)"
- "I'm the dev, so take this with the appropriate bias"
- "still text-only — if you need attachments, share sheet is better"

### 6-5. リンクの貼り方

- **Reddit / HN comments**: 1本以下（多用は spam 検知）
- **メール / 長文**: 1〜2本まで
- **フォーラム reply**: できればリンクなし、テキストで `simplememofast.com/captio-alternative` を平文記載

---

## 7. 運用フロー（cowork から納品後、人間側）

```
1. cowork から PR or ZIP 受領
2. engagement-drafts/00-index.md で全体確認
3. 1日1件、上から順に：
   a. URL をブラウザで開く
   b. OP / コメント / モデレーション状況を確認
   c. ドラフト v1 / v2 / v3 を選択
   d. 当該スレッド固有のキーワード/口調に合わせて2〜3箇所カスタマイズ
   e. 投稿
   f. docs/outreach-log.md に記録（日時、URL、選んだ version、初期upvote数）
4. 投稿後 24h:
   - 削除されたら理由を記録 → 該当ドラフトを修正、再投稿しない
   - 反応があれば誠実に返信（テンプレなし、毎回 1on1）
5. 1週間後:
   - 累計 upvote / コメント / GA4 utm_content クリックを集計
   - 効果が低い draft style は廃止、効果が高いものを次の月に展開
6. 1ヶ月後:
   - 累計被リンク反映を Ahrefs で確認
   - 採用された記事を outreach-log.md に追記
```

---

## 8. 品質基準（自己レビュー）

各ドラフトが以下を満たしているか cowork 自身でチェック：

| チェック | OK基準 |
|---|---|
| 共感 | 1〜2文目で OP/comment主の発言を引用または言い換え |
| Captio使用歴 | 「used Captio from <year> to 2024」/「Captio利用歴<期間>」が含まれる |
| 真実性 | 商標 / 公式関係に関する誤った主張なし |
| 自賛形容詞 | "best" / "perfect" / "amazing" / "the only" を使っていない |
| 開発者開示 | 一目で分かる位置・形式 |
| 代替候補 | SimpleMemo一択ではない（最低1つは Drafts/Pigeon/EmailMe を併記） |
| 弱点正直 | iOS-only / subscription / バイアス を1つ以上書いている |
| リンク数 | 1本以下、UTM付与済み |
| 文字数 | 100〜200 word（v3 は 220 word まで可）/ 日本語は 300〜500字 |
| 押し付け | 「ぜひ」「使ってください」「無料です」が無い |
| Reddit/Forum-native | プレーン文。**太字** は最大2箇所、絵文字なし、画像なし |
| Necro-handling | 古いスレッドの場合、「For future readers landing here from search」を明記 |

---

## 9. テンプレート（cowork が P2/P3 で使うベース）

### TEMPLATE-EN-BLOG (broken-link + soft introduction)

```
Subject: Editor's note request — your <YEAR> Captio review

<NAME>,

Your <YEAR> Captio review (<URL_SLUG>) links to captio.co / the App Store, but Captio was removed from the App Store in October 2024 (Tupil shut down servers; no developer statement). For readers landing here from search, an editor's note dating the article would prevent dead-end clicks.

Background context (third-party reporting, not Tupil-affiliated): simplememofast.com/blog/captio-discontinued

Disclosure: I built SimpleMemo (simplememofast.com/captio-alternative/) as the Captio successor after using it daily for 10 years. This is a broken-link notification, not a placement request.

AI Ataka
Developer of SimpleMemo
simplememofast.com / hajimeataka@gmail.com
```

### TEMPLATE-JA-BLOG (リンク切れ通知＋紹介ソフト)

```
件名: 記事「<記事タイトル>」のリンク切れご連絡

<媒体名> 様

<媒体>の<年>記事「<タイトル>」を拝読しました。記事内のCaptio公式・App Storeリンクが、2024年10月のCaptio終了（App Store削除＋サーバー停止）により機能しない状態です。読者様の利便性のため、追記または後継アプリ併記をご検討いただけませんでしょうか。

参考: Captio利用10年のiOS開発者として、終了後に「Captio式シンプルメモ」を株式会社ユリカ名義でリリース（PR TIMES, ITmedia掲載）。Captio (Tupil B.V. / Ben Lenarts氏) との提携関係なし。詳細: simplememofast.com/captio-alternative/?utm_source=outreach&utm_medium=email&utm_campaign=captio-engagement&utm_content=<slug>

ご検討のほど、よろしくお願いいたします。

AI Ataka / SimpleMemo 開発者 / 株式会社ユリカ
hajimeataka@gmail.com
```

### TEMPLATE-REDDIT-NECRO (古いReddit thread への返信)

```
For anyone landing here in 2026: Captio was removed from the App Store in October 2024 (Tupil shut down servers without an announcement). Modern alternatives that fit the same niche:

- **SimpleMemo** — 0.3s launch, AES-GCM encryption, offline Outbox, free 3/day
- **Drafts** — most powerful, action-based, $1.99/mo Pro
- **Pigeon** — free Captio-style alternative
- **EmailMe** — completely free, simpler

[brief context-specific 1-2 sentences here]

*Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts). Built it after using Captio for 10 years myself.*

[optional link with UTM]
```

### TEMPLATE-REDDIT-ACTIVE (アクティブな thread への返信)

```
[Specific empathy with OP/comment context — 1-2 sentences directly engaging with what they said]

[Captio shutdown context if relevant — 1 sentence]

[3-4 alternatives with 1-line each, framing what each is good for]

[1 sentence honest about SimpleMemo weakness]

*Disclosure: I'm the developer of SimpleMemo. Not affiliated with Tupil B.V. or Ben Lenarts.*

[optional link]
```

---

## 10. 開始指示

1. **Phase 1**: cowork は本ファイル全文を読み、§0〜§9を理解
2. **Phase 2**: § 4 の表から各 URL を **WebFetch で取得** し、Captio mention の文脈を確認
3. **Phase 3**: §5 のフォーマットで各ドラフトファイルを生成
4. **Phase 4**: §8 の品質基準で自己レビュー
5. **Phase 5**: PR or ZIP で納品

PR タイトル例: `docs: cowork-generated drafts for 100 Captio engagement contexts`

---

## 11. 関連リソース（参考のみ・本ファイルだけで完結する作りになっている）

- 元の Reddit データ: simplememofast/reddit-captio-only-research/data/exports/reddit_captio_only_ranked.csv
- 戦略分析（手書き）: simplememofast/reddit-captio-only-research/reports/reddit_captio_only_strategy.md
- broken-link outreach 元ブリーフ: simplememofast/docs/cowork-broken-link-outreach.md
- HARO/Featured/Qwoted 運用: simplememofast/docs/outreach-haro-setup.md

これらは参考であり、本ブリーフだけで100件分のドラフト生成依頼が成立するように書かれている。

---

調査ではなく **ドラフト生成のみ** が成果物。**自動投稿は厳禁**。
