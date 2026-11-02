import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

// Pure selector: no filesystem, Git process, browser, network or caller-selected
// widths. The trusted caller reads immutable Git objects and fails on read errors.
export const IMPORTANT_PAGES = Object.freeze(['/', '/en/', '/autopilot/']);
export const VIEWPORT_WIDTHS = Object.freeze([320, 360, 375, 390, 393, 414, 430, 600, 768, 800, 900, 1024, 1100, 1280]);
export const FULL_BLINK_WIDTHS = Object.freeze([320, 360, 900, 1100]);
export const FULL_WEBKIT_WIDTHS = Object.freeze([320]);
const SHA = /^[a-f0-9]{40}$/;
// These GitHub metadata files have no page-rendering role. This exemption only
// selects viewport work; it does not waive security, ownership or other gates.
const NON_RENDER_METADATA = new Set([
  '.github/CODEOWNERS', '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.md', '.github/ISSUE_TEMPLATE/feature_request.md',
]);
const EXCLUDED_PAGE_DIRS = new Set(['node_modules', '.git', 'fixtures']);
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
function need(ok, code) { if (!ok) throw new Error(code); }
function exactSha(value) { need(typeof value === 'string' && SHA.test(value), 'INVALID_SHA'); return value; }
function bytes(value) {
  need(Buffer.isBuffer(value) || typeof value === 'string', 'MISSING_RAW_INVENTORY');
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  need(typeof value !== 'string' || text === value, 'INVALID_UTF8_INVENTORY');
  return { raw, text };
}
function nulRecords(value) {
  const { raw, text } = bytes(value);
  need(!text || text.endsWith('\0'), 'TRUNCATED_NUL_INVENTORY');
  return { raw, fields: text ? text.slice(0, -1).split('\0') : [] };
}
export function validateViewportPath(file) {
  need(typeof file === 'string' && file.length > 0 && !/[\\\x00-\x1f\x7f]/.test(file)
    && !file.startsWith('/') && !file.endsWith('/')
    && file.split('/').every(p => p !== '' && p !== '.' && p !== '..'), 'INVALID_PATH');
  return file;
}

// Reconstruct each directory's Git tree object from ls-tree -rz leaf entries.
// Comparing the resulting root object ID detects even whole-record truncation,
// including an omitted shared CSS path that a final NUL alone cannot detect.
function treeObjectId(entries) {
  const root = new Map();
  for (const entry of entries.values()) {
    const parts = entry.path.split('/'); let directory = root;
    for (const part of parts.slice(0, -1)) {
      const previous = directory.get(part);
      need(!previous || previous.directory, 'TREE_PATH_COLLISION');
      if (!previous) directory.set(part, { directory: new Map() });
      directory = directory.get(part).directory;
    }
    const name = parts.at(-1);
    need(!directory.has(name), 'TREE_PATH_COLLISION');
    directory.set(name, entry);
  }
  function digest(directory) {
    const rows = [...directory].sort(([a, av], [b, bv]) => Buffer.compare(
      Buffer.from(a + (av.directory ? '/' : '')), Buffer.from(b + (bv.directory ? '/' : ''))));
    const body = Buffer.concat(rows.map(([name, entry]) => Buffer.concat([
      Buffer.from((entry.directory ? '40000' : entry.mode) + ' ' + name + '\0'),
      Buffer.from(entry.directory ? digest(entry.directory) : entry.oid, 'hex'),
    ])));
    return hash('sha1', Buffer.concat([Buffer.from('tree ' + body.length + '\0'), body]));
  }
  return digest(root);
}

export function parseViewportTree({ commitSha, treeSha, raw, complete } = {}) {
  exactSha(commitSha); exactSha(treeSha);
  need(complete === true, 'INCOMPLETE_TREE_INVENTORY');
  const { fields } = nulRecords(raw); const entries = new Map();
  for (const field of fields) {
    const match = /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40})\t(.+)$/.exec(field);
    need(match && (match[1] === '160000' ? match[2] === 'commit' : match[2] === 'blob'), 'INVALID_TREE_RECORD');
    const file = validateViewportPath(match[4]);
    need(!entries.has(file), 'DUPLICATE_TREE_PATH');
    entries.set(file, { path: file, mode: match[1], type: match[2], oid: match[3] });
  }
  need(treeObjectId(entries) === treeSha, 'TREE_OBJECT_MISMATCH');
  // Following symlinks/gitlinks could introduce pages outside this fixed tree.
  need([...entries.values()].every(e => ['100644', '100755'].includes(e.mode)), 'UNSUPPORTED_TREE_ENTRY');
  return entries;
}

