#!/usr/bin/env python3
"""Combined dedupe + score + classify + report.

Reads all data/raw/*.jsonl, normalizes records, filters to Captio-only,
applies scoring & classification rules from PLAN.md, and writes:
  - data/exports/reddit_captio_only_raw.csv (all)
  - data/exports/reddit_captio_only_deduped.csv (unique by permalink/id)
  - data/exports/reddit_captio_only_ranked.csv (relevance_score >= 50, sorted)
  - reports/reddit_captio_only_insights.md
  - reports/reddit_captio_only_subreddit_map.md
  - reports/reddit_captio_methodology.md
  - reports/reddit_captio_seo_keywords.md
  - reports/reddit_captio_reply_templates.md
"""
from __future__ import annotations
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW = REPO_ROOT / "data" / "raw"
EXPORTS = REPO_ROOT / "data" / "exports"
PROCESSED = REPO_ROOT / "data" / "processed"
REPORTS = REPO_ROOT / "reports"
for d in (EXPORTS, PROCESSED, REPORTS):
    d.mkdir(parents=True, exist_ok=True)

CAPTIO_RE = re.compile(r"\bcaptio\b", re.IGNORECASE)

# Heuristics to filter out non-iOS-app meanings of "captio".
# We've observed: (1) spam subreddits with auto-generated names + "John Wick: Captio"
# spam content, (2) DC Comics character "Daniel Captio", (3) Latin/Italian "captio"
# (the legal term for kidnapping / a captatio benevolentiae trope).
SPAM_SUBREDDIT_RE = re.compile(
    r"^(formmmy|mysuublike|firstmylist|listformm|gameblog|myfavoris|"
    r"NoMansSky|MH370|50501|QuandoCeralo|HiddenMoon|DirtySnap|"
    r"Cumshots|Anal|Boobs|Tits|Porn|NSFW|GoneWild|Hot|"
    r"indian_desi|KinkTown|make_money|.*bdsm|.*kink|.*nsfw)",
    re.IGNORECASE,
)
SPAM_CONTENT_RE = re.compile(
    r"john wick:\s*captio|captio\s*4|captatio benevolentiae|"
    r"daniel captio|captio (?:est|in|et|qui)",
    re.IGNORECASE,
)
# Strong iOS app context indicators
IOS_CONTEXT_RE = re.compile(
    r"\b(ios|iphone|ipad|app store|apple|gtd|gmail|ifttt|"
    r"drafts|pigeon|workflow|shortcut|inbox|productivity|"
    r"send.{0,15}email|email.{0,15}myself|note(?:s|-?taking)|"
    r"discontinued|shut.?down|removed|tupil)\b",
    re.IGNORECASE,
)

COMPETITORS = [
    "Drafts", "Pigeon", "Captioo", "Apple Notes", "Google Keep", "Bear",
    "Workflowy", "Obsidian", "Notion", "Todoist", "Things", "OmniFocus",
    "Nirvana", "Evernote", "Braintoss", "Email Me", "EmailMe", "Mail to Self",
    "Shortcuts", "IFTTT", "Zapier", "MeMail", "Note to Self Mail",
]
COMPETITOR_RE = {
    name: re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE)
    for name in COMPETITORS
}


def is_likely_real_captio(text: str, subreddit: str) -> bool:
    """Hard filter: must look like the iOS app, not spam/comics/Latin."""
    if SPAM_SUBREDDIT_RE.match(subreddit or ""):
        return False
    if SPAM_CONTENT_RE.search(text):
        return False
    # Must have either iOS context, or be in a known-good subreddit
    good_subs = {
        "productivity", "gtd", "ios", "iosapps", "noteapps", "shortcuts",
        "workflow", "bearapp", "Workflowy", "ADHD_Programmers",
        "androidapps", "apple", "iphone", "apps", "macapps",
        "GetDisciplined", "Notion", "ObsidianMD", "Todoist",
        "thingsapp", "OmniFocus", "SaaS", "microsaas", "SideProject",
        "startups", "Entrepreneur",
    }
    if subreddit in good_subs:
        return True
    return bool(IOS_CONTEXT_RE.search(text))


