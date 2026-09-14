"""Offline metadata tests; no GitHub request, collector or scheduler is run."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('discovery', Path(__file__).with_name('company-discover.py'))
DISCOVERY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DISCOVERY)
REPO = 'simplememofast/simplememo'


def workflow(ident, cron=True, state='active'):
    return {'id': ident, 'name': 'Job ' + str(ident), 'path': '.github/workflows/job-' + str(ident) + '.yml',
            'state': state, 'cron_test': cron}


def observed(ident, job=10, outcome='success'):
    return {'id': ident, 'workflow_id': job, 'repository': {'full_name': REPO},
            'created_at': '2026-09-13T22:57:11Z', 'updated_at': '2026-09-13T22:57:41Z',
            'status': 'completed', 'conclusion': outcome, 'event': 'schedule', 'head_sha': 'a' * 40,
            'html_url': 'https://github.com/' + REPO + '/actions/runs/' + str(ident)}


class MetadataTests(unittest.TestCase):
    def collect(self, definitions, history, responses, cap=24):
        calls = []

        def run(args, cwd=None, **kwargs):
            calls.append(args)
            if args[:2] == ['git', 'fetch']:
                return ''
            if args[:2] == ['git', 'rev-parse']:
                return 'a' * 40
            if args[:2] == ['git', 'show']:
                w = next(w for w in definitions if args[2].endswith(':' + w['path']))
                return 'on:\n  schedule:\n    - cron: "0 21 * * *"\n' if w['cron_test'] else 'on:\n  workflow_dispatch:\n'
            self.assertEqual(args[:2], ['gh', 'api'])
            endpoint = args[2]
            main = endpoint.startswith('repos/' + REPO + '/')
            if '/actions/workflows?' in endpoint:
                return json.dumps({'total_count': len(definitions) if main else 0,
                                   'workflows': definitions if main else []})
            if '/actions/runs?' in endpoint:
                return json.dumps({'workflow_runs': history if main else []})
            ident = int(endpoint.split('/workflows/')[1].split('/')[0])
            self.assertTrue(endpoint.endswith('/runs?per_page=5'))
            response = responses[ident]
            if isinstance(response, Exception):
                raise response
            return json.dumps(response)

        with patch.object(DISCOVERY, 'run', run), patch.object(DISCOVERY, 'WORKFLOW_HISTORY_LIMIT', cap):
            result = DISCOVERY.github()
        return result, calls

    def test_busy_repository_retains_actual_daily_success(self):
        history = [observed(i, job=99) for i in range(100, 200)]
        result, calls = self.collect([workflow(10)], history, {10: {'workflow_runs': [observed(1)]}})
        row = result['workflows'][0]
        self.assertEqual(row['observed_runs'][0]['id'], 1)
        self.assertEqual(row['history_lookup']['state'], 'workflow_page')
        self.assertFalse(row['run_read_complete'])
        self.assertEqual(result['history_lookup_budget']['requests'], 1)
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / 'github.json').write_text(json.dumps(result))
            registry = DISCOVERY._inventory.build(folder)
            job = next(j for j in registry['jobs'] if j['id'] == 'github:simplememo:10')
            self.assertEqual(job['last_successful_run']['id'], 1)
            self.assertEqual(job['health']['state'], 'success')
            self.assertEqual(job['health']['business_success'], 'not_inferred')
        self.assertTrue(all(args[:2] != ['gh', 'workflow'] for args in calls))

    def test_no_duplicate_lookup_for_full_inactive_or_manual_history(self):
        definitions = [workflow(10), workflow(20, state='disabled_manually'), workflow(30, cron=False)]
        result, _ = self.collect(definitions, [observed(i) for i in range(1, 6)], {})
        self.assertEqual(result['history_lookup_budget']['requests'], 0)
        self.assertEqual(len(result['workflows'][0]['observed_runs']), 5)
        self.assertTrue(all(w['history_lookup']['state'] == 'repository_window' for w in result['workflows']))

    def test_partial_read_failure_and_global_cap_preserve_fallback_and_other_jobs(self):
        definitions = [workflow(10), workflow(20), workflow(30)]
        fallback = observed(1, outcome='failure')
        result, _ = self.collect(definitions, [fallback], {
            10: subprocess.CalledProcessError(1, 'gh'), 20: {'workflow_runs': [observed(2, job=20)]}}, cap=2)
        rows = result['workflows']
        self.assertEqual([w['history_lookup']['state'] for w in rows],
                         ['workflow_read_failed', 'workflow_page', 'request_cap_reached'])
        self.assertEqual(rows[0]['observed_runs'][0]['conclusion'], 'failure')
        self.assertEqual(rows[1]['observed_runs'][0]['conclusion'], 'success')
        self.assertEqual(result['history_lookup_budget'], {'limit': 2, 'requests': 2})
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / 'github.json').write_text(json.dumps(result))
            registry = DISCOVERY._inventory.build(folder)
            gaps = [g for g in registry['known_gaps'] if g['id'].startswith('github-history:')]
            self.assertEqual(len(gaps), 2)
            job = next(j for j in registry['jobs'] if j['id'] == 'github:simplememo:10')
            self.assertEqual(job['last_failure']['id'], 1)

    def test_wrong_owner_malformed_or_unbounded_pages_cannot_replace_observed_failure(self):
        responses = [None, {'workflow_runs': None}, {'workflow_runs': [observed(2, job=20)]},
                     {'workflow_runs': [{**observed(2), 'repository': {'full_name': 'other/repo'}}]},
                     {'workflow_runs': [observed(2), observed(2)]},
                     {'workflow_runs': [{**observed(2), 'created_at': None}]},
                     {'workflow_runs': [{**observed(2), 'updated_at': '2026-09-12T00:00:00Z'}]},
                     {'workflow_runs': [{**observed(2), 'status': 'in_progress'}]},
                     {'workflow_runs': [{**observed(2), 'head_sha': None}]},
                     {'workflow_runs': [observed(i) for i in range(2, 8)]}]
        for response in responses:
            with self.subTest(response=response):
                result, _ = self.collect([workflow(10)], [observed(1, outcome='failure')], {10: response})
                row = result['workflows'][0]
                self.assertEqual(row['history_lookup']['state'], 'workflow_read_failed')
                self.assertEqual(row['observed_runs'][0]['conclusion'], 'failure')

    def test_direct_rerun_metadata_replaces_same_id_without_duplicate_or_losing_other_rows(self):
        history = [observed(1, outcome='failure'), observed(2)]
        later = {**observed(1), 'updated_at': '2026-09-14T22:57:41Z'}
        result, _ = self.collect([workflow(10)], history, {10: {'workflow_runs': [later]}})
        rows = result['workflows'][0]['observed_runs']
        self.assertEqual(len(rows), 2)
        self.assertEqual(next(r for r in rows if r['id'] == 1)['conclusion'], 'success')

    def test_stale_conflicting_or_changed_identity_cannot_erase_newer_failure(self):
        fallback = {**observed(1, outcome='failure'), 'updated_at': '2026-09-14T22:57:41Z'}
        responses = [observed(1),
                     {**observed(1), 'updated_at': fallback['updated_at']},
                     {**observed(1), 'updated_at': '2026-09-15T22:57:41Z', 'head_sha': 'b' * 40},
                     {**observed(1), 'updated_at': '2026-09-15T22:57:41Z', 'event': 'push'},
                     {**observed(1), 'updated_at': '2026-09-15T22:57:41Z',
                      'created_at': '2026-09-14T22:57:11Z'}]
        for response in responses:
            with self.subTest(response=response):
                result, _ = self.collect([workflow(10)], [fallback],
                                         {10: {'workflow_runs': [observed(3), response]}})
                row = result['workflows'][0]
                self.assertEqual(row['history_lookup']['state'], 'workflow_read_failed')
                self.assertEqual(len(row['observed_runs']), 1)
                self.assertEqual(row['observed_runs'][0]['conclusion'], 'failure')
                self.assertEqual(row['observed_runs'][0]['updated_at'], fallback['updated_at'])

    def test_identical_same_time_observation_is_not_a_failure(self):
        fallback = observed(1, outcome='failure')
        result, _ = self.collect([workflow(10)], [fallback], {10: {'workflow_runs': [fallback]}})
        self.assertEqual(result['workflows'][0]['history_lookup']['state'], 'workflow_page')
        self.assertEqual(result['workflows'][0]['observed_runs'][0]['conclusion'], 'failure')


if __name__ == '__main__':
    unittest.main()
