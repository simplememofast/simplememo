#!/usr/bin/env python3
"""Build admin/reddit/drafts.json from docs/cross-platform-engagement/.

Extracts Reddit + HN thread contexts (where the engagement method is comment
and a full draft is present) into a single JSON file the admin UI can fetch
client-side. Includes lint signals computed at build time.

Also pre-fetches the archive/locked status of each Reddit thread via the
public .json endpoint so the admin UI can grey out un-postable cards.

Run:
    python3 scripts/build_admin_drafts.py
    python3 scripts/build_admin_drafts.py --skip-archive-check  # offline mode
"""
from __future__ import annotations
import argparse
import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parent.parent
SRC_DIR = REPO / "docs" / "cross-platform-engagement"
OUT = REPO / "admin" / "reddit" / "drafts.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Subreddit policy hints derived from reports/reddit_captio_only_subreddit_map.md
SUB_POLICY = {
    "productivity": {"self_promo": "strict", "link_ok": False},
    "apple": {"self_promo": "moderate", "link_ok": False},
    "shortcuts": {"self_promo": "moderate", "link_ok": True},
    "ADHD_Programmers": {"self_promo": "moderate", "link_ok": True},
    "gtd": {"self_promo": "moderate", "link_ok": True},
    "iosapps": {"self_promo": "strict", "link_ok": False},
    "hackernews": {"self_promo": "strict", "link_ok": False},
    "macrumors": {"self_promo": "moderate", "link_ok": False},
}

# Forbidden words that must NOT appear (L05 / L06)
FORBIDDEN_EN = re.compile(
    r"\b(best|perfect|amazing|awesome|the only|sign up now|click here|try it free)\b",
    re.IGNORECASE,
)
FORBIDDEN_JA = re.compile(
    r"(ぜひ|使ってください|無料です|今すぐ)",
)
ALT_APPS = re.compile(
    r"\b(Drafts|Pigeon|Apple Notes|Shortcuts|Braintoss|EmailMe|Email Me|Note to Self Mail)\b",
    re.IGNORECASE,
)
HONESTY_HINTS = re.compile(
    r"(iOS-only|iOS only|subscription|disclosure|i'm the dev|i built|author bias|"
    r"text-only|by design|imperfect|trade-?off)",
    re.IGNORECASE,
)
UTM_OK = re.compile(
    r"utm_source=[\w-]+[\s\S]{0,200}?utm_content=([a-zA-Z0-9_-]+)",
    re.IGNORECASE,
)
LINK_RE = re.compile(r"https?://[^\s)\]\"]+", re.IGNORECASE)
DISCLOSURE_RE = re.compile(
    r"(?i)\bdisclosure\b|開発者|提携(?:関係|・|なし|・公式)|非提携|公認関係|スポンサーシップ|"
    r"affiliated with|株式会社ユリカ"
)
CAPTIO_RE = re.compile(r"\bcaptio\b", re.IGNORECASE)

USER_AGENT = os.environ.get(
    "REDDIT_USER_AGENT",
    "captio-research/1.0 (admin draft build script)"
)


