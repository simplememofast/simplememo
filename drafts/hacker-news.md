# Hacker News — Show HN

**Title:** Show HN: SimpleMemo -- Email yourself notes in 0.3s (UIKit, Cloudflare Workers, AES-GCM)

---

Captio was a single-purpose iOS app for emailing notes to yourself. It died a few years ago, likely because it depended on the Gmail API — Google kept tightening OAuth scopes and eventually it became untenable. I built SimpleMemo as a replacement that avoids the same fate by using standard SMTP.

**Architecture:** iPhone app (UIKit/Swift) → HTTPS POST → Cloudflare Worker (TypeScript) → Resend API (SMTP) → user's inbox. The Worker is a stateless relay: it receives the memo, forwards it via Resend with full DKIM/SPF/DMARC auth, and discards immediately. Zero server-side storage. Notes are AES-256-GCM encrypted at rest on-device until delivery is confirmed.

**Why UIKit over SwiftUI:** I measured cold launch times across 50 runs on an iPhone SE 3. UIKit averaged 0.30s, SwiftUI averaged 0.63s. The difference is SwiftUI's declarative diffing engine initializing — unavoidable overhead for a framework designed around reactive state. For most apps this doesn't matter. For an app whose entire value proposition is "ready before your thumb lifts off the icon," it's disqualifying.

**Why not Gmail API / MAPI / platform-specific mail APIs:** Captio's failure is the cautionary tale. SMTP is a 42-year-old protocol (RFC 821, 1982). It will outlive any vendor's proprietary API. If Resend shuts down, I swap the Worker's fetch call to SendGrid or Mailgun — a 15-minute migration with zero client-side changes.

The app does one thing: open, type, send. No folders, tags, formatting, or accounts. Offline notes queue in CoreData and flush on connectivity.

https://simplememofast.com

Source for the Cloudflare Worker relay: [INSERT GITHUB LINK IF OPEN-SOURCING]

---

## Posting Tips

**Timing:**
- Post Saturday or Sunday morning, 8-10 AM EST (when US tech crowd is browsing with coffee)
- Avoid posting on weekday mornings — Show HN gets buried under regular submissions

**Title format:**
- Must start with "Show HN:"
- Keep it factual and specific — HN readers click on technical specifics, not marketing claims
- Include the key technical differentiators in the title itself

**First 2 hours are critical:**
- Stay online and respond to EVERY comment within minutes
- HN ranks posts partly by comment velocity — more comments = more visibility
- Be genuinely helpful. If someone asks "why not just use Apple Shortcuts?" give a thorough technical answer, not a dismissive one

**Common HN objections to prepare for:**

1. *"Why not just use the Mail app?"* — Answer: 6 steps vs 2. Open Mail, compose, type your email, skip subject, type body, send. SimpleMemo: open, type, send. Also no offline support in Mail compose.

2. *"Why not SwiftUI?"* — Have the benchmark data ready. HN respects measurements over opinions. The 2.1x cold launch difference with methodology (50 runs, iPhone SE 3, measured from SpringBoard tap to first responder on UITextView).

3. *"AES-GCM is pointless if the email is plaintext"* — Good point. The encryption protects notes at rest in the local queue before they're sent. Once delivered, the email is as secure as any other email in the user's inbox. Be honest about the threat model.

4. *"What's your business model?"* — Be straightforward. If it's paid upfront, say so. If freemium, explain the tiers. HN hates evasive answers about monetization.

5. *"Just use Signal's Note to Self"* — Acknowledge it's a valid option for some people. Differentiate on speed (Signal takes ~1.5s to launch) and the fact that email integrates into existing workflows better than a chat app.

**Do NOT:**
- Use superlatives ("best," "amazing," "revolutionary")
- Mention SEO, marketing strategy, or growth metrics — HN finds this distasteful in Show HN posts
- Ask for upvotes anywhere, even in private messages
- Post from a brand-new account — use an account with some history

**Format:**
- Keep the post body short. HN readers prefer concise technical writing.
- Put the URL on its own line
- No bullet-point marketing lists in the post body — save that for comments when answering questions
