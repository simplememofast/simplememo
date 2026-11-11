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
# [2026-11-11 owner decision] The TBT budget is judged on the site's own share.
# Production TBT is made of the Google tag's long tasks alone (CLAUDE.md), so the total passed or
# failed with the speed of the measuring machine while the site's own code added nothing. The
# tag's share is recorded and watched below; it is still measured (MEASUREMENT: no suppression).
SITE_TBT_BUDGET = 200
GOOGLE_TAG_HOSTS = frozenset({'www.googletagmanager.com', 'googletagmanager.com'})
# Lighthouse 12.8.2 reports simulated TBT as 0.5 x optimistic + 0.5 x pessimistic estimate
# (Lantern TotalBlockingTime.coefficients), and the third-party table's tbtImpact is the
# pessimistic one (same task timings, same FCP..TTI window). The optimistic window lies inside the
# pessimistic one, so a task counts no more there: subtracting only the pessimistic half never
# understates what is left for the site. read_run() rejects every other Lighthouse version;
# re-read those coefficients before changing the pinned version.
PESSIMISTIC_WEIGHT = 0.5
# Watch level for the tag itself. Its TBT impact scales with the measuring machine, so it is
# compared as impact x benchmarkIndex / 1000: about 730 to 910 across the six runs of
# 2026-11-10/11 (machines from 2026 to 3938, estimated from the totals), and 730 to 914 measured
# in the first run that printed it (run 42947273642). The level was set above the estimates
# before that run. A watch level, not a budget: it fails only the scheduled run.
GOOGLE_TAG_WATCH = 1200
DIAGNOSTIC_LIMIT = 3
DIAGNOSTIC_SCAN_LIMIT = 1000
# TBT is the sum over long tasks, so one more row than the other tables is worth its line.
LONG_TASK_LIMIT = 5
# Lighthouse attributes a long task to a URL or to this fixed word. No other text is copied.
UNATTRIBUTED = 'unattributed'


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
              'bootup': [], 'render_blocking': [], 'long_tasks': [], 'third_party_blocking': [],
              'unavailable': [], 'omitted': {}}
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

    def declared_ms(audit_details, key):
        table = audit_details.get('headings', [])
        matches = [h.get('valueType') for h in table if isinstance(h, dict) and h.get('key') == key] if isinstance(table, list) else []
        return matches == ['ms']

    # [2026-11-11] TBT is made of long tasks, and the summary showed none of them: the tables
    # above name groups and scripts but not which single task blocks, or when. Both values are
    # Lighthouse's simulated ones (the same clock as the FCP/LCP columns), so a task that starts
    # after FCP is one that counts. Units must be declared, as for the network table.
    long_tasks = details('long-tasks')
    if declared_ms(long_tasks, 'startTime') and declared_ms(long_tasks, 'duration'):
        for item in rows('long-tasks'):
            if 'url' not in item or not timing(item.get('startTime')) or not timing(item.get('duration')):
                continue
            # A non-URL attribution ("Unattributable") becomes one fixed word; its text is not copied.
            result['long_tasks'].append({'url': public_url(item.get('url')) or UNATTRIBUTED,
                                         'start_ms': item['startTime'], 'duration_ms': item['duration']})
    third_party = details('third-party-summary')
    if declared_ms(third_party, 'blockingTime'):
        for item in rows('third-party-summary'):
            entity = item.get('entity')
            name = label(entity.get('text') if isinstance(entity, dict) else entity, 40)
            if name and timing(item.get('blockingTime')):
                result['third_party_blocking'].append({'group': name, 'blocking_ms': item['blockingTime']})

    for key, field, limit in (('main_thread', 'duration_ms', DIAGNOSTIC_LIMIT), ('resources', 'duration_ms', DIAGNOSTIC_LIMIT),
                              ('bootup', 'total_ms', DIAGNOSTIC_LIMIT), ('render_blocking', 'estimated_savings_ms', DIAGNOSTIC_LIMIT),
                              ('long_tasks', 'duration_ms', LONG_TASK_LIMIT), ('third_party_blocking', 'blocking_ms', DIAGNOSTIC_LIMIT)):
        result[key].sort(key=lambda row: (-row[field], row.get('url', row.get('group', '')), row.get('start_ms', 0)))
        result['omitted'][key] = max(0, len(result[key]) - limit)
        result[key] = result[key][:limit]
    result['unavailable'] = [key for key in ('lcp_selector', 'main_thread', 'resources', 'bootup', 'render_blocking',
                                             'long_tasks', 'third_party_blocking') if not result[key]]
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
        # Simulated start + duration, in the same clock as the FCP/LCP columns of the table above.
        tasks = [f"`{safe(item['url'])}` {ms(item['start_ms'])}+{ms(item['duration_ms'])}" for item in evidence['long_tasks']]
        omitted = evidence['omitted']['long_tasks']
        lines.append('  Long tasks (ms, simulated start+duration): ' + ('; '.join(tasks) if tasks else 'unavailable')
                     + (f'; {omitted} more valid entries omitted' if omitted else ''))
        blocking = [f"`{safe(item['group'])}` {ms(item['blocking_ms'])}" for item in evidence['third_party_blocking']]
        omitted = evidence['omitted']['third_party_blocking']
        lines.append('  Third-party blocking time (ms): ' + ('; '.join(blocking) if blocking else 'unavailable')
                     + (f'; {omitted} more valid entries omitted' if omitted else ''))
    return lines


