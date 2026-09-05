import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterOf, summarizeClusters, QUERY_CLASSIFIER_VERSION } from './clusters.mjs';
import { assessComparison, selectComparison } from './comparison.mjs';
import { auditOverlaps, experimentScope } from './experiment-overlap.mjs';
import { summarizeAiProbes } from './ai-probes.mjs';

test('AI probes separate missing answers, brand questions and changed conditions', () => {
  const row = { date: '2026-09-05', question_set: 'v1', question_id: 'Q1', question_type: 'nonbrand',
    service: 'example', model: 'test', search_enabled: true, language: 'ja', login_state: 'signed-in',
    repetition: 1, status: 'ok', mentioned: true, linked_citation: false, wrong_claim: false, evidence_ref: '/private/example' };
  const input = { schema_version: 2, observations: [row, { ...row, repetition: 2, status: 'missing' },
    { ...row, question_id: 'Q5', question_type: 'brand' }, { ...row, search_enabled: false, status: 'error' }] };
  const result = summarizeAiProbes(input);
  assert.equal(result.groups.length, 3);
  assert.equal(result.groups[0].mention_rate, 1);
  assert.equal(result.groups[0].completed, 1);
  assert.equal(result.groups[0].missing, 1);
  assert.equal(result.groups[2].mention_rate, null);
  assert.ok(!JSON.stringify(result).includes('/private/example'));
  assert.throws(() => summarizeAiProbes({ schema_version: 2, observations: [row, row] }), /Duplicate/);
  assert.throws(() => summarizeAiProbes({ schema_version: 2, observations: [{ ...row, mentioned: null }] }), /boolean mentioned/);
});

test('known product, old name, ambiguous name and competitor demand stay distinct', () => {
  const cases = [
    ['Obsidian連携シンプルメモ', 'brand'], ['simplememofast.com', 'brand'],
    ['Simple Memo - for Obsidian', 'brand'], ['Captio式シンプルメモ', 'brand-legacy'],
    ['captio', 'captio-alternative'], ['Captio alternative', 'captio-alternative'],
    ['シンプルメモ', 'ambiguous-brand'], ['simplememo', 'ambiguous-brand'],
    ['obsidian 音声入力', 'obsidian'], ['Logseq', 'rival-brand'],
    ['offline memo', 'generic-memo'], ['LINE Keep', 'line-keep'],
  ];
  for (const [query, key] of cases) assert.equal(clusterOf(query).key, key, query);
});

test('query shares are mutually exclusive and unknown positions do not become zero', () => {
  const result = summarizeClusters([
    { query: 'captio', clicks: 7, impressions: 19, position: 3 },
    { query: 'シンプルメモ', clicks: 11, impressions: 120, position: null },
    { query: 'obsidianに音声入力するには？', clicks: 2, impressions: 20, position: 5 },
    { query: null, clicks: 10, impressions: 100 },
  ]);
  assert.equal(result.classificationVersion, QUERY_CLASSIFIER_VERSION);
  assert.equal(result.aggregation, 'available-queries');
  assert.equal(result.site.impressions, 159);
  assert.equal(result.site.position, (19 * 3 + 20 * 5) / 39);
  assert.equal(result.clusters.find(r => r.key === 'ambiguous-brand').position, null);
  assert.equal(result.conversational.clicks, 2);
  assert.ok(Math.abs(result.clusters.reduce((s, r) => s + r.impressionShare, 0) - 1) < 1e-10);
});

const snapshot = (start, end, extra = {}) => ({ meta: {
  period_start: start, period_end: end, totals: { source: 'dates' }, ...extra,
} });
test('overlap audit resolves legacy page lists and preserves global/external scopes', () => {
  const ledger = { experiments: [
    { id: 'a', status: 'running', page: '(2 pages: /obsidian/, /blog/test)' },
    { id: 'b', status: 'running', page: '/blog/test.html' },
    { id: 'global', status: 'running', page: '(215 pages: 全コンテンツページ)' },
    { id: 'external', status: 'running', page: '(PR配信 — 自律運用/RSI)' },
    { id: 'closed', status: 'evaluated', page: '/obsidian/' },
  ] };
  assert.deepEqual(auditOverlaps(ledger), {
    global: ['global'], unenumerated: ['external'], overlaps: [{ page: '/blog/test', experiments: ['a', 'b'] }],
  });
  assert.deepEqual(experimentScope({ page: '(2 pages: /, /apple-watch/)' }).pages, ['/', '/apple-watch']);
});
test('period comparison rejects partial, overlapping, missing and mixed-surface windows', () => {
  const before = snapshot('2026-08-10', '2026-09-06');
  const current = snapshot('2026-09-07', '2026-10-04');
  assert.equal(assessComparison(current, before).comparable, true);
  assert.equal(selectComparison(current, [snapshot('2026-08-17', '2026-09-13'), before]), before);
  assert.equal(assessComparison(snapshot('2026-08-17', '2026-09-13'), before).comparable, false);
  assert.equal(assessComparison(snapshot('2026-09-07', '2026-09-27'), before).comparable, false);
  assert.equal(assessComparison({ meta: {} }, before).comparable, false);
  assert.equal(assessComparison(snapshot('2026-09-07', '2026-10-04', {
    bigquery: { window_days_available: 24, window_days_requested: 28 },
  }), before).comparable, false);
  assert.equal(assessComparison(snapshot('2026-09-07', '2026-10-04', { search_type: 'IMAGE' }), before).comparable, false);
});
