import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { routineCiScope, routineScopeForPaths } from './lib/routine-ci-scope.mjs';
import { runsFacts, todayJst } from './autopilot-runs.mjs';
import { extractCommands, auditExtraction } from './preflight.mjs';
import { gatingChecks } from './check-selftests.mjs';
import { PAGE_PATH, EXTRA_PATHS, checkPages } from './check-autopilot-page.mjs';

test('site assets and CI routing do not claim operational health', () => {
  for (const file of ['index.html', 'js/app-store-tracking.js', 'growth/queries/web-to-app.sql',
    '.github/workflows/seo-check.yml', 'scripts/lib/routine-ci-scope.mjs',
    'scripts/routine-ci-scope.test.mjs', 'docs/routine-ci-scope.md']) {
    assert.equal(routineScopeForPaths([file]).required, false, file);
    assert.equal(routineScopeForPaths([file]).waitingRequired, false, file);
  }
});

test('ledger, producer, consumer, schedule and operating instructions require observations', () => {
  for (const file of ['data/routine-runs.json', 'data/autopilot-runs.json',
    'data/autopilot-actions-report.json', 'scripts/autopilot-runs.mjs',
    'scripts/check-routine-runs.mjs', 'scripts/routine-observer.mjs',
    'scripts/routine-observer-local.py', 'scripts/codex-routine-observer.py',
    'scripts/lib/codex-run-intake.mjs', 'scripts/lib/routine-actions.mjs',
    'scripts/autopilot-act.mjs', '.github/workflows/autopilot-act.yml',
    'docs/routine-observer.md', 'docs/routine-snapshot-setup.md', 'docs/codex-routine-observation.md',
    'docs/codex-autopilot-execution.md', 'docs/obsidian/AUTOPILOT_RUNBOOK.md']) {
    assert.equal(routineScopeForPaths(['index.html', file]).required, true, file);
  }
});

test('missing or invalid path inventories cannot mean site-only', () => {
  for (const paths of [null, {}, [''], [null], ['/tmp/source'], ['docs/../data/routine-runs.json'], ['x\0y']]) {
    assert.throws(() => routineScopeForPaths(paths));
  }
});

test('main, daily, manual, reusable and unknown contexts retain operational monitoring', () => {
  for (const eventName of ['push', 'schedule', 'workflow_dispatch', 'workflow_call', '', undefined]) {
    assert.equal(routineCiScope({ eventName }).required, true);
    assert.equal(routineCiScope({ eventName }).waitingRequired, true);
    assert.equal(routineCiScope({ eventName }).mode, 'operational-monitor');
  }
});

