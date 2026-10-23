import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { audit, isPr2139Publication, pr7PublicationException } from './check-pr-release-ledger.mjs';
import { extractCommands } from './preflight.mjs';
import { wiredChecks, gatingChecks } from './check-selftests.mjs';

const read = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const liveConfig = read('../data/pr-release-ledger.json');
// PR2146 independently updated main's deadline while PR2139 was in CI.
// Keep that live record intact. The expired fixture retains the original
// October22 boundary so every negative exception case still exercises expiry.
const config = structuredClone(liveConfig);
config.known_unrecorded.find(e => e.id === 'pr7-dialogue-memo').resolve_by = '2026-10-22';
const annotations = read('../growth/data/annotations.json');
const experiments = read('../growth/experiments/experiments.json');
const repository = 'simplememofast/simplememo';
const sha = 'a'.repeat(40);
const pr = {
  number: 2139,
  base: { ref: 'main', repo: { full_name: repository } },
  head: { ref: 'codex/web-ci-security-local-20261022', repo: { full_name: repository } },
};
const publication = {
  repository, eventName: 'pull_request', ref: 'refs/pull/2139/merge', sha,
  event: { number: 2139, repository: { full_name: repository }, pull_request: pr },
};
const mainPublication = {
  repository, eventName: 'push', ref: 'refs/heads/main', sha,
  event: { repository: { full_name: repository }, ref: 'refs/heads/main', deleted: false, after: sha },
  associatedPullRequests: [{ ...pr, merged_at: '2026-10-23T01:00:00Z', merge_commit_sha: sha }],
};
const clone = x => structuredClone(x);
const run = (c = config, a = annotations, p = publication, today = '2026-10-23', e = experiments) => audit(c, a, e, today, p);
const expired = result => result.some(x => x.includes('置き去り'));

test('the current upstream deadline is preserved and cannot inherit the old exception', () => {
  const entry = liveConfig.known_unrecorded.find(e => e.id === 'pr7-dialogue-memo');
  assert.equal(entry.resolve_by, '2026-11-04');
  assert.ok(entry.$comment_extension_2026_10_23);
  assert.equal(pr7PublicationException(liveConfig, annotations, '2026-10-23', publication), null);
  assert.deepEqual(audit(liveConfig, annotations, experiments, '2026-10-23'), []);
  assert.equal(expired(audit(liveConfig, annotations, experiments, '2026-11-05', publication)), true);
});

test('extending the fixture deadline never expands the pinned exception', () => {
  const changed = clone(config);
  changed.known_unrecorded.find(e => e.id === 'pr7-dialogue-memo').resolve_by = '2026-10-24';
  assert.equal(pr7PublicationException(changed, annotations, '2026-10-25', publication), null);
  assert.equal(expired(run(changed, annotations, publication, '2026-10-25')), true);
});

test('owner exception allows only the existing unresolved release during PR2139 publication', () => {
  assert.deepEqual(run(), []);
  const entry = pr7PublicationException(config, annotations, '2026-10-23', publication);
  assert.equal(entry.id, 'pr7-dialogue-memo');
  assert.equal(entry.resolve_by, '2026-10-22');
  assert.equal(entry.owner_approved_web_publication_exception.historical_evaluation, 'unverified');
  assert.equal(Object.values(experiments.experiments).some(e => e.id === 'pr7-dialogue-memo'), false);
});

test('the exact ordinary merge main push is eligible', () => {
  assert.equal(isPr2139Publication(mainPublication), true);
  assert.deepEqual(run(config, annotations, mainPublication), []);
});

for (const [name, mutate] of [
  ['another PR', p => { p.event.number = p.event.pull_request.number = 2144; p.ref = 'refs/pull/2144/merge'; }],
  ['mismatched event number', p => { p.event.number = 2144; }],
  ['mismatched PR object number', p => { p.event.pull_request.number = 2144; }],
  ['another repository', p => { p.repository = 'elsewhere/simplememo'; }],
  ['another event repository', p => { p.event.repository.full_name = 'elsewhere/simplememo'; }],
  ['fork head', p => { p.event.pull_request.head.repo.full_name = 'fork/simplememo'; }],
  ['another head branch', p => { p.event.pull_request.head.ref = 'another-change'; }],
  ['another base', p => { p.event.pull_request.base.ref = 'release'; }],
  ['unrelated ref', p => { p.ref = 'refs/heads/main'; }],
  ['manual workflow', p => { p.eventName = 'workflow_dispatch'; }],
  ['schedule', p => { p.eventName = 'schedule'; }],
]) {
  test(`exception cannot be used by ${name}`, () => {
    const p = clone(publication); mutate(p);
    assert.equal(isPr2139Publication(p), false);
    assert.equal(expired(run(config, annotations, p)), true);
  });
}

