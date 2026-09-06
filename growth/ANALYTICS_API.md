# SimpleMemo Analytics API retrieval

This is the on-demand path from a local Codex task to BigQuery, using the existing
`GCP_SERVICE_ACCOUNT_JSON` secret in GitHub Actions. No Google key is copied to
the Mac. The workflow does not modify datasets, IAM, the site or repository data.
It has no schedule and does not replace the existing SEO Daily workflow.

## Available reports

| report | Result | Window |
|---|---|---|
| `preflight` | GSC/GA4 dataset region, retention, tables, first/latest daily schemas | No dates, no SQL scan |
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
The cohort must start on/after 2026-09-06 and the end must be at least five JST
calendar days ago. Every daily table through the following day must exist.
The first complete export day can move the real cohort start later.
Missing tables and access-denied responses are diagnostic outcomes, never zero
traffic. Metadata presence does not prove collection completeness.

The funnel counts observed session starts, not modeled GA4 UI sessions.
It does not filter standard events by the CTA-only measurement version.
It counts `app_store_click` for app ID `6758438948`, without adding the mirrored
`seo_cta_click`. Unknown channels and nonproduction remain QA rows.
Do not interpret this click rate as installation rate, revenue or LTV.

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
