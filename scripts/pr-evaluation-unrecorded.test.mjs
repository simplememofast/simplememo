import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { due, POST_KEYS, REQUIRED_POST_KEYS, readKnownUnrecorded, validateKnownUnrecorded } from './pr-evaluation-due.mjs';

const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const known = () => [{ id: 'unrecorded-seven', experiment_id: 'experiment-seven',
  published_at: '2026-09-24', evaluation_at: '2026-10-08', resolve_by: '2026-11-04' }];
const existing = status => ({ id: 'experiment-seven', type: 'pr_release', status,
  started_at: '2026-09-24', evaluation_at: '2026-10-08',
  discover_boarding_post: { pv: 123, google_referral_ratio: null, mobile_ratio: null,
    syndication_count: null, day1_senders_vs_prev3avg: null, boarded: null } });

test('real PR7 appears at D+14 even though its experiment is absent', () => {
  const rows = read('../growth/experiments/experiments.json').experiments;
  const entries = readKnownUnrecorded();
  const pr7 = entries.find(e => e.id === 'pr7-dialogue-memo');
  assert.ok(pr7);
  const before = JSON.stringify([rows, entries]);
  assert.equal(rows.some(e => e.id === pr7.experiment_id), false);
  assert.equal(due(rows, '2026-10-07', entries).some(e => e.id === pr7.experiment_id), false);
  for (const [date, days] of [['2026-10-08', 0], ['2026-10-23', 15], ['2026-11-05', 28]]) {
    const result = due(rows, date, entries).filter(e => e.id === pr7.experiment_id);
    assert.equal(result.length, 1);
    const row = result[0];
    assert.equal(row.evaluation_at, '2026-10-08');
    assert.equal(row.started_at, '2026-09-24');
    assert.equal(row.days_overdue, days);
    assert.equal(row.recording_deadline, '2026-11-04');
    assert.equal(row.source, 'data/pr-release-ledger.json');
    assert.equal(row.source_id, pr7.id);
    assert.equal(row.missing_experiment, true);
    assert.equal(row.capture_state, 'uncaptured');
    assert.deepEqual(row.missing, POST_KEYS);
    assert.deepEqual(row.required_missing, REQUIRED_POST_KEYS);
    assert.deepEqual(row.existing_fields, []);
    for (const key of [...POST_KEYS, 'boarded', 'd_score_pre', 'status', 'decision'])
      assert.equal(Object.hasOwn(row, key), false);
  }
  assert.equal(JSON.stringify([rows, entries]), before);
});

test('extending only the recording deadline cannot postpone or complete capture', () => {
  const entries = known();
  const initial = due([], '2026-10-23', entries)[0];
  entries[0].resolve_by = '2026-12-01';
  const later = due([], '2026-10-23', entries)[0];
  assert.equal(later.evaluation_at, initial.evaluation_at);
  assert.equal(later.days_overdue, initial.days_overdue);
  assert.equal(later.capture_state, 'uncaptured');
});

for (const status of ['planned', 'running', 'frozen', 'evaluated', 'cancelled']) {
  for (const match of ['experiment_id', 'source_id']) {
    test(`an existing ${status} matched by ${match} uses the ordinary path or requires reconciliation`, () => {
      const row = existing(status);
      if (match === 'source_id') row.id = 'unrecorded-seven';
      const before = JSON.stringify(row);
      const result = due([row], '2026-10-23', known());
      if (['running', 'evaluated'].includes(status)) {
        assert.deepEqual(result, due([row], '2026-10-23'));
        assert.equal(result.length, status === 'running' ? 1 : 0);
      } else {
        assert.equal(result.length, 1);
        assert.equal(result[0].next_step, 'review_existing_experiment_state');
        assert.equal(result[0].missing_experiment, false);
        assert.equal(result[0].existing_status, status);
        assert.equal(result[0].existing_experiment_id, row.id);
        assert.equal(result[0].capture_state, 'partial');
        assert.deepEqual(result[0].existing_fields, ['pv']);
        assert.equal(result[0].missing.includes('pv'), false);
        for (const key of [...POST_KEYS, 'boarded', 'd_score_pre', 'status', 'decision'])
          assert.equal(Object.hasOwn(result[0], key), false);
      }
      assert.ok(result.every(e => !e.missing_experiment));
      assert.equal(JSON.stringify(row), before);
    });
  }
  test(`another ${status} PR on the same date cannot hide PR7`, () => {
    const row = { ...existing(status), id: 'unrelated-pr' };
    const result = due([row], '2026-10-23', known());
    const pending = result.filter(e => e.id === 'experiment-seven');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].missing_experiment, true);
    assert.equal(pending[0].next_step, 'capture_then_reconcile_missing_experiment');
    assert.equal(pending[0].capture_state, 'uncaptured');
    assert.deepEqual(pending[0].existing_fields, []);
    assert.deepEqual(pending[0].missing, POST_KEYS);
  });
}

