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

**This extension was proposed on 2026-10-19 as a draft PR and approved by the owner
on 2026-10-26 (multiple choice), who delegated the merge to Claude.** It applies the 2026-10-17 principle to two more freshness gates:
the autopilot run ledger and waiting progress. The reason for the
proposal is the 2026-10-17 to 10-19 deadlock. The broken Mac observer made the routine
ledger stale, so the daily Act sync stopped and the autopilot run ledger became stale
too. The hand-synced revenue mirror passed its four-day budget at the same time. From
then on every site PR failed both freshness gates for reasons it did not cause.

**The 2026-10-19 extension did not remove every clock-driven gate on every PR.** The
site job step `Autopilot page vs ledger` compared `/autopilot/` with an autonomy score
whose 28-day window ends today (`windowOf()` in `autonomy-score.mjs`). The daily Act run
regenerates that page. When the daily pipeline stops, the clock alone makes the page
disagree with the score. Measured on 2026-10-24 with a Node clock shift: it passed at
2026-10-25 and failed at 2026-10-26 (total 47.5 vs 45.4, `ra` 4.0 vs 2.5, `ep` 8.7 vs
8.1), about one day after the run ledger freshness gate.

## Status of the 2026-10-27 autopilot page extension

**Proposed on 2026-10-27 in a draft PR after the owner chose, on 2026-10-26, to
propose it separately. It is in force only on a main that contains it, and the owner's
decision to merge that PR is its approval.** The comparison is not dropped: every PR
still compares the page with the ledgers. What changes is the date the autonomy score
is computed for.

- Every PR runs `check-autopilot-page --as-stamped`. It reads the date the page says
  its numbers were computed for (`<span data-decision-date>`, written by
  `decision-monitor --publish-report`) and recomputes the score as of that date. All
  other numbers on the page (automation rates, task counts, Lane B, streaks, code
  authorship, failure stages) do not read the clock and are compared exactly as
  before. Without new ledger rows the result does not move with the clock: a Node
  clock shift of +1, +2, +5 and +30 days on 2026-10-27 kept `--as-stamped` passing,
  while `--check` failed from +2 days.
- A page that shows a score but no stamp, stamps that disagree, a stamp that is not
  a date, or a future stamp fails `--as-stamped`.
- Only `autopilot/index.html` may carry the score or a stamp. The checker's other
  compared files (the homepage `index.html` and the two delivered PR texts
  `docs/pr-autopilot-2026-09-body.md` and `-final.md`) fail in every mode if they show
  a score row, a score total or a stamp. Every number they do show reads no clock and
  is compared on every PR (the two delivered texts are frozen with `numbers-frozen`,
  so their drift is printed, not failed, as before).
- `--check` (the score as of today) is a publication gate only for a PR that changes
  routine operations (the daily Act PR regenerates the page), `autopilot/index.html`,
  the checker, the score module, or the publisher that writes the stamp
  (`AUTOPILOT_PAGE_PATHS` in `scripts/lib/routine-ci-scope.mjs`).
- **The homepage and the two delivered PR texts are deliberately outside that list.**
  They carry no clock-driven number, so a freshness gate on them would check nothing
  about them. It would only block every homepage PR whenever `/autopilot/` is stale,
  which is the 2026-10-17 to 10-19 pattern this proposal removes. Since 2026-09-27
  about 30 main commits touched `index.html`. If the owner wants homepage PRs to stay
  freshness-gated, adding `index.html` to the list is the whole change.
- A change to a score input that is not an operational path (for example
  `data/decision-recovery.json`, `data/value-contracts.json`,
  `data/check-selftests.json` or `data/autonomy-score-history.json`) fails
  `--as-stamped` only if it changes the score at the stamped date. A change that only
  affects later dates, such as a recovery incident detected after the stamp, leaves
  the page stale but correct as of its stamp. Such a PR passes and does not run
  `--check`; the staleness is seen by `--check` in an in-scope PR and in
  `routine-health`, and the next daily Act run regenerates the page.
- Main push and Main Daily Validation run `--check` in the independent `routine-health`
  job, which stays failed while the page is stale.
- Which date the score is computed for, and where stamp problems go, is decided in
  `checkPages()` and fixed by its selftests. `scripts/routine-ci-scope.test.mjs` also
  runs the real CLI on a temporary copy with a fixture run ledger: a page written by
  the publisher three days before today passes `--as-stamped` at clock shifts of 0, 1,
  2, 5 and 30 days and fails `--check`, and a page with today's numbers but a missing,
  garbled, future or conflicting stamp fails `--as-stamped`.
- `CLAUDE.md` (section `/autopilot/ の自律スコアは日付で動く`, 2026-09-19) describes the
  behaviour before this proposal: every PR failing when the page is one day old, and a
  checker that ignores `data-decision-date`. On a main that contains this proposal, PRs
  compare the score at the stamped date, and only operational or page PRs and
  `routine-health` check that the page is today's value.

| Context | Required checks | Meaning of an observation failure |
| --- | --- | --- |
| Every PR | All existing site checks; all routine observer selftests; CI scope regression tests; `autopilot-runs --selftest` and `--integrity` (ledger shape, cost-ledger readability, status JSON agreement); `check-waiting-progress --selftest` and `--integrity` (waiting configuration such as a missing `stale_budget_days`, and readable counters); `check-autopilot-page --selftest` and `--as-stamped` (every page number against the ledgers, the score at the page's stamped date) | A failing mandatory check still blocks publication |
| PR changing routine operations | Both actual Claude and Codex ledger checks, and the full `autopilot-runs --check` (one-day ledger freshness), in addition to the above | Blocks this operational change |
| PR changing waiting-progress inputs (including any deletion under `growth/data/gsc/`) | The full `check-waiting-progress --check` (unacknowledged or expired stalls), in addition to the above | Blocks this change to the waiting inputs |
| PR changing routine operations, `autopilot/index.html`, `check-autopilot-page.mjs`, `autonomy-score.mjs` or `decision-monitor.mjs` (2026-10-27 proposal; not the homepage) | The full `check-autopilot-page --check` (page equals today's score), in addition to the above | Blocks this change until the page is regenerated |
| PR changing neither | No live-health or ledger-freshness publication requirement; the page is still compared at its stamped date (`--as-stamped`); the summary explicitly says observation health, ledger freshness and page freshness were not assessed | Does not claim the routines are healthy, the ledgers are fresh or the page is today's value |
| Main push and existing Main Daily Validation schedule/manual run | Independent `routine-health` job runs all actual checks (Claude, Codex, autopilot run ledger, waiting progress, and with the 2026-10-27 proposal the autopilot page `--check`), even when site checks fail | Job and workflow stay failed; site checks still run independently |

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
prior-art, are untouched. The 2026-10-19 extension also left `Autopilot page vs
ledger` untouched; the 2026-10-27 section above changes it.
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
the actual observation commands and the full freshness checks
(`autopilot-runs --check`, `check-waiting-progress --check`, and with the 2026-10-27
proposal `check-autopilot-page --check`) as conditional, not executed locally. It
runs the `--integrity` forms and `check-autopilot-page --as-stamped`. To check
ledger or page freshness locally, run those three commands directly. A local
preflight pass is not a substitute for the PR's scope decision and required CI
checks. Neither CI path reads private Codex stores: actual health checks only
validate the committed public ledger. They do not collect or refresh evidence.
