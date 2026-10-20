#!/usr/bin/env python3
"""Observe registered routines on macOS using existing Keychain authentication.

Only the Node observer receives the token. GitHub receives one public metadata
file through a normal PR. The installed Claude Code client handles normal OAuth
renewal within its existing grant. No model, login, or routine writes.
"""
import argparse
import datetime as dt
import fcntl
import getpass
import json
import os
from pathlib import Path
import plistlib
import re
import selectors
import shutil
import subprocess
import tempfile
import time
import unittest

REPO = 'simplememofast/simplememo'
# The only PR opener auto-merge.yml accepts; the observer publishes as this account.
OWNER = REPO.split('/', 1)[0]
REMOTE = 'https://github.com/' + REPO + '.git'
BRANCH = 'Codex/routine-observations'
LEDGER = 'data/routine-runs.json'
OBSERVER = 'scripts/routine-observer.mjs'
CODEX_OBSERVER = 'scripts/codex-routine-observer.py'
# Existing reader runtime verified with read-only WAL fixtures on this Mac.
# Keep the launchd parent on system Python; never fall back to writable/immutable.
CODEX_PYTHON = '/opt/homebrew/opt/python@3.13/bin/python3.13'
LABEL = 'com.simplememo.routine-observer'
NODE = '/opt/homebrew/bin/node'
GH = '/opt/homebrew/bin/gh'
CACHE = Path.home() / 'Library/Caches/com.simplememo.routine-observer'


# The installed launcher is standalone: do not import from a mutable checkout.
# Only these fixed child codes may reach its local failure log.
CODEX_DIAGNOSTIC_CODES = frozenset({
    'scheduler_status_unsupported', 'scheduler_configuration_unsupported',
    'registered_automation_missing', 'history_run_missing', 'history_identity_changed',
    'history_transcript_missing', 'history_turn_changed', 'closed_turn_changed',
    'runtime_failure_changed', 'gate_receipt_changed', 'gate_receipt_invalid',
    'automatic_detection_invalid', 'metadata_fields_invalid', 'observation_clock_invalid',
    'observation_scope_changed', 'validation_failed', 'json_invalid', 'sqlite_unavailable',
    'source_permission_denied', 'source_missing', 'source_io_error',
    'source_shape_invalid', 'unexpected_failure',
})


def codex_failure_code(text):
    if type(text) is not str or len(text) > 1024:
        return None
    try:
        doc = json.loads(text)
    except (ValueError, TypeError):
        return None
    if type(doc) is not dict or set(doc) != {'state', 'reason', 'diagnostic_code'}:
        return None
    code = doc['diagnostic_code']
    if (doc['state'] != 'failed' or doc['reason'] != 'Codex run observation unavailable or invalid'
            or type(code) is not str or code not in CODEX_DIAGNOSTIC_CODES):
        return None
    return code


def command(argv, cwd=None, env=None):
    result = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=180)
    if result.returncode:
        # Do not echo raw API responses, Keychain data, or command output.
        if argv[:2] == [CODEX_PYTHON, CODEX_OBSERVER]:
            code = codex_failure_code(result.stdout)
            if code:
                raise RuntimeError('Codex observation failed: ' + code)
        if argv[:2] == [NODE, OBSERVER]:
            status = re.search(r'Routine observation HTTP ([0-9]{3})', result.stderr)
            if status:
                raise RuntimeError('Routine API HTTP ' + status.group(1))
        raise RuntimeError('Command failed: ' + Path(argv[0]).name + ' (exit ' + str(result.returncode) + ')')
    return result.stdout.strip()


