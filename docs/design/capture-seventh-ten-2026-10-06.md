# Seventh collection: full-page brand design

## Selection and evidence

The 62 previously redesigned pages are excluded. These are **priority hypotheses, not measured page-level LTV rankings**. Paid subscription attribution and retention by landing page are unavailable. Existing Japanese, indexable, non-redirect pages are ranked by the repository's monetization relevance, then search clicks, impressions and path. All selected pages have medium relevance (0.5), including the default tier; this is an assumption about potential use, not measured revenue or paid retention.

Search evidence: verified SEO Daily run 37081053944, collected 2026-10-03, covering 2026-09-02 through 2026-09-29. Snapshot bytes match the source receipt hash. Private source paths and credentials are not published.

| Page | Search clicks | Impressions |
|---|---:|---:|
| /vs/tana/ | 4 | 45 |
| /methods/bullet-journal/ | 4 | 44 |
| /blog/email-self-task-management | 3 | 426 |
| /vs/roam-research/ | 3 | 251 |
| /use-cases/reading-notes/ | 3 | 211 |
| /vs/google-keep/ | 3 | 199 |
| /blog/sales-meeting-notes | 3 | 150 |
| /use-cases/commute/ | 3 | 76 |
| /use-cases/cooking/ | 3 | 75 |
| /blog/fastest-memo-app-benchmark | 3 | 64 |

## Full-page design

The established Obsidian brand system covers navigation, hero, reading routes, numbered chapters, comparison tables, FAQ, related links, references and footer. The new stylesheet is opt-in to these ten pages; existing shared styles are unchanged. Scenarios, daily timelines, numbered methods, sales examples and benchmark controls share the typography, spacing and palette through the bottom of each page. Long headings keep their wording while using a clearer hierarchy on mobile. Illustrations summarize existing sections and are not simulated application screens.

Original H1 text, metadata, managed comments, links, anchor IDs and tracked App Store destinations are retained. Body text is preserved except for removing prohibited emphatic free-price wording and clarifying the Free limit as three messages per day with no time limit, as requested. FAQ schema is regenerated from the visible answers. The benchmark retains its measured values, table, method caveats, CSV download and replay calculations. The comparison selector is disabled during replay so the selected label cannot contradict the active timer or result. The replay is explicitly identified as a reproduction of measured values, not a measurement of the visitor's device. With JavaScript disabled, the inactive controls are hidden and the static comparison remains available.

## Verification

Completed drafts receive a separate adversarial review. Local validation checks responsive layout from 320 to 1920 pixels, Firefox, keyboard navigation, FAQ and table scrolling, JavaScript-disabled navigation, automated WCAG A/AA checks, benchmark behavior and print. The PR completion comment records final check exit codes, deployment and production verification. This process makes no claim or guarantee of a design award.

The adversarial review found a pre-existing replay race: changing the comparison during playback could disagree with the active timer and result. The selector is now disabled during playback and restored afterward; the timing data and calculations are unchanged. The review verified the fix at 375 and 1440 pixels, found no text clipping in 30 page/viewport combinations, and checked all five comparison tables at print width. No major or moderate findings remain.
