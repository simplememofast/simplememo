#!/usr/bin/env node
/**
 * The detectors that turn a snapshot into a ranked list of things to do.
 *
 *   node growth/scripts/analyze.mjs [--snapshot 2026-08-09] [--json] [--top 20]
 *   node growth/scripts/analyze.mjs --only opportunities|ctr-gap|decay|cannibalisation
 *
 * Every number printed here traces to a committed snapshot under
 * growth/data/gsc/. Nothing is typed in by hand, which is the point: the
 * previous cycle's figures lived in report prose and could not be recomputed,
 * so each analysis started over from a dashboard and the conclusions could not
 * be checked by anyone later.
 */

import {
  latestSnapshot, loadSnapshot, previousSnapshot, listSnapshots,
  expectedCtr, positionOpportunity, businessRelevance,
} from '../lib/gsc.mjs';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const asJson = argv.includes('--json');
const top = Number(flag('top', 20));
const only = flag('only');

const snapLabel = flag('snapshot');
const snap = snapLabel ? loadSnapshot(snapLabel) : latestSnapshot();
if (!snap) {
  console.error('No GSC snapshot ingested yet.\n\n  1. Follow growth/GSC_OWNER_ACTION.md (about 5 minutes)\n  2. node growth/scripts/ingest-gsc.mjs --label <YYYY-MM-DD>\n');
  process.exit(2);
}
const prev = previousSnapshot(snap.label);
const curve = snap.meta.ctr_curve;

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1));

/* ── 1. Opportunity score ────────────────────────────────────────────────
 * Impressions × PositionOpportunity × CTRGap × BusinessRelevance.
 *
 * BusinessRelevance is the term that keeps this list pointed at paid growth.
 * Without it the ranking is just "biggest impression pool wins", which is how
 * a low-intent cluster (people asking where a LINE feature lives) outranks the
 * cluster whose readers actually install something. */
function opportunities() {
  const rows = [];
  for (const r of snap.pages) {
    if (!r.page || !r.impressions) continue;
    const exp = expectedCtr(curve, r.position);
    const gap = Math.max(0, (exp ?? 0) - (r.ctr ?? 0));
    const rel = businessRelevance(r.page);
    const score = r.impressions * positionOpportunity(r.position) * gap * rel;
    if (score <= 0) continue;
    // Clicks the page would gain at the expected CTR for its current position.
    const upside = r.impressions * gap;
    rows.push({ page: r.page, impressions: r.impressions, clicks: r.clicks,
                ctr: r.ctr, expected_ctr: exp, position: r.position,
                relevance: rel, upside_clicks: upside, score });
  }
  return rows.sort((a, b) => b.score - a.score).slice(0, top);
}

/* ── 2. CTR gap ──────────────────────────────────────────────────────────
 * Ranking fine, not being clicked: imp >= 100, position <= 10, and actual CTR
 * below 70% of expected. These are title/description work, not content work —
 * the page already earned the placement. */
function ctrGap() {
  const rows = [];
  for (const r of [...snap.pages, ...snap.queries]) {
    const key = r.page || r.query;
    if (!key || !r.impressions || r.impressions < 100) continue;
    if (r.position == null || r.position > 10) continue;
    const exp = expectedCtr(curve, r.position);
    if (!exp || (r.ctr ?? 0) >= exp * 0.7) continue;
    rows.push({ kind: r.page ? 'page' : 'query', key,
                impressions: r.impressions, ctr: r.ctr, expected_ctr: exp,
                position: r.position, upside_clicks: r.impressions * (exp - (r.ctr ?? 0)) });
  }
  return rows.sort((a, b) => b.upside_clicks - a.upside_clicks).slice(0, top);
}

/* ── 3. Decay ────────────────────────────────────────────────────────────
 * Snapshot-over-snapshot loss, with the cause split out. "Clicks fell" is not
 * actionable; "clicks fell while impressions held and position held" (a CTR
 * loss, usually a SERP-feature change) points somewhere quite different from
 * "impressions fell too" (demand or indexing). */
function decay() {
  if (!prev) return null;
  const before = new Map(prev.pages.map((r) => [r.page, r]));
  const rows = [];
  for (const r of snap.pages) {
    const b = before.get(r.page);
    if (!b || !b.clicks) continue;
    const dClicks = (r.clicks || 0) - b.clicks;
    if (dClicks >= 0 || Math.abs(dClicks) < 3) continue;
    const dImp = (r.impressions || 0) - (b.impressions || 0);
    const dPos = (r.position ?? 0) - (b.position ?? 0);
    let cause;
    if (dPos > 1.5) cause = 'ranking loss';
    else if (dImp < -0.2 * (b.impressions || 1)) cause = 'demand or indexing loss';
    else if ((r.ctr ?? 0) < b.ctr * 0.8) cause = 'CTR loss (SERP change / snippet)';
    else cause = 'mixed';
    rows.push({ page: r.page, clicks_before: b.clicks, clicks_now: r.clicks || 0,
                delta_clicks: dClicks, delta_impressions: dImp, delta_position: dPos, cause });
  }
  return rows.sort((a, b) => a.delta_clicks - b.delta_clicks).slice(0, top);
}

