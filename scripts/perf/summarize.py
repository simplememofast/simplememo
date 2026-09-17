#!/usr/bin/env python3
"""Validate all mobile lab runs; gate local pages and verified production only."""
from __future__ import annotations
import json
import math
import os
from pathlib import Path
import statistics
from variability import diagnostics, group_variability, render_variability

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
            'categories': categories, 'metrics': metrics, 'warnings': report.get('runWarnings', []), 'trace_diagnostics': diagnostics(report)}


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
