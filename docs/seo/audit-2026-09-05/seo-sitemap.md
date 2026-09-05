# seo-sitemap — simplememofast.com full audit 2026-09-05

Checkout: `wt` = origin/main @ 0a4bd04c (PR #876). Crawl: `crawl/crawl.jsonl` (279 records, 276×200 / 3×404). Live requests used: 6 HEADs (4 sitemaps, robots.txt, llms.txt). Scripts: `work-seo-sitemap/analyze.py` (structure/coverage/hreflang/freshness), `lastmod_honesty.py` (261-URL classification + 25 sample, output `lastmod_rows.json`), `doorway_sim.py`, `llms_check.py`; fix input `lastmod_fix_proposal_138.json`.

## 1. Subscore: 88/100

Down from 96. Structure, coverage, locale routing, hreflang, redirect hygiene and llms.txt are all clean (261/261 live 200, self-canonical, 0 hops, 0 noindex, 0 missing, 0 extra), and every 07-07 mechanical item held. The drop is one regression: the 07-07 subscore rested on a "lastmod TRUSTWORTHY / zero fabricated stamps" verdict, and that verdict is now false — 170 of 261 lastmods (65%) are a mechanical `2026-08-20` stamp written by PR #519's generator run (the pre-08-22 `TODAY` fallback), 138 of them on files with no commit at all that day, and the 07-07 monotonic floor now makes those dates permanent (HIGH, −6). Plus 8 lastmods understating real 09-04/09-05 edits because CI's `--check` compares URL sets only (MEDIUM, −2). Two LOWs (concatenated Cache-Control on the sitemaps since #813; a self-only hreflang on /templates/) are noted without further deduction.

## 2. Held / regressed from 07-07

| 07-07 item | Status | Evidence checked |
|---|---|---|
| #10a monotonic floor `max(existing, git-derived)` in generator | HELD (with side-effect, see F1) | `wt/scripts/generate_sitemap.py:102-124` `read_existing_lastmods()`, `:459 lastmod = max(published, computed) or TODAY`; dry-run today "kept 170 published dates" |
| #10b sitemap.xml index entry for sitemap-en 07-02→07-03 | HELD | `wt/sitemap.xml` en entry 2026-09-03 = max(sitemap-en.xml lastmod) 2026-09-03 |
| #10c bump 6 stale lastmods | HELD | /apple-watch/ 08-21, /obsidian/ 09-02, /en/apple-watch/ 08-20 (#518 real nav-link edit), /en/obsidian/ 09-02, /voice-input/ 09-02, /hands-free/ 09-02 |
| #31 (07-02 LOW) index lastmod = max(child lastmods) | HELD | ja 09-03/09-03, en 09-03/09-03, locales 09-02/09-02; generator `newest()` `:463-467` cites #31 |
| 07-07 verdict "lastmod honesty TRUSTWORTHY, zero fabricated stamps" | REGRESSED | 170/261 fabricated by #519 on 2026-08-21 — F1 |
| 07-07 INFO "JA/EN children stamp sweeps asymmetrically" | REGRESSED (inverted) | #519 stamped 177 ja + 36 en; all 32 surviving EN stamps trace to #518 |
| 07-07 "226/226 matched, canonical agreement, hreflang 0 defects" | HELD | now 261/261 matched, 261/261 self-canonical, 82 hreflang URLs / 0 return-link defects |

## 3. Findings

| Sev | Location | Issue | Evidence | How verified | Fix |
|---|---|---|---|---|---|
| HIGH | `wt/sitemap-ja.xml` (137 URLs) + `wt/sitemap-en.xml` (33 URLs); origin commit `2e177e99` (#519, 2026-08-21) | 170/261 lastmods (65%) are a mechanical `2026-08-20` stamp, not a content change: 138 URLs have **no git commit at all** on that date; 32 (all EN) were touched only by the 47-HTML nav-link sweep `a545986a` (#518). The 07-07 floor now ratchets these forward-only, so no regen can repair them. | `git show 2e177e99 -- sitemap-ja.xml sitemap-en.xml \| grep -c '^+ *<lastmod>2026-08-20'` = **213** (ja 177 / en 36) while #519 changed only 22 HTML files; generator at that commit `scripts/generate_sitemap.py:120 return LASTMOD_INDEX.get(rel, TODAY)` (removed 08-22 by #525, whose comment records "2026-08-19 と 08-20 の2回、手でlastmodを戻している"); `--dry-run` today: "kept 170 published dates that git history would have moved backward" = exactly these 170. Example `/vs/todoist/`: lastmod 2026-08-20, last non-sweep commit 2026-03-18, JSON-LD dateModified 2026-06-05. | source + git (`lastmod_honesty.py`) | One-off repair PR: set the 138 orphan URLs to `max(git non-sweep date, JSON-LD dateModified)` from `work-seo-sitemap/lastmod_fix_proposal_138.json` (result: 92→2026-06, 24→07, 19→08, 3→03/05); keep the 32 #518-touched EN URLs (real link edit). The floor then holds the corrected dates. Add a `--reset-floor <url-list>` (or ledger) path to the generator so a future bad stamp is repairable without hand-editing 138 lines. |
| MEDIUM | `wt/scripts/generate_sitemap.py:286-300` (`check_committed` compares URL sets only); 8 URLs | 8 lastmods understate real edits merged 09-04/09-05 in PRs that did not run the generator; 4 of them contradict the page's own JSON-LD dateModified `2026-09-04`. CI cannot see this class. | `/privacy-architecture/` lastmod 2026-08-11, git non-sweep 2026-09-04 (#857), page `"dateModified":"2026-09-04"`; same shape: `/en/privacy-architecture/` 08-11, `/obsidian/plugins/` 09-02 (#846), `/en/obsidian/` 09-02; git-only: `/privacy` 08-11, `/en/privacy` 08-11, `/obsidian/` 09-02, `/autopilot/` 09-03 (vs #875 09-05) | git + crawl pages | Regenerate in the repair PR. Then make `--check` also fail when git non-sweep date > published lastmod (forward-only comparison cannot flap daily; the flapping reason in the docstring died with the 08-22 TODAY-fallback removal). |
| LOW | `wt/_headers:32` (`/*` `Cache-Control: public, no-cache`, PR #813 `d77f18e3` 2026-09-03) vs `:74-88` (`/sitemap*.xml`) and `:103` (`/llms.txt`) | Cloudflare Pages concatenates the two rules, so the four sitemaps and llms.txt ship a contradictory Cache-Control; the intended 1h/24h TTL is dead. | Live HEAD 2026-09-05: `cache-control: public, no-cache, public, max-age=3600` on sitemap.xml / -ja / -en / -locales; llms.txt `public, no-cache, public, max-age=86400`; robots.txt still `public, max-age=86400` (cf-cache-status REVALIDATED edge object). Content-Type is correct on all six (`application/xml; charset=utf-8` / `text/plain; charset=utf-8`). | live fetch (6 HEADs) | Delete the `Cache-Control:` line from the 4 sitemap blocks and the `/llms.txt` block so they inherit `public, no-cache` (revalidate-always is the right posture for a sitemap; ETags give 304s). The file's own `/en/*` comment at `:50-53` documents this exact trap. Technical agent: same concatenation likely on `/verify`, `/compose` blocks. |
| LOW | `wt/templates/index.html:51-52` | Only sitemap URL whose on-page hreflang (ja + x-default, both self-referencing) has no sitemap counterpart; a self-only set is a no-op and violates the house rule that JA-only pages carry no hreflang. | `<link rel="alternate" hreflang="ja" href="https://simplememofast.com/templates/">` + x-default identical; `sitemap-ja.xml` entry has 0 `xhtml:link` | source + crawl | Delete the two lines (or ship an EN sister and register the pair in `i18n_config.JA_EN_PAIRS`). |
| LOW | 61 pages with honest lastmod | Sitemap lastmod is newer than the page's JSON-LD dateModified: the page really changed but dateModified was not bumped, so the two freshness signals disagree. 17 sitemap pages carry no dateModified at all (hubs/legal). | `/about/` lastmod 2026-09-02 vs dateModified 2026-06-05; `/hands-free/` 09-02 vs 06-05; `/voice-input/` 09-02 vs 06-05. Site-wide (244 pages with dateModified): lastmod > dateModified 226 (170 of them = F1), equal 14, lastmod < dateModified 4 (= F2). | crawl pages + git | Add "bump dateModified when body copy changes" to the PR checklist; the F1 repair should use max(git, dateModified) so the sitemap never claims older than the page. |
| INFO | sitemap-wide | True freshness (last non-sweep git edit): 80/261 pages have no real edit since before 2026-06-01, 46 last edited in March; the published histogram (all 261 in 2026-08/09) hides this. | git: 2026-03: 46 · 05: 34 · 06: 17 · 07: 51 · 08: 55 · 09: 58. Published: 2026-08: 207 · 2026-09: 54 (most common date 2026-08-20 ×170). Caveat: >40-file commits are excluded, so pages touched only by the 06-05 rebrand / 06-23 integrity sweeps show as older than their last visible change. | git | None here; input for the content agent's refresh queue. |

### Supporting detail

**Lastmod honesty — what the floor does and whether it can mask understatement.** `read_existing_lastmods()` reads the published dates from the 3 committed children; `lastmod = max(published, computed) or TODAY`. A regen can only move a date forward (git non-sweep date newer than published) or keep it; TODAY applies only when both are empty (a genuinely new file). It therefore does **not** mask understatement: a real edit that git sees as a <40-HTML commit is always pulled forward. What it masks is the opposite — any past inflation becomes permanent (the ratchet has no release), which is exactly the 170 × 08-20 stamps. Understatement still slips through in two ways the floor is silent about: edits landed only in >40-HTML squash commits (classified as sweeps → no signal), and PRs that never run the generator (the 8 in F2) — and CI's `--check` compares URL sets only, so neither is caught.

**25-URL stratified sample** (`lastmod_honesty.py`; deterministic every-k-th of URL-sorted strata; one URL, `/blog/open-source-memo-apps`, fell in two strata → 24 distinct). Columns: sitemap lastmod · git last non-sweep · git last any · page dateModified · class.

| # | URL | lastmod | git non-sweep | git any | dateModified | class |
|---|---|---|---|---|---|---|
| 1 | /about/ | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-06-05 | honest |
| 2 | /blog/free-memo-apps-ranking | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-09-02 | honest |
| 3 | /blog/obsidian-voice-input | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-07-10 | honest |
| 4 | /download/ | 2026-09-02 | 2026-09-02 | 2026-09-03 | — | honest |
| 5 | /en/obsidian/ | 2026-09-02 | 2026-09-04 | 2026-09-04 | 2026-09-04 | UNDERSTATED |
| 6 | /hands-free/ | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-06-05 | honest |
| 7 | /note-to-email/ | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-07-02 | honest |
| 8 | /obsidian/pricing/ | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-08-23 | honest |
| 9 | /pt-BR/ | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-07-25 | honest |
| 10 | /voice-input/ | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-06-05 | honest |
| 11 | /apple-watch-obsidian/ | 2026-08-21 | 2026-08-21 | 2026-09-03 | 2026-07-07 | honest |
| 12 | /blog/gen-z-memo | 2026-08-20 | 2026-03-08 | 2026-09-03 | 2026-06-05 | INFLATED (orphan) |
| 13 | /blog/open-source-memo-apps | 2026-08-20 | 2026-07-02 | 2026-09-03 | 2026-07-02 | INFLATED (orphan) |
| 14 | /en/blog/best-memo-apps-2026 | 2026-08-20 | 2026-08-11 | 2026-09-03 | 2026-08-12 | INFLATED (sweep-stamp #518) |
| 15 | /en/roadmap/ | 2026-08-22 | 2026-08-22 | 2026-09-03 | 2026-08-22 | honest |
| 16 | /glossary/captio-method/ | 2026-08-20 | 2026-07-02 | 2026-09-03 | 2026-07-02 | INFLATED (orphan) |
| 17 | /guides/gmail-star-todo/ | 2026-08-20 | 2026-05-30 | 2026-09-03 | 2026-06-05 | INFLATED (orphan) |
| 18 | /obsidian/plugins/dataview/ | 2026-08-22 | 2026-08-22 | 2026-09-03 | 2026-08-22 | honest |
| 19 | /use-cases/reading-notes/ | 2026-08-20 | 2026-08-11 | 2026-09-03 | 2026-06-05 | INFLATED (orphan) |
| 20 | /vs/ios-shortcuts/ | 2026-08-20 | 2026-03-18 | 2026-09-03 | 2026-06-05 | INFLATED (orphan) |
| 21 | /ai-tags/ (new since July) | 2026-09-02 | 2026-09-02 | 2026-09-03 | 2026-07-25 | honest |
| 22 | /blog/open-source-memo-apps (new) | 2026-08-20 | 2026-07-02 | 2026-09-03 | 2026-07-02 | INFLATED (orphan) |
| 23 | /en/guides/ (new) | 2026-08-18 | 2026-08-18 | 2026-09-03 | 2026-06-05 | honest |
| 24 | /obsidian/apple-watch-not-working/ (new) | 2026-08-21 | 2026-08-21 | 2026-09-03 | 2026-08-11 | honest |
| 25 | /obsidian/shortcuts-not-working/ (new) | 2026-08-21 | 2026-08-21 | 2026-09-03 | 2026-08-11 | honest |

Sample: 16 honest / 8 inflated / 1 understated (32% inflation; the recent stratum is honest by construction). Site-wide, all 261: **83 honest, 138 inflated-orphan, 32 inflated-sweep-stamp, 8 understated → 65% inflation rate.** "git any" = 2026-09-03 everywhere is the three 09-03 horizontal-scroll sweeps (#803/#810/#824, 269 pages) correctly ignored by the generator.

**GSC 09-02 cross-reference (11 canonical crawled-not-indexed URLs).**

| URL | sitemap lastmod | last real edit (git non-sweep) | dateModified | verdict |
|---|---|---|---|---|
| /glossary/e2e-encryption/ | 2026-09-02 | 2026-09-02 (#781, 3,259→7,620 chars) | 2026-09-02 | real change, honest |
| /glossary/timeboxing/ | 2026-09-02 | 2026-09-02 (#781) | 2026-09-02 | real change, honest |
| /use-cases/meeting-notes/ | 2026-09-02 | 2026-09-02 (#781) | 2026-09-02 | real change, honest |
| /vs/roam-research/ | 2026-09-02 | 2026-09-02 (#781, factual fix) | 2026-09-02 | real change, honest |
| /blog/business-memo-apps-2026 | 2026-08-20 | 2026-06-11 | 2026-08-12 | untouched, stamped |
| /vs/captioo/ | 2026-08-20 | 2026-07-07 | 2026-06-05 | untouched, stamped |
| /guides/draft-autosave/ | 2026-08-20 | 2026-05-30 | 2026-06-05 | untouched, stamped |
| /vs/todoist/ | 2026-08-20 | 2026-03-18 | 2026-06-05 | untouched, stamped |
| /blog/instant-capture-workflow | 2026-08-20 | 2026-08-11 | 2026-06-05 | untouched, stamped |
| /blog/freelance-memo-management | 2026-08-20 | 2026-03-21 | 2026-06-05 | untouched, stamped |
| /devlog/day1 | 2026-08-20 | 2026-08-11 | 2026-06-05 | untouched, stamped |

The 4 pages the 09-02 index requests depend on are the honest ones; the 7 untouched pages advertise a change Googlebot will not find when it recrawls, which is the pattern that makes Google discount the site's lastmod as a whole — the cost of F1 lands on precisely the recrawl push the 09-02 plan needs.

**Index-coverage reality → sitemap policy.** Confirmed: no sitemap URL redirects (261/261 `hops: []`, status 200), and the 4 retired/301'd sources (`/blog/memo-app-free-guide`, `/blog/line-keep-migration`, `/blog/captio-alternatives-comparison`, `/blog/memo-shuukan-tips`) are absent. The 52 `?lang=`/`.html` variants and 2 consolidated sources in GSC are correctly outside the sitemap; I concur with the 09-02 doc's rejection of a temporary `sitemap-legacy.xml` (moves rows between failure buckets, breaks the `check-internal-redirects` invariant, Mueller-rated "minimal" effect). Owner-decision candidates, restated with the data, not decided: (1) `/blog/business-memo-apps-2026` → `/blog/best-memo-apps-2026`: 21-day window 0 impressions vs 1,579 at the target (all 13 "ビジネス" queries, pos 3.3); last real edit 06-11; meets the 08-11 precedent (target has traffic, source is zero, same intent). (2) `/vs/captioo/` (+`/blog/captioo-alternative`) → `/captio-alternative/`: 0 "captioo" queries site-wide; target 42 imp, `/blog/captio-discontinued` 10 imp/3 clicks; the Captio/Captioo/own-app disambiguation can move as one section. If either is executed: delete the file (generator drops it automatically), add the path to the retired map in `functions/_middleware.js`, and `check-internal-redirects` will keep it out of the sitemap. `/guides/draft-autosave/`: accept non-indexation (product doc, zero demand) — matches the doc.

**Quality gates.** Location/doorway: 0 sitemap URLs match geo tokens (`analyze.py` regex over 261). `/vs/` 38 + hub, `/use-cases/` 21 + hub. Re-measured on a 10-page sample (`doorway_sim.py`: every-k-th of the sorted crawl bodies — vs/anytype, drafts, ios-reminders, moca, roam-research; use-cases/commute, freelancers, journaling, parents, shopping-lists; default-visible JA text only, `data-lang="en"` blocks + script/style/nav/header/footer removed, 8-char shingles, pairwise Jaccard, 45 pairs): mean 2.5%, max 8.3% (commute vs parents), within-/vs/ mean 4.1% / max 4.9%, within-/use-cases/ mean 4.6% / max 8.3%. Visible JA per page 2,091–5,049 chars. Consistent with the 07-02 4–6% finding; non-doorway.

**llms.txt.** 121 citations → 83 unique after stripping fragments/trailing punctuation; 81 are real URLs and all 81 are live 200, self-canonical, indexable and present in the sitemap; the other 2 are non-links (`https://simplememofast.com` on the "Website:" line, and the literal `https://simplememofast.com/<path>/` placeholder in the citation instruction). Live: 200, `text/plain; charset=utf-8`, 28,158 bytes = checkout.

## 4. Verified clean

- XML: all 4 files parse; index root `sitemapindex`, children `urlset`, both with the 0.9 namespace, `xmlns:xhtml` declared on the 3 children; 0 `priority`/`changefreq`; all 261 `lastmod` are `YYYY-MM-DD`.
- URLs: 261/261 absolute `https://simplememofast.com/…`; 0 `.html`, 0 `//`, 0 query/fragment, 0 `http:`; convention consistent (177 dir-style `…/`, 84 extension-less files, matching every live canonical); 0 duplicates within or across children.
- Locale routing: sitemap-en = 47, all `/en/…`; sitemap-locales = the 8 minor homepages exactly; sitemap-ja = 206 with no `/en/` or locale URL. Index entries = max(child lastmod) for all 3 (#31).
- Coverage vs checkout: 270 HTML files → 259 indexable via the generator's rules + `/templates/` + `/data/voice-shift/` (real 200 pages, self-canonical, index,follow) = 261 = sitemap; 0 missing, 0 extra. Excluded correctly: `404.html`, `admin/` ×3, `verify.html`, `compose.html`, `tiktok/`, `en/blog/revenue-report-2025`, `fixtures/`, `templates/` dir artefact. `generate_sitemap.py --check` and `--selftest` are wired in `seo-check.yml:1215-1217`.
- Coverage vs live crawl: 261/261 present, 200, `hops: []`, `final_url == loc`, `canonical == loc`, robots `index,follow`, no `X-Robots-Tag`, `text/html`. Crawled 200s outside the sitemap are only the intended noindex set, `.txt/.xml` files, and non-canonical variants that self-canonicalise to a sitemap URL (`/en`, `/index.html`, `/vs/notion/?lang=en`, `/en/vs/notion//`, `/blog/benchmark-methodology.html`, `/blog/captio-alternatives-comparison.html`).
- hreflang: 82 URLs carry sitemap alternates (10 TOP_CLUSTER + 36 JA/EN pairs ×2); every set equals the on-page `<link rel=alternate>` set exactly; 0 alternates pointing outside the sitemap; 0 missing return links; x-default present on all 82. ~165 JA-only pages have none (intentional per 2026-07-25 §5).
- Live headers: `Content-Type: application/xml; charset=utf-8` on all 4 sitemaps; robots.txt / llms.txt `text/plain; charset=utf-8`; robots.txt ends with `Sitemap: https://simplememofast.com/sitemap.xml`; robots disallows `/admin/ /docs/ /growth/ /fixtures/ /cdn-cgi/` for `*` and each named AI bot (none of those paths are in the sitemap). Live byte counts for sitemap.xml (475), robots.txt (3,394), llms.txt (28,158) equal the checkout; child sitemap bodies not re-fetched (rate rule).
- No redirecting URL in any sitemap; 50k-per-file limit irrelevant (max child 206).
- The 4 GSC-thickened pages carry honest 09-02 lastmod = dateModified.

## 5. Owner-only actions

1. **Do not resubmit the sitemap in GSC now.** Resubmitting re-advertises 170 fabricated dates. Resubmit once, after the F1 repair PR + regen is live; thereafter only on structural change (new child sitemap, mass URL change) — Google re-fetches the index on its own for content edits.
2. **Do not press "Validate fix"** on the crawled-not-indexed bucket yet (per the 09-02 doc: it fails again while any of the 11 canonical URLs stays unindexed). Check BigQuery on 9/17 and 9/24 for the 4 requested pages as planned.
3. **Decide the two consolidations** (`/blog/business-memo-apps-2026`, `/vs/captioo/`) with the data above; if approved, the repo side is one PR (delete + retired-path 301 + regen). No index requests are needed for the sitemap itself; if F2's pages matter (`/privacy-architecture/`, `/obsidian/plugins/` changed 09-04), an optional URL-inspection request after the regen is cheap.
