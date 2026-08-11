#!/usr/bin/env python3
"""
Give every content page one named next step.

    python3 scripts/add-next-step.py [--check] [--limit N]

docs/SEO_AIO_PLAN_2026-08.md §4 P1-1. The site serves **1.21 pages per
session** across 240 pages, and the cause is not a shortage of internal links:
`/blog/best-memo-apps-2026` carries 87 of them, the homepage 98. Eighty equal
choices is functionally the same as no choice. Each page gets one destination,
stated once, above the existing link lists.

**The existing related-link blocks are left in place.** The plan said "replace",
and that was written before checking how many pages carry one: 168. Stripping
internal links from 168 pages is not reversible on the timescale Google
re-crawls them, and it would confound the very measurement it is meant to
serve — if pages/session moved afterwards, nothing would say whether the card
worked or the removal hurt. Add the card, read `next_step_click`, and let the
data decide whether the lists go.

Routing follows the reader's stage, and every stage that has no better answer
routes to `/obsidian/`: that cluster converts at 6.52% CTR against 0.92% for
the commodity queries carrying 61.5% of impressions, so it is where traffic
earned on rival brand names is worth sending.
"""

import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (stage, path predicate, destination, JA label, JA blurb, EN label, EN blurb)
ROUTES = [
    ('confirm',
     lambda p: re.search(r'line-keep|google-keep|/line-keep/', p),
     '/vs/line-keep-memo/',
     'Keepメモと何が違うのか、並べて見る',
     '保存先を変えるかどうかは、両者を並べたほうが早く決まります。',
     'See how it compares with LINE Keep Memo',
     'Deciding whether to move is faster with both side by side.'),
    ('compare',
     lambda p: re.search(r'^/vs/|^/comparison/|best-memo|free-memo|ranking|hikaku|comparison', p),
     '/blog/fastest-memo-app-benchmark',
     '比較の次は、実測値を見る',
     '主要メモアプリの起動と入力開始までを実際に計測した表があります。',
     'Next: the measured numbers',
     'A table of actual launch and time-to-input measurements across major apps.'),
    ('method',
     lambda p: re.search(r'^/methods/|^/glossary/|^/use-cases/|^/guides/|^/how-to/|^/templates/', p),
     '/obsidian/',
     '書いたメモを、Obsidianに貯める',
     '手法を続けるには保存先が要ります。メールで送るだけで保管庫に追記されます。',
     'Send what you capture into Obsidian',
     'A method needs somewhere to accumulate. Email it, and it lands in your vault.'),
    ('feature',
     lambda p: re.search(r'apple-watch|^/siri/|^/ai-tags/|voice-input|hands-free|fastest-voice', p),
     '/obsidian/',
     '声で残したメモの、行き先を決める',
     'メールとObsidianの両方に届きます。プラグインは要りません。',
     'Choose where your voice notes land',
     'They arrive in both your inbox and Obsidian. No plugin required.'),
]

DEFAULT = ('explore', '/obsidian/',
           'Obsidian連携で、メモを貯める場所を作る',
           'メールで自分に送るだけで、Obsidianのノートに追記されます。',
           'Give your notes somewhere to accumulate',
           'Email a note to yourself and it is appended to your Obsidian vault.')

# Pages that are not articles, or where a next-step card would be noise.
SKIP = re.compile(
    r'^/(404|compose|verify|contact)|^/admin/|^/growth/|^/docs/|^/tools/|'
    r'^/(privacy|terms|legal)|^/(ar|es|id|ko|pt-BR|tr|zh|zh-Hant)/'
)

# /en/vs/ is a directory of comparison pages with no index, so it 404s. The
# English side has no LINE Keep page at all — that cluster is Japan-only —
# so confirm-stage English readers go to the hub like everyone else.
EN_DEST = {'/obsidian/': '/en/obsidian/', '/vs/line-keep-memo/': '/en/obsidian/',
           '/blog/fastest-memo-app-benchmark': '/en/blog/best-memo-apps-2026'}

MARKER = 'data-next-step'


def url_of(rel):
    """Repo path -> site path, matching the site's extensionless URL scheme."""
    p = '/' + rel.replace(os.sep, '/')
    if p.endswith('/index.html'):
        return p[: -len('index.html')]
    if p.endswith('.html'):
        return p[: -len('.html')]
    return p


def route_for(url):
    for stage, pred, dest, ja_l, ja_b, en_l, en_b in ROUTES:
        if pred(url):
            return stage, dest, ja_l, ja_b, en_l, en_b
    return DEFAULT[0], DEFAULT[1], DEFAULT[2], DEFAULT[3], DEFAULT[4], DEFAULT[5]


