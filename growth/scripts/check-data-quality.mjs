#!/usr/bin/env node
/**
 * 取り込んだデータの欠損・遅延・重複を検査する。
 *
 *   node growth/scripts/check-data-quality.mjs           # 表示
 *   node growth/scripts/check-data-quality.mjs --check    # CI: 壊れていたら exit 1
 *
 * 【なぜ鮮度だけでは足りないか】
 * これまで見ていたのは bq-preflight.mjs の鮮度（いつのデータか）だけだった。
 * だが実際に判断を狂わせるのは、**古いデータではなく静かに欠けたデータ**である。
 *   - 日付が飛んでいるのに合計だけ出す → 「先週より減った」が欠測のせいになる
 *   - 同じクエリが2行ある            → クリック数が二重に乗る
 *   - meta の row_counts と実データがずれる → どちらが正か分からなくなる
 *
 * **「取得できなかった」と「増えていない」を取り違えない**という Runbook の
 * 規律を、スナップショットの中身に対しても機械が守る。
 *
 * 【落とす／落とさない】
 * 重複・内部不整合は**落とす**（数字が黙って嘘になる）。
 * 日付の欠けと鮮度落ちは**報告のみ**（GSCは元データ側が遅れることがあり、
 * こちらの落ち度ではない日にCIを止めると、無関係な出荷まで巻き込む）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GSC_DIR = path.join(ROOT, 'growth/data/gsc');
/** これを超えて新しいスナップショットが無ければ「遅延」。 */
export const STALE_DAYS = 21;

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export function inspectSnapshot(dir, label) {
  const out = { label, fatal: [], warn: [], stats: {} };
  const need = ['meta.json', 'dates.json', 'queries.json', 'pages.json'];
  for (const f of need) {
    if (!fs.existsSync(path.join(dir, f))) out.fatal.push(`${f} が無い`);
  }
  if (out.fatal.length) return out;

  const meta = readJson(path.join(dir, 'meta.json'));
  const dates = readJson(path.join(dir, 'dates.json'));
  const queries = readJson(path.join(dir, 'queries.json'));
  const pages = readJson(path.join(dir, 'pages.json'));
  out.stats = { dates: dates.length, queries: queries.length, pages: pages.length };

  // 1. 重複。**同じキーが2行あるとクリックが二重に乗る。**
  for (const [name, rows, key] of [['dates', dates, 'date'], ['queries', queries, 'query'], ['pages', pages, 'page']]) {
    const seen = new Set(), dup = new Set();
    for (const r of rows) {
      const k = r?.[key];
      if (k === undefined) { out.fatal.push(`${name}: ${key} が無い行がある`); continue; }
      if (seen.has(k)) dup.add(k); else seen.add(k);
    }
    if (dup.size) out.fatal.push(`${name}: 重複キー ${dup.size} 件（例: ${[...dup].slice(0, 3).join(', ')}）`);
  }

  // 2. 日付の欠け。period_start〜period_end のうち dates.json に無い日。
  if (meta.period_start && meta.period_end) {
    const have = new Set(dates.map((d) => d.date));
    const missing = [];
    for (let i = 0; i <= dayDiff(meta.period_start, meta.period_end); i++) {
      const d = new Date(meta.period_start);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      if (!have.has(key)) missing.push(key);
    }
    out.stats.missing_days = missing.length;
    if (missing.length) {
      out.warn.push(`日付の欠け ${missing.length} 日（例: ${missing.slice(0, 3).join(', ')}）`
        + ' — 合計だけ見ると「減った」に見える');
    }
  }

  // 3. 内部整合。meta.row_counts と実データ、dates合計とqueries合計。
  const rc = meta.row_counts || {};
  for (const [name, rows] of [['dates', dates], ['queries', queries], ['pages', pages]]) {
    if (typeof rc[name] === 'number' && rc[name] !== rows.length) {
      out.fatal.push(`meta.row_counts.${name}=${rc[name]} が実データ ${rows.length} 行と違う`);
    }
  }
  const clicksOf = (rows) => rows.reduce((a, r) => a + (r.clicks || 0), 0);
  const byDate = clicksOf(dates), byQuery = clicksOf(queries);
  out.stats.clicks_by_date = byDate;
  out.stats.clicks_by_query = byQuery;
  // クエリ側は上位1000行までなので、日付側を超えることは無い。超えたら壊れている。
  if (byQuery > byDate) {
    out.fatal.push(`queries のクリック合計 ${byQuery} が dates の ${byDate} を超えている`
      + '（クエリ側は上位n件の切り出しなので、原理的に超えない）');
  }
  return out;
}

export function inspectAll(dir = GSC_DIR, today = new Date().toISOString().slice(0, 10)) {
  if (!fs.existsSync(dir)) return { snapshots: [], fatal: [`${dir} が無い`], warn: [] };
  const labels = fs.readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const snapshots = labels.map((l) => inspectSnapshot(path.join(dir, l), l));
  const fatal = snapshots.flatMap((s) => s.fatal.map((m) => `${s.label}: ${m}`));
  const warn = snapshots.flatMap((s) => s.warn.map((m) => `${s.label}: ${m}`));
  if (!labels.length) fatal.push('スナップショットが1件も無い');
  else {
    const age = dayDiff(labels[labels.length - 1], today);
    if (age > STALE_DAYS) {
      warn.push(`最新スナップショットが ${age} 日前（${labels[labels.length - 1]}）`
        + ` — ${STALE_DAYS} 日を超えている。**「取得できなかった」と「増えていない」を取り違えない**`);
    }
  }
  return { snapshots, fatal, warn };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = inspectAll();
  console.log(`データ品質 — GSCスナップショット ${r.snapshots.length} 件\n`);
  for (const s of r.snapshots) {
    console.log(`  ${s.label}  dates ${s.stats.dates ?? '?'} / queries ${s.stats.queries ?? '?'}`
      + ` / pages ${s.stats.pages ?? '?'}`
      + (s.stats.missing_days ? `  欠け ${s.stats.missing_days} 日` : ''));
  }
  if (r.warn.length) {
    console.log('\n  報告（落とさない）:');
    for (const w of r.warn) console.log(`    - ${w}`);
  }
  if (r.fatal.length) {
    console.error('\nデータ品質: 数字が黙って嘘になる不整合');
    for (const f of r.fatal) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\n  重複・内部不整合なし。');
  if (process.argv.includes('--check')) console.log('  （欠けと鮮度は報告のみ。元データ側の遅れで無関係な出荷を止めないため）');
}
