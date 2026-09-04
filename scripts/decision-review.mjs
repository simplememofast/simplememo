#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { verifiedSettlement, feedback } from './value-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// These are conservative sampling limits, not permission to change company policy.
export const LIMITS = Object.freeze({ mature: 20, experimentEvery: 5, rankGap: .1, explorationRuns: 10, explorationSlots: 2 });
export function wilson(wins, n) {
  if (!n) return { low: 0, high: 1 };
  const z = 1.96, p = wins / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { low: center - spread, high: center + spread };
}
export function review(contracts, state = {}) {
  const settled = contracts.filter(verifiedSettlement).filter(c => !state.reviewed_ids?.includes(c.id));
  const window = settled.slice(-LIMITS.mature);
  const wins = window.filter(c => c.settlement.event === 1).length;
  const confidence = wilson(wins, window.length);
  const active = state.mandate && state.mandate.selections.length < LIMITS.explorationRuns;
  const mature = window.length >= LIMITS.mature;
  return { verdict: active ? 'exploring' : !mature ? 'immature' : confidence.high < .5 ? 'futile' : 'retain',
    n: window.length, direction_wins: wins, confidence, calibration: feedback(contracts),
    cohort: window.map(c => c.id),
    caveat: 'Wilson interval assumes independent outcomes. Overlapping operational windows are diagnostic, not evidence of causal value.' };
}
export function choose(candidates, state, decision) {
  // Only already admitted candidates enter ranking or exploration.
  const ranked = candidates.filter(c => c.eligible === true).sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  if (!ranked.length) return { selected: null, reason: 'no_eligible_candidate' };
  const active = state.mandate && state.mandate.selections.length < LIMITS.explorationRuns;
  const spent = state.mandate?.selections.filter(s => s.exploration).length ?? 0;
  if (active && spent < LIMITS.explorationSlots && ranked.length > 1) {
    return { selected: ranked.at(-1).id, reason: 'mandated_lower_rank', exploration: true };
  }
  const round = (state.selections?.length ?? 0) + 1;
  if (decision.n >= LIMITS.mature && round % LIMITS.experimentEvery === 0 && ranked.length > 1 && ranked[0].rank - ranked[1].rank <= LIMITS.rankGap) {
    return { selected: ranked[1].id, reason: 'close_runner_up', exploration: true };
  }
  return { selected: ranked[0].id, reason: 'ranked_first', exploration: false };
}
export function advance(state, result) {
  const next = structuredClone(state);
  if (result.verdict === 'futile' && (!next.mandate || next.mandate.selections.length >= LIMITS.explorationRuns)) {
    next.mandate = { cohort: result.cohort, selections: [] };
    next.reviewed_ids = [...new Set([...(next.reviewed_ids ?? []), ...result.cohort])];
  }
  return next;
}
export function recordSelection(state, id, selection) {
  const next = structuredClone(state);
  next.selections ??= [];
  if (next.selections.some(x => x.contract_id === id)) return next;
  const row = { contract_id: id, ...selection };
  next.selections.push(row);
  if (next.mandate && next.mandate.selections.length < LIMITS.explorationRuns) next.mandate.selections.push(row);
  return next;
}
function selftest() {
  assert.equal(review([]).verdict, 'immature');
  assert.equal(wilson(0, 20).high < .5, true);
  assert.equal(wilson(10, 20).high < .5, false);
  const candidates = [{ id: 'a', rank: 1, eligible: true }, { id: 'b', rank: .95, eligible: true }, { id: 'unsafe', rank: -1, eligible: false }];
  const state = { selections: [1, 2, 3, 4] };
  assert.equal(choose(candidates, state, { n: 20 }).selected, 'b');
  assert.equal(choose(candidates, state, { n: 0 }).selected, 'a');
  const mandate = advance({}, { verdict: 'futile', cohort: ['x'] });
  assert.equal(choose(candidates, mandate, { n: 20 }).selected, 'b');
  assert.equal(choose(candidates, mandate, { n: 20 }).reason, 'mandated_lower_rank');
  const one = recordSelection(mandate, 'c1', { selected: 'b', exploration: true });
  assert.equal(recordSelection(one, 'c1', {}).mandate.selections.length, 1);
  const two = recordSelection(one, 'c2', { selected: 'b', exploration: true });
  assert.equal(choose(candidates, two, { n: 20 }).reason, 'ranked_first');
  assert.equal(choose(candidates.map(c => ({ ...c, eligible: false })), {}, { n: 20 }).selected, null);
  console.log('decision-review: maturity, confidence, bounded exploration and idempotent spending passed');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const contracts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/value-contracts.json'))).contracts;
    const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/decision-review.json')));
    const result = review(contracts, state);
    if (process.argv.includes('--write')) fs.writeFileSync(path.join(ROOT, 'data/decision-review.json'), JSON.stringify({ ...advance(state, result), last_review: result }, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  }
}