# Lighthouse 12.8.2 core/gather/driver/environment.js: the run warning added when the
# measuring machine's benchmarkIndex is at or below SLOW_CPU_BENCHMARK_INDEX_THRESHOLD.
SLOW_HOST_WARNING = 'appears to have a slower CPU than'
SLOW_HOST_THRESHOLD = 1000


def host_evidence(report):
    """Report-only evidence about the measuring machine; never used to decide a budget result.

    Lighthouse benchmarks the host CPU before it measures (`environment.benchmarkIndex`,
    higher is faster) and, at or below 1000 with the default simulated throttling, adds a
    run warning that the host is slower than the simulation assumes. A slow runner raises
    simulated TBT with no page change, so the summary shows the machine beside the result.
    Only the number and two counts are kept: warning text is never copied.
    Missing or malformed values stay unknown (None), not zero.
    """
    environment = report.get('environment')
    value = environment.get('benchmarkIndex') if isinstance(environment, dict) else None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        value = None
    warnings = report.get('runWarnings')
    known = isinstance(warnings, list) and all(isinstance(w, str) for w in warnings)
    return {'benchmark_index': value,
            'run_warnings': len(warnings) if known else None,
            'slow_host_warning': any(SLOW_HOST_WARNING in w for w in warnings) if known else None}


def render_host_evidence(runs):
    if not runs:
        return []
    lines = ['', 'Measuring machine (report-only; Lighthouse benchmarkIndex, higher is faster; '
             f'Lighthouse warns at or below {SLOW_HOST_THRESHOLD}; never used for a budget result):']
    for group in GROUPS:
        selected = [r.get('host') or {} for r in runs if r.get('group') == group]
        if not selected:
            continue
        values = [h.get('benchmark_index') for h in selected]
        shown = ', '.join('unavailable' if v is None else f'{v:.0f}' for v in values)
        known = [v for v in values if v is not None]
        median = f'; median {statistics.median(known):.0f}' if len(known) == len(values) else ''
        flags = [h.get('slow_host_warning') for h in selected]
        if any(flag is None for flag in flags):
            warned = 'slow-host warning unavailable'
        else:
            warned = f'slow-host warning in {sum(flags)} of {len(flags)} runs'
        lines.append(f'- {group}: benchmarkIndex {shown}{median}; {warned}')
    return lines


