"""Translate only approved program literals, never user-created note content."""
import hashlib
import html
import json
import posixpath
import re
from pathlib import Path
from localization_registry import ROOT
from site_translation_units import collect, source_language, Parser, all_nodes
from site_translation_validation import validate, render


def bindings():
    rows = json.loads((ROOT / 'data/i18n/dynamic-text.json').read_text())
    reference = 'assets/data/obsidian-uri-generator-fixed-results.json'
    # Localize labels of published observations, never their measured input,
    # URI, evidence identifiers, hashes, or user-entered form values.
    data = json.loads((ROOT / reference).read_text())
    rows.extend({'file': reference, 'source': 'ja', 'text': item['title']}
                for item in data['observations'])
    return rows


def translated_message(binding, locale, catalog):
    source = binding['text']
    if binding['source'] == locale:
        return source
    changes = []
    for unit in collect(source):
        language = source_language(unit, binding['source'])
        key = language + ':' + unit['id']
        entry = {'source': unit['text'], 'text': unit['text']} if unit.get('direct') or language == locale else catalog.get(key)
        if not entry or entry['source'] != unit['text']:
            raise ValueError('Missing dynamic translation: ' + key)
        error = validate(unit['text'], entry['text'], locale)
        if error:
            raise ValueError('Invalid dynamic translation: ' + key + ': ' + error)
        is_text = unit['tag'] == '#text'
        if is_text:
            # Program fragments can display YAML/Markdown with significant
            # line breaks. Catalog prose is normalized, but the surrounding
            # whitespace belongs to the original fragment, not its translation.
            original = source[slice(*unit['range'])]
            unit = dict(unit, prefix=re.match(r'\s*', original)[0],
                        suffix=re.search(r'\s*$', original)[0])
        value = render(unit, entry['text'], locale=locale)
        # Program strings are text, not HTML attributes, so translated text is
        # decoded once. Protected markup (tags, attributes, code/kbd/pre and
        # other skipped elements, comments) keeps its source encoding: decoding
        # it would turn escaped sample text into live markup.
        changes.append((*unit['range'], html.unescape(value) if is_text else value))
    for start, end, value in reversed(changes):
        source = source[:start] + value + source[end:]
    return source


def initial_demo_note(source, file, locale, catalog, rows):
    # The AI-tags tab handler already uses an approved translated fragment.
    # Render that same fragment before interaction, without enabling general
    # translation of pre/code samples or user-created notes.
    if file != 'ai-tags/index.html':
        return source
    notes = [node for node in all_nodes(Parser(source).root)
             if node.tag == 'pre' and node.attrs.get('id') == 'demo-note']
    if len(notes) != 1:
        raise ValueError('Expected one initial AI-tags demo note: ' + file)
    note = notes[0]
    fragment = source[note.inner:note.end]
    approved = [row for row in rows
                if row['file'] == file and row['text'] == fragment]
    if len(approved) != 1:
        raise ValueError('Initial AI-tags demo must match one approved program literal: ' + file)
    translated = translated_message(approved[0], locale, catalog)
    return source[:note.inner] + translated + source[note.end:]


def wrap_code(code, rows):
    digest = hashlib.sha256(code.encode()).hexdigest()
    replacements = []
    for row in rows:
        if row['scriptHash'] != digest:
            continue
        start, end = row['start'], row['end']
        if code[start:end] != row['literal']:
            raise ValueError('Dynamic text binding no longer matches: ' + row['file'])
        key = json.dumps(row['text'], ensure_ascii=False)
        if row.get('parameters'):
            expression = 'globalThis.SimpleMemoI18n.format(' + key + ',[' + ','.join(row['parameters']) + '])'
        else:
            expression = 'globalThis.SimpleMemoI18n.text(' + key + ')'
        replacements.append((start, end, expression))
    for start, end, value in sorted(replacements, reverse=True):
        code = code[:start] + value + code[end:]
    return code, len(replacements)


