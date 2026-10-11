#!/usr/bin/env python3
"""Generate the English developer feed: en/devlog/feed.xml (RSS 2.0).

    python3 scripts/generate_dev_feed.py             # write the feed
    python3 scripts/generate_dev_feed.py --check     # exit 1 if the committed feed is stale
    python3 scripts/generate_dev_feed.py --selftest  # prove the extraction and --check can fail

Why this exists
---------------
The Dev Log is listed in the iOS Dev Directory (https://iosdevdirectory.com/).
iOS Feeds, iOS Dev Weekly and SwiftLee Weekly discover new articles through the
feed_url of that listing. Without a feed, only the listing itself is visible and
new developer articles are never picked up.

What goes into the feed
-----------------------
* every page in en/devlog/ except index.html
* the developer articles listed in EXTRA_PAGES (they live under en/blog/)

When you publish another developer article outside en/devlog/, add it to
EXTRA_PAGES and run this script. Nothing else is inferred from file names.

Where the values come from
--------------------------
* title       : the page's <h1>, otherwise og:title
                (several Dev Log og:title values are cut with "…" or carry
                a " | Simple Memo Dev Log" suffix, so <h1> goes first)
* link / guid : <link rel="canonical">
* pubDate     : datePublished of the page's article JSON-LD
                (BlogPosting / TechArticle / Article), at 00:00 JST
* description : <meta name="description">; when it is cut with "…", the
                JSON-LD description of the same page
* dc:creator  : the JSON-LD author name (the byline shown on the page)

The output never depends on today's date (lastBuildDate is the newest
dateModified among the items), so --check gives the same answer on any day.
A page without a canonical URL or datePublished is an error, not a silent skip.

This script is not wired into CI yet. Editing .github/workflows/seo-check.yml
is left for a separate change, because CI wiring also needs an entry in
data/check-selftests.json (scripts/check-selftests.mjs) and workflow edits
have their own merge caveat (see CLAUDE.md).
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

REPO_ROOT = Path(__file__).resolve().parent.parent
FEED_PATH = REPO_ROOT / "en" / "devlog" / "feed.xml"

# Developer articles that live outside en/devlog/. Keep this list explicit.
EXTRA_PAGES = [
    "en/blog/ios26-speechanalyzer-live-mic.html",
    "en/blog/ios26-speechanalyzer-custom-vocabulary.html",
    "en/blog/foundation-models-choose-not-write.html",
]

SITE_URL = "https://simplememofast.com"
CHANNEL = {
    "title": "Simple Memo Dev Log",
    "link": f"{SITE_URL}/en/devlog/",
    "self": f"{SITE_URL}/en/devlog/feed.xml",
    "description": (
        "Engineering notes from building Simple Memo, an iPhone app for "
        "quick capture: architecture, performance, privacy, and iOS APIs "
        "such as SpeechAnalyzer."
    ),
    "language": "en",
}

JST = timezone(timedelta(hours=9))
ARTICLE_TYPES = {"BlogPosting", "TechArticle", "Article"}

LD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
TAG_RE = re.compile(r"<[^>]+>")


class FeedError(Exception):
    pass


def _attr(tag: str, name: str) -> str | None:
    m = re.search(r'\b' + re.escape(name) + r'\s*=\s*"([^"]*)"', tag)
    return html.unescape(m.group(1)) if m else None


def _find_tag(src: str, tag: str, attr: str, value: str) -> str | None:
    """Return the first <tag ...> whose attribute equals value, in any attribute order."""
    for m in re.finditer(r"<" + tag + r"\b[^>]*>", src, re.I):
        if _attr(m.group(0), attr) == value:
            return m.group(0)
    return None


def _article_ld(src: str, where: str) -> dict:
    for block in LD_RE.findall(src):
        try:
            data = json.loads(block)
        except json.JSONDecodeError as exc:
            raise FeedError(f"{where}: JSON-LD does not parse ({exc})") from exc
        items = data if isinstance(data, list) else data.get("@graph") or [data]
        for item in items:
            kind = item.get("@type")
            kinds = set(kind) if isinstance(kind, list) else {kind}
            if kinds & ARTICLE_TYPES:
                return item
    raise FeedError(f"{where}: no BlogPosting/TechArticle/Article JSON-LD")


def _date(value: object, field: str, where: str) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", value):
        raise FeedError(f"{where}: {field} missing or not a date ({value!r})")
    y, m, d = (int(x) for x in value[:10].split("-"))
    return datetime(y, m, d, tzinfo=JST)


def read_item(path: Path, root: Path = REPO_ROOT) -> dict:
    where = str(path.relative_to(root))
    src = path.read_text(encoding="utf-8")

    canonical_tag = _find_tag(src, "link", "rel", "canonical")
    link = _attr(canonical_tag, "href") if canonical_tag else None
    if not link:
        raise FeedError(f"{where}: no canonical URL")

    ld = _article_ld(src, where)
    published = _date(ld.get("datePublished"), "datePublished", where)
    modified_raw = ld.get("dateModified") or ld.get("datePublished")
    modified = _date(modified_raw, "dateModified", where)

    h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", src, re.S | re.I)
    title = html.unescape(TAG_RE.sub("", h1.group(1))).strip() if h1 else None
    if not title:
        og_tag = _find_tag(src, "meta", "property", "og:title")
        title = _attr(og_tag, "content") if og_tag else None
    if not title:
        raise FeedError(f"{where}: no <h1> or og:title")

    desc_tag = _find_tag(src, "meta", "name", "description")
    meta_desc = (_attr(desc_tag, "content") or "").strip() if desc_tag else ""
    ld_desc = (ld.get("description") or "").strip()
    if meta_desc and not meta_desc.endswith(("…", "...")):
        description = meta_desc
    else:
        description = ld_desc or meta_desc
    if not description:
        raise FeedError(f"{where}: no description")

    author = ld.get("author")
    if isinstance(author, list):
        author = author[0] if author else None
    creator = author.get("name") if isinstance(author, dict) else author

    return {
        "title": " ".join(title.split()),
        "link": link,
        "published": published,
        "modified": modified,
        "description": " ".join(description.split()),
        "creator": creator,
    }


def collect(root: Path = REPO_ROOT, extra: list[str] | None = None) -> list[dict]:
    devlog = root / "en" / "devlog"
    pages = sorted(p for p in devlog.glob("*.html") if p.name != "index.html")
    pages += [root / rel for rel in (EXTRA_PAGES if extra is None else extra)]
    items = [read_item(p, root) for p in pages]
    links = [i["link"] for i in items]
    dupes = sorted({l for l in links if links.count(l) > 1})
    if dupes:
        raise FeedError(f"duplicate canonical URLs: {dupes}")
    items.sort(key=lambda i: (-i["published"].timestamp(), i["link"]))
    return items


def render(items: list[dict]) -> str:
    if not items:
        raise FeedError("no items")
    last_build = max(i["modified"] for i in items)
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/">',
        "  <channel>",
        f"    <title>{escape(CHANNEL['title'])}</title>",
        f"    <link>{escape(CHANNEL['link'])}</link>",
        f'    <atom:link href="{escape(CHANNEL["self"])}" rel="self" type="application/rss+xml"/>',
        f"    <description>{escape(CHANNEL['description'])}</description>",
        f"    <language>{CHANNEL['language']}</language>",
        f"    <lastBuildDate>{format_datetime(last_build)}</lastBuildDate>",
    ]
    for i in items:
        out += [
            "    <item>",
            f"      <title>{escape(i['title'])}</title>",
            f"      <link>{escape(i['link'])}</link>",
            f'      <guid isPermaLink="true">{escape(i["link"])}</guid>',
            f"      <pubDate>{format_datetime(i['published'])}</pubDate>",
        ]
        if i["creator"]:
            out.append(f"      <dc:creator>{escape(i['creator'])}</dc:creator>")
        out += [
            f"      <description>{escape(i['description'])}</description>",
            "    </item>",
        ]
    out += ["  </channel>", "</rss>", ""]
    return "\n".join(out)


def build(root: Path = REPO_ROOT, extra: list[str] | None = None) -> str:
    return render(collect(root, extra))


def check(feed_path: Path = FEED_PATH, root: Path = REPO_ROOT, extra: list[str] | None = None) -> int:
    try:
        want = build(root, extra)
    except FeedError as exc:
        print(f"dev feed: {exc}", file=sys.stderr)
        return 1
    have = feed_path.read_text(encoding="utf-8") if feed_path.exists() else None
    if have != want:
        state = "missing" if have is None else "stale"
        print(
            f"dev feed: {feed_path.relative_to(root)} is {state}. "
            "Run: python3 scripts/generate_dev_feed.py",
            file=sys.stderr,
        )
        return 1
    print(f"dev feed: {feed_path.relative_to(root)} is up to date")
    return 0


def selftest() -> int:
    page = """<!doctype html><html><head>
