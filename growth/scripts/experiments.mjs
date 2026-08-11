#!/usr/bin/env node
/**
 * Experiment ledger CLI.
 *
 *   node growth/scripts/experiments.mjs list [--status frozen]
 *   node growth/scripts/experiments.mjs due
 *   node growth/scripts/experiments.mjs show <id>
 *   node growth/scripts/experiments.mjs add --page /x/ --type title_test \
 *        --evaluate 2026-09-06 [--started 2026-08-09] [--hypothesis "..."] \
 *        [--metric ctr] [--baseline-clicks N --baseline-impressions N \
 *         --baseline-ctr 0.0x --baseline-position N \
 *         --baseline-window YYYY-MM-DD..YYYY-MM-DD --baseline-source "..."]
 *   node growth/scripts/experiments.mjs evaluate <id> --decision keep [--note "..."]
 *   node growth/scripts/experiments.mjs reschedule <id> --evaluate 2026-09-06 --note "why"
 *
 * `evaluate` refuses to record a decision unless the ledger can point at GSC
 * data covering the period after the change. Recording "keep" from memory is
 * how the previous cycle produced six weeks of reports that all deferred to a
 * date nobody was holding — a decision with no evidence behind it is the thing
 * this ledger exists to make impossible, not merely to discourage.
 * `--force` exists for the genuine exception, and it stamps the entry as
 * evidence-free so the next reader knows.
 */

import {
  loadLedger, saveLedger, validate, summarize, isDue, daysOverdue, today,
  STATUSES, DECISIONS,
} from '../lib/ledger.mjs';
import { listSnapshots, loadSnapshot, toPath } from '../lib/gsc.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name, fallback = null) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}
function has(name) { return argv.includes(`--${name}`); }
/** A flag read as a number. Absent stays null; a non-number is a typo, not a zero. */
function numFlag(name) {
  const raw = flag(name);
  if (raw == null) return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) die(`--${name} must be a number (got ${JSON.stringify(raw)})`);
  return v;
}
function die(msg) { console.error(msg); process.exit(2); }

const ledger = loadLedger();
const pct = (v) => (v == null ? '   —' : `${(v * 100).toFixed(1)}%`);
const num = (v) => (v == null ? '—' : String(v));

function line(e, asOf) {
  const d = daysOverdue(e, asOf);
  const state = e.status === 'evaluated' ? `evaluated:${e.decision}`
    : isDue(e, asOf) ? (d > 0 ? `OVERDUE +${d}d` : 'due today')
    : e.status;
  return `${e.id.padEnd(24)} ${state.padEnd(16)} ${e.page}`;
}

/**
 * Snapshots that are usable as post-change evidence for an experiment.
 *
 * The bar is "the measurement window begins on or after the change shipped"
 * (`started_at`) — NOT after `evaluation_at`. Those are different dates and
 * conflating them was a real bug: a snapshot covering 07-11..08-07 is entirely
 * post-change for a 07-01 retitle and is exactly the data the decision should
 * be read from, yet comparing against the 07-29 evaluation date rejected it.
 * The evaluation date says when we promised to look, not which data is valid.
 */
function snapshotsCovering(exp) {
  const changedOn = exp.started_at || exp.evaluation_at;
  if (!changedOn) return [];
  return listSnapshots().filter((label) => {
    try {
      const s = loadSnapshot(label);
      const start = s.meta.period_start || s.meta.captured_at || label;
      return start >= changedOn;
    } catch { return false; }
  });
}

