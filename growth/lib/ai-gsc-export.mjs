import { parseDelimited, parseGscExport, classifyGscColumns } from './csv.mjs';
import { toPath } from './gsc.mjs';

const AI_KINDS = ['pages-aio', 'dates-aio', 'countries-aio', 'devices-aio'];
const KEYS = { 'pages-aio': 'page', 'dates-aio': 'date', 'countries-aio': 'country', 'devices-aio': 'device' };

function checkFilters(text) {
  const [header, ...rows] = parseDelimited(text);
  if (!header || !['フィルタ', 'Filter'].includes(header[0]) || !['値', 'Value'].includes(header[1])) {
    throw new Error('AI export filter CSV is missing or has changed format');
  }
  let web = 0, date = 0;
  for (const [key, value] of rows) {
    if (['検索タイプ', 'Search type'].includes(key) && ['ウェブ', 'Web'].includes(value)) web++;
    else if (['日付', 'Date'].includes(key) && value) date++;
    else throw new Error(`Unsupported AI export filter: ${key}`);
  }
  if (web !== 1 || date !== 1) throw new Error('AI export requires one Web search type and one date filter');
}

function sum(rows) { return rows.reduce((n, row) => n + row.impressions, 0); }

/** Parse the four dimensions in an unfiltered Search Console generative-AI CSV export. */
export function parseAiGscExport(csvFiles, { periodStart, periodEnd }) {
  const buckets = Object.fromEntries(AI_KINDS.map(kind => [kind, []]));
  let filterCount = 0;
  for (const [name, body] of Object.entries(csvFiles)) {
    const parsed = parseGscExport(body, { keepUnavailable: true });
    const kind = classifyGscColumns(parsed.columns);
    if (!kind) { checkFilters(body); filterCount++; continue; }
    if (!AI_KINDS.includes(kind) || buckets[kind].length || parsed.unmapped.length ||
        parsed.columns.length !== 2 || !parsed.columns.includes('impressions')) {
      throw new Error(`Unexpected or duplicate AI export dimension: ${name}`);
    }
    // Search Console can turn suppressed "~"/"-" cells into 0 on CSV export.
    // The shared parser also omits non-date zero rows. Detect both before the
    // omission could make an incomplete dimension look valid.
    if (parsed.rows.length !== parseDelimited(body).length - 1) {
      throw new Error(`AI export contains an omitted zero row in ${name}; UI readback is required`);
    }
    if (!parsed.rows.length) throw new Error(`Empty AI export dimension: ${name}`);
    const key = KEYS[kind], seen = new Map();
    for (const row of parsed.rows) {
      if (!Number.isSafeInteger(row.impressions) || row.impressions <= 0 || !row[key]) {
        throw new Error(`Unavailable, zero or invalid AI impression in ${name}; CSV alone cannot prove a true zero`);
      }
      if (kind === 'pages-aio') {
        const url = new URL(row.page);
        if (url.protocol !== 'https:' || url.hostname !== 'simplememofast.com') {
          throw new Error(`Unexpected AI page origin in ${name}`);
        }
        row.page = toPath(url.href);
      }
      const value = row[key];
      if (seen.has(value)) {
        if (kind !== 'pages-aio') throw new Error(`Duplicate AI ${key} in ${name}`);
        seen.get(value).impressions += row.impressions;
      } else seen.set(value, row);
    }
    buckets[kind] = [...seen.values()];
  }
  if (filterCount !== 1 || AI_KINDS.some(kind => !buckets[kind].length)) {
    throw new Error('AI export requires exactly one filter and all four dimensions');
  }
  const dates = buckets['dates-aio'].map(row => row.date).sort();
  const expected = [];
  for (let day = Date.parse(periodStart); day <= Date.parse(periodEnd); day += 86400000) {
    expected.push(new Date(day).toISOString().slice(0, 10));
  }
  if (JSON.stringify(dates) !== JSON.stringify(expected)) {
    throw new Error('AI export dates do not match the verified WEB snapshot window');
  }
  const property = sum(buckets['dates-aio']);
  if (property !== sum(buckets['countries-aio']) || property !== sum(buckets['devices-aio'])) {
    throw new Error('AI property impressions differ between dates, countries and devices');
  }
  return buckets;
}
