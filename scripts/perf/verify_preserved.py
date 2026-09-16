#!/usr/bin/env python3
"""Review-only semantic comparison against BASE_SHA, not a future content freeze."""
import os
import re
import subprocess
from pathlib import Path
from build_home import Text

class VisibleText(Text):
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'head'):
            self.depth += 1

def visible(html):
    parser = VisibleText()
    parser.feed(html)
    return re.sub(r'\s+', ' ', ''.join(parser.parts)).strip()

for name in ('index.html', 'en/index.html'):
    before = subprocess.check_output(['git', 'show', os.environ['BASE_SHA'] + ':' + name], text=True)
    after = Path(name).read_text()
    normalized = re.sub(r' data-cta-position="(?:hero|mid|bottom)"', '', after)
    original = re.sub(r' data-cta-position="(?:hero|mid|bottom)"', '', before)
    for pattern in (r'<script\b[^>]*>.*?</script>', r'<meta\b[^>]*>', r'<a\b[^>]*>', r'<title>.*?</title>', r'<link rel="(?:canonical|alternate)"[^>]*>'):
        assert re.findall(pattern, original, re.S) == re.findall(pattern, normalized, re.S), (name, pattern)
    assert sorted(re.findall(r'<img\b[^>]*>', before)) == sorted(re.findall(r'<img\b[^>]*>', after)), name
    assert visible(before) == visible(after), name
    for tag in re.findall(r'<a\b[^>]*>', after):
        explicit = re.search(r'data-cta-position="(hero|mid|bottom)"', tag)
        if explicit:
            assert f'data-cta-placement="{explicit[1]}"' in tag, tag
    target = Path('.perf-baseline') / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(before)
print('PASS: text, metadata, analytics scripts, image fallbacks, links and campaign tokens preserved.')
