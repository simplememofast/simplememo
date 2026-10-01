// A public-inventory work checklist for the existing owner. No runtime reads,
// writes, collectors, authority changes, task-selection rewards or score credit.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const EXECUTORS = new Set(['ai_autonomous', 'ai_executes_gated', 'ai_proposes', 'nobody', 'human_only', 'intentional_no']);
const EXECUTION = new Set(['ai_autonomous', 'ai_executes_gated']);
const PENDING = new Set(['ai_proposes', 'nobody', 'human_only']);
const ROOT = path.resolve(import.meta.dirname, '../..');
const INPUTS = ['automation-coverage', 'business-automation-policy', 'authority-matrix', 'corporate-obligations', 'financial-policy'];
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
  && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const jstDay = value => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 10);
const reference = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(value);
// This is the existing Company identity, derived solely from public task labels.
export const publicBusinessTaskId = task => createHash('sha256').update(JSON.stringify([task.area, task.task])).digest('hex');

export const BUSINESS_DOMAINS = [
  ['① 次期機能開発', '全事業の要望・設計・開発・成果確認の対象と責任者'],
  ['② バグ修正', '全製品と業務システムの障害・回帰・修復の対象'],
  ['③ 自律型マーケティング', 'アプリ販売と他事業の集客・広告・対外送信の範囲'],
  ['④ 自動本番デプロイ', '全製品の審査・配布・公開・停止と承認者'],
  ['⑤ AI予算・トークン管理', '全AI経路の実費・請求・原価帰属と支出権限'],
  ['⑥ アプリ運営意思決定', 'アプリ指標と法人全事業の損益・資金配分の境界'],
  ['⑦ 法人経営', '会計・税務・契約・期限・会社記録と担当者'],
  ['⑧ カスタマーサポート', '全事業の問い合わせ・返金・事故案内と同意範囲'],
  ['⑨ マネタイズ', '全収益源・請求・課金・価格と承認範囲'],
  ['⑩ AgentOps・ガバナンス', '全運転経路・承認・監査・介入記録の観測範囲'],
  ['⑪ データ・プライバシー', '全事業の個人データ・同意・保持・削除の範囲'],
  ['⑫ 事業継続性', '全事業の重要依存・復旧・撤退と未発生の備え'],
  ['⑬ アナログ領域', '物理業務・公的資金・営業・雇用の実案件と既存義務'],
].map(([area, scope_question]) => ({area, scope_question}));

const task = (area, name) => ({area, task: name});
const ACCOUNTING = task('⑦ 法人経営', '仕訳・請求・領収書・月次締めの統合');
const RECONCILIATION = task('⑦ 法人経営', '契約・請求・納品・支払いの照合');
const CASH = task('⑥ アプリ運営意思決定', '資金繰りシナリオ（悲観・標準・楽観）');
const AI_MARGIN = task('⑤ AI予算・トークン管理', 'AI費用に対する粗利（AI原価の回収）');
const APP_MARGIN = task('⑥ アプリ運営意思決定', 'CAC・LTV・回収期間・粗利の統合');
const CONTRACT_DRAFT = task('⑬ アナログ領域', '契約: 定型契約・条項比較・リスク抽出');
const CONTRACT_APPROVAL = task('⑬ アナログ領域', '契約: 非定型・高額・海外・知財の承認');
const VENDOR_REVIEW = task('⑦ 法人経営', 'AI事業者のDPA・データ利用・SLA・撤退計画の審査');
const CANDIDATES = [
  {id: 'company-non-app-operations', task: 'アプリ以外の受注から納品・検収まで',
    overlaps: [task('⑬ アナログ領域', '営業: リード選定・メール・提案書'), task('⑬ アナログ領域', '営業: 交渉・信頼形成・重要契約'), RECONCILIATION, CONTRACT_DRAFT, CONTRACT_APPROVAL],
    scope_gaps: ['アプリ以外の実事業・実案件・既存義務の有無', '対象事業・責任者・頻度・起動元・納品と検収の完了条件', '対象外の営業2行の再開条件への該当と、既存照合行との差分'],
    approval_gaps: ['契約締結・重要契約・支払い・送金は人の承認領域', '新しい種類の対外送信と新しい宛先は既存の送信制約を照合']},
  {id: 'company-recurring-contracts', task: '全事業の定期契約の更新・解約期限と実処理',
    overlaps: [VENDOR_REVIEW, task('⑦ 法人経営', '責任上限・知財・個人情報・準拠法の条項検査'), ACCOUNTING, RECONCILIATION, CONTRACT_DRAFT, CONTRACT_APPROVAL],
    scope_gaps: ['AI事業者以外を含む全契約・更新/解約期限・既存自動更新の観測範囲', '条項審査・費用照合では終わらない実更新/解約処理の差分', '契約台帳のメタデータと正式審査の対応。私的契約原本を公開しない'],
    approval_gaps: ['更新・解約・契約条件変更・支払いの承認範囲は未委任', '期限把握や下書きの完了を実処理へ読み替えない']},
  {id: 'company-business-profitability', task: '法人全事業の事業別損益と継続・資金配分判断',
    overlaps: [CASH, AI_MARGIN, APP_MARGIN, ACCOUNTING, task('⑥ アプリ運営意思決定', '月次予算の決定')],
    scope_gaps: ['法人の全収益源・事業別帰属・対象期間・費用配賦の網羅', 'アプリ指標・AI原価・資金繰り・月次予算との重複を除く追加工程', '全収入/支出の実測、税区分・未確定債務・確定入金の照合'],
    approval_gaps: ['事業継続・全社資金配分の委任範囲は独立に確認する', 'AI費用の個別委任から契約・価格・支払いの許可を推定しない']},
];

