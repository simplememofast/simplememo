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
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[2]
PAGES = ('index.html', 'en/index.html')
OUT = 'assets/home-perf'
HERO = 'assets/img/voice-airpods-pro-bright-1536.webp'
DESIGN = 'assets/css/site-design.css'
HERO_SIZES = '(max-width: 1023px) 100vw, 64vw'
EDITORIAL_CSS = 'assets/css/home-editorial.css'
EDITORIAL_HERO_SIZES = '(max-width: 820px) calc(100vw - 40px), (max-width: 1400px) 51vw, 700px'
# Photograph pages in the legacy layout. Its 2026-11-13 Japanese version uses
# HTML/CSS memo examples; English retains the photograph. The explicitly marked
# editorial Japanese layout has its own photograph contract and generation branch.
PHOTO_PAGES = ('en/index.html',)
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


class HomeDocument(HTMLParser):
    """Small DOM inventory; comments and script strings cannot select a profile."""
    VOID = set('area base br col embed hr img input link meta param source track wbr'.split())

    def __init__(self, html: str):
        super().__init__(convert_charrefs=True)
        self.html, self.nodes, self.stack = html, [], []
        self.offsets = [0] + [m.end() for m in re.finditer('\n', html)]
        self.feed(html)
        self.close()

    def position(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        start = self.position()
        node = {'tag': tag, 'attrs': dict(attrs), 'parent': self.stack[-1] if self.stack else None,
                'start': start, 'inner': start + len(self.get_starttag_text()),
                'end': start + len(self.get_starttag_text()), 'text': []}
        self.nodes.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['tag'] == tag:
                for node in self.stack[i:]:
                    node['end'] = self.position()
                del self.stack[i:]
                break

    def handle_data(self, text):
        if any(n['tag'] in ('script', 'style') or n['attrs'].get('aria-hidden') == 'true'
               or 'hidden' in n['attrs'] for n in self.stack):
            return
        for node in self.stack:
            node['text'].append(text)


def _classes(node):
    return set((node['attrs'].get('class') or '').split())


def _within(node, ancestor):
    parent = node['parent']
    while parent is not None:
        if parent is ancestor:
            return True
        parent = parent['parent']
    return False


def _text(node):
    return ' '.join(''.join(node['text']).split())


def is_editorial_home(html: str, page: str = 'index.html') -> bool:
    """Only the explicitly marked Japanese root can use the new layout contract."""
    return page == 'index.html' and any(n['tag'] == 'body' and 'sm-editorial' in _classes(n)
                                       for n in HomeDocument(html).nodes)


def _schema_nodes(value):
    if isinstance(value, dict):
        if '@type' in value:
            yield value
        for child in value.values():
            yield from _schema_nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from _schema_nodes(child)


def editorial_contract_errors(html: str) -> list[str]:
    """Validate the public no-film layout before/after asset generation.

    This is an explicit replacement contract, not an exemption from the legacy
    checks. Image requests and visual/focus behavior are additionally exercised
    by browser_checks and verify_home. FAQ copy remains machine-readable HTML.
    """
    doc = HomeDocument(html)
    nodes, errors = doc.nodes, []
    def need(ok, message):
        if not ok:
            errors.append('Editorial homepage: ' + message)
    def tags(tag):
        return [n for n in nodes if n['tag'] == tag]
    def meta(name):
        return [n['attrs'].get('content', '') for n in tags('meta') if n['attrs'].get('name') == name]
    need(is_editorial_home(html), 'explicit body profile is missing')
    need(len(tags('html')) == 1 and tags('html')[0]['attrs'].get('lang') == 'ja', 'language must be ja')
    need(len(tags('body')) == 1, 'exactly one body is required')
    need(len(tags('title')) == 1 and bool(_text(tags('title')[0])), 'one nonempty title is required')
    need(len(meta('description')) == 1 and bool(meta('description')[0].strip()), 'description is required')
    need(len(meta('viewport')) == 1 and bool(meta('viewport')[0].strip()), 'one nonempty viewport declaration is required')
    need(not any(set(re.split(r'[\s,]+', v.lower())) & {'noindex', 'nofollow', 'none'}
                 for v in meta('robots') + meta('googlebot')), 'public page must remain indexable and followable')
    canonical = [n['attrs'].get('href') for n in tags('link') if n['attrs'].get('rel') == 'canonical']
    need(canonical == ['https://simplememofast.com/'], 'canonical must remain the public homepage')
    banners = meta('apple-itunes-app')
    need(len(banners) == 1 and re.search(r'(?:^|,\s*)app-id=6758438948(?:,|$)', banners[0]), 'Smart App Banner is required')
    styles = [urlsplit(n['attrs'].get('href', '')).path for n in tags('link')
              if n['attrs'].get('rel') == 'stylesheet']
    need(styles.count('/' + EDITORIAL_CSS) == 1, 'one editorial stylesheet is required')
    need(not any(n['tag'] == 'style' and ('data-home-perf' in n['attrs'] or 'data-perf-source' in n['attrs'])
                 for n in nodes), 'legacy generated inline styles must not leak into this profile')
    need(not set(styles) & {'/assets/css/style.min.css', '/assets/css/home-hero.css', '/assets/css/site-design.css'},
         'legacy homepage styles must not leak into this profile')
    main, headings = tags('main'), tags('h1')
    need(len(main) == 1 and bool(main[0]['attrs'].get('id')), 'one identified main is required')
    need(len(headings) == 1 and bool(_text(headings[0])) and len(main) == 1 and _within(headings[0], main[0]),
         'one visible h1 inside main is required')
    if len(main) == 1:
        need(any(n['attrs'].get('href') == '#' + main[0]['attrs'].get('id', '') and _text(n)
                 for n in tags('a')), 'skip link must target main')
    pictures = [n for n in tags('picture') if 'hero__photograph' in _classes(n)]
    need(len(pictures) == 1, 'exactly one hero photograph is required')
    if len(pictures) == 1:
        picture = pictures[0]
        imgs = [n for n in tags('img') if _within(n, picture)]
        need(len(imgs) == 1, 'hero picture must contain one fallback image')
        if len(imgs) == 1:
            a = imgs[0]['attrs']
            need(all(str(a.get(k, '')).isdigit() and int(a[k]) > 0 for k in ('width', 'height')), 'hero intrinsic dimensions are required')
            need(a.get('loading') == 'eager' and a.get('fetchpriority') == 'high', 'hero must load eagerly at high priority')
            need(bool(a.get('alt', '').strip()) and any(x in a.get('alt', '') for x in ('イメージ', '生成')), 'hero alt must describe the illustrative image')
            need(bool(re.fullmatch(r'/assets/(?:img|home-perf)/voice-airpods-pro-bright-[^?#]+\.webp', a.get('src', ''))), 'hero must retain its local WebP fallback')
            need(re.sub(r'\s+', '', a.get('sizes', '')) == re.sub(r'\s+', '', EDITORIAL_HERO_SIZES), 'hero fallback sizes must match the editorial layout')
        sources = [n for n in tags('source') if _within(n, picture)]
        need(len(sources) <= 1 and all(n['attrs'].get('type') == 'image/avif' for n in sources), 'hero must not have duplicate or competing picture sources')
        for source in sources:
            need(re.sub(r'\s+', '', source['attrs'].get('sizes', '')) == re.sub(r'\s+', '', EDITORIAL_HERO_SIZES), 'hero AVIF sizes must match the editorial layout')
        preloads = [n for n in tags('link') if n['attrs'].get('rel') == 'preload'
                    and n['attrs'].get('as') == 'image' and 'voice-airpods-pro-bright-' in str(n['attrs'])]
        need(len(preloads) <= 1, 'hero must not have duplicate preloads')
        for preload in preloads:
            a = preload['attrs']
            need(a.get('type') == 'image/avif' and a.get('fetchpriority') == 'high', 'hero preload type and priority must match the picture')
            need(re.sub(r'\s+', '', a.get('imagesizes', '')) == re.sub(r'\s+', '', EDITORIAL_HERO_SIZES), 'hero preload sizes must match the editorial layout')
            if sources:
                need(a.get('imagesrcset') == sources[0]['attrs'].get('srcset'), 'hero preload srcset must match the picture')
    need(any('写真はイメージです' in _text(n) for n in tags('figcaption')), 'visible image disclosure is required')
    hero_ctas = []
    for anchor in tags('a'):
        a = anchor['attrs']; url = urlsplit(a.get('href', '')); query = parse_qs(url.query)
        if (url.scheme == 'https' and url.hostname == 'apps.apple.com'
                and re.search(r'/id6758438948/?$', url.path)
                and (a.get('data-cta-position') == 'hero' or a.get('data-cta-placement') == 'hero')):
            hero_ctas.append(a)
            need(query.get('pt') == ['128498560'] and query.get('ct') == ['web_other_v1'] and query.get('mt') == ['8'], 'hero Apple attribution must be preserved')
            need(a.get('data-cta-cluster') == 'home' and a.get('data-cta-variant') == 'v1', 'hero CTA measurement identity must be preserved')
    need(bool(hero_ctas), 'tracked hero App Store CTA is required')
    tracking = [n for n in tags('script') if urlsplit(n['attrs'].get('src', '')).path == '/js/app-store-tracking.js']
    need(len(tracking) == 1 and tracking[0]['attrs'].get('data-sitewide-app-routes') == 'true', 'the established App Store tracker must remain enabled')
    schemas = []
    for script in tags('script'):
        if script['attrs'].get('type') == 'application/ld+json':
            try:
                schemas.extend(_schema_nodes(json.loads(html[script['inner']:script['end']])))
            except (ValueError, TypeError):
                errors.append('Editorial homepage: invalid JSON-LD')
    types = {t for n in schemas for t in (n['@type'] if isinstance(n['@type'], list) else [n['@type']])}
    need({'WebSite', 'WebPage', 'Organization', 'SoftwareApplication', 'FAQPage'} <= types, 'website, page, organization, app and FAQ schemas are required')
    apps = [n for n in schemas if n.get('@id') == 'https://simplememofast.com/#app' and n.get('@type') == 'SoftwareApplication']
    need(len(apps) == 1, 'the app entity must retain its unique #app identity')
    faqs = [n for n in schemas if n.get('@type') == 'FAQPage']
    faq_regions = [n for n in nodes if n['attrs'].get('id') == 'faq' or 'faqs' in _classes(n)]
    details = [n for n in tags('details') if len(main) == 1 and _within(n, main[0])
               and ('faq-details' in _classes(n) or any(_within(n, r) for r in faq_regions))]
    visible = []
    for detail in details:
        summaries = [n for n in tags('summary') if n['parent'] is detail]
        if len(summaries) == 1:
            question = _text(summaries[0]); full = _text(detail)
            visible.append((question, full[len(question):].strip() if full.startswith(question) else ''))
    need(bool(visible) and all(q and a for q, a in visible), 'native FAQ details must expose questions and answers')
    if len(faqs) == 1:
        structured = [(str(q.get('name', '')).strip(), ' '.join(str(q.get('acceptedAnswer', {}).get('text', '')).split()))
                      for q in faqs[0].get('mainEntity', []) if isinstance(q, dict)]
        need(structured == visible, 'FAQ JSON-LD must match the native visible questions and answers')
    else:
        need(False, 'exactly one FAQPage is required')
    need('VideoObject' not in types and not tags('video') and not any('home-film' in _classes(n) for n in nodes)
         and not any('/assets/video/capture-home' in str(n['attrs']) or '/js/home-film.js' in str(n['attrs']) for n in nodes),
         'the no-film profile must not retain video markup, assets or VideoObject schema')
    return errors


def build_editorial_home(html: str, hero_srcset: str) -> str:
    """Manage only the responsive hero in the external-CSS editorial profile."""
    doc = HomeDocument(html)
    pictures = [n for n in doc.nodes if n['tag'] == 'picture' and 'hero__photograph' in _classes(n)]
    if len(pictures) != 1:
        raise ValueError('Editorial homepage: exactly one hero photograph is required')
    picture = pictures[0]
    existing = [n for n in doc.nodes if n['tag'] == 'source' and _within(n, picture)]
    if len(existing) > 1 or any(n['attrs'].get('type') != 'image/avif' for n in existing):
        raise ValueError('Editorial homepage: duplicate or competing picture sources')
    # Replace all existing AVIF sources in this picture, including prototype sources
    # without the managed attribute, so preload and picture never fetch two assets.
    for source in reversed([n for n in doc.nodes if n['tag'] == 'source' and _within(n, picture)]):
        html = html[:source['start']] + html[source['inner']:]
    doc = HomeDocument(html)
    picture = next(n for n in doc.nodes if n['tag'] == 'picture' and 'hero__photograph' in _classes(n))
    source = f'<source data-home-perf="image" type="image/avif" srcset="{hero_srcset}" sizes="{EDITORIAL_HERO_SIZES}">'
    html = html[:picture['inner']] + source + html[picture['inner']:]
    html = re.sub(r'\n?<!-- home-perf preload -->.*?<!-- /home-perf preload -->', '', html, flags=re.S)
    # A copied standalone prototype may have an unwrapped preload; remove it too.
    doc = HomeDocument(html)
    for link in reversed([n for n in doc.nodes if n['tag'] == 'link' and n['attrs'].get('rel') == 'preload'
                          and n['attrs'].get('as') == 'image' and 'voice-airpods-pro-bright-' in str(n['attrs'])]):
        html = html[:link['start']] + html[link['inner']:]
    preload = f'\n<!-- home-perf preload -->\n<link rel="preload" as="image" type="image/avif" imagesrcset="{hero_srcset}" imagesizes="{EDITORIAL_HERO_SIZES}" fetchpriority="high">\n<!-- /home-perf preload -->'
    html, count = re.subn(r'(<meta\b[^>]*name="viewport"[^>]*>)', lambda m: m[0] + preload, html, count=1)
    if count != 1:
        raise ValueError('Editorial homepage: viewport declaration missing')
    errors = editorial_contract_errors(html)
    if errors:
        raise ValueError('\n'.join(errors))
    return html


# The Japanese homepage inlines only the shared rules that can apply to it. Gzipped,
# the full copy put the document at 45.5 KB on 2026-11-12: past the ~43.8 KB that TCP
# slow start (initial window of 10 segments) delivers in two round trips, so the lab
# FCP and LCP each moved one simulated round trip (+150 ms). The purged copy is 41 KB;
# with site-design.css inlined the same way and the unused Noto faces dropped, 40.9 KB.
# A rule is dropped only when a class or id it requires appears nowhere in the page
# outside <style> and nowhere in the scripts the page loads; names inside :not(),
# :is(), :where(), :has() and similar never count as required. Statements, comments
# and other at-rules (@font-face, @keyframes, ...) are always kept, comments are dropped
# (1.1 KB gzip of notes the sources keep), and kept rules are copied verbatim (only the
# whitespace between rules goes), so the result is reproducible from the same three inputs.
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
            if not head.startswith('/*'):  # comments carry no rules; the source files keep them
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

    # Keep the established English candidates (R10), also reused by the editorial
    # Japanese portrait so the redesign does not introduce duplicate image encodings.
    hero_srcset = ', '.join(f'{image(HERO, w)} {w}w' for w in (600, 750, 900, 1200, 1536))
    manifest: dict[str, object] = {'version': 1, 'pages': {}, 'inputs': {}}
    design_css = (ROOT / DESIGN).read_text(encoding='utf-8')
    for source in ('assets/css/style.min.css', 'assets/css/home-hero.css', DESIGN, HERO):
        manifest['inputs'][source] = digest((ROOT / source).read_bytes())

    for page in PAGES:
        html = (ROOT / page).read_text()
        lang = 'ja' if page == 'index.html' else 'en'
        if is_editorial_home(html, page):
            # The 2026-11 editorial layout owns one external stylesheet and one
            # responsive portrait. The English legacy pipeline stays untouched.
            manifest['inputs'][EDITORIAL_CSS] = digest((ROOT / EDITORIAL_CSS).read_bytes())
            html = build_editorial_home(html, hero_srcset)
            needed = characters(html, shared + hero_css)
            result[page] = html.encode()
            manifest['pages'][page] = {'profile': 'editorial', 'font_bytes': 0,
                'requested_codepoints': len(needed),
                'glyphs_sha256': digest(','.join(map(str, sorted(needed))).encode())}
            continue
        photo = page in PHOTO_PAGES
        # Fail loudly if a page gains or loses its photo without this list changing with it.
        assert ('<picture class="hero__photograph">' in html) == photo, f'{page}: hero photograph present must be {photo}'
        needed = characters(html, shared + hero_css)
        tokens = page_tokens(html)
        faces: list[str] = []
        font_bytes = 0
        # Japanese text is set in Hiragino / Yu Gothic UI / Meiryo UI: site-design.css and the
        # page design override the shared Noto stack, so on 2026-11-13 no text run resolved to
        # 'Noto Sans JP' and no WOFF2 was requested. Its Noto faces (7.2 KB inline) are dropped.
        # English renders in Noto and keeps its subsets.
        for weight, css_weight in ((('Regular', '400'), ('Bold', '500 800')) if lang == 'en' else ()):
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
        inline = ''.join(faces) + (purge_unused(layout, tokens) if lang == 'ja' else layout)
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
        if lang == 'ja':
            # site-design.css was the last render-blocking stylesheet (301 ms in the lab). Its
            # rules for this page go inline at the link's own position, so the cascade order is
            # unchanged; sync_page_design.py adds no link while data-perf-source is present.
            design = f'<style data-perf-source="/{DESIGN}">\n{purge_unused(design_css, tokens)}\n</style>'
            previous = rf'<style data-perf-source="/{re.escape(DESIGN)}">.*?</style>'
            if re.search(previous, html, re.S):
                html, count = re.subn(previous, lambda _: design, html, flags=re.S)
            else:
                html, count = re.subn(rf'<link rel="stylesheet" href="/{re.escape(DESIGN)}(?:\?[^"]*)?">', lambda _: design, html)
            assert count == 1, f'{page}: expected one site-design stylesheet, found {count}'
        html = re.sub(r'\s*<link rel="preload"[^>]*href="/assets/fonts/NotoSansJP-[^>]+>', '', html)
        html = re.sub(r'\n?<!-- home-perf preload -->.*?<!-- /home-perf preload -->', '', html, flags=re.S)
        if photo:
            preload = f'\n<!-- home-perf preload -->\n<link rel="preload" as="image" type="image/avif" imagesrcset="{hero_srcset}" imagesizes="{HERO_SIZES}" fetchpriority="high">\n<!-- /home-perf preload -->'
            html, count = re.subn(r'(<meta name="viewport"[^>]*>)', lambda m: m[0] + preload, html, count=1)
            assert count == 1
        # Only the new AVIF source is managed. All original WebP/JPEG fallbacks,
        # intrinsic dimensions, alt text, srcsets and loading attributes remain.
        html = re.sub(r'\s*<source data-home-perf="image"[^>]*>', '', html)
        if photo:
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
        if photo:
            block = re.search(r'    <picture class="hero__photograph">.*?</picture>\n    <div class="hero__shade" aria-hidden="true"></div>\n', html, re.S)
            assert block, f'{page}: hero picture and shade must remain together'
            html = html[:block.start()] + html[block.end():]
            marker = '    <div class="hero__footer">'
            assert html.count(marker) == 1
            html = html.replace(marker, block[0] + marker, 1)
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
