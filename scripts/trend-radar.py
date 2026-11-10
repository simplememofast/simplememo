#!/usr/bin/env python3
"""Collect public trend evidence; failures never become 'no relevant news'."""
import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'google': 'https://trends.google.com/trending/rss?geo=JP',
    'hatena': 'https://b.hatena.ne.jp/hotentry/it.rss',
    'appstore': 'https://itunes.apple.com/jp/rss/topfreeapplications/limit=100/genre=6007/json',
}
RELEVANT = re.compile(r'メモ|ノート|Obsidian|Notion|Evernote|Google Keep|LINE|リマインダー|カレンダー|音声|レコーダー|iPhone|Apple Watch', re.I)
CHANGES = re.compile(r'終了|値上げ|障害|仕様変更|廃止|サービス停止')


# 第三者の題名と URL を、保存する前に整える（2026-11-10 監査）。題名はページの作者や
# アプリの開発者が決められ、それを Bash を持つセッションが読む。長さの上限と見えない
# 文字の除去だけを機械で掛ける（命令めいた文そのものは、200字でも運べる）。
TITLE_MAX = 200
URL_MAX = 2048  # 日本語スラッグを percent-encode した正規の URL も通す


# Invisible letters that are not format characters (category Lo): Hangul fillers.
FILLERS = {'\u115f', '\u1160', '\u3164', '\uffa0'}


def _is_variation_selector(ch):
    o = ord(ch)
    return 0xFE00 <= o <= 0xFE0F or 0xE0100 <= o <= 0xE01EF


def clean_title(value, limit=TITLE_MAX):
    """Controls and line separators become a space; format / private-use / unassigned
    code points (bidi overrides, zero-width spaces, …) are removed, except ZWJ, which
    emoji sequences need. Hangul fillers are removed, and a variation selector is kept
    only right after a visible base character (one VS16 after an emoji, one IVS after a
    kanji): runs of selectors (category Mn) render as nothing and can carry hidden bytes.
    Ordinary spacing (including U+3000) is kept. limit=None returns the whole title.

    "Unassigned" (Cn) is judged by the running interpreter's Unicode tables, on purpose:
    a code point the runner does not know may be a format character newer than its tables,
    and the unassigned planes could carry hidden bytes the way selector runs do. The cost
    is that an emoji newer than the runner's tables (U+1FAE9 under Python 3.12 / 3.13) is
    dropped from the title. A title that is empty once cleaned drops only its row (parse)."""
    out = []
    for ch in value or '':
        cat = unicodedata.category(ch)
        if cat in ('Cc', 'Zl', 'Zp'):
            out.append(' ')
        elif ch in FILLERS:
            continue
        elif _is_variation_selector(ch):
            if out and not _is_variation_selector(out[-1]) and not out[-1].isspace():
                out.append(ch)
        elif cat not in ('Cf', 'Co', 'Cn', 'Cs') or ch == '\u200d':
            out.append(ch)
    text = ''.join(out).strip()
    return text[:limit] if limit else text


def valid_url(value):
    # Any C or Z category character fails, including code points the runner's Unicode
    # tables call unassigned (a raw new emoji); percent-encoded URLs pass. A failing URL
    # drops only its row (parse).
    return (isinstance(value, str) and len(value) <= URL_MAX
            and value.startswith(('https://', 'http://'))
            and not any(ch.isspace() or unicodedata.category(ch)[0] in 'CZ' for ch in value))


