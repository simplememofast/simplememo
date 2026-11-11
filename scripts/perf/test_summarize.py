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


def with_public_diagnostics(r):
    """Synthetic optional audit shapes, not a captured production trace."""
    r['audits'].update({
        'largest-contentful-paint-element': {'details': {'items': [{'type': 'table', 'items': [
            {'node': {'selector': 'main > section.hero > picture > img', 'snippet': '<img data-secret="PRIVATE_DOM">', 'nodeLabel': 'PRIVATE_TEXT'}}]}]}},
        'mainthread-work-breakdown': {'details': {'items': [
            {'group': 'scriptEvaluation', 'groupLabel': 'Script Evaluation', 'duration': 240},
            {'group': 'styleLayout', 'duration': 100}, {'group': 'other', 'duration': 0},
            {'group': 'parseHTML', 'duration': 20}, {'group': 'paintComposite', 'duration': 30}]}},
        'network-requests': {'details': {
            'headings': [{'key': key, 'valueType': 'ms'} for key in ('networkRequestTime', 'networkEndTime')],
            'items': [{'url': 'https://simplememofast.com/assets/hero.avif?token=PRIVATE_QUERY#PRIVATE_FRAGMENT',
                       'networkRequestTime': 200, 'networkEndTime': 800}]}},
        'bootup-time': {'details': {'items': [{'url': 'https://cdn.example/analytics.js?v=PRIVATE_VERSION', 'total': 120}]}},
        'render-blocking-insight': {'details': {'items': [{'type': 'table', 'items': [
            {'url': 'https://simplememofast.com/assets/style.css?v=PRIVATE_CSS', 'wastedMs': 150}]}]}},
        'long-tasks': {'details': {
            'headings': [{'key': 'url', 'valueType': 'url'}, {'key': 'startTime', 'valueType': 'ms'}, {'key': 'duration', 'valueType': 'ms'}],
            'items': [{'url': 'https://cdn.example/analytics.js?id=PRIVATE_ID', 'startTime': 2100.5, 'duration': 310},
                      {'url': 'Unattributable PRIVATE_NOTE', 'startTime': 900, 'duration': 414}]}},
        'third-party-summary': {'details': {
            'headings': [{'key': 'entity', 'valueType': 'text'}, {'key': 'blockingTime', 'valueType': 'ms'}],
            'items': [{'entity': 'Example Analytics', 'blockingTime': 120, 'mainThreadTime': 400,
                       'subItems': {'type': 'subitems', 'items': [{'url': 'https://cdn.example/analytics.js?id=PRIVATE_ID', 'blockingTime': 120}]}}]}},
    })
    return r


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

    def cli_env(self, **overrides):
        # Synthetic receipts and output files belong to this fixture, never to
        # the surrounding CI checkout/event or its real step-summary file.
        return {**os.environ, 'PERF_RESULTS': str(self.root),
                'PERF_EXPECTED_COMMIT': COMMIT, 'GITHUB_EVENT_NAME': 'pull_request',
                'GITHUB_REF': 'refs/pull/1/merge', 'GITHUB_STEP_SUMMARY': str(self.root / 'step.md'),
                **overrides}

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
        env = self.cli_env()
        result = subprocess.run([sys.executable, '-O', audit.__file__], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads((self.root / 'summary.json').read_text())['status'], 'failure')
        self.assertIn('Missing', (self.root / 'step.md').read_text())

    def test_main_push_cannot_silently_ignore_unverified_production(self):
        self.write('production-deployment.json', {'verified': False})
        env = self.cli_env(GITHUB_EVENT_NAME='push', GITHUB_REF='refs/heads/main')
        result = subprocess.run([sys.executable, audit.__file__], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)

    def test_import_has_no_side_effects(self):
        env = {k: v for k, v in os.environ.items() if k != 'PERF_RESULTS'}
        result = subprocess.run([sys.executable, '-c', 'import summarize'], cwd=Path(audit.__file__).parent, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, '')


    def test_variability_retains_outliers_without_relaxing_median_gates(self):
        for run, score, lcp in [(1, .77, 7000), (2, .93, 2500), (3, .95, 2000)]:
            r = report('production-ja')
            r['categories']['performance']['score'] = score
            r['audits'][audit.METRICS[1]]['numericValue'] = lcp
            self.write(f'production-ja-{run}.report.json', r)
        result = audit.summarize(self.root, require_production=True)
        spread = result['variability']['production-ja']
        self.assertEqual(result['status'], 'success')
        self.assertEqual(spread['performance'], {'count': 3, 'min': 77, 'median': 93, 'max': 95, 'range': 18, 'mad': 2})
        self.assertEqual(spread['runs_below_score_budget'], 1)
        self.assertEqual(spread['runs_above_lcp_budget'], 1)
        self.assertIn('77 / 93 / 95', audit.render(result))

    def test_distribution_rejects_invalid_samples(self):
        from variability import distribution
        for values in ([], [True], [None], ['90'], [-1], [float('nan')], [float('inf')]):
            with self.subTest(values=values), self.assertRaises(ValueError):
                distribution(values)
        self.assertEqual(distribution([5])['mad'], 0)
        self.assertEqual(distribution([1, 2, 3, 4])['median'], 2.5)

    def test_missing_trace_diagnostics_are_unknown_not_zero(self):
        result = audit.summarize(self.root)
        for row in result['runs']:
            trace = row['trace_diagnostics']
            self.assertIsNone(trace['observed_lcp_ms'])
            self.assertTrue(all(v is None for v in trace['lcp_parts_ms'].values()))
            self.assertTrue(trace['unavailable'])

    def test_observed_trace_is_separate_from_simulated_mobile(self):
        r = report('local-ja')
        r['audits']['metrics'] = {'details': {'items': [{'observedLargestContentfulPaint': 400, 'observedFirstContentfulPaint': 300}]}}
        parts = [{'subpart': k, 'duration': v} for k, v in zip(('timeToFirstByte', 'resourceLoadDelay', 'resourceLoadDuration', 'elementRenderDelay'), (100, 20, 30, 250))]
        r['audits']['lcp-breakdown-insight'] = {'details': {'items': [{'items': parts}]}}
        self.write('local-ja-1.report.json', r)
        row = audit.read_run(self.root / 'local-ja-1.report.json')
        self.assertEqual(row['trace_diagnostics']['observed_lcp_ms'], 400)
        self.assertEqual(row['trace_diagnostics']['lcp_parts_ms']['elementRenderDelay'], 250)
        self.assertEqual(row['metrics']['largest-contentful-paint'], 2400)
        self.assertEqual(row['trace_diagnostics']['unavailable'], [])

    def test_malformed_optional_trace_never_becomes_false_precision(self):
        from variability import diagnostics
        for parts in (None, {}, [None], [{'subpart': 'timeToFirstByte', 'duration': float('nan')}], [{'subpart': 'timeToFirstByte', 'duration': 1}] * 2):
            with self.subTest(parts=parts):
                r = report('local-ja')
                r['audits']['metrics'] = {'details': {'items': [None]}}
                r['audits']['lcp-breakdown-insight'] = {'details': {'items': [{'items': parts}]}}
                trace = diagnostics(r)
                self.assertIsNone(trace['observed_lcp_ms'])
                self.assertIsNone(trace['lcp_parts_ms']['timeToFirstByte'])
                json.dumps(trace, allow_nan=False)

    def test_unverified_baseline_variability_is_still_reported(self):
        self.write('production-deployment.json', {'verified': False})
        result = audit.summarize(self.root)
        self.assertEqual(set(result['variability']), set(audit.GROUPS))
        self.assertEqual(result['enforced_groups'], ['local-ja', 'local-en'])

    def test_public_audit_diagnostics_are_bounded_and_keep_units_distinct(self):
        evidence = audit.public_diagnostics(with_public_diagnostics(report('local-ja')))
        self.assertEqual(evidence['lcp_selector'], 'main > section.hero > picture > img')
        self.assertEqual(evidence['main_thread'], [
            {'group': 'Script Evaluation', 'duration_ms': 240},
            {'group': 'styleLayout', 'duration_ms': 100}, {'group': 'paintComposite', 'duration_ms': 30}])
        self.assertEqual(evidence['omitted']['main_thread'], 2)
        self.assertEqual(evidence['resources'], [{'url': 'https://simplememofast.com/assets/hero.avif', 'duration_ms': 600}])
        self.assertEqual(evidence['bootup'], [{'url': 'https://cdn.example/analytics.js', 'total_ms': 120}])
        self.assertEqual(evidence['render_blocking'], [{'url': 'https://simplememofast.com/assets/style.css', 'estimated_savings_ms': 150}])
        self.assertEqual(evidence['long_tasks'], [
            {'url': audit.UNATTRIBUTED, 'start_ms': 900, 'duration_ms': 414},
            {'url': 'https://cdn.example/analytics.js', 'start_ms': 2100.5, 'duration_ms': 310}])
        self.assertEqual(evidence['third_party_blocking'], [{'group': 'Example Analytics', 'blocking_ms': 120}])
        self.assertEqual(evidence['unavailable'], [])
        self.assertNotIn('PRIVATE_', json.dumps(evidence))

    def test_optional_diagnostics_cannot_change_existing_budget_results(self):
        for verified in (True, False):
            for score in (.95, .60):
                with self.subTest(verified=verified, score=score):
                    self.write('production-deployment.json', self.receipt if verified else {'verified': False})
                    self.patch_run('production-ja', lambda r: r['categories']['performance'].update(score=score))
                    before = audit.summarize(self.root)
                    for name in audit.EXPECTED:
                        self.write(name, with_public_diagnostics(json.loads((self.root / name).read_text())))
                    after = audit.summarize(self.root)
                    for key in ('status', 'failures', 'medians', 'enforced_groups', 'production_verified', 'variability'):
                        self.assertEqual(after[key], before[key])
                    text = audit.render(after)
                    self.assertIn('estimated savings (ms)', text)
                    self.assertIn('not simulated mobile timings', text)
                    self.assertNotIn('PRIVATE_', text)

    def test_optional_missing_or_malformed_diagnostics_are_unavailable(self):
        optional_keys = ('largest-contentful-paint-element', 'lcp-breakdown-insight', 'mainthread-work-breakdown',
                         'network-requests', 'bootup-time', 'render-blocking-insight', 'render-blocking-resources',
                         'long-tasks', 'third-party-summary')
        for value in (None, [], 'unexpected', {}, {'details': None}, {'details': {'items': {}}},
                      {'details': {'items': [None, [], {'items': None}]}}):
            with self.subTest(value=value):
                r = report('local-ja')
                r['audits'].update({key: value for key in optional_keys})
                evidence = audit.public_diagnostics(r)
                self.assertEqual(set(evidence['unavailable']), {'lcp_selector', 'main_thread', 'resources', 'bootup', 'render_blocking',
                                                                'long_tasks', 'third_party_blocking'})
                self.assertEqual(evidence['long_tasks'], [])
                self.assertEqual(evidence['third_party_blocking'], [])
                self.assertIsNone(evidence['lcp_selector'])
                self.assertEqual(evidence['resources'], [])
                json.dumps(evidence, allow_nan=False)

    def test_optional_durations_reject_invalid_values_and_preserve_real_zero(self):
        for value in (None, True, '0', float('nan'), float('inf'), -1, 10 ** 1000):
            with self.subTest(value=value):
                r = report('local-ja')
                r['audits']['mainthread-work-breakdown'] = {'details': {'items': [{'group': 'other', 'duration': value}]}}
                r['audits']['bootup-time'] = {'details': {'items': [{'url': 'https://cdn.example/a.js', 'total': value}]}}
                r['audits']['render-blocking-resources'] = {'details': {'items': [{'url': 'https://cdn.example/a.css', 'wastedMs': value}]}}
                result = audit.public_diagnostics(r)
                self.assertEqual(result['main_thread'], [])
                self.assertEqual(result['bootup'], [])
                self.assertEqual(result['render_blocking'], [])
        r['audits']['mainthread-work-breakdown']['details']['items'][0]['duration'] = 0
        self.assertEqual(audit.public_diagnostics(r)['main_thread'], [{'group': 'other', 'duration_ms': 0}])

    def test_network_timings_require_declared_millisecond_units(self):
        r = with_public_diagnostics(report('local-ja'))
        network = r['audits']['network-requests']['details']
        for headings in (None, {}, [], [{'key': 'networkRequestTime', 'valueType': 'ms'}],
                         [{'key': k, 'valueType': 'seconds'} for k in ('networkRequestTime', 'networkEndTime')],
                         [{'key': 'networkRequestTime', 'valueType': 'seconds'}, {'key': 'networkRequestTime', 'valueType': 'ms'}, {'key': 'networkEndTime', 'valueType': 'ms'}],
                         [{'key': 'networkRequestTime', 'valueType': 'ms'}, {'key': 'networkRequestTime', 'valueType': 'seconds'}, {'key': 'networkEndTime', 'valueType': 'ms'}]):
            with self.subTest(headings=headings):
                network['headings'] = headings
                self.assertEqual(audit.public_diagnostics(r)['resources'], [])
        network['headings'] = [{'key': k, 'valueType': 'ms'} for k in ('networkRequestTime', 'networkEndTime')]
        network['items'][0]['networkEndTime'] = 100
        self.assertEqual(audit.public_diagnostics(r)['resources'], [])
        network['items'][0]['networkEndTime'] = 200
        self.assertEqual(audit.public_diagnostics(r)['resources'][0]['duration_ms'], 0)

    def test_diagnostics_strip_private_components_and_escape_output(self):
        r = with_public_diagnostics(report('local-ja'))
        urls = ('data:text/html,PRIVATE_DATA', 'javascript:PRIVATE_JS', '/relative',
                'https://user:PRIVATE_PASSWORD@example.com/a.js', 'https://example.com:bad/a.js',
                'https://example.com:99999/a.js', 'https://[invalid/a.js',
                'https://example.com/a.js\n::error::PRIVATE_COMMAND', 'https://example.com/' + 'a' * 500)
        r['audits']['bootup-time']['details']['items'] = [{'url': url, 'total': 1} for url in urls]
        self.assertEqual(audit.public_diagnostics(r)['bootup'], [])
        for selector in ('[data-token="PRIVATE_SELECTOR"]', '<img>PRIVATE_HTML', 'a\n::error::PRIVATE_COMMAND', 'a' * 161, '   '):
            r['audits']['largest-contentful-paint-element']['details']['items'][0]['items'][0]['node']['selector'] = selector
            self.assertIsNone(audit.public_diagnostics(r)['lcp_selector'])
        r['audits']['mainthread-work-breakdown']['details']['items'] = [
            {'groupLabel': '<script>`|\n::error::injected', 'duration': 1}]
        self.write('local-ja-1.report.json', r)
        text = audit.render(audit.summarize(self.root))
        self.assertNotIn('PRIVATE_', text)
        self.assertNotIn('<script>', text)
        self.assertNotIn('\n::error::', text)
        self.assertIn('&lt;script&gt;&#96;&#124;', text)

    def test_diagnostic_traversal_and_labels_are_bounded(self):
        r = report('local-ja')
        r['audits']['mainthread-work-breakdown'] = {'details': {'items': [
            {'group': 'x' * 500, 'duration': i} for i in range(audit.DIAGNOSTIC_SCAN_LIMIT + 5)]}}
        evidence = audit.public_diagnostics(r)
        self.assertEqual(len(evidence['main_thread']), 3)
        self.assertEqual(evidence['main_thread'][0]['duration_ms'], audit.DIAGNOSTIC_SCAN_LIMIT - 2)
        self.assertTrue(all(len(item['group']) <= 80 for item in evidence['main_thread']))
        self.assertEqual(evidence['truncated_audits'], ['mainthread-work-breakdown'])
        nested = {'node': {'selector': 'main > img'}}
        for _ in range(10):
            nested = {'items': [nested]}
        r['audits']['largest-contentful-paint-element'] = {'details': nested}
        self.assertIsNone(audit.public_diagnostics(r)['lcp_selector'])

    def test_cli_emits_diagnostics_for_every_run_and_retains_failure(self):
        self.patch_run('production-ja', lambda r: r['audits'][audit.METRICS[2]].update(numericValue=240))
        for name in audit.EXPECTED:
            self.write(name, with_public_diagnostics(json.loads((self.root / name).read_text())))
        env = self.cli_env()
        result = subprocess.run([sys.executable, '-O', audit.__file__], env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        saved = json.loads((self.root / 'summary.json').read_text())
        self.assertEqual(saved['failures'], ['production-ja: median TBT exceeds 200 ms'])
        self.assertEqual(len(saved['runs']), 12)
        self.assertEqual(result.stdout, (self.root / 'summary.md').read_text() + '\n')
        self.assertEqual((self.root / 'step.md').read_text(), (self.root / 'summary.md').read_text())
        for value in (result.stdout, json.dumps(saved)):
            self.assertNotIn('PRIVATE_', value)
        self.write('production-deployment.json', {'verified': False})
        summary = audit.summarize(self.root)
        self.assertEqual(summary['status'], 'success')
        self.assertEqual(summary['enforced_groups'], ['local-ja', 'local-en'])
        self.assertEqual(len(summary['runs']), 12)
        self.assertIn('production-ja-1.report.json: LCP selector', audit.render(summary))

    def test_long_tasks_name_what_blocks_and_when(self):
        # [2026-11-11] TBT is the sum over long tasks, and the summary named none of them.
        r = report('production-en')
        r['audits']['long-tasks'] = {'details': {
            'headings': [{'key': 'url', 'valueType': 'url'}, {'key': 'startTime', 'valueType': 'ms'}, {'key': 'duration', 'valueType': 'ms'}],
            'items': [{'url': f'https://simplememofast.com/js/task-{i}.js?v=PRIVATE_{i}', 'startTime': 1000 + i, 'duration': 60 + i} for i in range(8)]
                     + [{'url': 'Unattributable', 'startTime': 869, 'duration': 414},
                        {'url': 'https://www.googletagmanager.com/gtag/js?id=PRIVATE_ID', 'startTime': 2500, 'duration': 300},
                        {'url': 'https://simplememofast.com/js/ignored.js', 'startTime': None, 'duration': 999},
                        {'url': 'https://simplememofast.com/js/ignored.js', 'startTime': 10, 'duration': float('nan')},
                        {'startTime': 10, 'duration': 998}]}}
        evidence = audit.public_diagnostics(r)
        # Largest first, five rows, the rest counted; a row with no attribution field or no timing is not a row.
        self.assertEqual([(row['url'], row['start_ms'], row['duration_ms']) for row in evidence['long_tasks']], [
            (audit.UNATTRIBUTED, 869, 414), ('https://www.googletagmanager.com/gtag/js', 2500, 300),
            ('https://simplememofast.com/js/task-7.js', 1007, 67), ('https://simplememofast.com/js/task-6.js', 1006, 66),
            ('https://simplememofast.com/js/task-5.js', 1005, 65)])
        self.assertEqual(evidence['omitted']['long_tasks'], 5)
        self.assertNotIn('PRIVATE_', json.dumps(evidence))
        self.write('production-en-1.report.json', r)
        text = audit.render(audit.summarize(self.root))
        self.assertIn('Long tasks (ms, simulated start+duration): `unattributed` 869.0+414.0; '
                      '`https://www.googletagmanager.com/gtag/js` 2500.0+300.0;', text)
        self.assertIn('; 5 more valid entries omitted', text)
        # The other eleven reports have no table: say so, never print an empty list as "none".
        self.assertEqual(text.count('Long tasks (ms, simulated start+duration): unavailable'), 11)

    def test_long_tasks_never_change_a_budget_result(self):
        # Report-only. A page full of long tasks passes or fails on the TBT number alone.
        clean = audit.summarize(self.root, require_production=True, expected_commit=COMMIT)
        def heavy(r):
            r['audits']['long-tasks'] = {'details': {
                'headings': [{'key': 'startTime', 'valueType': 'ms'}, {'key': 'duration', 'valueType': 'ms'}],
                'items': [{'url': 'https://simplememofast.com/', 'startTime': 2000, 'duration': 5000}]}}
            r['audits']['third-party-summary'] = {'details': {
                'headings': [{'key': 'blockingTime', 'valueType': 'ms'}], 'items': [{'entity': 'Heavy', 'blockingTime': 5000}]}}
        for group in audit.GROUPS:
            self.patch_run(group, heavy)
        noisy = audit.summarize(self.root, require_production=True, expected_commit=COMMIT)
        self.assertEqual(noisy['failures'], clean['failures'])
        self.assertEqual(noisy['failures'], [])
        self.assertEqual(noisy['runs'][0]['public_diagnostics']['long_tasks'][0]['duration_ms'], 5000)

    def test_long_task_and_third_party_tables_require_declared_millisecond_units(self):
        items = [{'url': 'https://simplememofast.com/', 'startTime': 2, 'duration': 3}]
        blocking = [{'entity': 'Example', 'blockingTime': 3}]
        for headings in ([], None, 'ms', [{'key': 'startTime', 'valueType': 'ms'}],
                         [{'key': 'startTime', 'valueType': 'ms'}, {'key': 'duration', 'valueType': 'timespanMs'}],
                         [{'key': 'startTime', 'valueType': 'ms'}, {'key': 'duration', 'valueType': 'ms'}, {'key': 'duration', 'valueType': 'ms'}]):
            with self.subTest(headings=headings):
                r = report('local-ja')
                r['audits']['long-tasks'] = {'details': {'headings': headings, 'items': items}}
                r['audits']['third-party-summary'] = {'details': {'headings': headings, 'items': blocking}}
                evidence = audit.public_diagnostics(r)
                self.assertEqual(evidence['long_tasks'], [])
                self.assertEqual(evidence['third_party_blocking'], [])
                self.assertIn('long_tasks', evidence['unavailable'])
                self.assertIn('third_party_blocking', evidence['unavailable'])

    def test_third_party_names_are_bounded_escaped_and_keep_a_real_zero(self):
        r = report('local-ja')
        r['audits']['third-party-summary'] = {'details': {
            'headings': [{'key': 'entity', 'valueType': 'text'}, {'key': 'blockingTime', 'valueType': 'ms'}],
            'items': [{'entity': {'text': '<b>`|\n::error::injected ' + 'x' * 200, 'url': 'https://example.com/?q=PRIVATE_Q'}, 'blockingTime': 7},
                      {'entity': 'ahrefs.com', 'blockingTime': 0}, {'entity': '   ', 'blockingTime': 9},
                      {'entity': 5, 'blockingTime': 9}, {'entity': 'no time', 'blockingTime': '9'}]}}
        evidence = audit.public_diagnostics(r)
        self.assertEqual([row['blocking_ms'] for row in evidence['third_party_blocking']], [7, 0])
        self.assertTrue(all(len(row['group']) <= 40 for row in evidence['third_party_blocking']))
        self.write('local-ja-1.report.json', r)
        text = audit.render(audit.summarize(self.root))
        self.assertNotIn('PRIVATE_', text)
        self.assertNotIn('<b>', text)
        self.assertNotIn('\n::error::', text)
        self.assertIn('Third-party blocking time (ms): `&lt;b&gt;&#96;&#124; ::error::injected', text)
        self.assertIn('`ahrefs.com` 0.0', text)

    def test_measuring_machine_is_reported_without_changing_budget_results(self):
        before = audit.summarize(self.root)
        slow = 'The tested device appears to have a slower CPU than  Lighthouse expects. PRIVATE_WARNING_TAIL'
        self.patch_run('production-en', lambda r: r.update(
            environment={'benchmarkIndex': 742, 'hostUserAgent': 'PRIVATE_UA'}, runWarnings=[slow]))
        self.patch_run('production-ja', lambda r: r.update(environment={'benchmarkIndex': 1812.4}, runWarnings=[]))
        self.patch_run('local-en', lambda r: r.update(environment={'benchmarkIndex': 1500}, runWarnings=['PRIVATE_OTHER']), runs=(2,))
        after = audit.summarize(self.root)
        for key in ('status', 'failures', 'medians', 'enforced_groups', 'production_verified', 'variability'):
            self.assertEqual(after[key], before[key])
        host = {row['file']: row['host'] for row in after['runs']}
        self.assertEqual(host['production-en-1.report.json'],
                         {'benchmark_index': 742, 'run_warnings': 1, 'slow_host_warning': True})
        self.assertEqual(host['production-ja-3.report.json'],
                         {'benchmark_index': 1812.4, 'run_warnings': 0, 'slow_host_warning': False})
        self.assertEqual(host['local-ja-1.report.json'],
                         {'benchmark_index': None, 'run_warnings': None, 'slow_host_warning': None})
        text = audit.render(after)
        self.assertIn('never used for a budget result', text)
        self.assertIn('- production-en: benchmarkIndex 742, 742, 742; median 742; slow-host warning in 3 of 3 runs', text)
        self.assertIn('- production-ja: benchmarkIndex 1812, 1812, 1812; median 1812; slow-host warning in 0 of 3 runs', text)
        # A partly observed group shows what is missing and no median of an incomplete sample.
        self.assertIn('- local-en: benchmarkIndex unavailable, 1500, unavailable; slow-host warning unavailable', text)
        self.assertIn('- local-ja: benchmarkIndex unavailable, unavailable, unavailable; slow-host warning unavailable', text)
        # Warning text and the host user agent are never copied into the rendered summary.
        self.assertNotIn('PRIVATE_', text)

    def test_missing_or_malformed_machine_evidence_is_unknown_not_zero(self):
        edits = [lambda r: r.update(environment=None), lambda r: r.update(environment='fast'),
                 lambda r: r.update(environment={'benchmarkIndex': 'fast'}),
                 lambda r: r.update(environment={'benchmarkIndex': True}),
                 lambda r: r.update(environment={'benchmarkIndex': 0}),
                 lambda r: r.update(environment={'benchmarkIndex': -5}),
                 lambda r: r.update(environment={'benchmarkIndex': float('inf')}),
                 lambda r: r.update(environment={'benchmarkIndex': 1200}, runWarnings='slower CPU'),
                 lambda r: r.update(environment={'benchmarkIndex': 1200}, runWarnings=[1, None])]
        for index, edit in enumerate(edits):
            with self.subTest(case=index):
                self.patch_run('local-ja', edit)
                summary = audit.summarize(self.root)
                self.assertEqual(summary['status'], 'success')
                host = [row['host'] for row in summary['runs'] if row['group'] == 'local-ja']
                if index < 7:
                    self.assertTrue(all(h['benchmark_index'] is None for h in host))
                    self.assertIn('- local-ja: benchmarkIndex unavailable, unavailable, unavailable', audit.render(summary))
                else:
                    self.assertTrue(all(h == {'benchmark_index': 1200, 'run_warnings': None, 'slow_host_warning': None} for h in host))
                    self.assertIn('- local-ja: benchmarkIndex 1200, 1200, 1200; median 1200; slow-host warning unavailable',
                                  audit.render(summary))

    def test_a_slow_measuring_machine_never_excuses_a_budget_failure(self):
        slow = 'The tested device appears to have a slower CPU than  Lighthouse expects.'

        def edit(r):
            r['audits'][audit.METRICS[2]]['numericValue'] = 250
            r.update(environment={'benchmarkIndex': 480}, runWarnings=[slow])
        self.patch_run('production-en', edit)
        summary = audit.summarize(self.root)
        self.assertEqual(summary['status'], 'failure')
        self.assertIn('production-en: median TBT exceeds 200 ms', summary['failures'])
        text = audit.render(summary)
        self.assertIn('- production-en: benchmarkIndex 480, 480, 480; median 480; slow-host warning in 3 of 3 runs', text)
        self.assertIn('production-en: median TBT exceeds 200 ms', text)

    def test_only_the_known_slow_host_warning_is_counted(self):
        self.patch_run('production-ja', lambda r: r.update(
            environment={'benchmarkIndex': 900}, runWarnings=['Some other warning about CPU usage']))
        text = audit.render(audit.summarize(self.root))
        self.assertIn('- production-ja: benchmarkIndex 900, 900, 900; median 900; slow-host warning in 0 of 3 runs', text)


if __name__ == '__main__':
    unittest.main()
