# Firebase: subprocessor and SLA review

2026-09-07, Codex. This extends the existing [service-scope evidence](firebase-service-scope-2026-09-07.md); it does not change its hash-bound record, account settings, contract acceptance, or AI execution count.

## Subprocessors

Read the activity definitions, both complete compact tables, and all six FAQ answers in the [GCP subprocessor list](https://cloud.google.com/terms/subprocessors), modified 2026-08-20. Linked documents are outside this reading.

Firebase-specific entries include EPAM (support in Mexico, Poland and the US) and Firebase, Inc. (maintenance/support in the US). All-service support suppliers also remain relevant. Third-party non-Apigee support receives customer data only when the customer elects to share it in a case; Google-group maintenance/support can require limited authorized access. Data-center operation does not require such access. Support routing depends on time, priority and language, not customer location alone. Legal-category Essential Contacts can receive change notices without a separate mailing-list subscription when notification contacts are configured.

Review decision: minimize and redact authentication/user information before support submissions. Verify actual legal contacts and services/regions before narrowing the supplier set. No support case was sent, and actual supplier access was not observed.

## Availability commitments

Read the complete [Identity Platform SLA](https://cloud.google.com/identity-platform/sla), modified 2019-04-08. Its 99.95% objective covers email/password sign-in and existing JWT refresh. Counted downtime requires more than 10% errors, five consecutive minutes, and at least 100 valid requests per minute. Defined errors are HTTP 50x with Internal Error; identical repeated requests are excluded. Credits are 10%, 25% or 50% of covered monthly charges, capped at 50%, applied to future use. Claims require notice within 30 days of eligibility and timestamped downtime logs. Alpha/beta, excluded features, external causes, customer/third-party faults, abuse and quotas have exclusions.

Review decision: do not describe Google/Apple initial sign-in or App Check as covered by that objective. Existing JWT refresh may be relevant, subject to actual product and agreement applicability. Retain incident evidence independently of credit eligibility; the request-volume threshold can exclude small-traffic outages.

The complete [product comparison](https://docs.cloud.google.com/identity-platform/docs/product-comparison?hl=en), updated 2026-08-26, distinguishes upgraded Identity Platform from ordinary Firebase Authentication and lists no enterprise SLA for the latter. The previously observed Blaze billing plan does not by itself establish the Identity Platform upgrade. No upgrade or spending change was made.

## Remaining evidence

Account upgrade status, accepted contract version, notification contacts, SCC applicability, retention/deletion behavior, App Check-specific commitments, and a tested exit path remain unresolved. These findings support review of known authentication dependencies; they do not establish that every registered vendor has completed DPA/data-use/SLA/exit review. Public-source conclusions must not be represented as production traffic observations.
