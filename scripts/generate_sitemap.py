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
    python3 scripts/generate_sitemap.py [--dry-run] [--check]
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
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
# 【2026-08-22】JSTで取る。この日付は「gitに履歴がまだ無いファイル」の lastmod に
# 使われるため、新規ページの公開日そのものになる。ランナーのローカル日付（＝UTC）で
# 取っていた旧実装では、日本時間の朝に走る定期実行（主系06:00・副系08:30・再試行09:20
# はいずれも UTC では前日）が、**その日公開した記事に前日の lastmod を付けていた**。
# Runbook が「日付は必ず JST で取ること」と定めているのと同じ理由。
JST = timezone(timedelta(hours=9))
TODAY = datetime.now(JST).date().isoformat()

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
    # 【2026-08-22】%cs はコミットに記録されたタイムゾーンで日付を出す。GitHubの
    # マージコミットはUTCなので、日本時間の朝に出荷した記事は前日の日付になっていた。
    # TODAY をJSTにしたのと同じ理由で、git由来の日付もJSTへ揃える
    # （--date=format-local は TZ を見るので、環境変数で明示する）。
    env = {**os.environ, "TZ": "Asia/Tokyo"}
    out = subprocess.run(
        ["git", "log", "--format=%x01%cd", "--date=format-local:%Y-%m-%d", "--name-only"],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True, env=env,
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


def read_existing_lastmods() -> dict[str, str]:
    """URL -> lastmod as currently published across all child sitemaps.

    Used as a monotonic floor on regeneration: the 2026-07-07 audit found
    a fresh regen would have rewritten 44 lastmods, 38 of them BACKWARD.
    Root cause: cowork branches commit small (<threshold) content edits
    and regenerate on-branch, but the squash-merge collapses them into a
    single >threshold commit that build_lastmod_index() then skips as a
    mechanical sweep — so git history can no longer reproduce the dates
    that were honestly published. A regen must never roll a published
    lastmod back; final_lastmod = max(published, git-derived).
    """
    lastmods: dict[str, str] = {}
    pat = re.compile(
        r"<loc>(.*?)</loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})</lastmod>", re.S
    )
    for path in (SITEMAP_JA_PATH, SITEMAP_EN_PATH, SITEMAP_LOCALES_PATH):
        if path.exists():
            for loc, lm in pat.findall(path.read_text(encoding="utf-8")):
                lastmods[loc.strip()] = lm
    return lastmods


def git_lastmod(file_path: Path) -> str:
    """Date (YYYY-MM-DD) of the last non-sweep commit touching the file,
    or "" when git gives no signal (untracked, or every commit touching it
    was classified as a mechanical sweep).

    【2026-08-22】ここは TODAY を返していた。すると「スイープ判定される変更しか
    履歴に無いファイル」（実例: /download/）は、**再生成のたびに lastmod が
    その日へ動く**。実際には何も変わっていないので、クローラに嘘の更新日を
    毎日配ることになり、2026-08-19 と 08-20 の2回、手でlastmodを戻している。
    空文字を返し、TODAY を当てるかどうかは呼び出し側（main）が決める。"""
    global LASTMOD_INDEX
    if not LASTMOD_INDEX:
        LASTMOD_INDEX = build_lastmod_index()
    rel = file_path.relative_to(REPO_ROOT).as_posix()
    return LASTMOD_INDEX.get(rel, "")

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
        # build/ は dashboard.mjs の生成物（.gitignore 済み・本番へは出ない）。
        # 生成してから --check を回すと「sitemap に無い」で落ちるので外す。
        "build",
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

def urls_in(xml: str) -> set[str]:
    return set(re.findall(r"<loc>([^<]+)</loc>", xml))


def check_committed(rendered: dict[Path, str]) -> int:
    """コミット済みのsitemapが、いまのページ構成と一致しているかを検査する。

    【なぜ必要か】このスクリプトを回し忘れても、2026-08-22 までCIは緑のまま通った。
    SEO Validation にあったのは `--dry-run`（件数を表示するだけで、コミット済みの
    ファイルを一切見ない）で、seo-check.js の checkSitemap() が読むのは
    sitemap.xml（3つの子sitemapを指すインデックス）だけだったため、**新しい記事が
    sitemapに載っていなくても検知できなかった**。載っていない記事は、robots.txt が
    指す先に存在しないまま公開されることになる。

    【lastmodは比較しない】git履歴がスイープ判定される（＝LASTMOD_INDEX に載らない）
    ファイルの lastmod は TODAY にフォールバックするので、再生成のたびに勝手に動く。
    それを差分として扱うと毎日落ちる検査になり、誰も見なくなる。ここで守りたいのは
    「URLが載っているか」なので、**比較対象はURLの集合だけ**にしてある。
    """
    problems = 0
    for path, xml in rendered.items():
        name = path.relative_to(REPO_ROOT)
        if not path.exists():
            print(f"  MISSING FILE  {name}")
            problems += 1
            continue
        want = urls_in(xml)
        have = urls_in(path.read_text(encoding="utf-8"))
        for url in sorted(want - have):
            print(f"  NOT LISTED    {name}: {url}")
            problems += 1
        for url in sorted(have - want):
            print(f"  STALE ENTRY   {name}: {url}")
            problems += 1

    if problems:
        print(
            f"\nFAIL: {problems} 件のずれ。`python3 scripts/generate_sitemap.py` を"
            f"実行して、生成された sitemap を同じコミットに含めてください。"
        )
        return 1

    print("sitemap: コミット済みのURL集合は現在のページ構成と一致（lastmodは比較対象外）")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--check",
        action="store_true",
        help="コミット済みのsitemapに載っているURLの集合が、いま生成される集合と "
             "一致するかだけを検査する。差があれば非ゼロで終わる。書き込みはしない。",
    )
    args = parser.parse_args()

    url_files = collect_urls()
    existing = read_existing_lastmods()

    entries: dict[str, list[tuple[str, str]]] = {"ja": [], "en": [], "locales": []}
    floored = 0
    for url in sorted(url_files):
        computed = git_lastmod(url_files[url])
        published = existing.get(url, "")
        # Monotonic floor — ISO date strings compare lexicographically.
        # 両方とも空になるのは「git履歴が無く、まだ公開もされていない」＝
        # 本当に新規のページだけで、そのときだけ TODAY（JST）を当てる。
        # git信号が無いだけの既存ページは、公開済みの日付をそのまま保つ。
        lastmod = max(published, computed) or TODAY
        if computed and published > computed:
            floored += 1
        entries[determine_target(url)].append((url, lastmod))

    ja_xml = render_sitemap(entries["ja"])
    en_xml = render_sitemap(entries["en"])
    locales_xml = render_sitemap(entries["locales"])
    def newest(part: list[tuple[str, str]]) -> str:
        """Index entries advertise the child's real latest change, not the
        run date — an unchanged child with a fresh lastmod wastes crawler
        trust (2026-07-02 audit LOW #31)."""
        return max((lm for _, lm in part), default=TODAY)

    index_xml = render_sitemap_index([
        (f"{SITE_URL}/sitemap-ja.xml", newest(entries["ja"])),
        (f"{SITE_URL}/sitemap-en.xml", newest(entries["en"])),
        (f"{SITE_URL}/sitemap-locales.xml", newest(entries["locales"])),
    ])

    print(f"sitemap-ja.xml:      {len(entries['ja'])} URLs")
    print(f"sitemap-en.xml:      {len(entries['en'])} URLs")
    print(f"sitemap-locales.xml: {len(entries['locales'])} URLs")
    print(f"sitemap.xml:         index of 3 sitemaps")
    print(
        f"lastmod floor:       kept {floored} published dates that git "
        f"history would have moved backward"
    )

    if args.check:
        return check_committed({
            SITEMAP_JA_PATH: ja_xml,
            SITEMAP_EN_PATH: en_xml,
            SITEMAP_LOCALES_PATH: locales_xml,
            SITEMAP_INDEX_PATH: index_xml,
        })

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
