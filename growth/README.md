# growth/ — the measurement loop, as files

This directory exists because of one failure, and it is worth stating plainly.

On 2026-07-01/02, twelve pages were retitled and frozen with an evaluation date
of 07-29/30 written into a report. The date passed. Six weeks of subsequent
reports each repeated "decide on 7/29" and moved on. Nothing was broken and
nobody was careless — there was simply **no artifact that could be overdue**.
The plan lived in prose, and prose does not raise its hand.

Everything here follows from that: state lives in files, dates are checked by
CI, and decisions require evidence that can be pointed at.

## Layout

```
growth/
  data/gsc/<label>/     committed Search Console snapshots (meta + one JSON per dimension)
  data/appstore/        App Store Connect exports (funnel side; not yet wired)
  input/                drop zone for raw GSC CSVs — see GSC_OWNER_ACTION.md
  experiments/          experiments.json — the ledger
  reports/              generated weekly reports
  lib/                  csv.mjs · bigquery.mjs · snapshot.mjs · gsc.mjs · ledger.mjs
  scripts/              ingest-gsc · ingest-bigquery · bq-preflight · analyze ·
                        experiments · check-experiments · weekly-report
```

No dependencies. The repo has no root `package.json` and no build step, so
every script runs under a bare `node` (v20+, matching CI) — including the
BigQuery client, which is `lib/bigquery.mjs` rather than `@google-cloud/bigquery`
for that reason.

## The loop

```
BigQuery bulk export ──▶ bq-preflight ──▶ ingest-bigquery ──┐   (daily, CI)
                                                            │
GSC CSV export ──────────────────────▶ ingest-gsc ──────────┤   (manual, fallback)
                                                            ▼
                                                   snapshot (committed)
                                                            │
                            ├──▶ analyze ──────▶ opportunities / CTR gap / unanswered /
                            │                    decay / cannibalisation
                            │
                            └──▶ weekly-report ─▶ growth/reports/YYYY-MM-DD-weekly.md
                                                            │
  experiments.json ◀── evaluate ◀───────────────────────────┘
        │
        └──▶ check-experiments (CI) ──▶ annotation + job summary when a date passes
```

Both ingests write the same snapshot through `lib/snapshot.mjs`. Nothing
downstream can tell which one produced it, which is the point: a totals rule or
a curve fit that drifted between two copies would show up as a step change on
the day the source switched, and would be read as the site changing.

## Commands

```sh
# BigQuery bulk export — what CI runs daily. Setup: growth/BIGQUERY_SETUP.md
node growth/scripts/bq-preflight.mjs                     # is the export landing?
node growth/scripts/ingest-bigquery.mjs --site sc-domain:simplememofast.com
node growth/scripts/ingest-bigquery.mjs --days 7 --dry-run   # inspect without writing

# CSV fallback: once a week, after dropping the export into growth/input/
# (see GSC_OWNER_ACTION.md). Still needed until the export has 28 days of history.
node growth/scripts/ingest-gsc.mjs --label 2026-08-09 --period 2026-07-12..2026-08-08
node growth/scripts/weekly-report.mjs --write

# detectors, individually
node growth/scripts/analyze.mjs
node growth/scripts/analyze.mjs --only ctr-gap --top 30
node growth/scripts/analyze.mjs --json          # for piping

# experiments
node growth/scripts/experiments.mjs due
node growth/scripts/experiments.mjs add --page /obsidian/ --type title_test --evaluate 2026-09-06
node growth/scripts/experiments.mjs evaluate <id> --decision keep --note "why"

# what CI runs
node growth/scripts/check-experiments.mjs
```

## Design decisions worth knowing before you change something

**Snapshots are committed.** They are small JSON and they are the reason a
decision made in August can be re-derived in October from the same bytes. Do
not gitignore them.

**`due` and `overdue` are computed, never stored.** A stored flag would have to
be refreshed by someone, and "someone forgot to refresh it" is the bug this
directory exists to prevent. They are functions of `evaluation_at` and today.

**Overdue experiments do not fail CI by default.** A green SEO Validation is
what lets `auto-merge.yml` merge to main, and merging to main *is* the
production deploy. Blocking on an unevaluated retitle would also block every
unrelated bugfix, and would create pressure to rubber-stamp a decision just to
ship. So the default is a GitHub annotation plus a job-summary table — visible
without opening a log, but never a hostage situation. `--strict` blocks, for
scheduled or local use.

**A malformed ledger DOES fail CI.** An entry that cannot be parsed can never
come due, so a broken file would silently switch the gate off.

**`evaluate` refuses without post-change GSC data.** Recording an outcome from
memory reproduces exactly the situation this replaced. `--force` exists and
stamps the entry `evidence: none`, so the next reader can see it.

**Business relevance is hand-maintained, on purpose.** `BUSINESS_RELEVANCE` in
`lib/gsc.mjs` maps URL patterns to how close a page's readers are to
installing. It cannot come from Search Console, which knows about clicks and
not about intent to install. Without it the queue ranks by impression volume
alone — which is how effort ends up in the largest cluster rather than the one
that produces users. When you add a cluster, add its pattern.

**The expected-CTR curve prefers the site's own data.** `buildCtrCurve` derives
CTR-by-position from the snapshot itself and falls back to a conservative
reference table only where a position bucket has under 500 impressions.
Generic curves are built from English, commercially-skewed samples and run high
here; an inflated expectation manufactures "opportunities" that are just normal
performance. `meta.ctr_curve_derived_positions` records which buckets were
measured rather than assumed.

**GSC page URLs are resolved against the real page inventory.** This site
canonicalises directory pages with a trailing slash (`/vs/capacities/`) and flat
pages without one (`/blog/line-keep-alternative`), so string rules alone get
roughly sixty blog and devlog pages wrong — and a mis-normalised path fails to
join silently, which looks identical to "that page has no data". `toPath()`
consults `scripts/lib/site-files.js` and passes unknown paths through unchanged
so that GSC-reported 404s and spam URLs stay visible.

**Ingest runs daily; snapshots stay weekly.** `.github/workflows/seo-daily.yml`
pulls a fresh 28-day window every morning, runs the detectors and writes them to
the job summary — but commits nothing except on Mondays. Committing daily would
put ~180 MB of near-duplicate JSON a year into the repo the site is served from,
and would quietly break decay: `previousSnapshot()` returns the label
immediately before, so daily snapshots would be compared against a baseline
sharing 27 of their 28 days. Every delta would collapse toward zero while still
printing a confident cause. The daily value is seeing today's numbers, not
accumulating history.

**A stale export fails the workflow.** This is the same failure the directory
exists for, relocated: a pipeline that stops delivering does not raise its hand,
it reports smaller numbers, and smaller numbers get explained. `bq-preflight.mjs`
runs first and `--strict` makes staleness an incident rather than a data point.

## Not built yet

- **App Store Connect ingest.** `data/appstore/` is scaffolded but empty. Paid
  conversion is the North Star metric and it is not yet in this loop, so the
  weekly report currently stops at clicks.
- **Activation correlation.** Which in-app event predicts payment is an open
  question; answering it needs product analytics this repo does not have.