def card_html(stage, dest, ja_l, ja_b, en_l, en_b, indent='  '):
    i = indent
    return (
        f'{i}<!-- One named next step — scripts/add-next-step.py, docs/SEO_AIO_PLAN_2026-08.md §4 P1-1.\n'
        f'{i}     Exactly one destination per page. Adding a second defeats the purpose: the page\n'
        f'{i}     already offers dozens of links and none of them gets clicked. -->\n'
        f'{i}<aside class="next-step" style="margin:3rem auto 0;max-width:800px;">\n'
        f'{i}  <a data-next-step="{stage}" href="{dest}" style="display:block;padding:1.25rem 1.5rem;'
        f'background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--accent);'
        f'border-radius:var(--radius-sm);text-decoration:none;color:inherit;">\n'
        f'{i}    <span style="display:block;font-size:.75rem;font-weight:700;letter-spacing:.08em;'
        f'text-transform:uppercase;color:var(--accent);margin-bottom:.4rem;">\n'
        f'{i}      <span lang="ja" data-lang="ja">次に読む</span><span lang="en" data-lang="en">Read next</span>\n'
        f'{i}    </span>\n'
        f'{i}    <span style="display:block;font-size:1.05rem;font-weight:700;line-height:1.6;margin-bottom:.3rem;">\n'
        f'{i}      <span lang="ja" data-lang="ja">{ja_l}</span><span lang="en" data-lang="en">{en_l}</span>\n'
        f'{i}    </span>\n'
        f'{i}    <span style="display:block;font-size:.875rem;color:var(--text-secondary);line-height:1.7;">\n'
        f'{i}      <span lang="ja" data-lang="ja">{ja_b}</span><span lang="en" data-lang="en">{en_b}</span>\n'
        f'{i}    </span>\n'
        f'{i}  </a>\n'
        f'{i}</aside>\n\n'
    )


# Insert before whichever of these appears first; all sit at the end of the
# article body, before the footer.
ANCHORS = [
    re.compile(r'^\s*<section class="related-links"', re.M),
    re.compile(r'^\s*<!-- Author Bio -->', re.M),
    re.compile(r'^\s*<aside class="author-bio"', re.M),
    re.compile(r'^\s*</main>', re.M),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='report what would change; exit 1 if anything would')
    ap.add_argument('--limit', type=int)
    args = ap.parse_args()

    pages = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules')]
        for fn in filenames:
            if not fn.endswith('.html'):
                continue
            rel = os.path.relpath(os.path.join(dirpath, fn), ROOT)
            url = url_of(rel)
            if SKIP.match(url):
                continue
            pages.append((rel, url))
    pages.sort()

    changed, skipped, no_anchor = 0, 0, []
    for rel, url in pages:
        if args.limit and changed >= args.limit:
            break
        path = os.path.join(ROOT, rel)
        src = open(path, encoding='utf-8').read()
        if MARKER in src:
            skipped += 1
            continue
        stage, dest, ja_l, ja_b, en_l, en_b = route_for(url)
        if url.startswith('/en/'):
            dest = EN_DEST.get(dest, dest)
        # A page must never point at itself; fall back to the hub, and if the
        # hub *is* the page, leave it alone rather than emit a self-link.
        if dest.rstrip('/') == url.rstrip('/'):
            dest = DEFAULT[1] if not url.startswith('/en/') else EN_DEST[DEFAULT[1]]
            if dest.rstrip('/') == url.rstrip('/'):
                skipped += 1
                continue
        m = next((a.search(src) for a in ANCHORS if a.search(src)), None)
        if not m:
            no_anchor.append(rel)
            continue
        indent = re.match(r'[ \t]*', m.group(0)).group(0) or '  '
        if args.check:
            changed += 1
            continue
        out = src[:m.start()] + card_html(stage, dest, ja_l, ja_b, en_l, en_b, indent) + src[m.start():]
        open(path, 'w', encoding='utf-8').write(out)
        changed += 1

    print(f'pages considered: {len(pages)}  ·  card added: {changed}  ·  already had one / self-link: {skipped}')
    if no_anchor:
        print(f'no insertion anchor ({len(no_anchor)}): ' + ', '.join(no_anchor[:8]) +
              ('…' if len(no_anchor) > 8 else ''))
    if args.check and changed:
        sys.exit(1)


if __name__ == '__main__':
    main()
