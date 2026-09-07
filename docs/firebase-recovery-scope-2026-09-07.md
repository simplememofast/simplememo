# Firebase recovery and transfer scope

Codex reviewed API main `d712aed8f86155805704f28374e9e98cffbc4aa1` on 2026-09-07. The previous vendor-register explanation conflated two controls.

- `src/oauth.ts`: `VERIFY_OAUTH_DISABLED=true` returns HTTP 503 with `oauth_disabled` before verification. It stops this endpoint; it does not accept an unverified identity.
- `src/appcheck.ts`: `APP_CHECK_ENFORCE` determines rejection on the gated POST routes. Monitoring mode can still verify an available token. Enforced mode allows infrastructure errors through, but rejects missing or invalid tokens. These are code paths, not observations of current production settings.

Neither switch replaces Firebase Authentication or establishes complete SDK/network shutdown. A recovery operator must identify which function is failing before selecting a control. No setting, secret or customer record was changed. This correction is not a completed failover or an extra execution task.

## Additional transfer reading

Read the entire displayed [Google Controller-to-Processor SCC](https://cloud.google.com/terms/sccs/eu-c2p), clauses 1–18, footnotes and Annexes I–V (modified 2023-08-17). Clause 14 requires a documented assessment of transfer circumstances, destination law and safeguards. Clause 16 provides suspension and termination conditions. Annexes rely on agreement-specific parties and console information; page retrieval does not execute them. Swiss and UK adaptations are conditional. Google's UK supplementary terms restrict importer termination and treat exporter termination notice as ending the agreement for convenience.

Read the complete substantive [alternative-transfer table](https://cloud.google.com/terms/alternative-transfer-solution), modified 2024-09-16. Google reports US framework adoption for EU, UK and Swiss transfers; other destinations are treated separately. This provider statement does not establish SimpleMemo's transfer route or independently verify current certification. Use the DPA's conditional transfer logic before choosing a module.

Read all nine pages of the [ICO B1.0 Addendum](https://ico.org.uk/media2/migrated/4019539/international-data-transfer-addendum.pdf), including mandatory sections 1–20. Legally binding entry does not require a particular signature form. The UK addendum generally prevails, except more protective EU terms. Revisions can amend it automatically. Section 19 termination requires a selected party, substantial and disproportionate added costs or risks, attempted mitigation and timely notice. Reading this template does not establish a vendor's selected options or account acceptance.

The newly read text closes those reading gaps only. Actual parties, certification, configuration and applicable transfer mechanisms remain to be reconciled; historical approval fields and the execution score remain unchanged.
