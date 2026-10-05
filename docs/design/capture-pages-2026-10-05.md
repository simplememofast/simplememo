# Capture pages — 2026-10-05 design release

This release extends the visual direction of the Obsidian landing page (PR #1994)
to ten Japanese pages. It is a design release, not evidence of a change in LTV.

## Selection

There is no verified page-level LTV ranking. The existing
`monetizationRelevance()` in `growth/lib/gsc.mjs` supplies a **hypothesis** about
frequent-capture use cases, not measured revenue. We selected Japanese pages in
its highest tier (1.0), excluding the already redesigned `/obsidian/`, then
sorted by GSC clicks and, for ties, impressions.

The verified GSC handoff from run `37081053944` was collected on 2026-10-03 and
covers the complete 28-day window 2026-09-02–2026-09-29. The source snapshot's
SHA-256 was checked against its collection receipt. No private analytics files
or customer data are included in this release.

| Page | GSC clicks | GSC impressions |
| --- | ---: | ---: |
| `/blog/obsidian-voice-input` | 84 | 579 |
| `/` | 52 | 935 |
| `/obsidian/pricing/` | 39 | 1,957 |
| `/apple-watch/` | 24 | 895 |
| `/obsidian/sync/` | 15 | 302 |
| `/obsidian/journaling/` | 13 | 153 |
| `/obsidian/getting-started/` | 12 | 1,351 |
| `/obsidian/sync/icloud/` | 10 | 259 |
| `/obsidian/compare/logseq/` | 10 | 164 |
| `/obsidian/what-is-vault/` | 8 | 822 |

The next eligible page, `/blog/captio-discontinued`, also had eight clicks but
71 impressions. Search traffic is a prioritization proxy, not a conversion,
retention, purchase, or LTV measurement.

## Presentation

- Opt-in CSS shares the dark background, violet accents, typography, cards,
  and generous spacing of the Obsidian landing page.
- Each guide has a subject-specific concept illustration, three reading routes,
  and a native expandable table of contents. Illustrations are decorative and
  explicitly described as diagrams rather than app screenshots.
- Long-form explanations, source links, verification dates, existing anchors,
  pricing qualifications, app limitations, and FAQ answer wording remain.
- Comparison tables scroll in labeled, keyboard-focusable regions. FAQ and
  contents controls use native `details`/`summary`; content does not need JS.
- The homepage retains its preloaded responsive photograph and generated
  performance assets. It adds routes for voice, Obsidian, and Apple Watch.
- The CSS is checked by the existing content-hash asset-version guard.

## Measurement boundary

Existing App Store destinations, `ct`, `ppid`, and `data-cta-*` attributes are
retained. This design change overlaps the `/obsidian/getting-started/` trial
described in `growth/reports/2026-09-30-asc-page-group-pilot.md` (evaluation date
2026-10-23). Its layout change is a **confounder** from this release onward.
Do not attribute subsequent movement solely to that trial or to this redesign.
The page-group campaign pilot remains aggregate; it cannot establish individual
page LTV. This release does not restart, rename, or change campaign variants.

## Validation

- Chromium: all ten pages at 375, 390, 430, and 1280px, plus all ten at 375px
  with JavaScript disabled (50 passing scenarios). Checks covered document
  overflow, heading visibility, in-page targets, Enter/Space operation of every
  native disclosure, keyboard scrolling of wide tables, and runtime errors.
- A final pass on all ten pages confirmed visible inset focus outlines for
  contents/FAQ controls and visible comparison-table column headings.
- An axe-core 4.10.3 pass at 412px found no WCAG A/AA violations on these ten
  pages after the CI follow-up. The initial homepage target-size failure was
  reproduced by forcing deferred reveal elements visible and disappeared when
  the new override was removed, restoring the existing reveal behavior and
  no-JavaScript fallback. Pricing cards, screenshots, and preformatted examples
  also received labeled keyboard-scroll regions.
- The section-rendering control removes only the new normal-navigation
  deferral assignment and retains native fragment/focus escapes. The old control
  retained four deferred sections from shared CSS but removed their fragment
  escape. Both comparison pages now resolve actual fragment geometry; unit
  tests enforce preservation of every other HTML/CSS byte and reject unexpected
  assignment structures.
- Firefox traces also showed Japanese web fonts changing preceding line wraps
  after a native fragment jump. The homepage uses native system typography so
  its text metrics no longer depend on a web-font download. Its photograph,
  colors, spacing, content, and capture routes retain the redesigned treatment.
  Native navigation and browser assertion thresholds/waits are unchanged.
  A local Lighthouse 12.8.2 observation scored 100 in all four categories,
  with LCP 1.73s, CLS 0, and no web-font requests. CI is the release gate;
  this local measurement is not a field performance claim.
- While a homepage control has focus, screen sections use their actual geometry
  so native focus scrolling cannot land against deferred placeholders. A 1440px
  Chromium reproduction moved the focused CTA from y=1624 (outside the viewport)
  to y=357 in both the control and candidate. Print and unfocused deferral remain.
- The existing homepage harness passed all 20 Japanese/English viewport,
  pixel-density, responsive-image, menu, and JavaScript scenarios.
- Original H1 text, metadata/JSON-LD, navigation, footer, existing anchor IDs,
  and complete App Store link attributes were compared with the base version.
- FAQ schema checks/self-tests, CTA placement, CPP `ppid`, script tags, constants,
  generated homepage assets, asset hashes, and generated sitemap checks passed.
  `seo-check.js` reported zero errors and the existing 81 warnings (exit 1).

Browser checks are functional/local observations, not field Core Web Vitals or
measured conversion improvement. Production deployment and CI outcomes are
recorded on the release PR.
