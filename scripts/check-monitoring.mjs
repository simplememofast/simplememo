#!/usr/bin/env node
/**
 * 統合監視の棚卸しを検査する。
 *
 *   node scripts/check-monitoring.mjs
 *   node scripts/check-monitoring.mjs --check
 *   node scripts/check-monitoring.mjs --json
 *
 * **「全部見ています」を言うための検査ではない。**
 * 何が見張られていて何が空いているかを、毎回同じ形で出すための検査。
 *
 * 検知の中央値は2.1hだが最大は50.7h。その差は「見張られていない領域で
 * 起きた」ことによる。**どこが空いているかを名指しできなければ縮まらない。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ledgerScenarios, run, assert } from './lib/selftest.mjs';
import { readJSON } from './lib/read-json.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LEVELS = ['automatic', 'derived', 'human', 'none'];
const LABEL = { automatic: '自動検知の登録', derived: '記録から分かる登録', human: '人が見て気づく登録', none: '**検知経路の登録が無い**' };

/** Compound detector declarations use the literal " / ", not path slashes. */
export function detectorPaths(detector) {
  if (typeof detector !== 'string' || !detector || detector.trim() !== detector) {
    throw new Error('detector は空でない相対パスで書く');
  }
  const paths = detector.split(' / ');
  for (const rel of paths) {
    if (!rel || rel.trim() !== rel || /[\\\s\x00-\x1f\x7f]/.test(rel) || path.posix.isAbsolute(rel)) {
      throw new Error('detector のパスまたは複合区切りが不正');
    }
    const parts = rel.split('/');
    const tail = parts[0] === '..' ? parts.slice(2) : parts;
    // Admit only the already declared sibling; never search for checkout aliases.
    if ((parts[0] === '..' && parts[1] !== 'simplememo-api') || !tail.length
      || tail.some(p => !p || p === '.' || p === '..')) {
      throw new Error('detector はサイト内または既存API sibling内の相対パスに限る');
    }
  }
  if (new Set(paths).size !== paths.length) throw new Error('detector の同じパスを重複して書かない');
  return paths;
}

function statKind(file, kind) {
  try { return fs.statSync(file)[kind](); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    if (error.code === 'EACCES' || error.code === 'EPERM') return null;
    throw error; // Other IO failures are not evidence of absence.
  }
}

/** true=file, false=visible missing, null=unobserved. Resolution ignores CWD. */
export function defaultDetectorExists(root = ROOT, {
  fileExists = file => statKind(file, 'isFile'),
  directoryExists = dir => statKind(dir, 'isDirectory'),
} = {}) {
  const site = path.resolve(root);
  return rel => {
    const paths = detectorPaths(rel);
    if (paths.length !== 1) throw new Error('存在確認は1pathずつ行う');
    if (rel.startsWith('../')) {
      const visible = directoryExists(path.resolve(site, '..', 'simplememo-api'));
      if (visible === false || visible === null) return null;
      if (visible !== true) return visible; // Inventory rejects malformed callbacks.
    }
    return fileExists(path.resolve(site, paths[0]));
  };
}

function inspectDetector(signal, exists) {
  if (signal.detection !== 'automatic' && signal.detection !== 'derived') {
    return { id: signal.id, detection: signal.detection, state: 'not_applicable', paths: [], errors: [] };
  }
  let paths;
  try { paths = detectorPaths(signal.detector); }
  catch (error) {
    return { id: signal.id, detection: signal.detection, state: 'invalid', paths: [],
      errors: [`${signal.id}: ${signal.detection} detector が不正: ${error.message}`] };
  }
  const errors = [];
  const observations = paths.map(rel => {
    let available;
    try { available = exists(rel); }
    catch {
      errors.push(`${signal.id}: detector の存在確認を完了できない: ${rel}`);
      return { path: rel, available: null, observation_error: 'io_unavailable' };
    }
    if (available !== true && available !== false && available !== null) {
      errors.push(`${signal.id}: detector の存在確認はtrue/false/nullに限る: ${rel}`);
      return { path: rel, available: null, observation_error: 'invalid_value' };
    }
    if (available === false) errors.push(`${signal.id}: detector が実在しない: ${rel}`);
    return { path: rel, available };
  });
  // All members are required. Known missing wins over a different unknown member.
  const state = observations.some(p => p.available === false) ? 'missing'
    : observations.some(p => p.observation_error === 'invalid_value') ? 'invalid'
      : observations.some(p => p.available === null) ? 'unknown' : 'verified';
  return { id: signal.id, detection: signal.detection, state, paths: observations, errors };
}

