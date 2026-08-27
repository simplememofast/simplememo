#!/usr/bin/env node
/**
 * **レビュー返信のゲートが変わったことを、変えたPRの中で気づかせる。**
 *
 *   node scripts/check-review-gate-pin.mjs           # 表示
 *   node scripts/check-review-gate-pin.mjs --check   # CI
 *   node scripts/check-review-gate-pin.mjs --selftest
 *
 * 【これは門ではない。鳴子である】
 * 実際に投稿を止めているのは**隣の非公開リポジトリ**にある指紋の照合
 * （simplememo-ios/data/review-reply-gate.json）。あちらは ASC の鍵を持ち、
 * 留めた指紋と実物が違えば投稿せずに落ちる。
 *
 * その仕掛けには穴が1つあった —— **留めた側と、留められた側が別のリポジトリにいる。**
 * こちらで check-review-replies.mjs を1文字直すと、あちらの指紋は黙って古くなり、
 * **翌朝の日次が落ちて初めて分かる。**実際にそうなった:
 *
 *   #659 で指紋を取る → #661 が同じファイルの表示文言を直す
 *   → 翌日の初回実行が「ゲートが留めた指紋と違う」で停止
 *
 * 止まる方向なので事故にはならない。**が、止まったことに誰も気づかない。**
 * 「厳しいほうが動かなくなっても誰も気づかない」というのは、
 * この台帳まわりで何度も書いている話で、ここでもそれが起きた。
 *
 * だからこの検査は、**同じPRの中で赤くする**ためだけにある。
 * 直し方は出力が教える（新しい指紋を両方の台帳へ書く）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PIN_PATH = path.join(ROOT, 'data/review-gate-pin.json');
export const ENTRY = 'scripts/check-review-replies.mjs';

/** 隣（Ruby 側）と同じものを拾う: import / export … from / 動的 import の相対指定。 */
export const IMPORT_RE =
  /(?:^\s*(?:import|export)\s[^'"\n]*?from\s*|^\s*import\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/gm;

export function importClosure(entry, { read }) {
  const seen = new Set();
  const missing = [];
  const walk = (rel) => {
    if (seen.has(rel)) return;
    const src = read(rel);
    if (src === null) { missing.push(rel); return; }
    seen.add(rel);
    for (const m of src.matchAll(IMPORT_RE)) {
      walk(path.normalize(path.join(path.dirname(rel), m[1])));
    }
  };
  walk(entry);
  return { files: [...seen].sort(), missing };
}

export function sha12(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/**
 * 留めた指紋と実物の差。**増えた・消えた・変わったを区別する** ——
 * 「増えた」は留めていない依存が判断に入ったということで、
 * 一番見落としたくない形。
 */
export function drift(pinned, actual) {
  const problems = [];
  for (const f of Object.keys(pinned).filter((f) => !(f in actual)).sort()) {
    problems.push(`${f} が閉包から消えた（留めた時にはあった）`);
  }
  for (const f of Object.keys(actual).filter((f) => !(f in pinned)).sort()) {
    problems.push(`${f} が増えた — **留めていない依存が公開の可否を決めている**`);
  }
  for (const f of Object.keys(pinned).filter((f) => f in actual).sort()) {
    if (pinned[f] !== actual[f]) {
      problems.push(`${f} が変わった（留め ${pinned[f]} / 実物 ${actual[f]}）`);
    }
  }
  return problems;
}

export function howToFix(actual, pin) {
  return [
    '',
    '**直し方 — 2か所に同じ値を書く。**片方だけだと、こちらは緑であちらが止まる。',
    '',
    `  1. ${path.relative(ROOT, PIN_PATH)}（このリポジトリ）`,
    `  2. simplememo-ios/data/review-reply-gate.json（**鍵を持っている側。実際に投稿を止めているのはこちら**）`,
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

  const files = {
    'a.mjs': "import b from './b.mjs';\nexport * from './lib/c.mjs';\nimport fs from 'node:fs';\n",
    'b.mjs': 'export default 1;\n',
    'lib/c.mjs': "const d = await import('./d.mjs');\nexport const c = d;\n",
    'lib/d.mjs': '// 日本語のコメント — **強調**\nexport default 2;\n',
  };
  const read = (rel) => (rel in files ? files[rel] : null);

  const c = importClosure('a.mjs', { read });
  t('相対 import を辿る', c.files.includes('b.mjs'));
  t('**export … from も依存**', c.files.includes('lib/c.mjs'));
  t('**動的 import も依存**', c.files.includes('lib/d.mjs'));
  t('node: の組み込みは辿らない', c.files.every((f) => !f.startsWith('node:')));
  t('日本語を含むファイルも辿れる', c.files.length === 4);
  t('欠けている依存は missing に出る（黙って飛ばさない）',
    importClosure('a.mjs', { read: (r) => (r === 'b.mjs' ? null : read(r)) }).missing.includes('b.mjs'));

  const pinned = { 'a.mjs': '111111111111', 'b.mjs': '222222222222' };
  t('同じなら問題なし', drift(pinned, pinned).length === 0);
  t('**中身が変わったら鳴る**',
    drift(pinned, { ...pinned, 'a.mjs': '999999999999' })[0].includes('変わった'));
  t('**依存が増えたら鳴る**（留めていないコードが判断している）',
    drift(pinned, { ...pinned, 'c.mjs': '333333333333' })[0].includes('増えた'));
  t('依存が消えても鳴る', drift(pinned, { 'a.mjs': '111111111111' })[0].includes('消えた'));
  t('sha12 は12桁', sha12('x').length === 12);
  t('中身が違えば指紋も違う', sha12('x') !== sha12('y'));

  // **この検査が守っている当のもの。**#659 で留め、#661 が同じファイルを直し、
  // 翌日の初回実行まで誰も気づかなかった。その形をそのまま固定する。
  t('**留めた後にゲートを1文字直したら鳴る**（#661 で実際に起きた形）',
    drift({ [ENTRY]: 'c7a42b1f2872' }, { [ENTRY]: '685ed8e049ec' }).length === 1);

  const fix = howToFix({ 'a.mjs': '111111111111' }, { reviewed_at: '2026-08-27' });
  t('直し方が両方の台帳を名指しする',
    fix.includes('review-gate-pin.json') && fix.includes('simplememo-ios/data/review-reply-gate.json'));

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const pin = JSON.parse(fs.readFileSync(PIN_PATH, 'utf8'));
  const read = (rel) => {
    try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
  };
  const { files, missing } = importClosure(ENTRY, { read });

  if (missing.length) {
    console.error(`ゲートの依存が読めない: ${missing.join(' / ')}`);
    process.exit(1);
  }

  const actual = Object.fromEntries(files.map((f) => [f, sha12(read(f))]));
  const problems = drift(pin.files || {}, actual);

  console.log(`レビュー返信のゲート — ${files.length}ファイル（留め ${pin.reviewed_at}）`);
  for (const f of files) console.log(`  ${actual[f]}  ${f}`);

  if (problems.length) {
    console.error('\n**ゲートが変わっている。**このまま main へ入ると、'
      + '隣の非公開リポジトリは**投稿せずに落ちる**（止まる方向だが、止まったことは翌朝まで分からない）:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error(howToFix(actual, pin));
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n留めた指紋と一致。隣は投稿できる状態にある。');
}
