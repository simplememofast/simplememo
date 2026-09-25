/**
 * A human-reviewed, single scheduled-run exception to the derived repair-limit
 * containment. This module never changes the run ledger, repair limit, or
 * emergency-stop switch. Absence of an active permit fails closed.
 *
 * The permit is bound to a workflow run number and first attempt. GitHub assigns
 * a new run number to every workflow run; if another run takes the expected
 * number before the scheduled slot, this exception simply does not activate.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

export const TARGET_RUN_ID = 'ap-20260920-actions-codex-01a0bb78-4965-7242-bedf-29a93d1b0bf9';
export const REPAIR_MERGE_SHA = 'e297acb927e4e9ba7887b359e44585d913149342';
const WORKFLOW_REF = 'simplememofast/simplememo/.github/workflows/obsidian-autopilot.yml@refs/heads/main';
const ORIGINAL_ROW = {
  run_id: TARGET_RUN_ID, date_jst: '2026-09-20', route: 'actions', attempted: true,
  outcome: 'no_artifact', lane: null, action: 'maintenance', pr: 1504, artifact: null,
  failure_reason: 'engine=codex; automation=obsidian; scheduled06:00JST. Admitted native run; business treatment blocked by complete-scope prospective measurement ownership. Required sitemap and distribution files conflict with existing exclusive page experiments. Daily data and scheduled visibility observations remain separate; no content implementation or business shipment.',
  external_ref: 'codex:01a0bb78-4965-7242-bedf-29a93d1b0bf9', interventions: [],
  source: 'codex-automation', failure_class: 'no_artifact', failure_stage: 'eligibility',
  eligibility_verdict: 'blocked', gate_code: 'measurement_scope_conflict',
  stage_note: 'Initial preflight run:true; scheduled2026-09-20T06:00:00+09:00; actual scheduler start2026-09-20T06:00:17.617+09:00; original task01a0bb78-4965-7242-bedf-29a93d1b0bf9. PR1504 publishes observations/bookkeeping only, not a business treatment.',
};
const HISTORICAL_REPAIRS = [
  { run_id: 'ap-20260907-actions', date_jst: '2026-09-07', route: 'actions',
    source: 'session', pr: 1051,
    targets: ['ap-20260905-actions-33959414641', 'ap-20260906-actions'] },
  { run_id: 'ap-20260911-ccr-0920-codex-01a08e7c-1a0e-7003-b3af-fb72dfc4ef9a',
    date_jst: '2026-09-11', route: 'ccr-0920', source: 'codex-automation', pr: 1237,
    targets: ['ap-20260910-actions-codex-01a087f9-4092-7bc3-8274-69722c79e45b'] },
  { run_id: 'ap-20260919-actions-35415451723', date_jst: '2026-09-19',
    route: 'actions', source: 'session', pr: 1470,
    targets: ['ap-20260915-actions-codex-01a0a1b9-4982-70f3-b2d6-eed77be68e26'] },
];
const PERMIT_KEYS = [
  'approval_review_url', 'approved_at', 'date_jst', 'failure_class', 'repair_merge_sha',
  'route', 'schema_version', 'status', 'target_run_id', 'workflow_run_number',
];

export function readActionsRecoveryPermit(file) {
  const permit = JSON.parse(fs.readFileSync(file, 'utf8'));
  return permit;
}

export function verifiedRepairPresent(root) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', REPAIR_MERGE_SHA, 'HEAD'],
    { cwd: root, stdio: 'ignore', timeout: 5000 });
  if (result.status !== 0 || result.error) return false;
  // The merge ancestor alone would also be true after a revert. Keep the
  // bounded-support regression cases green in the actual checkout as well.
  const tests = spawnSync(process.execPath, ['--test', 'growth/lib/measurement-support.test.mjs'],
    { cwd: root, stdio: 'ignore', timeout: 30000 });
  return tests.status === 0 && !tests.error;
}

/** Pure, fail-closed decision. `analysis` is the unchanged self-heal result. */
export function evaluateActionsRecoveryPermit({ permit, analysis, runsDoc, ledgerProblems = [], stopDoc, env, now, repairPresent }) {
  const reject = reason => ({ allowed: false, reason });
  if (!permit || permit.status !== 'active') return reject('no active permit');
  if (JSON.stringify(Object.keys(permit).sort()) !== JSON.stringify(PERMIT_KEYS)) {
    return reject('permit fields differ from the reviewed schema');
  }
  if (permit.schema_version !== 1 || permit.route !== 'actions'
      || permit.target_run_id !== TARGET_RUN_ID || permit.failure_class !== 'no_artifact'
      || permit.repair_merge_sha !== REPAIR_MERGE_SHA) {
    return reject('permit target, route, failure, or repair evidence differs');
  }
  if (!Number.isSafeInteger(permit.workflow_run_number) || permit.workflow_run_number < 1) {
    return reject('workflow run number is not fixed');
  }
  if (!/^https:\/\/github\.com\/simplememofast\/simplememo\/pull\/[1-9]\d*#pullrequestreview-[1-9]\d*$/.test(permit.approval_review_url)) {
    return reject('human PR review reference is missing');
  }
  if (typeof permit.approved_at !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(permit.approved_at)) {
    return reject('human review time lacks an exact UTC timestamp');
  }
  const approved = Date.parse(permit.approved_at);
  const current = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(approved) || !Number.isFinite(current) || approved > current) {
    return reject('human review time is invalid or in the future');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(permit.date_jst)) return reject('JST date is invalid');
  const jst = new Date(current + 9 * 3600000).toISOString();
  const jstDate = jst.slice(0, 10), jstTime = jst.slice(11, 16);
  if (jstDate !== permit.date_jst || jstTime < '07:20' || jstTime >= '09:30') {
    return reject('outside the single scheduled JST window');
  }
  if (env?.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'schedule'
      || env.GITHUB_REPOSITORY !== 'simplememofast/simplememo'
      || env.GITHUB_WORKFLOW_REF !== WORKFLOW_REF || env.GITHUB_REF !== 'refs/heads/main'
      || env.GITHUB_RUN_ATTEMPT !== '1'
      || env.GITHUB_RUN_NUMBER !== String(permit.workflow_run_number)
      || !/^[1-9]\d*$/.test(String(env.GITHUB_RUN_ID ?? ''))) {
    return reject('not the approved first scheduled workflow run');
  }
  if (stopDoc?.stopped !== false || stopDoc?.agents?.actions?.stopped !== false) {
    return reject('an explicit emergency stop is active or unreadable');
  }
  if (repairPresent !== true) return reject('the repair merge or bounded-support regression test is missing');
  if (!Array.isArray(ledgerProblems) || ledgerProblems.length !== 0) return reject('the run ledger is invalid');
  const original = runsDoc?.runs?.filter(row => row.run_id === TARGET_RUN_ID) ?? [];
  if (original.length !== 1 || !isDeepStrictEqual(original[0], ORIGINAL_ROW)) {
    return reject('the original failed run has changed');
  }
  const rows = runsDoc.runs;
  const noArtifactRepairCount = rows.reduce((count, row) => count + (row.repair_of ?? []).filter(id =>
    rows.some(target => target.run_id === id && target.failure_class === 'no_artifact')).length, 0);
  if (noArtifactRepairCount !== 3 || HISTORICAL_REPAIRS.some(expected => {
    const matches = rows.filter(row => row.run_id === expected.run_id);
    return matches.length !== 1 || matches[0].outcome !== 'shipped'
      || matches[0].attempted !== true || matches[0].pr !== expected.pr
      || matches[0].date_jst !== expected.date_jst || matches[0].route !== expected.route
      || matches[0].source !== expected.source
      || JSON.stringify(matches[0].repair_of) !== JSON.stringify(expected.targets)
      || !expected.targets.every(id => rows.some(row => row.run_id === id))
      || !rows.some(target => target.run_id === expected.targets[0]
        && target.route === 'actions' && target.outcome === 'no_artifact'
        && target.failure_class === 'no_artifact');
  })) {
    return reject('the three historical repair rows or targets have changed');
  }
  if (analysis?.limit !== 3 || analysis?.escalate?.length !== 1) {
    return reject('repair limit or escalated target set has changed');
  }
  const target = analysis.escalate[0];
  if (target.run_id !== TARGET_RUN_ID || target.route !== 'actions'
      || target.failure_class !== 'no_artifact' || target.repair_attempts_for_class !== 3
      || target.escalate !== true) {
    return reject('the repair-limit failure is no longer the reviewed one');
  }
  return {
    allowed: true,
    audit: { target_run_id: TARGET_RUN_ID, workflow_run_id: env.GITHUB_RUN_ID,
      workflow_run_number: permit.workflow_run_number, date_jst: permit.date_jst,
      approval_review_url: permit.approval_review_url },
  };
}

