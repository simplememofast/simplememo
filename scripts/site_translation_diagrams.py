"""Localize explanatory SVG labels while preserving measured chart geometry.

Only the reviewed diagrams in the registry are rewritten. Screenshots, source
files offered for download, and app-interface illustrations remain originals.
"""
from functools import lru_cache
import hashlib
import html
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

from localization_registry import ROOT
from site_translation_units import Parser, all_nodes, unit, plain_unit
from site_translation_validation import render


@lru_cache(maxsize=1)
def registry():
    result = json.loads((ROOT/'data/i18n/diagrams.json').read_text())
    if result.get('version') != 1:
        raise ValueError('Unsupported diagram translation registry')
    return result


def label_units(source):
    for node in all_nodes(Parser(source).root):
        if node.tag in ('text', 'title', 'desc'):
            entry = unit(node, source)
            if entry and not entry['direct']:
                yield node, entry
        if node.attrs.get('aria-label'):
            entry = plain_unit(node.attrs['aria-label'], 'attribute', {})
            if entry and not entry['direct']:
                yield node, entry


def width_estimate(value, size):
    return sum(1 if unicodedata.east_asian_width(c) in ('W', 'F') else .56
               for c in value) * size


def wrap_lines(value, size, width):
    # Space-delimited languages wrap at word boundaries; CJK can wrap between
    # characters. Preserve all characters and never truncate the caveats.
    words = list(value) if not re.search(r'\s', value) else re.findall(r'\S+\s*', value)
    lines, line = [], ''
    for word in words:
        if line and width_estimate(line + word, size) > width:
            lines.append(line.rstrip());line = ''
        line += word
    if line:
        lines.append(line.rstrip())
    return lines


def translate_svg(source, locale, labels):
    if locale == 'ja':
        return source
    tree = Parser(source)
    root = next(n for n in all_nodes(tree.root) if n.tag == 'svg')
    dimensions = list(map(float, root.attrs['viewbox'].split()))
    width, height = dimensions[2:]
    changes, extra_height = [], 0
    for node, entry in label_units(source):
        row = labels.get(entry['id'])
        if not row or row['source'] != entry['text'] or locale not in row['translations']:
            raise ValueError('Missing or stale diagram label: ' + locale + ':' + entry['id'])
        value = render(entry, row['translations'][locale], attribute=entry.get('kind') == 'attribute', locale=locale)
        if entry.get('kind') == 'attribute':
            raw = source[node.start:node.inner]
            match = re.search(r'\baria-label=(["\'])(.*?)\1', raw, re.S)
            changes.append((node.start+match.start(2), node.start+match.end(2), value))
            continue
        if node.tag != 'text':
            changes.append((node.inner, node.end, value));continue
        plain = html.unescape(re.sub(r'<[^>]+>', '', value))
        x, y = float(node.attrs.get('x', 0)), float(node.attrs.get('y', 0))
        size = float(node.attrs.get('font-size', 12))
        anchor = node.attrs.get('text-anchor', 'start')
        available = 76 if anchor == 'middle' else width-x-24
        # The first legend occupies the space before the next legend's swatch.
        if width == 880 and y == 318 and x == 86:
            available = 175
        raw = source[node.start:node.inner]
        attrs = ''
        if locale == 'ar':
            attrs += ' direction="rtl" unicode-bidi="plaintext"'
            if anchor == 'start':
                raw = re.sub(r'\bx=(["\']).*?\1', 'x="'+format(x+available,'g')+'"', raw)
                # SVG start follows direction: for RTL it is the right edge.
                # Using end here would place the line beyond the canvas.
                if 'text-anchor' not in node.attrs:
                    attrs += ' text-anchor="start"'
        lines = wrap_lines(plain, size, available) if y > height-25 else [plain]
        if len(lines) > 1:
            line_height = size * 1.4
            extra_height = max(extra_height, (len(lines)-1)*line_height)
            actual_x = x+available if locale == 'ar' and anchor == 'start' else x
            value = '\n'.join('<tspan x="'+format(actual_x,'g')+'" y="'+format(y+i*line_height,'g')+'">'+html.escape(line)+'</tspan>' for i,line in enumerate(lines))
        elif width_estimate(plain, size) > available:
            attrs += ' textLength="'+format(available,'g')+'" lengthAdjust="spacingAndGlyphs"'
        changes.append((node.start, node.end, raw[:-1]+attrs+'>'+value))
    for start, end, value in sorted(changes, reverse=True):
        source = source[:start] + value + source[end:]
    # Wrapped footnotes extend the canvas, preserving the chart's data points.
    if extra_height:
        new_height = height + extra_height
        source = re.sub(r'(viewBox=["\'])[^"\']+', lambda m:m[1]+' '.join(format(x,'g') for x in [dimensions[0],dimensions[1],width,new_height]), source, count=1)
        source = re.sub(r'height="'+format(height,'g')+'"', 'height="'+format(new_height,'g')+'"', source)
    source = source.replace('<svg ', '<svg lang="'+locale+'" ', 1)
    return source


@lru_cache(maxsize=10)
def diagram_assets(locale):
    if locale == 'ja':
        return {}, {}
    config = registry();assets, paths = {}, {}
    for file in config['files']:
        source = (ROOT/file).read_text()
        translated = translate_svg(source, locale, config['labels'])
        family = Path(file).stem + '.' + hashlib.sha256(file.encode()).hexdigest()[:8]
        name = 'assets/img/i18n/'+locale+'/'+family+'.'+hashlib.sha256(translated.encode()).hexdigest()[:12]+'.svg'
        assets[name] = translated
        paths['/'+file] = '/'+name
    return assets, paths


def mapped_path(value, paths):
    if value in paths:
        return paths[value]
    # Refresh an existing generated reference when a reviewed label changes.
    for path in paths.values():
        family = path.rsplit('.', 2)[0]
        if re.fullmatch(re.escape(family)+r'\.[0-9a-f]{12}\.svg', value):
            return path
    return value


def localize_references(source, locale):
    _, paths = diagram_assets(locale)
    changes = []
    for node in all_nodes(Parser(source).root):
        if node.tag not in ('img', 'a'):
            continue
        if node.tag == 'a' and 'download' in node.attrs:
            continue
        raw = source[node.start:node.inner]
        def replace(match):
            value = html.unescape(match[3]);url = urlsplit(value)
            if url.netloc:
                return match[0]
            mapped = mapped_path(url.path, paths)
            if mapped == url.path:
                return match[0]
            suffix = ('?'+url.query if url.query else '') + ('#'+url.fragment if url.fragment else '')
            return match[1]+'='+match[2]+html.escape(mapped+suffix,quote=True)+match[2]
        changed = re.sub(r'\b(src|href)=(["\'])(.*?)\2', replace, raw)
        if raw != changed:
            changes.append((node.start,node.inner,changed))
    for start,end,value in reversed(changes):
        source = source[:start]+value+source[end:]
    return source