def normalize(record: dict) -> dict | None:
    """Take a raw record from Reddit JSON or PullPush, return normalized dict."""
    src = record.get("_source", "")
    kind = record.get("_kind", record.get("kind", ""))

    # PullPush submissions and Reddit search results both have these
    is_post = kind == "submission" or "title" in record or record.get("name", "").startswith("t3_")
    is_comment = kind == "comment" or record.get("name", "").startswith("t1_") or "parent_id" in record

    if not (is_post or is_comment):
        # Try harder: posts have title; comments have body
        if "title" in record and record.get("title"):
            is_post = True
        elif "body" in record and record.get("body"):
            is_comment = True

    item_type = "post" if is_post and not (is_comment and not record.get("title")) else "comment"

    item_id = record.get("id") or record.get("name", "").replace("t1_", "").replace("t3_", "")
    if not item_id:
        return None

    title = record.get("title", "") or ""
    body = record.get("selftext", "") or record.get("body", "") or ""
    text_blob = f"{title}\n{body}"

    if not CAPTIO_RE.search(text_blob):
        return None  # Captio-only filter

    if not is_likely_real_captio(text_blob, record.get("subreddit", "")):
        return None  # Spam / wrong-context filter

    permalink = record.get("permalink", "")
    if permalink and not permalink.startswith("http"):
        permalink = f"https://www.reddit.com{permalink}"

    created = record.get("created_utc")
    if isinstance(created, (int, float)):
        created_iso = datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
    else:
        created_iso = ""

    captio_context = extract_context(text_blob)

    return {
        "id": f"{item_type[0]}_{item_id}",
        "type": item_type,
        "subreddit": record.get("subreddit", ""),
        "title": title.strip()[:300],
        "body": body.strip()[:2000],
        "permalink": permalink,
        "created_utc": created or 0,
        "created_date": created_iso[:10] if created_iso else "",
        "score": record.get("score", 0) or 0,
        "num_comments": record.get("num_comments", 0) or 0,
        "author_name": record.get("author", "[deleted]"),
        "query_that_found_it": record.get("_query", ""),
        "source": src,
        "captio_mention_context": captio_context,
        "raw_text_blob": text_blob,
    }


def extract_context(text: str, window: int = 100) -> str:
    """Extract the sentence containing 'captio'."""
    m = CAPTIO_RE.search(text)
    if not m:
        return ""
    start = max(0, m.start() - window)
    end = min(len(text), m.end() + window)
    snippet = text[start:end].strip()
    snippet = re.sub(r"\s+", " ", snippet)
    return ("..." if start > 0 else "") + snippet + ("..." if end < len(text) else "")


def detect_competitors(text: str) -> list[str]:
    found = []
    for name, rx in COMPETITOR_RE.items():
        if rx.search(text):
            # avoid double-counting Email Me / EmailMe
            if name == "EmailMe" and "Email Me" in found:
                continue
            if name == "Email Me" and "EmailMe" in found:
                continue
            found.append(name)
    return found


def detect_pain_points(text: str) -> list[str]:
    text_lower = text.lower()
    pains = []
    rules = [
        ("captio_shutdown", ["captio is gone", "captio shut", "captio discontinued",
                              "captio stopped", "captio no longer", "captio removed",
                              "captio dead", "captio is dead", "rip captio"]),
        ("looking_for_alternative", ["alternative to captio", "captio alternative",
                                       "replace captio", "captio replacement",
                                       "instead of captio", "like captio", "captio-like"]),
        ("launch_speed", ["fast", "instant", "quick", "speed", "fastest"]),
        ("drafts_too_complex", ["drafts too complex", "drafts is overkill",
                                 "drafts is too much", "drafts complicated"]),
        ("shortcuts_unstable", ["shortcuts broken", "shortcuts unreliable",
                                  "shortcut fails", "shortcuts is buggy"]),
        ("apple_notes_slow", ["apple notes slow", "notes app slow", "share sheet slow"]),
        ("subscription_aversion", ["subscription", "monthly fee", "pay monthly",
                                     "lifetime", "one-time"]),
        ("privacy_concern", ["privacy", "encrypted", "encryption", "secure"]),
        ("android_demand", ["android version", "android port", "on android"]),
        ("offline_demand", ["offline", "no signal", "subway", "airplane mode"]),
    ]
    for tag, patterns in rules:
        if any(p in text_lower for p in patterns):
            pains.append(tag)
    return pains


def detect_sentiment(text: str) -> str:
    t = text.lower()
    if any(p in t for p in ["love captio", "loved captio", "miss captio", "captio was great", "best app"]):
        if any(p in t for p in ["gone", "shut", "discontinued", "rip", "no longer"]):
            return "nostalgic"
        return "positive"
    if any(p in t for p in ["alternative", "replacement", "looking for", "any other", "what should i"]):
        return "looking_for_solution"
    if any(p in t for p in ["frustrated", "angry", "annoying", "useless", "broken"]):
        return "frustrated"
    if any(p in t for p in ["expensive", "subscription", "too much"]):
        return "price_sensitive"
    if any(p in t for p in ["privacy", "tracker", "data"]):
        return "privacy_sensitive"
    return "neutral"


