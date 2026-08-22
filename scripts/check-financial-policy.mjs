#!/usr/bin/env node
/**
 * 予算の変更幅・損失上限・撤回条件と、資金繰りのシナリオを検査する。
 *
 *   node scripts/check-financial-policy.mjs           # 表示
 *   node scripts/check-financial-policy.mjs --check   # CI
 *
 * 【なぜ動かす予算が小さいうちに書くのか】
 * 大きくなってから書くと、そのときの都合に合わせた基準になる。
 * いま実際に動いているのは AI実費だけで、広告は未実装・価格は人間専任。
 * **だから今が一番中立に決められる。**
 *
 * 【検査するもの】
 *   - 権限表の領域名と一致しているか（片方だけ名前が変わるのを防ぐ）
 *   - 稼働中の領域に、変更幅・損失上限・撤回条件があるか
 *   - **損失上限が現在の上限を下回っていないか**（下回ると初日から発火する）
 *   - 収入が未接続なのにランウェイ（月数）を書いていないか
 *     — **出せない数字を出さない**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POLICY_PATH = path.join(ROOT, 'data/financial-policy.json');
const AUTHORITY_PATH = path.join(ROOT, 'data/authority-matrix.json');
const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');

export const STATUSES = ['active', 'not_started', 'ai_excluded'];

export function validate(doc, { authorityDomains = new Set(), monthlyCap = null } = {}) {
  const problems = [];
  for (const c of doc.change_limits || []) {
    const at = `change_limits「${c.domain}」`;
    if (!STATUSES.includes(c.status)) problems.push(`${at}: status は ${STATUSES.join('/')}`);
    if (c.authority_domain && authorityDomains.size && !authorityDomains.has(c.authority_domain)) {
      problems.push(`${at}: authority_domain "${c.authority_domain}" が権限表に無い`
        + ' — 片方だけ名前が変わると、境界が二重管理になる');
    }
    if (c.who_decides !== 'human') {
      problems.push(`${at}: who_decides が human でない — **金額を動かす判断はAIに渡さない**`);
    }
    if (c.status === 'active') {
      for (const [k, label] of [['max_step_pct', '変更幅'], ['min_days_between_changes', '変更間隔'],
        ['loss_limit_usd', '損失上限']]) {
        if (typeof c[k] !== 'number') problems.push(`${at}: 稼働中なのに${label}（${k}）が数値でない`);
      }
      if (!Array.isArray(c.withdraw_conditions) || !c.withdraw_conditions.length) {
        problems.push(`${at}: 稼働中なのに撤回条件が空`
          + ' — **やめる条件を決めていないものは、やめられない**');
      }
      if (typeof c.loss_limit_usd === 'number' && typeof c.current_monthly_usd === 'number'
          && c.loss_limit_usd <= c.current_monthly_usd) {
        problems.push(`${at}: 損失上限 $${c.loss_limit_usd} が現在の上限 $${c.current_monthly_usd} 以下`
          + ' — 初日から発火する上限は上限ではない');
      }
    } else {
      // 稼働していない領域は「未設定と決めた」と書かせる。**空欄と未設定は違う。**
      for (const [k, note] of [['loss_limit_usd', 'loss_limit_note'], ['max_step_pct', 'max_step_note']]) {
        if (c[k] === null && !c[note]) problems.push(`${at}: ${k} が null なのに ${note} が無い`);
      }
    }
  }

  // AI実費の上限は台帳が正。ここに書いた現在額とずれていたら、どちらかが古い。
  const ai = (doc.change_limits || []).find((c) => c.status === 'active' && typeof c.current_monthly_usd === 'number');
  if (ai && monthlyCap !== null && ai.current_monthly_usd !== monthlyCap) {
    problems.push(`change_limits「${ai.domain}」の現在額 $${ai.current_monthly_usd} が`
      + ` autopilot-cost.json の上限 $${monthlyCap} と違う`);
  }

  const s = doc.cash_scenarios;
  if (s) {
    for (const k of ['pessimistic', 'standard', 'optimistic']) {
      if (typeof s.monthly_outflow_usd?.[k] !== 'number') problems.push(`cash_scenarios.monthly_outflow_usd.${k} が無い`);
      if (!s.assumptions?.[k]) problems.push(`cash_scenarios.assumptions.${k} が無い — 前提の無いシナリオは比較できない`);
    }
    const o = s.monthly_outflow_usd || {};
    if (typeof o.optimistic === 'number' && typeof o.standard === 'number' && o.optimistic > o.standard) {
      problems.push('cash_scenarios: 楽観が標準より大きい');
    }
    if (typeof o.standard === 'number' && typeof o.pessimistic === 'number' && o.standard > o.pessimistic) {
      problems.push('cash_scenarios: 標準が悲観より大きい');
    }
    // **出せない数字を出さない。**
    if (!s.revenue_connected && s.runway_months !== null) {
      problems.push('収入が未接続なのに runway_months を書いている'
        + ' — 手元資金も収入も機械に入っていないので、月数を出すと嘘になる');
    }
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const authority = JSON.parse(fs.readFileSync(AUTHORITY_PATH, 'utf8'));
  const domains = new Set((authority.domains || []).map((d) => d.domain));
  const cap = JSON.parse(fs.readFileSync(COST_PATH, 'utf8')).budget?.monthly_usd_cap ?? null;
  const problems = validate(doc, { authorityDomains: domains, monthlyCap: cap });

  console.log('金額を動かす規則\n');
  for (const c of doc.change_limits) {
    const mark = { active: '稼働中  ', not_started: '未着手  ', ai_excluded: 'AI対象外' }[c.status];
    console.log(`  [${mark}] ${c.domain}`);
    if (c.status === 'active') {
      console.log(`      現在 $${c.current_monthly_usd}/月（${c.cap_set_by}）`
        + ` / 1回の変更幅 ${c.max_step_pct}% / 間隔 ${c.min_days_between_changes}日`);
      console.log(`      損失上限 $${c.loss_limit_usd} / 撤回条件 ${c.withdraw_conditions.length}件`);
    } else {
      console.log(`      ${c.loss_limit_note ?? c.max_step_note ?? ''}`);
    }
  }
  const s = doc.cash_scenarios;
  console.log('\n  月いくら出ていくか（**出ていく側だけ**）');
  console.log(`    悲観 $${s.monthly_outflow_usd.pessimistic} / 標準 $${s.monthly_outflow_usd.standard}`
    + ` / 楽観 $${s.monthly_outflow_usd.optimistic}`);
  console.log(`    収入の接続: ${s.revenue_connected ? 'あり' : '**無し**（App Store Connect 未接続）'}`);
  console.log('    **ランウェイ（月数）は出さない。**手元資金も収入も機械に入っていないため。');

  if (problems.length) {
    console.error('\n金額の規則: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n規則の形に問題なし。');
}
