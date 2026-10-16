# Site-wide OneLink draft: scope and release boundary

This is a reviewable website implementation candidate, authorized separately from
the nine-placement pilot on 2026-10-16. The owner has now authorized normal CI,
merge and deployment. At this revision those steps have not yet been completed
or verified, so `rollout_start: null` remains the recorded state. The original pilot's
three-metric completion contract in [ONELINK_PILOT.md](../../growth/ONELINK_PILOT.md)
is unchanged. Wider route coverage is not proof of website-to-install CVR.

## Separate campaign using the existing template

Keep the nine existing hero links and their `pilot` attributes exactly as they
are, including `https://simplememofast.onelink.me/it5q/l250gib4`. Do not append
`c=website_bridge_v1` to that short URL: appended parameters do not override a
stored campaign. A template's Secure Shortlinks setting can also prevent
attribution when parameters are appended. See the official
[OneLink parameter FAQ](https://support.appsflyer.com/hc/en-us/articles/360014821438-OneLink-troubleshooting-and-FAQ)
and [template settings](https://support.appsflyer.com/hc/en-us/articles/207032246-Create-a-OneLink-template).

The separate candidate uses a static long URL based on the same template:

```text
https://simplememofast.onelink.me/it5q?pid=owned_web&c=website_bridge_v1
```

AppsFlyer documents constructing long URLs outside its UI from an existing
template domain and ID. This needs neither a new shortlink nor a link-creation
API call. The public `pid` and `c` values classify the campaign; no visitor or
device identifier is added. See
[short and long URL construction](https://support.appsflyer.com/hc/en-us/articles/360017132597-Understand-OneLink-short-vs-long-URLs).
The syntax is documented; this account's redirect and attribution behavior
has not been verified for the candidate.

## Candidate website behavior

The existing tracker opts in only where its script tag has
`data-sitewide-app-routes="true"`. On approved production HTML it converts only
eligible own-app Apple anchors to the separate long URL at runtime. It retains
the original static destination, including allowed `ct`, `pt`, `mt` and `ppid`
values, in encoded `af_ios_url` and `af_web_dp` parameters. It does not substitute
the pilot's campaign or CPP for other routes' destinations. When an eligible
destination already has a `ppid`, the candidate also retains it in the dedicated
`af_ios_store_cpp` parameter.

Eligibility uses exact reviewed public values, not just syntactically valid
tokens: eight existing `ct` values, one `pt`, `mt=8`, eight existing `ppid`
values, and four Store paths (three declared source paths plus the canonical
app-ID path). New campaign/provider/CPP values or Store paths require explicit
allowlist review and an updated inventory before conversion. This prevents an
arbitrary token or numeric value from being forwarded merely because it fits
a pattern. Two exact authored reference URLs are also allowed:
`https://apps.apple.com/jp/app/id6758438948?see-all=reviews` and
`https://apps.apple.com/jp/app/id6758438948#information`. Both nested redirect
parameters retain the full original reference destination. Other combinations,
unknown keys or values, duplicate parameters, credentials, fragments and
unsupported destinations stay on their original direct route. JavaScript
disabled or an unavailable tracker also leaves the original HTML href in place.
This is a direct-link fallback before conversion, not an automatic fallback if
a converted OneLink later fails. The pilot and QA shortlinks are never converted.

The web events use the existing bounded dimensions and a separate `sitewide`
scope. They must not forward arbitrary URL query values, referrers or new
identifiers into analytics. The candidate does not add a collector, app SDK,
consent flow or account setting.

The local inventory at 2026-10-16 11:15 UTC evaluates the candidate tracker against
detached anchor mocks. It visits no links and dispatches no analytics events.
Its source base is `0ef15885743153a1d902d34b951e0b537634dd51`; the evaluated tracker
SHA-256 is `6005bb5bc073f0565619cc71bd12fc73a8b5b1e9d81c50c3a1f86acbd62975f2`.
This is local conversion eligibility, not successful redirection or traffic
coverage. The source scan is not an atomic snapshot.

| Inventory item | Count | Treatment in this draft |
|---|---:|---|
| Public-source HTML files | 2,530 | Inventory population; not deployed-page or visitor coverage |
| Sitemap pages | 2,387 | A different population from HTML files |
| Opted-in pages already loading the tracker | 2,449 | All evaluated locally against the tracker |
| Direct own-app Apple anchors in source | 7,474 | Original hrefs remain in HTML |
| Locally eligible anchors / containing pages | 7,452 / 2,429 | Runtime conversion predicate accepted these anchors |
| Exact reviewed query / fragment references | 10 / 2 | Included in the eligible total; destination preserved in nested URLs |
| Compose/verify utility pages / direct anchors | 20 / 22 | Excluded; no tracker introduced on these sensitive utilities |
| Sitemap direct anchors / locally eligible anchors | 7,163 / 7,163 | Eligible anchors are on 2,326 pages; not an additional total |
| Existing pilot hero anchors | 9 | Exact source URL/attribute contract preserved |
| Independent English Obsidian hub anchors | 5 | All eligible for the separate sitewide campaign; outside the nine-hero pilot |
| QR placements / containing pages / distinct image assets | 246 / 236 / 46 | Unchanged and unsupported in this draft |
| Native Smart App Banner placements | 2,530 | Unchanged; native Safari taps are outside DOM click observation |

The required QR encoder/decoder dependencies (`qrcode@1.5.4`, `jsqr@1.4.0`) are
unavailable locally, and new installation is outside this work's authorization.
QR destinations have not been rewritten or decoded. Routing a QR through OneLink
would require asset regeneration and independent decode verification; scanning
an image on another device would still not emit a DOM click on the source page.
Native Safari banner taps are outside this DOM mechanism, while the 22 utility
anchors lack the tracker and adding tracking there remains outside scope.
Do not count an image placement as a tracked QR
scan. Placements include declared hidden/responsive duplicates and do not
measure user exposure. The inventory command is
`node scripts/site-route-inventory.mjs --summary-only`; it reads public source
files and evaluates the tracker locally, without browser or provider access.
Re-run the inventory after tracker or HTML changes before relying on these
counts. The 7,452 eligible anchors are not a completed-rollout claim. The retained
handoff evidence for this revision is `final-revision/route-inventory.json` and
its summary; the earlier 7,440-anchor inventory predates the reference exceptions.

## Aggregate compatibility and comparability

- GA4 keeps the legacy pilot columns and adds separate sitewide fields. The
  new all-route click-session union deduplicates direct Apple, pilot and
  sitewide clicks within each observed session; individual route counts cannot
  be added to obtain this union.
- The nine-hub primary observation may use that expanded union only when the
  full required new column set is available. Its definition version and source
  column must identify the choice. Older receipts retain their legacy
  interpretation. Otherwise converting a non-hero Apple CTA on a pilot hub
  would silently remove its click from the old primary observation.
- The pilot's impression/click auxiliary remains pilot-only. The exact nine
  hero hrefs and attributes stay fixed. Other route changes can still affect
  visitor behavior on the same pages; no causal independence is claimed.
- Replacing a direct Apple route mechanically reduces the legacy direct-only
  `app_store_click` rate. Its retained column preserves historical meaning,
  not equivalent pre/post conditions. Do not interpret that change alone as
  improvement or decline. Record the actual launch boundary for new series;
  the candidate's `rollout_start` is still `null`.
- Baseline eligibility also checks historical query windows. The comparison
  review begins on October 16, 2026; this is a review boundary, not a deployment
  date. Legacy windows ending October 15 or later are frozen for baseline use
  because their 24-hour follow-up can include that boundary. Earlier legacy
  receipts retain their original eligibility and output structure. The new
  query definition remains ineligible for the old direct-only baseline even
  when it reports zero sitewide clicks. Observed counts and quality evidence
  remain visible; a separately reviewed baseline is required to lift the freeze.
- AppsFlyer classifies exactly `owned_web` / `website_bridge_v1` separately
  from `owned_web` / `obsidian_bridge_pilot_v1`. QA, Organic, unknown and other
  attributed groups remain separate. Missing campaign rows remain unknown;
  a present zero stays zero. Existing receipt integrity, missing-date and
  quality gates remain in force.
- Install/OneLink-click ratios are provider report-period ratios. The existing
  28-day and zero-missing-date rules do not make a new campaign mature before
  it starts. No sitewide start time is inferred from this draft or a PR date.
  `website_install_cvr.value` and its estimate stay `null`.

The existing `acquisitionReport` text format is preserved. New supplementary
display is isolated in `sitewideAcquisitionReport`, with no automatic wiring
into existing daily/weekly/monthly reports. The structured acquisition fields
and versioned nine-hub primary observation are the measurement changes here;
the public daily report generator and schedules are unchanged.
`acquisitionMaterial` projects the structured result back to the existing
notification contract, including the legacy nine-hub primary and former
AppsFlyer classification. Adding the standalone fields alone must not produce
a changed-evidence notification for an unchanged receipt. Baseline-derived
fixtures verify that fingerprint while retaining detection of real changes
to existing metrics. The structured private JSON can contain the new fields;
that does not wire the standalone text into a scheduled report.
Proven historical CTA receipts also retain their original structure without
new route metadata, preserving the separate CTA notification fingerprint.

GA4 sessions, PV and observed browser visitors retain their different units.
Store-link intent is not Store arrival. AppsFlyer `Installs`, API first-launch
observations, Apple first-time downloads, reinstalls and payments are not
interchangeable. Equal calendar windows do not establish a common cohort.
Consent, ATT restrictions, prior refusal, attribution delay and internal-use
exclusion gaps remain visible. Organic is not reassigned to website or SEO.

## Unverified external behavior and privacy

Long URLs reuse the template, not the shortlink's saved per-link settings.
The pilot's saved CPP and existing-user Store behavior therefore cannot be
assumed for the candidate. `af_ios_url` can express a destination, but the
account redirect allowlist also covers Apple Store domains. This account's
allowlist, actual redirect, storefront, CPP, query preservation, installed-app
behavior and AppsFlyer attribution remain unverified. See
[redirect parameters](https://support.appsflyer.com/hc/en-us/articles/207447163-About-link-structure-and-parameters)
and [redirect allowlist](https://support.appsflyer.com/hc/en-us/articles/25068636064529-Set-up-your-domain-redirect-allowlist).

AppsFlyer documents that `af_web_dp` prevents its recording of desktop clicks.
GA4 can still record the web click intent, so GA4 and AppsFlyer click totals
must not be expected to match. See the
[desktop redirect FAQ](https://support.appsflyer.com/hc/en-us/articles/360014821438-OneLink-troubleshooting-and-FAQ).
The dedicated `af_ios_store_cpp` parameter is also documented for an existing
CPP, but it alone does not preserve Apple `ct`/`pt` or prove existing-user
behavior; this draft does not create or edit a CPP.
[CPP reference](https://support.appsflyer.com/hc/en-us/articles/4406217556625-Redirect-users-to-custom-app-store-product-pages).

Expanding the number of OneLink routes expands where the existing third-party
click handling applies. The ten language privacy pages retain direct App Store
search as an alternative and no longer
suggest that another link on the same page avoids OneLink: all eligible links
on opted-in pages are candidates for conversion. This is a source disclosure
update, not evidence that app-side consent or ATT behavior has been verified.
Review the final disclosure and keep unresolved consent/ATT limitations visible
in the release evidence.
This draft does not resume the waived pilot device tests or any Apple/iOS work.

## Review and release

Review locally with static inventory, URL construction and fallback fixtures,
tracker event isolation, GA4 SQL behavior fixtures, and private aggregate
parser/report tests. Preserve the nine original hero hrefs/attributes and
demonstrate that the separate campaign cannot enter their series. These checks
establish code behavior, not live OneLink routing or attributed installs.

The latest owner instruction authorizes normal CI followed by merge and
deployment. Earlier draft-only `[skip ci] [cf-pages-skip]` precautions describe
the previous preparation stage; they do not replace the required production
checks or justify leaving CI unrun. Obtain successful required checks for the
final revision, verify the actual merge/deployment result and read back the
served revision and route scope. Local tests and a PR state alone do not prove
deployment or successful provider attribution. Until those operations are
completed and verified, report them as pending and keep `rollout_start: null`.
Record the actual start time and deployed SHA after deployment readback.
Collection dispatch, account changes, new installations and Apple/iOS work
remain outside this release task; the waived device tests are not resumed.
