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
refreshes these inputs on its existing cadence.

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

AppsFlyer report access and app SDK collection are separate. At implementation
time the reviewed iOS main keeps acquisition measurement disabled pending its
own purpose-specific consent flow. Re-enabling it or changing app privacy
declarations is not necessary for this Apple collection handoff. The OneLink
pilot's existing physical-test and release requirements still apply.

Validation: `node --test growth/lib/company-acquisition.test.mjs` covers
missing versus zero, joined dimensions, SDK-independent source classification,
corrupt input, retention and weighted rates. The existing Company regression
suite covers collection locks and bounded retries. Revert the change to stop
the added handoff; existing provider collectors and historical files remain.
