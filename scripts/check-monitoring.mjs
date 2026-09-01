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
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { readJSON } from './lib/read-json.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const LEVELS = ['automatic', 'derived', 'human', 'none'];
const LABEL = { automatic: '機械が検知', derived: '記録から分かる', human: '人が見て気づく', none: '**気づく経路が無い**' };

export function audit(doc, { exists = (p) => fs.existsSync(path.join(ROOT, p)) } = {}) {
  const errors = [];
  for (const s of doc.signals) {
    if (!LEVELS.includes(s.detection)) errors.push(`${s.id}: detection が未定義の値: ${s.detection}`);
    // 検知器があると書いたなら、そのファイルが実在すること。
    if (s.detection === 'automatic' || s.detection === 'derived') {
      if (!s.detector) errors.push(`${s.id}: ${s.detection} なのに detector が空`);
      else if (!s.detector.startsWith('..') && !exists(s.detector)) {
        errors.push(`${s.id}: detector が実在しない: ${s.detector}`);
      }
      if (!s.cadence) errors.push(`${s.id}: 頻度が書いていない`);
    }
    // 空いていること自体は問題ではない。**理由が書いていないのが問題。**
    if (s.detection === 'none' && !s.note) errors.push(`${s.id}: 経路が無い理由が書いていない`);
  }
  return errors;
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


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**検知手段が実在しない**のは落ちる', (d) => { d.signals[0].detector = 'scripts/そんな検知器は無い.mjs'; }],
  ['知らない detection は落ちる', (d) => { d.signals[0].detection = 'なんとなく気づく'; }],
  ['**頻度が書いていない**のは落ちる（いつ見るか決まっていない監視は見ない）', (d) => { delete d.signals[0].cadence; }],
];
const SCENARIOS = ledgerScenarios(
  () => readJSON(ROOT, 'data/monitoring-coverage.json'),
  (d) => audit(d),
  SELFTEST_BREAKAGES,
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const doc = readJSON(ROOT, 'data/monitoring-coverage.json');
  const runs = readJSON(ROOT, 'data/autopilot-runs.json');
  const errors = audit(doc);
  const uncovered = uncoveredFailures(doc, runs);

  const by = Object.fromEntries(LEVELS.map((l) => [l, doc.signals.filter((s) => s.detection === l)]));

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      total: doc.signals.length,
      by_level: Object.fromEntries(LEVELS.map((l) => [l, by[l].length])),
      uncovered_failure_classes: uncovered,
      errors,
    }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`統合監視 — ${doc.signals.length}系統\n`);
  for (const level of LEVELS) {
    if (!by[level].length) continue;
    console.log(`  [${LABEL[level]}] ${by[level].length}系統`);
    for (const s of by[level]) {
      console.log(`    ${s.domain} — ${s.watches}`);
      if (s.detector) console.log(`        ${s.detector}（${s.cadence}）`);
      if (level === 'none' || level === 'human') console.log(`        ${s.note}`);
    }
    console.log('');
  }

  const blind = by.none.length + by.human.length;
  console.log(`  **${blind}系統が機械では検知できない。**`);
  console.log('  検知の中央値2.1hに対し最大50.7h — その差はここで起きている。\n');

  if (uncovered.length) {
    console.log('  実際に起きたのに、機械が検知する経路が無い障害種別:');
    for (const u of uncovered) console.log(`    ${u.failure_class}（${u.count}回）`);
    console.log('    **起きた実績があるので、次も起きる。**\n');
  }

  errors.forEach((e) => console.log(`  NG: ${e}`));

  if (argv.includes('--check')) {
    if (errors.length) {
      console.error(`監視台帳の検査に失敗: ${errors.length}件`);
      process.exit(1);
    }
    console.log('監視台帳の形に問題なし（空いている系統の数は上に出ている。ゼロではない）。');
  }
}
