import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('codex-ai-visibility-probe.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class CodexProbeTests(unittest.TestCase):
    def events(self, ident=1):
        return [
            {'type': 'thread.started', 'thread_id': f'00000000-0000-4000-8000-{ident:012d}'},
            {'type': 'turn.started'},
            {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'Searching first.'}},
            {'type': 'item.started', 'item': {'id': 's1', 'type': 'web_search', 'action': {'type': 'other'}}},
            {'type': 'item.completed', 'item': {'id': 's1', 'type': 'web_search', 'action': {'type': 'search', 'query': 'note app'}}},
            {'type': 'item.completed', 'item': {'type': 'agent_message', 'text': 'Use Apple Notes.\nSources:\nhttps://simplememofast.com/'}},
            {'type': 'turn.completed', 'usage': {'input_tokens': 50, 'output_tokens': 20}},
        ]

    def summary(self, events=None, code=0):
        return probe.summarize('\n'.join(json.dumps(e) for e in (events or self.events())), code)

    def report(self):
        rows = [{'question_id': f'Q{i}', 'question': q, **self.summary(self.events(i))}
                for i, q in enumerate(probe.legacy.QUESTIONS, 1)]
        return probe.build_report(rows, '00000000-0000-4000-8000-000000000099', probe.now(), 'codex-cli fixture')

    def test_completed_search_and_final_answer_are_required(self):
        result = self.summary()
        self.assertEqual(result['status'], 'ok')
        self.assertTrue(result['answer'].startswith('Use Apple'))
        self.assertEqual(result['verified_search_calls'], 1)
        self.assertFalse(result['mention'])
        self.assertTrue(result['own_site_citation'])
        self.assertIsNone(result['cost_usd'])

    def test_url_or_search_start_alone_does_not_prove_search(self):
        for drop in [3, 4]:
            events = self.events(); events.pop(drop)
            result = self.summary(events)
            self.assertEqual(result['status'], 'unverified')
            self.assertIsNone(result['mention'])

    def test_open_page_is_not_search(self):
        events = self.events(); events[4]['item']['action']['type'] = 'open_page'
        self.assertEqual(self.summary(events)['status'], 'unverified')

    def test_failed_search_item_is_not_verified(self):
        for fields in [{'status': 'failed'}, {'is_error': True}, {'error': 'unavailable'}]:
            events = self.events(); events[4]['item'].update(fields)
            self.assertEqual(self.summary(events)['status'], 'unverified')

    def test_process_turn_or_stream_failure_is_not_success(self):
        self.assertEqual(self.summary(code=1)['status'], 'unverified')
        for event in [{'type': 'turn.failed'}, {'type': 'error'}]:
            self.assertEqual(self.summary(self.events() + [event])['status'], 'unverified')
        self.assertEqual(self.summary(self.events()[:-1])['status'], 'unverified')
        self.assertEqual(self.summary(self.events() + [{'type': 'turn.completed'}])['status'], 'unverified')

    def test_context_contamination_is_rejected(self):
        for kind in ['command_execution', 'mcp_tool_call', 'file_change']:
            result = self.summary(self.events() + [{'type': 'item.completed', 'item': {'type': kind}}])
            self.assertEqual(result['error'], 'unexpected_tools')

    def test_duplicate_search_completion_is_counted_once(self):
        events = self.events(); events.insert(5, copy.deepcopy(events[4]))
        self.assertEqual(self.summary(events)['verified_search_calls'], 1)

    def test_report_shape_and_independence(self):
        report = self.report(); probe.validate_report(report, healthy=True)
        for change in [
            lambda d: d.update(series='claude-sonnet-web-v1'),
            lambda d: d.update(total_cost_usd=0),
            lambda d: d['protocol'].update(repository_context=True),
            lambda d: d['observations'][1].update(thread_id=d['observations'][0]['thread_id']),
            lambda d: d['observations'][0].update(verified_search_calls=0),
            lambda d: d['observations'][0].update(turn_completed=False),
            lambda d: d['observations'][0].update(question='brand seeded question'),
            lambda d: d['observations'].pop(),
        ]:
            broken = copy.deepcopy(report); change(broken)
            with self.assertRaises(ValueError): probe.validate_report(broken)

    def test_partial_and_stale_are_unhealthy_without_reclassifying_history(self):
        report = self.report()
        report['observations'][0]['status'] = 'unverified'
        report['status'] = 'partial'
        report = probe.legacy.recalculate_report(report)
        probe.validate_report(report)
        with self.assertRaises(ValueError): probe.validate_report(report, healthy=True)
        report = self.report(); stamp = dt.datetime.fromisoformat(report['observed_at'])
        for at in [stamp - dt.timedelta(seconds=1), stamp + dt.timedelta(days=8, seconds=1)]:
            with self.assertRaises(ValueError): probe.validate_report(report, healthy=True, at=at)

    def test_branded_question_is_excluded(self):
        report = self.report(); report['observations'][-1]['answer'] = 'Simple Memo'
        report = probe.legacy.recalculate_report(report)
        self.assertTrue(report['observations'][-1]['mention'])
        self.assertEqual(report['unaided_mention_rate'], 0)
        self.assertEqual(report['unaided_valid_questions'], 4)

    def test_neutral_command_and_api_key_boundary(self):
        args = probe.command()
        for flag in ['--ignore-user-config', '--ephemeral', 'read-only', 'project_doc_max_bytes=0']:
            self.assertIn(flag, args)
        for feature in probe.DISABLED: self.assertIn(feature, args)
        with patch.dict(probe.os.environ, {'CODEX_API_KEY': 'test-only'}):
            with self.assertRaisesRegex(ValueError, 'API-key'): probe.preflight()

    def test_saved_api_key_or_missing_login_cannot_collect(self):
        for auth in [subprocess.CompletedProcess([], 0, '', 'Logged in using an API key'),
                     subprocess.CompletedProcess([], 1, '', 'Not logged in')]:
            with patch.dict(probe.os.environ, {}, clear=True), patch.object(probe.subprocess, 'run', return_value=auth) as run:
                with self.assertRaisesRegex(ValueError, 'ChatGPT login'): probe.preflight()
                self.assertEqual(run.call_count, 1)

    def test_global_budget_failure_stops_before_task_checks(self):
        auth = subprocess.CompletedProcess([], 0, '', 'Logged in using ChatGPT')
        stop = json.dumps({'stopped': False, 'agents': {'owner-session': {'stopped': False}}})
        with patch.dict(probe.os.environ, {}, clear=True), patch.object(Path, 'read_text', return_value=stop), \
                patch.object(probe.subprocess, 'run', side_effect=[auth, subprocess.CalledProcessError(1, ['node'])]) as run:
            with self.assertRaises(subprocess.CalledProcessError): probe.preflight()
            self.assertEqual(run.call_count, 2)
            self.assertEqual(run.call_args.args[0][2:], ['--check'])

    def test_new_worktree_reuses_completed_private_run_without_model_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root / 'data').mkdir()
            state = root / 'private'; folder = state / 'runs' / 'completed'; folder.mkdir(parents=True)
            report = self.report(); (folder / 'report.json').write_text(json.dumps(report))
            canonical = root / 'data/ai-visibility-probe.json'
            canonical.write_text(json.dumps({'series': 'claude-sonnet-web-v1'}))
            with patch.object(probe, 'ROOT', root), patch.object(probe, 'STATE', state), \
                    patch.object(probe, 'REPORT', canonical), patch.object(probe, 'preflight'), \
                    patch.object(probe, 'collect_one') as collect_one, patch.object(probe.subprocess, 'check_output') as version:
                probe.collect()
                self.assertEqual(json.loads(canonical.read_text()), report)
                self.assertEqual(len(list((root / 'data/ai-visibility-history').glob('*.json'))), 1)
                collect_one.assert_not_called(); version.assert_not_called()


if __name__ == '__main__':
    unittest.main()
