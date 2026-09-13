# Autonomous Company OS — existing owner integration

The native Codex automation `obsidian` is the daily master owner at 06:00 Asia/Tokyo. This document adds Growth/Autonomy inputs and follow-up to that owner. It does not create a second Autopilot, publication claim, model caller or release authority. Read `docs/codex-autopilot-execution.md`, `docs/obsidian/AUTOPILOT_RUNBOOK.md`, `data/authority-matrix.json`, emergency stops and existing budget gates first. A saved schedule is not a successful scheduled execution.

## Canonical sources

| Responsibility | Existing authority / integration |
|---|---|
| Selection, permission, one action, prospective contract, CI, ship | Existing Obsidian Runbook, `value-contracts.mjs`, `autopilot-runs.mjs` |
| Formal coverage, completion, 100-point instrument | Existing `automation-rate.mjs`, `autonomy-gap.mjs`, `autopilot-runs.mjs`, `autonomy-score.mjs`; exact adapter `growth/lib/company-metrics.mjs` |
| Routine health and recovery ownership | Existing Routine Observer / `autopilot-act.mjs` / `autopilot-selfheal.mjs`; launchd and GitHub fallback retain their claims |
| GSC | Existing daily/weekly collector, `growth/lib/gsc.mjs`, BigQuery bulk export; no extra daily GSC query |
| GA4 | Existing encrypted `analytics-read.yml`, fixed `ga4-funnel`, same maturity and byte caps |
| AppsFlyer | Reviewed `simplememo-api/scripts/appsflyer_aggregate.py` from `origin/main`, same local credential and CSV validation |
| ASC, proceeds, reviews, crash availability | Existing private iOS Actions and committed reports; copy their aggregate outputs privately, do not fetch a duplicate |
| Content / SEO | Existing `growth/scripts/analyze.mjs`, content queues, experiment overlap and evidence gates, installed `seo-audit` |
| AIO | Existing `codex-ai-visibility-probe.py`, fixed questions, separate model series, existing weekly reservation; never launch a second probe because a result is weak |
| Mention / Reddit | Existing mentions directory and report tasks; use observations as evidence. Intentionally stopped posting stays stopped |
| Experiments | `growth/experiments/experiments.json` remains authoritative; Company views preserve its semantics. Operational follow-ups are private linked records, not replacements for growth experiments |

Complete private machine registry: `~/.config/simplememo/company-os/automation-registry.json`. Inputs: `discovery/`. Registry schema and builder: `scripts/company-inventory.py`; refresh: `scripts/company-discover.py`. Each source has its own observation time and coverage limits. Archived tasks, enabled definitions, fired sessions, successful processes and successful business outputs are different states.

Private runtime files must remain outside every Git checkout, in an owned 0700 directory with 0600 files. Do not commit customer data, ASC revenue, AppsFlyer rows, decrypted BigQuery results, native prompts, shell history, account/task inventory or credentials. Public site assets can expose even robots-disallowed documents.

## One native run

1. Confirm the actual native automation ID, planned slot and task ID with the existing native scheduler/preflight reader. Keep the original `actions` route and stop key for `obsidian`. Manual Goal/bootstrap execution is `owner-session` with its recorded human request; do not manufacture a scheduled origin. Existing stop, unresolved claim, budget or preflight rejection is not bypassed by this OS.
2. Read the latest private `latest-run.json`, `audit.json`, `HUMAN_BLOCKERS.json` if present and the existing run/fault/value-contract histories. Do not repeat a blocked credential probe or repair already owned by another current claim. Historical task IDs alone are not current ownership.
3. Refresh local metadata: `python3 scripts/company-discover.py`. After reading the existing Cloudflare runbook, add `--cloudflare` for bounded daily cron health. On the first run of each JST week also use `--remote`; it reuses existing read access, never mutates schedules. Failed sources retain their old receipt and get a refresh failure; freshness remains visible. Review newly discovered or disappeared owners before changing any schedule.
4. Run `node scripts/company-os.mjs collect --analytics`. This reuses ASC outputs and the original AppsFlyer reader, and resumes the fixed encrypted GA4 request by UUID. Source failures do not stop other readers. `dispatched` is pending: wait 30 seconds, continue independent analysis, then run the same command to resume. Stop polling after ten minutes; preserve the receipt for the next tick. Never resubmit an uncertain paid query. GSC uses the existing snapshot collector.
5. Run `node scripts/company-os.mjs growth-autopilot --origin codex-automation` (manual Goal uses `--origin goal`). This persists OBSERVE and ranked candidate evidence. `observed_decision_requires_execution` explicitly means the cycle has not finished. Inspect `latest-run.json`, the short `growth-status` output and existing self-heal/contract feedback. Formal autonomy scores are reporting instruments and are **not** selection rewards.
6. Compare at least two current candidates across growth and operational domains. Use Growth Opportunity Score and the 12-factor Autonomy Opportunity Score as estimates. Factor evidence includes frequency, saved human work, reliability, reversibility, safety, effort, business/growth impact, reuse, cost and permission. Prefer actual customer/business outcomes over easy score changes. Include observed failures, content gaps, active experiment decisions and manual H3–H5 handoffs. Verify current source evidence and ownership before acting.
7. Pass candidates through the **existing** eligibility, stop, budget, repeat, scope, value-metric and prospective-contract gates. Where required, declare the selected contract in its own commit and push **before** implementation. A high opportunity score never grants permission. Do not retrofit contracts onto this initial user-directed integration draft or past work. Respect the same one-business-action/claim limit; collection and report maintenance do not create a second publication lane.
8. Before implementation, bind the new canonical Autopilot run ID: `node scripts/company-os.mjs bind --run <Company UUID> --autopilot-run <new canonical run ID>`. Historical IDs are rejected. Execute the highest eligible AUTO improvement in this session without waiting for a user to read the report. Implement and test a safe repair/content/internal-link/tracking change, or evaluate an existing mature experiment through its existing evidence gate. Approval-only work becomes a precise blocker while other AUTO work continues. Never replay customer emails, alter consent, publish App Store releases, pricing or legal terms based on this document.
9. Verify the real output, not merely exit zero: artifact hash/schema/date coverage for data; relevant tests and exact-SHA CI, merge and served output for a site change; metric-specific evidence for experiment decisions. Missing or immature evidence means INCONCLUSIVE, not WIN. Existing `keep` decisions are not automatically mapped to WIN. Use normal reviewed PRs; retain rollback and the original report destinations.
10. Record the actual run through the existing `autopilot-runs.mjs` command, using the real route, PR, task reference, outcome and human interventions; failures and no-artifact attempts remain in the denominator. Save the Company's execution proof with `company-os.mjs finish --run <id> --evidence <private.json>` once its verifier accepts the actual output. Then recompute `autonomy-status`. A formal metric increase from another task or changed denominator is not attributed to this change.
11. Update linked experiments and human-touch events. Save Daily review; Weekly on the first eligible run of the week, Monthly on the first eligible run of the month. Review all due follow-ups during every daily run. Read-only reporting is not an additional business action. If material evidence did not change, use the quiet result. Keep meaningful existing reports and notification routes.

