#!/usr/bin/env python3
"""One-time branch preparation; removed with the write-enabled draft workflow."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

def patch(name, old, new):
    path = ROOT / name
    text = path.read_text()
    if new in text and new:
        return
    if not new and old not in text:
        return
    assert text.count(old) == 1, f'Unexpected source shape: {name}'
    path.write_text(text.replace(old, new, 1))

patch('scripts/perf/build_home.py', 'from fontTools import subset\nfrom fontTools.ttLib import TTFont\nfrom PIL import Image\n', '')
patch('scripts/perf/build_home.py', 'def build() -> dict[str, bytes]:\n', 'def build() -> dict[str, bytes]:\n    from fontTools import subset\n    from fontTools.ttLib import TTFont\n    from PIL import Image\n')
patch('scripts/perf/build_home.py', "'requested_codepoints': len(needed)", "'requested_codepoints': len(needed), 'glyphs_sha256': digest(','.join(map(str, sorted(needed))).encode())")
patch('scripts/perf/build_home.py', "                srcset = ', '.join(f'{image(source, w)} {w}w' for w in (600, 900, 1200))", "                with Image.open(ROOT / source) as original:\n                    widths = (600, 900, 1200, original.width)\n                srcset = ', '.join(f'{image(source, w)} {w}w' for w in widths)")
patch('scripts/check-css-version.mjs', "import crypto from 'node:crypto';", "import crypto from 'node:crypto';\nimport { execFileSync } from 'node:child_process';")
patch('scripts/check-css-version.mjs', "console.log('OK: every page requests the current version of '", "// Inline homepage styles must follow the same source-of-truth and cache checks.\nexecFileSync('python3', [path.join(ROOT, 'scripts/perf/verify_home.py'), '--selftest'], { stdio: 'inherit' });\nexecFileSync('python3', [path.join(ROOT, 'scripts/perf/verify_home.py')], { stdio: 'inherit' });\n\nconsole.log('OK: every page requests the current version of '")
p = ROOT / 'CLAUDE.md'
text = p.read_text()
if '## Homepage performance assets' not in text:
    p.write_text(text + '''\n## Homepage performance assets\n\nThe Japanese and English homepages inline the shared styles at their original\ncascade positions and use page-specific Noto subsets and responsive AVIF sources.\nShared source CSS and all original image fallbacks remain authoritative.\nAfter editing either homepage, its source CSS, fonts or banner images, run:\n\n```sh\npython3 -m pip install fonttools==4.63.0 brotli==1.2.0 Pillow==12.3.0\npython3 scripts/perf/build_home.py --write\npython3 scripts/perf/build_home.py --check\nnode scripts/check-css-version.mjs\n```\n\nCommit the changed HTML, content-addressed `assets/home-perf/` files and manifest\ntogether. The existing SEO CSS check rejects stale inline CSS, missing/corrupt\nassets and an outdated glyph inventory. Do not remove analytics or gate content\non user-agent strings to improve scores. PageSpeed Audit measures without such\nbypasses; lab scores are not CrUX field data.\n''')