def strict_host(value):
    """Host of an http(s) request URL as the report serialized it, or None.

    Userinfo, whitespace and a malformed port are rejected: those are where this parser and a
    browser could name different hosts for the same text.
    """
    if not isinstance(value, str) or len(value) > 4096 or any(c.isspace() or not c.isprintable() for c in value):
        return None
    try:
        parts = urlsplit(value)
        if parts.scheme not in ('http', 'https') or not parts.hostname or parts.username is not None or parts.password is not None:
            return None
        parts.port  # Reject malformed ports, including out-of-range values.
    except ValueError:
        return None
    return parts.hostname.lower()


def google_tag_impact(report):
    """Lighthouse's TBT impact (ms) of scripts served from the Google tag host; None when unreadable.

    Unreadable is not zero. The caller then leaves the whole TBT with the site, so a missing
    or malformed table can make the site's budget fail but can never make it pass.
    """
    audits = report.get('audits')
    audit = audits.get('third-party-summary') if isinstance(audits, dict) else None
    if not isinstance(audit, dict):
        return None
    if audit.get('scoreDisplayMode') == 'notApplicable' and 'details' not in audit:
        return 0.0  # Lighthouse saw no third-party code in this run.
    details = audit.get('details')
    entities = details.get('items') if isinstance(details, dict) else None
    if not isinstance(entities, list):
        return None
    total, seen = 0.0, 0
    for entity in entities:
        sub = entity.get('subItems') if isinstance(entity, dict) else None
        urls = sub.get('items') if isinstance(sub, dict) else None
        if not isinstance(urls, list):
            return None
        for item in urls:
            seen += 1
            if seen > DIAGNOSTIC_SCAN_LIMIT or not isinstance(item, dict):
                return None
            host = strict_host(item.get('url'))
            if host is None:
                return None
            if host not in GOOGLE_TAG_HOSTS:
                continue
            value = item.get('tbtImpact')
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                return None
            total += value
    return total


def tbt_split(report, tbt, benchmark_index):
    """One run's TBT as the site's share (judged) and the Google tag's share (recorded)."""
    impact = google_tag_impact(report)
    if impact is None:
        return {'google_tag_impact_ms': None, 'site_tbt_ms': tbt, 'google_tag_index': None}
    if impact == 0:
        index = 0.0
    else:
        index = impact * benchmark_index / 1000 if benchmark_index is not None else None
    return {'google_tag_impact_ms': impact, 'site_tbt_ms': max(0.0, tbt - PESSIMISTIC_WEIGHT * impact),
            'google_tag_index': index}


def render_tbt_split(summary):
    runs = summary.get('runs', [])
    if not runs:
        return []
    lines = ['', f"TBT split (the {SITE_TBT_BUDGET} ms budget is judged on the site's share: total minus "
             f"{PESSIMISTIC_WEIGHT:g} x the Google tag's TBT impact, never less than the site's real share; "
             f'tag weight index = impact x benchmarkIndex / 1000, watch level {GOOGLE_TAG_WATCH}):']

    def shown(values, digits=0):
        return ' / '.join('unavailable' if v is None else f'{v:.{digits}f}' for v in values)

    for group in GROUPS:
        selected = [r for r in runs if r.get('group') == group]
        if not selected:
            continue
        split = [r['tbt_split'] for r in selected]
        site = [s['site_tbt_ms'] for s in split]
        lines.append(f"- {group}: total {shown([r['metrics'][METRICS[2]] for r in selected])}; "
                     f"Google tag impact {shown([s['google_tag_impact_ms'] for s in split])}; "
                     f'site at most {shown(site)} (median {statistics.median(site):.0f}); '
                     f"tag weight index {shown([s['google_tag_index'] for s in split])}")
    notices = summary.get('notices', [])
    if notices:
        lines += ['', 'Google tag watch (fails the scheduled run only; never a site budget result):']
        lines += [f'- {notice}' for notice in notices]
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
    host = host_evidence(report)
    return {'file': path.name, 'group': group, 'performance': categories['performance'] * 100,
            'categories': categories, 'metrics': metrics, 'warnings': report.get('runWarnings', []),
            'trace_diagnostics': diagnostics(report), 'public_diagnostics': public_diagnostics(report),
            'host': host, 'tbt_split': tbt_split(report, metrics[METRICS[2]], host['benchmark_index'])}


