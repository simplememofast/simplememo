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
from build_home import ROOT, OUT, PAGES, characters, digest, page_tokens, purge_unused


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
        # Japanese inlines the rules that can apply to the page (build_home.purge_unused),
        # recomputed here from the current stylesheet, page and scripts: a stale copy, or a
        # page that starts using a dropped class, fails the same way a changed source does.
        base = purge_unused(strip_faces(shared), page_tokens(html, root)) if page == 'index.html' else strip_faces(shared)
        for kind, expected in [('base', base), ('hero', hero)]:
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
        # The purged inline copy also depends on the scripts each page loads.
        names |= {src.lstrip('/') for page in PAGES for src in re.findall(r'<script\b[^>]*\bsrc="(/[^"?#]+)', (ROOT / page).read_text())
                  if (ROOT / src.lstrip('/')).is_file()}
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
        # A class the purged copy dropped, once used by the page, must make the copy stale.
        shared_css = (root / 'assets/css/style.min.css').read_text()
        inline_base = re.search(r'<style data-home-perf="base">\n(.*?)\n</style>', before, re.S)[1]
        dropped = next(name for name in sorted(set(re.findall(r'\.([A-Za-z_][\w-]*)', shared_css)))
                       if name not in page_tokens(before, root) and f'.{name}' not in inline_base)
        page.write_text(before.replace('</main>', f'<p class="{dropped}"></p></main>', 1))
        assert any('inline base' in e for e in validate(root)), f'Newly used class .{dropped} was not detected'
        page.write_text(before)
        asset = root / next(iter(manifest['assets']))
        saved = asset.read_bytes()
        asset.write_bytes(b'corrupt')
        assert any('changed asset' in e for e in validate(root)), 'Corrupt asset was not detected'
        asset.write_bytes(saved)
        source = root / 'assets/css/style.min.css'
        source.write_text(source.read_text() + '\n/* changed */')
        assert any('Changed source' in e for e in validate(root)), 'Changed shared CSS was not detected'
    purge_selftest()
    print('PASS: homepage guard accepts valid output and rejects five regression cases; purge rules hold.')


def purge_selftest() -> None:
    present = {'a', 'b', 'nav'}
    cases = [
        ('.a{x:1}', '.a{x:1}'),                                  # present class kept verbatim
        ('.zz{x:1}', ''),                                        # absent class dropped
        ('.a,.zz,.b{x:1}', '.a,.b{x:1}'),                        # selector list narrowed
        ('.a:not(.zz){x:1}', '.a:not(.zz){x:1}'),                # negation never requires a name
        (':is(.zz,.a) p{x:1}', ':is(.zz,.a) p{x:1}'),            # alternatives never require a name
        ('a[href$=".zz"]{x:1}', 'a[href$=".zz"]{x:1}'),          # attribute values are not classes
        ('p::before{content:"}{.zz"}', 'p::before{content:"}{.zz"}'),  # braces inside strings
        ('/* .zz{} */.a{x:1}', '/* .zz{} */.a{x:1}'),            # comments kept, never parsed as rules
        ('/* a, b */.a{x:1}/* c */', '/* a, b */.a{x:1}/* c */'),  # commas inside comments do not split
        ('.a /* .zz */ p{x:1}', '.a /* .zz */ p{x:1}'),          # names inside comments are not required
        ('@media (min-width:1px){.zz{x:1}}', ''),                # emptied grouping rule dropped
        ('@media (min-width:1px){.zz{x:1}.a{x:2}}', '@media (min-width:1px){.a{x:2}}'),
        ('@keyframes zz{from{x:0}}', '@keyframes zz{from{x:0}}'),  # other at-rules kept
        ('@font-face{font-family:x}', '@font-face{font-family:x}'),
        ('#zz{x:1}#nav{x:2}', '#nav{x:2}'),                      # ids follow the same rule
        ('body{margin:0}', 'body{margin:0}'),                    # element rules always kept
    ]
    for css, expected in cases:
        actual = purge_unused(css, present)
        assert actual == expected, f'purge({css!r}) = {actual!r}, expected {expected!r}'


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
    else:
        errors = validate()
        if errors:
            raise SystemExit('FAIL: regenerate with python scripts/perf/build_home.py --write\n' + '\n'.join(errors))
        print('PASS: homepage source hashes, glyphs, inline CSS and asset integrity.')
