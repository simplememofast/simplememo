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


if __name__ == '__main__':
    unittest.main()
