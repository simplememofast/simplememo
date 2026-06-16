# Action Plan — SEO Re-Audit 2026-06-16

Score: **92/100**. No penalties, no regressions. Almost all fixes below are copy-paste bugs on recently-shipped pages — surgical, low-risk corrections.

## Critical
_None._

## High (fix this week) — all ship together in one PR

| # | Issue | File | Fix |
|---|-------|------|-----|
| H1 | Mobile horizontal scroll (179px) from unwrapped wide table | `en/blog/ios26-speechanalyzer-live-mic.html:223` | `.article-body table{display:block;overflow-x:auto}` |
| H2 | Rating contradiction "4.5/5 (13)" vs canonical 4.4/10 | `en/send-email-to-yourself/index.html` | Correct to 4.4 / 10 ratings |
| H3 | Language switcher points to wrong article | `blog/email-to-obsidian.html:~250` | Target `/blog/email-to-obsidian` + `/en/...` |

## Medium (fix this month — bundle with the High PR)

| # | Issue | File | Fix |
|---|-------|------|-----|
| M1 | FAQPage questions absent from visible page | `blog/email-to-obsidian.html` | Align JSON-LD Qs to the 4 visible Qs (or drop block) |
| M2 | EN LCP preload + fetchpriority on non-LCP icon | `en/index.html:75` + icon `<img>` (both homes) | Remove preload; drop `fetchpriority="high"` |
| M3 | Wrong `ct=` campaign tokens | `blog/email-to-obsidian.html`, `en/blog/email-to-obsidian.html` | Page-correct tokens |
| M4 | Inflated reading time "約8分" | `blog/email-to-obsidian.html` | Recalc (~4 min) |
| M5 | 173 pages ship hidden EN DOM (structural) | legacy JA pages | Continue `/en/` migration; strip embedded EN per port (ongoing, not a single PR) |

## Low (backlog)

- FAQ question-text parity tighten (obsidian/, en/obsidian/, en/apple-watch/, en/blog/ios26…).
- Self-authored `review` on `/voices/` — decide whether to keep first-party review markup.
- Self + x-default hreflang on single-language pages.
- Deepen lightest locale homepages (es/id/pt-BR/zh).
- Add Apple-docs references to the SpeechAnalyzer post.
- WebP/AVIF `<source>` for `hero-ja.jpg`.
- CSP nonce/hash to drop `script-src 'unsafe-inline'`.
- Pad language-switcher tap target to ≥44×44.

## Verification
- Re-run PSI with API key for CrUX p75 field data (this run hit the 429 daily quota).
