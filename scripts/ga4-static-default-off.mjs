#!/usr/bin/env node
// 静的な HTML から GA4 を外し、目印に変える（--write）。外れていることを確かめる（--check）。
//
//   node scripts/ga4-static-default-off.mjs --check   # 0 = 問題なし / 1 = 問題あり
//   node scripts/ga4-static-default-off.mjs --write   # 動くローダーを目印へ（冪等）
//
// 2026-11-17 から、GA4 は静的既定オフ（functions/lib/ga-geo.js の冒頭）。静的な HTML に
// GA4 があると、Functions を通らない経路（fail open など）で、EEA・英国・スイスの訪問者にも
// GA4 が出る。新しいページを古いページから写したときなどに、動くローダーが戻りうる。
// 検査は SEO Validation の scripts/ga4-consent-region.test.mjs でも走る。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { staticProblems, toStaticMarkers } from './lib/ga4-static.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
if (!write && !process.argv.includes('--check')) {
  console.error('usage: node scripts/ga4-static-default-off.mjs --check | --write');
  process.exit(2);
}

const files = execFileSync('git', ['ls-files', '-z', '*.html', '*.htm'], { cwd: ROOT })
  .toString('utf8').split('\0').filter(Boolean);
let changed = 0;
const problems = [];
for (const file of files) {
  const full = path.join(ROOT, file);
  const before = fs.readFileSync(full, 'utf8');
  const after = write ? toStaticMarkers(before) : before;
  if (after !== before) {
    fs.writeFileSync(full, after);
    changed += 1;
  }
  for (const problem of staticProblems(after)) problems.push(`${file}: ${problem}`);
}
if (write) console.log(`${changed} file(s) rewritten to GA4 markers`);
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s) in ${files.length} HTML files. Static HTML must not load GA4 (functions/lib/ga-geo.js).`);
  process.exit(1);
}
console.log(`OK: ${files.length} HTML files carry no GA4 outside markers`);
