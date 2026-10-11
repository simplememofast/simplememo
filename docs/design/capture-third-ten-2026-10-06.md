# Capture guides: third set of ten — 2026-10-06

## Scope and selection

This batch excludes the homepage, `/obsidian/`, and the twenty guides already improved in the preceding releases. It applies the established black, white and violet reading system to the whole page, including the lower sections, sources, related links and footer.

These are **LTV-priority hypotheses, not measured page-level LTV rankings**. Page-level subscription attribution is unavailable and the local CTA measurement receipt remains quality-blocked. Selection uses existing Japanese, indexable, non-redirect pages with `monetizationRelevance === 1` in `growth/lib/gsc.mjs`, then search clicks, impressions and path as tie-breakers. The relevance tier describes repeated capture use; it does not prove paid retention.

The verified GSC daily handoff was collected on 2026-10-03 (run 37081053944), for 2026-09-02 through 2026-09-29. Private source bytes matched their receipt hash. No private query data or local paths are included here.

| Page | Clicks | Impressions |
|---|---:|---:|
| `/obsidian/second-brain/` | 1 | 6 |
| `/voice-input/` | 0 | 183 |
| `/captio-alternative/` | 0 | 59 |
| `/hands-free/` | 0 | 57 |
| `/obsidian/daily-note/` | 0 | 29 |
| `/obsidian/shortcuts-not-working/` | 0 | 22 |
| `/obsidian/plugins/` | 0 | 15 |
| `/obsidian/sync/official-sync/` | 0 | 7 |
| `/blog/captioo-alternative` | 0 | 5 |
| `/obsidian/airpods/` | 0 | 3 |

The small counts, including nine pages with zero clicks in this window, limit confidence. This is the next eligible group by the stated priority rule, not a claim that these pages already generate high revenue. The running `gsc-voice-input-title-20261002` experiment keeps its title, description and H1; the visual change is a concurrent intervention, so later conversion changes cannot be attributed to that title experiment alone.

## Presentation

- The existing editorial, full-content and next-guide CSS layers are reused. `capture-third.css` is loaded only by these ten pages and is registered for content-hash cache invalidation.
- Chapters, full-width tables, numbered steps, decision rows, symptom cards, code examples, FAQ disclosures and related reading share the reference page's typography, spacing and contrast. Desktop content has a 1160px outer width, while mobile uses a single reading column.
- Product pages show existing actual SimpleMemo input pixels. AirPods uses the existing in-app Siri guide and keeps all six original guide screens. PARA keeps its original Obsidian evidence screenshots. Concept cards are labelled as diagrams or selection criteria, not app UI.
- The obsolete Captio banner becomes a text-based three-step diagram. The page's obsolete blue override CSS is removed so it cannot compete with the current design system.
- Titles, descriptions, H1 text, canonical/hreflang, app schema, app-store destinations and `data-cta-*` values are retained. Existing body links, anchor IDs, factual prose and source notes remain. Three pre-existing prohibited expressions are neutrally rephrased without adding facts.
- PARA's four visible answers now have generator-owned FAQ markup. Captioo's FAQ is migrated from handwritten markup to the same generator because one question is rephrased. FAQ JSON-LD is generated from displayed answers, not manually edited.
- Navigation works with Enter/Escape and restores focus. FAQ and reading indices use native disclosures. Tables, Markdown samples and the Siri screenshot strip expose labelled keyboard-focusable scroll regions. Reduced-motion and no-JavaScript navigation are supported.

## Review and validation

The completed draft receives an adversarial review covering full-page consistency, overflow/clipping, keyboard operation and semantics. This process aims for a polished, coherent result; it does not claim or guarantee a design competition award. Final check exit codes and production evidence are reported on the pull request after deployment.

Completed-draft review found and resolved three presentation issues: PARA screenshots retained fixed HTML heights after their old wrapper was removed; Captio's old CSS/navigation script also owned its floating CTA; and two four-column footer modifiers were on the wrong element. The screenshots now retain their source aspect ratio and use wide chapters. The existing tracked floating CTA has a dedicated script and matching white/black styling, and hides around the hero/footer. Footer modifiers now apply to the navigation grids.

Local evidence: 70 responsive cases (320, 375, 430, 768, 1024, 1440, 1920px), 20 Firefox cases, 20 no-JavaScript cases, and eight image-ratio/overflow regression cases passed. Adversarial text-Range checks found no clipping against hidden/clip ancestors in 30 page/viewport cases, and all ten tables remained readable in print layout. The standalone SEO command retains the same 81 baseline warnings and zero errors; the sitemap check passes both on the clean base and the changed tree without a missing-history error.
