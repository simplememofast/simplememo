# SimpleMemo — Email yourself notes in 0.3 seconds. The Captio successor.

## Tagline

The fastest way to email a note to yourself. Captio's spiritual successor.

## Description

**SimpleMemo sends notes to your email inbox in under a second.** No accounts, no sync, no folders. Just open, type, tap send.

We built SimpleMemo because Captio — the beloved memo-to-email app — disappeared from the App Store. Thousands of people relied on the "email yourself a note" workflow every day, and suddenly it was gone. We loved that workflow too much to let it die.

SimpleMemo launches in 0.3 seconds (cold start). We chose UIKit over SwiftUI because every millisecond matters for an app you open 10+ times a day. Notes are sent via Cloudflare Workers and Resend API, arriving in your inbox within 150ms.

**Privacy is not optional.** Every memo is encrypted with AES-GCM before transmission. Nothing is stored on our servers. No analytics, no tracking, no data collection.

**Works offline.** Memos are queued in a local outbox and sent automatically when connectivity returns. You never lose a note.

**Pricing:** Free tier (3 memos/day) or Premium at 500 yen/month for unlimited use.

## First Comment (from maker)

Hi PH! I used Captio every day for 10 years. When it disappeared from the App Store, I couldn't find anything as fast. So I built SimpleMemo.

The core idea is simple: open app -> type -> tap send -> memo arrives in your email inbox. That's it. No accounts, no sync, no folders.

I chose UIKit over SwiftUI because every millisecond matters for an app you open 10+ times a day. The result: 0.3 second cold start.

Would love your feedback! AMA about the tech stack, pricing, or the Captio legacy.

## Links

- Website: https://simplememofast.com/
- App Store: [App Store URL]

## Tags

- Productivity
- Note Taking
- iPhone
- Email

## Media

[Screenshots and demo video to be added]
