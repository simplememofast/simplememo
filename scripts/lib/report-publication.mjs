// The public operating report (/autopilot/) and the pages generated from it.
//
// 2026-10-08 (#2031) added eight generated translations of the report, and the
// publishing paths now write them beside autopilot/index.html (Act #2052,
// Decision Monitor #2054, the daily run's Runbook §2-1 step 6). The gates that
// treat autopilot/index.html as bookkeeping must treat its translations the
// same way, or the daily run's PR fails `undeclared path: ar/autopilot/...`
// and is recorded as no_artifact. They read the set here, from the
// translation registry at a trusted commit, so a PR cannot widen its own
// bookkeeping set. decision-monitor's selftest pins its literal list to this.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REPORT_PAGE = 'autopilot/index.html';

/**
 * Generated translations only. Editorial pages of the group (ja, en) are not written by the generator.
 * Gates pass `registryText` from a trusted commit instead of reading the working tree.
 */
export function reportTranslationFiles(root = ROOT, { registryText = null } = {}) {
  const registry = JSON.parse(registryText ?? fs.readFileSync(path.join(root, 'data/i18n/pages.json'), 'utf8'));
  const groups = (registry.pages ?? []).filter(g => g?.source === REPORT_PAGE);
  if (groups.length !== 1) throw new Error('report translation group missing or ambiguous');
  const [group] = groups;
  const files = Object.entries(group.pages ?? {})
    .filter(([locale]) => !Object.hasOwn(group.existing ?? {}, locale))
    .map(([, file]) => file);
  if (!files.length || files.some(f => typeof f !== 'string' || !/^[A-Za-z-]+\/autopilot\/index\.html$/.test(f)))
    throw new Error('report translation routes are not generated locale pages');
  return files.sort();
}

/**
 * The gates' view: read the registry at a trusted commit (base, pre-declaration).
 * Anything absent or unreadable adds nothing — the bookkeeping set only narrows.
 */
export function reportTranslationsAt(readRegistry) {
  let text;
  try { text = readRegistry(); } catch { return []; }
  if (!text) return [];
  try { return reportTranslationFiles(ROOT, { registryText: text }); } catch { return []; }
}
