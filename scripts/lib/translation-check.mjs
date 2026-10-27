// The translation check SEO Validation runs (build_site_translations.py --check), for the Autopilot before a PR exists.
//
// The session translates the public pages it edits (prompt step 4); the publish job does not translate, and its record
// step fails when the generators would rewrite a page outside the record paths. On 2026-10-27 (run 40433175978) a
// refresh day changed eight text units of a translated page without translations: the publish job opened the PR, the
// record step stopped on "8 incomplete translations", and the PR stayed red without its run row. decision-ci
// --verify-local (the session) and verifyHandoff (the publish job, with trusted code) now run the same check first.

import { spawnSync } from 'node:child_process';
import { LEDGER, LEDGER_ADDED_ONLY } from './autopilot-paths.mjs';

/**
 * Whether a change set needs the check. The builder reads more than pages and data/i18n/: the scripts named in
 * data/i18n/dynamic-text.json, the diagrams in data/i18n/diagrams.json, reference data under assets/ (2026-10-27
 * review: an SVG, a JS file and a JSON file each made --check fail while a pages-only trigger skipped it). So every
 * change runs it except a day that only writes the run ledgers and declarations (status, runs, cost, LOG, intents).
 */
export function needsTranslationCheck(paths) {
  return (paths ?? []).some(file => !(LEDGER.includes(file) || LEDGER_ADDED_ONLY.some(re => re.test(file))));
}

/**
 * null when --check passed, else a reason code. The codes come from fixed lines of the trusted script, never from the
 * pages (nothing model-written reaches a log through here). 'unchecked': the check did not finish (error, time-out).
 */
export function translationsVerdict({ status, stdout = '', stderr = '', error = null } = {}) {
  if (error || status === null || status === undefined) return 'unchecked';
  if (status === 0) return null;
  if (/ incomplete translations; no HTML written\./.test(String(stderr))) return 'incomplete';
  if (/ untranslated dates; no HTML written\./.test(String(stderr))) return 'dates';
  if (/^Public page is absent from the translation registry: /m.test(String(stderr))) return 'unregistered';
  if (/^\d+ translations; [1-9]\d* stale$/m.test(String(stdout))) return 'stale';
  return 'failed';
}

// The check reads model-written data: no token, and no file a step reads back as workflow commands.
const CHILD_ENV_DROP = /TOKEN|SECRET|PASSWORD|CREDENTIAL|^ACTIONS_|^GITHUB_(?:ENV|OUTPUT|PATH|STATE|STEP_SUMMARY)$/i;

/**
 * Runs the check in a tree (about four to six minutes on the whole site). Nine minutes at most, so that the publish
 * job (25 minutes) still has time for the record step after a slow pass; a run that does not finish is 'unchecked'.
 */
export function runTranslationCheck(cwd, runner = spawnSync) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !CHILD_ENV_DROP.test(key)));
  return translationsVerdict(runner('python3', ['-E', '-s', 'scripts/build_site_translations.py', '--check'], {
    // python3 -E -s ignores PYTHON* variables and the user site, as the record step runs it.
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 9 * 60_000, env,
  }));
}
