# Website acquisition collection

The `company-os collect` operation (and `acquisition-ingest`) now admits the Apple
producer's `App Downloads Standard` and `App Downloads Detailed` aggregates
from the same pinned iOS commit as its status and revenue outputs. Weekly and
monthly Detailed reports use the producer’s exact instance manifest and retain
Apple’s closed calendar periods, selecting the latest correction per period.
Older producer output without the manifest remains unavailable until refreshed. No Apple
request, credential, timer or app SDK is added. Inputs and report values stay
in the private Company state directory, never in site assets.

`node scripts/company-os.mjs acquisition-status` returns:

- GA4 observed production landing sessions, sessions with a direct Store click
  within 24 hours, their weighted click-session rate and missing landing count.
  The original source period and quality block remain explicit.
- Beside it, a diagnostic-only `automation_excluded_diagnostic` repeats the
  same rows without two approximate fingerprints: CI Lighthouse (Direct, no
  referrer, landing `/` or `/en/`, mobile, `en-us`; see `measurement_changes`
  2026-09-16) and bot-like (Direct, no referrer, desktop, `en-*`). Excluded
  click sessions stay visible. It never replaces the GA4 rate, the Organic CTA
  measurement or an experiment value, and the same quality state applies.
- `obsidian_hub_pilot` reads the OneLink pilot (growth/ONELINK_PILOT.md) from
  the same rows: production sessions landing on the nine pilot hubs with a
  Store-link click within 24 hours (direct Apple and OneLink, deduplicated),
  and OneLink pilot impression sessions that click (QA excluded; clicks without
  a recorded impression are shown, not counted as exposed). It sits beside the
  official rate and does not replace it.
- Apple first-time downloads for the own-site referrer and the two existing
  `web_obsidian_v1` / `web_other_v1` campaigns. Only the joined download-type /
  referrer / campaign rows qualify. Updates, restores and redownloads cannot
  become new acquisitions. Standard and Detailed are separate populations.
- AppsFlyer Organic, QA, unattributed, other attributed, and the exact existing
  owned-web pilot groups. Only `owned_web` + `obsidian_bridge_pilot_v1` enters
  the pilot count. This does not imply whole-site coverage or working SDKs.

The same view appears in `growth-status` and existing daily/weekly/monthly
private reviews. A fresh API read alone does not create a business-change
notification. As of 2026-10-14 a naturally scheduled run of the local refresh
had not been verified, so on 2026-10-15 the owner approved one new recurring
owner: `.github/workflows/acquisition-daily.yml` reads GA4 `ga4-funnel` and the
AppsFlyer aggregate on a daily GitHub Actions schedule and keeps only encrypted
artifacts. They reach this view only when `collect` or `acquisition-ingest`
runs on the Mac (no new local timer). `acquisition-status` shows that owner as
`collection_owner`, including `appsflyer_key: key_pending` until the owner
registers the AppsFlyer environment secret. Apple outputs still come from the
iOS producer. Read each source's observed date before treating a value as
current. Details: `docs/autonomy/OPERATING_RUNBOOK.md` (Scheduled acquisition
collection).

Apple dates are UTC and refer to the provider's actual observed rows, which
may span more than one day. Missing/hidden cells are `null`, even if another
source or campaign has visible downloads. An explicit zero row stays zero.
Do not sum overlapping daily exports, own-site plus campaign totals, Standard
plus Detailed, or replace the Apple UI's 30-day count with one daily snapshot.
Hashes bind the private retained source files to the original collection
receipt; unavailable, corrupt or stale collection receipts cannot expose an
older number as a new successful observation.

Website visit-to-install CVR stays unavailable until a common attributable
cohort exists. GA4's click-session rate is useful as a descriptive web metric;
it is not install CVR. Dividing Apple or AppsFlyer downloads by GA4 sessions
would mix attribution, timezone, consent and population coverage.

## Agreed pilot scope and supplementary website observations

Retained AppsFlyer reports are bound to their verified collection receipt on
both display and reuse: the receipt's CSV SHA-256 and valid inclusive dates
must match the retained CSV/result pair and its `from`/`to` parameters. A
self-consistent replacement pair is insufficient. Missing or mismatched
receipt metadata blocks the observation; it does not trigger a replacement
query or turn a failed receipt into a success.

