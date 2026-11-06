"""Exact, page-specific editorial links, independent of translation catalogs.

Only manifest-authored wrappers may be removed when extracting source units.
Applying the same plan after translation prevents links spreading to other locales.
All replacements use original string slices; HTML is never reserialized.
"""
from functools import lru_cache
from html import escape, unescape
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit

from site_translation_units import Parser

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'data/editorial-internal-links.json'
SITE = 'https://simplememofast.com'
BLOCKED = set('a h1 h2 h3 h4 h5 h6 nav header footer aside head script style template noscript code pre kbd samp button summary select textarea svg math'.split())
EXCLUDED = re.compile(r'(?:^|[-_\s])(?:hero|intro|toc|breadcrumb|related|recommendations|cta|promotion|newsletter|share|social|navigation|hidden|sr-only)(?:$|[-_\s])', re.I)
ENTITY = re.compile(r'&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);')


def canonical(value, file='index.html'):
    """Canonical destination identity, ignoring tracking and fragments."""
    parsed = urlsplit(urljoin(SITE + '/' + file, unescape(value)))
    if parsed.scheme not in ('http', 'https') or parsed.netloc != 'simplememofast.com':
        return None
    path = parsed.path
    if path.endswith('/index.html'):
        path = path[:-10]
    elif path.endswith('.html'):
        path = path[:-5]
    return path.rstrip('/') or '/'


def _after(patch):
    result = patch['before']
    for wrap in sorted(patch['wraps'], key=lambda w: w['start'], reverse=True):
        start, end = wrap['start'], wrap['end']
        result = result[:start] + '<a href="' + escape(wrap['href'], quote=True) + '">' + result[start:end] + '</a>' + result[end:]
    return result


def validate_manifest(data):
    if not isinstance(data, dict) or set(data) != {'version', 'pages'} or type(data['version']) is not int or data['version'] != 1 or not isinstance(data['pages'], dict):
        raise ValueError('Invalid editorial link manifest')
    for file, patches in data['pages'].items():
        if not isinstance(file, str) or not re.fullmatch(r'(?:[A-Za-z0-9_-]+/)*(?:blog|devlog)/[A-Za-z0-9_-]+\.html', file):
            raise ValueError('Invalid editorial source path: ' + str(file))
        if not isinstance(patches, list) or not patches:
            raise ValueError(file + ': empty or invalid patches')
        destinations, contexts = set(), set()
        for patch in patches:
            if not isinstance(patch, dict) or set(patch) != {'before', 'wraps'}:
                raise ValueError(file + ': invalid patch')
            before, wraps = patch['before'], patch['wraps']
            if not isinstance(before, str) or not before or before in contexts or not isinstance(wraps, list) or not wraps:
                raise ValueError(file + ': invalid or duplicate context')
            contexts.add(before)
            ranges = []
            for wrap in wraps:
                if not isinstance(wrap, dict) or set(wrap) != {'start', 'end', 'href', 'anchor'}:
                    raise ValueError(file + ': invalid wrap')
                start, end, href, anchor = (wrap[k] for k in ('start', 'end', 'href', 'anchor'))
                if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(before):
                    raise ValueError(file + ': invalid offsets')
                if not isinstance(anchor, str) or not anchor.strip() or before[start:end] != anchor or '<' in anchor or '>' in anchor:
                    raise ValueError(file + ': anchor differs from original text')
                # Require simple, local canonical routes, never encoded traversal,
                # credentials, protocols, query parameters or fragments in plans.
                if not isinstance(href, str) or not re.fullmatch(r'/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+(?:\.html|/)?', href):
                    raise ValueError(file + ': invalid target route')
                target = canonical(href)
                if target == canonical('/' + file) or target in destinations:
                    raise ValueError(file + ': self-link or repeated destination')
                destinations.add(target)
                ranges.append((start, end))
            ranges.sort()
            if any(a[1] > b[0] for a, b in zip(ranges, ranges[1:])):
                raise ValueError(file + ': overlapping anchors')
        if len(destinations) > 5:
            raise ValueError(file + ': more than five destinations')
    return data['pages']


@lru_cache(maxsize=1)
def load_manifest():
    return validate_manifest(json.loads(MANIFEST.read_text()))


