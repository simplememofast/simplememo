# Full SEO/AIO Audit — simplememofast.com

**Date:** 2026-07-02
**Type:** Full audit (6 parallel specialists: technical, content, schema, sitemap, performance, visual)
**Scope:** Live site (curl + Playwright chromium) + source @ main (post PR #367, deploy verified in sync)
**Business type:** Publisher/SaaS hybrid — iOS app marketing site ("Obsidian連携シンプルメモ" / "Simple Memo - for Obsidian"), JA-root + `/en/` (36p) + 8 locale homepages, **232 HTML pages** (224 indexable + 8 intentional noindex), Cloudflare Pages.

---

## SEO Health Score: 88 / 100

| Category | Weight | Subscore | Weighted | vs 06-16 |
|----------|--------|----------|----------|----------|
| Technical SEO | 25% | 95 | 23.75 | 96 ↓1 |
| Content Quality | 25% | 78 | 19.50 | 88 ↓10 |
| On-Page SEO | 20% | 88 | 17.60 | 92 ↓4 |
| Schema / Structured Data | 10% | 85 | 8.50 | 92 ↓7 |
| Performance (CWV) | 10% | 95 | 9.50 | 94 ↑1 |
| Images | 5% | 93 | 4.65 | 88 ↑5 |
| AI Search Readiness | 5% | 88 | 4.40 | 90 ↓2 |
| **Total** | | | **87.9 → 88** | 92 |

**Verdict — read the −4 correctly:** this is *not* a regression. **Every fix from the 2026-06-16 audit re-verified as holding** (see "What held"), and performance/images actually improved. The drop comes from this audit sweeping **deeper than any previous one** — full-site FAQ schema↔visible-text parity, integrity greps extended into `glossary/` and `llms.txt`, and the first full visual sweep of every table-bearing page — which surfaced **latent issues that predate the 92/100 baseline**: an invisible-FAQ cluster introduced by PR #334's dual-DOM strip, a `glossary/captio-method` page the #359 integrity sweep never reached, and a banned claim sitting in `llms.txt` itself. The site got better; the flashlight got brighter.

---

## Top 5 issues (all HIGH; nothing CRITICAL — indexing is fully healthy)

1. **`vs/line-keep-memo/` asserts the factually wrong "LINE Keepメモは2024年8月にサービス終了"** (title, meta, JSON-LD, body — 9 spots). Reality: LINE Keep (storage service) ended; **Keepメモ continues**. It directly contradicts the just-retitled `blog/line-keep-alternative` ("LINE Keepは終了・Keepメモは継続中") — a same-site factual + schema conflict sitting on the exact "line keepメモ 終了" cluster (815 impressions) the CTR sprint targets, and it cannibalizes it.
2. **`glossary/captio-method/` missed the June integrity sweep**: says Captio was "2023年にApp Storeから削除" (canonical: October 2024) in both DOMs + both FAQs, plus an unsubstantiated shutdown-cause claim (Google "less secure apps" policy variant of the purged myth). Also carries the "2009" launch year vs site-canonical "2011頃" (same drift on `glossary/index`, `vs/memo-post`, `vs/captioo`).
3. **`llms.txt:189` contains a banned claim** — "email yourself memos **10x faster**" — in the one file written specifically for AI engines to quote. The target page itself is clean; only the citation file drifted.
4. **30 of 408 FAQPage questions are invisible on their pages** (10 of 42 FAQ pages) — a Google FAQ content-guideline violation. Cause (git-confirmed): PR #334 stripped visible EN Q&As from JA pages but left them in schema. Includes whale pages `vs/apple-notes`, `vs/google-keep` (5 invisible EN questions each) and the flagship `blog/best-memo-apps-2026` (10 marked up, 8 visible); plus wording drift on `obsidian/`, `en/obsidian/`, `en/apple-watch/`, `en/blog/ios26-speechanalyzer-live-mic` (4/5 drifted), `blog/line-keep-alternative`.
5. **CTR-sprint metadata desyncs**: `captio-alternative` JSON-LD headline + WebPage.name still carry the pre-sprint title; `en/vs/google-keep-vs-apple-notes` og:title not retitled; `en/send-email-to-yourself` og/twitter:title describe a different article ("8 Best Apps…" vs "How to Email Yourself: 5 Methods…"). Social/AI surfaces show stale titles on freshly-retitled pages.

## Top 5 quick wins

1. `llms.txt:189` — one-line rewrite (+ re-stamp Last updated).
2. Delete the 30 invisible EN Question objects from JA-page schemas (mechanical; EN sister pages already mark them up correctly).
3. Sync the 3 retitle-desync pages (headline/og:title/WebPage.name).
4. `en/vs/*` double-slash schema URLs (`…/en/vs/apple-notes//#article`) — one `sed` across 11 pages.
5. One CSS rule fixes the mobile lang-switcher misalignment on all 21 affected pages (`.lang-switcher--nav .lang-switcher__btn{display:inline-flex;align-items:center;justify-content:center}`).

---

## What held from 2026-06-16 (all re-verified live, zero regressions)

- **All PR #354 fixes**: table overflow fixed (now 0px overflow on **all 36 table-bearing pages** at 390px — first fully-clean visual sweep in 3 audits); EN LCP preload removed & `fetchpriority` gone from both homepages; ct tokens; FAQ parity on the pages it touched.
- **Integrity (PRs #359–361) on HTML**: zero "0.3秒/150ms" claims; all 10x/超高速 hits are non-self or competitor-describing; ratings canonical ★4.4/10件 everywhere (no 4.5/13件); why-captio-died retired with correct 301 (`/en/blog/why-captio-died` → `/en/captio-alternative/`; JA never existed — 404 correct). **PR #362's freshness bump verified honest** (43+/43− substantive edits same day — not a date-only bump).
- **Security**: HSTS(preload)/CSP/XFO/XCTO/Referrer-Policy/Permissions-Policy on HTML; ACAO scoped to `/assets/*` only; `/admin/` 302→CF Access; research dirs 404.
- **Redirects**: www/http/`?lang=`/`.html`-strip all single-hop; new sprint redirects (`/)`, `/%29`, why-captio-died pair) all land 200 single-hop.
- **Sitemaps: 97/100** — 224 URLs = exactly the 224 indexable pages (all 8 exclusions intentional + noindexed), 0 hreflang defects across 58 annotated URLs, lastmod policy-compliant 224/224 (9 retitles + OSS article correctly stamped 2026-07-02), live files byte-identical to repo.
- **lang.js title-clobber**: fixed for good — `SERVED_LANG` captured pre-mutation; titles never overwritten for crawlers.
- **JSON-LD**: 729/729 blocks parse (was 728/728); aggregateRating still 0 site-wide; offers clean; AlternativeTo sameAs intact.
- **Internal links: 0 broken across 232 pages** (1 redirected target only). Canonicals 100% absolute self-refs. Titles 0 duplicates. `<img>` alt: 0 missing (2 intentional decorative empties).
- **CWV**: TTFB medians 83–141ms; single 9.2KB-br blocking CSS; zero blocking JS; GA on `requestIdleCallback`; fonts/CSS/img `immutable` cached. **Hero images now `<picture>`+WebP (105/188KB vs 267/408KB JPG)** — June's standing image item resolved.

---

## Findings by category

### Technical SEO — 95/100

| Sev | Location | Issue |
|-----|----------|-------|
| HIGH | `vs/line-keep-memo/index.html:24-25` (+29-30, 44-45, 58, 287-289; 9×) | Factually wrong "Keepメモ終了" claim — same-site contradiction + cluster cannibalization (Top-issue #1). Fix: correct facts throughout & re-angle title away from 終了 (leave that query to blog/line-keep-alternative), or 301 per memo-shuukan-tips precedent. |
| MEDIUM | `en/send-email-to-yourself/index.html:25` | og/twitter:title describe the article's previous incarnation (semantic mismatch, not suffix-trim). |
| MEDIUM | 97/196 JA pages | Titles >32 full-width chars (45 pages >40fw) from the `｜Obsidian連携シンプルメモ` suffix (11.5fw); worst: `en/blog/ios26-speechanalyzer-live-mic` at 81ch — one of the 9 retitles, truncates ~60ch. Continue the suffix-drop precedent (aes-gcm) on high-impression pages. |
| MEDIUM | `en/obsidian/` (237ch), `en/apple-watch/` (190), `en/` (181), `en/iphone-shortcuts-email-guide/` (179) | Meta descriptions far beyond ~160ch SERP budget. |
| MED→LOW | `en/blog/revenue-report-2025.html:296,515,631` | 3 links to the retired why-captio-died (now 301) with anchors re-asserting the retired claim; page noindexed so hygiene-only. |
| LOW | `tiktok/index.html:263` | Dead dual-DOM switcher markup (21 spans, no lang.js); noindexed. |
| INFO | 24 `/vs/*` pages | og:title template variant (`シンプルメモ vs X — 徹底比較`) — intentional & arguably stronger; candidate for a future retitle sprint. |

Dual-DOM standing count: **158** hidden-EN pages (157 + tiktok CSS-only). The `/en/` migration remains the long-term fix; unchanged since June (173→158 via page conversions).

### Content Quality — 78/100

| Sev | Location | Issue |
|-----|----------|-------|
| HIGH | `glossary/captio-method/index.html:270,271,292,297` | Captio "2023" shutdown date (both DOMs + FAQs) — canonical is 2024年10月. |
| HIGH | `glossary/captio-method/index.html:270-271` | Shutdown-cause myth ("安全性の低いアプリ"ポリシー変更) — delete; use "終了理由は公表されていません". |
| HIGH | `llms.txt:189` | "10x faster" banned claim in the AI-citation file. |
| MEDIUM | `glossary/captio-method` (:25,:29,:54,:62), `glossary/index.html:458-459`, `vs/memo-post/index.html:339-340`, `vs/captioo/index.html:529,538` | Captio launch "2009" vs canonical "2011頃" — 4 files incl. meta/JSON-LD. |
| MEDIUM | `en/blog/revenue-report-2025.html:306-323` | "I'm publishing these numbers" but all figures are `[X,XXX]` TODO placeholders; noindexed yet visibly linked from `en/blog/index.html:407` + ItemList. Fill or unlink. Also ":296 died after 14 years" (canon ≈13). |
| MEDIUM | `blog/best-memo-apps-2026.html:306,341` | Own app ranked #1 in own listicle (PRs #363-366) with only in-flow disclosure — copy line-keep's labeled "情報開示" block; optionally tag #1 as 自社アプリ. (Honest cons + need-conditional FAQ already present — good.) |
| MEDIUM | `blog/open-source-memo-apps.html` | New page: facts all verified correct (licenses, Obsidian≠OSS, honest "本アプリは非公開" self-section, own app kept out of the 6-list) but **zero outbound links to the 6 repos** it tells readers to check; no maintenance-recency facts; no in-body App Store CTA (visual finding). |
| LOW | `blog/line-keep-alternative.html` TL;DR | "7候補" vs hero/body "5つの代替" in the most-quoted block. |
| LOW | `zh/index.html` | 15× ja-kanji 約 in zh-Hans text (should be 约). |
| LOW | Thin tail | `use-cases/teachers` 1,476 chars; 9 glossary entries 1,549–1,700; locale depth roughly equalized in CJK terms (supersedes June's "es/id/pt-BR/zh" note). |
| LOW | `use-cases/teachers/index.html:355`, `vs/memo-post/index.html:339-340` | Unlinked "Edutopia" reference; unevidenced superlative "最もアクティブに開発が続けられている". |

**Not-doorway verdict:** `vs/`×39 and `use-cases/`×22 measured at 4–6% pairwise text similarity with genuine per-page substance — safe under the Dec-2025 E-E-A-T update. E-E-A-T core strong: named author + 株式会社ユリカ + 特商法 page + first-hand benchmarks + honest "when the competitor wins" sections. All 9 retitles deliver their title's promise; both displayed reading times accurate.

### Schema — 85/100

729/729 blocks parse; type census: ListItem 636, Q/A 408 each, WebPage 398, Article 285, BreadcrumbList 215 (all sequential, all URLs resolve), FAQPage 42, SoftwareApplication 13, Review 6, Rating 1 (the accepted `/voices/` per-Review).

| Sev | Location | Issue |
|-----|----------|-------|
| HIGH | `vs/apple-notes:258`, `vs/google-keep:258`, `vs/notion-vs-evernote:145` | 5 invisible EN questions each (schema-only after PR #334 dual-DOM strip). |
| HIGH | `blog/best-memo-apps-2026.html:226` | 10-Q FAQPage = 7 visible JA + 3 invisible EN on the flagship listicle. |
| HIGH | `en/blog/ios26-speechanalyzer-live-mic.html:63` | 4/5 questions keyword-expanded vs visible text. |
| HIGH | `obsidian/:76`, `en/obsidian/:77` (3Q), `en/apple-watch/:76` (2Q), `en/blog/best-note-to-self-apps-2026:66`, `blog/line-keep-alternative:227` | Wording drift schema↔visible. **Parity total: 30/408 questions fail on 10/42 pages.** |
| MEDIUM | all 11 `en/vs/*/index.html:52-61` | Double-slash URLs (`…en/vs/apple-notes//#article`, mainEntityOfPage, breadcrumb tail, `//#faq` ×3) disagreeing with canonicals. |
| MEDIUM | `captio-alternative/index.html:62,863` | Retitle desync: headline + WebPage.name still pre-sprint. |
| MEDIUM | `en/vs/google-keep-vs-apple-notes:30` | og:title not retitled. |
| MEDIUM | 8 locale `index.html` | MobileApplication lacks offers/softwareVersion/downloadUrl → rich-result-ineligible. |
| MEDIUM | `methods/gtd/index.html:74,263` | Two WebPage blocks share `#webpage` @id with conflicting names (leftover Speakable block). |
| LOW | `blog/line-keep-alternative:58`, `en/iphone-shortcuts-email-guide:268`, `vs/capacities:54` | Stale WebPage.name after retitle. |
| LOW | 8 sprint-edited JA pages | Stale schema dateModified (e.g. best-memo-apps 06-18 vs git 07-01). |
| LOW | `blog/open-source-memo-apps:60`, `blog/email-to-obsidian` | publisher name/alternateName swapped vs the 172-block JA convention. |
| INFO | 42 FAQPage pages | FAQ rich results are gov/health-only since Aug 2023 — retained for AIO by design; expect no SERP rich results. |

New page `blog/open-source-memo-apps`: schema PASS (valid Article/Breadcrumb/WebPage/FAQPage, correct dates, 3/3 FAQ visible). Opportunities: page-specific OG image (uses generic `og/blog.png`), mainEntityOfPage, ItemList for the 6-app listicle.

### Sitemaps — 97/100 (feeds Technical)

224 matched / 0 missing / 0 extra; 8 exclusions all intentional + noindexed (`404`, `admin`×3, `compose`, `verify`, `tiktok/`, `en/blog/revenue-report-2025`); hreflang 0 defects; 29/29 sampled URLs single-hop 200; live byte-identical to repo; robots.txt → index. LOW: index entry for sitemap-locales.xml overstates lastmod (2026-07-02 vs real 2026-06-16). INFO: the generator's `MECHANICAL_SWEEP_THRESHOLD=40` means the 06-23 integrity corrections (212 files) never got lastmod bumps — recrawl of those corrections relies on the open GSC-reindex owner action.

### Performance — 95/100

TTFB medians: `/` 83ms · `/en/` 118ms · OSS article 141ms · `/vs/capacities/` 125ms (all br). One blocking stylesheet 9,230B br; zero blocking JS; critical-path JS ~6.6KB.

| Sev | Location | Issue |
|-----|----------|-------|
| LOW-MED | `en/index.html` + 46 pages (all locales, **new OSS article**, `blog/email-to-obsidian`, `compose`) | Missing the 2 font preloads that 182 pages have — template drift, same class PR #354 fixed. Copy `index.html:66-67` (keep `?v=2` on Bold). |
| LOW | `_headers` | `/assets/fonts/* max-age=31536000` overridden by the later `/assets/*` rule — fonts serve 7d not 1y (observed live). Move fonts block below `/assets/*`. |
| LOW | `assets/css/style.css:411-421` | LCP H1 `fadeInUp 0.8s 0.15s` from opacity:0 delays LCP paint ~150–400ms on both homepages. |
| LOW | `tiktok/index.html:449` | 55.9KB PNG at 88×88 while a 2.2KB webp of the same icon exists unused. |
| LOW | `assets/img/og/` | 200 OG PNGs, 101MB (~520KB each) — no CWV impact; slow social unfurls + deploy bloat. Recompress <300KB. |
| INFO | hero fallback JPGs | `hero-en@2x.jpg` 883KB / `hero-ja@2x.jpg` 408KB inside `<picture>` — ~never fetched by modern UAs. |

PSI API quota-exhausted again (429, single attempt) — figures are lab-derived; CrUX p75 confirmation still pending an API key (owner action).

### Images — 93/100

659/659 `<img>` have width+height; 0 lazy-loading gaps; heroes `<picture>`+WebP (June's standing LOW resolved). Deductions: tiktok PNG, OG set weight, fallback JPG sizes.

### Visual / Mobile — 84/100 (feeds On-Page)

**0px horizontal overflow on all 6 target pages AND all 30 other table-bearing blog pages at 390px** — the recurring bug class is fully clean for the first time. The OSS article's 426px table is correctly wrapped in `.table-scroll`.

| Sev | Location | Issue |
|-----|----------|-------|
| MEDIUM | 21 live pages (best-memo-apps-2026, faq, about, privacy, terms, 12× vs/…) | Mobile-only: JA/EN pill labels sit −16px off-center on the 44px control (`.lang-switcher__btn` anchors aren't flex-centered; only `.lang-switcher__link` is). One CSS rule fixes all 21. |
| MEDIUM | `/vs/capacities/` desktop | Nav has 14 items (duplicate ダウンロード link + CTA) → 10 labels wrap mid-word (使い/方, メソッ/ド) and overflow the 57px nav. Drop the duplicate to match the 13-item template. |
| LOW | OSS article | No in-body App Store CTA (money articles carry 3); apps.apple.com reachable only via hamburger on mobile. |
| LOW (standing) | `/`, `/en/` | Lang dropdown toggle 32px tall vs 44px guideline (unchanged since June). |
| INFO | screenshots | Hamburger-menu "transparency" in captures is a headless artifact — proven opaque (rgba(7,11,20,0.97), elementFromPoint 4/4). |

Above-fold: H1 + App Store badge above fold on both homepages; midnight theme uniform (18.18:1 body contrast, muted text ≥5.01:1 AA); JA headings clean (`word-break:auto-phrase`); sticky CTA never covers footer links. 30 screenshots in the session scratchpad.

### AI Search Readiness — 88/100

Exceptional base: llms.txt with CORRECT/WRONG citation wording + 30-topic source map + 9 sourced quick-answers (updated today); speakable on 208/229; TL;DR on 67; FAQPage on 41; robots.txt allows GPTBot/ClaudeBot/PerplexityBot/OAI-SearchBot/Google-Extended; all 69 llms.txt URLs live 200. Dinged for: the banned claim inside llms.txt itself (Top-issue #3), FAQ-schema parity on the flagship listicle, TL;DR missing on 2 of the top-5 pages (`obsidian/`, `apple-watch/`).

---

## Notes

- Page count vs June: 225–232 → 232 on disk (224 indexable). `vs/`×39 + `use-cases/`×22 are the big clusters; both measured non-doorway.
- The three biggest deduction drivers (invisible-FAQ cluster, captio-method page, en/vs double-slash) all **predate the June baseline** — surfaced now because this audit's parity/integrity sweeps went site-wide for the first time.
- PSI/CrUX field data still unavailable (API quota). Lab signals are uniformly green.
- Disavow file at `docs/disavow.txt` (264 domains) — GSC upload is a manual owner action (standing).
- Next Captio SERP rank check due ~2026-08-01 (monthly cadence).
