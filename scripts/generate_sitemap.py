"""
Generate sitemap-ja.xml, sitemap-en.xml, and sitemap.xml (index) for
simplememofast.com.

Strategy:
  - Derive <lastmod> per URL from git history (last commit touching the
    file, skipping known mechanical sweep commits by subject prefix), so
    lastmod reflects real content changes instead of the deploy date.
  - Skip pages whose HTML declares robots noindex.
  - Group entries by sitemap target:
      sitemap-ja.xml      -> ja root URLs
      sitemap-en.xml      -> /en/* URLs
      sitemap-locales.xml -> 8 minor-locale homepage stubs
      sitemap.xml         -> index referencing the three above
  - Annotate each <url> with <xhtml:link rel="alternate"> entries pulled
    from i18n_config (TOP_CLUSTER for the homepages, JA_EN_PAIRS for
    paired pages).

Usage:
    python3 scripts/generate_sitemap.py [--dry-run]
"""

from __future__ import annotations

import argparse
import re
import subprocess
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
SITEMAP_LOCALES_PATH = REPO_ROOT / "sitemap-locales.xml"

MINOR_LOCALES = {"ar", "es", "id", "ko", "pt-BR", "tr", "zh", "zh-Hant"}
TODAY = date.today().isoformat()

# A commit that touches more than this many HTML pages at once is treated
# as a mechanical sweep (cache-version bumps, meta cleanups, sitewide
# find-and-replace) and ignored when deriving lastmod. Real content edits
# land in small commits on this repo.
MECHANICAL_SWEEP_THRESHOLD = 40

NOINDEX_RE = re.compile(
    r'<meta\s+name="robots"\s+content="[^"]*noindex', re.IGNORECASE
)


def build_lastmod_index() -> dict[str, str]:
    """Map repo-relative file path -> date of the last commit that touched
    it as part of a non-sweep change (see MECHANICAL_SWEEP_THRESHOLD)."""
    out = subprocess.run(
        ["git", "log", "--format=%x01%cs", "--name-only"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout
    lastmod: dict[str, str] = {}
    for chunk in out.split("\x01"):
        if not chunk.strip():
            continue
        lines = chunk.strip().splitlines()
        cs, files = lines[0].strip(), [l.strip() for l in lines[1:] if l.strip()]
        html_files = [f for f in files if f.endswith(".html")]
        if len(html_files) > MECHANICAL_SWEEP_THRESHOLD:
            continue
        # git log is newest-first: keep the first (= most recent) date seen
        for f in files:
            lastmod.setdefault(f, cs)
    return lastmod


LASTMOD_INDEX: dict[str, str] = {}


def git_lastmod(file_path: Path) -> str:
    """Date (YYYY-MM-DD) of the last non-sweep commit touching the file.
    Falls back to TODAY for untracked/new files."""
    global LASTMOD_INDEX
    if not LASTMOD_INDEX:
        LASTMOD_INDEX = build_lastmod_index()
    rel = file_path.relative_to(REPO_ROOT).as_posix()
    return LASTMOD_INDEX.get(rel, TODAY)

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
    if rel == "index.html":  # root homepage must map to /, not /index
        return SITE_URL + "/"
    if rel.endswith("/index.html"):
        return SITE_URL + "/" + rel[: -len("index.html")]
    if rel.endswith(".html"):
        # Strip .html for top-level legal/contact/etc., keep for blog posts
        # to match existing sitemap convention.
        # Existing sitemap has /privacy, /legal, /terms, /contact, /faq
        # extension-less; blog posts and en/blog posts are extension-less too.
        return SITE_URL + "/" + rel[: -len(".html")]
    return None


def collect_urls() -> dict[str, Path]:
    """Return {url: file_path}, skipping noindex pages."""
    urls: dict[str, Path] = {}
    for f in REPO_ROOT.rglob("*.html"):
        u = url_for_file(f)
        if not u:
            continue
        try:
            head = f.read_text(encoding="utf-8", errors="replace")[:6000]
        except OSError:
            continue
        if NOINDEX_RE.search(head):
            continue
        urls[u] = f
    return urls


# ---------------------------------------------------------------------------

def determine_target(url: str) -> str:
    """Return 'en' for en URLs, 'locales' for minor-locale homepage
    stubs, 'ja' for everything else."""
    rest = url[len(SITE_URL):]
    if rest == "/en/" or rest.startswith("/en/"):
        return "en"
    if rest.strip("/") in MINOR_LOCALES:
        return "locales"
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

    url_files = collect_urls()

    entries: dict[str, list[tuple[str, str]]] = {"ja": [], "en": [], "locales": []}
    for url in sorted(url_files):
        lastmod = git_lastmod(url_files[url])
        entries[determine_target(url)].append((url, lastmod))

    ja_xml = render_sitemap(entries["ja"])
    en_xml = render_sitemap(entries["en"])
    locales_xml = render_sitemap(entries["locales"])
    index_xml = render_sitemap_index([
        (f"{SITE_URL}/sitemap-ja.xml", TODAY),
        (f"{SITE_URL}/sitemap-en.xml", TODAY),
        (f"{SITE_URL}/sitemap-locales.xml", TODAY),
    ])

    print(f"sitemap-ja.xml:      {len(entries['ja'])} URLs")
    print(f"sitemap-en.xml:      {len(entries['en'])} URLs")
    print(f"sitemap-locales.xml: {len(entries['locales'])} URLs")
    print(f"sitemap.xml:         index of 3 sitemaps")

    if args.dry_run:
        print("[dry-run] no files written")
        return 0

    SITEMAP_JA_PATH.write_text(ja_xml, encoding="utf-8")
    SITEMAP_EN_PATH.write_text(en_xml, encoding="utf-8")
    SITEMAP_LOCALES_PATH.write_text(locales_xml, encoding="utf-8")
    SITEMAP_INDEX_PATH.write_text(index_xml, encoding="utf-8")
    print("Written:")
    print(f"  {SITEMAP_JA_PATH.relative_to(REPO_ROOT)}")
    print(f"  {SITEMAP_EN_PATH.relative_to(REPO_ROOT)}")
    print(f"  {SITEMAP_LOCALES_PATH.relative_to(REPO_ROOT)}")
    print(f"  {SITEMAP_INDEX_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