def parse(source, raw):
    if source == 'appstore':
        entries = json.loads(raw)['feed']['entry']
        rows = [{'id': x['id']['attributes']['im:id'], 'title': x['im:name']['label'],
                 'url': x['id']['label'], 'rank': i + 1} for i, x in enumerate(entries)]
    else:
        root = ET.fromstring(raw)
        rows = []
        for item in root.iter():
            if item.tag.split('}')[-1] != 'item':
                continue
            fields = {e.tag.split('}')[-1]: e.text or '' for e in item}
            rows.append({'id': fields.get('link'), 'title': fields.get('title'),
                         'url': fields.get('link')})
    for r in rows:
        r['title'] = clean_title(r['title'], limit=None)  # matched whole; cut in collect()
    # Check each row, not the source. A failed source sends the session to the fixed feed,
    # which this cleaning never touched, so one third-party row (a URL over URL_MAX, a
    # title of invisible characters) must not fail it: that row is dropped and counted.
    # Only an empty feed, or one where most rows are invalid, is a source failure.
    kept = [r for r in rows if r['id'] and r['title'] and valid_url(r['url'])]
    dropped = len(rows) - len(kept)
    if not kept or 2 * dropped > len(rows):
        raise ValueError('Empty or invalid source; do not overwrite the last successful observation')
    return kept, dropped  # App Store ranks were assigned before filtering: they stay as published


def select(source, rows, previous):
    old = {r['id']: r for r in previous}
    hits = []
    for row in rows:
        if not RELEVANT.search(row['title']):
            continue
        if source == 'hatena' and not CHANGES.search(row['title']):
            continue
        hit = dict(row)
        if source == 'appstore':
            if row['rank'] > 50 or not previous:
                continue  # first observation establishes a baseline, not a new entry
            before = old.get(row['id'])
            if before and before['rank'] <= 50 and abs(before['rank'] - row['rank']) < 10:
                continue
            hit['previous_rank'] = before['rank'] if before else None
        hit['action'] = 'Verify the linked source and assess relevance before proposing content.'
        hits.append(hit)
    return hits


def collect(previous, fetch):
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    result = {'observed_at': now, 'run_url': os.getenv('TREND_RUN_URL'), 'sources': {}}
    for name, url in SOURCES.items():
        prior = previous.get('sources', {}).get(name, {})
        try:
            rows, dropped = parse(name, fetch(url))
            # Match on the whole cleaned title, then cut only what is stored.
            hits = select(name, rows, prior.get('rows', []))
            for r in rows + hits:
                r['title'] = r['title'][:TITLE_MAX]
            # dropped_rows: rows parse() discarded, so a dropped row never reads as "no news".
            result['sources'][name] = {'status': 'ok', 'url': url, 'last_success_at': now,
                'baseline': name == 'appstore' and not prior.get('rows'),
                'rows': rows, 'hits': hits, 'dropped_rows': dropped,
                'comparison_at': prior.get('last_success_at')}
        except Exception as exc:
            result['sources'][name] = {'status': 'unreadable', 'url': url,
                'error': type(exc).__name__, 'last_success_at': prior.get('last_success_at'),
                'rows': prior.get('rows', []), 'hits': None}
    result['status'] = 'ok' if all(s['status'] == 'ok' for s in result['sources'].values()) else 'partial'
    return result


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'SimpleMemoTrendRadar/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read(4_000_000)


def collect_parallel(previous, fetch):
    """Acquire each fixed source once; parse in source order with the same fallback."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {url: pool.submit(fetch, url) for url in SOURCES.values()}
        return collect(previous, lambda url: pending[url].result())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'data/trend-radar.json')
    parser.add_argument('--sequential', action='store_true', help='Use the previous acquisition method for rollback diagnosis')
    args = parser.parse_args()
    prior = json.loads(args.output.read_text()) if args.output.exists() else {}
    result = (collect if args.sequential else collect_parallel)(prior, fetch)
    result['acquisition_mode'] = 'sequential' if args.sequential else 'parallel'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temp.replace(args.output)
    print(json.dumps({'status': result['status'], 'acquisition_mode': result['acquisition_mode'], 'sources': {
        k: {'status': v['status'], 'hits': len(v['hits']) if v['hits'] is not None else None,
            'dropped_rows': v.get('dropped_rows')}
        for k, v in result['sources'].items()}}, ensure_ascii=False))
    raise SystemExit(0 if result['status'] == 'ok' else 1)
