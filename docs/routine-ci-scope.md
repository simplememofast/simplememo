# Routine observation and site publication checks

The routine observation ledger describes SimpleMemo's scheduled article operations.
Its health is not evidence that a separate site change works. Conversely, an old
snapshot does not establish that a site change is defective. This separation was
approved by the owner on 2026-10-17. The observation schema, three-day age limits,
historical failures, and source-access restrictions remain unchanged.

| Context | Required checks | Meaning of an observation failure |
| --- | --- | --- |
| Every PR | All existing site checks; all routine observer selftests; CI scope regression tests | A failing mandatory check still blocks publication |
| PR changing routine operations | Both actual Claude and Codex ledger checks, in addition to the above | Blocks this operational change |
| PR changing only site assets or CI routing | No live-health publication requirement; summary explicitly says observation health was not assessed | Does not claim the routines are healthy |
| Main push and existing Main Daily Validation schedule/manual run | Independent `routine-health` job runs both actual checks, even when site checks fail | Job and workflow stay failed; site checks still run independently |

Operational paths are explicitly enumerated in `scripts/lib/routine-ci-scope.mjs`:
the routine/run/action/cost/stop ledgers; observation producers and consumers;
native preflight/recovery code; operational workflows; and their operating
instructions. Additions, edits, deletions and moves are covered. A PR compares its
actual head against its merge base with the event's base SHA, not against the
checked-out synthetic merge commit. Git's complete NUL-separated path inventory
avoids API file-list limits. Missing identity or failed comparison fails the site
job instead of classifying it as unrelated.

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
both actual observation commands as conditional, not executed locally. A local
preflight pass is not a substitute for the PR's scope decision and required CI
checks. Neither CI path reads private Codex stores: actual health checks only
validate the committed public ledger. They do not collect or refresh evidence.
