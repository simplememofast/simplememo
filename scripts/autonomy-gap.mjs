#!/usr/bin/env node
/**
 * 自律度の到達可能上限 — 「61.3% を 95% にする」が何を要求するかを機械が出す。
 *
 *   node scripts/autonomy-gap.mjs            # 現在値・上限・95%に要る譲渡の内訳
 *   node scripts/autonomy-gap.mjs --json     # 機械可読
 *   node scripts/autonomy-gap.mjs --target 95
 *   node scripts/autonomy-gap.mjs --check    # CI: 分類の網羅・登録語・算数の一致
 *   node scripts/autonomy-gap.mjs --selftest # 検査そのものの自己検査（台帳を読まない）
 *
 * 【なぜ要るか】
 * `automation-rate.mjs` は「いま何%か」を出すが、**その先に何があるかを言わない。**
 * 総合自動化率 61.3% は、放っておくと「あと 38.7% ぶん実装すれば埋まる」と読まれる。
 * 実際には、AIが実行していない 67 タスクのうち **実装量で解けるものは少数**で、
 * 残りは外部データ・鍵・検出力・そして**意図的に人へ残した境界**で止まっている。
 *
 * この差は数字を見ても分からない。**分からないまま目標値を置くと、
 * 達成する方法が「境界を渡す」しか無くなる。** それは安全装置を外すのと同じ意味で、
 * しかも数字の上では「自律度が上がった」としか見えない。
 * だからここは、**95% に届かせるには何を渡すことになるのかを、名指しで出す。**
 *
 * 【到達可能の定義】
 * reachable  … 実装・外部接続・書類の用意で AI 実行側へ動かせる
 * owner_only … **オーナーが権限表を書き換えない限り動かない**（policy_boundary）
 * never      … 物理・対人・法的責任、構造的に観測不能、検出力不足
 *
 * **owner_only と never を到達可能側に数えないこと。**
 * ここを混ぜると、この script は「頑張れば95%に行けます」と言う道具になる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERAGE_PATH, summarize } from './automation-rate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 実行していない理由の登録簿。**ここに無い値は --check が落とす。** */
export const BLOCKERS = {
  not_started:             { klass: 'reachable',  label: '着手していないだけ' },
  external_data:           { klass: 'reachable',  label: '外部データ待ち' },
  external_credential:     { klass: 'reachable',  label: '外部サービスの鍵・契約' },
  missing_source_document: { klass: 'reachable',  label: '対象の書類がリポジトリに無い' },
  approval_design_first:   { klass: 'reachable',  label: '承認境界の設計が先' },
  policy_boundary:         { klass: 'owner_only', label: '意図的に人へ残した境界' },
  physical_human:          { klass: 'never',      label: '物理・対人・法的責任' },
  human_consent:           { klass: 'never',      label: '人の同意・操作が要る（ブラウザ同意・鍵の再発行）' },
  structural:              { klass: 'never',      label: '構造的に観測できない' },
  statistical_power:       { klass: 'never',      label: '分母が足りず判定できない' },
};

const AI = new Set(['ai_autonomous', 'ai_executes_gated']);
const NON_AI = new Set(['nobody', 'ai_proposes', 'human_only']);

