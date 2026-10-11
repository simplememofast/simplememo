// Synthetic contract tests only. No native, device, signing, Cloud or submission actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { validateOneReleaseLocalQuality, targetDigest, REQUIRED_WORKFLOWS } from './lib/one-release-local-quality.mjs';
import { evaluateSubmission, evaluateRelease, evaluateIntegration } from './check-release-gate.mjs';
import { toGateInput, evaluateBoth, loadMaterials } from './release-gate-run.mjs';
import { importClosure, sha12, drift } from './check-review-gate-pin.mjs';

const NOW = '2026-10-02T09:00:00Z';
const SOURCE = 'a'.repeat(40);
const REF = (name) => ({ path: `/synthetic/no-runtime/${name}.json`, sha256: 'b'.repeat(64) });
const clone = (x) => JSON.parse(JSON.stringify(x));
const readSource = (rel) => { try { return fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'); } catch { return null; } };
test('runtime import closure pins the new validator and rejects a missing dependency', () => {
  const closure = importClosure('scripts/release-gate-run.mjs', { read: readSource });
  assert.deepEqual(closure.missing, []);
  assert.ok(closure.files.includes('scripts/lib/one-release-local-quality.mjs'));
  const actual = Object.fromEntries(closure.files.map(f => [f, sha12(readSource(f))]));
  assert.deepEqual(drift(actual, actual), []);
  const absent = { ...actual }; delete absent['scripts/lib/one-release-local-quality.mjs'];
  assert.ok(drift(absent, actual).length > 0);
});
test('validator byte mutation and old closure fingerprints reject instead of silently accepting', () => {
  const { files } = importClosure('scripts/release-gate-run.mjs', { read: readSource });
  const actual = Object.fromEntries(files.map(f => [f, sha12(readSource(f))]));
  const changed = { ...actual, 'scripts/lib/one-release-local-quality.mjs': sha12(readSource('scripts/lib/one-release-local-quality.mjs') + '\n// mutation') };
  assert.ok(drift(actual, changed).length > 0);
  // Retained primary snapshot, independent of the pin update in this PR.
  const oldPin = { files: {
    'scripts/check-release-gate.mjs': '46dd04800867',
    'scripts/lib/selftest.mjs': '498def1338f8',
    'scripts/release-gate-run.mjs': '40173fdfbf97',
  } };
  assert.ok(drift(oldPin.files, actual).length > 0);
});
const policy = { enabled: true, kill_switch: false, dry_run: false, daily_cap: 1,
  require_ci_green: true, require_phased_release: true, require_release_notes_locales: ['ja', 'en-US'],
  min_testflight_soak_hours: 0, min_approved_soak_hours: 6, min_crash_free_sessions: 100,
  max_crash_free_shortfall_pt: 0.1, cooldown_after_kill_days: 3 };

function fixture(purpose = 'submission') {
  const target = { source_sha: SOURCE, source_tree: 'c'.repeat(40), simulator_inventory_sha256: 'b'.repeat(64),
    simulator_cases_sha256: createHash('sha256').update(JSON.stringify(['Synthetic/Offline', 'Synthetic/Vault', 'Synthetic/Watch'])).digest('hex'),
    ...(purpose === 'integration' ? { pr_number: 659, base_sha: 'd'.repeat(40), merge_tree: 'e'.repeat(40) }
      : { main_sha: SOURCE, build_number: '2004', apple_build_id: 'synthetic-apple-2004',
        archive_sha256: '1'.repeat(64), ipa_sha256: '2'.repeat(64), source_inputs_sha256: '3'.repeat(64) }) };
  const bound = (name) => ({ source_sha: SOURCE, observed_at: '2026-10-02T08:59:00Z', ref: REF(name) });
  const q = { schema: 'one_release_local_quality.v1', purpose, repository: 'simplememofast/simplememo-ios',
    version: '5.9.13', target, status: 'active', consumed: false,
    valid_from: '2026-10-02T08:00:00Z', expires_at: '2026-10-03T08:00:00Z',
    authorization: { basis: 'direct_human_one_version_instruction', version: '5.9.13',
      human_instruction_observed_at: '2026-10-02T07:00:00Z', adopted_at: '2026-10-02T08:00:00Z',
      target_sha256: targetDigest(target), ref: REF('authorization') },
    review: { decision: 'ONE_RELEASE_LOCAL_QUALITY_ACCEPTED', by: 'synthetic-reviewer',
      target_sha256: targetDigest(target), ref: REF('review') },
    known_failure_review: { unresolved: 0, ref: REF('failure-scope-review') },
    local_build: { ...bound('build'), conclusion: 'success', native_exit_code: 0 },
    fast_unit: { ...bound('fast'), scheme: 'SimpleMemoQA', plan: 'TestPlans/SimpleMemo-FastUnit.xctestplan',
      conclusion: 'passed', whole_plan: true, expected_cases: 3, passed: 3, failed: 0,
      skipped: 0, expected_failures: 0, unknown_cases: 0, blocking_issues: 0,
      attempts_reviewed: true, inventory_ref: REF('inventory') },
    simulator: { ...bound('sim'), conclusion: 'passed', coverage_ref: REF('coverage'),
      required_cases: ['Synthetic/Offline', 'Synthetic/Vault', 'Synthetic/Watch'],
      cases: ['Synthetic/Offline', 'Synthetic/Vault', 'Synthetic/Watch']
        .map((identifier) => ({ identifier, conclusion: 'passed', attempts: 1 })) },
    github: { source_sha: SOURCE, observed_at: '2026-10-02T08:59:00Z', raw_ref: REF('github') },
    cloud: { conclusion: 'cancelled', reason: 'quota_exhausted', quota_recovered: false,
      unverified_check_ids: [], unverified_status_ids: [70], raw_ref: REF('cloud') },
    physical: { conclusion: 'unknown', replaced_for_this_one_release: true, raw_ref: REF('physical') } };
  const build = { version: '5.9.13', sha: SOURCE, in_review: false, open_blockers: 0,
    testflight_state: 'VALID', testflight_available_at: '2026-10-02T08:30:00Z' };
  if (purpose === 'submission') {
    q.artifact = { source_sha: SOURCE, apple_build_id: target.apple_build_id, build_number: '2004', version: '5.9.13',
      archive_sha256: target.archive_sha256, ipa_sha256: target.ipa_sha256, source_inputs_sha256: target.source_inputs_sha256,
      distribution_signed: true, archive_signature_verified: true, ipa_signature_verified: true,
      four_bundle_identity_verified: true, source_custody_verified: true, package_resource_inputs_verified: true,
      independent_acceptance_ref: REF('artifact'), testflight_available_at: build.testflight_available_at,
      testflight_availability_ref: REF('manual-availability'), processing_state: 'VALID', distribution_eligibility: 'APP_STORE_ELIGIBLE' };
    Object.assign(build, { apple_build_id: target.apple_build_id, testflight_build_number: '2004',
      testflight_availability: { schema: 'one_release_manual_distribution_availability.v1', source_sha: SOURCE,
        apple_build_id: target.apple_build_id, available_at: build.testflight_available_at, ref: q.artifact.testflight_availability_ref } });
  }
  const checks = REQUIRED_WORKFLOWS.map((_, i) => ({ id: i + 1, name: `synthetic-job-${i}`, head_sha: SOURCE,
    app: { slug: 'github-actions' }, check_suite: { id: i + 100 }, status: 'completed', conclusion: 'success' }));
  const runs = REQUIRED_WORKFLOWS.map((path, i) => ({ id: i + 10, path, head_sha: SOURCE,
    check_suite_id: i + 100, repository: { full_name: 'simplememofast/simplememo-ios' },
    head_repository: { full_name: 'simplememofast/simplememo-ios' }, status: 'completed', conclusion: 'success' }));
  return { policy: clone(policy), build, ci: { sha: SOURCE, conclusion: 'pending', collection_error: null,
    one_release_local_quality: q, raw_evidence: { repository: 'simplememofast/simplememo-ios', sha: SOURCE,
      collection_error: null, collection_complete: true, check_runs: { total_count: checks.length, check_runs: checks },
      statuses: [{ id: 70, context: 'SimpleMemo | PR Check', state: 'pending' }], workflow_runs: runs } },
    quality_alternative: q, releaseNotes: { ja: 'synthetic', 'en-US': 'synthetic' },
    review: { submission_open: false, phased_release: true, release_type: 'MANUAL' }, doneToday: 0, now: NOW };
}
function validate(input) {
  return validateOneReleaseLocalQuality(input.quality_alternative,
    { purpose: input.quality_alternative.purpose, build: input.build, ci: input.ci, now: input.now });
}
test('submission alternative is distinct; pending Cloud/unknown physical remain byte-identical', () => {
  const x = fixture(); const before = JSON.stringify(x);
  assert.equal(evaluateSubmission(x).decision, 'submit');
  assert.equal(evaluateSubmission(x).consumption_required, true);
  assert.equal(evaluateSubmission(x).cloud_success_claimed, false);
  assert.equal(evaluateSubmission(x).physical_success_claimed, false);
  assert.equal(JSON.stringify(x), before);
});
test('integration is separate from submission; no Apple/Review artifact proof is invented', () => {
  const x = fixture('integration'); delete x.review;
  assert.equal(evaluateIntegration(x).decision, 'integrate');
  assert.equal(evaluateIntegration(x).consume_once_for, 'integration');
  assert.equal(evaluateSubmission(x).decision, 'hold');
  assert.equal(evaluateIntegration(fixture()).decision, 'hold');
});
const negatives = [
  ['other version', x => x.quality_alternative.version = '5.9.14'],
  ['other repository', x => x.quality_alternative.repository = 'other/repo'],
  ['old schema', x => x.quality_alternative.schema = 'legacy'],
  ['wrong build source', x => x.build.sha = 'f'.repeat(40)],
  ['old source target without independent new adoption', x => x.quality_alternative.target.source_sha = 'f'.repeat(40)],
  ['wrong target tree adoption', x => x.quality_alternative.target.source_tree = 'f'.repeat(40)],
  ['CI wrong SHA', x => x.ci.sha = 'f'.repeat(40)],
  ['wrong Apple ID', x => x.build.apple_build_id = 'wrong'],
  ['wrong build number', x => x.build.testflight_build_number = '2000'],
  ['wrong artifact SHA', x => x.quality_alternative.artifact.ipa_sha256 = '9'.repeat(64)],
  ['missing artifact', x => delete x.quality_alternative.artifact],
  ['wrong source-input SHA', x => x.quality_alternative.artifact.source_inputs_sha256 = '9'.repeat(64)],
  ['signature unknown', x => delete x.quality_alternative.artifact.ipa_signature_verified],
  ['Development signature is not distribution', x => x.quality_alternative.artifact.distribution_signed = false],
  ['compiled custody missing', x => x.quality_alternative.artifact.source_custody_verified = false],
  ['manual availability unbound', x => delete x.build.testflight_availability],
  ['fake Cloud origin availability', x => x.build.testflight_availability.schema = 'cloud_run_availability'],
  ['not AppStore eligible', x => x.quality_alternative.artifact.distribution_eligibility = 'UNKNOWN'],
  ['expired', x => x.quality_alternative.expires_at = NOW],
  ['future validity', x => x.quality_alternative.valid_from = '2026-10-03T01:00:00Z'],
  ['revoked', x => x.quality_alternative.status = 'revoked'],
  ['consumed', x => x.quality_alternative.consumed = true],
  ['missing consumption state', x => delete x.quality_alternative.consumed],
  ['authorization missing', x => delete x.quality_alternative.authorization.ref],
  ['review missing', x => delete x.quality_alternative.review.ref],
  ['known SDK6/required-suite failure unresolved', x => x.quality_alternative.known_failure_review.unresolved = 1],
  ['native build failed', x => x.quality_alternative.local_build.native_exit_code = 65],
  ['stale Build observation', x => x.quality_alternative.local_build.observed_at = '2026-10-01T01:00:00Z'],
  ['FastUnit failed', x => x.quality_alternative.fast_unit.failed = 1],
  ['partial plan', x => x.quality_alternative.fast_unit.whole_plan = false],
  ['unknown cases', x => x.quality_alternative.fast_unit.unknown_cases = 1],
  ['hidden attempts unreviewed', x => x.quality_alternative.fast_unit.attempts_reviewed = false],
  ['unexpected physical skip', x => { x.quality_alternative.fast_unit.skipped = 1; x.quality_alternative.fast_unit.passed = 2; }],
  ['cherry-picked simulator inventory', x => { x.quality_alternative.simulator.required_cases.pop(); x.quality_alternative.simulator.cases.pop(); }],
  ['changed simulator inventory hash', x => x.quality_alternative.simulator.coverage_ref.sha256 = '9'.repeat(64)],
  ['incomplete collector', x => x.ci.raw_evidence.collection_complete = false],
  ['simulator missing case', x => x.quality_alternative.simulator.cases.pop()],
  ['simulator duplicate case', x => x.quality_alternative.simulator.cases[1].identifier = 'Synthetic/Offline'],
  ['simulator retry', x => x.quality_alternative.simulator.cases[0].attempts = 2],
  ['simulator failed', x => x.quality_alternative.simulator.cases[0].conclusion = 'failed'],
  ['missing raw CI', x => delete x.ci.raw_evidence],
  ['collection error', x => x.ci.raw_evidence.collection_error = 'error'],
  ['CI outer collection error', x => x.ci.collection_error = 'error'],
  ['missing check row', x => x.ci.raw_evidence.check_runs.check_runs.pop()],
  ['missing all raw check rows', x => { x.ci.raw_evidence.check_runs.check_runs = []; x.ci.raw_evidence.check_runs.total_count = 0; }],
  ['GitHub failed', x => x.ci.raw_evidence.check_runs.check_runs[0].conclusion = 'failure'],
  ['GitHub pending', x => x.ci.raw_evidence.check_runs.check_runs[0].status = 'in_progress'],
  ['wrong authenticated workflow repository', x => x.ci.raw_evidence.workflow_runs[0].repository.full_name = 'fork/repo'],
  ['missing required workflow', x => x.ci.raw_evidence.workflow_runs.pop()],
  ['wrong check suite', x => x.ci.raw_evidence.workflow_runs[0].check_suite_id = 999],
  ['Cloud cancellation not quota', x => x.quality_alternative.cloud.reason = 'test_failure'],
  ['quota recovered', x => x.quality_alternative.cloud.quota_recovered = true],
  ['Cloud failure is not cancellation', x => x.quality_alternative.cloud.conclusion = 'failure'],
  ['Cloud raw row missing', x => x.ci.raw_evidence.statuses = []],
  ['unknown status state', x => x.ci.raw_evidence.statuses[0].state = 'unrecognized'],
  ['wrong explicit Cloud IDs', x => x.quality_alternative.cloud.unverified_status_ids = [71]],
  ['duplicate exemption', x => x.quality_alternative.cloud.unverified_status_ids = [70,70]],
  ['unqualified Xcode Cloud check exclusion', x => x.quality_alternative.cloud.unverified_check_ids = [1]],
  ['status SHA mismatched when present', x => x.ci.raw_evidence.statuses[0].sha = 'f'.repeat(40)],
  ['non-Cloud failure cannot be exempted', x => x.ci.raw_evidence.statuses.push({ id: 80, context: 'credential coverage', state: 'failure' })],
  ['physical unknown changed to fake passed', x => x.quality_alternative.physical.conclusion = 'passed'],
  ['CI duplicate envelope changed', x => x.ci.one_release_local_quality = {}],
];
for (const [name, mutate] of negatives) test(`hold: ${name}`, () => {
  const x = fixture(); mutate(x);
  assert.equal(validate(x).accepted, false, name);
  assert.equal(evaluateSubmission(x).decision, 'hold', name);
});
test('known one physical-only FastUnit skip stays an explicit skip', () => {
  const x = fixture(); Object.assign(x.quality_alternative.fast_unit, { passed: 2, skipped: 1, skip_is_existing_physical_only: true });
  assert.equal(evaluateSubmission(x).decision, 'submit');
  assert.equal(x.quality_alternative.fast_unit.skipped, 1);
});
test('ordinary CI/device route remains unchanged outside this version', () => {
  const x = fixture(); delete x.quality_alternative; delete x.ci.one_release_local_quality;
  x.build.version = '5.9.14'; x.ci.conclusion = 'success';
  Object.assign(x.build, { device_verified_by: 'synthetic-reviewer', device_verified_at: NOW, device_verified_sha: SOURCE });
  assert.equal(evaluateSubmission(x).decision, 'submit');
  delete x.build.device_verified_by; assert.equal(evaluateSubmission(x).decision, 'hold');
});
test('mapper carries both distinct linked envelopes without changing raw input', () => {
  const x = fixture(); const materials = { collected_at: NOW, ...x }; const before = JSON.stringify(materials);
  const input = toGateInput({ ledger: { policy, releases: [] }, materials, now: NOW });
  assert.equal(evaluateBoth(input).actual.submission.decision, 'submit');
  assert.equal(input.ci.conclusion, 'pending'); assert.equal(JSON.stringify(materials), before);
  const a = fixture('integration');
  assert.equal(evaluateBoth(toGateInput({ ledger: { policy }, materials: a, now: NOW })).actual.integration.decision, 'integrate');
});
test('ordinary gates are retained with alternate evidence', () => {
  for (const mutate of [x => x.policy.enabled = false, x => x.policy.kill_switch = true,
    x => x.doneToday = 1, x => x.review.submission_open = true, x => x.review.phased_release = false,
    x => x.review.release_type = 'AFTER_APPROVAL', x => x.policy.require_ci_green = false,
    x => x.build.in_review = true, x => x.build.open_blockers = 1,
    x => x.build.testflight_state = 'PROCESSING', x => x.releaseNotes.ja = '']) {
    const x = fixture(); mutate(x); assert.equal(evaluateSubmission(x).decision, 'hold');
  }
});
test('release6h/health/cooldown remain independent; alternative gives no release permission', () => {
  const x = fixture(); Object.assign(x, { review: { version: '5.9.13', state: 'PENDING_DEVELOPER_RELEASE',
    phased_release: true, approved_at: '2026-10-02T04:00:00Z' }, health: { sessions: 1000, crash_free_pct: 99.99, baseline_pct: 99.99 }, guard: { last_kill_at: null } });
  assert.equal(evaluateRelease(x).decision, 'hold');
  x.review.approved_at = '2026-10-02T03:00:00Z'; assert.equal(evaluateRelease(x).decision, 'release');
  x.guard.last_kill_at = NOW; assert.equal(evaluateRelease(x).decision, 'hold');
});
test('stale material drops the alternate as well as raw CI', () => {
  assert.equal(loadMaterials({ text: JSON.stringify({ collected_at: '2026-10-01T00:00:00Z', ...fixture() }), now: NOW }).data, null);
});
test('published JSON schema matches the reviewed type and both purposes', () => {
  const s = JSON.parse(fs.readFileSync(new URL('../data/one-release-local-quality.schema.json', import.meta.url)));
  assert.equal(s.$id, 'one_release_local_quality.v1');
  assert.deepEqual(s.properties.purpose.enum, ['integration', 'submission']);
  assert.equal(s.properties.consumed.const, false);
});

test('quota-bound intentionally not-run Cloud needs no new Cloud job or invented ID', () => {
  const x = fixture(); const q = x.quality_alternative;
  Object.assign(q.cloud, { conclusion: 'not_run', unverified_status_ids: [], not_run_ref: REF('not-run'), quota_ref: REF('quota') });
  x.ci.raw_evidence.statuses = [];
  assert.equal(evaluateSubmission(x).decision, 'submit');
  assert.equal(x.ci.conclusion, 'pending'); assert.equal(q.cloud.conclusion, 'not_run');
  for (const mutate of [y => delete y.quality_alternative.cloud.not_run_ref,
    y => delete y.quality_alternative.cloud.quota_ref,
    y => y.quality_alternative.cloud.unverified_status_ids.push(70),
    y => y.ci.raw_evidence.statuses.push({ id: 70, context: 'SimpleMemo | PR Check', state: 'pending' }),
    y => y.ci.raw_evidence.statuses.push({ id: 70, context: 'SimpleMemo | PR Check', state: 'success' }),
    y => y.ci.raw_evidence.statuses.push({ id: 70, context: 'unqualified Cloud', state: 'pending' })]) {
    const y = clone(x); y.ci.one_release_local_quality = y.quality_alternative; mutate(y);
    assert.equal(evaluateSubmission(y).decision, 'hold');
  }
});
test('non-required skipped Watch check stays skipped; required workflow cannot skip', () => {
  const x = fixture();
  x.ci.raw_evidence.check_runs.check_runs.push({ id: 44, name: 'Non-required Watch matrix',
    head_sha: SOURCE, app: { slug: 'github-actions' }, check_suite: { id: 144 },
    status: 'completed', conclusion: 'skipped' });
  x.ci.raw_evidence.check_runs.total_count += 1;
  assert.equal(evaluateSubmission(x).decision, 'submit');
  assert.equal(x.ci.raw_evidence.check_runs.check_runs.at(-1).conclusion, 'skipped');
  x.ci.raw_evidence.workflow_runs[0].conclusion = 'skipped';
  assert.equal(evaluateSubmission(x).decision, 'hold');
});
