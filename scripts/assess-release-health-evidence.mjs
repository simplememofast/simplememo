#!/usr/bin/env node
/**
 * Read-only assessment of a finalized App Store Connect WEEKLY observation.
 *
 * This does not authorize a release or change the existing release gate. In
 * particular, a report that Apple did not generate is not a zero-crash report.
 * A future low-volume policy may use `human_safety_review_required` as an
 * escalation path; it must still apply the actual release gate and readback.
 *
 * Usage: node scripts/assess-release-health-evidence.mjs < observation.json
 *        node scripts/assess-release-health-evidence.mjs --selftest
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert, run } from './lib/selftest.mjs';

const validCount = (n) => Number.isSafeInteger(n) && n >= 0;
const weekStart = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const date = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s &&
    date.getUTCDay() === 1 ? date.getTime() : null;
};
const fresh = (iso) => {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(iso)) {
    return false;
  }
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== iso.slice(0, 10)) return false;
  const age = Date.now() - parsed;
  return Number.isFinite(age) && age >= -30 * 60_000 && age <= 24 * 60 * 60_000;
};
// The live gate's fixed floor. This advisory classifier cannot lower it.
const ORIGINAL_MIN_SESSIONS = 100;
const result = (state, reasons, facts) => ({
  state,
  reasons,
  facts,
  automatic_release: false,
  formal_task_78_credit: false,
});

/**
 * The caller supplies version-specific provider observations and their common
 * finalized week. This classifier does not authenticate those inputs. Missing
 * rows and `not_received` remain unknown, even when a dashboard shows a
 * different range or no visible crash value.
 */
export function assessReleaseHealthEvidence(observation) {
  const o = observation ?? {};
  const current = o.published_versions?.current;
  const previous = o.published_versions?.previous;
  const week = o.week;
  const facts = { week, current, previous, current_sessions: null, previous_sessions: null,
    current_crashes: null, previous_crashes: null };
  const reasons = [];

  const start = weekStart(week);
  if (start === null || Date.now() < start + 7 * 24 * 60 * 60_000 || o.week_state !== 'finalized') {
    reasons.push('confirmed_week_missing');
  }
  if (typeof current !== 'string' || !current || typeof previous !== 'string' || !previous || current === previous) {
    reasons.push('published_version_pair_missing');
  }
  if (typeof o.app_id !== 'string' || !o.app_id || o.device_scope !== 'ios_iphone_ipad') {
    reasons.push('app_or_device_scope_missing');
  }
  if (o.sessions?.state !== 'received' || o.sessions?.week !== week) reasons.push('same_week_sessions_missing');
  if (o.sessions?.report_type !== 'App Sessions Standard' || o.sessions?.app_id !== o.app_id ||
      o.sessions?.device_scope !== o.device_scope || !fresh(o.sessions?.fetched_at)) {
    reasons.push('sessions_report_scope_or_freshness_invalid');
  }
  const perVersion = o.sessions?.by_version;
  if (current && previous && perVersion && typeof perVersion === 'object') {
    const a = perVersion[current];
    const b = perVersion[previous];
    if (validCount(a)) facts.current_sessions = a;
    else reasons.push('current_version_session_row_missing');
    if (validCount(b)) facts.previous_sessions = b;
    else reasons.push('previous_version_session_row_missing');
  } else if (current && previous) {
    reasons.push('per_version_sessions_missing');
  }
  if (reasons.length) return result('hold', [...new Set(reasons)], facts);

  if (o.crashes?.state !== 'received' || o.crashes?.week !== week) {
    return result('hold', ['same_week_crash_report_unavailable'], facts);
  }
  if (o.crashes?.report_type !== 'App Crashes' || o.crashes?.app_id !== o.app_id ||
      o.crashes?.device_scope !== o.device_scope || !fresh(o.crashes?.fetched_at)) {
    return result('hold', ['crash_report_scope_or_freshness_invalid'], facts);
  }
  const crashRows = o.crashes?.by_version;
  if (!crashRows || typeof crashRows !== 'object' ||
      !validCount(crashRows[current]) || !validCount(crashRows[previous])) {
    return result('hold', ['version_specific_crash_rows_missing'], facts);
  }
  facts.current_crashes = crashRows[current];
  facts.previous_crashes = crashRows[previous];
  if (facts.current_sessions === 0 || facts.previous_sessions === 0) {
    return result('hold', ['no_exposed_sessions_for_both_versions'], facts);
  }

  // The active gate still requires >=100 sessions per version. A prospective
  // low-volume route needs a concrete human safety decision for that release;
  // the owner's general policy approval is not that decision.
  if (facts.current_sessions < ORIGINAL_MIN_SESSIONS || facts.previous_sessions < ORIGINAL_MIN_SESSIONS) {
    return result('human_safety_review_required', ['low_volume'], facts);
  }
  return result('evidence_ready_for_original_gate', [], facts);
}

