#!/usr/bin/env python3
"""Unify the footer copyright line site-wide (brand-unification spec 1-3).

Target string (all locales, per spec):
  © 2026 Obsidian連携シンプルメモ（Simple Memo - for Obsidian） / 運営: 株式会社ユリカ

Handles the three markup generations in the wild:
  1. <p class="footer__copyright-main">…</p> (modern, single line)
  2. <p class="footer__copyright"> ©/&copy; 2026 <span data-lang=…>…  (dual-DOM era)
  3. any other <p>/<div> whose text starts with ©/&copy; 2026 inside the footer
"""
import glob
import re
import sys

TARGET = '© 2026 Obsidian連携シンプルメモ（Simple Memo - for Obsidian） / 運営: 株式会社ユリカ'

P_MAIN = re.compile(
    r'(<p class="footer__copyright-main">).*?(</p>)', re.S)
P_PLAIN = re.compile(
    r'(<p class="footer__copyright">)\s*(?:©|&copy;)\s*2026.*?(</p>)', re.S)

SKIP = set(sys.argv[1:])


def process(path):
    src = open(path, encoding='utf-8').read()
    if '© 2026' not in src and '&copy; 2026' not in src:
        return None
    orig = src
    src = P_MAIN.sub(lambda m: m.group(1) + TARGET + m.group(2), src)
    src = P_PLAIN.sub(lambda m: m.group(1) + '\n        ' + TARGET + '\n      ' + m.group(2), src)
    if src != orig:
        open(path, 'w', encoding='utf-8').write(src)
        return 'ok'
    return 'UNMATCHED'


if __name__ == '__main__':
    unmatched = []
    n = 0
    for f in sorted(glob.glob('**/*.html', recursive=True)):
        if 'node_modules' in f or '.claude' in f or f in SKIP:
            continue
        r = process(f)
        if r == 'ok':
            n += 1
        elif r == 'UNMATCHED':
            unmatched.append(f)
    print(f'unified: {n}, unmatched: {len(unmatched)}')
    for f in unmatched:
        print(' ?', f)
