#!/usr/bin/env node
/**
 * ASC の課金データが**実際に降りたか**だけを見る。
 *
 *   node scripts/check-asc-landed.mjs   # 降りていれば exit 0、まだなら exit 1
 *
 * 【なぜ別に立てるか】
 * これは CI の検査ではなく、**アクション台帳の閉じ条件**（autopilot-act の
 * script_ok）として使う。2026-08-25 に取得側の欠陥2件を直したが、
 * **「直した」と「降りた」は別のこと。**次の定時実行が回るまで結果は分からない。
 *
 * このリポジトリの規律に合わせて、閉じ条件を「変えた」ではなく
 * **「効いた」**に置く（scripts/autopilot-act.mjs の cost 系と同じ考え方）。
 *
 * 【意図的に厳しくしている点】
 * `state: "pending"`（Apple の生成待ち）では **閉じない。**
 * 待っている状態は「まだ降りていない」ので、正しく exit 1 になる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource } from '../growth/scripts/ingest-asc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const src = readSource();
if (!src.present) {
  console.log(`ASC: 取得結果が無い（${src.reason}）`);
  process.exit(1);
}

const state = src.status.state ?? '(state 無し=取得側が旧版)';
const withRows = (src.reports || []).filter((r) => (r.row_count ?? 0) > 0);

console.log(`ASC: state=${state} / レポート ${(src.status.reports || []).length} 件 / 行のあるもの ${withRows.length} 件`);
for (const r of withRows) {
  const sums = Object.entries(r.sums || {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(' / ');
  console.log(`  ${r.report}  ${r.row_count} 行  ${sums}`);
}

if (!withRows.length) {
  console.log('\n**まだ降りていない。**「取得の仕組みを直した」と「データが降りた」は別のこと。');
  if (state === 'pending') console.log('  Apple 側の生成待ち。待てば解ける状態なので、このまま開けておく。');
  process.exit(1);
}
console.log('\n課金データが降りている。⑥売上照合・⑨解約理由分析の前提が揃った。');
process.exit(0);
