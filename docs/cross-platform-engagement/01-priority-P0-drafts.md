# P0 Drafts — Top 5 highest-priority engagement contexts

**Action window**: 24–48h
**Engagement type**: comment / contact form / direct email
**Pre-flight rules**: §0 of `README.md`

All drafts include 3 versions (v1 standard / v2 link-free / v3 storytelling). Pick by tone match.

---

## P0-01 — r/productivity / lueg2h2 ★ HIGHEST PRIORITY

**Thread URL**: https://www.reddit.com/r/productivity/comments/8pab1f/any_lightning_fast_ios_note_taking_apps_like/lueg2h2/
**OP/comment context**: "I've been using the email feature of Captio forever, but it recently stopped working. :( Came here looking for an alternative."
**OP age**: 2018 (~7 years old; OP unlikely active but evergreen Google traffic)
**Subreddit moderation tone**: r/productivity removes self-promo posts; comments OK with disclosure
**Posting time**: weekday morning ET to maximize visibility
**Necro warning**: YES — necro reply but valuable for SEO landing traffic

### Draft v1 (preferred — direct help)

Same boat — I was a daily Captio user for 10 years and got hit by the shutdown too. For anyone landing here from Google in 2025+: Captio was removed from the App Store in October 2024 (the Tupil team never made an official statement, but the servers are down too). The closest replacements that came up when I researched this:

1. **Drafts** — most powerful, action-based, but ~0.8s launch and steeper learning curve
2. **SimpleMemo** — 0.3s launch, AES-GCM encryption, offline Outbox, free 3/day
3. **Pigeon** — free Captio-style alternative, modern UI
4. **Note to Self Mail** — UI closest to Captio's but Gmail OAuth required

I ended up building SimpleMemo myself since Drafts felt like overkill for what I needed Captio for. iOS-only, $2.99/mo for unlimited (free 3/day forever). Not a perfect fit for everyone — Drafts is genuinely better if you want extensibility.

*Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts). Built it after using Captio for 10 years myself.*

simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=organic&utm_campaign=captio-engagement&utm_content=lueg2h2

### Draft v2 (no link, comment-only)

Same boat — was a daily Captio user from 2014 to 2024 and got hit by the shutdown too. For future readers landing here: Captio was removed from the App Store in October 2024 (Tupil never issued a statement; servers are down). The closest matches I found while looking for a replacement: Drafts (most powerful, slower, $1.99/mo), Pigeon (free, modern), Note to Self Mail (Gmail-only), or SimpleMemo (which I ended up building myself since Drafts was overkill for the Captio workflow). Drafts is the better pick if you want extensibility; SimpleMemo if you want the exact Captio feel.

*Disclosure: I'm the developer of SimpleMemo. Not affiliated with the Captio team (Tupil B.V. / Ben Lenarts).*

### Draft v3 (storytelling)

Felt the same loss — used Captio every day from 2014 to 2024. The "tap, type, send" muscle memory was so deep that when it finally shut down (October 2024 — Tupil's servers went dark, no announcement), nothing else felt right. I ended up rebuilding it as SimpleMemo over six months because Drafts was too configurable, Apple Notes was too slow, and Pigeon didn't have offline retry. It's iOS-only, has a free tier (3/day), and the design goal was just "Captio but it survives Gmail API changes." Drafts is genuinely better if you want flexibility — but if you want the exact original Captio feel, this is the closest match in 2026.

*Disclosure: I'm the SimpleMemo developer. Not affiliated with Captio / Tupil / Ben Lenarts.*

simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=organic&utm_campaign=captio-engagement&utm_content=lueg2h2-v3

### Pre-flight checklist
- [ ] Read the full thread before posting
- [ ] Verify OP's account is inactive (decide if @-mention is appropriate)
- [ ] Check r/productivity's most recent self-promo enforcement (mods' AutoModerator rules)
- [ ] Prefer v1 if no other replies have been added recently; v2 if discussion is active
- [ ] Customize 1-2 phrases to match thread vocabulary

---

## P0-02 — r/apple / 72bs35 — IFTTT/Captio integration question

