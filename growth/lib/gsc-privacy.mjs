import { isSitePage } from './gsc.mjs';

// Search queries can contain personal contact details even when GSC reports
// only one impression. Published snapshots retain only aggregate omissions.
const PERSONAL_CONTACT = /@|(?:\+81[- ]?[5789]0|0[5789]0)[- ]?\d{4}[- ]?\d{4}/i;

// Job summaries and run logs of this public repository are public, every day. Output written for
// them (seo-daily's summary, --check and --write runs) carries counts, positions, CTRs, cluster
// aggregates and the site's own page paths, never the text of a search query or of a URL the site
// does not publish: whoever searches or links chooses that text, and a model reading public Actions
// pages would otherwise get it outside the Autopilot digest's rules (security audit F6).
export const QUERY_WITHHELD = '[検索語は非表示]';
export const PAGE_WITHHELD = '[サイトに無いURL]';
export const publicPage = page => (isSitePage(page) ? page : PAGE_WITHHELD);

export function omitPrivateQueries(buckets) {
  const omitted = { queries: 0, query_pages: 0, clicks: 0, impressions: 0 };
  for (const [kind, countKey] of [['queries', 'queries'], ['query-pages', 'query_pages']]) {
    buckets[kind] = buckets[kind].filter(row => {
      if (!PERSONAL_CONTACT.test(row.query)) return true;
      omitted[countKey]++;
      omitted.clicks += row.clicks;
      omitted.impressions += row.impressions;
      return false;
    });
  }
  return { rule: 'personal-contact-v1', ...omitted };
}
