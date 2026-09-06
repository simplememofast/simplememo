import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('research', Path(__file__).with_name('radar-research.py'))
research = importlib.util.module_from_spec(spec)
spec.loader.exec_module(research)


class ResearchTests(unittest.TestCase):
    def test_parallel_failure_does_not_erase_previous_observation(self):
        previous = {'sources': {'google': {'rows': [{'id': 'old'}], 'last_success_at': 'old'}}}
        def fail(url):
            raise TimeoutError()
        output = research.parallel(previous, fail)
        self.assertEqual(output['status'], 'partial')
        self.assertIsNone(output['sources']['google']['hits'])
        self.assertEqual(output['sources']['google']['rows'], [{'id': 'old'}])
        self.assertEqual(research.semantic(output), research.semantic(research.radar.collect(previous, fail)))

    def test_failed_trial_cannot_support_hypothesis(self):
        def fail(url):
            raise TimeoutError()
        output = research.run(fail, repeats=2)
        self.assertEqual(output['result']['verdict'], 'inconclusive')
        self.assertFalse(output['result']['comparable'])


if __name__ == '__main__':
    unittest.main()
