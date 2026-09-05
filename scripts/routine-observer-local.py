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
REMOTE = 'https://github.com/' + REPO + '.git'
BRANCH = 'Codex/routine-observations'
LEDGER = 'data/routine-runs.json'
OBSERVER = 'scripts/routine-observer.mjs'
LABEL = 'com.simplememo.routine-observer'
NODE = '/opt/homebrew/bin/node'
GH = '/opt/homebrew/bin/gh'
CACHE = Path.home() / 'Library/Caches/com.simplememo.routine-observer'


def command(argv, cwd=None, env=None):
    result = subprocess.run(argv, cwd=cwd, env=env, text=True, capture_output=True, timeout=180)
    if result.returncode:
        # Do not echo raw API responses, Keychain data, or command output.
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
    return {
        'routines': sorted(doc['routines'], key=lambda r: r['id']),
        'findings': sorted(({'id': f['id'], 'what': f['what']} for f in doc['open_findings']), key=lambda r: r['id']),
        'stops': doc['intentional_stops'],
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
        prs = json.loads(command([GH, 'pr', 'list', '--repo', REPO, '--head', BRANCH, '--state', 'open',
                                  '--json', 'number,headRefOid,isDraft']))
        if len(prs) > 1 or (prs and prs[0]['isDraft']):
            raise RuntimeError('Observation PR needs operator attention')
        remote_ref = 'refs/remotes/origin/' + BRANCH
        remote_sha = git(['for-each-ref', '--format=%(objectname)', remote_ref], checkout)
        if remote_sha and not re.fullmatch('[0-9a-f]{40}', remote_sha):
            raise RuntimeError('Unexpected observation branch identity')
        start = 'origin/main'
        if prs:
            if prs[0]['headRefOid'] != remote_sha:
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
                summary = json.loads(observe(work))
                summary['temporary_ledger_written'] = summary.pop('written')
                after = json.loads((work / LEDGER).read_text())
                check_paths(git(['diff', '--name-only'], work).splitlines())
                command([NODE, 'scripts/check-routine-runs.mjs', '--check'], cwd=work)
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
                                    'モデル呼出・予定変更・認証変更はありません。意図的な停止を保持し、'
                                    'SUCCEEDEDを出荷・投稿・依頼達成とは数えません。\n\n'
                                    '観測時刻: ' + after['observed_at'] + '\n')
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
                              'reason': str(error) if isinstance(error, RuntimeError) else 'Observation unavailable'}))
            raise SystemExit(1)