/* ── 4. Cannibalisation ──────────────────────────────────────────────────
 * Needs the query×page table; the plain query and page exports cannot show
 * which URLs share a query. Two URLs on one query is normal; it becomes a
 * problem when both rank in the same band and neither converts the click. */
function cannibalisation() {
  if (!snap.queryPages.length) return null;
  const byQuery = new Map();
  for (const r of snap.queryPages) {
    if (!r.query || !r.page) continue;
    if (!byQuery.has(r.query)) byQuery.set(r.query, []);
    byQuery.get(r.query).push(r);
  }
  const rows = [];
  for (const [query, hits] of byQuery) {
    if (hits.length < 2) continue;
    const impressions = hits.reduce((s, h) => s + (h.impressions || 0), 0);
    if (impressions < 50) continue;
    rows.push({
      query, urls: hits.length, impressions,
      clicks: hits.reduce((s, h) => s + (h.clicks || 0), 0),
      pages: hits.sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
                 .map((h) => ({ page: h.page, impressions: h.impressions, clicks: h.clicks, position: h.position })),
    });
  }
  return rows.sort((a, b) => b.impressions - a.impressions).slice(0, top);
}

const result = {
  snapshot: snap.label,
  period: snap.meta.period_start ? `${snap.meta.period_start}..${snap.meta.period_end}` : null,
  compared_to: prev?.label ?? null,
  opportunities: opportunities(),
  ctr_gap: ctrGap(),
  decay: decay(),
  cannibalisation: cannibalisation(),
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const show = (name) => !only || only === name;

console.log(`GSC snapshot ${snap.label}${result.period ? ` (${result.period})` : ''}`);
console.log(`  ${snap.meta.totals.clicks} clicks · ${snap.meta.totals.impressions} impressions · CTR ${pct(snap.meta.totals.ctr)}`);
console.log(`  compared to: ${prev ? prev.label : '(no earlier snapshot — decay needs two)'}\n`);

if (show('opportunities')) {
  console.log('── Opportunities (impressions × position headroom × CTR gap × business relevance)');
  if (!result.opportunities.length) console.log('   nothing scored above zero\n');
  for (const r of result.opportunities) {
    console.log(`  ${String(Math.round(r.score)).padStart(6)}  ${r.page}`);
    console.log(`          imp ${r.impressions} · CTR ${pct(r.ctr)} vs expected ${pct(r.expected_ctr)} · pos ${n1(r.position)} · relevance ${r.relevance} · upside ≈ +${Math.round(r.upside_clicks)} clicks`);
  }
  console.log();
}

if (show('ctr-gap')) {
  console.log('── CTR gap (imp ≥ 100, pos ≤ 10, CTR below 70% of expected)');
  if (!result.ctr_gap.length) console.log('   none\n');
  for (const r of result.ctr_gap) {
    console.log(`  +${String(Math.round(r.upside_clicks)).padStart(4)} clicks  [${r.kind}] ${r.key}`);
    console.log(`               imp ${r.impressions} · CTR ${pct(r.ctr)} vs ${pct(r.expected_ctr)} · pos ${n1(r.position)}`);
  }
  console.log();
}

if (show('decay')) {
  console.log('── Decay (vs previous snapshot)');
  if (result.decay === null) console.log('   needs a second snapshot\n');
  else if (!result.decay.length) console.log('   no page lost meaningful clicks\n');
  else for (const r of result.decay) {
    console.log(`  ${String(r.delta_clicks).padStart(5)} clicks  ${r.page}`);
    console.log(`               ${r.clicks_before} → ${r.clicks_now} · Δimp ${r.delta_impressions} · Δpos ${n1(r.delta_position)} · likely: ${r.cause}`);
  }
  console.log();
}

if (show('cannibalisation')) {
  console.log('── Cannibalisation (one query, several URLs)');
  if (result.cannibalisation === null) console.log('   needs a query×page export — see growth/GSC_OWNER_ACTION.md step 3\n');
  else if (!result.cannibalisation.length) console.log('   none above the impression floor\n');
  else for (const r of result.cannibalisation) {
    console.log(`  "${r.query}" — ${r.urls} URLs · ${r.impressions} imp · ${r.clicks} clicks`);
    for (const p of r.pages) console.log(`               pos ${n1(p.position)}  ${p.page}  (${p.clicks}/${p.impressions})`);
  }
  console.log();
}

console.log(`Snapshots on file: ${listSnapshots().join(', ')}`);
