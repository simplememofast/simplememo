# Routine observation and site publication checks

The routine observation ledger describes SimpleMemo's scheduled article operations.
Its health is not evidence that a separate site change works. Conversely, an old
snapshot does not establish that a site change is defective. This separation was
approved by the owner on 2026-10-17. The observation schema, three-day age limits,
historical failures, and source-access restrictions remain unchanged.

On 2026-10-20 the owner retired the Mac routine observer. While the ledger carries a
valid `observation_retirement` marker (conditions in `docs/routine-observer.md`), both
actual checks print `retired — not observed since <time>` instead of applying the
three-day limit; they do not report the routines as healthy. If any condition fails,
the three-day limit applies unchanged.

## Status of the 2026-10-19 ledger freshness extension

**This extension was proposed on 2026-10-19 as a draft PR. It is in force only on a
main that contains it: the owner's merge of that PR is its approval, and nothing
else approves it.** It applies the 2026-10-17 principle to two more freshness gates:
the autopilot run ledger and waiting progress. The reason for the
proposal is the 2026-10-17 to 10-19 deadlock. The broken Mac observer made the routine
ledger stale, so the daily Act sync stopped and the autopilot run ledger became stale
too. The hand-synced revenue mirror passed its four-day budget at the same time. From
then on every site PR failed both freshness gates for reasons it did not cause.

**This proposal does not remove every clock-driven gate on every PR.** The site job
step `Autopilot page vs ledger` (`check-autopilot-page.mjs --check`) still runs on
every PR and is outside this proposal. It compares `/autopilot/` with an autonomy
score whose 28-day window ends today (`windowOf()` in `autonomy-score.mjs`). The
daily Act run regenerates that page. When the daily pipeline stops, the clock alone
can therefore make the page disagree with the score, and every PR fails this step.
Measured on 2026-10-24 with a Node clock shift, on main at 561b3283a and on this
branch alike (ledger last synced 2026-10-23T01:33Z, page 2026-10-23T17:00Z): it
passed at 2026-10-25 and failed at 2026-10-26 (total 47.5 vs 45.4, `ra` 4.0 vs 2.5,
`ep` 8.7 vs 8.1). The run ledger freshness check had already failed at 2026-10-25.
Whether it fails depends on the data: on the 2026-10-17 to 10-19 deadlock snapshot
(0bdae2130) it passed at 10-17T15Z, 10-18T03Z and 10-19T03Z, so that deadlock came
only from the two gates above. Before this proposal, `Autopilot run ledger` failed
first and the job skipped every later step. With it, a site PR passes that step and
can stop at `Autopilot page vs ledger` about one day later. The same sweep over the
site job's other unconditional `--check` and `--integrity` commands on this branch
found no other result that changed between 2026-10-24 and 10-26. It ran without Git
history and shifted only the Node clock, so Python checks and checks that need Git
history were not assessed. Whether to scope this gate is a separate owner decision;
this proposal does not change it.

| Context | Required checks | Meaning of an observation failure |
| --- | --- | --- |
| Every PR | All existing site checks; all routine observer selftests; CI scope regression tests; `autopilot-runs --selftest` and `--integrity` (ledger shape, cost-ledger readability, status JSON agreement); `check-waiting-progress --selftest` and `--integrity` (waiting configuration such as a missing `stale_budget_days`, and readable counters) | A failing mandatory check still blocks publication |
| PR changing routine operations | Both actual Claude and Codex ledger checks, and the full `autopilot-runs --check` (one-day ledger freshness), in addition to the above | Blocks this operational change |
| PR changing waiting-progress inputs (including any deletion under `growth/data/gsc/`) | The full `check-waiting-progress --check` (unacknowledged or expired stalls), in addition to the above | Blocks this change to the waiting inputs |
| PR changing neither | No live-health or ledger-freshness publication requirement; the summary explicitly says observation health and ledger freshness were not assessed | Does not claim the routines are healthy or the ledgers are fresh |
| Main push and existing Main Daily Validation schedule/manual run | Independent `routine-health` job runs all four actual checks (Claude, Codex, autopilot run ledger, waiting progress), even when site checks fail | Job and workflow stay failed; site checks still run independently |

Operational paths are explicitly enumerated in `scripts/lib/routine-ci-scope.mjs`:
the routine/run/action/cost/stop ledgers; observation producers and consumers;
native preflight/recovery code; operational workflows; and their operating
instructions. Additions, edits, deletions and moves are covered. A PR compares its
actual head against its merge base with the event's base SHA, not against the
checked-out synthetic merge commit. Git's complete NUL-separated path inventory
avoids API file-list limits. Missing identity or failed comparison fails the site
job instead of classifying it as unrelated.

