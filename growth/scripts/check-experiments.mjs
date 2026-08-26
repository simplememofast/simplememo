#!/usr/bin/env node
/**
 * CI gate: no experiment may quietly sail past its evaluation date.
 *
 *   node growth/scripts/check-experiments.mjs           # annotate, never block
 *   node growth/scripts/check-experiments.mjs --strict  # exit 1 when overdue
 *
 * Why overdue experiments do NOT fail CI by default
 * ------------------------------------------------
 * On this repo a green SEO Validation is what lets auto-merge.yml merge to
 * main, and merging to main *is* the production deploy. If an unevaluated
 * retitle blocked that pipeline, an overdue experiment would also block every
 * unrelated bugfix — turning a bookkeeping lapse into a shipping outage, and
 * creating pressure to rubber-stamp decisions just to unblock a deploy. That
 * trade is not worth it.
 *
 * So the default is loud but non-blocking: a GitHub Actions `::warning::`
 * annotation (surfaces at the top of the PR's checks) plus a table in the job
 * summary. Both are visible without opening a log. `--strict` exists for a
 * scheduled job or a local run where blocking is the point.
 *
 * A malformed ledger DOES fail, always. An entry that cannot be parsed is an
 * entry that can never come due, so a broken file would silently switch this
 * whole gate off — the exact failure it is here to prevent.
 */

import fs from 'node:fs';
import { loadLedger, validate, summarize, daysOverdue, today, DECISIONS } from '../lib/ledger.mjs';

const strict = process.argv.includes('--strict');
const asOf = today();

const ledger = loadLedger();
const problems = validate(ledger);
if (problems.length) {
  console.error('Experiment ledger is malformed:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nA malformed entry can never come due, which disables this gate. Fix before merging.');
  process.exit(1);
}

const { total, open, due, overdue } = summarize(ledger, asOf);
console.log(`Experiment ledger: ${total} total, ${open} open, ${due.length} due, ${overdue.length} overdue (as of ${asOf})`);

if (!due.length) {
  console.log('No experiment is past its evaluation date.');
  process.exit(0);
}

const rows = due
  .map((e) => ({ e, d: daysOverdue(e, asOf) }))
  .sort((a, b) => b.d - a.d);

for (const { e, d } of rows) {
  const label = d > 0 ? `${d} day(s) OVERDUE` : 'due today';
  console.log(`  ${label.padEnd(18)} ${e.id}  ${e.page}  (${e.type}, evaluation_at ${e.evaluation_at})`);
  // Annotation text is single-line by contract; GitHub renders \n as a literal.
  console.log(
    `::warning file=growth/experiments/experiments.json::${e.id} (${e.page}) is ${label}. ` +
    `Evaluate with: node growth/scripts/experiments.mjs evaluate ${e.id} --decision <${DECISIONS.join('|')}>`
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `### ⏰ ${rows.length} experiment(s) awaiting a decision`,
    '',
    '| Days overdue | Experiment | Page | Evaluation date |',
    '|---:|---|---|---|',
    ...rows.map(({ e, d }) => `| ${d} | \`${e.id}\` | \`${e.page}\` | ${e.evaluation_at} |`),
    '',
    'These pages stay frozen — do not stack a new title change on top of an unevaluated one.',
    '',
    '```sh',
    'node growth/scripts/experiments.mjs due',
    'node growth/scripts/experiments.mjs evaluate <id> --decision keep --note "..."',
    '```',
  ].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

if (strict && overdue.length) {
  console.error(`\nFAIL (--strict): ${overdue.length} experiment(s) overdue.`);
  process.exit(1);
}
process.exit(0);
