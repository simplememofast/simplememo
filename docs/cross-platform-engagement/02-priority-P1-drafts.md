# P1 Drafts — High-engagement evergreen contexts (15件)

**Action window**: 1-2 weeks, batch 3/week
**Format**: 1 detailed draft per context (use v1 from P0 patterns as template if needed)
**Pre-flight**: §0 of `README.md`

---

## P1-01 — r/productivity / l5k2xk — "Captio... Mind. Blown." storytelling

**URL**: https://www.reddit.com/r/productivity/comments/l5k2xk/my_strategy_to_combat_scatter_brain/
**Tone**: Storytelling match — OP describes friend showing them Captio at lunch
**Necro**: 2021 thread, low active engagement but Google traffic

### Draft

Had the same Mind-Blown moment with Captio in 2014. Used it daily for 10 years. When it shut down in October 2024 (Tupil's servers went dark, no announcement), I rebuilt it as SimpleMemo because nothing else captured that exact "tap, type, send" feel — Drafts is more powerful but slower at cold launch, Apple Notes adds 4-6 share-sheet taps. SimpleMemo: 0.3s launch, free 3/day, AES-GCM encryption since I figured if Captio could disappear, my data should be on-device-encrypted. Drafts is the better pick if you want extensibility; SimpleMemo if you want the original Captio feel.

*Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts). Built it after using Captio for 10 years myself.*

simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=organic&utm_campaign=captio-engagement&utm_content=l5k2xk

---

## P1-02 — r/productivity / acsznt — Captio + IFTTT + Gmail workflow

**URL**: https://www.reddit.com/r/productivity/comments/acsznt/a_spreadsheet_as_a_to_do_app_share_your_setup/
**Tone**: Workflow continuity — OP shared a Captio + IFTTT + Gmail filter pipeline

### Draft

For anyone running this exact pipeline in 2026: Captio was removed from the App Store in October 2024 — but the workflow itself still works. Any of [SimpleMemo / Drafts / Pigeon / Email Me] sends through standard SMTP, so the Gmail label / IFTTT side of the pattern is untouched. SimpleMemo specifically has a free 3/day tier and the same "open, type, send" feel; Drafts has native action automation if you want to skip IFTTT entirely.

*Disclosure: I'm the developer of SimpleMemo, the spiritual successor to Captio. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts).*

simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=organic&utm_campaign=captio-engagement&utm_content=acsznt

---

## P1-03 — r/shortcuts / 9zr0vs — iOS Shortcuts action list with Captio

**URL**: https://www.reddit.com/r/shortcuts/comments/9zr0vs/all_actions_in_the_shortcuts_app_redditors_use/

### Draft

Quick note for anyone updating this list in 2026: Captio was removed from the App Store in October 2024, so Captio's iOS Shortcut actions ("Append to Note", "Send Note") no longer work. SimpleMemo (a Captio successor) supports the same action types; Drafts has the most extensive Shortcuts integration of any modern note-to-self app.

*Disclosure: I'm the developer of SimpleMemo. Not affiliated with the original Captio team (Tupil B.V. / Ben Lenarts).*

---

## P1-04 — r/ADHD_Programmers / hwhqujd

**URL**: https://www.reddit.com/r/ADHD_Programmers/comments/spshw0/i_made_a_program_in_python_that_helps_me_save_my/hwhqujd/
**Comment context**: "I use Captio for something sorta similar on iOS. It's just a blank text pad with a send button"

### Draft