const ACTIONS = [
  {id: 'accounting-integration', targets: [ACCOUNTING], overlaps: [task('⑦ 法人経営', '銀行・カード残高の読み取り（日次）'), RECONCILIATION, task('⑦ 法人経営', '支出上限と重要支出の二者承認')],
    aim: '取得済みの会計照合を、未登録・重複・会社帰属が明示された月次処理の下書きへ結び付ける',
    checklist: ['既存取得の期間・同期鮮度と未登録明細を照合する', '期首残高・会社帰属・総額/手数料・税区分・配賦の未確認を残す', '仕訳の重複防止、請求/領収書対応、締め前後の照合条件を下書きする'],
    evidence_gaps: ['全対象期間の原本網羅と最新同期', '未登録明細・会社帰属・期首残高・税区分/配賦', '6工程・全発生・介入時間・費用の比較可能な実測'],
    approval_gaps: ['仕訳書込み・請求書送付・月次締めの個別実行権限を確認', '税務判断は専門家境界、契約・支払い・送金は人の承認'],
    sources: ['docs/accounting-readback-evidence-20260910.md', 'data/authority-matrix.json', 'data/financial-policy.json']},
  {id: 'business-metric-integration', targets: [AI_MARGIN, APP_MARGIN], overlaps: [CASH, ACCOUNTING, task('⑥ アプリ運営意思決定', '売上・課金・返金・広告の照合')],
    aim: '収益・原価・人の負担を同じ期間と事業範囲で接続し、未観測を判断材料から隠さない',
    checklist: ['既存ASC・費用・会計出力の観測期間と確定/推定/欠測を一致させる', '売上・確定入金・利益を区別し、個人支出や同じ送金の二重加算を除く', '各事業の帰属と原価を確認してからCAC/LTV/粗利を算出する。揃わなければnullを保持'],
    evidence_gaps: ['十分な同一期間の収益と継続/課金/解約の対応', '副系CCRと全ベンダーの当月実費・請求', '全事業の費用帰属・承認/修正/確認時間'],
    approval_gaps: ['分析の作成は支出決定ではない', '価格・契約・全社資金配分の承認をAI費用枠で代用しない'],
    sources: ['data/financial-policy.json', 'data/business-automation-policy.json', 'docs/subscription-observation-evidence-20260910.md']},
  {id: 'improvement-effect-observation', targets: [task('① 次期機能開発', '本番改善サイクルの完走（機能側）'), task('① 次期機能開発', 'D7/D28・課金・解約まで含む評価'), task('⑥ アプリ運営意思決定', '対照群に対する増分効果の評価')],
    overlaps: [task('① 次期機能開発', '機能の効果測定の宣言（出す前に測り方を決める）'), task('③ 自律型マーケティング', '対照群による増分効果測定')],
    aim: '既存の宣言・出荷・観測・判定・学習を対応させ、評価待ちの改善を次の判断につなげる',
    checklist: ['元の事前宣言・対象版・除外・母数・固定評価日を読み戻す', '既存の日次出力で成熟した同じ対象を照合し、未成熟・欠損・検出力不足を残す', '既存評価日の判断と学習を保存する。過去の基準・期間・判定を後付け変更しない'],
    evidence_gaps: ['欠損を除いた同じ観測対象と成熟した期間', '元の効果判定・安全条件・学びの実記録', '承認・修正・確認を含む人の時間と全発生の実績'],
    approval_gaps: ['既存ownerと事前契約・評価門を維持', '再出荷・新予約・新しい実験対象の追加はこの報告では許可しない'],
    sources: ['data/feature-outcomes.json', 'docs/obsidian-feature-observation-20260911.md', 'docs/autonomy/OPERATING_RUNBOOK.md']},
];

