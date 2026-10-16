// Whole-window totals are repeated on grouped funnel rows. Never sum them.
const fields = ['site_window_page_views', 'site_window_observed_visitors'];
function count(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function websiteVisitTotals(rows, connected = false) {
  const unknown = reason => ({ state: 'unavailable', reason, page_views: null, observed_visitors: null });
  if (!connected || !Array.isArray(rows) || !rows.length) return unknown('verified_report_unavailable');
  if (rows.every(r => fields.every(k => r[k] == null))) return unknown('legacy_report_without_visit_totals');
  const values = rows.map(r => fields.map(k => count(r[k])));
  if (values.some(([pv, users]) => pv === null || users === null || users > pv || (pv > 0 && users === 0)))
    return unknown('invalid_or_missing_visit_totals');
  if (values.some(([pv, users]) => pv !== values[0][0] || users !== values[0][1]))
    return unknown('conflicting_repeated_visit_totals');
  return { state: 'observed_diagnostic', definition_version: 'ga4-site-window-visits-v1',
    page_views: values[0][0], observed_visitors: values[0][1],
    scope: 'Production page_view events dated within the inclusive JST window, with existing nonempty user_pseudo_id and session_id. Visitors are distinct observed browser identifiers across the whole window, not people or sums of per-page users. No identifiers leave the query. Excludes following-day events; independent of the 24h session cohort. Internal use and bots are not verified excluded.' };
}
