# SEO Action Plan — 2026-07-02

Source: `FULL-AUDIT-REPORT-2026-07-02.md` (score 88/100). Priorities: **Critical** = blocks indexing/penalty risk (fix immediately) · **High** = significant ranking/trust impact (≤1 week) · **Medium** = optimization (≤1 month) · **Low** = backlog.

## Critical — none

Indexing, redirects, security headers, sitemaps, and canonicals are fully healthy. Nothing blocks crawling or indexing.

## High (fix within 1 week)

1. **Correct `vs/line-keep-memo/` facts + de-cannibalize** — the page asserts "LINE Keep**メモ**は2024年8月にサービス終了" in title/meta/JSON-LD/body (9 spots); reality: Keepメモ continues, LINE Keep ended. Contradicts `blog/line-keep-alternative` on the sprint's 815-impression "line keepメモ 終了" cluster.
   → Fix facts throughout; re-angle the title toward the comparison intent (シンプルメモ vs Keepメモ) and leave the 終了 query to the blog article. (Alternative: 301 to the blog post per memo-shuukan-tips precedent — only if the comparison page has no independent GSC traffic.)
2. **`glossary/captio-method/` integrity repair** (missed by sweep #359): `2023年にApp Storeから削除` → `2024年10月に終了` (lines 270, 271, 292, 297 — both DOMs + both FAQs); delete the "安全性の低いアプリ"ポリシー cause-claim → "終了理由は公表されていません"; launch year `2009` → `2011頃` (:25, :29, :54, :62).
3. **Captio launch-year sweep** — same `2009`→`2011頃` on `glossary/index.html:458-459`, `vs/memo-post/index.html:339-340`, `vs/captioo/index.html:529,538` (incl. meta/JSON-LD).
4. **`llms.txt:189`** — rewrite "How to email yourself memos 10x faster" → speed-neutral (~1s launch, one-tap); re-stamp `Last updated`.
5. **FAQ schema↔visible parity (30 questions / 10 pages)**:
   - Delete invisible EN Question objects from JA pages: `vs/apple-notes:258` (5Q), `vs/google-keep:258` (5Q), `vs/notion-vs-evernote:145` (5Q), `blog/best-memo-apps-2026:226` (3Q). EN sister pages already carry them against visible text.
   - Sync drifted wording: `en/blog/ios26-speechanalyzer-live-mic:63` (4Q), `obsidian/:76` (1Q), `en/obsidian/:77` (3Q), `en/apple-watch/:76` (2Q), `en/blog/best-note-to-self-apps-2026:66`, `blog/line-keep-alternative:227` (brand-name language mismatch).
6. **Retitle desyncs from the sprint**: `captio-alternative/index.html:62` headline + `:863` WebPage.name → new title; `en/vs/google-keep-vs-apple-notes:30` og:title → "…Which Is Better?"; `en/send-email-to-yourself:25,30,44` og/twitter:title → "How to Email Yourself: 5 Methods Tested in 2026".
7. **`en/vs/*` double-slash schema URLs** — `en/vs/<slug>//` → `en/vs/<slug>/` across all 11 pages (@id, mainEntityOfPage, WebPage url, breadcrumb tail, `//#faq` ×3).

## Medium (fix within 1 month)

8. **best-memo-apps disclosure** — add the labeled 情報開示 block (copy `blog/line-keep-alternative`'s model) near the #1 self-listing; optionally tag entry #1 as 自社アプリ (`blog/best-memo-apps-2026.html:306,341`).
9. **OSS article completion** (`blog/open-source-memo-apps.html`): outbound-link the 6 official repos (page says "各公式リポジトリでご確認ください" but links none); add last-release recency per app; append the standard end-of-article App Store CTA block; page-specific OG image; optional ItemList schema.
10. **`en/blog/revenue-report-2025`** — every figure is a `[X,XXX]` TODO placeholder while the intro promises real numbers, and it's visibly linked from `en/blog/index.html:407` + ItemList. Fill with real data or unlink until ready; fix ":296 14 years"→13; repoint the 3 retired why-captio-died links (:296, :515, :631) to `/en/captio-alternative/`.
11. **Font preloads on 47 pages** — copy `index.html:66-67` preload pair (keep `?v=2` on Bold) to `en/index.html`, all 8 locale homepages, the new OSS article, `blog/email-to-obsidian`, `compose`, and the rest of the 47-page list (in scratchpad performance findings).
12. **`_headers` rule order** — move `/assets/fonts/*` below `/assets/*` so woff2 serves 1y immutable (currently overridden to 7d).
13. **Lang-switcher pill CSS** — `.lang-switcher--nav .lang-switcher__btn{display:inline-flex;align-items:center;justify-content:center}` in style.css + style.min.css (fixes 21 pages; keep min/source in sync — fingerprint_pages.js).
14. **`vs/capacities/` nav** — drop the duplicate ダウンロード text link (14→13 items; fixes desktop mid-word wrap + nav overflow).
15. **Locale MobileApplication schema** — add offers/softwareVersion/downloadUrl (copy JA/EN pattern) on the 8 locale homepages.
16. **`methods/gtd/` duplicate @id** — merge the leftover Speakable WebPage block (:263) into the root WebPage (:74).
17. **EN meta descriptions >170ch** — trim `en/obsidian/` (237), `en/apple-watch/` (190), `en/` (181), `en/iphone-shortcuts-email-guide/` (179) to ≤160.
18. **JA title lengths** — continue the suffix-drop retitle pattern on the highest-impression pages among the 97 >32fw (45 are >40fw); fix the 81ch `en/blog/ios26-speechanalyzer-live-mic` title.
19. **Schema dateModified bumps** on the 8 sprint-edited JA pages (e.g. best-memo-apps 06-18 vs git 07-01; aes-gcm 06-05 vs 07-02).
20. **publisher name/alternateName swap** on `blog/open-source-memo-apps:60` + `blog/email-to-obsidian` (JA convention: name=Obsidian連携シンプルメモ).

## Low (backlog)

21. `blog/line-keep-alternative` TL;DR "7候補"→"5つ" (align with hero/body).
22. `zh/index.html` — 15× 約→约.
23. Thin-tail deepening: `use-cases/teachers` (1,476 chars) first, then the 9 sub-1,700 glossary entries.
24. `tiktok/index.html` — switch :449 to the existing 2.2KB webp; strip dead dual-DOM markup.
25. OG image set — recompress 200 PNGs (101MB → <300KB each).
26. Hero H1 `fadeInUp` — remove 0.15s delay / animate transform-only (LCP paint).
27. Hero fallback JPGs — recompress or drop @2x from fallback srcset (883KB/408KB, rarely fetched).
28. Homepage lang dropdown toggle → min-height 44px (standing).
29. `.table-scroll` swipe affordance (edge fade) on the OSS article.
30. `use-cases/teachers:355` link the Edutopia reference; `vs/memo-post:339` soften/evidence "最もアクティブ".
31. Sitemap generator: stamp index entries with each child's real change date (locales child overstated).
32. CSP `unsafe-inline` → nonce/hash (standing, low for static site).

## Owner actions (cannot be done from the repo)

- **GSC reindex requests** after the High fixes land: `vs/line-keep-memo/`, `glossary/captio-method/`, `glossary/`, `vs/memo-post/`, `vs/captioo/` — plus the June-23 integrity-sweep pages (their sitemap lastmod was intentionally not bumped, so GSC URL Inspection is the recrawl path).
- **Disavow upload** — `docs/disavow.txt` (264 domains) to GSC if not yet done (standing from PR #367).
- **PSI API key** — CrUX field-data confirmation has been quota-blocked two audits running.
- **App Store check** — confirm live app version still 3.4 (13 schema blocks assert it); OG images + final launch-median items from the June owner list remain open.

## Measurement (continuity)

- Next monthly Captio SERP rank check ~2026-08-01.
- CTR-sprint retitle evaluation (PR #367 targets): compare GSC CTR for the 9 retitled URLs after ~4 weeks of data (≈2026-07-29).
- Re-audit checkpoint after High+Medium items land: expect 92–94 with Content back ≥85.
