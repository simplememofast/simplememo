# Prospective Store click-page diagnosis

`ga4-cta-pages` is an explicit option in the existing encrypted analytics reader.
It adds one fixed SELECT to the unchanged quality and funnel SELECTs. There is
no scheduler, automatic collection, scoring integration or new browser event.
The normal `ga4-funnel` report still executes its original two queries.

## Earliest windows

The v1 Store-link campaign was released during 2026-09-30 JST. This report
accepts only cohorts starting on or after 2026-10-01, the next complete JST day.
An end date must be at least five JST calendar days old. Every daily export
table through end + 1 must exist. October 1 alone first meets the date gate on
October 6; October 1–7 first meets it on October 12. Presence is not evidence of
complete capture. Existing quality blockers continue to block evaluation.

SQL is **prepared and locally tested with synthetic events, not live-validated**.
Do not automatically dispatch this report or duplicate an existing collection.
When an eligible source review calls for it, use the reviewed default-branch
reader and its existing encryption, request ownership and cost controls.
Per-query cap remains 1 GB; cumulative billed run cap remains 2 GB, shared by
all three queries. A budget failure may leave an incomplete report.

## What the rows mean

The cohort contains identifiable WEB sessions starting in the requested JST
window. Only events at or after that start and before start + 24 hours enter.
Attribution uses the exported session cross-channel source/medium pair; missing,
partial and conflicting pairs/channels remain visible. There is no first-user,
UTM, referrer or landing fallback.

Candidate clicks are `app_store_click` events of the expected measurement
version pointing directly to the own app on HTTPS `apps.apple.com`. Mirrored
`seo_cta_click`, OneLink/QA, other apps, other versions and unstarted events
cannot enter. Invalid targets or versions must still be inspected in the
attached original quality report.

A valid v1 group requires **that click's** nonempty `page_path` to equal the
path in its HTTPS production `page_location`, an exact canonical entry in the
checkout inventory, one matching `ct` in the clicked URL and the same event
campaign payload. The six frozen pages stay excluded. Unknown paths, aliases,
missing page fields, disagreement, untagged links and campaign mismatches stay
separate. No path is inferred from a landing, cluster or campaign token.

The manifest records public canonical paths, expected tokens and a hash of the
reviewed query checkout. It is not proof that this inventory was deployed on
every event day or that events were captured. Unknown aliases are deliberately
not normalized. Arbitrary event paths, full URLs and user/session identifiers
are never returned in the new aggregate rows.

| Record type | Interpretation |
| --- | --- |
| `session_group` | Disjoint sessions: `obsidian_only`, `other_only`, `both`, `no_v1_group_click`. These names describe matched clicked link-page groups. Diagnostic unresolved/excluded counts are flags and can overlap. |
| `click_page` | Click-event count and distinct sessions per canonical path/status. Sessions can occur on multiple pages/statuses; summing these session counts double-counts them. Unresolved paths are null, never guessed. |

The package always sets `eligible_for_outcome_evaluation: false`. It cannot
clear the original quality gate, count an installation, establish SEO intent,
provide a click denominator, estimate CTR/CVR, measure revenue or establish LTV.
Store campaign first-download cohorts remain a separate source. A comparison
between clicked page groups does not identify the user's search keyword.
