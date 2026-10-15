// Shared, side-effect-free contract between acquisition-daily.yml and the local ingest.
// The token-side seal script deliberately does not import this file: it is hash-pinned
// in the workflow and keeps its own copies. Tests assert both copies agree.
export const ACQUISITION_REPO = 'simplememofast/simplememo';
export const ACQUISITION_WORKFLOW = '.github/workflows/acquisition-daily.yml';
export const ACQUISITION_WORKFLOW_REF = `${ACQUISITION_REPO}/${ACQUISITION_WORKFLOW}@refs/heads/main`;
export const ACQUISITION_STOP_ROUTE = 'acquisition';
export const RETENTION_DAYS = 14;

// Public-key fingerprint (SHA-256 of the SPKI DER) of the existing analytics recipient.
// Not a secret. A swapped repository variable must not redirect the aggregate.
export const RECIPIENT_SPKI_SHA256 = 'c77d213e039ca5fa0d6797e87d59d974756f2462aeca0186dbfbf3773308f992';

// Byte-identical copy of simplememo-api scripts/appsflyer_aggregate.py (28e9a01, #276).
export const APPSFLYER_READER_PATH = 'growth/vendor/appsflyer_aggregate.py';
export const APPSFLYER_READER_UPSTREAM = 'scripts/appsflyer_aggregate.py';
export const APPSFLYER_READER_SHA256 = '6c56e5071b5fc573317abb5a80d74788882e8cd5b80ad1edf0d6e069c5201f2a';
export const APPSFLYER_SEAL_PATH = 'growth/scripts/seal-acquisition-appsflyer.mjs';
export const APPSFLYER_HANDOFF_SCHEMA = 'simplememo_acquisition_appsflyer_handoff_v1';
export const APPSFLYER_CREDENTIAL_ORIGIN = 'github_actions_secret';
export const APPSFLYER_SECRET = 'APPSFLYER_AGGREGATE_API_TOKEN';
// The token is an environment secret: GitHub hands environment secrets only to jobs that
// reference the environment, and the environment's deployment branches are main only.
export const APPSFLYER_ENVIRONMENT = 'acquisition-appsflyer';
// Credentialed jobs run only on the first attempt; their artifacts always come from it.
export const COLLECTION_ATTEMPT = 1;
// GA4 envelope plaintext bucket (artifact sizes are public; see export-analytics.mjs padToBucket).
export const GA4_PAD_BUCKET = 2 * 1024 ** 2;

// Files that run while the token or the plaintext aggregate exists on the runner.
// Their sha256 is written literally in the workflow and checked before the token step.
export const PINNED_FILES = Object.freeze([APPSFLYER_READER_PATH, APPSFLYER_SEAL_PATH, 'growth/lib/analytics-envelope.mjs']);

// Job and step names are part of the contract: the ingest reads them from the jobs API.
export const JOBS = Object.freeze({ gate: 'gate', ga4: 'ga4', appsflyer: 'appsflyer' });
export const KEY_PENDING_STEP = 'AppsFlyer key pending (rest, not fail)';
export const PINS_STEP = 'Pinned code and recipient (before the token exists)';
export const ENVIRONMENT_STEP = 'Environment admits main only (before the token exists)';

export const ga4ArtifactName = end => `acquisition-ga4-funnel-${end}`;
export const appsflyerArtifactName = end => `acquisition-appsflyer-${end}`;
export const GA4_ARTIFACT = /^acquisition-ga4-funnel-(\d{4}-\d{2}-\d{2})$/;
export const GA4_DRYRUN_ARTIFACT = /^acquisition-ga4-dryrun-\d+$/;
export const APPSFLYER_ARTIFACT = /^acquisition-appsflyer-(\d{4}-\d{2}-\d{2})$/;
export const GA4_ENVELOPE = 'analytics.enc.json';
export const APPSFLYER_ENVELOPE = 'appsflyer.enc.json';
export const ENVELOPE_LIMIT = 32 * 1024 ** 2;

export function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}

/** Fail closed: a ledger without this route cannot stop the job on the day it matters. */
export function acquisitionStop(doc) {
  const agent = doc?.agents?.[ACQUISITION_STOP_ROUTE];
  if (typeof doc?.stopped !== 'boolean' || !agent || typeof agent.stopped !== 'boolean') {
    throw Object.assign(new Error(`data/emergency-stop.json に経路 "${ACQUISITION_STOP_ROUTE}" が無い — 止めたい日に止まらない`),
      { code: 'stop_route_missing' });
  }
  if (doc.stopped) return { stopped: true, scope: 'global' };
  if (agent.stopped) return { stopped: true, scope: ACQUISITION_STOP_ROUTE };
  return { stopped: false, scope: null };
}

/** Remote run identity accepted by the ingest. Fork, branch and event drift are rejected. */
export function acceptedRun(remote) {
  return remote?.repository?.full_name === ACQUISITION_REPO && remote.head_repository?.full_name === ACQUISITION_REPO
    && remote.path === ACQUISITION_WORKFLOW && remote.head_branch === 'main'
    && ['schedule', 'workflow_dispatch'].includes(remote.event)
    && Number.isSafeInteger(remote.id) && remote.id > 0 && Number.isSafeInteger(remote.run_attempt) && remote.run_attempt > 0
    && /^[a-f0-9]{40}$/.test(remote.head_sha ?? '') && Number.isFinite(Date.parse(remote.created_at));
}
