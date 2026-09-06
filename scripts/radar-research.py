#!/usr/bin/env python3
"""A bounded R&D experiment. Findings never deploy the candidate automatically."""
import concurrent.futures
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import statistics
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('radar', Path(__file__).with_name('trend-radar.py'))
radar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(radar)


def parallel(previous, fetch):
    """Prototype: preload the same fixed URLs, preserving per-source exceptions."""
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {url: pool.submit(fetch, url) for url in radar.SOURCES.values()}
        def cached(url):
            return pending[url].result()
        return radar.collect(previous, cached)


def semantic(result):
    return {name: {'status': row['status'], 'rows': row['rows'], 'hits': row['hits']}
            for name, row in result['sources'].items()}


def run(fetch=radar.fetch, repeats=3):
    # Research material is the actual current production collector and its fixed source set.
    prior_path = ROOT / 'data/trend-radar.json'
    previous = json.loads(prior_path.read_text()) if prior_path.exists() else {}
    trials = []
    for index in range(repeats):
        pair = {}
        # Alternate order to reduce simple warm-cache/order bias.
        variants = [('sequential', radar.collect), ('parallel', parallel)]
        if index % 2:
            variants.reverse()
        for name, method in variants:
            started = time.monotonic()
            output = method(previous, fetch)
            pair[name] = {'seconds': round(time.monotonic() - started, 4),
                          'result': output}
        identical = semantic(pair['sequential']['result']) == semantic(pair['parallel']['result'])
        complete = all(v['result']['status'] == 'ok' for v in pair.values())
        trials.append({'order': [name for name, _ in variants], 'equivalent_observations': identical,
                       'complete': complete,
                       'seconds': {name: v['seconds'] for name, v in pair.items()},
                       'sources': {name: {key: {'status': row['status'], 'rows': len(row['rows'])}
                                         for key, row in v['result']['sources'].items()}
                                   for name, v in pair.items()}})
    sequential = statistics.median(t['seconds']['sequential'] for t in trials)
    candidate = statistics.median(t['seconds']['parallel'] for t in trials)
    comparable = all(t['complete'] and t['equivalent_observations'] for t in trials)
    reduction = (sequential - candidate) / sequential if sequential else None
    return {'observed_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'run_url': os.getenv('RESEARCH_RUN_URL'),
            'question': 'Can three-source parallel acquisition reduce radar latency without changing observations?',
            'research': {'baseline': 'scripts/trend-radar.py', 'source_urls': radar.SOURCES,
                         'comparison': 'same parser, previous snapshot and source set; only acquisition concurrency changes'},
            'hypothesis': 'The parallel prototype reduces median wall time by at least 20% with equivalent complete observations.',
            'prototype': 'scripts/radar-research.py:parallel',
            'protocol': {'paired_trials': repeats, 'alternating_order': True, 'minimum_reduction': 0.2,
                         'limitations': ['Small sample; network latency varies.', 'Live feeds can change between paired requests.',
                                        'A passing experiment does not authorize production promotion.']},
            'trials': trials,
            'result': {'comparable': comparable, 'median_sequential_seconds': sequential,
                       'median_parallel_seconds': candidate, 'fraction_reduction': reduction,
                       'verdict': ('supported' if reduction is not None and reduction >= 0.2 else 'not_supported') if comparable else 'inconclusive'},
            'next_action': 'Review the evidence before deciding whether to promote the prototype.'}


if __name__ == '__main__':
    output = run()
    path = ROOT / 'data/radar-research.json'
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(output['result']))
