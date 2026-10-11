# Ninth group of ten: reference guides in ten languages

## Selection

Exclude the 82 topics covered by the preceding design batches. Continue the
same ordering within the 163-page editorial inventory: the repository's
`monetizationRelevance` intent rule, then observed search clicks, impressions,
and path. This is an intent proxy, not measured lifetime value. No page-level
paid conversion or retention data was available for this selection.

The committed, verified `growth/data/gsc/2026-10-10` snapshot covers
2026-09-09 through 2026-10-06. All ten topics have declared relevance 1.0;
the first four have zero clicks and the following observed impressions. The
other six have no observed page row in this window and use a path tie-break.

| Topic | Japanese route | Observed impressions |
|---|---|---:|
| Git conflict recovery | `/obsidian/troubleshooting/sync-conflict/` | 12 |
| AI plugins | `/obsidian/ai-plugins/` | 9 |
| URI reference | `/obsidian/uri-scheme/` | 7 |
| Daily-note plugins | `/obsidian/daily-note-plugins/` | 5 |
| Anytype comparison | `/obsidian/compare/anytype/` | Not observed |
| memos comparison | `/obsidian/compare/memos/` | Not observed |
| Import guide | `/obsidian/import/` | Not observed |
| Properties | `/obsidian/properties/` | Not observed |
| Templates | `/obsidian/templates/` | Not observed |
| Use-case hub | `/obsidian/use-cases/` | Not observed |

Each topic includes Japanese, English, Simplified Chinese, Traditional Chinese,
Korean, Spanish, Brazilian Portuguese, Indonesian, Arabic and Turkish: 100 pages.

## Design

Reuse the reviewed `capture-eighth.css` reference-guide foundation and opt this
batch into `capture-ninth.css`. Changes are scoped to these pages. The shared
palette, typography, reading measure and chrome remain consistent with the
Obsidian landing page, while dense reference material has its own hierarchy.

- Eight introductions show an unaltered, existing application screenshot. The
  duplicate is decorative; the full evidence, alt text, caption and qualification
  remain in the article. Five raster introduction diagrams are removed from the
  article; their social previews remain unchanged.
- Reading routes use existing chapter headings and translations. No additional
  product claims or article prose are introduced. The import title gains optional
  breaks between product names; nine catalog entries reuse their exact existing
  translations with the corresponding protected break markers.
- Chapters, screenshots, comparison tables, code, download controls, source
  excerpts, FAQ, template selections and role examples share the same visual
  treatment through the end of the article.
- Technical tables scroll within their own focusable region. The URI action and
  parameter tables use their existing translated cell labels in a stacked layout
  below 900px. The original raw code and download URLs are retained.
- Old compact navigation gains the shared menu control. Existing tracked App
  Store destinations are preserved, including their mobile menu variants. The
  two reference pages that originally had only internal product links retain
  that behavior and do not acquire new analytics scripts.
- FAQ stays native `details`/`summary`; the memos wrapper is removed so one
  separator and one answer style apply. No custom disclosure JavaScript is added.

## Review criteria

Review the complete reading path, not just the introduction: mobile and desktop
measure; long translations; Arabic direction; contrast; keyboard operation;
source/qualification visibility; raw-code integrity; and download/CTA routes.

The first visual pass found oversized inherited title padding and cramped
template summaries. Adversarial source review then found inherited multi-column
steps conflicting with the new padding. Direct browser inspection also exposed
a shared table rule overriding the URI mobile layout. Each was corrected and
retested. A proposed missing-container issue was checked in the browser: both
pages already retain 22px mobile padding and a bounded desktop reading area.

The final browser pass covered all 100 pages at 320, 375, 430 and 1440px: no
page overflow or clipped reading blocks. Native FAQ Enter toggles and menu
Enter/Escape passed on all ten Japanese sources. The Arabic language switch,
RTL technical-code ordering, JavaScript-disabled FAQ and print-label contrast
were checked directly. Main article prose, headings, anchors, code bytes,
existing evidence, links, metadata and footer text match the baseline
across all 100 pages. Script bytes also match, except that the regular English
breadcrumb generator inserts spaces at the two optional title breaks. The
breadcrumb destination and words are unchanged.

The unrelated daily public operating score also failed on `origin/main` with
byte-identical diagnostics. `decision-monitor.mjs --publish-report` synchronized
the live report from its existing ledger. Its eight generated translations
are synchronized through the same translation pipeline; the independent English
report and historical research are unchanged.

No award outcome or measured revenue uplift is claimed. Publication requires
content/SEO invariants, complete static translation validation, responsive and
keyboard checks, successful required CI, and production readback of all 100 pages.
