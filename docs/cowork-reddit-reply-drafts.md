# CoWork依頼: Reddit Captio スレッド別 個別返信コメント案 作成

**作成日**: 2026-05-05
**対象**: `reddit-captio-only-research/data/exports/reddit_captio_only_ranked.csv` で特定済みのCaptio言及Redditスレッド
**目標**: 各スレッドごとに、**そのスレッド固有の文脈に沿った返信下書き**をMarkdownファイルとして納品。**人間が承認した上で手動投稿する**運用前提。

---

## 0. 重要な前提（厳守）

### 自動投稿は禁止

本依頼は **下書き生成のみ** です。コメントの自動投稿はしないでください。理由：

1. **Reddit ToS違反リスク**: 自動投稿（bot/scripted submission）はアカウント永久 ban + サブレッド ban の対象
2. **ブランド毀損**: SimpleMemo / 株式会社ユリカ / AI Ataka 個人の信用が一発で破壊される
3. **元のリサーチブリーフでも明示禁止**: `docs/cowork-reddit-captio-research.md` §4 で「スパム投稿の自動生成禁止 / ボット自動返信禁止」と定めている

cowork は下書きを Markdown で納品し、人間（AI Ataka）が**1スレッドごとに**：
1. 該当スレッドを Reddit で実際に開く
2. OPの最近の活動・スレッドの最終コメント日時・サブレッドのモデレーションルールを確認
3. 下書きを当該スレッドの最新コンテキストに合わせて手動修正
4. アカウント `/u/<手動posting account>` でログインして手動でコメント投稿
5. 投稿後 24h は反応を観察、必要なら follow-up または削除

### 開発者であることの開示は必須

すべてのコメント末尾に必ず以下を含めてください（変更可、ただし開示の事実は省略不可）：

> *Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts). Built it after using Captio for 10 years myself.*

---

## 1. 入力データ

### 1-1. 対象スレッドリスト（7件 + 警戒2件）

ranked CSV から、relevance ≥ 80 で **真の Captio iOS アプリ言及** と判定された 7 件 + 別途「リプライしない方がよい」 2 件を含む。

| # | サブレッド | 投稿日（推定） | スレッドURL（permalink） | OP/comment文脈 | クラス |
|---|---|---|---|---|---|
| 1 | r/productivity | 2021頃 | https://www.reddit.com/r/productivity/comments/l5k2xk/my_strategy_to_combat_scatter_brain/ | 「Captio, it's an app that sends my thoughts straight to my inbox. Mind. Blown.」のストーリー投稿 | A (praise) |
| 2 | r/productivity | 2019 | https://www.reddit.com/r/productivity/comments/acsznt/a_spreadsheet_as_a_to_do_app_share_your_setup/ | OPがCaptio + IFTTT + Gmail のワークフローを公開 | A (workflow) |
| 3 | r/shortcuts | 2018 | https://www.reddit.com/r/shortcuts/comments/9zr0vs/all_actions_in_the_shortcuts_app_redditors_use/ | iOS Shortcuts のActionリストにCaptioが含まれる | A (tool list) |
| 4 | r/ADHD_Programmers | 2022 | https://www.reddit.com/r/ADHD_Programmers/comments/spshw0/i_made_a_program_in_python_that_helps_me_save_my/hwhqujd/ | コメントで「I use Captio for something sorta similar on iOS」 | D (usage) |
| 5 | r/gtd | 2020 | https://www.reddit.com/r/gtd/comments/jrorg2/looking_for_a_gtd_app_recommendation/gbxsqkb/ | GTDアプリ推薦スレで「I use an app called captio」と紹介 | G (low) |
| 6 | r/apple | 2017 | https://www.reddit.com/r/apple/comments/72bs35/iftttcaptio_or_similar/ | OP「Wondering if anyone knows a way to connect IFTTT with Captio」 | C (question) |
| 7 ★ | r/productivity | 2018 | https://www.reddit.com/r/productivity/comments/8pab1f/any_lightning_fast_ios_note_taking_apps_like/lueg2h2/ | **Captio user explicitly looking for replacement** 「I've been using the email feature of Captio forever, but it recently stopped working. :( Came here looking for an alternative.」 | C (replacement) |

**警戒（リプライしない方がよい）**:

| 警戒# | サブレッド | 理由 |
|---|---|---|
| W1 | r/iosapps `/comments/1sxtjxh/` | **SimpleMemo自身のpromo post**。チームが既に投稿済み。重複投稿NG |
| W2 | r/RASPBERRY_PI_PROJECTS | "captio" は config file 内の "caption" 切り詰め。**false positive**、無関係 |

