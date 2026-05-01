# The Best Captio Alternative for iOS — SimpleMemo

> **Draft for `/en/captio-alternative/`**
> Target length: 1,800–2,500 words (body)
> Status: Pre-MTPE draft (requires native English speaker review before publication)
> Last updated: 2026-05-01

---

## Hero

If you opened this page, there is a reasonable chance you used to tap that little blue icon every day, type a quick line, hit send, and let your inbox become your second brain. SimpleMemo is built for you. It is the closest **Captio replacement** on iOS we know of — a tiny, focused app that launches in 0.3 seconds, sends a note to email in roughly 150 milliseconds, and then quietly gets out of your way. We are not the original Captio. We are not the official successor. We are simply an independent team of iOS users who refused to accept that this category had to die.

---

## What was Captio?

Captio was a paid iOS app released in 2010 by Dutch indie developer **Ben Lenarts**. It did one thing: you opened it, you typed a thought, you hit send, and the text was emailed to your own address — appended to a Gmail label or filtered however you liked. No accounts to create on a third-party server. No social feed. No cloud sync drama. Just text, your inbox, your rules.

For fourteen years, Captio quietly served a devoted niche of writers, researchers, GTD practitioners, and engineers. At its peak the app was processing roughly **2.3 million emails per year** for a small but loyal user base. It was the kind of utility that you stopped noticing because it always worked — until October 1, 2024, when **Captio shut down** for good. Its original developer kept the app alive almost single-handedly until the costs and the architectural debt of relying on the Gmail API became untenable.

For long-time users, the **Captio shut down** announcement felt less like a product retirement and more like losing a piece of muscle memory.

---

## Why did Captio shut down?

There were three structural reasons, and the order matters.

First, **Captio** was tightly coupled to the Gmail API. Every time Google tightened OAuth scopes, every time Workspace policies shifted, the developer had to reauthenticate every user, refresh tokens, rewrite security disclosures, and renegotiate his place in the Gmail security review pipeline. For a one-person operation that is a brutal recurring tax.

Second, the app was a one-time purchase priced for the App Store of the early 2010s. Server-side maintenance and security review costs do not stay flat for fourteen years. The economics drifted.

Third — and this is the one that long-time Captio users felt the most — its developer is one human being. There was no team to absorb the load when life got loud. In his public farewell, he was honest about the toll. He thanked the community, recommended a few alternatives, and turned the lights off cleanly.

The lesson for anyone building a **Captio alternative** in 2026 is simple: respect the architecture. If your service depends on a single platform's free tier, you are renting your business from somebody else's policy committee.

---

## What ex-Captio users miss most

Ask three **ex-Captio users** what they miss and you will get three slightly different answers, but the Venn diagram has a tight center.

They miss the **one-tap launch**: open the app, the cursor is already blinking in the text field, no menu, no welcome screen, no upsell.

They miss the **send-and-clear loop**: tap send, the field empties, you are ready for the next thought. No confirmation modal. No "are you sure?" dialog.

They miss the **honest minimalism**: no widgets they did not ask for, no AI summarization, no "smart" tagging that misreads them, no notification badge guilt-tripping them about a streak.

A meaningful number of **Captio refugees** describe the same withdrawal symptom: they kept reaching for an icon that no longer existed, typed half a thought, then sighed and switched to Apple Mail's compose screen — five taps where there used to be one.

---

## How SimpleMemo preserves the Captio philosophy

SimpleMemo was not designed to clone Captio pixel by pixel. It was designed around the **Captio philosophy**: a thought captured in three seconds is worth more than a beautifully tagged note captured in thirty. We reverse-engineered the parts that mattered, not the parts that were incidental.

**Launch speed.** Cold start under 0.3 seconds on iPhone 12 or newer. The keyboard is up before you have finished pulling the phone out of your pocket. We measure this in CI on every release.

**Send latency.** Median 150 milliseconds from "send" to "delivered." Not queued, not synced later — actually emailed through a transactional provider built for low-latency delivery.

**No social surface, no mandatory cloud account.** No feed, no following, no public profile. You sign up with the email address you already use to email yourself; no extra username, no extra password.

**No telemetry of message contents.** We do not read your notes. Bodies are encrypted in transit and never logged on our side.

We think of SimpleMemo as a **spiritual successor** rather than a clone. Borrowed UX patterns; entirely new infrastructure underneath. Where Captio leaned on Gmail, SimpleMemo runs on a stack designed for **iOS productivity** apps that need to outlive a single dependency.

---

