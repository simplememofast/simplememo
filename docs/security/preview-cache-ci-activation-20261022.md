# Preview cache CI activation preparation

This is code-side preparation after the owner's explicit authorization of the
limited Access and GitHub Environment setup. A separate operator performs that
setup. This checkout never creates a token, receives its value, writes a secret,
or changes Access/Environment settings. The owner approved introducing the
trusted verifier before the security candidate's checks and normal deployment.
`cache_access_configuration.json` contains only independently reported settings
and a short operational deadline. A real run still requires the protected
Environment's owner approval and all live validation; no authentication result
is implied by this configuration.

## Configuration contract for the operator

| Setting | Required value / operation |
| --- | --- |
| Repository | `simplememofast/simplememo` |
| GitHub Environment | `preview-cache-ci` |
| Deployment branch policy | Selected **branch** `main` only; no tag patterns, PR refs or other branches |
| Required reviewer | `simplememofast`; explicitly review the PR number and full candidate SHA displayed for the run |
| Admin bypass | Disabled |
| Prevent self-review | Disabled for this single-owner operation: the owner dispatches and separately approves the run |
| Environment secret names | `CF_ACCESS_PREVIEW_CLIENT_ID`, `CF_ACCESS_PREVIEW_CLIENT_SECRET` |
| Repository secret fallback | None; do not put these values in repository-wide secrets |
| Access scope | The approved dedicated, seven-day service token is associated with Service Auth for the existing preview app; the actual scope is `*.simplememo-596.pages.dev` |
| Existing policies | Keep the existing email Allow policy and the separate everyone Block for retired admin unchanged |
| Readback | Environment numeric ID, names, branch/reviewer/bypass conditions, UTC observation time, and an independently justified token-expiry lower bound beyond the operational deadline; never credential values |

The disabled self-review restriction does not automatically approve a job. The
owner still performs the Environment approval, with the candidate SHA visible.
The workflow must not approve its own pending deployment or use a bypass.

The client will send credentials only to the one reviewed immutable preview and
needed paths. This does not narrow the token's server-enforced wildcard scope.

### Operator readback received, without credentials

At approximately 08:38 UTC on 2026-10-22, the separate operator reported
Environment `preview-cache-ci`, ID `25004037265`, main only with no tag patterns,
the required owner reviewer, disabled admin bypass, and both named secrets
present. At 08:44:02 UTC, the operator confirmed Prevent self-review is off.
The dedicated 168-hour token and its single-token Service Auth association to
the preview app were reported present; the email Allow and retired-admin Block
were unchanged. These are operator reports, not API or authentication results
from this checkout.

The operator identified this token's absolute expiry display as
`2026-10-29 17:29`, without a timezone. Its exact UTC expiry is **unconfirmed**;
GitHub's displayed timezone cannot establish Cloudflare's. Instead of choosing
a timezone, consider every UTC offset in the conservative range -24 to +24 hours,
wider than civil timezones. Also subtract one minute to cover rounding of the
minute-resolution display:

```text
actual expiry UTC = displayed local expiry - UTC offset
earliest expiry bound = 2026-10-28T17:28:00Z
internal deadline     = 2026-10-23T08:44:02Z
margin                = 128 hours, 43 minutes, 58 seconds
```

The internal deadline is 24 hours after the confirmed UTC readback and precedes
every expiry interpretation in that range. This verifies the required ordering
without claiming an exact token expiry. The committed configuration therefore
uses that short operational deadline, not a guessed expiry timestamp. Each run
is additionally capped at one hour from its own creation. Expiry, a denied
request or a redirect fails without retry; this calculation is not an
authentication test and does not establish that the credentials work.

## Confirmed provider metadata, not credentials

The existing authorized GitHub connector returned matching provider identities
on the candidate's check and two independent previous main successes:

| Role | Commit | Cloudflare check |
| --- | --- | --- |
| Security candidate | `69d7caabb73ba647a1961ef5d6fc8964141c08e1` | `119662420279` |
| Previous main | `b1eb4456a01ea0a5dd8fda84dd27d1ac15896e51` | `119658829319` |
| Older main | `98fe630d4abba7e8045bdbd834d70202f5b6d720` | `119353254222` |

All identify App ID **85455**, slug **`cloudflare-workers-and-pages`**, owned by
the `cloudflare` organization (ID 314135). The dashboard project is `simplememo`;
the preview hostname suffix is `simplememo-596.pages.dev`. These names are not
interchangeable. The exact observed dashboard form is
`https://dash.cloudflare.com/?to=/<account>/pages/view/simplememo/<deployment UUID>`.

Cloudflare emits the immutable Preview URL twice, as an HTML link and its text,
and may emit a separate Branch Preview URL in the same format. The gate now
recognizes this observed format. It validates and excludes the branch-alias row,
never authenticates to it, and requires all remaining preview occurrences to
identify exactly one immutable deployment matching the dashboard UUID. Extra
query data, encoded/Unicode host aliases, misleading link text and conflicting
preview destinations remain failures. Provider identity is independently fixed;
it cannot be selected by an input or learned from the check being validated.

## Recipient code review

At `e1e1337aeb8baafb75079a1660ea340295b3c4b1`, the root middleware, asset middleware,
headers, redirects, generated homepage and asset inventory are unchanged from
`69d7caabb`. Static review found no Access-header-value read, logging, external
request or reflection on the allowed GET/HEAD paths. A local synthetic probe of
the exact committed middleware covered **37 paths and 142 cases**, with zero
Access-value reads, outbound requests, logs or reflections. The script lives in
`/tmp/simplememo-recipient-review.mjs`; no preview was contacted.