function selftest() {
  const base = {
    week: '2026-01-05', week_state: 'finalized',
    app_id: 'test-app', device_scope: 'ios_iphone_ipad',
    published_versions: { current: '1.1.0', previous: '1.0.0' },
    sessions: { state: 'received', report_type: 'App Sessions Standard', app_id: 'test-app',
      device_scope: 'ios_iphone_ipad', fetched_at: new Date().toISOString(), week: '2026-01-05',
      by_version: { '1.0.0': 17 } },
    crashes: { state: 'not_received', week: '2026-01-05' },
  };
  const withRows = (currentSessions, previousSessions, crashes = base.crashes) => ({
    ...base,
    sessions: { ...base.sessions, by_version: { '1.1.0': currentSessions, '1.0.0': previousSessions } },
    crashes,
  });
  const reportedZero = { state: 'received', report_type: 'App Crashes', app_id: base.app_id,
    device_scope: base.device_scope, fetched_at: new Date().toISOString(), week: base.week,
    by_version: { '1.1.0': 0, '1.0.0': 0 } };
  return run([
    ['advisory floor matches the unchanged live gate', () => {
      const ledger = JSON.parse(fs.readFileSync(new URL('../data/release-gate.json', import.meta.url), 'utf8'));
      assert(ledger.policy.min_crash_free_sessions === ORIGINAL_MIN_SESSIONS);
    }],
    ['missing current-version row holds', () => {
      const r = assessReleaseHealthEvidence(base);
      assert(r.state === 'hold' && r.reasons.includes('current_version_session_row_missing'));
      assert(r.facts.previous_sessions === 17 && r.facts.current_crashes === null);
    }],
    ['missing App Crashes is not zero, even with 100 sessions each', () => {
      const r = assessReleaseHealthEvidence(withRows(100, 100));
      assert(r.state === 'hold' && r.facts.current_crashes === null);
      assert(r.automatic_release === false && r.formal_task_78_credit === false);
    }],
    ['actual zero rows with low volume require a specific safety review', () => {
      const r = assessReleaseHealthEvidence(withRows(17, 17, reportedZero));
      assert(r.state === 'human_safety_review_required' && r.reasons.includes('low_volume'));
      assert(r.facts.current_crashes === 0 && r.facts.previous_crashes === 0);
    }],
    ['full evidence is still only input to the original release gate', () => {
      const r = assessReleaseHealthEvidence(withRows(100, 100, reportedZero));
      assert(r.state === 'evidence_ready_for_original_gate');
      assert(r.automatic_release === false && r.formal_task_78_credit === false);
    }],
    ['different crash week cannot be used', () => {
      const r = assessReleaseHealthEvidence(withRows(100, 100, { ...reportedZero, week: '2026-01-12' }));
      assert(r.state === 'hold' && r.facts.current_crashes === null);
    }],
    ['other app, device scope or report type never becomes ready', () => {
      for (const changed of [
        { ...reportedZero, app_id: 'other-app' },
        { ...reportedZero, device_scope: 'iphone_only' },
        { ...reportedZero, report_type: 'App Crashes Expanded' },
      ]) {
        assert(assessReleaseHealthEvidence(withRows(100, 100, changed)).state === 'hold');
      }
      const wrongSessions = withRows(100, 100, reportedZero);
      wrongSessions.sessions.report_type = 'App Sessions Expanded';
      assert(assessReleaseHealthEvidence(wrongSessions).state === 'hold');
    }],
    ['stale report and impossible week never become ready', () => {
      const old = { ...reportedZero, fetched_at: new Date(Date.now() - 48 * 60 * 60_000).toISOString() };
      assert(assessReleaseHealthEvidence(withRows(100, 100, old)).state === 'hold');
      assert(assessReleaseHealthEvidence({ ...withRows(100, 100, reportedZero), week: '2026-99-99' }).state === 'hold');
    }],
  ], { label: 'release-health-evidence' });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) {
    process.exitCode = selftest() ? 1 : 0;
  } else {
    const observation = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(`${JSON.stringify(assessReleaseHealthEvidence(observation), null, 2)}\n`);
  }
}
