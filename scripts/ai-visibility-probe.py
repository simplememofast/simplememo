#!/usr/bin/env python3
"""Neutral, independent search-enabled model observations; never seed brand context."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = [
    '2026年にiPhoneで一番おすすめのメモアプリは何ですか？',
    'Obsidianに一番速くメモを送れるiPhoneアプリを教えてください',
    'Apple Watchから音声でメモを取るには何を使えばいいですか？',
    'ObsidianとLogseqはどちらを選ぶべきですか？',
    '「Obsidian連携シンプルメモ」というアプリについて知っていることを教えてください',
]


def summarize(stream, exit_code):
    events = [json.loads(line) for line in stream.splitlines() if line.strip()]
    searches, completed = set(), set()
    final = None
    for event in events:
        if event.get('type') == 'result':
            final = event
        content = event.get('message', {}).get('content', [])
        for block in content if isinstance(content, list) else []:
            if not isinstance(block, dict):
                continue
            if block.get('type') == 'tool_use' and block.get('name') == 'WebSearch':
                searches.add(block['id'])
            if block.get('type') == 'tool_result' and not block.get('is_error', False):
                completed.add(block.get('tool_use_id'))
    final = final or {}
    answer = final.get('result', '')
    verified = bool(searches & completed)
    success = exit_code == 0 and not final.get('is_error', True) and final.get('subtype') == 'success' and verified and bool(answer)
    return {'status': 'ok' if success else 'unverified', 'answer': answer,
            'verified_search_calls': len(searches & completed),
            'models': sorted(final.get('modelUsage', {})),
            'cost_usd': final.get('total_cost_usd'),
            'mention': bool(re.search(r'Simple\s*Memo|シンプルメモ', answer, re.I)) if success else None,
            'cited_urls': re.findall(r'https?://[^\s)\]>]+', answer) if success else [],
            'error': None if success else final.get('subtype', 'missing_result')}


def observe():
    results = []
    executable = shutil.which('claude')
    if not executable:
        raise RuntimeError('Claude CLI unavailable')
    version = subprocess.check_output([executable, '--version'], text=True).strip()
    for index, question in enumerate(QUESTIONS, 1):
        # No repository, prior answers, memory, plugins or other model context.
        with tempfile.TemporaryDirectory(prefix='neutral-visibility-') as cwd:
            try:
                result = subprocess.run([executable, '-p', question + '。Web検索で確認し、根拠リンク付きで200字程度で答えてください。',
                    '--model', 'sonnet', '--safe-mode', '--strict-mcp-config',
                    '--tools', 'WebSearch', '--allowedTools', 'WebSearch', '--permission-mode', 'dontAsk',
                    '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--max-budget-usd', '0.25'],
                    cwd=cwd, capture_output=True, text=True, timeout=120)
                row = summarize(result.stdout, result.returncode)
            except (subprocess.TimeoutExpired, ValueError) as error:
                row = {'status': 'unverified', 'error': type(error).__name__, 'cost_usd': None, 'mention': None}
        results.append({'question_id': f'Q{index}', 'question': question, **row})
    valid = [row for row in results if row['status'] == 'ok']
    # Q5 is explicitly branded and cannot be counted as unaided discovery.
    unaided = [row for row in valid if row['question_id'] != 'Q5']
    costs = [row['cost_usd'] for row in results]
    return {'series': 'claude-sonnet-web-v1', 'observed_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'run_url': os.getenv('PROBE_RUN_URL'), 'cli_version': version,
            'protocol': {'independent_sessions': True, 'repository_context': False,
                         'comparison_to_manual_three_provider_series': False, 'per_question_budget_usd': 0.25},
            'status': 'ok' if len(valid) == len(QUESTIONS) else 'partial',
            'observations': results, 'valid_questions': len(valid),
            'unaided_valid_questions': len(unaided),
            'unaided_mention_rate': sum(row['mention'] for row in unaided) / len(unaided) if unaided else None,
            'total_cost_usd': sum(costs) if all(isinstance(c, (float, int)) for c in costs) else None}


if __name__ == '__main__':
    result = observe()
    path = ROOT / 'data/ai-visibility-probe.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['status', 'valid_questions', 'unaided_mention_rate', 'total_cost_usd']}))
    raise SystemExit(0 if result['status'] == 'ok' else 1)
