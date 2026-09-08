# Vendor review: additional primary sources

Codex read the sources below on September 8, 2026. This supplements the earlier
service/account observations; it does not establish historical assent or a
customer-specific contract. Linked documents not expressly listed as read remain
outside the reading record. Public originals remain at their providers.

## OpenAI

Read the complete non-European [Terms of Use](https://openai.com/policies/row-terms-of-use/),
effective January 1, 2026. The general terms URL initially returned European terms;
the non-European link in that page was followed. Individual-service content may
be used for improvement, with a training opt-out. Input rights, output verification,
third-party rights and organization indemnity remain the customer's responsibility.
There is no uninterrupted-service warranty. The stated liability limit is the
greater of the relevant twelve-month payments or USD 100, subject to applicable
law. Cancellation, suspension, arbitration and California venue provisions were
read. These are candidate terms, not an identification of this Codex account's plan.

Read [Services Agreement](https://openai.com/policies/services-agreement/) sections
1–16 and the definitions, effective January 1, 2026. Its business-service scope is
distinct from individual services. Section 4.2 limits content use and requires
explicit agreement for development/improvement; section 5.3 incorporates the DPA
when processing personal data. Section 11.3 ordinarily provides thirty-day deletion
after termination, with legal, agreed and abusive-content exceptions. Twelve-month
liability, indemnity exceptions, non-refundable commitments, renewal notice,
confidentiality, beta exclusions and dispute provisions require account-specific
assessment. No numeric uptime promise was identified in this agreement.

Read the complete [DPA](https://openai.com/policies/data-processing-addendum/),
including Schedule 1, effective January 1, 2026. It supplements the business
agreement. Processing follows customer instructions; breach notice has no fixed
hour count. Subprocessor changes allow thirty-day objections and can lead to
termination when alternatives fail. Audit assistance can be at customer expense.
Return/deletion has legal exceptions; customers retain configuration and consent
duties. Schedule 1 does not contemplate intentional sensitive-data transfers.
External SCC/UK texts and private audit reports were not read.

Read all twelve sections of the [Service Terms](https://openai.com/policies/service-terms/),
updated June 12, 2026. Section 4 expressly warns that generated code may have
third-party licenses. Enterprise/API output indemnities have exclusions; their
existence does not establish coverage for individual Codex use. Apps can transfer
data to third parties under their own terms. Beta, image/video, voice, local
software and other product clauses were read without extending them to unused
features.

Read the complete [subprocessor list](https://platform.openai.com/subprocessors)
in the browser after the text fetch returned no content. The rendered Japanese
page displayed July 9, 2026 and listed infrastructure, moderation, support and
identity providers, plus OpenAI affiliates. Product columns and ZDR/customer-choice
footnotes matter. Its named business products, and the separate Plus/Pro Sites
note, do not identify this Native Codex account's route, residency or plan.
The list describes conditional support/moderation access, not every request's
actual destination. No notice subscription or account setting was changed.

## Notion

Read all definitions and sections 1–13 of the current
[Master Subscription Agreement](https://notion.notion.site/master-subscription-agreement)
in the browser. It displayed **August 17, 2026**, which supersedes the April date
returned by older search material. Section 1.7 includes APIs and adds Developer
Terms for functionality supplied to third parties. Section 7.2 conditionally
incorporates the DPA, with separately executed terms taking precedence. Customer
data and account/usage data have different treatment. Self-service export is
available during subscription; section 10.4 provides a thirty-day post-termination
retrieval period. This is not a universal deletion deadline. Renewal, downgrade,
liability, indemnity, sensitive/card data, beta and California venue provisions
were read. End-user OAuth does not identify the publisher's or each workspace's
applicable agreement.

Read all ten sections of the linked
[Security Exhibit](https://notion.notion.site/Security-Exhibit-306efdeead0580b1b316ff746169a11f).
It describes least privilege, encryption, segmentation, logging, vulnerability
management, incident handling and continuity. Daily encrypted backups are
described, but no customer-specific restore time or evidence of SimpleMemo's
restoration is provided. These commitments supplement the previously read
[DPA, Developer Terms, SLA and subprocessor review](notion-dependency-review-2026-09-07.md).
The browser export command was unsupported; no exported-original fingerprint is
claimed. The rendered pages, rather than a search snippet, were the reading source.

## freee

Read the complete seventeen articles of the
[API Terms](https://app.secure.freee.co.jp/terms-freee-api.html), reached from the
official developer announcement. They cover registered API service providers;
section 3 reserves separate fees and specification changes. Sections 5 and 7
impose security, incident reporting, purpose/consent and deletion duties. Section
9 permits interruption without compensation; section 10 disclaims guarantees.
Sections 11–15 address indemnity, publicity requiring prior written consent,
chain connections, confidentiality and use restrictions. Japanese law and Tokyo
District Court are specified. An account's registration/type/permissions and
whether a particular onward use is a chain connection remain unverified.

The source is a direct client: API main `9f1a677` includes `src/freee/client.ts`
and `src/freee/handlers.ts`, with provider OAuth and read-only accounting endpoints.
It is not assumed to be a third-party MCP connection. Existing company records
describe private internal use. The [earlier review](freee-dependency-review-2026-09-08.md)
covers the general terms, privacy policy and security statement. No vendor
endorsement, new API service publication, onward disclosure or expanded financial
operation is approved by this review.

## Google Cloud and Search Console

Read the complete [BigQuery SLA](https://cloud.google.com/bigquery/sla), last
modified March 29, 2023. BigQuery Standard's SLO is 99.9%; other covered BigQuery
is 99.99%. Valid-request volume, server-error and exponential-backoff rules matter.
Credits are 10/25/50%, capped at 50%, with a thirty-day request window and exclusions.
The separate Data Transfer SLO covers automatic runs from receipt by that service;
it does not guarantee Search Console's upstream data availability. The actual
edition and entitlement were not established.

Read the complete [bulk-export setup guide](https://support.google.com/webmasters/answer/12917675?hl=en).
It requires a billed Cloud project and BigQuery permissions, describes storage/query
costs, initial timing and retries, and warns that data accumulates unless expiration
is configured. It distinguishes historical Search Console retrieval from a newly
started export. Existing [observations](seo/audit-2026-09-05/gsc-bigquery.md) establish
the Search Console dataset, not a customer-level app funnel warehouse. The Cloud
DPA/subprocessors and Firebase service distinctions are in the September 7 reviews.

## Existing accepted and distribution services

The September 1 human reviews of Apple, Resend and the registrar in
`vendor-register.json` are retained, including their open questions. Apple's
independent App Store billing role does not establish a developer-facing DPA or
SLA. Registrar renewal/transfer instructions are distinct from a tested domain
failover. Resend's subsequent account observation identified a signed DPA dated
December 31, 2025 and a Pro plan; the later public HTML is not silently substituted
for that signed document. The owner-accepted training/subprocessor uncertainty
remains in force. See [Resend account review](resend-contract-review-2026-09-07.md).

PR TIMES' public-term analysis is recorded in `corporate-obligations.json` as
`prtimes-public-terms-20260907`. The release's actual draft, recipient list and
pricing were observed on September 8 and are recorded by the press-release
workflow. The review assumes only publication-ready content, retains the
single-release cap, and makes no claim that the service is a confidential archive,
that a numerical SLA applies, or that every distributed copy can be withdrawn.

This is an operational risk assessment. Qualified legal counsel should review the
analysis before it is relied upon for legal decisions.
