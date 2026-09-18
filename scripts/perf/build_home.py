#!/usr/bin/env python3
"""Build homepage-only, content-addressed assets. Run --write, or --check in CI.

Original shared styles, fonts, pictures, scripts, links and editorial text remain
unchanged. Regenerate when either homepage or its shared stylesheet changes.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = ('index.html', 'en/index.html')
OUT = 'assets/home-perf'
HERO = 'assets/img/voice-airpods-pro-bright-1536.webp'
HERO_SIZES = '(max-width: 1023px) 100vw, 64vw'
BANNER_SIZES = '(min-width: 1280px) 918px, (min-width: 1024px) 818px, (min-width: 768px) 618px, (min-width: 480px) 438px, calc(100vw - 42px)'
BANNERS = ('siri', 'ai-tags', 'apple-watch', 'obsidian')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:12]


class Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ('script', 'style', 'head'):
            self.depth += 1
        if not self.depth:
            self.parts.extend(v for k, v in attrs if v and k in ('alt', 'title', 'aria-label', 'placeholder'))

    def handle_endtag(self, tag: str) -> None:
        if tag in ('script', 'style', 'head'):
            self.depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.depth:
            self.parts.append(data)


def characters(html: str, css: str) -> set[int]:
    parser = Text()
    parser.feed(html)
    # Include CSS-generated text, punctuation, and the ASCII characters used by JS.
    pseudo = ''.join(re.findall(r'content\s*:\s*[\'"]([^\'"]*)[\'"]', css))
    pseudo = re.sub(r'\\([0-9a-fA-F]{1,6})\s?', lambda m: chr(int(m[1], 16)), pseudo)
    return {ord(c) for c in ''.join(parser.parts) + pseudo + '\u00a0©→←•×✓'} | set(range(32, 127))


def build() -> dict[str, bytes]:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from PIL import Image
    result: dict[str, bytes] = {}
    shared = (ROOT / 'assets/css/style.min.css').read_text()
    hero_css = (ROOT / 'assets/css/home-hero.css').read_text()
    # Remove only remote Noto faces; preserve the original local fallback metrics.
    layout = re.sub(r'@font-face\s*\{[^{}]*\}', lambda m: '' if "font-family:'Noto Sans JP';" in m[0] else m[0], shared)
    assert layout != shared and "Noto Sans JP Fallback" in layout
    images: dict[tuple[str, int], str] = {}

    def image(source: str, width: int) -> str:
        key = (source, width)
        if key in images:
            return images[key]
        with Image.open(ROOT / source) as original:
            rgb = original.convert('RGB')
            assert width <= rgb.width, 'Never upscale source images'
            scaled = rgb.resize((width, round(rgb.height * width / rgb.width)), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            # 4:4:4 keeps fine Japanese banner text and UI details legible.
            scaled.save(buf, format='AVIF', quality=65, speed=6, subsampling='4:4:4', max_threads=2)
        data = buf.getvalue()
        name = f'{OUT}/{Path(source).stem.replace("@2x", "")}-{width}-{digest(data)}.avif'
        result[name] = data
        images[key] = '/' + name
        return '/' + name

    hero_srcset = ', '.join(f'{image(HERO, w)} {w}w' for w in (600, 750, 900, 1200, 1536))
    manifest: dict[str, object] = {'version': 1, 'pages': {}, 'inputs': {}}
    for source in ('assets/css/style.min.css', 'assets/css/home-hero.css', HERO):
        manifest['inputs'][source] = digest((ROOT / source).read_bytes())

    for page in PAGES:
        html = (ROOT / page).read_text()
        lang = 'ja' if page == 'index.html' else 'en'
        needed = characters(html, shared + hero_css)
        faces: list[str] = []
        font_bytes = 0
        for weight, css_weight in (('Regular', '400'), ('Bold', '500 800')):
            remaining = set(needed)
            # The delta fonts were themselves subset from ext. Source priority
            # matches the original cascade: main subset, then extended glyphs.
            for part in ('subset', 'ext'):
                source = f'assets/fonts/NotoSansJP-{weight}-{part}.woff2'
                manifest['inputs'][source] = digest((ROOT / source).read_bytes())
                font = TTFont(ROOT / source, recalcTimestamp=False)
                use = remaining & set(font.getBestCmap())
                remaining -= use
                if not use:
                    font.close()
                    continue
                options = subset.Options()
                options.layout_features = ['*']
                options.recalc_timestamp = False
                sub = subset.Subsetter(options=options)
                sub.populate(unicodes=use)
                sub.subset(font)
                buf = io.BytesIO()
                font.flavor = 'woff2'
                font.save(buf)
                font.close()
                data = buf.getvalue()
                name = f'{OUT}/noto-{lang}-{weight.lower()}-{part}-{digest(data)}.woff2'
                result[name] = data
                font_bytes += len(data)
                ranges = ','.join(f'U+{cp:X}' for cp in sorted(use))
                faces.append(f"@font-face{{font-family:'Noto Sans JP';src:url('/{name}') format('woff2');font-weight:{css_weight};font-style:normal;font-display:optional;unicode-range:{ranges}}}")
        inline = ''.join(faces) + layout
        for key, pattern, css in (
            ('base', r'<link rel="stylesheet" href="/assets/css/style\.min\.css(?:\?[^\"]*)?"\s*>', inline),
            ('hero', r'<link rel="stylesheet" href="/assets/css/home-hero\.css(?:\?[^\"]*)?"\s*>', hero_css),
        ):
            block = f'<style data-home-perf="{key}">\n{css}\n</style>'
            previous = rf'<style data-home-perf="{key}">.*?</style>'
            if re.search(previous, html, re.S):
                html, count = re.subn(previous, lambda _: block, html, flags=re.S)
            else:
                html, count = re.subn(pattern, lambda _: block, html)
            assert count == 1, f'{page}: expected one {key} stylesheet, found {count}'
        html = re.sub(r'\s*<link rel="preload"[^>]*href="/assets/fonts/NotoSansJP-[^>]+>', '', html)
        html = re.sub(r'\n?<!-- home-perf preload -->.*?<!-- /home-perf preload -->', '', html, flags=re.S)
        preload = f'\n<!-- home-perf preload -->\n<link rel="preload" as="image" type="image/avif" imagesrcset="{hero_srcset}" imagesizes="{HERO_SIZES}" fetchpriority="high">\n<!-- /home-perf preload -->'
        html, count = re.subn(r'(<meta name="viewport"[^>]*>)', lambda m: m[0] + preload, html, count=1)
        assert count == 1
        # Only the new AVIF source is managed. All original WebP/JPEG fallbacks,
        # intrinsic dimensions, alt text, srcsets and loading attributes remain.
        html = re.sub(r'\s*<source data-home-perf="image"[^>]*>', '', html)
        html, count = re.subn(r'(<picture class="hero__photograph">)', lambda m: m[0] + f'\n      <source data-home-perf="image" type="image/avif" srcset="{hero_srcset}" sizes="{HERO_SIZES}">', html)
        assert count == 1
        if lang == 'ja':
            for banner in BANNERS:
                source = f'assets/img/{banner}-banner-ja@2x.webp'
                manifest['inputs'][source] = digest((ROOT / source).read_bytes())
                with Image.open(ROOT / source) as original:
                    widths = (600, 750, 900, 1200, original.width)
                srcset = ', '.join(f'{image(source, w)} {w}w' for w in widths)
                pattern = rf'(<source type="image/webp" srcset="/assets/img/{banner}-banner-ja\.webp[^>]*>)'
                new = f'<source data-home-perf="image" type="image/avif" srcset="{srcset}" sizes="{BANNER_SIZES}">\n          '
                html, count = re.subn(pattern, lambda m: new + m[0], html)
                assert count == 1, f'Missing banner: {banner}'
        # Parse the copy before the photograph, matching the mobile visual order.
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
        result[page] = html.encode()
        manifest['pages'][page] = {'font_bytes': font_bytes, 'requested_codepoints': len(needed), 'glyphs_sha256': digest(','.join(map(str, sorted(needed))).encode())}
    manifest['assets'] = {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(result.items()) if name.startswith(OUT + '/')}
    result[f'{OUT}/manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + '\n').encode()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    expected = build()
    stale = [name for name, data in expected.items() if not (ROOT / name).exists() or (ROOT / name).read_bytes() != data]
    if args.write:
        for name, data in expected.items():
            (ROOT / name).parent.mkdir(parents=True, exist_ok=True)
            if name in stale:
                (ROOT / name).write_bytes(data)
        print(f'Updated {len(stale)} files; source assets and non-homepage HTML left untouched.')
    elif stale:
        raise SystemExit('Homepage assets are stale. Run python scripts/perf/build_home.py --write:\n' + '\n'.join(stale))
    else:
        print(f'PASS: {len(expected)} homepage outputs reproduce byte-for-byte.')


if __name__ == '__main__':
    main()
