# Indie Hackers Post

**Title:** SimpleMemo: I built a Captio replacement on Cloudflare Workers — [INSERT MRR] MRR in [INSERT WEEKS] weeks

---

## The Problem

Captio was a beloved iPhone app that let you email notes to yourself instantly. One tap open, type, send. Thousands of people relied on it as their primary quick-capture tool. Then it shut down — likely because it depended on the Gmail API, which Google kept tightening restrictions on.

I was one of those users. When Captio died, I tried every alternative I could find: Apple Shortcuts (too slow), Drafts (too complex), manually emailing myself (too many steps). Nothing replicated the "open and type in under a second" experience.

So I built it.

## The Solution

**SimpleMemo** is a single-purpose iPhone app: email yourself a note as fast as possible.

- **0.3-second cold launch** — the keyboard is ready before your thumb lifts off the icon
- **One-tap send** — type your thought, hit send, done
- **Offline queue** — notes queue locally and send automatically when connectivity returns
- **AES-GCM encryption** — notes are encrypted at rest on-device until sent
- **Zero server storage** — the relay server never stores your memos

Website: https://simplememofast.com
App Store: [INSERT APP STORE LINK]

## Tech Stack

This is where it gets interesting for the IH crowd:

### iOS App — Swift + UIKit
- **UIKit, not SwiftUI.** I measured SwiftUI cold launch at 0.63s vs UIKit at 0.3s — a 2.1x difference. For an app where launch speed IS the product, that was a dealbreaker. SwiftUI adds overhead for its declarative diffing engine that you simply can't eliminate.
- **CoreData** for the offline queue. Notes persist locally with AES-256-GCM encryption until successfully delivered.
- **Minimal view hierarchy.** The entire UI is one UITextView, one UIButton, and a navigation bar. No tab bars, no collection views, no animations on launch.

### Backend — Cloudflare Workers + Resend API
- **Cloudflare Workers (TypeScript)** handles the email relay. Cold start is ~5ms at the edge. No traditional server to maintain, no EC2 bills that scale with users.
- **Resend API** for actual email delivery. This was a key decision — instead of depending on Gmail API (which killed Captio), I use standard SMTP relay via Resend. Full DKIM, SPF, and DMARC authentication so emails never hit spam.
- **Zero memo storage on server.** The Worker receives the encrypted memo, decrypts, relays to Resend, and discards. Nothing is logged or stored. This is both a privacy feature and an infrastructure simplification.

### Why This Architecture?

The critical lesson from Captio's death: **don't depend on a single provider's API for your core functionality.** Gmail API changes killed Captio. SimpleMemo uses standard SMTP — if Resend disappears tomorrow, I swap to SendGrid, Mailgun, or any other provider in 20 minutes. The protocol is the moat, not the vendor.

## Key Decisions and Why

**Why email-based instead of a note-taking app?**
Email is the one inbox everyone checks daily. Notes in dedicated apps (Keep, Bear, Apple Notes) tend to accumulate and get forgotten. Email forces you to process — it shows up alongside your other tasks and you deal with it or archive it.

**Why one feature instead of building out?**
Every feature I considered adding (folders, tags, rich text, attachments) would slow down the core experience. The app needs to be faster than the thought disappearing from your head. That's approximately 5 seconds. Every UI element I add eats into that budget.

**Why not just an Apple Shortcut?**
I tried. Shortcuts app takes 2-3 seconds to initialize, then the Mail compose sheet animates in. Total time to first keystroke: 4-5 seconds. SimpleMemo: 0.3 seconds. That difference matters when you're capturing fleeting thoughts.

## Marketing Strategy

No paid ads. Entirely content SEO and community:

- **50+ blog posts** targeting long-tail keywords ("Captio alternative," "email yourself app iPhone," "fastest memo app," etc.)
- **37 comparison pages** (SimpleMemo vs Drafts, vs Apple Notes, vs Google Keep, etc.)
- **Product Hunt launch** — [INSERT RESULT]
- **Reddit** — genuine participation in r/productivity, r/notetaking, r/iphone. Answering questions about quick capture workflows and mentioning SimpleMemo when relevant.
- **Japanese market** — full Japanese localization and Japanese-language blog content. Japan has strong "memo culture" and fewer competitors in this niche.

The SEO strategy has been the highest-ROI activity by far. Comparison pages and "alternative to X" posts capture people actively looking for a solution.

## Numbers

- **MRR:** [INSERT MRR]
- **Downloads:** [INSERT DOWNLOADS]
- **Monthly active users:** [INSERT MAU]
- **Conversion rate (free to paid):** [INSERT RATE]
- **Top traffic source:** [INSERT SOURCE]
- **Blog posts published:** 50+
- **Time to build v1:** [INSERT TIMELINE]

## Lessons Learned

1. **Speed is a feature, not an optimization.** Most apps treat performance as a nice-to-have. When speed is your entire value proposition, every architectural decision flows from it. UIKit over SwiftUI. Minimal view hierarchy. No splash screen. Preloaded keyboard.

2. **Solve one problem completely.** The temptation to add "just one more feature" is constant. But the moment SimpleMemo becomes a note-taking app instead of an email-yourself app, it competes with Bear, Notion, and Apple Notes. As a single-purpose tool, it has no real competition.

3. **Don't build on someone else's API without a migration plan.** Captio died because Gmail API was its single point of failure. SimpleMemo uses SMTP — a 40-year-old protocol that isn't going anywhere.

4. **Content SEO works, but it's slow.** The first 3 months of blog posts generated almost zero traffic. Month 4-5 is when Google started ranking pages. Patience is required.

5. **The Japanese market is underserved.** Localizing the app and content for Japan was relatively low effort but opened up a market with fewer competitors and strong cultural alignment (memo-taking is deeply embedded in Japanese work culture).

## What's Next

- Android version (evaluating Kotlin Multiplatform vs native)
- Widget for home screen quick capture
- Expanding content SEO to cover more comparison keywords
- Exploring partnerships with productivity newsletter authors

---

Happy to answer any questions about the tech stack, marketing approach, or the decision to build in such a narrow niche.

---

## Posting Notes

- **Platform:** Indie Hackers (indiehackers.com)
- **Category:** Product or Milestone post
- **Fill in placeholders** before posting: MRR, downloads, MAU, conversion rate, traffic source, timeline, App Store link, Product Hunt result
- **Engagement:** IH audience loves technical detail and honest numbers. Don't inflate metrics. If MRR is $50, say $50 — the community respects honesty over impressive numbers.
- **Follow-up:** Comment on 2-3 other IH posts the same week you publish. The community rewards active participants.
