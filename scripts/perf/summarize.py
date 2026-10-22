#!/usr/bin/env python3
"""Validate all mobile lab runs; gate local pages and verified production only."""
from __future__ import annotations
import json
import html
import math
import os
from pathlib import Path
import re
import statistics
from urllib.parse import urlsplit, urlunsplit
from variability import diagnostics, finite, group_variability, render_variability

METRICS = ('first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift')
CATEGORIES = ('performance', 'accessibility', 'best-practices', 'seo')
GROUPS = ('local-ja', 'local-en', 'production-ja', 'production-en')
EXPECTED = {f'{group}-{run}.report.json' for group in GROUPS for run in (1, 2, 3)}
ORIGIN = 'https://simplememofast.com'
MEASUREMENT = ('Lighthouse 12.8.2 default simulated mobile; three cold-browser runs per language and environment; '
               'no analytics suppression in Lighthouse; local gzip server is not the production CDN; not CrUX field data.')
# Keep the previous Japanese local thresholds. Production has explicit network
# headroom; all thresholds are set before measuring, not tuned to the result.
BUDGETS = {
    'local-ja': (90, 3000), 'local-en': (95, 2500),
    'production-ja': (90, 3500), 'production-en': (90, 3000),
}
DIAGNOSTIC_LIMIT = 3
DIAGNOSTIC_SCAN_LIMIT = 1000


