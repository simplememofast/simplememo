import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from './company-metrics.mjs';
import { privateState, atomicJson } from './company-loop.mjs';
import { validateOptions } from '../scripts/export-analytics.mjs';
import { period } from './experiment-evidence.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const requireThat = (condition, reason) => { if (!condition) throw new Error(reason); };
const DAY = 86400000;
const nextDay = day => new Date(Date.parse(day) + DAY).toISOString().slice(0, 10);
const DIMS = ['session_channel', 'session_source', 'session_medium', 'session_attribution_status',
  'landing_referrer_host', 'landing_referrer_status', 'landing_scope', 'landing_path', 'device_category', 'device_language'];
const COUNTS = ['observed_started_sessions', 'sessions_with_own_app_click_24h', 'sessions_with_cta_impression',
  'clicked_without_recorded_impression', 'sessions_with_onelink_impression', 'sessions_with_onelink_click_24h',
  'onelink_clicked_without_recorded_impression', 'sessions_with_onelink_qa_click_24h',
  'sessions_with_both_app_routes_24h', 'sessions_with_any_app_route_click_24h'];
const QUALITY = ['events_without_session_key', 'analytics_storage_denied_events', 'missing_session_channel_events',
  'cta_version_missing_or_other', 'click_target_invalid_or_missing', 'cta_dimensions_incomplete',
  'onelink_version_missing_or_other', 'onelink_target_invalid_or_missing', 'onelink_dimensions_incomplete', 'onelink_qa_scope_mismatch'];
const DEFINITION = 'Observed production landing sessions in the JST start-date cohort with an app_store_click to Apple app 6758438948, measurement_version=2026-09-05, within 24 hours of session_start / all observed started sessions in that same landing cohort. Only session_channel=Organic Search. No impression requirement; mirrored seo_cta_click and OneLink clicks are not added.';
const LIMITATIONS = [
  'Observed exported web sessions, not GA4 UI parity, unique people, installations, QR scans or revenue. Production hostname does not exclude internal use or bots.',
  'Landing-page cohort: the click can occur on a later page in the same session. No click-page or placement dimension is available; never use this as an inline-placement metric.',
  'Daily table coverage includes the following day for the 24-hour outcome. Quality event dates are not session cohorts and table presence does not establish complete population capture.',
  'A retained observation is not a registered experiment baseline or evidence of treatment effect. Freeze scope and an equally long post window before an eligible future change, using the original experiment gates. Never retrofit the four failed CTA/QR experiments.',
  'No statistical power, single-cause effect or minimum sample adequacy is inferred. Preserve concurrent changes, missing rows and original measurement failures.',
];

function count(value) {
  requireThat((typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0, 'invalid_count');
  return Number(value);
}
function sum(rows, key) { return count(rows.reduce((n, row) => n + count(row[key]), 0)); }
function readPrivate(file, stateRoot) {
  const resolved = fs.realpathSync(file), stat = fs.lstatSync(file);
  requireThat(resolved.startsWith(fs.realpathSync(stateRoot) + path.sep) && stat.isFile()
    && !stat.isSymbolicLink() && stat.uid === process.getuid() && !(stat.mode & 0o077), 'source_not_private');
  const bytes = fs.readFileSync(file);
  return { bytes, value: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)) };
}