The owner-approved completion scope remains the nine hero placements and
three metrics defined in [ONELINK_PILOT.md](../../growth/ONELINK_PILOT.md):
the GA4 landing-session to Store-link-click rate, AppsFlyer attributed pilot
`Installs`, and the AppsFlyer report-period `Installs` / OneLink `Clicks` ratio.
The last is a formal observation only when the existing 28-day report and
zero-missing-date conditions hold; earlier post-start observations remain
diagnostic. The existing source and quality requirements still apply.

The additional site-wide PV and observed browser visitor totals are supporting
web observations. A matched website-to-install cohort, coverage of all site
routes, or a common GA4/AppsFlyer window is not an added completion requirement
for the pilot. No new collection purpose, identifier, consent flow or route
rollout is authorized by this reporting change.

Store-link clicks do not prove arrival at the App Store. AppsFlyer `Installs`,
API first-launch observations and Apple first-time downloads remain distinct
source metrics; none is a payment or a count of verified new people. Revenue
and purchase metrics keep their own sources and observation periods.

### Optional whole-site install readiness

`website_install_cvr` now retains its existing `value: null` and
`state: not_measurable`, and exposes the evidence needed to answer the wider
website-to-install question. This is consumed by the existing
`currentSiteAcquisition` / `acquisition-status` and `acquisitionReport` paths;
it adds no collection, identifier, SDK, consent change or publication.

- **Denominators:** PV means page-view events, including repeated views.
  Visitors means distinct observed browser identifiers. Sessions means the fixed
  funnel's observed production landing sessions; one visitor can start several
  sessions. The extended fixed export supplies site-wide identified page-view
  counts and distinct observed browser identifiers for the inclusive JST event
  dates. These are not verified people or the 24-hour session-start cohort.
  Missing totals in older exports stay `null`; sessions are never renamed to
  either unit. Every denominator keeps its source window and quality state.
- **Numerator:** the existing AppsFlyer `Installs` field for exactly `owned_web`
  / `obsidian_bridge_pilot_v1` is a reported pilot count, not a verified count
  of new people, Apple first downloads, or the API's first-launch observations.
  A present zero is retained; absent rows, failed receipts and unknown fields
  never become zero. Reinstall semantics and internal-use exclusion still
  require evidence. QA and Organic remain separate.
- **Coverage:** nine hub hero placements share one link, so the install count
  has no page/language breakdown. Other direct Apple links, QR, Smart App
  Banner and the independent English hub hero are outside this pilot's
  attribution. Consent, ATT denial/restriction and prior in-app refusal limit
  app collection; GA4 and AppsFlyer do not observe identical populations.
- **Periods:** both report windows are explicitly inclusive JST dates. Their
  equality is reported, but even equal calendar windows do not establish a
  common cohort. The GA4 session's 24-hour click follow-up, five-calendar-day
  export maturity and AppsFlyer's 28-day report requirement are three separate
  rules. None establishes the account's click-attribution lookback, which
  remains `null` / `account_setting_unverified`. Delayed attribution can cross
  a window boundary.
- **Readiness:** use the retained report dates, not the current date or a
  successful workflow name. Production started at 2026-10-15 11:31 JST; the
  first complete day is October 16. A GA4 window containing that complete day
  can first be collected October 21, and seven complete post-start days can
  first be collected October 27. These are earliest collection dates, not
  proof of receipt, successful attribution or experiment eligibility. Earlier,
  partial-launch-day and mixed pre/post windows are labeled explicitly.

`blockers` applies only to the optional whole-site visit-to-install CVR, as
recorded by `blockers_scope` and `pilot_completion_gate: false`. These gaps do
not withhold the three pilot observations or change their completion contract.
`pilot_readiness` describes source-window coverage, not a pass/fail decision
for the pilot. `estimated_value` remains `null`: the current
aggregates cannot support a site-wide conversion estimate. Do not multiply
the GA4 click rate by the AppsFlyer period ratio or divide the pilot installs
by GA4 sessions to manufacture one. Those operations combine different
coverage, denominators, consent populations and attribution periods.

Keep the existing collection and status paths; do not create a second
collector. Run a collection command only within its authorized operational
scope: `collect` / `acquisition-ingest` also consumes the Apple/iOS producer,
and a runner's `--status` option is not necessarily read-only. If the approved
recipient key is unavailable, leave encrypted artifacts unadmitted and report
that condition. Do not copy or create a key to make this metric ready.
After admission, keep the three existing observations separate: visit-to-store
click rate, attributed pilot installs, and installs/link-clicks period ratio.
The PV/visitor totals added here describe the existing GA4 observations; they
are not a denominator for the pilot install count. Broader route coverage or
common-cohort linkage needs a separate measurement/privacy decision.