function inventoryRows(coverage) {
  if (!Array.isArray(coverage?.tasks) || !day(coverage.measured_at)) throw new Error('business_inventory_invalid');
  const areas = new Set(BUSINESS_DOMAINS.map(d => d.area)), seen = new Set();
  return coverage.tasks.map((t, i) => {
    if (!areas.has(t?.area) || !EXECUTORS.has(t.executor) || typeof t.task !== 'string'
      || !t.task.trim() || t.task.length > 240) throw new Error('business_inventory_invalid');
    const task_id = publicBusinessTaskId(t);
    if (seen.has(task_id)) throw new Error('business_inventory_duplicate_task');
    seen.add(task_id);
    // Never forward notes, original evidence, authority prose or unknown input fields.
    return {row: i + 1, task_id, area: t.area, task: t.task, executor: t.executor};
  });
}

function resolve(specs, rows) {
  const matched = [], missing = [];
  for (const spec of specs) {
    const row = rows.find(r => r.task_id === publicBusinessTaskId(spec));
    if (row) matched.push(row);
    else missing.push(spec); // Fixed public definitions only; no arbitrary input text.
  }
  return {matched, missing};
}

// Source-grounded aggregates supplied by a caller, never read from private files.
// Admission is a declaration check; it cannot independently authenticate receipts.
function observedComparison(observation, now) {
  if (observation === undefined) return {state: 'unknown', business_value: null, human_work: null, cost: null};
  const o = observation, b = o?.burden, v = o?.business_value, w = o?.window;
  const kinds = ['revenue', 'successful_customer_outcomes', 'verified_operational_outputs'];
  const units = ['JPY', 'USD', 'count'];
  if (o?.measurement !== 'observed' || !day(w?.from) || !day(w?.through) || w.from > w.through
    || w.through > jstDay(now) || o.human_activity_coverage_complete !== true
    || b?.measurement !== 'observed' || !Number.isFinite(b.baseline_minutes) || b.baseline_minutes <= 0
    || !Number.isFinite(b.actual_minutes) || b.actual_minutes < 0
    || !stamp(b.baseline_recorded_at) || !stamp(b.first_occurrence_at)
    || Date.parse(b.baseline_recorded_at) > Date.parse(b.first_occurrence_at)
    || jstDay(b.first_occurrence_at) < w.from || jstDay(b.first_occurrence_at) > w.through
    || Date.parse(b.first_occurrence_at) > now.getTime()
    || !reference(b.baseline_evidence_ref) || !reference(b.actual_evidence_ref)
    || v?.measurement !== 'observed' || !kinds.includes(v.kind) || !units.includes(v.unit)
    || (v.kind === 'revenue' ? v.unit === 'count' : v.unit !== 'count')
    || !Number.isFinite(v.amount) || v.amount < 0 || (v.unit === 'count' && !Number.isSafeInteger(v.amount))
    || !reference(v.evidence_ref))
    return {state: 'unverified_input', business_value: null, human_work: null, cost: null};
  let cost = null;
  if (o.cost != null) {
    if (o.cost.measurement !== 'observed' || !['JPY', 'USD'].includes(o.cost.currency)
      || !Number.isFinite(o.cost.amount) || o.cost.amount < 0 || !reference(o.cost.evidence_ref))
      return {state: 'unverified_input', business_value: null, human_work: null, cost: null};
    cost = {amount: o.cost.amount, currency: o.cost.currency};
  }
  return {state: 'observed_declaration', window: {from: w.from, through: w.through},
    business_value: {kind: v.kind, unit: v.unit, amount: v.amount},
    human_work: {baseline_minutes: b.baseline_minutes, actual_minutes: b.actual_minutes,
      saved_minutes: b.baseline_minutes - b.actual_minutes}, cost};
}

