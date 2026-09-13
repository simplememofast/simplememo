---
name: growth-status
description: Show SimpleMemo’s current source-qualified search, app, acquisition, revenue, experiments, anomalies and pipeline health.
---

# growth-status

Apply only to SimpleMemo / simplememofast.com. Work from the current reviewed SimpleMemo checkout, preserving unrelated user changes.

Read `docs/autonomy/OPERATING_RUNBOOK.md` in that checkout for canonical paths, safety boundaries, source semantics and execution steps. Private runtime: `~/.config/simplememo/company-os/`.

Run `node scripts/company-os.mjs growth-status`. Inspect the indicated private source only when needed. Present periods, source freshness and missing data along with KPI, active experiments, latest verified action and next action. AppsFlyer UA LTV, ASC proceeds and GA4 activity are different populations; never add them or call Organic SEO. No raw private data is committed or published.
