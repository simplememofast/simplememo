# Full SEO/AIO Re-Audit — simplememofast.com

**Date:** 2026-06-16
**Type:** Re-audit (6 parallel specialists: technical, content, schema, sitemap, performance, visual)
**Scope:** Live site (curl + Playwright) + source @ origin/main
**Business type:** Publisher/SaaS hybrid — iOS app marketing site ("Simple Memo - for Obsidian" / "Obsidian連携シンプルメモ"), bilingual JA-root / EN-under-`/en/` + 8 minor locales, 225–232 HTML pages, Cloudflare Pages.

---

## SEO Health Score: 92 / 100

| Category | Weight | Subscore | Weighted |
|----------|--------|----------|----------|
| Technical SEO | 25% | 96 | 24.0 |
| Content Quality | 25% | 88 | 22.0 |
| On-Page SEO | 20% | 92 | 18.4 |
| Schema / Structured Data | 10% | 92 | 9.2 |
| Performance (CWV) | 10% | 94 | 9.4 |
| Images | 5% | 88 | 4.4 |
| AI Search Readiness | 5% | 90 | 4.5 |
| **Total** | | | **91.9 → 92** |

**Verdict:** Strong health, no penalties, **no regressions in any of this session's major optimizations**. The score is constrained almost entirely by (a) a handful of copy-paste bugs on the newest pages and (b) the standing structural item — 173 legacy JA pages still ship a hidden English DOM (the `/en/` migration is the long-term fix).

---

## What held (re-verified, all PASS)

- **Brand unification** — official names everywhere; old names only in `alternateName`/`旧称`/article-subject contexts.
- **No false E2E claims** — all 44 "end-to-end" mentions are competitor refs or explicit negations; JSON-LD says on-device AES-GCM, not E2E.
- **Captio shutdown = October 2024** — 39× EN / 39× JA, consistent; no "around 2023" anywhere.
- **aggregateRating removed** — 0 occurrences site-wide (the lone `ratingValue` is a legit per-`Review` rating on `/voices/`).
- **Offers clean** — no priceSpecification/UnitPriceSpecification, softwareVersion 3.4, short downloadUrls, corrected AlternativeTo `sameAs`.
- **Redirects** — www/http/`?lang=`/`.html` all single-hop; `/docs/` 404; `/admin/` 302→CF Access.
- **Security headers** — HSTS/CSP/XFO/XCTO present on HTML; ACAO off HTML / on `/assets/*`.
- **Sitemaps** — 4-file split valid, git-derived lastmod (21 distinct dates), exact 1:1 disk↔sitemap coverage (0 missing/extra), full hreflang reciprocity, root = `/`.
- **JSON-LD validity** — 728/728 blocks parse; 0 syntax/date/URL/context errors across 225 files.
- **CWV hygiene** — TTFB 65–87ms, single 9.2KB-br blocking CSS, fonts preloaded, all homepage images dimensioned, CLS 0.000 measured; GA deferred, tracking script 1.6KB passive listener.
- **Mobile fixes** — JA headings have no mid-word Latin breaks, nav brand is one line at 360/390px, CTA overflow fixed, grouped footer renders.

---

## Findings (new / remaining)

### HIGH

1. **Horizontal page overflow on `/en/blog/ios26-speechanalyzer-live-mic` (mobile).**
   The "Migration checklist" `<table>` (CSS @ `en/blog/ios26-speechanalyzer-live-mic.html:223`) is `width:100%` with no scroll wrapper; long `<code>` tokens push min-content to ~569px → 179px of sideways scroll at 390px viewport. `<pre>` blocks are already handled (`overflow-x:auto`); the table is the lone offender.
   **Fix:** `.article-body table{display:block;overflow-x:auto}` or wrap the table in `<div style="overflow-x:auto">`.

