"""
Generate sitemap-ja.xml, sitemap-en.xml, and sitemap.xml (index) for
simplememofast.com.

Strategy:
  - Trace content, structured data and link changes through full Git history.
    Ignore CSS/JS/attribution-only changes, regardless of commit size.
    Existing sitemap dates never override the verified source history.
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
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from xml.sax.saxutils import escape
from xml.etree import ElementTree as ET

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from sitemap_lastmod import content_lastmods, git  # noqa: E402

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
# Unpublished content and changed child XML use a JST candidate date.
# Committed pages use the dated content change in Git, never today's date.
JST = timezone(timedelta(hours=9))
TODAY = datetime.now(JST).date().isoformat()

NOINDEX_RE = re.compile(
    r'<meta\s+name="robots"\s+content="[^"]*noindex', re.IGNORECASE
)


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


def xml_dates(xml: str) -> dict[str, str | None]:
    root = ET.fromstring(xml)
    if root.tag.rsplit("}", 1)[-1] not in {"urlset", "sitemapindex"}:
        raise ValueError("Unknown sitemap root")
    dates = {}
    for entry in root:
        if len(entry.findall("{*}loc")) != 1 or len(entry.findall("{*}lastmod")) > 1:
            raise ValueError("Duplicate loc or lastmod elements")
        loc = entry.findtext("{*}loc")
        if not loc or loc in dates:
            raise ValueError("Missing or duplicate loc")
        value = entry.findtext("{*}lastmod")
        if value:
            if date.fromisoformat(value).isoformat() != value or value > TODAY:
                raise ValueError("Invalid or future lastmod")
        dates[loc] = value
    return dates


def child_lastmod(path: Path, rendered: str) -> str:
    """Sitemap-index dates describe the child XML file, not its newest article."""
    rel = path.relative_to(REPO_ROOT).as_posix()
    import subprocess
    try:
        committed = git(REPO_ROOT, "show", f"HEAD:{rel}")
    except subprocess.CalledProcessError:
        committed = None
    if committed != rendered:
        return TODAY
    epoch = git(REPO_ROOT, "log", "-1", "--first-parent", "--format=%ct", "--", rel).strip()
    return datetime.fromtimestamp(int(epoch), JST).date().isoformat() if epoch else TODAY


def check_committed(rendered: dict[Path, str]) -> int:
    """コミット済みのsitemapが、いまのページ構成と一致しているかを検査する。

    【なぜ必要か】このスクリプトを回し忘れても、2026-08-22 までCIは緑のまま通った。
    SEO Validation にあったのは `--dry-run`（件数を表示するだけで、コミット済みの
    ファイルを一切見ない）で、seo-check.js の checkSitemap() が読むのは
    sitemap.xml（3つの子sitemapを指すインデックス）だけだったため、**新しい記事が
    sitemapに載っていなくても検知できなかった**。載っていない記事は、robots.txt が
    指す先に存在しないまま公開されることになる。

    URL集合に加え、内容履歴から導出したlastmodと突き合わせる。
    日付の水増し・古い日付・再生成忘れを同じ検査で止める。
    """
    problems = 0
    for path, xml in rendered.items():
        # 自己テストは REPO_ROOT の外（tmpdir）の検体を渡す。**壊れたsitemapを
        # リポジトリに置かない**ため。relative_to はそこで ValueError を投げる。
        try:
            name = path.relative_to(REPO_ROOT)
        except ValueError:
            name = path
        if not path.exists():
            print(f"  MISSING FILE  {name}")
            problems += 1
            continue
        want = urls_in(xml)
        actual = path.read_text(encoding="utf-8")
        have = urls_in(actual)
        try:
            expected_dates = xml_dates(xml)
            actual_dates = xml_dates(actual)
        except (ET.ParseError, ValueError) as error:
            print(f"  INVALID XML   {name}: {error}")
            problems += 1
            continue
        for url in sorted(want & have):
            if actual_dates.get(url) != expected_dates.get(url):
                print(f"  WRONG LASTMOD {name}: {url}: {actual_dates.get(url)} -> {expected_dates.get(url)}")
                problems += 1
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

    print("sitemap: URL集合と内容履歴に基づくlastmodが一致")
    return 0


def run_selftest() -> int:
    """**落ちることを確かめる。**data/check-selftests.json:
    「落ちることを確かめていない検査は、無いのと同じ」。

    この検査は台帳の外にいた —— `check-selftests.mjs` の列挙が `node` で始まる行
    しか見ておらず、`python3` のこれを構造的に見られなかった
    （data/autopilot-actions.json#act-ci-selftest-ratchet-py-blind）。

    **この道具は一度、まさにその形で効いていなかった。**2026-08-22 まで CI に
    あったのは `--dry-run`（件数を表示するだけでコミット済みのファイルを一切
    見ない）で、**generate_sitemap.py を回し忘れた PR を一度も止められなかった。**
    `--check` に替えて URL の集合を突き合わせるようにしたが、
    **その `--check` が落ちることは誰も確かめていなかった。**ここで確かめる。

    検体は文字列と tmpdir。**壊れた sitemap をリポジトリに置かない。**
    """
    import contextlib
    import io
    import tempfile

    failures: list[str] = []
    tested = 0

    def quiet(fn):
        """check_committed は判定と同時に人向けの説明を刷る。**自己テストの中では
        黙らせる** —— 通っている回の CI ログに「FAIL: 1 件のずれ」が並ぶと、
        読む人が本物の失敗を探せなくなる。返り値だけを見る。"""
        with contextlib.redirect_stdout(io.StringIO()):
            return fn()

    def t(name: str, cond: bool) -> None:
        nonlocal tested
        tested += 1
        if not cond:
            failures.append(name)

    rel = lambda p: REPO_ROOT / p  # noqa: E731

    # --- URL の作り方 ---
    t("ルートの index.html は / になる", url_for_file(rel("index.html")) == SITE_URL + "/")
    t("下位の index.html は末尾スラッシュ", url_for_file(rel("en/index.html")) == SITE_URL + "/en/")
    t("index 以外の .html は拡張子を落とす", url_for_file(rel("faq.html")) == SITE_URL + "/faq")
    t("404.html は載せない", url_for_file(rel("404.html")) is None)
    t(".html 以外は載せない", url_for_file(rel("robots.txt")) is None)
    # 除外ディレクトリ。build/ は生成物で、外し忘れると --check が常に落ちる。
    for d in ("docs", "scripts", "admin", "build", "tools"):
        t(f"{d}/ 配下は載せない", url_for_file(rel(f"{d}/x.html")) is None)
    # 除外は先頭セグメントの完全一致。前方一致で別ディレクトリを巻き込まない。
    t("除外名と前方一致するだけの面は載せる",
      url_for_file(rel("docsite/x.html")) == SITE_URL + "/docsite/x")

    # --- 行き先の振り分け ---
    t("/en/ は sitemap-en", determine_target(SITE_URL + "/en/guides/") == "en")
    t("少数ロケールのトップは sitemap-locales", determine_target(SITE_URL + "/ko/") == "locales")
    t("それ以外は sitemap-ja", determine_target(SITE_URL + "/obsidian/") == "ja")

    # --- noindex ---
    t("noindex の面を拾う",
      NOINDEX_RE.search('<meta name="robots" content="noindex, follow">') is not None)
    t("index の面は拾わない",
      NOINDEX_RE.search('<meta name="robots" content="index, follow">') is None)

    # --- 突き合わせ（2026-08-22 の穴そのもの） ---
    t("urls_in は loc を拾う",
      urls_in("<loc>https://a/</loc><loc>https://b/</loc>") == {"https://a/", "https://b/"})

    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / "sitemap-ja.xml"
        want = "<urlset><url><loc>https://x/a/</loc><lastmod>2026-01-01</lastmod></url>"\
               "<url><loc>https://x/b/</loc><lastmod>2026-01-01</lastmod></url></urlset>"

        f.write_text(want, encoding="utf-8")
        t("一致していれば 0", quiet(lambda: check_committed({f: want})) == 0)

        # **回し忘れた PR を止める。**新しい面が sitemap に無い状態。
        f.write_text(want.replace("<url><loc>https://x/b/</loc><lastmod>2026-01-01</lastmod></url>", ""), encoding="utf-8")
        t("生成される URL が載っていなければ落ちる（回し忘れを止める）",
          quiet(lambda: check_committed({f: want})) == 1)

        # 消したページが残っている状態。
        f.write_text(want.replace("</urlset>", "<url><loc>https://x/gone/</loc></url></urlset>"), encoding="utf-8")
        t("消えた面が sitemap に残っていれば落ちる", quiet(lambda: check_committed({f: want})) == 1)

        f.write_text(want.replace("2026-01-01", "2020-12-31"), encoding="utf-8")
        t("古いlastmodを検知する", quiet(lambda: check_committed({f: want})) == 1)
        f.write_text(want.replace("2026-01-01", "2099-01-01"), encoding="utf-8")
        t("未来のlastmodを拒否する", quiet(lambda: check_committed({f: want})) == 1)
        f.write_text(want.replace("2026-01-01", "2026-02-30"), encoding="utf-8")
        t("存在しない暦日を拒否する", quiet(lambda: check_committed({f: want})) == 1)
        f.write_text(want.replace("</urlset>", "<url><loc>https://x/a/</loc></url></urlset>"), encoding="utf-8")
        t("重複URLを拒否する", quiet(lambda: check_committed({f: want})) == 1)
        f.write_text(want[:-3], encoding="utf-8")
        t("壊れたXMLを拒否する", quiet(lambda: check_committed({f: want})) == 1)

        f.unlink()
        t("ファイルが無ければ落ちる", quiet(lambda: check_committed({f: want})) == 1)

    # --- 出力の形 ---
    block = render_url_block("https://x/a&b/", "2026-01-01")
    t("loc と lastmod を出す", "<loc>https://x/a&amp;b/</loc>" in block and "<lastmod>2026-01-01</lastmod>" in block)
    t("XML の特殊文字をエスケープする", "&amp;" in block and "a&b" not in block)

    for f2 in failures:
        print(f"  x {f2}")
    print(f"自己テスト {tested} 件中 {len(failures)} 件失敗")
    from test_sitemap_lastmod import run_tests
    history_ok = run_tests()
    return 1 if failures or not history_ok else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--selftest", action="store_true",
        help="この検査自身が落ちることを確かめる（sitemap は書かない）",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="URL集合と内容履歴に基づくlastmodを検査。差があれば非ゼロ。書き込みはしない。",
    )
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()

    url_files = collect_urls()
    history = content_lastmods(REPO_ROOT, list(url_files.values()))
    entries: dict[str, list[tuple[str, str]]] = {"ja": [], "en": [], "locales": []}
    for url in sorted(url_files):
        rel = url_files[url].relative_to(REPO_ROOT).as_posix()
        entries[determine_target(url)].append((url, history[rel]["date"]))

    ja_xml = render_sitemap(entries["ja"])
    en_xml = render_sitemap(entries["en"])
    locales_xml = render_sitemap(entries["locales"])
    index_xml = render_sitemap_index([
        (f"{SITE_URL}/sitemap-ja.xml", child_lastmod(SITEMAP_JA_PATH, ja_xml)),
        (f"{SITE_URL}/sitemap-en.xml", child_lastmod(SITEMAP_EN_PATH, en_xml)),
        (f"{SITE_URL}/sitemap-locales.xml", child_lastmod(SITEMAP_LOCALES_PATH, locales_xml)),
    ])

    print(f"sitemap-ja.xml:      {len(entries['ja'])} URLs")
    print(f"sitemap-en.xml:      {len(entries['en'])} URLs")
    print(f"sitemap-locales.xml: {len(entries['locales'])} URLs")
    print(f"sitemap.xml:         index of 3 sitemaps")
    print(f"lastmod: {len(history)} pages traced through content history (no date floor)")

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
