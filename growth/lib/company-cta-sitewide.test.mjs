// Local synthetic GA4 receipts only. No collection, encryption, keys or Apple/iOS inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { companyCtaMeasurement, compactCtaMeasurement } from './company-cta-measurement.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = file => hash(fs.readFileSync(path.join(root, 'growth/sql/analytics', file)));
const legacyQuality = '8aa794cefda068076a099f6e6e6d1be7a85cbf96201066dcdf8220c447a49763';
const legacyFunnels = ['a528c1054d236b9bd4a5fdc2d043ae82e282d9c6323213cbb92eeaff4347b71b',
  'e2f9e89b268e00cb2371bf9f57b8f3e9f11b55e1139c8edadacfa8a7b5f1277f',
  'ad2da652e32277c82b67e999332fde221c566ca86b522f76920ba0c13d485123'];
const diagnostics = ['missing_landing_no_timed_page_view_in_scan', 'missing_landing_page_view_before_start_only',
  'missing_landing_page_view_after_window_only', 'missing_landing_page_view_both_sides'];
const extras = ['sessions_with_sitewide_onelink_impression', 'sessions_with_sitewide_onelink_click_24h',
  'sitewide_onelink_clicked_without_recorded_impression', 'sessions_with_legacy_and_sitewide_routes_24h',
  'sessions_with_expanded_app_route_click_24h'];

function fixture(t) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sitewide-cta-test-'));
  t.after(() => fs.rmSync(stateRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(stateRoot, 'data/collection-receipts'), { recursive: true, mode: 0o700 });
  const row = { session_channel: 'Organic Search', session_source: 'google', session_medium: 'organic',
    session_attribution_status: 'available', landing_referrer_host: 'www.google.com', landing_referrer_status: 'external',
    landing_scope: 'production', landing_path: '/obsidian/', device_category: 'mobile', device_language: 'ja',
    observed_started_sessions: 10, sessions_with_own_app_click_24h: 2, sessions_with_cta_impression: 8,
    clicked_without_recorded_impression: 0, sessions_with_onelink_impression: 5, sessions_with_onelink_click_24h: 3,
    onelink_clicked_without_recorded_impression: 1, sessions_with_onelink_qa_click_24h: 0,
    sessions_with_both_app_routes_24h: 1, sessions_with_any_app_route_click_24h: 4,
    own_app_click_session_rate_24h: .2, ...Object.fromEntries(diagnostics.map(k => [k, 0])),
    ...Object.fromEntries(extras.map((k, i) => [k, [7, 4, 1, 2, 6][i]])) };
  const quality = { event_date: '20260906', hostname_scope: 'production', event_name: 'page_view', recorded_events: 20,
    ...Object.fromEntries(['events_without_session_key', 'analytics_storage_denied_events', 'missing_session_channel_events',
      'cta_version_missing_or_other', 'click_target_invalid_or_missing', 'cta_dimensions_incomplete',
      'onelink_version_missing_or_other', 'onelink_target_invalid_or_missing', 'onelink_dimensions_incomplete',
      'onelink_qa_scope_mismatch'].map(k => [k, 0])) };
  const report = { schema_version: 1, report: 'ga4-funnel', execution: 'export', status: 'complete',
    project: 'yurika-simplememo', location: 'asia-northeast1', start: '2026-09-06', end: '2026-09-09',
    run_id: '123', source_sha: 'a'.repeat(40), observed_at: '2026-09-14T01:00:00Z',
    coverage: [6, 7, 8, 9, 10].map(d => ({ day: `2026-09-${String(d).padStart(2, '0')}`, present: true })),
    queries: ['ga4-quality.sql', 'ga4-funnel.sql'].map(file => ({ file, sql_sha256: sha(file),
      params: { start_date: '2026-09-06', end_date: '2026-09-09',
        ...(file === 'ga4-quality.sql' ? { scan_end_date: '2026-09-10' } : {}),
        measurement_version: '2026-09-05', bridge_measurement_version: '2026-09-07' },
      result: { jobId: 'synthetic-' + file, location: 'asia-northeast1', statementType: 'SELECT',
        rows: file === 'ga4-quality.sql' ? [quality] : [row] } })) };
  const output = path.join(stateRoot, 'data/report.json');
  const receipt = { schema_version: 1, source: 'ga4-funnel', status: 'verified',
    window: { start: report.start, end: report.end }, output, source_commit: report.source_sha,
    run_id: 123, request_tag: 'synthetic-sitewide-test', verified_at: '2026-09-14T01:01:00Z' };
  const write = (p, value) => fs.writeFileSync(p, JSON.stringify(value), { mode: 0o600 });
  let now = new Date('2026-09-14T11:00:00Z');
  const retime = (start, end) => {
    const next = day => new Date(Date.parse(day) + 864e5).toISOString().slice(0, 10);
    const observedDay = new Date(Date.parse(end) + 5 * 864e5).toISOString().slice(0, 10);
    report.start = start; report.end = end; report.observed_at = observedDay + 'T01:00:00Z';
    receipt.window = { start, end }; receipt.verified_at = observedDay + 'T01:01:00Z';
    quality.event_date = start.replaceAll('-', '');
    now = new Date(observedDay + 'T11:00:00Z');
    report.coverage = [];
    for (let day = start; day <= next(end); day = next(day)) report.coverage.push({ day, present: true });
    for (const q of report.queries) {
      q.params.start_date = start; q.params.end_date = end;
      if (q.file === 'ga4-quality.sql') q.params.scan_end_date = next(end);
    }
  };
  const flush = () => {
    write(output, report); receipt.sha256 = hash(fs.readFileSync(output));
    write(path.join(stateRoot, 'data/collection-receipts', `ga4-funnel-${report.end}.json`), receipt);
  };
  const run = (measure = companyCtaMeasurement, sourceRoot = root) => { flush(); return measure({ stateRoot, root: sourceRoot, now,
    connection: { status: 'CONNECTED', evidence: output, collection: receipt } }); };
  return { report, row, quality, receipt, output, run, retime };
}