The regular finish evidence is `{ "kind": "autopilot_run", "run_id": "<bound ID>", "pr": 123, "learning": "Observed result and limitation" }`. The verifier requires that the matching canonical row is introduced in that real merge, exact final-SHA PR validation succeeds, and the same-site artifact matches its merged source. For the existing explicit `artifact: null` code-wiring case, verify the exact merge's successful Pages deployment and the public `data/autopilot-status.json` bytes instead. Internal `/scripts` and `/growth` paths are intentionally blocked by middleware; do not expose them to satisfy delivery verification. Domain-specific tests and impact still use the existing PR and experiment gates. The initial data integration additionally uses `{ "kind": "pipeline_integration", "pr": 123, "collection_receipt": "<private AppsFlyer receipt>" }` and verifies the new bound ledger row, original-parser parity and actual native-owner persistence.

## Cadence and follow-up

All four duties are hooks in the existing daily owner, not four new model jobs:

| Hook | Due key / action |
|---|---|
| Daily | JST date: source health, ingest, anomalies, failed jobs, stop/permission failures, due experiments, highest-value AUTO action |
| Weekly | JST Monday key, once per week with catch-up: existing Weekly Growth Report plus autonomy/current/previous/delta, new transfers, touches, failures, self-heals, blockers, cost and next frontier |
| Monthly | JST month key, once per month with catch-up: actual 30/90-day coverage, channel/product/operating bottlenecks, cost, intervention and strategic action |
| Follow-up | Daily inspect existing experiment dates and private linked operational experiments; 24h technical health, 7/14/28-day evaluation only where their evidence horizon is appropriate |

Commands: `node scripts/company-os.mjs review --cadence daily|weekly|monthly|follow-up`. Weekly includes the unmodified existing report as its first section; new private material is an appendix. Run `node scripts/company-os.mjs follow-up` daily to evaluate due operational follow-ups using actual native execution records; inspect the existing growth experiment due list separately. Follow-up must run its decision/action steps above, not only render this report. If data is too young, preserve the evaluation state and set the next warranted check without pretending impact is known.

## Failure and cost handling

Read-only transient requests: classify 429/5xx/timeouts, at most three reserved attempts; never retry 401/403 by changing credentials. Validate first, repair safe input/code errors, test, then rerun within the original bound. Reuse artifacts by source/window/hash. Analytics dispatch UUID is persisted before dispatch; uncertain dispatch resumes by identity. Unknown/malformed locks stay blocked; a proven absent local PID can have its lock archived and recovered. Outbound or irreversible operations use their existing domain-specific idempotency/recovery.

Each source receipt keeps attempts, errors, provenance and output checks. Actual BigQuery billed bytes are recorded; USD is null when price/allowance is unobserved. Codex usage and Claude USD ledgers remain separate. Use the existing cost reader/budget and 90-minute model execution limit; do not add nested model calls or a new subscription. Track cost per shipped output and verified run only when both numerator and denominator are observed.

## Resume, migration and rollback

For this installation Goal, read `AUTONOMOUS_COMPANY_GOAL.md` and `GOAL_STATE.json`. Native Goal is real and remains active until its acceptance gates hold. For ongoing operation, `OPERATING_RUNBOOK.md` and private `latest-run.json` are the entry point.

Before any scheduler change, save its complete configuration privately. Update the existing owner, preserve identity/schedule/model/notification settings, and verify native persistence. Output parity must compare the original reader's output with the integrated reader's output, including missing cells and population, before calling migration verified. Retire no legacy job unless its replacement has succeeded, parity is verified and rollback is saved. Paused backups and other active investigation threads remain untouched.

Rollback the integration with a normal revert PR and restore the saved native prompt through the native automation tool. Original API readers, CI, customer messages and their destinations remain in place. Do not delete the evidence or alter historical metric definitions.
