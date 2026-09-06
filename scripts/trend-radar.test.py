import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('radar', Path(__file__).with_name('trend-radar.py'))
radar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(radar)


class RadarTests(unittest.TestCase):
    def test_first_ranking_is_not_new_entry(self):
        row = {'id': '1', 'title': 'メモ', 'rank': 3}
        self.assertEqual(radar.select('appstore', [row], []), [])
        self.assertEqual(len(radar.select('appstore', [row], [dict(row, rank=20)])), 1)
        self.assertEqual(radar.select('appstore', [row], [dict(row, rank=4)]), [])

    def test_failure_preserves_baseline_and_is_not_zero_hits(self):
        old = {'sources': {'google': {'rows': [{'id': 'old'}], 'last_success_at': 'yesterday'}}}
        def fail(url):
            raise TimeoutError()
        result = radar.collect(old, fail)
        self.assertEqual(result['status'], 'partial')
        self.assertIsNone(result['sources']['google']['hits'])
        self.assertEqual(result['sources']['google']['rows'], [{'id': 'old'}])

    def test_empty_feed_is_failure(self):
        with self.assertRaises(ValueError):
            radar.parse('google', '<rss><channel/></rss>')

    def test_rdf_namespace_and_escaped_title(self):
        rows = radar.parse('hatena', '<rdf:RDF xmlns:rdf="urn:rdf" xmlns="urn:rss"><item><title>LINE &amp; メモ終了</title><link>https://example.org/</link></item></rdf:RDF>')
        self.assertEqual(len(radar.select('hatena', rows, [])), 1)


if __name__ == '__main__':
    unittest.main()
