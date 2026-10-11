import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validate, bump } from './check-definitions.mjs';
import { SQL_FILES, validateQueryDefinitions, bumpQueryDefinition } from './check-query-definitions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sql-query-definitions.json'), 'utf8'));
const originalKpiBytes = fs.readFileSync(path.join(ROOT, 'data/kpi-definitions.json'));
const sql = new Map(SQL_FILES.map(file => [file, fs.readFileSync(path.join(ROOT, file))]));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const ioFor = map => ({ exists: file => map.has(file), read: file => hash(map.get(file)).slice(0, 16), readFull: file => hash(map.get(file)) });
const io = ioFor(sql);
const date = registry.definitions[0].changed_at;

test('既存SQL8本だけを監視し、原19KPIへの行追加・測定値生成なし', () => {
  assert.equal(registry.registry_kind, 'existing_sql_definition_monitoring');
  assert.equal(registry.definitions.length, SQL_FILES.length);
  assert.equal(JSON.parse(originalKpiBytes).definitions.length, 19);
  assert.deepEqual(validate(registry, io).problems, []);
  assert.deepEqual(validateQueryDefinitions(registry, io).problems, []);
  for (const d of registry.definitions) {
    assert.equal(d.definition_kind, 'existing_sql_source_monitoring');
    assert.equal(d.source_sha256, hash(sql.get(d.source_file)));
  }
});

test('全8SQLの原本だけの変異を原validatorが拒否し、原bumpは理由・履歴を要求', () => {
  for (const d of registry.definitions) {
    const changed = new Map(sql); changed.set(d.source_file, Buffer.concat([sql.get(d.source_file), Buffer.from('\n-- fixture-only source drift\n')]));
    const changedIO = ioFor(changed), before = JSON.stringify(registry);
    const result = validate(registry, changedIO);
    assert.equal(result.drifted.length, 1);
    assert.equal(result.drifted[0].id, d.id);
    assert.ok(validateQueryDefinitions(registry, changedIO).problems.length > 0);
    const copy = clone(registry);
    assert.throws(() => bump(copy, d.id, ' ', { ...changedIO, today: date }));
    assert.deepEqual(copy, registry);
    const next = bumpQueryDefinition(registry, d.id, 'fixture-only definition change; no query executed', changedIO, date);
    assert.equal(JSON.stringify(registry), before);
    assert.deepEqual(validateQueryDefinitions(next, changedIO).problems, []);
    const n = next.definitions.find(x => x.id === d.id);
    assert.equal(n.version, d.version + 1);
    assert.deepEqual(n.history.slice(0, -1), d.history);
    assert.equal(n.source_sha256, hash(changed.get(d.source_file)));
    assert.deepEqual(next.definitions.filter(x => x.id !== d.id), registry.definitions.filter(x => x.id !== d.id));
  }
});

test('GSC CTRの分母だけの意味変更も理由付きversion宣言前は拒否', () => {
  const file = 'growth/sql/analytics/gsc-site.sql';
  const before = sql.get(file).toString();
  const after = before.replace('SAFE_DIVIDE(SUM(clicks), SUM(impressions)) AS ctr', 'SAFE_DIVIDE(SUM(impressions), SUM(clicks)) AS ctr');
  assert.notEqual(after, before);
  const changed = new Map(sql); changed.set(file, Buffer.from(after));
  assert.ok(validate(registry, ioFor(changed)).problems.length > 0);
  assert.ok(validateQueryDefinitions(registry, ioFor(changed)).problems.length > 0);
  assert.equal(sql.get(file).toString(), before);
});

test('16桁prefixが同じ偽fullSHAも通さない', () => {
  const forged = clone(registry); const d = forged.definitions[0];
  d.source_sha256 = d.checksum + (d.source_sha256.slice(16) === '0'.repeat(48) ? '1' : '0').repeat(48);
  assert.deepEqual(validate(forged, io).problems, []);
  assert.ok(validateQueryDefinitions(forged, io).problems.length > 0);
});

