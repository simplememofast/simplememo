import { execFileSync } from 'node:child_process';

// Changes to observation production, interpretation or operating instructions
// require a current observation. CI routing itself has unconditional contract
// tests; it does not pretend to collect new operational evidence.
const OPERATIONAL_PATHS = new Set([
  'data/routine-runs.json',
  'data/autopilot-runs.json',
  'data/autopilot-actions.json',
  'data/autopilot-actions-report.json',
  'data/autopilot-cost.json',
  'data/emergency-stop.json',
  'scripts/check-routine-runs.mjs',
  'scripts/routine-observer.mjs',
  'scripts/routine-observer-local.py',
  'scripts/codex-routine-observer.py',
  'scripts/codex-recovery-permit.py',
  'scripts/codex-autopilot-preflight.mjs',
  'scripts/autopilot-act.mjs',
  'scripts/autopilot-runs.mjs',
  'scripts/lib/codex-run-intake.mjs',
  'scripts/lib/routine-actions.mjs',
  '.github/workflows/autopilot-act.yml',
  '.github/workflows/obsidian-autopilot.yml',
  'docs/routine-observer.md',
  'docs/routine-snapshot-setup.md',
  'docs/codex-routine-observation.md',
  'docs/codex-autopilot-execution.md',
  'docs/obsidian/AUTOPILOT_RUNBOOK.md',
  'docs/obsidian/NATIVE_RECOVERY_ONE_USE.md',
]);

// Changes to a waiting counter, its mirror producer, or the checker require the
// waiting counters to still be moving. This list is deliberately separate from
// OPERATIONAL_PATHS: the revenue mirror is synced by hand from simplememo-ios and
// the GSC snapshot is a weekly ingest; neither is a routine operation. One list
// would make routine repairs wait for a revenue re-sync, and revenue syncs wait
// for fresh routine observations. Additions under WAITING_APPEND_ONLY_DIRS are
// not in it; deletions there are (see below). Main/daily still checks every wait.
const WAITING_PROGRESS_PATHS = new Set([
  'data/waiting-progress.json',
  'data/revenue-series.json',
  'data/financial-policy.json',
  'growth/scripts/revenue-series.mjs',
  'growth/REVENUE_OBSERVATIONS.md',
  'scripts/check-waiting-progress.mjs',
]);

// Dated snapshot directories that a wait reads only through its newest date label
// (latestLabel() in check-waiting-progress.mjs). Adding a date directory can only
// move that label forward, so additions are not waiting inputs: including them
// would gate the weekly GSC ingest on the hand-synced revenue mirror. Deleting or
// renaming anything under them can move the label back (for example a revert of
// the latest ingest), so every deletion there is a waiting input. --no-renames
// reports the old side of a rename as a deletion.
const WAITING_APPEND_ONLY_DIRS = ['growth/data/gsc'];

// Proposed 2026-10-27, owner-approved 2026-10-27 (docs/routine-ci-scope.md). Every PR compares the public autopilot page with the ledgers
// at the page's own stamped date (check-autopilot-page --as-stamped). Whether the
// page is today's value (--check) is a publication gate only for a PR that changes
// routine operations (the daily Act PR regenerates the page) or one of these files:
// the page that carries the clock-driven score and its stamp, the checker, the
// score it recomputes, and the publisher that writes the stamp. Main/daily still
// runs --check in routine-health.
// The checker's other compared files (the homepage and the two delivered PR
// texts) are deliberately not here. Every number on them reads no clock and is
// compared exactly on every PR; the checker refuses a score or stamp on them, so
// a clock-driven number cannot sit outside this list. Including them would block
// every homepage PR whenever the autopilot page is stale, which the PR did not cause.
const AUTOPILOT_PAGE_PATHS = new Set([
  'autopilot/index.html',
  'scripts/check-autopilot-page.mjs',
  'scripts/autonomy-score.mjs',
  'scripts/decision-monitor.mjs',
]);

function assertPaths(paths, missing) {
  if (!Array.isArray(paths)) throw new Error(missing);
  for (const file of paths) {
    if (typeof file !== 'string' || file.length === 0 || file.startsWith('/')
        || file.split('/').includes('..') || file.includes('\0')) {
      throw new Error('Invalid changed path');
    }
  }
}

// deletedPaths is the complete deletion inventory of the same comparison. Without
// it, a change under an append-only directory might be a deletion, so it counts as
// one: a caller cannot narrow the waiting scope by omitting the inventory.
export function routineScopeForPaths(paths, { deletedPaths } = {}) {
  assertPaths(paths, 'Missing complete changed-path inventory');
  const appendOnly = file => WAITING_APPEND_ONLY_DIRS.some(dir => file.startsWith(dir + '/'));
  let deletions = paths.filter(appendOnly);
  if (deletedPaths !== undefined) {
    assertPaths(deletedPaths, 'Missing complete deleted-path inventory');
    const changed = new Set(paths);
    if (!deletedPaths.every(file => changed.has(file))) throw new Error('Inconsistent deleted-path inventory');
    deletions = deletedPaths.filter(appendOnly);
  }
  const matched = paths.filter(file => OPERATIONAL_PATHS.has(file));
  const waiting = paths.filter(file => WAITING_PROGRESS_PATHS.has(file));
  const page = paths.filter(file => AUTOPILOT_PAGE_PATHS.has(file));
  return { required: matched.length > 0, changedCount: paths.length, operationalCount: matched.length,
    waitingRequired: waiting.length + deletions.length > 0, waitingCount: waiting.length,
    waitingDeletionCount: deletions.length,
    pageRequired: matched.length + page.length > 0, pageCount: page.length };
}

export function routineCiScope({ eventName, event, repo = process.cwd() }) {
  // Non-PR contexts never infer a site-only exemption. The workflow runs their
  // real checks in an independent monitor job, including the existing daily call.
  if (eventName !== 'pull_request') {
    return { required: true, waitingRequired: true, pageRequired: true, mode: 'operational-monitor',
      changedCount: null, operationalCount: null, waitingCount: null, waitingDeletionCount: null, pageCount: null };
  }
  const pr = event?.pull_request;
  const base = pr?.base?.sha;
  const head = pr?.head?.sha;
  const sha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
  if (!sha(base) || !sha(head) || pr?.base?.ref !== 'main') {
    throw new Error('Cannot determine complete PR scope');
  }
  // The checked-out HEAD is GitHub's merge tree. Compare the actual PR head
  // from its merge base instead. NUL output has no API pagination/truncation;
  // --no-renames retains both sides when an operational file moves away.
  const inventory = (...filter) => {
    const raw = execFileSync('git', ['diff', '--name-only', '--no-renames', ...filter, '-z', base + '...' + head, '--'],
      { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    if (raw !== '' && !raw.endsWith('\0')) throw new Error('Incomplete git path inventory');
    return raw === '' ? [] : raw.slice(0, -1).split('\0');
  };
  const paths = inventory();
  const deletedPaths = inventory('--diff-filter=D');
  return { ...routineScopeForPaths(paths, { deletedPaths }), mode: 'pull-request', base, head };
}
