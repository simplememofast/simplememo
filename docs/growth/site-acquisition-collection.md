# Website acquisition collection

The existing `company-os collect --analytics` operation now admits the Apple
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
- Apple first-time downloads for the own-site referrer and the two existing
  `web_obsidian_v1` / `web_other_v1` campaigns. Only the joined download-type /
  referrer / campaign rows qualify. Updates, restores and redownloads cannot
  become new acquisitions. Standard and Detailed are separate populations.
- AppsFlyer Organic, QA, unattributed, other attributed, and the exact existing
  owned-web pilot groups. Only `owned_web` + `obsidian_bridge_pilot_v1` enters
  the pilot count. This does not imply whole-site coverage or working SDKs.

The same view appears in `growth-status` and existing daily/weekly/monthly
private reviews. No new recurring owner is required. A fresh API read alone
does not create a business-change notification. The normal collection owner
refreshes these inputs on its existing cadence. As of 2026-10-14 a naturally
scheduled run of that refresh has not been verified, so read each source's
observed date before treating a value as current.

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

AppsFlyer report access and app SDK collection are separate. When this handoff
was implemented (2026-10-06), the reviewed iOS main kept acquisition
measurement stopped pending a purpose-specific consent flow. iOS PR #669
(2026-10-08, released as 5.9.16) restored it: the SDK starts unless the device
denies or restricts tracking or an earlier in-app acquisition refusal is
stored, and the app reports a bounded `acquisition_attribution_received` label
to the API. That still does not produce a site-attributed install count. Only
installs that arrive through the owned-web OneLink pilot link enter the pilot
group above, and no site page carries that link
([Draft PR #1047](https://github.com/simplememofast/simplememo/pull/1047),
[readiness](onelink-pilot-readiness-20260919.md)). Installs from the site's
plain App Store links are normally reported as Organic, mixed with every other
unattributed install. The Apple collection handoff does not depend on the SDK,
and the OneLink pilot's existing physical-test and release requirements still
apply.

Validation: `node --test growth/lib/company-acquisition.test.mjs` covers
missing versus zero, joined dimensions, SDK-independent source classification,
corrupt input, retention and weighted rates. The existing Company regression
suite covers collection locks and bounded retries. Revert the change to stop
the added handoff; existing provider collectors and historical files remain.