for (const [name, mutate] of [
  ['missing associated PR evidence', p => { p.associatedPullRequests = []; }],
  ['later main commit', p => { p.sha = p.event.after = 'b'.repeat(40); }],
  ['unmerged PR', p => { p.associatedPullRequests[0].merged_at = null; }],
  ['another merged PR', p => { p.associatedPullRequests[0].number = 2144; }],
  ['different event SHA', p => { p.event.after = 'b'.repeat(40); }],
  ['deleted branch', p => { p.event.deleted = true; }],
]) {
  test(`main exception rejects ${name}`, () => {
    const p = clone(mainPublication); mutate(p);
    assert.equal(isPr2139Publication(p), false);
    assert.equal(expired(run(config, annotations, p)), true);
  });
}

test('normal local/other-context audit still reports the overdue entry', () => {
  assert.equal(expired(audit(config, annotations, experiments, '2026-10-23')), true);
  assert.equal(pr7PublicationException(config, annotations, '2026-10-22', publication), null);
});

for (const [key, value] of [
  ['id', 'pr8'], ['published_at', '2026-09-25'],
  ['url', 'https://prtimes.jp/main/html/rd/p/000000012.000182412.html'],
  ['resolve_by', '2026-10-21'],
]) {
  test(`exception cannot transfer to a changed ${key}`, () => {
    const c = clone(config); c.known_unrecorded[0][key] = value;
    assert.equal(pr7PublicationException(c, annotations, '2026-10-23', publication), null);
    assert.equal(expired(run(c)), true);
  });
}

for (const key of ['approved_by', 'approved_on', 'pull_request', 'scope', 'historical_evaluation']) {
  test(`missing explicit approval field ${key} fails closed`, () => {
    const c = clone(config); delete c.known_unrecorded[0].owner_approved_web_publication_exception[key];
    assert.equal(expired(run(c)), true);
  });
}

test('removing the approval, record, or original annotation cannot silently complete the ledger', () => {
  const c = clone(config); delete c.known_unrecorded[0].owner_approved_web_publication_exception;
  assert.equal(expired(run(c)), true);
  c.known_unrecorded = [];
  assert.ok(run(c).some(x => x.includes('D+14 を拾わない')));
  const a = clone(annotations); a.annotations = a.annotations.filter(x => x.date !== '2026-09-24' || x.type !== 'pr');
  assert.equal(expired(run(config, a)), true);
});

test('changing the pinned unresolved annotation does not manufacture a past pass', () => {
  const a = clone(annotations);
  a.annotations.find(x => x.type === 'pr' && x.date === '2026-09-24').note = 'All gates passed';
  assert.equal(expired(run(config, a)), true);
});

test('another release on the same day is not covered by the exceptional date', () => {
  const a = clone(annotations);
  a.annotations.push({ type: 'pr', date: '2026-09-24', label: '別の配信', note: '別の原文' });
  assert.ok(run(config, a).some(x => x.includes('D+14 を拾わない')));
});

test('duplicate exceptional entry or annotation fails closed', () => {
  const c = clone(config); c.known_unrecorded.push(clone(c.known_unrecorded[0]));
  assert.equal(expired(run(c)), true);
  const a = clone(annotations);
  a.annotations.push(clone(a.annotations.find(x => x.type === 'pr' && x.date === '2026-09-24')));
  assert.equal(expired(run(config, a)), true);
});

test('another expired item and a later missing release still fail', () => {
  const c = clone(config);
  c.known_unrecorded.push({ ...clone(c.known_unrecorded[0]), id: 'pr8', published_at: '2026-10-01', url: 'https://example.com/another-release' });
  assert.equal(expired(run(c)), true);
  const a = clone(annotations); a.annotations.push({ type: 'pr', date: '2026-10-20', label: 'PR⑧' });
  assert.ok(run(config, a).some(x => x.includes('D+14 を拾わない')));
});

test('freshness and missing-file checks remain active even with the owner exception', () => {
  assert.ok(run(config, annotations, publication, '2026-11-05').some(x => x.includes('全件確認')));
  for (const result of [run(null), run(config, null), run(config, annotations, publication, '2026-10-23', null)]) {
    assert.ok(result.length > 0);
  }
});

test('audit preserves all input evidence and approval fields', () => {
  const before = JSON.stringify([config, annotations, experiments]);
  run(); run(config, annotations, mainPublication);
  assert.equal(JSON.stringify([config, annotations, experiments]), before);
});