export function parseViewportDiff(raw) {
  const { fields } = nulRecords(raw); const records = [];
  for (let i = 0; i < fields.length;) {
    const status = fields[i++];
    need(/^[AMDT]$|^[RC](?:0[0-9]{2}|100)$/.test(status), 'INVALID_DIFF_STATUS');
    const count = /^[RC]/.test(status) ? 2 : 1;
    need(i + count <= fields.length, 'TRUNCATED_DIFF_RECORD');
    const paths = fields.slice(i, i + count).map(validateViewportPath); i += count;
    need(count === 1 || paths[0] !== paths[1], 'INVALID_RENAME_OR_COPY');
    records.push({ status, paths });
  }
  return records;
}
const changed = (before, after) => !before || !after || before.mode !== after.mode || before.oid !== after.oid;
function compareDiff(records, before, after) {
  const expected = new Set([...new Set([...before.keys(), ...after.keys()])]
    .filter(p => changed(before.get(p), after.get(p))));
  const represented = new Set();
  const add = file => { need(!represented.has(file), 'DUPLICATE_DIFF_PATH'); represented.add(file); };
  for (const { status, paths } of records) {
    const [first, second] = paths, old = before.get(first), current = after.get(first);
    if (status === 'A') need(!old && current, 'INCONSISTENT_ADDITION');
    else if (status === 'D') need(old && !current, 'INCONSISTENT_DELETION');
    else if (status === 'M') need(old && current && changed(old, current), 'INCONSISTENT_MODIFICATION');
    else if (status === 'T') need(old && current && old.mode !== current.mode, 'INCONSISTENT_TYPE_CHANGE');
    else {
      need(old && !before.has(second) && after.has(second), 'INCONSISTENT_RENAME_OR_COPY');
      if (status[0] === 'R') { need(!current, 'INCONSISTENT_RENAME'); add(first); }
      else need(current, 'INCONSISTENT_COPY');
      if (status.endsWith('100')) need(old.oid === after.get(second).oid, 'INCONSISTENT_EXACT_RENAME_OR_COPY');
      add(second); continue;
    }
    add(first);
  }
  need(expected.size === represented.size && [...expected].every(p => represented.has(p)), 'DIFF_TREE_MISMATCH');
}

