#!/usr/bin/env node
/**
 * レーンF（自己修復） — 未修理の故障が残っているかを判定する。
 *
 *   node scripts/autopilot-selfheal.mjs          # 判定と、直すなら何を直すか
 *   node scripts/autopilot-selfheal.mjs --json   # 機械可読
 *   node scripts/autopilot-selfheal.mjs --check  # CI: 台帳と権限表の整合（未修理があっても落とさない）
 *
 * 【なぜこれを作るか】
 * 実測（2026-08-11〜08-22）では、人間の介入7件のうち**4件が基盤の修理**だった。
 * ところがその修理を書いたのは**すべてAIセッション**で、人間がやったのは
 * 「壊れていることに気づいて、直せと言うこと」だけ。
 * **足りなかったのは能力ではなく起動条件。** だからこのスクリプトは
 * 「検知したら、人の指示を待たずにその日の最優先を修理にする」ための判定だけを持つ。
 *
 * 【一番危ない失敗モード】
 * 自分のCIを自分で直す仕組みは、放っておくと必ず
 * **「通らないチェックを消して緑にする」**に流れる。だから:
 *   - 触ってよいファイルは権限表の self_repair.may_modify に限定
 *   - やってはいけない変更は must_not に明記（検証の弱体化・権限の拡大）
 *   - required_ci_checks の実在は scripts/check-authority.mjs がCIで検証するので、
 *     修理PRがチェックを1つでも消すと落ちる
 *   - 同じ failure_class を stop_after_failed_repairs 回直しても再発するなら、
 *     **修理をやめて人間に上げる**（直せないものを毎日直そうとするのが
 *     一番たちの悪い無限ループ）
 *
 * 【このスクリプトがやらないこと】
 * 修理そのもの。ここが出すのは「今日レーンFに入るべきか」「対象はどれか」
 * 「何をしてはいけないか」だけで、原因の特定と実装はセッションが行う。
 * 判定と実装を同じスクリプトに入れると、判定側を都合よく変えられるようになる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
const MATRIX_PATH = path.join(ROOT, 'data/authority-matrix.json');

const FAILED = new Set(['no_artifact', 'failed', 'cancelled', 'no_run']);

/**
 * 未修理の故障を求める。
 *
 * 「修理済み」の定義は **repair_of で名指しされていること**。
 * 「あとで同じ経路が成功したから直った」とは扱わない —— 主系は
 * 秘密鍵未設定で毎日 success を返していた前例があり、
 * 「成功した」を回復の証拠にすると壊れたまま緑に見える。
 */
export function analyze(runsDoc, matrix) {
  const runs = runsDoc.runs;
  const repaired = new Set(runs.flatMap((r) => r.repair_of || []));
  const failures = runs.filter((r) => FAILED.has(r.outcome));
  const unrepaired = failures.filter((r) => !repaired.has(r.run_id));

  // 同じ failure_class を何回直したかを数える。再発の回数ではなく
  // **修理を試みた回数**を数える（直らない修理を繰り返すのを止めたいので）。
  const repairAttempts = {};
  for (const r of runs) {
    for (const targetId of r.repair_of || []) {
      const target = runs.find((x) => x.run_id === targetId);
      const cls = target?.failure_class || 'unknown';
      repairAttempts[cls] = (repairAttempts[cls] || 0) + 1;
    }
  }

  const sr = matrix.self_repair || {};
  const limit = sr.stop_after_failed_repairs ?? 3;

  const targets = unrepaired.map((r) => {
    const cls = r.failure_class || 'unknown';
    const tried = repairAttempts[cls] || 0;
    return {
      run_id: r.run_id, date_jst: r.date_jst, route: r.route,
      outcome: r.outcome, failure_class: cls,
      failure_reason: r.failure_reason,
      repair_attempts_for_class: tried,
      // 上限に達した種別は**直さない**。人に上げる。
      escalate: tried >= limit,
    };
  });

  const actionable = targets.filter((t) => !t.escalate);
  return {
    lane_f_required: actionable.length > 0,
    unrepaired_count: unrepaired.length,
    targets,
    escalate: targets.filter((t) => t.escalate),
    limit,
    may_modify: sr.may_modify || [],
    must_not: sr.must_not || [],
  };
}

