#!/usr/bin/env python3
"""Rebuild NotoSansJP-*-delta.woff2 from the -ext fonts.

The delta fonts hold kanji that appear on the primary landing pages but are
missing from the preloaded -subset fonts, so those pages render without
pulling the full ~130KB-per-weight -ext files. See the @font-face cascade
comment in assets/css/style.css.

After adding/changing visible text on a PAGES entry, run:

    pip install fonttools brotli
    python3 scripts/build_font_delta.py

The script updates both CSS font-face ranges and content-hashed font URLs,
including the homepage preloads. Then run:

    node scripts/check-css-version.mjs --write

This refreshes the shared CSS query on every page. The ext range is the full CJK block
minus "phantom" chars (used somewhere on the site but present in NO font
file) — without the holes, browsers download -ext just to discover the
glyph is missing and fall back to system fonts anyway.
"""
import glob
import html
import hashlib
import os
import re

from fontTools.subset import Options, Subsetter, load_font, save_font
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "assets", "fonts")

# Pages whose kanji must render without downloading the -ext fonts.
# Keep this list short: every char added here ships in the delta preload.
PAGES = [
    "index.html",
    "en/index.html",
    "ai-tags/index.html",
    "apple-watch-obsidian/index.html",
    "obsidian/index.html",
]

KANJI = ((0x4E00, 0x9FFF), (0x3400, 0x4DBF))


def codepoints(path):
    font = TTFont(path)
    out = set()
    for table in font["cmap"].tables:
        if table.isUnicode():
            out.update(table.cmap.keys())
    return out


def page_codepoints(path):
    raw = open(path, encoding="utf-8").read()
    txt = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "", raw)
    txt = re.sub(r"<[^>]+>", "", txt)
    return {ord(c) for c in html.unescape(txt)}


def is_kanji(cp):
    return any(lo <= cp <= hi for lo, hi in KANJI)


def to_unicode_range(codes):
    codes = sorted(codes)
    ranges, start, prev = [], codes[0], codes[0]
    for c in codes[1:]:
        if c == prev + 1:
            prev = c
            continue
        ranges.append((start, prev))
        start = prev = c
    ranges.append((start, prev))
    return ",".join(
        f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in ranges
    )


def update_css_and_preloads(delta, extended):
    versions = {}
    for weight in ("Regular", "Bold"):
        name = f"NotoSansJP-{weight}-delta.woff2"
        with open(os.path.join(FONTS, name), "rb") as font:
            versions[name] = hashlib.sha256(font.read()).hexdigest()[:10]

    for relative in ("assets/css/style.css", "assets/css/style.min.css"):
        path = os.path.join(ROOT, relative)
        css = open(path, encoding="utf-8").read()
        counts = {"delta": 0, "ext": 0}

        def face(match):
            rule = match.group()
            for kind, codes in (("delta", delta), ("ext", extended)):
                if re.search(rf"NotoSansJP-(?:Regular|Bold)-{kind}\.woff2", rule):
                    counts[kind] += 1
                    rule, count = re.subn(r"unicode-range:\s*[^;}]+", "unicode-range:" + to_unicode_range(codes), rule)
                    assert count == 1, f"missing unicode-range in {relative} {kind}"
            for name, version in versions.items():
                rule = re.sub(re.escape(name) + r"(?:\?v=[^\s\"')]+)?", name + "?v=" + version, rule)
            return rule

        css = re.sub(r"@font-face\s*\{[^}]+\}", face, css)
        assert counts == {"delta": 2, "ext": 2}, f"unexpected font faces in {relative}: {counts}"
        with open(path, "w", encoding="utf-8") as out:
            out.write(css)

    for path in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        before = open(path, encoding="utf-8").read()
        after = before
        for name, version in versions.items():
            after = re.sub(re.escape(name) + r"(?:\?v=[^\s\"')]+)?", name + "?v=" + version, after)
        if after != before:
            with open(path, "w", encoding="utf-8") as out:
                out.write(after)
    print("Updated CSS ranges and delta font cache versions:", versions)


def main():
    subset_cps = codepoints(os.path.join(FONTS, "NotoSansJP-Regular-subset.woff2"))
    ext_cps = codepoints(os.path.join(FONTS, "NotoSansJP-Regular-ext.woff2"))

    # These previously fast-path glyphs remain in other site pages. Retain them
    # when changing landing-page copy so those readers do not fetch all of ext.
    delta = {ord(c) for c in "権級達"}
    for page in PAGES:
        used = {cp for cp in page_codepoints(os.path.join(ROOT, page)) if is_kanji(cp)}
        delta |= (used - subset_cps) & ext_cps
    delta = sorted(delta)
    print(f"delta charset: {len(delta)} chars")
    print("".join(chr(c) for c in delta))

    for weight in ("Regular", "Bold"):
        src = os.path.join(FONTS, f"NotoSansJP-{weight}-ext.woff2")
        dst = os.path.join(FONTS, f"NotoSansJP-{weight}-delta.woff2")
        opts = Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        font = load_font(src, opts)
        subsetter = Subsetter(options=opts)
        subsetter.populate(unicodes=delta)
        subsetter.subset(font)
        save_font(font, dst, opts)

        built = codepoints(dst)
        missing = set(delta) - built
        assert not missing, f"{dst} missing {len(missing)} glyphs"
        print(f"{dst}: {os.path.getsize(dst)} bytes, {len(delta)} glyphs OK")

    print("\nunicode-range for the -delta @font-face rules:")
    print(to_unicode_range(delta))

    site_kanji = set()
    for page in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        site_kanji |= {cp for cp in page_codepoints(page) if is_kanji(cp)}
    phantom = site_kanji - subset_cps - ext_cps
    covered = set()
    for lo, hi in KANJI:
        covered |= set(range(lo, hi + 1))
    print(f"\nphantom chars (rendered by system fonts): {len(phantom)}")
    print("unicode-range for the -ext @font-face rules:")
    print(to_unicode_range(covered - phantom))
    update_css_and_preloads(delta, covered - phantom)


if __name__ == "__main__":
    main()