def git(args, cwd):
    return command(['/usr/bin/git', '-c', 'credential.https://github.com.helper=',
                    '-c', 'credential.https://github.com.helper=!' + GH + ' auth git-credential',
                    *args], cwd=cwd, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'})


def check_paths(paths):
    if set(paths) - {LEDGER}:
        raise RuntimeError('Pending observation contains an unexpected path')


def semantic_state(doc):
    def routine_state(row):
        # Individual-read clocks establish freshness, not a new state every hour.
        # Keep status, endpoint, identity and the immutable last verified history.
        if row.get('observation_state') != 'unavailable':
            return row
        return {**row, 'source_observation': {
            k: v for k, v in row.get('source_observation', {}).items() if k != 'observed_at'}}
    return {
        'routines': sorted((routine_state(r) for r in doc['routines']), key=lambda r: r['id']),
        'findings': sorted(({'id': f['id'], 'what': f['what']} for f in doc['open_findings']), key=lambda r: r['id']),
        'stops': doc['intentional_stops'],
        'codex': {k: v for k, v in doc.get('codex_observation', {}).items() if k != 'observed_at'},
    }


def should_publish(before, after):
    old = dt.datetime.fromisoformat(before['observed_at'].replace('Z', '+00:00'))
    new = dt.datetime.fromisoformat(after['observed_at'].replace('Z', '+00:00'))
    if new < old:
        raise RuntimeError('Older observation rejected')
    return semantic_state(before) != semantic_state(after) or new - old >= dt.timedelta(days=1)


def check_auth_reply(reply):
    result = reply.get('result', {})
    if reply.get('error') or result.get('isError'):
        raise RuntimeError('Claude Code authentication unavailable')
    blocks = result.get('content', [])
    if not blocks or blocks[0].get('type') != 'text':
        raise RuntimeError('Claude Code authentication reply unavailable')
    try:
        status = json.loads(blocks[0]['text']).get('status')
    except (ValueError, TypeError, AttributeError):
        raise RuntimeError('Claude Code authentication reply unavailable')
    if status != 200:
        raise RuntimeError('Claude Code routine read was not successful')


def refresh_with_claude():
    """Use the installed client's normal OAuth maintenance, never a new login.

    RemoteTrigger(list) is GET-only and does not invoke a model. Its first page
    is discarded; collect() still reads the complete inventory for publication.
    """
    cli = Path.home() / '.local/bin/claude'
    with tempfile.TemporaryDirectory(prefix='simplememo-routine-auth-') as cwd:
        proc = subprocess.Popen([str(cli), '--safe-mode', '--strict-mcp-config', 'mcp', 'serve'],
                                cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL)
        selector = selectors.DefaultSelector()
        selector.register(proc.stdout, selectors.EVENT_READ)
        buffer = b''

        def request(ident, method, params=None):
            nonlocal buffer
            msg = {'jsonrpc': '2.0', 'method': method}
            if ident is not None:
                msg['id'] = ident
            if params is not None:
                msg['params'] = params
            proc.stdin.write((json.dumps(msg) + '\n').encode()); proc.stdin.flush()
            if ident is None:
                return
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if b'\n' not in buffer:
                    if not selector.select(max(0, deadline - time.monotonic())):
                        break
                    data = os.read(proc.stdout.fileno(), 65536)
                    if not data:
                        break
                    buffer += data
                    if len(buffer) > 2 * 1024 * 1024:
                        raise RuntimeError('Claude Code authentication response too large')
                    continue
                line, buffer = buffer.split(b'\n', 1)
                reply = json.loads(line)
                if reply.get('id') == ident:
                    return reply
            raise RuntimeError('Claude Code authentication check timed out')

        try:
            request(1, 'initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
                                     'clientInfo': {'name': 'simplememo-routine-observer', 'version': '1'}})
            request(None, 'notifications/initialized')
            check_auth_reply(request(2, 'tools/call', {'name': 'RemoteTrigger', 'arguments': {'action': 'list'}}))
        finally:
            selector.close()
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill(); proc.wait(timeout=3)


def observe(work, invoke=command, account=None, refresh=refresh_with_claude, now=time.time):
    def credentials():
        return json.loads(invoke(['/usr/bin/security', 'find-generic-password', '-a', account or getpass.getuser(),
                                  '-w', '-s', 'Claude Code-credentials'])).get('claudeAiOauth', {})
    oauth = credentials()
    expires = oauth.get('expiresAt')
    if isinstance(expires, (int, float)) and expires <= (now() + 300) * 1000:
        if not oauth.get('refreshToken'):
            raise RuntimeError('Existing Claude Code authentication cannot renew')
        scopes = set(oauth.get('scopes', []))
        refresh()
        oauth = credentials()
        if set(oauth.get('scopes', [])) - scopes:
            raise RuntimeError('Claude Code authentication scope changed')
        if not isinstance(oauth.get('expiresAt'), (int, float)) or oauth['expiresAt'] <= now() * 1000:
            raise RuntimeError('Claude Code authentication remains expired')
    token = oauth.get('accessToken')
    if not isinstance(token, str) or not token:
        raise RuntimeError('Existing Claude Code credential unavailable')
    # Token is never a command argument, file, plist value, or Git environment.
    return invoke([NODE, OBSERVER, '--apply'], cwd=work,
                  env={**os.environ, 'CLAUDE_CODE_OAUTH_TOKEN': token})


def branch_prs():
    """Open PRs from this repository's BRANCH, any base, split into (owned, foreign).

    The repository is public: anyone can open a PR from a fork branch of the same
    name, or from this repository's own branch. Only PRs the owner account opened
    are the observer's; anyone else's must not stand in for them or stop the observer.
    """
    # --paginate only reveals whether a second page exists. Pages are numbered, so a
    # PR closed between two requests shifts the owner's PR onto a page already read.
    pages = json.loads(command([GH, 'api', '--method', 'GET', 'repos/' + REPO + '/pulls', '-f', 'state=open',
                                '-f', 'head=' + OWNER + ':' + BRANCH, '-f', 'per_page=100', '--paginate', '--slurp']))
    if type(pages) is not list or any(type(page) is not list for page in pages):
        raise RuntimeError('Unexpected observation PR listing')
    # Decide only from one complete response; a full page may not be the whole list.
    if len(pages) != 1 or len(pages[0]) >= 100:
        raise RuntimeError('Observation PR needs operator attention')
    owned, foreign = [], []
    for pr in (pr for page in pages for pr in page):
        if type(pr) is not dict:
            raise RuntimeError('Unexpected observation PR listing')
        head = pr.get('head') or {}
        # GitHub already filters by head; do not rely on that alone.
        if head.get('ref') != BRANCH or (head.get('repo') or {}).get('full_name') != REPO:
            continue
        (owned if (pr.get('user') or {}).get('login') == OWNER else foreign).append(pr)
    return owned, foreign


