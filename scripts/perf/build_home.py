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
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = ('index.html', 'en/index.html')
OUT = 'assets/home-perf'
HERO = 'assets/img/voice-airpods-pro-bright-1536.webp'
HERO_SIZES = '(max-width: 1023px) 100vw, 64vw'
# The four stills sit in two-column chapters on the Japanese homepage: one column of
# min(100vw - 2 x gutter, 1160px) at 768px and wider, the full content width below.
BANNER_SIZES = '(min-width: 1240px) 568px, (min-width: 768px) calc(50vw - 56px), calc(100vw - 40px)'
BANNERS = ('airpods', 'tags', 'watch', 'obsidian')
# The hero and the four stills are photographs with no fine text, so 4:2:0 chroma is
# invisible at their display sizes. Compared at 100% crops on 2026-11-12: hero 1200w
# 51,713 -> 36,412 B, tags 1200w 55,481 -> 40,368 B. The profile is part of the reuse key
# below, so changing it re-encodes once and CI then reuses the committed bytes.
PHOTO_ENCODING = (55, '4:2:0')
LEGACY_ENCODING = 'q65-4:4:4'


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


# The Japanese homepage inlines only the shared rules that can apply to it. Gzipped,
# the full copy put the document at 45.5 KB on 2026-11-12: past the ~43.8 KB that TCP
# slow start (initial window of 10 segments) delivers in two round trips, so the lab
# FCP and LCP each moved one simulated round trip (+150 ms). The purged copy is 41 KB.
# A rule is dropped only when a class or id it requires appears nowhere in the page
# outside <style> and nowhere in the scripts the page loads; names inside :not(),
# :is(), :where(), :has() and similar never count as required. Statements, comments
# and other at-rules (@font-face, @keyframes, ...) are always kept, and kept rules are
# copied verbatim (only the whitespace between rules is dropped), so the result is
# reproducible from the same three inputs.
GROUPING_AT_RULES = ('@media', '@supports', '@layer', '@container')
NAME_NEUTRAL_FUNCTIONS = re.compile(r':(?:not|is|where|has|matches|-webkit-any|-moz-any|nth-child|nth-last-child|lang|dir|host|host-context|slotted)\(')


def _css_scan(css: str, i: int, stop: str) -> int:
    """Index of the first character in `stop` at bracket depth 0, outside strings and comments."""
    depth, quote, n = 0, '', len(css)
    while i < n:
        c = css[i]
        if quote:
            if c == '\\':
                i += 2
                continue
            if c == quote:
                quote = ''
        elif css.startswith('/*', i):
            end = css.find('*/', i + 2)
            i = n if end < 0 else end + 2
            continue
        elif c in '"\'':
            quote = c
        elif c in '([':
            depth += 1
        elif c in ')]':
            depth = max(0, depth - 1)
        elif depth == 0 and c in stop:
            return i
        i += 1
    return n


def css_blocks(css: str) -> list[tuple[str, str | None]]:
    """Top-level (prelude, body) pairs; body is None for statements and comments."""
    out: list[tuple[str, str | None]] = []
    i, n = 0, len(css)
    while i < n:
        if css[i].isspace():
            i += 1
            continue
        if css.startswith('/*', i):
            end = css.find('*/', i + 2)
            end = n if end < 0 else end + 2
            out.append((css[i:end], None))
            i = end
            continue
        j = _css_scan(css, i, '{;')
        if j >= n:
            out.append((css[i:], None))
            break
        if css[j] == ';':
            out.append((css[i:j + 1], None))
            i = j + 1
            continue
        k, level = j + 1, 1
        while k < n and level:
            k = _css_scan(css, k, '{}')
            if k < n:
                level += 1 if css[k] == '{' else -1
                k += 1
        out.append((css[i:j], css[j + 1:k - 1]))
        i = k
    return out


def css_selectors(prelude: str) -> list[str]:
    out, i = [], 0
    while True:
        j = _css_scan(prelude, i, ',')
        out.append(prelude[i:j])
        if j >= len(prelude):
            return out
        i = j + 1


def required_names(selector: str) -> list[str]:
    s = re.sub(r'/\*.*?\*/', '', selector, flags=re.S)
    s = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '', s)
    s = re.sub(r'\[[^\]]*\]', '', s)
    while True:
        match = NAME_NEUTRAL_FUNCTIONS.search(s)
        if not match:
            break
        depth, k = 1, match.end()
        while k < len(s) and depth:
            depth += {'(': 1, ')': -1}.get(s[k], 0)
            k += 1
        s = s[:match.start()] + s[k:]
    return re.findall(r'[.#](-?[A-Za-z_][\w-]*)', s)


def purge_unused(css: str, tokens: set[str]) -> str:
    out: list[str] = []
    for prelude, body in css_blocks(css):
        head = prelude.strip()
        if body is None:
            out.append(prelude)
        elif head.startswith(GROUPING_AT_RULES):
            inner = purge_unused(body, tokens)
            if inner.strip():
                out.append(prelude + '{' + inner + '}')
        elif head.startswith('@'):
            out.append(prelude + '{' + body + '}')
        else:
            selectors = css_selectors(prelude)
            kept = [s for s in selectors if all(name in tokens for name in required_names(s))]
            if len(kept) == len(selectors):
                out.append(prelude + '{' + body + '}')
            elif kept:
                out.append(','.join(s.strip() for s in kept) + '{' + body + '}')
    return ''.join(out)