export function analyse(doc, { target = 0.95 } = {}) {
  const scored = doc.tasks.filter((t) => t.executor !== 'intentional_no');
  const denom = scored.length;
  const now = scored.filter((t) => AI.has(t.executor)).length;

  const bucket = { reachable: [], owner_only: [], never: [] };
  for (const t of scored) {
    if (AI.has(t.executor)) continue;
    const b = BLOCKERS[t.blocker];
    if (!b) continue; // --check が別に落とす
    bucket[b.klass].push(t);
  }

  const ceiling = now + bucket.reachable.length;
  const need = Math.ceil(target * denom);
  // 到達可能を全部埋めてなお足りないぶんは、境界を渡すことでしか埋まらない。
  const handover = Math.min(bucket.owner_only.length, Math.max(0, need - ceiling));
  // 境界を**全部**渡した場合の上限。ここを超える目標は、渡しても届かない。
  const ceilingWithHandover = ceiling + bucket.owner_only.length;
  const unreachable_by = Math.max(0, need - ceilingWithHandover);

  const byBlocker = {};
  for (const t of scored) {
    if (AI.has(t.executor)) continue;
    (byBlocker[t.blocker] ??= []).push(t);
  }

  return {
    denominator: denom,
    now,
    now_rate: now / denom,
    ceiling,
    ceiling_rate: ceiling / denom,
    ceiling_with_handover: ceilingWithHandover,
    ceiling_with_handover_rate: ceilingWithHandover / denom,
    target,
    need,
    handover_required: handover,
    unreachable_by,
    buckets: {
      reachable: bucket.reachable.length,
      owner_only: bucket.owner_only.length,
      never: bucket.never.length,
    },
    by_blocker: Object.fromEntries(
      Object.entries(byBlocker).map(([k, v]) => [k, v.length]),
    ),
    owner_only_tasks: bucket.owner_only.map((t) => ({ area: t.area, task: t.task, unblocked_by: t.unblocked_by })),
    never_tasks: bucket.never.map((t) => ({ area: t.area, task: t.task, unblocked_by: t.unblocked_by })),
    reachable_tasks: bucket.reachable.map((t) => ({
      area: t.area, task: t.task, blocker: t.blocker, unblocked_by: t.unblocked_by,
    })),
  };
}

/** 台帳を読まずに検査そのものを検査する（automation-rate.mjs / autopilot-runs.mjs と同じ作法）。 */
export function selftest() {
  const problems = [];
  const mk = (executor, blocker) => ({ area: '① 検査用', task: 't', executor, blocker, unblocked_by: 'u', evidence: [] });

  // 1. owner_only / never は到達可能側に数えない
  const a = analyse({ tasks: [mk('ai_autonomous'), mk('human_only', 'policy_boundary')] });
  if (a.ceiling !== 1) problems.push('policy_boundary を上限に数えている');
  const b = analyse({ tasks: [mk('ai_autonomous'), mk('nobody', 'physical_human')] });
  if (b.ceiling !== 1) problems.push('physical_human を上限に数えている');

  // 2. reachable は上限に数える
  const c = analyse({ tasks: [mk('ai_autonomous'), mk('nobody', 'not_started')] });
  if (c.ceiling !== 2) problems.push('not_started を上限に数えていない');

  // 3. intentional_no は分母から外れる
  const d = analyse({ tasks: [mk('ai_autonomous'), mk('intentional_no')] });
  if (d.denominator !== 1) problems.push('intentional_no を分母に入れている');

  // 4. 上限で足りるなら譲渡は0、足りないなら正の数
  const e = analyse({ tasks: [mk('ai_autonomous'), mk('nobody', 'not_started')] }, { target: 1 });
  if (e.handover_required !== 0) problems.push('上限で届くのに譲渡を要求している');
  const f = analyse({ tasks: [mk('ai_autonomous'), mk('human_only', 'policy_boundary')] }, { target: 1 });
  if (f.handover_required !== 1) problems.push('境界を渡さないと届かないことを出していない');

  // 6. **境界を全部渡しても届かない目標**を、届くように見せない
  const g = analyse({ tasks: [mk('ai_autonomous'), mk('human_only', 'policy_boundary'), mk('nobody', 'physical_human')] }, { target: 1 });
  if (g.handover_required > g.buckets.owner_only) problems.push('渡せる件数より多くの譲渡を要求している');
  if (g.unreachable_by !== 1) problems.push('渡しても届かない件数を出していない');

  // 5. 登録簿の klass は3種類だけ
  for (const [k, v] of Object.entries(BLOCKERS)) {
    if (!['reachable', 'owner_only', 'never'].includes(v.klass)) problems.push(`未知の klass: ${k}`);
  }
  return problems;
}

