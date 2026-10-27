// Which changes an Autopilot day branch may make to the two ledgers that gate the Autopilot (pure functions, no I/O).
//
// data/autopilot-runs.json decides containment. autopilot-selfheal counts a failure as repaired once a shipped row
// with a PR number names it in repair_of, and counts repair attempts per failure_class: rewriting a row (its
// failure_class, its outcome) or adding a shipped row that names past failures could lift a containment. A
// reviewer's scratch experiment on 2026-10-26 relabelled ten failure rows' failure_class to restart the count
// (never pushed). data/autopilot-cost.json decides the budget gates: the budget block holds the caps, the rows the
// spend, and a row's cap_review clears an overrun.
//
// What stays allowed is what the runbook asks for:
//   - the run ledger: one new row for the branch's day, without repair_of. The session does not write this ledger
//     on the Actions route; the publish job records the day's row after its checks (or binds the row a session
//     wrote itself) and writes repair_of from the request. A day that names repairs changes more than ledgers, so
//     its PR waits for the owner's approval anyway.
//   - the cost ledger: new rows in the shape of Runbook §5-3 (the previous run's cost: route actions, a date up to the
//     branch's day, a positive amount, no cap_review or cost_expectation), and the result metadata that
//     autopilot-budget.mjs --append --enrich-missing-metadata fills into a row that lacks it, with the same values.
// Everything else is refused: the other top-level keys (the budget block, notes), an existing row's values, a
// removed row, two rows with one run_id, a number JSON cannot hold (1e999 reads as Infinity and would compare equal
// to null). Rows are matched by run_id, so their order is not compared (the ledgers' readers group rows by date).
// data/autopilot-status.json and the log are rewritten every day and gate nothing, so they are not checked here.

import { OUTCOMES } from '../autopilot-runs.mjs';

export const RUNS_LEDGER = 'data/autopilot-runs.json';
export const COST_LEDGER = 'data/autopilot-cost.json';
export const GATED_LEDGERS = Object.freeze([RUNS_LEDGER, COST_LEDGER]);

// autopilot-budget.mjs appendRun({ enrichMissing }) and its task kinds.
const TASK_KINDS = ['article', 'repair', 'analysis'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);
// JSON with object keys sorted, so two parses of the same data compare equal whatever the key order.
const canonical = value => JSON.stringify(value, (_, v) => (isObject(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));

function parse(text) {
  if (typeof text !== 'string') return null;
  try {
    let finite = true;
    const doc = JSON.parse(text, (_, v) => { if (typeof v === 'number' && !Number.isFinite(v)) finite = false; return v; });
    if (!finite) return null;
    return isObject(doc) && Array.isArray(doc.runs) && doc.runs.every(isObject) ? doc : null;
  } catch { return null; }
}

const runId = row => (typeof own(row, 'run_id') === 'string' && own(row, 'run_id') ? own(row, 'run_id') : null);

// A cost row whose only changes are what appendRun({ enrichMissing }) writes: a missing outcome or task kind (one of
// its values), the source with a newly filled task kind (which drops task_kind_unavailable), or task_kind_unavailable
// on a row with no task kind or source.
function filledOnly(before, after) {
  const filledKind = own(before, 'task_kind') == null && TASK_KINDS.includes(own(after, 'task_kind'));
  const allowed = {
    outcome: (was, now) => was == null && OUTCOMES.includes(now),
    task_kind: () => filledKind,
    task_kind_source: (was, now) => filledKind && was == null && now != null,
    task_kind_unavailable: (was, now) => (filledKind ? now === undefined
      : was == null && now != null && own(before, 'task_kind') == null && own(before, 'task_kind_source') == null),
  };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = own(before, key), now = own(after, key);
    if (canonical(was) === canonical(now)) continue;
    if (Object.hasOwn(allowed, key) && allowed[key](was, now)) continue;
    return false;
  }
  return true;
}

// A new cost row in the shape of Runbook §5-3: the previous run's cost, measured, booked by the next session. Its
// result metadata takes appendRun's values too (a task kind decides which per-run cap applies), and its day is a real
// day within the last month (older costs are Act's backfill, not a day branch's).
const DAY_MS = 86_400_000;
const dayTime = value => {
  const time = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
};
function costRowCode(row, day) {
  if (own(row, 'cap_review') !== undefined) return 'row_cap_review';
  if (own(row, 'cost_expectation') !== undefined) return 'row_cost_expectation';
  const cost = own(row, 'total_cost_usd'), date = dayTime(own(row, 'date_jst')), today = dayTime(day);
  if (own(row, 'route') !== 'actions' || typeof cost !== 'number' || !(cost > 0)
    || date === null || today === null || date > today || date < today - 31 * DAY_MS) return 'row_not_a_cost';
  if (own(row, 'task_kind') != null && !TASK_KINDS.includes(own(row, 'task_kind'))) return 'row_not_a_cost';
  if (own(row, 'outcome') != null && !OUTCOMES.includes(own(row, 'outcome'))) return 'row_not_a_cost';
  return null;
}

/**
 * null when `after` makes only the allowed changes to `before` (the file's text at the merge base and at the head),
 * else a reason code. `day` is the branch's date (YYYY-MM-DD), for the run ledger's new row.
 */
export function ledgerChange(file, before, after, { day = null } = {}) {
  if (!GATED_LEDGERS.includes(file)) return 'not_a_gated_ledger';
  if (before === after) return null;
  const old = parse(before), next = parse(after);
  if (!old || !next) return 'unreadable';
  if (canonical({ ...old, runs: null }) !== canonical({ ...next, runs: null })) return 'header_changed';
  // Rows without a run_id (none on main as of 2026-10-27) must stay exactly as they were.
  const loose = rows => rows.filter(row => !runId(row)).map(canonical).sort();
  const looseBefore = loose(old.runs), looseAfter = loose(next.runs);
  for (const row of looseBefore) {
    const at = looseAfter.indexOf(row);
    if (at < 0) return 'row_removed';
    looseAfter.splice(at, 1);
  }
  const byId = rows => {
    const map = new Map();
    for (const row of rows) if (runId(row)) map.set(runId(row), [...(map.get(runId(row)) ?? []), row]);
    return map;
  };
  const was = byId(old.runs), now = byId(next.runs);
  for (const [id, rows] of now) if (rows.length > 1 && (was.get(id)?.length ?? 0) < rows.length) return 'duplicate_run_id';
  for (const [id, rows] of was) {
    const after = now.get(id) ?? [];
    if (after.length < rows.length) return 'row_removed';
    if (rows.length > 1) {
      // A run_id the base already repeats: those rows stay exactly as they were.
      if (rows.map(canonical).sort().join('\n') !== after.map(canonical).sort().join('\n')) return 'row_rewritten';
      continue;
    }
    if (canonical(rows[0]) === canonical(after[0])) continue;
    if (file === COST_LEDGER && filledOnly(rows[0], after[0])) continue;
    return 'row_rewritten';
  }
  const added = [...[...now].filter(([id]) => !was.has(id)).map(([, rows]) => rows[0]), ...looseAfter.map(row => JSON.parse(row))];
  if (file === COST_LEDGER) return added.map(row => costRowCode(row, day)).find(Boolean) ?? null;
  if (added.length > 1) return 'rows_added';
  if (!added.length) return null;
  const [row] = added;
  if (!runId(row)) return 'row_without_run_id';
  if (own(row, 'date_jst') !== day) return 'row_other_day';
  if (own(row, 'repair_of') != null) return 'row_repair_of';
  return null;
}