This does not establish Cloudflare's actual build settings, deployed bundle,
platform logging or header stripping. `context.next()` forwards the original
request. Review these boundaries against the final candidate before real use;
do not describe the static result as a guarantee about the platform.

## Connecting trusted execution to the existing gate

No workflow has been activated yet. The prepared trusted producer executes only
reviewed `main` code after the Environment review. The existing PR cache job
must independently read and validate its exact-SHA result. The original failed
run stays visible, and a new ordinary attempt or candidate must satisfy the same
response contract. An unrelated green workflow is insufficient.

Read-only Actions run/job/approval metadata is the prepared proof channel. It
avoids artifact downloads and check-write permission. Workflow-run REST data
does not expose dispatch inputs; binding must instead use fixed run/job names,
trusted execution SHA, the exact successful job/step set, candidate SHA, manifest
digest, deployment UUID, first attempt and the matching Environment approval.
Review-history records lack a run ID inside each record, so the trusted adapter
must retain the repository and run ID of the exact API request. These envelopes
are not self-authenticating data; they are valid only when constructed by the
trusted API reader.

The additional workflow permissions are `actions: read` and
`pull-requests: read`, alongside existing read-only repository/check access.
No `actions: write`, `checks: write`,
`deployments: write`, broad PAT or new account grant is proposed. This permission
change and the final workflow wiring remain reviewable preparation, not an
activated grant.

Owner Environment approval tied to the displayed exact run/candidate is the
prepared candidate approval channel. A SHA entered in dispatch by
itself is never approval. This avoids a cycle in which committing a head-specific
approval to `main` forces a new candidate SHA whenever an up-to-date branch is
required. It still requires a trusted main workflow, protected Environment and
verified owner review; the current pure gate cannot establish those settings.

The context adapter binds the operator readback to the Environment's numeric ID;
deleting and recreating an Environment with the same name cannot reuse it. It
reads live branch/reviewer restrictions and the exact run's owner approval,
then issues a short-lived, single-use, process-local capability. Configuration,
dispatch JSON and candidate data cannot manufacture that capability.

For PR 2139, the existing `cache-contract` job now runs the proof consumer from
an immutable, separately resolved main checkout. Its measured Git HEAD must
match the current main SHA before further reads, and main is checked again at
the end. Candidate regression code runs on a separate runner with only contents
read permission. A failure, cancellation or skip there makes `cache-contract`
fail explicitly; the required check is never silently skipped. Production and
other PRs retain their existing public browser response checks. No Access
credential is supplied to the consumer or to any candidate runner.

The consumer checks the latest matching producer run, exact source/candidate
SHAs, all three successful jobs and their required successful steps, Environment
review, manifest digest, immutable deployment ID and expiry. A newer failed or
pending run cannot fall back to an older green one. Missing/incomplete proof
fails. The bounded run history must be complete (at most 100 manual runs); if
that bound is reached, it fails rather than guessing which page is latest.

## Local validation checkpoint

All tests use synthetic API responses and synthetic credentials; HTTP tests use
loopback only. No actual GitHub/Cloudflare authentication was attempted.

| Test group | Cases |
| --- | ---: |
| Data authorization gate | 18 |
| GitHub context and Environment capability | 19 |
| Bounded credential transport | 28 |
| Cache response contract and mutations | 129 |
| Actual local asset/middleware integration | 1 |
| Completed-run proof validator | 43 |
| Current-main proof consumer | 23 |
| Credential-bearing workflow wrapper | 12 |
| Existing cache/navigation/conditional regressions | 26 |
| Candidate/trusted-main workflow wiring | 7 |
| **Total** | **306** |

The integration covers all 33 actual hashed assets (847,987 bytes), 43 requests,
and six conditional GET/HEAD checks. The independent recipient review separately
covered 142 cases; do not count those as additional tests in the table. Local
success does not satisfy the still-failed remote cache run or establish a live
Access response.

The existing admin-retirement, CI-isolation and tools-runtime suites also passed
17/17 with no skips. Their real slide PNG render and loopback server probes
passed; Fontconfig emitted a nonfatal unwritable-cache warning. The three
affected workflow definitions pass actionlint, and whitespace validation passes.
These 323 executed tests are this checkpoint's validation, not a sum with older
reported runs.

## Bootstrap and remaining unknowns

The current `main` advanced to `ca6a3b3b1` through PRs 2135, 2140 and 2142. The
changes concern routine/autopilot operations and leave the cache workflow and
recipient paths unchanged. Bootstrap must use the latest main and preserve those
changes. PR 2136 remains outside this work.

A separate, normal bootstrap PR can contain the trusted workflow and helpers
without changing the current cache paths. Exclude `home-perf-cache.yml` and
`cache_headers_approved.test.mjs` from that bootstrap: they are the candidate's
subsequent integration, and its tests require the updated cache workflow.
Whether a path-skipped cache workflow
blocks that PR depends on the repository's actual required checks. One read-only
attempt each for main protection, rulesets and the old cache-run endpoint
returned `Forbidden`; no retries or alternate-route lookup were made. These
requirements remain unknown, not absent. If bootstrap is blocked by a mandatory
check, report the exact dependency; do not disable it or merge the failed
security candidate to obtain trusted code.

The owner explicitly approved the prerequisite main introduction, then PR 2139's
required checks and normal merge/deployment, at 2026-10-22 08:50:39 UTC. Keep the
Web allocation within 25 USD of the shared 50 USD budget. Reconcile the final
candidate, review the code and proof wiring, pass all applicable checks, and only
then proceed through the normal merge/deploy/readback flow. The bootstrap's main
merge is itself a normal Cloudflare Pages deployment trigger, included in that
approval. The owner must still approve the particular Environment run; neither
the workflow nor an agent may approve it on the owner's behalf or use bypass.
