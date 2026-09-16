# GSC redirect audit — 2026-09-16

## Scope and interpretation

The owner supplied 87 rows from the GSC "Page with redirect" report. The pasted
report says last updated 2026-09-04, but includes crawl dates through 2026-09-05.
These are historical report rows, not a fresh Google index inspection.
The fixture preserves all 87 distinct displayed URLs in order. Row 12 is the
visible root URL; the extra closing parenthesis in the pasted Markdown is
ambiguous. `/)` and `/%29` are therefore separate supplemental cases, not
silently substituted into the original 87. There are 57 distinct destinations.

Intentional HTTP/HTTPS, extension, query and retired-content redirects remain.
Existing path-based language semantics remain: `?lang=en` is ignored, not an
instruction to move a Japanese URL to the English tree. UTM, gclid and fbclid
attribution is preserved. No content, prices, canonicals, sitemap dates, DNS,
authentication, account permissions, 404/410 policy or analytics are changed.

## Reproduced production defects

Read-only GET observations at 2026-09-16 12:40:24 UTC:

| Source | Before | Intended after |
| --- | --- | --- |
| `/en?lang=en` | 301 `/en` → 308 `/en/` → 200 | 301 `/en/` → 200 |
| `/vs/trello?lang=ja` | 301 `/vs/trello` → 404 | 301 `/vs/` → 200 |
| `/en` | 308 `/en/` → 200 (valid permanent redirect) | 301 `/en/` → 200 |
| `/vs/trello/` | 301 `/vs/` → 200 | unchanged |
| `/blog/captio-alternatives-comparison.html?lang=ja` | 301 `/captio-alternative/` → 200 | unchanged |
| `/` | 200 | unchanged |

Baseline run: https://github.com/simplememofast/simplememo/actions/runs/35097173923

The middleware patch is deliberately limited to the exact `/en` directory
alias and the slashless forms of four existing retirements: whatsapp, telegram,
trello and slack-self-dm. Other unknown slugs are not redirected. `_redirects`
retains exact matching fallback entries. A redirect to the comparison hub was
already the policy for each retired comparison; this patch only catches the
missing equivalent spellings.

## Acceptance checks

- Original middleware suite: 454 checks and 9 failure-injection checks.
- New regression suite: 93 Node tests, including all 87 original rows and
  supplemental query/host/tracking/retirement/security cases.
- Public HTTP auditor: 11 self-tests, including loops, intermediate hops,
  missing/wrong/duplicate canonical, noindex, 404, missing Location and foreign
  redirect targets. It never fetches an off-domain redirect target.
- Live audit: original URLs are requested unchanged, including HTTP and www;
  final status 200, expected exact URL, at most one permanent hop for a variant,
  one correct canonical, no noindex/none, and live robots/sitemap discoverability.
- PR runs are explicitly baseline observations and do not claim deployment.
  Main runs wait for two distinctive fixed production responses, then perform
  strict verification. Failures and raw per-URL evidence remain in artifacts.
- Existing SEO Validation remains mandatory. The temporary read-only source
  preparation workflow is removed from the final tree.

This document records scope and pre-deploy evidence. Deployment is not complete
until the final main workflow and actual public HTTP observations succeed.

## Search Console follow-up

A working permanent redirect should remain a redirect. Do not remove it to
force the GSC bucket to zero, block it in robots.txt, or index every old spelling.
Inspect the destination URLs when checking Google indexing. A successful
HTTP/canonical audit is necessary delivery evidence, not a guarantee of indexing
or a promise that GSC will clear the historical source rows.

Official guidance:
- https://support.google.com/webmasters/answer/7440203
- https://developers.google.com/search/docs/crawling-indexing/301-redirects
- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls

Rollback: revert the eventual squash commit normally. No infrastructure or
secret rotation is involved.
