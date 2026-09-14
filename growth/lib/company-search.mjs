// Read already-verified GSC exports. No API, model, scheduler or new CTR model.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT, latestSnapshot, listSnapshots, loadSnapshot, toPath} from './gsc.mjs';
import {buildMeta, emptyBuckets} from './snapshot.mjs';
import {analyzeSnapshot} from './analysis.mjs';
import {selectComparison} from './comparison.mjs';
import {inspectSnapshot} from '../../scripts/autopilot-data.mjs';
import {validateOptions} from '../scripts/export-analytics.mjs';
import {retainedDaily} from './daily-gsc-handoff.mjs';
import {experimentScope} from './experiment-overlap.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sqlHash = file => hash(fs.readFileSync(path.join(ROOT, 'growth/sql/analytics', file)));
const count = n => Number.isSafeInteger(n) && n >= 0;

export function snapshotFromExport(payload, receipt, {now = new Date()} = {}) {
  assert.equal(receipt.status, 'verified');
  assert.equal(receipt.source, 'gsc');
  assert.equal(payload.schema_version, 1);
  assert.equal(payload.status, 'complete');
  assert.equal(payload.report, 'gsc');
  assert.equal(payload.execution, 'export');
  assert.equal(payload.project, 'yurika-simplememo');
  assert.equal(String(payload.run_id), String(receipt.run_id));
  assert.match(payload.source_sha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(payload.source_sha, receipt.source_commit);
  assert.equal(payload.start, receipt.window.start);
  assert.equal(payload.end, receipt.window.end);
  validateOptions({report: 'gsc', execution: 'export', start: payload.start, end: payload.end}, now);
  assert(Number.isFinite(Date.parse(payload.observed_at)) && Date.parse(payload.observed_at) <= now.getTime(), 'invalid observation time');
  assert(count(payload.total_bytes_billed) && payload.total_bytes_billed <= receipt.cap_bytes, 'unverified query cost');
  const buckets = emptyBuckets();
  const expectedDates = Array.from({length: 28}, (_, i) => new Date(Date.parse(payload.start) + i * 86400000).toISOString().slice(0, 10));
  assert.equal(expectedDates.at(-1), payload.end, 'full 28-day window required');
  assert.equal(payload.queries?.length, 2, 'fixed GSC query set required');
  for (const file of ['gsc-site.sql', 'gsc-pages.sql']) {
    const matches = payload.queries.filter(q => q.file === file);
    assert.equal(matches.length, 1, 'unique query identity required');
    const q = matches[0];
    assert.equal(q.sql_sha256, sqlHash(file), 'query definition changed; review mapping before reuse');
    assert.deepEqual(q.params, {start_date: payload.start, end_date: payload.end});
    assert.equal(q.result?.statementType, 'SELECT');
    assert(Array.isArray(q.result.rows), 'measurement rows required');
    const site = file === 'gsc-site.sql', keys = new Set();
    const dimensions = site ? {date: 'dates', query: 'queries', device: 'devices', country: 'countries'} : {date: null, page: 'pages'};
    for (const r of q.result.rows) {
      assert(Object.hasOwn(dimensions, r.dimension), 'unknown dimension');
      assert(count(r.clicks) && count(r.impressions) && r.clicks <= r.impressions, 'invalid counts');
      assert(r.impressions === 0 ? r.position === null : Number.isFinite(r.position) && r.position >= 1, 'invalid position');
      assert(r.value === null || typeof r.value === 'string', 'invalid dimension value');
      const key = JSON.stringify([r.dimension, r.value]);
      assert(!keys.has(key), 'duplicate dimension row'); keys.add(key);
      if (r.dimension === 'page') assert(new URL(r.value).origin === 'https://simplememofast.com', 'unexpected page origin');
      const bucket = dimensions[r.dimension];
      // Anonymous queries remain in site totals, never invented as named queries.
      if (!bucket || r.value === null || (!r.impressions && r.dimension !== 'date')) continue;
      buckets[bucket].push({[r.dimension]: r.dimension === 'page' ? toPath(r.value) : r.value,
        clicks: r.clicks, impressions: r.impressions, ctr: r.impressions ? r.clicks / r.impressions : null, position: r.position});
    }
    assert.deepEqual(q.result.rows.filter(r => r.dimension === 'date').map(r => r.value).sort(), expectedDates, 'missing or extra source dates');
  }
  buckets.dates.sort((a, b) => a.date.localeCompare(b.date));
  // Match the established ingest order, without importing an old query/page join.
  for (const kind of ['queries', 'pages', 'devices', 'countries']) buckets[kind].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  const label = payload.end;
  const meta = buildMeta({label, buckets, period: payload.start + '..' + payload.end, source: 'bigquery',
    sourceFiles: [receipt.sha256], extra: {captured_at: payload.observed_at.slice(0, 10), search_type: 'WEB', time_zone: 'America/Los_Angeles',
      bigquery: {project: payload.project, dataset: 'searchconsole', site_url: 'sc-domain:simplememofast.com',
        search_type: 'WEB', window_days_requested: 28, window_days_available: 28},
      dimension_availability: {query_pages: 'not_in_fixed_export', google_ai_features: 'not_in_fixed_export'},
      export_provenance: {run_id: receipt.run_id, source_commit: receipt.source_commit, sha256: receipt.sha256}}});
  const quality = inspectSnapshot(meta, buckets.dates, now);
  assert.equal(quality.state, 'ready');
  return {label, meta, queries: buckets.queries, pages: buckets.pages, dates: buckets.dates, queryPages: [], pagesAio: []};
}

export function companySearch({stateRoot, now = new Date(), fallback = latestSnapshot(), history = null} = {}) {
  const directory = path.join(stateRoot, 'data/collection-receipts'), failures = [];
  let snapshot = fallback, receipt = null, selected = 'existing_snapshot';
  try {
    const daily = retainedDaily({stateRoot, now});
    if (daily && (!snapshot || daily.snapshot.meta.period_end >= snapshot.meta.period_end)) {
      snapshot = daily.snapshot; receipt = daily.receipt; selected = 'verified_seo_daily_handoff';
    }
  } catch {failures.push({source: 'gsc_decision_input', state: 'unavailable', reason: 'daily_handoff_not_admitted'});}
  if (fs.existsSync(directory)) {
    const receipts = [];
    for (const file of fs.readdirSync(directory).filter(f => /^gsc-\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
      try {
        const r = read(path.join(directory, file));
        assert.equal(r.source, 'gsc');
        assert(typeof r.window?.start === 'string' && typeof r.window?.end === 'string', 'missing receipt window');
        assert.equal(file, 'gsc-' + r.window.end + '.json');
        if (r.status === 'verified') receipts.push(r);
      } catch { failures.push({source: 'gsc_decision_input', state: 'unavailable', reason: 'invalid_collection_receipt', file}); }
    }
    receipts.sort((a, b) => b.window.end.localeCompare(a.window.end));
    for (const candidate of receipts.filter(r => !snapshot || r.window.end > snapshot.meta.period_end)) {
      try {
        const output = fs.realpathSync(candidate.output), root = fs.realpathSync(stateRoot);
        assert(output.startsWith(root + path.sep), 'export outside private state');
        const bytes = fs.readFileSync(output);
        assert.equal(hash(bytes), candidate.sha256, 'retained GSC artifact changed');
        snapshot = snapshotFromExport(JSON.parse(bytes), candidate, {now});
        receipt = candidate; selected = 'verified_existing_export';
        break;
      } catch { failures.push({source: 'gsc_decision_input', state: 'unavailable', reason: 'retained_export_not_admitted'}); }
    }
  }
  if (!snapshot) return {snapshot: null, analysis: null, evidence: {selected: null, actionable: false}, failures};
  const previous = history ?? listSnapshots().map(loadSnapshot);
  const comparison = selectComparison(snapshot, previous.filter(s => s.label !== snapshot.label))
    ?? previous.filter(s => s.meta.period_end < snapshot.meta.period_end).at(-1) ?? null;
  let actionable = false;
  try { actionable = inspectSnapshot(snapshot.meta, snapshot.dates, now).state === 'ready'; } catch { /* visible fallback remains diagnostic */ }
  return {snapshot, analysis: analyzeSnapshot(snapshot, {previous: comparison}), failures,
    evidence: {selected, actionable, source: snapshot.meta.source, period_start: snapshot.meta.period_start, period_end: snapshot.meta.period_end,
      sha256: receipt?.sha256 ?? null, run_id: receipt?.run_id ?? null,
      query_pages: snapshot.queryPages.length ? 'observed' : 'unavailable', google_ai_features: snapshot.pagesAio.length ? 'observed' : 'unavailable',
      note: 'Same canonical CTR/detector functions; no query. Missing joins stay missing. This is decision evidence, not permission or measured treatment impact.'}};
}

// Reuse the original ledger's explicit, legacy-list and global scope rules.
// External/unenumerated records remain visible; do not invent a local page.
function selectionScope(page, pages) {
  try {
    if (typeof page !== 'string' && !Array.isArray(page)) throw new Error('Missing experiment page scope');
    const explicit = pages ?? (Array.isArray(page) ? page : undefined);
    if (explicit !== undefined && (!Array.isArray(explicit) || explicit.some(p => typeof p !== 'string'))) throw new Error('Invalid experiment pages');
    const scope = experimentScope({page: typeof page === 'string' ? page : '', pages: explicit});
    const literals = explicit ?? (Array.isArray(page) ? page : [page]);
    const own = value => {
      if (typeof value !== 'string' || !/^(\/|https?:\/\/)/.test(value)) return null;
      const url = new URL(value, 'https://simplememofast.com');
      return ['http:', 'https:'].includes(url.protocol) && url.hostname === 'simplememofast.com' ? toPath(value) : null;
    };
    const normalized = [...new Set([...scope.pages, ...literals].map(own).filter(Boolean))];
    return {available: true, global: scope.global, pages: normalized,
      unenumerated: !scope.global && normalized.length === 0};
  } catch { return {available: false, global: false, pages: [], unenumerated: true}; }
}

export function searchCandidates(growth, defaults) {
  const analysis = growth.content_gaps, evidence = growth.search_input;
  if (!analysis || !evidence?.actionable) return [];
  const experiments = (Array.isArray(growth.experiments) ? growth.experiments : [])
    .filter(e => e.status === 'RUNNING').map(e => ({id: e.id, scope: selectionScope(e.affected_area, e.affected_pages)}));
  const reviews = (Array.isArray(growth.followups?.reviews) ? growth.followups.reviews : [])
    .filter(r => r.status === 'RUNNING').map(r => ({id: r.id, scope: selectionScope(r.parent?.page, r.parent?.pages)}));
  const scopesReadable = [...experiments, ...reviews].every(e => e.scope.available);
  const matches = (scope, page) => scope.global || scope.pages.some(p => p === page);
  const result = [], seen = new Set();
  for (const row of analysis.ctr_gap ?? []) {
    if (row.kind !== 'page' || row.impressions * row.expected_ctr < 3 || seen.has(row.key)) continue;
    const page = toPath(row.key); seen.add(page);
    const ownershipKnown = Array.isArray(growth.experiments) && Array.isArray(growth.followups?.reviews) && scopesReadable;
    const overlaps = experiments.filter(e => matches(e.scope, page));
    const followups = reviews.filter(r => matches(r.scope, page));
    result.push({id: 'search:ctr:' + page, kind: 'review_existing_search_page', title: 'Review the measured CTR gap on ' + page,
      permission: 'AUTO', executable: ownershipKnown && overlaps.length === 0 && followups.length === 0, owner: 'existing Obsidian Autopilot selector',
      lane: 'A', target_page: page, evidence: [evidence, {detector: 'ctr_gap', ...row}],
      blocking_experiments: overlaps.map(e => e.id),
      blocking_followups: followups.map(r => r.id), ownership_state: ownershipKnown ? 'read' : 'unavailable',
      unenumerated_experiment_scopes: experiments.filter(e => e.scope.unenumerated).map(e => e.id),
      unenumerated_followup_scopes: reviews.filter(r => r.scope.unenumerated).map(r => r.id),
      action_scope: 'Inspect the existing page and current SERP; declare a prospective metric-specific experiment through existing gates before a single eligible edit. Preserve active experiments, canonical URLs and internal links. An expected CTR gap is not proven cause or uplift.',
      followup: 'Existing experiment ledger and daily follow-up; retain baseline and 28-day maturity, not a short-term WIN.',
      factors: {...defaults, frequency: 50, human_time_saved: 70, manual_touches: 70, business_impact: 70, growth_impact: 80, reliability: 60, ease: 60}});
  }
  return result;
}