### 1-2. 各スレッドのフルコンテキスト

各スレッドの本文・コメント・OP情報・最新の活動状況を **WebFetch で実際に取得して読んでください**。snippet ベースで書くと文脈ズレが起きます。

---

## 2. 各下書きに必ず含めるべき要素

### 2-1. 必須要素（チェックリスト）

各返信下書きには以下8要素をすべて含める：

- [ ] **冒頭1〜2文で OP/コメント主の発言に共感**（"Same here" "I felt the same" 等）
- [ ] **Captio使用歴を1文で**（例：「I used Captio daily from 2014 to 2024」）
- [ ] **Captio shutdown の事実**（既知でも、新規読者向けに1文で）
- [ ] **SimpleMemo の存在を1文で**（売り込みではなく事実陳述として）
- [ ] **代替候補を最低1つは併記**（Drafts / Pigeon / EmailMe など、SimpleMemo一択にしない）
- [ ] **SimpleMemoの弱点を最低1つ正直に**（iOS-only / subscription / 著者バイアス等）
- [ ] **開発者開示**（§0 の formula）
- [ ] **リンクは1本以下**（hero LP `https://simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=organic&utm_campaign=captio-thread&utm_content=<thread-id>` のみ。複数貼り禁止）

### 2-2. UTM パラメータ

各リンクには以下を必須：

```
?utm_source=reddit&utm_medium=organic&utm_campaign=captio-thread&utm_content=<thread-id>
```

`<thread-id>` は permalink 末尾の Reddit ID（例：`l5k2xk`, `lueg2h2`）。GA4 で thread 別の流入CVRが測れる。

### 2-3. やってはいけないこと

| NG | 理由 |
|---|---|
| 「公式後継」「Tupilの正規後継」 | 商標違反・なりすまし |
| "the best app" "perfect" 等の自賛形容詞 | bot/marketer っぽさが出る |
| Drafts / Pigeon / Apple Notes を否定 | Reddit 民は対立軸が嫌い |
| 同じ文を複数スレッドで使い回し | bot 検知される |
| OP/コメント主の名前を呼びかける | 親密装い、逆効果 |
| 投稿日から30日以上経過したスレッドへの長文返信 | necro-posting 疑念 |
| OP の主張に反論する | 何のための返信？ |
| 開発者開示を末尾「by the way」で軽く触れる | ToS的にもアウト、文頭/明示で |
| マークダウン装飾過剰（**太字** 多用、絵文字、画像） | Reddit プレーンが基本 |
| 「ぜひ使ってみてください」系の押し付け | 一発で removed |

---

## 3. スレッドごとのアプローチ方針

### 3-1. r/productivity #7 ★最重要 (`lueg2h2`)

**OP最終言及**: 「Captio... it recently stopped working. Came here looking for an alternative.」

**アプローチ**: **直接的なソリューション提案**だがプッシュしすぎない。OP は問題を明示しているので、共感 → 経緯（Captio が 2024-10 に App Store から完全削除されたこと）→ 代替候補3つ（SimpleMemo, Drafts, Pigeon）→ どれを選ぶかは use case 次第、と書く。

**注意**: このコメントは2018年のもの。OP はもう Reddit にいない可能性が高い。**でも将来 "captio replacement" で検索したユーザーがこのスレッドに着地するため、コメントの寿命は長い**。古いスレッドにこそ返信する価値がある。

### 3-2. r/productivity #1 (`l5k2xk`)

**ストーリー**: 友人がランチで Captio を見せて "Mind. Blown." とOP

**アプローチ**: **ストーリーで返す**。「I had the same Mind-Blown moment with Captio in 2014. Used it daily for 10 years. When it shut down in October 2024 I rebuilt it as SimpleMemo because nothing else captured that exact feel.」 開発者開示 → SimpleMemo URL（1本のみ）→ Drafts も candidate と併記。

### 3-3. r/productivity #2 (`acsznt`)

**OPワークフロー**: Captio + IFTTT + Gmail でタスク管理

**アプローチ**: **ワークフロー継承可能性**を伝える。「Just FYI for anyone reading this thread in 2026: Captio shut down in October 2024. The same workflow can be rebuilt with [SimpleMemo / EmailMe / a Drafts action]. The IFTTT integration still works since both still send via standard email.」

### 3-4. r/shortcuts #3 (`9zr0vs`)

