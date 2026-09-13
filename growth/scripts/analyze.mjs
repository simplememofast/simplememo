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

import {latestSnapshot, loadSnapshot, previousSnapshot, listSnapshots} from '../lib/gsc.mjs';
import {selectComparison} from '../lib/comparison.mjs';
import {analyzeSnapshot, UNANSWERED_MIN_EXPECTED_CLICKS, UNANSWERED_MAX_POSITION} from '../lib/analysis.mjs';

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
const prev = selectComparison(snap, listSnapshots().filter(label => label !== snap.label).map(loadSnapshot))
  || previousSnapshot(snap.label);

const result = analyzeSnapshot(snap, {previous: prev, top});
const comparison = result.comparison;
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1));

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const show = (name) => !only || only === name;

console.log(`GSC snapshot ${snap.label}${result.period ? ` (${result.period})` : ''}`);
console.log(`  ${snap.meta.totals.clicks} clicks · ${snap.meta.totals.impressions} impressions · CTR ${pct(snap.meta.totals.ctr)}`);
console.log(`  compared to: ${comparison.comparable ? prev.label : `(withheld: ${comparison.reason})`}\n`);

/* Topic shares describe visible query rows, not all site demand or installs. */
if (show('clusters')) {
  const { clusters, sides, site, conversational } = result.clusters;
  console.log(`── Query clusters (${result.clusters.classificationVersion}; mutually exclusive, available queries only)`);
  console.log(`  ${'cluster'.padEnd(20)}${'side'.padEnd(11)}${'queries'.padStart(8)}${'clicks'.padStart(8)}${'imp'.padStart(9)}${'CTR'.padStart(8)}${'pos'.padStart(7)}${'imp%'.padStart(8)}${'clk%'.padStart(8)}`);
  for (const c of clusters) {
    const mark = c.side === 'win' ? '★' : c.side === 'commodity' ? '☆' : ' ';
    console.log(`  ${(mark + c.label).padEnd(20)}${c.side.padEnd(11)}${String(c.queries).padStart(8)}${String(c.clicks).padStart(8)}${String(c.impressions).padStart(9)}${pct(c.ctr).padStart(8)}${n1(c.position).padStart(7)}${pct(c.impressionShare).padStart(8)}${pct(c.clickShare).padStart(8)}`);
  }
  console.log(`  ${''.padEnd(20)}${''.padEnd(11)}${''.padStart(8)}${'──────'.padStart(8)}${'───────'.padStart(9)}`);
  for (const [key, mark, name] of [['win', '★', '用途適合の仮説'], ['commodity', '☆', '一般・他社検索'], ['other', ' ', 'その他']]) {
    const s = sides[key];
    if (!s || !s.impressions) continue;
    console.log(`  ${(mark + name).padEnd(20)}${''.padEnd(11)}${String(s.queries).padStart(8)}${String(s.clicks).padStart(8)}${String(s.impressions).padStart(9)}${pct(s.ctr).padStart(8)}${n1(s.position).padStart(7)}${pct(s.impressionShare).padStart(8)}${pct(s.clickShare).padStart(8)}`);
  }
  const ratio = sides.commodity?.ctr ? (sides.win?.ctr ?? 0) / sides.commodity.ctr : null;
  console.log(`\n  Visible-query CTR ${pct(site.ctr)}${ratio ? `; ★/☆ search CTR ratio ${ratio.toFixed(1)}×` : ''}.`);
  console.log('  Shares exclude anonymized queries; topic fit is a hypothesis, not measured conversion.\n');
}

if (show('aio')) {
  console.log('── Google generative AI search visibility (WEB subset, impressions only)');
  if (!result.aio) console.log('  unavailable in this snapshot — import the separate AI UI export.\n');
  else {
    const ai = result.aio;
    console.log(`  ${ai.impressions ?? 'unknown'} impressions (${ai.aggregation || 'page'} aggregation); ${ai.pages} pages`);
    console.log(`  property AI / WEB: ${pct(ai.aggregation === 'property' ? ai.impression_share : null)}`);
    console.log('  No AI clicks/CTR available; page sums and property totals are separate.\n');
  }
}

/* Query phrasing alone does not establish an AI origin or click expectation. */
if (show('conversational')) {
  const c = result.clusters.conversational;
  console.log('── Natural-language queries (source unknown)');
  if (!result.conversational.length) console.log('   none detected\n');
  else {
    console.log(`  ${c.queries} queries · ${c.impressions} imp · ${c.clicks} clicks · avg pos ${n1(c.position)}`);
    for (const r of result.conversational) {
      console.log(`    pos ${n1(r.position).padStart(5)} · ${String(r.impressions).padStart(4)} imp · ${r.clicks} clk  ${r.query}`);
    }
    console.log('\n  Use the dedicated AI report for AI visibility; phrasing does not identify the source.\n');
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
  else if (result.decay.incomparable) {
    const c = result.decay.incomparable;
    console.log(`   withheld: ${c.reason} (current ${c.current_days ?? '?'} days; previous ${c.previous_days ?? '?'} days).`);
    console.log('   Use complete, equal-length, disjoint windows with the same aggregation.\n');
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
