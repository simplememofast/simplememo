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
export const APPROVALS_PATH = path.join(ROOT, 'data/spend-approvals.json');

export const STATUSES = ['active', 'not_started', 'ai_excluded'];

/**
 * 二者承認 — **上限を動かした記録が無いと、上限を動かせない。**
 *
 * 承認記録の最新値と実際の上限が一致していなければ落ちる。つまり
 * autopilot-cost.json の monthly_usd_cap を黙って書き換えることができない。
 *
 * 変更幅が max_step_pct を超える場合は承認者が2人要る。
 * **AIは承認者になれない** — 止めることは許しているが、金額を上げることは許さない。
 */
export function validateApprovals(approvals, { policy = null, monthlyCap = null } = {}) {
  const problems = [];
  const rows = approvals.approvals || [];
  rows.forEach((a, i) => {
    const at = `approvals[seq=${a.seq}]`;
    if (a.seq !== i + 1) problems.push(`${at}: 連番が飛んでいる — 承認記録は追記のみ`);
    if (!Array.isArray(a.approved_by) || !a.approved_by.length) {
      problems.push(`${at}: approved_by が空`);
    } else if (a.approved_by.includes('ai')) {
      problems.push(`${at}: approved_by に ai が入っている`
        + ' — **AIは承認者になれない。**止めることは許しているが、金額を上げることは許さない');
    }
    if (!a.approved_at) problems.push(`${at}: approved_at が無い`);
    if (typeof a.to_usd !== 'number') problems.push(`${at}: to_usd が数値でない`);
    if (!a.note) problems.push(`${at}: note が無い — なぜその額なのかが残らない`);

    // 上げ幅が規則を超えるなら承認者が2人要る
    const limit = (policy?.change_limits || []).find((c) => c.domain === a.domain);
    if (limit && typeof a.from_usd === 'number' && typeof limit.max_step_pct === 'number') {
      const stepPct = ((a.to_usd - a.from_usd) / a.from_usd) * 100;
      const needsTwo = stepPct > limit.max_step_pct;
      if (needsTwo && (a.approved_by || []).length < 2) {
        problems.push(`${at}: 変更幅 ${stepPct.toFixed(1)}% が上限 ${limit.max_step_pct}% を超えるのに承認者が1人`);
      }
      if (a.two_person_required !== needsTwo) {
        problems.push(`${at}: two_person_required が実際の判定（${needsTwo}）と違う`);
      }
    } else if (a.two_person_required && (a.approved_by || []).length < 2) {
      problems.push(`${at}: two_person_required なのに承認者が1人`);
    }
    if (a.two_person_required === false && !a.two_person_reason) {
      problems.push(`${at}: 二者承認を不要とした理由が無い`);
    }
  });
  if (approvals.next_seq !== rows.length + 1) {
    problems.push(`next_seq=${approvals.next_seq} が記録数 ${rows.length} と合わない`);
  }
  // **実際の上限と、承認された最新値が一致していること。**
  const latest = [...rows].reverse().find((a) => a.domain === 'AI実費（開発・運用のトークン費）');
  if (monthlyCap !== null && latest && latest.to_usd !== monthlyCap) {
    problems.push(`autopilot-cost.json の上限 $${monthlyCap} が、承認された最新値 $${latest.to_usd} と違う`
      + ' — **承認記録を書かずに上限を動かせない**');
  }
  return problems;
}

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
    //
    // [2026-08-25] ここは長く `revenue_connected` だけを見ていた。それで足りて
    // いたのは、その値がずっと false だったから。**収入が接続された瞬間に、
    // この歯止めは実質的に外れる** —— ランウェイには収入と手元資金の両方が
    // 要るのに、片方だけで通ってしまう。
    //
    // 収入接続を true にする作業そのものが、この穴を開ける作業でもあった。
    // **必要な材料を1つずつ数え、欠けているものを名指しする形にする。**
    const missing = [];
    if (!s.revenue_connected) missing.push('収入');
    if (!s.cash_on_hand_connected) missing.push('手元資金');
    // 履歴が1日しかない収入から月次は引けない。**日数も材料のうち。**
    const days = s.revenue_history_days ?? (s.revenue_observed ? 1 : 0);
    if (s.revenue_connected && days < 28) missing.push(`収入の履歴（${days}日 / 28日必要）`);

    if (missing.length && s.runway_months !== null) {
      problems.push(`runway_months を書いているが ${missing.join(' / ')} が機械に入っていない`
        + ' — **足りない材料が1つでもあれば月数は嘘になる**');
    }
    if (s.cash_on_hand_connected === undefined) {
      problems.push('cash_on_hand_connected が無い'
        + ' — **収入だけで資金繰りを引ける形にしない**（この欄が無いと revenue_connected 単独で通る）');
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
  const approvals = JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8'));
  const problems = [
    ...validate(doc, { authorityDomains: domains, monthlyCap: cap }),
    ...validateApprovals(approvals, { policy: doc, monthlyCap: cap }),
  ];

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
  const ro = s.revenue_observed;
  console.log(`    収入の接続: ${s.revenue_connected ? 'あり（App Store Connect / Analytics）' : '**無し**（App Store Connect 未接続）'}`);
  if (ro) {
    console.log(`      観測 ${ro.as_of} / ${ro.window}: 課金 ${ro.purchases}件`
      + ` / 入金 $${ro.proceeds_usd} / 課金ユーザー ${ro.paying_users}`);
    console.log('      **月次収入ではない。**日次を積むまで月額に換算しない');
  }
  console.log(`    手元資金の接続: ${s.cash_on_hand_connected ? 'あり' : '**無し**（銀行・カードを読む経路が無い）'}`);
  const need = [];
  if (!s.revenue_connected) need.push('収入');
  if (!s.cash_on_hand_connected) need.push('手元資金');
  const d = s.revenue_history_days ?? (s.revenue_observed ? 1 : 0);
  if (s.revenue_connected && d < 28) need.push(`収入の履歴（${d}/28日）`);
  console.log(`    **ランウェイ（月数）は出さない。**足りない材料: ${need.join(' / ') || 'なし'}`);

  console.log(`\n  上限を動かした記録 ${approvals.approvals.length}件（**追記のみ**）`);
  for (const a of approvals.approvals) {
    console.log(`    #${a.seq} ${a.domain}: ${a.from_usd === null ? '初期値' : `$${a.from_usd} →`} $${a.to_usd}`
      + `  ${a.approved_at} / 承認者 ${a.approved_by.join(', ')}`
      + `${a.two_person_required ? '  **二者承認**' : ''}`);
  }
  console.log('    **承認記録を書かずに上限を動かせない**（実際の上限と最新の承認値が一致しないと落ちる）。');
  console.log('    **AIは承認者になれない。**止めることは許しているが、金額を上げることは許さない。');

  if (problems.length) {
    console.error('\n金額の規則: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n規則の形に問題なし。');
}
