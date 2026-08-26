#!/usr/bin/env node
/**
 * モデルルーター — タスク種別ごとに使うモデルを決め、逸脱をCIが落とす。
 *
 *   node scripts/check-model-routing.mjs                 # 表示
 *   node scripts/check-model-routing.mjs --check         # CI
 *   node scripts/check-model-routing.mjs --resolve pr    # そのタスクのモデル名だけ出す
 *   node scripts/check-model-routing.mjs --resolve pr --unavailable claude-opus-5
 *
 * 【なぜ表ではなくルーターなのか】
 * 「どのモデルを使うか」を人が毎回決めているうちは、費用も品質も再現しない。
 * **ワークフローがこのファイルを引いて --model に渡すところまで**通して初めて
 * ルーターと呼べる。--check は、ワークフローが実際に引いていることも見る
 * （引かれない表は authority-matrix と同じで「そうなっているはず」になる）。
 *
 * 【安いほうへ倒す判断の上限】
 * 不可逆なタスク（対外配信）は最安ティアに落とさない。**節約額より、
 * 間違えて失う額のほうが大きい**ため。これは費用の問題ではなく境界の問題なので、
 * policy に書いて機械が守る。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROUTING_PATH = path.join(ROOT, 'data/model-routing.json');
const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/obsidian-autopilot.yml');

export function load(file = ROUTING_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 使えないモデルを除いて、そのタスクで実際に使うモデルを決める。 */
export function resolve(doc, kind, unavailable = []) {
  const rule = doc.rules[kind];
  if (!rule) return { error: `未知のタスク種別: ${kind}` };
  const down = new Set(unavailable);
  if (!down.has(rule.model)) return { model: rule.model, degraded: false };
  if (rule.fallback && !down.has(rule.fallback)) {
    return { model: rule.fallback, degraded: true,
      note: `主モデル ${rule.model} が使えないため縮退。**縮退したことを日報に出す**` };
  }
  return { error: `${kind}: 主モデルも fallback も使えない。走らせない（故障として報告する）` };
}

/**
 * 段階的移管 — 試行回数からその回に使うモデルを決める。
 * **最後は必ず human。**モデルを並べただけだと失敗が無限に回る。
 */
export function escalate(doc, kind, attempt) {
  const ladder = doc.escalation?.ladder?.[kind];
  if (!ladder) return { error: `${kind} の ladder が無い` };
  const i = Math.max(1, attempt) - 1;
  if (i >= ladder.length) return { model: 'human', exhausted: true, attempt };
  return { model: ladder[i], exhausted: ladder[i] === 'human', attempt };
}

