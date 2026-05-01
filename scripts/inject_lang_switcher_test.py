#!/usr/bin/env python3
"""
Smoke tests for inject_lang_switcher.py — runs without the live repo.

Verifies:
  - First-run insertion at each candidate anchor type
  - Idempotency (re-running yields 'unchanged')
  - Regeneration when content of the other URL changes
  - Skip-no-anchor when no header/nav exists
  - Snippet contains required attributes (rel/hreflang/aria-label/cookie)

Run with:
    python3 inject_lang_switcher_test.py

Exit code 0 if all tests pass.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make the script importable
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from inject_lang_switcher import (  # noqa: E402
    MARKER_BEGIN,
    MARKER_END,
    build_snippet,
    edit_html,
)


def _assert(cond: bool, msg: str) -> None:
    if not cond:
        print(f"FAIL: {msg}")
        sys.exit(1)
    print(f"  ok: {msg}")


def test_snippet_contents() -> None:
    print("test_snippet_contents")
    s = build_snippet("ja", "en", "/en/captio-alternative/")
    _assert(MARKER_BEGIN in s, "begin marker present")
    _assert(MARKER_END in s, "end marker present")
    _assert('rel="alternate"' in s, "rel=alternate present")
    _assert('hreflang="en"' in s, "hreflang attribute present")
    _assert('aria-label="Switch to English"' in s, "aria-label present")
    _assert("preferred_locale=en" in s, "cookie value present")
    _assert("SameSite=Lax" in s, "SameSite=Lax cookie attribute")
    _assert("max-age=31536000" in s, "1-year cookie max-age")
    _assert(">English</a>" in s, "label English present")


def test_insert_before_nav_close() -> None:
    print("test_insert_before_nav_close")
    html = (
        "<html><head></head><body>\n"
        "<header>\n"
        "  <nav>\n"
        "    <a href='/'>Home</a>\n"
        "  </nav>\n"
        "</header>\n"
        "<main>content</main></body></html>"
    )
    new_html, action = edit_html(html, "ja", "en", "/en/")
    _assert(action == "inserted", f"action=={action!r}")
    _assert(MARKER_BEGIN in new_html, "marker injected")
    _assert(new_html.index(MARKER_BEGIN) < new_html.index("</nav>"), "before </nav>")
    # Idempotency
    new_html2, action2 = edit_html(new_html, "ja", "en", "/en/")
    _assert(action2 == "unchanged", f"second-run action=={action2!r}")


def test_insert_before_header_close() -> None:
    print("test_insert_before_header_close")
    html = (
        "<html><body>\n"
        "<header>\n"
        "  <h1>Site</h1>\n"
        "</header>\n"
        "<main>x</main></body></html>"
    )
    new_html, action = edit_html(html, "en", "ja", "/")
    _assert(action == "inserted", f"action=={action!r}")
    _assert(new_html.index(MARKER_BEGIN) < new_html.index("</header>"), "before </header>")


def test_insert_after_header_open() -> None:
    print("test_insert_after_header_open")
    # No </nav> nor </header> close on its own line; the third anchor wins.
    # We strip everything that would match anchors 1 and 2.
    html = (
        "<html><body>"
        "<header class='topbar'><h1>Site</h1></header>"
        "<main>x</main></body></html>"
    )
    new_html, action = edit_html(html, "ja", "en", "/en/")
    _assert(action == "inserted", f"action=={action!r}")
    open_idx = new_html.index("<header")
    marker_idx = new_html.index(MARKER_BEGIN)
    _assert(open_idx < marker_idx, "after <header...>")


def test_no_anchor_skipped() -> None:
    print("test_no_anchor_skipped")
    html = "<html><body><main>just main</main></body></html>"
    new_html, action = edit_html(html, "ja", "en", "/en/")
    _assert(action == "skipped:no-anchor", f"action=={action!r}")
    _assert(new_html == html, "html unchanged")


def test_regeneration() -> None:
    print("test_regeneration")
    html = (
        "<html><body><header><nav>"
        "<a href='/'>Home</a>"
        "</nav></header></body></html>"
    )
    once, _ = edit_html(html, "ja", "en", "/en/captio-alternative/")
    # Now change the other URL — should regenerate, not duplicate
    twice, action = edit_html(once, "ja", "en", "/en/different-url/")
    _assert(action == "regenerated", f"action=={action!r}")
    _assert("/en/different-url/" in twice, "new URL injected")
    _assert("/en/captio-alternative/" not in twice, "old URL removed")
    # Marker count must be exactly one pair
    _assert(twice.count(MARKER_BEGIN) == 1, "single begin marker")
    _assert(twice.count(MARKER_END) == 1, "single end marker")


def test_aria_label_japanese() -> None:
    print("test_aria_label_japanese")
    s = build_snippet("en", "ja", "/")
    _assert("日本語ページに切り替え" in s, "Japanese aria-label uses native phrase")
    _assert(">日本語</a>" in s, "Japanese label uses native script")


def main() -> None:
    test_snippet_contents()
    test_insert_before_nav_close()
    test_insert_before_header_close()
    test_insert_after_header_open()
    test_no_anchor_skipped()
    test_regeneration()
    test_aria_label_japanese()
    print("\nAll tests passed.")


if __name__ == "__main__":
    main()
