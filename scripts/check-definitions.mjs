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
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFS_PATH = path.join(ROOT, 'data/kpi-definitions.json');

export const checksum = (abs) =>
  crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);

export function validate(doc, { read = (p) => checksum(path.join(ROOT, p)), exists = (p) => fs.existsSync(path.join(ROOT, p)) } = {}) {
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
    if (!d.source_file) continue;
    if (!exists(d.source_file)) { problems.push(`${at}: source_file "${d.source_file}" が存在しない`); continue; }
    const now = read(d.source_file);
    if (d.checksum !== now) drifted.push({ ...d, now });
  }
  for (const d of drifted) {
    problems.push(`${at_(d)}: 計算元 ${d.source_file} が変わっている（${d.checksum} → ${d.now}）`
      + ' — **定義を変えたなら version を上げて changed_at と why を書く。**'
      + ' 変えていないなら `--bump` で checksum だけ更新し、why に「定義は変えていない」と書く');
  }
  return { problems, drifted };
  function at_(d) { return `definitions「${d.id}」`; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const doc = JSON.parse(fs.readFileSync(DEFS_PATH, 'utf8'));

  const bi = argv.indexOf('--bump');
  if (bi >= 0) {
    const id = argv[bi + 1];
    const wi = argv.indexOf('--why');
    const why = wi >= 0 ? argv[wi + 1] : null;
    if (!why) { console.error('--why が要る。**理由の無い定義変更を通さない**'); process.exit(2); }
    const d = doc.definitions.find((x) => x.id === id);
    if (!d) { console.error(`未知の id: ${id}`); process.exit(2); }
    d.version += 1;
    d.checksum = checksum(path.join(ROOT, d.source_file));
    d.changed_at = new Date().toISOString().slice(0, 10);
    d.history = d.history || [];
    d.history.push({ version: d.version, at: d.changed_at, why });
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