Validation remains `node --test growth/lib/company-acquisition.test.mjs`.
The new cases cover the denominator units, zero versus absence, source failures,
unmatched periods even with equal dates, partial launch days, calendar maturity,
unverified lookback, scope limits and the rendered private report.

### Visit denominator implementation (requires live validation before release)

The existing `ga4-funnel.sql` SELECT now adds `site_window_page_views` and
`site_window_observed_visitors`, using only the existing `identified` CTE,
production hostname and page-view event dates within the requested JST window.
The second count deduplicates existing `user_pseudo_id` over the entire window;
it must not be calculated by adding per-page, language or daily users. Events
without existing user/session keys remain excluded and visible in the attached
quality report. Internal use and bots are not proven excluded.

Both whole-window totals repeat on each grouped funnel row to preserve existing
session groups and metrics. `websiteVisitTotals` requires all repeated totals
to agree, reads them once and rejects missing, invalid or conflicting values.
An empty report is unknown; an explicit consistent zero stays zero. The prior
exact query hash remains admitted for its unchanged CTA metric, while its absent
visit totals stay unknown. No raw browser identifier is added to the output.

This changes denominator aggregation, not web-to-app attribution. It does not
add a query, table, event, SDK, identifier, provider request or schedule; the
existing dry-run, byte caps, quality and maturity gates remain. No live SQL
execution or publication is implied by the source change. Validate the SQL
behavior suite and the existing dry-run/export path before release.

### Any future whole-site cohort metric needs a separate decision

The current aggregate reports cannot identify which observed site visitors
subsequently started the app for the first time. This change chooses no new
attribution duration or visitor-to-app linkage. If a broader cohort metric is
requested later, agree its population, qualifying routes, definition of a new
installation, attribution duration, exclusions and data maturity before
implementation. The account's click lookback and the report period must remain
separate. Unresolved identity, consent and cross-device cases remain unknown.

Do not relabel the nine-placement campaign as site-wide or replace its links
to satisfy this diagnostic. Preserve the pilot and QA series and record the
actual start of any separately approved rollout. Do not automatically add
cross-product identifiers, raw-data access, fingerprinting or app changes.
Continue reporting web visits, Store-link clicks, AppsFlyer pilot `Installs`,
API first-launch observations, Apple downloads and payments separately. The
agreed AppsFlyer installs/clicks period ratio is not the fraction of those web
visitors who installed and is not an exact visitor-cohort CVR.

