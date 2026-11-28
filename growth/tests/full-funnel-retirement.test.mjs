import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const growth = fileURLToPath(new URL('..', import.meta.url));

function monthlyReport(t, month, manual) {
  const root = mkdtempSync(path.join(tmpdir(), 'simplememo-monthly-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ['scripts/full-funnel.mjs', 'lib/gsc.mjs', 'lib/cli.mjs']) {
    const target = path.join(root, 'growth', file);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(growth, file), target);
  }
  if (manual) {
    const dir = path.join(root, 'growth/data/funnel-manual');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, month + '.json'), JSON.stringify(manual));
  }
  return execFileSync(process.execPath, [path.join(root, 'growth/scripts/full-funnel.mjs'), '--month', month],
    { cwd: root, encoding: 'utf8', env: { ...process.env, GROWTH_GSC_DIR: path.join(root, 'gsc') } });
}

test('keeps a saved pre-retirement observation separate from an unrecorded historical month', (t) => {
  assert.match(monthlyReport(t, '2026-10', { activation_rate: 0.25, funnel_window: 'historical' }),
    /旧台帳の活性.*25\.0%.*historical.*過去値/);
  assert.match(monthlyReport(t, '2026-09'), /旧台帳の活性.*\| — \| — \|.*過去値/);
});

test('ignores a stale value for the transition month while retaining Apple aggregates', (t) => {
  const report = monthlyReport(t, '2026-11', { activation_rate: 1, funnel_window: 'obsolete', asc_installs: 3, d1_retention: 0 });
  assert.match(report, /活性（24h内 送信到達） \| 評価不能.*転記対象外/);
  assert.doesNotMatch(report, /100\.0%|obsolete|analytics:funnel|要正史差し替え/);
  assert.match(report, /ASC 初回ダウンロード \| 3 \|/);
  assert.match(report, /D1継続 \| 0\.0% \|/);
});

test('later missing month asks only for GA4 and Apple aggregates', (t) => {
  const report = monthlyReport(t, '2026-12');
  assert.match(report, /評価不能.*転記対象外/);
  assert.match(report, /GA4・ASCの転記先/);
  assert.doesNotMatch(report, /analytics:funnel|要正史差し替え/);
});