**Thread URL**: https://www.reddit.com/r/apple/comments/72bs35/iftttcaptio_or_similar/
**OP context**: "Wondering if anyone knows a way to connect IFTTT with Captio (Captio is an iOS app...)"
**OP age**: 2017 (8 years old)
**Necro warning**: YES — but the IFTTT angle gives evergreen value

### Draft v1

For anyone finding this thread in 2025+: Captio was removed from the App Store in October 2024 so the IFTTT integration question is moot. Modern alternatives that work with IFTTT (since they all use standard email rather than a proprietary API, IFTTT can trigger on the inbound email):

- **SimpleMemo** — 0.3s launch, AES-GCM encryption, offline Outbox; routes through standard SMTP so IFTTT email triggers work
- **Drafts** — has native IFTTT-like actions plus Shortcuts integration
- **Pigeon** — basic, sends standard email
- **Email Me** — simplest free option

The Captio + IFTTT pattern was specifically about routing memos to different Gmail labels based on prefix — that's still doable with any of the above + Gmail filters.

*Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts).*

### Draft v2 (no link)

For anyone finding this in 2025+: Captio was removed from the App Store in October 2024, so this exact integration is no longer possible. The Captio + IFTTT pattern (routing memos to Gmail labels by prefix) still works with any modern email-yourself app since they all use standard SMTP. Drafts has the best native automation. SimpleMemo, Pigeon, Email Me are simpler standard-email alternatives.

*Disclosure: I'm the SimpleMemo developer. Not affiliated with Captio.*

### Draft v3 (workflow-focused)

The Captio + IFTTT setup that this thread is about: Captio sends to a Gmail address with a prefix in the subject (like "todo:..."), then IFTTT triggers on the Gmail label and routes the memo to OmniFocus / Trello / Things. After Captio shutdown (October 2024), the same pattern works with any email-yourself app: SimpleMemo / Pigeon / Email Me / Drafts all send standard email that IFTTT can pick up. Of those, Drafts has native built-in actions if you want to skip IFTTT entirely. SimpleMemo if you specifically want the Captio "open and type" feel.

*Disclosure: I'm the developer of SimpleMemo. Not affiliated with Captio / Tupil / Ben Lenarts.*

---

## P0-03 — note.com @masatakashida — "Captioに代わるアプリを開発中"

**URL**: https://note.com/masatakashida/n/nd2f42fb27bed
**著者**: DJ MASA a.k.a. Snufkin
**コンテキスト**: 著者が自作 Captio 後継アプリを開発中。ライバルではあるが連携可能性。
**Engagement method**: note.com コメント or 著者連絡
**Tone**: 日本語、開発者同士の協力的トーン

### Draft v1 (note.com コメント・日本語)

