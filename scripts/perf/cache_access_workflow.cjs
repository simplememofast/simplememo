'use strict';

// Called only by the reviewed main workflow. Never run this module from a PR
// checkout with credentials. Configuration is the separately confirmed settings
// readback committed on main; it cannot come from dispatch or candidate data.
const { readEnvironmentApproval, resolveCandidate } = require('./cache_access_context.cjs');
const { createCacheAccessTransport } = require('./cache_access_http.cjs');
const { verifyCacheContract } = require('./cache_access_contract.cjs');
const defaultConfiguration = require('./cache_access_configuration.json');

function fail() { throw new Error('PREVIEW_WORKFLOW_REJECTED'); }

// Dependency injection is for local synthetic tests and trusted callers only.
// No dispatch input or candidate file is ever used as an implementation/module.
function createWorkflowRunner({ readApproval = readEnvironmentApproval,
  resolve = resolveCandidate, transport = createCacheAccessTransport,
  verify = verifyCacheContract, clock = Date.now } = {}) {
  async function authorizeCurrentRun({ github, context, environment = process.env,
    configuration = defaultConfiguration } = {}) {
    try {
      if (!configuration || !configuration.configurationReadback) fail();
      const source = {
        repository: context.repo.owner + '/' + context.repo.repo,
        eventName: context.eventName, ref: context.ref,
        workflowRef: environment.TRUSTED_WORKFLOW_REF,
        workflowSha: environment.TRUSTED_WORKFLOW_SHA,
        sha: context.sha, checkoutSha: environment.TRUSTED_CHECKOUT_SHA,
        runAttempt: environment.GITHUB_RUN_ATTEMPT,
        actor: context.actor, triggeringActor: environment.GITHUB_TRIGGERING_ACTOR,
      };
      const headSha = environment.REQUESTED_HEAD_SHA;
      const validUntil = environment.APPROVAL_VALID_UNTIL;
      const approval = await readApproval({ github, runId: context.runId, headSha,
        context: { ...source, runId: context.runId }, now: clock, validUntil,
        configurationReadback: configuration.configurationReadback });
      // Repeat the PR/deployment/manifest lookup AFTER the Environment review.
      // The capability is process-local and cannot be supplied as JSON input.
      const resolved = await resolve({ github, context: source,
        checkoutSha: source.checkoutSha,
        request: { pullRequestNumber: 2139, approvedHeadSha: headSha },
        validUntil, now: clock, approval });
      return resolved.authorization;
    } catch { fail(); }
  }

  async function verifyCurrentRun(options) {
    try {
      const environment = options.environment || process.env;
      const authorization = await authorizeCurrentRun(options);
      // Preflight outputs are public bounded data, not an authorization source.
      // Reject a preview/manifest change while the reviewer was considering it.
      if (authorization.headSha !== environment.REQUESTED_HEAD_SHA
          || authorization.manifestSha256 !== environment.EXPECTED_MANIFEST_SHA256
          || authorization.deploymentId !== environment.EXPECTED_DEPLOYMENT_ID
          || authorization.validUntil !== environment.APPROVAL_VALID_UNTIL
          || !Number.isFinite(Date.parse(authorization.validUntil))
          || clock() >= Date.parse(authorization.validUntil)) fail();
      const paths = ['/', '/en/', '/assets/home-perf/manifest.json',
        '/assets/home-perf/missing-000000000000.avif',
        ...Object.keys(authorization.manifest.assets).map(file => '/' + file)];
      // This is the FIRST read of either credential. No child process, browser,
      // package install, Git command or candidate execution follows this point.
      const client = transport({ origin: authorization.previewOrigin, paths,
        credentials: { clientId: environment.CF_ACCESS_PREVIEW_CLIENT_ID,
          clientSecret: environment.CF_ACCESS_PREVIEW_CLIENT_SECRET } });
      return await verify({ manifest: authorization.manifest, request: async input => {
        if (clock() >= Date.parse(authorization.validUntil)) fail();
        return client.request(input);
      } });
    } catch { fail(); }
  }
  return Object.freeze({ authorizeCurrentRun, verifyCurrentRun });
}

module.exports = { createWorkflowRunner, ...createWorkflowRunner() };
