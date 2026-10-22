'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorkflowRunner } = require('./cache_access_workflow.cjs');

const SHA = 'a'.repeat(40), HEAD = 'b'.repeat(40), HASH = 'c'.repeat(64);
const DEPLOYMENT = '1234abcd-0000-4000-8000-000000000000';
function fixture(change = {}) {
  const events = [], environment = {
    TRUSTED_WORKFLOW_REF: 'simplememofast/simplememo/.github/workflows/home-perf-cache-approved.yml@refs/heads/main',
    TRUSTED_WORKFLOW_SHA: SHA, TRUSTED_CHECKOUT_SHA: SHA, GITHUB_RUN_ATTEMPT: '1',
    GITHUB_TRIGGERING_ACTOR: 'simplememofast', REQUESTED_HEAD_SHA: HEAD,
    APPROVAL_VALID_UNTIL: '2026-10-22T12:00:00Z', EXPECTED_MANIFEST_SHA256: HASH,
    EXPECTED_DEPLOYMENT_ID: DEPLOYMENT,
  };
  for (const field of ['CF_ACCESS_PREVIEW_CLIENT_ID', 'CF_ACCESS_PREVIEW_CLIENT_SECRET']) {
    Object.defineProperty(environment, field, { get() { events.push('credential'); return 'synthetic-only'; } });
  }
  const authorization = { headSha: HEAD, manifestSha256: HASH, deploymentId: DEPLOYMENT,
    previewOrigin: 'https://1234abcd.simplememo-596.pages.dev', validUntil: environment.APPROVAL_VALID_UNTIL,
    manifest: { version: 1, headSha: HEAD, assets: { ['assets/home-perf/image-' + 'c'.repeat(12) + '.avif']: { sha256: HASH, bytes: 5 } } } };
  const capability = Object.freeze({ synthetic: true });
  const receipt = { version: 1, verified: true, checks: { response: true } };
  const dependencies = {
    clock: () => Date.parse('2026-10-22T11:00:00Z'),
    readApproval: async input => {
      events.push('approval');
      assert.equal(input.context.runId, 123);
      assert.equal(input.context.checkoutSha, SHA);
      assert.equal(typeof input.now, 'function');
      return capability;
    },
    resolve: async input => {
      events.push('fresh-metadata');
      assert.equal(input.approval, capability);
      assert.equal(input.request.approvedHeadSha, HEAD);
      assert.equal(input.request.pullRequestNumber, 2139);
      assert.ok(!Object.hasOwn(input.context, 'runId'));
      return { authorization };
    },
    transport: input => {
      events.push('transport');
      assert.equal(input.origin, authorization.previewOrigin);
      assert.ok(input.paths.includes('/assets/home-perf/manifest.json'));
      assert.ok(input.paths.every(value => !value.startsWith('/admin')));
      return { request: async () => { events.push('request'); return {}; } };
    },
    verify: async ({ manifest, request }) => {
      events.push('contract');
      assert.equal(manifest, authorization.manifest);
      await request({ path: '/' });
      return receipt;
    },
    ...change,
  };
  return { runner: createWorkflowRunner(dependencies), events, authorization, receipt, options: {
    github: {}, context: { repo: { owner: 'simplememofast', repo: 'simplememo' }, eventName: 'workflow_dispatch',
      ref: 'refs/heads/main', sha: SHA, actor: 'simplememofast', runId: 123 },
    environment, configuration: { configurationReadback: { synthetic: true } },
  } };
}

test('credentials are read only after independent approval, fresh metadata and exact preflight binding', async () => {
  const f = fixture();
  assert.equal(await f.runner.verifyCurrentRun(f.options), f.receipt);
  assert.deepEqual(f.events, ['approval', 'fresh-metadata', 'credential', 'credential', 'transport', 'contract', 'request']);
});

test('missing settings readback cannot contact an API or read either credential', async () => {
  const f = fixture();
  f.options.configuration.configurationReadback = null;
  await assert.rejects(f.runner.verifyCurrentRun(f.options), /^Error: PREVIEW_WORKFLOW_REJECTED$/);
  assert.deepEqual(f.events, []);
});

