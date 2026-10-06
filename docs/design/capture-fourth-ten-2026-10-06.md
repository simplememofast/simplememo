# Capture guides: fourth set of ten — 2026-10-06

## Scope and selection

The existing 32 redesigned pages are excluded. These are **LTV-priority hypotheses, not measured page-level LTV rankings**. Subscription attribution is unavailable and the CTA measurement receipt is quality-blocked. Existing Japanese, indexable, non-redirect pages are ranked first by the repository's monetization relevance, then search clicks, impressions and path. Only one remaining page belongs to the highest relevance tier; the next nine use the medium tier. This does not establish paid retention or revenue.

The verified GSC daily handoff was collected on 2026-10-03 (run 37081053944), covering 2026-09-02 through 2026-09-29. Source bytes matched the receipt hash. Private query data and local paths are not published.

| Page | Relevance | Clicks | Impressions |
|---|---:|---:|---:|
| `/obsidian/apple-watch-not-working/` | 1 | 0 | 2 |
| `/vs/dynalist/` | 0.5 | 29 | 1107 |
| `/vs/upnote/` | 0.5 | 25 | 586 |
| `/vs/notion-vs-evernote/` | 0.5 | 23 | 658 |
| `/blog/memo-app-encryption-comparison` | 0.5 | 20 | 617 |
| `/blog/meeting-memo-template` | 0.5 | 18 | 734 |
| `/blog/iphone-memo-katsuyou` | 0.5 | 17 | 1277 |
| `/blog/travel-planning-memo` | 0.5 | 17 | 244 |
| `/vs/craft/` | 0.5 | 15 | 185 |
| `/note-to-email/` | 0.5 | 12 | 625 |

## Design and behavior

The established black, white and violet system covers the entire page: opening, numbered chapters, comparison tables, steps, templates, FAQ, related reading, source notes and footer. Desktop uses a 1160px outer width; mobile has a single reading column. New component styling is opt-in for these ten pages.

Hero diagrams illustrate each article's existing structure; they are not simulated app screens. The email guide uses the existing actual SimpleMemo input screenshot. Original factual text, H1, metadata, schema, managed comments, anchor IDs, body links and tracked App Store destinations are preserved. FAQ JSON-LD is checked with the generator. Existing template copying and Markdown downloads remain intact.

Navigation supports Enter/Escape and focus return. FAQ uses native disclosures. Tables and preformatted templates have labelled, focusable scroll regions. No-JavaScript navigation, reduced motion and print remain supported.

## Review and verification

Completed drafts receive an adversarial review and responsive checks, with fixes before publication. This is a concrete quality process, not a claim or guarantee of a design award. Final check results and production verification are recorded on the pull request.

Completed-draft review identified a Craft list layout that treated bare text nodes as flex items. It now uses block flow and a separate number column; Chrome mobile overflow is resolved. A navigation-script variant and a low-contrast language button are also corrected. Meeting and travel template copy buttons exposed a pre-existing dependency on a removed language marker; the shared helper now accepts the standard HTML language ancestor. Other users of that helper receive cache-version updates only.

Validation covers 70 responsive cases (320–1920px), 20 Firefox cases and 20 no-JavaScript cases. Axe WCAG A/AA checks run in 20 cases with FAQ answers open. All seven template copies exactly match their source and all seven downloads return successfully. Metadata, H1, schema, tracked App Store links, original anchors and body text pass preservation checks for all ten redesigned pages.

The final adversarial review found no remaining major issues: no text clipping in 30 page/viewport cases, nine tables and seven templates readable in print, and working keyboard navigation with focus return. Final check exit codes and deployment evidence are recorded on the pull request.
