#!/usr/bin/env node
/**
 * The monthly one-pager: the whole funnel as ten numbers in one column.
 *
 *   node growth/scripts/full-funnel.mjs                  # current month, print
 *   node growth/scripts/full-funnel.mjs --month 2026-08  # specific month
 *   node growth/scripts/full-funnel.mjs --write          # also save growth/reports/YYYY-MM-full-funnel.md
 *
 * v4 (GROWTH_ROI_PLAN_2026-08-20.md §1 / R12-2) assembled the chain
 * GSC表示 → クリック → セッション → app_store_click → ASC閲覧 → install →
 * 活性 → D1 → サブスク開始 → MRR by hand once. This template keeps that
 * one-pager reproducible monthly without building any new pipeline:
 *
 *   - GSC rows fill themselves from the ingested snapshot (ingest-gsc /
 *     ingest-bigquery — whatever is already on file).
 *   - GA4 and ASC rows are hand-transcribed into
 *     growth/data/funnel-manual/YYYY-MM.json (README there). Neither GA4 nor
 *     App Store Connect has an export pipeline into this repo, and pretending
 *     otherwise would just render confident-looking zeros.
 *
 * The report renders with everything missing — an empty skeleton that names
 * what is owed is the reminder mechanism, same as weekly-report.mjs.
 *
 * Annotations (growth/data/annotations.json) for the month are appended so a
 * spike in any series can be matched against PR sends and app releases
 * without re-deriving the timeline every time (v4 R12-3; the 8/18 spike cost
 * half a day to attribute for want of exactly this file).
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, listSnapshots, loadSnapshot } from '../lib/gsc.mjs';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const write = argv.includes('--write');
const month = flag('month', new Date().toISOString().slice(0, 7));
if (!/^\d{4}-\d{2}$/.test(month)) {
  console.error(`--month must be YYYY-MM (got ${month})`);
  process.exit(2);
}

const out = [];
const p = (s = '') => out.push(s);
const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString() : String(v));
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

/* ── GSC: the snapshot whose window ends inside the month, else the latest ── */
let snap = null;
let snapNote = '';
const labels = listSnapshots();
for (const label of labels) {
  const s = loadSnapshot(label);
  if (s?.meta?.period_end?.startsWith(month)) snap = s; // last match wins (labels sort ascending)
}
if (!snap && labels.length) {
  snap = loadSnapshot(labels[labels.length - 1]);
  snapNote = `※ ${month} 中に終わるスナップショットが無いため最新（${snap.label}）で代用。窓のズレに注意`;
}

/* ── manual transcriptions ── */
const manualPath = path.join(ROOT, `growth/data/funnel-manual/${month}.json`);
let manual = null;
try { manual = JSON.parse(fs.readFileSync(manualPath, 'utf8')); } catch { /* not transcribed yet */ }
const m = (k) => manual?.[k] ?? null;

/* ── annotations for the month ── */
let annos = [];
try {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/data/annotations.json'), 'utf8'));
  const TYPES = new Set(['pr', 'app_release', 'feature']);
  for (const x of a.annotations || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date) || !TYPES.has(x.type)) {
      console.error(`annotations.json: malformed entry ${JSON.stringify(x.date)} / ${JSON.stringify(x.type)}`);
      process.exit(1); // a malformed annotation would silently vanish from every future report
    }
  }
  annos = (a.annotations || []).filter((x) => x.date.startsWith(month));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

p(`# Full Funnel — ${month}`);
p();
p('検索表示からMRRまでを1列で読む月次1枚（v4 §1 の鎖の定型化）。');
p('自動で埋まるのはGSC行だけ。GA4行とASC行・ファネル行は手動転記で、未転記の月は — のまま出る。');
p();
p('| # | 段 | 値 | 窓 | 出典 |');
p('|--:|---|---:|---|---|');
const gscWin = snap ? `${snap.meta.period_start}..${snap.meta.period_end}` : '—';
p(`| 1 | GSC表示 | ${snap ? fmt(Math.round(snap.meta.totals.impressions)) : '—'} | ${gscWin} | 自動（snapshot \`${snap?.label ?? 'なし'}\`） |`);
p(`| 2 | GSCクリック | ${snap ? fmt(Math.round(snap.meta.totals.clicks)) : '—'} | ${gscWin} | 自動（同上） |`);
p(`| 3 | GA4セッション | ${fmt(m('ga4_sessions'))} | ${fmt(m('ga4_window'))} | 手動（GA4探索 → funnel-manual/${month}.json） |`);
p(`| 4 | app_store_click | ${fmt(m('ga4_app_store_click'))} | ${fmt(m('ga4_window'))} | 手動（同上） |`);
p(`| 5 | ASC プロダクトページ閲覧 | ${fmt(m('asc_ppv'))} | ${fmt(m('asc_window'))} | 手動（ASC App Analytics） |`);
p(`| 6 | 初回install | ${fmt(m('asc_installs'))} | ${fmt(m('asc_window'))} | 手動（同上） |`);
p(`| 7 | 活性（24h内 送信到達） | ${m('activation_rate') != null ? pct(m('activation_rate')) : '—'} | ${fmt(m('funnel_window'))} | 手動（analytics:funnel 正史・内部除外あり） |`);
p(`| 8 | D1継続 | ${m('d1_retention') != null ? pct(m('d1_retention')) : '—'} | ${fmt(m('asc_window'))} | 手動（ASCベンチマーク画面） |`);
p(`| 9 | サブスク開始 | ${fmt(m('subs_started'))} | ${fmt(m('asc_window'))} | 手動（ASCサブスクリプション） |`);
p(`| 10 | MRR | ${m('mrr_usd') != null ? `$${fmt(m('mrr_usd'))}` : '—'} | ${fmt(m('asc_window'))} | 手動（同上） |`);
p();
if (snapNote) { p(snapNote); p(); }
if (!manual) {
  p(`手動行の転記先: \`growth/data/funnel-manual/${month}.json\`（書式は同ディレクトリのREADME）。`);
  p();
}
p('_参照基準（v4 §1・2026-08-20時点）: 表示82.5千/3M → クリック1,764 → セッション1,912/30日 → app_store_click 87 → PPV 9,330/90日 → install 2,250/90日 → 活性58%（生値・要正史差し替え） → D1 40.28% → 開始57/90日 → MRR $102。_');
p();

p('## この月のアノテーション（PR配信・アプリリリース・機能出荷）');
p();
if (!annos.length) {
  p('登録なし。配信・リリースがあった月に growth/data/annotations.json へ追記する（date / type: pr|app_release|feature / label / note）。');
} else {
  p('| 日付 | 種別 | 内容 |');
  p('|---|---|---|');
  for (const a of annos) p(`| ${a.date} | ${a.type} | ${a.label}${a.note ? `（注: ${a.note}）` : ''} |`);
}
p();
p(`_Generated by \`growth/scripts/full-funnel.mjs --month ${month}\`_`);

const text = out.join('\n') + '\n';
console.log(text);
if (write) {
  const dir = path.join(ROOT, 'growth/reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${month}-full-funnel.md`);
  fs.writeFileSync(file, text);
  console.error(`written: growth/reports/${path.basename(file)}`);
}