test('SQL欠落・重複・path逸脱・kind変更・不正履歴を空/成功に補完しない', () => {
  const cases = [
    d => { d.definitions.pop(); },
    d => { d.definitions[1] = clone(d.definitions[0]); },
    d => { d.definitions[0].source_file = '../outside.sql'; },
    d => { d.definitions[0].definition_kind = 'new_kpi_measurement'; },
    d => { d.definitions[0].history = null; },
    d => { d.definitions[0].history[0].why = ''; },
    d => { d.definitions[0].version += 1; },
    d => { d.definitions[0].changed_at = '2026-02-30'; },
    d => { d.definitions[0].source_dependencies = {}; },
  ];
  for (const mutate of cases) {
    const bad = clone(registry); mutate(bad); const before = JSON.stringify(bad);
    assert.ok(validateQueryDefinitions(bad, io).problems.length > 0);
    assert.throws(() => bumpQueryDefinition(bad, bad.definitions[0].id, 'must reject', io, date));
    assert.equal(JSON.stringify(bad), before);
  }
});

test('SQL欠測・読取失敗・空理由・不一致IOは更新前に拒否し入力不変', () => {
  const id = registry.definitions[0].id, file = registry.definitions[0].source_file;
  const missing = new Map(sql); missing.delete(file);
  const cases = [
    [ioFor(missing), 'reason'],
    [{ ...io, readFull: () => { throw new Error('unreadable fixture'); } }, 'reason'],
    [{ ...io, readFull: () => null }, 'reason'],
    [{ ...io, read: () => 'f'.repeat(16) }, 'reason'],
    [io, ''], [io, '   '],
  ];
  for (const [badIO, why] of cases) {
    const before = JSON.stringify(registry);
    assert.throws(() => bumpQueryDefinition(registry, id, why, badIO, date));
    assert.equal(JSON.stringify(registry), before);
  }
  assert.ok(validateQueryDefinitions(registry, ioFor(missing)).problems.length > 0);
});

test('実CLIのcheck→SQL-only拒否→理由付きbump→checkで原KPI/他定義を保全', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'sql-definition-fixture-')); fs.chmodSync(dir, 0o700);
  try {
    const copy = ['scripts/check-query-definitions.mjs', 'scripts/check-definitions.mjs', 'scripts/lib/selftest.mjs',
      'data/sql-query-definitions.json', 'data/kpi-definitions.json', ...SQL_FILES];
    for (const file of copy) { const p = path.join(dir, file); fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 }); fs.copyFileSync(path.join(ROOT, file), p); fs.chmodSync(p, 0o600); }
    const cli = (...args) => spawnSync(process.execPath, ['scripts/check-query-definitions.mjs', ...args], { cwd: dir, encoding: 'utf8', timeout: 10000 });
    assert.equal(cli('--check').status, 0);
    const file = SQL_FILES[0], original = fs.readFileSync(path.join(dir, file));
    fs.appendFileSync(path.join(dir, file), '\n-- fixture-only change\n');
    const target = registry.definitions.find(d => d.source_file === file), regPath = path.join(dir, 'data/sql-query-definitions.json');
    const rawBefore = fs.readFileSync(regPath);
    assert.equal(cli('--check').status, 1);
    assert.equal(cli('--bump', target.id, '--why', '').status, 2);
    assert.deepEqual(fs.readFileSync(regPath), rawBefore);
    assert.equal(cli('--bump', target.id, '--why', 'fixture-only source change; not measured').status, 0);
    assert.equal(cli('--check').status, 0);
    const changed = JSON.parse(fs.readFileSync(regPath));
    const next = changed.definitions.find(d => d.id === target.id);
    assert.equal(next.version, target.version + 1); assert.deepEqual(next.history.slice(0, -1), target.history);
    assert.deepEqual(changed.definitions.filter(d => d.id !== target.id), registry.definitions.filter(d => d.id !== target.id));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'data/kpi-definitions.json')), originalKpiBytes);
    assert.notDeepEqual(fs.readFileSync(path.join(dir, file)), original);
    const firstRegistryBytes = fs.readFileSync(regPath);
    fs.appendFileSync(path.join(dir, file), '\n-- fixture-only second definition change\n');
    assert.equal(cli('--check').status, 1);
    assert.deepEqual(fs.readFileSync(regPath), firstRegistryBytes);
    assert.equal(cli('--bump', target.id, '--why', 'fixture-only second source change; not measured').status, 0);
    assert.equal(cli('--check').status, 0);
    const second = JSON.parse(fs.readFileSync(regPath));
    const secondTarget = second.definitions.find(d => d.id === target.id);
    assert.equal(secondTarget.version, next.version + 1);
    assert.deepEqual(secondTarget.history.slice(0, -1), next.history);
    assert.deepEqual(second.definitions.filter(d => d.id !== target.id), registry.definitions.filter(d => d.id !== target.id));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'data/kpi-definitions.json')), originalKpiBytes);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
