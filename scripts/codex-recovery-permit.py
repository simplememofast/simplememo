#!/usr/bin/env python3
"""Owner-authorized exception for one future native Obsidian original turn.

Permission and consumption stay private. This does not edit the failure ledger,
repair limit, emergency stop or scheduler. The repository verifies the scope of
the retained owner decision; a local hash is not independent human authentication.
"""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import unittest
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
TARGET = 'ap-20260920-actions-codex-01a0bb78-4965-7242-bedf-29a93d1b0bf9'
REPAIR = 'e297acb927e4e9ba7887b359e44585d913149342'
SCHEDULE = 'FREQ=DAILY;BYHOUR=6;BYMINUTE=0;BYSECOND=0'
JST = dt.timezone(dt.timedelta(hours=9))
EXPECTED_ROWS = {
    TARGET: '7e52bd03557e06bb77b95f8a9cc136fad96f9f1d5af944e6f8998342d55ed2fc',
    'ap-20260907-actions': '7a3de1bff0a074216a168c34f8f1d189ce9f005f62439aba735c02c15a4187a6',
    'ap-20260911-ccr-0920-codex-01a08e7c-1a0e-7003-b3af-fb72dfc4ef9a':
        '09c14513bf2aac01e48be10a1c40e1a57803de66f97bf15c3bf30189d39483d6',
    'ap-20260919-actions-35415451723': '077dbb6a612b336d45ee22365e2ab59bf0548a95c93fc086632451e088b929a1',
}
PERMIT_KEYS = {'version', 'automation_id', 'route', 'date_jst', 'scheduled_slot',
               'target_run_id', 'repair_merge_sha', 'approved_at', 'authorization_sha256'}
