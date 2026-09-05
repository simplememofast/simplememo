#!/usr/bin/env python3
"""Independent clock for the deterministic decision monitor; no model or new token.

GitHub's active runs are always allowed to finish. A recent successful actual
monitor step, or this service's own successful run, suppresses duplicate work.
All writes still go through the existing monitor's bounded PR/recovery gates.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

REPO = 'simplememofast/simplememo'
REMOTE = 'https://github.com/' + REPO + '.git'
WORKFLOW = '.github/workflows/decision-monitor.yml'
LABEL = 'com.simplememo.decision-monitor'
INTERVAL = 900
NODE = '/opt/homebrew/bin/node'
GH = '/opt/homebrew/bin/gh'
CACHE = Path.home() / 'Library/Caches/com.simplememo.decision-monitor'
TARGET = Path.home() / '.local/libexec/simplememo-decision-monitor.py'
STEP = 'Observe, settle, and recover within the declared boundary'
LIVE = ['queued', 'in_progress', 'waiting', 'pending', 'requested']


def command(argv, cwd=None, env=None, timeout=180):
    p = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    if p.returncode:
        status = re.search(r'HTTP (\d{3})', p.stderr)
        raise RuntimeError('Command failed: ' + Path(argv[0]).name +
                           (' HTTP ' + status.group(1) if status else ' exit ' + str(p.returncode)))
    return p.stdout.strip()


def git(args, cwd):
    return command(['/usr/bin/git', '-c', 'credential.https://github.com.helper=',
                    '-c', 'credential.https://github.com.helper=!' + GH + ' auth git-credential', *args],
                   cwd=cwd, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'})


def api(route):
    return json.loads(command([GH, 'api', 'repos/' + REPO + '/actions/' + route]))


def instant(value):
    if not isinstance(value, str):
        raise RuntimeError('Missing observation timestamp')
    try:
        result = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise RuntimeError('Invalid observation timestamp')
    if result.tzinfo is None:
        raise RuntimeError('Observation timezone is required')
    return result


def positive(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def emergency_stopped(doc):
    if not isinstance(doc.get('stopped'), bool) or not isinstance(doc.get('agents', {}).get('act', {}).get('stopped'), bool):
        raise RuntimeError('Emergency stop state is unverified')
    return doc['stopped'] or doc['agents']['act']['stopped']


def one_run(doc, workflow_id, now, status, event=None):
    rows, total = doc.get('workflow_runs'), doc.get('total_count')
    if not isinstance(rows, list) or not isinstance(total, int) or isinstance(total, bool) or total < 0 \
            or len(rows) > 1 or total < len(rows) or (total > 0 and not rows):
        raise RuntimeError('Incomplete workflow run observation')
    if not rows:
        return None
    r = rows[0]
    if not positive(r.get('id')) or r.get('workflow_id') != workflow_id or r.get('path') != WORKFLOW \
            or r.get('repository', {}).get('full_name') != REPO or instant(r.get('created_at')) > now:
        raise RuntimeError('Workflow run identity is unverified')
    if status == 'success':
        if r.get('status') != 'completed' or r.get('conclusion') != 'success' or r.get('event') != event:
            raise RuntimeError('Successful monitor observation is unverified')
    elif r.get('status') != status:
        raise RuntimeError('Active workflow observation is unverified')
    return r


def monitor_admission(request=api, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    workflow = request('workflows/decision-monitor.yml')
    if not positive(workflow.get('id')) or workflow.get('path') != WORKFLOW:
        raise RuntimeError('Decision Monitor identity is unverified')
    if workflow.get('state') in ['disabled_manually', 'disabled_inactivity', 'disabled_fork']:
        return {'state': 'workflow_stopped'}
    if workflow.get('state') != 'active':
        raise RuntimeError('Workflow enabled state is unverified')
    if instant(workflow.get('created_at')) > now:
        raise RuntimeError('Workflow observation is from the future')
    ident = workflow['id']
    # Query each live status directly: a long-queued run must not disappear
    # merely because newer completed runs fill the first page.
    for status in LIVE:
        run = one_run(request('workflows/' + str(ident) + '/runs?status=' + status + '&per_page=1'), ident, now, status)
        if run:
            return {'state': 'github_run_live', 'run_id': run['id'], 'run_status': status}
    for event in ['schedule', 'workflow_run']:
        run = one_run(request('workflows/' + str(ident) + '/runs?status=success&event=' + event + '&per_page=1'), ident, now, 'success', event)
        if not run:
            continue
        jobs = request('runs/' + str(run['id']) + '/jobs?per_page=100')
        if not isinstance(jobs.get('jobs'), list) or jobs.get('total_count') != len(jobs['jobs']) or len(jobs['jobs']) >= 100:
            raise RuntimeError('Incomplete monitor job observation')
        matches = [j for j in jobs['jobs'] if j.get('name') == 'monitor']
        if len(matches) != 1 or matches[0].get('conclusion') != 'success':
            raise RuntimeError('Monitor job success is unverified')
        steps = [s for s in matches[0].get('steps', []) if s.get('name') == STEP]
        if len(steps) != 1 or steps[0].get('status') != 'completed' or steps[0].get('conclusion') != 'success':
            raise RuntimeError('Actual monitor step did not complete')
        completed = instant(steps[0].get('completed_at'))
        if completed > now:
            raise RuntimeError('Monitor completion is from the future')
        if (now - completed).total_seconds() < INTERVAL:
            return {'state': 'github_monitor_fresh', 'run_id': run['id'], 'completed_at': steps[0]['completed_at']}
    return {'state': 'due'}


def native_fresh(receipt, now):
    if receipt is None:
        return False
    origin = receipt.get('execution_origin')
    if not isinstance(origin, dict):
        raise RuntimeError('Local monitor origin is missing')
    body = {k: v for k, v in origin.items() if k != 'receipt_sha256'}
    digest = hashlib.sha256(json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    if receipt.get('state') != 'completed' or origin.get('provider') != 'launchd' or origin.get('label') != LABEL \
            or origin.get('launch_reason') != 'interval' or not positive(origin.get('pid')) or origin['pid'] <= 1 \
            or not re.fullmatch('[a-f0-9]{64}', origin.get('launcher_sha256', '')) \
            or not re.fullmatch('[a-f0-9]{40}', origin.get('execution_sha', '')) or origin.get('receipt_sha256') != digest:
        raise RuntimeError('Local monitor receipt is invalid')
    completed = instant(receipt.get('completed_at'))
    if completed > now or instant(origin.get('observed_at')) > completed:
        raise RuntimeError('Local completion is from the future')
    return (now - completed).total_seconds() < INTERVAL


def run_once(probe=False):
    CACHE.mkdir(parents=True, exist_ok=True, mode=0o700)
    CACHE.chmod(0o700)
    now = dt.datetime.now(dt.timezone.utc)
    with (CACHE / 'monitor.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'state': 'native_run_live'}
        admission = monitor_admission(now=now)
        if admission['state'] != 'due':
            return {**admission, 'observed_at': now.isoformat()}
        receipt_path = CACHE / 'last-success.json'
        if native_fresh(json.loads(receipt_path.read_text()) if receipt_path.exists() else None, now):
            return {'state': 'native_monitor_fresh', 'observed_at': now.isoformat()}
        checkout = CACHE / 'repository'
        if not checkout.exists():
            git(['clone', '--no-checkout', REMOTE, str(checkout)], CACHE)
        if git(['remote', 'get-url', 'origin'], checkout) != REMOTE:
            raise RuntimeError('Unexpected monitor repository')
        git(['fetch', '--prune', 'origin'], checkout)
        head = git(['rev-parse', 'origin/main'], checkout)
        branches = set(git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], checkout).splitlines())
        with tempfile.TemporaryDirectory(prefix='simplememo-decision-') as tmp:
            work = Path(tmp) / 'work'
            git(['worktree', 'add', '--detach', str(work), head], checkout)
            try:
                stop = json.loads((work / 'data/emergency-stop.json').read_text())
                if emergency_stopped(stop):
                    return {'state': 'emergency_stopped', 'head': head}
                if not probe and hashlib.sha256(Path(__file__).read_bytes()).digest() != hashlib.sha256((work / 'scripts/decision-monitor-local.py').read_bytes()).digest():
                    raise RuntimeError('Installed monitor launcher needs the verified main update')
                git(['config', 'user.name', 'SimpleMemo Decision Monitor'], work)
                git(['config', 'user.email', 'automation@simplememofast.com'], work)
                git(['config', 'credential.https://github.com.helper', ''], work)
                git(['config', '--add', 'credential.https://github.com.helper', '!' + GH + ' auth git-credential'], work)
                env = {k: v for k, v in os.environ.items() if k not in ['GITHUB_EVENT_NAME', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_ACTIONS', 'DECISION_MONITOR_NATIVE_TIMER']}
                env['PATH'] = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
                if not probe:
                    env['DECISION_MONITOR_NATIVE_TIMER'] = '1'
                for script in ['value-contracts.mjs', 'decision-review.mjs', 'decision-monitor.mjs']:
                    command([NODE, 'scripts/' + script, '--selftest'], cwd=work, env=env)
                summary = json.loads(command([NODE, 'scripts/decision-monitor.mjs', *([] if probe else ['--apply'])], cwd=work, env=env, timeout=600))
                completed = dt.datetime.now(dt.timezone.utc).isoformat()
                if summary.get('state') == 'waiting_for_publication':
                    return {'state': 'waiting_for_publication', 'head': head, 'observed_at': completed, 'monitor': summary}
                if summary.get('state') != 'observed':
                    raise RuntimeError('Monitor did not return a verified observation result')
                result = {'state': 'probe' if probe else 'completed', 'head': head, 'completed_at': completed,
                          'execution_origin': summary.get('execution_origin'), 'monitor': summary}
                if not probe:
                    if summary.get('trigger') != 'launchd' or not native_fresh(result, dt.datetime.now(dt.timezone.utc)):
                        raise RuntimeError('Native interval execution was not verified')
                    temp = CACHE / 'last-success.pending'
                    temp.write_text(json.dumps(result) + '\n'); temp.chmod(0o600); temp.replace(receipt_path)
                return result
            finally:
                git(['worktree', 'remove', '--force', str(work)], checkout)
                # Only branches created by this run in this dedicated cache.
                added = set(git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], checkout).splitlines()) - branches
                for branch in added:
                    if branch.startswith('Codex/decision-'):
                        git(['branch', '-D', branch], checkout)


def install():
    TARGET.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copy2(__file__, TARGET); TARGET.chmod(0o700)
    CACHE.mkdir(parents=True, exist_ok=True, mode=0o700); CACHE.chmod(0o700)
    for name in ['runner.log', 'runner-error.log']:
        log = CACHE / name
        log.touch(exist_ok=True); log.chmod(0o600)
    plist = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
    plist.parent.mkdir(parents=True, exist_ok=True)
    config = {'Label': LABEL, 'ProgramArguments': ['/usr/bin/python3', str(TARGET), '--once'],
              'StartInterval': INTERVAL, 'RunAtLoad': False, 'ProcessType': 'Background',
              'StandardOutPath': str(CACHE / 'runner.log'), 'StandardErrorPath': str(CACHE / 'runner-error.log')}
    with plist.open('wb') as f:
        plistlib.dump(config, f)
    plist.chmod(0o600)
    return {'state': 'installed_files', 'script': str(TARGET), 'plist': str(plist)}


class Tests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 9, 5, 12, 0, tzinfo=dt.timezone.utc)
        self.workflow = {'id': 30, 'path': WORKFLOW, 'state': 'active', 'created_at': '2026-09-04T00:00:00Z'}
        self.run = {'id': 31, 'workflow_id': 30, 'path': WORKFLOW, 'repository': {'full_name': REPO},
                    'created_at': '2026-09-05T11:40:00Z', 'status': 'completed', 'conclusion': 'success', 'event': 'schedule'}
        self.jobs = {'total_count': 1, 'jobs': [{'name': 'monitor', 'conclusion': 'success', 'steps': [
            {'name': STEP, 'status': 'completed', 'conclusion': 'success', 'completed_at': '2026-09-05T11:50:00Z'}]}]}

    def request(self, live=None, run=True, jobs=None, workflow=None):
        def read(route):
            if route == 'workflows/decision-monitor.yml':
                return self.workflow if workflow is None else workflow
            if '/jobs?' in route:
                return self.jobs if jobs is None else jobs
            if 'status=success' in route:
                rows = [self.run] if run and 'event=schedule&' in route else []
            else:
                rows = [{**self.run, 'status': live, 'conclusion': None}] if live and 'status=' + live + '&' in route else []
            return {'total_count': len(rows), 'workflow_runs': rows}
        return read

    def test_live_handles_always_win_over_age(self):
        self.run['created_at'] = '2026-09-01T00:00:00Z'
        for status in LIVE:
            with self.subTest(status=status):
                result = monitor_admission(self.request(live=status), self.now)
                self.assertEqual(result['state'], 'github_run_live')
                self.assertEqual(result['run_id'], 31)

    def test_only_completed_actual_step_is_fresh(self):
        self.assertEqual(monitor_admission(self.request(), self.now)['state'], 'github_monitor_fresh')
        self.jobs['jobs'][0]['steps'][0]['completed_at'] = '2026-09-05T11:45:00Z'
        self.assertEqual(monitor_admission(self.request(), self.now)['state'], 'due')
        self.run['updated_at'] = '2026-09-05T12:00:00Z'
        self.assertEqual(monitor_admission(self.request(), self.now)['state'], 'due', 'updated_at is not monitor execution')
        self.jobs['jobs'][0]['steps'][0]['conclusion'] = 'skipped'
        with self.assertRaisesRegex(RuntimeError, 'step did not complete'):
            monitor_admission(self.request(), self.now)

    def test_disabled_unknown_and_incomplete_never_launch(self):
        self.assertEqual(monitor_admission(self.request(workflow={**self.workflow, 'state': 'disabled_manually'}), self.now)['state'], 'workflow_stopped')
        for change in [{'workflow_id': 99}, {'path': 'other.yml'}, {'event': 'workflow_dispatch'},
                       {'repository': {'full_name': 'other/repo'}}, {'created_at': '2026-09-06T00:00:00Z'}]:
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                one_run({'total_count': 1, 'workflow_runs': [{**self.run, **change}]}, 30, self.now, 'success', 'schedule')
        for bad in [{'total_count': 1, 'workflow_runs': []}, {'total_count': 0, 'workflow_runs': [self.run]},
                    {'total_count': None, 'workflow_runs': []}, {'total_count': 1, 'jobs': []}]:
            with self.subTest(bad=bad), self.assertRaises(RuntimeError):
                one_run(bad, 30, self.now, 'success', 'schedule')
        with self.assertRaisesRegex(RuntimeError, 'Incomplete monitor job'):
            monitor_admission(self.request(jobs={'total_count': 2, 'jobs': self.jobs['jobs']}), self.now)
        with self.assertRaisesRegex(RuntimeError, 'transport unknown'):
            monitor_admission(lambda _: (_ for _ in ()).throw(RuntimeError('transport unknown')), self.now)

    def test_receipt_cannot_turn_probe_or_unknown_into_recent_success(self):
        origin = {'provider': 'launchd', 'label': LABEL, 'launch_reason': 'interval', 'pid': 123,
                  'launcher_sha256': 'a' * 64, 'execution_sha': 'b' * 40, 'observed_at': '2026-09-05T11:49:00Z'}
        origin['receipt_sha256'] = hashlib.sha256(json.dumps(origin, separators=(',', ':')).encode()).hexdigest()
        receipt = {'state': 'completed', 'execution_origin': origin, 'completed_at': '2026-09-05T11:50:00Z'}
        self.assertTrue(native_fresh(receipt, self.now))
        self.assertFalse(native_fresh({**receipt, 'completed_at': '2026-09-05T11:49:00Z'}, self.now + dt.timedelta(minutes=5)))
        for change in [{'state': 'probe'}, {'completed_at': '2026-09-06T00:00:00Z'}, {'execution_origin': None},
                       {'execution_origin': {**origin, 'receipt_sha256': '0' * 64}},
                       {'execution_origin': {**origin, 'launch_reason': 'non-ipc demand'}}]:
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                native_fresh({**receipt, **change}, self.now)

    def test_admission_is_connected_to_the_actual_runner(self):
        with tempfile.TemporaryDirectory(prefix='decision-runner-test-') as tmp:
            with mock.patch.dict(run_once.__globals__, {'CACHE': Path(tmp)}), \
                    mock.patch(__name__ + '.monitor_admission', return_value={'state': 'github_run_live', 'run_id': 31}), \
                    mock.patch(__name__ + '.command', side_effect=AssertionError('live GitHub handle reached a subprocess')) as invoke:
                self.assertEqual(run_once()['state'], 'github_run_live')
                invoke.assert_not_called()

    def test_missing_stop_state_does_not_enable_execution(self):
        self.assertFalse(emergency_stopped({'stopped': False, 'agents': {'act': {'stopped': False}}}))
        self.assertTrue(emergency_stopped({'stopped': True, 'agents': {'act': {'stopped': False}}}))
        self.assertTrue(emergency_stopped({'stopped': False, 'agents': {'act': {'stopped': True}}}))
        for bad in [{}, {'stopped': False}, {'stopped': False, 'agents': {'act': {'stopped': None}}}]:
            with self.assertRaisesRegex(RuntimeError, 'unverified'):
                emergency_stopped(bad)

    def test_due_runner_executes_monitor_and_commits_receipt_only_after_success(self):
        for mode in ['apply', 'probe', 'failed', 'unverified', 'pending', 'stopped']:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(prefix='decision-orchestration-') as tmp:
                cache = Path(tmp) / 'cache'; calls = []
                def fake_git(args, cwd):
                    calls.append(('git', args))
                    if args[0] == 'clone':
                        Path(args[-1]).mkdir(parents=True)
                    if args[:2] == ['remote', 'get-url']:
                        return REMOTE
                    if args[0] == 'rev-parse':
                        return 'a' * 40
                    if args[0] == 'for-each-ref':
                        return 'main'
                    if args[:2] == ['worktree', 'add']:
                        work = Path(args[3]); (work / 'data').mkdir(parents=True); (work / 'scripts').mkdir()
                        (work / 'data/emergency-stop.json').write_text(json.dumps({'stopped': mode == 'stopped', 'agents': {'act': {'stopped': False}}}))
                        (work / 'scripts/decision-monitor-local.py').write_bytes(Path(__file__).read_bytes())
                    return ''
                origin = {'provider': 'launchd', 'label': LABEL, 'launch_reason': 'interval', 'pid': 123,
                          'launcher_sha256': 'b' * 64, 'execution_sha': 'a' * 40, 'observed_at': self.now.isoformat()}
                origin['receipt_sha256'] = hashlib.sha256(json.dumps(origin, separators=(',', ':')).encode()).hexdigest()
                def invoke(args, **kwargs):
                    calls.append(('node', args))
                    self.assertEqual(args[0], NODE)
                    self.assertNotIn('GITHUB_EVENT_NAME', kwargs['env'])
                    if '--selftest' in args:
                        return 'selftest passed'
                    self.assertEqual(args, [NODE, 'scripts/decision-monitor.mjs'] + ([] if mode == 'probe' else ['--apply']))
                    self.assertEqual(kwargs['env'].get('DECISION_MONITOR_NATIVE_TIMER'), None if mode == 'probe' else '1')
                    if mode == 'failed':
                        raise RuntimeError('fixture execution failed')
                    return json.dumps({'state': 'waiting_for_publication' if mode == 'pending' else 'observed',
                                       'trigger': 'manual' if mode == 'probe' else 'launchd',
                                       'execution_origin': None if mode in ['probe', 'unverified'] else origin})
                with mock.patch.dict(run_once.__globals__, {'CACHE': cache}), \
                        mock.patch(__name__ + '.monitor_admission', return_value={'state': 'due'}), \
                        mock.patch(__name__ + '.git', side_effect=fake_git), \
                        mock.patch(__name__ + '.command', side_effect=invoke):
                    if mode in ['failed', 'unverified']:
                        with self.assertRaises(RuntimeError):
                            run_once()
                    else:
                        result = run_once(probe=mode == 'probe')
                        self.assertEqual(result['state'], {'apply': 'completed', 'probe': 'probe', 'pending': 'waiting_for_publication', 'stopped': 'emergency_stopped'}[mode])
                self.assertEqual((cache / 'last-success.json').exists(), mode == 'apply', 'only successful interval observation may suppress later runs')
                if mode == 'stopped':
                    self.assertFalse(any(kind == 'node' for kind, _ in calls), 'emergency stop must reach the real runner')
                else:
                    self.assertEqual(len([a for kind, a in calls if kind == 'node' and '--selftest' in a]), 3)
                self.assertTrue(any(a[:2] == ['worktree', 'remove'] for kind, a in calls if kind == 'git'), 'owned temporary checkout must be cleaned up')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    for flag in ['once', 'probe', 'install', 'selftest']:
        group.add_argument('--' + flag, action='store_true')
    args = parser.parse_args()
    if args.selftest:
        unittest.main(argv=[__file__])
    else:
        try:
            print(json.dumps(install() if args.install else run_once(probe=args.probe)))
        except Exception as error:
            print(json.dumps({'state': 'failed', 'error_type': type(error).__name__,
                              'reason': str(error) if isinstance(error, RuntimeError) else 'Monitor execution unavailable'}))
            raise SystemExit(1)
