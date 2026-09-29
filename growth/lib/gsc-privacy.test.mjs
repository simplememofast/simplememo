import test from 'node:test';
import assert from 'node:assert/strict';
import { omitPrivateQueries } from './gsc-privacy.mjs';

test('contact details are omitted without hiding aggregate counts or ordinary years', () => {
  const buckets = {
    queries: [
      { query: 'ordinary 2025 2026 2027', clicks: 2, impressions: 10 },
      { query: 'person@example.com', clicks: 0, impressions: 1 },
    ],
    'query-pages': [
      { query: '090-1234-5678', page: '/', clicks: 1, impressions: 2 },
    ],
  };
  assert.deepEqual(omitPrivateQueries(buckets), {
    rule: 'personal-contact-v1', queries: 1, query_pages: 1, clicks: 1, impressions: 3,
  });
  assert.equal(buckets.queries.length, 1);
  assert.equal(buckets['query-pages'].length, 0);
});