UUID = re.compile(r'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
HASH = re.compile(r'^[a-f0-9]{64}$')


def digest(doc):
    return hashlib.sha256(json.dumps(doc, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def require(condition):
    if not condition:
        raise ValueError('native recovery evidence unavailable or mismatched')


def stamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None)
    return parsed


def private_read(file):
    info = file.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_size < 65536)
    return file.read_bytes()


def observer():
    spec = importlib.util.spec_from_file_location('recovery_observer', ROOT / 'scripts/codex-routine-observer.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def native_origin(codex_dir, native, with_records=False):
    """Read the app-server submission, never infer origin from clock or prompt.

    The desktop sends automation_cron_scheduled or automation_cron_run_now in
    TurnStartOptions. Missing/changed runtime logging fails closed. The body
    remains private; only its hash and identifiers enter the consumption audit.
    """
    tid, turn = native['thread_id'], native['original_turn_id']
    require(UUID.fullmatch(tid) and UUID.fullmatch(turn))
    connection = sqlite3.connect((codex_dir / 'logs_2.sqlite').resolve().as_uri() + '?mode=ro', uri=True)
    try:
        connection.execute('PRAGMA query_only=ON')
        records = connection.execute(
            "SELECT id,feedback_log_body FROM logs WHERE thread_id=? AND target=? "
            "AND feedback_log_body LIKE ? LIMIT 101",
            (tid, 'codex_core::session::handlers', '%Submission sub=Submission { id: "' + turn + '", op: TurnInput {%')).fetchall()
    finally:
        connection.close()
    origin = submission_origin(native, records)
    return (origin, records) if with_records else origin


def submission_origin(native, records):
    tid, turn = native['thread_id'], native['original_turn_id']
    require(0 < len(records) <= 100)
    prefix = 'session_loop{thread_id=' + tid + '}: Submission sub=Submission { id: "' + turn + '", op: TurnInput { '
    evidence = []
    for ident, body in records:
        # Rust Debug escapes quotes in input strings. An unescaped options
        # field cannot be supplied by the user message or a quoted log excerpt.
        require(body.startswith(prefix) and body.endswith('residency_guard: None }'))
        matches = re.findall(r', start: TurnStartOptions \{ turn_trigger: Some\("([a-z_]+)"\), '
                             r'final_output_json_schema: None, service_tier: (?:None|Some\("[a-z_]+"\)), '
                             r'parent_turn_id: None, root_turn_id: None, cyber_access_program: None \}, '
                             r'additional_context: \{\}, responsesapi_client_metadata: Some\(\{"source": "automation"\}\), '
                             r'trace: None \}, mode: StartOrSteer, reply: Sender \{', body)
        require(matches == ['automation_cron_scheduled'])
        evidence.append({'log_id': ident, 'sha256': hashlib.sha256(body.encode()).hexdigest()})
    return {'thread_id': tid, 'turn_id': turn, 'trigger': 'automation_cron_scheduled', 'records': evidence}


def origin_for_attempt(folder, permit, native, codex_dir):
    """A consumed original turn may reuse the sealed private raw submission.

    Runtime logs are pruned while a run is still active. An unconsumed cache is
    never an admission source: the first admission still needs the live log.
    """
    sealed = digest(permit)
    consumed = folder / ('consumed-' + sealed + '.json')
    if consumed.exists() or consumed.is_symlink():
        binding = json.loads(private_read(consumed))
        retained = json.loads(private_read(folder / ('origin-' + sealed + '.json')))
        require(retained['thread_id'] == native['thread_id'] and retained['turn_id'] == native['original_turn_id'])
        origin = submission_origin(native, retained['records'])
        require(binding['native_origin_sha256'] == digest(origin)
                and binding['thread_id'] == native['thread_id'] and binding['turn_id'] == native['original_turn_id'])
        return origin, None
    origin, records = native_origin(codex_dir, native, with_records=True)
    return origin, {'thread_id': native['thread_id'], 'turn_id': native['original_turn_id'], 'records': records}


def evaluate(permit, authorization, native, scheduler, analysis, rows, stop, now, repair_ok):
    """Scope validation; reservation is a separate atomic operation."""
    require(type(permit) is dict and set(permit) == PERMIT_KEYS)
    require(permit['version'] == 1 and type(permit['version']) is int
            and permit['automation_id'] == 'obsidian' and permit['route'] == 'actions'
            and permit['target_run_id'] == TARGET and permit['repair_merge_sha'] == REPAIR)
    require(type(permit['authorization_sha256']) is str and HASH.fullmatch(permit['authorization_sha256'])
            and hashlib.sha256(authorization).hexdigest() == permit['authorization_sha256'])
    auth = json.loads(authorization)
    require(auth.get('decision') == 'allow_one_future_native_primary_run'
            and auth.get('approved_at') == permit['approved_at']
            and auth.get('scheduled_slot') == permit['scheduled_slot']
            and auth.get('target_run_id') == TARGET
            and auth.get('permanent_resume') is False
            and auth.get('user_message') == 'つづけて')
    approved = stamp(permit['approved_at'])
    slot = stamp(permit['scheduled_slot'])
    require(slot.astimezone(JST).isoformat() == permit['date_jst'] + 'T06:00:00+09:00'
            and approved < slot <= now < slot + dt.timedelta(minutes=90))
    require(scheduler['automation_id'] == 'obsidian' and scheduler['status'] == 'IN_PROGRESS'
            and scheduler['kind'] == 'cron' and scheduler['enabled'] == 'ACTIVE'
            and scheduler['rrule'] == SCHEDULE)
    started = dt.datetime.fromtimestamp(scheduler['created_at'] / 1000, dt.timezone.utc)
    require(slot <= started <= now and started < slot + dt.timedelta(minutes=90)
            and scheduler['first_slot_thread'] == native['thread_id'])
    origin = scheduler['native_origin']
    require(origin['thread_id'] == native['thread_id'] and origin['turn_id'] == native['original_turn_id']
            and origin['trigger'] == 'automation_cron_scheduled' and 0 < len(origin['records']) <= 100
            and all(type(r['log_id']) is int and HASH.fullmatch(r['sha256']) for r in origin['records']))
    require(native['automation_id'] == 'obsidian' and native['state'] == 'in_progress'
            and UUID.fullmatch(native['thread_id'])
            and native['latest_turn']['turn_id'] == native['original_turn_id']
            and native['original_turn']['state'] == 'in_progress')
    turn_start = stamp(native['original_turn']['started_at'])
    require(started <= turn_start <= now and turn_start - started <= dt.timedelta(minutes=5))
    prior = native.get('gate_receipt')
    require(prior is None or prior['admitted'] is True)
    require(stop.get('stopped') is False and stop.get('agents', {}).get('actions', {}).get('stopped') is False)
    require(repair_ok is True and analysis.get('problems') == [] and analysis.get('limit') == 3
            and len(analysis.get('escalate', [])) == 1)
    target = analysis['escalate'][0]
    require(target.get('run_id') == TARGET and target.get('route') == 'actions'
            and target.get('failure_class') == 'no_artifact'
            and target.get('repair_attempts_for_class') == 3 and target.get('escalate') is True)
    for ident, expected in EXPECTED_ROWS.items():
        matches = [r for r in rows if r.get('run_id') == ident]
        require(len(matches) == 1 and digest(matches[0]) == expected)
    return {'version': 1, 'permit_sha256': digest(permit), 'thread_id': native['thread_id'],
            'turn_id': native['original_turn_id'], 'scheduled_slot': permit['scheduled_slot'],
            'target_run_id': TARGET, 'native_origin_sha256': digest(origin)}


def write_once(file, value):
    content = (json.dumps(value, sort_keys=True, ensure_ascii=False) + '\n').encode()
    require(len(content) < 65536)
    try:
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        require(json.loads(private_read(file)) == json.loads(content))
        return
    with os.fdopen(fd, 'wb') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def reserve(folder, binding):
    """The first admitted owner wins. A partial or changed record fails closed."""
    write_once(folder / ('consumed-' + binding['permit_sha256'] + '.json'), binding)


def recovery_snapshot(snapshot, recovery):
    # The caller has already validated every field with the existing gate.
    effective = json.loads(json.dumps(snapshot))
    if recovery['installed'] and recovery.get('required', True):
        state = effective['state']
        if not recovery['allowed'] and not state['agentStopped']:
            state['agentStopped'] = True
            state['agentStopReason'] = 'repair_limit'
        elif recovery['allowed'] and state['agentStopped'] and state.get('agentStopReason') == 'repair_limit':
            state['agentStopped'] = False
    return effective


def recovery_status(root=ROOT, home=None, codex_dir=None, native=None, clock=None):
    """No permit means unchanged behavior; any invalid installed permit is denied."""
    home = home or Path.home()
    codex_dir = codex_dir or home / '.codex'
    folder = home / '.config/simplememo/company-os/recovery/native-actions'
    file = folder / 'permit.json'
    if not file.exists() and not file.is_symlink():
        return {'installed': False, 'allowed': False, 'reason': 'no_native_recovery_permit'}
    try:
        info = folder.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
                and stat.S_IMODE(info.st_mode) == 0o700 and folder.resolve() == folder.absolute()
                and root.resolve() not in folder.resolve().parents)
        permit = json.loads(private_read(file))
        authorization = private_read(folder / 'owner-authorization.json')
        tid = os.environ.get('CODEX_THREAD_ID', '')
        require(UUID.fullmatch(tid) is not None)
        clock = clock or (lambda: dt.datetime.now(dt.timezone.utc))
        native = native or observer().thread_state(codex_dir, tid)
        require(native['thread_id'] == tid)
        result = subprocess.run(['node', str(root / 'scripts/autopilot-selfheal.mjs'), '--json'],
                                capture_output=True, text=True, timeout=15)
        require(result.returncode == 0)
        analysis = json.loads(result.stdout)
        if not any(t.get('route') == 'actions' for t in analysis.get('escalate', [])):
            return {'installed': True, 'allowed': False, 'required': False, 'reason': 'no_actions_containment'}
        stop = json.loads((root / 'data/emergency-stop.json').read_text())
        rows = json.loads((root / 'data/autopilot-runs.json').read_text())['runs']
        ancestor = subprocess.run(['git', 'merge-base', '--is-ancestor', REPAIR, 'HEAD'], cwd=root,
                                  capture_output=True, timeout=5)
        require(ancestor.returncode == 0)
        regression = subprocess.run(['node', '--test', 'growth/lib/measurement-support.test.mjs'], cwd=root,
                                    capture_output=True, timeout=30)
        # Refresh live turn and stop after subprocess checks. Expiry is checked
        # immediately before reservation and again before permission is returned.
        native = observer().thread_state(codex_dir, tid)
        stop = json.loads((root / 'data/emergency-stop.json').read_text())
        connection = sqlite3.connect((codex_dir / 'sqlite/codex-dev.db').resolve().as_uri() + '?mode=ro', uri=True)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute('PRAGMA query_only=ON')
            connection.execute('BEGIN')
            result = connection.execute('SELECT r.automation_id,r.status,r.created_at,a.kind,a.status enabled,a.rrule '
                'FROM automation_runs r JOIN automations a ON a.id=r.automation_id WHERE r.thread_id=?', (tid,)).fetchall()
            require(len(result) == 1)
            scheduler = dict(result[0])
            slot = stamp(permit['scheduled_slot'])
            first = connection.execute('SELECT thread_id FROM automation_runs WHERE automation_id=? AND created_at>=? '
                'AND created_at<? ORDER BY created_at,thread_id LIMIT 1',
                ('obsidian', int(slot.timestamp() * 1000), int((slot + dt.timedelta(days=1)).timestamp() * 1000))).fetchone()
            scheduler['first_slot_thread'] = first['thread_id'] if first else None
        finally:
            connection.close()
        scheduler['native_origin'], retained = origin_for_attempt(folder, permit, native, codex_dir)
        binding = evaluate(permit, authorization, native, scheduler, analysis, rows, stop, clock(),
                           regression.returncode == 0)
        if retained is not None:
            write_once(folder / ('origin-' + binding['permit_sha256'] + '.json'), retained)
        reserve(folder, binding)
        require(stamp(permit['scheduled_slot']) <= clock() < stamp(permit['scheduled_slot']) + dt.timedelta(minutes=90))
        return {'installed': True, 'allowed': True, 'required': True, 'reason': 'owner_one_native_run', **binding}
    except Exception:
        # Never print local paths, owner text, transcript bodies or arbitrary exceptions.
        return {'installed': True, 'allowed': False, 'required': True, 'reason': 'native_recovery_evidence_unverified'}


class RecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Freeze the owner-approved historical inputs. Later genuine failures
        # must affect production admission, never this simulated eligible slot.
        cls.historical = {name: json.loads(subprocess.check_output(
            ['git', 'show', REPAIR + ':data/' + name + '.json'], cwd=ROOT, text=True))
            for name in ['autopilot-runs', 'authority-matrix', 'escalation-rules']}

    def storage_fixture(self, home, value):
        root = home / 'repository'
        root.mkdir()
        subprocess.run(['git', 'init', '--quiet', str(root)], check=True)
        # Share read-only objects, with an independent HEAD/index and files.
        objects = Path(subprocess.check_output(['git', 'rev-parse', '--git-path', 'objects'],
                                               cwd=ROOT, text=True).strip())
        if not objects.is_absolute(): objects = ROOT / objects
        (root / '.git/objects/info/alternates').write_text(str(objects.resolve()) + '\n')
        subprocess.run(['git', 'update-ref', 'HEAD', REPAIR], cwd=root, check=True)
        for name, doc in self.historical.items():
            file = root / ('data/' + name + '.json'); file.parent.mkdir(exist_ok=True)
            file.write_text(json.dumps(doc))
        (root / 'data/emergency-stop.json').write_text(json.dumps(value['stop']))
        # Exercise current production readers and the real bounded-support
        # regressions against the isolated repository, without remote writes.
        for name in ['scripts/autopilot-selfheal.mjs', 'scripts/lib/selftest.mjs',
                     'growth/lib/measurement-support.test.mjs', 'growth/lib/measurement-support.mjs',
                     'growth/lib/experiment-overlap.mjs', 'growth/lib/experiment-coexistence.mjs',
                     'growth/lib/ledger.mjs']:
            file = root / name; file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, file)
        codex = home / '.codex'; (codex / 'sqlite').mkdir(parents=True)
        db = sqlite3.connect(codex / 'sqlite/codex-dev.db')
        db.executescript('CREATE TABLE automations(id,status,kind,rrule); '
                        'CREATE TABLE automation_runs(thread_id,automation_id,status,created_at);')
        db.execute('INSERT INTO automations VALUES(?,?,?,?)', ('obsidian', 'ACTIVE', 'cron', SCHEDULE))
        db.execute('INSERT INTO automation_runs VALUES(?,?,?,?)',
                   (value['native']['thread_id'], 'obsidian', 'IN_PROGRESS', value['scheduler']['created_at']))
        db.commit(); db.close(); self.write_origin(codex, value['native'])
        folder = home / '.config/simplememo/company-os/recovery/native-actions'
        folder.mkdir(parents=True, mode=0o700)
        (folder / 'permit.json').write_text(json.dumps(value['permit']))
        (folder / 'owner-authorization.json').write_bytes(value['authorization'])
        for file in folder.iterdir(): file.chmod(0o600)
        return root, codex, folder

    def regression_already_verified(self):
        # The first live-storage integration runs the real repository regression.
        # Retention/expiry variants exercise their own boundary, without repeating
        # that unchanged suite for each simulated clock or corrupt private file.
        real_run = subprocess.run
        def checks(args, **kwargs):
            if args == ['node', '--test', 'growth/lib/measurement-support.test.mjs']:
                return subprocess.CompletedProcess(args, 0, stdout=b'', stderr=b'')
            return real_run(args, **kwargs)
        return patch(__name__ + '.subprocess.run', side_effect=checks)

    def fixture(self):
        now = stamp('2026-09-30T21:01:00Z')
        slot = '2026-10-01T06:00:00+09:00'
        auth = json.dumps({'decision': 'allow_one_future_native_primary_run', 'approved_at': '2026-09-29T23:50:00Z',
            'scheduled_slot': slot, 'target_run_id': TARGET, 'permanent_resume': False, 'user_message': 'つづけて'}).encode()
        permit = {'version': 1, 'automation_id': 'obsidian', 'route': 'actions', 'date_jst': '2026-10-01',
            'scheduled_slot': slot, 'target_run_id': TARGET, 'repair_merge_sha': REPAIR,
            'approved_at': '2026-09-29T23:50:00Z', 'authorization_sha256': hashlib.sha256(auth).hexdigest()}
        tid = '00000000-0000-0000-0000-000000000001'
        turn = {'turn_id': '00000000-0000-0000-0000-000000000002',
                'started_at': '2026-09-30T21:00:30Z', 'state': 'in_progress'}
        native = {'thread_id': tid, 'automation_id': 'obsidian', 'state': 'in_progress',
            'latest_turn': turn, 'original_turn': turn, 'original_turn_id': turn['turn_id'], 'gate_receipt': None}
        scheduler = {'automation_id': 'obsidian', 'status': 'IN_PROGRESS', 'kind': 'cron', 'enabled': 'ACTIVE',
            'rrule': SCHEDULE, 'created_at': int(stamp('2026-09-30T21:00:20Z').timestamp() * 1000), 'first_slot_thread': tid}
        scheduler['native_origin'] = {'thread_id': tid, 'turn_id': turn['turn_id'],
            'trigger': 'automation_cron_scheduled', 'records': [{'log_id': 1, 'sha256': 'a' * 64}]}
        analysis = {'problems': [], 'limit': 3, 'escalate': [{'run_id': TARGET, 'route': 'actions',
            'failure_class': 'no_artifact', 'repair_attempts_for_class': 3, 'escalate': True}]}
        rows = [r for r in json.loads(json.dumps(self.historical['autopilot-runs']))['runs']
                if r['run_id'] in EXPECTED_ROWS]
        return dict(permit=permit, authorization=auth, native=native, scheduler=scheduler, analysis=analysis, rows=rows,
                    stop={'stopped': False, 'agents': {'actions': {'stopped': False}}}, now=now, repair_ok=True)

    def test_actual_failure_and_repair_seal(self):
        value = self.fixture()
        self.assertEqual(evaluate(**value)['target_run_id'], TARGET)
        for ident in EXPECTED_ROWS:
            bad = self.fixture()
            next(r for r in bad['rows'] if r['run_id'] == ident)['outcome'] = 'shipped-unverified'
            with self.assertRaises(ValueError):
                evaluate(**bad)

    def test_denied_identities_stops_slots_and_failure_evidence(self):
        cases = [
            ('permit', 'automation_id', 'obsidian-2'), ('permit', 'route', 'owner-session'),
            ('permit', 'target_run_id', 'other'), ('permit', 'repair_merge_sha', '0' * 40),
            ('permit', 'version', True), ('permit', 'authorization_sha256', '0' * 64),
            ('permit', 'date_jst', '2026-09-30'), ('permit', 'approved_at', '2026-10-01T00:00:00Z'),
            ('native', 'automation_id', 'other'), ('native', 'state', 'unknown'),
            ('native', 'original_turn_id', 'other'), ('native', 'gate_receipt', {'admitted': False}),
            ('scheduler', 'kind', 'heartbeat'), ('scheduler', 'enabled', 'PAUSED'),
            ('scheduler', 'status', 'ARCHIVED'), ('scheduler', 'rrule', 'FREQ=HOURLY'),
            ('scheduler', 'first_slot_thread', 'other'), ('scheduler', 'created_at', 1),
            ('scheduler', 'native_origin', None),
            ('analysis', 'limit', 4), ('analysis', 'problems', ['unreadable']),
            ('analysis', 'escalate', []), ('stop', 'stopped', True),
        ]
        for section, key, replacement in cases:
            with self.subTest(section=section, key=key):
                value = self.fixture(); value[section][key] = replacement
                with self.assertRaises((ValueError, KeyError, TypeError)):
                    evaluate(**value)
        for when in ['2026-09-30T20:59:59Z', '2026-09-30T22:30:00Z', '2026-10-01T21:01:00Z']:
            value = self.fixture(); value['now'] = stamp(when)
            with self.assertRaises(ValueError): evaluate(**value)
        for key, replacement in [('repair_ok', False), ('authorization', b'{}')]:
            value = self.fixture(); value[key] = replacement
            with self.assertRaises(ValueError): evaluate(**value)
        value = self.fixture(); value['stop']['agents']['actions']['stopped'] = True
        with self.assertRaises(ValueError): evaluate(**value)
        value = self.fixture(); value['analysis']['escalate'].append(value['analysis']['escalate'][0].copy())
        with self.assertRaises(ValueError): evaluate(**value)

    def test_durable_same_turn_recheck_and_different_owner_collision(self):
        binding = evaluate(**self.fixture())
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp); reserve(folder, binding); reserve(folder, binding)
            file = next(folder.iterdir())
            self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)
            changed = {**binding, 'thread_id': '00000000-0000-0000-0000-000000000003'}
            with self.assertRaises(ValueError): reserve(folder, changed)
            changed = {**binding, 'turn_id': '00000000-0000-0000-0000-000000000004'}
            with self.assertRaises(ValueError): reserve(folder, changed)
            file.write_text('')
            with self.assertRaises(ValueError): reserve(folder, binding)

    def test_missing_insecure_or_manual_installation_is_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            self.assertFalse(recovery_status(home=home)['installed'])
            folder = home / '.config/simplememo/company-os/recovery/native-actions'
            folder.mkdir(parents=True, mode=0o700)
            file = folder / 'permit.json'; file.write_text(json.dumps(self.fixture()['permit'])); file.chmod(0o644)
            self.assertFalse(recovery_status(home=home)['allowed'])
            file.chmod(0o600)
            with patch.dict(os.environ, {'CODEX_THREAD_ID': ''}):
                self.assertFalse(recovery_status(home=home)['allowed'])

    def test_live_scheduler_storage_and_atomic_consumption(self):
        # Synthetic scheduler and frozen ledger; current production readers and
        # actual regressions still check every boundary of the eligible case.
        value = self.fixture()
        with tempfile.TemporaryDirectory() as tmp:
            root, codex, folder = self.storage_fixture(Path(tmp).resolve(), value)
            tid = value['native']['thread_id']
            home = root.parent
            with patch.dict(os.environ, {'CODEX_THREAD_ID': tid}), patch(__name__ + '.observer') as obs:
                obs.return_value.thread_state.return_value = value['native']
                result = recovery_status(root=root, home=home, codex_dir=codex, native=value['native'], clock=lambda: value['now'])
            self.assertTrue(result['allowed'], result)
            self.assertEqual(len(list(folder.glob('consumed-*.json'))), 1)
            # Production runtime prunes the initial log during long turns.
            # Only an already-consumed attempt can reuse its retained original.
            db = sqlite3.connect(codex / 'logs_2.sqlite'); db.execute('DELETE FROM logs'); db.commit(); db.close()
            with patch.dict(os.environ, {'CODEX_THREAD_ID': tid}), patch(__name__ + '.observer') as obs, self.regression_already_verified():
                obs.return_value.thread_state.return_value = value['native']
                result = recovery_status(root=root, home=home, codex_dir=codex, native=value['native'], clock=lambda: value['now'])
            self.assertTrue(result['allowed'], result)
            native = {**value['native'], 'gate_receipt': {'admitted': False}}
            with patch.dict(os.environ, {'CODEX_THREAD_ID': tid}), patch(__name__ + '.observer') as obs, self.regression_already_verified():
                obs.return_value.thread_state.return_value = native
                result = recovery_status(root=root, home=home, codex_dir=codex, native=native, clock=lambda: value['now'])
            self.assertFalse(result['allowed'])
            self.assertEqual(len(list(folder.glob('consumed-*.json'))), 1)
            retained = next(folder.glob('origin-*.json'))
            cached = json.loads(retained.read_text()); cached['records'][0][1] = cached['records'][0][1].replace('合成ログ', '改変ログ')
            retained.write_text(json.dumps(cached))
            with patch.dict(os.environ, {'CODEX_THREAD_ID': tid}), patch(__name__ + '.observer') as obs, self.regression_already_verified():
                obs.return_value.thread_state.return_value = value['native']
                result = recovery_status(root=root, home=home, codex_dir=codex, native=value['native'], clock=lambda: value['now'])
            self.assertFalse(result['allowed'])

    def write_origin(self, codex, native, trigger='automation_cron_scheduled', quoted=False):
        body = ('session_loop{thread_id=' + native['thread_id'] + '}: Submission sub=Submission { id: "'
            + native['original_turn_id'] + '", op: TurnInput { request: TurnInputRequest { input: [Text { text: "合成ログ" }], '
            'start: TurnStartOptions { turn_trigger: Some("' + trigger + '"), final_output_json_schema: None, '
            'service_tier: None, parent_turn_id: None, root_turn_id: None, cyber_access_program: None }, '
            'additional_context: {}, responsesapi_client_metadata: Some({"source": "automation"}), trace: None }, '
            'mode: StartOrSteer, reply: Sender { inner: None } }, trace: None, parent_turn_id: None, '
            'root_turn_id: None, residency_guard: None }')
        if quoted:
            body = body.replace('start: TurnStartOptions', 'text: "start: TurnStartOptions').replace('Some("', 'Some(\\"')
        db = sqlite3.connect(codex / 'logs_2.sqlite')
        db.execute('CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY,thread_id,target,feedback_log_body)')
        db.execute('INSERT INTO logs(thread_id,target,feedback_log_body) VALUES(?,?,?)',
                   (native['thread_id'], 'codex_core::session::handlers', body))
        db.commit(); db.close()

    def test_actual_submission_origin_required(self):
        native = self.fixture()['native']
        for trigger, quoted, allowed in [('automation_cron_scheduled', False, True),
                ('automation_cron_run_now', False, False), ('composer', False, False),
                ('automation_cron_scheduled', True, False)]:
            with self.subTest(trigger=trigger, quoted=quoted), tempfile.TemporaryDirectory() as tmp:
                codex = Path(tmp); self.write_origin(codex, native, trigger, quoted)
                if allowed:
                    self.assertEqual(native_origin(codex, native)['trigger'], trigger)
                else:
                    with self.assertRaises(ValueError): native_origin(codex, native)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(sqlite3.OperationalError): native_origin(Path(tmp), native)

    def test_unconsumed_retained_origin_cannot_admit_or_change_owner(self):
        value = self.fixture(); native = value['native']
        with tempfile.TemporaryDirectory() as tmp:
            codex = Path(tmp) / 'codex'; codex.mkdir()
            folder = Path(tmp) / 'private'; folder.mkdir()
            self.write_origin(codex, native)
            origin, retained = origin_for_attempt(folder, value['permit'], native, codex)
            binding = evaluate(**{**value, 'scheduler': {**value['scheduler'], 'native_origin': origin}})
            write_once(folder / ('origin-' + binding['permit_sha256'] + '.json'), retained)
            write_once(folder / ('origin-' + binding['permit_sha256'] + '.json'), retained)
            db = sqlite3.connect(codex / 'logs_2.sqlite'); db.execute('DELETE FROM logs'); db.commit(); db.close()
            with self.assertRaises(ValueError): origin_for_attempt(folder, value['permit'], native, codex)
            reserve(folder, binding)
            self.assertEqual(origin_for_attempt(folder, value['permit'], native, codex)[0], origin)
            for key in ['thread_id', 'original_turn_id']:
                changed = {**native, key: '00000000-0000-0000-0000-000000000009'}
                with self.assertRaises(ValueError): origin_for_attempt(folder, value['permit'], changed, codex)

    def test_expiry_after_regression_or_reservation_is_denied(self):
        value = self.fixture()
        for times, consumed in [([stamp('2026-09-30T22:30:00Z')], False),
                ([value['now'], stamp('2026-09-30T22:30:00Z')], True)]:
            with tempfile.TemporaryDirectory() as tmp:
                root, codex, folder = self.storage_fixture(Path(tmp).resolve(), value)
                home = root.parent
                tid = value['native']['thread_id']
                with patch.dict(os.environ, {'CODEX_THREAD_ID': tid}), patch(__name__ + '.observer') as obs, self.regression_already_verified():
                    obs.return_value.thread_state.return_value = value['native']
                    result = recovery_status(root=root, home=home, codex_dir=codex, native=value['native'],
                                             clock=iter(times).__next__)
                self.assertFalse(result['allowed'])
                self.assertEqual(bool(list(folder.glob('consumed-*.json'))), consumed)

    def test_repository_faults_deny_without_consuming_permission(self):
        value = self.fixture()
        for fault in ['additional_failure', 'changed_seal', 'missing_ledger', 'missing_repair', 'failed_regression']:
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as tmp:
                root, codex, folder = self.storage_fixture(Path(tmp).resolve(), value)
                file = root / 'data/autopilot-runs.json'
                ledger = json.loads(file.read_text())
                if fault == 'additional_failure':
                    ledger['runs'].append({'run_id': 'fixture-new-failure', 'outcome': 'no_artifact',
                                          'attempted': True, 'failure_class': 'no_artifact', 'route': 'actions'})
                    file.write_text(json.dumps(ledger))
                    analysis = json.loads(subprocess.check_output(
                        ['node', str(root / 'scripts/autopilot-selfheal.mjs'), '--json'], text=True))
                    self.assertEqual(analysis['problems'], [])
                    self.assertEqual({t['run_id'] for t in analysis['escalate']}, {TARGET, 'fixture-new-failure'})
                elif fault == 'changed_seal':
                    next(r for r in ledger['runs'] if r['run_id'] == TARGET)['failure_reason'] = 'changed'
                    file.write_text(json.dumps(ledger))
                elif fault == 'missing_ledger': file.unlink()
                elif fault == 'missing_repair':
                    subprocess.run(['git', 'update-ref', 'HEAD', REPAIR + '^'], cwd=root, check=True)
                else: (root / 'growth/lib/measurement-support.test.mjs').write_text('throw new Error("fixture regression failed");\n')
                with patch.dict(os.environ, {'CODEX_THREAD_ID': value['native']['thread_id']}), patch(__name__ + '.observer') as obs:
                    obs.return_value.thread_state.return_value = value['native']
                    result = recovery_status(root=root, home=root.parent, codex_dir=codex,
                                             native=value['native'], clock=lambda: value['now'])
                self.assertFalse(result['allowed'], result)
                self.assertEqual(result['reason'], 'native_recovery_evidence_unverified')
                self.assertEqual(list(folder.glob('consumed-*.json')), [])
                self.assertEqual(list(folder.glob('origin-*.json')), [])

    def test_effective_gate_retains_budget_claim_stop_and_unknown_checks(self):
        current = dt.datetime.now(dt.timezone.utc)
        snapshot = {'schema_version': 1, 'task_id': self.fixture()['native']['thread_id'],
            'observed_at': current.isoformat(), 'state': {'route': 'actions',
            'todayJst': current.astimezone(JST).date().isoformat(), 'credentialsAvailable': True,
            'emergencyStop': False, 'agentStopped': True, 'agentStopReason': 'repair_limit',
            'githubApiReachable': True, 'budgetOver': False, 'runCapOverrun': False,
            'branchClaimed': False, 'prTodayExists': False, 'prodStatusDate': '2026-09-20',
            'mainStatusDate': '2026-09-20', 'primaryRunStatus': 'none'}}
        recovery = {'installed': True, 'allowed': True, 'required': True}
        def gate(change=None):
            effective = recovery_snapshot(snapshot, recovery)
            effective['state'].update(change or {})
            with tempfile.NamedTemporaryFile('w', suffix='.json') as stream:
                json.dump(effective, stream); stream.flush()
                result = subprocess.run(['node', str(ROOT / 'scripts/codex-autopilot-preflight.mjs'),
                                         '--input', stream.name], capture_output=True, text=True)
            return json.loads(result.stdout)['run'] if result.returncode == 0 else False
        self.assertTrue(gate())
        self.assertTrue(snapshot['state']['agentStopped'])
        snapshot['state']['agentStopReason'] = 'human_stop'
        self.assertFalse(gate())
        snapshot['state']['agentStopReason'] = None
        self.assertFalse(gate())
        snapshot['state']['agentStopReason'] = 'repair_limit'
        for change in [{'emergencyStop': True}, {'budgetOver': True}, {'runCapOverrun': True},
                       {'branchClaimed': True}, {'prTodayExists': True}, {'primaryRunStatus': 'in_progress'},
                       {'credentialsAvailable': False}, {'githubApiReachable': False},
                       {'mainStatusDate': snapshot['state']['todayJst']}, {'primaryRunStatus': None}]:
            with self.subTest(change=change): self.assertFalse(gate(change))


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        unittest.main(argv=[__file__])
    else:
        print(json.dumps(recovery_status()))
