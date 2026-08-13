/**
 * Credential handling for growth/lib/bigquery.mjs.
 *
 *   node growth/lib/bigquery.test.mjs
 *
 * Only the credential layer is covered, and deliberately: it is the part that
 * decides whether the pipeline runs at all, it is the part that was wrong
 * (an OAuth login was rejected as "no credentials"), and it is the only part
 * that can be exercised without reaching BigQuery. The token endpoint is
 * stubbed by replacing globalThis.fetch — no network, no credentials, so this
 * runs anywhere including CI.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { loadCredentials, loadServiceAccount, accessToken, connect } from './bigquery.mjs';

// A real key, because connect() signs a JWT for service accounts — a
// placeholder string fails in the signer, not in the code under test.
const REAL_PEM = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bq-test-'));
const write = (name, obj) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
};

const SA = {
  type: 'service_account',
  client_email: 'sa@example.iam.gserviceaccount.com',
  private_key: REAL_PEM,
  project_id: 'proj-from-key',
};
const USER = {
  type: 'authorized_user',
  client_id: '123.apps.googleusercontent.com',
  client_secret: 'shh',
  refresh_token: '1//refresh',
  quota_project_id: 'proj-from-quota',
};

// Env keys this module reads. Cleared around each case so a developer's real
// gcloud login cannot make a failing test pass.
const ENV_KEYS = [
  'GOOGLE_SERVICE_ACCOUNT_JSON', 'GCP_SERVICE_ACCOUNT_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS', 'GCP_PROJECT_ID', 'BQ_LOCATION',
];
function withEnv(env, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try { return fn(); } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

let passed = 0;
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

/* ── discovery ─────────────────────────────────────────────────────────── */

test('inline service-account JSON is found in the environment', () => {
  const c = withEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SA) }, () => loadCredentials());
  assert.equal(c.type, 'service_account');
  assert.equal(c.client_email, SA.client_email);
});

test('inline JSON is accepted base64-wrapped', () => {
  const b64 = Buffer.from(JSON.stringify(SA)).toString('base64');
  const c = withEnv({ GCP_SERVICE_ACCOUNT_JSON: b64 }, () => loadCredentials());
  assert.equal(c.client_email, SA.client_email);
});

test('an OAuth user credential is accepted, not rejected as "no credentials"', () => {
  const c = withEnv({ GOOGLE_APPLICATION_CREDENTIALS: write('user.json', USER) }, () => loadCredentials());
  assert.equal(c.type, 'authorized_user');
  assert.equal(c.refresh_token, USER.refresh_token);
});

test('type is inferred when the file omits it', () => {
  const noType = { ...USER }; delete noType.type;
  const c = withEnv({ GOOGLE_APPLICATION_CREDENTIALS: write('notype.json', noType) }, () => loadCredentials());
  assert.equal(c.type, 'authorized_user');
});

test('a missing credential names all three places it looked', () => {
  // HOME is redirected so a real ~/.config/gcloud login cannot satisfy this.
  const home = process.env.HOME;
  process.env.HOME = tmp;
  try {
    withEnv({}, () => assert.throws(() => loadCredentials(), (e) => {
      assert.match(e.message, /GOOGLE_SERVICE_ACCOUNT_JSON/);
      assert.match(e.message, /GOOGLE_APPLICATION_CREDENTIALS/);
      assert.match(e.message, /gcloud auth application-default login/);
      return true;
    }));
  } finally { process.env.HOME = home; }
});

test('an incomplete credential says which field is missing', () => {
  const broken = { ...USER }; delete broken.refresh_token;
  withEnv({ GOOGLE_APPLICATION_CREDENTIALS: write('broken.json', broken) }, () =>
    assert.throws(() => loadCredentials(), /missing "refresh_token"/));
});

test('loadServiceAccount still refuses a user credential', () => {
  withEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(USER) }, () =>
    assert.throws(() => loadServiceAccount(), /expected a service-account key/));
});

/* ── token exchange ────────────────────────────────────────────────────── */

async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

test('a user credential refreshes with grant_type=refresh_token, no scope', async () => {
  let seen = null;
  const token = await withFetch(async (url, init) => {
    seen = { url, body: new URLSearchParams(init.body) };
    return { ok: true, json: async () => ({ access_token: 'tok-user' }) };
  }, () => accessToken(USER));
  assert.equal(token, 'tok-user');
  assert.equal(seen.body.get('grant_type'), 'refresh_token');
  assert.equal(seen.body.get('refresh_token'), USER.refresh_token);
  // Re-requesting a scope the human never consented to is how this breaks.
  assert.equal(seen.body.get('scope'), null);
});

test('a revoked refresh token says how to fix it', async () => {
  await withFetch(
    async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }),
    async () => assert.rejects(() => accessToken(USER), /gcloud auth application-default login/),
  );
});

test('a service account still uses the JWT-bearer grant', async () => {
  let seen = null;
  const sa = SA;
  const token = await withFetch(async (url, init) => {
    seen = new URLSearchParams(init.body);
    return { ok: true, json: async () => ({ access_token: 'tok-sa' }) };
  }, () => accessToken(sa));
  assert.equal(token, 'tok-sa');
  assert.equal(seen.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.ok(seen.get('assertion').split('.').length === 3);
});

/* ── connect() ─────────────────────────────────────────────────────────── */

test('OAuth users get a quota project; service accounts do not', async () => {
  const stub = async () => ({ ok: true, json: async () => ({ access_token: 't' }) });

  const asUser = await withFetch(stub, () =>
    connect({ credentials: { ...USER, _origin: 'test' } }));
  assert.equal(asUser.projectId, 'proj-from-quota');
  // Without this header BigQuery 403s a valid user token.
  assert.equal(asUser.quotaProject, 'proj-from-quota');
  assert.equal(asUser.credentialType, 'authorized_user');

  const asSa = await withFetch(stub, () =>
    connect({ credentials: { ...SA, _origin: 'test' } }));
  assert.equal(asSa.projectId, 'proj-from-key');
  assert.equal(asSa.quotaProject, null, 'a service account must not send x-goog-user-project');
});

test('GCP_PROJECT_ID wins over the credential’s own project', async () => {
  const client = await withFetch(
    async () => ({ ok: true, json: async () => ({ access_token: 't' }) }),
    () => withEnv({ GCP_PROJECT_ID: 'explicit-proj' }, () =>
      connect({ credentials: { ...SA, _origin: 'test' } })),
  );
  assert.equal(client.projectId, 'explicit-proj');
});

test('no project anywhere points at set-quota-project', async () => {
  const bare = { type: 'authorized_user', client_id: 'a', client_secret: 'b', refresh_token: 'c' };
  await withFetch(
    async () => ({ ok: true, json: async () => ({ access_token: 't' }) }),
    async () => withEnv({}, () => assert.rejects(
      () => connect({ credentials: bare }), /set-quota-project/)),
  );
});

/* ── run ───────────────────────────────────────────────────────────────── */

let failed = 0;
for (const [name, fn] of cases) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${e.message}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