def public_diagnostics(report):
    """Bounded optional audit evidence; never used to decide a budget result.

    Only selectors and public URL components are retained, not DOM snippets,
    request headers, query strings, fragments, or arbitrary audit descriptions.
    Unknown schemas/units remain unavailable instead of guessed timings.
    """
    audits = report.get('audits', {})
    truncated = set()

    def details(key):
        audit = audits.get(key)
        value = audit.get('details') if isinstance(audit, dict) else None
        return value if isinstance(value, dict) else {}

    def rows(key):
        pending = [(details(key), 0)]
        found = []
        # LCP node and insight tables can be nested; do not traverse arbitrary
        # report keys or allow a malformed optional table to flood the summary.
        for _ in range(DIAGNOSTIC_SCAN_LIMIT):
            if not pending:
                break
            item, depth = pending.pop(0)
            if not isinstance(item, dict):
                continue
            found.append(item)
            children = item.get('items')
            if depth < 4 and isinstance(children, list):
                room = DIAGNOSTIC_SCAN_LIMIT - len(found) - len(pending)
                if len(children) > room:
                    truncated.add(key)
                pending.extend((child, depth + 1) for child in children[:room])
            elif isinstance(children, list) and children:
                truncated.add(key)
        if pending:
            truncated.add(key)
        return found

    def label(value, limit=80):
        if not isinstance(value, str) or not value.strip():
            return None
        text = ' '.join(''.join(c if c.isprintable() else ' ' for c in value).split())
        return text[:limit] if text else None

    def public_url(value):
        if not isinstance(value, str) or len(value) > 4096 or any(c.isspace() or not c.isprintable() for c in value):
            return None
        try:
            parts = urlsplit(value)
            if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username or parts.password:
                return None
            parts.port  # Reject malformed ports, including out-of-range values.
            cleaned = urlunsplit((parts.scheme, parts.netloc, parts.path, '', ''))
        except ValueError:
            return None
        return cleaned if len(cleaned) <= 240 else None

    def timing(value):
        # An overflowing or absurd optional duration must not invalidate an
        # otherwise valid measurement. The bound is diagnostic-only (one day).
        return isinstance(value, (int, float)) and not isinstance(value, bool) and 0 <= value <= 86400000 and finite(value)

    result = {'lcp_selector': None, 'main_thread': [], 'resources': [],
              'bootup': [], 'render_blocking': [], 'unavailable': [], 'omitted': {}}
    for key in ('lcp-breakdown-insight', 'largest-contentful-paint-element'):
        for item in rows(key):
            node = item.get('node', item if item.get('type') == 'node' else {})
            selector = node.get('selector') if isinstance(node, dict) else None
            # Attribute selectors can contain arbitrary page data. Emit only a
            # bounded structural selector, never node text or HTML snippets.
            if isinstance(selector, str) and selector.strip() and len(selector) <= 160 and re.fullmatch(r'[A-Za-z0-9_.*# >:+~(),-]+', selector):
                result['lcp_selector'] = selector.strip()
                break
        if result['lcp_selector']:
            break

    for item in rows('mainthread-work-breakdown'):
        group = label(item.get('groupLabel') or item.get('group'))
        if group and timing(item.get('duration')):
            result['main_thread'].append({'group': group, 'duration_ms': item['duration']})

    network = details('network-requests')
    headings = network.get('headings', [])
    def milliseconds(key):
        matches = [h.get('valueType') for h in headings if isinstance(h, dict) and h.get('key') == key] if isinstance(headings, list) else []
        return matches == ['ms']
    # Explicit heading units avoid confusing old second-valued timestamps with
    # millisecond-valued schemas. Unsupported versions remain unavailable.
    for start, end in (('networkRequestTime', 'networkEndTime'), ('startTime', 'endTime')):
        if not milliseconds(start) or not milliseconds(end):
            continue
        for item in rows('network-requests'):
            url = public_url(item.get('url'))
            if url and timing(item.get(start)) and timing(item.get(end)) and item[end] >= item[start]:
                result['resources'].append({'url': url, 'duration_ms': item[end] - item[start]})
        break

    for item in rows('bootup-time'):
        url = public_url(item.get('url'))
        if url and timing(item.get('total')):
            result['bootup'].append({'url': url, 'total_ms': item['total']})
    for key in ('render-blocking-resources', 'render-blocking-insight'):
        for item in rows(key):
            url = public_url(item.get('url'))
            if url and timing(item.get('wastedMs')):
                result['render_blocking'].append({'url': url, 'estimated_savings_ms': item['wastedMs']})

    for key, field in (('main_thread', 'duration_ms'), ('resources', 'duration_ms'),
                       ('bootup', 'total_ms'), ('render_blocking', 'estimated_savings_ms')):
        result[key].sort(key=lambda row: (-row[field], row.get('url', row.get('group', ''))))
        result['omitted'][key] = max(0, len(result[key]) - DIAGNOSTIC_LIMIT)
        result[key] = result[key][:DIAGNOSTIC_LIMIT]
    result['unavailable'] = [key for key in ('lcp_selector', 'main_thread', 'resources', 'bootup', 'render_blocking') if not result[key]]
    result['truncated_audits'] = sorted(truncated)
    return result


def render_public_diagnostics(rows):
    if not rows:
        return []
    lines = ['', '## Optional timing diagnostics', '',
             'Each run is retained. Top three available entries per audit; unavailable means missing, malformed, or unsupported data.',
             'Observed trace phases below are not simulated mobile timings. Other durations retain their Lighthouse audit meaning; render-blocking savings are estimates, not transfer times.']

    def safe(value):
        return html.escape(str(value), quote=True).replace('|', '&#124;').replace('`', '&#96;')

    def ms(value):
        return f'{value:.1f}' if finite(value) else 'unavailable'

    for row in rows:
        trace = row['trace_diagnostics']
        evidence = row['public_diagnostics']
        lines += ['', f"- {safe(row['file'])}: LCP selector `{safe(evidence['lcp_selector'] or 'unavailable')}`",
                  '  Observed trace (ms): LCP ' + ms(trace['observed_lcp_ms']) + ', FCP ' + ms(trace['observed_fcp_ms']) + '; ' +
                  ', '.join(f'{key} {ms(value)}' for key, value in trace['lcp_parts_ms'].items())]
        if evidence['truncated_audits']:
            lines.append('  Scan limit reached; rankings are partial for: ' + ', '.join(evidence['truncated_audits']))
        for key, title, field in (('main_thread', 'Main-thread groups (ms)', 'duration_ms'),
                                  ('resources', 'Resource duration (ms)', 'duration_ms'),
                                  ('bootup', 'Script bootup total (ms)', 'total_ms'),
                                  ('render_blocking', 'Render-blocking estimated savings (ms)', 'estimated_savings_ms')):
            entries = [f"`{safe(item.get('url', item.get('group')))}` {ms(item[field])}" for item in evidence[key]]
            text = '; '.join(entries) if entries else 'unavailable'
            omitted = evidence['omitted'][key]
            lines.append(f'  {title}: {text}' + (f'; {omitted} more valid entries omitted' if omitted else ''))
    return lines


