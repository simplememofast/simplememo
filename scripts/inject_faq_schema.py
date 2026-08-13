"""
Extract FAQ entries from a page's <details class="faq-details"> blocks and
emit a FAQPage JSON-LD <script> in the page <head>.

Pages carrying both languages in one document (data-lang toggled) contribute
only the FAQs matching the page's primary language, so the schema and the
declared inLanguage agree.

Idempotent: if a managed FAQPage block already exists, replace it.

Usage:
    python3 scripts/inject_faq_schema.py [--dry-run]

Targets are DISCOVERED, not listed. The original version named three files.
That was the whole coverage: a 2026-08-12 audit found 144 indexable pages
carrying a visible FAQ section with no FAQPage schema at all — every /vs/
comparison, every /glossary/ entry, every /use-cases/ page. The markup was
already uniform (`faq-item > details.faq-details`), so the only thing standing
between those pages and valid schema was a hardcoded list of three.

A page that already has an UNMANAGED FAQPage block is left alone. Injecting
beside it would publish two FAQPage nodes for one page, and the hand-written
one is the one a human chose the wording for.

Note on what this buys, so nobody re-measures it expecting the wrong thing:
Google restricted FAQ rich results to authoritative government and health
sites in 2023, so this will NOT put FAQ accordions in Google's results for
this domain. It is worth doing for machine-readability — Bing still renders
them, and the AI surfaces this site is actually winning on (3,164 Copilot
citations) read structured data. Judge it on AI citations and Bing, not on
Google rich results.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

MANAGED_MARKER = "<!-- faq-schema: managed by scripts/inject_faq_schema.py -->"

# Pattern for one <details class="faq-details"> ... </details> block
FAQ_DETAILS_RE = re.compile(
    r'<details\s+class="faq-details">\s*'
    r'<summary\s+class="faq-summary">(?P<q>.*?)</summary>\s*'
    r'<div\s+class="faq-answer">(?P<a>.*?)</div>\s*'
    r'</details>',
    re.DOTALL,
)

# For pages where ja and en FAQs are split into <div data-lang="..."> blocks
# (the JA captio-alternative page), match the block that ends just before
# either the next data-lang sibling div or the section closing tag.
DATA_LANG_BLOCK_RE = re.compile(
    r'<div\s+data-lang="(?P<lang>ja|en)"[^>]*>'
    r'(?P<body>.*?)'
    r'</div>\s*(?=<div\s+data-lang=|</section>)',
    re.DOTALL,
)


def strip_tags_and_normalize(html: str) -> str:
    """Remove inner HTML tags from a FAQ answer/question, normalize whitespace."""
    # Replace <br> with space
    text = re.sub(r"<br\s*/?>", " ", html)
    # Strip remaining tags
    text = re.sub(r"<[^>]+>", "", text)
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


LANG_ATTR_RE = re.compile(r'data-lang="(ja|en)"')


def extract_faqs(html_text: str, target_lang: str) -> list[tuple[str, str]]:
    """(question, answer) pairs belonging to target_lang, in document order.

    Language comes from the nearest `data-lang` attribute BEFORE each FAQ,
    not from trying to delimit the enclosing block. Delimiting was the first
    approach and it silently failed on the bilingual pages: the block pattern
    has to guess where a <div data-lang> ends, and `faq-item` nests a div
    inside a div inside it, so on /vs/capacities/ no ja block matched at all.
    The code then fell through to its "no data-lang shell" fallback, which
    takes every FAQ on the page — publishing all 6 English Q&As inside a
    FAQPage declaring inLanguage "ja". Scanning backwards for the last
    data-lang attribute needs no notion of nesting and cannot mis-delimit.

    A FAQ with no data-lang before it belongs to a single-language page and
    is kept whatever target_lang is.
    """
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()
    for fm in FAQ_DETAILS_RE.finditer(html_text):
        marks = LANG_ATTR_RE.findall(html_text, 0, fm.start())
        lang = marks[-1] if marks else None
        if lang is not None and lang != target_lang:
            continue
        q = strip_tags_and_normalize(fm.group("q"))
        a = strip_tags_and_normalize(fm.group("a"))
        if q and a and q not in seen:
            candidates.append((q, a))
            seen.add(q)
    return candidates


def build_faqpage(page_url: str, in_language: str, faqs: list[tuple[str, str]]) -> str:
    payload = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "@id": f"{page_url}#faq",
        "inLanguage": in_language,
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in faqs
        ],
    }
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return f'  {MANAGED_MARKER}\n  <script type="application/ld+json">{body}</script>\n'


def replace_or_insert(html_text: str, block: str) -> str:
    # Remove existing managed block (idempotent). The block is one line of
    # marker comment plus one line of <script>; consume any leading/trailing
    # whitespace so re-runs leave the same byte count.
    pat = re.compile(
        r"[ \t]*"
        + re.escape(MANAGED_MARKER)
        + r"\s*<script\s+type=\"application/ld\+json\">.*?</script>[ \t]*\n?",
        re.DOTALL,
    )
    html_text = pat.sub("", html_text)

    # Insert just before </head>. Don't consume any leading whitespace; the
    # block itself ends with '\n' so the resulting layout is stable across
    # repeated runs (idempotent).
    head_close = re.search(r"</head>", html_text)
    if not head_close:
        return html_text
    return html_text[: head_close.start()] + block + html_text[head_close.start():]


def process_file(file_path: Path, page_url: str, lang: str, dry_run: bool) -> bool:
    text = file_path.read_text(encoding="utf-8")
    faqs = extract_faqs(text, lang)
    if not faqs:
        print(f"[skip] {file_path.relative_to(REPO_ROOT)}: 0 FAQs found")
        return False
    block = build_faqpage(page_url, lang, faqs)
    new_text = replace_or_insert(text, block)
    if new_text == text:
        print(f"[ok]   {file_path.relative_to(REPO_ROOT)}: already up to date")
        return False
    if not dry_run:
        file_path.write_text(new_text, encoding="utf-8")
    print(
        f"[update] {file_path.relative_to(REPO_ROOT)}: {len(faqs)} FAQs (lang={lang})"
    )
    return True


SITE_URL = "https://simplememofast.com"
SKIP_DIRS = {".git", "node_modules", "scripts", "docs", "screenshots", "admin"}
SKIP_FILES = {"404.html"}
NOINDEX_RE = re.compile(r'content\s*=\s*["\'][^"\']*noindex', re.IGNORECASE)


def page_url_for(path: Path) -> str:
    """Canonical, extension-less URL — the same shape the sitemap publishes:
    `foo/index.html` -> `/foo/`, `blog/bar.html` -> `/blog/bar`."""
    rel = path.relative_to(REPO_ROOT).as_posix()
    if rel.endswith("/index.html"):
        return f"{SITE_URL}/{rel[: -len('index.html')]}"
    if rel == "index.html":
        return f"{SITE_URL}/"
    return f"{SITE_URL}/{rel[: -len('.html')]}"


def discover() -> list[tuple[Path, str, str]]:
    """Every indexable page whose FAQ markup we may safely own."""
    targets: list[tuple[Path, str, str]] = []
    for path in sorted(REPO_ROOT.rglob("*.html")):
        rel = path.relative_to(REPO_ROOT)
        if any(p in SKIP_DIRS for p in rel.parts) or rel.name in SKIP_FILES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if NOINDEX_RE.search(text):
            continue
        if not FAQ_DETAILS_RE.search(text):
            continue
        if '"FAQPage"' in text and MANAGED_MARKER not in text:
            print(f"[keep] {rel}: hand-written FAQPage left alone")
            continue
        lang = "en" if rel.parts[0] == "en" else "ja"
        targets.append((path, page_url_for(path), lang))
    return targets


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    targets = discover()
    changed = 0
    for fp, url, lang in targets:
        if process_file(fp, url, lang, args.dry_run):
            changed += 1
    print(f"\n{len(targets)} page(s) with FAQ markup; "
          f"{'would update' if args.dry_run else 'updated'} {changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
