# SimpleMemo Analytics API retrieval

This is the on-demand path from a local Codex task to BigQuery, using the existing
`GCP_SERVICE_ACCOUNT_JSON` secret in GitHub Actions. No Google key is copied to
the Mac. The workflow does not modify datasets, IAM, the site or repository data.
It has no schedule and does not replace the existing SEO Daily workflow.
The daily `ga4-funnel` collection is a separate scheduled workflow; see
[Scheduled acquisition collection](#scheduled-acquisition-collection-acquisition-dailyyml).

## Available reports

| report | Result | Window |
|---|---|---|
| `preflight` | GSC/GA4 dataset region, retention, tables, first/latest daily schemas | No dates, no SQL scan |
| `scheduler-inventory` | Existing Cloud Scheduler jobs and BigQuery transfer configurations across their listed locations | No dates, metadata GETs only, no SQL scan |
| `ga4-provisional` | Provisional collection-quality event counts; no funnel or outcome rates | Up to 7 closed JST dates from 2026-09-05; all requested daily tables must exist |
| `gsc` | WEB dates, countries, devices, queries, anonymous impressions; separate URL dates/pages | Up to 31 days, PT, end at least 3 days ago; history starts 2026-08-10 |
| `ga4-quality` | Host, missing identifiers/channel, consent, CTA version/target/dimensions | Up to 31 days, JST; see GA4 conditions below |
| `ga4-funnel` | Quality report plus observed LP/session→own App Store click within 24 hours, grouped by session source/medium and landing referrer host | Same GA4 conditions |
| `ga4-journey` | Quality report plus existing Next step card use and referrer-bearing page arrivals, by internal route | Same GA4 conditions |

`execution=dry-run` validates against real tables and returns estimates.
`execution=export` first dry-runs each SELECT, then executes it with a 1 GB
`maximumBytesBilled` ceiling. At most two SELECTs run, with a 2 GB cumulative
ceiling for their actual billed bytes. This does not cap storage, export costs,
or the monthly bill. See [Google's query API fields](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query).

GA4: property `524656334`, stream `13605182969`, dataset
`yurika-simplememo.analytics_524656334`, Tokyo `asia-northeast1`.
For `ga4-quality`, `ga4-funnel`, and `ga4-journey`, the cohort must start on/after 2026-09-06 and the end must be at least five JST
calendar days ago. Every daily table through the following day must exist.
The first complete export day can move the real cohort start later.
Missing tables and access-denied responses are diagnostic outcomes, never zero
traffic. Metadata presence does not prove collection completeness.

### Provisional collection diagnostics

Use `report=ga4-provisional` to inspect available daily exports before they are
mature. It runs the same fixed quality SELECT for the requested dates only,
without scanning or requiring the following day. The end date must be earlier
than today in JST; the window is at most seven days and starts no earlier than
the partial link day, 2026-09-05. Intraday tables are excluded. Every requested
daily table must exist: missing days stop SQL execution and remain missing,
not zero-filled or silently omitted. To inspect just one available day, request
that day explicitly rather than a larger incomplete window.

Results carry `provisional=true`, `eligible_for_outcome_evaluation=false`, and
`partial_link_day_included`. Successful statuses are `provisional_complete` or
`provisional_dry_run_complete`, meaning retrieval/validation completed only.
Error and missing-table outcomes keep the same provisional labels. The output
contains event counts and quality flags by export event date, hostname scope,
and event name. It does not compute sessions, CVR, installs, purchases, or LTV.
Production hostname scope alone does not remove staff, QA, or automated visits.
Quality counters can overlap; do not add them into a count of distinct failures.

The 2026-09-05 export covers a partial link day and includes measurement changes.
Later daily tables can also receive late events. Keep the observed timestamp,
source SHA and SQL parameters with every snapshot; neither table presence nor
an empty result proves a complete day or zero demand. Do not compare these
diagnostics with mature cohorts or use them to score experiments. GA4 UI session
counts and this exported event report have different definitions and processing
timelines. [Google's data freshness documentation](https://support.google.com/analytics/answer/11198161?hl=en)
explains why recent values can change.

This uses the existing service account, recipient key, encrypted artifact,
SELECT dry run, and cost caps. It does not grant new access, enable streaming,
schedule jobs, or change the mature reports' five-day/following-day requirements.

### Mature funnel reports

The funnel counts observed session starts, not modeled GA4 UI sessions.
It does not filter standard events by the CTA-only measurement version.
It counts `app_store_click` for app ID `6758438948`, without adding the mirrored
`seo_cta_click`. Unknown channels and nonproduction remain QA rows.
Do not interpret this click rate as installation rate, revenue or LTV.

### OneLink pilot intent

The collector supports opt-in OneLink short links using `web_to_app_click` and
`web_to_app_impression`, with `link_route=onelink`, `bridge_scope=qa|pilot` and
`measurement_version=2026-09-07`. Existing direct Apple events retain version
`2026-09-05`; their names, dimensions, mirrored click and rate definitions stay
unchanged. Neither event proves a Store arrival or app installation.

An opted-in anchor needs `data-app-route="onelink"`,
`data-app-traffic="qa"` or `"pilot"`, and the existing CTA placement/cluster/variant
attributes. Only HTTPS short URLs on `simplememofast.onelink.me`, template `it5q`,
with an eight-character alphanumeric link ID are accepted. Long parameter URLs,
other templates, credentials and custom ports are rejected. The recorded
`link_url` keeps the clicked origin/path and omits query/fragment; it is never
replaced with a supposed Apple destination. The known routing QA link stays QA
even if its markup mistakenly says pilot. Other QA links must be labeled QA.

`ga4-quality` checks the new version, target, scope and CTA dimensions separately;
OneLink events do not require Apple's `ct`. `ga4-funnel` adds:

- `sessions_with_onelink_impression`, `sessions_with_onelink_click_24h`, and
  `onelink_clicked_without_recorded_impression`: opt-in pilot route observations.
- `sessions_with_onelink_qa_click_24h`: QA observations, excluded from pilot and
  combined-route counts, including a mislabeled known QA URL.
- `sessions_with_both_app_routes_24h`: intersection of direct and pilot clicks.
- `sessions_with_any_app_route_click_24h`: their distinct session union. Do not
  add the two route counts; a person may use both in the same session.

These use the existing observed session-start cohort, exact production host,
session identifier and strictly less than 24-hour guards. OneLink adds no new
rate and does not change session attribution to SEO. Impressions and clicks
are same-session observations, not a match to one specific rendered CTA or proof
of chronological causation. Read the quality output first. Version parameters
for direct events and OneLink are recorded separately in each query artifact.

The collector does not generate links, load AppsFlyer scripts, forward IDs or
change navigation. Switching a site anchor requires an explicit HTML change. Existing
Apple hrefs continue working even with opt-in attributes, including a fallback.
Impression monitoring covers anchors present when the tracker starts; later
inserted anchors get delegated clicks only. URL replacement before first
visibility is revalidated; changes after an element's first impression do not
start a new exposure. Do not apply an asynchronous link rewriter without a new
exposure lifecycle design and tests.

Start the pilot only after its non-QA link, privacy disclosure and Apple
campaign-series change are verified. On 2026-10-14 the owner waived the
physical device redirect/first-launch receipt: attribution is judged from
production data and remains unverified at device level. Annotate the
activation date/placement. Before activation, absent OneLink events
or zero SQL columns are not measured zero demand. Synthetic tests cover these
new fields; live BigQuery validation and the same mature-day conditions remain
required. GA4's [custom event setup](https://developers.google.com/analytics/devguides/collection/ga4/events)
and [BigQuery aggregate definitions](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/aggregate_functions#countif)
are the underlying collection and counting references.

The first placement, saved link parameters, pre-release evidence, existing
experiment conflicts and rollback are specified in [the pilot handoff](ONELINK_PILOT.md).

### Comparing referral channels

`session_source` and `session_medium` come only from
`session_traffic_source_last_click.cross_channel_campaign`. They describe the
export's session attribution, not the user's first acquisition. A source/medium
pair is kept together across events: `session_attribution_status` is `available`,
`partial`, `missing`, or `conflicting`. Conflicting pairs output null source and
medium instead of choosing an arbitrary winner. Missing values are not relabeled
as direct traffic, and no manual-UTM or first-user fallback is substituted.
[Google's export schema](https://support.google.com/analytics/answer/7029846?hl=en)
documents these session fields.

`landing_referrer_host` is a separate observation from the first page view in the
session, using the same timestamp/batch ordering as the landing path. Later
internal navigation cannot replace it. Only the lower-case host of an HTTP(S)
referrer is returned; its path, query and fragment are not exported. The status
distinguishes `external`, `internal`, `missing`, `invalid`, and
`missing_landing_page`. Missing referrers do not prove a direct visit: browsers,
apps, redirects and privacy settings can omit them. A referrer host is not an
attribution override or proof that a particular post generated a visit.

Use production rows with the quality review to compare observed visits and
own-app clicks by source. Keep incomplete/conflicting attribution visible rather
than allocating it to a published-profile list. A listed medium with no observed
row has no measured contribution in this report, not a proven zero audience.
When combining the finer groups, sum session/click counts and recompute rates;
do not average row-level rates or compare a few new export days with an older
28-day GA4 UI baseline. The existing export start, following-day coverage,
five-day waiting period and encrypted storage requirements still apply.

### Reading internal journeys

`ga4-journey` attaches `ga4-quality.sql` before `ga4-journey.sql` and uses the
same reader, encryption, date coverage and two-query cost guards. It reads only
existing `next_step_click`, `next_step_impression`, `page_view` and
`session_start` events. It does not change browser collection or join customers
across systems. The SQL is prepared and tested with fixtures; actual GA4
permissions, schema and data still require the first eligible live run.

The two `route_kind` values answer different questions:

- `card`: `from_path` is the observed page location and `to_path` is the card's
  `to` parameter. `stage`, `version_status` (relative to the requested measurement
  version), and `card_page_path_status` retain missing/other/conflicting signals.
- `referrer_arrival`: `from_path` is the internal `page_referrer` path and
  `to_path` is the arriving page. This is a referrer-bearing arrival, not proof
  of a particular link click. Reloads, back navigation and tabs may repeat or
  preserve referrers. No click-to-arrival matching or channel reassignment occurs.

`date_basis=event_day` counts raw events whose timestamps fall in the inclusive
JST window. Repeated clicks remain repeated events. `events_without_session_key`
and `events_outside_started_cohort_24h` expose data that cannot enter the bounded
session cohort; these columns overlap and must not be added as distinct failures.

`date_basis=session_start_day_24h` counts identifiable route sessions with a
recorded `session_start` in the requested JST window and route events at or after
that start, strictly before 24 hours later. It includes the next day's events
when necessary. A session is counted once per route/dimension group, so these
counts **cannot be summed across routes or quality groups** into total sessions.
There is no all-site session or exposed-page denominator in this report.
The raw-event and cohort columns use null for the other basis, not invented zeros.

Card cohorts show sessions with clicks, impressions, clicks without recorded
impressions, first clicks before the first recorded impression, and first clicks
tied in timestamp with that impression. Ties have unresolved order. These are
session/route observations, not per-card-view CTRs or proof that one tab's
impression caused another tab's click. No CTR or drop-off rate is calculated.
Standard page views do not require the custom card parameters.

Use `row_scope=production_internal` for internal-route analysis, retaining
`quality_or_context` rows for missing/external/invalid referrers, preview hosts,
unusual paths, unsupported card targets and missing/other card dimensions.
External/missing referrers are context, not automatic tracking failures. Missing
session keys also remain visible on production rows. Only exact production
hosts (`simplememofast.com`, `www.simplememofast.com`) and site-shaped paths up
to 250 characters are exposed. Paths preserve case and trailing slashes; query
strings and fragments are removed, unusual/encoded paths become null, and no
raw external URLs, user IDs or session IDs leave the query. Do not canonicalize
away route differences or treat absent rows as demonstrated zero demand.

For the existing Next step and Obsidian experiments, retain their original
evaluation dates and baselines. An untracked pre-implementation zero cannot be
used as a growth-rate denominator. A few initial export days cannot establish
the largest drop-off or isolate effects of concurrent internal-link changes.

## Run from the local task

All outputs must be outside Git checkouts. The example uses a private directory;
the recipient private key is solely for decrypting reports, not for Google auth.

```sh
node growth/scripts/analytics-artifact.mjs init-key "$HOME/.local/share/simplememo-analytics/keys"
```

This creates `recipient-private.pem` and `recipient-public.pem` with mode 0600
and refuses to replace them. Keep the private key locally. It will not be sent
to GitHub. Reuse the public key for future runs.

Prepare dispatch inputs as JSON using a structured writer, e.g. Python's
`json.dump`. `recipient_public_key_base64` is base64 of the **public PEM file**.
Give `request_tag` a new UUID, and set `report`, `execution`, `start_date`,
`end_date`. For `preflight` omit the dates. Do not put SQL or Google credentials
in these inputs. Then dispatch reviewed code on main:

```sh
gh workflow run analytics-read.yml --repo simplememofast/simplememo --ref main --json < /private/path/request.json
gh run list --repo simplememofast/simplememo --workflow analytics-read.yml --json databaseId,displayTitle,status,conclusion
```

Match **Analytics API REQUEST_TAG** to retrieve the correct run ID. The workflow
accepts only main and fixed report names. It prints status without analytics rows
or API error details. If a run fails, still retrieve the encrypted diagnostic:

```sh
gh run download RUN_ID --repo simplememofast/simplememo --name analytics-RUN_ID --dir /private/path/run-RUN_ID
node growth/scripts/analytics-artifact.mjs decrypt /private/path/run-RUN_ID/analytics.enc.json /private/path/recipient-private.pem /private/path/result-RUN_ID.json
```

Only `analytics.enc.json` is uploaded, retained for seven days. The report is
AES-256-GCM authenticated ciphertext, with a random per-report key wrapped using
RSA-OAEP-SHA256 to the recipient's public key. No plaintext report is written on
the runner. Decryption rejects a wrong key or modified ciphertext, and the local
helper refuses destinations inside Git checkouts or existing output files.

## Scheduled acquisition collection (acquisition-daily.yml)

Owner-approved on 2026-10-15 to replace a local daily automation that never ran
on schedule. `.github/workflows/acquisition-daily.yml` runs at 06:23 JST
(nominal; daily cron is delivered hours late) and on manual dispatch
(`mode: dry-run` by default: GA4 validates without billed bytes, AppsFlyer is
not called). It does not change `analytics-read.yml`, which keeps no schedule.
Every action in the workflow is pinned by commit SHA.

- **Gate** (no secrets): `growth/scripts/acquisition-gate.mjs` reads
  `data/emergency-stop.json` (global stop and route `acquisition`; a missing
  route fails the run), computes windows with `collectionWindow` (GA4 7 days
  ending five JST days ago; AppsFlyer 28 days ending yesterday JST) and skips
  an end-date whose artifact already exists. There is no AI-budget admission:
  the workflow calls no model.
- **GA4**: the same `export-analytics.mjs` fixed report and caps, with
  `GCP_SERVICE_ACCOUNT_JSON` only in that step, on `main` and the first run
  attempt only (no remote retry). `ANALYTICS_PAD_BUCKET` pads the plaintext to
  2 MiB buckets; unset (as in `analytics-read.yml`) nothing changes. Artifact
  `acquisition-ga4-funnel-<end>`.
- **AppsFlyer**: the token is `APPSFLYER_AGGREGATE_API_TOKEN`, a secret of the
  `acquisition-appsflyer` environment that only the owner registers; never a
  repository secret. GitHub documents only per-workflow scrubbing for
  repository secrets, so one could reach the gate and GA4 jobs (unpinned
  `main` code); environment secrets reach only jobs that reference the
  environment, and only the `appsflyer` job does (`deployment: false`). The
  environment admits the `main` branch only, and the job reads that policy
  back and fails before the token step if it is anything else. Until the
  secret exists the job rests as `key_pending` and succeeds.
  `growth/vendor/appsflyer_aggregate.py` is a byte-identical copy of the
  reviewed `simplememo-api` reader. Its sha256, the seal script's and
  `analytics-envelope.mjs`'s are written in the workflow and checked with
  `sha256sum -c` before the token exists. The secret is written to the
  reader's 0600 file in its own step, the reader runs with `python3 -I` and
  its stdout goes to a private file, the token file is removed right after the
  read, and only then does `seal-acquisition-appsflyer.mjs` pack the reader's
  own `result.json` and CSV with provenance
  (`credential_origin: github_actions_secret`), padded to 64 KiB buckets.
  Artifact `acquisition-appsflyer-<end>`.
- **What the pins do and do not do**: any change to code that runs next to the
  token also changes this workflow file. They do not stop the change. The
  unattended primary path (`GH_PAT`, `GITHUB_TOKEN`) cannot push workflows, but
  secondary CCR sessions (unattended) and attended sessions can change the
  workflow, its pins and the reader in one PR, which auto-merges once SEO
  Validation passes. AI-authored, auto-merged code can therefore run next to
  the token.
- Both artifacts contain only an envelope for the existing recipient
  (`vars.ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64`), whose SPKI fingerprint is
  pinned in the workflow and the seal script. Retention is 14 days. Logs and
  job summaries carry status words only, never counts, rates or rows.
- **Stop** with `data/emergency-stop.json` agents `acquisition`, not GitHub's
  "Disable workflow": the workflow is in `scripts/lib/cron-silence.mjs`, so
  disabling it breaks cron-health's silence check.

Ingest locally, on demand, with `node scripts/company-os.mjs acquisition-ingest`
(also the first step of `collect`). A local private key that is unreadable or
does not match the pinned recipient admits and records nothing (the next
ingest retries). It reads every main run inside the retention window page by
page, takes the job inventory from the first attempt (credentialed jobs never
run on a re-run), verifies run identity, exact artifact names, the recipient,
window, run ID, attempt and commit, the CSV hash and the reader hash (pinned
and equal to `simplememo-api` `origin/main`), and writes the existing receipt
shapes without overwriting any existing receipt. Failed remote runs are
recorded once; nothing is dispatched or retried. Integrity verdicts,
`pins_mismatch`, `environment_unverified` and a repository-level copy of the token (names-only
secret listing) set the ingest status to `alert` (run verdicts on manual runs
too). So does a scheduled run that left a source without data
(`scheduled_collection_lost`, with run ID, source and verdict):
`job_failed_without_artifact`,
`artifact_missing`, `artifact_expired` (unless that run's own receipt exists),
`gate_<conclusion>` when the gate did not succeed, and for GA4 a failed receipt:
`admitted_failed` (the run sealed a query error, a blocked or an incomplete
result) or `existing_receipt_failed` (a failed receipt for that end-date already
existed and was kept). A failed GA4 receipt is final: `collect --analytics`
returns it and never dispatches the legacy fallback for that end-date. A sealed
AppsFlyer failure (`admitted_failed`, `actions_reader_failed`) does not alert:
the local reader returns an existing receipt only when it is verified, has used
three attempts or failed on `permission_or_credential`, so a `collect` on the
same JST day (the window follows the JST date) reads that end-date again over
the Actions failure receipt (attempts 1), with at most the two attempts left. If
that local read fails too, it shows as a failed AppsFlyer receipt in that
`collect` (status `partial`), not in health; and with no `collect` that day the
end-date is not read again. Health therefore does not tell whether the Actions
AppsFlyer read itself works (the run records do). A loss clears when a later
scheduled run delivers that source: admitted, or already admitted / an existing
receipt retained whose receipt is verified (`key_pending` for AppsFlyer). A
failed or still pending receipt (a legacy GA4 dispatch in flight), a stopped
run and a manual export do not clear it. It also disappears
without any delivery once the lost run leaves the run listing (retention plus
one day, 15 days), so an emergency stop longer than that hides an old loss.
While a finished run is re-run it is listed as in progress, and its loss (or a
delivery that cleared an older one) is evaluated again when the re-run
completes. Manual runs, dry runs and a gate that decided not to collect (stop,
end-date already collected) never raise `scheduled_collection_lost`. No
scheduled run created within the cron-silence limit for this workflow
(`scripts/lib/cron-silence.mjs`, 1680 minutes, counted from the newest scheduled
run GitHub created) sets `scheduled_run_silent` until the next one appears;
look at the workflow's own run list and state (disabled, no run created, a late
start), because Cron Health opens issues only from its daily 07:00 JST run or a
manual dispatch and fails instead of
reporting a disabled workflow. These alerts change no guard input, fallback,
dispatch, receipt or run record. They do change two statuses: the ingest status
reads `alert`, and the collection-level `status` of `collect` /
`acquisition-ingest` (printed, and written to `latest-collection.json` and
`collection-events/<uuid>.json`, and recorded as the command observation's
`result_status`) reads `partial` while an alert is open, as it already did for
integrity alerts. Nothing in this repository retries, dispatches or exits
differently on either status (the readers of `collection-events` use the
AppsFlyer receipt inside each event, not this status). If the reviewed reader
changes in `simplememo-api`, AppsFlyer ingest stops with `reader_divergence`
until a reviewed PR re-vendors the file and updates its pin in the workflow
and `growth/lib/acquisition-handoff.mjs` together.
`company-os collect --analytics` never dispatches `analytics-read.yml` for a
`ga4-funnel` end-date with an Actions artifact or receipt, while the
`acquisition` route is stopped, while a run is active, before today's
scheduled run has finished (until 18:00 JST), or when that state cannot be
read. While the environment secret is registered, the local AppsFlyer reader
in `collect` likewise waits for today's scheduled run (until 18:00 JST), an
active run or an artifact awaiting admission; with `key_pending`, or after an
Actions failure receipt, it reads as before.

Ingest within 8 days keeps the latest GA4 observation admissible for the CTA
measurement; artifacts expire after 14 days. AppsFlyer aggregate rows
(date/agency/media source/campaign) transit a GitHub-hosted runner for the
length of one job: in memory and, because the reader writes its CSV to disk,
in a 0700 runner temp directory that the job removes. GA4 aggregates already
transit runners in memory. Artifact sizes are public in this repository, so
both plaintexts are padded to fixed buckets and the envelope size moves only
when the content crosses a bucket. AppsFlyer-side processing (same API,
report, token) is unchanged.

## Evidence and interpretation

Each decrypted report contains the workflow run/source SHA, collection time,
credential type (not the key), region/retention, actual SQL SHA-256 and parameters,
job IDs, processed/billed bytes, cache use, coverage and aggregate results.
The source SQL is under `growth/sql/analytics/` and has no user identifiers in its
output. Query strings and low-count groups can still be sensitive; keep the
decrypted reports private.

For GSC, missing date rows produce `incomplete_date_coverage`: zero demand and
missing exports cannot be distinguished by an absent row alone. Do not pool the
site and URL denominators. AI Overview/AI Mode-specific UI values are not supplied
by this WEB export and must not be manufactured from user-agent strings.

For GA4, inspect `ga4-quality` before assigning value to a funnel rate, including
unknown session channels, missing IDs, old CTA versions, competitors, and
nonproduction. A `complete` retrieval means the query returned data with required
daily tables present; it is not approval of the measurement or an LTV finding.

GA4 export connection and dataset reading are separate permissions. Reuse the
existing key and inspect the specific 403 before considering any IAM change.
The fixed SQL has no DML/DDL and the workflow has only `contents: read`; actual
BigQuery authority remains that of the existing service account, unchanged here.

Validation: `node growth/lib/bigquery.test.mjs` and
`node --test growth/lib/analytics-export.test.mjs`. Network mocks verify cost
guards, paging, missing dates, permission failures and encryption. A live run
is still required to establish current BigQuery permissions and actual schema.

The funnel's SQL behavior is also checked with synthetic extracted events:

```sh
python3 -m venv /tmp/simplememo-sql-tests
/tmp/simplememo-sql-tests/bin/python -m pip install -r growth/tests/requirements-sql.txt
/tmp/simplememo-sql-tests/bin/python growth/tests/ga4-funnel-sql.test.py
/tmp/simplememo-sql-tests/bin/python growth/tests/ga4-journey-sql.test.py
```

This runs the checked-in aggregation after SQLGlot translation to DuckDB, with
the warehouse scan replaced by fixtures and an equivalent first non-null array
aggregate adapter. It covers source/medium conflicts, partial/missing values,
referrer privacy and ordering, denominator conservation, duplicate/mirrored
clicks, nonproduction and the 24-hour boundary. The source-field projection is
tested separately against nested synthetic attribution data. These tests do not
validate BigQuery's actual export schema, collection completeness or permissions;
the first eligible live dry run remains required. Dependencies are test-only.
The journey fixtures additionally cover repeated clicks, missing session starts
and keys, different sessions/users, JST/24-hour boundaries, impression order,
query/fragment removal, host spoofing, invalid targets, referrer context and
non-additive route-session counts. Both suites execute the checked-in SQL.

## Fixed search-intent diagnosis

`report=gsc-intent` uses the same Pacific date, 31-day, three-day lag and cost guards as `gsc`. It returns the existing full URL/date aggregate plus daily page/query aggregates for `/vs/logseq/`, `/obsidian/compare/logseq/`, and `/vs/capacities/` only. No arbitrary SQL or URL input is accepted.

Keep anonymous and missing query buckets in reconciliation; do not interpret them as known keywords. Reconcile clicks, impressions and position sums to the matching URL totals before comparing periods. Coverage comes from the full URL export, not the low-volume target pages. Missing target rows alone do not prove zero traffic. Page impressions are not the site denominator, and this report does not attribute installs or LTV to search.

### Existing GCP schedule inventory

Use the same reviewed-main workflow, recipient key and UUID receipt with
`report: scheduler-inventory`, `execution: export`, and no dates. The reader
uses the existing credential's IAM grants. Cloud Scheduler requests its
`cloud-scheduler` OAuth scope; BigQuery Data Transfer requires `cloud-platform`.
These token requests do not grant IAM roles. The existing BigQuery client's
default scope is unchanged. Every resource request is a fixed-project metadata
GET; redirects, job execution, API enablement and IAM writes are excluded.
Pagination, retries, location/request/time bounds and per-service failures are
recorded. A partial, denied or disabled service is never treated as empty.

Decrypt privately as usual, then copy the verified report (including source SHA
and run ID) to `~/.config/simplememo/company-os/discovery/gcp-schedules.json`
with mode 0600 and run `python3 scripts/company-inventory.py`. Keep prior receipts.
This is an on-demand discovery extension to the existing workflow, not another
scheduled task. Refresh when inventory becomes stale or ownership changes.

API contracts: [Cloud Scheduler list](https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs/list)
and [BigQuery transfer configurations list](https://docs.cloud.google.com/bigquery/docs/reference/datatransfer/rest/v1/projects.locations.transferConfigs/list).
