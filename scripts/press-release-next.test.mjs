import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, captureCommitted, digest, render, markdown, validate, evaluateDispatch, exceedsOwnerTarget } from './press-release-next.mjs';

const now = '2026-09-17T00:30:00Z';
test('snapshot source must contain the observed ledger', () => {
  const committed = { tasks: [{area: 'Fixture', task: 'one', executor: 'human_only'}] };
  const modified = structuredClone(committed);
  modified.tasks[0].executor = 'ai_executes_gated';
  assert.throws(() => captureCommitted(modified, 'a'.repeat(40), committed, now), /Commit the coverage/);
  assert.equal(captureCommitted(modified, 'b'.repeat(40), modified, now).ai_executes, 1);
});
function fixture({ ai = 198, human = 1 } = {}) {
  const coverage = { tasks: Array.from({ length: 203 }, (_, i) => ({ area: 'Fixture', task: `task-${i}`, executor: i < ai ? 'ai_executes_gated' : i < ai + human ? 'human_only' : i < 199 ? 'nobody' : 'intentional_no' })) };
  const snapshot = capture(coverage, 'a'.repeat(40), now);
  const manifest = { schema_version: 1, id: '202609-autonomy-followup', enabled: true, status: 'ready', target_ai_execution_rate: 0.98, target_comparison: 'strictly_greater', window: { starts_at: '2026-09-14T00:00:00+09:00', ends_at: '2026-09-21T00:00:00+09:00' }, scheduled_at: '2026-09-17T10:00:00+09:00', baseline_inventory: snapshot.inventory, snapshot, draft: {}, remote_draft_id: '10', media_list_id: 'test', receipt: null };
  const parts = render(manifest);
  const draft = markdown(parts);
  manifest.draft.sha256 = digest(draft);
  manifest.quality_review = { draft_sha256: digest(draft), evidence: ['fixture-only'], record: { status: 'planned', d_score_pre: { S1_novelty: 20, S2_entity_reach: 10, S3_concrete_nouns: 15, S4_transformation: 10, S5_timing: 5, S6_news_verb: 5, S7_launch_design: 5, total: 70, gates: { G1_thumbnail_1200px: 1, G2_no_ai_or_clickbait_words: 1, G3_prtimes_distribution: 1, G4_weekday_morning: 1 } } } };
  const ui = { ...parts, observed_at: now, company_id: '182412', release_id: '10', status: 'draft', scheduled_at: manifest.scheduled_at, media_list_id: 'test', incremental_charge_jpy: 0, terms_changed: false };
  return { coverage, manifest, draft, ui };
}
test('only a current measured release with matching remote preview can pass', () => {
  const f = fixture();
  assert.deepEqual(validate(f.manifest, f.draft), []);
  assert.equal(evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now).allowed, true);
});
test('the new product story preserves its setup limits and does not relabel operational ratios as capture success', () => {
  const { ui } = fixture();
  assert.match(ui.title, /牛乳を買う.*Notion.*提供開始/);
  assert.doesNotMatch(ui.title, /AI|世界初|唯一/);
  assert.match(ui.body, /「Obsidian連携シンプルメモ」（以下「シンプルメモ」）/);
  for (const text of ['Apple WatchのメモはiPhoneを経由', '初回はメールの宛先を設定',
    'プレミアムの「Notionのみに保存」', 'Obsidianへの追加コピーも止まります',
    '任意のデータベース選択、双方向同期、添付ファイルには対応していません',
    '端末への保管とNotionでの保存完了は区別', 'Notion連携の成功率や、今回の機能だけによる改善値ではありません']) {
    assert.ok(ui.body.includes(text), text);
  }
});
test('a newsworthy product story cannot release the current below-target execution ratio', () => {
  const current = fixture({ ai: 158, human: 21 });
  assert.match(current.ui.subtitle, /88\.3%（158\/179）/);
  assert.match(current.ui.body, /158\/199/);
  const result = evaluateDispatch(current.manifest, current.coverage, current.draft, current.ui, now);
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), /target not reached/);
});
test('198 of 199 actual executions clears the owner-revised greater-than-98% goal before dispatch', () => {
  const f = fixture();
  const result = evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now);
  assert.equal(result.metrics.ai_executes, 198);
  assert.equal(result.metrics.doing, 199);
  assert.equal(result.allowed, true);
  assert.equal(f.coverage.tasks[198].executor, 'human_only');
});
test('197 of 198 passes the new goal without requiring the former 99.497%', () => {
  const f = fixture({ ai: 197, human: 1 });
  assert.match(f.ui.subtitle, /99\.5%/);
  assert.match(fixture().ui.subtitle, /99\.5%/);
  const result = evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now);
  assert.equal(result.allowed, true);
});
test('exactly 98% is held even when a below-target ratio rounds to 98.0%', () => {
  for (const counts of [{ ai: 98, human: 2 }, { ai: 195, human: 4 }]) {
    const f = fixture(counts);
    assert.match(f.ui.subtitle, /98\.0%/);
    assert.equal(evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now).allowed, false);
  }
  for (const value of [NaN, Infinity, -Infinity, null, '1', 0.98]) assert.equal(exceedsOwnerTarget(value), false);
  assert.equal(exceedsOwnerTarget(0.98001), true);
});
test('196/199 clears 98% with consent and dispatch still unfinished; 195/199 does not', () => {
  const f = fixture({ ai: 196, human: 3 });
  const before = JSON.stringify(f.coverage);
  assert.equal(evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now).allowed, true);
  assert.equal(JSON.stringify(f.coverage), before);
  const below = fixture({ ai: 195, human: 4 });
  assert.equal(evaluateDispatch(below.manifest, below.coverage, below.draft, below.ui, now).allowed, false);
});
test('the current 158 of 179 remains below target', () => {
  const f = fixture({ ai: 158, human: 21 });
  const result = evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now);
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), /target not reached/);
});
test('the former target cannot silently remain as the campaign target', () => {
  const f = fixture();
  for (const old of [0.99, 0.999, 0.99497]) {
    f.manifest.target_ai_execution_rate = old;
    assert.match(validate(f.manifest, f.draft).join('\n'), /strictly greater than 98%/);
  }
  f.manifest.target_ai_execution_rate = 0.98;
  delete f.manifest.target_comparison;
  assert.match(validate(f.manifest, f.draft).join('\n'), /strictly greater than 98%/);
});
function paidFixture() {
  const f = fixture();
  f.manifest.owner_delegation = { date: '2026-09-08', evidence: 'fixture-only' };
  f.manifest.dispatch_budget = {
    campaign_id: f.manifest.id, company_id: '182412', release_id: '10', currency: 'JPY',
    charge_basis: 'per_release_excluding_tax', max_basic_charge_excl_tax_jpy: 30000,
    max_optional_charge_excl_tax_jpy: 0, max_releases: 1, authority: '2026-09-08-owner-delegation',
  };
  delete f.ui.incremental_charge_jpy;
  Object.assign(f.ui, { pricing_observed_at: now, pricing_company_id: '182412',
    billing_plan: '従量課金プラン', charge_scope: 'this_release', currency: 'JPY',
    charge_basis: 'per_release_excluding_tax', basic_charge_excl_tax_jpy: 30000,
    optional_charge_excl_tax_jpy: 0 });
  return f;
}
test('delegated single release accepts a fresh basic-price quote within its fixed cap', () => {
  const f = paidFixture();
  assert.equal(evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now).allowed, true);
});
for (const [name, mutate] of [
  ['higher price', f => { f.ui.basic_charge_excl_tax_jpy = 30001; }],
  ['unknown price', f => { delete f.ui.basic_charge_excl_tax_jpy; }],
  ['negative price', f => { f.ui.basic_charge_excl_tax_jpy = -1; }],
  ['string price', f => { f.ui.basic_charge_excl_tax_jpy = '30000'; }],
  ['paid FAX', f => { f.ui.optional_charge_excl_tax_jpy = 5000; }],
  ['unknown options', f => { delete f.ui.optional_charge_excl_tax_jpy; }],
  ['aggregate invoice', f => { f.ui.charge_scope = 'current_invoice'; }],
  ['wrong tax basis', f => { f.ui.charge_basis = 'including_tax'; }],
  ['wrong currency', f => { f.ui.currency = 'USD'; }],
  ['different plan', f => { f.ui.billing_plan = '年間契約'; }],
  ['changed terms', f => { f.ui.terms_changed = true; }],
  ['different pricing account', f => { f.ui.pricing_company_id = 'other'; }],
  ['stale quote', f => { f.ui.pricing_observed_at = '2026-09-17T00:24:00Z'; }],
  ['future quote', f => { f.ui.pricing_observed_at = '2026-09-17T00:31:00Z'; }],
  ['mixed free claim', f => { f.ui.incremental_charge_jpy = 0; }],
  ['raised cap', f => { f.manifest.dispatch_budget.max_basic_charge_excl_tax_jpy = 40000; }],
  ['second release budget', f => { f.manifest.dispatch_budget.max_releases = 2; }],
  ['other draft budget', f => { f.manifest.dispatch_budget.release_id = '11'; }],
  ['missing delegation', f => { delete f.manifest.owner_delegation; }],
  ['already dispatched', f => { f.manifest.receipt = { public_url: 'existing' }; }],
]) test(`paid release holds: ${name}`, () => {
  const f = paidFixture(); mutate(f);
  assert.equal(evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now).allowed, false);
});
for (const [name, mutate, expected] of [
  ['real unfinished task', f => {
    for (let i = 0; i < 3; i++) f.coverage.tasks[i].executor = 'human_only';
    f.manifest.snapshot = capture(f.coverage, 'a'.repeat(40), now);
    const parts = render(f.manifest);
    f.draft = markdown(parts);
    f.manifest.draft.sha256 = digest(f.draft);
    f.manifest.quality_review.draft_sha256 = digest(f.draft);
    Object.assign(f.ui, parts);
  }, /target not reached/],
  ['lowered target', f => { f.manifest.target_ai_execution_rate = 0.83; }, /strictly greater than 98/],
  ['excluded hard work', f => { f.manifest.snapshot.inventory = '0'.repeat(64); }, /scope/],
  ['stale snapshot', f => { f.manifest.snapshot.observed_at = '2026-09-15T00:00:00Z'; }, /24 hours/],
  ['future observation', f => { f.ui.observed_at = '2026-09-18T00:00:00Z'; }, /preview required/],
  ['ledger regressed', f => { f.coverage.tasks[0].executor = 'ai_proposes'; }, /ledger has changed/],
  ['invented headline', f => { f.ui.title = 'AI実行率99.9%を達成'; }, /title mismatch/],
  ['body tampering', f => { f.draft += '\nすべて完全自動化しました'; }, /Draft differs/],
  ['wrong company', f => { f.ui.company_id = 'other'; }, /Wrong account/],
  ['wrong remote draft', f => { f.ui.release_id = '9'; }, /Wrong account/],
  ['resend', f => { f.manifest.receipt = { public_url: 'existing' }; }, /Already scheduled/],
  ['deadline', f => { f.manifest.scheduled_at = '2026-09-21T10:00:00+09:00'; }, /out-of-window/],
  ['new charge', f => { f.ui.incremental_charge_jpy = 30000; }, /entitlement/],
  ['editorial review missing', f => { f.manifest.quality_review = null; }, /D-SCORE/],
  ['score padding', f => { f.manifest.quality_review.record.d_score_pre.S1_novelty = 5; }, /quality gates/],
  ['kill switch', f => { f.manifest.enabled = false; }, /disabled/],
]) test(`holds: ${name}`, () => {
  const f = fixture(); mutate(f);
  const result = evaluateDispatch(f.manifest, f.coverage, f.draft, f.ui, now);
  assert.equal(result.allowed, false);
  assert.match(result.reasons.join('\n'), expected);
});


test('the Japanese press date uses JST and evidence stays bound to the snapshot commit', () => {
  const f = fixture();
  f.manifest.snapshot.observed_at = '2026-09-16T23:30:00Z';
  const parts = render(f.manifest);
  assert.match(parts.body, /2026-09-17（日本時間）/);
  assert.ok(parts.body.includes(`https://github.com/simplememofast/simplememo/blob/${f.manifest.snapshot.source_commit}/data/automation-coverage.json`));
  assert.doesNotMatch(parts.body, /未完了の業務を分母から取り除かず/);
  assert.doesNotMatch(parts.title, /AI/);
});
