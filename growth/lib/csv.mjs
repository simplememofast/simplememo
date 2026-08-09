/**
 * RFC4180 CSV/TSV reader for Search Console exports.
 *
 * Written by hand because the repo has no root package.json and no build step —
 * every script here must run under a bare `node` with zero installs.
 *
 * Two things about GSC exports that a naive `split(',')` gets wrong:
 *
 *   1. Query strings routinely contain commas ("obsidian 音声入力, iphone") and
 *      the export quotes them. Splitting on commas shreds those rows.
 *   2. The export is localised. A Japanese account exports
 *      「上位のクエリ,クリック数,表示回数,CTR,掲載順位」 — the same file an
 *      English account exports as "Top queries,Clicks,Impressions,CTR,Position".
 *      Column *names* are therefore not a stable contract; `HEADER_ALIASES`
 *      below maps both vocabularies onto one internal schema.
 */

/** Parse CSV/TSV text into an array of raw string rows. */
export function parseDelimited(text, delimiter = ',') {
  // Strip UTF-8 BOM — Google prefixes it and it would otherwise become part of
  // the first header cell, breaking the alias lookup.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else quoted = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delimiter) { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  // Trailing line without a newline terminator.
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * Internal schema ← the header spellings Search Console actually emits.
 * Keys are lowercased and whitespace-stripped before lookup.
 */
const HEADER_ALIASES = new Map(Object.entries({
  // dimension: query
  'topqueries': 'query', 'query': 'query', 'queries': 'query',
  '上位のクエリ': 'query', 'クエリ': 'query',
  // dimension: page
  'toppages': 'page', 'page': 'page', 'pages': 'page',
  '上位のページ': 'page', 'ページ': 'page',
  // dimension: date
  'date': 'date', '日付': 'date',
  // dimension: country / device
  'country': 'country', '国': 'country',
  'device': 'device', 'デバイス': 'device',
  // metrics
  'clicks': 'clicks', 'クリック数': 'clicks', 'クリック': 'clicks',
  'impressions': 'impressions', '表示回数': 'impressions',
  'ctr': 'ctr', 'クリック率': 'ctr',
  'position': 'position', 'averageposition': 'position',
  '掲載順位': 'position', '平均掲載順位': 'position',
}));

function canonicalHeader(raw) {
  const key = String(raw).replace(/\s+/g, '').toLowerCase();
  return HEADER_ALIASES.get(key) || null;
}

/** "2.2%" → 0.022 · "1,234" → 1234 · "8.9" → 8.9 · "" → null */
function toNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const pct = s.endsWith('%');
  const n = Number(s.replace(/%$/, '').replace(/,/g, '').trim());
  if (!Number.isFinite(n)) return null;
  return pct ? n / 100 : n;
}

/**
 * Parse a GSC export into typed records.
 *
 * @returns {{ rows: object[], columns: string[], unmapped: string[] }}
 *   `unmapped` lists header cells we could not place. Callers surface it rather
 *   than dropping it silently: an unrecognised header usually means the export
 *   carried a dimension we should be storing, not that the file is malformed.
 */
export function parseGscExport(text, { delimiter } = {}) {
  const delim = delimiter || (text.includes('\t') && !text.includes(',') ? '\t' : ',');
  const raw = parseDelimited(text, delim);
  if (!raw.length) return { rows: [], columns: [], unmapped: [] };

  const header = raw[0];
  const mapped = header.map(canonicalHeader);
  const unmapped = header.filter((h, i) => mapped[i] === null && h.trim() !== '');
  const columns = mapped.filter(Boolean);

  const NUMERIC = new Set(['clicks', 'impressions', 'ctr', 'position']);
  const rows = [];
  for (let r = 1; r < raw.length; r++) {
    const rec = {};
    for (let c = 0; c < mapped.length; c++) {
      const key = mapped[c];
      if (!key) continue;
      const cell = raw[r][c];
      rec[key] = NUMERIC.has(key) ? toNumber(cell) : String(cell ?? '').trim();
    }
    // A row with no impressions carries no signal and would distort every
    // aggregate (notably the derived CTR curve), so drop it here.
    if (rec.impressions == null || rec.impressions === 0) continue;
    // GSC rounds CTR for display; recompute so downstream gap math is exact.
    if (rec.clicks != null && rec.impressions) rec.ctr = rec.clicks / rec.impressions;
    rows.push(rec);
  }
  return { rows, columns, unmapped };
}
