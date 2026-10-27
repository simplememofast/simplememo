// The translation check SEO Validation runs (build_site_translations.py --check), for the Autopilot before a PR exists.
//
// The session translates the public pages it edits (prompt step 4); the publish job does not translate, and its record
// step fails when the generators would rewrite a page outside the record paths. On 2026-10-27 (run 40433175978) a
// refresh day changed eight text units of a translated page without translations: the publish job opened the PR, the
// record step stopped on "8 incomplete translations", and the PR stayed red without its run row. decision-ci
// --verify-local (the session) and verifyHandoff (the publish job, with trusted code) now run the same check first.

import { spawnSync } from 'node:child_process';

/** A change that can make the translations incomplete or stale: a page, or the translation catalogs and registry. */
export const translationInput = file => typeof file === 'string' && (file.endsWith('.html') || file.startsWith('data/i18n/'));

/**
 * null when --check passed, else a reason code. The codes come from fixed lines of the trusted script, never from the
 * pages (nothing model-written reaches a log through here).
 */
export function translationsVerdict({ status, stdout = '', stderr = '', error = null } = {}) {
  if (error || status === null || status === undefined) return 'unchecked';
  if (status === 0) return null;
  if (/ incomplete translations; no HTML written\./.test(String(stderr))) return 'incomplete';
  if (/ untranslated dates; no HTML written\./.test(String(stderr))) return 'dates';
  if (/^\d+ translations; [1-9]\d* stale$/m.test(String(stdout))) return 'stale';
  return 'unchecked';
}

/** Runs the check in a tree (about five minutes on the whole site, as in CI). */
export function runTranslationCheck(cwd, runner = spawnSync) {
  return translationsVerdict(runner('python3', ['-E', '-s', 'scripts/build_site_translations.py', '--check'], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60_000,
    // python3 -E -s ignores PYTHON* variables and the user site, as the record step runs it.
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  }));
}
