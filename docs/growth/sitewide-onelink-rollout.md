# Site-wide OneLink draft: scope and release boundary

## Wind-down (2026-11-17)

**The site no longer routes any App Store link through OneLink. Everything is
rolled back in #2381, including the pages open experiments own.**

- Owner decision, 2026-11-17: the app drops the AppsFlyer SDK in its next
  version. No install was attributed to OneLink, pilot or sitewide, from the
  start through 2026-11-14 (growth/ONELINK_PILOT.md 「終了の決定」).
- The same day the owner explicitly approved changing the experiment pages too
  (「かえていい」). A first revision of #2381 had kept 88 pages and the nine
  pilot heroes because open exclusive experiments own them; that hold is gone.
  The change is recorded as an explicitly requested concurrent change in the
  notes of the five open experiments whose pages changed
  (`video-2026-08-11-five-clips`, `title-2026-08-20-home-grammar`,
  `aio-2026-08-12-entity-attribution`, `en-2026-08-11-native-rewrite`,
  `title-2026-11-11-second-brain-term`), not as an experiment effect.
- `data-sitewide-app-routes` is removed from all 2,449 tracker pages by
  `node scripts/enable-sitewide-app-routes.mjs --write`, which now keeps the
  opt-in off every page. All 210 bare JP Store anchors (208 pages) open the
  direct Apple URL again and report `app_store_click` / `seo_cta_click` with
  `placement=reference` instead of `web_to_app_*` (`sitewide`). They keep no
  `ct`: the site convention gives `ct` only to CTAs, and adding one would turn
  these references into CTAs.
- The nine pilot heroes (`/obsidian/` and its eight generated translations)
  point to the direct Apple URL with `ct=web_obsidian_v1` again, without
  `data-app-route` / `data-app-traffic`, variant `v1`.
  `growth/onelink-pilot.json` is `rolled_back`. Their clicks move from
  `web_to_app_*` (`pilot`) to `app_store_click` / `seo_cta_click`
  (`placement=hero`).
- Visible text, button positions, `ct`/`pt` links, QR images and Smart App
  Banners are unchanged. Only the nine hero pages get a new sitemap `lastmod`.
- `js/app-store-tracking.js` is unchanged. Its sitewide and pilot/QA branches
  no longer run (no page opts in, no anchor carries the pilot label). Removing
  them changes every page's `?v=` and the route inventory and tracker tests,
  so it is a separate change.
- `sitewideAcquisitionReport`, the GA4 sitewide columns and the pilot columns
  count nothing after the boundary. Do not compare sitewide, pilot or
  direct-only rates across it. The boundary time is the production deployment
  of #2381, recorded after readback, not the PR date.
- The affected period also has a start: the sitewide route began with #2100
  (merged 2026-10-17 23:28 JST; its production start was never read back, so
  `rollout_start` stays `null`). Do not compare direct-Apple-only rates or
  sitewide values from 2026-10-17 until this deployment with the periods
  before or after it: about 210 anchors reported `web_to_app_*` instead of
  `app_store_click` in between. The pilot began 2026-10-15 11:31 JST.
- Not yet in `measurement_changes` or `growth/data/annotations.json`. Both rows
  are added after the production readback, with the real deployment time (JST
  and UTC), the production SHA and a version named after the real start date
  (growth/ONELINK_PILOT.md 「この変更の記録（本番反映の後）」). They must carry the
  start of the period above as well.

Remaining steps, in order: read back production and add the records; remove
the sitewide and pilot/QA branches from the tracker; the owner decides on the
AppsFlyer OneLink paragraph in privacy policy §13 (C), which still says some
buttons go through AppsFlyer. #2381 leaves §13 unchanged, so merging it does
not make that paragraph accurate; draft #2373 rewrites the same paragraph and
any fix has to be reconciled with it. Do not close the AppsFlyer account or disable
OneLink before the rollback is verified live.

The rest of this document describes the 2026-10-16 draft and stays as written.

This is a reviewable website implementation candidate, authorized separately from
the nine-placement pilot on 2026-10-16. The owner has now authorized normal CI,
merge and deployment. At this revision those steps have not yet been completed
or verified, so `rollout_start: null` remains the recorded state. The original pilot's
three-metric completion contract in [ONELINK_PILOT.md](../../growth/ONELINK_PILOT.md)
is unchanged. Wider route coverage is not proof of website-to-install CVR.

## Separate campaign using the existing template

Keep the nine existing hero links and their `pilot` attributes exactly as they
are, including `https://simplememofast.onelink.me/it5q/l250gib4`. SEO Validation
enforces this against `growth/onelink-pilot.json` (`growth/lib/onelink-pilot.test.mjs`):
the pilot short code may appear only in those nine hero hrefs, the pilot label
(`data-app-route="onelink"`, `data-app-traffic="pilot"`, variant `onelink_v1`)
only on those nine anchors (as written in HTML `<a>` tags; a label inside
`<template>` or set by a script is not seen), and the QA short code in no site file except
`js/app-store-tracking.js` (exempt as a whole, but never holding the full QA
link). Do not append
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
The long-URL syntax alone does not prove destination preservation. Desktop
HTTP checks on 2026-10-17 reached the app but dropped Apple `ct`/`pt` and the
review query compared with the original direct URLs. The revised website
keeps those destinations direct; no provider settings are changed.

## Candidate website behavior

The existing tracker opts in only where its script tag has
`data-sitewide-app-routes="true"`. On production pages, it retains the existing
GA click-intent measurement for all supported own-app anchors while limiting
new OneLink conversion to allowlisted Japanese Store destinations without
Apple attribution parameters or reference destinations.

