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
//   - the cost ledger: new rows (Runbook §5-3: the previous run's cost), without cap_review, and the result metadata
//     that autopilot-budget.mjs --append --enrich-missing-metadata fills into a row that lacks it.
// Everything else is refused: the other top-level keys (the budget block, notes), an existing row's values, a
// removed row, two rows with one run_id. Rows are matched by run_id, so their order is not compared (the ledgers'
// readers group rows by date). data/autopilot-status.json and the log are rewritten every day and gate nothing,
// so they are not checked here.

export const RUNS_LEDGER = 'data/autopilot-runs.json';
export const COST_LEDGER = 'data/autopilot-cost.json';
export const GATED_LEDGERS = Object.freeze([RUNS_LEDGER, COST_LEDGER]);

// autopilot-budget.mjs appendRun({ enrichMissing }): keys it fills into a cost row where they are null or absent.
// Filling task_kind also drops task_kind_unavailable.
const COST_FILL = new Set(['outcome', 'task_kind', 'task_kind_source', 'task_kind_unavailable']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => (Object.hasOwn(object, key) ? object[key] : undefined);
// JSON with object keys sorted, so two parses of the same data compare equal whatever the key order.
const canonical = value => JSON.stringify(value, (_, v) => (isObject(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v));

function parse(text) {
  if (typeof text !== 'string') return null;
  try {
    const doc = JSON.parse(text);
    return isObject(doc) && Array.isArray(doc.runs) && doc.runs.every(isObject) ? doc : null;
  } catch { return null; }
}

const runId = row => (typeof own(row, 'run_id') === 'string' && own(row, 'run_id') ? own(row, 'run_id') : null);

// A cost row whose only changes are what an enrich run fills in.
function filledOnly(before, after) {
  const filledKind = own(before, 'task_kind') == null && own(after, 'task_kind') != null;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = own(before, key), now = own(after, key);
    if (canonical(was) === canonical(now)) continue;
    if (COST_FILL.has(key) && was == null && now != null) continue;
    if (key === 'task_kind_unavailable' && filledKind && now === undefined) continue;
    return false;
  }
  return true;
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
  if (file === COST_LEDGER) return added.some(row => own(row, 'cap_review') !== undefined) ? 'row_cap_review' : null;
  if (added.length > 1) return 'rows_added';
  if (!added.length) return null;
  const [row] = added;
  if (!runId(row)) return 'row_without_run_id';
  if (own(row, 'date_jst') !== day) return 'row_other_day';
  if (own(row, 'repair_of') != null) return 'row_repair_of';
  return null;
}