def run_once(probe=False):
    CACHE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (CACHE / 'observer.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'state': 'already_running'}
        checkout = CACHE / 'repository'
        if not checkout.exists():
            git(['clone', '--no-checkout', REMOTE, str(checkout)], CACHE)
        if git(['remote', 'get-url', 'origin'], checkout) != REMOTE:
            raise RuntimeError('Unexpected observation repository')
        git(['fetch', '--prune', 'origin'], checkout)
        prs = branch_prs()[0]
        if len(prs) > 1 or (prs and prs[0]['draft']):
            raise RuntimeError('Observation PR needs operator attention')
        remote_ref = 'refs/remotes/origin/' + BRANCH
        remote_sha = git(['for-each-ref', '--format=%(objectname)', remote_ref], checkout)
        if remote_sha and not re.fullmatch('[0-9a-f]{40}', remote_sha):
            raise RuntimeError('Unexpected observation branch identity')
        start = 'origin/main'
        if prs:
            if prs[0]['head']['sha'] != remote_sha:
                raise RuntimeError('Observation branch changed during inspection')
            check_paths(git(['diff', '--name-only', 'origin/main...' + remote_sha], checkout).splitlines())
            start = remote_sha
        # All generated changes live in an isolated, disposable worktree. A failed
        # observation cannot dirty the user's checkout or erase another task's work.
        with tempfile.TemporaryDirectory(prefix='simplememo-routine-') as tmp:
            work = Path(tmp) / 'work'
            git(['worktree', 'add', '--detach', str(work), start], checkout)
            try:
                git(['-c', 'user.name=SimpleMemo Routine Observer', '-c', 'user.email=observer@simplememofast.com',
                     'merge', '--no-edit', 'origin/main'], work)
                before = json.loads((work / LEDGER).read_text())
                codex_summary = json.loads(command([CODEX_PYTHON, CODEX_OBSERVER, '--apply'], cwd=work))
                summary = json.loads(observe(work))
                summary['codex'] = codex_summary
                summary['temporary_ledger_written'] = summary.pop('written')
                after = json.loads((work / LEDGER).read_text())
                check_paths(git(['diff', '--name-only'], work).splitlines())
                command([NODE, 'scripts/check-routine-runs.mjs', '--check'], cwd=work)
                command([CODEX_PYTHON, CODEX_OBSERVER, '--check'], cwd=work)
                changed = should_publish(before, after)
                if probe or not changed:
                    return {'state': 'probe' if probe else 'unchanged', 'published_to_git': False, 'publish_needed': changed, **summary}
                git(['add', '--', LEDGER], work)
                git(['-c', 'user.name=SimpleMemo Routine Observer', '-c', 'user.email=observer@simplememofast.com',
                     'commit', '-m', 'chore: observe registered routine execution state'], work)
                # The sole owned branch may have been merged since the last run.
                # A lease prevents overwriting any update not inspected above.
                git(['push', '--force-with-lease=refs/heads/' + BRANCH + ':' + remote_sha,
                     'origin', 'HEAD:refs/heads/' + BRANCH], work)
                if prs:
                    url = 'https://github.com/' + REPO + '/pull/' + str(prs[0]['number'])
                else:
                    body = Path(tmp) / 'pr.md'
                    body.write_text('登録済みSimpleMemoタスクの実行状態を、Macの既存認証で全ページ読み取りました。'
                                    'Codexの移管済み定期運転はローカル予約記録と実行ログを読み取り、'
                                    '初回実行と後続ターンを分けて記録しました。'
                                    'モデル呼出・予定変更・認証変更はありません。意図的な停止を保持し、'
                                    'SUCCEEDEDを出荷・投稿・依頼達成とは数えません。\n\n'
                                    '観測時刻: ' + after['observed_at'] + '\n')
                    # GitHub allows one open PR per head and base, so a PR someone else
                    # opened from this branch into main would block ours, and auto-merge
                    # never merges it. Close only that one, just before creating ours.
                    blocking = [pr for pr in branch_prs()[1] if (pr.get('base') or {}).get('ref') == 'main']
                    if any(type(pr.get('number')) is not int or pr['number'] < 1 for pr in blocking):
                        raise RuntimeError('Unexpected observation PR identity')
                    for pr in blocking:
                        command([GH, 'api', '--method', 'PATCH', 'repos/' + REPO + '/pulls/' + str(pr['number']),
                                 '-f', 'state=closed'])
                    url = command([GH, 'pr', 'create', '--repo', REPO, '--base', 'main', '--head', BRANCH,
                                   '--title', '定期タスクの実行状態を同期', '--body-file', str(body)])
                return {'state': 'published', 'published_to_git': True, 'pr': url, **summary}
            finally:
                # This path was created by TemporaryDirectory above and belongs
                # only to this invocation, including any unfinished merge.
                git(['worktree', 'remove', '--force', str(work)], checkout)


def install():
    target = Path.home() / '.local/libexec/simplememo-routine-observer.py'
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copy2(__file__, target)
    target.chmod(0o700)
    CACHE.mkdir(parents=True, exist_ok=True, mode=0o700)
    plist = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
    plist.parent.mkdir(parents=True, exist_ok=True)
    config = {'Label': LABEL, 'ProgramArguments': ['/usr/bin/python3', str(target), '--once'],
              'StartInterval': 3600, 'RunAtLoad': True, 'ProcessType': 'Background',
              'StandardOutPath': str(CACHE / 'runner.log'), 'StandardErrorPath': str(CACHE / 'runner-error.log')}
    with plist.open('wb') as stream:
        plistlib.dump(config, stream)
    plist.chmod(0o600)
    return {'state': 'installed_files', 'plist': str(plist), 'script': str(target)}


class Tests(unittest.TestCase):
    def test_standard_auth_reply_is_not_task_success(self):
        check_auth_reply({'result': {'content': [{'type': 'text', 'text': '{"status":200,"json":"private instructions"}'}]}})
        for bad in [{'error': {}}, {'result': {'isError': True}}, {'result': {'content': []}},
                    {'result': {'content': [{'type': 'text', 'text': '{"status":401}'}]}}]:
            with self.assertRaises(RuntimeError):
                check_auth_reply(bad)

    def test_expired_auth_uses_client_and_preserves_scopes(self):
        for outcome in ['renewed', 'expired', 'expanded', 'denied']:
            reads = []; calls = []
            old = {'accessToken': 'old-fixture', 'refreshToken': 'refresh-fixture', 'expiresAt': 1000, 'scopes': ['read-fixture']}
            new = {**old, 'accessToken': 'new-fixture', 'expiresAt': 900000}
            if outcome == 'expired': new['expiresAt'] = 1000
            if outcome == 'expanded': new['scopes'] = ['read-fixture', 'extra-fixture']
            def fake(args, **kwargs):
                if args[0] == '/usr/bin/security':
                    reads.append(True)
                    return json.dumps({'claudeAiOauth': old if len(reads) == 1 else new})
                calls.append('observe')
                self.assertTrue(kwargs['env']['CLAUDE_CODE_OAUTH_TOKEN'] == 'new-fixture')
                self.assertTrue('refresh-fixture' not in kwargs['env'].values())
                return '{}'
            def renew():
                calls.append('client')
                if outcome == 'denied': raise RuntimeError('Existing authentication unavailable')
            if outcome == 'renewed':
                observe(Path('/tmp/unused'), invoke=fake, refresh=renew, now=lambda: 100)
                self.assertEqual(calls, ['client', 'observe'])
            else:
                with self.assertRaises(RuntimeError):
                    observe(Path('/tmp/unused'), invoke=fake, refresh=renew, now=lambda: 100)
                self.assertEqual(calls, ['client'])

    def test_only_owned_metadata_can_be_pushed(self):
        check_paths([LEDGER])
        for paths in [[OBSERVER], [LEDGER, '.github/workflows/autopilot-act.yml'], ['../secret']]:
            with self.assertRaises(RuntimeError):
                check_paths(paths)

    def test_changes_and_daily_freshness(self):
        a = {'observed_at': '2026-09-05T00:00:00Z', 'routines': [{'id': 'trig_a', 'last_run_status': 'FAILED'}],
             'open_findings': [{'id': 'trig_a', 'what': 'failed', 'observation': {'observed_at': 'old'}}], 'intentional_stops': []}
        b = json.loads(json.dumps(a)); b['observed_at'] = '2026-09-05T01:00:00Z'
        b['open_findings'][0]['observation']['observed_at'] = b['observed_at']
        self.assertFalse(should_publish(a, b))
        b['observed_at'] = '2026-09-06T00:00:00Z'; self.assertTrue(should_publish(a, b))
        b['observed_at'] = '2026-09-05T01:00:00Z'
        b['routines'][0]['last_run_status'] = 'SUCCEEDED'; self.assertTrue(should_publish(a, b))
        b['observed_at'] = '2026-09-04T00:00:00Z'
        with self.assertRaises(RuntimeError):
            should_publish(a, b)

    def test_codex_turn_changes_are_published_but_observation_clock_is_not(self):
        a = {'observed_at': '2026-09-08T00:00:00Z', 'routines': [], 'open_findings': [], 'intentional_stops': [],
             'codex_observation': {'observed_at': '2026-09-08T00:00:00Z', 'runs': [{'initial': 'failed'}]}}
        b = json.loads(json.dumps(a))
        b['observed_at'] = b['codex_observation']['observed_at'] = '2026-09-08T01:00:00Z'
        self.assertFalse(should_publish(a, b))
        b['codex_observation']['runs'].append({'initial': 'in_progress'})
        self.assertTrue(should_publish(a, b))

    def test_unavailable_read_clock_keeps_daily_publication_cadence(self):
        a = {'observed_at': '2026-09-22T00:00:00Z', 'open_findings': [], 'intentional_stops': [],
             'routines': [{'id': 'trig_old', 'observation_state': 'unavailable',
                           'source_observation': {'http_status': 404, 'observed_at': '2026-09-22T00:00:00Z'},
                           'last_verified': {'observed_at': '2026-09-19T00:00:00Z'}}]}
        b = json.loads(json.dumps(a))
        b['observed_at'] = b['routines'][0]['source_observation']['observed_at'] = '2026-09-22T01:00:00Z'
        self.assertFalse(should_publish(a, b))
        b['observed_at'] = '2026-09-23T00:00:00Z'
        self.assertTrue(should_publish(a, b))
        b['observed_at'] = '2026-09-22T01:00:00Z'
        b['routines'][0]['source_observation']['http_status'] = 403
        self.assertTrue(should_publish(a, b))
        b['routines'][0]['source_observation']['http_status'] = 404
        b['routines'][0]['last_verified']['observed_at'] = '2026-09-20T00:00:00Z'
        self.assertTrue(should_publish(a, b), 'Historical evidence must remain semantically significant')

    def test_credential_is_only_in_observer_environment(self):
        calls = []
        def fake(args, **kwargs):
            calls.append((args, kwargs))
            if args[0] == '/usr/bin/security':
                return json.dumps({'claudeAiOauth': {'accessToken': 'fixture-private-token'}})
            self.assertEqual(args, [NODE, OBSERVER, '--apply'])
            self.assertNotIn('fixture-private-token', ' '.join(args))
            self.assertTrue(kwargs['env']['CLAUDE_CODE_OAUTH_TOKEN'] == 'fixture-private-token')
            return '{}'
        self.assertEqual(observe(Path('/tmp/unused'), invoke=fake, account='fixture'), '{}')
        self.assertEqual(len(calls), 2)


class DiagnosticTests(unittest.TestCase):
    def payload(self, code='scheduler_status_unsupported'):
        return json.dumps({'state': 'failed', 'reason': 'Codex run observation unavailable or invalid',
                           'diagnostic_code': code})

    def test_fixed_codes_reach_launcher_without_stderr(self):
        from unittest.mock import patch
        for code in CODEX_DIAGNOSTIC_CODES:
            result = subprocess.CompletedProcess([], 1, self.payload(code), 'private stderr token')
            with patch('subprocess.run', return_value=result):
                with self.assertRaisesRegex(RuntimeError, '^Codex observation failed: ' + code + '$'):
                    command([CODEX_PYTHON, CODEX_OBSERVER, '--apply'])

    def test_malformed_private_and_oversized_output_stays_generic(self):
        from unittest.mock import patch
        valid = json.loads(self.payload())
        bad = ['private-secret', '[]', 'null', self.payload('private-secret'),
               json.dumps({**valid, 'prompt': 'private-secret'}),
               json.dumps({**valid, 'diagnostic_code': ['private-secret']}),
               json.dumps({**valid, 'state': 'success'}),
               json.dumps({**valid, 'reason': 'private-secret'}),
               json.dumps({'state': 'failed', 'reason': valid['reason']}),
               ' ' * 1025 + self.payload()]
        for text in bad:
            self.assertIsNone(codex_failure_code(text))
            result = subprocess.CompletedProcess([], 1, text, 'private stderr')
            with patch('subprocess.run', return_value=result):
                with self.assertRaisesRegex(RuntimeError, '^Command failed: ' + re.escape(Path(CODEX_PYTHON).name) + r' \(exit 1\)$'):
                    command([CODEX_PYTHON, CODEX_OBSERVER, '--apply'])

    def test_other_commands_cannot_impersonate_codex_diagnostics(self):
        from unittest.mock import patch
        result = subprocess.CompletedProcess([], 1, self.payload(), 'private stderr')
        for argv in [['/usr/bin/python3', 'unrelated.py'], ['/bin/python3', CODEX_OBSERVER]]:
            with patch('subprocess.run', return_value=result):
                with self.assertRaisesRegex(RuntimeError, r'^Command failed: python3 \(exit 1\)$'):
                    command(argv)

    def test_success_output_is_unchanged(self):
        from unittest.mock import patch
        result = subprocess.CompletedProcess([], 0, '  {"written":true}\n', 'private stderr')
        with patch('subprocess.run', return_value=result):
            self.assertEqual(command([CODEX_PYTHON, CODEX_OBSERVER, '--apply']), '{"written":true}')

    def test_child_code_vocabulary_matches_standalone_launcher(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('observer_source_fixture', Path(__file__).with_name('codex-routine-observer.py'))
        child = importlib.util.module_from_spec(spec); spec.loader.exec_module(child)
        base_codes = {'validation_failed', 'json_invalid', 'sqlite_unavailable', 'source_permission_denied',
                      'source_missing', 'source_io_error', 'source_shape_invalid', 'unexpected_failure'}
        self.assertEqual(CODEX_DIAGNOSTIC_CODES, set(child.DIAGNOSTIC_CHECKS.values()) | base_codes)
        for message in child.DIAGNOSTIC_CHECKS:
            self.assertEqual(codex_failure_code(json.dumps(child.failure_payload(ValueError(message)))),
                             child.DIAGNOSTIC_CHECKS[message])


class ReaderRuntimeTests(unittest.TestCase):
    reader = '/opt/homebrew/opt/python@3.13/bin/python3.13'

    def test_collection_and_check_use_the_selected_reader(self):
        from unittest.mock import patch
        calls = []
        with tempfile.TemporaryDirectory(prefix='observer-runtime-test-') as tmp:
            cache = Path(tmp) / 'cache'; (cache / 'repository').mkdir(parents=True)
            ledger = {'observed_at': '2026-09-17T00:00:00Z', 'routines': [],
                      'open_findings': [], 'intentional_stops': []}
            def fake_git(args, cwd):
                if args[:3] == ['remote', 'get-url', 'origin']:
                    return REMOTE
                if args[:2] == ['worktree', 'add']:
                    work = Path(args[-2]); (work / LEDGER).parent.mkdir(parents=True)
                    (work / LEDGER).write_text(json.dumps(ledger))
                return ''
            def fake_command(args, **kwargs):
                calls.append(args)
                if args[:4] == [GH, 'api', '--method', 'GET']:
                    return '[[]]'
                return '{}'
            with patch.dict(globals(), {'CACHE': cache, 'git': fake_git, 'command': fake_command,
                                         'observe': lambda work: '{"written":false}'}):
                result = run_once(probe=True)
            self.assertEqual(result['state'], 'probe')
            self.assertFalse(result['published_to_git'])
            self.assertEqual([args for args in calls if len(args) > 1 and args[1] == CODEX_OBSERVER],
                             [[self.reader, CODEX_OBSERVER, '--apply'],
                              [self.reader, CODEX_OBSERVER, '--check']])

    def test_old_interpreter_cannot_supply_reader_diagnostics(self):
        from unittest.mock import patch
        result = subprocess.CompletedProcess([], 1, DiagnosticTests().payload(), 'private stderr')
        with patch('subprocess.run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, r'^Command failed: python3 \(exit 1\)$'):
                command(['/usr/bin/python3', CODEX_OBSERVER, '--apply'])

    def test_missing_reader_has_no_runtime_or_mode_fallback(self):
        from unittest.mock import patch
        with patch('subprocess.run', side_effect=FileNotFoundError('synthetic missing reader')) as invoke:
            with self.assertRaises(FileNotFoundError):
                command([self.reader, CODEX_OBSERVER, '--apply'])
            invoke.assert_called_once()

    def test_parent_launchd_runtime_and_schedule_are_unchanged(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory(prefix='observer-install-test-') as tmp:
            home = Path(tmp)
            with patch.object(Path, 'home', return_value=home), patch.dict(globals(), {'CACHE': home / 'cache'}):
                result = install()
            with Path(result['plist']).open('rb') as stream:
                config = plistlib.load(stream)
            self.assertEqual(config['ProgramArguments'], ['/usr/bin/python3',
                             str(home / '.local/libexec/simplememo-routine-observer.py'), '--once'])
            self.assertEqual(config['StartInterval'], 3600)
            self.assertIs(config['RunAtLoad'], True)
            self.assertEqual(config['Label'], LABEL)


class PublicationPrTests(unittest.TestCase):
    sha = 'a' * 40
    created = 'https://github.com/' + REPO + '/pull/900'

    def pr(self, number, login=OWNER, repo=REPO, base='main', draft=False, sha=None):
        return {'number': number, 'draft': draft, 'user': {'login': login}, 'base': {'ref': base},
                'head': {'ref': BRANCH, 'sha': sha or self.sha, 'repo': {'full_name': repo} if repo else None}}

    def publish(self, listed, pages=None, branch_paths=''):
        from unittest.mock import patch
        calls = []
        with tempfile.TemporaryDirectory(prefix='observer-publication-test-') as tmp:
            cache = Path(tmp) / 'cache'; (cache / 'repository').mkdir(parents=True)
            ledger = {'observed_at': '2026-10-01T00:00:00Z', 'routines': [], 'open_findings': [], 'intentional_stops': []}
            def fake_git(args, cwd):
                calls.append(['git'] + args)
                if args[:3] == ['remote', 'get-url', 'origin']:
                    return REMOTE
                if args[0] == 'for-each-ref':
                    return self.sha
                if args[:3] == ['diff', '--name-only', 'origin/main...' + self.sha]:
                    return branch_paths
                if args[:2] == ['worktree', 'add']:
                    work = Path(args[-2]); (work / LEDGER).parent.mkdir(parents=True)
                    (work / LEDGER).write_text(json.dumps(ledger))
                return ''
            def fake_observe(work):
                (work / LEDGER).write_text(json.dumps({**ledger, 'observed_at': '2026-10-02T00:00:00Z'}))
                return '{"written":true}'
            def fake_command(args, **kwargs):
                calls.append(args)
                if args[:4] == [GH, 'api', '--method', 'GET']:
                    # gh api --paginate --slurp returns one JSON array per page.
                    return json.dumps([listed] if pages is None else pages)
                if args[:3] == [GH, 'pr', 'create']:
                    return self.created
                return '{}'
            with patch.dict(globals(), {'CACHE': cache, 'git': fake_git, 'command': fake_command,
                                         'observe': fake_observe}):
                try:
                    return run_once(), calls
                except RuntimeError as error:
                    return error, calls

    def closed(self, calls):
        return [args[4] for args in calls if args[:4] == [GH, 'api', '--method', 'PATCH']]

    def created_pr(self, calls):
        return [args for args in calls if args[:3] == [GH, 'pr', 'create']]

    def reused(self, number):
        return 'https://github.com/' + REPO + '/pull/' + str(number)

    def test_listing_is_limited_to_this_repository_branch_and_reads_every_page(self):
        result, calls = self.publish([])
        listings = [args for args in calls if args[:4] == [GH, 'api', '--method', 'GET']]
        self.assertEqual(len(listings), 2, 'Listed once to inspect and again right before creating')
        for args in listings:
            self.assertEqual(args, [GH, 'api', '--method', 'GET', 'repos/simplememofast/simplememo/pulls',
                                    '-f', 'state=open', '-f', 'head=simplememofast:Codex/routine-observations',
                                    '-f', 'per_page=100', '--paginate', '--slurp'])
        self.assertEqual(result['pr'], self.created)

    def test_fork_prs_with_the_same_branch_name_are_ignored(self):
        forks = [self.pr(5, login='outsider', repo='outsider/simplememo'),
                 self.pr(6, login='outsider', repo='outsider/simplememo', draft=True, sha='b' * 40),
                 self.pr(7, login='outsider', repo=None), self.pr(8, repo='simplememofast/other'),
                 self.pr(9, login='outsider', repo='outsider/simplememo', base='claude/x')]
        for listed in [forks] + [[fork] for fork in forks]:
            result, calls = self.publish(listed)
            self.assertIsInstance(result, dict, listed)
            self.assertEqual((result['state'], result['pr']), ('published', self.created))
            self.assertEqual(self.closed(calls), [], 'A fork PR cannot block ours and is not ours to close')

    def test_prs_others_open_from_this_branch_into_main_cannot_block_or_stand_in(self):
        for pr in [self.pr(11, login='outsider'), self.pr(12, login='outsider', draft=True),
                   self.pr(13, login='simplememofast-fake'), {**self.pr(14), 'user': None},
                   self.pr(15, login='outsider', sha='b' * 40)]:
            result, calls = self.publish([pr])
            self.assertIsInstance(result, dict, pr)
            self.assertEqual((result['state'], result['pr']), ('published', self.created))
            self.assertEqual(self.closed(calls), ['repos/' + REPO + '/pulls/' + str(pr['number'])])
            closing = calls.index([GH, 'api', '--method', 'PATCH', 'repos/' + REPO + '/pulls/' + str(pr['number']),
                                   '-f', 'state=closed'])
            self.assertLess(closing, calls.index(self.created_pr(calls)[0]))

    def test_others_prs_into_other_bases_are_left_alone(self):
        for listed in [[self.pr(21, login='outsider', base='claude/x')],
                       [self.pr(21, login='outsider', base='claude/x'), self.pr(22, login='outsider', base='claude/y', draft=True)]]:
            result, calls = self.publish(listed)
            self.assertEqual((result['state'], result['pr']), ('published', self.created))
            self.assertEqual(self.closed(calls), [])

    def test_unexpected_pr_identity_is_not_closed(self):
        for number in ['15', 0, -1, True, None]:
            listed = [self.pr(16, login='outsider', base='claude/x'), {**self.pr(15, login='outsider'), 'number': number}]
            result, calls = self.publish(listed)
            self.assertIsInstance(result, RuntimeError)
            self.assertEqual((self.closed(calls), self.created_pr(calls)), ([], []))

    def test_unexpected_listing_stops_before_any_write(self):
        for pages in [{}, [{}], [[1]], [[self.pr(30)], None], [['x']]]:
            result, calls = self.publish(None, pages=pages)
            self.assertIsInstance(result, RuntimeError, pages)
            self.assertEqual((self.closed(calls), self.created_pr(calls)), ([], []))

    def test_own_pr_into_any_base_is_still_reused_and_guarded(self):
        others = [self.pr(31, login='outsider', base='claude/x'), self.pr(32, login='outsider', repo='outsider/simplememo')]
        for base in ['main', 'claude/y']:
            for listed in [[self.pr(30, base=base)], [self.pr(30, base=base)] + others]:
                result, calls = self.publish(listed)
                self.assertEqual((result['state'], result['pr']), ('published', self.reused(30)))
                self.assertEqual((self.closed(calls), self.created_pr(calls)), ([], []))
            for listed in [[self.pr(30, base=base, draft=True)], [self.pr(30, base=base), self.pr(33)],
                           [self.pr(30, base=base), self.pr(33, base='claude/z')],
                           [self.pr(30, base=base, sha='c' * 40)]]:
                result, calls = self.publish(listed)
                self.assertIsInstance(result, RuntimeError, listed)
                self.assertEqual((self.closed(calls), self.created_pr(calls)), ([], []))
            result, calls = self.publish([self.pr(30, base=base)], branch_paths=LEDGER + '\n.github/workflows/x.yml')
            self.assertIsInstance(result, RuntimeError)
            self.assertEqual((self.closed(calls), self.created_pr(calls)), ([], []))
        # An outsider's PR into main does not stop or replace the owner's PR elsewhere.
        result, calls = self.publish([self.pr(34, login='outsider'), self.pr(30, base='claude/y')])
        self.assertEqual((result['state'], result['pr']), ('published', self.reused(30)))
        self.assertEqual((self.closed(calls), self.created_pr(calls)), ([], []))

    def crowd(self, count):
        return [self.pr(100 + i, login='outsider', base='claude/b' + str(i)) for i in range(count)]

    def stops_before_any_write(self, pages):
        result, calls = self.publish(None, pages=pages)
        self.assertIsInstance(result, RuntimeError, pages)
        self.assertEqual(str(result), 'Observation PR needs operator attention')
        self.assertEqual([args for args in calls if args[:2] in (['git', 'push'], ['git', 'worktree'])
                          or args[:4] == [GH, 'api', '--method', 'PATCH'] or args[:3] == [GH, 'pr', 'create']], [])
        self.assertEqual(len([args for args in calls if args[:4] == [GH, 'api', '--method', 'GET']]), 1)

    def test_more_than_one_page_stops_before_any_write_with_own_pr_on_page_2(self):
        # Pages can shift between requests, so a later page cannot be trusted to hold it.
        for own in [self.pr(30, base='claude/y', draft=True), self.pr(30, base='claude/y'), self.pr(30)]:
            self.stops_before_any_write([self.crowd(100), [own]])
            self.stops_before_any_write([self.crowd(100), [self.pr(200, login='outsider'), own]])

    def test_more_than_one_page_stops_before_any_write_without_own_pr(self):
        # The shifted view of the case above: the owner's PR slid onto page 1 after it was read.
        for pages in [[self.crowd(100), []], [self.crowd(100), [self.pr(200, login='outsider')]],
                      [self.crowd(99), self.crowd(2)], [[], []]]:
            self.stops_before_any_write(pages)

    def test_only_one_page_short_of_full_is_decided(self):
        for pages in [[], [self.crowd(100)], [self.crowd(99) + [self.pr(30, base='claude/y', draft=True)]]]:
            self.stops_before_any_write(pages)
        result, calls = self.publish(self.crowd(99))
        self.assertEqual((result['state'], result['pr'], self.closed(calls)), ('published', self.created, []))
        result, calls = self.publish(self.crowd(98) + [self.pr(30, base='claude/y')])
        self.assertEqual((result['state'], result['pr']), ('published', self.reused(30)))
        self.assertEqual((self.closed(calls), self.created_pr(calls)), ([], []))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    for flag in ['once', 'probe', 'install', 'selftest']:
        group.add_argument('--' + flag, action='store_true')
    options = parser.parse_args()
    if options.selftest:
        unittest.main(argv=[__file__])
    else:
        try:
            result = install() if options.install else run_once(probe=options.probe)
            print(json.dumps(result))
        except Exception as error:
            # Exception details from Keychain/JSON parsing may contain private data.
            print(json.dumps({'state': 'failed', 'error_type': type(error).__name__,
                              'reason': str(error) if isinstance(error, RuntimeError) else 'Observation unavailable',
                              'observed_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}))
            raise SystemExit(1)
