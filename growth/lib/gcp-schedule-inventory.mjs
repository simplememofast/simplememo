// Fixed project, metadata GETs only. Reuse the existing credential and IAM grants.
// Never enable an API, grant a role, run a job, or copy authentication material.
import crypto from 'node:crypto';
import * as bq from './bigquery.mjs';

export const PROJECT = 'yurika-simplememo';
export const LIMITS = Object.freeze({ pages: 20, locations: 100, requests: 400, attempts: 3 });
const SERVICES = {
  scheduler: { host: 'cloudscheduler.googleapis.com', scope: 'cloud-scheduler', collection: 'jobs' },
  transfers: { host: 'bigquerydatatransfer.googleapis.com', scope: 'cloud-platform', collection: 'transferConfigs' },
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const problem = e => ({ status: e.status === 401 ? 'authentication_failed' : e.status === 403 ? 'access_denied' : 'error',
  http_status: e.status ?? null, reason: e.reason ?? 'request_failed' });
function target(value) {
  if (!value) return null;
  try { return new URL(value).origin; } catch { return null; }
}
export function summarizeJob(job, service, parent, canonicalParent = parent) {
  const collection = SERVICES[service].collection;
  const prefix = [parent, canonicalParent].map(p => p + '/' + collection + '/')
    .find(p => typeof job?.name === 'string' && job.name.startsWith(p));
  if (!prefix || !/^[A-Za-z0-9_-]+$/.test(job.name.slice(prefix.length))) throw new Error('Invalid resource reference');
  if (service === 'scheduler') return {
    name: job.name, schedule: job.schedule ?? null, timezone: job.timeZone ?? null,
    state: job.state ?? null, last_attempt: job.lastAttemptTime ?? null, next_run: job.scheduleTime ?? null,
    last_status_code: job.status?.code ?? null, retry: job.retryConfig ?? null,
    destination: job.httpTarget ? target(job.httpTarget.uri) : job.pubsubTarget?.topicName ??
      (job.appEngineHttpTarget ? 'App Engine' : null),
    target_kind: job.httpTarget ? 'http' : job.pubsubTarget ? 'pubsub' : job.appEngineHttpTarget ? 'app_engine' : 'unknown',
    definition_sha256: hash([job.schedule, job.timeZone, job.httpTarget?.uri, job.httpTarget?.httpMethod,
      job.httpTarget?.body, job.pubsubTarget?.topicName, job.pubsubTarget?.data, job.appEngineHttpTarget]),
  };
  return { name: job.name, display_name: job.displayName ?? null, schedule: job.schedule ?? null,
    schedule_options: job.scheduleOptions ?? null, schedule_options_v2: job.scheduleOptionsV2 ?? null,
    timezone: 'UTC (transfer schedule)', state: job.state ?? null, disabled: job.disabled ?? false,
    next_run: job.nextRunTime ?? null, updated_at: job.updateTime ?? null,
    data_source: job.dataSourceId ?? null, destination: job.destinationDatasetId ?? null,
    definition_sha256: hash([job.dataSourceId, job.params, job.schedule, job.scheduleOptions, job.scheduleOptionsV2]),
  };
}

export async function collectGcpSchedules({ api = bq, fetchImpl = fetch, wait = sleep, now = new Date() } = {}) {
  const out = { schema_version: 1, project: PROJECT, observed_at: now.toISOString(), status: 'complete',
    limits: LIMITS, services: {}, request_count: 0, query_bytes_billed: 0,
    interpretation: 'Current metadata visible to the existing principal in this project, across listed service locations. No IAM changes or job execution. Disabled/denied APIs are not empty inventories. State and last attempt do not prove business success. Bodies, headers, authentication fields, URL paths/queries and transfer parameters are omitted; definition hashes support comparison.' };
  let credentials;
  try { credentials = api.loadCredentials(); out.credential_type = credentials.type; }
  catch { out.status = 'blocked'; out.error = { reason: 'existing_credential_unavailable' }; return out; }
  const deadline = Date.now() + 6 * 60_000;
  for (const [service, config] of Object.entries(SERVICES)) {
    const entry = out.services[service] = { status: 'complete', locations: [], jobs: [], issues: [] };
    const issue = (scope, detail) => { entry.status = 'partial'; out.status = 'partial'; entry.issues.push({ scope, ...detail }); };
    let token;
    try { token = await api.accessToken(credentials, { scope: 'https://www.googleapis.com/auth/' + config.scope }); }
    catch { issue('authentication', { status: 'authentication_failed' }); continue; }
    async function get(resource, pageToken) {
      const url = new URL('https://' + config.host + '/v1/' + resource);
      url.searchParams.set('pageSize', '100');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      for (let attempt = 0; attempt < LIMITS.attempts; attempt++) {
        if (out.request_count >= LIMITS.requests || Date.now() >= deadline) throw Object.assign(new Error('Budget reached'), { reason: 'request_or_time_limit' });
        out.request_count++;
        let response;
        try { response = await fetchImpl(url.toString(), { method: 'GET', redirect: 'error',
          headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10_000) }); }
        catch { if (attempt + 1 < LIMITS.attempts) { await wait(250 * 2 ** attempt); continue; } throw new Error('Transport failed'); }
        const body = await response.json().catch(() => null);
        if (response.ok) {
          if (!body || typeof body !== 'object' || Array.isArray(body) || body.error) throw new Error('Malformed response');
          return body;
        }
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt + 1 < LIMITS.attempts) { await wait(250 * 2 ** attempt); continue; }
        const reason = body?.error?.details?.find(d => d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo')?.reason;
        throw Object.assign(new Error('Metadata request rejected'), { status: response.status,
          reason: /^[A-Z_]{1,80}$/.test(reason ?? '') ? reason : 'request_rejected' });
      }
    }
    async function pages(resource, field) {
      const rows = [], seen = new Set(); let next;
      for (let page = 0; page < LIMITS.pages; page++) {
        let body;
        try { body = await get(resource, next); } catch (e) { issue(resource, problem(e)); return rows; }
        if (body[field] !== undefined && !Array.isArray(body[field])) { issue(resource, { status: 'malformed_response' }); return rows; }
        rows.push(...(body[field] ?? []));
        if (body.unreachable?.length) issue(resource, { status: 'unreachable_locations', locations: body.unreachable });
        next = body.nextPageToken;
        if (!next) return rows;
        if (typeof next !== 'string' || seen.has(next)) { issue(resource, { status: 'invalid_or_repeated_page_token' }); return rows; }
        seen.add(next);
      }
      issue(resource, { status: 'page_limit' }); return rows;
    }
    const locations = await pages(`projects/${PROJECT}/locations`, 'locations');
    if (!locations.length && entry.status === 'complete') issue('locations', { status: 'empty_location_catalog' });
    if (locations.length > LIMITS.locations) issue('locations', { status: 'location_limit' });
    const seen = new Set(); let projectNumber;
    for (const location of locations.slice(0, LIMITS.locations)) {
      const id = location.locationId;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) { issue('locations', { status: 'invalid_reference' }); continue; }
      if (seen.has(id)) continue; seen.add(id);
      const parent = `projects/${PROJECT}/locations/${id}`;
      // The fixed-project catalog binds Google's numeric project alias, without
      // accepting an arbitrary number from a returned job or widening IAM.
      const canonicalName = location.name;
      const canonicalMatch = typeof canonicalName === 'string' && canonicalName.match(/^projects\/([a-z0-9-]+)\/locations\/([A-Za-z0-9-]+)$/);
      if (canonicalName && (!canonicalMatch || canonicalMatch[2] !== id ||
          (canonicalMatch[1] !== PROJECT && !/^\d+$/.test(canonicalMatch[1])))) {
        issue('locations', { status: 'invalid_canonical_reference' }); continue;
      }
      if (canonicalMatch && canonicalMatch[1] !== PROJECT) {
        if (projectNumber && projectNumber !== canonicalMatch[1]) {
          issue('locations', { status: 'inconsistent_project_alias' }); continue;
        }
        projectNumber = canonicalMatch[1];
      }
      const canonicalParent = canonicalName || parent;
      const before = entry.issues.length;
      const jobs = await pages(parent + '/' + config.collection, config.collection);
      for (const job of jobs) {
        try { entry.jobs.push(summarizeJob(job, service, parent, canonicalParent)); }
        catch { issue(parent, { status: 'invalid_resource_reference' }); }
      }
      entry.locations.push({ id, requested_parent: parent, canonical_parent: canonicalParent,
        status: entry.issues.length === before ? 'complete' : 'partial', count: jobs.length });
    }
  }
  return out;
}
