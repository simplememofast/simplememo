"""
Generate sitemap-ja.xml, sitemap-en.xml, and sitemap.xml (index) for
simplememofast.com.

Strategy:
  - Parse the existing sitemap.xml to preserve <lastmod> values for
    every URL that's already listed. This avoids unnecessary churn.
  - Group entries by sitemap target:
      sitemap-ja.xml  -> ja root URLs + 8 minor-locale homepage stubs
      sitemap-en.xml  -> /en/* URLs
      sitemap.xml     -> index referencing the two above
  - Annotate each <url> with <xhtml:link rel="alternate"> entries pulled
    from i18n_config (TOP_CLUSTER for the homepages, JA_EN_PAIRS for
    paired pages).

Usage:
    python3 scripts/generate_sitemap.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from i18n_config import (  # noqa: E402
    SITE_URL,
    TOP_CLUSTER,
    TOP_CLUSTER_XDEFAULT,
    JA_EN_PAIRS,
    JA_EN_XDEFAULT,
    absolute_url,
)


SITEMAP_INDEX_PATH = REPO_ROOT / "sitemap.xml"
SITEMAP_JA_PATH = REPO_ROOT / "sitemap-ja.xml"
SITEMAP_EN_PATH = REPO_ROOT / "sitemap-en.xml"

MINOR_LOCALES = {"ar", "es", "id", "ko", "pt-BR", "tr", "zh", "zh-Hant"}
TODAY = date.today().isoformat()

# URL -> (locale_for_html_lang, url_path)
TOP_CLUSTER_PATHS = {absolute_url(p): (loc, p) for loc, p in TOP_CLUSTER}
TOP_CLUSTER_ALTERNATES = [(loc, absolute_url(p)) for loc, p in TOP_CLUSTER]
TOP_CLUSTER_X_DEFAULT = absolute_url(TOP_CLUSTER_XDEFAULT)

PAIR_BY_URL: dict[str, dict] = {}
for ja_path, en_path in JA_EN_PAIRS:
    ja_url = absolute_url(ja_path)
    en_url = absolute_url(en_path)
    alts = [("ja", ja_url), ("en", en_url)]
    xdef = ja_url if JA_EN_XDEFAULT == "ja" else en_url
    info = {"alternates": alts, "x_default": xdef}
    PAIR_BY_URL[ja_url] = info
    PAIR_BY_URL[en_url] = info


# ---------------------------------------------------------------------------

def parse_existing_lastmods(path: Path) -> dict[str, str]:
    """Return {url: lastmod} from an existing sitemap.xml. Used to
    preserve previously-published lastmod values."""
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    for m in re.finditer(
        r"<url>\s*<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>",
        text,
    ):
        out[m.group(1).strip()] = m.group(2).strip()
    return out


def url_for_file(file_path: Path) -> str | None:
    """Map a file path to its public URL. None if the file should not
    appear in the sitemap (drafts, admin, etc.)."""
    rel = file_path.relative_to(REPO_ROOT).as_posix()
    parts = rel.split("/")
    excluded_top = {
        "node_modules", "admin", "drafts", "docs", "scripts", "js",
        "assets", "functions", "screenshots", "tools", "tiktok", ".git",
        ".github", ".claude",
    }
    if parts[0] in excluded_top:
        return None
    if rel == "404.html":
        return None
    if rel.endswith("/index.html"):
        return SITE_URL + "/" + rel[: -len("index.html")]
    if rel.endswith(".html"):
        # Strip .html for top-level legal/contact/etc., keep for blog posts
        # to match existing sitemap convention.
        # Existing sitemap has /privacy, /legal, /terms, /contact, /faq
        # extension-less; blog posts and en/blog posts are extension-less too.
        return SITE_URL + "/" + rel[: -len(".html")]
    return None


def collect_urls() -> list[str]:
    urls: set[str] = set()
    for f in REPO_ROOT.rglob("*.html"):
        u = url_for_file(f)
        if u:
            urls.add(u)
    return sorted(urls)


# ---------------------------------------------------------------------------

def determine_target(url: str) -> str:
    """Return 'en' for en URLs, 'ja' for everything else (incl. minor
    locale stubs)."""
    rest = url[len(SITE_URL):]
    if rest == "/en/" or rest.startswith("/en/"):
        return "en"
    return "ja"


def alternates_for_url(url: str) -> tuple[list[tuple[str, str]], str | None]:
    """Return (alternates, x_default_url) for a URL. Empty list if none."""
    if url in TOP_CLUSTER_PATHS:
        return TOP_CLUSTER_ALTERNATES, TOP_CLUSTER_X_DEFAULT
    pair = PAIR_BY_URL.get(url)
    if pair:
        return pair["alternates"], pair["x_default"]
    return [], None


def render_url_block(url: str, lastmod: str) -> str:
    alts, xdef = alternates_for_url(url)
    lines = ["  <url>"]
    lines.append(f"    <loc>{escape(url)}</loc>")
    lines.append(f"    <lastmod>{escape(lastmod)}</lastmod>")
    for hreflang, alt_url in alts:
        lines.append(
            f'    <xhtml:link rel="alternate" hreflang="{escape(hreflang)}" '
            f'href="{escape(alt_url)}"/>'
        )
    if xdef:
        lines.append(
            f'    <xhtml:link rel="alternate" hreflang="x-default" '
            f'href="{escape(xdef)}"/>'
        )
    lines.append("  </url>")
    return "\n".join(lines)


def render_sitemap(urls_with_lastmods: list[tuple[str, str]]) -> str:
    body = "\n".join(render_url_block(u, lm) for u, lm in urls_with_lastmods)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        f"{body}\n"
        "</urlset>\n"
    )


def render_sitemap_index(parts: list[tuple[str, str]]) -> str:
    """parts: [(loc_url, lastmod), ...]"""
    body_lines = []
    for loc, lm in parts:
        body_lines.append("  <sitemap>")
        body_lines.append(f"    <loc>{escape(loc)}</loc>")
        body_lines.append(f"    <lastmod>{escape(lm)}</lastmod>")
        body_lines.append("  </sitemap>")
    body = "\n".join(body_lines)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</sitemapindex>\n"
    )


# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    existing_lastmods = parse_existing_lastmods(SITEMAP_INDEX_PATH)
    urls = collect_urls()

    ja_entries: list[tuple[str, str]] = []
    en_entries: list[tuple[str, str]] = []

    for url in urls:
        lastmod = existing_lastmods.get(url, TODAY)
        target = determine_target(url)
        if target == "en":
            en_entries.append((url, lastmod))
        else:
            ja_entries.append((url, lastmod))

    ja_entries.sort()
    en_entries.sort()

    ja_xml = render_sitemap(ja_entries)
    en_xml = render_sitemap(en_entries)
    index_xml = render_sitemap_index([
        (f"{SITE_URL}/sitemap-ja.xml", TODAY),
        (f"{SITE_URL}/sitemap-en.xml", TODAY),
    ])

    print(f"sitemap-ja.xml: {len(ja_entries)} URLs")
    print(f"sitemap-en.xml: {len(en_entries)} URLs")
    print(f"sitemap.xml:    index of 2 sitemaps")

    if args.dry_run:
        print("[dry-run] no files written")
        return 0

    SITEMAP_JA_PATH.write_text(ja_xml, encoding="utf-8")
    SITEMAP_EN_PATH.write_text(en_xml, encoding="utf-8")
    SITEMAP_INDEX_PATH.write_text(index_xml, encoding="utf-8")
    print("Written:")
    print(f"  {SITEMAP_JA_PATH.relative_to(REPO_ROOT)}")
    print(f"  {SITEMAP_EN_PATH.relative_to(REPO_ROOT)}")
    print(f"  {SITEMAP_INDEX_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
