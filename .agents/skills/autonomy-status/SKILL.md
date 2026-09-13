---
name: autonomy-status
description: Show SimpleMemo’s exact existing autonomy metrics, fixed-cohort delta, recorded human touches, cost, failures and next opportunity.
---

# autonomy-status

Apply only to SimpleMemo / simplememofast.com. Work from the current reviewed SimpleMemo checkout, preserving unrelated user changes.

Read `docs/autonomy/OPERATING_RUNBOOK.md` in that checkout for canonical paths, safety boundaries, source semantics and execution steps. Private runtime: `~/.config/simplememo/company-os/`.

Run `node scripts/company-os.mjs autonomy-status`, then `node scripts/company-os.mjs autonomy-audit`. Report current / baseline / delta and whether comparison is valid. Distinguish execution coverage, completion rate and the 100-point instrument. Mention real newly transferred tasks, unknown touch dimensions, cost coverage, active failures and the highest-value next action. Do not change state or count ceilings as achieved performance.
