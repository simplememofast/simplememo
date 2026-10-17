import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { routineCiScope, routineScopeForPaths } from './lib/routine-ci-scope.mjs';
import { extractCommands, auditExtraction } from './preflight.mjs';
import { gatingChecks } from './check-selftests.mjs';

test('site assets and CI routing do not claim operational health', () => {
  for (const file of ['index.html', 'js/app-store-tracking.js', 'growth/queries/web-to-app.sql',
    '.github/workflows/seo-check.yml', 'scripts/lib/routine-ci-scope.mjs',
    'scripts/routine-ci-scope.test.mjs', 'docs/routine-ci-scope.md']) {
    assert.equal(routineScopeForPaths([file]).required, false, file);
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
