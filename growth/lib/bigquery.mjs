/**
 * A BigQuery client in one file.
 *
 * `@google-cloud/bigquery` would be the obvious answer and it is not available:
 * this repo has no root package.json and no build step, and every script under
 * growth/ runs on a bare `node` (see growth/README.md). Adding a dependency
 * here would mean adding an install step to CI for one script, so instead this
 * talks to the REST API directly. Node 20+ ships everything required — global
 * `fetch` for the calls, `node:crypto` for the RS256 signature.
 *
 * What that costs: service-account auth has to be spelled out (a signed JWT
 * exchanged for an access token) and BigQuery's row encoding has to be decoded
 * by hand. Both are below and neither has moved in years.
 *
 * Least privilege lives in IAM, not in the OAuth scope. The scope requested is
 * the full `bigquery` one because running a query *creates a job*, which
 * `bigquery.readonly` cannot do — a read-only scope fails with a confusing
 * "Access Denied: Project" that reads like a billing problem. Grant the service
 * account `roles/bigquery.dataViewer` on the dataset and `roles/bigquery.jobUser`
 * on the project and it can run queries and read nothing else.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BQ_BASE = 'https://bigquery.googleapis.com/bigquery/v2';
const SCOPE = 'https://www.googleapis.com/auth/bigquery';

/**
 * Where `gcloud auth application-default login` leaves its credentials.
 *
 * Supporting that file is the difference between "I authenticated" and "the
 * pipeline runs". The owner's OAuth login produces an `authorized_user`
 * credential — client_id / client_secret / refresh_token — and this module
 * originally accepted only a service-account key, so a perfectly good login
 * failed with "No service-account credentials" and read as if nothing had been
 * set up at all.
 */
const ADC_RELATIVE = ['gcloud', 'application_default_credentials.json'];
function adcPath() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, ...ADC_RELATIVE);
  }
  const home = os.homedir();
  return home ? path.join(home, '.config', ...ADC_RELATIVE) : null;
}

/** Transient failures worth another attempt; everything else is a real answer. */
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Locate and parse a Google credential — either kind.
 *
 * Four places are tried, in the order that puts the most deliberate choice
 * first:
 *   1. an inline JSON blob passed in, or in GOOGLE_SERVICE_ACCOUNT_JSON /
 *      GCP_SERVICE_ACCOUNT_JSON (this is how CI passes it; Actions secrets are
 *      strings). Also accepted base64-wrapped, because a JSON blob with
 *      newlines survives some secret stores badly.
 *   2. GOOGLE_APPLICATION_CREDENTIALS, a path.
 *   3. the well-known ADC file written by `gcloud auth application-default
 *      login`.
 *
 * Two credential shapes come out of that:
 *   service_account  — client_email + private_key. Signs its own JWT.
 *   authorized_user  — client_id + client_secret + refresh_token. A human's
 *                      OAuth grant, which is what `gcloud auth
 *                      application-default login` produces.
 *
 * The `type` field is authoritative when present; the key material is the
 * fallback, because hand-assembled credential files often omit `type`.
 */