/** One static snapshot reused by the CLI; it never proves runtime detection. */
export function inventory(doc, { exists = defaultDetectorExists() } = {}) {
  const errors = []; const detectors = [];
  for (const s of doc.signals) {
    if (!LEVELS.includes(s.detection)) errors.push(`${s.id}: detection が未定義の値: ${s.detection}`);
    const observation = inspectDetector(s, exists); detectors.push(observation);
    if (s.detection === 'automatic' || s.detection === 'derived') {
      errors.push(...observation.errors);
      if (!s.cadence) errors.push(`${s.id}: 頻度が書いていない`);
    }
    if (s.detection === 'none' && !s.note) errors.push(`${s.id}: 経路が無い理由が書いていない`);
  }
  return { errors, detectors };
}

export function audit(doc, options = {}) {
  return inventory(doc, options).errors;
}

/**
 * **実際に起きた failure_class に検知器があるか。**
 * 起きたのに誰も見ていない種別が、次に長時間気づかれない候補。
 */
export function uncoveredFailures(doc, runs) {
  const covered = new Set(doc.signals
    .filter((s) => s.detection === 'automatic')
    .flatMap((s) => s.covers_failure_class ?? []));
  const seen = new Map();
  for (const r of runs.runs ?? []) {
    if (r.failure_class) seen.set(r.failure_class, (seen.get(r.failure_class) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([k]) => !covered.has(k))
    .map(([failure_class, count]) => ({ failure_class, count }));
}


/** Same seen cohort and declared union; availability is only about static files. */
export function failureClassAvailability(doc, runs, detectors) {
  const byId = new Map(detectors.map(d => [d.id, d])); const seen = new Map();
  for (const r of runs.runs ?? []) {
    if (r.failure_class) seen.set(r.failure_class, (seen.get(r.failure_class) ?? 0) + 1);
  }
  return [...seen.entries()].map(([failure_class, count]) => {
    const registrations = doc.signals.filter(s => s.detection === 'automatic'
      && (s.covers_failure_class ?? []).includes(failure_class));
    const signals = registrations.map(s => ({ id: s.id, state: byId.get(s.id)?.state ?? 'unknown' }));
    const state = !signals.length ? 'unregistered'
      : signals.some(s => s.state === 'verified') ? 'verified'
        : signals.some(s => s.state === 'unknown' || s.state === 'invalid') ? 'unknown' : 'missing';
    return { failure_class, count, state, signals, actual_detection: null };
  });
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**検知手段が実在しない**のは落ちる', (d) => { d.signals[0].detector = 'scripts/そんな検知器は無い.mjs'; }],
  ['知らない detection は落ちる', (d) => { d.signals[0].detection = 'なんとなく気づく'; }],
  ['**頻度が書いていない**のは落ちる（いつ見るか決まっていない監視は見ない）', (d) => { delete d.signals[0].cadence; }],
];
function sourceSignal({ sibling = false, compound = false } = {}) {
  const s = readJSON(ROOT, 'data/monitoring-coverage.json').signals.find(s =>
    typeof s.detector === 'string' && (compound ? s.detector.includes(' / ')
      : sibling ? s.detector.startsWith('../') && !s.detector.includes(' / ')
        : !s.detector.startsWith('../')));
  if (!s) throw new Error('原台帳に必要な検知器fixtureが無い');
  return JSON.parse(JSON.stringify(s));
}
const STATIC_SCENARIOS = [
  ['不可視siblingはnullであり、fake存在trueで捏造しない', () => {
    let files = 0;
    const exists = defaultDetectorExists('/site', { directoryExists: () => false,
      fileExists: () => { files++; return true; } });
    const result = inventory({ signals: [sourceSignal({ sibling: true })] }, { exists });
    assert(result.detectors[0].state === 'unknown' && !result.errors.length && files === 0,
      '不可視siblingをmissing/verifiedにした');
  }],
  ['可視sibling内の欠落を..で免除しない', () => {
    const exists = defaultDetectorExists('/site', { directoryExists: () => true, fileExists: () => false });
    const result = inventory({ signals: [sourceSignal({ sibling: true })] }, { exists });
    assert(result.detectors[0].state === 'missing' && result.errors.length === 1, '可視repoの欠落を素通りした');
  }],
  ['内部pathはCWDでなくmodule rootから照合する', () => {
    const s = sourceSignal(); const calls = [];
    const exists = defaultDetectorExists('/fixture/site', { directoryExists: () => { throw new Error('不要'); },
      fileExists: p => { calls.push(p); return p === path.resolve('/fixture/site', s.detector); } });
    const result = inventory({ signals: [s] }, { exists });
    assert(result.detectors[0].state === 'verified' && !result.errors.length && calls.length === 1, 'rootが違う');
  }],
  ['実ディレクトリを検知器ファイルと数えない', () => {
    const s = { ...sourceSignal(), detector: 'scripts/lib' };
    const result = inventory({ signals: [s] });
    assert(result.detectors[0].state === 'missing' && result.errors.length === 1, 'isFileでないものを確認済みにした');
  }],
  ['複合の実区切りで両pathを確認する', () => {
    const s = sourceSignal({ compound: true }); const calls = [];
    const result = inventory({ signals: [s] }, { exists: p => { calls.push(p); return true; } });
    assert(JSON.stringify(calls) === JSON.stringify(s.detector.split(' / ')) && calls.length === 2
      && result.detectors[0].state === 'verified' && !result.errors.length, '丸ごと/片方だけ確認した');
  }],
  ['複合true/nullはunknown、true/falseとnull/falseはmissing', () => {
    const s = sourceSignal({ compound: true });
    for (const [values, state, errors] of [[[true, null], 'unknown', 0], [[true, false], 'missing', 1], [[null, false], 'missing', 1]]) {
      let calls = 0; const result = inventory({ signals: [s] }, { exists: () => values[calls++] });
      assert(calls === 2 && result.detectors[0].state === state && result.errors.length === errors, '2番目pathを落とした');
    }
  }],
  ['内部とsibling混在のunknownを内部存在で消さない', () => {
    const a = sourceSignal(); const b = sourceSignal({ sibling: true });
    const s = { ...a, detector: `${a.detector} / ${b.detector}` };
    const result = inventory({ signals: [s] }, { exists: defaultDetectorExists('/site', {
      directoryExists: () => false, fileExists: () => true }) });
    assert(result.detectors[0].state === 'unknown' && !result.errors.length
      && result.detectors[0].paths[0].available === true && result.detectors[0].paths[1].available === null, '混在unknownを隠した');
  }],
  ['truthy/undefinedの存在応答を補正せず拒否する', () => {
    for (const value of [undefined, 0, 1, 'true', {}, []]) {
      const result = inventory({ signals: [sourceSignal()] }, { exists: () => value });
      assert(result.detectors[0].state === 'invalid' && result.errors.length === 1, '型不正を成功/nullに丸めた');
    }
  }],
  ['IO例外はaudit失敗だがavailabilityはunknownで本文を漏らさない', () => {
    const result = inventory({ signals: [sourceSignal()] }, { exists: () => { throw new Error('private'); } });
    assert(result.errors.length === 1 && result.detectors[0].state === 'unknown'
      && result.detectors[0].paths[0].available === null && !result.errors[0].includes('private'), 'IO欠測を欠落/存在にした');
  }],
  ['不正pathや複合宣言はfilesystem照合前に拒否する', () => {
    for (const detector of ['/absolute', '../simplememo-api', '../simplememo-api/../secret', '../../secret',
      '../other-repo/file', 'scripts/x / ', 'scripts/x / / scripts/y', 'scripts/x / scripts/x', 'scripts\\x']) {
      let calls = 0; const result = inventory({ signals: [{ ...sourceSignal(), detector }] },
        { exists: () => { calls++; return true; } });
      assert(result.errors.length === 1 && result.detectors[0].state === 'invalid' && calls === 0, '不正pathを照合/通過した');
    }
  }],
  ['障害種別のunknown/missing/verified/未登録と元宣言union/cohortを保つ', () => {
    const s = sourceSignal(); const cases = [['verified', true], ['unknown', null], ['missing', false]];
    const ledger = { signals: cases.map(([id]) => ({ ...s, id, detector: `scripts/${id}.mjs`, covers_failure_class: [id] })) };
    const runs = { runs: [{ failure_class: 'verified' }, { failure_class: 'unknown' }, { failure_class: 'unknown' },
      { failure_class: 'missing' }, { failure_class: 'unregistered' }] }; const before = JSON.stringify({ ledger, runs });
    const result = inventory(ledger, { exists: p => cases.find(([id]) => p === `scripts/${id}.mjs`)[1] });
    const classes = failureClassAvailability(ledger, runs, result.detectors);
    assert(JSON.stringify(uncoveredFailures(ledger, runs)) === JSON.stringify([{ failure_class: 'unregistered', count: 1 }]), '元2引数unionが違う');
    assert(classes.map(c => c.state).join() === 'verified,unknown,missing,unregistered' && classes[1].count === 2
      && classes.every(c => c.actual_detection === null) && JSON.stringify({ ledger, runs }) === before, 'cohort/NULLが違う');
  }],
  ['障害の代替unknown登録をmissingだけで未監視と断言しない', () => {
    const s = sourceSignal(); const ledger = { signals: ['missing', 'unknown'].map(id =>
      ({ ...s, id, detector: `scripts/${id}.mjs`, covers_failure_class: ['shared'] })) };
    const result = inventory(ledger, { exists: p => p.includes('missing') ? false : null });
    const [failure] = failureClassAvailability(ledger, { runs: [{ failure_class: 'shared' }] }, result.detectors);
    assert(failure.state === 'unknown' && result.errors.length === 1 && failure.signals.length === 2
      && failure.actual_detection === null, 'unknownの代替経路を消した');
  }],
];
const SCENARIOS = [
  ...ledgerScenarios(
    () => readJSON(ROOT, 'data/monitoring-coverage.json'),
    (d) => audit(d),
    SELFTEST_BREAKAGES,
  ),
  ...STATIC_SCENARIOS,
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const doc = readJSON(ROOT, 'data/monitoring-coverage.json');
  const runs = readJSON(ROOT, 'data/autopilot-runs.json');
  const snapshot = inventory(doc);
  const errors = snapshot.errors;
  const uncovered = uncoveredFailures(doc, runs); // Original declaration-only contract.
  const staticFailures = failureClassAvailability(doc, runs, snapshot.detectors);
  const byState = Object.fromEntries(['verified', 'missing', 'unknown', 'invalid', 'not_applicable']
    .map(state => [state, snapshot.detectors.filter(d => d.state === state).length]));

  const by = Object.fromEntries(LEVELS.map((l) => [l, doc.signals.filter((s) => s.detection === l)]));

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      total: doc.signals.length,
      by_level: Object.fromEntries(LEVELS.map((l) => [l, by[l].length])),
      uncovered_failure_classes: uncovered,
      errors,
      coverage_basis: 'declared_registration_only',
      detector_availability: { basis: 'static_files_only', by_state: byState, signals: snapshot.detectors },
      failure_class_static_availability: staticFailures,
      runtime_detection_verified: null,
    }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`統合監視 — ${doc.signals.length}系統\n`);
  for (const level of LEVELS) {
    if (!by[level].length) continue;
    console.log(`  [${LABEL[level]}] ${by[level].length}系統`);
    for (const s of by[level]) {
      console.log(`    ${s.domain} — ${s.watches}`);
      if (s.detector) {
        const observation = snapshot.detectors.find(d => d.id === s.id);
        console.log(`        ${s.detector}（${s.cadence}） — static: ${observation.state}`);
      }
      if (level === 'none' || level === 'human') console.log(`        ${s.note}`);
    }
    console.log('');
  }

  const blind = by.none.length + by.human.length;
  console.log(`  宣言分類上、human/none は ${blind} 系統。`);
  console.log(`  この実行の検知器ファイル: verified ${byState.verified} / missing ${byState.missing}`
    + ` / unknown ${byState.unknown} / invalid ${byState.invalid}。`);
  console.log('  static verified はファイル存在確認のみ。監視の実稼働・障害検知成功は未確認。');
  console.log('  検知の中央値2.1hに対し最大50.7h — その差はここで起きている。\n');

  if (uncovered.length) {
    console.log('  自動検知経路の登録が無い障害種別（元の宣言union）:');
    for (const u of uncovered) console.log(`    ${u.failure_class}（${u.count}回）`);
    console.log('    登録の欠測であり、未確認siblingの実装欠落を意味しない。\n');
  }

  console.log('  実際に起きた障害種別のstatic availability:');
  for (const f of staticFailures) console.log(`    ${f.failure_class}（${f.count}回） — ${f.state}`);
  errors.forEach((e) => console.log(`  NG: ${e}`));

  if (argv.includes('--check')) {
    if (errors.length) {
      console.error(`監視台帳の検査に失敗: ${errors.length}件`);
      process.exit(1);
    }
    console.log('監視台帳の形と可視ファイル確認に問題なし（unknownは未検証。実稼働・完全coverageの証明ではない）。');
  }
}
