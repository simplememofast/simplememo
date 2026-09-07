# 5.8.26 production observation

At 2026-09-07 21:36:53 UTC (2026-09-08 06:36:53 JST), authenticated App Store Connect reads confirmed version 5.8.26 is `READY_FOR_DISTRIBUTION` / `READY_FOR_SALE`, downloadable, with release type `AFTER_APPROVAL`.

- App Store version: `27a95058-dad7-4212-8ca0-a8244c2e4541`.
- Attached build: `1036`, ID `69a994dd-67ec-4071-af25-26574e42deae`, processing state `VALID`.
- [Release run 34028112111](https://github.com/simplememofast/simplememo-ios/actions/runs/34028112111) links that build to tag `v5.8.26`, commit `86e825cfbd209a37a78537eca2ca1d364e24c008`.
- Phased release: `ACTIVE`, day 1, start `2026-09-07T18:13:29Z`, total pause duration 0. This is the phased-release start, not a claim about the exact storefront propagation time or completed rollout.

[ASC Metrics run 34163799833](https://github.com/simplememofast/simplememo-ios/actions/runs/34163799833) completed successfully and committed fresh materials at iOS commit `9e66795`. It confirms the published version and that no review submission is open. Version-specific session counts and crash-rate inputs remain unavailable in those materials; no automatic rollout promotion was performed.

The public application ledger was regenerated with `node scripts/app-releases.mjs --write --at 2026-09-08` from the actual iOS tag and materials history. Its release interval reflects committed observations, which are coarser than the direct observations above. The ledger's `build` field remains null for 5.8.26 because its current generator does not derive that field from the attached App Store build relationship; this document records the independently observed relationship without manually editing generated rows.

This release contains Notion-only save instrumentation. It predates the later Watch handoff/recovery fixes, nested-destination telemetry and broader capture-observation work; publication of 5.8.26 does not establish their production delivery. Received event counts are maintained privately and cannot establish unique failed memos, all-user outcomes or a Zero-decision Capture Rate.

The release was already complete when this work resumed. Observing Apple's automatic release is not a new AI-executed submission or publish operation. Execution classification and the 90% objective remain unchanged.
