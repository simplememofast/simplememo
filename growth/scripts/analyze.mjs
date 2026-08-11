#!/usr/bin/env node
/**
 * The detectors that turn a snapshot into a ranked list of things to do.
 *
 *   node growth/scripts/analyze.mjs [--snapshot 2026-08-09] [--json] [--top 20]
 *   node growth/scripts/analyze.mjs --only clusters|conversational|opportunities|ctr-gap|unanswered|decay|cannibalisation
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
  curveFor, segmentOfPath, segmentOfQuery,
} from '../lib/gsc.mjs';
import { summarizeClusters, conversationalQueries } from '../lib/clusters.mjs';

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

/* Every expectation is drawn from the row's own language segment. Judging an
 * English page against the site curve — which Japanese traffic dominates — is
 * how two normally-performing English pages reached the top of this list. */
const segmentOf = (r) => (r.page ? segmentOfPath(r.page) : segmentOfQuery(r.query));
const curveOf = (r) => curveFor(snap.meta, segmentOf(r));

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
    const exp = expectedCtr(curveOf(r), r.position);
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
    const exp = expectedCtr(curveOf(r), r.position);
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
/** Days two snapshots share, as a fraction of the newer window. */
function windowOverlap(a, b) {
  if (!a?.meta.period_start || !b?.meta.period_start) return null;
  const d = (x) => new Date(`${x}T00:00:00Z`).getTime();
  const start = Math.max(d(a.meta.period_start), d(b.meta.period_start));
  const end = Math.min(d(a.meta.period_end), d(b.meta.period_end));
  const day = 86400000;
  const shared = Math.max(0, (end - start) / day + 1);
  const span = (d(b.meta.period_end) - d(b.meta.period_start)) / day + 1;
  return span > 0 ? shared / span : null;
}

/* Equal-length windows can still be uncomparable when they cover mostly the
 * same days: nearly every click is in both totals, so the difference is the few
 * days at the edges plus noise. The length check below catches 28d vs 90d; this
 * catches 28d vs 28d taken two days apart, which is what happened on
 * 2026-08-11 (26 of 28 days shared). Withheld rather than printed with a
 * caveat — caveats go unread, numbers do not. */
const MAX_DECAY_OVERLAP = 0.5;
const overlap = windowOverlap(prev, snap);

