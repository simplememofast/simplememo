#!/usr/bin/env python3
"""X の重み付き文字数を測る。**貼る前に測るための道具。**

    python3 scripts/check-x-post-length.py "<本文>"
    python3 scripts/check-x-post-length.py --file draft.txt
    cat draft.txt | python3 scripts/check-x-post-length.py

X は文字を等しく数えない（twitter-text の weighted length）:

    ASCII・ラテン・約物の一部   … 1
    それ以外（日本語を含む）     … 2
    URL                        … **長さによらず 23**（t.co に置換されるため）

だから「日本語140字」も「英語280字」も同じ上限に当たる。

2026-09-24、`docs/pr-notion-2026-09-launch-kit.md` の英語投稿が **318（38超過）**で
書き上がっていた。**目で見た限りでは収まりそうに見えた。**日本語の投稿4本は
収まっていたので、なおさら疑わなかった。英語は1文字=1なので、**同じ見た目の量で
倍入る**——そこを取り違えると、超過は本文が長い側にだけ出る。

**上限ちょうどは避ける。**残り0で通しても、URLの追記・絵文字1個・全角空白1個で超える。
このスクリプトは残り10未満を警告する。
"""

from __future__ import annotations

import argparse
import re
import sys

LIMIT = 280
URL_WEIGHT = 23
HEADROOM_WARN = 10

# twitter-text の既定は重み2、下の範囲だけ重み1
LIGHT_RANGES = (
    (0x0000, 0x10FF),
    (0x2000, 0x200D),
    (0x2010, 0x201F),
    (0x2032, 0x2037),
)

URL_RE = re.compile(r'https?://\S+')


def weighted_length(text: str) -> tuple[int, int]:
    """(重み付き長さ, 検出したURL数) を返す。"""
    urls = URL_RE.findall(text)
    stripped = URL_RE.sub('', text)
    weight = sum(
        1 if any(a <= ord(c) <= b for a, b in LIGHT_RANGES) else 2
        for c in stripped
    )
    return weight + URL_WEIGHT * len(urls), len(urls)


def main() -> int:
    p = argparse.ArgumentParser(description='X の重み付き文字数を測る')
    p.add_argument('text', nargs='?', help='投稿本文（省略時は --file か標準入力）')
    p.add_argument('--file', help='本文を読むファイル')
    args = p.parse_args()

    if args.file:
        text = open(args.file, encoding='utf-8').read()
    elif args.text is not None:
        text = args.text
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        p.error('本文を引数か --file か標準入力で渡す')

    text = text.rstrip('\n')
    weight, n_urls = weighted_length(text)
    left = LIMIT - weight

    print(f'  重み付き {weight} / {LIMIT}   残り {left}')
    if n_urls:
        print(f'  URL {n_urls}本 を各23で数えた（実際の長さは無関係）')

    if left < 0:
        print(f'  × {-left} 超過。このままでは投稿できない。', file=sys.stderr)
        return 1
    if left < HEADROOM_WARN:
        print(f'  △ 残り {left}。URL追記・絵文字1個で超える。**余裕を取ること。**')
        return 0
    print('  ○ 収まっている。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
