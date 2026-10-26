import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { selectViewportPlan, parseViewportDiff, parseViewportTree,
  validateViewportPath, VIEWPORT_WIDTHS, IMPORTANT_PAGES } from './lib/viewport-plan.mjs';

const BASE = '1'.repeat(40), HEAD = '2'.repeat(40), CHECKOUT = '3'.repeat(40);
const oid = text => createHash('sha1').update(text).digest('hex');
const entry = (path, content = path, mode = '100644') => ({ path, oid: oid(content), mode });
const essentials = () => ['index.html', 'en/index.html', 'autopilot/index.html', 'other.html'].map(p => entry(p));

// Independent fixture oracle: Git hashes the raw directory object, without -w,
// index changes, commits, network, browser calls, or persistence of fixture objects.
function inventory(entries, commitSha) {
  const directories = new Map([['', []]]);
  for (const row of entries) {
    const parts = row.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!directories.has(dir)) directories.set(dir, []);
    }
    directories.get(parts.slice(0, -1).join('/')).push({ ...row, name: parts.at(-1) });
  }
  const ids = new Map();
  for (const dir of [...directories.keys()].sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length)) {
    const children = directories.get(dir);
    for (const [child, id] of ids) {
      if (child.split('/').slice(0, -1).join('/') === dir) children.push({ name: child.split('/').at(-1), mode: '40000', oid: id });
    }
    children.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.mode === '40000' ? '/' : '')), Buffer.from(b.name + (b.mode === '40000' ? '/' : ''))));
    const raw = Buffer.concat(children.map(e => Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), Buffer.from(e.oid, 'hex')])));
    ids.set(dir, execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { input: raw, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim());
  }
  return { commitSha, treeSha: ids.get(''), complete: true,
    raw: entries.map(e => `${e.mode} ${e.mode === '160000' ? 'commit' : 'blob'} ${e.oid}\t${e.path}\0`).join('') };
}
function input(before = essentials(), after = before, diff = '') {
  return { baseSha: BASE, headSha: HEAD, checkoutSha: CHECKOUT, checkoutParents: [BASE, HEAD],
    baseTree: inventory(before, BASE), checkoutTree: inventory(after, CHECKOUT),
    diff: { fromSha: BASE, toSha: CHECKOUT, complete: true, raw: diff } };
}
function modified(path, mode) {
  const before = essentials(); before.push(entry(path));
  const after = before.map(e => e.path === path ? entry(path, 'changed', mode || e.mode) : e);
  return input(before, after, `M\0${path}\0`);
}

test('verified unchanged tree keeps critical three at all fourteen widths on both engines', () => {
  const plan = selectViewportPlan(input());
  assert.equal(plan.mode, 'fast'); assert.equal(plan.expectedMeasurements, 84);
  assert.equal(plan.checkoutKind, 'synthetic-merge');
  for (const group of plan.groups) {
    assert.deepEqual(group.pages, [...IMPORTANT_PAGES].sort());
    assert.deepEqual(group.widths, VIEWPORT_WIDTHS);
  }
  assert.deepEqual(plan.groups.map(g => g.engine), ['blink', 'webkit']);
  assert.equal(plan.provesFunctionalHealth, false); assert.equal(plan.provesFullRecovery, false);
  assert.equal(plan.authorizesMerge, false); assert.equal(Object.isFrozen(plan.groups[0].pages), true);
  assert.throws(() => plan.groups[0].pages.pop(), TypeError);
});

test('page-local HTML modification and addition retain every changed page', () => {
  const before = essentials(), after = before.map(e => e.path === 'other.html' ? entry(e.path, 'changed') : e);
  after.push(entry('new/index.html'));
  const plan = selectViewportPlan(input(before, after, 'M\0other.html\0A\0new/index.html\0'));
  assert.equal(plan.mode, 'fast'); assert.deepEqual(plan.changedPages, ['/new/', '/other.html']);
  assert.equal(plan.expectedMeasurements, 140);
});

