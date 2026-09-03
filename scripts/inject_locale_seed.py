"""
Seed the reader's language preference on English-served pages.

The problem this solves
-----------------------
163 pages are still dual-DOM: one URL carries both languages and
`js/lang.js` toggles them. Its resolution order is

    ?lang=  >  localStorage['simple-memo-lang']  >  'ja'

Nothing ever writes that key except an explicit click on the JA/EN
switcher — and **not one of the 44 pages under /en/ even loads lang.js**
(verified: `grep -rl js/lang.js en/` is empty). So a reader who lands on
an English page and follows any link into a dual-DOM page gets Japanese,
because storage is empty and the default is 'ja'. 60 dual-DOM pages are
linked from /en/, /guides/ (105 links), /vs/ (99) and /use-cases/ (90)
among them.

`?lang=en` on those links would fix the render but is the wrong trade:
it puts a crawlable parameterised twin of every dual-DOM URL into the
index, which is exactly what lang.js's own comment says to avoid.

So: state the locale once, on the page that already knows it. Every page
under /en/ writes 'en' into the key **only when nothing is stored yet**,
before the reader navigates anywhere. The dual-DOM pages then resolve to
English on their own, with no new URLs and no change to what crawlers see
(a bot renders each page cold, finds no stored value, and still gets the
Japanese default — the indexed language of those URLs is unchanged).

Not injected into JA pages: 'ja' is already the fallback, so seeding it
would be a no-op that touches 200+ files.

Known trade-off: a Japanese reader whose *first* page on the site is an
English one will then see English on dual-DOM pages. The switcher on
those pages flips it back and that choice persists, and the reverse case
(an English reader stuck in Japanese) is the one actually being reported,
so the asymmetry is deliberate.

This does NOT make the embedded English content rank in English — it is
still `display:none` at a Japanese URL. Only splitting a page into a real
/en/ counterpart does that (see scripts/extract_en_page.py and the
JA_EN_PAIRS list in scripts/i18n_config.py).

Idempotent: re-running does not add the snippet twice.

Usage:
    python3 scripts/inject_locale_seed.py [--dry-run] [--check]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EN_DIR = REPO_ROOT / "en"

MARKER = "locale-seed"

# Synchronous and tiny so it runs before the reader can click away, and
# wrapped because localStorage throws in Safari private mode.
SNIPPET = (
    '<!-- locale-seed: declare EN once so dual-DOM pages resolve to English '
    '(scripts/inject_locale_seed.py) -->\n'
    "  <script>try{var k='simple-memo-lang';"
    "if(!localStorage.getItem(k))localStorage.setItem(k,'en')}catch(e){}</script>"
)

ANCHOR = "</head>"


def transform(text: str) -> tuple[str, bool]:
    """Return (new_text, changed)."""
    if MARKER in text:
        return text, False
    if ANCHOR not in text:
        return text, False
    # Insert as the last thing in <head> so it cannot delay the LCP image
    # or the stylesheet, while still running before any navigation.
    head, sep, tail = text.rpartition(ANCHOR)
    return f"{head}  {SNIPPET}\n{sep}{tail}", True


def iter_en_pages() -> list[Path]:
    return sorted(p for p in EN_DIR.rglob("*.html"))


def run_selftest() -> int:
    """**落ちることを確かめる。**data/check-selftests.json:
    「落ちることを確かめていない検査は、無いのと同じ」。

    この検査は長らく台帳の外にいた —— `check-selftests.mjs` の列挙が
    `node` で始まる行しか見ておらず、`python3` のこれを構造的に見られなかった
    （data/autopilot-actions.json#act-ci-selftest-ratchet-py-blind）。

    固定するのは、**壊れても赤くならない**側の性質である。この道具が黙って
    間違えると、英語の読者が dual-DOM の面で日本語を見続けるか（種が入らない）、
    逆に日本語の読者の選択が毎回上書きされるか（`if(!getItem)` が消える）で、
    どちらも CI では何も起きない。

    disk には何も書かない。
    """
    failures: list[str] = []

    def t(name: str, cond: bool) -> None:
        if not cond:
            failures.append(name)

    page = "<html><head><title>x</title></head><body>y</body></html>"

    # --- 入れる / 入れない ---
    out, changed = transform(page)
    t("種の無いページには入る", changed and MARKER in out)
    t("入れる位置は </head> の直前（head の中）",
      out.index(MARKER) < out.index("</head>"))
    t("本文は壊さない", out.endswith("<body>y</body></html>"))

    # **冪等。**再実行で2つ入ると、読者の localStorage を二重に触る。
    again, changed2 = transform(out)
    t("すでに種があれば入れない（冪等）", (not changed2) and again == out)
    t("種は1つだけ", out.count(MARKER) == 1)

    # `</head>` が無い面には入れられない。**黙って本文の先頭へ置かない。**
    noanchor = "<html><body>y</body></html>"
    out3, changed3 = transform(noanchor)
    t("</head> が無ければ入れない", (not changed3) and out3 == noanchor)

    # --- 種そのもの（ここが壊れると、CIではなく読者側で壊れる） ---
    # **既存の値を上書きしない。**この条件が消えると、英語の面を開くたびに
    # 読者が切替器で選んだ 'ja' を 'en' へ書き戻す。
    t("既に保存されていれば書かない（読者の選択を上書きしない）",
      "if(!localStorage.getItem(k))" in SNIPPET)
    # localStorage は Safari のプライベートモードで例外を投げる。
    t("localStorage は try/catch で包む", SNIPPET.startswith("<!--") and "try{" in SNIPPET and "catch(e){}" in SNIPPET)
    t("キーは lang.js と同じ simple-memo-lang", "'simple-memo-lang'" in SNIPPET)
    t("書く値は en", "setItem(k,'en')" in SNIPPET)
    t("目印は種そのものに入っている（冪等判定の前提）", MARKER in SNIPPET)
    # 非同期にすると、読者が先にリンクを踏んだときに種が入らない。
    t("script は defer/async を付けない（読み込み中に走らせる）",
      "defer" not in SNIPPET and "async" not in SNIPPET)

    # --- 走査対象 ---
    t("見るのは /en/ の下だけ", EN_DIR == REPO_ROOT / "en")
    pages = iter_en_pages()
    t("実データ: /en/ に面がある", len(pages) > 0)
    t("実データ: 走査結果は並び順が決まっている", pages == sorted(pages))

    for f in failures:
        print(f"  x {f}")
    print(f"自己テスト 15 件中 {len(failures)} 件失敗")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check", action="store_true",
                        help="exit 1 if any /en/ page is missing the seed")
    parser.add_argument("--selftest", action="store_true",
                        help="この検査自身が落ちることを確かめる（disk には触らない）")
    args = parser.parse_args()

    if args.selftest:
        return run_selftest()

    files = iter_en_pages()
    if not files:
        print("ERROR: no pages found under en/", file=sys.stderr)
        return 2

    missing, changed = [], 0
    for f in files:
        text = f.read_text(encoding="utf-8")
        new_text, did = transform(text)
        if not did:
            if MARKER not in text:
                missing.append(f.relative_to(REPO_ROOT))
            continue
        if args.check:
            missing.append(f.relative_to(REPO_ROOT))
            continue
        if not args.dry_run:
            f.write_text(new_text, encoding="utf-8")
        changed += 1
        print(f"[{'dry-run' if args.dry_run else 'update'}] {f.relative_to(REPO_ROOT)}")

    if args.check:
        if missing:
            print(f"{len(missing)} /en/ page(s) missing the locale seed:", file=sys.stderr)
            for m in missing:
                print(f"  {m}", file=sys.stderr)
            print("Run: python3 scripts/inject_locale_seed.py", file=sys.stderr)
            return 1
        print(f"OK: all {len(files)} /en/ pages seed the reader's locale")
        return 0

    print(f"\nSummary: {changed} changed, {len(files) - changed} already seeded, {len(files)} total")
    if missing:
        print(f"WARNING: {len(missing)} page(s) had no </head> to anchor to:", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
