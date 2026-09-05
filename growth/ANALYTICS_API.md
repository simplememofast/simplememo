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
| `ga4-funnel` | Quality report plus observed LP/session→own App Store click within 24 hours | Same GA4 conditions |

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

## Run from the local task

All outputs must be outside Git checkouts. The example uses a private directory;
the recipient private key is solely for decrypting reports, not for Google auth.

```sh
node growth/scripts/analytics-artifact.mjs init-key /Users/hajimeataka/SEO-AIO-2026-09-05/api-keys
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
