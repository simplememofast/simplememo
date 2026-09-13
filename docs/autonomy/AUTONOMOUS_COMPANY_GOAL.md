# Autonomous Company OS — Goal Contract

## Objective

SimpleMemoの既存自動運営資産をすべて発見・統合し、定期レポートを意思決定と実行につなげ、Growth PDCAとAutonomy PDCAを継続実行可能な状態にし、既存の安全境界を守りながら自律度を実際に改善し、その改善を測定・検証できるところまで完遂する。

これは設計書・TODO・Skill・scheduler設定の作成だけでは完了しない。実データによるRUN → OUTPUT → VERIFYと、従来人間が行っていた判断または実行の移管を必要とする。

## Context and canonical state

- Native Codex Goal: thread `01a09937-5f64-7032-9084-650e5bdd6c28`, active since 2026-09-13. Native `create_goal` succeeded; no emulation or restart is needed.
- Resume from `GOAL_STATE.json` in this directory. Runtime inventory and private observations are under `~/.config/simplememo/company-os/`; never commit credentials, private analytics, customer data, email bodies or imported conversation transcripts.
- Implementation worktree: `~/.codex/worktrees/autonomous-company-os-20260913/simplememo`, branch `Codex/autonomous-company-os-20260913`, starting main `e5cd8db1`.
- Original checkout has unrelated uncommitted work; preserve it. Other active tasks and registered schedulers retain ownership until parity and rollback are verified.

## Baseline and metric integrity

Initial recalculation at main `e5cd8db1`, 2026-09-13:

| Existing metric | Numerator / denominator | Value |
|---|---|---|
| AI execution rate | 159 / 176 | 90.34090909090909% |
| Overall automation rate | 159 / 192 | 82.8125% |
| AI involvement rate | 166 / 176 | 94.31818181818182% |
| Coverage rate | 176 / 192 | 91.66666666666666% |
| Reachable automation, classified ceiling | 176 / 192 | 91.66666666666666% |
| Boundary delegation, classified ceiling | 183 / 192 | 95.3125% |
| Autonomy score (separate 28-day instrument) | existing weighted components | 46.61554206662902 / 100 |

Sources: `data/automation-coverage.json`, `scripts/automation-rate.mjs`, `scripts/autonomy-gap.mjs`, `scripts/autonomy-score.mjs`. AI completion is separately recalculated from `scripts/autopilot-runs.mjs`: shipped / attempted. Ceilings are conditional classifications, not completed work or promises.

Earlier user-approved scope revisions already exist. Preserve those historical series, but make no denominator reduction, exclusion, task splitting, threshold relaxation, retrospective intervention removal or unsupported executor promotion in this Goal. Preserve the baseline task cohort in addition to the current official metric. A new workload must not be counted as an existing task transfer. Keep diagnostic H0–H5 and opportunity scores separate from official metrics. Do not expose the autonomy-score instrument to the existing ranker against its policy.

First milestone: a real existing human judgment or execution transferred end to end and an improvement in at least one existing formal metric. Test whether 83% overall automation can be crossed by real transfers; never manufacture a transfer or demand to hit it. Report boundary-limited potential separately.

## Scope

1. Discover repositories, Claude/Codex skills, commands, configurations, automations, local schedules, logs, state, worktrees, GitHub Actions, Cloudflare cron/bindings, GCP/BQ schedules, analytics exports and recurring reports. Record complete, partial and inaccessible discovery surfaces honestly.
2. Build an Automation Registry with identity, purpose, runtime/owner, schedule/timezone/trigger, inputs/sources, outputs/destination, code path, latest success/failure, health/retry, human requirement, cost, overlaps, replacement status and autonomy contribution.
3. Reuse the existing Autopilot, Act, Decision Monitor, Routine Observer, value contracts, decision feedback, experimental ledger, analytics API and SEO ingestion. Add only missing adapters. Preserve current report formats and notification routes with old-to-new mappings.
4. Integrate available GSC, GA4, BigQuery, ASC and AppsFlyer. Apple Search Ads only if already connected. Missing access is a bounded blocker, never a zero.
5. Make growth-status, growth-audit, growth-autopilot, autonomy-status, autonomy-audit and autonomy-lift runnable. Reuse seo-audit; discover aio-audit and content-gap before adding missing adapters.
6. Maintain an autonomy ledger for every operational task: DETECT → DECIDE → EXECUTE → VERIFY → REPORT → LEARN, H0–H5, permission, automation status, score contribution, ceiling and next improvement.
7. Link observations to evidence-based decisions, safe execution, verification and learning. Track Growth and Autonomy Opportunity Scores (0–100) separately, including effort, human time, reliability, reversibility, permissions, business impact, reuse and cost. Follow the existing selector's approved value contracts and anti-gaming policy.
8. Extend the existing experiment registry with compatible mappings for hypothesis/evidence/action/baseline/KPIs/guardrails/impact/evaluation/status/decision/learnings. Preserve original dates, uncertainty and sufficient-data requirements. Follow up at meaningful 24h/7d/14d/28d intervals without early SEO success claims.
9. Integrate Daily health/KPI/action checks, Weekly Growth + Autonomy reviews, Monthly 30d/90d strategy and experiment follow-up into existing schedules. Safe top opportunities execute within their canonical owner and gates; no duplicate model runs.
10. Provide bounded retry, error classification, safe repair, tests, rerun evidence, health checks, logs, partial-failure handling and cost observability. Missing credentials/permissions and real external outages remain blockers; no scope expansion.

