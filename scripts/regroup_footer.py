#!/usr/bin/env python3
"""Regroup the flat 19-link footer nav into labelled columns, per page.

Parses each page's own <nav class="footer__links"> anchors (so per-page link
sets, EN labels, and tracking classes are preserved exactly) and re-emits them
as <nav class="footer__nav"> with 4 category columns. Pages without a
.footer__links nav (locale homepages, tiktok) are left untouched.

Idempotent: pages already on .footer__nav are skipped.
"""
import glob
import re
import sys

# href -> column key (longest-prefix match, trailing slash insensitive)
CATEGORY = {
    '/': 'product', '/en/': 'product', '/how-to/': 'product',
    '/guides/': 'product', '/use-cases/': 'product', '/templates/': 'product',
    '/voice-input/': 'product', '/obsidian/': 'product',
    '/en/obsidian/': 'product', '/en/send-email-to-yourself/': 'product',
    '/en/iphone-shortcuts-email-guide/': 'product',

    '/captio-alternative/': 'compare', '/en/captio-alternative/': 'compare',
    '/en/captio-migration-guide/': 'compare', '/captio/': 'compare',
    '/vs/': 'compare', '/comparison/': 'compare',
    '/note-to-email/': 'compare', '/en/note-to-email/': 'compare',

    '/blog/': 'read', '/en/blog/': 'read', '/devlog/': 'read',
    '/methods/': 'read', '/glossary/': 'read', '/about/': 'read',

    '/faq': 'support', '/contact': 'support', '/terms': 'support',
    '/en/terms': 'support', '/privacy': 'support', '/en/privacy': 'support',
    '/legal': 'support',
}

COLUMNS = ['product', 'compare', 'read', 'support']
TITLES = {
    'ja': {'product': 'プロダクト', 'compare': '比較・乗り換え',
           'read': '読みもの', 'support': 'サポート'},
    'en': {'product': 'Product', 'compare': 'Compare & Switch',
           'read': 'Read', 'support': 'Support'},
}

# Two markup generations exist: hand-written (href first, bare label) and
# extract_en_page.py output (class first, label wrapped in <span>).
ANCHOR_RE = re.compile(
    r'<a (?:href="([^"]+)" class="(footer__link[^"]*)"|class="(footer__link[^"]*)" href="([^"]+)")[^>]*>'
    r'\s*(?:<span>)?\s*(.*?)\s*(?:</span>)?\s*</a>', re.S)
NAV_RE = re.compile(
    r'<nav (?:class="footer__links"([^>]*)|([^>]*?)class="footer__links")>(.*?)</nav>', re.S)


def regroup(path):
    src = open(path, encoding='utf-8').read()
    m = NAV_RE.search(src)
    if not m:
        return 'skip (no flat footer nav)'
    nav_attrs = (m.group(1) or m.group(2) or '').strip()
    nav_attrs = (' ' + nav_attrs) if nav_attrs else ''
    body = m.group(3)
    anchors = [(a or d, b or c, label) for a, b, c, d, label in ANCHOR_RE.findall(body)]
    if not anchors:
        return 'skip (no anchors parsed)'
    # leftover non-anchor content inside the nav would be silently dropped —
    # refuse instead.
    leftover = ANCHOR_RE.sub('', body).strip()
    if leftover:
        return f'REFUSED (unexpected nav content: {leftover[:60]!r})'

    lang = 'en' if re.search(r'<html[^>]*lang="en"', src) else 'ja'
    titles = TITLES[lang]

    cols = {k: [] for k in COLUMNS}
    unknown = []
    for href, cls, label in anchors:
        label = re.sub(r'\s+', ' ', label).strip()
        if label == 'について':  # flat-nav era label; reads odd in a column
            label = '運営について'
        key = CATEGORY.get(href) or CATEGORY.get(href.rstrip('/') or '/')
        if key is None:
            key = 'read'
            unknown.append(href)
        cols[key].append(f'        <a href="{href}" class="{cls}">{label}</a>')

    out = [f'<nav class="footer__nav"{nav_attrs}>']
    for key in COLUMNS:
        if not cols[key]:
            continue
        out.append('      <div class="footer__col">')
        out.append(f'        <p class="footer__col-title">{titles[key]}</p>')
        out.extend(cols[key])
        out.append('      </div>')
    out.append('      </nav>')
    src = src[:m.start()] + '\n'.join(out) + src[m.end():]
    open(path, 'w', encoding='utf-8').write(src)
    note = f' (unknown→読みもの: {unknown})' if unknown else ''
    return f'ok {len(anchors)} links{note}'


if __name__ == '__main__':
    targets = sys.argv[1:] or sorted(
        f for f in glob.glob('**/*.html', recursive=True)
        if 'node_modules' not in f and '.claude' not in f)
    counts = {}
    for f in targets:
        r = regroup(f)
        counts[r.split(' (')[0]] = counts.get(r.split(' (')[0], 0) + 1
        if 'REFUSED' in r or 'unknown' in r:
            print(f, '->', r)
    print(counts)
