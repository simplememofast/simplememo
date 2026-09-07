# GitHub review and source recovery evidence

Codex reviewed the following sources on 2026-09-07. The AI finding is **remediation required**: source history is recoverable from the local copies tested below; account-specific DPA/SLA applicability and complete provider replacement remain unverified. This finding does not approve a contract or complete the portfolio-wide vendor review.

## Contract and data use

Read [DPA sections 1–14 and Attachments 1–4](https://github.com/customer-terms/github-data-protection-agreement), October 2025. Processor instructions coexist with independent-controller purposes for account/billing, legal, abuse and aggregated business statistics. Previews are generally excluded. Incident notification is without undue delay. Audits can require notice, agreed scope and customer costs. Termination return/deletion has policy and legal exceptions; section 8 does not establish a universal numeric deletion deadline. Subprocessor notices allow 30 days before changes; objections can require terminating affected services, potentially the bundle. External SCC texts and private audit reports were not reviewed.

Read the complete [customer-terms index](https://github.com/customer-terms). Terms depend on purchased products. Read-only API observations established the repository owner's User account type but returned null plan information. Null is not evidence of any particular subscription or acceptance.

Read the entire [June 2026 SLA](https://github.com/customer-terms/github-online-services-sla), including both formulas visually. Its quarterly 99.9% commitment has 5/10/25% credit bands and a claim window ending 30 days after quarter-end. Actions unavailability concerns missing output five minutes after a successful trigger; an ordinary test failure does not establish unavailability. Enterprise and Packages use different calculations. Payment requirements, expiry and exclusions apply. Applicability to this account remains unverified; no claim was submitted.

Read all 25 third-party and seven subsidiary rows in the [subprocessor list](https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors). Infrastructure, AI inference, support, security and messaging functions differ. A listed provider is not proof that SimpleMemo code was sent to it. The separate notice-subscription instructions and account subscription state remain unverified.

## Executed source recovery

At 2026-09-07 12:26:47 UTC, fetched each repository's main, created and verified a Git bundle, fetched it into a new bare repository and passed `git fsck --full`. The restored commit and tree matched the fetched source. Bundle SHA-256 and restored refs were subsequently checked against the saved receipt before writing this report.

| Repository | Recovered main commit | Recovered tree |
| --- | --- | --- |
| simplememo | `36cd43fe8b9466e5cd539195b9252053e472bf79` | `640aed912cbf5018e1f7a863a64e74e795600c77` |
| simplememo-ios | `3e1b3718ff6f9e3a485d6f4783744ab0571b6e29` | `b9abd5493006cecec023f6ace7f15b5dc7e89472` |
| simplememo-api | `d712aed8f86155805704f28374e9e98cffbc4aa1` | `ce333fe1b62e0b21910c926293e8b955ef0f0737` |

Bundles and the receipt remain in a private local recovery directory. This is a point-in-time copy of main history, not every ref or the latest future commit. It does not cover LFS object recovery, issues/PR metadata, artifacts, secrets, CI replacement or a runnable deployment. All copies are on the same computer, so the exercise does not protect against loss of that computer.

Read GitHub's entire [backup guide](https://docs.github.com/en/repositories/archiving-a-github-repository/backing-up-a-repository): source, LFS, wiki and migration metadata require distinct handling; migration archives do not provide a supported general GitHub restore path. The next recovery work is an independent storage copy plus testing the dependencies actually needed to rebuild and ship. No remote backup destination has been selected or written, and no production configuration changed. No additional execution task is credited for this substep.
