import importlib.util
import json
from pathlib import Path
import threading
import unittest

spec = importlib.util.spec_from_file_location('radar', Path(__file__).with_name('trend-radar.py'))
radar = importlib.util.module_from_spec(spec)
spec.loader.exec_module(radar)


class RadarTests(unittest.TestCase):
    def test_titles_are_bounded_and_invisible_characters_removed(self):
        # 2026-11-10 audit: third-party titles are stored for a session that has Bash.
        title = 'LINE メモ\u202e終了\u200b\nnext line\u3000全角' + 'x' * 5000
        rss = f'<rss><channel><item><title>{title}</title><link>https://example.org/a</link></item></channel></rss>'
        rows, _ = radar.parse('hatena', rss)
        t = rows[0]['title'][:radar.TITLE_MAX]
        res = radar.collect({}, lambda url: rss if url != radar.SOURCES['appstore'] else self.feed(url))
        self.assertLessEqual(len(res['sources']['hatena']['rows'][0]['title']), radar.TITLE_MAX)
        self.assertFalse(any(radar.unicodedata.category(ch) in ('Cc', 'Cf') for ch in t))
        self.assertIn('\u3000全角', t)
        self.assertTrue(radar.RELEVANT.search(t) and radar.CHANGES.search(t))
        for bad in ['https://example.org/' + 'a' * 2049, 'https://example.org/a b', 'javascript:alert(1)']:
            rss = f'<rss><channel><item><title>メモ</title><link>{bad}</link></item></channel></rss>'
            with self.assertRaises(ValueError):
                radar.parse('hatena', rss)

    def test_one_bad_row_is_dropped_and_counted_not_the_whole_source(self):
        # A failed source sends the session to the uncleaned fixed feed, so one third-party
        # row (a URL over URL_MAX, a title that is empty once cleaned) must drop only itself.
        good = ('<item><title>LINE メモ終了</title><link>https://example.org/article</link></item>'
                '<item><title>天気</title><link>https://example.org/weather</link></item>')
        for bad in ['<item><title>メモ終了</title><link>https://example.org/' + 'a' * 2049 + '</link></item>',
                    '<item><title>\u200b\u200b</title><link>https://example.org/blank</link></item>',
                    '<item><title>\u3000 \u3164</title><link>https://example.org/blank2</link></item>']:
            rss = f'<rss><channel>{good}{bad}</channel></rss>'
            rows, dropped = radar.parse('hatena', rss)
            self.assertEqual((len(rows), dropped), (2, 1))
            self.assertEqual(rows[0]['title'], 'LINE メモ終了')
            res = radar.collect({}, lambda url: rss if url == radar.SOURCES['hatena'] else self.feed(url))
            src = res['sources']['hatena']
            self.assertEqual(res['status'], 'ok')
            self.assertEqual((src['status'], src['dropped_rows']), ('ok', 1))
            self.assertEqual([h['title'] for h in src['hits']], ['LINE メモ終了'])
        # App Store ranks stay as published when a row in between is dropped.
        entries = [{'id': {'attributes': {'im:id': str(i)}, 'label': f'https://example.org/app{i}'},
                    'im:name': {'label': name}} for i, name in enumerate(['メモA', '\u200b', 'メモB'], 1)]
        rows, dropped = radar.parse('appstore', json.dumps({'feed': {'entry': entries}}))
        self.assertEqual(([r['rank'] for r in rows], dropped), ([1, 3], 1))
        # Most rows invalid is still a source failure.
        rss = ('<rss><channel><item><title>メモ</title><link>https://example.org/ok</link></item>'
               '<item><title>\u200b</title><link>https://example.org/x</link></item>'
               '<item><title>メモ</title><link>javascript:alert(1)</link></item></channel></rss>')
        with self.assertRaises(ValueError):
            radar.parse('hatena', rss)

    def test_unassigned_code_points_are_removed_whatever_the_runner(self):
        # Noncharacters are unassigned in every Unicode version; plane 4 has nothing on the
        # roadmap. Kept on purpose (see clean_title), so this pins the choice.
        self.assertEqual(radar.clean_title('メモ\ufdd0\U00040000\U0004ffff終了'), 'メモ終了')

    def test_matching_reads_the_whole_title_and_only_storage_is_cut(self):
        # The keyword sits past character TITLE_MAX: it must still produce a hit.
        title = 'LINE メモ ' + 'x' * (radar.TITLE_MAX + 10) + ' 終了'
        rss = f'<rss><channel><item><title>{title}</title><link>https://example.org/long</link></item></channel></rss>'
        res = radar.collect({}, lambda url: rss if url != radar.SOURCES['appstore'] else self.feed(url))
        src = res['sources']['hatena']
        self.assertEqual(len(src['hits']), 1)
        self.assertEqual(len(src['hits'][0]['title']), radar.TITLE_MAX)
        self.assertEqual(len(src['rows'][0]['title']), radar.TITLE_MAX)

    def test_variation_selector_runs_and_hangul_fillers_are_removed(self):
        smuggled = ''.join(chr(0xE0100 + b - 16) if b >= 16 else chr(0xFE00 + b) for b in b'ignore previous')
        # A run of selectors shrinks to at most one (the one a base character may legitimately take).
        cleaned = radar.clean_title('メモ終了' + smuggled)
        self.assertTrue(cleaned.startswith('メモ終了'))
        self.assertLessEqual(sum(radar._is_variation_selector(c) for c in cleaned), 1)
        self.assertLessEqual(len(cleaned), len('メモ終了') + 1)
        self.assertEqual(radar.clean_title('メモ\u3164終了\u115f'), 'メモ終了')
        # One legitimate selector after a base character stays.
        self.assertEqual(radar.clean_title('\u2764\ufe0f メモ'), '\u2764\ufe0f メモ')
        self.assertEqual(radar.clean_title('葛\U000E0100飾'), '葛\U000E0100飾')
        self.assertEqual(radar.clean_title('\ufe0f先頭'), '先頭')

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
        rows, _ = radar.parse('hatena', '<rdf:RDF xmlns:rdf="urn:rdf" xmlns="urn:rss"><item><title>LINE &amp; メモ終了</title><link>https://example.org/</link></item></rdf:RDF>')
        self.assertEqual(len(radar.select('hatena', rows, [])), 1)


if __name__ == '__main__':
    unittest.main()