The autopilot run ledger freshness check reuses these operational paths. They already
include the ledger itself (`data/autopilot-runs.json`), its checker
(`scripts/autopilot-runs.mjs`), its daily producer (`scripts/autopilot-act.mjs`,
`scripts/lib/codex-run-intake.mjs`, `autopilot-act.yml`), and the runbook.
One known gap is left for the owner to decide: since 2026-10-20 (#2124) the publish
job's `scripts/autopilot-publish.mjs` also appends rows, and it is not an operational
path. A PR that changes only that file, or `scripts/lib/autopilot-paths.mjs`, is
therefore not gated on ledger freshness under this proposal. Adding them to the
operational paths would also require the Claude and Codex observations for them.

Waiting-progress inputs are a second explicit list, `WAITING_PROGRESS_PATHS`, in the
same helper:

- `data/waiting-progress.json` (budgets, acknowledgements and sources)
- `data/revenue-series.json` (the public revenue mirror counter)
- `data/financial-policy.json` (co-written by `revenue-series --write`)
- `growth/scripts/revenue-series.mjs` (the mirror producer)
- `growth/REVENUE_OBSERVATIONS.md` (its operating instructions)
- `scripts/check-waiting-progress.mjs` (the checker, so it cannot exempt its own change)

The list is separate because neither waiting input is a routine operation. The revenue
mirror is synced by hand from simplememo-ios, and the GSC snapshot is a weekly ingest.
With one list, routine repairs would wait for a revenue re-sync, and revenue syncs
would wait for fresh routine observations.

`growth/data/gsc/` is an append-only directory in the same helper
(`WAITING_APPEND_ONLY_DIRS`). The GSC wait reads only its newest date directory name.
Adding a date directory can only move that date forward, so additions are not in
scope; gating them would make the weekly ingest wait for the hand-synced revenue
mirror. Any deletion under the directory is in scope, because it can move the newest
date back (for example a revert of the latest ingest). The helper reads deletions from
a second Git inventory of the same comparison (`--diff-filter=D`). With
`--no-renames`, a rename appears as a deletion of the old path. An invalid or
inconsistent deletion inventory fails the scope step. A caller that passes none gets
every change under the directory treated as a deletion.
Editing a file inside an existing date directory deletes nothing and is not gated.
Adding a date directory in the future would make the wait look moving. That is also
true of the full check today, so it is a limit of the checker and not part of this
proposal. Main/daily still checks every wait.

A PR in this scope runs the whole check, so every wait must be moving or acknowledged,
not only the one it touches. For example, a revenue sync made while the GSC wait is
stalled must either acknowledge that stall (`acknowledged_stall` with `review_by`) or
wait for the GSC ingest, which is not gated.
Every checker gated by a scope must itself be in that scope; the regression test
derives this from the workflow. Another regression test reads the real
`data/waiting-progress.json`: every counter file a wait reads must be in the list, and
a directory wait must be an append-only directory whose deletions are in scope, so a
new wait cannot silently fall outside both.

Only the time-driven part is scoped. `autopilot-runs --integrity` still runs
`validate()`, the cost-ledger read and the status JSON agreement, which reads no
clock. Before this change that agreement was skipped whenever the ledger was stale,
because staleness exited first. `check-waiting-progress --integrity` still fails a
missing or invalid budget, a non-array `waits`, and an unreadable wait (missing field,
file or directory, or a future rolling timestamp). If both `--check` and
`--integrity` are given, `--check` wins. The thresholds and acknowledgement rules are
unchanged: one day of ledger lag, `stale_budget_days` 4 and 9, and `review_by` expiry.
Other freshness gates in `seo-check.yml`, such as the app release ledger and
prior-art, are untouched, and so is `Autopilot page vs ledger` (see the status section).
`autopilot-act.yml` still runs the full ledger check before it writes.

CI routing (`seo-check.yml`, the scope helper and regression tests, and this policy)
is validated by unconditional contract tests. Changing that routing is not a new
observation of historical runs. This distinction applies to every PR; it is not a
special exemption for one release. Changes to an operational path still require
fresh observations even when mixed with routing or website changes.

No new schedule, token, permission, branch-protection rule or observer invocation
is added. The existing daily workflow calls SEO Validation; its operational
failure remains visible to the existing Cron Health monitoring. Auto-merge keeps
its existing successful PR-validation and exact-commit requirements. Main/daily
monitoring failures are not converted to success or treated as repaired.

`preflight.mjs` retains the unconditional regression tests and explicitly lists
the actual observation commands and both full ledger freshness checks
(`autopilot-runs --check`, `check-waiting-progress --check`) as conditional, not
executed locally. It runs the `--integrity` forms. To check ledger freshness
locally, run those two commands directly. A local preflight pass is not a substitute
for the PR's scope decision and required CI checks. Neither CI path reads private
Codex stores: actual health checks only validate the committed public ledger. They
do not collect or refresh evidence.