def page_tokens(html: str, root: Path = ROOT) -> set[str]:
    """Every word of the page outside <style> and generated preloads, plus its scripts."""
    text = re.sub(r'<style\b[^>]*>.*?</style>', '', html, flags=re.S)
    text = re.sub(r'<!-- home-perf preload -->.*?<!-- /home-perf preload -->', '', text, flags=re.S)
    text = re.sub(r'<source data-home-perf="image"[^>]*>', '', text)
    for src in re.findall(r'<script\b[^>]*\bsrc="(/[^"?#]+)', text):
        path = root / src.lstrip('/')
        if path.is_file():
            text += '\n' + path.read_text(encoding='utf-8')
    return set(re.findall(r'[A-Za-z0-9_-]+', text))


def unicode_ranges(codes: set[int]) -> str:
    """Consecutive code points as U+start-end; identical coverage, about 2 KB shorter."""
    parts: list[str] = []
    ordered = sorted(codes)
    i = 0
    while i < len(ordered):
        j = i
        while j + 1 < len(ordered) and ordered[j + 1] == ordered[j] + 1:
            j += 1
        parts.append(f'U+{ordered[i]:X}' if i == j else f'U+{ordered[i]:X}-{ordered[j]:X}')
        i = j + 1
    return ','.join(parts)


def characters(html: str, css: str) -> set[int]:
    parser = Text()
    parser.feed(html)
    # Include CSS-generated text, punctuation, and the ASCII characters used by JS.
    pseudo = ''.join(re.findall(r'content\s*:\s*[\'"]([^\'"]*)[\'"]', css))
    pseudo = re.sub(r'\\([0-9a-fA-F]{1,6})\s?', lambda m: chr(int(m[1], 16)), pseudo)
    return {ord(c) for c in ''.join(parser.parts) + pseudo + '\u00a0©→←•×✓'} | set(range(32, 127))


def build() -> dict[str, bytes]:
    sys.path.insert(0, str(Path(__file__).resolve().parent))  # also under python -I/-P
    from woff2_guard import require_patched_decoder
    require_patched_decoder()  # before any WOFF2 is decoded; raises, not assert
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from PIL import Image
    result: dict[str, bytes] = {}
    previous_manifest_path = ROOT / OUT / 'manifest.json'
    try:
        previous_manifest = json.loads(previous_manifest_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous_manifest = None
    shared = (ROOT / 'assets/css/style.min.css').read_text()
    hero_css = (ROOT / 'assets/css/home-hero.css').read_text()
    # Remove only remote Noto faces; preserve the original local fallback metrics.
    layout = re.sub(r'@font-face\s*\{[^{}]*\}', lambda m: '' if "font-family:'Noto Sans JP';" in m[0] else m[0], shared)
    assert layout != shared and "Noto Sans JP Fallback" in layout
    images: dict[tuple[str, int], str] = {}
    encodings: dict[str, str] = {}

    def image(source: str, width: int) -> str:
        key = (source, width)
        if key in images:
            return images[key]

        # AVIF encoders are not byte-stable across Pillow/libavif versions.
        # If the source image itself is unchanged, preserve the already
        # content-addressed, manifest-verified bytes rather than churning every
        # homepage image during an unrelated CSS/font rebuild.
        profile = f'q{PHOTO_ENCODING[0]}-{PHOTO_ENCODING[1]}'
        encodings[source] = profile
        if previous_manifest:
            source_digest = digest((ROOT / source).read_bytes())
            previous_profile = previous_manifest.get('encodings', {}).get(source, LEGACY_ENCODING)
            if previous_manifest.get('inputs', {}).get(source) == source_digest and previous_profile == profile:
                stem = Path(source).stem.replace('@2x', '')
                prefix = f'{OUT}/{stem}-{width}-'
                candidates = [
                    name for name in previous_manifest.get('assets', {})
                    if name.startswith(prefix) and name.endswith('.avif')
                ]
                for name in candidates:
                    path = ROOT / name
                    expected = previous_manifest['assets'][name].get('sha256')
                    if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
                        data = path.read_bytes()
                        result[name] = data
                        images[key] = '/' + name
                        return '/' + name

        with Image.open(ROOT / source) as original:
            rgb = original.convert('RGB')
            assert width <= rgb.width, 'Never upscale source images'
            scaled = rgb.resize((width, round(rgb.height * width / rgb.width)), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            scaled.save(buf, format='AVIF', quality=PHOTO_ENCODING[0], speed=6, subsampling=PHOTO_ENCODING[1], max_threads=2)
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
                # English keeps its complete, unchanged output while R10 holds EN investment at zero.
                ranges = unicode_ranges(use) if lang == 'ja' else ','.join(f'U+{cp:X}' for cp in sorted(use))
                faces.append(f"@font-face{{font-family:'Noto Sans JP';src:url('/{name}') format('woff2');font-weight:{css_weight};font-style:normal;font-display:optional;unicode-range:{ranges}}}")
        inline = ''.join(faces) + (purge_unused(layout, page_tokens(html)) if lang == 'ja' else layout)
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
                source = f'assets/img/home-banners/{banner}.webp'
                manifest['inputs'][source] = digest((ROOT / source).read_bytes())
                with Image.open(ROOT / source) as original:
                    widths = (600, 750, 900, 1200, original.width)
                srcset = ', '.join(f'{image(source, w)} {w}w' for w in widths)
                pattern = rf'(<picture class="hb-art" data-home-banner="{banner}">)'
                new = f'\n          <source data-home-perf="image" type="image/avif" srcset="{srcset}" sizes="{BANNER_SIZES}">'
                html, count = re.subn(pattern, lambda m: m[0] + new, html)
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
    manifest['encodings'] = dict(sorted(encodings.items()))
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