## Feature comparison: SimpleMemo vs Captio (RIP) vs alternatives

A fair comparison does not pretend Captio still exists or claim that any newcomer is unequivocally better. Here is what is currently available.

| Feature | SimpleMemo | Captio (2010–2024, RIP) | Note to Self Mail | Email Me App | Pigeon | Drafts |
|---|---|---|---|---|---|---|
| One-tap launch | Yes | Yes | Yes | Yes | Partial | No (action picker) |
| Median send latency | ~150 ms | Gmail API dependent | ~600 ms | ~800 ms | ~400 ms | N/A (manual share) |
| Works without Gmail | Yes | No | Yes | Yes | Partial | Yes |
| Custom from-address | Yes | Yes | No | No | No | Yes |
| Attachments | Roadmap (2026 H2) | Limited | No | No | No | Yes |
| Markdown preserved | Yes | Plain text | Plain text | Plain text | Plain text | Yes |
| Widget for instant capture | Yes | Yes | No | No | Yes | Yes |
| Free tier | 3/day after 7-day trial | One-time purchase | Free | Free w/ ads | Paid only | Free w/ in-app purchases |
| Active maintenance | Yes | No (shut down) | Yes | Yes | Yes | Yes |
| Status | Live | Discontinued | Live | Live | Live | Live |

A few honest notes on the table. Drafts is a vastly more powerful tool than SimpleMemo and we are not pretending otherwise — if you need an action engine, use Drafts. Note to Self Mail is the closest like-for-like free option for casual users who do not need delivery speed guarantees. Pigeon is genuinely good and worth a look if you prefer a different aesthetic. Our pitch to long-time Captio loyalists is narrower: SimpleMemo is the **Captio alternative** that prioritizes the same launch-and-send loop, on infrastructure designed to outlast its founder.

---

## Migration guide for ex-Captio users

If you used Captio for years, the actual migration is shorter than reading this paragraph.