test('no page-count cap silently removes changed HTML', () => {
  const before = essentials(), additions = Array.from({ length: 151 }, (_, i) => entry(`page-${i}.html`));
  const plan = selectViewportPlan(input(before, [...before, ...additions], additions.map(e => `A\0${e.path}\0`).join('')));
  assert.equal(plan.changedPages.length, 151); assert.equal(plan.deepPages.length, 154);
  assert.equal(plan.expectedMeasurements, 154 * 28);
});

for (const path of ['assets/shared.css', 'assets/app.js', 'assets/font.woff2', 'templates/card.html',
  '_layouts/base.html', 'scripts/generate.mjs', 'scripts/check-viewport-overflow.mjs', 'package-lock.json', '.github/workflows/seo.yml', 'unclassified.txt']) {
  test(`global or unknown change uses full existing sweep: ${path}`, () => {
    const plan = selectViewportPlan(modified(path));
    assert.equal(plan.mode, 'full');
    assert.deepEqual(plan.groups.find(g => g.name === 'blink_sweep').pages, plan.allPages);
    assert.deepEqual(plan.groups.find(g => g.name === 'blink_sweep').widths, [320, 360, 900, 1100]);
    assert.deepEqual(plan.groups.find(g => g.name === 'webkit_sweep').pages, ['/other.html']);
    assert.ok(plan.reasons.length);
  });
}

test('only explicit non-render metadata allowlist uses fast', () => {
  assert.equal(selectViewportPlan(modified('.github/CODEOWNERS')).mode, 'fast');
  assert.equal(selectViewportPlan(modified('docs/unknown.md')).mode, 'full');
});

test('delete and exact rename remain full with complete destination inventory', () => {
  const before = essentials(), after = before.filter(e => e.path !== 'other.html');
  assert.equal(selectViewportPlan(input(before, after, 'D\0other.html\0')).mode, 'full');
  after.push({ ...before.at(-1), path: 'renamed.html' });
  assert.equal(selectViewportPlan(input(before, after, 'R100\0other.html\0renamed.html\0')).mode, 'full');
});

test('empty or record-boundary truncated diff cannot conceal shared CSS', () => {
  const fixture = modified('assets/shared.css');
  fixture.diff.raw = '';
  assert.throws(() => selectViewportPlan(fixture), /DIFF_TREE_MISMATCH/);
  const before = essentials(), after = before.map(e => e.path === 'other.html' ? entry(e.path, 'new') : e);
  after.push(entry('shared.css'));
  assert.throws(() => selectViewportPlan(input(before, after, 'M\0other.html\0')), /DIFF_TREE_MISMATCH/);
});

test('whole-record truncated tree cannot match its fixed root object ID', () => {
  const fixture = input(); fixture.checkoutTree.raw = fixture.checkoutTree.raw.split('\0').slice(0, -2).join('\0') + '\0';
  assert.throws(() => selectViewportPlan(fixture), /TREE_OBJECT_MISMATCH/);
});

test('diff framing rejects missing terminator, incomplete rename, status and duplicate paths', () => {
  assert.throws(() => parseViewportDiff('M\0other.html'), /TRUNCATED_NUL/);
  assert.throws(() => parseViewportDiff('R100\0old.html\0'), /TRUNCATED_DIFF_RECORD/);
  assert.throws(() => parseViewportDiff('Q\0other.html\0'), /INVALID_DIFF_STATUS/);
  const fixture = modified('shared.css'); fixture.diff.raw += fixture.diff.raw;
  assert.throws(() => selectViewportPlan(fixture), /DUPLICATE_DIFF_PATH/);
});

test('URL alias collision and URL control characters stop instead of selecting one page', () => {
  for (const extra of [[entry('other/index.html')], [entry('bad#fragment.html')], [entry('bad%2fpath.html')], [entry('myindex.html')]]) {
    assert.throws(() => selectViewportPlan(input([...essentials(), ...extra])), /PAGE_URL_COLLISION|AMBIGUOUS_PAGE_URL/);
  }
});

