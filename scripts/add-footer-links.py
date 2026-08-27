#!/usr/bin/env python3
"""Add site-wide links to the footer columns.

    python3 scripts/add-footer-links.py --check   # report, change nothing
    python3 scripts/add-footer-links.py --write   # apply

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

An href may be a (ja, en) pair. The site's rule is "a link under /en/ points at
the EN page when one exists, JA otherwise" (set when /siri/ was split, re-applied
across 314 hrefs on 2026-08-20). /devlog/ has no EN twin so it stays a single
href; /roadmap/ has one, so it is a pair. The dedup check tests both spellings,
so a page already carrying either is left alone.
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

# href, Japanese label, English label, which column heading to sit under.
# `None` for the column means "the first column", whatever it is called.
LINKS = [
    ('/download/', 'ダウンロード', 'Download', None),
    # E-E-A-T: who is behind this. Both pages existed and both were reachable
    # from the nav, but only the two home pages linked them from the footer —
    # so on 240-odd article pages the operator was not identifiable without
    # scrolling back up. /about/ names the company and tells the developer
    # story; /devlog/ is the dated build record behind it.
    # /en/about/ exists, so EN pages must point at it — the site's rule since
    # the /siri/ split. Left as a bare '/about/' this entry appended the JA
    # page to the five EN pages that already linked /en/about/: the dedup
    # test looks for the literal href, and '/en/about/' does not contain it.
    (('/about/', '/en/about/'), '開発者について', 'About the developer',
     ('サポート', 'Support')),
    ('/devlog/', '開発記録', 'Dev log', ('サポート', 'Support')),
    # Indexing: /roadmap/ sat in GSC "Crawled — currently not indexed" (crawled
    # 2026-08-23) with exactly one in-body inlink site-wide — /devlog/, itself a
    # 1-impression page — and no nav or footer entry, while /devlog/ /about/
    # /methods/ /glossary/ all had one. It was in the sitemap and returned 200
    # with a self-canonical, so nothing was technically wrong; it was simply not
    # reachable enough to be worth indexing. Sits next to /devlog/ because they
    # are the same promise read in two directions: what was built, what is next.
    (('/roadmap/', '/en/roadmap/'), '公開ロードマップ', 'Public roadmap',
     ('サポート', 'Support')),
]


def label_like(existing: str, is_en: bool, ja: str, en: str) -> str:
    """Mirror the label markup of a sibling anchor in the same column."""
    if 'data-lang=' in existing:
        return (f'<span lang="ja" data-lang="ja">{ja}</span>'
                f'<span lang="en" data-lang="en">{en}</span>')
    if existing.strip().startswith('<span>'):
        # `<span>ホーム</span> ` — trailing space and all, so the diff stays boring.
        return f'<span>{en}</span> ' if is_en else f'<span>{ja}</span> '
    return en if is_en else ja


def pick_column(footer: str, headings):
    """The <div class="footer__col"> under one of `headings`, or the first one."""
    cols = list(COL_RE.finditer(footer))
    if not cols:
        return None
    if headings is None:
        return cols[0]
    for cm in cols:
        tm = TITLE_RE.search(cm.group(0))
        if tm and any(h in tm.group(0) for h in headings):
            return cm
    return None


def patch(html: str, rel: pathlib.Path):
    """Return (new_html, reasons). new_html is None when nothing changed."""
    fm = FOOTER_RE.search(html)
    if not fm:
        return None, ['no footer']
    footer = fm.group(0)
    if not COL_RE.search(footer):
        return None, ['no footer__col (locale/social footer)']

    reasons = []
    changed = False
    for href, ja, en, headings in LINKS:
        hrefs = href if isinstance(href, tuple) else (href,)
        if any(f'href="{h}"' in footer for h in hrefs):
            continue  # already linked from the footer, in either spelling
        cm = pick_column(footer, headings)
        if not cm:
            reasons.append(f'{href}: no column matching {headings}')
            continue
        col = cm.group(0)
        tm = TITLE_RE.search(col)
        lm = LINK_RE.search(col)
        if not tm or not lm:
            reasons.append(f'{href}: column has no title/link to anchor on')
            continue
        indent, inner = lm.group(1), lm.group(2)
        # Language: the heading usually says it, but /en/about/ and /en/faq.html
        # head an English column with 「プロダクト」, so the path is the tiebreak.
        is_en = 'Product' in tm.group(0) or 'Support' in tm.group(0) or rel.parts[0] == 'en'
        target = hrefs[-1] if is_en else hrefs[0]
        anchor = (f'\n{indent}<a href="{target}" class="footer__link">'
                  f'{label_like(inner, is_en, ja, en)}</a>')
        new_col = col[:tm.end()] + anchor + col[tm.end():]
        footer = footer[:cm.start()] + new_col + footer[cm.end():]
        changed = True

    if not changed:
        return None, reasons
    return html[:fm.start()] + footer + html[fm.end():], reasons


def main() -> int:
    write = '--write' in sys.argv
    if not write and '--check' not in sys.argv:
        print('usage: add-footer-links.py --check | --write', file=sys.stderr)
        return 2

    done, skipped = 0, []
    for f in sorted(ROOT.rglob('*.html')):
        if any(p in SKIP_DIRS for p in f.relative_to(ROOT).parts):
            continue
        html = f.read_text(encoding='utf-8')
        new, reasons = patch(html, f.relative_to(ROOT))
        for r in reasons:
            skipped.append((f.relative_to(ROOT), r))
        if new is None:
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
