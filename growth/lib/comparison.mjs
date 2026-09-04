/** Compare only complete, equal-length, disjoint search windows. */
export function assessComparison(current, previous) {
  const window = (snapshot) => {
    const m = snapshot?.meta;
    if (!m) return null;
    const parse = (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
      const ms = Date.parse(value + 'T00:00:00Z');
      return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
    };
    const start = parse(m.period_start), end = parse(m.period_end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    const days = (end - start) / 86400000 + 1;
    const b = m.bigquery;
    return { start, end, days,
      incomplete: m.complete_window === false || (b && b.window_days_available < b.window_days_requested),
      type: b?.search_type || m.search_type || 'WEB',
      aggregation: m.totals?.source || 'unknown',
    };
  };
  const a = window(current), b = window(previous);
  const result = { comparable: false, current_days: a?.days ?? null, previous_days: b?.days ?? null };
  if (!a || !b) return { ...result, reason: 'missing_or_invalid_period' };
  if (a.incomplete || b.incomplete) return { ...result, reason: 'incomplete_window' };
  if (a.days !== b.days) return { ...result, reason: 'different_window_lengths' };
  if (a.type !== b.type || a.aggregation !== b.aggregation || a.aggregation === 'unknown') {
    return { ...result, reason: 'different_or_unknown_aggregation' };
  }
  if (b.end >= a.start) return { ...result, reason: 'overlapping_or_reversed_windows' };
  return { ...result, comparable: true, reason: null };
}

/** Daily/weekly snapshots usually overlap. Look back to the closest valid window. */
export function selectComparison(current, candidates) {
  return [...candidates].sort((a, b) => (b.meta?.period_end || '').localeCompare(a.meta?.period_end || ''))
    .find(previous => assessComparison(current, previous).comparable) || null;
}