function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-ci-scope-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Local Test Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
  };
  const commit = () => { git('add', '.'); git('commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  write('data/routine-runs.json', '{"observed_at":"2000-01-01T00:00:00Z"}\n');
  write('data/revenue-series.json', '{"source_generated_at":"2000-01-01T00:00:00Z"}\n');
  write('data/waiting-progress.json', '{"waits":[]}\n');
  write('index.html', 'base\n');
  const base = commit();
  git('checkout', '-b', 'feature');
  const scope = (baseSha, headSha) => routineCiScope({ eventName: 'pull_request', repo,
    event: { pull_request: { base: { ref: 'main', sha: baseSha }, head: { sha: headSha } } } });
  return { repo, git, write, commit, base, scope };
}

test('a stale snapshot does not gate a site PR; advanced main and merge checkout do not contaminate its scope', t => {
  const f = fixture(t);
  f.write('index.html', 'site change\n');
  const head = f.commit();
  f.git('checkout', 'main');
  f.write('data/routine-runs.json', '{"observed_at":"2001-01-01T00:00:00Z"}\n');
  const advancedBase = f.commit();
  f.git('merge', '--no-ff', 'feature', '-m', 'merge fixture');
  assert.notEqual(f.git('rev-parse', 'HEAD'), head);
  assert.equal(f.scope(advancedBase, head).required, false);
  assert.equal(f.scope(advancedBase, head).changedCount, 1);
});

test('changing, deleting or moving operational data remains required', t => {
  const f = fixture(t);
  f.write('data/routine-runs.json', '{"observed_at":"2002-01-01T00:00:00Z"}\n');
  assert.equal(f.scope(f.base, f.commit()).required, true);
  f.git('mv', 'data/routine-runs.json', 'moved.json');
  assert.equal(f.scope(f.base, f.commit()).required, true);
  f.git('rm', 'moved.json');
  assert.equal(f.scope(f.base, f.commit()).required, true);
});

test('large complete inventories do not lose a late operational path', t => {
  const f = fixture(t);
  for (let i = 0; i < 3100; i++) f.write('pages/' + i + '.html', 'page\n');
  f.write('scripts/routine-observer.mjs', 'changed\n');
  const result = f.scope(f.base, f.commit());
  assert.equal(result.required, true);
  assert.equal(result.changedCount, 3101);
});

test('incomplete PR identity and missing Git objects fail closed', t => {
  const f = fixture(t);
  for (const event of [{}, { pull_request: {} },
    { pull_request: { base: { ref: 'other', sha: f.base }, head: { sha: f.base } } },
    { pull_request: { base: { ref: 'main', sha: f.base }, head: { sha: '--help' } } }]) {
    assert.throws(() => routineCiScope({ eventName: 'pull_request', event, repo: f.repo }));
  }
  assert.throws(() => f.scope('a'.repeat(40), f.base));
});

test('workflow keeps site and regression checks mandatory while health is independent and visibly failing', () => {
  const workflow = fs.readFileSync('.github/workflows/seo-check.yml', 'utf8');
  const split = workflow.split('\n  routine-health:\n');
  assert.equal(split.length, 2);
  const [site, health] = split;
  assert.match(site, /run: node --test scripts\/routine-ci-scope.test.mjs/);
  assert.match(site, /id: routine_scope[\s\S]*routineCiScope\(\{ eventName: context.eventName, event: context.payload \}\)/);
  for (const name of ['Required Claude routine observation', 'Required Codex routine observation']) {
    const block = site.split('- name: ' + name + '\n')[1].split('\n      - ')[0];
    assert.match(block, /if: .*github.event_name == 'pull_request' && steps.routine_scope.outputs.required == 'true'/);
    assert.doesNotMatch(block, /continue-on-error/);
  }
  assert.match(health, /^    if: always\(\) && github.event_name != 'pull_request'/);
  assert.doesNotMatch(health, /needs:|continue-on-error|\|\|\s*true/);
  for (const source of ['Claude', 'Codex']) {
    const block = health.split('- name: ' + source + ' observation health\n')[1].split('\n      - ')[0];
    assert.match(block, /if: always\(\) && github.event_name != 'pull_request'/);
    assert.match(block, /--check/);
  }
  assert.match(health, /name: Record actual observation health outcomes\n        if: always\(\)/);
  assert.match(health, /steps.claude_health.outcome/);
  assert.match(health, /steps.codex_health.outcome/);
  const daily = fs.readFileSync('.github/workflows/main-daily-validation.yml', 'utf8');
  assert.match(daily, /schedule:/);
  assert.match(daily, /uses: \.\/\.github\/workflows\/seo-check.yml/);
});

test('preflight retains all routine selftests and reports conditional real observations instead of running them silently', () => {
  const text = fs.readFileSync('.github/workflows/seo-check.yml', 'utf8');
  const commands = extractCommands(text);
  const scripts = ['scripts/check-routine-runs.mjs', 'scripts/routine-observer.mjs',
    'scripts/routine-observer-local.py', 'scripts/codex-routine-observer.py'];
  for (const script of scripts) {
    assert.ok(commands.some(c => c.script === script && c.args.includes('--selftest')), script);
    assert.ok(gatingChecks().includes(script), script);
  }
  for (const script of ['scripts/check-routine-runs.mjs', 'scripts/codex-routine-observer.py']) {
    assert.ok(!commands.some(c => c.script === script && c.args.includes('--check')), script);
    assert.ok(auditExtraction(text).dropped.conditional.some(line => line.includes(script + ' --check')), script);
  }
  assert.ok(commands.some(c => c.script === '--test' && c.args.includes('scripts/routine-ci-scope.test.mjs')));
});

// --- 2026-10-19 proposal, owner-approved 2026-10-26: ledger freshness scope ---
// Autopilot run ledger freshness reuses the routine operations scope. Waiting
// progress freshness has its own inputs. Integrity checks stay on every PR.

const WAITING_INPUTS = ['data/waiting-progress.json', 'data/revenue-series.json', 'data/financial-policy.json',
  'growth/scripts/revenue-series.mjs', 'growth/REVENUE_OBSERVATIONS.md', 'scripts/check-waiting-progress.mjs'];

test('every waiting-progress input requires the waiting freshness check, alone or mixed with site files', () => {
  for (const file of WAITING_INPUTS) {
    assert.equal(routineScopeForPaths([file]).waitingRequired, true, file);
    assert.equal(routineScopeForPaths(['index.html', file]).waitingRequired, true, file);
    assert.equal(routineScopeForPaths(['index.html', file]).waitingCount, 1, file);
  }
  assert.equal(routineScopeForPaths([]).waitingRequired, false);
  const ingest = 'growth/data/gsc/2026-10-12/summary.json';
  assert.equal(routineScopeForPaths([ingest], { deletedPaths: [] }).waitingRequired, false,
    'adding a weekly GSC snapshot is not gated on the hand-synced revenue mirror');
  assert.equal(routineScopeForPaths([ingest], { deletedPaths: [ingest] }).waitingRequired, true,
    'deleting a GSC snapshot can move the newest date back, so it is a waiting input');
  assert.equal(routineScopeForPaths([ingest], { deletedPaths: [ingest] }).waitingDeletionCount, 1);
  assert.equal(routineScopeForPaths(['index.html', ingest], { deletedPaths: [] }).waitingRequired, false);
  assert.equal(routineScopeForPaths([ingest]).waitingRequired, true,
    'without a deletion inventory a GSC change may be a deletion: fail closed');
});

test('a missing, invalid or inconsistent deletion inventory cannot narrow the waiting scope', () => {
  const ingest = 'growth/data/gsc/2026-10-12/summary.json';
  for (const deletedPaths of [null, {}, 'growth/data/gsc', [''], [null], ['/tmp/x'], ['growth/data/gsc/../x'], ['x\0y']]) {
    assert.throws(() => routineScopeForPaths([ingest], { deletedPaths }), String(deletedPaths));
  }
  assert.throws(() => routineScopeForPaths(['index.html'], { deletedPaths: [ingest] }),
    /Inconsistent deleted-path inventory/, 'a deletion outside the changed paths is not a complete inventory');
  assert.throws(() => routineScopeForPaths([ingest], null));
  // Deletions elsewhere only matter through the explicit lists, as before.
  assert.equal(routineScopeForPaths(['index.html'], { deletedPaths: ['index.html'] }).waitingRequired, false);
  assert.equal(routineScopeForPaths(['data/revenue-series.json'],
    { deletedPaths: ['data/revenue-series.json'] }).waitingRequired, true);
});

test('routine and waiting scopes are independent', () => {
  for (const file of ['data/routine-runs.json', 'scripts/routine-observer-local.py', 'data/autopilot-runs.json']) {
    assert.equal(routineScopeForPaths([file]).required, true, file);
    assert.equal(routineScopeForPaths([file]).waitingRequired, false, file);
  }
  for (const file of ['data/revenue-series.json', 'data/financial-policy.json', 'data/waiting-progress.json']) {
    assert.equal(routineScopeForPaths([file]).required, false, file);
    assert.equal(routineScopeForPaths([file]).waitingRequired, true, file);
  }
});

test('a checker cannot exempt its own change from its freshness gate', () => {
  assert.equal(routineScopeForPaths(['scripts/autopilot-runs.mjs']).required, true);
  assert.equal(routineScopeForPaths(['scripts/check-waiting-progress.mjs']).waitingRequired, true);
});

// A new wait must be classified on purpose. Its counter file is in scope; a dated
// directory is only allowed on the explicit, documented append-only list, where
// additions are not gated and every deletion is.
const APPEND_ONLY_WAIT_DIRS = ['growth/data/gsc'];

test('every counter the waiting ledger reads is in scope or an append-only directory whose deletions are', () => {
  const ledger = JSON.parse(fs.readFileSync('data/waiting-progress.json', 'utf8'));
  assert.ok(Array.isArray(ledger.waits) && ledger.waits.length > 0, 'the real waiting ledger has waits');
  for (const wait of ledger.waits) {
    if (wait.dir) {
      assert.ok(APPEND_ONLY_WAIT_DIRS.includes(wait.dir), wait.id + ': unclassified directory wait ' + wait.dir);
      const file = wait.dir + '/2099-01-01/meta.json';
      assert.equal(routineScopeForPaths([file], { deletedPaths: [] }).waitingRequired, false, wait.dir);
      assert.equal(routineScopeForPaths([file], { deletedPaths: [file] }).waitingRequired, true, wait.dir);
    } else {
      assert.equal(typeof wait.file, 'string', wait.id);
      assert.equal(routineScopeForPaths([wait.file]).waitingRequired, true, wait.id + ': ' + wait.file);
    }
  }
});

/** Steps of one job, split the same way check-selftests and preflight split them. */
function jobSteps(jobText) {
  return jobText.split(/\n(?=      - )/).slice(1).map(block => ({
    name: (block.match(/^      - name: (.*)$/m) || [null, ''])[1],
    cond: (block.match(/^        if: (.*)$/m) || [null, null])[1],
    block,
  }));
}

function workflowJobs() {
  const workflow = fs.readFileSync('.github/workflows/seo-check.yml', 'utf8');
  const [site, health] = workflow.split('\n  routine-health:\n');
  return { workflow, site, health };
}

test('every scope-gated step runs only checkers that are themselves in that scope', () => {
  const { site } = workflowJobs();
  const gates = [
    ["steps.routine_scope.outputs.required == 'true'", file => routineScopeForPaths([file]).required],
    ["steps.routine_scope.outputs.waiting_required == 'true'", file => routineScopeForPaths([file]).waitingRequired],
    ["steps.routine_scope.outputs.page_required == 'true'", file => routineScopeForPaths([file]).pageRequired],
  ];
  let gated = 0;
  for (const step of jobSteps(site)) {
    for (const [condition, inScope] of gates) {
      if (!String(step.cond).includes(condition)) continue;
      gated += 1;
      const scripts = [...step.block.matchAll(/(?:node|python3)\s+((?:growth\/)?scripts\/[\w.-]+\.(?:m?js|py))/g)].map(m => m[1]);
      assert.ok(scripts.length > 0, step.name);
      for (const file of scripts) assert.equal(inScope(file), true, step.name + ': ' + file);
    }
  }
  assert.equal(gated, 5, 'Claude, Codex, autopilot run ledger, waiting progress and autopilot page freshness steps');
});

test('ledger freshness steps: integrity on every PR, full check only when in scope, health stays independent', () => {
  const { workflow, site, health } = workflowJobs();
  const siteSteps = jobSteps(site);
  const step = name => {
    const found = siteSteps.filter(s => s.name === name);
    assert.equal(found.length, 1, name);
    return found[0];
  };
  for (const [name, script] of [
    ['Autopilot run ledger（＋日報データ源との突き合わせ）', 'scripts/autopilot-runs.mjs'],
    ['Waiting progress (待ちが進んでいるか)', 'scripts/check-waiting-progress.mjs']]) {
    const integrity = step(name);
    assert.equal(integrity.cond, null, name);
    assert.doesNotMatch(integrity.block, /continue-on-error/);
    assert.match(integrity.block, new RegExp('^          node ' + script + ' --selftest$', 'm'));
    assert.match(integrity.block, new RegExp('^          node ' + script + ' --integrity$', 'm'));
    assert.doesNotMatch(integrity.block, new RegExp(script + ' --check'));
  }
  for (const [name, condition, command] of [
    ['Required autopilot run ledger freshness', "steps.routine_scope.outputs.required == 'true'", 'node scripts/autopilot-runs.mjs --check'],
    ['Required waiting progress freshness', "steps.routine_scope.outputs.waiting_required == 'true'", 'node scripts/check-waiting-progress.mjs --check'],
    ['Required autopilot page freshness', "steps.routine_scope.outputs.page_required == 'true'", 'node scripts/check-autopilot-page.mjs --check']]) {
    const gated = step(name);
    assert.equal(gated.cond, "github.event_name == 'pull_request' && " + condition, name);
    assert.doesNotMatch(gated.block, /continue-on-error|\|\|\s*true/);
    assert.match(gated.block, new RegExp('^        run: ' + command.replace(/[.]/g, '\\.') + '\\n?$', 'm'));
  }
  // The scope outputs are exact strings of the helper's booleans.
  assert.match(site, /core\.setOutput\('required', String\(scope\.required\)\);/);
  assert.match(site, /core\.setOutput\('waiting_required', String\(scope\.waitingRequired\)\);/);
  assert.match(site, /core\.setOutput\('page_required', String\(scope\.pageRequired\)\);/);
  // The page step compares at the page's stamped date on every PR; it never drops the comparison.
  const page = step('Autopilot page vs ledger');
  assert.equal(page.cond, null);
  assert.match(page.block, /^          node scripts\/check-autopilot-page\.mjs --selftest$/m);
  assert.match(page.block, /^          node scripts\/check-autopilot-page\.mjs --as-stamped$/m);
  assert.doesNotMatch(page.block, /check-autopilot-page\.mjs --check/);

  const healthSteps = jobSteps(health);
  for (const [name, id, command] of [
    ['Autopilot run ledger health', 'autopilot_runs_health', 'node scripts/autopilot-runs.mjs --check'],
    ['Waiting progress health', 'waiting_progress_health', 'node scripts/check-waiting-progress.mjs --check'],
    ['Autopilot page freshness health', 'autopilot_page_health', 'node scripts/check-autopilot-page.mjs --check']]) {
    const found = healthSteps.filter(s => s.name === name);
    assert.equal(found.length, 1, name);
    assert.equal(found[0].cond, "always() && github.event_name != 'pull_request'", name);
    assert.match(found[0].block, new RegExp('^        id: ' + id + '$', 'm'));
    assert.match(found[0].block, new RegExp('^        run: ' + command.replace(/[.]/g, '\\.') + '\\n?$', 'm'));
    assert.match(health, new RegExp('steps\\.' + id + '\\.outcome'));
  }
  assert.doesNotMatch(health, /needs:|continue-on-error|\|\|\s*true/);

  // check-authority matches required commands as substrings of the whole file.
  // The literal must only occur as real run lines, never in comments or summary text.
  for (const command of ['node scripts/autopilot-runs.mjs --check', 'node scripts/check-waiting-progress.mjs --check',
    'node scripts/check-autopilot-page.mjs --check']) {
    const lines = workflow.split('\n').filter(line => line.includes(command));
    assert.equal(lines.length, 2, command);
    for (const line of lines) assert.equal(line.trim(), 'run: ' + command, command);
    assert.equal(site.split('\n').filter(line => line.trim() === 'run: ' + command).length, 1, command);
    assert.equal(health.split('\n').filter(line => line.trim() === 'run: ' + command).length, 1, command);
  }
  const extended = workflow.split('\n').filter(line => /(?:autopilot-runs|check-waiting-progress|check-autopilot-page)\.mjs --check[\w-]/.test(line));
  assert.deepEqual(extended, [], 'no flag of these checkers may extend --check and satisfy the substring guard');
});

/**
 * Execute the real routine_scope github-script body with stub core/context/process.
 * Outputs are recorded into the caller's object so a rejected run still shows them.
 */
function githubScriptBody(stepLine) {
  const { workflow } = workflowJobs();
  const lines = workflow.split('\n');
  const at = lines.findIndex(line => line.trim() === stepLine);
  const start = lines.findIndex((line, i) => i > at && line.trim() === 'script: |');
  assert.ok(at > 0 && start > at, stepLine);
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() !== '' && !lines[i].startsWith('            ')) break;
    body.push(lines[i].slice(12));
  }
  return body.join('\n');
}