test('new SQL preserves the official direct-only rate but blocks comparison with pre-sitewide baselines', t => {
  const f = fixture(t), r = f.run();
  assert.equal(r.status, 'observed');
  assert.equal(r.total.value, .2);
  assert.equal(r.definition_version, 'company-cta-cohort-v1');
  assert.equal(r.eligible_for_prospective_baseline, false);
  assert.equal(r.route_scope.comparable_to_pre_sitewide_baseline, false);
  assert.equal(r.route_scope.observed_sitewide_click_sessions, 4);
  assert.equal(r.route_scope.source_sql_sha256, sha('ga4-funnel.sql'));
  assert.equal(r.route_scope.baseline_restriction, 'sitewide_rollout_requires_separately_scoped_baseline');
});

test('zero new events do not silently prove the rollout left a comparable route population', t => {
  const f = fixture(t);
  for (const k of extras) f.row[k] = 0;
  f.row.sessions_with_expanded_app_route_click_24h = 4;
  const r = f.run();
  assert.equal(r.status, 'observed');
  assert.equal(r.route_scope.observed_sitewide_click_sessions, 0);
  assert.equal(r.eligible_for_prospective_baseline, false);
});

test('finite historical funnel and quality hashes retain their original CTA eligibility', t => {
  for (const old of legacyFunnels) {
    const f = fixture(t);
    f.report.queries[0].sql_sha256 = legacyQuality;
    f.report.queries[1].sql_sha256 = old;
    for (const k of extras) delete f.row[k];
    if (old === legacyFunnels[0]) for (const k of diagnostics) delete f.row[k];
    const r = f.run();
    assert.equal(r.status, 'observed');
    assert.equal(r.total.value, .2);
    assert.equal(r.eligible_for_prospective_baseline, true);
    assert.equal(Object.hasOwn(r, 'route_scope'), false);
  }
});

