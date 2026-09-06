# Capacities comparison — verification record, 2026-09-06

Article: `/obsidian/compare/capacities/`

## Scope

Physical device verified: Capacities 1.70.2 on an Apple Silicon Mac running macOS 26.4.1 (25E253), limited to the native onboarding demo before account registration. This is not an account-backed sync or migration test. No new SimpleMemo feature is claimed by this article.

The official M-series DMG was downloaded via https://capacities.io/download-app. Its signature passed `codesign --verify --deep --strict`; Gatekeeper reported an accepted, notarized Developer ID. The application was launched from a task-specific directory. A Capacities account was not created.

## Observations

| Action | Result | Limit |
|---|---|---|
| Enter Japanese comparison text in the demo Daily Note | Text appeared | Persistence after restart not tested |
| Open the supplied Deep Work link | Book sample displayed, Backlinks 1 pointed to Daily Note | Sample content supplied by onboarding |
| Continue to properties | Author / Rating / Recommended by / Medium displayed | No custom type was created |
| Continue to graph | Sample book connected to author, date and tags | No graph performance measurement |
| Continue past graph | Email/password signup form appeared | Stopped without registering |

Screenshots are direct native captures; no content was composited into them. Some demo text was replaced with original comparison prose during inspection. They must not be presented as an untouched vendor screenshot or the user's private reading notes.

## Primary documentation checked on 2026-09-06

- https://obsidian.md/help/data-storage — Markdown files in a local vault.
- https://obsidian.md/help/properties — typed properties, templates and YAML storage.
- https://docs.capacities.io/reference/content-types — object types.
- https://docs.capacities.io/reference/properties — type-level fields and object selection.
- https://docs.capacities.io/misc/offline-support — download prerequisites, feature limits and database storage.
- https://docs.capacities.io/reference/export — export formats and prerequisites for scheduled exports.
- https://capacities.io/pricing — Basic scope, media allowance and individual-product FAQ.

These are documentation checks. Offline reconnection, cloud sync, exports, migration, account-backed persistence, and iOS performance were not tested.

## Editorial assessment

Self-assessment against `OBSIDIAN_CONTENT_QUEUE.md` §86: Intent 19/20; Originality 18/20; Verification 10/15; Completeness 13/15; Topical Fit 10/10; Internal Linking 10/10; Conversion Fit 9/10. Total **89/100**. This is an editorial score, not measured audience impact. Verification is deliberately below full marks because the native test covers onboarding only.

The page opens with the storage/type decision, includes reproducible demo steps and two screenshots, describes export and offline limits, links to the comparison parent and a sibling, and uses one next step to the Obsidian destination guide. It has no closing App Store CTA box; a desktop QR is therefore not required under the Runbook's conditional rule. No new English article is added.

## Recovery integrity

Prospective declaration `capacities-owner-recovery-20260906` was committed and pushed as `31c74dbce3167920679b4b98283fe95a35bffcf8` before article implementation. Local `verifyDecision` reproduced it from the exact pre-change data and returned `declared`, 0 changed implementation lines and 0 binary bytes. The prior failure, closed PR #969 and the original daily branch are retained.

The initial candidate batch was rejected because it lacked `kind: article` and the eligibility code used the analysis cap for an explicit cost estimate. The candidate was correctly typed as an article; the estimate was not lowered to evade the cap. The approved cap is $20 per article and the monthly cap is $280. Actual cost of this local owner session is unobserved, not zero.

The article is a publication candidate until its final PR-head SEO Validation passes and the PR merges. No audience, ranking or citation improvement has been observed yet.

## Screenshot integrity

- `capacities-onboarding.png`: SHA-256 `5e8d98723a66d01d0efee04fa07bd81ec5ddc4f756e358510ba3a1295ab2f6d6`
- `capacities-objects.png`: SHA-256 `0d9ff71e3849d32fa4c5a400214ac1174d78b5f9c04fdfc0bf363d85ab85c400`