test('workflow preserves read-only permissions and bounds its public merge lookup without auth fallback', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/seo-check.yml', import.meta.url), 'utf8');
  assert.match(workflow, /permissions:\n  contents: read\n/);
  const step = workflow.split('      - name: PR release ledger completeness\n')[1].split('\n      - name:')[0];
  assert.match(step, /context\.eventName === 'push' && context\.ref === 'refs\/heads\/main'/);
  assert.match(step, /https:\/\/api\.github\.com\/repos\/simplememofast\/simplememo\/commits\//);
  assert.match(step, /AbortSignal\.timeout\(10000\), redirect: 'error'/);
  assert.match(step, /response\.status !== 200\) throw/);
  assert.doesNotMatch(step, /Authorization|secrets\.|github\.rest|pull-requests: write|continue-on-error/);
});

test('ordinary run wiring exposes both regressions to preflight and preserves the selftest ratchet', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/seo-check.yml', import.meta.url), 'utf8');
  const commands = extractCommands(workflow);
  assert.ok(commands.some(c => c.runner === 'node' && c.script === 'scripts/check-pr-release-ledger.mjs' && c.args.includes('--selftest')));
  assert.ok(commands.some(c => c.runner === 'node' && c.script === '--test' && c.args.includes('scripts/pr-release-publication-exception.test.mjs')));
  assert.ok(wiredChecks().includes('scripts/check-pr-release-ledger.mjs'));
  assert.ok(gatingChecks().includes('scripts/check-pr-release-ledger.mjs'));
});

// Execute the actual workflow JavaScript with only its module import and network
// dependencies injected. No token, network request, CI run or public write occurs.
const yaml = fs.readFileSync(new URL('../.github/workflows/seo-check.yml', import.meta.url), 'utf8');
const block = yaml.split('      - name: PR release ledger completeness\n')[1].split('\n      - name:')[0];
const script = block.split('          script: |\n')[1].split('\n')
  .filter(line => line.startsWith('            ')).map(line => line.slice(12)).join('\n');
const importLine = "const { checkPublication } = await import(`${process.env.GITHUB_WORKSPACE}/scripts/check-pr-release-ledger.mjs`);";
assert.ok(script.includes(importLine), 'workflow import must remain explicitly injectable');
const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
  'context', 'core', 'fetch', 'AbortSignal', 'hooks', script.replace(importLine, 'const { checkPublication } = hooks;'));

for (const scenario of ['valid-main', 'valid-pr', 'other-pr', 'other-merge', '403', '500', 'invalid-json', 'not-array', 'redirect', 'timeout']) {
  test(`real workflow wiring: ${scenario}`, async () => {
    const source = clone(scenario.endsWith('-pr') ? publication : mainPublication);
    if (scenario === 'other-pr') source.event.number = source.event.pull_request.number = 2144;
    let calls = 0, checks = 0;
    const failures = [];
    const context = { repo: { owner: 'simplememofast', repo: 'simplememo' },
      eventName: source.eventName, payload: source.event, ref: source.ref, sha: source.sha };
    const fetch = async (url, options) => {
      calls++;
      assert.equal(url, `https://api.github.com/repos/${repository}/commits/${sha}/pulls?per_page=100`);
      assert.deepEqual(options.headers, { Accept: 'application/vnd.github+json' });
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      if (scenario === 'redirect' || scenario === 'timeout') throw new Error(scenario);
      return { status: scenario === '403' || scenario === '500' ? Number(scenario) : 200,
        json: async () => {
          if (scenario === 'invalid-json') throw new SyntaxError('invalid JSON');
          if (scenario === 'not-array') return {};
          const rows = clone(mainPublication.associatedPullRequests);
          if (scenario === 'other-merge') rows[0].number = 2144;
          return rows;
        } };
    };
    const hooks = { checkPublication: p => { checks++; return run(config, annotations, p).length ? 1 : 0; } };
    const operation = execute(context, { setFailed: message => failures.push(message) }, fetch, AbortSignal, hooks);
    if (['403', '500', 'invalid-json', 'not-array', 'redirect', 'timeout'].includes(scenario)) {
      await assert.rejects(operation);
      assert.equal(checks, 0);
    } else {
      await operation;
      assert.equal(checks, 1);
      assert.equal(failures.length, scenario.startsWith('other-') ? 1 : 0);
    }
    assert.equal(calls, scenario.endsWith('-pr') ? 0 : 1, 'never retry or fall back to another identity');
  });
}
