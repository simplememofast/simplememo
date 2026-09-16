#!/usr/bin/env python3
"""Fast dependency-free guard, also called by the existing SEO CSS check."""
from __future__ import annotations
import hashlib
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path
from build_home import ROOT, OUT, PAGES, characters, digest


def glyph_signature(codes: set[int]) -> str:
    return digest(','.join(map(str, sorted(codes))).encode())


def validate(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    manifest = json.loads((root / OUT / 'manifest.json').read_text())
    for name, expected in manifest['inputs'].items():
        path = root / name
        if not path.is_file() or digest(path.read_bytes()) != expected:
            errors.append(f'Changed source: {name}')
    for name, expected in manifest['assets'].items():
        path = root / name
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected['sha256']:
            errors.append(f'Missing or changed asset: {name}')
    shared = (root / 'assets/css/style.min.css').read_text()
    hero = (root / 'assets/css/home-hero.css').read_text()
    strip_faces = lambda css: re.sub(r'@font-face\s*\{[^{}]*\}', lambda m: '' if "font-family:'Noto Sans JP';" in m[0] else m[0], css)
    for page in PAGES:
        html = (root / page).read_text()
        if glyph_signature(characters(html, shared + hero)) != manifest['pages'][page]['glyphs_sha256']:
            errors.append(f'Changed glyph inventory: {page}')
        for kind, expected in [('base', strip_faces(shared)), ('hero', hero)]:
            match = re.search(rf'<style data-home-perf="{kind}">\n(.*?)\n</style>', html, re.S)
            if not match or (strip_faces(match[1]) if kind == 'base' else match[1]) != expected:
                errors.append(f'Stale inline {kind} CSS: {page}')
        for asset in set(re.findall(r'/assets/home-perf/[^\s\'"<>),]+', html)):
            if asset.lstrip('/') not in manifest['assets']:
                errors.append(f'Untracked asset URL: {asset}')
    return errors


def selftest() -> None:
    assert not validate(), 'Cannot test a stale build'
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        manifest = json.loads((ROOT / OUT / 'manifest.json').read_text())
        names = set(manifest['inputs']) | set(manifest['assets']) | set(PAGES) | {OUT + '/manifest.json'}
        for name in names:
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, root / name)
        assert not validate(root)
        page = root / 'index.html'
        before = page.read_text()
        page.write_text(before.replace('</body>', '𠮷</body>'))
        assert any('glyph inventory' in e for e in validate(root)), 'New glyph was not detected'
        page.write_text(before.replace('data-home-perf="hero"', 'data-home-perf="broken"'))
        assert any('inline hero' in e for e in validate(root)), 'Missing CSS was not detected'
        page.write_text(before)
        asset = root / next(iter(manifest['assets']))
        saved = asset.read_bytes()
        asset.write_bytes(b'corrupt')
        assert any('changed asset' in e for e in validate(root)), 'Corrupt asset was not detected'
        asset.write_bytes(saved)
        source = root / 'assets/css/style.min.css'
        source.write_text(source.read_text() + '\n/* changed */')
        assert any('Changed source' in e for e in validate(root)), 'Changed shared CSS was not detected'
    print('PASS: homepage guard accepts valid output and rejects four regression cases.')


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
    else:
        errors = validate()
        if errors:
            raise SystemExit('FAIL: regenerate with python scripts/perf/build_home.py --write\n' + '\n'.join(errors))
        print('PASS: homepage source hashes, glyphs, inline CSS and asset integrity.')
