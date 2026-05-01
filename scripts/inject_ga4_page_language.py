"""
Inject GA4 `page_language` into the gtag config call on every HTML page.

Detects the locale from `location.pathname` at runtime and emits it as a
custom event parameter alongside the existing GA4 config. This is the
GA4 equivalent of the spec's "page_language custom dimension" — once the
parameter is sent, the GA4 admin can register it as a Custom Dimension.

Two existing patterns are handled:

  1. Simple form (~202 files):
       gtag('config', 'G-EPZVZKCVQG');
     becomes
       gtag('config', 'G-EPZVZKCVQG', {page_language: ...});

  2. Object form (2 files: /index.html, /en/index.html):
       gtag('config', 'G-EPZVZKCVQG', { 'custom_map': {...} });
     becomes
       gtag('config', 'G-EPZVZKCVQG', { page_language: ..., 'custom_map': {...} });

Idempotent: re-running the script doesn't add `page_language` a second
time.

Usage:
    python3 scripts/inject_ga4_page_language.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Inline IIFE that maps location.pathname to a locale code consistent
# with TOP_CLUSTER (ja|en|zh-Hans|zh-Hant|ko|es|pt-BR|id|ar|tr).
PAGE_LANG_EXPR = (
    "(function(p){"
    "return p==='/en'||p.indexOf('/en/')===0?'en':"
    "p.indexOf('/zh-Hant/')===0?'zh-Hant':"
    "p.indexOf('/zh/')===0?'zh-Hans':"
    "p.indexOf('/ko/')===0?'ko':"
    "p.indexOf('/es/')===0?'es':"
    "p.indexOf('/pt-BR/')===0?'pt-BR':"
    "p.indexOf('/id/')===0?'id':"
    "p.indexOf('/ar/')===0?'ar':"
    "p.indexOf('/tr/')===0?'tr':"
    "'ja';"
    "})(location.pathname)"
)

# Pattern 1: simple form, no config object yet
SIMPLE_PATTERN = re.compile(
    r"gtag\(\s*'config'\s*,\s*'G-EPZVZKCVQG'\s*\)\s*;"
)

# Pattern 2: object form. Match the opening of the config object so we
# can splice page_language in as the first key.
OBJECT_PATTERN = re.compile(
    r"(gtag\(\s*'config'\s*,\s*'G-EPZVZKCVQG'\s*,\s*\{)"
)

# Already-injected detector (for idempotency)
ALREADY_INJECTED = re.compile(r"gtag\(\s*'config'\s*,\s*'G-EPZVZKCVQG'\s*,\s*\{[^}]*page_language", re.DOTALL)


def transform(text: str) -> tuple[str, bool]:
    """Return (new_text, changed)."""
    if "G-EPZVZKCVQG" not in text:
        return text, False
    if ALREADY_INJECTED.search(text):
        return text, False

    # Try the simple one-liner first
    new_text, n = SIMPLE_PATTERN.subn(
        f"gtag('config', 'G-EPZVZKCVQG', {{page_language: {PAGE_LANG_EXPR}}});",
        text,
    )
    if n:
        return new_text, True

    # Object form: splice page_language as the first key
    def splice(m: re.Match) -> str:
        return f"{m.group(1)}\n            'page_language': {PAGE_LANG_EXPR},"

    new_text, n = OBJECT_PATTERN.subn(splice, text)
    return (new_text, bool(n))


def iter_html_files() -> list[Path]:
    excluded = {"node_modules", "admin", "drafts", "docs", "scripts", "tools",
                "screenshots", "tiktok", ".git", ".github", ".claude"}
    out: list[Path] = []
    for p in REPO_ROOT.rglob("*.html"):
        rel_parts = p.relative_to(REPO_ROOT).parts
        if rel_parts and rel_parts[0] in excluded:
            continue
        out.append(p)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    changed = 0
    skipped = 0
    no_gtag = 0
    files = iter_html_files()
    for f in files:
        text = f.read_text(encoding="utf-8")
        if "G-EPZVZKCVQG" not in text:
            no_gtag += 1
            continue
        new_text, did = transform(text)
        if did:
            if not args.dry_run:
                f.write_text(new_text, encoding="utf-8")
            changed += 1
        else:
            skipped += 1

    print(
        f"Total HTML: {len(files)} | with gtag: {len(files) - no_gtag} | "
        f"changed: {changed} | already up to date: {skipped} | "
        f"no gtag: {no_gtag}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
