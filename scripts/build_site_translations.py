#!/usr/bin/env python3
"""Build complete static translations without changing existing editorial pages.

Catalogs are keyed by source language and protected-text digest. Missing, stale,
unbalanced or untranslated entries fail before any HTML is written. Extraction
is deterministic and does not contact a translation service.
"""
import argparse
import hashlib
import html
import json
import re
import sys
import subprocess
from pathlib import Path
from functools import lru_cache
from urllib.parse import urljoin, urlsplit, urlunsplit
from localization_registry import ROOT, groups, page_url, localized_fragment
from site_translation_units import collect, collect_extra, prepare_source, source_language, examples_for, Parser, all_nodes
from site_translation_validation import validate, render
from site_translation_dynamic import bindings, locale_assets, inline_code
from site_translation_literals import literal_filenames

SITE = 'https://simplememofast.com'
CATALOGS = ROOT / 'data/i18n/translations'
CONSTANTS = json.loads((ROOT / 'data/site-constants.json').read_text())
OG_LOCALES = {'ja': 'ja_JP', 'en': 'en_US', 'zh-Hans': 'zh_CN',
              'zh-Hant': 'zh_TW', 'ko': 'ko_KR', 'es': 'es_ES',
              'pt-BR': 'pt_BR', 'id': 'id_ID', 'ar': 'ar_SA', 'tr': 'tr_TR'}


@lru_cache(maxsize=256)
def source_units(file, locale):
    source = (ROOT / file).read_text()
    examples = examples_for(file) + literal_filenames(source, file, ROOT)
    prepared = prepare_source(source, locale, file)
    return prepared, collect(prepared, examples) + collect_extra(prepared, examples)


def units_for(group):
    return source_units(group['source'], group['sourceLocale'])


def extract():
    entries = {}
    for group in groups():
        _, units = units_for(group)
        for unit in units:
            if unit.get('direct'):
                continue
            language = source_language(unit, group['sourceLocale'])
            key = language + ':' + unit['id']
            entry = entries.setdefault(key, {'id': key, 'source': language,
                                             'text': unit['text'], 'files': []})
            if group['source'] not in entry['files']:
                entry['files'].append(group['source'])
    for binding in bindings():
        for unit in collect(binding['text']):
            if unit.get('direct'):
                continue
            language = source_language(unit, binding['source'])
            key = language + ':' + unit['id']
            entry = entries.setdefault(key, {'id': key, 'source': language,
                                             'text': unit['text'], 'files': []})
            if binding['file'] not in entry['files']:
                entry['files'].append(binding['file'])
            entry['dynamic'] = True
    return list(entries.values())


def document_routes():
    routes = {}
    for group in groups():
        for file in group['pages'].values():
            routes[page_url(file)] = group
            routes[page_url(file).rstrip('/') or '/'] = group
            routes['/' + file] = group
    return routes


def map_reference(value, source, locale, routes, document=False):
    value = html.unescape(value)
    if not value or value.startswith(('#', 'data:', 'mailto:', 'tel:', 'obsidian:', 'javascript:')):
        return value
    url = urlsplit(urljoin(SITE + '/' + source, value))
    if url.netloc != 'simplememofast.com':
        return value
    path = url.path
    fragment = url.fragment
    if document and path in routes:
        group = routes[path]
        path = page_url(group['pages'][locale])
        fragment = localized_fragment(group, fragment, locale)
    return urlunsplit(('', '', path, url.query, fragment))


def map_srcset(value, source, locale, routes):
    if 'data:' in value:
        return value
    candidates = []
    for candidate in value.split(','):
        fields = candidate.strip().split()
        if fields:
            fields[0] = map_reference(fields[0], source, locale, routes)
        candidates.append(' '.join(fields))
    return ', '.join(candidates)


def map_css_urls(value, source, locale, routes):
    def replace(match):
        mapped = map_reference(match[2], source, locale, routes)
        return 'url(' + match[1] + mapped + match[1] + ')'
    return re.sub(r'url\(\s*(["\']?)(.*?)\1\s*\)', replace, value)


def coverage_errors(root, page_groups, files):
    expected = {file for group in page_groups for file in group['pages'].values()}
    excluded = {'admin', 'docs', 'fixtures', 'scripts', 'tools', 'growth', 'assets', 'screenshots', 'node_modules'}
    public = {file for file in files if not any(part.startswith('.') or part in excluded for part in Path(file).parts)}
    errors = ['Public page is absent from the translation registry: ' + file for file in sorted(public - expected)]
    for group in page_groups:
        for file in group['existing'].values():
            if not (root / file).is_file():
                errors.append('Existing editorial page is missing: ' + file)
    return errors


def selftest():
    import unittest
    suite = unittest.defaultTestLoader.loadTestsFromNames([
        'site_translation_validation_test', 'site_translation_pipeline_test'])
    return 0 if unittest.TextTestRunner().run(suite).wasSuccessful() else 1


