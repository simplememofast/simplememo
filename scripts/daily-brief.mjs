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
    if (!b.date_jst || b.automation.overall === undefined) {
      console.error('1枚を生成できない — 台帳のどれかが読めていない');
      process.exit(1);
    }
    console.log('\n  生成できた（台帳6件を1枚に圧縮）。');
  }
}
