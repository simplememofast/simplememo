#!/usr/bin/env python3
"""Collect five isolated Codex web-search answers using the existing local login."""
import argparse
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'data/ai-visibility-probe.json'
STATE = Path.home() / '.config/simplememo/ai-visibility'
MODEL = 'gpt-6-astra'
SERIES = 'codex-astra-web-v1'
DISABLED = ('shell_tool', 'unified_exec', 'apps', 'plugins', 'skill_search',
            'memories', 'multi_agent', 'multi_agent_v2')
UUID = re.compile(r'^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
spec = importlib.util.spec_from_file_location('legacy_probe', ROOT / 'scripts/ai-visibility-probe.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def prompt(question):
    return question + ' Web検索で確認し、根拠リンク付きで200字程度で答えてください。'


def command():
    args = ['codex', 'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
            '--sandbox', 'read-only', '--json', '--model', MODEL,
            '-c', 'model_reasoning_effort="medium"', '-c', 'web_search="live"',
            '-c', 'project_doc_max_bytes=0']
    for feature in DISABLED:
        args += ['--disable', feature]
    return args + ['-']


def summarize(stream, exit_code):
    events = [json.loads(line) for line in stream.splitlines() if line.strip()]
    started, searches, threads, answers, usage = set(), {}, [], [], None
    completed = 0
    failed = False
    unexpected = set()
    for event in events:
        kind = event.get('type')
        if kind == 'thread.started':
            threads.append(event.get('thread_id'))
        elif kind == 'turn.completed':
            completed += 1
            usage = event.get('usage')
        elif kind in ('turn.failed', 'error'):
            failed = True
        item = event.get('item', {})
        item_type = item.get('type')
        if item_type and item_type not in ('web_search', 'agent_message', 'reasoning'):
            unexpected.add(item_type)
        if item_type == 'web_search':
            ident = item.get('id')
            if kind == 'item.started' and isinstance(ident, str):
                started.add(ident)
            elif (kind == 'item.completed' and ident in started
                  and item.get('status') in (None, 'completed')
                  and not item.get('is_error') and not item.get('error')):
                action = item.get('action', {})
                query = action.get('query') or item.get('query')
                if action.get('type') == 'search' and isinstance(query, str) and query.strip():
                    searches[ident] = {'id': ident, 'query': query}
        if kind == 'item.completed' and item_type == 'agent_message' and isinstance(item.get('text'), str):
            answers.append(item['text'])
    thread_id = threads[0] if len(threads) == 1 and isinstance(threads[0], str) and UUID.fullmatch(threads[0]) else None
    answer = answers[-1] if answers else ''
    success = exit_code == 0 and completed == 1 and not failed and bool(thread_id and searches and answer.strip()) and not unexpected
    return {'status': 'ok' if success else 'unverified', 'answer': answer,
            'thread_id': thread_id, 'exit_code': exit_code, 'turn_completed': completed == 1 and not failed,
            'verified_search_calls': len(searches), 'search_events': list(searches.values()),
            'unexpected_tools': sorted(unexpected), 'usage': usage, 'cost_usd': None,
            'transcript_sha256': hashlib.sha256(stream.encode()).hexdigest(),
            **legacy.answer_metrics(answer, success),
            'error': None if success else ('unexpected_tools' if unexpected else 'incomplete_codex_observation')}


def protocol():
    return {'independent_sessions': True, 'repository_context': False,
            'comparison_to_manual_three_provider_series': False,
            'comparison_to_claude_series': False, 'requested_model': MODEL,
            'reasoning_effort': 'medium', 'web_search': 'live',
            'user_config_loaded': False, 'project_doc_max_bytes': 0,
            'disabled_features': list(DISABLED), 'per_question_timeout_seconds': 180,
            'question_limit': 5, 'automatic_retries': 0}


def build_report(rows, run_id, started_at, cli_version):
    return legacy.recalculate_report({
        'series': SERIES, 'observed_at': now(), 'started_at': started_at,
        'run_id': run_id, 'run_url': None, 'cli_version': cli_version,
        'source': 'local_codex_cli', 'protocol': protocol(),
        'status': 'ok' if len(rows) == 5 and all(r['status'] == 'ok' for r in rows) else 'partial',
        'observations': rows, 'total_cost_usd': None,
        'cost_note': 'Existing Codex login; CLI provides token usage, not billed USD. No API-key fallback or usage reset.'})


def validate_report(report, healthy=False, at=None):
    require(report.get('series') == SERIES and report.get('source') == 'local_codex_cli', 'Codex observation is missing')
    require(report.get('protocol') == protocol(), 'Observation protocol changed')
    require(report.get('total_cost_usd') is None, 'Codex USD cost is not measured')
    require(isinstance(report.get('run_id'), str) and UUID.fullmatch(report['run_id']), 'Invalid collection identity')
    observed = dt.datetime.fromisoformat(report['observed_at'])
    started = dt.datetime.fromisoformat(report['started_at'])
    require(observed.tzinfo is not None and started.tzinfo is not None and started <= observed, 'Invalid observation time')
    rows = report['observations']
    require(len(rows) == 5, 'Expected five questions')
    identities = []
    for index, row in enumerate(rows):
        require(row.get('question_id') == f'Q{index + 1}' and row.get('question') == legacy.QUESTIONS[index], 'Question set changed')
        require(row.get('cost_usd') is None, 'Question cost is not measured')
        require(row.get('status') in ('ok', 'unverified'), 'Unknown observation status')
        if row['status'] == 'ok':
            tid = row.get('thread_id')
            require(isinstance(tid, str) and UUID.fullmatch(tid), 'Missing independent session')
            identities.append(tid)
            searches = row.get('search_events', [])
            require(row.get('exit_code') == 0 and row.get('turn_completed') is True and row.get('error') is None,
                    'Failed turn counted as successful')
            require(row.get('unexpected_tools') == [] and isinstance(row.get('answer'), str) and row['answer'].strip(), 'Invalid answer context')
            require(searches and row.get('verified_search_calls') == len(searches)
                    and len({s.get('id') for s in searches}) == len(searches)
                    and all(isinstance(s.get('id'), str) and isinstance(s.get('query'), str) and s['query'].strip() for s in searches), 'Missing search evidence')
            require(re.fullmatch(r'[0-9a-f]{64}', row.get('transcript_sha256', '')), 'Missing transcript digest')
    require(len(set(identities)) == len(identities), 'Questions share a session')
    require(report.get('status') == ('ok' if len(identities) == 5 else 'partial'), 'Incorrect aggregate status')
    legacy.validate_report(report)
    if healthy:
        require(report['status'] == 'ok', 'Latest Codex observation is incomplete')
        age = ((at or dt.datetime.now(dt.timezone.utc)) - observed).total_seconds()
        require(0 <= age <= 8 * 86400, 'Codex weekly observation is stale or future')


def preflight():
    require(not os.environ.get('CODEX_API_KEY') and not os.environ.get('OPENAI_API_KEY'),
            'API-key billing is not part of this local Codex migration')
    auth = subprocess.run(['codex', 'login', 'status'], capture_output=True, text=True, timeout=20)
    require(auth.returncode == 0 and 'Logged in using ChatGPT' in auth.stdout + auth.stderr,
            'Existing ChatGPT login is required; API-key billing is not authorized')
    stop = json.loads((ROOT / 'data/emergency-stop.json').read_text())
    require(stop.get('stopped') is False and stop.get('agents', {}).get('owner-session', {}).get('stopped') is False,
            'Global or owner-session emergency stop is active or unreadable')
    for args in [('--check',), ('--check', '--task', 'analysis'), ('--check-run-cap', '--task', 'analysis')]:
        subprocess.run(['node', str(ROOT / 'scripts/autopilot-budget.mjs'), *args], cwd=ROOT, check=True,
                       stdout=subprocess.DEVNULL, timeout=30)


def collect_one(question, folder, index):
    with tempfile.TemporaryDirectory(prefix='neutral-visibility-') as cwd:
        process = subprocess.Popen(command(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, cwd=cwd, start_new_session=True)
        try:
            stdout, stderr = process.communicate(prompt(question), timeout=180)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
    (folder / f'Q{index}.jsonl').write_text(stdout)
    (folder / f'Q{index}.stderr').write_text(stderr)
    try:
        return summarize(stdout, process.returncode)
    except (ValueError, TypeError):
        return {'status': 'unverified', 'answer': '', 'cost_usd': None,
                'error': 'malformed_codex_stream', 'transcript_sha256': hashlib.sha256(stdout.encode()).hexdigest()}


def current_week(report):
    tz = dt.timezone(dt.timedelta(hours=9))
    return (dt.datetime.fromisoformat(report['observed_at']).astimezone(tz).isocalendar()[:2]
            == dt.datetime.now(tz).isocalendar()[:2])


def save_report(result):
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    history = ROOT / 'data/ai-visibility-history'
    history.mkdir(exist_ok=True)
    (history / f"{result['started_at'][:10]}-{SERIES}-{result['run_id']}.json").write_text(text)
    temporary = REPORT.with_suffix('.json.tmp')
    temporary.write_text(text)
    temporary.replace(REPORT)


def collect():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (STATE / 'run.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        preflight()
        if REPORT.exists():
            previous = json.loads(REPORT.read_text())
            if previous.get('series') == SERIES and previous.get('status') == 'ok':
                validate_report(previous)
                if current_week(previous):
                    print('This JST week already has a complete Codex observation; no resampling.')
                    return
        for cached_path in sorted((STATE / 'runs').glob('*/report.json')):
            cached = json.loads(cached_path.read_text())
            if cached.get('series') == SERIES and cached.get('status') == 'ok' and current_week(cached):
                validate_report(cached, healthy=True)
                save_report(cached)
                print('Reused this JST week\'s completed local observation; finish publishing it without resampling.')
                return
        run_id, started = str(uuid.uuid4()), now()
        folder = STATE / 'runs' / run_id
        folder.mkdir(parents=True, mode=0o700)
        version = subprocess.check_output(['codex', '--version'], text=True, timeout=15).strip()
        (folder / 'request.json').write_text(json.dumps({'run_id': run_id, 'started_at': started,
            'protocol': protocol(), 'cli_version': version, 'expected_usd': None,
            'cost_reason': 'Existing Codex account; billed USD unavailable; maximum five 180-second calls without retries.'}, indent=2))
        rows = []
        for index, question in enumerate(legacy.QUESTIONS, 1):
            preflight()
            row = collect_one(question, folder, index)
            rows.append({'question_id': f'Q{index}', 'question': question, **row})
        result = build_report(rows, run_id, started, version)
        validate_report(result)
        text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
        (folder / 'report.json').write_text(text)
        save_report(result)
        print(json.dumps({k: result[k] for k in ('series', 'status', 'valid_questions', 'unaided_mention_rate', 'total_cost_usd')}))
        require(result['status'] == 'ok', 'Codex observation is incomplete; preserve the report and diagnose before retrying')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-report', action='store_true')
    parser.add_argument('--health', action='store_true')
    args = parser.parse_args()
    if args.check_report or args.health:
        validate_report(json.loads(REPORT.read_text()), healthy=args.health)
        print('Codex observation verified' + (' and current.' if args.health else '.'))
    else:
        collect()