def translate_document(group, locale, catalog, routes, script_paths=None, dynamic_rows=None):
    source, units = units_for(group)
    original = source
    changes, payloads, errors = [], {}, []
    for unit in units:
        language = source_language(unit, group['sourceLocale'])
        key = language + ':' + unit['id']
        entry = {'source': unit['text'], 'text': unit['text']} if unit.get('direct') or language == locale else catalog.get(key)
        if not entry:
            errors.append(key + ': missing'); continue
        if entry['source'] != unit['text']:
            errors.append(key + ': stale source'); continue
        problem = validate(unit['text'], entry['text'], locale)
        if problem:
            errors.append(key + ': ' + problem); continue
        translated = render(unit, entry['text'], attribute=unit.get('kind') == 'attribute', locale=locale)
        if unit.get('kind') == 'json':
            start, end = unit['script']
            payload = payloads.setdefault((start, end), json.loads(source[start:end]))
            item = payload
            for key_part in unit['path'][:-1]:
                item = item[key_part]
            item[unit['path'][-1]] = html.unescape(translated)
        else:
            changes.append((*unit['range'], translated))
    if errors:
        raise ValueError(group['source'] + ' → ' + locale + ': ' + '; '.join(errors[:8]) +
                         (f' ({len(errors)} unresolved entries)' if len(errors) > 8 else ''))
    # URL-only schemas still need the target language and page URLs, even
    # when they contain no prose for the translation catalog.
    for node in all_nodes(Parser(source).root):
        if node.tag == 'script' and node.attrs.get('type') == 'application/ld+json':
            payloads.setdefault((node.inner, node.end), json.loads(source[node.inner:node.end]))
    source_canonical = SITE + page_url(group['source'])
    target_canonical = SITE + page_url(group['pages'][locale])
    def localized_schema(value, preserve_identity=False):
        if isinstance(value, list):
            return [localized_schema(x, preserve_identity) for x in value]
        if isinstance(value, dict):
            identity = preserve_identity or value.get('@type') in ('SoftwareApplication', 'Organization', 'Person')
            return {k: locale if k == 'inLanguage' else localized_schema(v, identity) for k, v in value.items()}
        if isinstance(value, str):
            if not preserve_identity and value.startswith(SITE + '/'):
                parsed = urlsplit(value)
                if parsed.fragment in ('app', 'organization', 'person'):
                    return value
                if parsed.path in routes:
                    return SITE + map_reference(value, group['source'], locale, routes, document=True)
        return value
    for (start, end), payload in payloads.items():
        changes.append((start, end, json.dumps(localized_schema(payload), ensure_ascii=False, indent=2)))
    # Inline attributes remain in preserved start tags. Merge their translated
    # values into the outer block replacement rather than losing either edit.
    collapsed = []
    for start, end, value in sorted(changes, key=lambda x: (x[0], -x[1])):
        if collapsed and start >= collapsed[-1][0] and end <= collapsed[-1][1]:
            outer_start, outer_end, outer = collapsed[-1]
            old = source[start:end]
            if old not in outer:
                raise ValueError('Overlapping translation cannot be restored: ' + group['source'])
            collapsed[-1] = (outer_start, outer_end, outer.replace(old, value, 1))
        else:
            collapsed.append((start, end, value))
    for start, end, value in reversed(collapsed):
        source = source[:start] + value + source[end:]
    from site_translation_faq import synchronize as synchronize_faq
    source = synchronize_faq(original, source, target_canonical, locale)
    from site_translation_examples import add_notice
    source = add_notice(source, group['source'], locale)
    def reference(match):
        key, quote, value = match.groups()
        if key in ('srcset', 'imagesrcset'):
            mapped = map_srcset(html.unescape(value), group['source'], locale, routes)
        elif key == 'style':
            mapped = map_css_urls(html.unescape(value), group['source'], locale, routes)
        else:
            mapped = map_reference(value, group['source'], locale, routes, document=key == 'href')
        if key == 'src' and locale != 'ja' and '/assets/img/app-store-badge-ja.' in mapped:
            mapped = mapped.replace('/assets/img/app-store-badge-ja.', '/assets/img/app-store-badge-en.')
        if key == 'src' and script_paths and urlsplit(mapped).path.endswith('.js') and urlsplit(mapped).path in script_paths:
            mapped = script_paths[urlsplit(mapped).path]
        return key + '=' + quote + html.escape(mapped, quote=True) + quote
    references = []
    for node in all_nodes(Parser(source).root):
        if node.tag.startswith('#'):
            continue
        raw = source[node.start:node.inner]
        updated = re.sub(r'\b(href|src|srcset|imagesrcset|action|poster|style)=("|\')(.*?)\2', reference, raw, flags=re.S)
        if node.tag == 'meta':
            property_name = (node.attrs.get('property') or node.attrs.get('name') or '').lower()
            value = (target_canonical if property_name in ('og:url', 'twitter:url')
                     else OG_LOCALES[locale] if property_name == 'og:locale' else None)
            if value is not None:
                updated = re.sub(r'(\bcontent\s*=\s*)(["\'])(.*?)\2',
                                 lambda m: m[1] + m[2] + html.escape(value, quote=True) + m[2],
                                 updated, flags=re.S | re.I)
        if updated != raw:
            references.append((node.start, node.inner, updated))
    for start, end, value in reversed(references):
        source = source[:start] + value + source[end:]
    css_changes = []
    for node in all_nodes(Parser(source).root):
        if node.tag == 'style':
            css = source[node.inner:node.end]
            mapped = map_css_urls(css, group['source'], locale, routes)
            if mapped != css:
                css_changes.append((node.inner, node.end, mapped))
    for start, end, value in reversed(css_changes):
        source = source[:start] + value + source[end:]
    source = inline_code(source, group['source'], dynamic_rows or [])
    from site_translation_diagrams import localize_references
    source = localize_references(source, locale)
    uses_runtime = 'globalThis.SimpleMemoI18n.' in source or any(
        'src="' + new + '"' in source or "src='" + new + "'" in source
        for old, new in (script_paths or {}).items() if old.endswith('.js'))
    def html_direction(match):
        tag = re.sub(r'\sdir\s*=\s*(["\']).*?\1', '', match[0], flags=re.I)
        return tag[:-1] + ' dir="' + ('rtl' if locale == 'ar' else 'ltr') + '">'
    source = re.sub(r'<html\b[^>]*>', html_direction, source, count=1)
    # The existing head generator owns canonical and alternate tags. Calling
    # its pure transform keeps subsequent generator runs idempotent.
    from normalize_i18n_head import set_html_lang, build_block, replace_i18n_lines
    alternates = [(language, SITE + page_url(file)) for language, file in group['pages'].items()]
    block = build_block(locale, target_canonical, alternates,
                        SITE + page_url(group['pages'].get('ja', group['source'])))
    source = replace_i18n_lines(set_html_lang(source, locale), block)
    if locale == 'en':
        from inject_locale_seed import transform as seed_english
        source, _ = seed_english(source)
    from sync_shared_chrome import transform as chrome
    from site_locales import language_menu
    from sync_page_design import transform as design
    file = group['pages'][locale]
    source = design(chrome(source, file), file)
    menu = next(node for node in all_nodes(Parser(source).root)
                if 'site-languages' in (node.attrs.get('class') or '').split())
    source = source[:menu.start] + language_menu(file, locale,
              {language: page_url(path) for language, path in group['pages'].items()}) + source[menu.stop:]
    if uses_runtime:
        runtime = script_paths['runtime']
        head = next(node for node in all_nodes(Parser(source).root) if node.tag == 'head')
        source = source[:head.inner] + '\n<script src="' + runtime + '"></script>' + source[head.inner:]
    copyright_line = CONSTANTS.get('copyrightLines', {}).get(locale,
        CONSTANTS['copyrightLine'] if locale == 'ja' else CONSTANTS['copyrightLineEn'])
    source = re.sub(r'((?:©|&copy;)\s?2026[^<\n]{0,200})(?=</p>|\n|</div>)',
                    lambda match: html.escape(copyright_line, quote=False), source)
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--extract', type=Path)
    mode.add_argument('--write', action='store_true')
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--selftest', action='store_true')
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if args.extract:
        args.extract.write_text(json.dumps(extract(), ensure_ascii=False, indent=2) + '\n')
        return 0
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '*.html'], cwd=ROOT, text=True).splitlines()
    errors = coverage_errors(ROOT, groups(), files)
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    catalogs, output, errors, dynamic_assets = {}, {}, [], {}
    routes = document_routes()
    for group in groups():
        for locale, file in group['pages'].items():
            if locale in group['existing']:
                continue
            if locale not in catalogs:
                path = CATALOGS / (locale + '.json')
                catalogs[locale] = json.loads(path.read_text()) if path.exists() else {}
                try:
                    assets, paths, rows = locale_assets(locale, catalogs[locale])
                    output.update(assets)
                    dynamic_assets[locale] = (paths, rows)
                except ValueError as error:
                    errors.append(str(error))
                    dynamic_assets[locale] = ({}, [])
            try:
                output[file] = translate_document(group, locale, catalogs[locale], routes, *dynamic_assets[locale])
            except ValueError as error:
                errors.append(str(error))
    if errors:
        print('\n'.join(errors[:20]), file=sys.stderr)
        print(f'{len(errors)} incomplete translations; no HTML written.', file=sys.stderr)
        return 1
    # Resolve English breadcrumbs against this complete build, including pages
    # not yet written to disk. The older English finalizer uses the same rule.
    from finalize_split_pages import finish_breadcrumbs
    for file, source in list(output.items()):
        if file.startswith('en/') and file.endswith('.html'):
            output[file] = finish_breadcrumbs(source, ROOT, documents=output)
    from site_translation_diagrams import localize_references
    for group in groups():
        for locale, file in group['existing'].items():
            original = (ROOT/file).read_text()
            localized = localize_references(original, locale)
            if original != localized:
                output[file] = localized
    stale = []
    for file, source in output.items():
        path = ROOT / file
        if not path.exists() or path.read_text() != source:
            stale.append(file)
            if args.write:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(source)
    print(f'{len(output)} translations; {len(stale)} ' + ('written' if args.write else 'stale'))
    return 1 if stale and args.check else 0

if __name__ == '__main__':
    raise SystemExit(main())