async function runGithubScript(stepLine, { context = {}, env = {}, outputs = {} } = {}) {
  const texts = [];
  const tables = [];
  const summary = {
    addHeading() { return summary; },
    addRaw(text) { texts.push(text); return summary; },
    addTable(rows) { tables.push(rows); return summary; },
    addCodeBlock() { return summary; },
    async write() { return summary; },
  };
  const core = { setOutput(name, value) { outputs[name] = value; }, summary };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const script = new AsyncFunction('core', 'context', 'process', githubScriptBody(stepLine));
  await script(core, context, { env });
  return { outputs, text: texts.join(''), tables };
}

async function runScopeScript(eventName, payload, outputs = {}) {
  return runGithubScript('id: routine_scope',
    { context: { eventName, payload }, env: { GITHUB_WORKSPACE: process.cwd() }, outputs });
}

test('the main/daily health summary records each actual outcome and does not classify failures', async () => {
  const { health } = workflowJobs();
  for (const [name, id] of [['CLAUDE_OUTCOME', 'claude_health'], ['CODEX_OUTCOME', 'codex_health'],
    ['AUTOPILOT_RUNS_OUTCOME', 'autopilot_runs_health'], ['WAITING_PROGRESS_OUTCOME', 'waiting_progress_health'],
    ['AUTOPILOT_PAGE_OUTCOME', 'autopilot_page_health']]) {
    assert.match(health, new RegExp('^          ' + name + ': \\$\\{\\{ steps\\.' + id + '\\.outcome \\}\\}$', 'm'), name);
  }
  const { tables, text } = await runGithubScript('- name: Record actual observation health outcomes', { env: {
    CLAUDE_OUTCOME: 'success', CODEX_OUTCOME: 'failure', AUTOPILOT_RUNS_OUTCOME: 'failure', WAITING_PROGRESS_OUTCOME: '',
    AUTOPILOT_PAGE_OUTCOME: 'failure' } });
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].slice(1), [['Claude snapshot', 'success'], ['Codex snapshot', 'failure'],
    ['Autopilot run ledger', 'failure'], ['Waiting progress', 'not run'], ['Autopilot page vs ledger', 'failure']]);
  assert.match(text, /Failure remains a failed job\/workflow/);
  assert.match(text, /failure is not automatically classified as staleness/);
});

