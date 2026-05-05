# Methodology — Captio Reddit Research

**Run**: 2026-05-05T00:45:58.667045+00:00

## Data sources used

1. **Reddit public JSON search** (no auth) — `https://www.reddit.com/search.json?q=<query>`
   - 20 keyword queries (Captio-containing only)
   - 16 priority subreddits with `?q=Captio&restrict_sr=1`
2. **PullPush.io** (Pushshift successor) — `https://api.pullpush.io/reddit/search/{submission,comment}/`
   - 4 keyword queries × 2 endpoints = 8 calls

## Rate limiting

- 1.5s sleep between requests
- Auto-retry on 429 with exponential backoff
- User-Agent header set per Reddit's requirements

## Filtering rules

- **MUST contain** `\bcaptio\b` (case-insensitive) in title OR body
- Excluded: peripheral topics (email-yourself / quick-capture / GTD inbox / SimpleMemo) without Captio mention
- Deduped by `(type, id)` and by `permalink`

## Scoring (per PLAN.md)

| Rule | Δ |
|---|---|
| Direct Captio mention | +60 |
| Alternative/replacement context | +50 |
| Shutdown context | +50 |
| Strong praise | +40 |
| Specific usage description | +35 |
| Competitor co-mention | +30 |
| Workflow/GTD context | +25 |
| Solution-seeking phrases | +20 |
| Friction complaint | +15 |
| High engagement (score≥5 or comments≥10) | +10 |
| Very short body (<60 chars) | -20 |
| Spam markers | -20 |

## Limitations

- **No Reddit API auth** (Reddit deprecated self-service tokens 2025-11). Public JSON has lower limits than authenticated.
- **No archive.org Wayback** in MVP — would add 50-150 deleted posts
- **No HackerNews/Twitter cross-reference** — additional Captio mentions exist outside Reddit
- **No comment-tree snowball expansion** — found posts' comments not all retrieved

## Reproduction

```
cd reddit-captio-only-research
pip install -r requirements.txt
export REDDIT_USER_AGENT="captio-research/1.0 by /u/<your-username>"
python scripts/search_reddit_captio.py
python scripts/fetch_pullpush.py
python scripts/process_pipeline.py
```

Outputs:
- `data/exports/reddit_captio_only_ranked.csv`
- `reports/reddit_captio_only_insights.md`
- `reports/reddit_captio_only_subreddit_map.md`
- `data/processed/summary.json`
