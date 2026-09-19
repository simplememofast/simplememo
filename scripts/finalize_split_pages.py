#!/usr/bin/env python3
"""Finish locale links and visible content after every English counterpart exists."""
from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from inject_faq_schema import (
    MANAGED_MARKER, NON_MARKUP_RE, JSONLD_RE, build_faqpage,
    extract_faqs, hand_written_faqpage, managed_payload, build_payload,
    replace_or_insert,
)

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://simplememofast.com"
TAG_RE = re.compile(r"<[a-zA-Z][^>]*>")
HREF_RE = re.compile(r"(\bhref\s*=\s*)([\"'])(.*?)(\2)", re.I | re.S)
CLASS_RE = re.compile(r"(\bclass\s*=\s*)([\"'])(.*?)(\2)", re.I | re.S)


class MarkupReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.anchor = {}
        self.in_heading = False
        self.heading = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.anchor = dict(attrs)
        if tag == "h1":
            self.in_heading = True

    def handle_endtag(self, tag):
        if tag == "h1":
            self.in_heading = False

    def handle_data(self, data):
        if self.in_heading:
            self.heading.append(data)


def english_target(href: str, root: Path) -> str | None:
    url = urlsplit(href)
    if url.scheme and (url.scheme != "https" or url.netloc != "simplememofast.com"):
        return None
    if url.netloc and url.netloc != "simplememofast.com":
        return None
    if not url.path.startswith("/") or url.path.startswith("/en/"):
        return None
    rel = url.path.strip("/")
    if rel.endswith(".html"):
        rel = rel[:-5]
    candidates = [(root / "en" / (rel + ".html"), "/en/" + rel),
                  (root / "en" / rel / "index.html", "/en/" + rel + "/")]
    if not rel:
        candidates = [(root / "en/index.html", "/en/")]
    for path, target in candidates:
        if path.is_file():
            return urlunsplit((url.scheme, url.netloc, target, url.query, url.fragment))
    return None


def finish_markup(text: str, root: Path, *, english: bool) -> str:
    masked = NON_MARKUP_RE.sub(lambda m: " " * len(m[0]), text)
    edits = []
    for match in TAG_RE.finditer(masked):
        tag = text[match.start():match.end()]
        out = tag
        # The toggle script is gone; its inactive wrappers must not hide content.
        if CLASS_RE.search(tag):
            def clean_class(m):
                classes = m[3].split()
                if "lang-content" not in classes:
                    return m[0]
                return m[1] + m[2] + " ".join(c for c in classes if c != "lang-content") + m[2]
            out = CLASS_RE.sub(clean_class, out)
        if english and re.match(r"<a\s", tag, re.I):
            reader = MarkupReader()
            reader.feed(tag)
            anchor = reader.anchor
            if anchor and anchor.get("hreflang", "en") == "en" and anchor.get("lang", "en") == "en":
                href = anchor.get("href", "")
                target = english_target(href, root)
                if target:
                    out = HREF_RE.sub(lambda m: m[1] + m[2] + html.escape(target, quote=True) + m[2], out, count=1)
        if out != tag:
            edits.append((match.start(), match.end(), out))
    for start, end, out in reversed(edits):
        text = text[:start] + out + text[end:]
    return text


def prune_empty_faq(value):
    if isinstance(value, list):
        return [item for row in value if (item := prune_empty_faq(row)) is not None]
    if isinstance(value, dict):
        if value.get("@type") == "FAQPage" and not value.get("mainEntity"):
            return None
        return {k: prune_empty_faq(v) for k, v in value.items()}
    return value


def finish_faq(text: str, page_url: str) -> str:
    edits = []
    for match in JSONLD_RE.finditer(text):
        payload = json.loads(match[1])
        cleaned = prune_empty_faq(payload)
        if cleaned == payload:
            continue
        start = match.start()
        if cleaned is None:
            marker = re.search(re.escape(MANAGED_MARKER) + r"\s*$", text[:start])
            if marker:
                start = marker.start()
            out = ""
        else:
            out = match[0].replace(match[1], json.dumps(cleaned, ensure_ascii=False, separators=(",", ":")))
        edits.append((start, match.end(), out))
    for start, end, out in reversed(edits):
        text = text[:start] + out + text[end:]
    faqs = extract_faqs(text, "en")
    if faqs and not hand_written_faqpage(text) and managed_payload(text) != build_payload(page_url, "en", faqs):
        text = replace_or_insert(text, build_faqpage(page_url, "en", faqs))
    return text


def finish_breadcrumbs(text: str, root: Path) -> str:
    def localize(value, breadcrumb=False):
        if isinstance(value, list):
            for item in value:
                localize(item, breadcrumb)
        elif isinstance(value, dict):
            if breadcrumb and value.get("@type") == "ListItem" and isinstance(value.get("item"), str):
                original = value["item"]
                target = english_target(original, root) or original
                url = urlsplit(target)
                if url.netloc in ("", "simplememofast.com") and url.path.startswith("/en/"):
                    rel = url.path.lstrip("/") + ("index.html" if url.path.endswith("/") else ".html")
                    path = root / rel
                    if path.is_file():
                        reader = MarkupReader()
                        reader.feed(path.read_text(encoding="utf-8"))
                        heading = " ".join(" ".join(reader.heading).split())
                        if heading:
                            value["item"] = target
                            value["name"] = "Home" if url.path == "/en/" else heading
            for key, item in value.items():
                if isinstance(item, (dict, list)):
                    localize(item, value.get("@type") == "BreadcrumbList" and key == "itemListElement")

    def rewrite(match):
        payload = json.loads(match[1])
        before = json.dumps(payload, ensure_ascii=False)
        localize(payload)
        if json.dumps(payload, ensure_ascii=False) == before:
            return match[0]
        return match[0].replace(match[1], json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return JSONLD_RE.sub(rewrite, text)


def finalize(root: Path = ROOT, *, apply: bool = False) -> list[str]:
    from i18n_config import JA_EN_PAIRS
    changed = []
    pages = {}
    for ja_url, en_url in JA_EN_PAIRS:
        for url, english in [(ja_url, False), (en_url, True)]:
            rel = url.lstrip("/") + ("index.html" if url.endswith("/") else ".html")
            pages[rel] = (url, english)
    # Existing English-only pages and the homepage also link to split pages.
    for path in sorted((root / "en").rglob("*.html")):
        rel = path.relative_to(root).as_posix()
        url = "/" + (rel[:-10] if rel.endswith("index.html") else rel[:-5])
        pages[rel] = (url, True)
    for rel, (url, english) in pages.items():
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        # Only pages whose language toggle has actually been removed.
        if re.search(r'<script[^>]+src=["\'][^"\']*/js/lang\.js', text):
            continue
        out = finish_markup(text, root, english=english).replace("AI Ataka", "AI ATAKA")
        if english:
            out = finish_faq(out, SITE + url)
            out = finish_breadcrumbs(out, root)
        if out != text:
            changed.append(rel)
            if apply:
                path.write_text(out, encoding="utf-8")
    return changed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    changed = finalize(apply=args.apply)
    print(f"split_pages_requiring_finalization={len(changed)}")
    if args.check:
        raise SystemExit(bool(changed))
