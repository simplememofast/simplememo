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
// for fresh routine observations. growth/data/gsc/** is excluded on purpose: a
// new date directory can only advance that counter, and including it would gate
// the weekly ingest on the hand-synced revenue mirror. Main/daily still checks it.
const WAITING_PROGRESS_PATHS = new Set([
  'data/waiting-progress.json',
  'data/revenue-series.json',
  'data/financial-policy.json',
  'growth/scripts/revenue-series.mjs',
  'growth/REVENUE_OBSERVATIONS.md',
  'scripts/check-waiting-progress.mjs',
]);

export function routineScopeForPaths(paths) {
  if (!Array.isArray(paths)) throw new Error('Missing complete changed-path inventory');
  for (const file of paths) {
    if (typeof file !== 'string' || file.length === 0 || file.startsWith('/')
        || file.split('/').includes('..') || file.includes('\0')) {
      throw new Error('Invalid changed path');
    }
  }
  const matched = paths.filter(file => OPERATIONAL_PATHS.has(file));
  const waiting = paths.filter(file => WAITING_PROGRESS_PATHS.has(file));
  return { required: matched.length > 0, changedCount: paths.length, operationalCount: matched.length,
    waitingRequired: waiting.length > 0, waitingCount: waiting.length };
}

export function routineCiScope({ eventName, event, repo = process.cwd() }) {
  // Non-PR contexts never infer a site-only exemption. The workflow runs their
  // real checks in an independent monitor job, including the existing daily call.
  if (eventName !== 'pull_request') {
    return { required: true, waitingRequired: true, mode: 'operational-monitor',
      changedCount: null, operationalCount: null, waitingCount: null };
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
  const raw = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base + '...' + head, '--'],
    { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (raw !== '' && !raw.endsWith('\0')) throw new Error('Incomplete git path inventory');
  const paths = raw === '' ? [] : raw.slice(0, -1).split('\0');
  return { ...routineScopeForPaths(paths), mode: 'pull-request', base, head };
}