export function check(doc) {
  const problems = [];
  for (const t of doc.tasks) {
    if (!NON_AI.has(t.executor)) {
      if (t.blocker) problems.push(`AIが実行しているのに blocker がある: ${t.area} / ${t.task}`);
      continue;
    }
    if (!t.blocker) { problems.push(`blocker が無い: ${t.area} / ${t.task}`); continue; }
    if (!BLOCKERS[t.blocker]) problems.push(`未登録の blocker "${t.blocker}": ${t.area} / ${t.task}`);
    if (!t.unblocked_by) problems.push(`unblocked_by が無い: ${t.area} / ${t.task}`);
  }
  // 算数が automation-rate.mjs と一致すること（数字の出所を2つ作らない）
  const s = summarize(doc).overall;
  const a = analyse(doc);
  if (Math.abs(s.overall_automation_rate - a.now_rate) > 1e-9) {
    problems.push(`総合自動化率が automation-rate.mjs と一致しない: ${s.overall_automation_rate} vs ${a.now_rate}`);
  }
  if (a.ceiling < a.now) problems.push('上限が現在値を下回っている');
  return problems;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--selftest')) {
    const p = selftest();
    if (p.length) { console.error('自己検査で問題:'); for (const x of p) console.error(`  - ${x}`); process.exit(1); }
    console.log('autonomy-gap: 自己検査に問題なし。');
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const ti = argv.indexOf('--target');
  const target = ti >= 0 && argv[ti + 1] ? Number(argv[ti + 1]) / 100 : 0.95;
  const a = analyse(doc, { target });

  if (argv.includes('--check')) {
    const p = [...selftest(), ...check(doc)];
    if (p.length) { console.error('自律度ギャップ台帳に問題:'); for (const x of p) console.error(`  - ${x}`); process.exit(1); }
    console.log(`自律度ギャップ: 分類 ${a.buckets.reachable + a.buckets.owner_only + a.buckets.never} 件すべてに理由あり。算数も一致。`);
    process.exit(0);
  }

  if (argv.includes('--json')) { console.log(JSON.stringify(a, null, 2)); process.exit(0); }

  console.log(`自律度の到達可能上限（分母 ${a.denominator} タスク・意図的にやらないを除く）\n`);
  console.log(`    現在              ${a.now}/${a.denominator}  = ${pct(a.now_rate)}`);
  console.log(`    到達可能な上限    ${a.ceiling}/${a.denominator}  = ${pct(a.ceiling_rate)}   ← 実装・外部接続・書類で届く範囲`);
  console.log(`    目標 ${pct(a.target)}         ${a.need}/${a.denominator}`);
  console.log('');
  console.log(`    境界を全部渡しても  ${a.ceiling_with_handover}/${a.denominator}  = ${pct(a.ceiling_with_handover_rate)}   ← 人へ残した ${a.buckets.owner_only} 件をすべてAIに渡した場合`);
  console.log('');
  if (a.unreachable_by > 0) {
    console.log(`  **目標 ${pct(a.target)} には、意図的な境界を1件残らず渡しても ${a.unreachable_by} 件届かない。**`);
    console.log(`  残りは物理・対人・観測不能・検出力不足の ${a.buckets.never} 件で、渡しても実行できない:\n`);
    for (const t of a.never_tasks) console.log(`     ${t.area} :: ${t.task}`);
    console.log('');
    console.log(`  つまり目標値そのものが、この分母では成立しない。`);
    console.log(`  分母を変えずに達成する方法は無く、**達成したことにする方法だけがある。**`);
  } else if (a.handover_required > 0) {
    console.log(`  **到達可能なものを全部やっても ${a.need - a.ceiling} 件足りない。**`);
    console.log(`  目標に届かせるには、意図的に人へ残した ${a.buckets.owner_only} 件のうち`);
    console.log(`  **${a.handover_required} 件をAIへ渡す**ことになる。渡す候補は次のとおり:\n`);
    for (const t of a.owner_only_tasks) console.log(`     ${t.area} :: ${t.task}`);
    console.log('');
    console.log(`  物理・対人・観測不能・検出力不足の ${a.buckets.never} 件は、渡しても実行できない。`);
  } else {
    console.log(`  目標は到達可能な上限の内側にある（境界を渡す必要は無い）。`);
  }
  console.log('\n  実行していない理由の内訳:\n');
  for (const [k, v] of Object.entries(a.by_blocker).sort((x, y) => y[1] - x[1])) {
    const b = BLOCKERS[k];
    console.log(`    ${String(v).padStart(3)} 件  ${k.padEnd(24)} ${b ? b.label : '**未登録**'}  [${b ? b.klass : '?'}]`);
  }
  console.log(`\n  到達可能 ${a.buckets.reachable} / オーナー判断 ${a.buckets.owner_only} / 到達不能 ${a.buckets.never}`);
}
