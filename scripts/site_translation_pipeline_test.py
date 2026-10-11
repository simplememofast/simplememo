"""Regression tests for translated links, FAQ data, program messages and output."""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

import build_site_translations as build
import site_translation_dynamic as dynamic
from site_translation_units import collect, collect_extra, prepare_source, examples_for
from site_translation_validation import render
from site_translation_faq import synchronize
from faq_question_audit import audit_page


class TranslationPipelineTests(unittest.TestCase):
    def test_keep_product_labels_are_preserved_but_ordinary_verbs_translate(self):
        source='<p>KeepメモとKeepの設定</p><a>Keep</a><h2>Export Keep data</h2><p>Keep a backup</p>'
        units=collect(source)
        self.assertEqual([v['raw'] for u in units[:3] for v in u['tokens'].values()],['Keep','Keep','Keep','Keep'])
        self.assertEqual(units[3]['text'],'Keep a backup')

    def test_uri_actions_remain_literal_without_swallowing_ordinary_words(self):
        entry=collect('<p>open・new・daily・unique・search・hook-get-address・choose-vaultを使う。openedは別の単語。</p>', examples_for('obsidian/uri-scheme/index.html'))[0]
        literals=[v['raw'] for v in entry['tokens'].values()]
        self.assertEqual(literals, ['open','new','daily','unique','search','hook-get-address','choose-vault'])
        self.assertIn('opened',entry['text'])

    def test_obsidian_folder_and_markdown_extension_remain_literal(self):
        from site_translation_literals import literal_filenames
        source='<p>.obsidianフォルダと.mdを保存します。</p>'
        entry=collect(source,literal_filenames(source,'example.html',Path('.')))[0]
        self.assertEqual([v['raw'] for v in entry['tokens'].values()],['.obsidian','.md'])

    def test_evidence_case_ids_remain_complete_in_translated_prose(self):
        from site_translation_literals import literal_filenames
        source='<p>I:W1とS:D1/D2/D3、T:P1〜P3の結果を比較します。</p>'
        entry=collect(source,literal_filenames(source,'obsidian/uri-scheme/index.html',Path('.')))[0]
        self.assertEqual([v['raw'] for v in entry['tokens'].values()],['I:W1','S:D1/D2/D3','T:P1〜P3'])
        self.assertEqual(render(entry,'Compare ZXQ0000, ZXQ0001 and ZXQ0002.',locale='en'),'Compare I:W1, S:D1/D2/D3 and T:P1〜P3.')

    def test_translated_faq_heading_keeps_language_independent_question_markers(self):
        faq={'@type':'FAQPage','mainEntity':[{'name':'Question?','acceptedAnswer':{'text':'Answer.'}}]}
        source='<html lang="en"><script type="application/ld+json">'+json.dumps(faq)+'</script><h2>FAQ</h2><p><strong>Question?</strong><br>Answer.</p></html>'
        translated=source.replace('lang="en"','lang="es"').replace('<h2>FAQ</h2>','<h2>Preguntas frecuentes</h2>').replace('<strong>Question?</strong>','<strong>¿Pregunta?</strong>').replace('<br>Answer.','<br>Respuesta.')
        output=synchronize(source,translated,'https://simplememofast.com/es/example','es')
        self.assertIn('<strong data-faq-question="">¿Pregunta?</strong>',output)
        self.assertEqual(audit_page('example',output)[0]['state'],'match')

    def test_faq_audit_counts_a_visible_foreign_language_command(self):
        faq={'@type':'FAQPage','inLanguage':'es','mainEntity':[{'name':'¿Digo シンプルメモで残す?'}]}
        source='<html lang="es"><script type="application/ld+json">'+json.dumps(faq)+'</script><summary>¿Digo <span lang="ja" translate="no">シンプルメモで残す</span>?</summary></html>'
        self.assertEqual(audit_page('example',source)[0]['state'],'match')

    def test_plain_prose_keeps_date_format_and_app_scheme_literal(self):
        from site_translation_literals import literal_filenames
        from site_translation_units import collect
        source = '<p>保存先は yyyy-MM-dd.md、時刻は HH:mm、固定ノートは Inbox.md。失敗時は obsidian:// を使います。</p>'
        names = literal_filenames(source, 'obsidian/index.html', Path('.'))
        entry = collect(source, names)[0]
        translated = render(entry, 'Archivo ZXQ0000, hora ZXQ0001, nota fija ZXQ0002. Si falla, se usa ZXQ0003.', locale='es')
        for literal in ('yyyy-MM-dd.md', 'HH:mm', 'Inbox.md', 'obsidian://'):
            self.assertIn(literal, translated)

    def test_translated_chart_preserves_geometry_and_wraps_caveats(self):
        from site_translation_diagrams import label_units, translate_svg
        source = '<svg viewBox="0 0 200 100" aria-label="図"><rect width="200" height="100"/><path d="M1 2L3 4"/><text x="10" y="90" font-size="12">未観測ZXQ9999</text></svg>'
        # Source examples use actual prose and digits; ZXQ is reserved for the
        # extracted representation, never an authored label.
        source=source.replace('ZXQ9999','3件')
        labels={u['id']:{'source':u['text'],'translations':{'en':'Chart' if u.get('kind')=='attribute' else 'The first ZXQ0000 cases have not been observed; this qualification remains visible.'}} for _,u in label_units(source)}
        output=translate_svg(source,'en',labels)
        self.assertIn('d="M1 2L3 4"',output)
        self.assertIn('aria-label="Chart"',output)
        self.assertIn('<tspan',output)
        self.assertIn('have not been', re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', output)))
        self.assertNotIn('0 0 200 100',output)

    def test_diagram_labels_fail_on_stale_source_or_missing_language(self):
        from site_translation_diagrams import translate_svg
        with self.assertRaisesRegex(ValueError,'Missing or stale'):
            translate_svg('<svg viewBox="0 0 200 100"><text>未観測</text></svg>','en',{})

    def test_diagram_reference_updates_preserve_original_download(self):
        import site_translation_diagrams as diagrams
        source='<img src="/chart.svg"><a href="/chart.svg?view=large#plot">Chart</a><a href="/chart.svg?raw=1#original" download="original.svg">Japanese original</a>'
        path='/assets/img/i18n/en/chart.12345678.abcdef123456.svg'
        with patch.object(diagrams,'diagram_assets',return_value=({}, {'/chart.svg':path})):
            output=diagrams.localize_references(source,'en')
            self.assertIn(path+'?view=large#plot',output)
            self.assertIn('href="/chart.svg?raw=1#original" download="original.svg"', output)
            self.assertEqual(output,diagrams.localize_references(output,'en'))

    def test_nested_locale_pages_keep_their_sitemap_partition(self):
        from generate_sitemap import determine_target, SITE_URL, MINOR_LOCALES
        for locale in MINOR_LOCALES:
            self.assertEqual(determine_target(SITE_URL+'/'+locale+'/guides/'), 'locales')
        self.assertEqual(determine_target(SITE_URL+'/en/guides/'), 'en')
        self.assertEqual(determine_target(SITE_URL+'/guides/'), 'ja')

    def test_faq_uses_its_own_answer_before_identical_unrelated_prose(self):
        faq = {'@type':'FAQPage','mainEntity':[{'name':'Question?','acceptedAnswer':{'text':'An answer.'}}]}
        source = '<script type="application/ld+json">'+json.dumps(faq)+'</script><details><summary>Question?</summary><p>An <strong>answer</strong>.</p></details><aside><p>An answer.</p></aside>'
        translated = source.replace('<p>An <strong>answer</strong>.</p>','<p>The <strong>FAQ answer</strong>.</p>').replace('<p>An answer.</p>','<p>Separate explanation.</p>')
        output = synchronize(source, translated, 'https://simplememofast.com/en/example', 'en')
        schema = json.loads(re.search(r'<script[^>]*>(.*?)</script>', output, re.S)[1])
        self.assertEqual(schema['mainEntity'][0]['acceptedAnswer']['text'], 'The FAQ answer.')

    def test_demonstrated_search_keeps_literal_tag_in_translated_prose(self):
        unit = collect('<p>tag:#研究で4ノートを表示。</p>', examples_for('obsidian/graph-view/index.html'))[0]
        output = render(unit, 'Displayed ZXQ0001 notes with ZXQ0000.', locale='en')
        self.assertIn('tag:#研究', output)
        self.assertIn('4 notes', output)

    def test_unregistered_public_page_cannot_silently_escape_translation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp);(root/'source.html').write_text('source')
            groups = [{'existing':{'ja':'source.html'},'pages':{'ja':'source.html','en':'en/source.html'}}]
            self.assertEqual(build.coverage_errors(root,groups,['source.html','admin/index.html']),[])
            errors=build.coverage_errors(root,groups,['source.html','unlisted.html'])
            self.assertTrue(errors)
            self.assertIn('unlisted.html',errors[0])
            (root/'source.html').unlink()
            errors=build.coverage_errors(root,groups,[])
            self.assertTrue(errors)
            self.assertIn('missing',errors[0])

    def test_internal_routes_keep_query_and_fragment(self):
        group = {'pages': {'ar': 'ar/guides/index.html'}}
        routes = {'/guides/index.html': group}
        self.assertEqual(build.map_reference('../guides/index.html?mode=read#steps', 'blog/example.html', 'ar', routes, True), '/ar/guides/?mode=read#steps')
        store = 'https://apps.apple.com/jp/app/id6758438948?ct=web_obsidian_v1&ppid=example'
        self.assertEqual(build.map_reference(store, 'blog/example.html', 'ar', routes, True), store)
        self.assertEqual(build.map_reference(store.replace('&','&amp;'), 'blog/example.html', 'ar', routes, True), store)

    def test_responsive_images_and_css_keep_asset_locations(self):
        self.assertEqual(build.map_srcset('../img/a.webp 1x, ../img/b.webp 2x', 'blog/example.html', 'es', {}), '/img/a.webp 1x, /img/b.webp 2x')
        self.assertEqual(build.map_css_urls("url('../img/a.webp')", 'blog/example.html', 'es', {}), "url('/img/a.webp')")
        data = 'url("data:image/svg+xml,<svg></svg>")'
        self.assertEqual(build.map_css_urls(data, 'blog/example.html', 'es', {}), data)

    def test_existing_translations_keep_their_actual_section_anchor(self):
        group = next(g for g in build.groups() if g['source'] == 'faq.html')
        routes = {'/faq': group, '/en/faq': group}
        self.assertEqual(build.map_reference('/faq?via=guide#pricing-ja', 'blog/example.html', 'en', routes, True), '/en/faq?via=guide#pricing-en')
        self.assertEqual(build.map_reference('/en/faq#pricing-en', 'example.html', 'es', routes, True), '/es/faq#pricing-ja')
        self.assertEqual(build.map_reference('/faq#unknown', 'example.html', 'en', routes, True), '/en/faq#unknown')

    def test_links_can_start_from_a_generated_language_route(self):
        routes = build.document_routes()
        self.assertEqual(build.map_reference('/en/captio/?from=guide#steps',
            'en/blog/example.html', 'es', routes, True), '/es/captio/?from=guide#steps')

    def test_missing_and_stale_catalogs_fail_before_output(self):
        source = '<html lang="ja"><head><title>説明</title></head><body><p>説明</p></body></html>'
        group = {'source': 'source.html', 'sourceLocale': 'ja', 'pages': {'en': 'en/source.html'}}
        unit = collect(source)[0]
        with patch.object(build, 'units_for', return_value=(source, collect(source))):
            with self.assertRaisesRegex(ValueError, 'missing'):
                build.translate_document(group, 'en', {}, {})
            with self.assertRaisesRegex(ValueError, 'stale source'):
                build.translate_document(group, 'en', {'ja:'+unit['id']: {'source': 'outdated', 'text': 'Description'}}, {})

    def test_document_preserves_root_attributes_and_sets_rtl(self):
        source = '<html class="theme" lang="ja"><head><title>説明</title><meta property="og:locale" content="ja_JP"><meta content=\'https://simplememofast.com/source\' property=\'og:url\'><meta name="twitter:url" content="https://simplememofast.com/source"><script type="application/ld+json">{"@type":"WebPage","url":"https://simplememofast.com/source","inLanguage":"ja"}</script></head><body><details class="site-languages"><summary>JA</summary></details><main><h1>説明</h1></main></body></html>'
        group = {'source': 'source.html', 'sourceLocale': 'ja', 'pages': {'ja': 'source.html', 'ar': 'ar/source.html'}}
        units = collect(source) + collect_extra(source)
        catalog = {'ja:'+u['id']: {'source': u['text'], 'text': 'وصف'} for u in units}
        with patch.object(build, 'units_for', return_value=(source, units)), patch('sync_shared_chrome.transform', side_effect=lambda s, f:s), patch('sync_page_design.transform', side_effect=lambda s, f:s):
            output = build.translate_document(group, 'ar', catalog, {'/source': group})
        self.assertIn('<html class="theme" lang="ar" dir="rtl">', output)
        self.assertIn('href="https://simplememofast.com/ar/source"', output)
        self.assertIn('<h1>وصف</h1>', output)
        self.assertNotIn('messages.', output)
        self.assertIn('property="og:locale" content="ar_SA"', output)
        self.assertIn("content='https://simplememofast.com/ar/source' property='og:url'", output)
        self.assertIn('name="twitter:url" content="https://simplememofast.com/ar/source"', output)
        payload=json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>',output,re.S)[1])
        self.assertEqual(payload['url'],'https://simplememofast.com/ar/source')
        self.assertEqual(payload['inLanguage'],'ar')

    def test_faq_schema_uses_the_visible_translation(self):
        faq = {'@type':'FAQPage','inLanguage':'ja','mainEntity':[{'@type':'Question','name':'質問ですか？','acceptedAnswer':{'@type':'Answer','text':'回答です。'}}]}
        source = '<html lang="ja"><head><!-- faq-schema: managed by scripts/inject_faq_schema.py --><script type="application/ld+json">'+json.dumps(faq,ensure_ascii=False)+'</script></head><body><details class="faq-item"><summary>質問ですか？</summary><p>回答です。</p></details></body></html>'
        translated = source.replace('<summary>質問ですか？</summary>','<summary>Is this a question?</summary>').replace('<p>回答です。</p>','<p>This is the answer.</p>')
        output = synchronize(source,translated,'https://simplememofast.com/en/example','en').replace('lang="ja"','lang="en"')
        self.assertEqual([row['state'] for row in audit_page('example',output)],['match'])
        self.assertIn('This is the answer.',output)

    def test_managed_faq_summary_still_matches_the_generator(self):
        from inject_faq_schema import extract_faqs
        faq = {'@type':'FAQPage','mainEntity':[{'@type':'Question','name':'質問ですか？','acceptedAnswer':{'@type':'Answer','text':'回答です。'}}]}
        source = '<html lang="ja"><head><!-- faq-schema: managed by scripts/inject_faq_schema.py --><script type="application/ld+json">'+json.dumps(faq,ensure_ascii=False)+'</script></head><body><details class="faq-details"><summary class="faq-summary">質問ですか？</summary><div class="faq-answer">回答です。</div></details></body></html>'
        translated = source.replace('質問ですか？','¿Pregunta?').replace('回答です。','Respuesta.').replace('lang="ja"','lang="es"')
        output = synchronize(source,translated,'https://simplememofast.com/es/example','es')
        self.assertEqual(extract_faqs(output,'es'),[('¿Pregunta?','Respuesta.')])
        self.assertEqual([row['state'] for row in audit_page('example',output)],['match'])

    def test_localized_utility_keeps_code_and_app_route(self):
        source = '<html><head></head><body><h1>認証</h1><div id="codeDisplay">------</div><a id="appLinkJa">開く</a><div class="lang-divider"></div><h2>Verification</h2><a id="appLinkEn">Open</a><script>var here = window.location.href;document.getElementById(\'appLinkJa\').setAttribute(\'href\', here);document.getElementById(\'appLinkEn\').setAttribute(\'href\', here);</script></body></html>'
        output = prepare_source(source, 'ja', 'verify.html')
        self.assertIn('id="codeDisplay"', output)
        self.assertNotIn('appLinkEn', output)
        self.assertIn('new URL("/verify" + window.location.search + window.location.hash, window.location.origin)',output)

    def test_program_binding_rejects_changed_source(self):
        code = "const message = '保存';"
        start = code.index("'保存'")
        row = {'file':'page.html','scriptHash':hashlib.sha256(code.encode()).hexdigest(),'start':start,'end':start+4,'literal':"'保存'",'source':'ja','text':'保存'}
        good, count = dynamic.wrap_code(code,[row])
        self.assertEqual(count,1)
        self.assertIn('SimpleMemoI18n.text',good)
        with self.assertRaisesRegex(ValueError,'Re-extract'):
            dynamic.inline_code('<script>'+code+' </script>','page.html',[row])

    def test_program_yaml_fragment_keeps_line_breaks_and_indentation(self):
        source = '<span>title:</span> 買い物\n<span>tags:</span> [<span>日用品</span>]\n<span>---</span>\n  本文\n'
        translations = {'title:':'title:', '買い物':'Shopping', 'tags:':'tags:',
                        '日用品':'Supplies', '本文':'Body'}
        catalog = {}
        for unit in collect(source):
            key = ('ja' if re.search(r'[\u3040-\u30ff\u3400-\u9fff]',unit['text']) else 'en') + ':' + unit['id']
            catalog[key] = {'source':unit['text'], 'text':translations[unit['text']]}
        actual = dynamic.translated_message({'source':'ja','text':source},'es',catalog)
        self.assertEqual(actual, '<span>title:</span> Shopping\n<span>tags:</span> [<span>Supplies</span>]\n<span>---</span>\n  Body\n')

    def test_localized_module_names_hash_the_final_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp);folder=root/'memo-inbox';folder.mkdir()
            files = {
                'memo-inbox/core.123456789abc.js': "export const error='保存';",
                'memo-inbox/app.abcdef123456.js': "import {error} from './core.123456789abc.js';export const label='送信';",
            }
            rows=[];catalog={}
            for file,code in files.items():
                (root/file).write_text(code)
                word='保存' if 'core.' in file else '送信';literal="'"+word+"'";start=code.index(literal)
                rows.append({'file':file,'scriptHash':hashlib.sha256(code.encode()).hexdigest(),'start':start,'end':start+len(literal),'literal':literal,'source':'ja','text':word})
                unit=collect(word)[0];catalog['ja:'+unit['id']]={'source':unit['text'],'text':'Save' if word=='保存' else 'Send'}
            with patch.object(dynamic,'ROOT',root),patch.object(dynamic,'bindings',return_value=rows):
                assets, paths, _ = dynamic.locale_assets('en',catalog)
            for path,code in assets.items():
                self.assertIn(hashlib.sha256(code.encode()).hexdigest()[:12],path)
            core=Path(paths['/memo-inbox/core.123456789abc.js']).name
            app=assets[paths['/memo-inbox/app.abcdef123456.js'].lstrip('/')]
            self.assertIn("from './"+core+"'",app)
            self.assertNotIn('core.123456789abc.js',app)


if __name__ == '__main__':
    unittest.main()
