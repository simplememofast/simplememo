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