Heads up — Captio was removed from the App Store in October 2024 (Tupil's servers went dark). The "blank text pad with send button" pattern is one of the most ADHD-friendly capture flows, so it's worth keeping alive. SimpleMemo is the closest behavioral match (0.3s launch, no menus, send button auto-clears), Drafts is more flexible if you want to script what happens to captured text. Both keep the friction-free input that matters most for ADHD.

*Disclosure: I'm the developer of SimpleMemo, a spiritual successor to Captio. Not affiliated with Tupil B.V. or Ben Lenarts.*

---

## P1-05 — r/gtd / gbxsqkb — GTD inbox capture

**URL**: https://www.reddit.com/r/gtd/comments/jrorg2/looking_for_a_gtd_app_recommendation/gbxsqkb/

### Draft

Same — Captio was perfect for the GTD Capture phase. Heads up for future readers: Captio was removed from the App Store in October 2024. After the shutdown, the closest GTD-Capture replacements are: SimpleMemo (0.3s launch, 1-tap send, free 3/day), Drafts (action-based, more powerful but slower), and Braintoss (text + audio + photos to email). SimpleMemo is the closest behavioral match; Drafts is the better pick for action automation.

*Disclosure: I'm the developer of SimpleMemo. Not affiliated with the Captio team (Tupil B.V. / Ben Lenarts).*

simplememofast.com/captio-alternative/?utm_source=reddit&utm_medium=organic&utm_campaign=captio-engagement&utm_content=gbxsqkb

---

## P1-06, P1-07, P1-08 — HackerNews threads

**URLs**: See `data/exports/reddit_captio_only_ranked.csv` rows where subreddit=hackernews
**HN tone**: brief, technical, no upsell, focus on engineering substance

### Draft (template for all 3 HN threads)

Quick note: Captio was removed from the App Store in October 2024 (Tupil quietly shut down servers, no announcement). The architectural lesson — Gmail API as the only sending path + one-time-purchase model with no recurring revenue to fund OAuth compliance — was what eventually killed it. Modern alternatives that avoid both failure modes use independent SMTP/email-API infra (Cloudflare Workers + Resend API in SimpleMemo's case) and recurring pricing to fund ongoing security/compliance.

*Disclosure: I'm the developer of SimpleMemo, the Captio successor. Not affiliated with Tupil B.V. or Ben Lenarts.*

---

## P1-09 — MacStories — Captio Lets You Email Tasks To Yourself With 1 Tap

**URL**: https://www.macstories.net/iphone/captio-lets-you-email-tasks-to-yourself-with-1-tap/
**Method**: email tips@macstories.net (combined with P1-10 — both reviews)

### Draft email (English)

Subject: Editor's note request — your two Captio reviews (2010, 2012) reference a shut-down app

Federico / MacStories team,

Long-time MacStories reader writing because both of your Captio reviews — the original 2010 piece (`captio-lets-you-email-tasks-to-yourself-with-1-tap`) and the 2012 v2.0 review (`captio-2-0-released-adds-ipad-version`) — link to captio.co and the App Store listing for an app that was removed from the App Store in October 2024 (Tupil quietly shut down servers; no developer statement).

For readers who land on these reviews from search, an editor's note pointing to the shutdown story would prevent dead-end clicks. If useful, my full write-up of the shutdown is at simplememofast.com/blog/captio-discontinued (independent third-party reporting; I'm not affiliated with Tupil).

For full disclosure: I built SimpleMemo (simplememofast.com/captio-alternative/) as the spiritual successor after using Captio daily from 2014 to 2024. Not asking for inclusion — just flagging the broken links.

AI Ataka
Developer of SimpleMemo
simplememofast.com
hajimeataka@gmail.com

---

## P1-10 — MacStories — Captio 2.0 Released

**URL**: https://www.macstories.net/reviews/captio-2-0-released-adds-ipad-version/
**Method**: covered by P1-09 (single email mentions both)

---

## P1-11 — Engadget — "Captio: The simple app that just might change your life"

**URL**: https://www.engadget.com/2010-09-30-captio-the-simple-app-that-just-might-change-your-life.html
**Method**: email tips@engadget.com

### Draft email

Subject: Broken link: 2010 Captio review references a shut-down app

Engadget editorial,

Your 2010 Captio review (`captio-the-simple-app-that-just-might-change-your-life`) links to captio.co and the App Store. Captio was removed from the App Store in October 2024 — Tupil shut down servers without an announcement, and the article's claims (in the present tense) no longer match reality.

A short editor's note dating the article and pointing to the shutdown context would help readers landing on the page from search. Source for the shutdown: simplememofast.com/blog/captio-discontinued (third-party reporting, not affiliated with Tupil).

Disclosure: I built SimpleMemo as the Captio successor (simplememofast.com/captio-alternative/) after using Captio daily for 10 years. This is a broken-link notification, not a placement request.

AI Ataka
Developer of SimpleMemo
simplememofast.com

---

## P1-12 — MakeUseOf — "5 Alternative Note Apps For iOS Devices"

**URL**: https://www.makeuseof.com/tag/open-write-and-send-5-alternative-note-apps-for-ios-devices/
**Method**: email editors@makeuseof.com

### Draft email

Subject: Update suggestion: your "5 Alternative Note Apps for iOS" article

MakeUseOf editorial,

Your roundup of "5 Alternative Note Apps for iOS" (`open-write-and-send-5-alternative-note-apps-for-ios-devices`) includes Captio, which was removed from the App Store in October 2024 (Tupil shut down servers; no announcement).

For readers, swapping the Captio entry for an active equivalent or adding a 2026 update note would keep the article current. Three modern alternatives that fit the same "open / write / send" niche:

- **SimpleMemo** — direct Captio successor (0.3s launch, AES-GCM encryption, offline Outbox, free 3/day)
- **Pigeon** — free Captio-style alternative
- **Drafts** — most powerful, action-based

Disclosure: I built SimpleMemo after using Captio for 10 years. Not asking specifically for SimpleMemo inclusion — happy if you pick any of the three. If you want references for each: full comparison at simplememofast.com/en/blog/best-note-to-self-apps-2026/.

AI Ataka
Developer of SimpleMemo
simplememofast.com
hajimeataka@gmail.com

---

## P1-13 — teineini.net — "メールを送信するだけのシンプルなアプリ「captio」"

**URL**: https://teineini.net/20190312-captio/
**Method**: お問い合わせフォーム
**Already in**: broken-link doc as Target 12

### Draft (日本語・お問い合わせフォーム)

件名: 記事「captioは職場の自分への備忘連絡に最適」のリンク切れご連絡と後継アプリのご紹介

いつもていねいに 様

過去記事「captio は職場の自分への備忘連絡に最適」を拝読しました。Captioが2024年10月にApp Storeから削除＋サーバー停止となったため、記事内の captio.co および App Store リンクが現在機能していない状況です。

ユーザーの利便性のため、当該リンクに「2024年10月終了」の追記、または後継アプリの併記をご検討いただけませんでしょうか。

参考までに、私はCaptio利用歴10年（2014〜2024）のiOS開発者で、Captio終了直後に後継アプリ「Captio式シンプルメモ」を株式会社ユリカ名義でリリースしています（PR TIMES, ITmediaに掲載）。Captioが弱かった3点（起動速度・暗号化・オフライン）を補強した設計です。詳細は [simplememofast.com/captio-alternative/](https://simplememofast.com/captio-alternative/?utm_source=outreach&utm_medium=email&utm_campaign=captio-engagement&utm_content=teineini)。

なお本サービスはCaptio (Tupil B.V. / Ben Lenarts氏) と一切の提携関係はありません。「Captio式」は操作思想を引き継ぐ表現です。

ご検討のほど、よろしくお願いいたします。

AI Ataka
SimpleMemo 開発者
株式会社ユリカ（YURIKA, K.K.）
simplememofast.com / hajimeataka@gmail.com

---

## P1-14 — webcli.jp — "ワンタッチですぐにメール送信ができる｢Captio｣"

**URL**: https://webcli.jp/topics/captio/
**Method**: お問い合わせフォーム
**Already in**: broken-link doc as Target 13

### Draft (日本語・短縮版)

件名: 「Captio」記事のリンク切れご連絡

WebCli 様

「ワンタッチですぐにメール送信ができる｢Captio｣」記事のリンクが、Captioの2024年10月終了（App Store削除＋サーバー停止）により切れています。読者様の利便性のため、追記または後継アプリ併記をご検討ください。

参考: Captio利用10年のiOS開発者として後継アプリ「シンプルメモ」をリリースしました。Captioが弱かった起動速度・暗号化・オフライン対応の3点を補強した設計です。  
[simplememofast.com/captio-alternative/](https://simplememofast.com/captio-alternative/?utm_source=outreach&utm_medium=email&utm_campaign=captio-engagement&utm_content=webcli)

Captio (Tupil B.V.) との提携関係はなく、独立した代替アプリの選択肢として。

AI Ataka / SimpleMemo 開発者
株式会社ユリカ
hajimeataka@gmail.com

---

## P1-15 — 男子ハック (danshihack.com) — "シンプルゆえに神アプリ「Captio」"

**URL**: https://www.danshihack.com/2015/07/15/junp/iphoneapp-captio.html
**Method**: お問い合わせフォーム or X DM (@junp_n)

### Draft (X DM・日本語・短い)

@JUNP_N さん、男子ハックの2015年Captio記事拝見しました。Captioが2024年10月にApp Storeから完全削除＋サーバー停止しており、記事内リンクが機能しない状態です。

参考までに、Captioを10年使っていたiOS開発者として後継アプリ「Captio式シンプルメモ」を作りました（PR TIMES掲載、Captio / Tupil との提携関係はなし）。記事への追記や別記事化のご検討材料として、よろしければ：

simplememofast.com/captio-alternative — AI Ataka / SimpleMemo developer

### Draft (お問い合わせフォーム・長め日本語)

件名: 記事「シンプルゆえに神アプリ「Captio」」のリンク切れご連絡

男子ハック JUNP_N 様

2015年の記事「シンプルゆえに神アプリ！自分宛てのメールをサッと送るのに超便利な「Captio」」を拝読しました。記事中のCaptio公式サイト・App Storeへのリンクが、2024年10月のCaptio終了（App Store削除＋サーバー停止）により機能しない状態です。

私はCaptio利用歴10年（2014-2024）のiOS開発者で、終了直後に後継アプリ「Captio式シンプルメモ」を株式会社ユリカ名義でリリースしました（PR TIMES / ITmedia 掲載）。当該記事への「2024年10月終了」追記、もしくは後継アプリへの言及をご検討いただければ幸いです。

詳細・比較表: [simplememofast.com/captio-alternative/](https://simplememofast.com/captio-alternative/?utm_source=outreach&utm_medium=email&utm_campaign=captio-engagement&utm_content=danshihack)
Captio終了の経緯記事: simplememofast.com/blog/captio-discontinued

なお Captio (Tupil B.V. / Ben Lenarts氏) との提携・後援関係はございません。「Captio式」は操作思想の継承を表す表現です。

ご検討よろしくお願いいたします。

AI Ataka
SimpleMemo 開発者 / 株式会社ユリカ
hajimeataka@gmail.com

---

## Pre-flight check (P1 batch)

- [ ] Each P1 entry: open URL, verify link is open / accessible
- [ ] If thread/article is closed/archived: mark as P3 (monitor only) and move on
- [ ] If recently updated: re-read context, customize 2-3 phrases
- [ ] All Japanese drafts: keep tone polite-but-direct (敬語+丁寧)
- [ ] All English drafts: keep tone factual, low-promo
- [ ] Maintain 1 link per draft, UTM applied
- [ ] Log every send in `docs/outreach-log.md`
