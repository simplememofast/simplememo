// Temporary preparation-only public counter reconciliation. Remove before PR.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {score,loadContext} from '../autonomy-score.mjs';
const file='autopilot/index.html';
let html=fs.readFileSync(file,'utf8');
const current=score(loadContext());
assert(Number.isFinite(current.total));
function update(pattern, transform){
  const flags=pattern.flags.includes('g')?pattern.flags:pattern.flags+'g';
  const matches=Array.from(html.matchAll(new RegExp(pattern.source,flags)));
  assert.equal(matches.length,1,'Expected unique public counter '+pattern.source);
  html=html.replace(pattern,transform);
}
update(/(<span data-score-total>)[\d.]+(<\/span>)/,(_,a,b)=>a+current.total.toFixed(1)+b);
update(/(<span data-decision-date>)[\d-]+(<\/span>)/,(_,a,b)=>a+current.generated_jst+b);
for(const [id,c] of Object.entries(current.components)){
  assert(Number.isFinite(c.points));
  update(new RegExp('(<tr data-score="'+id+'"><td>[^<]+<\\/td><td class="num"><b>)[\\d.]+(<\\/b>)'),(_,a,b)=>a+c.points.toFixed(1)+b);
}
const stages={};
for(const r of JSON.parse(fs.readFileSync('data/autopilot-runs.json','utf8')).runs){
  if(r.outcome==='shipped'||!r.failure_stage)continue;
  stages[r.failure_stage]=(stages[r.failure_stage]||0)+1;
}
for(const stage of ['eligibility','execution','cost','absent']){
  assert(Number.isInteger(stages[stage]));
  update(new RegExp('(<tr data-stage="'+stage+'"><td>[^<]+<\\/td><td class="num"><b>)\\d+(<\\/b>)'),(_,a,b)=>a+stages[stage]+b);
}
assert.equal(current.components.vdc.n,24);assert.equal(current.components.vdc.hit,6);
assert.equal(current.components.ra.n,13);assert.equal(current.components.ra.detect.hit,0);assert.equal(current.components.ra.recover.hit,6);
assert.equal(current.components.ep.precision.judged,23);assert.equal(current.components.ep.precision.delegated_ai,18);
assert.equal(current.components.tuc.per_week,6);
fs.writeFileSync(file,html);
console.log(JSON.stringify({publicCounterDate:current.generated_jst,total:current.total,components:Object.fromEntries(Object.entries(current.components).map(([k,v])=>[k,v.points])),failureStages:stages}));