<link rel="canonical" href="https://example.com/en/devlog/{slug}">
<meta content="Short &amp; clear summary." name="description"/>
<script type="application/ld+json">{ld}</script>
</head><body><h1>Heading <em>{slug}</em></h1></body></html>"""
    ld_ok = {"@type": ["BlogPosting", "TechArticle"], "datePublished": "2026-02-13",
             "dateModified": "2026-06-05", "author": {"@type": "Person", "name": "Writer"}}
    failures = []

    def t(name: str, ok: bool) -> None:
        print(("ok   " if ok else "FAIL ") + name)
        if not ok:
            failures.append(name)

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        devlog = root / "en" / "devlog"
        devlog.mkdir(parents=True)
        (devlog / "index.html").write_text("<html>index is never an item</html>", encoding="utf-8")
        (devlog / "a.html").write_text(page.format(slug="a", ld=json.dumps(ld_ok)), encoding="utf-8")
        later = dict(ld_ok, datePublished="2026-09-18", dateModified="2026-09-18")
        (root / "en" / "blog").mkdir(parents=True)
        (root / "en" / "blog" / "b.html").write_text(
            page.format(slug="b", ld=json.dumps(later)), encoding="utf-8")

        items = collect(root, ["en/blog/b.html"])
        t("index.html is excluded and EXTRA_PAGES are included", [i["link"][-1] for i in items] == ["b", "a"])
        t("newest item comes first", items[0]["published"] > items[1]["published"])
        t("title comes from the <h1> text", items[1]["title"] == "Heading a")
        t("description reads reversed attribute order and unescapes",
          items[1]["description"] == "Short & clear summary.")
        t("dc:creator comes from the JSON-LD author", items[1]["creator"] == "Writer")
        xml = build(root, ["en/blog/b.html"])
        t("pubDate is 00:00 JST in RFC 822", "<pubDate>Fri, 13 Feb 2026 00:00:00 +0900</pubDate>" in xml)
        t("lastBuildDate is the newest dateModified, not today",
          "<lastBuildDate>Fri, 18 Sep 2026 00:00:00 +0900</lastBuildDate>" in xml)
        t("text is XML-escaped", "Short &amp; clear summary." in xml)

        feed = devlog / "feed.xml"
        t("--check fails when the feed is missing", check(feed, root, ["en/blog/b.html"]) == 1)
        feed.write_text(xml, encoding="utf-8")
        t("--check passes when the feed matches", check(feed, root, ["en/blog/b.html"]) == 0)
        feed.write_text(xml.replace("Heading a", "Old title"), encoding="utf-8")
        t("--check fails when the feed is stale", check(feed, root, ["en/blog/b.html"]) == 1)

        cut = page.format(slug="d", ld=json.dumps(dict(ld_ok, description="Full summary."))).replace(
            "Short &amp; clear summary.", "Cut summary\u2026")
        (devlog / "d.html").write_text(cut, encoding="utf-8")
        d_item = [i for i in collect(root, ["en/blog/b.html"]) if i["link"].endswith("/d")][0]
        t("a description cut with an ellipsis falls back to the JSON-LD description",
          d_item["description"] == "Full summary.")
        (devlog / "d.html").unlink()

        (devlog / "e.html").write_text(page.format(slug="a", ld=json.dumps(ld_ok)), encoding="utf-8")
        try:
            collect(root, ["en/blog/b.html"])
            t("two pages with the same canonical URL are an error", False)
        except FeedError:
            t("two pages with the same canonical URL are an error", True)
        (devlog / "e.html").unlink()

        (devlog / "c.html").write_text(
            page.format(slug="c", ld=json.dumps({"@type": "BlogPosting"})), encoding="utf-8")
        try:
            collect(root, ["en/blog/b.html"])
            t("a page without datePublished is an error", False)
        except FeedError:
            t("a page without datePublished is an error", True)
        t("--check fails instead of skipping a broken page", check(feed, root, ["en/blog/b.html"]) == 1)

    print("selftest:", "FAILED" if failures else "passed")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="exit 1 if the committed feed is stale")
    ap.add_argument("--selftest", action="store_true", help="run the built-in tests")
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest()
    if args.check:
        return check()
    FEED_PATH.write_text(build(), encoding="utf-8")
    print(f"dev feed: wrote {FEED_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
