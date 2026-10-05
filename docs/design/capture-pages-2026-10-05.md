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
