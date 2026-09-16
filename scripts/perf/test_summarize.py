"""Synthetic failure-injection tests. No network, browser or analytics calls."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import summarize as audit

COMMIT = 'a' * 40


def report(group):
    url = ('http://127.0.0.1:8765' if group.startswith('local-') else audit.ORIGIN) + ('/en/' if group.endswith('-en') else '/')
    return {'lighthouseVersion': '12.8.2', 'requestedUrl': url, 'finalDisplayedUrl': url,
            'configSettings': {'formFactor': 'mobile', 'throttlingMethod': 'simulate',
                               'screenEmulation': {'disabled': False, 'mobile': True, 'width': 412, 'height': 823, 'deviceScaleFactor': 1.75},
                               'throttling': {'rttMs': 150, 'throughputKbps': 1638.4, 'cpuSlowdownMultiplier': 4},
                               'disableStorageReset': False, 'blockedUrlPatterns': None},
            'categories': {k: {'score': .95 if k == 'performance' else 1} for k in audit.CATEGORIES},
            'audits': {k: {'numericValue': v} for k, v in zip(audit.METRICS, (1700, 2400, 50, 0))}}


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for group in audit.GROUPS:
            for run in (1, 2, 3):
                self.write(f'{group}-{run}.report.json', report(group))
        self.receipt = {'verified': True, 'origin': audit.ORIGIN, 'commit': COMMIT,
                        'pages': {p: {'status': 200, 'matches_checkout': True} for p in ('index.html', 'en/index.html')},
                        'assets': {'asset.avif': {'status': 200, 'sha256': '0' * 64}}}
        self.write('production-deployment.json', self.receipt)

    def write(self, name, data):
        (self.root / name).write_text(json.dumps(data))

    def patch_run(self, group, edit, runs=(1, 2, 3)):
        for run in runs:
            r = report(group)
            edit(r)
            self.write(f'{group}-{run}.report.json', r)

    def test_all_four_groups_are_enforced(self):
        result = audit.summarize(self.root, require_production=True, expected_commit=COMMIT)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(set(result['enforced_groups']), set(audit.GROUPS))
        self.assertEqual(len(result['runs']), 12)

    def test_missing_any_report_fails(self):
        for name in sorted(audit.EXPECTED):
            with self.subTest(name=name):
                original = (self.root / name).read_text()
                (self.root / name).unlink()
                with self.assertRaises(ValueError): audit.summarize(self.root)
                (self.root / name).write_text(original)

    def test_extra_report_fails(self):
        self.write('local-ja-4.report.json', report('local-ja'))
        with self.assertRaises(ValueError): audit.summarize(self.root)

    def test_numeric_corruption_fails_closed(self):
        for value in (None, True, '95', float('nan'), float('inf'), -1):
            with self.subTest(value=value):
                self.patch_run('local-ja', lambda r: r['audits'][audit.METRICS[1]].update(numericValue=value), (1,))
                with self.assertRaises(ValueError): audit.summarize(self.root)

    def test_scores_are_validated_before_rounding(self):
        for value in (None, True, 1.1, float('nan')):
            with self.subTest(value=value):
                self.patch_run('local-ja', lambda r: r['categories']['performance'].update(score=value))
                with self.assertRaises(ValueError): audit.summarize(self.root)
        self.patch_run('local-ja', lambda r: r['categories']['performance'].update(score=.899))
        self.assertEqual(audit.summarize(self.root)['status'], 'failure')

    def test_runtime_error_fails(self):
        self.patch_run('production-en', lambda r: r.update(runtimeError={'code': 'NO_FCP'}), (1,))
        with self.assertRaises(ValueError): audit.summarize(self.root)

    def test_wrong_measurement_conditions_fail(self):
        mutations = [lambda r: r.update(lighthouseVersion='different'),
                     lambda r: r.update(requestedUrl='https://other.example/'),
                     lambda r: r.update(finalDisplayedUrl='https://preview.example/'),
                     lambda r: r['configSettings'].update(formFactor='desktop'),
                     lambda r: r['configSettings'].update(throttlingMethod='provided'),
                     lambda r: r['configSettings'].update(blockedUrlPatterns=['*analytics*']),
                     lambda r: r['configSettings'].update(disableStorageReset=True),
                     lambda r: r['configSettings']['screenEmulation'].update(disabled=True),
                     lambda r: r['configSettings']['throttling'].update(cpuSlowdownMultiplier=1)]
        for edit in mutations:
            with self.subTest(edit=edit):
                self.patch_run('production-en', edit, (1,))
                with self.assertRaises(ValueError): audit.summarize(self.root)

    def test_regressions_in_every_group_are_rejected(self):
        edits = [lambda r: r['categories']['performance'].update(score=.60),
                 lambda r: r['audits'][audit.METRICS[1]].update(numericValue=6000),
                 lambda r: r['audits'][audit.METRICS[2]].update(numericValue=500),
                 lambda r: r['audits'][audit.METRICS[3]].update(numericValue=.11)]
        edits += [lambda r, k=k: r['categories'][k].update(score=.99) for k in audit.CATEGORIES[1:]]
        for group in audit.GROUPS:
            for edit in edits:
                with self.subTest(group=group, edit=edit):
                    self.patch_run(group, edit)
                    self.assertEqual(audit.summarize(self.root)['status'], 'failure')
                    self.patch_run(group, lambda r: None)

    def test_single_layout_shift_is_not_hidden_by_median(self):
        self.patch_run('production-en', lambda r: r['audits'][audit.METRICS[3]].update(numericValue=.2), (3,))
        self.assertEqual(audit.summarize(self.root)['status'], 'failure')

    def test_unverified_pr_production_is_baseline_only(self):
        self.write('production-deployment.json', {'verified': False, 'error': 'previous revision'})
        self.patch_run('production-ja', lambda r: r['categories']['performance'].update(score=.60))
        result = audit.summarize(self.root)
        self.assertEqual(result['status'], 'success')
        self.assertEqual(result['enforced_groups'], ['local-ja', 'local-en'])
        self.assertIn('unverified baseline', audit.render(result))
        with self.assertRaises(ValueError): audit.summarize(self.root, require_production=True)

    def test_incomplete_receipts_and_wrong_commit_fail(self):
        for key in ('origin', 'commit', 'pages', 'assets', 'verified'):
            with self.subTest(key=key):
                receipt = copy.deepcopy(self.receipt)
                del receipt[key]
                self.write('production-deployment.json', receipt)
                with self.assertRaises(ValueError): audit.summarize(self.root)
        self.write('production-deployment.json', self.receipt)
        with self.assertRaises(ValueError): audit.summarize(self.root, expected_commit='b' * 40)

    def test_cli_retains_failure_artifacts_even_under_python_optimization(self):
        (self.root / 'local-en-2.report.json').unlink()
        env = {**os.environ, 'PERF_RESULTS': str(self.root), 'GITHUB_STEP_SUMMARY': str(self.root / 'step.md')}
        result = subprocess.run([sys.executable, '-O', audit.__file__], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads((self.root / 'summary.json').read_text())['status'], 'failure')
        self.assertIn('Missing', (self.root / 'step.md').read_text())

    def test_main_push_cannot_silently_ignore_unverified_production(self):
        self.write('production-deployment.json', {'verified': False})
        env = {**os.environ, 'PERF_RESULTS': str(self.root), 'GITHUB_EVENT_NAME': 'push', 'GITHUB_REF': 'refs/heads/main'}
        result = subprocess.run([sys.executable, audit.__file__], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)

    def test_import_has_no_side_effects(self):
        env = {k: v for k, v in os.environ.items() if k != 'PERF_RESULTS'}
        result = subprocess.run([sys.executable, '-c', 'import summarize'], cwd=Path(audit.__file__).parent, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
