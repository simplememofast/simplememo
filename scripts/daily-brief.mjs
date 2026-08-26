#!/usr/bin/env node
/**
 * 毎朝の1枚 — セッションが読むものを1箇所にまとめる（コンテキスト圧縮）。
 *
 *   node scripts/daily-brief.mjs           # 表示
 *   node scripts/daily-brief.mjs --json    # 機械可読
 *   node scripts/daily-brief.mjs --check   # CI: 生成できること
 *
 * 【なぜ】
 * 毎朝のセッションは、着手前に Runbook・status JSON・運転台帳・実費台帳・
 * 自己修復の判定・緊急停止・移管規則を**それぞれ読んでいた。**同じことを
 * 毎日6ファイル分のトークンで再構成している。
 *
 * ここは**新しい情報を作らない。**既存の集計関数を呼んで1枚にするだけで、
 * 数字はすべて台帳が正。手で書き足すと、台帳と1枚のどちらが正か分からなくなる
 * （このリポジトリはフラグで一度その事故を起こしている）。
 *
 * 【Prompt Cache と結果キャッシュを実装していない理由】
 * - **Prompt Cache**: 毎朝のプロンプトは静的で、API側のキャッシュがすでに効く範囲。
 *   こちらで持つと二重管理になる
 * - **結果キャッシュ**: 重いのは内部リンクの200検証（13,273件）だが、
 *   これはCIの話でセッションのトークンではない。**節約したい対象が違う**
 * どちらも「やらないと決めた」であって、忘れているのではない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize as summarizeCoverage } from './automation-rate.mjs';
import { summarize as summarizeBudget } from './autopilot-budget.mjs';
import { analyze as analyzeSelfheal } from './autopilot-selfheal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

export function build() {
  const stop = read('data/emergency-stop.json');
  const status = read('data/autopilot-status.json');
  const cost = read('data/autopilot-cost.json');
  const runs = read('data/autopilot-runs.json').runs || [];
  const coverage = summarizeCoverage(read('data/automation-coverage.json'));
  const budget = summarizeBudget(cost);

  // 未修理の故障は**自己修復の判定をそのまま使う。**ここで数え直すと、
  // レーンFの判定と1枚の表示がずれる — 「台帳と1枚のどちらが正か」を自分で作ることになる。
  const heal = analyzeSelfheal(read('data/autopilot-runs.json'), read('data/authority-matrix.json'));

  return {
    date_jst: new Date().toISOString().slice(0, 10),
    emergency_stop: { stopped: Boolean(stop.stopped), reason: stop.reason ?? null },
    // 停止中なら以降は読む必要が無い。**1枚の最初に置く。**
    last_production_change: status.streak?.last_production_change_date_jst ?? null,
    consecutive_no_article_days: status.streak?.consecutive_no_article_days ?? null,
    data_freshness: status.data_freshness ?? null,
    budget: {
      month: budget.month, spent: budget.spent, cap: budget.cap,
      over: budget.over,
      by_task: Object.fromEntries(Object.entries(budget.by_task.kinds)
        .map(([k, v]) => [k, { spent: Number(v.spent.toFixed(4)), cap: v.cap, over: v.over }])),
      ccr_measured: budget.ccr_measured,
      // **1回あたりの上限を判定できたか。**null は「超過なし」ではなく
      // 「model-routing.json が読めず判定できなかった」。
      // [2026-08-26] ここまで1枚はこの値を落としていた。autopilot-budget は
      // 正しく null を返していて（「超過なしと混ぜると routing を消すだけで
      // 上限が消える」）、**受け取る側が捨てていた。**
      // 記録して読まない値は、記録していないのと同じ。
      run_caps_judged: budget.run_caps !== null && budget.run_caps !== undefined,
      run_caps_overruns: budget.run_caps?.overruns?.length ?? null,
    },
    lane_f_required: Boolean(heal.lane_f_required),
    unrepaired_failures: (heal.targets || []).map((r) => ({
      run_id: r.run_id, failure_class: r.failure_class, date_jst: r.date_jst,
      escalate: Boolean(r.escalate),
    })),
    automation: {
      overall: Number((coverage.overall.overall_automation_rate * 100).toFixed(1)),
      coverage: Number((coverage.overall.coverage_rate * 100).toFixed(1)),
      nobody: coverage.overall.counts.nobody,
    },
    owner_requests: status.owner_requests ?? [],
  };
}

/**
 * 1枚が台帳と一致していることを確かめる。
 *
 * [2026-08-26] **これまでの `--check` は構造的に落ちなかった。**
 *
 *     if (!b.date_jst || b.automation.overall === undefined)
 *
 * `date_jst` は `new Date()` から作るので常に真、`automation.overall` は
 * 壊れた台帳でも `Number(NaN.toFixed(1))` = NaN になり **undefined にはならない**。
 * つまりこの条件は片方も成立しえず、「生成できた」と出すだけの行だった。
 *
 * 代わりに、この1枚が自分で掲げている不変条件をそのまま検査する ——
 * **新しい情報を作らない。数字はすべて台帳が正。**
 * 手で書き足した数字はここで台帳と食い違う。
 */
