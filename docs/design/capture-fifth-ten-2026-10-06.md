# Fifth collection: full-page brand design

## Selection and evidence

The 42 pages completed in earlier collections are excluded. These are **priority hypotheses, not measured page-level LTV rankings**: paid subscription attribution and retention by landing page are unavailable. The next 10 existing Japanese, indexable, non-redirect pages use the same priority method as the preceding collection: commercial relevance, then search clicks, impressions and path. All ten are in the medium relevance group (comparison, capture workflow, or reusable templates). Relevance is a prioritization assumption, not a revenue measurement.

Search evidence: verified SEO Daily run 37081053944, collected 2026-10-03, covering 2026-09-02 through 2026-09-29. The snapshot hash and all selected page click/impression rows were checked against the source receipt. No private receipt paths or credentials are published.

| Page | Search clicks | Impressions |
|---|---:|---:|
| /vs/ios-reminders/ | 12 | 420 |
| /methods/second-brain/ | 11 | 815 |
| /vs/google-keep-vs-apple-notes/ | 10 | 410 |
| /vs/capacities/ | 10 | 243 |
| /blog/fleeting-notes | 10 | 196 |
| /blog/email-yourself-memo | 9 | 576 |
| /vs/anytype/ | 7 | 162 |
| /vs/day-one/ | 7 | 142 |
| /templates/ | 7 | 52 |
| /blog/iphone-memo-tips | 6 | 391 |

## Design and behavior

The shared Obsidian-derived brand system covers navigation, hero, numbered reading chapters, comparison tables, FAQ disclosures, related links, references and footer. New styles are opt-in to this collection, leaving previous pages unchanged. Desktop has a wide reading grid; narrow screens use a single column. Templates and iPhone tips receive layouts appropriate to their content, including clear actions and a consistent Japanese font stack. The email guide uses the existing actual SimpleMemo screen image; conceptual diagrams are labelled as such.

The template collection retains every template's exact text and the existing copy analytics event. Copy controls are hidden without JavaScript or clipboard support. Success and failure are announced in a status region, with manual copying available from the visible text. Fleeting-notes FAQ content is preserved in native keyboard-operable details elements.

Titles, metadata, structured data, existing anchor IDs, original links and CTA tracking are preserved. Page content is retained; the new reading routes only summarize existing sections. No new performance, pricing, security or product capability claims are introduced. The existing FAQ generator reports zero schema updates.

The template page explicitly pins its existing `mid` CTA classification with `data-cta-position="mid"`; this avoids changing the established measurement label when accessibility markup changes the classifier's byte-position fallback. Its existing attributes and campaign URL remain unchanged.

## Validation

Content invariants compare all ten pages against the pre-edit versions. Checks include responsive rendering from 320 to 1920 pixels, keyboard navigation/FAQ/table scrolling, Firefox, JavaScript-disabled navigation, WCAG A/AA automated checks, template copy success/failure, print layouts and an independent adversarial review of the completed draft. The PR completion comment records the final results, command exit codes, deployment and production verification.
