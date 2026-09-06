import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('ai-visibility-probe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def stream(self, search=True, error=False):
        rows = []
        if search:
            rows = [{'message': {'content': [{'type': 'tool_use', 'name': 'WebSearch', 'id': 's1'}]}},
                    {'message': {'content': [{'type': 'tool_result', 'tool_use_id': 's1', 'is_error': error}]}}]
        rows.append({'type': 'result', 'is_error': False, 'subtype': 'success', 'total_cost_usd': 0.1,
                     'result': 'シンプルメモ https://simplememofast.com/'})
        return '\n'.join(json.dumps(row) for row in rows)

    def test_links_alone_do_not_prove_search(self):
        output = probe.summarize(self.stream(search=False), 0)
        self.assertEqual(output['status'], 'unverified')
        self.assertIsNone(output['mention'])

    def test_failed_search_is_not_verified(self):
        self.assertEqual(probe.summarize(self.stream(error=True), 0)['status'], 'unverified')

    def test_success_and_process_failure(self):
        output = probe.summarize(self.stream(), 0)
        self.assertTrue(output['mention'])
        self.assertEqual(output['verified_search_calls'], 1)
        self.assertEqual(probe.summarize(self.stream(), 1)['status'], 'unverified')

    def test_source_url_is_a_citation_not_a_prose_mention(self):
        answer = 'Use a shortcut to capture a note.\n\nSources:\n- [Guide](https://simplememofast.com/en/blog/obsidian-iphone-memo)'
        result = probe.answer_metrics(answer, True)
        self.assertFalse(result['mention'])
        self.assertTrue(result['own_site_citation'])

    def test_source_titles_do_not_become_product_mentions(self):
        for heading in ['Sources:', '**Sources:**', '## References', '出典：', '参考リンク', 'Sources: [Simple Memo](https://simplememofast.com/)']:
            with self.subTest(heading=heading):
                result = probe.answer_metrics('Use Apple Notes.\n'+heading+'\n[シンプルメモ](https://simplememofast.com/)', True)
                self.assertFalse(result['mention'])
                self.assertTrue(result['own_site_citation'])

    def test_inline_product_label_is_prose(self):
        result = probe.answer_metrics('Try [Simple Memo](https://simplememofast.com/) for capture.', True)
        self.assertTrue(result['mention'])
        self.assertTrue(result['own_site_citation'])

    def test_identifiers_code_images_and_footnotes_are_not_prose_mentions(self):
        answers = [
            'https://simplememofast.com/', 'simplememofast.com', 'hello@simplememo.example',
            '`Simple Memo`', '```text\nSimple Memo\n```',
            '![Simple Memo](https://example.com/logo.png)',
            'An app.[^1]\n\n[^1]: Simple Memo\n    https://simplememofast.com/',
            'Use a [guide][one].\n[one]: https://simplememofast.com/ "Simple Memo"',
            '<script>Simple Memo</script><p>Use a note.</p>',
        ]
        for answer in answers:
            with self.subTest(answer=answer):
                self.assertFalse(probe.answer_metrics(answer, True)['mention'])

    def test_html_link_label_and_product_aliases(self):
        for answer in ['<p>Try <a href="https://example.com/">Simple Memo</a>.</p>', 'SimpleMemoFast is an app.', 'Obsidian連携シンプルメモを使う']:
            self.assertTrue(probe.answer_metrics(answer, True)['mention'])
        self.assertFalse(probe.answer_metrics('Simple Memories and Simple Memoir', True)['mention'])

    def test_html_source_section_stays_out_of_prose(self):
        result = probe.answer_metrics('<p>Use Apple Notes.</p><h2>Sources</h2><a href="https://simplememofast.com/">Simple Memo</a>', True)
        self.assertFalse(result['mention'])
        self.assertTrue(result['own_site_citation'])

    def test_code_and_images_do_not_become_citations(self):
        for answer in ['```text\nhttps://simplememofast.com/ Simple Memo\n```',
                       '`https://simplememofast.com/`',
                       '![Simple Memo](https://simplememofast.com/logo.png)',
                       '<img src="https://simplememofast.com/logo.png" alt="Simple Memo">']:
            result = probe.answer_metrics(answer, True)
            self.assertFalse(result['mention'])
            self.assertFalse(result['own_site_citation'])

    def test_citation_hosts_are_exact_and_urls_deduplicated(self):
        result = probe.answer_metrics('https://simplememofast.com.evil.example/ https://other.example/?next=https%3A%2F%2Fsimplememofast.com', True)
        self.assertFalse(result['own_site_citation'])
        result = probe.answer_metrics('https://www.simplememofast.com/a https://www.simplememofast.com/a', True)
        self.assertTrue(result['own_site_citation'])
        self.assertEqual(len(result['cited_urls']), 1)

    def test_unverified_is_missing_not_zero(self):
        result = probe.answer_metrics('Simple Memo https://simplememofast.com/', False)
        self.assertIsNone(result['mention'])
        self.assertIsNone(result['own_site_citation'])

    def report(self):
        return {'observed_at': '2026-09-06T06:37:34Z', 'total_cost_usd': 0.2,
                'observations': [
                    {'question_id':'Q1', 'status':'ok', 'answer':'Use Apple Notes.\nSources:\nhttps://simplememofast.com/'},
                    {'question_id':'Q2', 'status':'ok', 'answer':'Try シンプルメモ.', 'models':['model-version']},
                    {'question_id':'Q3', 'status':'unverified', 'answer':'Simple Memo'},
                    {'question_id':'Q5', 'status':'ok', 'answer':'Simple Memo https://simplememofast.com/'}]}

    def test_denominators_exclude_brand_prompt_and_unverified_answers(self):
        result = probe.recalculate_report(self.report())
        self.assertEqual(result['valid_questions'], 3)
        self.assertEqual(result['unaided_valid_questions'], 2)
        self.assertEqual(result['unaided_mention_rate'], 0.5)
        self.assertEqual(result['unaided_own_site_citation_rate'], 0.5)

    def test_reclassification_preserves_collection_raw_answers_models_and_cost(self):
        original = self.report()
        result = probe.recalculate_report(original)
        self.assertEqual(result['observed_at'], original['observed_at'])
        self.assertEqual(result['total_cost_usd'], original['total_cost_usd'])
        self.assertEqual([r['answer'] for r in result['observations']], [r['answer'] for r in original['observations']])
        self.assertEqual(result['observations'][1]['models'], original['observations'][1]['models'])
        self.assertEqual(probe.recalculate_report(result), result)
        self.assertNotIn('mention_metrics_version', original)

    def test_all_failed_questions_keep_missing_rates(self):
        original = self.report()
        for row in original['observations']: row['status']='unverified'
        result = probe.recalculate_report(original)
        self.assertIsNone(result['unaided_mention_rate'])
        self.assertIsNone(result['unaided_own_site_citation_rate'])

    def test_stale_or_inflated_report_is_rejected(self):
        with self.assertRaises(ValueError): probe.validate_report(self.report())
        updated = probe.recalculate_report(self.report())
        updated['unaided_mention_rate'] = 1.0
        with self.assertRaises(ValueError): probe.validate_report(updated)

    def test_saved_repository_report_matches_retained_answers(self):
        probe.validate_report(json.loads((probe.ROOT / 'data/ai-visibility-probe.json').read_text()))


if __name__ == '__main__':
    unittest.main()
