import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const id = 'service-notice-tested-readiness-20260913';

test('service notice readiness credit preserves the inventory and dated acceptance boundary', () => {
  const ledger = read('data/automation-coverage.json');
  const revision = ledger.acceptance_revisions.find(r => r.id === id);
  assert.ok(revision, 'a task-specific acceptance change must remain visible');
  const proof = read(revision.evidence);
  assert.equal(revision.task_index, 134);
  assert.equal(ledger.tasks[134].task, '障害案内の一斉配信');
  assert.equal(ledger.tasks[134].executor, 'ai_executes_gated');
  assert.equal(ledger.tasks[134].acceptance_basis, 'test_verified_readiness_and_active_production_monitoring');
  assert.equal(proof.status, 'complete');
  assert.equal(proof.tests.api.ci_conclusion, 'success');
  assert.equal(proof.tests.api.ci_head, proof.tests.api.source_commit);
  for (const check of ['static', 'parity', 'xcode_cloud_build', 'xcode_cloud_fast_unit']) {
    assert.equal(proof.tests.ios.ci[check], 'passed', `${check} is required before readiness credit`);
  }
  assert.equal(proof.production.deployment.build_outcome, 'success');
  assert.equal(proof.production.deployment.build_commit, proof.production.deployment.merge_commit);
  assert.deepEqual(proof.acceptance.previous, revision.previous);
  assert.deepEqual(proof.acceptance.current, revision.current);
  const p = revision.previous, c = revision.current;
  assert.equal(c.defined, p.defined);
  assert.equal(c.ai_executes - p.ai_executes, 1);
  assert.equal(c.doing - p.doing, 1);
  assert.ok(Math.abs(revision.delta_ai_execution_pp - 100 * (c.ai_executes / c.doing - p.ai_executes / p.doing)) < 1e-10);
  assert.equal(proof.acceptance.repeat_credit_on_first_production_notice, false);
  const later = ledger.tasks[134].production_service_notice_observed_at;
  assert.ok(later === null || (typeof later === 'string' && Date.parse(later) >= Date.parse(proof.recorded_at)));
  for (const name of ['index.html', 'autopilot/index.html']) {
    const html = fs.readFileSync(new URL(name, root), 'utf8');
    const spans = [...html.matchAll(/<span data-acceptance-before="service-notice-tested-readiness-20260913">([^<]*)<\/span>/g)];
    assert.equal(spans.length, 1);
    assert.equal(spans[0][1], `障害案内準備の変更直前：${p.ai_executes}/${p.doing}＝${(100 * p.ai_executes / p.doing).toFixed(2)}%`);
  }
});

test('credit requires real deployment, public readback and a later natural hourly observation', () => {
  const proof = read('data/service-notice-readiness-20260913.json');
  const p = proof.production, cron = p.scheduled_observation;
  const deployed = Date.parse(p.deployment.deployed_at);
  assert.ok(Number.isFinite(deployed));
  assert.equal(p.deployment.status_http, 200);
  assert.equal(p.public_readback.url, 'https://api.simplememofast.com/v1/service-notice');
  assert.equal(p.public_readback.http_status, 200);
  assert.deepEqual(p.public_readback.body, { schema_version: 1, notice: null });
  assert.ok(Date.parse(p.public_readback.observed_at) > deployed);
  assert.equal(cron.job_name, 'service_notice_monitor');
  assert.equal(cron.cron_expression, '0 * * * *');
  assert.equal(cron.manually_triggered, false);
  assert.equal(cron.errors, 0);
  assert.equal(cron.eligible, 0);
  assert.equal(cron.sent, 0);
  assert.equal(cron.reason, 'service_notice_inactive');
  assert.equal(cron.readback_rows_written, 0);
  assert.ok(Date.parse(cron.started_at) > deployed);
  assert.ok(Date.parse(cron.finished_at) >= Date.parse(cron.started_at));
  assert.ok(Date.parse(proof.recorded_at) >= Date.parse(cron.finished_at));
  const failed = p.failed_scheduled_observations[0];
  assert.equal(failed.errors, 1);
  assert.equal(failed.eligible, null);
  assert.equal(failed.sent, null);
  assert.equal(failed.credited, false);
  assert.equal(failed.manually_triggered, false);
  assert.ok(Date.parse(failed.finished_at) < deployed);
  assert.equal(p.repair.compatibility_flag, 'global_fetch_strictly_public');
  assert.equal(p.repair.daily_report_business_code_changed, false);
  assert.equal(p.repair.local_workerd_public_read_check.daily_status_kind, 'ok');
  assert.equal(p.repair.local_workerd_public_read_check.production_scheduled_evidence, false);
  assert.equal(proof.continuation.automation_id, 'ai-90');
  assert.equal(proof.continuation.status, 'ACTIVE');
  assert.equal(proof.continuation.missing_or_error_is_zero, false);
});