## Constraints and permissions

`data/authority-matrix.json`, emergency stops, cost/model routing, release/rollout/value-metric gates and `~/.config/cloudflare/simplememo/RUNBOOK.md` are authoritative. AUTO means permitted by these current boundaries, not merely technically possible. Preserve APPPROVAL / FORBIDDEN / MANUAL operations. No new login grant, broader token, budget reset or waiver. No external email/DM/social posting without specific authorization. Normal reviewed site PRs use existing CI and Git deployment; App Store, pricing, legal and irreversible operations retain their own gates. Do not reactivate intentionally paused schedules.

One failed source must not stop independent useful work. Aggregate unavoidable human actions into `HUMAN_BLOCKERS.md` with exact scope, reason, minimum action, permission and work unlocked. Avoid repeated questions and repeated reads of unchanged missing data.

## Checkpoints and verification

Record `verified`, `remaining`, `blocked`, `next` at every checkpoint:

1. Discovery: Claude, Codex, repository/CI, local and remote scheduler surfaces checked; inaccessible surfaces documented.
2. Registry + Baseline: all discovered jobs cataloged; existing formulas versioned with source hashes, numerators, denominators, exclusions and calculation timestamps; historical comparison retained.
3. Architecture consolidation: canonical owners and report mappings chosen; migration uses existing outputs, parity checks and rollback. No legacy job retired before a successful replacement run.
4. Data integration: existing connections used with current real outputs, freshness, coverage and cost; blockers for unavailable dimensions.
5. Growth loop: working skills and evidence → decision → action → verify; business effects remain unproven until measured.
6. Autonomy loop: working skills, Human Touch Map, opportunity scoring and a real human task removed.
7. Scheduling: Daily/Weekly/Monthly/follow-up actually registered and read back, without duplicates.
8. Self-healing: bounded retries, failure state, safe recovery and independent failure tests work.
9. End-to-end run: scheduled/autopilot-equivalent execution produces retained outputs and verifies them. Manual bootstrap is labeled manual, never zero-touch scheduled execution.
10. Re-score: existing metric improves from real executed work; unchanged denominator comparison and actual human work reduction are proven.
11. Closeout: relevant tests/CI, deployment where authorized, next-session entry points, rollback and ongoing owner/schedule evidence verified.

## Stop and block conditions

COMPLETE requires every applicable acceptance condition above, at least one real PDCA run, at least one real human-work transfer and a verified existing-metric improvement. A report, code, dashboard, test-only run, waiting experiment or saved scheduler alone is insufficient. Connected-source limitations can remain only as explicit source blockers; they cannot hide missing required execution or fabricated measurement.

Native Goal remains active while useful work is possible. Mark blocked only under the native tool's required repeated-blocker conditions, after exhausting independent work. Never mark complete to end a chat, reduce effort or because the budget is nearly exhausted. Natural-time observations remain pending and use existing or explicitly integrated follow-up.

## Rollback

Keep original schedules and saved configurations until replacement output parity and one successful real execution. Back up machine-side changes privately before mutation. Deploy through normal reviewed commits and use a normal revert PR if needed. Do not force push, erase logs, overwrite another task's claim, unlock stops or weaken verification. Retain the old-to-new owner/output mapping and evidence of any intentional retirement.

## Final closeout

Only after verified completion report COMPLETE / PARTIAL / BLOCKED, reused systems, retired duplicates, Daily/Weekly/Monthly/follow-up, connection status per source, all formal metrics before/after/deltas, real human work removed, an end-to-end example, successful runs/tests, known/unknown cost, unavoidable human blockers and the next permission/work frontier.
