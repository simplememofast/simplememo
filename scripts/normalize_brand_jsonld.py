#!/usr/bin/env python3
"""One-shot brand unification pass over every JSON-LD block (2026-06-11).

Per the brand-unification spec:
  - MobileApplication / SoftwareApplication / Organization / WebSite get the
    official name (ja: Obsidian連携シンプルメモ / others: Simple Memo - for
    Obsidian) and the canonical alternateName list (merged with any existing
    aliases, deduped).
  - Organization.sameAs must contain the six canonical profiles; the dead
    Product Hunt URL is dropped; the legacy long App Store URL is replaced by
    the short /jp/app/id form.
  - aggregateRating is removed everywhere (third-party-collected review
    markup risks rich-result invalidation).

Formatting: pretty-printed blocks stay pretty (indent 2), minified stay
minified. Person nodes and page-title WebPage names are not touched.
"""
import glob
import json
import re

OFFICIAL_JA = 'Obsidian連携シンプルメモ'
OFFICIAL_EN = 'Simple Memo - for Obsidian'
REQUIRED_ALIASES = ['Captio式シンプルメモ', 'シンプルメモ', 'SimpleMemoFast', 'Simple Memo']
RENAME_TYPES = {'MobileApplication', 'SoftwareApplication', 'Organization', 'WebSite'}

REQUIRED_SAMEAS = [
    'https://apps.apple.com/jp/app/id6758438948',
    'https://x.com/simplememofast',
    'https://note.com/simplememo',
    'https://zenn.dev/simplememo',
    'https://github.com/simplememofast',
    'https://www.indiehackers.com/post/i-built-simplememofast-a-captio-style-app-to-email-yourself-notes-instantly-e6225127d8',
]
DROP_SAMEAS_PREFIXES = (
    'https://www.producthunt.com/',          # slug unverifiable / audit says 404
    'https://apps.apple.com/jp/app/captio',  # legacy long URL → short id form
)

BLOCK_RE = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)


def official_for(lang):
    return OFFICIAL_JA if lang == 'ja' else OFFICIAL_EN


def merge_aliases(existing, official_name, other_official):
    out = []
    for v in (existing if isinstance(existing, list) else [existing] if existing else []):
        if v and v != official_name and v not in out:
            out.append(v)
    for v in REQUIRED_ALIASES + [other_official]:
        if v != official_name and v not in out:
            out.append(v)
    return out


def transform(node, lang, stats):
    if isinstance(node, list):
        for x in node:
            transform(x, lang, stats)
        return
    if not isinstance(node, dict):
        return
    t = node.get('@type')
    types = set(t) if isinstance(t, list) else {t} if t else set()
    if types & RENAME_TYPES:
        official = official_for(lang)
        other = OFFICIAL_EN if official == OFFICIAL_JA else OFFICIAL_JA
        if node.get('name') != official:
            stats['renamed'] += 1
        node['name'] = official
        node['alternateName'] = merge_aliases(node.get('alternateName'), official, other)
        if 'sameAs' in node and types & {'Organization'}:
            kept = [u for u in node['sameAs']
                    if not u.startswith(DROP_SAMEAS_PREFIXES)]
            for u in REQUIRED_SAMEAS:
                if u not in kept:
                    kept.append(u)
            node['sameAs'] = kept
            stats['sameas'] += 1
    if 'aggregateRating' in node:
        del node['aggregateRating']
        stats['rating_removed'] += 1
    for v in list(node.values()):
        transform(v, lang, stats)


def process(path, stats):
    src = open(path, encoding='utf-8').read()
    lang = 'ja'
    m = re.search(r'<html[^>]*lang="([a-zA-Z-]+)"', src)
    if m:
        lang = 'ja' if m.group(1).startswith('ja') else 'other'
    lang = 'ja' if lang == 'ja' else 'en'

    def repl(m):
        body = m.group(2)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            stats['parse_errors'].append(path)
            return m.group(0)
        before = json.dumps(data, ensure_ascii=False, sort_keys=True)
        transform(data, lang, stats)
        if json.dumps(data, ensure_ascii=False, sort_keys=True) == before:
            return m.group(0)
        pretty = '\n' in body.strip()
        if pretty:
            new = '\n  ' + json.dumps(data, ensure_ascii=False, indent=2).replace('\n', '\n  ') + '\n  '
        else:
            new = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
        stats['blocks_changed'] += 1
        return m.group(1) + new + m.group(3)

    out = BLOCK_RE.sub(repl, src)
    if out != src:
        open(path, 'w', encoding='utf-8').write(out)
        stats['files_changed'] += 1


if __name__ == '__main__':
    stats = {'files_changed': 0, 'blocks_changed': 0, 'renamed': 0,
             'sameas': 0, 'rating_removed': 0, 'parse_errors': []}
    for f in sorted(glob.glob('**/*.html', recursive=True)):
        if 'node_modules' in f or '.claude' in f:
            continue
        process(f, stats)
    print(stats)
