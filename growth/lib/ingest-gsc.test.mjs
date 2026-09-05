import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseGscExport, classifyGscColumns } from './csv.mjs';
import { buildMeta, emptyBuckets, writeSnapshot } from './snapshot.mjs';

test('every impressions-only AI dimension stays separate; zero-activity days remain visible', () => {
  for (const [header, kind] of [['Top pages', 'pages'], ['Date', 'dates'], ['Country', 'countries'], ['Device', 'devices']]) {
    const parsed = parseGscExport(`${header},Impressions\nx,12\n`);
    assert.equal(classifyGscColumns(parsed.columns), `${kind}-aio`);
    assert.equal(parsed.rows[0].clicks, undefined);
  }
  assert.equal(parseGscExport('Date,Clicks,Impressions\n2026-09-01,0,0\n').rows.length, 1);
  assert.equal(parseGscExport('Date\tClicks\tImpressions\n2026-09-01\t12\t1,234\n').rows[0].impressions, 1234);
});

test('AI share needs property totals over exactly the same dates', () => {
  const buckets = emptyBuckets();
  buckets.dates = [{ date: '2026-09-01', clicks: 2, impressions: 100 }];
  buckets.pages = [{ page: '/', clicks: 2, impressions: 110, position: 5 }];
  buckets['pages-aio'] = [{ page: '/', impressions: 25 }];
  const meta = () => buildMeta({ label: '2026-09-02', period: '2026-09-01..2026-09-01', buckets });
  assert.equal(meta().aio.aggregation, 'page');
  assert.equal(meta().aio.impression_share, null);
  buckets['dates-aio'] = [{ date: '2026-09-01', impressions: 20 }];
  assert.equal(meta().aio.impressions, 20);
  assert.equal(meta().aio.page_impressions, 25);
  assert.equal(meta().aio.impression_share, 0.2);
  buckets['dates-aio'][0].date = '2026-08-31';
  assert.equal(meta().aio.impression_share, null);
  buckets['dates-aio'][0].impressions = null;
  assert.equal(meta().aio.impressions, null);
});

test('real CLI ingests WEB and AI exports without poisoning WEB dates or totals', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-gsc-'));
  try {
    fs.mkdirSync(path.join(dir, 'web')); fs.mkdirSync(path.join(dir, 'ai'));
    fs.writeFileSync(path.join(dir, 'web', 'Dates.csv'), 'Date,Clicks,Impressions,Position\n2026-09-01,2,100,5\n2026-09-02,0,0,0\n');
    fs.writeFileSync(path.join(dir, 'ai', 'Dates.csv'), 'Date,Impressions\n2026-09-01,20\n2026-09-02,0\n');
    fs.writeFileSync(path.join(dir, 'ai', 'Devices.csv'), 'Device,Impressions\nMOBILE,20\n');
    const cli = new URL('../scripts/ingest-gsc.mjs', import.meta.url);
    const args = [cli.pathname, '--dir', dir, '--label', '2026-09-03', '--dry-run'];
    const run = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const meta = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
    assert.equal(meta.totals.impressions, 100);
    assert.equal(meta.totals.clicks, 2);
    assert.equal(meta.row_counts.dates, 2);
    assert.equal(meta.row_counts['dates-aio'], 2);
    assert.equal(meta.row_counts.devices, 0);
    assert.equal(meta.aio.impression_share, 0.2);
    assert.equal(meta.complete_window, true);
    fs.writeFileSync(path.join(dir, 'web', 'Filters.csv'), 'Filter,Value\nCountry,Japan\n');
    const filtered = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.notEqual(filtered.status, 0);
    assert.match(filtered.stderr, /Unsupported GSC filter Country/);
    fs.unlinkSync(path.join(dir, 'web', 'Filters.csv'));
    fs.copyFileSync(path.join(dir, 'web', 'Dates.csv'), path.join(dir, 'duplicate.csv'));
    const duplicate = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /Duplicate dates exports/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('overwriting a snapshot removes an old AI file when the new source has no AI rows', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-snapshot-'));
  try {
    const buckets = emptyBuckets(); buckets['pages-aio'] = [{ page: '/', impressions: 12 }];
    writeSnapshot({ label: '2026-09-03', buckets, meta: {}, dir });
    writeSnapshot({ label: '2026-09-03', buckets: emptyBuckets(), meta: {}, dir });
    assert.equal(fs.existsSync(path.join(dir, '2026-09-03/pages-aio.json')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
