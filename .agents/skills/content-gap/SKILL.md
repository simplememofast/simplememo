---
name: content-gap
description: Find SimpleMemo content gaps from existing GSC analysis, coverage queues, mentions and AI visibility.
---

# content-gap

Apply only to SimpleMemo / simplememofast.com. Work from the current reviewed SimpleMemo checkout, preserving unrelated user changes.

Read `docs/autonomy/OPERATING_RUNBOOK.md` in that checkout for canonical paths, safety boundaries, source semantics and execution steps. Private runtime: `~/.config/simplememo/company-os/`.

Run `node scripts/company-os.mjs content-gap` (the existing analyzer), then inspect `growth/content/coverage-queue.json` or the currently referenced coverage/new/refresh queues and active experiments. Verify candidate URLs and current source evidence. Prefer updating a suitable existing page and internal links over duplicating intent. Route implementation through the same Master Loop and existing SEO validation. Preserve measurement windows and schedule follow-up.
