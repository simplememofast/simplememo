#!/usr/bin/env node
/**
 * 新モデル導入前の固定評価セット — 未評価のモデルにルーティングさせない。
 *
 *   node scripts/check-model-eval.mjs           # 状態を表示
 *   node scripts/check-model-eval.mjs --check   # CI
 *   node scripts/check-model-eval.mjs --run <model>   # 実行（APIキーが要る・未実装の入口）
 *
 * 【この検査が本当に守っていること】
 * モデルの良し悪しではない。**「評価していないモデルを、評価したことにしない」**である。
 * 替えたあとに「前より良くなった気がする」で決めるのを止めるために、
 * 入力と合格条件を先に固定し、**結果が無いことを空配列として持つ。**
 *
 * policy.enforce が true のとき、model-routing.json が評価結果の無いモデルを
 * 指しているだけでCIが落ちる。いまは false —
 * **評価をまだ一度も走らせていないので、true にすると現行の2モデルで即落ちる。**
 * これは credential-expiry.json の enforce_unknown、vendor-register.json の
 * enforce_unreviewed と同じ扱いで、**「準備はできたが、まだ守らせていない」**を
 * 隠さずフラグとして持つ。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EVAL_PATH = path.join(ROOT, 'data/model-eval-set.json');
const ROUTING_PATH = path.join(ROOT, 'data/model-routing.json');

export const LABELS = ['app_regression', 'test_defect', 'environment_flake', 'infrastructure', 'insufficient_evidence'];

export function validate(evalDoc, routing) {
  const problems = [];
  const ids = new Set();
  for (const c of evalDoc.cases || []) {
    const at = `case ${c.id || '(id無し)'}`;
    if (!c.id) problems.push('id の無いケースがある');
    else if (ids.has(c.id)) problems.push(`${at}: id が重複`);
    else ids.add(c.id);
    if (!c.input) problems.push(`${at}: input が無い`);
    if (!LABELS.includes(c.expect)) problems.push(`${at}: expect が ${LABELS.join('/')} のいずれかで要る`);
    if (!c.why) problems.push(`${at}: why が無い — なぜその正解なのかが残らない`);
  }
  if ((evalDoc.cases || []).length < 4) problems.push('ケースが4件未満 — 合格率に意味が出ない');

  for (const id of evalDoc.policy?.must_pass_ids || []) {
    if (!ids.has(id)) problems.push(`policy.must_pass_ids の "${id}" がケースに無い`);
  }
  const th = evalDoc.policy?.pass_threshold;
  if (typeof th !== 'number' || th <= 0 || th > 1) problems.push('policy.pass_threshold は 0<x<=1 の数');

  // 記録は「どの版のセットで測ったか」を持たないと、セットを変えた瞬間に無効になる
  for (const r of evalDoc.results || []) {
    if (!r.model) problems.push('results に model の無い行がある');
    if (!r.set_version) problems.push(`results ${r.model}: set_version が無い`);
    if (r.set_version && r.set_version !== evalDoc.version) {
      problems.push(`results ${r.model}: set_version ${r.set_version} が現在の版 ${evalDoc.version} と違う（測り直しが要る）`);
    }
  }

  // **未評価のモデルにルーティングできない。**enforce が false のときは報告だけ。
  const evaluated = new Map((evalDoc.results || []).map((r) => [r.model, r]));
  const routed = new Set();
  for (const rule of Object.values(routing?.rules || {})) {
    if (rule.model) routed.add(rule.model);
    if (rule.fallback) routed.add(rule.fallback);
  }
  const unevaluated = [...routed].filter((m) => !evaluated.has(m));
  const failing = [...routed].filter((m) => {
    const r = evaluated.get(m);
    if (!r) return false;
    return r.score < th || r.must_pass_ok === false;
  });
  if (evalDoc.policy?.enforce) {
    for (const m of unevaluated) problems.push(`${m} は評価結果が無いのにルーティングされている`);
    for (const m of failing) problems.push(`${m} は合格条件を満たしていないのにルーティングされている`);
  }
  return { problems, routed: [...routed], unevaluated, failing, evaluated };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--run')) {
    console.error('--run は未実装。**APIキーを使う実行はこのCIでは回さない**（費用が発生し、');
    console.error('結果が実行環境に依存するため）。オーナーのセッションで回して results に追記する。');
    console.error('追記の形: { model, set_version, ran_at, score, must_pass_ok, per_case }');
    process.exit(2);
  }
  const evalDoc = JSON.parse(fs.readFileSync(EVAL_PATH, 'utf8'));
  const routing = JSON.parse(fs.readFileSync(ROUTING_PATH, 'utf8'));
  const { problems, routed, unevaluated, failing, evaluated } = validate(evalDoc, routing);

  console.log(`固定評価セット v${evalDoc.version} — ${evalDoc.cases.length}ケース`);
  console.log(`  合格ライン ${(evalDoc.policy.pass_threshold * 100).toFixed(0)}%`
    + ` ／ 必須通過 ${evalDoc.policy.must_pass_ids.length}件（「分からない」と答えられること）\n`);
  console.log(`  ルーティング対象 ${routed.length}モデル:`);
  for (const m of routed) {
    const r = evaluated.get(m);
    console.log(`    ${m}  ${r ? `${(r.score * 100).toFixed(0)}%（${r.ran_at}）` : '**未評価**'}`);
  }
  if (unevaluated.length) {
    console.log(`\n  ⚠ 未評価 ${unevaluated.length}モデル。`
      + `policy.enforce=${evalDoc.policy.enforce ? 'true' : 'false'} なので`
      + `${evalDoc.policy.enforce ? 'CIが落ちる' : '**いまは報告だけ**'}。`);
    console.log('    評価を1回走らせてから enforce を true にする。');
    console.log('    **「セットは在る」と「評価した」は別物**なので、ここは空のまま持つ。');
  }
  if (failing.length) console.log(`\n  ⚠ 合格していないモデル: ${failing.join(', ')}`);
  if (problems.length) {
    console.error('\n固定評価セット: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('\n評価セットの形に問題なし。');
}
