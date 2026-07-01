# Captio SERP Rank Log

Monthly tracking of the captio keyword cluster. Baseline: 2026-05-03 (PR #186 deployed). Goal: outrank attnoel.co.jp/blog/from-captio-to-note-to-email/ on the 5 target keywords.

---

## Methodology

- Search tool: WebSearch (US-based Google index). google.co.jp rankings may differ, especially for the bare "captio" keyword which is dominated by Emburse expense software in US results.
- Positions are inferred from result order (1–10 visible per query). "not in top 10" = absent from returned results.
- Target SimpleMemo page: `/captio-alternative/` (JP). Other SimpleMemo URLs are noted when they rank instead.
- Target competitor page: `www.attnoel.co.jp/blog/from-captio-to-note-to-email/`.

---

## 2026-06-01

| Keyword | SimpleMemo pos | attnoel pos | Δ vs last | Notes |
|---|---|---|---|---|
| captio | not in top 10 | not in top 10 | N/A (baseline) | US query dominated by Emburse expense software; JP memo-app context not represented |
| captio 代替 | ~4 (`/en/captio-alternative/`) | ~3 | N/A (baseline) | JP `/captio-alternative/` absent; `/blog/captio-discontinued` also at ~7 |
| captio なくなった | ~1 (`/blog/captio-discontinued`) | ~4 | N/A (baseline) | JP `/captio-alternative/` absent from top 10; blog post leads |
| captio 後継 | ~1 (`/blog/captio-discontinued`) | not in top 10 | N/A (baseline) | JP `/captio-alternative/` absent from top 10; blog post leads |
| captio 使えない | ~1 (`/blog/captio-discontinued`) | not in top 10 | N/A (baseline) | JP `/captio-alternative/` absent from top 10; blog post leads |

**Take:** `/blog/captio-discontinued` is the workhorse — ranking #1 for three high-intent keywords (なくなった, 後継, 使えない) and outranking attnoel on two of them. The PR #186 target page `/captio-alternative/` (JP) has not yet broken into visible rankings for any keyword; for "captio 代替" only the EN variant `/en/captio-alternative/` appears (~4), trailing attnoel (~3) by one position. Next month will show whether JP page authority accumulates post-indexing.

---

## 2026-07-01

| Keyword | SimpleMemo pos | attnoel pos | Δ vs last | Notes |
|---|---|---|---|---|
| captio | not in top 10 | not in top 10 | 0 / 0 | US index dominated by Emburse expense software; JP memo-app context not represented |
| captio 代替 | **1** (`/en/captio-alternative/`) | 3 | SimpleMemo **+3** / attnoel 0 | EN page jumped to #1, now outranking attnoel; JP `/captio-alternative/` still absent; SimpleMemo also appears at ~5, ~7, ~8 (home, /captio/, /blog/) |
| captio なくなった | 1 (`/blog/captio-discontinued`) | 4 | 0 / 0 | Held positions |
| captio 後継 | 1 (`/blog/captio-discontinued`) | not in top 10 | 0 / 0 | EN `/en/captio-alternative/` also appears at ~7 |
| captio 使えない | 1 (`/blog/captio-discontinued`) | **9** | 0 / attnoel **-9 (new entry)** | attnoel entered top 10 for first time at ~9; SimpleMemo holds #1 |

**Take:** SimpleMemo continued to dominate the three high-intent keywords (なくなった, 後継, 使えない) at #1, and the "captio 代替" EN page surged from ~4 to #1 — now clearly outranking attnoel (held at ~3). The JP `/captio-alternative/` page still has no visible top-10 ranking, so the PR #186 structured-data investment has yet to show directly; it may be the EN page benefiting instead. One watch item: attnoel entered the top 10 for "captio 使えない" at ~9 this month (was absent), suggesting it is slowly broadening its footprint across the keyword cluster.
