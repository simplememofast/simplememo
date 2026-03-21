# Reddit r/iOSProgramming Post

**Title:** Why I chose UIKit over SwiftUI in 2026 — and got 0.3s cold start

---

I know, I know — "UIKit in 2026?" Hear me out.

I'm building a memo app called SimpleMemo where launch speed is literally the #1 KPI. The entire UX is: open app, keyboard is ready, type, send. If the app takes more than half a second to become interactive, the experience fails. A thought captured in 0.3 seconds is a thought saved. A thought delayed by 0.8 seconds is often a thought lost.

So I benchmarked both frameworks extensively on real devices (iPhone 13 through iPhone 16 Pro). Here's what I found:

**Cold start benchmarks (time to interactive, keyboard visible):**
- UIKit (programmatic, no Storyboard): **180–250ms**
- SwiftUI (equivalent minimal view): **400–600ms**

That's not a small gap. It's the difference between "instant" and "noticeable delay."

**Key optimizations that got me to 0.3s:**

1. **No Storyboard.** Window and root view controller created programmatically in `application(_:didFinishLaunchingWithOptions:)`. Storyboard parsing adds 30–50ms you don't need.

2. **Minimal view hierarchy.** One UITextView, one UIButton, one status label. That's the entire screen. Every subview you add costs time.

3. **`becomeFirstResponder()` in `viewDidAppear`.** Not `viewDidLoad`, not `viewWillAppear`. Calling it too early fights the system's layout pass and can actually delay keyboard appearance.

4. **Deferred non-critical work.** Network reachability checks, offline queue processing, analytics — all dispatched async after the first frame renders. The user sees a ready-to-type screen before any of that runs.

5. **No third-party dependencies at launch.** Zero pods/SPM packages in the critical path. Every framework you load at launch eats into your budget.

**The architecture behind the scenes:**

I use what I call an "Outbox pattern" — memos are saved locally first (always), then a background process drains the queue and sends them via API. This means the send button returns instantly regardless of network state. If you're offline, memos queue up and send when connectivity returns. The user never waits, never sees a spinner, never loses a note.

**My take on SwiftUI vs UIKit in 2026:**

SwiftUI is fantastic for most apps. If you're building anything with complex navigation, lists, forms, animations — SwiftUI will save you massive amounts of time and code. I use it in other projects.

But when your entire product promise is "ready before you can blink," UIKit still has a measurable edge. The framework's maturity means less runtime work at launch. No body re-evaluation, no view diffing, no property wrapper initialization overhead.

I wrote up the full technical deep-dive with profiling data on Zenn: [https://zenn.dev/simplememo/articles/f7b808c2e129eb](https://zenn.dev/simplememo/articles/f7b808c2e129eb)

The app itself: [https://simplememofast.com/](https://simplememofast.com/)

Open to feedback on the approach. Anyone else optimizing for sub-second launch times? Curious what techniques others have found effective.
