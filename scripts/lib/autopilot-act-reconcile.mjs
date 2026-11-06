// Offline preparation only. No GitHub, git mutations, model calls or ledger writes.
// Never resolve a conflict by choosing a whole old file over current main.
import { createHash } from 'node:crypto';

export const RUNS = 'data/autopilot-runs.json';
export const COST = 'data/autopilot-cost.json';
export const ACTIONS = 'data/autopilot-actions.json';
export const HISTORY = 'data/autonomy-score-history.json';
export const ELIGIBILITY = 'data/eligibility-log.json';
export const STATUS = 'data/autopilot-status.json';
export const REGENERATED = Object.freeze([
  'data/autopilot-actions-report.json', 'autopilot/index.html',
  ...['ar', 'es', 'id', 'ko', 'pt-BR', 'tr', 'zh-Hant', 'zh'].map(l => `${l}/autopilot/index.html`),
  'sitemap.xml', 'sitemap-ja.xml', 'sitemap-en.xml', 'sitemap-locales.xml',
]);
export const PRESERVED = Object.freeze(['data/emergency-stop.json', 'data/routine-runs.json']);
export const ALLOWED = Object.freeze([RUNS, COST, ACTIONS, HISTORY, ELIGIBILITY, STATUS, ...PRESERVED, ...REGENERATED]);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const canonical = v => JSON.stringify(v, (_, x) => object(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
const equal = (a, b) => canonical(a) === canonical(b);
const clone = v => structuredClone(v);
const digest = v => createHash('sha256').update(typeof v === 'string' ? v : canonical(v)).digest('hex');
const omit = (v, fields) => Object.fromEntries(Object.entries(v).filter(([k]) => !fields.includes(k)));
const fail = (code, file, id = null) => { throw Object.assign(new Error(`${code}: ${file}${id ? ` (${id})` : ''}`), { code, file, id }); };
function parse(text, file) {
  if (typeof text !== 'string' || !text.length) fail('unreadable', file);
  try {
    const doc = JSON.parse(text, (_, v) => {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('non-finite');
      return v;
    });
    if (!object(doc)) throw new Error('not an object');
    return doc;
  } catch { fail('unreadable', file); }
}
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const nonempty = v => typeof v === 'string' && v.trim() === v && v.length > 0;
const numericId = v => typeof v === 'string' && /^[1-9][0-9]*$/.test(v);
function rows(doc, key, idOf, file) {
  if (!Array.isArray(doc[key])) fail('invalid_rows', file);
  const map = new Map();
  for (const row of doc[key]) {
    if (!object(row)) fail('invalid_row', file);
    const id = idOf(row);
    if (!nonempty(id)) fail('missing_id', file);
    if (map.has(id)) fail('duplicate_id', file, id);
    map.set(id, row);
  }
  return map;
}
function unchangedHeader(base, main, pending, key, file, volatile = []) {
  const strip = d => omit(d, [key, ...volatile]);
  // main may contain a reviewed decision made since the common ancestor. A
  // pending header may be old or already landed, but cannot introduce a new one.
  if (!equal(strip(pending), strip(base)) && !equal(strip(pending), strip(main))) fail('pending_header_changed', file);
}
function mergeRows(base, main, pending, { file, key, idOf, validateNew = () => {}, volatile = [] }) {
  unchangedHeader(base, main, pending, key, file, volatile);
  const b = rows(base, key, idOf, file), m = rows(main, key, idOf, file), p = rows(pending, key, idOf, file);
  for (const id of b.keys()) if (!m.has(id) || !p.has(id)) fail('row_removed', file, id);
  const output = clone(main), added = [], present = [];
  for (const [id, row] of p) {
    if (m.has(id)) {
      if (equal(m.get(id), row)) { present.push(id); continue; }
      // A main-only approved correction stays. Conflicting rewrites, including
      // cost reductions and differing observed outcomes, are never synthesized.
      if (b.has(id) && equal(b.get(id), row)) continue;
      fail('row_conflict', file, id);
    }
    validateNew(row);
    output[key].push(clone(row));
    added.push(id);
  }
  return { document: output, added, present };
}
const OUTCOMES = new Set(['shipped', 'no_artifact', 'failed', 'cancelled', 'skipped_gate', 'skipped_duplicate', 'no_run']);
const RUN_KEYS = new Set(['run_id', 'date_jst', 'route', 'attempted', 'outcome', 'lane', 'action', 'pr', 'artifact',
  'failure_reason', 'external_ref', 'interventions', 'source', 'failed_at', 'detected_at', 'detected_note',
  'failure_stage', 'eligibility_verdict', 'gate_code', 'stage_note', 'failure_class', 'note', 'evidence']);
function validRun(row) {
  if (Object.keys(row).some(k => !RUN_KEYS.has(k))) fail('unknown_run_field', RUNS, row.run_id);
  if (!nonempty(row.run_id) || !date(row.date_jst) || row.route !== 'actions'
    || !numericId(row.external_ref) || row.source !== 'act-reconcile'
    || typeof row.attempted !== 'boolean' || !OUTCOMES.has(row.outcome)) fail('unverified_run_shape', RUNS, row.run_id);
  if (row.interventions != null) fail('owner_intervention', RUNS, row.run_id);
  if (row.attempted !== !['skipped_gate', 'skipped_duplicate', 'no_run'].includes(row.outcome)) fail('attempt_conflict', RUNS, row.run_id);
  if (row.outcome === 'shipped') fail('unverified_shipping', RUNS, row.run_id);
}
function checkExternalIds(doc) {
  const seen = new Map();
  for (const row of doc.runs) {
    if (row.route !== 'actions' || row.external_ref == null) continue;
    // Historical main rows may use Codex session IDs; preserve those without
    // treating them as GitHub run identities. New imported rows require numeric IDs.
    if (!numericId(row.external_ref)) continue;
    if (seen.has(row.external_ref)) fail('duplicate_external_ref', RUNS, row.external_ref);
    seen.set(row.external_ref, row);
  }
  return seen;
}
const COST_KEYS = new Set(['run_id', 'date_jst', 'route', 'total_cost_usd', 'num_turns', 'task_kind',
  'task_kind_source', 'outcome', 'note', 'job_id', 'models']);
function validCost(row, runByRef) {
  if (Object.keys(row).some(k => !COST_KEYS.has(k))) fail('unknown_cost_field', COST, row.run_id);
  const run = runByRef.get(row.run_id);
  if (!numericId(row.run_id) || row.route !== 'actions' || !date(row.date_jst)
    || typeof row.total_cost_usd !== 'number' || !Number.isFinite(row.total_cost_usd) || row.total_cost_usd < 0
    || !run || run.date_jst !== row.date_jst || (row.outcome != null && row.outcome !== run.outcome)) fail('unverified_cost_shape', COST, row.run_id);
  // A branch's assertion is not cost evidence. Require the existing structured
  // log identity when importing an unseen cost row; leave ambiguous legacy rows for review.
  const source = row.task_kind_source;
  if (!['article', 'repair', 'analysis'].includes(row.task_kind) || !object(source)
    || source.provider !== 'github_job_log' || source.run_id !== row.run_id || !numericId(source.job_id)
    || source.task_kind !== row.task_kind || !Number.isInteger(source.run_attempt) || source.run_attempt < 1
    || !Number.isInteger(source.step_number) || source.step_number < 1 || !Number.isFinite(Date.parse(source.observed_at))) fail('unverified_cost_source', COST, row.run_id);
}
// Only discard known ephemeral derivations. Everything else includes owner
// decisions, close-condition parameters, handlers, reviews and unknown fields.
const ACTION_DERIVED = ['title', 'detail', 'state', 'created_jst', 'last_seen_jst', 'closed_jst',
  'reopened_jst', 'evidence', 'last_run_jst', 'last_run_log'];
function actionSeed(base, main, pending) {
  unchangedHeader(base, main, pending, 'actions', ACTIONS, ['last_run_jst']);
  const b = rows(base, 'actions', r => r.id, ACTIONS), m = rows(main, 'actions', r => r.id, ACTIONS), p = rows(pending, 'actions', r => r.id, ACTIONS);
  for (const id of b.keys()) if (!p.has(id) || !m.has(id)) fail('action_removed', ACTIONS, id);
  for (const [id, row] of p) {
    if (equal(row, m.get(id))) continue;
    if (!b.has(id) || !m.has(id)) fail('unreconciled_action', ACTIONS, id);
    const before = b.get(id), landed = m.get(id);
    const protectedPart = r => omit(r, ACTION_DERIVED);
    if (!equal(protectedPart(row), protectedPart(before)) && !equal(protectedPart(row), protectedPart(landed))) fail('owner_or_unknown_action_change', ACTIONS, id);
    // Manual closure and its evidence are owner decisions, not derivations.
    if ([row, before, landed].some(r => r.close_check?.kind === 'manual')
      && !equal(omit(row, ['last_seen_jst']), omit(before, ['last_seen_jst']))
      && !equal(omit(row, ['last_seen_jst']), omit(landed, ['last_seen_jst']))) fail('manual_decision_changed', ACTIONS, id);
    // Acknowledgment and its evidence are owner decisions, not derived states.
    if ([row.state, before.state].includes('acknowledged')
      && !equal(omit(row, ['last_seen_jst']), omit(before, ['last_seen_jst']))
      && !equal(omit(row, ['last_seen_jst']), omit(landed, ['last_seen_jst']))) fail('acknowledgment_changed', ACTIONS, id);
  }
  return clone(main);
}
export function assertPinnedRefs(expected, observed) {
  for (const name of ['base', 'main', 'pending']) {
    if (!/^[a-f0-9]{40}$/.test(expected?.[name] ?? '') || observed?.[name] !== expected[name]) fail('ref_moved_or_unreadable', name);
  }
}
/** Inputs are complete snapshots of every path changed base..pending, plus five
 * required ledgers. Callers must obtain refs and path inventory from trusted git,
 * not PR text. This function cannot itself prove a GitHub run or author identity. */
export function reconcileSnapshots({ base, main, pending, changedPaths, refs, observedRefs }) {
  assertPinnedRefs(refs, observedRefs);
  if (![base, main, pending].every(object) || !Array.isArray(changedPaths)
    || changedPaths.some(p => typeof p !== 'string') || new Set(changedPaths).size !== changedPaths.length) fail('invalid_snapshot', 'manifest');
  const changed = new Set(changedPaths);
  for (const path of changed) if (!ALLOWED.includes(path)) fail('unexpected_path', path);
  // Detect incomplete caller inventories for every supplied file.
  for (const path of new Set([...Object.keys(base), ...Object.keys(pending)])) {
    if (base[path] !== pending[path] && !changed.has(path)) fail('incomplete_inventory', path);
  }
  for (const path of changed) for (const snapshot of [base, main, pending]) if (typeof snapshot[path] !== 'string') fail('missing_snapshot', path);
  const files = {}, facts = {};
  const docs = file => [base, main, pending].map(s => parse(s[file], file));
  const [rb, rm, rp] = docs(RUNS);
  const runResult = mergeRows(rb, rm, rp, { file: RUNS, key: 'runs', idOf: r => r.run_id, validateNew: validRun });
  const external = checkExternalIds(runResult.document);
  const [cb, cm, cp] = docs(COST);
  const costResult = mergeRows(cb, cm, cp, { file: COST, key: 'runs', idOf: r => r.run_id, validateNew: r => validCost(r, external) });
  for (const [file, result] of [[RUNS, runResult], [COST, costResult]]) {
    files[file] = JSON.stringify(result.document, null, 2) + '\n';
    facts[file] = { added: result.added, already_present: result.present, row_count: result.document.runs.length };
  }
  files[ACTIONS] = JSON.stringify(actionSeed(...docs(ACTIONS)), null, 2) + '\n';
  for (const [file, key, idOf, volatile] of [
    [HISTORY, 'snapshots', r => date(r.at) ? r.at : null, []],
    [ELIGIBILITY, 'judgements', r => nonempty(r.candidate_id) && date(r.judged_jst) ? `${r.candidate_id}\0${r.judged_jst}` : null, ['last_judged_jst']],
  ]) {
    // Historical score/judgment changes cannot be safely regenerated for an old
    // branch from today's inputs. Retain exact new rows; conflicting same-key
    // history requires review instead of silently choosing one or deleting it.
    const result = mergeRows(...docs(file), { file, key, idOf, volatile });
    files[file] = JSON.stringify(result.document, null, 2) + '\n';
    facts[file] = { added: result.added, already_present: result.present, row_count: result.document[key].length };
  }
  for (const file of PRESERVED) if (changed.has(file)) {
    if (!equal(parse(pending[file], file), parse(base[file], file)) && !equal(parse(pending[file], file), parse(main[file], file))) fail('stop_or_observation_change', file);
    files[file] = main[file];
  }
  if (changed.has(STATUS)) {
    const [before, current, branch] = docs(STATUS);
    if (!equal(omit(branch, ['runs']), omit(before, ['runs'])) && !equal(omit(branch, ['runs']), omit(current, ['runs']))) fail('status_owner_decision_changed', STATUS);
    files[STATUS] = main[STATUS];
  }
  const regenerate = REGENERATED.filter(file => changed.has(file));
  if (changed.has(STATUS)) regenerate.push(STATUS);
  // Never import a stale rendered page/status/report from pending. The staged
  // outputs are inputs to regeneration, not a publishable tree.
  const receipt = { version: 1, status: 'prepared_not_publishable', refs: clone(refs), facts,
    regenerate, required_checks: ['ledger schema', 'containment', 'budget', 'owner decision preservation', 'report/translation/sitemap freshness'],
    inputs: Object.fromEntries([...new Set([...changedPaths, RUNS, COST, ACTIONS, HISTORY, ELIGIBILITY])].sort()
      .map(file => [file, Object.fromEntries(['base', 'main', 'pending'].map((name, i) => [name, digest([base, main, pending][i][file])]))])),
    outputs: Object.fromEntries(Object.entries(files).map(([file, text]) => [file, digest(text)])),
    preserved_history: Object.fromEntries([[HISTORY, 'snapshots'], [ELIGIBILITY, 'judgements']].map(([file, key]) => [file, JSON.parse(files[file])[key].map(row => ({ id: file === HISTORY ? row.at : `${row.candidate_id}\0${row.judged_jst}`, day: file === HISTORY ? row.at : row.judged_jst, sha256: digest(row) }))])),
  };
  return { files, receipt };
}

export function renderReconciliationReport(receipt) {
  return ['# Autopilot Act reconciliation preparation', '',
    `Status: ${receipt.status}. No workflow, run, push, PR or production change was made.`,
    `Main: ${receipt.refs.main}`, `Pending: ${receipt.refs.pending}`, '',
    ...Object.entries(receipt.facts).map(([file, f]) => `- ${file}: ${f.row_count} rows; ${f.added.length} added; ${f.already_present.length} exact pending rows already present.`), '',
    '## Required before publication',
    '- Re-fetch main and pending refs and recompute if either changed. Use an explicit expected pending SHA lease for any later authorized push.',
    '- Regenerate Act report, status, eligibility, score, public report, translations, then sitemap from the merged inputs. Never copy pending reports.',
    '- Run existing schema, containment, budget, emergency-stop, publication and full CI checks on the complete candidate tree.',
    '- Unknown owner decisions, stop conditions, different same-ID rows and historical conflicts require review.', '',
    `Generated paths requiring refresh: ${receipt.regenerate.join(', ') || '(none in supplied diff; report freshness still requires verification)'}`, '',
  ].join('\n');
}

// Re-generation may replace today's derived sample, never erase earlier history.
export function verifyPreparedHistory(receipt, current, today) {
  if (!date(today) || !object(receipt?.preserved_history)) fail('missing_history_receipt', 'receipt');
  for (const [file, key, idOf] of [[HISTORY, 'snapshots', r => r.at], [ELIGIBILITY, 'judgements', r => `${r.candidate_id}\0${r.judged_jst}`]]) {
    const previous = receipt.preserved_history[file];
    if (!Array.isArray(previous)) fail('missing_history_receipt', file);
    const now = rows(parse(current[file], file), key, idOf, file);
    for (const row of previous) {
      if (!date(row.day) || row.day > today || typeof row.sha256 !== 'string') fail('invalid_history_receipt', file);
      if (row.day === today) continue;
      if (!now.has(row.id) || digest(now.get(row.id)) !== row.sha256) fail('historical_row_changed', file, row.id);
    }
  }
}