2. **Self-contradicting App Store rating on `en/send-email-to-yourself/index.html`.**
   Prose reads "(13 ratings)… 4.5/5" — contradicts the canonical **4.4 / 10 ratings** rolled out everywhere else (commit `ae3bf83c`). (The 4.9/5 and 4.8/5 on the page are *competitor* ratings and are fine.) Direct trust ding under QRG.
   **Fix:** correct to 4.4 / 10 ratings.

3. **Wrong language-switcher targets on `blog/email-to-obsidian.html` (lines ~250–251).**
   The on-page JA/EN switcher points to `/blog/best-memo-apps-2026` and `/en/blog/best-memo-apps-2026` (copy-paste leftover) instead of the email-to-obsidian pair. `<head>` canonical/hreflang are correct, so indexing is safe, but clicking the toggle lands on the wrong article.
   **Fix:** point to `/blog/email-to-obsidian` and `/en/blog/email-to-obsidian`.

### MEDIUM

4. **FAQPage markup mismatch on `blog/email-to-obsidian.html`.**
   The 4 FAQPage `mainEntity` questions do not appear on the page (the visible FAQ asks 4 different questions). Google requires marked-up Q&A to be present on-page.
   **Fix:** align the JSON-LD questions to the 4 visible ones (answers already match), or drop the FAQPage block.

5. **EN homepage LCP preload regression.**
   `en/index.html:75` still has `<link rel="preload" as="image" href="/assets/img/app-icon-256.webp">` and the icon carries `fetchpriority="high"` (both pages) — but the icon renders at 96×96 and is **not** the LCP element (the gradient H1 is). JA was already fixed; EN was missed.
   **Fix:** remove the preload on `en/index.html:75`; drop `fetchpriority="high"` from the icon `<img>` on both homepages.

6. **Wrong `ct=` campaign tokens on both new email-to-obsidian pages** (analytics, not ranking).
   `blog/email-to-obsidian.html` → `ct=blog-best-memo-apps-2026-jp`; `en/blog/email-to-obsidian.html` → `ct=blog-why-captio-died-en-en`. Corrupts per-page install attribution.
   **Fix:** set page-correct tokens (e.g. `blog-email-to-obsidian-jp` / `-en`).

7. **Inflated reading time** on `blog/email-to-obsidian.html` — "約8分" for ~2,580 JA chars (≈4 min). Minor credibility mismatch.

8. **Structural (standing):** 173 legacy JA pages still ship a full hidden EN DOM (`[data-lang="en"]{display:none}`). Crawl-safe (server-rendered single visible language, self-canonical, only 1 has an `/en/` twin) but caps language-targeting precision. Long-term fix = continue `/en/` migration and strip embedded EN as pages are ported.

### LOW

- FAQ question-text paraphrasing vs visible `<summary>` on `obsidian/`, `en/obsidian/`, `en/apple-watch/`, `en/blog/ios26-speechanalyzer-live-mic` (answers match; tighten question strings for clean parity).
- Self-authored `review` markup on `/voices/` `SoftwareApplication` (review-snippet policy gray area).
- Single-language pages (`/en/blog/ios26-speechanalyzer-live-mic`, `/guides/gmail/`) lack self + x-default hreflang.
- Lightest locale homepages (es/id/pt-BR/zh ≈ 3,300 chars) shallower than ar/ko/zh-Hant.
- Engineering post lacks an external `developer.apple.com` references block (vs `/apple-watch/` which models this).
- `hero-ja.jpg` 267KB JPG (lazy, below fold) — add WebP/AVIF `<source>`.
- CSP `script-src 'unsafe-inline'` — nonce/hash hardening (low priority for static site).
- Language-switcher tap target 32–36px (< 44px guideline).

---

## Notes

- PSI API was quota-exhausted (HTTP 429) this run — CWV figures are lab-estimated from curl + source. Re-run PSI with a key (or after reset) for CrUX p75 field confirmation.
- The `docs/` generator exclusion targets a directory with no served HTML (harmless dead config).
