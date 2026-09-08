#!/usr/bin/env python3
"""Collect public trend evidence; failures never become 'no relevant news'."""
import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
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
    if not rows or any(not r['id'] or not r['title'] or not r['url'].startswith(('https://', 'http://')) for r in rows):
        raise ValueError('Empty or invalid source; do not overwrite the last successful observation')
    return rows


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
            rows = parse(name, fetch(url))
            result['sources'][name] = {'status': 'ok', 'url': url, 'last_success_at': now,
                'baseline': name == 'appstore' and not prior.get('rows'),
                'rows': rows, 'hits': select(name, rows, prior.get('rows', [])),
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
        k: {'status': v['status'], 'hits': len(v['hits']) if v['hits'] is not None else None}
        for k, v in result['sources'].items()}}, ensure_ascii=False))
    raise SystemExit(0 if result['status'] == 'ok' else 1)
