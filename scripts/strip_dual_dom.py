#!/usr/bin/env python3
"""Strip embedded English dual-DOM content from JA pages that have a real /en/ counterpart.

Per page:
  1. Remove every element carrying data-lang="en" (including .meta-template[data-lang="en"]).
  2. Remove the now-pointless .meta-templates wrapper (and its JA template).
  3. Drop data-lang="ja" attributes (content stays, always visible).
  4. Replace the JS button switcher (data-lang-btn) with plain links to the JA/EN URLs.
  5. Remove the /js/lang.js include and the [data-lang="en"]{display:none} inline CSS line.

Offsets are spliced from the original source so untouched markup stays byte-identical.
"""
import re
import sys
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"}

PAGES = {
    "about/index.html": ("/about/", "/en/about/"),
    "faq.html": ("/faq", "/en/faq"),
    "blog/best-memo-apps-2026.html": ("/blog/best-memo-apps-2026", "/en/blog/best-memo-apps-2026"),
    "blog/ios-quick-capture-comparison.html": ("/blog/ios-quick-capture-comparison", "/en/blog/ios-quick-capture-comparison"),
    "captio-alternative/index.html": ("/captio-alternative/", "/en/captio-alternative/"),
    "obsidian/index.html": ("/obsidian/", "/en/obsidian/"),
    "note-to-email/index.html": ("/note-to-email/", "/en/note-to-email/"),
    "privacy.html": ("/privacy", "/en/privacy"),
    "terms.html": ("/terms", "/en/terms"),
    "vs/apple-notes/index.html": ("/vs/apple-notes/", "/en/vs/apple-notes/"),
    "vs/drafts/index.html": ("/vs/drafts/", "/en/vs/drafts/"),
    "vs/email-me-app/index.html": ("/vs/email-me-app/", "/en/vs/email-me-app/"),
    "vs/evernote/index.html": ("/vs/evernote/", "/en/vs/evernote/"),
    "vs/google-keep-vs-apple-notes/index.html": ("/vs/google-keep-vs-apple-notes/", "/en/vs/google-keep-vs-apple-notes/"),
    "vs/google-keep/index.html": ("/vs/google-keep/", "/en/vs/google-keep/"),
    "vs/mail-to-self/index.html": ("/vs/mail-to-self/", "/en/vs/mail-to-self/"),
    "vs/note-to-self-mail/index.html": ("/vs/note-to-self-mail/", "/en/vs/note-to-self-mail/"),
    "vs/notion-vs-evernote/index.html": ("/vs/notion-vs-evernote/", "/en/vs/notion-vs-evernote/"),
    "vs/notion-vs-obsidian/index.html": ("/vs/notion-vs-obsidian/", "/en/vs/notion-vs-obsidian/"),
    "vs/notion/index.html": ("/vs/notion/", "/en/vs/notion/"),
    "vs/obsidian/index.html": ("/vs/obsidian/", "/en/vs/obsidian/"),
}


class RegionFinder(HTMLParser):
    """Find [start, end) source offsets of elements matching a predicate."""

    def __init__(self, src, predicate):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.predicate = predicate
        self.line_starts = [0]
        for m in re.finditer(r"\n", src):
            self.line_starts.append(m.end())
        self.stack = []        # (tagname, matched, start_offset)
        self.regions = []      # [start, end)

    def src_offset(self):
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        start = self.src_offset()
        matched = self.predicate(tag, dict(attrs))
        text = self.get_starttag_text() or ""
        if tag in VOID or text.endswith("/>"):
            if matched:
                self.regions.append((start, start + len(text)))
        else:
            self.stack.append((tag, matched, start))

    def handle_startendtag(self, tag, attrs):
        if self.predicate(tag, dict(attrs)):
            start = self.src_offset()
            text = self.get_starttag_text() or ""
            self.regions.append((start, start + len(text)))

    def handle_endtag(self, tag):
        end_start = self.src_offset()
        # tolerate unbalanced markup: pop until we find this tag
        while self.stack:
            t, matched, start = self.stack.pop()
            if t == tag:
                if matched:
                    close = self.src.find(">", end_start)
                    self.regions.append((start, close + 1))
                break


def remove_regions(src, regions):
    """Splice out regions (outermost only), plus a following newline if the
    removal leaves a blank line behind."""
    if not regions:
        return src, 0
    regions.sort()
    merged = []
    for s, e in regions:
        if merged and s < merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    out, prev, count = [], 0, 0
    for s, e in merged:
        out.append(src[prev:s])
        prev = e
        count += 1
    out.append(src[prev:])
    return "".join(out), count


def process(path, ja_url, en_url):
    src = open(path, encoding="utf-8").read()
    orig_len = len(src)

    # 1+2. remove data-lang="en" elements and the whole meta-templates block
    def en_or_template(tag, attrs):
        cls = attrs.get("class", "")
        return attrs.get("data-lang") == "en" or "meta-templates" in cls.split()

    finder = RegionFinder(src, en_or_template)
    finder.feed(src)
    src, n_removed = remove_regions(src, finder.regions)

    # 3. drop data-lang="ja" attributes
    src, n_ja = re.subn(r'\s+data-lang="ja"', "", src)

    # 4. switcher buttons -> links
    btn_pat = re.compile(
        r'<button class="lang-switcher__btn[^"]*" data-lang-btn="ja"[^>]*>JA</button>'
        r'\s*<button class="lang-switcher__btn[^"]*" data-lang-btn="en"[^>]*>EN</button>'
    )
    link_html = (
        f'<a class="lang-switcher__btn active" href="{ja_url}" aria-current="page" '
        f'hreflang="ja" aria-label="日本語" style="text-decoration:none">JA</a>'
        f'<a class="lang-switcher__btn" href="{en_url}" hreflang="en" '
        f'aria-label="Switch to English" style="text-decoration:none">EN</a>'
    )
    src, n_btn = btn_pat.subn(link_html, src)

    # 5a. lang.js include
    src, n_js = re.subn(r'\s*<script src="/js/lang\.js[^"]*" defer></script>', "", src)

    # 5b. data-lang hide CSS (single known line form)
    src, n_css = re.subn(
        r'\s*\[data-lang="en"\]\{display:none\}\s*\[data-lang\]\.active\{display:revert\}'
        r'\s*span\[data-lang\]\.active\{display:revert\}',
        "", src)
    # also the standalone badge rule if present
    src, n_css2 = re.subn(r'\s*a\.app-store-badge\[data-lang\]\.active\{display:inline-flex\}', "", src)

    # tidy: collapse runs of 3+ blank lines left by removals
    src = re.sub(r"\n[ \t]*\n[ \t]*\n+", "\n\n", src)

    open(path, "w", encoding="utf-8").write(src)
    return {
        "file": path, "removed_elements": n_removed, "ja_attrs": n_ja,
        "switcher": n_btn, "langjs": n_js, "hide_css": n_css + n_css2,
        "bytes": f"{orig_len} -> {len(src)}",
    }


if __name__ == "__main__":
    targets = sys.argv[1:] or list(PAGES)
    for rel in targets:
        ja, en = PAGES[rel]
        r = process(rel, ja, en)
        print(r)