test('the real workflow scope script fails closed and never emits a scope for incomplete PR payloads', async () => {
  const sha = 'a'.repeat(40);
  for (const payload of [{}, { pull_request: {} },
    { pull_request: { base: { ref: 'other', sha }, head: { sha } } },
    { pull_request: { base: { ref: 'main', sha }, head: { sha: '--help' } } }]) {
    const outputs = {};
    await assert.rejects(runScopeScript('pull_request', payload, outputs), /Cannot determine complete PR scope/);
    assert.deepEqual(outputs, {}, 'no scope output may exist after a fail-closed rejection');
  }
  // A missing payload, and well-formed SHAs whose objects are absent, also fail closed.
  for (const payload of [undefined,
    { pull_request: { base: { ref: 'main', sha: 'b'.repeat(40) }, head: { sha: 'c'.repeat(40) } } }]) {
    const outputs = {};
    await assert.rejects(runScopeScript('pull_request', payload, outputs));
    assert.deepEqual(outputs, {}, 'no scope output may exist after a fail-closed rejection');
  }
  for (const eventName of ['push', 'schedule', 'workflow_call']) {
    const { outputs, text } = await runScopeScript(eventName, {});
    assert.deepEqual(outputs, { required: 'true', waiting_required: 'true', page_required: 'true' });
    assert.match(text, /routine-health/);
  }
  // A PR whose base and head are the same commit changes nothing: both freshness
  // gates are out of scope, and the summary says so instead of claiming health.
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const { outputs, text } = await runScopeScript('pull_request',
    { pull_request: { base: { ref: 'main', sha: head }, head: { sha: head } } });
  assert.deepEqual(outputs, { required: 'false', waiting_required: 'false', page_required: 'false' });
  assert.match(text, /Page freshness is not assessed/);
  assert.match(text, /autopilot run ledger freshness are not assessed/);
  assert.match(text, /Waiting progress freshness is not assessed/);
  assert.match(text, /this is not a healthy observation/);
  assert.doesNotMatch(text, /node scripts\//);
});

test('changing, deleting or moving a waiting input remains required; advanced main does not contaminate a site PR', t => {
  for (const file of ['data/revenue-series.json', 'data/waiting-progress.json']) {
    const f = fixture(t);
    f.write(file, '{"changed":true}\n');
    const edited = f.scope(f.base, f.commit());
    assert.equal(edited.waitingRequired, true, file);
    assert.equal(edited.required, false, file);
    f.git('mv', file, 'moved.json');
    assert.equal(f.scope(f.base, f.commit()).waitingRequired, true, file);
    f.git('rm', 'moved.json');
    assert.equal(f.scope(f.base, f.commit()).waitingRequired, true, file);
  }
  const f = fixture(t);
  f.write('index.html', 'site change\n');
  const head = f.commit();
  f.git('checkout', 'main');
  f.write('data/revenue-series.json', '{"source_generated_at":"2001-01-01T00:00:00Z"}\n');
  const advancedBase = f.commit();
  const result = f.scope(advancedBase, head);
  assert.equal(result.waitingRequired, false);
  assert.equal(result.required, false);
  assert.equal(result.changedCount, 1);
});

test('adding a GSC date directory is not gated; deleting or renaming one is', t => {
  const f = fixture(t);
  f.write('growth/data/gsc/2026-10-12/summary.json', '{}\n');
  f.write('growth/data/gsc/2026-10-21/summary.json', '{}\n');
  f.write('growth/data/gsc/2026-10-21/meta.json', '{}\n');
  const base = f.commit();
  const fromBase = () => f.scope(base, f.commit());

  f.write('growth/data/gsc/2026-10-28/summary.json', '{}\n');
  const added = fromBase();
  assert.equal(added.waitingRequired, false, 'a weekly ingest only adds a newer date');
  assert.equal(added.waitingDeletionCount, 0);
  f.git('reset', '-q', '--hard', base);

  f.write('growth/data/gsc/2026-10-21/summary.json', '{"edited":true}\n');
  assert.equal(fromBase().waitingRequired, false, 'editing inside a date directory does not move the newest date');
  f.git('reset', '-q', '--hard', base);

  f.git('rm', '-q', '-r', 'growth/data/gsc/2026-10-21');
  const reverted = fromBase();
  assert.equal(reverted.waitingRequired, true, 'reverting the latest ingest moves the newest date back');
  assert.equal(reverted.waitingDeletionCount, 2);
  assert.equal(reverted.required, false);
  f.git('reset', '-q', '--hard', base);

  f.git('mv', 'growth/data/gsc/2026-10-21', 'growth/data/gsc/2026-10-11');
  const renamed = fromBase();
  assert.equal(renamed.waitingRequired, true, 'a rename is a deletion of the old date under --no-renames');
  assert.equal(renamed.waitingDeletionCount, 2);
  f.git('reset', '-q', '--hard', base);

  f.git('rm', '-q', 'growth/data/gsc/2026-10-12/summary.json');
  f.write('index.html', 'site change\n');
  assert.equal(fromBase().waitingRequired, true, 'any deletion under the directory is gated, conservatively');
});

test('preflight runs both integrity forms and reports both full freshness checks as conditional', () => {
  const text = fs.readFileSync('.github/workflows/seo-check.yml', 'utf8');
  const commands = extractCommands(text);
  const conditional = auditExtraction(text).dropped.conditional;
  for (const script of ['scripts/autopilot-runs.mjs', 'scripts/check-waiting-progress.mjs']) {
    assert.ok(commands.some(c => c.script === script && c.args.join(' ') === '--integrity'), script);
    assert.ok(commands.some(c => c.script === script && c.args.join(' ') === '--selftest'), script);
    assert.ok(!commands.some(c => c.script === script && c.args.includes('--check')), script);
    assert.ok(conditional.includes('node ' + script + ' --check'), script);
    assert.ok(gatingChecks().includes(script), script);
  }
  // The page check (2026-10-27 proposal): preflight runs the stamped-date comparison and
  // reports the today's-value check as conditional, like the two ledgers above.
  const page = 'scripts/check-autopilot-page.mjs';
  assert.ok(commands.some(c => c.script === page && c.args.join(' ') === '--as-stamped'), page);
  assert.ok(commands.some(c => c.script === page && c.args.join(' ') === '--selftest'), page);
  assert.ok(!commands.some(c => c.script === page && c.args.includes('--check')), page);
  assert.ok(conditional.includes('node ' + page + ' --check'), page);
  assert.ok(gatingChecks().includes(page), page);
});

// --- CLI behaviour under simulated staleness (temporary copies; real ledgers are never written) ---

// The CLIs only run when argv[1] is their real path, so temporary copies use the
// resolved directory (macOS /var is a symlink). Passing runs must print the
// verdict: an exit 0 from a CLI that silently did nothing would prove nothing.
function tempRoot(t, prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function cli(dir, script, ...args) {
  const result = spawnSync(process.execPath, [path.join(dir, script), ...args],
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status === 0) {
    assert.match(result.stdout, /問題なし|未解消の取得停止はありません/, script + ' ' + args.join(' '));
    // An integrity-only pass must say that freshness was not judged, never that it is healthy.
    if (args.includes('--integrity') && !args.includes('--check')) {
      assert.match(result.stdout, /判定していない — 健全とは言わない/, script + ' ' + args.join(' '));
    }
  }
  return result.status;
}

/** The script and its static relative imports, so the temporary copy runs the real code. */
function withLocalImports(entry) {
  const seen = new Set();
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^import\s[^;]*?\sfrom\s+'(\.{1,2}\/[^']+)';/gm)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
  };
  visit(entry);
  return [...seen];
}

