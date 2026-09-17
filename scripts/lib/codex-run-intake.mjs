// Interpret only recorded gate decisions and actual runtime termination. A
// completed agent turn is never inferred to have shipped or repaired anything.
import { createHash } from 'node:crypto';
import { FAULT_GATE_CODES } from './autopilot-gate-codes.mjs';
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
const digest = x => createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))).digest('hex');
const instant = x => typeof x === 'string' && x.endsWith('Z') ? Date.parse(x) : NaN;

function runtimeFailure(entry, first, schema) {
  const r = entry.runtime_failure;
  if (!r) return null;
  const { sha256, ...body } = r;
  const fields = 'code failure_class finished_at sha256 thread_id transcript_sha256 turn_id version';
  if (schema < 4 || Object.keys(r).sort().join(' ') !== fields || r.version !== 1
    || r.code !== 'usage_limit_exceeded' || r.failure_class !== 'usage_limit' || first.state !== 'failed'
    || r.thread_id !== entry.thread_id || r.turn_id !== first.turn_id || r.finished_at !== first.finished_at
    || r.transcript_sha256 !== entry.transcript.sha256 || sha256 !== digest(body)) {
    throw new Error('unverified Codex runtime failure receipt');
  }
  return r;
}

function nativeDetection(entry, first, observed) {
  const r = entry.detection_receipt;
  if (!r) return null;
  const { sha256, ...body } = r;
  if (r.version !== 1 || r.kind !== 'launchd_interval' || !Number.isSafeInteger(r.parent_pid) || r.parent_pid <= 1
    || r.thread_id !== entry.thread_id || r.turn_id !== first.turn_id || sha256 !== digest(body)
    || !/^[a-f0-9]{64}$/.test(r.launcher_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(r.transcript_sha256 ?? '')
    || !(instant(r.observed_at) >= instant(first.finished_at) && instant(r.observed_at) <= observed)) {
    throw new Error('unverified automatic Codex detection receipt');
  }
  return r;
}

export function codexRunIntake(routineDoc, runsDoc, { now = Date.now(), automatic = false } = {}) {
  const doc = routineDoc?.codex_observation;
  const empty = { valid: false, rows: [], triage: [], unresolved: [] };
  const observed = instant(doc?.observed_at);
  if (![2, 3, 4].includes(doc?.schema_version) || doc.source !== 'local_codex_scheduler_and_session_store'
    || doc.scheduler_query_complete !== true || !Number.isFinite(observed) || observed > now
    || now - observed > 3 * 86400000 || !Array.isArray(doc.runs)) return empty;
  empty.valid = true;
  const known = new Map();
  const knownIds = new Set();
  for (const row of runsDoc?.runs ?? []) {
    if (!String(row.external_ref).startsWith('codex:')) continue;
    if (knownIds.has(row.run_id)) throw new Error('duplicate Codex ledger task id');
    knownIds.add(row.run_id);
    const previous = known.get(row.external_ref);
    if (previous) {
      // A manual session can deliver distinct owner-directed tasks. Its thread
      // is provenance, not a scheduled-run identity. Keep every ledger row and
      // retain the ref as known so it cannot be imported again as automation.
      const ownerTask = r => r.route === 'owner-session' && r.source === 'session'
        && r.needs_triage !== true;
      if (!ownerTask(previous) || !ownerTask(row) || previous.run_id === row.run_id) {
        throw new Error('duplicate Codex ledger reference');
      }
      continue;
    }
    known.set(row.external_ref, row);
  }
  const taken = new Set((runsDoc?.runs ?? []).map(r => r.run_id));
  const seen = new Set();
  for (const entry of doc.runs) {
    if (!uuid(entry.thread_id) || seen.has(entry.thread_id)) throw new Error('duplicate/invalid Codex run observation');
    seen.add(entry.thread_id);
    if (!['obsidian', 'obsidian-2'].includes(entry.automation_id)) throw new Error('unregistered Codex route');
    const ref = `codex:${entry.thread_id}`;
    const existing = known.get(ref);
    if (existing && existing.needs_triage !== true) continue;
    const t = entry.transcript, first = t?.turns?.[0];
    if (t?.state !== 'observed' || !/^[a-f0-9]{64}$/.test(t.sha256 ?? '') || !first) continue;
    if (first.state === 'in_progress') continue;
    const start = instant(first.started_at), end = instant(first.finished_at);
    if (!uuid(first.turn_id) || !Number.isFinite(start) || !Number.isFinite(end) || end < start || end > observed) continue;
    const date = new Date(instant(entry.created_at) + 9 * 3600000).toISOString().slice(0, 10);
    const route = entry.automation_id === 'obsidian' ? 'actions' : 'ccr-0920';
    const failure = runtimeFailure(entry, first, doc.schema_version);
    const cause = failure ? `Structured Codex runtime code ${failure.code}; original turn ${first.turn_id}; receipt SHA256 ${failure.sha256}` : null;
    if (existing) {
      if (!failure) continue;
      if (existing.failure_class || existing.route !== route || existing.attempted !== true
        || existing.outcome !== 'failed' || existing.failure_stage !== 'execution'
        || existing.failed_at !== first.finished_at
        || !['act-reconcile', 'act-reconcile-session'].includes(existing.source)
        || !String(existing.detected_note).startsWith(`Codex original turn ${first.turn_id}; transcript SHA256 `)) {
        throw new Error('Codex triage conflicts with recorded failure identity or cause');
      }
      empty.triage.push({ run_id: existing.run_id, failure_class: failure.failure_class, needs_triage: false, triage_note: cause });
      continue;
    }
    const detection = nativeDetection(entry, first, observed);
    const row = { run_id: `ap-${date.replaceAll('-', '')}-${route}-codex-${entry.thread_id}`,
      date_jst: date, route, external_ref: ref,
      source: automatic || detection ? 'act-reconcile' : 'act-reconcile-session',
      detected_at: detection?.observed_at ?? new Date(now).toISOString(),
      detected_note: `Codex original turn ${first.turn_id}; transcript SHA256 ${t.sha256}; observed ${doc.observed_at}${detection ? `; automatic detection receipt SHA256 ${detection.sha256}` : ''}` };
    if (taken.has(row.run_id)) throw new Error('Codex run id exists with different external reference');
    // A runtime error wins over any earlier successful or declined gate.
    if (['failed', 'aborted'].includes(first.state)) {
      Object.assign(row, { outcome: first.state === 'aborted' ? 'cancelled' : 'failed', attempted: true,
        failure_stage: 'execution', needs_triage: !failure, failed_at: first.finished_at,
        failure_reason: cause ?? 'Original scheduled Codex turn terminated abnormally; cause needs triage. No business success inferred.' });
      if (failure) row.failure_class = failure.failure_class;
    } else if (first.state === 'completed' && entry.gate_receipt) {
      const r = entry.gate_receipt;
      const { sha256, ...body } = r;
      if (r.version !== 1 || sha256 !== digest(body) || r.thread_id !== entry.thread_id || r.turn_id !== first.turn_id
        || typeof r.admitted !== 'boolean' || !/^[a-z][a-z0-9_]{0,79}$/.test(r.code ?? '')
        || !/^[a-f0-9]{64}$/.test(r.input_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(r.script_sha256 ?? '')
        || !(instant(r.observed_at) >= start && instant(r.observed_at) <= end)) throw new Error('unverified Codex gate receipt');
      if (r.admitted) { empty.unresolved.push(ref); continue; }
      Object.assign(row, { outcome: 'skipped_gate', attempted: false, failure_stage: 'eligibility', gate_code: r.code,
        eligibility_verdict: FAULT_GATE_CODES.includes(r.code) ? 'declined_by_fault' : 'declined_by_design',
        failure_reason: `Recorded Codex preflight decision: ${r.code}; receipt SHA256 ${sha256}` });
    } else { empty.unresolved.push(ref); continue; }
    empty.rows.push(row); known.set(ref, row); taken.add(row.run_id);
  }
  return empty;
}

export function applyCodexTriage(routineDoc, runsDoc, options) {
  const intake = codexRunIntake(routineDoc, runsDoc, options);
  if (!intake.valid) throw new Error('Codex triage requires a fresh complete observation');
  const updates = new Map(intake.triage.map(r => [r.run_id, r]));
  return { changed: updates.size, doc: { ...runsDoc,
    runs: runsDoc.runs.map(r => updates.has(r.run_id) ? { ...r, ...updates.get(r.run_id) } : r) } };
}

export function codexAppendArgs(row) {
  const names = { run_id: 'run-id', date_jst: 'date', route: 'route', external_ref: 'external-ref', source: 'source',
    outcome: 'outcome', attempted: 'attempted', failure_class: 'failure-class', failure_reason: 'failure-reason',
    needs_triage: 'needs-triage', failed_at: 'failed-at', detected_at: 'detected-at', detected_note: 'detected-note',
    gate_code: 'gate-code', eligibility_verdict: 'eligibility-verdict' };
  return ['--append', ...Object.entries(names).flatMap(([key, flag]) => row[key] === undefined ? [] : [`--${flag}`, String(row[key])])];
}

export async function codexIntakeSelftest() {
  const { default: assert } = await import('node:assert/strict');
  const { validate } = await import('../autopilot-runs.mjs');
  const { analyze, validate: validateSelfheal, observedPendingTriage } = await import('../autopilot-selfheal.mjs');
  const now = Date.parse('2026-09-13T03:00:00Z');
  const tid = '00000000-0000-0000-0000-000000000001', turn = '00000000-0000-0000-0000-000000000002';
  const first = { turn_id: turn, started_at: '2026-09-13T00:00:00Z', finished_at: '2026-09-13T00:10:00Z', state: 'failed' };
  const entry = { thread_id: tid, automation_id: 'obsidian', created_at: first.started_at,
    transcript: { state: 'observed', sha256: 'a'.repeat(64), turns: [first, { ...first, state: 'completed' }] } };
  const doc = () => ({ codex_observation: { schema_version: 3, observed_at: '2026-09-13T02:00:00Z',
    source: 'local_codex_scheduler_and_session_store', scheduler_query_complete: true, runs: [structuredClone(entry)] } });
  const intake = (d, r = { runs: [] }, automatic = false) => codexRunIntake(d, r, { now, automatic });
  const native = doc();
  const proof = { version: 1, kind: 'launchd_interval', observed_at: '2026-09-13T02:00:00Z', parent_pid: 123,
    launcher_sha256: 'b'.repeat(64), thread_id: tid, turn_id: turn, transcript_sha256: 'a'.repeat(64) };
  proof.sha256 = digest(proof); native.codex_observation.runs[0].detection_receipt = proof;
  assert.equal(intake(native).rows[0].source, 'act-reconcile', 'verified first native observation survives a publication wakeup');
  assert.equal(intake(native).rows[0].detected_at, proof.observed_at);
  const tamperedNative = structuredClone(native); tamperedNative.codex_observation.runs[0].detection_receipt.parent_pid++;
  assert.throws(() => intake(tamperedNative), /automatic Codex detection/);
  const failed = intake(doc()).rows[0];
  assert.equal(failed.outcome, 'failed', 'a later completed turn cannot erase the first failure');
  assert.equal(failed.source, 'act-reconcile-session');
  assert.equal(intake(doc(), { runs: [] }, true).rows[0].source, 'act-reconcile');
  assert.deepEqual(validate({ runs: [failed] }), []);
  assert.equal(failed.failure_class, undefined, 'an unknown cause is not an invented failure class');
  assert.equal(observedPendingTriage(failed), true);
  for (const change of [{ external_ref: 'codex:invalid' }, { route: 'outside' }, { detected_note: 'unverified' }, { needs_triage: false }]) {
    assert.equal(observedPendingTriage({ ...failed, ...change }), false);
  }
  const aborted = doc(); aborted.codex_observation.runs[0].transcript.turns[0].state = 'aborted';
  assert.equal(observedPendingTriage(intake(aborted).rows[0]), true);
  assert.equal(intake(doc(), { runs: [failed] }).rows.length, 0, 'external id makes reconciliation idempotent');
  const duplicate = doc(); duplicate.codex_observation.runs.push(structuredClone(entry));
  assert.throws(() => intake(duplicate), /duplicate/);
  const missing = doc(); missing.codex_observation.runs[0].transcript.turns[0].state = 'in_progress';
  assert.equal(intake(missing).rows.length, 0);
  const successful = doc(); successful.codex_observation.runs[0].transcript.turns[0].state = 'completed';
  assert.equal(intake(successful).rows.length, 0, 'normal termination is not a business outcome');
  assert.equal(intake(successful).unresolved.length, 1);
  const receipt = { version: 1, thread_id: tid, turn_id: turn, observed_at: '2026-09-13T00:01:00Z', admitted: false,
    code: 'preflight_error', input_sha256: 'b'.repeat(64), script_sha256: 'c'.repeat(64) };
  receipt.sha256 = digest(receipt);
  successful.codex_observation.runs[0].gate_receipt = receipt;
  const gated = intake(successful).rows[0];
  assert.equal(gated.eligibility_verdict, 'declined_by_fault');
  assert.deepEqual(validate({ runs: [gated] }), []);
  const matrix = { self_repair: { stop_after_failed_repairs: 3, may_modify: ['scripts/'], must_not: ['weaken checks'] } };
  const quota = doc(); quota.codex_observation.schema_version = 4;
  const failureProof = { version: 1, thread_id: tid, turn_id: turn, finished_at: first.finished_at,
    code: 'usage_limit_exceeded', failure_class: 'usage_limit', transcript_sha256: entry.transcript.sha256 };
  failureProof.sha256 = digest(failureProof); quota.codex_observation.runs[0].runtime_failure = failureProof;
  assert.equal(intake(quota).rows[0].failure_class, 'usage_limit');
  assert.equal(intake(quota).rows[0].needs_triage, false);
  const old = { ...failed, interventions: [{ kind: 'infrastructure', note: 'existing history' }] };
  const before = structuredClone(old);
  const classified = applyCodexTriage(quota, { runs: [old] }, { now });
  assert.equal(classified.changed, 1);
  assert.deepEqual(old, before, 'classification must not mutate the input ledger');
  const { failure_class, needs_triage, triage_note, ...retained } = classified.doc.runs[0];
  delete before.needs_triage;
  assert.deepEqual(retained, before, 'all original evidence including manual detection and interventions stays intact');
  assert.equal(failure_class, 'usage_limit'); assert.equal(needs_triage, false); assert.match(triage_note, /receipt SHA256/);
  const routed = analyze(classified.doc, matrix, [{ trigger: 'usage_limit', who: 'owner' }]);
  assert.equal(routed.lane_f_required, false); assert.equal(routed.owner_routed.length, 1);
  assert.equal(routed.targets[0].failure_reason, triage_note, 'routing reports show the verified cause');
  assert.equal(routed.targets.length, 1, 'classification is not recovery');
  assert.equal(applyCodexTriage(quota, classified.doc, { now }).changed, 0);
  assert.deepEqual(validate(classified.doc), []);
  for (const change of [{ failed_at: first.started_at }, { route: 'ccr-0920' }, { attempted: false },
    { failure_class: 'code_fault' }, { detected_note: 'unverified' }, { outcome: 'shipped' }, { source: 'manual' }]) {
    assert.throws(() => intake(quota, { runs: [{ ...failed, ...change }] }), /conflicts/);
  }
  for (const change of [{ thread_id: turn }, { turn_id: tid }, { finished_at: first.started_at },
    { transcript_sha256: 'b'.repeat(64) }, { failure_class: 'unknown' }, { code: 'other_error' }, { extra: true }]) {
    const bad = structuredClone(quota); const r = bad.codex_observation.runs[0].runtime_failure;
    Object.assign(r, change); delete r.sha256; r.sha256 = digest(r);
    assert.throws(() => intake(bad), /runtime failure receipt/);
  }
  const mismatched = structuredClone(quota); mismatched.codex_observation.runs[0].runtime_failure.sha256 = '0'.repeat(64);
  assert.throws(() => intake(mismatched), /runtime failure receipt/);
  const duplicateKnown = { runs: [failed, { ...failed, run_id: 'duplicate' }] };
  assert.throws(() => intake(quota, duplicateKnown), /duplicate Codex ledger/);
  assert.deepEqual(validateSelfheal({ runs: [failed, gated] }, matrix), []);
  assert.equal(gated.failure_class, undefined, 'gate codes retain their existing eligibility representation');
  assert.equal(analyze({ runs: [gated] }, matrix).lane_f_required, true, 'recorded preflight faults must reach the existing repair lane');
  const priorFaults = [1, 2, 3].map(i => ({ ...gated, run_id: `prior-${i}` }));
  const repairRuns = priorFaults.map(r => ({ run_id: `repair-${r.run_id}`, outcome: 'shipped', repair_of: [r.run_id] }));
  const limited = analyze({ runs: [...priorFaults, ...repairRuns, gated] }, matrix);
  assert.equal(limited.lane_f_required, false, 'preflight faults retain the three-repair limit');
  assert.equal(limited.escalate[0].run_id, gated.run_id);
  assert.equal(analyze({ runs: [gated, { run_id: 'repair', outcome: 'shipped', repair_of: [gated.run_id] }] }, matrix).lane_f_required, false);
  const designed = structuredClone(successful); const r = designed.codex_observation.runs[0].gate_receipt;
  r.code = 'skip_budget'; delete r.sha256; r.sha256 = digest(r);
  assert.equal(analyze({ runs: intake(designed).rows }, matrix).lane_f_required, false, 'budget gates do not become repair work');
  for (const change of [{ thread_id: turn }, { turn_id: tid }, { observed_at: '2026-09-12T00:00:00Z' }, { admitted: true }]) {
    const bad = structuredClone(successful); Object.assign(bad.codex_observation.runs[0].gate_receipt, change);
    assert.throws(() => intake(bad), /unverified/);
  }
  const stale = doc(); stale.codex_observation.observed_at = '2026-09-01T00:00:00Z';
  assert.equal(intake(stale).valid, false);
  assert.throws(() => applyCodexTriage(stale, { runs: [failed] }, { now }), /fresh complete/);
  const future = doc(); future.codex_observation.observed_at = '2026-09-14T00:00:00Z';
  assert.equal(intake(future).valid, false);
  assert.equal(intake(null).valid, false);
  assert(codexAppendArgs(gated).includes('--gate-code'));
}
