---
name: autonomy-audit
description: Audit SimpleMemo’s operating coverage, manual handoffs, report-only jobs, duplicates, reliability and missing follow-up.
---

# autonomy-audit

Apply only to SimpleMemo / simplememofast.com. Work from the current reviewed SimpleMemo checkout, preserving unrelated user changes.

Read `docs/autonomy/OPERATING_RUNBOOK.md` in that checkout for canonical paths, safety boundaries, source semantics and execution steps. Private runtime: `~/.config/simplememo/company-os/`.

Run `python3 scripts/company-discover.py`, then `node scripts/company-os.mjs autonomy-audit`. Inspect the private registry, source timestamps, existing fault owners, 203-task ledger and actual run receipts. Verify gaps before recommending a change; absence from an accessible source is not proof that a remote job does not exist. Do not stop or replace any job without parity and rollback evidence. For requested fixes, continue through the Master Loop in the operating runbook.
