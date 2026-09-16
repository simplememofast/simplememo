#!/usr/bin/env python3
"""Observe the real public deployment; --require waits for this checkout's assets."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
ORIGIN = 'https://simplememofast.com'


def get(path: str) -> tuple[bytes, dict]:
    request = Request(ORIGIN + '/' + path.lstrip('/'), headers={'Cache-Control': 'no-cache'})
    with urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f'{path}: HTTP {response.status}')
        return response.read(), {'status': response.status, 'content_type': response.headers.get('Content-Type'), 'cache_control': response.headers.get('Cache-Control'), 'cf_cache_status': response.headers.get('CF-Cache-Status')}


def observe() -> dict:
    receipt = {'checked_at': datetime.now(timezone.utc).isoformat(), 'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'origin': ORIGIN, 'pages': {}, 'assets': {}, 'verified': False}
    for page, url in [('index.html', ''), ('en/index.html', 'en/')]:
        data, headers = get(url)
        html = data.decode('utf-8')
        expected = (ROOT / page).read_text()
        styles = re.findall(r'<style data-home-perf="(?:base|hero)">(.*?)</style>', expected, re.S)
        sources = re.findall(r'<source data-home-perf="image"[^>]*>', expected)
        matches = bool(len(styles) == 2 and sources) and all(style in html for style in styles) and all(source in html for source in sources)
        # The streaming-layout fix must also be live, not only the image files.
        matches = matches and 0 < html.find('id="hero-title"') < html.find('<picture class="hero__photograph">')
        receipt['pages'][page] = {**headers, 'matches_checkout': matches, 'html_bytes': len(data)}
    if not all(page['matches_checkout'] for page in receipt['pages'].values()):
        return receipt
    manifest = json.loads((ROOT / 'assets/home-perf/manifest.json').read_text())
    def asset_check(item):
        path, expected = item
        data, headers = get(path)
        actual = hashlib.sha256(data).hexdigest()
        if actual != expected['sha256']:
            raise RuntimeError(f'Deployed asset differs from checkout: {path}')
        return path, {**headers, 'bytes': len(data), 'sha256': actual}
    with ThreadPoolExecutor(max_workers=4) as pool:
        receipt['assets'] = dict(pool.map(asset_check, manifest['assets'].items()))
    receipt['verified'] = True
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require', action='store_true')
    args = parser.parse_args()
    output = Path(os.environ.get('PERF_RESULTS', '/tmp/home-perf'))
    output.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + (240 if args.require else 0)
    while True:
        try:
            receipt = observe()
        except Exception as error:
            receipt = {'checked_at': datetime.now(timezone.utc).isoformat(), 'verified': False, 'error': str(error)}
        (output / 'production-deployment.json').write_text(json.dumps(receipt, indent=2) + '\n')
        if receipt['verified']:
            print(f"PASS: both public homepages and {len(receipt['assets'])} asset hashes match the checkout.")
            return
        if time.monotonic() >= deadline:
            print(json.dumps(receipt, indent=2))
            if args.require:
                raise SystemExit('Production did not match this checkout within the verification window.')
            print('OBSERVATION: production is still on another revision; no deployment claim is made.')
            return
        time.sleep(10)


if __name__ == '__main__':
    main()