/** The same cases run under the existing Self-repair boundary CI step. */
export function testActionsRecoveryPermit() {
  const original = structuredClone(ORIGINAL_ROW);
  const historical = HISTORICAL_REPAIRS.flatMap(expected => [
    { run_id: expected.run_id, date_jst: expected.date_jst, route: expected.route,
      source: expected.source, attempted: true, outcome: 'shipped',
      pr: expected.pr, repair_of: expected.targets },
    { run_id: expected.targets[0], route: 'actions', attempted: true,
      outcome: 'no_artifact', failure_class: 'no_artifact' },
  ]);
  historical.push({ run_id: 'ap-20260906-actions', route: 'actions', attempted: true, outcome: 'failed' });
  const target = { run_id: TARGET_RUN_ID, route: 'actions', failure_class: 'no_artifact',
    repair_attempts_for_class: 3, escalate: true };
  const fixture = {
    permit: { schema_version: 1, status: 'active', route: 'actions', target_run_id: TARGET_RUN_ID,
      failure_class: 'no_artifact', repair_merge_sha: REPAIR_MERGE_SHA,
      date_jst: '2026-09-26', workflow_run_number: 42,
      approved_at: '2026-09-25T12:00:00Z',
      approval_review_url: 'https://github.com/simplememofast/simplememo/pull/1602#pullrequestreview-123' },
    analysis: { limit: 3, escalate: [target] }, runsDoc: { runs: [original, ...historical] },
    stopDoc: { stopped: false, agents: { actions: { stopped: false } } },
    env: { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'schedule',
      GITHUB_REPOSITORY: 'simplememofast/simplememo', GITHUB_WORKFLOW_REF: WORKFLOW_REF,
      GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ID: '123456' },
    now: new Date('2026-09-25T22:30:00Z'), repairPresent: true,
  };
  const decide = change => evaluateActionsRecoveryPermit({ ...fixture, ...change });
  assert.equal(decide({}).allowed, true);
  const denied = [
    { permit: null }, { permit: { ...fixture.permit, status: 'inactive' } },
    { permit: { ...fixture.permit, target_run_id: 'other' } },
    { permit: { ...fixture.permit, route: 'owner-session' } },
    { permit: { ...fixture.permit, unexpected: true } },
    { permit: { ...fixture.permit, workflow_run_number: 0 } },
    { permit: { ...fixture.permit, approval_review_url: null } },
    { permit: { ...fixture.permit, approved_at: '2026-09-25' } },
    { permit: { ...fixture.permit, approved_at: '2026-09-26T00:00:00Z' } },
    { analysis: { limit: 4, escalate: [target] } },
    { analysis: { limit: 3, escalate: [target, { ...target, run_id: 'other' }] } },
    { analysis: { limit: 3, escalate: [{ ...target, repair_attempts_for_class: 2 }] } },
    { runsDoc: { runs: [{ ...original, attempted: false }, ...historical] } },
    { runsDoc: { runs: [original, ...historical.filter(row => row.run_id !== HISTORICAL_REPAIRS[0].run_id)] } },
    { runsDoc: { runs: [original, { ...historical[0], repair_of: ['other'] }, ...historical.slice(1)] } },
    { stopDoc: { stopped: true, agents: { actions: { stopped: false } } } },
    { stopDoc: { stopped: false, agents: { actions: { stopped: true } } } },
    { repairPresent: false },
    { ledgerProblems: ['invalid target'] },
    { now: new Date('2026-09-25T22:00:00Z') },
    { now: new Date('2026-09-26T00:30:00Z') },
    { now: new Date('2026-09-26T22:30:00Z') },
    ...[
      ['GITHUB_ACTIONS', 'false'], ['GITHUB_EVENT_NAME', 'workflow_dispatch'],
      ['GITHUB_REPOSITORY', 'other/repo'], ['GITHUB_WORKFLOW_REF', 'other'],
      ['GITHUB_REF', 'refs/heads/other'], ['GITHUB_RUN_ATTEMPT', '2'],
      ['GITHUB_RUN_NUMBER', '43'], ['GITHUB_RUN_ID', 'invalid'],
    ].map(([key, value]) => ({ env: { ...fixture.env, [key]: value } })),
  ];
  for (const change of denied) {
    assert.equal(decide(change).allowed, false, `permit unexpectedly admitted ${JSON.stringify(change)}`);
  }
  return denied.length + 1;
}