AppsFlyer report access and app SDK collection are separate. When this handoff
was implemented (2026-10-06), the reviewed iOS main kept acquisition
measurement stopped pending a purpose-specific consent flow. iOS PR #669
(2026-10-08, released as 5.9.16) restored it: the SDK starts unless the device
denies or restricts tracking or an earlier in-app acquisition refusal is
stored, and the app reports a bounded `acquisition_attribution_received` label
to the API. That still does not produce a site-wide attributed install count.
Only installs that arrive through the owned-web OneLink pilot link enter the
pilot group above. That link is on the nine Obsidian hub hero buttons from
the production start recorded in `measurement_changes`
([PR #1047](https://github.com/simplememofast/simplememo/pull/1047),
[pilot handoff](../../growth/ONELINK_PILOT.md)). Installs from the site's other
plain App Store links are normally reported as Organic, mixed with every other
unattributed install. The Apple collection handoff does not depend on the SDK.
The owner waived the pilot's physical-device test on 2026-10-14, so pilot
attribution is judged from production data and is unverified at device level.

Validation: `node --test growth/lib/company-acquisition.test.mjs` covers
missing versus zero, joined dimensions, SDK-independent source classification,
corrupt input, retention and weighted rates. The existing Company regression
suite covers collection locks and bounded retries. Revert the change to stop
the added handoff; existing provider collectors and historical files remain.

## Separately authorized sitewide route draft (2026-10-16)

The reporting-only authorization above is distinct from the later website
route draft in [sitewide-onelink-rollout.md](sitewide-onelink-rollout.md).
That candidate reuses the existing OneLink template for the separate
`owned_web` / `website_bridge_v1` campaign. The latest owner instruction
authorizes normal CI, merge and deployment; those operations and the deployed
readback are not yet complete for this revision. It has no recorded production start:
`rollout_start: null`. The nine original pilot links and their three-metric
completion contract remain unchanged. QR, native Smart App Banner taps,
compose/verify utilities and unsupported URL forms are explicit coverage limits.
The revised source keeps click-intent measurement for the 7,452 own-app anchors
on 2,429 existing tracker pages, but no longer routes all of them through
OneLink. Direct hrefs are retained for 7,185 links with `ct`/`pt`, ten exact
review queries, two exact information fragments and 41 remaining bare US Store
links. These 7,238 anchors keep the existing GA direct events. The remaining
214 bare JP Store links on 209 pages pass the separate OneLink predicate.
The nine original pilot hero links remain unchanged and separate. The refreshed
offline inventory evaluates tracker SHA-256
`4d5f67122ea19faf5047076ffc141df0f003ab7f78cb4d6fca3b68c1e8c41aee`.
Within the sitemap, 206 of 7,163 anchors convert, on 201 pages. The previous
7,452-conversion inventory is superseded.

Desktop HTTP checks on 2026-10-17 reached the app through OneLink but lost
`ct`/`pt` and the review query compared with direct URLs. The two bare US URL
forms also redirected to JP; the bare JP URL matched its direct final URL
with HTTP 200. The revised site
preserves those destinations by keeping them direct, and also keeps non-JP
storefronts direct. It does not change the provider's redirect allowlist or
try to bypass it. Unknown paths/values, unsupported fragments and repeated
parameters remain excluded from conversion. Current new-campaign candidates
are bare JP URLs; broader AppsFlyer attribution is deliberately limited to
protect existing destinations and Apple campaign measurement.

QR assets, native Safari banner taps, tracker-free utility anchors and TikTok
iOS automatic redirects remain outside this anchor path. The 22 utility
anchors on 20 pages retain direct URLs without adding tracking. A cross-device
QR scan is not a source-page DOM click. The source classification is not
proof of deployed coverage, GA4 receipt or successful attribution.

New GA4 sitewide fields are separate from the legacy pilot fields. An expanded
all-route session union counts direct Apple, pilot and sitewide intent without
double counting. The nine-hub primary observation uses it only when the required
new columns are complete, and identifies its definition version and source
column. Older receipt schemas retain their legacy interpretation; missing
fields are not zero. The pilot impression/click auxiliary stays pilot-only.
Converting direct routes mechanically reduces the legacy direct-only
`app_store_click` rate. Retaining that field preserves historical interpretation;
it does not make a pre/post comparison equivalent or prove improvement or
decline. New sitewide series need their actual rollout boundary recorded.

AppsFlyer gains a separate closed classification for `website_bridge_v1`;
the original pilot, QA, Organic and unattributed groups keep their meanings.
Existing receipt, period, zero-missing-date and quality rules still apply.
The candidate adds no provider request, collector or schedule. It does not
restart collection, consume an Apple/iOS producer or change a daily report.
The existing `acquisitionReport` format is preserved. Supplementary sitewide
display belongs to the separate `sitewideAcquisitionReport` export and is not
wired into the existing daily/weekly/monthly consumers. The structured
acquisition result gains the new measurement fields and the versioned nine-hub
primary readout; the public daily report generator and schedules are unchanged.
`acquisitionMaterial` preserves the legacy notification projection so the
new standalone fields do not create a changed-receipt notification. Fixtures
derived from the baseline verify matching fingerprints and continued detection
of changes to existing metrics. Structured private review JSON may contain the
new fields without adopting the separate text renderer.
Missing or unverified results stay distinct from observed zero. Website
visit-to-install CVR and its estimate remain `null`.

Retained direct links keep `seo_cta_impression`, `app_store_click` and
`seo_cta_click`; converted links use the separate sitewide `web_to_app_*`
events. Keep those route populations separate. Preserving a direct click in
GA4 does not make it an AppsFlyer campaign-attributed install. The reduced
new-campaign scope does not change the nine-placement pilot completion contract
or establish whole-site install coverage.

For converted links, `af_ios_url` / `af_web_dp` construction is not proof of
successful forwarding, installed-user behavior or attribution. AppsFlyer does
not record desktop clicks when `af_web_dp` is present, so those web intents
cannot be reconciled one-for-one with its click totals. The privacy pages keep
direct App Store search as an alternative; app consent/ATT behavior and actual
collector delivery remain unverified. Device tests are not resumed.

Complete normal CI on the final revision and verify merge, deployment and the
served runtime/route scope before recording the actual rollout start. Report
GA4/AppsFlyer event receipt separately: a successful page or redirect, or a
local dataLayer entry, is not collector receipt. At this revision served
verification and event receipt remain pending. Earlier CI skip precautions do
not replace the required checks. The reporting change dispatches no collection
or account configuration.
