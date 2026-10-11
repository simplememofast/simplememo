# Eleventh group of ten: everyday workflows and product guidance

## Selection

Exclude the 102 topics completed in the preceding batches. Rank the published
Japanese source inventory by the existing `monetizationRelevance` intent proxy,
then Japanese-route clicks, impressions and path. Non-indexable pages and test
result fixtures are not editorial candidates. The committed GSC snapshot dated
2026-10-10 covers 2026-09-09 through 2026-10-06. This is a prioritization hypothesis,
not measured page-level lifetime value or a claim of conversion improvement.

| Japanese route | Intent score | Clicks | Impressions |
|---|---:|---:|---:|
| `/vs/todoist/` | 0.5 | 2 | 18 |
| `/use-cases/work-tasks/` | 0.5 | 2 | 15 |
| `/vs/heptabase/` | 0.5 | 2 | 14 |
| `/blog/engineer-code-snippets` | 0.5 | 2 | 12 |
| `/blog/memo-app-security-comparison` | 0.5 | 1 | 256 |
| `/blog/email-management-tips` | 0.5 | 1 | 170 |
| `/guides/draft-autosave/` | 0.5 | 1 | 97 |
| `/ai-tags/` | 0.5 | 1 | 71 |
| `/blog/morning-memo-routine` | 0.5 | 1 | 69 |
| `/guides/` | 0.5 | 1 | 48 |

Ten topics each have Japanese, English, Simplified Chinese, Traditional Chinese,
Korean, Spanish, Brazilian Portuguese, Indonesian, Arabic and Turkish versions.
The ten independent English articles remain sources alongside Japanese. The
existing translation pipeline generates the other 80 pages.

## Design

Use the existing Capture typography, navigation, reading indexes and chapter
system from the Obsidian reference pages. Reuse the eighth, ninth and tenth
scoped stylesheets and add `capture-eleventh.css` only to these 100 pages.

The treatment extends through comparison tables, practical examples, numbered
steps, guide cards, FAQ, related links and closing calls to action. The guide hub
has a consistent two-column card grid on desktop and one column on mobile.
Workflow examples use readable body text and separate memo excerpts. Numbered
steps use logical spacing and quiet dividers in both writing directions.

The AI-tag introduction retains its existing conceptual voice-to-tag illustration
and its qualification. The interactive demonstration gains clear selected states,
readable input/output panels and room on desktop. Its three examples, event
handlers, controls and runtime scripts are unchanged. No application screen,
feature, performance result or commercial claim is invented.

## Targeted translation corrections

Review found that several existing translations of the AI-tag hero said that AI
was ready instead of organizing notes, and some translated lightweight formatting
as cosmetic surgery. Seven AI-specific source units are corrected in each of the
eight generated languages. These cover the title, hero, fallback explanation,
device requirements and two FAQ answers. Original Japanese conditions, OS/device
placeholders and the promise to preserve the original note body remain intact.
The generator updates the affected title metadata and structured FAQ consistently.
These are targeted corrections, not a claim of a full native-language editorial
audit of the entire site. No shared dynamic-message bundles are changed.

## Review and validation

The first 400-condition browser sweep found a long AI feature label overflowing
at narrow widths in four languages. Wrapping and a non-shrinking badge fix it.
Visual review also corrected missing mobile hero gutters, small workflow-example
text, constrained desktop demo width and legacy step-card borders. The affected
conditions were rechecked after each repair. Final coverage is 100 pages at 320,
375, 430 and 1440px, with no horizontal page overflow or clipped reading blocks.

Keyboard checks cover all ten themes and locales in a rotating sample: header
menu and language Enter/Escape, and native FAQ Enter where present. The guide hub
has no FAQ. All three AI demo tabs respond to Enter in all ten locales. Native
FAQ and the nine alternate-language links remain available without JavaScript.
Print headings are dark and reduced-motion mode disables smooth scrolling.

Source invariants preserve text, headings, links, CTA attributes, anchors, code,
images, metadata and structured data on the 92 pages without translation repairs.
The eight corrected AI pages differ only in the reviewed prose, heading, title
metadata and FAQ translations. Runtime scripts are byte-identical on all 100
pages. The correction catalogs preserve protected tokens and tag structure.
Adversarial review found no P1/P2 regression in the completed design or corrections.

Publication requires the repository checks and CI, followed by production readback
of all 100 pages and the content-hashed stylesheet. No award outcome is claimed.
