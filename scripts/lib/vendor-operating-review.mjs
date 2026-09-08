import crypto from 'node:crypto';
import path from 'node:path';
import { assert } from './selftest.mjs';

export const VENDOR_REVIEW_AREAS = ['dpa', 'data_use', 'sla', 'exit'];
export const VENDOR_RECHECK_EVENTS = ['account_or_plan_change', 'processing_change',
  'terms_or_subprocessor_notice', 'incident', 'before_termination'];
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const vendorInventoryHash = doc => sha256(JSON.stringify(canonical({
  vendors: doc.vendors, discovered_dependencies: doc.discovered_dependencies,
})));

// Check review integrity and scope, never the truth of a legal judgment. Files
// are public review records, not copies of private contracts or customer data.
export function vendorReviewProblems(review, inventory, { readFile, now = new Date() }) {
  const errors = [], fail = why => errors.push(`Vendor operating review: ${why}`);
  if (!review || typeof review !== 'object') return ['Vendor operating review: missing record'];
  if (review.schema !== 1 || !nonempty(review.id) || review.actor !== 'ai'
      || review.authority !== 'owner_delegation_2026_09_08'
      || review.scope !== 'dpa_data_use_sla_exit_operating_decision'
      || review.contract_approved !== false || review.payment_authorized !== false
      || review.historical_human_reviews_replaced !== false) fail('actor, scope or authority claim invalid');
  const at = Date.parse(review.reviewed_at), until = Date.parse(`${review.valid_until}T23:59:59Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review.valid_until)
      || !Number.isFinite(at) || !Number.isFinite(until)
      || new Date(until).toISOString().slice(0, 10) !== review.valid_until || at > Number(now)
      || until < Number(now) || until < at || until - at > 32 * 86400000) fail('invalid or expired review dates');
  if (review.inventory_sha256 !== vendorInventoryHash(inventory)) fail('inventory changed; reassessment required');
  if (JSON.stringify(review.recheck_on) !== JSON.stringify(VENDOR_RECHECK_EVENTS)) fail('missing reassessment trigger');
  const sources = new Map();
  if (!Array.isArray(review.evidence_files) || !review.evidence_files.length) fail('missing evidence files');
  else for (const file of review.evidence_files) {
    if (!file || !nonempty(file.path) || path.isAbsolute(file.path)
        || file.path.split('/').includes('..') || !file.path.startsWith('docs/')
        || !/^[a-f0-9]{64}$/.test(file.sha256) || sources.has(file.path)) {
      fail('invalid or duplicate evidence path/hash'); continue;
    }
    sources.set(file.path, file.sha256);
    try { if (sha256(readFile(file.path)) !== file.sha256) fail(`evidence changed: ${file.path}`); }
    catch { fail(`evidence unavailable: ${file.path}`); }
  }
  const ids = [...inventory.vendors, ...inventory.discovered_dependencies].map(v => v.id);
  if (new Set(ids).size !== ids.length) fail('duplicate inventory identity');
  const seen = new Set();
  if (!Array.isArray(review.decisions)) return [...errors, 'Vendor operating review: missing decisions'];
  for (const row of review.decisions) {
    if (!row || !ids.includes(row.vendor_id) || seen.has(row.vendor_id)) {
      fail('unknown or duplicate vendor decision'); continue;
    }
    seen.add(row.vendor_id);
    const rowKeys = ['vendor_id', 'decision', 'risk', 'processing_scope', 'account_applicability',
      'conditions', 'unresolved', 'evidence', 'findings'];
    if (Object.keys(row).some(key => !rowKeys.includes(key))) fail(`${row.vendor_id}: unsupported claim field`);
    if (row.decision !== 'continue_existing_scope_with_conditions'
        || !['yellow', 'red'].includes(row.risk) || !nonempty(row.processing_scope)
        || row.account_applicability !== 'not_fully_verified') fail(`${row.vendor_id}: unsupported decision or applicability`);
    for (const key of ['conditions', 'unresolved', 'evidence']) {
      if (!Array.isArray(row[key]) || !row[key].length || row[key].some(v => !nonempty(v)))
        fail(`${row.vendor_id}: missing ${key}`);
    }
    if (Array.isArray(row.evidence) && row.evidence.some(ref => !sources.has(ref))) fail(`${row.vendor_id}: unbound evidence`);
    if (!row.findings || JSON.stringify(Object.keys(row.findings).sort())
        !== JSON.stringify([...VENDOR_REVIEW_AREAS].sort())) fail(`${row.vendor_id}: four review areas required`);
    for (const area of VENDOR_REVIEW_AREAS) {
      const finding = row.findings?.[area];
      if (!finding || !['conditional', 'risk', 'not_identified'].includes(finding.result)
          || !nonempty(finding.assessment) || !nonempty(finding.action)) fail(`${row.vendor_id}: incomplete ${area}`);
    }
  }
  for (const id of ids) if (!seen.has(id)) fail(`missing decision: ${id}`);
  for (const item of inventory.discovered_dependencies) {
    if (item.status === 'account_verification_pending' && item.operating_review_id !== review.id)
      fail(`${item.id}: discovery review reference mismatch`);
  }
  return errors;
}

export const vendorReviewScenarios = [['operating review rejects incomplete, stale or falsely approved decisions', () => {
  const inventory = { vendors: [{ id: 'registered' }], discovered_dependencies: [{ id: 'discovered' }] };
  const review = { schema: 1, id: 'fixture', actor: 'ai', authority: 'owner_delegation_2026_09_08',
    scope: 'dpa_data_use_sla_exit_operating_decision', contract_approved: false, payment_authorized: false,
    historical_human_reviews_replaced: false, reviewed_at: '2026-09-08T00:00:00Z', valid_until: '2026-10-08',
    inventory_sha256: vendorInventoryHash(inventory), recheck_on: [...VENDOR_RECHECK_EVENTS],
    evidence_files: [{ path: 'docs/fixture.md', sha256: sha256('fixture') }],
    decisions: ['registered', 'discovered'].map(vendor_id => ({ vendor_id, risk: 'red',
      processing_scope: 'Known existing use', decision: 'continue_existing_scope_with_conditions',
      account_applicability: 'not_fully_verified', conditions: ['No expansion'], unresolved: ['Assent'],
      evidence: ['docs/fixture.md'], findings: Object.fromEntries(VENDOR_REVIEW_AREAS.map(area => [area,
        { result: 'risk', assessment: 'Unresolved evidence', action: 'Bound existing use' }])) })) };
  const options = { now: new Date('2026-09-08T01:00:00Z'), readFile: () => 'fixture' };
  assert(vendorReviewProblems(review, inventory, options).length === 0, 'valid conditional decision rejected');
  for (const mutate of [
    r => { r.decisions.pop(); }, r => { r.decisions.push(structuredClone(r.decisions[0])); },
    r => { delete r.decisions[0].findings.exit; }, r => { r.decisions[0].unresolved = []; },
    r => { r.decisions[0].conditions = []; }, r => { r.decisions[0].evidence = ['docs/unknown.md']; },
    r => { r.actor = 'human'; }, r => { r.contract_approved = true; }, r => { r.payment_authorized = true; },
    r => { r.historical_human_reviews_replaced = true; },
    r => { r.decisions[0].account_applicability = 'verified'; }, r => { r.recheck_on.pop(); },
    r => { r.valid_until = '2026-09-07'; }, r => { r.reviewed_at = '2026-09-09T00:00:00Z'; },
    r => { r.valid_until = '2027-01-01'; }, r => { r.evidence_files[0].path = 'docs/../../private'; },
    r => { r.valid_until = '2026-09-31'; }, r => { r.decisions[0].contract_approved = true; },
  ]) {
    const bad = structuredClone(review); mutate(bad);
    assert(vendorReviewProblems(bad, inventory, options).length > 0, 'invalid decision accepted');
  }
  assert(vendorReviewProblems(null, inventory, options).length > 0, 'missing review accepted');
  const changedInventory = structuredClone(inventory);
  changedInventory.vendors[0].used_for = 'Additional private data';
  assert(vendorReviewProblems(review, changedInventory, options).length > 0, 'scope drift accepted');
  assert(vendorReviewProblems(review, inventory, { ...options, readFile: () => 'changed' }).length > 0, 'changed evidence accepted');
  assert(vendorReviewProblems(review, inventory, { ...options, readFile: () => { throw new Error('missing'); } }).length > 0, 'missing evidence accepted');
}]];
