// Canonical GSC detectors shared by the CLI and the existing Company owner.
import {expectedCtr, positionOpportunity, businessRelevance, curveFor, segmentOfPath, segmentOfQuery} from './gsc.mjs';
import {summarizeClusters, conversationalQueries} from './clusters.mjs';
import {assessComparison} from './comparison.mjs';

export const UNANSWERED_MIN_EXPECTED_CLICKS = 3;
export const UNANSWERED_MAX_POSITION = 12;

export function analyzeSnapshot(snap, {previous: prev = null, top = 20} = {}) {
/* Every expectation is drawn from the row's own language segment. Judging an
 * English page against the site curve — which Japanese traffic dominates — is
 * how two normally-performing English pages reached the top of this list. */
const segmentOf = (r) => (r.page ? segmentOfPath(r.page) : segmentOfQuery(r.query));
const curveOf = (r) => curveFor(snap.meta, segmentOf(r));

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
const comparison = assessComparison(snap, prev);

function decay() {
  if (!prev) return null;
  if (!comparison.comparable) return { incomparable: comparison };
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
const UNANSWERED_MIN_IMPRESSIONS = 8;

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

return {
  snapshot: snap.label,
  period: snap.meta.period_start ? `${snap.meta.period_start}..${snap.meta.period_end}` : null,
  compared_to: comparison.comparable ? prev?.label ?? null : null,
  comparison,
  aio: snap.meta.aio ?? null,
  clusters: summarizeClusters(snap.queries),
  conversational: conversationalQueries(snap.queries).slice(0, top),
  opportunities: opportunities(),
  ctr_gap: ctrGap(),
  unanswered: unanswered(),
  decay: decay(),
  cannibalisation: cannibalisation(),
};

}
