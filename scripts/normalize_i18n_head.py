"""
Normalize i18n head tags across pages defined in i18n_config.

For each in-scope file, this script ensures the <head> contains:
  1. <html lang="..."> set to the page's locale
  2. <meta http-equiv="content-language" content="..."> for Bing
  3. <link rel="canonical" href="..."> (absolute, self-referencing)
  4. <link rel="alternate" hreflang="..."> for every existing locale pair
  5. <link rel="alternate" hreflang="x-default" href="..."> when applicable

Idempotent: running twice produces the same output.

Removes any existing canonical / hreflang alternate / content-language meta
lines so the script is the sole owner of those tags.

Usage:
    python3 scripts/normalize_i18n_head.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from i18n_config import (  # noqa: E402
    SITE_URL,
    TOP_CLUSTER,
    TOP_CLUSTER_XDEFAULT,
    JA_EN_PAIRS,
    JA_EN_XDEFAULT,
    EN_ONLY_PAGES,
    JA_ONLY_CLEANUP,
    LOCALE_LANG,
    LOCALE_CONTENT_LANG,
    RTL_LOCALES,
    absolute_url,
)


# ---------------------------------------------------------------------------
# URL <-> file path resolution

def url_to_file(url_path: str) -> Path | None:
    """Resolve a site URL path to an HTML file on disk.

    Conventions:
      "/foo/"     -> foo/index.html
      "/foo"      -> foo.html OR foo/index.html (whichever exists)
      "/"         -> index.html
    """
    rel = url_path.lstrip("/")
    if url_path.endswith("/"):
        candidate = REPO_ROOT / rel / "index.html" if rel else REPO_ROOT / "index.html"
        return candidate if candidate.exists() else None
    for cand in (REPO_ROOT / f"{rel}.html", REPO_ROOT / rel / "index.html"):
        if cand.exists():
            return cand
    return None


# ---------------------------------------------------------------------------
# Normalization plan: (file_path, locale, canonical_url, alternates, x_default)

def build_plan() -> list[tuple[Path, str, str, list[tuple[str, str]], str | None]]:
    plan: list[tuple[Path, str, str, list[tuple[str, str]], str | None]] = []

    # 1. Top cluster (10 locales referencing each other)
    cluster_alternates = [(loc, absolute_url(p)) for loc, p in TOP_CLUSTER]
    x_default_top = absolute_url(TOP_CLUSTER_XDEFAULT)
    for locale, path in TOP_CLUSTER:
        f = url_to_file(path)
        if f is None:
            print(f"[WARN] top cluster: file missing for {path}", file=sys.stderr)
            continue
        plan.append((f, locale, absolute_url(path), cluster_alternates, x_default_top))

    # 2. JA-EN pairs
    for ja_path, en_path in JA_EN_PAIRS:
        ja_file = url_to_file(ja_path)
        en_file = url_to_file(en_path)
        if ja_file is None or en_file is None:
            print(
                f"[WARN] pair skipped (missing files): {ja_path} <-> {en_path}",
                file=sys.stderr,
            )
            continue
        alts = [
            ("ja", absolute_url(ja_path)),
            ("en", absolute_url(en_path)),
        ]
        x_default = absolute_url(ja_path if JA_EN_XDEFAULT == "ja" else en_path)
        plan.append((ja_file, "ja", absolute_url(ja_path), alts, x_default))
        plan.append((en_file, "en", absolute_url(en_path), alts, x_default))

    # 3. EN-only pages: self-canonical, no hreflang alternate
    for en_path in EN_ONLY_PAGES:
        f = url_to_file(en_path)
        if f is None:
            print(f"[WARN] EN-only file missing: {en_path}", file=sys.stderr)
            continue
        plan.append((f, "en", absolute_url(en_path), [], None))

    # 4. JA-only cleanup pages: strip orphan hreflang
    for ja_path in JA_ONLY_CLEANUP:
        f = url_to_file(ja_path)
        if f is None:
            print(f"[WARN] JA-only cleanup file missing: {ja_path}", file=sys.stderr)
            continue
        plan.append((f, "ja", absolute_url(ja_path), [], None))

    return plan


# ---------------------------------------------------------------------------
# Auto plan: every other HTML file gets self-canonical + locale-from-path
# + content-language meta. No hreflang alternate (no symmetric pair exists).

EXCLUDED_DIR_PARTS = {
    "node_modules", "admin", "drafts", "docs", "scripts", "screenshots",
    "tools", "tiktok", "templates", ".git", ".github", ".claude", "js",
    "assets", "functions",
}

EXCLUDED_TOP_FILES = {"404.html"}

# Minor locale -> the locale code we use for <html lang>
LOCALE_FROM_DIR = {
    "en": "en",
    "ar": "ar",
    "es": "es",
    "id": "id",
    "ko": "ko",
    "pt-BR": "pt-BR",
    "tr": "tr",
    "zh": "zh-Hans",
    "zh-Hant": "zh-Hant",
}


def file_to_url(file_path: Path) -> str | None:
    rel = file_path.relative_to(REPO_ROOT).as_posix()
    if rel.endswith("/index.html"):
        return absolute_url("/" + rel[: -len("index.html")])
    if rel.endswith(".html"):
        # Match existing extension-less convention used in canonical/sitemap.
        return absolute_url("/" + rel[: -len(".html")])
    return None


def detect_locale_from_path(file_path: Path) -> str:
    rel_parts = file_path.relative_to(REPO_ROOT).parts
    if rel_parts and rel_parts[0] in LOCALE_FROM_DIR:
        return LOCALE_FROM_DIR[rel_parts[0]]
    return "ja"


def build_auto_plan(
    explicit_files: set[Path],
) -> list[tuple[Path, str, str, list[tuple[str, str]], str | None]]:
    """Cover every remaining .html file in the repo so that, after running,
    every public page emits at least <html lang>, self-canonical, and
    content-language meta. No hreflang alternate is added here."""
    auto: list[tuple[Path, str, str, list[tuple[str, str]], str | None]] = []
    for f in REPO_ROOT.rglob("*.html"):
        rel_parts = f.relative_to(REPO_ROOT).parts
        if any(p in EXCLUDED_DIR_PARTS for p in rel_parts):
            continue
        if rel_parts == ("index.html",):
            continue  # top page is already in TOP_CLUSTER explicit plan
        if f.name in EXCLUDED_TOP_FILES and len(rel_parts) == 1:
            continue
        if f in explicit_files:
            continue
        url = file_to_url(f)
        if url is None:
            continue
        locale = detect_locale_from_path(f)
        auto.append((f, locale, url, [], None))
    return auto


# ---------------------------------------------------------------------------
# Head-tag manipulation

# Patterns that match a SINGLE LINE of an owned tag (whitespace + tag).
# Used with re.fullmatch on the line stripped of its trailing newline.
OWNED_LINE_PATTERNS = [
    re.compile(r'\s*<link\s+rel="canonical"[^>]*>\s*'),
    re.compile(r'\s*<link\s+rel="alternate"\s+hreflang="[^"]+"[^>]*>\s*'),
    re.compile(r'\s*<meta\s+http-equiv="content-language"[^>]*>\s*'),
]

# Comments that this script OWNS (so re-runs don't accumulate them) and
# legacy comment markers that wrapped the old i18n block.
COMMENT_LINE_PATTERNS = [
    re.compile(r'\s*<!--\s*Canonical\s*&\s*Hreflang\s*-->\s*', re.IGNORECASE),
    re.compile(r'\s*<!--\s*hreflang.*?-->\s*', re.IGNORECASE),
    re.compile(r'\s*<!--\s*i18n:\s*managed by[^>]*-->\s*', re.IGNORECASE),
]


def _matches_any(line: str, patterns: list[re.Pattern]) -> bool:
    stripped = line.rstrip("\n")
    return any(p.fullmatch(stripped) for p in patterns)


def is_owned_line(line: str) -> bool:
    return _matches_any(line, OWNED_LINE_PATTERNS)


def is_owned_comment(line: str) -> bool:
    return _matches_any(line, COMMENT_LINE_PATTERNS)


def set_html_lang(text: str, locale: str) -> str:
    lang_attr = LOCALE_LANG[locale]
    is_rtl = locale in RTL_LOCALES

    def repl(m: re.Match) -> str:
        attrs = m.group(0)
        new = re.sub(r'\blang="[^"]*"', f'lang="{lang_attr}"', attrs)
        if 'lang=' not in new:
            new = new.replace('<html', f'<html lang="{lang_attr}"', 1)
        has_dir = 'dir=' in new
        if is_rtl and not has_dir:
            new = new.replace('<html', '<html dir="rtl"', 1)
        elif not is_rtl and has_dir:
            new = re.sub(r'\sdir="[^"]*"', '', new)
        return new

    return re.sub(r'<html\b[^>]*>', repl, text, count=1)


def build_block(
    locale: str,
    canonical_url: str,
    alternates: Iterable[tuple[str, str]],
    x_default_url: str | None,
) -> list[str]:
    """Return the i18n block as a list of lines (each ending with '\\n')."""
    lines = [
        "  <!-- i18n: managed by scripts/normalize_i18n_head.py -->\n",
        f'  <meta http-equiv="content-language" content="{LOCALE_CONTENT_LANG[locale]}">\n',
        f'  <link rel="canonical" href="{canonical_url}">\n',
    ]
    for hreflang, url in alternates:
        lines.append(f'  <link rel="alternate" hreflang="{hreflang}" href="{url}">\n')
    if x_default_url:
        lines.append(
            f'  <link rel="alternate" hreflang="x-default" href="{x_default_url}">\n'
        )
    return lines


def replace_i18n_lines(text: str, block_lines: list[str]) -> str:
    """Strip all owned tag/comment lines and insert block_lines at the
    position the first owned line used to occupy. If no owned line exists,
    insert just before </head>."""
    lines = text.splitlines(keepends=True)

    # Find index of first owned (tag) line
    first_owned_idx: int | None = None
    for i, line in enumerate(lines):
        if is_owned_line(line):
            first_owned_idx = i
            break

    if first_owned_idx is not None:
        # Insertion index in the *filtered* list = first_owned_idx minus the
        # number of comment-only owned lines stripped before that point.
        comments_before = sum(
            1 for line in lines[:first_owned_idx] if is_owned_comment(line)
        )
        insertion_idx = first_owned_idx - comments_before
        filtered = [
            line for line in lines if not (is_owned_line(line) or is_owned_comment(line))
        ]
        return "".join(
            filtered[:insertion_idx] + block_lines + filtered[insertion_idx:]
        )

    # No owned tags exist; place the block right before </head>.
    filtered = [line for line in lines if not is_owned_comment(line)]
    for i, line in enumerate(filtered):
        if "</head>" in line:
            return "".join(filtered[:i] + block_lines + filtered[i:])
    return text  # malformed (no </head>); leave alone


def normalize_file(
    file_path: Path,
    locale: str,
    canonical_url: str,
    alternates: list[tuple[str, str]],
    x_default_url: str | None,
    dry_run: bool = False,
) -> bool:
    original = file_path.read_text(encoding="utf-8")

    text = set_html_lang(original, locale)
    block_lines = build_block(locale, canonical_url, alternates, x_default_url)
    text = replace_i18n_lines(text, block_lines)

    if text == original:
        return False
    if not dry_run:
        file_path.write_text(text, encoding="utf-8")
    return True


# ---------------------------------------------------------------------------
# Main

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Don't write files")
    parser.add_argument(
        "--no-auto",
        action="store_true",
        help="Skip the auto plan that covers every uncovered HTML file",
    )
    args = parser.parse_args()

    plan = build_plan()
    explicit_files = {p[0] for p in plan}
    if not args.no_auto:
        plan.extend(build_auto_plan(explicit_files))

    changed = 0
    skipped = 0
    for file_path, locale, canonical, alternates, x_default in plan:
        rel = file_path.relative_to(REPO_ROOT)
        try:
            did = normalize_file(
                file_path, locale, canonical, alternates, x_default, args.dry_run
            )
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR] {rel}: {e}", file=sys.stderr)
            return 1
        if did:
            changed += 1
            if changed <= 5 or changed % 25 == 0:
                print(f"[update] {rel}  ({locale}, {len(alternates)} alts)")
        else:
            skipped += 1

    print(f"\nSummary: {changed} changed, {skipped} unchanged, {len(plan)} total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
