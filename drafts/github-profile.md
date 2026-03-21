# GitHub Profile README & Repo Suggestions

---

## Suggested Profile README (for github.com/simplememo or personal profile)

```markdown
### Hi, I'm the developer behind SimpleMemo

I build tools that do one thing well.

**SimpleMemo** — the fastest way to email yourself a note from your iPhone.
Open. Type. Send. 0.3 seconds to ready.

[simplememofast.com](https://simplememofast.com/) | [App Store](https://apps.apple.com/app/simplememo)

#### Tech Stack

![Swift](https://img.shields.io/badge/Swift-F05138?style=flat-square&logo=swift&logoColor=white)
![UIKit](https://img.shields.io/badge/UIKit-2396F3?style=flat-square&logo=apple&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)

#### Philosophy

- Speed over features
- Email as the universal inbox
- Zero server-side memo storage
- AES-256-GCM end-to-end encryption

#### Writing

- [Why I chose UIKit over SwiftUI in 2026](https://zenn.dev/simplememo/articles/f7b808c2e129eb) — Launch speed benchmarks and optimization techniques
```

---

## Suggested Public Repo 1: `simplememo-benchmark`

**Description:** iOS cold start benchmark scripts — measuring UIKit vs SwiftUI launch times on real devices.

**Purpose:** Positions you as a performance-focused developer. Drives organic search traffic for "iOS cold start optimization" and "UIKit vs SwiftUI performance." Links back to SimpleMemo as a real-world example.

**Suggested contents:**
- `README.md` — methodology, results table, device list
- `measure_cold_start.sh` — script using `xcrun simctl` to automate cold start measurements
- `results/` — CSV files with benchmark data across device models and OS versions
- `METHODOLOGY.md` — how measurements were taken, what counts as "interactive"
- Link to SimpleMemo in README: "These benchmarks informed the architecture of [SimpleMemo](https://simplememofast.com/), a memo-to-email app optimized for sub-300ms launch."

**Repo metadata:**
- Topics: `ios`, `performance`, `uikit`, `swiftui`, `benchmark`, `cold-start`, `launch-time`
- License: MIT

---

## Suggested Public Repo 2: `captio-migration-guide`

**Description:** For former Captio users — how to keep the "email yourself" workflow alive.

**Purpose:** Captures search traffic from people looking for Captio alternatives. Establishes credibility by acknowledging the original app. Funnels users to SimpleMemo.

**Suggested contents:**
- `README.md` — "What was Captio?", "Why did it disappear?", "Alternatives in 2026"
  - List 3-4 alternatives fairly (Drafts, Apple Shortcuts, etc.)
  - Position SimpleMemo as the closest spiritual successor
- `shortcuts/` — Apple Shortcuts `.shortcut` files for basic email-yourself workflows (for users who want a free DIY option — builds goodwill)
- `comparison.md` — feature comparison table: Captio vs SimpleMemo vs Drafts vs Shortcuts

**Repo metadata:**
- Topics: `captio`, `ios`, `productivity`, `email`, `memo`, `note-taking`
- License: MIT

---

## Which repo to create first?

**Recommendation: `simplememo-benchmark`**

- Higher SEO value (developers actively searching for iOS performance content)
- More shareable on Reddit r/iOSProgramming, Hacker News
- Demonstrates technical depth
- Natural cross-promotion with the Zenn article and Reddit post
- The `captio-migration-guide` can come later when you want to target end-user search traffic
