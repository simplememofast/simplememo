# Ahrefs 2026-09-09 crawl: recheck and fixes on 2026-09-14

## Evidence and scope

Five user-supplied UTF-16 TSV exports were read as audit data: 444 internal URLs, 8,041 anchor rows, 152 links to 4xx, 368 robots-blocked links, and 374 uncrawled links. UI text describing title, H1, description, word count and canonical changes is change tracking, not by itself a defect.

The current `origin/main` was inspected in an isolated worktree. The original working directory's uncommitted work was preserved. The current sitemap contains 273 indexable pages. Ahrefs counts remain historical until a new crawl; this report does not claim they have cleared.

## Repairs

- `/fastest-voice-memo/` and `/hands-free/`: the NPA reference `/bureau/traffic/anzen/nagara.html` currently returns 404. Both links now point to the [official phone-use guidance](https://www.npa.go.jp/bureau/traffic/keitai/info.html), verified HTTP 200.
- `/vs/dynalist/`: `https://blog.dynalist.io/` and `/obsidian/` still return 500. References now use the [Dynalist changelog](https://dynalist.io/changelog) and [Obsidian introduction](https://obsidian.md/about), both HTTP 200. Japanese and English prose was updated to match these sources, removing historical-blog claims that the replacement sources do not establish.
- `/memo-inbox/` and `/memo-inbox/guide`: added OG image, dimensions, alt text and X card metadata. The shared 1200×630 image is a screenshot of the empty browser app, without personal notes. Memo Inbox remains separate from the iPhone app.
- `/devlog/uikit-vs-swiftui`: the article declared only `BlogPosting` but used `dependencies` and `proficiencyLevel`, whose schema.org domain is `TechArticle`. It now declares both `BlogPosting` and `TechArticle`.
- `/voices/`: removed five unrated, anonymous tester-summary objects from `Review` markup while preserving all visible feedback. The existing rated public review remains; the app node now includes its free offer and a supported application category.
- `/memo-inbox/`: uses `WebPage` structured data, preserving description, language, free access and license. The browser tool has no documented ratings; no rating was invented to satisfy software rich-result requirements. Application-only properties were removed with the former `WebApplication` type.
- Added relevant incoming links to the nine pages with only one distinct linking page: English note-to-self comparison, LINE Keep, open-source memo apps, Google Keep status, official Obsidian Sync, Voice Shift methodology, email-yourself app comparison, and the two Memo Inbox pages. The formerly isolated Memo Inbox pair is now reachable from the English guide hub.
- SEO CI now checks all four core OG properties and an explicit X card type, disallowed technical-article properties, and missing review ratings. Negative fixtures exercise the new failures; valid co-types, attribute ordering and OG fallback remain accepted.

The schema.org vocabulary was checked across all current sitemap JSON-LD nodes. The only property-domain mismatch found before editing was the technical article above. This is a local vocabulary check, not a claim of a fresh Google Rich Results Test for every URL. Google requires [price and a rating or review for software rich results](https://developers.google.com/search/docs/appearance/structured-data/software-app); [Review markup](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) requires a rating. Nested product mentions can be schema.org-valid without qualifying as standalone software rich results.

## Findings that do not justify removing working links

The 152 exported 4xx link rows are 107×403, 44×429 and 1×404, covering 89 unique targets. The 82 non-429 targets and one representative App Store target were rechecked with a browser user agent: 78 returned 200, four returned 403, and one returned 404 (the NPA link repaired above). Six other 429 App Store targets were not separately retried. Tracking and custom-product-page parameters were preserved.

The two highlighted parenting citations are still usable:

| Target | Browser user agent | AhrefsBot user agent |
|---|---:|---:|
| `https://www.cfa.go.jp/policies/kokoseido/` | 200 | 404 |
| `https://www.psychologytoday.com/us/basics/parenting` | 200 | 403 |

These status differences reproduce the Ahrefs report without establishing deleted content. Both sources are retained. The remaining 403 responses were AlternativeTo, the SME Agency white-paper index and two G2 review URLs; a 403 alone was not treated as a deleted page.

All 368 robots-blocked link rows target external services. They include 241 Ahrefs analytics script references and 67 X profile references. Six other uncrawled rows report Ahrefs crawl-speed limits. No internal robots exclusion is established by these exports. The external timeout target, `https://www.jstage.jst.go.jp/browse/jjhep`, returned 200 on recheck.

The three internal redirects are the expected HTTP/www-to-HTTPS-apex redirects. The anchor export's redirect destinations are external (primarily App Store and DOI resolution); removing these redirects or tracking would not improve the cited content.

## AI access, performance, and notification

Production robots.txt explicitly allows OAI-SearchBot, Claude-SearchBot, PerplexityBot and the other intended search agents. The existing CCBot, Bytespider, Amazonbot and Diffbot denials are intentional policy and were preserved. Requests to the homepage with the first three agents returned 200. User-agent probes do not establish accessibility from each provider's actual IP ranges.

The reported slow HTML page `/blog/email-self-task-management` loaded in 0.105–0.175 seconds in three local HTTP checks (the export recorded 1.129 seconds). This does not measure browser Core Web Vitals or disprove region-specific slowness; no speculative performance changes were made.

Sitemap lastmod values are regenerated from the actual content changes. After publication, the existing IndexNow notifier can submit the current public sitemap set to cover the report's older unsubmitted-change warning. Receipt by IndexNow does not guarantee indexing, rankings, or an immediate Ahrefs status change.

## Validation

Local SEO validation passed with 0 errors and 0 warnings; all 40 guard assertions passed. All 5,719 typed JSON-LD nodes passed the current schema.org property-domain check. Each of the nine weakly linked pages now has two distinct linking pages. Direct internal-link resolution, closed markup, asset cache versions, constants, visible FAQ parity and content-derived sitemap lastmod checks passed. Mobile browser checks found no horizontal overflow on either guide hub or Memo Inbox page. An adversarial review of the complete draft found no material issues. Full CI, deployment confirmation and IndexNow response are recorded in the associated PR and task completion report.
