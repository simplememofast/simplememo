"""Descriptive lab variability, never population percentiles or causal claims."""
from __future__ import annotations
import math
import statistics

TRACE_PARTS = ('timeToFirstByte', 'resourceLoadDelay', 'resourceLoadDuration', 'elementRenderDelay')


def finite(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value >= 0


def distribution(values):
    """Keep every run, including outliers; MAD is median absolute deviation."""
    values = list(values)
    if not values or not all(finite(value) for value in values):
        raise ValueError('A distribution requires finite nonnegative samples')
    center = statistics.median(values)
    return {'count': len(values), 'min': min(values), 'median': center,
            'max': max(values), 'range': max(values) - min(values),
            'mad': statistics.median(abs(value - center) for value in values)}


def diagnostics(report):
    """Optional trace data is separate from simulated scores; absent is unknown."""
    audits = report.get('audits', {})
    result = {'source': 'observed browser trace before simulation, NOT simulated mobile timings',
              'observed_lcp_ms': None, 'observed_fcp_ms': None,
              'lcp_parts_ms': {key: None for key in TRACE_PARTS}, 'unavailable': []}
    def items(key):
        audit = audits.get(key)
        details = audit.get('details') if isinstance(audit, dict) else None
        found = details.get('items') if isinstance(details, dict) else None
        return found if isinstance(found, list) else []

    metrics = items('metrics')
    metric = metrics[0] if metrics and isinstance(metrics[0], dict) else {}
    for source, target in [('observedLargestContentfulPaint', 'observed_lcp_ms'),
                           ('observedFirstContentfulPaint', 'observed_fcp_ms')]:
        value = metric.get(source)
        if finite(value):
            result[target] = value
        else:
            result['unavailable'].append(source)
    tables = items('lcp-breakdown-insight')
    parts = tables[0].get('items', []) if tables and isinstance(tables[0], dict) else []
    parts = parts if isinstance(parts, list) else []
    for key in TRACE_PARTS:
        candidates = [part.get('duration') for part in parts
                      if isinstance(part, dict) and part.get('subpart') == key]
        if len(candidates) == 1 and finite(candidates[0]):
            result['lcp_parts_ms'][key] = candidates[0]
        else:
            result['unavailable'].append(key)
    return result


def group_variability(rows, budgets, metric_names):
    result = {}
    for group, (score_limit, lcp_limit) in budgets.items():
        selected = [row for row in rows if row['group'] == group]
        result[group] = {
            'performance': distribution(row['performance'] for row in selected),
            **{key: distribution(row['metrics'][key] for row in selected) for key in metric_names},
            'runs_below_score_budget': sum(row['performance'] < score_limit for row in selected),
            'runs_above_lcp_budget': sum(row['metrics']['largest-contentful-paint'] > lcp_limit for row in selected),
            'interpretation': 'Descriptive samples only; median-based gates are unchanged. Not CrUX, p75/p95, or proof of causation.',
        }
    return result


def render_variability(groups):
    if not groups:
        return []
    lines = ['', '## Sample variability (all runs retained)', '',
             '| Group | n | Score min / median / max | LCP min / median / max (s) | LCP MAD (ms) | Runs below score / above LCP budget |',
             '|---|---:|---:|---:|---:|---:|']
    for group, data in groups.items():
        score, lcp = data['performance'], data['largest-contentful-paint']
        scores = ' / '.join(f'{score[key]:.0f}' for key in ('min', 'median', 'max'))
        lcps = ' / '.join(f'{lcp[key] / 1000:.2f}' for key in ('min', 'median', 'max'))
        lines.append(f"| {group} | {score['count']} | {scores} | {lcps} | {lcp['mad']:.1f} | {data['runs_below_score_budget']} / {data['runs_above_lcp_budget']} |")
    lines += ['', 'MAD = median absolute deviation. These small samples describe this audit only, not user-population percentiles.',
              'Outlier counts are diagnostic, not new gates; existing median budgets remain unchanged.',
              'Trace diagnostics in summary.json are observed timings, separate from the simulated mobile metrics above. Missing trace values are null, never zero.']
    return lines
