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

---

## 2026-08-01

| Keyword | SimpleMemo pos | attnoel pos | Δ vs last | Notes |
|---|---|---|---|---|
| captio | not in top 10 | not in top 10 | 0 / 0 | US index dominated by Emburse/captio.co; JP memo-app context absent |
| captio 代替 | ~5 (`/captio/`) | **~1** | SimpleMemo **−4** / attnoel **+2** | EN `/en/captio-alternative/` disappeared from results; `/captio/` now best SimpleMemo entry; attnoel jumped to #1 from #3 |
| captio なくなった | ~4 (`/blog/captio-discontinued`) | **~2** | SimpleMemo **−3** / attnoel **+2** | Captioo App Store page (apps.apple.com) newly entered at #1, displacing SimpleMemo; attnoel rose from #4 to #2 |
| captio 後継 | ~5 (`/blog/captio-discontinued`) | **~3** | SimpleMemo **−4** / attnoel **new (+top 5)** | note.com and Captioo App Store push SimpleMemo to #5; attnoel entered top 5 (was absent) |
| captio 使えない | ~6 (`/blog/captio-discontinued`) | not in top 10 | SimpleMemo **−5** / attnoel **+9 (dropped out)** | Captioo App Store, older review blogs dominate top 5; attnoel dropped out after entering at ~9 last month |

**Take:** Significant SERP shift this month — SimpleMemo's /blog/captio-discontinued dropped from #1 to #4–6 across the three high-intent keywords it previously led, and the EN /en/captio-alternative/ page that held "captio 代替" #1 last month has vanished from visible results entirely. The primary displacer is the Captioo App Store page (apps.apple.com/jp/app/captioo), which newly appeared in top-2 positions across three keywords. attnoel gained meaningfully: now #1 for "captio 代替", #2 for "captio なくなった", and #3 for "captio 後継". The /captio-alternative/ JP page (PR #186 target) remains absent from all keywords. This pattern across all five queries in the same month is unlikely to be noise — a ranking reset or algorithm update affecting our blog cluster is the most probable cause and warrants investigation.