def number(value, name, maximum=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f'{name}: expected a finite, nonnegative number')
    if maximum is not None and value > maximum:
        raise ValueError(f'{name}: value exceeds {maximum}')
    return value


def read_run(path):
    report = json.loads(path.read_text())
    if report.get('runtimeError') or report.get('lighthouseVersion') != '12.8.2':
        raise ValueError(f'{path.name}: failed measurement or unexpected Lighthouse version')
    config = report['configSettings']
    if config.get('formFactor') != 'mobile' or config.get('throttlingMethod') != 'simulate':
        raise ValueError(f'{path.name}: expected simulated mobile measurement')
    screen = config.get('screenEmulation', {})
    if screen.get('disabled') is not False or screen.get('mobile') is not True or screen.get('width') != 412 or screen.get('height') != 823 or screen.get('deviceScaleFactor') != 1.75:
        raise ValueError(f'{path.name}: unexpected mobile screen configuration')
    throttle = config.get('throttling', {})
    if any(throttle.get(key) != value for key, value in {'rttMs': 150, 'throughputKbps': 1638.4, 'cpuSlowdownMultiplier': 4}.items()):
        raise ValueError(f'{path.name}: unexpected throttling configuration')
    if config.get('blockedUrlPatterns') or config.get('disableStorageReset') is not False:
        raise ValueError(f'{path.name}: blocked resources or reused browser storage')
    group = path.name.rsplit('-', 1)[0]
    url = ('http://127.0.0.1:8765' if group.startswith('local-') else ORIGIN) + ('/en/' if group.endswith('-en') else '/')
    if report.get('requestedUrl') != url or report.get('finalDisplayedUrl') != url:
        raise ValueError(f'{path.name}: unexpected requested or displayed URL')
    categories = {key: number(report['categories'][key]['score'], f'{path.name}: {key}', 1) for key in CATEGORIES}
    metrics = {key: number(report['audits'][key]['numericValue'], f'{path.name}: {key}') for key in METRICS}
    return {'file': path.name, 'group': group, 'performance': categories['performance'] * 100,
            'categories': categories, 'metrics': metrics, 'warnings': report.get('runWarnings', []),
            'trace_diagnostics': diagnostics(report), 'public_diagnostics': public_diagnostics(report)}


