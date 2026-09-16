#!/usr/bin/env python3
"""Temporary, draft-branch-only patcher; removed before merging."""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
p = ROOT / 'scripts/perf/build_home.py'
s = p.read_text()
old = '        result[page] = html.encode()'
new = r'''        # Parse the copy before the photograph, matching the mobile visual order.
        # With early inline CSS, a preloaded photo can otherwise paint before the
        # following copy is parsed and then jump down by the entire copy height.
        photo = re.search(r'    <picture class="hero__photograph">.*?</picture>\n    <div class="hero__shade" aria-hidden="true"></div>\n', html, re.S)
        assert photo, f'{page}: hero picture and shade must remain together'
        html = html[:photo.start()] + html[photo.end():]
        marker = '    <div class="hero__footer">'
        assert html.count(marker) == 1
        html = html.replace(marker, photo[0] + marker, 1)
        # Performance-only srcsets must not shift existing analytics identities
        # across the CTA checker's byte-position thresholds.
        def stable_placement(match: re.Match) -> str:
            tag = match[0]
            position = re.search(r'data-cta-placement="(hero|mid|bottom)"', tag)
            if position and 'data-cta-position=' not in tag:
                tag = tag.replace('<a ', f'<a data-cta-position="{position[1]}" ', 1)
            return tag
        html = re.sub(r'<a\b[^>]*>', stable_placement, html)
        result[page] = html.encode()'''
if 'Parse the copy before the photograph' not in s:
    assert s.count(old) == 1
    p.write_text(s.replace(old, new))
p = ROOT / 'scripts/perf/browser_checks.cjs'
s = p.read_text().replace('img.getBoundingClientRect().width > 0 && !img.naturalWidth', 'new URL(img.currentSrc || img.src).origin === location.origin && img.getBoundingClientRect().width > 0 && !img.naturalWidth')
s = s.replace('All visible lazy images load after scrolling', 'All visible same-origin lazy images load after scrolling (external services intentionally blocked)')
p.write_text(s)
