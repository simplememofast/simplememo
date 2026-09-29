// Search queries can contain personal contact details even when GSC reports
// only one impression. Published snapshots retain only aggregate omissions.
const PERSONAL_CONTACT = /@|(?:\+81[- ]?[5789]0|0[5789]0)[- ]?\d{4}[- ]?\d{4}/i;

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
