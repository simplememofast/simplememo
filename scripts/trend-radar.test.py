import importlib.util
import json
from pathlib import Path
import threading
import unittest

spec = importlib.util.spec_from_file_location('radar', Path(__file__).with_name('trend-radar.py'))
radar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(radar)


class RadarTests(unittest.TestCase):
    @staticmethod
    def feed(url):
        if url == radar.SOURCES['appstore']:
            return json.dumps({'feed': {'entry': [{'id': {'attributes': {'im:id': '1'}, 'label': 'https://example.org/app'}, 'im:name': {'label': 'メモ'}}]}})
        return '<rss><channel><item><title>LINE メモ終了</title><link>https://example.org/article</link></item></channel></rss>'

    def test_parallel_requests_each_fixed_source_once_and_preserves_semantics(self):
        # A barrier verifies overlap without asserting a network speedup.
        barrier = threading.Barrier(3, timeout=3)
        calls = []
        lock = threading.Lock()
        def fetch(url):
            with lock:
                calls.append(url)
            barrier.wait()
            return self.feed(url)
        prior = {'sources': {'appstore': {'rows': [{'id': '1', 'rank': 30}], 'last_success_at': 'old'}}}
        parallel = radar.collect_parallel(prior, fetch)
        sequential = radar.collect(prior, self.feed)
        self.assertCountEqual(calls, list(radar.SOURCES.values()))
        self.assertEqual(parallel['status'], 'ok')
        self.assertEqual(list(parallel['sources']), list(radar.SOURCES))
        for name in radar.SOURCES:
            for key in ['status', 'rows', 'hits', 'baseline', 'comparison_at']:
                self.assertEqual(parallel['sources'][name][key], sequential['sources'][name][key])

    def test_one_parallel_failure_preserves_only_its_baseline(self):
        prior = {'sources': {'google': {'rows': [{'id': 'old'}], 'last_success_at': 'old'}}}
        def fetch(url):
            if url == radar.SOURCES['google']:
                raise TimeoutError()
            return self.feed(url)
        output = radar.collect_parallel(prior, fetch)
        self.assertEqual(output['status'], 'partial')
        self.assertIsNone(output['sources']['google']['hits'])
        self.assertEqual(output['sources']['google']['rows'], [{'id': 'old'}])
        self.assertEqual(output['sources']['google']['last_success_at'], 'old')
        self.assertEqual(output['sources']['hatena']['status'], 'ok')
        self.assertEqual(output['sources']['appstore']['status'], 'ok')

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
