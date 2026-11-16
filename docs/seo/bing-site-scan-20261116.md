# Bing Site Scan title review — 2026-11-16

## Evidence and scope

Bing Webmaster Tools scan `202261113` (completed 2026-11-13) scanned
1,000 pages and reported zero errors, 248 long-title warnings and 114
missing-image-alt warnings. The two affected-page CSV exports were obtained
through the authenticated Site Scan UI on 2026-11-16. These are historical
scan findings, not proof of current indexing or rankings.

All exported URLs resolve to tracked HTML in main
`27ac09da9dd7dad853a990c8d2347df3b49e9dc4`.
The 248 titles still exceeded 70 Unicode characters: tr 53, id 50, ar 44,
es 44, pt-BR 43, en 13 and ko 1. No Japanese title is changed.

## Changes

Titles are rewritten as concise localized summaries, rather than cut at a
character boundary. Product names, protected quantities and years remain.
The affected generated titles are stored in both translation catalogs and
reviewed overrides so regeneration and future imports retain the corrections.
Existing editorial titles are edited in place; matching social titles follow
when they contained exactly the same original text. Shared translation units also update the matching blog-card/schema labels and
five email-to-Obsidian headings. Fifteen additional Turkish comparison titles
share the same protected source unit and receive the equivalent concise wording.
No URL, canonical, pricing, CTA destination, visual style or image is changed.

The existing translation engine performs regeneration. Its protected-token
validation is retained. Length checks alone do not establish translation
quality: the title wording was also reviewed for topic, natural terminology,
and unsupported claims; the longest titles and functional/security claims
received an additional independent review.

## Why the alt warnings are not mass-fixed

In all 114 exported pages, zero `img` elements lack an `alt` attribute.
The empty alternatives comprise 228 brand icons next to equivalent brand
text and 113 decorative preview images inside `aria-hidden="true"` ancestors.
The meaningful article screenshots carry descriptions. Filling all empty
alternatives would add duplicate screen-reader output rather than improve
accessibility. These intentional decorative alternatives are retained.

This does not claim that Bing's old warnings have disappeared. A subsequent
scan can confirm the new titles; its treatment of decorative empty alternatives
may continue to differ from their accessibility purpose. No scan, indexing
submission or Bing setting was changed as part of this review.

## Local verification

- Target CSV rows: 248 titles + 114 alt warnings, all mapped to tracked HTML.
- Reviewed target titles: 248/248 exact expected text, all at most 70 characters.
- Including shared comparison units: 263 changed titles, no duplicates among them.
- Existing translation self-tests: 93 passed.
- Existing SEO self-tests: 81 passed.
- Existing sitemap self-tests: 28 plus 10 content-history tests passed.
- SEO validation: zero errors; 2,125 warning-level findings remain across the
  entire site. This is not a claim that all unrelated SEO warnings were fixed.
- Credential-shaped-value check: passed.
- Normalized heads: zero further changes among 2,530 HTML pages.
- Shared chrome and FAQ normalization: zero further changes.
- Sitemap verification: passed against content history, with no artificial date floor.
- Changed HTML retained exactly the same image tags, canonical/hreflang links,
  external script tags and stylesheet links.

Required remote CI must still pass before publication. A newer Bing scan is
needed before claiming that its historical title warning count has cleared.

- Complete translation regeneration check: 2,195 outputs, zero stale.
