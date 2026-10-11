#!/usr/bin/env node
/**
 * KPIの定義が黙って変わっていないかを検査する。
 *
 *   node scripts/check-definitions.mjs           # 表示
 *   node scripts/check-definitions.mjs --check   # CI
 *   node scripts/check-definitions.mjs --bump <id> --why "..."   # 定義を変えたと宣言する
 *
 * 【なぜ】
 * **定義が黙って変わるのが、この種の運用でいちばん怖い。**率の出し方を少し変えれば
 * 数字は動くし、動いたことは誰にも見えない。過去の数字と比較できなくなったことにも
 * 気づけない。分母を乗り換える goodharting は、悪意がなくても起きる。
 *
 * 計算元ファイルのチェックサムを持ち、**変わったら version を上げて理由を書くまで
 * CIが落ちる。**リファクタでも一度は止まるが、それでよい —
 * 止まったときに「定義は変えていない」と書けばいい。**止まらないほうが危ない。**
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFS_PATH = path.join(ROOT, 'data/kpi-definitions.json');

export const checksum = (abs) =>
  crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);

const CHECKSUM_RE = /^[a-f0-9]{16}$/;
const validChecksum = (value) => typeof value === 'string' && CHECKSUM_RE.test(value);
const readSource = (p) => checksum(path.join(ROOT, p));
const sourceExists = (p) => fs.existsSync(path.join(ROOT, p));
const validSourcePath = (p) => typeof p === 'string' && p.length > 0 && p.trim() === p
  && !path.posix.isAbsolute(p) && !/^[A-Za-z]:/.test(p) && !/[\\\u0000]/.test(p)
  && p.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');

// checksum remains the single source_file checksum. Dependencies are explicit,
// optional additional sources; an invalid declaration must never become [] or {}.
function sourceEntries(d) {
  if (!validSourcePath(d.source_file)) throw new Error('source_file はリポジトリ内の相対パスが要る');
  if (!validChecksum(d.checksum)) throw new Error('checksum は16桁の小文字hexが要る');
  const entries = [[d.source_file, d.checksum]];
  if (!Object.hasOwn(d, 'source_dependencies')) return entries;
  const dependencies = d.source_dependencies;
  if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(dependencies))
      || Object.keys(dependencies).length === 0) throw new Error('source_dependencies は空でない path:checksum のmapが要る');
  for (const [file, hash] of Object.entries(dependencies)) {
    if (!validSourcePath(file)) throw new Error(`source_dependencies の不正なsource path: ${file}`);
    if (!validChecksum(hash)) throw new Error(`source_dependencies「${file}」のchecksum は16桁の小文字hexが要る`);
    entries.push([file, hash]);
  }
  return entries;
}

function currentSources(d, { read, exists }) {
  return sourceEntries(d).map(([file, registered]) => {
    if (!exists(file)) throw new Error(`source "${file}" が存在しない`);
    let now;
    try { now = read(file); } catch { throw new Error(`source "${file}" を読み取れない`); }
    if (!validChecksum(now)) throw new Error(`source "${file}" のchecksum を確認できない`);
    return { file, registered, now };
  });
}

export function validate(doc, { read = readSource, exists = sourceExists } = {}) {
  const problems = [];
  const drifted = [];
  const ids = new Set();
  for (const d of doc.definitions || []) {
    const at = `definitions「${d.id || '(id無し)'}」`;
    if (!d.id) problems.push('id の無い定義がある');
    else if (ids.has(d.id)) problems.push(`${at}: id が重複`);
    else ids.add(d.id);
    for (const k of ['name', 'formula', 'source_file', 'changed_at', 'why_it_matters']) {
      if (!d[k]) problems.push(`${at}: ${k} が無い`);
    }
    if (typeof d.version !== 'number' || d.version < 1) problems.push(`${at}: version は1以上の数`);
    try {
      const sources = currentSources(d, { read, exists });
      const changes = sources.filter(s => s.registered !== s.now);
      if (changes.length > 0) drifted.push({ ...d, now: sources[0].now, changed_sources: changes });
    } catch (e) { problems.push(`${at}: ${e.message}`); }
  }
  for (const d of drifted) {
    for (const source of d.changed_sources) problems.push(`${at_(d)}: 計算元 ${source.file} が変わっている（${source.registered} → ${source.now}）`
      + ' — **定義を変えたなら version を上げて changed_at と why を書く。**'
      + ' 変えていないなら `--bump` で checksum だけ更新し、why に「定義は変えていない」と書く');
  }
  return { problems, drifted };
  function at_(d) { return `definitions「${d.id}」`; }
}

export function bump(doc, id, why, { read = readSource, exists = sourceExists,
                                    today = new Date().toISOString().slice(0, 10) } = {}) {
  if (typeof why !== 'string' || !why.trim()) throw new Error('--why が要る。**理由の無い定義変更を通さない**');
  const d = doc.definitions.find(x => x.id === id);
  if (!d) throw new Error(`未知の id: ${id}`);
  if (!Number.isInteger(d.version) || d.version < 1) throw new Error('version は1以上の整数が要る');
  if (d.history !== undefined && !Array.isArray(d.history)) throw new Error('history は配列が要る');
  // Read and validate every declared source before changing this definition.
  const sources = currentSources(d, { read, exists });
  d.version += 1;
  d.checksum = sources[0].now;
  if (Object.hasOwn(d, 'source_dependencies')) {
    d.source_dependencies = Object.fromEntries(sources.slice(1).map(s => [s.file, s.now]));
  }
  d.changed_at = today;
  d.history = d.history || [];
  d.history.push({ version: d.version, at: d.changed_at, why });
  return d;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
const SELFTEST_BREAKAGES = [
  ['id の重複は落ちる', (d) => { d.definitions.push({ ...d.definitions[0] }); }],
  ['**計算元のファイルが存在しない**のは落ちる', (d) => { d.definitions[0].source_file = 'scripts/存在しない.mjs'; }],
  ['version が1未満なら落ちる', (d) => { d.definitions[0].version = 0; }],
  ['**checksum がずれたら落ちる**（計算元が変わったのに定義が古いまま）', (d) => { d.definitions[0].checksum = 'そのへんの値'; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(DEFS_PATH, 'utf8')),
  (d) => validate(d).problems,
  SELFTEST_BREAKAGES,
);

SCENARIOS.push(['依存宣言はopt-in、明示した不正値はvalidateとbumpの両方で拒否する', () => {
  const source = 'scripts/calculation.mjs', helper = 'scripts/lib/helper.mjs';
  const io = { read: p => p === source ? 'a'.repeat(16) : 'b'.repeat(16), exists: p => [source, helper].includes(p) };
  const base = () => ({ definitions: [{ id: 'synthetic', name: 'Synthetic', formula: 'n/d', source_file: source,
    checksum: 'a'.repeat(16), version: 1, changed_at: '2026-09-30', why_it_matters: 'regression' }] });
  assert(validate(base(), io).problems.length === 0, '旧形式の依存省略を維持');
  for (const dependencies of [null, undefined, [], {}, false, 'map',
    { [helper]: null }, { [helper]: 123 }, { [helper]: 1234567890123456 }, { [helper]: ['b'.repeat(16)] },
    { [helper]: 'B'.repeat(16) }, { [helper]: 'b'.repeat(64) },
    { '../helper.mjs': 'b'.repeat(16) }, { '/tmp/helper.mjs': 'b'.repeat(16) },
    { 'scripts/../helper.mjs': 'b'.repeat(16) }, { 'scripts\\helper.mjs': 'b'.repeat(16) },
    { 'C:/helper.mjs': 'b'.repeat(16) }, { 'scripts/missing.mjs': 'b'.repeat(16) }]) {
    const doc = base(); doc.definitions[0].source_dependencies = dependencies;
    const before = JSON.stringify(doc);
    assert(validate(doc, io).problems.length > 0, '不正依存を検査が通した: ' + JSON.stringify(dependencies));
    let rejected = false;
    try { bump(doc, 'synthetic', 'must fail', io); } catch { rejected = true; }
    assert(rejected && JSON.stringify(doc) === before, '拒否時にversion/history/checksumを変更しない');
  }
  const doc = base(); doc.definitions[0].source_dependencies = { [helper]: 'b'.repeat(16) };
  assert(validate(doc, io).problems.length === 0, '正しい依存宣言は通る');
  for (const hash of [1234567890123456, ['a'.repeat(16)]]) {
    const broken = base(); broken.definitions[0].checksum = hash;
    const before = JSON.stringify(broken);
    assert(validate(broken, io).problems.length > 0, 'primary checksumの型強制を拒否');
    let rejected = false;
    try { bump(broken, 'synthetic', 'must fail', io); } catch { rejected = true; }
    assert(rejected && JSON.stringify(broken) === before, '不正primary checksumのbumpは書き換えない');
    const badRead = { ...io, read: () => hash };
    const original = base(), originalBytes = JSON.stringify(original);
    assert(validate(original, badRead).problems.length > 0, 'current read checksumの型強制を拒否');
    rejected = false;
    try { bump(original, 'synthetic', 'must fail', badRead); } catch { rejected = true; }
    assert(rejected && JSON.stringify(original) === originalBytes, '不正current readのbumpは書き換えない');
  }
  const unreadable = { ...io, read: p => { if (p === helper) throw new Error('unreadable'); return io.read(p); } };
  assert(validate(doc, unreadable).problems.length > 0, '依存の読取失敗をunknownとして拒否する');
  for (const history of [null, {}, 'old history']) {
    const broken = base(); broken.definitions[0].history = history;
    const before = JSON.stringify(broken);
    let rejected = false;
    try { bump(broken, 'synthetic', 'must fail', io); } catch { rejected = true; }
    assert(rejected && JSON.stringify(broken) === before, '不正historyを失敗前に変更しない');
  }
}]);

SCENARIOS.push(['実CLIはhelperだけの変異を検知し、bumpで依存と履歴を更新する', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kpi-dependencies-')));
  try {
    for (const file of ['scripts/check-definitions.mjs', 'scripts/lib/selftest.mjs']) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    }
    fs.mkdirSync(path.join(dir, 'data'));
    const source = 'scripts/autonomy-score.mjs', helper = 'scripts/lib/intervention-observation.mjs';
    fs.copyFileSync(path.join(ROOT, source), path.join(dir, source));
    const helperBefore = fs.readFileSync(path.join(ROOT, helper), 'utf8');
    fs.writeFileSync(path.join(dir, helper), helperBefore);
    const doc = { definitions: [{ id: 'synthetic', name: 'Synthetic', formula: 'n/d', source_file: source,
      checksum: checksum(path.join(dir, source)), source_dependencies: { [helper]: checksum(path.join(dir, helper)) },
      version: 1, changed_at: '2026-09-01', why_it_matters: 'regression', history: [{ version: 1, at: '2026-09-01', why: 'original' }] }] };
    const file = path.join(dir, 'data/kpi-definitions.json');
    fs.writeFileSync(file, JSON.stringify(doc));
    const cli = (...args) => spawnSync(process.execPath, ['scripts/check-definitions.mjs', ...args], { cwd: dir, encoding: 'utf8' });
    assert(cli('--check').status === 0, '元fixtureはCLI検査を通る');
    const helperAfter = helperBefore.replace("state: 'unknown'", "state: 'recorded_zero'");
    assert(helperAfter !== helperBefore, '実helperのunknownを誤った記録上ゼロへ変える変異');
    fs.writeFileSync(path.join(dir, helper), helperAfter);
    const failed = cli('--check');
    assert(failed.status === 1 && failed.stderr.includes(helper), '親計算元が同一でもhelper-only変異でCLIを落とす');
    assert(checksum(path.join(dir, source)) === doc.definitions[0].checksum, 'source_file単体checksumは変化しない');
    assert(cli('--bump', 'synthetic', '--why', 'helper-only semantic change').status === 0, '依存のdriftは理由付きbumpで更新する');
    const after = JSON.parse(fs.readFileSync(file, 'utf8')).definitions[0];
    assert(after.checksum === doc.definitions[0].checksum && after.source_dependencies[helper] === checksum(path.join(dir, helper)), 'primaryの意味を維持し依存だけのhashを更新');
    assert(after.version === 2 && after.history.length === 2 && JSON.stringify(after.history[0]) === JSON.stringify(doc.definitions[0].history[0]), '履歴prefixとv+1を維持');
    assert(cli('--check').status === 0, '更新後はCLI検査を通る');
    for (const dependencies of [{}, null, { 'scripts/missing.mjs': 'b'.repeat(16) }]) {
      const broken = { definitions: [{ ...after, source_dependencies: dependencies }] };
      fs.writeFileSync(file, JSON.stringify(broken));
      const before = fs.readFileSync(file, 'utf8');
      assert(cli('--bump', 'synthetic', '--why', 'must fail').status !== 0, '不正宣言のCLI bumpを拒否');
      assert(fs.readFileSync(file, 'utf8') === before, 'CLI拒否時に台帳を書き込まない');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}]);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const doc = JSON.parse(fs.readFileSync(DEFS_PATH, 'utf8'));

  const bi = argv.indexOf('--bump');
  if (bi >= 0) {
    const id = argv[bi + 1];
    const wi = argv.indexOf('--why');
    const why = wi >= 0 ? argv[wi + 1] : null;
    let d;
    try { d = bump(doc, id, why); } catch (e) { console.error(e.message); process.exit(2); }
    fs.writeFileSync(DEFS_PATH, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`${id} を v${d.version} へ。理由: ${why}`);
    process.exit(0);
  }

  const { problems, drifted } = validate(doc);
  console.log(`KPIの定義 ${doc.definitions.length}件\n`);
  for (const d of doc.definitions) {
    console.log(`  v${d.version}  ${d.name}`);
    console.log(`      ${d.formula}`);
    console.log(`      ${d.source_file}  (${d.changed_at})`);
  }
  if (drifted.length) {
    console.log(`\n  ⚠ 計算元が変わった定義 ${drifted.length}件`);
  }
  console.log('\n  **リファクタでも一度は止まる。**止まったときに「定義は変えていない」と');
  console.log('  書けばいい。**止まらないほうが危ない。**');

  if (problems.length) {
    console.error('\nKPIの定義: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('\n定義と計算元が一致している。');
}
