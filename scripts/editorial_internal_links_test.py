"""Regression tests for exact, locale-scoped editorial link wrappers."""
import unittest
import contextlib
import io
from pathlib import Path
import tempfile
from unittest.mock import patch

import editorial_internal_links as links

FILE = 'blog/example.html'
LINE = '<p>Read about useful notes and private storage.</p>'


def plan(line=LINE, anchor='useful notes', href='/guides/notes/'):
    start = line.index(anchor)
    return {'version': 1, 'pages': {FILE: [{'before': line, 'wraps': [
        {'start': start, 'end': start + len(anchor), 'href': href, 'anchor': anchor}]}]}}


def document(line=LINE):
    return '<html><body><main><h1>Title</h1><p>Intro unchanged.</p><h2>Details</h2>\n' + line + '\n</main></body></html>'


class EditorialInternalLinksTests(unittest.TestCase):
    def using(self, data=None):
        return patch.object(links, 'load_manifest', return_value=links.validate_manifest(data or plan()))

    def test_idempotent_and_exact_roundtrip(self):
        source = document()
        with self.using():
            result = links.apply(source, FILE)
            self.assertEqual(result, source.replace('useful notes', '<a href="/guides/notes/">useful notes</a>'))
            self.assertEqual(links.apply(result, FILE), result)
            self.assertEqual(links.strip(result, FILE), source)
            self.assertEqual(links.strip(source, FILE), source)
            self.assertEqual(links.apply(source, 'es/blog/example.html'), source)
            self.assertEqual(links.strip(result, 'es/blog/example.html'), result)

    def test_multiple_wraps_preserve_bytes(self):
        data = plan()
        other = plan(anchor='private storage', href='/privacy')['pages'][FILE][0]['wraps'][0]
        data['pages'][FILE][0]['wraps'].append(other)
        with self.using(data):
            result = links.apply(document(), FILE)
            self.assertEqual(result.count('<a href='), 2)
            self.assertEqual(links.strip(result, FILE), document())

    def test_stale_ambiguous_and_wrong_wrapper_rejected(self):
        with self.using():
            for source in (document().replace('useful notes', 'other notes'),
                           document(LINE + '\n' + LINE),
                           document().replace('useful notes', '<a href="/wrong/">useful notes</a>')):
                with self.subTest(source=source), self.assertRaises(ValueError):
                    links.apply(source, FILE)
                with self.assertRaises(ValueError):
                    links.strip(source, FILE)

    def test_existing_destinations_and_aliases_rejected(self):
        for href in ('/guides/notes/', '/guides/notes', '/guides/notes.html#x',
                     '/guides/notes/index.html?x=1', 'https://simplememofast.com/guides/notes/#x'):
            with self.subTest(href=href), self.using():
                source = document().replace('</body>', '<footer><a href="' + href + '">Existing</a></footer></body>')
                with self.assertRaisesRegex(ValueError, 'already linked'):
                    links.apply(source, FILE)

    def test_preserves_unrelated_existing_link(self):
        source = document().replace('</main>', '<a href="/other?x=1#y" class="keep">Existing</a></main>')
        with self.using():
            self.assertEqual(links.strip(links.apply(source, FILE), FILE), source)

    def test_intro_and_heading_rejected(self):
        with self.using():
            with self.assertRaisesRegex(ValueError, 'substantive h2'):
                links.apply(document().replace('<h2>Details</h2>', ''), FILE)
        line = '<h2>Read useful notes</h2>'
        with self.using(plan(line)):
            with self.assertRaises(ValueError):
                links.apply(document(line), FILE)

    def test_hidden_template_and_excluded_ancestors(self):
        wrappers = ('<div hidden>{}</div>', '<div aria-hidden="true">{}</div>',
                    '<div style="display: none">{}</div>', '<div style="visibility:hidden">{}</div>',
                    '<div class="hero-intro">{}</div>', '<div class="related-posts">{}</div>',
                    '<div class="article-toc">{}</div>', '<nav>{}</nav>', '<aside>{}</aside>',
                    '<header>{}</header>', '<footer>{}</footer>', '<pre>{}</pre>',
                    '<code>{}</code>', '<template>{}</template>', '<div inert>{}</div>',
                    '<a href="/other/">{}</a>')
        for wrapper in wrappers:
            with self.subTest(wrapper=wrapper), self.using():
                with self.assertRaises(ValueError):
                    links.apply(document(wrapper.format(LINE)), FILE)

    def test_heading_outside_article_does_not_end_intro(self):
        source = '<h2>Not article content</h2>' + document().replace('<h2>Details</h2>', '')
        with self.using(), self.assertRaises(ValueError):
            links.apply(source, FILE)

    def test_section_heading_is_substantive_but_hidden_heading_is_not(self):
        source = document().replace('<h2>Details</h2>', '')
        source = source.replace(LINE, '<section><header><h2>Details</h2></header>' + LINE + '</section>')
        with self.using():
            self.assertEqual(links.strip(links.apply(source, FILE), FILE), source)
            for extra in (' hidden', ' class="hero"', ' aria-hidden="true"'):
                with self.subTest(extra=extra), self.assertRaises(ValueError):
                    links.apply(source.replace('<header>', '<header' + extra + '>'), FILE)

    def test_non_ascii_offsets_preserve_original(self):
        line = '<p>説明：日本語のメモを保存します。</p>'
        with self.using(plan(line, '日本語のメモ')):
            source = document(line)
            self.assertEqual(links.strip(links.apply(source, FILE), FILE), source)

    def test_attribute_is_not_text(self):
        line = '<p title="useful notes">Other text</p>'
        with self.using(plan(line)), self.assertRaises(ValueError):
            links.apply(document(line), FILE)

    def test_entities_preserved_and_partial_entities_rejected(self):
        line = '<p>Read useful &amp; private notes.</p>'
        with self.using(plan(line, 'useful &amp; private')):
            source = document(line)
            self.assertEqual(links.strip(links.apply(source, FILE), FILE), source)
        with self.using(plan(line, 'amp')), self.assertRaisesRegex(ValueError, 'entity'):
            links.apply(document(line), FILE)

    def test_invalid_manifest_paths_routes_and_self_links(self):
        for href in ('/blog/example', '/blog/example.html#x', '/blog/example/index.html',
                     '//evil.com/path', 'https://evil.com/path', '/a/../b', '/%2e%2e/b', '/x?y=1'):
            with self.subTest(href=href), self.assertRaises(ValueError):
                links.validate_manifest(plan(href=href))
        data = plan()
        data['pages']['../blog/evil.html'] = data['pages'].pop(FILE)
        with self.assertRaises(ValueError):
            links.validate_manifest(data)

    def test_repeated_target_overlap_offsets_and_count_rejected(self):
        data = plan()
        duplicate = plan(anchor='private storage', href='/guides/notes/index.html')['pages'][FILE][0]['wraps'][0]
        data['pages'][FILE][0]['wraps'].append(duplicate)
        with self.assertRaises(ValueError):
            links.validate_manifest(data)
        data = plan()
        overlap = plan(anchor='notes', href='/second/')['pages'][FILE][0]['wraps'][0]
        data['pages'][FILE][0]['wraps'].append(overlap)
        with self.assertRaises(ValueError):
            links.validate_manifest(data)
        for field, value in [('start', True), ('end', 999), ('anchor', 'changed')]:
            data = plan()
            data['pages'][FILE][0]['wraps'][0][field] = value
            with self.assertRaises(ValueError):
                links.validate_manifest(data)
        data = {'version': 1, 'pages': {FILE: []}}
        for i in range(6):
            line = '<p>Unique text ' + str(i) + '</p>'
            data['pages'][FILE].append(plan(line, 'text', '/target-' + str(i))['pages'][FILE][0])
        with self.assertRaisesRegex(ValueError, 'five'):
            links.validate_manifest(data)

    def test_translation_units_restored_exactly(self):
        from site_translation_units import collect
        with self.using():
            source = document()
            result = links.apply(source, FILE)
            self.assertEqual(collect(links.strip(result, FILE)), collect(source))