export function loadCredentials({ json, file } = {}) {
  const raw = json
    ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ?? process.env.GCP_SERVICE_ACCOUNT_JSON
    ?? null;
  const explicitPath = file ?? process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null;

  let text = null;
  let origin = null;
  if (raw && raw.trim()) {
    origin = 'environment';
    text = raw.trim();
    // A value that is not JSON but decodes to JSON was base64-wrapped on the way in.
    if (!text.startsWith('{')) {
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf8').trim();
        if (decoded.startsWith('{')) text = decoded;
      } catch { /* fall through to the parse error below */ }
    }
  } else if (explicitPath) {
    if (!fs.existsSync(explicitPath)) throw new Error(`credentials not found: ${explicitPath}`);
    origin = explicitPath;
    text = fs.readFileSync(explicitPath, 'utf8');
  } else {
    const adc = adcPath();
    if (adc && fs.existsSync(adc)) {
      origin = adc;
      text = fs.readFileSync(adc, 'utf8');
    }
  }

  if (!text) {
    throw new Error(
      'No Google credentials found. Looked in, in order:\n' +
      '  1. GOOGLE_SERVICE_ACCOUNT_JSON / GCP_SERVICE_ACCOUNT_JSON (inline JSON, base64 also accepted)\n' +
      '  2. GOOGLE_APPLICATION_CREDENTIALS (path to a key file)\n' +
      `  3. ${adcPath() ?? '(no home directory)'} — written by \`gcloud auth application-default login\`\n` +
      '\n' +
      'Locally, the quickest fix is:\n' +
      '  gcloud auth application-default login\n' +
      '  gcloud auth application-default set-quota-project <PROJECT_ID>\n' +
      'In CI, set one of the secrets above. See growth/BIGQUERY_SETUP.md.'
    );
  }

  let creds;
  try {
    creds = JSON.parse(text);
  } catch (e) {
    throw new Error(`credentials at ${origin} are not valid JSON: ${e.message}`);
  }

  const kind = creds.type
    ?? (creds.private_key ? 'service_account' : creds.refresh_token ? 'authorized_user' : null);

  if (kind === 'service_account') {
    for (const field of ['client_email', 'private_key']) {
      if (!creds[field]) throw new Error(`service-account key at ${origin} is missing "${field}"`);
    }
  } else if (kind === 'authorized_user') {
    for (const field of ['client_id', 'client_secret', 'refresh_token']) {
      if (!creds[field]) throw new Error(`OAuth credentials at ${origin} are missing "${field}"`);
    }
  } else {
    throw new Error(
      `credentials at ${origin} are neither a service account nor an OAuth user credential ` +
      `(type=${JSON.stringify(creds.type ?? null)}). ` +
      'Expected a service-account key (client_email + private_key) or an authorized_user ' +
      '(client_id + client_secret + refresh_token).'
    );
  }

  return { ...creds, type: kind, _origin: origin };
}

/**
 * Back-compat: the same loader, but refusing anything that is not a service
 * account. Kept because "service account" is a promise some callers rely on.
 */
export function loadServiceAccount(opts = {}) {
  const creds = loadCredentials(opts);
  if (creds.type !== 'service_account') {
    throw new Error(
      `expected a service-account key but found an ${creds.type} credential at ${creds._origin}`
    );
  }
  return creds;
}

/** Credential → OAuth2 access token, by whichever grant the credential implies. */
export async function accessToken(credentials, { scope = SCOPE } = {}) {
  if (credentials?.type === 'authorized_user') return userAccessToken(credentials);
  return serviceAccountAccessToken(credentials, { scope });
}

/**
 * OAuth user credential → access token, via the refresh-token grant.
 *
 * No scope is sent. The grant's scope was fixed when the human consented —
 * `gcloud auth application-default login` asks for cloud-platform — and
 * passing a narrower one here does not narrow anything; it only risks a
 * mismatch against what was actually authorised.
 */
async function userAccessToken({ client_id, client_secret, refresh_token }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id,
      client_secret,
      refresh_token,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant is the one worth naming: a revoked or expired refresh
    // token looks identical to a typo otherwise, and the fix is different.
    const hint = body.error === 'invalid_grant'
      ? '\n  The refresh token was revoked or expired. Re-run: gcloud auth application-default login'
      : '';
    throw new Error(
      `OAuth token refresh failed (${res.status} ${body.error || ''}): ` +
      `${body.error_description || 'no detail'}${hint}`
    );
  }
  return body.access_token;
}

