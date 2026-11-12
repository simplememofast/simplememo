import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { extractCommands, auditExtraction } from './preflight.mjs';
import { wiredChecks, gatingChecks } from './check-selftests.mjs';

const workflow = new URL('../.github/workflows/seo-check.yml', import.meta.url);
const text = fs.readFileSync(workflow, 'utf8');
const lanes = ['seo-core', 'seo-translations', 'seo-pages', 'seo-generators', 'seo-company'];
const jobs = Object.fromEntries([...text.matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map(m => [m[1], m[2]]));
const aggregate = jobs['seo-check'];
const body = aggregate.match(/          script: \|\n((?:            .*\n|\n)+)/)[1].split('\n').map(line => line.slice(12)).join('\n');
const invoke = needs => vm.runInNewContext(body, { process: { env: { SEO_NEEDS: JSON.stringify(needs) } } });
const green = () => Object.fromEntries(lanes.map(lane => [lane, { result: 'success' }]));

test('original required check is an always-run fail-closed aggregate of all lanes', () => {
  assert.match(aggregate, /^    if: always\(\)\n/);
  assert.deepEqual(aggregate.match(/needs: \[(.*?)\]/)[1].split(', '), lanes);
  assert.match(aggregate, /SEO_NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.doesNotThrow(() => invoke(green()));
  for (const invalid of [null, {}, [], { ...green(), surprise: { result: 'success' } }]) assert.throws(() => invoke(invalid));
});
for (const lane of lanes) test(`${lane}: failure, skipped, cancelled, missing or unknown cannot pass`, () => {
  for (const result of ['failure', 'skipped', 'cancelled', '', undefined, 'neutral']) {
    const needs = green(); needs[lane] = { result }; assert.throws(() => invoke(needs), undefined, `Reject ${lane}: ${result}`);
  }
  const missing = green(); delete missing[lane]; assert.throws(() => invoke(missing));
});

test('each lane has an unconditional isolated full-history checkout and pinned runtime', () => {
  for (const lane of lanes) {
    assert.ok(jobs[lane], lane);
    assert.doesNotMatch(jobs[lane], /^    (?:if|needs|continue-on-error):/m);
    assert.match(jobs[lane], /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
    assert.match(jobs[lane], /fetch-depth: 0/);
    assert.match(jobs[lane], /persist-credentials: false/);
    assert.match(jobs[lane], /actions\/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1/);
    assert.match(jobs[lane], /node-version: '24.22.3'/);
    assert.match(jobs[lane], /package-manager-cache: false/);
  }
  assert.match(text, /permissions:\n  contents: read/);
  assert.doesNotMatch(text, /contents: write|actions: write|secrets\.|pull_request_target:/);
});

test('scope production and all conditional consumers stay in the core', () => {
  assert.match(jobs['seo-core'], /id: routine_scope/);
  assert.equal((jobs['seo-core'].match(/steps\.routine_scope\.outputs\./g) || []).length, 5);
  for (const lane of lanes.slice(1)) assert.doesNotMatch(jobs[lane], /routine_scope|\n        if:/);
});

test('public IndexNow side effect remains after every gate, with its exact old policy', () => {
  assert.doesNotMatch(jobs['seo-core'], /node scripts\/indexnow-notify.js --since/);
  assert.ok(aggregate.indexOf('Require every mandatory SEO lane') < aggregate.indexOf('IndexNow notification'));
  assert.match(aggregate, /if: github.ref == 'refs\/heads\/main' && github.event_name == 'push'\n        run: node scripts\/indexnow-notify.js --since 1\n        continue-on-error: true/);
  assert.match(aggregate, /fetch-depth: 0/);
});

test('preflight and selftest-ledger parsers retain every moved command', () => {
  const commands = extractCommands(text).map(c => [c.runner, c.script, ...c.args].join(' '));
  const expected = [
    'python3 scripts/build_site_translations.py --selftest', 'python3 scripts/build_site_translations.py --check',
    'python3 scripts/sync_shared_chrome.py --selftest', 'python3 scripts/sync_shared_chrome.py --check',
    'python3 scripts/generate_sitemap.py --selftest', 'python3 scripts/generate_sitemap.py --check',
    'node scripts/check-generators.mjs --selftest', 'node scripts/check-generators.mjs --check', 'node scripts/check-generators.mjs --run',
    'node --test growth/lib/company.test.mjs growth/lib/company-connection-evidence.test.mjs growth/lib/company-goal-followup.test.mjs',
  ];
  for (const command of expected) assert.ok(commands.includes(command), command);
  assert.deepEqual(auditExtraction(text).dropped.unknown, []);
  for (const file of ['scripts/build_site_translations.py', 'scripts/sync_shared_chrome.py', 'scripts/generate_sitemap.py', 'scripts/check-generators.mjs']) {
    assert.ok(wiredChecks(workflow).includes(file), file);
    assert.ok(gatingChecks(workflow).includes(file), file);
  }
});

test('next job condition cannot incorrectly demote previous mandatory final step', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-wiring-'));
  try {
    const file = path.join(dir, 'workflow.yml');
    fs.writeFileSync(file, 'jobs:\n  mandatory:\n    steps:\n      - run: node scripts/last.mjs --check\n  conditional:\n    if: always()\n    steps:\n      - uses: actions/checkout@pin\n');
    assert.deepEqual(gatingChecks(file), ['scripts/last.mjs']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