**コンテキスト**: iOS Shortcuts の Action リスト。Captio が単に1項目として挙がっている。

**アプローチ**: **軽い情報補足**。「Note: Captio was removed from the App Store in October 2024. SimpleMemo (a Captio successor) supports the same Append-to-Note / Send-Note actions for users updating this list.」 開発者開示。深い議論は不要。

### 3-5. r/ADHD_Programmers #4 (`hwhqujd`)

**コメント主**: 「I use Captio for something sorta similar on iOS」

**アプローチ**: **ADHD ユーザー向けの共感** + Captio shutdown 通知。「Heads up — Captio was removed from the App Store in October 2024. For ADHD-friendly note-to-email apps, [SimpleMemo / Drafts] are the closest matches. The friction-free input is even more important for ADHD users.」 開発者開示。

### 3-6. r/gtd #5 (`gbxsqkb`)

**コメント**: 「I use an app called captio (on iOS) to quickly capure ideas. The app opens in an instant」

**アプローチ**: **GTD コンテキストに合わせる**。「Same — Captio was perfect for the GTD Capture phase. After Captio shut down in October 2024, I switched to [SimpleMemo / Drafts / EmailMe]. SimpleMemo is the closest behavioral match (0.3s launch, 1-tap send), Drafts is more flexible if you want action automation.」 開発者開示。

### 3-7. r/apple #6 (`72bs35`)

**OP**: 「Wondering if anyone knows a way to connect IFTTT with Captio」

**アプローチ**: **時系列で答える**。「For anyone finding this thread in 2025+: Captio was removed from the App Store in October 2024, so the IFTTT integration is moot. Modern alternatives that work with IFTTT include [Drafts / SimpleMemo / EmailMe]. SimpleMemo specifically uses standard email which IFTTT can trigger on.」 開発者開示。

### 3-8. 警戒2件（リプライしない）

W1 (own promo) と W2 (false positive) は **下書き作成不要**。納品時に「skipped, reason: ...」と明記。

---

## 4. 出力フォーマット

### 4-1. ファイル構成（推奨）

```
docs/reddit-reply-drafts/
├── README.md                                   # 索引、運用ルール
├── 01-r-productivity-lueg2h2.md                # ★最重要
├── 02-r-productivity-l5k2xk.md
├── 03-r-productivity-acsznt.md
├── 04-r-shortcuts-9zr0vs.md
├── 05-r-ADHD_Programmers-hwhqujd.md
├── 06-r-gtd-gbxsqkb.md
├── 07-r-apple-72bs35.md
└── _skipped.md                                  # 警戒2件の skip 理由
```

### 4-2. 各下書きMD の構造

```markdown
# Reply draft: r/<sub> /<thread-id>

**Thread URL**: <full permalink>
**OP / comment context**: <抜粋・最大3行>
**OP age (estimated)**: <e.g., 7 years old, OP last active 2019>
**Subreddit moderation tone**: <e.g., 'r/productivity removes promo posts; comments OK if disclosure clear'>
**Recommended posting time**: <e.g., 'weekday morning ET to maximize visibility'>
**Recommended account**: <e.g., 'AI Ataka primary account'>
**Necro warning**: <e.g., 'YES — thread is from 2018; reply will be valuable for future Google search landings but OP unlikely to engage'>

---

## Draft v1 (preferred)

[本文 — 100〜180 word英語]

*Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts). Built it after using Captio for 10 years myself.*

[link if any: https://simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=organic&utm_campaign=captio-thread&utm_content=<thread-id>]

---

## Draft v2 (more conservative — no link)

[本文 — リンクなしバージョン、80〜120 word]

[disclosure as above, no link]

---

## Draft v3 (storytelling angle)

[本文 — 個人エピソード重視、120〜180 word]

[disclosure, optional link]

---

## Pre-flight checklist (before posting)

- [ ] Read the OP/comment in full on Reddit (not just snippet)
- [ ] Check OP's recent activity to gauge if they're still active
- [ ] Read the last 5 comments to understand current tone
- [ ] Check subreddit's pinned mod rules for self-promo policy
- [ ] Choose draft v1 / v2 / v3 based on tone match
- [ ] Customize 1-2 phrases to match the thread's specific vocabulary (avoid template feel)
- [ ] Verify UTM in link
- [ ] Verify disclosure is present
- [ ] Set a 24h reminder to check for replies
- [ ] If post is removed within 1h, note reason and adjust future drafts

## Risk assessment

- **Low risk**: <thread is open-ended, comments welcome>
- **Medium risk**: <comment-section thread, OP may be inactive>
- **High risk**: <self-promo subreddits or rules requiring approval>

## Success criteria

- [ ] Comment not removed within 24h
- [ ] At least 1 upvote (means ≥1 person found it useful)
- [ ] No mod warning in DMs

```