def _baseline(source, file, patches):
    """Recognize exactly one untouched or exactly authored context per patch."""
    edits = []
    for patch in patches:
        before, after = patch['before'], _after(patch)
        before_count, after_count = source.count(before), source.count(after)
        if after_count == 1 and before_count == 0:
            start = source.index(after)
            edits.append((start, start + len(after), before))
        elif before_count == 1 and after_count == 0:
            continue
        else:
            raise ValueError(file + ': missing or ambiguous editorial link context')
    edits.sort()
    if any(a[1] > b[0] for a, b in zip(edits, edits[1:])):
        raise ValueError(file + ': overlapping editorial link contexts')
    for start, end, replacement in reversed(edits):
        source = source[:start] + replacement + source[end:]
    # Stripping must not produce duplicate baseline contexts.
    if any(source.count(patch['before']) != 1 for patch in patches):
        raise ValueError(file + ': ambiguous restored context')
    return source


def _excluded(node, allow_section_header=False):
    attrs = node.attrs
    label = ' '.join((attrs.get('class') or '', attrs.get('id') or '', attrs.get('role') or ''))
    style = re.sub(r'\s+', '', attrs.get('style') or '').lower()
    return ((node.tag in BLOCKED and not (allow_section_header and node.tag == 'header'))
            or 'hidden' in attrs or 'inert' in attrs
            or str(attrs.get('aria-hidden', '')).lower() == 'true'
            or attrs.get('role') in ('navigation', 'banner', 'contentinfo')
            or 'display:none' in style or 'visibility:hidden' in style
            or bool(EXCLUDED.search(label)))


def _validate_placements(source, file, patches):
    root = Parser(source).root
    nodes, ancestors = [], {}
    def visit(node, parents):
        nodes.append(node)
        ancestors[id(node)] = parents
        for child in node.children:
            visit(child, parents + [node])
    visit(root, [])
    existing = {canonical(node.attrs.get('href', ''), file) for node in nodes if node.tag == 'a' and 'href' in node.attrs}
    headings = [node for node in nodes if node.tag == 'h2'
                and not any(_excluded(parent, allow_section_header=any(
                    ancestor.tag == 'section' for ancestor in ancestors[id(node)]))
                            for parent in ancestors[id(node)])
                and re.sub(r'<[^>]*>', '', source[node.inner:node.end]).strip()]
    text_nodes = [node for node in nodes if node.tag == '#text']
    placements = []
    for patch in patches:
        offset = source.index(patch['before'])
        for wrap in patch['wraps']:
            start, end = offset + wrap['start'], offset + wrap['end']
            if canonical(wrap['href']) in existing:
                raise ValueError(file + ': destination already linked')
            matches = [node for node in text_nodes if node.start <= start < end <= node.stop]
            if len(matches) != 1:
                raise ValueError(file + ': anchor is not within one text node')
            node = matches[0]
            parents = ancestors[id(node)]
            containers = [parent for parent in parents if parent.tag in ('main', 'article')]
            if (not containers or not any(parent.tag in ('p', 'li', 'td') for parent in parents)
                    or any(_excluded(parent) for parent in parents)):
                raise ValueError(file + ': excluded editorial placement')
            # A heading elsewhere on the page (for example in navigation) does
            # not establish that this anchor is beyond the article introduction.
            container = containers[-1]
            if not any(container.start <= heading.start and heading.stop <= start
                       and heading.stop <= container.stop for heading in headings):
                raise ValueError(file + ': anchor precedes substantive h2')
            for entity in ENTITY.finditer(source, node.start, node.stop):
                if entity.start() < start < entity.end() or entity.start() < end < entity.end():
                    raise ValueError(file + ': anchor splits an HTML entity')
            placements.append((start, end))
    placements.sort()
    if any(a[1] > b[0] for a, b in zip(placements, placements[1:])):
        raise ValueError(file + ': overlapping editorial placements')


def strip(source, file):
    """Restore only exact authored wrappers, leaving original markup intact."""
    patches = load_manifest().get(file, [])
    if not patches:
        return source
    baseline = _baseline(source, file, patches)
    _validate_placements(baseline, file, patches)
    return baseline


def apply(source, file):
    """Apply only this page's reviewed links, failing on stale/unsafe context."""
    patches = load_manifest().get(file, [])
    if not patches:
        return source
    baseline = _baseline(source, file, patches)
    _validate_placements(baseline, file, patches)
    edits = [(baseline.index(p['before']), p) for p in patches]
    # Reject overlapping contexts rather than letting replacement order choose.
    edits.sort(key=lambda item: item[0])
    if any(start + len(p['before']) > next_start
           for (start, p), (next_start, _) in zip(edits, edits[1:])):
        raise ValueError(file + ': overlapping editorial contexts')
    for start, patch in reversed(edits):
        baseline = baseline[:start] + _after(patch) + baseline[start + len(patch['before']):]
    return baseline