function decay() {
  if (!prev) return null;
  if (overlap != null && overlap > MAX_DECAY_OVERLAP) return { overlapping: { share: overlap } };
  // Clicks are counted over a window, so two snapshots are only comparable
  // when their windows are the same length. Every snapshot so far has been 28
  // days, which made the check look unnecessary — until the 3-month export
  // arrived with the generative-AI data attached. Ingesting that next to a
  // 28-day snapshot would show every page tripling, and the snapshot after it
  // would show the whole site collapsing, with no field anywhere saying why.
  const span = (s) => (s.meta.period_start && s.meta.period_end
    ? Math.round((Date.parse(s.meta.period_end) - Date.parse(s.meta.period_start)) / 86400000)
    : null);
  const [now, then] = [span(snap), span(prev)];
  if (now != null && then != null && Math.abs(now - then) > 3) {
    return { incomparable: { now_days: now, prev_days: then } };
  }
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

/* ── 5. Unanswered intent ────────────────────────────────────────────────
 * Ranked, shown, never clicked: clicks == 0, position ≤ 12, impressions ≥ 8.
 *
 * Deliberately separate from the CTR gap above. That one finds "clicked, but
 * fewer times than the position deserves", which has a dozen possible causes
 * (SERP features, brand recognition, snippet wording) and so rarely names its
 * own fix. Zero clicks at a workable position is the sharper signal: the page
 * is already in front of these searchers and not one of them read it as an
 * answer — nearly always because the words of the intent are simply not on the
 * page. That is a cheap, specific edit.
 *
 * The trap this detector has to avoid: at these positions most rows are small,
 * and a row that would only ever have earned one click tells you nothing by
 * earning none. The 2026-08-09 cycle was talked into exactly that mistake by
 * hand — "249 unclicked impressions in the Obsidian cluster" was really four
 * queries with a combined expectation of 1.3 clicks. So a row has to clear a
 * surprise bar, not an impression bar: with 3 expected clicks, coming back with
 * zero happens about 5% of the time by chance, which is worth a look. Ranking
 * by raw impressions instead puts the noisiest rows on top, which is how that
 * cycle ended up queueing edits to two pages that were performing normally. */
const UNANSWERED_MAX_POSITION = 12;
const UNANSWERED_MIN_IMPRESSIONS = 8;
const UNANSWERED_MIN_EXPECTED_CLICKS = 3;

function unanswered() {
  // Existing Page First: with the query×page table we can name the URL already
  // being shown, so the fix is a section on that page rather than a new page.
  // Without it the caller only learns that *something* is ranking.
  const landing = new Map();
  for (const r of snap.queryPages) {
    if (!r.query || !r.page) continue;
    if (!landing.has(r.query)) landing.set(r.query, []);
    landing.get(r.query).push(r);
  }

  const rows = [];
  for (const r of [...snap.queries, ...snap.pages]) {
    const key = r.query || r.page;
    if (!key || (r.clicks || 0) > 0) continue;
    if ((r.impressions || 0) < UNANSWERED_MIN_IMPRESSIONS) continue;
    if (r.position == null || r.position > UNANSWERED_MAX_POSITION) continue;
    const exp = expectedCtr(curveOf(r), r.position);
    const expectedClicks = r.impressions * (exp ?? 0);
    if (expectedClicks < UNANSWERED_MIN_EXPECTED_CLICKS) continue;
    rows.push({
      kind: r.query ? 'query' : 'page',
      key,
      impressions: r.impressions,
      position: r.position,
      expected_ctr: exp,
      expected_clicks: expectedClicks,
      relevance: r.page ? businessRelevance(r.page) : null,
      ranking_pages: (landing.get(r.query) || [])
        .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
        .map((h) => ({ page: h.page, impressions: h.impressions, position: h.position })),
    });
  }
  return rows.sort((a, b) => b.expected_clicks - a.expected_clicks).slice(0, top);
}

const result = {
  snapshot: snap.label,
  period: snap.meta.period_start ? `${snap.meta.period_start}..${snap.meta.period_end}` : null,
  compared_to: prev?.label ?? null,
  clusters: summarizeClusters(snap.queries),
  conversational: conversationalQueries(snap.queries).slice(0, top),
  opportunities: opportunities(),
  ctr_gap: ctrGap(),
  unanswered: unanswered(),
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

/* Printed first, and deliberately above the click-ranked detectors: those all
 * measure distance from an expected CTR, which presumes the query is one this
 * site could convert. For 61.5% of impressions it is not, and the clusters
 * table is what says so before anything below it gets read as a to-do. */
if (show('clusters')) {
  const { clusters, sides, site, conversational } = result.clusters;
  console.log('── Clusters (mutually exclusive; see growth/lib/clusters.mjs for the priority order)');
  console.log(`  ${'cluster'.padEnd(20)}${'side'.padEnd(11)}${'queries'.padStart(8)}${'clicks'.padStart(8)}${'imp'.padStart(9)}${'CTR'.padStart(8)}${'pos'.padStart(7)}${'imp%'.padStart(8)}${'clk%'.padStart(8)}`);
  for (const c of clusters) {
    const mark = c.side === 'win' ? '★' : c.side === 'commodity' ? '☆' : ' ';
    console.log(`  ${(mark + c.label).padEnd(20)}${c.side.padEnd(11)}${String(c.queries).padStart(8)}${String(c.clicks).padStart(8)}${String(c.impressions).padStart(9)}${pct(c.ctr).padStart(8)}${n1(c.position).padStart(7)}${pct(c.impressionShare).padStart(8)}${pct(c.clickShare).padStart(8)}`);
  }
  console.log(`  ${''.padEnd(20)}${''.padEnd(11)}${''.padStart(8)}${'──────'.padStart(8)}${'───────'.padStart(9)}`);
  for (const [key, mark, name] of [['win', '★', '勝ち筋'], ['commodity', '☆', 'コモディティ'], ['other', ' ', 'その他']]) {
    const s = sides[key];
    if (!s || !s.impressions) continue;
    console.log(`  ${(mark + name).padEnd(20)}${''.padEnd(11)}${String(s.queries).padStart(8)}${String(s.clicks).padStart(8)}${String(s.impressions).padStart(9)}${pct(s.ctr).padStart(8)}${n1(s.position).padStart(7)}${pct(s.impressionShare).padStart(8)}${pct(s.clickShare).padStart(8)}`);
  }
  const ratio = sides.commodity?.ctr ? (sides.win?.ctr ?? 0) / sides.commodity.ctr : null;
  console.log(`\n  Site CTR ${pct(site.ctr)} is the average of these${ratio ? `; ★ converts ${ratio.toFixed(1)}× ☆` : ''}.`);
  console.log('  Report the two sides, not the average — which side moved is the whole finding.\n');
}

/* Zero clicks here is the expected outcome, not a miss: these queries are
 * issued by a model composing an answer, and a model does not click. Ranking
 * and count are the only signals available, so they are what gets printed. */
if (show('conversational')) {
  const c = result.clusters.conversational;
  console.log('── Conversational queries (AI Mode fan-out fingerprint)');
  if (!result.conversational.length) console.log('   none detected\n');
  else {
    console.log(`  ${c.queries} queries · ${c.impressions} imp · ${c.clicks} clicks · avg pos ${n1(c.position)}`);
    for (const r of result.conversational) {
      console.log(`    pos ${n1(r.position).padStart(5)} · ${String(r.impressions).padStart(4)} imp · ${r.clicks} clk  ${r.query}`);
    }
    console.log('\n  Judge these on position and count, never on clicks.\n');
  }
}

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

if (show('unanswered')) {
  console.log(`── Unanswered intent (0 clicks where ≥ ${UNANSWERED_MIN_EXPECTED_CLICKS} were expected, pos ≤ ${UNANSWERED_MAX_POSITION})`);
  if (!result.unanswered.length) console.log('   none — no row is missing enough clicks to rule out chance\n');
  for (const r of result.unanswered) {
    console.log(`  −${n1(r.expected_clicks).padStart(4)} clicks  [${r.kind}] ${r.key}`);
    console.log(`               imp ${r.impressions} · pos ${n1(r.position)} · expected CTR ${pct(r.expected_ctr)} · got 0`);
    for (const p of r.ranking_pages) console.log(`               already ranking: ${p.page} (pos ${n1(p.position)}, ${p.impressions} imp)`);
  }
  if (result.unanswered.length && !snap.queryPages.length) {
    console.log('\n  Which page each query lands on needs the query×page export — growth/GSC_OWNER_ACTION.md step 3.');
  }
  console.log();
}

if (show('decay')) {
  console.log('── Decay (vs previous snapshot)');
  if (result.decay === null) console.log('   needs a second snapshot\n');
  else if (result.decay.overlapping) {
    console.log(`   withheld: ${prev.label} (${prev.meta.period_start}..${prev.meta.period_end}) and ${snap.label} (${snap.meta.period_start}..${snap.meta.period_end})`);
    console.log(`   share ${(result.decay.overlapping.share * 100).toFixed(0)}% of their days. Almost every click is in both`);
    console.log('   totals, so a difference here would be the window shift, not decay. Compare');
    console.log('   snapshots taken at least one full period apart.\n');
  } else if (result.decay.incomparable) {
    const { now_days, prev_days } = result.decay.incomparable;
    console.log(`   not comparable: this snapshot covers ${now_days} days, the previous one ${prev_days}.`);
    console.log('   Click counts scale with the window, so the difference would be the window, not decay.\n');
  } else if (!result.decay.length) console.log('   no page lost meaningful clicks\n');
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