### 4-3. README.md の構造

```markdown
# Reddit Reply Drafts — Operating Manual

## Drafts in this folder
[テーブル：file / sub / thread-id / priority]

## Posting rules
[§0, §2-3 を要約]

## Posting cadence
[1日1件以下、週3件以下、同一サブレに2週間に1件以下]

## Account hygiene
[実名アカウント1本、bio に開発者明記、ありふれた人間活動を混ぜる]

## Tracking
[posted log を docs/outreach-log.md に追記する手順]
```

---

## 5. 品質基準

各下書きが以下を満たしているか自己レビューしてください：

| チェック | OK基準 |
|---|---|
| 共感 | 1〜2文目で OP/comment主の発言を引用または言い換え |
| Captio使用歴 | 「used Captio from <year> to 2024」が含まれる |
| 真実性 | 商標 / 公式関係に関する誤った主張なし |
| 自賛形容詞 | "best", "perfect", "amazing", "the only" を使っていない |
| 開発者開示 | 一目で分かる位置・形式 |
| 代替候補 | SimpleMemo一択ではない（最低1つは Drafts/Pigeon/EmailMe を併記） |
| 弱点正直 | iOS-only / subscription / バイアス を1つ以上書いている |
| リンク数 | 1本以下、UTM 付与済み |
| 文字数 | 100〜200 word（v3 は 220 word まで可） |
| 押し付け | 「ぜひ」「使ってください」「無料です」が無い |
| Reddit-native | プレーン文。**太字** は最大2箇所、絵文字なし、画像なし |
| Necro-handling | 古いスレッドの場合、「For future readers landing here from search」を明記 |

---

## 6. 納品形式

cowork は以下を Pull Request 形式で納品：

1. `docs/reddit-reply-drafts/` ディレクトリ作成
2. README.md + 7ファイル + _skipped.md
3. 各ファイルが §4-2 の構造に従う
4. 各ファイルに draft v1, v2, v3 の3バージョン
5. `_skipped.md` に W1 / W2 の skip 理由

PR タイトル例: `docs: Reddit reply drafts for 7 Captio mention threads`

---

## 7. 運用フロー（人間側）

cowork から PR が来た後の運用：

```
1. PR レビュー時に各下書きを cold で読む（テンプレ感がないか）
2. マージ
3. 1日1件、上から順に：
   a. Reddit で当該スレッドを開く
   b. OP / コメント主 / モデレーション状況を確認
   c. 下書きから v1 or v2 or v3 を選択
   d. 当該スレッド固有のキーワード/絵文字/口調に合わせて2-3箇所をカスタマイズ
   e. 投稿
   f. docs/outreach-log.md に記録（日時、URL、選んだ version、初期upvote数）
4. 投稿後 24h:
   - 削除されたら理由をログ → 該当下書きを修正、再投稿しない
   - 反応があれば誠実に返信（テンプレなし、毎回 1on1）
5. 1週間後:
   - 投稿の累計upvote / コメント / クリック（GA4の utm_content で確認）を集計
   - 効果が低い draft style は廃止、効果が高いものを次の月に展開
```

---

## 8. 関連ドキュメント

- `docs/cowork-reddit-captio-research.md` — 元の Reddit 調査ブリーフ
- `docs/cowork-broken-link-outreach.md` — 別チャネル：broken link outreach
- `docs/outreach-haro-setup.md` — HARO/Featured/Qwoted 運用
- `reddit-captio-only-research/reports/reddit_captio_only_strategy.md` — Reddit データ分析・戦略
- `reddit-captio-only-research/reports/reddit_captio_reply_templates.md` — 文脈別テンプレ集（参考材料）
- `reddit-captio-only-research/data/exports/reddit_captio_only_ranked.csv` — 元データ

---

## 9. 開始指示

1. 各スレッドURL を WebFetch で実際に取得し、OP/comment 主の最新発言とコメント主投稿を読む
2. §3 のスレッド別アプローチ方針に基づき、§4-2 構造で 7 ファイル作成
3. §5 の品質基準で自己レビュー
4. PR 作成
5. README.md + _skipped.md を含めて納品

調査・分析ではなく **下書き生成のみ** が成果物。**自動投稿は厳禁**。
