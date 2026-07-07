# Full SEO/AIO Audit — simplememofast.com

**Date:** 2026-07-07
**Type:** Full audit (6 parallel specialists: technical, content, schema, sitemap, performance, visual)
**Scope:** Live site (238-URL crawl, browser UA + Playwright chromium) + source @ main (post PR #382, live verified byte-identical to repo on homepage/sitemaps/robots/llms.txt)
**Business type:** Publisher/SaaS hybrid — iOS app marketing site ("Obsidian連携シンプルメモ" / "Simple Memo - for Obsidian"), JA-root + `/en/` (36p) + 8 locale homepages, **234 HTML pages** (226 indexable = all in sitemap, 8 intentional noindex), Cloudflare Pages.

---

## SEO Health Score: 92 / 100

| Category | Weight | Subscore | Weighted | vs 07-02 |
|----------|--------|----------|----------|----------|
| Technical SEO | 25% | 96 | 24.00 | 95 ↑1 |
| Content Quality | 25% | 89 | 22.25 | 78 ↑11 |
| On-Page SEO | 20% | 91 | 18.20 | 88 ↑3 |
| Schema / Structured Data | 10% | 82 | 8.20 | 85 ↓3 |
| Performance (CWV) | 10% | 96 | 9.60 | 95 ↑1 |
| Images | 5% | 95 | 4.75 | 93 ↑2 |
| AI Search Readiness | 5% | 91 | 4.55 | 88 ↑3 |
| **Total** | | | **91.55 → 92** | 88 |

**Verdict:** Back to the 06-16 peak (92), and this time on a deeper sweep. **All 30 items from the 07-02 action plan re-verified as fixed and holding** (10/10 content, 4/4 visual with live measurements, 6/6 performance, all schema/sitemap items), and the three site-wide sweeps merged since (#374 cowork-A, #376 cowork-W, #369–#372 fix tiers) introduced **zero regressions** — pre/post-commit re-runs prove it. The cowork-A app-entity reversal verifies **12/12 blocks PASS on every field** with 3-point sync (JSON-LD ↔ visible ★4.4·10件 ↔ llms.txt) intact. The score isn't higher because the flashlight got brighter again: this audit's ItemList-name sweep and answer-text-layer FAQ parity check (both first-time checks) surfaced a **CRITICAL that has been live since 06-11** and a parity debt class #369 never had in scope. Schema's −3 is entirely latent-discovery, not regression.

---

## Top 5 issues

1. **CRITICAL — `en/send-email-to-yourself/index.html:117`**: the "Best Apps to Email Yourself (2026)" ItemList has **all 8 SoftwareApplication items named "Simple Memo - for Obsidian"**. PR #342's 06-11 brand sweep overwrote the 7 competitor names (Boomerang, Note To Self Mail, Email Me, Pigeon, Drafts, Apple Notes + Share Sheet, iOS Shortcuts). The visible page still reviews those competitors, so the markup misrepresents page content and reads as 8× self-promotion in a "best apps" list — the spammy-structured-markup / manual-action class. Live 26 days, survived 3 audits (no prior audit compared ItemList item names to visible entries). Same page: headline/WebPage.name still "8 Best Apps…" vs title "…5 Methods…", dateModified 06-09.
2. **HIGH — hidden-EN FAQ recurrence ×3**: `blog/meeting-memo-template.html:79`, `blog/memo-app-encryption-comparison.html:210`, `blog/memo-app-privacy.html:224` mark up EN Q&As that exist only inside default-hidden `<div data-lang="en">` — the exact #334/#369 invisible-content class, on 3 pages the 07-02 sweep never reached.
3. **HIGH — FAQ answer-layer parity: 38 questions / 12 pages**: #369 synced Question *names* only; `acceptedAnswer.text` was never in scope and has drifted from served text. Worst: `en/blog/best-note-to-self-apps-2026` 8/8, `en/blog/ios26-speechanalyzer-live-mic` 5/5, `hands-free/` 5/5, `faq.html` 5, `blog/line-keep-alternative` 4 (JA brand token inside EN answers). Combined with #2: 41 questions / 13 unique pages fail at the answer layer. Site-wide question-visibility (Q_MISSING) = 0 — the #369 fix itself holds.
4. **HIGH — `/en/apple-watch-obsidian/` shipped incomplete** vs its JA sister: no hero image at all (JA has the 760×571 WebP `<picture>`; EN LCP falls back to text), meta description 247ch = site's worst (reintroduces the just-fixed #17 class), title 76ch, generic `og/index.png` instead of a dedicated OG, and an unverifiable speed-equivalence claim ("Send to yourself **as fast as Captio did**" / desc "the same self-email **speed** as Captio") where the JA page hedges correctly (「Captioのような」). One completion PR closes the whole gap on the active Yahoo!ニュースPR target (already pos 3.2 after 4 days).
5. **MEDIUM — homepage entity-graph staleness + dead identity links**: both homepages define `#organization` **twice** (`index.html:91`, `en/index.html:89`) — the first block still ships the live-404 `qiita.com/organizations/simplememo` that cowork-A excluded (unification landed on only one of the two blocks); and author Person sameAs carries live-404 `github.com/hajimeataka` in 7 blocks (E-E-A-T identity link dead).

## Top 5 quick wins

1. `voices/index.html:465` — stale "★4.4・**8件**" → 10件 (the only 3-point-sync break site-wide; one character).
2. Critical #1 — restore the 7 competitor names from `git show c37349a0` (mechanical; removes the audit's only penalty-class risk).
3. Delete the 3 hidden-EN Question objects (delete-only, exact #369 recipe).
4. Delete the cargo-cult font preloads on 10 fully-inline-CSS pages — they preload ~161KB of NotoSansJP with **zero @font-face** (fonts can never be used; wasted fetch on every cold SERP landing since PR #107).
5. `sitemap.xml` index entry for sitemap-en.xml 07-02→07-03 one-liner + bump the 6 stale lastmods behind the 07-03/07-07 link wiring.

---

## What held from 2026-07-02 (all re-verified, zero regressions)

- **All #369 HIGH fixes**: line-keep-memo facts + re-angle (no more Keepメモ終了 assertion, no cannibalization of the blog cluster); captio-method integrity (2024年10月 / no cause-myth / 2011頃, both DOMs + FAQs); 2009→2011頃 on all 3 remaining pages; llms.txt "10x faster" gone; the 18 invisible EN questions deleted; named retitle desyncs fixed.
- **All #371/#372 MEDIUM/LOW fixes**: best-memo-apps 情報開示 block; OSS article completed (6 repo links + 最終リリース column + CTA); revenue-report fully unlinked; TL;DR 7候補→5; zh 約=0; thin tail deepened hard (glossary min 1,549→4,285 chars; teachers 1,476→5,696); en/vs double-slash URLs 0 site-wide; methods/gtd @id merged; publisher convention; dateModified bumps; tiktok webp; OG set 101MB→37MB; hero JPGs 883→317KB / 408→153KB; LCP H1 now transform-only `heroRise` with **style.css and style.min.css in sync**; `_headers` fonts rule **live-verified 1y immutable** (cf-cache HIT).
- **Visual fixes measured live**: lang-switcher pill offset −16px → **−0.6px**; vs/capacities nav = the standard 10-li set, 0 wraps; homepage lang toggle **44.0px**; OSS `.table-scroll` edge-fade rendering. 0px horizontal overflow everywhere sampled, including both new LPs.
- **cowork-A (#374) 12-block matrix: 12/12 PASS every field** — SoftwareApplication (site-wide MobileApplication = 0), unified `#app` (incl. en/), name + 6 alternateNames, v3.8, 2026-02-12 / 2026-06-25, iOS 16.0+, 4.4/10/5/1, identical 8-URL sameAs, jp/us downloadUrl, localized fields preserved. **3-point sync PASS** (12/12 visible ★4.4·10件 ↔ JSON-LD ↔ llms.txt). cowork-W retitles fully 6-point-synced — zero new desyncs.
- **Security**: headers 227/227 HTML responses carry all six (HSTS-preload/CSP/XFO/XCTO/RP/PP), 0 ACAO on HTML; admin 302→CF Access + no-store + X-Robots-Tag; `functions/_middleware.js` 404-blocks `/docs/` — the audit reports do NOT leak.
- **Crawl/index**: canonicals 230/234 perfect (4 absent = noindex pages); noindex set = exactly the expected 8; hreflang **0 defects across 62 pages** incl. the new LP pair + voice-input self-cluster + 11-entry locale mesh; internal links **0 broken / 0 pointing at redirects** (07-02 had 1); all `_redirects` rules live-probed single-hop (incl. `/%29` reclaim, `?lang=` strip, `http://www` in one hop); IndexNow keys both 200 with exact bodies.
- **Sitemaps**: 226/226 matched / 0 missing / 0 extra; canonical agreement 226/226; **lastmod honesty verdict: TRUSTWORTHY** (21-URL sample: substantive 07-02 fixes honestly bumped; all 38 sweep-stamped pages genuinely edited; zero fabricated stamps; index-entry policy #31 implemented in the generator).
- **JSON-LD**: 732/732 blocks parse; breadcrumbs 216/216 clean; census reconciles exactly (406 Q/A = 408 − 18 deleted + 16 new-LP).
- **Performance**: 1 blocking stylesheet (9,258B br), zero blocking JS, GA on requestIdleCallback; new ahrefs analytics is async+preconnect 2.7KB (correct posture); TTFB p90 403ms, outliers re-fetched at 86–120ms (transient); homepage byte-identical weight to 07-02.
- **Deferred by design:** #18 JA title lengths (94 pages >32fw) stays frozen until the 7/29–30 CTR readout.

---

## Findings by category

### Technical SEO — 96/100

| Sev | Location | Issue |
|-----|----------|-------|
| MEDIUM | `/CLAUDE.md`, 12 `/scripts/*` files, `/tools/.env.example` | Serve 200, crawlable+indexable ops-intel (deploy conventions, generator internals; verified no secrets). The `/docs/` middleware block (`functions/_middleware.js:59-64`) proves the pattern — extend it to these paths. |
| MEDIUM | `en/apple-watch-obsidian/index.html` | Meta description 247ch (site's worst; #17 class reintroduced by a new page), title 76ch. |
| MED-LOW | 36 JA pages (W4, #376) | Desc expansions overshoot ~120fw (worst `use-cases/moving` 134.5fw); 22 share a boilerplate CTA tail (「無料で1日3通まで…約1分」) — truncation + uniqueness dilution. No exact duplicates. |
| LOW | `functions/_middleware.js:76-79` vs `_redirects:17-24` | 2-hop chains: `/blog/captio-alternatives-comparison.html` and `/blog/memo-shuukan-tips.html` → extensionless → target; the blanket `/blog/*.html` strip preempts the direct rules. |
| LOW | `vs/google-keep/` | 3-way title/og:title/twitter:title drift (a #367 retitle the #369 desync sweep missed). Also `en/obsidian/` og/tw old prefix; `en/vs/google-keep-vs-apple-notes` tw stale (og was fixed). |
| LOW | 18 pages | Robots-meta stragglers after W11: 15 with no tag (12× en/vs/*, en/faq, en/about, en/blog/best-memo-apps-2026), 3 bare `index,follow`. Harmless — consistency only. |
| INFO | `functions/_middleware.js:32-36` | Stale comment (claims root .html would 404 extensionless; live behavior is the opposite). Code path unaffected. |
| INFO | dual-DOM count | 158, flat since June. `/templates/` (created 07-02 19:00, first audit) — PASS, dual-DOM acceptable (predates convention cutoff by hours). |

### Content Quality — 89/100

| Sev | Location | Issue |
|-----|----------|-------|
| MEDIUM | `voices/index.html:465` (JA DOM, AI answer-block) | Stale "★4.4・8件" vs canon 10件 — the only 3-point-sync break site-wide. |
| MEDIUM | `en/apple-watch-obsidian/` :26 + H2 | "the same self-email speed as Captio" / "as fast as Captio did" — unverifiable speed-equivalence vs a dead competitor; JA hedges correctly. Reword to the JA pattern. |
| MEDIUM | `blog/iphone-memo-app-fast.html:359` | Own app as 「起動＝即入力」を実現した**唯一の**アプリ — unevidenced, contradicted by own vs/drafts page (latent, predates baseline). |
| LOW | `llms.txt` | Last-updated stamp says 07-02; content changed 07-03 (#381). |
| LOW | `apple-watch-obsidian/index.html` | "SimpleMemo" non-canonical name ×5; `:354` 「Obsidian連携シンプルメモ（Obsidian連携シンプルメモ）」 artifact; no visible publish date (both LPs). |
| LOW | `glossary/digital-detox/` | 唯一/"Only" CTA phrasing — soften. |
| INFO | Known-legit patterns confirmed | Pigeon "4.5 (13)" (different app), "since v3.4" feature history, 超高速-describing-Captio, SpeechAnalyzer "~0.3–0.5s" (API latency, not launch claim). |

**New-LP verdict: PASS — best claim-discipline page on the site** (honest-mechanics section, Apple-cited watchOS constraints, benchmark-linked 約1秒, dual non-affiliation FAQs, 8/8 FAQ parity in both languages) except the EN speed-equivalence phrasing. **Watch cluster not cannibalizing**: /apple-watch/ (email/general intent) vs /apple-watch-obsidian/ (Obsidian intent) differentiated in title/H1/desc and by anchors from all 8 wiring pages. E-E-A-T core intact: named author + 株式会社ユリカ + 特商法 + first-hand benchmarks + honest competitor-wins sections.

### On-Page / Visual — 91/100 (visual 92 + element health 90)

| Sev | Location | Issue |
|-----|----------|-------|
| MEDIUM | `/en/apple-watch-obsidian/` | No hero image at all (JA↔EN parity gap; docHeight Δ≈571px; EN LCP falls back to text). Reuse the JA hero assets. |
| LOW | `/captio-alternative/` mobile | 841px table hard-clips cells mid-glyph with no swipe affordance — apply the `.table-scroll` pattern #29 gave the OSS article. |
| LOW | `/blog/open-source-memo-apps` | CTA improved 0→1 but bottom-only (y≈6,432/7,965) vs the 3-CTA money-page convention. |
| LOW | site-wide (all 24 loads) | CSP blocks Cloudflare Insights `beacon.min.js` → 1 console error/page and **CF Web Analytics collects nothing**. Allow `static.cloudflareinsights.com` in script-src+connect-src or disable the injection. |
| INFO | EN footers | JA copyright line site-wide (pre-existing convention, not a new-LP defect). Pill links 36×44px — tall enough, slightly narrow. |

Above-fold: H1 visible 24/24 loads; App Store badge above fold on all conversion pages incl. both new LPs. New LPs clean end-to-end: 0px overflow, AA+ contrast (7.5–18.2:1), `word-break:auto-phrase`, tap targets ≥44px, structure parity 10 h2 / 12 sections / 4 CTAs each. 24 full-page screenshots + 26 evidence crops in the session scratchpad.

### Schema — 82/100

732/732 blocks parse (238 docs). Census vs 07-02: Q/A 408→406 each (−18 deleted invisible, +16 new-LP — reconciles exactly), FAQPage 42→44, SoftwareApplication 13→25 (12 `#app` + 4 watch `about` + 8 send-email ItemList + 1 voices), MobileApplication →**0**, AggregateRating 0→**12** (exactly the 12, none elsewhere), Review 6 / Rating 1 unchanged (/voices/ pattern).

| Sev | Location | Issue |
|-----|----------|-------|
| CRITICAL | `en/send-email-to-yourself/index.html:117` | ItemList: all 8 "best apps" items named "Simple Memo - for Obsidian" (PR #342 overwrote 7 competitor names). Markup misrepresents visible content + 8× self-promotion = spammy-structured-markup class. Restore from `git show c37349a0` (the other 4 single-name #342 replacements verified legit). Same page: "8 Best Apps" headline/WebPage.name vs "5 Methods" title, dateModified 06-09. |
| HIGH | 3 JA pages (:79/:210/:224) | Hidden-EN Q&As marked up (invisible-content class) — delete from JA-page schema; EN sisters carry them visibly. |
| HIGH | 12 pages / 38 questions | `acceptedAnswer.text` ≠ served text (names were synced by #369; answers never were). Mechanical fix: regenerate from served `faq-answer` innerHTML (quote-glyph transforms already tolerated). |
| MEDIUM | `index.html:91`, `en/index.html:89` (+ Person blocks ×7) | Duplicate stale `#organization` (live-404 qiita-org in sameAs, missing prtimes) conflicting with the corrected block; `github.com/hajimeataka` live-404 in 7 author sameAs blocks. |
| LOW | `en/apple-watch-obsidian/` | og:image = generic `og/index.png`. |
| INFO | Both watch LPs | Schema PASS (WebPage+Speakable+Breadcrumb+FAQPage, honest 07-03 dates, 16/16 FAQ parity — best FAQ pages on the site). Opportunity: neither @id-references the rated `#app` entity (anonymous inline `about`; sibling-consistent, no conflicts). |
| INFO | Eligibility | SoftwareApplication rich-result eligibility (rating+offers) achieved on the 12; ratings store-verified + source-labeled — not the fake-ratings class. FAQ rich results remain gov/health-only (kept for AIO by design). |

### Sitemaps — 96/100 (feeds Technical)

226 matched / 0 missing / 0 extra; canonical agreement 226/226; hreflang 60 URLs / 26 groups / 0 defects (+2 = new LP pair); both LPs in the right children with honest 07-03 lastmods; hand-splice reproduces byte-identically under regeneration; #31 implemented (index = max(child lastmods), code cites the audit). **Lastmod honesty: TRUSTWORTHY** — all errors found are understatements, never inflation. Findings: MEDIUM — `generate_sitemap.py` regeneration not idempotent across squash-merges (a run today would rewrite 44 lastmods, 38 backward to March–June; add a monotonic floor `max(existing, git-derived)`; until then never regen without diff review). LOW — index entry for sitemap-en says 07-02 but the child changed 07-03 (#381 splice forgot the index). LOW — 6 URLs stale behind real edits (/apple-watch/, /obsidian/, /en/apple-watch/, /en/obsidian/ 07-03 cross-links; /voice-input/, /hands-free/ 07-07 wiring). INFO — JA/EN children stamp sweeps asymmetrically (ja regenerated inside #374/#376, en wasn't).

### Performance — 96/100

| Sev | Location | Issue |
|-----|----------|-------|
| MEDIUM | 10 fully-inline-CSS pages (`vs/mem` :55-56, `vs/anytype`, `vs/tana`, `vs/heptabase`, `blog/information-organization-guide` :77-78, `blog/email-self-task-management`, `blog/email-management-tips`, `use-cases/researchers` :57-58, `use-cases/writers`, `use-cases/designers`) | Preload ~161KB NotoSansJP with **zero @font-face and zero external CSS** — fonts can never be used; wasted fetch on every cold landing. Cargo-cult since PR #107, newly surfaced. Delete the pair (or migrate pages to style.min.css — they also use `var(--accent)` etc. with no definition anywhere). |
| LOW | 15 EN pages (en/faq, en/about, en/blog/best-memo-apps-2026, 12× en/vs/*) | Residual #11: load style.min.css (subset @font-face has no unicode-range ⇒ EN pages do fetch fonts) but lack the preload pair 203 siblings have. |
| LOW | `assets/img/og/apple-watch-obsidian.png` 516,753B | Only >300KB in og/ — `generate-og-images.js --only` skips the compress step. |
| LOW | `assets/img/` root: ogp.png 643KB, og-captio-alternative.png 655KB, og-note-to-email.png 646KB | Same class as #25, missed (sweep scoped to og/ only); referenced by 5 live pages. Unfurl-only. |
| INFO | TTFB | p90 403ms; crawl outliers (captio-method 795ms, en/faq 584ms) re-fetched at 86/120ms — transient cold-path. PSI API 429 again (3rd audit) — owner key action stands. |

Lab: 1 blocking stylesheet 9,258B br; 0 blocking JS; critical-path JS unchanged; GA requestIdleCallback; ahrefs analytics async 2.7KB. Page weight median 45.8KB / p90 64.4KB / max 118KB. JA watch LP is the site's best LCP posture (responsive preload + fetchpriority=high + 44/75KB WebP).

### Images — 95/100

669 `<img>`: 0 missing alt on public pages, 667/667 dims, no lazy-loading gaps; heroes `<picture>`+WebP throughout; tiktok icon now 2.2KB webp. Deductions: the 4 oversized OG-class PNGs above + generic OG on the EN LP.

### AI Search Readiness — 91/100

llms.txt banned claim gone, Current-facts line on canon (v3.8 / 4.4·10 / price / iOS 16+), both watch LPs mapped in llms.txt, TL;DR gaps closed, answer-blocks present on whale pages; robots.txt AI posture intact (19 named UAs allowed, scraper-only bots blocked, Claude-SearchBot/Claude-User present). Deductions: the voices answer-block stale rating (MEDIUM above), llms.txt stamp one day stale, no visible dates on the new LPs (AI engines favor dateable sources), EN LP naming/OG gaps.

---

## Owner actions (cannot be done from the repo)

- **GSC disavow re-upload** — docs/disavow.txt now **286 domains** (+22 on 07-07; attack ongoing at 3–5 domains/day, nofollow-heavy, association-spam pattern).
- **GSC reindex requests** after the Critical/High fixes land: `en/send-email-to-yourself/`, the 3 hidden-EN pages, and the 12 answer-parity pages.
- **paji.me redirect flattening** (CF-1 from the 07-02 依頼書, ~5 min) — legacy links still 2–3-hop.
- **Cloudflare Scrape Shield → Email Obfuscation OFF** (~1 min) — kills the 22 phantom `/cdn-cgi/l/email-protection` internal links Ahrefs counts.
- **CF Web Analytics decision** — currently CSP-blocked and collecting nothing (see On-Page findings): either whitelist `static.cloudflareinsights.com` or turn the injection off.
- **PSI API key** — third audit running without field data.
- **github.com/hajimeataka** — restore the handle or approve removal from the 7 author sameAs blocks.

## Measurement (continuity)

- **7/29–30**: CTR evaluation of the 11 frozen retitles (PRs #367/#374/#376) + the AI-query FAQ additions staged in `ahrefs-gsc-analysis-2026-07-07.md` §4; JA-title item #18 decision follows that readout.
- **Watch LP**: pos 3.2 (imp 4) after 4 days — monitor through the Yahoo!ニュース campaign window; internal wiring (8 pages) landed 07-03/07-07.
- Next monthly Captio SERP rank check ~2026-08-01.
- Re-audit checkpoint after Critical+High land: expect **93–94** with Schema back ≥90.