def inline_code(source, file, rows):
    expected = [row for row in rows if row['file'] == file]
    # With no approved literals for this file there is nothing to rewrite or
    # count. Other pipeline stages still validate the document's HTML.
    if not expected:
        return source
    changes = []
    count = 0
    for node in all_nodes(Parser(source).root):
        if node.tag != 'script' or node.attrs.get('src') or node.attrs.get('type') in ('application/json', 'application/ld+json'):
            continue
        code = source[node.inner:node.end]
        updated, changed = wrap_code(code, expected)
        count += changed
        if changed:
            changes.append((node.inner, node.end, updated))
    if count != len(expected):
        raise ValueError('Re-extract changed inline program text: ' + file)
    for start, end, value in reversed(changes):
        source = source[:start] + value + source[end:]
    return source


def runtime(messages):
    serialized = json.dumps(messages, ensure_ascii=False, separators=(',', ':'))
    return """/* Generated from approved interface text; does not inspect user content. */
(function () {
  'use strict';
  var messages = """ + serialized + """;
  function text(source) {
    return Object.prototype.hasOwnProperty.call(messages, source) ? messages[source] : source;
  }
  globalThis.SimpleMemoI18n = Object.freeze({
    text: text,
    format: function (source, values) {
      return text(source).replace(/\\{(\\d+)\\}/g, function (match, index) {
        return Number(index) < values.length ? String(values[Number(index)]) : match;
      });
    }
  });
})();
"""


def locale_assets(locale, catalog):
    rows = bindings()
    messages = {row['text']: translated_message(row, locale, catalog) for row in rows}
    assets = {}
    prefix = 'js/i18n/' + locale + '/'
    def asset_name(file, content):
        # Generated modules have their own content hash, including rewritten
        # dependencies. An old source hash must never label new bytes.
        stem = re.sub(r'\.[0-9a-f]{8,}(?=\.js$)', '', Path(file).name)[:-3]
        return prefix + stem + '.' + hashlib.sha256(content.encode()).hexdigest()[:12] + '.js'

    runtime_source = runtime(messages)
    runtime_path = asset_name('messages.js', runtime_source)
    assets[runtime_path] = runtime_source
    paths = {}
    transformed_files = {}
    for file in sorted({row['file'] for row in rows if row['file'].endswith('.js')}):
        original = (ROOT / file).read_text()
        expected = [row for row in rows if row['file'] == file]
        transformed, count = wrap_code(original, expected)
        if count != len(expected):
            raise ValueError('Re-extract changed interface script: ' + file)
        if file == 'js/obsidian-uri-generator.js':
            expression = "x.ref+' — '+x.title"
            if transformed.count(expression) != 1:
                raise ValueError('Review changed observation title rendering')
            transformed = transformed.replace(expression,
                "x.ref+' — '+globalThis.SimpleMemoI18n.text(x.title)")
        transformed_files[file] = transformed
    visiting = set()
    import_pattern = re.compile(r'(\bfrom\s*["\'])(\.[^"\']+)(["\'])')

    def publish(file):
        if '/' + file in paths:
            return paths['/' + file]
        if file in visiting:
            raise ValueError('Cyclic localized module dependency: ' + file)
        visiting.add(file)
        def dependency(match):
            linked = posixpath.normpath(posixpath.join(posixpath.dirname(file), match[2]))
            if linked not in transformed_files:
                raise ValueError('Unmapped localized module dependency: ' + linked)
            target = publish(linked)
            return match[1] + './' + posixpath.basename(target) + match[3]
        transformed = import_pattern.sub(dependency, transformed_files[file])
        output = asset_name(file, transformed)
        assets[output] = transformed
        paths['/' + file] = '/' + output
        visiting.remove(file)
        return '/' + output

    for file in transformed_files:
        publish(file)
    paths['runtime'] = '/' + runtime_path
    from site_translation_diagrams import diagram_assets
    diagrams, diagram_paths = diagram_assets(locale)
    assets.update(diagrams)
    paths.update(diagram_paths)
    return assets, paths, rows

