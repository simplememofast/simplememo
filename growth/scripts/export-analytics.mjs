#!/usr/bin/env node
// Fixed SELECT reports only. Results/errors are encrypted before touching disk.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as bq from '../lib/bigquery.mjs';
import { recipientKey, seal } from '../lib/analytics-envelope.mjs';

export const PROJECT = 'yurika-simplememo';
export const LOCATION = 'asia-northeast1';
export const GA4 = 'analytics_524656334';
export const QUERY_CAP = 1_000_000_000;
export const RUN_CAP = 2_000_000_000;
const SQL_DIR = new URL('../sql/analytics/', import.meta.url);
const FILES = {
  gsc: ['gsc-site.sql', 'gsc-pages.sql'],
  'gsc-intent': ['gsc-pages.sql', 'gsc-intent.sql'],
  // Collection diagnostics only; never a session funnel or an outcome report.
  'ga4-provisional': ['ga4-quality.sql'],
  'ga4-quality': ['ga4-quality.sql'],
  // Always attach quality results to the funnel; never silently discard QA.
  'ga4-funnel': ['ga4-quality.sql', 'ga4-funnel.sql'],
  'ga4-journey': ['ga4-quality.sql', 'ga4-journey.sql'],
};
const DAY = 86_400_000;
function dateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Use YYYY-MM-DD dates');
  const ms = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
  return ms;
}
function dayAt(now, zone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function daysBetween(start, end, extra = 0) {
  const dates = [];
  for (let ms = dateValue(start); ms <= dateValue(end) + extra * DAY; ms += DAY) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
}
export function validateOptions({ report = 'preflight', start = '', end = '', execution = 'dry-run' }, now = new Date()) {
  if (!['preflight', ...Object.keys(FILES)].includes(report)) throw new Error('Unknown fixed report');
  if (!['dry-run', 'export'].includes(execution)) throw new Error('Unknown execution mode');
  if (report === 'preflight') {
    if (start || end) throw new Error('Preflight takes no date window');
    return { report, execution, start, end };
  }
  const a = dateValue(start), z = dateValue(end);
  if (z < a || z - a > 30 * DAY) throw new Error('Use an ordered window of at most 31 days');
  const isGa4 = report.startsWith('ga4-');
  const provisional = report === 'ga4-provisional';
  if (provisional && z - a > 6 * DAY) throw new Error('Provisional diagnostics allow at most 7 days');
  const today = dateValue(dayAt(now, isGa4 ? 'Asia/Tokyo' : 'America/Los_Angeles'));
  const lag = provisional ? 1 : isGa4 ? 5 : 3;
  if (z > today - lag * DAY) throw new Error(`The window must end at least ${lag} local calendar days ago`);
  if (provisional && start < '2026-09-05') throw new Error('Provisional diagnostics start on the GA4 link day');
  if (isGa4 && !provisional && start < '2026-09-06') throw new Error('GA4 cohort must start after the measurement release and link day');
  if (!isGa4 && start < '2026-08-10') throw new Error('GSC export history starts on 2026-08-10');
  return { report, execution, start, end };
}
export function errorDetails(e) {
  return { message: e.message, status: e.status ?? null, reasons: e.reasons ?? [] };
}
export async function metadata(client, dataset, api = bq) {
  try {
    const datasetInfo = await api.getDataset(client, { dataset });
    if (datasetInfo.location !== LOCATION) {
      return { status: 'location_mismatch', dataset: datasetInfo, expected: LOCATION };
    }
    const tables = await api.listTables(client, { dataset });
    const samples = dataset === GA4
      ? tables.filter((t) => /^events_\d{8}$/.test(t.id)).sort((a, b) => a.id.localeCompare(b.id))
      : tables.filter((t) => ['searchdata_site_impression', 'searchdata_url_impression', 'ExportLog'].includes(t.id));
    const ids = dataset === GA4 ? [...new Set([samples[0]?.id, samples.at(-1)?.id].filter(Boolean))] : samples.map((t) => t.id);
    const details = [];
    for (const table of ids) details.push(await api.getTable(client, { dataset, table }));
    return { status: 'available', dataset: datasetInfo, tables, details };
  } catch (e) {
    return { status: e.status === 404 ? 'not_found' : e.status === 403 ? 'access_denied' : 'error', error: errorDetails(e) };
  }
}
export function ga4Coverage(meta, options) {
  const expected = daysBetween(options.start, options.end, options.report === 'ga4-provisional' ? 0 : 1);
  const present = new Set(meta.tables.map((t) => t.id));
  return expected.map((day) => ({ day, present: present.has(`events_${day.replaceAll('-', '')}`) }));
}
export async function collect(options, { api = bq, now = new Date() } = {}) {
  const opts = validateOptions(options, now);
  const provisional = opts.report === 'ga4-provisional';
  const out = {
    schema_version: 1, observed_at: now.toISOString(), status: 'in_progress', ...opts,
    project: PROJECT, location: LOCATION, run_id: process.env.GITHUB_RUN_ID ?? null,
    source_sha: process.env.GITHUB_SHA ?? null, query_cap_bytes: QUERY_CAP, run_cap_bytes: RUN_CAP,
    metadata: {}, queries: [],
    ...(provisional ? {
      provisional: true, eligible_for_outcome_evaluation: false,
      partial_link_day_included: opts.start === '2026-09-05',
      interpretation: 'Provisional collection diagnostics from existing daily tables only. Table presence does not prove a complete day; the link day is partial and late events can change counts. Event rows are not GA4 UI sessions, a 24-hour funnel, installations, revenue, or LTV. Host scope does not exclude internal use. No outcome scoring or comparison with mature cohorts.',
    } : {}),
  };
  try {
    const client = await api.connect({ projectId: PROJECT, location: LOCATION });
    out.credential_type = client.credentialType;
    const datasets = opts.report === 'preflight' ? ['searchconsole', GA4] : [opts.report.startsWith('gsc') ? 'searchconsole' : GA4];
    for (const dataset of datasets) out.metadata[dataset] = await metadata(client, dataset, api);
    const states = Object.values(out.metadata).map((m) => m.status);
    if (states.some((s) => !['available', 'not_found'].includes(s))) { out.status = 'blocked'; return out; }
    if (states.includes('not_found')) { out.status = 'waiting_for_dataset'; return out; }
    if (opts.report === 'preflight') { out.status = 'complete'; return out; }
    if (opts.report.startsWith('ga4-')) {
      out.coverage = ga4Coverage(out.metadata[GA4], opts);
      if (out.coverage.some((d) => !d.present)) { out.status = 'incomplete_daily_tables'; return out; }
    }
    let billed = 0;
    for (const file of FILES[opts.report]) {
      const sql = fs.readFileSync(new URL(file, SQL_DIR), 'utf8');
      const limit = Math.min(QUERY_CAP, RUN_CAP - billed);
      if (limit <= 0) throw new Error('Run reading budget exhausted');
      const params = { start_date: opts.start, end_date: opts.end,
        ...(file === 'ga4-quality.sql' ? { scan_end_date: provisional ? opts.end : daysBetween(opts.end, opts.end, 1).at(-1) } : {}),
        ...(opts.report.startsWith('ga4-') ? { measurement_version: '2026-09-05' } : {}),
        ...(['ga4-quality.sql', 'ga4-funnel.sql'].includes(file) ? { bridge_measurement_version: '2026-09-07' } : {}),
      };
      const input = { sql, params, types: { start_date: 'DATE', end_date: 'DATE',
        ...(file === 'ga4-quality.sql' ? { scan_end_date: 'DATE' } : {}),
      }, maximumBytesBilled: limit };
      const item = { file, sql_sha256: crypto.createHash('sha256').update(sql).digest('hex'), params, maximum_bytes_billed: limit };
      out.queries.push(item);
      item.dry_run = await api.query(client, { ...input, dryRun: true });
      const estimated = item.dry_run.totalBytesProcessed;
      if (!Number.isFinite(estimated) || estimated > limit) throw new Error('Dry-run size is unavailable or exceeds the reading limit');
      if (opts.execution === 'export') {
        item.result = await api.query(client, { ...input, includeJobMetadata: true });
        if (item.result.statementType !== 'SELECT') throw new Error('Expected a SELECT query job');
        if (!Number.isFinite(item.result.totalBytesBilled)) throw new Error('Actual billed bytes are unavailable');
        billed += item.result.totalBytesBilled;
      }
    }
    out.total_bytes_billed = billed;
    if (opts.report.startsWith('gsc') && opts.execution === 'export') {
      out.coverage = out.queries.filter((q) => q.file !== 'gsc-intent.sql').map((q) => {
        const present = new Set(q.result.rows.filter((r) => r.dimension === 'date').map((r) => r.value));
        return { file: q.file, days: daysBetween(opts.start, opts.end).map((day) => ({ day, has_rows: present.has(day) })) };
      });
      out.status = out.coverage.some((t) => t.days.some((d) => !d.has_rows)) ? 'incomplete_date_coverage' : 'complete';
    } else out.status = (provisional ? 'provisional_' : '') + (opts.execution === 'dry-run' ? 'dry_run_complete' : 'complete');
    if (opts.report === 'gsc-intent') out.interpretation = 'Fixed three-URL page/query diagnostics, grouped by Pacific date. Coverage describes the full URL export, not target traffic. Anonymous and missing query buckets are retained separately; absent target rows are not independently proven zero. URL impressions are not a site denominator. No SEO attribution to installations or LTV.';
    if (opts.report.startsWith('ga4-') && !provisional) {
      out.interpretation = 'GA4 exported observed events/sessions; inspect quality rows before scoring. Store clicks are not installations, revenue, or LTV.';
      if (opts.report === 'ga4-funnel') {
        out.interpretation += ' OneLink pilot intent is separate from direct Apple clicks; QA is excluded from pilot and combined-route counts. The combined-route column is a session union, not the sum of route counts. Zero OneLink observations before pilot activation are not measured zero demand.';
      }
      if (opts.report === 'ga4-journey') {
        out.interpretation = 'Existing card events and referrer-bearing arrivals, not proven click paths or causal effects. Event-day counts and 24-hour session-start cohorts are separate. Route session counts are not additive across routes or quality groups. Inspect both quality and context rows before evaluation; no inferred CTR or drop-off rate.';
      }
    }
  } catch (e) { out.status = 'error'; out.error = errorDetails(e); }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const publicPem = Buffer.from(process.env.ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64 || '', 'base64').toString('utf8');
    recipientKey(publicPem); // Validate before authenticating or querying.
    const options = {
      report: process.env.ANALYTICS_REPORT || 'preflight', execution: process.env.ANALYTICS_EXECUTION || 'dry-run',
      start: process.env.ANALYTICS_START_DATE || '', end: process.env.ANALYTICS_END_DATE || '',
    };
    validateOptions(options);
    const output = process.env.ANALYTICS_ENCRYPTED_OUTPUT;
    if (!output) throw new Error('Encrypted output path is required');
    const report = await collect(options);
    const envelope = seal(report, publicPem);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, JSON.stringify(envelope) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`Analytics report encrypted. status=${report.status}`);
    if (['error', 'blocked', 'incomplete_daily_tables', 'incomplete_date_coverage'].includes(report.status)) process.exitCode = 1;
  } catch {
    // Raw exceptions may include SQL, API context or filenames. Keep logs generic.
    console.error('Analytics export could not be prepared. Check report inputs, public key, and output path.');
    process.exitCode = 1;
  }
}
