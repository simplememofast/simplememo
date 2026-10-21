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

**This extension is a proposal in a draft PR and is not approved yet.** It applies
the 2026-10-17 principle to two more freshness gates: the autopilot run ledger and
waiting progress. It takes effect only if the owner merges that PR, and the merge is
the approval. Until then this document records no approval for it. The reason for the
proposal is the 2026-10-17 to 10-19 deadlock. The broken Mac observer made the routine
ledger stale, so the daily Act sync stopped and the autopilot run ledger became stale
too. The hand-synced revenue mirror passed its four-day budget at the same time. From
then on every site PR failed both freshness gates for reasons it did not cause.

| Context | Required checks | Meaning of an observation failure |
| --- | --- | --- |
| Every PR | All existing site checks; all routine observer selftests; CI scope regression tests; `autopilot-runs --selftest` and `--integrity` (ledger shape, cost-ledger readability, status JSON agreement); `check-waiting-progress --selftest` and `--integrity` (waiting configuration such as a missing `stale_budget_days`, and readable counters) | A failing mandatory check still blocks publication |
| PR changing routine operations | Both actual Claude and Codex ledger checks, and the full `autopilot-runs --check` (one-day ledger freshness), in addition to the above | Blocks this operational change |
| PR changing waiting-progress inputs | The full `check-waiting-progress --check` (unacknowledged or expired stalls), in addition to the above | Blocks this change to the waiting inputs |
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
would wait for fresh routine observations. `growth/data/gsc/**` is deliberately not in
the list: a new date directory can only advance that counter, and including it would
gate the weekly ingest on the hand-synced revenue mirror. Main/daily still checks it.
The cost of that exclusion: a PR that deletes or rewrites a GSC snapshot directory is
not stopped by waiting-progress freshness at PR time; main/daily fails instead.
A PR in this scope runs the whole check, so every wait must be moving or acknowledged,
not only the one it touches. For example, a revenue sync made while the GSC wait is
stalled must either acknowledge that stall (`acknowledged_stall` with `review_by`) or
wait for the GSC ingest, which is not gated.
Every checker gated by a scope must itself be in that scope; the regression test
derives this from the workflow. Another regression test reads the real
`data/waiting-progress.json`: every counter file a wait reads must be in the list, and
a directory wait must be on the explicit exclusion list, so a new wait cannot silently
fall outside both.

Only the time-driven part is scoped. `autopilot-runs --integrity` still runs
`validate()`, the cost-ledger read and the status JSON agreement, which reads no
clock. Before this change that agreement was skipped whenever the ledger was stale,
because staleness exited first. `check-waiting-progress --integrity` still fails a
missing or invalid budget, a non-array `waits`, and an unreadable wait (missing field,
file or directory, or a future rolling timestamp). If both `--check` and
`--integrity` are given, `--check` wins. The thresholds and acknowledgement rules are
unchanged: one day of ledger lag, `stale_budget_days` 4 and 9, and `review_by` expiry.
Other freshness gates in `seo-check.yml`, such as the app release ledger and
prior-art, are untouched. `autopilot-act.yml` still runs the full ledger check before
it writes.

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