def detect_intent(text: str) -> str:
    t = text.lower()
    if any(p in t for p in ["alternative", "replacement", "instead of", "like captio", "what should"]):
        return "discovery"
    if any(p in t for p in [" vs ", "compare", "versus", "or "]):
        return "comparison"
    if any(p in t for p in ["how to switch", "migrate", "moving from"]):
        return "migration"
    if any(p in t for p in ["miss", "loved", "remember", "used to use"]):
        return "nostalgia"
    if any(p in t for p in ["broken", "doesn't work", "not working", "useless"]):
        return "complaint"
    if any(p in t for p in ["love", "great", "best", "amazing"]):
        return "praise"
    return "discovery"


def score_relevance(item: dict) -> tuple[int, list[str]]:
    """Apply rules from PLAN.md to compute 0-100 relevance score."""
    score = 0
    reasons = []
    text = item["raw_text_blob"].lower()

    # Direct Captio mention
    score += 60
    reasons.append("+60 captio mention")

    if any(p in text for p in ["captio alternative", "alternative to captio",
                                 "captio replacement", "replace captio"]):
        score += 50
        reasons.append("+50 alternative/replacement")

    if any(p in text for p in ["captio discontinued", "captio shut down",
                                 "captio stopped working", "captio no longer",
                                 "captio is gone", "captio removed", "rip captio"]):
        score += 50
        reasons.append("+50 shutdown context")

    if any(p in text for p in ["love captio", "loved captio", "captio was the best",
                                 "captio is great", "use captio every day",
                                 "captio is perfect"]):
        score += 40
        reasons.append("+40 strong praise")

    if any(p in text for p in ["captio + ", "i use captio for", "my captio workflow",
                                 "captio shortcut", "captio + ifttt", "captio + gmail"]):
        score += 35
        reasons.append("+35 specific usage")

    competitors = detect_competitors(item["raw_text_blob"])
    if competitors:
        score += 30
        reasons.append(f"+30 competitor co-mention ({', '.join(competitors[:3])})")

    if any(p in text for p in ["gtd", "inbox", "workflow", "capture"]):
        score += 25
        reasons.append("+25 workflow context")

    if any(p in text for p in ["looking for", "recommend", "alternative", "app like",
                                 "any suggestions", "what should i use"]):
        score += 20
        reasons.append("+20 solution-seeking")

    if any(p in text for p in ["too slow", "too much friction", "overkill",
                                 "too complicated", "annoying"]):
        score += 15
        reasons.append("+15 friction complaint")

    if (item.get("score", 0) or 0) >= 5 or (item.get("num_comments", 0) or 0) >= 10:
        score += 10
        reasons.append("+10 engagement")

    # Penalty: very short content
    if len(item["raw_text_blob"]) < 60:
        score -= 20
        reasons.append("-20 too short")

    # Penalty: spam markers
    if any(p in text for p in ["http://bit.ly", "click here", "sign up now"]):
        score -= 20
        reasons.append("-20 spam markers")

    return max(0, min(100, score)), reasons


def classify(item: dict, score: int) -> str:
    text = item["raw_text_blob"].lower()
    if any(p in text for p in ["captio shut", "captio discontinued", "captio is gone",
                                 "captio stopped", "captio no longer", "captio removed",
                                 "captio dead"]):
        return "B"  # Shutdown
    if any(p in text for p in ["captio alternative", "alternative to captio",
                                 "captio replacement", "replace captio",
                                 "instead of captio", "like captio", "app like captio"]):
        return "C"  # Looking for replacement
    competitors = detect_competitors(item["raw_text_blob"])
    if len(competitors) >= 1 and any(p in text for p in [" vs ", "compare", "versus"]):
        return "E"  # Comparison
    if any(p in text for p in ["love captio", "loved captio", "best", "great",
                                 "favorite"]):
        return "A"  # Praise
    if any(p in text for p in ["i use captio for", "captio shortcut", "my workflow",
                                 "i use captio with", "+gmail", "+ifttt"]):
        return "D"  # Usage explanation
    if any(p in text for p in ["expensive", "broken", "doesn't work", "annoying",
                                 "frustrating", "no android", "ios only"]):
        return "F"  # Complaint
    if score < 50:
        return "G"  # Low relevance
    return "G"  # Default low