/** 権限表と台帳の整合。self_repair の境界が壊れていないかを見る。 */
export function validate(runsDoc, matrix) {
  const problems = [];
  const sr = matrix.self_repair;
  if (!sr) return ['authority-matrix.json に self_repair が無い — レーンFの境界が定義されていない'];
  if (!Array.isArray(sr.may_modify) || sr.may_modify.length === 0) {
    problems.push('self_repair.may_modify が空 — 触ってよい範囲が無いなら自己修復は成立しない');
  }
  if (!Array.isArray(sr.must_not) || sr.must_not.length === 0) {
    problems.push('self_repair.must_not が空 — 「検証を弱めない」「権限を広げない」は必ず書く');
  }
  if (typeof sr.stop_after_failed_repairs !== 'number' || sr.stop_after_failed_repairs < 1) {
    problems.push('self_repair.stop_after_failed_repairs は1以上の数値が要る — 停止条件の無い自己修復は無限ループになる');
  }
  // 権限表で human_only の領域を may_modify が含んでいないこと
  const humanOnlyEvidence = new Set(
    (matrix.domains || []).filter((d) => d.requires_approval).flatMap((d) => d.evidence || []));
  for (const f of sr.may_modify || []) {
    if (humanOnlyEvidence.has(f)) {
      problems.push(`self_repair.may_modify に承認制領域の根拠ファイル "${f}" が入っている — 自己修復が承認境界を越える`);
    }
  }
  // 修理対象として名指しされた run_id が実在すること
  const ids = new Set(runsDoc.runs.map((r) => r.run_id));
  for (const r of runsDoc.runs) {
    for (const t of r.repair_of || []) {
      if (!ids.has(t)) problems.push(`${r.run_id}: repair_of "${t}" が台帳に無い`);
      if (t === r.run_id) problems.push(`${r.run_id}: 自分自身を repair_of にしている`);
    }
  }
  // 失敗しているのに failure_class が無い行は、再発を数えられない
  for (const r of runsDoc.runs) {
    if (FAILED.has(r.outcome) && !r.failure_class) {
      problems.push(`${r.run_id}: outcome=${r.outcome} なのに failure_class が無い — 「前と同じ故障か」を判定できない`);
    }
  }
  return problems;
}

// --- CLI ---------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const runsDoc = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  const problems = validate(runsDoc, matrix);
  const a = analyze(runsDoc, matrix);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...a, problems }, null, 2));
    process.exit(problems.length ? 1 : 0);
  }

  if (a.lane_f_required) {
    console.log('レーンF（自己修復）: **今日の最優先アクションはこれ**');
  } else if (a.escalate.length) {
    console.log('レーンF（自己修復）: 対象なし（ただし人に上げるべき故障がある）');
  } else {
    console.log('レーンF（自己修復）: 未修理の故障なし。通常のレーンA〜Eへ');
  }
  console.log('');
  for (const t of a.targets) {
    const mark = t.escalate ? '⛔ 人に上げる' : '🔧 修理対象';
    console.log(`  ${mark}  ${t.run_id}  [${t.failure_class}]  ${t.outcome}`);
    if (t.failure_reason) console.log(`      ${t.failure_reason}`);
    if (t.escalate) {
      console.log(`      同種の故障を ${t.repair_attempts_for_class} 回修理して再発している（上限 ${a.limit}）。`);
      console.log('      **これ以上直さない。** 直せないものを毎日直そうとするのが一番たちの悪いループ。');
    }
  }
  if (a.lane_f_required) {
    console.log('');
    console.log('  触ってよいファイル:');
    for (const f of a.may_modify) console.log(`    - ${f}`);
    console.log('');
    console.log('  やってはいけない変更:');
    for (const f of a.must_not) console.log(`    ✗ ${f}`);
    console.log('');
    console.log('  修理したら data/autopilot-runs.json の自分の行に repair_of を書く。');
    console.log('  書かない限り、その故障は翌日も「未修理」として上がってくる。');
  }
  if (problems.length) {
    console.error('\n自己修復の境界に不整合:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n自己修復の境界に問題なし。');
}