switch (cmd) {
  case 'list': {
    const want = flag('status');
    const asOf = today();
    const rows = ledger.experiments.filter((e) => !want || e.status === want);
    rows.forEach((e) => console.log(line(e, asOf)));
    const s = summarize(ledger, asOf);
    console.log(`\n${rows.length} shown · ${s.total} total · ${s.due.length} due · ${s.overdue.length} overdue`);
    break;
  }

  case 'due': {
    const asOf = today();
    const { due } = summarize(ledger, asOf);
    if (!due.length) { console.log('Nothing is due.'); break; }
    console.log(`${due.length} experiment(s) awaiting a decision (as of ${asOf}):\n`);
    for (const e of due.sort((a, b) => daysOverdue(b, asOf) - daysOverdue(a, asOf))) {
      console.log(line(e, asOf));
      if (e.baseline) {
        console.log(`  baseline  imp ${num(e.baseline.impressions)}  ctr ${pct(e.baseline.ctr)}  pos ${num(e.baseline.position)}` +
          (e.baseline.window ? `  [${e.baseline.window}]` : ''));
      }
      if (e.before?.title) console.log(`  before    ${e.before.title}`);
      if (e.after?.title)  console.log(`  after     ${e.after.title}`);
    }
    const snaps = [...new Set(due.flatMap(snapshotsCovering))].sort();
    console.log(snaps.length
      ? `\nPost-change GSC snapshots available: ${snaps.join(', ')}`
      : '\nNo post-change GSC snapshot ingested yet — see growth/GSC_OWNER_ACTION.md.');
    break;
  }

  case 'show': {
    const e = ledger.experiments.find((x) => x.id === argv[1]);
    if (!e) die(`no experiment with id ${argv[1]}`);
    console.log(JSON.stringify(e, null, 2));
    break;
  }

  case 'add': {
    const page = flag('page') || die('--page is required');
    const type = flag('type') || die('--type is required (e.g. title_test, faq_add, cta_variant)');
    const evaluate = flag('evaluate') || die('--evaluate YYYY-MM-DD is required — an experiment with no evaluation date can never come due');
    const started = flag('started', today());
    const seq = String(ledger.experiments.length + 1).padStart(3, '0');
    const e = {
      id: flag('id', `${type.replace(/_/g, '-')}-${started}-${seq}`),
      page, type,
      hypothesis: flag('hypothesis'),
      source: { pr: null, commit: null },
      started_at: started,
      evaluation_at: evaluate,
      status: 'running',
      before: null, after: null,
      // Recorded at registration, not at evaluation. Three of the 2026-07-01
      // retitles came due with every baseline field null, so there was nothing
      // to compare the post-change numbers against and all three had to be
      // closed `inconclusive` — the change may well have worked and it is now
      // unknowable. An experiment without a before-value is not an experiment.
      baseline: {
        clicks: numFlag('baseline-clicks'),
        impressions: numFlag('baseline-impressions'),
        ctr: numFlag('baseline-ctr'),
        position: numFlag('baseline-position'),
        window: flag('baseline-window'),
        source: flag('baseline-source'),
      },
      target_metric: flag('metric', 'ctr'),
      decision: null, evaluated_at: null, notes: [],
    };
    ledger.experiments.push(e);
    const problems = validate(ledger);
    if (problems.length) die(`refusing to write:\n  ${problems.join('\n  ')}`);
    saveLedger(ledger);
    console.log(`added ${e.id} (${e.page}), evaluate on ${e.evaluation_at}`);
    if (!Object.values(e.baseline).some((v) => v != null)) {
      console.log(
        `\n  WARNING: no baseline recorded. On ${e.evaluation_at} there will be nothing to compare against,\n` +
        `  and this experiment can only close as inconclusive — which is how title-2026-07-01-001/003/004 ended.\n` +
        `  Fix now:  experiments.mjs add … --baseline-impressions <n> --baseline-ctr <0.0x> --baseline-position <n> --baseline-window <YYYY-MM-DD..YYYY-MM-DD>`
      );
    }
    break;
  }

  case 'evaluate': {
    const e = ledger.experiments.find((x) => x.id === argv[1]);
    if (!e) die(`no experiment with id ${argv[1]}`);
    const decision = flag('decision') || die(`--decision is required, one of: ${DECISIONS.join(', ')}`);
    if (!DECISIONS.includes(decision)) die(`invalid decision ${decision}; expected ${DECISIONS.join(', ')}`);

    const snaps = snapshotsCovering(e);
    if (!snaps.length && !has('force')) {
      die(
        `No GSC snapshot covers the period after ${e.evaluation_at}, so there is nothing to read this decision off.\n` +
        `  Ingest one:  node growth/scripts/ingest-gsc.mjs --label <YYYY-MM-DD> --dir growth/input\n` +
        `  Owner steps: growth/GSC_OWNER_ACTION.md\n` +
        `  Override:    re-run with --force (the entry will be stamped evidence:none)`
      );
    }

    e.status = 'evaluated';
    e.decision = decision;
    e.evaluated_at = today();
    e.evidence = snaps.length ? { gsc_snapshots: snaps } : { gsc_snapshots: [], note: 'recorded with --force; no GSC data backed this decision' };
    const note = flag('note');
    if (note) (e.notes ||= []).push(`${today()}: ${note}`);

    const problems = validate(ledger);
    if (problems.length) die(`refusing to write:\n  ${problems.join('\n  ')}`);
    saveLedger(ledger);
    console.log(`${e.id} → evaluated / ${decision}${snaps.length ? ` (evidence: ${snaps.join(', ')})` : ' (NO EVIDENCE)'}`);
    if (decision === 'revert') console.log(`Next: restore the previous title on ${e.page}:\n  ${e.before?.title ?? '(no recorded before-title)'}`);
    if (decision === 'iterate') console.log(`Next: add the follow-up with \`experiments.mjs add --page ${e.page} --type title_test --evaluate <date>\``);
    if (decision === 'abandoned') console.log(`Next: drop ${e.page} from the CTR working lists. The point of this decision is that there is no next round.`);
    break;
  }

  case 'reschedule': {
    const e = ledger.experiments.find((x) => x.id === argv[1]);
    if (!e) die(`no experiment with id ${argv[1]}`);
    const to = flag('evaluate') || die('--evaluate YYYY-MM-DD is required');
    const note = flag('note') || die('--note is required — a moved deadline needs a reason on the record');
    (e.notes ||= []).push(`${today()}: evaluation_at ${e.evaluation_at} → ${to}: ${note}`);
    e.evaluation_at = to;
    const problems = validate(ledger);
    if (problems.length) die(`refusing to write:\n  ${problems.join('\n  ')}`);
    saveLedger(ledger);
    console.log(`${e.id} → evaluation_at ${to}`);
    break;
  }

  default:
    console.log(`usage: experiments.mjs <list|due|show|add|evaluate|reschedule> [...]

  statuses: ${STATUSES.join(', ')}
  decisions: ${DECISIONS.join(', ')}

  list [--status <status>]        every experiment, or one status
  due                             everything past its evaluation date, with baselines
  show <id>                       full JSON for one experiment
  add --page --type --evaluate    register a new experiment (evaluation date mandatory)
  evaluate <id> --decision <d>    record an outcome (requires post-change GSC data)
  reschedule <id> --evaluate --note   move a deadline, on the record`);
    process.exit(cmd ? 2 : 0);
}
