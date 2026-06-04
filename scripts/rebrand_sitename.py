#!/usr/bin/env python3
"""
Rebrand site name (brand-identity fields + titles only; body untouched).

  JA: Captio式シンプルメモ          -> Obsidian連携シンプルメモ
  EN: Simple Memo - Captio-style   -> Simple Memo - for Obsidian

Field-anchored so it never touches body prose, comparison tables, schema
descriptions, FAQ text, or the "Captio" SEO keyword on captio-* pages.
Old names are preserved inside JSON-LD alternateName for entity continuity.
"""
import os, re, sys

JA_OLD = "Captio式シンプルメモ"
JA_NEW = "Obsidian連携シンプルメモ"
EN_OLD = "Simple Memo - Captio-style"
EN_NEW = "Simple Memo - for Obsidian"

def swap(s):
    return s.replace(JA_OLD, JA_NEW).replace(EN_OLD, EN_NEW)

# Exact alternateName array rewrites (only the JA homepage variant changes;
# the EN variant already keeps every name, so we leave it alone).
ALT_JA_FROM = '["Simple Memo - Captio-style", "Obsidian連携シンプルメモ", "Obsidian連携シンプルメモ - 最速の音声自動入力搭載"]'
ALT_JA_TO   = '["Captio式シンプルメモ", "Simple Memo - for Obsidian", "Obsidian連携シンプルメモ - 最速の音声自動入力搭載"]'

def meta_repl(m):
    tag = m.group(0)
    if ('og:title' in tag) or ('twitter:title' in tag) or ('og:site_name' in tag):
        tag = re.sub(r'(content=")([^"]*)(")',
                     lambda c: c.group(1) + swap(c.group(2)) + c.group(3), tag)
    return tag

def anchored(pattern, text, flags=re.S):
    return re.sub(pattern,
                  lambda m: m.group(1) + swap(m.group(2)) + m.group(3),
                  text, flags=flags)

def process(text):
    counts = {}
    def n(key, before, after):
        if before != after:
            counts[key] = counts.get(key, 0) + 1
        return after

    # 1) alternateName (exact) — preserve old name as alias.
    t = text.replace(ALT_JA_FROM, ALT_JA_TO)
    counts['alternateName'] = (text != t)

    # 2) Visible nav logo brand (data-lang spans + img alt inside the logo link)
    t2 = anchored(r'(<a\b[^>]*class="global-nav__logo"[^>]*>)(.*?)(</a>)', t)
    counts['nav_logo'] = t2 != t; t = t2
    # 3) Footer copyright (plain text or data-lang spans)
    t2 = anchored(r'(<p\b[^>]*class="footer__copyright[^"]*"[^>]*>)(.*?)(</p>)', t)
    counts['footer'] = t2 != t; t = t2
    # 4) <title>
    t2 = anchored(r'(<title>)(.*?)(</title>)', t)
    counts['title'] = t2 != t; t = t2
    # 5) hidden cross-language title templates
    t2 = anchored(r'(<span\b[^>]*class="meta-title"[^>]*>)(.*?)(</span>)', t)
    counts['meta_title'] = t2 != t; t = t2
    t2 = anchored(r'(<span\b[^>]*class="meta-og-title"[^>]*>)(.*?)(</span>)', t)
    counts['meta_og_title'] = t2 != t; t = t2
    # 6) og:title / twitter:title / og:site_name meta content
    t2 = re.sub(r'<meta\b[^>]*?>', meta_repl, t)
    counts['meta_tags'] = t2 != t; t = t2
    # 7) img alt= (logo + any brand-bearing alt)
    t2 = re.sub(r'(alt=")([^"]*)(")',
                lambda m: m.group(1) + swap(m.group(2)) + m.group(3), t)
    counts['alt'] = t2 != t; t = t2
    # 8) JSON-LD brand name fields (exact brand values only)
    t2 = re.sub(r'("name"\s*:\s*")(Captio式シンプルメモ|Simple Memo - Captio-style)(")',
                lambda m: m.group(1) + swap(m.group(2)) + m.group(3), t)
    counts['schema_name'] = t2 != t; t = t2

    return t, {k: v for k, v in counts.items() if v}

def main(root):
    totals = {}
    changed = 0
    for dirpath, dirnames, filenames in os.walk(root):
        if 'node_modules' in dirpath or '/.git' in dirpath:
            continue
        for fn in filenames:
            if not fn.endswith('.html'):
                continue
            p = os.path.join(dirpath, fn)
            with open(p, encoding='utf-8') as f:
                src = f.read()
            out, counts = process(src)
            if out != src:
                with open(p, 'w', encoding='utf-8') as f:
                    f.write(out)
                changed += 1
                for k in counts:
                    totals[k] = totals.get(k, 0) + 1
    print(f"Files changed: {changed}")
    for k in sorted(totals):
        print(f"  {k}: {totals[k]} files")

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
