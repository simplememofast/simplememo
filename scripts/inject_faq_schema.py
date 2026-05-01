"""
Extract FAQ entries from each captio-alternative page's <details
class="faq-details"> blocks and emit a FAQPage JSON-LD <script>
in the page <head>.

The JA page (/captio-alternative/) carries both ja and en FAQ DOM
(data-lang toggled). We emit only the ja FAQs in its FAQPage schema,
matching the page's primary language. Same idea for the EN page.

Idempotent: if a managed FAQPage block already exists, replace it.

Usage:
    python3 scripts/inject_faq_schema.py [--dry-run]
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


def extract_faqs(html_text: str, target_lang: str) -> list[tuple[str, str]]:
    """Find the data-lang=target_lang section that contains faq-item details
    blocks and return a list of (question, answer) text tuples."""
    # Walk every data-lang block; pick those that contain faq-details
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()
    for m in DATA_LANG_BLOCK_RE.finditer(html_text):
        if m.group("lang") != target_lang:
            continue
        block = m.group("body")
        for fm in FAQ_DETAILS_RE.finditer(block):
            q = strip_tags_and_normalize(fm.group("q"))
            a = strip_tags_and_normalize(fm.group("a"))
            if q and a and q not in seen:
                candidates.append((q, a))
                seen.add(q)
    if candidates:
        return candidates

    # Fallback: pages where FAQs are not wrapped in a data-lang block
    # (the EN page emits FAQs directly without the data-lang shell).
    for fm in FAQ_DETAILS_RE.finditer(html_text):
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    targets = [
        (
            REPO_ROOT / "captio-alternative" / "index.html",
            "https://simplememofast.com/captio-alternative/",
            "ja",
        ),
        (
            REPO_ROOT / "en" / "captio-alternative" / "index.html",
            "https://simplememofast.com/en/captio-alternative/",
            "en",
        ),
    ]
    for fp, url, lang in targets:
        if not fp.exists():
            print(f"[err] missing: {fp}")
            return 1
        process_file(fp, url, lang, args.dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