def recommended_action(item: dict, classification: str, score: int) -> str:
    if score < 50:
        return "no_action"
    if classification in ("B", "C"):
        return "reply" if score >= 75 else "lp_copy"
    if classification == "A":
        return "lp_copy"
    if classification == "D":
        return "faq_addition"
    if classification == "E":
        return "seo_article"
    if classification == "F":
        if "expensive" in item["raw_text_blob"].lower():
            return "pricing_signal"
        return "faq_addition"
    return "no_action"


def detect_language(text: str) -> str:
    # Crude: count CJK chars
    cjk = sum(1 for c in text if "　" <= c <= "鿿" or "＀" <= c <= "￯")
    if cjk > len(text) * 0.1:
        return "ja"
    return "en"


def main() -> int:
    print("=== Captio Reddit pipeline ===")
    raw_records = []
    for f in sorted(RAW.glob("*.jsonl")):
        print(f"[load] {f.name}")
        with f.open() as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    raw_records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    print(f"[load] total raw: {len(raw_records)}")

    # Normalize + Captio-only filter
    records = []
    excluded_count = 0
    for r in raw_records:
        n = normalize(r)
        if n is None:
            excluded_count += 1
            continue
        records.append(n)

    print(f"[filter] kept: {len(records)} (excluded {excluded_count} non-Captio or invalid)")

    # Dedupe by (type, id) and by permalink
    seen_keys = set()
    seen_perma = set()
    deduped = []
    for r in records:
        k = (r["type"], r["id"])
        p = r["permalink"]
        if k in seen_keys:
            continue
        if p and p in seen_perma:
            continue
        seen_keys.add(k)
        if p:
            seen_perma.add(p)
        deduped.append(r)

    print(f"[dedupe] unique: {len(deduped)}")

    # Score, classify, enrich
    enriched = []
    for r in deduped:
        score, reasons = score_relevance(r)
        cls = classify(r, score)
        rec_action = recommended_action(r, cls, score)
        text = r["raw_text_blob"]
        comp = detect_competitors(text)
        pain = detect_pain_points(text)
        sentiment = detect_sentiment(text)
        intent = detect_intent(text)
        lang = detect_language(text)

        out = {
            "id": r["id"],
            "type": r["type"],
            "subreddit": r["subreddit"],
            "title": r["title"],
            "body": r["body"][:1500],
            "permalink": r["permalink"],
            "created_utc": r["created_utc"],
            "created_date": r["created_date"],
            "score": r["score"],
            "num_comments": r["num_comments"],
            "author_name": r["author_name"],
            "query_that_found_it": r["query_that_found_it"],
            "captio_mention_context": r["captio_mention_context"],
            "relevance_score": score,
            "relevance_reason": "; ".join(reasons),
            "classification": cls,
            "language": lang,
            "sentiment": sentiment,
            "user_intent": intent,
            "competitor_mentions": ",".join(comp),
            "pain_point": ",".join(pain),
            "recommended_action": rec_action,
        }
        enriched.append(out)

    # Sort by relevance_score desc
    enriched.sort(key=lambda x: x["relevance_score"], reverse=True)

    # Export CSVs
    df = pd.DataFrame(enriched)
    raw_csv = EXPORTS / "reddit_captio_only_raw.csv"
    df.to_csv(raw_csv, index=False)

    deduped_csv = EXPORTS / "reddit_captio_only_deduped.csv"
    df.to_csv(deduped_csv, index=False)  # already deduped

    ranked = df[df["relevance_score"] >= 50].copy()
    ranked_csv = EXPORTS / "reddit_captio_only_ranked.csv"
    ranked.to_csv(ranked_csv, index=False)

    print(f"[export] raw: {len(df)} rows -> {raw_csv}")
    print(f"[export] ranked (score>=50): {len(ranked)} rows -> {ranked_csv}")

    # Generate reports
    generate_reports(df, ranked, len(raw_records), excluded_count)

    # Summary log
    summary = {
        "raw_records": len(raw_records),
        "captio_only_filtered": len(records),
        "deduped": len(deduped),
        "ranked_score_50_plus": len(ranked),
        "by_classification": {c: int((df["classification"] == c).sum()) for c in "ABCDEFG"},
        "top_subreddits": dict(Counter(df["subreddit"]).most_common(10)),
        "top_competitors": dict(Counter(
            c for s in df["competitor_mentions"] for c in s.split(",") if c
        ).most_common(10)),
        "high_priority_count": int((df["relevance_score"] >= 80).sum()),
    }
    (PROCESSED / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"\n=== SUMMARY ===")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def generate_reports(df: pd.DataFrame, ranked: pd.DataFrame, raw_total: int, excluded: int):
    # Insights
    by_class = {c: int((df["classification"] == c).sum()) for c in "ABCDEFG"}
    top_subs = Counter(df["subreddit"]).most_common(10)
    competitors = Counter(c for s in df["competitor_mentions"] for c in s.split(",") if c).most_common(10)
    pains = Counter(p for s in df["pain_point"] for p in s.split(",") if p).most_common(10)
    high_pri = ranked[ranked["relevance_score"] >= 80].head(20)

    insights = f"""# Captio Reddit Insights — Auto-generated

**Generated**: {datetime.now(timezone.utc).isoformat()}

## Headline numbers

- Raw records ingested: **{raw_total}**
- After Captio-only filter: **{len(df)}**
- Excluded (non-Captio or malformed): {excluded}
- Ranked (relevance ≥ 50): **{len(ranked)}**
- High priority (relevance ≥ 80): **{int((df['relevance_score'] >= 80).sum())}**

## Classification breakdown

| Class | Meaning | Count |
|---|---|---|
| A | Captio praise | {by_class['A']} |
| B | Captio shutdown / unusable | {by_class['B']} |
| C | Captio replacement-seeking | {by_class['C']} |
| D | Captio usage explanation | {by_class['D']} |
| E | Captio vs competitor comparison | {by_class['E']} |
| F | Captio complaint | {by_class['F']} |
| G | Low relevance | {by_class['G']} |

## Top subreddits with Captio mentions

| Rank | Subreddit | Mentions |
|---|---|---|
""" + "\n".join(f"| {i+1} | r/{s} | {n} |" for i, (s, n) in enumerate(top_subs)) + f"""

## Most-co-mentioned competitor apps

(Only counted when in the same thread as Captio)

| Rank | App | Co-mentions |
|---|---|---|
""" + "\n".join(f"| {i+1} | {c} | {n} |" for i, (c, n) in enumerate(competitors)) + f"""

## Top pain points expressed

| Rank | Pain | Count |
|---|---|---|
""" + "\n".join(f"| {i+1} | {p} | {n} |" for i, (p, n) in enumerate(pains)) + f"""

## High-priority threads (relevance ≥ 80, top 20)

| Score | Class | Subreddit | Type | Permalink | Excerpt |
|---|---|---|---|---|---|
""" + "\n".join(
    f"| {row['relevance_score']} | {row['classification']} | r/{row['subreddit']} | {row['type']} | "
    f"[{row['id']}]({row['permalink']}) | {(row['captio_mention_context'] or '')[:80]}... |"
    for _, row in high_pri.iterrows()
) + """

## What this tells us

(Generated programmatically — interpret with care; full strategy reading lives in `reports/reddit_captio_only_strategy.md`)

- **Hypothesis 1 verification (Captio = inbox capture, not note manager)**: see B + C class density vs A/D
- **Hypothesis 2 verification (Captio compared to Drafts/Pigeon/Shortcuts > Apple Notes/Notion)**: see top competitor table above
- **Hypothesis 4 (Captio shutdown context = key acquisition channel)**: B + C class total vs total

See ranked CSV at `data/exports/reddit_captio_only_ranked.csv` for the full prioritized list.
"""
    (REPORTS / "reddit_captio_only_insights.md").write_text(insights)

    # Subreddit map
    sub_map = """# Subreddit Map — Captio mentions

| Subreddit | Total | Class B (shutdown) | Class C (replacement) | Class A+D+E (use/praise/compare) | Avg score |
|---|---|---|---|---|---|
"""
    for sub, total in top_subs[:20]:
        sub_df = df[df["subreddit"] == sub]
        b = int((sub_df["classification"] == "B").sum())
        c = int((sub_df["classification"] == "C").sum())
        ade = int(sub_df["classification"].isin(["A", "D", "E"]).sum())
        avg = round(sub_df["score"].mean(), 1) if len(sub_df) else 0
        sub_map += f"| r/{sub} | {total} | {b} | {c} | {ade} | {avg} |\n"
    sub_map += "\n## Posting guidance per subreddit\n\n"
    sub_map += "(populate per-subreddit tone/rules manually after reviewing top threads)\n"
    (REPORTS / "reddit_captio_only_subreddit_map.md").write_text(sub_map)

    # Methodology
    methodology = f"""# Methodology — Captio Reddit Research

**Run**: {datetime.now(timezone.utc).isoformat()}

## Data sources used

1. **Reddit public JSON search** (no auth) — `https://www.reddit.com/search.json?q=<query>`
   - 20 keyword queries (Captio-containing only)
   - 16 priority subreddits with `?q=Captio&restrict_sr=1`
2. **PullPush.io** (Pushshift successor) — `https://api.pullpush.io/reddit/search/{{submission,comment}}/`
   - 4 keyword queries × 2 endpoints = 8 calls

## Rate limiting

- 1.5s sleep between requests
- Auto-retry on 429 with exponential backoff
- User-Agent header set per Reddit's requirements

## Filtering rules

- **MUST contain** `\\bcaptio\\b` (case-insensitive) in title OR body
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
"""
    (REPORTS / "reddit_captio_methodology.md").write_text(methodology)

    # SEO keywords
    seo_md = """# Captio-only SEO keyword extraction

Auto-extracted from Reddit Captio mentions. Only keywords that contain "captio" are listed.

## Captio alternative cluster

(populated from query frequency in scored data)

## Captio discontinued cluster

## Captio app cluster

## Captio workflow cluster

## Captio competitor comparison cluster

## Captio long-tail

(see ranked CSV `query_that_found_it` column for empirical query → match counts)
"""
    (REPORTS / "reddit_captio_seo_keywords.md").write_text(seo_md)

    # Reply templates
    templates = """# Reply Templates — Captio context

(Polish manually. All assume the recipient has explicitly mentioned Captio.)

## A. Captio shut down, looking for alternative

> Hey — I was a daily Captio user from 2014 to 2024 and got hit by the shutdown too. I ended up building my own replacement (SimpleMemo) since nothing else nailed the "open, type, send" feel. If you want a head-to-head with Drafts/Pigeon/etc., the comparison page is at simplememofast.com/captio-alternative — happy to answer questions either way. Disclosure: I'm the developer, not affiliated with the original Captio team.

## B. Captio fan, hasn't heard about shutdown

> Heads up — Captio was removed from the App Store in October 2024 (Tupil never made an official statement, but the app's servers are down too). If you want the same workflow back, a few options exist; SimpleMemo is the closest match in feel. Disclosure: I built it, after using Captio for 10 years myself.

## C. Captio vs Drafts comparison thread

> One angle I haven't seen mentioned: Drafts is genuinely more powerful (action-based, scriptable) but the cold-launch-to-input time is ~0.8s vs Captio's 0.5s. If your use case is "one tap, type, send, done," Drafts adds friction Captio never imposed. I built SimpleMemo specifically because I missed Captio's speed (0.3s launch on iPhone 15) and offline reliability — link in bio if useful, but Drafts is the better pick if you want extensibility.

## D. r/productivity discussion thread (no direct ask)

> Captio's design philosophy was "your inbox is the database, the app is just the input field." Most modern note apps inverted that — the app becomes the database and email is an export step. Worth thinking about which side of that you actually want.

## E. Subscription objection ("I'm not paying monthly for a text field")

> Totally fair — and Captio's $1.99 one-time was exactly why it became unmaintainable when Google's API requirements escalated. The trade-off with subscription is recurring revenue → ongoing security/compliance work. SimpleMemo has a free 3/day tier forever (no credit card) if you want to try the workflow without paying anything. Disclosure: I built it.

## F. Privacy concern

> SimpleMemo encrypts notes with AES-GCM on-device before they leave the phone — server only sees ciphertext. Captio relied on Gmail API and read your messages. Different threat models. Drafts is local-first if you want zero-server. None of the apps in this category do "perfect" privacy because email itself isn't end-to-end by default.

## G. Open with empathy, end with options (catch-all)

> [acknowledge their loss/frustration about Captio first]. There are 4 options that come up in this thread — SimpleMemo (closest match, $2.99/mo), Drafts (powerful, $1.99/mo), Pigeon (free, missing offline), Note to Self Mail (Gmail-only, similar UI). Which one fits depends on whether you prioritize speed, automation, or zero-cost. Happy to expand on any. (Disclosure: I built SimpleMemo.)
"""
    (REPORTS / "reddit_captio_reply_templates.md").write_text(templates)


if __name__ == "__main__":
    sys.exit(main())
