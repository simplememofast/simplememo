# Scoped viewport validation: preparatory change

The exhaustive viewport step currently delays every SEO run, including a
draft-to-ready transition with an unchanged PR head. This change prepares the
selection and evidence checks needed to split that work. It does **not** activate
the split, reuse a previous run, or change publication gates or permissions.

## Implemented here

- A pure viewport plan selector binds a complete Git diff and tree inventories
  to the base, head and actual tested checkout. Narrow HTML edits select the
  important pages plus changed pages. Unknown or shared impact requires the full
  matrix; incomplete evidence cannot become an empty successful selection.
- A pure full-viewport receipt validator rejects mismatched revisions, stale or
  incomplete results, newer pending/failed attempts, inconsistent supplied
  artifact digests and altered receipt text. Downloading the archive, verifying
  its actual bytes and deriving the receipt from that same archive remain the
  future trusted adapter's responsibility. Its result concerns viewport evidence
  only; it is not merge approval or a Cloudflare authentication proof.
- A critical-page DOM probe and result validator require rendered content,
  usable required links, loaded important images, measured HTTP status and
  errors monitored before navigation. Engine identity is part of coverage.
- Offline negative tests run as an additional blocking SEO step. Existing
  exhaustive rendering and all other steps remain in place.

These helpers are not connected to a browser adapter or an Actions evidence
transport yet. Unit fixtures do not establish browser coverage, elapsed-time
improvement or valid reuse of a real run.

## Activation design to review separately

| Existing coverage | Planned location | Conditions retained |
| --- | --- | --- |
| Static SEO, robots/noindex, canonical/hreflang, links, generated files, translation consistency | Predeployment SEO | Existing blocking checks and negative tests |
| Security, identity, dependency and authentication boundaries | Existing workflows | Existing conditions; no new authentication scope |
| Static overflow rules | Predeployment SEO | Every checked file; existing thresholds |
| Important `/`, `/en/`, `/autopilot/` and changed HTML | Predeployment browser gate | Existing 14 widths, Blink and WebKit, complete measurements and critical-page health |
| Shared CSS/JS/fonts, generators, templates, dependencies, unknown impact | Full predeployment matrix | No small-sample inference for global impact |
| All HTML pages and existing deep/sweep matrices | Independent postmerge and daily validation | All current pairs, both engines, missing measurements reported as failures |
| Production HTTP and asset checks | Existing independent readback | Local rendering does not prove production revision or domain assignment |

`ready_for_review` remains an event for fresh short checks. A necessary full
predeployment measurement may be reused only after a trusted evaluator binds
the current head, base and tested tree, checker/dependency/matrix/toolchain
digests, latest run and attempt, bounded freshness, artifact source and actual
artifact bytes. A changed main, incomplete listing or newer failure invalidates
reuse. A missing or invalid receipt requires measurement; it is never a hidden
skip or a successful result. Fresh security and identity checks are not reused.

The critical browser adapter must capture navigation status, final URL, initial
JavaScript errors and failed resources before navigation, then wait within a
bound for fonts and required images. The existing WebKit iframe dimension probe
does not supply these observations. Until that adapter is tested, the new
critical-page validator cannot be used to claim successful browser coverage.

Full rendering will run against an immutable current-main checkout in a
separate workflow. The existing Auto-merge completion callback can initiate
postmerge observation; the existing daily slot at 16:37 UTC can recover missing
coverage without a new cron. An upstream completion is not itself evidence of a
merge or deployment. Same-revision callback/daily duplication must be bounded
and must not be suppressed using an unverified old green run.

`scripts/lib/viewport-health.mjs` must move to the full workflow's exact tested
revision and complete full-matrix receipt. A fast success must never close a
full-coverage recovery action. `scripts/preflight.mjs` and the selftest inventory
must continue to expose the full local check after the workflow split.

## Permission and rollout boundary

Cross-run evidence retrieval needs a narrowly scoped trusted evaluation job
with `actions: read` in addition to `contents: read`. The current SEO job has
only `contents: read`. That addition is not present in this preparatory change
and must be approved before activation. The evaluator must execute immutable
trusted-main code, parse artifacts as data and avoid executing candidate code
with its read token. No new secret, token, write permission, `checks: read`,
branch-protection change or auto-merge redesign is proposed here.

If a new Main Daily resolver job also reads prior-run evidence, review that
job's use of the workflow's existing `actions: read` separately and include it
in the activation permission decision. Existing declarations elsewhere are not
an automatic grant to a new job. Both evaluators must remain separate from
candidate execution.

The rollout requires browser fixture integration, a complete old-to-new coverage
mapping, consumer/preflight regression tests, verified event delivery and
bounded evidence retention before the active split is ready for review. The
existing public repository uses standard `ubuntu-latest` runners; GitHub's
[runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
lists standard hosted runners as free for public repositories. This does not
claim that new artifact retention or unrelated external services are free.
Keep the existing daily cadence and avoid new paid measurement services.

Keep this PR in draft until the implementation and evidence are reviewed. The
preparatory tests alone do not satisfy the activation checklist.
