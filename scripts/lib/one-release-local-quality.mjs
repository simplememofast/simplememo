/** A distinct, externally reviewed 5.9.13-only input. Never rewrites raw CI/device claims. */
import { createHash } from 'node:crypto';
export const SCHEMA = 'one_release_local_quality.v1';
export const REPOSITORY = 'simplememofast/simplememo-ios';
export const VERSION = '5.9.13';
export const REQUIRED_WORKFLOWS = [
  '.github/workflows/credential-coverage.yml',
  '.github/workflows/qa-static.yml',
  '.github/workflows/watch-bridge-parity.yml',
];
const CLOUD_CONTEXT = 'SimpleMemo | PR Check';
const MAX_AGE_MS = 6 * 3600 * 1000;
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x) => typeof x === 'string' && x.trim().length > 0;
const sha = (x) => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x);
const sha256 = (x) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const integer = (x) => Number.isSafeInteger(x) && x >= 0;
const time = (x) => typeof x === 'string' && /(?:Z|\+00:00)$/.test(x) ? Date.parse(x) : NaN;
const ref = (x) => object(x) && text(x.path) && x.path.length <= 2048 && sha256(x.sha256);
export const canonical = (x) => JSON.stringify(Array.isArray(x) ? x.map((v) => JSON.parse(canonical(v)))
  : object(x) ? Object.fromEntries(Object.keys(x).sort().filter((k) => x[k] !== undefined)
    .map((k) => [k, JSON.parse(canonical(x[k]))])) : x);
export const targetDigest = (target) => createHash('sha256').update(canonical(target)).digest('hex');
const sameIDs = (a, b) => Array.isArray(a) && a.every(integer) && new Set(a).size === a.length
  && a.length === b.length && a.every((v) => b.includes(v));
const latest = (rows, key) => {
  const out = new Map();
  for (const r of rows) if (!out.has(key(r)) || r.id > out.get(key(r)).id) out.set(key(r), r);
  return [...out.values()];
};

