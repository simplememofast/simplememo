#!/usr/bin/env python3
"""Retired (2026-10-20): the macOS launchd clock of the Routine Observer.

The owner retired this hourly local observer. Nothing it observed was live: the
registered Claude routines were all unavailable and the Codex automations were
all paused. data/routine-runs.json now carries an explicit retired observation
state (observation_retirement); the checks report "retired - not observed" and
the writers refuse while it is present.

This file stays so that the old flags fail loudly instead of doing anything:
--once, --probe and --install print one "retired" JSON record and exit 2. They
touch no file, git, gh, node, Keychain or service manager. --selftest checks
exactly that and exits non-zero on failure. Removing a job that is still
installed is plain shell, run by the owner; see docs/routine-observer.md.

Standard library only, and deliberately nothing that can start a process or
write a file. The structural test below keeps it that way.
"""
import argparse
import ast
import contextlib
import io
import json
import sys
import unittest
from unittest import mock

LABEL = 'com.simplememo.routine-observer'
LEDGER = 'data/routine-runs.json'
MARKER = 'observation_retirement'
GUIDE = 'docs/routine-observer.md'
MODES = ('once', 'probe', 'install')
RETIRED_EXIT = 2


def build_parser():
    parser = argparse.ArgumentParser(description='Retired local Routine Observer clock. See ' + GUIDE + '.')
    group = parser.add_mutually_exclusive_group(required=True)
    for flag in MODES + ('selftest',):
        group.add_argument('--' + flag, action='store_true')
    return parser


def retired(mode):
    return {'state': 'retired', 'mode': mode, 'label': LABEL,
            'reason': 'The local launchd routine observer was retired on 2026-10-20; ' + LEDGER
                      + ' records the retired observation state in ' + MARKER,
            'guide': GUIDE}


def main(argv):
    args = build_parser().parse_args(argv)
    if args.selftest:
        program = unittest.main(module=__name__, argv=[sys.argv[0]], exit=False)
        # An emptied or shortened suite must not report success.
        return 0 if program.result.wasSuccessful() and program.result.testsRun >= 4 else 1
    mode = [m for m in MODES if getattr(args, m)][0]
    print(json.dumps(retired(mode)))
    return RETIRED_EXIT


# Everything a retired mode must never reach: processes, file writes, network.
EFFECTS = ['subprocess.run', 'subprocess.Popen', 'subprocess.call', 'subprocess.check_call', 'subprocess.check_output',
           'os.system', 'os.popen', 'os.fork', 'os.execv', 'os.execve', 'os.execvp', 'os.posix_spawn',
           'os.makedirs', 'os.mkdir', 'os.replace', 'os.rename', 'os.remove', 'os.unlink',
           'shutil.copy2', 'shutil.copyfile', 'shutil.rmtree',
           'pathlib.Path.mkdir', 'pathlib.Path.touch', 'pathlib.Path.write_text', 'pathlib.Path.write_bytes',
           'pathlib.Path.open', 'pathlib.Path.unlink', 'pathlib.Path.chmod', 'builtins.open',
           'socket.create_connection', 'urllib.request.urlopen']
BANNED_MODULES = {'subprocess', 'plistlib', 'shutil', 'fcntl', 'tempfile', 'os', 'importlib', 'ctypes', 'pty', 'socket',
                  'selectors', 'getpass'}
BANNED_NAMES = {'__import__', 'exec', 'eval'}
# Concatenated so that this list does not match itself.
NEEDLES = ['auth ' + 'git-credential', 'Launch' + 'Agents', 'Start' + 'Interval', 'launch' + 'ctl',
           'Program' + 'Arguments', 'find-generic-' + 'password', 'CLAUDE_CODE_' + 'OAUTH_TOKEN',
           'scripts/routine-' + 'observer.mjs', 'scripts/codex-routine-' + 'observer.py', 'Codex/routine-' + 'observations']


class SideEffect(BaseException):
    """BaseException, so that an `except Exception` in a retired mode cannot hide it."""


