#!/usr/bin/env node
/**
 * 主張と、それが指しているものの対（つい）を数え上げる。
 *
 *   node scripts/check-claims.mjs          # 一覧
 *   node scripts/check-claims.mjs --check  # CI
 *   node scripts/check-claims.mjs --gaps   # **見ていない対だけ**
 *
 * 【なぜ作るか — 2026-08-25 に3件出た誤りの共通形】
 *   ① 台帳の証跡 → 隣リポジトリのファイル   … 存在を見ていなかった
 *   ② 復旧手順書 → プラットフォームの実機能 … 見にいかなかった
 *   ③ 保持台帳   → 本番のスキーマ           … migrations しか見ていなかった
 *
 * **3件とも「書いてあること」と「それが指しているもの」が別の場所にあり、
 * 突き合わせていなかった。**深い洞察で出たものは一件も無く、開いて比べただけ。
 *
 * 【一件ずつ潰さない】
 * 個別に塞いでも、次の台帳でまた空く。このリポジトリは台帳が増え続ける
 * （2026-08-25 の1日で12個）。**台帳が増えるたびに対が増え、新しい対は
 * 既定で誰も見ていない。**だから `data/*.json` を数え上げて、
 * 対が登録されていないものを落とす。ここが生成的な部分。
 *
 * 【この検査が落とすもの】
 *   - `data/*.json` に対が1つも無い（新しい台帳を足したのに登録していない）
 *   - covered:false なのに why_uncovered が無い（**見ていない理由を書かせる**）
 *   - checked_by が実在しないファイルを指している
 *   - direction が未定義の値
 *
 * 【落とさないもの】
 * **covered:false そのものでは落とさない。**機械では見られない対がある
 * （人が実際に承認したか、プラットフォームが既に持っていないか、など）。
 * 無理に covered にするほうが危ない。**禁じているのは「見ていないのに、
 * 見ているつもりでいること」。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAIRS_PATH = path.join(ROOT, 'data/claim-referent.json');
const DATA_DIR = path.join(ROOT, 'data');

export const DIRECTIONS = ['claim_to_referent', 'referent_to_claim', 'both'];

/** `checked_by` に書いたコマンドから、実在を確かめられるファイルを拾う。 */
export function scriptsIn(cmd) {
  if (!cmd) return [];
  return cmd.split(/\s+/).filter((t) => /\.(mjs|js|py|ts)$/.test(t));
}

export function validate(doc, { ledgers = [], exists = (p) => fs.existsSync(path.join(ROOT, p)) } = {}) {
  const problems = [];
  const pairs = doc.pairs ?? [];
  if (!pairs.length) return ['pairs が空'];

  const ids = new Set();
  for (const p of pairs) {
    const at = `pairs「${p.id ?? '?'}」`;
    if (!p.id) problems.push(`${at}: id が無い`);
    if (ids.has(p.id)) problems.push(`${at}: id が重複している`);
    ids.add(p.id);
    if (!p.claim) problems.push(`${at}: claim が無い`);
    if (!p.referent) problems.push(`${at}: referent が無い`);
    if (!DIRECTIONS.includes(p.direction)) {
      problems.push(`${at}: direction が未定義の値（${DIRECTIONS.join(' | ')}）`);
    }
    // **見ていない理由を書かせる。**空欄と「原理的に無理」は違う。
    if (p.covered === false && !p.why_uncovered) {
      problems.push(`${at}: covered:false なのに why_uncovered が無い`
        + ' — **「まだやっていない」と「原理的に無理」を区別する**');
    }
    if (p.covered === true && !p.checked_by) {
      problems.push(`${at}: covered:true なのに checked_by が無い`);
    }
    // 隣のリポジトリで走る検査は `repo` を持つ。**居場所を書かせる** —
    // 書かないと「このリポジトリに無い」で落ち、面倒だから対ごと消す方へ流れる。
    const base = p.repo ? `../${p.repo}/` : '';
    for (const s of scriptsIn(p.checked_by)) {
      if (!exists(base + s)) problems.push(`${at}: checked_by の "${base}${s}" が存在しない`);
    }
  }

  // **ここが生成的な部分。**新しい台帳を足したのに対を登録していなければ落とす。
  const exempt = doc.exempt_sources ?? {};
  const mentioned = JSON.stringify(pairs);
  for (const f of ledgers) {
    if (f in exempt) {
      if (!exempt[f]) problems.push(`exempt_sources「${f}」に理由が無い`);
      continue;
    }
    if (!mentioned.includes(f)) {
      problems.push(`data/${f} を指す対が1つも無い`
        + ' — **新しい台帳は、既定で誰も見ていない。**'
        + '何を指しているのかを claim-referent.json に書くか、理由つきで exempt_sources へ');
    }
  }
  return problems;
}

export function ledgerFiles() {
  return fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).sort();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const doc = JSON.parse(fs.readFileSync(PAIRS_PATH, 'utf8'));
  const ledgers = ledgerFiles().filter((f) => f !== 'claim-referent.json');
  const problems = validate(doc, { ledgers });

  const pairs = doc.pairs ?? [];
  const covered = pairs.filter((p) => p.covered === true);
  const gaps = pairs.filter((p) => p.covered !== true);
  const found = pairs.filter((p) => p.found_here);

  console.log('主張と、それが指しているものの対\n');
  console.log(`  対 ${pairs.length}件 / 突き合わせている ${covered.length}件`
    + ` / **見ていない ${gaps.length}件**`);
  console.log(`  台帳 ${ledgers.length}件（うち対象外 ${Object.keys(doc.exempt_sources ?? {}).length}件）\n`);

  if (argv.includes('--gaps') || !argv.includes('--check')) {
    console.log('  **見ていない対**（ここから次の誤りが出る）\n');
    for (const p of gaps) {
      console.log(`    ${p.id}`);
      console.log(`      ${p.claim}`);
      console.log(`        → ${p.referent}`);
      console.log(`      ${p.why_uncovered}\n`);
    }
  }

  if (found.length && !argv.includes('--gaps')) {
    console.log(`  **実際に誤りが出た対 ${found.length}件**（塞いだ順）:`);
    for (const p of found) console.log(`    ${p.found_here}  ${p.id}`);
    console.log('');
  }

  if (!argv.includes('--check')) {
    console.log('  **covered:false では落とさない。**機械では見られない対がある。');
    console.log('  禁じているのは「見ていないのに、見ているつもりでいること」。');
  }

  if (problems.length) {
    console.error(`\n対の棚卸し: 問題 ${problems.length}件`);
    for (const p of problems) console.error(`  - ${p}`);
    if (argv.includes('--check')) process.exit(1);
  } else {
    console.log('\n対の棚卸し: OK');
  }
}