export function verify(b, sources = null) {
  const problems = [];
  const src = sources ?? {
    coverage: summarizeCoverage(read('data/automation-coverage.json')),
    budget: summarizeBudget(read('data/autopilot-cost.json')),
    heal: analyzeSelfheal(read('data/autopilot-runs.json'), read('data/authority-matrix.json')),
  };

  // 1. 数が数であること。**NaN を「生成できた」と呼ばない。**
  for (const [k, v] of [
    ['budget.spent', b.budget?.spent], ['budget.cap', b.budget?.cap],
    ['automation.overall', b.automation?.overall],
    ['automation.coverage', b.automation?.coverage],
    ['automation.nobody', b.automation?.nobody],
  ]) {
    if (!Number.isFinite(v)) {
      problems.push(`${k} が有限の数でない（${v}）— **台帳のどれかが読めていない**`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date_jst || '')) problems.push(`date_jst が日付でない（${b.date_jst}）`);
  if (typeof b.budget?.run_caps_judged !== 'boolean') {
    problems.push('budget.run_caps_judged が真偽値でない'
      + ' — **判定できたかどうかを1枚が持っていない**（null を「超過なし」と混ぜる形に戻っている）');
  }

  // 2. 台帳が正であること。1枚の数字は、集計関数の返り値と一致する。
  const eq = (got, want, k) => {
    if (!Number.isFinite(got) || !Number.isFinite(want)) return; // 1 で報告済み
    if (Math.abs(got - want) > 1e-6) {
      problems.push(`${k}: 1枚 ${got} / 台帳 ${want}`
        + ' — **手で書き足すと、台帳と1枚のどちらが正か分からなくなる**');
    }
  };
  eq(b.budget?.spent, src.budget.spent, 'budget.spent');
  eq(b.budget?.cap, src.budget.cap, 'budget.cap');
  eq(b.automation?.overall,
    Number((src.coverage.overall.overall_automation_rate * 100).toFixed(1)), 'automation.overall');
  eq(b.automation?.coverage,
    Number((src.coverage.overall.coverage_rate * 100).toFixed(1)), 'automation.coverage');
  eq(b.automation?.nobody, src.coverage.overall.counts.nobody, 'automation.nobody');
  const healN = (src.heal.targets || []).length;
  if ((b.unrepaired_failures || []).length !== healN) {
    problems.push(`unrepaired_failures: 1枚 ${(b.unrepaired_failures || []).length} 件 / 判定 ${healN} 件`
      + ' — **数え直すと、レーンFの判定と1枚の表示がずれる**');
  }
  return problems;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
if (process.argv.includes('--selftest')) {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const SCENARIOS = [
    ['実データの1枚が台帳と一致する', () => {
      const p = verify(build());
      if (p.length) throw new Error(p.join(' / '));
    }],
    ['**実費を手で書き換えたら落ちる**（台帳が正）', () => {
      const b = clone(build());
      b.budget.spent += 1;
      if (!verify(b).some((x) => x.includes('budget.spent'))) {
        throw new Error('食い違いを見逃した（**どちらが正か分からなくなる**）');
      }
    }],
    ['**自動化率を手で書き換えたら落ちる**', () => {
      const b = clone(build());
      b.automation.overall = 99.9;
      if (!verify(b).some((x) => x.includes('automation.overall'))) throw new Error('見逃した');
    }],
    ['**未実装の件数を手で減らしたら落ちる**', () => {
      const b = clone(build());
      b.automation.nobody -= 1;
      if (!verify(b).some((x) => x.includes('automation.nobody'))) throw new Error('見逃した');
    }],
    ['**未修理の故障を数え直したら落ちる**（レーンFの判定とずれる）', () => {
      const b = clone(build());
      b.unrepaired_failures = [...b.unrepaired_failures, { run_id: 'x' }];
      if (!verify(b).some((x) => x.includes('unrepaired_failures'))) throw new Error('見逃した');
    }],
    ['**NaN を「生成できた」と呼ばない**（旧 --check が落ちなかった形）', () => {
      const b = clone(build());
      b.automation.overall = Number((undefined * 100).toFixed(1)); // NaN
      if (b.automation.overall === undefined) throw new Error('前提が違う: undefined になった');
      if (!verify(b).some((x) => x.includes('有限の数でない'))) {
        throw new Error('NaN を通した（**旧実装はここで「生成できた」と出していた**）');
      }
    }],
    ['date_jst が日付でなければ落ちる', () => {
      const b = clone(build());
      b.date_jst = 'きょう';
      if (!verify(b).some((x) => x.includes('date_jst'))) throw new Error('見逃した');
    }],
    ['**緊急停止が1枚の先頭に出る**（停止中なら以降を読む必要が無い）', () => {
      const b = build();
      if (typeof b.emergency_stop?.stopped !== 'boolean') throw new Error('停止スイッチが真偽値でない');
    }],
    ['**副系の実費が0ではなく未観測だと分かる**', () => {
      const b = build();
      if (typeof b.budget.ccr_measured !== 'boolean') throw new Error('ccr_measured が真偽値でない');
    }],
    ['**1回上限を判定できたかを1枚が持つ**（null を「超過なし」と混ぜない）', () => {
      const b = build();
      if (typeof b.budget.run_caps_judged !== 'boolean') throw new Error('run_caps_judged が無い');
    }],
    ['**判定できていない1枚は verify が落とす**', () => {
      const b = clone(build());
      delete b.budget.run_caps_judged;
      if (!verify(b).some((x) => x.includes('run_caps_judged'))) {
        throw new Error('落とさなかった（**判定できなかったことを落として緑になる**）');
      }
    }],
    ['一致していれば何も言わない（常に鳴る検査も何も見ていない）', () => {
      if (verify(build()).length) throw new Error('素の1枚で鳴った');
    }],
  ];
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const b = build();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(b, null, 2)); process.exit(0); }

  const L = [];
  L.push(`毎朝の1枚 — ${b.date_jst}`);
  L.push('');
  if (b.emergency_stop.stopped) {
    L.push(`  ■ **緊急停止中**: ${b.emergency_stop.reason}`);
    L.push('    ここで終了。以降を読む必要は無い。**AIは解除できない。**');
    console.log(L.join('\n'));
    process.exit(0);
  }
  L.push(`  停止スイッチ: 稼働中`);
  L.push(`  本番最終変更: ${b.last_production_change} / 連続無記事 ${b.consecutive_no_article_days}日`);
  L.push(`  データ鮮度: BQ ${b.data_freshness?.bq_export_days_accumulated ?? '?'}/28日`
    + `（${b.data_freshness?.bq_checked ? '確認済み' : '**未確認 — 取得できなかった、の意味**'}）`);
  L.push('');
  L.push(`  実費: $${b.budget.spent.toFixed(4)} / $${b.budget.cap.toFixed(2)}`
    + `${b.budget.over ? '  **上限到達**' : ''}`);
  for (const [k, v] of Object.entries(b.budget.by_task)) {
    L.push(`    ${k.padEnd(10)} $${v.spent.toFixed(4)} / $${v.cap.toFixed(2)}${v.over ? '  **枠切れ**' : ''}`);
  }
  if (!b.budget.ccr_measured) L.push('    （副系の実費は0ではなく**未観測**）');
  if (!b.budget.run_caps_judged) {
    L.push('    **1回あたりの上限は判定できなかった**（model-routing.json が読めない）');
    L.push('      — 「超過なし」ではない。routing を消すだけで上限が消える形を作らない');
  } else if (b.budget.run_caps_overruns) {
    L.push(`    1回上限の超過 ${b.budget.run_caps_overruns}件（未レビューがあれば主系は止まる）`);
  }
  L.push('');
  if (b.unrepaired_failures.length) {
    L.push(`  ■ 未修理の故障 ${b.unrepaired_failures.length}件 — **記事より先にレーンFへ**`);
    for (const f of b.unrepaired_failures) {
      L.push(`    ${f.run_id} [${f.failure_class}] ${f.date_jst}${f.escalate ? '  **3回失敗 — 人間へ**' : ''}`);
    }
  } else {
    L.push('  未修理の故障なし。');
  }
  L.push('');
  L.push(`  自動化率 ${b.automation.overall}% / カバー率 ${b.automation.coverage}%`
    + ` / 未実装 ${b.automation.nobody}件`);
  if (b.owner_requests.length) {
    L.push('');
    L.push(`  オーナー依頼 ${b.owner_requests.length}件（先頭のみ）:`);
    L.push(`    ${b.owner_requests[0].slice(0, 110)}…`);
  }
  L.push('');
  L.push('  **この1枚は新しい情報を作らない。**数字はすべて台帳が正で、');
  L.push('  手で書き足すと台帳と1枚のどちらが正か分からなくなる。');
  console.log(L.join('\n'));

  if (process.argv.includes('--check')) {
    const problems = verify(b);
    if (problems.length) {
      console.error('\n1枚が台帳と食い違っている:');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log('\n  生成できた（台帳6件を1枚に圧縮）。**数字は台帳と一致している。**');
  }
}
