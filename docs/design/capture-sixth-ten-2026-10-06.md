# Sixth collection: full-page brand design

## Selection and evidence

The 52 previously redesigned pages are excluded. These are **priority hypotheses, not measured page-level LTV rankings**. Paid subscription attribution and retention by landing page are unavailable. Existing Japanese, indexable, non-redirect pages are ranked by the repository's monetization relevance, then search clicks, impressions and path. All selected pages have medium relevance (0.5), including the default tier; this is an assumption about potential use, not measured revenue or paid retention.

Search evidence: verified SEO Daily run 37081053944, collected 2026-10-03, covering 2026-09-02 through 2026-09-29. Snapshot bytes match the source receipt hash. Private source paths and credentials are not published.

| Page | Search clicks | Impressions |
|---|---:|---:|
| /blog/memo-app-privacy | 6 | 348 |
| /blog/brain-science-memo | 6 | 222 |
| /use-cases/ | 6 | 75 |
| /resources/obsidian-inbox/ | 6 | 39 |
| /blog/minimalist-digital-memo | 6 | 27 |
| /vs/simplenote/ | 5 | 120 |
| /vs/logseq/ | 4 | 210 |
| /blog/digital-vs-handwritten-notes | 4 | 198 |
| /vs/notion-vs-obsidian/ | 4 | 166 |
| /comparison/ | 4 | 107 |

## Full-page design

The established Obsidian brand system covers navigation, hero, reading routes, numbered chapters, comparison tables, FAQ, related links, references and footer. The use-case and comparison directories use generous three-column cards on desktop, two on tablets and one on mobile. Reading guides have a clear hierarchy through their lower sections. The new stylesheet is opt-in to this collection; existing shared styles are unchanged. The Japanese Markdown page remains generated from its original content sources, with a maintained presentation shell. Generator checks reject drift and verify source changes propagate to the redesigned output.

The Markdown tool keeps its input fields, IDs, date/time options, preview, clipboard fallback and download behavior. Its original script is unchanged. Input and preview panels share the brand palette and readable control states; the form stacks on mobile. JavaScript-disabled readers retain the static example and download links, while inactive copy/save buttons are hidden. Illustrations summarize existing article sections and are not simulated application screens.

Original H1 text, metadata, managed comments, links, anchor IDs and existing tracked App Store destinations are retained. Body text is preserved except for removing the prohibited emphatic free-price wording and clarifying the Free limit as three messages per day with no time limit, as requested. FAQ schema is regenerated from the visible answers. The memory article explicitly pins its existing `mid` CTA classification with `data-cta-position="mid"`, so layout markup does not change its historical byte-position classification. No additional product capabilities or comparison facts are introduced.

## Verification

Completed drafts receive a separate adversarial review. Local validation checks responsive layout from 320 to 1920 pixels, Firefox, keyboard navigation, FAQ and table scrolling, JavaScript-disabled navigation, automated WCAG A/AA checks, tool behavior and print. The PR completion comment records final check exit codes, deployment and production verification. This process makes no claim or guarantee of a design award.

The completed-draft review found no remaining major issues after fixing no-JavaScript button visibility and comparison-card underlines. It checked 30 page/viewport combinations for text clipping and six tables plus a long Markdown example at print width.
