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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check", action="store_true",
                        help="exit 1 if any /en/ page is missing the seed")
    args = parser.parse_args()

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
