import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiGscExport } from './ai-gsc-export.mjs';

const window = { periodStart: '2026-09-01', periodEnd: '2026-09-02' };
const exportCsv = () => ({
  'フィルタ.csv': 'フィルタ,値\n検索タイプ,ウェブ\n日付,過去 2 日間\n',
  'ページ.csv': '上位のページ,表示回数\nhttps://simplememofast.com/obsidian/pricing/,2\nhttps://simplememofast.com/obsidian/pricing,3\n',
  '平均読み込み時間のチャート.csv': '日付,表示回数\n2026-09-01,2\n2026-09-02,3\n',
  '国.csv': '国,表示回数\n日本,5\n',
  'デバイス.csv': 'デバイス,表示回数\nモバイル,5\n',
});

test('AI rows stay separate from WEB metrics and canonical page variants combine', () => {
  const buckets = parseAiGscExport(exportCsv(), window);
  assert.deepEqual(buckets['pages-aio'], [{ page: '/obsidian/pricing/', impressions: 5 }]);
  assert.deepEqual(buckets['dates-aio'].map(row => row.impressions), [2, 3]);
  assert.equal('clicks' in buckets['pages-aio'][0], false);
});

test('a different date window cannot be joined to a verified WEB snapshot', () => {
  const files = exportCsv();
  files['平均読み込み時間のチャート.csv'] = files['平均読み込み時間のチャート.csv']
    .replace('2026-09-02', '2026-09-03');
  assert.throws(() => parseAiGscExport(files, window), /dates do not match/);
});

test('suppressed and zero metrics, filters and other site origins fail closed', () => {
  const files = exportCsv();
  files['国.csv'] = '国,表示回数\n日本,~\n';
  assert.throws(() => parseAiGscExport(files, window), /Unavailable, zero or invalid/);
  files['国.csv'] = '国,表示回数\n日本,5\n米国,0\n';
  assert.throws(() => parseAiGscExport(files, window), /omitted zero row/);
  files['平均読み込み時間のチャート.csv'] = '日付,表示回数\n2026-09-01,5\n2026-09-02,0\n';
  assert.throws(() => parseAiGscExport(files, window), /CSV alone cannot prove a true zero/);
  files['平均読み込み時間のチャート.csv'] = exportCsv()['平均読み込み時間のチャート.csv'];
  files['国.csv'] = exportCsv()['国.csv'];
  files['フィルタ.csv'] += 'ページ,https://simplememofast.com/obsidian/\n';
  assert.throws(() => parseAiGscExport(files, window), /Unsupported AI export filter/);
  files['フィルタ.csv'] = exportCsv()['フィルタ.csv'];
  files['ページ.csv'] = files['ページ.csv'].replaceAll('simplememofast.com', 'example.com');
  assert.throws(() => parseAiGscExport(files, window), /Unexpected AI page origin/);
});