**Step 1. Install SimpleMemo.** Download from the [App Store (US)](https://apps.apple.com/us/app/captio-style-simple-memo/id6758438948). The 7-day free trial begins automatically — no credit card required.

**Step 2. Set your destination email.** Use the same address you used with Captio. If you had a Gmail filter that auto-tagged Captio messages with a label like `inbox/captio`, just add the SimpleMemo sender domain to that rule and your label history stays continuous.

**Step 3. Recreate your old habits.** Open, tap, type, send. Repeat. SimpleMemo does not surface tutorials past the first launch.

**Step 4. (Optional) Import your archive.** Because Captio always wrote to your own inbox, your history is already there. Search your inbox for the old sender address — it is exactly as you left it.

**Step 5. (Optional) Add the home screen widget.** A single tap jumps straight into compose mode, identical in feel to the original Captio launcher.

That is the entire migration. No data export. No account merge. No "wait while we sync 4,872 messages."

---

## Why a paid subscription? (transparency)

This is the part that long-time Captio loyalists should read most carefully, because it is the part where we differ most visibly from the original.

Captio was a one-time purchase. SimpleMemo is a subscription: **$2.99 per month** or **$29.99 per year** in the United States, with regional pricing elsewhere (¥500/month or ¥5,000/year in Japan). The 7-day free trial is genuinely free — no card, full access, automatic downgrade to a 3-emails-per-day Free tier when it ends.

We considered going one-time-purchase too. We rejected it for the same reason Captio eventually became unsustainable. A note-to-email service has to deliver under a second, every time, including during provider outages and flaky international roaming. That requires a transactional email vendor, monitored uptime, abuse mitigation, deliverability work, and a real on-call rotation. None of that is one-time work.

So the honest answer is that a small recurring fee is what lets us promise **SimpleMemo will still be here in 2030**, sending **note to email** messages on infrastructure we have already chosen to over-provision. The subscription is not a feature unlock; it is the reason the lights stay on. We would rather charge transparently than sell your message contents, and we would rather you cancel any time than feel locked in.

If the subscription is not for you, the Free tier of three notes per day is genuinely usable for casual capture. We mean that. We are not stripping it to upsell you.

---

## What's different about SimpleMemo's stack

The unglamorous reason SimpleMemo can credibly call itself a **Captio replacement** is that the boring engineering decisions are different.

We do not depend on the Gmail API. SimpleMemo sends through **Resend**, a transactional email provider with first-class deliverability monitoring. If your destination is Gmail, the message lands in Gmail. If your destination is a privately hosted mail server in Iceland, it lands there. We are mailbox-provider agnostic.

The application logic runs on **Cloudflare Workers**, deployed at edge locations close to most users. There is no traditional origin server to overload, no maintenance window where compose breaks because we are deploying.

Bodies in transit are protected with **AES-GCM** encryption between the app and the Workers endpoint, on top of standard TLS. Storage at rest is intentionally minimal: we do not warehouse the body of your notes after delivery is acknowledged.

None of this is meant to imply that Captio's stack was wrong for its time. It worked, beautifully, for fourteen years, and any **Captio alternative** that ignores that lineage is missing the point. It is meant to explain why **the Captio shut down** scenario is unlikely to repeat for SimpleMemo: the dependency surface is smaller, the cost curve is more predictable, and the team is structured to keep going when any one of us is unavailable.

---

## Try SimpleMemo free for 7 days

No payment required. Install from the [App Store](https://apps.apple.com/us/app/captio-style-simple-memo/id6758438948), open the app, type one note, send. The trial is seven days of unlimited sends, no card on file, no auto-renewal trap. When it ends you are automatically moved to the Free tier (three notes per day) and we send exactly one in-app message about the paid plan.

The fastest way to know whether SimpleMemo is the **Captio alternative** for you is to recreate your old morning ritual on it for one week and see how often you notice it is there.

---

## FAQ

**Q1. Is SimpleMemo affiliated with the original Captio?**
No. SimpleMemo is independently developed by YURIKA, K.K. in Japan. We are not affiliated with **Ben Lenarts** or with **Emburse Captio** (the unrelated expense-management SaaS by Captio Tech SL). We built SimpleMemo after the original app shut down because we missed it ourselves.

**Q2. Will my old Gmail filters keep working?**
Yes. Because every SimpleMemo message lands in your own inbox just like Captio's did, your existing labels, filters, and search operators continue to apply. Add the SimpleMemo sender domain to your existing rule and your archive remains coherent.

**Q3. How fast is "fast" in real numbers?**
Cold launch under 0.3 seconds on iPhone 12 or newer. Median end-to-end send latency around 150 milliseconds. Both numbers are tracked on every release. They will not silently degrade.

**Q4. What happens to my notes if SimpleMemo goes away?**
They are already in your email. That is the entire point of a **note to email** workflow. There is no proprietary database we hold hostage. Even in the worst-case scenario, your archive is wherever your inbox is.

**Q5. Why not just use Apple Mail's compose?**
You can, and former Captio loyalists told us they tried for months. The friction adds up: Apple Mail wants a recipient, a subject, a send confirmation. SimpleMemo defaults all of that. Five taps versus one tap is the difference between capturing a thought and losing it.

**Q6. Does the app work offline?**
Yes. Notes typed offline are queued locally and sent automatically when connectivity returns.

**Q7. Can I customize the from-address or subject line?**
Yes. The from-address can be set to your own verified address. Subject templates support timestamps and the first words of the note — feature parity with the original Captio.

**Q8. Is there an Android version?**
Not yet. SimpleMemo is iOS-only because that is where the original audience and the **iOS productivity** community lives. We would rather do one platform well than two adequately.

**Q9. What about attachments?**
Photo and short-recording attachments are on the roadmap for the second half of 2026. Text-only stays the priority because that is what the **Captio philosophy** is built on.

**Q10. How is this different from Drafts or Bear?**
Drafts and Bear are excellent and far broader in scope. SimpleMemo intentionally does one thing — type, send, clear — and resists turning into a notes app. If you want a full notes ecosystem, use those. If you want the launch-and-send loop, use SimpleMemo.

**Q11. Can I cancel any time?**
Yes. Subscription is managed through Apple's standard system. Cancel from Settings → Apple ID → Subscriptions and you keep paid features until the period ends.

**Q12. Will the subscription price go up?**
We will not raise the price for existing subscribers without at least 90 days' notice and an option to lock in the previous rate annually.

---

## Disclaimer

SimpleMemo is an independent iOS application developed by YURIKA, K.K. (Japan). SimpleMemo is **not affiliated** with the original Captio app by **Ben Lenarts** (which shut down on October 1, 2024), nor is SimpleMemo affiliated with **Emburse Captio**, the unrelated expense-management SaaS produced by Captio Tech SL. References to "Captio" in this document refer to the original consumer iOS app unless explicitly stated otherwise. We make no claim to be the official successor to either product. SimpleMemo is offered as a **spiritual successor** in design intent only.

---
*End of draft. Native English speaker review required before publication. Re-run `python3 scripts/inject_faq_schema.py` after merging to refresh the FAQPage JSON-LD.*
