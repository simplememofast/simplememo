#!/usr/bin/env python3
"""Add missing Smart App Banners to public pages; --check guards coverage in CI."""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from html import escape
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_ID = json.loads((ROOT / 'data/site-constants.json').read_text())['appStoreId']
EXCLUDED = {'admin', 'docs', 'fixtures', 'scripts', 'assets', 'tools', 'growth', 'drafts', 'node_modules', 'build'}


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.banners = []
        self.canonical = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head':
            self.in_head = True
        if not self.in_head:
            return
        if tag == 'meta' and attrs.get('name') == 'apple-itunes-app':
            self.banners.append(attrs.get('content', ''))
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')

    def handle_endtag(self, tag):
        if tag == 'head':
            self.in_head = False


def selftest():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root / 'scripts').mkdir()
        (root / 'data').mkdir()
        (root / 'scripts/smart-app-banner.py').write_text(Path(__file__).read_text())
        (root / 'data/site-constants.json').write_text(json.dumps({'appStoreId': APP_ID}))
        subprocess.run(['git', 'init', '-q', str(root)], check=True)
        page = root / 'index.html'
        banner = f'<meta name="apple-itunes-app" content="app-id={APP_ID}">'
        page.write_text('<head>' + banner + '</head>')
        subprocess.run(['git', 'add', 'index.html'], cwd=root, check=True)
        command = [sys.executable, str(root / 'scripts/smart-app-banner.py')]
        def check(expected):
            result = subprocess.run(command + ['--check'], cwd=root, capture_output=True)
            assert (result.returncode == 0) == expected, result.stdout + result.stderr
        check(True)
        for content in ['', banner + banner, banner.replace(APP_ID, '123'), '</head><body>' + banner]:
            page.write_text('<head>' + content + '</head>')
            check(False)
        page.write_text('<head></head>')
        subprocess.run(command, cwd=root, check=True, capture_output=True)
        check(True)
        before = page.read_bytes()
        subprocess.run(command, cwd=root, check=True, capture_output=True)
        assert page.read_bytes() == before
    print('Smart App Banner selftest: missing, duplicate, wrong ID, outside-head and idempotent repair verified.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--selftest', action='store_true')
    args = parser.parse_args()
    if args.selftest:
        selftest()
        return
    files = subprocess.check_output(['git', 'ls-files', '*.html'], cwd=ROOT, text=True).splitlines()
    errors, changed, checked = [], 0, 0
    for name in files:
        if name.split('/')[0] in EXCLUDED:
            continue
        path = ROOT / name
        source = path.read_text()
        head = Head()
        head.feed(source)
        checked += 1
        if not head.banners and not args.check:
            route = '/' + name.removesuffix('index.html') if name.endswith('index.html') else '/' + name.removesuffix('.html')
            url = head.canonical or 'https://simplememofast.com' + route
            meta = f'<meta name="apple-itunes-app" content="app-id={APP_ID}, app-argument={escape(url, quote=True)}">'
            source, count = re.subn(r'(<head\b[^>]*>)', lambda m: m[1] + '\n' + meta, source, count=1, flags=re.I)
            if count:
                path.write_text(source)
                changed += 1
                head = Head()
                head.feed(source)
        if len(head.banners) != 1 or not re.search(r'(?:^|,\s*)app-id=' + re.escape(APP_ID) + r'(?:,|$)', head.banners[0]):
            errors.append(name)
    print(f'Smart App Banner: {checked} public pages checked; {changed} added.')
    if errors:
        raise SystemExit('Missing, duplicate or incorrect app ID: ' + ', '.join(errors))


if __name__ == '__main__':
    main()
