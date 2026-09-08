// Read-only evidence discovery, not a restoration or proof of backup completeness.
export const BACKUP_LIMITS = Object.freeze({ pages: 20, datasets: 50, tableDetails: 500, days: 30 });
const problem = (e) => ({ status: e.status === 403 ? 'access_denied' : e.status === 404 ? 'not_found' : 'error', http_status: e.status ?? null });

export async function collectBackupInventory(client, api, now = new Date()) {
  const end = now.getTime();
  if (!Number.isSafeInteger(end)) throw new Error('Invalid inventory time');
  const out = {
    schema_version: 1, status: 'complete', project: 'yurika-simplememo', observed_at: now.toISOString(),
    limits: BACKUP_LIMITS, window: { minCreationTime: end - BACKUP_LIMITS.days * 86400000, maxCreationTime: end },
    visibility: 'Datasets are permission-filtered. Jobs request allUsers with FULL projection, but metadata may be redacted. Top-level jobs only. Other projects, buckets, schedules and older jobs are not inspected.',
    interpretation: 'Candidates only. No metadata result proves successful restoration, current object existence, retention coverage or absence of other backups.',
    restore_verified: false, datasets: [], jobs: [], issues: [],
  };
  const issue = (scope, detail) => { out.status = 'partial'; out.issues.push({ scope, ...detail }); };
  async function pages(kind, args, field) {
    const rows = [], seen = new Set(); let token;
    for (let page = 0; page < BACKUP_LIMITS.pages; page++) {
      let p;
      try { p = await api.backupMetadata(client, { kind, ...args, pageToken: token }); }
      catch (e) { issue(kind, problem(e)); return rows; }
      if (!p || typeof p !== 'object' || (!Object.hasOwn(p, field) && p.kind !== `bigquery#${kind === 'datasets' ? 'datasetList' : kind === 'tables' ? 'tableList' : 'jobList'}`) || (p[field] !== undefined && !Array.isArray(p[field]))) {
        issue(kind, { status: 'malformed_response' }); return rows;
      }
      if (p.unreachable?.length) issue(kind, { status: 'unreachable_locations', locations: p.unreachable });
      rows.push(...(p[field] ?? []));
      token = p.nextPageToken;
      if (!token) return rows;
      if (typeof token !== 'string' || seen.has(token)) { issue(kind, { status: 'invalid_or_repeated_page_token' }); return rows; }
      seen.add(token);
    }
    issue(kind, { status: 'page_limit' }); return rows;
  }
  const datasets = await pages('datasets', {}, 'datasets');
  if (datasets.length > BACKUP_LIMITS.datasets) issue('datasets', { status: 'dataset_limit' });
  let details = 0;
  for (const d of datasets.slice(0, BACKUP_LIMITS.datasets)) {
    const ref = d.datasetReference;
    if (ref?.projectId !== out.project || !ref.datasetId) { issue('datasets', { status: 'invalid_reference' }); continue; }
    const entry = { dataset: ref.datasetId, location: d.location ?? null, tables_seen: 0, tables_inspected: 0, candidates: [] };
    out.datasets.push(entry);
    const tables = await pages('tables', { dataset: ref.datasetId }, 'tables');
    entry.tables_seen = tables.length;
    for (const t of tables) {
      const tr = t.tableReference;
      if (tr?.projectId !== out.project || tr.datasetId !== ref.datasetId || !tr.tableId) { issue(ref.datasetId, { status: 'invalid_table_reference' }); continue; }
      if (details >= BACKUP_LIMITS.tableDetails) { issue(ref.datasetId, { status: 'table_detail_limit' }); break; }
      details++;
      try {
        const value = await api.backupMetadata(client, { kind: 'table', dataset: ref.datasetId, table: tr.tableId });
        if (!['projectId', 'datasetId', 'tableId'].every(k => value.tableReference?.[k] === tr[k]) || !value.type) throw new Error('Invalid table metadata');
        entry.tables_inspected++;
        if (value.snapshotDefinition || value.cloneDefinition || value.type === 'SNAPSHOT' || value.type === 'CLONE') {
          entry.candidates.push({ table: tr, type: value.type, creationTime: value.creationTime ?? null, expirationTime: value.expirationTime ?? null,
            snapshotDefinition: value.snapshotDefinition ?? null, cloneDefinition: value.cloneDefinition ?? null });
        }
      } catch (e) { issue(`${ref.datasetId}/${tr.tableId}`, problem(e)); }
    }
  }
  const jobs = await pages('jobs', out.window, 'jobs');
  out.jobs_seen = jobs.length;
  for (const j of jobs) {
    if (j.jobReference?.projectId !== out.project || !j.jobReference.jobId) { issue('jobs', { status: 'invalid_job_reference' }); continue; }
    const c = j.configuration;
    if (!c || !c.jobType) { issue('jobs', { status: 'redacted_or_missing_configuration', job: j.jobReference }); continue; }
    if (!['COPY', 'EXTRACT'].includes(c.jobType)) continue;
    const config = c.copy ?? c.extract;
    if (!config) { issue('jobs', { status: 'redacted_configuration', job: j.jobReference }); continue; }
    const state = j.status?.state ?? j.state;
    const error = j.status?.errorResult ?? j.errorResult;
    out.jobs.push({ job: j.jobReference, type: c.jobType, state: state ?? 'UNKNOWN',
      outcome: state === 'DONE' ? error ? 'failed' : 'completed_without_reported_error' : 'unconfirmed',
      error_reason: error?.reason ?? null, statistics: j.statistics ?? null,
      sourceTables: config.sourceTables ?? (config.sourceTable ? [config.sourceTable] : []),
      destinationTable: config.destinationTable ?? null, destinationUris: config.destinationUris ?? [],
      operationType: config.operationType ?? null });
  }
  return out;
}