def violations(tree):
    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found += ['import ' + a.name for a in node.names if a.name.split('.')[0] in BANNED_MODULES]
        elif isinstance(node, ast.ImportFrom) and (node.module or '').split('.')[0] in BANNED_MODULES:
            found.append('from ' + node.module)
        elif isinstance(node, ast.Attribute):
            name = node.attr.lower()
            if name in ('system', 'popen', 'fork') or name.startswith(('exec', 'spawn', 'posix_spawn')):
                found.append('.' + node.attr)
        elif isinstance(node, ast.Name) and node.id in BANNED_NAMES:
            found.append(node.id)
        elif isinstance(node, ast.Constant) and isinstance(node.value, (str, bytes)):
            text = node.value if isinstance(node.value, str) else node.value.decode('latin-1')
            found += ['literal ' + n for n in NEEDLES if n in text]
    return found


class Tests(unittest.TestCase):
    def refuse(self, mode):
        calls = []

        def effect(name):
            def blocked(*args, **kwargs):
                calls.append(name)
                raise SideEffect(name)
            return blocked
        out, err = io.StringIO(), io.StringIO()
        with contextlib.ExitStack() as stack:
            for target in EFFECTS:
                stack.enter_context(mock.patch(target, new=effect(target)))
            stack.enter_context(contextlib.redirect_stdout(out))
            stack.enter_context(contextlib.redirect_stderr(err))
            try:
                code = main(['--' + mode])
            except SideEffect as reached:
                self.fail('--' + mode + ' reached ' + str(reached))
        self.assertEqual(calls, [], '--' + mode + ' must not touch processes, files or the network')
        return code, out.getvalue()

    def test_retired_modes_refuse_without_side_effects(self):
        for mode in MODES:
            with self.subTest(mode=mode):
                code, out = self.refuse(mode)
                self.assertEqual(code, RETIRED_EXIT, 'a retired mode must exit non-zero')
                self.assertEqual(len(out.splitlines()), 1)
                record = json.loads(out)
                self.assertEqual(sorted(record), ['guide', 'label', 'mode', 'reason', 'state'])
                self.assertEqual((record['state'], record['mode'], record['label'], record['guide']),
                                 ('retired', mode, LABEL, GUIDE))
                self.assertIn(MARKER, record['reason'])

    def test_parser_keeps_four_exclusive_required_flags_and_rejects_others(self):
        flags = {s for action in build_parser()._actions for s in action.option_strings}
        self.assertEqual(flags, {'-h', '--help', '--once', '--probe', '--install', '--selftest'})
        for argv in [[], ['--once', '--probe'], ['--install', '--selftest'], ['--uninstall'], ['--apply'],
                     ['--once', '--apply']]:
            with self.subTest(argv=argv):
                out, err = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), \
                        self.assertRaises(SystemExit) as stop:
                    main(argv)
                self.assertEqual(stop.exception.code, 2)
                self.assertEqual(out.getvalue(), '', 'a rejected call must not print a record')

    def test_structural_scan_detects_each_banned_shape(self):
        # Source snippets for ast.parse only; none of them is ever executed.
        samples = ['import ' + m for m in sorted(BANNED_MODULES)] + ['from os.path import join', 'x.system(1)',
                   'x.Popen(1)', 'x.execv(1)', 'x.spawnv(1)', 'x.fork()', 'y = ' + 'eval(1)', '__import__(1)']
        samples += ['h = ' + repr(n) for n in NEEDLES] + ['h = ' + repr(n.encode()) for n in NEEDLES]
        for sample in samples:
            with self.subTest(sample=sample):
                self.assertTrue(violations(ast.parse(sample)), 'the scan must detect: ' + sample)

    def test_source_cannot_reach_processes_files_or_the_old_service(self):
        with open(__file__, encoding='utf-8') as source:
            tree = ast.parse(source.read())
        self.assertTrue(any(isinstance(n, ast.Import) for n in ast.walk(tree)), 'the scan must see real imports')
        self.assertEqual(violations(tree), [])


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