class EditorialTranslationIntegrationTests(unittest.TestCase):
    def test_source_units_and_unselected_locale_keep_original_markup(self):
        import build_site_translations as build
        source = document().replace('<html>', '<html lang="en"><head><title>Guide</title></head>')
        source = source.replace('<body>', '<body><details class="site-languages"><summary>EN</summary></details>')
        pages = links.validate_manifest(plan())
        group = {'source': FILE, 'sourceLocale': 'en', 'existing': {'en': FILE},
                 'pages': {'en': FILE, 'es': 'es/blog/example.html'}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'blog').mkdir()
            path = root / FILE
            path.write_text(source)
            with patch.object(build, 'ROOT', root), patch.object(links, 'load_manifest', return_value=pages):
                build.source_units.cache_clear()
                try:
                    baseline = build.source_units(FILE, 'en')
                    path.write_text(links.apply(source, FILE))
                    build.source_units.cache_clear()
                    self.assertEqual(build.source_units(FILE, 'en'), baseline)
                    catalog = {'en:' + unit['id']: {'source': unit['text'], 'text': unit['text']}
                               for unit in baseline[1]}
                    with patch('sync_shared_chrome.transform', side_effect=lambda s, f: s), \
                         patch('sync_page_design.transform', side_effect=lambda s, f: s):
                        translated = build.translate_document(group, 'es', catalog, {})
                        with patch.object(build, 'units_for', return_value=baseline):
                            original_translation = build.translate_document(group, 'es', catalog, {})
                    self.assertEqual(translated, original_translation)
                    self.assertEqual(build.apply_editorial_links(translated, 'es/blog/example.html'), translated)
                    self.assertNotIn('href="/guides/notes/"', translated)
                finally:
                    build.source_units.cache_clear()

    def test_main_check_keeps_exact_comparison_and_checks_editorial_wraps(self):
        import build_site_translations as build
        pages = links.validate_manifest(plan())
        group = {'source': FILE, 'sourceLocale': 'en', 'existing': {'en': FILE},
                 'pages': {'en': FILE, 'es': 'es/blog/example.html'}}
        generated = '<html><body><main><h2>Content</h2><p>Generated prose.</p></main></body></html>'
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            (root / 'blog').mkdir()
            (root / 'es/blog').mkdir(parents=True)
            stack.enter_context(patch.object(build, 'ROOT', root))
            stack.enter_context(patch.object(build, 'CATALOGS', root / 'catalogs'))
            stack.enter_context(patch.object(build, 'groups', return_value=[group]))
            stack.enter_context(patch.object(build, 'coverage_errors', return_value=[]))
            stack.enter_context(patch.object(build.subprocess, 'check_output', return_value=''))
            stack.enter_context(patch.object(build, 'locale_assets', return_value=({}, {}, [])))
            stack.enter_context(patch.object(build, 'translate_document', return_value=generated))
            stack.enter_context(patch.object(build, 'leftover_dates', return_value=[]))
            stack.enter_context(patch('site_translation_diagrams.localize_references', side_effect=lambda s, locale: s))
            stack.enter_context(patch.object(links, 'load_manifest', return_value=pages))
            stack.enter_context(patch.object(build, 'load_manifest', return_value=pages))
            stack.enter_context(patch('sys.argv', ['build_site_translations.py', '--check']))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            editorial = links.apply(document(), FILE)
            (root / FILE).write_text(editorial)
            (root / 'es/blog/example.html').write_text(generated)
            self.assertEqual(build.main(), 0)
            (root / 'es/blog/example.html').write_text(generated.replace('Generated prose.', 'Drifted prose.'))
            self.assertEqual(build.main(), 1)
            (root / 'es/blog/example.html').write_text(generated)
            (root / FILE).write_text(document())
            self.assertEqual(build.main(), 1)
            self.assertEqual((root / FILE).read_text(), document(), '--check must not write')


if __name__ == '__main__':
    unittest.main()
