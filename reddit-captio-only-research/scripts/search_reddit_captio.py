#!/usr/bin/env python3
"""Search Reddit's public JSON endpoints for Captio mentions.

No auth required. Each query hits:
  https://www.reddit.com/search.json?q=<query>&limit=100
  https://www.reddit.com/r/<sub>/search.json?q=Captio&restrict_sr=1

Saves raw JSONL per query under data/raw/.
"""
from __future__ import annotations
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW = REPO_ROOT / "data" / "raw"
RAW.mkdir(parents=True, exist_ok=True)
LOG = REPO_ROOT / "data" / "processed"
LOG.mkdir(parents=True, exist_ok=True)

UA = os.environ.get("REDDIT_USER_AGENT", "captio-research/1.0 by /u/anon-researcher")
HEADERS = {"User-Agent": UA}
SLEEP = 1.5  # seconds between requests

# Per the brief: only Captio-containing queries
QUERIES = [
    "Captio",
    '"Captio app"',
    '"Captio iOS"',
    '"Captio notes"',
    '"Captio email"',
    '"Captio Gmail"',
    '"Captio IFTTT"',
    '"Captio Drafts"',
    '"Captio Pigeon"',
    '"Captio Bear"',
    '"Captio Workflowy"',
    '"Captio GTD"',
    '"Captio alternative"',
    '"Captio replacement"',
    '"Captio discontinued"',
    '"Captio shut down"',
    '"Captio stopped working"',
    '"Captio no longer works"',
    '"app like Captio"',
    '"apps like Captio"',
]

SUBREDDITS = [
    "productivity", "gtd", "ios", "iosapps", "noteapps",
    "shortcuts", "workflow", "bearapp", "Workflowy",
    "ADHD_Programmers", "androidapps", "apple", "iphone",
    "apps", "macapps", "GetDisciplined",
]


def fetch(url: str) -> dict | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 429:
            print(f"  [429] sleeping 30s, then retry once: {url}")
            time.sleep(30)
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.json()
        print(f"  [err] {r.status_code}: {url[:120]}")
        return None
    except Exception as e:
        print(f"  [exc] {e}: {url[:120]}")
        return None


def site_search(query: str, sub: str | None = None) -> list[dict]:
    """One pass against Reddit's JSON search."""
    if sub:
        url = f"https://www.reddit.com/r/{sub}/search.json?q={quote(query)}&restrict_sr=1&limit=100&sort=new"
    else:
        url = f"https://www.reddit.com/search.json?q={quote(query)}&limit=100&sort=new"
    data = fetch(url)
    if not data:
        return []
    children = data.get("data", {}).get("children", [])
    results = []
    for c in children:
        item = c.get("data", {})
        item["_source"] = "reddit_search"
        item["_query"] = query
        item["_subreddit_filter"] = sub or "(all)"
        results.append(item)
    return results


def main() -> int:
    log = {"queries": [], "total": 0, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    out_path = RAW / f"reddit_search_{int(time.time())}.jsonl"
    seen_names = set()

    with out_path.open("w") as out:
        # Pass 1: global search per query
        for q in QUERIES:
            print(f"[search] global: {q}")
            res = site_search(q)
            new = 0
            for item in res:
                name = item.get("name") or item.get("id")
                if name and name not in seen_names:
                    seen_names.add(name)
                    out.write(json.dumps(item, ensure_ascii=False) + "\n")
                    new += 1
            log["queries"].append({"q": q, "sub": "(all)", "raw": len(res), "new": new})
            print(f"  -> {len(res)} raw, {new} new")
            time.sleep(SLEEP)

        # Pass 2: per-subreddit search for "Captio"
        for sub in SUBREDDITS:
            print(f"[search] r/{sub}: Captio")
            res = site_search("Captio", sub=sub)
            new = 0
            for item in res:
                name = item.get("name") or item.get("id")
                if name and name not in seen_names:
                    seen_names.add(name)
                    out.write(json.dumps(item, ensure_ascii=False) + "\n")
                    new += 1
            log["queries"].append({"q": "Captio", "sub": sub, "raw": len(res), "new": new})
            print(f"  -> {len(res)} raw, {new} new")
            time.sleep(SLEEP)

    log["total"] = len(seen_names)
    log["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    log["output"] = str(out_path.relative_to(REPO_ROOT))

    log_path = LOG / "search_reddit_log.json"
    log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2))
    print(f"\n[done] total unique: {log['total']} -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
