import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, digest, render, markdown, validate, evaluateDispatch } from './press-release-next.mjs';

const now = '2026-09-17T00:30:00Z';
function fixture() {
  const coverage = { tasks: Array.from({ length: 203 }, (_, i) => ({ area: 'Fixture', task: `task-${i}`, executor: i < 177 ? 'ai_executes_gated' : i < 199 ? 'nobody' : 'intentional_no' })) };
  const snapshot = capture(coverage, 'a'.repeat(40), now);
  const manifest = { schema_version: 1, id: '202609-autonomy-followup', enabled: true, status: 'ready', target_ai_execution_rate: 0.999, window: { starts_at: '2026-09-14T00:00:00+09:00', ends_at: '2026-09-21T00:00:00+09:00' }, scheduled_at: '2026-09-17T10:00:00+09:00', baseline_inventory: snapshot.inventory, snapshot, draft: {}, remote_draft_id: '10', media_list_id: 'test', receipt: null };
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
for (const [name, mutate, expected] of [
  ['real unfinished task', f => {
    f.coverage.tasks[0].executor = 'human_only';
    f.manifest.snapshot = capture(f.coverage, 'a'.repeat(40), now);
    const parts = render(f.manifest);
    f.draft = markdown(parts);
    f.manifest.draft.sha256 = digest(f.draft);
    f.manifest.quality_review.draft_sha256 = digest(f.draft);
    Object.assign(f.ui, parts);
  }, /target not reached/],
  ['lowered target', f => { f.manifest.target_ai_execution_rate = 0.83; }, /99.9/],
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