test('tree malformed entries, duplicates, prefix collisions and unsupported links stop', () => {
  const fixture = input();
  for (const raw of [fixture.checkoutTree.raw + fixture.checkoutTree.raw.split('\0')[0] + '\0',
    fixture.checkoutTree.raw.replace('100644 blob', '100644 commit')]) {
    assert.throws(() => parseViewportTree({ ...fixture.checkoutTree, raw }), /DUPLICATE_TREE_PATH|INVALID_TREE_RECORD/);
  }
  assert.throws(() => parseViewportTree({ ...fixture.checkoutTree, raw: fixture.checkoutTree.raw + `100644 blob ${oid('x')}\ten\0` }), /TREE_PATH_COLLISION/);
  assert.throws(() => parseViewportTree(inventory([...essentials(), entry('link', 'target', '120000')], HEAD)), /UNSUPPORTED_TREE_ENTRY/);
});

test('bad paths and malformed UTF-8 are rejected without normalization', () => {
  for (const path of ['../a.html', '/a.html', 'a//b.html', 'a/./b.html', 'a\\b.html', 'a\nb.html', '', 'a/']) {
    assert.throws(() => validateViewportPath(path), /INVALID_PATH/);
  }
  assert.throws(() => parseViewportDiff(Buffer.from([0xff, 0])), TypeError);
});

test('SHA, checkout-parent and diff/tree binding omissions fail closed', () => {
  const good = input();
  for (const sha of ['', 'abc', 'A'.repeat(40), '1'.repeat(39), '../HEAD']) {
    assert.throws(() => selectViewportPlan({ ...good, headSha: sha }), /INVALID_SHA/);
  }
  for (const patch of [{ checkoutParents: [HEAD, BASE] }, { checkoutParents: [BASE] },
    { checkoutParents: [BASE, BASE] }, { checkoutParents: [] }]) {
    assert.throws(() => selectViewportPlan({ ...good, ...patch }), /CHECKOUT/);
  }
  assert.throws(() => selectViewportPlan({ ...good, baseTree: { ...good.baseTree, complete: false } }), /INCOMPLETE_TREE/);
  assert.throws(() => selectViewportPlan({ ...good, checkoutTree: { ...good.checkoutTree, commitSha: HEAD } }), /TREE_COMMIT_BINDING/);
  for (const patch of [{ complete: false }, { fromSha: HEAD }, { toSha: HEAD }]) {
    assert.throws(() => selectViewportPlan({ ...good, diff: { ...good.diff, ...patch } }), /DIFF_BINDING/);
  }
});

test('wrong diff status and missing important page cannot be treated as empty success', () => {
  const fixture = modified('other.txt'); fixture.diff.raw = 'A\0other.txt\0';
  assert.throws(() => selectViewportPlan(fixture), /INCONSISTENT_ADDITION/);
  const before = essentials(), after = before.filter(e => e.path !== 'en/index.html');
  assert.throws(() => selectViewportPlan(input(before, after, 'D\0en/index.html\0')), /IMPORTANT_PAGE_MISSING/);
});

test('plan is deterministic and binds checkout, tree and diff bytes', () => {
  const fixture = modified('other.txt'), plan = selectViewportPlan(fixture);
  assert.deepEqual(selectViewportPlan(fixture), plan); assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
  const headFixture = { ...fixture, checkoutSha: HEAD, checkoutParents: [BASE],
    checkoutTree: { ...fixture.checkoutTree, commitSha: HEAD }, diff: { ...fixture.diff, toSha: HEAD } };
  assert.equal(selectViewportPlan(headFixture).checkoutKind, 'head');
  assert.notEqual(selectViewportPlan(headFixture).planSha256, plan.planSha256);
});

test('strict widths and important pages remain equal to the existing measurement constants', () => {
  const source = readFileSync(new URL('./check-viewport-overflow.mjs', import.meta.url), 'utf8');
  const widths = source.match(/export const WIDTHS = (\[[^;]+\]);/)[1];
  assert.deepEqual(VIEWPORT_WIDTHS, JSON.parse(widths));
  assert.match(source, /export const PAGES = \['\/', '\/en\/', '\/autopilot\/'\];/);
});