function pageInventory(entries) {
  const paths = new Map(), collisionKeys = new Set();
  for (const file of [...entries.keys()].sort()) {
    if (!file.endsWith('.html') || file.split('/').slice(0, -1).some(p => EXCLUDED_PAGE_DIRS.has(p))) continue;
    need(!/[?#%]/.test(file) && (!file.endsWith('index.html') || file.split('/').at(-1) === 'index.html'), 'AMBIGUOUS_PAGE_URL');
    // Match existing allPages(): preserve foo.html, strip only terminal index.html.
    // Reject myindex.html: the legacy suffix mapping would target the wrong URL.
    const url = '/' + file.replace(/index\.html$/, '');
    const key = url.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
    need(!collisionKeys.has(key), 'PAGE_URL_COLLISION'); collisionKeys.add(key);
    paths.set(file, url);
  }
  return paths;
}
function globalReason(file) {
  if (/\.(?:css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|woff2?|ttf|otf)$/i.test(file)) return 'shared-code-style-font-or-checker';
  if (/(?:^|\/)(?:package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.txt|Gemfile(?:\.lock)?)$/.test(file)) return 'dependencies';
  if (/^(?:scripts|templates|functions|partials|layouts|includes|_templates|_partials|_layouts|_includes|locales|i18n|tools|data|growth)\//.test(file)
    || file.startsWith('.github/workflows/')) return 'global-implementation-or-data';
  return 'unknown-change';
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

/**
 * Input contract (all metadata must come from trusted immutable Git reads):
 * { baseSha, headSha, checkoutSha, checkoutParents,
 *   baseTree: {commitSha,treeSha,complete:true,raw:<git ls-tree -rz --full-tree>},
 *   checkoutTree: same shape,
 *   diff: {fromSha:baseSha,toSha:checkoutSha,complete:true,raw:<git diff --name-status -z>} }
 * A head checkout is an explicitly labelled local plan, not a mergeability proof.
 * A different checkout must be the synthetic merge with parents [base, head].
 * Missing/inconsistent evidence throws; callers must not convert this to fast/empty.
 */
export function selectViewportPlan(input = {}) {
  const { baseSha, headSha, checkoutSha, checkoutParents, baseTree, checkoutTree, diff } = input;
  [baseSha, headSha, checkoutSha].forEach(exactSha);
  need(Array.isArray(checkoutParents) && checkoutParents.length <= 2
    && checkoutParents.every(p => typeof p === 'string' && SHA.test(p))
    && new Set(checkoutParents).size === checkoutParents.length && !checkoutParents.includes(checkoutSha), 'INVALID_CHECKOUT_PARENTS');
  need(checkoutSha === headSha || (checkoutParents.length === 2
    && checkoutParents[0] === baseSha && checkoutParents[1] === headSha), 'CHECKOUT_BINDING_MISMATCH');
  need(baseTree?.commitSha === baseSha && checkoutTree?.commitSha === checkoutSha, 'TREE_COMMIT_BINDING_MISMATCH');
  const before = parseViewportTree(baseTree), after = parseViewportTree(checkoutTree);
  need(diff?.complete === true && diff.fromSha === baseSha && diff.toSha === checkoutSha, 'DIFF_BINDING_MISSING_OR_INVALID');
  const records = parseViewportDiff(diff.raw); compareDiff(records, before, after);
  pageInventory(before); // Reject pre-existing URL aliases as well as new collisions.
  const pagesByFile = pageInventory(after), allPages = [...pagesByFile.values()].sort();
  need(IMPORTANT_PAGES.every(p => allPages.includes(p)), 'IMPORTANT_PAGE_MISSING');
  const changedPages = new Set(), reasons = [];
  for (const record of records) {
    if (!['A', 'M'].includes(record.status)) {
      reasons.push({ code: 'deleted-renamed-copied-or-type-changed', paths: record.paths });
    }
    for (const file of record.paths) {
      if (pagesByFile.has(file)) changedPages.add(pagesByFile.get(file));
      const reason = globalReason(file);
      if (reason !== 'unknown-change' || (!pagesByFile.has(file) && !NON_RENDER_METADATA.has(file))) {
        reasons.push({ code: reason, paths: [file] });
      }
    }
  }
  const mode = reasons.length ? 'full' : 'fast';
  const deepPages = [...new Set([...IMPORTANT_PAGES, ...changedPages])].sort();
  const groups = [
    { name: 'blink_deep', engine: 'blink', pages: deepPages, widths: [...VIEWPORT_WIDTHS] },
    { name: 'webkit_deep', engine: 'webkit', pages: deepPages, widths: [...VIEWPORT_WIDTHS] },
  ];
  if (mode === 'full') {
    // Keep the existing full Blink sweep, including its repeated deep-page cases.
    groups.push({ name: 'blink_sweep', engine: 'blink', pages: allPages, widths: [...FULL_BLINK_WIDTHS] });
    const rest = allPages.filter(p => !deepPages.includes(p));
    if (rest.length) groups.push({ name: 'webkit_sweep', engine: 'webkit', pages: rest, widths: [...FULL_WEBKIT_WIDTHS] });
  }
  const plan = { version: 1, kind: 'viewport-predeploy-plan', mode,
    checkoutKind: checkoutSha === headSha ? 'head' : 'synthetic-merge',
    baseSha, headSha, checkoutSha, baseTreeSha: baseTree.treeSha, checkoutTreeSha: checkoutTree.treeSha,
    diffSha256: hash('sha256', bytes(diff.raw).raw), changedCount: records.length,
    changedPaths: [...new Set(records.flatMap(r => r.paths))].sort(),
    allPages, changedPages: [...changedPages].sort(), deepPages, reasons, groups,
    expectedMeasurements: groups.reduce((sum, g) => sum + g.pages.length * g.widths.length, 0),
    // Scope coverage is not functional health, full-recovery proof or merge permission.
    provesFunctionalHealth: false, provesFullRecovery: false, authorizesMerge: false };
  return freeze({ ...plan, planSha256: hash('sha256', JSON.stringify(plan)) });
}
