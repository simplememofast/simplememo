#!/usr/bin/env python3
"""Fetch Captio mentions from PullPush.io (Pushshift successor).

API:
  https://api.pullpush.io/reddit/search/submission/?q=Captio&size=500&sort=desc
  https://api.pullpush.io/reddit/search/comment/?q=Captio&size=500&sort=desc

PullPush often returns deleted/removed posts that Reddit's live API has scrubbed,
which is critical for capturing pre-2024 Captio discussion.
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
SLEEP = 1.5

# All single-keyword queries (PullPush handles partial matches reasonably)
QUERIES = ["Captio", "captio app", "captio alternative", "captio ios"]


def fetch(url: str) -> dict | None:
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, timeout=60)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                print(f"  [429] backoff {3 + attempt * 5}s")
                time.sleep(3 + attempt * 5)
                continue
            print(f"  [err] {r.status_code}: {url[:140]}")
            return None
        except Exception as e:
            print(f"  [exc] attempt {attempt}: {e}")
            time.sleep(2)
    return None


def pullpush(endpoint: str, query: str, size: int = 500, before: int | None = None) -> list[dict]:
    """endpoint: 'submission' or 'comment'"""
    base = f"https://api.pullpush.io/reddit/search/{endpoint}/"
    params = f"?q={quote(query)}&size={size}&sort=desc"
    if before:
        params += f"&before={before}"
    url = base + params
    data = fetch(url)
    if not data:
        return []
    return data.get("data", [])


def main() -> int:
    log = {"queries": [], "total": 0, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    out_path = RAW / f"pullpush_{int(time.time())}.jsonl"
    seen_ids = set()

    with out_path.open("w") as out:
        for kind in ("submission", "comment"):
            for q in QUERIES:
                print(f"[pullpush] {kind} q={q!r}")
                # Single page first
                res = pullpush(kind, q, size=500)
                new = 0
                for item in res:
                    item_id = item.get("id")
                    if not item_id:
                        continue
                    key = f"{kind[0]}_{item_id}"
                    if key in seen_ids:
                        continue
                    seen_ids.add(key)
                    item["_source"] = f"pullpush_{kind}"
                    item["_query"] = q
                    item["_kind"] = kind
                    out.write(json.dumps(item, ensure_ascii=False) + "\n")
                    new += 1
                log["queries"].append({"endpoint": kind, "q": q, "raw": len(res), "new": new})
                print(f"  -> {len(res)} raw, {new} new")
                time.sleep(SLEEP)

    log["total"] = len(seen_ids)
    log["finished"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    log["output"] = str(out_path.relative_to(REPO_ROOT))
    log_path = LOG / "pullpush_log.json"
    log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2))
    print(f"\n[done] total unique: {log['total']} -> {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