export function validate(doc, { budgets = null, workflow = null } = {}) {
  const problems = [];
  const tiers = doc.tiers || [];
  const tierOf = (m) => doc.models?.[m];
  const cheapest = doc.policy?.cheapest_tier;

  for (const [kind, r] of Object.entries(doc.rules || {})) {
    const at = `rules.${kind}`;
    if (!r.why) problems.push(`${at}: why が無い — 理由の書かれていない振り分けは、次に見直せない`);
    if (!tierOf(r.model)) problems.push(`${at}: model "${r.model}" が models に無い`);
    if (!r.fallback) {
      problems.push(`${at}: fallback が無い — 障害時に落ちる先が定義されていない`);
    } else {
      if (!tierOf(r.fallback)) problems.push(`${at}: fallback "${r.fallback}" が models に無い`);
      if (r.fallback === r.model) {
        problems.push(`${at}: fallback が model と同じ。障害時に同じ場所へ落ちるので縮退にならない`);
      }
    }
    if (typeof r.irreversible !== 'boolean') problems.push(`${at}: irreversible を明示すること`);
    if (doc.policy?.forbid_cheapest_for_irreversible && r.irreversible && tierOf(r.model) === cheapest) {
      problems.push(`${at}: 不可逆なタスクを最安ティア（${cheapest}）に割り当てている`);
    }
    if (typeof r.max_usd_per_run !== 'number' || !(r.max_usd_per_run > 0)) {
      problems.push(`${at}: max_usd_per_run を正の数で置くこと`);
    }
  }

  // タスク予算に有る種別が、ルーターに無いまま走ることを防ぐ
  if (budgets) {
    for (const kind of Object.keys(budgets)) {
      if (!doc.rules?.[kind]) problems.push(`task_budgets.${kind} に対応する振り分け規則が無い`);
    }
    for (const [kind, r] of Object.entries(doc.rules || {})) {
      const cap = budgets[kind]?.monthly_usd_cap;
      if (typeof cap === 'number' && r.max_usd_per_run > cap) {
        problems.push(`rules.${kind}: 1回の上限 $${r.max_usd_per_run} が月次枠 $${cap} を超えている`);
      }
    }
  }

  // 段階的移管の梯子
  const esc = doc.escalation;
  if (!esc?.ladder) {
    problems.push('escalation.ladder が無い — 失敗したときに何へ移すかが決まっていない');
  } else {
    for (const kind of Object.keys(doc.rules || {})) {
      const l = esc.ladder[kind];
      if (!Array.isArray(l) || !l.length) { problems.push(`escalation.ladder.${kind} が無い`); continue; }
      if (l[l.length - 1] !== 'human') {
        problems.push(`escalation.ladder.${kind} の最後が human でない`
          + ' — **モデルを並べただけだと失敗が無限に回る**');
      }
      const models = l.filter((m) => m !== 'human' && m !== 'both');
      if (new Set(models).size !== models.length) {
        problems.push(`escalation.ladder.${kind} に同じモデルが2回 — 同じ盲点で同じ失敗をする`);
      }
      for (const m of models) {
        if (!doc.models?.[m]) problems.push(`escalation.ladder.${kind}: 未知のモデル ${m}`);
      }
      if (l[0] !== 'human' && l[0] !== 'both' && l[0] !== doc.rules[kind].model) {
        problems.push(`escalation.ladder.${kind} の1回目 (${l[0]}) が rules.${kind}.model (${doc.rules[kind].model}) と違う`);
      }
    }
    if (typeof esc.max_attempts !== 'number' || esc.max_attempts < 2) {
      problems.push('escalation.max_attempts は2以上');
    }
  }

  // **引かれない表は装飾。** ワークフローが実際に呼んでいることを見る。
  if (doc.policy?.require_workflow_consumption && workflow !== null) {
    if (!workflow.includes('check-model-routing.mjs --resolve')) {
      problems.push('obsidian-autopilot.yml が --resolve を呼んでいない — 引かれない表は装飾');
    }
    if (!/--model\s+\$\{\{\s*steps\./.test(workflow)) {
      problems.push('ワークフローの --model が解決結果を使っていない（モデル名の直書きは規則を無効化する）');
    }
    // max_usd_per_run も同じ。**2026-08-25 まで、この値を実行時に見る経路が
    // 無かった。**08-23 の1回は article の上限 $2.00 に対し $7.2967 を使い切って
    // 正常終了している。上限は在ったが、当たらなかった。
    if (!workflow.includes('autopilot-budget.mjs --check-run-cap')) {
      problems.push('obsidian-autopilot.yml が --check-run-cap を呼んでいない'
        + ' — max_usd_per_run が実行時に効かない（宣言だけの上限は装飾）');
    }
  }
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
const SELFTEST_BREAKAGES = [
  ['**理由の無い振り分け**は落ちる', (d) => { const k = Object.keys(d.rules)[0]; delete d.rules[k].why; }],
  ['**fallback が無い**のは落ちる（障害時に落ちる先が無い）', (d) => { const k = Object.keys(d.rules)[0]; delete d.rules[k].fallback; }],
  ['**fallback が model と同じ**なら落ちる（同じ場所へ落ちる）', (d) => { const k = Object.keys(d.rules)[0]; d.rules[k].fallback = d.rules[k].model; }],
  ['models に無いモデルを指したら落ちる', (d) => { const k = Object.keys(d.rules)[0]; d.rules[k].model = 'gpt-とても賢い'; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(ROUTING_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const doc = load();

  const ei = argv.indexOf('--escalate');
  if (ei >= 0) {
    const kind = argv[ei + 1];
    const ai = argv.indexOf('--attempt');
    const attempt = ai >= 0 ? Number(argv[ai + 1]) : 1;
    const out = escalate(doc, kind, attempt);
    if (out.error) { console.error(out.error); process.exit(1); }
    if (out.model === 'human') console.error(`${kind}: 試行 ${attempt} で梯子を使い切った。**人間へ渡す**`);
    console.log(out.model);
    process.exit(out.model === 'human' ? 3 : 0);
  }

  const ri = argv.indexOf('--resolve');
  if (ri >= 0) {
    const kind = argv[ri + 1];
    const ui = argv.indexOf('--unavailable');
    const down = ui >= 0 ? (argv[ui + 1] || '').split(',').filter(Boolean) : [];
    const out = resolve(doc, kind, down);
    if (out.error) { console.error(out.error); process.exit(1); }
    if (out.degraded) console.error(out.note);   // stderr: stdout はモデル名だけにする
    console.log(out.model);
    process.exit(0);
  }

  const budgets = fs.existsSync(COST_PATH)
    ? JSON.parse(fs.readFileSync(COST_PATH, 'utf8')).budget?.task_budgets ?? null : null;
  const workflow = fs.existsSync(WORKFLOW_PATH) ? fs.readFileSync(WORKFLOW_PATH, 'utf8') : null;
  const problems = validate(doc, { budgets, workflow });

  console.log('モデルルーター — タスク種別 → モデル\n');
  for (const [kind, r] of Object.entries(doc.rules)) {
    const cap = budgets?.[kind]?.monthly_usd_cap;
    console.log(`  ${kind.padEnd(11)} ${r.model}`
      + `${r.both_models_always ? ' ＋ ' + r.fallback + '（同時・独立2モデル）' : ' → ' + r.fallback}`);
    console.log(`  ${' '.repeat(11)} ${r.irreversible ? '**不可逆**' : '可逆'}`
      + ` / 1回 $${r.max_usd_per_run}${cap ? ` / 月枠 $${cap}` : ''}`);
    console.log(`  ${' '.repeat(11)} ${r.why}\n`);
  }
  if (doc.escalation?.ladder) {
    console.log('  段階的移管（試行順・最後は必ず human）:');
    for (const [k, l] of Object.entries(doc.escalation.ladder)) {
      console.log(`    ${k.padEnd(11)} ${l.join(' → ')}`);
    }
    console.log('');
  }

  if (problems.length) {
    console.error('モデルルーター: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('振り分け規則に問題なし（ワークフローが実際に引いていることも確認）。');
}
