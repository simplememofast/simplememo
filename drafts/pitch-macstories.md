# Pitch: MacStories

**To:** Federico Viticci / MacStories Editorial
**Subject:** iOS Quick Capture Done Right: 0.3s Launch, AES-GCM, Zero Storage -- A UIKit Performance Case Study

---

Hi Federico,

I'm writing because I built something I think you'd find technically interesting: an iOS quick-capture app that launches and sends an email memo in 0.3 seconds flat, with no compromises on security.

The app is called SimpleMemo, and it's a spiritual successor to Captio -- but rebuilt from scratch with a focus on performance that I haven't seen in any other iOS capture tool.

## What Makes It Technically Interesting

**UIKit performance optimization, not SwiftUI.** The entire UI stack is hand-tuned UIKit. No storyboards, minimal view hierarchy, pre-warmed text fields. The goal was sub-500ms from cold launch to cursor-in-text-field, and we hit 0.3s consistently on iPhone 12 and newer.

**Zero-storage architecture.** Nothing persists on-device after a successful send. There's no local database, no Core Data stack, no sync engine. The app is stateless by design -- your inbox is your storage layer.

**AES-GCM encryption on-device.** Drafts are encrypted with AES-GCM before they leave the device. This isn't just TLS-in-transit -- the payload itself is encrypted, so even if someone intercepts the SMTP transaction, the content is protected.

**Offline queue with automatic retry.** When offline, notes are encrypted and queued locally, then sent in order when connectivity returns. The queue survives app termination.

## Benchmark Comparison

| App | Cold Launch to Input | Send Complete |
|-----|---------------------|---------------|
| SimpleMemo | 0.3s | 0.8s |
| Apple Notes (new note) | 1.2s | N/A (local) |
| Apple Mail (compose) | 2.1s | 2.8s |
| Drafts 5 (capture) | 0.9s | varies by action |

Tested on iPhone 15 Pro, iOS 17.4, averaged over 10 runs each.

## Why I'm Reaching Out to MacStories Specifically

Your coverage has always appreciated the craft behind iOS apps -- the difference between "it works" and "it works *fast*." SimpleMemo is a single-purpose app that treats performance as a feature, not an afterthought. I think it fits the kind of app you and your readers appreciate: opinionated, focused, and well-built.

## What I Can Offer

- **TestFlight access** to any pre-release builds
- **Promo codes** for the App Store
- **Full benchmark methodology** and raw data
- **Technical deep-dive** on the UIKit optimizations if you're interested in an interview or breakdown
- **Screenshots and app icon assets** in any resolution

**App Store:** [SimpleMemo](https://apps.apple.com/app/id6504311814)
**Website:** https://simplememofast.com/

No pressure at all -- just wanted this on your radar. Thanks for everything you do with MacStories.

Best,
[Your Name]
Developer, SimpleMemo
