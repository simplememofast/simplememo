#!/usr/bin/env node
/**
 * The one file a human reads each week.
 *
 *   node growth/scripts/weekly-report.mjs            # print
 *   node growth/scripts/weekly-report.mjs --write    # also save under growth/reports/
 *
 * Ordered by what it costs to ignore, not by what is easiest to measure:
 * decisions that are already late come first, then paid-relevant work, then
 * pure-SEO wins, then everything else. Section order is the prioritisation —
 * a reader who stops a third of the way down should still have done the
 * highest-value thing available to them that week.
 *
 * Runs with no GSC snapshot present. It degrades to the experiment sections and
 * says plainly what is missing, because "the data is not loaded" must never be
 * the reason a week passes with no decision made.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, latestSnapshot, previousSnapshot, listSnapshots,
  expectedCtr, positionOpportunity, businessRelevance, curveFor, segmentOfPath,
} from '../lib/gsc.mjs';
import { loadLedger, summarize, daysOverdue, today } from '../lib/ledger.mjs';

const write = process.argv.includes('--write');
const asOf = today();
const out = [];
const p = (s = '') => out.push(s);

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1));

const snap = latestSnapshot();
const prev = snap ? previousSnapshot(snap.label) : null;
const ledger = loadLedger();
const { due, overdue, byStatus, total } = summarize(ledger, asOf);

p(`# Weekly Growth Report — ${asOf}`);
p();
p(`Snapshot: ${snap ? `\`${snap.label}\`` : '**none ingested**'}` +
  (prev ? ` · compared to \`${prev.label}\`` : ' · no comparison snapshot yet'));
p();

/* ── Decisions owed ─────────────────────────────────────────────────────
 * First, always. An overdue decision blocks the pages it covers from any
 * further change, so it silently caps how much else can be done this week. */
p('## Decisions owed');
p();
if (!due.length) {
  p('None. No experiment is past its evaluation date.');
} else {
  p(`**${due.length} experiment(s)** past their evaluation date` +
    (overdue.length ? ` — the oldest by ${Math.max(...overdue.map((e) => daysOverdue(e, asOf)))} days` : '') + '.');
  p();
  p('| Days late | Experiment | Page | Type |');
  p('|---:|---|---|---|');
  for (const e of due.sort((a, b) => daysOverdue(b, asOf) - daysOverdue(a, asOf))) {
    p(`| ${daysOverdue(e, asOf)} | \`${e.id}\` | \`${e.page}\` | ${e.type} |`);
  }
  p();
  p('These pages stay frozen until a decision is recorded — do not stack a new change on top.');
  p();
  p('```sh');
  p('node growth/scripts/experiments.mjs due');
  p('node growth/scripts/experiments.mjs evaluate <id> --decision keep|revert|iterate|inconclusive');
  p('```');
}
p();

/* ── SEO performance ──────────────────────────────────────────────────── */
p('## SEO');
p();
if (!snap) {
  p('No GSC snapshot has been ingested, so nothing here can be computed.');
  p();
  p('Fix (about 5 minutes, once a week): **[growth/GSC_OWNER_ACTION.md](../GSC_OWNER_ACTION.md)**');
} else {
  const t = snap.meta.totals;
  p('| Metric | Now |' + (prev ? ' Previous | Δ |' : ''));
  p('|---|---:|' + (prev ? '---:|---:|' : ''));
  const row = (name, cur, before, fmt = String) => {
    if (!prev) return p(`| ${name} | ${fmt(cur)} |`);
    const d = cur != null && before != null ? cur - before : null;
    const sign = d == null ? '—' : `${d >= 0 ? '+' : ''}${fmt(d)}`;
    p(`| ${name} | ${fmt(cur)} | ${fmt(before)} | ${sign} |`);
  };
  row('Clicks', t.clicks, prev?.meta.totals.clicks, (v) => Math.round(v).toLocaleString());
  row('Impressions', t.impressions, prev?.meta.totals.impressions, (v) => Math.round(v).toLocaleString());
  row('CTR', t.ctr, prev?.meta.totals.ctr, pct);
}
p();

/* ── Opportunities, split by whether they can plausibly produce an install ──
 * The split is the point. A single ranked list buries install-adjacent work
 * under whichever cluster happens to have the most impressions, which is how
 * effort drifts toward traffic that was never going to convert. */