def summarize(root: Path, *, require_production=False, expected_commit=None):
    found = {p.name for p in root.glob('*.report.json')}
    if found != EXPECTED:
        raise ValueError(f'Expected exactly twelve reports. Missing: {sorted(EXPECTED - found)}; unexpected: {sorted(found - EXPECTED)}')
    rows = [read_run(root / name) for name in sorted(EXPECTED)]
    receipt = json.loads((root / 'production-deployment.json').read_text())
    if not isinstance(receipt.get('verified'), bool):
        raise ValueError('Production receipt must explicitly state verified true or false')
    verified = receipt['verified']
    if verified:
        if receipt.get('origin') != ORIGIN or not receipt.get('commit'):
            raise ValueError('Verified production receipt lacks its origin or commit')
        if expected_commit and receipt['commit'] != expected_commit:
            raise ValueError('Production receipt is for a different checkout')
        pages = receipt.get('pages', {})
        if set(pages) != {'index.html', 'en/index.html'} or any(p.get('status') != 200 or p.get('matches_checkout') is not True for p in pages.values()):
            raise ValueError('Verified receipt must include both matching public pages')
        if not receipt.get('assets'):
            raise ValueError('Verified receipt lacks asset verification')
    if require_production and not verified:
        raise ValueError('Main-push audit requires a verified production deployment')
    medians, failures, enforced = {}, [], []
    for group in GROUPS:
        selected = [r for r in rows if r['group'] == group]
        medians[group] = {'performance': statistics.median(r['performance'] for r in selected),
                          **{key: statistics.median(r['metrics'][key] for r in selected) for key in METRICS}}
        # PRs observe the old public revision. Never label it as this PR's
        # deployment or fail the candidate on that revision's performance.
        if group.startswith('production-') and not verified:
            continue
        enforced.append(group)
        score, lcp = BUDGETS[group]
        if medians[group]['performance'] < score:
            failures.append(f'{group}: median performance below {score}')
        if medians[group][METRICS[1]] > lcp:
            failures.append(f'{group}: median LCP exceeds {lcp} ms')
        if medians[group][METRICS[2]] > 200:
            failures.append(f'{group}: median TBT exceeds 200 ms')
        if any(r['metrics'][METRICS[3]] > 0.1 for r in selected):
            failures.append(f'{group}: a run exceeds CLS 0.1')
        for category in CATEGORIES[1:]:
            if any(r['categories'][category] != 1 for r in selected):
                failures.append(f'{group}: {category} fell below 100')
    return {'measurement': MEASUREMENT, 'runs': rows, 'medians': medians,
            'variability': group_variability(rows, BUDGETS, METRICS),
            'production_verified': verified, 'enforced_groups': enforced,
            'status': 'failure' if failures else 'success', 'failures': failures}


def render(summary):
    lines = ['| Run | Performance | FCP (s) | LCP (s) | TBT (ms) | CLS |', '|---|---:|---:|---:|---:|---:|']
    for row in summary.get('runs', []):
        a = row['metrics']
        lines.append(f"| {row['file']} | {row['performance']:.0f} | {a[METRICS[0]]/1000:.2f} | {a[METRICS[1]]/1000:.2f} | {a[METRICS[2]]:.0f} | {a[METRICS[3]]:.4f} |")
    lines += render_variability(summary.get('variability', {}))
    lines += render_public_diagnostics(summary.get('runs', []))
    lines += ['', MEASUREMENT, '', 'Enforced groups: ' + ', '.join(summary.get('enforced_groups', []))]
    if summary.get('production_verified') is False:
        lines.append('Production is an unverified baseline observation, not evidence that this checkout is deployed.')
    lines += ['', summary['status'].upper()]
    lines.extend(summary.get('failures', []))
    return '\n'.join(lines) + '\n'


def main():
    root = Path(os.environ['PERF_RESULTS'])
    root.mkdir(parents=True, exist_ok=True)
    required = (os.environ.get('GITHUB_EVENT_NAME') == 'push' and os.environ.get('GITHUB_REF') == 'refs/heads/main')
    try:
        summary = summarize(root, require_production=required, expected_commit=os.environ.get('PERF_EXPECTED_COMMIT'))
    except (ValueError, KeyError, TypeError, OSError) as error:
        summary = {'measurement': MEASUREMENT, 'status': 'failure', 'failures': [str(error)], 'runs': [], 'enforced_groups': []}
    (root / 'summary.json').write_text(json.dumps(summary, indent=2, allow_nan=False) + '\n')
    text = render(summary)
    (root / 'summary.md').write_text(text)
    print(text)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as handle:
            handle.write(text)
    return 0 if summary['status'] == 'success' else 1


if __name__ == '__main__':
    raise SystemExit(main())
