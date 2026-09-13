import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const id = 'billing-recovery-tested-readiness-20260913';

test('the monetization breakdown is recalculated when billing readiness moves into execution', () => {
  const rows = read('data/automation-coverage.json').tasks.filter(r => r.area === '⑨ マネタイズ');
  const ai = rows.filter(r => ['ai_autonomous', 'ai_executes_gated'].includes(r.executor)).length;
  const doing = rows.filter(r => !['nobody', 'intentional_no'].includes(r.executor)).length;
  const defined = rows.filter(r => r.executor !== 'intentional_no').length;
  const involved = ai + rows.filter(r => r.executor === 'ai_proposes').length;
  const html = fs.readFileSync(new URL('autopilot/index.html', root), 'utf8');
  const matches = [...html.matchAll(/<tr><td>⑨ マネタイズ<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d.]+)%<\/td><\/tr>/g)];
  assert.equal(matches.length, 1);
  assert.equal(matches[0][1], (100 * ai / defined).toFixed(1));
  assert.equal(matches[0][2], (100 * involved / doing).toFixed(1));
});

test('billing readiness credit preserves scope and distinguishes fixture tests from real recovery', () => {
  const ledger = read('data/automation-coverage.json');
  const revision = ledger.acceptance_revisions.find(r => r.id === id);
  assert.ok(revision, 'readiness credit requires a transparent task-specific acceptance revision');
  const proof = read(revision.evidence);
  assert.equal(revision.task_index, 145);
  assert.equal(ledger.tasks[145].task, '課金失敗の回復');
  assert.equal(ledger.tasks[145].executor, 'ai_executes_gated');
  assert.equal(ledger.tasks[145].acceptance_basis, 'test_verified_readiness_and_active_production_monitoring');
  // This dated proof remains a readiness snapshot. A later real observation
  // may update the task without rewriting the snapshot or granting more credit.
  const laterObservation = ledger.tasks[145].production_billing_recovery_observed_at;
  assert.ok(laterObservation === null || (typeof laterObservation === 'string'
    && Date.parse(laterObservation) >= Date.parse(proof.recorded_at)));
  assert.equal(proof.status, 'complete');
  assert.deepEqual(proof.acceptance.previous, revision.previous);
  assert.deepEqual(proof.acceptance.current, revision.current);
  assert.equal(revision.current.defined, revision.previous.defined);
  assert.equal(revision.current.ai_executes - revision.previous.ai_executes, 1);
  assert.equal(revision.current.doing - revision.previous.doing, 1);
  const p = revision.previous, c = revision.current;
  assert.ok(Math.abs(revision.delta_ai_execution_pp - 100 * (c.ai_executes / c.doing - p.ai_executes / p.doing)) < 1e-10);
  assert.equal(proof.acceptance.repeat_credit_on_first_production_recovery, false);
  assert.equal(proof.tests.apple_sandbox_billing_recovery_e2e, false);
  assert.equal(proof.tests.production_fixture_inserted, false);
  assert.equal(proof.tests.api.billing_readiness_integration.signature_boundary, 'mocked_in_test_only');
  assert.equal(proof.tests.ios.storekit_observations, 'fixtures');
  assert.equal(proof.tests.ios.foreground_storekit_network_e2e, false);
  assert.equal(proof.tests.ios.failed, 0);
  assert.equal(proof.tests.ios.exit_code, 0);
  assert.equal(proof.production.actual_billing_recovery_observed, false);
});

test('credit requires production deployment, later natural cron, real Apple TEST and continuation', () => {
  const proof = read('data/billing-recovery-readiness-20260913.json');
  const production = proof.production, cron = production.scheduled_observation;
  const deployed = Date.parse(production.deployment.deployed_at);
  assert.ok(Number.isFinite(deployed));
  assert.equal(production.deployment.status_http, 200);
  assert.equal(cron.job_name, 'billing_recovery_monitor');
  assert.equal(cron.cron_expression, '0 * * * *');
  assert.equal(cron.manually_triggered, false);
  assert.equal(cron.errors, 0);
  assert.equal(cron.eligible, 0);
  assert.equal(cron.reason, 'awaiting_production_billing_recovery');
  assert.equal(cron.readback_rows_written, 0);
  assert.ok(Date.parse(cron.started_at) > deployed);
  assert.ok(Date.parse(cron.finished_at) >= Date.parse(cron.started_at));
  assert.ok(Date.parse(proof.recorded_at) >= Date.parse(cron.finished_at));
  assert.equal(production.apple_test_delivery.result, 'SUCCESS');
  assert.equal(production.apple_test_delivery.environment, 'production');
  assert.equal(production.apple_test_delivery.notification_type, 'TEST');
  assert.ok(Date.parse(production.apple_test_delivery.observed_at) > deployed);
  assert.equal(proof.continuation.status, 'ACTIVE');
  assert.equal(proof.continuation.automation_id, 'ai-90');
  for (const page of ['index.html', 'autopilot/index.html']) {
    const html = fs.readFileSync(new URL(page, root), 'utf8');
    const spans = [...html.matchAll(/<span data-acceptance-before="billing-recovery-tested-readiness-20260913">([^<]*)<\/span>/g)];
    const p = proof.acceptance.previous;
    assert.equal(spans.length, 1);
    assert.equal(spans[0][1], `課金回復準備の変更直前：${p.ai_executes}/${p.doing}＝${(100 * p.ai_executes / p.doing).toFixed(2)}%`);
  }
});
