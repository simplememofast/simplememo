#!/usr/bin/env node
// Plan work against the existing inventory; never write execution credit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executionPlan, BLOCKERS, UNLOCKS, blockedOnSatisfied } from './autonomy-gap.mjs';

import { OWNER_TARGET_AI_EXECUTION_RATE, exceedsOwnerTarget } from './press-release-next.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['act', 'inspect', 'wait', 'boundary', 'defer'];

export function prioritize(coverage, assessments, now = new Date()) {
  if (!Array.isArray(assessments?.entries) || !Number.isFinite(now.getTime())) throw new Error('Invalid assessment document or clock');
  const plan = executionPlan(coverage, OWNER_TARGET_AI_EXECUTION_RATE);
  const current = plan.current;
  const known = new Map();
  for (const a of assessments.entries) {
    if (!a || typeof a !== 'object') throw new Error('Invalid assessment');
    const identity = JSON.stringify([a.area, a.task]);
    if (known.has(identity)) throw new Error('Duplicate assessment');
    if (!coverage.tasks.some(t => t.area === a.area && t.task === a.task)) throw new Error('Assessment has no inventory task');
    if (!ORDER.includes(a.state) || typeof a.next_step !== 'string' || !a.next_step.trim()
        || !Array.isArray(a.evidence) || !a.evidence.length) throw new Error('Incomplete assessment');
    for (const ref of a.evidence) {
      if (typeof ref !== 'string' || !ref.trim() || path.isAbsolute(ref)) throw new Error('Invalid evidence reference');
      const resolved = path.resolve(ROOT, ref);
      if (!resolved.startsWith(ROOT + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error('Missing repository evidence file');
    }
    if (a.estimated_minutes !== null && (!Number.isFinite(a.estimated_minutes) || a.estimated_minutes <= 0)) throw new Error('Invalid effort estimate');
    const observed = Date.parse(a.observed_at), expires = Date.parse(a.expires_at);
    if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > now.getTime() || expires <= observed) throw new Error('Invalid assessment time');
    known.set(identity, { ...a, stale: expires <= now.getTime() });
  }
  const opportunities = coverage.tasks.flatMap((t, index) => {
    if (!['nobody', 'ai_proposes', 'human_only'].includes(t.executor)) return [];
    const a = known.get(JSON.stringify([t.area, t.task]));
    const fresh = a && !a.stale;
    const constrained = BLOCKERS[t.blocker].klass !== 'reachable';
    const waiting = ['external_data', 'external_credential', 'missing_source_document', 'verification_pending'].includes(t.blocker);
    let state = UNLOCKS[t.unlock]?.defer ? 'defer' : constrained ? 'boundary' : waiting ? 'wait' : 'inspect';
    // Assessments can defer work, but cannot override an authority/physical boundary.
    if (fresh && !constrained && state !== 'defer') state = a.state;
    const unmet = (t.blocked_on ?? []).filter(p => !blockedOnSatisfied(p));
    if (unmet.length && !constrained && state !== 'defer') state = 'wait';
    const starts = t.executor === 'nobody' ? 1 : 0;
    const numerator = current.ai_executes + 1, denominator = current.doing + starts;
    const delta = numerator / denominator - current.ai_execution_rate;
    const minutes = fresh ? a.estimated_minutes : null;
    return [{ task_index: index, area: t.area, task: t.task, executor: t.executor,
      blocker: t.blocker, state, estimated_minutes: minutes, assessment_stale: !!a?.stale,
      unmet_prerequisites: unmet,
      potential: { numerator, denominator, ai_execution_rate: numerator / denominator, delta_pp: delta * 100 },
      estimated_delta_pp_per_hour: minutes ? delta * 100 * 60 / minutes : null,
      next_step: fresh ? a.next_step : '現在の解除条件と実行証拠を確認してから作業量を見積もる。',
      evidence: fresh ? a.evidence : [],
    }];
  });
  opportunities.sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state)
    || (b.estimated_delta_pp_per_hour ?? -1) - (a.estimated_delta_pp_per_hour ?? -1)
    || b.potential.delta_pp - a.potential.delta_pp || a.task_index - b.task_index);

  // Even an optimistic scenario cannot borrow the user's consent or the
  // release operation that the current goal explicitly holds until attainment.
  // Other boundaries are deliberately relaxed here: this is an upper bound,
  // not a claim that those tasks can actually be transferred.
  const held = opportunities.filter(t => (t.area === '⑪ データ・プライバシー' && t.task === '収集同意')
    || (t.area === '③ 自律型マーケティング' && t.task === 'PR TIMES への配信操作'));
  const heldIndexes = new Set(held.map(t => t.task_index));
  const movable = opportunities.filter(t => !heldIndexes.has(t.task_index));
  const numerator = current.ai_executes + movable.length;
  const denominator = current.doing + movable.filter(t => t.executor === 'nobody').length;
  const preDispatchUpperBound = {
    numerator, denominator, rate: numerator / denominator,
    target_exceeds_upper_bound: !exceedsOwnerTarget(numerator / denominator),
    held_tasks: held.map(t => ({ task_index: t.task_index, area: t.area, task: t.task,
      executor: t.executor, reason: t.task === '収集同意' ? 'human_consent' : 'dispatch_after_target' })),
    assumption: '未実行の収集同意と配信操作を保持し、それ以外の残業務をすべてAI実行へ移せた場合の楽観上限。実行可能性・期限・完了は保証しない。',
  };
  return { observed_at: now.toISOString(), metric: 'ai_execution_rate', target_ai_execution_rate: OWNER_TARGET_AI_EXECUTION_RATE, target_comparison: 'strictly_greater', current,
    classified_ceiling: plan.classified_ceiling,
    pre_dispatch_upper_bound: preDispatchUpperBound,
    active_remaining: opportunities.filter(t => t.executor !== 'nobody').length,
    not_started: opportunities.filter(t => t.executor === 'nobody').length,
    opportunities,
    limitations: ['加点は各業務を実際に完遂した場合の仮定。見積もり・優先順位・閲覧だけで台帳を変更しない。',
      '各行の差分は現在値から独立に計算する。未着手を始めると分母も増えるため、単純加算しない。',
      '所要時間は実行証拠が揃うまでの作業見積もり。待機時間や外部審査の短縮を保証しない。',
      'actは現行の権限・品質ゲートを通して進める候補。古い評価はinspectへ戻し、未知を簡単とみなさない。'] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = prioritize(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/automation-coverage.json'))),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'data/execution-priorities.json'))));
  if (process.argv.includes('--check')) console.log(`Execution priorities: ${result.opportunities.length} outstanding tasks checked; no execution credit written.`);
  else if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    const pct = n => (n * 100).toFixed(1) + '%';
    const c = result.current;
    console.log(`AI実行率 ${c.ai_executes}/${c.doing} = ${pct(c.ai_execution_rate)} / 総合 ${pct(c.overall_automation_rate)} / AI関与 ${pct(c.ai_involvement_rate)} / カバー ${pct(c.coverage_rate)}`);
    const bound = result.pre_dispatch_upper_bound;
    console.log(`配信前の楽観上限 ${bound.numerator}/${bound.denominator} = ${(bound.rate * 100).toFixed(6)}% / 目標 ${(result.target_ai_execution_rate * 100).toFixed(0)}%超`);
    console.log(bound.target_exceeds_upper_bound
      ? '現行条件では配信前に目標へ届かない。本人同意・未配信業務の先取りや棚卸し変更で埋めず、実行可能な改善は継続する。'
      : 'この上限だけでは目標を否定できない。各業務の実行証拠と配信ゲートの確認が必要。');
    console.log(bound.assumption);
    console.log('状態 | task | 完遂時の差分pt | 見積分 | 次の作業');
    for (const t of result.opportunities) console.log(`${t.state} | ${t.task_index}: ${t.task} | +${t.potential.delta_pp.toFixed(3)} | ${t.estimated_minutes ?? '未評価'} | ${t.next_step}`);
    for (const line of result.limitations) console.log(line);
  }
}
