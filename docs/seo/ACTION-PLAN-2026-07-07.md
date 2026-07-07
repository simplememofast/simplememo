# SEO Action Plan — 2026-07-07

Source: `FULL-AUDIT-REPORT-2026-07-07.md` (score 92/100, up from 88). Priorities: **Critical** = blocks indexing/penalty risk (fix immediately) · **High** = significant ranking/trust impact (≤1 week) · **Medium** = optimization (≤1 month) · **Low** = backlog.

## Critical — fix immediately

1. **`en/send-email-to-yourself/index.html:117` ItemList repair** — all 8 "Best Apps to Email Yourself" items are named "Simple Memo - for Obsidian" (PR #342's brand sweep overwrote the 7 competitor names; spammy-structured-markup / manual-action class, live since 06-11).
   → Restore the 7 names from `git show c37349a0` (Boomerang, Note To Self Mail, Email Me, Pigeon, Drafts, Apple Notes + Share Sheet, iOS Shortcuts). Same PR: headline + WebPage.name "8 Best Apps…" → current "…5 Methods…" title, bump dateModified. Add "ItemList item names ↔ visible entries" to the fix-PR checklist. (The other 4 single-name #342 replacements were verified legit — no wider sweep needed.)

## High (fix within 1 week)

2. **Delete the 3 hidden-EN Question objects** — `blog/meeting-memo-template.html:79`, `blog/memo-app-encryption-comparison.html:210`, `blog/memo-app-privacy.html:224` (EN Q&As visible only inside `data-lang="en"` divs; EN sister pages already carry them). Exact #369 recipe, delete-only.
3. **FAQ answer-layer parity — 38 questions / 12 pages**: regenerate `acceptedAnswer.text` from the served `faq-answer` innerHTML (tag-stripped; quote-glyph transforms tolerated). Pages: `en/blog/best-note-to-self-apps-2026:67` (8), `en/blog/ios26-speechanalyzer-live-mic:64` (5), `hands-free:75` (5), `faq.html:249` (5), `blog/line-keep-alternative:228` (4), `en/obsidian:78` (4), `en/faq.html:219` (2), `vs/captioo:68`, `blog/meeting-memo-template:79`, `blog/memo-app-encryption-comparison:210`, `blog/memo-app-hikaku-matome:55`, `en/apple-watch:77` (1 each). One script, one PR with item 2.
4. **`/en/apple-watch-obsidian/` completion bundle** (active Yahoo!ニュースPR target, pos 3.2): add the hero `<picture>` (reuse JA's WebP assets + preload/fetchpriority posture); meta description 247ch → ≤160; title 76ch → ~60; dedicated OG image (add compress step or manual <300KB); reword "as fast as Captio did" / "the same self-email speed as Captio" → hedged JA pattern ("like Captio", no speed equivalence); re-stamp llms.txt Last-updated while touching it.
5. **`voices/index.html:465`** — "★4.4・8件" → 10件 (only 3-point-sync break site-wide; one character).

## Medium (fix within 1 month)

6. **Homepage entity graph**: fix/collapse the duplicate `#organization` (`index.html:91`, `en/index.html:89`) — align first block's sameAs to the canonical 8 (drop live-404 qiita-org, add prtimes) or merge to a single definition; drop qiita-org from the 2 Person blocks; remove/replace live-404 `github.com/hajimeataka` in 7 author sameAs blocks (pending owner decision on restoring the handle).
7. **Sensitive-path exposure**: extend the `functions/_middleware.js:59-64` 404-block (currently `/docs/`) to `/CLAUDE.md`, `/scripts/*`, `/tools/.env.example` (verified no secrets today — ops-intel hygiene). While in the file: fix the stale comment at :32-36.
8. **Cargo-cult font preloads (10 pages)**: `vs/mem`, `vs/anytype`, `vs/tana`, `vs/heptabase`, `blog/information-organization-guide`, `blog/email-self-task-management`, `blog/email-management-tips`, `use-cases/researchers`, `use-cases/writers`, `use-cases/designers` preload ~161KB NotoSansJP with zero @font-face. Delete the pair — or better, migrate these fully-inline pages to style.min.css (they also use `var(--accent)` with no definition anywhere).
9. **CF Web Analytics is dead site-wide**: CSP blocks `static.cloudflareinsights.com/beacon.min.js` (1 console error/page, zero data collected). Either add the host to script-src + connect-src in `_headers`, or owner turns off the injection (dashboard). Decide, don't leave half-on.
10. **Sitemap generator idempotency**: add monotonic floor `max(existing, git-derived)` to `scripts/generate_sitemap.py` (today a regen would rewrite 44 lastmods, 38 backward — squash-merge artifact). Until it lands: never regen without diff review. Same PR: fix index entry for sitemap-en (07-02→07-03) and bump the 6 stale lastmods (/apple-watch/, /obsidian/, /en/apple-watch/, /en/obsidian/, /voice-input/, /hands-free/).
11. **W4 description overshoot**: retrim the 36 JA descs >120fw (worst: `use-cases/moving` 134.5fw, `use-cases/teachers` 133.5, `vs/ios-shortcuts` 133.0); vary or drop the boilerplate CTA tail shared by 22 of them.
12. **`blog/iphone-memo-app-fast.html:359`** — soften 「…を実現した唯一のアプリ」 (unevidenced; contradicts own vs/drafts page).
13. **Residual #11 font preloads (15 EN pages)**: en/faq, en/about, en/blog/best-memo-apps-2026, 12× en/vs/* — copy the `index.html:66-67` pair (subset @font-face has no unicode-range, so EN pages do fetch the fonts).

## Low (backlog)

14. 2-hop redirect chains: short-circuit `/blog/captio-alternatives-comparison.html` and `/blog/memo-shuukan-tips.html` to final targets in the middleware before the blanket `.html` strip.
15. OG weight stragglers: `og/apple-watch-obsidian.png` 516KB → <300KB + add compress to the `--only` pipeline; recompress the 3 root-level legacy PNGs (ogp.png / og-captio-alternative.png / og-note-to-email.png, ~650KB each) or repoint their 5 pages to og/ equivalents.
16. og/tw title sync: `vs/google-keep/` (3-way drift), `en/obsidian/` (old prefix), `en/vs/google-keep-vs-apple-notes` (tw only).
17. `/captio-alternative/` mobile: wrap the 841px table in `.table-scroll` (same pattern as the OSS article fix).
18. `blog/open-source-memo-apps`: add a mid-body App Store CTA (currently bottom-only vs 3-CTA money-page convention).
19. New-LP polish: "SimpleMemo" ×5 → canonical name + `:354` double-name artifact on the JA LP; visible publish dates on both LPs; `glossary/digital-detox` 唯一/"Only" CTA softening.
20. W11 robots-meta stragglers ×18 (15 missing incl. 12× en/vs/*, 3 bare) — consistency only.
21. Watch LPs: reference the rated `#app` entity by @id instead of anonymous inline `about` (schema opportunity, no conflict today).

## Owner actions (cannot be done from the repo)

- **GSC disavow re-upload** — docs/disavow.txt, now 286 domains (attack ongoing 3–5/day).
- **GSC reindex** after items 1–5 land: en/send-email-to-yourself + the 3 hidden-EN pages + the 12 parity pages.
- **paji.me redirect flattening** (CF-1, ~5 min) and **Scrape Shield Email Obfuscation OFF** (~1 min).
- **CF Web Analytics** decision (item 9) · **PSI API key** (3rd audit without field data) · **github.com/hajimeataka** handle decision (item 6).

## Measurement (continuity)

- **7/29–30**: CTR evaluation of the 11 frozen retitles + staged AI-query FAQ additions (`ahrefs-gsc-analysis-2026-07-07.md` §4); JA-title item #18 decision follows.
- Watch LP trajectory (pos 3.2 @ 4 days) through the Yahoo!ニュース window; next Captio SERP check ~08-01.
- Re-audit after Critical+High: expect **93–94** with Schema back ≥90.