test('all legacy hashes obey the comparison freeze including their following-day outcome', t => {
  for (const old of legacyFunnels) {
    for (const [end, eligible, followupEnd] of [
      ['2026-10-14', true, '2026-10-15'],
      ['2026-10-15', false, '2026-10-16'],
      ['2026-10-16', false, '2026-10-17'],
    ]) {
      const f = fixture(t);
      f.report.queries[0].sql_sha256 = legacyQuality;
      f.report.queries[1].sql_sha256 = old;
      for (const k of extras) delete f.row[k];
      if (old === legacyFunnels[0]) for (const k of diagnostics) delete f.row[k];
      f.retime('2026-10-12', end);
      const r = f.run();
      assert.equal(r.status, 'observed', old + ' ' + end);
      assert.equal(r.total.value, .2);
      assert.equal(r.eligible_for_prospective_baseline, eligible, old + ' ' + end);
      if (eligible) assert.equal(Object.hasOwn(r, 'route_scope'), false);
      else {
        assert.equal(r.route_scope.baseline_restriction, 'followup_overlaps_sitewide_comparison_review_freeze');
        assert.equal(r.route_scope.observed_sitewide_click_sessions, null);
        assert.equal(r.route_scope.baseline_review.window_followup_end, followupEnd);
        assert.equal(r.route_scope.baseline_review.window_overlaps_review_freeze, true);
        assert.equal(r.route_scope.baseline_review.comparison_review_started_on, '2026-10-16');
        assert.equal(r.route_scope.baseline_review.rollout_start, null);
      }
    }
  }
});

test('review freeze does not fabricate rollout or repair quality and receipt failures', t => {
  const f = fixture(t);
  f.report.queries[0].sql_sha256 = legacyQuality;
  f.report.queries[1].sql_sha256 = legacyFunnels[2];
  for (const k of extras) delete f.row[k];
  f.retime('2026-10-12', '2026-10-15');
  f.quality.events_without_session_key = 1;
  const blocked = f.run();
  assert.equal(blocked.status, 'quality_blocked');
  assert.equal(blocked.eligible_for_prospective_baseline, false);
  assert.equal(blocked.route_scope.baseline_review.rollout_start, null);
  f.receipt.status = 'failed';
  const failed = f.run();
  assert.equal(failed.status, 'unavailable');
  assert.equal(failed.total, null);
  assert.equal(failed.eligible_for_prospective_baseline, false);
});

test('historical CTA raw and compact notification material remain byte-equivalent to the baseline', t => {
  const golden = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/sitewide-cta-material-v2.json', import.meta.url)));
  assert.equal(golden.baseline_commit, '0ef15885743153a1d902d34b951e0b537634dd51');
  const fingerprint = result => {
    const copy = structuredClone(result);
    copy.source.artifact = 'synthetic-retained-ga4-report'; // Temporary path only.
    return hash(JSON.stringify(copy));
  };
  for (const expected of golden.cases) {
    const f = fixture(t);
    f.report.queries[0].sql_sha256 = legacyQuality;
    f.report.queries[1].sql_sha256 = expected.sql_sha256;
    for (const k of extras) delete f.row[k];
    if (expected.sql_sha256 === legacyFunnels[0]) for (const k of diagnostics) delete f.row[k];
    f.retime(golden.start, golden.end);
    const r = f.run();
    assert.equal(fingerprint(r), expected.raw_sha256);
    assert.equal(fingerprint(compactCtaMeasurement(r)), expected.compact_sha256);
    assert.equal(Object.hasOwn(r, 'route_scope'), false);
  }
});

test('new receipt rejects absent or impossible sitewide relationships and leaves legacy identity checks intact', t => {
  for (const change of [r => { delete r.sessions_with_sitewide_onelink_click_24h; },
    r => { r.sessions_with_expanded_app_route_click_24h = 7; },
    r => { r.sessions_with_legacy_and_sitewide_routes_24h = 5; },
    r => { r.sitewide_onelink_clicked_without_recorded_impression = 5; },
    r => { r.sessions_with_sitewide_onelink_impression = 0; },
    r => { r.sessions_with_any_app_route_click_24h = 7; }]) {
    const f = fixture(t); change(f.row);
    const r = f.run();
    assert.equal(r.status, 'unavailable');
    assert.equal(r.total, null);
    assert.equal(r.eligible_for_prospective_baseline, false);
  }
});

test('hash admission remains closed and quality/period failures cannot be cleared by sitewide data', t => {
  for (const change of [f => { f.report.queries[0].sql_sha256 = legacyFunnels[2]; },
    f => { f.report.queries[1].sql_sha256 = 'b'.repeat(64); },
    f => { f.report.coverage.pop(); }, f => { f.receipt.status = 'failed'; }]) {
    const f = fixture(t); change(f);
    assert.equal(f.run().status, 'unavailable');
  }
  const f = fixture(t); f.quality.events_without_session_key = 1;
  const r = f.run();
  assert.equal(r.status, 'quality_blocked');
  assert.equal(r.eligible_for_prospective_baseline, false);
  assert.equal(r.total.value, .2);
});
