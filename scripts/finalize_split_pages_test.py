import json
import tempfile
import unittest
from pathlib import Path

from finalize_split_pages import finalize, finish_markup, finish_text_labels, finish_faq, finish_breadcrumbs, finish_schema_names, finish_product_schema
from inject_faq_schema import JSONLD_RE
from normalize_i18n_head import HeadInventory, build_block, replace_i18n_lines, set_html_lang


class SplitPageRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        (self.root / 'data/site-constants.json').write_text(json.dumps({
            'appNameJa': 'Obsidian連携シンプルメモ', 'appNameEn': 'Simple Memo - for Obsidian',
        }))
        path = self.root / "en/guides/index.html"
        path.parent.mkdir(parents=True)
        path.write_text('<h1>Guides</h1>')

    def test_final_pass_finds_later_generated_pages_and_preserves_switcher(self):
        src = '<a href="/guides/?a=1&amp;b=2#setup">Read</a><a hreflang="ja" href="/guides/">JA</a>'
        out = finish_markup(src, self.root, english=True)
        self.assertIn('href="/en/guides/?a=1&amp;b=2#setup"', out)
        self.assertIn('hreflang="ja" href="/guides/"', out)
        self.assertEqual(out, finish_markup(out, self.root, english=True))

    def test_does_not_change_external_links_or_script_and_comment_examples(self):
        src = '<a href="https://other.example/guides/">Other</a><!-- <a href="/guides/"> -->' \
              '<script>const example = \'<a href="/guides/">\';</script>'
        self.assertEqual(src, finish_markup(src, self.root, english=True))

    def test_both_languages_keep_body_visible_without_toggle_script(self):
        src = '<div class="article lang-content"><h1>Visible</h1></div>'
        for english in (True, False):
            out = finish_markup(src, self.root, english=english)
            self.assertEqual(out, '<div class="article"><h1>Visible</h1></div>')

    def test_empty_faq_is_rebuilt_from_visible_english_answers(self):
        src = '<head><script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script></head>' \
              '<details class="faq-details"><summary class="faq-summary">How?</summary>' \
              '<div class="faq-answer">Use <b>the template</b>.</div></details>'
        out = finish_faq(src, 'https://simplememofast.com/en/guides/')
        nodes = [json.loads(m[1]) for m in JSONLD_RE.finditer(out)]
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0]['mainEntity'][0]['name'], 'How?')
        self.assertEqual(nodes[0]['mainEntity'][0]['acceptedAnswer']['text'], 'Use the template.')
        self.assertEqual(out, finish_faq(out, 'https://simplememofast.com/en/guides/'))

    def test_empty_faq_in_graph_is_removed_without_losing_other_nodes(self):
        src = '<head><script type="application/ld+json">{"@graph":[{"@type":"FAQPage","mainEntity":[]},' \
              '{"@type":"Article","headline":"Original"}]}</script></head>'
        out = finish_faq(src, 'https://simplememofast.com/en/guides/')
        node = json.loads(next(JSONLD_RE.finditer(out))[1])
        self.assertEqual(node['@graph'], [{'@type': 'Article', 'headline': 'Original'}])

    def test_breadcrumb_names_follow_their_own_destination(self):
        src = '<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[' \
              '{"@type":"ListItem","position":1,"name":"Wrong article name",' \
              '"item":"https://simplememofast.com/guides/"}]}</script>'
        out = finish_breadcrumbs(src, self.root)
        crumb = json.loads(next(JSONLD_RE.finditer(out))[1])['itemListElement'][0]
        self.assertEqual(crumb['name'], 'Guides')
        self.assertEqual(crumb['item'], 'https://simplememofast.com/en/guides/')

    def test_other_item_lists_keep_their_editorial_labels(self):
        src = '<script type="application/ld+json">{"@type":"ItemList","itemListElement":[' \
              '{"@type":"ListItem","position":1,"name":"Recommended reading",' \
              '"item":"https://simplememofast.com/guides/"}]}</script>'
        self.assertEqual(finish_breadcrumbs(src, self.root), src)

    def test_existing_english_page_without_registered_pair_is_finalized(self):
        page = self.root / 'en/unpaired-example.html'
        page.write_text('<h1>Example</h1><a href="/guides/">Guides</a>')
        self.assertEqual(finalize(self.root), ['en/unpaired-example.html'])
        finalize(self.root, apply=True)
        self.assertIn('href="/en/guides/"', page.read_text())
        self.assertEqual(finalize(self.root), [])

    def test_accessibility_labels_are_english_without_rewriting_examples(self):
        src = '<nav aria-label="記事内の目次"></nav><img alt="Obsidianのグラフビュー。3つのノートと1本のリンクが表示されている">' \
              '<!-- aria-label="記事内の目次" --><script>const label = \'記事内の目次\';</script>'
        out = finish_markup(src, self.root, english=True)
        self.assertIn('aria-label="Table of contents"', out)
        self.assertIn('alt="Obsidian graph view showing three notes and one link"', out)
        self.assertIn('<!-- aria-label="記事内の目次" -->', out)
        self.assertIn("const label = '記事内の目次';", out)
        self.assertEqual(src, finish_markup(src, self.root, english=False))

    def test_schema_names_keep_identity_prices_and_original_reviews(self):
        payload = {'@graph': [
            {'@type': 'SoftwareApplication', '@id': 'https://simplememofast.com/#app',
             'name': 'Obsidian連携シンプルメモ', 'alternateName': ['SimpleMemo'], 'offers': {'price': '480'}},
            {'@type': 'DefinedTerm', 'name': '間隔反復法', 'url': '/glossary/spaced-repetition/'},
            {'@type': 'CollectionPage', 'name': '用語集'},
            {'@type': 'Review', 'name': '入力がとにかくスムーズ！'},
            {'@type': 'Organization', 'name': '別会社'},
        ]}
        src = '<h1>Memo App Glossary</h1><script type="application/ld+json">' + json.dumps(payload) + '</script>'
        out = finish_schema_names(src, self.root)
        nodes = json.loads(next(JSONLD_RE.finditer(out))[1])['@graph']
        self.assertEqual(nodes[0]['name'], 'Simple Memo - for Obsidian')
        self.assertEqual(nodes[0]['@id'], payload['@graph'][0]['@id'])
        self.assertEqual(nodes[0]['offers'], {'price': '480'})
        self.assertIn('Obsidian連携シンプルメモ', nodes[0]['alternateName'])
        self.assertEqual(nodes[1]['name'], 'Spaced Repetition')
        self.assertEqual(nodes[1]['url'], '/glossary/spaced-repetition/')
        self.assertEqual(nodes[2]['name'], 'Memo App Glossary')
        self.assertEqual(nodes[3:], payload['@graph'][3:])
        self.assertEqual(finish_schema_names(out, self.root), out)

    def test_visible_labels_preserve_source_examples_and_quoted_ui_names(self):
        kept = '<!-- 紹介用資料 --><script>const label = "紹介用資料";</script>' \
               '<pre>紹介用資料</pre><code>紹介用資料</code><p>Select 「保管庫を新規作成する」.</p>'
        src = '<head><title>紹介用資料</title></head><body><a> 紹介用資料 </a>' + kept + '</body>'
        out = finish_text_labels(src)
        self.assertIn('<a> Media kit </a>', out)
        self.assertIn('<title>紹介用資料</title>', out)
        self.assertIn(kept, out)
        self.assertEqual(finish_text_labels(out), out)

    def test_product_schema_english_targets_keep_prices_identity_and_locale(self):
        from inject_app_schema import C, TARGETS, build_node
        for rel, lang in TARGETS:
            if lang == 'ja':
                self.assertIn(('en/' + rel, 'en'), TARGETS)
        ja = json.loads(next(JSONLD_RE.finditer(build_node('ja')))[1])
        en = json.loads(next(JSONLD_RE.finditer(build_node('en')))[1])
        self.assertEqual(en['@id'], ja['@id'])
        self.assertEqual(en['author']['name'], 'AI ATAKA')
        self.assertEqual(en['name'], C['appNameEn'])
        self.assertIn('/us/', en['downloadUrl'])
        self.assertIn('/jp/', ja['downloadUrl'])
        self.assertEqual([x['price'] for x in en['offers']], ['0', C['priceMonthlyUsd'], C['priceYearlyUsd']])
        self.assertEqual([x['priceCurrency'] for x in en['offers']], ['USD'] * 3)
        self.assertEqual([x['price'] for x in ja['offers']], ['0', C['priceMonthlyJpy'], C['priceYearlyJpy'].replace(',', '')])
        self.assertEqual(en['offers'][0]['description'], f"Up to {C['freeSendsPerDay']} sends a day, free forever")

    def test_product_schema_stays_in_place_and_uses_real_head(self):
        from inject_app_schema import build_node, replace_or_insert
        block = build_node('en')
        src = '<head><script>const end = "</head>";</script></head><body>Keep</body>'
        out = replace_or_insert(src, block)
        self.assertLess(out.index('const end'), out.index('app-schema: managed'))
        self.assertEqual(replace_or_insert(out, block), out)
        followed = out.replace('</head>', '<link rel="alternate" type="application/rss+xml" href="/feed.xml"></head>')
        self.assertEqual(replace_or_insert(followed, block), followed)

    def test_extracted_product_restores_english_offers_from_locale_constants(self):
        from inject_app_schema import build_node
        src = '<head>' + build_node('ja') + '</head><body>Keep</body>'
        out = finish_product_schema(src, 'en/voice-input/index.html')
        self.assertIn(build_node('en'), out)
        self.assertIn('<body>Keep</body>', out)
        self.assertEqual(finish_product_schema(out, 'en/voice-input/index.html'), out)
        self.assertEqual(finish_product_schema(src, 'en/unrelated/index.html'), src)

    def test_head_normalization_preserves_script_comment_rss_banner_and_body(self):
        script = '<script>const sample = `\n<link rel="canonical" href="/template">\n`;</script>'
        comment = '<!-- example\n<link rel="alternate" hreflang="fr" href="/example">\n-->'
        rss = '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'
        banner = '<meta name="apple-itunes-app" content="app-id=6758438948">'
        body = '<body><p>Original body</p><link rel="canonical" href="/body-example"></body>'
        src = '<html lang="ja"><head>' + script + comment + rss + banner \
              + "<link href='/old' rel='canonical'><meta http-equiv='content-language' content='ja'></head>" + body + '</html>'
        block = build_block('en', 'https://simplememofast.com/en/example', [('en', 'https://simplememofast.com/en/example')], None)
        out = replace_i18n_lines(src, block)
        for original in [script, comment, rss, banner, body]:
            self.assertIn(original, out)
        self.assertEqual(len(HeadInventory(out).tags), 2)
        self.assertNotIn("href='/old'", out)
        self.assertEqual(replace_i18n_lines(out, block), out)

    def test_inline_head_insertion_stays_after_script_and_is_idempotent(self):
        src = '<HTML><head><script>const end = "</head>";</script></head><body>Keep</body></HTML>'
        block = build_block('en', 'https://simplememofast.com/en/example', [], None)
        out = replace_i18n_lines(src, block)
        self.assertLess(out.index('</script>'), out.index('i18n: managed'))
        self.assertEqual(replace_i18n_lines(out, block), out)
        self.assertIn('<html lang="en">', set_html_lang(out, 'en'))

    def test_document_language_ignores_html_examples_in_comments(self):
        example = '<!-- <html lang="ja"> -->'
        src = example + "<html lang = 'ja' dir = 'rtl'><head></head><body>Keep</body></html>"
        out = set_html_lang(src, 'en')
        self.assertIn(example, out)
        self.assertIn('<html lang="en">', out)
        self.assertEqual(set_html_lang(out, 'en'), out)


if __name__ == '__main__':
    unittest.main()