The following links keep their original direct href, including every query
value and fragment:

- Destinations containing `ct` or `pt`, preserving existing Apple campaign and
  provider attribution rather than relying on unverified OneLink forwarding.
- The exact authored review and information URLs:
  `https://apps.apple.com/jp/app/id6758438948?see-all=reviews` and
  `https://apps.apple.com/jp/app/id6758438948#information`.
- Non-Japanese Store paths, preserving the requested storefront.
- Unknown or repeated parameters, unsupported paths/fragments, credentials
  and other URLs rejected by the existing allowlist.

Allowlist validation remains in place. Only the reviewed `/jp/app/id6758438948`
path can enter the separate `owned_web / website_bridge_v1` campaign, and it
must have neither `ct` nor `pt`. An allowed destination is encoded into
`af_ios_url` and `af_web_dp`; an allowed `ppid`, if present, is also placed in
`af_ios_store_cpp`. URL construction does not guarantee the provider preserves
those values. The current source's remaining candidates are bare JP app URLs.
New paths or values require review and a refreshed inventory.

Retained direct links keep `seo_cta_impression`, `app_store_click` and
`seo_cta_click`. Converted links use `web_to_app_impression` and
`web_to_app_click` with the separate `sitewide` scope. A retained direct link
must not be counted as a OneLink click. The original nine pilot links and QA
routes keep their hrefs, attributes and event scope.

All static HTML hrefs remain available when JavaScript or the tracker is
unavailable. This is a direct fallback before conversion, not an automatic
fallback after a OneLink failure. No collector, app SDK, consent flow, provider
account setting or identifier is added. GA events retain the existing payload
contracts; no new arbitrary page query, referrer or cross-product identifier
is forwarded by the sitewide event path.

The 2026-10-17 offline inventory applies the revised tracker, SHA-256
`4d5f67122ea19faf5047076ffc141df0f003ab7f78cb4d6fca3b68c1e8c41aee`,
to detached anchor mocks. These source counts do not establish delivery,
visibility, traffic coverage or receipt of an event by GA4 or AppsFlyer.

| Source population | Count | Treatment in this candidate |
|---|---:|---|
| Existing tracker consumers | 2,449 pages | Existing opt-in and tracker only |
| Direct own-app anchors on those pages | 7,452 on 2,429 pages | Click intent remains covered by the existing direct or separate sitewide event path |
| Anchors containing Apple `ct` or `pt` | 7,185 | Direct href and existing GA direct events retained |
| Exact review / information references | 10 / 2 | Direct reference destination and existing GA direct events retained |
| Remaining bare US Store anchors | 41 | Direct storefront and existing GA direct events retained |
| Remaining bare JP Store anchors | 214 on 209 pages | Accepted by the separate OneLink conversion predicate |
| Sitemap direct anchors / converted anchors | 7,163 / 206 on 201 pages | Separate sitemap population; other sitemap anchors stay direct |
| Total direct anchors retained on tracker pages | 7,238 | Outside the new OneLink campaign's attribution scope |
| Existing pilot hero anchors | 9 | Pilot contract unchanged; separate from the 7,452 direct-source anchors |
| Tracker-free utility anchors | 22 on 20 pages | Direct and outside this tracker; no tracker added |

The nine pilot placements plus the reduced new campaign do not provide
whole-site AppsFlyer attribution. GA click intent on a direct link remains a
web observation and does not become an AppsFlyer attributed install.

QR images, native Safari Smart App Banners, tracker-free compose/verify utilities
and TikTok iOS automatic redirects remain outside this anchor expansion. QR
assets are unchanged. Native banner taps and scans on another device do not
emit a DOM click on the source page. Placements include hidden/responsive
source duplicates and do not measure user exposure.

Use `node scripts/site-route-inventory.mjs --summary-only` for final offline
predicate evidence. It reads public source files and runs the tracker against
detached anchor mocks without provider access or event delivery. The earlier
7,452-conversion inventory predates the direct-retention fix and must not be
used as the final rollout scope.

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
Desktop HTTP checks on 2026-10-17 showed own-app arrival while dropping
`ct`/`pt` and `see-all=reviews`; the tested CPP ID survived. Both bare US URL
forms redirected to the JP storefront, unlike their direct URLs. The bare JP
URL reached the same final URL as the direct route with HTTP 200. These
observations are limited to those requests and do not establish installed-device
behavior or event receipt.
The revised site retains Apple attribution parameters, reference destinations
and non-JP storefronts by leaving their original hrefs direct. Provider
allowlist settings are unchanged. No alternate encoding or proxy redirect is
used to bypass them. Final candidate routing still needs verification. See
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

The ten language privacy pages retain direct App Store search as an
alternative. The revised candidate also preserves the direct links described
above, but the presence of another link on the page is not a general promise
that it avoids OneLink. The tracker does not itself suppress rewriting or
queue insertion in response to consent-denied queues, GA-disable, GPC or DNT;
actual collector delivery under those signals remains unverified. No app-side
consent or ATT behavior is certified by this website change. The waived pilot
device tests and Apple/iOS work are not resumed.

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
served revision and route scope, then report collector event receipt separately.
A dataLayer entry alone is not a GA4 or AppsFlyer receipt. Local tests and a PR state alone do not prove
deployment or successful provider attribution. Until those operations are
completed and verified, report them as pending and keep `rollout_start: null`.
Record the actual start time and deployed SHA after deployment readback.
Collection dispatch, account changes, new installations and Apple/iOS work
remain outside this release task; the waived device tests are not resumed.
