/** Evidence admission, not a test of statistical significance or causality. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const DAY = 86400000;
const SEARCH_METRICS = ['ctr', 'position', 'impressions'];
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const present = (x) => typeof x === 'string' && x.trim().length > 0;
export const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (x) => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);

export function metricSource(exp) {
  const metric = exp.target_metric || '';
  if ([...SEARCH_METRICS, 'brand_search_impressions', 'rich_result_impressions', 'conversational_query_position'].includes(metric)) return 'gsc';
  if (/^App Store Connect campaign installs/.test(metric)) return 'asc';
  if (/app_store_click|next_step_click/.test(metric)) return 'ga4';
  if (metric === 'ai_citations') return 'ai_citations';
  // New metrics need an explicit contract; do not infer their source from a number.
  return exp.measurement_contract?.source || null;
}

function dateNumber(date) {
  requireThat(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date), 'Date must be YYYY-MM-DD');
  const n = Date.parse(date);
  requireThat(Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === date, 'Invalid calendar date');
  return n;
}

export function period(start, end) {
  const days = (dateNumber(end) - dateNumber(start)) / DAY + 1;
  requireThat(days > 0, 'Period end precedes start');
  return { start, end, days };
}

function baselinePeriod(exp) {
  const match = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})(?: \(\d+d\))?$/.exec(exp.baseline?.window || '');
  requireThat(match, 'A dated baseline.window is required; recover the comparable baseline or document a measurement failure');
  return period(match[1], match[2]);
}

function comparablePeriods(exp, before, after, asOf, lagDays) {
  dateNumber(exp.started_at);
  requireThat(before.end < exp.started_at, 'Baseline must end before the change');
  requireThat(after.start > exp.started_at, 'Post period must start after the launch day');
  requireThat(before.end < after.start, 'Baseline and post period overlap');
  requireThat(before.days === after.days, 'Baseline and post period must have the same number of days');
  requireThat(dateNumber(asOf) - dateNumber(after.end) >= lagDays * DAY, `Post period requires at least ${lagDays} complete calendar days of lag`);
}

export function gscScope(exp) {
  requireThat(metricSource(exp) === 'gsc' && SEARCH_METRICS.includes(exp.target_metric), 'This metric needs --review with its own source and measurement contract; GSC page data cannot substitute');
  const scope = exp.measurement_scope || { kind: 'page', page: exp.page };
  requireThat(exp.type !== 'faq_add' || exp.measurement_scope, 'FAQ scope must be explicit; page totals cannot substitute for a query');
  requireThat(['page', 'query_page'].includes(scope.kind) && typeof scope.page === 'string' && scope.page.startsWith('/') && !scope.page.startsWith('//'), 'A single exact page or query_page scope is required');
  requireThat(scope.page === exp.page, 'Measurement page differs from the registered experiment');
  requireThat(scope.kind !== 'query_page' || present(scope.query), 'Exact query is required for query_page scope');
  requireThat(Object.keys(scope).every(k => ['kind', 'page', 'query'].includes(k)), 'Additional GSC filters need an explicit review contract');
  return scope;
}

function searchValue(row, metric) {
  requireThat(Number.isInteger(row?.clicks) && row.clicks >= 0 && Number.isInteger(row.impressions)
    && row.impressions >= row.clicks, 'Search row needs valid clicks and impressions');
  if (metric === 'impressions') return row.impressions;
  if (!row.impressions) return null; // observed zero volume, not a missing row
  if (metric === 'ctr') return row.clicks / row.impressions;
  requireThat(Number.isFinite(row.position) && row.position >= 1, 'Search position must be measured and positive');
  return row.position;
}

export function gscEvidence(exp, snapshot, { asOf, decision, files = [] } = {}) {
  const scope = gscScope(exp);
  const before = baselinePeriod(exp);
  const after = period(snapshot.meta.period_start, snapshot.meta.period_end);
  comparablePeriods(exp, before, after, asOf, 3);
  requireThat(snapshot.meta.search_type == null || snapshot.meta.search_type.toUpperCase() === 'WEB', 'Non-WEB search data cannot be used for this comparison');
  requireThat(snapshot.meta.time_zone == null || snapshot.meta.time_zone === 'America/Los_Angeles', 'GSC periods must use Pacific time');
  requireThat(snapshot.meta.complete_window !== false, 'Snapshot declares an incomplete period');
  const dates = snapshot.dates || [];
  requireThat(dates.length === after.days && new Set(dates.map(r => r.date)).size === after.days,
    'Daily coverage is missing, duplicated, or incomplete');
  for (const row of dates) {
    dateNumber(row.date);
    requireThat(row.date >= after.start && row.date <= after.end, 'Daily row is outside the declared period');
    searchValue(row, 'impressions');
  }
  const rows = scope.kind === 'query_page' ? snapshot.queryPages : snapshot.pages;
  requireThat(Array.isArray(rows), 'Search dimension rows are missing');
  const matches = rows.filter(r => r.page === scope.page && (scope.kind !== 'query_page' || r.query === scope.query));
  requireThat(matches.length === 1, 'Exactly one matching measurement row is required; missing rows are not zero');
  const value = searchValue(matches[0], exp.target_metric);
  requireThat(value !== null || decision === 'inconclusive', 'Zero impressions cannot support a CTR/position outcome; use inconclusive');
  const baselineValue = searchValue(exp.baseline, exp.target_metric);
  requireThat(baselineValue !== null, 'No comparable numeric baseline for the target metric');
  return {
    schema_version: 1, kind: 'gsc_comparison', source: 'gsc', target_metric: exp.target_metric,
    scope, gsc_snapshots: [snapshot.label],
    baseline: { ...before, value: baselineValue, registered_baseline_sha256: fingerprint(canonical(exp.baseline)) },
    post: { ...after, value, clicks: matches[0].clicks, impressions: matches[0].impressions,
      position: matches[0].position ?? null },
    artifacts: files,
    validation: 'metric, exact row, numeric values, complete post dates and comparable windows; decision interpretation is manual',
    limitations: [
      'Baseline values are those registered in the ledger; their original extraction is not revalidated here.',
      'Daily coverage is snapshot-wide, not per page. No test of significance, minimum sample adequacy or causality is performed.',
      ...(snapshot.meta.search_type == null ? ['Legacy snapshot has no search-type metadata; WEB is the store convention and must be checked against the export filters.'] : []),
      ...(snapshot.meta.time_zone == null ? ['Legacy snapshot has no timezone metadata; verify Pacific dates in the source export.'] : []),
    ],
  };
}

function artifact(ref, baseDir, expectedSource = null) {
  requireThat(ref && present(ref.path) && /^[a-f0-9]{64}$/.test(ref.sha256 || ''), 'Artifact path and SHA-256 are required');
  const file = path.resolve(baseDir, ref.path);
  const bytes = fs.readFileSync(file);
  requireThat(bytes.length > 0 && fingerprint(bytes) === ref.sha256, 'Artifact is empty or its SHA-256 does not match');
  if (path.extname(file) === '.json' && expectedSource) {
    const data = JSON.parse(bytes);
    // Recognize the existing API envelope. Other formats need manual extraction.
    if (data.report) {
      const actual = data.report === 'gsc' ? 'gsc' : /^ga4/.test(data.report) ? 'ga4' : null;
      requireThat(!actual || actual === expectedSource, 'Artifact report belongs to a different metric source');
      requireThat(data.status === 'complete' && data.execution === 'export'
        && Array.isArray(data.queries) && data.queries.some(q => q.result?.rows?.length), 'API artifact contains no exported measurement rows');
    } else {
      requireThat(Array.isArray(data) ? data.length > 0 : Array.isArray(data.rows) && data.rows.length > 0,
        'JSON comparison artifacts need measurement rows; metadata alone is insufficient');
    }
  }
  // Private source paths and contents stay outside the public ledger.
  return { name: path.basename(file), sha256: ref.sha256, bytes: bytes.length };
}

export function reviewEvidence(exp, review, { baseDir, asOf, decision, manifestSha256 } = {}) {
  requireThat(review.schema_version === 1 && review.experiment_id === exp.id
    && review.target_metric === exp.target_metric && review.decision === decision, 'Review must match the experiment, target metric and decision');
  requireThat(present(review.reviewed_by) && present(review.rationale), 'Review author and rationale are required');
  if (review.kind === 'diagnostic') {
    requireThat(decision === 'measurement_failed', 'A diagnostic review can only record measurement_failed');
    requireThat(Array.isArray(review.findings) && review.findings.length > 0 && review.findings.every(present), 'Diagnostic findings are required');
    requireThat(Array.isArray(review.artifacts) && review.artifacts.length > 0, 'Diagnostic source artifacts are required');
    return { schema_version: 1, kind: 'measurement_diagnostic', target_metric: exp.target_metric,
      gsc_snapshots: [], reviewed_by: review.reviewed_by, rationale: review.rationale,
      findings: review.findings, artifacts: review.artifacts.map(r => artifact(r, baseDir)), manifest_sha256: manifestSha256,
      validation: 'artifact integrity and explicit diagnostic review; no efficacy comparison' };
  }
  requireThat(review.kind === 'comparison' && ['keep', 'revert', 'iterate', 'inconclusive'].includes(decision), 'A comparison review is required for this decision');
  const c = exp.measurement_contract;
  requireThat(c && present(c.definition) && present(c.unit) && present(c.time_zone) && c.scope && typeof c.scope === 'object',
    'A registered measurement_contract (source, definition, unit, timezone and scope) is required');
  const source = metricSource(exp);
  requireThat(['gsc', 'ga4', 'asc', 'ai_citations', 'd1'].includes(source)
    && review.source === source && c.source === source, 'Review source differs from the metric source');
  for (const field of ['definition', 'unit', 'time_zone', 'scope']) {
    requireThat(canonical(review[field]) === canonical(c[field]), `Review ${field} differs from the measurement contract`);
  }
  requireThat(exp.baseline?.metric === exp.target_metric && Number.isFinite(exp.baseline.value),
    'Baseline must explicitly measure this target metric; unrelated historical numbers cannot substitute');
  const registered = baselinePeriod(exp);
  const before = period(review.baseline?.start, review.baseline?.end);
  const after = period(review.post?.start, review.post?.end);
  requireThat(canonical(before) === canonical(registered) && review.baseline.value === exp.baseline.value, 'Review baseline differs from the registered metric value or window');
  requireThat(Number.isInteger(c.lag_days) && c.lag_days >= (source === 'ga4' ? 5 : source === 'gsc' ? 3 : 1), 'Measurement contract needs a sufficient data lag');
  comparablePeriods(exp, before, after, asOf, c.lag_days);
  const readPeriod = (p, window) => {
    requireThat(Number.isFinite(p.value) && present(p.extraction), 'Both periods need a numeric result and an extraction reference');
    if (c.unit === 'ratio') requireThat(p.value >= 0 && p.value <= 1, 'Ratio must be between zero and one');
    if (c.unit === 'count') requireThat(Number.isInteger(p.value) && p.value >= 0, 'Count must be a non-negative integer');
    if (c.unit === 'position') requireThat(p.value >= 1, 'Position must be positive');
    requireThat(p.complete === true && p.definition === c.definition && p.unit === c.unit
      && p.time_zone === c.time_zone && canonical(p.scope) === canonical(c.scope), 'Both periods must use the registered definition, unit, timezone and scope');
    return { ...window, value: p.value, extraction: p.extraction, artifact: artifact(p.artifact, baseDir, source) };
  };
  requireThat(Array.isArray(review.limitations) && review.limitations.length > 0 && review.limitations.every(present), 'Comparison limitations are required');
  return { schema_version: 1, kind: 'manual_comparison', source, target_metric: exp.target_metric,
    gsc_snapshots: [], scope: c.scope, definition: c.definition, unit: c.unit, time_zone: c.time_zone,
    baseline: readPeriod(review.baseline, before), post: readPeriod(review.post, after),
    reviewed_by: review.reviewed_by, rationale: review.rationale, limitations: review.limitations,
    manifest_sha256: manifestSha256,
    validation: 'contract consistency and artifact integrity only; extraction, coverage and interpretation were manually reviewed, not independently recomputed' };
}
