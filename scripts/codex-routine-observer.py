#!/usr/bin/env python3
"""Read registered Codex scheduler runs and their original turn lifecycle.

Local SQLite files and transcripts are opened read-only. Only allowlisted
metadata goes into routine-runs.json; prompts, outputs, paths, errors and costs
never do. A later follow-up cannot turn the initial scheduled failure green.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

REGISTERED = ('obsidian', 'obsidian-2')
ROOT = Path(__file__).resolve().parents[1]
KEY = 'codex_observation'
UUID = re.compile(r'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
HASH = re.compile(r'^[0-9a-f]{64}$')
CALLS = {'function_call', 'custom_tool_call'}
OUTPUTS = {'function_call_output', 'custom_tool_call_output'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def iso(ms):
    require(type(ms) is int and ms > 0, 'Invalid scheduler timestamp')
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def timestamp(value):
    require(isinstance(value, str) and value.endswith('Z'), 'Invalid observation timestamp')
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()


def readonly(path):
    # mode=ro refuses a missing DB instead of silently creating an empty one.
    connection = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA query_only=ON')
    connection.execute('BEGIN')
    return connection


def transcript(raw, thread_id):
    require(raw.endswith(b'\n'), 'Incomplete transcript line')
    turns, active, meta = [], None, False
    for line in raw.splitlines():
        event = json.loads(line)
        payload = event.get('payload', {})
        if event.get('type') == 'session_meta':
            require(payload.get('id') == thread_id, 'Transcript belongs to another thread')
            meta = True
        if event.get('type') == 'event_msg':
            kind = payload.get('type')
            if kind == 'task_started':
                require(active is None, 'Overlapping or missing turn termination')
                turn_id = payload.get('turn_id')
                require(isinstance(turn_id, str) and UUID.fullmatch(turn_id), 'Missing turn identity')
                active = {'turn_id': turn_id, 'started_at': event['timestamp'], 'finished_at': None,
                          'state': 'in_progress', 'tool_calls': 0, 'tool_outputs': 0,
                          'unanswered_calls': 0, 'unattributed_outputs': 0, 'calls': set(), 'outputs': set()}
                require(all(t['turn_id'] != turn_id for t in turns), 'Duplicate turn identity')
                turns.append(active)
            elif kind in ('task_complete', 'turn_aborted'):
                require(active is not None, 'Turn ended without its start')
                require(payload.get('turn_id') == active['turn_id'], 'Termination belongs to another turn')
                active['finished_at'] = event['timestamp']
                active['state'] = 'aborted' if kind == 'turn_aborted' else (
                    'failed' if payload.get('error') else 'completed')
                active = None
        elif event.get('type') == 'response_item' and active is not None:
            kind = payload.get('type')
            if kind in CALLS | OUTPUTS:
                call_id = payload.get('call_id')
                if kind in OUTPUTS and call_id is None:
                    # The runtime injects some tool results without an agent
                    # invocation ID. Retain their count, never invent a match.
                    active['unattributed_outputs'] += 1
                    continue
                require(isinstance(call_id, str) and call_id, 'Missing tool call identity')
                if kind in CALLS:
                    require(call_id not in active['calls'], 'Duplicate tool invocation')
                    active['calls'].add(call_id)
                else:
                    active['outputs'].add(call_id)
    require(meta, 'Transcript identity is absent')
    for turn in turns:
        turn['tool_calls'] = len(turn['calls'])
        # Injected results can precede an invocation in the saved transcript.
        # They do not establish an invocation we did not observe.
        turn['tool_outputs'] = len(turn['calls'] & turn['outputs'])
        turn['unanswered_calls'] = len(turn['calls'] - turn['outputs'])
        del turn['calls'], turn['outputs']
    return {'state': 'observed', 'sha256': hashlib.sha256(raw).hexdigest(),
            'bytes': len(raw), 'turns': turns}


def local_transcript(codex_dir, state, thread_id):
    thread = state.execute('SELECT rollout_path FROM threads WHERE id=?', (thread_id,)).fetchone()
    details = {'state': 'unavailable', 'reason': 'thread_missing', 'sha256': None, 'bytes': None, 'turns': []}
    if not thread:
        return details
    path = Path(thread['rollout_path']).resolve()
    if not any(parent.resolve() in path.parents for parent in (codex_dir / 'sessions', codex_dir / 'archived_sessions')):
        details['reason'] = 'path_outside_session_store'
        return details
    try:
        return transcript(path.read_bytes(), thread_id)
    except (OSError, ValueError, KeyError, TypeError):
        details['reason'] = 'unreadable_or_incomplete_transcript'
        return details


def thread_state(codex_dir, thread_id, now=None):
    """Fresh lifecycle evidence for an exact task, including archived owners."""
    require(isinstance(thread_id, str) and UUID.fullmatch(thread_id), 'Invalid thread identity')
    observed = now or dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    scheduler = readonly(codex_dir / 'sqlite/codex-dev.db')
    state = readonly(codex_dir / 'state_5.sqlite')
    try:
        matches = scheduler.execute('SELECT automation_id FROM automation_runs WHERE thread_id=?', (thread_id,)).fetchall()
        require(len(matches) <= 1, 'Ambiguous scheduled execution')
        automation_id = matches[0]['automation_id'] if matches else None
        details = local_transcript(codex_dir, state, thread_id)
    finally:
        scheduler.close(); state.close()
    turns = details['turns']
    last = turns[-1] if turns else None
    status = 'unknown' if not last else ('in_progress' if last['state'] == 'in_progress' else 'completed')
    require(not last or timestamp(last['finished_at'] or last['started_at']) <= timestamp(observed), 'Future turn lifecycle')
    return {'thread_id': thread_id, 'automation_id': automation_id,
            'observed_at': observed, 'state': status,
            'latest_turn': last, 'original_turn_id': turns[0]['turn_id'] if turns else None,
            'gate_receipt': gate_receipt(codex_dir, {'thread_id': thread_id, 'transcript': details}),
            'transcript_sha256': details['sha256'], 'business_outcome': 'not_inferred'}


def receipt_root(codex_dir):
    return codex_dir / 'simplememo-autopilot-receipts'


def receipt_digest(doc):
    return hashlib.sha256(json.dumps(doc, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def gate_receipt(codex_dir, row):
    file = receipt_root(codex_dir) / (row['thread_id'] + '.json')
    if not file.exists():
        return None
    receipt = json.loads(file.read_text())
    keys(receipt, 'version thread_id turn_id observed_at admitted code input_sha256 script_sha256 sha256')
    body = {k: v for k, v in receipt.items() if k != 'sha256'}
    require(receipt['version'] == 1 and receipt['sha256'] == receipt_digest(body), 'Invalid gate receipt')
    require(receipt['thread_id'] == row['thread_id'] and type(receipt['admitted']) is bool,
            'Gate receipt identity mismatch')
    require(isinstance(receipt['code'], str) and re.fullmatch('[a-z][a-z0-9_]{0,79}', receipt['code']), 'Invalid gate code')
    require(all(HASH.fullmatch(receipt[k]) for k in ['input_sha256', 'script_sha256']), 'Missing gate hashes')
    turns = row['transcript']['turns']
    # Only the original scheduled turn can describe its gate. Later repairs
    # cannot replace the original failure with their successful preflight.
    if not turns or turns[0]['turn_id'] != receipt['turn_id']:
        return None
    first = turns[0]
    require(timestamp(first['started_at']) <= timestamp(receipt['observed_at']), 'Gate predates the turn')
    if first['finished_at']:
        require(timestamp(receipt['observed_at']) <= timestamp(first['finished_at']), 'Gate follows the turn')
    return receipt


def record_preflight(codex_dir, file, now=None, invoke=None):
    import subprocess
    raw = file.read_bytes()
    snapshot = json.loads(raw)
    tid = snapshot['task_id']
    require(os.environ.get('CODEX_THREAD_ID') == tid, 'Preflight must belong to the executing task')
    state = thread_state(codex_dir, tid, now)
    require(state['state'] == 'in_progress', 'Preflight requires a live turn')
    require(state['latest_turn']['turn_id'] == state['original_turn_id'],
            'Only the original scheduled turn may record its preflight')
    require(state['automation_id'] in REGISTERED, 'Preflight requires a registered scheduled execution')
    route = 'actions' if state['automation_id'] == 'obsidian' else 'ccr-0920'
    require(snapshot['state']['route'] == route, 'Preflight route differs from scheduler')
    script = ROOT / 'scripts/codex-autopilot-preflight.mjs'
    runner = invoke or (lambda args: subprocess.run(args, capture_output=True, text=True, timeout=30))
    result = runner(['node', str(script), '--input', str(file)])
    decision = json.loads(result.stdout) if result.returncode == 0 else {'run': False, 'code': 'preflight_error'}
    require(type(decision.get('run')) is bool and isinstance(decision.get('code'), str)
            and re.fullmatch('[a-z][a-z0-9_]{0,79}', decision['code']), 'Preflight decision missing')
    # Once admitted, a later check cannot turn an attempted run into a skip.
    prior = state.get('gate_receipt')
    if prior and prior['admitted']:
        return {'decision': decision, 'receipt_sha256': prior['sha256'], 'recorded_at': prior['observed_at']}
    observed = now or dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    receipt = {'version': 1, 'thread_id': tid, 'turn_id': state['latest_turn']['turn_id'],
               'observed_at': observed, 'admitted': decision['run'], 'code': decision['code'],
               'input_sha256': hashlib.sha256(raw).hexdigest(),
               'script_sha256': hashlib.sha256(script.read_bytes()).hexdigest()}
    receipt['sha256'] = receipt_digest(receipt)
    folder = receipt_root(codex_dir)
    folder.mkdir(mode=0o700, parents=True, exist_ok=True); folder.chmod(0o700)
    target = folder / (tid + '.json')
    with tempfile.NamedTemporaryFile('w', dir=folder, delete=False) as stream:
        temp = Path(stream.name)
        json.dump(receipt, stream); stream.write('\n')
    temp.chmod(0o600); temp.replace(target)
    return {'decision': decision, 'receipt_sha256': receipt['sha256'], 'recorded_at': observed}


def native_observer_origin(observed_at, invoke=None, parent_pid=None, home=None):
    """Verify the live launchd timer, executable and installed launcher identity."""
    if sys.platform != 'darwin':
        return None
    import subprocess
    launcher = (home or Path.home()) / '.local/libexec/simplememo-routine-observer.py'
    domain = f'gui/{os.getuid()}/com.simplememo.routine-observer'
    parent = parent_pid if parent_pid is not None else os.getppid()
    run = invoke or (lambda args: subprocess.run(args, capture_output=True, text=True, timeout=10))
    try:
        installed = launcher.read_bytes()
        if installed != (ROOT / 'scripts/routine-observer-local.py').read_bytes():
            return None
        state = run(['/bin/launchctl', 'print', domain])
        blame = run(['/bin/launchctl', 'blame', domain])
        if state.returncode or blame.returncode or blame.stdout.strip() != 'interval':
            return None
        args = re.search(r'(?m)^\s*arguments = \{\n(.*?)^\s*\}', state.stdout, re.S)
        if not re.search(r'(?m)^\s*pid = ' + str(parent) + r'\s*$', state.stdout) \
                or not re.search(r'(?m)^\s*program = /usr/bin/python3\s*$', state.stdout) \
                or not args or [line.strip() for line in args[1].splitlines() if line.strip()] \
                != ['/usr/bin/python3', str(launcher), '--once']:
            return None
        return {'kind': 'launchd_interval', 'observed_at': observed_at, 'parent_pid': parent,
                'launcher_sha256': hashlib.sha256(installed).hexdigest()}
    except (OSError, subprocess.SubprocessError):
        return None


def validate_detection_receipt(receipt, row, observed):
    keys(receipt, 'version kind observed_at parent_pid launcher_sha256 thread_id turn_id transcript_sha256 sha256')
    first = row['transcript']['turns'][0]
    require(receipt['version'] == 1 and receipt['kind'] == 'launchd_interval'
            and type(receipt['parent_pid']) is int and receipt['parent_pid'] > 1
            and receipt['thread_id'] == row['thread_id'] and receipt['turn_id'] == first['turn_id']
            and first['state'] != 'in_progress'
            and all(HASH.fullmatch(receipt[k]) for k in ['launcher_sha256', 'transcript_sha256'])
            and timestamp(first['finished_at']) <= timestamp(receipt['observed_at']) <= observed
            and receipt['sha256'] == receipt_digest({k: v for k, v in receipt.items() if k != 'sha256'}),
            'Invalid automatic detection receipt')


def observe(codex_dir, previous=None, now=None):
    observed_at = now or dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    origin = native_observer_origin(observed_at)
    prior_runs = {r['thread_id']: r for r in (previous or {}).get('runs', [])}
    scheduler = readonly(codex_dir / 'sqlite/codex-dev.db')
    state = readonly(codex_dir / 'state_5.sqlite')
    placeholders = ','.join('?' for _ in REGISTERED)
    try:
        automations = [dict(r) for r in scheduler.execute(
            'SELECT id,status,kind,next_run_at,last_run_at FROM automations WHERE id IN (' + placeholders + ') ORDER BY id',
            REGISTERED)]
        require({a['id'] for a in automations} == set(REGISTERED), 'Registered automation is missing')
        runs = [dict(r) for r in scheduler.execute(
            'SELECT thread_id,automation_id,status,created_at,updated_at FROM automation_runs '
            'WHERE automation_id IN (' + placeholders + ') ORDER BY created_at,thread_id', REGISTERED)]
        normalized = []
        for row in runs:
            tid = row['thread_id']
            require(isinstance(tid, str) and UUID.fullmatch(tid), 'Invalid scheduler thread identity')
            record = {'thread_id': tid, 'automation_id': row['automation_id'],
                      'scheduler_status': row['status'], 'created_at': iso(row['created_at']),
                      'updated_at': iso(row['updated_at']), 'business_outcome': 'not_inferred'}
            record['transcript'] = local_transcript(codex_dir, state, tid)
            receipt = gate_receipt(codex_dir, record)
            if receipt is not None:
                record['gate_receipt'] = receipt
            prior = prior_runs.get(tid, {})
            if prior.get('detection_receipt'):
                record['detection_receipt'] = prior['detection_receipt']
            else:
                before = prior.get('transcript', {}).get('turns', [])
                turns = record['transcript']['turns']
                if origin and turns and turns[0]['state'] != 'in_progress' \
                        and (not before or before[0]['state'] == 'in_progress'):
                    detection = {**origin, 'version': 1, 'thread_id': tid, 'turn_id': turns[0]['turn_id'],
                                 'transcript_sha256': record['transcript']['sha256']}
                    detection['sha256'] = receipt_digest(detection)
                    record['detection_receipt'] = detection
            normalized.append(record)
    finally:
        scheduler.close()
        state.close()
    for automation in automations:
        for key in ('next_run_at', 'last_run_at'):
            automation[key] = None if automation[key] is None else iso(automation[key])
    result = {'schema_version': 3, 'observed_at': observed_at, 'registered': list(REGISTERED),
              'source': 'local_codex_scheduler_and_session_store', 'scheduler_query_complete': True,
              # launchd's service name does not necessarily reach descendants.
              # Its absence cannot establish that a person started this read.
              'collection_context': 'service_environment_observed' if os.environ.get('XPC_SERVICE_NAME') ==
              'com.simplememo.routine-observer' else 'unidentified_process',
              'automations': automations, 'runs': normalized}
    validate(result, now=observed_at)
    if previous is not None:
        # A source purge or schema change must not erase known scheduled runs.
        current = {r['thread_id']: r for r in normalized}
        for old in previous['runs']:
            require(old['thread_id'] in current, 'Previously observed scheduled run disappeared')
            newer = current[old['thread_id']]
            require(newer['automation_id'] == old['automation_id'] and newer['created_at'] == old['created_at'],
                    'Scheduled run identity changed')
            prior_turns = old['transcript']['turns']
            if prior_turns and prior_turns[0]['state'] != 'in_progress' and old.get('gate_receipt'):
                require(newer.get('gate_receipt') == old['gate_receipt'], 'Closed gate receipt changed')
            new_turns = newer['transcript']['turns']
            require(len(new_turns) >= len(prior_turns), 'Previously observed transcript disappeared')
            for a, b in zip(prior_turns, new_turns):
                require(a['turn_id'] == b['turn_id'] and a['started_at'] == b['started_at'],
                        'Previously observed turn identity changed')
                if a['state'] != 'in_progress':
                    require(a == b, 'Closed turn changed; do not replace the initial failure')
    return result


def keys(value, expected):
    require(isinstance(value, dict) and set(value) == set(expected.split()), 'Unexpected metadata fields')


def validate(doc, now=None):
    keys(doc, 'schema_version observed_at registered source scheduler_query_complete collection_context automations runs')
    require(type(doc['schema_version']) is int and doc['schema_version'] in (1, 2, 3)
            and doc['registered'] == list(REGISTERED), 'Observation scope changed')
    require(doc['source'] == 'local_codex_scheduler_and_session_store' and doc['scheduler_query_complete'] is True,
            'Scheduler inventory is incomplete')
    contexts = ('interactive', 'routine_observer_service') if doc['schema_version'] == 1 else (
        'unidentified_process', 'service_environment_observed')
    require(doc['collection_context'] in contexts,
            'Unknown observer process')
    observed = timestamp(doc['observed_at'])
    clock = timestamp(now) if now else dt.datetime.now(dt.timezone.utc).timestamp()
    require(0 <= clock - observed <= 3 * 86400, 'Codex observation is stale or future')
    require(len(doc['automations']) == len(REGISTERED) and
            {a['id'] for a in doc['automations']} == set(REGISTERED), 'Registered automation is missing')
    for a in doc['automations']:
        keys(a, 'id status kind next_run_at last_run_at')
        require(a['status'] in ('ACTIVE', 'PAUSED') and a['kind'] == 'cron', 'Unknown scheduler configuration')
        if a['last_run_at'] is not None:
            require(timestamp(a['last_run_at']) <= observed, 'Future scheduler execution')
        if a['next_run_at'] is not None:
            timestamp(a['next_run_at'])
    seen = set()
    for run in doc['runs']:
        keys(run, 'thread_id automation_id scheduler_status created_at updated_at business_outcome transcript'
             + (' gate_receipt' if doc['schema_version'] >= 3 and 'gate_receipt' in run else '')
             + (' detection_receipt' if doc['schema_version'] >= 3 and 'detection_receipt' in run else ''))
        if 'detection_receipt' in run:
            validate_detection_receipt(run['detection_receipt'], run, observed)
        if 'gate_receipt' in run:
            receipt = run['gate_receipt']
            keys(receipt, 'version thread_id turn_id observed_at admitted code input_sha256 script_sha256 sha256')
            require(receipt['version'] == 1 and receipt['thread_id'] == run['thread_id']
                    and type(receipt['admitted']) is bool and HASH.fullmatch(receipt['input_sha256'])
                    and HASH.fullmatch(receipt['script_sha256'])
                    and receipt['sha256'] == receipt_digest({k: v for k, v in receipt.items() if k != 'sha256'}), 'Invalid gate receipt')
            require(isinstance(receipt['code'], str) and re.fullmatch('[a-z][a-z0-9_]{0,79}', receipt['code']), 'Invalid gate code')
            first = run['transcript']['turns'][0]
            require(receipt['turn_id'] == first['turn_id'] and timestamp(first['started_at']) <= timestamp(receipt['observed_at']) <= observed
                    and (first['finished_at'] is None or timestamp(receipt['observed_at']) <= timestamp(first['finished_at'])),
                    'Gate receipt is outside the original turn')
        tid = run['thread_id']
        require(isinstance(tid, str) and UUID.fullmatch(tid) and tid not in seen, 'Duplicate or invalid scheduled run')
        seen.add(tid)
        require(run['automation_id'] in REGISTERED, 'Unregistered automation data')
        require(run['scheduler_status'] in ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW',
                                            'ACCEPTED', 'ARCHIVED', 'FAILED', 'ERROR'),
                'Unknown scheduler UI status')
        require(run['business_outcome'] == 'not_inferred', 'Scheduler status is not publication success')
        require(timestamp(run['created_at']) <= timestamp(run['updated_at']) <= observed, 'Invalid run timestamps')
        t = run['transcript']
        if t['state'] == 'unavailable':
            keys(t, 'state reason sha256 bytes turns')
            require(t['reason'] in ('thread_missing', 'path_outside_session_store', 'unreadable_or_incomplete_transcript')
                    and t['sha256'] is None and t['bytes'] is None and t['turns'] == [], 'Unavailable source fabricated')
            continue
        keys(t, 'state sha256 bytes turns')
        require(t['state'] == 'observed' and HASH.fullmatch(t['sha256']) and type(t['bytes']) is int
                and t['bytes'] > 0, 'Missing transcript fingerprint')
        prior_end = timestamp(run['created_at'])
        turn_ids = set()
        for i, turn in enumerate(t['turns']):
            keys(turn, 'turn_id started_at finished_at state tool_calls tool_outputs unanswered_calls unattributed_outputs')
            require(UUID.fullmatch(turn['turn_id']) and turn['turn_id'] not in turn_ids, 'Duplicate or invalid turn')
            turn_ids.add(turn['turn_id'])
            start = timestamp(turn['started_at'])
            require(prior_end <= start <= observed, 'Invalid turn order')
            require(turn['state'] in ('completed', 'failed', 'aborted', 'in_progress'), 'Unknown turn termination')
            if turn['state'] == 'in_progress':
                require(turn['finished_at'] is None and i == len(t['turns']) - 1, 'Open turn is not last')
            else:
                prior_end = timestamp(turn['finished_at'])
                require(start <= prior_end <= observed, 'Invalid turn termination time')
            for count in ('tool_calls', 'tool_outputs', 'unanswered_calls', 'unattributed_outputs'):
                require(type(turn[count]) is int and turn[count] >= 0, 'Invalid tool count')
            require(turn['tool_calls'] == turn['tool_outputs'] + turn['unanswered_calls'], 'Tool results do not match calls')
    return doc


def apply(ledger, codex_dir):
    previous = json.loads(ledger.read_text())
    observed = observe(codex_dir, previous.get(KEY))
    updated = {**previous, KEY: observed}
    # Atomic replacement occurs only after complete DB reads and validation.
    with tempfile.NamedTemporaryFile('w', dir=ledger.parent, delete=False) as stream:
        tmp = Path(stream.name)
        json.dump(updated, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    try:
        os.replace(tmp, ledger)
    finally:
        tmp.unlink(missing_ok=True)
    return summary(observed)


def summary(doc):
    initial = [r['transcript']['turns'][0] for r in doc['runs'] if r['transcript']['turns']]
    return {'observed_at': doc['observed_at'], 'registered': len(doc['automations']), 'runs': len(doc['runs']),
            'collection_context': doc['collection_context'] if doc['schema_version'] >= 2 else 'legacy_unverified',
            'initial_failed': sum(t['state'] in ('failed', 'aborted') for t in initial),
            'unavailable_transcripts': sum(r['transcript']['state'] != 'observed' for r in doc['runs']),
            'publication_success': 'not_inferred'}


class Tests(unittest.TestCase):
    tid = '00000000-0000-0000-0000-000000000001'
    one = '00000000-0000-0000-0000-000000000002'
    two = '00000000-0000-0000-0000-000000000003'
    now = '2026-09-08T05:00:00.000Z'

    def raw(self, failed=True):
        def event(kind, turn, stamp, **extra):
            return {'type': 'event_msg', 'timestamp': '2026-09-08T0' + stamp + ':00.000Z',
                    'payload': {'type': kind, 'turn_id': turn, **extra}}
        records = [{'type': 'session_meta', 'payload': {'id': self.tid, 'cwd': '/private/path'}},
                   event('task_started', self.one, '1:00'),
                   {'type': 'response_item', 'payload': {'type': 'function_call_output', 'output': 'private injected result'}},
                   {'type': 'response_item', 'payload': {'type': 'custom_tool_call', 'call_id': 'call_one', 'input': 'private prompt'}},
                   {'type': 'response_item', 'payload': {'type': 'custom_tool_call_output', 'call_id': 'call_one', 'output': 'private secret'}},
                   event('task_complete', self.one, '1:01', error={'message': 'private error'} if failed else None),
                   event('task_started', self.two, '2:00'),
                   event('task_complete', self.two, '2:01')]
        return b''.join((json.dumps(r) + '\n').encode() for r in records)

    def setup_store(self, root):
        (root / 'sqlite').mkdir()
        (root / 'sessions').mkdir()
        log = root / 'sessions/run.jsonl'
        log.write_bytes(self.raw())
        c = sqlite3.connect(root / 'sqlite/codex-dev.db')
        c.executescript('CREATE TABLE automations (id,status,kind,next_run_at,last_run_at);'
                        'CREATE TABLE automation_runs (thread_id,automation_id,status,created_at,updated_at);')
        for ident in REGISTERED:
            c.execute('INSERT INTO automations VALUES (?,?,?,?,?)', (ident, 'ACTIVE', 'cron', None, None))
        c.execute('INSERT INTO automations VALUES (?,?,?,?,?)', ('unrelated-private', 'ACTIVE', 'cron', None, None))
        start = int(timestamp('2026-09-08T01:00:00.000Z') * 1000)
        c.execute('INSERT INTO automation_runs VALUES (?,?,?,?,?)', (self.tid, 'obsidian-2', 'ARCHIVED', start, start))
        c.execute('INSERT INTO automation_runs VALUES (?,?,?,?,?)',
                  ('00000000-0000-0000-0000-000000000099', 'unrelated-private', 'ARCHIVED', start, start))
        c.commit(); c.close()
        c = sqlite3.connect(root / 'state_5.sqlite')
        c.execute('CREATE TABLE threads (id,rollout_path)')
        c.execute('INSERT INTO threads VALUES (?,?)', (self.tid, str(log)))
        c.commit(); c.close()
        return log

    def test_initial_failure_survives_followup_and_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.setup_store(root)
            doc = observe(root, now=self.now)
            run = doc['runs'][0]
            self.assertEqual(run['scheduler_status'], 'ARCHIVED')
            self.assertEqual([t['state'] for t in run['transcript']['turns']], ['failed', 'completed'])
            self.assertEqual(summary(doc)['initial_failed'], 1)
            self.assertEqual(run['business_outcome'], 'not_inferred')
            self.assertNotIn('private', json.dumps(doc))
            self.assertEqual(run['transcript']['turns'][0]['unanswered_calls'], 0)
            self.assertEqual(run['transcript']['turns'][0]['unattributed_outputs'], 1)

    def test_native_origin_and_first_detection_cannot_relabel_history(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); log = self.setup_store(root)
            launcher = root / '.local/libexec/simplememo-routine-observer.py'
            launcher.parent.mkdir(parents=True)
            launcher.write_bytes((ROOT / 'scripts/routine-observer-local.py').read_bytes())
            state = f'program = /usr/bin/python3\narguments = {{\n/usr/bin/python3\n{launcher}\n--once\n}}\npid = 123\n'
            def invoke(args):
                return SimpleNamespace(returncode=0, stdout='interval' if args[1] == 'blame' else state)
            with patch.object(sys, 'platform', 'darwin'):
                origin = native_observer_origin(self.now, invoke, 123, root)
                self.assertEqual(origin['kind'], 'launchd_interval')
                self.assertIsNone(native_observer_origin(self.now, invoke, 456, root))
                self.assertIsNone(native_observer_origin(self.now,
                    lambda args: SimpleNamespace(returncode=0, stdout='demand' if args[1] == 'blame' else state), 123, root))
                launcher.write_text('changed launcher')
                self.assertIsNone(native_observer_origin(self.now, invoke, 123, root))
            with patch(__name__ + '.native_observer_origin', return_value=None):
                historical = observe(root, now=self.now)
            with patch(__name__ + '.native_observer_origin', return_value=origin):
                self.assertNotIn('detection_receipt', observe(root, historical, now=self.now)['runs'][0])
                log.write_bytes(b'\n'.join(self.raw().splitlines()[:5]) + b'\n')
                pending = observe(root, now=self.now)
                self.assertNotIn('detection_receipt', pending['runs'][0])
                log.write_bytes(self.raw())
                first = observe(root, pending, now=self.now)
                receipt = first['runs'][0]['detection_receipt']
                self.assertEqual(receipt['thread_id'], self.tid)
                self.assertEqual(observe(root, first, now=self.now)['runs'][0]['detection_receipt'], receipt)
                receipt['parent_pid'] += 1
                with self.assertRaisesRegex(ValueError, 'Invalid automatic detection receipt'):
                    validate(first, now=self.now)

    def test_live_and_archived_thread_state_never_infers_business_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); log = self.setup_store(root)
            state = thread_state(root, self.tid, self.now)
            self.assertEqual(state['state'], 'completed')
            self.assertEqual(state['business_outcome'], 'not_inferred')
            self.assertEqual(state['original_turn_id'], self.one)
            log.write_bytes(b'\n'.join(self.raw().splitlines()[:-1]) + b'\n')
            self.assertEqual(thread_state(root, self.tid, self.now)['state'], 'in_progress')
            log.unlink()
            self.assertEqual(thread_state(root, self.tid, self.now)['state'], 'unknown')
            self.assertEqual(thread_state(root, self.two, self.now)['state'], 'unknown')

    def test_preflight_receipt_preserves_admission_and_original_turn(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); log = self.setup_store(root)
            original_open = b'\n'.join(self.raw().splitlines()[:5]) + b'\n'
            log.write_bytes(original_open)
            snapshot = root / 'input.json'
            snapshot.write_text(json.dumps({'task_id': self.tid, 'state': {'route': 'ccr-0920'}}))
            stamp = '2026-09-08T01:00:30.000Z'
            def result(run, code):
                return lambda args: SimpleNamespace(returncode=0, stdout=json.dumps({'run': run, 'code': code}))
            with patch.dict(os.environ, {'CODEX_THREAD_ID': self.tid}):
                stopped = record_preflight(root, snapshot, stamp, result(False, 'skip_budget'))
                self.assertFalse(observe(root, now=stamp)['runs'][0]['gate_receipt']['admitted'])
                admitted = record_preflight(root, snapshot, stamp, result(True, 'run'))
                again = record_preflight(root, snapshot, stamp, result(False, 'skip_budget'))
                self.assertFalse(again['decision']['run'])
                self.assertEqual(again['receipt_sha256'], admitted['receipt_sha256'])
                self.assertNotEqual(stopped['receipt_sha256'], admitted['receipt_sha256'])
                log.write_bytes(self.raw())
                closed = observe(root, now=self.now)
                log.write_bytes(b'\n'.join(self.raw().splitlines()[:-1]) + b'\n')
                with self.assertRaisesRegex(ValueError, 'original scheduled turn'):
                    record_preflight(root, snapshot, self.now, result(False, 'skip_budget'))
                log.write_bytes(self.raw())
                self.assertEqual(observe(root, closed, now=self.now)['runs'][0]['gate_receipt']['sha256'], admitted['receipt_sha256'])
                receipt = receipt_root(root) / (self.tid + '.json')
                self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
                receipt.unlink()
                with self.assertRaisesRegex(ValueError, 'Closed gate receipt changed'):
                    observe(root, closed, now=self.now)

    def test_preflight_identity_route_and_receipt_integrity(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); log = self.setup_store(root)
            log.write_bytes(b'\n'.join(self.raw().splitlines()[:5]) + b'\n')
            snapshot = root / 'input.json'
            snapshot.write_text(json.dumps({'task_id': self.tid, 'state': {'route': 'actions'}}))
            with patch.dict(os.environ, {'CODEX_THREAD_ID': self.two}):
                with self.assertRaisesRegex(ValueError, 'executing task'):
                    record_preflight(root, snapshot, self.now)
            with patch.dict(os.environ, {'CODEX_THREAD_ID': self.tid}):
                with self.assertRaisesRegex(ValueError, 'route differs'):
                    record_preflight(root, snapshot, self.now)
                snapshot.write_text(json.dumps({'task_id': self.tid, 'state': {'route': 'ccr-0920'}}))
                record_preflight(root, snapshot, '2026-09-08T01:00:30.000Z',
                                 lambda args: SimpleNamespace(returncode=1, stdout='private error'))
            log.write_bytes(self.raw(failed=False))
            doc = observe(root, now=self.now)
            self.assertNotIn('private', json.dumps(doc))
            # Verify the Python receipt reaches the actual JS intake and fault lane.
            import subprocess
            check = subprocess.run(['node', '--input-type=module', '-e',
                "import {codexRunIntake} from './scripts/lib/codex-run-intake.mjs';"
                "let s=''; for await(const c of process.stdin)s+=c; const d=JSON.parse(s);"
                "const r=codexRunIntake({codex_observation:d},{runs:[]},{now:Date.parse(d.observed_at)}).rows;"
                "if(r.length!==1||r[0].gate_code!=='preflight_error'||r[0].attempted!==false)process.exit(1);"],
                cwd=ROOT, input=json.dumps(doc), text=True, capture_output=True)
            self.assertEqual(check.returncode, 0, check.stderr)
            receipt = receipt_root(root) / (self.tid + '.json')
            tampered = json.loads(receipt.read_text()); tampered['admitted'] = True
            receipt.write_text(json.dumps(tampered))
            with self.assertRaisesRegex(ValueError, 'Invalid gate receipt'):
                observe(root, now=self.now)

    def test_missing_service_environment_does_not_mean_manual_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.setup_store(root)
            for env in ({}, {'XPC_SERVICE_NAME': 'unrelated-process'}):
                with patch.dict(os.environ, env, clear=True):
                    self.assertEqual(observe(root, now=self.now)['collection_context'], 'unidentified_process')
            with patch.dict(os.environ, {'XPC_SERVICE_NAME': 'com.simplememo.routine-observer'}, clear=True):
                self.assertEqual(observe(root, now=self.now)['collection_context'], 'service_environment_observed')

    def test_legacy_snapshot_migrates_on_real_observation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.setup_store(root)
            old = observe(root, now=self.now)
            old.update(schema_version=1, collection_context='interactive')
            validate(old, now=self.now)
            self.assertEqual(summary(old)['collection_context'], 'legacy_unverified')
            new = observe(root, old, now=self.now)
            self.assertEqual(new['schema_version'], 3)
            self.assertEqual(new['runs'], old['runs'])
            self.assertEqual(summary(new)['initial_failed'], 1)

    def test_history_loss_and_closed_failure_rewrite_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); log = self.setup_store(root)
            doc = observe(root, now=self.now)
            log.write_bytes(self.raw(failed=False))
            with self.assertRaisesRegex(ValueError, 'Closed turn changed'):
                observe(root, doc, now=self.now)
            log.unlink()
            with self.assertRaisesRegex(ValueError, 'transcript disappeared'):
                observe(root, doc, now=self.now)
            c = sqlite3.connect(root / 'sqlite/codex-dev.db')
            c.execute('DELETE FROM automation_runs'); c.commit(); c.close()
            with self.assertRaisesRegex(ValueError, 'scheduled run disappeared'):
                observe(root, doc, now=self.now)

    def test_unreadable_and_partial_are_not_empty_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); log = self.setup_store(root)
            for content in (b'{private', self.raw()[:-1]):
                log.write_bytes(content)
                doc = observe(root, now=self.now)
                self.assertEqual(summary(doc)['unavailable_transcripts'], 1)
                self.assertEqual(doc['runs'][0]['transcript']['turns'], [])
            log.unlink()
            self.assertEqual(summary(observe(root, now=self.now))['unavailable_transcripts'], 1)
            (root / 'sqlite/codex-dev.db').unlink()
            with self.assertRaises(sqlite3.OperationalError):
                observe(root, now=self.now)
            self.assertFalse((root / 'sqlite/codex-dev.db').exists())

    def test_invalid_metadata_and_stale_evidence_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.setup_store(root)
            doc = observe(root, now=self.now)
            for mutate in (lambda d: d['runs'][0].update(business_outcome='published'),
                           lambda d: d['runs'][0].update(prompt='private'),
                           lambda d: d.update(scheduler_query_complete=False),
                           lambda d: d['runs'].append(d['runs'][0]),
                           lambda d: d['runs'][0]['transcript']['turns'][0].update(tool_outputs=9)):
                bad = json.loads(json.dumps(doc)); mutate(bad)
                with self.assertRaises(ValueError):
                    validate(bad, now=self.now)
            with self.assertRaises(ValueError):
                validate(doc, now='2026-09-12T05:00:00.000Z')

    def test_unanswered_and_live_calls_stay_visible(self):
        raw = self.raw()
        rows = [json.loads(line) for line in raw.splitlines()]
        rows = [r for r in rows if r.get('payload', {}).get('type') != 'custom_tool_call_output']
        result = transcript(b''.join((json.dumps(r) + '\n').encode() for r in rows), self.tid)
        self.assertEqual(result['turns'][0]['unanswered_calls'], 1)
        rows = rows[:4]
        result = transcript(b''.join((json.dumps(r) + '\n').encode() for r in rows), self.tid)
        self.assertEqual(result['turns'][0]['state'], 'in_progress')
        self.assertIsNone(result['turns'][0]['finished_at'])
        self.assertEqual(result['turns'][0]['unanswered_calls'], 1)

    def test_source_failure_does_not_replace_last_observation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); ledger = root / 'ledger.json'
            ledger.write_text('{"existing": "kept"}\n')
            before = ledger.read_bytes()
            with self.assertRaises(sqlite3.OperationalError):
                apply(ledger, root)
            self.assertEqual(ledger.read_bytes(), before)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    for flag in ('apply', 'probe', 'check', 'selftest'):
        mode.add_argument('--' + flag, action='store_true')
    mode.add_argument('--thread-state')
    mode.add_argument('--preflight', type=Path)
    parser.add_argument('--ledger', type=Path, default=ROOT / 'data/routine-runs.json')
    parser.add_argument('--codex-dir', type=Path, default=Path.home() / '.codex')
    options = parser.parse_args()
    if options.selftest:
        unittest.main(argv=[__file__])
    else:
        try:
            if options.thread_state:
                result = thread_state(options.codex_dir, options.thread_state)
            elif options.preflight:
                result = record_preflight(options.codex_dir, options.preflight)
            elif options.apply:
                result = apply(options.ledger, options.codex_dir)
            elif options.probe:
                prior = json.loads(options.ledger.read_text()).get(KEY)
                result = summary(observe(options.codex_dir, prior))
            else:
                doc = json.loads(options.ledger.read_text())[KEY]
                result = summary(validate(doc))
            print(json.dumps(result))
        except Exception:
            # Database paths, exception messages and transcript text stay local.
            print(json.dumps({'state': 'failed', 'reason': 'Codex run observation unavailable or invalid'}))
            sys.exit(1)
