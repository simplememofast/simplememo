#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'data', 'benchmark.json');
const out = path.join(root, 'data', 'benchmark-2026.csv');
const check = process.argv.includes('--check');
const data = JSON.parse(fs.readFileSync(src, 'utf8'));

const quote = (value) => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const requireOwn = (object, key, label) => {
  if (!Object.hasOwn(object, key)) {
    throw new Error(`benchmark source is missing ${label}.${key}`);
  }
};

for (const key of ['date', 'device', 'os', 'ourAppVersion']) {
  requireOwn(data.measuredOn, key, 'measuredOn');
}
requireOwn(data, 'methodologyPage', 'benchmark');
requireOwn(data.columns, 'ready', 'columns');

const header = [
  'app', 'ready_seconds', 'focus_seconds', 'ready_min_seconds',
  'ready_max_seconds', 'runs', 'aggregation_note', 'measured_date',
  'device', 'os', 'our_app_version', 'metric_definition', 'methodology_url',
];
const rows = [header];
for (const [app, v] of Object.entries(data.apps)) {
  for (const key of ['ready', 'focus', 'n']) requireOwn(v, key, app);
  if (!Array.isArray(v.ready_range) || v.ready_range.length !== 2) {
    throw new Error(`benchmark source has invalid ${app}.ready_range`);
  }
  rows.push([
    app,
    v.ready,
    v.focus,
    v.ready_range?.[0] ?? '',
    v.ready_range?.[1] ?? '',
    v.n,
    v.ready_basis ?? v.range_note ?? 'median unless otherwise noted',
    data.measuredOn.date,
    data.measuredOn.device,
    data.measuredOn.os,
    data.measuredOn.ourAppVersion,
    data.columns.ready,
    `https://simplememofast.com${data.methodologyPage}`,
  ]);
}
const csv = rows.map(row => row.map(quote).join(',')).join('\n') + '\n';

if (check) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (current !== csv) {
    console.error('data/benchmark-2026.csv is stale. Run: node scripts/export-benchmark-csv.mjs');
    process.exit(1);
  }
  console.log('benchmark CSV matches data/benchmark.json');
} else {
  fs.writeFileSync(out, csv);
  console.log(`wrote ${path.relative(root, out)}`);
}