test('fixture lifecycle evidence does not claim an actual incident, device delivery or legal completion', () => {
  const proof = read('data/service-notice-readiness-20260913.json');
  assert.equal(proof.tests.production_fixture_inserted, false);
  assert.equal(proof.tests.ios.notice_observations, 'fixtures');
  assert.equal(proof.tests.ios.physical_device_e2e, false);
  assert.equal(proof.tests.ios.failed, 0);
  assert.equal(proof.tests.ios.exit_code, 0);
  assert.equal(proof.production.actual_incident_notice_observed, false);
  assert.equal(proof.production.all_client_delivery_verified, false);
  assert.equal(proof.production.legal_notification_obligation_verified, false);
  assert.equal(proof.production.existing_client_distribution.notice_is_ancestor, true);
  assert.equal(proof.production.existing_client_distribution.unchanged_in_tested_source, true);
  assert.equal(proof.production.existing_client_distribution.new_distribution_performed, false);
  assert.equal(proof.tests.testflight_distributed, false);
});

test('customer support breakdown is calculated from current tasks after readiness acceptance', () => {
  const rows = read('data/automation-coverage.json').tasks.filter(r => r.area === '⑧ カスタマーサポート');
  const ai = rows.filter(r => ['ai_autonomous', 'ai_executes_gated'].includes(r.executor)).length;
  const doing = rows.filter(r => !['nobody', 'intentional_no'].includes(r.executor)).length;
  const defined = rows.filter(r => r.executor !== 'intentional_no').length;
  const involved = ai + rows.filter(r => r.executor === 'ai_proposes').length;
  const html = fs.readFileSync(new URL('autopilot/index.html', root), 'utf8');
  const matches = [...html.matchAll(/<tr><td>⑧ カスタマーサポート<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d.]+)%<\/td><\/tr>/g)];
  assert.equal(matches.length, 1);
  assert.equal(matches[0][1], (100 * ai / defined).toFixed(1));
  assert.equal(matches[0][2], (100 * involved / doing).toFixed(1));
});

test('all four public rates agree with the current ledger, including rounded involvement', () => {
  const rows = read('data/automation-coverage.json').tasks;
  const ai = rows.filter(r => ['ai_autonomous', 'ai_executes_gated'].includes(r.executor)).length;
  const doing = rows.filter(r => !['nobody', 'intentional_no'].includes(r.executor)).length;
  const defined = rows.filter(r => r.executor !== 'intentional_no').length;
  const involved = ai + rows.filter(r => r.executor === 'ai_proposes').length;
  const html = fs.readFileSync(new URL('autopilot/index.html', root), 'utf8');
  for (const [label, numerator, denominator] of [
    ['総合自動化率', ai, defined], ['AI実行率', ai, doing],
    ['AI関与率', involved, doing], ['カバー率', doing, defined],
  ]) assert.ok(html.includes(`${label}${(100 * numerator / denominator).toFixed(1)}%`), `${label} is stale`);
});
