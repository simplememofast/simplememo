import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { surfaceTimelineClaims, timelineClaims } from './autonomy-timeline.mjs';

const root = new URL('../', import.meta.url);
const rel = 'docs/pr-autopilot-2026-09-body.md';
const published = fs.readFileSync(new URL(rel, root), 'utf8');
const saved = JSON.parse(fs.readFileSync(new URL('data/autonomy-timeline.json', root), 'utf8'));
const clone = () => structuredClone(saved);

test('配信済み資料は旧スコープで検証し、現行スコープへの不一致を許可する', () => {
  const changedScope = clone();
  changedScope.denominator_tasks = saved.previous_scope_series[0].denominator_tasks - 7;
  changedScope.points = changedScope.points.map(p => ({ ...p, overall_automation_rate: p.cumulative / changedScope.denominator_tasks }));
  assert.ok(timelineClaims(published, changedScope).length > 0);
  assert.deepEqual(surfaceTimelineClaims(published, changedScope, rel), []);
});

test('凍結資料の数字の変更は、旧数値でも現行数値でも拒む', () => {
  const changed = published.replace('8.0%', '8.3%');
  assert.notEqual(changed, published);
  assert.match(surfaceTimelineClaims(changed, saved, rel).join(), /保存時の内容と違う/);
});

test('凍結マーカーだけ、別パス、別日付、重複記録では検証を省略できない', () => {
  assert.ok(surfaceTimelineClaims(published, { ...saved, previous_scope_series: [] }, rel).length);
  assert.ok(surfaceTimelineClaims(published, saved, 'docs/another.md').length);
  assert.ok(surfaceTimelineClaims(published.replace('numbers-frozen: 2026-09-03', 'numbers-frozen: 2026-09-04'), saved, rel).length);
  const doc = clone();
  doc.previous_scope_series.push(structuredClone(doc.previous_scope_series[0]));
  assert.ok(surfaceTimelineClaims(published, doc, rel).length);
});

test('ハッシュが一致しても、配信資料と旧スコープの数値の不一致を拒む', () => {
  const doc = clone();
  const changed = published.replace('8.0%', '99.9%');
  doc.previous_scope_series[0].frozen_documents[0].sha256 = createHash('sha256').update(changed).digest('hex');
  assert.match(surfaceTimelineClaims(changed, doc, rel).join(), /台帳は/);
});

test('旧系列の分母・計算・起点の破損を拒む', () => {
  for (const mutate of [
    series => { series.denominator_tasks = 0; },
    series => { series.points[0].overall_automation_rate += 0.1; },
    series => { series.points[0].cumulative = -1; },
    series => { series.launch_month = '1900-01'; },
  ]) {
    const doc = clone();
    mutate(doc.previous_scope_series[0]);
    assert.ok(surfaceTimelineClaims(published, doc, rel).length);
  }
});

test('登録済みの配信資料は凍結マーカーを消しても凍結を解除できない', () => {
  const changed = published.replace(/^<!-- numbers-frozen:.*-->\n/m, '');
  assert.notEqual(changed, published);
  assert.match(surfaceTimelineClaims(changed, saved, rel).join(), /凍結日/);
});

test('凍結されていない資料は現在の分母で照合する', () => {
  const denominator = saved.denominator_tasks;
  assert.deepEqual(surfaceTimelineClaims(`分母（${denominator}タスク）`, saved, 'docs/current.md'), []);
  assert.ok(surfaceTimelineClaims(`分母（${denominator + 1}タスク）`, saved, 'docs/current.md').length);
});

test('公開面の変更前比較は、保存した採点範囲の分子・分母・計算に一致する', () => {
  const coverage = JSON.parse(fs.readFileSync(new URL('data/automation-coverage.json', root), 'utf8'));
  const revision = coverage.scope_revisions.find(r => r.date === '2026-09-13');
  const before = revision.before;
  const pct = (denominator) => (100 * before.ai_executes / denominator).toFixed(1);
  const expected = `従来スコープ（9月13日変更前）：実行${before.ai_executes}/${before.doing}＝${pct(before.doing)}%、総合${before.ai_executes}/${before.defined}＝${pct(before.defined)}%`;
  for (const page of ['index.html', 'autopilot/index.html']) {
    const html = fs.readFileSync(new URL(page, root), 'utf8');
    const spans = [...html.matchAll(/<span data-scope-before="2026-09-13">([^<]*)<\/span>/g)];
    assert.equal(spans.length, 1, `${page}: 変更前比較が一意に存在する`);
    assert.equal(spans[0][1], expected, `${page}: 変更前の数値を現行値へ置き換えない`);
  }
});