/** Validate facts supplied by collector + independent review; this does not query remote services. */
export function validateOneReleaseLocalQuality(q, { purpose, build, ci, now } = {}) {
  const errors = [];
  const require = (condition, code) => { if (!condition) errors.push(code); };
  if (!object(q)) return { accepted: false, errors: ['alternative_missing'] };
  const n = typeof now === 'number' ? now : time(now);
  const fresh = (v) => Number.isFinite(time(v)) && n >= time(v) && n - time(v) <= MAX_AGE_MS;
  require(Number.isFinite(n), 'now_invalid');
  require(q.schema === SCHEMA && q.repository === REPOSITORY && q.version === VERSION, 'schema_repo_version');
  require(['integration', 'submission'].includes(purpose) && q.purpose === purpose, 'purpose');
  require(q.status === 'active' && q.consumed === false, 'inactive_or_consumed');
  require(Number.isFinite(time(q.valid_from)) && Number.isFinite(time(q.expires_at))
    && time(q.valid_from) <= n && n < time(q.expires_at), 'not_active_or_expired');
  for (const k of ['target', 'authorization', 'review', 'local_build', 'fast_unit', 'simulator',
    'github', 'cloud', 'physical', 'known_failure_review']) require(object(q[k]), `${k}_missing`);
  if (errors.some((x) => x.endsWith('_missing'))) return { accepted: false, errors };
  const t = q.target;
  require(sha(t.source_sha) && sha(t.source_tree), 'source_binding_missing');
  require(sha256(t.simulator_inventory_sha256) && sha256(t.simulator_cases_sha256),
    'fixed_simulator_inventory_missing');
  require(object(build) && build.version === VERSION && build.sha === t.source_sha, 'build_source_version');
  require(object(ci) && ci.sha === t.source_sha && ci.collection_error == null, 'ci_binding_or_collection_error');
  require(object(ci?.one_release_local_quality) && canonical(ci.one_release_local_quality) === canonical(q),
    'ci_alternative_linkage');
  if (purpose === 'integration') {
    require(t.pr_number === 659 && sha(t.base_sha) && sha(t.merge_tree), 'integration_target');
    require(t.main_sha === undefined && t.apple_build_id === undefined && q.artifact === undefined,
      'integration_is_not_submission');
  } else {
    require(t.main_sha === t.source_sha && text(t.build_number) && /^[1-9][0-9]*$/.test(t.build_number)
      && text(t.apple_build_id), 'submission_target');
    require(build?.apple_build_id === t.apple_build_id && build?.testflight_build_number === t.build_number,
      'apple_build_binding');
  }
  const a = q.authorization;
  require(a.basis === 'direct_human_one_version_instruction' && a.version === VERSION && ref(a.ref)
    && Number.isFinite(time(a.human_instruction_observed_at)) && Number.isFinite(time(a.adopted_at))
    && time(a.human_instruction_observed_at) <= time(a.adopted_at) && time(a.adopted_at) <= n,
    'authorization_binding');
  require(a.target_sha256 === targetDigest(t) && q.review.target_sha256 === targetDigest(t),
    'independent_fixed_target_linkage');
  require(q.review.decision === 'ONE_RELEASE_LOCAL_QUALITY_ACCEPTED' && text(q.review.by)
    && ref(q.review.ref), 'independent_acceptance');
  require(q.known_failure_review.unresolved === 0 && ref(q.known_failure_review.ref), 'known_failure_unresolved');
  for (const k of ['local_build', 'fast_unit', 'simulator', 'github']) {
    require(q[k].source_sha === t.source_sha, `${k}_source`);
    require(fresh(q[k].observed_at), `${k}_freshness`);
  }
  require(q.local_build.conclusion === 'success' && q.local_build.native_exit_code === 0
    && ref(q.local_build.ref), 'local_build_failed_or_unproven');
  const f = q.fast_unit;
  require(f.scheme === 'SimpleMemoQA' && f.plan === 'TestPlans/SimpleMemo-FastUnit.xctestplan'
    && f.conclusion === 'passed' && f.whole_plan === true && f.attempts_reviewed === true
    && integer(f.expected_cases) && f.expected_cases > 0 && integer(f.passed) && f.passed > 0
    && f.failed === 0 && integer(f.skipped) && f.skipped <= 1
    && f.expected_failures === 0 && f.blocking_issues === 0 && f.unknown_cases === 0
    && f.passed + f.skipped === f.expected_cases && (f.skipped === 0 || f.skip_is_existing_physical_only === true)
    && ref(f.inventory_ref) && ref(f.ref), 'fast_unit_failed_or_incomplete');
  const s = q.simulator;
  require(s.coverage_ref?.sha256 === t.simulator_inventory_sha256
    && Array.isArray(s.required_cases) && s.required_cases.every(text)
    && createHash('sha256').update(canonical([...s.required_cases].sort())).digest('hex') === t.simulator_cases_sha256,
    'fixed_simulator_coverage_changed');
  require(s.conclusion === 'passed' && ref(s.ref) && ref(s.coverage_ref)
    && Array.isArray(s.required_cases) && s.required_cases.length > 0
    && s.required_cases.every(text) && new Set(s.required_cases).size === s.required_cases.length
    && Array.isArray(s.cases) && s.cases.length === s.required_cases.length
    && new Set(s.cases.map((r) => r?.identifier)).size === s.cases.length
    && s.cases.every((r) => object(r) && s.required_cases.includes(r.identifier)
      && r.conclusion === 'passed' && r.attempts === 1), 'simulator_coverage_or_failure');
  require(ref(q.github.raw_ref) && ref(q.cloud.raw_ref) && ref(q.physical.raw_ref), 'raw_refs_missing');
  const humanCloudReplacement = q.cloud.reason === 'human_authorized_local_quality';
  const cloudBasisAccepted = (q.cloud.reason === 'quota_exhausted' && q.cloud.quota_recovered === false)
    || (humanCloudReplacement && q.cloud.conclusion === 'cancelled'
      && q.cloud.cancellation_cause === 'unknown' && q.cloud.replaced_for_this_one_release === true
      && Object.hasOwn(q.cloud, 'quota_recovered') && q.cloud.quota_recovered === null
      && ref(q.cloud.reason_ref) && Object.keys(q.cloud.reason_ref).sort().join(',') === 'path,sha256'
      && canonical(q.cloud.reason_ref) === canonical(a.ref)
      && !Object.hasOwn(q.cloud, 'quota_ref') && !Object.hasOwn(q.cloud, 'not_run_ref'));
  require(['cancelled', 'unknown', 'not_run'].includes(q.cloud.conclusion) && cloudBasisAccepted
    && Array.isArray(q.cloud.unverified_check_ids) && q.cloud.unverified_check_ids.length === 0,
    'cloud_not_authorized_or_unqualified_check');
  require(q.physical.conclusion === 'unknown' && q.physical.replaced_for_this_one_release === true,
    'physical_raw_claim_changed');

  const raw = ci?.raw_evidence;
  require(object(raw) && raw.repository === REPOSITORY && raw.sha === t.source_sha
    && raw.collection_error === null && raw.collection_complete === true, 'raw_evidence_binding_or_error');
  if (object(raw)) {
    const checks = raw.check_runs?.check_runs;
    const statuses = raw.statuses;
    const workflows = raw.workflow_runs;
    require(object(raw.check_runs) && Array.isArray(checks) && integer(raw.check_runs.total_count)
      && raw.check_runs.total_count === checks.length && checks.length > 0
      && new Set(checks.map((r) => r?.id)).size === checks.length
      && checks.every((r) => object(r) && integer(r.id) && r.head_sha === t.source_sha && text(r.name)
        && r.app?.slug === 'github-actions' && integer(r.check_suite?.id)), 'check_rows_missing_or_unknown');
    require(Array.isArray(statuses) && statuses.every((r) => object(r) && integer(r.id)
      && text(r.context) && ['success', 'pending', 'error', 'failure'].includes(r.state)
      && (r.sha === undefined || r.sha === t.source_sha))
      && new Set(statuses?.map((r) => r?.id)).size === statuses?.length,
      'status_rows_missing_or_unknown');
    require(Array.isArray(workflows) && workflows.every((r) => object(r) && integer(r.id) && text(r.path)
      && r.head_sha === t.source_sha && r.repository?.full_name === REPOSITORY
      && r.head_repository?.full_name === REPOSITORY && integer(r.check_suite_id))
      && new Set(workflows?.map((r) => r?.id)).size === workflows?.length,
      'workflow_rows_missing_or_wrong_identity');
    if (Array.isArray(checks) && Array.isArray(statuses) && Array.isArray(workflows)
      && checks.every(object) && statuses.every(object) && workflows.every(object)) {
      const currentChecks = latest(checks, (r) => `${r.app?.slug}/${r.name}`);
      // Preserve existing non-required skipped/neutral semantics; required workflows below must pass.
      require(currentChecks.every((r) => r.status === 'completed'
        && ['success', 'skipped', 'neutral'].includes(r.conclusion)),
        'github_check_failed_or_pending');
      const currentStatuses = latest(statuses, (r) => r.context);
      const cloudRows = currentStatuses.filter((r) => r.context === CLOUD_CONTEXT && r.state !== 'success');
      if (humanCloudReplacement) require(cloudRows.length > 0
        && cloudRows.every((r) => r.state === 'failure' && r.description === 'cancelled'),
        'human_cloud_raw_cancellation_not_preserved');
      if (q.cloud.conclusion === 'not_run') {
        require(currentStatuses.every((r) => r.context !== CLOUD_CONTEXT)
          && sameIDs(q.cloud.unverified_status_ids, []) && ref(q.cloud.not_run_ref)
          && ref(q.cloud.quota_ref), 'not_run_current_rows_or_proof_conflict');
      } else {
        require(cloudRows.length > 0 && sameIDs(q.cloud.unverified_status_ids, cloudRows.map((r) => r.id)),
          'cloud_rows_missing_changed_or_duplicate');
      }
      require(currentStatuses.filter((r) => !cloudRows.includes(r)).every((r) => r.state === 'success'),
        'noncloud_status_failed_or_unknown');
      const currentRuns = latest(workflows, (r) => r.path);
      for (const path of REQUIRED_WORKFLOWS) {
        const r = currentRuns.find((v) => v.path === path);
        require(r?.status === 'completed' && r?.conclusion === 'success'
          && currentChecks.some((c) => c.check_suite?.id === r.check_suite_id
            && c.status === 'completed' && c.conclusion === 'success'), `required_workflow:${path}`);
      }
    }
  }
  if (purpose === 'submission') {
    const b = q.artifact;
    require(object(b), 'artifact_missing');
    if (object(b)) {
      require(b.source_sha === t.source_sha && b.apple_build_id === t.apple_build_id
        && b.build_number === t.build_number && b.version === VERSION, 'artifact_binding');
      require(sha256(b.archive_sha256) && sha256(b.ipa_sha256) && sha256(b.source_inputs_sha256)
        && b.archive_sha256 === t.archive_sha256 && b.ipa_sha256 === t.ipa_sha256
        && b.source_inputs_sha256 === t.source_inputs_sha256
        && b.distribution_signed === true && b.archive_signature_verified === true
        && b.ipa_signature_verified === true && b.four_bundle_identity_verified === true
        && b.source_custody_verified === true && b.package_resource_inputs_verified === true
        && ref(b.independent_acceptance_ref), 'signature_or_compiled_custody_unknown');
      require(Number.isFinite(time(b.testflight_available_at)) && time(b.testflight_available_at) <= n
        && ref(b.testflight_availability_ref) && b.processing_state === 'VALID'
        && b.distribution_eligibility === 'APP_STORE_ELIGIBLE', 'manual_availability_or_eligibility');
      const availability = build?.testflight_availability;
      require(object(availability) && availability.schema === 'one_release_manual_distribution_availability.v1'
        && availability.apple_build_id === t.apple_build_id && availability.source_sha === t.source_sha
        && availability.available_at === b.testflight_available_at
        && canonical(availability.ref) === canonical(b.testflight_availability_ref)
        && build.testflight_available_at === b.testflight_available_at, 'manual_availability_linkage');
    }
  }
  return { accepted: errors.length === 0, errors, purpose, version: VERSION,
    consumption_required: errors.length === 0, consume_once_for: purpose,
    cloud_success_claimed: false, physical_success_claimed: false };
}