function copyInto(dir, files) {
  for (const file of files) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file, target);
  }
}

test('autopilot run ledger: --integrity ignores only staleness; shape and status agreement still fail', t => {
  const dir = tempRoot(t, 'autopilot-runs-integrity-');
  const copied = withLocalImports('scripts/autopilot-runs.mjs');
  assert.ok(copied.includes('scripts/lib/read-ledger.mjs'), 'the import walk found the ledger reader');
  copyInto(dir, copied);
  const save = (date, { status = null, row = {} } = {}) => {
    const doc = { runs: [{ run_id: 'fixture-' + date, date_jst: date, route: 'owner-session', attempted: true,
      outcome: 'shipped', pr: 1, artifact: '/fixture/', source: 'session', interventions: [], ...row }] };
    fs.writeFileSync(path.join(dir, 'data/autopilot-runs.json'), JSON.stringify(doc));
    const agreeing = { date_jst: date, article: { url: '/fixture/' }, runs: runsFacts(doc) };
    fs.writeFileSync(path.join(dir, 'data/autopilot-status.json'), JSON.stringify(status ?? agreeing));
  };
  fs.mkdirSync(path.join(dir, 'data'));
  const script = 'scripts/autopilot-runs.mjs';

  save('2000-01-03');
  assert.equal(cli(dir, script, '--check'), 1, 'stale ledger fails the full check');
  assert.equal(cli(dir, script, '--integrity'), 0, 'stale but agreeing ledger passes integrity');
  assert.equal(cli(dir, script, '--integrity', '--check'), 1, 'both flags: the stricter check wins');

  save('2000-01-03', { status: { date_jst: '2000-01-02', article: null } });
  assert.equal(cli(dir, script, '--integrity'), 1, 'status disagreement fails integrity');
  save('2000-01-03', { row: { source: undefined } });
  assert.equal(cli(dir, script, '--integrity'), 1, 'malformed row fails integrity');
  fs.writeFileSync(path.join(dir, 'data/autopilot-cost.json'), '{broken');
  save('2000-01-03');
  assert.equal(cli(dir, script, '--integrity'), 1, 'unreadable cost ledger fails integrity');
  fs.rmSync(path.join(dir, 'data/autopilot-cost.json'));

  save(todayJst());
  assert.equal(cli(dir, script, '--check'), 0, 'fresh agreeing ledger passes the full check');
  assert.equal(cli(dir, script, '--integrity'), 0, 'fresh agreeing ledger passes integrity');
});

