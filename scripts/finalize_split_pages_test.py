import json
import tempfile
import unittest
from pathlib import Path

from finalize_split_pages import finalize, finish_markup, finish_faq, finish_breadcrumbs
from inject_faq_schema import JSONLD_RE


class SplitPageRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
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


if __name__ == '__main__':
    unittest.main()