if (snap) {
  // Per-language expectations: English pages on this site click at roughly a
  // third the rate of Japanese ones at the same position, so a single curve
  // ranks them as opportunities purely for being English.
  const curveOf = (r) => curveFor(snap.meta, segmentOfPath(r.page));
  // Impression floor. Without it the ranking surfaces pages with a handful of
  // impressions: a 7-impression page at 0% CTR scores a "+1 click upside" that
  // is really just rounding, and it pushes genuine work off the table. 100 is
  // roughly where a 28-day CTR figure starts meaning anything.
  const MIN_IMPRESSIONS = 100;
  const scored = snap.pages
    .filter((r) => r.page && r.impressions >= MIN_IMPRESSIONS)
    .map((r) => {
      const exp = expectedCtr(curveOf(r), r.position);
      const gap = Math.max(0, (exp ?? 0) - (r.ctr ?? 0));
      const rel = businessRelevance(r.page);
      return { ...r, exp, gap, rel,
               upside: r.impressions * gap,
               score: r.impressions * positionOpportunity(r.position) * gap * rel };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const table = (rows) => {
    p('| Page | Imp | CTR → expected | Pos | Upside |');
    p('|---|---:|---|---:|---:|');
    for (const r of rows) {
      p(`| \`${r.page}\` | ${r.impressions.toLocaleString()} | ${pct(r.ctr)} → ${pct(r.exp)} | ${n1(r.position)} | +${Math.round(r.upside)} |`);
    }
  };

  const paid = scored.filter((r) => r.rel >= 0.7).slice(0, 10);
  p('## Paid-relevant opportunities');
  p();
  p('_Pages whose readers are plausibly close to installing (business relevance ≥ 0.7). Work these first._');
  p();
  paid.length ? table(paid) : p('None scoring above zero this period.');
  p();

  const lowRel = scored.filter((r) => r.rel < 0.7).slice(0, 10);
  p('## Low-relevance SEO quick wins');
  p();
  p('_Real click upside, weak install intent. Worth taking cheaply; not worth a large build._');
  p();
  lowRel.length ? table(lowRel) : p('None scoring above zero this period.');
  p();

  if (prev) {
    const before = new Map(prev.pages.map((r) => [r.page, r]));
    const declining = snap.pages
      .map((r) => ({ r, b: before.get(r.page) }))
      .filter(({ r, b }) => b && b.clicks && (r.clicks || 0) - b.clicks <= -3)
      .sort((a, b) => ((a.r.clicks || 0) - a.b.clicks) - ((b.r.clicks || 0) - b.b.clicks))
      .slice(0, 10);
    p('## Declining pages');
    p();
    if (!declining.length) p('No page lost 3+ clicks since the previous snapshot.');
    else {
      p('| Page | Clicks | Δ | Δ position |');
      p('|---|---|---:|---:|');
      for (const { r, b } of declining) {
        p(`| \`${r.page}\` | ${b.clicks} → ${r.clicks || 0} | ${(r.clicks || 0) - b.clicks} | ${n1((r.position ?? 0) - (b.position ?? 0))} |`);
      }
    }
    p();
  }
}

/* ── CPP performance (App Store Connect side) ───────────────────────────
 * The install numbers live in ASC, which has no export API this repo can
 * reach, so the values are transcribed by hand into
 * growth/data/appstore/cpp-weekly.json (see the README there). The table
 * still renders without it — an empty skeleton that names every wired CPP is
 * what reminds the reader the transcription is owed. v4 R1: the point of the
 * ppid wiring is exactly this table. */
p('## CPP別 閲覧数 / DL / CVR（ASC手動転記）');
p();
{
  let cppMap = null;
  let cppData = null;
  try { cppMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cpp-map.json'), 'utf8')); } catch { /* map absent */ }
  try { cppData = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/data/appstore/cpp-weekly.json'), 'utf8')); } catch { /* not transcribed yet */ }
  if (!cppMap) {
    p('data/cpp-map.json が読めない — CPP配線の台帳が無いのでこの表は出せない。');
  } else {
    p(cppData
      ? `_窓: ${cppData.window ?? '未記載'} · 出典: ASC App Analytics（手動転記）_`
      : '_値が未転記。ASC → App Analytics → カスタムプロダクトページ の 閲覧数/DL を growth/data/appstore/cpp-weekly.json に転記すると埋まる（値はGA4からは取れない）。_');
    p();
    p('| CPP | ppid | 対象 | 閲覧数 | DL | CVR |');
    p('|---|---|---|---:|---:|---:|');
    const rowOf = (id) => cppData?.rows?.find((r) => r.id === id);
    const cvr = (r) => (r && r.views > 0 && r.downloads != null ? pct(r.downloads / r.views) : '—');
    // The default product page is the control group every CPP is judged
    // against (baseline CVR 2.45% over the 90d to 2026-08-18).
    const def = rowOf('(default)');
    p(`| （デフォルト商品ページ） | — | 対応表外の全ページ | ${def?.views ?? '—'} | ${def?.downloads ?? '—'} | ${cvr(def)} |`);
    for (const c of cppMap.cpps) {
      const r = rowOf(c.id);
      p(`| ${c.id} | ${c.ppid ? '✅' : 'TODO'} | \`${c.match.join('` `')}\` | ${r?.views ?? '—'} | ${r?.downloads ?? '—'} | ${cvr(r)} |`);
    }
    const todo = cppMap.cpps.filter((c) => !c.ppid).length;
    if (todo) {
      p();
      p(`${todo} CPP(s) はppid未記入（オーナー入力待ち）。記入 → \`node scripts/apply-cpp-ppid.js --write\` で配線される。`);
    }
  }
}
p();

/* ── AI-mediated traffic (GA4 side) ─────────────────────────────────────
 * The densest channel on the site (75.9s average engagement — longest of any
 * channel, v4 §2-5) and the only one nobody was measuring end-to-end: whether
 * AI-referred sessions ever click through to the App Store. GA4 has no export
 * pipeline into this repo, so the numbers are transcribed by hand from a GA4
 * exploration into growth/data/ga4/ai-channel.json (README there). Rows are a
 * fixed roster: the ai-assistant channel plus the five AI referral domains —
 * a referrer that is not on the roster belongs in "other" rather than being
 * silently dropped, so growth in a new AI surface still shows up. */
p('## AI経由（ai-assistantチャネル＋AI参照ドメイン → app_store_click）');
p();
{
  let ai = null;
  try { ai = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/data/ga4/ai-channel.json'), 'utf8')); } catch { /* not transcribed yet */ }
  const ROSTER = [
    ['ai-assistant', 'AI Assistantチャネル（GA4定義）'],
    ['copilot', 'copilot.com 参照'],
    ['claude.ai', 'claude.ai 参照'],
    ['gemini', 'gemini.google.com 参照'],
    ['chatgpt', 'chatgpt.com 参照'],
    ['openai', 'openai.com 参照'],
    ['other', 'その他AI参照（発見次第rosterへ昇格）'],
  ];
  p(ai
    ? `_窓: ${ai.window ?? '未記載'} · 出典: GA4探索（手動転記）_`
    : '_値が未転記。GA4 → 探索 で「セッションのデフォルトチャネルグループ＝AI Assistant」と「セッションの参照元に copilot / claude.ai / gemini / chatgpt / openai を含む」の2軸を作り、セッション数と app_store_click を growth/data/ga4/ai-channel.json へ転記すると埋まる。_');
  p();
  p('| 経路 | セッション | app_store_click |');
  p('|---|---:|---:|');
  for (const [id, label] of ROSTER) {
    const r = ai?.rows?.find((x) => x.id === id);
    p(`| ${label} | ${r?.sessions ?? '—'} | ${r?.app_store_clicks ?? '—'} |`);
  }
  p();
  p('_参考ベースライン（GA4 30日 2026-07-21..08-20・v4 §2-5）: copilot 13・claude.ai 4・gemini 4・chatgpt 3・openai 6 ≒ 約30セッション/月、平均エンゲージ 75.9秒＝全チャネル最長。app_store_click の計測はこの表が初——「AI経由が何install生むか」はまだ誰も知らない。_');
}
p();

/* ── Ledger health ──────────────────────────────────────────────────── */
p('## Experiment ledger');
p();
p(`${total} experiment(s): ` + (Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none'));
p();

p('## Next actions');
p();
const actions = [];
if (due.length) {
  actions.push(`**P0** — record decisions for ${due.length} overdue experiment(s). Blocks all further work on those pages. Human time: ~15 min with a GSC snapshot loaded.`);
}
if (!snap) {
  actions.push('**P0** — ingest a GSC snapshot (`growth/GSC_OWNER_ACTION.md`). Every SEO section above is blank until this happens. Human time: ~5 min.');
}
if (snap && !snap.queryPages.length) {
  actions.push('**P1** — add a query×page export so cannibalisation detection can run (`GSC_OWNER_ACTION.md` step 3). Human time: ~3 min.');
}
if (!actions.length) actions.push('Nothing is overdue and data is current — pick the top paid-relevant opportunity above.');
actions.forEach((a, i) => p(`${i + 1}. ${a}`));
p();
p(`_Generated by \`growth/scripts/weekly-report.mjs\` · snapshots on file: ${listSnapshots().join(', ') || 'none'}_`);

const text = out.join('\n') + '\n';
console.log(text);

if (write) {
  const dir = path.join(ROOT, 'growth/reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${asOf}-weekly.md`);
  fs.writeFileSync(file, text);
  console.error(`written: growth/reports/${path.basename(file)}`);
}
