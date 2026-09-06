#!/usr/bin/env python3
"""Neutral, independent search-enabled model observations; never seed brand context."""
import datetime as dt
import argparse
import copy
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS = [
    '2026年にiPhoneで一番おすすめのメモアプリは何ですか？',
    'Obsidianに一番速くメモを送れるiPhoneアプリを教えてください',
    'Apple Watchから音声でメモを取るには何を使えばいいですか？',
    'ObsidianとLogseqはどちらを選ぶべきですか？',
    '「Obsidian連携シンプルメモ」というアプリについて知っていることを教えてください',
]
MENTION_METRICS_VERSION = 'answer-prose-v2.1'
SOURCE_HEADING = re.compile(
    r'^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*'
    r'(?:sources?|references?|citations?|出典|参考文献|参考リンク|引用元|情報源)'
    r'(?:\s*(?:\*\*|__)?\s*[:：]|\s*(?:\*\*|__)?\s*$)', re.I)
BRAND = re.compile(r'シンプルメモ|(?<![a-z0-9_])Simple(?:\s+Memo|Memo(?:Fast)?)(?![a-z0-9_])', re.I)
METRIC_DEFINITIONS = {
    'mention': 'Product name in answer prose, including inline code-styled names but excluding source sections, URLs, fenced code blocks, images and reference definitions. A mention is not an endorsement or a verified product claim.',
    'own_site_citation': 'At least one HTTP(S) URL with host simplememofast.com or www.simplememofast.com, counted separately from prose mentions.',
    'unaided': 'Verified questions Q1-Q4 only. Q5 explicitly supplies the brand and is excluded.',
}


def without_examples(answer):
    text = re.sub(r'(?ms)^\s*(```|~~~).*?^\s*\1[^\n]*$', '', answer)
    text = re.sub(r'<(script|style)\b[^>]*>.*?</\1>', '', text, flags=re.I | re.S)
    text = re.sub(r'!\[[^\]]*\](?:\([^\n]*?\)|\[[^\]]*\])?', '', text)
    return re.sub(r'<img\b[^>]*>', '', text, flags=re.I)


def answer_prose(answer):
    """Remove citation machinery while retaining an inline link's visible label."""
    text = without_examples(answer)
    text = re.sub(r'</(?:p|div|section|h[1-6]|li|ul|ol)>|<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<https?://[^>]+>', '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    lines = []
    in_reference = False
    for line in text.splitlines():
        if SOURCE_HEADING.match(line):
            break
        if re.match(r'^\s{0,3}\[[^\]]+\]:', line):
            in_reference = True
            continue
        if in_reference and (not line.strip() or line.startswith((' ', '\t'))):
            continue
        in_reference = False
        lines.append(line)
    text = '\n'.join(lines)
    text = re.sub(r'\[([^\]]+)\]\([^\n]*?\)', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\[[^\]]*\]', r'\1', text)
    text = re.sub(r'\[\^[^\]]+\]', '', text)
    text = re.sub(r'https?://[^\s<>]+', '', text)
    # Bare host names and email addresses are identifiers, not product-name prose.
    text = re.sub(r'\b[\w.+-]+@[\w.-]+\.[a-z]{2,63}\b', '', text, flags=re.I)
    text = re.sub(r'\b(?:[\w-]+\.)+[a-z]{2,63}(?::\d+)?(?:/[^\s]*)?', '', text, flags=re.I)
    return text.strip()


def answer_metrics(answer, verified):
    if not verified:
        return {'mention': None, 'own_site_citation': None, 'cited_urls': []}
    citation_text = re.sub(r'`[^`\n]*`', '', without_examples(answer))
    urls = list(dict.fromkeys(u.rstrip('.,;:!?。、') for u in
        re.findall(r'https?://[^\s)\]<>"\']+', citation_text)))
    own = False
    for url in urls:
        try:
            own |= urlsplit(url).hostname in ('simplememofast.com', 'www.simplememofast.com')
        except ValueError:
            continue
    return {'mention': bool(BRAND.search(answer_prose(answer))),
            'own_site_citation': own, 'cited_urls': urls}


def recalculate_report(report):
    """Reclassify retained answers; do not call the model or change collection/cost."""
    result = copy.deepcopy(report)
    for row in result['observations']:
        row.update(answer_metrics(row.get('answer', ''), row.get('status') == 'ok'))
    valid = [row for row in result['observations'] if row.get('status') == 'ok']
    unaided = [row for row in valid if row.get('question_id') in ('Q1', 'Q2', 'Q3', 'Q4')]
    result.update(mention_metrics_version=MENTION_METRICS_VERSION,
                  metric_definitions=METRIC_DEFINITIONS,
                  valid_questions=len(valid), unaided_valid_questions=len(unaided),
                  unaided_mention_rate=sum(row['mention'] for row in unaided) / len(unaided) if unaided else None,
                  unaided_own_site_citation_rate=sum(row['own_site_citation'] for row in unaided) / len(unaided) if unaided else None)
    return result


def validate_report(report):
    expected = recalculate_report(report)
    if report != expected:
        raise ValueError('Stored AI metrics differ from retained answer prose/citations; run --recalculate without resampling.')


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
            **answer_metrics(answer, success),
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
    return recalculate_report({'series': 'claude-sonnet-web-v1', 'observed_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'run_url': os.getenv('PROBE_RUN_URL'), 'cli_version': version,
            'protocol': {'independent_sessions': True, 'repository_context': False,
                         'comparison_to_manual_three_provider_series': False, 'per_question_budget_usd': 0.25},
            'status': 'ok' if len(valid) == len(QUESTIONS) else 'partial',
            'observations': results, 'valid_questions': len(valid),
            'unaided_valid_questions': len(unaided),
            'unaided_mention_rate': sum(row['mention'] for row in unaided) / len(unaided) if unaided else None,
            'total_cost_usd': sum(costs) if all(isinstance(c, (float, int)) for c in costs) else None})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--recalculate', action='store_true', help='Reclassify stored answers without calling Claude')
    modes.add_argument('--check-report', action='store_true', help='Reject stale or incorrect stored metric values')
    parser.add_argument('--report', type=Path, default=ROOT / 'data/ai-visibility-probe.json')
    args = parser.parse_args()
    if args.recalculate or args.check_report:
        old = json.loads(args.report.read_text())
        if args.check_report:
            validate_report(old)
            print('Stored AI prose mentions and citations match the retained answers.')
        else:
            updated = recalculate_report(old)
            if updated != old:
                updated.setdefault('measurement_correction', {
                    'at': dt.datetime.now(dt.timezone.utc).isoformat(),
                    'previous_unaided_mention_rate': old.get('unaided_mention_rate'),
                    'previous_metrics_version': old.get('mention_metrics_version', 'answer-including-urls-v1'),
                    'note': 'Reclassified existing answers to separate prose mentions from citations. Collection time, raw answers, search verification, models and costs are unchanged.'})
                args.report.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n')
            print(json.dumps({k: updated[k] for k in ['mention_metrics_version', 'unaided_mention_rate', 'unaided_own_site_citation_rate']}))
        raise SystemExit(0)
    result = observe()
    path = ROOT / 'data/ai-visibility-probe.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['status', 'valid_questions', 'unaided_mention_rate', 'total_cost_usd']}))
    raise SystemExit(0 if result['status'] == 'ok' else 1)
