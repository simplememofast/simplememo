# Reddit 1-Click Prefill — Operations Manual

**Path**: `https://simplememofast.com/admin/reddit/`
**Status**: L1 MVP (Phase 1)
**Updated**: 2026-05-05

---

## What this is

A static HTML admin page that takes the 100+ engagement contexts in `docs/cross-platform-engagement/` and turns each Reddit / HackerNews thread draft into a **1-click prefill workflow**:

1. Click **Prepare** on a draft card
2. Pick `v1` / `v2` / `v3`, edit the body if needed (live lint)
3. Click **Copy + Open Reddit** → body lands in clipboard, thread opens in new tab
4. Paste, submit on Reddit
5. Come back, paste your comment URL → admin generates a markdown log entry to paste into `docs/outreach-log.md`

Auto-posting is **strictly forbidden** by design. Every send is human-driven.

---

## Architecture (intentionally minimal)

| Layer | Implementation |
|---|---|
| Frontend | Static HTML + vanilla JS (no React/Next.js) |
| Auth | **Pages Functions middleware** (`functions/admin/_middleware.js`) — Basic Auth gate over all `/admin/*` paths. Username/password hardcoded; cookie `admin_auth=ok_*` set after login (Path=/admin, 24h). Same gate protects `drafts.json` and any future API endpoints. |
| Data source | `admin/reddit/drafts.json` (built from `docs/cross-platform-engagement/`) |
| Cadence enforcement | localStorage (1/day, 3/week, 14d/sub). Bypassable by clearing browser data — fine for solo operation. |
| Lint | 10 rules (L01–L10) computed both at build time (in JSON) and live in the modal |
| Posted log | Markdown entry generated client-side, copied to clipboard, manually pasted into `docs/outreach-log.md` and committed. The git history is the system of record. |

What's NOT here (intentionally — these were in the brief but require a server):
- D1 database
- Cloudflare Workers / Pages Functions
- 24h/7d/30d auto-refresh of upvotes (implement as GitHub Actions cron later if needed)
- Server-side cadence re-check at /posted submit

---

## Refreshing draft data

When `docs/cross-platform-engagement/01-priority-P0-drafts.md` or `02-priority-P1-drafts.md` is edited, regenerate the JSON:

```bash
cd /Users/hajimeataka/simplememo
python3 scripts/build_admin_drafts.py
```

This writes `admin/reddit/drafts.json`. Commit it.

---

## Cadence rules (hardcoded)

| Rule | Value |
|---|---|
| `per_day_max` | 1 post per day |
| `per_week_max` | 3 posts per week (rolling 7 days) |
| `per_subreddit_min_days` | 14 days between posts to the same subreddit |

To change: edit `admin/reddit/index.html` (look for `STATE.cadenceRules`) and `scripts/build_admin_drafts.py` (look for `cadence_rules`).

---

## Lint rules

| ID | Rule | Severity | Implementation |
|---|---|---|---|
| L01 | Body contains "Captio" (case-insensitive) | 🔴 red | regex |
| L02 | Body contains "Disclosure" or 開発者/提携関係 | 🔴 red | regex |
| L03 | Mentions Drafts/Pigeon/Apple Notes/Shortcuts/Braintoss/EmailMe | 🟡 yellow | array |
| L04 | Honest weakness or bias disclosure (iOS-only / subscription / "I'm the dev") | 🟡 yellow | heuristic regex |
| L05 | NO forbidden EN superlatives (best/perfect/amazing/awesome) | 🔴 red | regex |
| L06 | NO forbidden JA push phrases (ぜひ/使ってください/無料です) | 🔴 red | regex |
| L07 | If link present, UTM tracking complete (`utm_source=...&utm_content=...`) | 🔴 red | regex |
| L08 | Word count 100–200 (yellow at 80–100 / 200–220, red <80 or >220) | varies | counter |
| L09 | If link present, subreddit `link_ok=true` policy match | 🟡 yellow | frontmatter |
| L10 | If `necro=true`, body contains "future readers" / "landing here" | 🟡 yellow | regex |

L11 (n-gram similarity vs past 30 posts) is **NOT implemented** in MVP — review manually.

---

## Daily workflow

```
1. Open https://simplememofast.com/admin/reddit/
   → Login page appears (existing /admin auth)
   → Enter credentials → cookie set for 24h, all /admin/* paths
     (including drafts.json) become accessible
2. Top bar shows: Today 0/1, Week 0/3, Drafts available
3. Find a green card (cadence_eligible + lint_red=0)
4. Click "Prepare"
5. Pick v1/v2/v3 in tabs
6. Read body, customize 2–3 phrases for thread context
7. All red lints must be 0 (button stays disabled otherwise)
8. Click "Copy + Open Reddit"
   → body goes to clipboard
   → thread opens in new tab
9. On Reddit: paste, submit
10. Back to admin: copy your comment permalink, paste in URL field
11. Click "Confirm + Generate log entry"
12. Click "Copy log entry"
13. Open docs/outreach-log.md in editor, paste, commit:
    git add docs/outreach-log.md
    git commit -m "log: posted P0-XX to r/<sub>"
    git push
14. Set 24h reminder (manually or via /loop) to check engagement
```

---

## Skipping a draft

Click "Skip" in the modal. The draft is hidden until localStorage is cleared.
For permanent skip, edit `docs/cross-platform-engagement/_skipped.md` and remove the entry from the priority files.

---

## Resetting cadence (e.g., for testing)

Open browser DevTools console:

```javascript
localStorage.removeItem('captio_outreach_log');
localStorage.removeItem('captio_skipped');
location.reload();
```

This clears the local log. The git-committed `docs/outreach-log.md` is the authoritative record.

---

## Adding a new draft

1. Add a new entry to `docs/cross-platform-engagement/01-priority-P0-drafts.md` or `02-priority-P1-drafts.md` following the existing structure (`## P0-XX — Title` heading, **URL** / **OP context** / version `### Draft v1` blocks).
2. Run `python3 scripts/build_admin_drafts.py`.
3. Commit `admin/reddit/drafts.json`.

---

## Future work (not in MVP)

- [x] ~~Auth gate~~ — already in place via `functions/admin/_middleware.js`
- [ ] GitHub Actions cron: 24h after each posted entry, fetch the comment via PullPush and update `outreach-log.md` with upvotes/comments
- [ ] Server-side cadence re-check (Pages Functions + KV) — would persist past localStorage clears
- [ ] 7d / 30d aggregation
- [ ] L11 n-gram similarity check (compare each new draft body against the last 30 posted bodies)
- [ ] Slack / email reminder when 24h check is due
- [ ] Integration with App Store Connect campaign data
