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


def observe(codex_dir, previous=None, now=None):
    observed_at = now or dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
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
            thread = state.execute('SELECT rollout_path FROM threads WHERE id=?', (tid,)).fetchone()
            details = {'state': 'unavailable', 'reason': 'thread_missing', 'sha256': None, 'bytes': None, 'turns': []}
            if thread:
                path = Path(thread['rollout_path']).resolve()
                allowed = any(parent.resolve() in path.parents for parent in
                              (codex_dir / 'sessions', codex_dir / 'archived_sessions'))
                if not allowed:
                    details['reason'] = 'path_outside_session_store'
                else:
                    try:
                        details = transcript(path.read_bytes(), tid)
                    except (OSError, ValueError, KeyError, TypeError):
                        details['reason'] = 'unreadable_or_incomplete_transcript'
            record['transcript'] = details
            normalized.append(record)
    finally:
        scheduler.close()
        state.close()
    for automation in automations:
        for key in ('next_run_at', 'last_run_at'):
            automation[key] = None if automation[key] is None else iso(automation[key])
    result = {'schema_version': 2, 'observed_at': observed_at, 'registered': list(REGISTERED),
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
    require(type(doc['schema_version']) is int and doc['schema_version'] in (1, 2)
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
        keys(run, 'thread_id automation_id scheduler_status created_at updated_at business_outcome transcript')
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
            'collection_context': doc['collection_context'] if doc['schema_version'] == 2 else 'legacy_unverified',
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
            self.assertEqual(new['schema_version'], 2)
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
    parser.add_argument('--ledger', type=Path, default=ROOT / 'data/routine-runs.json')
    parser.add_argument('--codex-dir', type=Path, default=Path.home() / '.codex')
    options = parser.parse_args()
    if options.selftest:
        unittest.main(argv=[__file__])
    else:
        try:
            if options.apply:
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
