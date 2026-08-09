/**
 * Experiment ledger — the file that makes "we'll decide on the 29th" binding.
 *
 * The 2026-07-01/02 retitles were frozen with an evaluation date written into a
 * report body. The date passed, nobody was holding it, and twelve pages sat
 * untouchable for six weeks while the reports kept repeating "decide on 7/29".
 * Nothing was broken — there was simply no artifact that could be *overdue*.
 * This file is that artifact, and `check-experiments.mjs` reads it in CI.
 *
 * Status is the lifecycle; decision is the outcome. The brief lists
 * keep/revert/iterate alongside the lifecycle values, but an experiment that is
 * "keep" is an experiment that has been evaluated, so those live in `decision`
 * and `status` goes to `evaluated`. Storing the same fact twice invites the two
 * copies to disagree.
 *
 * `due` and `overdue` are deliberately NOT stored. They are functions of
 * evaluation_at and today's date, so deriving them means the ledger cannot go
 * stale by sitting still — the failure mode this whole file exists to prevent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LEDGER_PATH = path.join(ROOT, 'growth/experiments/experiments.json');

export const STATUSES = ['planned', 'running', 'frozen', 'evaluated', 'cancelled'];
export const DECISIONS = ['keep', 'revert', 'iterate', 'inconclusive'];
/** Statuses whose evaluation date can come due. */
export const OPEN_STATUSES = ['running', 'frozen'];

export function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return { version: 1, experiments: [] };
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

export function saveLedger(ledger) {
  ledger.experiments.sort((a, b) =>
    (a.started_at || '').localeCompare(b.started_at || '') || a.id.localeCompare(b.id));
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isOpen(exp) {
  return OPEN_STATUSES.includes(exp.status);
}

export function isDue(exp, asOf = today()) {
  return isOpen(exp) && !!exp.evaluation_at && exp.evaluation_at <= asOf;
}

export function daysOverdue(exp, asOf = today()) {
  if (!isDue(exp, asOf)) return 0;
  const ms = Date.parse(asOf) - Date.parse(exp.evaluation_at);
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * Structural validation. Returns a list of human-readable problems; empty means
 * the ledger is well-formed. Called by the CI gate so a malformed entry fails
 * loudly instead of being silently skipped by the overdue scan — an experiment
 * that cannot be parsed is an experiment that can never come due.
 */
export function validate(ledger) {
  const problems = [];
  const seen = new Set();
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  for (const e of ledger.experiments || []) {
    const at = `experiment ${e.id || '(missing id)'}`;
    if (!e.id) problems.push('an experiment has no id');
    else if (seen.has(e.id)) problems.push(`${at}: duplicate id`);
    else seen.add(e.id);

    if (!e.page) problems.push(`${at}: missing page`);
    if (!e.type) problems.push(`${at}: missing type`);
    if (!STATUSES.includes(e.status)) {
      problems.push(`${at}: status ${JSON.stringify(e.status)} not one of ${STATUSES.join('/')}`);
    }
    for (const field of ['started_at', 'evaluation_at']) {
      if (e[field] && !DATE.test(e[field])) {
        problems.push(`${at}: ${field} ${JSON.stringify(e[field])} is not YYYY-MM-DD`);
      }
    }
    if (isOpen(e) && !e.evaluation_at) {
      problems.push(`${at}: status ${e.status} requires evaluation_at (otherwise it can never come due)`);
    }
    if (e.started_at && e.evaluation_at && e.evaluation_at < e.started_at) {
      problems.push(`${at}: evaluation_at precedes started_at`);
    }
    if (e.status === 'evaluated') {
      if (!DECISIONS.includes(e.decision)) {
        problems.push(`${at}: evaluated experiments need decision one of ${DECISIONS.join('/')}`);
      }
      if (!e.evaluated_at) problems.push(`${at}: evaluated experiments need evaluated_at`);
    }
    if (e.decision != null && !DECISIONS.includes(e.decision)) {
      problems.push(`${at}: decision ${JSON.stringify(e.decision)} not one of ${DECISIONS.join('/')}`);
    }
  }
  return problems;
}

export function summarize(ledger, asOf = today()) {
  const exps = ledger.experiments || [];
  const due = exps.filter((e) => isDue(e, asOf));
  return {
    total: exps.length,
    open: exps.filter(isOpen).length,
    due,
    overdue: due.filter((e) => daysOverdue(e, asOf) > 0),
    byStatus: exps.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    }, {}),
  };
}
