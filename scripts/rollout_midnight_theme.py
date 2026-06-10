#!/usr/bin/env python3
"""Roll out the midnight brand theme (theme-midnight.css) site-wide.

For every page that links the shared style.min.css:
  1. Insert the theme-midnight.min.css <link> right after style.min.css
  2. Map cream-era color literals (page-local <style> blocks and inline
     styles) to their midnight equivalents — same palette as
     assets/css/theme-midnight.css

Standalone pages that do NOT use style.min.css keep their own design
and are left untouched. node_modules/.claude/admin are excluded.
"""
import re
import sys
from pathlib import Path

ROOT = Path("/Users/hajimeataka/simplememo")
THEME_LINK = '<link rel="stylesheet" href="/assets/css/theme-midnight.min.css?v=20260610">'
EXCLUDE = ("node_modules/", ".claude/", "admin/")

# Cream rgb() triplets -> midnight triplets (alpha preserved)
RGBA_MAP = {
    (255, 252, 244): (18, 26, 46),    # raised cream surface -> raised navy glass
    (245, 241, 232): (7, 11, 20),     # page bg
    (239, 234, 221): (10, 16, 32),    # secondary bg
    (60, 45, 25):    (148, 178, 230), # warm border / dot grid
    (60, 40, 20):    (0, 0, 0),       # warm shadow -> neutral shadow
    (20, 16, 10):    (148, 178, 230), # border token
    (201, 100, 66):  (56, 140, 255),  # clay glow -> electric glow
    (217, 119, 87):  (77, 163, 255),  # clay accent -> electric blue
    (232, 168, 124): (124, 108, 255), # peach -> violet
    (170, 60, 28):   (82, 160, 255),  # clay border -> blue border
    (208, 82, 39):   (124, 108, 255),
    (227, 106, 54):  (139, 124, 255),
    (138, 42, 10):   (77, 163, 255),  # --accent (cream) -> electric blue
    (110, 29, 4):    (34, 211, 238),  # accent-neon -> cyan
    (162, 56, 20):   (124, 108, 255),
    (181, 66, 36):   (139, 124, 255),
    (180, 130, 80):  (60, 90, 220),
}

# Cream hex literals -> midnight hex (case-insensitive match)
HEX_MAP = {
    "#f5f1e8": "#070b14",  # bg (also converts theme-color metas)
    "#fffdf7": "#121a2e",
    "#efeadd": "#0a1020",
    "#f7f1e3": "#0e1626",
    "#0c0a06": "#f2f6ff",  # ink -> near-white
    "#1d180f": "#e3ecff",
    "#1a160e": "#c9d4ec",
    "#060503": "#f2f6ff",
    "#0a0805": "#c9d4ec",
    "#3a3024": "#9aabcc",
    "#5a4d3b": "#c9d4ec",
    "#8a2a0a": "#4da3ff",  # clay accent -> electric blue
    "#a23814": "#7cc4ff",
    "#6e1d04": "#22d3ee",
    "#5a2410": "#8b7cff",
    "#b54224": "#7cc4ff",
    "#b8552c": "#7cc4ff",
    "#b8431f": "#4da3ff",
    "#5e1700": "#0a84ff",
}

LINK_RE = re.compile(r'(<link[^>]*style\.min\.css[^>]*>)')


def map_colors(html: str) -> str:
    for (r, g, b), (nr, ng, nb) in RGBA_MAP.items():
        pattern = r'(rgba?\()\s*%d\s*,\s*%d\s*,\s*%d\s*(?=[,)])' % (r, g, b)
        html = re.sub(pattern, r'\g<1>%d, %d, %d' % (nr, ng, nb), html)
    for old, new in HEX_MAP.items():
        html = re.sub(re.escape(old) + r'\b', new, html, flags=re.IGNORECASE)
    return html


def process(path):
    html = path.read_text(encoding="utf-8")
    if "style.min.css" not in html:
        return None
    orig = html

    if "theme-midnight" not in html:
        html = LINK_RE.sub(lambda m: m.group(1) + "\n  " + THEME_LINK, html, count=1)

    html = map_colors(html)

    # captio-alternative cream override forces black ink with !important
    html = html.replace("color: #000000", "color: #f2f6ff")
    html = html.replace("--text: #000000", "--text: #f2f6ff")

    if html != orig:
        path.write_text(html, encoding="utf-8")
        return str(path.relative_to(ROOT))
    return None


def main():
    changed = []
    for path in sorted(ROOT.rglob("*.html")):
        rel = str(path.relative_to(ROOT))
        if any(rel.startswith(e) or f"/{e}" in rel for e in EXCLUDE):
            continue
        result = process(path)
        if result:
            changed.append(result)
    print(f"updated {len(changed)} pages")
    for c in changed[:10]:
        print("  ", c)
    if len(changed) > 10:
        print(f"   ... and {len(changed) - 10} more")


if __name__ == "__main__":
    main()
