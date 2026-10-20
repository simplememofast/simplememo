// Path classes for the Obsidian Autopilot handoff (pure functions, no I/O).
//
// The model job of .github/workflows/obsidian-autopilot.yml holds no write
// credential. Its work reaches GitHub only through the model-free `publish` job,
// which runs scripts/autopilot-publish.mjs from the workflow commit. These classes
// are that job's path policy:
//   HARD_DENY  never pushed, whatever the request says
//   LEDGER     run records the publish job itself appends to
//   GENERATED  outputs the publish job regenerates with trusted code after the PR exists
// Everything else is ordinary page/data/script work ('approval' class for a later
// approval gate; this module only classifies).

export const DAY_BRANCH = /^claude\/obsidian-auto-(\d{8})$/;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_COMMITS = 250;

export const LEDGER = Object.freeze([
  'data/autopilot-status.json', 'data/autopilot-runs.json', 'data/autopilot-cost.json',
  'docs/obsidian/AUTOPILOT_LOG.md',
]);
// Added-only directories (a new intent or rejection file, never an edit of an old one).
export const LEDGER_ADDED_ONLY = Object.freeze([/^data\/decision-intents\/[^/]+\.json$/, /^data\/decision-rejections\/[^/]+\.json$/]);
// Same list as autopilot-act.yml's pending-path allowlist and git add list.
export const GENERATED_LOCALES = Object.freeze(['ar', 'es', 'id', 'ko', 'pt-BR', 'tr', 'zh-Hant', 'zh']);
export const GENERATED = Object.freeze([
  'autopilot/index.html',
  ...GENERATED_LOCALES.map(locale => `${locale}/autopilot/index.html`),
  'sitemap.xml', 'sitemap-ja.xml', 'sitemap-en.xml', 'sitemap-locales.xml',
]);
// What the publish job's own record commit is expected to touch (trusted code over branch
// data). Other translation outputs of the same generators are accepted only if they pass
// hardDenyReason(), exactly like the model's own commits.
export const RECORD_PATHS = Object.freeze(['data/autopilot-runs.json', ...GENERATED]);

export function isAutopilotBranch(name) {
  return typeof name === 'string' && DAY_BRANCH.test(name);
}

const SEGMENT_DENY = new Set(['.git', 'node_modules']);
const ROOT_DENY = new Set(['.gitmodules', '.gitattributes', 'package.json', 'package-lock.json']);

/** Returns a typed reason code when the path must never be pushed, else null. */
export function hardDenyReason(file, { mode = null, size = null, gscDay = null } = {}) {
  if (typeof file !== 'string' || !file || file.length > 400 || file.startsWith('/')
    || /[\u0000-\u001f\u007f\\]/.test(file)) return 'invalid_path';
  const parts = file.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) return 'invalid_path';
  if (parts.some(part => SEGMENT_DENY.has(part.toLowerCase()))) return 'denied_segment';
  if (parts[0] === '.github') return 'denied_github';
  if (parts.length === 1 && ROOT_DENY.has(file)) return 'denied_root_file';
  const base = parts.at(-1).toLowerCase();
  if (base.startsWith('.env') || /\.(?:pem|key|p12|pfx)$/.test(base)) return 'denied_secret_file';
  if (gscDay && file.startsWith(`growth/data/gsc/${gscDay}/`)) return 'denied_live_gsc';
  if (mode === '120000') return 'denied_symlink';
  if (mode === '160000') return 'denied_gitlink';
  if (mode !== null && !['100644', '100755', '000000'].includes(mode)) return 'denied_mode';
  if (size !== null && size > MAX_FILE_BYTES) return 'denied_size';
  return null;
}

export function isLedgerPath(file, status = 'M') {
  return LEDGER.includes(file) || (status === 'A' && LEDGER_ADDED_ONLY.some(re => re.test(file)));
}

export function isGeneratedPath(file) {
  return GENERATED.includes(file);
}

/** paths: [{ path, status }] or strings. 'ledger' only when every change is a ledger/generated path. */
export function classifyAutopilotChange(paths) {
  const reasons = [];
  for (const entry of paths ?? []) {
    const file = typeof entry === 'string' ? entry : entry?.path;
    const status = typeof entry === 'string' ? 'M' : entry?.status ?? 'M';
    if (hardDenyReason(file)) reasons.push(`hard_deny:${file}`);
    else if (!isLedgerPath(file, status) && !isGeneratedPath(file)) reasons.push(`approval:${file}`);
  }
  return { class: reasons.length ? 'approval' : 'ledger', reasons };
}