async function serviceAccountAccessToken(serviceAccount, { scope = SCOPE } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: serviceAccount.client_email,
    scope,
    aud: TOKEN_URL,
    iat: now - 60,
    exp: now + 3600,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(serviceAccount.private_key);
  const assertion = `${signingInput}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `token exchange failed (${res.status} ${body.error || ''}): ${body.error_description || 'no detail'}\n` +
      `  service account: ${serviceAccount.client_email}`
    );
  }
  return body.access_token;
}

/**
 * BigQuery's cell encoding → JavaScript.
 *
 * Every scalar arrives as a string — `"1234"` for an INT64, `"true"` for a
 * BOOL — so a row used without decoding silently does string arithmetic, and
 * `"9" > "10"` is the kind of bug that survives review. Types come from the
 * schema the same response carries.
 *
 * INT64 is decoded to Number, which is lossy past 2^53. Impressions and clicks
 * on this site are six figures at most; anything counting to nine quadrillion
 * has a different problem.
 */
function decodeCell(value, field) {
  if (value === null || value === undefined) return null;

  if (field.mode === 'REPEATED' && Array.isArray(value)) {
    return value.map((v) => decodeCell(v?.v ?? null, { ...field, mode: 'NULLABLE' }));
  }

  switch (field.type) {
    case 'INTEGER': case 'INT64':
    case 'FLOAT': case 'FLOAT64':
    case 'NUMERIC': case 'BIGNUMERIC': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'BOOLEAN': case 'BOOL':
      return value === 'true' || value === true;
    case 'RECORD': case 'STRUCT':
      return decodeRow(value, field.fields || []);
    default:
      return String(value);
  }
}

function decodeRow(row, fields) {
  const out = {};
  const cells = row?.f ?? [];
  fields.forEach((field, i) => { out[field.name] = decodeCell(cells[i]?.v ?? null, field); });
  return out;
}

async function request(url, { token, quotaProject = null, method = 'GET', body } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(quotaProject ? { 'x-goog-user-project': quotaProject } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      // Network-level failure: no response to inspect, so always worth a retry.
      lastError = e;
      if (attempt === MAX_ATTEMPTS) throw e;
      await sleep(2 ** attempt * 500);
      continue;
    }

    const payload = await res.json().catch(() => ({}));
    if (res.ok) return payload;

    const message = payload?.error?.message || `HTTP ${res.status}`;
    lastError = new Error(`BigQuery: ${message}`);
    if (!RETRY_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) throw lastError;
    await sleep(2 ** attempt * 500);
  }
  throw lastError;
}

/**
 * Run one SQL statement and return every row.
 *
 * Three things this handles that a single POST does not:
 *
 *   - **Slow starts.** `jobs.query` returns `jobComplete: false` when the job
 *     outruns `timeoutMs`; the results are then collected from
 *     `jobs.getQueryResults`, which is also where paging happens.
 *   - **Paging.** A response caps out around 10 MB. The 28-day query×page
 *     result for this site is a few thousand rows today and will not stay that
 *     way, and a truncated read looks exactly like "those queries got no
 *     traffic" — silent, plausible, wrong.
 *   - **Named parameters.** The site URL and dates are interpolated by
 *     BigQuery, not by string concatenation.
 *
 * @param {object} opts
 * @param {string} opts.sql
 * @param {object} [opts.params]   named query parameters, e.g. { site: 'sc-domain:…' }
 * @param {object} [opts.types]    BigQuery type for each param; defaults to STRING
 * @param {string} [opts.location] dataset location — must match, or the job is not found
 */
export async function query(client, { sql, params = {}, types = {}, location } = {}) {
  const { projectId } = client;
  const loc = location ?? client.location ?? null;

  const queryParameters = Object.entries(params).map(([name, value]) => ({
    name,
    parameterType: { type: types[name] || 'STRING' },
    parameterValue: { value: value === null || value === undefined ? null : String(value) },
  }));

  let payload = await request(`${BQ_BASE}/projects/${encodeURIComponent(projectId)}/queries`, {
    ...auth(client),
    method: 'POST',
    body: {
      query: sql,
      useLegacySql: false,
      parameterMode: queryParameters.length ? 'NAMED' : undefined,
      queryParameters: queryParameters.length ? queryParameters : undefined,
      timeoutMs: 60_000,
      maxResults: 20_000,
      ...(loc ? { location: loc } : {}),
    },
  });

  const schema = payload.schema;
  const jobId = payload.jobReference?.jobId;
  const jobLocation = payload.jobReference?.location ?? loc;
  const rows = [];

  const collect = (p) => {
    for (const row of p.rows || []) rows.push(decodeRow(row, (p.schema || schema)?.fields || []));
  };

  // A job that has not finished carries no rows yet — poll before collecting,
  // or the first page is counted as an empty result set.
  while (!payload.jobComplete) {
    if (!jobId) throw new Error('BigQuery returned an incomplete job with no job reference');
    payload = await request(
      `${BQ_BASE}/projects/${encodeURIComponent(projectId)}/queries/${encodeURIComponent(jobId)}` +
      `?timeoutMs=60000${jobLocation ? `&location=${encodeURIComponent(jobLocation)}` : ''}`,
      auth(client)
    );
  }
  collect(payload);

  let pageToken = payload.pageToken;
  while (pageToken) {
    payload = await request(
      `${BQ_BASE}/projects/${encodeURIComponent(projectId)}/queries/${encodeURIComponent(jobId)}` +
      `?pageToken=${encodeURIComponent(pageToken)}&timeoutMs=60000` +
      `${jobLocation ? `&location=${encodeURIComponent(jobLocation)}` : ''}`,
      auth(client)
    );
    collect(payload);
    pageToken = payload.pageToken;
  }

  return {
    rows,
    totalBytesProcessed: Number(payload.totalBytesProcessed || 0),
    cacheHit: Boolean(payload.cacheHit),
  };
}

/** Does a table exist? Used by the preflight to tell "not set up" from "no data". */
export async function tableExists(client, { dataset, table }) {
  const { projectId } = client;
  try {
    await request(
      `${BQ_BASE}/projects/${encodeURIComponent(projectId)}` +
      `/datasets/${encodeURIComponent(dataset)}/tables/${encodeURIComponent(table)}`,
      auth(client)
    );
    return true;
  } catch (e) {
    if (/not found/i.test(e.message)) return false;
    throw e;
  }
}

/** Every table in the dataset, so the preflight can show what is actually there. */
export async function listTables(client, { dataset }) {
  const { projectId } = client;
  const out = [];
  let pageToken = null;
  do {
    const payload = await request(
      `${BQ_BASE}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(dataset)}/tables` +
      `?maxResults=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
      auth(client)
    );
    for (const t of payload.tables || []) {
      out.push({ id: t.tableReference?.tableId, type: t.type, expires: t.expirationTime ? Number(t.expirationTime) : null });
    }
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return out;
}