for (const stage of ['readApproval', 'resolve']) test(`${stage} failure stops before credential access without reflecting its error`, async () => {
  const f = fixture({ [stage]: async () => { throw new Error('synthetic-secret-raw-error'); } });
  await assert.rejects(f.runner.verifyCurrentRun(f.options), /^Error: PREVIEW_WORKFLOW_REJECTED$/);
  assert.ok(!f.events.includes('credential') && !f.events.includes('transport'));
});

for (const field of ['EXPECTED_MANIFEST_SHA256', 'EXPECTED_DEPLOYMENT_ID']) test(`changed ${field} refuses credential access`, async () => {
  const f = fixture();
  f.options.environment[field] = 'changed';
  await assert.rejects(f.runner.verifyCurrentRun(f.options), /^Error: PREVIEW_WORKFLOW_REJECTED$/);
  assert.deepEqual(f.events, ['approval', 'fresh-metadata']);
});

test('authorization-only step never reads credentials', async () => {
  const f = fixture();
  assert.equal(await f.runner.authorizeCurrentRun(f.options), f.authorization);
  assert.deepEqual(f.events, ['approval', 'fresh-metadata']);
});

test('an expired approval cannot make an HTTP request even after earlier validation', async () => {
  const f = fixture({ clock: () => Date.parse('2026-10-22T12:00:00Z') });
  await assert.rejects(f.runner.verifyCurrentRun(f.options), /^Error: PREVIEW_WORKFLOW_REJECTED$/);
  assert.ok(!f.events.includes('request'));
});

test('a contract failure is preserved rather than converted to successful proof', async () => {
  const f = fixture({ verify: async () => ({ verified: false }) });
  assert.equal((await f.runner.verifyCurrentRun(f.options)).verified, false);
});

for (const stage of ['transport', 'verify']) test(`${stage} cannot reflect raw failure text`, async () => {
  const f = fixture({ [stage]: () => { throw new Error('synthetic-secret-response'); } });
  await assert.rejects(f.runner.verifyCurrentRun(f.options), /^Error: PREVIEW_WORKFLOW_REJECTED$/);
});

test('workflow is manual, main-checked, pinned, Environment-gated and has no candidate execution or write scope', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/home-perf-cache-approved.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:|workflow_run:|\bpush:|\bpull_request:/);
  assert.doesNotMatch(workflow, /permissions:\s*write-all|:\s*write\b|createReview|reviewPendingDeployments|checks\.create|upload-artifact|download-artifact/);
  const refs = [...workflow.matchAll(/^\s+ref: (.*)$/gm)].map(match => match[1]);
  assert.deepEqual(refs, ['${{ github.sha }}', '${{ github.sha }}']);
  for (const match of workflow.matchAll(/uses: ([^\n]+)/g)) assert.match(match[1], /^[\w/-]+@[a-f0-9]{40}(?: |$)/);
  assert.match(workflow, /environment:\n\s+name: preview-cache-ci/);
  const secretLocations = [...workflow.matchAll(/\$\{\{ secrets\.([A-Z_]+) \}\}/g)];
  assert.deepEqual(secretLocations.map(match => match[1]), ['CF_ACCESS_PREVIEW_CLIENT_ID', 'CF_ACCESS_PREVIEW_CLIENT_SECRET']);
  const secretStep = workflow.slice(workflow.indexOf('- name: Verify response contract'), workflow.indexOf('\n  proof:'));
  assert.equal((secretStep.match(/secrets\./g) || []).length, 2);
  assert.doesNotMatch(secretStep, /\brun:|child_process|execFile|spawn|npm|git rev-parse/);
  assert.match(workflow, /needs: \[resolve, verify\]/);
  assert.match(workflow, /needs\.verify\.outputs\.verified == 'true'/);
  assert.match(workflow, /name: Seal successful proof/);
});