def summarize(root: Path, *, require_production=False, expected_commit=None, enforce_watch=False):
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
    medians, failures, enforced, notices = {}, [], [], []
    for group in GROUPS:
        selected = [r for r in rows if r['group'] == group]
        medians[group] = {'performance': statistics.median(r['performance'] for r in selected),
                          **{key: statistics.median(r['metrics'][key] for r in selected) for key in METRICS},
                          'site_tbt': statistics.median(r['tbt_split']['site_tbt_ms'] for r in selected)}
        # The tag is the same script whatever this checkout changes, so it is watched on every
        # production measurement, verified or not. Local pages never load it (hostname guard).
        if group.startswith('production-'):
            split = [r['tbt_split'] for r in selected]
            unread = sum(s['google_tag_impact_ms'] is None for s in split)
            unscaled = sum(s['google_tag_index'] is None for s in split) - unread
            if unread:
                notices.append(f'{group}: Google tag impact unavailable in {unread} of {len(split)} runs; '
                               'their whole TBT was left with the site')
            elif unscaled:
                notices.append(f'{group}: Google tag weight index unavailable in {unscaled} of {len(split)} runs '
                               '(no benchmarkIndex)')
            else:
                medians[group]['google_tag_index'] = statistics.median(s['google_tag_index'] for s in split)
                if medians[group]['google_tag_index'] > GOOGLE_TAG_WATCH:
                    notices.append(f"{group}: Google tag weight index {medians[group]['google_tag_index']:.0f} "
                                   f'exceeds the watch level {GOOGLE_TAG_WATCH}')
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
        if medians[group]['site_tbt'] > SITE_TBT_BUDGET:
            failures.append(f'{group}: median site TBT exceeds {SITE_TBT_BUDGET} ms')
        if any(r['metrics'][METRICS[3]] > 0.1 for r in selected):
            failures.append(f'{group}: a run exceeds CLS 0.1')
        for category in CATEGORIES[1:]:
            if any(r['categories'][category] != 1 for r in selected):
                failures.append(f'{group}: {category} fell below 100')
    if enforce_watch:
        failures.extend(notices)
    return {'measurement': MEASUREMENT, 'runs': rows, 'medians': medians,
            'variability': group_variability(rows, BUDGETS, METRICS),
            'production_verified': verified, 'enforced_groups': enforced,
            'notices': notices, 'watch_enforced': enforce_watch,
            'status': 'failure' if failures else 'success', 'failures': failures}


def render(summary):
    lines = ['| Run | Performance | FCP (s) | LCP (s) | TBT (ms) | CLS |', '|---|---:|---:|---:|---:|---:|']
    for row in summary.get('runs', []):
        a = row['metrics']
        lines.append(f"| {row['file']} | {row['performance']:.0f} | {a[METRICS[0]]/1000:.2f} | {a[METRICS[1]]/1000:.2f} | {a[METRICS[2]]:.0f} | {a[METRICS[3]]:.4f} |")
    lines += render_variability(summary.get('variability', {}))
    lines += render_host_evidence(summary.get('runs', []))
    lines += render_tbt_split(summary)
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
    # The daily run is the one that reports on the Google tag; a pull request is not failed for it.
    watch = os.environ.get('GITHUB_EVENT_NAME') == 'schedule'
    try:
        summary = summarize(root, require_production=required, expected_commit=os.environ.get('PERF_EXPECTED_COMMIT'),
                            enforce_watch=watch)
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