// Reuse the original collector receipt and bytes; no API, query or model calls.
export function companyCtaMeasurement({ stateRoot, root = ROOT, now = new Date(), connection } = {}) {
  let source = null;
  try {
    const c = connection ?? readPrivate(path.join(stateRoot, 'data/connections.json'), stateRoot).value.ga4;
    const r = c?.collection;
    requireThat(c?.status === 'CONNECTED' && r?.source === 'ga4-funnel' && r.status === 'verified', 'verified_funnel_unavailable');
    const window = period(r.window?.start, r.window?.end);
    validateOptions({ report: 'ga4-funnel', execution: 'export', start: window.start, end: window.end }, now);
    const receipt = readPrivate(path.join(stateRoot, 'data/collection-receipts', `ga4-funnel-${window.end}.json`), stateRoot).value;
    for (const key of ['status', 'source', 'output', 'sha256', 'source_commit', 'run_id', 'request_tag', 'verified_at']) {
      requireThat(r[key] != null && r[key] === receipt[key], 'collector_receipt_mismatch');
    }
    requireThat(JSON.stringify(r.window) === JSON.stringify(receipt.window) && c.evidence === r.output, 'collector_receipt_mismatch');
    const { bytes, value: report } = readPrivate(r.output, stateRoot);
    requireThat(hash(bytes) === r.sha256, 'source_hash_mismatch');
    source = { sha256: r.sha256, run_id: r.run_id, source_commit: r.source_commit, artifact: r.output, observed_at: report.observed_at };
    requireThat(report.schema_version === 1 && report.report === 'ga4-funnel' && report.execution === 'export'
      && report.status === 'complete' && !report.provisional && report.project === 'yurika-simplememo'
      && report.location === 'asia-northeast1' && report.start === window.start && report.end === window.end
      && String(report.run_id) === String(r.run_id) && report.source_sha === r.source_commit, 'source_identity_mismatch');
    requireThat(/^[a-f0-9]{40}$/.test(r.source_commit) && Number.isSafeInteger(Number(r.run_id)) && Number(r.run_id) > 0, 'source_identity_mismatch');
    const observed = Date.parse(report.observed_at), verified = Date.parse(r.verified_at);
    requireThat(Number.isFinite(observed) && observed <= verified && verified <= now.getTime()
      && now.getTime() - verified <= 8 * DAY && now.getTime() - observed <= 8 * DAY, 'source_time_invalid_or_stale');
    validateOptions({ report: 'ga4-funnel', execution: 'export', start: window.start, end: window.end }, new Date(observed));
    const endPlusOne = nextDay(window.end), coverage = report.coverage;
    requireThat(Array.isArray(coverage) && coverage.length === window.days + 1
      && new Set(coverage.map(d => d.day)).size === coverage.length, 'daily_coverage_invalid');
    for (let day = window.start; day <= endPlusOne; day = nextDay(day)) {
      requireThat(coverage.some(d => d.day === day && d.present === true), 'daily_coverage_invalid');
    }
    requireThat(Array.isArray(report.queries) && report.queries.length === 2, 'query_set_invalid');
    const query = file => {
      const matches = report.queries.filter(q => q.file === file);
      requireThat(matches.length === 1, 'query_set_invalid');
      const q = matches[0];
      requireThat(q.sql_sha256 === hash(fs.readFileSync(path.join(root, 'growth/sql/analytics', file))), 'query_definition_changed');
      const params = { start_date: window.start, end_date: window.end,
        ...(file === 'ga4-quality.sql' ? { scan_end_date: endPlusOne } : {}),
        measurement_version: '2026-09-05', bridge_measurement_version: '2026-09-07' };
      requireThat(Object.keys(q.params ?? {}).length === Object.keys(params).length
        && Object.entries(params).every(([k, v]) => q.params[k] === v), 'query_parameters_mismatch');
      requireThat(Array.isArray(q.result?.rows) && q.result.rows.length > 0 && q.result.location === 'asia-northeast1'
        && q.result.statementType === 'SELECT' && typeof q.result.jobId === 'string' && q.result.jobId.length > 0, 'query_result_missing');
      return q.result.rows;
    };
    const quality = query('ga4-quality.sql'), funnel = query('ga4-funnel.sql');
    const qualityKeys = new Set(), issues = [];
    for (const row of quality) {
      const day = String(row.event_date).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
      period(day, day);
      const key = JSON.stringify([row.event_date, row.hostname_scope, row.event_name]);
      requireThat(!qualityKeys.has(key) && day >= window.start && day <= endPlusOne
        && ['production', 'nonproduction', 'missing_hostname'].includes(row.hostname_scope)
        && typeof row.event_name === 'string' && row.event_name.length > 0, 'quality_dimension_invalid');
      qualityKeys.add(key);
      const events = count(row.recorded_events);
      for (const field of QUALITY) {
        const n = count(row[field]); requireThat(n <= events, 'quality_count_invalid');
        if (n) issues.push({ event_date: row.event_date, hostname_scope: row.hostname_scope, event_name: row.event_name, field, count: n });
      }
    }
    // These defects affect the numerator/denominator of this metric. Impression
    // version issues stay visible but do not become a different denominator.
    const blockingIssues = issues.filter(i => i.hostname_scope !== 'nonproduction'
      && ['session_start', 'page_view', 'app_store_click'].includes(i.event_name)
      && ['events_without_session_key', 'analytics_storage_denied_events', 'missing_session_channel_events',
        'cta_version_missing_or_other', 'click_target_invalid_or_missing'].includes(i.field));
    const keys = new Set();
    for (const row of funnel) {
      requireThat(DIMS.every(k => Object.hasOwn(row, k) && (row[k] === null || typeof row[k] === 'string')), 'funnel_dimension_invalid');
      const key = JSON.stringify(DIMS.map(k => row[k]));
      requireThat(!keys.has(key), 'duplicate_funnel_row'); keys.add(key);
      for (const field of COUNTS) requireThat(count(row[field]) <= count(row.observed_started_sessions), 'funnel_count_invalid');
      const n = count(row.observed_started_sessions), direct = count(row.sessions_with_own_app_click_24h),
        pilot = count(row.sessions_with_onelink_click_24h), both = count(row.sessions_with_both_app_routes_24h);
      requireThat(both <= Math.min(direct, pilot)
        && count(row.sessions_with_any_app_route_click_24h) === direct + pilot - both
        && count(row.clicked_without_recorded_impression) <= direct
        && direct - count(row.clicked_without_recorded_impression) <= count(row.sessions_with_cta_impression), 'funnel_relationship_invalid');
      requireThat(n > 0 && Number.isFinite(row.own_app_click_session_rate_24h)
        && Math.abs(row.own_app_click_session_rate_24h - direct / n) < 1e-12, 'funnel_rate_invalid');
    }
    const rows = funnel.filter(r => r.landing_scope === 'production' && r.session_channel === 'Organic Search');
    const missingCohort = rows.some(r => !r.landing_path?.startsWith('/') || r.landing_path.startsWith('//')
      || /[?#\s]/.test(r.landing_path) || !r.device_category || r.session_attribution_status !== 'available');
    const ambiguous = funnel.filter(r => r.landing_scope !== 'nonproduction'
      && (r.landing_scope !== 'production' || !r.session_channel || r.session_channel.startsWith('(')));
    const blocked = blockingIssues.length > 0 || missingCohort || ambiguous.length > 0;
    const measurement = group => {
      const denominator = sum(group, 'observed_started_sessions'), numerator = sum(group, 'sessions_with_own_app_click_24h');
      return { numerator, denominator, value: denominator ? numerator / denominator : null,
        sessions_with_cta_impression: sum(group, 'sessions_with_cta_impression'),
        clicked_without_recorded_impression: sum(group, 'clicked_without_recorded_impression') };
    };
    const grouped = new Map();
    for (const row of rows) {
      const key = JSON.stringify([row.landing_path, row.device_category]);
      if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(row);
    }
    const result = { schema_version: 1, status: blocked ? 'quality_blocked' : rows.length ? 'observed' : 'no_matching_cohort',
      eligible_for_prospective_baseline: !blocked && rows.length > 0, source, period: window,
      metric: 'own_app_click_session_rate_24h', definition_version: 'company-cta-cohort-v1', definition: DEFINITION,
      unit: 'ratio', time_zone: 'Asia/Tokyo', lag_days: 5, session_channel: 'Organic Search',
      total: rows.length ? measurement(rows) : null,
      by_landing_page_and_device: [...grouped.values()].map(group => ({ landing_page: group[0].landing_path,
        device_category: group[0].device_category, ...measurement(group) })).sort((a, b) => a.landing_page.localeCompare(b.landing_page) || a.device_category.localeCompare(b.device_category)),
      quality: { issues, blocking_issues: blockingIssues, missing_cohort_dimensions: missingCohort,
        ambiguous_scope_sessions: sum(ambiguous, 'observed_started_sessions'),
        nonproduction_sessions: sum(funnel.filter(r => r.landing_scope === 'nonproduction'), 'observed_started_sessions') },
      query_sha256: report.queries.map(q => ({ file: q.file, sha256: q.sql_sha256 })),
      limitations: LIMITATIONS, failures: [],
    };
    result.diagnosis = ctaDiagnosis({ stateRoot, result, now });
    return result;
  } catch (error) {
    return { schema_version: 1, status: 'unavailable', eligible_for_prospective_baseline: false, source,
      total: null, by_landing_page_and_device: [], failures: [error.message], limitations: LIMITATIONS };
  }
}

const diagnosisKey = result => hash(JSON.stringify({ source: result.source, period: result.period,
  metric: result.metric, definition_version: result.definition_version, quality: result.quality }));

function ctaDiagnosis({ stateRoot, result, now }) {
  if (result.status !== 'quality_blocked') return null;
  const key = diagnosisKey(result), file = path.join(stateRoot, 'measurement/cta/diagnoses', key + '.json');
  if (!fs.existsSync(file)) return { state: 'not_reviewed', measurement_key: key };
  try {
    const envelope = readPrivate(file, stateRoot).value, r = envelope.record;
    requireThat(hash(JSON.stringify(r)) === envelope.sha256 && r.schema_version === 1 && r.measurement_key === key
      && r.decision === 'source_limit' && typeof r.rationale === 'string' && r.rationale.length >= 20
      && typeof r.next_condition === 'string' && r.next_condition.length >= 20
      && Number.isFinite(Date.parse(r.reviewed_at)) && Date.parse(r.reviewed_at) >= Date.parse(result.source.observed_at)
      && Date.parse(r.reviewed_at) <= now.getTime(), 'diagnosis_invalid');
    const evidence = readPrivate(r.evidence.path, stateRoot);
    requireThat(hash(evidence.bytes) === r.evidence.sha256 && evidence.value.source_sha256 === result.source.sha256
      && Number.isFinite(Date.parse(evidence.value.checked_at))
      && Date.parse(evidence.value.checked_at) >= Date.parse(result.source.observed_at)
      && Date.parse(evidence.value.checked_at) <= Date.parse(r.reviewed_at), 'diagnosis_evidence_changed');
    return { state: 'source_limit_recorded', measurement_key: key, sha256: envelope.sha256,
      rationale: r.rationale, next_condition: r.next_condition, reviewed_at: r.reviewed_at,
      interpretation: 'Agent-reported diagnosis of this exact source and quality only; not a repaired pipeline, admitted baseline or independently proved cause.' };
  } catch { return { state: 'unverified', measurement_key: key }; }
}

export function recordCtaDiagnosis({ stateRoot, evidenceFile, root = ROOT, now = new Date() }) {
  const current = companyCtaMeasurement({ stateRoot, root, now });
  requireThat(current.status === 'quality_blocked', 'No current quality gap to diagnose');
  const record = readPrivate(evidenceFile, stateRoot).value;
  requireThat(record.schema_version === 1 && record.measurement_key === diagnosisKey(current)
    && record.decision === 'source_limit' && typeof record.rationale === 'string' && record.rationale.length >= 20
    && typeof record.next_condition === 'string' && record.next_condition.length >= 20
    && Number.isFinite(Date.parse(record.reviewed_at)) && Date.parse(record.reviewed_at) >= Date.parse(current.source.observed_at)
    && Date.parse(record.reviewed_at) <= now.getTime(), 'Diagnosis must match current evidence and retain a concrete next condition');
  const evidence = readPrivate(record.evidence?.path, stateRoot);
  requireThat(hash(evidence.bytes) === record.evidence.sha256 && record.evidence.path !== evidenceFile
    && evidence.value.source_sha256 === current.source.sha256 && Number.isFinite(Date.parse(evidence.value.checked_at))
    && Date.parse(evidence.value.checked_at) >= Date.parse(current.source.observed_at)
    && Date.parse(evidence.value.checked_at) <= Date.parse(record.reviewed_at), 'Diagnosis needs separate retained investigation evidence');
  const dir = privateState(path.join(stateRoot, 'measurement/cta/diagnoses'));
  const file = path.join(dir, record.measurement_key + '.json'), sha256 = hash(JSON.stringify(record));
  const bytes = JSON.stringify({ record, sha256 }, null, 2) + '\n';
  try { fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    requireThat(readPrivate(file, stateRoot).value.sha256 === sha256, 'Conflicting CTA diagnosis cannot overwrite history');
  }
  const diagnosis = companyCtaMeasurement({ stateRoot, root, now }).diagnosis;
  requireThat(diagnosis?.state === 'source_limit_recorded' && diagnosis.sha256 === sha256, 'Retained diagnosis failed readback');
  return diagnosis;
}

// Existing daily collect owns retention. A repeat reads the same immutable
// output; an invalid newer source never falls back to an older eligible value.
export function retainCtaMeasurement({ stateRoot, root = ROOT, now = new Date(), connection } = {}) {
  const result = companyCtaMeasurement({ stateRoot, root, now, connection });
  const dir = privateState(path.join(stateRoot, 'measurement/cta'));
  if (result.status === 'unavailable') {
    atomicJson(path.join(dir, 'latest.json'), { ...result, artifact: null, retained_at: now.toISOString() });
    return result;
  }
  const bytes = JSON.stringify(result, null, 2) + '\n', sha256 = hash(bytes);
  const file = path.join(dir, `${sha256}.json`);
  let reused = false;
  try { fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; reused = true; }
  requireThat(hash(readPrivate(file, stateRoot).bytes) === sha256, 'retained_measurement_changed');
  const receipt = { status: result.status, eligible_for_prospective_baseline: result.eligible_for_prospective_baseline,
    sha256, artifact: file, source_sha256: result.source.sha256, retained_at: now.toISOString(), reused };
  atomicJson(path.join(dir, 'latest.json'), receipt);
  return receipt;
}

export function compactCtaMeasurement(result) {
  if (!result) return null;
  const { by_landing_page_and_device, ...compact } = result;
  return { ...compact, landing_device_groups: by_landing_page_and_device?.length ?? 0,
    detail: 'company-os.mjs cta-measurement; private measurement/cta contains immutable observations, not experiment registrations.' };
}