def fetch_reddit_thread_status(thread_url: str) -> dict:
    """Fetch a Reddit thread's .json endpoint and return archive/locked status.

    Returns dict:
        - checked: bool — did we successfully fetch
        - archived: bool — Reddit's archived flag
        - locked: bool — comments locked
        - score: int — current upvote count of OP
        - num_comments: int
        - created_utc: int — when thread was posted (for age computation)
        - error: str — populated on failure
    """
    # Extract thread ID from URL: .../comments/<id>/[title/[comment-id/]]
    m = re.search(r"reddit\.com/r/([\w-]+)/comments/([a-z0-9]+)", thread_url)
    if not m:
        return {"checked": False, "error": "url_not_reddit_thread"}
    sub = m.group(1)
    thread_id = m.group(2)
    json_url = f"https://www.reddit.com/r/{sub}/comments/{thread_id}.json"

    try:
        req = Request(json_url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                return {"checked": False, "error": f"http_{resp.status}"}
            data = json.loads(resp.read().decode("utf-8"))
        # data[0] is the post listing, data[1] is the comments listing
        post = data[0]["data"]["children"][0]["data"]
        return {
            "checked": True,
            "archived": bool(post.get("archived", False)),
            "locked": bool(post.get("locked", False)),
            "score": int(post.get("score", 0) or 0),
            "num_comments": int(post.get("num_comments", 0) or 0),
            "created_utc": int(post.get("created_utc", 0) or 0),
            "subreddit": post.get("subreddit", sub),
        }
    except HTTPError as e:
        return {"checked": False, "error": f"http_{e.code}"}
    except URLError as e:
        return {"checked": False, "error": f"url_error_{e.reason}"}
    except (json.JSONDecodeError, KeyError, IndexError) as e:
        return {"checked": False, "error": f"parse_error_{type(e).__name__}"}
    except Exception as e:
        return {"checked": False, "error": f"exception_{type(e).__name__}"}


def word_count(text: str) -> int:
    """Approximate word count. For Japanese, count characters / 2."""
    if re.search(r"[぀-ヿ一-鿿]", text):
        return len(re.sub(r"\s+", "", text)) // 2 or len(text.split())
    return len(text.split())


def lint(body: str, has_link: bool, sub_link_ok: bool, necro: bool, platform: str = "reddit") -> dict:
    """Apply 10 rules (L01-L10). Returns {checks: [...], red: int, yellow: int}."""
    checks = []
    is_japanese = bool(re.search(r"[぀-ヿ一-鿿]", body))
    is_long_form = platform in {"blog", "email"}  # emails / blog contact forms expect longer

    # L01: Captio mention (red)
    has_captio = bool(CAPTIO_RE.search(body))
    checks.append({
        "id": "L01", "name": "Captio mention", "level": "red",
        "passed": has_captio,
    })

    # L02: Disclosure (red)
    has_disclosure = bool(DISCLOSURE_RE.search(body))
    checks.append({
        "id": "L02", "name": "Disclosure present", "level": "red",
        "passed": has_disclosure,
    })

    # L03: At least one alternative app (yellow)
    has_alt = bool(ALT_APPS.search(body))
    checks.append({
        "id": "L03", "name": "Alternative app co-mention", "level": "yellow",
        "passed": has_alt,
    })

    # L04: Honesty / weakness (yellow)
    has_honesty = bool(HONESTY_HINTS.search(body))
    checks.append({
        "id": "L04", "name": "Honest weakness or disclosure of bias", "level": "yellow",
        "passed": has_honesty,
    })

    # L05: No forbidden EN superlatives (red)
    bad_en = FORBIDDEN_EN.search(body)
    checks.append({
        "id": "L05", "name": "No forbidden English superlatives",
        "level": "red", "passed": not bad_en,
        "matched": bad_en.group(0) if bad_en else None,
    })

    # L06: No forbidden JA push phrases (red)
    bad_ja = FORBIDDEN_JA.search(body)
    checks.append({
        "id": "L06", "name": "No forbidden Japanese push phrases",
        "level": "red", "passed": not bad_ja,
        "matched": bad_ja.group(0) if bad_ja else None,
    })

    # L07: UTM if link (red)
    has_utm = bool(UTM_OK.search(body))
    utm_ok = (not has_link) or has_utm
    checks.append({
        "id": "L07", "name": "UTM completeness when link present",
        "level": "red", "passed": utm_ok,
    })

    # L08: word count thresholds depend on platform/language
    wc = word_count(body)
    if is_long_form:
        # emails / blog comments: 100-500 words OK
        lo_yellow, lo_red = 80, 50
        hi_yellow, hi_red = 600, 800
    elif is_japanese:
        # JA reddit-comment-style: 80-300 char-based units
        lo_yellow, lo_red = 60, 40
        hi_yellow, hi_red = 320, 450
    else:
        # EN reddit/HN comment: 100-200 words
        lo_yellow, lo_red = 100, 80
        hi_yellow, hi_red = 200, 220
    if wc < lo_red or wc > hi_red:
        wc_status = "red"
    elif wc < lo_yellow or wc > hi_yellow:
        wc_status = "yellow"
    else:
        wc_status = "ok"
    checks.append({
        "id": "L08", "name": f"Word count in range (current: {wc})",
        "level": "yellow" if wc_status == "yellow" else "red",
        "passed": wc_status == "ok",
        "value": wc,
    })

    # L09: Sub link policy (yellow)
    link_policy_ok = (not has_link) or sub_link_ok
    checks.append({
        "id": "L09", "name": "Subreddit link policy compatible",
        "level": "yellow", "passed": link_policy_ok,
    })

    # L10: Necro post must mention "future readers" (yellow)
    if necro:
        has_future = bool(re.search(r"future readers?|future searchers?|landing here", body, re.IGNORECASE))
        checks.append({
            "id": "L10", "name": "Necro post mentions 'future readers'",
            "level": "yellow", "passed": has_future,
        })
    else:
        checks.append({
            "id": "L10", "name": "Necro post check (n/a)",
            "level": "yellow", "passed": True,
        })

    red_failures = sum(1 for c in checks if c["level"] == "red" and not c["passed"])
    yellow_failures = sum(1 for c in checks if c["level"] == "yellow" and not c["passed"])

    return {
        "checks": checks,
        "red": red_failures,
        "yellow": yellow_failures,
        "passed": red_failures == 0,
    }


def parse_p0_file(path: Path, results: list[dict]) -> None:
    """Parse 01-priority-P0-drafts.md — has 3 versions per draft."""
    text = path.read_text()

    # Each P0 section starts with "## P0-NN — <title>"
    sections = re.split(r"^## (P0-\d{2}) — (.+?)$", text, flags=re.MULTILINE)
    # sections = [preamble, "P0-01", "title1", body1, "P0-02", ...]

    for i in range(1, len(sections), 3):
        sid = sections[i]
        title = sections[i + 1].strip()
        body = sections[i + 2]

        url_m = re.search(r"\*\*(?:Thread )?URL\*\*:\s*(\S+)", body)
        if not url_m:
            continue
        url = url_m.group(1)

        # Subreddit detection
        sub = "unknown"
        sub_m = re.search(r"reddit\.com/r/([\w-]+)/", url)
        if sub_m:
            sub = sub_m.group(1)

        thread_id_m = re.search(r"reddit\.com/r/[\w-]+/comments/([a-z0-9]+)/", url)
        thread_id = thread_id_m.group(1) if thread_id_m else sid.lower()

        # Necro?
        necro = "Necro warning**: YES" in body or "necro" in body.lower()

        # Extract v1, v2, v3 by splitting on "### Draft v"
        version_parts = re.split(r"^### Draft v(\d)\b[^\n]*\n", body, flags=re.MULTILINE)
        versions = {}
        for j in range(1, len(version_parts), 2):
            vnum = version_parts[j]
            vbody = version_parts[j + 1]
            # Cut at next "###" or "---" before checklist
            vbody = re.split(r"^### |^## Pre-flight|^---\s*$", vbody, flags=re.MULTILINE)[0]
            vbody = vbody.strip()

            has_link = bool(LINK_RE.search(vbody))
            policy = SUB_POLICY.get(sub, {"self_promo": "moderate", "link_ok": True})
            lint_result = lint(vbody, has_link, policy["link_ok"], necro, platform="note" if "note.com" in url else ("blog" if "attnoel" in url or "@" in url else "reddit"))

            utm_match = UTM_OK.search(vbody)
            versions[f"v{vnum}"] = {
                "body": vbody,
                "has_link": has_link,
                "word_count": word_count(vbody),
                "utm_content": utm_match.group(1) if utm_match else None,
                "lint": lint_result,
            }

        results.append({
            "id": sid,
            "title": title,
            "thread_url": url,
            "subreddit": sub,
            "thread_id": thread_id,
            "priority": 0,
            "necro": necro,
            "sub_policy": SUB_POLICY.get(sub, {"self_promo": "moderate", "link_ok": True}),
            "language": "ja" if sub in {} or "/note.com" in url or "attnoel" in url else "en",
            "platform": "note" if "note.com" in url else "blog" if "attnoel" in url else "reddit",
            "versions": versions,
        })


def parse_p1_file(path: Path, results: list[dict]) -> None:
    """Parse 02-priority-P1-drafts.md — has 1 detailed draft per context."""
    text = path.read_text()

    # Sections: "## P1-NN — <title>"
    sections = re.split(r"^## (P1-\d{2}) — (.+?)$", text, flags=re.MULTILINE)

    for i in range(1, len(sections), 3):
        sid = sections[i]
        title = sections[i + 1].strip()
        body = sections[i + 2]

        url_m = re.search(r"\*\*URL\*\*:\s*(\S+)", body)
        if not url_m:
            continue
        url = url_m.group(1)

        # Skip non-Reddit / non-HN unless it's a comment-able forum
        is_reddit = "reddit.com" in url
        is_hn = "news.ycombinator.com" in url
        if not (is_reddit or is_hn):
            # Still include but mark differently — skip for admin V1 unless comment method
            continue

        sub = "hackernews" if is_hn else "unknown"
        if is_reddit:
            sub_m = re.search(r"reddit\.com/r/([\w-]+)/", url)
            if sub_m:
                sub = sub_m.group(1)

        thread_id = sid.lower()
        if is_reddit:
            tm = re.search(r"reddit\.com/r/[\w-]+/comments/([a-z0-9]+)/", url)
            if tm:
                thread_id = tm.group(1)

        necro = "Necro" in body and "YES" in body

        # Extract single draft (after "### Draft" heading) — use same pattern as P0
        draft_m = re.search(r"### Draft[^\n]*\n(.*)", body, flags=re.DOTALL)
        if not draft_m:
            continue
        vbody = draft_m.group(1)
        # Cut at first standalone "---" (separator) or next "## " heading or "### " sub-heading
        vbody = re.split(r"^---\s*$|^## |^### ", vbody, flags=re.MULTILINE)[0]
        vbody = vbody.strip()

        has_link = bool(LINK_RE.search(vbody))
        policy = SUB_POLICY.get(sub, {"self_promo": "moderate", "link_ok": True})
        lint_result = lint(vbody, has_link, policy["link_ok"], necro, platform="hackernews" if is_hn else "reddit")
        utm_match = UTM_OK.search(vbody)

        versions = {
            "v1": {
                "body": vbody,
                "has_link": has_link,
                "word_count": word_count(vbody),
                "utm_content": utm_match.group(1) if utm_match else None,
                "lint": lint_result,
            }
        }

        results.append({
            "id": sid,
            "title": title,
            "thread_url": url,
            "subreddit": sub,
            "thread_id": thread_id,
            "priority": 1,
            "necro": necro,
            "sub_policy": policy,
            "language": "en",
            "platform": "hackernews" if is_hn else "reddit",
            "versions": versions,
        })


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-archive-check", action="store_true",
                        help="Skip Reddit .json fetch (offline mode)")
    args = parser.parse_args()

    results: list[dict] = []
    parse_p0_file(SRC_DIR / "01-priority-P0-drafts.md", results)
    parse_p1_file(SRC_DIR / "02-priority-P1-drafts.md", results)

    # Filter: keep only entries with at least one version
    results = [r for r in results if r["versions"]]

    # Archive / locked detection for Reddit threads
    if args.skip_archive_check:
        print("[info] --skip-archive-check: not fetching Reddit thread status")
        for r in results:
            r["thread_status"] = {"checked": False, "skipped": True}
    else:
        print(f"[info] checking archive/locked status for {sum(1 for r in results if r['platform'] == 'reddit')} Reddit threads...")
        for r in results:
            if r["platform"] == "reddit":
                status = fetch_reddit_thread_status(r["thread_url"])
                r["thread_status"] = status
                if status.get("checked"):
                    flags = []
                    if status.get("archived"): flags.append("ARCHIVED")
                    if status.get("locked"): flags.append("LOCKED")
                    flag_str = " ".join(flags) if flags else "open"
                    age_d = (time.time() - status.get("created_utc", 0)) / 86400 if status.get("created_utc") else 0
                    print(f"  [{flag_str:>16}] {r['id']:<8} (age={age_d:.0f}d, score={status.get('score', 0)}, comments={status.get('num_comments', 0)})")
                else:
                    print(f"  [        unknown] {r['id']:<8} ({status.get('error', 'unknown')})")
                time.sleep(1.5)  # be polite to Reddit
            else:
                r["thread_status"] = {"checked": False, "platform": r["platform"]}

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total": len(results),
        "drafts": results,
        "cadence_rules": {
            "per_day_max": 1,
            "per_week_max": 3,
            "per_subreddit_min_days": 14,
        },
    }

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n[ok] wrote {len(results)} drafts -> {OUT.relative_to(REPO)}")
    print("\nDraft summary:")
    for r in results:
        ts = r.get("thread_status", {})
        flag = ""
        if ts.get("archived"): flag = " 🔒 ARCHIVED"
        elif ts.get("locked"): flag = " 🔒 LOCKED"
        print(f"  {r['id']:<8} {r['platform']:<10} r/{r['subreddit']:<24} versions={list(r['versions'].keys())}{flag}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
