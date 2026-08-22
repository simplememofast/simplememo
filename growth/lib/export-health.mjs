/**
 * Is the Search Console bulk export delivering — or only *looking* like it?
 *
 * `bq-preflight.mjs` used to answer that with one number: how far behind the
 * newest `data_date` is. That catches an export which has stopped. It cannot
 * catch the failure that actually happened.
 *
 * 2026-08-21/22: Search Console emailed "一括データ エクスポートに失敗しました"
 * for five (table, data_date) pairs. Every check the pipeline had said the
 * export was healthy — and it was right that data was arriving, because the
 * failures were not on the *first* delivery of a day. Search Console restates
 * a day's figures after the fact and re-exports it with `epoch_version` 1;
 * those re-exports were the ones failing. A restatement failure moves nothing:
 * `MAX(data_date)` is unchanged, no row disappears, no query returns less. The
 * only local evidence is an empty
 *
 *   temp_SEARCHDATA_SITE_IMPRESSION_2026-08-14_80ce962f
 *
 * left in the dataset — the staging table the exporter creates before it loads
 * anything, orphaned when the attempt died. Preflight was reading those and
 * announcing them as "query scratch, ignored". The one artifact that reported
 * the failure was being filtered out as noise by name.
 *
 * So this module classifies by what the name *means*, and separates the two
 * cases the failure mail does not:
 *
 *   - the day is already in the destination table → a restatement failed. No
 *     data is missing; those figures stay at the previous epoch. Google retries
 *     for about a week and usually wins (four of the six did, within a day).
 *   - the day is NOT in the destination table    → a day is actually missing,
 *     and it will stop being retried after roughly a week.
 *
 * The second is the one worth waking up for. Sending someone into IAM for the
 * first is the wrong move and costs a day: the same service account is writing
 * to the same dataset successfully minutes either side of a failed attempt, so
 * a permission problem cannot be what selects which attempts fail.
 *
 * Nothing here touches BigQuery — it takes table names and date lists, so the
 * whole judgement is testable without credentials (export-health.test.mjs).
 */

/** The three tables Search Console creates and owns. Names are fixed by Google. */
export const EXPORT_TABLES = ['searchdata_site_impression', 'searchdata_url_impression', 'ExportLog'];

/** namespace (as written in ExportLog and in staging table names) → destination table. */
export const DESTINATION = {
  SEARCHDATA_SITE_IMPRESSION: 'searchdata_site_impression',
  SEARCHDATA_URL_IMPRESSION: 'searchdata_url_impression',
};

/* temp_<NAMESPACE>_<YYYY-MM-DD>_<hex>. Written by the exporter, dropped by it
 * on success, and given its own ~7-day expiry — so an orphan disappears on its
 * own and must NOT be deleted by hand while a retry may still be using it. */
const STAGING = /^temp_(SEARCHDATA_(?:SITE|URL)_IMPRESSION)_(\d{4}-\d{2}-\d{2})_[0-9a-f]+$/;

const DAY = 86_400_000;
const utc = (d) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Split a dataset listing into the export's own tables, its orphaned staging
 * tables, and anything else.
 *
 * Accepts strings or `{ id }` objects (what lib/bigquery.mjs listTables returns).
 * Deliberately does not treat "has an expiry" as evidence of scratch: ExportLog
 * inherits the dataset's default table expiration, so that test classified an
 * export table as junk.
 */
export function classifyTables(tables) {
  const exported = [];
  const staging = [];
  const foreign = [];
  for (const t of tables) {
    const id = typeof t === 'string' ? t : t?.id;
    if (!id) continue;
    if (EXPORT_TABLES.includes(id)) { exported.push(id); continue; }
    const m = STAGING.exec(id);
    if (m) { staging.push({ id, namespace: m[1], dataDate: m[2] }); continue; }
    foreign.push(id);
  }
  staging.sort((a, b) => a.dataDate.localeCompare(b.dataDate) || a.namespace.localeCompare(b.namespace));
  return { exported, staging, foreign };
}

/**
 * Days absent from the middle of a run of dates.
 *
 * Only holes between the first and last date count. A short history is not a
 * gap, and neither is the newest day not having arrived yet — those are the
 * export starting up and the export's normal 2–3 day lag, both of which already
 * have their own checks.
 */
export function missingDates(dates) {
  const have = new Set(dates);
  const sorted = [...have].sort();
  if (sorted.length < 2) return [];
  const out = [];
  for (let t = utc(sorted[0]); t <= utc(sorted.at(-1)); t += DAY) {
    const d = iso(t);
    if (!have.has(d)) out.push(d);
  }
  return out;
}

/**
 * Findings about the export's integrity, worst first.
 *
 * Each is `{ level: 'bad' | 'warn', code, message, detail }`. `bad` means data
 * is missing or will be; `warn` means an attempt failed but the table already
 * holds that day. An empty array means the two destination tables are
 * gap-free, in step with each other, and no attempt is currently orphaned.
 */
export function exportHealth({ staging = [], siteDates = [], urlDates = [] } = {}) {
  const dates = {
    SEARCHDATA_SITE_IMPRESSION: new Set(siteDates),
    SEARCHDATA_URL_IMPRESSION: new Set(urlDates),
  };
  const findings = [];

  for (const s of staging) {
    const landed = dates[s.namespace]?.has(s.dataDate);
    findings.push(landed
      ? {
        level: 'warn',
        code: 'restatement-failed',
        message: `${s.namespace} ${s.dataDate}: an export attempt failed, but the day is already in the table`,
        detail: 'Search Console re-exports a day after restating it. This attempt died before loading;'
          + ' the day keeps its previous figures. Retries run for about a week and usually succeed.'
          + ' Nothing to fix here — do not change IAM, and do not delete the staging table.',
      }
      : {
        level: 'bad',
        code: 'day-missing',
        message: `${s.namespace} ${s.dataDate}: the export failed and this day is NOT in the table`,
        detail: `No rows for ${s.dataDate} in ${DESTINATION[s.namespace]}. Search Console stops retrying a`
          + ' day after roughly a week, and the export never backfills on its own — after that the day is'
          + ' gone for good. Check Search Console → 設定 → 一括データエクスポート for the reported error.',
      });
  }

  for (const [namespace, table] of Object.entries(DESTINATION)) {
    const holes = missingDates([...dates[namespace]]);
    if (holes.length) {
      findings.push({
        level: 'bad',
        code: 'gap',
        message: `${table}: ${holes.length} day${holes.length === 1 ? '' : 's'} missing inside the history — ${holes.join(', ')}`,
        detail: 'A hole in the middle is not lag. Every window built on this table is short by these days,'
          + ' and averages over it are computed against the wrong denominator.',
      });
    }
  }

  /* The two tables are written by separate exports and land hours apart, so one
   * day of skew is routine. Two is not: it means one namespace has stalled
   * while the other keeps arriving — which reads as "fresh" to any check that
   * only looks at whichever table it happens to query. */
  const newest = (ns) => [...dates[ns]].sort().at(-1);
  const site = newest('SEARCHDATA_SITE_IMPRESSION');
  const url = newest('SEARCHDATA_URL_IMPRESSION');
  if (site && url) {
    const skew = Math.round(Math.abs(utc(site) - utc(url)) / DAY);
    if (skew >= 2) {
      findings.push({
        level: 'bad',
        code: 'skew',
        message: `the two tables are ${skew} days apart — site ${site}, url ${url}`,
        detail: 'They are exported separately. One has stalled while the other keeps arriving, so a check'
          + ' that reads only the healthy one will report the export as fresh.',
      });
    }
  }

  return findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
}