test('waiting progress: --integrity ignores only stalls; configuration and readability still fail', t => {
  const dir = tempRoot(t, 'waiting-progress-integrity-');
  copyInto(dir, withLocalImports('scripts/check-waiting-progress.mjs'));
  fs.mkdirSync(path.join(dir, 'data'));
  const wait = { id: 'fixture', label: 'fixture', file: 'data/series.json', progress_field: 'covered_days',
    target_field: 'days_for_monthly', freshness_field: 'source_generated_at', freshness_format: 'utc_timestamp',
    progress_kind: 'rolling_coverage', stale_budget_days: 4 };
  const save = (generatedAt, extra = {}) => {
    fs.writeFileSync(path.join(dir, 'data/waiting-progress.json'), JSON.stringify({ waits: [{ ...wait, ...extra }] }));
    fs.writeFileSync(path.join(dir, 'data/series.json'),
      JSON.stringify({ covered_days: 10, days_for_monthly: 28, source_generated_at: generatedAt }));
  };
  const script = 'scripts/check-waiting-progress.mjs';
  const old = '2000-01-01T00:00:00Z';

  save(old);
  assert.equal(cli(dir, script, '--check'), 1, 'unacknowledged stall fails the full check');
  assert.equal(cli(dir, script, '--integrity'), 0, 'unacknowledged stall is not an integrity failure');
  assert.equal(cli(dir, script, '--integrity', '--check'), 1, 'both flags: the stricter check wins');
  save(old, { acknowledged_stall: { since: '2000-01-01', why: 'fixture', review_by: '2000-01-10' } });
  assert.equal(cli(dir, script, '--check'), 1, 'expired acknowledgement fails the full check');
  assert.equal(cli(dir, script, '--integrity'), 0, 'expired acknowledgement is not an integrity failure');

  save(old, { stale_budget_days: undefined });
  assert.equal(cli(dir, script, '--check'), 1, 'missing budget fails the full check');
  assert.equal(cli(dir, script, '--integrity'), 1, 'missing budget fails integrity');
  save(old, { file: 'data/missing.json' });
  assert.equal(cli(dir, script, '--check'), 1, 'missing counter file fails the full check');
  assert.equal(cli(dir, script, '--integrity'), 1, 'missing counter file fails integrity');

  save(new Date(Date.now() - 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  assert.equal(cli(dir, script, '--check'), 0, 'moving counter passes the full check');
  assert.equal(cli(dir, script, '--integrity'), 0, 'moving counter passes integrity');
});

test('autopilot page freshness: required for operations and for the stamped page, checker, score and publisher only', () => {
  for (const file of ['autopilot/index.html', 'scripts/check-autopilot-page.mjs', 'scripts/autonomy-score.mjs',
    'scripts/decision-monitor.mjs']) {
    const scope = routineScopeForPaths([file]);
    assert.equal(scope.pageRequired, true, file);
    assert.equal(scope.pageCount, 1, file);
  }
  // The daily Act PR changes the run ledger and regenerates the page: it owns page freshness.
  const act = routineScopeForPaths(['data/autopilot-runs.json']);
  assert.equal(act.pageRequired, true);
  assert.equal(act.pageCount, 0);
  // A site-only change, the homepage, a translated copy the checker does not read, and a waiting input do not.
  for (const file of ['blog/obsidian-iphone-memo/index.html', 'index.html', 'ar/autopilot/index.html',
    'data/revenue-series.json']) {
    assert.equal(routineScopeForPaths([file]).pageRequired, false, file);
  }
  // Non-PR contexts always run the full page check in routine-health.
  assert.equal(routineCiScope({ eventName: 'push' }).pageRequired, true);
});

test('autopilot page freshness: every compared file is in scope, or the checker refuses a clock-driven number on it', () => {
  const rel = file => path.relative(process.cwd(), file);
  // The page that carries the score and its stamp is in scope.
  assert.equal(rel(PAGE_PATH), 'autopilot/index.html');
  assert.equal(routineScopeForPaths([rel(PAGE_PATH)]).pageRequired, true);
  // The checker must list the files it compares where this test can read them.
  const checker = fs.readFileSync('scripts/check-autopilot-page.mjs', 'utf8');
  const listed = [...checker.matchAll(/path\.join\(ROOT, '([^']+)'\)/g)].map(m => m[1]).filter(f => /\.(?:html|md)$/.test(f));
  assert.deepEqual(listed.sort(), [rel(PAGE_PATH), ...EXTRA_PATHS.map(rel)].sort());
  const score = { total: 1.0, components: Object.fromEntries(['vdc', 'umr', 'ra', 'ep', 'tuc'].map(id => [id, { points: 0, max: 1 }])) };
  for (const file of EXTRA_PATHS.map(rel)) {
    if (routineScopeForPaths([file]).pageRequired) continue;
    // Out of scope: today it carries no score or stamp, and the checker rejects one there in both modes.
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /data-score-total|data-score="|data-decision-date/, file);
    for (const mode of ['as-stamped', 'check']) {
      for (const marker of ['<span data-score-total>1.0</span>', '<span data-decision-date>2026-10-27</span>',
        '<tr data-score="vdc"><td>x</td><td class="num"><b>0.0</b></td><td class="num">1</td></tr>']) {
        const r = checkPages({ mode, today: '2026-10-27', baseLive: {}, scoreAt: () => score,
          pages: [{ label: file, text: marker, allowed: file.endsWith('.md'), primary: false }] });
        assert.ok(r.problems.some(p => p.startsWith(file + ': ') && p.includes('にだけ置ける')), file + ' ' + mode + ' ' + marker);
      }
    }
  }
});

// The real CLI on a temporary copy: which date the score is computed for is decided
// in checkPages(), but main() supplies the date-to-score function and the mode. A
// selftest cannot see a main() that ignores the requested date or the mode; this does.
test('autopilot page: the real CLI compares at the page stamp with --as-stamped and at today with --check', async t => {
  const dir = tempRoot(t, 'autopilot-page-as-stamped-');
  const copied = withLocalImports('scripts/check-autopilot-page.mjs');
  assert.ok(copied.includes('scripts/autonomy-score.mjs'), 'the import walk found the score module');
  copyInto(dir, copied);
  // Owner-owned scoring policy and the coverage ledger are copied read-only; runs are a fixture.
  copyInto(dir, ['data/autonomy-score.json', 'data/escalation-rules.json', 'data/automation-coverage.json']);
  const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const today = todayJst();
  const stamp = shift(today, -3);
  const runs = [];
  for (let n = -40; n <= -3; n += 1) {
    const date = shift(today, n);
    runs.push({ run_id: 'fixture-' + date, date_jst: date, route: 'owner-session', attempted: true,
      outcome: n % 5 === 0 ? 'no_run' : 'shipped', failure_stage: n % 5 === 0 ? 'absent' : undefined,
      lane: 'A', pr: 1, artifact: '/fixture/', source: 'session', interventions: [] });
  }
  const json = (file, doc) => fs.writeFileSync(path.join(dir, file), JSON.stringify(doc));
  json('data/autopilot-runs.json', { runs });
  json('data/check-selftests.json', { checks: [] });
  json('data/autopilot-actions.json', { actions: [] });
  const { score, loadContext } = await import(pathToFileURL(path.join(dir, 'scripts/autonomy-score.mjs')).href);
  const { renderReport } = await import('./decision-monitor.mjs');
  const at = day => score(loadContext({ today: day }));
  const shown = s => [s.total, ...Object.values(s.components).map(c => c.points)].map(x => x.toFixed(1)).join();
  assert.notEqual(shown(at(stamp)), shown(at(today)), 'the fixture score moves with the clock');
  const template = '<p><span data-decision-date>-</span>時点</p><b>自律スコアは<span data-score-total>0.0</span>点</b><table>'
    + Object.entries(at(today).components).map(([id, c]) =>
      `<tr data-score="${id}"><td>${id}</td><td class="num"><b>0.0</b></td><td class="num">${c.max}</td><td>old</td></tr>`).join('')
    + '</table>';
  fs.mkdirSync(path.join(dir, 'autopilot'));
  const save = html => fs.writeFileSync(path.join(dir, 'autopilot/index.html'), html);
  const stale = renderReport(template, at(stamp), {});
  const fresh = renderReport(template, at(today), {});
  assert.equal([...stale.matchAll(new RegExp('data-decision-date>' + stamp + '<', 'g'))].length, 1, 'the publisher wrote the stamp');
  // Moves the CLI's clock (Date and Date.now) by whole days, like the manual clock-shift proof.
  const shiftModule = path.join(dir, 'shift-clock.mjs');
  fs.writeFileSync(shiftModule, 'const RealDate = Date; const offset = Number(process.env.SHIFT_DAYS) * 864e5;\n'
    + 'class ShiftedDate extends RealDate { constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }'
    + ' static now() { return RealDate.now() + offset; } }\nglobalThis.Date = ShiftedDate;\n');
  const run = (args, days = 0) => {
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(shiftModule).href,
      path.join(dir, 'scripts/check-autopilot-page.mjs'), ...args],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, SHIFT_DAYS: String(days) }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0) {
      // An exit 0 without the verdict would prove nothing.
      assert.match(result.stdout, args.includes('--check') ? /公開ページの数字は台帳の現在値と一致。/
        : /公開ページの数字は、計算日 \d{4}-\d{2}-\d{2} の台帳の値と一致（鮮度は判定していない）。/, args.join(' '));
    }
    return result;
  };

  save(stale);
  for (const days of [0, 1, 2, 5, 30]) {
    const r = run(['--as-stamped'], days);
    assert.equal(r.status, 0, 'a stale but correct page passes --as-stamped at +' + days + ' days: ' + r.stderr);
    assert.match(r.stdout, new RegExp('計算日 ' + stamp + ' の台帳の値と一致'));
  }
  assert.equal(run(['--check']).status, 1, 'the same stale page fails --check (today\'s score)');
  assert.equal(run(['--as-stamped', '--check']).status, 1, 'both flags: the stricter check wins');
  save(stale.replace(/(<tr data-score="umr">.*?<b>)([\d.]+)(<\/b>)/, (_, a, x, b) => a + (Number(x) + 0.1).toFixed(1) + b));
  assert.equal(run(['--as-stamped']).status, 1, 'one score cell that disagrees with the ledger at the stamp fails');
  save(stale.replaceAll('data-decision-date>' + stamp + '<', 'data-decision-date>' + today + '<'));
  assert.equal(run(['--as-stamped']).status, 1, 'the stamp moved to a date with a different score fails');

  // Broken stamps carry today's numbers, so only the stamp problem itself can fail them.
  save(fresh);
  assert.equal(run(['--as-stamped']).status, 0, 'a fresh page passes --as-stamped');
  assert.equal(run(['--check']).status, 0, 'a fresh page passes --check');
  for (const [name, html] of [
    ['missing', fresh.replace(/<p><span data-decision-date>[^<]*<\/span>時点<\/p>/, '')],
    ['garbled', fresh.replaceAll('data-decision-date>' + today + '<', 'data-decision-date>garbled<')],
    ['future', fresh.replaceAll('data-decision-date>' + today + '<', 'data-decision-date>' + shift(today, 1) + '<')],
    ['conflicting', fresh + '<p><span data-decision-date>' + stamp + '</span></p>']]) {
    save(html);
    const r = run(['--as-stamped']);
    assert.equal(r.status, 1, name + ' stamp fails --as-stamped even with today\'s numbers');
    assert.match(r.stderr, /autopilot\/index\.html: 計算日（data-decision-date）|autopilot\/index\.html: 自律スコアが出ているのに計算日/, name);
  }
});