/** Authenticate once; hand the result to `query` / `listTables` / `tableExists`. */
export async function connect({ projectId, location, serviceAccount, credentials } = {}) {
  const creds = credentials ?? serviceAccount ?? loadCredentials();
  const project = projectId
    ?? process.env.GCP_PROJECT_ID
    ?? creds.project_id
    ?? creds.quota_project_id;
  if (!project) {
    throw new Error(
      'No BigQuery project. Pass --project, set GCP_PROJECT_ID, or run:\n' +
      '  gcloud auth application-default set-quota-project <PROJECT_ID>'
    );
  }

  // A user credential is not attached to a project, so Google needs to be told
  // which one to bill and rate-limit against. Without this header BigQuery
  // answers a valid OAuth token with "User Rate Limit Exceeded" or a bare 403,
  // neither of which points at the missing quota project. Service accounts
  // carry their own project and must NOT send it.
  const quotaProject = creds.type === 'authorized_user'
    ? (creds.quota_project_id ?? project)
    : null;

  return {
    projectId: project,
    location: location ?? process.env.BQ_LOCATION ?? null,
    token: await accessToken(creds),
    quotaProject,
    credentialType: creds.type,
    credentialOrigin: creds._origin ?? null,
    // Kept for callers that print who authenticated; null for OAuth users,
    // whose identity is the human who ran `gcloud auth`.
    clientEmail: creds.client_email ?? null,
  };
}

/** Per-request auth bits, so every call site carries the quota project too. */
function auth(client) {
  return { token: client.token, quotaProject: client.quotaProject };
}