test('a conflicting existing state with no measurements remains wholly unknown', () => {
  const row = existing('cancelled'); delete row.discover_boarding_post;
  const result = due([row], '2026-10-23', known())[0];
  assert.equal(result.next_step, 'review_existing_experiment_state');
  assert.equal(result.capture_state, 'uncaptured');
  assert.deepEqual(result.missing, POST_KEYS);
  assert.deepEqual(result.existing_fields, []);
});

test('an explicit id attached to another experiment type requires reconciliation', () => {
  const row = { ...existing('evaluated'), type: 'title_test' };
  const result = due([row], '2026-10-23', known())[0];
  assert.equal(result.next_step, 'review_existing_experiment_state');
  assert.equal(result.existing_status, 'evaluated');
  assert.equal(result.missing_experiment, false);
});

test('another experiment type on the same date does not hide the missing PR', () => {
  const row = { ...existing('evaluated'), id: 'page-title-test', type: 'title_test' };
  assert.equal(due([row], '2026-10-23', known())[0].missing_experiment, true);
});

test('existing partial measurements stay in their experiment and are never reset', () => {
  const row = existing('running');
  const result = due([row], '2026-10-23', known())[0];
  assert.equal(result.capture_state, 'partial');
  assert.deepEqual(result.existing_fields, ['pv']);
  assert.equal(result.missing.includes('pv'), false);
  assert.equal(row.discover_boarding_post.pv, 123);
});

for (const [key, value] of [
  ['id', null], ['experiment_id', ''], ['published_at', '2026-09-31'],
  ['evaluation_at', undefined], ['evaluation_at', '2026-02-29'],
  ['evaluation_at', '2026-11-04'], ['resolve_by', '2026-09-31'],
  ['resolve_by', '2026-10-07'],
]) {
  test(`invalid known-unrecorded ${key}=${value} cannot become an empty success`, () => {
    const entries = known(); entries[0][key] = value;
    assert.throws(() => due([], '2026-10-23', entries), /pr-release-ledger/);
  });
}

test('malformed lists and duplicate ids fail; old two-argument behavior is preserved', () => {
  for (const value of [null, {}, [null], [known()[0], known()[0]]])
    assert.throws(() => validateKnownUnrecorded(value), /pr-release-ledger/);
  const collision = known(); collision.push({ ...collision[0], id: 'another-source-id' });
  assert.throws(() => validateKnownUnrecorded(collision), /duplicate/);
  assert.deepEqual(due(null, '2026-10-23'), []);
  assert.deepEqual(due([], 'invalid-date'), []);
  assert.deepEqual(due([existing('evaluated')], '2026-10-23'), []);
});

function withCli(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-evaluation-unrecorded-'));
  try {
    for (const relative of ['scripts', 'data', 'growth/experiments'])
      fs.mkdirSync(path.join(dir, relative), { recursive: true });
    fs.copyFileSync(new URL('./pr-evaluation-due.mjs', import.meta.url), path.join(dir, 'scripts/pr-evaluation-due.mjs'));
    const config = path.join(dir, 'data/pr-release-ledger.json');
    const experiments = path.join(dir, 'growth/experiments/experiments.json');
    fs.writeFileSync(config, JSON.stringify({ known_unrecorded: known() }));
    fs.writeFileSync(experiments, JSON.stringify({ experiments: [] }));
    run({ config, experiments, invoke: () => spawnSync(process.execPath,
      [path.join(dir, 'scripts/pr-evaluation-due.mjs'), '--json'], { encoding: 'utf8' }) });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

for (const [name, damage] of [
  ['missing config', ({ config }) => fs.unlinkSync(config)],
  ['invalid JSON', ({ config }) => fs.writeFileSync(config, '{')],
  ['missing known_unrecorded', ({ config }) => fs.writeFileSync(config, '{}')],
  ['invalid entry date', ({ config }) => fs.writeFileSync(config, JSON.stringify({ known_unrecorded: [{ ...known()[0], evaluation_at: '2026-09-31' }] }))],
  ['malformed experiment ledger', ({ experiments }) => fs.writeFileSync(experiments, '{}')],
]) {
  test(`CLI reports ${name} as failure, never []`, () => withCli(files => {
    damage(files);
    const result = files.invoke();
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), '');
    assert.match(result.stderr, /PR evaluation due:.*未取得0件ではない/s);
  }));
}

test('CLI accepts an explicitly empty known-unrecorded list', () => withCli(files => {
  fs.writeFileSync(files.config, JSON.stringify({ known_unrecorded: [] }));
  const result = files.invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
}));
