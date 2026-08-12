#!/usr/bin/env python3
"""Put /download/ in the first footer column of every page.

    python3 scripts/add-download-footer-link.py --check   # report, change nothing
    python3 scripts/add-download-footer-link.py --write   # apply

Why a script and not 240 hand edits: the footer is copy-pasted per page (no
build step), and it is not copy-pasted *identically*. Three shapes exist and a
single regex over all of them would silently mangle two of them:

    JA dual-DOM   <a href="/" …><span lang="ja" data-lang="ja">ホーム</span>
                                 <span lang="en" data-lang="en">Home</span></a>
    JA plain      <a href="/" …><span>ホーム</span> </a>
    EN            <a href="/en/" …>Home</a>

So the label markup is copied from a sibling link in the same column rather
than assumed, and the link goes in at the top of the column, straight after the
heading. Anchoring on the column's home link was the obvious approach and was
wrong: twelve pages open their product column with /use-cases/ or /how-to/
instead, and those twelve include / and /faq — the highest-traffic pages on the
site were exactly the ones being skipped.

A page with no product column is left alone and reported. The nine locale
landing pages (/ar/, /es/, /ko/ …) carry a social-links footer instead, and
/404, /compose and /verify have no footer at all; giving them one is a content
decision, not a mechanical edit.

Idempotent: a page already linking /download/ anywhere is skipped, so this can
be re-run after new pages are added.
"""
import re
import sys
import pathlib

SKIP_DIRS = {'.git', 'node_modules', 'scripts', 'docs', 'screenshots', 'admin'}
ROOT = pathlib.Path(__file__).resolve().parent.parent

FOOTER_RE = re.compile(r'<footer\b.*?</footer>', re.S)
COL_RE = re.compile(r'<div class="footer__col">.*?</div>', re.S)
# The column heading. Anchoring here rather than on the home link matters:
# twelve pages (including / and /faq) open their product column with
# /use-cases/ or /how-to/ instead, and anchoring on the home link skipped
# exactly the pages with the most traffic.
TITLE_RE = re.compile(r'[ \t]*<p class="footer__col-title">.*?</p>', re.S)
# Any link in the column, used only to copy its label markup. Attribute order
# is not stable across the site — /en/about/ and /en/faq.html write
# `class` before `href` — so both orders have to match or those two get skipped.
LINK_RE = re.compile(
    r'([ \t]*)<a (?:href="[^"]*" class="footer__link"|class="footer__link" href="[^"]*")>(.*?)</a>',
    re.S)

DUAL = ('<span lang="ja" data-lang="ja">ダウンロード</span>'
        '<span lang="en" data-lang="en">Download</span>')


def label_like(existing: str, is_en: bool) -> str:
    """Mirror the label markup of the anchor we are inserting after."""
    if 'data-lang=' in existing:
        return DUAL
    if existing.strip().startswith('<span>'):
        # `<span>ホーム</span> ` — trailing space and all, so the diff stays boring.
        return '<span>Download</span> ' if is_en else '<span>ダウンロード</span> '
    return 'Download' if is_en else 'ダウンロード'


def patch(html: str, rel: pathlib.Path):
    """Return (new_html, reason). new_html is None when nothing was done."""
    if '/download/' in html:
        return None, 'already links /download/'
    fm = FOOTER_RE.search(html)
    if not fm:
        return None, 'no footer'
    footer = fm.group(0)
    cm = COL_RE.search(footer)
    if not cm:
        return None, 'no footer__col (locale/social footer)'
    col = cm.group(0)
    tm = TITLE_RE.search(col)
    lm = LINK_RE.search(col)
    if not tm or not lm:
        return None, 'first column has no title/link to anchor on'

    indent, inner = lm.group(1), lm.group(2)
    # Language: the heading usually says it, but /en/about/ and /en/faq.html
    # head an English column with 「プロダクト」, so the path is the tiebreak.
    is_en = 'Product' in tm.group(0) or rel.parts[0] == 'en'
    new_anchor = f'\n{indent}<a href="/download/" class="footer__link">{label_like(inner, is_en)}</a>'
    new_col = col[:tm.end()] + new_anchor + col[tm.end():]
    new_footer = footer[:cm.start()] + new_col + footer[cm.end():]
    return html[:fm.start()] + new_footer + html[fm.end():], 'inserted'


def main() -> int:
    write = '--write' in sys.argv
    if not write and '--check' not in sys.argv:
        print('usage: add-download-footer-link.py --check | --write', file=sys.stderr)
        return 2

    done, skipped = 0, []
    for f in sorted(ROOT.rglob('*.html')):
        if any(p in SKIP_DIRS for p in f.relative_to(ROOT).parts):
            continue
        html = f.read_text(encoding='utf-8')
        new, reason = patch(html, f.relative_to(ROOT))
        if new is None:
            if reason != 'already links /download/':
                skipped.append((f.relative_to(ROOT), reason))
            continue
        done += 1
        if write:
            f.write_text(new, encoding='utf-8')

    print(f'{"wrote" if write else "would write"}: {done} page(s)')
    if skipped:
        print(f'\nleft alone: {len(skipped)}')
        for rel, reason in skipped:
            print(f'  {rel}  — {reason}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