function comparisonFrontiers(backlog) {
  const groups = new Map();
  for (const row of backlog.filter(r => r.comparison.state === 'observed_declaration')) {
    const c = row.comparison, key = JSON.stringify([c.window, c.business_value.kind, c.business_value.unit]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(group => {
    const dominates = (a, b) => a.comparison.business_value.amount >= b.comparison.business_value.amount
      && a.comparison.human_work.saved_minutes >= b.comparison.human_work.saved_minutes
      && (a.comparison.business_value.amount > b.comparison.business_value.amount
        || a.comparison.human_work.saved_minutes > b.comparison.human_work.saved_minutes);
    const frontier = group.filter(b => !group.some(a => dominates(a, b))).map(r => r.task_id);
    const c = group[0].comparison;
    return {window: c.window, business_value_kind: c.business_value.kind, unit: c.business_value.unit,
      comparable_tasks: group.map(r => r.task_id), frontier_tasks: frontier};
  });
}

export function businessWorkPlan({coverage, policy, authority, corporate, financial, observations = [], now = new Date()} = {}) {
  if (policy?.policy_owner !== 'human' || policy.preserve_legacy_items !== true || policy.existing_owner !== 'obsidian'
    || policy.ranker_reward !== false || !Array.isArray(policy.new_business_candidates)) throw new Error('business_work_policy_invalid');
  if (!Number.isFinite(now.getTime()) || !Array.isArray(observations)) throw new Error('business_work_input_invalid');
  const rows = inventoryRows(coverage), inScope = rows.filter(r => r.executor !== 'intentional_no');
  const counts = Object.fromEntries([...EXECUTORS].map(e => [e, rows.filter(r => r.executor === e).length]));
  const pending = rows.filter(r => PENDING.has(r.executor)), pendingIds = new Set(pending.map(r => r.task_id));
  const sourceGaps = [];
  if (observations.some(o => !pendingIds.has(o?.task_id))) sourceGaps.push('comparison_input_outside_backlog');
  const backlog = pending.map(row => {
    const inputs = observations.filter(o => o?.task_id === row.task_id);
    const action = ACTIONS.find(a => a.targets.some(t => publicBusinessTaskId(t) === row.task_id));
    return {...row, priority_score: null,
      comparison: inputs.length > 1 ? {state: 'conflicting_input', business_value: null, human_work: null, cost: null}
        : observedComparison(inputs[0], now),
      next_step: action ? action.checklist : ['既存owner・起動元・実成果・人の介入と権限を照合し、不足証拠を具体化する'],
      eligible_for_execution: false};
  });
  const scopeReviews = CANDIDATES.filter(c => policy.new_business_candidates.some(p => p.id === c.id)).map(c => {
    const overlap = resolve(c.overlaps, rows);
    return {id: c.id, task: c.task, state: 'scope_review_required', overlaps: overlap.matched,
      missing_overlap_definitions: overlap.missing, scope_gaps: c.scope_gaps, approval_gaps: c.approval_gaps,
      admitted_to_denominator: false, runtime_completed: false};
  });
  if (policy.new_business_candidates.some(c => !CANDIDATES.some(known => known.id === c.id))) sourceGaps.push('corporate_candidate_definition_unmapped');
  const boundaries = ['契約・支払い・送金', '価格・プラン・無料枠の変更', 'AI実費（開発・運用のトークン費）'].map(domain => {
    const matches = Array.isArray(authority?.domains) ? authority.domains.filter(d => d.domain === domain) : [];
    const row = matches.length === 1 ? matches[0] : null;
    return {domain, state: row && typeof row.requires_approval === 'boolean' ? 'registered_boundary' : 'unknown',
      requires_approval: typeof row?.requires_approval === 'boolean' ? row.requires_approval : null,
      grants_new_authority: false};
  });
  const recordGaps = ['board-minutes', 'shareholder-register', 'vendor-contracts', 'app-review-correspondence', 'incident-records'].map(id => {
    const matches = Array.isArray(corporate?.records) ? corporate.records.filter(r => r.id === id) : [];
    const row = matches.length === 1 ? matches[0] : null;
    return {id, recorded_exists: typeof row?.exists === 'boolean' ? row.exists : null,
      interpretation: row ? 'record_status_only_not_complete_corporate_scope' : 'unknown'};
  });
  const unconfirmedDeadlines = Array.isArray(corporate?.deadlines)
    ? corporate.deadlines.filter(d => d.confirmed_by_owner !== true).length : null;
  const frontier = comparisonFrontiers(backlog);
  return {schema_version: 1, owner: 'obsidian', basis: 'public_inventory_and_boundary_checklist',
    inventory_measured_at: coverage.measured_at, runtime_measurement_performed: false, corporate_scope_completeness: 'not_attested',
    inventory: {registered: rows.length, explicitly_out_of_scope: counts.intentional_no, denominator: inScope.length,
      declared_ai_execution: counts.ai_autonomous + counts.ai_executes_gated,
      declared_ai_utilization: counts.ai_autonomous + counts.ai_executes_gated + counts.ai_proposes,
      nonexecution: pending.length, counts, denominator_changed: false, executor_changed: false},
    domains: BUSINESS_DOMAINS.map(d => ({...d, registered: rows.filter(r => r.area === d.area).length,
      in_scope: inScope.filter(r => r.area === d.area).length,
      declared_ai_execution: inScope.filter(r => r.area === d.area && EXECUTION.has(r.executor)).length,
      nonexecution: pending.filter(r => r.area === d.area).length, scope_attested: false})),
    backlog, scope_reviews: scopeReviews,
    improvement_checklists: ACTIONS.map(a => {const targets = resolve(a.targets, rows), overlap = resolve(a.overlaps, rows);
      return {id: a.id, aim: a.aim, state: 'draft_only_evidence_review', targets: targets.matched, overlaps: overlap.matched,
        missing_definitions: [...targets.missing, ...overlap.missing], checklist: a.checklist, evidence_gaps: a.evidence_gaps,
        approval_gaps: a.approval_gaps, sources: a.sources,
        before_after: {verified_full_tasks: null, human_minutes: null, cost: null, target_change: 0},
        runtime_completed: false, new_authority: false};}),
    boundaries, corporate_records: recordGaps, unconfirmed_deadline_count: unconfirmedDeadlines,
    financial_observation: {revenue_history_days: Number.isSafeInteger(financial?.cash_scenarios?.revenue_history_days)
        && financial.cash_scenarios.revenue_history_days >= 0 ? financial.cash_scenarios.revenue_history_days : null,
      outflow_observed: financial?.cash_scenarios?.outflow_status === 'observed',
      profitability_verified: false, scope_complete: false},
    comparison: {state: frontier.length ? 'observed_declarations_require_original_selection_gates' : 'unknown_without_observed_value_and_human_time',
      frontier_groups: frontier, selected: null, ranker_reward: false,
      assurance: 'Aggregate declarations do not independently prove business value, causal savings, runtime completion, full human-activity coverage or permission. Compare only matching metrics and windows through the existing owner and selection gates.'},
    source_gaps: sourceGaps,
    sources: INPUTS.map(name => `data/${name}.json`)};
}

// Deliberately reads only five tracked public JSON files; no stateRoot, private
// receipt, credential, network, subprocess or scheduler input is accepted.
export function loadBusinessWorkPlan({now = new Date()} = {}) {
  const inputs = INPUTS.map(name => JSON.parse(fs.readFileSync(path.join(ROOT, `data/${name}.json`), 'utf8')));
  const [coverage, policy, authority, corporate, financial] = inputs;
  return businessWorkPlan({coverage, policy, authority, corporate, financial, now});
}
