#!/usr/bin/env node
/** Regression tests use synthetic files in disposable directories, never live ledgers. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gscEvidence, gscScope, reviewEvidence, fingerprint, metricSource } from '../lib/experiment-evidence.mjs';
import { measuresPageCtr } from '../lib/ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const asOf = '2026-01-15';
const exp = () => ({ id: 'synthetic', status: 'running', type: 'title_test', page: '/x/',
  started_at: '2026-01-07', evaluation_at: '2026-01-15', target_metric: 'ctr',
  baseline: { clicks: 10, impressions: 100, ctr: 0.1, position: 4, window: '2026-01-01..2026-01-02' },
  control: { kind: 'pre_post', note: 'Synthetic', confounders: 'Synthetic' },
  min_sample: { metric: 'impressions', threshold: 100, rationale: 'Synthetic' }, stop_conditions: ['Synthetic'] });
const snapshot = () => ({ label: 'synthetic-post', meta: { period_start: '2026-01-08', period_end: '2026-01-09', search_type: 'WEB', time_zone: 'America/Los_Angeles' },
  pages: [{ page: '/x/', clicks: 20, impressions: 100, ctr: 0.2, position: 3 }],
  queryPages: [{ page: '/x/', query: 'exact query', clicks: 2, impressions: 20, position: 5 }],
  dates: ['2026-01-08', '2026-01-09'].map(date => ({ date, clicks: 10, impressions: 50 })) });
const admit = (e = exp(), s = snapshot(), decision = 'keep') => gscEvidence(e, s, { asOf, decision });

test('matching GSC scope preserves before/post values without claiming causal proof', () => {
  const out = admit();
  assert.equal(out.baseline.value, 0.1);
  assert.equal(out.post.value, 0.2);
  assert.equal(out.kind, 'gsc_comparison');
  assert.ok(out.limitations.some(s => s.includes('causality')));
});

for (const [name, mutate, error] of [
  ['CTA cannot use GSC', (e) => { e.target_metric = 'app_store_click / session_start'; }, /own source/],
  ['ASC cannot use GSC', (e) => { e.target_metric = 'App Store Connect campaign installs for ct=*__qr'; }, /own source/],
  ['brand query totals cannot use page totals', (e) => { e.target_metric = 'brand_search_impressions'; }, /own source/],
  ['metadata alone is not measurement data', (_, s) => { s.dates = []; s.pages = []; }, /coverage/],
  ['unrelated page is not zero', (_, s) => { s.pages[0].page = '/other/'; }, /matching measurement/],
  ['duplicate matching rows are ambiguous', (_, s) => { s.pages.push({ ...s.pages[0] }); }, /matching measurement/],
  ['missing daily coverage', (_, s) => { s.dates.pop(); }, /coverage/],
  ['duplicate daily coverage', (_, s) => { s.dates[1].date = s.dates[0].date; }, /coverage/],
  ['daily row outside window', (_, s) => { s.dates[1].date = '2026-01-10'; }, /outside/],
  ['shorter post window', (_, s) => { s.meta.period_end = '2026-01-08'; }, /same number/],
  ['future period', (_, s) => { s.meta.period_start = '2026-02-08'; s.meta.period_end = '2026-02-09'; }, /lag/],
  ['post window starts on rollout day', (_, s) => { s.meta.period_start = '2026-01-07'; s.meta.period_end = '2026-01-08'; }, /launch day/],
  ['baseline includes rollout day', (e) => { e.baseline.window = '2026-01-06..2026-01-07'; }, /Baseline must end/],
  ['missing baseline period', (e) => { delete e.baseline.window; }, /baseline.window/],
  ['invalid calendar date', (_, s) => { s.meta.period_end = '2026-02-30'; }, /calendar date/],
  ['missing primary baseline', (e) => { e.baseline.impressions = null; }, /valid clicks/],
  ['negative count', (_, s) => { s.pages[0].clicks = -1; }, /valid clicks/],
  ['numeric strings not silently coerced', (_, s) => { s.pages[0].impressions = '100'; }, /valid clicks/],
  ['wrong search type', (_, s) => { s.meta.search_type = 'IMAGE'; }, /Non-WEB/],
  ['wrong timezone', (_, s) => { s.meta.time_zone = 'UTC'; }, /Pacific/],
  ['explicit incomplete coverage', (_, s) => { s.meta.complete_window = false; }, /incomplete/],
  ['FAQ without scope is not a page CTR experiment', (e) => { e.type = 'faq_add'; }, /scope must be explicit/],
  ['query and page must both match', (e, s) => { e.measurement_scope = { kind: 'query_page', page: '/x/', query: 'different' }; }, /matching measurement/],
  ['scope cannot change experiment page', (e) => { e.measurement_scope = { kind: 'page', page: '/other/' }; }, /differs/],
  ['extra filters require a contract', (e) => { e.measurement_scope = { kind: 'page', page: '/x/', country: 'JPN' }; }, /Additional GSC/],
]) test(name, () => {
  const e = exp(), s = snapshot(); mutate(e, s);
  assert.throws(() => admit(e, s), error);
});

test('exact query AND page uses query-page CTR and is excluded from page-CTR detectors', () => {
  const e = exp(); e.type = 'faq_add'; e.measurement_scope = { kind: 'query_page', page: '/x/', query: 'exact query' };
  assert.equal(admit(e).post.value, 0.1);
  assert.equal(measuresPageCtr(e), false);
  assert.equal(measuresPageCtr(exp()), true);
});
test('zero measured impressions permit inconclusive but never a measured CTR keep', () => {
  const s = snapshot(); s.pages[0] = { page: '/x/', clicks: 0, impressions: 0 };
  assert.throws(() => admit(exp(), s), /Zero impressions/);
  assert.equal(admit(exp(), s, 'inconclusive').post.value, null);
});
test('position uses measured position while CTR is recomputed from counts', () => {
  const e = exp(); e.target_metric = 'position'; assert.equal(admit(e).post.value, 3);
  const s = snapshot(); s.pages[0].ctr = 0.99; assert.equal(admit(exp(), s).post.value, 0.2);
  delete s.pages[0].position; assert.throws(() => admit(e, s), /position/);
});
test('legacy missing filter metadata is visible as a limitation', () => {
  const s = snapshot(); delete s.meta.search_type; delete s.meta.time_zone;
  assert.equal(admit(exp(), s).limitations.filter(x => x.startsWith('Legacy')).length, 2);
});

function withReview(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-review-'));
  try {
    const e = exp(); e.target_metric = 'app_store_click / session_start';
    const c = { source: 'ga4', definition: 'synthetic owned-click sessions / organic sessions v1',
      unit: 'ratio', time_zone: 'Asia/Tokyo', lag_days: 5, scope: { pages: ['/x/'], channel: 'Organic Search' } };
    e.measurement_contract = c;
    e.baseline = { metric: e.target_metric, value: 0.1, window: '2026-01-01..2026-01-02' };
    const makePeriod = (name, start, end, value) => {
      const file = path.join(dir, `${name}.json`), bytes = JSON.stringify([{ value, synthetic: true }]);
      fs.writeFileSync(file, bytes);
      return { start, end, value, complete: true, definition: c.definition, unit: c.unit, time_zone: c.time_zone,
        scope: c.scope, extraction: 'Synthetic regression row 1; not live GA4 data',
        artifact: { path: file, sha256: fingerprint(bytes) } };
    };
    const review = { schema_version: 1, kind: 'comparison', experiment_id: e.id, target_metric: e.target_metric,
      decision: 'keep', source: c.source, definition: c.definition, unit: c.unit, time_zone: c.time_zone, scope: c.scope,
      reviewed_by: 'Synthetic test', rationale: 'Synthetic only', limitations: ['Not actual acquisition evidence'],
      baseline: makePeriod('before', '2026-01-01', '2026-01-02', 0.1),
      post: makePeriod('after', '2026-01-08', '2026-01-09', 0.2) };
    return fn(e, review, dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const reviewOptions = (dir, decision = 'keep') => ({ baseDir: dir, asOf, decision, manifestSha256: 'synthetic' });
test('source-specific comparison checks the contract and hashes, explicitly records manual interpretation', () => withReview((e, r, dir) => {
  const out = reviewEvidence(e, r, reviewOptions(dir));
  assert.equal(out.kind, 'manual_comparison');
  assert.equal(out.source, 'ga4');
  assert.match(out.validation, /not independently recomputed/);
  assert.ok(!JSON.stringify(out).includes(dir));
}));
for (const [name, mutate, error] of [
  ['review experiment mismatch', (_, r) => { r.experiment_id = 'other'; }, /must match/],
  ['review metric mismatch', (_, r) => { r.target_metric = 'ctr'; }, /must match/],
  ['review decision mismatch', (_, r) => { r.decision = 'revert'; }, /must match/],
  ['source mismatch', (_, r) => { r.source = 'gsc'; }, /source differs/],
  ['unregistered measurement contract', (e) => { delete e.measurement_contract; }, /registered measurement_contract/],
  ['unrelated numeric baseline', (e) => { e.baseline = exp().baseline; }, /explicitly measure/],
  ['baseline numeric rewrite', (_, r) => { r.baseline.value = 0.15; }, /baseline differs/],
  ['scope mismatch', (_, r) => { r.scope = { pages: ['/other/'] }; }, /scope differs/],
  ['changed denominator definition', (_, r) => { r.post.definition = 'users instead of sessions'; }, /Both periods/],
  ['timezone mismatch', (_, r) => { r.post.time_zone = 'UTC'; }, /Both periods/],
  ['units mismatch', (_, r) => { r.post.unit = 'percent'; }, /Both periods/],
  ['incomplete period', (_, r) => { r.post.complete = false; }, /Both periods/],
  ['missing metric', (_, r) => { r.post.value = null; }, /numeric result/],
  ['invalid rate', (_, r) => { r.post.value = 2; }, /Ratio/],
  ['too little GA4 lag', (e) => { e.measurement_contract.lag_days = 1; }, /sufficient data lag/],
  ['missing extraction reference', (_, r) => { r.post.extraction = ''; }, /extraction reference/],
  ['missing limitations', (_, r) => { r.limitations = []; }, /limitations/],
  ['tampered artifact', (_, r) => { fs.appendFileSync(r.post.artifact.path, ' '); }, /SHA-256/],
  ['missing artifact', (_, r) => { fs.unlinkSync(r.post.artifact.path); }, /ENOENT/],
  ['wrong-family API artifact', (_, r) => { const bytes = JSON.stringify({ report: 'gsc', status: 'complete', execution: 'export', queries: [{ result: { rows: [{ value: 1 }] } }] }); fs.writeFileSync(r.post.artifact.path, bytes); r.post.artifact.sha256 = fingerprint(bytes); }, /different metric source/],
  ['metadata-only API artifact', (_, r) => { const bytes = JSON.stringify({ report: 'ga4-funnel', status: 'complete', execution: 'export', queries: [] }); fs.writeFileSync(r.post.artifact.path, bytes); r.post.artifact.sha256 = fingerprint(bytes); }, /no exported measurement rows/],
]) test(name, () => withReview((e, r, dir) => {
  mutate(e, r);
  assert.throws(() => reviewEvidence(e, r, reviewOptions(dir)), error);
}));
test('measurement diagnosis has its own evidence and cannot be submitted as keep', () => withReview((e, r, dir) => {
  const diagnostic = { ...r, kind: 'diagnostic', decision: 'measurement_failed', findings: ['Historical denominator cannot be recovered'], artifacts: [r.baseline.artifact] };
  delete e.measurement_contract;
  assert.equal(reviewEvidence(e, diagnostic, reviewOptions(dir, 'measurement_failed')).kind, 'measurement_diagnostic');
  diagnostic.decision = 'keep';
  assert.throws(() => reviewEvidence(e, diagnostic, reviewOptions(dir)), /only record measurement_failed/);
}));

function withCli(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-evaluate-'));
  try {
    for (const file of ['growth/scripts/experiments.mjs', 'growth/lib/ledger.mjs', 'growth/lib/gsc.mjs', 'growth/lib/experiment-evidence.mjs']) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    }
    const ledgerPath = path.join(dir, 'growth/experiments/experiments.json');
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    const e = exp();
    const save = () => fs.writeFileSync(ledgerPath, JSON.stringify({ experiments: [e] }));
    const s = snapshot(), target = path.join(dir, 'growth/data/gsc', s.label);
    fs.mkdirSync(target, { recursive: true });
    for (const [name, value] of Object.entries({ meta: s.meta, pages: s.pages, 'query-pages': s.queryPages, dates: s.dates })) fs.writeFileSync(path.join(target, `${name}.json`), JSON.stringify(value));
    const run = (...args) => spawnSync(process.execPath, [path.join(dir, 'growth/scripts/experiments.mjs'), ...args],
      { cwd: dir, encoding: 'utf8', env: { ...process.env, GROWTH_GSC_DIR: path.join(dir, 'growth/data/gsc') } });
    save(); return fn({ e, s, dir, target, save, run, ledgerPath });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('CLI reproducer: CTA plus post-period metadata is rejected without changing the ledger', () => withCli(({ e, save, run, target, ledgerPath }) => {
  e.target_metric = 'app_store_click / session_start'; save();
  for (const file of ['pages.json', 'query-pages.json', 'dates.json']) fs.unlinkSync(path.join(target, file));
  const before = fs.readFileSync(ledgerPath, 'utf8');
  const out = run('evaluate', e.id, '--decision', 'keep', '--note', 'Synthetic regression fixture only');
  assert.equal(out.status, 2);
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);
}));
test('CLI writes an explicitly selected valid GSC comparison and preserves evidence hashes', () => withCli(({ e, run, ledgerPath }) => {
  const out = run('evaluate', e.id, '--decision', 'keep', '--snapshot', 'synthetic-post', '--note', 'Synthetic comparison only');
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(fs.readFileSync(ledgerPath)).experiments[0];
  assert.equal(result.decision, 'keep');
  assert.equal(result.evidence.artifacts.length, 3);
  assert.equal(result.evidence.post.value, 0.2);
}));
test('CLI CTA cannot use even a complete explicitly selected GSC snapshot', () => withCli(({ e, save, run, ledgerPath }) => {
  e.target_metric = 'app_store_click / session_start'; save();
  const before = fs.readFileSync(ledgerPath, 'utf8');
  const out = run('evaluate', e.id, '--decision', 'keep', '--snapshot', 'synthetic-post', '--note', 'Synthetic');
  assert.equal(out.status, 2);
  assert.match(out.stderr, /own source/);
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);
  assert.match(run('due').stdout, /No matching GSC comparison/);
}));
test('CLI saves a complete manual comparison with a manifest hash', () => withReview((reviewExp, review) => withCli(({ e, save, run, ledgerPath, dir }) => {
  Object.assign(e, reviewExp); save();
  const manifest = path.join(dir, 'review.json'), bytes = JSON.stringify(review);
  fs.writeFileSync(manifest, bytes);
  const out = run('evaluate', e.id, '--decision', 'keep', '--review', manifest);
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(fs.readFileSync(ledgerPath)).experiments[0];
  assert.equal(result.evidence.kind, 'manual_comparison');
  assert.equal(result.evidence.manifest_sha256, fingerprint(bytes));
})));
test('CLI diagnosis can close missing measurement without a comparable baseline', () => withCli(({ e, save, run, ledgerPath, dir }) => {
  e.target_metric = 'app_store_clicks'; e.baseline = { clicks: null }; save();
  const bytes = fs.readFileSync(ledgerPath);
  const ref = path.join(dir, 'diagnostic-ledger.json'); fs.writeFileSync(ref, bytes);
  const manifest = path.join(dir, 'diagnosis.json');
  fs.writeFileSync(manifest, JSON.stringify({ schema_version: 1, kind: 'diagnostic', experiment_id: e.id,
    target_metric: e.target_metric, decision: 'measurement_failed', reviewed_by: 'Synthetic', rationale: 'Synthetic missing measurement',
    findings: ['No compatible baseline'], artifacts: [{ path: ref, sha256: fingerprint(bytes) }] }));
  const out = run('evaluate', e.id, '--decision', 'measurement_failed', '--review', manifest);
  assert.equal(out.status, 0, out.stderr);
  const result = JSON.parse(fs.readFileSync(ledgerPath)).experiments[0];
  assert.equal(result.evidence.kind, 'measurement_diagnostic');
}));
for (const [name, args] of [
  ['force cannot bypass evidence', ['--force']],
  ['snapshot must be explicitly selected', []],
  ['snapshot path traversal rejected', ['--snapshot', '../synthetic-post']],
  ['both routes cannot be selected', ['--snapshot', 'synthetic-post', '--review', 'unused.json']],
]) test(`CLI ${name}`, () => withCli(({ e, run, ledgerPath }) => {
  const before = fs.readFileSync(ledgerPath, 'utf8');
  assert.equal(run('evaluate', e.id, '--decision', 'keep', '--note', 'Synthetic', ...args).status, 2);
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);
}));
test('CLI evaluated records cannot be overwritten', () => withCli(({ e, save, run, ledgerPath }) => {
  e.status = 'evaluated'; e.decision = 'inconclusive'; e.evaluated_at = '2026-01-15'; save();
  const before = fs.readFileSync(ledgerPath, 'utf8');
  assert.equal(run('evaluate', e.id, '--decision', 'keep', '--snapshot', 'synthetic-post', '--note', 'Synthetic').status, 2);
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), before);
}));
test('CLI abandonment is explicitly administrative and requires a reason', () => withCli(({ e, run, ledgerPath }) => {
  assert.equal(run('evaluate', e.id, '--decision', 'abandoned').status, 2);
  assert.equal(run('evaluate', e.id, '--decision', 'abandoned', '--note', 'Stop for a documented operational reason').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(ledgerPath)).experiments[0].evidence.kind, 'administrative');
}));
test('registered FAQ scope is exact and all four September 13 CTA metrics require their actual source', () => {
  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/experiments/experiments.json'))).experiments;
  assert.deepEqual(gscScope(rows.find(e => e.id === 'faq-2026-08-09-line-keep-doko')),
    { kind: 'query_page', page: '/blog/line-keep-alternative', query: 'line keepメモ どこ' });
  const ctas = rows.filter(e => ['cta-2026-08-10-desktop-qr', 'cta-2026-08-10-mid-placement',
    'cta-2026-08-10-strongest-page-inline', 'cta-2026-08-12-download-page'].includes(e.id));
  assert.equal(ctas.length, 4);
  for (const e of ctas) { assert.ok(['ga4', 'asc'].includes(metricSource(e))); assert.throws(() => gscScope(e)); }
});