masatakashidaさんはじめまして、Captio式シンプルメモを開発した株式会社ユリカのAtaka（@simplememo）と申します。Captio代替アプリを開発中とのこと、まったく同じ動機で2024年10月のCaptio終了後にシンプルメモを作りました（10年Captio使ってました）。Cloudflare Workers + Resend API で Gmail API 非依存、AES-GCM 端末内暗号化、オフラインOutbox 自動再送 などをCaptioの弱点回避軸にしました。お互いユーザーは Captio 難民でかぶる可能性も高いので、ぜひ意見交換させていただけたら嬉しいです。詳細は [simplememofast.com/captio-alternative/](https://simplememofast.com/captio-alternative/?utm_source=note&utm_medium=comment&utm_campaign=captio-engagement&utm_content=masatakashida) に。Captio (Tupil B.V. / Ben Lenarts) との提携・公式関係は無く、設計思想を尊重した精神的後継アプリという位置付けです。

### Draft v2 (X/Twitter DM・日本語短め)

@masatakashida さん、Captio代替アプリを開発中とのnote拝見しました。私もちょうど同じ動機で2024年10月のCaptio終了後に「シンプルメモ」をリリースしました（10年Captio使い）。お互いCaptio難民層を取り合う関係になりますが、ぜひ情報交換させてください。 simplememofast.com/captio-alternative

### Draft v3 (協力提案・メール)

件名: Captio後継アプリ開発の件で（株式会社ユリカ Ataka）

masatakashida 様

突然のご連絡失礼します。株式会社ユリカ代表のAtakaと申します。

note の「Captio に代わるアプリを開発中」を拝見し、まったく同じ動機で2024年10月のCaptio終了直後に「Captio式シンプルメモ」をリリースした者です。10年来のCaptioユーザーで、終了後に自分で後継を作ろうと考えました。

ご開発中のアプリと当社のシンプルメモ、それぞれの設計判断（送信基盤・暗号化・課金モデル等）には学びが多くありそうですので、もしご興味あれば一度オンラインで情報交換させていただけませんか。 

Captio (Tupil B.V. / Ben Lenarts) とは無関係である点、明記しておきます。

ご検討よろしくお願いします。
AI Ataka
SimpleMemo / 株式会社ユリカ
hajimeataka@gmail.com / simplememofast.com

---

## P0-04 — note.com @39thankyou — "NOTE TO EMAIL"

**URL**: https://note.com/39thankyou/n/n974af6dff6ad
**コンテキスト**: 「Note to Email」を Captio 代替として紹介
**Engagement method**: note.com コメント

### Draft v1 (日本語)

記事拝見しました。Captio が突然使えなくなったときの絶望感、よく分かります。私も10年使っていて、2024年10月のサーバー停止後に自分で後継アプリ「シンプルメモ」を作りました。Note to Email は確かに有力な候補で、特にAndroid版がある点は強みですね。シンプルメモは iOS のみですが、起動0.3秒・AES-GCM暗号化・オフラインOutbox 自動再送 など、Captio が弱かった部分を補強した設計にしています。比較表は [simplememofast.com/captio-alternative/](https://simplememofast.com/captio-alternative/?utm_source=note&utm_medium=comment&utm_campaign=captio-engagement&utm_content=39thankyou) で公開しています。Captio (Tupil B.V.) との提携関係はなく、設計思想を尊重した代替の選択肢の1つとしてお試しいただければ。 — AI Ataka / 株式会社ユリカ

### Draft v2 (リンクなし・短め)

Captio 終了後に同じ動機で「シンプルメモ」を作りました（10年来のCaptioユーザーです）。Note to Email との違いは、iOS専用ですがオフラインOutbox自動再送・AES-GCM端末内暗号化・起動0.3秒という設計です。Captio (Tupil B.V.) との提携はなく、選択肢の1つとして。 — AI Ataka

### Draft v3 (情報共有のみ・営業色弱め)

Captio が消えたとき同じことを考えていた一人です。記事の Note to Email おすすめは正確で、Android対応は大きい。iPhoneのみなら他にも、私が作った「シンプルメモ」（0.3s起動・暗号化・オフライン）と、Drafts (action automation 充実)、Pigeon (無料・シンプル)、Note to Self Mail (UIがCaptio最も近い・Gmail要OAuth) という選択肢が増えています。それぞれ得意分野が違うので、Captio難民の方の参考になれば。 — AI Ataka, SimpleMemo developer (Captio / Tupil とは無関係)

---

## P0-05 — attnoel.co.jp — "Captioの代替アプリ オススメ2選+α"

**URL**: https://www.attnoel.co.jp/blog/from-captio-to-note-to-email/
**コンテキスト**: Captio代替として Note To Self Mail と Note to Email を紹介。SimpleMemo 未掲載。
**Engagement method**: お問い合わせフォーム経由のメール
**Notes**: 既に `docs/cowork-broken-link-outreach.md` Target 11 として登録済み。**最も確度が高い掲載追加候補**。

### Draft v1 (お問い合わせフォーム・日本語)

件名: 記事「Captioの代替アプリ オススメ2選+α」への追加情報のご提案

アットノエル様

突然のご連絡失礼いたします。「Captioの代替アプリ」記事を拝読し、Captio難民にとって極めて有用な情報源だと感じました。

私はCaptioを10年間（2014〜2024）愛用していたiOS開発者で、2024年10月のCaptio終了を受けて、後継アプリとして「Captio式シンプルメモ」を株式会社ユリカ名義でリリースしました（PR TIMES, ITmedia等で取り上げていただきました）。

ご記事で紹介されている Note To Self Mail / Note to Email はいずれも優れた選択肢ですが、もし「3つ目以降の選択肢」として弊社シンプルメモを併記いただけますと、Captioを愛していた読者にとって参考になるかと存じます。Captioが弱かった以下の3点を、設計段階から強化しています：

1. **起動速度0.3秒**（iPhone 15 / iOS 17, 20回コールドスタート平均、Captio比でも改善）
2. **AES-GCM端末内暗号化** + **Cloudflare Workers + Resend API** の独自送信基盤（Gmail API 非依存）
3. **オフライン Outbox** 自動再送（電波圏外でメモ送信可能）

詳細・比較表は [simplememofast.com/captio-alternative/](https://simplememofast.com/captio-alternative/?utm_source=outreach&utm_medium=email&utm_campaign=captio-engagement&utm_content=attnoel) にて公開しています。

なお、本サービスおよび株式会社ユリカは、Captio (Tupil B.V. 製) および同社共同創業者 Ben Lenarts 氏と、提携・後援・公認・スポンサーシップなど一切の関係を持ちません。「Captio式」は操作思想の継承を表す表現で、なりすましの意図はありません。

ご記事の記事内・追記いずれの形でも構いませんので、ご検討いただけますと幸いです。掲載されない場合でも、Captio終了の事実関係（2024年10月にApp Storeから削除、サーバー停止）については記事内のリンク切れ修正素材として参考にしていただければと存じます。

ご検討のほど、よろしくお願いいたします。

AI Ataka
SimpleMemo 開発者
株式会社ユリカ（YURIKA, K.K.）
simplememofast.com
hajimeataka@gmail.com

### Draft v2 (短縮版・お問い合わせフォーム)

件名: 「Captio代替アプリ」記事への追加情報のご提案

アットノエル様

「Captioの代替アプリ オススメ2選+α」拝読しました。Captioを10年間愛用していたユーザー兼iOS開発者として、2024年10月の終了を受けて後継アプリ「シンプルメモ」をリリースしました（PR TIMES / ITmedia 掲載）。

ご記事でご紹介の2選に追加で、「3つ目の選択肢」として弊社シンプルメモを併記いただけませんでしょうか。Captioが弱かった3点（起動0.3秒・AES-GCM暗号化・オフライン Outbox）を強化した設計です。比較は [simplememofast.com/captio-alternative/](https://simplememofast.com/captio-alternative/?utm_source=outreach&utm_medium=email&utm_campaign=captio-engagement&utm_content=attnoel) にて。

なおCaptio (Tupil B.V. / Ben Lenarts) との提携・公認関係は一切ございません。

ご検討よろしくお願いいたします。

AI Ataka
SimpleMemo 開発者 / 株式会社ユリカ
hajimeataka@gmail.com / simplememofast.com

### Draft v3 (broken-link通知のみ・押しつけ感ゼロ)

件名: 記事内のリンク切れに関するご連絡

アットノエル様

「Captioの代替アプリ オススメ2選+α」記事内のCaptio公式サイトへのリンクですが、Captioは2024年10月にサービス完全終了（App Store削除＋サーバー停止）しているため、リンク先が現在閉じられている可能性があります。

読者様の利便性のため、当該リンクの修正をご検討いただけますと幸いです。代替の参考資料として、Captio終了の経緯をまとめた記事を [simplememofast.com/blog/captio-discontinued](https://simplememofast.com/blog/captio-discontinued?utm_source=outreach&utm_medium=email&utm_campaign=broken-link&utm_content=attnoel) にて公開しています（Captio / Tupil との提携関係はない、独立した第三者解説です）。

リンク差し替え・追記いずれの形でも構いません。お読みいただきありがとうございました。

AI Ataka
SimpleMemo 開発者 / 株式会社ユリカ
hajimeataka@gmail.com

---

## Pre-flight checklist (post-by-post)

For every P0:
- [ ] Open URL in browser
- [ ] Verify thread/article is still accessible and comments open
- [ ] Read recent activity to choose v1 / v2 / v3
- [ ] Customize 2-3 phrases to thread context (avoid template feel)
- [ ] Set 24h reminder to check for replies
- [ ] If post is removed within 1h, log reason in `docs/outreach-log.md` and adjust
- [ ] Record success metrics: upvotes, comments, GA4 utm_content clicks

## Risk assessment

- **P0-01, P0-02**: Low risk, comments-area open, evergreen
- **P0-03, P0-04**: Low risk, note.com is welcoming community
- **P0-05**: Medium risk, contact form may be filtered as spam → use v3 (broken-link only) if v1 is too long
