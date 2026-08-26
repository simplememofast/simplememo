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
import os from 'node:os';
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

  // 0. **取得できなかったスナップショットを「きれい」と呼ばない。**
  //
  // [2026-08-26] dates / queries / pages がすべて空の写しは、重複も不整合も
  // 起こしようがないので **fatal 0 / warn 0 で「重複・内部不整合なし」を出していた。**
  // 冒頭に引いてある Runbook の規律——「取得できなかった」と「増えていない」を
  // 取り違えない——を、この検査自身が破っていた。
  //
  // 日次が0行なのは取得の失敗。期間があれば、クリック0の日にも行は立つ。
  // queries / pages が空なのは**報告のみ**にする（新規プロパティではありうる）。
  if (dates.length === 0) {
    out.fatal.push('dates.json が0行 — **取得が失敗した写しを「きれい」とは呼ばない。**'
      + 'クリック0の日にも行は立つので、期間があって0行なら取れていない');
  }
  for (const [name, rows] of [['queries', queries], ['pages', pages]]) {
    if (rows.length === 0) out.warn.push(`${name}.json が0行 — 新規なら正常だが、確かめること`);
  }

  // 0b. **判定を黙って消す meta の欠落。**
  // period_* が無ければ「日付の欠け」の判定が丸ごと消え、row_counts が無ければ
  // 「内部整合」の判定が丸ごと消える。どちらも消えたことは出力に出ない。
  for (const f of ['period_start', 'period_end']) {
    if (!meta[f]) {
      out.fatal.push(`meta.${f} が無い — **日付の欠けを判定できないまま緑になる**`);
    }
  }
  if (!meta.row_counts || typeof meta.row_counts !== 'object') {
    out.fatal.push('meta.row_counts が無い — **実データとの突き合わせが丸ごと消える**');
  } else {
    for (const name of ['dates', 'queries', 'pages']) {
      if (typeof meta.row_counts[name] !== 'number') {
        out.fatal.push(`meta.row_counts.${name} が数でない — その行数は突き合わせられない`);
      }
    }
  }

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

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
//
// 標本はディスクに書く。inspectSnapshot はディレクトリを読むので、
// **本番と同じ経路を通す**ため（読み取りだけ差し替えると、本番だけ壊れうる）。
if (process.argv.includes('--selftest')) {
  const tmpDirs = [];
  const BASE = () => ({
    meta: {
      label: 't', period_start: '2026-08-01', period_end: '2026-08-03',
      row_counts: { dates: 3, queries: 2, pages: 2 },
    },
    dates: [
      { date: '2026-08-01', clicks: 1 },
      { date: '2026-08-02', clicks: 1 },
      { date: '2026-08-03', clicks: 1 },
    ],
    queries: [{ query: 'a', clicks: 1 }, { query: 'b', clicks: 1 }],
    pages: [{ page: '/x', clicks: 1 }, { page: '/y', clicks: 1 }],
  });
  const write = (dir, doc) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const [k, v] of Object.entries(doc)) {
      if (v === undefined) continue;
      fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(v));
    }
    return dir;
  };
  const snap = (over = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-'));
    tmpDirs.push(root);
    return write(path.join(root, 'snap'), { ...BASE(), ...over });
  };
  /** inspectAll 用に <親>/<日付>/ の形で置く。 */
  const snapDir = (label, over = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-'));
    tmpDirs.push(root);
    write(path.join(root, label), { ...BASE(), ...over });
    return root;
  };
  const has = (list, needle) => list.some((x) => x.includes(needle));

  const SCENARIOS = [
    ['実データの写しが検査を通る', () => {
      const r = inspectAll();
      if (r.fatal.length) throw new Error(r.fatal[0]);
      if (!r.snapshots.length) throw new Error('写しが1件も読めていない');
    }],
    ['正しい写しでは何も言わない（常に鳴る検査も何も見ていない）', () => {
      const r = inspectSnapshot(snap(), 't');
      if (r.fatal.length || r.warn.length) throw new Error(JSON.stringify([r.fatal, r.warn]));
    }],
    ['**全部空の写しは落ちる**（取得できなかったを「きれい」と呼ばない）', () => {
      const r = inspectSnapshot(snap({ dates: [], queries: [], pages: [] }), 't');
      if (!has(r.fatal, 'dates.json が0行')) throw new Error(JSON.stringify(r.fatal));
    }],
    ['**period_start / period_end が無ければ落ちる**（欠けの判定が黙って消える）', () => {
      const meta = { label: 't', row_counts: { dates: 3, queries: 2, pages: 2 } };
      const r = inspectSnapshot(snap({ meta }), 't');
      if (!has(r.fatal, 'period_start')) throw new Error(JSON.stringify(r.fatal));
      if (!has(r.fatal, 'period_end')) throw new Error(JSON.stringify(r.fatal));
    }],
    ['**row_counts が無ければ落ちる**（内部整合の判定が丸ごと消える）', () => {
      const meta = { label: 't', period_start: '2026-08-01', period_end: '2026-08-03' };
      const r = inspectSnapshot(snap({ meta }), 't');
      if (!has(r.fatal, 'row_counts が無い')) throw new Error(JSON.stringify(r.fatal));
    }],
    ['**重複キーは落ちる**（同じキーが2行あるとクリックが二重に乗る）', () => {
      const dates = [
        { date: '2026-08-01', clicks: 1 },
        { date: '2026-08-01', clicks: 1 },
        { date: '2026-08-03', clicks: 1 },
      ];
      const r = inspectSnapshot(snap({ dates }), 't');
      if (!has(r.fatal, '重複キー')) throw new Error(JSON.stringify(r.fatal));
    }],
    ['**row_counts と実データがずれたら落ちる**（どちらが正か分からなくなる）', () => {
      const meta = { ...BASE().meta, row_counts: { dates: 99, queries: 2, pages: 2 } };
      const r = inspectSnapshot(snap({ meta }), 't');
      if (!has(r.fatal, 'row_counts.dates=99')) throw new Error(JSON.stringify(r.fatal));
    }],
    ['**queries の合計が dates を超えたら落ちる**（原理的に超えない）', () => {
      const queries = [{ query: 'a', clicks: 100 }, { query: 'b', clicks: 100 }];
      const r = inspectSnapshot(snap({ queries }), 't');
      if (!has(r.fatal, '超えている')) throw new Error(JSON.stringify(r.fatal));
    }],
    ['**日付の欠けは報告のみ**（元データ側の遅れで無関係な出荷を止めない）', () => {
      const meta = { ...BASE().meta, row_counts: { dates: 2, queries: 2, pages: 2 } };
      const dates = [{ date: '2026-08-01', clicks: 1 }, { date: '2026-08-03', clicks: 1 }];
      const r = inspectSnapshot(snap({ meta, dates }), 't');
      if (r.fatal.length) throw new Error(`落とした: ${r.fatal[0]}`);
      if (!has(r.warn, '日付の欠け')) throw new Error(JSON.stringify(r.warn));
    }],
    ['queries / pages が空は報告のみ（新規プロパティではありうる）', () => {
      const meta = { ...BASE().meta, row_counts: { dates: 3, queries: 0, pages: 2 } };
      const r = inspectSnapshot(snap({ meta, queries: [] }), 't');
      if (r.fatal.length) throw new Error(`落とした: ${r.fatal[0]}`);
      if (!has(r.warn, 'queries.json が0行')) throw new Error(JSON.stringify(r.warn));
    }],
    ['必要なファイルが無ければ落ちる', () => {
      const r = inspectSnapshot(snap({ pages: undefined }), 't');
      if (!has(r.fatal, 'pages.json が無い')) throw new Error(JSON.stringify(r.fatal));
    }],
    ['**鮮度落ちは報告のみ**（取得できなかったと増えていないを取り違えない）', () => {
      const r = inspectAll(snapDir('2026-08-01'), '2026-12-31');
      if (r.fatal.length) throw new Error(`落とした: ${r.fatal[0]}`);
      if (!has(r.warn, '最新スナップショット')) throw new Error(JSON.stringify(r.warn));
    }],
    ['新しい写しでは鮮度の報告が出ない', () => {
      const r = inspectAll(snapDir('2026-08-25'), '2026-08-26');
      if (has(r.warn, '最新スナップショット')) throw new Error('新しいのに遅延と報告した');
    }],
    ['**写しが1件も無ければ落ちる**', () => {
      const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-'));
      tmpDirs.push(empty);
      const r = inspectAll(empty, '2026-08-26');
      if (!has(r.fatal, '1件も無い')) throw new Error(JSON.stringify(r.fatal));
    }],
  ];

  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
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
