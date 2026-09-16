#!/usr/bin/env python3
"""Report every lab run and enforce the local mobile regression budget."""
import json
import os
from pathlib import Path
import statistics

root = Path(os.environ['PERF_RESULTS'])
keys = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift']
rows = []
for path in sorted(root.glob('*.report.json')):
    report = json.loads(path.read_text())
    if report.get('runtimeError') or report['categories']['performance']['score'] is None:
        raise SystemExit(f'Invalid Lighthouse measurement: {path.name}')
    row = {'file': path.name, 'performance': round(report['categories']['performance']['score'] * 100), 'metrics': {key: report['audits'][key]['numericValue'] for key in keys}, 'categories': {key: value['score'] for key, value in report['categories'].items()}}
    rows.append(row)
local = [row for row in rows if row['file'].startswith('local-ja-')]
assert len(local) == 3, 'Exactly three local Japanese mobile runs are required.'
medians = {}
for prefix in ['local-ja-', 'production-ja-']:
    selected = [row for row in rows if row['file'].startswith(prefix)]
    if selected:
        medians[prefix.rstrip('-')] = {'performance': statistics.median(row['performance'] for row in selected), **{key: statistics.median(row['metrics'][key] for row in selected) for key in keys}}
summary = {'measurement': 'Lighthouse 12.8.2 default simulated mobile; cold browser per run; no analytics suppression in Lighthouse; local gzip server is not the production CDN; not CrUX field data.', 'runs': rows, 'medians': medians}
(root / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
lines = ['| Run | Performance | FCP (s) | LCP (s) | TBT (ms) | CLS |', '|---|---:|---:|---:|---:|---:|']
for row in rows:
    a = row['metrics']
    lines.append(f"| {row['file']} | {row['performance']} | {a[keys[0]]/1000:.2f} | {a[keys[1]]/1000:.2f} | {a[keys[2]]:.0f} | {a[keys[3]]:.4f} |")
text = '\n'.join(lines) + '\n\n' + summary['measurement'] + '\n'
(root / 'summary.md').write_text(text)
print(text)
if os.environ.get('GITHUB_STEP_SUMMARY'):
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as handle:
        handle.write(text)
assert medians['local-ja']['performance'] >= 90, 'Local mobile median performance fell below 90.'
assert medians['local-ja'][keys[1]] <= 3000, 'Local mobile median LCP exceeded 3 seconds.'
assert max(row['metrics'][keys[3]] for row in local) <= 0.1, 'A local mobile run exceeded the CLS budget.'
assert all(row['categories']['seo'] == 1 and row['categories']['accessibility'] == 1 for row in local), 'Japanese homepage SEO or accessibility regressed.'
print('PASS: local mobile performance, LCP, layout stability, SEO and accessibility budgets.')
