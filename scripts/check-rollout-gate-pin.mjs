#!/usr/bin/env node
/**
 * **段階公開のゲートが変わったことを、変えたPRの中で気づかせる。**
 *
 *   node scripts/check-rollout-gate-pin.mjs           # 表示
 *   node scripts/check-rollout-gate-pin.mjs --check   # CI
 *   node scripts/check-rollout-gate-pin.mjs --selftest
 *
 * 【レビュー返信でやったことを、そのまま段階公開にも当てる】
 * 判断は公開側（scripts/check-rollout-promotion.mjs）、実行は非公開側
 * （simplememo-api の Rollout Promote ワークフロー。管理トークンがあちらにしかない）。
 * あちらは留めた指紋と実物が違えば**本番に書かずに落ちる。**
 *
 * **そして、このリポジトリの `claude/` ブランチは CI が緑なら自動マージされる。**
 * ゲートを直したPRがそのまま main へ入り、次の cron が新しいゲートを
 * 人の目を通さずに実行しうる —— レビュー返信のときは「翌朝まで気づかない」だったが、
 * こちらは「気づかないうちに実行される」向きなので、より効く。
 *
 * 仕掛けはあちらの指紋照合。**この検査は鳴子で、同じPRの中で赤くするためだけにある。**
 * 実装は check-review-gate-pin.mjs と共有する（importClosure / sha12 / drift）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importClosure, sha12, drift } from './check-review-gate-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PIN_PATH = path.join(ROOT, 'data/rollout-gate-pin.json');
export const ENTRY = 'scripts/check-rollout-promotion.mjs';
/** 実際に止めている側（非公開）。**両方に同じ値を書かないと、こちらだけ緑になる。** */
export const MIRROR = 'simplememo-api/data/rollout-gate-pin.json';

export function howToFix(actual, pin) {
  return [
    '',
    '**直し方 — 2か所に同じ値を書く。**片方だけだと、こちらは緑であちらが止まる。',
    '',
    `  1. ${path.relative(ROOT, PIN_PATH)}（このリポジトリ）`,
    `  2. ${MIRROR}（**トークンを持っている側。実際に本番へ書くのを止めているのはこちら**）`,
    '',
    '     "files": ' + JSON.stringify(actual, null, 7).replace(/\n/g, '\n     '),
    '',
    `  前回留めたのは ${pin.reviewed_at ?? '(不明)'}（${pin.reviewed_note ?? '注記なし'}）。`,
    '  **指紋だけ貼り替えるなら、この仕組みは何もしていない。**差分を読んでから書くこと。',
  ].join('\n');
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };

  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };
  const { files, missing } = importClosure(ENTRY, { read });

  t('留める対象が実在する', missing.length === 0 && files.includes(ENTRY));
  t('**判定の依存を辿れている**（selftest 用の共通実装も閉包に入る）',
    files.includes('scripts/lib/selftest.mjs'));

  const pin = JSON.parse(read(path.relative(ROOT, PIN_PATH)));
  const actual = Object.fromEntries(files.map((f) => [f, sha12(read(f))]));
  t('実データの指紋が一致している', drift(pin.files || {}, actual).length === 0);
  t('**ゲートを1文字直したら鳴る**',
    drift(pin.files || {}, { ...actual, [ENTRY]: '000000000000' })[0].includes('変わった'));
  t('**留めていない依存が増えたら鳴る**',
    drift(pin.files || {}, { ...actual, 'scripts/x.mjs': '000000000000' })[0].includes('増えた'));
  t('依存が消えても鳴る', drift(pin.files || {}, {})[0].includes('消えた'));
  t('直し方が両方の台帳を名指しする', (() => {
    const f = howToFix(actual, pin);
    return f.includes('rollout-gate-pin.json') && f.includes(MIRROR);
  })());
  t('**留め先が実行側と同じファイル名を指している**（写し違いを固定）',
    pin.mirror === MIRROR && pin.entry === ENTRY);

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const pin = JSON.parse(fs.readFileSync(PIN_PATH, 'utf8'));
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };
  const { files, missing } = importClosure(ENTRY, { read });

  if (missing.length) {
    console.error(`ゲートの依存が読めない: ${missing.join(' / ')}`);
    process.exit(1);
  }

  const actual = Object.fromEntries(files.map((f) => [f, sha12(read(f))]));
  const problems = drift(pin.files || {}, actual);

  console.log(`段階公開のゲート — ${files.length}ファイル（留め ${pin.reviewed_at}）`);
  for (const f of files) console.log(`  ${actual[f]}  ${f}`);

  if (problems.length) {
    console.error('\n**ゲートが変わっている。**このまま main へ入ると、'
      + '実行側は**本番に書かずに落ちる**（止まる方向だが、止まったことに誰も気づかない）:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error(howToFix(actual, pin));
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n留めた指紋と一致。実行側は昇格できる状態にある。');
}
