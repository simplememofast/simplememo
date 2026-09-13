---
name: growth-audit
description: Audit SimpleMemo’s integrated Growth sources, SEO/AIO evidence, experiment gates and action loops.
---

# growth-audit

Apply only to SimpleMemo / simplememofast.com. Work from the current reviewed SimpleMemo checkout, preserving unrelated user changes.

Read `docs/autonomy/OPERATING_RUNBOOK.md` in that checkout for canonical paths, safety boundaries, source semantics and execution steps. Private runtime: `~/.config/simplememo/company-os/`.

Run `node scripts/company-os.mjs growth-audit`, `growth-status`, `content-gap` and `aio-audit`. Reuse the installed seo-audit skill and prior audit evidence where relevant; inspect current pages before diagnosing a changed result. Check GSC/GA4/ASC/AppsFlyer date and population compatibility, report-only handoffs, active experiment overlaps, unresolved failures and follow-up. Rank business and autonomy impact separately. Execute requested safe fixes through the same operating runbook rather than creating another master system.
